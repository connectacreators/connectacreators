-- Trainings / SOPs table
-- Admins create training documents, assigned to specific team members (videographers)

CREATE TABLE IF NOT EXISTS trainings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Untitled SOP',
  content TEXT NOT NULL DEFAULT '',
  assigned_to_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT '',
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_trainings_assigned_to ON trainings(assigned_to_user_id);
CREATE INDEX IF NOT EXISTS idx_trainings_created_at ON trainings(created_at DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_trainings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trainings_updated_at ON trainings;
CREATE TRIGGER trainings_updated_at
  BEFORE UPDATE ON trainings
  FOR EACH ROW EXECUTE FUNCTION update_trainings_updated_at();

-- Row Level Security
ALTER TABLE trainings ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage trainings"
  ON trainings FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Assigned users can view their own trainings
CREATE POLICY "Assigned users can view their trainings"
  ON trainings FOR SELECT
  TO authenticated
  USING (assigned_to_user_id = auth.uid());
