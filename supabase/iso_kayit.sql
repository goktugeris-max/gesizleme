-- ISO 50001 kayıtları (Excel formlarının sisteme taşınması): bağlam, ilgili taraflar, yasal şartlar, risk/fırsat, eylemler; ölçüm noktası hiyerarşisi.
-- Önce kurulum.sql, eylem_takip.sql, olcum.sql çalışmış olmalı (okuyabilir(), yazabilir(), yonetici(), olcum_nokta oradan gelir).
-- Supabase → SQL Editor → New query → tamamını yapıştırıp RUN. Tekrar çalıştırmak zararsızdır.
--
-- Güvenlik: tablolar HERKESE AÇIK DEĞİLDİR (anon göremez/yazamaz).
--   Okuma: giriş yapmış, profili olan herkes.  Yazma: girisci ve yonetici.  Silme: yalnız yonetici (panel silmeyi sunmaz; kayıtlar "pasife alınır" — PR.07.01 4.10).
--   Her ekleme/değişiklik/silme `iso_gecmis`'e sunucuda yazılır (kim, ne zaman, eski/yeni değer); geçmiş değiştirilemez.
--   Risk skoru (olasılık × etki), seviye ve eylem tamamlanma kuralı SUNUCUDA hesaplanır (istemci değeri yok sayılır).

-- ---------- Ortak: geçmiş ----------
create table if not exists public.iso_gecmis (
  id        bigserial primary key,
  zaman     timestamptz not null default now(),
  kim       uuid,
  kim_ad    text,
  tablo     text not null,
  kayit_id  text not null,
  islem     text not null,
  eski      jsonb,
  yeni      jsonb
);
create index if not exists iso_gecmis_idx on public.iso_gecmis (tablo, kayit_id, zaman desc);
alter table public.iso_gecmis enable row level security;
drop policy if exists "iso gecmis okuma" on public.iso_gecmis;
create policy "iso gecmis okuma" on public.iso_gecmis for select to authenticated using (public.okuyabilir());

create or replace function public.iso_kim_ad() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select ad from public.profiller where user_id = auth.uid()), '')
$$;

-- Tüm iso_* kayıt tablolarında: kim/ne zaman damgası + geçmiş
create or replace function public.iso_kayit_tetik() returns trigger
language plpgsql security definer set search_path = public as $$
declare k text;
begin
  if tg_op = 'DELETE' then
    k := old.id::text;
    insert into public.iso_gecmis (kim, kim_ad, tablo, kayit_id, islem, eski) values (auth.uid(), public.iso_kim_ad(), tg_table_name, k, 'DELETE', to_jsonb(old));
    return old;
  end if;
  new.guncelleyen := auth.uid();
  new.guncelleme := now();
  k := new.id::text;
  insert into public.iso_gecmis (kim, kim_ad, tablo, kayit_id, islem, eski, yeni)
    values (auth.uid(), public.iso_kim_ad(), tg_table_name, k, tg_op, case when tg_op = 'UPDATE' then to_jsonb(old) end, to_jsonb(new));
  return new;
end $$;

-- ---------- 1) FRM.04.01 Kuruluşun Bağlamı + FRM.04.05 İç ve Dış Hususlar ----------
create table if not exists public.iso_baglam (
  id            bigserial primary key,
  kaynak        text not null default 'FRM.04.01' check (kaynak in ('FRM.04.01', 'FRM.04.05')),
  tip           text not null check (tip in ('guclu', 'zayif', 'firsat', 'tehdit', 'ic', 'dis')),   -- SWOT dörtlüsü, iç/dış husus
  madde         text not null check (char_length(madde) between 1 and 1000),
  tesis         text check (tesis in ('aassm', 'buz', 'buca')),                                      -- boş = kurum geneli
  etki          int  check (etki between 1 and 5),                                                    -- etki derecesi (1 düşük – 5 yüksek)
  not_          text check (char_length(not_) <= 2000),
  sira          int,
  aktif         boolean not null default true,
  gozden_gecirme date,
  guncelleyen   uuid,
  guncelleme    timestamptz not null default now(),
  olusturma     timestamptz not null default now()
);
create index if not exists iso_baglam_tip_idx on public.iso_baglam (tip, sira);

-- ---------- 2) FRM.04.02 İlgili Taraflar ----------
create table if not exists public.iso_taraf (
  id                  bigserial primary key,
  sira                int,
  taraf               text not null check (char_length(taraf) between 1 and 300),
  beklenti            text check (char_length(beklenti) <= 2000),      -- ihtiyaç/beklenti
  yonetim             text check (char_length(yonetim) <= 1000),       -- beklentinin karşılanma yönetimi (süreç)
  surec               text,
  sorumlu             text,                                            -- takip sorumlusu
  ilgili_dokuman      text,
  izleme_periyodu     text,                                            -- ör. Yıllık, 6 aylık, Sürekli
  son_gozden_gecirme  date,
  tesis               text check (tesis in ('aassm', 'buz', 'buca')),
  aktif               boolean not null default true,
  guncelleyen         uuid,
  guncelleme          timestamptz not null default now(),
  olusturma           timestamptz not null default now()
);

-- ---------- 3) FRM.04.03 Yasal ve Diğer Şartlara Uygunluk Takip ----------
create table if not exists public.iso_yasal (
  id               bigserial primary key,
  yonetmelik       text not null check (char_length(yonetmelik) between 1 and 500),
  yayin_tarihi     date,
  son_revizyon     date,
  resmi_gazete     text,
  bolum_no         text,
  bolum_ad         text,
  madde_no         text,
  madde_ad         text,
  madde_metni      text check (char_length(madde_metni) <= 4000),
  periyot          text,                                              -- geçerlilik süresi / takip periyodu
  mevcut_durum     text check (char_length(mevcut_durum) <= 2000),
  ilgili_dokuman   text,
  uygunluk         text not null default 'izlemede' check (uygunluk in ('uygun', 'kismen', 'uygun_degil', 'izlemede')),
  son_kontrol      date,
  sonraki_kontrol  date,
  sorumlu          text,
  aktif            boolean not null default true,
  guncelleyen      uuid,
  guncelleme       timestamptz not null default now(),
  olusturma        timestamptz not null default now()
);
create index if not exists iso_yasal_yon_idx on public.iso_yasal (yonetmelik);

-- ---------- 4) FRM.06.01 Risk ve Fırsat Değerlendirmesi ----------
create table if not exists public.iso_risk (
  id               bigserial primary key,
  tesis            text not null default 'genel' check (tesis in ('genel', 'aassm', 'buz', 'buca')),
  no               text,
  proses           text,
  tur              text not null default 'Risk' check (tur in ('Risk', 'Fırsat')),
  kaynak           text,
  tanim            text not null check (char_length(tanim) between 1 and 2000),
  olasilik         int check (olasilik between 1 and 5),
  etki             int check (etki between 1 and 5),
  skor             int check (skor between 0 and 25),                 -- SUNUCUDA: olasılık × etki
  seviye           text,                                              -- SUNUCUDA: ≥12 Yüksek, 6–11 Orta, ≤5 Düşük
  aksiyon          text check (char_length(aksiyon) <= 4000),
  sorumlu          text,
  faaliyet         text check (char_length(faaliyet) <= 4000),        -- sistematik faaliyetler
  termin           date,
  durum            text not null default 'acik' check (durum in ('acik', 'izlemede', 'kapali')),
  sonra_olasilik   int check (sonra_olasilik between 1 and 5),
  sonra_etki       int check (sonra_etki between 1 and 5),
  sonra_skor       int check (sonra_skor between 0 and 25),           -- önlem sonrası kalan skor
  aktif            boolean not null default true,
  guncelleyen      uuid,
  guncelleme       timestamptz not null default now(),
  olusturma        timestamptz not null default now()
);
create index if not exists iso_risk_tesis_idx on public.iso_risk (tesis);

create or replace function public.iso_risk_hesapla() returns trigger
language plpgsql as $$
begin
  if new.olasilik is not null and new.etki is not null then
    new.skor := new.olasilik * new.etki;
  end if;                                     -- olasılık/etki yoksa içe aktarılan (Excel) skor korunur
  new.seviye := case when new.skor is null then null when new.skor >= 12 then 'Yüksek' when new.skor >= 6 then 'Orta' else 'Düşük' end;
  if new.sonra_olasilik is not null and new.sonra_etki is not null then
    new.sonra_skor := new.sonra_olasilik * new.sonra_etki;
  end if;
  return new;
end $$;
drop trigger if exists iso_risk_hesapla_t on public.iso_risk;
create trigger iso_risk_hesapla_t before insert or update on public.iso_risk for each row execute function public.iso_risk_hesapla();

-- ---------- 5) Eylemler (PLN.06.01'e panelden açılanlar; risk ya da hedeften) ----------
create table if not exists public.iso_eylem (
  id            bigserial primary key,
  tesis         text not null default 'genel' check (tesis in ('genel', 'aassm', 'buz', 'buca')),
  ad            text not null check (char_length(ad) between 1 and 500),
  aciklama      text check (char_length(aciklama) <= 4000),
  risk_id       bigint references public.iso_risk(id) on delete set null,
  hedef         text,                                                   -- bağlı enerji hedefi (serbest metin)
  sorumlu       text,
  termin        date,
  butce_tl      numeric(14, 2) check (butce_tl >= 0),
  durum         text not null default 'planli' check (durum in ('planli', 'devam', 'tamamlandi', 'iptal')),
  yuzde         int not null default 0 check (yuzde between 0 and 100),
  tamamlanma    date,
  aktif         boolean not null default true,
  guncelleyen   uuid,
  guncelleme    timestamptz not null default now(),
  olusturma     timestamptz not null default now()
);
create index if not exists iso_eylem_tesis_idx on public.iso_eylem (tesis);
create index if not exists iso_eylem_risk_idx on public.iso_eylem (risk_id);

-- Tamamlanma kuralı sunucuda: %100 ⇔ tamamlandı (iptal hariç); tamamlanma tarihi otomatik
create or replace function public.iso_eylem_hesapla() returns trigger
language plpgsql as $$
begin
  if new.durum = 'tamamlandi' then new.yuzde := 100;
  elsif new.yuzde = 100 and new.durum <> 'iptal' then new.durum := 'tamamlandi';
  elsif new.durum = 'planli' and new.yuzde > 0 then new.durum := 'devam';
  end if;
  if new.durum = 'tamamlandi' and new.tamamlanma is null then new.tamamlanma := current_date; end if;
  if new.durum <> 'tamamlandi' then new.tamamlanma := null; end if;
  return new;
end $$;
drop trigger if exists iso_eylem_hesapla_t on public.iso_eylem;
create trigger iso_eylem_hesapla_t before insert or update on public.iso_eylem for each row execute function public.iso_eylem_hesapla();

-- ---------- Geçmiş tetikleyicileri (hesaplamadan SONRA çalışsın: ad sırası) ----------
do $$
declare t text;
begin
  foreach t in array array['iso_baglam', 'iso_taraf', 'iso_yasal', 'iso_risk', 'iso_eylem'] loop
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

-- ---------- 6) Ölçüm noktası hiyerarşisi: tesis → bölüm → kat/mahal → pano → sayaç; enerji türü ----------
alter table public.olcum_nokta add column if not exists enerji_turu text not null default 'elektrik';
alter table public.olcum_nokta add column if not exists iso_bolum   text;      -- ISO 50001 serisindeki bölüm adı (ör. Huzurevi, Aşevi) — canlı referans karşılaştırması için
alter table public.olcum_nokta add column if not exists kat_mahal   text;
alter table public.olcum_nokta add column if not exists pano        text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'olcum_nokta_enerji_turu_check') then
    alter table public.olcum_nokta add constraint olcum_nokta_enerji_turu_check check (enerji_turu in ('elektrik', 'dogalgaz', 'su'));
  end if;
end $$;
