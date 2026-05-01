-- Make canvas AI chats shared across the team that has access to a client.
-- Before: chats were scoped to the creating user (owner-only RLS) so collaborators
-- on the same canvas couldn't see each other's conversations.
-- After: any subscriber linked to the client (and admins) can read/write all
-- chats for that client+node. The user_id column is preserved for "created by"
-- attribution but no longer gates access.

DROP POLICY IF EXISTS canvas_ai_chats_own ON canvas_ai_chats;
DROP POLICY IF EXISTS canvas_ai_chats_admin ON canvas_ai_chats;

CREATE POLICY "canvas_ai_chats_admin_all" ON canvas_ai_chats
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "canvas_ai_chats_subscriber_all" ON canvas_ai_chats
  FOR ALL
  USING (public.is_subscriber_client(client_id))
  WITH CHECK (public.is_subscriber_client(client_id));
