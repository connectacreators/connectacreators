-- Add notes column to leads table for internal note-taking
-- Notes sync to Notion leads database when available
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT NULL;

COMMENT ON COLUMN leads.notes IS
  'Free-text notes on this lead. Syncs to Notion leads database Notes field when a Notion leads database is configured for the client.';
