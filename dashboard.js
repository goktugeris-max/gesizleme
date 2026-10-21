/* Genel Bakış / Santraller / Arıza Takip sekmeleri.
 *
 * Veri: data/performans.json (Excel'den collector/excel_to_json.py ile üretilir)
 *       data/durum.json     (saatlik canlı veri; index.html içindeki loadLive() window.CANLI'ya yazar)
 * index.html içindeki norm() ve esc() yardımcılarını kullanır.
 */
(function () {
  const AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const AY_UZUN = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const SEKMELER = ['ozet', 'genel', 'santraller', 'elektrik', 'iso', 'canli', 'ariza'];

  const GES_ALT = ['genel', 'santraller', 'canli', 'ariza'];

  let PERF = null;
  let M = [];            // santral başına hesaplanan göstergeler
  const grafik = {};     // Chart.js örnekleri
  let sirala = { anahtar: 'verim', yon: 1 };

  // ---------- yardımcılar ----------
  const topla = (a) => (a || []).reduce((t, v) => t + (v || 0), 0);
  const tr0 = (n) => n == null || isNaN(n) ? '—' : Math.round(n).toLocaleString('tr-TR');
  const tr1 = (n) => n == null || isNaN(n) ? '—' : n.toLocaleString('tr-TR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const yuzde = (v) => v == null || isNaN(v) ? '—' : '%' + Math.round(v * 100);
  const fark = (v) => v == null || isNaN(v) ? '—' : (v >= 0 ? '+' : '') + Math.round(v * 100) + '%';
  const mwh = (kwh) => (kwh / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + ' MWh';

  function verimSinifi(v) {
    if (v == null) return { yazi: 'text-slate-500', dolgu: '#475569' };
    if (v >= 0.95) return { yazi: 'text-emerald-400', dolgu: '#10b981' };
    if (v >= 0.85) return { yazi: 'text-amber-300', dolgu: '#fcd34d' };
    if (v >= 0.70) return { yazi: 'text-orange-400', dolgu: '#fb923c' };
    return { yazi: 'text-red-400', dolgu: '#ef4444' };
  }

  // ---------- hesaplama ----------
  function hesapla() {
    const { yil, ay } = PERF.son_donem;
    M = PERF.santraller.map((s) => {
      const a = s.aylik[String(yil)] || [];
      const onceki = s.aylik[String(yil - 1)] || [];
      const uretim = topla(a.slice(0, ay));
      const beklenen = topla((s.beklenen_aylik || []).slice(0, ay));
      const sonUretim = a[ay - 1], sonBeklenen = (s.beklenen_aylik || [])[ay - 1];
      // Geçen yılla karşılaştırma yalnızca geçen yıl aynı dönemin tüm ayları doluysa anlamlı
      const oncekiTam = onceki.slice(0, ay).filter((v) => v > 0).length === ay;
      return {
        s, id: s.id, ad: s.ad, kw: s.kw,
        uretim, beklenen,
        verim: beklenen > 0 && uretim > 0 ? uretim / beklenen : null,
        degisim: oncekiTam && uretim > 0 ? uretim / topla(onceki.slice(0, ay)) - 1 : null,
        sonUretim, sonBeklenen,
        sonVerim: sonBeklenen > 0 && sonUretim != null ? sonUretim / sonBeklenen : null,
        ozgul: s.kw ? uretim / s.kw : null,
      };
    });
  }

  function canliBul(s) {
    const c = window.CANLI;
    if (!c || !s.canli) return null;
    return (c.santraller || []).find((x) => x.kaynak === s.canli.portal && norm(x.ad) === norm(s.canli.ad)) || null;
  }

  // ---------- Genel Bakış ----------
  function kartlar() {
    const { yil, ay } = PERF.son_donem;
    const kw = topla(M.map((m) => m.kw));
    const uretim = topla(M.map((m) => m.uretim));
    const beklenen = topla(M.map((m) => m.beklenen));
    const verim = beklenen ? uretim / beklenen : null;
    const sonU = topla(M.map((m) => m.sonUretim)), sonB = topla(M.map((m) => m.sonBeklenen));
    const onceki = topla(PERF.santraller.map((s) => (s.aylik[String(yil - 1)] || [])[ay - 1]));

    const canli = M.map((m) => canliBul(m.s)).filter(Boolean);
    const anlik = topla(canli.map((c) => c.anlik_kw)), bugun = topla(canli.map((c) => c.bugun_kwh));
    const sorunlu = canli.filter((c) => c.durum === 'Arızalı' || c.durum === 'Haberleşme Yok').length;
    const calisan = canli.filter((c) => c.durum === 'Çalışıyor').length;

    const kart = (baslik, deger, alt, renk) => `
      <div class="glass-card rounded-xl p-4">
        <div class="text-[11px] uppercase tracking-wider text-slate-400">${baslik}</div>
        <div class="text-2xl font-bold mt-1 ${renk || 'text-white'}">${deger}</div>
        <div class="text-[11px] text-slate-500 mt-1">${alt}</div>
      </div>`;
    document.getElementById('genelKartlar').innerHTML =
      kart('Kurulu güç', tr0(kw) + ' <span class="text-sm font-medium text-slate-400">kW</span>', `${PERF.santraller.length} santral devrede, ${PERF.planlanan.length} planlanan`) +
      kart(`${yil} üretimi (Oca–${AY[ay - 1]})`, mwh(uretim), `Beklenen ${mwh(beklenen)}`) +
      kart('Beklenene göre verim', yuzde(verim), `${yil} Ocak–${AY_UZUN[ay - 1]}`, verimSinifi(verim).yazi) +
      kart(`${AY_UZUN[ay - 1]} ayı`, mwh(sonU), `Verim ${yuzde(sonB ? sonU / sonB : null)} • geçen yıl ${fark(onceki ? sonU / onceki - 1 : null)}`, verimSinifi(sonB ? sonU / sonB : null).yazi) +
      kart('Canlı (şu an)', tr1(anlik) + ' <span class="text-sm font-medium text-slate-400">kW</span>',
        canli.length ? `Bugün ${tr0(bugun)} kWh • ${calisan} çalışıyor${sorunlu ? ` • <span class="text-red-400">${sorunlu} sorunlu</span>` : ''} • ${canli.length}/${M.length} santral canlı` : 'Canlı veri henüz yok');
  }

  // ---------- Özet (modül kartları) ----------
  function ozetCiz() {
    const { yil, ay } = PERF.son_donem;
    const kw = topla(M.map((m) => m.kw));
    const uretim = topla(M.map((m) => m.uretim)), beklenen = topla(M.map((m) => m.beklenen));
    const verim = beklenen ? uretim / beklenen : null;
    const canli = M.map((m) => canliBul(m.s)).filter(Boolean);
    const anlik = topla(canli.map((c) => c.anlik_kw));
    const sorunlu = canli.filter((c) => c.durum === 'Arızalı' || c.durum === 'Haberleşme Yok');
    const k = (e, d, r) => `<div><div class="text-[10px] uppercase tracking-wider text-slate-500">${e}</div><div class="text-lg font-bold ${r || 'text-white'}">${d}</div></div>`;
    document.getElementById('ozetGes').innerHTML =
      k('Kurulu güç', tr0(kw) + ' <span class="text-xs text-slate-400">kW</span>') +
      k('Anlık', canli.length ? tr1(anlik) + ' <span class="text-xs text-slate-400">kW</span>' : '—') +
      k(`${yil} üretimi`, mwh(uretim)) +
      k('Verim', yuzde(verim), verimSinifi(verim).yazi);
    const u = document.getElementById('ozetUyari');
    u.classList.toggle('hidden', !sorunlu.length);
    u.innerHTML = sorunlu.length ? `<a href="#canli" class="inline-flex items-center gap-2 text-xs font-semibold text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2"><i data-lucide="alert-triangle" class="w-4 h-4"></i> ${sorunlu.length} santralde sorun var: ${esc(sorunlu.slice(0, 3).map((c) => c.ad).join(', '))}${sorunlu.length > 3 ? '…' : ''}</a>` : '';
    lucide.createIcons();
  }

  function grafikOlustur(id, yapi) {
    if (grafik[id]) grafik[id].destroy();
    const el = document.getElementById(id);
    if (!el || !window.Chart) return;
    grafik[id] = new Chart(el, yapi);
  }

  function genelGrafikler() {
    const { yil, ay } = PERF.son_donem;
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.borderColor = 'rgba(148,163,184,.12)';
    Chart.defaults.font.family = 'Inter, sans-serif';

    // 1) Aylık toplam üretim: son 3 yıl + beklenen
    const yillar = [yil - 2, yil - 1, yil];
    const renk = { [yil - 2]: '#64748b', [yil - 1]: '#22d3ee', [yil]: '#fbbf24' };
    const aylikToplam = (y) => Array.from({ length: 12 }, (_, i) => {
      const dolu = PERF.santraller.filter((s) => (s.aylik[String(y)] || [])[i] != null);
      return dolu.length ? topla(dolu.map((s) => s.aylik[String(y)][i])) : null;
    });
    const sets = yillar.map((y) => ({ label: String(y), data: aylikToplam(y), borderColor: renk[y], backgroundColor: renk[y], borderWidth: y === yil ? 3 : 2, tension: 0.3, pointRadius: y === yil ? 3 : 0, spanGaps: false }));
    sets.push({ label: `Beklenen (${yil})`, data: Array.from({ length: 12 }, (_, i) => topla(PERF.santraller.map((s) => (s.beklenen_aylik || [])[i]))), borderColor: '#10b981', borderDash: [6, 4], borderWidth: 2, pointRadius: 0, tension: 0.3 });
    grafikOlustur('chAylik', {
      type: 'line', data: { labels: AY, datasets: sets },
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${tr0(c.parsed.y)} kWh` } } },
        scales: { y: { ticks: { callback: (v) => (v / 1000).toLocaleString('tr-TR') + ' MWh' } } } },
    });

    // 2) Yıllık toplam (resmi yıllık özet)
    const yilToplam = {};
    PERF.santraller.forEach((s) => Object.entries(s.yillik || {}).forEach(([y, v]) => { yilToplam[y] = (yilToplam[y] || 0) + v; }));
    const ys = Object.keys(yilToplam).sort();
    grafikOlustur('chYillik', {
      type: 'bar', data: { labels: ys.map((y) => (Number(y) === yil ? `${y} (Oca–${AY[ay - 1]})` : y)), datasets: [{ label: 'Üretim (kWh)', data: ys.map((y) => yilToplam[y]), backgroundColor: ys.map((y) => (Number(y) === yil ? '#fbbf24' : '#22d3ee')), borderRadius: 4 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${tr0(c.parsed.y)} kWh` } } },
        scales: { y: { ticks: { callback: (v) => (v / 1e6).toLocaleString('tr-TR') + ' GWh' } } } },
    });

    // 3) Verim sıralaması
    const sira = M.filter((m) => m.verim != null).sort((a, b) => a.verim - b.verim);
    document.getElementById('chVerimKap').style.height = Math.max(280, sira.length * 26 + 40) + 'px';
    grafikOlustur('chVerim', {
      type: 'bar', data: { labels: sira.map((m) => (m.ad.length > 26 ? m.ad.slice(0, 25) + '…' : m.ad)), datasets: [{ data: sira.map((m) => Math.round(m.verim * 100)), backgroundColor: sira.map((m) => verimSinifi(m.verim).dolgu), borderRadius: 3 }] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `Verim: %${c.parsed.x}` } } },
        scales: { x: { min: 0, suggestedMax: 130, ticks: { callback: (v) => '%' + v } } } },
    });
  }

  function dikkat() {
    const oge = [];
    M.forEach((m) => {
      if (m.verim != null && m.verim < 0.85) oge.push({ puan: 100 - m.verim * 100, m, metin: `${yuzde(m.verim)} verim (${tr0(m.uretim)} / ${tr0(m.beklenen)} kWh)`, etiket: 'Düşük verim', renk: verimSinifi(m.verim).yazi });
      if (m.sonVerim != null && m.sonVerim < 0.75 && !(m.verim != null && m.verim < 0.85)) oge.push({ puan: 60 - m.sonVerim * 60, m, metin: `${AY_UZUN[PERF.son_donem.ay - 1]} verimi ${yuzde(m.sonVerim)}`, etiket: 'Son ay düşük', renk: 'text-orange-400' });
      const c = canliBul(m.s);
      if (c && (c.durum === 'Arızalı' || c.durum === 'Haberleşme Yok')) oge.push({ puan: 200, m, metin: (c.invertorler || []).filter((i) => i.durum === 'Arızalı' || i.durum === 'Haberleşme Yok').map((i) => `${i.ad}: ${i.durum}`).join(' • ') || c.durum, etiket: 'Canlı: ' + c.durum, renk: 'text-red-400' });
    });
    (PERF.ariza ? PERF.ariza.satirlar : []).forEach((r) => {
      const m = M.find((x) => x.id === r.id);
      if (m && (r.hataya_dusme >= 3 || r.izleme_disi > 0 || r.uretimsiz_gun >= 3)) {
        oge.push({ puan: 40 + r.hataya_dusme * 5 + r.izleme_disi * 5, m, etiket: 'Arıza takip', renk: 'text-amber-300', metin: `${PERF.ariza.donem}: hataya düşme ${r.hataya_dusme}, izleme dışı ${r.izleme_disi}, üretimsiz gün ${r.uretimsiz_gun}` });
      }
    });
    oge.sort((a, b) => b.puan - a.puan);
    const kutu = document.getElementById('dikkatListe');
    kutu.innerHTML = oge.length ? oge.slice(0, 10).map((o) => `
      <button onclick="Dash.detay('${o.m.id}')" class="w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-800/70 transition">
        <span class="text-[11px] font-semibold ${o.renk} whitespace-nowrap mt-0.5">${esc(o.etiket)}</span>
        <span class="min-w-0"><span class="text-sm text-slate-100">${esc(o.m.ad)}</span><span class="block text-[11px] text-slate-500">${esc(o.metin)}</span></span>
      </button>`).join('') : '<p class="text-sm text-slate-500 px-3 py-6 text-center">Dikkat gerektiren bir santral yok.</p>';
  }

  // ---------- Santraller sekmesi ----------
  function durumRozeti(s) {
    const c = canliBul(s);
    if (!c) return '<span class="text-[11px] text-slate-600">—</span>';
    const renk = { 'Çalışıyor': 'text-emerald-400', 'Beklemede': 'text-sky-400', 'Haberleşme Yok': 'text-amber-400', 'Arızalı': 'text-red-400' }[c.durum] || 'text-slate-400';
    return `<span class="text-[11px] ${renk}">● ${esc(c.durum)}</span>`;
  }

  function tabloCiz() {
    const { yil, ay } = PERF.son_donem;
    const anahtarlar = { ad: (m) => m.ad, kw: (m) => m.kw, uretim: (m) => m.uretim, beklenen: (m) => m.beklenen, verim: (m) => m.verim, degisim: (m) => m.degisim, sonVerim: (m) => m.sonVerim, ozgul: (m) => m.ozgul };
    const f = anahtarlar[sirala.anahtar];
    const sirali = [...M].sort((a, b) => {
      const x = f(a), y = f(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (typeof x === 'string' ? x.localeCompare(y, 'tr') : x - y) * sirala.yon;
    });
    const baslik = (anahtar, metin, sag) => `<th onclick="Dash.sirala('${anahtar}')" class="px-3 py-3 cursor-pointer select-none hover:text-white ${sag ? 'text-right' : 'text-left'}">${metin}${sirala.anahtar === anahtar ? (sirala.yon === 1 ? ' ▲' : ' ▼') : ''}</th>`;
    document.getElementById('perfTablo').innerHTML = `
      <thead class="bg-slate-900/80 text-slate-400 uppercase tracking-wider text-[11px]"><tr>
        ${baslik('ad', 'Santral')}${baslik('kw', 'Güç (kW)', 1)}${baslik('uretim', `${yil} Oca–${AY[ay - 1]} (kWh)`, 1)}${baslik('beklenen', 'Beklenen (kWh)', 1)}
        ${baslik('verim', 'Verim', 1)}${baslik('degisim', 'Geçen yıl', 1)}${baslik('sonVerim', AY_UZUN[ay - 1], 1)}${baslik('ozgul', 'kWh/kW', 1)}
        <th class="px-3 py-3 text-left">Canlı</th>
      </tr></thead>
      <tbody class="divide-y divide-slate-800/70">${sirali.map((m) => {
        const v = verimSinifi(m.verim), sv = verimSinifi(m.sonVerim);
        return `<tr class="hover:bg-slate-800/40 cursor-pointer" onclick="Dash.detay('${m.id}')">
          <td class="px-3 py-2.5"><div class="font-medium text-slate-100">${esc(m.ad)}</div><div class="text-[11px] text-slate-500">${esc((m.s.inverter || '').split(',')[0])}</div></td>
          <td class="px-3 py-2.5 text-right font-mono">${tr0(m.kw)}</td>
          <td class="px-3 py-2.5 text-right font-mono">${tr0(m.uretim)}</td>
          <td class="px-3 py-2.5 text-right font-mono text-slate-400">${tr0(m.beklenen)}</td>
          <td class="px-3 py-2.5 text-right"><div class="inline-flex items-center gap-2"><div class="w-16 h-1.5 rounded bg-slate-800 overflow-hidden"><div class="h-full" style="width:${Math.min(100, (m.verim || 0) * 100)}%;background:${v.dolgu}"></div></div><span class="font-mono font-semibold ${v.yazi} w-10 text-right">${yuzde(m.verim)}</span></div></td>
          <td class="px-3 py-2.5 text-right font-mono ${m.degisim != null && m.degisim < -0.1 ? 'text-red-400' : 'text-slate-300'}">${fark(m.degisim)}</td>
          <td class="px-3 py-2.5 text-right font-mono ${sv.yazi}">${yuzde(m.sonVerim)}</td>
          <td class="px-3 py-2.5 text-right font-mono text-slate-300">${tr0(m.ozgul)}</td>
          <td class="px-3 py-2.5">${durumRozeti(m.s)}</td></tr>`;
      }).join('')}</tbody>`;

    const notlar = PERF.veri_notlari || [];
    document.getElementById('veriNotlari').innerHTML = notlar.length ? `
      <details class="glass-card rounded-xl p-4 text-xs text-slate-400">
        <summary class="cursor-pointer text-slate-300 font-medium">Excel'de tutarsız görünen ${notlar.length} kayıt (aylık toplam ile yıllık özet uyuşmuyor)</summary>
        <table class="mt-3 w-full"><thead class="text-slate-500"><tr><th class="text-left py-1">Santral</th><th class="text-left">Yıl</th><th class="text-right">Aylık toplam</th><th class="text-right">Özet sayfa</th><th class="text-right">Fark</th></tr></thead>
        <tbody>${notlar.map((n) => `<tr class="border-t border-slate-800"><td class="py-1">${esc(n.santral)}</td><td>${n.yil}</td><td class="text-right font-mono">${tr0(n.aylik_toplam)}</td><td class="text-right font-mono">${tr0(n.ozet_sayfa)}</td><td class="text-right font-mono ${Math.abs(n.fark_yuzde) > 10 ? 'text-red-400' : 'text-amber-300'}">${n.fark_yuzde > 0 ? '+' : ''}${n.fark_yuzde}%</td></tr>`).join('')}</tbody></table>
        <p class="mt-2">Grafiklerde aylık değerler, "Yıllık üretim" grafiğinde özet sayfadaki yıllık toplamlar kullanılır.</p>
      </details>` : '';
  }

  // ---------- Santral detayı ----------
  function detay(id) {
    const m = M.find((x) => x.id === id);
    if (!m) return;
    const s = m.s, { yil } = PERF.son_donem;
    const c = canliBul(s);
    const ariza = PERF.ariza && PERF.ariza.satirlar.find((r) => r.id === id);
    const yillar = Object.keys(s.aylik).sort().slice(-3);
    const palet = ['#64748b', '#22d3ee', '#fbbf24'];

    document.getElementById('detayBaslik').textContent = s.ad;
    document.getElementById('detayOzet').innerHTML = [
      ['Kurulu güç', tr0(s.kw) + ' kW'], ['Devreye alma', s.aktivasyon ? new Date(s.aktivasyon).toLocaleDateString('tr-TR') : '—'],
      ['Panel', s.panel_adet ? s.panel_adet + ' adet' : '—'], ['İnvertör', esc(s.inverter || '—') + (s.inverter_adet ? ` (${s.inverter_adet})` : '')],
      [`${yil} verimi`, `<span class="${verimSinifi(m.verim).yazi} font-semibold">${yuzde(m.verim)}</span>`], ['kWh/kW', tr0(m.ozgul)],
    ].map(([k, v]) => `<div class="rounded-lg bg-slate-900/70 border border-slate-800 px-3 py-2"><div class="text-[10px] uppercase tracking-wider text-slate-500">${k}</div><div class="text-sm text-slate-100 mt-0.5">${v}</div></div>`).join('');

    document.getElementById('detayCanli').innerHTML = c ? `
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        ${durumRozeti(s)}<span class="text-slate-400">Anlık <b class="text-slate-100">${tr1(c.anlik_kw)} kW</b></span><span class="text-slate-400">Bugün <b class="text-slate-100">${tr0(c.bugun_kwh)} kWh</b></span>
        ${(c.invertorler || []).length ? `<span class="text-slate-500">${c.invertorler.map((i) => esc(i.ad) + ': ' + esc(i.durum)).join(' • ')}</span>` : ''}
      </div>` : '<p class="text-xs text-slate-500">Bu santral için otomatik canlı veri yok (panelde elle takip edilir).</p>';

    document.getElementById('detayAriza').innerHTML = ariza && (ariza.hataya_dusme || ariza.bekleme || ariza.izleme_disi || ariza.uretimsiz_gun || ariza.neden)
      ? `<div class="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-slate-300"><b class="text-amber-300">${esc(PERF.ariza.donem)}:</b> hataya düşme ${ariza.hataya_dusme}, izleme dışı ${ariza.izleme_disi}, üretimsiz gün ${ariza.uretimsiz_gun}${ariza.tarih ? ` (${esc(ariza.tarih)})` : ''}${ariza.neden ? `<div class="mt-1 text-slate-400">${esc(ariza.neden)}</div>` : ''}</div>` : '';

    openModal('detayModal');
    const sets = yillar.map((y, i) => ({ label: y, data: s.aylik[y], borderColor: palet[3 - yillar.length + i], backgroundColor: palet[3 - yillar.length + i], borderWidth: Number(y) === yil ? 3 : 2, tension: 0.3, pointRadius: Number(y) === yil ? 3 : 0, spanGaps: false }));
    sets.push({ label: 'Beklenen', data: s.beklenen_aylik, borderColor: '#10b981', borderDash: [6, 4], borderWidth: 2, pointRadius: 0, tension: 0.3 });
    grafikOlustur('chDetay', {
      type: 'line', data: { labels: AY, datasets: sets },
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (x) => `${x.dataset.label}: ${tr0(x.parsed.y)} kWh` } } } },
    });
    const yi = Object.entries(s.yillik || {}).sort();
    document.getElementById('detayYillik').innerHTML = yi.length ? `<div class="flex flex-wrap gap-2">${yi.map(([y, v]) => `<div class="rounded-lg bg-slate-900/70 border border-slate-800 px-3 py-1.5 text-center"><div class="text-[10px] text-slate-500">${y}</div><div class="text-xs font-mono text-slate-200">${tr0(v)}</div></div>`).join('')}</div>` : '';
  }

  // ---------- Arıza takip ----------
  function arizaCiz() {
    const a = PERF.ariza;
    const kutu = document.getElementById('arizaIcerik');
    if (!a) { kutu.innerHTML = '<p class="text-sm text-slate-500">Arıza takip verisi yok.</p>'; return; }
    const t = (k) => topla(a.satirlar.map((r) => r[k]));
    const kart = (b, d, renk) => `<div class="glass-card rounded-xl p-4"><div class="text-[11px] uppercase tracking-wider text-slate-400">${b}</div><div class="text-2xl font-bold mt-1 ${renk}">${d}</div></div>`;
    const sirali = [...a.satirlar].sort((x, y) => (y.hataya_dusme + y.izleme_disi * 2 + y.uretimsiz_gun) - (x.hataya_dusme + x.izleme_disi * 2 + x.uretimsiz_gun));
    kutu.innerHTML = `
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        ${kart('Hataya düşme', t('hataya_dusme'), 'text-red-400')}${kart('Bekleme', t('bekleme'), 'text-sky-400')}
        ${kart('İzleme dışı', t('izleme_disi'), 'text-amber-300')}${kart('Üretimsiz gün', t('uretimsiz_gun'), 'text-orange-400')}
      </div>
      <div class="glass-card rounded-xl overflow-x-auto"><table class="w-full text-xs">
        <thead class="bg-slate-900/80 text-slate-400 uppercase tracking-wider text-[11px]"><tr><th class="text-left px-3 py-3">Santral</th><th class="px-3 text-right">Hataya düşme</th><th class="px-3 text-right">Bekleme</th><th class="px-3 text-right">İzleme dışı</th><th class="px-3 text-right">Üretimsiz gün</th><th class="px-3 text-left">Tarih</th><th class="px-3 text-left">Neden</th></tr></thead>
        <tbody class="divide-y divide-slate-800/70">${sirali.map((r) => `
          <tr class="${r.id ? 'hover:bg-slate-800/40 cursor-pointer' : ''}" ${r.id ? `onclick="Dash.detay('${r.id}')"` : ''}>
            <td class="px-3 py-2.5 font-medium text-slate-100">${esc(r.ad)}</td>
            <td class="px-3 py-2.5 text-right font-mono ${r.hataya_dusme ? 'text-red-400' : 'text-slate-600'}">${r.hataya_dusme || '—'}</td>
            <td class="px-3 py-2.5 text-right font-mono ${r.bekleme ? 'text-sky-400' : 'text-slate-600'}">${r.bekleme || '—'}</td>
            <td class="px-3 py-2.5 text-right font-mono ${r.izleme_disi ? 'text-amber-300' : 'text-slate-600'}">${r.izleme_disi || '—'}</td>
            <td class="px-3 py-2.5 text-right font-mono ${r.uretimsiz_gun ? 'text-orange-400' : 'text-slate-600'}">${r.uretimsiz_gun || '—'}</td>
            <td class="px-3 py-2.5 text-slate-400">${esc(r.tarih || '')}</td>
            <td class="px-3 py-2.5 text-slate-400 max-w-md">${esc(r.neden || '')}</td></tr>`).join('')}</tbody></table></div>
      <p class="text-[11px] text-slate-500 mt-2">Kaynak: Güneş Enerjisi Santralleri Arıza Takip Listesi — ${esc(a.donem || '')}</p>`;
  }

  // ---------- sekmeler ----------
  function sekmeGoster(ad) {
    if (!SEKMELER.includes(ad)) ad = 'ozet';
    SEKMELER.forEach((t) => {
      document.getElementById('tab-' + t).classList.toggle('hidden', t !== ad);
      const b = document.getElementById('nav-' + t);
      if (!b) return;
      const alt = GES_ALT.includes(t);
      b.className = (alt ? 'px-3 py-1.5 rounded-md text-xs font-medium transition ' : 'px-3.5 py-2 rounded-lg text-xs font-semibold transition ') +
        (t === ad ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30' : 'text-slate-400 hover:text-slate-200 border border-transparent');
    });
    const ges = GES_ALT.includes(ad);
    document.getElementById('nav-ges').className = 'px-3.5 py-2 rounded-lg text-xs font-semibold transition ' + (ges ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30' : 'text-slate-400 hover:text-slate-200 border border-transparent');
    document.getElementById('subNav').classList.toggle('hidden', !ges);
    document.getElementById('liveButtons').classList.toggle('hidden', ad !== 'canli');
    if (ad === 'elektrik' && window.Elek) Elek.ac();
    if (ad === 'iso' && window.Iso) Iso.ac();
    if (history.replaceState) history.replaceState(null, '', '#' + ad);
    // Grafikler gizli sekmede çizilirse boyutları bozulur; görünür olunca yeniden boyutla
    setTimeout(() => Object.values(grafik).forEach((g) => g && g.resize()), 50);
    window.scrollTo({ top: 0 });
  }

  function hepsiniCiz() {
    if (!PERF) return;
    kartlar(); dikkat(); tabloCiz(); arizaCiz(); ozetCiz();
    if (window.Chart) genelGrafikler();
    lucide.createIcons();
  }

  async function yukle() {
    sekmeGoster((location.hash || '#ozet').slice(1));
    try {
      const r = await fetch('data/performans.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      PERF = await r.json();
      hesapla();
      hepsiniCiz();
      const { yil, ay } = PERF.son_donem;
      document.getElementById('veriKaynak').textContent = `Üretim verisi: ${AY_UZUN[ay - 1]} ${yil} sonuna kadar (Excel). Canlı veri: GoodWe ve SMA santralleri, saatlik.`;
    } catch (e) {
      document.getElementById('genelKartlar').innerHTML = '<p class="col-span-full text-sm text-slate-400">Performans verisi yüklenemedi.</p>';
    }
  }

  window.Dash = {
    sekme: sekmeGoster,
    detay,
    sirala(k) { sirala = { anahtar: k, yon: sirala.anahtar === k ? -sirala.yon : (k === 'ad' ? 1 : -1) }; tabloCiz(); },
    canliGuncelle() { if (PERF) { kartlar(); dikkat(); tabloCiz(); ozetCiz(); } },
  };
  window.addEventListener('hashchange', () => sekmeGoster((location.hash || '#ozet').slice(1)));
  yukle();
})();
