/* ISO 50001 sekmesi: tesis bazında enerji referans çizgisi (EnRÇ) takibi ve enerji eylem planı.
 *
 * Veri: data/iso50001.enc.json (şifreli; collector/iso50001_to_json.py üretir). Parola elektrik sekmesiyle ortaktır
 * (oturum boyunca sessionStorage'da 'elp' anahtarında tutulur).
 * Sapma = (gerçekleşen − referans) ÷ referans. Pozitif sapma referans çizgisinin (hedef tüketimin) aşıldığı anlamına gelir.
 * index.html'deki esc() kullanılır.
 */
(function () {
  const AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const RENK = { Elektrik: '#fbbf24', 'Doğalgaz': '#22d3ee' };
  let D = null, sifreli = null, tesis = 'aassm', yil = '2024', yuklendi = false;
  const grafik = {};

  const tr0 = (n) => (n == null || isNaN(n) ? '—' : Math.round(n).toLocaleString('tr-TR'));
  const yuzde = (v) => (v == null || isNaN(v) ? '—' : (v >= 0 ? '+' : '') + (v * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + '%');
  const topla = (a) => (a || []).reduce((t, v) => t + (v || 0), 0);
  const b64 = (t) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
  const oturum = (k, v) => { try { return v === undefined ? sessionStorage.getItem(k) : (v === null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v)); } catch (e) { return null; } };
  const sinif = (s) => (s == null ? 'text-slate-300' : s > 0.02 ? 'text-red-400' : s > 0 ? 'text-amber-300' : 'text-emerald-400');

  async function coz(parola) {
    const malzeme = await crypto.subtle.importKey('raw', new TextEncoder().encode(parola), 'PBKDF2', false, ['deriveKey']);
    const anahtar = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64(sifreli.salt), iterations: sifreli.iter, hash: 'SHA-256' },
      malzeme, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(sifreli.iv) }, anahtar, b64(sifreli.data))));
  }

  async function parolaDene(p) {
    try { D = await coz(p); yuklendi = true; return true; } catch (e) { return false; }
  }

  function girisFormu(hata) {
    document.getElementById('isoIcerik').innerHTML = `<form id="isoGiris" class="max-w-sm mx-auto my-10 bg-slate-800/60 border border-slate-700 rounded-xl p-5 space-y-3">
      <div class="flex items-center gap-2 text-amber-300 font-semibold"><i data-lucide="lock" class="w-4 h-4"></i> Yönetici girişi</div>
      <p class="text-xs text-slate-400">ISO 50001 verileri şifreli saklanır. Görmek için parolayı girin (Elektrik sekmesiyle aynı parola).</p>
      <input id="isoParola" type="password" autocomplete="current-password" class="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm" placeholder="Parola" />
      <p class="text-xs text-rose-400 ${hata ? '' : 'hidden'}">${hata || ''}</p>
      <button class="w-full bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold rounded-lg py-2 text-sm">Giriş</button>
    </form>`;
    if (window.lucide) lucide.createIcons();
    document.getElementById('isoGiris').onsubmit = async (ev) => {
      ev.preventDefault();
      const p = document.getElementById('isoParola').value;
      if (await parolaDene(p)) { oturum('elp', p); window.Iso.ac(); } else girisFormu('Parola yanlış.');
    };
  }

  async function yukle() {
    try {
      if (!sifreli) {
        const r = await fetch('data/iso50001.enc.json?t=' + Date.now(), { cache: 'no-store' });
        if (!r.ok) throw new Error(r.status);
        sifreli = await r.json();
      }
      const kayitli = oturum('elp');
      if (kayitli && await parolaDene(kayitli)) return;
      oturum('elp', null);
    } catch (e) {
      sifreli = null;
      document.getElementById('isoIcerik').innerHTML = '<p class="text-sm text-slate-400 p-6">ISO 50001 verisi henüz yüklenmedi.</p>';
    }
  }

  function cizGrafik(id, yapi) {
    if (grafik[id]) grafik[id].destroy();
    const el = document.getElementById(id);
    if (el && window.Chart) grafik[id] = new Chart(el, yapi);
  }

  const seriler = () => D.seriler.filter((s) => s.tesis === tesis && s.yillar[yil]);

  function ozetKartlari() {
    const gruplar = {};
    seriler().forEach((s) => {
      const v = s.yillar[yil];
      const g = (gruplar[s.enerji] = gruplar[s.enerji] || { birim: s.birim, takip: 0, ref: 0, hedef: v.hedef });
      g.takip += topla(v.takip); g.ref += topla(v.referans);
    });
    const kart = (b, d, alt, renk) => `<div class="glass-card rounded-xl p-4"><div class="text-[11px] uppercase tracking-wider text-slate-400">${b}</div><div class="text-2xl font-bold mt-1 ${renk || 'text-white'}">${d}</div><div class="text-[11px] text-slate-500 mt-1">${alt}</div></div>`;
    document.getElementById('isoKartlar').innerHTML = Object.entries(gruplar).map(([e, g]) => {
      const sapma = g.ref ? g.takip / g.ref - 1 : null;
      return kart(`${e} (${yil})`, `${tr0(g.takip)} <span class="text-sm font-medium text-slate-400">${g.birim}</span>`,
        `Referans ${tr0(g.ref)} • <span class="${sinif(sapma)} font-semibold">${yuzde(sapma)}</span> ${sapma != null && sapma <= 0 ? '(referansın altında)' : '(referansın üstünde)'}`, e === 'Elektrik' ? 'text-amber-300' : 'text-cyan-300');
    }).join('') + kart('Hedef', '%' + ((seriler()[0] && seriler()[0].yillar[yil].hedef || 0.02) * 100).toLocaleString('tr-TR'), 'Her enerji kullanımı için yıllık tasarruf hedefi (Excel\'deki HEDEF hücresi)');
  }

  function seriKarti(s, i) {
    const v = s.yillar[yil], cid = 'chIso' + i;
    const t = topla(v.takip), r = topla(v.referans), sapma = r ? t / r - 1 : null;
    const aylik = v.takip.map((x, a) => ({ x, r: v.referans[a], d: x != null && v.referans[a] ? x / v.referans[a] - 1 : null }));
    const degAd = Object.keys(v.degiskenler);
    const tablo = `<div class="overflow-x-auto"><table class="w-full text-[11px]">
      <thead class="text-slate-400 uppercase tracking-wider"><tr><th class="text-left py-1.5">Ay</th><th class="text-right">Gerçekleşen</th><th class="text-right">Referans</th><th class="text-right">Sapma</th>${degAd.map((d) => `<th class="text-right">${esc(d)}</th>`).join('')}<th class="text-left pl-3">Sapma gerekçesi</th></tr></thead>
      <tbody class="divide-y divide-slate-800/70">${aylik.map((m, a) => `<tr><td class="py-1.5 text-slate-200">${AY[a]}</td><td class="text-right font-mono">${tr0(m.x)}</td><td class="text-right font-mono text-slate-400">${tr0(m.r)}</td>
        <td class="text-right font-mono ${sinif(m.d)}">${yuzde(m.d)}</td>${degAd.map((d) => `<td class="text-right font-mono text-slate-400">${tr0(v.degiskenler[d][a])}</td>`).join('')}<td class="pl-3 text-slate-400">${esc(v.gerekce[a] || '')}</td></tr>`).join('')}</tbody></table></div>`;
    return `<div class="glass-card rounded-xl p-4">
      <div class="flex items-start justify-between gap-3">
        <div><div class="text-sm font-semibold text-white">${esc(s.bolum)}</div><div class="text-[11px]" style="color:${RENK[s.enerji]}">${esc(s.enerji)} • ${esc(s.birim)}</div></div>
        <div class="text-right"><div class="text-lg font-bold ${sinif(sapma)}">${yuzde(sapma)}</div><div class="text-[11px] text-slate-500">${tr0(t)} / ${tr0(r)}</div></div>
      </div>
      <div class="h-44 mt-3"><canvas id="${cid}"></canvas></div>
      <details class="mt-2 text-xs"><summary class="cursor-pointer text-slate-300">Aylık ayrıntı ve gerekçeler</summary><div class="mt-2">${tablo}</div></details>
    </div>`;
  }

  function seriGrafikleri() {
    seriler().forEach((s, i) => {
      const v = s.yillar[yil];
      cizGrafik('chIso' + i, {
        data: { labels: AY, datasets: [
          { type: 'bar', label: 'Gerçekleşen', data: v.takip, backgroundColor: RENK[s.enerji], borderRadius: 3, order: 2 },
          { type: 'line', label: 'Referans çizgisi', data: v.referans, borderColor: '#e2e8f0', backgroundColor: '#e2e8f0', borderWidth: 2, tension: 0.3, pointRadius: 0, order: 1 },
        ] },
        options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
          plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${tr0(c.parsed.y)} ${s.birim}` } } },
          scales: { y: { ticks: { callback: (x) => (x >= 1000 ? (x / 1000).toLocaleString('tr-TR') + ' bin' : x) } } } },
      });
    });
  }

  function eylemTablosu() {
    const liste = D.eylem[tesis] || [];
    const genel = D.eylem.genel || [];
    const satir = (e) => {
      const bitti = /yapıldı|tamamlandı|gerçekleştirildi/i.test((e.durum || '') + ' ' + (e.termin || ''));
      return `<tr class="align-top"><td class="px-3 py-2 text-slate-400">${esc(e.no)}</td><td class="px-3 py-2"><span class="px-2 py-0.5 rounded-md text-[10px] font-semibold ${e.enerji === 'Elektrik' ? 'bg-amber-500/15 text-amber-300' : e.enerji === 'Doğalgaz' ? 'bg-cyan-500/15 text-cyan-300' : 'bg-slate-700 text-slate-300'}">${esc(e.enerji || '')}</span></td>
        <td class="px-3 py-2 text-slate-100 w-[34%]">${esc(e.onlem || '—')}</td><td class="px-3 py-2 text-slate-400">${bitti ? '<span class="text-emerald-400 font-semibold">✓ </span>' : ''}${esc(e.termin || '—')}</td><td class="px-3 py-2 font-mono text-slate-300">${esc(e.hedef || '—')}</td>
        <td class="px-3 py-2 text-slate-400 w-[26%]">${esc(e.durum || '—')}</td></tr>`;
    };
    const blok = (baslik, l) => l.length ? `<tr class="bg-slate-900/60"><td colspan="6" class="px-3 py-2 text-[11px] uppercase tracking-wider text-slate-400">${baslik}</td></tr>${l.map(satir).join('')}` : '';
    document.getElementById('isoEylem').innerHTML = `<thead class="bg-slate-900/80 text-slate-400 uppercase tracking-wider text-[11px]"><tr><th class="text-left px-3 py-3">No</th><th class="text-left px-3">Enerji</th><th class="text-left px-3">Önlem / iyileştirme</th><th class="text-left px-3">Termin</th><th class="text-left px-3">Hedeflenen kazanç</th><th class="text-left px-3">Gerçekleşme durumu</th></tr></thead>
      <tbody class="divide-y divide-slate-800/70">${blok('Tesise özel eylemler (' + liste.length + ')', liste)}${blok('Genel eylemler (' + genel.length + ')', genel)}</tbody>`;
  }

  function notlar() {
    const n = D.veri_notlari || [];
    document.getElementById('isoNotlar').innerHTML = `<details class="glass-card rounded-xl p-4 text-xs text-slate-400"><summary class="cursor-pointer text-slate-300 font-medium">Okuma notları${n.length ? ` ve Excel'de ${n.length} tutarsızlık` : ''}</summary>
      <ul class="mt-2 list-disc pl-5 space-y-1">
        <li><b class="text-slate-300">Sapma</b> = (gerçekleşen − referans) ÷ referans. Pozitif (kırmızı/turuncu) değer referans çizgisinin aşıldığını, negatif (yeşil) değer altında kaldığını gösterir.</li>
        <li>Referans çizgisi, Excel'deki EnRÇ hesabından (önceki yıl verisi, gerekirse HDD/CDD, etkinlik sayısı gibi değişkenlerle) aynen alınmıştır; burada yeniden hesaplanmaz. 2023 için referans yılı 2022'dir; 2024'te dosyaların çoğunda 2022–2023 ortalaması kullanılır.</li>
        <li>Yatırım tutarları (TL) eylem planından bilerek alınmamıştır.</li>
        ${n.map((x) => `<li>${esc(x.yil)} ${esc(x.seri)}: Excel toplamı ${tr0(x.excel_toplam)}, aylık değerlerin toplamı ${tr0(x.aylik_toplam)}. ${esc(x.not)}</li>`).join('')}
      </ul></details>`;
  }

  function iskelet() {
    document.getElementById('isoIcerik').innerHTML = `<div class="space-y-6">
      <div class="flex flex-wrap items-center gap-3">
        <div id="isoTesisler" class="flex flex-wrap gap-2 mr-auto"></div>
        <label class="text-[11px] text-slate-400">Yıl <select id="isoYil" onchange="Iso.yil(this.value)" class="ml-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-100"></select></label>
      </div>
      <h2 id="isoBaslik" class="text-lg font-bold text-white"></h2>
      <section id="isoKartlar" class="grid grid-cols-1 sm:grid-cols-3 gap-4"></section>
      <section id="isoSeriler" class="grid grid-cols-1 lg:grid-cols-2 gap-4"></section>
      <section class="glass-card rounded-xl overflow-hidden"><div class="p-4 border-b border-slate-800"><h2 class="text-sm font-semibold text-white">Enerji eylem planı</h2></div><div class="overflow-x-auto"><table id="isoEylem" class="w-full text-xs"></table></div></section>
      <div id="isoNotlar"></div></div>`;
  }

  function ciz() {
    if (!document.getElementById('isoTesisler')) iskelet();
    const t = D.tesisler.find((x) => x.id === tesis);
    document.getElementById('isoTesisler').innerHTML = D.tesisler.map((x) => `<button data-iso-tesis="${x.id}" onclick="Iso.tesis('${x.id}')" class="px-3 py-1.5 rounded-lg text-xs font-semibold ${x.id === tesis ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-300 hover:text-white'}">${esc(x.ad)}</button>`).join('');
    document.getElementById('isoYil').innerHTML = ['2023', '2024'].map((y) => `<option ${y === yil ? 'selected' : ''}>${y}</option>`).join('');
    document.getElementById('isoBaslik').textContent = t ? t.ad : '';
    ozetKartlari();
    document.getElementById('isoSeriler').innerHTML = seriler().map(seriKarti).join('');
    seriGrafikleri(); eylemTablosu(); notlar();
    if (window.lucide) lucide.createIcons();
  }

  window.Iso = {
    async ac() {
      if (!yuklendi) await yukle();
      if (!yuklendi) { if (sifreli) girisFormu(); return; }
      ciz();
    },
    tesis(id) { tesis = id; ciz(); },
    yil(y) { yil = y; ciz(); },
  };
})();
