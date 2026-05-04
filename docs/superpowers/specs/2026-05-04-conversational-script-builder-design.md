# Conversational Script Builder — Design

**Date:** 2026-05-04
**Status:** Draft, awaiting user review
**Owner:** Roberto Gauna

## Problem

The sidebar AI ("Robby") currently builds scripts via a single atomic tool call (`build_script_full_pipeline`). The user types *"build me a script"*, waits 30–60 seconds, and gets a finished result. This works but isn't collaborative: Robby doesn't pause to ask which idea to pursue, which framework to model, or whether the draft is on-target before saving. The result is take-it-or-leave-it.

The user wants Robby to feel like a co-pilot — narrating what he's reading, presenting choices at high-stakes forks, building visibly on the canvas as he goes, and keeping the work going even if the drawer is closed.

## Goals

- Multi-turn build flow that makes important decisions collaborative
- Smart asking: pauses only at high-stakes forks; auto-pilots through routine steps
- Background continuation: build keeps running regardless of drawer state, navigation, or refresh
- Resume on return: user can come back hours later and pick up exactly where they were
- Cross-client visibility: a badge tells the user "build still running on client X"
- Token-efficient: canvas context is read once and cached for the build session

## Non-goals (v1)

- Conversational version of batch builds (*"build 20 scripts about X"*) — Auto mode keeps the existing atomic batch
- Voice input / voice output
- Mobile-specific build chrome
- Side capability "create text node from chat" — defer; trivial to add later as a tool
- Replacing the canvas script-save flow — Robby triggers the existing flow on user approval

## Architecture

Three layers, with **durable server-side state** as the spine.

### Client (Robby drawer)
Renders chat messages and interactive elements (idea picker, video preview cards, Yes/No buttons, script preview, pause/cancel buttons). Subscribes to `companion_build_sessions` and `assistant_messages` via Supabase Realtime so progress shows up live regardless of which page the user is on.

### Edge function `companion-chat-v2`
Handles incoming user messages. Loads the active build session for the current thread, passes its FSM state into the LLM prompt, lets the LLM either:
- transition the FSM via a tool call (`advance_to_next_step`, `present_ideas`, `select_framework`, etc.)
- pivot via an escape-hatch tool (`pivot_idea`, `cancel_build`, `pause`, `set_autopilot`, `freeform_chat`)
- just chat freely (no FSM change)

Each transition writes the new state to `companion_build_sessions` and, if the new state is auto-advance, fires `process-build-step` to continue without waiting for the user.

In **Auto autonomy mode** the build session FSM is bypassed entirely — the existing `build_script_full_pipeline` atomic tool fires as before. The conversational flow only runs in **Ask** mode.

### Edge function `process-build-step`
Background worker. Reads the build session, executes the work for the current state, writes results back, then either pauses at a checkpoint or chains to itself for the next auto-advance step. This is what keeps things going while the drawer is closed.

Pattern per invocation:
1. `SELECT … FOR UPDATE SKIP LOCKED` on the build session row (prevents double-running)
2. Do the work for `current_state`
3. Persist results, advance `current_state`, update timestamps
4. If next state is auto-advance and session is not paused: re-invoke self via `supabase.functions.invoke`
5. If next state is a checkpoint OR session is paused: stop; UI sees `status='awaiting_user'`

For long-running ops (transcription), the state enqueues the job and exits. A short subsequent invocation polls every ~5s until done, then advances.

### Reused infrastructure
- `assistant_threads` / `assistant_messages` (added on `companion-merge-phase-a` branch) — chat history
- `canvas_states` — read for context, written to for adding nodes progressively
- `transcribe-canvas-media` edge function — invoked for `mode=both` transcription
- `find_viral_videos` (currently inside `companion-chat`) — extracted into a reusable function
- Existing canvas script-save flow — Robby triggers it on user approval

## FSM states

Three classifications:
- 🟢 **AUTO** — runs without pausing
- 🟡 **SOFT-ASK** — pauses by default; auto-advances if Robby is confident *or* `auto_pilot=true`
- 🔴 **HARD-ASK** — always pauses (even in auto-pilot)

| # | State | Type | What happens |
|---|---|---|---|
| 0 | `INIT` | 🟡 | Confirm client. Skipped if URL has clientId. |
| 1 | `RESOLVE_CHAT` | 🟡 | Confirm which canvas chat (`canvas_states` row). Skipped if client has only one row. |
| 2 | `AWAITING_IDEA` | 🟡 | Ask "What idea?" or "Want me to suggest 5?" |
| 3 | `READING_CONTEXT` | 🟢 | Read text nodes, voice-note transcripts, PDFs from active canvas. **Skip video frameworks** (token saving). Cache result on session row. |
| 4 | `IDEAS_GENERATED` | 🟡 | Show 5 ideas, ask which (or "Find frameworks for all"). Auto-pilot picks #1. |
| 5 | `FINDING_FRAMEWORKS` | 🟢 | Search `viral_videos` table by keywords from chosen idea(s). |
| 6 | `FRAMEWORKS_PRESENTED` | 🟡 | Show videos with thumbnail + caption. Ask Yes/No/replace. If user pastes their own URLs, save to `viral_videos` first. Auto-pilot accepts top result. |
| 7 | `ADDING_VIDEOS` | 🟢 | Add each chosen video to active canvas as a `videoNode`, one by one. Visible to user on canvas. |
| 8 | `TRANSCRIBING` | 🟢 | Trigger `transcribe-canvas-media` with `mode=both` (audio + visual). Poll until done. |
| 9 | `DRAFTING_SCRIPT` | 🟢 | Generate script draft using: framework transcript + visual breakdown + cached canvas context + client strategy. Same structural beats as the framework, slightly modified wording for the new idea. |
| 10 | `DRAFT_PRESENTED` | 🔴 | Show the draft. Always wait for user. Buttons: **Generate Script**, **Edit**, **Try different angle**. |
| 11 | `GENERATING_SCRIPT` | 🟢 | On *Generate* → call existing canvas script-save flow. |
| 12 | `SCRIPT_SAVED` | 🟢 | Confirm to user. |
| 13 | `LOOPING_NEXT` | 🟡 | If more ideas pending, "Move to idea #2?" Auto-pilot continues automatically. |
| 14 | `DONE` | — | All ideas processed; build session marked `completed`. |

### Escape hatches (LLM detects + calls in any state)
- `pivot_idea` — user wants different idea, jump back to state 4 or 2
- `cancel_build` — user said "stop", set `status='cancelled'`
- `pause` — user said "wait, hold on", set `status='paused'`
- `set_autopilot(true)` — user said "you do it", flip `session.auto_pilot`
- `freeform_chat` — tangential question, answer without changing FSM state

### Smart-asking semantics
- 🟡 states present options *and* a recommended choice. If LLM is highly confident the recommendation is right, it auto-advances and announces (*"Using @gabe.ramirez's video — strongest match at 5.2x outlier."*).
- When `auto_pilot=true`: 🟡 states all become 🟢. 🔴 still pauses.
- 🔴 (`DRAFT_PRESENTED`) always pauses — final approval gate. No way to skip.

## Data model

### New table: `companion_build_sessions`

```sql
create table companion_build_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id),
  client_id       uuid not null references clients(id),
  thread_id       uuid not null references assistant_threads(id),
  canvas_state_id uuid references canvas_states(id),

  status          text not null default 'running'
                  check (status in ('running','awaiting_user','paused','completed','cancelled','error')),
  current_state   text not null default 'INIT',

  -- Idea queue
  ideas               jsonb default '[]'::jsonb,
  current_idea_index  int default 0,
  selected_ideas      jsonb default '[]'::jsonb,

  -- Per-idea working data
  current_framework_video_id uuid,
  current_script_draft       text,
  current_script_id          uuid,

  -- Token-saving cache
  cached_canvas_context     text,
  cached_canvas_context_at  timestamptz,

  -- Behavior flags
  auto_pilot      boolean not null default false,
  error_message   text,

  -- Telemetry
  token_usage     jsonb default '{}'::jsonb,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);

create index idx_build_sessions_user_active
  on companion_build_sessions(user_id, status)
  where status in ('running','awaiting_user','paused');
create index idx_build_sessions_thread on companion_build_sessions(thread_id);
create index idx_build_sessions_client on companion_build_sessions(client_id);

alter publication supabase_realtime add table companion_build_sessions;

alter table companion_build_sessions enable row level security;
create policy "users see their own sessions"
  on companion_build_sessions for select using (auth.uid() = user_id);
create policy "users update their own sessions"
  on companion_build_sessions for update using (auth.uid() = user_id);
create policy "users insert their own sessions"
  on companion_build_sessions for insert with check (auth.uid() = user_id);
```

### Touched: `assistant_messages` (already exists on `companion-merge-phase-a`)

```sql
alter table assistant_messages add column ui_elements jsonb default null;
```

`ui_elements` shapes:
```jsonc
// Idea picker
{ "kind": "idea_picker", "ideas": [{ "title": "...", "keywords": ["..."] }, ...] }

// Video preview cards
{ "kind": "video_preview_cards", "videos": [{ "id": "uuid", "thumbnail_url": "...", "caption": "...", "outlier_score": 5.2, "username": "@gabe" }] }

// Yes/No
{ "kind": "yes_no", "yes_label": "Find frameworks", "no_label": "I'll drop my own" }

// Script preview
{ "kind": "script_preview", "draft": "...", "actions": ["generate","edit","retry"] }

// Confirm chat selection
{ "kind": "chat_picker", "default": "Gabriel Ramirez", "options": ["Gabriel Ramirez","Old session"] }
```

### Touched: `companion_state` (existing)

Persistent auto-pilot default lives in `workflow_context.__autopilot_default` (boolean). No migration; just a new key.

### Cross-client badge query

```sql
select client_id, status, current_state
from companion_build_sessions
where user_id = $1
  and status in ('running','awaiting_user','paused');
```

Drawer subscribes via Realtime to keep this list fresh.

## Streaming + UI updates

Two Realtime channels feed the drawer:

1. **`assistant_messages`** — every chat bubble. Progress narration ("Reading voice notes…", "Found 3 frameworks") is written as ordinary messages with `role='assistant'`.
2. **`companion_build_sessions`** — every FSM state change. Drives the build banner, current-step indicator, pause/cancel buttons, and "running on another client" badge.

The drawer never polls; everything is push.

## Interactive chat elements

Rendered from `assistant_messages.ui_elements`:

| `kind` | Renders as |
|---|---|
| `idea_picker` | Numbered list, each row clickable → sends `"Build #N"` |
| `video_preview_cards` | Thumbnail + caption + outlier badge per card. Buttons: **Use these** / **Find different ones** / **I'll paste my own** |
| `yes_no` | Two buttons. Click sends labeled response. |
| `script_preview` | Read-only script box with **Generate Script** / **Edit** / **Try different angle** |
| `chat_picker` | "Is it *Gabriel Ramirez* I'm reading?" — Yes + dropdown of alternatives |

Click handlers post a natural-language message back to `companion-chat-v2` (e.g. *"Use these frameworks"*) so the LLM observes intent semantically.

## Build banner + cross-client UX

Top of drawer, visible while `status` ∈ {`running`, `awaiting_user`, `paused`}:

```
[🔧 Building script — step 6/14: framework search]   [Pause]  [Cancel]
```

Replaced by `[⏸ Build paused — Resume]` when status is `paused`.

Robby's sidebar bubble shows a small badge dot if any session is in flight on a *different* client than the one currently in view. Clicking opens the drawer with a "Resume on Boby?" toast and a switcher.

## Auto-pilot UX

- **Persistent default** — small toggle in drawer header reads/writes `companion_state.workflow_context.__autopilot_default`. Off by default.
- **Per-session override** — during a build, user typing "you do it" or "stop asking" → LLM calls `set_autopilot(true)` → flips `session.auto_pilot`. Resets per new build.
- 🟡 states auto-advance when `session.auto_pilot=true`.
- 🔴 (`DRAFT_PRESENTED`) ignores auto-pilot — final approval is non-skippable.

## Auto-navigation

If user invokes the build flow from a non-canvas page, `companion-chat-v2` returns a `navigate` action to `/clients/{id}/scripts?view=canvas` (existing pattern in `actions[]`). Drawer stays open across navigation. The FSM enters `INIT` and proceeds normally.

If client has no canvas at all, existing logic at `SuperPlanningCanvas.tsx:899` creates a fresh active canvas — the FSM picks it up on `RESOLVE_CHAT`.

## Phasing

1. **Phase 1 — Foundations:** schema migration, build session loading/saving, FSM skeleton, drawer Realtime subscription. Hello-world test: dummy state machine that transitions through fake states.
2. **Phase 2 — Happy path:** wire real LLM tool calls for ideas → frameworks → draft → save. No interactive UI yet (plain text). Verify a single end-to-end build works.
3. **Phase 3 — Interactive elements:** UI components for idea picker, video cards, script preview, button bars.
4. **Phase 4 — Smart asking + auto-pilot:** classify states 🟢/🟡/🔴, auto-pilot toggle + override, escape hatches.
5. **Phase 5 — Background continuation + cross-client visibility:** worker chaining, build banner, "still running on Boby" badge, resume on app load.
6. **Phase 6 — Polish:** error handling, retry, token-cost telemetry, abandoned-session cleanup (cron purge of `cancelled` / `error` sessions older than 7 days).

## Testing

- **FSM transitions:** unit-tested with stubbed tool implementations. Each state has tests for happy path, escape hatch, and error.
- **Edge functions:** integration-tested via Supabase function invocation in CI. End-to-end test that runs a full build with mocked external APIs.
- **Drawer Realtime:** manual smoke (open two tabs, verify both update). Automated test that verifies subscription handlers fire on row update.
- **Token cost:** log per-state token usage to `companion_build_sessions.token_usage` jsonb. Assertion in CI: a single build under 100k tokens.

## Error handling

- Edge function failure → mark session `status='error'`, write reason to `error_message`, surface in drawer with **Retry** / **Cancel**.
- Long-running op timeout (transcription >5min) → mark step failed, offer retry.
- Lost row lock during `process-build-step` → no-op; another invocation has it.
- Network drop during interactive checkpoint → no impact; state persists in DB; user reload picks up where left off.

## Resolved decisions

- **Auto-pilot toggle visibility:** only in Ask mode. Auto mode already auto-pilots everything; toggle is hidden there.
- **Token usage:** tracked per build session (`companion_build_sessions.token_usage` jsonb). Per-conversation roll-up can be added later if needed without schema change.
- **New build while one is paused/running on same thread:** Robby surfaces the conflict explicitly before starting:
  > *"Heads up — you've got a build paused at step 6 (framework search) for idea 'How to talk to girls'. Starting a new one will abandon that progress. Resume the paused one, or start fresh?"*
  Two buttons: **Resume paused** / **Start fresh and abandon**. No silent replacement.
