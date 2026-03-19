-- Canvas session history: multi-session support per client+user
-- Safe for existing rows: they get name='New chat', is_active=true
-- The existing UNIQUE(client_id,user_id) rows satisfy the new partial index automatically.

-- 1. Add new columns (IF NOT EXISTS guards make re-runs safe)
-- NOTE: draw_paths is included here even though the spec's ALTER TABLE block omits it.
-- The code already queries and writes draw_paths (SuperPlanningCanvas.tsx lines 257, 270, 358, 384)
-- but the column was never added in a migration. This migration adds it safely.
ALTER TABLE canvas_states
  ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'New chat',
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS draw_paths JSONB NOT NULL DEFAULT '[]';

-- 2. Drop the old full unique constraint (was added by original migration)
ALTER TABLE canvas_states
  DROP CONSTRAINT IF EXISTS canvas_states_client_id_user_id_key;

-- 3. Create partial unique index: at most one active session per client+user
--    This is the new enforcement mechanism.
CREATE UNIQUE INDEX IF NOT EXISTS canvas_states_one_active
  ON canvas_states(client_id, user_id)
  WHERE is_active = true;
