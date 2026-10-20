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
  let D = null, sifreli = null, tesis = 'aassm', yil = '2024', yuklendi = false, rfTur = 'hepsi';
  const grafik = {};

  const tr0 = (n) => (n == null || isNaN(n) ? '—' : Math.round(n).toLocaleString('tr-TR'));
  const yuzde = (v) => (v == null || isNaN(v) ? '—' : (v >= 0 ? '+' : '') + (v * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + '%');
  const topla = (a) => (a || []).reduce((t, v) => t + (v || 0), 0);
  const b64 = (t) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
  const oturum = (k, v) => { try { return v === undefined ? sessionStorage.getItem(k) : (v === null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v)); } catch (e) { return null; } };
  // kısmi yıllarda sapma yalnızca hem gerçekleşen hem referansı olan aylar üzerinden hesaplanır
  const karsilastir = (v) => { let t = 0, r = 0, n = 0; v.takip.forEach((x, i) => { if (x != null && v.referans[i] != null) { t += x; r += v.referans[i]; n++; } }); return { t, r, n }; };
  const veriAy = (v) => v.takip.filter((x) => x != null).length;
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
      const v = s.yillar[yil], c = karsilastir(v);
      const g = (gruplar[s.enerji] = gruplar[s.enerji] || { birim: s.birim, takip: 0, kt: 0, kr: 0, ay: 0, sn: 0, sr: 0 });
      g.takip += topla(v.takip); g.kt += c.t; g.kr += c.r; g.ay = Math.max(g.ay, veriAy(v)); g.sn++; if (c.n) g.sr++;
    });
    const kart = (b, d, alt, renk) => `<div class="glass-card rounded-xl p-4"><div class="text-[11px] uppercase tracking-wider text-slate-400">${b}</div><div class="text-2xl font-bold mt-1 ${renk || 'text-white'}">${d}</div><div class="text-[11px] text-slate-500 mt-1">${alt}</div></div>`;
    document.getElementById('isoKartlar').innerHTML = Object.entries(gruplar).map(([e, g]) => {
      const sapma = g.kr ? g.kt / g.kr - 1 : null;
      const donem = g.ay < 12 ? `Oca–${AY[g.ay - 1]} ${yil}` : yil;
      return kart(`${e} (${donem})`, `${tr0(g.takip)} <span class="text-sm font-medium text-slate-400">${g.birim}</span>`,
        g.kr ? `${g.sr < g.sn ? `Yalnızca referansı olan ${g.sr}/${g.sn} seride: ` : ''}Referans ${tr0(g.kr)} • <span class="${sinif(sapma)} font-semibold">${yuzde(sapma)}</span> ${sapma <= 0 ? '(referansın altında)' : '(referansın üstünde)'}` : 'Referans çizgisi yok (bkz. okuma notları)', e === 'Elektrik' ? 'text-amber-300' : 'text-cyan-300');
    }).join('') + kart('Hedef', '%' + ((seriler()[0] && seriler()[0].yillar[yil].hedef || 0.02) * 100).toLocaleString('tr-TR'), 'Her enerji kullanımı için yıllık tasarruf hedefi (Excel\'deki HEDEF hücresi)');
  }

  function seriKarti(s, i) {
    const v = s.yillar[yil], cid = 'chIso' + i;
    const c = karsilastir(v), t = topla(v.takip), sapma = c.r ? c.t / c.r - 1 : null;
    const yontem = v.yontem === 'regresyon' ? 'Referans: regresyon (2024 katsayıları)' : v.yontem === 'ortalama' ? 'Referans: 2022–2023 ortalaması' : '';
    const aylik = v.takip.map((x, a) => ({ x, r: v.referans[a], d: x != null && v.referans[a] ? x / v.referans[a] - 1 : null }));
    const degAd = Object.keys(v.degiskenler);
    const tablo = `<div class="overflow-x-auto"><table class="w-full text-[11px]">
      <thead class="text-slate-400 uppercase tracking-wider"><tr><th class="text-left py-1.5">Ay</th><th class="text-right">Gerçekleşen</th><th class="text-right">Referans</th><th class="text-right">Sapma</th>${degAd.map((d) => `<th class="text-right">${esc(d)}</th>`).join('')}<th class="text-left pl-3">Sapma gerekçesi</th></tr></thead>
      <tbody class="divide-y divide-slate-800/70">${aylik.map((m, a) => `<tr><td class="py-1.5 text-slate-200">${AY[a]}</td><td class="text-right font-mono">${tr0(m.x)}</td><td class="text-right font-mono text-slate-400">${tr0(m.r)}</td>
        <td class="text-right font-mono ${sinif(m.d)}">${yuzde(m.d)}</td>${degAd.map((d) => `<td class="text-right font-mono text-slate-400">${tr0(v.degiskenler[d][a])}</td>`).join('')}<td class="pl-3 text-slate-400">${esc(v.gerekce[a] || '')}</td></tr>`).join('')}</tbody></table></div>`;
    return `<div class="glass-card rounded-xl p-4">
      <div class="flex items-start justify-between gap-3">
        <div><div class="text-sm font-semibold text-white">${esc(s.bolum)}</div><div class="text-[11px]" style="color:${RENK[s.enerji]}">${esc(s.enerji)} • ${esc(s.birim)}</div>${yontem ? `<div class="text-[10px] text-slate-500 mt-0.5">${yontem}</div>` : ''}</div>
        <div class="text-right"><div class="text-lg font-bold ${sinif(sapma)}">${yuzde(sapma)}</div><div class="text-[11px] text-slate-500">${c.r ? `${tr0(c.t)} / ${tr0(c.r)}` : `${tr0(t)} • referans yok`}</div></div>
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

  function ekBolum() {
    const el = document.getElementById('isoEk');
    const ek = D.ek || {}, m = (ek.motorin || {})[tesis], h = ek.havuz && tesis === 'buz' ? ek.havuz[yil] : null;
    let html = '';
    if (m) {
      const yl = Object.keys(m).sort();
      html += `<div class="glass-card rounded-xl p-4"><h2 class="text-sm font-semibold text-white mb-3">Motorin kullanımı</h2>
        <table class="w-full text-xs"><thead class="text-slate-400 uppercase tracking-wider text-[11px]"><tr><th class="text-left py-1.5">Yıl</th><th class="text-right">Miktar</th></tr></thead>
        <tbody class="divide-y divide-slate-800/70">${yl.map((y) => `<tr><td class="py-1.5 text-slate-200">${y}</td><td class="text-right font-mono ${m[y] ? 'text-amber-300' : 'text-slate-500'}">${tr0(m[y])}</td></tr>`).join('')}</tbody></table>
        <p class="text-[11px] text-slate-500 mt-2">Excel'de birim yazmıyor; litre varsayılmıştır.</p></div>`;
    }
    if (h) html += `<div class="glass-card rounded-xl p-4"><h2 class="text-sm font-semibold text-white mb-3">Buz pisti ve havuz elektriği (${yil})</h2><div class="h-52"><canvas id="chIsoHavuz"></canvas></div>
        <p class="text-[11px] text-slate-500 mt-2">Havuz tüketimi toplamdan ayrılır; yukarıdaki Buz Sporları elektrik serisi havuz çıkarılmış değerdir.</p></div>`;
    el.innerHTML = html;
    el.classList.toggle('hidden', !html);
    if (h) cizGrafik('chIsoHavuz', {
      data: { labels: AY, datasets: [
        { type: 'bar', label: 'Buz pisti (havuz hariç)', data: h.toplam.map((x, i) => (x == null ? null : x - (h.havuz[i] || 0))), backgroundColor: '#fbbf24', stack: 'a', borderRadius: 3 },
        { type: 'bar', label: 'Havuz', data: h.havuz, backgroundColor: '#22d3ee', stack: 'a', borderRadius: 3 },
      ] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } } }, scales: { x: { stacked: true }, y: { stacked: true, ticks: { callback: (x) => (x / 1000).toLocaleString('tr-TR') + ' bin' } } } },
    });
  }

  const seviyeSinif = (n) => (n == null ? 'bg-slate-700 text-slate-300' : n >= 12 ? 'bg-red-500/20 text-red-300' : n >= 6 ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300');

  function riskBolumu() {
    const el = document.getElementById('isoRisk');
    const tesisRisk = (D.risk && D.risk[tesis]) || [], genel = (D.risk && D.risk.genel) || [];
    if (!tesisRisk.length && !genel.length) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const sec = (l) => l.filter((x) => rfTur === 'hepsi' || x.tur === (rfTur === 'risk' ? 'Risk' : 'Fırsat'));
    const say = (l) => ({ r: l.filter((x) => x.tur === 'Risk').length, f: l.filter((x) => x.tur === 'Fırsat').length, y: l.filter((x) => x.tur === 'Risk' && (x.seviye || 0) >= 12).length });
    const t = say(tesisRisk), g = say(genel);
    const satir = (x) => `<tr class="align-top"><td class="px-3 py-2 text-slate-400 whitespace-nowrap">${esc(x.no || '')}<div class="text-[10px] text-slate-500">${esc(x.proses || '')}</div></td>
      <td class="px-3 py-2"><span class="px-2 py-0.5 rounded-md text-[10px] font-semibold ${x.tur === 'Risk' ? 'bg-rose-500/15 text-rose-300' : 'bg-sky-500/15 text-sky-300'}">${esc(x.tur)}</span><div class="text-[10px] text-slate-500 mt-1">${esc(x.kaynak || '')}</div></td>
      <td class="px-3 py-2 text-slate-100 w-[32%]">${esc(x.tanim)}</td>
      <td class="px-3 py-2 whitespace-nowrap text-center"><span class="px-2 py-0.5 rounded-md font-mono text-[11px] font-semibold ${seviyeSinif(x.seviye)}">${x.seviye == null ? '—' : tr0(x.seviye)}</span><div class="text-[10px] text-slate-500 mt-1">O${tr0(x.o)} × E${tr0(x.e)}</div></td>
      <td class="px-3 py-2 text-center">${x.sonra != null ? `<span class="px-2 py-0.5 rounded-md font-mono text-[11px] font-semibold ${seviyeSinif(x.sonra)}">${tr0(x.sonra)}</span>` : '<span class="text-slate-600">—</span>'}</td>
      <td class="px-3 py-2 text-slate-300 w-[22%]">${esc(x.aksiyon || '—')}<div class="text-[10px] text-slate-500 mt-1">${esc(x.sorumlu || '')}</div></td>
      <td class="px-3 py-2 text-slate-400 w-[22%]">${esc(x.faaliyet || '—')}</td></tr>`;
    const blok = (baslik, l) => (sec(l).length ? `<tr class="bg-slate-900/60"><td colspan="7" class="px-3 py-2 text-[11px] uppercase tracking-wider text-slate-400">${baslik}</td></tr>${sec(l).map(satir).join('')}` : '');
    const dugme = (k, ad) => `<button onclick="Iso.rf('${k}')" class="px-2.5 py-1 rounded-md text-[11px] font-semibold ${rfTur === k ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-slate-200'}">${ad}</button>`;
    el.innerHTML = `<div class="p-4 border-b border-slate-800 flex flex-wrap items-center gap-3">
        <h2 class="text-sm font-semibold text-white mr-auto">Risk ve fırsat değerlendirmesi</h2>
        <div class="text-[11px] text-slate-400">Bu tesis: <b class="text-rose-300">${t.r} risk</b> (${t.y} yüksek) • <b class="text-sky-300">${t.f} fırsat</b> &nbsp; Genel: ${g.r} risk • ${g.f} fırsat</div>
        <div class="flex gap-1 bg-slate-900/80 rounded-lg p-0.5">${dugme('hepsi', 'Tümü')}${dugme('risk', 'Riskler')}${dugme('firsat', 'Fırsatlar')}</div>
      </div>
      <div class="overflow-auto max-h-[40rem]"><table class="w-full text-xs"><thead class="bg-slate-900 text-slate-400 uppercase tracking-wider text-[11px] sticky top-0 z-10"><tr><th class="text-left px-3 py-3">No / proses</th><th class="text-left px-3">Tür</th><th class="text-left px-3">Tanım</th><th class="px-3">Seviye</th><th class="px-3">Aksiyon sonrası</th><th class="text-left px-3">Aksiyon / sorumlu</th><th class="text-left px-3">Sistematik faaliyetler</th></tr></thead>
      <tbody class="divide-y divide-slate-800/70">${blok('Tesise özel (' + sec(tesisRisk).length + ')', tesisRisk)}${blok('Genel (' + sec(genel).length + ')', genel)}</tbody></table></div>
      <div class="px-4 py-2 text-[11px] text-slate-500 border-t border-slate-800">Seviye = olasılık (O) × etki (E). 12 ve üzeri yüksek (kırmızı), 6–11 orta (turuncu), 5 ve altı düşük (yeşil).</div>`;
  }

  function notlar() {
    const n = D.veri_notlari || [];
    document.getElementById('isoNotlar').innerHTML = `<details class="glass-card rounded-xl p-4 text-xs text-slate-400"><summary class="cursor-pointer text-slate-300 font-medium">Okuma notları${n.length ? ` ve Excel'de ${n.length} tutarsızlık` : ''}</summary>
      <ul class="mt-2 list-disc pl-5 space-y-1">
        <li><b class="text-slate-300">Sapma</b> = (gerçekleşen − referans) ÷ referans. Pozitif (kırmızı/turuncu) değer referans çizgisinin aşıldığını, negatif (yeşil) değer altında kaldığını gösterir.</li>
        <li>Referans çizgisi, Excel'deki EnRÇ hesabından (önceki yıl verisi, gerekirse HDD/CDD, etkinlik sayısı gibi değişkenlerle) aynen alınmıştır; burada yeniden hesaplanmaz. 2023 için referans yılı 2022'dir; 2024'te dosyaların çoğunda 2022–2023 ortalaması kullanılır.</li>
        <li><b class="text-slate-300">2025–2026</b> gerçekleşen tüketimler Verilerim.xlsx'ten alınmıştır (2023–2024 ile eşleşmesi EnRÇ dosyalarına göre doğrulanmıştır). Referans çizgisinde baz dönem (2022–2023) sabit tutulmuştur: elektrik ve benzeri serilerde 2024 dosyasındaki referans aynen; HDD/CDD'li serilerde 2024 dosyasındaki regresyon katsayıları × ilgili ayın HDD/CDD değeri. 2026 için HDD/CDD verisi dosyada olmadığından o serilerde referans yoktur, yalnızca gerçekleşen görünür. Kısmi yıllarda sapma yalnızca verisi olan aylar üzerinden hesaplanır.</li>\n        <li>Yatırım tutarları (TL) eylem planından bilerek alınmamıştır.</li>
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
      <section id="isoEk" class="grid grid-cols-1 lg:grid-cols-2 gap-4"></section>
      <section id="isoRisk" class="glass-card rounded-xl overflow-hidden hidden"></section>
      <div id="isoNotlar"></div></div>`;
  }

  function ciz() {
    if (!document.getElementById('isoTesisler')) iskelet();
    const t = D.tesisler.find((x) => x.id === tesis);
    document.getElementById('isoTesisler').innerHTML = D.tesisler.map((x) => `<button data-iso-tesis="${x.id}" onclick="Iso.tesis('${x.id}')" class="px-3 py-1.5 rounded-lg text-xs font-semibold ${x.id === tesis ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-300 hover:text-white'}">${esc(x.ad)}</button>`).join('');
    document.getElementById('isoYil').innerHTML = [...new Set(D.seriler.flatMap((x) => Object.keys(x.yillar)))].sort().map((y) => `<option ${y === yil ? 'selected' : ''}>${y}</option>`).join('');
    document.getElementById('isoBaslik').textContent = t ? t.ad : '';
    ozetKartlari();
    document.getElementById('isoSeriler').innerHTML = seriler().map(seriKarti).join('');
    seriGrafikleri(); eylemTablosu(); ekBolum(); riskBolumu(); notlar();
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
    rf(k) { rfTur = k; riskBolumu(); },
  };
})();
