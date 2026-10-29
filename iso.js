/* ISO 50001 sekmesi: tesis bazında enerji referans çizgisi (EnRÇ) takibi ve enerji eylem planı.
 *
 * Veri: data/iso50001.enc.json (şifreli; collector/iso50001_to_json.py üretir). Parola elektrik sekmesiyle ortaktır
 * (oturum boyunca sessionStorage'da 'elp' anahtarında tutulur).
 * Sapma = (gerçekleşen − referans) ÷ referans. Pozitif sapma referans çizgisinin (hedef tüketimin) aşıldığı anlamına gelir.
 * index.html'deki esc() kullanılır.
 */
(function () {
  const AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const refRenk = () => (typeof koyuMu === 'function' && koyuMu() ? '#e2e8f0' : '#334155');   // referans çizgisi: açık temada koyu
  const RENK = { Elektrik: TV(), 'Doğalgaz': '#3f8fd2' };
  let D = null, sifreli = null, tesis = 'aassm', yil = '2024', yuklendi = false, rfTur = 'hepsi', altSekme = 'ozet', bolumSec = 'hepsi';
  const grafik = {};

  // ---- bölümlerin açık/kapalı durumu (sekme içinde yeniden çizimlerde korunur)
  const acik = new Set(['eylem', 'risk', 'ikiz', 'motorin', 'havuz', 'notlar']);
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
  const rozet = (k) => `<span class="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium ${k === 'gecikmis' ? 'text-red-500' : 'text-slate-200'}"><span class="inline-block w-2 h-2 rounded-full shrink-0" style="background:${DURUMLAR[k].renk}"></span>${DURUMLAR[k].ad}</span>`;
  const enerjiNokta = (en) => `<span class="inline-flex items-center gap-1.5 whitespace-nowrap"><span class="inline-block w-2 h-2 rounded-full" style="background:${en === 'Elektrik' ? '#f5b301' : en === 'Doğalgaz' ? '#3f8fd2' : '#94a3b8'}"></span>${esc(en || '')}</span>`;
  const gunFarki = (t) => (/^\d{4}-\d{2}-\d{2}$/.test(t || '') ? Math.floor((new Date() - new Date(t + 'T23:59:59')) / 86400000) : null);

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

  // ---------- Özet sayfasına kart + uyarılar ----------
  function ozetKayit() {
    if (!window.Dash || !Dash.ozetKaydet || !D) return;
    const secili = D.seriler.filter((s) => s.yillar[yil]);
    const liste = secili.map((s) => { const v = s.yillar[yil], c = karsilastir(v); return { s, v, c, sapma: c.r ? c.t / c.r - 1 : null, ay: veriAy(v) }; }).filter((x) => x.sapma != null);
    const asan = liste.filter((x) => x.sapma > 0);
    const tepT = tepHesap(secili);
    const tesisAd = (id) => ((D.tesisler.find((t) => t.id === id) || {}).ad || id);
    const uyarilar = liste.filter((x) => x.sapma > 0.05 && x.ay >= 3).map((x) => ({ modul: 'ISO 50001', etiket: 'Referans aşımı', metin: `${tesisAd(x.s.tesis)} / ${x.s.bolum} (${x.s.enerji}, ${yil}): referansın ${(x.sapma * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}% üstünde.`, renk: x.sapma > 0.15 ? 'text-red-400' : 'text-amber-300', href: '#iso', puan: 25 + Math.min(55, x.sapma * 200) }));
    Dash.ozetKaydet('iso', {
      kart: `<div class="grid grid-cols-2 gap-3 text-xs text-slate-500">
        <div><div class="text-[10px] uppercase tracking-wider text-slate-500">${yil} izlenen seri</div><div class="text-lg font-bold text-white">${liste.length}</div></div>
        <div><div class="text-[10px] uppercase tracking-wider text-slate-500">Referans aşımı</div><div class="text-lg font-bold ${asan.length ? 'text-amber-300' : 'text-emerald-400'}">${asan.length} <span class="text-xs text-slate-400">seri</span></div></div>
        <div class="col-span-2"><div class="text-[10px] uppercase tracking-wider text-slate-500">${yil} elektrik + doğalgaz (3 tesis)</div><div class="text-lg font-bold text-cyan-300">${tr0(tepT.elek + tepT.gaz)} <span class="text-xs text-slate-500">TEP</span></div><div class="text-[11px] text-slate-500">${D.tesisler.map((t) => { const x = tepHesap(secili.filter((q) => q.tesis === t.id)); return (t.ad.match(/\(([^)]+)\)/) ? t.ad.match(/\(([^)]+)\)/)[1] : t.ad.split(' ')[0]) + ' ' + tr0(x.elek + x.gaz); }).join(' • ')}</div></div>
        <div class="col-span-2 text-[11px] text-slate-500">${uyarilar.length ? `%5'in üzerinde aşan ${uyarilar.length} seri var` : 'Referans çizgisine göre belirgin aşım yok'}</div></div>`,
      uyarilar: uyarilar.sort((a, b) => b.puan - a.puan).slice(0, 4),
    });
  }

  async function parolaDene(p) {
    try { D = await coz(p); if (window.Enys) { try { await Enys.yukle(); Enys.birlestir(D); } catch (e) { /* EnYS verisi yoksa ISO verisi olduğu gibi çalışır */ } } if (window.Enb) { try { await Enb.yukle(); } catch (e) { /* model kalite dosyası yoksa rozetler görünmez */ } } yuklendi = true; const yl = [...new Set(D.seriler.flatMap((x) => Object.keys(x.yillar)))].sort(); yil = yl.includes('2026') ? '2026' : (yl[yl.length - 1] || yil); ozetKayit(); return true; } catch (e) { return false; }
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

  // TEP dönüşümü: etüt raporlarıyla aynı (elektrik 0,000086 TEP/kWh; doğalgaz 0,000825 TEP/Sm³). Motorin vb. dahil değildir.
  const TEP_ORAN = { 'kWh': 0.000086, 'Sm³': 0.000825 };
  const tepHesap = (seriler_) => seriler_.reduce((a, s) => { const v = s.yillar[yil], o = TEP_ORAN[s.birim]; if (!v || !o) return a; const t = topla(v.takip) * o; if (s.birim === 'kWh') a.elek += t; else a.gaz += t; return a; }, { elek: 0, gaz: 0 });
  const tumSeri = () => D.seriler.filter((s) => s.tesis === tesis && s.yillar[yil]);
  const bolumAdi = (s) => s.bolum.split(' –')[0].trim();
  const seriler = () => tumSeri().filter((s) => bolumSec === 'hepsi' || bolumAdi(s) === bolumSec);

  // Özet: tek satırda 4 gösterge (elektrik, doğalgaz, TEP, hedef), altında aylık tesis grafikleri ve en çok sapan seriler
  function ozetKartlari() {
    const gruplar = {};
    tumSeri().forEach((s) => {
      const v = s.yillar[yil], c = karsilastir(v);
      const g = (gruplar[s.enerji] = gruplar[s.enerji] || { birim: s.birim, takip: 0, kt: 0, kr: 0, ay: 0, sn: 0, sr: 0 });
      g.takip += topla(v.takip); g.kt += c.t; g.kr += c.r; g.ay = Math.max(g.ay, veriAy(v)); g.sn++; if (c.n) g.sr++;
    });
    const rozet = (sapma) => (sapma == null ? '' : `<span class="px-2 py-0.5 rounded-full text-xs font-bold ${sapma <= 0 ? 'bg-emerald-500/15 text-emerald-400' : sapma > 0.05 ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-300'}">${sapma <= 0 ? '▼' : '▲'} ${yuzde(sapma).replace('+', '')}</span>`);
    const kart = (ikon, b, d, govde, renk, vurgu, sag) => `<div class="glass-card p-5 flex flex-col">
      <div class="flex items-center justify-between gap-2"><div class="text-sm text-slate-400 font-medium min-w-0 truncate">${b}</div>${sag || ''}</div>
      <div class="text-4xl font-semibold mt-3 leading-none ${renk}">${d}</div><div class="mt-4 text-xs text-slate-400 space-y-2 flex-1">${govde}</div></div>`;
    // referansa göre gerçekleşen: çubuk (%100 = referans çizgisi)
    const olcek = (kt, kr) => { const o = kr ? kt / kr : null; return o == null ? '' : `<div><div class="relative h-2 rounded-full bg-slate-800 overflow-hidden"><div class="h-full rounded-full ${o <= 1 ? 'bg-emerald-500' : o <= 1.05 ? 'bg-amber-400' : 'bg-red-500'}" style="width:${Math.min(100, o * 100)}%"></div></div>
        <div class="flex justify-between text-[11px] mt-1"><span>Referansın %${(o * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}'i</span><span class="font-mono">${tr0(kt)} / ${tr0(kr)}</span></div></div>`; };
    const birim = (b, ek) => `<span class="text-lg font-semibold text-slate-400 ml-1">${b}</span>`;
    const kartlar = Object.entries(gruplar).map(([e, g]) => {
      const sapma = g.kr ? g.kt / g.kr - 1 : null, donem = g.ay < 12 ? `Oca–${AY[g.ay - 1]} ${yil}` : yil, elek = e === 'Elektrik';
      return kart(elek ? 'zap' : 'flame', `${e}, ${donem}`, tr0(g.takip) + birim(g.birim), (g.kr ? olcek(g.kt, g.kr) : '<div>Referans çizgisi yok (bkz. okuma notları)</div>') + (g.sr < g.sn ? `<div class="text-[11px] text-slate-500">Referansı olan ${g.sr}/${g.sn} seri karşılaştırıldı.</div>` : ''),
        elek ? 'text-amber-300' : 'text-cyan-300', elek ? '#f5b301' : '#3f8fd2', rozet(sapma));
    });
    const t = tepHesap(tumSeri()), ay = Math.max(0, ...tumSeri().map((x) => veriAy(x.yillar[yil]))), top = t.elek + t.gaz, pay = top ? t.elek / top : 0;
    kartlar.push(kart('gauge', `Toplam enerji, ${ay && ay < 12 ? 'Oca–' + AY[ay - 1] + ' ' + yil : yil}`, tr0(top) + birim('TEP'),
      `<div><div class="flex h-2 rounded-full overflow-hidden bg-slate-800"><div style="width:${pay * 100}%;background:#f5b301"></div><div class="flex-1" style="background:#3f8fd2"></div></div>
        <div class="flex justify-between text-[11px] mt-1"><span><span class="inline-block w-2 h-2 rounded-full mr-1" style="background:#f5b301"></span>Elektrik ${tr0(t.elek)}</span><span><span class="inline-block w-2 h-2 rounded-full mr-1" style="background:#3f8fd2"></span>Doğalgaz ${tr0(t.gaz)}</span></div></div>
        <div class="text-[11px] text-slate-500">Etüt raporlarıyla aynı dönüşüm; motorin dahil değil.</div>`, 'text-white', TV()));
    const hedef = (tumSeri()[0] && tumSeri()[0].yillar[yil].hedef) || 0.02, secili = tumSeri(), hedefte = secili.filter((x) => { const c = karsilastir(x.yillar[yil]); return c.r && c.t <= c.r; }).length, say = secili.filter((x) => karsilastir(x.yillar[yil]).r).length;
    kartlar.push(kart('target', 'Yıllık tasarruf hedefi', '%' + (hedef * 100).toLocaleString('tr-TR') + '<span class="text-lg font-semibold text-slate-400 ml-1">azaltım</span>',
      `<div><div class="flex gap-1">${secili.filter((x) => karsilastir(x.yillar[yil]).r).map((x) => { const c = karsilastir(x.yillar[yil]); return `<div class="h-2 flex-1 rounded-full ${c.t <= c.r ? 'bg-emerald-500' : 'bg-red-500'}" title="${esc(x.bolum)} (${esc(x.enerji)})"></div>`; }).join('')}</div>
        <div class="text-[11px] mt-1">${say ? `<b class="${hedefte === say ? 'text-emerald-400' : 'text-amber-300'}">${hedefte}/${say}</b> seri referans çizgisinin altında` : 'Referanslı seri yok'}</div></div>
        <div class="text-[11px] text-slate-500">Excel'deki HEDEF hücresi; her enerji kullanımı için geçerli.</div>`, hedefte === say && say ? 'text-emerald-400' : 'text-white', '#10b981'));
    document.getElementById('isoKartlar').innerHTML = kartlar.join('');
    if (window.lucide) lucide.createIcons();
    ozetGrafik(gruplar); ozetSapma();
  }

  // tesis toplamı: aylık gerçekleşen ve referans (yalnız hem gerçekleşeni hem referansı olan aylar referansa katılır)
  function ozetGrafik(gruplar) {
    const el = document.getElementById('isoOzetGrafik'); if (!el) return;
    const veri = Object.keys(gruplar).map((e) => {
      const takip = Array(12).fill(null), ref = Array(12).fill(null);
      tumSeri().filter((s) => s.enerji === e).forEach((s) => { const v = s.yillar[yil]; v.takip.forEach((x, a) => { if (x != null) takip[a] = (takip[a] || 0) + x; if (x != null && v.referans[a] != null) ref[a] = (ref[a] || 0) + v.referans[a]; }); });
      return { e, birim: gruplar[e].birim, takip, ref };
    });
    el.innerHTML = veri.map((d, i) => `<div class="glass-card rounded-2xl p-5"><div class="flex items-center justify-between"><div class="text-sm font-bold text-white">${d.e}: aylık tüketim ve referans</div><div class="text-[11px] text-slate-500">${yil} • ${d.birim}</div></div><div class="h-60 mt-3"><canvas id="chOzet${i}"></canvas></div></div>`).join('');
    veri.forEach((d, i) => cizGrafik('chOzet' + i, {
      data: { labels: AY, datasets: [
        { type: 'bar', label: 'Gerçekleşen', data: d.takip, backgroundColor: RENK[d.e] || '#3f8fd2', borderRadius: 4, order: 2, maxBarThickness: 34 },
        { type: 'line', label: 'Referans çizgisi', data: d.ref, borderColor: refRenk(), backgroundColor: refRenk(), borderWidth: 2.5, tension: 0.3, pointRadius: 3, order: 1 },
      ] },
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${tr0(c.parsed.y)} ${d.birim}` } } },
        scales: { y: { beginAtZero: true, ticks: { callback: (x) => (x >= 1000 ? (x / 1000).toLocaleString('tr-TR') + ' bin' : x) } } } },
    }));
  }

  // en çok referans aşan / en çok altında kalan seriler (tıklayınca Referans çizgisi sekmesi)
  function ozetSapma() {
    const el = document.getElementById('isoOzetSapma'); if (!el) return;
    const liste = tumSeri().map((s) => { const c = karsilastir(s.yillar[yil]); return { s, c, sapma: c.r ? c.t / c.r - 1 : null }; }).filter((x) => x.sapma != null).sort((a, b) => b.sapma - a.sapma);
    if (!liste.length) { el.innerHTML = ''; return; }
    const enb = Math.max(0.2, ...liste.map((x) => Math.abs(x.sapma)));
    el.innerHTML = `<div class="glass-card rounded-2xl p-5"><div class="flex items-center justify-between mb-3"><div class="text-sm font-bold text-white">Referansa göre sapma, seri sırası</div><button onclick="Iso.alt('ref')" class="text-[11px] text-amber-300 hover:underline">Referans çizgisi sekmesine git</button></div>
      <div class="space-y-2.5">${liste.map(({ s, c, sapma }) => `<div class="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_4.5rem] items-center gap-3 text-xs"><div class="truncate text-slate-200" title="${esc(s.bolum)}">${esc(s.bolum)}<span class="text-slate-500"> · ${esc(s.enerji)}</span></div>
        <div class="relative h-2.5 rounded-full bg-slate-800"><div class="absolute inset-y-0 left-1/2 w-px bg-slate-500"></div><div class="absolute inset-y-0 rounded-full ${sapma > 0.05 ? 'bg-red-500' : sapma > 0 ? 'bg-amber-400' : 'bg-emerald-500'}" style="${sapma >= 0 ? `left:50%;width:${Math.min(50, sapma / enb * 50)}%` : `right:50%;width:${Math.min(50, -sapma / enb * 50)}%`}"></div></div>
        <div class="text-right font-mono font-semibold ${sinif(sapma)}">${yuzde(sapma)}</div></div>`).join('')}</div>
      <p class="text-[10px] text-slate-500 mt-3">Orta çizgi = referans çizgisi; sağ (kırmızı/turuncu) aşım, sol (yeşil) referansın altı. Yalnız verisi olan aylar karşılaştırılır.</p></div>`;
  }

  function seriKarti(s, i) {
    const v = s.yillar[yil], cid = 'chIso' + i;
    const c = karsilastir(v), t = topla(v.takip), sapma = c.r ? c.t / c.r - 1 : null;
    const enbK = v.hedef ? 1 / (1 - v.hedef) : null;   // referans çizgisi hedefi ZATEN içerir; hedefsiz EnB = referans ÷ (1−hedef)
    const sapmaEnb = enbK && c.r ? c.t / (c.r * enbK) - 1 : null;
    const yontem = v.yontem === 'regresyon' ? 'Referans: regresyon (2024 katsayıları)' : v.yontem === 'ortalama' ? 'Referans: 2022–2023 ortalaması' : '';
    const aylik = v.takip.map((x, a) => ({ x, r: v.referans[a], d: x != null && v.referans[a] ? x / v.referans[a] - 1 : null }));
    const degAd = Object.keys(v.degiskenler);
    const tablo = `<div class="overflow-x-auto"><table class="w-full text-[11px]">
      <thead class="text-slate-400 uppercase tracking-wider"><tr><th class="text-left py-1.5">Ay</th><th class="text-right">Gerçekleşen</th><th class="text-right">Referans (hedef dahil)</th>${enbK ? '<th class="text-right">EnB (hedefsiz)</th>' : ''}<th class="text-right">Sapma</th>${degAd.map((d) => `<th class="text-right">${esc(d)}</th>`).join('')}<th class="text-left pl-3">Sapma gerekçesi</th></tr></thead>
      <tbody class="divide-y divide-slate-800/70">${aylik.map((m, a) => `<tr><td class="py-1.5 text-slate-200">${AY[a]}</td><td class="text-right font-mono">${tr0(m.x)}</td><td class="text-right font-mono text-slate-400">${tr0(m.r)}</td>${enbK ? `<td class="text-right font-mono text-slate-500">${m.r == null ? '—' : tr0(m.r * enbK)}</td>` : ''}
        <td class="text-right font-mono ${sinif(m.d)}">${yuzde(m.d)}</td>${degAd.map((d) => `<td class="text-right font-mono text-slate-400">${tr0(v.degiskenler[d][a])}</td>`).join('')}<td class="pl-3 text-slate-400">${esc(v.gerekce[a] || '')}</td></tr>`).join('')}</tbody></table></div>`;
    return `<div class="glass-card rounded-xl p-4">
      <div class="flex items-start justify-between gap-3">
        <div><div class="text-sm font-semibold text-white">${esc(s.bolum)}</div><div class="text-[11px]" style="color:${RENK[s.enerji]}">${esc(s.enerji)} • ${esc(s.birim)}</div>${yontem ? `<div class="text-[10px] text-slate-500 mt-0.5">${yontem} ${window.Enb ? Enb.rozet(s.id) : ''}</div>` : ''}</div>
        <div class="text-right"><div class="text-lg font-bold ${sinif(sapma)}">${yuzde(sapma)}</div><div class="text-[11px] text-slate-500">${c.r ? `${tr0(c.t)} / ${tr0(c.r)}` : `${tr0(t)} • referans yok`}</div>${sapmaEnb != null ? `<div class="text-[10px] text-slate-500" title="Hedefsiz EnB: referans çizgisi ÷ (1 − hedef)">EnB'ye göre <span class="${sinif(sapmaEnb)}">${yuzde(sapmaEnb)}</span></div>` : ''}</div>
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
          { type: 'line', label: 'Referans çizgisi', data: v.referans, borderColor: refRenk(), backgroundColor: refRenk(), borderWidth: 2, tension: 0.3, pointRadius: 0, order: 1 },
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
      return `<tr ${tikla} class="${x.id === tesis ? 'bg-amber-500/5' : ''} ${x.id === 'genel' ? '' : 'hover:bg-slate-800/40'}"><td class="px-2 sm:px-3 py-2 text-slate-100">${esc(x.ad)}</td>
        <td class="px-2 sm:px-3 py-2 text-right font-mono hidden sm:table-cell">${SIRA.reduce((t, k) => t + cc[k], 0)}</td>${SIRA.map((k) => `<td class="px-2 sm:px-3 py-2 text-right font-mono ${k === 'tamamlandi' || k === 'gecikmis' ? '' : 'hidden sm:table-cell'} ${cc[k] ? (k === 'gecikmis' ? 'text-red-500 font-semibold' : 'text-slate-200') : 'text-slate-600'}">${cc[k]}</td>`).join('')}
        <td class="px-2 sm:px-3 py-2 hidden sm:table-cell">${cubuk(cc, 'w-28')}</td><td class="px-2 sm:px-3 py-2 text-right font-mono text-emerald-300">${o == null ? '—' : '%' + Math.round(o * 100)}</td></tr>`;
    }).join('');
    const karsilastirma = `<div class="overflow-x-auto"><table class="w-full text-xs"><thead class="bg-slate-900/80 text-slate-400 uppercase tracking-wider text-[11px]"><tr><th class="text-left px-2 sm:px-3 py-2.5">Tesis</th><th class="text-right px-2 sm:px-3 hidden sm:table-cell">Toplam</th>${SIRA.map((k) => `<th class="text-right px-2 sm:px-3 ${k === 'tamamlandi' || k === 'gecikmis' ? '' : 'hidden sm:table-cell'}">${DURUMLAR[k].ad.replace(' / yapılmayacak', '').replace(' faaliyet', '')}</th>`).join('')}<th class="px-2 sm:px-3 text-left hidden sm:table-cell">İlerleme</th><th class="text-right px-2 sm:px-3">Tamamlanma</th></tr></thead>
      <tbody class="divide-y divide-slate-800/70">${tesisSatirlari}</tbody></table></div>
      <p class="px-4 py-2 text-[11px] text-slate-500">Tamamlanma = tamamlanan ÷ (tamamlanan + devam eden + planlı + gecikmiş). Sürekli faaliyetler ve iptaller hesaba katılmaz. Satıra tıklayarak tesisi seçebilirsiniz.</p>`;

    // süzgeç düğmeleri
    const dugme = (k, ad, n) => `<button onclick="Iso.ed('${k}')" class="px-2.5 py-1 rounded-md text-[11px] font-semibold ${eDurum === k ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-slate-200'}">${ad}${n != null ? ` <span class="opacity-70">${n}</span>` : ''}</button>`;
    const suzgec = `<div class="flex flex-wrap gap-1 bg-slate-900/80 rounded-lg p-0.5">${dugme('hepsi', 'Tümü', hepsi.length)}${SIRA.filter((k) => c[k]).map((k) => dugme(k, DURUMLAR[k].ad.replace(' / yapılmayacak', ''), c[k])).join('')}</div>`;

    // satırlar
    kayitlar = [];
    const alan = (b, d) => (d ? `<div><div class="text-[10px] uppercase tracking-wider text-slate-500">${b}</div><div class="text-slate-200 whitespace-pre-line">${esc(d)}</div></div>` : '');
    const terminMetni = (e) => (/^\d{4}-/.test(e.termin || '') ? e.termin : ((e.termin || '—').length > 18 ? (e.termin || '').slice(0, 18) + '…' : (e.termin || '—')));
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
        <td class="px-3 py-2 hidden sm:table-cell">${enerjiNokta(e.enerji)}</td>
        <td class="px-3 py-2 text-slate-100 sm:w-[44%]">${esc(e.onlem || '—')}${m.not ? '<span class="ml-1 text-amber-300" title="Takip notu var">✎</span>' : ''}<div class="sm:hidden text-[11px] text-slate-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">${enerjiNokta(e.enerji)}<span>${esc(terminMetni(e))}</span></div></td>
        <td class="px-3 py-2 whitespace-nowrap hidden sm:table-cell ${d === 'gecikmis' ? 'text-red-500' : 'text-slate-400'}">${esc(terminMetni(e))}${d === 'gecikmis' && gunFarki(e.termin) > 0 ? `<div class="text-[11px]">${gunFarki(e.termin)} gün gecikti</div>` : ''}</td>
        <td class="px-3 py-2">${rozet(d)}${m.durum && m.durum !== 'oto' ? '<div class="text-[10px] text-slate-500 mt-1">elle</div>' : ''}${yuzde}</td></tr>
        <tr id="es${n}" class="${acikMi ? '' : 'hidden'}"><td colspan="5" class="px-4 py-3 bg-slate-900/50">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">${alan('Gerçekleşme durumu (Excel)', e.durum)}${alan('Eylem planına giriş gerekçesi', e.gerekce)}${alan('Hedeflenen kazanç', e.hedef)}${alan('Planlama tarihi', e.planlama)}${alan('Termin', e.termin)}${alan('Gerçekleştirilme', e.gerceklesme_tarihi)}${alan('Sorumlu', e.sorumlu)}${alan('Geri ödeme süresi (yıl)', e.geri_odeme)}</div>${form}</td></tr>`;
    };
    const sec = (l) => l.filter((k) => eDurum === 'hepsi' || etkinDurum(k) === eDurum);
    const blok = (baslik, l) => (sec(l).length ? `<tr class="bg-slate-900/60"><td colspan="5" class="px-3 py-2 text-[11px] uppercase tracking-wider text-slate-400">${baslik} (${sec(l).length})</td></tr>${sec(l).map(satir).join('')}` : '');
    const tablo = `<div class="overflow-x-auto"><table class="w-full text-xs"><thead class="bg-slate-900/80 text-slate-400 uppercase tracking-wider text-[11px]"><tr><th class="text-left px-3 py-3">No</th><th class="text-left px-3 hidden sm:table-cell">Enerji</th><th class="text-left px-3">Önlem / iyileştirme</th><th class="text-left px-3 hidden sm:table-cell">Termin</th><th class="text-left px-3">Durum</th></tr></thead>
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
      `<div class="p-4 pb-0"><div class="olcum-seridi grid grid-cols-2 lg:grid-cols-4">${[
        ['Tamamlanma', oran == null ? '—' : '%' + Math.round(oran * 100), 'text-white', `${c.tamamlandi} eylem tamamlandı (tesis ve genel eylemler)`],
        ['Gecikmiş', c.gecikmis, c.gecikmis ? 'text-red-500' : 'text-emerald-500', c.gecikmis ? 'termini geçmiş, tamamlanmamış' : 'termini geçen eylem yok'],
        ['Devam eden ve planlı', c.devam + c.planli, 'text-white', 'sürüyor ya da henüz başlamadı'],
        ['Sürekli faaliyet', c.surekli, 'text-white', 'periyodik; tamamlanma hesabına girmez']].map(([b, n, r, a]) => `<div class="glass-card p-4"><div class="text-sm text-slate-400 font-medium">${b}</div><div class="text-3xl font-semibold mt-2 leading-none ${r}">${n}</div><div class="text-xs text-slate-500 mt-2">${a}</div></div>`).join('')}</div></div>
      ${ortakCubuk}${karsilastirma}<div class="px-4 py-3 border-t border-slate-800 flex flex-wrap items-center gap-3"><span class="text-[11px] text-slate-400">Seçili tesis ve genel eylemler:</span>${suzgec}</div>${tablo}${bos}${alt}`);
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
        <td class="px-3 py-2"><span class="inline-flex items-center gap-1.5 whitespace-nowrap"><span class="inline-block w-2 h-2 rounded-full" style="background:${x.tur === 'Risk' ? '#ef4444' : '#38bdf8'}"></span>${esc(x.tur)}</span><div class="text-[10px] text-slate-500 mt-1">${esc(x.kaynak || '')}</div></td>
        <td class="px-3 py-2 text-slate-100 w-[48%]">${esc(x.tanim)}</td>
        <td class="px-3 py-2 whitespace-nowrap text-center">${x.seviye == null ? '—' : (window.Risk ? Risk.ozetRozet(x.seviye, x.tur) : tr0(x.seviye))}<div class="text-[10px] text-slate-500 mt-1">O${tr0(x.o)} × E${tr0(x.e)}</div></td>
        <td class="px-3 py-2 text-center">${x.sonra != null ? (window.Risk ? Risk.ozetRozet(x.sonra, x.tur) : tr0(x.sonra)) : '<span class="text-slate-600">—</span>'}</td></tr>
        <tr id="er${k}" class="${acikMi ? '' : 'hidden'}"><td colspan="5" class="px-4 py-3 bg-slate-900/50"><div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">${alan('Aksiyon', x.aksiyon)}${alan('Sorumlu', x.sorumlu)}${alan('Sistematik faaliyetler', x.faaliyet)}</div>${x.aksiyon || x.faaliyet ? '' : '<p class="text-xs text-slate-500">Bu kayıt için aksiyon girilmemiş.</p>'}</td></tr>`;
    };
    const blok = (baslik, l) => (sec(l).length ? `<tr class="bg-slate-900/60"><td colspan="5" class="px-3 py-2 text-[11px] uppercase tracking-wider text-slate-400">${baslik} (${sec(l).length})</td></tr>${sec(l).map(satir).join('')}` : '');
    const dugme = (k, ad) => `<button onclick="Iso.rf('${k}')" class="px-2.5 py-1 rounded-md text-[11px] font-semibold ${rfTur === k ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-slate-200'}">${ad}</button>`;
    const ozet = `<span>Bu tesis: <b class="text-rose-300">${t.r} risk</b>${t.y ? ` <span class="text-red-300">(${t.y} yüksek)</span>` : ''} • <b class="text-sky-300">${t.f} fırsat</b></span><span>Genel: ${g.r} risk • ${g.f} fırsat</span>`;
    el.innerHTML = bolum('risk', 'Risk ve fırsat değerlendirmesi', ozet,
      `${window.Risk ? `<div class="p-4">${Risk.ozetHtml([...tesisRisk, ...genel].map((x) => ({ tur: x.tur, o: x.o, e: x.e, skor: x.seviye, tanim: x.tanim, no: x.no, eylemsiz: false })), 'excel')}</div>` : ''}<div class="px-4 py-3 flex items-center gap-3 border-b border-t border-slate-800"><span class="text-[11px] text-slate-400">Satıra tıklayınca aksiyon ve sistematik faaliyetler açılır.</span><div class="ml-auto flex gap-1 bg-slate-900/80 rounded-lg p-0.5">${dugme('hepsi', 'Tümü')}${dugme('risk', 'Riskler')}${dugme('firsat', 'Fırsatlar')}</div></div>
      <div class="overflow-auto max-h-[40rem]"><table class="w-full text-xs"><thead class="bg-slate-900 text-slate-400 uppercase tracking-wider text-[11px] sticky top-0 z-10"><tr><th class="text-left px-3 py-3">No / proses</th><th class="text-left px-3">Tür</th><th class="text-left px-3">Tanım</th><th class="px-3">Seviye</th><th class="px-3">Aksiyon sonrası</th></tr></thead>
      <tbody class="divide-y divide-slate-800/70">${blok('Tesise özel', tesisRisk)}${blok('Genel', genel)}</tbody></table></div>
      <div class="px-4 py-2 text-[11px] text-slate-500 border-t border-slate-800">Seviye = olasılık (O) × etki (E). 12 ve üzeri yüksek (kırmızı), 6–11 orta (turuncu), 5 ve altı düşük (yeşil).</div>`);
  }

  function notlar() {
    const n = D.veri_notlari || [];
    document.getElementById('isoNotlar').innerHTML = bolum('notlar', 'Okuma notları', n.length ? `<span>Excel'de ${n.length} tutarsızlık</span>` : '', `<ul class="p-4 list-disc pl-9 space-y-1 text-xs text-slate-400">
        <li><b class="text-slate-300">Sapma</b> = (gerçekleşen − referans) ÷ referans. Pozitif (kırmızı/turuncu) değer referans çizgisinin aşıldığını, negatif (yeşil) değer altında kaldığını gösterir.</li>
        <li><b class="text-slate-300">Referans ve EnB:</b> Excel'deki referans çizgisi hedefi ZATEN içerir (baz dönem × (1 − hedef)). Hedefsiz EnB = referans ÷ (1 − hedef) olarak "EnB (hedefsiz)" sütununda ve kartta "EnB'ye göre" satırında ayrıca gösterilir: EnB'nin altı ama referansın üstü, tasarruf var ama hedefe ulaşılmadı demektir. Model güvenilirliği için "EnB, SEU ve M&V" sekmesine bakın.</li>
        <li>Referans çizgisi, Excel'deki EnRÇ hesabından (önceki yıl verisi, gerekirse HDD/CDD, etkinlik sayısı gibi değişkenlerle) aynen alınmıştır; burada yeniden hesaplanmaz. 2023 için referans yılı 2022'dir; 2024'te dosyaların çoğunda 2022–2023 ortalaması kullanılır.</li>
        <li><b class="text-slate-300">2025–2026</b> gerçekleşen tüketimler Verilerim.xlsx'ten alınmıştır (2023–2024 ile eşleşmesi EnRÇ dosyalarına göre doğrulanmıştır). Referans çizgisinde baz dönem (2022–2023) sabit tutulmuştur: elektrik ve benzeri serilerde 2024 dosyasındaki referans aynen; HDD/CDD'li serilerde 2024 dosyasındaki regresyon katsayıları × ilgili ayın HDD/CDD değeri. 2026 HDD/CDD değerleri MGM'nin İzmir gün-derece tablosundan alınmıştır (2024–2025 değerleriniz bu tabloyla birebir tutmaktadır); Eylül 2026 kısmi aydır. Kısmi yıllarda sapma yalnızca verisi olan aylar üzerinden hesaplanır.</li>
        <li><b class="text-slate-300">Eylem durumu</b> Excel'deki termin ve açıklama metinlerinden otomatik çıkarılır: tarihli gerçekleştirme veya "yapılmıştır" benzeri ifade = tamamlandı; "düzenli/periyodik/sürekli" = sürekli faaliyet; "iptal/yapılmayacak" = iptal; terminini geçmiş = gecikmiş. Yanlış çıkanı satırda elle düzeltin.</li>
        <li>Yatırım tutarları (TL) eylem planından bilerek alınmamıştır.</li>
        ${n.map((x) => `<li>${esc(x.yil)} ${esc(x.seri)}: Excel toplamı ${tr0(x.excel_toplam)}, aylık değerlerin toplamı ${tr0(x.aylik_toplam)}. ${esc(x.not)}</li>`).join('')}
      </ul>`);
  }

  // ---- alt sekmeler (tesis içinde tek seferde bir bölüm görünür; uzun sayfa yerine)
  const ALT = [['ozet', 'Özet'], ['ref', 'Referans çizgisi'], ['enb', 'EnB, SEU ve M&V'], ['olcum', 'Ölçüm'], ['hedef', 'Hedefler ve EnPG'], ['eylem', 'Eylem planı'], ['etut', 'Enerji etüdü'], ['ikiz', 'Dijital ikiz'], ['risk', 'Risk ve fırsat'], ['denetim', 'Denetim'], ['baglam', 'Bağlam ve taraflar'], ['bakim', 'Bakım ve yetkinlik'], ['belge', 'Belgeler']];

  function iskelet() {
    document.getElementById('isoIcerik').innerHTML = `<style>#isoIcerik summary::-webkit-details-marker{display:none}#isoAlt::-webkit-scrollbar{height:4px}</style><div class="space-y-4">
      <div class="flex flex-wrap items-center gap-3">
        <div id="isoTesisler" class="flex flex-wrap gap-2 mr-auto"></div>
        <label class="text-[11px] text-slate-400">Yıl <select id="isoYil" onchange="Iso.yil(this.value)" class="ml-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-100"></select></label>
        <button onclick="Enys.ygg()" title="Yönetimin gözden geçirmesi hazırlık özeti (tüm tesisler)" class="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30">YGG özeti</button>
      </div>
      <h2 id="isoBaslik" class="text-lg font-bold text-white"></h2>
      <nav id="isoAlt" class="flex gap-1 overflow-x-auto border-b border-slate-800 pb-1"></nav>
      <div id="isoP-ozet" class="space-y-4"><section id="isoKartlar" class="olcum-seridi grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4"></section><section id="isoOzetGrafik" class="grid grid-cols-1 lg:grid-cols-2 gap-4"></section><section id="isoOzetSapma"></section><section id="isoOzetSerit" class="grid grid-cols-2 lg:grid-cols-4 gap-4"></section></div>
      <div id="isoP-ref" class="hidden space-y-4"><section id="isoRefOzet"></section><div id="isoBolumChips" class="flex flex-wrap gap-1"></div><section id="isoSeriler" class="grid grid-cols-1 lg:grid-cols-2 gap-4"></section><section id="isoEk" class="space-y-4"></section><div id="isoNotlar"></div></div>
      <div id="isoP-enb" class="hidden"><section id="isoEnb"></section></div>
      <div id="isoP-olcum" class="hidden"><section id="isoOlcum"></section><section id="isoDonanim" class="mt-6"></section></div>
      <div id="isoP-hedef" class="hidden space-y-4"><section id="isoHedef"></section><section id="isoEnpg"></section></div>
      <div id="isoP-eylem" class="hidden"><section id="isoEylem"></section><section id="isoEylemDB" class="mt-6"></section></div>
      <div id="isoP-etut" class="hidden"><section id="isoEtutPanel"></section></div>
      <div id="isoP-ikiz" class="hidden"><section id="isoIkiz"></section></div>
      <div id="isoP-risk" class="hidden"><section id="isoRiskDB"></section><section id="isoRisk" class="hidden"></section><p id="isoRiskBos" class="hidden text-sm text-slate-400 p-6">Bu tesis için risk ve fırsat kaydı yok.</p></div>
      <div id="isoP-baglam" class="hidden"><section id="isoBaglam"></section></div>
      <div id="isoP-bakim" class="hidden"><section id="isoBakim"></section></div>
      <div id="isoP-belge" class="hidden"><section id="isoBelge"></section></div>
      <div id="isoP-denetim" class="hidden space-y-4"><section id="isoTetkik"></section><section id="isoYgg"></section></div></div>`;
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
    Ikiz.ciz({ D, tesis, eylemler: bitmemis, acik: true });
  }

  function altNavCiz() {
    document.getElementById('isoAlt').innerHTML = ALT.map(([k, ad]) => `<button onclick="Iso.alt('${k}')" data-iso-alt="${k}" class="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${k === altSekme ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-slate-200'}">${ad}</button>`).join('');
  }

  // Özet sekmesindeki kısa durum kartları: tıklayınca ilgili sekmeye geçer
  function ozetSerit() {
    const el = document.getElementById('isoOzetSerit'); if (!el) return;
    const c = sayilar(kayit(tesis)), oran = tamamlanma(c), riskler = (D.risk && D.risk[tesis]) || [], yRisk = riskler.filter((x) => x.tur === 'Risk' && (x.seviye || 0) >= 12).length;
    const kart = (k, baslik, deger, alt, renk) => `<button onclick="Iso.alt('${k}')" class="glass-card rounded-2xl p-4 text-left hover:border-amber-500/40 transition"><div class="text-xs uppercase tracking-wider text-slate-400 font-semibold">${baslik}</div><div class="text-2xl font-extrabold mt-1.5 ${renk || 'text-white'}">${deger}</div><div class="text-xs text-slate-400 mt-1">${alt}</div></button>`;
    const ham = (h, e) => [
      kart('hedef', `${h ? h.yil : ''} hedefleri`, h && h.toplam ? `${h.hedefte}/${h.toplam} hedefte` : '—', h ? `${h.geride} geride • ${h.riskte} riskte` : 'yükleniyor…', h && h.riskte ? 'text-red-300' : 'text-emerald-300'),
      kart('eylem', 'Eylem planı', oran == null ? '—' : '%' + Math.round(oran * 100) + ' tamamlandı', `${c.gecikmis ? c.gecikmis + ' gecikmiş • ' : ''}${kayit(tesis).length} eylem`, c.gecikmis ? 'text-red-300' : 'text-white'),
      kart('etut', 'Enerji etüdü', e ? `${tr0(e.tlYil)} TL/yıl` : '—', e ? `${e.n} öneri • ${e.tamam} tamamlandı • 2022 fiyatı` : 'yükleniyor…', 'text-cyan-300'),
      kart('risk', 'Risk ve fırsat', `${riskler.filter((x) => x.tur === 'Risk').length} risk`, `${yRisk} yüksek seviyeli • ${riskler.filter((x) => x.tur === 'Fırsat').length} fırsat`, yRisk ? 'text-red-300' : 'text-white'),
    ].join('');
    el.innerHTML = ham(null, null);
    const t0 = tesis;
    Promise.all([window.Enys ? Enys.yukle() : null, window.Etut ? Etut.yukle() : null]).then(() => {
      if (t0 !== tesis || altSekme !== 'ozet') return;
      el.innerHTML = ham(window.Enys ? Enys.ozet(D, tesis) : null, window.Etut ? Etut.tesisOzet(tesis) : null);
    }).catch(() => {});
  }

  // Referans çizgisi sekmesinin üstü: tesisteki tüm serilerin tek tabloda karşılaştırması (detay grafikleri altta)
  function refOzet() {
    const el = document.getElementById('isoRefOzet'); if (!el) return;
    const satir = tumSeri().map((s) => {
      const v = s.yillar[yil], c = karsilastir(v), sapma = c.r ? c.t / c.r - 1 : null, enbK = v.hedef ? 1 / (1 - v.hedef) : null;
      return { s, v, c, sapma, sapmaEnb: enbK && c.r ? c.t / (c.r * enbK) - 1 : null };
    });
    if (!satir.length) { el.innerHTML = ''; return; }
    el.innerHTML = `<div class="glass-card overflow-hidden"><div class="px-5 py-3 border-b border-slate-800 flex flex-wrap items-baseline justify-between gap-2"><h3 class="text-sm font-bold text-white">Seri karşılaştırması, ${yil}</h3><span class="text-[11px] text-slate-500">Sapma referans çizgisine göre (hedef dahil); EnB sütunu hedefsiz taban. Yalnız verisi olan aylar.</span></div>
      <div class="overflow-x-auto"><table class="w-full text-xs" style="min-width:720px"><thead class="text-slate-400"><tr class="border-b border-slate-800"><th class="px-5 py-2 text-left font-medium">Seri</th><th class="px-3 text-right font-medium">Gerçekleşen</th><th class="px-3 text-right font-medium">Referans</th><th class="px-3 text-right font-medium">Sapma</th><th class="px-3 text-right font-medium">EnB'ye göre</th><th class="px-3 text-center font-medium">Ay</th><th class="px-5 text-left font-medium">Model</th></tr></thead>
      <tbody class="divide-y divide-slate-800/70">${satir.map(({ s, v, c, sapma, sapmaEnb }) => `<tr><td class="px-5 py-2.5 text-slate-100 font-medium">${esc(s.bolum)}<span class="text-slate-500 font-normal"> (${esc(s.enerji)})</span></td>
        <td class="px-3 text-right">${tr0(c.t)} <span class="text-slate-500">${esc(s.birim)}</span></td><td class="px-3 text-right text-slate-400">${c.r ? tr0(c.r) : '—'}</td>
        <td class="px-3 text-right font-semibold ${sinif(sapma)}">${yuzde(sapma)}</td><td class="px-3 text-right ${sinif(sapmaEnb)}">${yuzde(sapmaEnb)}</td>
        <td class="px-3 text-center text-slate-400">${veriAy(v)}/12</td><td class="px-5">${window.Enb ? Enb.rozet(s.id) : ''}</td></tr>`).join('')}</tbody></table></div></div>`;
  }

  function bolumChips() {
    const adlar = [...new Set(tumSeri().map(bolumAdi))];
    const el = document.getElementById('isoBolumChips');
    el.innerHTML = adlar.length > 1 ? [['hepsi', 'Tüm bölümler'], ...adlar.map((a) => [a, a])].map(([k, ad]) => `<button onclick="Iso.bolum('${k.replace(/'/g, "\\'")}')" class="px-2.5 py-1 rounded-md text-[11px] font-semibold ${bolumSec === k ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-300 hover:text-white'}">${esc(ad)}</button>`).join('') : '';
  }

  const girisVar = () => !!(window.VeriDB && VeriDB.hazir() && VeriDB.oturum());
  const PANEL = {
    ozet() { ozetKartlari(); ozetSerit(); },
    ref() { refOzet(); bolumChips(); document.getElementById('isoSeriler').innerHTML = seriler().map(seriKarti).join('') || '<p class="text-sm text-slate-400 p-6">Bu yıl için seri yok.</p>'; seriGrafikleri(); ekBolum(); notlar(); },
    olcum() {
      if (!window.Olcum) return;
      // Canlı referans karşılaştırması için: bu tesisin elektrik serisi, bölüm adıyla; içinde bulunulan ayın referansı ve yıllık hedef
      const seri = (bolum) => {
        const yl = String(new Date().getFullYear()), ay = new Date().getMonth(), n = (x) => String(x || '').toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
        const s = D.seriler.find((x) => x.tesis === tesis && x.enerji === 'Elektrik' && x.yillar[yl] && n(bolumAdi(x)) === n(bolum));
        return s ? { referans: s.yillar[yl].referans[ay], hedef: s.yillar[yl].hedef } : null;
      };
      Olcum.panel(tesis, document.getElementById('isoOlcum'), { seri });
      if (window.OlcumPlan) OlcumPlan.panel(tesis, document.getElementById('isoDonanim'));
    },
    hedef() { if (window.Enys) Enys.ciz(D, { tesis, yil }, 'hedef'); },
    eylem() {
      eylemBolumu();
      const db = document.getElementById('isoEylemDB');
      if (window.Risk && girisVar()) Risk.eylemPanel(tesis, db); else db.innerHTML = '';
    },
    etut() { if (window.Etut) Etut.panel(tesis, document.getElementById('isoEtutPanel')); },
    ikiz() { ikizBolumu(); },
    risk() {
      const db = document.getElementById('isoRiskDB');
      if (window.Risk && girisVar()) {   // Veri Girişi hesabıyla giriş yapılmışsa düzenlenebilir veritabanı kayıtları
        document.getElementById('isoRisk').classList.add('hidden'); document.getElementById('isoRiskBos').classList.add('hidden');
        Risk.panel(tesis, db, D.risk);
      } else {
        db.innerHTML = '<p class="text-[11px] text-slate-500 mb-2">Risk ve fırsatları düzenlemek, skoru sunucuda hesaplatmak ve riskten eylem açmak için Veri Girişi hesabınızla giriş yapın. Aşağıda Excel\'den okunan salt okunur görünüm var.</p>';
        riskBolumu(); document.getElementById('isoRiskBos').classList.toggle('hidden', !document.getElementById('isoRisk').classList.contains('hidden'));
      }
    },
    enb() { if (window.Enb) Enb.panel(tesis, document.getElementById('isoEnb'), D.seriler); },
    baglam() { if (window.Baglam) Baglam.panel(tesis, document.getElementById('isoBaglam')); },
    bakim() { if (window.Bakim) Bakim.panel(tesis, document.getElementById('isoBakim')); },
    belge() { if (window.Dys) Dys.panel(document.getElementById('isoBelge')); },
    denetim() { if (window.Enys) Enys.ciz(D, { tesis, yil }, 'denetim'); },
  };
  function panelGoster() {
    ALT.forEach(([k]) => document.getElementById('isoP-' + k).classList.toggle('hidden', k !== altSekme));
    altNavCiz();
    PANEL[altSekme]();
    if (window.lucide) lucide.createIcons();
    setTimeout(() => Object.values(grafik).forEach((g) => g && g.resize()), 60);
  }

  function ciz() {
    if (!document.getElementById('isoTesisler')) iskelet();
    const t = D.tesisler.find((x) => x.id === tesis);
    document.getElementById('isoTesisler').innerHTML = D.tesisler.map((x) => `<button data-iso-tesis="${x.id}" onclick="Iso.tesis('${x.id}')" class="px-3.5 py-2 rounded-lg text-xs font-semibold ${x.id === tesis ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-slate-800 text-slate-300 hover:text-white border border-transparent'}"><span class="hidden sm:inline">${esc(x.ad)}</span><span class="sm:hidden">${esc(({ aassm: 'AASSM', buz: 'Buz Sporları', buca: 'Buca SYK' })[x.id] || x.ad)}</span></button>`).join('');
    document.getElementById('isoYil').innerHTML = [...new Set(D.seriler.flatMap((x) => Object.keys(x.yillar)))].sort().map((y) => `<option ${y === yil ? 'selected' : ''}>${y}</option>`).join('');
    document.getElementById('isoBaslik').textContent = t ? t.ad : '';
    panelGoster();
  }

  const satirAc = (onek, k, simgeOnek) => {
    const r = document.getElementById(onek + k); if (!r) return;
    const ac = r.classList.toggle('hidden') === false;
    const id = onek === 'es' ? (kayitlar[+k] || {}).id : k;
    if (id) ac ? acikSatir.add(id) : acikSatir.delete(id);
    const s = document.getElementById(simgeOnek + k); if (s) s.textContent = ac ? '▾' : '▸';
  };

  window.Iso = {
    // YGG özeti için: tesis bazında eylem durumu sayıları
    ozetVeri() { return D ? D.tesisler.map((t) => ({ id: t.id, ad: t.ad, c: sayilar(kayit(t.id)) })) : []; },
    async ac() {
      if (!yuklendi) await yukle();
      if (!yuklendi) { if (sifreli) girisFormu(); return; }
      await ortakYukle();
      ciz();
    },
    tesis(id) { tesis = id; bolumSec = 'hepsi'; ciz(); },
    alt(k) { if (!PANEL[k]) return; altSekme = k; if (yuklendi && document.getElementById('isoAlt')) panelGoster(); },
    bolum(b) { bolumSec = b; PANEL.ref(); },
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
  if ((location.hash || '').slice(1) === 'iso') window.Iso.ac(); else yukle();   // Özet kartı için şifre oturumda varsa sessizce yükle
})();
