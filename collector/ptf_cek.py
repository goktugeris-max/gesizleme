#!/usr/bin/env python3
"""EPİAŞ Şeffaflık Platformu'ndan Gün Öncesi Piyasası PTF (Piyasa Takas Fiyatı, TL/MWh) çeker → data/ptf.json.

Kimlik bilgileri YALNIZ ortam değişkenlerinden okunur (GitHub Secrets): EPIAS_USER, EPIAS_PASS. Günlüğe yazılmaz.
Akış: giris.epias.com.tr CAS'tan kısa ömürlü TGT bileti alınır → electricity-service API'sine `TGT` başlığıyla istek atılır.
Artımlıdır: dosya varsa son günden 3 gün geriden devam eder; yoksa 2019'dan başlayarak 30 günlük pencerelerle doldurur.
Çıktı: günlük ortalama (tüm geçmiş) + son 14 günün saatlik fiyatları (varsa yarınınki dahil).
"""
import json, os, sys, time, datetime as dt
import requests

CAS = "https://giris.epias.com.tr/cas/v1/tickets"
API = "https://seffaflik.epias.com.tr/electricity-service/v1/markets/dam/data/mcp"
CIKTI = "data/ptf.json"
SAAT_GUN = 14
BASLANGIC = dt.date(2019, 1, 1)
TZ = dt.timezone(dt.timedelta(hours=3))


def bilet():
    kul, par = os.environ.get("EPIAS_USER", ""), os.environ.get("EPIAS_PASS", "")
    if not kul or not par:
        sys.exit("EPIAS_USER / EPIAS_PASS Secrets tanımlı değil (Settings → Secrets and variables → Actions).")
    r = requests.post(CAS, data={"username": kul, "password": par},
                      headers={"Content-Type": "application/x-www-form-urlencoded", "Accept": "text/plain"}, timeout=30)
    if r.status_code not in (200, 201) or "TGT" not in r.text:
        sys.exit(f"EPİAŞ girişi reddedildi (HTTP {r.status_code}). Kullanıcı adı/parola ya da hesap izinlerini kontrol edin.")
    t = r.text.strip()
    return t[t.index("TGT"):].split()[0].strip('"<>')


def fiyatlar(tgt, bas, bit):
    """bas..bit (dahil) arası saatlik PTF: {'YYYY-MM-DD': {saat: fiyat}}"""
    govde = {"startDate": f"{bas.isoformat()}T00:00:00+03:00", "endDate": f"{bit.isoformat()}T00:00:00+03:00"}
    for deneme in range(4):
        r = requests.post(API, json=govde, headers={"TGT": tgt, "Content-Type": "application/json", "Accept": "application/json"}, timeout=60)
        if r.status_code == 200:
            break
        if r.status_code in (401, 403):
            sys.exit(f"EPİAŞ API yetki hatası (HTTP {r.status_code}); hesapta Şeffaflık API erişimi açık mı?")
        time.sleep((20 if r.status_code == 429 else 3) * (deneme + 1))   # 429 = istek sınırı: uzun bekle
    else:
        raise RuntimeError(f"EPİAŞ API yanıt vermedi (HTTP {r.status_code})")
    cikti = {}
    for it in (r.json().get("items") or []):
        fiyat = it.get("price", it.get("mcp"))
        tarih = str(it.get("date") or "")
        if fiyat is None or len(tarih) < 13:
            continue
        cikti.setdefault(tarih[:10], {})[int(tarih[11:13])] = float(fiyat)
    return cikti


def main():
    veri = {"gunluk": {}, "saatlik": {}}
    if os.path.exists(CIKTI):
        try:
            veri.update(json.load(open(CIKTI, encoding="utf-8")))
        except Exception:
            pass
    bugun = dt.datetime.now(TZ).date()
    bit = bugun + dt.timedelta(days=1)                      # yarının fiyatı ~13:00-14:00'te açıklanır
    bas = BASLANGIC
    yeni_esik = BASLANGIC                                   # bu günden sonrası her çalıştırmada yenilenir
    if veri["gunluk"]:
        yeni_esik = max(BASLANGIC, dt.date.fromisoformat(max(veri["gunluk"])) - dt.timedelta(days=3))
    tgt = bilet()
    sayac = 0
    gun = bas
    while gun <= bit:
        pencere_bit = min(bit, gun + dt.timedelta(days=29))
        # Dolu ve eski bir pencereyi yeniden çekme; eksik gün içeren pencereleri (önceki başarısız istekler) tamamla
        gunler = [(gun + dt.timedelta(days=i)).isoformat() for i in range((pencere_bit - gun).days + 1)]
        if pencere_bit < yeni_esik and all(g in veri["gunluk"] for g in gunler):
            gun = pencere_bit + dt.timedelta(days=1)
            continue
        time.sleep(1)
        try:
            gelen = fiyatlar(tgt, gun, pencere_bit)
        except Exception as e:
            print("uyarı:", e)
            gelen = {}
        for g, saatler in gelen.items():
            if len(saatler) >= 20:                           # eksik/kısmi günleri yazma
                veri["gunluk"][g] = round(sum(saatler.values()) / len(saatler), 2)
                if g >= (bugun - dt.timedelta(days=SAAT_GUN)).isoformat():
                    veri["saatlik"][g] = [saatler.get(h) for h in range(24)]
                sayac += 1
        gun = pencere_bit + dt.timedelta(days=1)
    esik = (bugun - dt.timedelta(days=SAAT_GUN)).isoformat()
    veri["saatlik"] = {g: v for g, v in veri["saatlik"].items() if g >= esik}
    veri["gunluk"] = dict(sorted(veri["gunluk"].items()))
    veri["guncelleme"] = dt.datetime.now(TZ).strftime("%Y-%m-%d %H:%M")
    veri["birim"] = "TL/MWh"
    veri["kaynak"] = "EPİAŞ Şeffaflık Platformu — Gün Öncesi Piyasası, Piyasa Takas Fiyatı (PTF)"
    with open(CIKTI, "w", encoding="utf-8") as f:
        json.dump(veri, f, ensure_ascii=False, separators=(",", ":"))
    print(f"PTF güncellendi: {sayac} gün işlendi, toplam {len(veri['gunluk'])} gün, son gün {max(veri['gunluk']) if veri['gunluk'] else '-'}")
    if not sayac:
        sys.exit("Hiç gün alınamadı (API biçimi ya da erişim sorunu olabilir).")


if __name__ == "__main__":
    main()
