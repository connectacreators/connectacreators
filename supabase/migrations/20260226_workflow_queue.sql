-- Create workflow execution queue table for long-running tasks
CREATE TABLE IF NOT EXISTS workflow_execution_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES client_workflows(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  execution_id uuid REFERENCES workflow_executions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending', -- pending | processing | completed | failed | retry
  scheduled_for timestamp with time zone NOT NULL,
  trigger_data jsonb NOT NULL,
  workflow_steps jsonb NOT NULL,
  error_message text,
  retry_count integer DEFAULT 0,
  max_retries integer DEFAULT 3,
  last_attempted_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_workflow_queue_status
  ON workflow_execution_queue(status);

CREATE INDEX IF NOT EXISTS idx_workflow_queue_scheduled
  ON workflow_execution_queue(scheduled_for)
  WHERE status IN ('pending', 'retry');

CREATE INDEX IF NOT EXISTS idx_workflow_queue_workflow_id
  ON workflow_execution_queue(workflow_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_workflow_queue_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS workflow_queue_update_timestamp ON workflow_execution_queue;
CREATE TRIGGER workflow_queue_update_timestamp
  BEFORE UPDATE ON workflow_execution_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_workflow_queue_timestamp();

-- Enable RLS
ALTER TABLE workflow_execution_queue ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their queued jobs
CREATE POLICY "Users can view queued executions"
  ON workflow_execution_queue
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM client_workflows cw
      WHERE cw.id = workflow_execution_queue.workflow_id
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

-- Policy: Service role can manage queue
CREATE POLICY "Service role manages queue"
  ON workflow_execution_queue
  FOR ALL
  USING (true)
  WITH CHECK (true);
