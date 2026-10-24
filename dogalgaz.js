/* Doğalgaz sekmesi: kurumsal doğalgaz abonelerinin aylık tüketimi (m³).
 *
 * Veri: data/dogalgaz.json (ŞİFRESİZ, herkese açık; varsa kullanılır) ya da data/dogalgaz.enc.json (şifreli). Üretim: collector/dogalgaz_to_json.py "<Excel>" [--acik] ya da araclar/dogalgaz-sifrele.html.
 * Abone/adres/hesap no/TL tutarları dosyaya yazılmaz; abone kimliği hesap no'nun özetidir.
 * Abone adları (özellikle "T.C. İZMİR BÜYÜKŞEHİR BELEDİYESİ" gibi genel adlı olanlar) bu tarayıcıda yeniden adlandırılabilir.
 * Uyarı kuralları (uyarilariHesapla): dönem artışı, son ay sıçraması, geçmiş yıllara göre aykırı ay, yaz tabanı, tüketim görünmüyor.
 */
(function () {
  const AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const AY_UZUN = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const YIL_RENK = () => ({ 2022: '#94a3b8', 2023: '#64748b', 2024: '#7a5cc7', 2025: '#3f8fd2', 2026: TV() });
  // Kg CO₂e / m³: kurumsal raporun doğalgaz emisyonundan geri hesaplandı (1.970 t / 987.899 m³ ≈ 1,994). Resmî tabloyla doğrulayın.
  const PARAM_ANAHTAR = 'dogalgaz_v1_param', AD_ANAHTAR = 'dogalgaz_v1_adlar';
  const VARSAYILAN = { kg_m3: 1.994 };

  let G = null, sifreli = null, yuklendi = false, cizildi = false;
  let sirala = { k: 'donem', ters: true }, ara = '', uyariCache = null;
  const grafik = {};

  const oku = (k, v0) => { try { return Object.assign({}, v0, JSON.parse(localStorage.getItem(k) || '{}')); } catch (e) { return Object.assign({}, v0); } };
  const yaz = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  let param = oku(PARAM_ANAHTAR, VARSAYILAN), adlar = oku(AD_ANAHTAR, {});

  const b64 = (t) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
  const oturum = (k, v) => { try { return v === undefined ? sessionStorage.getItem(k) : (v === null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v)); } catch (e) { return null; } };
  const tr0 = (n) => (n == null || isNaN(n) ? '—' : Math.round(n).toLocaleString('tr-TR'));
  const fark = (v) => (v == null || !isFinite(v) ? '—' : (v >= 0 ? '+' : '') + (v * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + '%');
  const topla = (a, n) => (a || []).slice(0, n == null ? 12 : n).reduce((t, v) => t + (v || 0), 0);
  const dolu = (a, n) => (a || []).slice(0, n).some((v) => v != null);
  const renkFark = (v) => (v == null || !isFinite(v) ? 'text-slate-400' : v > 0.1 ? 'text-red-400' : v < -0.1 ? 'text-emerald-400' : 'text-slate-300');

  function cizGrafik(id, yapi) {
    if (grafik[id]) grafik[id].destroy();
    const el = document.getElementById(id);
    if (el && window.Chart) grafik[id] = new Chart(el, yapi);
  }

  // ---------- şifre çözme ----------
  async function coz(parola) {
    const malzeme = await crypto.subtle.importKey('raw', new TextEncoder().encode(parola), 'PBKDF2', false, ['deriveKey']);
    const anahtar = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64(sifreli.salt), iterations: sifreli.iter, hash: 'SHA-256' },
      malzeme, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(sifreli.iv) }, anahtar, b64(sifreli.data))));
  }
  async function parolaDene(p) {
    try { G = await coz(p); yuklendi = true; hazirla(); ozetKayit(); return true; } catch (e) { return false; }
  }
  async function yukle() {
    try {
      // Önce şifresiz data/dogalgaz.json (varsa parola gerekmez), yoksa şifreli data/dogalgaz.enc.json
      if (!G && !sifreli) {
        const ra = await fetch('data/dogalgaz.json?t=' + Date.now(), { cache: 'no-store' });
        if (ra.ok) { G = await ra.json(); yuklendi = true; hazirla(); ozetKayit(); return; }
      }
      if (!sifreli) {
        const r = await fetch('data/dogalgaz.enc.json?t=' + Date.now(), { cache: 'no-store' });
        if (!r.ok) throw new Error(r.status);
        sifreli = await r.json();
      }
      const kayitli = oturum('elp');
      if (kayitli && await parolaDene(kayitli)) return;
      oturum('elp', null);
    } catch (e) {
      sifreli = null;
      const k = document.getElementById('dgIcerik');
      if (k) k.innerHTML = '<p class="text-sm text-slate-400 p-6">Doğalgaz verisi henüz yüklenmedi. Yönetici: Excel çizelgesini <a class="underline" href="araclar/dogalgaz-sifrele.html">bu sayfada</a> şifreleyip <code>data/dogalgaz.enc.json</code> olarak depoya yükleyin.</p>';
    }
  }
  function girisFormu(hata) {
    document.getElementById('dgIcerik').innerHTML = `<form id="dgGiris" class="max-w-sm mx-auto my-10 bg-slate-800/60 border border-slate-700 rounded-xl p-5 space-y-3">
      <div class="flex items-center gap-2 text-amber-300 font-semibold"><i data-lucide="lock" class="w-4 h-4"></i> Yönetici girişi</div>
      <p class="text-xs text-slate-400">Doğalgaz verileri şifreli saklanır. Görmek için parolayı girin (Elektrik sekmesiyle aynı parola).</p>
      <input id="dgParola" type="password" autocomplete="current-password" class="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm" placeholder="Parola" />
      <p class="text-xs text-rose-400 ${hata ? '' : 'hidden'}">${hata || ''}</p>
      <button class="w-full bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold rounded-lg py-2 text-sm">Giriş</button>
    </form>`;
    if (window.lucide) lucide.createIcons();
    document.getElementById('dgGiris').onsubmit = async (ev) => {
      ev.preventDefault();
      const p = document.getElementById('dgParola').value;
      if (await parolaDene(p)) { oturum('elp', p); window.Dogalgaz.ac(); } else girisFormu('Parola yanlış.');
    };
  }

  // ---------- veri hazırlığı ----------
  let S = null; // türetilmiş: yıl/ay, abone satırları
  function hazirla() {
    uyariCache = null;
    const { yil, ay } = G.son_donem;
    const on = String(yil - 1);
    S = { yil, ay, onceki: yil - 1 };
    S.satirlar = G.aboneler.map((a) => {
      const c = G.m3[String(yil)][a.id] || new Array(12).fill(null);
      const p = (G.m3[on] || {})[a.id] || new Array(12).fill(null);
      const donem = topla(c, ay), onDonem = topla(p, ay);
      const yaz = c.slice(5, Math.min(ay, 9)).filter((v) => v != null), kis = c.slice(0, Math.min(ay, 3)).filter((v) => v != null);
      const yazOrt = yaz.length ? yaz.reduce((t, v) => t + v, 0) / yaz.length : null, kisOrt = kis.length ? kis.reduce((t, v) => t + v, 0) / kis.length : null;
      return { a, c, p, donem, onDonem, fark: onDonem >= 200 ? donem / onDonem - 1 : null, onYillik: topla(p, 12), yazOrt, kisOrt, son: ay ? c[ay - 1] : null };
    });
    S.pasif = S.satirlar.filter((s) => !(s.donem > 0 || s.onDonem > 0 || s.onYillik > 0)).length;   // son iki yıldır tüketimi olmayan (kapalı/sıfır) aboneler tablodan çıkarılır
    S.satirlar = S.satirlar.filter((s) => s.donem > 0 || s.onDonem > 0 || s.onYillik > 0);
    S.toplamDonem = S.satirlar.reduce((t, s) => t + s.donem, 0);
    S.toplamOnDonem = S.satirlar.reduce((t, s) => t + s.onDonem, 0);
    S.onYillik = S.satirlar.reduce((t, s) => t + s.onYillik, 0);
  }
  function adGoster(a) {
    if (adlar[a.id]) return adlar[a.id];
    if (!a.genel) return a.ad.replace(/^T\.?C\.?\s*/i, '').replace(/İZMİR (BÜYÜK ?ŞEHİR|B\.ŞEHİR|BŞEHİR) BELEDİYESİ/i, 'İzBB').trim();
    return `${a.ilce} — ${a.ic || 'abone ' + (a.no || '')} (adsız)`;
  }
  const aylikToplam = (yil) => Array.from({ length: 12 }, (_, i) => {
    const d = G.m3[String(yil)]; if (!d) return null;
    if (yil === S.yil && i >= S.ay) return null;
    return Object.values(d).reduce((t, v) => t + (v[i] || 0), 0);
  });
  const tahminYilSonu = () => (S.toplamOnDonem > 0 ? (S.toplamDonem / S.toplamOnDonem) * S.onYillik : null);
  const co2 = (m3) => (m3 * param.kg_m3) / 1000;

  // ---------- uyarılar ----------
  function uyarilariHesapla() {
    if (uyariCache) return uyariCache;
    const u = [], { yil, ay } = S;
    const g = (y) => G.m3[String(y)] || {};
    S.satirlar.forEach((s) => {
      const id = s.a.id, ad = adGoster(s.a), kayit = (tur, metin, puan, renk) => u.push({ id, ad, tur, metin, puan, renk: renk || 'text-amber-300' });
      // 1) dönem artışı
      if (s.onDonem >= 300 && s.donem - s.onDonem >= 500 && s.donem / s.onDonem - 1 >= 0.25)
        kayit('Dönem artışı', `Oca–${AY[ay - 1]} ${tr0(s.donem)} m³; geçen yıl aynı dönem ${tr0(s.onDonem)} m³ (${fark(s.fark)}).`, 30 + Math.min(60, (s.donem - s.onDonem) / 200), 'text-red-400');
      // 2) son ay sıçraması ve geçmiş yıllara göre aykırılık
      const m = ay - 1, c = s.c[m], p = s.p[m];
      let sicrama = false;
      if (c != null && p != null && c - p >= 400 && (p === 0 || c / p - 1 >= 0.5)) {
        sicrama = true;
        kayit('Son ay sıçraması', `${AY_UZUN[m]}: ${tr0(c)} m³; geçen yıl ${tr0(p)} m³.`, 35 + Math.min(50, (c - p) / 150), 'text-red-400');
      }
      if (!sicrama && c != null) {
        const gecmis = [yil - 1, yil - 2, yil - 3].map((y) => (g(y)[id] || [])[m]).filter((v) => v != null);
        if (gecmis.length >= 2) {
          const ort = gecmis.reduce((t, v) => t + v, 0) / gecmis.length, sd = Math.sqrt(gecmis.reduce((t, v) => t + (v - ort) ** 2, 0) / gecmis.length);
          if (c > ort + 2 * sd && c - ort >= 500 && c / Math.max(ort, 1) - 1 >= 0.4)
            kayit('Geçmiş yıllara göre aykırı', `${AY_UZUN[m]}: ${tr0(c)} m³; önceki yıllar ort. ${tr0(ort)} m³.`, 30 + Math.min(40, (c - ort) / 200));
        }
      }
      // 3) yaz tabanı (ısıtma dışı kullanım)
      if (s.kisOrt >= 1500 && s.yazOrt != null && s.yazOrt / s.kisOrt >= 0.35)
        kayit('Yaz tabanı yüksek', `Haz–${AY[Math.min(ay, 9) - 1]} aylık ort. ${tr0(s.yazOrt)} m³ (kış ort. ${tr0(s.kisOrt)} m³'ün %${Math.round((s.yazOrt / s.kisOrt) * 100)}'i): havuz/mutfak/sıcak su ya da kazan kaybı olabilir.`, 20 + Math.min(30, s.yazOrt / 400), 'text-sky-400');
      // 4) tüketim görünmüyor
      const son2 = [s.c[ay - 1], ay > 1 ? s.c[ay - 2] : 0], onSon2 = [s.p[ay - 1], ay > 1 ? s.p[ay - 2] : 0];
      if (s.onYillik / 12 >= 300 && son2.every((v) => !v) && onSon2.reduce((t, v) => t + (v || 0), 0) >= 400)
        kayit('Tüketim görünmüyor', `Son 2 ay 0/okuma yok; geçen yıl aynı aylar ${tr0(onSon2.reduce((t, v) => t + (v || 0), 0))} m³. Okuma gecikmesi ya da abonelik değişikliği olabilir.`, 45, 'text-orange-400');
    });
    uyariCache = u.sort((x, y) => y.puan - x.puan);
    return uyariCache;
  }

  // ---------- Özet sayfasına kayıt ----------
  function ozetKayit() {
    if (!window.Dash || !Dash.ozetKaydet || !S) return;
    const d = S.toplamOnDonem > 0 ? S.toplamDonem / S.toplamOnDonem - 1 : null, t = tahminYilSonu();
    Dash.ozetKaydet('dogalgaz', {
      kart: `<div class="grid grid-cols-2 gap-3 text-xs text-slate-500">
        <div><div class="text-[10px] uppercase tracking-wider text-slate-500">Oca–${AY[S.ay - 1]} ${S.yil}</div><div class="text-lg font-bold text-white">${tr0(S.toplamDonem / 1000)} <span class="text-xs text-slate-400">bin m³</span></div></div>
        <div><div class="text-[10px] uppercase tracking-wider text-slate-500">Geçen yıla göre</div><div class="text-lg font-bold ${renkFark(d)}">${fark(d)}</div></div>
        <div class="col-span-2"><div class="text-[10px] uppercase tracking-wider text-slate-500">Yıl sonu tahmini</div><div class="text-sm font-semibold text-slate-200">${tr0(t / 1000)} bin m³ <span class="text-xs text-slate-500">(${S.onceki}: ${tr0(S.onYillik / 1000)} bin m³)</span></div></div></div>`,
      uyarilar: uyarilariHesapla().slice(0, 6).map((x) => ({ modul: 'Doğalgaz', etiket: x.tur, metin: `${x.ad} — ${x.metin}`, renk: x.renk, href: '#dogalgaz', puan: x.puan })),
    });
  }

  // ---------- gösterge kartları ----------
  function kartlar() {
    const d = S.toplamOnDonem > 0 ? S.toplamDonem / S.toplamOnDonem - 1 : null, t = tahminYilSonu();
    const aktif = S.satirlar.filter((s) => s.donem > 0).length;
    const sirali = [...S.satirlar].sort((a, b) => b.donem - a.donem);
    const ilk5 = sirali.slice(0, 5).reduce((x, s) => x + s.donem, 0);
    const kart = (b, v, alt, renk) => `<div class="glass-card rounded-xl p-4"><div class="text-[11px] uppercase tracking-wider text-slate-400">${b}</div><div class="text-2xl font-bold mt-1 ${renk || 'text-white'}">${v}</div><div class="text-[11px] text-slate-500 mt-1">${alt}</div></div>`;
    document.getElementById('dgKartlar').innerHTML =
      kart(`Tüketim (Oca–${AY[S.ay - 1]} ${S.yil})`, `${tr0(S.toplamDonem)} <span class="text-sm font-medium text-slate-400">m³</span>`, `Geçen yıl aynı dönem ${tr0(S.toplamOnDonem)} m³ • <span class="${renkFark(d)} font-semibold">${fark(d)}</span>`) +
      kart('Yıl sonu tahmini', `${tr0(t)} <span class="text-sm font-medium text-slate-400">m³</span>`, `${S.onceki} yılı ${tr0(S.onYillik)} m³ (geçen yılın aynı dönem oranıyla)`) +
      kart('Sera gazı (dönem)', `${tr0(co2(S.toplamDonem))} <span class="text-sm font-medium text-slate-400">tCO₂e</span>`, `${param.kg_m3.toLocaleString('tr-TR')} kg/m³ (kurum raporundan geri hesaplandı)`, 'text-amber-300') +
      kart('Tüketimi olan abone', `${aktif} <span class="text-sm font-medium text-slate-400">/ ${S.satirlar.length}</span>`, `Dönemde tüketim kaydı olanlar${S.pasif ? ' • ' + S.pasif + ' pasif abone gizli' : ''}`) +
      kart('En yüksek 5 abone', `%${S.toplamDonem ? Math.round((ilk5 / S.toplamDonem) * 100) : 0}`, `Toplam tüketimin payı • ${adGoster(sirali[0].a)} ilk sırada`, 'text-emerald-400');
  }

  // ---------- grafikler ----------
  function grafikler() {
    const renk = YIL_RENK();
    cizGrafik('chDgAylik', {
      type: 'line', data: { labels: AY, datasets: G.yillar.filter((y) => y >= S.yil - 3).map((y) => ({ label: String(y), data: aylikToplam(y), borderColor: renk[y] || '#94a3b8', backgroundColor: renk[y] || '#94a3b8', borderWidth: y === S.yil ? 3 : 2, tension: 0.3, pointRadius: y === S.yil ? 3 : 0, spanGaps: false })) },
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${tr0(c.parsed.y)} m³` } } }, scales: { y: { ticks: { callback: (v) => (v / 1000).toLocaleString('tr-TR') + ' bin' } } } },
    });
    const ilk = [...S.satirlar].sort((a, b) => b.donem - a.donem).slice(0, 10);
    cizGrafik('chDgTop', {
      type: 'bar', data: { labels: ilk.map((s) => { const a = adGoster(s.a); return a.length > 30 ? a.slice(0, 29) + '…' : a; }), datasets: [
        { label: `${S.onceki} aynı dönem`, data: ilk.map((s) => s.onDonem), backgroundColor: '#64748b', borderRadius: 3 },
        { label: `${S.yil}`, data: ilk.map((s) => s.donem), backgroundColor: TV(), borderRadius: 3 }] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${tr0(c.parsed.x)} m³` } } }, scales: { x: { ticks: { callback: (v) => (v / 1000).toLocaleString('tr-TR') + ' bin' } } } },
    });
    const ilce = {};
    S.satirlar.forEach((s) => { ilce[s.a.ilce || '—'] = (ilce[s.a.ilce || '—'] || 0) + s.donem; });
    const il = Object.entries(ilce).sort((a, b) => b[1] - a[1]).slice(0, 12);
    cizGrafik('chDgIlce', {
      type: 'bar', data: { labels: il.map((x) => x[0]), datasets: [{ label: 'm³', data: il.map((x) => x[1]), backgroundColor: '#3f8fd2', borderRadius: 3 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${tr0(c.parsed.y)} m³` } } }, scales: { y: { ticks: { callback: (v) => (v / 1000).toLocaleString('tr-TR') + ' bin' } } } },
    });
  }

  // ---------- uyarı listesi ----------
  function uyariListesi() {
    const u = uyarilariHesapla();
    document.getElementById('dgUyari').innerHTML = u.length ? u.slice(0, 15).map((x) => `
      <button onclick="Dogalgaz.git('${x.id}')" class="w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-800/70 transition">
        <span class="text-[11px] font-semibold ${x.renk} whitespace-nowrap mt-0.5 w-40 shrink-0">${esc(x.tur)}</span>
        <span class="min-w-0"><span class="text-sm text-slate-100">${esc(x.ad)}</span><span class="block text-[11px] text-slate-500">${esc(x.metin)}</span></span>
      </button>`).join('') + (u.length > 15 ? `<p class="text-[11px] text-slate-500 px-3 pt-2">+${u.length - 15} uyarı daha (abone tablosunda ilgili satırlar işaretli).</p>` : '')
      : '<p class="text-sm text-slate-500 px-3 py-6 text-center">Uyarı yok.</p>';
  }

  // ---------- abone tablosu ----------
  const KOLON = [
    ['ad', 'Abone', (s) => adGoster(s.a).toLowerCase(), 'l'], ['ilce', 'İlçe', (s) => s.a.ilce, 'l'],
    ['donem', () => `Oca–${AY[S.ay - 1]} ${S.yil} (m³)`, (s) => s.donem, 'r'], ['onDonem', () => `${S.onceki} aynı dönem`, (s) => s.onDonem, 'r'],
    ['fark', 'Değişim', (s) => (s.fark == null ? -99 : s.fark), 'r'], ['onYillik', () => `${S.onceki} yıllık`, (s) => s.onYillik, 'r'],
    ['pay', 'Pay', (s) => s.donem, 'r'], ['yaz', 'Yaz tabanı (aylık ort.)', (s) => s.yazOrt || 0, 'r'], ['son', () => `${AY_UZUN[S.ay - 1]}`, (s) => s.son || 0, 'r'],
  ];
  function tablo() {
    const uyarili = new Set(uyarilariHesapla().map((x) => x.id));
    const kol = KOLON.find((k) => k[0] === sirala.k) || KOLON[2];
    let satir = S.satirlar.filter((s) => !ara || (adGoster(s.a) + ' ' + s.a.ilce).toLowerCase().includes(ara));
    satir = [...satir].sort((a, b) => { const x = kol[2](a), y = kol[2](b); const k = typeof x === 'string' ? x.localeCompare(y, 'tr') : x - y; return sirala.ters ? -k : k; });
    const b = (k) => (typeof k[1] === 'function' ? k[1]() : k[1]);
    document.getElementById('dgTablo').innerHTML = `<thead class="text-[11px] uppercase tracking-wider text-slate-400"><tr>${KOLON.map((k) => `<th onclick="Dogalgaz.sirala('${k[0]}')" class="px-3 py-3 ${k[3] === 'r' ? 'text-right' : 'text-left'} whitespace-nowrap cursor-pointer select-none">${esc(b(k))}${sirala.k === k[0] ? (sirala.ters ? ' ▼' : ' ▲') : ''}</th>`).join('')}</tr></thead>
      <tbody class="divide-y divide-slate-800/70">${satir.map((s) => `<tr id="dg-${s.a.id}" class="hover:bg-slate-800/40">
        <td class="px-3 py-2 text-slate-100">${uyarili.has(s.a.id) ? '<span class="text-amber-400" title="Uyarı var">▲</span> ' : ''}<button onclick="Dogalgaz.adla('${s.a.id}')" class="hover:underline text-left" title="Adı değiştirmek için tıklayın">${esc(adGoster(s.a))}</button>${adlar[s.a.id] ? '' : s.a.genel ? ' <span class="text-[10px] text-slate-500">(ad ver)</span>' : ''}</td>
        <td class="px-3 py-2 text-slate-400">${esc(s.a.ilce)}</td>
        <td class="px-3 py-2 text-right font-mono">${tr0(s.donem)}</td><td class="px-3 py-2 text-right font-mono text-slate-400">${tr0(s.onDonem)}</td>
        <td class="px-3 py-2 text-right font-mono ${renkFark(s.fark)}">${fark(s.fark)}</td><td class="px-3 py-2 text-right font-mono text-slate-400">${tr0(s.onYillik)}</td>
        <td class="px-3 py-2 text-right font-mono text-slate-400">${S.toplamDonem ? (s.donem / S.toplamDonem * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + '%' : '—'}</td>
        <td class="px-3 py-2 text-right font-mono text-slate-400">${tr0(s.yazOrt)}</td><td class="px-3 py-2 text-right font-mono">${tr0(s.son)}</td></tr>`).join('')}</tbody>`;
  }

  function csvIndir() {
    const basl = ['Abone', 'İlçe', `Oca-${AY[S.ay - 1]} ${S.yil} m3`, `${S.onceki} aynı dönem m3`, 'Değişim', `${S.onceki} yıllık m3`, `${AY_UZUN[S.ay - 1]} m3`];
    const sat = S.satirlar.map((s) => [adGoster(s.a), s.a.ilce, Math.round(s.donem), Math.round(s.onDonem), s.fark == null ? '' : s.fark.toFixed(4).replace('.', ','), Math.round(s.onYillik), s.son == null ? '' : Math.round(s.son)]);
    const metin = '﻿' + [basl, ...sat].map((r) => r.map((v) => (typeof v === 'number' ? String(v) : '"' + String(v).replace(/"/g, '""') + '"')).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([metin], { type: 'text/csv;charset=utf-8' }));
    a.download = `dogalgaz_aboneler_${S.yil}_${String(S.ay).padStart(2, '0')}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
  }

  function iskelet() {
    document.getElementById('dgIcerik').innerHTML = `
      <p class="text-xs text-slate-400 mb-3">Kurumsal doğalgaz aboneleri (m³). Kaynak: İklim Değişikliği ve Sıfır Atık Dairesi Başkanlığı doğalgaz tüketim çizelgesi • veri dönemi ${AY_UZUN[S.ay - 1]} ${S.yil}. Adres, hesap no ve TL tutarları panelde tutulmaz.</p>
      <div id="dgKartlar" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-6"></div>
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div class="glass-card rounded-xl p-4 lg:col-span-2"><h3 class="text-sm font-semibold text-white mb-3">Aylık toplam tüketim (m³)</h3><div class="h-72"><canvas id="chDgAylik"></canvas></div></div>
        <div class="glass-card rounded-xl p-4"><h3 class="text-sm font-semibold text-white mb-3 flex items-center gap-2"><i data-lucide="alert-triangle" class="w-4 h-4 text-amber-400"></i> Dikkat gerektirenler</h3><div id="dgUyari" class="max-h-72 overflow-y-auto -mx-1"></div></div>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div class="glass-card rounded-xl p-4"><h3 class="text-sm font-semibold text-white mb-3">En yüksek 10 abone (dönem)</h3><div class="h-80"><canvas id="chDgTop"></canvas></div></div>
        <div class="glass-card rounded-xl p-4"><h3 class="text-sm font-semibold text-white mb-3">İlçelere göre (dönem)</h3><div class="h-80"><canvas id="chDgIlce"></canvas></div></div>
      </div>
      <div class="glass-card rounded-xl overflow-hidden">
        <div class="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-800">
          <h3 class="text-sm font-semibold text-white">Abone tablosu</h3>
          <div class="flex items-center gap-2"><input id="dgAra" oninput="Dogalgaz.ara(this.value)" placeholder="Abone/ilçe ara..." class="px-3 py-1.5 rounded-lg text-xs bg-slate-900 border border-slate-700 text-slate-200 w-44" />
            <button onclick="Dogalgaz.csv()" class="px-3 py-1.5 rounded-lg text-xs border border-slate-700 text-slate-300 hover:text-white flex items-center gap-1.5"><i data-lucide="download" class="w-3.5 h-3.5"></i> CSV</button></div>
        </div>
        <div class="overflow-x-auto"><table id="dgTablo" class="w-full text-xs"></table></div>
      </div>
      <details class="glass-card rounded-xl p-4 mt-6 text-xs text-slate-400" id="dgParam"><summary class="cursor-pointer text-slate-200 font-semibold">Parametreler ve notlar</summary>
        <div class="mt-3 space-y-2"><label>Emisyon faktörü (kg CO₂e / m³) <input id="dgFaktor" type="number" step="0.001" value="${param.kg_m3}" onchange="Dogalgaz.faktor(this.value)" class="ml-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 w-24 text-slate-100" /></label>
        <p>Varsayılan 1,994: 2026 ilk 6 ay kurum raporundaki doğalgaz emisyonu (1.970 tCO₂e) ÷ tüketim (987.899 m³). ETKB resmî tablosuyla doğrulanmalıdır.</p>
        <p>Uyarı kuralları: dönem artışı (≥%25 ve ≥500 m³), son ay sıçraması (≥%50 ve ≥400 m³), geçmiş yıllara göre aykırı ay (ort.+2σ), yaz tabanı (kış ortalamasının ≥%35'i), tüketim görünmüyor. Eşikler tipik değerlerdir.</p>
        ${(G.veri_notlari || []).length ? `<p class="text-amber-300">Veri notları: ${G.veri_notlari.map(esc).join(' • ')}</p>` : ''}</div></details>`;
  }

  function ciz() { iskelet(); kartlar(); grafikler(); uyariListesi(); tablo(); if (window.lucide) lucide.createIcons(); cizildi = true; }

  window.Dogalgaz = {
    async ac() {
      if (!yuklendi) await yukle();
      if (!yuklendi) { if (sifreli) girisFormu(); return; }
      if (!cizildi) ciz();
      setTimeout(() => Object.values(grafik).forEach((g) => g && g.resize()), 50);
    },
    sirala(k) { sirala = { k, ters: sirala.k === k ? !sirala.ters : k !== 'ad' && k !== 'ilce' }; tablo(); },
    ara(v) { ara = String(v || '').toLowerCase(); tablo(); },
    csv: csvIndir,
    adla(id) {
      const s = S.satirlar.find((x) => x.a.id === id); if (!s) return;
      const yeni = prompt('Bu abone için görünen ad (boş bırakırsanız sıfırlanır):', adGoster(s.a));
      if (yeni === null) return;
      if (yeni.trim()) adlar[id] = yeni.trim(); else delete adlar[id];
      yaz(AD_ANAHTAR, adlar); uyariCache = null; ciz(); ozetKayit();
    },
    git(id) { const el = document.getElementById('dg-' + id); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('bg-amber-500/15'); setTimeout(() => el.classList.remove('bg-amber-500/15'), 2500); } },
    faktor(v) { const n = parseFloat(String(v).replace(',', '.')); if (n > 0) { param.kg_m3 = n; yaz(PARAM_ANAHTAR, param); kartlar(); } },
    // başka modüller (Karbon vb.) için
    kgM3: () => param.kg_m3,
  };
  if ((location.hash || '').slice(1) === 'dogalgaz') window.Dogalgaz.ac(); else yukle();
})();
