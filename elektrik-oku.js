// Elektrik.xlsx ve Analiz Dosyası okuyucu (SheetJS gerekir). collector/elektrik_to_json.py ile ALAN ALAN AYNI hesap.
// Hem araclar/elektrik-yukle.html hem panelin Elektrik sekmesindeki "Excel'den geçici analiz" kullanır.
(function () {
  const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  // ---------- Excel okuma (collector/elektrik_to_json.py ile aynı hesap) ----------
  const sayi = (x) => {
    if (x == null || typeof x === 'boolean') return null;
    if (typeof x === 'number') return isFinite(x) ? x : null;
    const t = String(x).trim().replace(/,/g, '.');
    return t === '' || isNaN(+t) ? null : +t;
  };
  const yuvarla = (x, n = 1) => (x == null ? null : Math.round(x * 10 ** n) / 10 ** n);
  const yoksa = (v) => v == null || v === 0 || v === '0';
  // Sayfayı A1'den başlayan matrise çevirir (Excel'in boş sütunlarını/satırlarını koruyarak): satır i = Excel satırı i+1
  function matris(ws) {
    const r = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    r.s.r = 0; r.s.c = 0; ws['!ref'] = XLSX.utils.encode_range(r);
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
  }
  function sayfa(wb, ad) {
    if (!wb.Sheets[ad]) throw new Error(`"${ad}" sayfası bulunamadı. Doğru dosyayı (Elektrik.xlsx) seçtiniz mi?`);
    return matris(wb.Sheets[ad]);
  }

  function hamVeri(M) {
    const db = {}, tarife = {}, tedarikci = {}, dbTarife = {}, toplam = {}, aboneler = {};
    const yil12 = (o, k, y) => { o[k] = o[k] || {}; o[k][y] = o[k][y] || new Array(12).fill(0); return o[k][y]; };
    let sayac = 0;
    for (let i = 1; i < M.length; i++) {
      const r = M[i]; if (!r || r[1] == null) continue;
      const yil = sayi(r[2]), ay = sayi(r[3]), kwh = sayi(r[7]);
      if (yil == null || ay == null || kwh == null) continue;
      const y = Math.trunc(yil), a = Math.trunc(ay) - 1;
      const ad = yoksa(r[4]) ? 'Belirtilmemiş' : String(r[4]).trim(), t = yoksa(r[5]) ? 'Belirtilmemiş' : String(r[5]).trim(), s = yoksa(r[6]) ? 'Belirtilmemiş' : String(r[6]).trim();
      yil12(db, ad, y)[a] += kwh; yil12(tarife, t, y)[a] += kwh; yil12(tedarikci, s, y)[a] += kwh;
      dbTarife[ad] = dbTarife[ad] || {}; yil12(dbTarife[ad], t, y)[a] += kwh;
      toplam[y] = toplam[y] || new Array(12).fill(0); toplam[y][a] += kwh;
      (aboneler[y + '|' + (a + 1)] = aboneler[y + '|' + (a + 1)] || new Set()).add(String(r[1]));
      sayac++;
    }
    const aboneSayisi = {};
    Object.entries(aboneler).forEach(([k, kume]) => { const [y, ay] = k.split('|'); aboneSayisi[y] = aboneSayisi[y] || new Array(12).fill(null); aboneSayisi[y][+ay - 1] = kume.size; });
    return { db, tarife, tedarikci, dbTarife, toplam, aboneSayisi, sayac };
  }
  function yillikDurum(M) {
    const sonuc = {};
    for (let c = 1; c <= 8; c++) {
      const y = M[1] && M[1][c]; if (y == null || sayi(y) == null || sayi(y) < 2015 || sayi(y) > 2100) continue;
      sonuc[Math.trunc(sayi(y))] = Array.from({ length: 12 }, (_, a) => sayi((M[a + 2] || [])[c]));
    }
    return sonuc;
  }
  function genelAydinlatma(M) {
    const sonuc = {};
    M.forEach((r, i) => {
      const y = sayi(r && r[0]);
      if (y != null && y >= 2015 && y <= 2100 && r[1]) sonuc[String(Math.trunc(y))] = Array.from({ length: 12 }, (_, a) => (M[i + 2 + a] ? yuvarla(sayi(M[i + 2 + a][1])) : null));
    });
    return sonuc;
  }
  function sonucSayfasi(M) {
    const bloklar = {};
    let r = 1;
    while (r <= M.length) {
      const sat = M[r - 1] || [];
      const yil = sat[1];
      if (sayi(yil) != null && sayi(yil) >= 2015 && sayi(yil) <= 2100 && (sat[2] == null || sat[2] === '') && sat[3]) {
        const blok = { faturali: [], aydinlatma: [], mustecir: [], ges_net: [], fazla: [] };
        for (let a = 0; a < 12; a++) {
          const row = M[r + a] || [];   // Excel satırı r+1+a
          [['faturali', 3], ['aydinlatma', 4], ['mustecir', 5], ['ges_net', 6], ['fazla', 7]].forEach(([k, c]) => blok[k].push(sayi(row[c])));
        }
        bloklar[Math.trunc(sayi(yil))] = blok; r += 13;
      } else r += 1;
    }
    return bloklar;
  }
  function elektrikOku(wb) {
    const { db, tarife, tedarikci, dbTarife, toplam, aboneSayisi, sayac } = hamVeri(sayfa(wb, 'Veri'));
    const ga = genelAydinlatma(sayfa(wb, 'Genel Aydınlatma')), yd = yillikDurum(sayfa(wb, 'Yıllık Durum')), sn = sonucSayfasi(sayfa(wb, 'Sonuç'));
    const notlar = [];
    const yillar = Object.keys(yd).map(Number).sort((a, b) => a - b);
    if (!yillar.length) throw new Error('"Yıllık Durum" sayfasında yıllar bulunamadı.');
    const enSonYil = yillar[yillar.length - 1];
    let sonAy = 0; (yd[enSonYil] || []).forEach((v, i) => { if (v) sonAy = i + 1; });
    const aylik = {};
    yillar.forEach((yil) => {
      const fat = yd[yil], blok = sn[yil] || {};
      const yeni = { faturali: [], aydinlatma_pay: [], mustecir: [], ges_net: [], fazla: [], gercek: [] };
      for (let i = 0; i < 12; i++) {
        const bos = yil === enSonYil && i >= sonAy;
        const al = (k) => (bos ? null : (blok[k] || [])[i] == null ? null : blok[k][i]);
        const f = bos ? null : fat[i], e = al('aydinlatma'), m = al('mustecir'), g = al('ges_net'), h = al('fazla');
        const gercek = f != null && [e, m, g, h].every((v) => v != null) ? f + e - m - h + g : null;
        [['faturali', f], ['aydinlatma_pay', e], ['mustecir', m], ['ges_net', g], ['fazla', h], ['gercek', gercek]].forEach(([k, v]) => yeni[k].push(yuvarla(v)));
        const sf = (blok.faturali || [])[i];
        if (!bos && sf != null && f != null && Math.abs(sf - f) > 1) notlar.push({ yil, ay: AYLAR[i], sonuc_sayfasi: Math.round(sf), yillik_durum: Math.round(f), fark: Math.round(f - sf) });
      }
      aylik[String(yil)] = yeni;
    });
    const kisalt = (s) => Object.fromEntries(Object.keys(s).sort().map((ad) => [ad, Object.fromEntries(Object.keys(s[ad]).map(Number).sort((a, b) => a - b).map((y) => [String(y), s[ad][y].map((v) => yuvarla(v))]))]));
    Object.entries(toplam).forEach(([y, vals]) => vals.forEach((v, i) => {
      const ref = (yd[y] || [])[i];
      if (ref && Math.abs(v - ref) > 1) notlar.push({ yil: +y, ay: AYLAR[i], ham_veri_toplami: Math.round(v), yillik_durum: Math.round(ref), fark: Math.round(ref - v) });
    }));
    return {
      olusturma: new Date().toISOString().slice(0, 10), son_donem: { yil: enSonYil, ay: sonAy }, aylik,
      abone_sayisi: Object.fromEntries(Object.keys(aboneSayisi).sort().map((y) => [y, aboneSayisi[y]])),
      db: kisalt(db), tarife: kisalt(tarife), tedarikci: kisalt(tedarikci),
      db_tarife: Object.fromEntries(Object.keys(dbTarife).sort().map((ad) => [ad, kisalt(dbTarife[ad])])),
      genel_aydinlatma: ga, veri_notlari: notlar, _satir: sayac,
    };
  }

  // ---------- Analiz Dosyası: 16 gruplu tutarlı toplamlar (TL sayfası alınmaz) ----------
  const GRUP_AD = { 'DAİRE BAŞKANI (VETERİNER İŞLERİ HALK SAĞLIĞINDAN SORUMLU)': 'VETERİNER İŞLERİ DAİRESİ BAŞKANLIĞI' };
  function analizOku(wb) {
    const cikti = { kaynak: 'Ekip Analiz Dosyası (16 gruplu tutarlı gruplama)', gruplar: {}, yillik: {} };
    wb.SheetNames.forEach((ad) => {
      const m = ad.trim().match(/^Tüketim\s+(\d{4})$/);
      if (m) {
        const M = matris(wb.Sheets[ad]);
        let h = -1, c = -1;
        M.forEach((r, i) => { if (h < 0) (r || []).forEach((v, j) => { if (h < 0 && typeof v === 'string' && /Daire\s+Başkanlığı/i.test(v)) { h = i; c = j; } }); });
        if (h < 0) return;
        const g = {};
        for (let i = h + 1; i < M.length; i++) {
          const r = M[i]; const isim = r && r[c];
          if (!isim || typeof isim !== 'string' || /^TOPLAM/i.test(isim.trim())) continue;
          const aylik = Array.from({ length: 12 }, (_, a) => sayi(r[c + 2 + a]));
          g[GRUP_AD[isim.trim()] || isim.trim()] = { abone: sayi(r[c + 1]), aylik, toplam: aylik.reduce((t, v) => t + (v || 0), 0) };
        }
        cikti.gruplar[m[1]] = g;
      } else if (/^Yıllık Analiz\(/.test(ad.trim())) {
        const M = matris(wb.Sheets[ad]);
        M.forEach((r, i) => {
          const y = sayi(r && r[1]);
          if (y == null || y < 2015 || y > 2100 || typeof (M[i + 1] || [])[2] !== 'string') return;
          const blok = { ga_haric: [], ga_pay: [], mustecir: [], fazla: [], ges_net: [], gercek: [] };
          for (let a = 1; a <= 12; a++) {
            const s = M[i + a] || [];
            [['ga_haric', 3], ['ga_pay', 4], ['mustecir', 7], ['fazla', 9], ['ges_net', 10], ['gercek', 11]].forEach(([k, j]) => blok[k].push(yuvarla(sayi(s[j]))));
          }
          cikti.yillik[String(Math.trunc(y))] = blok;
        });
      }
    });
    if (!Object.keys(cikti.gruplar).length) throw new Error('Analiz Dosyası’nda "Tüketim 2024/2025" sayfaları bulunamadı.');
    return cikti;
  }

  window.ElkOku = { elektrikOku, analizOku };
})();
