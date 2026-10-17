"""GEÇİCİ keşif: SMA Sunny Portal (ennexOS) girişi ve sayfanın kullandığı veri uç noktaları.

Günlüğe yalnızca adres kalıpları ve JSON alan adları yazılır (değer, çerez, token yazılmaz).
Depo herkese açık olduğu için günlükler de herkese açıktır.
"""
import json
import os
import re
import sys
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

USER, PWD = os.getenv("SMA_USER"), os.getenv("SMA_PASS")
if not USER or not PWD:
    print("SMA_USER / SMA_PASS tanımlı değil, çıkılıyor (giriş denenmedi).")
    sys.exit(1)

BASE = "https://ennexos.sunnyportal.com"
GORULEN = {}


def maske(yol):
    return re.sub(r"[0-9a-fA-F]{8}-[0-9a-fA-F-]{27}|\d{5,}", "{id}", yol)


def sekil(v, derinlik=0):
    if isinstance(v, dict):
        if derinlik >= 3:
            return "{…}"
        return {k: sekil(x, derinlik + 1) for k, x in list(v.items())[:25]}
    if isinstance(v, list):
        return [f"liste[{len(v)}]"] + ([sekil(v[0], derinlik + 1)] if v else [])
    return type(v).__name__


def yanit(r):
    try:
        u = urlparse(r.url)
        if "sunnyportal.com" not in u.netloc and "sma.energy" not in u.netloc:
            return
        if "json" not in (r.headers.get("content-type") or ""):
            return
        anahtar = (r.request.method, u.netloc, maske(u.path))
        if anahtar in GORULEN:
            return
        try:
            govde = r.json()
        except Exception:
            govde = None
        GORULEN[anahtar] = r.status
        print(f"API {r.request.method} {u.netloc}{maske(u.path)} -> {r.status} "
              f"sorgu_anahtarları={sorted(k.split('=')[0] for k in u.query.split('&') if k)} "
              f"şekil={json.dumps(sekil(govde), ensure_ascii=False)[:700]}")
    except Exception as e:
        print("yanıt işlenemedi:", str(e)[:80])


def adim(sayfa, ad):
    u = urlparse(sayfa.url)
    print(f"ADIM {ad}: {u.netloc}{maske(u.path)}  başlık={sayfa.title()[:60]!r}")


with sync_playwright() as p:
    tarayici = p.chromium.launch()
    ctx = tarayici.new_context(locale="en-US", viewport={"width": 1366, "height": 900})
    sayfa = ctx.new_page()
    sayfa.on("response", yanit)

    sayfa.goto(BASE + "/", wait_until="domcontentloaded", timeout=60000)
    sayfa.wait_for_timeout(4000)
    adim(sayfa, "1 açılış")

    # Çerez bildirimi varsa kapat
    for metin in ("Accept all", "Accept All", "Accept", "Kabul"):
        try:
            sayfa.get_by_role("button", name=metin).first.click(timeout=2000)
            print("çerez bildirimi kapatıldı")
            break
        except Exception:
            pass

    # Keycloak giriş formu
    try:
        sayfa.wait_for_selector("input[name=username], #username", timeout=30000)
        sayfa.fill("input[name=username], #username", USER)
        sayfa.fill("input[name=password], #password", PWD)
        adim(sayfa, "2 form dolduruldu")
        sayfa.click("input[type=submit], button[type=submit], #kc-login")
    except Exception as e:
        print("GİRİŞ FORMU bulunamadı:", str(e)[:150])
        print("sayfadaki input alanları:", sayfa.eval_on_selector_all("input", "els => els.map(e => [e.type, e.name, e.id])"))
        adim(sayfa, "form-hatası")
        tarayici.close()
        sys.exit(1)

    try:
        sayfa.wait_for_url(re.compile(r"ennexos\.sunnyportal\.com"), timeout=45000)
    except Exception:
        pass
    sayfa.wait_for_timeout(6000)
    adim(sayfa, "3 giriş sonrası")
    # Hata mesajı (şifre reddi vb.) görünüyor mu?
    for sel in (".alert-error", "#input-error", ".kc-feedback-text", "[class*=error]"):
        try:
            t = sayfa.locator(sel).first.inner_text(timeout=1000)
            if t.strip():
                print("SAYFA HATA METNİ:", t.strip()[:200])
                break
        except Exception:
            pass

    sayfa.goto(BASE + "/monitoring/view-status-list", wait_until="domcontentloaded", timeout=60000)
    try:
        sayfa.wait_for_load_state("networkidle", timeout=45000)
    except Exception:
        pass
    sayfa.wait_for_timeout(8000)
    adim(sayfa, "4 durum listesi")

    # Sayfada görünen tablo/satır sayısı (içerik yazılmaz)
    for sel in ("table tbody tr", "[role=row]", "mat-row", "tr"):
        try:
            n = sayfa.locator(sel).count()
            if n:
                print(f"SATIR {sel}: {n}")
        except Exception:
            pass
    tarayici.close()
print("keşif bitti; görülen uç nokta sayısı:", len(GORULEN))
