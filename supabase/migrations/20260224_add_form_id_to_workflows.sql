-- Add facebook_form_id column to client_workflows
-- Allows admin to configure which Facebook form triggers the workflow

ALTER TABLE client_workflows ADD COLUMN IF NOT EXISTS facebook_form_id TEXT;

-- Create index for form_id lookups
CREATE INDEX IF NOT EXISTS idx_client_workflows_form_id ON client_workflows(facebook_form_id);
