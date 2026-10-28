"""Enerji analizörü / süzme sayaç okuyucu (Modbus TCP → Supabase ya da yerel JSON).

Binada (ya da Türkiye'den çıkan sürekli açık bir makinede) çalışır; GitHub'dan çalışmaz çünkü cihazlara ulaşamaz.
Her tur: noktaları oku → `olcum_son`'a anlık değer yaz → 15 dakikalık özet penceresi dolunca `olcum_15dk`'ya satır ekle.

Kullanım:
  python3 olcum_oku.py --plan-db --surekli --aralik 60                           # sürekli; nokta listesi/IP'ler panelden (Supabase olcum_plan)
  python3 olcum_oku.py --ayar noktalar.yerel.json --surekli --aralik 60          # sürekli (Supabase'e), nokta listesi yerel dosyadan
  python3 olcum_oku.py --ayar noktalar.yerel.json --bir-tur --cikti son.json     # tek tur, dosyaya (deneme)
Supabase için ortam değişkenleri (depoya/günlüğe YAZILMAZ):
  SUPABASE_URL, SUPABASE_ANON_KEY, OLCUM_EPOSTA, OLCUM_SIFRE   (toplayıcı hesabı; rolü 'toplayici')
"""
import argparse
import datetime as dt
import json
import os
import sys
import time
import urllib.error
import urllib.request

from olcum_modbus import Istemci, ModbusHata, profil_oku

KLASOR = os.path.dirname(os.path.abspath(__file__))
PENCERE_DK = 15
PLAN_ARALIK_SN = 300   # --plan-db: panelden girilen IP/ayar değişiklikleri en geç 5 dakikada alınır


def profil_yukle(ad, onbellek={}):
    if ad not in onbellek:
        with open(os.path.join(KLASOR, 'profiller', ad + '.json'), encoding='utf-8') as f:
            onbellek[ad] = json.load(f)
    return onbellek[ad]


def simdi():
    return dt.datetime.now(dt.timezone.utc)


def pencere_basi(t, dk=PENCERE_DK):
    return t.replace(minute=(t.minute // dk) * dk, second=0, microsecond=0)


class Ozet:
    """Bir noktanın 15 dakikalık penceresi için ortalama/maksimum biriktirir."""

    def __init__(self, donem):
        self.donem, self.n = donem, 0
        self.top = {}
        self.maks = {}
        self.son = {}

    def ekle(self, d):
        self.n += 1
        for k in ('p_top', 'q_top', 'pf_top', 'v_l1', 'v_l2', 'v_l3', 'i_l1', 'i_l2', 'i_l3'):
            if k in d:
                self.top[k] = self.top.get(k, 0) + d[k]
        for k in ('p_top', 'i_l1', 'i_l2', 'i_l3', 'thd_i_l1', 'thd_i_l2', 'thd_i_l3', 'thd_v_l1', 'thd_v_l2', 'thd_v_l3', 'i_dengesizlik'):
            if k in d:
                self.maks[k] = max(self.maks.get(k, d[k]), d[k])
        for k in ('e_tuketim_wh', 'e_verilen_wh', 'e_reaktif_q1_varh', 'e_reaktif_q4_varh'):
            if k in d:
                self.son[k] = d[k]

    def satir(self, kod):
        ort = lambda k: round(self.top[k] / self.n, 3) if k in self.top else None
        v = [ort(k) for k in ('v_l1', 'v_l2', 'v_l3') if ort(k) is not None]
        i_ort = [ort(k) for k in ('i_l1', 'i_l2', 'i_l3') if ort(k) is not None]
        return {
            'nokta_kod': kod, 'donem': self.donem.isoformat(), 'olcum_sayisi': self.n,
            'ort_p_w': ort('p_top'), 'maks_p_w': self.maks.get('p_top'), 'ort_q_var': ort('q_top'), 'ort_pf': ort('pf_top'),
            'ort_v': round(sum(v) / len(v), 2) if v else None,
            'ort_i_a': round(sum(i_ort) / len(i_ort), 3) if i_ort else None,
            'maks_i_a': max([self.maks[k] for k in ('i_l1', 'i_l2', 'i_l3') if k in self.maks], default=None),
            'maks_thd_i': max([self.maks[k] for k in ('thd_i_l1', 'thd_i_l2', 'thd_i_l3') if k in self.maks], default=None),
            'maks_thd_v': max([self.maks[k] for k in ('thd_v_l1', 'thd_v_l2', 'thd_v_l3') if k in self.maks], default=None),
            'e_tuketim_wh': self.son.get('e_tuketim_wh'), 'e_verilen_wh': self.son.get('e_verilen_wh'),
            'e_reaktif_ind_varh': self.son.get('e_reaktif_q1_varh'), 'e_reaktif_kap_varh': self.son.get('e_reaktif_q4_varh'),
        }


class Supabase:
    def __init__(self):
        self.url = os.environ['SUPABASE_URL'].rstrip('/')
        self.anahtar = os.environ['SUPABASE_ANON_KEY']
        self.eposta, self.sifre = os.environ['OLCUM_EPOSTA'], os.environ['OLCUM_SIFRE']
        self.jeton, self.bitis = None, 0

    def _istek(self, yol, govde, ek=None, jeton=None):
        basliklar = {'apikey': self.anahtar, 'Content-Type': 'application/json'}
        if jeton:
            basliklar['Authorization'] = 'Bearer ' + jeton
        basliklar.update(ek or {})
        r = urllib.request.Request(self.url + yol, data=json.dumps(govde).encode(), headers=basliklar, method='POST')
        try:
            with urllib.request.urlopen(r, timeout=20) as y:
                ham = y.read()
                return json.loads(ham) if ham else None
        except urllib.error.HTTPError as e:
            raise RuntimeError('Supabase %s → HTTP %d' % (yol.split('?')[0], e.code))  # gövde yazılmaz (sır sızmasın)

    def _jeton(self):
        if self.jeton and time.time() < self.bitis - 120:
            return self.jeton
        y = self._istek('/auth/v1/token?grant_type=password', {'email': self.eposta, 'password': self.sifre})
        self.jeton, self.bitis = y['access_token'], time.time() + int(y.get('expires_in', 3600))
        return self.jeton

    def oku(self, yol):
        r = urllib.request.Request(self.url + yol, headers={'apikey': self.anahtar, 'Authorization': 'Bearer ' + self._jeton()})
        try:
            with urllib.request.urlopen(r, timeout=20) as y:
                return json.loads(y.read() or b'[]')
        except urllib.error.HTTPError as e:
            raise RuntimeError('Supabase %s → HTTP %d' % (yol.split('?')[0], e.code))

    def yaz(self, tablo, satirlar, cakisma=None):
        if not satirlar:
            return
        ek = {'Prefer': 'resolution=merge-duplicates,return=minimal'}
        yol = '/rest/v1/%s%s' % (tablo, '?on_conflict=' + cakisma if cakisma else '')
        self._istek(yol, satirlar, ek, self._jeton())


class Toplayici:
    def __init__(self, ayar, sb=None, plan_db=False):
        self.sabit = [n for n in (ayar or {}).get('noktalar', []) if n.get('host')]   # host'u boş nokta = cihazı henüz takılmamış; okunmaz
        self.noktalar = list(self.sabit)
        self.sb, self.plan_db, self.plan_son, self.plan_imza = sb, plan_db and sb is not None, 0, None
        self.istemciler, self.yok, self.ozet, self.hata_sayac = {}, {}, {}, {}
        self.son = {}
        self.kayitli = False

    def noktalari_kaydet(self):
        """Ayar dosyasındaki nokta adlarını olcum_nokta tablosuna yazar (panel adları buradan okur)."""
        self.sb.yaz('olcum_nokta', [{'kod': n['kod'], 'ad': n.get('ad'), 'tesis': n.get('tesis'),
                                     'cihaz_tipi': n.get('cihaz_tipi', 'analizor'), 'profil': n.get('profil'),
                                     'enerji_turu': n.get('enerji_turu', 'elektrik'), 'iso_bolum': n.get('iso_bolum'),
                                     'kat_mahal': n.get('kat_mahal'), 'pano': n.get('pano')} for n in self.noktalar], 'kod')
        self.kayitli = True

    def plani_yenile(self):
        """Panelde (olcum_plan) IP'si girilmiş noktaları alır; liste/ayar değiştiyse noktaları yeniden kaydeder ve bağlantıları yeniler."""
        self.plan_son = time.time()
        try:
            satirlar = self.sb.oku('/rest/v1/olcum_plan?select=kod,ad,tesis,profil,host,port,birim,iso_bolum,kat_mahal,pano&host=not.is.null&aktif=eq.true&order=kod')
        except (RuntimeError, OSError, ValueError) as e:
            print('Plan okunamadı (eski liste kullanılıyor):', e, file=sys.stderr)
            return
        db = {r['kod']: dict(r, cihaz_tipi='analizor', enerji_turu='elektrik') for r in satirlar if r.get('host')}
        db.update({n['kod']: n for n in self.sabit})   # yerel dosyadaki nokta aynı kodlu plan satırının yerine geçer
        yeni = sorted(db.values(), key=lambda n: n['kod'])
        imza = json.dumps(yeni, sort_keys=True)
        if imza == self.plan_imza:
            return
        for n in yeni:   # adresi/ayarı değişen noktanın eski bağlantısı atılır
            eski = next((o for o in self.noktalar if o['kod'] == n['kod']), None)
            if eski and (eski.get('host'), eski.get('port'), eski.get('birim')) != (n.get('host'), n.get('port'), n.get('birim')):
                self.istemciler.pop(n['kod'], None)
        self.noktalar, self.plan_imza, self.kayitli = yeni, imza, False
        print('Plan güncellendi: %d nokta okunacak.' % len(yeni), file=sys.stderr)

    def tur(self):
        if self.plan_db and time.time() - self.plan_son > PLAN_ARALIK_SN:
            self.plani_yenile()
        t = simdi()
        son_satirlar, biten = [], []
        for n in self.noktalar:
            kod = n['kod']
            try:
                ist = self.istemciler.setdefault(kod, Istemci(n['host'], n.get('port', 502), n.get('birim', 1), n.get('zamanasimi', 3.0)))
                d = profil_oku(ist, profil_yukle(n['profil']), self.yok.setdefault(kod, set()))
                self.hata_sayac[kod] = 0
                durum, deger = 'cevrimici', d
            except (ModbusHata, OSError) as e:
                self.hata_sayac[kod] = self.hata_sayac.get(kod, 0) + 1
                durum, deger = 'cevrimdisi', None
                print('[%s] %s okunamadı (%d. deneme): %s' % (t.strftime('%H:%M:%S'), kod, self.hata_sayac[kod], e), file=sys.stderr)
            satir = {'nokta_kod': kod, 'zaman': t.isoformat(), 'durum': durum}
            if deger is not None:
                self.son[kod] = deger
                donem = pencere_basi(t)
                o = self.ozet.get(kod)
                if o and o.donem != donem:
                    biten.append(o.satir(kod))
                    o = None
                if not o:
                    o = self.ozet[kod] = Ozet(donem)
                o.ekle(deger)
            satir['deger'] = self.son.get(kod)  # çevrimdışında son bilinen değer kalır (toplu yazımda tüm satırların anahtarları aynı olmalı)
            son_satirlar.append(satir)
        if self.sb:
            if not self.kayitli:
                self.noktalari_kaydet()
            self.sb.yaz('olcum_son', son_satirlar, 'nokta_kod')
            self.sb.yaz('olcum_15dk', biten, 'nokta_kod,donem')
        return son_satirlar, biten


def ana():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--ayar', help='noktalar JSON (örnek: noktalar.ornek.json)')
    ap.add_argument('--plan-db', action='store_true', help="nokta listesi ve IP'ler panelden (Supabase olcum_plan) okunur")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--bir-tur', action='store_true')
    g.add_argument('--surekli', action='store_true')
    ap.add_argument('--aralik', type=int, default=60, help='sürekli modda okuma aralığı (sn)')
    ap.add_argument('--cikti', help='son turun sonucunu bu JSON dosyasına yaz (Supabase yerine deneme için)')
    a = ap.parse_args()
    if not a.ayar and not a.plan_db:
        sys.exit('--ayar <dosya> ya da --plan-db verin.')
    ayar = {'noktalar': []}
    if a.ayar:
        with open(a.ayar, encoding='utf-8') as f:
            ayar = json.load(f)
    sb = Supabase() if (not a.cikti and os.environ.get('SUPABASE_URL')) else None
    if not a.cikti and not sb:
        sys.exit('Hedef yok: --cikti verin ya da SUPABASE_URL/SUPABASE_ANON_KEY/OLCUM_EPOSTA/OLCUM_SIFRE ortam değişkenlerini ayarlayın.')
    if a.plan_db and not sb:
        sys.exit('--plan-db için SUPABASE_URL/SUPABASE_ANON_KEY/OLCUM_EPOSTA/OLCUM_SIFRE ortam değişkenleri gerekir.')
    top = Toplayici(ayar, sb, a.plan_db)
    while True:
        try:
            son, biten = top.tur()
        except RuntimeError as e:  # Supabase'e yazılamadı: ağ/oturum geçici olabilir
            print('Yazma hatası:', e, file=sys.stderr)
            son, biten = [], []
        if a.cikti:
            with open(a.cikti, 'w', encoding='utf-8') as f:
                json.dump({'son': son, 'ozet15dk': biten}, f, ensure_ascii=False, indent=1)
        if a.bir_tur:
            return
        time.sleep(a.aralik)


if __name__ == '__main__':
    ana()
