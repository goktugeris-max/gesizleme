-- Ortak eylem takibi (ISO 50001 eylem planı): durum, ilerleme, sorumlu, not ve yorumlar ekip arasında paylaşılır.
-- Önce kurulum.sql çalışmış olmalı. Supabase → SQL Editor → New query → bu dosyanın tamamını yapıştırıp RUN.
-- Güvenlik: bu tablolar HERKESE AÇIK DEĞİLDİR (anon okuyamaz). Okuma: giriş yapmış ve profili olan herkes; yazma: girisci/yonetici.

create or replace function public.okuyabilir() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiller where user_id = auth.uid())
$$;

create or replace function public.yonetici() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiller where user_id = auth.uid() and rol = 'yonetici')
$$;

create table if not exists public.eylem_takip (
  kaynak          text not null,                 -- 'iso' (ileride başka eylem listeleri)
  eylem_id        text not null,                 -- panelin eylem kimliği (tesis|no|önlem)
  durum           text not null default 'oto' check (durum in ('oto', 'tamamlandi', 'devam', 'planli', 'surekli', 'iptal')),
  yuzde           int check (yuzde between 0 and 100),
  sorumlu         text check (char_length(sorumlu) <= 200),
  not_            text check (char_length(not_) <= 4000),
  guncelleyen     uuid default auth.uid(),
  guncelleyen_ad  text,
  guncelleme      timestamptz default now(),
  primary key (kaynak, eylem_id)
);

create table if not exists public.eylem_yorum (
  id         bigserial primary key,
  kaynak     text not null,
  eylem_id   text not null,
  yazan      uuid default auth.uid(),
  yazan_ad   text,
  metin      text not null check (char_length(metin) between 1 and 2000),
  zaman      timestamptz not null default now()
);
create index if not exists eylem_yorum_idx on public.eylem_yorum (kaynak, eylem_id, zaman);

-- Kim / ne zaman bilgisini sunucuda yaz ve değişikliği geçmişe kaydet
create or replace function public.eylem_gecmis() returns trigger
language plpgsql security definer set search_path = public as $$
declare ad text; k text;
begin
  select p.ad into ad from public.profiller p where p.user_id = auth.uid();
  if tg_op = 'DELETE' then
    insert into public.degisiklik_gecmisi (kullanici, tablo, islem, anahtar, eski)
      values (auth.uid(), tg_table_name, tg_op, old.kaynak || '/' || old.eylem_id, to_jsonb(old));
    return old;
  end if;
  if tg_table_name = 'eylem_takip' then
    new.guncelleyen := auth.uid(); new.guncelleyen_ad := ad; new.guncelleme := now();
  else
    new.yazan := auth.uid(); new.yazan_ad := ad; new.zaman := now();
  end if;
  insert into public.degisiklik_gecmisi (kullanici, tablo, islem, anahtar, eski, yeni)
    values (auth.uid(), tg_table_name, tg_op, new.kaynak || '/' || new.eylem_id, case when tg_op = 'UPDATE' then to_jsonb(old) end, to_jsonb(new));
  return new;
end $$;

drop trigger if exists eylem_takip_gecmis on public.eylem_takip;
create trigger eylem_takip_gecmis before insert or update or delete on public.eylem_takip for each row execute function public.eylem_gecmis();
drop trigger if exists eylem_yorum_gecmis on public.eylem_yorum;
create trigger eylem_yorum_gecmis before insert or delete on public.eylem_yorum for each row execute function public.eylem_gecmis();

alter table public.eylem_takip enable row level security;
alter table public.eylem_yorum enable row level security;

drop policy if exists "takip okuma" on public.eylem_takip;
create policy "takip okuma" on public.eylem_takip for select to authenticated using (public.okuyabilir());
drop policy if exists "takip yazma" on public.eylem_takip;
create policy "takip yazma" on public.eylem_takip for all to authenticated using (public.yazabilir()) with check (public.yazabilir());

drop policy if exists "yorum okuma" on public.eylem_yorum;
create policy "yorum okuma" on public.eylem_yorum for select to authenticated using (public.okuyabilir());
drop policy if exists "yorum ekleme" on public.eylem_yorum;
create policy "yorum ekleme" on public.eylem_yorum for insert to authenticated with check (public.yazabilir());
drop policy if exists "yorum silme" on public.eylem_yorum;
create policy "yorum silme" on public.eylem_yorum for delete to authenticated using (yazan = auth.uid() or public.yonetici());
