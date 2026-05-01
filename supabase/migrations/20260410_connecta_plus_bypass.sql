-- Connecta Plus Credit Bypass (2026-04-10)
-- Agency clients (plan_type='connecta_plus') get unlimited feature usage.
-- Credit deductions for these users are logged but skip actual balance changes.

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
  v_new_total     INTEGER;
  v_plan_type     TEXT;
BEGIN
  IF p_cost = 0 THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  -- Connecta Plus bypass: agency clients get unlimited usage
  SELECT plan_type INTO v_plan_type FROM clients WHERE id = p_client_id;
  IF v_plan_type = 'connecta_plus' THEN
    INSERT INTO credit_transactions (client_id, action, credits, balance_after, metadata)
      VALUES (p_client_id, p_action, p_cost, 0, jsonb_build_object('bypassed', true, 'plan_type', 'connecta_plus'));
    RETURN jsonb_build_object('ok', true, 'bypassed', true);
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

  v_new_total := (COALESCE(v_balance, 0) - v_from_plan) + (COALESCE(v_topup_balance, 0) - v_from_topup);

  INSERT INTO credit_transactions (client_id, action, credits, balance_after, metadata)
    VALUES (p_client_id, p_action, p_cost, v_new_total, jsonb_build_object(
      'from_plan', v_from_plan,
      'from_topup', v_from_topup
    ));

  RETURN jsonb_build_object('ok', true, 'from_plan', v_from_plan, 'from_topup', v_from_topup);
END;
$function$;
