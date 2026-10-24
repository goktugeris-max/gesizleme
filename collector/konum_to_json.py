"""GES konum tablosunu (GES_CBS.xlsx) data/santral_konumlari.json'a çevirir.

Kullanım: python3 collector/konum_to_json.py "<GES_CBS.xlsx>"
Yalnızca koordinat ve ilçe yazılır; adres, maliyet ve tasarruf tutarı bilerek yazılmaz (site herkese açık).
Excel satır numarası (A sütunu) → performans.json santral id eşlemesi aşağıdadır.
"""
import json
import re
import sys

import openpyxl

ID = {
    1: 'ekrem-akurgal', 2: 'selcuk-transfer', 3: 'seyrek-hayvan-hastanesi', 4: 'aliaga-itfaiye',
    5: 'bergama-mezbahasi', 6: 'uzundere-spor', 7: 'cigli-aile-danisma', 8: 'yesilyurt-kultur-merkezi',
    9: 'bornova-havuz', 10: 'cesme-itfaiye', 11: 'caybasi-itfaiye', 12: 'konak-tuneller',
    13: 'bergama-itfaiye', 14: 'seyrek-itfaiye', 15: 'buca-toros-itfaiye', 16: 'ornekkoy-sosyal-projeler',
    17: 'selcuk-itfaiye', 18: 'gumuldur-itfaiye', 19: 'bornova-kultur-merkezi', 20: 'aliaga-kultur-merkezi',
    21: 'akkaya-dges',
}
# Konumu GİZLİ tutulacak tesisler (hassas tesis): gerçek koordinat yazılmaz, ilçe merkezi (2 hane) + gizli=True yazılır, haritada işaretçi çizilmez
GIZLI = {'cigli-aile-danisma': (38.50, 27.07)}
# Adres sütunu boş/koordinat olan satırlar için ilçe elle
ILCE_ELLE = {21: 'Menderes'}


def main(yol):
    ws = openpyxl.load_workbook(yol, data_only=True).active
    cikti = {}
    for r in ws.iter_rows(min_row=2, values_only=True):
        no = r[0]
        if no not in ID:
            continue
        lat, lon = [float(x) for x in str(r[4]).split(',')]
        if not (36.9 < lat < 39.3 and 26.2 < lon < 27.6):
            sys.exit(f'{no}. satır İzmir dışında görünüyor: {lat}, {lon}')
        m = re.search(r'([^/,\s]+)\s*/\s*[İi]zmir', str(r[3]), re.I)
        ilce = ILCE_ELLE.get(no) or (m.group(1) if m else None)
        if ID[no] in GIZLI:
            cikti[ID[no]] = {'lat': GIZLI[ID[no]][0], 'lon': GIZLI[ID[no]][1], 'ilce': ilce, 'gizli': True}
            continue
        cikti[ID[no]] = {'lat': round(lat, 6), 'lon': round(lon, 6), 'ilce': ilce}
    with open('data/santral_konumlari.json', 'w', encoding='utf-8') as f:
        json.dump(cikti, f, ensure_ascii=False, indent=1)
    print(len(cikti), 'santral yazıldı')


if __name__ == '__main__':
    main(sys.argv[1])
