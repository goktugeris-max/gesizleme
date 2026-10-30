/* Supabase (PostgREST + GoTrue) ile sade bağlantı — SDK gerektirmez. dashboard.js'ten ÖNCE yüklenir.
 * Panel verisi açılışta Excel tabanlı performans.json'dur; veritabanında girilmiş aylık üretim/inceleme satırları onun üstüne uygulanır (birlestir).
 * Ayar: supabase-ayar.js (window.SUPABASE). Ayarlı değilse ya da ulaşılamazsa panel sessizce yalnızca Excel verisini kullanır.
 */
(function () {
  const AY_UST = ['OCAK', 'ŞUBAT', 'MART', 'NİSAN', 'MAYIS', 'HAZİRAN', 'TEMMUZ', 'AĞUSTOS', 'EYLÜL', 'EKİM', 'KASIM', 'ARALIK'];
  const A = () => window.SUPABASE || {};
  const hazir = () => !!(A().url && A().anonKey);
  const depo = (k, v) => { try { return v === undefined ? sessionStorage.getItem(k) : (v === null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v)); } catch (e) { return null; } };
  let oturum = null;
  try { oturum = JSON.parse(depo('sb_oturum') || 'null'); } catch (e) { oturum = null; }

  function kaydet(o) {
    oturum = o && { access_token: o.access_token, refresh_token: o.refresh_token, expires_at: Date.now() + (o.expires_in || 3600) * 1000 - 30000, user: o.user && { id: o.user.id, email: o.user.email } };
    depo('sb_oturum', oturum ? JSON.stringify(oturum) : null);
  }

  async function ham(yol, { method = 'GET', body, prefer, token, zamanasimi = 15000 } = {}) {
    const k = new AbortController(), t = setTimeout(() => k.abort(), zamanasimi);
    try {
      const r = await fetch(A().url.replace(/\/$/, '') + yol, {
        method, signal: k.signal,
        // Yeni tip "publishable" anahtarlar JWT değildir: yalnızca apikey başlığıyla gönderilir; Authorization sadece giriş yapmış kullanıcının jetonu için eklenir
        headers: Object.assign({ apikey: A().anonKey, 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}, prefer ? { Prefer: prefer } : {}),
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const metin = await r.text();
      let js = null; try { js = metin ? JSON.parse(metin) : null; } catch (e) { js = metin; }
      if (!r.ok) { const e = new Error((js && (js.message || js.msg || js.error_description || js.error)) || 'HTTP ' + r.status); e.durum = r.status; throw e; }
      return js;
    } finally { clearTimeout(t); }
  }

  async function giris(email, sifre) {
    const o = await ham('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password: sifre } });
    kaydet(o);
    return oturum.user;
  }
  async function yenile() {
    if (!oturum || !oturum.refresh_token) return false;
    try { kaydet(await ham('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: oturum.refresh_token } })); return true; } catch (e) { kaydet(null); return false; }
  }
  function cikis() { kaydet(null); }
  async function jeton() {
    if (!oturum) return null;
    if (Date.now() > oturum.expires_at && !(await yenile())) return null;
    return oturum.access_token;
  }
  // Oturumlu istek (yazma ve korumalı okuma)
  async function istek(yol, ayar) {
    const t = await jeton();
    if (!t) throw Object.assign(new Error('Oturum süresi doldu, yeniden giriş yapın.'), { durum: 401 });
    return ham(yol, Object.assign({}, ayar, { token: t }));
  }
  async function rol() {
    if (!oturum) return null;
    try { const l = await istek('/rest/v1/profiller?select=rol,ad&limit=1'); return l && l[0] ? l[0] : { rol: null }; } catch (e) { return { rol: null, hata: e.message }; }
  }

  // Excel tabanlı PERF nesnesinin üstüne veritabanı satırlarını uygular
  async function birlestir(PERF) {
    if (!hazir()) return PERF;
    try {
      const satirlar = await ham('/rest/v1/ges_aylik_uretim?select=santral_id,yil,ay,uretim_kwh&limit=20000', { zamanasimi: 7000 });
      if (!Array.isArray(satirlar) || !satirlar.length) return PERF;
      const harita = new Map(PERF.santraller.map((s) => [s.id, s])), yillar = new Set(), degisen = new Map();
      satirlar.forEach((r) => {
        const s = harita.get(r.santral_id), ay = Number(r.ay), kwh = Number(r.uretim_kwh);
        if (!s || !Number.isInteger(ay) || ay < 1 || ay > 12 || !Number.isFinite(kwh)) return;
        const y = String(r.yil); if (!s.aylik[y]) s.aylik[y] = Array(12).fill(null);
        s.aylik[y][ay - 1] = kwh; yillar.add(y); degisen.set(s.id + '|' + y, [s, y]);
      });
      degisen.forEach(([s, y]) => { s.yillik = s.yillik || {}; s.yillik[y] = s.aylik[y].reduce((t, v) => t + (v || 0), 0); });
      // Son dönem: santrallerin en az %70'inde verisi olan en son ay (Excel'in son dönemini yalnızca ileri taşır)
      const esik = Math.ceil(PERF.santraller.length * 0.7);
      let en = PERF.son_donem.yil * 12 + PERF.son_donem.ay - 1;
      [...yillar].map(Number).forEach((y) => { for (let i = 0; i < 12; i++) { const n = PERF.santraller.filter((s) => ((s.aylik[String(y)] || [])[i] || 0) > 0).length; if (n >= esik && y * 12 + i > en) en = y * 12 + i; } });
      PERF.son_donem = { yil: Math.floor(en / 12), ay: (en % 12) + 1 };
      PERF.veritabani_satir = satirlar.length;
      // Son döneme ait inceleme (arıza takip) satırları
      try {
        const ins = await ham(`/rest/v1/ges_aylik_inceleme?select=*&yil=eq.${PERF.son_donem.yil}&ay=eq.${PERF.son_donem.ay}`, { zamanasimi: 7000 });
        if (Array.isArray(ins) && ins.length && PERF.ariza) {
          PERF.ariza.satirlar = ins.filter((r) => harita.has(r.santral_id)).map((r) => ({ id: r.santral_id, ad: harita.get(r.santral_id).ad, hataya_dusme: r.hataya_dusme, bekleme: r.bekleme, izleme_disi: r.izleme_disi, uretimsiz_gun: r.uretimsiz_gun, tarih: r.tarih, neden: r.neden }));
          PERF.ariza.donem = `${AY_UST[PERF.son_donem.ay - 1]} (${PERF.son_donem.yil})`;
        }
      } catch (e) { /* inceleme tablosu yoksa yok say */ }
    } catch (e) { console.warn('Veritabanı verisi alınamadı, Excel verisi kullanılıyor:', e.message); }
    return PERF;
  }

  // ---- Dosya deposu (Supabase Storage): özel kova, oturumlu istek ----
  const yolKodla = (y) => y.split('/').map(encodeURIComponent).join('/');
  async function dosyaYukle(kova, yol, dosya) {
    const t = await jeton();
    if (!t) throw Object.assign(new Error('Oturum süresi doldu, yeniden giriş yapın.'), { durum: 401 });
    const r = await fetch(A().url.replace(/\/$/, '') + '/storage/v1/object/' + kova + '/' + yolKodla(yol), {
      method: 'POST', headers: { apikey: A().anonKey, Authorization: 'Bearer ' + t, 'Content-Type': dosya.type || 'application/octet-stream', 'x-upsert': 'false' }, body: dosya,
    });
    if (!r.ok) { let m = ''; try { m = (await r.json()).message || ''; } catch (e) { /* gövde yok */ } throw new Error(m || 'Dosya yüklenemedi (HTTP ' + r.status + ')'); }
  }
  // Kısa ömürlü (2 dk) imzalı indirme adresi
  async function dosyaAdresi(kova, yol) {
    const y = await istek('/storage/v1/object/sign/' + kova + '/' + yolKodla(yol), { method: 'POST', body: { expiresIn: 120 } });
    if (!y || !y.signedURL) throw new Error('İndirme adresi alınamadı');
    return A().url.replace(/\/$/, '') + '/storage/v1' + y.signedURL;
  }

  window.VeriDB = { hazir, giris, cikis, istek, rol, birlestir, dosyaYukle, dosyaAdresi, oturum: () => oturum, url: () => A().url };
})();
