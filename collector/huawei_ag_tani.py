"""GEÇİCİ tanılama: intl adresi başka DNS'lerle çözülüyor mu? Giriş yapılmaz, şifre gönderilmez."""
import json
import socket

import requests

HOST = "intl.fusionsolar.huawei.com"
DOH = {
    "cloudflare": "https://cloudflare-dns.com/dns-query",
    "google": "https://dns.google/resolve",
}

ipler = {}
for ad, url in DOH.items():
    for tip in ("A", "AAAA", "CNAME"):
        try:
            r = requests.get(url, params={"name": HOST, "type": tip},
                             headers={"accept": "application/dns-json"}, timeout=15)
            j = r.json()
            cevaplar = [(a.get("type"), a.get("data")) for a in j.get("Answer", [])]
            print(f"AĞ DoH {ad} {tip}: Status={j.get('Status')} cevaplar={cevaplar}")
            for t, d in cevaplar:
                if t in (1, 28):
                    ipler.setdefault(d, ad)
        except Exception as e:
            print(f"AĞ DoH {ad} {tip}: hata {str(e)[:80]}")

# Sistem çözümleyicisi
try:
    print("AĞ sistem DNS:", socket.getaddrinfo(HOST, 443)[0][4])
except Exception as e:
    print("AĞ sistem DNS: çözülmedi", str(e)[:50])

# Çözülen bir IP varsa, yalnızca herkese açık pubkey sayfasına bak (giriş yok)
orig = socket.getaddrinfo
for ip, kaynak in list(ipler.items())[:2]:
    def yama(host, *a, _ip=ip, **k):
        return orig(_ip if host == HOST else host, *a, **k)
    socket.getaddrinfo = yama
    try:
        r = requests.get(f"https://{HOST}/unisso/pubkey", timeout=15, allow_redirects=False)
        try:
            j = r.json(); ozet = f"enableEncrypt={j.get('enableEncrypt')}"
        except Exception:
            ozet = f"json değil, uzunluk={len(r.text)}"
        print(f"AĞ {HOST} -> {ip} ({kaynak}): pubkey HTTP {r.status_code} {ozet} Location={r.headers.get('Location')}")
    except Exception as e:
        print(f"AĞ {HOST} -> {ip} ({kaynak}): istek hatası {str(e)[:100]}")
    finally:
        socket.getaddrinfo = orig
