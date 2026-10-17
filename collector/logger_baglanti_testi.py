"""GEÇİCİ: SmartLogger'a GitHub ağından TCP bağlantısı kurulabiliyor mu? (yalnızca bağlantı, veri/komut yok)

HUAWEI_LOGGER_IPS Secret'ı: her satır "Ad | IP". IP'ler günlüğe YAZILMAZ (yalnızca ad).
Portlar: 80 (web), 443 (web, https), 502 (Modbus TCP).
"""
import os
import socket
import sys
import time

satirlar = [l.strip() for l in (os.getenv("HUAWEI_LOGGER_IPS") or "").splitlines() if l.strip()]
if not satirlar:
    print("HUAWEI_LOGGER_IPS tanımlı değil, çıkılıyor.")
    sys.exit(1)

PORTLAR = {80: "web(http)", 443: "web(https)", 502: "Modbus TCP"}

for satir in satirlar:
    ad, _, ip = satir.rpartition("|")
    ad, ip = ad.strip() or "?", ip.strip()
    sonuc = []
    for port, etiket in PORTLAR.items():
        t0 = time.time()
        try:
            with socket.create_connection((ip, port), timeout=6):
                durum = "AÇIK"
        except socket.timeout:
            durum = "zaman aşımı (filtreli/kapalı)"
        except ConnectionRefusedError:
            durum = "reddedildi (kapalı)"
        except OSError as e:
            durum = f"hata ({e.__class__.__name__})"
        sonuc.append(f"{port}/{etiket}: {durum} ({time.time()-t0:.1f} sn)")
    print(f"LOGGER {ad}: " + " | ".join(sonuc))
