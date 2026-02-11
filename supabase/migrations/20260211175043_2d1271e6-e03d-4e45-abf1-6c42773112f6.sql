-- Fix: Ensure only authenticated users can access the clients table
-- The current RESTRICTIVE policies require specific roles, but we should also
-- ensure the table has a baseline policy requiring authentication.
-- Since existing policies are RESTRICTIVE and already check auth.uid() or role functions,
-- we need to add a PERMISSIVE policy that gates on authentication first.

-- Drop existing restrictive policies and recreate as permissive with auth check
-- Actually the current policies are RESTRICTIVE (Permissive: No), which means ALL must pass.
-- The issue is there's no permissive policy at all, so by default nothing is allowed for anon.
-- But to be explicit, let's add a permissive baseline that requires authentication.

CREATE POLICY "Require authentication for clients"
ON public.clients
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);