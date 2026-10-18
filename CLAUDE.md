# gesizleme — GES & OSOS Durum Kontrol Merkezi

İZBB İklim Değişikliği ve Temiz Enerji Şube Müdürlüğü (Enerji Ekibi) için belediye çatı GES'lerinin
durumunu ve performansını tek ekranda gösteren panel. Kullanıcı yazılımcı değil; açıklamalar Türkçe ve adım adım olmalı.

## Mimari (sunucusuz)

- `index.html` + `dashboard.js` + `elektrik.js` — GitHub Pages'te yayınlanan panel (Tailwind + Lucide + Chart.js, CDN). 5 sekme:
  - **Genel Bakış**: kurulu güç, yıllık üretim, beklenene göre verim, aylık/yıllık grafikler, "dikkat gerektirenler".
  - **Santraller**: performans tablosu (verim, geçen yıl farkı, son ay, kWh/kW, canlı durum) + santral detay penceresi.
  - **Elektrik** (`elektrik.js`): belediye elektrik tüketimi — kartlar, aylık tüketim, GES katkısı (aylık net üretim ve tüketimdeki
    pay), daire başkanlığı/tarife/tedarikçi kırılımı, yıllık özet. Genel Bakış'ta tek satırlık özet şeridi var.
  - **Canlı Durum**: eski kontrol paneli (portal bağlantıları, santral tablosu; isim/saha notu/kWp/tesisat no elle
    düzenlenir ve localStorage'a kaydedilir; GDZ kopyala-yapıştır, WhatsApp raporu, JSON yedek). `loadLive()`
    `data/durum.json`'u okur, `window.CANLI`'ya koyar. Eşleştirme: `portal + kaynakId`, yoksa normalize isim.
  - **Arıza Takip**: aylık arıza takip listesi.
  - Portal kartlarında kullanıcı adı/şifre YOKTUR (depo public).
- `data/performans.json` — Excel'den üretilen performans verisi (aylık üretim, beklenen, kapasite, arıza listesi).
  Üretici: `collector/excel_to_json.py "<üretim.xlsx>" "<arıza takip.xlsx>"`. Tesisat no, adres, ihale bedeli
  **bilerek yazılmaz** (site herkese açık). `*.xlsx` `.gitignore`'da; Excel'i asla commit etme.
  Santral → canlı veri eşleşmeleri `excel_to_json.py` içindeki `SANTRALLER` sözlüğünde.
  Aylık güncelleme: kullanıcı yeni Excel'leri verir → betik yeniden çalıştırılır → `performans.json` commit'lenir.
- `data/elektrik.json` — elektrik tüketimi Excel'inden üretilir: `collector/elektrik_to_json.py "<Elektrik.xlsx>"`.
  Yalnızca toplamlar yazılır (ay / daire başkanlığı / tarife / tedarikçi, kWh). **Abone no, adres, kabin bilgisi ve fatura
  tutarları (TL) bilerek yazılmaz.** Tanım (Excel `Sonuç` sayfasıyla aynı): Gerçek tüketim = faturalı tüketim (genel aydınlatma
  hariç) + genel aydınlatmadan gelen %20 pay − müstecir noktalara verilen − üretim fazlası + GES net üretim.
  Faturalı tüketim için `Yıllık Durum` (ham `Veri` ile uyumlu) esas alınır; `Sonuç` sayfasıyla fark varsa `veri_notlari`'na yazılır.
- `collector/collect.py` — canlı veri toplayıcı. Çıktı: `data/durum.json` (`guncelleme`, `kaynaklar{ad:{ok,adet,hata}}`,
  `santraller[]`). Bir portal hata verirse o portalın eski verisi korunur; hiçbir portal için Secret yoksa hata verip çıkar.
  - **GoodWe SEMS** (hk.semsportal.com, CrossLogin): liste `v2/PowerStationMonitor/QueryPowerStationMonitor`, detay
    `v3/PowerStation/GetPlantDetailByPowerstationId`, invertörler `v2/HistoryData/QueryPowerStationByHistory`.
    Eski `v2/PowerStation/GetMonitorDetailByPowerstationId` bu hesapta BOŞ döner.
  - **SMA ennexOS**: tarayıcısız OAuth (login.sma.energy, client `SPpbeOS`, PKCE) → `uiapi.sunnyportal.com/api/v1/statuslist/plants`.
    Durum kodu 307=Ok, 303=Kapalı, 35=Arıza, 455=Uyarı; **55 (ibbseyrekges) anlamı henüz bilinmiyor.**
  - **Huawei**: kod var (kiosk: `HUAWEI_KIOSK_URLS`; web girişi: `HUAWEI_USER/PASS`) ama GitHub'dan ÇALIŞMIYOR, aşağıya bak.
- `.github/workflows/veri-cek.yml` — TR 06:07–20:07 arası saatlik (`7 3-17 * * *` UTC) + elle çalıştırma.
  Secrets: `GOODWE_USER`, `GOODWE_PASS`, `SMA_USER`, `SMA_PASS` (Huawei satırları kapalı/yorumda).
- `.github/workflows/static.yml` — Pages yayını (tüm depo); `workflow_run` ile veri toplayıcı bitince de tetiklenir.
  Not: yeni bir workflow dosyası `main`'de olmadan elle başlatılamaz; denemeler için `veri-cek.yml`'e geçici adım eklenip dalda çalıştırıldı.

## Durum (17.10.2026)

- GoodWe (9 santral, invertörlü) ve SMA (2 santral) canlı çalışıyor. Panel 21 santrali Excel verisiyle izliyor.
- **Gece/gündüz kuralı:** SEMS geceleri santrale ve invertörlere -1 (çevrimdışı) verir. `gunduz_mu()` İzmir güneş
  doğuş/batışına (1 saat pay) göre hesaplar; -1 yalnızca gündüz "Haberleşme Yok" sayılır, geceleri "Beklemede".
- SEMS invertör kodları: 1=Çalışıyor, 0=Beklemede, -1=Haberleşme Yok, 2=Arızalı.
- Panelde 7 Huawei santrali var (elle takip): Buca Toros, Aliağa KM, Bornova KM, Çiğli Aile Danışma, Gümüldür, Selçuk İtfaiye, Örnekköy.
- Canlı bağlantısı olmayan santraller: Ekrem Akurgal (Kaco), Selçuk Transfer (Fronius), Akkaya DGES (Deye/Solarman) + 7 Huawei.

## Huawei neden çalışmıyor (denendi, tekrar deneme)

- Hesap `intl.fusionsolar.huawei.com` bölgesinde. Bu ad GitHub'ın ağından (Cloudflare/Google DNS dahil) **çözülmüyor**.
  AB sunucusu (`eu5`) hesabı tanımıyor ("Enter the correct username and password").
- Kiosk düğmesi hesapta yok; Northbound API de aynı `intl` adresinde (aynı engel).
- SmartLogger IP'leri (Modbus 502 / web 80,443) internete kapalı; GitHub'dan okunamaz (iyi bir güvenlik durumu).
- Çözüm: Türkiye'den çıkan sürekli açık bir bilgisayarda (self-hosted runner ya da yerel Modbus okuyucu) çalıştırmak.
- Başarısız girişler hesabı kilitleyebilir: Huawei web girişini workflow'da AÇMA.

## Sıradaki işler

1. SMA durum kodu 55'in anlamını kullanıcıdan öğren, `SMA_DURUM`'a ekle.
2. Huawei için Türkiye'de sürekli açık bir makine bulunursa yerel toplayıcı.
3. Canlı günlük üretimi biriktirip (data/gunluk.json) Excel'in henüz girilmediği ayları panelde canlı göstermek.
4. **GDZ ARİL** — CORS/F5 WAF + AES şifreli istekler; GitHub'dan engellenebilir. Şimdilik panelde kopyala-yapıştır.
5. Excel'deki tutarsızlıklar (`performans.json` → `veri_notlari`): kullanıcıya bildirildi.

## Dikkat

- Depo **public**. Şifre/kullanıcı adı/token kesinlikle koda, günlüğe veya `durum.json`'a yazılmamalı; Secrets kullanılmalı.
  GitHub Actions günlükleri de herkese açık: IP, kiosk anahtarı, token yazdırma. Eski şifreler git geçmişinde kalır;
  sohbette paylaşılan şifrelerin değiştirilmesi önerildi (değişince Secrets güncellenmeli).
- Kullanıcının elinde yerel çalışan bir FastAPI denemesi var (portalların şifreleri düz metin). O dosya depoya **yüklenmemeli**.
- `data/durum.json` ve `data/performans.json` herkese açık (santral adları, üretim, arızalar).
- Bot commit'i ile elle push çakışabilir ("fetch first"); bot çalışırken push'tan kaçın ya da önce `git pull --rebase`.
