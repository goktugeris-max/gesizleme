/* ISO 50001 sekmesi: tesis bazında enerji referans çizgisi (EnRÇ) takibi ve enerji eylem planı.
 *
 * Veri: data/iso50001.enc.json (şifreli; collector/iso50001_to_json.py üretir). Parola elektrik sekmesiyle ortaktır
 * (oturum boyunca sessionStorage'da 'elp' anahtarında tutulur).
 * Sapma = (gerçekleşen − referans) ÷ referans. Pozitif sapma referans çizgisinin (hedef tüketimin) aşıldığı anlamına gelir.
 * index.html'deki esc() kullanılır.
 */
(function () {
  const AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const RENK = { Elektrik: TV(), 'Doğalgaz': '#3f8fd2' };
  let D = null, sifreli = null, tesis = 'aassm', yil = '2024', yuklendi = false, rfTur = 'hepsi';
  const grafik = {};

  // ---- bölümlerin açık/kapalı durumu (sekme içinde yeniden çizimlerde korunur)
  const acik = new Set(['eylem']);
  const acikSatir = new Set();
  let eDurum = 'hepsi';
  let kayitlar = [];

  // ---- eylem planı ilerleme takibi: otomatik durum + tarayıcıya kaydedilen elle düzeltmeler
  const TAKIP_ANAHTAR = 'iso_eylem_takip_v1';
  let takip = {};
  try { takip = JSON.parse(localStorage.getItem(TAKIP_ANAHTAR) || '{}') || {}; } catch (e) { takip = {}; }
  const takipKaydet = () => { try { localStorage.setItem(TAKIP_ANAHTAR, JSON.stringify(takip)); } catch (e) { /* özel pencere vb. */ } };
  // ---- ORTAK takip (Supabase): giriş yapılmışsa durum/ilerleme/sorumlu/not ve yorumlar ekip arasında paylaşılır; yoksa yukarıdaki yerel takip kullanılır
  const ortak = { acik: false, satirlar: {}, yorumlar: {}, mesaj: '', giris: false };
  const tkOku = (id) => (ortak.acik ? ortak.satirlar[id] || {} : takip[id] || {});
  const dbHazir = () => !!(window.VeriDB && VeriDB.hazir());
  async function ortakYukle() {
    if (!dbHazir() || !VeriDB.oturum()) { ortak.acik = false; return; }
    try {
      const rol = await VeriDB.rol();
      const [satirlar, yorumlar] = await Promise.all([
        VeriDB.istek('/rest/v1/eylem_takip?select=*&kaynak=eq.iso&limit=5000'),
        VeriDB.istek('/rest/v1/eylem_yorum?select=*&kaynak=eq.iso&order=zaman.asc&limit=5000'),
      ]);
      ortak.satirlar = {}; ortak.yorumlar = {};
      (satirlar || []).forEach((r) => { ortak.satirlar[r.eylem_id] = { durum: r.durum, yuzde: r.yuzde, not: r.not_, sorumlu: r.sorumlu, tarih: (r.guncelleme || '').slice(0, 10), ad: r.guncelleyen_ad }; });
      (yorumlar || []).forEach((r) => { (ortak.yorumlar[r.eylem_id] = ortak.yorumlar[r.eylem_id] || []).push(r); });
      ortak.rol = rol && rol.rol; ortak.yazabilir = ortak.rol === 'girisci' || ortak.rol === 'yonetici';
      ortak.acik = true; ortak.mesaj = '';
    } catch (e) { ortak.acik = false; ortak.mesaj = 'Ortak takip yüklenemedi: ' + e.message; }
  }
  const ortakYaz = (id, m) => VeriDB.istek('/rest/v1/eylem_takip?on_conflict=kaynak,eylem_id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
    body: [{ kaynak: 'iso', eylem_id: id, durum: m.durum || 'oto', yuzde: m.yuzde == null ? null : m.yuzde, sorumlu: m.sorumlu || null, not_: m.not || null }] });

  const DURUMLAR = {
    tamamlandi: { ad: 'Tamamlandı', sinif: 'bg-emerald-500/15 text-emerald-300', renk: '#10b981' },
    surekli: { ad: 'Sürekli faaliyet', sinif: 'bg-sky-500/15 text-sky-300', renk: '#38bdf8' },
    devam: { ad: 'Devam ediyor', sinif: 'bg-amber-500/15 text-amber-300', renk: TV() },
    planli: { ad: 'Planlı', sinif: 'bg-slate-600/40 text-slate-200', renk: '#94a3b8' },
    gecikmis: { ad: 'Gecikmiş', sinif: 'bg-red-500/20 text-red-300', renk: '#f87171' },
    iptal: { ad: 'İptal / yapılmayacak', sinif: 'bg-slate-700 text-slate-400', renk: '#475569' },
  };
  const SIRA = ['tamamlandi', 'surekli', 'devam', 'planli', 'gecikmis', 'iptal'];
  const ELLE = ['tamamlandi', 'devam', 'planli', 'surekli', 'iptal'];
  const tarihMi = (t) => /^\d{4}-\d{2}-\d{2}/.test(t || '') || /\d{1,2}[.\-]\d{1,2}[.\-]\d{4}/.test(t || '');
  const eylemId = (t, e) => `${t}|${e.no}|${(e.onlem || '').slice(0, 40)}`;

  // Excel'deki termin / gerçekleşme / durum metinlerinden otomatik durum
  function otoDurum(e) {
    const metin = `${e.durum || ''} ${e.termin || ''} ${e.gerceklesme_tarihi || ''}`;
    if (/iptal|yapılmayacak/i.test(metin)) return 'iptal';
    const olumsuz = /yapılamamış|yapılmamış|gerçekleştirilememiş|temin edilememiş/i.test(metin);
    if (!olumsuz && (tarihMi(e.gerceklesme_tarihi) || /^yapıldı/i.test(e.termin || '') ||
      /(gerçekleştirilmiştir|yapılmıştır|tamamlanmıştır|aldırılmıştır|atanmıştır|hazırlanmıştır|bildirilmiştir|verilmiştir)/i.test(e.durum || ''))) return 'tamamlandi';
    if (/düzenli|periyodik|sürekli/i.test(metin)) return 'surekli';
    if (/^\d{4}-\d{2}-\d{2}$/.test(e.termin || '') && new Date(e.termin + 'T23:59:59') < new Date()) return 'gecikmis';
    return e.durum ? 'devam' : 'planli';
  }
  const etkinDurum = (k) => { const m = tkOku(k.id); return m && m.durum && m.durum !== 'oto' ? m.durum : otoDurum(k.e); };
  const sayilar = (liste) => { const c = Object.fromEntries(SIRA.map((x) => [x, 0])); liste.forEach((k) => c[etkinDurum(k)]++); return c; };
  const kayit = (t) => (D.eylem[t] || []).map((e) => ({ e, t, id: eylemId(t, e) }));
  const tamamlanma = (c) => { const pay = c.tamamlandi + c.devam + c.planli + c.gecikmis; return pay ? c.tamamlandi / pay : null; };
  const cubuk = (c, genislik) => {
    const t = SIRA.reduce((a, k) => a + c[k], 0) || 1;
    return `<div class="flex h-2 rounded-full overflow-hidden bg-slate-800 ${genislik || 'w-40'}">${SIRA.map((k) => (c[k] ? `<div title="${DURUMLAR[k].ad}: ${c[k]}" style="width:${(c[k] / t) * 100}%;background:${DURUMLAR[k].renk}"></div>` : '')).join('')}</div>`;
  };
  const rozet = (k) => `<span class="px-2 py-0.5 rounded-md text-[10px] font-semibold whitespace-nowrap ${DURUMLAR[k].sinif}">${DURUMLAR[k].ad}</span>`;

  // ---- açılır bölüm kabuğu
  const bolum = (k, baslik, ozet, govde) => `<details data-k="${k}" ${acik.has(k) ? 'open' : ''} class="group glass-card rounded-xl overflow-hidden">
    <summary class="cursor-pointer select-none p-4 flex flex-wrap items-center gap-x-3 gap-y-2 hover:bg-slate-800/40" style="list-style:none">
      <span class="text-slate-400 inline-block transition-transform group-open:rotate-90">▸</span>
      <h2 class="text-sm font-semibold text-white">${baslik}</h2>
      <div class="ml-auto flex flex-wrap items-center gap-3 text-[11px] text-slate-400">${ozet || ''}</div>
    </summary><div class="border-t border-slate-800">${govde}</div></details>`;

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

  function eylemBolumu() {
    const el = document.getElementById('isoEylem');
    const liste = kayit(tesis), genel = kayit('genel');
    const hepsi = [...liste, ...genel];
    const c = sayilar(hepsi), oran = tamamlanma(c);
    const ozet = `<span>${hepsi.length} eylem</span>${cubuk(c, 'w-32')}<span class="text-emerald-300 font-semibold">${oran == null ? '—' : '%' + Math.round(oran * 100) + ' tamamlandı'}</span>${c.gecikmis ? `<span class="text-red-300 font-semibold">${c.gecikmis} gecikmiş</span>` : ''}`;

    // tesis karşılaştırması
    const tesisSatirlari = [...D.tesisler.map((x) => ({ id: x.id, ad: x.ad })), { id: 'genel', ad: 'Genel (tüm tesisler)' }].map((x) => {
      const cc = sayilar(kayit(x.id)), o = tamamlanma(cc);
      const tikla = x.id === 'genel' ? '' : `onclick="Iso.tesis('${x.id}')" style="cursor:pointer"`;
      return `<tr ${tikla} class="${x.id === tesis ? 'bg-amber-500/5' : ''} ${x.id === 'genel' ? '' : 'hover:bg-slate-800/40'}"><td class="px-3 py-2 text-slate-100">${esc(x.ad)}</td>
        <td class="px-3 py-2 text-right font-mono">${SIRA.reduce((t, k) => t + cc[k], 0)}</td>${SIRA.map((k) => `<td class="px-3 py-2 text-right font-mono ${cc[k] ? '' : 'text-slate-600'}" style="${cc[k] ? 'color:' + DURUMLAR[k].renk : ''}">${cc[k]}</td>`).join('')}
        <td class="px-3 py-2">${cubuk(cc, 'w-28')}</td><td class="px-3 py-2 text-right font-mono text-emerald-300">${o == null ? '—' : '%' + Math.round(o * 100)}</td></tr>`;
    }).join('');
    const karsilastirma = `<div class="overflow-x-auto"><table class="w-full text-xs"><thead class="bg-slate-900/80 text-slate-400 uppercase tracking-wider text-[11px]"><tr><th class="text-left px-3 py-2.5">Tesis</th><th class="text-right px-3">Toplam</th>${SIRA.map((k) => `<th class="text-right px-3">${DURUMLAR[k].ad.replace(' / yapılmayacak', '').replace(' faaliyet', '')}</th>`).join('')}<th class="px-3 text-left">İlerleme</th><th class="text-right px-3">Tamamlanma</th></tr></thead>
      <tbody class="divide-y divide-slate-800/70">${tesisSatirlari}</tbody></table></div>
      <p class="px-4 py-2 text-[11px] text-slate-500">Tamamlanma = tamamlanan ÷ (tamamlanan + devam eden + planlı + gecikmiş). Sürekli faaliyetler ve iptaller hesaba katılmaz. Satıra tıklayarak tesisi seçebilirsiniz.</p>`;

    // süzgeç düğmeleri
    const dugme = (k, ad, n) => `<button onclick="Iso.ed('${k}')" class="px-2.5 py-1 rounded-md text-[11px] font-semibold ${eDurum === k ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-slate-200'}">${ad}${n != null ? ` <span class="opacity-70">${n}</span>` : ''}</button>`;
    const suzgec = `<div class="flex flex-wrap gap-1 bg-slate-900/80 rounded-lg p-0.5">${dugme('hepsi', 'Tümü', hepsi.length)}${SIRA.filter((k) => c[k]).map((k) => dugme(k, DURUMLAR[k].ad.replace(' / yapılmayacak', ''), c[k])).join('')}</div>`;

    // satırlar
    kayitlar = [];
    const alan = (b, d) => (d ? `<div><div class="text-[10px] uppercase tracking-wider text-slate-500">${b}</div><div class="text-slate-200 whitespace-pre-line">${esc(d)}</div></div>` : '');
    const satir = (k) => {
      const e = k.e, n = kayitlar.length; kayitlar.push(k);
      const m = tkOku(k.id), d = etkinDurum(k), oto = otoDurum(k.e), acikMi = acikSatir.has(k.id);
      const yuzde = m.yuzde != null && m.yuzde !== '' && d !== 'tamamlandi' ? `<div class="flex items-center gap-1.5 mt-1"><div class="h-1.5 w-20 rounded-full bg-slate-800 overflow-hidden"><div class="h-full bg-amber-400" style="width:${Math.min(100, +m.yuzde)}%"></div></div><span class="text-[10px] text-slate-400">%${esc(String(m.yuzde))}</span></div>` : '';
      const yaz = !ortak.acik || ortak.yazabilir, kapali = yaz ? '' : 'disabled';
      const yorumlar = ortak.acik ? (ortak.yorumlar[k.id] || []) : [];
      const form = `<div class="mt-3 pt-3 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3 items-start">
          <label class="text-[11px] text-slate-400">Durum<select ${kapali} onchange="Iso.tk(${n},'durum',this.value)" class="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-100">
            <option value="oto" ${!m.durum || m.durum === 'oto' ? 'selected' : ''}>Otomatik (${DURUMLAR[oto].ad})</option>${ELLE.map((x) => `<option value="${x}" ${m.durum === x ? 'selected' : ''}>${DURUMLAR[x].ad}</option>`).join('')}</select></label>
          <label class="text-[11px] text-slate-400">İlerleme (%)<input ${kapali} type="number" min="0" max="100" value="${m.yuzde == null ? '' : esc(String(m.yuzde))}" onchange="Iso.tk(${n},'yuzde',this.value)" class="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-100" placeholder="örn. 40" /></label>
          ${ortak.acik ? `<label class="text-[11px] text-slate-400">Sorumlu (ekip içi)<input ${kapali} value="${esc(m.sorumlu || '')}" onchange="Iso.tk(${n},'sorumlu',this.value)" class="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-100" placeholder="${esc(e.sorumlu || 'kişi / birim')}" /></label>` : '<div></div>'}
          <label class="text-[11px] text-slate-400 sm:col-span-3">${ortak.acik ? 'Takip notu (ekip)' : 'Takip notum'}${m.tarih ? ` <span class="text-slate-600">(son güncelleme ${esc(m.tarih)}${m.ad ? ', ' + esc(m.ad) : ''})</span>` : ''}<textarea ${kapali} rows="2" onchange="Iso.tk(${n},'not',this.value)" class="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-100" placeholder="Son durum, yapılacak iş, görüşülen kişi…">${esc(m.not || '')}</textarea></label>
          ${ortak.acik ? `<div class="sm:col-span-3"><div class="text-[11px] text-slate-400 mb-1">Yorumlar (${yorumlar.length})</div>
            ${yorumlar.map((y) => `<div class="text-xs bg-slate-900/70 rounded-lg px-3 py-2 mb-1.5"><span class="text-slate-400">${esc(y.yazan_ad || 'Kullanıcı')} • ${esc(new Date(y.zaman).toLocaleString('tr-TR'))}</span><div class="text-slate-200 whitespace-pre-line">${esc(y.metin)}</div></div>`).join('')}
            ${ortak.yazabilir ? `<div class="flex gap-2"><input id="yorum${n}" class="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-100" placeholder="Yorum yaz…" maxlength="1000" /><button onclick="Iso.yorum(${n})" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 text-slate-900 hover:bg-amber-400">Gönder</button></div>` : ''}</div>` : ''}
        </div>`;
      return `<tr class="align-top cursor-pointer hover:bg-slate-800/40" onclick="Iso.satir(${n})"><td class="px-3 py-2 text-slate-400 whitespace-nowrap"><span id="esc${n}" class="inline-block w-3 text-slate-500">${acikMi ? '▾' : '▸'}</span> ${esc(e.no)}</td>
        <td class="px-3 py-2"><span class="px-2 py-0.5 rounded-md text-[10px] font-semibold ${e.enerji === 'Elektrik' ? 'bg-amber-500/15 text-amber-300' : e.enerji === 'Doğalgaz' ? 'bg-cyan-500/15 text-cyan-300' : 'bg-slate-700 text-slate-300'}">${esc(e.enerji || '')}</span></td>
        <td class="px-3 py-2 text-slate-100 w-[44%]">${esc(e.onlem || '—')}${m.not ? '<span class="ml-1 text-amber-300" title="Takip notu var">✎</span>' : ''}</td>
        <td class="px-3 py-2 text-slate-400 whitespace-nowrap">${esc(/^\d{4}-/.test(e.termin || '') ? e.termin : ((e.termin || '—').length > 18 ? (e.termin || '').slice(0, 18) + '…' : (e.termin || '—')))}</td>
        <td class="px-3 py-2">${rozet(d)}${m.durum && m.durum !== 'oto' ? '<div class="text-[10px] text-slate-500 mt-1">elle</div>' : ''}${yuzde}</td></tr>
        <tr id="es${n}" class="${acikMi ? '' : 'hidden'}"><td colspan="5" class="px-4 py-3 bg-slate-900/50">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">${alan('Gerçekleşme durumu (Excel)', e.durum)}${alan('Eylem planına giriş gerekçesi', e.gerekce)}${alan('Hedeflenen kazanç', e.hedef)}${alan('Planlama tarihi', e.planlama)}${alan('Termin', e.termin)}${alan('Gerçekleştirilme', e.gerceklesme_tarihi)}${alan('Sorumlu', e.sorumlu)}${alan('Geri ödeme süresi (yıl)', e.geri_odeme)}</div>${form}</td></tr>`;
    };
    const sec = (l) => l.filter((k) => eDurum === 'hepsi' || etkinDurum(k) === eDurum);
    const blok = (baslik, l) => (sec(l).length ? `<tr class="bg-slate-900/60"><td colspan="5" class="px-3 py-2 text-[11px] uppercase tracking-wider text-slate-400">${baslik} (${sec(l).length})</td></tr>${sec(l).map(satir).join('')}` : '');
    const tablo = `<div class="overflow-x-auto"><table class="w-full text-xs"><thead class="bg-slate-900/80 text-slate-400 uppercase tracking-wider text-[11px]"><tr><th class="text-left px-3 py-3">No</th><th class="text-left px-3">Enerji</th><th class="text-left px-3">Önlem / iyileştirme</th><th class="text-left px-3">Termin</th><th class="text-left px-3">Durum</th></tr></thead>
      <tbody class="divide-y divide-slate-800/70">${blok('Tesise özel eylemler', liste)}${blok('Genel eylemler', genel)}</tbody></table></div>`;
    const bos = sec(hepsi).length ? '' : '<p class="px-4 py-6 text-center text-xs text-slate-500">Bu süzgece uyan eylem yok.</p>';

    const oturumVar = dbHazir() && VeriDB.oturum();
    const ortakCubuk = !dbHazir() ? '' : ortak.acik
      ? `<div class="px-4 py-2.5 border-b border-slate-800 flex flex-wrap items-center gap-3 text-[11px] bg-emerald-500/5"><span class="text-emerald-300 font-semibold">● Ortak takip açık</span><span class="text-slate-400">${esc(VeriDB.oturum().user.email)} (${esc(ortak.rol || 'rol yok')}) — durum, ilerleme, sorumlu, not ve yorumlar ekiple paylaşılır${ortak.yazabilir ? '' : '; yalnızca okuyabilirsiniz'}</span>
          ${ortak.yazabilir && Object.keys(takip).length ? '<button onclick="Iso.ortakAktar()" class="ml-auto px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold">Bu tarayıcıdaki notları ortağa aktar</button>' : '<span class="ml-auto"></span>'}
          <button onclick="Iso.ortakCikis()" class="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold">Çıkış</button></div>`
      : `<div class="px-4 py-2.5 border-b border-slate-800 flex flex-wrap items-center gap-3 text-[11px]"><span class="text-slate-400">${oturumVar ? 'Ortak takip yüklenemedi.' : 'Takibi ekiple paylaşmak için Veri Girişi hesabınızla giriş yapın.'} ${esc(ortak.mesaj || '')}</span>
          ${oturumVar ? '' : (ortak.giris ? `<form onsubmit="return Iso.ortakGiris(event)" class="ml-auto flex flex-wrap gap-2"><input id="ogEposta" type="email" placeholder="E-posta" class="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs" /><input id="ogSifre" type="password" placeholder="Şifre" class="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs" /><button class="px-3 py-1 rounded-lg bg-amber-500 text-slate-900 font-semibold">Giriş</button></form>` : '<button onclick="Iso.ortakGirisAc()" class="ml-auto px-2.5 py-1 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold">Ortak takibe giriş</button>')}</div>`;
    const alt = `<div class="px-4 py-3 border-t border-slate-800 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
        <span>Durum Excel'deki termin ve açıklamalardan otomatik belirlenir; satırı açıp elle düzeltebilir, ilerleme yüzdesi ve not girebilirsiniz. ${ortak.acik ? 'Ortak takip açıkken girilenler <b class="text-slate-300">ekiple paylaşılır</b>.' : 'Giriş yapmadan girilenler <b class="text-slate-300">yalnızca bu tarayıcıda</b> saklanır, başkalarına görünmez.'}</span>
        <button onclick="Iso.yedekle()" class="ml-auto px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold">Takip notlarını yedekle</button>
        <label class="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold cursor-pointer">Yedeği yükle<input type="file" accept="application/json" class="hidden" onchange="Iso.yukleYedek(this)" /></label></div>`;
    el.innerHTML = bolum('eylem', 'Enerji eylem planı ve ilerleme takibi', ozet,
      `${ortakCubuk}${karsilastirma}<div class="px-4 py-3 border-t border-slate-800 flex flex-wrap items-center gap-3"><span class="text-[11px] text-slate-400">Seçili tesis ve genel eylemler:</span>${suzgec}</div>${tablo}${bos}${alt}`);
  }

  function ekBolum() {
    const el = document.getElementById('isoEk');
    const ek = D.ek || {}, m = (ek.motorin || {})[tesis], h = ek.havuz && tesis === 'buz' ? ek.havuz[yil] : null;
    let html = '';
    if (m) {
      const yl = Object.keys(m).sort(), son = yl.filter((y) => m[y])[yl.filter((y) => m[y]).length - 1];
      html += bolum('motorin', 'Motorin kullanımı', son ? `<span>Son kullanım: <b class="text-amber-300">${son}</b> (${tr0(m[son])})</span>` : '<span>Kullanım yok</span>',
        `<div class="p-4"><table class="w-full text-xs"><thead class="text-slate-400 uppercase tracking-wider text-[11px]"><tr><th class="text-left py-1.5">Yıl</th><th class="text-right">Miktar</th></tr></thead>
        <tbody class="divide-y divide-slate-800/70">${yl.map((y) => `<tr><td class="py-1.5 text-slate-200">${y}</td><td class="text-right font-mono ${m[y] ? 'text-amber-300' : 'text-slate-500'}">${tr0(m[y])}</td></tr>`).join('')}</tbody></table>
        <p class="text-[11px] text-slate-500 mt-2">Excel'de birim yazmıyor; litre varsayılmıştır.</p></div>`);
    }
    if (h) {
      const tp = topla(h.toplam), hv = topla(h.havuz);
      html += bolum('havuz', `Buz pisti ve havuz elektriği (${yil})`, `<span>Havuz payı <b class="text-cyan-300">${tp ? '%' + ((hv / tp) * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) : '—'}</b></span>`,
        `<div class="p-4"><div class="h-52"><canvas id="chIsoHavuz"></canvas></div>
        <p class="text-[11px] text-slate-500 mt-2">Havuz tüketimi toplamdan ayrılır; yukarıdaki Buz Sporları elektrik serisi havuz çıkarılmış değerdir.</p></div>`);
    }
    el.innerHTML = html;
    el.classList.toggle('hidden', !html);
    if (h) cizGrafik('chIsoHavuz', {
      data: { labels: AY, datasets: [
        { type: 'bar', label: 'Buz pisti (havuz hariç)', data: h.toplam.map((x, i) => (x == null ? null : x - (h.havuz[i] || 0))), backgroundColor: TV(), stack: 'a', borderRadius: 3 },
        { type: 'bar', label: 'Havuz', data: h.havuz, backgroundColor: '#3f8fd2', stack: 'a', borderRadius: 3 },
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
    let n = 0;
    const alan = (b, d) => (d ? `<div><div class="text-[10px] uppercase tracking-wider text-slate-500">${b}</div><div class="text-slate-200 whitespace-pre-line">${esc(d)}</div></div>` : '');
    const satir = (x) => {
      const k = 'r' + n++, acikMi = acikSatir.has(k);
      return `<tr class="align-top cursor-pointer hover:bg-slate-800/40" onclick="Iso.rsatir('${k}')"><td class="px-3 py-2 text-slate-400 whitespace-nowrap"><span id="ec${k}" class="inline-block w-3 text-slate-500">${acikMi ? '▾' : '▸'}</span> ${esc(x.no || '')}<div class="text-[10px] text-slate-500 pl-3.5">${esc(x.proses || '')}</div></td>
        <td class="px-3 py-2"><span class="px-2 py-0.5 rounded-md text-[10px] font-semibold ${x.tur === 'Risk' ? 'bg-rose-500/15 text-rose-300' : 'bg-sky-500/15 text-sky-300'}">${esc(x.tur)}</span><div class="text-[10px] text-slate-500 mt-1">${esc(x.kaynak || '')}</div></td>
        <td class="px-3 py-2 text-slate-100 w-[48%]">${esc(x.tanim)}</td>
        <td class="px-3 py-2 whitespace-nowrap text-center"><span class="px-2 py-0.5 rounded-md font-mono text-[11px] font-semibold ${seviyeSinif(x.seviye)}">${x.seviye == null ? '—' : tr0(x.seviye)}</span><div class="text-[10px] text-slate-500 mt-1">O${tr0(x.o)} × E${tr0(x.e)}</div></td>
        <td class="px-3 py-2 text-center">${x.sonra != null ? `<span class="px-2 py-0.5 rounded-md font-mono text-[11px] font-semibold ${seviyeSinif(x.sonra)}">${tr0(x.sonra)}</span>` : '<span class="text-slate-600">—</span>'}</td></tr>
        <tr id="er${k}" class="${acikMi ? '' : 'hidden'}"><td colspan="5" class="px-4 py-3 bg-slate-900/50"><div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">${alan('Aksiyon', x.aksiyon)}${alan('Sorumlu', x.sorumlu)}${alan('Sistematik faaliyetler', x.faaliyet)}</div>${x.aksiyon || x.faaliyet ? '' : '<p class="text-xs text-slate-500">Bu kayıt için aksiyon girilmemiş.</p>'}</td></tr>`;
    };
    const blok = (baslik, l) => (sec(l).length ? `<tr class="bg-slate-900/60"><td colspan="5" class="px-3 py-2 text-[11px] uppercase tracking-wider text-slate-400">${baslik} (${sec(l).length})</td></tr>${sec(l).map(satir).join('')}` : '');
    const dugme = (k, ad) => `<button onclick="Iso.rf('${k}')" class="px-2.5 py-1 rounded-md text-[11px] font-semibold ${rfTur === k ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-slate-200'}">${ad}</button>`;
    const ozet = `<span>Bu tesis: <b class="text-rose-300">${t.r} risk</b>${t.y ? ` <span class="text-red-300">(${t.y} yüksek)</span>` : ''} • <b class="text-sky-300">${t.f} fırsat</b></span><span>Genel: ${g.r} risk • ${g.f} fırsat</span>`;
    el.innerHTML = bolum('risk', 'Risk ve fırsat değerlendirmesi', ozet,
      `<div class="px-4 py-3 flex items-center gap-3 border-b border-slate-800"><span class="text-[11px] text-slate-400">Satıra tıklayınca aksiyon ve sistematik faaliyetler açılır.</span><div class="ml-auto flex gap-1 bg-slate-900/80 rounded-lg p-0.5">${dugme('hepsi', 'Tümü')}${dugme('risk', 'Riskler')}${dugme('firsat', 'Fırsatlar')}</div></div>
      <div class="overflow-auto max-h-[40rem]"><table class="w-full text-xs"><thead class="bg-slate-900 text-slate-400 uppercase tracking-wider text-[11px] sticky top-0 z-10"><tr><th class="text-left px-3 py-3">No / proses</th><th class="text-left px-3">Tür</th><th class="text-left px-3">Tanım</th><th class="px-3">Seviye</th><th class="px-3">Aksiyon sonrası</th></tr></thead>
      <tbody class="divide-y divide-slate-800/70">${blok('Tesise özel', tesisRisk)}${blok('Genel', genel)}</tbody></table></div>
      <div class="px-4 py-2 text-[11px] text-slate-500 border-t border-slate-800">Seviye = olasılık (O) × etki (E). 12 ve üzeri yüksek (kırmızı), 6–11 orta (turuncu), 5 ve altı düşük (yeşil).</div>`);
  }

  function notlar() {
    const n = D.veri_notlari || [];
    document.getElementById('isoNotlar').innerHTML = bolum('notlar', 'Okuma notları', n.length ? `<span>Excel'de ${n.length} tutarsızlık</span>` : '', `<ul class="p-4 list-disc pl-9 space-y-1 text-xs text-slate-400">
        <li><b class="text-slate-300">Sapma</b> = (gerçekleşen − referans) ÷ referans. Pozitif (kırmızı/turuncu) değer referans çizgisinin aşıldığını, negatif (yeşil) değer altında kaldığını gösterir.</li>
        <li>Referans çizgisi, Excel'deki EnRÇ hesabından (önceki yıl verisi, gerekirse HDD/CDD, etkinlik sayısı gibi değişkenlerle) aynen alınmıştır; burada yeniden hesaplanmaz. 2023 için referans yılı 2022'dir; 2024'te dosyaların çoğunda 2022–2023 ortalaması kullanılır.</li>
        <li><b class="text-slate-300">2025–2026</b> gerçekleşen tüketimler Verilerim.xlsx'ten alınmıştır (2023–2024 ile eşleşmesi EnRÇ dosyalarına göre doğrulanmıştır). Referans çizgisinde baz dönem (2022–2023) sabit tutulmuştur: elektrik ve benzeri serilerde 2024 dosyasındaki referans aynen; HDD/CDD'li serilerde 2024 dosyasındaki regresyon katsayıları × ilgili ayın HDD/CDD değeri. 2026 HDD/CDD değerleri MGM'nin İzmir gün-derece tablosundan alınmıştır (2024–2025 değerleriniz bu tabloyla birebir tutmaktadır); Eylül 2026 kısmi aydır. Kısmi yıllarda sapma yalnızca verisi olan aylar üzerinden hesaplanır.</li>
        <li><b class="text-slate-300">Eylem durumu</b> Excel'deki termin ve açıklama metinlerinden otomatik çıkarılır: tarihli gerçekleştirme veya "yapılmıştır" benzeri ifade = tamamlandı; "düzenli/periyodik/sürekli" = sürekli faaliyet; "iptal/yapılmayacak" = iptal; terminini geçmiş = gecikmiş. Yanlış çıkanı satırda elle düzeltin.</li>
        <li>Yatırım tutarları (TL) eylem planından bilerek alınmamıştır.</li>
        ${n.map((x) => `<li>${esc(x.yil)} ${esc(x.seri)}: Excel toplamı ${tr0(x.excel_toplam)}, aylık değerlerin toplamı ${tr0(x.aylik_toplam)}. ${esc(x.not)}</li>`).join('')}
      </ul>`);
  }

  function iskelet() {
    document.getElementById('isoIcerik').innerHTML = `<style>#isoIcerik summary::-webkit-details-marker{display:none}</style><div class="space-y-6">
      <div class="flex flex-wrap items-center gap-3">
        <div id="isoTesisler" class="flex flex-wrap gap-2 mr-auto"></div>
        <label class="text-[11px] text-slate-400">Yıl <select id="isoYil" onchange="Iso.yil(this.value)" class="ml-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-100"></select></label>
      </div>
      <h2 id="isoBaslik" class="text-lg font-bold text-white"></h2>
      <section id="isoKartlar" class="grid grid-cols-1 sm:grid-cols-3 gap-4"></section>
      <section id="isoSeriler" class="grid grid-cols-1 lg:grid-cols-2 gap-4"></section>
      <section id="isoIkiz"></section>
      <section id="isoEylem"></section>
      <section id="isoEk" class="space-y-4"></section>
      <section id="isoRisk" class="hidden"></section>
      <div id="isoNotlar"></div></div>`;
    // açılır bölümlerin durumunu hatırla; grafik içeren bölüm açılınca boyutu yenile
    document.getElementById('isoIcerik').addEventListener('toggle', (ev) => {
      const d = ev.target; if (!d.dataset || !d.dataset.k) return;
      d.open ? acik.add(d.dataset.k) : acik.delete(d.dataset.k);
      if (d.open) setTimeout(() => Object.values(grafik).forEach((g) => g && g.resize()), 60);
    }, true);
  }

  // Dijital ikiz: seçili tesisin tamamlanmamış eylemlerini (planlanan tasarruflarıyla) ikize iletir
  function ikizBolumu() {
    if (!window.Ikiz) return;
    const bitmemis = kayit(tesis).filter((k) => !['tamamlandi', 'iptal', 'surekli'].includes(etkinDurum(k))).map((k) => k.e);
    Ikiz.ciz({ D, tesis, eylemler: bitmemis, acik: acik.has('ikiz') });
  }

  function ciz() {
    if (!document.getElementById('isoTesisler')) iskelet();
    const t = D.tesisler.find((x) => x.id === tesis);
    document.getElementById('isoTesisler').innerHTML = D.tesisler.map((x) => `<button data-iso-tesis="${x.id}" onclick="Iso.tesis('${x.id}')" class="px-3 py-1.5 rounded-lg text-xs font-semibold ${x.id === tesis ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-300 hover:text-white'}">${esc(x.ad)}</button>`).join('');
    document.getElementById('isoYil').innerHTML = [...new Set(D.seriler.flatMap((x) => Object.keys(x.yillar)))].sort().map((y) => `<option ${y === yil ? 'selected' : ''}>${y}</option>`).join('');
    document.getElementById('isoBaslik').textContent = t ? t.ad : '';
    ozetKartlari();
    document.getElementById('isoSeriler').innerHTML = seriler().map(seriKarti).join('');
    seriGrafikleri(); ikizBolumu(); eylemBolumu(); ekBolum(); riskBolumu(); notlar();
    if (window.lucide) lucide.createIcons();
  }

  const satirAc = (onek, k, simgeOnek) => {
    const r = document.getElementById(onek + k); if (!r) return;
    const ac = r.classList.toggle('hidden') === false;
    const id = onek === 'es' ? (kayitlar[+k] || {}).id : k;
    if (id) ac ? acikSatir.add(id) : acikSatir.delete(id);
    const s = document.getElementById(simgeOnek + k); if (s) s.textContent = ac ? '▾' : '▸';
  };

  window.Iso = {
    async ac() {
      if (!yuklendi) await yukle();
      if (!yuklendi) { if (sifreli) girisFormu(); return; }
      await ortakYukle();
      ciz();
    },
    tesis(id) { tesis = id; ciz(); },
    yil(y) { yil = y; ciz(); },
    rf(k) { rfTur = k; riskBolumu(); },
    ed(k) { eDurum = k; eylemBolumu(); },
    satir(n) { satirAc('es', n, 'esc'); },
    rsatir(k) { satirAc('er', k, 'ec'); },
    // elle takip: durum / yüzde / sorumlu / not — ortak takip açıksa Supabase'e, değilse tarayıcıya yazılır
    async tk(n, alan, deger) {
      const k = kayitlar[n]; if (!k) return;
      if (ortak.acik) {
        const m = Object.assign({}, ortak.satirlar[k.id] || {});
        if (alan === 'yuzde') { const v = deger === '' ? null : Math.max(0, Math.min(100, Math.round(+deger))); m.yuzde = isNaN(v) ? null : v; } else m[alan] = deger;
        try { await ortakYaz(k.id, m); await ortakYukle(); ortak.mesaj = ''; } catch (e) { ortak.mesaj = 'Kaydedilemedi: ' + e.message; }
        acikSatir.add(k.id); eylemBolumu(); return;
      }
      const m = (takip[k.id] = takip[k.id] || {});
      if (alan === 'yuzde') { const v = deger === '' ? null : Math.max(0, Math.min(100, Math.round(+deger))); m.yuzde = isNaN(v) ? null : v; } else m[alan] = deger;
      m.tarih = new Date().toISOString().slice(0, 10);
      if ((!m.durum || m.durum === 'oto') && (m.yuzde == null) && !m.not) delete takip[k.id];
      takipKaydet(); acikSatir.add(k.id); eylemBolumu();
    },
    async yorum(n) {
      const k = kayitlar[n], el = document.getElementById('yorum' + n); if (!k || !el || !el.value.trim()) return;
      try {
        await VeriDB.istek('/rest/v1/eylem_yorum', { method: 'POST', prefer: 'return=minimal', body: [{ kaynak: 'iso', eylem_id: k.id, metin: el.value.trim() }] });
        await ortakYukle();
      } catch (e) { ortak.mesaj = 'Yorum gönderilemedi: ' + e.message; }
      acikSatir.add(k.id); eylemBolumu();
    },
    ortakGirisAc() { ortak.giris = true; eylemBolumu(); },
    async ortakGiris(ev) {
      ev.preventDefault();
      try { await VeriDB.giris(document.getElementById('ogEposta').value.trim(), document.getElementById('ogSifre').value); ortak.giris = false; await ortakYukle(); }
      catch (e) { ortak.mesaj = /invalid|credentials/i.test(e.message) ? 'E-posta veya şifre yanlış.' : 'Giriş yapılamadı: ' + e.message; }
      eylemBolumu(); return false;
    },
    ortakCikis() { VeriDB.cikis(); ortak.acik = false; ortak.satirlar = {}; ortak.yorumlar = {}; eylemBolumu(); },
    async ortakAktar() {
      const kimler = Object.entries(takip); if (!kimler.length || !confirm(`${kimler.length} yerel not/durum ortak takibe aktarılsın mı? (Ortakta aynı eylem için kayıt varsa üzerine yazılır.)`)) return;
      try {
        await VeriDB.istek('/rest/v1/eylem_takip?on_conflict=kaynak,eylem_id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
          body: kimler.map(([id, m]) => ({ kaynak: 'iso', eylem_id: id, durum: m.durum || 'oto', yuzde: m.yuzde == null ? null : m.yuzde, not_: m.not || null })) });
        await ortakYukle(); ortak.mesaj = '';
      } catch (e) { ortak.mesaj = 'Aktarılamadı: ' + e.message; }
      eylemBolumu();
    },
    yedekle() {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify({ surum: 1, tarih: new Date().toISOString(), takip }, null, 1)], { type: 'application/json' }));
      a.download = 'iso50001_eylem_takip_' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click(); a.remove();
    },
    yukleYedek(inp) {
      const f = inp.files && inp.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => { try { const j = JSON.parse(r.result); if (j && j.takip) { takip = Object.assign(takip, j.takip); takipKaydet(); eylemBolumu(); } } catch (e) { alert('Yedek dosyası okunamadı.'); } };
      r.readAsText(f); inp.value = '';
    },
  };
  // Sayfa doğrudan #iso ile açılırsa dashboard.js bu dosyadan önce çalışmış olur
  if ((location.hash || '').slice(1) === 'iso') window.Iso.ac();
})();
