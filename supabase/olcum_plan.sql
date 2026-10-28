-- Ölçüm planı: AASSM ve Buz Sporları'na monte edilecek 34 adet akım trafolu analizör — nokta listesi, IP/Modbus ayarı, CT ayarı ve devreye alma durumu.
-- Önce kurulum.sql, olcum.sql ve iso_kayit.sql çalışmış olmalı (okuyabilir(), yazabilir(), yonetici(), olcum_nokta, iso_gecmis, iso_kayit_tetik() oradan gelir).
-- Supabase → SQL Editor → New query → tamamını yapıştırıp RUN. Tekrar çalıştırmak zararsızdır (34 nokta yalnız yoksa eklenir; girilmiş IP/CT bilgisine dokunulmaz).
--
-- IP adresleri ve CT oranları BU TABLODA tutulur (depoya/GitHub'a yazılmaz); tablo anon'a KAPALIDIR.
--   Okuma: giriş yapmış, profili olan herkes. Yazma: girisci ve yonetici. Silme: yalnız yonetici (panel silmeyi sunmaz; "pasife al").
--   Okuyucu (collector/olcum/olcum_oku.py --plan-db) IP'si girilmiş noktaları buradan okur; IP girilince nokta kendiliğinden okunmaya başlar.
--   iso_bolum YALNIZ "Ana giriş" noktalarında dolu: canlı referans karşılaştırması bölüm toplamını ana girişten alır (alt panolar eklenirse çift sayım olmasın).

create table if not exists public.olcum_plan (
  kod          text primary key check (char_length(kod) between 1 and 60),
  tesis        text not null check (tesis in ('aassm', 'buz', 'buca')),
  ad           text not null check (char_length(ad) between 1 and 300),
  yuk_grubu    text,
  kat_mahal    text,
  pano         text,
  iso_bolum    text,                                                  -- ISO serisindeki bölüm adı (yalnız ana giriş)
  profil       text not null default 'entes_mpr',
  host         text check (host is null or host ~ '^[A-Za-z0-9.-]{1,100}$'),   -- IP adresi ya da ağ adı
  port         int  not null default 502 check (port between 1 and 65535),
  birim        int  not null default 1 check (birim between 1 and 247),          -- Modbus köle adresi
  ct_primer    int  check (ct_primer between 1 and 100000),           -- CT oranı: primer (ör. 400)
  ct_sekonder  int  not null default 5 check (ct_sekonder in (1, 5)), -- sekonder (5 A ya da 1 A)
  durum        text not null default 'planlandi' check (durum in ('planlandi', 'ip_atandi', 'monte', 'devreye', 'test_ok')),
  sira         int,
  aciklama     text check (char_length(aciklama) <= 2000),
  aktif        boolean not null default true,
  guncelleyen  uuid,
  guncelleme   timestamptz not null default now(),
  olusturma    timestamptz not null default now()
);
create index if not exists olcum_plan_tesis_idx on public.olcum_plan (tesis, sira);

-- IP girildiyse ve durum hâlâ "planlandı" ise "IP atandı" olur (sunucuda)
create or replace function public.olcum_plan_hesapla() returns trigger
language plpgsql as $$
begin
  if new.host is not null and new.durum = 'planlandi' then new.durum := 'ip_atandi'; end if;
  return new;
end $$;
drop trigger if exists olcum_plan_hesapla_t on public.olcum_plan;
create trigger olcum_plan_hesapla_t before insert or update on public.olcum_plan for each row execute function public.olcum_plan_hesapla();

-- Geçmiş (kim, ne zaman, eski/yeni değer): kayıt kimliği olarak kod kullanılır
create or replace function public.olcum_plan_gecmis() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    insert into public.iso_gecmis (kim, kim_ad, tablo, kayit_id, islem, eski) values (auth.uid(), public.iso_kim_ad(), 'olcum_plan', old.kod, 'DELETE', to_jsonb(old));
    return old;
  end if;
  new.guncelleyen := auth.uid();
  new.guncelleme := now();
  if tg_op = 'INSERT' and auth.uid() is null then return new; end if;   -- SQL Editor'den yüklenen başlangıç listesi geçmişi şişirmesin
  insert into public.iso_gecmis (kim, kim_ad, tablo, kayit_id, islem, eski, yeni)
    values (auth.uid(), public.iso_kim_ad(), 'olcum_plan', new.kod, tg_op, case when tg_op = 'UPDATE' then to_jsonb(old) end, to_jsonb(new));
  return new;
end $$;
drop trigger if exists olcum_plan_z_gecmis on public.olcum_plan;
create trigger olcum_plan_z_gecmis before insert or update or delete on public.olcum_plan for each row execute function public.olcum_plan_gecmis();

alter table public.olcum_plan enable row level security;
drop policy if exists "okuma" on public.olcum_plan;
drop policy if exists "ekleme" on public.olcum_plan;
drop policy if exists "guncelleme" on public.olcum_plan;
drop policy if exists "silme" on public.olcum_plan;
create policy "okuma" on public.olcum_plan for select to authenticated using (public.okuyabilir());
create policy "ekleme" on public.olcum_plan for insert to authenticated with check (public.yazabilir());
create policy "guncelleme" on public.olcum_plan for update to authenticated using (public.yazabilir()) with check (public.yazabilir());
create policy "silme" on public.olcum_plan for delete to authenticated using (public.yonetici());

-- ---------- 34 nokta: AASSM 14 + Buz Sporları 20 (saha keşfinde pano/kat bilgisi ve adlar güncellenir) ----------
insert into public.olcum_plan (kod, tesis, ad, yuk_grubu, kat_mahal, iso_bolum, sira) values
  ('AASSM-GIRIS-1', 'aassm', 'Ana giriş (OSOS çapraz kontrol)', 'Ana giriş', null, 'Ana bina', 1),
  ('AASSM-CHL-1', 'aassm', 'Chiller grubu 1', 'Chiller / iklimlendirme', null, null, 2),
  ('AASSM-CHL-2', 'aassm', 'Chiller grubu 2', 'Chiller / iklimlendirme', null, null, 3),
  ('AASSM-KLIMA-1', 'aassm', 'Klima santrali / pompa grubu 1', 'Klima santrali, nem alma ve pompalar', null, null, 4),
  ('AASSM-KLIMA-2', 'aassm', 'Klima santrali / pompa grubu 2', 'Klima santrali, nem alma ve pompalar', null, null, 5),
  ('AASSM-KLIMA-3', 'aassm', 'Klima santrali / pompa grubu 3', 'Klima santrali, nem alma ve pompalar', null, null, 6),
  ('AASSM-KAZAN-1', 'aassm', 'Havalandırma ve kazan dairesi elektriği 1', 'Havalandırma ve kazan elektriği', null, null, 7),
  ('AASSM-KAZAN-2', 'aassm', 'Havalandırma ve kazan dairesi elektriği 2', 'Havalandırma ve kazan elektriği', null, null, 8),
  ('AASSM-AYD-SAHNE', 'aassm', 'Sahne aydınlatma', 'Aydınlatma', null, null, 9),
  ('AASSM-AYD-DIS', 'aassm', 'Dış aydınlatma', 'Aydınlatma', null, null, 10),
  ('AASSM-AYD-IC-1', 'aassm', 'İç aydınlatma ve diğer 1', 'Aydınlatma', null, null, 11),
  ('AASSM-AYD-IC-2', 'aassm', 'İç aydınlatma ve diğer 2', 'Aydınlatma', null, null, 12),
  ('AASSM-AYD-IC-3', 'aassm', 'İç aydınlatma ve diğer 3', 'Aydınlatma', null, null, 13),
  ('AASSM-DIGER-1', 'aassm', 'Diğer büyük yükler (asansör, jeneratör, UPS, otomasyon)', 'Diğer büyük yükler', null, null, 14),
  ('BUZ-GIRIS-1', 'buz', 'Ana giriş (OSOS çapraz kontrol)', 'Ana giriş', null, 'Buz Sporları Salonu', 1),
  ('BUZ-CHL-1', 'buz', 'İklimlendirme chiller', 'Chiller / iklimlendirme', null, null, 2),
  ('BUZ-KLIMA-1', 'buz', 'Klima santrali / nem alma 1', 'Klima santrali, nem alma ve pompalar', null, null, 3),
  ('BUZ-KLIMA-2', 'buz', 'Klima santrali / nem alma 2', 'Klima santrali, nem alma ve pompalar', null, null, 4),
  ('BUZ-KLIMA-3', 'buz', 'Klima santrali / nem alma 3', 'Klima santrali, nem alma ve pompalar', null, null, 5),
  ('BUZ-BUZ-1', 'buz', 'Buz sistemi — kompresör grubu 1', 'Buz sistemi', null, null, 6),
  ('BUZ-BUZ-2', 'buz', 'Buz sistemi — kompresör grubu 2', 'Buz sistemi', null, null, 7),
  ('BUZ-BUZ-3', 'buz', 'Buz sistemi — kondenser / pompa 1', 'Buz sistemi', null, null, 8),
  ('BUZ-BUZ-4', 'buz', 'Buz sistemi — kondenser / pompa 2', 'Buz sistemi', null, null, 9),
  ('BUZ-HAVUZ-1', 'buz', 'Havuz panosu 1', 'Havuz', null, null, 10),
  ('BUZ-HAVUZ-2', 'buz', 'Havuz panosu 2', 'Havuz', null, null, 11),
  ('BUZ-HAVUZ-3', 'buz', 'Havuz panosu 3', 'Havuz', null, null, 12),
  ('BUZ-KAZAN-1', 'buz', 'Havalandırma ve kazan dairesi elektriği 1', 'Havalandırma ve kazan elektriği', null, null, 13),
  ('BUZ-KAZAN-2', 'buz', 'Havalandırma ve kazan dairesi elektriği 2', 'Havalandırma ve kazan elektriği', null, null, 14),
  ('BUZ-AYD-1', 'buz', 'Aydınlatma 1 (tribün, ofis/soyunma, dış, diğer)', 'Aydınlatma', null, null, 15),
  ('BUZ-AYD-2', 'buz', 'Aydınlatma 2 (tribün, ofis/soyunma, dış, diğer)', 'Aydınlatma', null, null, 16),
  ('BUZ-AYD-3', 'buz', 'Aydınlatma 3 (tribün, ofis/soyunma, dış, diğer)', 'Aydınlatma', null, null, 17),
  ('BUZ-AYD-4', 'buz', 'Aydınlatma 4 (tribün, ofis/soyunma, dış, diğer)', 'Aydınlatma', null, null, 18),
  ('BUZ-DIGER-1', 'buz', 'Diğer büyük yükler 1', 'Diğer büyük yükler', null, null, 19),
  ('BUZ-DIGER-2', 'buz', 'Diğer büyük yükler 2', 'Diğer büyük yükler', null, null, 20)
on conflict (kod) do nothing;
