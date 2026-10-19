"""ISO 50001 enerji yönetimi verisinden data/iso50001.enc.json üretir (parolayla şifreli).

Kullanım:
    ELEKTRIK_PAROLA="parola" python collector/iso50001_to_json.py "<TSE GİDEN EVRAK klasörü>"

Klasörde şunlar aranır:
  FRM.06.07 Enerji Referans Çizgileri/<yıl>/<no>.EnRÇ ... .xlsx   (her enerji kullanımı için aylık takip ve referans çizgisi)
  PLN.06.01 Enerji Eylem Planı.xlsx                                (tesis bazında eylemler)

Depo herkese açık olduğu için düz metin YAZILMAZ; elektrik verisiyle aynı yöntemle (AES-256-GCM) şifrelenir.
Yatırım tutarları (TL) bilerek alınmaz. Excel dosyaları depoya konmaz.
"""
import datetime
import getpass
import glob
import json
import os
import re
import sys

import openpyxl

from elektrik_to_json import sifrele

OUT_PATH = os.environ.get("ISO_CIKTI") or os.path.join(os.path.dirname(__file__), "..", "data", "iso50001.enc.json")

TESISLER = {
    "aassm": "Ahmed Adnan Saygın Sanat Merkezi (AASSM)",
    "buz": "Buz Sporları Salonu",
    "buca": "Buca Sosyal Yaşam Kampüsü",
}

# dosya numarası -> (tesis, bölüm, enerji, birim)
SERILER = {
    1: ("aassm", "Ana bina", "Elektrik", "kWh"),
    2: ("aassm", "Ana bina", "Doğalgaz", "Sm³"),
    3: ("buz", "Buz Sporları Salonu", "Elektrik", "kWh"),
    4: ("buz", "Buz Sporları Salonu", "Doğalgaz", "Sm³"),
    5: ("buca", "Huzurevi", "Elektrik", "kWh"),
    6: ("buca", "Huzurevi", "Doğalgaz", "Sm³"),
    7: ("buca", "Aşevi", "Elektrik", "kWh"),
    8: ("buca", "Aşevi – Kazan", "Doğalgaz", "Sm³"),
    9: ("buca", "Aşevi – Mutfak (ocak)", "Doğalgaz", "Sm³"),
    10: ("buca", "Kapalı Spor Salonu", "Doğalgaz", "Sm³"),
    11: ("buca", "Soğutma Sistemi", "Elektrik", "kWh"),
}
EYLEM_SAYFALARI = {"Genel": "genel", "Buca Sosyal Yaşam Kampüsü": "buca", "Buz Sporları Salonu": "buz", "AASSM": "aassm"}
DEGISKEN_DISI = re.compile(r"hdd|cdd|etkinlik|yemek|sayı|sayi|çorba|corba|yaşlı|yasli|konaklayan", re.I)


def kucuk(s):
    return str(s).replace("İ", "i").replace("I", "ı").lower()


def sayi(x):
    if isinstance(x, bool) or x is None:
        return None
    if isinstance(x, (int, float)):
        return float(x)
    try:
        return float(str(x).strip().replace(",", "."))
    except ValueError:
        return None


def yuvarla(x, n=1):
    return None if x is None else round(x, n)


def metin(x):
    if x is None:
        return None
    if isinstance(x, (datetime.datetime, datetime.date)):
        return x.strftime("%Y-%m-%d")
    t = re.sub(r"\s+", " ", str(x)).strip()
    return None if t in ("", "_", "-", "***", "0") else t


def referans_dosyasi(yol, takip_yil):
    wb = openpyxl.load_workbook(yol, data_only=True, read_only=True)
    ws = wb[wb.sheetnames[0]]
    rows = list(ws.iter_rows(min_row=1, max_row=22, max_col=32, values_only=True))
    r5, r6 = rows[4], rows[5]
    ref = next((i for i, x in enumerate(r5) if x and i > 0 and ("referans çi" in kucuk(x) or "beklenen" in kucuk(x))), None)
    gerekce = next((i for i, x in enumerate(r5) if x and "gerekçe" in kucuk(x)), None)
    if ref is None:
        raise ValueError("referans sütunu bulunamadı: " + yol)
    adaylar = [i for i in range(1, ref) if r6[i] and str(r6[i]).strip().startswith(str(takip_yil)) and not DEGISKEN_DISI.search(str(r6[i]))]
    if not adaylar:
        raise ValueError("takip sütunu bulunamadı: " + yol)
    takip = max(adaylar)
    degiskenler = {}
    for i in range(takip + 1, ref):
        if r6[i]:
            ad = re.sub(r"\s+", " ", str(r6[i])).strip()
            degiskenler[ad] = [yuvarla(sayi(rows[6 + a][i]), 2) for a in range(12)]
    hedef = None
    for i, x in enumerate(rows[19]):
        if x and "hedef" in kucuk(x):
            hedef = sayi(rows[20][i])
    t, r, g = [], [], []
    for a in range(12):
        satir = rows[6 + a]
        v = sayi(satir[takip])
        t.append(None if v is None else round(v, 1))
        r.append(yuvarla(sayi(satir[ref])))
        g.append(metin(satir[gerekce]) if gerekce is not None else None)
    return {"takip": t, "referans": r, "gerekce": g, "degiskenler": degiskenler, "hedef": hedef, "_excel_toplam": sayi(rows[18][takip])}


def eylem_plani(yol):
    wb = openpyxl.load_workbook(yol, data_only=True, read_only=True)
    sonuc = {}
    for sayfa, tid in EYLEM_SAYFALARI.items():
        if sayfa not in wb.sheetnames:
            continue
        liste = []
        for r in list(wb[sayfa].iter_rows(min_row=5, max_col=16, values_only=True)):
            if r[0] is None or not metin(r[5]):
                continue
            liste.append({
                "no": metin(r[0]), "enerji": metin(r[1]), "kapsam": metin(r[2]), "planlama": metin(r[3]), "gerekce": metin(r[4]),
                "onlem": metin(r[5]), "termin": metin(r[7]), "sorumlu": metin(r[8]), "hedef": metin(r[9]),
                "geri_odeme": metin(r[11]), "gerceklesme_tarihi": metin(r[12]), "durum": metin(r[13]),
            })
        sonuc[tid] = liste
    return sonuc


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    kok = sys.argv[1]
    klasor = os.path.join(kok, "FRM.06.07 Enerji Referans Çizgileri")
    seriler = {}
    for yil in (2023, 2024):
        for yol in sorted(glob.glob(os.path.join(klasor, str(yil), "*.xlsx"))):
            ad = os.path.basename(yol)
            m = re.match(r"(\d+)\.", ad)
            if ad.startswith("~$") or not m or int(m.group(1)) not in SERILER:
                continue
            no = int(m.group(1))
            tesis, bolum, enerji, birim = SERILER[no]
            s = seriler.setdefault(no, {"id": f"{tesis}-{no}", "tesis": tesis, "bolum": bolum, "enerji": enerji, "birim": birim, "yillar": {}})
            s["yillar"][str(yil)] = referans_dosyasi(yol, yil)
            print(f"{yil} {ad}: ok")
    notlar = []
    for s in seriler.values():
        for yil, v in s["yillar"].items():
            excel = v.pop("_excel_toplam")
            ben = sum(x for x in v["takip"] if x is not None)
            if excel is None or abs(excel - ben) > 1:
                notlar.append({"seri": f"{s['tesis']} / {s['bolum']} / {s['enerji']}", "yil": yil, "excel_toplam": None if excel is None else round(excel), "aylik_toplam": round(ben),
                               "not": "Excel'deki toplam satırı aylık değerlerin toplamıyla uyuşmuyor (formül bir ayı dışarıda bırakıyor olabilir); aylık değerlerin toplamı kullanıldı."})
    eylem = eylem_plani(os.path.join(kok, "PLN.06.01 Enerji Eylem Planı.xlsx"))
    cikti = {
        "olusturma": datetime.date.today().isoformat(),
        "tesisler": [{"id": k, "ad": v} for k, v in TESISLER.items()],
        "seriler": [seriler[k] for k in sorted(seriler)],
        "eylem": eylem,
        "veri_notlari": notlar,
    }
    parola = os.environ.get("ELEKTRIK_PAROLA") or getpass.getpass("Parola: ")
    if len(parola) < 12:
        print("Parola en az 12 karakter olmalı.")
        return 1
    os.makedirs(os.path.dirname(os.path.abspath(OUT_PATH)), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(sifrele(cikti, parola), f, separators=(",", ":"))
    print(f"{len(seriler)} seri, eylem: { {k: len(v) for k, v in eylem.items()} } -> {os.path.abspath(OUT_PATH)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
