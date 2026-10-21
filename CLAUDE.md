# gesizleme — Enerji Yönetim Merkezi (GES, Elektrik, ISO 50001)

İZBB İklim Değişikliği ve Temiz Enerji Şube Müdürlüğü (Enerji Ekibi) için belediye çatı GES'lerinin
durumunu ve performansını tek ekranda gösteren panel. Kullanıcı yazılımcı değil; açıklamalar Türkçe ve adım adım olmalı.

## Mimari (sunucusuz)

- `index.html` + `dashboard.js` + `elektrik.js` + `iso.js` — GitHub Pages'te yayınlanan panel (Tailwind + Lucide + Chart.js, CDN).
  **Gezinme iki katmanlı:** üstte modüller (Özet `#ozet` = açılış, Güneş Enerjisi `#genel`, Elektrik `#elektrik`, ISO 50001 `#iso`);
  GES seçilince altta alt sekmeler (Genel Bakış, Santraller, Canlı Durum `#canli`, Arıza Takip `#ariza`). Özet'teki modül kartları
  `ozetCiz()` ile GES göstergelerini doldurur; yeni modül = yeni üst düğme + `tab-<ad>` + `SEKMELER`'e ekleme. Sekmeler:
  - **Genel Bakış**: kurulu güç, yıllık üretim, beklenene göre verim, aylık/yıllık grafikler, "dikkat gerektirenler".
  - **Santraller**: performans tablosu (verim, geçen yıl farkı, son ay, kWh/kW, canlı durum) + santral detay penceresi.
  - **Elektrik** (`elektrik.js`): belediye elektrik tüketimi — kartlar, aylık tüketim, GES katkısı (aylık net üretim ve tüketimdeki
    pay), daire başkanlığı/tarife/tedarikçi kırılımı, yıllık özet. Genel Bakış'ta tek satırlık özet şeridi var.
  - **Harita** (`harita.js`, Leaflet 1.9.4 CDN; karolar CARTO koyu/OSM/Esri uydu): 21 santral işaretçisi, renk = verim ya da canlı durum, boyut = kW,
    kırmızı halka = canlı sorun; sağda liste, işaretçi kutusundan santral ayrıntısına geçilir. Konumlar `data/santral_konumlari.json`
    İlçe sınırları katmanı (açılıp kapanır, ilçedeki kurulu güce göre boyalı): `data/izmir_ilceler.geojson` — İzBB Açık Veri Portalı "İzmir Şehir Haritası"
    (CC BY 4.0, atıf harita altında), `collector/ilce_sinir_to_json.py` ile indirilip sadeleştirilir (~200 KB). Konumlar `data/santral_konumlari.json`
    (`collector/konum_to_json.py "<GES_CBS.xlsx>"`; yalnız lat/lon/ilçe — adres, maliyet, tasarruf yazılmaz). Yeni santral = Excel'e satır + betikteki `ID` eşlemesi.
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
- `data/elektrik.enc.json` — **ŞİFRELİ** (AES-256-GCM, PBKDF2) elektrik verisi; düz metin depoya asla girmez (`data/elektrik.json`
  .gitignore'da). Üretim: `ELEKTRIK_PAROLA="..." python3 collector/elektrik_to_json.py "<Elektrik.xlsx>"` (parola ≥12 karakter).
  Sekme açılınca "Yönetici girişi" parolayı sorar, çözme tarayıcıda yapılır (parola oturum boyunca sessionStorage'da). Parola
  unutulursa veri kurtarılamaz; Excel'den yeniden şifrelenir. Not: bu, istemci taraflı koruma — zayıf parola çevrimdışı denenebilir.
  Şifreli veri ayrıca `db_tarife` (DB × tarife) ve `genel_aydinlatma` (aylık kWh) içerir; Elektrik sekmesindeki **Raporlar** bölümü
  (rapor/yıl/ay aralığı seçilir, CSV indir, yazdır) bunlardan beslenir. Yalnızca toplamlar yazılır (ay / daire başkanlığı / tarife / tedarikçi, kWh). **Abone no, adres, kabin bilgisi ve fatura
  tutarları (TL) bilerek yazılmaz.** Tanım (Excel `Sonuç` sayfasıyla aynı): Gerçek tüketim = faturalı tüketim (genel aydınlatma
  hariç) + genel aydınlatmadan gelen %20 pay − müstecir noktalara verilen − üretim fazlası + GES net üretim.
  Faturalı tüketim için `Yıllık Durum` (ham `Veri` ile uyumlu) esas alınır; `Sonuç` sayfasıyla fark varsa `veri_notlari`'na yazılır.
- `data/iso50001.enc.json` — **ŞİFRELİ** ISO 50001 verisi (elektrikle aynı parola/oturum). Üretim:
  `ELEKTRIK_PAROLA="..." python3 collector/iso50001_to_json.py "<TSE GİDEN EVRAK klasörü>"`. Kaynak: `FRM.06.07 Enerji Referans
  Çizgileri/<yıl>/<no>.EnRÇ ....xlsx` (aylık takip + referans çizgisi, HDD/CDD/etkinlik değişkenleri, sapma gerekçesi) ve
  `PLN.06.01 Enerji Eylem Planı.xlsx`. Üç tesis: AASSM (dosya 1-2), Buz Sporları (3-4), Buca Sosyal Yaşam Kampüsü (5-11: Huzurevi,
  Aşevi, Kapalı Spor Salonu, Soğutma). Yatırım tutarları (TL) alınmaz. Sapma = (gerçekleşen−referans)/referans, pozitif = aşım.
  `iso.js` "ISO 50001" sekmesini çizer. Yeni yıl: yeni `<yıl>/` klasörünü ekle, betikteki `for yil in (2023, 2024)` listesini güncelle.
  İkinci argüman olarak `FRM.06.01 Risk ve Fırsat Değerlendirmesi.xlsx` verilirse (sayfalar: Genel, BSYK=Buca, AASSM, Buz Pisti) ISO sekmesinde
  "Risk ve fırsat" bölümü çıkar (seviye = O×E; ≥12 yüksek). Betik her çalıştığında dosyanın tamamı yeniden üretilir; iki Excel'i birlikte ver.
  Üçüncü argüman `Verilerim.xlsx` verilirse 2025–2026 gerçekleşen tüketim eklenir (kaynak: AASSM/Buca Aşevi sayfaları = toplam − mahsup,
  "Ayrıştırılmış Tüketimler" özet matrisleri, Ham Veri, Buz Pisti-Havuz; 2023–2024 değerleri EnRÇ dosyalarıyla karşılaştırılıp
  uyuşmazlık `veri_notlari`'na yazılır) ve motorin + havuz ayrımı (`ek`). Referans: baz dönem (2022–2023) sabit — ortalama tipli serilerde
  2024 referansı aynen; HDD/CDD'li serilerde (aassm-2, buca-6/8/10/11) 2024 dosyasındaki regresyon katsayıları × HDD/CDD. HDD/CDD: Verilerim'in `DEĞİŞKENLER Ort.`
  sayfasından (col0 tarih, col1 CDD, col3 HDD); sayfada olmayan yıllar betikteki `MGM_DERECE_GUN` sözlüğünden (MGM İzmir gün-derece tablosu,
  mgm.gov.tr/Veridegerlendirme/gun-derece.aspx?g=merkez&m=35-00; 2024-2025 Excel değerleriyle birebir doğrulandı). Yeni ay açıklanınca sözlüğe ekle. Veri kesim ayı Ham Veri'den (elektrik) alınır.
  Komut: `... iso50001_to_json.py "<TSE klasörü>" "<risk.xlsx>" "<Verilerim.xlsx>"` (üçü birlikte verilmeli, dosya baştan üretilir).
  **Sekme arayüzü (`iso.js`):** eylem planı, risk/fırsat, motorin, havuz ve okuma notları açılır-kapanır (`<details data-k>`, durum `acik` kümesinde
  korunur); eylem ve risk satırları tıklayınca ayrıntı açar. **Eylem ilerleme takibi:** durum Excel'deki termin/açıklamadan `otoDurum()` ile
  türetilir (iptal > tamamlandı > sürekli > gecikmiş(termin geçmiş) > devam/planlı); satırda elle durum, ilerleme % ve not girilebilir —
  **yalnızca tarayıcının localStorage'ında** (`iso_eylem_takip_v1`) saklanır, paylaşılmaz; JSON yedekle/yükle düğmeleri var. Ortak takip
  isteniyorsa durum/gerçekleştirme bilgisi `PLN.06.01` Excel'ine yazılıp betik yeniden çalıştırılmalı.
  Excel'de bilinen hata: Aşevi Mutfak 2024 toplam formülü Aralık'ı dışarıda bırakıyor (`veri_notlari`).
- `collector/collect.py` — canlı veri toplayıcı. Çıktı: `data/durum.json` (`guncelleme`, `kaynaklar{ad:{ok,adet,hata}}`,
  `santraller[]`). Bir portal hata verirse o portalın eski verisi korunur; hiçbir portal için Secret yoksa hata verip çıkar.
  - **GoodWe SEMS** (hk.semsportal.com, CrossLogin): liste `v2/PowerStationMonitor/QueryPowerStationMonitor`, detay
    `v3/PowerStation/GetPlantDetailByPowerstationId`, invertörler `v2/HistoryData/QueryPowerStationByHistory`.
    Eski `v2/PowerStation/GetMonitorDetailByPowerstationId` bu hesapta BOŞ döner.
  - **SMA ennexOS**: tarayıcısız OAuth (login.sma.energy, client `SPpbeOS`, PKCE) → `uiapi.sunnyportal.com/api/v1/statuslist/plants`.
    Durum kodu 307=Ok, 303=Kapalı, 35=Arıza, 455=Uyarı; **55 (ibbseyrekges) anlamı henüz bilinmiyor.**
  - **Huawei**: kod var (kiosk: `HUAWEI_KIOSK_URLS`; web girişi: `HUAWEI_USER/PASS`) ama GitHub'dan ÇALIŞMIYOR, aşağıya bak.
- `collector/alarm.py` — **e-posta alarmı** (Gmail SMTP, `veri-cek.yml`'de toplayıcıdan sonra, `continue-on-error`). Gündüz (`gunduz_mu`) bir invertör
  (invertörü olmayan santral için santral) "Haberleşme Yok"/"Arızalı" ise ve **art arda 2 turda** öyleyse BİR kez mesaj atar; sürerse tekrar yok
  (24 saatte bir hatırlatma), düzelince "giderildi" mesajı. Bir portala art arda erişilemezse o da alarm. Portal hatasında o portalın
  santralleri belirsiz sayılır. Gönderim başarısızsa "bildirildi" işaretlenmez, sonraki turda yeniden denenir. Durum: `data/alarm_durum.json`
  (bot commit'ler; kimlik bilgisi yok). Secrets: `GMAIL_USER`, `GMAIL_APP_PASS` (Gmail uygulama şifresi), `ALARM_ALICILAR` (virgülle ayrılmış).
  Alıcılar ve şifre günlüğe yazılmaz (Actions günlükleri herkese açık). Deneme: Actions → GES Veri Çek → Run workflow → `test_mail` işaretli.
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
