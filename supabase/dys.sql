-- Doküman Yönetim Sistemi (DYS): ISO 50001 dokümante edilmiş bilgi kontrolü (İBB-PR-07-01).
-- Önce kurulum.sql ve eylem_takip.sql çalışmış olmalı (profiller, okuyabilir(), yonetici(), yazabilir() oradan gelir).
-- Supabase → SQL Editor → New query → tamamını yapıştırıp RUN. Tekrar çalıştırmak zararsızdır.
--
-- Güvenlik: tablolar ve dosyalar HERKESE AÇIK DEĞİLDİR (anon hiçbir şey göremez).
--   Okuma  : giriş yapmış, profili olan herkes (arşivlenmiş sürümlerin dosyalarını yalnız yönetici açar — prosedür 4.7)
--   Yazma  : girisci ve yonetici (taslak, revizyon kaydı, imzalı PDF yükleme)
--   Yürürlüğe alma / arşivleme: YALNIZ yonetici, dys_yururluge_al() ile ve imzalı PDF + EBYS evrak sayısı varsa
--   Yüklenmiş imzalı dosya ve revizyon kaydı sonradan değiştirilemez/silinemez (prosedür 4.10: kayıtlar silinip yeniden yazılamaz)
--   Her adım dys_olay'a sunucuda yazılır (kim, ne zaman); olay kayıtları değiştirilemez.

-- 1) Doküman (kurum genelinde bir kod = bir doküman)
create table if not exists public.dys_belge (
  kod              text primary key check (char_length(kod) between 1 and 60),   -- İBB-FRM-04-01
  tur              text not null default 'Diğer',                                -- El Kitabı, Prosedür, Form, Plan, Liste, Rehber, Politika, Yönerge, Rapor, Dış Kaynaklı Doküman
  ad               text not null check (char_length(ad) between 1 and 300),
  sahip            text,                                                         -- sorumlu birim/kişi (serbest metin)
  durum            text not null default 'taslak' check (durum in ('taslak', 'kontrolde', 'onayda', 'ebys_imzada', 'yururlukte', 'iptal')),
  guncel_rev       text,                                                         -- yürürlükteki revizyon no (00, 01…)
  yayin_tarihi     date,
  revizyon_tarihi  date,
  gozden_gecirme   date,                                                         -- son gözden geçirme (yılın son Enerji Gözden Geçirme toplantısı)
  maddeler         text[] not null default '{}',                                 -- karşıladığı ISO 50001 maddeleri (4.1, 6.2…)
  not_             text check (char_length(not_) <= 4000),
  olusturan        uuid default auth.uid(),
  olusturma        timestamptz not null default now(),
  guncelleme       timestamptz not null default now()
);

-- 2) Revizyonlar: her revizyon ayrı satır; imzalı PDF burada
create table if not exists public.dys_revizyon (
  id               bigserial primary key,
  belge_kod        text not null references public.dys_belge(kod) on delete cascade on update cascade,
  rev_no           text not null check (char_length(rev_no) between 1 and 10),
  durum            text not null default 'taslak' check (durum in ('taslak', 'yururlukte', 'arsiv')),
  surec            text not null default 'taslak' check (surec in ('taslak', 'kontrolde', 'onayda', 'ebys_imzada')),  -- taslak revizyonun onay adımı
  yayin_tarihi     date,
  revizyon_tarihi  date,
  degisiklik       text check (char_length(degisiklik) <= 2000),
  hazirlayan       text,
  kontrol_eden     text,
  onaylayan        text,
  ebys_sayi        text,                         -- imzalı yazının EBYS evrak sayısı
  ebys_tarih       date,
  dosya_yolu       text,                         -- storage 'dys' kovasındaki yol
  dosya_ad         text,
  dosya_boyut      bigint,
  dosya_sha256     text,
  yukleyen         uuid,
  yukleyen_ad      text,
  yukleme          timestamptz,
  aktarim          boolean not null default false,  -- doküman listesinden aktarıldı; imzalı dosya henüz yüklenmedi
  olusturma        timestamptz not null default now(),
  unique (belge_kod, rev_no)
);
create index if not exists dys_revizyon_belge_idx on public.dys_revizyon (belge_kod);

-- Not: belge.durum yalnız taslak / yururlukte / iptal olarak kullanılır; kontrol-onay adımı revizyonun `surec` alanındadır
-- (yürürlükteki bir dokümanın yeni revizyonu hazırlanırken doküman yürürlükte kalır).

-- 3) Olay geçmişi (sunucuda yazılır, değiştirilemez)
create table if not exists public.dys_olay (
  id         bigserial primary key,
  belge_kod  text not null,
  rev_no     text,
  olay       text not null,                      -- olustu, durum, revizyon, dosya, yururluk, arsiv, not
  aciklama   text check (char_length(aciklama) <= 2000),
  kim        uuid,
  kim_ad     text,
  zaman      timestamptz not null default now()
);
create index if not exists dys_olay_belge_idx on public.dys_olay (belge_kod, zaman);

-- ---------- Tetikleyiciler ----------
create or replace function public.dys_rpc_mi() returns boolean
language sql stable as $$ select coalesce(current_setting('dys.rpc', true), '') = '1' $$;

create or replace function public.dys_kim_ad() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select ad from public.profiller where user_id = auth.uid()), '')
$$;

create or replace function public.dys_olay_yaz(p_kod text, p_rev text, p_olay text, p_aciklama text) returns void
language sql security definer set search_path = public as $$
  insert into public.dys_olay (belge_kod, rev_no, olay, aciklama, kim, kim_ad) values (p_kod, p_rev, p_olay, p_aciklama, auth.uid(), public.dys_kim_ad())
$$;

-- Not düşme: istemci yalnız 'not' olayı ekleyebilir (dosya, durum, yürürlük kayıtlarını sunucu yazar)
create or replace function public.dys_olay_ekle() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.kim := auth.uid();
  new.kim_ad := public.dys_kim_ad();
  new.zaman := now();
  return new;
end $$;
drop trigger if exists dys_olay_once on public.dys_olay;
create trigger dys_olay_once before insert on public.dys_olay for each row execute function public.dys_olay_ekle();

-- Belge: yürürlüğe geçiş yalnız dys_yururluge_al() ile; kim/ne zaman ve durum olayı
create or replace function public.dys_belge_kontrol() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    -- listeden toplu aktarım: yalnız yönetici doğrudan 'yururlukte' ya da 'iptal' kaydı açabilir
    if new.durum in ('yururlukte', 'iptal') and not public.yonetici() and not public.dys_rpc_mi() then
      raise exception 'Yürürlükte/iptal kaydı yalnız yönetici tarafından açılabilir' using errcode = '42501';
    end if;
    new.olusturan := auth.uid();
    perform public.dys_olay_yaz(new.kod, null, 'olustu', new.ad || ' (' || new.durum || ')');
    return new;
  end if;
  new.guncelleme := now();
  if (new.durum = 'yururlukte' and old.durum is distinct from 'yururlukte' or new.guncel_rev is distinct from old.guncel_rev) and not public.dys_rpc_mi() then
    raise exception 'Yürürlüğe alma yalnız dys_yururluge_al() ile yapılır (imzalı PDF ve EBYS sayısı gerekir)' using errcode = '42501';
  end if;
  if new.durum = 'iptal' and old.durum is distinct from 'iptal' and not public.yonetici() then
    raise exception 'İptal onayı yalnız yönetici tarafından verilebilir' using errcode = '42501';
  end if;
  if new.durum is distinct from old.durum and not public.dys_rpc_mi() then
    perform public.dys_olay_yaz(new.kod, null, 'durum', old.durum || ' → ' || new.durum);
  end if;
  return new;
end $$;
drop trigger if exists dys_belge_kontrol_t on public.dys_belge;
create trigger dys_belge_kontrol_t before insert or update on public.dys_belge for each row execute function public.dys_belge_kontrol();

-- Revizyon: imzalı dosya ve yürürlük kaydı değiştirilemez
create or replace function public.dys_revizyon_kontrol() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.durum <> 'taslak' and not public.yonetici() and not public.dys_rpc_mi() then
      raise exception 'Yürürlükte/arşiv revizyonu yalnız yönetici (liste aktarımı) açabilir' using errcode = '42501';
    end if;
    if new.dosya_yolu is not null then
      new.yukleyen := auth.uid(); new.yukleyen_ad := public.dys_kim_ad(); new.yukleme := now();
    end if;
    perform public.dys_olay_yaz(new.belge_kod, new.rev_no, 'revizyon', 'Revizyon ' || new.rev_no || ' açıldı (' || new.durum || ')' || coalesce(' — ' || new.degisiklik, ''));
    if new.dosya_yolu is not null then
      perform public.dys_olay_yaz(new.belge_kod, new.rev_no, 'dosya', coalesce(new.dosya_ad, new.dosya_yolu) || coalesce(' · EBYS ' || new.ebys_sayi, ''));
    end if;
    return new;
  end if;
  if old.dosya_yolu is not null and new.dosya_yolu is distinct from old.dosya_yolu then
    raise exception 'Yüklenmiş imzalı dosya değiştirilemez; yeni revizyon açın' using errcode = '42501';
  end if;
  if new.surec is distinct from old.surec then
    if old.durum <> 'taslak' then
      raise exception 'Yürürlükteki/arşivdeki revizyonun onay adımı değiştirilemez' using errcode = '42501';
    end if;
    -- kontrol ve onay adımları Ekip Lideri / yönetici yetkisindedir; hazırlayan yalnız kontrole gönderir ya da taslağa geri alır
    if new.surec in ('onayda', 'ebys_imzada') and not public.yonetici() then
      raise exception 'Onaya alma ve EBYS imza adımı yalnız yönetici tarafından yapılır' using errcode = '42501';
    end if;
    if not public.dys_rpc_mi() then
      perform public.dys_olay_yaz(new.belge_kod, new.rev_no, 'durum', 'Revizyon ' || new.rev_no || ': ' || old.surec || ' → ' || new.surec);
    end if;
  end if;
  if new.durum is distinct from old.durum and not public.dys_rpc_mi() then
    raise exception 'Revizyon durumu yalnız dys_yururluge_al() ile değişir' using errcode = '42501';
  end if;
  if old.dosya_yolu is null and new.dosya_yolu is not null then
    new.yukleyen := auth.uid(); new.yukleyen_ad := public.dys_kim_ad(); new.yukleme := now();
    perform public.dys_olay_yaz(new.belge_kod, new.rev_no, 'dosya', coalesce(new.dosya_ad, new.dosya_yolu) || coalesce(' · EBYS ' || new.ebys_sayi, ''));
  end if;
  return new;
end $$;
drop trigger if exists dys_revizyon_kontrol_t on public.dys_revizyon;
create trigger dys_revizyon_kontrol_t before insert or update on public.dys_revizyon for each row execute function public.dys_revizyon_kontrol();

-- ---------- Yürürlüğe alma (yalnız yönetici) ----------
create or replace function public.dys_yururluge_al(p_belge text, p_rev text, p_yayin date default null, p_revtarih date default null) returns void
language plpgsql security definer set search_path = public as $$
declare r public.dys_revizyon;
begin
  if not public.yonetici() then
    raise exception 'Yürürlüğe alma yetkisi yalnız yöneticidedir' using errcode = '42501';
  end if;
  select * into r from public.dys_revizyon where belge_kod = p_belge and rev_no = p_rev for update;
  if not found then raise exception 'Revizyon bulunamadı: % / %', p_belge, p_rev; end if;
  if r.dosya_yolu is null or coalesce(r.ebys_sayi, '') = '' then
    raise exception 'Yürürlüğe almak için EBYS imzalı PDF yüklenmeli ve EBYS evrak sayısı girilmeli';
  end if;
  perform set_config('dys.rpc', '1', true);
  update public.dys_revizyon set durum = 'arsiv' where belge_kod = p_belge and durum = 'yururlukte' and rev_no <> p_rev;
  update public.dys_revizyon set durum = 'yururlukte', surec = 'ebys_imzada', yayin_tarihi = coalesce(p_yayin, yayin_tarihi), revizyon_tarihi = coalesce(p_revtarih, revizyon_tarihi), aktarim = false
    where id = r.id;
  update public.dys_belge set durum = 'yururlukte', guncel_rev = p_rev,
      yayin_tarihi = coalesce(yayin_tarihi, p_yayin, r.yayin_tarihi), revizyon_tarihi = coalesce(p_revtarih, r.revizyon_tarihi)
    where kod = p_belge;
  perform public.dys_olay_yaz(p_belge, p_rev, 'yururluk', 'Revizyon ' || p_rev || ' yürürlüğe alındı; önceki revizyonlar arşive kaldırıldı');
  perform set_config('dys.rpc', '', true);
end $$;
revoke all on function public.dys_yururluge_al(text, text, date, date) from public, anon;
grant execute on function public.dys_yururluge_al(text, text, date, date) to authenticated;

-- ---------- Satır bazlı yetki ----------
alter table public.dys_belge    enable row level security;
alter table public.dys_revizyon enable row level security;
alter table public.dys_olay     enable row level security;

drop policy if exists "belge okuma" on public.dys_belge;
drop policy if exists "belge yazma" on public.dys_belge;
drop policy if exists "belge guncelle" on public.dys_belge;
drop policy if exists "belge silme" on public.dys_belge;
drop policy if exists "rev okuma" on public.dys_revizyon;
drop policy if exists "rev yazma" on public.dys_revizyon;
drop policy if exists "rev guncelle" on public.dys_revizyon;
drop policy if exists "rev silme" on public.dys_revizyon;
drop policy if exists "olay okuma" on public.dys_olay;
drop policy if exists "olay not" on public.dys_olay;

create policy "belge okuma"  on public.dys_belge    for select to authenticated using (public.okuyabilir());
create policy "belge yazma"  on public.dys_belge    for insert to authenticated with check (public.yazabilir());
create policy "belge guncelle" on public.dys_belge  for update to authenticated using (public.yazabilir()) with check (public.yazabilir());
-- Belge silinemez (iptal edilir); yalnız hiç revizyonu olmayan boş taslağı yönetici silebilir
create policy "belge silme"  on public.dys_belge    for delete to authenticated using (public.yonetici() and durum = 'taslak' and not exists (select 1 from public.dys_revizyon r where r.belge_kod = kod));

create policy "rev okuma"    on public.dys_revizyon for select to authenticated using (public.okuyabilir());
create policy "rev yazma"    on public.dys_revizyon for insert to authenticated with check (public.yazabilir());
create policy "rev guncelle" on public.dys_revizyon for update to authenticated using (public.yazabilir()) with check (public.yazabilir());
create policy "rev silme"    on public.dys_revizyon for delete to authenticated using (public.yonetici() and durum = 'taslak' and dosya_yolu is null);

create policy "olay okuma"   on public.dys_olay     for select to authenticated using (public.okuyabilir());
create policy "olay not"     on public.dys_olay     for insert to authenticated with check (public.yazabilir() and olay = 'not');

-- ---------- Dosya deposu (Storage): özel kova, yalnız PDF, en çok 25 MB ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dys', 'dys', false, 26214400, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 26214400, allowed_mime_types = array['application/pdf'];

drop policy if exists "dys dosya okuma" on storage.objects;
drop policy if exists "dys dosya yukleme" on storage.objects;
-- Okuma: giriş yapmış ve profili olan; arşivlenmiş sürümün dosyasını yalnız yönetici açar
create policy "dys dosya okuma" on storage.objects for select to authenticated
  using (bucket_id = 'dys' and public.okuyabilir()
         and (public.yonetici() or exists (select 1 from public.dys_revizyon r where r.dosya_yolu = name and r.durum <> 'arsiv')));
-- Yükleme: girisci/yonetici. Güncelleme/silme politikası YOK: yüklenen dosya değiştirilemez ve silinemez.
create policy "dys dosya yukleme" on storage.objects for insert to authenticated
  with check (bucket_id = 'dys' and public.yazabilir());
