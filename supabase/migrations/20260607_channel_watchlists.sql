-- Per-user channel watchlists. A user's watchlist is their personal subset of
-- the global viral_channels pool; it drives the "Your Watchlist" feed mode on
-- Viral Today. Single watchlist per user (membership rows), not multiple named
-- lists.
create table if not exists public.channel_watchlist_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  channel_id uuid not null references public.viral_channels(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, channel_id)
);

alter table public.channel_watchlist_items enable row level security;

drop policy if exists "watchlist_select_own" on public.channel_watchlist_items;
drop policy if exists "watchlist_insert_own" on public.channel_watchlist_items;
drop policy if exists "watchlist_delete_own" on public.channel_watchlist_items;

create policy "watchlist_select_own" on public.channel_watchlist_items
  for select using (auth.uid() = user_id);
create policy "watchlist_insert_own" on public.channel_watchlist_items
  for insert with check (auth.uid() = user_id);
create policy "watchlist_delete_own" on public.channel_watchlist_items
  for delete using (auth.uid() = user_id);

grant select, insert, delete on public.channel_watchlist_items to authenticated;
