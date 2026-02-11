
-- Drop the overly permissive policy that allows all authenticated users to see all clients
DROP POLICY IF EXISTS "Require authentication for clients" ON public.clients;

-- Drop existing restrictive policies and recreate as PERMISSIVE
DROP POLICY IF EXISTS "Admin full access clients" ON public.clients;
DROP POLICY IF EXISTS "Client can view own record" ON public.clients;
DROP POLICY IF EXISTS "Videographer can view assigned clients" ON public.clients;

-- Recreate as PERMISSIVE policies (OR logic - at least one must match)
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
