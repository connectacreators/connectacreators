-- 20260513_a09_client_approval.sql
-- Adds the client-approval gate: posts submitted via the composer land in the
-- content calendar awaiting client approval. The dispatcher only fires
-- targets whose parent has been approved.

ALTER TABLE public.scheduled_posts
  ADD COLUMN IF NOT EXISTS client_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_approved_by uuid REFERENCES auth.users(id);

-- Index for fast "approved & due" scans
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_approved
  ON public.scheduled_posts (client_approved_at, status)
  WHERE client_approved_at IS NOT NULL;

-- Rebuild claim_scheduler_batch to require approval
CREATE OR REPLACE FUNCTION public.claim_scheduler_batch(p_force_post_id uuid DEFAULT NULL)
RETURNS TABLE (id uuid, scheduled_post_id uuid, platform text, attempt_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT t.id AS target_id
    FROM public.scheduled_post_targets t
    JOIN public.scheduled_posts p ON p.id = t.scheduled_post_id
    WHERE t.status = 'pending'
      AND (t.next_attempt_at IS NULL OR t.next_attempt_at <= now())
      AND p.status IN ('scheduled','publishing')
      AND p.client_approved_at IS NOT NULL                      -- NEW: must be approved
      AND (p.scheduled_at <= now() OR p.mode = 'autopost')
      AND (p_force_post_id IS NULL OR p.id = p_force_post_id)
    ORDER BY t.next_attempt_at NULLS FIRST, t.created_at
    LIMIT 50
    FOR UPDATE OF t SKIP LOCKED
  )
  UPDATE public.scheduled_post_targets t
  SET status = 'publishing', attempt_count = t.attempt_count + 1
  WHERE t.id IN (SELECT due.target_id FROM due)
  RETURNING t.id, t.scheduled_post_id, t.platform, t.attempt_count;
END;
$$;
