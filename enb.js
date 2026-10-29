/* EnB yönetimi (ISO 50006 / 50004 / 50015): ISO 50001 → tesis → "EnB, SEU ve M&V" alt sekmesi.
 *  (1) Model kalitesi: referans çizgisi modellerinin R², gözlem sayısı ve anlamlılığı (data/iso_model.json, collector/iso_model_kalite.py; şifresiz, yalnız kalite göstergeleri).
 *  (2) EnB değişiklik defteri: olağandışı dönem, model revizyonu, kapsam değişikliği, statik faktör (supabase/iso_enb.sql).
 *  (3) SEU: önemli enerji kullanımları, %80 kuralı ile aday önerisi, ilgili değişkenler ve EnB yöntemi.
 *  (4) M&V (ISO 50015): eylem bazında tasarruf doğrulaması; tasarruf ve belirsizlik sınırı SUNUCUDA hesaplanır.
 */
(function () {
  const { esc, tarih } = Kayit;
  const TESIS_AD = { aassm: 'AASSM', buz: 'Buz Sporları', buca: 'Buca SYK' };
  let tesis = null, bolum = 'model', seriler = [], model = null, modelHata = null;
  const tesisSuz = (r) => r.tesis === tesis;
  const tr = (n, d) => (n == null || isNaN(n) ? '—' : Number(n).toLocaleString('tr-TR', { maximumFractionDigits: d == null ? 0 : d }));
  const kart = (b, n, r, alt) => `<div class="glass-card rounded-lg p-2"><div class="text-[10px] uppercase tracking-wider text-slate-500">${b}</div><div class="text-lg font-bold ${r || 'text-slate-200'}">${n}</div>${alt ? `<div class="text-[10px] text-slate-500">${alt}</div>` : ''}</div>`;

  // ---------- Model kalitesi ----------
  const KALITE = {
    iyi: ['İyi', 'bg-emerald-500/15 text-emerald-400'], orta: ['Orta', 'bg-amber-500/15 text-amber-400'], zayif: ['Zayıf', 'bg-rose-500/15 text-rose-400'],
    ortalama: ['Ortalama (model yok)', 'bg-slate-500/15 text-slate-300'], belirsiz: ['Belirsiz', 'bg-slate-500/15 text-slate-300'],
  };
  async function yukle() {
    if (model || modelHata) return;
    try { const r = await fetch('data/iso_model.json', { cache: 'no-cache' }); if (!r.ok) throw new Error('HTTP ' + r.status); const j = await r.json(); model = {}; (j.seriler || []).forEach((s) => { model[s.id] = s; }); model._esik = j.esikler; }
    catch (e) { modelHata = 'Model kalite dosyası okunamadı (data/iso_model.json). Üretmek için: python3 collector/iso_model_kalite.py "<TSE klasörü>".'; }
  }
  const rozet = (id) => {
    const m = model && model[id]; if (!m) return '';
    const [ad, sin] = KALITE[m.kalite] || KALITE.belirsiz;
    return `<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold ${sin}" title="${esc(m.aciklama || '')}">${m.yontem === 'regresyon' ? 'Model R² ' + tr(m.r2, 2) + ' · ' : ''}${ad}</span>`;
  };

  const modelBolumu = {
    async ciz(el) {
      await yukle();
      if (modelHata) { el.innerHTML = `<div class="glass-card rounded-xl p-5 text-sm text-slate-300">${esc(modelHata)}</div>`; return; }
      const liste = seriler.filter((s) => s.tesis === tesis).map((s) => ({ s, m: model[s.id] })).filter((x) => x.m);
      const say = (k) => liste.filter((x) => x.m.kalite === k).length;
      const e = model._esik || {};
      el.innerHTML = `<div class="space-y-3">
        <div><h3 class="text-sm font-bold text-white">Referans çizgisi modellerinin kalitesi</h3>
        <p class="text-[11px] text-slate-500">ISO 50006: EnB, ilgili değişkenlerle kurulan modelin enerji tüketimini yeterince açıkladığı ölçüde güvenilirdir. Değerler FRM.06.07 EnRÇ dosyalarındaki Excel regresyon çıktısından alınmıştır (son yıl dosyası); burada yeniden hesaplanmaz.</p></div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          ${kart('Seri', liste.length)}
          ${kart('Regresyonlu', liste.filter((x) => x.m.yontem === 'regresyon').length, '', 'geri kalanı baz dönem ortalaması')}
          ${kart('İyi', say('iyi'), 'text-emerald-400', 'R² ≥ ' + tr(e.r2_iyi, 2) + ' ve anlamlı')}
          ${kart('Zayıf / orta', say('zayif') + ' / ' + say('orta'), say('zayif') ? 'text-rose-400' : say('orta') ? 'text-amber-400' : 'text-emerald-400', 'zayıf: R² &lt; ' + tr(e.r2_zayif, 2))}
        </div>
        <div class="glass-card rounded-xl overflow-hidden"><div class="overflow-x-auto"><table class="w-full text-xs" style="min-width:760px">
          <thead class="text-slate-400 uppercase tracking-wider text-[10px]"><tr><th class="px-3 py-2 text-left">Bölüm / enerji</th><th class="px-3 py-2 text-left">Yöntem</th><th class="px-3 py-2 text-right">R²</th><th class="px-3 py-2 text-right">Ayarlı R²</th><th class="px-3 py-2 text-right">Gözlem</th><th class="px-3 py-2 text-right">Değişken</th><th class="px-3 py-2 text-right">F anlamlılık</th><th class="px-3 py-2 text-left">Değerlendirme</th></tr></thead>
          <tbody>${liste.map(({ s, m }) => `<tr class="border-t border-slate-800/70 align-top"><td class="px-3 py-2 text-slate-100">${esc(s.bolum)}<div class="text-[10px] text-slate-500">${esc(s.enerji)}</div></td>
            <td class="px-3 py-2 text-slate-300">${m.yontem === 'regresyon' ? 'Regresyon' : 'Ortalama'}</td>
            <td class="px-3 py-2 text-right font-mono">${tr(m.r2, 2)}</td><td class="px-3 py-2 text-right font-mono text-slate-400">${tr(m.r2_ayarli, 2)}</td>
            <td class="px-3 py-2 text-right font-mono">${m.n == null ? '—' : m.n}</td><td class="px-3 py-2 text-right font-mono">${m.degisken_sayisi == null ? '—' : m.degisken_sayisi}</td>
            <td class="px-3 py-2 text-right font-mono ${m.f_anlamlilik != null && m.f_anlamlilik > (e.p || 0.05) ? 'text-rose-400' : ''}">${m.f_anlamlilik == null ? '—' : m.f_anlamlilik < 0.001 ? '&lt; 0,001' : tr(m.f_anlamlilik, 3)}</td>
            <td class="px-3 py-2">${rozet(s.id)}<div class="text-[10px] text-slate-500 mt-0.5">${esc(m.aciklama || '')}</div></td></tr>`).join('') || '<tr><td colspan="8" class="px-3 py-6 text-center text-slate-500">Bu tesis için model kaydı yok.</td></tr>'}</tbody></table></div></div>
        <ul class="list-disc pl-5 text-[11px] text-slate-500 space-y-1">
          <li><b class="text-slate-300">R²</b>: modelin tüketimdeki değişimin ne kadarını açıkladığı (0–1). Eşikler başlangıç değeridir (iyi ≥ ${tr(e.r2_iyi, 2)}, zayıf &lt; ${tr(e.r2_zayif, 2)}); ISO 50006 sabit eşik koymaz, ekip karar verir.</li>
          <li><b class="text-slate-300">Gözlem</b> 12 ay olduğundan az sayıda değişkenle çalışılmalıdır; <b class="text-slate-300">F anlamlılık</b> ${tr(e.p, 2)} üstündeyse model şansla da çıkabilir.</li>
          <li><b class="text-slate-300">Ortalama</b> yöntemli serilerde model yoktur: hava ya da etkinlik değişiminden kaynaklanan sapma, tasarruf gibi görünebilir. İlgili değişken (HDD/CDD, ziyaretçi, yemek sayısı) eklenmesi düşünülmelidir.</li>
          <li>Zayıf modelde sapma yorumlanmadan önce <b class="text-slate-300">EnB değişiklik defteri</b>ne olağandışı dönem / model revizyonu kaydı açılması önerilir.</li></ul></div>`;
    },
  };

  // ---------- EnB değişiklik defteri ----------
  const TUR = { olagandisi: 'Olağandışı dönem', model_revizyon: 'Model revizyonu', kapsam: 'Kapsam değişikliği', statik_faktor: 'Statik faktör değişimi', diger: 'Diğer' };
  const KARAR = { izlemede: ['İzlemede', 'bg-slate-500/15 text-slate-300'], dislandi: ['Dönem dışlandı', 'bg-sky-500/15 text-sky-300'], duzeltildi: ['EnB düzeltildi', 'bg-emerald-500/15 text-emerald-400'], revize_edildi: ['EnB revize edildi', 'bg-emerald-500/15 text-emerald-400'], degisiklik_yok: ['Değişiklik gerekmedi', 'bg-slate-500/15 text-slate-300'] };
  const serilerSec = () => [['', 'Tesis geneli']].concat(seriler.filter((s) => s.tesis === tesis).map((s) => [s.id, `${s.bolum} (${s.enerji})`]));
  const defter = Kayit.olustur({
    id: 'enb_defter', tablo: 'iso_enb_defter', baslik: 'EnB değişiklik defteri', sorgu: 'select=*&order=baslangic.desc.nullslast,id.desc', suz: tesisSuz,
    aciklama: 'ISO 50006: EnB yalnızca belirli durumlarda değiştirilir (statik faktör ya da kapsam değişimi, olağandışı dönem, model yetersizliği). Her kararın gerekçesi ve onayı burada tutulur.',
    alanlar: [
      { k: 'tesis', ad: 'Tesis', tip: 'sel', sec: Object.entries(TESIS_AD), zorunlu: true },
      { k: 'seri_id', ad: 'Seri', tip: 'sel', sec: () => serilerSec() },
      { k: 'tur', ad: 'Değişiklik türü', tip: 'sel', sec: Object.entries(TUR), zorunlu: true },
      { k: 'karar', ad: 'Karar', tip: 'sel', sec: Object.entries(KARAR).map(([d, [e]]) => [d, e]) },
      { k: 'baslik', ad: 'Başlık', tip: 'text', zorunlu: true, genis: true },
      { k: 'baslangic', ad: 'Başlangıç', tip: 'date' },
      { k: 'bitis', ad: 'Bitiş', tip: 'date' },
      { k: 'etki_kwh', ad: 'Tahmini etki (kWh eşdeğeri, + artış)', tip: 'num' },
      { k: 'onaylayan', ad: 'Onaylayan (unvan)', tip: 'text' },
      { k: 'onay_tarihi', ad: 'Onay tarihi', tip: 'date' },
      { k: 'aciklama', ad: 'Gerekçe / açıklama', tip: 'area', genis: true },
    ],
    yeni: () => ({ tesis, karar: 'izlemede', tur: 'olagandisi' }),
    hazirla: (r) => Object.assign({}, r, { seri_id: r.seri_id || null }),
    ust: (satirlar) => {
      const a = satirlar.filter((r) => r.aktif !== false && r.tesis === tesis);
      const bekleyen = a.filter((r) => r.karar === 'izlemede').length, onaysiz = a.filter((r) => r.karar !== 'izlemede' && r.karar !== 'degisiklik_yok' && !r.onay_tarihi).length;
      return `<div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-xs">${kart('Kayıt', a.length)}${kart('Karar bekleyen', bekleyen, bekleyen ? 'text-amber-400' : 'text-emerald-400', 'izlemede')}
        ${kart('Onay bekleyen', onaysiz, onaysiz ? 'text-amber-400' : 'text-emerald-400', 'karar var, onay tarihi yok')}${kart('EnB revize / düzeltme', a.filter((r) => r.karar === 'revize_edildi' || r.karar === 'duzeltildi').length)}</div>`;
    },
    bosIpucu: 'Örnekler: 2023 Şubat depremi nedeniyle etkinliklerin iptali (olağandışı dönem), yeni bir bölümün (Geriatri) kapsama alınması (kapsam), sandviç panel iyileştirmesi sonrası baz yılın güncellenmesi (model revizyonu).',
    minGenislik: 760,
    kolonlar: [
      { ad: 'Kayıt', deger: (r) => `<div class="text-slate-100">${esc(r.baslik)}</div><div class="text-[10px] text-slate-500">${esc(((seriler.find((s) => s.id === r.seri_id) || {}).bolum) || (r.seri_id ? r.seri_id : 'Tesis geneli'))}</div>` },
      { ad: 'Tür', deger: (r) => esc(TUR[r.tur] || r.tur) },
      { ad: 'Dönem', deger: (r) => tarih(r.baslangic) + (r.bitis ? ' – ' + tarih(r.bitis) : '') },
      { ad: 'Etki (kWh)', sinif: 'text-right', deger: (r) => tr(r.etki_kwh) },
      { ad: 'Karar', deger: (r) => { const [ad, sin] = KARAR[r.karar] || [r.karar, '']; return `<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold ${sin}">${esc(ad)}</span>`; } },
      { ad: 'Onay', deger: (r) => r.onay_tarihi ? tarih(r.onay_tarihi) + `<div class="text-[10px] text-slate-500">${esc(r.onaylayan || '')}</div>` : '<span class="text-slate-500">—</span>' },
    ],
  });

  // ---------- SEU ----------
  const ENERJI = { elektrik: 'Elektrik', dogalgaz: 'Doğalgaz', diger: 'Diğer' };
  const YONTEM = { olcum: 'Ölçüm', hesap: 'Hesap', tahmin: 'Tahmin' };
  const ENB_Y = { ortalama: 'Ortalama', regresyon: 'Regresyon', oran: 'Oran (kWh/birim)', yok: 'Henüz yok' };
  const seuHesap = (satirlar) => {
    const a = satirlar.filter((r) => r.aktif !== false && r.tesis === tesis && r.yillik_kwh > 0).sort((x, y) => y.yillik_kwh - x.yillik_kwh);
    const top = a.reduce((t, r) => t + r.yillik_kwh, 0); let kum = 0;
    return { a, top, liste: a.map((r) => { const onceki = kum; kum += r.yillik_kwh; return Object.assign({ pay: r.yillik_kwh / top, kum: kum / top, aday: onceki / top < 0.8 }, r); }) };
  };
  const seu = Kayit.olustur({
    id: 'enb_seu', tablo: 'iso_seu', baslik: 'Önemli enerji kullanımları — SEU (ISO 50001 madde 6.3)', sorgu: 'select=*&order=yillik_kwh.desc.nullslast', suz: tesisSuz,
    aciklama: 'Yük grubu / sistem bazında yıllık tüketim girilir; panel tüketimin ilk ~%80\'ini oluşturanları SEU adayı olarak işaretler (yaygın uygulama; karar ekibindir). Ölçüm planındaki analizör noktası bağlanırsa tüketim ölçümden alınabilir.',
    alanlar: [
      { k: 'tesis', ad: 'Tesis', tip: 'sel', sec: Object.entries(TESIS_AD), zorunlu: true },
      { k: 'ad', ad: 'Kullanım / sistem', tip: 'text', zorunlu: true, genis: true },
      { k: 'enerji', ad: 'Enerji türü', tip: 'sel', sec: Object.entries(ENERJI) },
      { k: 'yillik_kwh', ad: 'Yıllık tüketim (kWh eşdeğeri)', tip: 'num', min: 0 },
      { k: 'yontem', ad: 'Tüketimin kaynağı', tip: 'sel', sec: Object.entries(YONTEM) },
      { k: 'olcum_kod', ad: 'Ölçüm noktası kodu (olcum_plan)', tip: 'text' },
      { k: 'degiskenler', ad: 'İlgili değişkenler (CDD, HDD, ziyaretçi, doluluk …)', tip: 'text', genis: true },
      { k: 'enb_yontemi', ad: 'EnB yöntemi', tip: 'sel', bos: true, sec: Object.entries(ENB_Y) },
      { k: 'seu_mu', ad: 'Ekip kararı', tip: 'sel', bos: true, sec: [['true', 'SEU'], ['false', 'SEU değil']] },
      { k: 'gerekce', ad: 'Gerekçe', tip: 'area', genis: true },
    ],
    yeni: () => ({ tesis, enerji: 'elektrik', yontem: 'tahmin' }),
    hazirla: (r) => Object.assign({}, r, { seu_mu: r.seu_mu === 'true' || r.seu_mu === true ? true : r.seu_mu === 'false' || r.seu_mu === false ? false : null, enb_yontemi: r.enb_yontemi || null }),
    ust: (satirlar) => {
      const { liste, top } = seuHesap(satirlar);
      if (!liste.length) return '';
      const sayi = liste.filter((r) => r.aday).length;
      return `<div class="glass-card rounded-xl p-3 mt-3"><div class="flex items-center justify-between text-[11px] text-slate-400 mb-2"><span>Toplam ${tr(top)} kWh • ${sayi} kullanım tüketimin ilk %80\'ini oluşturuyor</span><span>kümülatif pay</span></div>
        <div class="space-y-1.5">${liste.map((r) => `<div class="text-[11px]"><div class="flex justify-between"><span class="${r.aday ? 'text-amber-300 font-semibold' : 'text-slate-300'}">${esc(r.ad)}${r.seu_mu === true ? ' ✔' : r.seu_mu === false ? ' ✘' : ''}</span><span class="font-mono text-slate-400">${tr(r.pay * 100, 1)}% · küm. ${tr(r.kum * 100, 0)}%</span></div>
          <div class="h-1.5 rounded-full bg-slate-800 overflow-hidden"><div class="h-full ${r.aday ? 'bg-amber-400' : 'bg-slate-600'}" style="width:${Math.min(100, r.pay * 100)}%"></div></div></div>`).join('')}</div>
        <p class="text-[10px] text-slate-500 mt-2">✔ ekip SEU dedi, ✘ SEU değil dedi; işaretsiz satırlarda turuncu = %80 kuralına göre aday. Tahmin kaynaklı tüketimlerle yapılan sıralama, analizör verisi gelince ölçümle güncellenmelidir.</p></div>`;
    },
    bosIpucu: 'AASSM ve Buz Sporları için 34 analizör noktası ("Ölçüm" sekmesindeki montaj planı) doğal SEU adaylarıdır: chiller, klima, havuz, buz sistemi, aydınlatma… Tüketimleri ilk ölçümlerden sonra buraya aktarın.',
    minGenislik: 760,
    satirSinif: () => '',
    kolonlar: [
      { ad: 'Kullanım', deger: (r) => `<div class="text-slate-100">${esc(r.ad)}</div><div class="text-[10px] text-slate-500">${esc(r.olcum_kod || '')}</div>` },
      { ad: 'Enerji', deger: (r) => esc(ENERJI[r.enerji] || r.enerji) },
      { ad: 'Yıllık kWh', sinif: 'text-right', deger: (r) => tr(r.yillik_kwh) + `<div class="text-[10px] text-slate-500">${esc(YONTEM[r.yontem] || '')}</div>` },
      { ad: 'İlgili değişken', deger: (r) => esc(r.degiskenler || '—') },
      { ad: 'EnB yöntemi', deger: (r) => esc(ENB_Y[r.enb_yontemi] || '—') },
      { ad: 'SEU', sinif: 'text-center', deger: (r) => r.seu_mu === true ? '<span class="text-emerald-400 font-semibold">Evet</span>' : r.seu_mu === false ? '<span class="text-slate-500">Hayır</span>' : '<span class="text-slate-500">karar yok</span>' },
    ],
  });

  // ---------- M&V (ISO 50015) ----------
  const SECENEK = { izole_ana: 'Seçenek A — izole sınır, ana parametre ölçülür', izole_tum: 'Seçenek B — izole sınır, tüm parametreler ölçülür', tum_tesis: 'Seçenek C — tüm tesis (fatura/ana sayaç)', simulasyon: 'Seçenek D — kalibre edilmiş simülasyon' };
  const MV_DURUM = { plan: ['Plan', 'bg-slate-500/15 text-slate-300'], baz_olculdu: ['Baz ölçüldü', 'bg-sky-500/15 text-sky-300'], rapor_hazir: ['Rapor dönemi hazır', 'bg-amber-500/15 text-amber-400'], dogrulandi: ['Doğrulandı', 'bg-emerald-500/15 text-emerald-400'] };
  const mv = Kayit.olustur({
    id: 'enb_mv', tablo: 'iso_mv', baslik: 'Ölçme ve doğrulama — M&V (ISO 50015)', sorgu: 'select=*&order=id.desc', suz: tesisSuz,
    aciklama: 'Tasarruf = (baz tüketim + rutin düzeltme + rutin dışı düzeltme) − rapor dönemi tüketimi. Tasarruf, belirsizlik sınırının üstündeyse anlamlı sayılır. Hesap sunucuda yapılır; yalnız baz ve rapor tüketimini girmeniz yeterlidir.',
    alanlar: [
      { k: 'tesis', ad: 'Tesis', tip: 'sel', sec: Object.entries(TESIS_AD), zorunlu: true },
      { k: 'ad', ad: 'Eylem / önlem', tip: 'text', zorunlu: true, genis: true },
      { k: 'eylem_ref', ad: 'Eylem planı referansı', tip: 'text' },
      { k: 'durum', ad: 'Durum', tip: 'sel', sec: Object.entries(MV_DURUM).map(([d, [e]]) => [d, e]) },
      { k: 'secenek', ad: 'Ölçüm seçeneği', tip: 'sel', sec: Object.entries(SECENEK), genis: true },
      { k: 'sinir', ad: 'Ölçüm sınırı', tip: 'text', genis: true },
      { k: 'baz_baslangic', ad: 'Baz dönem başlangıç', tip: 'date' },
      { k: 'baz_bitis', ad: 'Baz dönem bitiş', tip: 'date' },
      { k: 'rapor_baslangic', ad: 'Rapor dönemi başlangıç', tip: 'date' },
      { k: 'rapor_bitis', ad: 'Rapor dönemi bitiş', tip: 'date' },
      { k: 'baz_tuketim', ad: 'Baz dönem tüketimi (kWh eşdeğeri)', tip: 'num', min: 0 },
      { k: 'rutin_duzeltme', ad: 'Rutin düzeltme (kWh; hava, doluluk …)', tip: 'num' },
      { k: 'rutin_disi_duzeltme', ad: 'Rutin dışı düzeltme (kWh; kapsam/kullanım değişimi)', tip: 'num' },
      { k: 'rapor_tuketim', ad: 'Rapor dönemi tüketimi (kWh eşdeğeri)', tip: 'num', min: 0 },
      { k: 'belirsizlik_yuzde', ad: 'Belirsizlik (± % , uyarlanmış baz üzerinden)', tip: 'num', min: 0, max: 100 },
      { k: 'yontem_notu', ad: 'Düzeltme modeli, sayaç doğruluğu, varsayımlar', tip: 'area', genis: true },
    ],
    yeni: () => ({ tesis, durum: 'plan', secenek: 'tum_tesis' }),
    ust: (satirlar) => {
      const a = satirlar.filter((r) => r.aktif !== false && r.tesis === tesis), dog = a.filter((r) => r.durum === 'dogrulandi' && r.anlamli);
      const toplam = dog.reduce((t, r) => t + (r.tasarruf_kwh || 0), 0), anlamsiz = a.filter((r) => r.tasarruf_kwh != null && r.anlamli === false).length;
      return `<div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-xs">${kart('M&V kaydı', a.length)}${kart('Doğrulanmış tasarruf', tr(toplam) + ' kWh', toplam > 0 ? 'text-emerald-400' : '', dog.length + ' kayıt (anlamlı + doğrulandı)')}
        ${kart('Belirsizlik içinde', anlamsiz, anlamsiz ? 'text-amber-400' : 'text-emerald-400', 'tasarruf anlamlı değil')}${kart('Rapor bekleyen', a.filter((r) => r.durum === 'baz_olculdu' || r.durum === 'rapor_hazir').length)}</div>`;
    },
    bosIpucu: 'Tamamlanan her eylem (LED, kazan yenileme, yalıtım …) için bir M&V kaydı açın: önce baz dönemi, uygulamadan sonra rapor dönemi tüketimini girin. Hava gibi farklar için rutin düzeltme yazın.',
    minGenislik: 820,
    kolonlar: [
      { ad: 'Eylem', deger: (r) => `<div class="text-slate-100">${esc(r.ad)}</div><div class="text-[10px] text-slate-500">${esc((SECENEK[r.secenek] || '').split(' — ')[0])}${r.eylem_ref ? ' · ' + esc(r.eylem_ref) : ''}</div>` },
      { ad: 'Baz → rapor (kWh)', sinif: 'text-right', deger: (r) => `${tr(r.baz_tuketim)} → ${tr(r.rapor_tuketim)}` },
      { ad: 'Tasarruf (kWh)', sinif: 'text-right', deger: (r) => r.tasarruf_kwh == null ? '—' : `<span class="font-semibold ${r.tasarruf_kwh > 0 ? 'text-emerald-400' : 'text-rose-400'}">${tr(r.tasarruf_kwh)}</span><div class="text-[10px] text-slate-500">${tr(r.tasarruf_yuzde, 1)}%</div>` },
      { ad: 'Anlamlılık', deger: (r) => r.anlamli == null ? '<span class="text-slate-500">belirsizlik girilmedi</span>' : r.anlamli ? `<span class="text-emerald-400">Anlamlı</span><div class="text-[10px] text-slate-500">alt sınır ${tr(r.tasarruf_alt_kwh)}</div>` : `<span class="text-amber-400">Belirsizlik içinde</span><div class="text-[10px] text-slate-500">alt sınır ${tr(r.tasarruf_alt_kwh)}</div>` },
      { ad: 'Durum', deger: (r) => { const [ad, sin] = MV_DURUM[r.durum] || [r.durum, '']; return `<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold ${sin}">${esc(ad)}</span>`; } },
    ],
  });

  // ---------- panel ----------
  const BOLUMLER = { model: ['Model kalitesi', modelBolumu], defter: ['EnB değişiklik defteri', defter], seu: ['SEU (%80)', seu], mv: ['M&V (ISO 50015)', mv] };
  function panel(tesisId, el, seriListesi) {
    tesis = tesisId; if (seriListesi) seriler = seriListesi;
    el.innerHTML = '<div class="space-y-4"><div class="flex flex-wrap gap-1" id="enbNav"></div><div id="enbIcerik"></div></div>';
    goster();
  }
  function goster() {
    document.getElementById('enbNav').innerHTML = Object.entries(BOLUMLER).map(([b, [ad]]) => `<button onclick="Enb.bolum('${b}')" class="px-3 py-1.5 rounded-lg text-xs font-semibold ${b === bolum ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30' : 'border border-slate-700 text-slate-400 hover:text-slate-200'}">${ad}</button>`).join('');
    BOLUMLER[bolum][1].ciz(document.getElementById('enbIcerik'));
  }
  window.Enb = { panel, yukle, rozet, bolum(b) { bolum = b; goster(); } };
})();
