-- Fix create_client_for_subscriber to allow users who have an active/trial
-- subscription in the subscriptions table, not just those with role='user'.
-- This fixes the "Not a subscriber" error for users whose subscription exists
-- but whose user_roles entry was never set. Admins bypass all checks.
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
  _has_subscription BOOLEAN;
BEGIN
  _uid := auth.uid();
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = _uid AND status IN ('active', 'trial')
  ) INTO _has_subscription;

  IF NOT is_user() AND NOT is_admin() AND NOT _has_subscription THEN
    RAISE EXCEPTION 'Not a subscriber';
  END IF;

  IF NOT is_admin() THEN
    SELECT COUNT(*) INTO _current_count
      FROM subscriber_clients
      WHERE subscriber_user_id = _uid AND is_primary = false;

    SELECT COALESCE(client_limit, 1) INTO _limit
      FROM subscriptions
      WHERE user_id = _uid AND status IN ('active', 'trial')
      LIMIT 1;

    IF _limit IS NULL THEN _limit := 1; END IF;

    IF _current_count >= _limit THEN
      RAISE EXCEPTION 'Client limit reached (%/%)', _current_count, _limit;
    END IF;
  END IF;

  INSERT INTO clients (name, email, subscription_status, parent_subscriber_id)
  VALUES (_name, _email, 'subclient', _uid)
  RETURNING id INTO _client_id;

  INSERT INTO subscriber_clients (subscriber_user_id, client_id, is_primary)
  VALUES (_uid, _client_id, false)
  ON CONFLICT DO NOTHING;

  RETURN _client_id;
END;
$function$;
