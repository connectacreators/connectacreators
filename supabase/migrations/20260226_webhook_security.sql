-- Add webhook_secret for HMAC signature verification
-- This secret is used to verify X-Webhook-Signature headers on inbound webhooks

ALTER TABLE client_workflows
ADD COLUMN webhook_secret text;

-- Add a comment documenting the purpose
COMMENT ON COLUMN client_workflows.webhook_secret IS 'Secret key for HMAC-SHA256 signature verification of inbound webhook payloads. Should be 64 hex characters (32 bytes).';

-- Create an index for quick lookups by webhook_secret (when verifying incoming requests)
CREATE INDEX idx_client_workflows_webhook_secret ON client_workflows(webhook_secret) WHERE webhook_secret IS NOT NULL;

-- Ensure the column is not visible in RLS results by default (credentials are sensitive)
-- This is handled at the application layer — never return webhook_secret in API responses
