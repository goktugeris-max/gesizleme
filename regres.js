/* Regresyon aracı (ISO 50001 → tesis → "Regresyon" alt sekmesi): mevcut verilerle hangi değişken bileşimi anlamlı bir EnB modeli verir?
 *
 * Amaç KEŞİF'tir; resmî EnB/referans çizgisini (FRM.06.07 EnRÇ) DEĞİŞTİRMEZ, hiçbir yere yazılmaz. ISO şifreli verisinden tarayıcıda hesaplanır.
 * Aday değişkenler (seri bazında): dosyadaki hava/etkinlik değişkenleri (HDD, CDD, yemek, kişi vb.), ay günü sayısı, mevsimsellik (sin, cos), zaman eğilimi,
 * tesisin diğer serilerinin tüketimi (ör. mutfak elektriği ↔ doğalgaz). Seçenekler: dönem (tümü / son 36 / son 24 ay), uç ay dışlama.
 * Model: tüketim = b0 + Σ bj·xj (en küçük kareler). Çıktı: R², ayarlı R², F anlamlılığı, t/p, VIF, Durbin-Watson, Q² (tek tek dışarıda bırakma ile çapraz doğrulama).
 * Otomatik öneri: aday kümesinin tüm alt kümeleri (en çok 4 değişken, her değişken için ≥5 gözlem) denenir; "geçerli" = F p<0,05, tüm p<0,05, HDD/CDD katsayısı pozitif,
 * R² ≥ 0,75, Q² ≥ 0,5, VIF < 10. Çok sayıda alt küme denendiği için seçilen modelin p değerleri iyimserdir; Q² bu yüzden zorunlu koşuldur.
 */
(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tr = (n, d) => (n == null || !isFinite(n) ? '—' : Number(n).toLocaleString('tr-TR', { maximumFractionDigits: d == null ? 0 : d, minimumFractionDigits: d == null ? 0 : d }));
  const AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const ESIK = { p: 0.05, r2: 0.75, r2Kismen: 0.5, q2: 0.5, nk: 5, vif: 10, enFazla: 4, enAz: 10, aday: 11 };
  const RENK = { 'geçerli': '#1f9d6b', kismen: '#d9962b', 'zayıf': '#d64545' };
  let ctx = null, st = { tesis: null, sid: null, donem: 'tum', secili: null, haric: new Set() };
  const grafik = {};
  const memo = {};

  // ---------- istatistik yardımcıları ----------
  function lgam(x) { const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]; let y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let s = 1.000000000190015; for (let j = 0; j < 6; j++) s += c[j] / ++y; return -t + Math.log(2.5066282746310005 * s / x); }
  function betacf(a, b, x) {
    const FP = 1e-300, qab = a + b, qap = a + 1, qam = a - 1; let c = 1, d = 1 - qab * x / qap; if (Math.abs(d) < FP) d = FP; d = 1 / d; let h = d;
    for (let m = 1; m <= 200; m++) {
      const m2 = 2 * m; let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FP) d = FP; c = 1 + aa / c; if (Math.abs(c) < FP) c = FP; d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FP) d = FP; c = 1 + aa / c; if (Math.abs(c) < FP) c = FP; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 3e-12) break;
    }
    return h;
  }
  function betai(a, b, x) { if (x <= 0) return 0; if (x >= 1) return 1; const bt = Math.exp(lgam(a + b) - lgam(a) - lgam(b) + a * Math.log(x) + b * Math.log(1 - x)); return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b; }
  const pT = (t, df) => betai(df / 2, 0.5, df / (df + t * t));        // iki yönlü
  const pF = (F, d1, d2) => betai(d2 / 2, d1 / 2, d2 / (d2 + d1 * F)); // sağ kuyruk

  // Gauss-Jordan ile ters; tekilse null
  function ters(A) {
    const k = A.length, M = A.map((r, i) => [...r, ...Array.from({ length: k }, (_, j) => (i === j ? 1 : 0))]);
    for (let c = 0; c < k; c++) {
      let p = c; for (let r = c + 1; r < k; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-10) return null;
      [M[c], M[p]] = [M[p], M[c]];
      const d = M[c][c]; for (let j = 0; j < 2 * k; j++) M[c][j] /= d;
      for (let r = 0; r < k; r++) if (r !== c) { const f = M[r][c]; if (f) for (let j = 0; j < 2 * k; j++) M[r][j] -= f * M[c][j]; }
    }
    return M.map((r) => r.slice(k));
  }

  // rows: [{x: [..aday değerleri..], y}], sütun sayısı k; kesişim modele dahil. Sütunlar standartlaştırılarak çözülür.
  function uydur(rows, k) {
    const n = rows.length; if (k < 1 || n <= k + 1) return null;
    const ort = Array.from({ length: k }, (_, j) => rows.reduce((t, r) => t + r.x[j], 0) / n), ym = rows.reduce((t, r) => t + r.y, 0) / n;
    const sd = ort.map((m, j) => Math.sqrt(rows.reduce((t, r) => t + (r.x[j] - m) ** 2, 0) / (n - 1)));
    if (sd.some((v) => !(v > 1e-12))) return null;
    const Z = rows.map((r) => r.x.map((v, j) => (v - ort[j]) / sd[j])), yc = rows.map((r) => r.y - ym);
    const G = Array.from({ length: k }, () => new Array(k).fill(0)), g = new Array(k).fill(0);
    Z.forEach((z, i) => { for (let a = 0; a < k; a++) { g[a] += z[a] * yc[i]; for (let b = 0; b < k; b++) G[a][b] += z[a] * z[b]; } });
    const inv = ters(G); if (!inv) return null;
    const bz = inv.map((r) => r.reduce((t, v, j) => t + v * g[j], 0));
    const fit = Z.map((z) => z.reduce((t, v, j) => t + v * bz[j], 0)), e = yc.map((v, i) => v - fit[i]);
    const rss = e.reduce((t, v) => t + v * v, 0), tss = yc.reduce((t, v) => t + v * v, 0), df = n - k - 1;
    if (!(tss > 0) || df < 1) return null;
    const r2 = 1 - rss / tss, adj = 1 - (1 - r2) * (n - 1) / df, F = (r2 / k) / ((1 - r2) / df || 1e-12), s2 = rss / df;
    const b = bz.map((v, j) => v / sd[j]), b0 = ym - b.reduce((t, v, j) => t + v * ort[j], 0);
    const se = inv.map((r, j) => Math.sqrt(s2 * r[j]) / sd[j]), t = b.map((v, j) => v / se[j]), p = t.map((v) => pT(v, df));
    let press = 0; Z.forEach((z, i) => { const h = 1 / n + z.reduce((s, v, a) => s + v * inv[a].reduce((u, w, c) => u + w * z[c], 0), 0); press += (e[i] / (1 - h)) ** 2; });
    let dn = 0; for (let i = 1; i < n; i++) dn += (e[i] - e[i - 1]) ** 2;
    return { n, k, df, r2, adj, F, pF: pF(F, k, df), b0, b, se, t, p, vif: inv.map((r, j) => inv[j][j] * (n - 1)), q2: 1 - press / tss, dw: dn / (rss || 1e-12) };
  }

  // ---------- veri hazırlığı ----------
  const norm = (ad) => String(ad).replace(/\s*\(?\b20\d\d\b\)?\s*$/, '').trim();
  function noktalar(s, seriler, yil, donem) {
    const out = [], others = seriler.filter((o) => o !== s && o.tesis === s.tesis);
    Object.keys(s.yillar).map(Number).filter((y) => y <= yil).sort((a, b) => a - b).forEach((y) => {
      const v = s.yillar[String(y)];
      (v.takip || []).forEach((x, a) => {
        if (x == null || !(x > 0)) return;
        const p = { y, a, v: x, gun: new Date(y, a + 1, 0).getDate(), vars: {} };
        Object.keys(v.degiskenler || {}).forEach((ad) => { const q = v.degiskenler[ad][a]; if (q != null && isFinite(q)) p.vars[norm(ad)] = q; });
        others.forEach((o) => { const ov = o.yillar[String(y)], q = ov && ov.takip ? ov.takip[a] : null; if (q != null && q > 0) p.vars['Diğer: ' + o.bolum + ' ' + o.enerji.toLowerCase()] = q; });
        out.push(p);
      });
    });
    const son = donem === 'tum' ? out.length : Number(donem);
    return out.slice(Math.max(0, out.length - son));
  }
  function adaylar(nk) {
    const ad = {}; nk.forEach((p) => Object.keys(p.vars).forEach((k) => { ad[k] = (ad[k] || 0) + 1; }));
    const t0 = nk.length ? nk[0].y * 12 + nk[0].a : 0;
    const baz = [
      { id: 'gun', ad: 'Ay günü sayısı', tur: 'zaman', f: (p) => p.gun },
      { id: 'sin', ad: 'Mevsim (sin)', tur: 'zaman', f: (p) => Math.sin(2 * Math.PI * (p.a + 0.5) / 12) },
      { id: 'cos', ad: 'Mevsim (cos)', tur: 'zaman', f: (p) => Math.cos(2 * Math.PI * (p.a + 0.5) / 12) },
      { id: 'trend', ad: 'Zaman eğilimi', tur: 'zaman', f: (p) => p.y * 12 + p.a - t0 },
    ];
    const ozel = Object.keys(ad).filter((k) => ad[k] >= 0.7 * nk.length).map((k) => ({ id: 'v:' + k, ad: k, tur: k.startsWith('Diğer: ') ? 'seri' : /hdd|cdd/i.test(k) ? 'hava' : 'etkinlik', f: (p) => p.vars[k] }));
    return { baz, ozel };
  }
  // Tüm adaylarda değeri olan satırlar; kapsam yetmezse en az kapsayan aday atılır; fazla seri adayları y ile ilişkisine göre kırpılır
  function hazirla(s, seriler, yil, donem) {
    const nk = noktalar(s, seriler, yil, donem); if (nk.length < ESIK.enAz) return { nk, rows: [], cands: [] };
    const { baz, ozel } = adaylar(nk);
    let cands = [...baz, ...ozel];
    const kor = (c) => { const xs = nk.filter((p) => c.f(p) != null), m = xs.length; if (m < 3) return 0; const mx = xs.reduce((t, p) => t + c.f(p), 0) / m, my = xs.reduce((t, p) => t + p.v, 0) / m; let a = 0, b = 0, d = 0; xs.forEach((p) => { a += (c.f(p) - mx) * (p.v - my); b += (c.f(p) - mx) ** 2; d += (p.v - my) ** 2; }); return b && d ? Math.abs(a / Math.sqrt(b * d)) : 0; };
    if (cands.length > ESIK.aday) { const sabit = cands.filter((c) => c.tur !== 'seri'), seri = cands.filter((c) => c.tur === 'seri').sort((a, b) => kor(b) - kor(a)); cands = [...sabit, ...seri].slice(0, ESIK.aday); }
    cands = cands.filter((c) => { const v = nk.map((p) => c.f(p)); const ok = v.filter((x) => x != null); return ok.length && new Set(ok).size > 1; });
    let rows = nk.filter((p) => cands.every((c) => c.f(p) != null));
    while (rows.length < Math.min(nk.length, 12) && cands.some((c) => c.tur !== 'zaman')) {
      const kap = cands.filter((c) => c.tur !== 'zaman').map((c) => [c, nk.filter((p) => c.f(p) != null).length]).sort((a, b) => a[1] - b[1])[0][0];
      cands = cands.filter((c) => c !== kap); rows = nk.filter((p) => cands.every((c) => c.f(p) != null));
    }
    return { nk, rows, cands };
  }
  const veri = (rows, cands, idx) => rows.map((p) => ({ x: idx.map((j) => cands[j].f(p)), y: p.v }));

  // ---------- değerlendirme ----------
  function degerlendir(m, c) {
    const ned = [];
    if (m.pF >= ESIK.p) ned.push('Model bütünüyle anlamlı değil (F anlamlılığı ' + tr(m.pF, 3) + ')');
    c.forEach((x, j) => {
      if (m.p[j] >= ESIK.p) ned.push(`${x.ad}: anlamlı değil (p = ${tr(m.p[j], 3)})`);
      if (x.tur === 'hava' && m.b[j] < 0) ned.push(`${x.ad}: katsayı negatif, fiziksel anlamı yok`);
    });
    if (m.r2 < ESIK.r2) ned.push(`R² ${tr(m.r2, 2)}, ${tr(ESIK.r2, 2)} eşiğinin altında`);
    if (m.q2 < ESIK.q2) ned.push(`Çapraz doğrulama Q² ${tr(m.q2, 2)}: model görmediği aya genelleşmiyor`);
    if (m.n / (m.k + 1) < ESIK.nk) ned.push('Gözlem sayısı değişken sayısına göre az');
    const vm = Math.max(...m.vif); if (vm >= ESIK.vif) ned.push(`Değişkenler birbirine çok bağlı (en yüksek VIF ${tr(vm, 1)})`);
    const durum = !ned.length ? 'geçerli' : m.r2 >= ESIK.r2Kismen && m.pF < ESIK.p ? 'kismen' : 'zayıf';
    return { durum, ned };
  }
  const skor = (d, m) => ({ 'geçerli': 20, kismen: 10, 'zayıf': 0 }[d] + Math.max(-1, m.q2));
  const adGoster = (c) => c.ad;

  function otomatik(rows, cands) {
    const n = rows.length, K = Math.max(1, Math.min(ESIK.enFazla, Math.floor(n / ESIK.nk) - 1)), top = [];
    if (n < ESIK.enAz) return top;
    const kn = cands.length, N = 1 << kn;
    for (let mask = 1; mask < N; mask++) {
      const idx = []; for (let j = 0; j < kn; j++) if (mask & (1 << j)) idx.push(j);
      if (idx.length > K) continue;
      const m = uydur(veri(rows, cands, idx), idx.length); if (!m) continue;
      const c = idx.map((j) => cands[j]), d = degerlendir(m, c);
      top.push({ idx, m, d, s: skor(d.durum, m) });
    }
    return top.sort((a, b) => b.s - a.s).slice(0, 5);
  }

  // ---------- görünüm ----------
  const dot = (d) => `<span class="inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-full" style="background:${RENK[d] || '#94a3b8'}"></span>${d === 'kismen' ? 'kısmen' : d}</span>`;
  const tp = (p) => (p < 0.0001 ? '< 0,0001' : tr(p, 4));
  const sinifP = (p) => (p < ESIK.p ? 'text-emerald-400' : 'text-red-400');
  const chip = (act, onclick, txt) => `<button onclick="${onclick}" class="px-2.5 py-1 rounded-md text-[11px] font-semibold ${act ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-300 hover:text-white'}">${txt}</button>`;
  const serAd = (s) => `${s.bolum.split(' –')[0].trim()} (${s.enerji.toLowerCase()})`;
  const birim = (s) => (s.enerji === 'Elektrik' ? 'kWh' : 'Sm³');
  const etiket = (p) => `${AY[p.a]} ${String(p.y).slice(2)}`;

  function ozetTablo(liste) {
    const key = `${st.tesis}|${ctx.yil}|${st.donem}|${liste.length}`;
    if (!memo[key]) memo[key] = liste.map((s) => { const h = hazirla(s, ctx.seriler, ctx.yil, st.donem), o = otomatik(h.rows, h.cands); return { s, n: h.rows.length, h, en: o[0] || null }; });
    return memo[key];
  }

  function ciz() {
    const { tesis, el, seriler, yil } = ctx;
    Object.values(grafik).forEach((g) => g && g.destroy()); Object.keys(grafik).forEach((k) => delete grafik[k]);
    const liste = seriler.filter((s) => s.tesis === tesis && Object.values(s.yillar).some((v) => (v.takip || []).some((x) => x > 0)));
    if (!liste.length) { el.innerHTML = '<p class="text-sm text-slate-400 p-6">Bu tesis için aylık veri yok.</p>'; return; }
    if (st.tesis !== tesis) { st = { tesis, sid: null, donem: st.donem, secili: null, haric: new Set() }; }
    if (!st.sid || !liste.some((s) => s.id === st.sid)) st.sid = liste[0].id;
    const sec = liste.find((s) => s.id === st.sid);
    const ozet = ozetTablo(liste);
    const hz = hazirla(sec, seriler, yil, st.donem), tum = hz.rows, cands = hz.cands;
    const rows = tum.filter((p) => !st.haric.has(p.y * 12 + p.a));
    const oto = otomatik(rows, cands);
    let idx = st.secili ? st.secili.filter((j) => j < cands.length) : (oto[0] ? oto[0].idx : []);
    const m = idx.length ? uydur(veri(rows, cands, idx), idx.length) : null, ds = m ? degerlendir(m, idx.map((j) => cands[j])) : null;

    const ozetSatir = ozet.map((o) => { const e = o.en; return `<tr class="border-t border-slate-800/70 ${o.s.id === sec.id ? 'bg-slate-800/40' : ''}"><td class="px-3 py-2 text-slate-100">${esc(serAd(o.s))}</td><td class="px-3 py-2 text-right">${o.n}</td>
        <td class="px-3 py-2 text-slate-300 hidden md:table-cell">${e ? esc(e.idx.map((j) => adGoster(o.h.cands[j])).join(' + ')) : '—'}</td>
        <td class="px-3 py-2 text-right">${e ? tr(e.m.r2, 2) : '—'}</td><td class="px-3 py-2 text-right hidden sm:table-cell">${e ? tr(e.m.q2, 2) : '—'}</td>
        <td class="px-3 py-2">${e ? dot(e.d.durum) : '<span class="text-slate-500">veri yetersiz</span>'}</td><td class="px-3 py-2 hidden sm:table-cell">${window.Enb ? Enb.rozet(o.s.id) : ''}</td>
        <td class="px-3 py-2 text-right"><button onclick="Regres.sec('${esc(o.s.id)}')" class="text-[11px] font-semibold text-amber-300 hover:underline">Aç</button></td></tr>`; }).join('');

    const otoSatir = oto.map((o, i) => `<tr class="border-t border-slate-800/70 align-top"><td class="px-3 py-2 text-slate-100">${esc(o.idx.map((j) => adGoster(cands[j])).join(' + '))}</td><td class="px-3 py-2 text-right">${tr(o.m.r2, 2)}</td><td class="px-3 py-2 text-right">${tr(o.m.adj, 2)}</td><td class="px-3 py-2 text-right">${tr(o.m.q2, 2)}</td>
        <td class="px-3 py-2">${dot(o.d.durum)}${o.d.ned.length ? `<div class="text-[11px] text-slate-500 mt-0.5">${esc(o.d.ned.slice(0, 2).join('; '))}</div>` : ''}</td><td class="px-3 py-2 text-right"><button onclick="Regres.uygula(${i})" class="text-[11px] font-semibold text-amber-300 hover:underline">Uygula</button></td></tr>`).join('');
    st.oto = oto;

    const chips = cands.map((c, j) => chip(idx.includes(j), `Regres.degisken(${j})`, esc(c.ad))).join(' ');
    let sonuc = '';
    if (!tum.length || tum.length < ESIK.enAz) sonuc = `<p class="text-sm text-slate-400 p-4">Bu seri için en az ${ESIK.enAz} aylık, ortak değişkenli veri gerekir (şu an ${tum.length}).</p>`;
    else if (!m) sonuc = '<p class="text-sm text-slate-400 p-4">Yukarıdan en az bir değişken seçin (ya da "Uygula" ile önerilen modeli yükleyin). Seçilen bileşim çözülemiyorsa değişkenler birbirinin kopyası olabilir.</p>';
    else {
      const c = idx.map((j) => cands[j]), pred = (p) => m.b0 + c.reduce((t, x, a) => t + m.b[a] * x.f(p), 0);
      const kart = (b, d, alt, renk) => `<div class="glass-card p-4"><div class="text-[11px] text-slate-400">${b}</div><div class="text-2xl font-bold mt-1 ${renk || 'text-white'}">${d}</div><div class="text-[11px] text-slate-500 mt-1">${alt}</div></div>`;
      const artik = tum.map((p) => ({ p, f: pred(p), h: st.haric.has(p.y * 12 + p.a) }));
      const enBuyuk = [...artik].filter((x) => !x.h).sort((a, b) => Math.abs(b.p.v - b.f) / b.p.v - Math.abs(a.p.v - a.f) / a.p.v).slice(0, 3);
      const oneri = [];
      if (ds.durum === 'geçerli') oneri.push('Model tüm kabul eşiklerini geçiyor. Resmî EnB olarak kullanmadan önce: aylık olağandışı dönemler (kapanma, arıza) EnB değişiklik defterine işlenmeli, model bir sonraki yıl verisiyle sınanmalı.');
      else ds.ned.forEach((x) => oneri.push(x));
      if (tum.length < 24) oneri.push(`Gözlem sayısı ${tum.length}: dönemi "Tümü" yapın ya da yeni aylar geldikçe tekrar deneyin. 24 ay altı modellerde mevsimsellik güvenilir ayrışmaz.`);
      if (!cands.some((x) => x.tur === 'hava')) oneri.push('Bu seride hava değişkeni (HDD/CDD) yok. Isıtma ya da soğutma etkisi varsa MGM gün-derece değerlerini veriye eklemek modeli en çok iyileştirecek değişkendir.');
      if (!cands.some((x) => x.tur === 'etkinlik')) oneri.push('Etkinlik değişkeni yok. Tesisin tüketimini sürücülen bir sayı (ziyaretçi, yemek, buz seansı saati, doluluk) aylık toplanırsa, hava tek başına açıklayamadığı payı kapatır.');
      const ub = enBuyuk.filter((x) => Math.abs(x.p.v - x.f) / x.p.v > 0.15);
      if (ub.length) oneri.push(`En büyük kalan: ${ub.map((x) => `${etiket(x.p)} (${(x.p.v - x.f) < 0 ? '−' : ''}%${tr(Math.abs(x.p.v - x.f) / x.p.v * 100, 0)})`).join(', ')}. Bu aylarda olağandışı bir durum (kapanma, arıza, sayaç değişimi) varsa aşağıdan dışlayıp modeli yeniden deneyin ve EnB defterine yazın.`);
      if (m.dw < 1.2) oneri.push(`Artıklar zamana bağlı (Durbin-Watson ${tr(m.dw, 2)}): eğilim ya da mevsimsellik değişkeni eklemeyi deneyin.`);
      if (m.q2 < m.r2 - 0.2) oneri.push('R² ile Q² arasındaki fark büyük: model eldeki aylara fazla uymuş (aşırı uyum). Değişken sayısını azaltın.');
      sonuc = `<section class="olcum-seridi grid grid-cols-2 xl:grid-cols-4">
          ${kart('R² (ayarlı)', `${tr(m.r2, 2)} <span class="text-sm text-slate-400">(${tr(m.adj, 2)})</span>`, `Eşik ${tr(ESIK.r2, 2)}`, m.r2 >= ESIK.r2 ? 'text-emerald-300' : 'text-amber-300')}
          ${kart('F anlamlılığı', tp(m.pF), `Eşik ${tr(ESIK.p, 2)}; F = ${tr(m.F, 1)}`, m.pF < ESIK.p ? 'text-emerald-300' : 'text-red-300')}
          ${kart('Çapraz doğrulama Q²', tr(m.q2, 2), `Eşik ${tr(ESIK.q2, 2)}; her ay sırayla dışarıda bırakılıp tahmin edilir`, m.q2 >= ESIK.q2 ? 'text-emerald-300' : 'text-amber-300')}
          ${kart('Gözlem / değişken', `${m.n} / ${m.k}`, `Durbin-Watson ${tr(m.dw, 2)}; değişken başına ≥${ESIK.nk} gözlem`, m.n / (m.k + 1) >= ESIK.nk ? 'text-white' : 'text-amber-300')}</section>
        <div class="glass-card p-4"><div class="flex flex-wrap items-baseline justify-between gap-2"><h4 class="text-sm font-semibold text-white">Sonuç: ${dot(ds.durum)}</h4><button onclick="Regres.csv()" class="text-[11px] font-semibold text-amber-300 hover:underline">Veriyi CSV indir (Excel'de doğrulamak için)</button></div>
          <ul class="mt-2 text-xs text-slate-300 list-disc pl-5 space-y-1">${oneri.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
        <section class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div class="glass-card p-4"><h4 class="text-sm font-semibold text-white mb-2">Gerçekleşen ve model</h4><div class="h-64"><canvas id="chRegres"></canvas></div></div>
          <div class="glass-card overflow-hidden"><div class="overflow-x-auto"><table class="w-full text-xs"><thead class="text-slate-400"><tr><th class="px-3 py-2 text-left font-medium">Değişken</th><th class="px-3 text-right font-medium">Katsayı</th><th class="px-3 text-right font-medium">Std. hata</th><th class="px-3 text-right font-medium">t</th><th class="px-3 text-right font-medium">p</th><th class="px-3 text-right font-medium">VIF</th></tr></thead><tbody>
            <tr class="border-t border-slate-800/70"><td class="px-3 py-2 text-slate-300">Sabit</td><td class="px-3 py-2 text-right">${tr(m.b0, 1)}</td><td></td><td></td><td></td><td></td></tr>
            ${c.map((x, a) => `<tr class="border-t border-slate-800/70"><td class="px-3 py-2 text-slate-100">${esc(x.ad)}</td><td class="px-3 py-2 text-right">${tr(m.b[a], Math.abs(m.b[a]) < 10 ? 3 : 1)}</td><td class="px-3 py-2 text-right text-slate-400">${tr(m.se[a], Math.abs(m.se[a]) < 10 ? 3 : 1)}</td><td class="px-3 py-2 text-right">${tr(m.t[a], 2)}</td><td class="px-3 py-2 text-right font-semibold ${sinifP(m.p[a])}">${tp(m.p[a])}</td><td class="px-3 py-2 text-right ${m.vif[a] >= ESIK.vif ? 'text-red-400' : ''}">${tr(m.vif[a], 1)}</td></tr>`).join('')}</tbody></table></div></div></section>
        <div class="glass-card overflow-hidden"><div class="px-4 py-3 border-b border-slate-800"><h4 class="text-sm font-semibold text-white">Aylık kalanlar</h4><p class="text-[11px] text-slate-500">Uç görünen bir ayı dışlayıp modeli yeniden deneyebilirsiniz. Dışlama yalnız bu ekranda geçerlidir, hiçbir veri silinmez.</p></div>
          <div class="overflow-auto max-h-72"><table class="w-full text-xs"><thead class="text-slate-400"><tr><th class="px-3 py-2 text-left font-medium">Ay</th><th class="px-3 text-right font-medium">Gerçekleşen (${birim(sec)})</th><th class="px-3 text-right font-medium">Model</th><th class="px-3 text-right font-medium">Kalan</th><th class="px-3"></th></tr></thead><tbody>
            ${artik.map((x) => { const r = (x.p.v - x.f) / x.p.v, key = x.p.y * 12 + x.p.a; return `<tr class="border-t border-slate-800/70 ${x.h ? 'opacity-50' : ''}"><td class="px-3 py-1.5">${etiket(x.p)}</td><td class="px-3 py-1.5 text-right">${tr(x.p.v)}</td><td class="px-3 py-1.5 text-right text-slate-400">${tr(x.f)}</td><td class="px-3 py-1.5 text-right ${Math.abs(r) > 0.15 ? 'text-red-400 font-semibold' : ''}">${r < 0 ? '−' : ''}%${tr(Math.abs(r) * 100, 1)}</td><td class="px-3 py-1.5 text-right"><button onclick="Regres.haric(${key})" class="text-[11px] text-amber-300 hover:underline">${x.h ? 'Geri al' : 'Dışla'}</button></td></tr>`; }).join('')}</tbody></table></div></div>`;
      st.model = { sec, c, m, artik };
    }

    el.innerHTML = `<div class="space-y-4">
      <p class="text-xs text-slate-400">Bu araç, mevcut aylık verilerle hangi değişken bileşiminin istatistiksel olarak anlamlı bir enerji modeli (EnB) verdiğini keşfetmek içindir. Resmî referans çizgisini değiştirmez ve hiçbir yere kaydedilmez. Seri seçin, önerilen modeli deneyin ya da değişkenleri kendiniz işaretleyin. "Geçerli" olmak için F ve her değişkenin p değeri 0,05'in altında, R² en az 0,75, çapraz doğrulama Q² en az 0,5 olmalı ve HDD/CDD katsayısı pozitif olmalıdır.</p>
      <div class="glass-card overflow-hidden"><div class="px-4 py-3 border-b border-slate-800 flex flex-wrap items-baseline justify-between gap-2"><h3 class="text-sm font-bold text-white">Tüm seriler: eldeki veriyle ulaşılan en iyi model</h3>
        <label class="text-[11px] text-slate-400">Dönem <select onchange="Regres.donem(this.value)" class="ml-1 bg-slate-800 rounded px-2 py-1 text-slate-200"><option value="tum" ${st.donem === 'tum' ? 'selected' : ''}>Tüm aylar</option><option value="36" ${st.donem === '36' ? 'selected' : ''}>Son 36 ay</option><option value="24" ${st.donem === '24' ? 'selected' : ''}>Son 24 ay</option></select></label></div>
        <div class="overflow-x-auto"><table class="w-full text-xs" style="min-width:560px"><thead class="text-slate-400"><tr><th class="px-3 py-2 text-left font-medium">Seri</th><th class="px-3 text-right font-medium">Ay</th><th class="px-3 text-left font-medium hidden md:table-cell">En iyi bileşim</th><th class="px-3 text-right font-medium">R²</th><th class="px-3 text-right font-medium hidden sm:table-cell">Q²</th><th class="px-3 text-left font-medium">Durum</th><th class="px-3 text-left font-medium hidden sm:table-cell">Mevcut EnB modeli</th><th class="px-3"></th></tr></thead><tbody>${ozetSatir}</tbody></table></div></div>
      <div class="glass-card p-4"><h3 class="text-sm font-bold text-white">${esc(serAd(sec))}</h3>
        ${oto.length ? `<div class="mt-2 overflow-x-auto"><table class="w-full text-xs" style="min-width:520px"><thead class="text-slate-400"><tr><th class="px-3 py-2 text-left font-medium">Önerilen bileşim (ilk 5)</th><th class="px-3 text-right font-medium">R²</th><th class="px-3 text-right font-medium">Ayarlı</th><th class="px-3 text-right font-medium">Q²</th><th class="px-3 text-left font-medium">Durum</th><th class="px-3"></th></tr></thead><tbody>${otoSatir}</tbody></table></div>` : '<p class="mt-2 text-xs text-slate-400">Otomatik öneri için yeterli veri yok.</p>'}
        <div class="mt-3"><div class="text-[11px] text-slate-400 mb-1.5">Kendi modelinizi kurun (aday değişkenler; işaretliler modelde)</div><div class="flex flex-wrap gap-1.5">${chips || '<span class="text-xs text-slate-500">Aday değişken yok</span>'}</div></div></div>
      ${sonuc}</div>`;
    if (m && st.model) {
      const g = document.getElementById('chRegres');
      if (g && window.Chart) {
        const ren = (window.TV ? TV() : '#211950');
        grafik.m = new Chart(g, { type: 'line', data: { labels: st.model.artik.map((x) => etiket(x.p)), datasets: [
          { label: 'Gerçekleşen', data: st.model.artik.map((x) => x.p.v), borderColor: ren, backgroundColor: ren, borderWidth: 2, pointRadius: 2, tension: 0.2 },
          { label: 'Model', data: st.model.artik.map((x) => x.f), borderColor: '#3f8fd2', borderDash: [6, 4], borderWidth: 2, pointRadius: 0, tension: 0.2 }] },
        options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${tr(c.parsed.y)} ${birim(sec)}` } } }, scales: { x: { ticks: { maxTicksLimit: 12 } } } } });
      }
    }
  }

  function panel(tesis, el, seriler, yil) { ctx = { tesis, el, seriler, yil: Number(yil) }; Object.keys(memo).forEach((k) => delete memo[k]); ciz(); }
  function csv() {
    const M = st.model; if (!M) return;
    const b = ['Yıl;Ay;Gerçekleşen;' + M.c.map((x) => x.ad).join(';') + ';Model;Kalan'];
    M.artik.forEach((x) => b.push([x.p.y, x.p.a + 1, x.p.v, ...M.c.map((c) => c.f(x.p)), Math.round(x.f * 100) / 100, Math.round((x.p.v - x.f) * 100) / 100].join(';').replace(/\./g, ',')));
    const u = URL.createObjectURL(new Blob(['﻿' + b.join('\n')], { type: 'text/csv;charset=utf-8' })), a = document.createElement('a');
    a.href = u; a.download = 'regresyon-' + st.sid + '.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(u), 2000);
  }
  window.Regres = {
    panel, csv, uydur, ters, pT, pF, hazirla, otomatik, degerlendir,
    sec(id) { st.sid = id; st.secili = null; st.haric = new Set(); ciz(); },
    donem(v) { st.donem = v; st.secili = null; st.haric = new Set(); Object.keys(memo).forEach((k) => delete memo[k]); ciz(); },
    degisken(j) { const cur = st.secili || (st.oto && st.oto[0] ? st.oto[0].idx : []); st.secili = cur.includes(j) ? cur.filter((x) => x !== j) : [...cur, j].sort((a, b) => a - b); ciz(); },
    uygula(i) { if (st.oto && st.oto[i]) { st.secili = st.oto[i].idx; ciz(); } },
    haric(k) { if (st.haric.has(k)) st.haric.delete(k); else st.haric.add(k); st.secili = st.secili || (st.oto && st.oto[0] ? st.oto[0].idx : null); ciz(); },
  };
})();
