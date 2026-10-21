/* Veri Girişi modülü (Supabase): GES aylık üretim ve aylık inceleme girişi, değişiklik geçmişi.
 * Bağlantı: veridb.js (window.VeriDB, ayar supabase-ayar.js). Tablolar/yetkiler: supabase/kurulum.sql, kurulum adımları: supabase/KURULUM.md.
 * Girilen değerler panelde Excel verisinin üstüne uygulanır (Dash.yenidenYukle). Yazma yalnızca rolü girisci/yonetici olan kullanıcılara açıktır (sunucuda RLS ile zorunlu).
 */
(function () {
  const AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const AY_UZUN = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  let kullanici = null, rolBilgi = null, yil = null, dbSatir = {}, ayInc = null, yilInc = null, incDb = {}, gecmis = [], mesaj = null, girisHatasi = '', yukleniyor = false;
  let dirty = {};      // 'id|ay' -> yeni değer (sayı) ya da null (sil)

  const esc2 = (s) => (typeof esc === 'function' ? esc(s) : String(s ?? ''));
  const norm2 = (s) => String(s || '').toLocaleLowerCase('tr').replace(/[^a-z0-9ğüşıöç]+/g, ' ').trim();
  const sayi = (t) => { const s = String(t ?? '').trim(); if (s === '') return null; const x = s.replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'); const n = Number(x); return isNaN(n) ? NaN : n; };
  const goster = (n) => (n == null ? '' : n.toLocaleString('tr-TR', { maximumFractionDigits: 1, useGrouping: false }).replace('.', ','));
  const veri = () => (window.Dash && Dash.veri() && Dash.veri().PERF) || null;
  const girdi = 'bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-200';
  const dugme = 'px-3 py-1.5 rounded-lg text-xs font-semibold';
  const yazabilir = () => rolBilgi && (rolBilgi.rol === 'girisci' || rolBilgi.rol === 'yonetici');

  function kokEl() { return document.getElementById('veriIcerik'); }

  // ---------- kurulum rehberi (ayar boşsa) ----------
  function kurulumRehberi() {
    return `<div class="glass-card rounded-xl p-6 max-w-3xl space-y-3 text-sm text-slate-300">
      <div class="flex items-center gap-2 text-amber-300 font-semibold"><i data-lucide="database" class="w-4 h-4"></i> Veri Girişi henüz bağlanmadı</div>
      <p>Bu bölüm Supabase (veritabanı + kullanıcı girişi) ile çalışır. Kurulum yaklaşık 15 dakika sürer ve bir kez yapılır:</p>
      <ol class="list-decimal ml-5 space-y-1.5 text-slate-400">
        <li><b class="text-slate-200">supabase.com</b>'da hesap açıp <b class="text-slate-200">New project</b> oluşturun. <b class="text-slate-200">Region: Frankfurt (eu-central-1)</b> seçin.</li>
        <li>Soldaki <b class="text-slate-200">SQL Editor</b> → <b class="text-slate-200">New query</b> → depodaki <code class="text-amber-300">supabase/kurulum.sql</code> dosyasının tamamını yapıştırıp <b class="text-slate-200">Run</b>'a basın.</li>
        <li><b class="text-slate-200">Authentication → Users → Add user</b> ile kendi e-postanızı ve şifrenizi oluşturun (Auto Confirm User işaretli olsun).</li>
        <li>SQL Editor'da dosyanın sonundaki <code class="text-amber-300">insert into public.profiller …</code> satırını e-postanızla çalıştırın (sizi <b class="text-slate-200">yonetici</b> yapar).</li>
        <li><b class="text-slate-200">Project Settings → API</b> sayfasından <b class="text-slate-200">Project URL</b> ve <b class="text-slate-200">anon public</b> anahtarını kopyalayıp bana gönderin (ya da <code class="text-amber-300">supabase-ayar.js</code>'e yazın). <span class="text-rose-300">service_role anahtarını asla paylaşmayın.</span></li></ol>
      <p class="text-[11px] text-slate-500">Ayrıntılı anlatım: <code>supabase/KURULUM.md</code>. Ayar yapılana kadar panel Excel verisiyle çalışmaya devam eder.</p></div>`;
  }

  function girisFormu() {
    return `<form id="veriGiris" class="max-w-sm mx-auto my-8 bg-slate-800/60 border border-slate-700 rounded-xl p-5 space-y-3">
      <div class="flex items-center gap-2 text-amber-300 font-semibold"><i data-lucide="log-in" class="w-4 h-4"></i> Veri girişi — kullanıcı girişi</div>
      <input id="veriEposta" type="email" autocomplete="username" class="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm" placeholder="E-posta" />
      <input id="veriSifre" type="password" autocomplete="current-password" class="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm" placeholder="Şifre" />
      <p class="text-xs text-rose-400 ${girisHatasi ? '' : 'hidden'}">${esc2(girisHatasi)}</p>
      <button class="w-full bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold rounded-lg py-2 text-sm">Giriş</button>
      <p class="text-[11px] text-slate-500">Hesabı sistem yöneticisi oluşturur. Bu giriş, Elektrik/ISO sekmelerinin parolasından ayrıdır.</p></form>`;
  }

  // ---------- GES aylık üretim ----------
  function uretimTablosu(P) {
    const yillar = []; for (let y = P.son_donem.yil; y >= 2019; y--) yillar.push(y);
    const hucre = (s, i) => {
      const k = s.id + '|' + (i + 1), v = (s.aylik[String(yil)] || [])[i], d = k in dirty, db = (s.id + '|' + yil + '|' + (i + 1)) in dbSatir;
      const goruntu = d ? (dirty[k] == null ? '' : goster(dirty[k])) : (v ? goster(v) : '');
      return `<td class="px-0.5 py-0.5"><input data-k="${k}" value="${goruntu}" inputmode="decimal" class="w-full text-right font-mono text-[11px] bg-slate-900 border rounded px-1.5 py-1 ${d ? 'border-amber-400 bg-amber-500/10' : db ? 'border-cyan-500/50' : 'border-slate-800'}" style="min-width:4.6rem" ${yazabilir() ? '' : 'disabled'}></td>`;
    };
    const adet = Object.keys(dirty).length;
    return `<div class="flex flex-wrap items-center gap-3 mb-3">
        <label class="text-xs text-slate-400">Yıl <select onchange="Veri.yilSec(this.value)" class="${girdi} ml-1">${yillar.map((y) => `<option ${y === yil ? 'selected' : ''}>${y}</option>`).join('')}</select></label>
        <span class="text-[11px] text-slate-500"><span class="inline-block w-2.5 h-2.5 rounded-sm border border-cyan-500/60 align-middle"></span> veritabanında girilmiş &nbsp; <span class="inline-block w-2.5 h-2.5 rounded-sm border border-amber-400 bg-amber-500/20 align-middle"></span> kaydedilmemiş &nbsp; boş kutu = veri yok (Excel'deki değer varsa gösterilir)</span>
        ${yazabilir() ? `<button onclick="Veri.kaydet()" class="${dugme} ml-auto ${adet ? 'bg-amber-500 text-slate-900 hover:bg-amber-400' : 'bg-slate-800 text-slate-500'}" ${adet ? '' : 'disabled'}>Kaydet (${adet})</button>` : ''}</div>
      <div class="overflow-x-auto"><table class="w-full text-xs"><thead><tr class="text-slate-400"><th class="px-2 py-1 text-left sticky left-0 bg-slate-900">Santral (kWh)</th>${AY.map((a) => `<th class="px-1 py-1 text-right">${a}</th>`).join('')}<th class="px-2 py-1 text-right">Toplam</th></tr></thead><tbody>
      ${P.santraller.map((s) => `<tr class="border-t border-slate-800/60"><td class="px-2 py-1 text-slate-200 sticky left-0 bg-slate-900 whitespace-nowrap">${esc2(s.ad)} <span class="text-slate-600">${s.kw} kW</span></td>${AY.map((_, i) => hucre(s, i)).join('')}
        <td class="px-2 py-1 text-right font-mono text-slate-400">${(() => { let t = 0; for (let i = 0; i < 12; i++) { const k = s.id + '|' + (i + 1); t += k in dirty ? dirty[k] || 0 : (s.aylik[String(yil)] || [])[i] || 0; } return Math.round(t).toLocaleString('tr-TR'); })()}</td></tr>`).join('')}</tbody></table></div>
      ${yazabilir() ? `<details class="mt-4"><summary class="cursor-pointer text-xs text-slate-300">Excel'den yapıştır</summary>
        <p class="text-[11px] text-slate-500 my-2">Excel'de “santral adı + 12 aylık değer” satırlarını kopyalayıp aşağıya yapıştırın; ilk sütun santral adı olmalı (${yil} yılına yazılır). Önce tabloya aktarılır, sonra <b>Kaydet</b>'e basarsınız.</p>
        <textarea id="veriYapistir" rows="5" class="${girdi} w-full font-mono" placeholder="Seyrek Hayvan Hastanesi&#9;27762,5&#9;28750,3&#9;…"></textarea>
        <button onclick="Veri.yapistir()" class="${dugme} bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 mt-2">Tabloya aktar</button></details>` : ''}`;
  }

  // ---------- aylık inceleme ----------
  function incelemeTablosu(P) {
    const yillar = []; for (let y = P.son_donem.yil; y >= 2019; y--) yillar.push(y);
    const kayit = (s) => incDb[s.id] || {};
    const alan = (s, a, tur) => `<td class="px-0.5 py-0.5"><input data-inc="${s.id}|${a}" ${tur === 'n' ? 'type="number" min="0"' : ''} value="${esc2(kayit(s)[a] ?? (tur === 'n' ? 0 : ''))}" class="${girdi} w-full ${tur === 'n' ? 'text-right font-mono' : ''}" style="min-width:${tur === 'n' ? '3.6rem' : '9rem'}" ${yazabilir() ? '' : 'disabled'}></td>`;
    return `<div class="flex flex-wrap items-center gap-3 mb-3">
        <label class="text-xs text-slate-400">Dönem <select onchange="Veri.incDonem(this.value, null)" class="${girdi} ml-1">${yillar.map((y) => `<option ${y === yilInc ? 'selected' : ''}>${y}</option>`).join('')}</select>
        <select onchange="Veri.incDonem(null, this.value)" class="${girdi}">${AY_UZUN.map((a, i) => `<option value="${i + 1}" ${i + 1 === ayInc ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
        ${yazabilir() ? `<button onclick="Veri.incKaydet()" class="${dugme} ml-auto bg-amber-500 text-slate-900 hover:bg-amber-400">Bu dönemi kaydet</button>` : ''}</div>
      <div class="overflow-x-auto"><table class="w-full text-xs"><thead><tr class="text-slate-400"><th class="px-2 py-1 text-left">Santral</th><th class="px-1 py-1">Hataya düşme</th><th class="px-1 py-1">Bekleme</th><th class="px-1 py-1">İzleme dışı</th><th class="px-1 py-1">Üretimsiz gün</th><th class="px-1 py-1 text-left">Tarih(ler)</th><th class="px-1 py-1 text-left">Neden</th></tr></thead><tbody>
      ${P.santraller.map((s) => `<tr class="border-t border-slate-800/60"><td class="px-2 py-1 text-slate-200 whitespace-nowrap">${esc2(s.ad)}</td>${alan(s, 'hataya_dusme', 'n')}${alan(s, 'bekleme', 'n')}${alan(s, 'izleme_disi', 'n')}${alan(s, 'uretimsiz_gun', 'n')}${alan(s, 'tarih', 't')}${alan(s, 'neden', 't')}</tr>`).join('')}</tbody></table></div>
      <p class="text-[11px] text-slate-500 mt-2">Seçili dönem panelin son dönemiyse “Arıza Takip” sekmesi bu satırları gösterir. Dönemi kaydetmek tüm santraller için satır oluşturur.</p>`;
  }

  function gecmisTablosu() {
    if (!gecmis.length) return '<p class="text-xs text-slate-500">Henüz kayıt yok.</p>';
    return `<div class="overflow-x-auto"><table class="w-full text-xs"><thead><tr class="text-slate-400"><th class="px-2 py-1 text-left">Zaman</th><th class="px-2 py-1 text-left">Tablo</th><th class="px-2 py-1 text-left">İşlem</th><th class="px-2 py-1 text-left">Kayıt</th><th class="px-2 py-1 text-right">Eski</th><th class="px-2 py-1 text-right">Yeni</th></tr></thead><tbody>
      ${gecmis.map((g) => { const e = g.eski && (g.eski.uretim_kwh ?? JSON.stringify({ h: g.eski.hataya_dusme, u: g.eski.uretimsiz_gun })), y = g.yeni && (g.yeni.uretim_kwh ?? JSON.stringify({ h: g.yeni.hataya_dusme, u: g.yeni.uretimsiz_gun }));
        return `<tr class="border-t border-slate-800/60"><td class="px-2 py-1 text-slate-400 whitespace-nowrap">${new Date(g.zaman).toLocaleString('tr-TR')}</td><td class="px-2 py-1">${esc2(g.tablo)}</td><td class="px-2 py-1">${esc2(g.islem)}</td><td class="px-2 py-1 font-mono">${esc2(g.anahtar)}</td><td class="px-2 py-1 text-right font-mono text-slate-500">${esc2(e ?? '')}</td><td class="px-2 py-1 text-right font-mono">${esc2(y ?? '')}</td></tr>`; }).join('')}</tbody></table></div>`;
  }

  const bolum = (baslik, aciklama, govde, acik) => `<details ${acik ? 'open' : ''} class="group glass-card rounded-xl overflow-hidden"><summary class="cursor-pointer select-none p-4 flex flex-wrap items-center gap-x-3 gap-y-1 hover:bg-slate-800/40" style="list-style:none"><span class="text-slate-400 inline-block transition-transform group-open:rotate-90">▸</span><h2 class="text-sm font-semibold text-white">${baslik}</h2><span class="text-[11px] text-slate-500">${aciklama}</span></summary><div class="border-t border-slate-800 p-4">${govde}</div></details>`;

  function ciz() {
    const kok = kokEl(); if (!kok) return;
    const P = veri();
    if (!window.VeriDB || !VeriDB.hazir()) { kok.innerHTML = kurulumRehberi(); if (window.lucide) lucide.createIcons(); return; }
    if (!VeriDB.oturum()) {
      kok.innerHTML = girisFormu(); if (window.lucide) lucide.createIcons();
      document.getElementById('veriGiris').onsubmit = async (ev) => {
        ev.preventDefault();
        try { girisHatasi = ''; kullanici = await VeriDB.giris(document.getElementById('veriEposta').value.trim(), document.getElementById('veriSifre').value); await acilis(); } catch (e) { girisHatasi = /invalid|credentials/i.test(e.message) ? 'E-posta veya şifre yanlış.' : 'Giriş yapılamadı: ' + e.message; ciz(); }
      };
      return;
    }
    if (!P) { kok.innerHTML = '<p class="text-sm text-slate-400 p-6">Panel verisi yükleniyor…</p>'; return; }
    if (yil == null) yil = P.son_donem.yil;
    if (yilInc == null) { yilInc = P.son_donem.yil; ayInc = P.son_donem.ay; }
    const e = VeriDB.oturum().user.email;
    kok.innerHTML = `<div class="space-y-4">
      <div class="glass-card rounded-xl px-4 py-3 flex flex-wrap items-center gap-3 text-xs"><i data-lucide="user" class="w-4 h-4 text-slate-400"></i><span class="text-slate-200">${esc2(e)}</span>
        <span class="px-2 py-0.5 rounded-full border ${yazabilir() ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10' : 'border-slate-600 text-slate-400'}">${esc2(rolBilgi && rolBilgi.rol ? rolBilgi.rol : 'rol atanmamış')}</span>
        ${yazabilir() ? '' : '<span class="text-amber-300">Veri girmek için yönetici size “girisci” rolü vermeli.</span>'}
        <button onclick="Veri.cikis()" class="${dugme} ml-auto bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200">Çıkış</button></div>
      ${mesaj ? `<div class="rounded-lg px-4 py-2 text-xs ${mesaj.tur === 'hata' ? 'bg-rose-500/10 border border-rose-500/30 text-rose-300' : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'}">${esc2(mesaj.metin)}</div>` : ''}
      ${bolum('GES aylık üretim', 'kWh, santral × ay', uretimTablosu(P), true)}
      ${bolum('GES aylık inceleme (arıza takip)', 'hataya düşme, bekleme, izleme dışı, üretimsiz gün', incelemeTablosu(P), false)}
      ${yazabilir() ? bolum('Değişiklik geçmişi', 'son 40 kayıt: kim ne zaman neyi değiştirdi', gecmisTablosu(), false) : ''}</div>`;
    if (window.lucide) lucide.createIcons();
    kok.querySelectorAll('input[data-k]').forEach((el) => el.addEventListener('change', () => {
      const [id, ay] = el.dataset.k.split('|'), n = sayi(el.value), s = P.santraller.find((x) => x.id === id);
      const sinir = s.kw * 24 * 31 * 0.5;     // fiziksel olarak mümkün olmayan değerleri engelle
      if (Number.isNaN(n) || (n != null && (n < 0 || n > sinir))) { mesaj = { tur: 'hata', metin: `${s.ad} ${AY[ay - 1]}: geçersiz değer (en çok ${Math.round(sinir).toLocaleString('tr-TR')} kWh olabilir).` }; ciz(); return; }
      mesaj = null; dirty[el.dataset.k] = n; ciz();
    }));
  }

  async function yukleDb() {
    // Yıl satırları (hangi hücreler veritabanında), inceleme satırları, geçmiş
    dbSatir = {}; incDb = {};
    try {
      const u = await VeriDB.istek(`/rest/v1/ges_aylik_uretim?select=santral_id,yil,ay&yil=eq.${yil}&limit=2000`);
      (u || []).forEach((r) => { dbSatir[r.santral_id + '|' + r.yil + '|' + r.ay] = 1; });
      const ic = await VeriDB.istek(`/rest/v1/ges_aylik_inceleme?select=*&yil=eq.${yilInc}&ay=eq.${ayInc}`);
      (ic || []).forEach((r) => { incDb[r.santral_id] = r; });
      if (!Object.keys(incDb).length) { const P = veri(); if (P && P.ariza && P.son_donem.yil === yilInc && P.son_donem.ay === ayInc) P.ariza.satirlar.forEach((r) => { incDb[r.id] = r; }); }
      if (yazabilir()) gecmis = (await VeriDB.istek('/rest/v1/degisiklik_gecmisi?select=*&order=zaman.desc&limit=40')) || [];
    } catch (e) { mesaj = { tur: 'hata', metin: 'Veritabanından okunamadı: ' + e.message }; }
  }

  async function acilis() {
    rolBilgi = await VeriDB.rol();
    const P = veri(); if (P) { yil = yil == null ? P.son_donem.yil : yil; if (yilInc == null) { yilInc = P.son_donem.yil; ayInc = P.son_donem.ay; } }
    await yukleDb(); ciz();
  }

  async function ac() {
    if (!window.VeriDB || !VeriDB.hazir()) { ciz(); return; }
    if (VeriDB.oturum() && !rolBilgi) { await acilis(); return; }
    if (VeriDB.oturum()) { await yukleDb(); }
    ciz();
  }

  window.Veri = {
    ac,
    cikis() { VeriDB.cikis(); rolBilgi = null; dirty = {}; mesaj = null; ciz(); },
    async yilSec(v) { if (Object.keys(dirty).length && !confirm('Kaydedilmemiş değişiklikler silinecek. Devam edilsin mi?')) { ciz(); return; } yil = Number(v); dirty = {}; mesaj = null; await yukleDb(); ciz(); },
    yapistir() {
      const P = veri(), metin = document.getElementById('veriYapistir').value, bulunamayan = []; let aktarilan = 0;
      metin.split(/\r?\n/).forEach((satir) => {
        if (!satir.trim()) return;
        const p = satir.split('\t'); const s = P.santraller.find((x) => norm2(x.ad) === norm2(p[0]) || norm2(x.id.replace(/-/g, ' ')) === norm2(p[0]));
        if (!s) { bulunamayan.push(p[0]); return; }
        p.slice(1, 13).forEach((h, i) => { const n = sayi(h); if (n != null && !Number.isNaN(n) && n >= 0) { dirty[s.id + '|' + (i + 1)] = n; aktarilan++; } });
      });
      mesaj = { tur: bulunamayan.length ? 'hata' : 'ok', metin: `${aktarilan} hücre tabloya aktarıldı. ${bulunamayan.length ? 'Eşleşmeyen santral adı: ' + bulunamayan.join(', ') + '. ' : ''}Kaydet'e basarak veritabanına yazın.` };
      ciz();
    },
    async kaydet() {
      if (yukleniyor) return; yukleniyor = true;
      try {
        const yaz = [], sil = [];
        Object.entries(dirty).forEach(([k, v]) => { const [id, ay] = k.split('|'); if (v == null) { if ((id + '|' + yil + '|' + ay) in dbSatir) sil.push({ id, ay }); } else yaz.push({ santral_id: id, yil, ay: Number(ay), uretim_kwh: v }); });
        if (yaz.length) await VeriDB.istek('/rest/v1/ges_aylik_uretim?on_conflict=santral_id,yil,ay', { method: 'POST', body: yaz, prefer: 'resolution=merge-duplicates,return=minimal' });
        for (const s of sil) await VeriDB.istek(`/rest/v1/ges_aylik_uretim?santral_id=eq.${s.id}&yil=eq.${yil}&ay=eq.${s.ay}`, { method: 'DELETE' });
        dirty = {}; mesaj = { tur: 'ok', metin: `${yaz.length} değer kaydedildi${sil.length ? `, ${sil.length} değer silindi (Excel verisine dönüldü)` : ''}.` };
        await yukleDb(); if (window.Dash) await Dash.yenidenYukle();
      } catch (e) { mesaj = { tur: 'hata', metin: 'Kaydedilemedi: ' + e.message }; }
      yukleniyor = false; ciz();
    },
    async incDonem(y, a) { if (y) yilInc = Number(y); if (a) ayInc = Number(a); mesaj = null; await yukleDb(); ciz(); },
    async incKaydet() {
      const P = veri(), satirlar = P.santraller.map((s) => {
        const al = (a, n) => { const el = document.querySelector(`[data-inc="${s.id}|${a}"]`); return n ? Math.max(0, parseInt(el.value) || 0) : (el.value.trim() || null); };
        return { santral_id: s.id, yil: yilInc, ay: ayInc, hataya_dusme: al('hataya_dusme', 1), bekleme: al('bekleme', 1), izleme_disi: al('izleme_disi', 1), uretimsiz_gun: Math.min(31, al('uretimsiz_gun', 1)), tarih: al('tarih'), neden: al('neden') };
      });
      try {
        await VeriDB.istek('/rest/v1/ges_aylik_inceleme?on_conflict=santral_id,yil,ay', { method: 'POST', body: satirlar, prefer: 'resolution=merge-duplicates,return=minimal' });
        mesaj = { tur: 'ok', metin: `${AY_UZUN[ayInc - 1]} ${yilInc} incelemesi kaydedildi (${satirlar.length} santral).` };
        await yukleDb(); if (window.Dash) await Dash.yenidenYukle();
      } catch (e) { mesaj = { tur: 'hata', metin: 'Kaydedilemedi: ' + e.message }; }
      ciz();
    },
    yenile() { if (kokEl() && kokEl().children.length) ciz(); },
  };
  if ((location.hash || '').slice(1) === 'veri') ac();
})();
