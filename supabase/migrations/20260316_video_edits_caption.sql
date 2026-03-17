-- supabase/migrations/20260316_video_edits_caption.sql
ALTER TABLE video_edits ADD COLUMN IF NOT EXISTS caption TEXT;
