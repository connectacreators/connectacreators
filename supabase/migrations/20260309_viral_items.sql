-- Viral Today: community-wide viral content library
CREATE TABLE IF NOT EXISTS viral_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('viral_hooks', 'trending_audio', 'viral_frameworks')),
  title TEXT NOT NULL,
  instagram_url TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- RLS
ALTER TABLE viral_items ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read
CREATE POLICY "Anyone can read viral_items" ON viral_items
  FOR SELECT USING (true);

-- Only admins can insert/update/delete
CREATE POLICY "Admins can insert viral_items" ON viral_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update viral_items" ON viral_items
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can delete viral_items" ON viral_items
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Index for category filtering
CREATE INDEX idx_viral_items_category ON viral_items(category);
CREATE INDEX idx_viral_items_created_at ON viral_items(created_at DESC);
