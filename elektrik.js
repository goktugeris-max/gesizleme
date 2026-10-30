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
  const YIL_RENK = { 2023: '#64748b', 2024: '#7a5cc7', 2025: '#3f8fd2', 2026: TV() };

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
    const kart = (b, d, alt, renk) => `<div class="glass-card p-5"><div class="text-sm text-slate-400 font-medium">${b}</div><div class="text-3xl font-semibold mt-2 leading-none ${renk || 'text-white'}">${d}</div><div class="text-xs text-slate-500 mt-3">${alt}</div></div>`;
    const degisim = (a, b) => (b ? fark(a / b - 1) : '—');
    document.getElementById('elKartlar').innerHTML =
      kart(`Faturalı tüketim, ${donem}`, gwh(fat) + ' <span class="text-base font-semibold text-slate-400">GWh</span>', `Geçen yıl aynı dönem ${degisim(fat, ofat)} • ${tr0(aboneler)} abone`) +
      kart('Gerçek tüketim', gwh(ger) + ' <span class="text-base font-semibold text-slate-400">GWh</span>', `Geçen yıl aynı dönem ${degisim(ger, oger)}`) +
      kart('GES net üretimi', gwh(ges) + ' <span class="text-base font-semibold text-slate-400">GWh</span>', `Geçen yıl aynı dönem ${degisim(ges, oges)}`, 'text-amber-300') +
      kart('GES\'in tüketimdeki payı', yuzde(pay, 1), `Geçen yıl aynı dönem ${yuzde(opay, 1)}`, 'text-emerald-500') +
      kart('Üretim fazlası', tr0(fazla / 1000) + ' <span class="text-base font-semibold text-slate-400">MWh</span>', `GES üretiminin ${yuzde(ges ? fazla / ges : null, 1)} kadarı şebekeye verildi`);
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
        { type: 'bar', label: 'GES net üretim (kWh)', data: ges, backgroundColor: TV(), borderRadius: 3, yAxisID: 'y', order: 2 },
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
        { label: `${yil} Oca–${AY[ay - 1]}`, data: ilk.map((r) => r.simdi), backgroundColor: TV(), borderRadius: 3 },
        { label: `${yil - 1} aynı dönem`, data: ilk.map((r) => r.onceki), backgroundColor: '#3f8fd266', borderRadius: 3 },
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
    const renk = [TV(), '#3f8fd2', '#7a5cc7', '#10b981', '#d9822b', '#94a3b8'];
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

  // ---------- seçilebilir raporlar ----------
  const RAPORLAR = {
    db: { ad: 'Daire başkanlığı kırılımı (dönem karşılaştırması)', tur: 'kars', ac: 'Seçilen dönemin toplam tüketimi, geçen yılın aynı dönemiyle.', kaynak: () => E.db },
    db_aylik: { ad: 'Daire başkanlığı × ay (seçili yıl)', tur: 'matris', ac: 'Seçilen yılın aylık tüketimi, daire başkanlığı bazında (kWh).', satirlar: (y) => Object.entries(E.db).map(([a, v]) => [a, v[y]]) },
    aydinlatma_db: { ad: 'Aydınlatma tarifesi — daire başkanlığı bazında', tur: 'kars', ac: 'Yalnızca "AYDINLATMA" tarifeli abonelerin tüketimi (genel aydınlatma hariç).',
      kaynak: () => Object.fromEntries(Object.entries(E.db_tarife || {}).filter(([, t]) => t.AYDINLATMA).map(([a, t]) => [a, t.AYDINLATMA])) },
    genel_aydinlatma: { ad: 'Genel aydınlatma — aylık tüketim (tüm yıllar)', tur: 'matris', ac: 'Genel aydınlatma aylık tüketimi (kWh). Satırlar yıl, sütunlar ay; seçili yıl ayarı kullanılmaz.', satirlar: () => Object.entries(E.genel_aydinlatma || {}).sort((a, b) => b[0] - a[0]).map(([y, v]) => [y, v]), yilsiz: true },
    tarife: { ad: 'Tarife dağılımı', tur: 'kars', ac: 'Ticarethane, mesken, aydınlatma tarifelerine göre tüketim.', kaynak: () => E.tarife },
    tedarikci: { ad: 'Tedarikçi dağılımı', tur: 'kars', ac: 'Tedarikçi firmaya göre tüketim.', kaynak: () => E.tedarikci },
    ozet: { ad: 'Aylık özet (faturalı, gerçek, GES)', tur: 'matris', ac: 'Seçili yıl için aylık faturalı/gerçek tüketim ve GES kalemleri (kWh).',
      satirlar: (y) => [['Faturalı tüketim', 'faturali'], ['Genel aydınlatma %20 payı', 'aydinlatma_pay'], ['Müstecir noktalar', 'mustecir'], ['GES net üretim', 'ges_net'], ['Üretim fazlası', 'fazla'], ['Gerçek tüketim', 'gercek']].map(([a, k]) => [a, E.aylik[y][k]]) },
  };
  let raporSon = null;

  function raporKur() {
    const sec = document.getElementById('elRaporSec');
    if (!sec || sec.options.length) return;
    sec.innerHTML = Object.entries(RAPORLAR).map(([k, r]) => `<option value="${k}">${esc(r.ad)}</option>`).join('');
    const yillar = yilSayi().reverse();
    document.getElementById('elRaporYil').innerHTML = yillar.map((y) => `<option>${y}</option>`).join('');
    const aylar = AY_UZUN.map((a, i) => `<option value="${i + 1}">${a}</option>`).join('');
    document.getElementById('elRaporBas').innerHTML = aylar;
    document.getElementById('elRaporBit').innerHTML = aylar;
    document.getElementById('elRaporYil').value = String(E.son_donem.yil);
    document.getElementById('elRaporBas').value = '1';
    document.getElementById('elRaporBit').value = String(E.son_donem.ay);
    ['elRaporSec', 'elRaporYil', 'elRaporBas', 'elRaporBit'].forEach((id) => { document.getElementById(id).onchange = () => raporCiz(id === 'elRaporYil'); });
  }

  function raporCiz(yilDegisti) {
    const rk = document.getElementById('elRaporSec').value, r = RAPORLAR[rk];
    const yil = document.getElementById('elRaporYil').value;
    if (yilDegisti) document.getElementById('elRaporBit').value = String(yil === String(E.son_donem.yil) ? E.son_donem.ay : 12);
    let bas = +document.getElementById('elRaporBas').value, bit = +document.getElementById('elRaporBit').value;
    if (bas > bit) { [bas, bit] = [bit, bas]; document.getElementById('elRaporBas').value = bas; document.getElementById('elRaporBit').value = bit; }
    const aralik = (a) => (a || []).slice(bas - 1, bit).reduce((t, v) => t + (v || 0), 0);
    const baslikSinif = 'bg-slate-900/80 text-slate-400 uppercase tracking-wider text-[11px] sticky top-0';
    let kol, satir, ozet;
    if (r.tur === 'kars') {
      const onceki = String(+yil - 1);
      const donem = `${AY[bas - 1]}–${AY[bit - 1]}`;
      const s = Object.entries(r.kaynak()).map(([ad, y]) => [ad, aralik(y[yil]), aralik(y[onceki])]).filter((x) => x[1] > 0 || x[2] > 0).sort((a, b) => b[1] - a[1]);
      const top = s.reduce((t, x) => t + x[1], 0), topO = s.reduce((t, x) => t + x[2], 0);
      kol = ['Ad', `${yil} ${donem} (kWh)`, `${+yil - 1} aynı dönem (kWh)`, 'Değişim', 'Pay'];
      satir = s.map((x) => [x[0], x[1], x[2], x[2] > 0 ? x[1] / x[2] - 1 : null, top ? x[1] / top : null]);
      ozet = ['TOPLAM', top, topO, topO > 0 ? top / topO - 1 : null, 1];
    } else {
      kol = ['Ad', ...AY_UZUN, 'Toplam'];
      const bos = (i, y) => +y === E.son_donem.yil && i >= E.son_donem.ay;
      satir = r.satirlar(yil).map(([a, v]) => { const m = (v || []).map((x, i) => (x == null || bos(i, r.yilsiz ? a : yil) ? null : x)); return [a, ...m, m.reduce((t, x) => t + (x || 0), 0)]; });
      ozet = null;
    }
    document.getElementById('elRaporAciklama').textContent = r.ac + (r.tur === 'kars' ? '' : r.yilsiz ? '' : ` Yıl: ${yil}.`);
    const hucre = (v, j, tur) => {
      if (j === 0) return `<td class="px-3 py-2 text-slate-100 whitespace-nowrap">${esc(String(v))}</td>`;
      if (tur === 'kars' && j === 3) return `<td class="px-3 py-2 text-right font-mono ${v != null && v > 0.1 ? 'text-red-400' : v != null && v < -0.1 ? 'text-emerald-400' : 'text-slate-300'}">${fark(v)}</td>`;
      if (tur === 'kars' && j === 4) return `<td class="px-3 py-2 text-right font-mono text-slate-400">${yuzde(v, 1)}</td>`;
      return `<td class="px-3 py-2 text-right font-mono">${v == null ? '—' : tr0(v)}</td>`;
    };
    document.getElementById('elRaporTablo').innerHTML = `<thead class="${baslikSinif}"><tr>${kol.map((k, i) => `<th class="px-3 py-3 ${i ? 'text-right' : 'text-left'} whitespace-nowrap">${k}</th>`).join('')}</tr></thead>
      <tbody class="divide-y divide-slate-800/70">${satir.map((x) => `<tr>${x.map((v, j) => hucre(v, j, r.tur)).join('')}</tr>`).join('')}${ozet ? `<tr class="bg-slate-900/60 font-semibold">${ozet.map((v, j) => hucre(v, j, r.tur)).join('')}</tr>` : ''}</tbody>`;
    raporSon = { ad: r.ad, kol, satir: ozet ? [...satir, ozet] : satir, tur: r.tur };
  }

  function csvIndir() {
    if (!raporSon) return;
    const hucre = (v, j) => (v == null ? '' : typeof v === 'number' ? (raporSon.tur === 'kars' && j >= 3 ? v.toFixed(4) : String(Math.round(v))).replace('.', ',') : '"' + String(v).replace(/"/g, '""') + '"');
    const metin = '\ufeff' + [raporSon.kol.map((k) => '"' + k + '"').join(';'), ...raporSon.satir.map((x) => x.map(hucre).join(';'))].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([metin], { type: 'text/csv;charset=utf-8' }));
    a.download = 'elektrik_' + raporSon.ad.toLowerCase().replace(/[^a-z0-9çğıöşü]+/gi, '_').slice(0, 40) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
  }

  function ciz() {
    kartlar(); aylikGrafik(); gesGrafik(); dbTablosu();
    dagilim('chElTarife', E.tarife);
    dagilim('chElTedarikci', E.tedarikci);
    yillikTablo(); notlar();
    raporKur(); raporCiz();
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

  // ---------- Özet sayfasına kart + uyarılar ----------
  // Hedef: kurum yıllık değerlendirme raporuna göre 2026 elektrik tüketimini 2025'e göre en az %5 azaltmak.
  const HEDEF = { 2026: -0.05 };
  function ozetKayit() {
    if (!window.Dash || !Dash.ozetKaydet || !E) return;
    const { yil, ay } = E.son_donem, A = E.aylik[String(yil)], O = E.aylik[String(yil - 1)];
    if (!A || !O) return;
    const ger = topla(A.gercek, ay), oger = topla(O.gercek, ay), otop = topla(O.gercek, 12);
    const d = oger ? ger / oger - 1 : null, tahmin = oger ? (ger / oger) * otop : null, hedef = HEDEF[yil];
    const renk = d == null ? 'text-slate-300' : d > 0 ? 'text-red-400' : 'text-emerald-400';
    const hedefSatir = hedef != null && d != null ? `<div class="text-[11px] ${d <= hedef ? 'text-emerald-400' : 'text-amber-300'} mt-1">Hedef %${Math.abs(hedef * 100)} azaltım: ${d <= hedef ? 'tutturuluyor' : 'şu an ' + fark(d - hedef).replace('+', '') + ' geride'}</div>` : '';
    const uyarilar = [];
    if (A.gercek[ay - 1] != null && O.gercek[ay - 1]) {
      const f = A.gercek[ay - 1] / O.gercek[ay - 1] - 1;
      if (f >= 0.08) uyarilar.push({ modul: 'Elektrik', etiket: 'Son ay artışı', metin: `${AY[ay - 1]} ${yil} gerçek tüketimi geçen yılın aynı ayına göre ${fark(f)} (${gwh(A.gercek[ay - 1])} GWh).`, renk: 'text-red-400', href: '#elektrik', puan: 40 + Math.min(40, f * 200) });
    }
    Object.entries(E.db).forEach(([ad, v]) => {
      const c = topla(v[String(yil)], ay), p = topla(v[String(yil - 1)], ay);
      if (p > 0 && c - p >= 150000 && c / p - 1 >= 0.15) uyarilar.push({ modul: 'Elektrik', etiket: 'Dönem artışı', metin: `${ad}: Oca–${AY[ay - 1]} ${fark(c / p - 1)} (+${tr0((c - p) / 1000)} MWh).`, renk: 'text-amber-300', href: '#elektrik', puan: 30 + Math.min(45, (c - p) / 40000) });
    });
    Dash.ozetKaydet('elektrik', {
      kart: `<div class="grid grid-cols-2 gap-3 text-xs text-slate-500">
        <div><div class="text-[10px] uppercase tracking-wider text-slate-500">Oca–${AY[ay - 1]} ${yil}</div><div class="text-lg font-bold text-white">${gwh(ger)} <span class="text-xs text-slate-400">GWh</span></div></div>
        <div><div class="text-[10px] uppercase tracking-wider text-slate-500">Geçen yıla göre</div><div class="text-lg font-bold ${renk}">${fark(d)}</div></div>
        <div class="col-span-2"><div class="text-[10px] uppercase tracking-wider text-slate-500">Yıl sonu tahmini</div><div class="text-sm font-semibold text-slate-200">${gwh(tahmin)} GWh <span class="text-xs text-slate-500">(${yil - 1}: ${gwh(otop)} GWh)</span></div>${hedefSatir}</div></div>`,
      uyarilar: uyarilar.sort((a, b) => b.puan - a.puan).slice(0, 5),
    });
  }

  // ---- Şifreli veri: data/elektrik.enc.json (AES-GCM + PBKDF2), parola yalnızca tarayıcıda kullanılır ----
  let sifreli = null;
  const b64 = (t) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
  const oturum = (k, v) => { try { return v === undefined ? sessionStorage.getItem(k) : (v === null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v)); } catch (e) { return null; } };

  async function coz(parola) {
    const anahtarMalzeme = await crypto.subtle.importKey('raw', new TextEncoder().encode(parola), 'PBKDF2', false, ['deriveKey']);
    const anahtar = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: b64(sifreli.salt), iterations: sifreli.iter, hash: 'SHA-256' },
      anahtarMalzeme, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const acik = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(sifreli.iv) }, anahtar, b64(sifreli.data));
    return JSON.parse(new TextDecoder().decode(acik));
  }

  function girisFormu(hata) {
    document.getElementById('elIcerik').classList.add('hidden');
    document.getElementById('elGirisKap').innerHTML = `<form id="elGiris" class="max-w-sm mx-auto my-10 bg-slate-800/60 border border-slate-700 rounded-xl p-5 space-y-3">
      <div class="flex items-center gap-2 text-amber-300 font-semibold"><i data-lucide="lock" class="w-4 h-4"></i> Yönetici girişi</div>
      <p class="text-xs text-slate-400">Elektrik tüketim verileri şifreli saklanır. Görmek için parolayı girin.</p>
      <input id="elParola" type="password" autocomplete="current-password" class="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm" placeholder="Parola" />
      <p class="text-xs text-rose-400 ${hata ? '' : 'hidden'}">${hata || ''}</p>
      <button class="w-full bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold rounded-lg py-2 text-sm">Giriş</button>
    </form>`;
    if (window.lucide) lucide.createIcons();
    document.getElementById('elGiris').onsubmit = async (ev) => {
      ev.preventDefault();
      const p = document.getElementById('elParola').value;
      if (await ac_dene(p)) { oturum('elp', p); window.Elek.ac(); } else girisFormu('Parola yanlış.');
    };
  }

  async function ac_dene(parola) {
    try { E = await coz(parola); } catch (e) { return false; }
    yuklendi = true;
    try { ozetSerit(); ozetKayit(); } catch (e) { console.error('Elektrik özeti çizilemedi:', e); }
    return true;
  }

  async function yukle() {
    try {
      if (!sifreli) {
        const r = await fetch('data/elektrik.enc.json?t=' + Date.now(), { cache: 'no-store' });
        if (!r.ok) throw new Error(r.status);
        sifreli = await r.json();
      }
      const kayitli = oturum('elp');
      if (kayitli && await ac_dene(kayitli)) return;
      oturum('elp', null);
    } catch (e) {
      document.getElementById('elGirisKap').innerHTML = '<p class="text-sm text-slate-400 p-6">Elektrik verisi yüklenemedi.</p>';
      sifreli = null;
    }
  }

  // Alt sekmeler (ISO sekmesindeki gibi): tek seferde bir bölüm görünür
  const ALT = [['ozet', 'Özet'], ['db', 'Daire başkanlıkları'], ['tarife', 'Tarife ve tedarikçi'], ['rapor', 'Raporlar']];
  let altSekme = 'ozet';
  function altGoster() {
    document.getElementById('elAlt').innerHTML = ALT.map(([k, ad]) => `<button onclick="Elek.alt('${k}')" class="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${k === altSekme ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-slate-200'}">${ad}</button>`).join('');
    ALT.forEach(([k]) => { const p = document.getElementById('elP-' + k); if (p) p.classList.toggle('hidden', k !== altSekme); });
    setTimeout(() => Object.values(grafik).forEach((g) => g && g.resize()), 50);   // gizliyken çizilen grafikler görününce boyutlansın
  }

  window.Elek = {
    async ac() {
      if (!yuklendi) await yukle();
      if (!yuklendi) { if (sifreli) girisFormu(); return; }
      document.getElementById('elGirisKap').innerHTML = '';
      document.getElementById('elIcerik').classList.remove('hidden');
      if (!cizildi) ciz();
      altGoster();
    },
    alt(k) { if (!ALT.some((x) => x[0] === k)) return; altSekme = k; altGoster(); },
    csv: csvIndir,
    sec(k) { secim = k; if (yuklendi) aylikGrafik(); },
  };
  // Sayfa doğrudan #elektrik ile açıldıysa (dashboard.js bu dosyadan önce çalışır) kendini başlat;
  // aksi halde yalnızca Genel Bakış özeti için veriyi yükle
  if ((location.hash || '').slice(1) === 'elektrik') window.Elek.ac(); else yukle();
})();
