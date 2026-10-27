-- Enerji analizörü / süzme sayaç ölçümleri (Modbus okuyucu → Supabase → panel "Ölçüm" sekmesi).
-- Önce kurulum.sql ve eylem_takip.sql çalışmış olmalı. Supabase → SQL Editor → New query → tamamını yapıştırıp RUN.
-- Güvenlik: bu tablolar HERKESE AÇIK DEĞİLDİR (anon okuyamaz/yazamaz).
--   Okuma : giriş yapmış, profili olan herkes.   Yazma: yalnız 'toplayici' (okuyucu bilgisayarın hesabı) ve 'yonetici'.

-- 1) Yeni rol: toplayici (binadaki okuyucu betiğin hesabı; GES/ISO verisini DEĞİŞTİREMEZ, yalnız ölçüm tablolarına yazar)
alter table public.profiller drop constraint if exists profiller_rol_check;
alter table public.profiller add constraint profiller_rol_check check (rol in ('okuyucu', 'girisci', 'yonetici', 'toplayici'));

create or replace function public.olcum_yazabilir() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiller where user_id = auth.uid() and rol in ('toplayici', 'yonetici'))
$$;

-- 2) Ölçüm noktası kaydı (şartname 3.3: tesis adı – kat/mahal – pano no kodu)
create table if not exists public.olcum_nokta (
  kod         text primary key check (char_length(kod) between 1 and 80),
  ad          text,
  tesis       text,
  cihaz_tipi  text not null default 'analizor' check (cihaz_tipi in ('analizor', 'sayac_ct', 'sayac_dogrudan', 'osos')),
  profil      text,                      -- okuyucudaki kayıt haritası adı (ör. entes_mpr)
  guncelleme  timestamptz default now()
);

-- 3) Son (anlık) değer: nokta başına tek satır, her okumada üzerine yazılır
create table if not exists public.olcum_son (
  nokta_kod  text primary key references public.olcum_nokta(kod) on delete cascade,
  zaman      timestamptz not null,
  durum      text not null check (durum in ('cevrimici', 'cevrimdisi')),
  deger      jsonb                       -- {v_l1, i_l1, p_top, pf_top, thd_i_l1, e_tuketim_wh, ...} (profildeki standart anahtarlar)
);

-- 4) 15 dakikalık özet (grafikler ve kWh hesabı bundan; sayaç farkı = tüketim)
create table if not exists public.olcum_15dk (
  nokta_kod            text not null references public.olcum_nokta(kod) on delete cascade,
  donem                timestamptz not null,           -- pencere başlangıcı (UTC)
  olcum_sayisi         int,
  ort_p_w              double precision,
  maks_p_w             double precision,
  ort_q_var            double precision,
  ort_pf               double precision,
  ort_v                double precision,
  ort_i_a              double precision,
  maks_i_a             double precision,
  maks_thd_i           double precision,
  maks_thd_v           double precision,
  e_tuketim_wh         numeric,                        -- pencere sonundaki toplam sayaç (Wh)
  e_verilen_wh         numeric,
  e_reaktif_ind_varh   numeric,
  e_reaktif_kap_varh   numeric,
  primary key (nokta_kod, donem)
);
create index if not exists olcum_15dk_donem_idx on public.olcum_15dk (donem desc);

alter table public.olcum_nokta enable row level security;
alter table public.olcum_son   enable row level security;
alter table public.olcum_15dk  enable row level security;

drop policy if exists "nokta okuma" on public.olcum_nokta;
drop policy if exists "nokta yazma" on public.olcum_nokta;
drop policy if exists "son okuma"   on public.olcum_son;
drop policy if exists "son yazma"   on public.olcum_son;
drop policy if exists "15dk okuma"  on public.olcum_15dk;
drop policy if exists "15dk yazma"  on public.olcum_15dk;

create policy "nokta okuma" on public.olcum_nokta for select to authenticated using (public.okuyabilir());
create policy "nokta yazma" on public.olcum_nokta for all    to authenticated using (public.olcum_yazabilir()) with check (public.olcum_yazabilir());
create policy "son okuma"   on public.olcum_son   for select to authenticated using (public.okuyabilir());
create policy "son yazma"   on public.olcum_son   for all    to authenticated using (public.olcum_yazabilir()) with check (public.olcum_yazabilir());
create policy "15dk okuma"  on public.olcum_15dk  for select to authenticated using (public.okuyabilir());
create policy "15dk yazma"  on public.olcum_15dk  for all    to authenticated using (public.olcum_yazabilir()) with check (public.olcum_yazabilir());

-- 5) (İsteğe bağlı) Eski özetleri temizleme: 2 yıldan eskiyi sil. Ücretsiz planda yer dolmasın diye yılda bir elle çalıştırın:
--   delete from public.olcum_15dk where donem < now() - interval '2 years';
