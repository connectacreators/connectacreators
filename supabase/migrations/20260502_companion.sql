-- companion_state: one row per client, stores name + setup flag + workflow context
CREATE TABLE IF NOT EXISTS companion_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  companion_name text NOT NULL DEFAULT 'AI',
  companion_setup_done boolean NOT NULL DEFAULT false,
  workflow_context jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id)
);

-- companion_messages: chat history per client
CREATE TABLE IF NOT EXISTS companion_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS companion_messages_client_created
  ON companion_messages(client_id, created_at DESC);

-- RLS
ALTER TABLE companion_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE companion_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "companion_state_owner" ON companion_state FOR ALL USING (
  client_id IN (
    SELECT id FROM clients WHERE user_id = auth.uid()
    UNION
    SELECT client_id FROM subscriber_clients WHERE subscriber_user_id = auth.uid()
  )
);

CREATE POLICY "companion_messages_owner" ON companion_messages FOR ALL USING (
  client_id IN (
    SELECT id FROM clients WHERE user_id = auth.uid()
    UNION
    SELECT client_id FROM subscriber_clients WHERE subscriber_user_id = auth.uid()
  )
);
