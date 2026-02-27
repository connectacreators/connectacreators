-- Phase 2: Trigger event audit log
-- Logs all inbound trigger events independently of workflow execution
-- Provides replay capability and event audit trail

CREATE TABLE workflow_trigger_events (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id         uuid        REFERENCES client_workflows(id) ON DELETE SET NULL,
  client_id           uuid        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  trigger_type        text        NOT NULL,   -- 'facebook_lead' | 'webhook' | 'schedule' | 'manual' | 'status_changed'
  trigger_source      text,                   -- 'facebook-webhook-receiver' | 'workflow-webhook' | 'update-lead-status'
  raw_payload         jsonb       NOT NULL,   -- original unmodified inbound payload (for audit/replay)
  normalized_data     jsonb,                  -- standardized trigger_data after normalization
  fingerprint         text,                   -- deduplication key (SHA-256 hash of key fields)
  deduplicated        boolean     NOT NULL DEFAULT false,
  execution_id        uuid        REFERENCES workflow_executions(id) ON DELETE SET NULL,
  received_at         timestamptz NOT NULL DEFAULT now(),
  processed_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Deduplication index: prevent duplicate processing of same event
CREATE UNIQUE INDEX idx_wte_fingerprint_dedup
  ON workflow_trigger_events(workflow_id, fingerprint)
  WHERE fingerprint IS NOT NULL;

-- Lookup indexes
CREATE INDEX idx_wte_workflow_id  ON workflow_trigger_events(workflow_id);
CREATE INDEX idx_wte_client_id    ON workflow_trigger_events(client_id);
CREATE INDEX idx_wte_fingerprint  ON workflow_trigger_events(fingerprint);
CREATE INDEX idx_wte_received_at  ON workflow_trigger_events(received_at DESC);
CREATE INDEX idx_wte_trigger_type ON workflow_trigger_events(trigger_type);

-- Find unprocessed events
CREATE INDEX idx_wte_unprocessed ON workflow_trigger_events(received_at)
  WHERE processed_at IS NULL;

-- Enable RLS
ALTER TABLE workflow_trigger_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users view their trigger events"
  ON workflow_trigger_events FOR SELECT
  USING (
    client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
  );

CREATE POLICY "Service role manages trigger events"
  ON workflow_trigger_events FOR ALL
  USING (true) WITH CHECK (true);

-- Helper function: compute SHA-256 fingerprint of event for deduplication
-- Usage: SELECT compute_event_fingerprint('{"email": "test@example.com", "name": "John"}');
CREATE OR REPLACE FUNCTION compute_event_fingerprint(payload jsonb)
RETURNS text AS $$
  SELECT encode(
    digest(payload::text, 'sha256'),
    'hex'
  );
$$ LANGUAGE SQL IMMUTABLE;

-- Helper function: get duplicate events
CREATE OR REPLACE FUNCTION get_duplicate_events(hours_back int DEFAULT 24)
RETURNS TABLE (
  fingerprint text,
  first_seen timestamptz,
  last_seen timestamptz,
  occurrence_count bigint,
  trigger_type text
) AS $$
  SELECT
    wte.fingerprint,
    MIN(wte.received_at) as first_seen,
    MAX(wte.received_at) as last_seen,
    COUNT(*) as occurrence_count,
    wte.trigger_type
  FROM workflow_trigger_events wte
  WHERE wte.received_at > NOW() - make_interval(hours => hours_back)
    AND wte.fingerprint IS NOT NULL
  GROUP BY wte.fingerprint, wte.trigger_type
  HAVING COUNT(*) > 1
  ORDER BY occurrence_count DESC;
$$ LANGUAGE SQL;
