-- companion_alerts: proactive surfacing layer for Robby.
--
-- Background scanner (scan_companion_alerts() function below, scheduled via
-- pg_cron) populates this table with things the user should see but hasn't
-- asked about: stuck clients, approved scripts past their record window,
-- edits past deadline, leads gone cold, monthly revenue behind goal.
--
-- The companion-chat edge function reads open alerts at request time. When
-- alerts exist the system prompt inserts a one-liner so Robby knows to
-- surface 1-2 urgent items naturally in his next response.
--
-- Tools `get_open_alerts` and `dismiss_alert` let the model read and clear.

create table if not exists companion_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade,
  kind text not null,              -- 'stuck_client' | 'script_unrecorded' | 'edit_overdue' | 'lead_stale' | 'revenue_behind'
  severity text not null default 'normal',  -- 'low' | 'normal' | 'high'
  title text not null,             -- short user-facing line
  body text,                       -- optional longer context
  payload jsonb not null default '{}'::jsonb,
  -- Dedupe: re-running the scan must not stack identical alerts. Each
  -- detector picks a stable key like 'stuck_client:<client_id>' or
  -- 'script_unrecorded:<script_id>'. Combined with a partial unique index
  -- on (user_id, dedupe_key) where dismissed_at is null, the scanner can
  -- safely INSERT … ON CONFLICT DO NOTHING.
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  dismissed_at timestamptz
);

create unique index if not exists companion_alerts_dedupe_open
  on companion_alerts(user_id, dedupe_key)
  where dismissed_at is null;

create index if not exists companion_alerts_open
  on companion_alerts(user_id, severity, created_at desc)
  where dismissed_at is null;

alter table companion_alerts enable row level security;

drop policy if exists "users see own alerts" on companion_alerts;
create policy "users see own alerts"
  on companion_alerts for select
  using (auth.uid() = user_id);

drop policy if exists "users update own alerts" on companion_alerts;
create policy "users update own alerts"
  on companion_alerts for update
  using (auth.uid() = user_id);

-- The service role (used by edge functions) bypasses RLS so the scanner
-- and the AI tools can read/write any user's alerts. No additional grant
-- needed since service_role is already exempt from RLS.

-- ────────────────────────────────────────────────────────────────────
-- Scanner: detects all five alert kinds for every user with clients.
-- Idempotent: ON CONFLICT DO NOTHING via the partial unique index.
-- Run via pg_cron every 6 hours.
-- ────────────────────────────────────────────────────────────────────

create or replace function scan_companion_alerts()
returns table (kind text, inserted bigint)
language plpgsql
security definer
as $$
declare
  monthly_progress numeric;
begin
  -- Fraction of the current month elapsed (0.0 – 1.0). Used to decide if
  -- "MTD < 50% of goal" is alarming yet.
  monthly_progress := extract(epoch from now() - date_trunc('month', now()))
                      / extract(epoch from (date_trunc('month', now()) + interval '1 month' - date_trunc('month', now())));

  -- 1. stuck_client — no published post in 14d for any active client.
  -- video_edits doesn't have a separate posted_at; we use schedule_date
  -- alongside post_status='Published' as the proxy for "when it landed".
  insert into companion_alerts (user_id, client_id, kind, severity, title, body, payload, dedupe_key)
  select
    c.user_id,
    c.id,
    'stuck_client',
    'high',
    'No posts in 14+ days: ' || c.name,
    'Last published post for ' || c.name || ' was over 14 days ago. They are losing momentum.',
    jsonb_build_object('last_post_date', max(ve.schedule_date)),
    'stuck_client:' || c.id::text
  from clients c
  left join video_edits ve
    on ve.client_id = c.id
   and ve.post_status = 'Published'
   and ve.deleted_at is null
  where c.user_id is not null
  group by c.user_id, c.id, c.name
  having coalesce(max(ve.schedule_date), '2000-01-01'::timestamptz) < now() - interval '14 days'
  on conflict (user_id, dedupe_key) where dismissed_at is null do nothing;

  -- 2. script_unrecorded — Approved scripts older than 7 days, not yet recorded.
  insert into companion_alerts (user_id, client_id, kind, severity, title, body, payload, dedupe_key)
  select
    c.user_id,
    s.client_id,
    'script_unrecorded',
    'normal',
    'Script approved 7+ days ago, not recorded: ' || coalesce(s.idea_ganadora, s.title, '(untitled)'),
    'For ' || c.name || ': "' || coalesce(s.idea_ganadora, s.title, 'untitled') || '" was approved on ' || to_char(s.created_at, 'YYYY-MM-DD') || ' but is still not marked recorded.',
    jsonb_build_object('script_id', s.id, 'created_at', s.created_at),
    'script_unrecorded:' || s.id::text
  from scripts s
  join clients c on c.id = s.client_id
  where c.user_id is not null
    and s.status = 'Approved'
    and (s.grabado is null or s.grabado = false)
    and s.created_at < now() - interval '7 days'
  on conflict (user_id, dedupe_key) where dismissed_at is null do nothing;

  -- 3. edit_overdue — video_edits past deadline, not yet Done. Body now
  -- includes footage status so Robby doesn't claim the editor needs to
  -- chase the footage when it's already attached.
  insert into companion_alerts (user_id, client_id, kind, severity, title, body, payload, dedupe_key)
  select
    c.user_id,
    ve.client_id,
    'edit_overdue',
    'high',
    'Edit past deadline: ' || ve.reel_title,
    'For ' || c.name || ': "' || ve.reel_title || '" was due ' || to_char(ve.deadline, 'YYYY-MM-DD') ||
    ' and is still ' || coalesce(ve.status, 'not started') ||
    case
      when coalesce(ve.footage, ve.file_url, ve.file_submission, ve.storage_path, ve.storage_url) is not null
        then '. Footage IS attached — the bottleneck is the editor, not the client.'
      else '. No footage uploaded yet — the client still needs to film.'
    end,
    jsonb_build_object(
      'video_edit_id', ve.id,
      'deadline', ve.deadline,
      'status', ve.status,
      'assignee', ve.assignee,
      'has_footage', coalesce(ve.footage, ve.file_url, ve.file_submission, ve.storage_path, ve.storage_url) is not null
    ),
    'edit_overdue:' || ve.id::text
  from video_edits ve
  join clients c on c.id = ve.client_id
  where c.user_id is not null
    and ve.deleted_at is null
    and ve.deadline is not null
    and ve.deadline < now()
    and (ve.status is null or ve.status not in ('Done', 'Published'))
  on conflict (user_id, dedupe_key) where dismissed_at is null do nothing;

  -- 4. lead_stale — leads with next_follow_up_at in the past, not closed.
  insert into companion_alerts (user_id, client_id, kind, severity, title, body, payload, dedupe_key)
  select
    c.user_id,
    l.client_id,
    'lead_stale',
    'normal',
    'Follow-up overdue: ' || l.name,
    'Lead ' || l.name || ' for ' || c.name || ' was supposed to be followed up on ' || to_char(l.next_follow_up_at, 'YYYY-MM-DD') || '. Status: ' || coalesce(l.status, 'unknown') || '.',
    jsonb_build_object('lead_id', l.id, 'next_follow_up_at', l.next_follow_up_at, 'status', l.status),
    'lead_stale:' || l.id::text
  from leads l
  join clients c on c.id = l.client_id
  where c.user_id is not null
    and l.next_follow_up_at is not null
    and l.next_follow_up_at < now()
    and coalesce(l.status, '') not in ('lost', 'booked', 'closed', 'won')
  on conflict (user_id, dedupe_key) where dismissed_at is null do nothing;

  -- 5. revenue_behind — MTD < 50% of monthly_revenue_goal once we're past
  --    70% of the month. Per-client alert.
  if monthly_progress > 0.7 then
    insert into companion_alerts (user_id, client_id, kind, severity, title, body, payload, dedupe_key)
    select
      c.user_id,
      cs.client_id,
      'revenue_behind',
      'high',
      'Revenue behind goal: ' || c.name,
      c.name || ' is at $' || coalesce(cs.monthly_revenue_actual, 0)::text || ' of $' || coalesce(cs.monthly_revenue_goal, 0)::text || ' goal with ' || round((1 - monthly_progress) * 100)::text || '% of the month left.',
      jsonb_build_object(
        'actual', coalesce(cs.monthly_revenue_actual, 0),
        'goal', coalesce(cs.monthly_revenue_goal, 0),
        'month_progress_pct', round(monthly_progress * 100)
      ),
      'revenue_behind:' || cs.client_id::text || ':' || to_char(now(), 'YYYY-MM')
    from client_strategies cs
    join clients c on c.id = cs.client_id
    where c.user_id is not null
      and cs.monthly_revenue_goal > 0
      and coalesce(cs.monthly_revenue_actual, 0) < cs.monthly_revenue_goal * 0.5
    on conflict (user_id, dedupe_key) where dismissed_at is null do nothing;
  end if;

  -- Auto-dismiss: clean up alerts whose underlying condition is no longer
  -- true so the user doesn't see stale items.
  -- a. stuck_client → mark dismissed if a post landed in last 14d
  update companion_alerts a
  set dismissed_at = now()
  where a.kind = 'stuck_client'
    and a.dismissed_at is null
    and exists (
      select 1 from video_edits ve
      where ve.client_id = a.client_id
        and ve.post_status = 'Published'
        and ve.deleted_at is null
        and ve.schedule_date >= now() - interval '14 days'
    );

  -- b. script_unrecorded → mark dismissed if the script is now recorded
  update companion_alerts a
  set dismissed_at = now()
  where a.kind = 'script_unrecorded'
    and a.dismissed_at is null
    and exists (
      select 1 from scripts s
      where s.id::text = a.payload->>'script_id'
        and s.grabado = true
    );

  -- c. edit_overdue → dismissed if the edit is now Done/Published
  update companion_alerts a
  set dismissed_at = now()
  where a.kind = 'edit_overdue'
    and a.dismissed_at is null
    and exists (
      select 1 from video_edits ve
      where ve.id::text = a.payload->>'video_edit_id'
        and ve.status in ('Done', 'Published')
    );

  -- d. lead_stale → dismissed if status moved to a closed state OR follow-up was bumped past now
  update companion_alerts a
  set dismissed_at = now()
  where a.kind = 'lead_stale'
    and a.dismissed_at is null
    and exists (
      select 1 from leads l
      where l.id::text = a.payload->>'lead_id'
        and (
          l.status in ('lost', 'booked', 'closed', 'won')
          or (l.next_follow_up_at is not null and l.next_follow_up_at > now())
        )
    );

  -- Return per-kind open counts for observability. Qualify column names with
  -- an alias so the OUT parameter `kind` doesn't shadow companion_alerts.kind.
  return query
    select 'stuck_client'::text, count(*) from companion_alerts ca where ca.kind = 'stuck_client' and ca.dismissed_at is null
    union all
    select 'script_unrecorded', count(*) from companion_alerts ca where ca.kind = 'script_unrecorded' and ca.dismissed_at is null
    union all
    select 'edit_overdue', count(*) from companion_alerts ca where ca.kind = 'edit_overdue' and ca.dismissed_at is null
    union all
    select 'lead_stale', count(*) from companion_alerts ca where ca.kind = 'lead_stale' and ca.dismissed_at is null
    union all
    select 'revenue_behind', count(*) from companion_alerts ca where ca.kind = 'revenue_behind' and ca.dismissed_at is null;
end;
$$;

-- ────────────────────────────────────────────────────────────────────
-- Schedule the scanner every 6 hours via pg_cron. If pg_cron isn't
-- available, this CREATE EXTENSION is a no-op and the schedule call
-- silently fails — the scanner can still be invoked manually.
-- ────────────────────────────────────────────────────────────────────

create extension if not exists pg_cron;

-- Drop any prior schedule before re-creating
do $$
begin
  perform cron.unschedule('scan-companion-alerts');
exception when others then null;
end$$;

select cron.schedule('scan-companion-alerts', '0 */6 * * *', $$select scan_companion_alerts();$$);
