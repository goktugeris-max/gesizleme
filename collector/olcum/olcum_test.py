"""Okuyucu testleri: python3 olcum_test.py  (gerçek cihaz gerekmez; sahte analizör kullanılır)"""
import json
import os
import sys

from olcum_modbus import coz, kodla, bloklara_ayir, Istemci, profil_oku
from olcum_sim import Sunucu
from olcum_oku import Toplayici

K = os.path.dirname(os.path.abspath(__file__))
profil = json.load(open(os.path.join(K, 'profiller', 'entes_mpr.json'), encoding='utf-8'))


def kontrol(ad, kosul, ek=''):
    print(('OK   ' if kosul else 'HATA ') + ad + (' ' + str(ek) if ek else ''))
    if not kosul:
        sys.exit(1)


# 1) Üretici belgesindeki örnek: 00 00 08 EE → 2286 × 0,1 = 228,6 V
kontrol('belge örneği 228,6 V', abs(coz('uint32', [0x0000, 0x08EE]) * 0.1 - 228.6) < 1e-9)
# 2) Kodla/çöz gidiş-dönüş
for tip, v in [('uint16', 30), ('uint32', 2286), ('int32', -950), ('uint64', 12345678901234), ('float', 1234.5)]:
    kontrol('gidiş-dönüş ' + tip, abs(coz(tip, kodla(tip, v)) - v) < 1e-3)
# 3) Bloklama: hiçbir blok 100 kayıttan büyük olmasın, tüm kayıtlar bir bloğa girsin
bl = bloklara_ayir(profil['kayitlar'])
kontrol('blok boyutu ≤100', all(b['bitis'] - b['bas'] <= 100 for b in bl), [(b['bas'], b['bitis']) for b in bl])
kontrol('tüm kayıtlar bloklarda', sum(len(b['kayitlar']) for b in bl) == len(profil['kayitlar']))

# 4) Sahte analizörle uçtan uca
sim = Sunucu(profil, 0).baslat()
d = profil_oku(Istemci('127.0.0.1', sim.port), profil)
kontrol('50 kayıt okundu', len(d) == len(profil['kayitlar']), len(d))
kontrol('gerilim makul', 215 < d['v_l1'] < 245, d['v_l1'])
kontrol('frekans ~50', 49.9 < d['f'] < 50.1, d['f'])
kontrol('PF makul', 0.85 < d['pf_top'] < 1.0, d['pf_top'])
kontrol('güç = ΣP', abs(d['p_top'] - (d['p_l1'] + d['p_l2'] + d['p_l3'])) < 1, d['p_top'])
kontrol('enerji sayacı büyük', d['e_tuketim_wh'] > 1e9, d['e_tuketim_wh'])
sim.durdur()

# 5) Modelde olmayan kayıt: istisna → atlanır, kalanlar okunur
sim = Sunucu(profil, 0, ['v_l4', 'thd_i_l1', 'i_n']).baslat()
yok = set()
d = profil_oku(Istemci('127.0.0.1', sim.port), profil, yok)
kontrol('desteklenmeyen kümesi', yok == {'thd_i_l1', 'i_n'}, yok)  # v_l4 profilde yok
kontrol('kalanlar okundu', len(d) == len(profil['kayitlar']) - 2, len(d))
sim.durdur()

# 6) Toplayıcı turu: çevrimiçi + çevrimdışı nokta
sim = Sunucu(profil, 0).baslat()
ayar = {'noktalar': [
    {'kod': 'T-1', 'ad': 'ok', 'profil': 'entes_mpr', 'host': '127.0.0.1', 'port': sim.port},
    {'kod': 'T-2', 'ad': 'kapalı', 'profil': 'entes_mpr', 'host': '127.0.0.1', 'port': 1, 'zamanasimi': 0.3}]}
son, biten = Toplayici(ayar).tur()
dur = {s['nokta_kod']: s['durum'] for s in son}
kontrol('çevrimiçi/çevrimdışı', dur == {'T-1': 'cevrimici', 'T-2': 'cevrimdisi'}, dur)
kontrol('tüm satırların anahtarları aynı', len({tuple(sorted(s)) for s in son}) == 1)
sim.durdur()
# 7) Supabase yazımı (sahte PostgREST/GoTrue sunucusu)
import http.server, threading
alinan = []
PLAN_YANIT = []

class H(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        n = int(self.headers.get('Content-Length', 0))
        govde = json.loads(self.rfile.read(n))
        alinan.append((self.path, dict(self.headers), govde))
        yanit = json.dumps({'access_token': 'JETON', 'expires_in': 3600} if 'auth/v1' in self.path else {}).encode()
        self.send_response(200 if 'auth/v1' in self.path else 201)
        self.send_header('Content-Length', str(len(yanit)))
        self.end_headers()
        self.wfile.write(yanit)

    def do_GET(self):
        alinan.append((self.path, dict(self.headers), None))
        yanit = json.dumps(PLAN_YANIT).encode()
        self.send_response(200)
        self.send_header('Content-Length', str(len(yanit)))
        self.end_headers()
        self.wfile.write(yanit)

    def log_message(self, *a):
        pass

hs = http.server.HTTPServer(('127.0.0.1', 0), H)
threading.Thread(target=hs.serve_forever, daemon=True).start()
os.environ.update(SUPABASE_URL='http://127.0.0.1:%d' % hs.server_address[1], SUPABASE_ANON_KEY='ANON', OLCUM_EPOSTA='a@b.c', OLCUM_SIFRE='x')
from olcum_oku import Supabase
sim = Sunucu(profil, 0).baslat()
ayar = {'noktalar': [{'kod': 'T-1', 'ad': 'ok', 'tesis': 'T', 'profil': 'entes_mpr', 'host': '127.0.0.1', 'port': sim.port}]}
Toplayici(ayar, Supabase()).tur()
yollar = [a[0].split('?')[0] for a in alinan]
kontrol('giriş + nokta + son yazıldı', yollar == ['/auth/v1/token', '/rest/v1/olcum_nokta', '/rest/v1/olcum_son'], yollar)
kontrol('yazma isteği Bearer jetonlu', alinan[2][1].get('Authorization') == 'Bearer JETON')
kontrol('upsert çakışma anahtarı', 'on_conflict=nokta_kod' in alinan[2][0])
kontrol('son satırda deger var', alinan[2][2][0]['deger']['v_l1'] > 200)
sim.durdur()

# 8) --plan-db: nokta listesi/IP'ler panelden (olcum_plan); IP'si olmayan satır gelmez, değişiklik yeniden okunur
sim = Sunucu(profil, 0).baslat()
PLAN_YANIT[:] = [{'kod': 'P-1', 'ad': 'Plan noktası', 'tesis': 'aassm', 'profil': 'entes_mpr', 'host': '127.0.0.1', 'port': sim.port, 'birim': 1, 'iso_bolum': 'Ana bina', 'kat_mahal': None, 'pano': None}]
alinan.clear()
top = Toplayici(None, Supabase(), True)
son, biten = top.tur()
yollar = [a[0].split('?')[0] for a in alinan]
kontrol('plan okundu, nokta kaydedildi, son yazıldı', yollar == ['/auth/v1/token', '/rest/v1/olcum_plan', '/rest/v1/olcum_nokta', '/rest/v1/olcum_son'], yollar)
kontrol('plan sorgusu yalnız IP girilmiş + aktif', 'host=not.is.null' in alinan[1][0] and 'aktif=eq.true' in alinan[1][0])
kontrol('plan noktası okundu', [x['nokta_kod'] for x in son] == ['P-1'] and son[0]['durum'] == 'cevrimici', son)
nk = [a for a in alinan if a[0].startswith('/rest/v1/olcum_nokta')][0][2][0]
kontrol('nokta alanları (iso_bolum, enerji_turu, cihaz_tipi)', (nk['iso_bolum'], nk['enerji_turu'], nk['cihaz_tipi']) == ('Ana bina', 'elektrik', 'analizor'), nk)
# 5 dk dolmadan yeniden istenmez; dolunca ve IP değişince yeniden alınır, eski bağlantı atılır
alinan.clear(); top.tur()
kontrol('plan 5 dk içinde yeniden sorulmaz', not any('olcum_plan' in a[0] for a in alinan))
sim2 = Sunucu(profil, 0).baslat()
PLAN_YANIT[0]['port'] = sim2.port
top.plan_son = 0; alinan.clear(); son, _ = top.tur()
kontrol('IP/port değişimi alındı, nokta yeniden okundu', son[0]['durum'] == 'cevrimici' and any('olcum_nokta' in a[0] for a in alinan), [a[0] for a in alinan])
PLAN_YANIT[:] = []
top.plan_son = 0; son, _ = top.tur()
kontrol('IP kaldırılınca nokta okunmaz', son == [], son)
sim.durdur(); sim2.durdur()
print('Tüm testler geçti.')
