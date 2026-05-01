-- Subscriber Data Cleanup (2026-04-10)
-- Fixes orphaned subscription rows, duplicate entries, and impossible states
-- introduced during the webhook outage (April 4-9) and prior schema changes.

-- 1. Delete orphaned subscription rows (sub has user_id that doesn't match any client)
DELETE FROM subscriptions
WHERE user_id IS NOT NULL
  AND user_id NOT IN (SELECT user_id FROM clients WHERE user_id IS NOT NULL);

-- 2. Deduplicate by user_id — keep most recent
WITH ranked AS (
  SELECT id, user_id,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC, updated_at DESC) AS rn
  FROM subscriptions
  WHERE user_id IS NOT NULL
)
DELETE FROM subscriptions
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 3. Fix impossible states: credits_balance > credits_monthly_cap (trim to cap)
UPDATE clients
SET credits_balance = credits_monthly_cap
WHERE credits_balance > credits_monthly_cap
  AND credits_monthly_cap > 0;

-- 4. Fix wrong credit caps based on plan_type
-- starter should be 10000 (or 1000 if trialing)
UPDATE clients
SET credits_monthly_cap = 10000
WHERE plan_type = 'starter'
  AND subscription_status NOT IN ('trialing', 'subclient', 'canceled')
  AND credits_monthly_cap NOT IN (1000, 10000);

UPDATE clients
SET credits_monthly_cap = 30000
WHERE plan_type = 'growth'
  AND subscription_status NOT IN ('trialing', 'subclient', 'canceled')
  AND credits_monthly_cap != 30000;

UPDATE clients
SET credits_monthly_cap = 75000
WHERE plan_type = 'enterprise'
  AND subscription_status NOT IN ('trialing', 'subclient', 'canceled')
  AND credits_monthly_cap != 75000;

-- 5. For canceled users: restore their credits from credits_used if they were wrongly zeroed
-- (due to the subscription.deleted handler bug). We can't perfectly recover, but if
-- credits_balance is 0 and credits_used < credits_monthly_cap, restore the remainder.
UPDATE clients
SET credits_balance = GREATEST(0, COALESCE(credits_monthly_cap, 0) - COALESCE(credits_used, 0))
WHERE subscription_status = 'canceled'
  AND credits_balance = 0
  AND credits_used IS NOT NULL
  AND credits_monthly_cap > 0
  AND credits_used < credits_monthly_cap;
