/* Elektrik sekmesi: belediye elektrik tüketimi ve GES katkısı.
 *
 * Veri: data/elektrik.json (Excel'den collector/elektrik_to_json.py ile üretilir; abone/adres/TL içermez)
 * Tanım (Excel'deki formülle aynı):
 *   Gerçek tüketim = Faturalı tüketim (genel aydınlatma hariç) + genel aydınlatmadan gelen %20 pay
 *                    − müstecir noktalara verilen − üretim fazlası + GES net üretim
 * dashboard.js sekme açılınca Elek.ac() çağırır. index.html'deki esc() kullanılır.
 */
(function () {
  const AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const AY_UZUN = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const YIL_RENK = { 2023: '#64748b', 2024: '#a78bfa', 2025: '#22d3ee', 2026: '#fbbf24' };

  let E = null, yuklendi = false, cizildi = false, secim = 'gercek';
  const grafik = {};

  const topla = (a, n) => (a || []).slice(0, n == null ? 12 : n).reduce((t, v) => t + (v || 0), 0);
  const gwh = (kwh) => (kwh / 1e6).toLocaleString('tr-TR', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  const tr0 = (n) => (n == null || isNaN(n) ? '—' : Math.round(n).toLocaleString('tr-TR'));
  const yuzde = (v, ondalik) => (v == null || isNaN(v) ? '—' : '%' + (v * 100).toLocaleString('tr-TR', { maximumFractionDigits: ondalik || 0, minimumFractionDigits: ondalik || 0 }));
  const fark = (v) => (v == null || isNaN(v) ? '—' : (v >= 0 ? '+' : '') + (v * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + '%');
  const yilSayi = () => Object.keys(E.aylik).map(Number).sort();

  function cizGrafik(id, yapi) {
    if (grafik[id]) grafik[id].destroy();
    const el = document.getElementById(id);
    if (el && window.Chart) grafik[id] = new Chart(el, yapi);
  }

  // ---------- gösterge kartları ----------
  function kartlar() {
    const { yil, ay } = E.son_donem;
    const A = E.aylik[String(yil)], O = E.aylik[String(yil - 1)];
    const fat = topla(A.faturali, ay), ofat = topla(O.faturali, ay);
    const ger = topla(A.gercek, ay), oger = topla(O.gercek, ay);
    const ges = topla(A.ges_net, ay), oges = topla(O.ges_net, ay);
    const fazla = topla(A.fazla, ay);
    const pay = ger ? ges / ger : null, opay = oger ? oges / oger : null;
    const aboneler = (E.abone_sayisi[String(yil)] || [])[ay - 1];
    const donem = `Oca–${AY[ay - 1]} ${yil}`;
    const kart = (b, d, alt, renk) => `<div class="glass-card rounded-xl p-4"><div class="text-[11px] uppercase tracking-wider text-slate-400">${b}</div><div class="text-2xl font-bold mt-1 ${renk || 'text-white'}">${d}</div><div class="text-[11px] text-slate-500 mt-1">${alt}</div></div>`;
    const degisim = (a, b) => (b ? fark(a / b - 1) : '—');
    document.getElementById('elKartlar').innerHTML =
      kart(`Faturalı tüketim (${donem})`, gwh(fat) + ' <span class="text-sm font-medium text-slate-400">GWh</span>', `Geçen yıl aynı dönem ${degisim(fat, ofat)} • ${tr0(aboneler)} abone`) +
      kart('Gerçek tüketim', gwh(ger) + ' <span class="text-sm font-medium text-slate-400">GWh</span>', `Geçen yıl aynı dönem ${degisim(ger, oger)}`) +
      kart('GES net üretimi', gwh(ges) + ' <span class="text-sm font-medium text-slate-400">GWh</span>', `Geçen yıl aynı dönem ${degisim(ges, oges)}`, 'text-amber-300') +
      kart('GES\'in tüketimdeki payı', yuzde(pay, 1), `Geçen yıl aynı dönem ${yuzde(opay, 1)}`, 'text-emerald-400') +
      kart('Üretim fazlası', tr0(fazla / 1000) + ' <span class="text-sm font-medium text-slate-400">MWh</span>', `GES üretiminin ${yuzde(ges ? fazla / ges : null, 1)}'i şebekeye verildi`);
  }

  // ---------- grafikler ----------
  function aylikGrafik() {
    const anahtar = secim;
    const setler = yilSayi().map((y) => ({
      label: String(y), data: E.aylik[String(y)][anahtar], borderColor: YIL_RENK[y] || '#94a3b8', backgroundColor: YIL_RENK[y] || '#94a3b8',
      borderWidth: y === E.son_donem.yil ? 3 : 2, tension: 0.3, pointRadius: y === E.son_donem.yil ? 3 : 0, spanGaps: false,
    }));
    cizGrafik('chElAylik', {
      type: 'line', data: { labels: AY, datasets: setler },
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${tr0(c.parsed.y)} kWh` } } },
        scales: { y: { ticks: { callback: (v) => (v / 1e6).toLocaleString('tr-TR') + ' GWh' } } } },
    });
    document.querySelectorAll('[data-elsecim]').forEach((b) => {
      b.className = 'px-2.5 py-1 rounded-md text-[11px] font-semibold ' + (b.dataset.elsecim === secim ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-slate-200');
    });
  }

  function gesGrafik() {
    const etiket = [], ges = [], pay = [];
    yilSayi().forEach((y) => {
      const A = E.aylik[String(y)];
      for (let i = 0; i < 12; i++) {
        if (A.gercek[i] == null) continue;
        etiket.push(`${AY[i]} ${String(y).slice(2)}`);
        ges.push(A.ges_net[i]);
        pay.push(A.gercek[i] ? Math.round((A.ges_net[i] / A.gercek[i]) * 1000) / 10 : null);
      }
    });
    cizGrafik('chElGes', {
      data: { labels: etiket, datasets: [
        { type: 'bar', label: 'GES net üretim (kWh)', data: ges, backgroundColor: '#fbbf24', borderRadius: 3, yAxisID: 'y', order: 2 },
        { type: 'line', label: 'Tüketimdeki pay (%)', data: pay, borderColor: '#10b981', backgroundColor: '#10b981', borderWidth: 2, tension: 0.3, pointRadius: 0, yAxisID: 'y1', order: 1 },
      ] },
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom' } },
        scales: { y: { position: 'left', ticks: { callback: (v) => (v / 1000).toLocaleString('tr-TR') + ' MWh' } },
                  y1: { position: 'right', grid: { drawOnChartArea: false }, min: 0, ticks: { callback: (v) => v + '%' } },
                  x: { ticks: { maxTicksLimit: 14 } } } },
    });
  }

  // ---------- daire başkanlıkları ----------
  function dbTablosu() {
    const { yil, ay } = E.son_donem;
    const satirlar = Object.entries(E.db).map(([ad, y]) => ({
      ad, simdi: topla(y[String(yil)], ay), onceki: topla(y[String(yil - 1)], ay),
    })).filter((r) => r.simdi > 0 || r.onceki > 0).sort((a, b) => b.simdi - a.simdi);
    const toplam = satirlar.reduce((t, r) => t + r.simdi, 0);
    const ilk = satirlar.slice(0, 15);
    cizGrafik('chElDb', {
      type: 'bar', data: { labels: ilk.map((r) => (r.ad.length > 30 ? r.ad.slice(0, 29) + '…' : r.ad)), datasets: [
        { label: `${yil} Oca–${AY[ay - 1]}`, data: ilk.map((r) => r.simdi), backgroundColor: '#fbbf24', borderRadius: 3 },
        { label: `${yil - 1} aynı dönem`, data: ilk.map((r) => r.onceki), backgroundColor: '#22d3ee66', borderRadius: 3 },
      ] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${tr0(c.parsed.x)} kWh` } } },
        scales: { x: { ticks: { callback: (v) => (v / 1e6).toLocaleString('tr-TR') + ' GWh' } } } },
    });
    document.getElementById('elDbTablo').innerHTML = `
      <thead class="bg-slate-900/80 text-slate-400 uppercase tracking-wider text-[11px]"><tr><th class="text-left px-3 py-3">Daire başkanlığı</th><th class="px-3 text-right">${yil} Oca–${AY[ay - 1]} (kWh)</th><th class="px-3 text-right">${yil - 1} aynı dönem</th><th class="px-3 text-right">Değişim</th><th class="px-3 text-right">Pay</th></tr></thead>
      <tbody class="divide-y divide-slate-800/70">${satirlar.map((r) => {
        const d = r.onceki > 0 ? r.simdi / r.onceki - 1 : null;
        return `<tr><td class="px-3 py-2 text-slate-100">${esc(r.ad)}</td><td class="px-3 py-2 text-right font-mono">${tr0(r.simdi)}</td><td class="px-3 py-2 text-right font-mono text-slate-400">${tr0(r.onceki)}</td>
          <td class="px-3 py-2 text-right font-mono ${d != null && d > 0.1 ? 'text-red-400' : d != null && d < -0.1 ? 'text-emerald-400' : 'text-slate-300'}">${fark(d)}</td>
          <td class="px-3 py-2 text-right font-mono text-slate-400">${yuzde(toplam ? r.simdi / toplam : null, 1)}</td></tr>`;
      }).join('')}</tbody>`;
  }

  function dagilim(id, veri, baslik) {
    const { yil, ay } = E.son_donem;
    const satir = Object.entries(veri).map(([ad, y]) => [ad, topla(y[String(yil)], ay)]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const renk = ['#fbbf24', '#22d3ee', '#a78bfa', '#10b981', '#fb923c', '#94a3b8'];
    cizGrafik(id, {
      type: 'doughnut', data: { labels: satir.map(([a]) => a), datasets: [{ data: satir.map(([, v]) => v), backgroundColor: satir.map((_, i) => renk[i % renk.length]), borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'bottom' },
        tooltip: { callbacks: { label: (c) => { const t = satir.reduce((s, [, v]) => s + v, 0); return `${c.label}: ${tr0(c.parsed)} kWh (%${(c.parsed / t * 100).toFixed(1)})`; } } } } },
    });
  }

  // ---------- yıllık özet ----------
  function yillikTablo() {
    const { yil, ay } = E.son_donem;
    const satirlar = yilSayi().map((y) => {
      const A = E.aylik[String(y)];
      const n = y === yil ? ay : 12;
      const fat = topla(A.faturali, n), ger = topla(A.gercek, n), ges = topla(A.ges_net, n);
      return { y, n, fat, ger, ges, fazla: topla(A.fazla, n), pay: ger ? ges / ger : null };
    });
    document.getElementById('elYillik').innerHTML = `
      <thead class="bg-slate-900/80 text-slate-400 uppercase tracking-wider text-[11px]"><tr><th class="text-left px-3 py-3">Yıl</th><th class="px-3 text-right">Faturalı tüketim (kWh)</th><th class="px-3 text-right">Gerçek tüketim (kWh)</th><th class="px-3 text-right">GES net üretim (kWh)</th><th class="px-3 text-right">Üretim fazlası (kWh)</th><th class="px-3 text-right">GES payı</th></tr></thead>
      <tbody class="divide-y divide-slate-800/70">${satirlar.map((r) => `<tr><td class="px-3 py-2 font-medium text-slate-100">${r.y}${r.n < 12 ? ` <span class="text-[11px] text-slate-500">(Oca–${AY[r.n - 1]})</span>` : ''}</td>
        <td class="px-3 py-2 text-right font-mono">${tr0(r.fat)}</td><td class="px-3 py-2 text-right font-mono">${tr0(r.ger)}</td><td class="px-3 py-2 text-right font-mono text-amber-300">${tr0(r.ges)}</td>
        <td class="px-3 py-2 text-right font-mono text-slate-400">${tr0(r.fazla)}</td><td class="px-3 py-2 text-right font-mono text-emerald-400">${yuzde(r.pay, 1)}</td></tr>`).join('')}</tbody>`;
  }

  function notlar() {
    const n = E.veri_notlari || [];
    document.getElementById('elNotlar').innerHTML = n.length ? `
      <details class="glass-card rounded-xl p-4 text-xs text-slate-400">
        <summary class="cursor-pointer text-slate-300 font-medium">Excel'de tutarsız görünen ${n.length} kayıt</summary>
        <ul class="mt-2 list-disc pl-5 space-y-1">${n.map((x) => `<li>${x.yil} ${esc(x.ay)}: ${x.sonuc_sayfasi != null ? `"Sonuç" sayfasında faturalı tüketim ${tr0(x.sonuc_sayfasi)} kWh, "Yıllık Durum" sayfasında ${tr0(x.yillik_durum)} kWh (fark ${tr0(x.fark)} kWh)` : `ham veri toplamı ${tr0(x.ham_veri_toplami)} kWh, "Yıllık Durum" ${tr0(x.yillik_durum)} kWh`}.</li>`).join('')}</ul>
        <p class="mt-2">Sayfada "Yıllık Durum" (ham veriyle uyumlu) değerleri kullanılır.</p>
      </details>` : '';
  }

  function ciz() {
    kartlar(); aylikGrafik(); gesGrafik(); dbTablosu();
    dagilim('chElTarife', E.tarife);
    dagilim('chElTedarikci', E.tedarikci);
    yillikTablo(); notlar();
    const { yil, ay } = E.son_donem;
    document.getElementById('elKaynak').textContent = `Veri: ${AY_UZUN[ay - 1]} ${yil} sonuna kadar (Excel, abone bazında toplanmış). Abone numarası, adres ve fatura tutarı yayınlanmaz.`;
    cizildi = true;
  }

  // Genel Bakış sekmesindeki tek satırlık özet
  function ozetSerit() {
    const el = document.getElementById('genelElektrik');
    if (!el || !E) return;
    const { yil, ay } = E.son_donem;
    const A = E.aylik[String(yil)];
    const ges = topla(A.ges_net, ay), ger = topla(A.gercek, ay);
    if (!ger) return;
    el.innerHTML = `<span class="flex items-center gap-1.5 text-amber-300"><i data-lucide="zap" class="w-4 h-4"></i> Elektrik</span>
      <span>${yil} Oca–${AY[ay - 1]}: belediye gerçek tüketimi <b class="text-white">${gwh(ger)} GWh</b></span>
      <span>GES net üretimi <b class="text-amber-300">${gwh(ges)} GWh</b></span>
      <span>GES payı <b class="text-emerald-400">${yuzde(ges / ger, 1)}</b></span>
      <span class="ml-auto text-slate-500">Ayrıntı →</span>`;
    el.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  }

  async function yukle() {
    try {
      const r = await fetch('data/elektrik.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      E = await r.json();
      yuklendi = true;
      ozetSerit();
    } catch (e) {
      document.getElementById('elKartlar').innerHTML = '<p class="col-span-full text-sm text-slate-400">Elektrik verisi yüklenemedi.</p>';
    }
  }

  window.Elek = {
    async ac() {
      if (!yuklendi) await yukle();
      if (!yuklendi) return;
      if (!cizildi) ciz();
      setTimeout(() => Object.values(grafik).forEach((g) => g && g.resize()), 50);
    },
    sec(k) { secim = k; if (yuklendi) aylikGrafik(); },
  };
  // Sayfa doğrudan #elektrik ile açıldıysa (dashboard.js bu dosyadan önce çalışır) kendini başlat;
  // aksi halde yalnızca Genel Bakış özeti için veriyi yükle
  if ((location.hash || '').slice(1) === 'elektrik') window.Elek.ac(); else yukle();
})();
