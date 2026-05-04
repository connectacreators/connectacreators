-- supabase/migrations/20260503_assistant_threads.sql
-- Unified thread storage for the merged companion + canvas AI assistant.
-- Phase A: written-to in dual-write mode; reads still go to canvas_ai_chats / companion_messages.

CREATE TABLE IF NOT EXISTS assistant_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  canvas_node_id text,  -- reactflow node id within the client's canvas; nullable for drawer threads
  origin text NOT NULL CHECK (origin IN ('drawer', 'canvas')),
  title text,
  message_count int NOT NULL DEFAULT 0,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Constraint: canvas-origin threads must have both client_id and canvas_node_id
  CONSTRAINT canvas_origin_requires_node CHECK (
    origin <> 'canvas' OR (canvas_node_id IS NOT NULL AND client_id IS NOT NULL)
  ),
  -- Constraint: drawer-origin threads must not have a canvas_node_id
  CONSTRAINT drawer_origin_no_canvas CHECK (
    origin <> 'drawer' OR canvas_node_id IS NULL
  )
);

CREATE INDEX IF NOT EXISTS assistant_threads_user_client_recent_idx
  ON assistant_threads (user_id, client_id, last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS assistant_threads_canvas_idx
  ON assistant_threads (client_id, canvas_node_id) WHERE canvas_node_id IS NOT NULL;

ALTER TABLE assistant_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assistant_threads_owner" ON assistant_threads
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admins can read all (matches canvas_ai_chats pattern)
CREATE POLICY "assistant_threads_admin_read" ON assistant_threads
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

COMMENT ON TABLE assistant_threads IS
  'Unified thread storage for the merged companion + canvas AI assistant. See spec 2026-05-03-companion-canvas-ai-merge-design.md.';
