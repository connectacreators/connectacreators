-- Migration: 20260310_followup_tables
-- Creates three tables for the AI Follow-Up Automation system.
-- Idempotent: uses IF NOT EXISTS throughout.

-- ─────────────────────────────────────────
-- 1. followup_workflows
--    Stores visual canvas state per client.
--    UNIQUE on client_id: one workflow per client (canvas is display-only for now).
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS followup_workflows (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT 'Default Workflow',
  nodes       JSONB NOT NULL DEFAULT '[]',
  edges       JSONB NOT NULL DEFAULT '[]',
  viewport    JSONB NOT NULL DEFAULT '{"x":0,"y":0,"zoom":1}',
  is_active   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT followup_workflows_client_id_unique UNIQUE (client_id)
);

ALTER TABLE followup_workflows ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'followup_workflows'
      AND policyname = 'service_role_all'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY service_role_all ON followup_workflows
        FOR ALL
        USING (true)
        WITH CHECK (true)
    $policy$;
  END IF;
END $$;

-- ─────────────────────────────────────────
-- 2. messages
--    Stores every sent (and future inbound) message per lead.
--    direction CHECK ensures only 'inbound' or 'outbound'.
--    channel CHECK ensures only 'email', 'sms', or 'whatsapp'.
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  direction   TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  channel     TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp')),
  subject     TEXT,
  body        TEXT NOT NULL,
  sent_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'messages'
      AND policyname = 'service_role_all'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY service_role_all ON messages
        FOR ALL
        USING (true)
        WITH CHECK (true)
    $policy$;
  END IF;
END $$;

-- ─────────────────────────────────────────
-- 3. client_email_settings
--    Stores per-client SMTP credentials for outbound email.
--    UNIQUE on client_id: one settings row per client.
--    smtp_password stores app passwords (Gmail/Outlook/Yahoo).
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_email_settings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  smtp_email     TEXT NOT NULL,
  smtp_password  TEXT NOT NULL,
  from_name      TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT client_email_settings_client_id_unique UNIQUE (client_id)
);

ALTER TABLE client_email_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'client_email_settings'
      AND policyname = 'service_role_all'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY service_role_all ON client_email_settings
        FOR ALL
        USING (true)
        WITH CHECK (true)
    $policy$;
  END IF;
END $$;
