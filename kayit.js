/* Genel kayıt düzenleyici — ISO 50001 formlarının (bağlam, ilgili taraf, yasal şart, risk, eylem) Supabase tablolarında tutulması için ortak arayüz.
 * Tablo başına bir yapılandırma verilir (alanlar, kolonlar); liste, arama, ekleme/düzenleme penceresi, pasife alma ve değişiklik geçmişi bu dosyadadır.
 * Yetki: okuma = giriş yapmış kullanıcı; yazma = girisci/yonetici (sunucuda zorlanır, supabase/iso_kayit.sql). Kayıtlar silinmez, "pasife alınır" (PR.07.01 4.10).
 * Kullanım: const k = Kayit.olustur({ id, tablo, ... }); k.ciz(element);
 */
(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tarih = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('.') : '—');
  const kayitlar = {};
  let rolOnbellek = null;
  const rol = async () => (rolOnbellek || (rolOnbellek = await VeriDB.rol()));
  const yazabilir = () => !!rolOnbellek && ['girisci', 'yonetici'].includes(rolOnbellek.rol);
  const INP = 'w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100';

  function olustur(cfg) {
    const k = { cfg, el: null, satirlar: [], yukleniyor: false, hata: null, duzenle: null, ara: '', pasif: false };
    kayitlar[cfg.id] = k;
    const rest = (yol, ayar) => VeriDB.istek('/rest/v1/' + yol, ayar);
    const ids = (s) => cfg.id + '_' + s;

    async function yukle() {
      k.yukleniyor = true; k.hata = null;
      try { await rol(); k.satirlar = (await rest(cfg.tablo + '?' + (cfg.sorgu || 'select=*&order=id'))) || []; }
      catch (e) { k.satirlar = []; k.hata = /relation|does not exist|42P01|schema cache/i.test(e.message) ? 'Tablolar kurulmamış görünüyor: supabase/iso_kayit.sql dosyasını Supabase SQL Editor\'de bir kez çalıştırın.' : 'Veri okunamadı: ' + e.message; }
      finally { k.yukleniyor = false; }
    }
    const gorunen = () => {
      const a = k.ara.toLocaleLowerCase('tr');
      return k.satirlar.filter((r) => (k.pasif || r.aktif !== false) && (!cfg.suz || cfg.suz(r)) && (!a || JSON.stringify(Object.values(r)).toLocaleLowerCase('tr').includes(a)));
    };

    function ciz() {
      const el = k.el; if (!el || !document.body.contains(el)) return;
      if (!window.VeriDB || !VeriDB.hazir()) { el.innerHTML = bos('Supabase ayarı yok (supabase-ayar.js).'); return; }
      if (!VeriDB.oturum()) { el.innerHTML = bos('Bu kayıtlar yalnız giriş yapmış kullanıcılara açıktır. Önce Veri Girişi hesabınızla giriş yapın.', true); return; }
      if (k.hata) { el.innerHTML = bos(esc(k.hata)); return; }
      if (k.yukleniyor && !k.satirlar.length) { el.innerHTML = '<div class="text-sm text-slate-400 p-4">Yükleniyor…</div>'; return; }
      const liste = gorunen(), yaz = yazabilir();
      const pasifSay = k.satirlar.filter((r) => r.aktif === false).length;
      el.innerHTML = `
        <div class="flex flex-wrap items-center gap-2">
          <div class="mr-auto min-w-0"><h3 class="text-sm font-bold text-white">${esc(cfg.baslik)}</h3>${cfg.aciklama ? `<p class="text-[11px] text-slate-500">${cfg.aciklama}</p>` : ''}</div>
          ${cfg.araclar ? cfg.araclar(k, yaz) : ''}
          <input value="${esc(k.ara)}" placeholder="Ara…" oninput="Kayit.i('${cfg.id}').aramaYaz(this.value)" class="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 w-36" />
          ${pasifSay ? `<label class="text-[11px] text-slate-400 flex items-center gap-1"><input type="checkbox" ${k.pasif ? 'checked' : ''} onchange="Kayit.i('${cfg.id}').pasifGoster(this.checked)" /> pasifleri göster (${pasifSay})</label>` : ''}
          ${yaz ? `<button onclick="Kayit.i('${cfg.id}').ac()" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">+ Ekle</button>` : ''}
        </div>
        <div id="${ids('msg')}" class="hidden"></div>
        ${cfg.ust ? cfg.ust(k.satirlar, k) : ''}
        <div class="mt-3">${cfg.govde ? cfg.govde(liste, k) : tablo(liste)}</div>
        <div id="${ids('drawer')}"></div>`;
      if (k.duzenle != null) drawer();
      if (window.lucide) lucide.createIcons();
    }
    const bos = (m, giris) => `<div class="glass-card rounded-xl p-5 text-sm text-slate-300 space-y-3"><p>${m}</p>${giris ? `<button onclick="Dash.sekme('veri')" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">Veri Girişi'ne git (giriş yap)</button>` : ''}</div>`;

    function tablo(liste) {
      return `<div class="glass-card rounded-xl overflow-hidden"><div class="overflow-x-auto"><table class="w-full text-xs" style="min-width:${cfg.minGenislik || 640}px">
        <thead class="text-slate-400 uppercase tracking-wider text-[10px]"><tr>${cfg.kolonlar.map((c) => `<th class="px-3 py-2 ${c.sinif || 'text-left'}">${esc(c.ad)}</th>`).join('')}</tr></thead>
        <tbody>${liste.map((r) => `<tr onclick="Kayit.i('${cfg.id}').ac(${r.id})" class="border-t border-slate-800/70 hover:bg-slate-800/40 cursor-pointer align-top ${r.aktif === false ? 'opacity-50' : ''} ${cfg.satirSinif ? cfg.satirSinif(r) : ''}">${cfg.kolonlar.map((c) => `<td class="px-3 py-2 ${c.sinif || ''}">${c.deger(r)}</td>`).join('')}</tr>`).join('') ||
          `<tr><td colspan="${cfg.kolonlar.length}" class="px-3 py-8 text-center text-slate-400">${k.satirlar.length ? 'Süzgeçle eşleşen kayıt yok.' : 'Henüz kayıt yok.'}${cfg.bosIpucu ? ' ' + cfg.bosIpucu : ''}</td></tr>`}</tbody></table></div></div>
        <p class="text-[11px] text-slate-500 mt-1">${liste.length} kayıt. Satıra tıklayınca ayrıntı/düzenleme açılır.</p>`;
    }

    // ---- ekleme / düzenleme penceresi ----
    function alanHtml(a, v) {
      const ortak = `id="${ids('f_' + a.k)}" ${a.kilit ? 'disabled' : ''}`;
      const etiket = (g) => `<label class="text-[11px] text-slate-400 block ${a.genis ? 'col-span-2' : ''}">${esc(a.ad)}${a.zorunlu ? ' *' : ''}${g}${a.yardim ? `<span class="text-[10px] text-slate-500">${esc(a.yardim)}</span>` : ''}</label>`;
      if (a.tip === 'area') return etiket(`<textarea ${ortak} rows="3" class="${INP}">${esc(v)}</textarea>`);
      if (a.tip === 'sel') return etiket(`<select ${ortak} class="${INP}">${a.bos ? '<option value="">—</option>' : ''}${(typeof a.sec === 'function' ? a.sec(k) : a.sec).map(([d, e]) => `<option value="${esc(d)}" ${String(v) === String(d) ? 'selected' : ''}>${esc(e)}</option>`).join('')}</select>`);
      if (a.tip === 'date') return etiket(`<input ${ortak} type="date" value="${esc(v ? String(v).slice(0, 10) : '')}" class="${INP}" />`);
      if (a.tip === 'int' || a.tip === 'num') return etiket(`<input ${ortak} type="number" ${a.min != null ? `min="${a.min}"` : ''} ${a.max != null ? `max="${a.max}"` : ''} step="${a.tip === 'num' ? '0.01' : '1'}" value="${esc(v)}" class="${INP}" />`);
      return etiket(`<input ${ortak} value="${esc(v)}" class="${INP}" />`);
    }
    function drawer() {
      const el = document.getElementById(ids('drawer')); if (!el) return;
      const r = k.duzenle === 'yeni' ? Object.assign({}, cfg.yeni ? cfg.yeni(k) : {}) : k.satirlar.find((x) => x.id === k.duzenle);
      if (!r) { k.duzenle = null; el.innerHTML = ''; return; }
      const yaz = yazabilir();
      el.innerHTML = `<div class="fixed inset-0 z-50 flex justify-end bg-black/50" onclick="if(event.target===this)Kayit.i('${cfg.id}').kapat()"><div class="bg-slate-950 w-full max-w-xl h-full overflow-y-auto p-4 sm:p-5 space-y-3 border-l border-slate-700">
        <div class="flex items-center"><h3 class="text-base font-bold text-white mr-auto">${k.duzenle === 'yeni' ? 'Yeni kayıt' : esc(cfg.baslik) + ' — düzenle'}</h3><button onclick="Kayit.i('${cfg.id}').kapat()" class="text-2xl leading-none text-slate-400 hover:text-white" aria-label="Kapat">×</button></div>
        <div id="${ids('msg2')}" class="hidden"></div>
        ${cfg.drawerUst ? cfg.drawerUst(r, k) : ''}
        <div class="grid grid-cols-2 gap-2">${cfg.alanlar.map((a) => alanHtml(a, r[a.k] != null ? r[a.k] : (a.varsayilan != null ? a.varsayilan : ''))).join('')}</div>
        ${r.guncelleme && k.duzenle !== 'yeni' ? `<p class="text-[10px] text-slate-500">Son değişiklik: ${new Date(r.guncelleme).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}</p>` : ''}
        ${yaz ? `<div class="flex flex-wrap gap-2"><button onclick="Kayit.i('${cfg.id}').kaydet()" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">Kaydet</button>
          ${k.duzenle !== 'yeni' ? `<button onclick="Kayit.i('${cfg.id}').pasifle()" class="px-3 py-1.5 rounded-lg text-xs border border-slate-600 text-slate-300 ml-auto">${r.aktif === false ? 'Yeniden etkinleştir' : 'Pasife al'}</button>` : ''}</div>` : '<p class="text-[11px] text-slate-500">Yalnız okuma yetkiniz var.</p>'}
        ${cfg.drawerAlt ? cfg.drawerAlt(r, k) : ''}
        ${k.duzenle !== 'yeni' ? `<div class="glass-card rounded-xl p-3"><div class="text-[11px] uppercase tracking-wider text-slate-400 mb-1">Değişiklik geçmişi</div><ul id="${ids('gecmis')}" class="space-y-1 text-[11px] text-slate-400"><li>Yükleniyor…</li></ul></div>` : ''}
      </div></div>`;
      if (k.duzenle !== 'yeni') gecmisYukle(r.id);
      if (cfg.drawerSonra) cfg.drawerSonra(r, k);
    }
    async function gecmisYukle(id) {
      const ul = document.getElementById(ids('gecmis')); if (!ul) return;
      try {
        const g = await rest('iso_gecmis?select=zaman,kim_ad,islem&tablo=eq.' + cfg.tablo + '&kayit_id=eq.' + id + '&order=zaman.desc&limit=20');
        ul.innerHTML = (g || []).map((x) => `<li>${new Date(x.zaman).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })} — <b class="text-slate-300">${esc(x.kim_ad || '—')}</b> · ${{ INSERT: 'oluşturdu', UPDATE: 'değiştirdi', DELETE: 'sildi' }[x.islem] || esc(x.islem)}</li>`).join('') || '<li>Kayıt yok.</li>';
      } catch (e) { ul.innerHTML = '<li>Geçmiş okunamadı.</li>'; }
    }
    const bildir = (m, h, id) => { const e = document.getElementById(ids(id || 'msg2')); if (!e) return; e.className = 'text-xs rounded-lg px-3 py-2 ' + (h ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30' : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'); e.textContent = m; };
    const oku = (a) => { const e = document.getElementById(ids('f_' + a.k)); if (!e) return undefined; const v = e.value.trim(); if (v === '') return null; return (a.tip === 'int') ? parseInt(v, 10) : (a.tip === 'num') ? parseFloat(v) : v; };

    async function kaydet() {
      const kayit = {};
      for (const a of cfg.alanlar) { if (a.kilit) continue; const v = oku(a); if (a.zorunlu && (v === null || v === undefined)) return bildir(a.ad + ' zorunludur.', true); kayit[a.k] = v === undefined ? null : v; }
      const son = cfg.hazirla ? cfg.hazirla(kayit, k) : kayit;
      try {
        if (k.duzenle === 'yeni') await rest(cfg.tablo, { method: 'POST', prefer: 'return=minimal', body: son });
        else await rest(cfg.tablo + '?id=eq.' + k.duzenle, { method: 'PATCH', prefer: 'return=minimal', body: son });
        k.duzenle = null; await yukle(); ciz(); bildirListe('Kaydedildi.');
      } catch (e) { bildir(e.message || String(e), true); }
    }
    function bildirListe(m, h) { bildir(m, h, 'msg'); }
    async function pasifle() {
      const r = k.satirlar.find((x) => x.id === k.duzenle); if (!r) return;
      try { await rest(cfg.tablo + '?id=eq.' + r.id, { method: 'PATCH', prefer: 'return=minimal', body: { aktif: r.aktif === false } }); k.duzenle = null; await yukle(); ciz(); bildirListe(r.aktif === false ? 'Yeniden etkinleştirildi.' : 'Pasife alındı (kayıt silinmez, geçmiş korunur).'); }
      catch (e) { bildir(e.message || String(e), true); }
    }

    Object.assign(k, {
      ciz: async (el) => { k.el = el; ciz(); await yukle(); if (cfg.oncesi) { try { await cfg.oncesi(k); } catch (e) { /* ilişkili veri okunamadıysa liste yine de çizilir */ } } ciz(); },
      veri: yukle,
      alan: (a) => document.getElementById(ids('f_' + a)),
      yenile: async () => { await yukle(); ciz(); },
      ac(id) { k.duzenle = id == null ? 'yeni' : id; drawer(); },
      kapat() { k.duzenle = null; const e = document.getElementById(ids('drawer')); if (e) e.innerHTML = ''; },
      kaydet, pasifle, bildir: bildirListe, bildirDrawer: bildir, rest, yetki: yazabilir,
      aramaYaz(v) { k.ara = v; ciz(); const i = k.el.querySelector('input[placeholder="Ara…"]'); if (i) { i.focus(); i.setSelectionRange(v.length, v.length); } },
      pasifGoster(v) { k.pasif = v; ciz(); },
      satir: (id) => k.satirlar.find((x) => x.id === id),
    });
    return k;
  }

  window.Kayit = { olustur, i: (id) => kayitlar[id], tarih, esc };
})();
