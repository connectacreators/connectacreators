-- pending_plans: structured "preview big actions" autonomy mode.
--
-- When the AI is about to execute a multi-step plan (3+ writes in one turn)
-- or any destructive action (delete_*, send_contract, mark_post_published,
-- update_lead_status to a closed state), it calls propose_plan first to
-- record the plan, then waits for the user to approve in chat. Calling
-- confirm_plan marks the row approved and the AI proceeds to execute.
--
-- This gives:
--   - An audit trail of what was about to happen
--   - A structured cue the frontend can render as a checklist card later
--   - Server-side enforcement that destructive multi-step actions don't
--     fire without an explicit confirmation token

create table if not exists pending_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade,
  summary text not null,            -- short user-facing description
  steps jsonb not null,             -- array of {tool, description, input}
  status text not null default 'pending',  -- pending | approved | rejected | executed | failed
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  rejected_at timestamptz,
  executed_at timestamptz,
  notes text                        -- model's "why" or post-execution result
);

create index if not exists pending_plans_open
  on pending_plans(user_id, created_at desc)
  where status = 'pending';

create index if not exists pending_plans_recent
  on pending_plans(user_id, created_at desc);

alter table pending_plans enable row level security;

drop policy if exists "users see own plans" on pending_plans;
create policy "users see own plans"
  on pending_plans for select
  using (auth.uid() = user_id);

drop policy if exists "users update own plans" on pending_plans;
create policy "users update own plans"
  on pending_plans for update
  using (auth.uid() = user_id);
