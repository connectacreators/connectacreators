-- Create client_workflows table for storing Zapier-style workflow definitions
-- Phase 1: UI + persistence only, no execution engine yet

CREATE TABLE client_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'My Workflow',
  description TEXT,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE client_workflows ENABLE ROW LEVEL SECURITY;

-- Admin can manage all workflows
CREATE POLICY "client_workflows_admin" ON client_workflows
  FOR ALL TO authenticated
  USING (is_admin());

-- Client owner can manage their workflows
CREATE POLICY "client_workflows_owner" ON client_workflows
  FOR ALL TO authenticated
  USING (is_own_client(client_id));

-- Create index on client_id for faster queries
CREATE INDEX idx_client_workflows_client_id ON client_workflows(client_id);
