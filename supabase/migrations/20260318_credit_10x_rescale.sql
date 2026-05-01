-- Credit System 10x Rescale Migration
-- Multiplies all credit values by 10 for the new credit scale
-- Updates monthly caps per new plan structure
-- Opens all features (lead tracker, facebook) for all plans

-- Step 1: 10x all existing credit values
UPDATE clients SET
  credits_balance = credits_balance * 10,
  credits_used = credits_used * 10,
  credits_monthly_cap = credits_monthly_cap * 10;

UPDATE credit_transactions SET
  credits = credits * 10,
  balance_after = balance_after * 10;

-- Step 2: Update monthly caps per new plan structure
UPDATE clients SET credits_monthly_cap = 10000 WHERE plan_type = 'starter';
UPDATE clients SET credits_monthly_cap = 30000 WHERE plan_type = 'growth';
UPDATE clients SET credits_monthly_cap = 75000 WHERE plan_type = 'enterprise';

-- Step 3: Open all features for all plans
UPDATE clients SET
  lead_tracker_enabled = true,
  facebook_integration_enabled = true;
