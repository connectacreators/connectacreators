-- Viral analysis reliability + background queue (2026-07-02).
-- NOTE: already applied to prod via MCP on 2026-07-02 — this file is the
-- repo record (per project convention the CLI migration tracker is not used).

-- 1. Claim timestamp so dead "analyzing" claims can be detected and retaken.
alter table viral_videos add column if not exists analysis_claimed_at timestamptz;

-- 2. Server-side bulk-analyze queue (replaces the browser-bound loop).
create table if not exists viral_analyze_queue (
  id uuid primary key default gen_random_uuid(),
  viral_video_id uuid not null references viral_videos(id) on delete cascade,
  requested_by uuid not null,
  batch_id uuid not null,
  status text not null default 'queued' check (status in ('queued','running','done','failed','skipped')),
  error text,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index if not exists viral_analyze_queue_status_idx on viral_analyze_queue (status, created_at);
create index if not exists viral_analyze_queue_batch_idx on viral_analyze_queue (batch_id);
create unique index if not exists viral_analyze_queue_active_video on viral_analyze_queue (viral_video_id) where status in ('queued','running');
alter table viral_analyze_queue enable row level security;
drop policy if exists "own queue rows" on viral_analyze_queue;
create policy "own queue rows" on viral_analyze_queue for select to authenticated using (requested_by = auth.uid());

-- 3. pg_cron jobs (created via cron.schedule on prod):
--    jobid 21 'viral_analysis_stale_sweep'  */10 * * * *
--      → fails viral_videos rows stuck 'analyzing' with claims older than 20 min
--    jobid 22 'viral-analyze-queue-drain'   * * * * *
--      → net.http_post to /functions/v1/viral-analyze-queue {"action":"drain"}
--        with the x-cron-secret header
