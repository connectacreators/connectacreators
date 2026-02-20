
-- Create vault_templates table
CREATE TABLE public.vault_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled Template',
  source_url TEXT,
  transcription TEXT,
  structure_analysis JSONB,
  template_lines JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.vault_templates ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admin full access vault_templates"
ON public.vault_templates FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

-- Client can manage own templates
CREATE POLICY "Client can manage own vault_templates"
ON public.vault_templates FOR ALL
USING (is_own_client(client_id))
WITH CHECK (is_own_client(client_id));

-- Videographer can view assigned client templates
CREATE POLICY "Videographer can view assigned vault_templates"
ON public.vault_templates FOR SELECT
USING (is_assigned_client(client_id));

-- Videographer can insert for assigned clients
CREATE POLICY "Videographer can insert assigned vault_templates"
ON public.vault_templates FOR INSERT
WITH CHECK (is_assigned_client(client_id));

-- Videographer can delete assigned client templates
CREATE POLICY "Videographer can delete assigned vault_templates"
ON public.vault_templates FOR DELETE
USING (is_assigned_client(client_id));
