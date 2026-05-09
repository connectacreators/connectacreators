-- Upgrade the existing assistant_memories table for first-class memory:
-- adds pin support, source telemetry, dedup uniqueness, and the LRU
-- cap-enforcement function. Backfills from companion_state.workflow_context
-- (the legacy bag-of-strings memory location).
--
-- Single-table design (scope discriminator) — superseded an earlier draft
-- that created separate client_memories + user_memories tables.

ALTER TABLE assistant_memories
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'model';

-- Partial unique indexes per scope so save_memory upserts dedup correctly:
--   scope='user'   → unique on (user_id, key) where client_id is null
--   scope='client' → unique on (user_id, client_id, key)
DROP INDEX IF EXISTS assistant_memories_user_unique;
DROP INDEX IF EXISTS assistant_memories_client_unique;

CREATE UNIQUE INDEX IF NOT EXISTS assistant_memories_user_unique
  ON assistant_memories(user_id, key)
  WHERE scope = 'user';

CREATE UNIQUE INDEX IF NOT EXISTS assistant_memories_client_unique
  ON assistant_memories(user_id, client_id, key)
  WHERE scope = 'client';

-- Lookup index for prompt loading: pinned-first, then most-recent.
CREATE INDEX IF NOT EXISTS assistant_memories_lookup
  ON assistant_memories(user_id, scope, client_id, pinned DESC, updated_at DESC);

-- One-time backfill of memories that lived in companion_state.workflow_context
-- (the old bag-of-strings location). Re-running this is safe because of the
-- unique indexes + ON CONFLICT DO NOTHING.
INSERT INTO assistant_memories (user_id, scope, client_id, key, value, pinned, source, created_at, updated_at)
SELECT
  c.user_id,
  'client',
  cs.client_id,
  e.key,
  e.value,
  false,
  'model',
  now(),
  now()
FROM companion_state cs
JOIN clients c ON c.id = cs.client_id
CROSS JOIN LATERAL jsonb_each_text(cs.workflow_context) AS e(key, value)
WHERE cs.workflow_context IS NOT NULL
  AND length(trim(e.value)) > 0
  AND c.user_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- LRU cap enforcement. Drops oldest unpinned rows when the per-scope count
-- exceeds the cap. Pinned rows never evict.
CREATE OR REPLACE FUNCTION enforce_assistant_memory_cap(
  p_user_id uuid,
  p_scope text,
  p_client_id uuid,
  p_max int DEFAULT 40
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM assistant_memories
  WHERE id IN (
    SELECT id FROM assistant_memories am
    WHERE am.user_id = p_user_id
      AND am.scope = p_scope
      AND ((p_scope = 'user' AND am.client_id IS NULL)
           OR (p_scope = 'client' AND am.client_id = p_client_id))
      AND am.pinned = false
    ORDER BY am.updated_at DESC
    OFFSET GREATEST(0, p_max - (
      SELECT count(*) FROM assistant_memories am2
      WHERE am2.user_id = p_user_id
        AND am2.scope = p_scope
        AND ((p_scope = 'user' AND am2.client_id IS NULL)
             OR (p_scope = 'client' AND am2.client_id = p_client_id))
        AND am2.pinned = true
    ))
  );
END;
$$;
