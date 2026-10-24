/* GES haritası (CBS görünümü) — Leaflet.
 * Konumlar: data/santral_konumlari.json (collector/konum_to_json.py). Veri ve canlı durum dashboard.js'ten Dash.veri() ile alınır.
 */
(function () {
  let sigdi = false, kirilgan = null, ilceMod = 'guc', ilceVeri = null, ilceKatman = null, ilceAcik = true, harita = null, konumlar = null, katman = null, mod = 'verim', secili = null;
  const isaret = {};   // id -> circleMarker

  const tr0 = (n) => n == null || isNaN(n) ? '—' : Math.round(n).toLocaleString('tr-TR');
  const tr1 = (n) => n == null || isNaN(n) ? '—' : n.toLocaleString('tr-TR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const yuzde = (v) => v == null || isNaN(v) ? '—' : '%' + Math.round(v * 100);

  const GRI = '#64748b';
  function verimRenk(v) {
    if (v == null) return GRI;
    if (v >= 0.95) return '#10b981';
    if (v >= 0.85) return '#fcd34d';
    if (v >= 0.70) return '#d9822b';
    return '#ef4444';
  }
  function durumRenk(c) {
    if (!c) return GRI;
    if (c.durum === 'Çalışıyor') return '#10b981';
    if (c.durum === 'Arızalı' || c.durum === 'Haberleşme Yok') return '#ef4444';
    if (c.durum === 'Beklemede') return '#38bdf8';
    return '#fcd34d';
  }
  const renk = (m, c) => (mod === 'canli' ? durumRenk(c) : verimRenk(m.verim));

  function satirlar() {
    const v = window.Dash && Dash.veri();
    if (!v || !v.M.length || !konumlar) return [];
    return v.M.filter((m) => konumlar[m.id]).map((m) => ({ m, k: konumlar[m.id], c: v.canliBul(m.s) }));
  }

  function acilis(r) {
    const { m, k, c } = r;
    const canli = c ? `<div style="margin-top:4px">Anlık <b>${tr1(c.anlik_kw)} kW</b> • bugün <b>${tr0(c.bugun_kwh)} kWh</b><br>Durum: <b style="color:${durumRenk(c)}">${c.durum}</b></div>` : '<div style="margin-top:4px;color:#94a3b8">Canlı bağlantı yok</div>';
    return `<div style="font:12px Inter,sans-serif;min-width:190px;color:#0f172a">
      <div style="font-weight:700;font-size:13px">${esc(m.ad)}</div>
      <div style="color:#64748b">${esc(k.ilce || '')} • ${tr0(m.kw)} kW</div>
      <div style="margin-top:4px">Verim <b style="color:${verimRenk(m.verim)}">${yuzde(m.verim)}</b> • son ay ${yuzde(m.sonVerim)}</div>${canli}
      <button onclick="Dash.sekme('santraller');Dash.detay('${m.id}')" style="margin-top:8px;padding:4px 10px;border-radius:6px;background:#0f172a;color:#fff;font-weight:600;font-size:11px">Ayrıntı</button></div>`;
  }

  const buyuk = (a) => String(a || '').toLocaleUpperCase('tr');

  // İlçe sınırları (İzBB Açık Veri, CC BY 4.0): kurulu güce göre boyalı, üzerine gelince ilçe özeti
  function ilceCiz() {
    if (ilceKatman) { ilceKatman.remove(); ilceKatman = null; }
    if (!ilceAcik || !ilceVeri || !harita) return;
    const ozet = {};
    satirlar().forEach((r) => {
      const o = ozet[buyuk(r.k.ilce)] = ozet[buyuk(r.k.ilce)] || { adet: 0, kw: 0 };
      o.adet += 1; o.kw += r.m.kw || 0;
    });
    const kmax = Math.max(1, ...Object.values(ozet).map((o) => o.kw));
    const kg = {};
    (kirilgan || []).forEach((x) => { kg[buyuk(x.ilce.trim())] = x; });
    const kgRenk = { Yüksek: '#ef4444', Orta: '#0b4f8a', Düşük: '#34d399' };
    ilceKatman = L.geoJSON(ilceVeri, {
      style: (f) => {
        const o = ozet[f.properties.adi];
        if (ilceMod === 'kirilgan' && kg[f.properties.adi]) return { color: '#94a3b8', weight: 1, opacity: 0.55, fillColor: kgRenk[kg[f.properties.adi].grup], fillOpacity: 0.3 };
        return { color: '#94a3b8', weight: 1, opacity: 0.55, fillColor: '#f59e0b', fillOpacity: o ? 0.05 + 0.17 * (o.kw / kmax) : 0.0 };
      },
      onEachFeature: (f, l) => {
        const o = ozet[f.properties.adi];
        const ad = f.properties.adi.charAt(0) + f.properties.adi.slice(1).toLocaleLowerCase('tr');
        const k = kg[f.properties.adi], kt = k ? `<br>İklim kırılganlığı: ${k.grup} (${k.endeks.toFixed(3).replace('.', ',')})` : '';
        l.bindTooltip((o ? `<b>${ad}</b><br>${o.adet} santral • ${tr0(o.kw)} kW` : `<b>${ad}</b><br>Santral yok`) + kt, { sticky: true });
      },
    }).addTo(harita);
    ilceKatman.bringToBack();
  }

  function ciz() {
    if (!harita) return;
    ilceCiz();
    if (katman) katman.remove();
    katman = L.layerGroup().addTo(harita);
    const rows = satirlar();
    const kmax = Math.max(1, ...rows.map((r) => r.m.kw || 0));
    rows.filter((r) => !r.k.gizli).forEach((r) => {   // konumu gizli tesis için işaretçi çizilmez
      const yaricap = 7 + 13 * Math.sqrt((r.m.kw || 0) / kmax);
      const sorun = r.c && (r.c.durum === 'Arızalı' || r.c.durum === 'Haberleşme Yok');
      const mk = L.circleMarker([r.k.lat, r.k.lon], {
        radius: yaricap, color: sorun ? '#fecaca' : '#0f172a', weight: sorun ? 3 : 2,
        fillColor: renk(r.m, r.c), fillOpacity: 0.9,
      }).addTo(katman).bindPopup(acilis(r)).bindTooltip(r.m.ad, { direction: 'top' });
      mk.on('click', () => { secili = r.m.id; liste(); });
      isaret[r.m.id] = mk;
    });
    liste();
  }

  function liste() {
    const rows = satirlar().sort((a, b) => (a.m.verim ?? 9) - (b.m.verim ?? 9));
    const el = document.getElementById('haritaListe');
    el.innerHTML = rows.map((r) => `
      <button data-id="${r.m.id}" class="w-full text-left px-3 py-2 flex items-center gap-2.5 border-b border-slate-800/70 hover:bg-slate-800/60 transition ${secili === r.m.id ? 'bg-slate-800/80' : ''}">
        <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${renk(r.m, r.c)}"></span>
        <span class="min-w-0 flex-1"><span class="block text-xs text-slate-200 truncate">${esc(r.m.ad)}</span><span class="block text-[10px] text-slate-500">${esc(r.k.ilce || '')} • ${tr0(r.m.kw)} kW${r.k.gizli ? ' • konum gizli' : ''}</span></span>
        <span class="text-[11px] font-mono text-slate-400">${yuzde(r.m.verim)}</span>
      </button>`).join('');
    el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.id, mk = isaret[id];
      if (!mk) return;
      secili = id;
      harita.flyTo(mk.getLatLng(), 14, { duration: 0.8 });
      mk.openPopup();
      liste();
    }));
    const adet = rows.length, ort = rows.filter((r) => r.m.verim != null);
    document.getElementById('haritaOzet').textContent = `${adet} santral • ${tr0(rows.reduce((t, r) => t + (r.m.kw || 0), 0))} kW`;
    document.getElementById('haritaLejant').innerHTML = (mod === 'canli'
      ? [['#10b981', 'Çalışıyor'], ['#38bdf8', 'Beklemede'], ['#ef4444', 'Arıza / haberleşme yok'], [GRI, 'Canlı bağlantı yok']]
      : [['#10b981', '≥ %95'], ['#fcd34d', '%85–95'], ['#d9822b', '%70–85'], ['#ef4444', '< %70'], [GRI, 'Veri yok']]
    ).map(([c, t]) => `<span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full" style="background:${c}"></span>${t}</span>`).join('') +
      '<span class="text-slate-500">• daire boyutu = kurulu güç • kırmızı halka = canlı sorun' + (ilceAcik ? (ilceMod === 'kirilgan' ? ' • ilçe rengi = iklim kırılganlığı (kırmızı yüksek, sarı orta, yeşil düşük; İzmir SECAP)' : ' • ilçe tonu = ilçedeki kurulu güç') : '') + '</span>' +
      '<span class="basis-full text-[10px] text-slate-600">Harita: © OpenStreetMap katkıcıları, Esri • İlçe sınırları: İzmir Büyükşehir Belediyesi Açık Veri Portalı (CC BY 4.0 kapsamında lisanslanan kamu sektörü bilgilerini içerir)</span>';
  }

  function kur() {
    // CARTO artık API anahtarı istediği için koyu zemin Esri Dark Gray (anahtarsız) + etiket katmanı
    const esri = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
    const koyu = L.layerGroup([
      L.tileLayer(esri + 'Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, maxNativeZoom: 16, attribution: 'Esri, HERE, Garmin, © OpenStreetMap katkıcıları' }),
      L.tileLayer(esri + 'Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, maxNativeZoom: 16 }),
    ]);
    const acik = L.layerGroup([
      L.tileLayer(esri + 'Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, maxNativeZoom: 16, attribution: 'Esri, HERE, Garmin, © OpenStreetMap katkıcıları' }),
      L.tileLayer(esri + 'Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, maxNativeZoom: 16 }),
    ]);
    const sokak = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' });
    const uydu = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Esri, Maxar, Earthstar Geographics' });
    harita = L.map('haritaKap', { layers: [acik], zoomControl: true, scrollWheelZoom: true }).setView([38.5, 27.1], 9);
    L.control.layers({ 'Açık': acik, 'Koyu': koyu, 'Sokak': sokak, 'Uydu': uydu }, null, { position: 'topright' }).addTo(harita);
  }

  function sigdir() {
    const rows = satirlar();
    if (!rows.length) return;
    sigdi = true;
    harita.fitBounds(L.latLngBounds(rows.filter((r) => !r.k.gizli).map((r) => [r.k.lat, r.k.lon])), { padding: [40, 40], maxZoom: 11 });
  }

  async function ac() {
    if (!window.L) { document.getElementById('haritaKap').innerHTML = '<p class="p-6 text-sm text-slate-400">Harita kütüphanesi yüklenemedi (internet bağlantısını kontrol edin).</p>'; return; }
    if (!konumlar) {
      try { konumlar = await (await fetch('data/santral_konumlari.json?t=' + Date.now(), { cache: 'no-store' })).json(); }
      catch (e) { document.getElementById('haritaKap').innerHTML = '<p class="p-6 text-sm text-slate-400">Konum verisi yüklenemedi.</p>'; return; }
    }
    if (!ilceVeri) {
      try { ilceVeri = await (await fetch('data/izmir_ilceler.geojson')).json(); } catch (e) { ilceVeri = null; }
    }
    if (!kirilgan) {
      try { kirilgan = (await (await fetch('data/secap_izmir.json')).json()).kirilganlik; } catch (e) { kirilgan = []; }
    }
    const ilk = !harita;
    if (ilk) kur();
    setTimeout(() => { harita.invalidateSize(); ciz(); if (!sigdi) sigdir(); }, 60);
  }

  const ilceDugme = document.getElementById('haritaIlce');
  if (ilceDugme) ilceDugme.addEventListener('click', () => {
    ilceAcik = !ilceAcik;
    ilceDugme.className = 'px-2.5 py-1 rounded-md text-[11px] font-semibold transition ' + (ilceAcik ? 'bg-amber-500/15 text-amber-300' : 'text-slate-400 hover:text-slate-200');
    ciz();
  });

  const kirDugme = document.getElementById('haritaKirilgan');
  if (kirDugme) kirDugme.addEventListener('click', () => {
    ilceMod = ilceMod === 'kirilgan' ? 'guc' : 'kirilgan';
    if (ilceMod === 'kirilgan' && !ilceAcik) { ilceAcik = true; }
    kirDugme.className = 'px-2.5 py-1 rounded-md text-[11px] font-semibold transition ' + (ilceMod === 'kirilgan' ? 'bg-amber-500/15 text-amber-300' : 'text-slate-400 hover:text-slate-200');
    ciz();
  });

  document.querySelectorAll('[data-hmod]').forEach((b) => b.addEventListener('click', () => {
    mod = b.dataset.hmod;
    document.querySelectorAll('[data-hmod]').forEach((x) => {
      x.className = 'px-2.5 py-1 rounded-md text-[11px] font-semibold transition ' + (x === b ? 'bg-amber-500/15 text-amber-300' : 'text-slate-400 hover:text-slate-200');
    });
    ciz();
  }));
  document.querySelectorAll('[data-hmod]').forEach((x) => { if (x.dataset.hmod === mod) x.className = 'px-2.5 py-1 rounded-md text-[11px] font-semibold transition bg-amber-500/15 text-amber-300'; else x.className = 'px-2.5 py-1 rounded-md text-[11px] font-semibold transition text-slate-400 hover:text-slate-200'; });

  window.Harita = { ac, yenile() { if (harita) { ciz(); if (!sigdi) sigdir(); } } };
  // Sayfa doğrudan #harita ile açılırsa dashboard.js bu dosyadan önce çalışmış olur
  if ((location.hash || '').slice(1) === 'harita') ac();
})();
