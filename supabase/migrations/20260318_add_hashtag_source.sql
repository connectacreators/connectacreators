-- supabase/migrations/20260318_add_hashtag_source.sql

-- Add hashtag_source column to viral_videos.
-- This column stores the sorted, comma-joined hashtag cache key for rows
-- inserted by the scrape-hashtag edge function (e.g. "fitness,travel").
-- Channel-scraped rows leave it NULL.
ALTER TABLE viral_videos ADD COLUMN IF NOT EXISTS hashtag_source TEXT;

-- Composite index for the cache guard query:
--   WHERE hashtag_source = $1 AND scraped_at > now() - interval '6 hours'
-- Partial (WHERE hashtag_source IS NOT NULL) keeps the index small — only
-- hashtag-scraped rows need it.
CREATE INDEX IF NOT EXISTS idx_viral_videos_hashtag_scraped
  ON viral_videos(hashtag_source, scraped_at DESC)
  WHERE hashtag_source IS NOT NULL;

-- Index for the full-table ORDER BY scraped_at DESC used by fetchVideos in ViralToday.
-- Without this, the paginated feed query does a sequential scan.
CREATE INDEX IF NOT EXISTS idx_viral_videos_scraped_at
  ON viral_videos(scraped_at DESC);
