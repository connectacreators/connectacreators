-- supabase/migrations/20260503_assistant_messages.sql
-- Per-message storage for assistant_threads. Replaces the messages JSONB column
-- on canvas_ai_chats and the flat companion_messages table (read-side migration in Phase B).

CREATE TABLE IF NOT EXISTS assistant_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES assistant_threads(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content jsonb NOT NULL,  -- { type: 'text' } | { type: 'tool_use' } | { type: 'tool_result' } | { type: 'script_preview' }
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assistant_messages_thread_idx
  ON assistant_messages (thread_id, created_at);

ALTER TABLE assistant_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assistant_messages_owner" ON assistant_messages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM assistant_threads t
      WHERE t.id = thread_id AND t.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM assistant_threads t
      WHERE t.id = thread_id AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "assistant_messages_admin_read" ON assistant_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Trigger: keep assistant_threads.message_count and last_message_at in sync
CREATE OR REPLACE FUNCTION assistant_messages_after_insert() RETURNS trigger AS $$
BEGIN
  UPDATE assistant_threads
  SET message_count = message_count + 1,
      last_message_at = NEW.created_at,
      updated_at = now()
  WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER assistant_messages_count_sync
  AFTER INSERT ON assistant_messages
  FOR EACH ROW
  EXECUTE FUNCTION assistant_messages_after_insert();

COMMENT ON TABLE assistant_messages IS
  'Per-message storage for assistant_threads. content is jsonb to support text, tool_use, tool_result, script_preview blocks.';
