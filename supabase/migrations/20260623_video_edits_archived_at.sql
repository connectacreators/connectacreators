-- Archive state for video_edits, distinct from trash (deleted_at).
-- Archived rows leave the editing queue but still count in strategy metrics.
ALTER TABLE video_edits ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_video_edits_archived_at
  ON video_edits (archived_at)
  WHERE archived_at IS NOT NULL;
