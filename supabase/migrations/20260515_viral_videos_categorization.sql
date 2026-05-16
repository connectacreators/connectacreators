-- supabase/migrations/20260515_viral_videos_categorization.sql

ALTER TABLE viral_videos
  ADD COLUMN IF NOT EXISTS content_format TEXT,
  ADD COLUMN IF NOT EXISTS primary_niche  TEXT;

-- Format is a closed enum: one of 11 slugs or NULL.
ALTER TABLE viral_videos
  DROP CONSTRAINT IF EXISTS viral_videos_content_format_chk;
ALTER TABLE viral_videos
  ADD CONSTRAINT viral_videos_content_format_chk
  CHECK (
    content_format IS NULL OR content_format IN (
      'caption_post', 'storytelling', 'educational', 'comparison',
      'authority', 'reaction', 'listicle', 'tutorial', 'vlog',
      'selling', 'funny'
    )
  );

-- primary_niche has no CHECK — it's an extensible vocabulary; AI may add new slugs.

CREATE INDEX IF NOT EXISTS idx_viral_videos_format
  ON viral_videos (content_format)
  WHERE content_format IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_viral_videos_niche
  ON viral_videos (primary_niche)
  WHERE primary_niche IS NOT NULL;

-- Covers the most common combination: format selected + sort by outlier_score desc.
CREATE INDEX IF NOT EXISTS idx_viral_videos_format_outlier
  ON viral_videos (content_format, outlier_score DESC)
  WHERE content_format IS NOT NULL;
