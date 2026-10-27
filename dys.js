/* Doküman Yönetim Sistemi (DYS) — ISO 50001 "dokümante edilmiş bilginin kontrolü" (İBB-PR-07-01).
 * ISO 50001 sekmesinde "Belgeler" alt sekmesi (iso.js → Dys.panel(el)). Kurumda tek doküman listesi vardır (tesise bağlı değildir).
 *
 * Esas: resmî sürüm, EBYS'de imzalanan PDF'tir. Doküman ancak imzalı PDF + EBYS evrak sayısı yüklenince "Yürürlükte" olur;
 * önceki revizyon arşive kalkar (erişimi yalnız yöneticiye açık). Yüklenen dosya ve olay kayıtları değiştirilemez.
 * Veri Supabase'tedir (supabase/dys.sql; tablolar anon'a kapalı); depoya/GitHub'a doküman, isim ya da dosya YAZILMAZ.
 * Roller: okuyucu = görür; girisci = doküman/revizyon açar, kontrole gönderir, imzalı PDF yükler; yonetici (Ekip Lideri) = onaya alır, yürürlüğe alır, iptal eder.
 */
(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TURLER = ['El Kitabı', 'Politika', 'Yönerge', 'Prosedür', 'Talimat', 'Form', 'Plan', 'Liste', 'Rehber', 'Rapor', 'Proses', 'Dış Kaynaklı Doküman', 'Diğer'];
  const TUR_KISA = { 'El Kitabı': 'EL', 'Prosedür': 'PR', 'Talimat': 'TLM', 'Form': 'FRM', 'Plan': 'PLN', 'Liste': 'LST', 'Rapor': 'RPR', 'Politika': 'PL', 'Proses': 'PSS', 'Rehber': 'RHB', 'Yönerge': 'YNG', 'Dış Kaynaklı Doküman': 'DIS', 'Diğer': 'DGR' };
  const SUREC_AD = { taslak: 'Taslak', kontrolde: 'Kontrolde', onayda: 'Onayda', ebys_imzada: 'EBYS imzasında' };
  const SUREC_SIRA = ['taslak', 'kontrolde', 'onayda', 'ebys_imzada'];
  const ROZET = {
    yururlukte: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', iptal: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
    taslak: 'bg-slate-500/15 text-slate-300 border-slate-500/30', kontrolde: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
    onayda: 'bg-amber-500/15 text-amber-400 border-amber-500/30', ebys_imzada: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
  };
  const BUGUN = () => new Date().toISOString().slice(0, 10);
  const tarih = (d) => (d ? d.split('-').reverse().join('.') : '—');
  const rozet = (k, ad) => `<span class="text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap ${ROZET[k] || ROZET.taslak}">${esc(ad)}</span>`;

  let B = [], R = {}, rol = null, kap = null, secili = null, yukleniyor = false, hata = null, olaylar = [];
  const F = { ara: '', tur: '', durum: '' };
  const yazabilir = () => !!rol && ['girisci', 'yonetici'].includes(rol.rol);
  const yonetici = () => !!rol && rol.rol === 'yonetici';
  const rest = (yol, ayar) => VeriDB.istek('/rest/v1/' + yol, ayar);
  const kodQ = (k) => encodeURIComponent(k);

  // ---------- veri ----------
  async function yukle() {
    yukleniyor = true; hata = null;
    try {
      if (!rol) rol = await VeriDB.rol();
      const [b, r] = await Promise.all([rest('dys_belge?select=*&order=kod'), rest('dys_revizyon?select=*&order=belge_kod,rev_no')]);
      B = b || []; R = {};
      (r || []).forEach((x) => { (R[x.belge_kod] = R[x.belge_kod] || []).push(x); });
    } catch (e) {
      B = []; R = {};
      hata = /relation|does not exist|42P01|schema cache|dys_/i.test(e.message) ? 'Doküman tabloları kurulmamış görünüyor: supabase/dys.sql dosyasını Supabase SQL Editor\'de bir kez çalıştırın.' : 'Veri okunamadı: ' + e.message;
    } finally { yukleniyor = false; }
  }

  // ---------- türetilen bilgiler ----------
  const guncel = (k) => (R[k] || []).find((x) => x.durum === 'yururlukte');
  const taslakRev = (k) => (R[k] || []).filter((x) => x.durum === 'taslak').slice(-1)[0];
  function gosterDurum(b) {
    if (b.durum === 'iptal') return { k: 'iptal', ad: 'İptal' };
    const g = guncel(b.kod), t = taslakRev(b.kod);
    if (g) return { k: 'yururlukte', ad: 'Yürürlükte', ek: t ? `Rev ${t.rev_no} ${SUREC_AD[t.surec].toLowerCase()}` : '' };
    if (t) return { k: t.surec, ad: SUREC_AD[t.surec] };
    return { k: 'taslak', ad: 'Taslak' };
  }
  function gozdenGecirmeGec(b) {
    const g = guncel(b.kod); if (!g || b.durum === 'iptal') return false;
    const ref = [b.gozden_gecirme, b.revizyon_tarihi, b.yayin_tarihi, g.revizyon_tarihi, g.yayin_tarihi].filter(Boolean).sort().pop();
    return !ref || (Date.now() - new Date(ref).getTime()) / 86400000 > 365;   // prosedür 4.5: yılda bir (yılın son EGG toplantısı)
  }
  const imzaBekliyor = (b) => { const g = guncel(b.kod); return !!g && !g.dosya_yolu && b.durum !== 'iptal'; };

  // ---------- liste ----------
  function suzulmus() {
    const a = F.ara.toLocaleLowerCase('tr');
    return B.filter((b) => {
      if (F.tur && b.tur !== F.tur) return false;
      const d = gosterDurum(b);
      if (F.durum === 'imza' && !imzaBekliyor(b)) return false;
      if (F.durum === 'gecikmis' && !gozdenGecirmeGec(b)) return false;
      if (F.durum === 'surecte' && !(taslakRev(b.kod) && taslakRev(b.kod).surec !== 'taslak')) return false;
      if (['yururlukte', 'taslak', 'iptal'].includes(F.durum) && d.k !== F.durum) return false;
      return !a || (b.kod + ' ' + b.ad + ' ' + (b.sahip || '')).toLocaleLowerCase('tr').includes(a);
    });
  }

  function kart(b, v, alt, renk, filtre) {
    return `<button onclick="Dys.suz('${filtre || ''}')" class="glass-card rounded-xl p-3 text-left ${F.durum === (filtre || '') && filtre ? 'border border-amber-500/50' : 'border border-transparent'}"><div class="text-[10px] uppercase tracking-wider text-slate-400">${b}</div><div class="text-xl font-bold mt-0.5 ${renk || 'text-white'}">${v}</div><div class="text-[11px] text-slate-500 mt-0.5">${alt}</div></button>`;
  }

  function ciz() {
    if (!kap || !document.body.contains(kap)) return;
    if (!window.VeriDB || !VeriDB.hazir()) { kap.innerHTML = bos('Supabase ayarı yok (supabase-ayar.js). Doküman sistemi veritabanı gerektirir.'); return ikon(); }
    if (!VeriDB.oturum()) { kap.innerHTML = bos('Doküman yönetim sistemi yalnız giriş yapmış kullanıcılara açıktır. Önce Veri Girişi hesabınızla giriş yapın.', true); return ikon(); }
    if (hata) { kap.innerHTML = bos(esc(hata)); return ikon(); }
    if (yukleniyor && !B.length) { kap.innerHTML = '<div class="text-sm text-slate-400 p-4">Yükleniyor…</div>'; return; }
    const yur = B.filter((b) => gosterDurum(b).k === 'yururlukte'), liste = suzulmus();
    const imza = B.filter(imzaBekliyor).length, gec = B.filter(gozdenGecirmeGec).length;
    const surecte = B.filter((b) => taslakRev(b.kod) && taslakRev(b.kod).surec !== 'taslak').length;
    kap.innerHTML = `
      <div class="flex flex-wrap items-center gap-2">
        <div class="mr-auto"><h3 class="text-base font-bold text-white">Dokümanlar</h3><p class="text-[11px] text-slate-500">İBB-PR-07-01 · resmî sürüm = EBYS'de imzalı PDF · ${esc((rol && rol.ad) || '')} ${rol && rol.rol ? '(' + esc(rol.rol) + ')' : ''}</p></div>
        ${yazabilir() ? '<button onclick="Dys.yeni()" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">+ Yeni doküman</button>' : ''}
        ${yonetici() ? '<button onclick="Dys.iceAktar()" class="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-600 text-slate-300">Listeden içe aktar</button>' : ''}
        ${yonetici() ? '<button onclick="Dys.topluGozden()" title="Yürürlükteki tüm dokümanlara gözden geçirme tarihi yazar (ör. yılın son Enerji Gözden Geçirme toplantısı)" class="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-600 text-slate-300">Toplu gözden geçirme kaydı</button>' : ''}
        <button onclick="Dys.csv()" class="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-600 text-slate-300">Doküman Listesi (LST.07.03) CSV</button>
      </div>
      <div id="dysMsg" class="hidden text-xs rounded-lg px-3 py-2"></div>
      <div class="grid grid-cols-2 lg:grid-cols-5 gap-3 mt-3">
        ${kart('Doküman', B.length, 'kayıtlı', '', '')}
        ${kart('Yürürlükte', yur.length, 'güncel revizyonla', 'text-emerald-400', 'yururlukte')}
        ${kart('Onay sürecinde', surecte, 'kontrol · onay · EBYS', surecte ? 'text-sky-300' : '', 'surecte')}
        ${kart('İmzalı PDF bekleyen', imza, 'yürürlükte ama dosya yok', imza ? 'text-amber-400' : 'text-emerald-400', 'imza')}
        ${kart('Gözden geçirme', gec, 'son 12 ayda gözden geçirilmedi', gec ? 'text-rose-400' : 'text-emerald-400', 'gecikmis')}
      </div>
      <div class="flex flex-wrap gap-2 mt-3">
        <input id="dysAra" value="${esc(F.ara)}" placeholder="Kod, ad veya sahip ara…" oninput="Dys.ara(this.value)" class="flex-1 min-w-[12rem] bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100" />
        <select onchange="Dys.tur(this.value)" class="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-100"><option value="">Tüm türler</option>${TURLER.map((t) => `<option ${F.tur === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
        ${F.durum ? `<button onclick="Dys.suz('')" class="px-2.5 py-1.5 rounded-lg text-[11px] border border-amber-500/40 text-amber-300">Süzgeç: ${esc({ imza: 'imzalı PDF bekleyen', gecikmis: 'gözden geçirme', surecte: 'onay sürecinde', yururlukte: 'yürürlükte', taslak: 'taslak', iptal: 'iptal' }[F.durum])} ✕</button>` : ''}
      </div>
      <div class="glass-card rounded-xl overflow-hidden mt-3"><div class="overflow-x-auto"><table class="w-full text-xs" style="min-width:760px">
        <thead class="text-slate-400 uppercase tracking-wider text-[10px]"><tr><th class="px-3 py-2 text-left">Kod</th><th class="px-3 text-left">Doküman adı</th><th class="px-3 text-left">Tür</th><th class="px-3 text-center">Rev</th><th class="px-3 text-left">Revizyon tarihi</th><th class="px-3 text-left">Durum</th><th class="px-3 text-center">İmzalı PDF</th></tr></thead>
        <tbody>${liste.map((b) => {
          const d = gosterDurum(b), g = guncel(b.kod);
          return `<tr onclick="Dys.ac('${esc(b.kod).replace(/'/g, '&#39;')}')" class="border-t border-slate-800/70 hover:bg-slate-800/40 cursor-pointer">
            <td class="px-3 py-2 font-mono whitespace-nowrap">${esc(b.kod)}</td><td class="px-3 py-2 text-slate-100">${esc(b.ad)}${gozdenGecirmeGec(b) ? ' <span class="text-[10px] text-rose-400" title="12 aydır gözden geçirilmedi">⏱</span>' : ''}</td>
            <td class="px-3 text-slate-400">${esc(b.tur)}</td><td class="px-3 text-center">${esc(b.guncel_rev || '—')}</td><td class="px-3 whitespace-nowrap">${tarih(b.revizyon_tarihi || b.yayin_tarihi)}</td>
            <td class="px-3">${rozet(d.k, d.ad)}${d.ek ? ` <span class="text-[10px] text-slate-500">· ${esc(d.ek)}</span>` : ''}</td>
            <td class="px-3 text-center">${g ? (g.dosya_yolu ? '<span class="text-emerald-400" title="İmzalı PDF yüklü">✓</span>' : '<span class="text-amber-400" title="İmzalı PDF bekleniyor">⚠</span>') : '<span class="text-slate-600">—</span>'}</td></tr>`;
        }).join('') || `<tr><td colspan="7" class="px-3 py-8 text-center text-slate-400">${B.length ? 'Süzgeçle eşleşen doküman yok.' : 'Henüz doküman yok. ' + (yonetici() ? '"Listeden içe aktar" ile LST.07.03 Doküman Listesi\'ni aktarabilir' : 'Yönetici LST.07.03 listesini içe aktarabilir') + ' ya da "+ Yeni doküman" ile ekleyebilirsiniz.'}</td></tr>`}</tbody></table></div></div>
      <p class="text-[11px] text-slate-500 mt-2">${liste.length}/${B.length} doküman. Gözden geçirme uyarısı (⏱): yürürlükteki dokümanın son revizyon/gözden geçirme tarihi 12 aydan eski (prosedür 4.5: yılın son Enerji Gözden Geçirme toplantısında gözden geçirilir).</p>
      <div id="dysDrawer"></div>`;
    if (secili) drawer();
    ikon();
  }

  function bos(m, giris) {
    return `<div class="glass-card rounded-xl p-6 text-sm text-slate-300 space-y-3"><p>${m}</p>${giris ? `<button onclick="Dash.sekme('veri')" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">Veri Girişi'ne git (giriş yap)</button>` : ''}</div>`;
  }
  const ikon = () => { if (window.lucide) lucide.createIcons(); };
  function bildir(m, h) {
    const el = document.getElementById('dysMsg'); if (!el) return;
    el.className = 'text-xs rounded-lg px-3 py-2 mt-2 ' + (h ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30' : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30');
    el.textContent = m; el.scrollIntoView({ block: 'nearest' });
  }
  async function dene(fn) {
    try { await fn(); return true; } catch (e) { bildir(e.message || String(e), true); return false; }
  }
  async function tazele() { await yukle(); ciz(); }

  // ---------- doküman ayrıntısı ----------
  const pad2 = (n) => String(n).padStart(2, '0');
  function sonrakiRev(kod) {
    const l = (R[kod] || []).map((x) => parseInt(x.rev_no, 10)).filter((n) => !isNaN(n));
    return l.length ? pad2(Math.max(...l) + 1) : '00';
  }

  function drawer() {
    const b = B.find((x) => x.kod === secili), el = document.getElementById('dysDrawer');
    if (!b || !el) { secili = null; if (el) el.innerHTML = ''; return; }
    const revs = (R[b.kod] || []).slice().reverse(), d = gosterDurum(b), t = taslakRev(b.kod), yaz = yazabilir() && b.durum !== 'iptal';
    const inp = (id, v, ph, tip) => `<input id="${id}" ${tip === 'date' ? 'type="date"' : ''} value="${esc(v || '')}" placeholder="${esc(ph || '')}" ${yaz ? '' : 'disabled'} class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100" />`;
    const sat = (r) => {
      const arsiv = r.durum === 'arsiv', indir = r.dosya_yolu && (!arsiv || yonetici());
      return `<tr class="border-t border-slate-800/70 align-top"><td class="px-2 py-2 font-mono">${esc(r.rev_no)}</td>
        <td class="px-2 py-2">${r.durum === 'yururlukte' ? rozet('yururlukte', 'Yürürlükte') : r.durum === 'arsiv' ? rozet('iptal', 'Arşiv') : rozet(r.surec, SUREC_AD[r.surec])}</td>
        <td class="px-2 py-2 whitespace-nowrap">${tarih(r.revizyon_tarihi || r.yayin_tarihi)}</td>
        <td class="px-2 py-2 text-slate-400">${esc(r.degisiklik || '')}${r.hazirlayan || r.kontrol_eden || r.onaylayan ? `<div class="text-[10px] text-slate-500">${[r.hazirlayan && 'Hazırlayan: ' + r.hazirlayan, r.kontrol_eden && 'Kontrol: ' + r.kontrol_eden, r.onaylayan && 'Onay: ' + r.onaylayan].filter(Boolean).map(esc).join(' · ')}</div>` : ''}</td>
        <td class="px-2 py-2">${r.dosya_yolu ? `${indir ? `<button onclick="Dys.indir('${r.id}')" class="text-sky-400 underline">${esc(r.dosya_ad || 'PDF')}</button>` : `<span class="text-slate-500" title="Arşivlenmiş sürüm: dosyayı yalnız yönetici açar">${esc(r.dosya_ad || 'PDF')}</span>`}<div class="text-[10px] text-slate-500">EBYS ${esc(r.ebys_sayi || '—')} · ${tarih(r.ebys_tarih)} · ${esc(r.yukleyen_ad || '')}</div>`
          : `<span class="text-amber-400">${r.aktarim ? 'listeden aktarıldı — imzalı PDF bekleniyor' : 'imzalı PDF yok'}</span>`}</td>
        <td class="px-2 py-2 text-right">${yaz && !r.dosya_yolu && r.durum !== 'arsiv' ? `<button onclick="Dys.yukleAc('${r.id}')" class="text-amber-300 underline">PDF yükle</button>` : ''}${yonetici() && r.dosya_yolu && r.durum === 'taslak' ? ` <button onclick="Dys.yururluk('${r.id}')" class="text-emerald-400 underline">Yürürlüğe al</button>` : ''}</td></tr>`;
    };
    const adim = t ? SUREC_SIRA.indexOf(t.surec) : -1;
    const surecBtn = (hedef, etiket, yetki) => (yetki ? `<button onclick="Dys.surec('${hedef}')" class="px-2.5 py-1 rounded-md text-[11px] font-semibold ${hedef === 'taslak' ? 'border border-slate-600 text-slate-300' : 'bg-sky-500/15 text-sky-300 border border-sky-500/30'}">${etiket}</button>` : '');
    el.innerHTML = `<div class="fixed inset-0 z-50 flex justify-end bg-black/50" onclick="if(event.target===this)Dys.kapat()"><div class="bg-slate-950 w-full max-w-2xl h-full overflow-y-auto p-4 sm:p-5 space-y-4 border-l border-slate-700">
      <div class="flex items-start gap-3"><div class="min-w-0 mr-auto"><div class="font-mono text-xs text-slate-400">${esc(b.kod)}</div><h3 class="text-base font-bold text-white">${esc(b.ad)}</h3><div class="mt-1 flex flex-wrap gap-1.5 items-center">${rozet(d.k, d.ad)}${d.ek ? `<span class="text-[11px] text-slate-400">${esc(d.ek)}</span>` : ''}<span class="text-[11px] text-slate-500">Rev ${esc(b.guncel_rev || '—')}</span></div></div>
        <button onclick="Dys.kapat()" class="text-2xl leading-none text-slate-400 hover:text-white" aria-label="Kapat">×</button></div>
      <div id="dysMsg2" class="hidden"></div>
      ${t && yaz ? `<div class="glass-card rounded-xl p-3 space-y-2"><div class="text-[11px] uppercase tracking-wider text-slate-400">Revizyon ${esc(t.rev_no)} — onay akışı</div>
        <div class="flex items-center gap-1 text-[11px]">${SUREC_SIRA.map((s, i) => `<span class="px-2 py-0.5 rounded-full border ${i <= adim ? ROZET[s] : 'border-slate-700 text-slate-500'}">${SUREC_AD[s]}</span>`).join('<span class="text-slate-600">›</span>')}<span class="px-2 py-0.5 rounded-full border ${t.dosya_yolu ? ROZET.yururlukte : 'border-slate-700 text-slate-500'}">İmzalı PDF</span><span class="text-slate-600">›</span><span class="px-2 py-0.5 rounded-full border border-slate-700 text-slate-500">Yürürlük</span></div>
        <div class="flex flex-wrap gap-2">${surecBtn('kontrolde', 'Kontrole gönder', t.surec === 'taslak')}${surecBtn('onayda', 'Onaya al (Ekip Lideri)', t.surec === 'kontrolde' && yonetici())}${surecBtn('ebys_imzada', 'EBYS\'ye imzaya gönderildi', t.surec === 'onayda' && yonetici())}${surecBtn('taslak', 'Taslağa geri al', t.surec !== 'taslak')}</div>
        <p class="text-[11px] text-slate-500">Hazırlayan: Enerji Ekip Üyesi · Kontrol: Şube Müdürü / Ekip Lideri · Onay: Ekip Lideri (El Kitabı: Enerji Organizasyonu Başkanı). İmzalı PDF yüklenince ve EBYS sayısı girilince Ekip Lideri "Yürürlüğe al" der.</p></div>` : ''}
      <div class="glass-card rounded-xl p-3 space-y-2"><div class="text-[11px] uppercase tracking-wider text-slate-400">Doküman bilgileri</div>
        <div class="grid grid-cols-2 gap-2"><label class="col-span-2 text-[11px] text-slate-400">Ad${inp('dysAd', b.ad)}</label>
        <label class="text-[11px] text-slate-400">Tür<select id="dysTur" ${yaz ? '' : 'disabled'} class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-100">${TURLER.map((x) => `<option ${b.tur === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        <label class="text-[11px] text-slate-400">Sahip / sorumlu${inp('dysSahip', b.sahip, 'ör. Enerji Ekibi')}</label>
        <label class="text-[11px] text-slate-400">Son gözden geçirme${inp('dysGozden', b.gozden_gecirme, '', 'date')}</label>
        <label class="text-[11px] text-slate-400">ISO 50001 maddeleri${inp('dysMadde', (b.maddeler || []).join(', '), '4.1, 6.2, 7.5')}</label>
        <label class="col-span-2 text-[11px] text-slate-400">Not${inp('dysNot', b.not_)}</label></div>
        ${yaz ? `<div class="flex flex-wrap gap-2"><button onclick="Dys.kaydet()" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">Kaydet</button><button onclick="Dys.gozden()" class="px-3 py-1.5 rounded-lg text-xs border border-slate-600 text-slate-300">Gözden geçirildi (bugün)</button>${yonetici() ? '<button onclick="Dys.iptal()" class="px-3 py-1.5 rounded-lg text-xs border border-rose-500/40 text-rose-300 ml-auto">Dokümanı iptal et</button>' : ''}</div>` : ''}</div>
      <div class="glass-card rounded-xl p-3"><div class="flex items-center justify-between"><div class="text-[11px] uppercase tracking-wider text-slate-400">Revizyonlar</div>
        ${yaz && !t ? `<button onclick="Dys.revFormu()" class="text-xs text-amber-300 underline">+ Yeni revizyon başlat (Rev ${sonrakiRev(b.kod)})</button>` : ''}</div>
        <div id="dysRevForm"></div>
        <div class="overflow-x-auto mt-2"><table class="w-full text-[11px]" style="min-width:560px"><thead class="text-slate-500"><tr><th class="px-2 text-left">Rev</th><th class="px-2 text-left">Durum</th><th class="px-2 text-left">Tarih</th><th class="px-2 text-left">Değişiklik</th><th class="px-2 text-left">İmzalı dosya (EBYS)</th><th></th></tr></thead>
        <tbody>${revs.map(sat).join('') || '<tr><td colspan="6" class="px-2 py-4 text-slate-500">Revizyon kaydı yok.</td></tr>'}</tbody></table></div>
        <div id="dysYukle"></div></div>
      <div class="glass-card rounded-xl p-3 space-y-2"><div class="text-[11px] uppercase tracking-wider text-slate-400">Geçmiş (değiştirilemez kayıt)</div>
        ${yaz ? '<div class="flex gap-2"><input id="dysNotYaz" placeholder="Not ekle…" class="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100" /><button onclick="Dys.notEkle()" class="px-3 py-1.5 rounded-lg text-xs border border-slate-600 text-slate-300">Ekle</button></div>' : ''}
        <ul class="space-y-1 text-[11px]">${olaylar.map((o) => `<li class="flex gap-2"><span class="text-slate-500 whitespace-nowrap">${new Date(o.zaman).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}</span><span class="text-slate-300"><b>${esc(o.kim_ad || '—')}</b>${o.rev_no ? ' · Rev ' + esc(o.rev_no) : ''} — ${esc(o.aciklama || o.olay)}</span></li>`).join('') || '<li class="text-slate-500">Kayıt yok.</li>'}</ul></div>
    </div></div>`;
  }
  const bildir2 = (m, h) => { const el = document.getElementById('dysMsg2'); if (!el) return bildir(m, h); el.className = 'text-xs rounded-lg px-3 py-2 ' + (h ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30' : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'); el.textContent = m; };
  async function dene2(fn) { try { await fn(); return true; } catch (e) { bildir2(e.message || String(e), true); return false; } }
  const v = (id) => { const e = document.getElementById(id); return e ? e.value.trim() : ''; };

  async function olaylariYukle() {
    try { olaylar = await rest('dys_olay?select=*&belge_kod=eq.' + kodQ(secili) + '&order=zaman.desc,id.desc&limit=100') || []; } catch (e) { olaylar = []; }
  }
  async function ac(kod) { secili = kod; olaylar = []; drawer(); await olaylariYukle(); drawer(); ikon(); }
  const sonra = async (m) => { await yukle(); await olaylariYukle(); ciz(); if (m) bildir2(m); };

  // ---------- işlemler ----------
  async function kaydet() {
    const b = B.find((x) => x.kod === secili); if (!b) return;
    const g = v('dysGozden');
    await dene2(async () => {
      await rest('dys_belge?kod=eq.' + kodQ(b.kod), { method: 'PATCH', prefer: 'return=minimal', body: { ad: v('dysAd') || b.ad, tur: v('dysTur'), sahip: v('dysSahip') || null, gozden_gecirme: g || null, maddeler: v('dysMadde').split(/[,;]\s*/).map((x) => x.trim()).filter(Boolean), not_: v('dysNot') || null } });
      await sonra('Kaydedildi.');
    });
  }
  async function gozden() {
    await dene2(async () => { await rest('dys_belge?kod=eq.' + kodQ(secili), { method: 'PATCH', prefer: 'return=minimal', body: { gozden_gecirme: BUGUN() } }); await sonra('Gözden geçirme tarihi bugün olarak kaydedildi.'); });
  }
  async function iptalEt() {
    if (!confirm(secili + ' dokümanı iptal edilsin mi? (Ekip Lideri iptal onayı; kayıt ve dosyalar silinmez.)')) return;
    await dene2(async () => { await rest('dys_belge?kod=eq.' + kodQ(secili), { method: 'PATCH', prefer: 'return=minimal', body: { durum: 'iptal' } }); await sonra('Doküman iptal edildi.'); });
  }
  async function surecDegistir(hedef) {
    const t = taslakRev(secili); if (!t) return;
    await dene2(async () => { await rest('dys_revizyon?id=eq.' + t.id, { method: 'PATCH', prefer: 'return=minimal', body: { surec: hedef } }); await sonra('Revizyon ' + t.rev_no + ': ' + SUREC_AD[hedef] + '.'); });
  }
  async function notEkle() {
    const m = v('dysNotYaz'); if (!m) return;
    await dene2(async () => { await rest('dys_olay', { method: 'POST', prefer: 'return=minimal', body: { belge_kod: secili, olay: 'not', aciklama: m } }); await sonra(); });
  }
  function revFormu() {
    const el = document.getElementById('dysRevForm'); if (!el) return;
    el.innerHTML = `<div class="mt-2 grid grid-cols-2 gap-2 border border-slate-700 rounded-lg p-2">
      <label class="col-span-2 text-[11px] text-slate-400">Değişiklik / gerekçe<input id="rfDeg" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100" /></label>
      <label class="text-[11px] text-slate-400">Hazırlayan<input id="rfHaz" value="${esc((rol && rol.ad) || '')}" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100" /></label>
      <label class="text-[11px] text-slate-400">Kontrol eden<input id="rfKon" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100" /></label>
      <label class="text-[11px] text-slate-400">Onaylayan<input id="rfOn" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100" /></label>
      <div class="flex items-end"><button onclick="Dys.revBaslat()" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">Revizyonu aç</button></div></div>`;
  }
  async function revBaslat() {
    const kod = secili;
    await dene2(async () => {
      await rest('dys_revizyon', { method: 'POST', prefer: 'return=minimal', body: { belge_kod: kod, rev_no: sonrakiRev(kod), degisiklik: v('rfDeg') || null, hazirlayan: v('rfHaz') || null, kontrol_eden: v('rfKon') || null, onaylayan: v('rfOn') || null } });
      await sonra('Yeni revizyon açıldı.');
    });
  }
  function yukleAc(id) {
    const r = (R[secili] || []).find((x) => String(x.id) === String(id)); if (!r) return;
    document.getElementById('dysYukle').innerHTML = `<div class="mt-3 border border-amber-500/30 rounded-lg p-3 space-y-2"><div class="text-xs font-semibold text-amber-300">Rev ${esc(r.rev_no)} — EBYS'de imzalanmış PDF yükle</div>
      <input id="yuDosya" type="file" accept="application/pdf,.pdf" class="block w-full text-xs text-slate-300" />
      <div class="grid grid-cols-2 gap-2"><label class="text-[11px] text-slate-400">EBYS evrak sayısı (zorunlu)<input id="yuSayi" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100" /></label>
      <label class="text-[11px] text-slate-400">İmza / evrak tarihi<input id="yuTarih" type="date" value="${BUGUN()}" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100" /></label></div>
      <p class="text-[11px] text-slate-500">Yalnız PDF, en çok 25 MB. Yüklenen dosya sonradan değiştirilemez/silinemez; hatalıysa yeni revizyon açılır.</p>
      <button onclick="Dys.yukle('${r.id}')" id="yuBtn" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">Yükle</button></div>`;
  }
  const slug = (s) => s.replace(/İ/g, 'I').replace(/ı/g, 'i').replace(/[ğĞ]/g, 'g').replace(/[üÜ]/g, 'u').replace(/[şŞ]/g, 's').replace(/[öÖ]/g, 'o').replace(/[çÇ]/g, 'c').replace(/[^A-Za-z0-9._-]+/g, '_');
  async function yukle_(id) {
    const r = (R[secili] || []).find((x) => String(x.id) === String(id)), f = (document.getElementById('yuDosya') || {}).files && document.getElementById('yuDosya').files[0];
    const sayi = v('yuSayi');
    if (!f) return bildir2('Önce PDF dosyasını seçin.', true);
    if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') return bildir2('Yalnız PDF yüklenebilir.', true);
    if (f.size > 26214400) return bildir2('Dosya 25 MB sınırını aşıyor.', true);
    if (!sayi) return bildir2('EBYS evrak sayısı zorunludur.', true);
    const btn = document.getElementById('yuBtn'); if (btn) { btn.disabled = true; btn.textContent = 'Yükleniyor…'; }
    const ok = await dene2(async () => {
      const ham = await f.arrayBuffer(), sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256', ham))].map((x) => x.toString(16).padStart(2, '0')).join('');
      const yol = slug(secili) + '/' + slug(r.rev_no) + '/' + sha.slice(0, 12) + '.pdf';
      await VeriDB.dosyaYukle('dys', yol, new Blob([ham], { type: 'application/pdf' }));
      await rest('dys_revizyon?id=eq.' + r.id, { method: 'PATCH', prefer: 'return=minimal', body: { dosya_yolu: yol, dosya_ad: f.name.slice(0, 200), dosya_boyut: f.size, dosya_sha256: sha, ebys_sayi: sayi, ebys_tarih: v('yuTarih') || null } });
      await sonra('İmzalı PDF yüklendi' + (yonetici() ? '. Şimdi "Yürürlüğe al" diyebilirsiniz.' : '. Yürürlüğe alma Ekip Lideri (yönetici) yetkisindedir.'));
    });
    if (!ok && btn) { btn.disabled = false; btn.textContent = 'Yükle'; }
  }
  async function yururluk(id) {
    const r = (R[secili] || []).find((x) => String(x.id) === String(id)); if (!r) return;
    if (!confirm(secili + ' · Rev ' + r.rev_no + ' yürürlüğe alınsın mı? Mevcut yürürlükteki revizyon arşive kaldırılır.')) return;
    await dene2(async () => {
      await rest('rpc/dys_yururluge_al', { method: 'POST', body: { p_belge: secili, p_rev: r.rev_no, p_yayin: null, p_revtarih: r.ebys_tarih || BUGUN() } });
      await sonra('Rev ' + r.rev_no + ' yürürlüğe alındı.');
    });
  }
  async function indir(id) {
    const r = (R[secili] || []).find((x) => String(x.id) === String(id)); if (!r || !r.dosya_yolu) return;
    const w = window.open('', '_blank');   // açılır pencere engeline takılmamak için tıklamada hemen açılır
    try { const u = await VeriDB.dosyaAdresi('dys', r.dosya_yolu); if (w) w.location = u; else location.href = u; }
    catch (e) { if (w) w.close(); bildir2(e.message || 'İndirilemedi', true); }
  }

  // ---------- yeni doküman ----------
  function yeni() {
    secili = null;
    const el = document.getElementById('dysDrawer');
    el.innerHTML = `<div class="fixed inset-0 z-50 flex justify-end bg-black/50" onclick="if(event.target===this)Dys.kapat()"><div class="bg-slate-950 w-full max-w-lg h-full overflow-y-auto p-5 space-y-3 border-l border-slate-700">
      <div class="flex items-center"><h3 class="text-base font-bold text-white mr-auto">Yeni doküman</h3><button onclick="Dys.kapat()" class="text-2xl leading-none text-slate-400">×</button></div>
      <div id="dysMsg2" class="hidden"></div>
      <p class="text-[11px] text-slate-500">Kod biçimi: İBB-YYY-ZZ-ZZ (YYY: EL, PR, FRM, PLN, LST, RPR, PL, PSS, RHB · ZZ-ZZ: standart bölümü ve sıra). Numarayı Enerji Ekibi verir.</p>
      <label class="text-[11px] text-slate-400 block">Tür<select id="ynTur" onchange="Dys.kodOner()" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-100">${TURLER.map((x) => `<option>${x}</option>`).join('')}</select></label>
      <label class="text-[11px] text-slate-400 block">Doküman numarası<input id="ynKod" oninput="Dys.kodOner(true)" placeholder="İBB-FRM-08-05" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 font-mono" /></label>
      <label class="text-[11px] text-slate-400 block">Doküman adı<input id="ynAd" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100" /></label>
      <label class="text-[11px] text-slate-400 block">Sahip / sorumlu<input id="ynSahip" value="Enerji Ekibi" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100" /></label>
      <button onclick="Dys.yeniKaydet()" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">Taslak olarak oluştur (Rev 00)</button></div></div>`;
  }
  async function yeniKaydet() {
    const kod = v('ynKod'), ad = v('ynAd');
    if (!kod || !ad) return bildir2('Doküman numarası ve adı zorunludur.', true);
    if (B.some((b) => b.kod === kod)) return bildir2('Bu numara zaten var: ' + kod, true);
    await dene2(async () => {
      await rest('dys_belge', { method: 'POST', prefer: 'return=minimal', body: { kod, tur: v('ynTur'), ad, sahip: v('ynSahip') || null } });
      await rest('dys_revizyon', { method: 'POST', prefer: 'return=minimal', body: { belge_kod: kod, rev_no: '00', hazirlayan: (rol && rol.ad) || null, degisiklik: 'İlk yayın' } });
      await yukle(); secili = kod; olaylar = []; ciz(); await olaylariYukle(); drawer();
    });
  }

  // ---------- listeden içe aktar (LST.07.03) ----------
  const NORM = (x) => String(x || '').toLocaleLowerCase('tr').replace(/[^a-z0-9ğüşıöç]/g, '');
  function tarihCoz(s) { const m = String(s || '').trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/); return m ? `${m[3]}-${pad2(m[2])}-${pad2(m[1])}` : null; }
  function listeCoz(metin) {
    const satirlar = metin.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).filter((l) => !/^\|?\s*:?-{2,}/.test(l));
    const hucre = (l) => (l.includes('\t') ? l.split('\t') : l.replace(/^\||\|$/g, '').split('|')).map((c) => c.trim());
    const hi = satirlar.findIndex((l) => hucre(l).some((c) => NORM(c).includes('dokümannumara')));
    if (hi < 0) throw new Error('Başlık satırı bulunamadı. "Doküman Numarası" sütunu olan LST.07.03 tablosunu (başlık satırıyla birlikte) yapıştırın.');
    const baslik = hucre(satirlar[hi]).map(NORM), kol = (...adlar) => baslik.findIndex((b) => adlar.some((a) => b.includes(a)));
    const ix = { tur: kol('dokümantürü', 'dokümantür'), kod: kol('dokümannumara'), ad: kol('dokümanadı'), yayin: kol('yayınlanma', 'yayıntarih'), revt: kol('revizyontarih'), rev: kol('revno', 'revizyonnumara', 'revizyonno'), durum: kol('durum') };
    if (ix.kod < 0 || ix.ad < 0) throw new Error('"Doküman Numarası" ve "Doküman Adı" sütunları gerekli.');
    const sayac = {}, cikti = [], kodlar = new Set();
    satirlar.slice(hi + 1).forEach((l) => {
      const c = hucre(l), al = (i) => (i >= 0 && c[i] ? c[i] : '');
      const ad = al(ix.ad); if (!ad) return;
      const tur = TURLER.find((t) => NORM(t) === NORM(al(ix.tur))) || (al(ix.tur) || 'Diğer');
      let kod = al(ix.kod).replace(/\s+/g, '');
      if (!kod) { const kisa = TUR_KISA[tur] || 'DGR'; sayac[kisa] = (sayac[kisa] || 0) + 1; kod = kisa + '-' + pad2(sayac[kisa]); }
      if (kodlar.has(kod)) return;
      kodlar.add(kod);
      const durumHam = NORM(al(ix.durum)), revHam = al(ix.rev).replace(/\D/g, '');
      cikti.push({ kod, tur, ad, yayin: tarihCoz(al(ix.yayin)), revt: tarihCoz(al(ix.revt)), rev: revHam ? pad2(revHam) : '00', iptal: durumHam.includes('iptal'), yururluk: durumHam.includes('yürürlük') || durumHam === '' });
    });
    if (!cikti.length) throw new Error('Tabloda doküman satırı bulunamadı.');
    return cikti;
  }
  function iceAktar() {
    secili = null;
    document.getElementById('dysDrawer').innerHTML = `<div class="fixed inset-0 z-50 flex justify-end bg-black/50" onclick="if(event.target===this)Dys.kapat()"><div class="bg-slate-950 w-full max-w-3xl h-full overflow-y-auto p-5 space-y-3 border-l border-slate-700">
      <div class="flex items-center"><h3 class="text-base font-bold text-white mr-auto">LST.07.03 Doküman Listesi'ni içe aktar</h3><button onclick="Dys.kapat()" class="text-2xl leading-none text-slate-400">×</button></div>
      <div id="dysMsg2" class="hidden"></div>
      <ol class="text-xs text-slate-300 list-decimal pl-5 space-y-1"><li>Word/Excel'deki Doküman Listesi tablosunu <b>başlık satırıyla birlikte</b> seçip kopyalayın.</li><li>Aşağıya yapıştırın ve "Önizle"ye basın.</li><li>Önizlemeyi kontrol edip "İçe aktar"a basın. Sistemde zaten olan kodlara dokunulmaz.</li></ol>
      <p class="text-[11px] text-slate-500">Aktarılan her doküman, listedeki revizyonuyla "Yürürlükte" kaydolur ve <b>imzalı PDF bekliyor</b> olarak işaretlenir; EBYS'den imzalı dosyayı sonradan yüklersiniz. Yapıştırdığınız metin sunucuya yalnız doküman kayıtları olarak gider, depoya yazılmaz.</p>
      <textarea id="icMetin" rows="8" class="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-[11px] font-mono text-slate-100" placeholder="Sıra  Doküman Türü  Doküman Numarası  Doküman Adı  Yayınlanma Tarihi  Revizyon Tarihi  Rev. No  Durumu"></textarea>
      <button onclick="Dys.onizle()" class="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-600 text-slate-200">Önizle</button>
      <div id="icOnizle"></div></div></div>`;
  }
  let hazirListe = [];
  function onizle() {
    const el = document.getElementById('icOnizle');
    if (!await_(() => { hazirListe = listeCoz(document.getElementById('icMetin').value); })) return;
    const yeniler = hazirListe.filter((x) => !B.some((b) => b.kod === x.kod));
    el.innerHTML = `<p class="text-xs text-slate-300 mb-2"><b>${hazirListe.length}</b> doküman okundu: <b class="text-emerald-400">${yeniler.length} yeni</b>, ${hazirListe.length - yeniler.length} zaten kayıtlı (atlanır).</p>
      <div class="overflow-x-auto max-h-72 overflow-y-auto border border-slate-800 rounded-lg"><table class="w-full text-[11px]"><thead class="text-slate-500 sticky top-0 bg-slate-950"><tr><th class="px-2 text-left">Kod</th><th class="px-2 text-left">Ad</th><th class="px-2 text-left">Tür</th><th class="px-2">Rev</th><th class="px-2 text-left">Rev. tarihi</th><th class="px-2 text-left">Durum</th><th class="px-2 text-left"></th></tr></thead><tbody>
      ${hazirListe.map((x) => { const var_ = B.some((b) => b.kod === x.kod); return `<tr class="border-t border-slate-800 ${var_ ? 'opacity-50' : ''}"><td class="px-2 py-1 font-mono whitespace-nowrap">${esc(x.kod)}</td><td class="px-2">${esc(x.ad)}</td><td class="px-2">${esc(x.tur)}</td><td class="px-2 text-center">${x.rev}</td><td class="px-2 whitespace-nowrap">${tarih(x.revt || x.yayin)}</td><td class="px-2">${x.iptal ? 'İptal' : 'Yürürlükte'}</td><td class="px-2 text-slate-500">${var_ ? 'kayıtlı' : 'yeni'}</td></tr>`; }).join('')}</tbody></table></div>
      <button onclick="Dys.aktar()" ${yeniler.length ? '' : 'disabled'} class="mt-3 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 disabled:opacity-40">İçe aktar (${yeniler.length} yeni)</button>`;
  }
  function await_(fn) { try { fn(); return true; } catch (e) { bildir2(e.message, true); return false; } }
  async function aktar() {
    const yeniler = hazirListe.filter((x) => !B.some((b) => b.kod === x.kod));
    await dene2(async () => {
      await rest('dys_belge?on_conflict=kod', { method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal', body: yeniler.map((x) => ({ kod: x.kod, tur: x.tur, ad: x.ad, durum: x.iptal ? 'iptal' : 'yururlukte', guncel_rev: x.iptal ? null : x.rev, yayin_tarihi: x.yayin, revizyon_tarihi: x.revt || x.yayin })) });
      await rest('dys_revizyon?on_conflict=belge_kod,rev_no', { method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal', body: yeniler.map((x) => ({ belge_kod: x.kod, rev_no: x.rev, durum: x.iptal ? 'arsiv' : 'yururlukte', yayin_tarihi: x.yayin, revizyon_tarihi: x.revt || x.yayin, aktarim: true, degisiklik: 'Doküman listesinden aktarıldı' })) });
      secili = null; await yukle(); ciz(); bildir(yeniler.length + ' doküman içe aktarıldı. Şimdi imzalı PDF\'leri ilgili dokümanlara yükleyin.');
    });
  }

  // Yılın son Enerji Gözden Geçirme toplantısında dokümanlar topluca gözden geçirilir (prosedür 4.5)
  async function topluGozden() {
    const t = prompt('Yürürlükteki TÜM dokümanlar için gözden geçirme tarihi (GG.AA.YYYY) — ör. Enerji Gözden Geçirme toplantısının tarihi:', tarih(BUGUN()).replace(/-/g, '.'));
    if (!t) return;
    const iso = tarihCoz(t); if (!iso) return bildir('Tarih biçimi GG.AA.YYYY olmalı.', true);
    await dene(async () => { await rest('dys_belge?durum=eq.yururlukte', { method: 'PATCH', prefer: 'return=minimal', body: { gozden_gecirme: iso } }); await tazele(); bildir('Yürürlükteki dokümanların gözden geçirme tarihi ' + tarih(iso) + ' olarak kaydedildi.'); });
  }

  // ---------- dışa aktarım: LST.07.03 biçimi ----------
  function csv() {
    const sat = [['Sıra', 'Doküman Türü', 'Doküman Numarası', 'Doküman Adı', 'Yayınlanma Tarihi', 'Revizyon Tarihi', 'Rev. No', 'Durumu']];
    B.slice().sort((a, b) => a.kod.localeCompare(b.kod, 'tr')).forEach((b, i) => sat.push([i + 1, b.tur, b.kod, b.ad, tarih(b.yayin_tarihi).replace('—', ''), tarih(b.revizyon_tarihi).replace('—', ''), b.guncel_rev || '', gosterDurum(b).ad]));
    const metin = sat.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(';')).join('\r\n');
    const bl = new Blob(['﻿' + metin], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a');
    a.href = URL.createObjectURL(bl); a.download = 'LST.07.03_Doküman_Listesi_' + BUGUN() + '.csv'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ---------- dışa açılan ----------
  async function panel(el) { kap = el; secili = null; rol = null; ciz(); await yukle(); ciz(); }
  window.Dys = {
    panel,
    ara(x) { F.ara = x; const p = document.getElementById('dysAra').selectionStart; ciz(); const i = document.getElementById('dysAra'); i.focus(); i.setSelectionRange(p, p); },
    tur(x) { F.tur = x; ciz(); },
    suz(x) { F.durum = F.durum === x ? '' : x; ciz(); },
    ac, kapat() { secili = null; document.getElementById('dysDrawer').innerHTML = ''; },
    yeni, yeniKaydet, kodOner(koddan) {   // kod yazılırken türü kısaltmadan seç; tür değişince örnek kodu göster
      const t = document.getElementById('ynTur'), k = document.getElementById('ynKod'); if (!t || !k) return;
      if (koddan) { const m = k.value.toUpperCase().match(/^İ?BB-([A-Z]+)-/); const tur = m && Object.keys(TUR_KISA).find((x) => TUR_KISA[x] === m[1]); if (tur) t.value = tur; }
      else if (!k.value && TUR_KISA[t.value]) k.placeholder = 'İBB-' + TUR_KISA[t.value] + '-00-00';
    },
    kaydet, gozden, iptal: iptalEt, surec: surecDegistir, notEkle, revFormu, revBaslat, yukleAc, yukle: yukle_, yururluk, indir,
    iceAktar, onizle, aktar, csv, topluGozden,
    _test: { listeCoz, gozdenGecirmeGec },
  };
})();
