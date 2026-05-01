-- Subclient Cleanup + Schema Hardening (2026-04-10)
-- Problem: Subclients were indistinguishable from primary billing clients.
-- Fields like plan_type, subscription_status, credits were all NULL, creating ambiguity.
-- client_limit was not enforced server-side, and not updated on plan changes.

-- 1. Add explicit parent_subscriber_id column to clients
--    NULL = primary billing client, non-NULL = subclient under that subscriber
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS parent_subscriber_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_clients_parent_subscriber_id
  ON clients(parent_subscriber_id) WHERE parent_subscriber_id IS NOT NULL;

-- 2. Backfill parent_subscriber_id from subscriber_clients junction
UPDATE clients c
SET parent_subscriber_id = sc.subscriber_user_id
FROM subscriber_clients sc
WHERE sc.client_id = c.id
  AND sc.is_primary = false
  AND c.parent_subscriber_id IS NULL;

-- 3. Normalize existing subclient state: mark them as 'subclient' and clear plan fields
--    This makes them clearly distinct from billing clients and prevents accidental
--    matching in VALID_STATUSES checks.
UPDATE clients
SET
  subscription_status = 'subclient',
  plan_type = NULL,
  credits_balance = 0,
  credits_monthly_cap = 0,
  credits_used = 0,
  stripe_customer_id = NULL,
  trial_ends_at = NULL,
  credits_reset_at = NULL
WHERE parent_subscriber_id IS NOT NULL
  AND (subscription_status IS NULL OR subscription_status = 'inactive');

-- 4. Replace create_client_for_subscriber RPC to:
--    a) Enforce client_limit server-side (prevent UI bypass)
--    b) Set parent_subscriber_id explicitly
--    c) Mark subclient state correctly (subscription_status = 'subclient')
CREATE OR REPLACE FUNCTION public.create_client_for_subscriber(_name text, _email text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  _client_id UUID;
  _uid UUID;
  _current_count INT;
  _limit INT;
BEGIN
  _uid := auth.uid();
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT is_user() THEN
    RAISE EXCEPTION 'Not a subscriber';
  END IF;

  -- Enforce client_limit server-side
  SELECT COUNT(*) INTO _current_count
    FROM subscriber_clients
    WHERE subscriber_user_id = _uid AND is_primary = false;

  SELECT COALESCE(client_limit, 1) INTO _limit
    FROM subscriptions
    WHERE user_id = _uid
    LIMIT 1;

  IF _limit IS NULL THEN
    _limit := 1;
  END IF;

  IF _current_count >= _limit THEN
    RAISE EXCEPTION 'Client limit reached (%/%)', _current_count, _limit;
  END IF;

  -- Create client with explicit subclient markers
  INSERT INTO clients (
    name,
    email,
    owner_user_id,
    parent_subscriber_id,
    subscription_status,
    plan_type,
    credits_balance,
    credits_monthly_cap,
    credits_used
  )
  VALUES (
    _name,
    _email,
    _uid,
    _uid,
    'subclient',
    NULL,
    0,
    0,
    0
  )
  RETURNING id INTO _client_id;

  -- Create junction entry
  INSERT INTO subscriber_clients (subscriber_user_id, client_id, is_primary)
  VALUES (_uid, _client_id, false);

  RETURN _client_id;
END;
$function$;

-- 5. Ensure RLS policies allow reading 'subclient' status clients via junction
--    (The existing subscriber_clients policies should cover this)

COMMENT ON COLUMN clients.parent_subscriber_id IS 'Non-NULL = subclient owned by this subscriber. NULL = primary billing client.';
