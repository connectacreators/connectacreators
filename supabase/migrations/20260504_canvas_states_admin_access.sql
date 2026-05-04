-- supabase/migrations/20260504_canvas_states_admin_access.sql
-- canvas_states was the only client-scoped table whose RLS only allowed
-- `auth.uid() = user_id` (the literal canvas owner). Admins and agency
-- owners couldn't see a client's canvas — they got an empty new canvas
-- because the SELECT returned 0 rows for them.
--
-- Mirror the is_admin() pattern already on canvas_ai_chats / scripts /
-- script_folders, plus add the agency-owner pattern via is_owned_client().

CREATE POLICY canvas_states_admin_all
  ON public.canvas_states
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY canvas_states_agency_owner
  ON public.canvas_states
  FOR ALL
  USING (is_owned_client(client_id))
  WITH CHECK (is_owned_client(client_id));
