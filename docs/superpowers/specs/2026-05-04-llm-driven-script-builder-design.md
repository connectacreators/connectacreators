# LLM-Driven Conversational Script Builder — Design Spec

**Date:** 2026-05-04
**Status:** Approved for implementation
**Replaces:** FSM-based process-build-step approach (Phase 1 + 2)

---

## Problem

The FSM-based builder (process-build-step) is too rigid for the conversational experience the product needs. Each state handler has narrow logic — it can't answer off-topic questions, can't adapt mid-flow, and auto-advances on any input regardless of what the user actually said. Every edge case requires a new explicit handler, causing bugs like "the AI ignored my question" and "the references have nothing to do with the idea."

---

## Goal

A conversational script-building experience that:
- Lives entirely in the companion drawer (or `/ai` page) — never navigates away
- Shows the AI working live, in real-time, as messages appear one by one in the chat
- Can be paused at any point, like Claude Code's stop button
- Handles off-topic questions naturally ("where did you get this?") and returns to the build
- Follows the exact workflow the user specified

---

## The Workflow (Source of Truth)

```
User: "build me a script"

If on /ai page (no URL client):
  AI: "Got it! What client are we working on?"
  User: "Roger" → AI resolves client

AI: "Got it! Tell me what idea is on your mind — or say 'give me 5 ideas'
     and I'll suggest some based on what I know about [CLIENT NAME]'s strategy."

If multiple active canvases exist:
  AI: "Just to clarify — is it the [CANVAS NAME] I should be looking at?"
  User: confirms

AI: "On it! Let me cook something..."
    [Reading Voice Note transcript...]     ← live narration message
    [Reading 3 text notes...]              ← live narration message
    [Reading strategy...]                  ← live narration message
    "Okay, here are 5 ideas that fit [CLIENT NAME]'s strategy:
     1. ...
     2. ...
     3. ...
     4. ...
     5. ...
     Would you like me to find viral frameworks for these?
     Or drop your own if you have them."

User: "Find them"

AI: "On it!"
    [Searching viral frameworks for idea 1...]  ← live
    [Searching viral frameworks for idea 2...]  ← live
    "Here are the videos I found for each idea:

     For idea 1:
     [thumbnail preview] @creator — 340x · caption...
     https://instagram.com/...

     For idea 2:
     [thumbnail preview] ...

     You like these? Or want different ones?
     It's ideal to find your own on Instagram for better performance:
     1. Search these keywords: "[keywords]"
     2. Look for videos with at least 5x the account's average views
     3. Paste the URLs here — I'll add them to the Viral Database"

User: "Yeah I like those" OR pastes own URLs

If user pastes URLs:
  AI adds each URL to viral_videos table
  Uses those as frameworks instead

AI: "Got it."
    [Adding video to your canvas...]        ← live
    [Transcribing...]                       ← live
    "Here's the script draft for idea 1:

     HOOK: ...
     BODY: ...
     CTA: ...

     Take a look — need me to change anything?"

    [GENERATE SCRIPT button]

User: clicks Generate OR asks for changes

AI shows script preview (same as Super Canvas AI assistant)
User saves or modifies (existing functionality)

AI: "Perfect! Now let's work on the next one."
→ loop repeats for each selected idea
```

---

## Architecture: LLM-as-Conductor

### How each message is handled

```
User message arrives at companion-chat
        ↓
Is there an active build session for this user+client?
        ↓ yes
Load build session row (checkpoints, cached context, ideas, etc.)
        ↓
Inject build context block into system prompt
Add 8 build tools to TOOLS array
        ↓
Claude processes message — answers questions, narrates, calls tools
        ↓
Each tool call:
  1. Inserts a progress message to assistant_messages (→ Realtime → drawer)
  2. Does its work
  3. Returns result to Claude
  4. Checks build_session.status before running (stops if paused)
        ↓
Claude's final response inserted to assistant_messages (→ Realtime → drawer)
```

### What changes

**Retired:**
- `supabase/functions/process-build-step/` — entire function deleted
- `supabase/functions/_shared/build-fsm/` — state machine deleted
- FSM state columns on `companion_build_sessions`

**Kept:**
- `companion_build_sessions` table (simplified — see Data Model)
- `supabase/functions/_shared/build-session/service.ts` — DB helpers kept
- BuildBanner component (updated labels)
- `useActiveBuildSessions` Realtime hook
- All existing scripts/script_lines save logic

**Changed:**
- `companion-chat/index.ts` — build context injection + 8 new tools
- `companion_build_sessions` schema — simplified columns

---

## Build Session Data Model

### Columns (simplified from current FSM schema)

| Column | Type | Purpose |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | Owner |
| `client_id` | uuid | Which client we're building for |
| `thread_id` | uuid | The conversation thread |
| `canvas_state_id` | uuid nullable | Active canvas for this build |
| `status` | text | `running` / `paused` / `completed` / `cancelled` |
| `phase` | text | Human-readable label for BuildBanner (e.g. "Reading canvas...") |
| `cached_canvas_context` | text | Text/voice/research read from canvas — cached to avoid re-reading |
| `cached_canvas_context_at` | timestamptz | When the cache was written |
| `ideas` | jsonb | Array of `{title, keywords[]}` — the 5 generated ideas |
| `selected_ideas` | jsonb | Which ideas the user chose to build |
| `current_idea_index` | int | Which idea in the loop we're on |
| `current_framework_video_id` | uuid nullable | Chosen viral reference for current idea |
| `current_script_draft` | text | Working draft text |
| `current_script_id` | uuid nullable | Saved script ID |
| `auto_pilot` | bool | Reserved for future auto mode |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | Auto-bumped |

### Removed FSM columns
`current_state`, `error_message`, `token_usage`, `last_activity_at`, `user_input` — all deleted in a migration.

---

## The 8 Build Tools

Added to companion-chat's TOOLS array. Each tool inserts a progress message to the thread before doing its work, so the user sees it live.

### 1. `resolve_client`
**When:** User is on `/ai` page (no URL client) and hasn't confirmed a client yet.
**Does:** Fuzzy-matches name to `clients` table (scoped to `user_id`). Updates `build_session.client_id`. Inserts progress message: *"Got it — switching focus to [CLIENT NAME]."*
**Input:** `{ client_name: string }`

### 2. `get_canvas_context`
**When:** LLM decides to read canvas for idea generation.
**Does:** Reads `canvas_states.nodes` for the session's `canvas_state_id`. Extracts text notes, research notes, voice/PDF transcripts. Skips video framework nodes (token saving). Caches in `cached_canvas_context`. Returns a summary of what was found.
**Narration messages inserted (one per node type found):**
- *"Reading Voice Note transcript..."*
- *"Reading [N] text notes..."*
- *"Reading research notes..."*
**Input:** `{ client_id: string }`

### 3. `generate_script_ideas`
**When:** User asks for 5 ideas or LLM judges it's time.
**Does:** Calls Claude with canvas context + client strategy + onboarding data. Returns 5 `{title, keywords[]}` objects. Saves to `build_session.ideas`.
**Narration:** *"Coming up with ideas based on what I'm seeing..."*
**Input:** `{ client_id: string, topic_hint?: string }`

### 4. `search_viral_frameworks`
**When:** User confirms they want AI to find frameworks.
**Does:** Queries `viral_videos` for up to 25 candidates matching idea keywords. Calls Claude to rank top 3 by relevance to the idea (not just outlier score). Returns `{id, video_url, thumbnail_url, channel_username, outlier_score, caption}[]`.
**Narration:** *"Searching viral frameworks for '[IDEA TITLE]'..."*
**If no matches:** Returns empty + suggests user paste own URLs.
**Input:** `{ idea_title: string, keywords: string[] }`

### 5. `add_url_to_viral_database`
**When:** User pastes their own reel URLs instead of using AI's picks.
**Does:** Inserts directly to `viral_videos` with the URL, channel username parsed from the URL, and a placeholder caption. Returns the new row ID for use as framework. (Full scrape enrichment happens asynchronously — the URL is usable immediately as a framework reference.)
**Narration:** *"Adding [URL] to the Viral Database..."*
**Input:** `{ url: string, client_id: string }`

### 6. `add_video_to_canvas`
**When:** After framework is confirmed.
**Does:** Appends a `videoNode` to `canvas_states.nodes` for the client's active canvas. Does NOT navigate. VideoNode auto-transcribes client-side when canvas is opened.
**Narration:** *"Adding video to [CLIENT NAME]'s canvas..."*
**Updates:** `build_session.current_framework_video_id`, `build_session.canvas_state_id`.
**Input:** `{ client_id: string, video_id: string }`

### 7. `draft_script`
**When:** Video confirmed, ready to write.
**Does:** Calls Claude with: idea title, framework caption, canvas context. Writes HOOK / BODY / CTA keeping the same framework structure but different value/words matched to the idea. Saves to `build_session.current_script_draft`.
**Narration:** *"Drafting your script..."*
**Input:** `{ client_id: string, idea_title: string, framework_caption: string }`

### 8. `save_script`
**When:** User approves the draft (clicks Generate or says "yes").
**Does:** Inserts to `scripts` + `script_lines`. Saves `build_session.current_script_id`. Does NOT navigate to scripts page.
**Narration:** *"Saving script to [CLIENT NAME]'s library..."*
**Input:** `{ client_id: string, title: string, hook: string, body: string, cta: string }`

---

## Pause / Interrupt

### Pause button (BuildBanner)
- Sets `build_session.status = 'paused'` in DB
- Every tool checks status before running:
  ```typescript
  const fresh = await getBuildSession(admin, session.id);
  if (fresh.status === 'paused') {
    await logProgress(thread_id, "Paused — reply whenever you're ready to continue.");
    return { paused: true };
  }
  ```
- LLM receives the paused signal, wraps up gracefully

### Resume
- User sends any message
- companion-chat detects `status = 'paused'` → sets `status = 'running'`
- LLM reads current checkpoints and picks up from last completed step

### Interrupt by message
- User sends message while LLM is mid-turn (best-effort — the in-flight LLM call will complete naturally before the new message is processed)
- The new companion-chat turn runs with `status = 'paused'` set by the in-flight turn's final tool
- New turn reads current checkpoints, answers the user's message, and offers to resume
- No data is lost — checkpoints preserve exactly where the build was

---

## Build Context Injection (System Prompt)

When a build session is active, companion-chat appends this block to the system prompt:

```
━━━ ACTIVE SCRIPT BUILD ━━━
Client: [CLIENT NAME]
Canvas: [CANVAS NAME or "none"]

What's been done:
- Canvas context: [cached / not read yet]
- Ideas generated: [list titles or "not yet"]
- Ideas selected: [list titles or "not yet"]
- Current idea: [index + title or "none"]
- Framework chosen: [@username — Nx · caption excerpt or "not yet"]
- Script draft: [exists / not yet]
- Script saved: [yes, ID: xxx / no]

Status: [running / paused]
━━━━━━━━━━━━━━━━━━━━━━━━━

You are building a script conversationally. Rules:
- Answer ANY question the user asks. After answering, return to the build.
- Use build tools to advance each step. Don't skip steps.
- Narrate what you're doing: "Reading your voice note...", "Searching frameworks..."
- Tools insert their own progress messages before running. Do NOT duplicate them with your own narration — just respond to the tool result naturally.
- Never call navigate_to_page during a build. Everything stays in this drawer.
- When presenting ideas or frameworks, use numbered lists.
- When presenting the script draft, show it clearly with HOOK / BODY / CTA labels.
- After the draft, tell the user "Ready to generate?" and wait.
- After saving, say "Perfect! Now let's work on the next one." if more ideas remain.
- If user pastes URLs, call add_url_to_viral_database for each one.
- Canvas reads are cached — never re-read canvas in the same session unless user asks.
```

---

## Progress Messages (Live Narration)

Tool handlers insert messages to `assistant_messages` with a special `role` or metadata so the frontend can style them differently:

```typescript
await supabase.from("assistant_messages").insert({
  thread_id,
  role: "assistant",
  content: { type: "text", text: "Reading Voice Note transcript...", is_progress: true }
});
```

`is_progress: true` → frontend renders these as muted, smaller text with a subtle activity indicator (different from full LLM responses).

---

## Frontend Changes

### BuildBanner
- Remove FSM state label map (15 states → gone)
- Display `build_session.phase` column directly (set by tools as they run)
- Pause / Cancel buttons unchanged

### AssistantChat message rendering
- Detect `content.is_progress === true` in message content
- Render with: `text-muted-foreground text-xs italic` + small spinner icon
- Normal LLM messages render unchanged

### No new pages
- No navigation during build
- Video nodes appear on canvas silently — user can open canvas separately to see them
- Script preview uses existing Super Canvas AI assistant preview (already built)

---

## What This Fixes

| Problem | Fix |
|---|---|
| "It ignored my question" | LLM naturally answers any question, returns to build |
| "References have nothing to do with the idea" | Claude ranks by relevance, not outlier score |
| "It auto-picked idea #1" | IDEAS_GENERATED selection parsing in LLM turn, not hardcoded |
| "It navigated away" | `navigate_to_page` forbidden during build |
| "The process is robotic" | LLM narrates naturally in its own words |
| "Can't interrupt" | Pause button + mid-message interrupt both work |

---

## Implementation Order

1. **Migration** — simplify `companion_build_sessions` (remove FSM columns, add `phase`)
2. **Build tools** — add 8 tools to companion-chat TOOLS array + handlers
3. **Build context injection** — inject state block into system prompt when session active
4. **Retire process-build-step** — delete function + FSM shared modules
5. **Frontend** — progress message styling + BuildBanner phase display
6. **Testing** — full end-to-end flow: /ai page + client drawer, pause/resume, off-topic questions, user-pasted URLs

---

## Out of Scope (Later)

- Real video transcription (currently the VideoNode auto-transcribes client-side)
- Visual script preview / Generate Script button UI (existing functionality covers this)
- Auto-pilot mode (no pause, AI decides everything) — `auto_pilot` column reserved
- Cross-client build visibility badge
