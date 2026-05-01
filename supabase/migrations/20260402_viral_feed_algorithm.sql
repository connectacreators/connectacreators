-- Viral Feed Algorithm: interaction tracking + niche keywords

-- 1. Interaction tracking table
CREATE TABLE IF NOT EXISTS viral_video_interactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  video_id UUID REFERENCES viral_videos(id) ON DELETE CASCADE NOT NULL,
  seen_count INTEGER DEFAULT 1,
  clicked BOOLEAN DEFAULT false,
  starred BOOLEAN DEFAULT false,
  first_seen_at TIMESTAMPTZ DEFAULT now(),
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, video_id)
);

CREATE INDEX IF NOT EXISTS idx_vvi_user ON viral_video_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_vvi_video ON viral_video_interactions(video_id);

-- RLS: users can only access their own rows
ALTER TABLE viral_video_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_interactions" ON viral_video_interactions
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. RPC to batch-upsert seen videos with increment logic
CREATE OR REPLACE FUNCTION upsert_video_seen(
  p_user_id UUID,
  p_video_ids UUID[]
) RETURNS void AS $$
BEGIN
  INSERT INTO viral_video_interactions (user_id, video_id, seen_count, first_seen_at, last_seen_at)
  SELECT p_user_id, vid, 1, now(), now()
  FROM unnest(p_video_ids) AS vid
  ON CONFLICT (user_id, video_id) DO UPDATE SET
    seen_count = viral_video_interactions.seen_count + 1,
    last_seen_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Niche keywords column on clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS niche_keywords TEXT[] DEFAULT '{}';
