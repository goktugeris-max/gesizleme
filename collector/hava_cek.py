"""Santral konumları için Open-Meteo'dan aylık eğik yüzey ışınımı (GTI) ve sıcaklık çeker → data/hava.json.

Kaynak: Open-Meteo Historical Weather API (ERA5/ECMWF verisi), CC BY 4.0, ücretsiz kullanım yalnızca ticari olmayan amaçlar içindir
(belediye iç izlemesi). Anahtar gerekmez. Atıf panelde gösterilir.

- Her santral için aktivasyon yılından bu yana, tamamlanmış aylar. Daha önce çekilen aylar tekrar çekilmez (artımlı).
- Varsayım: yüzey eğimi 30°, yön güney (azimut 0). Santrale özel değer için data/santral_konumlari.json'a "egim" ve "yon" (0=güney, -90=doğu, 90=batı) yazılabilir.
- Aylık çıktı: gti = kWh/m² (eğik yüzey), sic = gündüz ortalama sıcaklık °C (ışınımı > 50 W/m² olan saatler).
- Ücretsiz API IP başına günlük/dakikalık sınır uygular; 429 gelirse bekler, günlük sınırda o ana kadarkini kaydedip çıkar (sonraki çalıştırma kaldığı yerden sürer).
Kullanım: python3 collector/hava_cek.py
"""
import json
import sys
import time
from datetime import date, timedelta

import requests

URL = "https://archive-api.open-meteo.com/v1/archive"
VARSAYILAN_EGIM, VARSAYILAN_YON = 30, 0
OUT = "data/hava.json"
GECIKME_GUN = 6   # ERA5 verisi birkaç gün gecikmeyle gelir


def yukle(yol, varsayilan):
    try:
        with open(yol, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return varsayilan


def eksik_aylar(mevcut, baslangic_yil, son_tam_ay):
    """(yıl, ay) çiftleri: aktivasyon yılından son tamamlanmış aya kadar, mevcutta olmayanlar."""
    liste = []
    y, a = baslangic_yil, 1
    while (y, a) <= son_tam_ay:
        if mevcut.get(str(y), {}).get("gti", [None] * 12)[a - 1] is None:
            liste.append((y, a))
        a += 1
        if a > 12:
            y, a = y + 1, 1
    return liste


class SystemExit_Gunluk(Exception):
    pass


def cek(lat, lon, bas, son, egim, yon):
    for deneme in range(4):
        r = requests.get(URL, params={
            "latitude": lat, "longitude": lon, "start_date": bas.isoformat(), "end_date": son.isoformat(),
            "hourly": "global_tilted_irradiance,temperature_2m", "tilt": egim, "azimuth": yon, "timezone": "Europe/Istanbul",
        }, timeout=120)
        if r.status_code == 200:
            return r.json()
        try:
            neden = r.json().get("reason", "")
        except ValueError:
            neden = r.text[:120]
        if r.status_code == 429:
            if "Daily" in neden or "Hourly" in neden:
                raise SystemExit_Gunluk(neden)   # saatlik/günlük sınır: beklemek yerine kaydedip çık, sonraki çalıştırma sürdürür
            print(f"  429 ({neden}); 65 sn beklenip yeniden denenecek", flush=True)
            time.sleep(65)
            continue
        raise RuntimeError(f"HTTP {r.status_code}: {neden}")
    raise RuntimeError("429: yeniden deneme hakkı bitti")


def aylara_topla(js):
    """Saatlik veriyi aylık toplama çevirir: {(yıl, ay): (gti_kwh_m2, gunduz_ort_sicaklik)}."""
    t, g, s = js["hourly"]["time"], js["hourly"]["global_tilted_irradiance"], js["hourly"]["temperature_2m"]
    toplam, sicak, sayac = {}, {}, {}
    for zaman, gi, si in zip(t, g, s):
        k = (int(zaman[0:4]), int(zaman[5:7]))
        toplam[k] = toplam.get(k, 0) + (gi or 0)
        if gi is not None and gi > 50 and si is not None:
            sicak[k] = sicak.get(k, 0) + si
            sayac[k] = sayac.get(k, 0) + 1
    return {k: (round(toplam[k] / 1000, 2), round(sicak[k] / sayac[k], 1) if sayac.get(k) else None) for k in toplam}


def kaydet(hava):
    hava["kaynak"] = "Open-Meteo.com (ERA5 / ECMWF), CC BY 4.0"
    hava["varsayim"] = {"egim": VARSAYILAN_EGIM, "yon": "güney (azimut 0)"}
    hava["guncelleme"] = date.today().isoformat()
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(hava, f, ensure_ascii=False, separators=(",", ":"))


def main():
    konum = yukle("data/santral_konumlari.json", {})
    perf = yukle("data/performans.json", {"santraller": []})
    hava = yukle(OUT, {})
    hava.setdefault("santraller", {})
    bugun = date.today() - timedelta(days=GECIKME_GUN)
    # son tamamlanmış ay: bugun ayın son günüyse o ay, değilse bir önceki ay
    ay_sonu = (bugun.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
    onceki = bugun.replace(day=1) - timedelta(days=1)
    son_tam = (bugun.year, bugun.month) if bugun >= ay_sonu else (onceki.year, onceki.month)
    # Görevler: (santral, yıl, aylar). Önce en yeni yıllar (panel hemen işe yarasın), sonra eskiler.
    gorevler = []
    for s in perf["santraller"]:
        k = konum.get(s["id"])
        if not k:
            continue
        akt = (s.get("aktivasyon") or "")[:4]
        yil0 = int(akt) if akt.isdigit() else min((int(y) for y in s.get("aylik", {})), default=2019)
        mevcut = hava["santraller"].setdefault(s["id"], {})
        eksik = eksik_aylar(mevcut, yil0, son_tam)
        for yil in sorted({y for y, _ in eksik}, reverse=True):
            gorevler.append((yil, s["id"], k, mevcut, [a for y, a in eksik if y == yil], eksik))
    gorevler.sort(key=lambda g: -g[0])
    yeni_ay, durdu = 0, None
    for yil, sid, k, mevcut, aylar, eksik in gorevler:
        egim, yon = k.get("egim", VARSAYILAN_EGIM), k.get("yon", VARSAYILAN_YON)
        bas = date(yil, min(aylar), 1)
        son = date(yil, 12, 31) if yil < son_tam[0] else (date(yil, son_tam[1], 28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
        print(f"{sid} {yil}: {bas} → {son}", flush=True)
        try:
            js = cek(k["lat"], k["lon"], bas, son, egim, yon)
        except SystemExit_Gunluk as e:
            durdu = str(e)
            break
        except Exception as e:  # tek santralin hatası diğerlerini durdurmasın
            print(f"  hata: {e}", flush=True)
            continue
        istenen = {(yy, aa) for yy, aa in eksik}
        for (y, a), (gti, sic) in aylara_topla(js).items():
            if (y, a) in istenen:
                d = mevcut.setdefault(str(y), {"gti": [None] * 12, "sic": [None] * 12})
                d["gti"][a - 1], d["sic"][a - 1] = gti, sic
                yeni_ay += 1
        kaydet(hava)                                   # iş yarıda kalsa bile o ana kadarki veri korunur
        time.sleep(max(1.5, (son - bas).days / 14 / 9))  # istek ağırlığına göre dakikalık sınırın altında kal
    kaydet(hava)
    print(f"{yeni_ay} yeni ay yazıldı.")
    if durdu:
        print("UYARI: günlük API sınırına ulaşıldı, kalan aylar sonraki çalıştırmada çekilecek:", durdu)
    return 0


if __name__ == "__main__":
    sys.exit(main())
