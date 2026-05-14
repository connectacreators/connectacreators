-- 20260513_a11_rollup_fix.sql
-- Fix rollup_scheduled_post_status: a freshly-submitted post with all pending
-- targets should stay 'scheduled', not jump to 'publishing'. Only count
-- truly in-flight (publishing) targets toward the 'publishing' transition.

CREATE OR REPLACE FUNCTION public.rollup_scheduled_post_status() RETURNS trigger AS $$
DECLARE
  c_pending    int;
  c_publishing int;
  c_published  int;
  c_failed     int;
  c_total      int;
  parent_id    uuid;
BEGIN
  parent_id := COALESCE(NEW.scheduled_post_id, OLD.scheduled_post_id);

  SELECT
    count(*) FILTER (WHERE status = 'pending'),
    count(*) FILTER (WHERE status = 'publishing'),
    count(*) FILTER (WHERE status = 'published'),
    count(*) FILTER (WHERE status = 'failed'),
    count(*)
  INTO c_pending, c_publishing, c_published, c_failed, c_total
  FROM public.scheduled_post_targets WHERE scheduled_post_id = parent_id;

  UPDATE public.scheduled_posts
  SET status = CASE
    WHEN c_total = 0                                                  THEN status
    WHEN c_publishing > 0                                             THEN 'publishing'
    WHEN c_pending > 0 AND c_published = 0 AND c_failed = 0           THEN status        -- all queued; keep scheduled
    WHEN c_published = c_total                                        THEN 'published'
    WHEN c_failed = c_total                                           THEN 'failed'
    WHEN c_published > 0 AND c_failed > 0 AND c_pending = 0           THEN 'partial'
    ELSE status                                                                          -- mixed-with-pending: keep current
  END
  WHERE id = parent_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
