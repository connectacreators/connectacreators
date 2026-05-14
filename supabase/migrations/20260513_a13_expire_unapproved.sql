-- 20260513_a13_expire_unapproved.sql
-- Auto-fail scheduled posts whose scheduled_at passes without client approval.
-- The dispatcher edge function calls this each invocation BEFORE claiming due
-- targets. Failed targets cascade through the rollup → lifecycle trigger →
-- video_edits.lifecycle_status = 'Needs Revisions', matching the user's spec:
--
-- > "by the time of posting it will fail and the reason will be
-- >  Client never approved the post"

CREATE OR REPLACE FUNCTION public.expire_unapproved_scheduled_posts() RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected int;
BEGIN
  WITH expired AS (
    SELECT t.id AS target_id
    FROM public.scheduled_post_targets t
    JOIN public.scheduled_posts p ON p.id = t.scheduled_post_id
    WHERE t.status = 'pending'
      AND p.client_approved_at IS NULL
      AND p.mode = 'scheduled'                 -- drafts + autopost are not affected
      AND p.scheduled_at IS NOT NULL
      AND p.scheduled_at <= now()
  )
  UPDATE public.scheduled_post_targets t
     SET status          = 'failed',
         last_error      = 'Client never approved the post',
         next_attempt_at = NULL,
         attempt_count   = COALESCE(t.attempt_count, 0)
   WHERE t.id IN (SELECT target_id FROM expired);

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_unapproved_scheduled_posts() FROM public;
GRANT EXECUTE ON FUNCTION public.expire_unapproved_scheduled_posts() TO service_role;
