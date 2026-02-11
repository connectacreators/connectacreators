
-- Allow videographers to insert scripts for assigned clients
CREATE POLICY "Videographer can insert scripts for assigned clients"
  ON public.scripts FOR INSERT
  WITH CHECK (public.is_assigned_client(client_id));

-- Allow videographers to update scripts for assigned clients
CREATE POLICY "Videographer can update scripts for assigned clients"
  ON public.scripts FOR UPDATE
  USING (public.is_assigned_client(client_id));

-- Allow videographers to insert script_lines for assigned clients
CREATE POLICY "Videographer can insert assigned script_lines"
  ON public.script_lines FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.scripts s
    WHERE s.id = script_lines.script_id AND public.is_assigned_client(s.client_id)
  ));
