-- Phase 1: Foundation columns for full Zapier-like workflow system

-- Add columns for trigger type support and enable/disable toggle
ALTER TABLE client_workflows
  ADD COLUMN IF NOT EXISTS trigger_type TEXT DEFAULT 'new_lead',
  ADD COLUMN IF NOT EXISTS trigger_config JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_triggered_at TIMESTAMPTZ;

-- Comment explaining trigger_type values
-- 'new_lead' = Facebook Lead Ads webhook
-- 'lead_status_changed' = Trigger on lead status change
-- 'schedule' = Recurring schedule/cron
-- 'manual' = Manual trigger via UI button

-- Create index on trigger_type for faster lookups
CREATE INDEX IF NOT EXISTS idx_client_workflows_trigger_type
  ON client_workflows(trigger_type);

-- Create index on is_active for querying enabled workflows
CREATE INDEX IF NOT EXISTS idx_client_workflows_is_active
  ON client_workflows(is_active);
