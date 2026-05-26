-- 20260525_b01_user_branding.sql
-- Per-user branding for connecta_plus users: palette + font pairing + logo URL.

create table if not exists public.user_branding (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  palette      text not null default 'editorial'
                 check (palette in ('editorial','slate','forest','plum','crimson','mono')),
  font_pairing text not null default 'editorial'
                 check (font_pairing in ('editorial','modern','classic','bold')),
  logo_url     text,
  logo_alt     text,
  updated_at   timestamptz not null default now()
);

create or replace function public.touch_user_branding_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

drop trigger if exists user_branding_touch on public.user_branding;
create trigger user_branding_touch
  before update on public.user_branding
  for each row execute function public.touch_user_branding_updated_at();

alter table public.user_branding enable row level security;

-- User can read own row
drop policy if exists user_branding_select_own on public.user_branding;
create policy user_branding_select_own on public.user_branding
  for select using (user_id = auth.uid());

-- Admins can read any row (uses existing public.is_admin() SECURITY DEFINER helper)
drop policy if exists user_branding_select_admin on public.user_branding;
create policy user_branding_select_admin on public.user_branding
  for select using (public.is_admin());

-- User can insert / update own row
drop policy if exists user_branding_insert_own on public.user_branding;
create policy user_branding_insert_own on public.user_branding
  for insert with check (user_id = auth.uid());

drop policy if exists user_branding_update_own on public.user_branding;
create policy user_branding_update_own on public.user_branding
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update on public.user_branding to authenticated;
