-- Canvas AI chat history: stores chat sessions per AI assistant node
CREATE TABLE IF NOT EXISTS canvas_ai_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,  -- reactflow node ID within the canvas
  name TEXT NOT NULL DEFAULT 'New Chat',
  messages JSONB NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_canvas_ai_chats_user_client
  ON canvas_ai_chats(user_id, client_id, node_id);

ALTER TABLE canvas_ai_chats ENABLE ROW LEVEL SECURITY;

-- Users can manage their own chats
CREATE POLICY "canvas_ai_chats_own" ON canvas_ai_chats
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admins can read all
CREATE POLICY "canvas_ai_chats_admin" ON canvas_ai_chats
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
