-- Create workflow_executions table for tracking workflow execution history
CREATE TABLE IF NOT EXISTS workflow_executions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_id UUID NOT NULL REFERENCES client_workflows(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  trigger_data JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'running',
  steps_results JSONB DEFAULT '[]',
  duration_ms INTEGER,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow_id
  ON workflow_executions(workflow_id);

CREATE INDEX IF NOT EXISTS idx_workflow_executions_client_id
  ON workflow_executions(client_id);

CREATE INDEX IF NOT EXISTS idx_workflow_executions_status
  ON workflow_executions(status);

CREATE INDEX IF NOT EXISTS idx_workflow_executions_created_at
  ON workflow_executions(created_at DESC);

-- Policy for authenticated users (read own workflows' execution history)
ALTER TABLE workflow_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view execution history of their workflows"
  ON workflow_executions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM client_workflows
      WHERE client_workflows.id = workflow_executions.workflow_id
      AND client_workflows.client_id = auth.uid()
    )
  );
