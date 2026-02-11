
-- Admin can do everything on videographer_clients
CREATE POLICY "Admin full access videographer_clients"
  ON public.videographer_clients FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Videographers can view their own assignments
CREATE POLICY "Videographer can view own assignments"
  ON public.videographer_clients FOR SELECT
  USING (videographer_user_id = auth.uid());

-- Helper: check if current user is videographer
CREATE OR REPLACE FUNCTION public.is_videographer()
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'videographer')
$$;

-- Helper: check if a client is assigned to the current videographer
CREATE OR REPLACE FUNCTION public.is_assigned_client(_client_id uuid)
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.videographer_clients
    WHERE videographer_user_id = auth.uid() AND client_id = _client_id
  )
$$;

-- Allow videographers to view assigned clients
CREATE POLICY "Videographer can view assigned clients"
  ON public.clients FOR SELECT
  USING (public.is_assigned_client(id));

-- Allow videographers to view scripts of assigned clients
CREATE POLICY "Videographer can view assigned scripts"
  ON public.scripts FOR SELECT
  USING (public.is_assigned_client(client_id));

-- Allow videographers to view script_lines of assigned clients
CREATE POLICY "Videographer can view assigned script_lines"
  ON public.script_lines FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.scripts s
    WHERE s.id = script_lines.script_id AND public.is_assigned_client(s.client_id)
  ));
