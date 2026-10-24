# Huawei GES verisi — geçici otomatik çekim (Northbound API gelene kadar)

## Nasıl çalışır

1. GitHub Actions, 06:00–20:30 arasında her 30 dakikada bir arka planda bir tarayıcı (Playwright) açar.
2. FusionSolar'a GitHub "Secret" olarak saklanan kullanıcı adı ve şifreyle giriş yapar.
3. Portalın kendi kullandığı uçlardan veriyi okur: tesis listesi, günlük eğri, inverter ve PV dizi değerleri.
4. Hassas alanları temizler, sonucu `data/huawei.json` dosyasına yazar ve repo'ya kaydeder.
5. `huawei.html` (ya da mevcut panonuz) bu JSON'u okur.

FusionSolar şifresi panoya ya da tarayıcıya hiç gelmez; yalnızca GitHub'ın şifreli Secrets alanında durur.

## Dosyalar

| Dosya | Görevi |
|---|---|
| `.github/workflows/huawei-veri.yml` | Zamanlayıcı (her 30 dk) |
| `scripts/fusionsolar_fetch.mjs` | Giriş yapar, veriyi çeker, temizler, kaydeder |
| `scripts/fusionsolar_collect.js` | Portal içinde çalışan okuma kodu (sadece okur) |
| `scripts/tesis_ayarlari.json` | Görünen tesis adı, konum gizleme, kWp bilgisi |
| `data/huawei.json` | Panonun okuduğu veri (şu an örnek veri, ilk çalışmada güncellenir) |
| `data/huawei-gunluk.csv` | Her gün için tesis bazında günlük kWh arşivi (otomatik oluşur) |
| `huawei.html` | Hazır pano sayfası |
| `docs/fusionsolar_web_sinyal_eslemesi.csv` | Modbus register ↔ FusionSolar sinyal kimliği eşlemesi |

## Kurulum (yalnızca GitHub web arayüzü)

**1. Dosyaları yükleyin**

`gesizleme` repo'sunda **Add file → Upload files** seçin. `scripts`, `data`, `docs` klasörlerini ve `huawei.html` dosyasını sürükleyip **Commit changes** deyin.

`.github` klasörü gizli olduğu için sürükle-bırakta görünmeyebilir. O durumda:

- **Add file → Create new file** seçin.
- Dosya adı kutusuna tam olarak `.github/workflows/huawei-veri.yml` yazın.
- `huawei-veri.yml` dosyasının içeriğini yapıştırıp **Commit** deyin.

**2. Şifreyi Secret olarak ekleyin**

**Settings → Secrets and variables → Actions → New repository secret** yolunu izleyin ve iki kayıt ekleyin:

- `FS_USER` — FusionSolar kullanıcı adı
- `FS_PASS` — FusionSolar şifresi

> Öneri: Ana hesap yerine FusionSolar'da **yalnızca görüntüleme yetkili ayrı bir kullanıcı** açıp onu kullanın. Böylece şifre değişse ya da hesap kilitlense ana hesabınız etkilenmez. Bu kullanıcı **Sistem → Kullanıcı yönetimi** altından açılabilir; menü adı hesaba göre farklı olabilir.

**3. Actions'a yazma izni verin**

**Settings → Actions → General → Workflow permissions** altında **Read and write permissions** seçip kaydedin.

**4. İlk çalıştırma**

**Actions** sekmesinde **Huawei FusionSolar veri cekimi (gecici)** iş akışını açın ve **Run workflow** deyin. Yaklaşık 1–2 dakikada yeşil tik çıkmalı ve `data/huawei.json` güncellenmeli.

**5. Panoyu açın**

`https://<kullanıcı-adınız>.github.io/gesizleme/huawei.html`

Mevcut "GES İzleme" bölümünüzden bu sayfaya bağlantı verebilir ya da aynı `data/huawei.json` dosyasını mevcut panonuzda okutabilirsiniz.

## Yayımlanan veride gizlenenler

- **Adresler:** tüm tesislerde kaldırılır.
- **Hassas tesis:** takma adla görünür, koordinatı ve adresi yayımlanmaz (ayar `scripts/tesis_ayarlari.json`, anahtar SHA-256 olarak tutulur; gerçek ad depoya yazılmaz).
- **Koordinatlar:** diğer tesislerde 3 haneye (~100 m) yuvarlanır.
- **Cihaz kimlikleri:** FusionSolar cihaz kimlikleri (DN) yayımlanmaz.

Bunu ayarlamak için `scripts/tesis_ayarlari.json` dosyasını düzenleyin. Yeni bir tesis eklendiğinde de buraya bir satır eklemeniz yeterli.

> **Not:** GitHub Pages ücretsiz planda repo herkese açıktır. Panonuzdaki şifre ekranı yalnızca sayfayı gizler; `data/huawei.json` adresini bilen herkes dosyayı açabilir. Bu yüzden yayına çıkan veri yukarıdaki gibi temizlenir.

## Bilinen sınırlar ve riskler

- **Resmî olmayan yöntem.** Portalın iç uçları Huawei güncellemeleriyle değişebilir. O durumda iş akışı kırmızıya döner, pano eski veriyi "son çekim başarısız" uyarısıyla göstermeye devam eder.
- **Doğrulama kodu (captcha).** Çok sık ya da hatalı giriş denemesinde FusionSolar doğrulama kodu isteyebilir. Betik bunu algılar ve durur; kodu atlatmaya çalışmaz. Böyle bir durumda tarayıcıdan bir kez elle giriş yapın. Sorun sürerse `huawei-veri.yml` içindeki `*/30` değerini `0` yapın (saatte bir).
- **Oturum çakışması.** Aynı hesapla tarayıcıdan da giriş yapıyorsanız, FusionSolar ayarlarına bağlı olarak oturumlardan biri düşebilir. Ayrı kullanıcı açmak bu sorunu da çözer.
- **Kullanım koşulları.** Bu yöntem Huawei'nin desteklediği bir entegrasyon değildir. Veri İZBB'nin kendi tesislerine ait olsa da kalıcı çözüm olarak kullanılmamalıdır.
- **Zamanlama gecikmesi.** GitHub zamanlanmış işleri yoğunlukta birkaç dakika gecikmeli çalıştırabilir.

## Northbound API gelince

Yalnızca `scripts/fusionsolar_fetch.mjs` içindeki giriş ve okuma kısmı Northbound çağrılarıyla (`getStationList`, `getDevRealKpi`, `getKpiStationDay` …) değiştirilir. `data/huawei.json` biçimi aynı kaldığı sürece panoya dokunmak gerekmez.
