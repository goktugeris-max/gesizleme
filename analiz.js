/* GES Verim Analizi: Open-Meteo ışınımıyla düzeltilmiş performans oranı (PR) ve yaşa bağlı verim kaybı.
 *
 * Veri: data/performans.json (aylık üretim, kurulu güç, aktivasyon) + data/hava.json (collector/hava_cek.py: aylık eğik yüzey ışınımı kWh/m², gündüz sıcaklığı).
 * PR = üretim / (kWp × ışınım). Sıcaklık düzeltmesi: PRc = PR / f, f = 1 − 0,0035 × (T_hücre − 25), T_hücre ≈ gündüz ortalama sıcaklık + 20 (kaba varsayım).
 * Beklenen PRc: "kendi başlangıç" modunda santralin ilk 24 ayının (ışınımı ≥ 40 kWh/m² olan) medyanı, "sabit" modda ayarlanan PR; ikisi de her yıl %d kadar azalır.
 * Endeks = Σ gerçek / Σ beklenen (son N ay). Dash.veri() (dashboard.js) ve esc() (index.html) kullanılır.
 */
(function () {
  const ANAHTAR = 'analiz_v1';
  const GAMA = 0.0035, HUCRE_ARTI = 20;
  const VARSAYILAN = { mod: 'kendi', d: 0.5, prref: 80, n: 3 };
  let HAVA = null, yuklendi = false, secili = null, sirala = { k: 'endeks', y: 1 };
  const grafik = {};

  const oku = () => { try { return Object.assign({}, VARSAYILAN, JSON.parse(localStorage.getItem(ANAHTAR) || '{}')); } catch (e) { return Object.assign({}, VARSAYILAN); } };
  const yaz = (p) => { try { localStorage.setItem(ANAHTAR, JSON.stringify(p)); } catch (e) { /* özel pencere */ } };
  const tr0 = (n) => (n == null || isNaN(n) ? '—' : Math.round(n).toLocaleString('tr-TR'));
  const tr1 = (n) => (n == null || isNaN(n) ? '—' : n.toLocaleString('tr-TR', { maximumFractionDigits: 1, minimumFractionDigits: 1 }));
  const yuzde = (v, o) => (v == null || isNaN(v) ? '—' : '%' + (v * 100).toLocaleString('tr-TR', { maximumFractionDigits: o || 0, minimumFractionDigits: o || 0 }));
  const medyan = (a) => { const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const esc2 = (s) => (typeof esc === 'function' ? esc(s) : String(s ?? ''));
  const ayAd = (t) => `${String((t % 12) + 1).padStart(2, '0')}/${String(Math.floor(t / 12)).slice(2)}`;

  function santralAnaliz(s, p) {
    const h = HAVA && HAVA.santraller && HAVA.santraller[s.id];
    if (!h || !s.kw) return null;
    const akt = (s.aktivasyon || '').match(/^(\d{4})-(\d{2})/);
    const t0akt = akt ? Number(akt[1]) * 12 + Number(akt[2]) - 1 : null;
    const kayit = [];
    Object.keys(h).forEach((y) => {
      const aylik = s.aylik[y] || [];
      for (let i = 0; i < 12; i++) {
        const t = Number(y) * 12 + i, gti = h[y].gti[i], u = aylik[i];
        if (gti == null || !u || u <= 0) continue;
        if (t0akt != null && t <= t0akt) continue;        // aktivasyon ayı eksik ay olabilir
        const sic = h[y].sic[i] == null ? 15 : h[y].sic[i];
        const ft = 1 - GAMA * (sic + HUCRE_ARTI - 25);
        const pr = u / (s.kw * gti);
        kayit.push({ t, gti, sic, u, ft, pr, prc: pr / ft });
      }
    });
    kayit.sort((a, b) => a.t - b.t);
    if (kayit.length < 3) return { s, kayit, yeterli: false };
    const d = p.d / 100;
    let pr0, tref;
    if (p.mod === 'sabit') { pr0 = p.prref / 100; tref = t0akt == null ? kayit[0].t : t0akt; }
    else {
      const ilk = kayit.filter((k) => k.gti >= 40).slice(0, 24);
      if (ilk.length < 8) return { s, kayit, yeterli: false };
      pr0 = medyan(ilk.map((k) => k.prc)); tref = ilk.reduce((t, k) => t + k.t, 0) / ilk.length;
    }
    kayit.forEach((k) => { k.prcB = pr0 * Math.pow(1 - d, Math.max(0, (k.t - tref) / 12)); k.beklenen = s.kw * k.gti * k.prcB * k.ft; });
    const son = kayit.slice(-p.n), g = son.reduce((t, k) => t + k.u, 0), b = son.reduce((t, k) => t + k.beklenen, 0);
    const yil = kayit.length ? (kayit[kayit.length - 1].t - (t0akt == null ? kayit[0].t : t0akt)) / 12 : 0;
    return { s, kayit, yeterli: true, pr0, endeks: b ? g / b : null, gercek: g, beklenen: b, yas: yil, yasKayip: 1 - Math.pow(1 - d, yil), sonAylar: son.length,
      uyari: pr0 < 0.65 || pr0 > 0.95 ? 'Başlangıç PR\'si olağan dışı (kurulu güç veya yön/eğim kontrol edilmeli)' : '' };
  }

  function sinif(e) { return e == null ? ['text-slate-500', 'Veri yok'] : e >= 0.95 ? ['text-emerald-400', 'Normal'] : e >= 0.9 ? ['text-amber-300', 'İzle'] : ['text-red-400', 'Düşük']; }

  function ciz() {
    const kok = document.getElementById('analizIcerik'), v = window.Dash && Dash.veri();
    if (!kok || !v || !v.PERF) return;
    const p = oku();
    if (!HAVA) {
      kok.innerHTML = `<div class="glass-card rounded-xl p-6 text-sm text-slate-300 max-w-2xl">
        <div class="font-semibold text-white mb-1">Hava verisi henüz yok</div>
        Işınım verisi Open-Meteo'dan otomatik çekilir. Başlatmak için GitHub → <b>Actions</b> → <b>Hava Verisi Çek</b> → <b>Run workflow</b>. İlk çalışma geçmiş yılları indirir (birkaç dakika); sonra ayda bir kendiliğinden güncellenir.</div>`;
      return;
    }
    const liste = v.PERF.santraller.map((s) => santralAnaliz(s, p)).filter(Boolean);
    const tam = liste.filter((a) => a.yeterli);
    const gT = tam.reduce((t, a) => t + a.gercek, 0), bT = tam.reduce((t, a) => t + a.beklenen, 0);
    const dusuk = tam.filter((a) => a.endeks != null && a.endeks < 0.9);
    const kayipEnerji = tam.reduce((t, a) => t + Math.max(0, a.beklenen - a.gercek), 0);
    const yasAgirlik = tam.reduce((t, a) => t + a.yasKayip * a.s.kw, 0) / (tam.reduce((t, a) => t + a.s.kw, 0) || 1);
    const kart = (b, d, alt, renk) => `<div class="glass-card rounded-xl p-4"><div class="text-[11px] uppercase tracking-wider text-slate-400">${b}</div><div class="text-2xl font-bold mt-1 ${renk || 'text-white'}">${d}</div><div class="text-[11px] text-slate-500 mt-1">${alt}</div></div>`;
    const girdi = 'bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-200';
    const satirlar = tam.slice().sort((a, b) => {
      const x = sirala.k === 'ad' ? a.s.ad : sirala.k === 'yas' ? a.yas : sirala.k === 'pr0' ? a.pr0 : a.endeks, y = sirala.k === 'ad' ? b.s.ad : sirala.k === 'yas' ? b.yas : sirala.k === 'pr0' ? b.pr0 : b.endeks;
      return (typeof x === 'string' ? x.localeCompare(y, 'tr') : (x ?? 9) - (y ?? 9)) * sirala.y;
    });
    const bas = (k, t) => `<th class="px-3 py-2 text-${k === 'ad' ? 'left' : 'right'} cursor-pointer hover:text-white" onclick="Analiz.sirala('${k}')">${t}${sirala.k === k ? (sirala.y > 0 ? ' ▲' : ' ▼') : ''}</th>`;
    kok.innerHTML = `<div class="space-y-4">
      <section class="glass-card rounded-xl px-4 py-3 flex flex-wrap items-end gap-x-5 gap-y-3 text-xs">
        <label><span class="block text-[11px] text-slate-400 mb-1">Beklenen performans</span><select onchange="Analiz.ayar('mod', this.value)" class="${girdi}"><option value="kendi" ${p.mod === 'kendi' ? 'selected' : ''}>Santralin kendi başlangıcı</option><option value="sabit" ${p.mod === 'sabit' ? 'selected' : ''}>Sabit PR</option></select></label>
        <label class="${p.mod === 'sabit' ? '' : 'hidden'}"><span class="block text-[11px] text-slate-400 mb-1">Sabit PR (%)</span><input type="number" min="50" max="100" value="${p.prref}" onchange="Analiz.ayar('prref', this.value)" class="${girdi} w-20"></label>
        <label><span class="block text-[11px] text-slate-400 mb-1">Yıllık verim kaybı (%/yıl)</span><input type="number" step="0.1" min="0" max="3" value="${p.d}" onchange="Analiz.ayar('d', this.value)" class="${girdi} w-20"></label>
        <label><span class="block text-[11px] text-slate-400 mb-1">İnceleme dönemi</span><select onchange="Analiz.ayar('n', this.value)" class="${girdi}">${[1, 3, 6, 12].map((n) => `<option value="${n}" ${p.n === n ? 'selected' : ''}>Son ${n} ay</option>`).join('')}</select></label>
        <p class="text-[11px] text-slate-500 basis-full lg:basis-auto lg:max-w-md">Bulutlu/güneşli ayları ışınımla düzeltir; santralin yaşına göre beklenen üretimi azaltır. “Kendi başlangıç” sapmayı (arıza, kirlenme, bozulma) ölçer; “Sabit PR” tasarım düzeyini de sınar.</p></section>
      <section class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        ${kart(`Filo endeksi (son ${p.n} ay)`, yuzde(bT ? gT / bT : null), 'gerçek ÷ beklenen (ışınım düzeltmeli)', sinif(bT ? gT / bT : null)[0])}
        ${kart('Düşük performanslı santral', `${dusuk.length} <span class="text-sm font-medium text-slate-400">/ ${tam.length}</span>`, 'endeks %90 altı', dusuk.length ? 'text-red-400' : 'text-emerald-400')}
        ${kart('Beklenen altı üretim', tr0(kayipEnerji / 1000) + ' <span class="text-sm font-medium text-slate-400">MWh</span>', `son ${p.n} ay, yalnız açığı olan santraller`, 'text-amber-300')}
        ${kart('Yaşa bağlı filo kaybı', yuzde(yasAgirlik, 1), `kW ağırlıklı, %${p.d.toLocaleString('tr-TR')}/yıl varsayımıyla`)}</section>
      <section class="glass-card rounded-xl overflow-hidden"><div class="overflow-x-auto"><table class="w-full text-xs"><thead><tr class="text-slate-400 border-b border-slate-800">
        ${bas('ad', 'Santral')}${bas('yas', 'Yaş (yıl)')}<th class="px-3 py-2 text-right">kW</th>${bas('pr0', 'Başlangıç PR')}<th class="px-3 py-2 text-right">Gerçek (MWh)</th><th class="px-3 py-2 text-right">Beklenen (MWh)</th>${bas('endeks', 'Endeks')}<th class="px-3 py-2 text-right">Yaş kaybı</th><th class="px-3 py-2 text-left">Durum</th></tr></thead><tbody>
        ${satirlar.map((a) => { const [renk, ad] = sinif(a.endeks); return `<tr class="border-t border-slate-800/70 hover:bg-slate-800/50 cursor-pointer ${secili === a.s.id ? 'bg-slate-800/60' : ''}" onclick="Analiz.sec('${a.s.id}')">
          <td class="px-3 py-2 text-slate-200">${esc2(a.s.ad)}</td><td class="px-3 py-2 text-right font-mono">${tr1(a.yas)}</td><td class="px-3 py-2 text-right font-mono">${tr0(a.s.kw)}</td>
          <td class="px-3 py-2 text-right font-mono ${a.uyari ? 'text-amber-300' : ''}" title="${esc2(a.uyari)}">${yuzde(a.pr0)}${a.uyari ? ' ⚠' : ''}</td>
          <td class="px-3 py-2 text-right font-mono">${tr1(a.gercek / 1000)}</td><td class="px-3 py-2 text-right font-mono">${tr1(a.beklenen / 1000)}</td>
          <td class="px-3 py-2 text-right font-mono font-semibold ${renk}">${yuzde(a.endeks)}</td><td class="px-3 py-2 text-right font-mono text-slate-400">${yuzde(a.yasKayip, 1)}</td><td class="px-3 py-2 ${renk}">${ad}</td></tr>`; }).join('')}
        ${liste.filter((a) => !a.yeterli).map((a) => `<tr class="border-t border-slate-800/70 text-slate-500"><td class="px-3 py-2">${esc2(a.s.ad)}</td><td colspan="8" class="px-3 py-2">Yeterli veri yok (en az 8 ay gerekir)</td></tr>`).join('')}</tbody></table></div></section>
      <section id="analizDetay" class="${secili ? '' : 'hidden'} glass-card rounded-xl p-4"><div id="analizDetayBaslik" class="text-sm font-semibold text-white mb-3"></div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4"><div class="h-64"><canvas id="chAnalizUretim"></canvas></div><div class="h-64"><canvas id="chAnalizPr"></canvas></div></div></section>
      <p class="text-[11px] text-slate-500">Işınım ve sıcaklık: ${esc2(HAVA.kaynak || 'Open-Meteo')} • varsayım: ${HAVA.varsayim ? `${HAVA.varsayim.egim}° eğim, ${HAVA.varsayim.yon}` : '30° eğim, güney'} • güncelleme ${esc2(HAVA.guncelleme || '')}. Sıcaklık düzeltmesi kaba bir tahmindir; gerçek yön/eğim farkı ve gölgelenme “başlangıç PR”ına yansır.</p></div>`;
    if (secili) detay(secili, liste);
  }

  function detay(id, liste) {
    const a = (liste || []).find((x) => x.s.id === id && x.yeterli);
    if (!a || !window.Chart) return;
    const k = a.kayit.slice(-36), etiket = k.map((x) => ayAd(x.t));
    document.getElementById('analizDetayBaslik').textContent = `${a.s.ad} — son ${k.length} ay`;
    const yap = (idn, y) => { if (grafik[idn]) grafik[idn].destroy(); grafik[idn] = new Chart(document.getElementById(idn), y); };
    yap('chAnalizUretim', { type: 'bar', data: { labels: etiket, datasets: [
      { label: 'Gerçek (kWh)', data: k.map((x) => Math.round(x.u)), backgroundColor: '#fbbf24' },
      { type: 'line', label: 'Beklenen (kWh)', data: k.map((x) => Math.round(x.beklenen)), borderColor: '#10b981', borderDash: [5, 4], pointRadius: 0, tension: 0.3 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } } });
    yap('chAnalizPr', { type: 'line', data: { labels: etiket, datasets: [
      { label: 'Gerçek PR (sıcaklık düz.)', data: k.map((x) => +(x.prc * 100).toFixed(1)), borderColor: '#fbbf24', backgroundColor: '#fbbf24', pointRadius: 3, tension: 0.2 },
      { label: 'Beklenen PR', data: k.map((x) => +(x.prcB * 100).toFixed(1)), borderColor: '#10b981', borderDash: [5, 4], pointRadius: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { title: { display: true, text: 'PR (%)' } } } } });
  }

  async function ac() {
    if (!yuklendi) {
      yuklendi = true;
      try { const r = await fetch('data/hava.json?t=' + Date.now(), { cache: 'no-store' }); if (r.ok) HAVA = await r.json(); } catch (e) { HAVA = null; }
    }
    ciz();
  }

  window.Analiz = {
    ac,
    yenile() { if (yuklendi) ciz(); },
    ayar(k, v) { const p = oku(); p[k] = k === 'mod' ? v : parseFloat(v); yaz(p); ciz(); },
    sirala(k) { sirala = { k, y: sirala.k === k ? -sirala.y : 1 }; ciz(); },
    sec(id) { secili = secili === id ? null : id; ciz(); },
  };
  if ((location.hash || '').slice(1) === 'analiz') ac();
})();
