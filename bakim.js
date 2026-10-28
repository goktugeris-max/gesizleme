/* Bakım, kalibrasyon ve yetkinlik (ISO 50001 madde 7.2 ve 8): İBB-FRM-08-02 Periyodik Bakım, İBB-FRM-08-03 Kalibrasyona Tabi Cihazlar,
 * İBB-LST-07-01 Görev Bazlı Yetkinlik — Excel/Word yerine Supabase'te (supabase/iso_bakim.sql). ISO 50001 → tesis → "Bakım ve yetkinlik" alt sekmesi.
 * Bakım ve kalibrasyon tesise göre süzülür; yetkinlik matrisi kurum geneli GÖREV bazlıdır (kişi adı tutulmaz).
 * Mevcut Excel dosyaları "Excel'den aktar" ile içe alınır (SheetJS tarayıcıda; dosya sunucuya/depoya gitmez, yalnız satırlar kaydedilir).
 */
(function () {
  const { esc, tarih } = Kayit;
  const TESIS_AD = { aassm: 'AASSM', buz: 'Buz Sporları', buca: 'Buca SYK' };
  let tesis = null, bolum = 'bakim';
  const bugun = () => new Date().toISOString().slice(0, 10);
  const gecti = (d) => !!d && String(d).slice(0, 10) < bugun();
  const yakin = (d, gun) => { if (!d) return false; const f = (new Date(String(d).slice(0, 10)) - new Date(bugun())) / 86400000; return f >= 0 && f <= gun; };
  const tesisSuz = (r) => r.tesis === tesis;
  const kart = (b, n, r, alt) => `<div class="glass-card rounded-lg p-2"><div class="text-[10px] uppercase tracking-wider text-slate-500">${b}</div><div class="text-lg font-bold ${r || 'text-slate-200'}">${n}</div>${alt ? `<div class="text-[10px] text-slate-500">${alt}</div>` : ''}</div>`;
  const PERIYOT = [['', '—'], ['1', 'Aylık'], ['3', '3 aylık'], ['6', '6 aylık'], ['12', 'Yıllık'], ['24', '2 yılda bir']];
  const tarihZ = (d, bitis) => tarih(d) + (d && gecti(d) ? ' <span class="text-rose-400" title="Tarihi geçti">⏱</span>' : d && yakin(d, bitis || 30) ? ' <span class="text-amber-400" title="Yaklaşıyor">●</span>' : '');

  // ---------- Periyodik bakım (FRM-08-02 + yıllık gerçekleşme) ----------
  const bakim = Kayit.olustur({
    id: 'bakim_bakim', tablo: 'iso_bakim', baslik: 'Periyodik bakım (FRM-08-02)', sorgu: 'select=*&order=yil.desc.nullslast,grup.asc.nullslast,ad', suz: tesisSuz,
    aciklama: 'Cihaz/hizmet bazında bakım sıklığı, son ve sonraki bakım; yıllık planlanan ve yapılan bakım adedi. Sonraki bakım boş bırakılırsa son bakım + sıklıktan hesaplanır.',
    alanlar: [
      { k: 'tesis', ad: 'Tesis', tip: 'sel', sec: Object.entries(TESIS_AD), zorunlu: true },
      { k: 'ad', ad: 'Cihaz / bakım türü', tip: 'text', zorunlu: true, genis: true },
      { k: 'grup', ad: 'Grup', tip: 'text' },
      { k: 'yer', ad: 'Bulunduğu yer / bölüm', tip: 'text' },
      { k: 'periyot_ay', ad: 'Bakım sıklığı', tip: 'sel', sec: PERIYOT },
      { k: 'sorumlu', ad: 'Sorumlu (unvan)', tip: 'text' },
      { k: 'son_bakim', ad: 'Son bakım', tip: 'date' },
      { k: 'sonraki_bakim', ad: 'Sonraki bakım', tip: 'date' },
      { k: 'yil', ad: 'Yıl (yıllık özet)', tip: 'int', min: 2000, max: 2100 },
      { k: 'planlanan', ad: 'Planlanan bakım adedi', tip: 'int', min: 0 },
      { k: 'yapilan', ad: 'Yapılan bakım adedi', tip: 'int', min: 0 },
      { k: 'aciklama', ad: 'Açıklama', tip: 'area', genis: true },
    ],
    yeni: () => ({ tesis: tesis, yil: new Date().getFullYear() }),
    hazirla: (r) => Object.assign({}, r, { periyot_ay: r.periyot_ay ? parseInt(r.periyot_ay, 10) : null }),
    araclar: (k, yaz) => (yaz ? '<button onclick="Bakim.excel(\'bakim\')" class="px-3 py-1.5 rounded-lg text-xs border border-slate-600 text-slate-300">Excel\'den aktar (periyodik bakım verileri)</button>' : ''),
    ust: (satirlar) => {
      const a = satirlar.filter((r) => r.aktif !== false && r.tesis === tesis);
      const yil = Math.max(0, ...a.filter((r) => r.yil).map((r) => r.yil)), y = a.filter((r) => r.yil === yil);
      const pl = y.reduce((t, r) => t + (r.planlanan || 0), 0), yp = y.reduce((t, r) => t + Math.min(r.yapilan || 0, r.planlanan != null ? r.planlanan : Infinity), 0);
      const eksik = y.filter((r) => r.planlanan != null && (r.yapilan || 0) < r.planlanan).length, geciken = a.filter((r) => gecti(r.sonraki_bakim)).length, yaklasan = a.filter((r) => yakin(r.sonraki_bakim, 30)).length;
      return `<div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-xs">
        ${kart('Kayıt', a.length, '', yil ? yil + ' özeti: ' + y.length + ' kalem' : '')}
        ${kart('Plan gerçekleşme' + (yil ? ' ' + yil : ''), pl ? '%' + Math.round((yp / pl) * 100) : '—', pl ? (yp / pl >= 0.9 ? 'text-emerald-400' : yp / pl >= 0.7 ? 'text-amber-400' : 'text-rose-400') : '', pl ? yp + ' / ' + pl + ' bakım' : '')}
        ${kart('Planın gerisinde', eksik, eksik ? 'text-amber-400' : 'text-emerald-400', 'yapılan &lt; planlanan kalem')}
        ${kart('Bakım tarihi', geciken + ' geçen · ' + yaklasan + ' yaklaşan', geciken ? 'text-rose-400' : yaklasan ? 'text-amber-400' : 'text-emerald-400', '30 gün içinde dolacaklar')}</div>`;
    },
    bosIpucu: 'Excel\'deki "2025 periyodik bakım verileri" dosyasını "Excel\'den aktar" ile yükleyebilir ya da "+ Ekle" ile tek tek girebilirsiniz.',
    minGenislik: 760,
    kolonlar: [
      { ad: 'Cihaz / bakım türü', deger: (r) => `<div class="text-slate-100">${esc(r.ad)}</div><div class="text-[10px] text-slate-500">${esc([r.grup, r.yer].filter(Boolean).join(' · '))}</div>` },
      { ad: 'Yıl', sinif: 'text-center', deger: (r) => esc(r.yil || '—') },
      { ad: 'Planlanan', sinif: 'text-center', deger: (r) => (r.planlanan == null ? '—' : r.planlanan) },
      { ad: 'Yapılan', sinif: 'text-center', deger: (r) => (r.yapilan == null ? '—' : `<span class="${r.planlanan != null && r.yapilan < r.planlanan ? 'text-amber-400' : 'text-emerald-400'} font-semibold">${r.yapilan}</span>`) },
      { ad: 'Sıklık', deger: (r) => esc((PERIYOT.find((p) => p[0] === String(r.periyot_ay || '')) || [0, r.periyot_ay ? r.periyot_ay + ' ay' : '—'])[1]) },
      { ad: 'Son bakım', deger: (r) => tarih(r.son_bakim) },
      { ad: 'Sonraki bakım', deger: (r) => tarihZ(r.sonraki_bakim) },
    ],
  });

  // ---------- Kalibrasyona tabi cihazlar (FRM-08-03) ----------
  const DURUM = { aktif: ['Aktif', 'bg-emerald-500/15 text-emerald-400'], bakimda: ['Bakımda', 'bg-amber-500/15 text-amber-400'], devre_disi: ['Devre dışı', 'bg-slate-500/15 text-slate-300'] };
  const kalib = Kayit.olustur({
    id: 'bakim_kalib', tablo: 'iso_kalibrasyon', baslik: 'Kalibrasyona tabi cihazlar (FRM-08-03)', sorgu: 'select=*&order=ad', suz: tesisSuz,
    aciklama: 'Ölçüm yapan cihazların (analizör, sayaç, ölçü aletleri) kalibrasyon durumu. Sonraki kalibrasyon boş bırakılırsa son kalibrasyon + sıklıktan hesaplanır; süresi geçenler ⏱ ile işaretlenir.',
    alanlar: [
      { k: 'tesis', ad: 'Tesis', tip: 'sel', sec: Object.entries(TESIS_AD), zorunlu: true },
      { k: 'ad', ad: 'Cihaz adı', tip: 'text', zorunlu: true, genis: true },
      { k: 'seri_no', ad: 'Seri no', tip: 'text' },
      { k: 'durum', ad: 'Durumu', tip: 'sel', sec: Object.entries(DURUM).map(([d, [e]]) => [d, e]) },
      { k: 'periyot_ay', ad: 'Kalibrasyon sıklığı', tip: 'sel', sec: PERIYOT },
      { k: 'sertifika_no', ad: 'Sertifika no', tip: 'text' },
      { k: 'son_kalibrasyon', ad: 'Son kalibrasyon', tip: 'date' },
      { k: 'sonraki_kalibrasyon', ad: 'Sonraki kalibrasyon', tip: 'date' },
      { k: 'yer', ad: 'Bulunduğu yer / bölüm', tip: 'text' },
      { k: 'sorumlu', ad: 'Sorumlu (unvan)', tip: 'text' },
      { k: 'aciklama', ad: 'Açıklama', tip: 'area', genis: true },
    ],
    yeni: () => ({ tesis: tesis, durum: 'aktif', periyot_ay: '12' }),
    hazirla: (r) => Object.assign({}, r, { periyot_ay: r.periyot_ay ? parseInt(r.periyot_ay, 10) : null, durum: r.durum || 'aktif' }),
    ust: (satirlar) => {
      const a = satirlar.filter((r) => r.aktif !== false && r.tesis === tesis && r.durum !== 'devre_disi');
      const geciken = a.filter((r) => gecti(r.sonraki_kalibrasyon)).length, yaklasan = a.filter((r) => yakin(r.sonraki_kalibrasyon, 60)).length, tarihsiz = a.filter((r) => !r.sonraki_kalibrasyon).length;
      return `<div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-xs">${kart('Cihaz', a.length)}${kart('Süresi geçen', geciken, geciken ? 'text-rose-400' : 'text-emerald-400')}${kart('60 gün içinde', yaklasan, yaklasan ? 'text-amber-400' : 'text-emerald-400')}${kart('Tarihi girilmemiş', tarihsiz, tarihsiz ? 'text-amber-400' : 'text-emerald-400')}</div>`;
    },
    bosIpucu: 'FRM-08-03 henüz doldurulmamış görünüyor: kalibrasyona tabi cihazları (ör. analizörler, ölçü aletleri) "+ Ekle" ile girin.',
    minGenislik: 760,
    kolonlar: [
      { ad: 'Cihaz', deger: (r) => `<div class="text-slate-100">${esc(r.ad)}</div><div class="text-[10px] text-slate-500">${esc([r.seri_no && 'S/N ' + r.seri_no, r.yer].filter(Boolean).join(' · '))}</div>` },
      { ad: 'Durum', deger: (r) => `<span class="px-2 py-0.5 rounded-full text-[10px] ${DURUM[r.durum || 'aktif'][1]}">${DURUM[r.durum || 'aktif'][0]}</span>` },
      { ad: 'Sıklık', deger: (r) => esc((PERIYOT.find((p) => p[0] === String(r.periyot_ay || '')) || [0, r.periyot_ay ? r.periyot_ay + ' ay' : '—'])[1]) },
      { ad: 'Son kalibrasyon', deger: (r) => tarih(r.son_kalibrasyon) },
      { ad: 'Sonraki kalibrasyon', deger: (r) => tarihZ(r.sonraki_kalibrasyon, 60) },
      { ad: 'Sertifika', deger: (r) => esc(r.sertifika_no || '—') },
    ],
  });

  // ---------- Görev bazlı yetkinlik (LST-07-01) ----------
  const ROLLER = [['lider', 'Enerji Ekip Lideri'], ['yonetici', 'Enerji Yöneticileri'], ['uye', 'Enerji Ekip Üyesi'], ['bina', 'Bina Sorumluları'], ['diger', 'Diğer Çalışanlar']];
  const SEVIYE = ['Hiç', 'Zayıf', 'Orta', 'İyi', 'Çok iyi'];
  const yetkinlik = Kayit.olustur({
    id: 'bakim_yet', tablo: 'iso_yetkinlik', baslik: 'Görev bazlı yetkinlik matrisi (LST-07-01)', sorgu: 'select=*&order=sira.asc.nullslast,id',
    aciklama: 'Yetkinlik konusu × görev: mevcut → hedeflenen düzey (0 Hiç · 1 Zayıf · 2 Orta · 3 İyi · 4 Çok iyi). Kişi adı tutulmaz; hedefin altındaki hücreler eğitim ihtiyacıdır.',
    alanlar: [{ k: 'konu', ad: 'Yetkinlik konusu', tip: 'text', zorunlu: true, genis: true }, { k: 'sira', ad: 'Sıra', tip: 'int' }]
      .concat(ROLLER.map(([r, ad]) => ({ k: 'm_' + r, ad: 'Mevcut — ' + ad, tip: 'int', min: 0, max: 4 })), ROLLER.map(([r, ad]) => ({ k: 'h_' + r, ad: 'Hedef — ' + ad, tip: 'int', min: 0, max: 4 }))),
    araclar: (k, yaz) => (yaz ? '<button onclick="Bakim.excel(\'yetkinlik\')" class="px-3 py-1.5 rounded-lg text-xs border border-slate-600 text-slate-300">Excel\'den aktar (LST.07.01)</button>' : ''),
    govde: (liste) => {
      const hucre = (r, rol) => { const m = r['m_' + rol], h = r['h_' + rol]; if (m == null && h == null) return '<span class="text-slate-600">—</span>'; const acik = h != null && (m == null || h > m);
        return `<span class="${acik ? 'text-amber-300 font-semibold px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/30' : 'text-emerald-400'}" title="Mevcut ${m == null ? '—' : SEVIYE[m]} → hedef ${h == null ? '—' : SEVIYE[h]}">${m == null ? '–' : m} → ${h == null ? '–' : h}</span>`; };
      const ihtiyac = [];
      liste.forEach((r) => ROLLER.forEach(([rol, ad]) => { const m = r['m_' + rol], h = r['h_' + rol]; if (h != null && m != null && h > m) ihtiyac.push({ fark: h - m, konu: r.konu, rol: ad, m, h }); }));
      ihtiyac.sort((a, b) => b.fark - a.fark);
      return `<div class="glass-card rounded-xl overflow-hidden"><div class="overflow-x-auto"><table class="w-full text-xs" style="min-width:640px"><thead class="text-slate-400 uppercase tracking-wider text-[10px]"><tr><th class="px-3 py-2 text-left">Yetkinlik konusu</th>${ROLLER.map(([, ad]) => `<th class="px-2 text-center">${ad}</th>`).join('')}</tr></thead><tbody>
        ${liste.map((r) => `<tr onclick="Kayit.i('bakim_yet').ac(${r.id})" class="border-t border-slate-800/70 hover:bg-slate-800/40 cursor-pointer"><td class="px-3 py-2 text-slate-100">${esc(r.konu)}</td>${ROLLER.map(([rol]) => `<td class="px-2 text-center whitespace-nowrap">${hucre(r, rol)}</td>`).join('')}</tr>`).join('') || '<tr><td colspan="6" class="px-3 py-8 text-center text-slate-400">Henüz kayıt yok. "Excel\'den aktar (LST.07.01)" ile mevcut matrisi yükleyebilirsiniz.</td></tr>'}</tbody></table></div>
        <p class="px-3 py-2 text-[11px] text-slate-500">Hücre: mevcut → hedef. <span class="text-amber-300">Çerçeveli sarı</span> = hedefin altında (eğitim ihtiyacı), <span class="text-emerald-400">yeşil</span> = hedefte. Satıra tıklayınca düzenlenir.</p></div>
        ${ihtiyac.length ? `<div class="glass-card rounded-xl p-3 mt-3"><div class="text-xs font-bold text-white mb-1">Eğitim ihtiyacı (${ihtiyac.length} hücre)</div><ul class="text-xs text-slate-300 space-y-0.5">${ihtiyac.slice(0, 12).map((x) => `<li><b class="text-amber-300">+${x.fark}</b> ${esc(x.rol)} — ${esc(x.konu)} <span class="text-slate-500">(${x.m} → ${x.h})</span></li>`).join('')}</ul>${ihtiyac.length > 12 ? `<p class="text-[11px] text-slate-500 mt-1">… ve ${ihtiyac.length - 12} hücre daha (tabloda sarı görünenler).</p>` : ''}</div>` : (liste.length ? '<p class="text-xs text-emerald-400 mt-3">Tüm görevlerde hedef düzeye ulaşılmış.</p>' : '')}`;
    },
  });

  const BOLUMLER = { bakim: ['Periyodik bakım', bakim], kalib: ['Kalibrasyon', kalib], yetkinlik: ['Yetkinlik', yetkinlik] };

  // ---------- Excel'den aktarım ----------
  const NORM = (x) => String(x == null ? '' : x).toLocaleLowerCase('tr').replace(/[^a-z0-9ğüşıöç]/g, '');
  const metin = (v) => (v == null || v instanceof Date ? '' : String(v).replace(/\s+/g, ' ').trim());
  const tam = (v) => { const n = parseInt(String(v == null ? '' : v).trim(), 10); return isFinite(n) && n >= 0 ? n : null; };
  const PARSER = {
    // Üç sayfalı "periyodik bakım verileri": her sayfa bir tesis; başlık satırında "Bakım Türü / Yapılan / Planlanan"; BSYK'da grup sütunu var
    bakim(sayfalar) {
      const cikti = [];
      sayfalar.forEach(({ ad, g }) => {
        const baslikMetni = NORM(ad) + NORM(metin((g[0] || [])[0]));
        const t = baslikMetni.includes('aassm') || baslikMetni.includes('ahmedadnan') ? 'aassm' : baslikMetni.includes('bss') || baslikMetni.includes('buz') ? 'buz' : baslikMetni.includes('bsyk') || baslikMetni.includes('buca') ? 'buca' : null;
        const yil = parseInt((metin((g[0] || [])[0]).match(/(20\d\d)/) || [])[1], 10) || null;
        const hi = g.findIndex((r) => r.some((c) => NORM(c).startsWith('bakımtürü')));
        if (!t || hi < 0) return;
        const ix = (ad2) => g[hi].findIndex((c) => NORM(c).includes(ad2)), cy = ix('yapılan'), cp = ix('planlanan');
        if (cy < 0 && cp < 0) return;
        const sol = Math.min(...[cy, cp].filter((i) => i >= 0)); let grup = null;
        g.slice(hi + 1).forEach((r) => {
          const yazilar = r.slice(0, sol).map(metin).filter(Boolean); if (!yazilar.length) return;
          if (yazilar.length > 1) grup = yazilar[0];
          const yapilan = cy >= 0 ? tam(r[cy]) : null, planlanan = cp >= 0 ? tam(r[cp]) : null;
          if (yapilan == null && planlanan == null) return;
          cikti.push({ tesis: t, ad: yazilar[yazilar.length - 1].replace(/^./, (c) => c.toLocaleUpperCase('tr')), grup, yil, planlanan, yapilan });
        });
      });
      return cikti;
    },
    // LST.07.01: "Yetkinlikler" sayfası — konu, 5 görev için mevcut, boş sütun, 5 görev için hedef
    yetkinlik(sayfalar) {
      const s = sayfalar.find((x) => NORM(x.ad).includes('yetkinlikler')) || sayfalar.find((x) => x.g.some((r) => NORM(r[0]).includes('yetkinlikkonusu')));
      if (!s) return [];
      const hi = s.g.findIndex((r) => NORM(r[0]).includes('yetkinlikkonusu')); if (hi < 0) return [];
      const cikti = [];
      for (const r of s.g.slice(hi + 1)) {
        const konu = metin(r[0]); if (!konu) { if (cikti.length && r.every((c) => metin(c) === '')) continue; else if (cikti.length) break; else continue; }
        if (NORM(konu).startsWith('lejant')) break;
        const o = { konu, sira: cikti.length + 1 };
        ROLLER.forEach(([rol], i) => { o['m_' + rol] = tam(r[1 + i]); o['h_' + rol] = tam(r[7 + i]); });
        if (ROLLER.some(([rol]) => o['m_' + rol] != null || o['h_' + rol] != null)) cikti.push(o);
      }
      return cikti;
    },
  };
  const ANAHTAR = { bakim: (r) => r.tesis + '|' + NORM(r.ad) + '|' + (r.yil || ''), yetkinlik: (r) => NORM(r.konu) };
  const KAYIT = { bakim: bakim, yetkinlik: yetkinlik };
  const FORM = { bakim: 'periyodik bakım verileri', yetkinlik: 'LST.07.01 Görev Bazlı Yetkinlik Listesi' };

  function xlsxYukle() {
    if (window.XLSX) return Promise.resolve();
    return new Promise((ok, hata) => {
      const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload = ok; s.onerror = () => hata(new Error('Excel okuyucu yüklenemedi (internet bağlantısı?)')); document.head.appendChild(s);
    });
  }
  function excel(tur) {
    const girdi = document.createElement('input'); girdi.type = 'file'; girdi.accept = '.xlsx';
    girdi.onchange = async () => {
      const f = girdi.files[0], k = KAYIT[tur]; if (!f) return;
      try {
        await xlsxYukle();
        const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: true });
        const sayfalar = wb.SheetNames.map((ad) => ({ ad, g: XLSX.utils.sheet_to_json(wb.Sheets[ad], { header: 1, defval: '', raw: true }) }));
        const satirlar = PARSER[tur](sayfalar);
        if (!satirlar.length) return k.bildir('Dosyada aktarılacak satır bulunamadı. Doğru dosyayı (' + FORM[tur] + ') seçtiğinizden emin olun.', true);
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
    el.innerHTML = `<div class="space-y-4"><div class="flex flex-wrap gap-1" id="bakimNav"></div><div id="bakimIcerik"></div></div>`;
    goster();
  }
  function goster() {
    document.getElementById('bakimNav').innerHTML = Object.entries(BOLUMLER).map(([b, [ad]]) => `<button onclick="Bakim.bolum('${b}')" class="px-3 py-1.5 rounded-lg text-xs font-semibold ${b === bolum ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30' : 'border border-slate-700 text-slate-400 hover:text-slate-200'}">${ad}</button>`).join('');
    BOLUMLER[bolum][1].ciz(document.getElementById('bakimIcerik'));
  }
  window.Bakim = {
    panel, excel,
    bolum(b) { bolum = b; goster(); },
    _test: { PARSER },
  };
})();
