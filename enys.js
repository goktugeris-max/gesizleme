/* ISO 50001 EnYS belgelerinden gelen bölümler (ISO sekmesinin içinde; veri: data/enys.json, ŞİFRESİZ — kullanıcı kararı, collector/enys_to_json.py):
 *  1) Enerji hedefleri ve ilerleme (FRM.06.02; gerçekleşen aylık tüketim ISO şifreli verisinden, hedef yılına göre bir önceki yılın aynı aylarıyla kıyas)
 *  2) Önemli enerji kullanımları (ÖEK) ve enerji performans göstergeleri (FRM.06.05/06.04/06.06)
 *  3) Yönetimin gözden geçirmesi (YGG) hazırlık özeti (yazdırılır)
 *  4) İç tetkik kontrol listesi (LST.09.01; işaretler YALNIZ tarayıcıda)
 *  Eşrefpaşa Semt Polikliniği (Buca SYK'nın bölümü) serileri `birlestir()` ile çözülmüş ISO verisine eklenir.
 * Sayaç/tesisat numarası, OSOS bilgisi ve kişi adı veri dosyasına ALINMAZ.
 */
(function () {
  const AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const KH = 'enys_v1_hedef', KT = 'enys_v1_tetkik';
  let E = null, yuk = null, hedefYil = null, enpgYil = null, tf = { madde: 'hepsi', kim: 'hepsi', durum: 'hepsi' };
  const acik = new Set(['hedef']);
  let kh = {}, kt = { meta: {}, s: {} };
  try { kh = JSON.parse(localStorage.getItem(KH) || '{}') || {}; } catch (e) { kh = {}; }
  try { kt = Object.assign({ meta: {}, s: {} }, JSON.parse(localStorage.getItem(KT) || '{}')); } catch (e) { /* boş */ }
  const sakla = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* özel pencere */ } };

  const e2 = (s) => (typeof esc === 'function' ? esc(s) : String(s ?? ''));
  const tr0 = (n) => (n == null || isNaN(n) ? '—' : Math.round(n).toLocaleString('tr-TR'));
  const tr1 = (n) => (n == null || isNaN(n) ? '—' : n.toLocaleString('tr-TR', { maximumFractionDigits: 1, minimumFractionDigits: 1 }));
  const yz = (v) => (v == null || isNaN(v) ? '—' : (v >= 0 ? '+' : '−') + Math.abs(v * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + '%');
  const topla = (a) => a.reduce((t, v) => t + (v || 0), 0);

  async function yukle() {
    if (E) return E;
    if (!yuk) yuk = fetch('data/enys.json?t=' + Date.now(), { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).then((j) => { E = j; return E; }).catch((e) => { yuk = null; throw e; });
    return yuk;
  }

  // Çözülmüş ISO verisine Eşrefpaşa Semt Polikliniği serilerini ekler (yinelenmez)
  function birlestir(D) {
    if (!E || !D || D._enys) return;
    ((E.iso_ek && E.iso_ek.seriler) || []).forEach((s) => { if (!D.seriler.some((x) => x.id === s.id)) D.seriler.push(s); });
    D._enys = true;
  }

  // Hedef satırında kısa ad: tesis / bölüm
  const TESIS_AD = { aassm: 'AASSM', buz: 'Buz Sporları Salonu', buca: 'Buca' };
  const hedefAd = (h) => (h.tesis === 'buca' && h.bolum ? 'Buca – ' + h.bolum : TESIS_AD[h.tesis] || h.amac);

  // ---------- hedef hesabı ----------
  const seriSec = (D, h, enerji) => D.seriler.filter((s) => s.tesis === h.tesis && (!h.bolum || s.bolum.startsWith(h.bolum)) && s.enerji === enerji);
  function hesap(D, h, k, yil) {
    const ss = seriSec(D, h, k.enerji); if (!ss.length) return null;
    const y = String(yil), by = String(h.baz_yil), ay = [];
    let g = 0, b = 0, kalanBaz = 0, bazYil = 0;
    for (let i = 0; i < 12; i++) {
      let gi = 0, bi = 0, gOk = true, bOk = true;
      ss.forEach((s) => {
        const a = s.yillar[y] && s.yillar[y].takip[i], c = s.yillar[by] && s.yillar[by].takip[i];
        if (a == null) gOk = false; else gi += a;
        if (c == null) bOk = false; else bi += c;
      });
      if (bOk) bazYil += bi;
      if (gOk && bOk) { g += gi; b += bi; ay.push(i); } else if (bOk) kalanBaz += bi;
    }
    if (!ay.length || !b) return { ss, n: 0, birim: ss[0].birim };
    const degisim = g / b - 1, hedefDeg = -k.oran;
    const gerekli = kalanBaz > 0 ? (bazYil * (1 - k.oran) - g) / kalanBaz - 1 : null;
    return { ss, n: ay.length, donem: AY[ay[0]] + (ay.length > 1 ? '–' + AY[ay[ay.length - 1]] : ''), g, b, degisim, hedefDeg, gerekli, birim: ss[0].birim,
      durum: degisim <= hedefDeg ? 'hedefte' : degisim <= 0 ? 'geride' : 'riskte' };
  }
  const DURUM_ET = { hedefte: ['Hedefte', '#10b981'], geride: ['Düşüş var, hedefin gerisinde', '#d9822b'], riskte: ['Artış — riskte', '#ef4444'], yok: ['Veri yok', '#64748b'] };

  function bolum(key, baslik, ozet, icerik) {
    return `<details data-k="${key}" ${acik.has(key) ? 'open' : ''} ontoggle="Enys.tog('${key}', this.open)" class="group glass-card rounded-xl overflow-hidden"><summary class="cursor-pointer select-none p-4 flex flex-wrap items-center gap-x-3 gap-y-2 hover:bg-slate-800/40" style="list-style:none"><span class="text-slate-400 inline-block transition-transform group-open:rotate-90">▸</span><h2 class="text-sm font-semibold text-white">${baslik}</h2><div class="ml-auto flex flex-wrap items-center gap-3 text-[11px] text-slate-400">${ozet || ''}</div></summary><div class="border-t border-slate-800">${icerik}</div></details>`;
  }
  const sel = 'bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-100';

  // ---------- 1) hedefler ----------
  function hedefBolumu(D) {
    const el = document.getElementById('isoHedef'); if (!el || !E) return;
    const yillar = Object.keys(E.hedefler).filter((y) => E.hedefler[y].some((h) => h.tur === 'nicel')).sort();
    if (!hedefYil || !yillar.includes(hedefYil)) hedefYil = yillar.includes('2026') ? '2026' : yillar[yillar.length - 1];
    const liste = E.hedefler[hedefYil] || [];
    const satirlar = [];
    liste.filter((h) => h.tur === 'nicel').forEach((h) => h.kalemler.forEach((k) => satirlar.push({ h, k, r: hesap(D, h, k, hedefYil) })));
    const say = { hedefte: 0, geride: 0, riskte: 0 };
    satirlar.forEach((x) => { if (x.r && x.r.durum) say[x.r.durum]++; });
    const tablo = satirlar.map(({ h, k, r }) => {
      const d = r && r.durum ? DURUM_ET[r.durum] : DURUM_ET.yok;
      const ilerleme = r && r.n ? Math.max(0, Math.min(1.5, -r.degisim / k.oran)) : 0;
      return `<tr class="border-t border-slate-800/70 align-top"><td class="px-3 py-2 text-slate-100 min-w-[200px]">${e2(hedefAd(h))}<div class="text-[10px] text-slate-500">${e2(h.sorumlu || '')}</div></td>
        <td class="px-3 py-2"><span class="px-1.5 py-0.5 rounded text-[10px] font-semibold ${k.enerji === 'Elektrik' ? 'bg-amber-500/15 text-amber-300' : 'bg-cyan-500/15 text-cyan-300'}">${e2(k.enerji)}</span></td>
        <td class="px-3 py-2 text-slate-400 whitespace-nowrap">${r && r.n ? e2(r.donem) : '—'}</td>
        <td class="px-3 py-2 text-right font-mono">${r && r.n ? tr0(r.b) : '—'}</td><td class="px-3 py-2 text-right font-mono">${r && r.n ? tr0(r.g) : '—'} <span class="text-[10px] text-slate-500">${e2(r ? r.birim : '')}</span></td>
        <td class="px-3 py-2 text-right font-mono" style="color:${d[1]}">${r && r.n ? yz(r.degisim) : '—'}</td><td class="px-3 py-2 text-right font-mono text-slate-300">−%${(k.oran * 100).toLocaleString('tr-TR')}</td>
        <td class="px-3 py-2 min-w-[150px]"><div class="h-1.5 rounded-full bg-slate-800 overflow-hidden"><div style="width:${Math.min(100, ilerleme * 100 / 1.5)}%;background:${d[1]}" class="h-full"></div></div><div class="text-[10px] mt-1" style="color:${d[1]}">${d[0]}</div></td>
        <td class="px-3 py-2 text-right font-mono text-slate-400">${r && r.gerekli != null ? yz(r.gerekli) : '—'}</td></tr>`;
    }).join('');
    // nicel olmayan hedefler: elle takip
    const nitel = liste.filter((h) => h.tur === 'nitel').map((h) => {
      const key = hedefYil + '|' + h.sira, m = kh[key] || {};
      return `<div class="glass-card rounded-xl p-3"><div class="text-xs font-semibold text-slate-100">${e2(h.amac)}</div><div class="text-[11px] text-slate-400 mt-0.5">${e2(h.hedef)}${h.eylemler ? ` • eylemler: ${e2(h.eylemler)}` : ''}${h.sorumlu ? ` • ${e2(h.sorumlu)}` : ''}</div>
        <div class="flex flex-wrap items-center gap-2 mt-2"><select onchange="Enys.hd('${key}','d',this.value)" class="${sel}">${[['bekliyor', 'Başlanmadı'], ['devam', 'Devam ediyor'], ['tamam', 'Tamamlandı']].map(([v, a]) => `<option value="${v}" ${(m.d || 'bekliyor') === v ? 'selected' : ''}>${a}</option>`).join('')}</select>
          <label class="text-[11px] text-slate-400">İlerleme % <input type="number" min="0" max="100" value="${m.y ?? ''}" onchange="Enys.hd('${key}','y',this.value)" class="${sel} w-16"></label>
          <input value="${e2(m.n || '')}" onchange="Enys.hd('${key}','n',this.value)" placeholder="Not" class="${sel} flex-1 min-w-[140px]"></div></div>`;
    }).join('');
    el.innerHTML = bolum('hedef', 'Enerji hedefleri ve ilerleme', `<span>${hedefYil} hedefleri</span><span class="text-emerald-300">${say.hedefte} hedefte</span><span class="text-amber-300">${say.geride} geride</span><span class="text-red-300">${say.riskte} riskte</span>`,
      `<div class="p-4 space-y-3"><div class="flex flex-wrap items-center gap-3"><label class="text-[11px] text-slate-400">Hedef yılı <select onchange="Enys.hy(this.value)" class="${sel}">${yillar.map((y) => `<option ${y === hedefYil ? 'selected' : ''}>${y}</option>`).join('')}</select></label>
        <span class="text-[11px] text-slate-500">Hedefler (FRM.06.02): bir önceki yılın aynı aylarına göre azaltım. Gerçekleşen, ISO şifreli verisindeki aylık tüketimden hesaplanır.</span></div>
        <div class="overflow-x-auto"><table class="w-full text-xs" style="min-width:900px"><thead class="bg-slate-900/80 text-slate-400 uppercase tracking-wider text-[10px]"><tr><th class="px-3 py-2 text-left">Amaç</th><th class="px-3 text-left">Enerji</th><th class="px-3 text-left">Dönem</th><th class="px-3 text-right">Baz (${(liste.find((h) => h.baz_yil) || {}).baz_yil || '—'})</th><th class="px-3 text-right">${hedefYil}</th><th class="px-3 text-right">Değişim</th><th class="px-3 text-right">Hedef</th><th class="px-3 text-left">Durum</th><th class="px-3 text-right" title="Yıl sonu hedefi için kalan aylarda bazın yüzde kaçı olmalı">Kalan aylarda gereken</th></tr></thead><tbody>${tablo || '<tr><td colspan="9" class="px-3 py-6 text-center text-slate-500">Bu yıl için hesaplanabilir hedef yok.</td></tr>'}</tbody></table></div>
        <p class="text-[11px] text-slate-500">Değişim = (${hedefYil} dönem toplamı ÷ baz yılın aynı ayları) − 1; hedefin altında (daha negatif) olması iyidir. "Kalan aylarda gereken" = yıl sonunda hedefe ulaşmak için bazın kalan aylarına göre gereken değişim (veri tamamlanmamış aylar için).</p>
        ${nitel ? `<div class="text-xs font-semibold text-white pt-1">Nicel olmayan hedefler (elle takip, yalnız bu tarayıcıda)</div><div class="grid grid-cols-1 lg:grid-cols-2 gap-3">${nitel}</div>` : ''}</div>`);
  }

  // ---------- 2) ÖEK / EnPG ----------
  const anahtar = (r) => [r.bina, r.kullanim, r.tur].join('|');
  function enpgBolumu() {
    const el = document.getElementById('isoEnpg'); if (!el || !E) return;
    const yillar = Object.keys(E.enpg).sort();
    if (!enpgYil || !yillar.includes(enpgYil)) enpgYil = yillar[yillar.length - 1];
    const bu = E.enpg[enpgYil] || [], onceki = E.enpg[String(+enpgYil - 1)] || [], om = {};
    onceki.forEach((r) => { om[anahtar(r)] = r; });
    const oekBy = {}; if (enpgYil === yillar[yillar.length - 1]) bu.forEach((r) => { oekBy[r.no] = (E.oek || {})[r.no]; });
    const satir = bu.map((r) => {
      const o = om[anahtar(r)], f = o && o.deger ? r.deger / o.deger - 1 : null, ok = oekBy[r.no] || {};
      const birim = ((r.tanim || '').match(/\(([^)]+)\)\s*$/) || [])[1] || '';
      return `<tr class="border-t border-slate-800/70 align-top"><td class="px-3 py-2 text-slate-500">${r.no}</td><td class="px-3 py-2 text-slate-100 min-w-[160px]">${e2(r.bina)}<div class="text-[10px] text-slate-500">${e2(r.kullanim)}</div></td>
        <td class="px-3 py-2"><span class="px-1.5 py-0.5 rounded text-[10px] font-semibold ${r.tur === 'Elektrik' ? 'bg-amber-500/15 text-amber-300' : 'bg-cyan-500/15 text-cyan-300'}">${e2(r.tur)}</span></td>
        <td class="px-3 py-2 text-right font-mono">${tr0(r.kwh)}</td><td class="px-3 py-2 text-right font-mono text-slate-400">${ok.oran_pct != null ? '%' + tr1(ok.oran_pct) : '—'}</td>
        <td class="px-3 py-2 text-right font-mono text-cyan-300">${tr1(r.deger)} <span class="text-[10px] text-slate-500">${e2(birim)}</span></td>
        <td class="px-3 py-2 text-right font-mono ${f == null ? 'text-slate-600' : f > 0.02 ? 'text-red-400' : f < -0.02 ? 'text-emerald-400' : 'text-slate-300'}">${f == null ? '—' : yz(f)}</td>
        <td class="px-3 py-2 text-[11px] text-slate-400">${e2(ok.okuma || '')}${ok.periyot ? ' • ' + e2(ok.periyot) : ''}${ok.kayit_sorumlusu ? '<div class="text-slate-500">' + e2(ok.kayit_sorumlusu) + '</div>' : ''}</td></tr>`;
    }).join('');
    const toplam = topla(bu.map((r) => r.kwh));
    el.innerHTML = bolum('enpg', 'Önemli enerji kullanımları (ÖEK) ve EnPG', `<span>${bu.length} ÖEK</span><span>${tr0(toplam)} kWh (${enpgYil})</span>`,
      `<div class="p-4 space-y-3"><div class="flex flex-wrap items-center gap-3"><label class="text-[11px] text-slate-400">Yıl <select onchange="Enys.ey(this.value)" class="${sel}">${yillar.map((y) => `<option ${y === enpgYil ? 'selected' : ''}>${y}</option>`).join('')}</select></label>
        <span class="text-[11px] text-slate-500">FRM.06.05 enerji performans göstergeleri: yıllık tüketim ÷ faaliyet değişkeni (çoğunlukla iklimlendirilen alan m²). Değişim = bir önceki yıla göre EnPG.</span></div>
        <div class="overflow-x-auto"><table class="w-full text-xs" style="min-width:860px"><thead class="bg-slate-900/80 text-slate-400 uppercase tracking-wider text-[10px]"><tr><th class="px-3 py-2 text-left">No</th><th class="px-3 text-left">Bina / enerji kullanımı</th><th class="px-3 text-left">Tür</th><th class="px-3 text-right">Yıllık kWh</th><th class="px-3 text-right">ÖEK payı</th><th class="px-3 text-right">EnPG</th><th class="px-3 text-right">Önceki yıla göre</th><th class="px-3 text-left">Ölçüm / veri okuma${enpgYil === yillar[yillar.length - 1] ? '' : ' (güncel yıl)'}</th></tr></thead><tbody>${satir}</tbody></table></div>
        <div class="h-64"><canvas id="chEnpg"></canvas></div></div>`);
    grafikEnpg(yillar);
  }
  const grafikler = {};
  function grafikEnpg(yillar) {
    if (!window.Chart || !document.getElementById('chEnpg')) return;
    if (grafikler.enpg) grafikler.enpg.destroy();
    const son = E.enpg[yillar[yillar.length - 1]] || [], renkler = ['#211950', '#3f8fd2', '#d9822b', '#10b981', '#8b5cf6', '#ef4444', '#14b8a6', '#eab308', '#64748b', '#ec4899', '#0ea5e9', '#84cc16', '#f97316'];
    const ds = son.filter((r) => (r.tanim || '').includes('m2')).map((r, i) => ({ label: r.bina.replace(/^Buca Sosyal Yaşam Kampüsü\s*/, 'Buca ') + ' – ' + (r.tur === 'Elektrik' ? 'elek.' : 'gaz'), borderColor: renkler[i % renkler.length], backgroundColor: renkler[i % renkler.length], tension: 0.25,
      data: yillar.map((y) => { const o = (E.enpg[y] || []).find((x) => anahtar(x) === anahtar(r)); return o ? Math.round(o.deger * 10) / 10 : null; }) }));
    grafikler.enpg = new Chart(document.getElementById('chEnpg'), { type: 'line', data: { labels: yillar, datasets: ds }, options: { responsive: true, maintainAspectRatio: false, spanGaps: true,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } }, title: { display: true, text: 'EnPG (kWh/m²) — yıllara göre', color: koyuMu() ? '#94a3b8' : '#5b6b7e', font: { size: 11, weight: 'normal' } } } } });
  }

  // ---------- 4) iç tetkik kontrol listesi ----------
  const TS = { uygun: ['Uygun', '#10b981'], gozlem: ['Gözlem', '#eab308'], minor: ['Uygunsuzluk (minör)', '#d9822b'], major: ['Uygunsuzluk (majör)', '#ef4444'], ua: ['Uygulanamaz', '#64748b'] };
  const tkey = (g, s, i) => g.madde + '|' + (s.no || i + 1);
  function tetkikSay() {
    const hepsi = (E ? E.tetkik : []).flatMap((g) => g.sorular.map((s, i) => tkey(g, s, i))), c = { toplam: hepsi.length, isaretli: 0 };
    Object.keys(TS).forEach((k) => { c[k] = 0; });
    hepsi.forEach((k) => { const m = kt.s[k]; if (m && m.d && TS[m.d]) { c[m.d]++; c.isaretli++; } });
    return c;
  }
  function tetkikBolumu() {
    const el = document.getElementById('isoTetkik'); if (!el || !E) return;
    const kimler = [...new Set(E.tetkik.flatMap((g) => g.sorular.flatMap((s) => s.kimler)))];
    const gorunur = (g, s, i) => { const m = kt.s[tkey(g, s, i)] || {}; return (tf.madde === 'hepsi' || g.madde === tf.madde) && (tf.kim === 'hepsi' || s.kimler.includes(tf.kim)) && (tf.durum === 'hepsi' || (tf.durum === 'bos' ? !m.d : m.d === tf.durum)); };
    const c = tetkikSay(), meta = kt.meta;
    const govde = E.tetkik.map((g) => {
      const sat = g.sorular.map((s, i) => [s, i]).filter(([s, i]) => gorunur(g, s, i));
      if (!sat.length) return '';
      return `<div class="px-4 pt-3"><div class="text-xs font-semibold text-white">${e2(g.madde)} ${e2(g.baslik)}</div></div><div class="px-4 pb-2 divide-y divide-slate-800/70">${sat.map(([s, i]) => {
        const k = tkey(g, s, i), m = kt.s[k] || {}, d = m.d && TS[m.d] ? TS[m.d] : null;
        return `<div class="py-2 grid grid-cols-1 lg:grid-cols-[1fr_220px_1fr] gap-2 items-start text-xs"><div class="text-slate-200">${s.no ? `<span class="text-slate-500">${s.no}.</span> ` : ''}${e2(s.soru)}${s.kanit ? `<div class="text-[10px] text-slate-500 mt-0.5">Aranacak: ${e2(s.kanit)}</div>` : ''}${s.kimler.length ? `<div class="text-[10px] text-slate-600">${s.kimler.map(e2).join(' • ')}</div>` : ''}</div>
          <select onchange="Enys.td('${k}','d',this.value)" class="${sel}" style="${d ? 'color:' + d[1] : ''}"><option value="">— değerlendirilmedi</option>${Object.keys(TS).map((v) => `<option value="${v}" ${m.d === v ? 'selected' : ''}>${TS[v][0]}</option>`).join('')}</select>
          <input value="${e2(m.n || '')}" onchange="Enys.td('${k}','n',this.value)" placeholder="Bulgu / not" class="${sel} w-full"></div>`;
      }).join('')}</div>`;
    }).join('');
    el.innerHTML = bolum('tetkik', 'İç tetkik kontrol listesi', `<span>${c.isaretli}/${c.toplam} değerlendirildi</span><span class="text-emerald-300">${c.uygun} uygun</span><span class="text-amber-300">${c.gozlem} gözlem</span><span class="text-red-300">${c.minor + c.major} uygunsuzluk</span>`,
      `<div class="p-4 flex flex-wrap items-end gap-3 border-b border-slate-800"><label class="text-[11px] text-slate-400">Tetkik tarihi <input type="date" value="${e2(meta.tarih || '')}" onchange="Enys.tm('tarih',this.value)" class="${sel} ml-1"></label>
        <label class="text-[11px] text-slate-400">Tetkik ekibi <input value="${e2(meta.ekip || '')}" onchange="Enys.tm('ekip',this.value)" placeholder="Bu tarayıcıda kalır" class="${sel} ml-1 w-44"></label>
        <label class="text-[11px] text-slate-400">Madde <select onchange="Enys.tf('madde',this.value)" class="${sel} ml-1"><option value="hepsi">Tümü</option>${E.tetkik.map((g) => `<option value="${e2(g.madde)}" ${tf.madde === g.madde ? 'selected' : ''}>${e2(g.madde)} ${e2(g.baslik.slice(0, 28))}</option>`).join('')}</select></label>
        <label class="text-[11px] text-slate-400">Denetlenen <select onchange="Enys.tf('kim',this.value)" class="${sel} ml-1"><option value="hepsi">Tümü</option>${kimler.map((k) => `<option ${tf.kim === k ? 'selected' : ''}>${e2(k)}</option>`).join('')}</select></label>
        <label class="text-[11px] text-slate-400">Durum <select onchange="Enys.tf('durum',this.value)" class="${sel} ml-1"><option value="hepsi">Tümü</option><option value="bos" ${tf.durum === 'bos' ? 'selected' : ''}>Değerlendirilmeyen</option>${Object.keys(TS).map((v) => `<option value="${v}" ${tf.durum === v ? 'selected' : ''}>${TS[v][0]}</option>`).join('')}</select></label>
        <button onclick="Enys.tcsv()" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200">CSV indir</button>
        <button onclick="Enys.tsifirla()" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200">Tüm işaretleri temizle</button></div>
      <div class="max-h-[42rem] overflow-auto">${govde || '<p class="p-6 text-center text-xs text-slate-500">Bu süzgece uyan soru yok.</p>'}</div>
      <p class="px-4 py-2 text-[11px] text-slate-500 border-t border-slate-800">Soru listesi LST.09.01 (İBB-LST-09-01). İşaretler ve notlar yalnızca bu tarayıcıda saklanır; CSV ile saklayabilirsiniz.</p>`);
  }

  // ---------- 3) YGG hazırlık özeti ----------
  function sapmalar(D, yil) {
    const y = String(yil);
    return D.seriler.filter((s) => s.yillar[y]).map((s) => {
      let t = 0, r = 0, n = 0;
      s.yillar[y].takip.forEach((x, i) => { const ref = s.yillar[y].referans[i]; if (x != null && ref != null) { t += x; r += ref; n++; } });
      return { s, t, r, n, sapma: r ? t / r - 1 : null };
    }).filter((x) => x.sapma != null);
  }
  function ygg(D, ctx) {
    if (!D || !E) return;
    const w = window.open('', '_blank'); if (!w) { alert('Açılır pencere engellendi; tarayıcıda bu site için izin verin.'); return; }
    const yil = ctx.yil, hy = hedefYil || '2026';
    const hRows = [];
    (E.hedefler[hy] || []).filter((h) => h.tur === 'nicel').forEach((h) => h.kalemler.forEach((k) => hRows.push({ h, k, r: hesap(D, h, k, hy) })));
    const sp = sapmalar(D, yil).sort((a, b) => b.sapma - a.sapma);
    const tAd = (id) => ((D.tesisler.find((t) => t.id === id) || {}).ad || id);
    const iso = (window.Iso && Iso.ozetVeri) ? Iso.ozetVeri() : [];
    const risk = [].concat(...Object.keys(D.risk || {}).map((k) => (D.risk[k] || []).map((x) => Object.assign({ k }, x))));
    const yRisk = risk.filter((x) => x.tur === 'Risk' && (x.seviye || 0) >= 12);
    const etut = window.Etut && Etut.sayilar ? Etut.sayilar() : null, tc = tetkikSay();
    const ep = (E.enpg[Object.keys(E.enpg).sort().pop()] || []), epY = Object.keys(E.enpg).sort().pop(), epO = E.enpg[String(+epY - 1)] || [];
    const bos = (n) => `<div style="border:1px solid #cbd5e1;min-height:${n}px;margin-top:6px"></div>`;
    w.document.write(`<!doctype html><meta charset="utf-8"><title>Yönetimin Gözden Geçirmesi — hazırlık özeti</title>
      <style>body{font:13px Inter,Arial,sans-serif;margin:28px;color:#0f172a}h1{font-size:19px;margin:0}h2{font-size:14px;margin:20px 0 6px;border-bottom:2px solid #211950;padding-bottom:3px;color:#211950}table{border-collapse:collapse;width:100%;margin-top:6px;font-size:12px}td,th{border:1px solid #cbd5e1;padding:4px 6px;text-align:right}td:first-child,th:first-child{text-align:left}small{color:#64748b}.k{color:#b91c1c;font-weight:700}.y{color:#047857;font-weight:700}.s{color:#b45309;font-weight:700}@media print{h2{break-after:avoid}table{break-inside:avoid}}</style>
      <h1>TS EN ISO 50001 — Yönetimin Gözden Geçirmesi (YGG) hazırlık özeti</h1>
      <small>İZBB İklim Değişikliği ve Temiz Enerji Şube Müdürlüğü • hazırlanma: ${new Date().toLocaleDateString('tr-TR')} • veriler panelden alınmıştır; toplantı kararları aşağıdaki alanlara yazılır. Toplantı tarihi: ________</small>
      <h2>1. Enerji amaç ve hedeflerine ulaşma (${hy})</h2><table><tr><th>Amaç</th><th>Enerji</th><th>Dönem</th><th>Değişim</th><th>Hedef</th><th>Durum</th></tr>
      ${hRows.map(({ h, k, r }) => { const d = r && r.durum ? DURUM_ET[r.durum] : DURUM_ET.yok; return `<tr><td>${e2(hedefAd(h))}</td><td>${e2(k.enerji)}</td><td>${r && r.n ? e2(r.donem) : '—'}</td><td>${r && r.n ? yz(r.degisim) : '—'}</td><td>−%${k.oran * 100}</td><td class="${r && r.durum === 'hedefte' ? 'y' : r && r.durum === 'riskte' ? 'k' : 's'}">${d[0]}</td></tr>`; }).join('') || '<tr><td colspan="6">Hesaplanabilir hedef yok</td></tr>'}</table>
      <h2>2. Enerji performansı: ölçüm, izleme ve referans çizgisine göre sapma (${yil})</h2><table><tr><th>Tesis / bölüm</th><th>Enerji</th><th>Gerçekleşen</th><th>Referans</th><th>Sapma</th></tr>
      ${sp.slice(0, 14).map((x) => `<tr><td>${e2(tAd(x.s.tesis))} / ${e2(x.s.bolum)}</td><td>${e2(x.s.enerji)}</td><td>${tr0(x.t)} ${e2(x.s.birim)}</td><td>${tr0(x.r)}</td><td class="${x.sapma > 0.05 ? 'k' : x.sapma > 0 ? 's' : 'y'}">${yz(x.sapma)}</td></tr>`).join('') || '<tr><td colspan="5">Referanslı seri yok</td></tr>'}</table>
      <small>Pozitif sapma = referansın üzerinde tüketim. En yüksek ${Math.min(14, sp.length)} seri gösterilmiştir.</small>
      <h2>3. Enerji performans göstergeleri (EnPG, ${epY})</h2><table><tr><th>Bina / kullanım</th><th>Tür</th><th>Yıllık kWh</th><th>EnPG</th><th>${+epY - 1}'e göre</th></tr>
      ${ep.map((r) => { const o = epO.find((x) => anahtar(x) === anahtar(r)), f = o && o.deger ? r.deger / o.deger - 1 : null; return `<tr><td>${e2(r.bina)} — ${e2(r.kullanim)}</td><td>${e2(r.tur)}</td><td>${tr0(r.kwh)}</td><td>${tr1(r.deger)}</td><td class="${f > 0.02 ? 'k' : f < -0.02 ? 'y' : ''}">${f == null ? '—' : yz(f)}</td></tr>`; }).join('')}</table>
      <h2>4. Eylem planı durumu</h2><table><tr><th>Tesis</th><th>Toplam</th><th>Tamamlandı</th><th>Devam</th><th>Planlı</th><th>Gecikmiş</th><th>Sürekli</th></tr>
      ${iso.map((t) => `<tr><td>${e2(t.ad)}</td><td>${topla(Object.values(t.c))}</td><td>${t.c.tamamlandi || 0}</td><td>${t.c.devam || 0}</td><td>${t.c.planli || 0}</td><td class="${t.c.gecikmis ? 'k' : ''}">${t.c.gecikmis || 0}</td><td>${t.c.surekli || 0}</td></tr>`).join('') || '<tr><td colspan="7">Veri yok</td></tr>'}</table>
      ${etut ? `<small>Enerji etütlerinden gelen ${etut.toplam} önlemin durumu: ${etut.tamam} tamamlandı, ${etut.devam} uygulanıyor, ${etut.planli} planlı, ${etut.bekliyor} değerlendiriliyor, ${etut.yok} uygulanmayacak.</small>` : ''}
      <h2>5. Risk ve fırsatlar</h2><p>${risk.filter((x) => x.tur === 'Risk').length} risk (<span class="${yRisk.length ? 'k' : ''}">${yRisk.length} yüksek seviyeli</span>), ${risk.filter((x) => x.tur === 'Fırsat').length} fırsat tanımlı.</p>
      ${yRisk.length ? `<table><tr><th>Yüksek seviyeli risk</th><th>Seviye</th></tr>${yRisk.slice(0, 10).map((x) => `<tr><td>${e2(x.tanim)}</td><td>${x.seviye}</td></tr>`).join('')}</table>` : ''}
      <h2>6. İç tetkik sonuçları</h2><p>${tc.isaretli}/${tc.toplam} soru değerlendirildi: ${tc.uygun} uygun, ${tc.gozlem} gözlem, <span class="${tc.minor + tc.major ? 'k' : ''}">${tc.minor + tc.major} uygunsuzluk</span> (${tc.minor} minör, ${tc.major} majör), ${tc.ua} uygulanamaz.${kt.meta.tarih ? ` Tetkik tarihi: ${e2(kt.meta.tarih)}.` : ''}</p>
      <h2>7. Önceki YGG kararlarının durumu</h2>${bos(70)}
      <h2>8. EnYS'yi etkileyen iç/dış hususlardaki, ilgili taraf ve yasal şartlardaki değişiklikler</h2>${bos(70)}
      <h2>9. Sürekli iyileştirme fırsatları ve kaynak ihtiyaçları</h2>${bos(70)}
      <h2>10. Kararlar ve görevlendirmeler</h2>${bos(90)}
      <script>setTimeout(function(){window.print()},400)<\/script>`);
    w.document.close();
  }

  // ---------- çizim ----------
  async function ciz(D, ctx) {
    if (!document.getElementById('isoHedef')) return;
    try { await yukle(); } catch (e) {
      ['isoHedef', 'isoEnpg', 'isoTetkik'].forEach((id) => { const x = document.getElementById(id); if (x) x.innerHTML = ''; });
      const y = document.getElementById('isoYgg'); if (y) y.innerHTML = '<p class="text-xs text-slate-500">EnYS verisi (data/enys.json) yüklenemedi.</p>'; return;
    }
    birlestir(D);
    ctxSon = { D, ctx };
    hedefBolumu(D); enpgBolumu(); tetkikBolumu();
    const y = document.getElementById('isoYgg');
    if (y) y.innerHTML = `<div class="glass-card rounded-xl p-4 flex flex-wrap items-center gap-3"><div><div class="text-sm font-semibold text-white">Yönetimin gözden geçirmesi (YGG) hazırlığı</div><div class="text-[11px] text-slate-400">Hedefler, EnPG, referans sapmaları, eylem planı, riskler ve iç tetkik özeti tek sayfada; karar alanları boş bırakılır. Yazdırıp PDF olarak kaydedebilirsiniz.</div></div>
      <button onclick="Enys.ygg()" class="ml-auto px-4 py-2 rounded-lg text-xs font-semibold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30">YGG özetini oluştur</button></div>`;
  }
  let ctxSon = null;
  const yeniden = () => { if (ctxSon) ciz(ctxSon.D, ctxSon.ctx); };

  window.Enys = {
    yukle, birlestir, ciz, tetkikSay,
    tog(k, a) { a ? acik.add(k) : acik.delete(k); },
    hy(y) { hedefYil = y; hedefBolumu(ctxSon.D); },
    ey(y) { enpgYil = y; enpgBolumu(); },
    hd(key, alan, v) { const m = (kh[key] = kh[key] || {}); if (alan === 'y') { const n = v === '' ? null : Math.max(0, Math.min(100, Math.round(+v))); m.y = isNaN(n) ? null : n; } else m[alan] = v; sakla(KH, kh); },
    td(k, alan, v) { const m = (kt.s[k] = kt.s[k] || {}); m[alan] = v; if (!m.d && !m.n) delete kt.s[k]; sakla(KT, kt); if (alan === 'd') tetkikBolumu(); },
    tm(a, v) { kt.meta[a] = v; sakla(KT, kt); },
    tf(a, v) { tf[a] = v; tetkikBolumu(); },
    tsifirla() { if (confirm('Tüm iç tetkik işaretleri ve notları bu tarayıcıdan silinsin mi?')) { kt = { meta: {}, s: {} }; sakla(KT, kt); tetkikBolumu(); } },
    tcsv() {
      const sat = [['Madde', 'Başlık', 'No', 'Soru', 'Aranabilecek hususlar', 'Denetlenen', 'Değerlendirme', 'Bulgu / not'],
        ...E.tetkik.flatMap((g) => g.sorular.map((s, i) => { const m = kt.s[tkey(g, s, i)] || {}; return [g.madde, g.baslik, s.no ?? '', s.soru, s.kanit || '', s.kimler.join(' / '), m.d && TS[m.d] ? TS[m.d][0] : '', m.n || '']; }))];
      const metin = '﻿' + sat.map((r) => r.map((h) => { const x = String(h ?? ''); return /[;"\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; }).join(';')).join('\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([metin], { type: 'text/csv;charset=utf-8' })); a.download = 'ic_tetkik_kontrol_listesi.csv'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    },
    ygg() { if (ctxSon) ygg(ctxSon.D, ctxSon.ctx); },
    yeniden,
  };
  yukle().catch(() => {});
})();
