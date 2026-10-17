"""
Huawei FusionSolar toplayıcısı.

İki yol (sırayla denenir):
  1) Northbound API (resmi) — HUAWEI_NB_BASE, HUAWEI_NB_USER, HUAWEI_NB_CODE tanımlıysa.
  2) Tarayıcı (Playwright) — HUAWEI_USER, HUAWEI_PASS tanımlıysa. Portala normal kullanıcı gibi girer,
     portalın kendi JSON yanıtlarından santral listesini okur.

DEPO PUBLIC: Bu dosya ham yanıtları/ekran görüntülerini KAYDETMEZ. Günlüğe yalnızca alan adları
(değer değil) ve istek yolları yazılır; böylece Actions günlüğü kimseye veri sızdırmaz.
"""
import os
import re
import time
from urllib.parse import urlparse

import requests

TIMEOUT = 30
BASE = (os.getenv("HUAWEI_URL") or "https://eu5.fusionsolar.huawei.com").rstrip("/")

# Portal sağlık kodu -> panel durumu (1 bağlantı kesik, 2 arızalı, 3 sağlıklı)
SAGLIK = {1: "Haberleşme Yok", 2: "Arızalı", 3: "Çalışıyor"}

NAME_KEYS = ("stationName", "plantName", "name", "stationname")
ID_KEYS = ("stationDn", "plantCode", "stationCode", "dn", "id")
POWER_KEYS = ("activePower", "currentPower", "realTimePower", "power", "pvPower")  # genelde kW
DAY_KEYS = ("dailyEnergy", "dayPower", "eDay", "dailyYield", "day_power")
CAP_KEYS = ("installedCapacity", "capacity", "peakPower")
STATE_KEYS = ("healthState", "plantStatus", "stationStatus", "status", "real_health_state")


def _sayi(x):
    try:
        return round(float(str(x).replace(",", ".")), 2)
    except (TypeError, ValueError):
        return None


def _ilk(d, keys):
    for k in keys:
        if k in d and d[k] not in (None, "", "--"):
            return d[k]
    return None


def _durum(raw):
    s = str(raw).strip().lower()
    if s in ("3", "healthy", "normal", "connected"):
        return "Çalışıyor"
    if s in ("2", "faulty", "fault", "alarm"):
        return "Arızalı"
    if s in ("1", "disconnected", "offline", "inactive"):
        return "Haberleşme Yok"
    return "Kontrol Edilmedi"


def _bul(o, out):
    """Yanıt ağacında 'santrale benzeyen' (ad + güç/durum/üretim) sözlükleri toplar."""
    if isinstance(o, dict):
        if _ilk(o, NAME_KEYS) and any(_ilk(o, k) is not None for k in (POWER_KEYS, STATE_KEYS, DAY_KEYS)):
            out.append(o)
        for v in o.values():
            _bul(v, out)
    elif isinstance(o, list):
        for v in o:
            _bul(v, out)


def _satirlari_cevir(bulunan):
    sonuc, gorulen = [], set()
    for d in bulunan:
        ad = str(_ilk(d, NAME_KEYS))
        sid = str(_ilk(d, ID_KEYS) or ad)
        if sid in gorulen:
            continue
        gorulen.add(sid)
        st = _ilk(d, STATE_KEYS)
        sonuc.append({
            "kaynak": "Huawei",
            "kaynakId": sid,
            "ad": ad,
            "kapasite_kwp": _sayi(_ilk(d, CAP_KEYS)),
            "durum": _durum(st) if st is not None else "Kontrol Edilmedi",
            "anlik_kw": _sayi(_ilk(d, POWER_KEYS)),
            "bugun_kwh": _sayi(_ilk(d, DAY_KEYS)),
            "invertorler": [],
        })
    return sonuc


def _yapi(o, derinlik=0):
    """Değersiz yapı özeti (günlük için): yalnızca alan adları."""
    if derinlik > 4:
        return "…"
    if isinstance(o, dict):
        return {k: _yapi(v, derinlik + 1) for k, v in list(o.items())[:25]}
    if isinstance(o, list):
        return [_yapi(o[0], derinlik + 1)] if o else []
    return type(o).__name__


# ----------------------------------------------------------------------
# 1) NORTHBOUND (resmi API)
# ----------------------------------------------------------------------
def _northbound():
    base = os.environ["HUAWEI_NB_BASE"].rstrip("/")
    s = requests.Session()
    r = s.post(f"{base}/login", json={"userName": os.environ["HUAWEI_NB_USER"],
                                       "systemCode": os.environ["HUAWEI_NB_CODE"]}, timeout=TIMEOUT)
    r.raise_for_status()
    token = s.cookies.get("XSRF-TOKEN") or r.headers.get("xsrf-token")
    if not r.json().get("success") or not token:
        raise RuntimeError("Huawei Northbound girişi başarısız")
    s.headers["XSRF-TOKEN"] = token

    def post(yol, govde):
        j = s.post(f"{base}/{yol}", json=govde, timeout=TIMEOUT).json()
        if not j.get("success"):
            if j.get("failCode") == 407:
                raise RuntimeError("Huawei istek sınırı aşıldı (407); çalışma aralığını uzatın")
            raise RuntimeError(f"Huawei API hatası {j.get('failCode')}")
        return j

    liste = post("getStationList", {"pageNo": 1}).get("data", {}).get("list", [])
    kod = lambda x: x.get("plantCode") or x.get("stationCode")
    ad = {kod(x): (x.get("plantName") or x.get("stationName")) for x in liste}
    kap = {kod(x): x.get("capacity") for x in liste}
    sonuc = []
    kodlar = [kod(x) for x in liste]
    for i in range(0, len(kodlar), 100):
        for k in post("getStationRealKpi", {"stationCodes": ",".join(kodlar[i:i + 100])}).get("data", []):
            m, c = k.get("dataItemMap", {}), k.get("stationCode")
            sonuc.append({
                "kaynak": "Huawei", "kaynakId": c, "ad": ad.get(c) or c,
                "kapasite_kwp": _sayi(kap.get(c)),
                "durum": SAGLIK.get(m.get("real_health_state"), "Kontrol Edilmedi"),
                "anlik_kw": None, "bugun_kwh": _sayi(m.get("day_power")), "invertorler": [],
            })
    return sonuc


# ----------------------------------------------------------------------
# 2) TARAYICI (Playwright)
# ----------------------------------------------------------------------
def _tarayici():
    from playwright.sync_api import sync_playwright

    user, pwd = os.environ["HUAWEI_USER"], os.environ["HUAWEI_PASS"]
    yanitlar = []

    def yakala(r):
        try:
            if r.status == 200 and "json" in (r.headers.get("content-type") or ""):
                yanitlar.append((urlparse(r.url).path, r.json()))
        except Exception:
            pass

    with sync_playwright() as p:
        tarayici = p.chromium.launch(headless=True)
        try:
            ctx = tarayici.new_context(locale="tr-TR", viewport={"width": 1400, "height": 900})
            sayfa = ctx.new_page()
            sayfa.on("response", yakala)
            sayfa.goto(BASE + "/", wait_until="domcontentloaded", timeout=60000)

            sayfa.wait_for_selector("input[type=password]", state="visible", timeout=45000)
            kutu = sayfa.locator("input[type=text]:visible, input:not([type]):visible").first
            kutu.fill(user)
            sayfa.locator("input[type=password]:visible").first.fill(pwd)
            dugme = sayfa.locator("#btn_submit, button[type=submit], .loginBtn").first
            if dugme.count() > 0:
                dugme.click()
            else:
                sayfa.keyboard.press("Enter")

            # Giriş başarılıysa şifre kutusu kaybolur
            try:
                sayfa.wait_for_selector("input[type=password]", state="detached", timeout=40000)
            except Exception:
                raise RuntimeError("Huawei girişi tamamlanamadı (şifre yanlış ya da doğrulama kodu/ek adım isteniyor)")

            sayfa.wait_for_load_state("networkidle", timeout=30000)
            sayfa.wait_for_timeout(8000)  # santral listesi XHR ile gelir
        finally:
            tarayici.close()

    bulunan = []
    for yol, j in yanitlar:
        onceki = len(bulunan)
        _bul(j, bulunan)
        if len(bulunan) > onceki:
            print(f"Huawei: santral verisi şu yolda bulundu: {re.sub(r'[0-9a-f]{8,}', '…', yol)}")
            print("Huawei: alan yapısı:", _yapi(j))
    if not bulunan:
        yollar = sorted({re.sub(r'[0-9a-f]{8,}', '…', y) for y, _ in yanitlar})
        print("Huawei: yakalanan JSON yolları:", yollar[:40])
        raise RuntimeError("Huawei: giriş yapıldı ama santral verisi bulunamadı (günlükteki yol listesine bakın)")
    return _satirlari_cevir(bulunan)


# ----------------------------------------------------------------------
def huawei():
    """None döndürürse (hiç ayar yok) toplayıcı bu portalı atlar."""
    if os.getenv("HUAWEI_NB_BASE") and os.getenv("HUAWEI_NB_USER") and os.getenv("HUAWEI_NB_CODE"):
        veri = _northbound()
    elif os.getenv("HUAWEI_USER") and os.getenv("HUAWEI_PASS"):
        veri = _tarayici()
    else:
        return None
    print(f"Huawei: {len(veri)} santral bulundu")
    return veri
