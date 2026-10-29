-- ISO 50001 EnB yönetimi: EnB değişiklik defteri (ISO 50006), önemli enerji kullanımı SEU (ISO 50004/50001 6.3) ve ölçme-doğrulama M&V (ISO 50015).
-- Önce kurulum.sql, eylem_takip.sql ve iso_kayit.sql çalışmış olmalı (okuyabilir(), yazabilir(), yonetici(), iso_gecmis ve iso_kayit_tetik() oradan gelir).
-- Supabase → SQL Editor → New query → tamamını yapıştırıp RUN. Tekrar çalıştırmak zararsızdır.
--
-- Güvenlik: tablolar HERKESE AÇIK DEĞİLDİR (anon göremez/yazamaz). Okuma: giriş yapmış, profili olan herkes. Yazma: girisci ve yonetici.
--   Silme: yalnız yonetici (panel silmeyi sunmaz; kayıtlar "pasife alınır"). Her değişiklik `iso_gecmis`'e sunucuda yazılır.
--   Kişi adı tutulmaz (unvan yazılması önerilir).

-- ---------- 1) EnB değişiklik defteri: olağandışı dönem, model revizyonu, kapsam değişikliği, statik faktör ----------
create table if not exists public.iso_enb_defter (
  id          bigserial primary key,
  tesis       text not null check (tesis in ('aassm', 'buz', 'buca')),
  seri_id     text check (seri_id is null or char_length(seri_id) <= 40),            -- ISO serisi (ör. buca-6); boşsa tesis geneli
  tur         text not null check (tur in ('olagandisi', 'model_revizyon', 'kapsam', 'statik_faktor', 'diger')),
  baslangic   date,
  bitis       date,
  etki_kwh    numeric,                                                               -- tahmini etki (kWh eşdeğeri; + artış, − azalış); biliniyorsa
  karar       text not null default 'izlemede' check (karar in ('izlemede', 'dislandi', 'duzeltildi', 'revize_edildi', 'degisiklik_yok')),
  baslik      text not null check (char_length(baslik) between 1 and 300),
  aciklama    text check (char_length(aciklama) <= 3000),
  onaylayan   text,                                                                  -- unvan (kişi adı değil)
  onay_tarihi date,
  aktif       boolean not null default true,
  guncelleyen uuid,
  guncelleme  timestamptz not null default now(),
  olusturma   timestamptz not null default now(),
  check (bitis is null or baslangic is null or bitis >= baslangic)
);
create index if not exists iso_enb_defter_tesis_idx on public.iso_enb_defter (tesis, baslangic);

-- ---------- 2) SEU: önemli enerji kullanımı (yük grubu / sistem bazında yıllık tüketim, ilgili değişken, EnB yöntemi) ----------
create table if not exists public.iso_seu (
  id              bigserial primary key,
  tesis           text not null check (tesis in ('aassm', 'buz', 'buca')),
  ad              text not null check (char_length(ad) between 1 and 300),
  enerji          text not null default 'elektrik' check (enerji in ('elektrik', 'dogalgaz', 'diger')),
  olcum_kod       text,                                                              -- olcum_plan.kod (ölçülen analizör noktası); boş = ölçülmüyor/tahmin
  yillik_kwh      numeric check (yillik_kwh is null or yillik_kwh >= 0),             -- yıllık tüketim (kWh eşdeğeri); ölçüm ya da tahmin
  yontem          text not null default 'tahmin' check (yontem in ('olcum', 'hesap', 'tahmin')),
  degiskenler     text,                                                              -- ilgili değişkenler (CDD, HDD, ziyaretçi sayısı, doluluk …)
  enb_yontemi     text check (enb_yontemi is null or enb_yontemi in ('ortalama', 'regresyon', 'oran', 'yok')),
  seu_mu          boolean,                                                           -- ekip kararı; boşsa %80 kuralına göre panel önerir
  gerekce         text check (char_length(gerekce) <= 2000),
  aktif           boolean not null default true,
  guncelleyen     uuid,
  guncelleme      timestamptz not null default now(),
  olusturma       timestamptz not null default now()
);
create index if not exists iso_seu_tesis_idx on public.iso_seu (tesis, enerji);

-- ---------- 3) M&V (ISO 50015): bir eylemin tasarrufunun doğrulanması ----------
-- tasarruf = (baz tüketim + rutin düzeltme + rutin dışı düzeltme) − rapor dönemi tüketimi, SUNUCUDA hesaplanır.
--   rutin düzeltme: baz dönemi rapor dönemi koşullarına (hava, doluluk, üretim) getirmek için; rutin dışı: kapsam/kullanım değişimi.
--   belirsizlik: uyarlanmış baz tüketimin ±%'si; alt sınır pozitifse tasarruf belirsizlikten büyüktür (anlamlı).
create table if not exists public.iso_mv (
  id                   bigserial primary key,
  tesis                text not null check (tesis in ('aassm', 'buz', 'buca')),
  ad                   text not null check (char_length(ad) between 1 and 300),      -- eylem / önlem adı
  eylem_ref            text,                                                         -- PLN.06.01 eylem no ya da panel eylemi (serbest metin)
  sinir                text,                                                         -- ölçüm sınırı (ör. "Chiller-1 + pompalar")
  secenek              text not null default 'tum_tesis' check (secenek in ('izole_ana', 'izole_tum', 'tum_tesis', 'simulasyon')),
  baz_baslangic        date,
  baz_bitis            date,
  rapor_baslangic      date,
  rapor_bitis          date,
  baz_tuketim          numeric check (baz_tuketim is null or baz_tuketim >= 0),      -- kWh eşdeğeri
  rutin_duzeltme       numeric,                                                      -- kWh; + baz artar
  rutin_disi_duzeltme  numeric,                                                      -- kWh
  rapor_tuketim        numeric check (rapor_tuketim is null or rapor_tuketim >= 0),
  belirsizlik_yuzde    numeric check (belirsizlik_yuzde is null or belirsizlik_yuzde between 0 and 100),
  yontem_notu          text check (char_length(yontem_notu) <= 3000),                -- düzeltme modeli, sayaç doğruluğu, varsayımlar
  durum                text not null default 'plan' check (durum in ('plan', 'baz_olculdu', 'rapor_hazir', 'dogrulandi')),
  tasarruf_kwh         numeric,                                                      -- sunucuda hesaplanır
  tasarruf_yuzde       numeric,
  tasarruf_alt_kwh     numeric,
  anlamli              boolean,
  aktif                boolean not null default true,
  guncelleyen          uuid,
  guncelleme           timestamptz not null default now(),
  olusturma            timestamptz not null default now(),
  check (baz_bitis is null or baz_baslangic is null or baz_bitis >= baz_baslangic),
  check (rapor_bitis is null or rapor_baslangic is null or rapor_bitis >= rapor_baslangic)
);
create index if not exists iso_mv_tesis_idx on public.iso_mv (tesis, durum);

create or replace function public.iso_mv_hesapla() returns trigger
language plpgsql as $$
declare uyarlanmis numeric;
begin
  -- istemciden gelen hesap alanları yok sayılır
  new.tasarruf_kwh := null; new.tasarruf_yuzde := null; new.tasarruf_alt_kwh := null; new.anlamli := null;
  if new.baz_tuketim is not null and new.rapor_tuketim is not null then
    uyarlanmis := new.baz_tuketim + coalesce(new.rutin_duzeltme, 0) + coalesce(new.rutin_disi_duzeltme, 0);
    new.tasarruf_kwh := round(uyarlanmis - new.rapor_tuketim, 1);
    if uyarlanmis > 0 then new.tasarruf_yuzde := round((uyarlanmis - new.rapor_tuketim) / uyarlanmis * 100, 2); end if;
    if new.belirsizlik_yuzde is not null then
      new.tasarruf_alt_kwh := round(new.tasarruf_kwh - uyarlanmis * new.belirsizlik_yuzde / 100, 1);
      new.anlamli := new.tasarruf_alt_kwh > 0;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists iso_mv_hesapla_t on public.iso_mv;
create trigger iso_mv_hesapla_t before insert or update on public.iso_mv for each row execute function public.iso_mv_hesapla();

-- ---------- Geçmiş tetikleyicileri + RLS (iso_kayit.sql ile aynı kurallar) ----------
do $$
declare t text;
begin
  foreach t in array array['iso_enb_defter', 'iso_seu', 'iso_mv'] loop
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
