-- supabase/migrations/20260503_backfill_canvas_ai_chats.sql
-- Backfill: each canvas_ai_chats row becomes one assistant_threads row;
-- each entry in canvas_ai_chats.messages JSONB array becomes one assistant_messages row.
-- Idempotent: safe to re-run (only inserts threads that don't already exist by id).

BEGIN;

-- Disable the message-count trigger during backfill so it doesn't double-count
-- the message_count we set explicitly on the thread row.
ALTER TABLE assistant_messages DISABLE TRIGGER assistant_messages_count_sync;

-- Step 1: Insert threads (using the existing canvas_ai_chats.id to preserve UUIDs)
INSERT INTO assistant_threads (
  id, user_id, client_id, canvas_node_id, origin, title,
  message_count, last_message_at, created_at, updated_at
)
SELECT
  c.id,
  c.user_id,
  c.client_id,
  c.node_id,
  'canvas',
  c.name,
  COALESCE(jsonb_array_length(c.messages), 0),
  c.updated_at,
  c.created_at,
  c.updated_at
FROM canvas_ai_chats c
WHERE NOT EXISTS (
  SELECT 1 FROM assistant_threads t WHERE t.id = c.id
);

-- Step 2: Insert messages (one row per element in the messages JSONB array)
INSERT INTO assistant_messages (thread_id, role, content, created_at)
SELECT
  c.id AS thread_id,
  COALESCE(elem->>'role', 'user') AS role,
  CASE
    WHEN elem ? 'content' AND jsonb_typeof(elem->'content') = 'string'
      THEN jsonb_build_object('type', 'text', 'text', elem->>'content')
    WHEN elem ? 'content'
      THEN elem->'content'
    ELSE jsonb_build_object('type', 'text', 'text', '')
  END AS content,
  c.created_at + (ord || ' ms')::interval AS created_at
FROM canvas_ai_chats c
CROSS JOIN LATERAL jsonb_array_elements(c.messages) WITH ORDINALITY AS t(elem, ord)
WHERE NOT EXISTS (
  SELECT 1 FROM assistant_messages m WHERE m.thread_id = c.id
);

-- Re-enable the trigger for normal operation
ALTER TABLE assistant_messages ENABLE TRIGGER assistant_messages_count_sync;

-- Step 3: Sanity check — every backfilled thread should have message_count = actual messages
DO $$
DECLARE
  mismatch_count int;
BEGIN
  SELECT count(*) INTO mismatch_count
  FROM assistant_threads t
  WHERE t.origin = 'canvas'
    AND t.message_count <> (
      SELECT count(*) FROM assistant_messages m WHERE m.thread_id = t.id
    );
  IF mismatch_count > 0 THEN
    RAISE EXCEPTION 'Canvas backfill: % threads have mismatched message_count', mismatch_count;
  END IF;
END $$;

COMMIT;
