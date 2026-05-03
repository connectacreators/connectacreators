-- supabase/migrations/20260503_assistant_memories.sql
-- Persistent facts the assistant remembers. Two scopes: user-level and client-level.

CREATE TABLE IF NOT EXISTS assistant_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('user', 'client')),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  key text NOT NULL,
  value text NOT NULL,
  source_thread_id uuid REFERENCES assistant_threads(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_scope_requires_client_id CHECK (
    scope <> 'client' OR client_id IS NOT NULL
  ),
  CONSTRAINT user_scope_no_client_id CHECK (
    scope <> 'user' OR client_id IS NULL
  ),
  -- One memory per (user, scope, client, key) — upsert target.
  -- NULLS NOT DISTINCT so user-scope rows (client_id IS NULL) are deduped
  -- correctly under ON CONFLICT (Postgres 15+).
  UNIQUE NULLS NOT DISTINCT (user_id, scope, client_id, key)
);

CREATE INDEX IF NOT EXISTS assistant_memories_lookup_idx
  ON assistant_memories (user_id, client_id);

ALTER TABLE assistant_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assistant_memories_owner" ON assistant_memories
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "assistant_memories_admin_read" ON assistant_memories
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

COMMENT ON TABLE assistant_memories IS
  'Facts the assistant remembers. Loaded into system prompt at thread start. user-scope = agency owner; client-scope = per-creator.';
