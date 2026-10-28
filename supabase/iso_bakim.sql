-- ISO 50001 bakım, kalibrasyon ve yetkinlik kayıtları: İBB-FRM-08-02 Periyodik Bakım, İBB-FRM-08-03 Kalibrasyona Tabi Cihazlar, İBB-LST-07-01 Görev Bazlı Yetkinlik.
-- Önce kurulum.sql, eylem_takip.sql ve iso_kayit.sql çalışmış olmalı (okuyabilir(), yazabilir(), yonetici(), iso_gecmis ve iso_kayit_tetik() oradan gelir).
-- Supabase → SQL Editor → New query → tamamını yapıştırıp RUN. Tekrar çalıştırmak zararsızdır.
--
-- Güvenlik: tablolar HERKESE AÇIK DEĞİLDİR (anon göremez/yazamaz). Okuma: giriş yapmış, profili olan herkes. Yazma: girisci ve yonetici.
--   Silme: yalnız yonetici (panel silmeyi sunmaz; kayıtlar "pasife alınır"). Her değişiklik `iso_gecmis`'e sunucuda yazılır.
--   Kişi adı tutulmaz: yetkinlik matrisi GÖREV bazlıdır (Enerji Ekip Lideri, Enerji Yöneticileri …); sorumlu alanı serbest metindir (unvan yazılması önerilir).

-- ---------- 1) FRM-08-02 Periyodik Bakım (cihaz/hizmet + yıllık planlanan/yapılan adet) ----------
create table if not exists public.iso_bakim (
  id               bigserial primary key,
  tesis            text not null check (tesis in ('aassm', 'buz', 'buca')),
  ad               text not null check (char_length(ad) between 1 and 300),      -- cihaz adı / bakım türü
  grup             text,                                                         -- ör. Makine bakımları, Elektrik-elektronik bakımları
  yer              text,                                                         -- bulunduğu yer / bölüm
  periyot_ay       int  check (periyot_ay between 1 and 60),                     -- periyodik bakım sıklığı (ay)
  son_bakim        date,
  sonraki_bakim    date,                                                         -- boşsa son bakım + periyottan SUNUCUDA hesaplanır
  sorumlu          text,
  aciklama         text check (char_length(aciklama) <= 2000),
  yil              int  check (yil between 2000 and 2100),                       -- yıllık gerçekleşme özeti (Excel'deki "2025 periyodik bakım verileri")
  planlanan        int  check (planlanan >= 0),
  yapilan          int  check (yapilan >= 0),
  aktif            boolean not null default true,
  guncelleyen      uuid,
  guncelleme       timestamptz not null default now(),
  olusturma        timestamptz not null default now()
);
create index if not exists iso_bakim_tesis_idx on public.iso_bakim (tesis, yil);

-- ---------- 2) FRM-08-03 Kalibrasyona Tabi Cihazlar ----------
create table if not exists public.iso_kalibrasyon (
  id                  bigserial primary key,
  tesis               text not null check (tesis in ('aassm', 'buz', 'buca')),
  ad                  text not null check (char_length(ad) between 1 and 300),  -- cihaz adı
  seri_no             text,
  durum               text not null default 'aktif' check (durum in ('aktif', 'bakimda', 'devre_disi')),
  periyot_ay          int  check (periyot_ay between 1 and 120),
  son_kalibrasyon     date,
  sonraki_kalibrasyon date,                                                      -- boşsa son kalibrasyon + periyottan SUNUCUDA hesaplanır
  sertifika_no        text,
  yer                 text,
  sorumlu             text,
  aciklama            text check (char_length(aciklama) <= 2000),
  aktif               boolean not null default true,
  guncelleyen         uuid,
  guncelleme          timestamptz not null default now(),
  olusturma           timestamptz not null default now()
);
create index if not exists iso_kalibrasyon_tesis_idx on public.iso_kalibrasyon (tesis);

-- ---------- 3) LST-07-01 Görev Bazlı Yetkinlik (görev × konu; 0 hiç … 4 çok iyi) ----------
create table if not exists public.iso_yetkinlik (
  id            bigserial primary key,
  konu          text not null unique check (char_length(konu) between 1 and 300),
  m_lider       int check (m_lider between 0 and 4),      -- mevcut: Enerji Ekip Lideri
  m_yonetici    int check (m_yonetici between 0 and 4),   -- Enerji Yöneticileri
  m_uye         int check (m_uye between 0 and 4),        -- Enerji Ekip Üyesi
  m_bina        int check (m_bina between 0 and 4),       -- Bina Sorumluları (idari ve teknik)
  m_diger       int check (m_diger between 0 and 4),      -- Diğer Çalışanlar
  h_lider       int check (h_lider between 0 and 4),      -- hedeflenen
  h_yonetici    int check (h_yonetici between 0 and 4),
  h_uye         int check (h_uye between 0 and 4),
  h_bina        int check (h_bina between 0 and 4),
  h_diger       int check (h_diger between 0 and 4),
  sira          int,
  aktif         boolean not null default true,
  guncelleyen   uuid,
  guncelleme    timestamptz not null default now(),
  olusturma     timestamptz not null default now()
);

-- Sonraki tarih sunucuda: son tarih + periyot (kullanıcı elle bir tarih yazdıysa ona dokunulmaz)
create or replace function public.iso_bakim_hesapla() returns trigger
language plpgsql as $$
begin
  if tg_table_name = 'iso_bakim' then
    if new.sonraki_bakim is null and new.son_bakim is not null and new.periyot_ay is not null then
      new.sonraki_bakim := (new.son_bakim + make_interval(months => new.periyot_ay))::date;
    end if;
  elsif tg_table_name = 'iso_kalibrasyon' then
    if new.sonraki_kalibrasyon is null and new.son_kalibrasyon is not null and new.periyot_ay is not null then
      new.sonraki_kalibrasyon := (new.son_kalibrasyon + make_interval(months => new.periyot_ay))::date;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists iso_bakim_hesapla_t on public.iso_bakim;
create trigger iso_bakim_hesapla_t before insert or update on public.iso_bakim for each row execute function public.iso_bakim_hesapla();
drop trigger if exists iso_kalibrasyon_hesapla_t on public.iso_kalibrasyon;
create trigger iso_kalibrasyon_hesapla_t before insert or update on public.iso_kalibrasyon for each row execute function public.iso_bakim_hesapla();

-- ---------- Geçmiş tetikleyicileri + RLS (iso_kayit.sql ile aynı kurallar) ----------
do $$
declare t text;
begin
  foreach t in array array['iso_bakim', 'iso_kalibrasyon', 'iso_yetkinlik'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_z_gecmis', t);
    execute format('create trigger %I before insert or update or delete on public.%I for each row execute function public.iso_kayit_tetik()', t || '_z_gecmis', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "okuma" on public.%I', t);
    execute format('drop policy if exists "ekleme" on public.%I', t);
    execute format('drop policy if exists "guncelleme" on public.%I', t);
    execute format('drop policy if exists "silme" on public.%I', t);
    execute format('create policy "okuma" on public.%I for select to authenticated using (public.okuyabilir())', t);
    execute format('create policy "ekleme" on public.%I for insert to authenticated with check (public.yazabilir())', t);
    execute format('create policy "guncelleme" on public.%I for update to authenticated using (public.yazabilir()) with check (public.yazabilir())', t);
    execute format('create policy "silme" on public.%I for delete to authenticated using (public.yonetici())', t);
  end loop;
end $$;
