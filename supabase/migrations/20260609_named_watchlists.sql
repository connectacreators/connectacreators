-- Named, multiple watchlists per user (replaces the single implicit watchlist).
-- A user can own many lists; a channel can belong to many lists (many-to-many).
-- The pre-existing single watchlist (channel_watchlist_items) is backfilled into
-- a default "My Watchlist" and kept intact as a safety net.
--
-- NOTE: This was applied to production directly via the Supabase MCP on
-- 2026-06-09 (the project applies schema out-of-band; the CLI migration tracker
-- is unreliable here). This file exists for version-control parity.

-- ── Named watchlists ─────────────────────────────────────────────────────────
create table if not exists public.channel_watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.channel_watchlists enable row level security;
drop policy if exists "watchlists_select_own" on public.channel_watchlists;
drop policy if exists "watchlists_insert_own" on public.channel_watchlists;
drop policy if exists "watchlists_update_own" on public.channel_watchlists;
drop policy if exists "watchlists_delete_own" on public.channel_watchlists;
create policy "watchlists_select_own" on public.channel_watchlists for select using (auth.uid() = user_id);
create policy "watchlists_insert_own" on public.channel_watchlists for insert with check (auth.uid() = user_id);
create policy "watchlists_update_own" on public.channel_watchlists for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "watchlists_delete_own" on public.channel_watchlists for delete using (auth.uid() = user_id);
grant select, insert, update, delete on public.channel_watchlists to authenticated;

-- ── Many-to-many: channel ↔ watchlist ───────────────────────────────────────
create table if not exists public.channel_watchlist_members (
  watchlist_id uuid not null references public.channel_watchlists(id) on delete cascade,
  channel_id uuid not null references public.viral_channels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (watchlist_id, channel_id)
);
create index if not exists idx_cwm_user on public.channel_watchlist_members(user_id);
create index if not exists idx_cwm_channel on public.channel_watchlist_members(channel_id);
alter table public.channel_watchlist_members enable row level security;
drop policy if exists "cwm_select_own" on public.channel_watchlist_members;
drop policy if exists "cwm_insert_own" on public.channel_watchlist_members;
drop policy if exists "cwm_delete_own" on public.channel_watchlist_members;
create policy "cwm_select_own" on public.channel_watchlist_members for select using (auth.uid() = user_id);
create policy "cwm_insert_own" on public.channel_watchlist_members for insert with check (auth.uid() = user_id);
create policy "cwm_delete_own" on public.channel_watchlist_members for delete using (auth.uid() = user_id);
grant select, insert, delete on public.channel_watchlist_members to authenticated;

-- ── Backfill the legacy single watchlist into a default named list ───────────
insert into public.channel_watchlists (user_id, name)
select distinct i.user_id, 'My Watchlist'
from public.channel_watchlist_items i
where not exists (
  select 1 from public.channel_watchlists w where w.user_id = i.user_id
);

insert into public.channel_watchlist_members (watchlist_id, channel_id, user_id)
select w.id, i.channel_id, i.user_id
from public.channel_watchlist_items i
join public.channel_watchlists w on w.user_id = i.user_id and w.name = 'My Watchlist'
on conflict (watchlist_id, channel_id) do nothing;
