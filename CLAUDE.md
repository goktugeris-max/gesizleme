# gesizleme — GES & OSOS Durum Kontrol Merkezi

İZBB İklim Değişikliği ve Temiz Enerji Şube Müdürlüğü (Enerji Ekibi) için belediye çatı GES'lerinin
durumunu tek ekranda gösteren panel. Kullanıcı yazılımcı değil; açıklamalar Türkçe ve adım adım olmalı.

## Mimari (sunucusuz)

- `index.html` — GitHub Pages'te yayınlanan tek sayfalık panel (Tailwind + Lucide, CDN).
  - Portal kartları (SMA, GoodWe, Huawei, GDZ ARİL) — giriş bilgisi kopyalama + portalı açma.
  - Santral tablosu: isim / saha notu / kWp / tesisat no elle düzenlenebilir, localStorage'a kaydedilir.
  - Açılışta `data/durum.json` okunur (`loadLive()`); durum, anlık kW, günlük kWh ve arızalı invertörler
    güncellenir. Eşleştirme: önce `portal + kaynakId`, yoksa normalize edilmiş isim. Özel isimler korunur.
  - GDZ ARİL için kopyala-yapıştır aktarımı, WhatsApp raporu, JSON yedek al/yükle.
- `collector/collect.py` — veri toplayıcı. Şu an yalnızca **GoodWe SEMS** (CrossLogin API).
  Çıktı: `data/durum.json` (`guncelleme`, `kaynaklar{ad:{ok,adet,hata}}`, `santraller[]`).
  Bir portal hata verirse o portalın eski verisi korunur.
- `.github/workflows/veri-cek.yml` — TR 06:07–20:07 arası saatlik (`7 3-17 * * *` UTC) + elle çalıştırma.
  Şifreler GitHub Secrets'ta: `GOODWE_USER`, `GOODWE_PASS`.
- `.github/workflows/static.yml` — Pages yayını; `workflow_run` ile veri toplayıcı bitince de tetiklenir
  (bot commit'i Pages'i kendiliğinden tetiklemediği için eklendi).

## Durum (17.10.2026)

- GoodWe toplayıcı örnek yanıtla test edildi, **gerçek SEMS sunucusunda henüz denenmedi.**
  Kullanıcı Secrets'ı ekleyip Actions → "GES Veri Çek" → Run workflow ile ilk testi yapacak.
- SEMS invertör durum kodları: 1=Çalışıyor, 0=Beklemede, -1=Haberleşme Yok, 2=Arızalı.
- Kullanıcıya göre GoodWe, SMA ve Huawei girişlerinde CAPTCHA yok.

## Sıradaki işler

1. GoodWe ilk gerçek çalıştırma sonucunu kontrol et, gerekirse uç noktaları düzelt.
2. **Huawei FusionSolar** modülü — tercihen Northbound API hesabı; yoksa normal hesapla
   Playwright. Şifre `HUAWEI_USER` / `HUAWEI_PASS` Secrets olarak.
3. **SMA ennexOS** — giriş akışı karmaşık, büyük ihtimalle Playwright gerekir.
4. **GDZ ARİL** — CORS/F5 WAF + AES şifreli istekler; GitHub sunucularından engellenebilir.
   Şimdilik panelde kopyala-yapıştır aktarımı var.
5. Depodaki uzantısız eski `index` dosyası (bozuk eski sürüm, SMA şifresi içeriyor) silinebilir —
   kullanıcı onayı bekleniyor.

## Dikkat

- Depo **public**. Yeni şifre/kullanıcı adı kesinlikle koda eklenmemeli; Secrets kullanılmalı.
  (`index.html`'deki SMA kartı bilgileri kullanıcının açık isteğiyle orada duruyor.)
- Kullanıcının elinde yerel çalışan bir FastAPI denemesi var (portalların şifreleri düz metin).
  O dosya depoya **yüklenmemeli**. İçindeki SMA/Huawei kısmı veri okumuyor, yalnızca giriş kontrolü yapıyor.
- `data/durum.json` herkese açık olur (santral adları, üretim, arızalar).
