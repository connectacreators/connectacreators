# AI Companion ↔ Canvas AI Merge — Design Spec

**Date:** 2026-05-03
**Status:** Brainstormed, awaiting review
**Related:**
- `2026-05-02-ai-companion-vision.md` — overall companion roadmap
- `2026-05-02-ai-companion-phase1.md` — companion Phase 1 (shipped)
- `2026-03-19-canvas-ai-chat-persistence-design.md` — canvas chat sessions

---

## Goal

Make the companion (Robby / user-named) and the on-canvas AI feel like the **same assistant** — one name, one memory, one thread history, one tool surface — without changing how either surface looks or works internally.

Today they are two assistants:

- **Companion** (`CompanionBubble.tsx` + `companion-chat` edge function) — global bubble + `/ai` Command Center, orchestrator tools, ephemeral local-state chats.
- **Canvas AI** (`CanvasAIPanel.tsx` + `ai-assistant` edge function) — embedded canvas node + fullscreen view, deep streaming script generation, multi-session persisted chats per canvas.

After this work, both surfaces share a brain at the data layer: same memory store, same thread storage, same companion identity, same system-prompt foundation, same tool definitions. Each surface keeps its specialized rendering.

---

## Success criteria

1. A thread started in the bubble drawer on `/clients/maria/scripts` and a thread started in canvas #7 both appear in the same per-client thread list.
2. A fact saved by the companion ("Maria hates question hooks") appears in the Canvas AI's next response without the user repeating it.
3. The user-set companion name (NamingModal) is the name shown in both surfaces.
4. Drawer chats survive a page refresh (today they don't — see [`CompanionBubble.tsx:18`](src/components/CompanionBubble.tsx#L18) — `panelMessages` is React state).
5. On `/clients/:clientId/*` URLs, the companion auto-detects active client (client mode); on agency-level URLs (`/dashboard`, `/clients`, `/vault`, etc.) it operates in agency mode with a different tool subset.
6. Clicking a canvas-originated thread from the drawer navigates the user to that canvas with the right `chatId` selected (does not try to render canvas chat in the drawer).
7. No regression in canvas streaming script generation or canvas multi-session UX.

---

## Scope

### In scope

- New shared library `supabase/functions/_shared/assistant/` — memory, threads, prompt assembly, mode detection, tool definitions.
- New unified storage tables: `assistant_threads`, `assistant_messages`, `assistant_memories`.
- Migration of existing canvas chat sessions and `companion_messages` rows into the unified tables.
- Refactor of `CompanionBubble.tsx` to open a drawer that uses shared chat components (instead of today's compact panel with local state).
- Refactor of `CommandCenter.tsx` (`/ai` page) to use the same shared chat components — becomes the fullscreen view of the merged companion.
- Extraction of `<AssistantChat>`, `<AssistantThreadList>`, `<AssistantContextPanel>`, `<AssistantInput>` components from `CanvasAIPanel.tsx` into `src/components/assistant/`.
- Refactor of `CanvasAIPanel.tsx` / `AIAssistantNode.tsx` / `FullscreenAIView.tsx` to use the same shared components.
- Memory editor page: `/settings` → "What `<companion>` remembers" lets the user view/edit/delete per-client and per-user memories.
- Agency-mode vs client-mode tool gating, mode pill in headers.

### Out of scope (explicit non-goals)

- No change to canvas AI's streaming script generation logic (`generate_script_streaming` tool, hook templates, format/language switching).
- No change to canvas spatial UX (drag, edges, node connections, the AI canvas node placement).
- No new edge functions — `companion-chat` and `ai-assistant` both stay; only their internals share modules.
- No new auth/permission model — RLS pattern matches existing `companion_state`, `chat_sessions`, etc.
- No project-/canvas-level memory (only `user` and `client` scopes); deeper memory hierarchy is a future project.
- No collaborative real-time threads (single-user only).
- No replacement of the existing NamingModal flow.
- No changes to Phase 2 vision items (Monday sweep, Robby's Drafts tab, Strategy tab) — those continue independently.

---

## Architecture

```
                            ┌───────────────────────┐
                            │  Anthropic Claude API │
                            └───────────┬───────────┘
                                        │
         ┌──────────────────────────────┴──────────────────────────────┐
         │                                                             │
   ┌─────┴───────────────┐                                  ┌──────────┴─────────┐
   │ companion-chat      │                                  │ ai-assistant       │
   │ (edge function)     │                                  │ (edge function)    │
   │                     │                                  │                    │
   │ - reads/writes      │                                  │ - reads/writes     │
   │   shared lib        │                                  │   shared lib       │
   │ - companion-specific│                                  │ - canvas-specific  │
   │   actions (navigate,│                                  │   logic (streaming │
   │   fill_onboarding)  │                                  │   script preview)  │
   └─────────┬───────────┘                                  └──────────┬─────────┘
             │                                                         │
             │   ┌─────────────────────────────────────────────────┐   │
             └──▶│ supabase/functions/_shared/assistant/           │◀──┘
                 │ ├─ identity.ts       (name, base system prompt) │
                 │ ├─ memory.ts         (load/save user + client)  │
                 │ ├─ threads.ts        (CRUD + message append)    │
                 │ ├─ mode.ts           (agency vs client)         │
                 │ ├─ prompt.ts         (assemble final prompt)    │
                 │ └─ tools/            (shared tool defs)         │
                 └─────────────────┬───────────────────────────────┘
                                   │
                                   ▼
              ┌─────────────────────────────────────────────────┐
              │ Tables: assistant_threads, assistant_messages,  │
              │         assistant_memories                       │
              └─────────────────────────────────────────────────┘
                                   ▲
                                   │
   ┌───────────────────────────────┴───────────────────────────────┐
   │             src/components/assistant/ (shared React)          │
   │ ├─ AssistantChat.tsx       (streaming, chips, generate-script)│
   │ ├─ AssistantThreadList.tsx (CHATS sidebar, origin-tagged)     │
   │ ├─ AssistantContextPanel.tsx ("AI SEES" panel, accepts nodes) │
   │ └─ AssistantInput.tsx      (text + attach + generate button)  │
   │                                                               │
   │             src/hooks/useAssistantMode.ts                     │
   │             (URL → agency/client mode)                        │
   └───────────────────────────────┬───────────────────────────────┘
                                   │
            ┌──────────────────────┼──────────────────────┐
            ▼                      ▼                      ▼
   ┌────────────────┐    ┌──────────────────┐    ┌─────────────────────┐
   │ CompanionDrawer│    │ CommandCenter    │    │ CanvasAIPanel /     │
   │ (NEW, ~360px   │    │ (/ai page —      │    │ AIAssistantNode /   │
   │  side drawer)  │    │  fullscreen view)│    │ FullscreenAIView    │
   │                │    │                  │    │ (canvas surfaces —  │
   │ Triggered by   │    │ Reached via      │    │  refactored to use  │
   │ CompanionBubble│    │ drawer ⛶ button  │    │  shared components) │
   └────────────────┘    └──────────────────┘    └─────────────────────┘
```

---

## Data model

### `assistant_threads`

```sql
create table assistant_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade,   -- nullable: agency-mode threads
  canvas_node_id text,                                        -- reactflow AI-node id; nullable for drawer threads
  origin text not null check (origin in ('drawer', 'canvas')),
  title text,
  message_count int default 0,
  last_message_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index assistant_threads_user_client_idx
  on assistant_threads (user_id, client_id, last_message_at desc);
create index assistant_threads_canvas_idx
  on assistant_threads (client_id, canvas_node_id) where canvas_node_id is not null;

alter table assistant_threads enable row level security;
create policy "owner can read" on assistant_threads
  for select using (auth.uid() = user_id);
create policy "owner can write" on assistant_threads
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

**Constraints:**
- `origin = 'canvas'` ⟹ `canvas_node_id is not null` and `client_id is not null` (every canvas belongs to a client).
- `origin = 'drawer'` ⟹ `canvas_node_id is null`.
- `client_id is null` ⟹ thread was started in agency mode (no active client at creation time).
- Note: each client has exactly one canvas (the `canvas_states` row keyed by `client_id`); a "canvas thread" is identified by `(client_id, canvas_node_id, thread.id)`. Multiple threads per AI assistant node = multiple rows sharing the same `(client_id, canvas_node_id)`.

### `assistant_messages`

```sql
create table assistant_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references assistant_threads(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'tool')),
  content jsonb not null,  -- { type: 'text', text } | { type: 'tool_use', ... }
                           -- | { type: 'tool_result', ... } | { type: 'script_preview', ... }
  model text,              -- e.g. "claude-opus-4-7" — for analytics
  created_at timestamptz default now()
);
create index assistant_messages_thread_idx
  on assistant_messages (thread_id, created_at);

alter table assistant_messages enable row level security;
create policy "owner can read" on assistant_messages
  for select using (
    exists (select 1 from assistant_threads t
            where t.id = thread_id and t.user_id = auth.uid())
  );
create policy "owner can write" on assistant_messages
  for all using (
    exists (select 1 from assistant_threads t
            where t.id = thread_id and t.user_id = auth.uid())
  );
```

### `assistant_memories`

```sql
create table assistant_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check (scope in ('user', 'client')),
  client_id uuid references clients(id) on delete cascade,
  key text not null,         -- short label, e.g. "tone", "schedule", "current_campaign"
  value text not null,       -- the fact in natural language
  source_thread_id uuid references assistant_threads(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  -- NULLS NOT DISTINCT so user-scope rows (client_id IS NULL) dedupe correctly
  -- under ON CONFLICT in Postgres 15+. Without this, two user-scope rows with
  -- the same (user_id, scope, key) but client_id=NULL are considered distinct.
  unique nulls not distinct (user_id, scope, client_id, key)
);
create index assistant_memories_lookup_idx
  on assistant_memories (user_id, client_id);

alter table assistant_memories enable row level security;
create policy "owner can read" on assistant_memories
  for select using (auth.uid() = user_id);
create policy "owner can write" on assistant_memories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

**Constraint:** `scope = 'client'` ⟹ `client_id is not null`.

---

## The `_shared/assistant/` library

Located at `supabase/functions/_shared/assistant/`. Imported by both `companion-chat` and `ai-assistant` edge functions.

### `identity.ts`

```ts
export interface CompanionIdentity {
  name: string;            // user-chosen, from companion_state.companion_name
  language: 'en' | 'es';
}
export async function getCompanionIdentity(supabase, userId): Promise<CompanionIdentity>;
export function buildIdentitySystemPrompt(identity: CompanionIdentity): string;
```

### `memory.ts`

```ts
export interface AssistantMemory {
  scope: 'user' | 'client';
  clientId?: string;
  key: string;
  value: string;
}
export async function loadRelevantMemories(
  supabase, userId: string, activeClientId?: string
): Promise<AssistantMemory[]>;
export async function saveMemory(
  supabase, userId: string, mem: AssistantMemory, sourceThreadId?: string
): Promise<void>;
export async function deleteMemory(supabase, userId, memoryId): Promise<void>;
export function formatMemoriesForPrompt(memories: AssistantMemory[]): string;
```

### `threads.ts`

```ts
export interface ThreadMeta {
  id: string;
  userId: string;
  clientId?: string;
  canvasId?: string;
  origin: 'drawer' | 'canvas';
  title?: string;
  messageCount: number;
  lastMessageAt?: string;
}
export async function createThread(supabase, params): Promise<ThreadMeta>;
export async function getThread(supabase, threadId): Promise<ThreadMeta>;
export async function listThreadsForClient(supabase, userId, clientId): Promise<ThreadMeta[]>;
export async function listAgencyThreads(supabase, userId): Promise<ThreadMeta[]>;
export async function appendMessage(supabase, threadId, message): Promise<void>;
export async function loadMessages(supabase, threadId, limit?): Promise<Message[]>;
```

### `mode.ts`

```ts
export type AssistantMode =
  | { mode: 'agency'; clientId: null }
  | { mode: 'client'; clientId: string };

// Server-side: derive from current_path on request
export function detectModeFromPath(path: string): AssistantMode;

// Tool gating: which tools are exposed in this mode?
export function toolsForMode(mode: AssistantMode, surface: 'drawer' | 'canvas'): string[];
```

### `prompt.ts`

```ts
export async function assembleSystemPrompt(opts: {
  identity: CompanionIdentity;
  mode: AssistantMode;
  memories: AssistantMemory[];
  surface: 'drawer' | 'canvas';
  canvasContext?: CanvasContext;  // only when surface='canvas'
  pageContext?: { path: string; activeClientId?: string };
}): Promise<string>;
```

The assembled prompt has this layered structure:

1. **Identity** — "You are `<companion_name>`, the user's AI assistant in ConnectaCreators…"
2. **Mode** — "You are operating in agency mode" / "You are working with `<client_name>`"
3. **Memories** — "Things you remember about the user: …" / "Things you remember about `<client>`: …"
4. **Surface context** — page path + canvas nodes (if any)
5. **Tool guidance** — which tools to use for which intents
6. **Voice** — bilingual, plain English / Spanish

### `tools/`

Each tool is defined once and exported. Edge functions import the ones they support:

```
tools/
  save_memory.ts
  navigate_to_page.ts
  list_all_clients.ts
  get_client_info.ts
  get_client_strategy.ts
  get_scripts.ts
  create_script.ts
  find_viral_videos.ts
  schedule_content.ts
  get_editing_queue.ts
  submit_to_editing_queue.ts
  get_content_calendar.ts
  create_canvas_note.ts
  add_video_to_canvas.ts
  add_research_note.ts
  add_idea_nodes.ts
  add_script_draft.ts
  fill_onboarding_fields.ts
  generate_script_streaming.ts   // canvas-only
```

Each tool exports its Anthropic tool definition + a handler. The handler reads `mode` and `activeClientId` and uses them to scope DB queries (e.g., `get_editing_queue` returns single-client when client mode, cross-client when agency mode).

---

## UI changes

### `CompanionBubble.tsx` — minor refactor

Bubble visual unchanged. On click:
- Old: opens compact local-state panel.
- New: opens `<CompanionDrawer />` (new component), which uses `<AssistantChat>` + `<AssistantInput>` + `<AssistantThreadList>` (collapsed by default).

Local state for `panelMessages`, `chatInput`, etc. moves into the drawer; the drawer reads/writes via `_shared/assistant/threads.ts` through the existing edge function.

### `CompanionDrawer.tsx` — new

~360px wide right-side drawer. Layout:

```
┌────────────────────────────────────────┐
│ [≡][💬][👁]  Robby [Maria] · Online ⛶ ×│  ← header + tabs (left strip)
├────────────────────────────────────────┤
│ ⚡Auto  ?Ask  ≡Plan                    │  ← autonomy modes (existing)
├────────────────────────────────────────┤
│                                        │
│  <AssistantChat>                       │  ← shared chat component
│                                        │
├────────────────────────────────────────┤
│ chips...                               │
├────────────────────────────────────────┤
│ <AssistantInput>          [⚡Generate] │
└────────────────────────────────────────┘
```

- Left tab strip (≡ chats / 💬 chat / 👁 ai-sees) — when chats or ai-sees clicked, that panel slides in from left/right replacing the chat area; clicking 💬 returns to chat.
- ⛶ button → navigates to `/ai` (fullscreen view).
- × closes drawer.

### `CommandCenter.tsx` (`/ai` page) — refactored

Today's CommandCenter has its own simple chat (companion_messages). Replaced with the canvas-AI-style three-panel layout using shared components:

```
┌─────────────────────────────────────────────────────────────┐
│ ← Back                                            Roberto · Working on Maria
├─────────────┬───────────────────────────────────┬───────────┤
│ CHATS       │                                   │ AI SEES   │
│ + New       │                                   │ ──────── │
│             │   <AssistantChat>                 │           │
│ Today       │                                   │ (empty    │
│ • Hook…     │                                   │  off-     │
│             │                                   │  canvas)  │
│ Earlier     │                                   │           │
│ • Launch…   │                                   │           │
│ • Hook var… │                                   │           │
│             │                                   │           │
├─────────────┤   chips...                        │           │
│             │   <AssistantInput>      [Generate]│           │
└─────────────┴───────────────────────────────────┴───────────┘
```

Today's "To Do / In Progress / Done" task tabs from Phase 1 stay — they're the Phase 1 task system, complementary. They render in a tab above the chat area.

### Canvas surfaces — refactored to use shared components

- `CanvasAIPanel.tsx` (currently 2816 LOC) — extract `<AssistantChat>`, `<AssistantInput>`, `<AssistantContextPanel>` into shared library; `CanvasAIPanel` becomes a thin shell that wires them together with canvas-specific context (connected nodes, canvas_id, multi-session sidebar).
- `AIAssistantNode.tsx` — wraps `CanvasAIPanel` for canvas-node placement; unchanged behavior.
- `FullscreenAIView.tsx` — uses the same shared components in a layout matching `/ai` page; today's behavior preserved.

### `src/hooks/useAssistantMode.ts` — new hook

```ts
export function useAssistantMode(): AssistantMode {
  const { clientId } = useParams();  // from React Router
  if (clientId) return { mode: 'client', clientId };
  return { mode: 'agency', clientId: null };
}
```

Drives the mode pill in headers and gates which tools the edge function exposes.

### `CompanionContext.tsx` — extended

Existing context exports `companionName`, `tasks`, `autonomyMode`, `setAutonomyMode`, etc. Additions:
- `activeClientId: string | null` — derived via `useAssistantMode`
- `mode: AssistantMode`
- `activeThreadId: string | null` — currently selected thread in drawer/page
- `setActiveThread(threadId): void`
- `createNewThread(): Promise<ThreadMeta>` — convenience for "+ New" button

---

## Mode → tool gating

| Tool                          | Agency mode | Client mode | On canvas |
| ----------------------------- | :---------: | :---------: | :-------: |
| `save_memory` (user)          |     ✓       |     ✓       |     ✓     |
| `save_memory` (client)        |     —       |     ✓       |     ✓     |
| `navigate_to_page`            |     ✓       |     ✓       |     ✓     |
| `list_all_clients`            |     ✓       |     ✓       |     ✓     |
| `get_client_info`             |     ✓       |     ✓       |     ✓     |
| `get_client_strategy`         |     —       |     ✓       |     ✓     |
| `get_scripts`                 |     —       |     ✓       |     ✓     |
| `create_script`               |     —       |     ✓       |     ✓     |
| `find_viral_videos`           |     ✓       |     ✓       |     ✓     |
| `schedule_content`            |     —       |     ✓       |     ✓     |
| `get_editing_queue` (cross)   |     ✓       |     —       |     —     |
| `get_editing_queue` (single)  |     —       |     ✓       |     ✓     |
| `submit_to_editing_queue`     |     —       |     ✓       |     ✓     |
| `get_content_calendar`        |     ✓       |     ✓       |     ✓     |
| `create_canvas_note`          |     —       |     ✓       |     ✓     |
| `add_video_to_canvas`         |     —       |     ✓       |     ✓     |
| `add_research_note`           |     —       |     ✓       |     ✓     |
| `add_idea_nodes`              |     —       |     ✓       |     ✓     |
| `add_script_draft`            |     —       |     ✓       |     ✓     |
| `fill_onboarding_fields`      |     ✓       |     ✓       |     —     |
| `generate_script_streaming`   |     —       |     —       |     ✓     |

In client mode, tools that take a `client_name` arg get auto-filled with the active client — assistant doesn't need to be told.

---

## Migration plan

Three deploy phases. Each is independently revertable.

### Phase A — Data foundation (no UI change)

1. Create `assistant_threads`, `assistant_messages`, `assistant_memories` tables + RLS + indexes.
2. **Backfill canvas chats:** read existing canvas chat sessions (whichever table currently stores them — see `2026-03-19-canvas-ai-chat-persistence-design.md` for the existing model), insert one `assistant_threads` row per session with `origin='canvas'` + the canvas_id; copy each message into `assistant_messages`.
3. **Backfill `companion_messages`:** group existing rows by user, create one `assistant_threads` row per logical conversation (or one per user as a single "legacy chat"), copy messages.
4. Build `_shared/assistant/` library — memory, threads, prompt, mode, tools.
5. Both edge functions start writing **dual-write** (old tables and new tables). Old codepaths still read from old tables. New tables are populated for all new traffic.

**Validation:** count rows, spot-check canvas chats reload correctly when read from new tables behind a feature flag.

### Phase B — Shared components + drawer + /ai refactor

1. Extract `<AssistantChat>`, `<AssistantThreadList>`, `<AssistantContextPanel>`, `<AssistantInput>` from `CanvasAIPanel.tsx` into `src/components/assistant/`.
2. Refactor `CanvasAIPanel.tsx` to use the shared components (regression-test canvas heavily — streaming, multi-session, script preview, format/language switching).
3. Build `CompanionDrawer.tsx` and update `CompanionBubble.tsx` to open it.
4. Refactor `CommandCenter.tsx` (`/ai`) to use shared three-panel layout.
5. Both surfaces now read threads/memory from new tables (read path migrated). Old `companion_messages` continues to receive dual-writes for safety.

**Validation:** end-to-end: start thread in drawer on Maria's scripts page → see it in `/ai` thread list → continue from `/ai` → see it in canvas SessionSidebar (filtered by canvas_id when applicable) → memory written by drawer appears in canvas response.

### Phase C — Cleanup

1. Switch edge functions to use `_shared/assistant/` for memory load + system-prompt assembly + thread persistence (no more dual-write; just write to new tables).
2. Drop `companion_messages` table.
3. Build Settings → "What `<companion>` remembers" memory editor page.
4. Remove dead code paths.

**Rollback strategy at any phase:**
- Phase A: drop the three new tables. Both surfaces continue working from their existing storage.
- Phase B: revert UI components (git history); keep new tables (no behavior change without UI consuming them).
- Phase C: revert edge function changes; restore `companion_messages` from backup.

---

## Error handling

- **Edge function: failed memory load** — fall back to empty memory list, log warning, continue. Do not block conversation.
- **Edge function: failed thread persistence (write)** — return assistant response to user, log error, retry with exponential backoff in background. Surface a toast on the client only after 3 failed retries.
- **Drawer: orphaned thread (canvas was deleted)** — show "Canvas removed" indicator on the thread row, disable "Open in canvas" CTA, allow read-only viewing.
- **Mode detection: clientId in URL but client doesn't exist or user lacks access** — fall back to agency mode, surface a small notice in the drawer header.
- **Tool call: `create_canvas_note` etc. when no active canvas** — return tool error message to assistant; assistant tells user "open Maria's canvas first" (existing pattern in `companion-chat`).

---

## Testing

- **Unit (`_shared/assistant/`):** memory CRUD, thread CRUD, prompt assembly snapshot tests, mode detection from various URL patterns.
- **Edge function integration:** seed a user with memories + threads, hit each function, verify system prompt content, verify tool gating works in both modes.
- **Component (Vitest + Testing Library):** `<AssistantChat>` streaming + tool-result rendering, `<AssistantThreadList>` filtering by client and origin, `<AssistantContextPanel>` empty state vs nodes-loaded.
- **E2E (Playwright):**
  - Start thread in drawer → refresh page → thread persists.
  - Start thread in canvas → see it in drawer thread list with "Canvas #N" tag → click → navigate back to canvas with chat focused.
  - Save memory in drawer → ask the same fact in `/ai` page → assistant references memory.
  - Switch from `/dashboard` (agency mode) to `/clients/maria/scripts` (client mode) → mode pill flips → tool surface gates correctly.
- **Regression:** full canvas test suite (script generation, multi-session sidebar, format/language switching) — no behavior change expected.

---

## Open questions

- **Phase 1 task system in `/ai`** — the To Do / In Progress / Done tab system from Phase 1 — does it stay above the chat area on the refactored `/ai` page, or move elsewhere? *Default: stay above the chat area as a tab; user can dismiss to focus on chat.*
- **Drawer thread list view — show all threads or filtered to active client?** *Default: filtered to active client when in client mode; show recent across all clients (limited to 20) in agency mode, plus a "switch client" link.*
- **Memory write threshold** — should the assistant ask before saving a memory ("Want me to remember that?"), or save silently when confident? *Default: silent save with a small toast notification "Saved: …" the user can click to undo. Aligned with autonomy mode (Auto = silent, Ask = confirm, Plan = batch save with review).*
- **Backfill strategy for legacy `companion_messages`** — one thread per user (single legacy archive) or attempt to split into logical conversations by time gap? *Default: single archive thread per user labeled "Legacy chat (`<count>` messages, archived `<date>`)"; user can delete.*

---

## Dependencies on other work

- Phase 1 companion is shipped — this builds on it.
- Phase 2 vision items (Monday sweep, Robby's Drafts tab, Strategy tab) are independent. The Strategy tab being loaded into Robby's system prompt pairs naturally with the memory layer here — when implemented, the strategy data becomes another input to `prompt.ts` alongside memories.
- Existing canvas chat persistence (`2026-03-19-canvas-ai-chat-persistence-design.md`) is the source of truth for canvas chat sessions — Phase A migration reads from there.

---

## Status

Designed, awaiting user review. After approval, the next step is `superpowers:writing-plans` to break this into an implementation plan.
