-- Batch analyze robustness (2026-07-15) — plan:
-- docs/superpowers/plans/2026-07-15-batch-analyze-robustness.md
--
-- ALREADY APPLIED TO PROD via Management API (do NOT `db push`; this file
-- documents the schema for the repo, per the usual dashboard/MCP-first flow).

-- Phase 2: retry transient failures with backoff. Drain only claims rows whose
-- next_attempt_at is null or past.
alter table public.viral_analyze_queue
  add column if not exists next_attempt_at timestamptz;

-- Phase 3: single-drain mutex. The drain acquires by bumping locked_until
-- (only when the current value is in the past), so a crashed drain's lock
-- self-expires after DRAIN_LOCK_TTL_MS (90s).
create table if not exists public.viral_analyze_drain_lock (
  id int primary key,
  locked_until timestamptz not null default now()
);
insert into public.viral_analyze_drain_lock (id, locked_until)
  values (1, now()) on conflict (id) do nothing;

-- Phase 5: daily failure snapshot, captured by pg_cron job 25
-- ("viral-analyze-failure-summary", 15 8 * * *) via
-- capture_analyze_failure_summary(); emailed by pg_cron job 26 calling the
-- viral-analyze-failure-summary edge function at 25 8 * * *.
create table if not exists public.viral_analyze_failure_summary (
  day date not null,
  error_class text not null,
  cnt int not null,
  done_that_day int not null,
  captured_at timestamptz not null default now(),
  primary key (day, error_class)
);

create or replace function public.capture_analyze_failure_summary()
returns void
language plpgsql
security definer
as $$
begin
  insert into public.viral_analyze_failure_summary (day, error_class, cnt, done_that_day)
  select
    (current_date - 1) as day,
    coalesce(
      case
        when error ilike '%whisper_no_text%' then 'whisper_no_text_silent'
        when error ilike '%rate-limit%' or error ilike '%login required%' then 'ig_rate_limit'
        when error ilike '%download_failed%' then 'download_failed'
        when error ilike '%audio_extract%' then 'audio_extract_failed'
        when error ilike '%gave up%' then 'retry_exhausted'
        else split_part(error, ':', 1)
      end, 'unknown') as error_class,
    count(*) as cnt,
    (select count(*) from viral_analyze_queue
      where status = 'done'
        and finished_at >= (current_date - 1) and finished_at < current_date) as done_that_day
  from viral_analyze_queue
  where status = 'failed'
    and finished_at >= (current_date - 1) and finished_at < current_date
  group by 1, 2
  on conflict (day, error_class) do update
    set cnt = excluded.cnt,
        done_that_day = excluded.done_that_day,
        captured_at = now();
end;
$$;
