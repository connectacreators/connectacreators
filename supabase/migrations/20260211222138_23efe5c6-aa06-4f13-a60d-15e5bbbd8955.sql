
-- Drop all restrictive policies on scripts
DROP POLICY IF EXISTS "Admin full access scripts" ON public.scripts;
DROP POLICY IF EXISTS "Client can insert own scripts" ON public.scripts;
DROP POLICY IF EXISTS "Client can update own scripts" ON public.scripts;
DROP POLICY IF EXISTS "Client can view own scripts" ON public.scripts;
DROP POLICY IF EXISTS "Videographer can insert scripts for assigned clients" ON public.scripts;
DROP POLICY IF EXISTS "Videographer can update scripts for assigned clients" ON public.scripts;
DROP POLICY IF EXISTS "Videographer can view assigned scripts" ON public.scripts;

-- Recreate as PERMISSIVE (OR logic)
CREATE POLICY "Admin full access scripts"
  ON public.scripts FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Client can view own scripts"
  ON public.scripts FOR SELECT
  USING (is_own_client(client_id));

CREATE POLICY "Client can insert own scripts"
  ON public.scripts FOR INSERT
  WITH CHECK (is_own_client(client_id));

CREATE POLICY "Client can update own scripts"
  ON public.scripts FOR UPDATE
  USING (is_own_client(client_id));

CREATE POLICY "Videographer can view assigned scripts"
  ON public.scripts FOR SELECT
  USING (is_assigned_client(client_id));

CREATE POLICY "Videographer can insert scripts for assigned clients"
  ON public.scripts FOR INSERT
  WITH CHECK (is_assigned_client(client_id));

CREATE POLICY "Videographer can update scripts for assigned clients"
  ON public.scripts FOR UPDATE
  USING (is_assigned_client(client_id));

-- Also fix script_lines (same issue)
DROP POLICY IF EXISTS "Admin full access script_lines" ON public.script_lines;
DROP POLICY IF EXISTS "Client can delete own script_lines" ON public.script_lines;
DROP POLICY IF EXISTS "Client can insert own script_lines" ON public.script_lines;
DROP POLICY IF EXISTS "Client can update own script_lines" ON public.script_lines;
DROP POLICY IF EXISTS "Client can view own script_lines" ON public.script_lines;
DROP POLICY IF EXISTS "Videographer can delete assigned script_lines" ON public.script_lines;
DROP POLICY IF EXISTS "Videographer can insert assigned script_lines" ON public.script_lines;
DROP POLICY IF EXISTS "Videographer can update assigned script_lines" ON public.script_lines;
DROP POLICY IF EXISTS "Videographer can view assigned script_lines" ON public.script_lines;

CREATE POLICY "Admin full access script_lines"
  ON public.script_lines FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Client can view own script_lines"
  ON public.script_lines FOR SELECT
  USING (EXISTS (SELECT 1 FROM scripts s WHERE s.id = script_lines.script_id AND is_own_client(s.client_id)));

CREATE POLICY "Client can insert own script_lines"
  ON public.script_lines FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM scripts s WHERE s.id = script_lines.script_id AND is_own_client(s.client_id)));

CREATE POLICY "Client can update own script_lines"
  ON public.script_lines FOR UPDATE
  USING (EXISTS (SELECT 1 FROM scripts s WHERE s.id = script_lines.script_id AND is_own_client(s.client_id)));

CREATE POLICY "Client can delete own script_lines"
  ON public.script_lines FOR DELETE
  USING (EXISTS (SELECT 1 FROM scripts s WHERE s.id = script_lines.script_id AND is_own_client(s.client_id)));

CREATE POLICY "Videographer can view assigned script_lines"
  ON public.script_lines FOR SELECT
  USING (EXISTS (SELECT 1 FROM scripts s WHERE s.id = script_lines.script_id AND is_assigned_client(s.client_id)));

CREATE POLICY "Videographer can insert assigned script_lines"
  ON public.script_lines FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM scripts s WHERE s.id = script_lines.script_id AND is_assigned_client(s.client_id)));

CREATE POLICY "Videographer can update assigned script_lines"
  ON public.script_lines FOR UPDATE
  USING (EXISTS (SELECT 1 FROM scripts s WHERE s.id = script_lines.script_id AND is_assigned_client(s.client_id)));

CREATE POLICY "Videographer can delete assigned script_lines"
  ON public.script_lines FOR DELETE
  USING (EXISTS (SELECT 1 FROM scripts s WHERE s.id = script_lines.script_id AND is_assigned_client(s.client_id)));
