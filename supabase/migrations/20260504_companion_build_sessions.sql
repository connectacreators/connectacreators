-- supabase/migrations/20260504_companion_build_sessions.sql
-- Durable state for the conversational script builder. Each row tracks one
-- multi-turn build through the FSM defined in
-- supabase/functions/_shared/build-fsm/states.ts.

CREATE TABLE IF NOT EXISTS companion_build_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  thread_id       uuid NOT NULL REFERENCES assistant_threads(id) ON DELETE CASCADE,
  canvas_state_id uuid REFERENCES canvas_states(id) ON DELETE SET NULL,

  status          text NOT NULL DEFAULT 'running'
                  CHECK (status IN ('running','awaiting_user','paused','completed','cancelled','error')),
  current_state   text NOT NULL DEFAULT 'INIT',

  ideas               jsonb NOT NULL DEFAULT '[]'::jsonb,
  current_idea_index  int  NOT NULL DEFAULT 0,
  selected_ideas      jsonb NOT NULL DEFAULT '[]'::jsonb,

  current_framework_video_id uuid,
  current_script_draft       text,
  current_script_id          uuid,

  cached_canvas_context     text,
  cached_canvas_context_at  timestamptz,

  auto_pilot      boolean NOT NULL DEFAULT false,
  error_message   text,

  token_usage     jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_build_sessions_user_active
  ON companion_build_sessions(user_id, status)
  WHERE status IN ('running','awaiting_user','paused');

CREATE INDEX IF NOT EXISTS idx_build_sessions_thread
  ON companion_build_sessions(thread_id);

CREATE INDEX IF NOT EXISTS idx_build_sessions_client
  ON companion_build_sessions(client_id);

CREATE OR REPLACE FUNCTION companion_build_sessions_touch_updated_at()
  RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS companion_build_sessions_touch_updated_at ON companion_build_sessions;
CREATE TRIGGER companion_build_sessions_touch_updated_at
  BEFORE UPDATE ON companion_build_sessions
  FOR EACH ROW EXECUTE FUNCTION companion_build_sessions_touch_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE companion_build_sessions;

ALTER TABLE companion_build_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users see their own build sessions" ON companion_build_sessions;
CREATE POLICY "users see their own build sessions"
  ON companion_build_sessions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users insert their own build sessions" ON companion_build_sessions;
CREATE POLICY "users insert their own build sessions"
  ON companion_build_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users update their own build sessions" ON companion_build_sessions;
CREATE POLICY "users update their own build sessions"
  ON companion_build_sessions FOR UPDATE
  USING (auth.uid() = user_id);
