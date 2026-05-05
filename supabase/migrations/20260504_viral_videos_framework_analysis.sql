-- supabase/migrations/20260504_viral_videos_framework_analysis.sql
-- Adds transcript + structural metadata columns to viral_videos.
-- Only top outliers (5x+ AND 500k+ views) get analyzed; the rest leave these NULL.

ALTER TABLE viral_videos
  ADD COLUMN IF NOT EXISTS transcript text,
  ADD COLUMN IF NOT EXISTS hook_text text,
  ADD COLUMN IF NOT EXISTS cta_text text,
  ADD COLUMN IF NOT EXISTS framework_meta jsonb,
  ADD COLUMN IF NOT EXISTS transcribed_at timestamptz;

-- Partial index for fast filtering on analyzed videos in framework search
CREATE INDEX IF NOT EXISTS idx_viral_videos_analyzed
  ON viral_videos(transcribed_at)
  WHERE transcribed_at IS NOT NULL;

-- Partial index for the backfill query (find unanalyzed qualifying videos)
CREATE INDEX IF NOT EXISTS idx_viral_videos_qualifying_unanalyzed
  ON viral_videos(outlier_score DESC)
  WHERE transcribed_at IS NULL
    AND outlier_score >= 5
    AND views_count >= 500000;
