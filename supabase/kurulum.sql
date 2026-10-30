-- Enerji Yönetim Merkezi — Supabase kurulumu
-- Supabase panelinde: SQL Editor → New query → bu dosyanın tamamını yapıştırıp RUN.
-- Güvenlik: tüm tablolarda satır bazlı yetki (RLS) açıktır. Siteye yazılan "anon" anahtarı yalnızca aşağıdaki "herkese açık okuma"
-- politikalarının izin verdiği veriyi okuyabilir; yazma yalnızca giriş yapmış ve rolü girisci/yonetici olan kullanıcılara açıktır.
-- ASLA "service_role" anahtarını siteye/depoya koymayın.

-- 1) Kullanıcı rolleri
create table if not exists public.profiller (
  user_id uuid primary key references auth.users on delete cascade,
  ad      text,
  rol     text not null default 'okuyucu' check (rol in ('okuyucu', 'girisci', 'yonetici'))
);
alter table public.profiller enable row level security;
drop policy if exists "kendi profilini oku" on public.profiller;
create policy "kendi profilini oku" on public.profiller for select to authenticated using (user_id = auth.uid());

create or replace function public.yazabilir() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiller where user_id = auth.uid() and rol in ('girisci', 'yonetici'))
$$;

-- 2) GES aylık üretim (kWh). Panel Excel verisinin üstüne bunu uygular.
create table if not exists public.ges_aylik_uretim (
  santral_id  text not null,
  yil         int  not null check (yil between 2015 and 2100),
  ay          int  not null check (ay between 1 and 12),
  uretim_kwh  numeric not null check (uretim_kwh >= 0),
  guncelleyen uuid default auth.uid(),
  guncelleme  timestamptz default now(),
  primary key (santral_id, yil, ay)
);

-- 3) GES aylık inceleme (arıza takip satırı)
create table if not exists public.ges_aylik_inceleme (
  santral_id     text not null,
  yil            int  not null check (yil between 2015 and 2100),
  ay             int  not null check (ay between 1 and 12),
  hataya_dusme   int  not null default 0 check (hataya_dusme >= 0),
  bekleme        int  not null default 0 check (bekleme >= 0),
  izleme_disi    int  not null default 0 check (izleme_disi >= 0),
  uretimsiz_gun  int  not null default 0 check (uretimsiz_gun between 0 and 31),
  tarih          text,
  neden          text,
  guncelleyen    uuid default auth.uid(),
  guncelleme     timestamptz default now(),
  primary key (santral_id, yil, ay)
);

-- 4) Değişiklik geçmişi (kim, ne zaman, neyi, eski/yeni değer)
create table if not exists public.degisiklik_gecmisi (
  id        bigserial primary key,
  zaman     timestamptz not null default now(),
  kullanici uuid,
  tablo     text not null,
  islem     text not null,
  anahtar   text not null,
  eski      jsonb,
  yeni      jsonb
);

-- Kim/ne zaman damgası BEFORE'da, geçmiş kaydı AFTER'da yazılır: "INSERT ... ON CONFLICT DO UPDATE" (upsert) önce BEFORE INSERT tetikleyicisini
-- çalıştırır, çakışma varsa sonra UPDATE'e döner; geçmişi BEFORE'da yazmak her düzenlemede sahte bir INSERT kaydı üretirdi.
create or replace function public.gecmis_damga() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.guncelleyen := auth.uid();
  new.guncelleme  := now();
  return new;
end $$;

create or replace function public.gecmis_yaz() returns trigger
language plpgsql security definer set search_path = public as $$
declare k text;
begin
  if tg_op = 'DELETE' then
    k := old.santral_id || '/' || old.yil || '/' || old.ay;
    insert into public.degisiklik_gecmisi (kullanici, tablo, islem, anahtar, eski) values (auth.uid(), tg_table_name, tg_op, k, to_jsonb(old));
    return old;
  end if;
  k := new.santral_id || '/' || new.yil || '/' || new.ay;
  insert into public.degisiklik_gecmisi (kullanici, tablo, islem, anahtar, eski, yeni)
    values (auth.uid(), tg_table_name, tg_op, k, case when tg_op = 'UPDATE' then to_jsonb(old) end, to_jsonb(new));
  return new;
end $$;

drop trigger if exists uretim_gecmis on public.ges_aylik_uretim;
drop trigger if exists inceleme_gecmis on public.ges_aylik_inceleme;
drop trigger if exists uretim_damga on public.ges_aylik_uretim;
drop trigger if exists inceleme_damga on public.ges_aylik_inceleme;
create trigger uretim_damga before insert or update on public.ges_aylik_uretim for each row execute function public.gecmis_damga();
create trigger inceleme_damga before insert or update on public.ges_aylik_inceleme for each row execute function public.gecmis_damga();
create trigger uretim_gecmis after insert or update or delete on public.ges_aylik_uretim for each row execute function public.gecmis_yaz();
create trigger inceleme_gecmis after insert or update or delete on public.ges_aylik_inceleme for each row execute function public.gecmis_yaz();

-- 5) Satır bazlı yetki
alter table public.ges_aylik_uretim   enable row level security;
alter table public.ges_aylik_inceleme enable row level security;
alter table public.degisiklik_gecmisi enable row level security;

-- Üretim ve inceleme verisi zaten herkese açık (performans.json) olduğundan okuma herkese açık
drop policy if exists "uretim herkese okuma" on public.ges_aylik_uretim;
create policy "uretim herkese okuma" on public.ges_aylik_uretim for select to anon, authenticated using (true);
drop policy if exists "uretim yazma" on public.ges_aylik_uretim;
create policy "uretim yazma" on public.ges_aylik_uretim for all to authenticated using (public.yazabilir()) with check (public.yazabilir());

drop policy if exists "inceleme herkese okuma" on public.ges_aylik_inceleme;
create policy "inceleme herkese okuma" on public.ges_aylik_inceleme for select to anon, authenticated using (true);
drop policy if exists "inceleme yazma" on public.ges_aylik_inceleme;
create policy "inceleme yazma" on public.ges_aylik_inceleme for all to authenticated using (public.yazabilir()) with check (public.yazabilir());

-- Geçmişi yalnızca yazma yetkisi olanlar okur; kimse doğrudan yazamaz/silemez (tetikleyici yazar)
drop policy if exists "gecmis okuma" on public.degisiklik_gecmisi;
create policy "gecmis okuma" on public.degisiklik_gecmisi for select to authenticated using (public.yazabilir());

-- 6) İlk yönetici (kendi e-postanızla çalıştırın; kullanıcıyı önce Authentication → Users → Add user ile oluşturun):
-- insert into public.profiller (user_id, ad, rol) select id, 'Ad Soyad', 'yonetici' from auth.users where email = 'kullanici@ornek.com';
-- Başka kullanıcı: rol 'girisci' (veri girer) veya 'okuyucu' (yalnızca görür).
