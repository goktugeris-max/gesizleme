#!/usr/bin/env python3
"""EPİAŞ "Yüzdesel Tüketim" Excel'inden (İzmir Aylık sayfası) data/izmir_epias.json üretir.

Kullanım: python3 collector/epias_to_json.py "<EPIAS_Yuzdesel_Tuketim_IZMIR.xlsx>"
Herkese açık EPİAŞ Şeffaflık Platformu verisidir (il toplamı, MWh); kuruma/aboneye ait bilgi içermez.
EPİAŞ oranı (%) aylar arası karşılaştırılamadığı için ALINMAZ; yalnız MWh değerleri yazılır.
"""
import json, sys, openpyxl

SUTUN = {3: "aydinlatma", 4: "mesken", 5: "sanayi", 6: "tarim", 7: "ticaret", 8: "diger", 9: "toplam"}

def main(yol):
    ws = openpyxl.load_workbook(yol, data_only=True)["İzmir Aylık"]
    veri, son = {}, None
    for r in ws.iter_rows(min_row=2, values_only=True):
        if not r[0] or not r[1]:
            continue
        yil, ay = int(r[1]), int(r[2])
        for i, ad in SUTUN.items():
            d = veri.setdefault(str(yil), {}).setdefault(ad, [None] * 12)
            d[ay - 1] = round(float(r[i]), 2) if r[i] is not None else None
        son = (yil, ay)
    cikti = {
        "kaynak": "EPİAŞ Şeffaflık Platformu — Yüzdesel Tüketim Bilgileri (İzmir, abone grubu bazında, MWh)",
        "olusturma": __import__("datetime").date.today().isoformat(),
        "son_donem": {"yil": son[0], "ay": son[1]},
        "gruplar": {"aydinlatma": "Aydınlatma", "mesken": "Mesken", "sanayi": "Sanayi", "tarim": "Tarımsal sulama", "ticaret": "Ticarethane", "diger": "Diğer"},
        "mwh": veri,
    }
    with open("data/izmir_epias.json", "w", encoding="utf-8") as f:
        json.dump(cikti, f, ensure_ascii=False, separators=(",", ":"))
    print("yazıldı:", len(veri), "yıl, son dönem", son)

if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
