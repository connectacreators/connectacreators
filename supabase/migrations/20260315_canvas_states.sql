-- Canvas states: persist Super Planning canvas per user+client
CREATE TABLE IF NOT EXISTS canvas_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nodes jsonb NOT NULL DEFAULT '[]',
  edges jsonb NOT NULL DEFAULT '[]',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, user_id)
);

ALTER TABLE canvas_states ENABLE ROW LEVEL SECURITY;

-- Users can read/write their own canvas states
CREATE POLICY "canvas_states_own" ON canvas_states
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admins can read all
CREATE POLICY "canvas_states_admin_read" ON canvas_states
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
