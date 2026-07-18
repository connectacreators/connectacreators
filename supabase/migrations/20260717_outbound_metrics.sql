-- Outbound DM metric tracker (2026-07-17) — ALREADY APPLIED TO PROD via
-- Management API (documentation copy; never `db push`).
--
-- Mirrors the "2026 INSTAGRAM DM Metrics Tracker" spreadsheet as a
-- per-platform monthly funnel: A1 Pre-Initiated → IMS Message Seen →
-- A2 Initiated → B Engaged → C Calendly'd → D Booked, plus follows /
-- follow-backs. Conversion rates are derived in the UI. Admin-only page;
-- rows are per-admin (RLS user_id = auth.uid()).
create table if not exists public.outbound_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  pre_initiated int not null default 0 check (pre_initiated >= 0),
  message_seen  int not null default 0 check (message_seen  >= 0),
  initiated     int not null default 0 check (initiated     >= 0),
  engaged       int not null default 0 check (engaged       >= 0),
  calendly_sent int not null default 0 check (calendly_sent >= 0),
  booked        int not null default 0 check (booked        >= 0),
  follows       int not null default 0 check (follows       >= 0),
  follow_backs  int not null default 0 check (follow_backs  >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, platform, month)
);
alter table public.outbound_metrics enable row level security;
create policy outbound_metrics_own on public.outbound_metrics
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
