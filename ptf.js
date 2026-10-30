// Özet sayfası: elektrik piyasası — PTF (Gün Öncesi Piyasası Piyasa Takas Fiyatı, TL/MWh).
// Veri: data/ptf.json (collector/ptf_cek.py, workflow "PTF Çek", EPİAŞ Şeffaflık Platformu). Dosya yoksa kurulum yönergesi gösterilir.
(function () {
  const AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const grafik = {};
  let D = null, durum = 'yukleniyor';
  const tr0 = (n) => (n == null || isNaN(n) ? '—' : Math.round(n).toLocaleString('tr-TR'));
  const tr1 = (n) => (n == null || isNaN(n) ? '—' : n.toLocaleString('tr-TR', { maximumFractionDigits: 1, minimumFractionDigits: 1 }));
  const yuzde = (v) => (v == null || !isFinite(v) ? '—' : (v >= 0 ? '+' : '') + tr1(v * 100) + '%');
  const ort = (a) => (a.length ? a.reduce((t, v) => t + v, 0) / a.length : null);
  const gunTop = (d, n) => { const t = new Date(d + 'T12:00:00'); t.setDate(t.getDate() + n); return t.toISOString().slice(0, 10); };

  function cizGrafik(id, yapi) {
    const el = document.getElementById(id); if (!el || !window.Chart) return;
    if (grafik[id]) grafik[id].destroy();
    grafik[id] = new Chart(el, yapi);
  }

  function ozetHesapla() {
    const gunler = Object.keys(D.gunluk).sort(), son = gunler[gunler.length - 1];
    const al = (bas, bit) => gunler.filter((g) => g >= bas && g <= bit).map((g) => D.gunluk[g]);
    const son30 = al(gunTop(son, -29), son), onc30 = al(gunTop(son, -29 - 364), gunTop(son, -364));
    const ay = son.slice(0, 7), ayOrt = ort(gunler.filter((g) => g.startsWith(ay)).map((g) => D.gunluk[g]));
    const gecenAy = (Number(son.slice(0, 4)) - 1) + son.slice(4, 7);
    const gAyGunSayi = gunler.filter((g) => g.startsWith(ay)).length;
    const gecenAyOrt = ort(gunler.filter((g) => g.startsWith(gecenAy) && Number(g.slice(8)) <= Number(son.slice(8))).map((g) => D.gunluk[g]));
    // basit mevsimsel tahmin: önümüzdeki 30 gün = son 30 gün ort. × (geçen yıl aynı 30 gün / geçen yıl önceki 30 gün)
    const gy = al(gunTop(son, 1 - 364), gunTop(son, 30 - 364)), gyOnce = al(gunTop(son, -29 - 364), gunTop(son, -364));
    const oran = gy.length >= 25 && gyOnce.length >= 25 ? ort(gy) / ort(gyOnce) : null;
    const tahmin = oran && son30.length ? ort(son30) * oran : null;
    return { gunler, son, son30, onc30, ayOrt, gecenAyOrt, gAyGunSayi, tahmin, oran };
  }

  function gesDeger() {
    const v = window.Dash && Dash.veri && Dash.veri();
    if (!v || !v.PERF) return null;
    const yil = String(v.PERF.son_donem.yil), ay = v.PERF.son_donem.ay;
    let tl = 0, kwh = 0, eksik = 0;
    for (let i = 0; i < ay; i++) {
      const m = v.PERF.santraller.reduce((t, s) => t + ((s.aylik[yil] || [])[i] || 0), 0);
      const aylar = Object.keys(D.gunluk).filter((g) => g.startsWith(`${yil}-${String(i + 1).padStart(2, '0')}`)).map((g) => D.gunluk[g]);
      if (!aylar.length) { if (m) eksik += 1; continue; }
      tl += (m / 1000) * ort(aylar); kwh += m;
    }
    return { tl, kwh, ay, yil, eksik };
  }

  function ciz() {
    const kap = document.getElementById('ozetPtf'); if (!kap) return;
    if (durum === 'yok' || (!D && durum !== 'yukleniyor')) {
      kap.innerHTML = `<h3 class="text-sm font-semibold text-white flex items-center gap-2"><i data-lucide="trending-up" class="w-4 h-4 text-amber-400"></i> Elektrik piyasası (PTF)</h3>
        <p class="text-xs text-slate-400 mt-2">PTF verisi henüz yok. Kurulum: depo → <b>Settings → Secrets and variables → Actions</b> altına <code>EPIAS_USER</code> ve <code>EPIAS_PASS</code> ekleyin, sonra <b>Actions → PTF Çek → Run workflow</b> ile bir kez çalıştırın (ilk çalıştırma 2019'dan itibaren geçmişi doldurur). Sonra her gün otomatik güncellenir.</p>`;
      if (window.lucide) lucide.createIcons(); return;
    }
    if (!D) return;
    const o = ozetHesapla(), bugun = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' }), yarin = gunTop(bugun, 1);
    const sa = D.saatlik || {}, hedef = sa[yarin] ? yarin : sa[bugun] ? bugun : Object.keys(sa).sort().pop();
    const saat = hedef ? sa[hedef].filter((x) => x != null) : [];
    const mx = saat.length ? Math.max(...saat) : null, mn = saat.length ? Math.min(...saat) : null;
    const mxSaat = hedef ? sa[hedef].indexOf(mx) : -1, mnSaat = hedef ? sa[hedef].indexOf(mn) : -1;
    const d30 = o.onc30.length ? ort(o.son30) / ort(o.onc30) - 1 : null;
    const dAy = o.gecenAyOrt ? o.ayOrt / o.gecenAyOrt - 1 : null;
    const g = gesDeger();
    const kart = (b, v, alt, r) => `<div class="glass-card rounded-xl p-4 min-w-0"><div class="text-[11px] uppercase tracking-wider text-slate-400">${b}</div><div class="text-2xl font-bold mt-1 break-words ${r || 'text-white'}">${v}</div><div class="text-[11px] text-slate-500 mt-1">${alt}</div></div>`;
    const bir = (t) => `<span class="text-sm font-medium text-slate-400">${t}</span>`;
    const renk = (v) => (v == null ? 'text-slate-300' : v > 0.05 ? 'text-red-400' : v < -0.05 ? 'text-emerald-400' : 'text-slate-300');
    kap.innerHTML = `
      <h3 class="text-sm font-semibold text-white flex items-center gap-2"><i data-lucide="trending-up" class="w-4 h-4 text-amber-400"></i> Elektrik piyasası (PTF) <span class="text-[11px] font-normal text-slate-500">EPİAŞ Gün Öncesi Piyasası • güncelleme ${D.guncelleme || '—'}</span></h3>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
        ${kart(hedef === yarin ? 'Yarın ort. PTF' : hedef === bugun ? 'Bugün ort. PTF' : `Son saatlik gün (${hedef || '—'})`, saat.length ? `${tr0(ort(saat))} ${bir('TL/MWh')}` : '—', saat.length ? `en yüksek ${tr0(mx)} (${String(mxSaat).padStart(2, '0')}:00) • en düşük ${tr0(mn)} (${String(mnSaat).padStart(2, '0')}:00) • ${tr1(ort(saat) / 1000).replace('.', ',')} TL/kWh` : 'saatlik veri yok')}
        ${kart('Son 30 gün ort. PTF', `${tr0(ort(o.son30))} ${bir('TL/MWh')}`, `geçen yıl aynı dönem ${tr0(ort(o.onc30))} • <span class="font-semibold ${renk(d30)}">${yuzde(d30)}</span>`)}
        ${kart(`${AY[Number(o.son.slice(5, 7)) - 1]} ayı ort. (${o.gAyGunSayi}. gün)`, `${tr0(o.ayOrt)} ${bir('TL/MWh')}`, `geçen yıl aynı dönem ${tr0(o.gecenAyOrt)} • <span class="font-semibold ${renk(dAy)}">${yuzde(dAy)}</span>`)}
        ${kart('Önümüzdeki 30 gün tahmini', o.tahmin ? `${tr0(o.tahmin)} ${bir('TL/MWh')}` : '—', o.tahmin ? `<b>tahmindir:</b> son 30 gün ort. × geçen yılın mevsimsel oranı (${yuzde(o.oran - 1)}); piyasa koşulları bunu değiştirebilir` : 'tahmin için en az bir yıllık veri gerekir', 'text-amber-300')}
      </div>
      ${g ? `<p class="mt-3 text-xs text-slate-300 flex items-start gap-2"><i data-lucide="sun" class="w-4 h-4 text-amber-400 shrink-0 mt-0.5"></i><span><b>GES üretiminin PTF değeri (Oca–${AY[g.ay - 1]} ${g.yil}):</b> ${tr0(g.kwh / 1000)} MWh × aylık ort. PTF ≈ <b class="text-amber-300">${tr1(g.tl / 1e6)} milyon TL</b>${g.eksik ? ` <span class="text-slate-500">(${g.eksik} ay PTF verisi eksik)</span>` : ''}. Bu bir piyasa değeri göstergesidir; gerçek mahsuplaşma/fatura tutarı değildir.</span></p>` : ''}
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <div class="glass-card rounded-xl p-4 min-w-0"><h4 class="text-xs font-semibold text-slate-300 mb-2">Saatlik PTF (TL/MWh)</h4><div class="h-60 relative"><canvas id="chPtfSaat"></canvas></div></div>
        <div class="glass-card rounded-xl p-4 min-w-0"><h4 class="text-xs font-semibold text-slate-300 mb-2">Son 120 gün günlük ortalama ve 30 gün tahmin</h4><div class="h-60 relative"><canvas id="chPtfGun"></canvas></div></div>
        <div class="glass-card rounded-xl p-4 min-w-0"><h4 class="text-xs font-semibold text-slate-300 mb-2">Aylık ortalama PTF — yıllar</h4><div class="h-60 relative"><canvas id="chPtfAy"></canvas></div></div>
      </div>
      <p class="text-[11px] text-slate-500 mt-2">Kaynak: ${D.kaynak || 'EPİAŞ Şeffaflık Platformu'}. PTF, serbest tüketici faturasının yalnız enerji bileşenini etkiler; dağıtım bedeli, YEKDEM ve vergiler dahil değildir.</p>`;
    const yilRenk = { 2019: '#e2e8f0', 2020: '#cbd5e1', 2021: '#94a3b8', 2022: '#b9a7ee', 2023: '#7a5cc7', 2024: '#3f8fd2', 2025: '#211950', 2026: '#e0662c' };
    const ek = { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false } };
    // 1) saatlik: bugün ve yarın (varsa), yoksa son iki gün
    const sgun = Object.keys(sa).sort().slice(-2);
    cizGrafik('chPtfSaat', { type: 'line', data: { labels: Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0')), datasets: sgun.map((gn, i) => ({ label: gn, data: sa[gn], borderColor: i === sgun.length - 1 ? '#e0662c' : '#94a3b8', backgroundColor: i === sgun.length - 1 ? '#e0662c' : '#94a3b8', borderWidth: i === sgun.length - 1 ? 3 : 2, stepped: true, pointRadius: 0 })) },
      options: { ...ek, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${tr0(c.parsed.y)} TL/MWh` } } } } });
    // 2) günlük + tahmin
    const gs = o.gunler.slice(-120), tah = o.tahmin ? Array.from({ length: 30 }, (_, i) => gunTop(o.son, i + 1)) : [];
    cizGrafik('chPtfGun', { type: 'line', data: { labels: [...gs, ...tah].map((g) => g.slice(5)), datasets: [
      { label: 'Günlük ort.', data: [...gs.map((g) => D.gunluk[g]), ...tah.map(() => null)], borderColor: '#211950', borderWidth: 2, pointRadius: 0, tension: 0.2 },
      { label: 'Tahmin (30 gün ort.)', data: [...gs.map(() => null), ...tah.map(() => o.tahmin)], borderColor: '#e0662c', borderDash: [6, 4], borderWidth: 2.5, pointRadius: 0 }] },
    options: { ...ek, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${tr0(c.parsed.y)} TL/MWh` } } }, scales: { x: { ticks: { maxTicksLimit: 8 } } } } });
    // 3) aylık yıllar
    const yillar = [...new Set(o.gunler.map((g) => g.slice(0, 4)))].filter((y) => Number(y) >= Number(o.son.slice(0, 4)) - 3);
    cizGrafik('chPtfAy', { type: 'line', data: { labels: AY, datasets: yillar.map((y) => ({ label: y, data: AY.map((_, i) => { const a = o.gunler.filter((g) => g.startsWith(`${y}-${String(i + 1).padStart(2, '0')}`)).map((g) => D.gunluk[g]); return a.length ? ort(a) : null; }), borderColor: yilRenk[y] || '#94a3b8', backgroundColor: yilRenk[y] || '#94a3b8', borderWidth: y === o.son.slice(0, 4) ? 3 : 2, tension: 0.3, pointRadius: 0, spanGaps: false })) },
      options: { ...ek, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${tr0(c.parsed.y)} TL/MWh` } } } } });
    if (window.lucide) lucide.createIcons();
  }

  async function yukle() {
    try {
      const r = await fetch('data/ptf.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error('yok');
      D = await r.json(); durum = D && D.gunluk && Object.keys(D.gunluk).length ? 'hazir' : 'yok';
      if (durum === 'yok') D = null;
    } catch (e) { durum = 'yok'; D = null; }
    ciz();
  }
  window.Ptf = { ciz };
  yukle();
})();
