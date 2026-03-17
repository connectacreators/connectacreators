CREATE TABLE IF NOT EXISTS revision_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  video_edit_id UUID REFERENCES video_edits(id) ON DELETE CASCADE,
  timestamp_seconds NUMERIC,
  comment TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_role TEXT NOT NULL DEFAULT 'admin',
  author_id UUID,
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_revision_comments_video
  ON revision_comments(video_edit_id);

ALTER TABLE revision_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read" ON revision_comments
  FOR SELECT USING (true);
CREATE POLICY "Public insert" ON revision_comments
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin update" ON revision_comments
  FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Admin delete" ON revision_comments
  FOR DELETE USING (auth.role() = 'authenticated');
