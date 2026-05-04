-- scripts/sql/phase-a-validation.sql
-- Run manually after Phase A migrations + edge function deploys to verify
-- the data foundation is healthy. Each block has an "Expected" comment.
--
-- Usage:
--   supabase db psql --linked < scripts/sql/phase-a-validation.sql
-- or paste each block into the Supabase SQL editor.

-- 1. All canvas chats backfilled
SELECT
  (SELECT count(*) FROM canvas_ai_chats) AS source,
  (SELECT count(*) FROM assistant_threads WHERE origin = 'canvas') AS dest;
-- Expected: source = dest

-- 2. All companion_messages backfilled (every message ends up in a "Legacy chat (archived)" thread)
SELECT
  (SELECT count(*) FROM companion_messages) AS source,
  (SELECT count(*) FROM assistant_messages m
     JOIN assistant_threads t ON t.id = m.thread_id
     WHERE t.title = 'Legacy chat (archived)') AS dest;
-- Expected: source = dest

-- 3. New canvas chats (after deploy) are dual-writing
SELECT count(*) AS recent_canvas_threads
FROM assistant_threads
WHERE origin = 'canvas' AND created_at > NOW() - INTERVAL '1 hour';
-- Expected: at least 1 if any canvas chats happened in the last hour
-- (NOTE: Phase A only covers the streaming canvas branch — see plan's
-- "Known Phase A coverage gap" section. Non-streaming canvas chats
-- will not show up here.)

-- 4. New companion (drawer) chats are dual-writing
SELECT count(*) AS recent_drawer_threads
FROM assistant_threads
WHERE title = 'Active companion chat' AND last_message_at > NOW() - INTERVAL '1 hour';
-- Expected: at least 1 if any companion chats happened in the last hour

-- 5. Constraint integrity: no canvas threads with NULL canvas_node_id
SELECT count(*) AS canvas_no_node FROM assistant_threads
WHERE origin = 'canvas' AND canvas_node_id IS NULL;
-- Expected: 0

-- 6. Constraint integrity: no drawer threads with non-NULL canvas_node_id
SELECT count(*) AS drawer_with_node FROM assistant_threads
WHERE origin = 'drawer' AND canvas_node_id IS NOT NULL;
-- Expected: 0

-- 7. Memory scope integrity: client-scope rows must have client_id
SELECT count(*) AS client_scope_no_client FROM assistant_memories
WHERE scope = 'client' AND client_id IS NULL;
-- Expected: 0

-- 8. Memory scope integrity: user-scope rows must NOT have client_id
SELECT count(*) AS user_scope_with_client FROM assistant_memories
WHERE scope = 'user' AND client_id IS NOT NULL;
-- Expected: 0

-- 9. Trigger integrity: every thread's message_count matches actual count.
-- (Run AFTER backfills + at least a few new turns through the dual-write.)
SELECT t.id, t.title, t.message_count, count(m.*) AS actual_count
FROM assistant_threads t
LEFT JOIN assistant_messages m ON m.thread_id = t.id
GROUP BY t.id, t.title, t.message_count
HAVING t.message_count <> count(m.*)
LIMIT 5;
-- Expected: zero rows
