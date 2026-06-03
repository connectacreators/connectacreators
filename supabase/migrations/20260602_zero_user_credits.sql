-- Zero user credits to halt Anthropic API spend
--
-- Why: We're getting charged for app-side AI usage faster than expected.
-- Zeroing every client's plan + topup credit balances stops non-admin users
-- from consuming AI credits until we re-enable.
--
-- Who keeps working: admin / videographer / editor / connecta_plus roles
-- short-circuit BEFORE the credit check inside `deduct_credits_atomic`
-- (see supabase/functions/ai-assistant/index.ts → deductCredits), so they
-- continue working unaffected. Free / trial / paid-non-Plus users will get
-- an "insufficient_credits" response.
--
-- Snapshot: original balances are captured below into
-- `clients_credit_snapshot_20260602` so we can restore exactly with:
--
--   UPDATE clients c
--      SET credits_balance       = s.credits_balance,
--          topup_credits_balance = s.topup_credits_balance
--     FROM clients_credit_snapshot_20260602 s
--    WHERE c.id = s.client_id;

BEGIN;

-- 1. Snapshot every client's current credit state
CREATE TABLE IF NOT EXISTS public.clients_credit_snapshot_20260602 (
  client_id              uuid PRIMARY KEY,
  credits_balance        integer,
  topup_credits_balance  integer,
  credits_used           integer,
  credits_monthly_cap    integer,
  captured_at            timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.clients_credit_snapshot_20260602
  (client_id, credits_balance, topup_credits_balance, credits_used, credits_monthly_cap)
SELECT
  id,
  COALESCE(credits_balance, 0),
  COALESCE(topup_credits_balance, 0),
  COALESCE(credits_used, 0),
  COALESCE(credits_monthly_cap, 0)
FROM public.clients
ON CONFLICT (client_id) DO NOTHING;

-- 2. Zero both plan and topup balances for every client
UPDATE public.clients
   SET credits_balance       = 0,
       topup_credits_balance = 0;

COMMIT;
