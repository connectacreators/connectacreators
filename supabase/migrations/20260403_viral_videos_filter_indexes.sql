-- Indexes for server-side filtering on viral_videos
-- Speeds up the common filter combinations: platform, posted_at, outlier_score, views_count, engagement_rate

CREATE INDEX IF NOT EXISTS idx_viral_videos_platform ON viral_videos (platform);
CREATE INDEX IF NOT EXISTS idx_viral_videos_posted_at ON viral_videos (posted_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_viral_videos_outlier_score ON viral_videos (outlier_score DESC);
CREATE INDEX IF NOT EXISTS idx_viral_videos_views_count ON viral_videos (views_count DESC);
CREATE INDEX IF NOT EXISTS idx_viral_videos_engagement_rate ON viral_videos (engagement_rate DESC);

-- Composite index for the most common query pattern: platform + date + outlier
CREATE INDEX IF NOT EXISTS idx_viral_videos_platform_posted_outlier
  ON viral_videos (platform, posted_at DESC NULLS LAST, outlier_score DESC);
