-- Content Strategist role + assignee workflow automation.
-- NOTE: applied to prod via MCP on 2026-06-12 (CLI tracker unreliable for this project);
-- this file is the source-of-record. All statements are idempotent.

-- 1. Content Strategist role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'content_strategist';

-- 2. Per-client assignments (null = admin fallback for strategist; null editor = no auto-assign)
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS strategist_user_id uuid REFERENCES auth.users(id);
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS editor_user_id uuid REFERENCES auth.users(id);

-- 3. Remember the editor who held a row before it was handed to the client
ALTER TABLE public.video_edits ADD COLUMN IF NOT EXISTS editor_user_id uuid;
ALTER TABLE public.video_edits ADD COLUMN IF NOT EXISTS editor_name text;

-- 4. Workflow automation trigger
CREATE OR REPLACE FUNCTION public.video_edits_workflow_automation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_user uuid; c_name text;
  ed_user uuid; ed_name text;
BEGIN
  -- (A) Schedule handoff: when a row becomes Scheduled, hand it to the client
  --     and remember the editor that held it.
  IF NEW.lifecycle_status = 'Scheduled'
     AND NEW.lifecycle_status IS DISTINCT FROM OLD.lifecycle_status THEN
    SELECT user_id, name INTO c_user, c_name FROM public.clients WHERE id = NEW.client_id;
    IF c_user IS NOT NULL THEN
      IF NEW.assignee_user_id IS DISTINCT FROM c_user THEN
        NEW.editor_user_id := NEW.assignee_user_id;
        NEW.editor_name := NEW.assignee;
      END IF;
      NEW.assignee_user_id := c_user;
      NEW.assignee := c_name;
    END IF;
  END IF;

  -- (B) Footage handoff: when RAW footage first appears (videographer upload),
  --     send it to the client's editor and mark it Needs Revisions to edit.
  IF (OLD.storage_path IS NULL AND NEW.storage_path IS NOT NULL)
     OR (COALESCE(OLD.footage, '') = '' AND COALESCE(NEW.footage, '') <> '') THEN
    SELECT editor_user_id INTO ed_user FROM public.clients WHERE id = NEW.client_id;
    IF ed_user IS NOT NULL THEN
      SELECT display_name INTO ed_name FROM public.profiles WHERE user_id = ed_user;
      NEW.assignee_user_id := ed_user;
      NEW.assignee := ed_name;
    END IF;
    NEW.status := 'Needs Revision';
    NEW.post_status := 'Unpublished';
    NEW.lifecycle_status := 'Needs Revisions';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_video_edits_schedule_handoff ON public.video_edits;
DROP TRIGGER IF EXISTS trg_video_edits_workflow ON public.video_edits;
CREATE TRIGGER trg_video_edits_workflow
BEFORE UPDATE ON public.video_edits
FOR EACH ROW
EXECUTE FUNCTION public.video_edits_workflow_automation();

DROP FUNCTION IF EXISTS public.video_edits_schedule_handoff();

-- 5. Seed: active Connecta+ clients' editor = Axel Paez (the working editor today).
--    There are 3 editor-role users, so we cannot infer a single editor; this seeds
--    the practical default. Change per client via clients.editor_user_id.
UPDATE public.clients
SET editor_user_id = '95a0a20b-a030-40af-afa1-20e2ec0b3e4c'
WHERE plan_type = 'connecta_plus' AND subscription_status = 'active' AND editor_user_id IS NULL;
