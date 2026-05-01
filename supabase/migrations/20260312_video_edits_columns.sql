-- Add new columns to video_edits table for expanded video database
ALTER TABLE video_edits ADD COLUMN IF NOT EXISTS reel_title TEXT;
ALTER TABLE video_edits ADD COLUMN IF NOT EXISTS assignee TEXT;
ALTER TABLE video_edits ADD COLUMN IF NOT EXISTS script_url TEXT;
ALTER TABLE video_edits ADD COLUMN IF NOT EXISTS revisions TEXT;
ALTER TABLE video_edits ADD COLUMN IF NOT EXISTS footage TEXT;
ALTER TABLE video_edits ADD COLUMN IF NOT EXISTS file_submission TEXT;
ALTER TABLE video_edits ADD COLUMN IF NOT EXISTS post_status TEXT DEFAULT 'Unpublished';
ALTER TABLE video_edits ADD COLUMN IF NOT EXISTS schedule_date TIMESTAMPTZ;

-- Migrate old status values to new ones
UPDATE video_edits SET status = 'Not started' WHERE status = 'pending';
UPDATE video_edits SET status = 'In progress' WHERE status = 'in_progress';
UPDATE video_edits SET status = 'Done' WHERE status = 'completed';
UPDATE video_edits SET status = 'Not started' WHERE status = 'rejected';
