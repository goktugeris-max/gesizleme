"""
GES veri toplayıcı — GitHub Actions üzerinde saatlik çalışır.
Portallardan durum verisini çeker ve data/durum.json dosyasına yazar.
Şifreler kodda DEĞİL, GitHub Secrets'ta durur (ortam değişkeni olarak gelir).
"""
import json
import os
import re
import sys
import traceback
from datetime import datetime, timezone

import requests

OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "durum.json")
TIMEOUT = 30

# Portal durum kodları -> panel durumları
DURUM_ONCELIK = ["Arızalı", "Haberleşme Yok", "Beklemede", "Çalışıyor"]


def en_kotu(durumlar):
    for d in DURUM_ONCELIK:
        if d in durumlar:
            return d
    return "Kontrol Edilmedi"


def sayi(x):
    try:
        return round(float(x), 2)
    except (TypeError, ValueError):
        return None


# ======================================================================
# GOODWE SEMS
# ======================================================================
SEMS_LOGIN = "https://www.semsportal.com/api/v2/Common/CrossLogin"
SEMS_BASE_TOKEN = {"version": "v2.1.0", "client": "ios", "language": "en"}
SEMS_INV_DURUM = {1: "Çalışıyor", 0: "Beklemede", -1: "Haberleşme Yok", 2: "Arızalı"}


class Sems:
    def __init__(self, user, pwd):
        self.user, self.pwd = user, pwd
        self.api = None
        self.token = None
        self.liste = {}  # sid -> santral listesi satırı (detay boşsa yedek)

    def login(self):
        r = requests.post(
            SEMS_LOGIN,
            headers={"Token": json.dumps(SEMS_BASE_TOKEN), "Content-Type": "application/json"},
            json={"account": self.user, "pwd": self.pwd},
            timeout=TIMEOUT,
        )
        r.raise_for_status()
        j = r.json()
        data = j.get("data") or {}
        if not data.get("token"):
            raise RuntimeError(f"GoodWe girişi başarısız: {j.get('msg')}")
        self.api = (j.get("api") or data.get("api") or "https://www.semsportal.com/api/").rstrip("/") + "/"
        self.token = {**SEMS_BASE_TOKEN, "timestamp": data.get("timestamp"),
                      "uid": data.get("uid"), "token": data.get("token")}

    def post(self, path, body=None):
        r = requests.post(
            self.api + path,
            headers={"Token": json.dumps(self.token), "Content-Type": "application/json"},
            json=body or {},
            timeout=TIMEOUT,
        )
        r.raise_for_status()
        return r.json()

    def istasyon_listesi(self):
        """Hesaptaki tüm santrallerin ID'lerini döndürür (iki farklı uç nokta dener)."""
        ids = []
        try:
            j = self.post("v2/PowerStationMonitor/QueryPowerStationMonitor",
                          {"page_index": 1, "page_size": 200})
            d = j.get("data")
            lst = d.get("list") if isinstance(d, dict) else d
            for s in lst or []:
                sid = s.get("powerstation_id") or s.get("id")
                if sid:
                    ids.append(sid)
                    self.liste[sid] = s
        except Exception as e:
            print("Liste uç noktası 1 başarısız:", e)

        if not ids:
            j = self.post("v2/HistoryData/QueryPowerStationByHistory")
            d = j.get("data")
            lst = d.get("list") if isinstance(d, dict) else d
            if isinstance(lst, str):
                lst = [lst]
            for s in lst or []:
                sid = s if isinstance(s, str) else (s.get("id") or s.get("powerstation_id"))
                if sid:
                    ids.append(sid)
        return list(dict.fromkeys(ids))

    def invertor_haritasi(self):
        """sid -> invertör listesi (HistoryData uç noktası bu hesapta invertörleri verir)."""
        if getattr(self, "_inv", None) is None:
            self._inv = {}
            try:
                d = self.post("v2/HistoryData/QueryPowerStationByHistory").get("data") or {}
                for st in d.get("list") or []:
                    if isinstance(st, dict) and st.get("id"):
                        self._inv[st["id"]] = st.get("inverters") or []
            except Exception as e:
                print("GoodWe invertör listesi alınamadı:", str(e)[:120])
        return self._inv

    def detay(self, sid):
        j = self.post("v3/PowerStation/GetPlantDetailByPowerstationId", {"powerStationId": sid})
        d = j.get("data") or {}
        info, kpi = d.get("info") or {}, d.get("kpi") or {}
        if not info:
            satir = self.liste.get(sid)
            if satir:
                # Tanılama: yalnızca alan adları (içerik değil)
                print(f"GoodWe {sid}: detay boş, liste satırı kullanılıyor. alanlar={sorted(satir)}")
                return self.listeden(sid, satir)
            raise RuntimeError(f"GoodWe detay boş döndü: {j.get('msg')}")

        invertorler = []
        for inv in (d.get("inverter") or self.invertor_haritasi().get(sid) or []):
            kod = inv.get("status")
            try:
                kod = int(kod)
            except (TypeError, ValueError):
                pass
            invertorler.append({
                "sn": inv.get("sn"),
                "ad": inv.get("name") or inv.get("sn"),
                "model": inv.get("type") or (inv.get("invert_full") or {}).get("model_type"),
                "durum": SEMS_INV_DURUM.get(kod, "Kontrol Edilmedi"),
                "kod": kod,
            })

        # Santral durumu: bilinen invertör durumlarının en kötüsü; hiç yoksa santralin kendi durumu
        bilinen = [i["durum"] for i in invertorler if i["durum"] != "Kontrol Edilmedi"]
        durum = en_kotu(bilinen) if bilinen else SEMS_INV_DURUM.get(info.get("status"), "Kontrol Edilmedi")
        # Tanılama: yalnızca durum kodları ve sayıları
        print(f"GoodWe {sid[:8]}: santral status={info.get('status')!r} "
              f"invertör kodları={sorted(str(i['kod']) for i in invertorler)} -> {durum}")

        return {
            "kaynak": "GoodWe",
            "kaynakId": sid,
            "ad": info.get("stationname") or sid,
            "kapasite_kwp": sayi(info.get("capacity")),
            "durum": durum,
            "anlik_kw": sayi((sayi(kpi.get("pac")) or 0) / 1000),
            "bugun_kwh": sayi(kpi.get("power")),
            "invertorler": invertorler,
        }


def _ilk(d, *anahtarlar):
    for k in anahtarlar:
        if d.get(k) not in (None, ""):
            return d[k]
    return None


def _listeden(self, sid, satir):
    kod = _ilk(satir, "status", "powerstation_status")
    try:
        kod = int(kod)
    except (TypeError, ValueError):
        pass
    return {
        "kaynak": "GoodWe",
        "kaynakId": sid,
        "ad": _ilk(satir, "stationname", "stationName", "name") or sid,
        "kapasite_kwp": sayi(_ilk(satir, "capacity", "capacity_kw")),
        "durum": SEMS_INV_DURUM.get(kod, "Kontrol Edilmedi"),
        "anlik_kw": sayi((sayi(_ilk(satir, "pac", "current_power")) or 0) / 1000),
        "bugun_kwh": sayi(_ilk(satir, "eday", "day_power", "today_power")),
        "invertorler": [],
    }


Sems.listeden = _listeden


def _sekil(j):
    d = j.get("data") if isinstance(j, dict) else None
    ozet = {"code": j.get("code"), "msg": j.get("msg"), "data_tipi": type(d).__name__}
    if isinstance(d, dict):
        ozet["data_anahtarlari"] = sorted(d)
        for k, v in d.items():
            if isinstance(v, list):
                ozet[f"{k}[{len(v)}]"] = sorted(v[0]) if v and isinstance(v[0], dict) else type(v[0]).__name__ if v else None
            elif isinstance(v, dict):
                ozet[f"{k}{{}}"] = sorted(v)
    elif isinstance(d, list):
        ozet["uzunluk"] = len(d)
        if d:
            ozet["ilk"] = sorted(d[0]) if isinstance(d[0], dict) else type(d[0]).__name__
    return ozet


def goodwe():
    user, pwd = os.getenv("GOODWE_USER"), os.getenv("GOODWE_PASS")
    if not user or not pwd:
        return None  # tanımlı değil, atla
    s = Sems(user, pwd)
    s.login()
    ids = s.istasyon_listesi()
    print(f"GoodWe: {len(ids)} santral bulundu")
    sonuc = []
    for sid in ids:
        try:
            sonuc.append(s.detay(sid))
        except Exception as e:
            print(f"GoodWe {sid} okunamadı: {e}")
    return sonuc


# ======================================================================
# HUAWEI FUSIONSOLAR (normal web girişi, jgriss/FusionSolarPy kütüphanesi, MIT)
# ======================================================================
def _birimli_sayi(x):
    """'12.5 kW' / '1,234.5' / 12.5 -> 12.5"""
    if isinstance(x, (int, float)):
        return round(float(x), 2)
    m = re.search(r"-?\d[\d,]*\.?\d*", str(x or ""))
    return sayi(m.group(0).replace(",", "")) if m else None


def _huawei_durum(deger):
    d = str(deger or "").lower()
    if any(k in d for k in ("disconnect", "offline", "no_comm", "communication")):
        return "Haberleşme Yok"
    if any(k in d for k in ("fault", "unhealth", "error", "alarm")):
        return "Arızalı"
    if "health" in d or "normal" in d or "running" in d:
        return "Çalışıyor"
    return "Kontrol Edilmedi"


def huawei_giris():
    user, pwd = os.getenv("HUAWEI_USER"), os.getenv("HUAWEI_PASS")
    if not user or not pwd:
        return None  # tanımlı değil, atla
    from fusion_solar_py.client import FusionSolarClient

    model = os.getenv("HUAWEI_CAPTCHA_MODEL") or "models/captcha_huawei.onnx"
    # "intl", "intl.", " intl " veya yapıştırılmış tam adres -> "intl"
    sub = re.sub(r"^https?://", "", (os.getenv("HUAWEI_SUBDOMAIN") or "").strip())
    sub = sub.split(".")[0].strip()
    # Ayarlanan adres bu ağdan çözülemezse kütüphanenin AB varsayılanını da dene
    adaylar = list(dict.fromkeys([a for a in (sub, "region01eu5") if a]))
    model = model if os.path.exists(model) else None
    c, son_hata = None, None
    for aday in adaylar:
        try:
            c = FusionSolarClient(user, pwd, huawei_subdomain=aday, captcha_model_path=model)
            sub = aday
            print(f"Huawei: '{aday}' ile giriş yapıldı")
            break
        except requests.exceptions.ConnectionError as e:
            print(f"Huawei: '{aday}' adresine bağlanılamadı: {str(e)[:120]}")
            son_hata = e
    if c is None:
        raise son_hata
    try:
        # Kütüphanenin get_station_list()'i yalnızca 10 kayıt getirir; sayfalayarak hepsini al.
        liste, sayfa = [], 1
        while True:
            r = c._session.post(
                f"https://{sub}.fusionsolar.huawei.com/rest/pvms/web/station/v1/station/station-list",
                json={"curPage": sayfa, "pageSize": 100, "gridConnectedTime": "",
                      "queryTime": c._get_day_start_sec(), "timeZone": 2,
                      "sortId": "createTime", "sortDir": "DESC", "locale": "en_US"})
            r.raise_for_status()
            j = r.json()
            if not j.get("success"):
                raise RuntimeError(f"Huawei santral listesi alınamadı: {str(j)[:150]}")
            veri = (j.get("data") or {}).get("list") or []
            liste += veri
            if len(veri) < 100:
                break
            sayfa += 1
    finally:
        try:
            c.log_out()
        except Exception:
            pass

    print(f"Huawei: {len(liste)} santral bulundu")
    if liste:
        # Tanılama: alan adları ve durum değerleri (santral adı/üretim değeri yazılmaz)
        print("Huawei alanlar:", sorted(liste[0]))
        for k in ("plantStatus", "status", "runState", "healthState"):
            if k in liste[0]:
                print(f"Huawei {k} değerleri:", sorted({str(x.get(k)) for x in liste}))

    sonuc = []
    for st in liste:
        sid = _ilk(st, "dn", "stationDn", "id", "plantId")
        sonuc.append({
            "kaynak": "Huawei",
            "kaynakId": sid,
            "ad": _ilk(st, "name", "stationName", "plantName") or sid,
            "kapasite_kwp": _birimli_sayi(_ilk(st, "capacity", "installedCapacity", "totalCapacity")),
            "durum": _huawei_durum(_ilk(st, "plantStatus", "status", "runState", "healthState")),
            "anlik_kw": _birimli_sayi(_ilk(st, "currentPower", "currentPowerKw", "realTimePower")),
            "bugun_kwh": _birimli_sayi(_ilk(st, "dailyEnergy", "eDay", "dailyYield", "todayEnergy")),
            "invertorler": [],
        })
    return sonuc


def huawei_kiosk(satirlar):
    """Kiosk (herkese açık izleme bağlantısı): giriş/CAPTCHA yok, tek bir GET.

    HUAWEI_KIOSK_URLS Secret'ı: her satır "Santral Adı | https://.../kiosk?kk=ANAHTAR".
    Veri Huawei tarafında ~30 dk önbelleklenir; arıza/invertör bilgisi yoktur.
    """
    import hashlib
    import html as _html
    from urllib.parse import urlparse

    sonuc = []
    for satir in satirlar:
        ad, _, url = satir.rpartition("|")
        ad, url = ad.strip(), url.strip()
        m = re.search(r"[?&]kk=([^&#\s]+)", url)
        if not m:
            print("Huawei kiosk: satırda kk= bulunamadı, atlandı")
            continue
        kk = m.group(1)
        kimlik = hashlib.sha1(kk.encode()).hexdigest()[:10]  # anahtarın kendisi açığa çıkmasın
        host = urlparse(url).netloc
        # Adres bu ağdan çözülemezse (ör. intl) aynı anahtarla AB sunucularını da dene
        aday_hostlar = list(dict.fromkeys([host, "eu5.fusionsolar.huawei.com",
                                           "region01eu5.fusionsolar.huawei.com"]))
        veri, son_hata = None, None
        for h in aday_hostlar:
            try:
                r = requests.get(f"https://{h}/rest/pvms/web/kiosk/v1/station-kiosk-file",
                                 params={"kk": kk}, headers={"accept": "application/json"},
                                 timeout=TIMEOUT)
                j = r.json()
                if not j.get("success"):
                    son_hata = f"{h}: success=false failCode={j.get('failCode')}"
                    print(f"Huawei kiosk {kimlik}: {son_hata}")
                    continue
                veri = json.loads(_html.unescape(j["data"]))
                print(f"Huawei kiosk {kimlik}: '{h}' üzerinden okundu; alanlar={sorted(veri)}")
                break
            except requests.exceptions.ConnectionError as e:
                son_hata = f"{h}: bağlanılamadı ({str(e)[:60]})"
                print(f"Huawei kiosk {kimlik}: {son_hata}")
            except Exception as e:
                son_hata = f"{h}: {str(e)[:80]}"
                print(f"Huawei kiosk {kimlik}: {son_hata}")
        if veri is None:
            raise RuntimeError(f"Huawei kiosk okunamadı ({son_hata})")

        kpi = veri.get("realKpi") or {}
        print(f"Huawei kiosk {kimlik}: realKpi alanları={sorted(kpi)}")
        guc = _birimli_sayi(kpi.get("realTimePower"))
        sonuc.append({
            "kaynak": "Huawei",
            "kaynakId": kimlik,
            "ad": ad or f"Huawei kiosk {kimlik}",
            "kapasite_kwp": None,
            "durum": "Çalışıyor" if (guc or 0) > 0 else "Beklemede",
            "anlik_kw": guc,
            "bugun_kwh": _birimli_sayi(kpi.get("dailyEnergy")),
            "invertorler": [],
        })
    return sonuc


def huawei():
    satirlar = [l.strip() for l in (os.getenv("HUAWEI_KIOSK_URLS") or "").splitlines() if l.strip()]
    if satirlar:
        return huawei_kiosk(satirlar)
    return huawei_giris()  # kiosk tanımlı değilse (ve giriş bilgisi varsa) web girişi


# ======================================================================
# SMA — sonraki aşamada eklenecek
# ======================================================================
TOPLAYICILAR = {
    "GoodWe": goodwe,
    "Huawei": huawei,
}


def main():
    try:
        with open(OUT_PATH, encoding="utf-8") as f:
            eski = json.load(f)
    except Exception:
        eski = {"santraller": [], "kaynaklar": {}}

    simdi = datetime.now(timezone.utc).isoformat(timespec="seconds")
    yeni = {"guncelleme": simdi, "kaynaklar": {}, "santraller": []}

    atlanan = []
    for ad, fn in TOPLAYICILAR.items():
        try:
            veri = fn()
            if veri is None:
                atlanan.append(ad)
                continue
            for v in veri:
                v["zaman"] = simdi
            yeni["santraller"] += veri
            yeni["kaynaklar"][ad] = {"ok": True, "zaman": simdi, "adet": len(veri)}
        except Exception as e:
            traceback.print_exc()
            # Hata olursa o portalın eski verisini koru
            yeni["santraller"] += [s for s in eski.get("santraller", []) if s.get("kaynak") == ad]
            onceki = (eski.get("kaynaklar") or {}).get(ad, {})
            yeni["kaynaklar"][ad] = {"ok": False, "hata": str(e)[:200], "zaman": onceki.get("zaman")}

    if len(atlanan) == len(TOPLAYICILAR):
        print("HATA: Hiçbir portal için giriş bilgisi tanımlı değil (atlananlar: "
              + ", ".join(atlanan) + ").\n"
              "GitHub → Settings → Secrets and variables → Actions bölümüne "
              "GOODWE_USER ve GOODWE_PASS ekleyin.", file=sys.stderr)
        return 1

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(yeni, f, ensure_ascii=False, indent=2)
    print("Yazıldı:", os.path.abspath(OUT_PATH))


if __name__ == "__main__":
    sys.exit(main())
