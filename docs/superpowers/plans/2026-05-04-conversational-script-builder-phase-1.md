# Conversational Script Builder — Phase 1 (Foundations) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the durable state spine for the conversational script builder: a `companion_build_sessions` table, a pure FSM module with state classification (🟢/🟡/🔴), a `process-build-step` edge function that walks a session through fake states, and a drawer that shows live progress via Supabase Realtime. End state: I can type "build me a script" in Robby, see a build session row appear, watch a banner in the drawer transition through fake states, and confirm the same updates appear in a second browser tab.

**Architecture:** Hybrid FSM + LLM. Phase 1 ignores the LLM entirely — every state's "work" is a `sleep + transition`. We're proving the spine: durable state, background continuation via self-chained edge function invocations, Realtime push to the drawer. Phase 2 will swap the dummy work for real tool calls (idea generation, framework search, etc.).

**Tech Stack:** Supabase (Postgres + Edge Functions/Deno + Realtime), TypeScript, React, existing `assistant_threads`/`assistant_messages` schema on main.

**Spec reference:** [docs/superpowers/specs/2026-05-04-conversational-script-builder-design.md](../specs/2026-05-04-conversational-script-builder-design.md)

---

## File structure

**New files:**
- `supabase/migrations/20260504_companion_build_sessions.sql` — table + RLS + Realtime publication
- `supabase/functions/_shared/build-fsm/states.ts` — pure state machine: state names, classification, transition map
- `supabase/functions/_shared/build-fsm/states.test.ts` — Deno unit tests
- `supabase/functions/_shared/build-session/service.ts` — DB CRUD wrappers for `companion_build_sessions`
- `supabase/functions/_shared/build-session/service.test.ts` — pure transformation tests (rowToBuildSession)
- `supabase/functions/process-build-step/index.ts` — background worker (advances FSM by one step, optionally chains to self)
- `supabase/functions/process-build-step/deno.json` — Deno config
- `src/hooks/useActiveBuildSessions.ts` — React hook subscribing to `companion_build_sessions` for the current user
- `src/components/companion/BuildBanner.tsx` — banner UI showing current state, status, pause/cancel buttons (cancel is wired in this phase; pause stub for Phase 5)

**Modified files:**
- `supabase/config.toml` — register `process-build-step` with `verify_jwt = false` (matches project convention)
- `supabase/functions/companion-chat/index.ts` — when user message looks like a build trigger AND autonomy mode is `ask`, create a build session row + invoke `process-build-step`. Phase 1 only — full v2 split happens in Phase 2.
- `src/components/CompanionDrawer.tsx` — render `<BuildBanner />` at the top of the drawer when a build session exists for the open thread

---

## Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260504_companion_build_sessions.sql`

- [ ] **Step 1: Write the migration**

```sql
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

  -- Idea queue (populated in Phase 2)
  ideas               jsonb NOT NULL DEFAULT '[]'::jsonb,
  current_idea_index  int  NOT NULL DEFAULT 0,
  selected_ideas      jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Per-idea working data (populated in Phase 2)
  current_framework_video_id uuid,
  current_script_draft       text,
  current_script_id          uuid,

  -- Token-saving cache (populated in Phase 2)
  cached_canvas_context     text,
  cached_canvas_context_at  timestamptz,

  -- Behavior flags
  auto_pilot      boolean NOT NULL DEFAULT false,
  error_message   text,

  -- Telemetry (populated in Phase 6)
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

-- Auto-bump updated_at
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

-- Realtime — drawer subscribes to this for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE companion_build_sessions;

-- RLS
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
```

- [ ] **Step 2: Apply the migration**

Run via the Supabase MCP: `apply_migration` with the file's contents, name `20260504_companion_build_sessions`.

Expected: success. The MCP returns `{ "success": true }` or similar.

- [ ] **Step 3: Verify the table exists with the right shape**

Run via Supabase MCP `execute_sql`:

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'companion_build_sessions'
ORDER BY ordinal_position;
```

Expected: 18 rows. Confirm `status` is `text` with default `'running'`, `current_state` is `text` with default `'INIT'`, `auto_pilot` is `boolean` with default `false`.

- [ ] **Step 4: Verify Realtime publication**

```sql
SELECT pubname, tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND tablename = 'companion_build_sessions';
```

Expected: 1 row.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260504_companion_build_sessions.sql
git commit -m "feat(builder): companion_build_sessions table for conversational builds"
```

---

## Task 2: Pure FSM module — state names

**Files:**
- Create: `supabase/functions/_shared/build-fsm/states.ts`
- Test: `supabase/functions/_shared/build-fsm/states.test.ts`

This task only defines the state vocabulary and classification. Transitions come in Task 3.

- [ ] **Step 1: Write the failing test**

```typescript
// supabase/functions/_shared/build-fsm/states.test.ts
import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  BUILD_STATES,
  BuildStateName,
  classifyState,
  StateClassification,
} from "./states.ts";

Deno.test("BUILD_STATES — contains all 15 states from the spec", () => {
  const expected: BuildStateName[] = [
    "INIT",
    "RESOLVE_CHAT",
    "AWAITING_IDEA",
    "READING_CONTEXT",
    "IDEAS_GENERATED",
    "FINDING_FRAMEWORKS",
    "FRAMEWORKS_PRESENTED",
    "ADDING_VIDEOS",
    "TRANSCRIBING",
    "DRAFTING_SCRIPT",
    "DRAFT_PRESENTED",
    "GENERATING_SCRIPT",
    "SCRIPT_SAVED",
    "LOOPING_NEXT",
    "DONE",
  ];
  assertEquals(BUILD_STATES, expected);
});

Deno.test("classifyState — SOFT_ASK states pause by default", () => {
  assertEquals(classifyState("INIT"), "SOFT_ASK");
  assertEquals(classifyState("RESOLVE_CHAT"), "SOFT_ASK");
  assertEquals(classifyState("AWAITING_IDEA"), "SOFT_ASK");
  assertEquals(classifyState("IDEAS_GENERATED"), "SOFT_ASK");
  assertEquals(classifyState("FRAMEWORKS_PRESENTED"), "SOFT_ASK");
  assertEquals(classifyState("LOOPING_NEXT"), "SOFT_ASK");
});

Deno.test("classifyState — HARD_ASK states always pause", () => {
  assertEquals(classifyState("DRAFT_PRESENTED"), "HARD_ASK");
});

Deno.test("classifyState — AUTO states never pause", () => {
  assertEquals(classifyState("READING_CONTEXT"), "AUTO");
  assertEquals(classifyState("FINDING_FRAMEWORKS"), "AUTO");
  assertEquals(classifyState("ADDING_VIDEOS"), "AUTO");
  assertEquals(classifyState("TRANSCRIBING"), "AUTO");
  assertEquals(classifyState("DRAFTING_SCRIPT"), "AUTO");
  assertEquals(classifyState("GENERATING_SCRIPT"), "AUTO");
  assertEquals(classifyState("SCRIPT_SAVED"), "AUTO");
  assertEquals(classifyState("DONE"), "AUTO");
});

Deno.test("classifyState — unknown state throws", () => {
  // @ts-expect-error testing runtime safety
  assertThrows(() => classifyState("BANANA"));
});
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
cd supabase/functions/_shared/build-fsm && deno test --allow-net states.test.ts
```

Expected: failure — `Module not found "./states.ts"`.

- [ ] **Step 3: Write the implementation**

```typescript
// supabase/functions/_shared/build-fsm/states.ts
// Build session FSM — state names + classification.
// See docs/superpowers/specs/2026-05-04-conversational-script-builder-design.md

export const BUILD_STATES = [
  "INIT",
  "RESOLVE_CHAT",
  "AWAITING_IDEA",
  "READING_CONTEXT",
  "IDEAS_GENERATED",
  "FINDING_FRAMEWORKS",
  "FRAMEWORKS_PRESENTED",
  "ADDING_VIDEOS",
  "TRANSCRIBING",
  "DRAFTING_SCRIPT",
  "DRAFT_PRESENTED",
  "GENERATING_SCRIPT",
  "SCRIPT_SAVED",
  "LOOPING_NEXT",
  "DONE",
] as const;

export type BuildStateName = (typeof BUILD_STATES)[number];

export type StateClassification = "AUTO" | "SOFT_ASK" | "HARD_ASK";

const CLASSIFICATION: Record<BuildStateName, StateClassification> = {
  INIT: "SOFT_ASK",
  RESOLVE_CHAT: "SOFT_ASK",
  AWAITING_IDEA: "SOFT_ASK",
  READING_CONTEXT: "AUTO",
  IDEAS_GENERATED: "SOFT_ASK",
  FINDING_FRAMEWORKS: "AUTO",
  FRAMEWORKS_PRESENTED: "SOFT_ASK",
  ADDING_VIDEOS: "AUTO",
  TRANSCRIBING: "AUTO",
  DRAFTING_SCRIPT: "AUTO",
  DRAFT_PRESENTED: "HARD_ASK",
  GENERATING_SCRIPT: "AUTO",
  SCRIPT_SAVED: "AUTO",
  LOOPING_NEXT: "SOFT_ASK",
  DONE: "AUTO",
};

export function classifyState(state: BuildStateName): StateClassification {
  const c = CLASSIFICATION[state];
  if (!c) throw new Error(`Unknown build state: ${state}`);
  return c;
}
```

- [ ] **Step 4: Run the test, verify it passes**

```bash
cd supabase/functions/_shared/build-fsm && deno test --allow-net states.test.ts
```

Expected: 5 passes.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/build-fsm/
git commit -m "feat(builder): build FSM state names + classification"
```

---

## Task 3: FSM transitions

**Files:**
- Modify: `supabase/functions/_shared/build-fsm/states.ts` (append)
- Modify: `supabase/functions/_shared/build-fsm/states.test.ts` (append)

- [ ] **Step 1: Add the failing transition tests**

Append to `states.test.ts`:

```typescript
import { nextState, isTerminal } from "./states.ts";

Deno.test("nextState — happy path follows the spec", () => {
  assertEquals(nextState("INIT"), "RESOLVE_CHAT");
  assertEquals(nextState("RESOLVE_CHAT"), "AWAITING_IDEA");
  assertEquals(nextState("AWAITING_IDEA"), "READING_CONTEXT");
  assertEquals(nextState("READING_CONTEXT"), "IDEAS_GENERATED");
  assertEquals(nextState("IDEAS_GENERATED"), "FINDING_FRAMEWORKS");
  assertEquals(nextState("FINDING_FRAMEWORKS"), "FRAMEWORKS_PRESENTED");
  assertEquals(nextState("FRAMEWORKS_PRESENTED"), "ADDING_VIDEOS");
  assertEquals(nextState("ADDING_VIDEOS"), "TRANSCRIBING");
  assertEquals(nextState("TRANSCRIBING"), "DRAFTING_SCRIPT");
  assertEquals(nextState("DRAFTING_SCRIPT"), "DRAFT_PRESENTED");
  assertEquals(nextState("DRAFT_PRESENTED"), "GENERATING_SCRIPT");
  assertEquals(nextState("GENERATING_SCRIPT"), "SCRIPT_SAVED");
  assertEquals(nextState("SCRIPT_SAVED"), "LOOPING_NEXT");
  assertEquals(nextState("LOOPING_NEXT"), "AWAITING_IDEA");
});

Deno.test("nextState — terminal returns null", () => {
  assertEquals(nextState("DONE"), null);
});

Deno.test("isTerminal — only DONE is terminal", () => {
  assertEquals(isTerminal("DONE"), true);
  assertEquals(isTerminal("INIT"), false);
  assertEquals(isTerminal("DRAFT_PRESENTED"), false);
  assertEquals(isTerminal("LOOPING_NEXT"), false);
});
```

- [ ] **Step 2: Run, verify failures**

```bash
cd supabase/functions/_shared/build-fsm && deno test --allow-net states.test.ts
```

Expected: 3 failures (`nextState`, `isTerminal` not exported).

- [ ] **Step 3: Add the implementation**

Append to `states.ts`:

```typescript
// Happy-path transition map. LOOPING_NEXT loops back to AWAITING_IDEA so the
// next idea in the queue gets processed; the orchestrator finalizes to DONE
// when the queue is empty (handled in Phase 2 by checking current_idea_index
// against ideas.length before transitioning).
const NEXT: Partial<Record<BuildStateName, BuildStateName>> = {
  INIT: "RESOLVE_CHAT",
  RESOLVE_CHAT: "AWAITING_IDEA",
  AWAITING_IDEA: "READING_CONTEXT",
  READING_CONTEXT: "IDEAS_GENERATED",
  IDEAS_GENERATED: "FINDING_FRAMEWORKS",
  FINDING_FRAMEWORKS: "FRAMEWORKS_PRESENTED",
  FRAMEWORKS_PRESENTED: "ADDING_VIDEOS",
  ADDING_VIDEOS: "TRANSCRIBING",
  TRANSCRIBING: "DRAFTING_SCRIPT",
  DRAFTING_SCRIPT: "DRAFT_PRESENTED",
  DRAFT_PRESENTED: "GENERATING_SCRIPT",
  GENERATING_SCRIPT: "SCRIPT_SAVED",
  SCRIPT_SAVED: "LOOPING_NEXT",
  LOOPING_NEXT: "AWAITING_IDEA",
  // DONE has no successor.
};

export function nextState(current: BuildStateName): BuildStateName | null {
  return NEXT[current] ?? null;
}

export function isTerminal(state: BuildStateName): boolean {
  return state === "DONE";
}
```

- [ ] **Step 4: Run, verify passes**

```bash
cd supabase/functions/_shared/build-fsm && deno test --allow-net states.test.ts
```

Expected: 8 passes (5 from Task 2 + 3 new).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/build-fsm/
git commit -m "feat(builder): FSM happy-path transitions"
```

---

## Task 4: Build session row mapping

**Files:**
- Create: `supabase/functions/_shared/build-session/types.ts`
- Create: `supabase/functions/_shared/build-session/service.ts`
- Test: `supabase/functions/_shared/build-session/service.test.ts`

This task introduces the type-safe row mapper. DB-touching functions land in Task 5.

- [ ] **Step 1: Write the failing test**

```typescript
// supabase/functions/_shared/build-session/service.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { rowToBuildSession } from "./service.ts";

Deno.test("rowToBuildSession — maps DB row to typed BuildSession", () => {
  const row = {
    id: "b1",
    user_id: "u1",
    client_id: "c1",
    thread_id: "t1",
    canvas_state_id: "cs1",
    status: "running",
    current_state: "INIT",
    ideas: [],
    current_idea_index: 0,
    selected_ideas: [],
    current_framework_video_id: null,
    current_script_draft: null,
    current_script_id: null,
    cached_canvas_context: null,
    cached_canvas_context_at: null,
    auto_pilot: false,
    error_message: null,
    token_usage: {},
    created_at: "2026-05-04T10:00:00Z",
    updated_at: "2026-05-04T10:00:00Z",
    last_activity_at: "2026-05-04T10:00:00Z",
  };
  const session = rowToBuildSession(row);
  assertEquals(session.id, "b1");
  assertEquals(session.userId, "u1");
  assertEquals(session.clientId, "c1");
  assertEquals(session.threadId, "t1");
  assertEquals(session.canvasStateId, "cs1");
  assertEquals(session.status, "running");
  assertEquals(session.currentState, "INIT");
  assertEquals(session.autoPilot, false);
  assertEquals(session.ideas, []);
});

Deno.test("rowToBuildSession — preserves status enum values", () => {
  const statuses = ["running","awaiting_user","paused","completed","cancelled","error"] as const;
  for (const s of statuses) {
    const row = baseRow({ status: s });
    assertEquals(rowToBuildSession(row).status, s);
  }
});

function baseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "b1",
    user_id: "u1",
    client_id: "c1",
    thread_id: "t1",
    canvas_state_id: null,
    status: "running",
    current_state: "INIT",
    ideas: [],
    current_idea_index: 0,
    selected_ideas: [],
    current_framework_video_id: null,
    current_script_draft: null,
    current_script_id: null,
    cached_canvas_context: null,
    cached_canvas_context_at: null,
    auto_pilot: false,
    error_message: null,
    token_usage: {},
    created_at: "2026-05-04T10:00:00Z",
    updated_at: "2026-05-04T10:00:00Z",
    last_activity_at: "2026-05-04T10:00:00Z",
    ...overrides,
  };
}
```

- [ ] **Step 2: Run, verify failures**

```bash
cd supabase/functions/_shared/build-session && deno test --allow-net service.test.ts
```

Expected: failures (module not found).

- [ ] **Step 3: Write `types.ts`**

```typescript
// supabase/functions/_shared/build-session/types.ts
import type { BuildStateName } from "../build-fsm/states.ts";

export type BuildStatus =
  | "running"
  | "awaiting_user"
  | "paused"
  | "completed"
  | "cancelled"
  | "error";

export interface BuildIdea {
  title: string;
  keywords?: string[];
}

export interface BuildSession {
  id: string;
  userId: string;
  clientId: string;
  threadId: string;
  canvasStateId: string | null;
  status: BuildStatus;
  currentState: BuildStateName;
  ideas: BuildIdea[];
  currentIdeaIndex: number;
  selectedIdeas: BuildIdea[];
  currentFrameworkVideoId: string | null;
  currentScriptDraft: string | null;
  currentScriptId: string | null;
  cachedCanvasContext: string | null;
  cachedCanvasContextAt: string | null;
  autoPilot: boolean;
  errorMessage: string | null;
  tokenUsage: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
}
```

- [ ] **Step 4: Write the minimal `service.ts`**

```typescript
// supabase/functions/_shared/build-session/service.ts
import type { BuildSession, BuildStatus } from "./types.ts";
import type { BuildStateName } from "../build-fsm/states.ts";

export function rowToBuildSession(row: Record<string, unknown>): BuildSession {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    clientId: row.client_id as string,
    threadId: row.thread_id as string,
    canvasStateId: (row.canvas_state_id as string | null) ?? null,
    status: row.status as BuildStatus,
    currentState: row.current_state as BuildStateName,
    ideas: (row.ideas as BuildSession["ideas"]) ?? [],
    currentIdeaIndex: (row.current_idea_index as number) ?? 0,
    selectedIdeas: (row.selected_ideas as BuildSession["selectedIdeas"]) ?? [],
    currentFrameworkVideoId: (row.current_framework_video_id as string | null) ?? null,
    currentScriptDraft: (row.current_script_draft as string | null) ?? null,
    currentScriptId: (row.current_script_id as string | null) ?? null,
    cachedCanvasContext: (row.cached_canvas_context as string | null) ?? null,
    cachedCanvasContextAt: (row.cached_canvas_context_at as string | null) ?? null,
    autoPilot: (row.auto_pilot as boolean) ?? false,
    errorMessage: (row.error_message as string | null) ?? null,
    tokenUsage: (row.token_usage as Record<string, unknown>) ?? {},
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    lastActivityAt: row.last_activity_at as string,
  };
}
```

- [ ] **Step 5: Run, verify passes**

```bash
cd supabase/functions/_shared/build-session && deno test --allow-net service.test.ts
```

Expected: 2 passes.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/build-session/
git commit -m "feat(builder): BuildSession types + row mapper"
```

---

## Task 5: Build session DB CRUD

**Files:**
- Modify: `supabase/functions/_shared/build-session/service.ts` (append)

These functions hit the database. They're tested manually via Supabase MCP `execute_sql` because Deno tests against a live DB are heavy for this layer.

- [ ] **Step 1: Append the CRUD functions**

```typescript
// At the top of service.ts, add this import next to existing ones:
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// Then append:

export async function createBuildSession(
  client: SupabaseClient,
  init: {
    userId: string;
    clientId: string;
    threadId: string;
    canvasStateId?: string | null;
    autoPilot?: boolean;
  },
): Promise<BuildSession> {
  const { data, error } = await client
    .from("companion_build_sessions")
    .insert({
      user_id: init.userId,
      client_id: init.clientId,
      thread_id: init.threadId,
      canvas_state_id: init.canvasStateId ?? null,
      auto_pilot: init.autoPilot ?? false,
    })
    .select("*")
    .single();
  if (error) throw new Error(`createBuildSession: ${error.message}`);
  return rowToBuildSession(data as Record<string, unknown>);
}

export async function getBuildSession(
  client: SupabaseClient,
  id: string,
): Promise<BuildSession | null> {
  const { data, error } = await client
    .from("companion_build_sessions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getBuildSession: ${error.message}`);
  return data ? rowToBuildSession(data as Record<string, unknown>) : null;
}

export async function getActiveBuildSessionForThread(
  client: SupabaseClient,
  threadId: string,
): Promise<BuildSession | null> {
  const { data, error } = await client
    .from("companion_build_sessions")
    .select("*")
    .eq("thread_id", threadId)
    .in("status", ["running", "awaiting_user", "paused"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getActiveBuildSessionForThread: ${error.message}`);
  return data ? rowToBuildSession(data as Record<string, unknown>) : null;
}

export async function updateBuildSession(
  client: SupabaseClient,
  id: string,
  patch: Partial<{
    status: BuildSession["status"];
    currentState: BuildStateName;
    autoPilot: boolean;
    errorMessage: string | null;
    lastActivityAt: string;
  }>,
): Promise<BuildSession> {
  const dbPatch: Record<string, unknown> = {};
  if (patch.status !== undefined) dbPatch.status = patch.status;
  if (patch.currentState !== undefined) dbPatch.current_state = patch.currentState;
  if (patch.autoPilot !== undefined) dbPatch.auto_pilot = patch.autoPilot;
  if (patch.errorMessage !== undefined) dbPatch.error_message = patch.errorMessage;
  if (patch.lastActivityAt !== undefined) dbPatch.last_activity_at = patch.lastActivityAt;
  dbPatch.last_activity_at ??= new Date().toISOString();
  const { data, error } = await client
    .from("companion_build_sessions")
    .update(dbPatch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`updateBuildSession: ${error.message}`);
  return rowToBuildSession(data as Record<string, unknown>);
}
```

- [ ] **Step 2: Run existing tests to confirm no regression**

```bash
cd supabase/functions/_shared/build-session && deno test --allow-net service.test.ts
```

Expected: 2 passes (still — we didn't add tests for DB functions).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/build-session/service.ts
git commit -m "feat(builder): build session CRUD (create/get/getActive/update)"
```

---

## Task 6: process-build-step skeleton

**Files:**
- Create: `supabase/functions/process-build-step/index.ts`
- Create: `supabase/functions/process-build-step/deno.json`
- Modify: `supabase/config.toml`

In Phase 1 each state's "work" is a 500ms sleep + transition. This proves the worker chains itself through AUTO states and stops at SOFT_ASK / HARD_ASK without the LLM in the loop.

- [ ] **Step 1: Write `deno.json`**

```json
{
  "imports": {
    "@supabase/supabase-js": "https://esm.sh/@supabase/supabase-js@2.45.4"
  }
}
```

- [ ] **Step 2: Write `index.ts`**

```typescript
// supabase/functions/process-build-step/index.ts
// Background worker: advance one build session by one FSM step.
// Self-chains through AUTO states; halts at SOFT_ASK/HARD_ASK or when paused.
//
// Phase 1: every state's "work" is a 500ms sleep so we can prove the
// chaining works end-to-end without LLM dependency. Phase 2 swaps the
// dummy work for real tool calls.

import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";
import {
  classifyState,
  isTerminal,
  nextState,
  type BuildStateName,
} from "../_shared/build-fsm/states.ts";
import {
  getBuildSession,
  updateBuildSession,
} from "../_shared/build-session/service.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface RequestBody {
  build_session_id: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!body.build_session_id) {
    return new Response(JSON.stringify({ error: "missing build_session_id" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const session = await getBuildSession(admin, body.build_session_id);
  if (!session) {
    return new Response(JSON.stringify({ error: "session not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (session.status !== "running") {
    // Paused, awaiting_user, completed, cancelled, error — caller should not chain.
    return new Response(
      JSON.stringify({ stopped: true, reason: `status=${session.status}` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Do the dummy work for the current state.
  await runDummyWorkFor(session.currentState);

  // If terminal, mark completed.
  if (isTerminal(session.currentState)) {
    await updateBuildSession(admin, session.id, { status: "completed" });
    return new Response(JSON.stringify({ done: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const nxt = nextState(session.currentState);
  if (!nxt) {
    await updateBuildSession(admin, session.id, { status: "completed" });
    return new Response(JSON.stringify({ done: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Decide whether to pause at the next state or chain.
  const cls = classifyState(nxt);
  // Auto-pilot promotes SOFT_ASK to AUTO. HARD_ASK always pauses.
  const willPause =
    cls === "HARD_ASK" || (cls === "SOFT_ASK" && !session.autoPilot);

  if (willPause) {
    await updateBuildSession(admin, session.id, {
      currentState: nxt,
      status: "awaiting_user",
    });
    return new Response(JSON.stringify({ paused: true, state: nxt }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Auto-advance: persist next state and chain to ourselves.
  await updateBuildSession(admin, session.id, { currentState: nxt });
  // Fire-and-forget — don't await, so this invocation returns quickly
  // and the chain doesn't blow past the function timeout.
  void fetch(`${SUPABASE_URL}/functions/v1/process-build-step`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ build_session_id: session.id }),
  });

  return new Response(JSON.stringify({ chained: true, state: nxt }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

async function runDummyWorkFor(state: BuildStateName): Promise<void> {
  // Phase 1 placeholder. Replaced in Phase 2 with real per-state work.
  await new Promise((r) => setTimeout(r, 500));
  console.log(`[process-build-step] dummy work for ${state}`);
}
```

- [ ] **Step 3: Register in `supabase/config.toml`**

Add this block alongside the other function blocks in `supabase/config.toml`:

```toml
[functions.process-build-step]
verify_jwt = false
```

- [ ] **Step 4: Deploy the function**

Use Supabase MCP `deploy_edge_function` with name `process-build-step` and the file contents from Step 2 (and `deno.json` from Step 1).

Expected: deploy succeeds.

- [ ] **Step 5: Smoke-test the function manually**

First, create a build session row directly via SQL (Supabase MCP `execute_sql`):

```sql
-- Get a real user/client/thread to FK to. Replace UUIDs with values from your env.
WITH ids AS (
  SELECT
    (SELECT id FROM auth.users LIMIT 1) AS user_id,
    (SELECT id FROM clients LIMIT 1) AS client_id,
    (SELECT id FROM assistant_threads LIMIT 1) AS thread_id
)
INSERT INTO companion_build_sessions (user_id, client_id, thread_id, current_state, auto_pilot)
SELECT user_id, client_id, thread_id, 'READING_CONTEXT', true
FROM ids
RETURNING id, current_state, status, auto_pilot;
```

Note the `id` returned (call it `BSID`).

Then invoke the function via Supabase MCP `execute_sql` with `pg_net` OR via the project URL with curl. Easiest: use `select net.http_post` if `pg_net` is enabled, else use a temporary `curl` from a terminal:

```bash
PROJECT_REF=hxojqrilwhhrvloiwmfo
SERVICE_ROLE_KEY=...   # get from .env or supabase dashboard
curl -X POST "https://$PROJECT_REF.supabase.co/functions/v1/process-build-step" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"build_session_id":"<BSID>"}'
```

Expected response: `{"chained":true,"state":"IDEAS_GENERATED"}` — the worker advanced from `READING_CONTEXT` (AUTO) into `IDEAS_GENERATED` (SOFT_ASK), then because `auto_pilot=true` was set, it should continue chaining further.

Wait ~5 seconds, then check the row:

```sql
SELECT id, current_state, status FROM companion_build_sessions WHERE id = '<BSID>';
```

Expected: with `auto_pilot=true`, the chain should walk through all SOFT_ASK states, stop at `DRAFT_PRESENTED` (HARD_ASK), and you'll see `current_state = 'DRAFT_PRESENTED'`, `status = 'awaiting_user'`. Total elapsed ~5–7s (15 states × ~500ms).

If you instead set `auto_pilot=false` and start at `READING_CONTEXT`, the chain advances to `IDEAS_GENERATED` (SOFT_ASK) and stops there.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/process-build-step/ supabase/config.toml
git commit -m "feat(builder): process-build-step worker (Phase 1: dummy work)"
```

---

## Task 7: useActiveBuildSessions hook

**Files:**
- Create: `src/hooks/useActiveBuildSessions.ts`

- [ ] **Step 1: Write the hook**

```typescript
// src/hooks/useActiveBuildSessions.ts
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type BuildStatus =
  | "running"
  | "awaiting_user"
  | "paused"
  | "completed"
  | "cancelled"
  | "error";

export interface ActiveBuildSession {
  id: string;
  client_id: string;
  thread_id: string;
  status: BuildStatus;
  current_state: string;
  auto_pilot: boolean;
  updated_at: string;
}

const ACTIVE_STATUSES: BuildStatus[] = ["running", "awaiting_user", "paused"];

export function useActiveBuildSessions() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<ActiveBuildSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setSessions([]);
      setLoading(false);
      return;
    }
    let cancelled = false;

    async function load() {
      const { data, error } = await supabase
        .from("companion_build_sessions")
        .select("id, client_id, thread_id, status, current_state, auto_pilot, updated_at")
        .eq("user_id", user.id)
        .in("status", ACTIVE_STATUSES)
        .order("updated_at", { ascending: false });
      if (cancelled) return;
      if (!error && data) setSessions(data as ActiveBuildSession[]);
      setLoading(false);
    }
    void load();

    const channel = supabase
      .channel(`build-sessions-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "companion_build_sessions",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          // Cheap reload on any change — drawer surface is small.
          void load();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [user]);

  return { sessions, loading };
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep useActiveBuildSessions
```

Expected: no output (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useActiveBuildSessions.ts
git commit -m "feat(builder): useActiveBuildSessions Realtime hook"
```

---

## Task 8: BuildBanner component

**Files:**
- Create: `src/components/companion/BuildBanner.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/companion/BuildBanner.tsx
import { Loader2, Pause, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { ActiveBuildSession } from "@/hooks/useActiveBuildSessions";

const STATE_LABEL: Record<string, string> = {
  INIT: "Getting started",
  RESOLVE_CHAT: "Confirming canvas",
  AWAITING_IDEA: "Asking for an idea",
  READING_CONTEXT: "Reading canvas notes",
  IDEAS_GENERATED: "Showing ideas",
  FINDING_FRAMEWORKS: "Finding viral frameworks",
  FRAMEWORKS_PRESENTED: "Showing frameworks",
  ADDING_VIDEOS: "Adding videos to canvas",
  TRANSCRIBING: "Transcribing video",
  DRAFTING_SCRIPT: "Drafting script",
  DRAFT_PRESENTED: "Awaiting your approval",
  GENERATING_SCRIPT: "Saving script",
  SCRIPT_SAVED: "Script saved",
  LOOPING_NEXT: "Moving to next idea",
  DONE: "Done",
};

interface Props {
  session: ActiveBuildSession;
}

export function BuildBanner({ session }: Props) {
  const label = STATE_LABEL[session.current_state] ?? session.current_state;

  async function handleCancel() {
    if (!confirm("Cancel this build? You can start over anytime.")) return;
    await supabase
      .from("companion_build_sessions")
      .update({ status: "cancelled" })
      .eq("id", session.id);
  }

  // Pause is wired in Phase 5. Stub for now.
  async function handlePause() {
    await supabase
      .from("companion_build_sessions")
      .update({ status: "paused" })
      .eq("id", session.id);
  }

  const showSpinner = session.status === "running";

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-primary/30 bg-primary/5">
      {showSpinner ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
      ) : (
        <span className="w-3.5 h-3.5 rounded-full bg-amber-400" />
      )}
      <span className="text-xs flex-1 text-foreground">
        {session.status === "paused" ? "Paused — " : ""}
        {label}
      </span>
      {session.status === "running" && (
        <button
          onClick={handlePause}
          className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-foreground"
          aria-label="Pause build"
        >
          <Pause className="w-3 h-3" />
        </button>
      )}
      <button
        onClick={handleCancel}
        className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400"
        aria-label="Cancel build"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep BuildBanner
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/components/companion/BuildBanner.tsx
git commit -m "feat(builder): BuildBanner UI"
```

---

## Task 9: Render BuildBanner in CompanionDrawer

**Files:**
- Modify: `src/components/CompanionDrawer.tsx`

- [ ] **Step 1: Read the current top-of-drawer markup**

Run:
```bash
grep -n "drawer\|companionName\|<header\|className.*p-3.*border" src/components/CompanionDrawer.tsx | head -20
```

Identify the JSX block right under the drawer header where the banner should slot in (above the messages list, below the title row). Note the exact line range.

- [ ] **Step 2: Add imports**

Near the existing imports in `CompanionDrawer.tsx`, add:

```tsx
import { useActiveBuildSessions } from "@/hooks/useActiveBuildSessions";
import { BuildBanner } from "@/components/companion/BuildBanner";
```

- [ ] **Step 3: Use the hook + render the banner for the current thread**

Inside the `CompanionDrawer` component body, after the existing `useCompanion()` destructure, add:

```tsx
const { sessions: buildSessions } = useActiveBuildSessions();
const buildForThisThread = activeThreadId
  ? buildSessions.find((s) => s.thread_id === activeThreadId)
  : null;
```

Then in the JSX, immediately above the messages list / below the header row, add:

```tsx
{buildForThisThread && (
  <div className="px-3 py-2">
    <BuildBanner session={buildForThisThread} />
  </div>
)}
```

(Use the line range you identified in Step 1 to place this in the right spot.)

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep CompanionDrawer
```

Expected: no output.

- [ ] **Step 5: Manually verify the wiring**

Start the dev server (`npm run dev`), open Robby on a client page, then in another terminal:

```sql
INSERT INTO companion_build_sessions (user_id, client_id, thread_id, current_state, status, auto_pilot)
SELECT
  (SELECT id FROM auth.users LIMIT 1),
  (SELECT id FROM clients LIMIT 1),
  '<the-thread-id-currently-open-in-robby>',
  'READING_CONTEXT',
  'running',
  false;
```

In the browser drawer, confirm the BuildBanner appears within ~1 second showing "Reading canvas notes". Then run:

```sql
UPDATE companion_build_sessions
SET current_state = 'IDEAS_GENERATED', status = 'awaiting_user'
WHERE thread_id = '<the-thread-id>';
```

Confirm the banner updates to "Showing ideas" with the amber dot (status not running). Click the X to cancel; verify the row updates to `status='cancelled'` and the banner disappears.

- [ ] **Step 6: Commit**

```bash
git add src/components/CompanionDrawer.tsx
git commit -m "feat(builder): render BuildBanner in CompanionDrawer"
```

---

## Task 10: Wire build-trigger detection into companion-chat

**Files:**
- Modify: `supabase/functions/companion-chat/index.ts`

This task adds a small pre-LLM gate: if the user's message in **Ask** mode looks like a build request *and* there's no active build session for the thread, we create a fresh build session and kick off `process-build-step` instead of running the LLM. Phase 2 will replace this stub with full FSM-aware LLM dispatch.

- [ ] **Step 1: Locate the entry block**

Run:
```bash
grep -n "autonomy_mode\|companion_name\|message\b" supabase/functions/companion-chat/index.ts | head -20
```

Find the request-handling section near the top of the function body where `message`, `companion_name`, and `autonomy_mode` are read from the body.

- [ ] **Step 2: Add the detector + branching block**

Right after the body fields are parsed (and before the existing LLM call), add:

```typescript
// Phase 1 conversational-builder bootstrap.
// Detect a build trigger in Ask mode and, if no build session is active
// for this thread, create one and kick off the worker. The reply text is
// minimal here; Phase 2 will route through the FSM with real LLM tools.
const BUILD_TRIGGER = /\b(build|write|create|make)\s+(me\s+)?a?\s*script\b/i;
if (autonomy_mode === "ask" && BUILD_TRIGGER.test(message ?? "")) {
  const threadId = thread?.id ?? null; // adjust to whatever variable holds the resolved thread id
  if (threadId) {
    const { getActiveBuildSessionForThread, createBuildSession } = await import(
      "../_shared/build-session/service.ts"
    );
    const existing = await getActiveBuildSessionForThread(adminClient, threadId);
    if (!existing) {
      const session = await createBuildSession(adminClient, {
        userId: user.id,
        clientId: client.id,
        threadId,
        canvasStateId: null,
        autoPilot: false,
      });
      // Fire-and-forget worker kickoff
      void fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/process-build-step`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ build_session_id: session.id }),
      });
      return new Response(
        JSON.stringify({
          reply: "On it — I'll start a build session. (Phase 1 stub: walking through fake states.)",
          actions: [],
          build_session_id: session.id,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    // If a session already exists, fall through to the normal LLM path
    // (Phase 1 doesn't ask "resume or replace?" — that's Phase 5).
  }
}
```

> **Adjust the variable names** (`thread`, `adminClient`, `client`, `user`, `corsHeaders`) to match what's actually in scope in the existing function. The grep in Step 1 should show you their names.

- [ ] **Step 3: Deploy the updated function**

Use Supabase MCP `deploy_edge_function` for `companion-chat` with the updated file.

Expected: deploy succeeds.

- [ ] **Step 4: End-to-end smoke test**

Open Robby in the drawer on a client page. Switch autonomy mode to **Ask**. Type:

```
build me a script
```

Expected within ~1 second:
- Robby replies *"On it — I'll start a build session. (Phase 1 stub: walking through fake states.)"*
- BuildBanner appears at top of drawer
- Banner state cycles: `INIT` → `RESOLVE_CHAT` → stops at `RESOLVE_CHAT` (SOFT_ASK, auto_pilot=false), shows `awaiting_user` (amber dot)
- Total elapsed ~1 second

Verify in DB:
```sql
SELECT id, status, current_state, auto_pilot
FROM companion_build_sessions
WHERE user_id = auth.uid()
ORDER BY created_at DESC LIMIT 1;
```

Expected: `status = 'awaiting_user'`, `current_state = 'RESOLVE_CHAT'`.

- [ ] **Step 5: Commit + deploy**

```bash
git add supabase/functions/companion-chat/index.ts
git commit -m "feat(builder): create build session on Ask-mode build trigger"
git push origin main
```

---

## Task 11: Documentation note in spec

**Files:**
- Modify: `docs/superpowers/specs/2026-05-04-conversational-script-builder-design.md`

- [ ] **Step 1: Append a Phase 1 status entry**

Add the following to the bottom of the spec under a new H2 `## Implementation status`:

```markdown
## Implementation status

- ✅ **Phase 1 (Foundations)** — completed YYYY-MM-DD. Schema, FSM module, process-build-step worker, drawer Realtime, build-trigger detection.
- ⏳ Phase 2 (Happy path) — not started.
- ⏳ Phase 3 (Interactive elements) — not started.
- ⏳ Phase 4 (Smart asking + auto-pilot) — not started.
- ⏳ Phase 5 (Background continuation + cross-client visibility) — not started.
- ⏳ Phase 6 (Polish) — not started.
```

(Replace `YYYY-MM-DD` with the actual completion date when filling in.)

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-05-04-conversational-script-builder-design.md
git commit -m "docs(builder): mark Phase 1 complete"
```

---

## Phase 1 acceptance criteria

When all tasks above are complete, the following must be true:

1. ✅ A migration exists creating `companion_build_sessions` with all 18 columns + RLS + Realtime publication.
2. ✅ `BUILD_STATES` is a frozen tuple of 15 state names; `classifyState` returns the correct 🟢/🟡/🔴 per the spec; `nextState` walks the happy path.
3. ✅ `process-build-step` advances a session through AUTO states without manual intervention, stops at HARD_ASK regardless of auto_pilot, and stops at SOFT_ASK when auto_pilot=false.
4. ✅ Sending *"build me a script"* in Robby (Ask mode) creates a build session row and the BuildBanner appears in the drawer within ~1s.
5. ✅ Updating a build session row from a SQL editor reflects in the drawer banner within ~1s (Realtime works).
6. ✅ Clicking the X on the banner sets `status='cancelled'` and the banner disappears.
7. ✅ All Deno tests pass: `cd supabase/functions/_shared && deno test --allow-net build-fsm/ build-session/`.
8. ✅ `npx tsc --noEmit` is clean.

Phase 2 plan can be written once these are all green.
