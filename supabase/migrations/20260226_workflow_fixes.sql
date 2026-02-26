-- Fix workflow_executions column name and add duration_ms

ALTER TABLE workflow_executions
  ADD COLUMN IF NOT EXISTS steps_results JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS duration_ms INTEGER;

-- Migrate any old data from steps_executed to steps_results
UPDATE workflow_executions
SET steps_results = steps_executed
WHERE steps_results IS NULL AND steps_executed IS NOT NULL;
