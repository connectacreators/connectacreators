-- 20260513_a12_lifecycle_sync_dualwrite.sql
-- Update the scheduler -> video_edits.lifecycle_status sync trigger to also
-- write the legacy (status, post_status) pair during the Phase 1 dual-write
-- window. Mapping matches src/lib/lifecycleStatus.ts splitLegacy():
--   Scheduled       -> status=Done,           post_status=Scheduled
--   Published       -> status=Done,           post_status=Published
--   Needs Revisions -> status=Needs Revision, post_status=Unpublished

CREATE OR REPLACE FUNCTION public.sync_lifecycle_from_scheduled_post() RETURNS trigger AS $$
DECLARE
  new_lifecycle    text;
  legacy_status    text;
  legacy_post      text;
BEGIN
  IF NEW.editing_queue_id IS NULL THEN
    RETURN NEW;
  END IF;

  new_lifecycle := CASE NEW.status
    WHEN 'draft'      THEN NULL
    WHEN 'scheduled'  THEN 'Scheduled'
    WHEN 'publishing' THEN 'Scheduled'
    WHEN 'published'  THEN 'Published'
    WHEN 'partial'    THEN 'Needs Revisions'
    WHEN 'failed'     THEN 'Needs Revisions'
    ELSE NULL
  END;

  IF new_lifecycle IS NULL THEN
    RETURN NEW;
  END IF;

  -- Phase 1 dual-write: keep legacy columns in sync
  CASE new_lifecycle
    WHEN 'Scheduled'       THEN legacy_status := 'Done';            legacy_post := 'Scheduled';
    WHEN 'Published'       THEN legacy_status := 'Done';            legacy_post := 'Published';
    WHEN 'Needs Revisions' THEN legacy_status := 'Needs Revision';  legacy_post := 'Unpublished';
    ELSE                          legacy_status := NULL;            legacy_post := NULL;
  END CASE;

  UPDATE public.video_edits
     SET lifecycle_status = new_lifecycle,
         status           = COALESCE(legacy_status, status),
         post_status      = COALESCE(legacy_post, post_status)
   WHERE id = NEW.editing_queue_id
     AND COALESCE(lifecycle_status, '') IS DISTINCT FROM new_lifecycle;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
