"""İzmir SECAP (2025-2050) raporundan (Markdown'a çevrilmiş) referans verilerini data/secap_izmir.json'a çıkarır.

Kullanım: python3 collector/secap_izmir_to_json.py "<İzmir SECAP raporu.md>"
Çıkan: kent sera gazı envanteri (2018-2024, Tablo 10-11), hedefler/projeksiyon, ilçe iklim kırılganlık endeksi (Tablo 28),
SECAP eylem kataloğu (azaltım / uyum / enerji yoksulluğu: kod, ad, sektör, azaltım hedefi). Kaynak: İzmir Büyükşehir Belediyesi SECAP raporu
(yayın hakları İBB'ye aittir; panelde kaynak gösterilir). Eylem içerikleri (adımlar, KPI, izleme metni) ALINMAZ.
"""
import json
import re
import sys

AD_DUZELT = {
    'ES1.1': 'Kamu sektörü ve/veya sanayi yapılarının jeotermal ısıtma şebekelerine bağlanması konusunda fizibilite çalışmalarının yürütülmesi',
    'SW1.4': 'Güncel katı atık yönetim planından yola çıkarak atık ayrıştırma ile geri kazanım altyapısına ve kompost tesislerine yapılan yatırımların desteklenmesi ve hızlandırılması',
    'WCM1.10': 'Atıksu ve yağmur suyu hatlarının birbirinden ayrılmasını sağlamak için mevcut su altyapısının geliştirilmesi',
}


def sayi(s):
    s = re.sub(r'[^\d,.\-]', '', s.replace('**', ''))
    if not re.search(r'\d', s):
        return None
    return int(s.replace('.', '').replace(',', '')) if re.fullmatch(r'-?[\d.]+', s) else float(s.replace(',', '.'))


def satir_hucreleri(l):
    return [re.sub(r'<br>\s*', ' ', c).strip() for c in l.strip().strip('|').split('|')]


def main(yol):
    L = open(yol, encoding='utf-8').read().split('\n')
    bas = lambda p: next(i for i, l in enumerate(L) if l.startswith(p))
    y = list(range(2018, 2025))

    # --- Tablo 10 (sanayi ve havacılık hariç, 4 sektör)
    t10 = next(i for i, l in enumerate(L) if l.startswith('_Tablo 10'))
    sektorler = {}
    for l in L[t10:t10 + 14]:
        if l.startswith('|**') and 'Toplam' not in l and '2018' not in l:
            h = satir_hucreleri(l)
            if len(h) >= 8 and sayi(h[1]):
                sektorler[re.sub(r'\*', '', h[0]).strip()] = [sayi(x) for x in h[1:8]]
    if 'Tarım ve' in sektorler:
        sektorler['Tarım ve Hayvancılık'] = sektorler.pop('Tarım ve')
    toplam_dahil_degil = [sum(v[i] for v in sektorler.values()) for i in range(7)]

    # --- Tablo 11 (sanayi ve havacılık dahil, alt sektörler)
    t11 = next(i for i, l in enumerate(L) if l.startswith('_Tablo 11'))
    alt, grup = {}, None
    for l in L[t11:t11 + 60]:
        if not l.startswith('|'):
            continue
        h = satir_hucreleri(l)
        if len(h) < 8:
            continue
        ad = re.sub(r'[*_]', '', h[0]).strip()
        degerler = [sayi(x) for x in h[1:8]]
        if all(d is None for d in degerler):
            if ad and ad not in ('Sektörler', ''):
                grup = ad
            continue
        if ad.startswith('Toplam'):
            alt['__toplam'] = degerler
        elif ad and ad != 'Sektörler':
            alt[ad] = {'grup': grup, 'deger': degerler}

    # --- Tablo 28 ilçe kırılganlık
    t28 = next(i for i, l in enumerate(L) if l.startswith('_Tablo 28'))
    kirilgan = []
    for l in L[t28:t28 + 50]:
        h = satir_hucreleri(l)
        if len(h) >= 7 and h[-1] in ('Yüksek', 'Orta', 'Düşük'):
            kirilgan.append({'ilce': re.sub(r'[_*]', '', h[0]).strip(), 'endeks': float(h[-2]), 'grup': h[-1]})

    # --- Eylem kataloğu
    b71, b72, b73, b8 = bas('## 7.1'), bas('## 7.2'), bas('## 7.3'), bas('# 8 ')

    def eylemler(a, b):
        out, cur = [], None
        for i in range(a, b):
            l = L[i]
            m = re.match(r'\|Eylem Kodu\|(.*?)\|', l)
            if m:
                cur = {'kod': re.sub(r'<br>', '', m.group(1)).strip()}
                out.append(cur)
                continue
            if not cur:
                continue
            for k, p in (('ad', r'\|Eylem Adı\|(.*)\|'), ('sektor', r'\|Sektör\|(.*)\|'), ('azaltim', r'\|Azaltım Hedefi\|(.*)\|')):
                mm = re.match(p, l)
                if mm and k not in cur:
                    cur[k] = re.sub(r'\s+', ' ', re.sub(r'<br>', ' ', mm.group(1))).strip()
        for e in out:
            e['ad'] = AD_DUZELT.get(e['kod'], e.get('ad', ''))
            a = e.get('azaltim', '')
            m = re.search(r'([\d.]+)\s*tCO', a)
            e['azaltim_t'] = int(m.group(1).replace('.', '')) if m else None
            e['azaltim_not'] = re.sub(r'\s*tCO2e', '', a) if m and ':' in a else None
            e.pop('azaltim', None)
        return out

    veri = {
        'kaynak': 'İzmir Sürdürülebilir Enerji ve İklim Eylem Planı (SECAP 2025-2050), İzmir Büyükşehir Belediyesi / İstanbul Enerji A.Ş. / İzenerji A.Ş.',
        'baz_yil': 2018,
        'hedef': {'2030_azaltim_yuzde': 40, '2050_azaltim_yuzde': 80, 'not': 'Sanayi ve havacılık hariç kapsam; 2050 iklim nötr perspektifi'},
        'projeksiyon_t': {'bau': {'2030': 17026349, '2050': 20158435}, 'hedef': {'2030': 10215809, '2050': 4031687}},
        'yillar': y,
        'envanter_sanayisiz_t': sektorler,
        'envanter_toplam_sanayisiz_t': toplam_dahil_degil,
        'envanter_alt_t': alt,
        'kirilganlik': kirilgan,
        'eylemler': {'azaltim': eylemler(b71, b72), 'uyum': eylemler(b72, b73), 'enerji_yoksullugu': eylemler(b73, b8)},
    }
    with open('data/secap_izmir.json', 'w', encoding='utf-8') as f:
        json.dump(veri, f, ensure_ascii=False, separators=(',', ':'))
    print({k: (len(v) if hasattr(v, '__len__') else v) for k, v in veri.items() if k in ('envanter_sanayisiz_t', 'envanter_alt_t', 'kirilganlik')},
          {k: len(v) for k, v in veri['eylemler'].items()}, 'toplam 2018/2024 (sanayisiz):', toplam_dahil_degil[0], toplam_dahil_degil[-1])


if __name__ == '__main__':
    main(sys.argv[1])
