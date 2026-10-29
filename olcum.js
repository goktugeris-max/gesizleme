/* Ölçüm sekmesi (enerji analizörü / süzme sayaç): anlık değerler, 24 saatlik güç eğrisi, güç kalitesi uyarıları.
 *
 * Akış: binadaki okuyucu (collector/olcum/olcum_oku.py) Modbus ile cihazları okur → Supabase (olcum_nokta, olcum_son, olcum_15dk;
 * supabase/olcum.sql) → bu sekme Veri Girişi hesabıyla giriş yapılınca okur. Arayüz ISO 50001 sekmesinin "Ölçüm" alt sekmesindedir (iso.js → Olcum.panel(tesis, el)). Tablolar anon'a KAPALIDIR.
 * Cihaz henüz yokken "Örnek veriyle göster" düğmesi sahte (simülasyon) veriyle arayüzü gösterir; örnek veri belirgin şekilde etiketlenir.
 * Değer anahtarları profildeki standart adlardır (v_l1, i_l1, p_top [W], pf_top, thd_i_l1, e_tuketim_wh …) — cihaz markasından bağımsızdır.
 */
(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sayi = (n, o) => (n == null || !isFinite(n) ? '—' : Number(n).toLocaleString('tr-TR', o || { maximumFractionDigits: 1 }));
  const ESIK = { bayat_dk: 5, vmin: 207, vmax: 253, thdv: 8, thdi: 15, pf: 0.9, dengesiz_i: 10, fmin: 49.5, fmax: 50.5 };   // EN 50160 ±%10, THD-V %8; diğerleri başlangıç değeri
  const YENILE_MS = 30000;
  let D = null, secili = null, grafik = null, zamanlayici = null, ornek = false, yukleniyor = false, hata = null, kap = null, tesisId = null, isoErisim = null;

  // ---------- veri ----------
  async function yukle() {
    if (ornek) { D = ornekVeri(); return; }
    if (!window.VeriDB || !VeriDB.hazir() || !VeriDB.oturum()) { D = null; return; }
    yukleniyor = true; hata = null;
    try {
      const baslangic = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const [nokta, son, d15] = await Promise.all([
        VeriDB.istek('/rest/v1/olcum_nokta?select=*&order=kod'),
        VeriDB.istek('/rest/v1/olcum_son?select=*'),
        VeriDB.istek('/rest/v1/olcum_15dk?select=*&donem=gte.' + encodeURIComponent(baslangic) + '&order=donem&limit=5000'),
      ]);
      D = { nokta: nokta || [], son: Object.fromEntries((son || []).map((s) => [s.nokta_kod, s])), d15: d15 || [], ay: {} };
      // Ay başından beri tüketim (canlı referans karşılaştırması için); SQL fonksiyonu yoksa (eski kurulum) karşılaştırma gizlenir
      try { D.ay = Object.fromEntries(((await VeriDB.istek('/rest/v1/rpc/olcum_ay_tuketim', { method: 'POST', body: { p_bas: ayBasi().toISOString() } })) || []).map((r) => [r.nokta_kod, r])); } catch (e) { D.ay = {}; }
    } catch (e) {
      hata = /relation|does not exist|42P01|schema cache/i.test(e.message) ? 'Ölçüm tabloları kurulmamış görünüyor: supabase/olcum.sql dosyasını Supabase SQL Editor\'de bir kez çalıştırın.' : 'Veri okunamadı: ' + e.message;
      D = null;
    } finally { yukleniyor = false; }
  }

  const ayBasi = () => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), 1); };

  function ornekVeri() {
    const t0 = Date.now(), noktalar = [
      { kod: 'AASSM-ZK-CH1', ad: 'AASSM chiller grubu 1', tesis: 'aassm', cihaz_tipi: 'analizor', k: 1.0, enerji_turu: 'elektrik', iso_bolum: 'Ana bina', kat_mahal: 'Zemin kat / kazan dairesi', pano: 'P-1' },
      { kod: 'AASSM-ZK-CH2', ad: 'AASSM chiller grubu 2', tesis: 'aassm', cihaz_tipi: 'analizor', k: 0.8, enerji_turu: 'elektrik', iso_bolum: 'Ana bina', kat_mahal: 'Zemin kat / kazan dairesi', pano: 'P-2' },
      { kod: 'BUZ-ZK-CH1', ad: 'Buz Sporları chiller', tesis: 'buz', cihaz_tipi: 'analizor', k: 1.3 },
      { kod: 'BUCA-ASEVI-P1', ad: 'Buca Aşevi ana pano', tesis: 'buca', cihaz_tipi: 'sayac_ct', k: 0.4 },
    ];
    const D = { nokta: noktalar, son: {}, d15: [], ornek: true, ay: {} };
    noktalar.forEach((n, ix) => {
      let sayac = 1.2e9 + ix * 3e8;
      for (let k = 96; k >= 0; k--) {
        const t = new Date(Math.floor((t0 - k * 900000) / 900000) * 900000), saat = t.getHours() + t.getMinutes() / 60;
        const yuk = 0.35 + 0.55 * Math.max(0, Math.sin((saat - 6) / 14 * Math.PI)) + 0.03 * Math.sin(ix + k);
        const p = 150000 * n.k * yuk;
        sayac += p * 0.25;
        D.d15.push({ nokta_kod: n.kod, donem: t.toISOString(), ort_p_w: p, maks_p_w: p * 1.08, ort_pf: 0.95, ort_v: 229, ort_i_a: p / 396, maks_thd_i: 6.5, maks_thd_v: 1.8, e_tuketim_wh: sayac });
      }
      const son = D.d15[D.d15.length - 1], zayif = ix === 3;
      D.ay[n.kod] = { nokta_kod: n.kod, ilk_wh: son.e_tuketim_wh - n.k * 21e6 * (new Date().getDate() - 0.5) / 15, son_wh: son.e_tuketim_wh, son_donem: new Date().toISOString() };   // örnek ay tüketimi
      const v = [229.1, 228.4, 230.2], i = [1, 0.97, 1.03].map((c) => son.ort_i_a * c);
      D.son[n.kod] = {
        nokta_kod: n.kod, zaman: new Date().toISOString(), durum: ix === 2 ? 'cevrimdisi' : 'cevrimici',
        deger: {
          v_l1: v[0], v_l2: v[1], v_l3: v[2], i_l1: i[0], i_l2: i[1], i_l3: i[2], f: 50.01, p_l1: son.ort_p_w / 3, p_l2: son.ort_p_w / 3.05, p_l3: son.ort_p_w / 2.95, p_top: son.ort_p_w, q_top: son.ort_p_w * 0.33, s_top: son.ort_p_w / 0.95,
          pf_top: zayif ? 0.82 : 0.95, thd_v_l1: zayif ? 9.1 : 1.8, thd_i_l1: 6.5, thd_i_l2: 6.2, thd_i_l3: 6.8, i_dengesizlik: ix === 1 ? 12.4 : 3.2, e_tuketim_wh: son.e_tuketim_wh,
        },
      };
    });
    return D;
  }

  // Nokta hangi ISO tesisine ait: olcum_nokta.tesis alanı tesis kimliği (aassm/buz/buca) ya da adı olabilir
  const NORM = (x) => String(x || '').toLocaleLowerCase('tr').replace(/[^a-z0-9ğüşıöç]/g, '');
  const TESIS_ANAHTAR = { aassm: ['aassm', 'ahmedadnan'], buz: ['buzsporlar', 'buzpisti', 'asıkveysel', 'buz'], buca: ['buca'] };
  const tesisiMi = (n) => { const t = NORM(n.tesis); return !tesisId || (t && (TESIS_ANAHTAR[tesisId] || [tesisId]).some((a) => t.includes(a))); };

  // ---------- kurallar ----------
  function uyarilar(n, s) {
    const u = [];
    if (!s) return [{ s: 'k', m: 'Henüz hiç ölçüm gelmedi' }];
    const yas = (Date.now() - new Date(s.zaman).getTime()) / 60000;
    if (s.durum === 'cevrimdisi' || yas > ESIK.bayat_dk) u.push({ s: 'k', m: s.durum === 'cevrimdisi' ? 'Haberleşme yok (cihaz okunamıyor)' : 'Veri ' + Math.round(yas) + ' dk önce geldi (okuyucu durmuş olabilir)' });
    const d = s.deger;
    if (!d) return u;
    const vler = ['v_l1', 'v_l2', 'v_l3'].map((k) => d[k]).filter((x) => x != null);
    if (vler.some((v) => v < ESIK.vmin || v > ESIK.vmax)) u.push({ s: 'k', m: 'Gerilim sınır dışı (' + sayi(Math.min(...vler)) + '–' + sayi(Math.max(...vler)) + ' V; sınır ' + ESIK.vmin + '–' + ESIK.vmax + ')' });
    const thdv = Math.max(...['thd_v_l1', 'thd_v_l2', 'thd_v_l3'].map((k) => d[k]).filter((x) => x != null), 0);
    if (thdv > ESIK.thdv) u.push({ s: 'k', m: 'Gerilim harmoniği (THD-V) %' + sayi(thdv) + ' > %' + ESIK.thdv });
    const thdi = Math.max(...['thd_i_l1', 'thd_i_l2', 'thd_i_l3'].map((k) => d[k]).filter((x) => x != null), 0);
    if (thdi > ESIK.thdi) u.push({ s: 's', m: 'Akım harmoniği (THD-I) %' + sayi(thdi) + ' > %' + ESIK.thdi });
    if (d.pf_top != null && d.p_top > 1000 && Math.abs(d.pf_top) < ESIK.pf) u.push({ s: 's', m: 'Güç faktörü düşük (' + sayi(d.pf_top, { maximumFractionDigits: 2 }) + ' < ' + ESIK.pf + ') — reaktif ceza riski' });
    if (d.i_dengesizlik != null && d.i_dengesizlik > ESIK.dengesiz_i) u.push({ s: 's', m: 'Akım dengesizliği %' + sayi(d.i_dengesizlik) });
    if (d.f != null && (d.f < ESIK.fmin || d.f > ESIK.fmax)) u.push({ s: 's', m: 'Frekans ' + sayi(d.f, { maximumFractionDigits: 2 }) + ' Hz' });
    return u;
  }
  const seviye = (u) => (u.some((x) => x.s === 'k') ? 'k' : u.length ? 's' : 'y');
  const ROZET = { k: 'bg-rose-500/15 text-rose-400 border-rose-500/30', s: 'bg-amber-500/15 text-amber-400 border-amber-500/30', y: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' };
  const ROZET_AD = { k: 'Sorunlu', s: 'Dikkat', y: 'Normal' };

  // 24 saatte tüketim (kWh): sayaç farkı
  function tuketim24(kod) {
    const l = D.d15.filter((r) => r.nokta_kod === kod && r.e_tuketim_wh != null);
    return l.length > 1 ? (l[l.length - 1].e_tuketim_wh - l[0].e_tuketim_wh) / 1000 : null;
  }

  // ---------- arayüz ----------
  function kart(b, v, alt, renk) { return `<div class="glass-card rounded-xl p-4"><div class="text-[11px] uppercase tracking-wider text-slate-400">${b}</div><div class="text-2xl font-bold mt-1 ${renk || 'text-white'}">${v}</div><div class="text-[11px] text-slate-500 mt-1">${alt}</div></div>`; }

  function bosEkran(mesaj, giris) {
    return `<div class="glass-card rounded-xl p-6 space-y-3"><div class="flex items-start gap-3"><i data-lucide="gauge" class="w-5 h-5 mt-0.5 text-sky-400 shrink-0"></i><div class="text-sm text-slate-300 space-y-2">
      <p>${mesaj}</p>
      <div class="flex flex-wrap gap-2 pt-1">${giris ? `<button onclick="Dash.sekme('veri')" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">Veri Girişi'ne git (giriş yap)</button>` : ''}
      <button onclick="Olcum.ornek(true)" class="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-600 text-slate-300">Örnek veriyle göster</button></div></div></div></div>`;
  }


  // ---------- Canlı referans karşılaştırması (ISO 50001 EnRÇ): ay başından beri tüketim ↔ bölümün aylık referansı ve hedefi ----------
  function canliSapma(satir) {
    if (!isoErisim || !D.ay) return '';
    const bas = ayBasi(), simdi = new Date(), ayUz = new Date(bas.getFullYear(), bas.getMonth() + 1, 1) - bas, gruplar = {};
    satir.forEach((x) => { const n = x.n; if (n.iso_bolum && (n.enerji_turu || 'elektrik') === 'elektrik' && D.ay[n.kod]) (gruplar[n.iso_bolum] = gruplar[n.iso_bolum] || []).push(D.ay[n.kod]); });
    const satirlar = Object.entries(gruplar).map(([bolum, l]) => {
      const ref = isoErisim.seri(bolum); if (!ref || !ref.referans) return null;
      const tuk = l.reduce((t, r) => t + (r.son_wh - r.ilk_wh) / 1000, 0), sonVeri = new Date(Math.max(...l.map((r) => new Date(r.son_donem).getTime())));
      const oran = Math.min(1, Math.max(0.02, (sonVeri - bas) / ayUz)), beklenen = ref.referans * oran, sapma = beklenen ? tuk / beklenen - 1 : null, tahmin = tuk / oran;
      // FRM.06.07'deki referans çizgisi ZATEN hedefi içerir: baz dönem × (1 − hedef). Hedefsiz baz çizgi (EnB) = referans ÷ (1 − hedef); hedef ikinci kez uygulanmaz.
      const enb = ref.hedef ? ref.referans / (1 - ref.hedef) : null;
      const durum = tahmin <= ref.referans ? ['Hedefte', 'text-emerald-400'] : enb != null && tahmin <= enb ? ['EnB altında, hedefe ulaşmadı', 'text-sky-300'] : tahmin <= (enb || ref.referans) * 1.05 ? ['EnB\'ye yakın', 'text-amber-400'] : ['Referans aşımı riski', 'text-rose-400'];
      return `<tr class="border-t border-slate-800/70"><td class="px-3 py-2 font-semibold">${esc(bolum)}</td><td class="px-3 text-right">${sayi(tuk, { maximumFractionDigits: 0 })}</td><td class="px-3 text-right">${sayi(beklenen, { maximumFractionDigits: 0 })}</td>
        <td class="px-3 text-right font-semibold ${sapma > 0.05 ? 'text-rose-400' : sapma > 0 ? 'text-amber-400' : 'text-emerald-400'}">${sapma == null ? '—' : (sapma > 0 ? '+' : '') + (sapma * 100).toFixed(1).replace('.', ',') + '%'}</td>
        <td class="px-3 text-right">${sayi(tahmin, { maximumFractionDigits: 0 })}</td><td class="px-3 text-right">${sayi(ref.referans, { maximumFractionDigits: 0 })}</td><td class="px-3 text-right">${enb == null ? '—' : sayi(enb, { maximumFractionDigits: 0 })}</td><td class="px-3 ${durum[1]} font-semibold">${durum[0]}</td></tr>`;
    }).filter(Boolean);
    if (!satirlar.length) return '';
    return `<div class="glass-card rounded-xl overflow-hidden"><div class="px-4 py-2 flex flex-wrap items-center gap-2"><div class="text-sm font-bold text-white">Canlı referans karşılaştırması</div><div class="text-[11px] text-slate-500">${simdi.toLocaleString('tr-TR', { month: 'long', year: 'numeric' })} · ölçülen elektrik, bölümün aylık referans çizgisiyle (EnRÇ) kıyaslanır</div></div>
      <div class="overflow-x-auto"><table class="w-full text-xs" style="min-width:640px"><thead class="text-slate-400 uppercase tracking-wider text-[10px]"><tr><th class="px-3 py-2 text-left">ISO bölümü</th><th class="px-3 text-right">Ay başından (kWh)</th><th class="px-3 text-right">Referansın orantılı payı</th><th class="px-3 text-right">Sapma</th><th class="px-3 text-right">Ay sonu tahmini</th><th class="px-3 text-right">Aylık referans (hedef dahil)</th><th class="px-3 text-right">EnB (hedefsiz)</th><th class="px-3 text-left">Durum</th></tr></thead><tbody>${satirlar.join('')}</tbody></table></div>
      <p class="px-4 py-2 text-[11px] text-slate-500">Tahmin = ay başından beri tüketim ÷ geçen ay oranı (düz projeksiyon). Bölümün tüm tüketimi ölçülmüyorsa (yalnız bazı panolar) karşılaştırma eksik kalır; ölçüm noktasına ISO bölümü, nokta listesindeki "iso_bolum" alanıyla verilir.</p></div>`;
  }

  // ---------- Ölçüm planı (FRM.06.06): hangi enerji kullanımı nasıl ölçülecek, cihaz bağlandı mı ----------
  let PLAN = null, planIstendi = false;
  function planEkle() {
    if (!kap || !document.body.contains(kap)) return;
    const eski = kap.querySelector('#olcumPlan'); if (eski) eski.remove();
    if (!PLAN) {
      if (!planIstendi) { planIstendi = true; fetch('data/olcum_plan.json').then((r) => r.json()).then((j) => { PLAN = j; planEkle(); }).catch(() => { PLAN = { satirlar: [] }; }); }
      return;
    }
    const satir = (PLAN.satirlar || []).filter((s) => s.tesis === tesisId);
    if (!satir.length) return;
    const bagli = (s) => (D && D.nokta ? D.nokta.filter((n) => tesisiMi(n) && (n.enerji_turu || 'elektrik') === s.tur && NORM(n.iso_bolum) === NORM(s.bolum)).length : 0);
    const durum = (s) => {
      if (s.okuma !== 'osos') return ['Elle: fatura ve sayaç', 'text-slate-400'];
      const k = bagli(s); return k ? [k + ' ölçüm noktası bağlı', 'text-emerald-400'] : s.tesis === 'buca' ? ['Mevcut OSOS verisi (analizör ikinci faz)', 'text-slate-400'] : ['Analizör bekliyor', 'text-amber-400'];
    };
    const bekleyen = satir.filter((s) => s.okuma === 'osos' && s.tesis !== 'buca' && !bagli(s)).length;
    const div = document.createElement('div'); div.id = 'olcumPlan'; div.className = 'glass-card rounded-xl overflow-hidden mt-4';
    div.innerHTML = `<div class="px-4 py-2 flex flex-wrap items-center gap-2"><div class="text-sm font-bold text-white">Ölçüm planı</div><div class="text-[11px] text-slate-500">${esc(PLAN.kaynak || 'FRM.06.06')} · ${satir.length} enerji kullanımı${bekleyen ? ' · ' + bekleyen + ' elektrik kullanımı için analizör bekleniyor' : ''}</div></div>
      <div class="overflow-x-auto"><table class="w-full text-xs" style="min-width:640px"><thead class="text-slate-400 uppercase tracking-wider text-[10px]"><tr><th class="px-3 py-2 text-left">Bölüm</th><th class="px-3 text-left">Enerji kullanımı</th><th class="px-3 text-left">Tür</th><th class="px-3 text-left">İlgili değişken</th><th class="px-3 text-left">Veri okuma</th><th class="px-3 text-left">Sıklık</th><th class="px-3 text-left">Durum</th></tr></thead><tbody>
      ${satir.map((s) => { const d = durum(s); return `<tr class="border-t border-slate-800/70"><td class="px-3 py-2 font-semibold">${esc(s.bolum)}</td><td class="px-3">${esc(s.kullanim)}</td><td class="px-3 whitespace-nowrap">${s.tur === 'elektrik' ? 'Elektrik' : 'Doğalgaz'} (${esc(s.birim)})</td><td class="px-3">${esc(s.degisken)}</td><td class="px-3">${esc(s.okuma_ad)}</td><td class="px-3 whitespace-nowrap">${esc(s.periyot)}</td><td class="px-3 font-semibold ${d[1]}">${d[0]}</td></tr>`; }).join('')}</tbody></table></div>
      <p class="px-4 py-2 text-[11px] text-slate-500">Plan, Enerji Ölçme ve İzleme formundan (FRM.06.06) alınmıştır; sayaç numaraları gösterilmez. Bölümün <b>ana giriş</b> analizörü bağlanıp okunmaya başlayınca (aşağıdaki "Analizör montaj ve IP planı") durum kendiliğinden "bağlı" olur.</p>`;
    kap.appendChild(div);
  }

  function ciz() { cizAsil(); planEkle(); }
  function cizAsil() {
    const el = kap;
    if (!el || !document.body.contains(el)) return;
    if (!window.VeriDB || !VeriDB.hazir()) { el.innerHTML = bosEkran('Supabase ayarı yok (supabase-ayar.js). Ölçüm verisi veritabanından okunur.', false); return icon(); }
    if (!ornek && !VeriDB.oturum()) { el.innerHTML = bosEkran('Ölçüm verileri yalnız giriş yapmış kullanıcılara açıktır. Önce Veri Girişi hesabınızla giriş yapın.', true); return icon(); }
    if (hata) { el.innerHTML = bosEkran(esc(hata), false); return icon(); }
    if (!D) { el.innerHTML = '<div class="text-sm text-slate-400 p-4">Yükleniyor…</div>'; return; }
    const noktalar = D.nokta.filter(tesisiMi);
    if (!noktalar.length) { el.innerHTML = bosEkran('Bu tesis için henüz ölçüm noktası yok. Analizörler takılıp okuyucu (collector/olcum/olcum_oku.py) çalışmaya başlayınca noktalar burada görünür. Kurulum: collector/olcum/README.md', false); return icon(); }

    const satir = noktalar.map((n) => { const s = D.son[n.kod], u = uyarilar(n, s); return { n, s, u, sev: seviye(u) }; });
    const cevrimici = satir.filter((x) => x.s && x.s.durum === 'cevrimici' && (Date.now() - new Date(x.s.zaman).getTime()) / 60000 <= ESIK.bayat_dk).length;
    const toplamKw = satir.reduce((t, x) => t + (x.s && x.s.durum === 'cevrimici' && x.s.deger && x.s.deger.p_top > 0 ? x.s.deger.p_top / 1000 : 0), 0);
    const kwh24 = satir.reduce((t, x) => t + (tuketim24(x.n.kod) || 0), 0);
    const sorunlu = satir.filter((x) => x.sev === 'k').length, dikkat = satir.filter((x) => x.sev === 's').length;
    if (!secili || !noktalar.some((n) => n.kod === secili)) secili = (satir.find((x) => x.sev === 'k') || satir[0]).n.kod;

    el.innerHTML = `
      ${D.ornek ? `<div class="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs text-amber-300 flex items-center justify-between gap-3"><span><b>ÖRNEK VERİ</b> — gerçek ölçüm değildir; arayüzü göstermek için simülasyonla üretildi.</span><button onclick="Olcum.ornek(false)" class="underline shrink-0">Kapat</button></div>` : ''}
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        ${kart('Anlık toplam güç', sayi(toplamKw) + ' kW', 'çevrimiçi noktaların toplamı')}
        ${kart('Çevrimiçi nokta', cevrimici + ' / ' + satir.length, 'son ' + ESIK.bayat_dk + ' dk içinde okunan', cevrimici < satir.length ? 'text-amber-400' : 'text-emerald-400')}
        ${kart('Son 24 saat tüketim', sayi(kwh24, { maximumFractionDigits: 0 }) + ' kWh', 'sayaç farkından')}
        ${kart('Uyarı', sorunlu + ' sorunlu · ' + dikkat + ' dikkat', 'haberleşme, gerilim, harmonik, güç faktörü', sorunlu ? 'text-rose-400' : dikkat ? 'text-amber-400' : 'text-emerald-400')}
      </div>
      ${canliSapma(satir)}
      <div class="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div class="lg:col-span-2 space-y-2 min-w-0" id="olcumListe">${satir.map((x) => {
          const d = x.s && x.s.deger, aktif = x.n.kod === secili;
          return `<button onclick="Olcum.sec('${esc(x.n.kod)}')" class="w-full text-left glass-card rounded-xl p-3 border ${aktif ? 'border-amber-500/50' : 'border-transparent'}">
            <div class="flex items-center justify-between gap-2"><div class="min-w-0"><div class="text-sm font-semibold truncate">${esc(x.n.ad || x.n.kod)}</div><div class="text-[11px] text-slate-500 truncate">${esc([x.n.iso_bolum, x.n.kat_mahal, x.n.pano].filter(Boolean).join(' › ') || x.n.tesis || '')} · ${esc(x.n.kod)}</div></div>
            <span class="text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${ROZET[x.sev]}">${ROZET_AD[x.sev]}</span></div>
            <div class="mt-2 grid grid-cols-3 gap-2 text-center text-[11px]"><div><div class="text-base font-bold">${d && d.p_top != null ? sayi(d.p_top / 1000) : '—'}</div><div class="text-slate-500">kW</div></div>
            <div><div class="text-base font-bold">${d && d.pf_top != null ? sayi(Math.abs(d.pf_top), { maximumFractionDigits: 2 }) : '—'}</div><div class="text-slate-500">cos φ</div></div>
            <div><div class="text-base font-bold">${d && d.i_l1 != null ? sayi((d.i_l1 + d.i_l2 + d.i_l3) / 3, { maximumFractionDigits: 0 }) : '—'}</div><div class="text-slate-500">A ort.</div></div></div></button>`; }).join('')}</div>
        <div class="lg:col-span-3 space-y-3 min-w-0" id="olcumDetay"></div>
      </div>
      <p class="text-[11px] text-slate-500">Uyarı eşikleri başlangıç değeridir: gerilim ${ESIK.vmin}–${ESIK.vmax} V (EN 50160 ±%10), THD-V ≤ %${ESIK.thdv}, THD-I ≤ %${ESIK.thdi}, güç faktörü ≥ ${ESIK.pf}, akım dengesizliği ≤ %${ESIK.dengesiz_i}. Şartname: donanımla izlenen noktalarda en fazla 1 dakikalık veri.</p>`;
    detayCiz(satir.find((x) => x.n.kod === secili));
    icon();
  }

  function detayCiz(x) {
    const el = kap && kap.querySelector('#olcumDetay');
    if (!el || !x) return;
    const d = (x.s && x.s.deger) || {}, f = (k, o) => sayi(d[k], o);
    const faz = (b, ks, o, bol) => `<tr><td class="py-1 text-slate-400">${b}</td>${ks.map((k) => `<td class="py-1 text-right">${d[k] != null ? sayi(d[k] / (bol || 1), o) : '—'}</td>`).join('')}</tr>`;
    el.innerHTML = `
      <div class="glass-card rounded-xl p-4 space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2"><div><div class="font-semibold">${esc(x.n.ad || x.n.kod)}</div><div class="text-[11px] text-slate-500">${esc(x.n.kod)} · ${esc(x.n.cihaz_tipi || '')} · son okuma ${x.s ? new Date(x.s.zaman).toLocaleTimeString('tr-TR') : '—'}</div></div>
        <span class="text-[10px] px-2 py-0.5 rounded-full border ${ROZET[x.sev]}">${ROZET_AD[x.sev]}</span></div>
        ${x.u.length ? `<ul class="space-y-1">${x.u.map((a) => `<li class="text-xs flex gap-2 ${a.s === 'k' ? 'text-rose-400' : 'text-amber-400'}"><i data-lucide="alert-triangle" class="w-3.5 h-3.5 shrink-0 mt-0.5"></i>${esc(a.m)}</li>`).join('')}</ul>` : '<div class="text-xs text-emerald-400">Uyarı yok.</div>'}
        <div class="h-52"><canvas id="chOlcumGuc"></canvas></div>
        <div class="text-[11px] text-slate-500">Son 24 saat, 15 dakikalık ortalama ve en yüksek güç (kW). Tüketim: ${sayi(tuketim24(x.n.kod), { maximumFractionDigits: 0 })} kWh.</div>
      </div>
      <div class="glass-card rounded-xl p-4 overflow-x-auto"><table class="w-full text-xs"><thead><tr class="text-slate-400"><th class="text-left font-medium"> </th><th class="text-right font-medium">L1</th><th class="text-right font-medium">L2</th><th class="text-right font-medium">L3</th></tr></thead><tbody>
        ${faz('Gerilim (V)', ['v_l1', 'v_l2', 'v_l3'])}${faz('Akım (A)', ['i_l1', 'i_l2', 'i_l3'])}${faz('Aktif güç (kW)', ['p_l1', 'p_l2', 'p_l3'], { maximumFractionDigits: 1 }, 1000)}
        ${faz('THD-V (%)', ['thd_v_l1', 'thd_v_l2', 'thd_v_l3'])}${faz('THD-I (%)', ['thd_i_l1', 'thd_i_l2', 'thd_i_l3'])}</tbody></table>
        <div class="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-400"><div>Frekans <b class="text-slate-200">${f('f', { maximumFractionDigits: 2 })} Hz</b></div><div>Reaktif <b class="text-slate-200">${d.q_top != null ? sayi(d.q_top / 1000) : '—'} kVAr</b></div><div>Görünür <b class="text-slate-200">${d.s_top != null ? sayi(d.s_top / 1000) : '—'} kVA</b></div><div>Akım dengesizliği <b class="text-slate-200">%${f('i_dengesizlik')}</b></div></div></div>`;
    const r = D.d15.filter((q) => q.nokta_kod === x.n.kod);
    if (grafik) grafik.destroy();
    const cv = document.getElementById('chOlcumGuc');
    if (cv && window.Chart) {
      grafik = new Chart(cv, {
        type: 'line',
        data: { labels: r.map((q) => new Date(q.donem).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })), datasets: [
          { label: 'Ortalama kW', data: r.map((q) => (q.ort_p_w == null ? null : q.ort_p_w / 1000)), borderColor: window.TV ? TV() : '#211950', backgroundColor: 'rgba(63,143,210,.12)', fill: true, tension: .25, pointRadius: 0, borderWidth: 2 },
          { label: 'En yüksek kW', data: r.map((q) => (q.maks_p_w == null ? null : q.maks_p_w / 1000)), borderColor: '#3f8fd2', borderDash: [4, 3], pointRadius: 0, borderWidth: 1.2, fill: false }] },
        options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { labels: { boxWidth: 10, font: { size: 10 } } } }, scales: { x: { ticks: { maxTicksLimit: 8, font: { size: 10 } } }, y: { beginAtZero: true, ticks: { font: { size: 10 } } } } },
      });
    }
  }

  function icon() { if (window.lucide) lucide.createIcons(); }

  async function yenile() { await yukle(); ciz(); }
  // ISO 50001 sekmesindeki "Ölçüm" alt sekmesi: seçili tesisin noktalarını `el` içine çizer ve görünür kaldığı sürece yeniler
  function panel(tesis, el, iso) {
    kap = el; tesisId = tesis; secili = null; isoErisim = iso || null;
    if (grafik) { grafik.destroy(); grafik = null; }
    yenile();
    clearInterval(zamanlayici);
    zamanlayici = setInterval(() => {
      if (!kap || !document.body.contains(kap) || kap.closest('.hidden')) { clearInterval(zamanlayici); return; }
      if (!yukleniyor) yenile();
    }, YENILE_MS);
  }

  window.Olcum = {
    panel,
    sec(kod) { secili = kod; ciz(); },
    ornek(v) { ornek = !!v; yenile(); },
    uyarilar,   // test/rapor için
    ESIK,
  };
})();
