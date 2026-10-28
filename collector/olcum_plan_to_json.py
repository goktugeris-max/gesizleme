"""FRM.06.06 Enerji Ölçme ve İzleme formundan ölçüm planı üretir.

Çıktılar:
  data/olcum_plan.json                 ISO → Ölçüm sekmesindeki "Ölçüm planı" tablosu (ŞİFRESİZ)
  collector/olcum/noktalar.plan.json   okuyucu için nokta şablonu (adres boş; cihaz gelince doldurulur)

Sayaç/tesisat numaraları, kişi adları ve veri kayıt yeri BİLEREK alınmaz (depo herkese açık).
Kullanım: python3 collector/olcum_plan_to_json.py "<FRM.06.06 Enerji Ölçme ve İzleme.xlsx>" [sayfa=2026]
"""
import json
import os
import re
import sys

import openpyxl

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Formdaki bina adı → (tesis kimliği, ISO serisindeki bölüm adı; collector/iso50001_to_json.py SERILER ile aynı)
BINA = [
    ("aassm", ("aassm", "Ana bina")),
    ("buz sporları", ("buz", "Buz Sporları Salonu")),
    ("soğutma", ("buca", "Soğutma Sistemi")),
    ("huzurevi", ("buca", "Huzurevi")),
    ("aşevi", ("buca", "Aşevi")),
    ("eşrefpaşa", ("buca", "Eşrefpaşa Semt Polikliniği")),
    ("kapalı s", ("buca", "Kapalı Spor Salonu")),
]
KISA = {"aassm": "AASSM", "buz": "BUZ", "buca": "BUCA"}


def temiz(x):
    return re.sub(r"\s+", " ", str(x or "")).strip()


def ana(yol, sayfa):
    ws = openpyxl.load_workbook(yol, data_only=True)[sayfa]
    satirlar, bina = [], None
    for r in ws.iter_rows(min_row=6, values_only=True):
        no, b, kullanim, tur, birim, degisken, okuma = (temiz(x) for x in r[:7])
        if not no.isdigit():
            continue
        bina = b or bina
        ts = next((v for k, v in BINA if k in (bina or "").lower()), None)
        if not ts or not kullanim:
            raise SystemExit("Satır %s için bina/tesis eşleşmedi: %r" % (no, bina))
        elektrik = tur.lower().startswith("elektrik")
        satirlar.append({
            "no": int(no), "tesis": ts[0], "bolum": ts[1], "kullanim": kullanim, "tur": "elektrik" if elektrik else "dogalgaz",
            "birim": birim, "degisken": degisken, "okuma": "osos" if "osos" in okuma.lower() else "manuel",
            "okuma_ad": okuma, "periyot": "Ayda bir",
        })
    with open(os.path.join(KOK, "data", "olcum_plan.json"), "w", encoding="utf-8") as f:
        json.dump({"kaynak": "İBB-FRM-06-06 Enerji Ölçme ve İzleme (" + sayfa + ")", "satirlar": satirlar}, f, ensure_ascii=False, indent=1)
    sayac, noktalar = {}, []
    for s in satirlar:
        if s["tur"] != "elektrik":
            continue   # doğalgaz fatura/sayaç üzerinden elle okunur; analizör planı yalnız elektrik içindir
        sayac[s["tesis"]] = sayac.get(s["tesis"], 0) + 1
        noktalar.append({
            "kod": "%s-OEK-%02d" % (KISA[s["tesis"]], sayac[s["tesis"]]), "ad": s["bolum"] + " — " + s["kullanim"], "tesis": s["tesis"],
            "profil": "entes_mpr", "host": "", "port": 502, "birim": 1,
            "enerji_turu": "elektrik", "iso_bolum": s["bolum"], "kat_mahal": "", "pano": "",
        })
    with open(os.path.join(KOK, "collector", "olcum", "noktalar.plan.json"), "w", encoding="utf-8") as f:
        json.dump({"_not": "FRM.06.06'dan üretilen ŞABLON. 'host' (cihaz IP) boş olan noktalar okunmaz. Cihaz takılınca host, kat_mahal, pano, kod doldurulup "
                           "'noktalar.yerel.json' olarak kopyalanır (yerel dosya depoya konmaz).", "noktalar": noktalar}, f, ensure_ascii=False, indent=1)
    print("%d ÖEK satırı, %d elektrik noktası şablonu yazıldı." % (len(satirlar), len(noktalar)))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    ana(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "2026")
