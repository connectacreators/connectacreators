-- Per-call Anthropic API token usage + cost ledger.
-- One row per messages.create call, written by edge functions via service_role.
-- Read access is admin-only — gated by the existing is_admin() helper.
--
-- Pricing is computed client-side in _shared/log-anthropic-usage.ts and
-- written into cost_usd at insert time. Recomputing inside SQL would
-- require keeping a pricing table in sync; doing it in TS keeps prices
-- next to the rendering logic and lets us version the rate card in git.

create table if not exists public.anthropic_usage_log (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  function_name text not null,
  model text not null,
  input_tokens int not null default 0,
  cache_creation_tokens int not null default 0,
  cache_read_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(10, 6) not null default 0,
  metadata jsonb
);

create index if not exists anthropic_usage_log_created_at_idx
  on public.anthropic_usage_log (created_at desc);

create index if not exists anthropic_usage_log_user_created_idx
  on public.anthropic_usage_log (user_id, created_at desc);

create index if not exists anthropic_usage_log_function_created_idx
  on public.anthropic_usage_log (function_name, created_at desc);

create index if not exists anthropic_usage_log_model_created_idx
  on public.anthropic_usage_log (model, created_at desc);

alter table public.anthropic_usage_log enable row level security;

-- Read: admin only. Edge functions use service_role and bypass RLS for inserts.
drop policy if exists "admin read anthropic_usage_log" on public.anthropic_usage_log;
create policy "admin read anthropic_usage_log"
  on public.anthropic_usage_log for select
  using (is_admin());

-- No INSERT/UPDATE/DELETE policies — only service_role (edge functions) writes,
-- and service_role bypasses RLS. Authenticated users cannot mutate this table.
