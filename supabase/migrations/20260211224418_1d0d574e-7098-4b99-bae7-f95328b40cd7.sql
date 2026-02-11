
-- Fix clients table: drop restrictive policies and recreate as permissive
DROP POLICY IF EXISTS "Admin full access clients" ON public.clients;
DROP POLICY IF EXISTS "Client can view own record" ON public.clients;
DROP POLICY IF EXISTS "Videographer can view assigned clients" ON public.clients;

CREATE POLICY "Admin full access clients"
  ON public.clients FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Client can view own record"
  ON public.clients FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Videographer can view assigned clients"
  ON public.clients FOR SELECT
  USING (is_assigned_client(id));
