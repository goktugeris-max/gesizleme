/* Risk ve fırsat (FRM.06.01) ve panelden açılan eylemler (PLN.06.01) — Supabase'te düzenlenebilir kayıtlar (supabase/iso_kayit.sql).
 * Risk skoru (olasılık × etki), seviye (≥12 Yüksek, 6–11 Orta, ≤5 Düşük) ve eylem tamamlanma kuralı SUNUCUDA hesaplanır; burada yalnız önizleme gösterilir.
 * Excel'den gelen risk satırları (ISO verisi, tarayıcıda çözülmüş) tek tıkla veritabanına aktarılır (`Risk.panel(..., excelRisk)`).
 * Eylem planı sekmesinde, Excel'den okunan eylemlerin altında "panelden açılan eylemler" listesi görünür (`Risk.eylemPanel`).
 */
(function () {
  const { esc, tarih } = Kayit;
  const TESIS = [['genel', 'Genel (kurum)'], ['aassm', 'AASSM'], ['buz', 'Buz Sporları'], ['buca', 'Buca SYK']];
  const TESIS_AD = Object.fromEntries(TESIS);
  const SEV = (s) => (s == null ? null : s >= 12 ? 'Yüksek' : s >= 6 ? 'Orta' : 'Düşük');
  const SEV_SINIF = { 'Yüksek': 'bg-red-500/20 text-red-300', 'Orta': 'bg-amber-500/20 text-amber-300', 'Düşük': 'bg-emerald-500/20 text-emerald-300' };
  const rozetSkor = (s) => (s == null ? '<span class="text-slate-600">—</span>' : `<span class="px-2 py-0.5 rounded-md font-mono text-[11px] font-semibold ${SEV_SINIF[SEV(s)]}" title="${SEV(s)}">${s}</span>`);
  const DURUM_R = { acik: ['Açık', 'bg-rose-500/15 text-rose-300'], izlemede: ['İzlemede', 'bg-amber-500/15 text-amber-300'], kapali: ['Kapalı', 'bg-emerald-500/15 text-emerald-300'] };
  const DURUM_E = { planli: ['Planlı', 'bg-slate-500/15 text-slate-300'], devam: ['Devam ediyor', 'bg-sky-500/15 text-sky-300'], tamamlandi: ['Tamamlandı', 'bg-emerald-500/15 text-emerald-300'], iptal: ['İptal', 'bg-slate-500/15 text-slate-500'] };
  const kisa = (s, n) => { s = String(s || ''); return s.length > n ? esc(s.slice(0, n)) + '…' : esc(s); };
  const bugun = () => new Date().toISOString().slice(0, 10);
  let tesis = null, excelRisk = null, tur = 'hepsi';
  const tesisSuz = (r) => r.tesis === 'genel' || r.tesis === tesis;
  const eylemAcik = (e) => e.aktif !== false && e.durum !== 'iptal';

  // ---------- Eylem kayıtları ----------
  const eylem = Kayit.olustur({
    id: 'iso_eylem', tablo: 'iso_eylem', baslik: 'Panelden açılan eylemler', sorgu: 'select=*&order=termin.asc.nullslast,id', suz: tesisSuz,
    aciklama: 'Excel\'deki eylem planına ek olarak panelde açılan eylemler (riskten ya da hedeften). %100 = tamamlandı (sunucuda uygulanır); tamamlanma tarihi otomatik yazılır.',
    alanlar: [
      { k: 'ad', ad: 'Eylem', tip: 'text', zorunlu: true, genis: true },
      { k: 'aciklama', ad: 'Açıklama', tip: 'area', genis: true },
      { k: 'tesis', ad: 'Kapsam', tip: 'sel', sec: TESIS },
      { k: 'risk_id', ad: 'Bağlı risk', tip: 'sel', bos: true, sec: () => risk.satirlar.map((r) => [r.id, `#${r.id} ${r.no || ''} ${String(r.tanim).slice(0, 50)} (${r.skor == null ? '—' : r.skor})`]) },
      { k: 'hedef', ad: 'Bağlı enerji hedefi', tip: 'text', genis: true, yardim: 'ör. "2026 aylık tüketimi %2 azaltmak"' },
      { k: 'sorumlu', ad: 'Sorumlu', tip: 'text' },
      { k: 'termin', ad: 'Termin', tip: 'date' },
      { k: 'butce_tl', ad: 'Bütçe (TL)', tip: 'num', min: 0 },
      { k: 'durum', ad: 'Durum', tip: 'sel', sec: Object.entries(DURUM_E).map(([d, [e]]) => [d, e]) },
      { k: 'yuzde', ad: 'Tamamlanma %', tip: 'int', min: 0, max: 100 },
    ],
    yeni: () => ({ tesis: tesis || 'genel', durum: 'planli', yuzde: 0 }),
    oncesi: async () => { await risk.veri(); },   // bağlı risk listesi
    kayitSonrasi: () => { if (risk.el && document.body.contains(risk.el)) risk.yenile(); },   // eylem eklenince risklerdeki ⚠ ve sayılar güncellensin
    hazirla: (r) => Object.assign({}, r, { risk_id: r.risk_id ? parseInt(r.risk_id, 10) : null, yuzde: r.yuzde == null ? 0 : r.yuzde }),
    minGenislik: 780,
    satirSinif: (e) => (eylemAcik(e) && e.durum !== 'tamamlandi' && e.termin && e.termin < bugun() ? 'bg-rose-500/5' : ''),
    kolonlar: [
      { ad: 'Eylem', deger: (e) => `<div class="text-slate-100">${esc(e.ad)}</div>${e.risk_id ? `<div class="text-[10px] text-slate-500">Risk #${e.risk_id}</div>` : ''}${e.hedef ? `<div class="text-[10px] text-slate-500">Hedef: ${kisa(e.hedef, 60)}</div>` : ''}` },
      { ad: 'Kapsam', deger: (e) => esc(TESIS_AD[e.tesis]) },
      { ad: 'Sorumlu', deger: (e) => esc(e.sorumlu || '—') },
      { ad: 'Termin', deger: (e) => tarih(e.termin) + (eylemAcik(e) && e.durum !== 'tamamlandi' && e.termin && e.termin < bugun() ? ' <span class="text-rose-400" title="Termin geçti">⏱</span>' : '') },
      { ad: 'Bütçe', sinif: 'text-right', deger: (e) => (e.butce_tl == null ? '—' : Number(e.butce_tl).toLocaleString('tr-TR', { maximumFractionDigits: 0 }) + ' TL') },
      { ad: 'Durum', deger: (e) => `<span class="px-2 py-0.5 rounded-full text-[10px] ${DURUM_E[e.durum][1]}">${DURUM_E[e.durum][0]}</span>` },
      { ad: 'İlerleme', deger: (e) => `<div class="w-24 h-1.5 rounded bg-slate-700 overflow-hidden"><div class="h-full ${e.durum === 'tamamlandi' ? 'bg-emerald-500' : 'bg-sky-500'}" style="width:${e.yuzde || 0}%"></div></div><div class="text-[10px] text-slate-500 mt-0.5">%${e.yuzde || 0}</div>` },
    ],
    ust: (liste) => {
      const a = liste.filter((e) => tesisSuz(e) && eylemAcik(e)), say = (d) => a.filter((e) => e.durum === d).length, gec = a.filter((e) => e.durum !== 'tamamlandi' && e.termin && e.termin < bugun()).length;
      const butce = a.reduce((t, e) => t + (Number(e.butce_tl) || 0), 0);
      return `<div class="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3 text-xs">${[['Planlı', say('planli'), ''], ['Devam', say('devam'), 'text-sky-300'], ['Tamamlandı', say('tamamlandi'), 'text-emerald-400'], ['Termini geçen', gec, gec ? 'text-rose-400' : 'text-emerald-400'], ['Toplam bütçe', butce ? butce.toLocaleString('tr-TR', { maximumFractionDigits: 0 }) + ' TL' : '—', '']].map(([b, n, r]) => `<div class="glass-card rounded-lg p-2"><div class="text-[10px] uppercase tracking-wider text-slate-500">${b}</div><div class="text-lg font-bold ${r}">${n}</div></div>`).join('')}</div>`;
    },
  });

  // ---------- Risk kayıtları ----------
  const risk = Kayit.olustur({
    id: 'iso_risk', tablo: 'iso_risk', baslik: 'Risk ve fırsat değerlendirmesi (FRM.06.01)', sorgu: 'select=*&order=tesis,no,id', suz: (r) => tesisSuz(r) && (tur === 'hepsi' || r.tur === tur),
    aciklama: 'Skor = olasılık (1–5) × etki (1–5); ≥12 yüksek, 6–11 orta, ≤5 düşük. Yüksek riskte eylem yoksa ⚠ görünür.',
    oncesi: async () => { await eylem.veri(); },
    alanlar: [
      { k: 'tanim', ad: 'Risk / fırsat tanımı', tip: 'area', zorunlu: true, genis: true },
      { k: 'tur', ad: 'Tür', tip: 'sel', sec: [['Risk', 'Risk'], ['Fırsat', 'Fırsat']] },
      { k: 'tesis', ad: 'Kapsam', tip: 'sel', sec: TESIS },
      { k: 'no', ad: 'No', tip: 'text' },
      { k: 'proses', ad: 'Proses', tip: 'text' },
      { k: 'kaynak', ad: 'Kaynak (iç/dış)', tip: 'text', genis: true },
      { k: 'olasilik', ad: 'Olasılık (1–5)', tip: 'int', min: 1, max: 5 },
      { k: 'etki', ad: 'Etki (1–5)', tip: 'int', min: 1, max: 5 },
      { k: 'aksiyon', ad: 'Aksiyon / önlem', tip: 'area', genis: true },
      { k: 'faaliyet', ad: 'Sistematik faaliyetler', tip: 'area', genis: true },
      { k: 'sorumlu', ad: 'Sorumlu', tip: 'text' },
      { k: 'termin', ad: 'Termin', tip: 'date' },
      { k: 'sonra_olasilik', ad: 'Önlem sonrası olasılık', tip: 'int', min: 1, max: 5 },
      { k: 'sonra_etki', ad: 'Önlem sonrası etki', tip: 'int', min: 1, max: 5 },
      { k: 'durum', ad: 'Durum', tip: 'sel', sec: Object.entries(DURUM_R).map(([d, [e]]) => [d, e]) },
    ],
    yeni: () => ({ tesis: tesis || 'genel', tur: 'Risk', durum: 'acik' }),
    drawerUst: (r) => `<div id="riskOnizle" class="glass-card rounded-xl p-3 text-xs text-slate-300">Skor: ${rozetSkor(r.skor)} <span class="text-slate-500">(olasılık × etki; kayıtta sunucu hesaplar)</span>${r.sonra_skor != null ? ` &nbsp; Önlem sonrası: ${rozetSkor(r.sonra_skor)}` : ''}</div>`,
    drawerSonra: (r, k) => {
      const hesap = () => {
        const o = parseInt(k.alan('olasilik').value, 10), e = parseInt(k.alan('etki').value, 10), so = parseInt(k.alan('sonra_olasilik').value, 10), se = parseInt(k.alan('sonra_etki').value, 10);
        const s = o && e ? o * e : r.skor, ss = so && se ? so * se : r.sonra_skor, el = document.getElementById('riskOnizle');
        if (el) el.innerHTML = `Skor: ${rozetSkor(s)} <span class="text-slate-500">(olasılık × etki; kayıtta sunucu hesaplar)</span>${ss != null ? ` &nbsp; Önlem sonrası: ${rozetSkor(ss)}` : ''}`;
      };
      ['olasilik', 'etki', 'sonra_olasilik', 'sonra_etki'].forEach((a) => { const e = k.alan(a); if (e) e.addEventListener('input', hesap); });
    },
    drawerAlt: (r) => {
      if (!r.id) return '';
      const bagli = eylem.satirlar.filter((e) => e.risk_id === r.id && e.aktif !== false);
      return `<div class="glass-card rounded-xl p-3 space-y-2"><div class="flex items-center"><div class="text-[11px] uppercase tracking-wider text-slate-400 mr-auto">Bağlı eylemler (${bagli.length})</div>${risk.yetki() ? `<button onclick="Risk.eylemAc(${r.id})" class="text-xs text-amber-300 underline">+ Bu riskten eylem aç</button>` : ''}</div>
        <ul class="text-xs space-y-1">${bagli.map((e) => `<li class="flex gap-2"><span class="px-2 py-0.5 rounded-full text-[10px] ${DURUM_E[e.durum][1]}">${DURUM_E[e.durum][0]}</span><span class="text-slate-200">${esc(e.ad)}</span><span class="text-slate-500 ml-auto">%${e.yuzde}</span></li>`).join('') || '<li class="text-slate-500">Bağlı eylem yok.</li>'}</ul></div>`;
    },
    hazirla: (r) => r,
    araclar: (k, yaz) => {
      const butonlar = ['hepsi', 'Risk', 'Fırsat'].map((t) => `<button onclick="Risk.tur('${t}')" class="px-2.5 py-1 rounded-md text-[11px] font-semibold ${tur === t ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-slate-200'}">${t === 'hepsi' ? 'Tümü' : t}</button>`).join('');
      const aktar = yaz && excelRisk && k.satirlar.length === 0 && Object.values(excelRisk).some((l) => l && l.length)
        ? `<button onclick="Risk.excelAktar()" class="px-3 py-1.5 rounded-lg text-xs font-semibold border border-amber-500/40 text-amber-300">Excel verisinden aktar (${Object.values(excelRisk).reduce((t, l) => t + (l || []).length, 0)} kayıt)</button>` : '';
      return `<div class="flex gap-1 bg-slate-900/80 rounded-lg p-0.5">${butonlar}</div>${aktar}`;
    },
    ust: (liste) => {
      const a = liste.filter((r) => tesisSuz(r) && r.aktif !== false), riskler = a.filter((r) => r.tur === 'Risk'), yuksek = riskler.filter((r) => (r.skor || 0) >= 12 && r.durum !== 'kapali');
      const eylemsiz = yuksek.filter((r) => !eylem.satirlar.some((e) => e.risk_id === r.id && eylemAcik(e)));
      return `<div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-xs">${[['Risk', riskler.length, 'text-rose-300'], ['Fırsat', a.length - riskler.length, 'text-sky-300'], ['Yüksek seviyeli', yuksek.length, yuksek.length ? 'text-red-300' : 'text-emerald-400'], ['Yüksek, eylemi olmayan', eylemsiz.length, eylemsiz.length ? 'text-red-300' : 'text-emerald-400']].map(([b, n, r]) => `<div class="glass-card rounded-lg p-2"><div class="text-[10px] uppercase tracking-wider text-slate-500">${b}</div><div class="text-lg font-bold ${r}">${n}</div></div>`).join('')}</div>`;
    },
    minGenislik: 780,
    kolonlar: [
      { ad: 'No / proses', deger: (r) => `<div class="font-mono">${esc(r.no || '')}</div><div class="text-[10px] text-slate-500">${esc(r.proses || '')}</div><div class="text-[10px] text-slate-500">${esc(TESIS_AD[r.tesis])}</div>` },
      { ad: 'Tür', deger: (r) => `<span class="px-2 py-0.5 rounded-md text-[10px] font-semibold ${r.tur === 'Risk' ? 'bg-rose-500/15 text-rose-300' : 'bg-sky-500/15 text-sky-300'}">${esc(r.tur)}</span>` },
      { ad: 'Tanım', deger: (r) => kisa(r.tanim, 160) + (r.tur === 'Risk' && (r.skor || 0) >= 12 && r.durum !== 'kapali' && !eylem.satirlar.some((e) => e.risk_id === r.id && eylemAcik(e)) ? ' <span class="text-red-400" title="Yüksek risk — bağlı eylem yok">⚠</span>' : '') },
      { ad: 'O×E', sinif: 'text-center', deger: (r) => (r.olasilik && r.etki ? `${r.olasilik}×${r.etki}` : '—') },
      { ad: 'Skor', sinif: 'text-center', deger: (r) => rozetSkor(r.skor) },
      { ad: 'Sonra', sinif: 'text-center', deger: (r) => rozetSkor(r.sonra_skor) },
      { ad: 'Sorumlu', deger: (r) => esc(r.sorumlu || '—') },
      { ad: 'Durum', deger: (r) => `<span class="px-2 py-0.5 rounded-full text-[10px] ${DURUM_R[r.durum][1]}">${DURUM_R[r.durum][0]}</span>` },
    ],
  });

  // ---------- Excel verisinden (iso.js'in çözdüğü D.risk) aktarım ----------
  const aralik = (n) => (Number.isInteger(n) && n >= 1 && n <= 5 ? n : null);
  const skorSinir = (n) => (n != null && isFinite(n) && n >= 0 && n <= 25 ? Math.round(n) : null);
  async function excelAktar() {
    const satirlar = [];
    Object.entries(excelRisk || {}).forEach(([t, l]) => (l || []).forEach((x) => satirlar.push({
      tesis: TESIS_AD[t] ? t : 'genel', no: x.no || null, proses: x.proses || null, tur: x.tur === 'Fırsat' ? 'Fırsat' : 'Risk', kaynak: x.kaynak || null, tanim: String(x.tanim).slice(0, 2000),
      olasilik: aralik(x.o), etki: aralik(x.e), skor: skorSinir(x.seviye), aksiyon: x.aksiyon || null, sorumlu: x.sorumlu || null, faaliyet: x.faaliyet || null, sonra_skor: skorSinir(x.sonra),
    })));
    if (!satirlar.length) return;
    if (!confirm(satirlar.length + ' risk/fırsat satırı Excel verisinden veritabanına aktarılsın mı? (Skor olasılık×etki varsa sunucuda yeniden hesaplanır.)')) return;
    try { await risk.rest('iso_risk', { method: 'POST', prefer: 'return=minimal', body: satirlar }); await risk.yenile(); risk.bildir(satirlar.length + ' kayıt aktarıldı.'); }
    catch (e) { risk.bildir(e.message || String(e), true); }
  }

  window.Risk = {
    panel(tesisId, el, excel) {
      tesis = tesisId; excelRisk = excel || null;
      el.innerHTML = '<div id="riskHost"></div><div id="riskEylemHost" class="mt-8"></div>';
      risk.ciz(document.getElementById('riskHost')); eylem.ciz(document.getElementById('riskEylemHost'));
    },
    eylemPanel(tesisId, el) { tesis = tesisId; eylem.ciz(el); },
    tur(t) { tur = t; risk.yenile(); },
    excelAktar,
    eylemAc(riskId) {
      const r = risk.satir(riskId); if (!r) return;
      risk.kapat();
      eylem.cfg.yeni = () => ({ tesis: r.tesis, risk_id: r.id, ad: 'Önlem: ' + String(r.tanim).slice(0, 80), sorumlu: r.sorumlu || '', termin: r.termin || '', durum: 'planli', yuzde: 0 });
      eylem.ac();
      eylem.cfg.yeni = () => ({ tesis: tesis || 'genel', durum: 'planli', yuzde: 0 });
    },
  };
})();
