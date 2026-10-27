/* ISO 50001 tesisleri için dijital ikiz ve yatırım senaryoları (ISO sekmesinde, şifreli verinin içinde çalışır).
 *
 * İkiz = tesisin son tam yıl aylık elektrik (kWh) ve doğalgaz (Sm³) tüketim profili + binaları; senaryo = açılıp kapanan yatırım kaldıraçları.
 * Sıra: yalıtım → kazan/kaskad → ısı pompası → bina otomasyonu → LED → soğutma verimi (çarpımsal), en son çatı GES (aylık mahsuplaşma: min(GES, kalan talep)).
 * Çatı GES verimi: panelin kendi 21 santralinin (2023-2025) gerçek aylık kWh/kWp değerlerinden. Tasarruf oranları TİPİK DEĞER VARSAYIMIDIR (ISO planında ölçülmüş değer varsa onu girin).
 * TL (fiyat, yatırım) YALNIZCA tarayıcıda hesaplanır/saklanır (localStorage `iso_ikiz_v1`); siteye ve depoya yazılmaz.
 * iso.js `Ikiz.ciz({D, tesis, eylemler, acik})` çağırır. esc() (index.html) ve Karbon.faktorler() (karbon.js) kullanılır.
 */
(function () {
  const ANAHTAR = 'iso_ikiz_v3';   // v3: Buca 1.034 kWe (etüt/kullanıcı teyidi, 5 birim + 299 kW diğer), Buz Sporları 990 kWe varsayılanları
  const AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const GES_BIRIM = {
    // Buca kampüsü toplam 1.034 kWe (etüt raporu ile kullanıcı teyidi, 27.10.2026); performans.json "planlanan" 735 kW'ı (Huzurevi, Aşevi, Kapalı Spor, Geriatri, İdari/Teknik) + 299 kW diğer çatılar; Buz Sporları 990 kWe (kullanıcı bilgisi)
    buca: [{ ad: 'Huzurevi', kw: 120 }, { ad: 'Aşevi', kw: 225 }, { ad: 'Kapalı Spor Salonu', kw: 240 }, { ad: 'Geriatri Merkezi', kw: 100 }, { ad: 'İdari ve Teknik Bina', kw: 50 }, { ad: 'Diğer çatılar', kw: 299 }],
    buz: [{ ad: 'Buz Sporları Salonu', kw: 990 }],
    aassm: [{ ad: 'Ana bina', kw: 0 }],
  };
  const grafik = {};
  let ctx = null, kayitlar = {}, etutHazir = false;
  try { kayitlar = JSON.parse(localStorage.getItem(ANAHTAR) || '{}') || {}; } catch (e) { kayitlar = {}; }
  const sakla = () => { try { localStorage.setItem(ANAHTAR, JSON.stringify(kayitlar)); } catch (e) { /* özel pencere */ } };

  const esc2 = (s) => (typeof esc === 'function' ? esc(s) : String(s ?? ''));
  const tr0 = (n) => (n == null || isNaN(n) ? '—' : Math.round(n).toLocaleString('tr-TR'));
  const tr1 = (n) => (n == null || isNaN(n) ? '—' : n.toLocaleString('tr-TR', { maximumFractionDigits: 1, minimumFractionDigits: 1 }));
  const topla = (a) => (a || []).reduce((t, v) => t + (v || 0), 0);
  const sayi = (v) => { if (v === '' || v == null) return null; const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; };

  function varsayilan(t) {
    const ges = (GES_BIRIM[t] || []).map((b) => Object.assign({}, b));
    return {
      fiyat: { elek: null, gaz: null },
      ges: { on: topla(ges.map((g) => g.kw)) > 0, birimler: ges, tl_kw: null },
      kabuk: { on: false, tas: 8, tl: null },
      kazan: { on: false, tas: 10, tl: null },
      pompa: { on: false, tas: 30, cop: 3.2, tl: null },
      bms: { on: false, tas: 5, tl: null },
      led: { on: false, pay: 20, tas: 50, tl: null },
      sogutma: { on: false, pay: 25, tas: 15, tl: null },
    };
  }
  function durum() {
    if (!kayitlar[ctx.tesis]) kayitlar[ctx.tesis] = varsayilan(ctx.tesis);
    const d = kayitlar[ctx.tesis], v = varsayilan(ctx.tesis);
    Object.keys(v).forEach((k) => { if (!d[k]) d[k] = v[k]; });
    return d;
  }

  // ---------- taban (son tam yıl) ----------
  function taban() {
    const seriler = ctx.D.seriler.filter((s) => s.tesis === ctx.tesis);
    const yillar = [...new Set(seriler.flatMap((s) => Object.keys(s.yillar)))].sort().reverse();
    const tam = (y, birim) => seriler.filter((s) => s.birim === birim && s.yillar[y]).every((s) => s.yillar[y].takip.filter((x) => x != null).length === 12);
    const yil = yillar.find((y) => tam(y, 'kWh') && tam(y, 'Sm³')) || yillar[0];
    const dizi = (birim) => { const a = Array(12).fill(0); seriler.filter((s) => s.birim === birim && s.yillar[yil]).forEach((s) => s.yillar[yil].takip.forEach((v, i) => { a[i] += v || 0; })); return a; };
    // binalar: bölüm adının "–" öncesi
    const binalar = {};
    seriler.filter((s) => s.yillar[yil]).forEach((s) => {
      const ad = s.bolum.split(' –')[0].trim(), b = (binalar[ad] = binalar[ad] || { ad, kwh: 0, sm3: 0 });
      const t = topla(s.yillar[yil].takip); if (s.birim === 'kWh') b.kwh += t; else b.sm3 += t;
    });
    return { yil, E: dizi('kWh'), G: dizi('Sm³'), binalar: Object.values(binalar), tamYil: tam(yil, 'kWh') && tam(yil, 'Sm³') };
  }

  // ---------- GES verimi: panelin gerçek santralleri ----------
  function gesVerim() {
    const v = window.Dash && Dash.veri(), PERF = v && v.PERF;
    if (PERF) {
      const pay = Array(12).fill(0); let kw = 0, n = 0;
      PERF.santraller.forEach((s) => {
        if (!s.kw || (s.aktivasyon || '9999') >= '2023') return;     // 2023 öncesi devreye girmiş santraller
        ['2023', '2024', '2025'].forEach((y) => {
          const a = s.aylik[y] || [];
          if (a.length === 12 && a.every((x) => x > 0)) { a.forEach((x, i) => { pay[i] += x; }); kw += s.kw; n++; }
        });
      });
      if (kw) return { aylik: pay.map((x) => x / kw), yillik: topla(pay) / kw, kaynak: `panelin ${n} santral-yıl gerçek üretimi (2023–2025)` };
    }
    // yedek: tipik İzmir dağılımı (toplam ~1.500 kWh/kW·yıl)
    const sekil = [0.045, 0.058, 0.085, 0.105, 0.125, 0.14, 0.145, 0.133, 0.105, 0.075, 0.048, 0.036];
    return { aylik: sekil.map((x) => x * 1500), yillik: 1500, kaynak: 'tipik İzmir dağılımı (panel verisi yok)' };
  }

  // ---------- senaryo hesabı ----------
  function hesapla(T, d, F, V) {
    let E = T.E.slice(), G = T.G.slice();
    const sonuc = [], co2E = (kwh) => (kwh * F.ef_elek) / 1000, co2G = (sm3) => (sm3 * F.dg_kwh_sm3 * F.ef_dg) / 1000;
    const ekle = (ad, anahtar, dE, dG, extra) => {
      const co2 = co2E(dE) + co2G(dG), tl = (d.fiyat.elek != null ? dE * d.fiyat.elek : 0) + (d.fiyat.gaz != null ? dG * d.fiyat.gaz : 0);
      sonuc.push(Object.assign({ ad, anahtar, dE, dG, co2, tl: (d.fiyat.elek != null || d.fiyat.gaz != null) ? tl : null }, extra || {}));
    };
    const carp = (arr, oran) => arr.map((x) => x * (1 - oran));
    if (d.kabuk.on) { const y = carp(G, d.kabuk.tas / 100); ekle('Bina kabuğu ve tesisat yalıtımı', 'kabuk', 0, topla(G) - topla(y), { yatirim: d.kabuk.tl }); G = y; }
    if (d.kazan.on) { const y = carp(G, d.kazan.tas / 100); ekle('Kazan / kaskad sistemi', 'kazan', 0, topla(G) - topla(y), { yatirim: d.kazan.tl }); G = y; }
    if (d.pompa.on) {
      const y = carp(G, d.pompa.tas / 100), ekE = ((topla(G) - topla(y)) * F.dg_kwh_sm3) / (d.pompa.cop || 3);
      ekle('Isı pompası (kısmi ısıtma yükü)', 'pompa', -ekE, topla(G) - topla(y), { yatirim: d.pompa.tl });
      const oran = ekE / (topla(E) || 1); E = E.map((x) => x * (1 + oran)); G = y;
    }
    if (d.bms.on) { const ye = carp(E, d.bms.tas / 100), yg = carp(G, d.bms.tas / 100); ekle('Bina otomasyonu / enerji izleme', 'bms', topla(E) - topla(ye), topla(G) - topla(yg), { yatirim: d.bms.tl }); E = ye; G = yg; }
    if (d.led.on) { const ye = carp(E, (d.led.pay / 100) * (d.led.tas / 100)); ekle('LED aydınlatma dönüşümü', 'led', topla(E) - topla(ye), 0, { yatirim: d.led.tl }); E = ye; }
    if (d.sogutma.on) { const ye = carp(E, (d.sogutma.pay / 100) * (d.sogutma.tas / 100)); ekle('Soğutma sistemi verimliliği', 'sogutma', topla(E) - topla(ye), 0, { yatirim: d.sogutma.tl }); E = ye; }
    let ges = { kw: 0, uretim: 0, mahsup: 0, fazla: 0 };
    if (d.ges.on) {
      const kw = topla(d.ges.birimler.map((b) => b.kw || 0)), uretim = V.aylik.map((x) => x * kw), mahsup = uretim.map((u, i) => Math.min(u, E[i]));
      ges = { kw, uretim: topla(uretim), mahsup: topla(mahsup), fazla: topla(uretim) - topla(mahsup), aylikMahsup: mahsup };
      ekle('Çatı GES (aylık mahsuplaşma)', 'ges', ges.mahsup, 0, { yatirim: d.ges.tl_kw != null ? d.ges.tl_kw * kw : null, kw });
      E = E.map((x, i) => x - mahsup[i]);
    }
    sonuc.forEach((r) => { r.geriOdeme = r.yatirim != null && r.tl && r.tl > 0 ? r.yatirim / r.tl : null; });
    const toplamDE = topla(sonuc.map((r) => r.dE)), toplamDG = topla(sonuc.map((r) => r.dG)), toplamTL = sonuc.some((r) => r.tl != null) ? topla(sonuc.map((r) => r.tl || 0)) : null;
    // Yatırımı girilen kaldıraçlar üzerinden toplam yatırım ve geri ödeme (girilmeyenler hariç tutulur)
    const girilen = sonuc.filter((r) => r.yatirim != null), yat = girilen.length ? topla(girilen.map((r) => r.yatirim)) : null, kazancGirilen = topla(girilen.map((r) => r.tl || 0));
    return { sonuc, E, G, ges, toplamDE, toplamDG, toplamCo2: topla(sonuc.map((r) => r.co2)), toplamTL, yatirim: yat, yatirimKismi: girilen.length > 0 && girilen.length < sonuc.length, geriOdeme: yat != null && kazancGirilen > 0 ? yat / kazancGirilen : null };
  }

  // ---------- görünüm ----------
  const girdi = 'bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-200';
  const kart = (b, dg, alt, renk) => `<div class="glass-card rounded-xl p-3"><div class="text-[10px] uppercase tracking-wider text-slate-400">${b}</div><div class="text-xl font-bold mt-0.5 ${renk || 'text-white'}">${dg}</div><div class="text-[10px] text-slate-500 mt-0.5">${alt || ''}</div></div>`;

  function sema(T, d, S) {
    const bn0 = T.binalar;
    // tüketim serisi olmayan GES birimleri (ör. Geriatri Merkezi) ek kutu olarak gösterilir
    const ekler = d.ges.on ? d.ges.birimler.filter((g) => g.kw > 0 && !bn0.some((b) => b.ad === g.ad) && bn0.length > 1).map((g) => ({ ad: g.ad, kwh: 0, sm3: 0, veriYok: true })) : [];
    const bn = bn0.concat(ekler), w = 170, bosluk = 18, W = Math.max(520, bn.length * (w + bosluk) + bosluk), H = 300;
    const aktif = ['kabuk', 'kazan', 'pompa', 'bms', 'led', 'sogutma'].filter((k) => d[k].on);
    const ad = { kabuk: 'Yalıtım', kazan: 'Kazan/kaskad', pompa: 'Isı pompası', bms: 'Otomasyon', led: 'LED', sogutma: 'Soğutma' };
    const gesKw = (b) => (d.ges.on ? topla(d.ges.birimler.filter((g) => g.ad === b.ad || bn.length === 1).map((g) => g.kw || 0)) : 0);
    const kutular = bn.map((b, i) => {
      const x = bosluk + i * (w + bosluk), kw = gesKw(b), cati = kw > 0
        ? `<polygon points="${x + 20},70 ${x + w - 20},70 ${x + w - 35},48 ${x + 35},48" fill="#fbbf24" fill-opacity="0.85" stroke="#92400e"/><text x="${x + w / 2}" y="62" text-anchor="middle" font-size="11" font-weight="700" fill="#451a03">${tr0(kw)} kW GES</text>`
        : `<line x1="${x + 10}" y1="70" x2="${x + w - 10}" y2="70" stroke="#475569" stroke-width="2"/>`;
      return `${cati}<rect x="${x}" y="70" width="${w}" height="110" rx="6" fill="#0f172a" stroke="#334155"/>
        <text x="${x + w / 2}" y="92" text-anchor="middle" font-size="12" font-weight="700" fill="#e2e8f0">${esc2(b.ad.length > 24 ? b.ad.slice(0, 23) + '…' : b.ad)}</text>
        <text x="${x + 10}" y="120" font-size="11" fill="#3f8fd2">⚡ ${tr0(b.kwh)} kWh</text><text x="${x + 10}" y="140" font-size="11" fill="#d9822b">🔥 ${tr0(b.sm3)} Sm³</text>
        <text x="${x + 10}" y="165" font-size="10" fill="#64748b">${b.veriYok ? 'tüketim serisi yok (yalnız GES)' : b.kwh ? 'şebekeye bağlı' : 'elektrik verisi yok'}</text>
        <line x1="${x + w / 2}" y1="180" x2="${x + w / 2}" y2="236" stroke="#475569" stroke-width="1.5" stroke-dasharray="4 3"/>`;
    }).join('');
    const sebeke = `<rect x="${W / 2 - 150}" y="236" width="300" height="52" rx="8" fill="#082f49" stroke="#0ea5e9"/>
      <text x="${W / 2}" y="256" text-anchor="middle" font-size="11" fill="#7dd3fc">ŞEBEKE (net çekiş)</text>
      <text x="${W / 2}" y="276" text-anchor="middle" font-size="13" font-weight="700" fill="#e0f2fe">${tr0(topla(T.E))} → ${tr0(topla(S.E))} kWh/yıl</text>`;
    const etiket = aktif.length ? `<text x="${bosluk}" y="20" font-size="11" fill="#94a3b8">Açık kaldıraçlar:</text>` + aktif.map((k, i) => `<rect x="${bosluk + 100 + i * 96}" y="8" width="88" height="18" rx="9" fill="#10b98122" stroke="#10b981"/><text x="${bosluk + 144 + i * 96}" y="21" text-anchor="middle" font-size="10" fill="#6ee7b7">${ad[k]}</text>`).join('') : `<text x="${bosluk}" y="20" font-size="11" fill="#64748b">Şimdiki durum — aşağıdan kaldıraç açın</text>`;
    return `<div class="overflow-x-auto"><svg viewBox="0 0 ${W} ${H}" style="min-width:${Math.min(W, 640)}px" class="w-full h-auto">${etiket}${kutular}${sebeke}</svg></div>`;
  }

  function kaldiracSatiri(k, baslik, d, alanlar, S, aciklama) {
    const r = S.sonuc.find((x) => x.anahtar === k), o = d[k];
    const alan = (a) => `<label class="text-[10px] text-slate-500 mr-2">${a[1]} <input type="number" step="${a[3] || 1}" value="${o[a[0]] ?? ''}" onchange="Ikiz.ayar('${k}.${a[0]}', this.value)" class="${girdi} w-16 ml-0.5" ${o.on ? '' : 'disabled'}></label>`;
    return `<tr class="border-t border-slate-800/70 align-top ${o.on ? '' : 'opacity-60'}"><td class="px-3 py-2"><label class="flex items-start gap-2 cursor-pointer"><input type="checkbox" ${o.on ? 'checked' : ''} onchange="Ikiz.ac('${k}', this.checked)" class="mt-0.5"><span><span class="text-slate-100 font-semibold">${baslik}</span><span class="block text-[10px] text-slate-500 max-w-xs">${aciklama}</span></span></label></td>
      <td class="px-3 py-2">${alanlar.map(alan).join('')}</td>
      <td class="px-3 py-2 text-right font-mono">${r ? tr0(r.dE) : '—'}</td><td class="px-3 py-2 text-right font-mono">${r ? tr0(r.dG) : '—'}</td><td class="px-3 py-2 text-right font-mono text-emerald-300">${r ? tr1(r.co2) : '—'}</td>
      <td class="px-3 py-2"><input type="number" placeholder="TL" value="${o.tl ?? ''}" onchange="Ikiz.ayar('${k}.tl', this.value)" class="${girdi} w-24" ${o.on ? '' : 'disabled'}></td>
      <td class="px-3 py-2 text-right font-mono">${r && r.geriOdeme != null ? tr1(r.geriOdeme) + ' yıl' : '—'}</td></tr>`;
  }

  function gesSatiri(d, S, V) {
    const o = d.ges, r = S.sonuc.find((x) => x.anahtar === 'ges');
    const birimler = o.birimler.map((b, i) => `<label class="text-[10px] text-slate-500 mr-3 inline-block mb-1">${esc2(b.ad)} <input type="number" min="0" value="${b.kw ?? ''}" onchange="Ikiz.gesKw(${i}, this.value)" class="${girdi} w-16 ml-0.5" ${o.on ? '' : 'disabled'}> kW</label>`).join('');
    return `<tr class="border-t border-slate-800/70 align-top ${o.on ? '' : 'opacity-60'}"><td class="px-3 py-2"><label class="flex items-start gap-2 cursor-pointer"><input type="checkbox" ${o.on ? 'checked' : ''} onchange="Ikiz.ac('ges', this.checked)" class="mt-0.5"><span><span class="text-slate-100 font-semibold">Çatı GES</span><span class="block text-[10px] text-slate-500 max-w-xs">Verim: ${esc2(V.kaynak)} (${tr0(V.yillik)} kWh/kW·yıl). Aylık mahsuplaşma: üretim, o ayın kalan talebiyle sınırlı sayılır.</span></span></label></td>
      <td class="px-3 py-2">${birimler}<div class="text-[10px] text-slate-500">${r ? `Üretim ${tr0(S.ges.uretim)} kWh • mahsup ${tr0(S.ges.mahsup)} • şebekeye fazla ${tr0(S.ges.fazla)} kWh` : ''}</div>
        <label class="text-[10px] text-slate-500">Yatırım (TL/kW) <input type="number" value="${o.tl_kw ?? ''}" onchange="Ikiz.ayar('ges.tl_kw', this.value)" class="${girdi} w-20 ml-0.5" ${o.on ? '' : 'disabled'}></label></td>
      <td class="px-3 py-2 text-right font-mono">${r ? tr0(r.dE) : '—'}</td><td class="px-3 py-2 text-right font-mono">—</td><td class="px-3 py-2 text-right font-mono text-emerald-300">${r ? tr1(r.co2) : '—'}</td>
      <td class="px-3 py-2 font-mono text-slate-400">${r && r.yatirim != null ? tr0(r.yatirim) : '—'}</td><td class="px-3 py-2 text-right font-mono">${r && r.geriOdeme != null ? tr1(r.geriOdeme) + ' yıl' : '—'}</td></tr>`;
  }

  // Etüt raporundaki hesaplanmış tasarruf oranları (Etut.oneri) — "Uygula" kaldıracın tasarruf yüzdesini etüt değerine ayarlar
  function etutKutusu(d) {
    const o = window.Etut && Etut.oneri(ctx.tesis); if (!o) return '';
    const p1 = (n) => (n == null ? '—' : n.toLocaleString('tr-TR', { maximumFractionDigits: 1, minimumFractionDigits: 1 }));
    const satir = (ad, deger, aciklama, k) => `<tr class="border-t border-slate-800/70"><td class="px-2 py-1.5 text-slate-200">${ad}</td><td class="px-2 py-1.5 text-right font-mono text-cyan-300">${deger}</td><td class="px-2 py-1.5 text-slate-400">${aciklama}</td><td class="px-2 py-1.5 text-right">${k ? `<button onclick="Ikiz.etutUygula('${k}')" class="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">Uygula</button>` : ''}</td></tr>`;
    const adlar = (l) => l.map((x) => esc2(x.ad)).join('; ') || '—';
    const gesTek = d.ges.birimler.length === 1, g = o.ges;
    return `<details class="mt-4"><summary class="cursor-pointer text-xs text-slate-300">Etüt raporundaki değerler (${esc2(o.bina.kisa)}, ${o.yil} tüketimine göre) — tasarruf oranlarını etütle eşleştir</summary>
      <table class="w-full text-xs mt-2"><thead><tr class="text-slate-400"><th class="px-2 py-1 text-left">Kaldıraç</th><th class="px-2 py-1 text-right">Etüt değeri</th><th class="px-2 py-1 text-left">Etüt önlemleri</th><th></th></tr></thead><tbody>
      ${satir('Bina kabuğu ve tesisat yalıtımı', o.kabuk.pct ? '%' + p1(o.kabuk.pct) + ' gaz' : '—', adlar(o.kabuk.onlemler), o.kabuk.pct ? 'kabuk' : '')}
      ${satir('Kazan / kaskad sistemi', o.kazan.pct ? '%' + p1(o.kazan.pct) + ' gaz' : '—', adlar(o.kazan.onlemler), o.kazan.pct ? 'kazan' : '')}
      ${satir('LED aydınlatma', o.led.pct ? '%' + p1(o.led.pct) + ' elektrik' : '—', adlar(o.led.onlemler) + (o.led.pct ? ' (aydınlatma payı, LED tasarrufu %' + (d.led.tas) + ' kabul edilerek ayarlanır)' : ''), o.led.pct ? 'led' : '')}
      ${satir('Çatı GES', g ? tr0(g.kw) + ' kWe' : '—', g ? `etüt önerisi ~${tr0(g.kwh)} kWh/yıl • geri ödeme ${p1(g.geri_odeme_yil)} yıl${gesTek ? '' : ' • tesiste birden çok GES birimi var, kW\'ları elle girin'}` : 'etütte GES önerisi yok', g && gesTek ? 'ges' : '')}
      </tbody></table>
      <p class="text-[10px] text-slate-500 mt-1">Etüt oranları, etüt yılı tüketimine göre hesaplanmış yüzdelerdir; burada ikizin taban yılına uygulanır. Etütteki motor, stand-by, tarife gibi önlemlerin ikizde karşılığı yoktur (Enerji Etütleri sekmesinde bakınız). Çakışmayı önlemek için yalıtım/kazan değerlerini birlikte açıp kontrol edin.</p></details>`;
  }

  function planTablosu() {
    const sayiDeger = (s) => Number(String(s).replace(/\./g, '').replace(',', '.'));
    const l = (ctx.eylemler || []).map((e) => { const m = /([\d.]+(?:,\d+)?)\s*(kWh|Sm³|Sm3)/i.exec(e.hedef || ''); return Object.assign({}, e, { kwh: m && /kwh/i.test(m[2]) ? sayiDeger(m[1]) : null, sm3: m && /sm/i.test(m[2]) ? sayiDeger(m[1]) : null }); });
    if (!l.length) return '';
    return `<details class="mt-4"><summary class="cursor-pointer text-xs text-slate-300">ISO eylem planında bu tesis için tamamlanmamış tasarruf potansiyeli (${l.length} eylem • ${tr0(topla(l.map((x) => x.kwh)))} kWh • ${tr0(topla(l.map((x) => x.sm3)))} Sm³)</summary>
      <table class="w-full text-xs mt-2"><thead><tr class="text-slate-400"><th class="px-2 py-1 text-left">No</th><th class="px-2 py-1 text-left">Önlem</th><th class="px-2 py-1 text-left">Termin</th><th class="px-2 py-1 text-right">Planlanan tasarruf</th><th class="px-2 py-1 text-right">Geri ödeme (yıl)</th></tr></thead><tbody>
      ${l.map((x) => `<tr class="border-t border-slate-800/70"><td class="px-2 py-1 text-slate-400">${esc2(x.no)}</td><td class="px-2 py-1 text-slate-200">${esc2(x.onlem)}</td><td class="px-2 py-1 text-slate-400">${esc2(x.termin || '—')}</td><td class="px-2 py-1 text-right font-mono">${x.kwh ? tr0(x.kwh) + ' kWh' : x.sm3 ? tr0(x.sm3) + ' Sm³' : '—'}</td><td class="px-2 py-1 text-right font-mono">${esc2(x.geri_odeme ?? '—')}</td></tr>`).join('')}</tbody></table>
      <p class="text-[10px] text-slate-500 mt-1">Bu değerler Excel'deki planlanan tasarruflardır; yukarıdaki kaldıraçlarla çakışabilir (LED, yalıtım, kazan). Çifte sayımı önlemek için kaldıraç oranlarını bu değerlerle uyumlu girin.</p></details>`;
  }

  function ciz(c) {
    ctx = c;
    const el = document.getElementById('isoIkiz'); if (!el) return;
    if (window.Etut && !etutHazir) { etutHazir = true; Etut.yukle().then(() => ciz(ctx)).catch(() => {}); }
    const F = (window.Karbon && Karbon.faktorler) ? Karbon.faktorler() : { ef_elek: 0.479, dg_kwh_sm3: 9.5, ef_dg: 0.184 };
    const T = taban(), d = durum(), V = gesVerim(), S = hesapla(T, d, F, V);
    const tesisAd = (ctx.D.tesisler.find((t) => t.id === ctx.tesis) || {}).ad || '';
    const baseCo2 = (topla(T.E) * F.ef_elek) / 1000 + (topla(T.G) * F.dg_kwh_sm3 * F.ef_dg) / 1000, sonCo2 = baseCo2 - S.toplamCo2;
    const f = d.fiyat;
    const ozet = `<span>${esc2(tesisAd)} • taban ${T.yil}</span><span class="text-emerald-300 font-semibold">${S.sonuc.length ? '−' + tr1(S.toplamCo2) + ' tCO₂e/yıl' : 'senaryo kapalı'}</span>`;
    const govde = `<div class="p-4 space-y-4">
      <p class="text-[11px] text-slate-400">Tesisin ${T.yil} yılı gerçek tüketiminden kurulan sayısal ikiz. Aşağıdan yatırım kaldıracı açıp parametreleri değiştirin; tüketim, emisyon ve (fiyat/yatırım girerseniz) geri ödeme anında hesaplanır.
        <b class="text-slate-300">Tasarruf oranları tipik değer varsayımıdır</b> — ölçülmüş/proje değeriyle değiştirin. ${T.tamYil ? '' : `<span class="text-amber-300">Not: ${T.yil} yılı 12 ayı tamamlamıyor; yıllık değerler eksik olabilir.</span>`}</p>
      <div class="grid grid-cols-2 lg:grid-cols-5 gap-3">
        ${kart('Elektrik (şimdi)', tr0(topla(T.E)) + ' <span class="text-xs text-slate-400">kWh</span>', 'taban yıl')}
        ${kart('Elektrik (senaryo, net çekiş)', tr0(topla(S.E)) + ' <span class="text-xs text-slate-400">kWh</span>', `${tr0(topla(T.E) ? (1 - topla(S.E) / topla(T.E)) * 100 : 0)}% azalma`, 'text-cyan-300')}
        ${kart('Doğalgaz', tr0(topla(S.G)) + ' <span class="text-xs text-slate-400">Sm³</span>', `şimdi ${tr0(topla(T.G))}`, 'text-orange-300')}
        ${kart('Emisyon', tr0(sonCo2) + ' <span class="text-xs text-slate-400">tCO₂e</span>', `şimdi ${tr0(baseCo2)} • ${tr1(S.toplamCo2)} t azalma`, 'text-emerald-300')}
        ${kart('Geri ödeme', S.geriOdeme != null ? tr1(S.geriOdeme) + ' <span class="text-xs text-slate-400">yıl</span>' : '—', S.toplamTL != null ? `yıllık kazanç ${tr0(S.toplamTL)} TL${S.yatirimKismi ? ' • yalnız yatırımı girilenler' : ''}` : 'fiyat ve yatırım girin')}</div>
      ${sema(T, d, S)}
      <div class="overflow-x-auto"><table class="w-full text-xs"><thead class="bg-slate-900/80 text-slate-400"><tr><th class="px-3 py-2 text-left">Kaldıraç</th><th class="px-3 py-2 text-left">Parametre</th><th class="px-3 py-2 text-right">Elektrik (kWh)</th><th class="px-3 py-2 text-right">Doğalgaz (Sm³)</th><th class="px-3 py-2 text-right">CO₂ (t)</th><th class="px-3 py-2 text-left">Yatırım (TL)</th><th class="px-3 py-2 text-right">Geri ödeme</th></tr></thead><tbody>
        ${gesSatiri(d, S, V)}
        ${kaldiracSatiri('kabuk', 'Bina kabuğu ve tesisat yalıtımı', d, [['tas', 'Doğalgaz tasarrufu %']], S, 'Yalıtım, kapı/pencere, bariyer ve tesisat yalıtımı')}
        ${kaldiracSatiri('kazan', 'Kazan / kaskad sistemi', d, [['tas', 'Doğalgaz tasarrufu %']], S, 'Kaskad, yoğuşmalı kazan, brülör optimizasyonu')}
        ${kaldiracSatiri('pompa', 'Isı pompası', d, [['tas', 'Isıtma yükü payı %'], ['cop', 'COP', '', '0.1']], S, 'Doğalgaz yükünün bir kısmını elektrikli ısı pompasına kaydırır (elektrik artar)')}
        ${kaldiracSatiri('bms', 'Bina otomasyonu / enerji izleme', d, [['tas', 'Tasarruf %']], S, 'Zamanlama, set-nokta ve izleme ile elektrik ve gazda ortak tasarruf')}
        ${kaldiracSatiri('led', 'LED aydınlatma dönüşümü', d, [['pay', 'Aydınlatma payı %'], ['tas', 'LED tasarrufu %']], S, 'Aydınlatma payı: elektriğin ne kadarı aydınlatma')}
        ${kaldiracSatiri('sogutma', 'Soğutma sistemi verimliliği', d, [['pay', 'Soğutma payı %'], ['tas', 'Tasarruf %']], S, 'Chiller / soğutma kulesi / evaporatif soğutma')}</tbody>
        <tfoot class="border-t-2 border-slate-700 font-semibold text-white"><tr><td class="px-3 py-2" colspan="2">Toplam</td><td class="px-3 py-2 text-right font-mono">${tr0(S.toplamDE)}</td><td class="px-3 py-2 text-right font-mono">${tr0(S.toplamDG)}</td><td class="px-3 py-2 text-right font-mono text-emerald-300">${tr1(S.toplamCo2)}</td><td class="px-3 py-2 font-mono text-slate-400">${S.yatirim != null ? tr0(S.yatirim) : '—'}</td><td class="px-3 py-2 text-right font-mono">${S.geriOdeme != null ? tr1(S.geriOdeme) + ' yıl' : '—'}</td></tr></tfoot></table></div>
      <div class="flex flex-wrap items-end gap-4 text-xs">
        <label class="text-[11px] text-slate-400">Elektrik birim fiyatı (TL/kWh) <input type="number" step="0.01" value="${f.elek ?? ''}" onchange="Ikiz.ayar('fiyat.elek', this.value)" class="${girdi} w-24 ml-1"></label>
        <label class="text-[11px] text-slate-400">Doğalgaz birim fiyatı (TL/Sm³) <input type="number" step="0.01" value="${f.gaz ?? ''}" onchange="Ikiz.ayar('fiyat.gaz', this.value)" class="${girdi} w-24 ml-1"></label>
        <button onclick="Ikiz.csv()" class="px-3 py-1.5 rounded-lg font-semibold bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200">CSV indir</button>
        <button onclick="Ikiz.yazdir()" class="px-3 py-1.5 rounded-lg font-semibold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30">Yönetim özeti (yazdır)</button>
        <button onclick="Ikiz.sifirla()" class="px-3 py-1.5 rounded-lg font-semibold text-slate-400 hover:text-slate-200">Varsayılanlara dön</button></div>
      <div class="h-64"><canvas id="chIkiz"></canvas></div>
      ${etutKutusu(d)}
      ${planTablosu()}
      <p class="text-[10px] text-slate-500">Fiyat ve yatırım tutarları yalnızca bu tarayıcıda saklanır, siteye veya depoya yazılmaz. Model, ${esc2(T.yil)} yılı tüketim profilini sabit kabul eder (hava ve faaliyet farkları ayrıca modellenmemiştir); GES aylık mahsuplaşması abone bazlı değil tesis toplamı üzerindendir.</p></div>`;
    const acikDurum = [...el.querySelectorAll('details')].map((d) => d.open);   // yeniden çizimde açık/kapalı durumu korunur (kaldıraç seçince bölüm kapanmasın)
    el.innerHTML = `<details data-k="ikiz" ${ctx.acik ? 'open' : ''} class="group glass-card rounded-xl overflow-hidden"><summary class="cursor-pointer select-none p-4 flex flex-wrap items-center gap-x-3 gap-y-2 hover:bg-slate-800/40" style="list-style:none"><span class="text-slate-400 inline-block transition-transform group-open:rotate-90">▸</span><h2 class="text-sm font-semibold text-white">Dijital ikiz ve yatırım senaryoları</h2><div class="ml-auto flex flex-wrap items-center gap-3 text-[11px] text-slate-400">${ozet}</div></summary><div class="border-t border-slate-800">${govde}</div></details>`;
    el.querySelectorAll('details').forEach((d, i) => { if (acikDurum[i] != null) d.open = acikDurum[i]; });
    ctx.son = { T, d, V, S, F, tesisAd };
    grafikCiz();
  }

  function grafikCiz() {
    const { T, S } = ctx.son; if (!window.Chart || !document.getElementById('chIkiz')) return;
    if (grafik.ikiz) grafik.ikiz.destroy();
    grafik.ikiz = new Chart(document.getElementById('chIkiz'), { type: 'bar', data: { labels: AY, datasets: [
      { label: 'Şimdi (kWh)', data: T.E.map(Math.round), backgroundColor: '#475569' },
      { label: 'Senaryo net şebeke çekişi (kWh)', data: S.E.map(Math.round), backgroundColor: '#3f8fd2' },
      ...(S.ges.aylikMahsup ? [{ type: 'line', label: 'GES mahsup (kWh)', data: S.ges.aylikMahsup.map(Math.round), borderColor: TV(), backgroundColor: TV(), pointRadius: 3, tension: 0.3 }] : [])] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' }, title: { display: true, text: 'Aylık elektrik: şimdi ve senaryo', color: koyuMu() ? '#94a3b8' : '#5b6b7e', font: { size: 11, weight: 'normal' } } } } });
  }

  function yol(o, p, v) { const a = p.split('.'); let x = o; for (let i = 0; i < a.length - 1; i++) x = x[a[i]]; x[a[a.length - 1]] = v; }

  window.Ikiz = {
    ciz,
    ayar(p, v) { yol(durum(), p, sayi(v)); sakla(); ciz(ctx); },
    ac(k, v) { durum()[k].on = !!v; sakla(); ciz(ctx); },
    gesKw(i, v) { durum().ges.birimler[i].kw = sayi(v) || 0; sakla(); ciz(ctx); },
    etutUygula(k) {
      const o = window.Etut && Etut.oneri(ctx.tesis), d = durum(); if (!o) return;
      const yv = (n) => Math.round(n * 10) / 10;
      if (k === 'kabuk' || k === 'kazan') { d[k].on = true; d[k].tas = yv(o[k].pct); }
      else if (k === 'led') { d.led.on = true; d.led.pay = yv(o.led.pct / ((d.led.tas || 50) / 100)); }
      else if (k === 'ges' && o.ges && d.ges.birimler.length === 1) { d.ges.on = true; d.ges.birimler[0].kw = o.ges.kw; }
      sakla(); ciz(ctx);
    },
        sifirla() { delete kayitlar[ctx.tesis]; sakla(); ciz(ctx); },
    csv() {
      const { T, d, S, tesisAd } = ctx.son, sat = [['Kaldıraç', 'Elektrik kWh', 'Doğalgaz Sm3', 'CO2 t', 'Yatırım TL', 'Yıllık kazanç TL', 'Geri ödeme yıl'],
        ...S.sonuc.map((r) => [r.ad, Math.round(r.dE), Math.round(r.dG), r.co2.toFixed(1), r.yatirim ?? '', r.tl != null ? Math.round(r.tl) : '', r.geriOdeme != null ? r.geriOdeme.toFixed(1) : '']),
        ['TOPLAM', Math.round(S.toplamDE), Math.round(S.toplamDG), S.toplamCo2.toFixed(1), S.yatirim ?? '', S.toplamTL != null ? Math.round(S.toplamTL) : '', S.geriOdeme != null ? S.geriOdeme.toFixed(1) : '']];
      const metin = '﻿' + [[`${tesisAd} dijital ikiz senaryosu (taban ${T.yil})`], ...sat].map((r) => r.map((h) => { const s = String(h ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';')).join('\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([metin], { type: 'text/csv;charset=utf-8' })); a.download = 'dijital_ikiz_' + ctx.tesis + '.csv'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    },
    yazdir() {
      const { T, S, tesisAd, F } = ctx.son, w = window.open('', '_blank'); if (!w) return;
      const baseCo2 = (topla(T.E) * F.ef_elek) / 1000 + (topla(T.G) * F.dg_kwh_sm3 * F.ef_dg) / 1000;
      w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc2(tesisAd)} – yatırım senaryosu</title><style>body{font:14px Inter,Arial,sans-serif;margin:32px;color:#0f172a}h1{font-size:20px}table{border-collapse:collapse;width:100%;margin-top:16px}td,th{border:1px solid #cbd5e1;padding:6px 8px;text-align:right}td:first-child,th:first-child{text-align:left}small{color:#64748b}</style>
        <h1>${esc2(tesisAd)} — yatırım senaryosu özeti</h1><small>İZBB İklim Değişikliği ve Temiz Enerji Şube Müdürlüğü • taban yıl ${esc2(T.yil)} • tasarruf oranları varsayımdır</small>
        <p>Elektrik: <b>${tr0(topla(T.E))}</b> → <b>${tr0(topla(S.E))}</b> kWh/yıl (net şebeke çekişi) • Doğalgaz: <b>${tr0(topla(T.G))}</b> → <b>${tr0(topla(S.G))}</b> Sm³/yıl • Emisyon: <b>${tr0(baseCo2)}</b> → <b>${tr0(baseCo2 - S.toplamCo2)}</b> tCO₂e/yıl (−${tr1(S.toplamCo2)} t)${S.geriOdeme != null ? ` • Geri ödeme: <b>${tr1(S.geriOdeme)}</b> yıl` : ''}</p>
        <table><tr><th>Kaldıraç</th><th>Elektrik (kWh)</th><th>Doğalgaz (Sm³)</th><th>CO₂ (t)</th><th>Geri ödeme</th></tr>${S.sonuc.map((r) => `<tr><td>${esc2(r.ad)}</td><td>${tr0(r.dE)}</td><td>${tr0(r.dG)}</td><td>${tr1(r.co2)}</td><td>${r.geriOdeme != null ? tr1(r.geriOdeme) + ' yıl' : '—'}</td></tr>`).join('') || '<tr><td colspan="5">Kaldıraç seçilmedi</td></tr>'}</table>
        <script>setTimeout(function(){window.print()},300)<\/script>`);
      w.document.close();
    },
  };
})();
