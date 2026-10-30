/* Su & Akaryakıt sekmesi (Elektrikli araç dahil): kurumsal su ve enerji kaynakları yönetimi raporundaki kurum geneli veriler.
 *
 * Veri: data/kaynak_raporu.json (rapordan elle girilen KURUM TOPLAMLARI; abone/araç ayrıntısı yok → şifresiz).
 * Hesaplar: dönem karşılaştırması, yıl sonu tahmini (geçen yıl toplamı × dönem oranı), su azaltım hedefi takibi,
 * tasarruf eğilimi uyarısı, araç başına motorin. Özet sayfasına Dash.ozetKaydet('kaynak', …) ile kart/uyarı verir.
 */
(function () {
  const AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const tr0 = (n) => (n == null || isNaN(n) ? '—' : Math.round(n).toLocaleString('tr-TR'));
  const fark = (v) => (v == null || !isFinite(v) ? '—' : (v >= 0 ? '+' : '') + (v * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + '%');
  const topla = (a, n) => (a || []).slice(0, n == null ? 12 : n).reduce((t, v) => t + (v || 0), 0);
  const renkFark = (v, tersIyi) => (v == null || !isFinite(v) ? 'text-slate-400' : (tersIyi ? v < -0.02 : v > 0.02) ? 'text-emerald-400' : (tersIyi ? v > 0.02 : v < -0.02) ? 'text-red-400' : 'text-slate-300');
  let K = null, cizildi = false;
  const grafik = {};

  function cizGrafik(id, yapi) {
    if (grafik[id]) grafik[id].destroy();
    const el = document.getElementById(id);
    if (el && window.Chart) grafik[id] = new Chart(el, yapi);
  }
  const kart = (b, v, alt, renk) => `<div class="glass-card p-4"><div class="text-[11px] text-slate-400">${b}</div><div class="text-2xl font-bold mt-1 ${renk || 'text-white'}">${v}</div><div class="text-[11px] text-slate-500 mt-1">${alt}</div></div>`;

  // ---------- hesaplar ----------
  function hesapla() {
    const na = K.son_ay, su = K.su, A = su.aylik, n = su.son_ay || K.son_ay;   // n: su son ayı (Eylül), na: akaryakıt son ayı (Haziran)
    const yil = Math.max(...Object.keys(A).map(Number)), on = yil - 1;
    const c = topla(A[yil], n), p = topla(A[on], n), onTop = topla(A[on]);
    const aylikFark = A[yil].map((v, i) => (v != null && A[on][i] ? v / A[on][i] - 1 : null));
    const tahmin = p ? (c / p) * onTop : null;
    const hedefTop = onTop * (1 - su.hedef.azaltim);
    const m = K.akaryakit.motorin_lt;
    const arac = K.akaryakit.arac_sayisi;
    return { n, na, yil, on, c, p, onTop, aylikFark, tahmin, hedefTop, m, arac,
      motorinFark: m.h1_2025 ? m.h1_2026 / m.h1_2025 - 1 : null,
      aracBasi26: m.h1_2026 / arac['2026'], aracBasi25: m.h1_2025 / arac['2025'] };
  }

  function uyarilar(H) {
    const u = [];
    // su: son ayın tasarruf farkı önceki ayların ortalamasından belirgin zayıfsa
    const f = H.aylikFark.slice(0, H.n).filter((x) => x != null);
    if (f.length >= 3) {
      const son = f[f.length - 1], onceki = f.slice(0, -1).reduce((t, x) => t + x, 0) / (f.length - 1);
      if (son - onceki >= 0.25) u.push({ modul: 'Su', etiket: 'Tasarruf eğilimi zayıflıyor', metin: `${AY[H.n - 1]} ayında geçen yıla göre fark ${fark(son)}; önceki ayların ortalaması ${fark(onceki)}. Yaz aylarında tüketim artarken azaltım hedefi için saha takibi gözden geçirilmeli.`, renk: 'text-amber-300', href: '#kaynak', puan: 50 });
    }
    if (H.tahmin != null && H.tahmin > H.hedefTop) u.push({ modul: 'Su', etiket: 'Yıl sonu hedefi risk altında', metin: `Yıl sonu tahmini ${tr0(H.tahmin)} m³, %${K.su.hedef.azaltim * 100} azaltım hedefi için üst sınır ${tr0(H.hedefTop)} m³.`, renk: 'text-red-400', href: '#kaynak', puan: 60 });
    if (H.motorinFark != null && H.motorinFark >= 0.1) u.push({ modul: 'Akaryakıt', etiket: 'Motorin artışı', metin: `${H.yil} ilk ${H.na} ay ${tr0(H.m.h1_2026)} lt (${fark(H.motorinFark)}); araç sayısı yalnızca ${fark(H.arac['2026'] / H.arac['2025'] - 1)} arttı, araç başına ${fark(H.aracBasi26 / H.aracBasi25 - 1)}.`, renk: 'text-red-400', href: '#kaynak', puan: 70 });
    return u;
  }

  function ozetKayit(H) {
    if (!window.Dash || !Dash.ozetKaydet) return;
    Dash.ozetKaydet('kaynak', {
      kart: `<div class="grid grid-cols-2 gap-3 text-xs text-slate-500">
        <div><div class="text-[11px] text-slate-500">Su Oca–${AY[H.n - 1]}</div><div class="text-lg font-bold text-white">${tr0(H.c / 1000)} <span class="text-xs text-slate-400">bin m³</span></div><div class="text-[11px] ${renkFark(H.p ? H.c / H.p - 1 : null, true)}">${fark(H.p ? H.c / H.p - 1 : null)}</div></div>
        <div><div class="text-[11px] text-slate-500">Motorin (Oca–${AY[H.na - 1]})</div><div class="text-lg font-bold text-white">${(H.m.h1_2026 / 1e6).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} <span class="text-xs text-slate-400">milyon lt</span></div><div class="text-[11px] ${renkFark(H.motorinFark, true)}">${fark(H.motorinFark)}</div></div></div>`,
      uyarilar: uyarilar(H),
    });
  }

  // ---------- sayfa ----------
  function ciz() {
    const H = hesapla(), su = K.su, ak = K.akaryakit, em = K.emisyon_h1, sp = K.surdurulebilirlik_2025;
    const spYakitGj = sp ? sp.yakitlar.reduce((t, y) => t + y.gj, 0) : 0;
    const suKart = [
      kart(`Su (Oca–${AY[H.n - 1]} ${H.yil})`, `${tr0(H.c)} <span class="text-sm font-medium text-slate-400">m³</span>`, `Geçen yıl aynı dönem ${tr0(H.p)} m³ • <span class="${renkFark(H.p ? H.c / H.p - 1 : null, true)} font-semibold">${fark(H.p ? H.c / H.p - 1 : null)}</span>`),
      kart('Yıl sonu tahmini', `${tr0(H.tahmin)} <span class="text-sm font-medium text-slate-400">m³</span>`, `${H.on} yılı ${tr0(H.onTop)} m³ • dönem oranıyla`, H.tahmin > H.hedefTop ? 'text-red-400' : 'text-emerald-400'),
      kart(`Hedef (%${su.hedef.azaltim * 100} azaltım)`, `${tr0(H.hedefTop)} <span class="text-sm font-medium text-slate-400">m³ üst sınır</span>`, su.hedef.metin),
      kart('Elektrik tasarrufu', '1,80 <span class="text-sm font-medium text-slate-400">MWh</span>', 'Su çıkarma, iletim ve arıtımda (rapor)'),
    ].join('');
    const yakitKart = [
      kart(`Motorin (Oca–${AY[H.na - 1]} ${H.yil})`, `${tr0(H.m.h1_2026)} <span class="text-sm font-medium text-slate-400">lt</span>`, `Geçen yıl aynı dönem ${tr0(H.m.h1_2025)} lt • <span class="${renkFark(H.motorinFark, true)} font-semibold">${fark(H.motorinFark)}</span>`),
      kart('Araç sayısı', `${tr0(H.arac['2026'])}`, `${H.on === 2025 ? '2025: ' + tr0(H.arac['2025']) + ' • 2024: ' + tr0(H.arac['2024']) : ''}`),
      kart('Araç başına motorin (dönem)', `${tr0(H.aracBasi26)} <span class="text-sm font-medium text-slate-400">lt</span>`, `Geçen yıl ${tr0(H.aracBasi25)} lt (2025 yıl sonu araç sayısıyla) • ${fark(H.aracBasi26 / H.aracBasi25 - 1)}`),
      kart('Dökme (tanker) payı', `%${(ak.dokme_orani.h1_2026 * 100).toLocaleString('tr-TR')}`, `2024: %${(ak.dokme_orani['2024'] * 100).toLocaleString('tr-TR')} • 2025: %${(ak.dokme_orani['2025'] * 100).toLocaleString('tr-TR')}`, 'text-amber-300'),
    ].join('');
    const yakitSatir = (ad, birim, o) => `<tr><td class="px-3 py-2 text-slate-100">${ad}</td><td class="px-3 py-2 text-slate-400">${birim}</td><td class="px-3 py-2 text-right font-mono">${tr0(o['2024'])}</td><td class="px-3 py-2 text-right font-mono">${tr0(o['2025'])}</td><td class="px-3 py-2 text-right font-mono">${o.h1_2025 != null ? tr0(o.h1_2025) : '—'}</td><td class="px-3 py-2 text-right font-mono">${tr0(o.h1_2026)}</td><td class="px-3 py-2 text-right font-mono ${renkFark(o['2025'] ? o['2025'] / o['2024'] - 1 : null, true)}">${fark(o['2024'] ? o['2025'] / o['2024'] - 1 : null)}</td></tr>`;
    const emTop = (y) => Object.values(em.kalemler).reduce((t, k) => t + k[y], 0);
    document.getElementById('kyIcerik').innerHTML = `
      <p class="text-xs text-slate-400">Kaynak: ${esc(K.kaynak)}. ${esc(K.not)}${su.kaynak_ozet ? ' Su verisi: ' + esc(su.kaynak_ozet) + '.' : ''}</p>
      <nav id="kyAlt" class="flex gap-1 overflow-x-auto border-b border-slate-800 pb-1"></nav>

      <div id="kyP-su" class="space-y-4">
        <div class="olcum-seridi grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">${suKart}</div>
        <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div class="glass-card rounded-xl p-4 xl:col-span-2"><h3 class="text-sm font-semibold text-white mb-3">Aylık su tüketimi (m³)</h3><div class="h-72"><canvas id="chSu"></canvas></div></div>
          <div class="glass-card rounded-xl p-4"><h3 class="text-sm font-semibold text-white mb-3">Aylık fark (${H.yil} / ${H.on})</h3>
            <table class="w-full text-xs"><thead class="text-[11px] text-slate-400"><tr><th class="text-left py-1.5">Ay</th><th class="text-right">${H.yil}</th><th class="text-right">${H.on}</th><th class="text-right">Fark</th></tr></thead>
            <tbody class="divide-y divide-slate-800/70">${su.aylik[H.yil].slice(0, H.n).map((v, i) => `<tr><td class="py-1.5 text-slate-200">${AY[i]}</td><td class="text-right font-mono">${tr0(v)}</td><td class="text-right font-mono text-slate-400">${tr0(su.aylik[H.on][i])}</td><td class="text-right font-mono ${renkFark(H.aylikFark[i], true)}">${fark(H.aylikFark[i])}</td></tr>`).join('')}</tbody></table>
            <ul class="mt-3 space-y-1.5 text-[11px] text-slate-500 list-disc pl-4">${su.notlar.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
        </div></div>

      <div id="kyP-abone" class="space-y-4">${suAbonePanel(H)}</div>

      <div id="kyP-yakit" class="space-y-4">
        <div class="olcum-seridi grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">${yakitKart}</div>
        <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div class="glass-card rounded-xl p-4"><h3 class="text-sm font-semibold text-white mb-3">Motorin (milyon lt)</h3><div class="h-64"><canvas id="chMotorin"></canvas></div></div>
          <div class="glass-card rounded-xl overflow-hidden xl:col-span-2"><div class="overflow-x-auto"><table class="w-full text-xs">
            <thead class="text-[11px] text-slate-400"><tr><th class="px-3 py-3 text-left">Yakıt</th><th class="px-3 text-left">Birim</th><th class="px-3 text-right">2024</th><th class="px-3 text-right">2025</th><th class="px-3 text-right">2025 ilk 6 ay</th><th class="px-3 text-right">2026 ilk 6 ay</th><th class="px-3 text-right">2025/2024</th></tr></thead>
            <tbody class="divide-y divide-slate-800/70">${yakitSatir('Motorin', 'lt', ak.motorin_lt)}${yakitSatir('Benzin', 'lt', Object.assign({ h1_2025: null }, ak.benzin_lt, { h1_2026: ak.benzin_lt.h1_2026 }))}${yakitSatir('Fuel oil', 'kg', Object.assign({ h1_2025: null }, ak.fuel_oil_kg, { h1_2026: ak.fuel_oil_kg.h1_2026 }))}</tbody></table></div>
            <ul class="p-4 space-y-1.5 text-[11px] text-slate-500 list-disc pl-8">${ak.notlar.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
        </div></div>

      <div id="kyP-ev" class="space-y-4">
        <div class="glass-card rounded-xl p-5 text-sm text-slate-300">${K.elektrikli_arac.veri ? '' : `<div class="flex items-start gap-3"><i data-lucide="info" class="w-4 h-4 mt-0.5 text-sky-400 shrink-0"></i><p>${esc(K.elektrikli_arac.not)} Şarj noktası/araç bazlı aylık kWh çizelgesi paylaşıldığında araç sayısı, şarj tüketimi, km başına enerji ve CO₂ karşılaştırması (dizelle) bu bölüme eklenecek.</p></div>`}</div></div>

      <div id="kyP-profil" class="space-y-4">
        <div class="olcum-seridi grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">${sp ? [
          kart('Şebeke elektriği', `${(sp.elektrik_sebeke_kwh / 1e6).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} <span class="text-sm font-medium text-slate-400">GWh</span>`, `${tr0(sp.elektrik_sebeke_kwh * 0.0036)} GJ (1 kWh = 3,6 MJ)`),
          kart('Toplam yakıt enerjisi', `${tr0(spYakitGj)} <span class="text-sm font-medium text-slate-400">GJ</span>`, `Motorin %${Math.round(sp.yakitlar[0].gj / spYakitGj * 100)} • doğalgaz %${Math.round(sp.yakitlar[1].gj / spYakitGj * 100)}`),
          kart('Kendi elektrik üretimi (GES)', `${tr0(sp.kendi_uretim_kwh['2025'] / 1000)} <span class="text-sm font-medium text-slate-400">MWh</span>`, `2022: ${tr0(sp.kendi_uretim_kwh['2022'] / 1000)} MWh • ${fark(sp.kendi_uretim_kwh['2025'] / sp.kendi_uretim_kwh['2022'] - 1)} • ${tr0(sp.kurum_ici_kullanilan_kwh['2025'] / 1000)} MWh kurum içinde, ${tr0(sp.disari_verilen_kwh['2025'] / 1000)} MWh dışarı`, 'text-emerald-400'),
          kart('Yenilenebilir enerji payı', `%${(sp.yenilenebilir_pay['2025'] * 100).toLocaleString('tr-TR')}`, `2024: %${(sp.yenilenebilir_pay['2024'] * 100).toLocaleString('tr-TR')} • 2023: %${(sp.yenilenebilir_pay['2023'] * 100).toLocaleString('tr-TR')}`, 'text-emerald-400'),
        ].join('') : ''}</div>
        ${sp ? `<div class="glass-card rounded-xl overflow-hidden"><div class="overflow-x-auto"><table class="w-full text-xs">
          <thead class="text-[11px] text-slate-400"><tr><th class="px-3 py-3 text-left">Yakıt</th><th class="px-3 text-right">2025 miktar</th><th class="px-3 text-right">Enerji (GJ)</th></tr></thead>
          <tbody class="divide-y divide-slate-800/70">${sp.yakitlar.map((y) => `<tr><td class="px-3 py-2 text-slate-100">${esc(y.ad)}</td><td class="px-3 py-2 text-right font-mono">${tr0(y.miktar)} ${esc(y.birim)}</td><td class="px-3 py-2 text-right font-mono">${tr0(y.gj)}</td></tr>`).join('')}</tbody></table></div>
          <p class="p-4 text-[11px] text-slate-500">Kaynak: ${esc(sp.kaynak)}. Çöp gazı ${tr0(sp.geri_kazanim.cop_gazi_nm3)} Nm³ ve biyogaz (Harmandalı, biyometanizasyon) ayrıca izlenir. ${esc(sp.not)} Panel GES 2025 toplamı (performans verisi) rapordaki öz üretimle aynıdır.</p></div>` : ''}
      </div>

      <div id="kyP-emisyon" class="space-y-4">
        <div class="glass-card rounded-xl overflow-hidden"><div class="overflow-x-auto"><table class="w-full text-xs">
          <thead class="text-[11px] text-slate-400"><tr><th class="px-3 py-3 text-left">Kaynak</th><th class="px-3 text-right">2025 ilk 6 ay (${em.birim})</th><th class="px-3 text-right">2026 ilk 6 ay (${em.birim})</th><th class="px-3 text-right">Değişim</th><th class="px-3 text-right">Toplamdaki pay</th></tr></thead>
          <tbody class="divide-y divide-slate-800/70">${Object.entries(em.kalemler).map(([ad, k]) => `<tr><td class="px-3 py-2 text-slate-100">${esc(ad)}</td><td class="px-3 py-2 text-right font-mono text-slate-400">${tr0(k['2025'])}</td><td class="px-3 py-2 text-right font-mono">${tr0(k['2026'])}</td><td class="px-3 py-2 text-right font-mono ${renkFark(k['2026'] / k['2025'] - 1, true)}">${fark(k['2026'] / k['2025'] - 1)}</td><td class="px-3 py-2 text-right font-mono text-slate-400">%${(k.pay_2026 * 100).toLocaleString('tr-TR')}</td></tr>`).join('')}
          <tr class="bg-slate-900/60 font-semibold"><td class="px-3 py-2 text-slate-100">Toplam</td><td class="px-3 py-2 text-right font-mono">${tr0(emTop('2025'))}</td><td class="px-3 py-2 text-right font-mono">${tr0(emTop('2026'))}</td><td class="px-3 py-2 text-right font-mono ${renkFark(emTop('2026') / emTop('2025') - 1, true)}">${fark(emTop('2026') / emTop('2025') - 1)}</td><td></td></tr></tbody></table></div>
          <p class="p-4 text-[11px] text-slate-500">Yöntem: ${esc(em.yontem)}. GES üretiminden hesaplanan emisyon ayrı gösterilir (2024: ${tr0(em.ges['2024'])}, 2025: ${tr0(em.ges['2025'])} ${em.birim}). Pay sütunu rapordan alınmıştır.</p></div></div>`;
    const renk = { 2024: '#7a5cc7', 2025: '#3f8fd2', 2026: TV() };
    cizGrafik('chSu', { type: 'line', data: { labels: AY, datasets: Object.keys(su.aylik).map((y) => ({ label: y, data: su.aylik[y], borderColor: renk[y], backgroundColor: renk[y], borderWidth: Number(y) === H.yil ? 3 : 2, tension: 0.3, pointRadius: Number(y) === H.yil ? 3 : 0, spanGaps: false })) },
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${tr0(c.parsed.y)} m³` } } }, scales: { y: { ticks: { callback: (v) => (v / 1000).toLocaleString('tr-TR') + ' bin' } } } } });
    cizGrafik('chMotorin', { type: 'bar', data: { labels: ['2024', '2025', '2025 ilk 6 ay', '2026 ilk 6 ay'], datasets: [{ data: [ak.motorin_lt['2024'], ak.motorin_lt['2025'], ak.motorin_lt.h1_2025, ak.motorin_lt.h1_2026].map((v) => v / 1e6), backgroundColor: ['#64748b', '#64748b', '#3f8fd2', TV()], borderRadius: 3 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.parsed.y.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} milyon lt` } } } } });
    const grupSerisi = (K.su.ayrisik || {})[H.yil];
    if (grupSerisi) cizGrafik('chSuGrup', { type: 'bar', data: { labels: AY, datasets: GRUP.map(([g, ad]) => ({ label: ad, data: grupSerisi[g], backgroundColor: GRUP_RENK[g], borderRadius: 2 })) },
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${tr0(c.parsed.y)} m³` } } }, scales: { x: { stacked: true }, y: { stacked: true, ticks: { callback: (v) => (v / 1000).toLocaleString('tr-TR') + ' bin' } } } } });
    if (window.lucide) lucide.createIcons();
    cizildi = true;
    altGoster();
  }

  // ---------- su aboneleri (Park ve Bahçeler, Mezarlıklar, İşletmeler) ----------
  const GRUP = [['park', 'Park ve bahçeler'], ['mezarlik', 'Mezarlıklar'], ['isletme', 'İşletmeler']];
  const GRUP_RENK = { park: '#3f8fd2', mezarlik: '#7a5cc7', isletme: '#e0662c' };
  function suAbonePanel(H) {
    const su = K.su, ay = su.ayrisik;
    if (!ay || !ay[H.yil]) return '<p class="text-sm text-slate-400 p-4">Abone grubu ayrımı verisi yok.</p>';
    const n = H.n, f = su.fatura || {};
    const toplamGrup = (y, g) => topla((ay[y] || {})[g], n);
    const grupKart = GRUP.map(([g, ad]) => {
      const c = toplamGrup(H.yil, g), p = toplamGrup(H.on, g), d = p ? c / p - 1 : null;
      const fa = f[g], son = fa ? fa.abone[n - 1] : null, fat = fa ? fa.fatura[n - 1] : null;
      return kart(`${ad} (Oca–${AY[n - 1]})`, `${tr0(c)} <span class="text-sm font-medium text-slate-400">m³</span>`,
        `Geçen yıl ${tr0(p)} m³ • <span class="${renkFark(d, true)} font-semibold">${fark(d)}</span>${son ? ` • ${tr0(son)} abone` : ''}${fat ? `, ${AY[n - 1]} ayında ${tr0(fat)} fatura` : ''}`);
    }).join('');
    const yuksek = su.yuksek_aboneler || {};
    const yuksekSatir = GRUP.flatMap(([g, gad]) => (yuksek[g] || []).map((b) => {
      const c = topla((b.aylik[H.yil] || []), n), p = topla((b.aylik[H.on] || []), n);
      return { ad: b.ad, grup: gad, c, p, d: p >= 500 ? c / p - 1 : null };
    })).sort((a, b) => b.c - a.c);
    const grupPay = (y) => GRUP.reduce((t, [g]) => t + toplamGrup(y, g), 0);
    return `<div class="olcum-seridi grid grid-cols-1 sm:grid-cols-3">${grupKart}</div>
      <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div class="glass-card rounded-xl p-4 xl:col-span-2"><h3 class="text-sm font-semibold text-white mb-3">Aylık tüketim, abone grubuna göre (${H.yil}, m³)</h3><div class="h-72"><canvas id="chSuGrup"></canvas></div></div>
        <div class="glass-card rounded-xl p-4"><h3 class="text-sm font-semibold text-white mb-3">Faturalanan abone sayısı (${AY[n - 1]})</h3>
          <table class="w-full text-xs"><thead class="text-[11px] text-slate-400"><tr><th class="text-left py-1.5">Grup</th><th class="text-right">Abone</th><th class="text-right">Fatura</th><th class="text-right">Oran</th></tr></thead>
          <tbody class="divide-y divide-slate-800/70">${GRUP.map(([g, ad]) => { const a = f[g] && f[g].abone[n - 1], t = f[g] && f[g].fatura[n - 1]; return `<tr><td class="py-1.5 text-slate-200">${ad}</td><td class="text-right font-mono">${tr0(a)}</td><td class="text-right font-mono">${tr0(t)}</td><td class="text-right font-mono text-slate-400">${a && t ? '%' + Math.round(t / a * 100) : '—'}</td></tr>`; }).join('')}</tbody></table>
          <p class="mt-3 text-[11px] text-slate-500">Oran: o ay fatura kesilen abone ÷ toplam abone. Düşük oran okuma gecikmesine ya da bağlı olmayan sayaçlara işaret edebilir. Üç grubun toplamı (Oca–${AY[n - 1]}): ${tr0(grupPay(H.yil))} m³ (${H.on}: ${tr0(grupPay(H.on))} m³).</p></div>
      </div>
      <div class="glass-card rounded-xl overflow-hidden">
        <h3 class="text-sm font-semibold text-white p-4 pb-2">Yüksek tüketimli aboneler (Oca–${AY[n - 1]})</h3>
        <div class="overflow-x-auto"><table class="w-full text-xs">
          <thead class="text-[11px] text-slate-400"><tr><th class="px-3 py-2 text-left">Abone</th><th class="px-3 text-left">Grup</th><th class="px-3 text-right">${H.yil} (m³)</th><th class="px-3 text-right">${H.on} aynı dönem</th><th class="px-3 text-right">Değişim</th></tr></thead>
          <tbody class="divide-y divide-slate-800/70">${yuksekSatir.map((b) => `<tr><td class="px-3 py-2 text-slate-100">${esc(b.ad)}</td><td class="px-3 py-2 text-slate-400">${esc(b.grup)}</td><td class="px-3 py-2 text-right font-mono">${tr0(b.c)}</td><td class="px-3 py-2 text-right font-mono text-slate-400">${tr0(b.p)}</td><td class="px-3 py-2 text-right font-mono ${renkFark(b.d, true)}">${fark(b.d)}</td></tr>`).join('')}</tbody></table></div>
        <p class="p-4 text-[11px] text-slate-500">Su idaresinin yüksek tüketimli abone listesi (tesis adı ve aylık m³). Abone numarası ve tutar tutulmaz. Park ve bahçelerde yaz sulaması nedeniyle değişim doğaldır; ancak aynı dönemde keskin artış sızıntı belirtisi olabilir.</p>
      </div>`;
  }

  // Alt sekmeler (ISO, Elektrik ve Doğalgaz'daki gibi): tek seferde bir bölüm görünür
  const ALT = [['su', 'Su', ['su']], ['abone', 'Su aboneleri', ['abone']], ['yakit', 'Akaryakıt ve araçlar', ['yakit', 'ev']], ['profil', 'Enerji profili ve emisyon', ['profil', 'emisyon']]];
  let altSekme = 'su';
  function altGoster() {
    const nav = document.getElementById('kyAlt'); if (!nav) return;
    nav.innerHTML = ALT.map(([k, ad]) => `<button onclick="Kaynak.alt('${k}')" class="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${k === altSekme ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-slate-200'}">${ad}</button>`).join('');
    ALT.forEach(([k, , paneller]) => paneller.forEach((p) => { const el = document.getElementById('kyP-' + p); if (el) el.classList.toggle('hidden', k !== altSekme); }));
    setTimeout(() => Object.values(grafik).forEach((g) => g && g.resize()), 50);   // gizliyken çizilen grafikler görününce boyutlansın
  }

  async function yukle() {
    try {
      const r = await fetch('data/kaynak_raporu.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      K = await r.json();
      ozetKayit(hesapla());
    } catch (e) {
      const el = document.getElementById('kyIcerik'); if (el) el.innerHTML = '<p class="text-sm text-slate-400 p-6">Kaynak raporu verisi yüklenemedi.</p>';
    }
  }

  window.Kaynak = {
    async ac() {
      if (!K) await yukle();
      if (K && !cizildi) ciz(); else if (K) altGoster();
    },
    alt(k) { if (!ALT.some((x) => x[0] === k)) return; altSekme = k; altGoster(); },
  };
  if ((location.hash || '').slice(1) === 'kaynak') window.Kaynak.ac(); else yukle();
})();
