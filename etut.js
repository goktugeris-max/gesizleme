/* Enerji etütleri (Etütler sekmesi, #etut): üç tesisin bina enerji etüt raporları (SETAŞ Enerji, 2023) — bina karşılaştırması,
 * tasarruf önerileri ve uygulama takibi. Veri: data/etut.json (ŞİFRESİZ, kullanıcı kararı; collector/etut_to_json.py). TL değerleri 2022 fiyatlarıdır.
 * Uygulama durumu YALNIZCA tarayıcıda (localStorage `etut_v1_takip`). Diğer modüller için: Etut.isoBolum() (ISO sekmesi) ve Etut.oneri() (dijital ikiz).
 */
(function () {
  const TAKIP = 'etut_v1_takip';
  const DURUM = { bekliyor: ['Değerlendiriliyor', '#94a3b8'], planli: ['Planlandı', '#3f8fd2'], devam: ['Uygulanıyor', '#d9822b'], tamam: ['Tamamlandı', '#10b981'], yok: ['Uygulanmayacak', '#64748b'] };
  let D = null, yukleniyor = null, takip = {}, panelEl = null, bina = 'hepsi', tur = 'hepsi', vade = 'hepsi', sira = { k: 'geri_odeme_yil', y: 1 };
  const grafik = {};
  try { takip = JSON.parse(localStorage.getItem(TAKIP) || '{}') || {}; } catch (e) { takip = {}; }
  const kaydet = () => { try { localStorage.setItem(TAKIP, JSON.stringify(takip)); } catch (e) { /* özel pencere */ } };

  const e2 = (s) => (typeof esc === 'function' ? esc(s) : String(s ?? ''));
  const tr0 = (n) => (n == null || isNaN(n) ? '—' : Math.round(n).toLocaleString('tr-TR'));
  const tr1 = (n) => (n == null || isNaN(n) ? '—' : n.toLocaleString('tr-TR', { maximumFractionDigits: 1, minimumFractionDigits: 1 }));
  const tr2 = (n) => (n == null || isNaN(n) ? '—' : n.toLocaleString('tr-TR', { maximumFractionDigits: 2, minimumFractionDigits: 2 }));
  const topla = (a) => a.reduce((t, v) => t + (v || 0), 0);

  async function yukle() {
    if (D) return D;
    if (!yukleniyor) {
      yukleniyor = fetch('data/etut.json?t=' + Date.now(), { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then((j) => { D = j; return D; }).catch((e) => { yukleniyor = null; throw e; });
    }
    return yukleniyor;
  }

  const kwhEs = (b, y) => { const v = b.yillar[y]; return v ? v.toplam_tep * D.tep_kwh : null; };
  const son = (b) => Object.keys(b.yillar).sort().pop();
  const durumu = (id) => (takip[id] && takip[id].durum) || 'bekliyor';
  const tumOnlem = (b) => b.onlemler.map((o) => Object.assign({ bina: b.id, binaAd: b.kisa }, o));
  const tumAlt = (b) => b.alternatif.map((o) => Object.assign({ bina: b.id, binaAd: b.kisa, alt: true }, o));

  // ---------- diğer modüller için ----------
  function oneri(tesisId) {
    if (!D) return null;
    const b = D.binalar.find((x) => x.tesis === tesisId); if (!b) return null;
    const y = b.yillar[son(b)], gaz = (k) => topla(b.onlemler.filter((o) => o.ikiz === k && o.tur === 'doğalgaz').map((o) => o.miktar)), led = topla(b.onlemler.filter((o) => o.ikiz === 'led').map((o) => o.miktar));
    const ges = b.alternatif.find((o) => o.ikiz === 'ges');
    return { bina: b, yil: son(b),
      kabuk: { pct: y.gaz_sm3 ? (gaz('kabuk') / y.gaz_sm3) * 100 : null, onlemler: b.onlemler.filter((o) => o.ikiz === 'kabuk') },
      kazan: { pct: y.gaz_sm3 ? (gaz('kazan') / y.gaz_sm3) * 100 : null, onlemler: b.onlemler.filter((o) => o.ikiz === 'kazan') },
      led: { pct: y.elek_kwh ? (led / y.elek_kwh) * 100 : null, onlemler: b.onlemler.filter((o) => o.ikiz === 'led') },
      ges: ges ? { kw: b.alternatif_kw, kwh: ges.miktar, tl_yil: ges.tl_yil, yatirim_tl: ges.yatirim_tl, geri_odeme_yil: ges.geri_odeme_yil } : null };
  }

  // ---------- görünüm ----------
  function kpiKartlari(liste) {
    return (liste || D.binalar).map((b) => {
      const y = son(b), v = b.yillar[y], m2 = b.kullanim_alani_m2, kwhm2 = kwhEs(b, y) / m2, pot = b.toplam_onlem.tep / v.toplam_tep * 100;
      const ges = b.alternatif.find((o) => o.ikiz === 'ges'), gesPay = ges ? (ges.miktar / v.elek_kwh) * 100 : null;
      return `<div class="glass-card rounded-xl p-4"><div class="text-sm font-semibold text-white">${e2(b.kisa)}</div><div class="text-[11px] text-slate-500 mb-2">${e2(b.kullanim)} • ${e2(b.insaat_yili)} • ${tr0(m2)} m²</div>
        <div class="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
          <div><div class="text-[10px] uppercase tracking-wider text-slate-500">${y} enerji</div><div class="text-lg font-bold text-white">${tr0(v.toplam_tep)} <span class="text-[11px] text-slate-400">TEP</span></div></div>
          <div><div class="text-[10px] uppercase tracking-wider text-slate-500">m² başına</div><div class="text-lg font-bold text-cyan-300">${tr0(kwhm2)} <span class="text-[11px] text-slate-400">kWh/m²</span></div></div>
          <div><div class="text-[10px] uppercase tracking-wider text-slate-500">Önlem potansiyeli</div><div class="text-lg font-bold text-emerald-300">%${tr1(pot)}</div><div class="text-[10px] text-slate-500">${tr0(b.toplam_onlem.tl_yil)} TL/yıl • GÖS ${tr1(b.toplam_onlem.geri_odeme_yil)} yıl</div></div>
          <div><div class="text-[10px] uppercase tracking-wider text-slate-500">Çatı GES önerisi</div><div class="text-lg font-bold text-amber-300">${ges ? tr0(b.alternatif_kw) + ' <span class="text-[11px] text-slate-400">kWe</span>' : '—'}</div><div class="text-[10px] text-slate-500">${ges ? `elektriğin %${tr0(gesPay)}'i • GÖS ${tr1(ges.geri_odeme_yil)} yıl` : ''}</div></div></div></div>`;
    }).join('');
  }

  function karsilastirmaTablosu() {
    const sat = D.binalar.map((b) => {
      const y = son(b), v = b.yillar[y], m2 = b.kullanim_alani_m2;
      return `<tr class="border-t border-slate-800/70"><td class="px-3 py-2 text-slate-100 font-medium whitespace-nowrap">${e2(b.kisa)}</td><td class="px-3 py-2 text-right font-mono">${tr0(m2)}</td><td class="px-3 py-2 text-right font-mono">${tr0(b.kapali_hacim_m3)}</td>
        <td class="px-3 py-2 text-right font-mono">${tr0(v.elek_kwh)}</td><td class="px-3 py-2 text-right font-mono">${tr0(v.gaz_sm3)}</td><td class="px-3 py-2 text-right font-mono">${tr0(v.toplam_tep)}</td>
        <td class="px-3 py-2 text-right font-mono text-cyan-300">${tr0(kwhEs(b, y) / m2)}</td><td class="px-3 py-2 text-right font-mono">${tr0(v.elek_kwh / m2)}</td><td class="px-3 py-2 text-right font-mono">${tr1(v.gaz_sm3 / m2)}</td>
        <td class="px-3 py-2 text-right font-mono">${tr0((v.elek_tl + v.gaz_tl) / m2)}</td></tr>`;
    }).join('');
    return `<div class="glass-card rounded-xl overflow-x-auto"><table class="w-full text-xs" style="min-width:760px"><thead class="bg-slate-900/80 text-slate-400 uppercase tracking-wider text-[10px]"><tr>
      <th class="px-3 py-2.5 text-left">Bina (2022)</th><th class="px-3 text-right">Kullanım alanı m²</th><th class="px-3 text-right">Hacim m³</th><th class="px-3 text-right">Elektrik kWh</th><th class="px-3 text-right">Doğalgaz Sm³</th><th class="px-3 text-right">TEP</th>
      <th class="px-3 text-right">kWh eşdeğer/m²</th><th class="px-3 text-right">Elektrik kWh/m²</th><th class="px-3 text-right">Gaz Sm³/m²</th><th class="px-3 text-right">TL/m² (2022)</th></tr></thead><tbody>${sat}</tbody></table></div>
      <p class="text-[11px] text-slate-500 mt-2">kWh eşdeğer = TEP × ${D.tep_kwh.toLocaleString('tr-TR')} (etüt raporlarının kendi TEP dönüşümü). Aşık Veysel'de buz pisti ve havuz bulunduğu için m² başına tüketim doğal olarak yüksektir; binalar farklı kullanım türündedir, karşılaştırma yol göstericidir.</p>`;
  }

  function grafikler() {
    if (!window.Chart) return;
    const renk = ['#211950', '#3f8fd2', '#d9822b'], yillar = ['2020', '2021', '2022'];
    const yazi = koyuMu() ? '#94a3b8' : '#5b6b7e';
    const yap = (id, cfg) => { if (grafik[id]) grafik[id].destroy(); const c = document.getElementById(id); if (c) grafik[id] = new Chart(c, cfg); };
    const baslik = (t) => ({ display: true, text: t, color: yazi, font: { size: 11, weight: 'normal' } });
    yap('chEtutM2', { type: 'bar', data: { labels: yillar, datasets: D.binalar.map((b, i) => ({ label: b.kisa, data: yillar.map((y) => (b.yillar[y] ? Math.round(kwhEs(b, y) / b.kullanim_alani_m2) : null)), backgroundColor: renk[i % 3] })) },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' }, title: baslik('m² başına enerji (kWh eşdeğer/m²)') } } });
    yap('chEtutPay', { type: 'bar', data: { labels: D.binalar.map((b) => b.kisa), datasets: [
      { label: 'Elektrik (TEP)', data: D.binalar.map((b) => { const v = b.yillar[son(b)]; return Math.round((v.elek_tep + (v.elek_uretilen_tep || 0)) * 10) / 10; }), backgroundColor: '#3f8fd2' },
      { label: 'Doğalgaz (TEP)', data: D.binalar.map((b) => b.yillar[son(b)].gaz_tep), backgroundColor: '#d9822b' },
      { label: 'Önlem tasarrufu (TEP)', data: D.binalar.map((b) => b.toplam_onlem.tep), backgroundColor: '#10b981' }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' }, title: baslik('2022 enerji ve tasarruf potansiyeli (TEP)') } } });
  }

  function suzulmus() {
    let l = D.binalar.filter((b) => bina === 'hepsi' || b.id === bina).flatMap(tumOnlem);
    if (tur !== 'hepsi') l = l.filter((o) => o.tur === tur);
    if (vade !== 'hepsi') l = l.filter((o) => o.vade === vade);
    const k = sira.k;
    return l.sort((a, b) => { const x = a[k], y = b[k]; if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return (typeof x === 'string' ? x.localeCompare(y, 'tr') : x - y) * sira.y; });
  }

  const dugme = (grup, k, ad, secili) => `<button onclick="Etut.sz('${grup}','${k}')" class="px-2.5 py-1 rounded-md text-[11px] font-semibold ${secili ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-slate-200'}">${ad}</button>`;
  const durumSecim = (id, kucuk) => { const d = durumu(id); return `<select onchange="Etut.durum('${id}', this.value)" class="bg-slate-900 border border-slate-700 rounded-md ${kucuk ? 'px-1 py-0.5' : 'px-2 py-1'} text-[11px]" style="color:${DURUM[d][1]}">${Object.keys(DURUM).map((x) => `<option value="${x}" ${x === d ? 'selected' : ''}>${DURUM[x][0]}</option>`).join('')}</select>`; };
  const miktar = (o) => (o.miktar == null ? '—' : `${tr0(o.miktar)} ${e2(o.birim || '')}`);
  const vadeRenk = { Derhal: 'text-emerald-300', Kısa: 'text-emerald-300', Orta: 'text-amber-300', Uzun: 'text-rose-300' };

  function onlemSatiri(o) {
    return `<tr class="border-t border-slate-800/70 align-top"><td class="px-3 py-2 text-slate-100 min-w-[260px]">${e2(o.ad)}${o.alt ? ' <span class="text-[10px] text-amber-300">(alternatif enerji)</span>' : ''}</td><td class="px-3 py-2 text-slate-400 whitespace-nowrap">${e2(o.binaAd)}</td>
      <td class="px-3 py-2"><span class="px-1.5 py-0.5 rounded text-[10px] font-semibold ${o.tur === 'elektrik' ? 'bg-amber-500/15 text-amber-300' : 'bg-cyan-500/15 text-cyan-300'}">${e2(o.tur)}</span></td>
      <td class="px-3 py-2 text-right font-mono whitespace-nowrap">${miktar(o)}</td><td class="px-3 py-2 text-right font-mono">${tr2(o.tep)}</td><td class="px-3 py-2 text-right font-mono">${tr0(o.tl_yil)}</td><td class="px-3 py-2 text-right font-mono">${tr0(o.yatirim_tl)}</td>
      <td class="px-3 py-2 text-right font-mono text-cyan-300">${o.geri_odeme_yil == null ? '—' : tr1(o.geri_odeme_yil)}</td><td class="px-3 py-2 ${vadeRenk[o.vade] || 'text-slate-500'}">${e2(o.vade || 'nitel')}</td><td class="px-3 py-2">${durumSecim(o.kod)}</td></tr>`;
  }

  function onlemTablosu(liste, baslikCol) {
    const th = (k, ad, sag) => `<th class="px-3 py-2.5 ${sag ? 'text-right' : 'text-left'} cursor-pointer hover:text-white" onclick="Etut.srl('${k}')">${ad}${sira.k === k ? (sira.y > 0 ? ' ▲' : ' ▼') : ''}</th>`;
    const tl = topla(liste.map((o) => o.tl_yil)), yat = topla(liste.map((o) => o.yatirim_tl)), tep = topla(liste.map((o) => o.tep));
    return `<div class="glass-card rounded-xl overflow-x-auto"><table class="w-full text-xs" style="min-width:980px"><thead class="bg-slate-900/80 text-slate-400 uppercase tracking-wider text-[10px]"><tr>
      ${th('ad', baslikCol || 'Önlem')}${th('binaAd', 'Bina')}${th('tur', 'Tür')}<th class="px-3 text-right">Tasarruf/yıl</th>${th('tep', 'TEP', 1)}${th('tl_yil', 'TL/yıl', 1)}${th('yatirim_tl', 'Yatırım TL', 1)}${th('geri_odeme_yil', 'Geri ödeme (yıl)', 1)}${th('vade', 'Vade')}<th class="px-3 text-left">Durum</th></tr></thead>
      <tbody>${liste.map(onlemSatiri).join('') || '<tr><td colspan="10" class="px-3 py-6 text-center text-slate-500">Bu süzgece uyan önlem yok.</td></tr>'}</tbody>
      <tfoot class="border-t-2 border-slate-700 font-semibold text-white"><tr><td class="px-3 py-2" colspan="4">Toplam (${liste.length} önlem)</td><td class="px-3 py-2 text-right font-mono">${tr1(tep)}</td><td class="px-3 py-2 text-right font-mono">${tr0(tl)}</td><td class="px-3 py-2 text-right font-mono">${tr0(yat)}</td><td class="px-3 py-2 text-right font-mono text-cyan-300">${tl ? tr1(yat / tl) : '—'}</td><td colspan="2"></td></tr></tfoot></table></div>`;
  }

  function takipOzeti() {
    const tum = D.binalar.filter((b) => bina === 'hepsi' || b.id === bina).flatMap(tumOnlem).filter((o) => o.tl_yil != null), say = {};
    Object.keys(DURUM).forEach((k) => { say[k] = tum.filter((o) => durumu(o.kod) === k); });
    const tamTL = topla(say.tamam.map((o) => o.tl_yil)), tamTep = topla(say.tamam.map((o) => o.tep)), toplamTL = topla(tum.filter((o) => durumu(o.kod) !== 'yok').map((o) => o.tl_yil));
    return `<div class="grid grid-cols-2 lg:grid-cols-5 gap-3">${Object.keys(DURUM).map((k) => `<div class="glass-card rounded-xl p-3"><div class="text-[10px] uppercase tracking-wider text-slate-500">${DURUM[k][0]}</div><div class="text-xl font-bold" style="color:${DURUM[k][1]}">${say[k].length}</div><div class="text-[10px] text-slate-500">${tr0(topla(say[k].map((o) => o.tl_yil)))} TL/yıl</div></div>`).join('')}</div>
      <p class="text-[11px] text-slate-500 mt-2">Tamamlanan önlemlerin etüt hesabına göre yıllık kazancı: <b class="text-emerald-300">${tr0(tamTL)} TL</b> (${tr1(tamTep)} TEP) — uygulanmayacaklar hariç toplam potansiyelin %${toplamTL ? tr0((tamTL / toplamTL) * 100) : 0}'ı. Durumlar yalnızca bu tarayıcıda tutulur.</p>`;
  }

  function altTablolar() {
    const alt = D.binalar.filter((b) => bina === 'hepsi' || b.id === bina).flatMap(tumAlt);
    const dis = D.binalar.filter((b) => bina === 'hepsi' || b.id === bina).flatMap((b) => b.tabloya_alinmayan.map((x) => Object.assign({ binaAd: b.kisa }, x)));
    return `<details class="glass-card rounded-xl p-4 mt-4"><summary class="cursor-pointer text-sm font-semibold text-white">Alternatif enerji önerileri (${alt.length}) ve öneri tablosuna alınmayan hesaplar (${dis.length})</summary>
      <div class="mt-3 space-y-3"><div class="overflow-x-auto"><table class="w-full text-xs" style="min-width:760px"><thead class="text-slate-400 uppercase tracking-wider text-[10px]"><tr><th class="px-3 py-2 text-left">Öneri</th><th class="px-3 text-left">Bina</th><th class="px-3 text-right">Tasarruf/yıl</th><th class="px-3 text-right">TEP</th><th class="px-3 text-right">TL/yıl</th><th class="px-3 text-right">Yatırım TL</th><th class="px-3 text-right">GÖS (yıl)</th><th class="px-3 text-left">Vade</th><th class="px-3 text-left">Durum</th></tr></thead><tbody>
        ${alt.map((o) => `<tr class="border-t border-slate-800/70"><td class="px-3 py-2 text-slate-100">${e2(o.ad)}</td><td class="px-3 py-2 text-slate-400">${e2(o.binaAd)}</td><td class="px-3 py-2 text-right font-mono">${miktar(o)}</td><td class="px-3 py-2 text-right font-mono">${tr1(o.tep)}</td><td class="px-3 py-2 text-right font-mono">${tr0(o.tl_yil)}</td><td class="px-3 py-2 text-right font-mono">${tr0(o.yatirim_tl)}</td><td class="px-3 py-2 text-right font-mono text-cyan-300">${tr1(o.geri_odeme_yil)}</td><td class="px-3 py-2 ${vadeRenk[o.vade] || ''}">${e2(o.vade)}</td><td class="px-3 py-2">${durumSecim(o.kod, 1)}</td></tr>`).join('')}</tbody></table></div>
        ${dis.length ? `<div class="overflow-x-auto"><table class="w-full text-xs" style="min-width:560px"><thead class="text-slate-400 uppercase tracking-wider text-[10px]"><tr><th class="px-3 py-2 text-left">Geri ödemesi uzun olduğu için tabloya alınmayanlar</th><th class="px-3 text-left">Bina</th><th class="px-3 text-right">TL/yıl</th><th class="px-3 text-right">Yatırım TL</th><th class="px-3 text-right">GÖS (yıl)</th></tr></thead><tbody>
          ${dis.map((x) => `<tr class="border-t border-slate-800/70"><td class="px-3 py-2 text-slate-100">${e2(x.ad)}</td><td class="px-3 py-2 text-slate-400">${e2(x.binaAd)}</td><td class="px-3 py-2 text-right font-mono">${tr0(x.tl_yil)}</td><td class="px-3 py-2 text-right font-mono">${tr0(x.yatirim_tl)}</td><td class="px-3 py-2 text-right font-mono">${tr1(x.geri_odeme_yil)}</td></tr>`).join('')}</tbody></table></div>` : ''}</div></details>`;
  }

  // ISO sekmesinde seçili tesisin "Enerji etüdü" paneli (bina sabit)
  function kunye(b) {
    const y = son(b), v = b.yillar[y], ges = b.alternatif.find((o) => o.ikiz === 'ges');
    const sat = (a, d) => `<div class="flex justify-between gap-3 py-1 border-t border-slate-800/70 first:border-0 text-xs"><span class="text-slate-400">${a}</span><span class="text-slate-100 text-right">${d}</span></div>`;
    return `<div class="glass-card rounded-xl p-4"><div class="text-sm font-semibold text-white mb-1">${e2(b.ad)}</div>
      ${sat('Kullanım / inşaat yılı', `${e2(b.kullanim)} • ${e2(b.insaat_yili)}`)}${sat('Kullanım alanı / hacim', `${tr0(b.kullanim_alani_m2)} m² • ${tr0(b.kapali_hacim_m3)} m³`)}${sat('Isıtma-soğutma sistemi', e2(b.sistem))}${sat('Yalıtım', e2(b.yalitim))}
      ${sat('Isıtma / soğutma derece-gün', `${tr0(b.isitma_derece_gun)} / ${tr0(b.sogutma_derece_gun)}`)}${sat('Etüt dönemi', e2(b.etut_donemi))}
      ${sat('Çatı GES önerisi', ges ? `${tr0(b.alternatif_kw)} kWe • GÖS ${tr1(ges.geri_odeme_yil)} yıl` : '—')}</div>`;
  }

  function panelIskelet(el) {
    const b = D.binalar.find((x) => x.id === bina);
    el.innerHTML = `<div class="space-y-4">
      <p class="text-[11px] text-slate-500">Kaynak: ${e2(D.kaynak)}. ${e2(D.not)} Etütler 2022 tüketimlerine göre yapılmıştır; ayrıntılar ve ölçümler için ilgili etüt raporuna bakınız.</p>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">${kpiKartlari([b])}${kunye(b)}</div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4"><div class="glass-card rounded-xl p-4"><div class="h-64"><canvas id="chEtutM2"></canvas></div></div><div class="glass-card rounded-xl p-4"><div class="h-64"><canvas id="chEtutPay"></canvas></div></div></div>
      <details class="glass-card rounded-xl p-4"><summary class="cursor-pointer text-sm font-semibold text-white">Üç tesisin kıyası (m² başına tüketim)</summary><div class="mt-3">${karsilastirmaTablosu()}</div></details>
      <section><h3 class="text-sm font-semibold text-white mb-1">Önlemlerin uygulama durumu</h3><div id="etutTakip"></div></section>
      <section><div class="flex flex-wrap items-center gap-2 mb-3"><h3 class="text-sm font-semibold text-white mr-2">Tasarruf önlemleri</h3><div id="etutSuzgec" class="flex flex-wrap items-center gap-2"></div>
        <button onclick="Etut.csv()" class="ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200">CSV indir</button></div>
        <div id="etutTablo"></div><div id="etutAlt"></div></section></div>`;
    grafikler(); liste();
  }

  function liste() {
    const bn = D.binalar, l = suzulmus();
    const g = (grup, mevcut, secenekler) => `<div class="flex flex-wrap gap-1 bg-slate-900/80 rounded-lg p-0.5">${secenekler.map(([k, ad]) => dugme(grup, k, ad, mevcut === k)).join('')}</div>`;
    document.getElementById('etutSuzgec').innerHTML = g('tur', tur, [['hepsi', 'Tümü'], ['elektrik', 'Elektrik'], ['doğalgaz', 'Doğalgaz']]) + g('vade', vade, [['hepsi', 'Tüm vadeler'], ['Derhal', 'Derhal'], ['Kısa', 'Kısa'], ['Orta', 'Orta'], ['Uzun', 'Uzun']]);
    document.getElementById('etutTablo').innerHTML = onlemTablosu(l);
    document.getElementById('etutAlt').innerHTML = altTablolar();
    document.getElementById('etutTakip').innerHTML = takipOzeti();
  }

  // ISO "Özet" kartı için: seçili tesisin etüt önlemleri (TL/yıl 2022 fiyatı)
  function tesisOzet(tesisId) {
    const b = D && D.binalar.find((x) => x.id === tesisId); if (!b) return null;
    const l = b.onlemler.filter((o) => o.tl_yil != null), tum = tumOnlem(b).concat(tumAlt(b));
    return { n: tum.length, tamam: tum.filter((o) => durumu(o.kod) === 'tamam').length, tlYil: topla(l.map((o) => o.tl_yil)) };
  }

  // YGG özeti için: önlemlerin uygulama durumu sayıları
  function sayilar() {
    if (!D) return null;
    const tum = D.binalar.flatMap((b) => tumOnlem(b).concat(tumAlt(b))), c = { toplam: tum.length, bekliyor: 0, planli: 0, devam: 0, tamam: 0, yok: 0 };
    tum.forEach((o) => { c[durumu(o.kod)]++; });
    return c;
  }

  window.Etut = {
    sayilar,
    // ISO sekmesi: seçili tesisin enerji etüdü paneli
    async panel(tesisId, el) {
      if (!el) return;
      try { await yukle(); } catch (e) { el.innerHTML = '<p class="text-sm text-slate-400 p-6">Etüt verisi (data/etut.json) yüklenemedi.</p>'; return; }
      if (!D.binalar.some((x) => x.id === tesisId)) { el.innerHTML = '<p class="text-sm text-slate-400 p-6">Bu tesis için etüt raporu yok.</p>'; return; }
      bina = tesisId; panelEl = el; panelIskelet(el);
    },
    yukle, oneri, tesisOzet,
    sz(grup, k) { if (grup === 'bina') bina = k; else if (grup === 'tur') tur = k; else vade = k; liste(); },
    srl(k) { sira = { k, y: sira.k === k ? -sira.y : 1 }; liste(); },
    durum(id, d) {
      if (d === 'bekliyor') delete takip[id]; else takip[id] = { durum: d, tarih: new Date().toISOString().slice(0, 10) };
      kaydet();
      if (document.getElementById('etutTablo')) liste();
    },
    csv() {
      const sat = [['Bina', 'Önlem', 'Tür', 'Tasarruf miktarı', 'Birim', 'TEP/yıl', 'TL/yıl (2022)', 'CO2 ton/yıl', 'Yatırım TL', 'Geri ödeme yıl', 'Vade', 'Durum'],
        ...suzulmus().map((o) => [o.binaAd, o.ad, o.tur, o.miktar ?? '', o.birim ?? '', o.tep ?? '', o.tl_yil ?? '', o.co2_ton ?? '', o.yatirim_tl ?? '', o.geri_odeme_yil ?? '', o.vade ?? '', DURUM[durumu(o.kod)][0]])];
      const metin = '﻿' + sat.map((r) => r.map((h) => { const s = String(h ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';')).join('\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([metin], { type: 'text/csv;charset=utf-8' })); a.download = 'enerji_etut_onlemleri.csv'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    },
  };
  yukle().catch(() => {});   // ISO sekmesi ve dijital ikiz için arka planda önceden yükle
})();
