"""İzmir ilçe sınırlarını İzBB Açık Veri Portalı'ndan indirir, sadeleştirip data/izmir_ilceler.geojson'a yazar.

Kaynak: "İzmir Şehir Haritası" (ilceler.geojson), İzmir Büyükşehir Belediyesi Açık Veri Lisansı (CC BY 4.0).
Atıf harita ekranında gösterilir. Kullanım: python3 collector/ilce_sinir_to_json.py [ilceler.geojson]  (dosya verilmezse indirilir)
"""
import json
import sys
import urllib.request

URL = ('https://acikveri.bizizmir.com/dataset/9292e9ab-3832-45a7-99e6-b1c5c6e35264/resource/'
       'c4b1da96-c547-4cca-a9a7-4053d0fee54f/download/ilceler.geojson')
TOLERANS = 0.0004   # derece (~40 m): panel için yeterli, dosya küçük kalır


def _uzaklik(p, a, b):
    (x, y), (x1, y1), (x2, y2) = p, a, b
    dx, dy = x2 - x1, y2 - y1
    if dx == dy == 0:
        return ((x - x1) ** 2 + (y - y1) ** 2) ** 0.5
    t = max(0, min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
    return ((x - (x1 + t * dx)) ** 2 + (y - (y1 + t * dy)) ** 2) ** 0.5


def sadelestir(nokta, tol):
    """Douglas-Peucker (yinelemesiz)."""
    if len(nokta) < 5:
        return nokta
    tut = [False] * len(nokta)
    tut[0] = tut[-1] = True
    yigin = [(0, len(nokta) - 1)]
    while yigin:
        i, j = yigin.pop()
        en, k = 0, None
        for n in range(i + 1, j):
            d = _uzaklik(nokta[n], nokta[i], nokta[j])
            if d > en:
                en, k = d, n
        if k is not None and en > tol:
            tut[k] = True
            yigin += [(i, k), (k, j)]
    return [p for p, t in zip(nokta, tut) if t]


def halka(r):
    s = sadelestir([(x, y) for x, y in r], TOLERANS)
    return [[round(x, 4), round(y, 4)] for x, y in s] if len(s) >= 4 else None


def main():
    if len(sys.argv) > 1:
        veri = json.load(open(sys.argv[1], encoding='utf-8'))
    else:
        with urllib.request.urlopen(URL, timeout=120) as r:
            veri = json.load(r)
    ozellikler = []
    for f in veri['features']:
        g = f['geometry']
        poligonlar = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
        yeni = []
        for p in poligonlar:
            h = [halka(r) for r in p]
            if h[0]:                       # dış halka kayboluyorsa (çok küçük ada) at
                yeni.append([x for x in h if x])
        ozellikler.append({'type': 'Feature', 'properties': {'adi': f['properties']['adi']},
                           'geometry': {'type': 'MultiPolygon', 'coordinates': yeni}})
    with open('data/izmir_ilceler.geojson', 'w', encoding='utf-8') as f:
        json.dump({'type': 'FeatureCollection', 'features': ozellikler}, f, ensure_ascii=False, separators=(',', ':'))
    print(len(ozellikler), 'ilçe yazıldı')


if __name__ == '__main__':
    main()
