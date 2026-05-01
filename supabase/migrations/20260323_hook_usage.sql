-- Hook usage tracking for anti-repetition in AI Script Wizard
CREATE TABLE hook_usage (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  topic text NOT NULL,
  hook_id text NOT NULL,
  used_at timestamptz DEFAULT now(),
  UNIQUE(client_id, topic, hook_id)
);

CREATE INDEX idx_hook_usage_lookup ON hook_usage(client_id, topic);

ALTER TABLE hook_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own client hook usage"
  ON hook_usage FOR ALL
  USING (
    client_id IN (
      SELECT id FROM clients WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    client_id IN (
      SELECT id FROM clients WHERE user_id = auth.uid()
    )
  );
