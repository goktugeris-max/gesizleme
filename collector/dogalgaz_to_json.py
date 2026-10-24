#!/usr/bin/env python3
"""Kurumun doğalgaz tüketim çizelgesinden (İklim Değişikliği ve Sıfır Atık Dairesi Başkanlığı) ŞİFRELİ data/dogalgaz.enc.json üretir.

Kullanım:
  ELEKTRIK_PAROLA="..." python3 collector/dogalgaz_to_json.py "<Dogalgaz_Tuketim_Cizelgesi.xlsx>"   (parola Elektrik/ISO ile aynı, ≥12 karakter)
  python3 collector/dogalgaz_to_json.py "<xlsx>" --acik               (ŞİFRESİZ data/dogalgaz.json; HERKESE AÇIK depoda herkes görür)
  python3 collector/dogalgaz_to_json.py "<xlsx>" --kontrol            (şifrelemeden yalnızca okur, özet yazar; dosya üretmez)
  python3 collector/dogalgaz_to_json.py "<xlsx>" --duz <yol.json>     (TEST: düz metin JSON; depo DIŞINA yazın)

Excel düzeni: her yıl bir sayfa ("2022".."2026"); 5. satır başlık, 6. satırdan itibaren abone satırları;
sütunlar: No, Bina Adı, Hesap no, İlçe, Mahalle, Sokak, Dış kapı, İç kapı, sonra 12 ay × (m3, TL).
Yalnızca m3 alınır. Herkese açık depoya GİRMEZ (şifreli): hesap no, mahalle, sokak, kapı no ve TL tutarları YAZILMAZ.
Abone kimliği = hesap numarasının SHA-256 özetinin ilk 8 hanesi (yıllar arası eşleştirme için).
"""
import base64
import getpass
import hashlib
import json
import os
import re
import sys
from datetime import datetime

import openpyxl

OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "dogalgaz.enc.json")
PBKDF2_TUR = 600000
HASSAS = re.compile(r"sığınma|siginma|konukevi|kadın konuk|sığınak", re.I)   # hassas tesis adları herkese açık dosyada gizlenir
GENEL_AD = re.compile(r"^(T\.?C\.?\s*)?İZMİR\s*(B\.|BÜYÜK\s*)?\s*ŞEHİR\s*BEL(EDİYE(Sİ)?|\.)?(\s*BAŞKANLIĞI)?\.?$", re.I)


def sayi(x):
    if isinstance(x, (int, float)) and not isinstance(x, bool):
        return float(x)
    return None  # '-', boş, metin: veri yok


def temiz(s):
    return re.sub(r"\s+", " ", str(s or "")).strip()


def sifrele(veri, parola):
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

    salt, iv = os.urandom(16), os.urandom(12)
    anahtar = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=PBKDF2_TUR).derive(parola.encode("utf-8"))
    sifreli = AESGCM(anahtar).encrypt(iv, json.dumps(veri, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), None)
    b64 = lambda b: base64.b64encode(b).decode("ascii")
    return {"v": 1, "iter": PBKDF2_TUR, "salt": b64(salt), "iv": b64(iv), "data": b64(sifreli)}


def oku(yol):
    wb = openpyxl.load_workbook(yol, data_only=True)
    aboneler, m3, notlar = {}, {}, []
    for ws in wb.worksheets:
        if not ws.title.strip().isdigit():
            continue
        yil = ws.title.strip()
        m3[yil] = {}
        for r in ws.iter_rows(min_row=6, values_only=True):
            if not r or r[2] in (None, ""):
                continue
            hesap = str(r[2]).strip()
            kimlik = hashlib.sha256(("izbb-dg1|" + hesap).encode()).hexdigest()[:8]
            ad, ilce, ic = temiz(r[1]), temiz(r[3]), temiz(r[7])
            if HASSAS.search(ad):
                ad, ic = "Gizli tesis", ""
            ilce = ilce.replace("I", "ı").replace("İ", "i").lower().replace("i̇", "i").title() if ilce else ""
            aboneler[kimlik] = {"id": kimlik, "no": r[0], "ad": ad, "ilce": ilce, "ic": "" if ic == "-" else ic, "genel": bool(GENEL_AD.match(ad))}
            aylar = [sayi(r[8 + 2 * i]) if len(r) > 8 + 2 * i else None for i in range(12)]
            if kimlik in m3[yil]:
                notlar.append(f"{yil}: aynı hesap iki satırda (No {r[0]}); değerler toplandı")
                eski = m3[yil][kimlik]
                aylar = [None if a is None and b is None else (a or 0) + (b or 0) for a, b in zip(eski, aylar)]
            for i, v in enumerate(aylar):
                if v is not None and v < 0:
                    notlar.append(f"{yil}-{i + 1:02d}: negatif m3 ({v}) abone {kimlik} → 0 alındı")
                    aylar[i] = 0.0
            m3[yil][kimlik] = aylar
    yillar = sorted(m3)
    son_yil = yillar[-1]
    aktif = [k for k, v in m3[son_yil].items() if any(x for x in v if x)]
    son_ay = 0
    for i in range(12):
        dolu = sum(1 for k in aktif if m3[son_yil][k][i] is not None)
        if aktif and dolu >= 0.5 * len(aktif):
            son_ay = i + 1
    return {
        "olusturma": datetime.now().strftime("%Y-%m-%d"),
        "son_donem": {"yil": int(son_yil), "ay": son_ay},
        "yillar": [int(y) for y in yillar],
        "aboneler": sorted(aboneler.values(), key=lambda a: (a["no"] is None, a["no"])),
        "m3": m3,
        "veri_notlari": notlar,
    }


def ozet(c):
    print(f"{len(c['aboneler'])} abone, yıllar {c['yillar']}, son dönem {c['son_donem']['yil']}-{c['son_donem']['ay']:02d}, {sum(1 for a in c['aboneler'] if a['genel'])} abone genel (isimsiz) adlı")
    for y in c["yillar"]:
        d = c["m3"][str(y)]
        yt = sum(sum(v for v in s if v) for s in d.values())
        h1 = sum(sum(v for v in s[:6] if v) for s in d.values())
        print(f"  {y}: yıllık {yt:,.0f} m3 • ilk 6 ay {h1:,.0f} m3 • satır {len(d)}")
    for n in c["veri_notlari"][:20]:
        print("  NOT:", n)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        print(__doc__)
        return 1
    c = oku(args[0])
    ozet(c)
    if "--kontrol" in sys.argv:
        return 0
    if "--acik" in sys.argv:
        yol = os.path.join(os.path.dirname(OUT_PATH), "dogalgaz.json")
        with open(yol, "w", encoding="utf-8") as f:
            json.dump(c, f, ensure_ascii=False, separators=(",", ":"))
        print("ŞİFRESİZ yazıldı (herkese açık):", os.path.abspath(yol))
        return 0
    if "--duz" in sys.argv:
        yol = sys.argv[sys.argv.index("--duz") + 1]
        with open(yol, "w", encoding="utf-8") as f:
            json.dump(c, f, ensure_ascii=False, separators=(",", ":"))
        print("DÜZ METİN yazıldı (depoya EKLEMEYİN):", yol)
        return 0
    parola = os.environ.get("ELEKTRIK_PAROLA") or getpass.getpass("Doğalgaz verisi için parola (Elektrik/ISO ile aynı): ")
    if len(parola) < 12:
        print("Parola en az 12 karakter olmalı.")
        return 1
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(sifrele(c, parola), f, separators=(",", ":"))
    print("->", os.path.abspath(OUT_PATH))
    return 0


if __name__ == "__main__":
    sys.exit(main())
