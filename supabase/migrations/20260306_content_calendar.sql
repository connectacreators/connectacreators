-- Content Calendar: stores scheduled posts linked to Notion editing queue

CREATE TABLE IF NOT EXISTS content_calendar (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  notion_page_id TEXT NOT NULL,
  title TEXT NOT NULL,
  scheduled_date DATE NOT NULL,
  post_status TEXT NOT NULL DEFAULT 'Scheduled',
  file_submission_url TEXT,
  script_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(client_id, notion_page_id)
);

-- Indexes for fast calendar queries
CREATE INDEX IF NOT EXISTS idx_content_calendar_client_id ON content_calendar(client_id);
CREATE INDEX IF NOT EXISTS idx_content_calendar_scheduled_date ON content_calendar(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_content_calendar_client_date ON content_calendar(client_id, scheduled_date);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_content_calendar_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER content_calendar_updated_at
  BEFORE UPDATE ON content_calendar
  FOR EACH ROW EXECUTE FUNCTION update_content_calendar_updated_at();

-- Row Level Security
ALTER TABLE content_calendar ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage content calendar"
  ON content_calendar FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Clients can view and update their own posts
CREATE POLICY "Clients can view own content calendar"
  ON content_calendar FOR SELECT
  TO authenticated
  USING (
    client_id IN (
      SELECT id FROM clients WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Clients can update own post status"
  ON content_calendar FOR UPDATE
  TO authenticated
  USING (
    client_id IN (
      SELECT id FROM clients WHERE user_id = auth.uid()
    )
  );
