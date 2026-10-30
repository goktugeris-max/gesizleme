/* Baz yük (ISO 50001 → tesis → "Baz yük" alt sekmesi): hava ve etkinlik değişkenlerinden bağımsız taban tüketim.
 *
 * Veri: ISO şifreli verisindeki aylık gerçekleşen tüketim (seri.yillar[yıl].takip) ve HDD/CDD değişkenleri; ek dosya ya da veritabanı gerekmez.
 * İki yöntem, ikisi de seçili yıla kadarki tüm aylarla çalışır:
 *  A) Regresyon: tüketim = baz × ay günü + b × HDD + c × CDD. "baz" (kWh ya da Sm³ / gün) hava sıfırken kalan tüketimdir; negatif çıkan katsayı modelden atılır.
 *     Yalnız HDD/CDD değişkeni olan seriler için; R² ≥ 0,5 ise önerilen değer budur.
 *  B) En düşük aylar: son 12 ayın günlük ortalaması en düşük 3 ayının ortalaması (ısıtma/soğutma yükünün en az olduğu aylar; yıl içinde kış aylarıyla sınırlı kısmi yıl değeri şişirmesin diye takvim yılı değil son 12 ay). Her seride hesaplanır; geçen yılla (önceki 12 ay) karşılaştırılır.
 * Aylık veri gece/hafta sonu ayrımı veremez; gerçek baz güç (gece minimumu) 15 dakikalık analizör verisiyle (ISO → Ölçüm) doğrulanmalıdır.
 * Birimler: elektrik kWh ve kW (= kWh/gün ÷ 24), doğalgaz Sm³. TEP: elektrik kWh×0,000086, doğalgaz Sm³×0,000825 (etüt raporlarıyla aynı).
 */
(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tr = (n, d) => (n == null || isNaN(n) ? '—' : Number(n).toLocaleString('tr-TR', { maximumFractionDigits: d == null ? 0 : d, minimumFractionDigits: d == null ? 0 : d }));
  const yuzde = (n) => (n == null || !isFinite(n) ? '—' : '%' + tr(n * 100, 0));
  const AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const TEP = { Elektrik: 0.000086, 'Doğalgaz': 0.000825 };
  const R2_IYI = 0.75, R2_KULLAN = 0.5;
  const gunSayisi = (y, a) => new Date(y, a + 1, 0).getDate();
  const grafik = {};

  // ---------- hesap (saf fonksiyonlar; window.Baz.hesapla ile de çağrılabilir) ----------
  // En küçük kareler (normal denklemler + Gauss); tekil ise null
  function ols(X, y) {
    const k = X[0].length, A = Array.from({ length: k }, () => new Array(k + 1).fill(0));
    X.forEach((r, i) => { for (let a = 0; a < k; a++) { for (let b = 0; b < k; b++) A[a][b] += r[a] * r[b]; A[a][k] += r[a] * y[i]; } });
    for (let c = 0; c < k; c++) {
      let p = c; for (let r = c + 1; r < k; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      if (Math.abs(A[p][c]) < 1e-9) return null;
      [A[c], A[p]] = [A[p], A[c]];
      for (let r = 0; r < k; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let j = c; j <= k; j++) A[r][j] -= f * A[c][j]; }
    }
    return A.map((r, i) => r[k] / r[i]);
  }
  const anahtar = (v, re) => Object.keys(v.degiskenler || {}).find((k) => re.test(k));

  // Seçili yıla kadar olan aylık noktalar
  function noktalar(s, sonYil) {
    const out = [];
    Object.keys(s.yillar).map(Number).filter((y) => y <= sonYil).sort().forEach((y) => {
      const v = s.yillar[String(y)], hk = anahtar(v, /^hdd/i), ck = anahtar(v, /^cdd/i);
      (v.takip || []).forEach((x, a) => { if (x != null && x > 0) out.push({ y, a, v: x, gun: gunSayisi(y, a), hdd: hk ? v.degiskenler[hk][a] : undefined, cdd: ck ? v.degiskenler[ck][a] : undefined }); });
    });
    return out;
  }

  // Yöntem A: regresyon; havaya duyarlı değişken yoksa ya da model uygun değilse null
  function regresyon(nk) {
    const var_ = ['hdd', 'cdd'].filter((d) => nk.some((p) => p[d] != null));
    let kolon = var_.filter((d) => nk.every((p) => p[d] != null));
    const sat = nk.filter((p) => kolon.every((d) => p[d] != null));
    if (!kolon.length || sat.length < 10) return null;
    for (let tur = 0; tur < 3; tur++) {
      const X = sat.map((p) => [p.gun, ...kolon.map((d) => p[d])]), y = sat.map((p) => p.v), c = ols(X, y);
      if (!c) return null;
      const neg = kolon.map((d, i) => [d, c[i + 1]]).filter((x) => x[1] < 0).sort((a, b) => a[1] - b[1])[0];
      if (neg) { kolon = kolon.filter((d) => d !== neg[0]); if (!kolon.length) return null; continue; }
      if (!(c[0] > 0)) return null;
      const ort = y.reduce((t, v) => t + v, 0) / y.length, sst = y.reduce((t, v) => t + (v - ort) ** 2, 0);
      const sse = X.reduce((t, r, i) => t + (y[i] - r.reduce((s, v, j) => s + v * c[j], 0)) ** 2, 0);
      return { gunluk: c[0], kolon, katsayi: c.slice(1), r2: sst ? 1 - sse / sst : null, n: sat.length };
    }
    return null;
  }

  // Yöntem B: yıl bazında günlük ortalaması en düşük 3 ay
  function enDusuk(nk) {
    const yillar = {};
    nk.forEach((p) => { (yillar[p.y] = yillar[p.y] || []).push(p.v / p.gun); });
    const out = {};
    Object.keys(yillar).forEach((y) => { const l = yillar[y]; if (l.length >= 9) { const d = [...l].sort((a, b) => a - b).slice(0, 3); out[y] = d.reduce((t, v) => t + v, 0) / 3; } });
    return out;
  }

  // Yılın tamamı yoksa (yıl içi) son 12 ayın ve ondan önceki 12 ayın en düşük 3 ayı: kış aylarıyla sınırlı kısmi yıl değeri şişirmesin
  function son12(nk, kaydir) {
    const l = nk.slice(Math.max(0, nk.length - 12 - kaydir), nk.length - kaydir);
    if (l.length < 12) return null;
    const d = l.map((p) => p.v / p.gun).sort((a, b) => a - b).slice(0, 3);
    return d.reduce((t, v) => t + v, 0) / 3;
  }

  function hesapla(s, yil) {
    const nk = noktalar(s, yil), ay = nk.filter((p) => p.y === yil);
    if (ay.length < 3) return null;
    const A = regresyon(nk), B = enDusuk(nk), b = son12(nk, 0);
    const aKullan = A && A.r2 != null && A.r2 >= R2_KULLAN;
    const gunluk = aKullan ? A.gunluk : b;
    if (gunluk == null) return null;
    const toplam = ay.reduce((t, p) => t + p.v, 0), baz = ay.reduce((t, p) => t + Math.min(p.v, gunluk * p.gun), 0);
    const onceki = son12(nk, 12);
    return { A, B, bGunluk: b, gunluk, yontem: aKullan ? 'A' : 'B', toplam, baz, pay: toplam ? baz / toplam : null, aySayisi: ay.length,
      degisim: onceki && b != null ? b / onceki - 1 : null, ay, guven: !A ? (b != null ? 'model yok' : '') : A.r2 >= R2_IYI ? 'iyi' : A.r2 >= R2_KULLAN ? 'orta' : 'zayıf' };
  }

  // ---------- görünüm ----------
  const bolumAdi = (s) => s.bolum.split(' –')[0].trim();
  const guvenRenk = { iyi: '#1f9d6b', orta: '#d9962b', 'zayıf': '#d64545', 'model yok': '#94a3b8' };   // durum anlamı taşıyan nokta renkleri
  const kart = (b, d, alt) => `<div class="glass-card p-4"><div class="text-[11px] text-slate-400">${b}</div><div class="text-2xl font-bold mt-1 text-white">${d}</div><div class="text-[11px] text-slate-500 mt-1">${alt}</div></div>`;
  const birim = (s) => (s.enerji === 'Elektrik' ? 'kWh' : 'Sm³');
  const tepYillik = (s, r) => (r.toplam ? (r.baz * 12 / r.aySayisi) * (TEP[s.enerji] || 0) : null);

  function panel(tesis, el, seriler, yil) {
    Object.values(grafik).forEach((g) => g && g.destroy()); Object.keys(grafik).forEach((k) => delete grafik[k]);
    yil = Number(yil);
    const liste = seriler.filter((s) => s.tesis === tesis && s.yillar[String(yil)]).map((s) => ({ s, r: hesapla(s, yil) })).filter((x) => x.r);
    if (!liste.length) { el.innerHTML = '<p class="text-sm text-slate-400 p-6">Bu tesis ve yıl için baz yük hesaplanacak yeterli aylık veri yok (en az 3 ay gerekir).</p>'; return; }
    const topla = (e, f) => liste.filter((x) => x.s.enerji === e).reduce((t, x) => t + f(x), 0);
    const elek = liste.filter((x) => x.s.enerji === 'Elektrik'), gaz = liste.filter((x) => x.s.enerji === 'Doğalgaz');
    const elekKw = topla('Elektrik', (x) => x.r.gunluk) / 24, elekPay = (() => { const t = topla('Elektrik', (x) => x.r.toplam); return t ? topla('Elektrik', (x) => x.r.baz) / t : null; })();
    const gazGun = topla('Doğalgaz', (x) => x.r.gunluk), gazPay = (() => { const t = topla('Doğalgaz', (x) => x.r.toplam); return t ? topla('Doğalgaz', (x) => x.r.baz) / t : null; })();
    const tep = liste.reduce((t, x) => t + (tepYillik(x.s, x.r) || 0), 0);
    const elekDeg = (() => { const d = elek.filter((x) => x.r.degisim != null); if (!d.length) return null; const now = d.reduce((t, x) => t + x.r.bGunluk, 0), prev = d.reduce((t, x) => t + x.r.bGunluk / (1 + x.r.degisim), 0); return prev ? now / prev - 1 : null; })();
    const renkDeg = (v) => (v == null ? 'text-slate-400' : v > 0.03 ? 'text-red-400' : v < -0.03 ? 'text-emerald-400' : 'text-slate-300');

    const satir = (x) => {
      const { s, r } = x, b = birim(s), kw = s.enerji === 'Elektrik' ? tr(r.gunluk / 24, 1) + ' kW' : '—';
      return `<tr class="border-t border-slate-800/70"><td class="px-3 py-2 text-slate-100">${esc(bolumAdi(s))} <span class="text-slate-500">${esc(s.enerji)}</span></td>
        <td class="px-3 py-2 text-right font-mono">${tr(r.toplam)}</td>
        <td class="px-3 py-2 text-right font-mono">${tr(r.gunluk)} <span class="text-slate-500">${b}/gün</span></td><td class="px-3 py-2 text-right font-mono hidden sm:table-cell">${kw}</td>
        <td class="px-3 py-2 text-right font-mono">${yuzde(r.pay)}</td>
        <td class="px-3 py-2 text-right font-mono text-slate-400 hidden md:table-cell">${r.A ? tr(r.A.gunluk) : '—'}</td><td class="px-3 py-2 text-right font-mono text-slate-400 hidden md:table-cell">${r.bGunluk != null ? tr(r.bGunluk) : '—'}</td>
        <td class="px-3 py-2"><span class="inline-flex items-center gap-1.5 text-[11px] text-slate-300"><span class="w-2 h-2 rounded-full" style="background:${guvenRenk[r.guven] || '#94a3b8'}"></span>${r.A ? 'R² ' + tr(r.A.r2, 2) + ', ' : ''}${esc(r.guven)}</span></td></tr>`;
    };
    const kartSeri = (x, i) => `<div class="glass-card rounded-lg p-4"><div class="flex flex-wrap items-baseline justify-between gap-2 mb-1"><h3 class="text-sm font-semibold text-white">${esc(bolumAdi(x.s))} ${esc(x.s.enerji.toLowerCase())}</h3>
        <span class="text-[11px] text-slate-400">Baz ${tr(x.r.gunluk)} ${birim(x.s)}/gün, tüketimde pay ${yuzde(x.r.pay)} (${x.r.yontem === 'A' ? 'regresyon' : 'en düşük 3 ay'})</span></div>
        <div class="h-56"><canvas id="chBaz${i}"></canvas></div>
        <p class="mt-2 text-[11px] text-slate-500">${Object.keys(x.r.B).sort().map((y) => `${y}: ${tr(x.r.B[y])}`).join(' • ')} ${birim(x.s)}/gün (takvim yılı bazında en düşük 3 ayın günlük ortalaması; en az 9 ay verisi olan yıllar)</p></div>`;

    el.innerHTML = `<div class="space-y-4">
      <p class="text-xs text-slate-400">Baz yük, hava (HDD/CDD) ve etkinlik değişkenlerinden bağımsız taban tüketimdir: ısıtma ve soğutma sıfırken bile süren sürekli yükler (aydınlatma, pompalar, bekleme, sıcak su, mutfak). ${yil} yılının ${esc(AY[Math.max(...liste.map((x) => x.r.ay[x.r.ay.length - 1].a))])} ayına kadar olan veriyle ve önceki yılların aylarıyla hesaplanır.</p>
      <section class="olcum-seridi grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        ${kart('Elektrik baz yükü', elek.length ? `${tr(elekKw, 1)} <span class="text-sm font-medium text-slate-400">kW</span>` : '—', elek.length ? `Tüketimde pay ${yuzde(elekPay)} • sürekli çekilen güç` : 'Elektrik serisi yok')}
        ${kart('Doğalgaz baz yükü', gaz.length ? `${tr(gazGun)} <span class="text-sm font-medium text-slate-400">Sm³/gün</span>` : '—', gaz.length ? `Tüketimde pay ${yuzde(gazPay)} • ısıtma dışı kullanım` : 'Doğalgaz serisi yok')}
        ${kart('Elektrik baz yükü, geçen yıla göre', `<span class="${renkDeg(elekDeg)}">${elekDeg == null ? '—' : (elekDeg >= 0 ? '+' : '') + tr(elekDeg * 100, 1) + '%'}</span>`, 'Son 12 ayın en düşük 3 ayı; artış, boşa çalışan yük işareti olabilir')}
        ${kart('Baz yük, yıllık enerji', `${tr(tep, 1)} <span class="text-sm font-medium text-slate-400">TEP</span>`, 'Yıllığa ölçeklenmiş; elektrik ve doğalgaz toplamı')}
      </section>
      <div class="glass-card rounded-lg overflow-hidden"><div class="overflow-x-auto"><table class="w-full text-xs">
        <thead class="text-[11px] text-slate-400"><tr><th class="px-3 py-2 text-left">Seri</th><th class="px-3 text-right">${yil} tüketim</th><th class="px-3 text-right">Baz yük (önerilen)</th><th class="px-3 text-right hidden sm:table-cell">Baz güç</th><th class="px-3 text-right">Baz payı</th><th class="px-3 text-right hidden md:table-cell">Regresyon /gün</th><th class="px-3 text-right hidden md:table-cell">En düşük 3 ay /gün</th><th class="px-3 text-left">Güven</th></tr></thead>
        <tbody>${liste.map(satir).join('')}</tbody></table></div>
        <p class="p-3 text-[11px] text-slate-500">Önerilen değer: regresyonun R²'si 0,5 ve üzerindeyse regresyon, değilse ya da seride HDD/CDD değişkeni yoksa en düşük 3 ay. İki yöntemin yakın çıkması sonucu güçlendirir; çok ayrışıyorsa seri için EnB modeli (EnB, SEU ve M&V sekmesi) gözden geçirilmelidir.</p></div>
      <section class="grid grid-cols-1 lg:grid-cols-2 gap-4">${liste.map(kartSeri).join('')}</section>
      <details class="glass-card rounded-lg p-4 text-xs text-slate-400"><summary class="cursor-pointer text-slate-200 font-semibold">Yöntem ve sınırlar</summary>
        <div class="mt-2 space-y-1.5"><p>Yöntem A: tüketim = baz × ay günü + b × HDD + c × CDD. Baz, hava sıfırken kalan günlük tüketimdir; katsayısı negatif çıkan değişken modelden atılır. Etkinlik değişkenleri (yemek, kişi sayısı) sıfıra çekilemeyeceği için dahil edilmez.</p>
        <p>Yöntem B: son 12 ayın günlük ortalaması en düşük üç ayının ortalaması. Havaya duyarlı değişkeni olmayan seriler için tek yöntemdir.</p>
        <p>Aylık veri gece ve hafta sonu ayrımı veremez; gerçek baz güç, gece saatlerinin en düşük gücü olarak analizör verisinden (ISO → Ölçüm) doğrulanmalıdır. Analizörler devreye girince bu sekme 15 dakikalık veriyle güncellenebilir.</p></div></details></div>`;

    const koyu = typeof koyuMu === 'function' && koyuMu(), baz = typeof TV === 'function' ? TV() : '#211950', hava = koyu ? '#6f86a8' : '#9db4d1';
    liste.forEach((x, i) => {
      const c = document.getElementById('chBaz' + i); if (!c || !window.Chart) return;
      const bazAy = new Array(12).fill(null), degAy = new Array(12).fill(null);
      x.r.ay.forEach((p) => { const b = Math.min(p.v, x.r.gunluk * p.gun); bazAy[p.a] = Math.round(b); degAy[p.a] = Math.round(p.v - b); });
      grafik[i] = new Chart(c, { type: 'bar', data: { labels: AY, datasets: [
        { label: 'Baz yük', data: bazAy, backgroundColor: baz, borderRadius: 2, stack: 's' },
        { label: 'Havaya ve etkinliğe bağlı', data: degAy, backgroundColor: hava, borderRadius: 2, stack: 's' }] },
        options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } }, tooltip: { callbacks: { label: (t) => `${t.dataset.label}: ${tr(t.parsed.y)} ${birim(x.s)}` } } },
          scales: { x: { stacked: true }, y: { stacked: true, ticks: { callback: (v) => (v / 1000).toLocaleString('tr-TR') + ' bin' } } } } });
    });
  }

  window.Baz = { panel, hesapla, ols };
})();
