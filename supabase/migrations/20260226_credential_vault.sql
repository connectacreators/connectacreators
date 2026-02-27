-- Phase 2: Encrypted credential vault
-- Stores per-client credentials (API keys, OAuth tokens, SMTP passwords) securely

CREATE TABLE credential_vault (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid    NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id         uuid    REFERENCES auth.users(id) ON DELETE SET NULL,
  service         text    NOT NULL,   -- 'zoho_email' | 'twilio' | 'notion' | 'google_sheets' | 'sendgrid' | etc.
  label           text    NOT NULL,   -- Human-readable name: "Main Zoho Account", "Development API Key"
  credential_type text    NOT NULL,   -- 'smtp_password' | 'oauth2_token' | 'api_key' | 'service_account_json'

  -- Encrypted credential data (AES-256-GCM via Postgres pgcrypto)
  -- Format: { iv, ciphertext, tag } as JSON for easy storage
  encrypted_data  jsonb   NOT NULL,   -- { "iv": "...", "ciphertext": "...", "tag": "..." }
  encryption_key_id text  NOT NULL DEFAULT 'v1',   -- key rotation version

  -- OAuth2-specific metadata (unencrypted, for checking expiry)
  oauth_access_token_expires_at   timestamptz,
  oauth_refresh_token_exists      boolean DEFAULT false,
  oauth_scopes                    text[],

  -- Status and audit
  is_active       boolean NOT NULL DEFAULT true,
  last_used_at    timestamptz,
  last_rotated_at timestamptz,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_cv_client_id ON credential_vault(client_id);
CREATE INDEX idx_cv_service ON credential_vault(service);
CREATE INDEX idx_cv_created_at ON credential_vault(created_at DESC);
CREATE INDEX idx_cv_oauth_expiry ON credential_vault(oauth_access_token_expires_at)
  WHERE oauth_access_token_expires_at IS NOT NULL;

-- Audit log for credential access (for security compliance)
CREATE TABLE credential_access_log (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id   uuid        NOT NULL REFERENCES credential_vault(id) ON DELETE CASCADE,
  accessed_by     text        NOT NULL,   -- 'execute-workflow' | 'test-workflow-step' | 'user:{user_id}'
  access_type     text        NOT NULL,   -- 'read' | 'rotate' | 'delete'
  execution_id    uuid        REFERENCES workflow_executions(id) ON DELETE SET NULL,
  ip_address      inet,
  user_agent      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_cal_credential_id ON credential_access_log(credential_id);
CREATE INDEX idx_cal_created_at    ON credential_access_log(created_at DESC);
CREATE INDEX idx_cal_access_type   ON credential_access_log(access_type);

-- Enable RLS
ALTER TABLE credential_vault ENABLE ROW LEVEL SECURITY;
ALTER TABLE credential_access_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Credentials are sensitive - only owner and service role can read
CREATE POLICY "Owners read own credentials"
  ON credential_vault FOR SELECT
  USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));

CREATE POLICY "Service role manages credentials"
  ON credential_vault FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Users view their access logs"
  ON credential_access_log FOR SELECT
  USING (
    credential_id IN (
      SELECT id FROM credential_vault WHERE
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Service role manages access logs"
  ON credential_access_log FOR ALL
  USING (true) WITH CHECK (true);

-- Helper function: rotate credential (update key version)
-- This is called during key rotation to re-encrypt all credentials with new key
CREATE OR REPLACE FUNCTION rotate_credential_key(
  old_key_id text,
  new_key_id text
)
RETURNS TABLE (rotated_count int) AS $$
  -- In production, this would:
  -- 1. Decrypt with old_key_id using crypto function
  -- 2. Re-encrypt with new_key_id
  -- 3. Update encryption_key_id
  -- This requires a trigger or application-level implementation
  -- since pgcrypto doesn't support dynamic key management
  SELECT COUNT(*)::int FROM credential_vault
  WHERE encryption_key_id = old_key_id;
$$ LANGUAGE SQL;

-- Helper function: check token expiry
CREATE OR REPLACE FUNCTION get_expiring_oauth_tokens(hours_remaining int DEFAULT 24)
RETURNS TABLE (
  id uuid,
  service text,
  label text,
  expires_in text
) AS $$
  SELECT
    cv.id,
    cv.service,
    cv.label,
    AGE(cv.oauth_access_token_expires_at, NOW())::text
  FROM credential_vault cv
  WHERE cv.oauth_access_token_expires_at IS NOT NULL
    AND cv.oauth_access_token_expires_at < NOW() + make_interval(hours => hours_remaining)
    AND cv.is_active = true
  ORDER BY cv.oauth_access_token_expires_at ASC;
$$ LANGUAGE SQL;
