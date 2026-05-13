-- 20260513_a06_rollup_trigger.sql
-- Rolls up scheduled_post_targets statuses into the parent scheduled_posts.status.

CREATE OR REPLACE FUNCTION public.rollup_scheduled_post_status() RETURNS trigger AS $$
DECLARE
  c_in_flight int;
  c_published int;
  c_failed    int;
  c_total     int;
  parent_id   uuid;
BEGIN
  parent_id := COALESCE(NEW.scheduled_post_id, OLD.scheduled_post_id);

  SELECT
    count(*) FILTER (WHERE status IN ('pending','publishing')),
    count(*) FILTER (WHERE status = 'published'),
    count(*) FILTER (WHERE status = 'failed'),
    count(*)
  INTO c_in_flight, c_published, c_failed, c_total
  FROM public.scheduled_post_targets WHERE scheduled_post_id = parent_id;

  UPDATE public.scheduled_posts
  SET status = CASE
    WHEN c_total = 0                                  THEN status
    WHEN c_in_flight > 0                              THEN 'publishing'
    WHEN c_failed = c_total                           THEN 'failed'
    WHEN c_published = c_total                        THEN 'published'
    WHEN c_published > 0 AND c_failed > 0             THEN 'partial'
    ELSE status
  END
  WHERE id = parent_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER scheduled_post_targets_rollup
  AFTER INSERT OR UPDATE OF status OR DELETE ON public.scheduled_post_targets
  FOR EACH ROW EXECUTE FUNCTION public.rollup_scheduled_post_status();
