-- Instagram lead prospecting (2026-07-29) — APPLIED TO PROD via Management
-- API (documentation copy; never `db push`).
--
-- Sourced Instagram handles for DM outreach. Rows land at stage_reached = 0
-- ("sourced"), which writes to no funnel counter; the operator advances a row
-- to 1 (pre_initiated / A1) when they decide to work it. See
-- docs/superpowers/specs/2026-07-29-ig-prospecting-pipeline-design.md.

create table if not exists public.ig_prospect_runs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  query       text not null,
  requested   int  not null default 0,
  returned    int  not null default 0,
  inserted    int  not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.ig_prospect_runs enable row level security;
create policy "Admin full access ig_prospect_runs" on public.ig_prospect_runs
  for all using (public.is_admin()) with check (public.is_admin());

-- unique(username) is GLOBAL, deliberately not scoped to run or user: a handle
-- already worked must never resurface from a different query.
create table if not exists public.ig_prospects (
  id                  uuid primary key default gen_random_uuid(),
  username            text not null unique,
  user_id             uuid not null references auth.users(id) on delete cascade,
  run_id              uuid references public.ig_prospect_runs(id) on delete set null,

  -- identity (from /ig-search, always present)
  ig_user_id          text,
  full_name           text,
  follower_count      int,
  profile_pic_url     text,
  is_verified         boolean not null default false,
  is_private          boolean not null default false,

  -- enrichment (from /ig-profile-info, filled in later)
  biography           text,
  external_url        text,
  category            text,
  is_business         boolean,
  media_count         int,
  following_count     int,
  public_email        text,
  public_phone        text,
  city_name           text,

  -- enrichment state
  enrichment_status   text not null default 'pending'
                        check (enrichment_status in ('pending','done','failed')),
  enrichment_attempts int  not null default 0,
  enriched_at         timestamptz,
  enrichment_error    text,

  -- workflow
  stage_reached       int  not null default 0 check (stage_reached between 0 and 6),
  stage_at            timestamptz,
  followed            boolean not null default false,
  followed_back       boolean not null default false,
  notes               text,
  created_at          timestamptz not null default now()
);

alter table public.ig_prospects enable row level security;
create policy "Admin full access ig_prospects" on public.ig_prospects
  for all using (public.is_admin()) with check (public.is_admin());

-- Claim query: pending rows under the retry ceiling, oldest first.
create index if not exists idx_ig_prospects_claim
  on public.ig_prospects (enrichment_status, enrichment_attempts, created_at);

-- List view: an admin's prospects ordered by how far they have moved.
create index if not exists idx_ig_prospects_user_stage
  on public.ig_prospects (user_id, stage_reached, created_at desc);
