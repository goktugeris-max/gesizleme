/* İştirakler (Elektrik → "İştirakler" alt sekmesi): İZSU, İzmir Metro, İZFAŞ, İZBETON, ESHOT, İZTARIM, İZDOĞA, İZULAŞ ve İZENERJİ elektrik tüketimi.
 *
 * Veri: data/istirak.enc.json, ŞİFRELİ (elektrik.enc.json ile aynı parola, oturumda 'elp'); üretici collector/istirak_to_json.py (Enerji Verimliliği Misyon Ekibi ön analiz Excel'i).
 * Abone numarası, TL ve kaynak hücre adresi dosyada YOKTUR. Aylık değerler Excel'deki "Analiz Değeri"dir (açık büyüklük/ondalık hataları düzeltilmiş, bazıları doğrulanmamış varsayım).
 * Karşılaştırma dönemi Ocak–Eylül'dür (2024 verisi çoğu şirkette bu aya kadar). Tasarruf potansiyeli literatür bandıdır; sahada doğrulanmış değildir.
 */
(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tr = (n, d) => (n == null || !isFinite(n) ? '—' : Number(n).toLocaleString('tr-TR', { maximumFractionDigits: d == null ? 0 : d, minimumFractionDigits: d == null ? 0 : d }));
  const gwh = (k, d) => tr(k / 1e6, d == null ? 1 : d);
  const AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const OE = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const SAAT24 = OE.map((a) => new Date(2024, a + 1, 0).getDate() * 24);
  let D = null, hata = null, yukleniyor = false, secili = 'hepsi', tumAbone = false;
  const grafik = {};
  const b64 = (t) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));

  async function coz(s, parola) {
    const m = await crypto.subtle.importKey('raw', new TextEncoder().encode(parola), 'PBKDF2', false, ['deriveKey']);
    const k = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64(s.salt), iterations: s.iter, hash: 'SHA-256' }, m, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(s.iv) }, k, b64(s.data))));
  }
  async function yukle() {
    if (D || yukleniyor) return; yukleniyor = true; hata = null;
    try {
      const r = await fetch('data/istirak.enc.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      let p = null; try { p = sessionStorage.getItem('elp'); } catch (e) { /* oturum yok */ }
      if (!p) throw new Error('parola');
      D = await coz(await r.json(), p);
    } catch (e) { hata = String(e.message) === 'parola' ? 'Önce Elektrik sekmesinde yönetici girişi yapın.' : 'İştirak verisi okunamadı. Dosya yoksa üretmek için: ELEKTRIK_PAROLA=... python3 collector/istirak_to_json.py "<Excel>".'; }
    yukleniyor = false;
  }

  // ---------- hesap ----------
  const topla = (a) => a.reduce((t, v) => t + (v || 0), 0);
  const oe = (s, y) => (s.aylik[y] ? topla(OE.map((i) => s.aylik[y][i])) : null);
  const yillik = (s, y) => (s.aylik[y] && s.aylik[y].filter((v) => v != null).length === 12 ? topla(s.aylik[y]) : null);
  const degisim = (a, b) => (a != null && b ? a / b - 1 : null);
  const yuzde = (v, d) => (v == null || !isFinite(v) ? '—' : (v < 0 ? '−' : v > 0 ? '+' : '') + '%' + tr(Math.abs(v) * 100, d == null ? 1 : d));
  const renk = (v) => (v == null ? '' : v > 0.03 ? 'text-red-400' : v < -0.03 ? 'text-emerald-400' : 'text-slate-300');
  const aboneAd = (a, i) => a.tesis || `${a.sirket} abonesi ${i != null ? '#' + (i + 1) : a.id.slice(0, 4)}`;

  function ozetHesap() {
    const S = D.sirketler, t = (y) => topla(S.map((s) => oe(s, y)));
    const izsu = S.find((s) => s.ad === 'İZSU'), dig = S.filter((s) => s.ad !== 'İZSU');
    const tp = D.parametre.tep || 0.000086, ef = D.parametre.ef || 0.479, t24 = t('2024'), t23 = t('2023');
    return { t22: t('2022'), t23, t24, izsuPay: izsu ? oe(izsu, '2024') / t24 : null, dig24: topla(dig.map((s) => oe(s, '2024'))), dig23: topla(dig.map((s) => oe(s, '2023'))), tep: t24 * tp, co2: t24 * ef / 1000, tp, ef };
  }

  // ---------- görünüm ----------
  const kart = (b, d, alt, r) => `<div class="p-4"><div class="text-xs text-slate-400">${b}</div><div class="text-2xl font-bold mt-1 ${r || 'text-white'}">${d}</div><div class="text-[11px] text-slate-500 mt-1">${alt}</div></div>`;
  const chip = (act, onclick, txt) => `<button onclick="${onclick}" class="px-2.5 py-1 rounded-md text-[11px] font-semibold ${act ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-300 hover:text-white'}">${txt}</button>`;

  function ciz(el) {
    Object.values(grafik).forEach((g) => g && g.destroy()); Object.keys(grafik).forEach((k) => delete grafik[k]);
    if (hata) { el.innerHTML = `<p class="text-sm text-slate-400 p-6">${esc(hata)}</p>`; return; }
    if (!D) { el.innerHTML = '<p class="text-sm text-slate-400 p-6">İştirak verisi yükleniyor…</p>'; return; }
    const S = D.sirketler, o = ozetHesap(), sec = S.find((s) => s.ad === secili) || null;
    const d24 = degisim(o.t24, o.t23), dDig = degisim(o.dig24, o.dig23);
    const aboneler = D.aboneler.filter((a) => !sec || a.sirket === sec.ad).map((a, i) => ({ a, i, v24: a.aylik['2024'] ? topla(OE.map((m) => a.aylik['2024'][m])) : 0, v23: a.aylik['2023'] ? topla(OE.map((m) => a.aylik['2023'][m])) : 0 }))
      .sort((x, y) => y.v24 - x.v24);
    const toplamSec = topla(aboneler.map((x) => x.v24));
    const yf = (x) => { const m = x.a.aylik['2024'] ? OE.filter((i) => x.a.aylik['2024'][i]) : []; const sa = topla(m.map((i) => SAAT24[i])); return x.a.soz && sa ? x.v24 / (x.a.soz * sa) : null; };
    const gorunen = tumAbone ? aboneler : aboneler.slice(0, 20);

    const sirketSatir = S.map((s) => {
      const a22 = yillik(s, '2022'), a23 = yillik(s, '2023'), o24 = oe(s, '2024'), dg = degisim(o24, oe(s, '2023'));
      const b = s.bulgu, bn = b.metin + b.duzeltme + b.dogrulanmadi;
      return `<tr class="border-t border-slate-800/70 ${s.ad === secili ? 'bg-slate-800/40' : ''} cursor-pointer" onclick="Istirak.sec('${esc(s.ad)}')"><td class="px-3 py-2 text-slate-100 font-medium">${esc(s.ad)}</td><td class="px-3 py-2 text-slate-400 hidden md:table-cell">${esc(s.tur)}</td>
        <td class="px-3 py-2 text-right hidden sm:table-cell">${a22 != null ? gwh(a22) : '—'}</td><td class="px-3 py-2 text-right hidden sm:table-cell">${a23 != null ? gwh(a23) : '—'}</td>
        <td class="px-3 py-2 text-right font-semibold">${gwh(o24)}${s.ay24 < 9 ? `<span class="text-amber-300" title="2024 verisi ${s.ay24} ay"> *</span>` : ''}</td>
        <td class="px-3 py-2 text-right ${renk(dg)}">${yuzde(dg)}</td><td class="px-3 py-2 text-right text-slate-400">${tr(o24 / o.t24 * 100, 1)}</td>
        <td class="px-3 py-2 text-right text-slate-400 hidden md:table-cell">${s.abone}</td>
        <td class="px-3 py-2 text-[11px] text-slate-500 hidden lg:table-cell min-w-[240px]">${esc(s.kapsam || '')}${bn ? `${s.kapsam ? ' ' : ''}Kaynakta ${bn} değer düzeltilmiş ya da teyit bekliyor.` : ''}</td></tr>`;
    }).join('');

    const pot = S.filter((s) => s.potansiyel);
    const pSatir = pot.map((s) => { const p = s.potansiyel, l = p.baz * p.dusuk, h = p.baz * p.yuksek; return `<tr class="border-t border-slate-800/70 align-top"><td class="px-3 py-2 text-slate-100 font-medium">${esc(s.ad)}<div class="text-[11px] text-slate-500 font-normal">${esc(p.kategori)}</div></td>
        <td class="px-3 py-2 text-right">${gwh(p.baz)}</td><td class="px-3 py-2 text-right">%${tr(p.dusuk * 100, 0)} – %${tr(p.yuksek * 100, 0)}</td>
        <td class="px-3 py-2 text-right">${gwh(l, 2)} – ${gwh(h, 2)}</td><td class="px-3 py-2 text-right hidden sm:table-cell">${tr(l * o.tp, 0)} – ${tr(h * o.tp, 0)}</td><td class="px-3 py-2 text-right hidden sm:table-cell">${tr(l * o.ef / 1000, 0)} – ${tr(h * o.ef / 1000, 0)}</td>
        <td class="px-3 py-2 text-[11px] text-slate-400 hidden lg:table-cell min-w-[260px]">${esc(p.onlem || '')} <span class="text-slate-500">(${esc(p.kaynak.join(', '))})</span></td></tr>`; }).join('');
    const pl = pot.reduce((t, s) => t + s.potansiyel.baz * s.potansiyel.dusuk, 0), ph = pot.reduce((t, s) => t + s.potansiyel.baz * s.potansiyel.yuksek, 0), pb = topla(pot.map((s) => s.potansiyel.baz));

    el.innerHTML = `<div class="space-y-4">
      <p class="text-xs text-slate-400">${S.length} şirketin ${esc(D.donem)} elektrik tüketimi toplam ${gwh(o.t24)} GWh, 2023'ün aynı dönemine göre ${yuzde(d24)}. İZSU payı %${tr(o.izsuPay * 100, 0)}. Veri, Enerji Verimliliği Misyon Ekibi'nin ön analiz dosyasındandır (taslak); yıllar arası karşılaştırma Ocak–Eylül dönemiyle yapılır, çünkü 2024 verisi çoğu şirkette Eylül'e kadardır.</p>
      <section class="olcum-seridi grid grid-cols-2 xl:grid-cols-5">
        ${kart('Toplam tüketim, Oca–Eyl 2024', `${gwh(o.t24)} <span class="text-sm text-slate-400">GWh</span>`, `2023: ${gwh(o.t23)} GWh, değişim ${yuzde(d24)}`)}
        ${kart('İZSU hariç iştirakler', `${gwh(o.dig24)} <span class="text-sm text-slate-400">GWh</span>`, `2023: ${gwh(o.dig23)} GWh, değişim ${yuzde(dDig)}`)}
        ${kart('İZSU payı', `%${tr(o.izsuPay * 100, 0)}`, 'Detayı verilen 193 abone, İZSU toplamının yaklaşık dörtte beşi')}
        ${kart('Enerji karşılığı', `${tr(o.tep, 0)} <span class="text-sm text-slate-400">TEP</span>`, `Elektrik kWh × ${tr(o.tp * 1e6, 0)} TEP/GWh`)}
        ${kart('Emisyon', `${tr(o.co2, 0)} <span class="text-sm text-slate-400">tCO₂e</span>`, `Şebeke faktörü ${tr(o.ef * 1000, 0)} g/kWh`)}</section>
      <div class="glass-card overflow-hidden"><div class="px-4 py-3 border-b border-slate-800"><h3 class="text-sm font-bold text-white">Şirketler</h3><p class="text-[11px] text-slate-500">GWh. Yıllık sütunlar yılın 12 ayı da varsa gösterilir. Yıldızlı şirketin 2024 verisi dokuz aydan kısa. Satıra tıklayınca aşağıdaki grafik ve abone listesi o şirkete geçer.</p></div>
        <div class="overflow-x-auto"><table class="w-full text-xs" style="min-width:420px"><thead class="text-slate-400"><tr><th class="px-3 py-2 text-left font-medium">Şirket</th><th class="px-3 text-left font-medium hidden md:table-cell">Tür</th><th class="px-3 text-right font-medium hidden sm:table-cell">2022</th><th class="px-3 text-right font-medium hidden sm:table-cell">2023</th><th class="px-3 text-right font-medium">Oca–Eyl 2024</th><th class="px-3 text-right font-medium">2023'e göre</th><th class="px-3 text-right font-medium">Pay (%)</th><th class="px-3 text-right font-medium hidden md:table-cell">Abone</th><th class="px-3 text-left font-medium hidden lg:table-cell">Kapsam ve veri notu</th></tr></thead><tbody>${sirketSatir}</tbody></table></div></div>
      <section class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="glass-card p-4"><div class="flex flex-wrap gap-1.5 mb-3">${chip(!sec, "Istirak.sec('hepsi')", 'Tümü')} ${S.map((s) => chip(s.ad === secili, `Istirak.sec('${esc(s.ad)}')`, esc(s.ad))).join(' ')}</div>
          <h3 class="text-sm font-semibold text-white mb-2">Aylık tüketim, ${sec ? esc(sec.ad) : 'tüm şirketler'} (MWh)</h3><div class="h-64"><canvas id="chIstAy"></canvas></div></div>
        <div class="glass-card p-4"><h3 class="text-sm font-semibold text-white mb-2">İZSU hariç şirketler, Oca–Eyl 2024 (MWh)</h3><div class="h-72"><canvas id="chIstPay"></canvas></div></div></section>
      <div class="glass-card overflow-hidden"><div class="px-4 py-3 border-b border-slate-800 flex flex-wrap items-baseline justify-between gap-2"><div><h3 class="text-sm font-bold text-white">Aboneler${sec ? ', ' + esc(sec.ad) : ''}</h3><p class="text-[11px] text-slate-500">Oca–Eyl 2024 MWh. Yük faktörü = tüketim ÷ (sözleşme gücü × saat); %100'ü aşıyorsa sözleşme gücü ya da abone eşleşmesi kontrol edilmelidir. Abone numarası gösterilmez.</p></div><button onclick="Istirak.csv()" class="text-[11px] font-semibold text-amber-300 hover:underline">CSV indir</button></div>
        <div class="overflow-x-auto"><table class="w-full text-xs" style="min-width:560px"><thead class="text-slate-400"><tr><th class="px-3 py-2 text-left font-medium">Abone / tesis</th>${sec ? '' : '<th class="px-3 text-left font-medium">Şirket</th>'}<th class="px-3 text-right font-medium">Söz. gücü (kW)</th><th class="px-3 text-right font-medium">MWh</th><th class="px-3 text-right font-medium">Pay (%)</th><th class="px-3 text-right font-medium">2023'e göre</th><th class="px-3 text-right font-medium">Yük faktörü</th><th class="px-3 text-left font-medium hidden md:table-cell">Değerlendirme</th></tr></thead><tbody>
          ${gorunen.map((x) => { const f = yf(x), dg = degisim(x.v24, x.v23); return `<tr class="border-t border-slate-800/70"><td class="px-3 py-1.5 text-slate-100">${esc(aboneAd(x.a, sec ? x.i : null))}</td>${sec ? '' : `<td class="px-3 py-1.5 text-slate-400">${esc(x.a.sirket)}</td>`}<td class="px-3 py-1.5 text-right">${x.a.soz != null ? tr(x.a.soz) : '—'}</td><td class="px-3 py-1.5 text-right font-semibold">${tr(x.v24 / 1000)}</td><td class="px-3 py-1.5 text-right text-slate-400">${tr(x.v24 / toplamSec * 100, 1)}</td><td class="px-3 py-1.5 text-right ${renk(dg)}">${yuzde(dg)}</td><td class="px-3 py-1.5 text-right ${f != null && f > 1 ? 'text-amber-300' : ''}">${f != null ? '%' + tr(f * 100, 0) : '—'}</td><td class="px-3 py-1.5 text-[11px] text-slate-500 hidden md:table-cell">${esc(x.a.degerlendirme || '')}</td></tr>`; }).join('')}</tbody></table></div>
        ${aboneler.length > 20 ? `<button onclick="Istirak.tum()" class="w-full text-center text-xs font-semibold text-slate-400 hover:text-slate-200 py-2 border-t border-slate-800">${tumAbone ? 'İlk 20\'yi göster' : `Tümünü göster (${aboneler.length})`}</button>` : ''}</div>
      <div class="glass-card overflow-hidden"><div class="px-4 py-3 border-b border-slate-800"><h3 class="text-sm font-bold text-white">Verimlilik potansiyeli</h3><p class="text-[11px] text-slate-500">Literatürdeki teknik tasarruf bantları, Oca–Eyl 2024 tüketimine uygulanmıştır. Sahada doğrulanmış tasarruf değildir; yatırım ve geri ödeme tesis bazlı inceleme sonrasında değerlendirilmelidir. Baz dokuz aylıktır; yıllık eşdeğer için kabaca 12/9 uygulanabilir. TL değeri için birim fiyat bekleniyor.</p></div>
        <div class="overflow-x-auto"><table class="w-full text-xs" style="min-width:480px"><thead class="text-slate-400"><tr><th class="px-3 py-2 text-left font-medium">Şirket ve kategori</th><th class="px-3 text-right font-medium">Baz (GWh)</th><th class="px-3 text-right font-medium">Bant</th><th class="px-3 text-right font-medium">Tasarruf (GWh)</th><th class="px-3 text-right font-medium hidden sm:table-cell">TEP</th><th class="px-3 text-right font-medium hidden sm:table-cell">tCO₂e</th><th class="px-3 text-left font-medium hidden lg:table-cell">Önlem örnekleri (kaynak)</th></tr></thead><tbody>${pSatir}
          <tr class="border-t-2 border-slate-700 font-semibold"><td class="px-3 py-2 text-slate-100">Toplam</td><td class="px-3 py-2 text-right">${gwh(pb)}</td><td></td><td class="px-3 py-2 text-right">${gwh(pl, 2)} – ${gwh(ph, 2)}</td><td class="px-3 py-2 text-right hidden sm:table-cell">${tr(pl * o.tp, 0)} – ${tr(ph * o.tp, 0)}</td><td class="px-3 py-2 text-right hidden sm:table-cell">${tr(pl * o.ef / 1000, 0)} – ${tr(ph * o.ef / 1000, 0)}</td><td class="hidden lg:table-cell"></td></tr></tbody></table></div>
        <details class="border-t border-slate-800"><summary class="px-4 py-2.5 text-xs font-semibold text-slate-300 cursor-pointer">Bant kaynakları</summary><ul class="px-4 pb-3 text-[11px] text-slate-400 space-y-1">${D.kaynaklar.map((k) => `<li><b class="text-slate-300">${esc(k.kod)}</b> ${esc(k.kaynak)}: ${esc(k.bilgi)}</li>`).join('')}</ul></details></div>
      <p class="text-[11px] text-slate-500">Kapsam dışı: Büyükşehir Belediyesi hizmet binaları ve genel aydınlatma (iştirak değil), İZELMAN (veri yok), İzmir Jeotermal (yanıtta tüketim tabloları boş), Grand Plaza (kaynak belge yok). Tüketim değerleri şirketlerin resmî yanıtlarıyla karşılaştırılmıştır; açık büyüklük hataları düzeltilmiş, doğrulanmamış düzeltmeler kaynak dosyada işaretlidir.</p></div>`;

    if (!window.Chart) return;
    const ren = window.TV ? TV() : '#211950', yillar = ['2022', '2023', '2024'], pal = { 2022: '#94a3b8', 2023: '#3f8fd2', 2024: ren };
    const ay = (y) => AY.map((_, i) => { const l = (sec ? [sec] : S).map((s) => (s.aylik[y] || [])[i]).filter((v) => v != null); return l.length ? topla(l) / 1000 : null; });
    grafik.a = new Chart(document.getElementById('chIstAy'), { type: 'line', data: { labels: AY, datasets: yillar.map((y) => ({ label: y, data: ay(y), borderColor: pal[y], backgroundColor: pal[y], borderWidth: y === '2024' ? 3 : 2, pointRadius: y === '2024' ? 3 : 0, tension: 0.3, spanGaps: false })) },
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${tr(c.parsed.y)} MWh` } } } } });
    const dg = S.filter((s) => s.ad !== 'İZSU').map((s) => [s.ad, oe(s, '2024') / 1000]).sort((a, b) => b[1] - a[1]);
    grafik.b = new Chart(document.getElementById('chIstPay'), { type: 'bar', data: { labels: dg.map((x) => x[0]), datasets: [{ data: dg.map((x) => x[1]), backgroundColor: ren, borderRadius: 3 }] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${tr(c.parsed.x)} MWh` } } } } });
  }

  let kap = null;
  async function ac(el) { kap = el; ciz(el); await yukle(); ciz(el); }
  function csv() {
    if (!D) return; const sec = D.sirketler.find((s) => s.ad === secili);
    const satir = ['Şirket;Abone/tesis;Söz. gücü (kW);Oca–Eyl 2024 (kWh);Oca–Eyl 2023 (kWh)'];
    D.aboneler.filter((a) => !sec || a.sirket === sec.ad).forEach((a, i) => satir.push([a.sirket, aboneAd(a, i), a.soz != null ? a.soz : '', Math.round(topla(OE.map((m) => (a.aylik['2024'] || [])[m]))), Math.round(topla(OE.map((m) => (a.aylik['2023'] || [])[m])))].join(';')));
    const u = URL.createObjectURL(new Blob(['﻿' + satir.join('\n')], { type: 'text/csv;charset=utf-8' })), l = document.createElement('a');
    l.href = u; l.download = 'istirak-aboneler.csv'; l.click(); setTimeout(() => URL.revokeObjectURL(u), 2000);
  }
  window.Istirak = { ac, csv, sec(s) { secili = s; tumAbone = false; if (kap) ciz(kap); }, tum() { tumAbone = !tumAbone; if (kap) ciz(kap); } };
})();
