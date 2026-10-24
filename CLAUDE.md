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
  - **Harita** (`harita.js`, Leaflet 1.9.4 CDN; karolar Esri Dark Gray (koyu, anahtarsız; CARTO anahtar istediği için bırakıldı)/OSM sokak/Esri uydu): 21 santral işaretçisi, renk = verim ya da canlı durum, boyut = kW,
    kırmızı halka = canlı sorun; sağda liste, işaretçi kutusundan santral ayrıntısına geçilir.
    İlçe sınırları katmanı (açılıp kapanır, ilçedeki kurulu güce göre boyalı): `data/izmir_ilceler.geojson` — İzBB Açık Veri Portalı "İzmir Şehir Haritası"
    (CC BY 4.0, atıf harita altında), `collector/ilce_sinir_to_json.py` ile indirilip sadeleştirilir (~200 KB). Konumlar `data/santral_konumlari.json`
    (`collector/konum_to_json.py "<GES_CBS.xlsx>"`; yalnız lat/lon/ilçe — adres, maliyet, tasarruf yazılmaz). Yeni santral = Excel'e satır + betikteki `ID` eşlemesi.
  - **Veri Girişi** (`veri.js` + `veridb.js` + `supabase-ayar.js`, `#veri`): Supabase (REST + GoTrue, SDK yok) ile GES aylık üretim (santral × ay, kWh; Excel'den yapıştırma) ve aylık
    inceleme (arıza takip satırları) girişi, değişiklik geçmişi. Açılışta `veridb.js` `birlestir()` ile DB satırlarını `performans.json`'un üstüne uygular (yıllık toplam yeniden hesaplanır;
    santrallerin ≥%70'inde verisi olan en son ay `son_donem` olur; o dönemin inceleme satırları Arıza Takip'e gelir). `supabase-ayar.js` boşsa/ulaşılamazsa panel yalnızca Excel'le çalışır.
    Şema ve RLS: `supabase/kurulum.sql` (rol: okuyucu/girisci/yonetici; anon yalnız okur; yazma `yazabilir()`; her değişiklik `degisiklik_gecmisi`'ne). Kurulum: `supabase/KURULUM.md`.
    Elektrik/ISO verisi veritabanına KONMAZ (şifreli statik kalır). `service_role` anahtarı asla siteye/depoya yazılmaz. Test: sahte PostgREST/GoTrue sunucusu (yerel) ile yapıldı; gerçek Supabase henüz bağlanmadı.
  - **Ortak eylem takibi (ISO)**: Veri Girişi hesabıyla giriş yapılınca (`iso.js` → `ortakYukle()`) ISO eylem planı satırlarındaki durum, ilerleme, sorumlu, not ve YORUMLAR Supabase'te
    (`eylem_takip`, `eylem_yorum`; `supabase/eylem_takip.sql` bir kez çalıştırılmalı) ekiple paylaşılır; giriş yoksa eski yerel (localStorage) takip çalışır. Bu tablolar anon'a KAPALI
    (okuma: profili olan giriş yapmışlar, yazma: girisci/yonetici); kim/ne zaman sunucuda yazılır, `degisiklik_gecmisi`'ne düşer. "Bu tarayıcıdaki notları ortağa aktar" düğmesi yerel notları taşır.
    Eylem kimliği `tesis|no|önlem[0:40]` (Excel'de önlem metni değişirse kimlik değişir → ortak kayıt eşleşmez). Karbon eylem listesi henüz yerel.
  - **Verim Analizi** (`analiz.js`, `#analiz`): Open-Meteo ışınımıyla düzeltilmiş performans oranı. Veri `data/hava.json` (`collector/hava_cek.py`, workflow
    `hava-cek.yml`: ayda bir + elle; Open-Meteo Historical API, anahtarsız, CC BY 4.0, yalnız ticari olmayan kullanım; IP başına günlük sınır var → 429'da kalan aylar sonraki
    çalıştırmada çekilir, artımlıdır). Santral başına aylık eğik yüzey ışınımı (varsayım 30° eğim, güney; `santral_konumlari.json`'a `egim`/`yon` yazılabilir) ve gündüz sıcaklığı.
    PR = üretim/(kWp×GTI), sıcaklık düzeltmeli; beklenen PR = santralin ilk 24 ay medyanı (veya sabit PR) × (1−yıllık kayıp)^yıl. Endeks = Σgerçek/Σbeklenen. Başlangıç PR'si 0,65–0,95
    dışındaysa kurulu güç/yön şüphesi uyarısı çıkar (CBS Excel'i ile panel kW'ları bazı santrallerde farklı). `hava.json` yoksa sayfa Actions'ı çalıştırmayı söyler.
  - **Karbon & İklim** (`karbon.js`, üst modül `#karbon`): kurumsal sera gazı envanteri (Kapsam 1+2, KISMİ kapsam) + yerel iklim eylem planı (SECAP) altlığı.
    Girdi: GES üretimi (`performans.json`, giriş gerekmez → kaçınılan CO₂), elektrik (`elektrik.enc.json`: faturalı − müstecir = bina/tesis, `genel_aydinlatma` = kamu aydınlatması),
    doğalgaz Sm³ ve motorin (`iso50001.enc.json`, yalnız 3 ISO tesisi; ISO elektriği toplam elektriğin içinde olduğundan eklenmez). Envanter fatura esaslıdır;
    GES kaçınılan emisyonu ayrı gösterilir, envanterden düşülmez. Faktörler: elektrik 0,479 kg/kWh (ekibin Excel'i), doğalgaz (9,5 kWh/Sm³ × 0,184) ve motorin (2,68 kg/L) IPCC tabanlı
    VARSAYIMDIR → resmî değerle değiştirilmeli. Parametreler, eylem listesi, risk (RVA) tablosu ve veri toplama listesi yalnızca tarayıcı localStorage'ındadır (`karbon_v1_*`), CSV indirilir.
    Envanter bölümü giriş ister (Elektrik/ISO ile aynı parola). Özet sayfasındaki Karbon kartı `Karbon.efElek()` kullanır.
  - **İzmir SECAP (2025–2050) entegrasyonu (Karbon sekmesi)**: `data/secap_izmir.json` (`collector/secap_izmir_to_json.py "<SECAP raporu.md>"`) — kent envanteri 2018–2024 (Tablo 10-11, sanayi/havacılık hariç ve dahil),
    hedefler (2018 baz; 2030 −%40, 2050 −%80), BAU/hedef projeksiyonu, ilçe iklim kırılganlık endeksi (Tablo 28), SECAP eylem kataloğu (33 azaltım, 28 uyum, 3 enerji yoksulluğu: kod/ad/sektör/azaltım hedefi;
    eylem içerikleri ALINMAZ). Karbon sekmesinde "İzmir SECAP referansı" + "SECAP eylem kataloğu" bölümleri (giriş gerekmez), envanter şablonu SECAP sektörleriyle, eylem listesinde "SECAP kodu", RVA tehlikeleri SECAP'ın 4 ana
    tehlikesiyle hizalı, Harita'da "İklim kırılganlığı" ilçe katmanı. Yayın hakları İBB'ye aittir (kaynak panelde gösterilir). Kurumsal envanterin baz yılı (ilk tam yıl) SECAP'ın 2018'inden farklıdır. Rapor elektrik faktörünün
    sayısal değerini vermez (ETKB belgesine atıf) → resmî faktör kullanıcıdan alınmalı.
  - **Dijital ikiz ve yatırım senaryoları** (`ikiz.js`, ISO sekmesinde "Dijital ikiz…" bölümü, seçili tesis için): son tam yılın aylık elektrik/doğalgaz profilinden kurulan sayısal ikiz;
    kaldıraçlar: çatı GES (Buca: Huzurevi 120 + Aşevi 225 + Kapalı Spor Salonu 240 kW = performans.json "planlanan"; Buz Sporları 100 kW VARSAYIM; verim = panelin 2023-2025 gerçek kWh/kW'ı, aylık mahsuplaşma),
    yalıtım, kazan/kaskad, ısı pompası, bina otomasyonu, LED, soğutma. Tasarruf oranları tipik değer VARSAYIMIDIR (düzenlenebilir). Fiyat ve yatırım TL alanları yalnız tarayıcıda (`iso_ikiz_v1`), siteye/depoya yazılmaz.
    Çıktı: tüketim/CO₂ şimdi–senaryo, SVG tesis şeması, aylık grafik, CSV ve yazdırılabilir yönetim özeti; ISO planındaki tamamlanmamış eylemlerin planlanan tasarrufu ayrıca listelenir.
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
  - **Huawei FusionSolar (geçici web girişi, `.github/workflows/huawei-veri.yml` = "Huawei Veri Çek", saatlik 06:37–20:37 TR + elle)**: `scripts/fusionsolar_fetch.mjs` Playwright ile
    `intl.fusionsolar.huawei.com`'a Secrets `FS_USER`/`FS_PASS` ile girer (salt-okur kullanıcı önerilir), `scripts/fusionsolar_collect.js` portal içinde okur, temizlenmiş sonucu `data/huawei.json`
    (+ `data/huawei-gunluk.csv` günlük arşiv) yazar. `loadLive()` (`index.html`) `huaweiCanli()` ile bunu durum.json biçimine çevirip `window.CANLI`'ya ekler (kaynak "Huawei"; ad, panelde kayıtlı Huawei adına
    Türkçe karakter/`TR-` farkı yok sayılarak eşlenir; veri 4 saatten eskiyse ya da `lastError` varsa "Kontrol Edilmedi" + kaynak çubuğunda hata). **Devre kesici:** art arda 3 hatadan sonra otomatik çalışma girişi
    denemez (hesap kilitlenmesin); Actions'tan elle çalıştırınca yeniden dener. Captcha çıkarsa AŞILMAZ, hata yazılır. **DENENDİ (24.10.2026): GitHub runner'ında `intl.fusionsolar.huawei.com` çözülemedi (ERR_NAME_NOT_RESOLVED) → GitHub-hosted çalışmaz; zamanlayıcı kapatıldı.** Giriş denemesine hiç ulaşılmadığı için hesap riski yok. Çalışması için Türkiye'den çıkan self-hosted runner gerekir (`runs-on: self-hosted`, cron satırlarını aç).
    **Hassas tesis:** Çiğli Sosyal Hizmet Binası (kadın sığınağı) — gerçek FusionSolar adı depoya YAZILMAZ (`scripts/tesis_ayarlari.json` anahtarı SHA-256), takma adla görünür, koordinat/adres yayımlanmaz
    (`santral_konumlari.json`'da `gizli: true`, ilçe merkezi; Harita'da işaretçi çizilmez). Ayarda olmayan, adında "sığınma/konukevi" geçen yeni tesis de otomatik gizlenir. Eski git geçmişinde ad/koordinat hâlâ görünür (commit 0f6b302, b58ec96).
    Paket belgeleri: `docs/HUAWEI_KURULUM_PAKETI.md`, `docs/fusionsolar_web_sinyal_eslemesi.csv`. E-posta alarmı (`alarm.py`) henüz Huawei'yi kapsamaz.
- `collector/alarm.py` — **e-posta alarmı** (Gmail SMTP, `veri-cek.yml`'de toplayıcıdan sonra, `continue-on-error`). Gündüz (`gunduz_mu`) bir invertör
  (invertörü olmayan santral için santral) "Haberleşme Yok"/"Arızalı" ise ve **art arda 2 turda** öyleyse BİR kez mesaj atar; sürerse tekrar yok
  (24 saatte bir hatırlatma), düzelince "giderildi" mesajı. Bir portala art arda erişilemezse o da alarm. Portal hatasında o portalın
  santralleri belirsiz sayılır. Gönderim başarısızsa "bildirildi" işaretlenmez, sonraki turda yeniden denenir. Durum: `data/alarm_durum.json`
  (bot commit'ler; kimlik bilgisi yok). Secrets: `GMAIL_USER`, `GMAIL_APP_PASS` (Gmail uygulama şifresi), `ALARM_ALICILAR` (virgülle ayrılmış).
  Alıcılar ve şifre günlüğe yazılmaz (Actions günlükleri herkese açık). Deneme: Actions → GES Veri Çek → Run workflow → `test_mail` işaretli.
- `.github/workflows/veri-cek.yml` — TR 06:07–20:07 arası saatlik (`7 3-17 * * *` UTC) + elle çalıştırma.
  Secrets: `GOODWE_USER`, `GOODWE_PASS`, `SMA_USER`, `SMA_PASS`. Huawei için ayrı workflow ve `FS_USER`, `FS_PASS` (yukarıda).
- `.github/workflows/static.yml` — Pages yayını (tüm depo); `workflow_run` ile veri toplayıcı bitince de tetiklenir.
  Not: yeni bir workflow dosyası `main`'de olmadan elle başlatılamaz; denemeler için `veri-cek.yml`'e geçici adım eklenip dalda çalıştırıldı.

## Durum (17.10.2026)

- GoodWe (9 santral, invertörlü) ve SMA (2 santral) canlı çalışıyor. Panel 21 santrali Excel verisiyle izliyor.
- **Gece/gündüz kuralı:** SEMS geceleri santrale ve invertörlere -1 (çevrimdışı) verir. `gunduz_mu()` İzmir güneş
  doğuş/batışına (1 saat pay) göre hesaplar; -1 yalnızca gündüz "Haberleşme Yok" sayılır, geceleri "Beklemede".
- SEMS invertör kodları: 1=Çalışıyor, 0=Beklemede, -1=Haberleşme Yok, 2=Arızalı.
- Panelde 7 Huawei santrali var (`huawei.json` altyapısı hazır ama GitHub'dan çalışmıyor → elle takip): Buca Toros, Aliağa KM, Bornova KM, Çiğli Aile Danışma, Gümüldür, Selçuk İtfaiye, Örnekköy.
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
