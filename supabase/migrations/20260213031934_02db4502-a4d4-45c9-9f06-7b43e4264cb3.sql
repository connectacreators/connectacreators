
-- Allow anonymous/public read access to individual scripts by ID
CREATE POLICY "Public can view scripts by id"
ON public.scripts
FOR SELECT
USING (true);

-- Note: scripts already has restrictive policies, but we need a permissive one for public access
-- Actually, existing policies are RESTRICTIVE (Permissive: No), so we need a PERMISSIVE policy
-- Let's drop and recreate as permissive

DROP POLICY IF EXISTS "Public can view scripts by id" ON public.scripts;

CREATE POLICY "Public can view scripts by id"
ON public.scripts
FOR SELECT
TO anon
USING (true);

-- Allow anonymous read access to script_lines for public view
CREATE POLICY "Public can view script_lines"
ON public.script_lines
FOR SELECT
TO anon
USING (true);
