-- 20260513_a14_unschedule_revert_lifecycle.sql
-- When a scheduled_post is deleted (Unschedule action), revert the linked
-- editing-queue row's lifecycle_status back to 'In progress' so it shows
-- as un-scheduled again — UNLESS the post was already 'Published' (we
-- don't roll back a successful publish), and only if no other scheduled
-- post for the same editing_queue_id is still live.

CREATE OR REPLACE FUNCTION public.revert_lifecycle_on_scheduled_post_delete() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  other_count int;
  current_lifecycle text;
BEGIN
  IF OLD.editing_queue_id IS NULL THEN
    RETURN OLD;
  END IF;

  -- Don't roll back a successful publish.
  IF OLD.status = 'published' THEN
    RETURN OLD;
  END IF;

  -- Only revert if no other scheduled_post for this editing-queue row is
  -- still active (sharing the same parent row, multi-post case).
  SELECT count(*) INTO other_count
  FROM public.scheduled_posts
  WHERE editing_queue_id = OLD.editing_queue_id
    AND id <> OLD.id
    AND status NOT IN ('draft');

  IF other_count > 0 THEN
    RETURN OLD;  -- something else still owns the lifecycle
  END IF;

  -- Only revert if current lifecycle came from the scheduler (Scheduled /
  -- Needs Revisions). Leaves manually-set values like 'In progress' /
  -- 'Not started' alone.
  SELECT lifecycle_status INTO current_lifecycle
  FROM public.video_edits WHERE id = OLD.editing_queue_id;

  IF current_lifecycle IN ('Scheduled', 'Needs Revisions') THEN
    UPDATE public.video_edits
       SET lifecycle_status = 'In progress',
           status           = 'In progress',
           post_status      = 'Unpublished'
     WHERE id = OLD.editing_queue_id;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS scheduled_posts_revert_lifecycle ON public.scheduled_posts;
CREATE TRIGGER scheduled_posts_revert_lifecycle
  AFTER DELETE ON public.scheduled_posts
  FOR EACH ROW EXECUTE FUNCTION public.revert_lifecycle_on_scheduled_post_delete();
