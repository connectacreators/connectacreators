-- No Stripe trial periods. The app's free trial is the 1,000 credits
-- every user gets from the DB default on signup.

-- 1. Migrate legacy plan_type='free' → NULL (same as all other free-tier users)
UPDATE public.clients SET plan_type = NULL WHERE plan_type = 'free';

-- 2. Move any leftover 'trialing' rows to 'active'
UPDATE public.clients
SET
  subscription_status = 'active',
  trial_ends_at = NULL,
  credits_balance = GREATEST(credits_balance, credits_monthly_cap),
  credits_used = 0
WHERE subscription_status = 'trialing';

-- 3. Remove dead legacy 'trial' value
UPDATE public.clients SET subscription_status = 'active' WHERE subscription_status = 'trial';
