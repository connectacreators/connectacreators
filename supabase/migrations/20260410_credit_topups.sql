-- Credit Top-ups (2026-04-10)
-- Adds one-time credit packs that never expire, separate from plan credits.
-- Plan credits reset monthly, top-up credits persist indefinitely.

-- 1. Add topup_credits_balance column to clients
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS topup_credits_balance INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN clients.topup_credits_balance IS 'One-time purchased credits that never expire. Deducted after plan credits are exhausted.';

-- 2. Update deduct_credits_atomic to handle topup credits
--    Logic: deduct from plan credits first; if insufficient, pull remainder from topup.
--    If combined balance is still insufficient, fail.
CREATE OR REPLACE FUNCTION public.deduct_credits_atomic(p_client_id uuid, p_action text, p_cost integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_balance       INTEGER;
  v_used          INTEGER;
  v_topup_balance INTEGER;
  v_total         INTEGER;
  v_from_plan     INTEGER;
  v_from_topup    INTEGER;
BEGIN
  IF p_cost = 0 THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  SELECT credits_balance, credits_used, COALESCE(topup_credits_balance, 0)
    INTO v_balance, v_used, v_topup_balance
    FROM clients
    WHERE id = p_client_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  v_total := COALESCE(v_balance, 0) + COALESCE(v_topup_balance, 0);

  IF v_total < p_cost THEN
    RETURN jsonb_build_object(
      'ok', false,
      'insufficient_credits', true,
      'balance', v_balance,
      'topup_balance', v_topup_balance,
      'needed', p_cost,
      'error', format('Insufficient credits. You need %s credits but only have %s (plan: %s, top-up: %s).',
        p_cost, v_total, COALESCE(v_balance, 0), COALESCE(v_topup_balance, 0))
    );
  END IF;

  -- Deduct plan credits first, then topup for the remainder
  IF COALESCE(v_balance, 0) >= p_cost THEN
    v_from_plan := p_cost;
    v_from_topup := 0;
  ELSE
    v_from_plan := COALESCE(v_balance, 0);
    v_from_topup := p_cost - v_from_plan;
  END IF;

  UPDATE clients
    SET
      credits_balance = COALESCE(v_balance, 0) - v_from_plan,
      credits_used = COALESCE(v_used, 0) + p_cost,
      topup_credits_balance = COALESCE(v_topup_balance, 0) - v_from_topup
    WHERE id = p_client_id;

  INSERT INTO credit_transactions (client_id, action, credits, metadata)
    VALUES (p_client_id, p_action, p_cost, jsonb_build_object(
      'from_plan', v_from_plan,
      'from_topup', v_from_topup
    ));

  RETURN jsonb_build_object('ok', true, 'from_plan', v_from_plan, 'from_topup', v_from_topup);
END;
$function$;

-- 3. Helper function to add topup credits (called by webhook on payment)
CREATE OR REPLACE FUNCTION public.add_topup_credits(p_client_id uuid, p_amount integer, p_session_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_new_balance INTEGER;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid amount');
  END IF;

  -- Idempotency check: skip if this session was already processed
  IF EXISTS (
    SELECT 1 FROM credit_transactions
    WHERE client_id = p_client_id
      AND action = 'topup_purchase'
      AND metadata->>'stripe_session_id' = p_session_id
  ) THEN
    RETURN jsonb_build_object('ok', true, 'skipped', 'already_processed');
  END IF;

  UPDATE clients
    SET topup_credits_balance = COALESCE(topup_credits_balance, 0) + p_amount
    WHERE id = p_client_id
    RETURNING topup_credits_balance INTO v_new_balance;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Client not found');
  END IF;

  INSERT INTO credit_transactions (client_id, action, credits, metadata)
    VALUES (p_client_id, 'topup_purchase', p_amount, jsonb_build_object(
      'stripe_session_id', p_session_id,
      'new_topup_balance', v_new_balance
    ));

  RETURN jsonb_build_object('ok', true, 'new_topup_balance', v_new_balance);
END;
$function$;
