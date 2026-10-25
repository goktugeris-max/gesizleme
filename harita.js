/* GES harita panosu (CBS + etkileşimli gösterge paneli) — Leaflet + Chart.js.
 * Konumlar: data/santral_konumlari.json (collector/konum_to_json.py). Veri ve canlı durum dashboard.js'ten Dash.veri() ile alınır.
 * Süzgeçler (arama, ilçe, durum, verim, marka, güç) harita, kartlar, liste ve grafiklerin tümünü birlikte günceller;
 * grafiklere ve ilçe sınırlarına tıklamak da süzgeç uygular. İşaretçi/liste seçimi sağ panelde santral ayrıntısını açar.
 */
(function () {
  const AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  let harita = null, konumlar = null, ilceVeri = null, ilceKatman = null, katman = null, kirilgan = null, sigdi = false, kuruldu = false;
  let mod = 'verim', ilceMod = 'guc', ilceAcik = true, secili = null, siralama = 'verim';
  const F = { ara: '', ilce: new Set(), durum: 'hepsi', verim: 'hepsi', marka: 'hepsi', kwMin: 0 };
  const isaret = {}, grafik = {};

  const tr0 = (n) => (n == null || isNaN(n) ? '—' : Math.round(n).toLocaleString('tr-TR'));
  const tr1 = (n) => (n == null || isNaN(n) ? '—' : n.toLocaleString('tr-TR', { maximumFractionDigits: 1, minimumFractionDigits: 1 }));
  const yuzde = (v) => (v == null || isNaN(v) ? '—' : '%' + Math.round(v * 100));
  const buyuk = (a) => String(a || '').toLocaleUpperCase('tr');
  const guzelIlce = (a) => (a ? a.charAt(0) + a.slice(1).toLocaleLowerCase('tr') : '');
  const topla = (a) => a.reduce((t, v) => t + (v || 0), 0);
  const el = (id) => document.getElementById(id);

  const GRI = '#64748b';
  const verimRenk = (v) => (v == null ? GRI : v >= 0.95 ? '#10b981' : v >= 0.85 ? '#fcd34d' : v >= 0.70 ? '#d9822b' : '#ef4444');
  function durumRenk(c) {
    if (!c) return GRI;
    if (c.durum === 'Çalışıyor') return '#10b981';
    if (c.durum === 'Arızalı' || c.durum === 'Haberleşme Yok') return '#ef4444';
    if (c.durum === 'Beklemede') return '#38bdf8';
    return '#fcd34d';
  }
  const sorunlu = (c) => !!c && (c.durum === 'Arızalı' || c.durum === 'Haberleşme Yok');
  const verimKey = (v) => (v == null ? 'yok' : v >= 0.95 ? 'a' : v >= 0.85 ? 'b' : v >= 0.70 ? 'c' : 'd');
  const VERIM_AD = { a: '≥ %95', b: '%85–95', c: '%70–85', d: '< %70', yok: 'Veri yok' };
  const VERIM_RENK = { a: '#10b981', b: '#fcd34d', c: '#d9822b', d: '#ef4444', yok: GRI };
  const durumKey = (c) => (!c ? 'yok' : c.durum === 'Çalışıyor' ? 'calisiyor' : sorunlu(c) ? 'sorun' : c.durum === 'Beklemede' ? 'bekleme' : 'diger');
  const DURUM_AD = { calisiyor: 'Çalışıyor', sorun: 'Arıza / haberleşme yok', bekleme: 'Beklemede', yok: 'Canlı bağlantı yok', diger: 'Diğer' };

  function marka(m) {
    const t = ((m.s && m.s.inverter) || '').trim().split(/[\s,]+/)[0] || 'Diğer';
    if (/^go?o?dwe$/i.test(t)) return 'GoodWe';
    if (/^sma$/i.test(t)) return 'SMA';
    if (/^huawei$/i.test(t)) return 'Huawei';
    return t.charAt(0).toLocaleUpperCase('tr') + t.slice(1);
  }

  // ---------- veri ----------
  function tum() {
    const v = window.Dash && Dash.veri();
    if (!v || !v.M.length || !konumlar) return [];
    return v.M.filter((m) => konumlar[m.id]).map((m) => ({ m, k: konumlar[m.id], c: v.canliBul(m.s), marka: marka(m) }));
  }
  function suz(rows, haricIlce) {
    const q = buyuk(F.ara);
    return rows.filter((r) => {
      if (q && !buyuk(r.m.ad + ' ' + (r.k.ilce || '')).includes(q)) return false;
      if (!haricIlce && F.ilce.size && !F.ilce.has(buyuk(r.k.ilce))) return false;
      if (F.durum !== 'hepsi' && durumKey(r.c) !== F.durum) return false;
      if (F.verim !== 'hepsi' && verimKey(r.m.verim) !== F.verim) return false;
      if (F.marka !== 'hepsi' && r.marka !== F.marka) return false;
      if ((r.m.kw || 0) < F.kwMin) return false;
      return true;
    });
  }
  const filtreSayisi = () => (F.ara ? 1 : 0) + (F.ilce.size ? 1 : 0) + (F.durum !== 'hepsi') + (F.verim !== 'hepsi') + (F.marka !== 'hepsi') + (F.kwMin > 0 ? 1 : 0);

  // özgül üretim (kWh/kW) rengi: tüm santraller içindeki sıraya göre
  function ozgulRenkFn(rows) {
    const d = rows.map((r) => r.m.ozgul).filter((x) => x != null).sort((a, b) => a - b);
    return (v) => {
      if (v == null || !d.length) return GRI;
      const p = d.filter((x) => x <= v).length / d.length;
      return p > 0.75 ? '#10b981' : p > 0.5 ? '#fcd34d' : p > 0.25 ? '#d9822b' : '#ef4444';
    };
  }
  let ozgulRenk = () => GRI;
  const renk = (r) => (mod === 'canli' ? durumRenk(r.c) : mod === 'ozgul' ? ozgulRenk(r.m.ozgul) : verimRenk(r.m.verim));

  // ---------- iskelet ----------
  const SEL = 'bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-100';
  function kurIskelet() {
    el('haritaPano').innerHTML = `
      <section class="glass-card rounded-xl p-3 sm:p-4">
        <div class="flex flex-wrap items-end gap-x-3 gap-y-2">
          <h2 class="text-sm font-semibold text-white flex items-center gap-2 mr-auto"><i data-lucide="map-pin" class="w-4 h-4 text-amber-400"></i> GES harita panosu <span id="haritaOzet" class="text-[11px] font-normal text-slate-500"></span></h2>
          <label class="text-[11px] text-slate-400 w-full sm:w-auto">Ara<br><input id="fAra" type="search" placeholder="Santral veya ilçe…" class="${SEL} w-full sm:w-48"></label>
          <label class="text-[11px] text-slate-400 flex-1 min-w-[6.5rem] sm:flex-none">Durum<br><select id="fDurum" class="${SEL} w-full"><option value="hepsi">Hepsi</option>${Object.entries(DURUM_AD).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
          <label class="text-[11px] text-slate-400 flex-1 min-w-[6.5rem] sm:flex-none">Verim<br><select id="fVerim" class="${SEL} w-full"><option value="hepsi">Hepsi</option>${['a', 'b', 'c', 'd', 'yok'].map((k) => `<option value="${k}">${VERIM_AD[k]}</option>`).join('')}</select></label>
          <label class="text-[11px] text-slate-400 flex-1 min-w-[6.5rem] sm:flex-none">Marka<br><select id="fMarka" class="${SEL} w-full"></select></label>
          <label class="text-[11px] text-slate-400 w-full sm:w-44">En az güç: <b id="fKwDeger" class="text-slate-200">0 kW</b><br><input id="fKw" type="range" min="0" max="400" step="10" value="0" class="w-full accent-amber-500"></label>
          <button id="fTemizle" class="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-700 text-slate-300 hover:text-white transition hidden">Süzgeçleri temizle</button>
        </div>
        <div id="fRozet" class="flex flex-wrap gap-1.5 mt-2 empty:hidden"></div>
      </section>
      <section id="haritaKpi" class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3"></section>
      <section class="glass-card rounded-xl overflow-hidden">
        <div class="p-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap gap-1 bg-slate-900/80 rounded-lg p-0.5"><span class="px-2 py-1 text-[11px] text-slate-500">Renk:</span>
            <button data-hmod="verim">Verim</button><button data-hmod="canli">Canlı durum</button><button data-hmod="ozgul">Özgül üretim</button></div>
          <div class="flex flex-wrap gap-1 bg-slate-900/80 rounded-lg p-0.5">
            <button id="haritaIlce">İlçe sınırları</button><button id="haritaKirilgan">İklim kırılganlığı</button><span class="w-px bg-slate-700 mx-1"></span>
            <button id="haritaSigdir" class="px-2.5 py-1 rounded-md text-[11px] font-semibold text-slate-400 hover:text-slate-200 transition">Seçime sığdır</button>
            <button id="haritaTam" class="px-2.5 py-1 rounded-md text-[11px] font-semibold text-slate-400 hover:text-slate-200 transition">Tam ekran</button></div>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-3">
          <div id="haritaKap" class="lg:col-span-2 h-[26rem] lg:h-[40rem] bg-slate-900"></div>
          <div class="border-t lg:border-t-0 lg:border-l border-slate-800 flex flex-col lg:h-[40rem] min-h-0">
            <div id="haritaDetay" class="border-b border-slate-800"></div>
            <div class="px-3 py-2 flex items-center justify-between gap-2 border-b border-slate-800 text-[11px] text-slate-400">
              <span id="haritaListeBaslik"></span>
              <label class="flex items-center gap-1.5">Sırala <select id="fSirala" class="${SEL} py-1"><option value="verim">Verim (düşükten)</option><option value="kw">Güç (yüksekten)</option><option value="ozgul">kWh/kW (yüksekten)</option><option value="ad">Ad</option></select></label>
            </div>
            <div id="haritaListe" class="overflow-y-auto max-h-72 lg:max-h-none lg:flex-1 min-h-0"></div>
          </div>
        </div>
        <div id="haritaLejant" class="px-4 py-2.5 border-t border-slate-800 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400"></div>
      </section>
      <section class="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div class="glass-card rounded-xl p-4 min-w-0"><h3 class="text-xs font-semibold text-slate-200 mb-1">İlçelere göre kurulu güç (kW)</h3><p class="text-[10px] text-slate-500 mb-2">Çubuğa tıklayınca ilçe süzgeci eklenir/kalkar.</p><div class="h-60 relative"><canvas id="chHIlce"></canvas></div></div>
        <div class="glass-card rounded-xl p-4 min-w-0"><h3 class="text-xs font-semibold text-slate-200 mb-1">Verim dağılımı (santral sayısı)</h3><p class="text-[10px] text-slate-500 mb-2">Çubuğa tıklayınca verim süzgeci uygulanır.</p><div class="h-60 relative"><canvas id="chHVerim"></canvas></div></div>
        <div class="glass-card rounded-xl p-4 min-w-0"><h3 class="text-xs font-semibold text-slate-200 mb-1">Aylık üretim — seçili santraller (MWh)</h3><p class="text-[10px] text-slate-500 mb-2" id="chHAylikAlt"></p><div class="h-60 relative"><canvas id="chHAylik"></canvas></div></div>
      </section>`;
    const dugme = (b, aktif) => { b.className = 'px-2.5 py-1 rounded-md text-[11px] font-semibold transition ' + (aktif ? 'bg-amber-500/15 text-amber-300' : 'text-slate-400 hover:text-slate-200'); };
    document.querySelectorAll('[data-hmod]').forEach((b) => {
      dugme(b, b.dataset.hmod === mod);
      b.addEventListener('click', () => { mod = b.dataset.hmod; document.querySelectorAll('[data-hmod]').forEach((x) => dugme(x, x === b)); guncelle(); });
    });
    const id = el('haritaIlce'), kg = el('haritaKirilgan');
    dugme(id, ilceAcik); dugme(kg, false);
    id.addEventListener('click', () => { ilceAcik = !ilceAcik; dugme(id, ilceAcik); ilceCiz(); lejant(); });
    kg.addEventListener('click', () => { ilceMod = ilceMod === 'kirilgan' ? 'guc' : 'kirilgan'; if (ilceMod === 'kirilgan') { ilceAcik = true; dugme(id, true); } dugme(kg, ilceMod === 'kirilgan'); ilceCiz(); lejant(); });
    el('haritaSigdir').addEventListener('click', () => sigdir(true));
    el('haritaTam').addEventListener('click', () => { const k = el('haritaKap'); if (document.fullscreenElement) document.exitFullscreen(); else if (k.requestFullscreen) k.requestFullscreen(); });
    document.addEventListener('fullscreenchange', () => { if (harita) setTimeout(() => harita.invalidateSize(), 200); });
    el('fAra').addEventListener('input', (e) => { F.ara = e.target.value.trim(); guncelle(); });
    el('fDurum').addEventListener('change', (e) => { F.durum = e.target.value; guncelle(); });
    el('fVerim').addEventListener('change', (e) => { F.verim = e.target.value; guncelle(); });
    el('fMarka').addEventListener('change', (e) => { F.marka = e.target.value; guncelle(); });
    el('fKw').addEventListener('input', (e) => { F.kwMin = Number(e.target.value); guncelle(); });
    el('fSirala').addEventListener('change', (e) => { siralama = e.target.value; liste(suz(tum())); });
    el('fTemizle').addEventListener('click', temizle);
    kuruldu = true;
  }

  function temizle() {
    F.ara = ''; F.ilce.clear(); F.durum = 'hepsi'; F.verim = 'hepsi'; F.marka = 'hepsi'; F.kwMin = 0;
    el('fAra').value = ''; el('fDurum').value = 'hepsi'; el('fVerim').value = 'hepsi'; el('fMarka').value = 'hepsi'; el('fKw').value = 0;
    guncelle(true);
  }

  // ---------- harita ----------
  function kurHarita() {
    // CARTO artık API anahtarı istediği için zemin Esri Gray (anahtarsız) + etiket katmanı
    const esri = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
    const gri = (t) => L.layerGroup([
      L.tileLayer(esri + `Canvas/World_${t}_Gray_Base/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 19, maxNativeZoom: 16, attribution: 'Esri, HERE, Garmin, © OpenStreetMap katkıcıları' }),
      L.tileLayer(esri + `Canvas/World_${t}_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 19, maxNativeZoom: 16 }),
    ]);
    const koyu = gri('Dark'), acik = gri('Light');
    const sokak = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' });
    const uydu = L.tileLayer(esri + 'World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Esri, Maxar, Earthstar Geographics' });
    harita = L.map('haritaKap', { layers: [koyuMu() ? koyu : acik], zoomControl: true, scrollWheelZoom: true }).setView([38.5, 27.1], 9);
    L.control.layers({ 'Açık': acik, 'Koyu': koyu, 'Sokak': sokak, 'Uydu': uydu }, null, { position: 'topright' }).addTo(harita);
    harita.on('click', () => { if (secili) { secili = null; guncelle(); } });
  }

  // İlçe sınırları (İzBB Açık Veri, CC BY 4.0): kurulu güce göre boyalı; tıklayınca ilçe süzgeci
  function ilceCiz() {
    if (ilceKatman) { ilceKatman.remove(); ilceKatman = null; }
    if (!ilceAcik || !ilceVeri || !harita) return;
    const ozet = {};
    suz(tum(), true).forEach((r) => { const o = (ozet[buyuk(r.k.ilce)] = ozet[buyuk(r.k.ilce)] || { adet: 0, kw: 0 }); o.adet += 1; o.kw += r.m.kw || 0; });
    const kmax = Math.max(1, ...Object.values(ozet).map((o) => o.kw));
    const kg = {};
    (kirilgan || []).forEach((x) => { kg[buyuk(x.ilce.trim())] = x; });
    const kgRenk = { Yüksek: '#ef4444', Orta: TV(), Düşük: '#34d399' };
    ilceKatman = L.geoJSON(ilceVeri, {
      style: (f) => {
        const a = f.properties.adi, o = ozet[a], sec = F.ilce.has(a);
        const taban = { color: sec ? '#f59e0b' : '#94a3b8', weight: sec ? 3 : 1, opacity: sec ? 1 : 0.55 };
        if (ilceMod === 'kirilgan' && kg[a]) return { ...taban, fillColor: kgRenk[kg[a].grup], fillOpacity: 0.3 };
        return { ...taban, fillColor: '#f59e0b', fillOpacity: sec ? 0.3 : o ? 0.05 + 0.17 * (o.kw / kmax) : 0.0 };
      },
      onEachFeature: (f, l) => {
        const a = f.properties.adi, o = ozet[a], k = kg[a];
        const kt = k ? `<br>İklim kırılganlığı: ${k.grup} (${k.endeks.toFixed(3).replace('.', ',')})` : '';
        l.bindTooltip((o ? `<b>${guzelIlce(a)}</b><br>${o.adet} santral • ${tr0(o.kw)} kW` : `<b>${guzelIlce(a)}</b><br>Santral yok`) + kt + '<br><i>Tıkla: ilçe süzgeci</i>', { sticky: true });
        l.on('click', (e) => { L.DomEvent.stopPropagation(e); ilceAnahtar(a); });
      },
    }).addTo(harita);
    ilceKatman.bringToBack();
  }
  function ilceAnahtar(a) { if (F.ilce.has(a)) F.ilce.delete(a); else F.ilce.add(a); guncelle(true); }

  function isaretciler(rows) {
    if (katman) katman.remove();
    katman = L.layerGroup().addTo(harita);
    Object.keys(isaret).forEach((k) => delete isaret[k]);
    const kmax = Math.max(1, ...rows.map((r) => r.m.kw || 0));
    rows.filter((r) => !r.k.gizli).forEach((r) => {   // konumu gizli tesis için işaretçi çizilmez
      const yaricap = 7 + 13 * Math.sqrt((r.m.kw || 0) / kmax), sec = secili === r.m.id;
      const mk = L.circleMarker([r.k.lat, r.k.lon], {
        radius: yaricap + (sec ? 3 : 0), color: sec ? '#f59e0b' : sorunlu(r.c) ? '#fecaca' : '#0f172a', weight: sec ? 4 : sorunlu(r.c) ? 3 : 2,
        fillColor: renk(r), fillOpacity: 0.9,
      }).addTo(katman).bindTooltip(`${esc(r.m.ad)} • ${tr0(r.m.kw)} kW • ${yuzde(r.m.verim)}`, { direction: 'top' });
      mk.on('click', (e) => { L.DomEvent.stopPropagation(e); sec_(r.m.id, false); });
      isaret[r.m.id] = mk;
      if (sec) mk.bringToFront();
    });
  }

  function sigdir(zorla) {
    if (!harita) return;
    const rows = suz(tum()).filter((r) => !r.k.gizli);
    if (!rows.length) return;
    sigdi = true;
    const ps = rows.map((r) => [r.k.lat, r.k.lon]);
    if (ps.length === 1) harita.flyTo(ps[0], 13, { duration: 0.7 });
    else harita.fitBounds(L.latLngBounds(ps), { padding: [40, 40], maxZoom: zorla ? 13 : 11 });
  }

  // ---------- seçim ve ayrıntı ----------
  function sec_(id, uc) {
    secili = id;
    guncelle();
    const mk = isaret[id];
    if (mk && uc) harita.flyTo(mk.getLatLng(), Math.max(harita.getZoom(), 13), { duration: 0.7 });
  }

  function detay(rows) {
    const kutu = el('haritaDetay');
    const r = rows.find((x) => x.m.id === secili) || tum().find((x) => x.m.id === secili);
    if (!r) {
      kutu.innerHTML = '<p class="px-4 py-3 text-[11px] text-slate-500">Ayrıntı için haritadan bir işaretçiye ya da listeden bir santrale tıklayın.</p>';
      if (grafik.det) { grafik.det.destroy(); delete grafik.det; }
      return;
    }
    const v = Dash.veri(), { yil, ay } = v.PERF.son_donem, m = r.m, c = r.c;
    const onceki = m.s.aylik[String(yil - 1)] || [];
    const chip = (t, col) => `<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold border" style="color:${col};border-color:${col}55;background:${col}18">${t}</span>`;
    kutu.innerHTML = `
      <div class="p-3 space-y-2">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0"><div class="text-sm font-semibold text-white truncate">${esc(m.ad)}</div>
            <div class="text-[11px] text-slate-400">${esc(r.k.ilce || '')} • ${tr0(m.kw)} kW • ${esc(r.marka)}${r.k.gizli ? ' • konum gizli' : ''}</div></div>
          <button id="detKapat" class="text-slate-500 hover:text-slate-200 text-lg leading-none px-1" aria-label="Kapat">×</button></div>
        <div class="flex flex-wrap gap-1.5">${chip('Verim ' + yuzde(m.verim), verimRenk(m.verim))}${chip(c ? c.durum : 'Canlı bağlantı yok', durumRenk(c))}${m.degisim != null ? chip('Geçen yıl ' + (m.degisim >= 0 ? '+' : '') + tr1(m.degisim * 100) + '%', m.degisim >= 0 ? '#10b981' : '#ef4444') : ''}</div>
        <div class="grid grid-cols-3 gap-2 text-center">
          <div><div class="text-[10px] uppercase tracking-wider text-slate-500">${yil} (Oca–${AY[ay - 1]})</div><div class="text-xs font-bold text-slate-100">${tr0(m.uretim / 1000)} <span class="text-[10px] font-normal text-slate-400">MWh</span></div></div>
          <div><div class="text-[10px] uppercase tracking-wider text-slate-500">Beklenen</div><div class="text-xs font-bold text-slate-100">${tr0(m.beklenen / 1000)} <span class="text-[10px] font-normal text-slate-400">MWh</span></div></div>
          <div><div class="text-[10px] uppercase tracking-wider text-slate-500">kWh/kW</div><div class="text-xs font-bold text-slate-100">${tr0(m.ozgul)}</div></div></div>
        ${c ? `<div class="text-[11px] text-slate-400">Anlık <b class="text-slate-200">${tr1(c.anlik_kw)} kW</b> • bugün <b class="text-slate-200">${tr0(c.bugun_kwh)} kWh</b></div>` : ''}
        <div class="h-24 relative"><canvas id="chHDet"></canvas></div>
        <div class="flex gap-2">
          <button onclick="Dash.sekme('santraller');Dash.detay('${m.id}')" class="flex-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-100 transition">Santral ayrıntısı</button>
          ${isaret[m.id] ? '<button id="detYakin" class="px-3 py-1.5 rounded-lg border border-slate-700 text-xs font-semibold text-slate-300 hover:text-white transition">Yakınlaştır</button>' : ''}</div>
      </div>`;
    el('detKapat').onclick = () => { secili = null; guncelle(); };
    const yk = el('detYakin'); if (yk) yk.onclick = () => harita.flyTo(isaret[m.id].getLatLng(), 15, { duration: 0.8 });
    if (grafik.det) grafik.det.destroy();
    grafik.det = new Chart(el('chHDet'), { type: 'bar', data: { labels: AY, datasets: [
      { type: 'line', label: 'Beklenen', data: (m.s.beklenen_aylik || []).map((x) => (x == null ? null : x / 1000)), borderColor: '#94a3b8', borderDash: [4, 3], borderWidth: 1.5, pointRadius: 0, tension: 0.3 },
      { label: String(yil - 1), data: onceki.map((x) => (x == null ? null : x / 1000)), backgroundColor: '#cbd5e155', borderRadius: 2 },
      { label: String(yil), data: (m.s.aylik[String(yil)] || []).map((x) => (x == null ? null : x / 1000)), backgroundColor: TV(), borderRadius: 2 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (x) => `${x.dataset.label}: ${tr1(x.parsed.y)} MWh` } } }, scales: { x: { ticks: { font: { size: 9 } }, grid: { display: false } }, y: { ticks: { font: { size: 9 }, maxTicksLimit: 3 } } } } });
  }

  // ---------- kartlar, liste, grafikler ----------
  function kpi(rows) {
    const hepsi = tum(), v = Dash.veri(), { yil, ay } = v.PERF.son_donem;
    const kw = topla(rows.map((r) => r.m.kw)), uretim = topla(rows.map((r) => r.m.uretim)), bekl = topla(rows.map((r) => r.m.beklenen));
    const verim = bekl ? uretim / bekl : null;
    const canli = rows.map((r) => r.c).filter(Boolean), anlik = topla(canli.map((c) => c.anlik_kw)), bugun = topla(canli.map((c) => c.bugun_kwh));
    const sor = rows.filter((r) => sorunlu(r.c)).length;
    const ef = window.Karbon ? Karbon.efElek() : 0.479, co2 = (uretim * ef) / 1000;
    const pay = (a, b) => (b ? ` • toplamın %${Math.round((a / b) * 100)}'i` : '');
    const kart = (b, d, alt, r) => `<div class="glass-card rounded-xl p-3 min-w-0"><div class="text-[10px] uppercase tracking-wider text-slate-400">${b}</div><div class="text-xl font-bold mt-0.5 break-words ${r || 'text-white'}">${d}</div><div class="text-[10px] text-slate-500 mt-0.5">${alt}</div></div>`;
    const u = (t) => `<span class="text-xs font-medium text-slate-400">${t}</span>`;
    el('haritaKpi').innerHTML =
      kart('Santral', `${rows.length} ${u('/ ' + hepsi.length)}`, filtreSayisi() ? 'süzgeçe uyan' : 'tümü') +
      kart('Kurulu güç', `${tr0(kw)} ${u('kW')}`, filtreSayisi() ? 'süzgeçe uyan' + pay(kw, topla(hepsi.map((r) => r.m.kw))) : 'toplam') +
      kart(`${yil} üretimi`, `${tr0(uretim / 1000)} ${u('MWh')}`, `Oca–${AY[ay - 1]} • beklenen ${tr0(bekl / 1000)} MWh`) +
      kart('Beklenene göre verim', yuzde(verim), 'ağırlıklı ortalama', verim == null ? 'text-slate-400' : verim >= 0.95 ? 'text-emerald-400' : verim >= 0.85 ? 'text-amber-300' : verim >= 0.7 ? 'text-orange-400' : 'text-red-400') +
      kart('Anlık / bugün', canli.length ? `${tr1(anlik)} ${u('kW')}` : '—', canli.length ? `bugün ${tr0(bugun)} kWh • ${canli.length} santral canlı` : 'canlı veri yok') +
      (sor ? kart('Sorunlu santral', `${sor}`, 'arıza / haberleşme yok', 'text-red-400') : kart('Kaçınılan CO₂', `${tr0(co2)} ${u('t')}`, `${yil} Oca–${AY[ay - 1]} • ${String(ef).replace('.', ',')} kg/kWh`, 'text-lime-300'));
    el('haritaOzet').textContent = `${rows.length} santral • ${tr0(kw)} kW`;
  }

  function liste(rows) {
    const s = [...rows];
    const f = { verim: (a, b) => (a.m.verim ?? 9) - (b.m.verim ?? 9), kw: (a, b) => (b.m.kw || 0) - (a.m.kw || 0), ozgul: (a, b) => (b.m.ozgul || 0) - (a.m.ozgul || 0), ad: (a, b) => a.m.ad.localeCompare(b.m.ad, 'tr') }[siralama];
    s.sort(f);
    el('haritaListeBaslik').textContent = `${rows.length} santral`;
    el('haritaListe').innerHTML = s.length ? s.map((r) => `
      <button data-id="${r.m.id}" class="w-full text-left px-3 py-2 flex items-center gap-2.5 border-b border-slate-800/70 hover:bg-slate-800/60 transition ${secili === r.m.id ? 'bg-slate-800/80' : ''}">
        <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${renk(r)}"></span>
        <span class="min-w-0 flex-1"><span class="block text-xs text-slate-200 truncate">${esc(r.m.ad)}</span><span class="block text-[10px] text-slate-500">${esc(r.k.ilce || '')} • ${tr0(r.m.kw)} kW • ${esc(r.marka)}${r.k.gizli ? ' • konum gizli' : ''}</span></span>
        <span class="text-[11px] font-mono text-slate-400">${mod === 'ozgul' ? tr0(r.m.ozgul) : yuzde(r.m.verim)}</span>
      </button>`).join('') : '<p class="p-4 text-xs text-slate-500">Süzgeçlere uyan santral yok.</p>';
    el('haritaListe').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => sec_(b.dataset.id, true)));
  }

  function grafikCiz(id, yapi) { if (grafik[id]) grafik[id].destroy(); const k = el(id); if (k) grafik[id] = new Chart(k, yapi); }
  function grafikler(rows) {
    const v = Dash.veri(), { yil } = v.PERF.son_donem;
    // 1) ilçe (ilçe süzgeci hariç diğer süzgeçlerle)
    const ilc = {};
    suz(tum(), true).forEach((r) => { const a = buyuk(r.k.ilce) || '—'; ilc[a] = (ilc[a] || 0) + (r.m.kw || 0); });
    const il = Object.entries(ilc).sort((a, b) => b[1] - a[1]).slice(0, 12);
    grafikCiz('chHIlce', { type: 'bar', data: { labels: il.map((x) => guzelIlce(x[0])), datasets: [{ data: il.map((x) => x[1]), backgroundColor: il.map((x) => (!F.ilce.size || F.ilce.has(x[0]) ? '#f59e0b' : '#f59e0b44')), borderRadius: 3 }] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, onClick: (e, a) => { if (a.length) ilceAnahtar(il[a[0].index][0]); }, onHover: (e, a) => { e.native.target.style.cursor = a.length ? 'pointer' : ''; }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${tr0(c.parsed.x)} kW` } } }, scales: { y: { ticks: { autoSkip: false, font: { size: 10 } } } } } });
    // 2) verim dağılımı (verim süzgeci hariç)
    const q = F.verim; F.verim = 'hepsi'; const bas = suz(tum()); F.verim = q;
    const keys = ['a', 'b', 'c', 'd', 'yok'], say = keys.map((k) => bas.filter((r) => verimKey(r.m.verim) === k).length);
    grafikCiz('chHVerim', { type: 'bar', data: { labels: keys.map((k) => VERIM_AD[k]), datasets: [{ data: say, backgroundColor: keys.map((k) => (F.verim === 'hepsi' || F.verim === k ? VERIM_RENK[k] : VERIM_RENK[k] + '44')), borderRadius: 3 }] },
      options: { responsive: true, maintainAspectRatio: false, onClick: (e, a) => { if (a.length) { const k = keys[a[0].index]; F.verim = F.verim === k ? 'hepsi' : k; el('fVerim').value = F.verim; guncelle(true); } }, onHover: (e, a) => { e.native.target.style.cursor = a.length ? 'pointer' : ''; }, plugins: { legend: { display: false } }, scales: { y: { ticks: { precision: 0 } } } } });
    // 3) aylık üretim (süzgeçe uyan santraller): bu yıl, geçen yıl, beklenen
    const topAy = (k) => Array.from({ length: 12 }, (_, i) => { let t = 0, var_ = false; rows.forEach((r) => { const x = (k === 'bekl' ? r.m.s.beklenen_aylik : r.m.s.aylik[k] || [])[i]; if (x != null) { t += x; var_ = true; } }); return var_ ? t / 1000 : null; });
    const bu = topAy(String(yil)), gec = topAy(String(yil - 1)), bk = topAy('bekl');
    el('chHAylikAlt').textContent = rows.length ? `${rows.length} santral • ${yil}, ${yil - 1} ve beklenen` : 'Süzgeçe uyan santral yok';
    grafikCiz('chHAylik', { type: 'bar', data: { labels: AY, datasets: [
      { type: 'line', label: 'Beklenen', data: bk, borderColor: '#94a3b8', borderDash: [5, 3], borderWidth: 2, pointRadius: 0, tension: 0.3 },
      { label: String(yil - 1), data: gec, backgroundColor: '#cbd5e166', borderRadius: 2 },
      { label: String(yil), data: bu.map((x, i) => (x === 0 && i > 0 ? null : x)), backgroundColor: TV(), borderRadius: 2 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${tr1(c.parsed.y)} MWh` } } } } });
  }

  function lejant() {
    const ilceNot = ilceAcik ? (ilceMod === 'kirilgan' ? ' • ilçe rengi = iklim kırılganlığı (kırmızı yüksek, sarı orta, yeşil düşük)' : ' • ilçe tonu = kurulu güç (tıklayınca ilçe süzgeci)') : '';
    const oge = mod === 'canli' ? [['#10b981', 'Çalışıyor'], ['#38bdf8', 'Beklemede'], ['#ef4444', 'Arıza / haberleşme yok'], [GRI, 'Canlı bağlantı yok']]
      : mod === 'ozgul' ? [['#10b981', 'En verimli çeyrek'], ['#fcd34d', 'Üst orta'], ['#d9822b', 'Alt orta'], ['#ef4444', 'En düşük çeyrek'], [GRI, 'Veri yok']]
        : [['#10b981', '≥ %95'], ['#fcd34d', '%85–95'], ['#d9822b', '%70–85'], ['#ef4444', '< %70'], [GRI, 'Veri yok']];
    el('haritaLejant').innerHTML = oge.map(([c, t]) => `<span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full" style="background:${c}"></span>${t}</span>`).join('') +
      `<span class="text-slate-500">• daire boyutu = kurulu güç • kırmızı halka = canlı sorun${ilceNot}</span>` +
      '<span class="basis-full text-[10px] text-slate-600">Harita: © OpenStreetMap katkıcıları, Esri • İlçe sınırları: İzmir Büyükşehir Belediyesi Açık Veri Portalı (CC BY 4.0 kapsamında lisanslanan kamu sektörü bilgisi)</span>';
  }

  function rozetler() {
    const r = [];
    const ekle = (t, kaldir) => r.push(`<button class="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[11px] font-semibold hover:bg-amber-500/25 transition" data-k="${kaldir}">${esc(t)} ×</button>`);
    if (F.ara) ekle(`Arama: ${F.ara}`, 'ara');
    F.ilce.forEach((a) => ekle(`İlçe: ${guzelIlce(a)}`, 'ilce:' + a));
    if (F.durum !== 'hepsi') ekle(`Durum: ${DURUM_AD[F.durum]}`, 'durum');
    if (F.verim !== 'hepsi') ekle(`Verim: ${VERIM_AD[F.verim]}`, 'verim');
    if (F.marka !== 'hepsi') ekle(`Marka: ${F.marka}`, 'marka');
    if (F.kwMin > 0) ekle(`≥ ${F.kwMin} kW`, 'kw');
    el('fRozet').innerHTML = r.join('');
    el('fTemizle').classList.toggle('hidden', !r.length);
    el('fRozet').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.k;
      if (k === 'ara') { F.ara = ''; el('fAra').value = ''; } else if (k.startsWith('ilce:')) F.ilce.delete(k.slice(5));
      else if (k === 'durum') { F.durum = 'hepsi'; el('fDurum').value = 'hepsi'; } else if (k === 'verim') { F.verim = 'hepsi'; el('fVerim').value = 'hepsi'; }
      else if (k === 'marka') { F.marka = 'hepsi'; el('fMarka').value = 'hepsi'; } else if (k === 'kw') { F.kwMin = 0; el('fKw').value = 0; }
      guncelle(true);
    }));
  }

  // ---------- ana güncelleme ----------
  function guncelle(sigdirIste) {
    if (!harita || !kuruldu) return;
    const hepsi = tum();
    if (!hepsi.length) return;
    ozgulRenk = ozgulRenkFn(hepsi);
    const mk = el('fMarka');
    if (!mk.options.length || mk.dataset.n !== String(hepsi.length)) {
      mk.innerHTML = '<option value="hepsi">Hepsi</option>' + [...new Set(hepsi.map((r) => r.marka))].sort().map((x) => `<option value="${x}">${x}</option>`).join('');
      mk.value = F.marka; mk.dataset.n = String(hepsi.length);
    }
    el('fKwDeger').textContent = F.kwMin + ' kW';
    const rows = suz(hepsi);
    if (secili && !hepsi.some((r) => r.m.id === secili)) secili = null;
    ilceCiz();
    isaretciler(rows);
    kpi(rows); liste(rows); detay(rows); grafikler(rows); lejant(); rozetler();
    el('fKw').max = String(Math.ceil(Math.max(...hepsi.map((r) => r.m.kw || 0)) / 10) * 10);
    if (sigdirIste === true) sigdir();
  }

  async function ac() {
    const kap = el('haritaPano');
    if (!window.L) { kap.innerHTML = '<p class="p-6 text-sm text-slate-400">Harita kütüphanesi yüklenemedi (internet bağlantısını kontrol edin).</p>'; return; }
    if (!konumlar) {
      try { konumlar = await (await fetch('data/santral_konumlari.json?t=' + Date.now(), { cache: 'no-store' })).json(); }
      catch (e) { kap.innerHTML = '<p class="p-6 text-sm text-slate-400">Konum verisi yüklenemedi.</p>'; return; }
    }
    if (!ilceVeri) { try { ilceVeri = await (await fetch('data/izmir_ilceler.geojson')).json(); } catch (e) { ilceVeri = null; } }
    if (!kirilgan) { try { kirilgan = (await (await fetch('data/secap_izmir.json')).json()).kirilganlik; } catch (e) { kirilgan = []; } }
    if (!kuruldu) { kurIskelet(); if (window.lucide) lucide.createIcons(); }
    if (!harita) kurHarita();
    setTimeout(() => { harita.invalidateSize(); guncelle(); if (!sigdi) sigdir(); Object.values(grafik).forEach((g) => g && g.resize()); }, 60);
  }

  window.Harita = { ac, yenile() { if (harita) { guncelle(); if (!sigdi) sigdir(); } } };
  // Sayfa doğrudan #harita ile açılırsa dashboard.js bu dosyadan önce çalışmış olur
  if ((location.hash || '').slice(1) === 'harita') ac();
})();
