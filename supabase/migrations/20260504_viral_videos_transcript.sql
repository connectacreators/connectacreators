-- Companion to 20260504_viral_videos_framework_analysis.sql.
-- That migration added transcript + framework_meta + transcribed_at for the
-- analyze-viral-video CRON orchestrator (top outliers only). This migration
-- adds the columns needed for on-demand /ai chat URL handling:
--   * transcript_status / transcript_error — gate concurrent transcription
--   * user_submitted / submitted_by — flag URLs pasted in /ai so they can
--     surface on Viral Today regardless of outlier_score / views filters
--     (which exclude null/zero values by default).

ALTER TABLE viral_videos
  ADD COLUMN IF NOT EXISTS transcript_status TEXT
    DEFAULT 'pending'
    CHECK (transcript_status IN ('pending', 'processing', 'done', 'failed')),
  ADD COLUMN IF NOT EXISTS transcript_error TEXT,
  ADD COLUMN IF NOT EXISTS user_submitted BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_viral_videos_user_submitted
  ON viral_videos (user_submitted, scraped_at DESC)
  WHERE user_submitted = true;

CREATE INDEX IF NOT EXISTS idx_viral_videos_submitted_by
  ON viral_videos (submitted_by, scraped_at DESC)
  WHERE submitted_by IS NOT NULL;

-- Authenticated users can update transcript/analysis fields on viral_videos
-- (needed for VideoNode write-back of canvas-side transcription, and for the
-- draft_script lazy-transcribe path). Service role retains full access.
DROP POLICY IF EXISTS "auth update viral_videos transcript" ON viral_videos;
CREATE POLICY "auth update viral_videos transcript" ON viral_videos
  FOR UPDATE
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
