-- Create workflow_executions table for logging workflow runs
-- Tracks each time a workflow is triggered and executed

CREATE TABLE workflow_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID REFERENCES client_workflows(id) ON DELETE SET NULL,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  trigger_data JSONB NOT NULL DEFAULT '{}',
  steps_executed JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending',   -- pending, running, completed, failed
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE workflow_executions ENABLE ROW LEVEL SECURITY;

-- Admin can view/manage all executions
CREATE POLICY "we_admin" ON workflow_executions
  FOR ALL TO authenticated
  USING (is_admin());

-- Client owners can view their own executions
CREATE POLICY "we_owner" ON workflow_executions
  FOR SELECT TO authenticated
  USING (is_own_client(client_id));

-- Create indexes for performance
CREATE INDEX idx_workflow_executions_client_id ON workflow_executions(client_id);
CREATE INDEX idx_workflow_executions_workflow_id ON workflow_executions(workflow_id);
CREATE INDEX idx_workflow_executions_status ON workflow_executions(status);
CREATE INDEX idx_workflow_executions_created_at ON workflow_executions(created_at DESC);
