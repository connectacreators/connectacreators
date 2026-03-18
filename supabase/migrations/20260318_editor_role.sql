-- Migration: Editor Role Support
-- Adds assignee_user_id to video_edits and RLS policies for editor access

-- 1. Add assignee_user_id to video_edits
ALTER TABLE public.video_edits
  ADD COLUMN IF NOT EXISTS assignee_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. RLS: allow team members (admin/videographer/editor) to read other team member profiles
--    Uses has_role() SECURITY DEFINER helper — safely bypasses user_roles RLS
CREATE POLICY "Team members can read team profiles"
  ON public.profiles FOR SELECT
  USING (
    (
      public.has_role(profiles.user_id, 'admin')
      OR public.has_role(profiles.user_id, 'videographer')
      OR public.has_role(profiles.user_id, 'editor')
    )
    AND (
      public.is_admin()
      OR public.has_role(auth.uid(), 'videographer')
      OR public.has_role(auth.uid(), 'editor')
    )
  );

-- 3. RLS: editors can read clients for their assigned clients (needed for client picker)
--    Videographers already have "Videographer can view assigned clients" policy
CREATE POLICY "Editor can view assigned clients"
  ON public.clients FOR SELECT
  USING (
    public.has_role(auth.uid(), 'editor')
    AND public.is_assigned_client(id)
  );
