-- Sync existing connecta_plus role users to subscriptions table
-- This migration converts users with role='connecta_plus' to proper subscription records

-- Create subscription records for connecta_plus role users (if they don't already exist)
INSERT INTO subscriptions (
  user_id,
  email,
  full_name,
  plan_type,
  status,
  is_manually_assigned,
  subscribed_at,
  created_at,
  updated_at
)
SELECT
  u.id,
  u.email,
  u.raw_user_meta_data->>'full_name',
  'connecta_plus',
  'active',
  false,
  NOW(),
  NOW(),
  NOW()
FROM auth.users u
INNER JOIN public.user_roles ur ON u.id = ur.user_id
WHERE ur.role = 'connecta_plus'
  AND NOT EXISTS (
    SELECT 1 FROM subscriptions s WHERE s.user_id = u.id
  )
ON CONFLICT (email) DO NOTHING;

-- Update clients table for these users to ensure subscription_status is correct
UPDATE clients
SET
  plan_type = 'connecta_plus',
  subscription_status = 'active',
  script_limit = 500
WHERE user_id IN (
  SELECT u.id
  FROM auth.users u
  INNER JOIN public.user_roles ur ON u.id = ur.user_id
  WHERE ur.role = 'connecta_plus'
);

-- Insert into clients for connecta_plus users who don't have a client record yet
INSERT INTO clients (
  user_id,
  name,
  email,
  plan_type,
  subscription_status,
  script_limit,
  created_at,
  updated_at
)
SELECT
  u.id,
  u.raw_user_meta_data->>'full_name' OR u.email,
  u.email,
  'connecta_plus',
  'active',
  500,
  NOW(),
  NOW()
FROM auth.users u
INNER JOIN public.user_roles ur ON u.id = ur.user_id
WHERE ur.role = 'connecta_plus'
  AND NOT EXISTS (
    SELECT 1 FROM clients c WHERE c.user_id = u.id
  )
ON CONFLICT (user_id) DO NOTHING;
