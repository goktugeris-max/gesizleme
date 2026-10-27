# Analizör / süzme sayaç okuyucu — kurulum

Amaç: şartnamedeki 5 enerji analizörü ve 50 süzme sayaçtan (RS-485 Modbus RTU → ağ geçidi → Modbus TCP) veriyi okuyup
Supabase'e yazmak; panelde **Ölçüm** sekmesi bunu gösterir. Cihaz markasından bağımsızdır: her cihaz tipi için `profiller/` altında bir
"kayıt haritası" (profil) vardır. Hazır profil: `entes_mpr` (Entes MPR-3x/4x, üretici register tablosundan).

## Parçalar
| Dosya | Görev |
|---|---|
| `profiller/entes_mpr.json` | Hangi adreste ne var (gerilim, akım, güç, enerji, THD…), tip ve çarpan |
| `olcum_modbus.py` | Modbus TCP istemcisi (yalnız standart kütüphane, kurulum gerektirmez) + kayıt çözücü |
| `olcum_oku.py` | Okuyucu: noktaları okur, Supabase'e (veya deneme için dosyaya) yazar |
| `olcum_sim.py` | Sahte analizör — cihaz gelmeden deneme |
| `olcum_test.py` | Testler (`python3 olcum_test.py`) |
| `noktalar.ornek.json` | Nokta listesi örneği (gerçek IP'ler `noktalar.yerel.json`'a yazılır, depoya girmez) |
| `../../supabase/olcum.sql` | Veritabanı tabloları ve yetkiler |

## Cihazsız deneme (5 dk)
1. Terminal 1: `python3 olcum_sim.py --port 5020`
2. Terminal 2: `python3 olcum_oku.py --ayar noktalar.ornek.json --bir-tur --cikti son.json` → `son.json` içinde değerler görünür.
   (Örnekteki ikinci nokta için port 5021'de sim yoksa "okunamadı" yazar — çevrimdışı davranışı budur.)
3. Panelde Ölçüm sekmesi → "Örnek veriyle göster" arayüzü gösterir.

## Gerçek kurulum
1. Supabase → SQL Editor: `supabase/olcum.sql` dosyasını bir kez çalıştırın.
2. Supabase → Authentication → yeni kullanıcı oluşturun (okuyucu bilgisayar için, e-posta + uzun parola). Sonra `profiller` tablosuna bu kullanıcı için `rol = 'toplayici'` satırı ekleyin
   (SQL: `insert into public.profiller (user_id, ad, rol) select id, 'Okuyucu', 'toplayici' from auth.users where email = '<o e-posta>';`).
3. Binadaki (veya Türkiye'den çıkan sürekli açık) bilgisayara bu klasörü kopyalayın; `noktalar.ornek.json`'u `noktalar.yerel.json` olarak kopyalayıp gerçek IP/port/birim (slave adresi) ve nokta kodlarını yazın.
4. Ortam değişkenleri: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (supabase-ayar.js'teki herkese açık anahtar), `OLCUM_EPOSTA`, `OLCUM_SIFRE`. `service_role` anahtarı KULLANILMAZ.
5. Çalıştırma: `python3 olcum_oku.py --ayar noktalar.yerel.json --surekli --aralik 60` (açılışta otomatik başlaması için systemd/Görev Zamanlayıcı).

## Yeni cihaz modeli eklemek
`profiller/` altına aynı biçimde yeni JSON koyun (`anahtar` adları standarttır: `v_l1`, `i_l1`, `p_top`[W], `pf_top`, `thd_i_l1`, `e_tuketim_wh` …); nokta listesinde `"profil": "<dosya adı>"` yazın.
Süzgeç sayaçlarda harmonik kayıtları yoktur: profilde olmayan anahtar panelde "—" görünür (şartname: yazılım bu durumu ayırt etmeden işlemeli).
Modelde olmayan bir kayıt hata (istisna) verirse okuyucu onu atlar, kalanları okumaya devam eder.

## Bilinen noktalar
- Üretici tablosu: adresler 0 tabanlı, 32/64 bit değerlerde yüksek kelime önce (MSB first). Belge örneği (00 00 08 EE → 228,6 V) testle doğrulanır.
- Cihazın Modbus köle adresi, baud ve parite ayarları cihaz menüsünden/ayar kayıtlarından yapılır (bu paket ayar YAZMAZ, yalnız okur).
- Gerçek cihazla ilk denemede profildeki adresler/çarpanlar bir referans cihazla karşılaştırılmalıdır (şartname 5.1 ölçüm doğruluk kontrolü).
- 15 dakikalık özet yaklaşık 100 bayt/satırdır; 55 donanım noktası ≈ 200 MB/yıl. `olcum.sql` sonunda eski veriyi silme komutu var.
