"""
GES veri toplayıcı — GitHub Actions üzerinde saatlik çalışır.
Portallardan durum verisini çeker ve data/durum.json dosyasına yazar.
Şifreler kodda DEĞİL, GitHub Secrets'ta durur (ortam değişkeni olarak gelir).
"""
import json
import os
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
            j = self.post("v2/PowerStationMonitor/QueryPowerStationMonitorForApp", {
                "page_index": 1, "page_size": 200, "key": "", "orderby": "",
                "powerstation_id": "", "powerstation_status": "", "powerstation_type": ""})
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

    def detay(self, sid):
        d = {}
        for govde in ({"powerStationId": sid}, {"powerstation_id": sid},
                      {"powerStationID": sid}, {"id": sid}):
            j = self.post("v2/PowerStation/GetMonitorDetailByPowerstationId", govde)
            d = j.get("data") or {}
            if d.get("info"):
                break
        info, kpi = d.get("info") or {}, d.get("kpi") or {}
        if not info:
            satir = self.liste.get(sid)
            if satir:
                # Tanılama: yalnızca alan adları (içerik değil)
                print(f"GoodWe {sid}: detay boş, liste satırı kullanılıyor. alanlar={sorted(satir)}")
                return self.listeden(sid, satir)
            raise RuntimeError(f"GoodWe detay boş döndü: {j.get('msg')}")

        invertorler = []
        for inv in d.get("inverter") or []:
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
            })

        durum = en_kotu([i["durum"] for i in invertorler]) if invertorler else \
            SEMS_INV_DURUM.get(info.get("status"), "Kontrol Edilmedi")

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
# HUAWEI ve SMA — sonraki aşamada eklenecek
# ======================================================================
TOPLAYICILAR = {
    "GoodWe": goodwe,
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
