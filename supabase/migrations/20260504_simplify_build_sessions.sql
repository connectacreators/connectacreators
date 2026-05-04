-- supabase/migrations/20260504_simplify_build_sessions.sql
-- Replace FSM-specific columns with simpler checkpoint model.
-- Phase 1+2 FSM is retired; LLM-as-conductor takes over.

-- Add the phase column (human-readable label for BuildBanner)
ALTER TABLE companion_build_sessions
  ADD COLUMN IF NOT EXISTS phase text NOT NULL DEFAULT '';

-- Remove FSM-only columns
ALTER TABLE companion_build_sessions
  DROP COLUMN IF EXISTS current_state,
  DROP COLUMN IF EXISTS error_message,
  DROP COLUMN IF EXISTS token_usage,
  DROP COLUMN IF EXISTS last_activity_at,
  DROP COLUMN IF EXISTS user_input;

-- Cancel any active sessions (clean slate for the new system)
-- Must run BEFORE adding the new CHECK constraint
UPDATE companion_build_sessions
  SET status = 'cancelled'
  WHERE status NOT IN ('completed', 'cancelled');

-- Update status CHECK to remove FSM-specific values
ALTER TABLE companion_build_sessions
  DROP CONSTRAINT IF EXISTS companion_build_sessions_status_check;
ALTER TABLE companion_build_sessions
  ADD CONSTRAINT companion_build_sessions_status_check
  CHECK (status IN ('running', 'paused', 'completed', 'cancelled'));

-- Drop old index that referenced awaiting_user
DROP INDEX IF EXISTS idx_build_sessions_user_active;
CREATE INDEX IF NOT EXISTS idx_build_sessions_user_active
  ON companion_build_sessions(user_id, status)
  WHERE status IN ('running', 'paused');
