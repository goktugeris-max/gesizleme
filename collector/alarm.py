"""GES alarm bildirimi: veri toplayıcıdan sonra çalışır, yeni kesinti/arızaları Gmail ile bildirir.

Kurallar
  - Yalnızca gündüz değerlendirilir (geceleri SEMS çevrimdışı görünür, bu arıza değildir; durum korunur).
  - Bir invertör (invertörü olmayan santral için santralin kendisi) "Haberleşme Yok" ya da "Arızalı" ise ve
    art arda GEREKEN_ARDISIK turda böyle görünürse BİR kez bildirilir; sorun sürdükçe tekrar mesaj atılmaz
    (HATIRLATMA_SAAT geçince bir hatırlatma gider). Düzelince "giderildi" mesajı gider.
  - Bir portala (GoodWe, SMA) art arda erişilemiyorsa o da sorun sayılır.
  - Portal erişim hatasında o portalın santrallerinin durumu belirsiz olduğundan değerlendirme dışı bırakılır.
Durum: data/alarm_durum.json (yalnızca santral/invertör adı ve sayaçlar; kimlik bilgisi içermez).

Ortam değişkenleri (GitHub Secrets):
  GMAIL_USER       gönderen Gmail adresi
  GMAIL_APP_PASS   Gmail "uygulama şifresi" (16 karakter)
  ALARM_ALICILAR   alıcı e-postalar, virgülle ayrılmış
  ALARM_TEST=true  yalnızca deneme e-postası gönderir
Kimlik bilgileri ve alıcı adresleri asla günlüğe yazılmaz (GitHub Actions günlükleri herkese açık).
"""
import json
import os
import smtplib
import ssl
import sys
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from email.utils import formatdate

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from collect import gunduz_mu  # noqa: E402

KOK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
DURUM_YOLU = os.path.join(KOK, "durum.json")
ALARM_YOLU = os.path.join(KOK, "alarm_durum.json")
SORUNLU = ("Arızalı", "Haberleşme Yok")
GEREKEN_ARDISIK = 2
HATIRLATMA_SAAT = 24
PANEL = "https://goktugeris-max.github.io/gesizleme/#canli"


class EpostaAyariYok(Exception):
    pass


def yerel(zaman):
    """UTC -> Türkiye saati (UTC+3) metni"""
    return (zaman + timedelta(hours=3)).strftime("%d.%m.%Y %H:%M")


def zaman_oku(s):
    return datetime.fromisoformat(s) if s else None


def sorunlari_bul(durum):
    """Şu anda sorunlu olanlar: anahtar -> {ad, sorun, kaynak, ayrinti}; ve erişilemeyen portallar kümesi"""
    sorunlar, belirsiz = {}, set()
    for ad, k in (durum.get("kaynaklar") or {}).items():
        if k.get("ok") is False:
            belirsiz.add(ad)
            sorunlar[f"portal:{ad}"] = {"ad": f"{ad} portalı", "sorun": "Veri alınamıyor (portal erişim hatası)", "kaynak": ad, "ayrinti": ""}
    for p in durum.get("santraller") or []:
        if p.get("kaynak") in belirsiz:
            continue
        ayrinti = "Santral anlık {} kW, bugün {} kWh".format(
            "—" if p.get("anlik_kw") is None else str(p["anlik_kw"]).replace(".", ","),
            "—" if p.get("bugun_kwh") is None else str(p["bugun_kwh"]).replace(".", ","))
        invertorler = p.get("invertorler") or []
        if invertorler:
            for i in invertorler:
                if i.get("durum") in SORUNLU:
                    ad = f"{p['ad'].strip()} — {(i.get('ad') or i.get('sn') or 'İnvertör').strip()}"
                    sorunlar[f"inv:{p['kaynak']}:{p['kaynakId']}:{i.get('sn')}"] = {"ad": ad, "sorun": i["durum"], "kaynak": p["kaynak"], "ayrinti": ayrinti}
        elif p.get("durum") in SORUNLU:
            sorunlar[f"santral:{p['kaynak']}:{p['kaynakId']}"] = {"ad": p["ad"].strip(), "sorun": p["durum"], "kaynak": p["kaynak"], "ayrinti": ayrinti}
    return sorunlar, belirsiz


def degerlendir(durum, onceki, simdi):
    """-> (yeni durum, yeni alarm anahtarları, hatırlatma anahtarları, giderilen kayıtlar)"""
    sorunlar, belirsiz = sorunlari_bul(durum)
    yeni, yeni_alarm, hatirlatma, giderilen = {}, [], [], []
    # erişilemeyen portalın santralleri belirsiz: önceki kayıtları olduğu gibi taşı
    for k, e in onceki.items():
        if e.get("kaynak") in belirsiz and not k.startswith("portal:"):
            yeni[k] = e
    for k, s in sorunlar.items():
        e = dict(onceki.get(k) or {"ilk": simdi.isoformat(timespec="seconds"), "ardisik": 0, "bildirildi": False})
        e.update(ad=s["ad"], sorun=s["sorun"], kaynak=s["kaynak"], ayrinti=s["ayrinti"])
        e["ardisik"] += 1
        if not e["bildirildi"] and e["ardisik"] >= GEREKEN_ARDISIK:
            e["bildirildi"], e["bildirim"] = True, simdi.isoformat(timespec="seconds")
            yeni_alarm.append(k)
        elif e["bildirildi"] and simdi - zaman_oku(e["bildirim"]) >= timedelta(hours=HATIRLATMA_SAAT):
            e["bildirim"] = simdi.isoformat(timespec="seconds")
            hatirlatma.append(k)
        yeni[k] = e
    for k, e in onceki.items():
        if k not in sorunlar and k not in yeni and e.get("bildirildi"):
            giderilen.append(e)
    return yeni, yeni_alarm, hatirlatma, giderilen


def mesaj_olustur(yeni_alarm, hatirlatma, giderilen, simdi):
    # yeni_alarm / hatirlatma: kayıt sözlükleri listesi
    """-> (konu, gövde) ya da gönderilecek bir şey yoksa None"""
    if not (yeni_alarm or hatirlatma or giderilen):
        return None
    satir = lambda e: f"• {e['ad']}: {e['sorun']}\n  İlk görüldüğü: {yerel(zaman_oku(e['ilk']))} (TR)" + (f"\n  {e['ayrinti']}" if e.get("ayrinti") else "")
    bolumler = []
    if yeni_alarm:
        bolumler.append("YENİ SORUN:\n" + "\n".join(satir(e) for e in yeni_alarm))
    if hatirlatma:
        bolumler.append(f"HÂLÂ DEVAM EDEN (hatırlatma, {HATIRLATMA_SAAT} saatten uzun süredir):\n" + "\n".join(satir(e) for e in hatirlatma))
    if giderilen:
        bolumler.append("GİDERİLDİ:\n" + "\n".join(f"• {e['ad']} ({e['sorun']}) artık normal görünüyor." for e in giderilen))
    if yeni_alarm or hatirlatma:
        adlar = [e["ad"] for e in (yeni_alarm or hatirlatma)]
        konu = "GES uyarı: " + (f"{adlar[0]} – {(yeni_alarm or hatirlatma)[0]['sorun']}" if len(adlar) == 1 else f"{len(adlar)} sorun")
    else:
        konu = "GES: sorun giderildi – " + (giderilen[0]["ad"] if len(giderilen) == 1 else f"{len(giderilen)} kayıt")
    govde = ("Merhaba,\n\nGES izleme panelinde değişiklik tespit edildi (kontrol zamanı " + yerel(simdi) + " TR):\n\n"
             + "\n\n".join(bolumler) + f"\n\nPanel: {PANEL}\n\nBu mesaj otomatik gönderilmiştir. Sorun aynı kalırsa tekrar mesaj gelmez; "
             "düzelince 'giderildi' mesajı gelir.\n")
    return konu, govde


def gonder(konu, govde):
    kullanici = os.environ.get("GMAIL_USER", "").strip()
    sifre = os.environ.get("GMAIL_APP_PASS", "").replace(" ", "").strip()
    alicilar = [a.strip() for a in os.environ.get("ALARM_ALICILAR", "").replace(";", ",").split(",") if a.strip()]
    if not (kullanici and sifre and alicilar):
        raise EpostaAyariYok()
    m = EmailMessage()
    m["From"] = f"GES Panel <{kullanici}>"
    m["To"] = kullanici  # alıcılar birbirini görmesin: gerçek alıcılar zarfta
    m["Subject"] = konu
    m["Date"] = formatdate(localtime=False)
    m.set_content(govde)
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=ssl.create_default_context(), timeout=30) as s:
        s.login(kullanici, sifre)
        s.send_message(m, from_addr=kullanici, to_addrs=alicilar)
    return len(alicilar)


def geri_al(yeni, onceki, yeni_alarm, hatirlatma, giderilen):
    """Gönderim başarısızsa sayaçlar ilerlesin ama 'bildirildi' işaretlenmesin: sonraki turda yeniden denenir"""
    yeni = {k: dict(e) for k, e in yeni.items()}
    for k in yeni_alarm:
        yeni[k]["bildirildi"] = False
        yeni[k].pop("bildirim", None)
    for k in hatirlatma:
        yeni[k]["bildirim"] = onceki[k]["bildirim"]
    for i, e in enumerate(giderilen):
        yeni[f"giderilen:{i}:{e['ad']}"] = e
    return yeni


def calistir(durum, onceki, simdi, gonder_fn=gonder):
    """-> (yazılacak alarm durumu, gönderildi mi, hata metni)"""
    yeni, yeni_alarm, hatirlatma, giderilen = degerlendir(durum, onceki, simdi)
    ileti = mesaj_olustur([yeni[k] for k in yeni_alarm], [yeni[k] for k in hatirlatma], giderilen, simdi)
    if ileti is None:
        return yeni, False, None
    hata = None
    try:
        gonder_fn(*ileti)
    except EpostaAyariYok:
        hata = "e-posta ayarı yok (GMAIL_USER, GMAIL_APP_PASS, ALARM_ALICILAR)"
    except smtplib.SMTPAuthenticationError:
        hata = "Gmail girişi reddedildi (uygulama şifresini ve gönderen adresi kontrol edin)"
    except Exception as e:  # ağ vb.
        hata = f"e-posta gönderilemedi ({type(e).__name__})"
    if hata:
        return geri_al(yeni, onceki, yeni_alarm, hatirlatma, giderilen), False, hata
    return yeni, True, None


def main():
    if os.environ.get("ALARM_TEST", "").lower() in ("1", "true"):
        try:
            n = gonder("GES panel: deneme mesajı", "Bu bir deneme mesajıdır. Bu e-postayı alıyorsanız GES alarm bildirimi doğru kurulmuştur.\n\nPanel: " + PANEL + "\n")
            print(f"Deneme e-postası gönderildi ({n} alıcı).")
            return 0
        except EpostaAyariYok:
            print("HATA: GMAIL_USER, GMAIL_APP_PASS ve ALARM_ALICILAR Secret'ları tanımlı değil.", file=sys.stderr)
        except smtplib.SMTPAuthenticationError:
            print("HATA: Gmail girişi reddedildi. Uygulama şifresini ve gönderen adresi kontrol edin.", file=sys.stderr)
        except Exception as e:
            print(f"HATA: e-posta gönderilemedi ({type(e).__name__}).", file=sys.stderr)
        return 1

    simdi = datetime.now(timezone.utc)
    if not gunduz_mu(simdi):
        print("Gece: alarm değerlendirmesi atlandı (durum korunuyor).")
        return 0
    with open(DURUM_YOLU, encoding="utf-8") as f:
        durum = json.load(f)
    try:
        with open(ALARM_YOLU, encoding="utf-8") as f:
            onceki = json.load(f).get("sorunlar", {})
    except Exception:
        onceki = {}
    yeni, gonderildi, hata = calistir(durum, onceki, simdi)
    with open(ALARM_YOLU, "w", encoding="utf-8") as f:
        json.dump({"guncelleme": simdi.isoformat(timespec="seconds"), "sorunlar": yeni}, f, ensure_ascii=False, indent=1)
    print(f"Alarm: {len(yeni)} açık sorun" + (", e-posta gönderildi." if gonderildi else "."))
    if hata:
        print("UYARI: " + hata, file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
