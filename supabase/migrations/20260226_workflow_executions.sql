-- Create workflow_executions table for tracking test runs and analytics
CREATE TABLE IF NOT EXISTS workflow_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES client_workflows(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  trigger_data jsonb,
  status text NOT NULL DEFAULT 'running', -- 'running' | 'completed' | 'failed'
  started_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,
  duration_ms integer,
  steps_results jsonb, -- Array of step execution results
  last_failed_step text, -- Store the name/label of the last failed step for analytics
  error text,
  created_at timestamp with time zone DEFAULT now()
);

-- Create indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow_id
  ON workflow_executions(workflow_id);

CREATE INDEX IF NOT EXISTS idx_workflow_executions_client_id
  ON workflow_executions(client_id);

CREATE INDEX IF NOT EXISTS idx_workflow_executions_created_at
  ON workflow_executions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_executions_status
  ON workflow_executions(status);

-- Enable RLS for workflow_executions
ALTER TABLE workflow_executions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view executions for their workflows
CREATE POLICY "Users can view their workflow executions"
  ON workflow_executions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM client_workflows cw
      WHERE cw.id = workflow_executions.workflow_id
      AND (
        cw.client_id IN (
          SELECT client_id FROM clients WHERE user_id = auth.uid()
        )
        OR auth.uid() IN (
          SELECT user_id FROM clients WHERE id = cw.client_id
        )
      )
    )
  );

-- Policy: Service role can insert executions
CREATE POLICY "Service role can insert executions"
  ON workflow_executions
  FOR INSERT
  WITH CHECK (true);

-- Policy: Service role can update executions
CREATE POLICY "Service role can update executions"
  ON workflow_executions
  FOR UPDATE
  USING (true)
  WITH CHECK (true);
