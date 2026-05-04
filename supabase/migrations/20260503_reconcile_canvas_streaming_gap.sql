-- supabase/migrations/20260503_reconcile_canvas_streaming_gap.sql
-- Reconciliation backfill: closes the gap left by Phase A's streaming-only
-- dual-write in ai-assistant. For any canvas thread where legacy
-- canvas_ai_chats.messages has MORE rows than assistant_messages, insert the
-- missing tail messages (assumed to be the most recent un-streamed turns).
--
-- Idempotent: re-running only inserts messages still missing.

BEGIN;

ALTER TABLE assistant_messages DISABLE TRIGGER assistant_messages_count_sync;

WITH gap AS (
  SELECT
    t.id AS thread_id,
    jsonb_array_length(COALESCE(c.messages, '[]'::jsonb)) AS legacy_count,
    (SELECT COUNT(*) FROM assistant_messages m WHERE m.thread_id = t.id) AS new_count,
    c.messages,
    c.updated_at AS canvas_updated_at,
    (SELECT MAX(created_at) FROM assistant_messages m WHERE m.thread_id = t.id) AS last_new_ts
  FROM assistant_threads t
  JOIN canvas_ai_chats c ON c.id = t.id
  WHERE t.origin = 'canvas'
), tail AS (
  SELECT
    g.thread_id,
    elem,
    ord,
    g.new_count,
    g.last_new_ts,
    g.canvas_updated_at
  FROM gap g
  CROSS JOIN LATERAL jsonb_array_elements(g.messages) WITH ORDINALITY AS t(elem, ord)
  WHERE g.legacy_count > g.new_count
    AND ord > g.new_count
)
INSERT INTO assistant_messages (thread_id, role, content, created_at)
SELECT
  thread_id,
  COALESCE(elem->>'role', 'user') AS role,
  CASE
    WHEN elem ? 'content' AND jsonb_typeof(elem->'content') = 'string'
      THEN jsonb_build_object('type', 'text', 'text', elem->>'content')
    WHEN elem ? 'content'
      THEN elem->'content'
    ELSE jsonb_build_object('type', 'text', 'text', '')
  END AS content,
  COALESCE(last_new_ts, canvas_updated_at) + ((ord - new_count) || ' ms')::interval AS created_at
FROM tail;

-- Sync message_count + last_message_at on the affected threads
UPDATE assistant_threads t
SET
  message_count = sub.actual_count,
  last_message_at = GREATEST(t.last_message_at, sub.actual_last)
FROM (
  SELECT m.thread_id,
         COUNT(*) AS actual_count,
         MAX(m.created_at) AS actual_last
  FROM assistant_messages m
  GROUP BY m.thread_id
) sub
WHERE t.id = sub.thread_id
  AND t.origin = 'canvas'
  AND (t.message_count <> sub.actual_count OR t.last_message_at IS DISTINCT FROM sub.actual_last);

ALTER TABLE assistant_messages ENABLE TRIGGER assistant_messages_count_sync;

-- Verify: no canvas thread should have legacy_count > new_count after this
DO $$
DECLARE
  remaining int;
BEGIN
  SELECT COUNT(*) INTO remaining
  FROM assistant_threads t
  JOIN canvas_ai_chats c ON c.id = t.id
  WHERE t.origin = 'canvas'
    AND jsonb_array_length(COALESCE(c.messages, '[]'::jsonb)) >
        (SELECT COUNT(*) FROM assistant_messages m WHERE m.thread_id = t.id);
  IF remaining > 0 THEN
    RAISE EXCEPTION 'Reconciliation incomplete: % canvas threads still have legacy > new', remaining;
  END IF;
END $$;

COMMIT;
