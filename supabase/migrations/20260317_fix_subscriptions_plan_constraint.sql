-- Fix subscriptions table constraint to allow connecta_plus and connecta_dfy plan types
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_type_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_plan_type_check
  CHECK (plan_type IN ('starter', 'growth', 'enterprise', 'connecta_dfy', 'connecta_plus'));
