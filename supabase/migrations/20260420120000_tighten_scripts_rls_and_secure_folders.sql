-- =============================================================================
-- 2026-04-20: Tighten scripts RLS and secure script_folders
--
-- PROBLEM: Scripts, script_lines, and script_folders were anon-readable:
--   * scripts + script_lines had `CREATE POLICY ... TO anon USING (true)`
--     to support /s/:id sharing — but this leaked ALL scripts to anon,
--     not just shared ones.
--   * script_folders was created out-of-band via UI without RLS enabled.
--
-- FIX:
--   * Drop the overbroad anon policies on scripts + script_lines.
--     /s/:id now goes through the `get-public-script` edge function which
--     uses the service role, bypassing RLS entirely.
--   * Enable RLS on script_folders with owner-scoped policies mirroring
--     the pattern on scripts (admin, user, videographer, subscriber).
-- =============================================================================

-- ── 1. Remove the anon-read leaks on scripts + script_lines ──────────────────

DROP POLICY IF EXISTS "Public can view scripts by id" ON public.scripts;
DROP POLICY IF EXISTS "Public can view script_lines" ON public.script_lines;


-- ── 2. Secure script_folders ─────────────────────────────────────────────────
-- The table exists in production but has no RLS. Enable RLS and add
-- policies mirroring scripts so the folder tree is scoped to the owning
-- user / assigned videographer / subscribed viewer / admin.

ALTER TABLE public.script_folders ENABLE ROW LEVEL SECURITY;

-- Drop any policies that may have been created manually in the dashboard,
-- so we start clean. Names below are best-effort guesses; harmless if absent.
DROP POLICY IF EXISTS "Enable read access for all users" ON public.script_folders;
DROP POLICY IF EXISTS "Enable all for authenticated" ON public.script_folders;
DROP POLICY IF EXISTS "Allow all" ON public.script_folders;
DROP POLICY IF EXISTS "Admin full access script_folders" ON public.script_folders;
DROP POLICY IF EXISTS "Client can view own script_folders" ON public.script_folders;
DROP POLICY IF EXISTS "Client can insert own script_folders" ON public.script_folders;
DROP POLICY IF EXISTS "Client can update own script_folders" ON public.script_folders;
DROP POLICY IF EXISTS "Client can delete own script_folders" ON public.script_folders;
DROP POLICY IF EXISTS "User can view owned client script_folders" ON public.script_folders;
DROP POLICY IF EXISTS "User can insert owned client script_folders" ON public.script_folders;
DROP POLICY IF EXISTS "User can update owned client script_folders" ON public.script_folders;
DROP POLICY IF EXISTS "User can delete owned client script_folders" ON public.script_folders;
DROP POLICY IF EXISTS "Videographer can view assigned script_folders" ON public.script_folders;
DROP POLICY IF EXISTS "Videographer can insert assigned script_folders" ON public.script_folders;
DROP POLICY IF EXISTS "Videographer can update assigned script_folders" ON public.script_folders;
DROP POLICY IF EXISTS "Videographer can delete assigned script_folders" ON public.script_folders;
DROP POLICY IF EXISTS "subscriber_select_script_folders" ON public.script_folders;
DROP POLICY IF EXISTS "subscriber_insert_script_folders" ON public.script_folders;
DROP POLICY IF EXISTS "subscriber_update_script_folders" ON public.script_folders;
DROP POLICY IF EXISTS "subscriber_delete_script_folders" ON public.script_folders;

-- Admin
CREATE POLICY "Admin full access script_folders"
  ON public.script_folders FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Legacy "Client" role (is_own_client — original owner model)
CREATE POLICY "Client can view own script_folders"
  ON public.script_folders FOR SELECT
  USING (is_own_client(client_id));

CREATE POLICY "Client can insert own script_folders"
  ON public.script_folders FOR INSERT
  WITH CHECK (is_own_client(client_id));

CREATE POLICY "Client can update own script_folders"
  ON public.script_folders FOR UPDATE
  USING (is_own_client(client_id));

CREATE POLICY "Client can delete own script_folders"
  ON public.script_folders FOR DELETE
  USING (is_own_client(client_id));

-- User role (owner of the client, via owner_user_id)
CREATE POLICY "User can view owned client script_folders"
  ON public.script_folders FOR SELECT TO authenticated
  USING (is_owned_client(client_id));

CREATE POLICY "User can insert owned client script_folders"
  ON public.script_folders FOR INSERT TO authenticated
  WITH CHECK (is_owned_client(client_id));

CREATE POLICY "User can update owned client script_folders"
  ON public.script_folders FOR UPDATE TO authenticated
  USING (is_owned_client(client_id));

CREATE POLICY "User can delete owned client script_folders"
  ON public.script_folders FOR DELETE TO authenticated
  USING (is_owned_client(client_id));

-- Videographer (assigned client)
CREATE POLICY "Videographer can view assigned script_folders"
  ON public.script_folders FOR SELECT
  USING (is_assigned_client(client_id));

CREATE POLICY "Videographer can insert assigned script_folders"
  ON public.script_folders FOR INSERT
  WITH CHECK (is_assigned_client(client_id));

CREATE POLICY "Videographer can update assigned script_folders"
  ON public.script_folders FOR UPDATE
  USING (is_assigned_client(client_id));

CREATE POLICY "Videographer can delete assigned script_folders"
  ON public.script_folders FOR DELETE
  USING (is_assigned_client(client_id));

-- Subscriber (added clients)
CREATE POLICY "subscriber_select_script_folders"
  ON public.script_folders FOR SELECT
  USING (public.is_subscriber_client(client_id));

CREATE POLICY "subscriber_insert_script_folders"
  ON public.script_folders FOR INSERT
  WITH CHECK (public.is_subscriber_client(client_id));

CREATE POLICY "subscriber_update_script_folders"
  ON public.script_folders FOR UPDATE
  USING (public.is_subscriber_client(client_id));

CREATE POLICY "subscriber_delete_script_folders"
  ON public.script_folders FOR DELETE
  USING (public.is_subscriber_client(client_id));
