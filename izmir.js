// Özet sayfası: İzmir kent elektrik tüketimi (EPİAŞ, herkese açık il verisi) + kurumun payı.
(function () {
  const AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const RENK = { mesken: '#3f8fd2', ticaret: '#211950', sanayi: '#e0662c', tarim: '#4f9d69', aydinlatma: '#f4b740', diger: '#94a3b8' };
  const tr0 = (n) => (n == null || isNaN(n) ? '—' : Math.round(n).toLocaleString('tr-TR'));
  const tr1 = (n) => n.toLocaleString('tr-TR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const yuzde = (v) => (v >= 0 ? '+' : '') + tr1(v * 100) + '%';
  const grafik = {};
  let D = null, K = null;

  const topla = (a, n) => (a || []).slice(0, n).reduce((t, v) => t + (v || 0), 0);
  const yilTop = (y, n) => Object.keys(D.gruplar).reduce((t, g) => t + topla(D.mwh[y][g], n), 0);

  function cizGrafik(id, yapi) {
    const el = document.getElementById(id); if (!el || !window.Chart) return;
    if (grafik[id]) grafik[id].destroy();
    grafik[id] = new Chart(el, yapi);
  }

  function ciz() {
    const kap = document.getElementById('ozetIzmir'); if (!kap || !D) return;
    const { yil, ay } = D.son_donem, onc = String(yil - 1);
    const donem = yilTop(String(yil), ay), onDonem = yilTop(onc, ay), d = onDonem ? donem / onDonem - 1 : null;
    const yillar = Object.keys(D.mwh).sort(), tamYil = yillar.filter((y) => D.mwh[y].toplam.every((v) => v != null));
    const son = tamYil[tamYil.length - 1], ilk = tamYil[0];
    const pay = (y, g) => topla(D.mwh[y][g], 12) / yilTop(y, 12);
    const kurumKwh = K && K.surdurulebilirlik_2025 ? K.surdurulebilirlik_2025.elektrik_sebeke_kwh : null;
    const kurumPay = kurumKwh && son === '2025' ? kurumKwh / 1000 / yilTop(son, 12) * 100 : null;
    const kart = (b, v, alt, r) => `<div class="glass-card rounded-xl p-4"><div class="text-[11px] uppercase tracking-wider text-slate-400">${b}</div><div class="text-2xl font-bold mt-1 ${r || 'text-white'}">${v}</div><div class="text-[11px] text-slate-500 mt-1">${alt}</div></div>`;
    kap.innerHTML = `
      <h3 class="text-sm font-semibold text-white flex items-center gap-2"><i data-lucide="map" class="w-4 h-4 text-sky-400"></i> İzmir kent elektrik görünümü <span class="text-[11px] font-normal text-slate-500">EPİAŞ il verisi • Oca–${AY[ay - 1]} ${yil}</span></h3>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
        ${kart(`İzmir tüketimi (Oca–${AY[ay - 1]} ${yil})`, `${tr1(donem / 1000)} <span class="text-sm font-medium text-slate-400">GWh</span>`, `Geçen yıl aynı dönem ${tr1(onDonem / 1000)} GWh • <span class="font-semibold ${d > 0.02 ? 'text-red-400' : d < -0.02 ? 'text-emerald-400' : 'text-slate-300'}">${yuzde(d)}</span>`)}
        ${kart(`${son} yıllık toplam`, `${tr1(yilTop(son, 12) / 1000)} <span class="text-sm font-medium text-slate-400">GWh</span>`, `${ilk}: ${tr1(yilTop(ilk, 12) / 1000)} GWh • ${yuzde(yilTop(son, 12) / yilTop(ilk, 12) - 1)}`)}
        ${kart('Mesken payı', `%${tr1(pay(son, 'mesken') * 100)}`, `${ilk}: %${tr1(pay(ilk, 'mesken') * 100)} • sanayi %${tr1(pay(son, 'sanayi') * 100)} (${ilk}: %${tr1(pay(ilk, 'sanayi') * 100)})`, 'text-sky-400')}
        ${kart('Kurumun kent içindeki payı', kurumPay != null ? `%${kurumPay.toLocaleString('tr-TR', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}` : '—', kurumPay != null ? `İzBB şebeke elektriği ${tr1(kurumKwh / 1e6)} GWh ÷ İzmir ${son} (${tr1(yilTop(son, 12) / 1000)} GWh)` : 'Kurum verisi yüklenemedi', 'text-emerald-400')}
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <div class="glass-card rounded-xl p-4"><h4 class="text-xs font-semibold text-slate-300 mb-2">Abone grubuna göre yıllık tüketim (GWh)</h4><div class="h-64"><canvas id="chIzYillik"></canvas></div></div>
        <div class="glass-card rounded-xl p-4"><h4 class="text-xs font-semibold text-slate-300 mb-2">Aylık toplam tüketim (GWh)</h4><div class="h-64"><canvas id="chIzAylik"></canvas></div></div>
      </div>
      <p class="text-[11px] text-slate-500 mt-2">Kaynak: ${D.kaynak}. ${yil} yalnız ${ay} ay. Mesken payı arttı, sanayi payı azaldı: kentin elektrik yükü evlere ve ticarete kayıyor. EPİAŞ'ın "oran %" sütunu aylar arasında karşılaştırılamadığı için kullanılmadı; yalnız MWh değerleri alındı.</p>`;
    const yilRenk = (y) => ({ 2019: '#cbd5e1', 2020: '#94a3b8', 2021: '#64748b', 2022: '#b9a7ee', 2023: '#7a5cc7', 2024: '#3f8fd2', 2025: '#211950', 2026: '#e0662c' }[y] || '#94a3b8');
    cizGrafik('chIzYillik', { type: 'bar', data: { labels: yillar.map((y) => (y === String(yil) && ay < 12 ? `${y} (${ay} ay)` : y)), datasets: Object.entries(D.gruplar).map(([g, ad]) => ({ label: ad, data: yillar.map((y) => topla(D.mwh[y][g], 12) / 1000), backgroundColor: RENK[g] })) },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${tr1(c.parsed.y)} GWh` } } }, scales: { x: { stacked: true }, y: { stacked: true } } } });
    cizGrafik('chIzAylik', { type: 'line', data: { labels: AY, datasets: yillar.filter((y) => Number(y) >= yil - 3).map((y) => ({ label: y, data: D.mwh[y].toplam.map((v) => (v == null ? null : v / 1000)), borderColor: yilRenk(Number(y)), backgroundColor: yilRenk(Number(y)), borderWidth: Number(y) === yil ? 3 : 2, tension: 0.3, pointRadius: 0, spanGaps: false })) },
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${tr1(c.parsed.y)} GWh` } } } } });
    if (window.lucide) lucide.createIcons();
  }

  async function yukle() {
    try {
      const [a, b] = await Promise.all([fetch('data/izmir_epias.json'), fetch('data/kaynak_raporu.json')]);
      D = await a.json(); try { K = await b.json(); } catch (e) { K = null; }
      ciz();
    } catch (e) { const k = document.getElementById('ozetIzmir'); if (k) k.innerHTML = ''; }
  }
  window.Izmir = { ciz };
  yukle();
})();
