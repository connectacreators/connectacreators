-- 20260513_a10_lifecycle_sync.sql
-- Syncs scheduled_posts lifecycle into the unified video_edits.lifecycle_status:
--   * Submit via composer (mode != 'draft', editing_queue_id set) → 'Scheduled'
--   * All platforms succeeded                                    → 'Published'
--   * Any platform failed (partial or all-fail)                  → 'Needs Revisions'
--
-- Draft submissions don't touch the editing-queue row.
-- Manual lifecycle_status edits in the editing-queue UI are not blocked — this
-- trigger only writes when scheduler state actually changes, so admin overrides
-- still work for the rare cases where the agency posts outside the app.

CREATE OR REPLACE FUNCTION public.sync_lifecycle_from_scheduled_post() RETURNS trigger AS $$
DECLARE
  new_lifecycle text;
BEGIN
  -- Only video_edits rows linked from a scheduled_post are touched.
  IF NEW.editing_queue_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Pick the new lifecycle based on the scheduler status.
  new_lifecycle := CASE NEW.status
    WHEN 'draft'      THEN NULL                       -- don't touch the editing row for drafts
    WHEN 'scheduled'  THEN 'Scheduled'
    WHEN 'publishing' THEN 'Scheduled'                -- still in the calendar — keep label
    WHEN 'published'  THEN 'Published'
    WHEN 'partial'    THEN 'Needs Revisions'          -- any failure rolls back to revisions
    WHEN 'failed'     THEN 'Needs Revisions'
    ELSE NULL
  END;

  IF new_lifecycle IS NOT NULL THEN
    UPDATE public.video_edits
       SET lifecycle_status = new_lifecycle
     WHERE id = NEW.editing_queue_id
       AND COALESCE(lifecycle_status, '') IS DISTINCT FROM new_lifecycle;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS scheduled_posts_sync_lifecycle ON public.scheduled_posts;
CREATE TRIGGER scheduled_posts_sync_lifecycle
  AFTER INSERT OR UPDATE OF status ON public.scheduled_posts
  FOR EACH ROW EXECUTE FUNCTION public.sync_lifecycle_from_scheduled_post();
