-- 20260513_a08_claim_fn.sql
-- SQL function that atomically claims a batch of due scheduled_post_targets.
-- Used by the publish-scheduled-posts edge function (the dispatcher).
-- Uses FOR UPDATE SKIP LOCKED so two concurrent dispatcher invocations
-- never claim the same row.

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

REVOKE ALL ON FUNCTION public.claim_scheduler_batch(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_scheduler_batch(uuid) TO service_role;
