-- Add storage-related columns to video_edits for direct upload support
ALTER TABLE video_edits ADD COLUMN IF NOT EXISTS storage_path TEXT;
ALTER TABLE video_edits ADD COLUMN IF NOT EXISTS storage_url TEXT;
ALTER TABLE video_edits ADD COLUMN IF NOT EXISTS upload_source TEXT DEFAULT 'gdrive';
ALTER TABLE video_edits ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT;
ALTER TABLE video_edits ADD COLUMN IF NOT EXISTS file_expires_at TIMESTAMPTZ;
ALTER TABLE video_edits ADD COLUMN IF NOT EXISTS record_expires_at TIMESTAMPTZ;
