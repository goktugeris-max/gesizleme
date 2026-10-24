// FusionSolar web portali icinde (giris yapilmis oturumda) calisir.
// Playwright bunu page.evaluate() ile cagirir; ayni kod tarayici konsolunda da test edilebilir.
// Yalnizca OKUMA yapar. Northbound API gelene kadar gecici cozumdur.
async (opts) => {
  opts = opts || {};
  const TZ = opts.timeZone ?? 3;
  const TZ_STR = opts.timeZoneStr || 'Europe/Istanbul';
  const WITH_CURVE = opts.withCurve !== false;
  const WITH_DEVICES = opts.withDevices !== false;
  const NO_DATA = 1e300; // FusionSolar "veri yok" icin 1.797e308 doner

  const ka = await fetch('/rest/dpcloud/auth/v1/keep-alive').then(r => r.json());
  if (!ka || !ka.payload) throw new Error('Oturum yok (keep-alive payload bos) - giris basarisiz olabilir');
  // DIKKAT: GET isteklerinde Content-Type gonderilirse device-list bos doner. Sadece POST'ta ekle.
  const H = { 'roarand': ka.payload };
  const HP = { 'Content-Type': 'application/json', 'roarand': ka.payload };

  const getJ = async (url) => {
    const r = await fetch(url + (url.includes('?') ? '&' : '?') + '_=' + Date.now(), { headers: H });
    if (!r.ok) throw new Error(`${r.status} ${url.split('?')[0]}`);
    return r.json();
  };
  const num = (v) => {
    if (v === null || v === undefined || v === '--' || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && Math.abs(n) < NO_DATA ? n : null;
  };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // 1) Portfoy toplami
  const kpiRes = await getJ(`/rest/pvms/web/station/v1/station/total-real-kpi?queryTime=${Date.now()}&timeZone=${TZ}`);
  const k = kpiRes.data || {};
  const portfolio = {
    currentPower_kW: num(k.currentPower),
    dailyEnergy_kWh: num(k.dailyEnergy),
    cumulativeEnergy_kWh: num(k.cumulativeEnergy),
    inverterPower_kW: num(k.inverterPower),
    dailyIncome: num(k.dailyIncome),
  };

  // 2) Tesis listesi (sayfalama)
  const stations = [];
  for (let page = 1; page < 20; page++) {
    const res = await fetch('/rest/pvms/web/station/v1/station/station-list', {
      method: 'POST', headers: HP,
      body: JSON.stringify({ curPage: page, pageSize: 50, gridConnectedTime: '', queryTime: Date.now(),
        timeZone: TZ, sortId: 'createTime', sortDir: 'DESC', locale: 'en_US' })
    }).then(r => r.json());
    const list = (res.data && res.data.list) || [];
    stations.push(...list);
    if (stations.length >= ((res.data && res.data.total) || 0) || list.length === 0) break;
  }

  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const INV_MOC = new Set([20814, 20815, 20816, 20822, 20836, 20847, 38183]);
  const out = [];

  for (const s of stations) {
    const st = {
      dn: s.dn,
      name: s.name,
      status: s.plantStatus,              // connected / disconnected / trouble
      gridConnectedDate: s.gridConnectedTime ? String(s.gridConnectedTime).slice(0, 10) : null,
      lat: num(s.latitude), lon: num(s.longitude),
      address: s.plantAddress || null,
      installedCapacity_kWp: num(s.installedCapacity) || null, // portalda 0 girilmis olabilir
      currentPower_kW: num(s.currentPower),
      dailyEnergy_kWh: num(s.dailyEnergy),
      monthEnergy_kWh: num(s.monthEnergy),
      yearEnergy_kWh: num(s.yearEnergy),
      cumulativeEnergy_kWh: num(s.cumulativeEnergy),
      inverters: [],
      curve: null,
    };

    // 3) Gunluk 5 dk uretim egrisi
    if (WITH_CURVE) {
      try {
        const eb = await getJ(`/rest/pvms/web/station/v1/overview/energy-balance?stationDn=${encodeURIComponent(s.dn)}&timeDim=2&queryTime=${t0.getTime()}&timeZone=${TZ}&timeZoneStr=${encodeURIComponent(TZ_STR)}`);
        const d = eb.data || {};
        const x = d.xAxis || [], y = d.productPower || [];
        // sadece saat:dakika + deger; gece sifirlari ve bos noktalar dahil (grafik icin sabit eksen)
        st.curve = { step_min: 5, t: x.map(v => String(v).slice(11, 16)), kW: y.map(num) };
      } catch (e) { st.curveError = String(e.message || e); }
      await sleep(300);
    }

    // 4) Inverter bazinda canli telemetri
    if (WITH_DEVICES) {
      try {
        const dl = await getJ(`/rest/neteco/web/config/device/v1/device-list?conditionParams.parentDn=${encodeURIComponent(s.dn)}&conditionParams.curPage=1&conditionParams.recordperpage=100`);
        const devs = Array.isArray(dl.data) ? dl.data : ((dl.data && (dl.data.list || dl.data.data)) || []);
        const invs = devs.filter(d => INV_MOC.has(d.mocId) || /inverter|İnverter|逆变器/i.test(d.mocTypeName || ''));
        for (const inv of invs) {
          const rt = await getJ(`/rest/pvms/web/device/v1/device-realtime-data?deviceDn=${encodeURIComponent(inv.dn)}&displayAccessModel=true`);
          const sig = {};
          for (const g of (rt.data || [])) for (const x of (g.signals || [])) sig[x.id] = x.realValue ?? x.value;
          // PV dizileri: 11001 + 3(n-1) gerilim, +1 akim
          const pvIds = []; for (let n = 1; n <= 12; n++) pvIds.push(11001 + 3 * (n - 1), 11002 + 3 * (n - 1));
          const pk = await getJ(`/rest/pvms/web/device/v1/device-real-kpi?deviceDn=${encodeURIComponent(inv.dn)}&${pvIds.map(i => 'signalIds=' + i).join('&')}`);
          const pkd = (pk.data && (pk.data.signals || pk.data)) || {};
          const strings = [];
          for (let n = 1; n <= 12; n++) {
            const v = pkd[11001 + 3 * (n - 1)], a = pkd[11002 + 3 * (n - 1)];
            const V = num(v && (v.realValue ?? v.value ?? v)), A = num(a && (a.realValue ?? a.value ?? a));
            if ((V === null || V === 0) && (A === null || A === 0)) continue; // bos/olmayan giris
            strings.push({ pv: n, V, A });
          }
          st.inverters.push({
            name: inv.name, dn: inv.dn, model: inv.mocTypeName, online: inv.status ?? inv.deviceStatus,
            stateCode: num(sig[10025]),           // 512 = 0x0200 On-grid
            activePower_kW: num(sig[10018]),
            reactivePower_kvar: num(sig[10019]),
            ratedPower_kW: num(sig[10006]),
            powerFactor: num(sig[10020]),
            frequency_Hz: num(sig[10021]),
            Ua_V: num(sig[10011]), Ub_V: num(sig[10012]), Uc_V: num(sig[10013]),
            Ia_A: num(sig[10014]), Ib_A: num(sig[10015]), Ic_A: num(sig[10016]),
            dailyEnergy_kWh: num(sig[10032]),
            totalEnergy_kWh: num(sig[10029]),
            startTime: sig[10027] || null, stopTime: sig[10028] || null,
            strings,
          });
          await sleep(300);
        }
      } catch (e) { st.deviceError = String(e.message || e); }
    }

    // Kurulu guc portalda yoksa inverter nominal guclerinin toplamini AC kapasite olarak ver
    st.ratedAC_kW = st.inverters.reduce((a, i) => a + (i.ratedPower_kW || 0), 0) || null;
    out.push(st);
  }

  return {
    source: 'FusionSolar web (gecici, oturum tabanli)',
    fetchedAt: new Date().toISOString(),
    timeZone: TZ_STR,
    portfolio,
    stationCount: out.length,
    stations: out,
  };
}
