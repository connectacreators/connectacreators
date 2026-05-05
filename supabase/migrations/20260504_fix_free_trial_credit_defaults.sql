-- Fix free trial credit defaults.
--
-- Issue: clients.credits_balance defaulted to 250 and credits_monthly_cap to
-- 500. The handle_new_user() trigger inserts a client row without specifying
-- credit columns, so every new free signup landed at 250/500 instead of the
-- intended 1000/1000. Existing free signups also need to be corrected.
--
-- Scope of backfill:
--   - plan_type IS NULL or plan_type IN ('free') AND credits_monthly_cap IN (250, 500)
--   - Leaves all paid plans (starter / growth / enterprise / connecta_plus) untouched
--   - Leaves users with cap > 1000 untouched (they're on a higher plan or topped up)

-- 1) Column defaults
ALTER TABLE public.clients
  ALTER COLUMN credits_balance SET DEFAULT 1000,
  ALTER COLUMN credits_monthly_cap SET DEFAULT 1000;

-- 2) Backfill existing free trial users stuck at the old defaults
UPDATE public.clients
SET
  credits_monthly_cap = 1000,
  credits_balance = GREATEST(credits_balance, 1000 - COALESCE(credits_used, 0))
WHERE
  (plan_type IS NULL OR plan_type = 'free')
  AND credits_monthly_cap IN (250, 500);
