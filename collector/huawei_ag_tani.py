"""GEÇİCİ tanılama: Huawei adresleri GitHub sunucusundan görünüyor mu? Giriş yapılmaz, şifre gönderilmez."""
import socket

import requests

ADAYLAR = ["intl", "eu5", "region01eu5", "uni001eu5", "uni002eu5", "uni003eu5", "uni004eu5", "uni005eu5"]

for a in ADAYLAR:
    host = f"{a}.fusionsolar.huawei.com"
    try:
        ip = socket.getaddrinfo(host, 443)[0][4][0]
    except Exception as e:
        print(f"AĞ {host}: DNS çözülmedi ({str(e)[:40]})")
        continue
    try:
        r = requests.get(f"https://{host}/unisso/pubkey", timeout=15, allow_redirects=False)
        ozet = r.text[:0]
        try:
            j = r.json()
            ozet = f"enableEncrypt={j.get('enableEncrypt')} anahtarlar={sorted(j)}"
        except Exception:
            ozet = f"json değil, uzunluk={len(r.text)}"
        print(f"AĞ {host}: DNS tamam ({ip}) pubkey HTTP {r.status_code} {ozet} Location={r.headers.get('Location')}")
    except Exception as e:
        print(f"AĞ {host}: DNS tamam ({ip}) ama istek hatası: {str(e)[:80]}")
