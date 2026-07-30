-- Final-review fixes for the IG prospecting pipeline (2026-07-29) — APPLIED TO
-- PROD via Management API (documentation copy; never `db push`).
--
-- Two independent fixes, both about writes that were unsafe under concurrency:
--
-- F1/F4/F8 — apply_outbound_deltas(): the Prospects tab was applying funnel
-- deltas from the client with a read-modify-write over ALL EIGHT counters. Two
-- ways that lost real data:
--   * the SELECT's error was discarded, so a transient read failure looked like
--     "this month has no row yet" and the follow-up upsert wrote a full row of
--     zeros -- one click during a blip erased the operator's month.
--   * two quick clicks both read the same value and both wrote value+1, so a
--     ten-row targeting pass under-counted while outbound_daily_log recorded
--     all ten. The two tables then disagreed permanently.
-- Doing the increment in SQL removes both: one statement, no read to lose, and
-- the GREATEST(0, ...) clamp keeps every `>= 0` CHECK satisfied so a retreat
-- can't reject the whole row.
--
-- F2 — ig_prospects.claimed_at: the enrich function's CAS stopped two ticks
-- from claiming a row in the same instant, but a claimed row stayed
-- enrichment_status='pending' for the whole scrape, so the NEXT tick could
-- claim it again. A full batch takes ~50s against a 60s cron cadence, so that
-- overlap is the normal case, not a rare one. claimed_at is a lease: a claim
-- stamps it, the claim query skips rows leased within CLAIM_LEASE, and the
-- lease expiring is what makes this self-healing -- an invocation killed
-- mid-flight releases its rows automatically instead of stranding them.

-- ── F2: claim lease ─────────────────────────────────────────────────────────
alter table public.ig_prospects
  add column if not exists claimed_at timestamptz;

-- Claim query: pending rows under the retry ceiling whose lease is free.
create index if not exists idx_ig_prospects_claim_lease
  on public.ig_prospects (enrichment_status, enrichment_attempts, claimed_at, created_at);

-- ── F1/F4/F8: atomic funnel counter application ─────────────────────────────
-- p_deltas is {"pre_initiated": 1, "message_seen": -1, ...} — only the keys
-- being changed. Unknown keys are ignored rather than erroring, so a future
-- counter can't break an old client.
--
-- SECURITY DEFINER because it writes outbound_metrics, but it derives the owner
-- from auth.uid() and never from an argument: a caller cannot move another
-- admin's numbers. That matches outbound_metrics' own RLS (user_id =
-- auth.uid()), which this function must not be a way around.
create or replace function public.apply_outbound_deltas(
  p_platform text,
  p_month    text,
  p_deltas   jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'apply_outbound_deltas: no authenticated user';
  end if;
  if p_month !~ '^\d{4}-\d{2}$' then
    raise exception 'apply_outbound_deltas: month must be YYYY-MM, got %', p_month;
  end if;

  -- Ensure the month row exists without disturbing counters if it already does.
  insert into public.outbound_metrics (user_id, platform, month)
  values (v_user_id, p_platform, p_month)
  on conflict (user_id, platform, month) do nothing;

  -- One statement, so concurrent calls serialise on the row lock instead of
  -- racing. GREATEST(0, ...) mirrors the table's `>= 0` CHECKs: a correction
  -- that would go negative clamps to 0 rather than aborting every other delta
  -- bundled into the same call.
  update public.outbound_metrics m set
    pre_initiated = greatest(0, m.pre_initiated + coalesce((p_deltas->>'pre_initiated')::int, 0)),
    message_seen  = greatest(0, m.message_seen  + coalesce((p_deltas->>'message_seen') ::int, 0)),
    initiated     = greatest(0, m.initiated     + coalesce((p_deltas->>'initiated')    ::int, 0)),
    engaged       = greatest(0, m.engaged       + coalesce((p_deltas->>'engaged')      ::int, 0)),
    calendly_sent = greatest(0, m.calendly_sent + coalesce((p_deltas->>'calendly_sent')::int, 0)),
    booked        = greatest(0, m.booked        + coalesce((p_deltas->>'booked')       ::int, 0)),
    follows       = greatest(0, m.follows       + coalesce((p_deltas->>'follows')      ::int, 0)),
    follow_backs  = greatest(0, m.follow_backs  + coalesce((p_deltas->>'follow_backs') ::int, 0)),
    updated_at    = now()
  where m.user_id = v_user_id
    and m.platform = p_platform
    and m.month = p_month;
end;
$$;

revoke all on function public.apply_outbound_deltas(text, text, jsonb) from public;
grant execute on function public.apply_outbound_deltas(text, text, jsonb) to authenticated;
