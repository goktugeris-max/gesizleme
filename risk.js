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
  const SEV_RENK = { 'Yüksek': '#ef4444', 'Orta': '#f59e0b', 'Düşük': '#10b981' };
  const rozetSkor = (s, tur) => (s == null ? '<span class="text-slate-600">—</span>' : tur === 'Fırsat' ? `<span class="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-slate-200" title="Fırsatta yüksek skor olumludur"><span class="inline-block w-2 h-2 rounded-full shrink-0" style="background:#38bdf8"></span><span class="font-semibold">${s}</span></span>` : `<span class="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-slate-200" title="${SEV(s)}"><span class="inline-block w-2 h-2 rounded-full shrink-0" style="background:${SEV_RENK[SEV(s)]}"></span><span class="font-semibold">${s}</span><span class="text-slate-500 font-normal hidden sm:inline">${SEV(s)}</span></span>`);
  const turEt = (t) => `<span class="inline-flex items-center gap-1.5 whitespace-nowrap"><span class="inline-block w-2 h-2 rounded-full" style="background:${t === 'Risk' ? '#ef4444' : '#38bdf8'}"></span>${esc(t)}</span>`;
  const durumEt = (ad, renk) => `<span class="inline-flex items-center gap-1.5 whitespace-nowrap text-xs"><span class="inline-block w-2 h-2 rounded-full shrink-0" style="background:${renk}"></span>${ad}</span>`;
  const R_RENK = { acik: '#ef4444', izlemede: '#f59e0b', kapali: '#10b981' }, E_RENK = { planli: '#94a3b8', devam: '#3f8fd2', tamamlandi: '#10b981', iptal: '#475569' };

  // Ortak özet: ölçüm şeridi + 5x5 olasılık/etki matrisi + öncelikli riskler. items: [{ tur, o, e, skor, tanim, no, eylemsiz }]
  function ozetHtml(items, ek) {
    const riskler = items.filter((x) => x.tur === 'Risk'), yuksek = riskler.filter((x) => (x.skor || 0) >= 12), orta = riskler.filter((x) => (x.skor || 0) >= 6 && (x.skor || 0) < 12), dusuk = riskler.filter((x) => x.skor != null && x.skor < 6);
    const eylemsiz = yuksek.filter((x) => x.eylemsiz);
    const hucre = [['Risk', riskler.length, 'text-white', 'fırsatlar hariç'], ['Yüksek seviyeli', yuksek.length, yuksek.length ? 'text-red-500' : 'text-emerald-500', 'skor 12 ve üzeri'], ['Orta ve düşük', orta.length + dusuk.length, 'text-white', orta.length + ' orta, ' + dusuk.length + ' düşük'],
      ek === 'db' ? ['Yüksek, eylemi olmayan', eylemsiz.length, eylemsiz.length ? 'text-red-500' : 'text-emerald-500', 'bağlı eylem açılmalı'] : ['Fırsat', items.length - riskler.length, 'text-white', 'değerlendirilecek fırsatlar']];
    const sayi = {}; riskler.forEach((x) => { if (x.o && x.e) sayi[x.o + '_' + x.e] = (sayi[x.o + '_' + x.e] || 0) + 1; });
    const renk = (sk) => (sk >= 12 ? 'rgba(239,68,68,.20)' : sk >= 6 ? 'rgba(245,158,11,.20)' : 'rgba(16,185,129,.18)');
    const satir = [5, 4, 3, 2, 1].map((o) => `<tr><th class="text-[11px] text-slate-400 font-medium pr-2 text-right">${o}</th>${[1, 2, 3, 4, 5].map((e) => { const n = sayi[o + '_' + e]; return `<td class="p-0.5"><div class="w-11 h-11 sm:w-12 sm:h-12 rounded flex items-center justify-center" style="background:${renk(o * e)}" title="Olasılık ${o} × etki ${e} = ${o * e}${n ? ', ' + n + ' risk' : ''}">${n ? `<span class="text-base font-bold text-slate-100">${n}</span>` : `<span class="text-[10px] text-slate-500/70">${o * e}</span>`}</div></td>`; }).join('')}</tr>`).join('');
    const oncelik = [...yuksek].sort((a, b) => b.skor - a.skor).slice(0, 5);
    return `<div class="space-y-4"><div class="olcum-seridi grid grid-cols-2 lg:grid-cols-4">${hucre.map(([b, n, r, a]) => `<div class="glass-card p-4"><div class="text-sm text-slate-400 font-medium">${b}</div><div class="text-3xl font-semibold mt-2 leading-none ${r}">${n}</div><div class="text-xs text-slate-500 mt-2">${a}</div></div>`).join('')}</div>
      <div class="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-4"><div class="glass-card p-4"><div class="text-sm font-bold text-white mb-3">Risk matrisi</div>
        <div class="flex items-center gap-2"><div class="text-[11px] text-slate-400 -rotate-90 whitespace-nowrap w-4">Olasılık</div><table><tbody>${satir}<tr><td></td>${[1, 2, 3, 4, 5].map((e) => `<th class="text-[11px] text-slate-400 font-medium pt-1">${e}</th>`).join('')}</tr></tbody></table></div>
        <div class="text-[11px] text-slate-400 text-center mt-1">Etki</div><div class="text-[11px] text-slate-500 mt-2 max-w-[22rem]">Kutudaki sayı: o hücredeki risk adedi; boş kutuda skor (olasılık × etki) silik yazılır.</div></div>
        <div class="glass-card p-4"><div class="text-sm font-bold text-white mb-3">Öncelikli riskler</div>${oncelik.length ? `<ul class="divide-y divide-slate-800/70">${oncelik.map((x) => `<li class="py-2.5 flex items-start gap-3"><span class="text-xl font-semibold text-red-500 w-8 shrink-0 text-right">${x.skor}</span><div class="min-w-0 text-sm text-slate-200">${kisa(x.tanim, 110)}<div class="text-xs text-slate-500 mt-0.5">${esc(x.no || '')}${x.eylemsiz ? ' <span class="text-red-500 font-medium">Bağlı eylem yok</span>' : ''}</div></div></li>`).join('')}</ul>` : '<p class="text-sm text-slate-400">Skoru 12 ve üzeri risk yok.</p>'}</div></div></div>`;
  }
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
      { ad: 'Durum', deger: (e) => durumEt(DURUM_E[e.durum][0], E_RENK[e.durum]) },
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
      const a = liste.filter((r) => tesisSuz(r) && r.aktif !== false && !(r.tur === 'Risk' && r.durum === 'kapali'));
      return `<div class="mt-3">${ozetHtml(a.map((r) => ({ tur: r.tur, o: r.olasilik, e: r.etki, skor: r.skor, tanim: r.tanim, no: r.no, eylemsiz: r.tur === 'Risk' && !eylem.satirlar.some((e) => e.risk_id === r.id && eylemAcik(e)) })), 'db')}</div>`;
    },
    minGenislik: 780,
    kolonlar: [
      { ad: 'No / proses', deger: (r) => `<div class="font-mono">${esc(r.no || '')}</div><div class="text-[10px] text-slate-500">${esc(r.proses || '')}</div><div class="text-[10px] text-slate-500">${esc(TESIS_AD[r.tesis])}</div>` },
      { ad: 'Tür', deger: (r) => `${turEt(r.tur)}` },
      { ad: 'Tanım', deger: (r) => kisa(r.tanim, 160) + (r.tur === 'Risk' && (r.skor || 0) >= 12 && r.durum !== 'kapali' && !eylem.satirlar.some((e) => e.risk_id === r.id && eylemAcik(e)) ? ' <span class="text-red-400" title="Yüksek risk — bağlı eylem yok">⚠</span>' : '') },
      { ad: 'O×E', sinif: 'text-center', deger: (r) => (r.olasilik && r.etki ? `${r.olasilik}×${r.etki}` : '—') },
      { ad: 'Skor', sinif: 'text-center', deger: (r) => rozetSkor(r.skor, r.tur) },
      { ad: 'Sonra', sinif: 'text-center', deger: (r) => rozetSkor(r.sonra_skor, r.tur) },
      { ad: 'Sorumlu', deger: (r) => esc(r.sorumlu || '—') },
      { ad: 'Durum', deger: (r) => durumEt(DURUM_R[r.durum][0], R_RENK[r.durum]) },
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
    excelAktar, ozetHtml, ozetRozet: (s, t) => rozetSkor(s, t),
    eylemAc(riskId) {
      const r = risk.satir(riskId); if (!r) return;
      risk.kapat();
      eylem.cfg.yeni = () => ({ tesis: r.tesis, risk_id: r.id, ad: 'Önlem: ' + String(r.tanim).slice(0, 80), sorumlu: r.sorumlu || '', termin: r.termin || '', durum: 'planli', yuzde: 0 });
      eylem.ac();
      eylem.cfg.yeni = () => ({ tesis: tesis || 'genel', durum: 'planli', yuzde: 0 });
    },
  };
})();
