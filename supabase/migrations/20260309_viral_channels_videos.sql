-- Viral Video Discovery: channels to monitor + scraped videos

-- Channels to scrape
CREATE TABLE IF NOT EXISTS viral_channels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT NOT NULL,
  platform TEXT DEFAULT 'instagram' CHECK (platform IN ('instagram', 'tiktok', 'youtube')),
  display_name TEXT,
  avatar_url TEXT,
  follower_count BIGINT,
  avg_views BIGINT DEFAULT 0,
  video_count INTEGER DEFAULT 0,
  last_scraped_at TIMESTAMPTZ,
  scrape_status TEXT DEFAULT 'idle' CHECK (scrape_status IN ('idle', 'running', 'done', 'error')),
  scrape_error TEXT,
  apify_run_id TEXT,
  apify_dataset_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(platform, username)
);

-- Scraped videos
CREATE TABLE IF NOT EXISTS viral_videos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id UUID REFERENCES viral_channels(id) ON DELETE CASCADE,
  channel_username TEXT NOT NULL,
  platform TEXT DEFAULT 'instagram',
  video_url TEXT,
  thumbnail_url TEXT,
  caption TEXT,
  views_count BIGINT DEFAULT 0,
  likes_count BIGINT DEFAULT 0,
  comments_count BIGINT DEFAULT 0,
  engagement_rate NUMERIC(6,2) DEFAULT 0,
  outlier_score NUMERIC(8,2) DEFAULT 1,
  posted_at TIMESTAMPTZ,
  scraped_at TIMESTAMPTZ DEFAULT now(),
  apify_video_id TEXT,
  UNIQUE NULLS NOT DISTINCT (platform, apify_video_id)
);

-- Indexes for fast filtering
CREATE INDEX IF NOT EXISTS idx_viral_channels_platform ON viral_channels(platform);
CREATE INDEX IF NOT EXISTS idx_viral_channels_status ON viral_channels(scrape_status);
CREATE INDEX IF NOT EXISTS idx_viral_videos_channel_id ON viral_videos(channel_id);
CREATE INDEX IF NOT EXISTS idx_viral_videos_views ON viral_videos(views_count DESC);
CREATE INDEX IF NOT EXISTS idx_viral_videos_outlier ON viral_videos(outlier_score DESC);
CREATE INDEX IF NOT EXISTS idx_viral_videos_posted_at ON viral_videos(posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_viral_videos_engagement ON viral_videos(engagement_rate DESC);

-- Row Level Security
ALTER TABLE viral_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE viral_videos ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read
CREATE POLICY "auth read viral_channels" ON viral_channels
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "auth read viral_videos" ON viral_videos
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Only admins can manage channels
CREATE POLICY "admins manage viral_channels" ON viral_channels
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Service role (edge functions) can manage videos
CREATE POLICY "admins manage viral_videos" ON viral_videos
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );
