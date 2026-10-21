# Veri Girişi — Supabase kurulumu (bir kez, ~15 dk)

Bu modül GES aylık üretimini ve aylık incelemeyi siteden girmenizi sağlar. Girilen değerler Excel verisinin **üstüne** uygulanır
(panelde "Excel + Veri Girişi" yazar). Supabase ayarlanmazsa panel eskisi gibi yalnızca Excel verisiyle çalışır.

## Adımlar
1. https://supabase.com → hesap aç → **New project**. **Region: Frankfurt (eu-central-1)**. Veritabanı şifresini bir yere kaydedin (siteye yazılmaz).
2. **SQL Editor → New query** → `supabase/kurulum.sql` dosyasının tamamını yapıştır → **Run**. ("Success" görmelisiniz.)
3. **Authentication → Users → Add user → Create new user**: e-posta + şifre, **Auto Confirm User** işaretli.
   Her ekip arkadaşı için ayrı kullanıcı açın.
4. **SQL Editor**'da şunu kendi e-postanızla çalıştırın (sizi yönetici yapar):
   ```sql
   insert into public.profiller (user_id, ad, rol)
   select id, 'Ad Soyad', 'yonetici' from auth.users where email = 'sizin@eposta.com';
   ```
   Veri girecek diğer kişiler için aynısını `rol = 'girisci'` ile; yalnızca görecekler için `'okuyucu'`.
5. **Project Settings → API**: **Project URL** ve **anon public** anahtarını kopyalayın → `supabase-ayar.js` içine yazın (ya da Claude'a gönderin).
   **`service_role` anahtarını asla siteye/depoya/sohbete yazmayın.**
6. Siteyi yenileyin → **Veri Girişi** sekmesi → giriş yapın.

## Ortak eylem takibi (ISO) — ikinci SQL
`supabase/eylem_takip.sql` dosyasını da SQL Editor'da bir kez çalıştırın. ISO 50001 sekmesinde **Ortak takibe giriş** düğmesiyle aynı hesapla giriş yapınca eylem durumu, ilerleme, sorumlu,
not ve yorumlar ekiple paylaşılır. Bu tablolar herkese açık değildir (yalnız giriş yapmış kullanıcılar okur, `girisci`/`yonetici` yazar).

## Güvenlik özeti
- Tüm tablolarda satır bazlı yetki (RLS) açık. `anon` anahtarı yalnızca üretim ve inceleme verisini **okuyabilir** (zaten `performans.json` ile herkese açık veri).
- Yazma: yalnızca giriş yapmış ve rolü `girisci`/`yonetici` olanlar. Bu kural sunucuda zorlanır; tarayıcıyı kurcalamak işe yaramaz.
- Her ekleme/değişiklik/silme `degisiklik_gecmisi` tablosuna kullanıcıyla birlikte yazılır (sekmenin altında son 40 kayıt görünür).
- Elektrik ve ISO verisi bu veritabanına **konmaz**; şifreli statik dosyalarda kalır.
- Verinin AB (Frankfurt) bölgesinde bulutta durması kurumunuzun BT/KVKK politikasına uygun olmalıdır — kullanmadan önce onay alın.

## Yedekleme
Supabase panelinde **Table Editor → ... → Export to CSV**. Ücretsiz katmanda otomatik yedek sınırlıdır; ayda bir CSV indirmenizi öneririz.
