-- Add webhook support to client_workflows
ALTER TABLE client_workflows ADD COLUMN IF NOT EXISTS webhook_id text UNIQUE;

-- Create index for webhook lookups
CREATE INDEX IF NOT EXISTS idx_client_workflows_webhook_id ON client_workflows(webhook_id);

-- Add function to generate unique webhook ID
CREATE OR REPLACE FUNCTION generate_webhook_id()
RETURNS text AS $$
SELECT 'wh_' || gen_random_uuid()::text;
$$ LANGUAGE SQL;

-- Add policy for webhook executions
-- Service role can look up workflows by webhook_id
CREATE POLICY "Webhooks can look up workflows"
  ON client_workflows
  FOR SELECT
  USING (true);
