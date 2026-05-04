# Companion ↔ Canvas AI Merge — Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the data foundation for the companion ↔ canvas AI merge: three new tables (`assistant_threads`, `assistant_messages`, `assistant_memories`), a `_shared/assistant/` Deno library used by both edge functions, and dual-write backfills from existing `canvas_ai_chats` and `companion_messages`. **No UI changes in this phase** — the user-visible app behaves identically while new tables fill up in parallel.

**Architecture:** Add new tables alongside existing ones. Both `companion-chat` and `ai-assistant` edge functions import a new shared Deno library (`supabase/functions/_shared/assistant/`) for memory load/save, thread/message persistence, system-prompt assembly, and mode detection. Existing read paths stay; both functions begin dual-writing every new message to both old and new tables. Existing rows are backfilled via SQL migration.

**Tech Stack:** Supabase (Postgres + RLS), Deno (edge functions), TypeScript. Tests use Deno's built-in `Deno.test` runner. Migrations applied via `supabase db push` against the linked project (or `supabase db reset` locally for testing).

**Spec:** [docs/superpowers/specs/2026-05-03-companion-canvas-ai-merge-design.md](../specs/2026-05-03-companion-canvas-ai-merge-design.md)

---

## File map (created/modified in Phase A)

**Created:**
- `supabase/migrations/20260503_assistant_threads.sql` — new schema
- `supabase/migrations/20260503_assistant_messages.sql`
- `supabase/migrations/20260503_assistant_memories.sql`
- `supabase/migrations/20260503_backfill_canvas_ai_chats.sql`
- `supabase/migrations/20260503_backfill_companion_messages.sql`
- `supabase/functions/_shared/assistant/types.ts` — shared TS interfaces
- `supabase/functions/_shared/assistant/identity.ts` — companion name + base prompt
- `supabase/functions/_shared/assistant/memory.ts` — load/save memories
- `supabase/functions/_shared/assistant/threads.ts` — thread + message CRUD
- `supabase/functions/_shared/assistant/mode.ts` — agency vs client mode detection
- `supabase/functions/_shared/assistant/prompt.ts` — assemble final system prompt
- `supabase/functions/_shared/assistant/identity.test.ts`
- `supabase/functions/_shared/assistant/memory.test.ts`
- `supabase/functions/_shared/assistant/threads.test.ts`
- `supabase/functions/_shared/assistant/mode.test.ts`
- `supabase/functions/_shared/assistant/prompt.test.ts`
- `supabase/functions/_shared/assistant/deno.json` — test config

**Modified:**
- `supabase/functions/companion-chat/index.ts` — dual-write to `assistant_threads` + `assistant_messages`
- `supabase/functions/ai-assistant/index.ts` — dual-write to `assistant_threads` + `assistant_messages`

---

## Task 1: Schema migration — `assistant_threads`

**Files:**
- Create: `supabase/migrations/20260503_assistant_threads.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- supabase/migrations/20260503_assistant_threads.sql
-- Unified thread storage for the merged companion + canvas AI assistant.
-- Phase A: written-to in dual-write mode; reads still go to canvas_ai_chats / companion_messages.

CREATE TABLE IF NOT EXISTS assistant_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  canvas_node_id text,  -- reactflow node id within the client's canvas; nullable for drawer threads
  origin text NOT NULL CHECK (origin IN ('drawer', 'canvas')),
  title text,
  message_count int NOT NULL DEFAULT 0,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Constraint: canvas-origin threads must have both client_id and canvas_node_id
  CONSTRAINT canvas_origin_requires_node CHECK (
    origin <> 'canvas' OR (canvas_node_id IS NOT NULL AND client_id IS NOT NULL)
  ),
  -- Constraint: drawer-origin threads must not have a canvas_node_id
  CONSTRAINT drawer_origin_no_canvas CHECK (
    origin <> 'drawer' OR canvas_node_id IS NULL
  )
);

CREATE INDEX IF NOT EXISTS assistant_threads_user_client_recent_idx
  ON assistant_threads (user_id, client_id, last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS assistant_threads_canvas_idx
  ON assistant_threads (client_id, canvas_node_id) WHERE canvas_node_id IS NOT NULL;

ALTER TABLE assistant_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assistant_threads_owner" ON assistant_threads
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admins can read all (matches canvas_ai_chats pattern)
CREATE POLICY "assistant_threads_admin_read" ON assistant_threads
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

COMMENT ON TABLE assistant_threads IS
  'Unified thread storage for the merged companion + canvas AI assistant. See spec 2026-05-03-companion-canvas-ai-merge-design.md.';
```

- [ ] **Step 2: Apply locally and verify schema**

Run: `supabase db push --linked` (or `supabase db reset` for local dev) — whichever pattern this project already uses.

Verify with:
```bash
supabase db dump --linked --schema-only --data-flag=false 2>&1 | grep -A 25 "CREATE TABLE.*assistant_threads"
```

Expected: see all columns, both check constraints, both indexes, both policies.

- [ ] **Step 3: Smoke-test the constraints**

Run via SQL editor or `supabase db psql`:

```sql
-- Should succeed: drawer thread without canvas_node_id
INSERT INTO assistant_threads (user_id, origin) VALUES
  ((SELECT id FROM auth.users LIMIT 1), 'drawer')
RETURNING id;

-- Should fail: canvas thread without canvas_node_id
INSERT INTO assistant_threads (user_id, origin) VALUES
  ((SELECT id FROM auth.users LIMIT 1), 'canvas');
-- Expected error: violates check constraint "canvas_origin_requires_node"

-- Should fail: drawer thread WITH canvas_node_id
INSERT INTO assistant_threads (user_id, origin, canvas_node_id) VALUES
  ((SELECT id FROM auth.users LIMIT 1), 'drawer', 'some-node-123');
-- Expected error: violates check constraint "drawer_origin_no_canvas"

-- Cleanup
DELETE FROM assistant_threads WHERE user_id = (SELECT id FROM auth.users LIMIT 1);
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260503_assistant_threads.sql
git commit -m "feat(assistant): add assistant_threads table

Phase A of companion ↔ canvas AI merge. Unified thread storage
with origin-based constraints (drawer threads have no canvas_node_id,
canvas threads require it). RLS owner + admin-read pattern.

Spec: docs/superpowers/specs/2026-05-03-companion-canvas-ai-merge-design.md"
```

---

## Task 2: Schema migration — `assistant_messages`

**Files:**
- Create: `supabase/migrations/20260503_assistant_messages.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- supabase/migrations/20260503_assistant_messages.sql
-- Per-message storage for assistant_threads. Replaces the messages JSONB column
-- on canvas_ai_chats and the flat companion_messages table (read-side migration in Phase B).

CREATE TABLE IF NOT EXISTS assistant_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES assistant_threads(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content jsonb NOT NULL,  -- { type: 'text' } | { type: 'tool_use' } | { type: 'tool_result' } | { type: 'script_preview' }
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assistant_messages_thread_idx
  ON assistant_messages (thread_id, created_at);

ALTER TABLE assistant_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assistant_messages_owner" ON assistant_messages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM assistant_threads t
      WHERE t.id = thread_id AND t.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM assistant_threads t
      WHERE t.id = thread_id AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "assistant_messages_admin_read" ON assistant_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Trigger: keep assistant_threads.message_count and last_message_at in sync
CREATE OR REPLACE FUNCTION assistant_messages_after_insert() RETURNS trigger AS $$
BEGIN
  UPDATE assistant_threads
  SET message_count = message_count + 1,
      last_message_at = NEW.created_at,
      updated_at = now()
  WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER assistant_messages_count_sync
  AFTER INSERT ON assistant_messages
  FOR EACH ROW
  EXECUTE FUNCTION assistant_messages_after_insert();

COMMENT ON TABLE assistant_messages IS
  'Per-message storage for assistant_threads. content is jsonb to support text, tool_use, tool_result, script_preview blocks.';
```

- [ ] **Step 2: Apply migration**

Run the same pattern as Task 1 (e.g., `supabase db push --linked`).

- [ ] **Step 3: Smoke-test the trigger**

```sql
-- Create a thread, append two messages, verify counter
WITH t AS (
  INSERT INTO assistant_threads (user_id, origin)
    VALUES ((SELECT id FROM auth.users LIMIT 1), 'drawer')
    RETURNING id
)
INSERT INTO assistant_messages (thread_id, role, content)
SELECT id, 'user', '{"type":"text","text":"hello"}'::jsonb FROM t
UNION ALL
SELECT id, 'assistant', '{"type":"text","text":"hi"}'::jsonb FROM t;

SELECT message_count, last_message_at IS NOT NULL AS has_last_at
FROM assistant_threads
WHERE user_id = (SELECT id FROM auth.users LIMIT 1)
ORDER BY created_at DESC LIMIT 1;
-- Expected: message_count=2, has_last_at=true

-- Cleanup
DELETE FROM assistant_threads WHERE user_id = (SELECT id FROM auth.users LIMIT 1);
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260503_assistant_messages.sql
git commit -m "feat(assistant): add assistant_messages table + count trigger

Per-message storage for assistant_threads. JSONB content supports
text, tool_use, tool_result, and script_preview blocks. Trigger keeps
thread.message_count and last_message_at in sync on insert."
```

---

## Task 3: Schema migration — `assistant_memories`

**Files:**
- Create: `supabase/migrations/20260503_assistant_memories.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
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
```

- [ ] **Step 2: Apply migration**

Run: `supabase db push --linked`.

- [ ] **Step 3: Smoke-test scope constraints**

```sql
-- Should succeed: user-scope memory
INSERT INTO assistant_memories (user_id, scope, key, value)
  VALUES ((SELECT id FROM auth.users LIMIT 1), 'user', 'tone', 'concise')
  RETURNING id;

-- Should fail: user-scope WITH client_id
INSERT INTO assistant_memories (user_id, scope, client_id, key, value)
  VALUES ((SELECT id FROM auth.users LIMIT 1), 'user',
          (SELECT id FROM clients LIMIT 1), 'tone', 'concise');
-- Expected error: user_scope_no_client_id

-- Should fail: client-scope WITHOUT client_id
INSERT INTO assistant_memories (user_id, scope, key, value)
  VALUES ((SELECT id FROM auth.users LIMIT 1), 'client', 'tone', 'concise');
-- Expected error: client_scope_requires_client_id

-- Cleanup
DELETE FROM assistant_memories WHERE user_id = (SELECT id FROM auth.users LIMIT 1);
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260503_assistant_memories.sql
git commit -m "feat(assistant): add assistant_memories table

Two scopes: user (agency owner-level) and client (per-creator).
Scope-specific check constraints + unique key per (user, scope, client, key)
for upsert. RLS owner + admin-read."
```

---

## Task 4: Shared library — `types.ts`

**Files:**
- Create: `supabase/functions/_shared/assistant/types.ts`
- Create: `supabase/functions/_shared/assistant/deno.json`

- [ ] **Step 1: Create deno.json for the shared library**

```json
{
  "imports": {
    "@supabase/supabase-js": "https://esm.sh/@supabase/supabase-js@2.39.3"
  },
  "tasks": {
    "test": "deno test --allow-net --allow-env --allow-read"
  }
}
```

Save to `supabase/functions/_shared/assistant/deno.json`.

- [ ] **Step 2: Write the types module**

```ts
// supabase/functions/_shared/assistant/types.ts
// Shared TypeScript interfaces for the assistant subsystem.

export type AssistantOrigin = 'drawer' | 'canvas';
export type AssistantRole = 'user' | 'assistant' | 'tool';
export type MemoryScope = 'user' | 'client';

export interface AssistantIdentity {
  name: string;            // companion_state.companion_name (per client today)
  language: 'en' | 'es';
}

export interface AssistantMemory {
  id?: string;
  scope: MemoryScope;
  clientId?: string;       // required when scope='client'
  key: string;
  value: string;
}

export interface ThreadMeta {
  id: string;
  userId: string;
  clientId?: string | null;
  canvasNodeId?: string | null;
  origin: AssistantOrigin;
  title?: string | null;
  messageCount: number;
  lastMessageAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type MessageContent =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string }
  | { type: 'script_preview'; script: unknown };

export interface AssistantMessage {
  id?: string;
  threadId: string;
  role: AssistantRole;
  content: MessageContent;
  model?: string;
  createdAt?: string;
}

export type AssistantMode =
  | { mode: 'agency'; clientId: null }
  | { mode: 'client'; clientId: string };

export type AssistantSurface = 'drawer' | 'canvas';
```

- [ ] **Step 3: Verify types compile**

Run from project root:
```bash
deno check supabase/functions/_shared/assistant/types.ts
```
Expected: no output (success).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/assistant/types.ts supabase/functions/_shared/assistant/deno.json
git commit -m "feat(assistant): add shared TS types for assistant subsystem

Defines ThreadMeta, AssistantMessage, MessageContent (discriminated
union for text/tool_use/tool_result/script_preview), AssistantMemory,
AssistantMode. Both companion-chat and ai-assistant edge functions
will import these in Phase A."
```

---

## Task 5: Shared library — `identity.ts`

**Files:**
- Create: `supabase/functions/_shared/assistant/identity.ts`
- Create: `supabase/functions/_shared/assistant/identity.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// supabase/functions/_shared/assistant/identity.test.ts
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildIdentitySystemPrompt } from "./identity.ts";

Deno.test("buildIdentitySystemPrompt — uses companion name", () => {
  const out = buildIdentitySystemPrompt({ name: "Robby", language: "en" });
  assertStringIncludes(out, "Robby");
});

Deno.test("buildIdentitySystemPrompt — references language for tone hint", () => {
  const en = buildIdentitySystemPrompt({ name: "Max", language: "en" });
  const es = buildIdentitySystemPrompt({ name: "Max", language: "es" });
  assertStringIncludes(en, "English");
  assertStringIncludes(es, "Spanish");
});

Deno.test("buildIdentitySystemPrompt — never uses literal 'AI' as name without flagging", () => {
  // companion_state default is 'AI'; we should still use it but the prompt should
  // make the assistant respond to it consistently
  const out = buildIdentitySystemPrompt({ name: "AI", language: "en" });
  assertEquals(out.length > 0, true);
  assertStringIncludes(out, "AI");
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
deno test supabase/functions/_shared/assistant/identity.test.ts
```
Expected: failure with "module not found" or "buildIdentitySystemPrompt is not a function".

- [ ] **Step 3: Write the implementation**

```ts
// supabase/functions/_shared/assistant/identity.ts
import type { AssistantIdentity } from "./types.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Loads the companion identity for a user given an active client context.
 * Today, companion_state is keyed by client_id. If no client_id is given,
 * we look up the user's first owned client to fetch their default companion name.
 */
export async function getCompanionIdentity(
  supabase: SupabaseClient,
  userId: string,
  clientId?: string | null,
): Promise<AssistantIdentity> {
  let queryClientId = clientId;

  if (!queryClientId) {
    // Fall back to the user's first owned client for the companion_name lookup.
    const { data: ownedClient } = await supabase
      .from("clients")
      .select("id")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    queryClientId = ownedClient?.id ?? null;
  }

  let name = "AI";
  if (queryClientId) {
    const { data } = await supabase
      .from("companion_state")
      .select("companion_name")
      .eq("client_id", queryClientId)
      .maybeSingle();
    if (data?.companion_name) name = data.companion_name;
  }

  // Language preference is per-user; default to English for now (the existing
  // CompanionContext reads useLanguage() on the client and passes it through).
  return { name, language: "en" };
}

/**
 * Pure function: builds the identity portion of the system prompt.
 * No DB access — easy to unit-test.
 */
export function buildIdentitySystemPrompt(identity: AssistantIdentity): string {
  const langLabel = identity.language === "es" ? "Spanish" : "English";
  return [
    `You are ${identity.name}, the user's AI assistant inside ConnectaCreators.`,
    `Always respond as ${identity.name}. Refer to yourself in the first person; users may address you by name.`,
    `Default reply language: ${langLabel}. Match the language of the user's last message when in doubt.`,
    `You are concise, direct, and action-oriented. You do things — you don't describe what you would do.`,
  ].join(" ");
}
```

- [ ] **Step 4: Run test, verify it passes**

```bash
deno test supabase/functions/_shared/assistant/identity.test.ts
```
Expected: 3 passed, 0 failed.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/assistant/identity.ts supabase/functions/_shared/assistant/identity.test.ts
git commit -m "feat(assistant): identity module — companion name + base system prompt

Loads companion identity from companion_state (keyed by client_id;
falls back to user's first owned client when no clientId given).
Pure buildIdentitySystemPrompt function for prompt assembly and tests."
```

---

## Task 6: Shared library — `memory.ts`

**Files:**
- Create: `supabase/functions/_shared/assistant/memory.ts`
- Create: `supabase/functions/_shared/assistant/memory.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// supabase/functions/_shared/assistant/memory.test.ts
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { formatMemoriesForPrompt } from "./memory.ts";
import type { AssistantMemory } from "./types.ts";

Deno.test("formatMemoriesForPrompt — empty list returns empty string", () => {
  assertEquals(formatMemoriesForPrompt([]), "");
});

Deno.test("formatMemoriesForPrompt — groups user vs client memories", () => {
  const mems: AssistantMemory[] = [
    { scope: "user", key: "tone", value: "concise" },
    { scope: "client", clientId: "c1", key: "schedule", value: "Tue/Thu 6pm" },
    { scope: "client", clientId: "c1", key: "voice", value: "direct, Spanish-first" },
  ];
  const out = formatMemoriesForPrompt(mems);
  assertStringIncludes(out, "About the user");
  assertStringIncludes(out, "concise");
  assertStringIncludes(out, "About the active client");
  assertStringIncludes(out, "Tue/Thu 6pm");
  assertStringIncludes(out, "direct, Spanish-first");
});

Deno.test("formatMemoriesForPrompt — only user memories renders single section", () => {
  const out = formatMemoriesForPrompt([{ scope: "user", key: "tone", value: "concise" }]);
  assertStringIncludes(out, "About the user");
  assertEquals(out.includes("About the active client"), false);
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
deno test supabase/functions/_shared/assistant/memory.test.ts
```
Expected: failure with "module not found".

- [ ] **Step 3: Write the implementation**

```ts
// supabase/functions/_shared/assistant/memory.ts
import type { AssistantMemory } from "./types.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function loadRelevantMemories(
  supabase: SupabaseClient,
  userId: string,
  activeClientId?: string | null,
): Promise<AssistantMemory[]> {
  // Load user-scope + (optionally) client-scope memories in one query
  let query = supabase
    .from("assistant_memories")
    .select("id, scope, client_id, key, value")
    .eq("user_id", userId);

  if (activeClientId) {
    // Guard against PostgREST .or() string injection — clientId must be a UUID.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(activeClientId)) {
      console.warn("loadRelevantMemories: rejecting non-UUID clientId", activeClientId);
      return [];
    }
    query = query.or(`scope.eq.user,and(scope.eq.client,client_id.eq.${activeClientId})`);
  } else {
    query = query.eq("scope", "user");
  }

  const { data, error } = await query;
  if (error) {
    console.warn("loadRelevantMemories: failed", error.message);
    return [];
  }

  return (data ?? []).map((r) => ({
    id: r.id,
    scope: r.scope,
    clientId: r.client_id ?? undefined,
    key: r.key,
    value: r.value,
  }));
}

export async function saveMemory(
  supabase: SupabaseClient,
  userId: string,
  mem: AssistantMemory,
  sourceThreadId?: string,
): Promise<void> {
  if (mem.scope === "client" && !mem.clientId) {
    throw new Error("client-scope memory requires clientId");
  }
  const row = {
    user_id: userId,
    scope: mem.scope,
    client_id: mem.scope === "client" ? mem.clientId : null,
    key: mem.key,
    value: mem.value,
    source_thread_id: sourceThreadId ?? null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from("assistant_memories")
    .upsert(row, { onConflict: "user_id,scope,client_id,key" });
  if (error) throw new Error(`saveMemory: ${error.message}`);
}

export async function deleteMemory(
  supabase: SupabaseClient,
  userId: string,
  memoryId: string,
): Promise<void> {
  const { error } = await supabase
    .from("assistant_memories")
    .delete()
    .eq("id", memoryId)
    .eq("user_id", userId);
  if (error) throw new Error(`deleteMemory: ${error.message}`);
}

/**
 * Pure function: format memories as a system-prompt section.
 */
export function formatMemoriesForPrompt(memories: AssistantMemory[]): string {
  if (memories.length === 0) return "";
  const userMems = memories.filter((m) => m.scope === "user");
  const clientMems = memories.filter((m) => m.scope === "client");
  const sections: string[] = [];
  if (userMems.length > 0) {
    sections.push(
      "About the user (agency owner):\n" +
        userMems.map((m) => `- ${m.key}: ${m.value}`).join("\n"),
    );
  }
  if (clientMems.length > 0) {
    sections.push(
      "About the active client:\n" +
        clientMems.map((m) => `- ${m.key}: ${m.value}`).join("\n"),
    );
  }
  return sections.join("\n\n");
}
```

- [ ] **Step 4: Run test, verify it passes**

```bash
deno test supabase/functions/_shared/assistant/memory.test.ts
```
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/assistant/memory.ts supabase/functions/_shared/assistant/memory.test.ts
git commit -m "feat(assistant): memory module — load/save user + client memories

loadRelevantMemories returns user-scope + (optional) client-scope
in one query. saveMemory upserts on (user_id, scope, client_id, key).
formatMemoriesForPrompt produces grouped system-prompt text."
```

---

## Task 7: Shared library — `threads.ts`

**Files:**
- Create: `supabase/functions/_shared/assistant/threads.ts`
- Create: `supabase/functions/_shared/assistant/threads.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// supabase/functions/_shared/assistant/threads.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { rowToThreadMeta, rowToMessage } from "./threads.ts";

Deno.test("rowToThreadMeta — maps DB row to ThreadMeta", () => {
  const row = {
    id: "t1",
    user_id: "u1",
    client_id: "c1",
    canvas_node_id: "node-7",
    origin: "canvas",
    title: "Launch script",
    message_count: 24,
    last_message_at: "2026-05-03T10:00:00Z",
    created_at: "2026-05-01T10:00:00Z",
    updated_at: "2026-05-03T10:00:00Z",
  };
  const meta = rowToThreadMeta(row);
  assertEquals(meta.id, "t1");
  assertEquals(meta.userId, "u1");
  assertEquals(meta.clientId, "c1");
  assertEquals(meta.canvasNodeId, "node-7");
  assertEquals(meta.origin, "canvas");
  assertEquals(meta.title, "Launch script");
  assertEquals(meta.messageCount, 24);
});

Deno.test("rowToThreadMeta — handles null client_id and canvas_node_id (drawer thread)", () => {
  const row = {
    id: "t2",
    user_id: "u1",
    client_id: null,
    canvas_node_id: null,
    origin: "drawer",
    title: null,
    message_count: 0,
    last_message_at: null,
    created_at: "2026-05-03T10:00:00Z",
    updated_at: "2026-05-03T10:00:00Z",
  };
  const meta = rowToThreadMeta(row);
  assertEquals(meta.clientId, null);
  assertEquals(meta.canvasNodeId, null);
  assertEquals(meta.origin, "drawer");
});

Deno.test("rowToMessage — preserves jsonb content as-is", () => {
  const row = {
    id: "m1",
    thread_id: "t1",
    role: "user",
    content: { type: "text", text: "hello" },
    model: null,
    created_at: "2026-05-03T10:00:00Z",
  };
  const msg = rowToMessage(row);
  assertEquals(msg.threadId, "t1");
  assertEquals(msg.role, "user");
  assertEquals(msg.content, { type: "text", text: "hello" });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
deno test supabase/functions/_shared/assistant/threads.test.ts
```
Expected: failure (module not found).

- [ ] **Step 3: Write the implementation**

```ts
// supabase/functions/_shared/assistant/threads.ts
import type {
  AssistantMessage,
  AssistantOrigin,
  MessageContent,
  ThreadMeta,
} from "./types.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

export function rowToThreadMeta(row: any): ThreadMeta {
  return {
    id: row.id,
    userId: row.user_id,
    clientId: row.client_id,
    canvasNodeId: row.canvas_node_id,
    origin: row.origin as AssistantOrigin,
    title: row.title,
    messageCount: row.message_count,
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToMessage(row: any): AssistantMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    role: row.role,
    content: row.content as MessageContent,
    model: row.model ?? undefined,
    createdAt: row.created_at,
  };
}

export interface CreateThreadParams {
  userId: string;
  clientId?: string | null;
  canvasNodeId?: string | null;
  origin: AssistantOrigin;
  title?: string;
}

export async function createThread(
  supabase: SupabaseClient,
  p: CreateThreadParams,
): Promise<ThreadMeta> {
  const { data, error } = await supabase
    .from("assistant_threads")
    .insert({
      user_id: p.userId,
      client_id: p.clientId ?? null,
      canvas_node_id: p.canvasNodeId ?? null,
      origin: p.origin,
      title: p.title ?? null,
    })
    .select()
    .single();
  if (error || !data) throw new Error(`createThread: ${error?.message ?? "no row returned"}`);
  return rowToThreadMeta(data);
}

export async function getThread(
  supabase: SupabaseClient,
  threadId: string,
): Promise<ThreadMeta | null> {
  const { data, error } = await supabase
    .from("assistant_threads")
    .select("*")
    .eq("id", threadId)
    .maybeSingle();
  if (error) throw new Error(`getThread: ${error.message}`);
  return data ? rowToThreadMeta(data) : null;
}

export async function listThreadsForClient(
  supabase: SupabaseClient,
  userId: string,
  clientId: string,
  limit = 50,
): Promise<ThreadMeta[]> {
  const { data, error } = await supabase
    .from("assistant_threads")
    .select("*")
    .eq("user_id", userId)
    .eq("client_id", clientId)
    .order("last_message_at", { ascending: false, nullsLast: true })
    .limit(limit);
  if (error) throw new Error(`listThreadsForClient: ${error.message}`);
  return (data ?? []).map(rowToThreadMeta);
}

export async function listAgencyThreads(
  supabase: SupabaseClient,
  userId: string,
  limit = 20,
): Promise<ThreadMeta[]> {
  const { data, error } = await supabase
    .from("assistant_threads")
    .select("*")
    .eq("user_id", userId)
    .is("client_id", null)
    .order("last_message_at", { ascending: false, nullsLast: true })
    .limit(limit);
  if (error) throw new Error(`listAgencyThreads: ${error.message}`);
  return (data ?? []).map(rowToThreadMeta);
}

export async function appendMessage(
  supabase: SupabaseClient,
  threadId: string,
  msg: { role: "user" | "assistant" | "tool"; content: MessageContent; model?: string },
): Promise<AssistantMessage> {
  const { data, error } = await supabase
    .from("assistant_messages")
    .insert({
      thread_id: threadId,
      role: msg.role,
      content: msg.content,
      model: msg.model ?? null,
    })
    .select()
    .single();
  if (error || !data) throw new Error(`appendMessage: ${error?.message ?? "no row"}`);
  return rowToMessage(data);
}

export async function loadMessages(
  supabase: SupabaseClient,
  threadId: string,
  limit = 100,
): Promise<AssistantMessage[]> {
  const { data, error } = await supabase
    .from("assistant_messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`loadMessages: ${error.message}`);
  return (data ?? []).map(rowToMessage);
}
```

- [ ] **Step 4: Run test, verify it passes**

```bash
deno test supabase/functions/_shared/assistant/threads.test.ts
```
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/assistant/threads.ts supabase/functions/_shared/assistant/threads.test.ts
git commit -m "feat(assistant): threads module — CRUD for assistant_threads + messages

Pure rowToThreadMeta / rowToMessage mappers (unit-tested) plus async
DB helpers: createThread, getThread, listThreadsForClient,
listAgencyThreads, appendMessage, loadMessages."
```

---

## Task 8: Shared library — `mode.ts`

**Files:**
- Create: `supabase/functions/_shared/assistant/mode.ts`
- Create: `supabase/functions/_shared/assistant/mode.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// supabase/functions/_shared/assistant/mode.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { detectModeFromPath, toolsForMode } from "./mode.ts";

Deno.test("detectModeFromPath — agency for /home, /dashboard, /clients (list)", () => {
  assertEquals(detectModeFromPath("/home"), { mode: "agency", clientId: null });
  assertEquals(detectModeFromPath("/dashboard"), { mode: "agency", clientId: null });
  assertEquals(detectModeFromPath("/clients"), { mode: "agency", clientId: null });
  assertEquals(detectModeFromPath("/vault"), { mode: "agency", clientId: null });
  assertEquals(detectModeFromPath("/leads"), { mode: "agency", clientId: null });
  assertEquals(detectModeFromPath("/ai"), { mode: "agency", clientId: null });
});

Deno.test("detectModeFromPath — client for /clients/:id/* paths", () => {
  const m = detectModeFromPath("/clients/abc-123/scripts");
  assertEquals(m.mode, "client");
  assertEquals(m.clientId, "abc-123");
});

Deno.test("detectModeFromPath — handles trailing slash and query string", () => {
  assertEquals(detectModeFromPath("/clients/xyz/scripts/").mode, "client");
  assertEquals(detectModeFromPath("/clients/xyz?view=canvas").mode, "client");
  assertEquals(detectModeFromPath("/clients/xyz/scripts?view=canvas").clientId, "xyz");
});

Deno.test("toolsForMode — agency drawer surface excludes single-client tools", () => {
  const tools = toolsForMode({ mode: "agency", clientId: null }, "drawer");
  assertEquals(tools.includes("list_all_clients"), true);
  assertEquals(tools.includes("create_script"), false);
  assertEquals(tools.includes("submit_to_editing_queue"), false);
  assertEquals(tools.includes("generate_script_streaming"), false);
});

Deno.test("toolsForMode — client drawer surface includes script + queue tools", () => {
  const tools = toolsForMode({ mode: "client", clientId: "c1" }, "drawer");
  assertEquals(tools.includes("create_script"), true);
  assertEquals(tools.includes("submit_to_editing_queue"), true);
  assertEquals(tools.includes("get_client_strategy"), true);
  assertEquals(tools.includes("generate_script_streaming"), false); // canvas-only
});

Deno.test("toolsForMode — canvas surface is the only one with generate_script_streaming", () => {
  const drawerClient = toolsForMode({ mode: "client", clientId: "c1" }, "drawer");
  const canvasClient = toolsForMode({ mode: "client", clientId: "c1" }, "canvas");
  assertEquals(drawerClient.includes("generate_script_streaming"), false);
  assertEquals(canvasClient.includes("generate_script_streaming"), true);
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
deno test supabase/functions/_shared/assistant/mode.test.ts
```
Expected: failure (module not found).

- [ ] **Step 3: Write the implementation**

```ts
// supabase/functions/_shared/assistant/mode.ts
import type { AssistantMode, AssistantSurface } from "./types.ts";

const CLIENT_PATH_RE = /^\/clients\/([^/?#]+)(?:[/?#].*)?$/;

/**
 * Pure function: derive the operating mode from a request path.
 * Client-mode iff the path starts with `/clients/<id>` (with `<id>` not equal to a known
 * agency-level segment). Otherwise agency.
 */
export function detectModeFromPath(path: string): AssistantMode {
  // Trim any host/origin prefix the caller might pass (defensive)
  const cleanPath = path.startsWith("http") ? new URL(path).pathname + (new URL(path).search ?? "") : path;
  const match = CLIENT_PATH_RE.exec(cleanPath);
  if (match && match[1] && match[1] !== "" && match[1] !== "/") {
    return { mode: "client", clientId: match[1] };
  }
  return { mode: "agency", clientId: null };
}

const SHARED_BOTH_MODES = [
  "save_memory",
  "navigate_to_page",
  "list_all_clients",
  "get_client_info",
  "find_viral_videos",
  "fill_onboarding_fields",
];

const CLIENT_ONLY = [
  "get_client_strategy",
  "get_scripts",
  "create_script",
  "schedule_content",
  "submit_to_editing_queue",
  "create_canvas_note",
  "add_video_to_canvas",
  "add_research_note",
  "add_idea_nodes",
  "add_script_draft",
];

const AGENCY_ONLY = [
  "get_editing_queue_cross_client",
];

const CLIENT_ALSO = [
  "get_editing_queue_single_client",
  "get_content_calendar",
];

const CANVAS_ONLY = [
  "generate_script_streaming",
];

export function toolsForMode(
  mode: AssistantMode,
  surface: AssistantSurface,
): string[] {
  const tools: string[] = [...SHARED_BOTH_MODES];
  if (mode.mode === "agency") {
    tools.push(...AGENCY_ONLY, "get_content_calendar");
  } else {
    tools.push(...CLIENT_ONLY, ...CLIENT_ALSO);
  }
  if (surface === "canvas") {
    tools.push(...CANVAS_ONLY);
  }
  return tools;
}
```

- [ ] **Step 4: Run test, verify it passes**

```bash
deno test supabase/functions/_shared/assistant/mode.test.ts
```
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/assistant/mode.ts supabase/functions/_shared/assistant/mode.test.ts
git commit -m "feat(assistant): mode module — agency/client detection + tool gating

detectModeFromPath parses /clients/:id paths (with trailing slash and
query string handling). toolsForMode returns the tool subset for a
given (mode, surface) combination — matches the gating matrix in the
design spec."
```

---

## Task 9: Shared library — `prompt.ts`

**Files:**
- Create: `supabase/functions/_shared/assistant/prompt.ts`
- Create: `supabase/functions/_shared/assistant/prompt.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// supabase/functions/_shared/assistant/prompt.test.ts
import { assertStringIncludes, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assemblePromptSections } from "./prompt.ts";

Deno.test("assemblePromptSections — agency mode includes mode line", () => {
  const out = assemblePromptSections({
    identity: { name: "Robby", language: "en" },
    mode: { mode: "agency", clientId: null },
    memories: [],
    surface: "drawer",
  });
  assertStringIncludes(out, "Robby");
  assertStringIncludes(out, "agency mode");
});

Deno.test("assemblePromptSections — client mode names the client", () => {
  const out = assemblePromptSections({
    identity: { name: "Robby", language: "en" },
    mode: { mode: "client", clientId: "c1" },
    activeClientName: "Maria",
    memories: [{ scope: "client", clientId: "c1", key: "tone", value: "direct" }],
    surface: "drawer",
  });
  assertStringIncludes(out, "Working on Maria");
  assertStringIncludes(out, "tone: direct");
});

Deno.test("assemblePromptSections — canvas surface notes connected nodes", () => {
  const out = assemblePromptSections({
    identity: { name: "Robby", language: "en" },
    mode: { mode: "client", clientId: "c1" },
    activeClientName: "Maria",
    memories: [],
    surface: "canvas",
    canvasContext: { connectedNodeCount: 2, connectedNodeTypes: ["video", "research"] },
  });
  assertStringIncludes(out, "canvas");
  assertStringIncludes(out, "2 connected node");
});

Deno.test("assemblePromptSections — pageContext line included when given", () => {
  const out = assemblePromptSections({
    identity: { name: "Robby", language: "en" },
    mode: { mode: "client", clientId: "c1" },
    activeClientName: "Maria",
    memories: [],
    surface: "drawer",
    pageContext: { path: "/clients/c1/scripts" },
  });
  assertStringIncludes(out, "/clients/c1/scripts");
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
deno test supabase/functions/_shared/assistant/prompt.test.ts
```
Expected: failure (module not found).

- [ ] **Step 3: Write the implementation**

```ts
// supabase/functions/_shared/assistant/prompt.ts
import type {
  AssistantIdentity,
  AssistantMemory,
  AssistantMode,
  AssistantSurface,
} from "./types.ts";
import { buildIdentitySystemPrompt } from "./identity.ts";
import { formatMemoriesForPrompt } from "./memory.ts";

export interface CanvasContext {
  connectedNodeCount: number;
  connectedNodeTypes: string[];
}

export interface PageContext {
  path: string;
  activeClientId?: string | null;
}

export interface AssemblePromptParams {
  identity: AssistantIdentity;
  mode: AssistantMode;
  activeClientName?: string;
  memories: AssistantMemory[];
  surface: AssistantSurface;
  canvasContext?: CanvasContext;
  pageContext?: PageContext;
  /** Caller-provided extras (e.g. canvas's existing system prompt body, strategy data). */
  extras?: string[];
}

/**
 * Pure function — composes the system prompt from identity, mode, memory, surface, and extras.
 * No DB access. Easy to snapshot-test.
 */
export function assemblePromptSections(p: AssemblePromptParams): string {
  const sections: string[] = [];

  // 1. Identity
  sections.push(buildIdentitySystemPrompt(p.identity));

  // 2. Mode
  if (p.mode.mode === "agency") {
    sections.push(
      "You are operating in agency mode. Cross-client tools are available; per-client tools are not. " +
        "If the user asks for client-specific work, ask which client to switch to or use list_all_clients to surface options.",
    );
  } else {
    const name = p.activeClientName ?? "the active client";
    sections.push(
      `You are in client mode. Working on ${name} (clientId=${p.mode.clientId}). ` +
        "Client-specific tools are pre-scoped to this client; auto-fill any client_name argument with this client's name.",
    );
  }

  // 3. Memory
  const memoryText = formatMemoriesForPrompt(p.memories);
  if (memoryText) sections.push(memoryText);

  // 4. Surface context
  if (p.surface === "canvas") {
    const cnt = p.canvasContext?.connectedNodeCount ?? 0;
    const types = p.canvasContext?.connectedNodeTypes ?? [];
    const nodeBit = cnt === 0
      ? "No nodes are connected to your AI assistant node yet."
      : `${cnt} connected node${cnt === 1 ? "" : "s"} (${types.join(", ")}).`;
    sections.push(
      `You are rendered as the canvas AI assistant node. ${nodeBit} ` +
        "Use connected video transcripts and research notes as primary context for script generation.",
    );
  } else {
    sections.push(
      "You are rendered in the companion drawer. Concise replies. " +
        "If the user asks for full script editing, suggest opening the canvas — don't try to render canvas-specific UI here.",
    );
  }

  // 5. Page context
  if (p.pageContext) {
    sections.push(`Current page: ${p.pageContext.path}`);
  }

  // 6. Caller extras
  if (p.extras?.length) {
    sections.push(...p.extras);
  }

  return sections.join("\n\n");
}
```

- [ ] **Step 4: Run test, verify it passes**

```bash
deno test supabase/functions/_shared/assistant/prompt.test.ts
```
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/assistant/prompt.ts supabase/functions/_shared/assistant/prompt.test.ts
git commit -m "feat(assistant): prompt module — assemble system prompt

Pure assemblePromptSections function combines identity + mode + memory
+ surface (drawer vs canvas) + page context + caller extras into the
final system prompt. Snapshot-friendly for tests; no DB access."
```

---

## Task 10: Run all shared-library tests together

**Files:**
- (no new files)

- [ ] **Step 1: Run the full Deno test suite for the shared library**

```bash
cd supabase/functions/_shared/assistant
deno test --allow-net --allow-env
```

Expected output:
```
running X tests from ./identity.test.ts ... ok
running X tests from ./memory.test.ts ... ok
running X tests from ./threads.test.ts ... ok
running X tests from ./mode.test.ts ... ok
running X tests from ./prompt.test.ts ... ok
ok | 19 passed | 0 failed
```

- [ ] **Step 2: Type-check all files**

```bash
deno check supabase/functions/_shared/assistant/*.ts
```

Expected: no errors.

- [ ] **Step 3: No commit if all green** (already committed per-task)

---

## Task 11: Backfill — `canvas_ai_chats` → `assistant_threads` + `assistant_messages`

**Files:**
- Create: `supabase/migrations/20260503_backfill_canvas_ai_chats.sql`

- [ ] **Step 1: Write the backfill migration**

```sql
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
-- We expand each message preserving order via WITH ORDINALITY.
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
  -- Synthesize a created_at by spacing messages 1ms apart from the chat's created_at
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
```

- [ ] **Step 2: Apply migration**

Run: `supabase db push --linked`.

- [ ] **Step 3: Verify backfill completeness**

```sql
-- Row counts must match
SELECT
  (SELECT count(*) FROM canvas_ai_chats) AS source_chats,
  (SELECT count(*) FROM assistant_threads WHERE origin = 'canvas') AS dest_threads;
-- Expected: equal numbers

-- Spot-check: pick the largest chat and verify message count
SELECT
  c.id,
  jsonb_array_length(c.messages) AS source_messages,
  t.message_count AS dest_count,
  (SELECT count(*) FROM assistant_messages m WHERE m.thread_id = t.id) AS actual_dest_count
FROM canvas_ai_chats c
JOIN assistant_threads t ON t.id = c.id
ORDER BY jsonb_array_length(c.messages) DESC NULLS LAST
LIMIT 5;
-- Expected: source_messages = dest_count = actual_dest_count for all rows
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260503_backfill_canvas_ai_chats.sql
git commit -m "feat(assistant): backfill canvas_ai_chats into new tables

Idempotent migration. Each canvas_ai_chats row becomes one
assistant_threads row (preserving UUID); each entry in the messages
JSONB array becomes one assistant_messages row. Includes sanity
check on message_count consistency."
```

---

## Task 12: Backfill — `companion_messages` → `assistant_threads` + `assistant_messages`

**Files:**
- Create: `supabase/migrations/20260503_backfill_companion_messages.sql`

- [ ] **Step 1: Write the backfill migration**

```sql
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
```

- [ ] **Step 2: Apply migration**

Run: `supabase db push --linked`.

- [ ] **Step 3: Verify backfill**

```sql
-- Row counts
SELECT
  (SELECT count(*) FROM companion_messages) AS source_messages,
  (SELECT count(*) FROM assistant_messages m
     JOIN assistant_threads t ON t.id = m.thread_id
     WHERE t.title = 'Legacy chat (archived)') AS dest_messages;
-- Expected: equal numbers

-- Spot-check: per-client message counts match
SELECT
  cm.client_id,
  count(cm.*) AS source_count,
  t.message_count AS dest_count
FROM companion_messages cm
JOIN clients cl ON cl.id = cm.client_id
JOIN assistant_threads t
  ON t.client_id = cm.client_id AND t.user_id = cl.user_id
  AND t.title = 'Legacy chat (archived)'
GROUP BY cm.client_id, t.message_count
HAVING count(cm.*) <> t.message_count
LIMIT 5;
-- Expected: zero rows
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260503_backfill_companion_messages.sql
git commit -m "feat(assistant): backfill companion_messages into legacy archive threads

One drawer-origin assistant_thread per (user, client) titled
'Legacy chat (archived)'. Copies all companion_messages into
assistant_messages with text content type. Idempotent."
```

---

## Task 13: Wire `companion-chat` to dual-write

**Files:**
- Modify: `supabase/functions/companion-chat/index.ts` (existing 1681 lines)

- [ ] **Step 1: Locate the message-save site in companion-chat**

Run:
```bash
grep -n "companion_messages" /Users/admin/Documents/connectacreators/supabase/functions/companion-chat/index.ts
```
Expected: shows lines where companion_messages is read/inserted. Note these line numbers.

- [ ] **Step 2: Add the dual-write helper at the top of the file**

Insert imports near other imports (around line 1-20):

```ts
// Existing imports stay. Add:
import {
  createThread as assistantCreateThread,
  appendMessage as assistantAppendMessage,
} from "../_shared/assistant/threads.ts";
```

Add the helper function (place near the top, after imports):

```ts
/**
 * Phase A dual-write: in addition to existing companion_messages persistence,
 * write each turn into the new assistant_threads + assistant_messages tables.
 * Failures are logged but don't block the response. Read path still uses
 * companion_messages — the new tables are write-only until Phase B.
 */
async function dualWriteCompanionTurn(
  supabase: any,
  params: {
    userId: string;
    clientId: string;
    requestPath: string;
    userMessageText: string;
    assistantReplyText: string;
  },
) {
  try {
    // For each (user, client) we maintain ONE active drawer thread for the dual-write.
    // Look it up by sentinel title; create if missing.
    const sentinel = "Active companion chat";
    const { data: existing } = await supabase
      .from("assistant_threads")
      .select("id")
      .eq("user_id", params.userId)
      .eq("client_id", params.clientId)
      .eq("origin", "drawer")
      .eq("title", sentinel)
      .maybeSingle();

    let threadId = existing?.id;
    if (!threadId) {
      const t = await assistantCreateThread(supabase, {
        userId: params.userId,
        clientId: params.clientId,
        origin: "drawer",
        title: sentinel,
      });
      threadId = t.id;
    }

    await assistantAppendMessage(supabase, threadId, {
      role: "user",
      content: { type: "text", text: params.userMessageText },
    });
    await assistantAppendMessage(supabase, threadId, {
      role: "assistant",
      content: { type: "text", text: params.assistantReplyText },
    });
  } catch (err) {
    console.warn("dualWriteCompanionTurn failed:", err instanceof Error ? err.message : err);
  }
}
```

- [ ] **Step 3: Call the dual-write helper after the existing save**

Find the existing site where the assistant's reply is saved to `companion_messages` (search for `companion_messages` insert near the response-return path). Right after that insert succeeds, add:

```ts
// Phase A dual-write to the new unified tables (non-blocking on failure).
await dualWriteCompanionTurn(supabase, {
  userId: user.id,
  clientId: clientIdResolved,  // whatever variable names the existing code uses
  requestPath: current_path,
  userMessageText: userMessage,
  assistantReplyText: replyText,
});
```

(Variable names like `clientIdResolved`, `userMessage`, `replyText` will be the names the existing code uses — adapt to local naming. The block must run after the existing `companion_messages` write so it doesn't change behavior on the read side.)

- [ ] **Step 4: Deploy and smoke-test**

Deploy the function:
```bash
supabase functions deploy companion-chat
```

Send a test request from the actual app (open the bubble on `/clients/<a real client>/scripts`, send "test message"). Then verify dual-write succeeded:

```sql
-- Pick the user that just chatted
SELECT t.id, t.message_count, t.last_message_at
FROM assistant_threads t
WHERE t.title = 'Active companion chat'
ORDER BY t.last_message_at DESC LIMIT 5;
-- Expected: one row with message_count >= 2 and recent last_message_at

SELECT m.role, m.content
FROM assistant_messages m
JOIN assistant_threads t ON t.id = m.thread_id
WHERE t.title = 'Active companion chat'
ORDER BY m.created_at DESC LIMIT 4;
-- Expected: alternating user/assistant rows; latest content matches what you sent
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/companion-chat/index.ts
git commit -m "feat(companion-chat): dual-write to assistant_threads + assistant_messages

Phase A: each turn now writes to BOTH companion_messages (existing,
read path) AND assistant_threads + assistant_messages (new, write only).
One drawer-origin 'Active companion chat' thread per (user, client)
acts as the dual-write sentinel until Phase B switches reads over.
Failures in the new write path are logged, not raised."
```

---

## Task 14: Wire `ai-assistant` to dual-write

**Files:**
- Modify: `supabase/functions/ai-assistant/index.ts` (existing 1267 lines)

- [ ] **Step 1: Locate the chat-save site in ai-assistant**

Run:
```bash
grep -n "canvas_ai_chats" /Users/admin/Documents/connectacreators/supabase/functions/ai-assistant/index.ts
```
Note the line numbers where messages get appended to `canvas_ai_chats.messages`.

- [ ] **Step 2: Add dual-write helper**

Insert imports:

```ts
import {
  appendMessage as assistantAppendMessage,
} from "../_shared/assistant/threads.ts";
```

Add the helper:

```ts
/**
 * Phase A dual-write for canvas chats. The existing canvas_ai_chats row's UUID
 * is reused as the assistant_threads UUID (per the Phase A backfill convention).
 * If somehow the assistant_threads row doesn't exist yet (e.g. brand-new chat
 * created after migration), we create it on demand.
 */
async function dualWriteCanvasTurn(
  supabase: any,
  params: {
    chatId: string;
    userId: string;
    clientId: string;
    nodeId: string;
    chatName: string;
    userMessageText: string;
    assistantContent: { type: 'text'; text: string } | { type: 'script_preview'; script: unknown };
    model?: string;
  },
) {
  try {
    // Ensure the assistant_threads row exists for this canvas chat
    const { data: existing } = await supabase
      .from("assistant_threads")
      .select("id")
      .eq("id", params.chatId)
      .maybeSingle();

    if (!existing) {
      const { error: insertErr } = await supabase
        .from("assistant_threads")
        .insert({
          id: params.chatId,
          user_id: params.userId,
          client_id: params.clientId,
          canvas_node_id: params.nodeId,
          origin: "canvas",
          title: params.chatName,
        });
      if (insertErr) throw new Error(insertErr.message);
    }

    await assistantAppendMessage(supabase, params.chatId, {
      role: "user",
      content: { type: "text", text: params.userMessageText },
    });
    await assistantAppendMessage(supabase, params.chatId, {
      role: "assistant",
      content: params.assistantContent,
      model: params.model,
    });
  } catch (err) {
    console.warn("dualWriteCanvasTurn failed:", err instanceof Error ? err.message : err);
  }
}
```

- [ ] **Step 3: Call the helper after existing canvas_ai_chats save**

Find the site where `canvas_ai_chats.messages` is updated with the new message pair. Right after that update succeeds, add:

```ts
// Phase A dual-write to assistant_threads + assistant_messages (non-blocking).
await dualWriteCanvasTurn(supabase, {
  chatId: chatId,                  // existing variable
  userId: user.id,
  clientId: clientId,              // existing
  nodeId: nodeId,                  // existing
  chatName: chatName ?? "New Chat",
  userMessageText: userMessage,    // existing
  assistantContent: scriptResult
    ? { type: "script_preview", script: scriptResult }
    : { type: "text", text: assistantReplyText },
  model: modelKey,                 // existing variable holding model id
});
```

(Adapt variable names to actual local names in the file.)

- [ ] **Step 4: Deploy and smoke-test**

```bash
supabase functions deploy ai-assistant
```

Open a canvas in the app, send a message in the canvas AI chat. Verify:

```sql
SELECT t.id, t.canvas_node_id, t.message_count, t.last_message_at
FROM assistant_threads t
WHERE t.origin = 'canvas'
ORDER BY t.last_message_at DESC LIMIT 5;
-- Expected: latest row's message_count incremented, last_message_at recent

SELECT m.role, m.content->>'type' AS content_type
FROM assistant_messages m
JOIN assistant_threads t ON t.id = m.thread_id
WHERE t.origin = 'canvas'
ORDER BY m.created_at DESC LIMIT 4;
-- Expected: latest 2 rows are role=assistant + role=user (most recent first)
-- content_type is 'text' for chat replies, 'script_preview' for generated scripts
```

- [ ] **Step 5: Verify canvas behavior unchanged**

In the app:
1. Open a canvas chat — existing messages still load (read path unchanged).
2. Send a message — get a reply (canvas behavior unchanged).
3. Switch to a different chat session — multi-session sidebar still works.
4. Generate a script — script preview still streams correctly.

If any of the above regress, the dual-write is interfering. Roll back the file change with `git revert`, fix, re-deploy.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/ai-assistant/index.ts
git commit -m "feat(ai-assistant): dual-write to assistant_threads + assistant_messages

Phase A: every canvas chat turn now writes to BOTH canvas_ai_chats
(existing, read path) AND assistant_threads + assistant_messages (new,
write only). Reuses canvas_ai_chats.id as the assistant_threads.id.
Auto-creates the assistant_threads row on first turn for chats made
after the Phase A backfill. Non-blocking on failure."
```

---

## Task 15: Phase A validation suite

**Files:**
- Create: `supabase/migrations/20260503_phase_a_validation.sql` (NOT a real migration — a validation script kept for reference)

- [ ] **Step 1: Write a validation SQL script (run as a smoke-test, not a migration)**

Save to `supabase/migrations/20260503_phase_a_validation.sql` but commented out so it doesn't auto-run. Or save under a `scripts/` folder. (This project uses `supabase/migrations/` for schema only — put the validation script under `scripts/sql/phase-a-validation.sql` if that directory exists, or create it.)

```sql
-- scripts/sql/phase-a-validation.sql
-- Run manually after Phase A deploy to verify data foundation health.

-- 1. All canvas chats backfilled
SELECT
  (SELECT count(*) FROM canvas_ai_chats) AS source,
  (SELECT count(*) FROM assistant_threads WHERE origin = 'canvas') AS dest;
-- Expected: equal

-- 2. All companion_messages backfilled
SELECT
  (SELECT count(*) FROM companion_messages) AS source,
  (SELECT count(*) FROM assistant_messages m
     JOIN assistant_threads t ON t.id = m.thread_id
     WHERE t.title = 'Legacy chat (archived)') AS dest;
-- Expected: equal

-- 3. New canvas chats (after deploy) are dual-writing
SELECT count(*) FROM assistant_threads
WHERE origin = 'canvas' AND created_at > NOW() - INTERVAL '1 hour';
-- Expected: at least 1 if any canvas chats happened in the last hour

-- 4. New companion chats (after deploy) are dual-writing
SELECT count(*) FROM assistant_threads
WHERE title = 'Active companion chat' AND last_message_at > NOW() - INTERVAL '1 hour';
-- Expected: at least 1 if any companion chats happened in the last hour

-- 5. Constraint integrity: no canvas threads with NULL canvas_node_id
SELECT count(*) FROM assistant_threads
WHERE origin = 'canvas' AND canvas_node_id IS NULL;
-- Expected: 0

-- 6. Constraint integrity: no drawer threads with non-NULL canvas_node_id
SELECT count(*) FROM assistant_threads
WHERE origin = 'drawer' AND canvas_node_id IS NOT NULL;
-- Expected: 0

-- 7. Memory scope integrity
SELECT count(*) FROM assistant_memories WHERE scope = 'client' AND client_id IS NULL;
-- Expected: 0
SELECT count(*) FROM assistant_memories WHERE scope = 'user' AND client_id IS NOT NULL;
-- Expected: 0

-- 8. Trigger integrity: every thread's message_count matches actual count
SELECT t.id, t.message_count, count(m.*)
FROM assistant_threads t
LEFT JOIN assistant_messages m ON m.thread_id = t.id
GROUP BY t.id, t.message_count
HAVING t.message_count <> count(m.*)
LIMIT 5;
-- Expected: zero rows
```

- [ ] **Step 2: Run validation against the live database**

```bash
supabase db psql --linked < scripts/sql/phase-a-validation.sql
```
(Or paste each block into the Supabase SQL editor.)

Expected: all checks pass per their "Expected" comments.

- [ ] **Step 3: Commit the validation script**

```bash
mkdir -p scripts/sql
mv supabase/migrations/20260503_phase_a_validation.sql scripts/sql/phase-a-validation.sql
git add scripts/sql/phase-a-validation.sql
git commit -m "chore(assistant): add Phase A validation SQL script

Manual checks: row count parity for both backfills, constraint
integrity (origin/canvas_node_id, memory scope), trigger correctness
(message_count vs actual). Run after deploys to verify data foundation."
```

---

## Phase A complete

After Task 15: schema in place, shared library tested, both backfills run, both edge functions dual-writing. **No user-facing change yet** — UI still reads from `canvas_ai_chats` and `companion_messages`.

### Known Phase A coverage gap (resolve in Phase B)

The `ai-assistant` dual-write fires only inside the **streaming** canvas branch (where the function persists messages server-side via `canvas_ai_chats.messages` updates). The **non-streaming** canvas path returns the response to the client and lets the client persist — meaning new canvas chats made via the non-streaming path will not flow into `assistant_threads`/`assistant_messages` during Phase A. Phase B options to close the gap:
- Mirror the client-side `canvas_ai_chats.messages` save with a parallel call to `appendMessage` from the client, OR
- Move the non-streaming path's persistence server-side so it fires the same dual-write.

This gap is acceptable for Phase A because (a) streaming is the dominant canvas-chat traffic, and (b) Phase B can run a one-shot reconciliation backfill before flipping the read path.

**Phase B preview (next plan to write):**
- Extract `<AssistantChat>`, `<AssistantThreadList>`, `<AssistantContextPanel>`, `<AssistantInput>` components from `CanvasAIPanel.tsx`
- Build `CompanionDrawer.tsx` using the shared components
- Refactor `CommandCenter.tsx` (`/ai`) for the three-panel layout
- Migrate UI read paths to the new tables (with feature flag for safety)

**Phase C preview:**
- Cut over edge functions to use `_shared/assistant/` for prompt assembly + memory load
- Drop `companion_messages` table (data already migrated)
- Build the memory editor page in Settings
