-- Phase 2: Normalized step execution tracking
-- This replaces the JSONB blob in workflow_executions.steps_results
-- Allows efficient querying and analytics per step

CREATE TABLE workflow_step_executions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id        uuid        NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
  workflow_id         uuid        NOT NULL REFERENCES client_workflows(id) ON DELETE CASCADE,
  client_id           uuid        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  step_id             text        NOT NULL,     -- matches WorkflowStep.id
  step_index          integer     NOT NULL,     -- 0-based position in steps array
  service             text        NOT NULL,     -- 'email', 'sms', 'notion', 'webhook', 'filter', 'delay', 'sheets'
  action              text,                     -- 'send_email', 'create_record', 'if_condition', etc.
  step_label          text,                     -- human-readable label from workflow
  status              text        NOT NULL DEFAULT 'idle',     -- 'idle' | 'running' | 'completed' | 'failed' | 'skipped'
  input_data          jsonb,                   -- resolved config values after variable interpolation
  output_data         jsonb,                   -- step output bundle
  error_message       text,
  error_code          text,
  attempt_number      integer     NOT NULL DEFAULT 1,
  started_at          timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz,
  duration_ms         integer,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX idx_wse_execution_id   ON workflow_step_executions(execution_id);
CREATE INDEX idx_wse_workflow_id    ON workflow_step_executions(workflow_id);
CREATE INDEX idx_wse_client_id      ON workflow_step_executions(client_id);
CREATE INDEX idx_wse_step_id        ON workflow_step_executions(step_id);
CREATE INDEX idx_wse_service        ON workflow_step_executions(service);
CREATE INDEX idx_wse_status         ON workflow_step_executions(status);
CREATE INDEX idx_wse_started_at     ON workflow_step_executions(started_at DESC);

-- Composite index for per-step failure rate analytics (find failed steps quickly)
CREATE INDEX idx_wse_workflow_service_status ON workflow_step_executions(workflow_id, service, status);

-- Index for finding slow steps
CREATE INDEX idx_wse_slow_steps ON workflow_step_executions(workflow_id, duration_ms DESC) WHERE duration_ms > 5000;

-- Enable RLS
ALTER TABLE workflow_step_executions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users view their step executions"
  ON workflow_step_executions FOR SELECT
  USING (
    client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
  );

CREATE POLICY "Service role manages step executions"
  ON workflow_step_executions FOR ALL
  USING (true) WITH CHECK (true);

-- Add helper function to aggregate step stats per workflow
CREATE OR REPLACE FUNCTION get_workflow_step_stats(workflow_id_param uuid)
RETURNS TABLE (
  service text,
  total_executions bigint,
  success_count bigint,
  failure_count bigint,
  success_rate numeric,
  avg_duration_ms numeric
) AS $$
  SELECT
    wse.service,
    COUNT(*) as total_executions,
    COUNT(*) FILTER (WHERE wse.status = 'completed') as success_count,
    COUNT(*) FILTER (WHERE wse.status = 'failed') as failure_count,
    ROUND(
      COUNT(*) FILTER (WHERE wse.status = 'completed')::numeric / COUNT(*)::numeric * 100,
      2
    ) as success_rate,
    ROUND(AVG(wse.duration_ms)::numeric, 2) as avg_duration_ms
  FROM workflow_step_executions wse
  WHERE wse.workflow_id = workflow_id_param
  GROUP BY wse.service
  ORDER BY total_executions DESC;
$$ LANGUAGE SQL;
