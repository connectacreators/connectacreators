-- Phase 2: capture the user's last reply when the FSM is awaiting_user,
-- so the next handler can read it and act on it. Cleared when consumed.
ALTER TABLE companion_build_sessions
  ADD COLUMN IF NOT EXISTS user_input text;
