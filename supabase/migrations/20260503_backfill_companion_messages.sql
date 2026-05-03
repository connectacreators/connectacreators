-- supabase/migrations/20260503_backfill_companion_messages.sql
-- Backfill: existing companion_messages (one row per message, keyed by client_id)
-- get archived into a single drawer-origin assistant_threads row per (user, client).
-- Phase A choice: simplest possible — one legacy archive thread per client. User
-- can delete or rename later from the memory editor UI (Phase C).

BEGIN;

-- Disable the message-count trigger during backfill (avoid double-counting).
ALTER TABLE assistant_messages DISABLE TRIGGER assistant_messages_count_sync;

-- Step 1: Create one drawer thread per client that has any messages,
-- assigning user_id from the owning client.
INSERT INTO assistant_threads (
  id, user_id, client_id, canvas_node_id, origin, title,
  message_count, last_message_at, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  cl.user_id,
  cm.client_id,
  NULL,
  'drawer',
  'Legacy chat (archived)',
  count(*),
  max(cm.created_at),
  min(cm.created_at),
  max(cm.created_at)
FROM companion_messages cm
JOIN clients cl ON cl.id = cm.client_id
WHERE NOT EXISTS (
  SELECT 1 FROM assistant_threads t
  WHERE t.client_id = cm.client_id
    AND t.user_id = cl.user_id
    AND t.title = 'Legacy chat (archived)'
)
GROUP BY cl.user_id, cm.client_id;

-- Step 2: Copy each companion_messages row into assistant_messages,
-- pointing to the legacy archive thread for that client.
INSERT INTO assistant_messages (id, thread_id, role, content, created_at)
SELECT
  cm.id,                                        -- preserve original message UUID
  t.id,                                         -- archive thread for this client
  cm.role,
  jsonb_build_object('type', 'text', 'text', cm.content),
  cm.created_at
FROM companion_messages cm
JOIN clients cl ON cl.id = cm.client_id
JOIN assistant_threads t
  ON t.client_id = cm.client_id
 AND t.user_id = cl.user_id
 AND t.title = 'Legacy chat (archived)'
WHERE NOT EXISTS (
  SELECT 1 FROM assistant_messages m WHERE m.id = cm.id
);

-- Re-enable the trigger for normal operation.
ALTER TABLE assistant_messages ENABLE TRIGGER assistant_messages_count_sync;

-- Step 3: Re-sync message_count on legacy threads in case the trigger and our
-- count(*) above disagree (defensive — they should match).
UPDATE assistant_threads t
SET message_count = (
  SELECT count(*) FROM assistant_messages m WHERE m.thread_id = t.id
),
last_message_at = (
  SELECT max(m.created_at) FROM assistant_messages m WHERE m.thread_id = t.id
)
WHERE t.title = 'Legacy chat (archived)';

COMMIT;
