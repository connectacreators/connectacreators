-- Corrective migration: resolve the client's editor AND strategist from the
-- existing team table `videographer_clients` (the generic team↔client junction),
-- not from dedicated columns. Supersedes 20260612_strategist_assignee_automation.sql.
-- Applied to prod via MCP on 2026-06-12; idempotent.

-- Drop the redundant per-client/per-row columns.
ALTER TABLE public.clients DROP COLUMN IF EXISTS editor_user_id;
ALTER TABLE public.clients DROP COLUMN IF EXISTS strategist_user_id;
ALTER TABLE public.video_edits DROP COLUMN IF EXISTS editor_user_id;
ALTER TABLE public.video_edits DROP COLUMN IF EXISTS editor_name;

CREATE OR REPLACE FUNCTION public.video_edits_workflow_automation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_user uuid; c_name text;
  ed_user uuid; ed_name text;
  st_user uuid; st_name text; admin_n int;
BEGIN
  -- (A) Schedule handoff: lifecycle -> Scheduled hands the row to its client.
  IF NEW.lifecycle_status = 'Scheduled'
     AND NEW.lifecycle_status IS DISTINCT FROM OLD.lifecycle_status THEN
    SELECT user_id, name INTO c_user, c_name FROM public.clients WHERE id = NEW.client_id;
    IF c_user IS NOT NULL THEN
      NEW.assignee_user_id := c_user;
      NEW.assignee := c_name;
    END IF;
  END IF;

  -- (B) Footage handoff: raw footage first appears -> assign the client's editor
  --     (the editor-role member on videographer_clients) and mark Needs Revisions.
  IF (OLD.storage_path IS NULL AND NEW.storage_path IS NOT NULL)
     OR (COALESCE(OLD.footage, '') = '' AND COALESCE(NEW.footage, '') <> '') THEN
    SELECT vc.videographer_user_id INTO ed_user
    FROM public.videographer_clients vc
    JOIN public.user_roles ur ON ur.user_id = vc.videographer_user_id AND ur.role = 'editor'
    WHERE vc.client_id = NEW.client_id
    LIMIT 1;
    IF ed_user IS NOT NULL THEN
      SELECT display_name INTO ed_name FROM public.profiles WHERE user_id = ed_user;
      NEW.assignee_user_id := ed_user;
      NEW.assignee := ed_name;
    END IF;
    NEW.status := 'Needs Revision';
    NEW.post_status := 'Unpublished';
    NEW.lifecycle_status := 'Needs Revisions';
  END IF;

  -- (C) Editor-cut handoff: the editor's submission changes -> assign the client's
  --     strategist (content_strategist member on videographer_clients), falling back
  --     to the sole admin, for review. Fires on every new cut (the revision loop).
  IF NEW.file_submission IS NOT NULL AND NEW.file_submission IS DISTINCT FROM OLD.file_submission THEN
    SELECT vc.videographer_user_id INTO st_user
    FROM public.videographer_clients vc
    JOIN public.user_roles ur ON ur.user_id = vc.videographer_user_id AND ur.role = 'content_strategist'
    WHERE vc.client_id = NEW.client_id
    LIMIT 1;
    IF st_user IS NULL THEN
      SELECT count(*) INTO admin_n FROM public.user_roles WHERE role = 'admin';
      IF admin_n = 1 THEN
        SELECT user_id INTO st_user FROM public.user_roles WHERE role = 'admin' LIMIT 1;
      END IF;
    END IF;
    IF st_user IS NOT NULL THEN
      SELECT display_name INTO st_name FROM public.profiles WHERE user_id = st_user;
      NEW.assignee_user_id := st_user;
      NEW.assignee := st_name;
    END IF;
    NEW.status := 'Needs Revision';
    NEW.post_status := 'Unpublished';
    NEW.lifecycle_status := 'Needs Revisions';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_video_edits_workflow ON public.video_edits;
CREATE TRIGGER trg_video_edits_workflow
BEFORE UPDATE ON public.video_edits
FOR EACH ROW
EXECUTE FUNCTION public.video_edits_workflow_automation();
