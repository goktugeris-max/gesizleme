// Ortak "en yüksek tüketimli ilk 20" harita bileşeni (Doğalgaz, Elektrik sekmeleri için).
// Veride adres/koordinat yok: işaretçiler İLÇE merkezine, üst üste binmesin diye küçük sapmayla konur (yaklaşık konum).
(function () {
  let ilceMerkez = null;
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const buyuk = (t) => String(t || '').toLocaleUpperCase('tr');

  async function merkezler() {
    if (ilceMerkez) return ilceMerkez;
    ilceMerkez = {};
    try {
      const g = await (await fetch('data/izmir_ilceler.geojson')).json();
      g.features.forEach((f) => {
        const halkalar = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates.map((p) => p[0]) : [f.geometry.coordinates[0]];
        const h = halkalar.sort((a, b) => b.length - a.length)[0];
        let x = 0, y = 0; h.forEach((p) => { x += p[0]; y += p[1]; });
        ilceMerkez[buyuk(f.properties.adi)] = [y / h.length, x / h.length];
      });
    } catch (e) { /* harita ilçe merkezi olmadan çizilmez */ }
    return ilceMerkez;
  }

  // noktalar: [{ad, ilce, deger, etiket, alt}] (değere göre sıralı, ilk 20'si çizilir)
  async function ciz(kapId, noktalar, secenek) {
    const kap = document.getElementById(kapId);
    if (!kap || !window.L) return;
    const mer = await merkezler();
    const ilk = noktalar.filter((n) => mer[buyuk(n.ilce)]).sort((a, b) => b.deger - a.deger).slice(0, 20);
    if (kap._harita) { kap._harita.remove(); kap._harita = null; }
    const koyu = window.koyuMu && koyuMu();
    const esri = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
    const tur = koyu ? 'Dark' : 'Light';
    const harita = L.map(kap, { layers: [L.tileLayer(esri + `Canvas/World_${tur}_Gray_Base/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 19, maxNativeZoom: 16, attribution: 'Esri, HERE, Garmin, © OpenStreetMap katkıcıları' }),
      L.tileLayer(esri + `Canvas/World_${tur}_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 19, maxNativeZoom: 16 })] }).setView([38.45, 27.1], 9);
    kap._harita = harita;
    const enBuyuk = Math.max(1, ...ilk.map((n) => n.deger));
    const sayac = {}, renk = (secenek && secenek.renk) || '#e0662c';
    const grup = L.featureGroup().addTo(harita);
    ilk.forEach((n, i) => {
      const anah = buyuk(n.ilce), k = (sayac[anah] = (sayac[anah] || 0) + 1) - 1, c = mer[anah];
      const aci = k * 2.4, yaricap = 0.04 * Math.sqrt(k);   // aynı ilçedekiler spiral yerleşir
      const yer = [c[0] + yaricap * Math.cos(aci), c[1] + yaricap * 1.25 * Math.sin(aci)];
      const r = 8 + 13 * Math.sqrt(n.deger / enBuyuk);
      L.marker(yer, { icon: L.divIcon({ className: '', iconSize: [r * 2, r * 2], iconAnchor: [r, r],
        html: `<div style="width:${r * 2}px;height:${r * 2}px;border-radius:50%;background:${renk};opacity:.88;border:2px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.4);color:#fff;font:700 ${r > 14 ? 13 : 11}px/${r * 2 - 4}px system-ui;text-align:center">${i + 1}</div>` }) })
        .bindPopup(`<b>${i + 1}. ${esc(n.ad)}</b><br>${esc(n.ilce)} • ${esc(n.etiket)}${n.alt ? '<br><span style="color:#64748b">' + esc(n.alt) + '</span>' : ''}`)
        .addTo(grup);
    });
    if (ilk.length) harita.fitBounds(grup.getBounds().pad(0.25), { maxZoom: 11 });
    setTimeout(() => harita.invalidateSize(), 80);
    return ilk;
  }
  window.TopHarita = { ciz };
})();
