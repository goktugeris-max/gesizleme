/* Karbon & İklim modülü: kurumsal sera gazı envanteri + yerel iklim eylem planı (SECAP) altlığı.
 *
 * Veri:
 *  - GES üretimi: data/performans.json (herkese açık) → kaçınılan emisyon, giriş gerekmez
 *  - Elektrik (bina/tesis, kamu aydınlatması): data/elektrik.enc.json (şifreli)
 *  - Doğalgaz, motorin (ISO 50001 tesisleri): data/iso50001.enc.json (şifreli)
 * Envanter Kapsam 1+2 kurumsal (belediyenin kendi faaliyetleri) ve KISMİ kapsamlıdır: doğalgaz/motorin yalnızca ISO tesislerini içerir.
 * Düzenlenebilir parametre ve tablolar yalnızca tarayıcının localStorage'ında tutulur (paylaşılmaz); JSON/CSV ile dışa aktarılır.
 * Dash.veri() (dashboard.js) ve esc() (index.html) kullanılır.
 */
(function () {
  const AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const ANAHTAR = 'karbon_v1';
  // Varsayılanlar: elektrik 0,479 ekibin Excel'indeki değer; diğerleri IPCC tabanlı varsayımdır → resmî (ETKB/TÜİK) değerlerle değiştirin.
  const VARSAYILAN = {
    ef_elek: 0.479,      // kg CO2 / kWh (şebeke ortalaması)
    ef_elek_yil: {},     // yıla özel şebeke faktörü (boşsa ef_elek)
    dg_kwh_sm3: 9.78,    // doğalgaz enerji içeriği, kWh / Sm³ (Sürdürülebilirlik Raporu 2025: 52.751 GJ / 1.498.618 Nm³ = 35,2 MJ/Nm³)
    ef_dg: 0.204,        // kg CO2 / kWh doğalgaz (9,78 × 0,204 ≈ 1,994 kg/m³: kurum emisyon raporundan geri hesaplandı)
    ef_motorin: 2.69,    // kg CO2 / litre (kurum emisyon raporundan geri hesaplandı)
    baz_yil: 2023, hedef_yil: 2030, hedef_yuzde: 40, hedef_2050: 80,   // İzmir SECAP: 2030 −%40, 2050 −%80 (2018 baz yılına göre; burada kurumsal baz yıl farklıdır)
  };
  const KONTROL = [
    ['Belediye binaları ve tesisleri: elektrik (tüm abone grupları)', 'Elektrik dağıtım şirketi / faturalar', 'Elektrik sekmesinden geliyor'],
    ['Kamu aydınlatması: elektrik', 'Elektrik dağıtım şirketi / Aydınlatma birimi', 'Elektrik sekmesinden geliyor'],
    ['Belediye binaları: doğalgaz (tüm binalar)', 'Doğalgaz dağıtım şirketi / faturalar', 'Yalnızca 3 ISO tesisi var'],
    ['Belediye araç filosu: yakıt (motorin, benzin, LPG, elektrik)', 'Araç/Ulaşım birimi, yakıt faturaları', 'Yalnızca ISO tesislerindeki motorin var'],
    ['Toplu taşıma: yakıt ve elektrik (otobüs, metro, tramvay, vapur)', 'Ulaşım iştirakleri', 'Yok'],
    ['İştirakler ve bağlı kuruluşlar (su, atık, ulaşım) enerji tüketimi', 'İlgili kuruluşlar', 'Yok'],
    ['Şehir geneli: konut, hizmet, sanayi elektrik tüketimi', 'Dağıtım şirketi / EPDK / TÜİK', 'Yok'],
    ['Şehir geneli: doğalgaz tüketimi (sektör bazlı)', 'Doğalgaz dağıtım şirketi', 'Yok'],
    ['Şehir geneli: karayolu ulaşımı (araç sayısı, mesafe, yakıt)', 'Karayolları / Emniyet / TÜİK', 'Yok'],
    ['Atık: depolama ve arıtma (metan, atıksu)', 'Çevre koruma ve atık birimleri', 'Yok'],
    ['Yenilenebilir üretim (GES, RES, biyogaz)', 'Enerji ekibi', 'GES var (21 santral)'],
    ['Nüfus (yıllık)', 'TÜİK', 'Yok'],
    ['Resmî şebeke emisyon faktörü ve yakıt faktörleri', 'ETKB / Çevre, Şehircilik ve İklim Değişikliği Bakanlığı', 'Elektrik 0,479 (ekip Excel'i; kurum emisyon raporu 0,469 kullanmış); doğalgaz/motorin kurum raporlarından geri hesaplandı'],
  ];
  const EYLEM_KONULARI = ['Bina yalıtımı', 'Isıtma-soğutma verimliliği / ısı pompası', 'LED ve aydınlatma otomasyonu', 'Bina otomasyonu / enerji izleme',
    'Çatı GES ve yenilenebilir', 'Elektrikli araç ve şarj altyapısı', 'Toplu taşıma ve bisiklet', 'Atık ve metan yönetimi', 'Su ve atıksu verimliliği', 'Yeşil alan ve ısı adası azaltımı'];
  // İzmir SECAP (2025-2050) uyum bölümündeki 4 ana tehlike + ek olarak bu ekibin izlediği 3 tehlike
  const TEHLIKELER = ['Sıcaklık artışı ve kuraklık', 'Ani yağış, sel ve taşkın', 'Orman yangınları', 'Sağlıklı bitki örtüsü kaybı (NDVI)',
    'Kentsel ısı adası (ek)', 'Deniz seviyesi yükselmesi / kıyı taşkını (ek)', 'Fırtına / şiddetli rüzgâr (ek)'];
  // Enerji ekibinin doğrudan ilgilendiği SECAP azaltım eylemleri (kod listesi katalogda vurgulanır)
  const ILGILI_KODLAR = ['B1.6', 'SECAP B2', 'SECAP B1 – B3', 'ES1.5', 'ES1.7', 'ES1.12', 'SECAP ES1.14', 'ES1.1', 'ES1.4', 'B1.5', 'SECAP B5', 'T1.5'];

  let P = null, E = null, I = null, S = null, KONUM = null, sifrelE = null, sifrelI = null, girisHatasi = '', ilk = true, katalogTur = 'azaltim', katalogSektor = 'hepsi', sadeceIlgili = true;
  const grafik = {};

  const esc2 = (s) => (typeof esc === 'function' ? esc(s) : String(s ?? ''));
  const tr0 = (n) => (n == null || isNaN(n) ? '—' : Math.round(n).toLocaleString('tr-TR'));
  const tr1 = (n) => (n == null || isNaN(n) ? '—' : n.toLocaleString('tr-TR', { maximumFractionDigits: 1, minimumFractionDigits: 1 }));
  const topla = (a) => (a || []).reduce((t, v) => t + (v || 0), 0);
  const b64 = (t) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
  const oturum = (k, v) => { try { return v === undefined ? sessionStorage.getItem(k) : (v === null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v)); } catch (e) { return null; } };
  const kaydetKey = (ad) => ANAHTAR + '_' + ad;
  const oku = (ad, varsayilan) => { try { const v = localStorage.getItem(kaydetKey(ad)); return v ? JSON.parse(v) : varsayilan; } catch (e) { return varsayilan; } };
  const yaz = (ad, v) => { try { localStorage.setItem(kaydetKey(ad), JSON.stringify(v)); } catch (e) { /* özel pencere */ } };

  const prm = () => Object.assign({}, VARSAYILAN, oku('param', {}));
  const efElek = (y) => { const p = prm(); const o = parseFloat((p.ef_elek_yil || {})[y]); return isNaN(o) ? p.ef_elek : o; };

  // ---------- şifre çözme (Elektrik ve ISO ile aynı oturum parolası) ----------
  async function coz(sifreli, parola) {
    const malzeme = await crypto.subtle.importKey('raw', new TextEncoder().encode(parola), 'PBKDF2', false, ['deriveKey']);
    const anahtar = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64(sifreli.salt), iterations: sifreli.iter, hash: 'SHA-256' }, malzeme, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(sifreli.iv) }, anahtar, b64(sifreli.data))));
  }
  async function getir(yol) { const r = await fetch(yol + '?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) throw new Error(r.status); return r.json(); }
  async function parolaDene(p) {
    try {
      if (!sifrelE) sifrelE = await getir('data/elektrik.enc.json');
      E = await coz(sifrelE, p);
      try { if (!sifrelI) sifrelI = await getir('data/iso50001.enc.json'); I = await coz(sifrelI, p); } catch (e) { I = null; }
      return true;
    } catch (e) { E = null; return false; }
  }

  // ---------- hesaplar ----------
  function gesKacinilan() {
    const v = window.Dash && Dash.veri();
    if (!v || !v.PERF) return null;
    const yil = {};
    v.PERF.santraller.forEach((s) => Object.entries(s.yillik || {}).forEach(([y, k]) => { yil[y] = (yil[y] || 0) + (k || 0); }));
    return { kwh: yil, son: v.PERF.son_donem, kw: v.PERF.santraller.reduce((t, s) => t + (s.kw || 0), 0) };
  }

  function envanter() {
    if (!E) return null;
    const p = prm(), yillar = {};
    // Yıllar elektrik verisinin bulunduğu yıllarla sınırlıdır (ISO'daki daha eski yıllar yarım kalır)
    const ekle = (y) => (yillar[y] = yillar[y] || { elek: 0, aydinlatma: 0, dg_sm3: 0, motorin_l: 0, elek_ay: 0 });
    const gecerli = (y) => Object.prototype.hasOwnProperty.call(E.aylik, y);
    Object.keys(E.aylik).forEach((y) => {
      const a = E.aylik[y], g = (E.genel_aydinlatma || {})[y] || [], r = ekle(y);
      for (let i = 0; i < 12; i++) {
        if (a.faturali[i] != null && a.faturali[i] > 0) { r.elek += a.faturali[i] - (a.mustecir[i] || 0); r.elek_ay++; }
        if (g[i] != null) r.aydinlatma += g[i];
      }
    });
    if (I) {
      I.seriler.filter((s) => s.birim === 'Sm³').forEach((s) => Object.entries(s.yillar).forEach(([y, v]) => { if (gecerli(y)) ekle(y).dg_sm3 += topla(v.takip); }));
      Object.values((I.ek && I.ek.motorin) || {}).forEach((t) => Object.entries(t).forEach(([y, l]) => { if (gecerli(y)) ekle(y).motorin_l += l || 0; }));
    }
    Object.entries(yillar).forEach(([y, r]) => {
      const ee = efElek(y);
      r.t_elek = (r.elek * ee) / 1000;                       // ton
      r.t_aydinlatma = (r.aydinlatma * ee) / 1000;
      r.t_dg = (r.dg_sm3 * p.dg_kwh_sm3 * p.ef_dg) / 1000;
      r.t_motorin = (r.motorin_l * p.ef_motorin) / 1000;
      r.t_toplam = r.t_elek + r.t_aydinlatma + r.t_dg + r.t_motorin;
      r.mwh_dg = (r.dg_sm3 * p.dg_kwh_sm3) / 1000;
    });
    return yillar;
  }

  const tamYil = (y, env) => env[y] && env[y].elek_ay === 12;

  // ---------- görünüm yardımcıları ----------
  const kart = (b, d, alt, renk) => `<div class="glass-card rounded-xl p-4"><div class="text-[11px] uppercase tracking-wider text-slate-400">${b}</div><div class="text-2xl font-bold mt-1 ${renk || 'text-white'}">${d}</div><div class="text-[11px] text-slate-500 mt-1">${alt}</div></div>`;
  const acikK = new Set(['env']);   // açık bölümler yeniden çizimlerde korunur
  const bolum = (k, baslik, aciklama, govde) => `<details data-k="${k}" ${acikK.has(k) ? 'open' : ''} class="group glass-card rounded-xl overflow-hidden">
    <summary class="cursor-pointer select-none p-4 flex flex-wrap items-center gap-x-3 gap-y-1 hover:bg-slate-800/40" style="list-style:none">
      <span class="text-slate-400 inline-block transition-transform group-open:rotate-90">▸</span>
      <h2 class="text-sm font-semibold text-white">${baslik}</h2><span class="text-[11px] text-slate-500">${aciklama || ''}</span>
    </summary><div class="border-t border-slate-800 p-4">${govde}</div></details>`;
  const girdi = 'bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-200 w-full';

  function cizGrafik(id, yapi) {
    if (grafik[id]) grafik[id].destroy();
    const el = document.getElementById(id);
    if (el && window.Chart) grafik[id] = new Chart(el, yapi);
  }

  function indir(ad, icerik, tur) {
    const bl = new Blob([icerik], { type: tur || 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(bl); a.download = ad; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  const csv = (satirlar) => '﻿' + satirlar.map((r) => r.map((h) => { const s = String(h ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';')).join('\n');

  // ---------- bölümler ----------
  function parametreBolumu() {
    const p = prm();
    const yillar = [2023, 2024, 2025, 2026];
    const alan = (ad, baslik, birim, adim) => `<label class="block"><span class="text-[11px] text-slate-400">${baslik} <span class="text-slate-600">(${birim})</span></span>
      <input type="number" step="${adim}" value="${p[ad]}" onchange="Karbon.param('${ad}', this.value)" class="${girdi} mt-1"></label>`;
    return `<div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
      ${alan('ef_elek', 'Şebeke elektriği', 'kg CO₂/kWh', 0.001)}${alan('ef_dg', 'Doğalgaz', 'kg CO₂/kWh', 0.001)}
      ${alan('dg_kwh_sm3', 'Doğalgaz enerji içeriği', 'kWh/Sm³', 0.1)}${alan('ef_motorin', 'Motorin', 'kg CO₂/litre', 0.01)}</div>
      <div class="mt-3"><div class="text-[11px] text-slate-400 mb-1">Yıla özel şebeke faktörü (boşsa yukarıdaki değer kullanılır)</div>
      <div class="grid grid-cols-4 gap-2">${yillar.map((y) => `<label><span class="text-[10px] text-slate-500">${y}</span><input type="number" step="0.001" placeholder="${p.ef_elek}" value="${(p.ef_elek_yil || {})[y] ?? ''}" onchange="Karbon.paramYil(${y}, this.value)" class="${girdi}"></label>`).join('')}</div></div>
      <p class="text-[11px] text-slate-500 mt-3">Elektrik için 0,479 ekibin Excel dosyasındaki değerdir. Doğalgaz ve motorin değerleri IPCC tabanlı varsayımdır; <b class="text-slate-300">resmî (ETKB / Bakanlık) değerlerle değiştirin</b>. Değişiklikler yalnızca bu tarayıcıda saklanır.</p>`;
  }

  function hedefBolumu(env) {
    const p = prm();
    const tam = Object.keys(env).filter((y) => tamYil(y, env)).map(Number).sort();
    const baz = env[p.baz_yil] && tamYil(p.baz_yil, env) ? env[p.baz_yil].t_toplam : null;
    const hedefDeger = baz != null ? baz * (1 - p.hedef_yuzde / 100) : null;
    const secenek = tam.map((y) => `<option value="${y}" ${y === Number(p.baz_yil) ? 'selected' : ''}>${y}</option>`).join('');
    return `<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl">
      <label><span class="text-[11px] text-slate-400">Baz yıl (tam yıl)</span><select onchange="Karbon.param('baz_yil', this.value)" class="${girdi} mt-1">${secenek}</select></label>
      <label><span class="text-[11px] text-slate-400">Hedef yılı</span><input type="number" value="${p.hedef_yil}" onchange="Karbon.param('hedef_yil', this.value)" class="${girdi} mt-1"></label>
      <label><span class="text-[11px] text-slate-400">Azaltım hedefi (%)</span><input type="number" value="${p.hedef_yuzde}" onchange="Karbon.param('hedef_yuzde', this.value)" class="${girdi} mt-1"></label>
      <label><span class="text-[11px] text-slate-400">2050 hedefi (%)</span><input type="number" value="${p.hedef_2050}" onchange="Karbon.param('hedef_2050', this.value)" class="${girdi} mt-1"></label></div>
      <p class="text-[11px] text-slate-500 mt-2">${baz != null ? `Baz yıl emisyonu <b class="text-slate-300">${tr0(baz)} tCO₂e</b> → ${p.hedef_yil} hedefi <b class="text-slate-300">${tr0(hedefDeger)} tCO₂e</b>.` : 'Baz yıl için tam yıl verisi yok.'} İzmir SECAP (2025–2050) kent geneli hedefi 2018 baz yılına göre 2030'da −%40, 2050'de −%80 (iklim nötr perspektifi); buradaki kurumsal takip <b class="text-slate-300">farklı bir baz yıla</b> (ilk tam yıl) göre işler, kurumsal 2018 verisi eklenirse SECAP bazıyla birebir karşılaştırılabilir.</p>
      <div class="h-64 mt-3"><canvas id="chKarbonHedef"></canvas></div>`;
  }

  function envanterTablosu(env, ges) {
    const p = prm();
    const yillar = Object.keys(env).sort();
    const sat = (b, f, birim) => `<tr class="border-t border-slate-800/70"><td class="px-3 py-2 text-slate-300">${b}${birim ? ` <span class="text-slate-600">${birim}</span>` : ''}</td>${yillar.map((y) => `<td class="px-3 py-2 text-right font-mono">${f(env[y], y)}</td>`).join('')}</tr>`;
    return `<div class="overflow-x-auto"><table class="w-full text-xs"><thead><tr class="text-slate-400"><th class="px-3 py-2 text-left">Kalem</th>${yillar.map((y) => `<th class="px-3 py-2 text-right">${y}${tamYil(y, env) ? '' : ' <span class="text-amber-400" title="kısmi yıl">*</span>'}</th>`).join('')}</tr></thead><tbody>
      ${sat('Bina ve tesis elektriği', (r) => tr0(r.t_elek), 'tCO₂e')}${sat('Kamu aydınlatması', (r) => tr0(r.t_aydinlatma), 'tCO₂e')}
      ${sat('Doğalgaz (ISO tesisleri)', (r) => (r.dg_sm3 ? tr0(r.t_dg) : '—'), 'tCO₂e')}${sat('Motorin (ISO tesisleri)', (r) => (r.motorin_l ? tr0(r.t_motorin) : '—'), 'tCO₂e')}
      <tr class="border-t-2 border-slate-700 font-semibold text-white"><td class="px-3 py-2">Toplam</td>${yillar.map((y) => `<td class="px-3 py-2 text-right font-mono">${tr0(env[y].t_toplam)}</td>`).join('')}</tr>
      ${sat('Şebeke faktörü', (r, y) => tr1(efElek(y) * 1000).replace(',0', '') + ' g/kWh')}
      ${ges ? sat('GES ile kaçınılan emisyon', (r, y) => (ges.kwh[y] ? tr0((ges.kwh[y] * efElek(y)) / 1000) : '—'), 'tCO₂e') : ''}</tbody></table></div>
      <p class="text-[11px] text-slate-500 mt-2"><span class="text-amber-400">*</span> Kısmi yıl: yalnızca veri girilen aylar. Envanter fatura (şebekeden çekilen) esaslıdır; GES etkisi zaten düşük çıkar, kaçınılan emisyon ayrıca gösterilir ve envanterden düşülmez. Doğalgaz ve motorin yalnızca 3 ISO tesisini kapsar; ISO tesislerinin elektriği toplam elektriğin içinde olduğundan ayrıca eklenmemiştir. Müstecir noktalara verilen elektrik hariçtir.</p>`;
  }

  // CoM envanter şablonu (sektör × enerji taşıyıcısı), MWh. Dolu olan hücreler hesaplanır, boş olanlar toplanacak veriyi gösterir.
  function becTablosu(env) {
    const yil = Math.max(0, ...Object.keys(env).filter((y) => tamYil(y, env)).map(Number));
    const r = env[yil];
    const kent = (ad) => (S && S.envanter_alt_t[ad] ? S.envanter_alt_t[ad].deger[S.yillar.length - 1] : null);
    const mwh = (v) => (v ? tr0(v) : '<span class="text-slate-600">veri gerekli</span>');
    // satır: [SECAP sektörü, kent envanteri adı (Tablo 11), elektrik MWh, doğalgaz MWh, motorin MWh, not]
    const satirlar = [
      ['Konutlar', 'Konutlar', null, null, null, 'Şehir geneli: dağıtım şirketi / TÜİK'],
      ['Ticari ve kurumsal binalar', 'Ticari ve kurumsal binalar', r ? r.elek / 1000 : null, r ? r.mwh_dg : null, r ? (r.motorin_l * 10) / 1000 : null, 'Belediye bina/tesis elektriği (tüm aboneler) • doğalgaz/motorin yalnız 3 ISO tesisi'],
      ['Kamu aydınlatması', null, r ? r.aydinlatma / 1000 : null, null, null, 'SECAP tablosunda ayrı satır yok; hangi sektörde sayıldığı teyit edilmeli'],
      ['Tarımsal sulama', 'Tarımsal sulama', null, null, null, 'Şehir geneli'],
      ['Özel ulaşım araçları', 'Özel ulaşım araçları', null, null, null, 'Şehir geneli'],
      ['Belediye hizmet araçları', 'Belediye hizmet araçları', null, null, null, 'Araç filosu yakıt kayıtları gerekli'],
      ['Toplu taşıma (halk otobüsü, İZBAN, metro-tramvay)', 'Toplu taşıma araçları (Halk Otobüsleri, İZBAN, Metro- Tramvay)', null, null, null, 'İştiraklerden gerekli'],
      ['Katı atık bertarafı', 'Katı atık bertarafı', null, null, null, 'Emisyon doğrudan hesaplanır (CH₄)'],
      ['Atık su ve deşarjı', 'Atık su ve deşarjı', null, null, null, 'Emisyon doğrudan hesaplanır'],
    ];
    return `<div class="text-[11px] text-slate-400 mb-2">Sektörler İzmir SECAP (2025–2050) envanteriyle aynıdır. Kurumsal veriler: en son tam yıl <b class="text-slate-300">${yil || '—'}</b> (MWh). Sağ sütun: kentin SECAP envanterindeki ${S ? S.yillar[S.yillar.length - 1] : ''} değeri (tCO₂e).</div>
      <div class="overflow-x-auto"><table class="w-full text-xs"><thead><tr class="text-slate-400"><th class="px-3 py-2 text-left">Sektör</th><th class="px-3 py-2 text-right">Elektrik</th><th class="px-3 py-2 text-right">Doğalgaz</th><th class="px-3 py-2 text-right">Motorin</th><th class="px-3 py-2 text-right">İzmir SECAP (t)</th><th class="px-3 py-2 text-left">Not</th></tr></thead><tbody>
      ${satirlar.map((x) => `<tr class="border-t border-slate-800/70"><td class="px-3 py-2 text-slate-300">${x[0]}</td><td class="px-3 py-2 text-right font-mono">${mwh(x[2])}</td><td class="px-3 py-2 text-right font-mono">${mwh(x[3])}</td><td class="px-3 py-2 text-right font-mono">${mwh(x[4])}</td><td class="px-3 py-2 text-right font-mono text-slate-400">${x[1] ? tr0(kent(x[1])) : '—'}</td><td class="px-3 py-2 text-slate-500">${x[5]}</td></tr>`).join('')}</tbody></table></div>
      <div class="mt-3"><button onclick="Karbon.becIndir()" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200">CSV indir</button></div>`;
  }

  // ---------- İzmir SECAP referansı (herkese açık, giriş gerekmez) ----------
  const fmt = (n) => (n == null ? '—' : Math.round(n).toLocaleString('tr-TR'));
  function secapBolumu(env) {
    if (!S) return '<p class="text-xs text-slate-500">SECAP referans verisi yüklenemedi.</p>';
    const n = S.yillar.length - 1, top = S.envanter_toplam_sanayisiz_t, baz = top[0];
    const degisim = (a) => (a[0] ? a[n] / a[0] - 1 : null);
    const altSatir = (ad, v) => `<tr class="border-t border-slate-800/70"><td class="px-3 py-1.5 text-slate-300">${ad.replace('Toplu taşıma araçları (Halk Otobüsleri, İZBAN, Metro- Tramvay)', 'Toplu taşıma (halk otobüsü, İZBAN, metro-tramvay)')} <span class="text-slate-600">${v.grup || ''}</span></td>
      <td class="px-3 py-1.5 text-right font-mono">${fmt(v.deger[0])}</td><td class="px-3 py-1.5 text-right font-mono">${fmt(v.deger[n])}</td><td class="px-3 py-1.5 text-right font-mono ${degisim(v.deger) > 0 ? 'text-red-300' : 'text-emerald-300'}">${degisim(v.deger) == null ? '—' : (degisim(v.deger) > 0 ? '+' : '') + (degisim(v.deger) * 100).toFixed(1).replace('.', ',') + '%'}</td></tr>`;
    let pay = '';
    if (env) {
      const tam = Object.keys(env).filter((y) => tamYil(y, env)).map(Number).sort().pop();
      const ticari = S.envanter_alt_t['Ticari ve kurumsal binalar'].deger[n];
      if (tam) pay = `<p class="text-[11px] text-slate-400 mt-3">Belediyenin kendi bina/tesis (kısmi) envanteri ${tam}: <b class="text-slate-200">${fmt(env[tam].t_toplam)} tCO₂e</b>; kentin SECAP envanterinde “Ticari ve kurumsal binalar” ${S.yillar[n]}: ${fmt(ticari)} tCO₂e. Kurumsal envanter bu sektörün yaklaşık <b class="text-slate-200">%${((env[tam].t_toplam / ticari) * 100).toFixed(1).replace('.', ',')}</b>'i kadardır (kapsamlar farklı olduğundan yalnızca büyüklük sırası içindir).</p>`;
    }
    return `<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        ${kart(`Kent envanteri ${S.yillar[0]} (baz yıl)`, fmt(baz) + ' <span class="text-sm font-medium text-slate-400">tCO₂e</span>', 'sanayi ve havacılık hariç')}
        ${kart(`Kent envanteri ${S.yillar[n]}`, fmt(top[n]) + ' <span class="text-sm font-medium text-slate-400">tCO₂e</span>', `baza göre ${((top[n] / baz - 1) * 100).toFixed(1).replace('.', ',')}%`, top[n] > baz ? 'text-red-300' : 'text-emerald-300')}
        ${kart('2030 hedef senaryosu', fmt(S.projeksiyon_t.hedef['2030']) + ' <span class="text-sm font-medium text-slate-400">tCO₂e</span>', `BAU ${fmt(S.projeksiyon_t.bau['2030'])} • hedef −%${S.hedef['2030_azaltim_yuzde']}`)}
        ${kart('2050 hedef senaryosu', fmt(S.projeksiyon_t.hedef['2050']) + ' <span class="text-sm font-medium text-slate-400">tCO₂e</span>', `BAU ${fmt(S.projeksiyon_t.bau['2050'])} • hedef −%${S.hedef['2050_azaltim_yuzde']}`)}</div>
      <div class="h-64 mb-4"><canvas id="chKarbonKent"></canvas></div>
      <div class="overflow-x-auto"><table class="w-full text-xs"><thead><tr class="text-slate-400"><th class="px-3 py-2 text-left">Alt sektör (sanayi ve havacılık dahil)</th><th class="px-3 py-2 text-right">${S.yillar[0]}</th><th class="px-3 py-2 text-right">${S.yillar[n]}</th><th class="px-3 py-2 text-right">Değişim</th></tr></thead><tbody>
        ${Object.entries(S.envanter_alt_t).filter(([ad]) => ad !== '__toplam').map(([ad, v]) => altSatir(ad, v)).join('')}</tbody></table></div>${pay}
      <p class="text-[11px] text-slate-500 mt-3">Kaynak: ${esc2(S.kaynak)}. Kent envanteri GPC/IPCC yöntemiyle hesaplanmıştır; elektrik faktörü ETKB “Elektriğin Birincil Enerji ve Sera Gazı Emisyon Katsayıları” belgesinden alınmıştır (rapora göre). Yayın hakları İBB'ye aittir.</p>`;
  }

  // ---------- SECAP eylem kataloğu ----------
  function katalogBolumu(ges) {
    if (!S) return '<p class="text-xs text-slate-500">SECAP eylem kataloğu yüklenemedi.</p>';
    const tur = { azaltim: 'Azaltım', uyum: 'Uyum', enerji_yoksullugu: 'Enerji yoksulluğu' };
    let liste = S.eylemler[katalogTur];
    const sektorler = [...new Set(liste.map((e) => (e.sektor || '').split(',')[0]).filter(Boolean))].sort();
    if (sadeceIlgili && katalogTur === 'azaltim') liste = liste.filter((e) => ILGILI_KODLAR.includes(e.kod));
    if (katalogSektor !== 'hepsi') liste = liste.filter((e) => (e.sektor || '').split(',')[0] === katalogSektor);
    const gesYil = ges ? Math.max(...Object.keys(ges.kwh).map(Number)) : null;
    const gesT = ges && gesYil ? (ges.kwh[gesYil] * efElek(gesYil)) / 1000 : null;
    const satir = (e) => {
      const gesNot = (e.kod === 'SECAP ES1.14' || e.kod === 'ES1.12') && gesT ? `<div class="text-[10px] text-emerald-300 mt-0.5">Belediye çatı GES'leri ${gesYil}: ${fmt(gesT)} tCO₂e kaçınılan (Oca–${AY[ges.son.ay - 1]}; yıllık hedefle karşılaştırma dönemleri farklıdır)</div>` : '';
      return `<tr class="border-t border-slate-800/70 align-top ${ILGILI_KODLAR.includes(e.kod) ? 'bg-amber-500/5' : ''}"><td class="px-3 py-2 font-mono text-[11px] text-amber-300 whitespace-nowrap">${esc2(e.kod)}</td>
        <td class="px-3 py-2 text-slate-200">${esc2(e.ad)}${gesNot}</td><td class="px-3 py-2 text-slate-400 whitespace-nowrap">${esc2((e.sektor || '').split(',')[0])}</td>
        <td class="px-3 py-2 text-right font-mono text-slate-300 whitespace-nowrap">${e.azaltim_t ? fmt(e.azaltim_t) : '<span class="text-slate-600">—</span>'}</td></tr>`;
    };
    const sec = 'bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-200';
    return `<div class="flex flex-wrap items-center gap-3 mb-3 text-xs">
        <div class="flex gap-1 bg-slate-900/80 rounded-lg p-0.5">${Object.entries(tur).map(([k, ad]) => `<button onclick="Karbon.katalog('${k}')" class="px-2.5 py-1 rounded-md font-semibold ${katalogTur === k ? 'bg-amber-500/15 text-amber-300' : 'text-slate-400 hover:text-slate-200'}">${ad} (${S.eylemler[k].length})</button>`).join('')}</div>
        <select onchange="Karbon.katalogSektor(this.value)" class="${sec}"><option value="hepsi">Tüm sektörler</option>${sektorler.map((x) => `<option ${x === katalogSektor ? 'selected' : ''}>${esc2(x)}</option>`).join('')}</select>
        ${katalogTur === 'azaltim' ? `<label class="flex items-center gap-1.5 text-slate-400"><input type="checkbox" ${sadeceIlgili ? 'checked' : ''} onchange="Karbon.ilgili(this.checked)"> yalnızca Enerji Ekibi'yle ilgili olanlar</label>` : ''}
        <span class="ml-auto text-slate-500">${liste.length} eylem</span></div>
      <div class="overflow-x-auto max-h-[28rem] overflow-y-auto"><table class="w-full text-xs"><thead class="sticky top-0 bg-slate-900"><tr class="text-slate-400"><th class="px-3 py-2 text-left">Kod</th><th class="px-3 py-2 text-left">Eylem</th><th class="px-3 py-2 text-left">Sektör</th><th class="px-3 py-2 text-right">Azaltım hedefi (tCO₂e)</th></tr></thead><tbody>${liste.map(satir).join('') || '<tr><td colspan="4" class="px-3 py-4 text-center text-slate-500">Eylem yok.</td></tr>'}</tbody></table></div>
      <p class="text-[11px] text-slate-500 mt-2">Kaynak: İzmir SECAP (2025–2050), Bölüm 7. Azaltım hedefleri SECAP'ta kent genelinde eylem başına verilen toplam değerdir (2030/2050 ufku); “—” azaltım öngörülemediği ya da belirtilmediği anlamına gelir. Eylem içerikleri (adımlar, KPI) için raporun kendisine bakın. Eylem listenizde “SECAP kodu” seçerek kendi işlerinizi bu kataloğa bağlayabilirsiniz.</p>`;
  }

  // ---------- İlçe iklim kırılganlığı (SECAP Tablo 28) ----------
  function kirilganBolumu() {
    if (!S) return '';
    const v = window.Dash && Dash.veri();
    const sayac = {};
    if (KONUM && v) v.M.forEach((m) => { const k = KONUM[m.id]; if (k && k.ilce) { const o = (sayac[k.ilce] = sayac[k.ilce] || { n: 0, kw: 0 }); o.n++; o.kw += m.kw || 0; } });
    const renk = { Yüksek: 'text-red-300', Orta: 'text-amber-300', Düşük: 'text-emerald-300' };
    const maks = Math.max(...S.kirilganlik.map((x) => x.endeks));
    const yuksekGes = S.kirilganlik.filter((x) => x.grup === 'Yüksek').reduce((t, x) => t + ((sayac[x.ilce] || {}).n || 0), 0);
    return `<h3 class="text-xs font-semibold text-white mt-6 mb-1">İlçelere göre iklim kırılganlığı (İzmir SECAP, Tablo 28)</h3>
      <p class="text-[11px] text-slate-500 mb-2">Nüfus, sel/taşkın yoğunluğu, orman yangını yoğunluğu ve bitki örtüsü (NDVI) göstergelerinden eşit ağırlıklı endeks. Belediye GES'lerinin <b class="text-slate-300">${yuksekGes}</b> tanesi “Yüksek” kırılganlıktaki ilçelerde.</p>
      <div class="overflow-x-auto max-h-80 overflow-y-auto"><table class="w-full text-xs"><thead class="sticky top-0 bg-slate-900"><tr class="text-slate-400"><th class="px-3 py-1.5 text-left">İlçe</th><th class="px-3 py-1.5 text-left">Endeks</th><th class="px-3 py-1.5 text-left">Grup</th><th class="px-3 py-1.5 text-right">Belediye GES</th></tr></thead><tbody>
      ${S.kirilganlik.map((x) => { const g = sayac[x.ilce.replace('Aliağa ', 'Aliağa').trim()] || sayac[x.ilce.trim()]; return `<tr class="border-t border-slate-800/70"><td class="px-3 py-1.5 text-slate-300">${esc2(x.ilce.trim())}</td>
        <td class="px-3 py-1.5"><div class="flex items-center gap-2"><div class="h-1.5 rounded-full bg-slate-800 w-24 overflow-hidden"><div class="h-full ${x.grup === 'Yüksek' ? 'bg-red-400' : x.grup === 'Orta' ? 'bg-amber-300' : 'bg-emerald-400'}" style="width:${(x.endeks / maks) * 100}%"></div></div><span class="font-mono text-slate-400">${x.endeks.toFixed(3).replace('.', ',')}</span></div></td>
        <td class="px-3 py-1.5 ${renk[x.grup]}">${x.grup}</td><td class="px-3 py-1.5 text-right font-mono text-slate-400">${g ? `${g.n} (${fmt(g.kw)} kW)` : '—'}</td></tr>`; }).join('')}</tbody></table></div>`;
  }

  function kontrolBolumu() {
    const durum = oku('kontrol', {});
    return `<div class="overflow-x-auto"><table class="w-full text-xs"><thead><tr class="text-slate-400"><th class="px-3 py-2 w-8"></th><th class="px-3 py-2 text-left">Veri</th><th class="px-3 py-2 text-left">Olası veri sahibi (doğrulayın)</th><th class="px-3 py-2 text-left">Şu an</th></tr></thead><tbody>
      ${KONTROL.map((k, i) => `<tr class="border-t border-slate-800/70"><td class="px-3 py-2"><input type="checkbox" ${durum[i] ? 'checked' : ''} onchange="Karbon.kontrol(${i}, this.checked)"></td><td class="px-3 py-2 text-slate-300">${k[0]}</td><td class="px-3 py-2 text-slate-400">${k[1]}</td><td class="px-3 py-2 text-slate-500">${k[2]}</td></tr>`).join('')}</tbody></table></div>
      <p class="text-[11px] text-slate-500 mt-2">İşaretli kutular toplanmış/tamamlanmış veriyi gösterir (yalnızca bu tarayıcıda saklanır).</p>`;
  }

  function eylemler() { return oku('eylem', []); }
  function eylemBolumu() {
    const l = eylemler(), p = prm();
    const hesap = (e) => ((parseFloat(e.elek) || 0) + (parseFloat(e.yen) || 0)) * efElek(new Date().getFullYear()) + (parseFloat(e.yakit) || 0) * p.ef_dg;
    const toplam = l.reduce((t, e) => t + hesap(e), 0);
    const sat = (e, i) => `<tr class="border-t border-slate-800/70 align-top">
      <td class="px-1 py-1"><input value="${esc2(e.baslik)}" onchange="Karbon.eylemDeger(${i},'baslik',this.value)" class="${girdi}" style="min-width:12rem"></td>
      <td class="px-1 py-1"><input value="${esc2(e.sektor)}" onchange="Karbon.eylemDeger(${i},'sektor',this.value)" class="${girdi}" style="min-width:7rem" list="karbonKonu"></td>
      <td class="px-1 py-1"><input value="${esc2(e.secap)}" onchange="Karbon.eylemDeger(${i},'secap',this.value)" class="${girdi}" style="min-width:6rem" list="karbonKod" placeholder="örn. B1.6"></td>
      <td class="px-1 py-1"><input value="${esc2(e.sorumlu)}" onchange="Karbon.eylemDeger(${i},'sorumlu',this.value)" class="${girdi}" style="min-width:7rem"></td>
      <td class="px-1 py-1"><input value="${esc2(e.termin)}" placeholder="2028" onchange="Karbon.eylemDeger(${i},'termin',this.value)" class="${girdi}" style="min-width:4.5rem"></td>
      <td class="px-1 py-1"><input type="number" value="${e.elek ?? ''}" onchange="Karbon.eylemDeger(${i},'elek',this.value)" class="${girdi}" style="min-width:5rem"></td>
      <td class="px-1 py-1"><input type="number" value="${e.yakit ?? ''}" onchange="Karbon.eylemDeger(${i},'yakit',this.value)" class="${girdi}" style="min-width:5rem"></td>
      <td class="px-1 py-1"><input type="number" value="${e.yen ?? ''}" onchange="Karbon.eylemDeger(${i},'yen',this.value)" class="${girdi}" style="min-width:5rem"></td>
      <td class="px-2 py-2 text-right font-mono text-emerald-300 whitespace-nowrap">${tr0(hesap(e))}</td>
      <td class="px-1 py-1"><select onchange="Karbon.eylemDeger(${i},'durum',this.value)" class="${girdi}">${['Planlanan', 'Devam', 'Tamamlandı'].map((d) => `<option ${e.durum === d ? 'selected' : ''}>${d}</option>`).join('')}</select></td>
      <td class="px-1 py-1"><button onclick="Karbon.eylemSil(${i})" class="text-rose-400 hover:text-rose-300 px-2" title="Sil">✕</button></td></tr>`;
    const kodlar = S ? ['azaltim', 'uyum', 'enerji_yoksullugu'].flatMap((t) => S.eylemler[t]).map((e) => `<option value="${esc2(e.kod)}">${esc2(e.ad).slice(0, 70)}</option>`).join('') : '';
    return `<datalist id="karbonKod">${kodlar}</datalist><datalist id="karbonKonu">${EYLEM_KONULARI.map((k) => `<option value="${k}">`).join('')}</datalist>
      <div class="overflow-x-auto"><table class="w-full text-xs"><thead><tr class="text-slate-400"><th class="px-2 py-2 text-left">Eylem</th><th class="px-2 py-2 text-left">Sektör/konu</th><th class="px-2 py-2 text-left">SECAP kodu</th><th class="px-2 py-2 text-left">Sorumlu birim</th><th class="px-2 py-2 text-left">Termin</th>
        <th class="px-2 py-2 text-left">Elektrik tasarrufu<br><span class="text-slate-600">MWh/yıl</span></th><th class="px-2 py-2 text-left">Doğalgaz tasarrufu<br><span class="text-slate-600">MWh/yıl</span></th><th class="px-2 py-2 text-left">Yenilenebilir üretim<br><span class="text-slate-600">MWh/yıl</span></th>
        <th class="px-2 py-2 text-right">CO₂ azaltımı<br><span class="text-slate-600">t/yıl</span></th><th class="px-2 py-2 text-left">Durum</th><th></th></tr></thead><tbody>${l.map(sat).join('') || '<tr><td colspan="11" class="px-3 py-4 text-center text-slate-500">Henüz eylem yok. Önerilen başlıklardan ekleyin.</td></tr>'}</tbody></table></div>
      <div class="flex flex-wrap items-center gap-2 mt-3">
        <button onclick="Karbon.eylemEkle()" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30">+ Eylem ekle</button>
        <button onclick="Karbon.eylemOneri()" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200">Önerilen başlıkları ekle</button>
        <button onclick="Karbon.eylemIndir()" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200">CSV indir</button>
        <span class="ml-auto text-xs text-slate-400">Toplam azaltım: <b class="text-emerald-300">${tr0(toplam)} tCO₂/yıl</b></span></div>
      <p class="text-[11px] text-slate-500 mt-2">CO₂ azaltımı (SECAP kodu seçilirse eylem o koda bağlanır) = (elektrik tasarrufu + yenilenebilir üretim) × şebeke faktörü + doğalgaz tasarrufu × doğalgaz faktörü. Yatırım tutarı bilerek yer almaz (site herkese açık, bu alanlar yalnızca tarayıcınızda saklanır).</p>`;
  }

  function rvaBolumu() {
    let l = oku('rva', null);
    if (!l) l = TEHLIKELER.map((t) => ({ tehlike: t, olasilik: 3, etki: 3, sektor: '', onlem: '' }));
    const renk = (s) => (s >= 15 ? 'text-red-400' : s >= 9 ? 'text-amber-300' : 'text-emerald-400');
    return `<div class="overflow-x-auto"><table class="w-full text-xs"><thead><tr class="text-slate-400"><th class="px-2 py-2 text-left">Tehlike</th><th class="px-2 py-2">Olasılık (1-5)</th><th class="px-2 py-2">Etki (1-5)</th><th class="px-2 py-2">Risk</th><th class="px-2 py-2 text-left">Etkilenen sektörler / bölgeler</th><th class="px-2 py-2 text-left">Mevcut veya planlanan uyum eylemi</th></tr></thead><tbody>
      ${l.map((t, i) => `<tr class="border-t border-slate-800/70 align-top"><td class="px-2 py-2 text-slate-300" style="min-width:11rem">${esc2(t.tehlike)}</td>
        <td class="px-2 py-1"><input type="number" min="1" max="5" value="${t.olasilik}" onchange="Karbon.rva(${i},'olasilik',this.value)" class="${girdi}" style="width:4rem"></td>
        <td class="px-2 py-1"><input type="number" min="1" max="5" value="${t.etki}" onchange="Karbon.rva(${i},'etki',this.value)" class="${girdi}" style="width:4rem"></td>
        <td class="px-2 py-2 text-center font-mono font-semibold ${renk(t.olasilik * t.etki)}">${t.olasilik * t.etki}</td>
        <td class="px-2 py-1"><input value="${esc2(t.sektor)}" onchange="Karbon.rva(${i},'sektor',this.value)" class="${girdi}" style="min-width:11rem"></td>
        <td class="px-2 py-1"><input value="${esc2(t.onlem)}" onchange="Karbon.rva(${i},'onlem',this.value)" class="${girdi}" style="min-width:14rem"></td></tr>`).join('')}</tbody></table></div>
      <div class="mt-3"><button onclick="Karbon.rvaIndir()" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200">CSV indir</button></div>
      ${kirilganBolumu()}
      <p class="text-[11px] text-slate-500 mt-2">Risk = olasılık × etki (≥15 yüksek, ≥9 orta). İlk 4 tehlike İzmir SECAP uyum bölümüyle aynıdır. Bu liste bir başlangıç taslağıdır; yerel risk ve kırılganlık değerlendirmesi için ilçe/sektör bazlı veriyle ve ilgili birimlerle (afet, orman, su, planlama) tamamlanmalıdır.</p>`;
  }

  function girisFormu() {
    return `<form id="karbonGiris" class="max-w-sm mx-auto my-6 bg-slate-800/60 border border-slate-700 rounded-xl p-5 space-y-3">
      <div class="flex items-center gap-2 text-amber-300 font-semibold"><i data-lucide="lock" class="w-4 h-4"></i> Yönetici girişi</div>
      <p class="text-xs text-slate-400">Envanter şifreli elektrik ve ISO verisini kullanır. Görmek için parolayı girin (Elektrik sekmesiyle aynı parola).</p>
      <input id="karbonParola" type="password" autocomplete="current-password" class="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm" placeholder="Parola" />
      <p class="text-xs text-rose-400 ${girisHatasi ? '' : 'hidden'}">${girisHatasi}</p>
      <button class="w-full bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold rounded-lg py-2 text-sm">Giriş</button></form>`;
  }

  // ---------- ana çizim ----------
  function ciz() {
    const kok = document.getElementById('karbonIcerik');
    if (!kok) return;
    const ges = gesKacinilan(), env = envanter();
    const yil = ges ? ges.son.yil : new Date().getFullYear();
    const ee = efElek(yil);
    let ust = '';
    if (ges) {
      const k = (ges.kwh[yil] * ee) / 1000, tum = Object.entries(ges.kwh).reduce((t, [y, v]) => t + (v * efElek(y)) / 1000, 0);
      ust = `<section class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        ${kart(`GES ile kaçınılan CO₂ (${yil}, Oca–${AY[ges.son.ay - 1]})`, tr0(k) + ' <span class="text-sm font-medium text-slate-400">t</span>', `${tr0(ges.kwh[yil] / 1000)} MWh × ${tr1(ee * 1000).replace(',0', '')} g/kWh`, 'text-emerald-400')}
        ${kart('GES kurulumundan bu yana', tr0(tum) + ' <span class="text-sm font-medium text-slate-400">t</span>', 'tüm yıllar toplamı', 'text-emerald-300')}
        ${kart('Şebeke emisyon faktörü', tr0(ee * 1000) + ' <span class="text-sm font-medium text-slate-400">g/kWh</span>', 'parametrelerden değiştirilir')}
        ${env && env[yil] ? kart(`Kurumsal envanter (${yil}${tamYil(yil, env) ? '' : ', kısmi'})`, tr0(env[yil].t_toplam) + ' <span class="text-sm font-medium text-slate-400">tCO₂e</span>', 'kısmi kapsam, Kapsam 1+2') : kart('Kurumsal envanter', '🔒', 'giriş yapınca görünür')}</section>`;
    }
    let envBolumleri = '';
    if (env) {
      envBolumleri =
        bolum('env', 'Kurumsal emisyon envanteri', 'elektrik, kamu aydınlatması, doğalgaz, motorin', `<div class="h-72 mb-4"><canvas id="chKarbonYillik"></canvas></div>${envanterTablosu(env, ges)}`, ilk) +
        bolum('hedef', 'Azaltım hedefi takibi', 'baz yıl ve hedef yolu', hedefBolumu(env), false) +
        bolum('bec', 'SECAP envanter şablonu (sektör × enerji)', 'Baz Emisyon Envanteri için altlık', becTablosu(env), false);
    } else {
      envBolumleri = `<section class="glass-card rounded-xl p-2">${girisFormu()}</section>`;
    }
    kok.innerHTML = `<div class="space-y-4">
      <div class="glass-card rounded-xl px-4 py-3 text-[11px] text-slate-400">Kurumsal sera gazı envanteri (belediyenin kendi faaliyetleri) ve yerel iklim eylem planı (SECAP) hazırlığı için altlık. Kapsam <b class="text-slate-300">kısmidir</b>:
        elektrik tüm belediye aboneleri; doğalgaz ve motorin yalnızca ISO 50001 tesisleri. Şehir geneli envanter için gereken veriler “Veri toplama listesi”nde.</div>
      ${ust}${envBolumleri}
      ${bolum('secap', 'İzmir SECAP (2025–2050) referansı', 'kent envanteri, hedefler, kurumsal envanterin yeri', secapBolumu(env), false)}
      ${bolum('katalog', 'SECAP eylem kataloğu', 'azaltım (33), uyum (28), enerji yoksulluğu (3)', katalogBolumu(ges), false)}
      ${bolum('param', 'Emisyon faktörleri ve parametreler', 'düzenlenebilir', parametreBolumu(), false)}
      ${bolum('kontrol', 'SECAP veri toplama listesi', 'neyin hazır, neyin eksik olduğu', kontrolBolumu(), false)}
      ${bolum('eylem', 'Eylem listesi (iklim eylem planı taslağı)', 'azaltım eylemleri ve CO₂ etkisi', eylemBolumu(), false)}
      ${bolum('rva', 'Risk ve kırılganlık değerlendirmesi (uyum)', 'iklim tehlikeleri', rvaBolumu(), false)}
      <p class="text-[11px] text-slate-500 text-center">Eylem listesi ve risk tablosu yalnızca bu tarayıcıda saklanır. CSV olarak indirip Excel'de paylaşabilirsiniz.</p></div>`;
    if (!kok.dataset.dinleyici) {
      kok.dataset.dinleyici = '1';
      kok.addEventListener('toggle', (ev) => { const d = ev.target; if (d.dataset && d.dataset.k) { d.open ? acikK.add(d.dataset.k) : acikK.delete(d.dataset.k); if (d.open && window.Chart) setTimeout(() => Object.values(grafik).forEach((g) => g && g.resize()), 60); } }, true);
    }
    if (window.lucide) lucide.createIcons();
    const f = document.getElementById('karbonGiris');
    if (f) f.onsubmit = async (ev) => {
      ev.preventDefault();
      const pw = document.getElementById('karbonParola').value;
      if (await parolaDene(pw)) { girisHatasi = ''; oturum('elp', pw); ciz(); } else { girisHatasi = 'Parola yanlış.'; ciz(); }
    };
    if (env) grafikler(env, ges);
    kentGrafigi();
    ilk = false;
  }

  function kentGrafigi() {
    if (!S || !window.Chart || !document.getElementById('chKarbonKent')) return;
    const renk = { 'Sabit Enerji': '#3f8fd2', 'Ulaşım': '#7a5cc7', 'Atık': '#d9822b', 'Tarım ve Hayvancılık': '#84cc16' };
    cizGrafik('chKarbonKent', { type: 'bar', data: { labels: S.yillar, datasets: Object.entries(S.envanter_sanayisiz_t).map(([ad, v]) => ({ label: ad, data: v, backgroundColor: renk[ad] || '#94a3b8', stack: 'k' })) },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' }, title: { display: true, text: 'İzmir kent sera gazı envanteri, sanayi ve havacılık hariç (tCO₂e)', color: koyuMu() ? '#94a3b8' : '#5b6b7e', font: { size: 11, weight: 'normal' } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmt(c.parsed.y)} tCO₂e` } } }, scales: { x: { stacked: true }, y: { stacked: true, ticks: { callback: (v) => (v / 1e6).toLocaleString('tr-TR') + ' Mt' } } } } });
  }

  function grafikler(env, ges) {
    if (!window.Chart) return;
    const yillar = Object.keys(env).sort();
    const set = (ad, anahtar, renk) => ({ label: ad, data: yillar.map((y) => Math.round(env[y][anahtar])), backgroundColor: renk, stack: 'e' });
    cizGrafik('chKarbonYillik', {
      type: 'bar',
      data: {
        labels: yillar.map((y) => (tamYil(y, env) ? y : y + ' (kısmi)')),
        datasets: [set('Bina/tesis elektriği', 't_elek', '#3f8fd2'), set('Kamu aydınlatması', 't_aydinlatma', '#7a5cc7'), set('Doğalgaz', 't_dg', '#d9822b'), set('Motorin', 't_motorin', '#94a3b8'),
          ...(ges ? [{ label: 'GES ile kaçınılan', data: yillar.map((y) => (ges.kwh[y] ? -Math.round((ges.kwh[y] * efElek(y)) / 1000) : null)), backgroundColor: '#10b981', stack: 'g' }] : [])],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${tr0(Math.abs(c.parsed.y))} tCO₂e` } } }, scales: { x: { stacked: true }, y: { stacked: true, title: { display: true, text: 'tCO₂e' } } } },
    });
    const p = prm(), tam = yillar.filter((y) => tamYil(y, env));
    const baz = env[p.baz_yil] && tamYil(p.baz_yil, env) ? env[p.baz_yil].t_toplam : null;
    if (baz != null && document.getElementById('chKarbonHedef')) {
      const bas = Number(p.baz_yil), son = Math.max(Number(p.hedef_yil), 2050), etiket = [];
      for (let y = bas; y <= son; y += (y < 2030 ? 1 : 5)) etiket.push(y);
      if (!etiket.includes(Number(p.hedef_yil))) etiket.push(Number(p.hedef_yil));
      etiket.sort((x, z) => x - z);
      const yol = (y) => (y <= Number(p.hedef_yil) ? baz * (1 - (p.hedef_yuzde / 100) * ((y - bas) / Math.max(Number(p.hedef_yil) - bas, 1))) : baz * (1 - (p.hedef_yuzde / 100) - ((p.hedef_2050 - p.hedef_yuzde) / 100) * ((y - Number(p.hedef_yil)) / Math.max(2050 - Number(p.hedef_yil), 1))));
      cizGrafik('chKarbonHedef', {
        type: 'line',
        data: { labels: etiket, datasets: [
          { label: 'Hedef yolu (2030 → 2050)', data: etiket.map((y) => Math.round(yol(y))), borderColor: '#10b981', borderDash: [6, 4], pointRadius: 0 },
          { label: 'Gerçekleşen (tam yıl)', data: etiket.map((y) => (tam.includes(String(y)) ? Math.round(env[y].t_toplam) : null)), borderColor: TV(), backgroundColor: TV(), pointRadius: 4, spanGaps: false }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { title: { display: true, text: 'tCO₂e' } } } },
      });
    }
  }

  // ---------- API ----------
  async function secapYukle() {
    if (!S) { try { S = await (await fetch('data/secap_izmir.json')).json(); } catch (e) { S = null; } }
    if (!KONUM) { try { KONUM = await (await fetch('data/santral_konumlari.json')).json(); } catch (e) { KONUM = null; } }
  }

  async function ac() {
    await secapYukle();
    if (!E) {
      const kayitli = oturum('elp');
      if (kayitli && (await parolaDene(kayitli))) { /* oturum açık */ } else if (kayitli) oturum('elp', null);
    }
    ciz();
  }

  window.Karbon = {
    ac,
    efElek: () => efElek(new Date().getFullYear()),
    faktorler() { const p = prm(); return { ef_elek: efElek(new Date().getFullYear()), dg_kwh_sm3: p.dg_kwh_sm3, ef_dg: p.ef_dg }; },
    katalog(t) { katalogTur = t; katalogSektor = 'hepsi'; ciz(); },
    katalogSektor(v) { katalogSektor = v; ciz(); },
    ilgili(v) { sadeceIlgili = v; ciz(); },
    yenile() { if (document.getElementById('karbonIcerik').children.length) ciz(); },
    param(ad, v) { const p = oku('param', {}); p[ad] = parseFloat(v); yaz('param', p); ciz(); },
    paramYil(y, v) { const p = oku('param', {}); p.ef_elek_yil = p.ef_elek_yil || {}; if (v === '' || isNaN(parseFloat(v))) delete p.ef_elek_yil[y]; else p.ef_elek_yil[y] = parseFloat(v); yaz('param', p); ciz(); },
    kontrol(i, v) { const d = oku('kontrol', {}); d[i] = v; yaz('kontrol', d); },
    eylemEkle() { const l = eylemler(); l.push({ baslik: '', sektor: '', sorumlu: '', termin: '', durum: 'Planlanan' }); yaz('eylem', l); ciz(); },
    eylemOneri() { const l = eylemler(); EYLEM_KONULARI.forEach((k) => { if (!l.some((e) => e.sektor === k)) l.push({ baslik: '', sektor: k, sorumlu: '', termin: '', durum: 'Planlanan' }); }); yaz('eylem', l); ciz(); },
    eylemDeger(i, a, v) { const l = eylemler(); l[i][a] = a === 'elek' || a === 'yakit' || a === 'yen' ? (v === '' ? null : parseFloat(v)) : v; yaz('eylem', l); ciz(); },
    eylemSil(i) { const l = eylemler(); l.splice(i, 1); yaz('eylem', l); ciz(); },
    eylemIndir() {
      const p = prm();
      indir('iklim_eylem_listesi.csv', csv([['Eylem', 'Sektör/konu', 'SECAP kodu', 'Sorumlu birim', 'Termin', 'Elektrik tasarrufu MWh/yıl', 'Doğalgaz tasarrufu MWh/yıl', 'Yenilenebilir üretim MWh/yıl', 'CO2 azaltımı t/yıl', 'Durum'],
        ...eylemler().map((e) => [e.baslik, e.sektor, e.secap, e.sorumlu, e.termin, e.elek, e.yakit, e.yen, Math.round(((e.elek || 0) + (e.yen || 0)) * efElek(new Date().getFullYear()) + (e.yakit || 0) * p.ef_dg), e.durum])]));
    },
    rva(i, a, v) {
      let l = oku('rva', null) || TEHLIKELER.map((t) => ({ tehlike: t, olasilik: 3, etki: 3, sektor: '', onlem: '' }));
      l[i][a] = a === 'olasilik' || a === 'etki' ? Math.max(1, Math.min(5, parseInt(v) || 1)) : v; yaz('rva', l); ciz();
    },
    rvaIndir() {
      const l = oku('rva', null) || TEHLIKELER.map((t) => ({ tehlike: t, olasilik: 3, etki: 3, sektor: '', onlem: '' }));
      indir('risk_ve_kirilganlik.csv', csv([['Tehlike', 'Olasılık', 'Etki', 'Risk', 'Etkilenen sektörler', 'Uyum eylemi'], ...l.map((t) => [t.tehlike, t.olasilik, t.etki, t.olasilik * t.etki, t.sektor, t.onlem])]));
    },
    becIndir() {
      const env = envanter(); if (!env) return;
      const yil = Math.max(0, ...Object.keys(env).filter((y) => tamYil(y, env)).map(Number));
      const r = env[yil]; if (!r) return;
      indir(`secap_envanter_sablonu_${yil}.csv`, csv([['Sektör', 'Elektrik MWh', 'Doğalgaz MWh', 'Motorin MWh', 'Not'],
        ['Belediye binaları ve tesisleri', Math.round(r.elek / 1000), Math.round(r.mwh_dg), Math.round((r.motorin_l * 10) / 1000), 'Doğalgaz/motorin yalnız ISO tesisleri'],
        ['Kamu aydınlatması', Math.round(r.aydinlatma / 1000), '', '', ''],
        ...['Belediye araç filosu', 'Toplu taşıma (belediye)', 'Konut', 'Hizmet / ticaret', 'Sanayi', 'Özel ve ticari ulaşım', 'Atık / atıksu'].map((s) => [s, '', '', '', 'Veri gerekli'])]));
    },
  };

  if ((location.hash || '').slice(1) === 'karbon') ac();
})();
