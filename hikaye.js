/* Özet sayfası açılışı: "Eski Akıl, Yeni Enerji" — İzmir'in iklim ekseni (eski çözümler → bugünün çözümleri) */
(function () {
  const ESKI = [
    { z: 'ESKİ · 1867', b: 'Havagazı Fabrikası', m: 'Kömürden gaz üretti, kente ilk sokak ışıklarını getirdi. Bugün bir kültür merkezi.' },
    { z: 'ESKİ · 1890–1907', b: 'Asansör ve atlı tramvay', m: "Su gücüyle çalışan hidrolik asansör; Kordon'da atlı tramvay." },
    { z: 'ESKİ · YÜZYILLARDIR', b: 'İmbat', m: 'Rüzgâra açılan sokaklar, avlular, cumbalar ve taş duvarlı hanlar evleri serinletti.' },
    { z: 'ESKİ · ANTİK ÇAĞ', b: 'Su yolları ve sarnıçlar', m: 'Kent suyunu taşıdı, biriktirdi ve korudu.' },
    { z: 'ESKİ · ANTİK SMYRNA', b: 'Smyrna Agorası', m: 'Halkın toplanıp kararları konuştuğu meydan.' },
    { z: 'ESKİ · MÖ 4. YÜZYIL', b: 'Bergama Asklepionu', m: 'Su, güneş, bitki, beslenme ve müzikle şifa. Galenos burada yetişti.' },
  ];
  const DERS = [
    ['Enerji', 'Kentin enerjisi değişebilir'], ['Hareket', 'Temiz ulaşım yeni değil'],
    ['Rüzgâr ve Serinlik', 'Rüzgârla ve doğayla tasarlamak'], ['Su', 'Her damla kıymetli'],
    ['Söz Hakkı', 'Kararı birlikte almak'], ['Tek Sağlık', 'İnsan, hayvan, doğa birlikte'],
  ];
  const YENI = [
    { b: 'Güneş çatılarda', m: 'MeskenGES ile 30 ilçede tek başvuru süreci; GCC-SYNERGY ile dijital izleme.' },
    { b: 'Elektrikli ulaşım', m: '33,6 km tramvay; 89 elektrikli hizmet aracıyla %63 daha az emisyon.' },
    { b: 'Doğal serinlik', m: 'CRIZ-ERS sıcak hava risk haritası; MNKM yeşil çatısı gibi doğa temelli çözümler.' },
    { b: 'Her damla yeniden', m: "RESWATER gri su, NERS yağmur suyu parkı; 2025'te belediyede %39 su tasarrufu." },
    { b: 'Yurttaş Meclisi', m: "Kurayla seçilen 50 yurttaş; iklim planına giren 30 öneri." },
    { b: 'Eşrefpaşa ve Tek Sağlık', m: "İlk belediye hastanesi; bakım tesislerinde mikroşebeke; Seyrek'te 385 kW GES." },
  ];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const oku = () => {   // seçim yoksa telefonda kapalı başlar (modül kartları yukarıda kalsın)
    try { const v = localStorage.getItem('hk_kapali'); if (v !== null) return v === '1'; } catch (e) { /* yok say */ }
    return !!(window.matchMedia && matchMedia('(max-width: 639px)').matches);
  };
  const yaz = (v) => { try { localStorage.setItem('hk_kapali', v ? '1' : '0'); } catch (e) { /* yok say */ } };

  function sutun(i) {
    const e = ESKI[i], d = DERS[i], y = YENI[i];
    return `<div class="hk-col" style="--i:${i}">
      <article class="hk-eski hk-rev"><div class="hk-z">${esc(e.z)}</div><h4>${esc(e.b)}</h4><p>${esc(e.m)}</p></article>
      <div class="hk-ders hk-rev"><b>${esc(d[0])}</b><span>${esc(d[1])}</span></div>
      <article class="hk-yeni hk-rev"><div class="hk-z">YENİ · BUGÜN</div><h4>${esc(y.b)}</h4><p>${esc(y.m)}</p></article>
    </div>`;
  }

  function ciz() {
    const kap = document.getElementById('hikaye');
    if (!kap) return;
    const kapali = oku();
    const dalga = (() => {   // 6 periyotluk sinüs: tepeler (eski) sütunun sol çeyreğinde, çukurlar (yeni) sağ çeyreğinde
      let p = '';
      for (let x = 0; x <= 600; x += 5) {
        const y = 70 - 52 * Math.sin(((x / 100) - 0.5 + 0.0) * 2 * Math.PI + Math.PI);
        p += (x ? 'L' : 'M') + x + ' ' + y.toFixed(1);
      }
      return p;
    })();
    kap.innerHTML = `
    <div class="hk-hero">
      <div class="hk-ust">
        <div>
          <div class="hk-etiket">İZMİR'İN İKLİM EKSENİ · İZMİR'S CLIMATE AXIS</div>
          <h2>Eski Akıl, Yeni Enerji</h2>
          <div class="hk-alt">Ancient Wisdom, New Energy</div>
        </div>
        <p class="hk-giris">İzmir 8.500 yıldır bu iklimde yaşıyor. Kentin dünkü çözümleri, bugünün iklim çözümleriyle altı noktada buluşuyor.</p>
      </div>
      <div class="hk-eylem">
        <a href="#genel" class="hk-btn hk-btn1">Panele geç <span>→</span></a>
        <button type="button" id="hkAc" class="hk-btn">${kapali ? 'Hikâyeyi aç' : 'Hikâyeyi daralt'}</button>
        <button type="button" id="hkPoster" class="hk-btn">Posteri görüntüle</button>
        <span class="hk-lej"><i class="e"></i>Eski · Old <i class="y"></i>Yeni · New <i class="o"></i>Ortak ders · Lesson</span>
      </div>
      <div id="hkGovde" class="${kapali ? 'hidden' : ''}">
        <div class="hk-bas">
          <div class="hk-kutu"><small>BAŞLANGIÇ</small><b>MÖ ~6500</b><span>Yeşilova Höyüğü</span><em>8.500 yıllık ilk İzmir · 8,500 years of İzmir</em></div>
          <div class="hk-kutu hk-son"><small>2100 SENARYOLARI</small><b>2100</b><span>+2–5 °C sıcaklık · 1,7 m'ye kadar deniz suyu · %40'a kadar aşırı yağış</span><em>Kaynak: CRIZ-ERS</em></div>
        </div>
        <div class="hk-zaman">
          <div class="hk-dalga" aria-hidden="true">
            <svg viewBox="0 0 600 140" preserveAspectRatio="none"><path d="${dalga}" fill="none" stroke="#e9cf94" stroke-width="3" vector-effect="non-scaling-stroke" stroke-linecap="round"/></svg>
            ${[0, 1, 2, 3, 4, 5].map((k) => `<i class="hk-nokta e" style="left:${((k + 0.25) / 6 * 100).toFixed(2)}%"></i><i class="hk-nokta y" style="left:${((k + 0.75) / 6 * 100).toFixed(2)}%"></i>`).join('')}
          </div>
          ${[0, 1, 2, 3, 4, 5].map(sutun).join('')}
        </div>
        <p class="hk-kaynak">İzmir Büyükşehir Belediyesi · İklim Değişikliği ve Temiz Enerji Şube Müdürlüğü · Veriler: İzBB 2025, CRIZ-ERS, APİKAM</p>
      </div>
    </div>
    <div id="hkLb" class="hk-lb hidden" role="dialog" aria-label="Poster"><button type="button" aria-label="Kapat">×</button><img src="eski-akil-yeni-enerji.jpg" alt="Eski Akıl, Yeni Enerji — İzmir'in iklim ekseni" loading="lazy"></div>`;

    document.getElementById('hkAc').onclick = () => {
      const g = document.getElementById('hkGovde'), gizle = !g.classList.contains('hidden');
      g.classList.toggle('hidden', gizle); yaz(gizle);
      document.getElementById('hkAc').textContent = gizle ? 'Hikâyeyi aç' : 'Hikâyeyi daralt';
      if (!gizle) gozle();
    };
    const lb = document.getElementById('hkLb');
    document.getElementById('hkPoster').onclick = () => lb.classList.remove('hidden');
    lb.onclick = () => lb.classList.add('hidden');
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') lb.classList.add('hidden'); });
    gozle();
  }

  // Sütunlar görününce sırayla belirir (hareket azaltma tercihi açıksa doğrudan görünür)
  function gozle() {
    const ogeler = document.querySelectorAll('#hikaye .hk-rev:not(.hk-var)');
    const azalt = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (azalt || !('IntersectionObserver' in window)) { ogeler.forEach((o) => o.classList.add('hk-var')); return; }
    const g = new IntersectionObserver((l) => l.forEach((x) => { if (x.isIntersecting) { x.target.classList.add('hk-var'); g.unobserve(x.target); } }), { threshold: 0.15 });
    ogeler.forEach((o) => g.observe(o));
  }

  ciz();
})();
