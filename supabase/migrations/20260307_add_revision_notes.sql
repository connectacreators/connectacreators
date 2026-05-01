-- Add revision_notes column to content_calendar table
ALTER TABLE content_calendar
ADD COLUMN IF NOT EXISTS revision_notes TEXT;

-- Add comment for clarity
COMMENT ON COLUMN content_calendar.revision_notes IS 'Admin revision feedback sent to editors, synced to Notion Revisions property';
