# AI Full Parity Design — /ai · Drawer · Canvas

**Date:** 2026-05-05  
**Status:** Approved  
**Scope:** Close every AI capability gap across all three surfaces (Drawer, /ai, Canvas AI) so the companion can do anything in the app automatically.

---

## Background

The app has three AI surfaces that all share one backend (`companion-chat` edge function):

| Surface | Entry point | Route |
|---|---|---|
| Companion Drawer | `CompanionDrawer.tsx` | Any page |
| /ai Command Center | `CommandCenter.tsx` | `/ai` |
| Canvas AI Panel | `CanvasAIPanel.tsx` | `/clients/:id/scripts?view=canvas` |

After a full audit, the system has **22 existing tools** but **44+ missing actions** across 9 domains that have zero AI coverage. This spec defines 4 sequential waves to close every gap, ending at **54 total tools**.

---

## Known Bug (fix in Wave 1)

**New chat always opens the last thread.**

Root cause: `companion-chat/index.ts` lines 474–483 always search for a thread titled `"Active companion chat"` for the current client and reuse it. The frontend's `setActiveThreadId(null)` correctly clears local state, but no `thread_id` is passed to the edge function, so it always finds and returns the old sentinel thread.

Fix: pass `thread_id: activeThreadId ?? null` from the frontend. Edge function creates a new thread when null.

---

## Architecture

No new surfaces or routing changes. All changes are:

1. **Backend** — add tools to `companion-chat/index.ts` TOOLS array + handler
2. **Response shape** — add 3 new action types to the `actions[]` array
3. **Frontend action handler** — handle new action types in Drawer + CommandCenter
4. **Shared utility** — extract canvas reader for reuse

### Response shape (existing + new)

```ts
{
  reply: string,
  thread_id: string,
  actions: Array<
    | { type: "navigate", path: string }             // existing
    | { type: "fill_onboarding", fields: object }    // existing
    | { type: "refresh_data", scope: RefreshScope }  // NEW
    | { type: "show_notification", message: string } // NEW
    | { type: "open_client", client_id: string }     // NEW
  >
}

type RefreshScope = "leads" | "editing_queue" | "calendar" | "scripts" | "finances" | "contracts" | "all"
```

### Frontend action handler additions

Both `CompanionDrawer.tsx` and `CommandCenter.tsx` handle `data?.actions`. Add:

```ts
if (action.type === "refresh_data") {
  window.dispatchEvent(new CustomEvent("ai:data-changed", { detail: { scope: action.scope } }))
}
if (action.type === "show_notification") {
  // dispatch to existing toast system
}
if (action.type === "open_client") {
  navigate(`/clients/${action.client_id}`)
  setIsOpen?.(false)
}
```

Each data page that the AI can write to adds:
```ts
useEffect(() => {
  const handler = (e: CustomEvent) => {
    if (e.detail.scope === "leads" || e.detail.scope === "all") refetch()
  }
  window.addEventListener("ai:data-changed", handler as EventListener)
  return () => window.removeEventListener("ai:data-changed", handler as EventListener)
}, [refetch])
```

Pages that need the listener: `LeadTracker`, `EditingQueue`, `ContentCalendar`, `Scripts`, `Finances`, `ContractsPage`.

---

## Wave 1 — Infrastructure (4 changes)

### 1.1 New-chat thread bug fix

**Files:** `companion-chat/index.ts`, `CompanionDrawer.tsx`, `CommandCenter.tsx`

Frontend adds `thread_id: activeThreadId ?? null` to the `companion-chat` invocation body.

Edge function request body gains optional `thread_id?: string | null`.

Replace sentinel lookup:
```ts
// OLD — always reuses "Active companion chat"
const { data: _sentinelThread } = await adminClient
  .from("assistant_threads")
  .select("id")
  .eq("user_id", user.id)
  .eq("client_id", client.id)
  .eq("origin", "drawer")
  .eq("title", sentinel)
  .maybeSingle()
let resolvedThreadId = _sentinelThread?.id ?? null

// NEW
let resolvedThreadId: string | null = thread_id ?? null
if (!resolvedThreadId) {
  // Create a fresh thread titled from the first 6 words of the message
  const titleWords = message.trim().split(/\s+/).slice(0, 6).join(" ")
  const title = titleWords.length > 3 ? titleWords + "…" : "New chat"
  const { data: newThread } = await adminClient
    .from("assistant_threads")
    .insert({ user_id: user.id, client_id: client.id, origin: "drawer", title })
    .select("id").single()
  resolvedThreadId = newThread?.id ?? null
}
```

Also update `dualWriteCompanionTurn` to accept and use `threadId` directly instead of sentinel lookup.

### 1.2 Dynamic navigation

**Files:** `companion-chat/index.ts`

Update `navigate_to_page` tool description to list all valid routes:
```
/dashboard, /scripts, /vault, /viral-today, /editing-queue, /content-calendar,
/subscription, /ai, /onboarding, /finances, /leads, /contracts,
/clients/:clientId, /clients/:clientId/scripts, /clients/:clientId/scripts?view=canvas
```

Add new `open_client` tool:
```ts
{
  name: "open_client",
  description: "Navigate to a specific client's page. Use when the user wants to go to a client after creating or looking one up.",
  input_schema: {
    type: "object",
    properties: {
      client_name: { type: "string", description: "The client's name to look up and navigate to" }
    },
    required: ["client_name"]
  }
}
```

Handler: resolves `client_name → client_id`, pushes `{ type: "open_client", client_id }` to actions.

### 1.3 refresh_data action

**Files:** `companion-chat/index.ts`, `CompanionDrawer.tsx`, `CommandCenter.tsx`, data pages

Edge function tool handlers for every write operation append a `refresh_data` action to the `actions[]` array with the appropriate scope.

Frontend dispatches `"ai:data-changed"` custom event. Pages listen and re-fetch.

No page reload. No visible flash. AI writes → page silently updates.

### 1.4 Canvas read parity

**Files:** `companion-chat/build-tool-handlers.ts`, `companion-chat/index.ts`

Extract from `handleGetCanvasContext` into a shared async helper:
```ts
// companion-chat/canvasReader.ts
export async function readCanvasContext(adminClient, clientId: string): Promise<string>
```

Add `read_canvas` to the regular TOOLS array:
```ts
{
  name: "read_canvas",
  description: "Read the content of the active Super Canvas for a client. Returns all text notes, research notes, and voice/PDF transcriptions. Call this when the user asks about their canvas or before making content decisions to see what research and context already exists.",
  input_schema: {
    type: "object",
    properties: {
      client_name: { type: "string" }
    },
    required: ["client_name"]
  }
}
```

---

## Wave 2 — Core Business Tools (16 tools)

All tools added to the TOOLS array in `companion-chat/index.ts` with handlers in the same file.

### 2.1 Leads (table: `leads`)

| Tool | Required params | Optional | DB op |
|---|---|---|---|
| `get_leads` | `client_name` | `status`, `limit` | READ |
| `get_pipeline_summary` | `client_name` | — | READ |
| `update_lead_status` | `client_name`, `lead_name`, `new_status` | — | WRITE |
| `add_lead_notes` | `client_name`, `lead_name`, `notes` | — | WRITE |
| `create_lead` | `client_name`, `name` | `phone`, `email`, `source`, `notes` | WRITE |

**`get_leads`** status values: `"new" | "contacted" | "interested" | "booked" | "stopped"`. Returns: name, status, notes, booked, last_contacted_at, created_at.

**`get_pipeline_summary`** returns COUNT per status group — the instant pipeline view.

**`update_lead_status`** finds lead by `ilike(name, '%value%')` scoped to the client. Also checks for a client workflow trigger (same logic as `update-lead-status` edge function).

**`add_lead_notes`** appends to existing notes with a timestamp separator rather than overwriting.

**`create_lead`** mirrors `leadService.createLead` — if `email` is provided, invokes `send-followup` via `fetch(SUPABASE_URL/functions/v1/send-followup, { body: { lead_id } })` using the service role key (since companion-chat has no user bearer token available at this point). Returns `refresh_data: leads` action.

### 2.2 Finances (table: `finance_transactions`)

Note: RLS is admin-only, but the edge function uses the service role key which bypasses RLS.

| Tool | Required | Optional | DB op |
|---|---|---|---|
| `get_finances` | — | `month`, `year` | READ |
| `log_transaction` | `raw` | `date` | WRITE |
| `get_revenue_vs_goal` | — | — | READ |

**`get_finances`** defaults to current month. Groups by type (income/expense) and category. Returns: total_income, total_expenses, net, breakdown per category.

**`log_transaction`** accepts natural language `raw` string (e.g. `"Client X paid $2k for SMMA"`). Uses Claude Haiku inline to extract: amount, type (income/expense), category (from fixed lists), date. Inserts to `finance_transactions`. Returns `refresh_data: finances` action.

Income categories: `"SMMA" | "Bi-Weekly Fee" | "One-Time Project" | "Other Income"`  
Expense categories: `"Subscriptions" | "Ad Spend" | "Travel" | "Food & Meals" | "Contractors" | "Software" | "Payroll" | "Other"`

**`get_revenue_vs_goal`** reads `finance_transactions` for the current month + all clients' `monthly_revenue_goal` from `client_strategies`. Returns per-client and agency total actual vs goal.

### 2.3 Script lifecycle (table: `scripts`)

| Tool | Required | Optional | DB op |
|---|---|---|---|
| `update_script_status` | `client_name`, `script_title`, `status` | — | WRITE |
| `mark_script_recorded` | `client_name`, `script_title` | — | WRITE |
| `delete_script` | `client_name`, `script_title` | — | DELETE |

**`update_script_status`** status values: `"Idea" | "Recorded" | "In Review" | "Approved" | "complete"`. Finds by `ilike(title)`.

**`mark_script_recorded`** sets `grabado = true`, `status = "Recorded"` — shorthand for the most common post-filming action.

**`delete_script`** hard-deletes by title match. In ASK/PLAN mode: always confirm before deleting. Returns `refresh_data: scripts`.

### 2.4 Editing queue lifecycle (table: `video_edits`)

| Tool | Required | Optional | DB op |
|---|---|---|---|
| `update_editing_status` | `client_name`, `item_title`, `status` | — | WRITE |
| `assign_editor` | `client_name`, `item_title`, `editor_name` | — | WRITE |
| `add_revision_notes` | `client_name`, `item_title`, `notes` | — | WRITE |
| `mark_post_published` | `client_name`, `item_title` | — | WRITE |

**`update_editing_status`** status values: `"Not started" | "In progress" | "In review" | "Done"`.

**`add_revision_notes`** appends to `video_edits.revisions` (preserves existing).

**`mark_post_published`** sets `post_status = "Published"`. Covers both editing queue and calendar (same table).

All write tools return `refresh_data: editing_queue`.

### 2.5 Content calendar

| Tool | Required | Optional | DB op |
|---|---|---|---|
| `reschedule_post` | `client_name`, `title`, `new_date` | — | WRITE |
| `generate_caption` | `client_name`, `hook` | `platform`, `cta_keyword` | CLAUDE |

**`reschedule_post`** `new_date` = YYYY-MM-DD. Returns `refresh_data: calendar`.

**`generate_caption`** platform: `"instagram" | "tiktok"` (default instagram). Calls Claude Haiku inline using client brand voice from `onboarding_data`. Returns caption text — **never auto-saves**, always presents text for user to copy/approve.

---

## Wave 3 — Intelligence Layer (7 tools)

### 3.1 Multi-client intelligence

| Tool | Required | Optional | DB op |
|---|---|---|---|
| `get_all_clients_status` | — | — | READ |
| `get_weekly_priorities` | — | — | READ |

**`get_all_clients_status`** single SQL query: for each of the user's clients, return `scripts_this_month` vs target, `videos_edited_this_month` vs target, `posts_scheduled_this_month` vs target, `last_script_created_at`. Sorted: most behind first. Answers "which clients are stalled?" in one call.

**`get_weekly_priorities`** builds a ranked action list from real data:
1. Clients with 0 scripts this month (most urgent)
2. Scripts awaiting recording (grabado = false, status = Approved)
3. Editing items in "In review" status
4. Posts due this week not yet marked published

No new tables. Built entirely from existing data.

### 3.2 Contracts (table: `contracts`)

| Tool | Required | Optional | DB op |
|---|---|---|---|
| `get_contracts` | — | `client_name` | READ |
| `send_contract` | `client_name`, `contract_id` | — | EDGE FN |

**`get_contracts`** returns: title, status, sent_at, signed_at, client name. If `client_name` omitted, returns all contracts.

**`send_contract`** invokes the existing `send-contract` edge function on behalf of the user. Requires contract to already exist in the DB. Expected 2-step flow: user calls `get_contracts` first to see available contracts + IDs, then `send_contract` with the chosen `contract_id`. In ASK/PLAN mode: always confirms before sending. Returns `refresh_data: contracts`.

### 3.3 Client and memory management

| Tool | Required | Optional | DB op |
|---|---|---|---|
| `create_client` | `name` | `email`, `industry`, `package` | WRITE |
| `delete_memory` | `key` | — | WRITE |
| `list_memories` | — | — | READ |

**`create_client`** inserts into `clients` with `user_id`. Returns new `client_id`. Pushes `open_client` action so user lands directly on new client's page.

**`delete_memory`** removes one key from `companion_state.workflow_context` JSONB. Completes the read/write/delete triad — "forget that X" now works.

**`list_memories`** returns all keys + values from `companion_state.workflow_context` for the current client context.

---

## Wave 4 — Research + Analysis (5 tools)

### 4.1 Audience analysis

| Tool | Required | Optional | Calls |
|---|---|---|---|
| `run_audience_analysis` | `client_name` | — | `analyze-audience-alignment` |
| `get_instagram_top_posts` | `client_name` | `limit` | `fetch-instagram-top-posts` |

**`run_audience_analysis`** invokes `analyze-audience-alignment` with the client's Instagram handle from `onboarding_data`. Stores result in `client_strategies.audience_analysis`. Returns scores: `audience_score/10`, `content_uniqueness_score/10`, summary. Costs credits — note in response.

**`get_instagram_top_posts`** invokes `fetch-instagram-top-posts`. Returns top posts ranked by engagement. Informs hook strategy.

### 4.2 Research and viral scraping

| Tool | Required | Optional | Calls |
|---|---|---|---|
| `deep_research` | `topic` | `context` | `deep-research` |
| `scrape_viral_channel` | `username` | `platform` | `scrape-channel` |
| `list_vault_files` | `client_name` | — | READ |

**`deep_research`** invokes `deep-research` edge function. `context` = extra framing ("for a chiropractor"). Returns structured findings with sources. If an active canvas exists for the current client, also adds a research note node. Costs credits.

**`scrape_viral_channel`** platform: `"instagram" | "tiktok"` (default instagram). Invokes `scrape-channel`. Adds new videos to `viral_videos`. Returns count added + top video previews.

**`list_vault_files`** queries `canvas_media` for client's uploaded files. Returns: file name, type (video/audio/pdf/image), size, transcription status. Lets AI know what footage exists before building editing queue items.

---

## Implementation order

Wave 1 ships first. Each wave is independently deployable.

| Wave | Touches | Est. effort |
|---|---|---|
| Wave 1 | `companion-chat/index.ts`, `CompanionDrawer.tsx`, `CommandCenter.tsx`, new `canvasReader.ts` | 1 day |
| Wave 2 | `companion-chat/index.ts` only (16 new tool definitions + handlers) | 2 days |
| Wave 3 | `companion-chat/index.ts` only (7 new tools) | 1 day |
| Wave 4 | `companion-chat/index.ts` only (5 new tools, each invokes existing edge fn) | 1 day |

**Total: ~5 days of implementation.** All backend work is additive — no existing tools removed or changed. Frontend changes are limited to Wave 1 (Drawer, CommandCenter, and 6 data pages adding the `ai:data-changed` listener).

---

## What gets excluded (by design)

- **Follow-Up Automation** — page under construction, excluded from scope
- **Notion sync** — not needed
- **highlight_element / open_modal frontend actions** — deferred; adds complexity without strong need given refresh_data covers the core gap
- **Batch script generation** — the build mode already handles multi-step script creation; batch is a separate product decision

---

## System prompt update

After all waves, update the `YOUR RULES` section rule 19 in the companion-chat system prompt to list all new tools. Specifically add:

- `get_leads`, `get_pipeline_summary`, `update_lead_status`, `add_lead_notes`, `create_lead`
- `get_finances`, `log_transaction`, `get_revenue_vs_goal`
- `update_script_status`, `mark_script_recorded`, `delete_script`
- `update_editing_status`, `assign_editor`, `add_revision_notes`, `mark_post_published`
- `reschedule_post`, `generate_caption`
- `get_all_clients_status`, `get_weekly_priorities`
- `get_contracts`, `send_contract`
- `create_client`, `delete_memory`, `list_memories`
- `open_client`, `read_canvas`
- `run_audience_analysis`, `get_instagram_top_posts`, `deep_research`, `scrape_viral_channel`, `list_vault_files`
