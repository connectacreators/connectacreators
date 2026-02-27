// Temporary edge function to deploy migrations
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    // Use Supabase client with service role key for SQL execution
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "https://hxojqrilwhhrvloiwmfo.supabase.co",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    );

    // Migration SQL
    const migrationSql = `
-- 1. Webhook Secrets
CREATE TABLE IF NOT EXISTS webhook_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES client_workflows(id) ON DELETE CASCADE UNIQUE,
  webhook_secret text NOT NULL UNIQUE,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webhook_secret_id ON webhook_secrets(webhook_secret);

-- 2. Workflow Execution Queue
CREATE TABLE IF NOT EXISTS workflow_execution_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES client_workflows(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  execution_id uuid REFERENCES workflow_executions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
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
CREATE INDEX IF NOT EXISTS idx_workflow_queue_status ON workflow_execution_queue(status);
CREATE INDEX IF NOT EXISTS idx_workflow_queue_scheduled ON workflow_execution_queue(scheduled_for) WHERE status IN ('pending', 'retry');
CREATE INDEX IF NOT EXISTS idx_workflow_queue_workflow_id ON workflow_execution_queue(workflow_id);

-- 3. Workflow Trigger Events
CREATE TABLE IF NOT EXISTS workflow_trigger_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid REFERENCES client_workflows(id) ON DELETE SET NULL,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  trigger_type text NOT NULL,
  raw_payload jsonb NOT NULL,
  normalized_data jsonb,
  fingerprint text,
  deduplicated boolean DEFAULT false,
  execution_id uuid REFERENCES workflow_executions(id) ON DELETE SET NULL,
  received_at timestamp with time zone DEFAULT now(),
  processed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wte_workflow_id ON workflow_trigger_events(workflow_id);
CREATE INDEX IF NOT EXISTS idx_wte_client_id ON workflow_trigger_events(client_id);
CREATE INDEX IF NOT EXISTS idx_wte_received_at ON workflow_trigger_events(received_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wte_fingerprint_dedup ON workflow_trigger_events(workflow_id, fingerprint) WHERE fingerprint IS NOT NULL;

-- 4. Workflow Step Executions
CREATE TABLE IF NOT EXISTS workflow_step_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id uuid NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
  workflow_id uuid NOT NULL REFERENCES client_workflows(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  step_id text NOT NULL,
  step_index integer NOT NULL,
  service text NOT NULL,
  action text,
  step_label text,
  status text NOT NULL DEFAULT 'idle',
  input_data jsonb,
  output_data jsonb,
  error_message text,
  error_code text,
  attempt_number integer DEFAULT 1,
  started_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,
  duration_ms integer,
  created_at timestamp with time zone DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wse_execution_id ON workflow_step_executions(execution_id);
CREATE INDEX IF NOT EXISTS idx_wse_workflow_id ON workflow_step_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_wse_client_id ON workflow_step_executions(client_id);
CREATE INDEX IF NOT EXISTS idx_wse_service ON workflow_step_executions(service);
CREATE INDEX IF NOT EXISTS idx_wse_status ON workflow_step_executions(status);
CREATE INDEX IF NOT EXISTS idx_wse_workflow_service_status ON workflow_step_executions(workflow_id, service, status);
CREATE INDEX IF NOT EXISTS idx_wse_started_at ON workflow_step_executions(started_at DESC);

-- 5. Credential Vault
CREATE TABLE IF NOT EXISTS credential_vault (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  service text NOT NULL,
  label text NOT NULL,
  credential_type text NOT NULL,
  encrypted_data jsonb NOT NULL,
  encryption_key_id text DEFAULT 'v1',
  oauth_access_token_expires_at timestamp with time zone,
  oauth_refresh_token_exists boolean DEFAULT false,
  oauth_scopes text[],
  is_active boolean DEFAULT true,
  last_used_at timestamp with time zone,
  last_rotated_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cv_client_id ON credential_vault(client_id);
CREATE INDEX IF NOT EXISTS idx_cv_service ON credential_vault(service);
CREATE INDEX IF NOT EXISTS idx_cv_created_at ON credential_vault(created_at DESC);

-- 6. Credential Access Log
CREATE TABLE IF NOT EXISTS credential_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id uuid NOT NULL REFERENCES credential_vault(id) ON DELETE CASCADE,
  accessed_by text NOT NULL,
  access_type text NOT NULL,
  execution_id uuid REFERENCES workflow_executions(id) ON DELETE SET NULL,
  ip_address inet,
  user_agent text,
  created_at timestamp with time zone DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cal_credential_id ON credential_access_log(credential_id);
CREATE INDEX IF NOT EXISTS idx_cal_created_at ON credential_access_log(created_at DESC);

-- Enable RLS
ALTER TABLE webhook_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_execution_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_trigger_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_step_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE credential_vault ENABLE ROW LEVEL SECURITY;
ALTER TABLE credential_access_log ENABLE ROW LEVEL SECURITY;

-- Helper function
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
    ROUND(COUNT(*) FILTER (WHERE wse.status = 'completed')::numeric / COUNT(*)::numeric * 100, 2) as success_rate,
    ROUND(AVG(wse.duration_ms)::numeric, 2) as avg_duration_ms
  FROM workflow_step_executions wse
  WHERE wse.workflow_id = workflow_id_param
  GROUP BY wse.service
  ORDER BY total_executions DESC;
$$ LANGUAGE SQL;
`;

    // Execute using rpc if available, otherwise use raw SQL
    const { data, error } = await supabase.rpc("query", { sql: migrationSql });

    if (error) {
      console.error("RPC error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ 
        status: "success", 
        message: "Migrations deployed successfully",
        tables_created: [
          "webhook_secrets",
          "workflow_execution_queue",
          "workflow_trigger_events",
          "workflow_step_executions",
          "credential_vault",
          "credential_access_log"
        ]
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Deployment error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
