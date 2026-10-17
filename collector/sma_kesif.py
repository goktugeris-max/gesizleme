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
        if maske(u.path).endswith("/statuslist/plants") and isinstance(govde, dict):
            for it in govde.get("items") or []:
                print("  SANTRAL:", {k: it.get(k) for k in ("name", "state", "pvPower", "yieldToday", "dcPowerInputMax", "electricCapacity")})
        if maske(u.path).endswith("/api/v1/navigation") and isinstance(govde, list):
            print("  NAVIGASYON:", [{"tip": x.get("componentType"), "ad": x.get("name")} for x in govde])
        print(f"API {r.request.method} {u.netloc}{maske(u.path)} -> {r.status} "
              f"sorgu_anahtarları={sorted(k.split('=')[0] for k in u.query.split('&') if k)} "
              f"şekil={json.dumps(sekil(govde), ensure_ascii=False)[:700]}")
    except Exception as e:
        print("yanıt işlenemedi:", str(e)[:80])


def incele(sayfa, etiket):
    """Sayfadaki düğme/bağlantı etiketleri ve input alanları (değer yazılmaz)."""
    print("İNCELE", etiket)
    for sel, ad in (("button", "düğmeler"), ("a", "bağlantılar")):
        try:
            metin = [t.strip()[:40] for t in sayfa.locator(sel).all_inner_texts() if t.strip()]
            print(f"  {ad}:", metin[:15])
        except Exception as e:
            print(f"  {ad} okunamadı:", str(e)[:60])
    try:
        print("  input:", sayfa.locator("input").evaluate_all(
            "els => els.map(e => [e.type, e.name, e.id, e.placeholder || '', e.getAttribute('formcontrolname') || '', e.getAttribute('autocomplete') || ''])"))
    except Exception as e:
        print("  input okunamadı:", str(e)[:60])
    print("  çerçeveler:", [urlparse(f.url).netloc for f in sayfa.frames][:6])


HERKESE_ACIK = {"client_id", "redirect_uri", "scope", "response_type", "code_challenge_method",
                "response_mode", "grant_type", "ui_locales", "todayDate", "cultureName"}


def istek(r):
    """Yetkilendirme/token/veri isteklerinin yapısı. Yalnızca herkese açık parametrelerin değeri yazılır."""
    try:
        from urllib.parse import parse_qsl
        u = urlparse(r.url)
        yol = maske(u.path)
        if u.netloc == "login.sma.energy" and yol.endswith("/openid-connect/auth"):
            q = dict(parse_qsl(u.query))
            print("OAUTH yetkilendirme:", {k: (v if k in HERKESE_ACIK else "<gizli/rastgele>") for k, v in q.items()})
        elif u.netloc == "login.sma.energy" and yol.endswith("/openid-connect/token") and r.method == "POST":
            q = dict(parse_qsl(r.post_data or ""))
            print("OAUTH token isteği:", {k: (v if k in HERKESE_ACIK else "<gizli>") for k, v in q.items()})
        elif u.netloc == "uiapi.sunnyportal.com" and r.method == "GET":
            h = {k.lower(): v for k, v in r.headers.items()}
            yetki = h.get("authorization", "")[:6]
            if ("statuslist" in yol or "navigation" in yol) and (yol, "istek") not in GORULEN:
                GORULEN[(yol, "istek")] = 1
                q = dict(parse_qsl(u.query))
                print(f"VERİ isteği {yol}: yetki_başlığı={yetki!r} sorgu="
                      f"{ {k: (v if k in HERKESE_ACIK else re.sub(r'[0-9a-fA-F-]{8,}', '<id>', v)[:30]) for k, v in q.items()} }")
    except Exception as e:
        print("istek işlenemedi:", str(e)[:80])


def adim(sayfa, ad):
    u = urlparse(sayfa.url)
    print(f"ADIM {ad}: {u.netloc}{maske(u.path)}  başlık={sayfa.title()[:60]!r}")


with sync_playwright() as p:
    tarayici = p.chromium.launch()
    ctx = tarayici.new_context(locale="en-US", viewport={"width": 1366, "height": 900})
    sayfa = ctx.new_page()
    sayfa.on("response", yanit)
    sayfa.on("request", istek)

    sayfa.goto(BASE + "/", wait_until="domcontentloaded", timeout=60000)
    sayfa.wait_for_timeout(5000)

    # Çerez bildirimi varsa kapat
    for metin in ("Accept all", "Accept All", "Accept", "Kabul"):
        try:
            sayfa.get_by_role("button", name=metin).first.click(timeout=2000)
            print("çerez bildirimi kapatıldı")
            break
        except Exception:
            pass
    sayfa.wait_for_timeout(2000)
    adim(sayfa, "1 açılış")
    incele(sayfa, "açılış")

    KULLANICI = "input[type=email], input[name=username], #username, input[autocomplete=username], input[type=text]"
    SIFRE = "input[type=password]"

    if sayfa.locator(SIFRE).count() == 0:
        # Form yok: giriş düğmesine/bağlantısına tıkla (SMA ID ile giriş olabilir)
        tikla = sayfa.get_by_role("button", name=re.compile(r"sma id|log ?in|sign ?in|anmelden|giriş", re.I)).first
        try:
            tikla.click(timeout=8000)
            print("giriş düğmesine tıklandı")
        except Exception:
            try:
                sayfa.get_by_role("link", name=re.compile(r"sma id|log ?in|sign ?in|anmelden|giriş", re.I)).first.click(timeout=8000)
                print("giriş bağlantısına tıklandı")
            except Exception as e:
                print("giriş düğmesi bulunamadı:", str(e)[:100])
        sayfa.wait_for_timeout(6000)
        adim(sayfa, "2 tıklama sonrası")
        incele(sayfa, "tıklama sonrası")

    try:
        sayfa.wait_for_selector(SIFRE, timeout=30000)
        sayfa.locator(KULLANICI).first.fill(USER)
        sayfa.locator(SIFRE).first.fill(PWD)
        adim(sayfa, "3 form dolduruldu")
        sayfa.locator(SIFRE).first.press("Enter")
    except Exception as e:
        print("GİRİŞ FORMU bulunamadı:", str(e)[:150])
        adim(sayfa, "form-hatası")
        incele(sayfa, "form-hatası")
        tarayici.close()
        sys.exit(1)

    try:
        sayfa.wait_for_url(re.compile(r"ennexos\.sunnyportal\.com"), timeout=45000)
    except Exception:
        pass
    sayfa.wait_for_timeout(6000)
    adim(sayfa, "4 giriş sonrası")
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
    adim(sayfa, "5 durum listesi")

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
