-- Add soft delete column to video_edits
ALTER TABLE public.video_edits ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Partial index for efficient filtering of non-deleted video_edits
CREATE INDEX IF NOT EXISTS idx_video_edits_deleted_at ON public.video_edits(deleted_at) WHERE deleted_at IS NULL;
