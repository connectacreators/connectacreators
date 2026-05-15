-- supabase/migrations/20260515_viral_videos_unification.sql

-- 1. Schema columns on viral_videos.
ALTER TABLE viral_videos
  ADD COLUMN IF NOT EXISTS video_file_url        TEXT,
  ADD COLUMN IF NOT EXISTS video_file_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS analysis_status       TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS analysis_error        TEXT;

-- Valid states: 'pending' | 'analyzing' | 'analyzed' | 'failed'.
ALTER TABLE viral_videos
  DROP CONSTRAINT IF EXISTS viral_videos_analysis_status_chk;

ALTER TABLE viral_videos
  ADD CONSTRAINT viral_videos_analysis_status_chk
  CHECK (analysis_status IN ('pending', 'analyzing', 'analyzed', 'failed'));

-- 2. Backfill: existing rows count as 'analyzed' only if BOTH transcript and
-- visual breakdown exist. Rows with just a transcript stay 'pending' so the
-- unified analyzer can fill in the visual breakdown gap. The shared analyzer
-- short-circuits the Whisper step when transcript IS NOT NULL.
UPDATE viral_videos
  SET analysis_status = 'analyzed'
  WHERE transcribed_at IS NOT NULL
    AND framework_meta IS NOT NULL
    AND framework_meta ? 'visual_segments';

-- 3. Indexes.
CREATE INDEX IF NOT EXISTS idx_viral_videos_file_expires
  ON viral_videos (video_file_expires_at)
  WHERE video_file_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_viral_videos_analysis_status
  ON viral_videos (analysis_status, scraped_at DESC);

-- 4. Storage bucket for video files. Mirrors the existing 'footage' bucket policy.
INSERT INTO storage.buckets (id, name, public)
  VALUES ('viral-videos', 'viral-videos', false)
  ON CONFLICT (id) DO NOTHING;

-- 5. RLS for the bucket: authenticated users can read, service role writes.
DROP POLICY IF EXISTS "viral-videos: authenticated read" ON storage.objects;
CREATE POLICY "viral-videos: authenticated read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'viral-videos' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "viral-videos: service role write" ON storage.objects;
CREATE POLICY "viral-videos: service role write"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'viral-videos' AND auth.role() = 'service_role');

DROP POLICY IF EXISTS "viral-videos: service role delete" ON storage.objects;
CREATE POLICY "viral-videos: service role delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'viral-videos' AND auth.role() = 'service_role');
