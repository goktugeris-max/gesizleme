/* Ekran döngüsü (üst sekme "Ekran", #sunum): büyük dikey ekran (9:16, 96 inç) için kendiliğinden dönen veri görselleri.
 *
 * Yönetici girişi (Elektrik/ISO ile aynı parola, sessionStorage 'elp') gerekir: elektrik, ISO ve iştirak toplamları şifreli kaynaklardan tarayıcıda çözülür, hiçbir yere yazılmaz.
 * Su, doğalgaz ve GES verisi herkese açık dosyalardan okunur. Rakamlar sayfa her açıldığında panelin güncel verisinden hesaplanır (elle girilmiş rakam yoktur;
 * tek sabitler: doğalgaz faktörü 1,994 kg/m³ ve 25 m³/hane/ay su eşdeğeri, kurum su raporundaki 850 bin m³ ≈ 34 bin hane oranı).
 * Altı sayfa: kapak, su, doğalgaz, elektrik, güneş, ISO 50001 ve iştirakler. Dil Türkçe/İngilizce seçilir; sahne 1080×1920 kurulur ve ekrana sığdırılır; "Tam ekran" ile ekranı doldurur.
 * Kontroller: ok tuşları, boşluk (duraklat), F (tam ekran). Sekme gizlenince döngü durur.
 */
(function () {
  const NAVY = '#211950', BLUE = '#1b78c2', ORG = '#d9622b', YEL = '#e0a100', GRN = '#1f9d6b', GRI = '#9aa7bd';
  const ADK = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const ADE = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const KTR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const KEN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const topla = (a) => (a || []).reduce((t, v) => t + (v || 0), 0);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let kurYt = false, L = 'tr', yon = 'oto', sure = 12, oynat = true, idx = 0, sayac = 0, D = null, sayfalar = [], hata = null, yukleniyor = false, zamanlayici = null;
  try { L = localStorage.getItem('sunum_v1_dil') === 'en' ? 'en' : 'tr'; yon = ['yatay', 'dikey'].includes(localStorage.getItem('sunum_v1_yon')) ? localStorage.getItem('sunum_v1_yon') : 'oto'; sure = Number(localStorage.getItem('sunum_v1_sure')) || 12; } catch (e) { /* kayıt yok */ }

  // ---------- biçim ----------
  const num = (n, d) => { const s = Number(n).toLocaleString(L === 'tr' ? 'tr-TR' : 'en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); return s; };
  const pct = (v, d, sign) => { const a = num(Math.abs(v) * 100, d || 0), sg = sign === false ? '' : (v < 0 ? '−' : v > 0 ? '+' : ''); return L === 'tr' ? `${sg}%${a}` : `${sg}${a}%`; };
  // Yıl sonrası Türkçe ekler (okunuşun son hecesine göre)
  const SON = { 0: ['ye', 'nin', 'ten'], 1: ['e', 'in', 'den'], 2: ['ye', 'nin', 'den'], 3: ['e', 'ün', 'ten'], 4: ['e', 'ün', 'ten'], 5: ['e', 'in', 'ten'], 6: ['ya', 'nın', 'dan'], 7: ['ye', 'nin', 'den'], 8: ['e', 'in', 'den'], 9: ['a', 'un', 'dan'] };
  const yDat = (y) => `${y}’${SON[y % 10][0]}`, yGen = (y) => `${y}’${SON[y % 10][1]}`, yAbl = (y) => `${y}’${SON[y % 10][2]}`;
  const aralik = (n) => (L === 'tr' ? `${ADK[0]}–${ADK[n - 1]}` : `${ADE[0].slice(0, 3)}–${ADE[n - 1].slice(0, 3)}`);

  // ---------- çözme ve yükleme ----------
  const b64 = (t) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
  async function coz(s, parola) {
    const m = await crypto.subtle.importKey('raw', new TextEncoder().encode(parola), 'PBKDF2', false, ['deriveKey']);
    const k = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64(s.salt), iterations: s.iter, hash: 'SHA-256' }, m, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(s.iv) }, k, b64(s.data))));
  }
  const getJson = async (u) => { const r = await fetch(u + '?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); };
  const oturum = (v) => { try { return v === undefined ? sessionStorage.getItem('elp') : (v === null ? sessionStorage.removeItem('elp') : sessionStorage.setItem('elp', v)); } catch (e) { return null; } };

  async function yukle(parola) {
    const E = await coz(await getJson('data/elektrik.enc.json'), parola);   // yanlış parolada burada hata verir
    const tam = async (u) => { try { return await coz(await getJson(u), parola); } catch (e) { return null; } };
    const [I, IST] = await Promise.all([tam('data/iso50001.enc.json'), tam('data/istirak.enc.json')]);
    const [K, G] = await Promise.all([getJson('data/kaynak_raporu.json'), getJson('data/dogalgaz.json')]);
    let PERF = window.Dash && Dash.veri && Dash.veri() && Dash.veri().PERF;
    if (!PERF) PERF = await getJson('data/performans.json');
    return { E, I, IST, K, G, PERF };
  }

  // ---------- rakamların hesabı ----------
  function hesapla(v) {
    const R = {}, { E, I, IST, K, G, PERF } = v;
    // su
    const su = K.su.aylik, ny = Object.keys(su).map(Number).sort(), sn = K.su.son_ay, sy = ny[ny.length - 1], sb = ny[0];
    const st = (y) => topla(su[y].slice(0, sn));
    R.su = { n: sn, y: sy, b: sb, p: sy - 1, seri: ny.slice(-3), toplam: Object.fromEntries(ny.map((y) => [y, st(y)])) };
    // doğalgaz
    const gm = G.m3, gy = G.yillar.map(Number), gn = G.son_donem.ay, gl = G.son_donem.yil;
    const gt = (y) => topla(Object.values(gm[y] || {}).map((a) => topla(a.slice(0, gn))));
    R.gaz = { n: gn, y: gl, b: gy[0], p: gl - 1, yillar: gy, toplam: Object.fromEntries(gy.map((y) => [y, gt(y)])), abone: G.aboneler.length };
    // elektrik
    const ey = Object.keys(E.aylik).map(Number).sort(), en = E.son_donem.ay, el = E.son_donem.yil;
    const et = (y, k) => topla(E.aylik[y][k].slice(0, en));
    R.el = { n: en, y: el, b: ey[0], p: el - 1, yillar: ey, toplam: Object.fromEntries(ey.map((y) => [y, et(y, 'gercek')])), ges: et(el, 'ges_net') };
    // GES
    const sd = PERF.son_donem, S = PERF.santraller, gesy = sd.yil, gesn = sd.ay;
    const tamYil = Object.keys(S[0].yillik).map(Number).filter((y) => y < gesy).sort().slice(-3);
    R.ges = { y: gesy, n: gesn, kw: topla(S.map((s) => s.kw)), adet: S.length, ytd: topla(S.map((s) => topla((s.aylik[gesy] || []).slice(0, gesn)))), tamYil, yillik: Object.fromEntries(tamYil.map((y) => [y, topla(S.map((s) => s.yillik[y]))])), yen: K.surdurulebilirlik_2025 && K.surdurulebilirlik_2025.yenilenebilir_pay, ef: (window.Karbon && Karbon.efElek) ? Karbon.efElek() : 0.479 };
    // ISO
    if (I) {
      const yl = Math.max(...I.seriler.flatMap((s) => Object.keys(s.yillar).map(Number)));
      const topl = (liste) => liste.reduce((a, s) => { const x = s.yillar[yl]; if (!x) return a; x.takip.forEach((t, i) => { if (t != null && x.referans[i] != null) { a.t += t; a.r += x.referans[i]; a.n = Math.max(a.n, i + 1); } }); return a; }, { t: 0, r: 0, n: 0 });
      const el1 = topl(I.seriler.filter((s) => s.birim === 'kWh')), huz = topl(I.seriler.filter((s) => /^Huzurevi/.test(s.bolum) && s.birim !== 'kWh'));
      const hs = I.seriler.find((s) => s.yillar[yl] && Object.keys(s.yillar[yl].degiskenler || {}).some((k) => /^hdd/i.test(k)));
      const hdd = (y) => { if (!hs || !hs.yillar[y]) return null; const k = Object.keys(hs.yillar[y].degiskenler).find((q) => /^hdd/i.test(q)); return k ? topla(hs.yillar[y].degiskenler[k].slice(0, R.gaz.n)) : null; };
      R.iso = { y: yl, el: el1, huz, hddYil: hdd(R.gaz.y), hddOnce: hdd(R.gaz.p) };
    }
    if (IST) {
      const oe = (s, y) => ((s.aylik[y] || [])).slice(0, 9).reduce((t, x) => t + (x || 0), 0);
      const yy = ['2022', '2023', '2024'];
      const tp = Object.fromEntries(yy.map((y) => [y, topla(IST.sirketler.map((s) => oe(s, y)))]));
      const pl = IST.sirketler.filter((s) => s.potansiyel);
      R.ist = { yy, tp, dusuk: topla(pl.map((s) => s.potansiyel.baz * s.potansiyel.dusuk)), yuksek: topla(pl.map((s) => s.potansiyel.baz * s.potansiyel.yuksek)) };
    }
    return R;
  }

  // ---------- grafikler (SVG) ----------
  function cizgi(seriler, renk, etiket, adlar, w, h) {
    const pl = 96, pr = 30, pt = 30, pb = 60, iw = w - pl - pr, ih = h - pt - pb, mx = Math.max(...seriler.flat()) / 1e3 * 1.08;
    const X = (i) => pl + iw * i / (etiket.length - 1), Y = (v) => pt + ih * (1 - v / 1e3 / mx);
    const t = mx / 4, mag = Math.pow(10, Math.floor(Math.log10(t))), stp = [1, 2, 2.5, 5, 10].map((m) => m * mag).sort((a, b) => Math.abs(a - t) - Math.abs(b - t))[0];
    let g = '';
    for (let v = 0; v <= mx; v += stp) { const y = pt + ih * (1 - v / mx); g += `<line x1="${pl}" x2="${w - pr}" y1="${y}" y2="${y}" stroke="#d8deea" stroke-width="2"/><text x="${pl - 14}" y="${y + 10}" text-anchor="end" font-size="26" fill="#5b6b7e">${num(v)}</text>`; }
    etiket.forEach((l, i) => { g += `<text x="${X(i)}" y="${h - 16}" text-anchor="middle" font-size="26" fill="#5b6b7e">${l}</text>`; });
    seriler.forEach((s, k) => { const wd = k === seriler.length - 1 ? 9 : 4; g += `<polyline points="${s.map((v, i) => X(i) + ',' + Y(v)).join(' ')}" fill="none" stroke="${renk[k]}" stroke-width="${wd}" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${X(s.length - 1)}" cy="${Y(s[s.length - 1])}" r="${wd + 3}" fill="${renk[k]}"/>`; });
    let lx = w - pr - adlar.length * 130; adlar.forEach((a, k) => { g += `<rect x="${lx}" y="${pt - 4}" width="26" height="8" rx="4" fill="${renk[k]}"/><text x="${lx + 36}" y="${pt + 8}" font-size="26" font-weight="700" fill="${NAVY}">${a}</text>`; lx += 130; });
    return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${g}</svg>`;
  }
  function cubuk(vals, etiket, renk, fmt, w, h) {
    const pt = 70, pb = 70, n = vals.length, mx = Math.max(...vals) * 1.12, bw = w / n * 0.62, ih = h - pt - pb;
    let g = '';
    vals.forEach((v, i) => { const x = w / n * i + (w / n - bw) / 2, bh = ih * v / mx, y = pt + ih - bh; g += `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="8" fill="${renk[i]}"/><text x="${x + bw / 2}" y="${y - 18}" text-anchor="middle" font-size="40" font-weight="700" fill="${NAVY}">${fmt(v)}</text><text x="${x + bw / 2}" y="${h - 20}" text-anchor="middle" font-size="32" fill="#5b6b7e">${etiket[i]}</text>`; });
    g += `<line x1="0" x2="${w}" y1="${pt + ih}" y2="${pt + ih}" stroke="#aab4c6" stroke-width="3"/>`;
    return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${g}</svg>`;
  }

  // ---------- sayfalar ----------
  const LOGO = 'logo-izbb-cop31.png';
  function sayfa(i, renk, kick, baslik, alt, hero, hu1, hu2, ct, grafik, stats, not) {
    const st = stats.map(([v, l, c]) => `<div class="sn-st"><div class="sn-sv ${v.length <= 6 ? 'a' : v.length <= 10 ? 'b' : 'c'}" style="color:${c}">${v}</div><div class="sn-sl">${l}</div></div>`).join('');
    const dots = '@@';
    return `<div class="sn-top"><img src="${LOGO}" alt=""></div><div class="sn-body"><div class="sn-sol"><div class="sn-kick" style="color:${renk}">${kick}</div><h1>${baslik}</h1><div class="sn-sub">${alt}</div>
      <div class="sn-hero" style="border-left-color:${renk}"><div class="sn-hv ${hero.length <= 5 ? '' : 'k'}" style="color:${renk}">${hero}</div><div class="sn-hu">${hu1}<span>${hu2}</span></div></div></div>
      <div class="sn-sag"><div class="sn-ct">${ct}</div><div class="sn-ch">${grafik}</div><div class="sn-sts">${st}</div></div></div><div class="sn-ft"><div>${not}</div><div class="sn-dots">${dots}</div></div>`;
  }
  function olustur(R) {
    const tr = L === 'tr', aylar = tr ? KTR : KEN, out = [], CH = kurYt ? 560 : 430;
    const dsu = R.su.toplam[R.su.y] / R.su.toplam[R.su.b] - 1, dsuP = R.su.toplam[R.su.y] / R.su.toplam[R.su.p] - 1;
    const dg = R.gaz.toplam[R.gaz.y] / R.gaz.toplam[R.gaz.b] - 1, dgP = R.gaz.toplam[R.gaz.y] / R.gaz.toplam[R.gaz.p] - 1;
    const de = R.el.toplam[R.el.y] / R.el.toplam[R.el.b] - 1, deP = R.el.toplam[R.el.y] / R.el.toplam[R.el.p] - 1;
    const yarisi = R.el.yillar.length > 2 ? R.el.y - 2 : R.el.p, de2 = R.el.toplam[R.el.y] / R.el.toplam[yarisi] - 1;
    const yazi = (v, a, b) => (v < 0 ? a : b);   // azaldı / arttı
    const gesPay = R.el.toplam[R.el.y] ? R.el.ges / R.el.toplam[R.el.y] : 0;
    const gesM = R.ges.ytd, co2g = Math.abs(R.gaz.toplam[R.gaz.b] - R.gaz.toplam[R.gaz.y]) * 1.994 / 1000;
    const ayAd = (n) => (tr ? ADK[n - 1] : ADE[n - 1]);
    // kapak
    const kart = [[pct(dsu), tr ? `su tüketimi, ${yDat(R.su.b)} göre` : `water use vs ${R.su.b}`, '#7cc4f5'], [pct(de, 1), tr ? `elektrik tüketimi, ${yDat(R.el.b)} göre` : `electricity use vs ${R.el.b}`, '#ffc547'], [pct(dg, 1), tr ? `doğalgaz tüketimi, ${yDat(R.gaz.b)} göre` : `natural gas use vs ${R.gaz.b}`, '#ff9a66'], [`${num(gesM / 1e6, 2)} GWh`, tr ? `kendi GES üretimimiz, ${aralik(R.ges.n)} ${R.ges.y}` : `own solar generation, ${aralik(R.ges.n)} ${R.ges.y}`, '#7be0b4']];
    out.push(`<div class="sn-kapak"><div class="sn-top sn-beyaz"><img src="${LOGO}" alt=""></div><h1>${tr ? 'İzmir’de enerji ve suyu ölçüyor, yönetiyor ve tasarruf ediyoruz' : 'Measuring, managing and saving energy and water in İzmir'}</h1>
      <div class="sn-grid">${kart.map(([v, l, c]) => `<div class="sn-c"><div class="sn-v ${v.length <= 6 ? '' : 'k'}" style="color:${c}">${v}</div><div class="sn-l">${l}</div></div>`).join('')}</div>
      <div class="sn-kft">${tr ? 'İzmir Büyükşehir Belediyesi, İklim Değişikliği ve Temiz Enerji Şube Müdürlüğü.<br>Karşılaştırmalar aynı aylar üzerindendir; veriler ' + ayAd(R.gaz.n) + ' ' + R.gaz.y + '’ya kadardır.' : 'İzmir Metropolitan Municipality, Climate Change and Clean Energy Branch.<br>Comparisons use the same months; data to ' + ayAd(R.gaz.n) + ' ' + R.gaz.y + '.'}</div></div>`);
    // su
    const sb = R.su.toplam[R.su.b], sy = R.su.toplam[R.su.y], sp = R.su.toplam[R.su.p], fark = sb - sy;
    out.push(sayfa(1, BLUE, tr ? 'SU' : 'WATER', tr ? `Su tüketimi ${yDat(R.su.b)} göre %${num(Math.abs(dsu) * 100)} ${yazi(dsu, 'azaldı', 'arttı')}` : `Water use ${dsu < 0 ? 'down' : 'up'} ${num(Math.abs(dsu) * 100)}% vs ${R.su.b}`,
      tr ? 'Belediye binaları, parklar ve mezarlıklarda aylık izleme ve saha çalışması' : 'Monthly monitoring and field checks in municipal buildings, parks and cemeteries', pct(dsu),
      tr ? `${yGen(R.su.b)} aynı aylarına göre (${aralik(R.su.n)} ${R.su.y})` : `vs the same months of ${R.su.b} (${aralik(R.su.n)} ${R.su.y})`, tr ? `${yDat(R.su.p)} göre ${pct(dsuP, 1)}` : `${pct(dsuP, 1)} vs ${R.su.p}`,
      tr ? 'Aylık su tüketimi, bin m³' : 'Water use per month, 000 m³', cizgi(R.su.seri.map((y) => K_su(y)), [GRI, BLUE + '99', BLUE], aylar.slice(0, R.su.n), R.su.seri.map(String), 936, CH),
      [[`${num(Math.abs(fark) / 1e6, 1)} ${tr ? 'milyon m³' : 'M m³'}`, tr ? `${yDat(R.su.b)} göre ${fark > 0 ? 'daha az' : 'daha fazla'} su` : `${fark > 0 ? 'less' : 'more'} water than in ${R.su.b}`, BLUE],
        ...(fark > 0 ? [[`≈ ${num(Math.round(fark / 25 / 1000) * 1000)}`, tr ? 'hanenin aylık su tüketimi kadar' : 'households’ monthly water use', BLUE]] : []),
        [R.su.seri.map((y) => num(R.su.toplam[y] / 1e6, 1)).join(' / '), tr ? `milyon m³: ${R.su.seri.join(' / ')}, ${aralik(R.su.n)}` : `million m³: ${R.su.seri.join(' / ')}, ${aralik(R.su.n)}`, NAVY]],
      tr ? 'Parklar, Mezarlıklar ve işletmelerle aylık değerlendirme; yüksek tüketimli abonelerde saha çalışması.' : 'Monthly review with Parks, Cemeteries and operations; field checks at high-consumption accounts.'));
    // doğalgaz
    const gv = R.gaz.yillar.map((y) => R.gaz.toplam[y]);
    out.push(sayfa(2, ORG, tr ? 'DOĞALGAZ' : 'NATURAL GAS', tr ? `Doğalgaz tüketimi ${yGen(R.gaz.b)} %${num(Math.abs(dg) * 100)} ${yazi(dg, 'altında', 'üstünde')}` : `Natural gas use is ${num(Math.abs(dg) * 100)}% ${dg < 0 ? 'below' : 'above'} ${R.gaz.b}`,
      tr ? `${R.gaz.abone} abonelik bina bazında izleniyor, anomali uyarıları devrede` : `${R.gaz.abone} accounts monitored building by building, with anomaly alerts`, pct(dg, 1),
      tr ? `${yGen(R.gaz.b)} aynı aylarına göre (${aralik(R.gaz.n)} ${R.gaz.y})` : `vs the same months of ${R.gaz.b} (${aralik(R.gaz.n)} ${R.gaz.y})`, tr ? `${yDat(R.gaz.p)} göre ${pct(dgP, 1)}` : `${pct(dgP, 1)} vs ${R.gaz.p}`,
      tr ? `Doğalgaz tüketimi, ${aralik(R.gaz.n)}, milyon m³` : `Natural gas use, ${aralik(R.gaz.n)}, million m³`, cubuk(gv, R.gaz.yillar.map(String), gv.map((_, i) => (i === gv.length - 1 ? ORG : GRI)), (v) => num(v / 1e6, 2), 936, CH),
      [[String(R.gaz.abone), tr ? 'izlenen doğalgaz aboneliği' : 'gas accounts monitored', ORG], [`≈ ${num(co2g)} t`, tr ? `${yDat(R.gaz.b)} göre ${dg < 0 ? 'önlenen' : 'ek'} CO₂e` : `CO₂e ${dg < 0 ? 'avoided' : 'added'} vs ${R.gaz.b}`, ORG],
        ...(R.iso && R.iso.hddYil != null && R.iso.hddOnce != null ? [[`${num(R.iso.hddYil)} / ${num(R.iso.hddOnce)}`, tr ? `ısınma derece-gün, ${R.gaz.y} / ${R.gaz.p}` : `heating degree days, ${R.gaz.y} / ${R.gaz.p}`, NAVY]] : [])],
      tr ? 'Karşılaştırma, yılların aynı ayları üzerinden yapılmıştır.' : 'Years are compared over the same months.'));
    // elektrik
    const ev = R.el.yillar.map((y) => R.el.toplam[y]);
    out.push(sayfa(3, YEL, tr ? 'ELEKTRİK' : 'ELECTRICITY', tr ? `Elektrik tüketimi ${yAbl(R.el.b)} beri %${num(Math.abs(de) * 100)} ${yazi(de, 'azaldı', 'arttı')}` : `Electricity use ${de < 0 ? 'down' : 'up'} ${num(Math.abs(de) * 100)}% since ${R.el.b}`,
      tr ? 'Kendi GES üretimi ve müstecirler düşülmüş net tüketim' : 'Net consumption after own solar generation and sub-metered tenants', pct(de, 1),
      tr ? `${yGen(R.el.b)} aynı aylarına göre (${aralik(R.el.n)} ${R.el.y})` : `vs the same months of ${R.el.b} (${aralik(R.el.n)} ${R.el.y})`, tr ? `${yDat(R.el.p)} göre ${pct(deP, 1)}` : `${pct(deP, 1)} vs ${R.el.p}`,
      tr ? `Net elektrik tüketimi, ${aralik(R.el.n)}, GWh` : `Net electricity use, ${aralik(R.el.n)}, GWh`, cubuk(ev, R.el.yillar.map(String), ev.map((_, i) => (i === ev.length - 1 ? YEL : GRI)), (v) => num(v / 1e6, 1), 936, CH),
      [[`${num(Math.abs(R.el.toplam[R.el.b] - R.el.toplam[R.el.y]) / 1e6, 1)} GWh`, tr ? `${yDat(R.el.b)} göre ${de < 0 ? 'daha az' : 'daha fazla'}` : `${de < 0 ? 'less' : 'more'} than in ${R.el.b}`, YEL], [pct(gesPay, 1, false), tr ? 'kendi çatı GES’lerimizden karşılandı' : 'supplied by our own rooftop solar', YEL], [pct(de2, 1), tr ? `${yDat(yarisi)} göre, aynı aylar` : `vs ${yarisi}, same months`, NAVY]],
      tr ? 'Net tüketim: kendi GES üretimi ve müstecir sayaçları düşülmüştür.' : 'Net use: own solar generation and sub-metered tenants are deducted.'));
    // GES
    const gesV = [...R.ges.tamYil.map((y) => R.ges.yillik[y]), R.ges.ytd], gesL = [...R.ges.tamYil.map(String), `${R.ges.y} (${R.ges.n} ${tr ? 'ay' : 'mo.'})`];
    const yenY = R.ges.yen ? R.ges.yen[Math.max(...Object.keys(R.ges.yen).map(Number))] : null, yenYil = R.ges.yen ? Math.max(...Object.keys(R.ges.yen).map(Number)) : null;
    out.push(sayfa(4, YEL, tr ? 'GÜNEŞ ENERJİSİ' : 'SOLAR', tr ? `${R.ges.adet} belediye çatı GES’i` : `${R.ges.adet} municipal rooftop solar plants`,
      tr ? 'Her santralin üretim, performans ve arıza takibi tek panelde' : 'Production, performance and fault tracking for every plant in one dashboard', `${num(R.ges.ytd / 1e6, 2)} GWh`,
      tr ? `${R.ges.y} ${aralik(R.ges.n)} üretimi` : `generated ${aralik(R.ges.n)} ${R.ges.y}`, tr ? `≈ ${num(R.ges.ytd * R.ges.ef / 1000)} t CO₂ önlendi` : `≈ ${num(R.ges.ytd * R.ges.ef / 1000)} t CO₂ avoided`,
      tr ? 'GES üretimi, GWh' : 'Solar generation, GWh', cubuk(gesV, gesL, gesV.map((_, i) => (i === gesV.length - 1 ? YEL : GRI)), (v) => num(v / 1e6, 2), 936, CH),
      [[`${num(R.ges.kw / 1000, 2)} MW`, tr ? 'kurulu güç' : 'installed capacity', YEL], ...(yenY != null ? [[pct(yenY, 0, false), tr ? `kurum enerjisinde yenilenebilir pay, ${yenYil}` : `renewable share of corporate energy, ${yenYil}`, YEL]] : []), [String(R.ges.adet), tr ? 'izlenen santral' : 'plants monitored', NAVY]],
      tr ? 'Üretim, performans ve arıza takibi tek panelde yapılıyor.' : 'Production, performance and fault tracking run from a single dashboard.'));
    // ISO ve iştirakler
    if (R.iso && R.ist) {
      const di = R.iso.el.r ? R.iso.el.t / R.iso.el.r - 1 : 0, dh = R.iso.huz.r ? R.iso.huz.t / R.iso.huz.r - 1 : null, iv = R.ist.yy.map((y) => R.ist.tp[y]), son = R.ist.tp[R.ist.yy[R.ist.yy.length - 1]];
      out.push(sayfa(5, GRN, tr ? 'YÖNETİM SİSTEMİ' : 'MANAGEMENT SYSTEM', tr ? 'ISO 50001 ile enerji yönetimi' : 'Managing energy with ISO 50001',
        tr ? 'Üç tesiste aylık sayaç verisiyle referans çizgisi takibi' : 'Tracking three facilities against reference lines with monthly meter data', pct(di, 1),
        tr ? '3 tesiste elektrik, referans çizgisine göre' : 'electricity at 3 facilities vs reference line', tr ? `${aralik(R.iso.el.n)} ${R.iso.y}` : `${aralik(R.iso.el.n)} ${R.iso.y}`,
        tr ? 'Sıradaki alan: iştiraklerin elektrik tüketimi, GWh' : 'Next: municipal companies’ electricity use, GWh', cubuk(iv, R.ist.yy, iv.map((_, i) => (i === iv.length - 1 ? GRN : GRI)), (v) => num(v / 1e6), 936, CH),
        [...(dh != null ? [[pct(dh), tr ? 'Huzurevi doğalgazı, referansa göre' : 'Huzurevi gas vs reference', GRN]] : []), [`${num(son / 1e6)} GWh`, tr ? '9 iştirakin tüketimi, Ocak–Eylül 2024' : '9 municipal companies, Jan–Sep 2024', GRN], [tr ? `%${num(R.ist.dusuk / son * 100)}–${num(R.ist.yuksek / son * 100)}` : `${num(R.ist.dusuk / son * 100)}–${num(R.ist.yuksek / son * 100)}%`, tr ? 'tahmini tasarruf potansiyeli, sahada doğrulanmadı' : 'estimated savings potential, not field-verified', NAVY]],
        tr ? 'İştirak rakamları ön tahmindir; ISO tesis rakamları aylık sayaç verisine dayanır.' : 'Company figures are preliminary estimates; ISO facility figures use monthly meter data.'));
    }
    // Ölçüm: analizörler için hazırlanan ÖRNEK (simülasyon) veri; gerçek ölçüm değildir
    if (window.Olcum && Olcum.ornekVeri) {
      const O = Olcum.ornekVeri(), on = O.nokta.filter((n) => O.son[n.kod].durum === 'cevrimici'), TEAL = '#0f8b8d';
      const adim = (kod) => O.d15.filter((x) => x.nokta_kod === kod).slice(-96);
      const toplam = Array.from({ length: 96 }, (_, k) => on.reduce((t, n) => t + (adim(n.kod)[k] ? adim(n.kod)[k].ort_p_w : 0), 0));
      const sonP = on.reduce((t, n) => t + O.son[n.kod].deger.p_top, 0) / 1000, ortV = on.reduce((t, n) => t + O.son[n.kod].deger.v_l1, 0) / on.length, ortPf = on.reduce((t, n) => t + O.son[n.kod].deger.pf_top, 0) / on.length;
      const uyari = O.nokta.filter((n) => { const d = O.son[n.kod]; return d.durum !== 'cevrimici' || d.deger.pf_top < 0.9 || d.deger.thd_v_l1 > 8 || d.deger.i_dengesizlik > 10; }).length;
      const saat = (k) => (k % 12 === 0 ? String(new Date(new Date(adim(on[0].kod)[k].donem)).getHours()).padStart(2, '0') + ':00' : '');
      out.push(sayfa(0, TEAL, tr ? 'ÖLÇÜM ALTYAPISI, ÖRNEK VERİ' : 'METERING, SAMPLE DATA', tr ? 'Analizör verisi canlı ekranda' : 'Analyzer data on a live screen',
        tr ? 'Cihazlar kurulunca ölçüm ekranı böyle çalışacak (simülasyon verisi)' : 'How the metering screen will work once devices are installed (simulated data)', `${num(sonP, 0)} kW`,
        tr ? `anlık toplam güç, ${on.length} örnek analizör` : `instantaneous total power, ${on.length} sample analyzers`, tr ? 'Gerçek ölçüm değildir' : 'Not a real measurement',
        tr ? 'Son 24 saat, 15 dakikalık ortalama güç, kW (örnek)' : 'Last 24 hours, 15-minute average power, kW (sample)', cizgi([toplam], [TEAL], Array.from({ length: 96 }, (_, k) => saat(k)), [tr ? 'kW' : 'kW'], 936, CH),
        [[`${num(ortV, 0)} V`, tr ? 'ortalama faz gerilimi' : 'average phase voltage', TEAL], [num(ortPf, 2), tr ? 'ortalama güç faktörü (cos φ)' : 'average power factor (cos φ)', TEAL], [String(uyari), tr ? 'örnek uyarı sayısı' : 'sample alerts', NAVY]],
        tr ? 'Örnek veri: gerçek tesis ölçümü değildir. 34 analizörlük altyapı cihazlar monte edilince devreye girer.' : 'Sample data, not a real facility measurement. The 34-analyzer infrastructure goes live once devices are installed.'));
    }
    return out.map((h, k) => (k === 0 ? h : h.replace('@@', out.slice(1).map((_, q) => `<i class="${q + 1 === k ? 'on' : ''}"></i>`).join(''))));
  }
  let SU_AYLIK = null;
  async function hazirla(parola) { const v = await yukle(parola); SU_AYLIK = v.K.su.aylik; D = hesapla(v); }
  const K_su = (y) => SU_AYLIK[y].slice(0, D.su.n);

  // ---------- arayüz ----------
  const CSS = `
  .sn-kap{position:relative;overflow:hidden;margin:0 auto;border-radius:10px;background:#f4f6fa;border:1px solid var(--cizgi,#dfe5f0)}
  .sn-kap:fullscreen{border-radius:0;border:none;background:#000;display:flex;align-items:center;justify-content:center;margin:0}
  .sn-sahne{position:absolute;left:0;top:0;width:1080px;height:1920px;transform-origin:0 0;font-family:'IBM Plex Sans','Inter',sans-serif;color:${NAVY}}
  .sn-sayfa{position:absolute;inset:0;background:#f4f6fa;opacity:0;transition:opacity .7s;pointer-events:none}
  .sn-sayfa.on{opacity:1;pointer-events:auto}
  @media (prefers-reduced-motion:reduce){.sn-sayfa{transition:none}}
  .sn-sayfa *{box-sizing:border-box;margin:0;padding:0}
  .sn-sayfa svg text{text-rendering:geometricPrecision}
  .sn-body,.sn-sol,.sn-sag{display:contents}.sn-y .sn-sol,.sn-y .sn-sag{display:block}
  .sn-top{background:#fff;border-bottom:2px solid #dfe5f0;padding:34px 0 26px;display:flex;justify-content:center}.sn-top img{width:700px;display:block}
  .sn-kick{margin:44px 72px 0;font-size:36px;font-weight:700}
  .sn-sayfa h1{margin:12px 72px 0;font-size:80px;line-height:1.04;font-weight:800;letter-spacing:-1.5px;background:none;color:${NAVY}}
  .sn-sub{margin:14px 72px 0;font-size:36px;color:#5b6b7e;line-height:1.25}
  .sn-hero{margin:34px 72px 0;padding:26px 40px;background:#fff;border-radius:18px;border:2px solid #dfe5f0;border-left:16px solid}
  .sn-hv{line-height:.95;font-weight:800;letter-spacing:-7px;font-size:215px;white-space:nowrap}.sn-hv.k{font-size:170px}.sn-hu{font-size:38px;font-weight:600;margin-top:10px;line-height:1.2}.sn-hu span{display:block;color:#5b6b7e;font-weight:500;font-size:34px;margin-top:6px}
  .sn-ct{margin:34px 72px 4px;font-size:30px;font-weight:700;line-height:1.25}.sn-ch{margin:0 72px}
  .sn-sts{margin:20px 72px 0;display:flex;gap:20px}.sn-st{flex:1;background:#fff;border:2px solid #dfe5f0;border-radius:14px;padding:22px}
  .sn-sv{font-weight:800;line-height:1;letter-spacing:-1.5px}.sn-sv.a{font-size:60px}.sn-sv.b{font-size:46px}.sn-sv.c{font-size:38px}.sn-sl{font-size:28px;font-weight:500;margin-top:12px;line-height:1.22;color:#3c4a5e}
  .sn-ft{position:absolute;left:72px;right:72px;bottom:34px;display:flex;justify-content:space-between;align-items:flex-end;gap:30px;font-size:26px;color:#5b6b7e;line-height:1.3}
  .sn-dots{white-space:nowrap;flex-shrink:0}.sn-dots i{display:inline-block;width:18px;height:18px;border-radius:9px;background:#c7d0e0;margin-left:10px}.sn-dots i.on{background:${NAVY};width:46px}
  .sn-kapak{position:absolute;inset:0;background:${NAVY};color:#fff}.sn-kapak .sn-top{border:none;padding:40px 0 30px}.sn-kapak .sn-top img{width:820px}
  .sn-kapak h1{position:absolute;left:72px;right:72px;top:400px;margin:0;font-size:104px;line-height:1.02;font-weight:800;letter-spacing:-2.5px;color:#fff}
  .sn-grid{position:absolute;left:72px;right:72px;top:1000px;display:grid;grid-template-columns:1fr 1fr;gap:28px}.sn-c{background:rgba(255,255,255,.08);border-radius:18px;padding:36px 38px;border:2px solid rgba(255,255,255,.18)}
  .sn-v{font-weight:800;letter-spacing:-3px;line-height:1;font-size:84px}.sn-v.k{font-size:70px}.sn-l{font-size:34px;margin-top:14px;line-height:1.25;color:#e3e7f8}
  .sn-kft{position:absolute;left:72px;right:72px;bottom:46px;font-size:27px;color:#c9cfee;line-height:1.4}
  .sn-ilerleme{position:absolute;left:0;bottom:0;height:8px;background:${NAVY};opacity:.55;width:0}
  /* Yatay düzen (1920×1080, 16:9): sol sütun başlık ve ana rakam, sağ sütun grafik ve göstergeler */
  .sn-y .sn-top{height:150px;padding:0 72px;justify-content:flex-start;align-items:center}.sn-y .sn-top img{width:520px}
  .sn-y .sn-body{display:grid;grid-template-columns:780px 936px;gap:60px;padding:0 72px}
  .sn-y .sn-kick{margin:34px 0 0;font-size:30px}.sn-y .sn-sayfa h1{margin:8px 0 0;font-size:72px}.sn-y .sn-sub{margin:12px 0 0;font-size:32px}
  .sn-y .sn-hero{margin:26px 0 0;padding:20px 30px}.sn-y .sn-hv{font-size:215px;letter-spacing:-7px}.sn-y .sn-hv.k{font-size:135px}.sn-y .sn-hu{font-size:34px}.sn-y .sn-hu span{font-size:30px}
  .sn-y .sn-ct{margin:34px 0 4px;font-size:28px}.sn-y .sn-ch{margin:0}.sn-y .sn-sts{margin:16px 0 0;gap:16px}.sn-y .sn-st{padding:18px}
  .sn-y .sn-sv.a{font-size:56px}.sn-y .sn-sv.b{font-size:44px}.sn-y .sn-sv.c{font-size:36px}.sn-y .sn-sl{font-size:25px;margin-top:10px}
  .sn-y .sn-ft{left:72px;right:72px;bottom:24px;font-size:23px}
  .sn-y .sn-kapak .sn-top{height:150px;justify-content:center;padding:0}.sn-y .sn-kapak .sn-top img{width:560px}
  .sn-y .sn-kapak h1{left:72px;right:auto;width:900px;top:250px;font-size:84px}
  .sn-y .sn-grid{left:1010px;right:72px;top:250px;gap:22px}.sn-y .sn-c{padding:26px 28px}.sn-y .sn-v{font-size:70px}.sn-y .sn-v.k{font-size:58px}.sn-y .sn-l{font-size:27px;margin-top:10px}
  .sn-y .sn-kft{bottom:34px;font-size:24px}`;

  // Yön: 'oto' ekranın (tam ekranda ekran, değilse pencere) en-boy oranına bakar; elle yatay/dikey seçilebilir
  const yatayMi = () => (yon === 'yatay' ? true : yon === 'dikey' ? false : window.innerWidth >= window.innerHeight);
  function kapBoyut() {
    const kap = document.getElementById('snKap'), sah = document.getElementById('snSahne'); if (!kap || !sah) return;
    const tam = document.fullscreenElement === kap, yt = yatayMi();
    if (yt !== kurYt && D) { kurYt = yt; ciz(); return; }
    const SW = yt ? 1920 : 1080, SH = yt ? 1080 : 1920;
    sah.classList.toggle('sn-y', yt); sah.style.width = SW + 'px'; sah.style.height = SH + 'px';
    const aw = tam ? window.innerWidth : (document.getElementById('sunumIcerik').clientWidth || 600), ah = tam ? window.innerHeight : Math.max(360, window.innerHeight - kap.getBoundingClientRect().top - 24);
    const k = Math.min(aw / SW, ah / SH);
    sah.style.transform = `scale(${k})`;
    if (tam) { sah.style.left = ((aw - SW * k) / 2) + 'px'; sah.style.top = ((ah - SH * k) / 2) + 'px'; kap.style.width = '100%'; kap.style.height = '100%'; }
    else { sah.style.left = '0'; sah.style.top = '0'; kap.style.width = SW * k + 'px'; kap.style.height = SH * k + 'px'; }
  }
  function goster(n) {
    idx = (n + sayfalar.length) % sayfalar.length; sayac = 0;
    document.querySelectorAll('#snSahne .sn-sayfa').forEach((e, i) => e.classList.toggle('on', i === idx));
    const il = document.getElementById('snIlerleme'); if (il) il.style.width = '0';
  }
  function tick() {
    const tab = document.getElementById('tab-sunum');
    if (!tab || tab.classList.contains('hidden')) { durdur(); return; }
    if (!oynat || !sayfalar.length) return;
    sayac += 0.25;
    const il = document.getElementById('snIlerleme'); if (il) il.style.width = Math.min(100, sayac / sure * 100) + '%';
    if (sayac >= sure) goster(idx + 1);
  }
  function baslat() { if (!zamanlayici) zamanlayici = setInterval(tick, 250); }
  function durdur() { if (zamanlayici) { clearInterval(zamanlayici); zamanlayici = null; } }

  function giris(h) {
    const el = document.getElementById('sunumIcerik');
    el.innerHTML = `<form id="snGiris" class="max-w-sm mx-auto my-10 bg-slate-800/60 border border-slate-700 rounded-xl p-5 space-y-3">
      <div class="flex items-center gap-2 text-amber-300 font-semibold"><i data-lucide="lock" class="w-4 h-4"></i> Yönetici girişi</div>
      <p class="text-xs text-slate-400">Ekran döngüsü elektrik, ISO ve iştirak toplamlarını gösterir; bu veriler şifreli saklanır. Görmek için parolayı girin.</p>
      <input id="snParola" type="password" autocomplete="current-password" class="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm" placeholder="Parola" />
      <p class="text-xs text-rose-400 ${h ? '' : 'hidden'}">${esc(h || '')}</p>
      <button class="w-full bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold rounded-lg py-2 text-sm">Giriş</button></form>`;
    if (window.lucide) lucide.createIcons();
    document.getElementById('snGiris').onsubmit = async (ev) => {
      ev.preventDefault(); const p = document.getElementById('snParola').value;
      try { await hazirla(p); oturum(p); ciz(); } catch (e) { giris('Parola yanlış ya da veri okunamadı.'); }
    };
  }
  const kont = () => `<div class="flex flex-wrap items-center gap-2 mb-3 text-xs">
    <div class="flex gap-1">${['tr', 'en'].map((d) => `<button onclick="Sunum.dil('${d}')" class="px-3 py-1.5 rounded-md font-semibold ${L === d ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-300 hover:text-white'}">${d === 'tr' ? 'Türkçe' : 'English'}</button>`).join('')}</div>
    <div class="flex gap-1">${[['oto', 'Otomatik'], ['yatay', 'Yatay'], ['dikey', 'Dikey']].map(([k, ad]) => `<button onclick="Sunum.yon('${k}')" class="px-3 py-1.5 rounded-md font-semibold ${yon === k ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-300 hover:text-white'}">${ad}</button>`).join('')}</div>
    <label class="text-slate-400">Süre <select onchange="Sunum.sure(this.value)" class="ml-1 bg-slate-800 rounded px-2 py-1 text-slate-200">${[8, 12, 20, 30].map((s) => `<option value="${s}" ${s === sure ? 'selected' : ''}>${s} sn</option>`).join('')}</select></label>
    <button onclick="Sunum.duraklat()" id="snDur" class="px-3 py-1.5 rounded-md bg-slate-800 text-slate-200 font-semibold">${oynat ? 'Duraklat' : 'Oynat'}</button>
    <button onclick="Sunum.git(-1)" class="px-3 py-1.5 rounded-md bg-slate-800 text-slate-200 font-semibold">Önceki</button><button onclick="Sunum.git(1)" class="px-3 py-1.5 rounded-md bg-slate-800 text-slate-200 font-semibold">Sonraki</button>
    <button onclick="Sunum.tamEkran()" class="px-3 py-1.5 rounded-md bg-amber-500/20 text-amber-300 font-semibold">Tam ekran</button>
    <span class="text-slate-500">Ok tuşları: geçiş, boşluk: duraklat, F: tam ekran. Rakamlar sayfa açıldığında panelin güncel verisinden hesaplanır.</span></div>`;
  function ciz() {
    const el = document.getElementById('sunumIcerik'); if (!el) return;
    if (hata) { el.innerHTML = `<p class="text-sm text-slate-400 p-6">${esc(hata)}</p>`; return; }
    if (!D) { el.innerHTML = '<p class="text-sm text-slate-400 p-6">Ekran döngüsü hazırlanıyor…</p>'; return; }
    if (!document.getElementById('snCss')) { const s = document.createElement('style'); s.id = 'snCss'; s.textContent = CSS; document.head.appendChild(s); }
    kurYt = yatayMi();
    sayfalar = olustur(D);
    el.innerHTML = kont() + `<div id="snKap" class="sn-kap"><div id="snSahne" class="sn-sahne">${sayfalar.map((h, i) => `<div class="sn-sayfa ${i === idx ? 'on' : ''}">${h}</div>`).join('')}<div id="snIlerleme" class="sn-ilerleme"></div></div></div>`;
    kapBoyut(); goster(Math.min(idx, sayfalar.length - 1)); baslat();
  }

  async function ac() {
    const p = oturum();
    if (!D && !yukleniyor) {
      if (!p) { giris(); return; }
      yukleniyor = true; ciz();
      try { await hazirla(p); }
      catch (e) { oturum(null); yukleniyor = false; giris(); return; }
      yukleniyor = false;
    }
    if (D) ciz();
  }

  window.addEventListener('resize', () => { if (document.getElementById('snKap')) kapBoyut(); });
  document.addEventListener('fullscreenchange', () => { setTimeout(kapBoyut, 50); });
  document.addEventListener('keydown', (e) => {
    const tab = document.getElementById('tab-sunum'); if (!tab || tab.classList.contains('hidden') || !sayfalar.length) return;
    if (/INPUT|SELECT|TEXTAREA/.test((e.target.tagName || ''))) return;
    if (e.key === 'ArrowRight') goster(idx + 1); else if (e.key === 'ArrowLeft') goster(idx - 1);
    else if (e.key === ' ') { e.preventDefault(); window.Sunum.duraklat(); } else if (e.key === 'f' || e.key === 'F') window.Sunum.tamEkran();
  });
  window.Sunum = {
    ac,
    dil(d) { L = d; try { localStorage.setItem('sunum_v1_dil', d); } catch (e) { /* kayıt yok */ } if (D) ciz(); },
    yon(k) { yon = k; try { localStorage.setItem('sunum_v1_yon', k); } catch (e) { /* kayıt yok */ } if (D) ciz(); },
    sure(s) { sure = Number(s) || 12; try { localStorage.setItem('sunum_v1_sure', String(sure)); } catch (e) { /* kayıt yok */ } sayac = 0; },
    duraklat() { oynat = !oynat; const b = document.getElementById('snDur'); if (b) b.textContent = oynat ? 'Duraklat' : 'Oynat'; },
    git(n) { goster(idx + n); },
    tamEkran() { const k = document.getElementById('snKap'); if (!k) return; if (document.fullscreenElement) document.exitFullscreen(); else if (k.requestFullscreen) k.requestFullscreen(); },
  };
  // Sayfa doğrudan #sunum ile açıldıysa (dashboard.js bu dosyadan önce çalışır) kendini başlat
  if ((location.hash || '').slice(1) === 'sunum') ac();
})();
