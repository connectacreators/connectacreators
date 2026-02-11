
-- Allow clients to update their own script_lines
CREATE POLICY "Client can update own script_lines"
ON public.script_lines
FOR UPDATE
USING (EXISTS (SELECT 1 FROM scripts s WHERE s.id = script_lines.script_id AND is_own_client(s.client_id)));

-- Allow clients to delete their own script_lines
CREATE POLICY "Client can delete own script_lines"
ON public.script_lines
FOR DELETE
USING (EXISTS (SELECT 1 FROM scripts s WHERE s.id = script_lines.script_id AND is_own_client(s.client_id)));

-- Allow videographers to update assigned script_lines
CREATE POLICY "Videographer can update assigned script_lines"
ON public.script_lines
FOR UPDATE
USING (EXISTS (SELECT 1 FROM scripts s WHERE s.id = script_lines.script_id AND is_assigned_client(s.client_id)));

-- Allow videographers to delete assigned script_lines
CREATE POLICY "Videographer can delete assigned script_lines"
ON public.script_lines
FOR DELETE
USING (EXISTS (SELECT 1 FROM scripts s WHERE s.id = script_lines.script_id AND is_assigned_client(s.client_id)));
