/* Bağlam ve taraflar (ISO 50001 madde 4): FRM.04.01 Kuruluşun Bağlamı (SWOT), FRM.04.05 İç ve Dış Hususlar,
 * FRM.04.02 İlgili Taraflar, FRM.04.03 Yasal ve Diğer Şartlara Uygunluk Takip — Excel yerine Supabase'te (supabase/iso_kayit.sql).
 * ISO 50001 → tesis → "Bağlam ve taraflar" alt sekmesi: kurum geneli kayıtlar + seçili tesise özel kayıtlar görünür.
 * Mevcut Excel dosyaları "Excel'den aktar" ile bir kez içe alınır (SheetJS, tarayıcıda; dosya sunucuya/depoya gitmez, yalnız satırlar kaydedilir).
 */
(function () {
  const { esc, tarih } = Kayit;
  const TESIS = [['', 'Kurum geneli'], ['aassm', 'AASSM'], ['buz', 'Buz Sporları'], ['buca', 'Buca SYK']];
  const TESIS_AD = Object.fromEntries(TESIS);
  let tesis = null, bolum = 'swot';
  const kisa = (s, n) => { s = String(s || ''); return s.length > n ? esc(s.slice(0, n)) + '…' : esc(s); };
  const etiketTesis = (r) => (r.tesis ? `<span class="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300">${esc(TESIS_AD[r.tesis])}</span>` : '');
  const tesisSuz = (r) => !r.tesis || r.tesis === tesis;
  const gec = (d, gun) => d && (Date.now() - new Date(d).getTime()) / 86400000 > (gun || 365);

  // ---------- SWOT (FRM.04.01) ----------
  const SWOT = { guclu: ['Güçlü yanlar', 'text-emerald-400'], zayif: ['Zayıf yanlar', 'text-rose-400'], firsat: ['Fırsatlar', 'text-sky-400'], tehdit: ['Tehditler', 'text-amber-400'] };
  const swot = Kayit.olustur({
    id: 'baglam_swot', tablo: 'iso_baglam', baslik: 'Kuruluşun bağlamı — SWOT (FRM.04.01)', sorgu: 'select=*&kaynak=eq.FRM.04.01&order=tip,sira,id',
    aciklama: 'Güçlü/zayıf yanlar (iç), fırsatlar/tehditler (dış). Etki: 1 düşük – 5 yüksek. Tesise özel madde için tesis seçin.',
    suz: tesisSuz,
    alanlar: [
      { k: 'tip', ad: 'Bölüm', tip: 'sel', sec: Object.entries(SWOT).map(([d, [e]]) => [d, e]), zorunlu: true },
      { k: 'tesis', ad: 'Kapsam', tip: 'sel', sec: TESIS, bos: false },
      { k: 'madde', ad: 'Madde', tip: 'area', zorunlu: true, genis: true },
      { k: 'etki', ad: 'Etki derecesi (1–5)', tip: 'int', min: 1, max: 5 },
      { k: 'gozden_gecirme', ad: 'Son gözden geçirme', tip: 'date' },
      { k: 'not_', ad: 'Not', tip: 'area', genis: true },
    ],
    yeni: (k) => ({ tip: k._tip || 'guclu', tesis: '' }),
    hazirla: (r) => Object.assign({}, r, { kaynak: 'FRM.04.01', tesis: r.tesis || null }),
    araclar: (k, yaz) => (yaz ? '<button onclick="Baglam.excel(\'swot\')" class="px-3 py-1.5 rounded-lg text-xs border border-slate-600 text-slate-300">Excel\'den aktar (FRM.04.01)</button>' : ''),
    govde: (liste, k) => `<div class="grid grid-cols-1 md:grid-cols-2 gap-3">${Object.entries(SWOT).map(([t, [ad, renk]]) => {
      const l = liste.filter((r) => r.tip === t);
      return `<div class="glass-card rounded-xl p-3"><div class="flex items-center mb-2"><div class="text-xs font-bold ${renk} mr-auto">${ad} (${l.length})</div>${k.yetki() ? `<button onclick="Baglam.swotEkle('${t}')" class="text-[11px] text-amber-300 underline">+ ekle</button>` : ''}</div>
        <ol class="space-y-1">${l.map((r, i) => `<li onclick="Kayit.i('baglam_swot').ac(${r.id})" class="text-xs text-slate-200 cursor-pointer hover:bg-slate-800/50 rounded px-1.5 py-1 flex gap-2 ${r.aktif === false ? 'opacity-50' : ''}"><span class="text-slate-500 w-5 shrink-0">${i + 1}.</span><span class="flex-1">${esc(r.madde)} ${etiketTesis(r)}</span>${r.etki ? `<span class="text-[10px] px-1.5 rounded bg-slate-700 text-slate-300 h-4" title="Etki derecesi">E${r.etki}</span>` : ''}</li>`).join('') || '<li class="text-xs text-slate-500">Kayıt yok.</li>'}</ol></div>`;
    }).join('')}</div>`,
  });

  // ---------- İç ve dış hususlar (FRM.04.05) ----------
  const husus = Kayit.olustur({
    id: 'baglam_husus', tablo: 'iso_baglam', baslik: 'İç ve dış hususlar (FRM.04.05)', sorgu: 'select=*&kaynak=eq.FRM.04.05&order=tip,sira,id', suz: tesisSuz,
    aciklama: 'Enerji yönetim sistemini etkileyen iç ve dış hususlar.',
    alanlar: [
      { k: 'tip', ad: 'Tür', tip: 'sel', sec: [['ic', 'İç husus'], ['dis', 'Dış husus']], zorunlu: true },
      { k: 'tesis', ad: 'Kapsam', tip: 'sel', sec: TESIS },
      { k: 'madde', ad: 'Husus', tip: 'area', zorunlu: true, genis: true },
      { k: 'etki', ad: 'Etki derecesi (1–5)', tip: 'int', min: 1, max: 5 },
      { k: 'gozden_gecirme', ad: 'Son gözden geçirme', tip: 'date' },
      { k: 'not_', ad: 'Not', tip: 'area', genis: true },
    ],
    yeni: () => ({ tip: 'ic', tesis: '' }),
    hazirla: (r) => Object.assign({}, r, { kaynak: 'FRM.04.05', tesis: r.tesis || null }),
    araclar: (k, yaz) => (yaz ? '<button onclick="Baglam.excel(\'husus\')" class="px-3 py-1.5 rounded-lg text-xs border border-slate-600 text-slate-300">Excel\'den aktar (FRM.04.05)</button>' : ''),
    minGenislik: 520,
    kolonlar: [
      { ad: 'Tür', deger: (r) => (r.tip === 'ic' ? '<span class="text-violet-300">İç</span>' : '<span class="text-sky-300">Dış</span>') },
      { ad: 'Husus', deger: (r) => esc(r.madde) + ' ' + etiketTesis(r) },
      { ad: 'Etki', sinif: 'text-center', deger: (r) => (r.etki ? 'E' + r.etki : '—') },
      { ad: 'Gözden geçirme', deger: (r) => tarih(r.gozden_gecirme) },
    ],
  });

  // ---------- İlgili taraflar (FRM.04.02) ----------
  const PERIYOT = [['', '—'], ['Sürekli', 'Sürekli'], ['Aylık', 'Aylık'], ['3 aylık', '3 aylık'], ['6 aylık', '6 aylık'], ['Yıllık', 'Yıllık'], ['2 yılda bir', '2 yılda bir']];
  const taraf = Kayit.olustur({
    id: 'baglam_taraf', tablo: 'iso_taraf', baslik: 'İlgili taraflar (FRM.04.02)', sorgu: 'select=*&order=sira,id', suz: tesisSuz,
    aciklama: 'Paydaşların ihtiyaç/beklentileri, karşılanma yönetimi ve izleme periyodu. Gözden geçirme tarihi 12 aydan eskiyse ⏱ görünür.',
    alanlar: [
      { k: 'taraf', ad: 'İlgili taraf', tip: 'text', zorunlu: true, genis: true },
      { k: 'beklenti', ad: 'İhtiyaç / beklenti', tip: 'area', genis: true },
      { k: 'surec', ad: 'Karşılanma yönetimi (süreç)', tip: 'text' },
      { k: 'sorumlu', ad: 'Takip sorumlusu', tip: 'text' },
      { k: 'ilgili_dokuman', ad: 'İlgili doküman', tip: 'text', genis: true },
      { k: 'izleme_periyodu', ad: 'İzleme periyodu', tip: 'sel', sec: PERIYOT },
      { k: 'son_gozden_gecirme', ad: 'Son gözden geçirme', tip: 'date' },
      { k: 'tesis', ad: 'Kapsam', tip: 'sel', sec: TESIS },
      { k: 'sira', ad: 'Sıra', tip: 'int' },
    ],
    yeni: () => ({ tesis: '', izleme_periyodu: 'Yıllık' }),
    hazirla: (r) => Object.assign({}, r, { tesis: r.tesis || null, izleme_periyodu: r.izleme_periyodu || null }),
    araclar: (k, yaz) => (yaz ? '<button onclick="Baglam.excel(\'taraf\')" class="px-3 py-1.5 rounded-lg text-xs border border-slate-600 text-slate-300">Excel\'den aktar (FRM.04.02)</button>' : ''),
    minGenislik: 760,
    kolonlar: [
      { ad: '#', deger: (r) => esc(r.sira || '') },
      { ad: 'İlgili taraf', deger: (r) => `<b class="text-slate-100">${esc(r.taraf)}</b> ${etiketTesis(r)}` },
      { ad: 'İhtiyaç / beklenti', deger: (r) => kisa(r.beklenti, 110) },
      { ad: 'Süreç', deger: (r) => esc(r.surec || '') },
      { ad: 'Sorumlu', deger: (r) => esc(r.sorumlu || '') },
      { ad: 'Periyot', deger: (r) => esc(r.izleme_periyodu || '—') },
      { ad: 'Gözden geçirme', deger: (r) => tarih(r.son_gozden_gecirme) + (r.aktif !== false && (!r.son_gozden_gecirme || gec(r.son_gozden_gecirme)) ? ' <span class="text-rose-400" title="12 aydan eski / hiç yok">⏱</span>' : '') },
    ],
  });

  // ---------- Yasal şartlar (FRM.04.03) ----------
  const UYGUN = { uygun: ['Uygun', 'bg-emerald-500/15 text-emerald-400'], kismen: ['Kısmen', 'bg-amber-500/15 text-amber-400'], uygun_degil: ['Uygun değil', 'bg-rose-500/15 text-rose-400'], izlemede: ['İzlemede', 'bg-slate-500/15 text-slate-300'] };
  const yasal = Kayit.olustur({
    id: 'baglam_yasal', tablo: 'iso_yasal', baslik: 'Yasal ve diğer şartlara uygunluk takibi (FRM.04.03)', sorgu: 'select=*&order=yonetmelik,id',
    aciklama: 'Yönetmelik/madde bazında uygunluk durumu ve sonraki kontrol tarihi. Kontrol tarihi geçenler ⏱ ile işaretlenir.',
    alanlar: [
      { k: 'yonetmelik', ad: 'Yönetmelik / mevzuat adı', tip: 'text', zorunlu: true, genis: true },
      { k: 'yayin_tarihi', ad: 'Yayın / yürürlük tarihi', tip: 'date' },
      { k: 'son_revizyon', ad: 'Son revizyon tarihi', tip: 'date' },
      { k: 'resmi_gazete', ad: 'Resmî Gazete no', tip: 'text' },
      { k: 'bolum_no', ad: 'İlgili bölüm no', tip: 'text' },
      { k: 'bolum_ad', ad: 'İlgili bölüm adı', tip: 'text', genis: true },
      { k: 'madde_no', ad: 'Madde no', tip: 'text' },
      { k: 'madde_ad', ad: 'Madde adı', tip: 'text' },
      { k: 'madde_metni', ad: 'İlgili madde (metin)', tip: 'area', genis: true },
      { k: 'periyot', ad: 'Geçerlilik / takip periyodu', tip: 'text' },
      { k: 'mevcut_durum', ad: 'Mevcut durum (kurumun uyumu)', tip: 'area', genis: true },
      { k: 'ilgili_dokuman', ad: 'İlgili doküman / bölüm', tip: 'text', genis: true },
      { k: 'uygunluk', ad: 'Uygunluk', tip: 'sel', sec: Object.entries(UYGUN).map(([d, [e]]) => [d, e]) },
      { k: 'son_kontrol', ad: 'Son kontrol', tip: 'date' },
      { k: 'sonraki_kontrol', ad: 'Sonraki kontrol', tip: 'date' },
      { k: 'sorumlu', ad: 'Sorumlu', tip: 'text' },
    ],
    yeni: () => ({ uygunluk: 'izlemede' }),
    araclar: (k, yaz) => (yaz ? '<button onclick="Baglam.excel(\'yasal\')" class="px-3 py-1.5 rounded-lg text-xs border border-slate-600 text-slate-300">Excel\'den aktar (FRM.04.03)</button>' : ''),
    ust: (satirlar) => {
      const a = satirlar.filter((r) => r.aktif !== false), say = (u) => a.filter((r) => r.uygunluk === u).length, geciken = a.filter((r) => r.sonraki_kontrol && new Date(r.sonraki_kontrol) < new Date()).length;
      return `<div class="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3 text-xs">${[['Uygun', say('uygun'), 'text-emerald-400'], ['Kısmen', say('kismen'), 'text-amber-400'], ['Uygun değil', say('uygun_degil'), say('uygun_degil') ? 'text-rose-400' : 'text-slate-300'], ['İzlemede', say('izlemede'), 'text-slate-300'], ['Kontrolü geçen', geciken, geciken ? 'text-rose-400' : 'text-emerald-400']].map(([b, n, r]) => `<div class="glass-card rounded-lg p-2"><div class="text-[10px] uppercase tracking-wider text-slate-500">${b}</div><div class="text-lg font-bold ${r}">${n}</div></div>`).join('')}</div>`;
    },
    minGenislik: 820,
    kolonlar: [
      { ad: 'Yönetmelik / mevzuat', deger: (r) => `<div class="text-slate-100">${kisa(r.yonetmelik, 90)}</div><div class="text-[10px] text-slate-500">${r.resmi_gazete ? 'RG ' + esc(r.resmi_gazete) + ' · ' : ''}${tarih(r.yayin_tarihi)}</div>` },
      { ad: 'Madde', deger: (r) => `<div class="font-mono">${esc(r.madde_no || '')}</div><div class="text-[10px] text-slate-500">${kisa(r.madde_ad, 40)}</div>` },
      { ad: 'Madde metni', deger: (r) => kisa(r.madde_metni, 100) },
      { ad: 'Periyot', deger: (r) => esc(r.periyot || '—') },
      { ad: 'Mevcut durum', deger: (r) => kisa(r.mevcut_durum, 90) },
      { ad: 'Uygunluk', deger: (r) => `<span class="px-2 py-0.5 rounded-full text-[10px] ${UYGUN[r.uygunluk][1]}">${UYGUN[r.uygunluk][0]}</span>` },
      { ad: 'Sonraki kontrol', deger: (r) => tarih(r.sonraki_kontrol) + (r.sonraki_kontrol && new Date(r.sonraki_kontrol) < new Date() && r.aktif !== false ? ' <span class="text-rose-400">⏱</span>' : '') },
    ],
  });

  const BOLUMLER = { swot: ['Bağlam (SWOT)', swot], husus: ['İç ve dış hususlar', husus], taraf: ['İlgili taraflar', taraf], yasal: ['Yasal şartlar', yasal] };

  // ---------- Excel'den aktarım ----------
  const cell = (v) => (v == null ? '' : v instanceof Date ? v : String(v).replace(/\s+/g, ' ').trim());
  const metin = (v) => { v = cell(v); return v instanceof Date ? '' : v; };
  const iso = (v) => {
    if (v instanceof Date && !isNaN(v)) { const x = new Date(v.getTime() + 12 * 3600e3); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; }
    const m = String(v || '').match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
  };
  const sayiMi = (s) => /^\d+$/.test(String(s));
  const PARSER = {
    swot(g) {
      const cikti = []; let mod = null;
      const baslik = (r, ad) => r.findIndex((c) => String(metin(c)).toLocaleUpperCase('tr').includes(ad));
      g.forEach((r) => {
        const a = baslik(r, 'GÜÇLÜ YANLAR'), b = baslik(r, 'FIRSATLAR');
        if (a >= 0) mod = [[a, 'guclu'], [baslik(r, 'ZAYIF YANLAR'), 'zayif']];
        else if (b >= 0) mod = [[b, 'firsat'], [baslik(r, 'TEHDİTLER'), 'tehdit']];
        else if (mod) mod.forEach(([c, tip]) => { const t = metin(r[c + 1]); if (c >= 0 && t && !sayiMi(t)) cikti.push({ kaynak: 'FRM.04.01', tip, madde: t, sira: cikti.filter((x) => x.tip === tip).length + 1 }); });
      });
      return cikti;
    },
    husus(g) {
      const cikti = []; let h = -1;
      g.forEach((r) => {
        if (String(metin(r[1])).toLocaleUpperCase('tr').includes('İÇ HUSUSLAR')) { h = 1; return; }
        if (h < 0) return;
        [[2, 'ic'], [5, 'dis']].forEach(([c, tip]) => { const t = metin(r[c]); if (t && !sayiMi(t)) cikti.push({ kaynak: 'FRM.04.05', tip, madde: t, sira: cikti.filter((x) => x.tip === tip).length + 1 }); });
      });
      return cikti;
    },
    taraf(g) {
      const cikti = []; let basladi = false;
      g.forEach((r) => {
        if (String(metin(r[0])).toLocaleUpperCase('tr').startsWith('SIRA')) { basladi = true; return; }
        if (!basladi || !sayiMi(metin(r[0])) || !metin(r[1])) return;
        cikti.push({ sira: parseInt(metin(r[0]), 10), taraf: metin(r[1]), beklenti: metin(r[2]) || null, surec: metin(r[3]) || null, sorumlu: metin(r[4]) || null, ilgili_dokuman: metin(r[5]) || null, izleme_periyodu: 'Yıllık' });
      });
      return cikti;
    },
    yasal(g) {
      const cikti = []; let basladi = false, y = {};
      g.forEach((r) => {
        if (String(metin(r[0])).toLocaleLowerCase('tr').startsWith('yönetmelik adı')) { basladi = true; return; }
        if (!basladi) return;
        if (metin(r[0])) y = { yonetmelik: metin(r[0]), yayin_tarihi: iso(r[1]), son_revizyon: iso(r[2]), resmi_gazete: metin(r[3]) || null };
        if (metin(r[5])) y = Object.assign({}, y, { bolum_no: metin(r[5]), bolum_ad: metin(r[6]) || null });
        if (!metin(r[7]) && !metin(r[9])) return;
        if (!y.yonetmelik) return;
        cikti.push({ yonetmelik: y.yonetmelik, yayin_tarihi: y.yayin_tarihi || null, son_revizyon: y.son_revizyon || null, resmi_gazete: y.resmi_gazete || null, bolum_no: y.bolum_no || null, bolum_ad: y.bolum_ad || null,
          madde_no: metin(r[7]) || null, madde_ad: metin(r[8]) || null, madde_metni: metin(r[9]).slice(0, 4000) || null, periyot: metin(r[10]) || null, mevcut_durum: metin(r[11]).slice(0, 2000) || null, ilgili_dokuman: metin(r[12]) || null, uygunluk: 'izlemede' });
      });
      return cikti;
    },
  };
  const ANAHTAR = { swot: (r) => r.tip + '|' + r.madde, husus: (r) => r.tip + '|' + r.madde, taraf: (r) => r.taraf, yasal: (r) => r.yonetmelik + '|' + (r.madde_no || '') + '|' + (r.madde_metni || '').slice(0, 40) };
  const TABLO = { swot: swot, husus: husus, taraf: taraf, yasal: yasal };

  function xlsxYukle() {
    if (window.XLSX) return Promise.resolve();
    return new Promise((ok, hata) => {
      const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload = ok; s.onerror = () => hata(new Error('Excel okuyucu yüklenemedi (internet bağlantısı?)')); document.head.appendChild(s);
    });
  }
  function excel(tur) {
    const girdi = document.createElement('input'); girdi.type = 'file'; girdi.accept = '.xlsx';
    girdi.onchange = async () => {
      const f = girdi.files[0], k = TABLO[tur]; if (!f) return;
      try {
        await xlsxYukle();
        const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: true });
        const g = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: true });
        const satirlar = PARSER[tur](g);
        if (!satirlar.length) return k.bildir('Dosyada aktarılacak satır bulunamadı. Doğru formu (' + { swot: 'FRM.04.01', husus: 'FRM.04.05', taraf: 'FRM.04.02', yasal: 'FRM.04.03' }[tur] + ') seçtiğinizden emin olun.', true);
        const var_ = new Set(k.satirlar.map(ANAHTAR[tur])), yeni = satirlar.filter((r) => !var_.has(ANAHTAR[tur](r)));
        if (!yeni.length) return k.bildir('Dosyadaki ' + satirlar.length + ' satırın hepsi zaten kayıtlı.', true);
        if (!confirm(satirlar.length + ' satır okundu, ' + yeni.length + ' tanesi yeni. Eklensin mi?')) return;
        await k.rest(k.cfg.tablo, { method: 'POST', prefer: 'return=minimal', body: yeni });
        await k.yenile(); k.bildir(yeni.length + ' kayıt eklendi.');
      } catch (e) { k.bildir(e.message || String(e), true); }
    };
    girdi.click();
  }

  // ---------- panel ----------
  function panel(tesisId, el) {
    tesis = tesisId;
    el.innerHTML = `<div class="space-y-4"><div class="flex flex-wrap gap-1" id="baglamNav"></div><div id="baglamIcerik"></div></div>`;
    goster();
  }
  function goster() {
    document.getElementById('baglamNav').innerHTML = Object.entries(BOLUMLER).map(([b, [ad]]) => `<button onclick="Baglam.bolum('${b}')" class="px-3 py-1.5 rounded-lg text-xs font-semibold ${b === bolum ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30' : 'border border-slate-700 text-slate-400 hover:text-slate-200'}">${ad}</button>`).join('');
    BOLUMLER[bolum][1].ciz(document.getElementById('baglamIcerik'));
  }
  window.Baglam = {
    panel, excel,
    bolum(b) { bolum = b; goster(); },
    swotEkle(t) { swot._tip = t; swot.ac(); },
    _test: { PARSER },
  };
})();
