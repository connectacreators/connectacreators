-- supabase/migrations/20260709_views_goal_duration_months.sql
alter table client_strategies
  add column if not exists views_goal_duration_months smallint null default 3;

comment on column client_strategies.views_goal_duration_months is
  'Guarantee window length in months from views_goal_started_at. NULL = no deadline (default 3 preserves the prior hardcoded 90-day behavior).';
