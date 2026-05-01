-- ============================================================
-- P0 Scale fixes for 20+ users
-- 1. Atomic credit deduction function (eliminates race condition)
-- 2. Missing indexes for ViralToday, credits, interactions
-- ============================================================

-- ── 1. Atomic credit deduction ───────────────────────────────
-- Replaces the read-then-write pattern in all edge functions.
-- Uses SELECT FOR UPDATE to lock the row, preventing overdrafts
-- when two concurrent requests both pass the balance check.

CREATE OR REPLACE FUNCTION deduct_credits_atomic(
  p_client_id   UUID,
  p_action      TEXT,
  p_cost        INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance INTEGER;
  v_used    INTEGER;
BEGIN
  IF p_cost = 0 THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  -- Lock the row for this transaction — no other concurrent call can
  -- read or modify credits_balance until this transaction completes.
  SELECT credits_balance, credits_used
    INTO v_balance, v_used
    FROM clients
   WHERE id = p_client_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true); -- no record = staff/pass-through
  END IF;

  IF v_balance < p_cost THEN
    RETURN jsonb_build_object(
      'ok',                  false,
      'insufficient_credits', true,
      'balance',             v_balance,
      'needed',              p_cost,
      'error',               format(
        'Insufficient credits. You need %s credits but only have %s.',
        p_cost, v_balance
      )
    );
  END IF;

  UPDATE clients
     SET credits_balance = v_balance - p_cost,
         credits_used    = COALESCE(v_used, 0) + p_cost
   WHERE id = p_client_id;

  INSERT INTO credit_transactions (client_id, action, credits, metadata)
  VALUES (p_client_id, p_action, p_cost, '{}'::jsonb);

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Grant execute to service_role (used by edge functions)
GRANT EXECUTE ON FUNCTION deduct_credits_atomic(UUID, TEXT, INTEGER) TO service_role;


-- ── 2. Missing indexes ───────────────────────────────────────

-- viral_videos: ViralToday sorts by scraped_at DESC on every load
CREATE INDEX IF NOT EXISTS idx_viral_videos_scraped_at
  ON viral_videos (scraped_at DESC);

-- viral_videos: user-scoped queries (each user's own viral feed)
CREATE INDEX IF NOT EXISTS idx_viral_videos_user_id
  ON viral_videos (user_id);

-- viral_video_interactions: seen/clicked lookup per user per video
CREATE INDEX IF NOT EXISTS idx_viral_video_interactions_user_video
  ON viral_video_interactions (user_id, video_id);

-- clients: credit checks and subscription guard both filter by user_id
CREATE INDEX IF NOT EXISTS idx_clients_user_id
  ON clients (user_id);

-- canvas_media: session cleanup and listing
CREATE INDEX IF NOT EXISTS idx_canvas_media_session_id
  ON canvas_media (session_id);

-- canvas_states: active session lookup (partial index — very selective)
CREATE INDEX IF NOT EXISTS idx_canvas_states_active
  ON canvas_states (client_id, user_id)
  WHERE is_active = true;
