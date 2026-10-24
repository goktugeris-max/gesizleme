// FusionSolar'a Playwright ile giris yapar, fusionsolar_collect.js'i oturum icinde calistirir,
// sonucu temizleyip data/huawei.json ve data/huawei-gunluk.csv'ye yazar.
// Kimlik bilgileri: FS_USER / FS_PASS ortam degiskenleri (GitHub Secrets).
// GECICI COZUM: Northbound API hesabi gelince bu betik kaldirilacak.

import { chromium } from 'playwright';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BASE = process.env.FS_BASE || 'https://intl.fusionsolar.huawei.com';
const USER = process.env.FS_USER;
const PASS = process.env.FS_PASS;
const OUT_JSON = path.join(ROOT, 'data', 'huawei.json');
const OUT_CSV = path.join(ROOT, 'data', 'huawei-gunluk.csv');
const ELLE = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch';
const ARDISIK_LIMIT = 3; // art arda bu kadar hatadan sonra otomatik denemeler durur (hesap kilitlenmesin); elle calistirma yeniden dener

if (!USER || !PASS) {
  console.error('FS_USER / FS_PASS tanimli degil (GitHub > Settings > Secrets and variables > Actions).');
  process.exit(1);
}

// Devre kesici: art arda hata varsa FusionSolar'a tekrar tekrar yanlis giris denemeyelim.
if (fs.existsSync(OUT_JSON) && !ELLE) {
  try {
    const eski = JSON.parse(fs.readFileSync(OUT_JSON, 'utf8'));
    if ((eski.lastError?.ardisik || 0) >= ARDISIK_LIMIT) {
      console.log(`Devre kesici: ${eski.lastError.ardisik} art arda hata (${eski.lastError.message}). Otomatik deneme durdu; Actions'tan elle calistirinca yeniden denenir.`);
      process.exit(0);
    }
  } catch {}
}

const collectSrc = fs.readFileSync(path.join(__dirname, 'fusionsolar_collect.js'), 'utf8');
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'tesis_ayarlari.json'), 'utf8'));

async function login(page) {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#username', { timeout: 60000 });
  await page.fill('#username', USER);
  await page.fill('#password', PASS);
  await page.click('#login-button');

  // Basari: portal sayfasina yonlenme. Basarisizlik: dogrulama kodu ya da hata mesaji.
  const result = await Promise.race([
    page.waitForURL(/\/uniportal\/pvmswebsite\/assets\/build\/cloud\.html/, { timeout: 60000 }).then(() => 'ok'),
    page.waitForSelector('#verification:visible', { timeout: 60000 }).then(() => 'captcha'),
  ]).catch(() => 'timeout');

  if (result === 'captcha') {
    throw new Error('FusionSolar dogrulama kodu (captcha) istiyor. Tarayicidan bir kez elle giris yapin; ' +
      'sorun surerse calisma sikligini azaltin.');
  }
  if (result !== 'ok') {
    // Bazi hesaplarda once sozlesme/gizlilik onayi cikabilir; bunu otomatik ONAYLAMIYORUZ.
    throw new Error(`Giris tamamlanamadi (${result}). Son URL: ${page.url().split('?')[0]}`);
  }
  // Oturum gercekten acik mi?
  const alive = await page.evaluate(async () => {
    const r = await fetch('/rest/dpcloud/auth/v1/keep-alive');
    const j = await r.json().catch(() => null);
    return !!(j && j.payload);
  });
  if (!alive) throw new Error('Giris sonrasi oturum dogrulanamadi.');
}

const sha = (x) => 'sha256:' + crypto.createHash('sha256').update(String(x)).digest('hex');
// Ayarda tanimli olmayan ama hassas gorunen tesis adlari yine de gizlenir (kural disi yeni tesis sizmasin)
const HASSAS = /sığınma|siginma|konukevi|kadın konuk|kadin konuk|sığınak/i;

function sanitize(raw) {
  const def = cfg.varsayilan || {};
  const round = (v, d) => (v == null ? null : Number(v.toFixed(d)));
  const stations = raw.stations.map((s) => {
    const c = (cfg.tesisler || {})[s.name] || (cfg.tesisler || {})[sha(s.name)] || {};
    const hassas = !c.displayName && HASSAS.test(s.name);
    const hideLoc = !!c.hideLocation || hassas;
    const kWp = c.kWp ?? s.installedCapacity_kWp ?? null;
    return {
      id: String(s.dn || '').replace(/\D/g, '').slice(-6) || null, // kisaltilmis kimlik
      name: c.displayName || (hassas ? 'Gizli tesis ' + (String(s.dn || '').replace(/\D/g, '').slice(-4) || '') : s.name),
      status: s.status,
      gridConnectedDate: s.gridConnectedDate,
      lat: hideLoc ? null : round(s.lat, def.coordDecimals ?? 3),
      lon: hideLoc ? null : round(s.lon, def.coordDecimals ?? 3),
      address: hideLoc || def.hideAddress ? null : s.address,
      kWp,
      ratedAC_kW: s.ratedAC_kW,
      currentPower_kW: s.currentPower_kW,
      dailyEnergy_kWh: s.dailyEnergy_kWh,
      monthEnergy_kWh: s.monthEnergy_kWh,
      yearEnergy_kWh: s.yearEnergy_kWh,
      cumulativeEnergy_kWh: s.cumulativeEnergy_kWh,
      specificYieldToday_kWh_kWp: kWp ? round(s.dailyEnergy_kWh / kWp, 2) : null,
      curve: s.curve,
      inverters: (s.inverters || []).map(({ dn, ...inv }) => inv), // cihaz DN'lerini yayimlama
      errors: [s.curveError, s.deviceError].filter(Boolean),
    };
  });
  return {
    source: raw.source,
    fetchedAt: raw.fetchedAt,
    timeZone: raw.timeZone,
    portfolio: raw.portfolio,
    stationCount: stations.length,
    stations,
  };
}

function upsertDailyCsv(data) {
  // Tarih + tesis bazinda gunun son degerini tutar (5 dk gecmis portalda ~1 yil saklaniyor; bu kalici ozet).
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: data.timeZone || 'Europe/Istanbul' });
  const header = 'tarih,tesis,gunluk_kWh,toplam_kWh,son_guncelleme';
  let rows = [];
  if (fs.existsSync(OUT_CSV)) rows = fs.readFileSync(OUT_CSV, 'utf8').trim().split('\n').slice(1).filter(Boolean);
  const key = (r) => r.split(',').slice(0, 2).join(',');
  const map = new Map(rows.map((r) => [key(r), r]));
  for (const s of data.stations) {
    const name = `"${String(s.name).replace(/"/g, "'")}"`;
    map.set(`${today},${name}`, [today, name, s.dailyEnergy_kWh ?? '', s.cumulativeEnergy_kWh ?? '', data.fetchedAt].join(','));
  }
  fs.writeFileSync(OUT_CSV, [header, ...[...map.values()].sort()].join('\n') + '\n');
}

const browser = await chromium.launch();
const context = await browser.newContext({ locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
const page = await context.newPage();
try {
  await login(page);
  const raw = await page.evaluate(`(${collectSrc})({ timeZone: 3, timeZoneStr: 'Europe/Istanbul' })`);
  if (!raw || !raw.stations || raw.stations.length === 0) throw new Error('Tesis listesi bos geldi.');
  const data = sanitize(raw);
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(data, null, 1));
  upsertDailyCsv(data);
  console.log(`OK: ${data.stationCount} tesis, anlik ${data.portfolio.currentPower_kW} kW, bugun ${data.portfolio.dailyEnergy_kWh} kWh`);
} catch (e) {
  console.error('HATA:', e.message);
  // Pano eski veriyi gostermeye devam eder; sadece hata durumunu isaretle.
  if (fs.existsSync(OUT_JSON)) {
    const old = JSON.parse(fs.readFileSync(OUT_JSON, 'utf8'));
    old.lastError = { at: new Date().toISOString(), message: e.message, ardisik: (old.lastError?.ardisik || 0) + 1 };
    fs.writeFileSync(OUT_JSON, JSON.stringify(old, null, 1));
  }
  process.exitCode = 1;
} finally {
  await browser.close();
}
