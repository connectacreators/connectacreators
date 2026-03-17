# Notion Removal — Local Workflow Spec

## Overview

Remove all Notion API dependencies from the ConnectaCreators app. Replace them with a local-only workflow backed entirely by Supabase. Three independent sub-projects ship sequentially, each building on the last.

**Goal:** Every script, editing status, and post approval lives in the DB. No Notion API calls remain in any user-facing flow.

---

## Sub-project 1 — Script → video_edits Pipeline

### Problem

When a script is saved, `useScripts.ts` calls `syncToNotion()` to push the script to a Notion database. This is unreliable, only works for clients with a Notion database configured, and creates duplicate records when Notion and the local DB both have entries.

### Solution

Remove all Notion-facing calls from `useScripts.ts`. The `video_edits` auto-create block in `directSave` remains unchanged.

### What changes

**`src/hooks/useScripts.ts`**

- Remove the `syncToNotion` helper function (lines ~39–65)
- Remove `syncToNotion()` call at ~line 269 (inside `directSave`, fires for both new and existing script saves — there is one call site that covers both branches)
- Remove `syncToNotion()` call at ~line 356 (inside `categorizeAndSave`)
- Remove `syncToNotion()` call at ~line 497 (inside `updateScript`)
- Remove `syncToNotion()` call at ~line 524 (inside `updateGoogleDriveLink`)
- Remove `bulkSyncToNotion` function (lines ~671–705) and remove it from the hook's return value

**`categorizeAndSave` note:** This function is destructured in `Scripts.tsx` but never called from the UI — it is dead code. Remove the `syncToNotion` call from it; do not add a `video_edits` insert.

**`caption` field note:** `caption` is not a parameter in `directSave()` and is not available from `AIScriptWizard` at script-save time. The `video_edits` row is created with `caption: null`. Editors set it later via inline edit in the queue. No change needed to the insert block.

**`src/pages/Scripts.tsx`**

- Remove `bulkSyncToNotion` from the `useScripts` destructure (~line 297)
- Remove the "Sync to Notion" button (~line 1391) that calls `bulkSyncToNotion`

**`supabase/functions/sync-notion-script/index.ts`** — no changes, left unused

**`supabase/functions/bulk-sync-notion-scripts/index.ts`** — no changes, left unused

### DB migration required

`caption` is referenced in `video_edits` queries (e.g., `EditingQueue.tsx` line 143) but is absent from `supabase/migrations/20260312_video_edits_columns.sql`. It exists in production but not in migration history. Add:

```sql
-- supabase/migrations/20260316_video_edits_caption.sql
ALTER TABLE video_edits ADD COLUMN IF NOT EXISTS caption TEXT;
```

---

## Sub-project 2 — Editing Queue (Local Only)

### Problem

`EditingQueue.tsx`, `MasterEditingQueue.tsx`, and `PublicEditingQueue.tsx` all call `fetch-editing-queue`, which queries Notion and merges results with `video_edits`. This causes duplicates, orphan-creation logic, and dependency on Notion API availability.

### Solution

All three queue pages read `video_edits` directly. The `update-editing-status` edge function is rewritten with a clean, Supabase-only contract.

### What changes

**`src/pages/EditingQueue.tsx`**

`EditingQueue.tsx` already queries `video_edits` directly and calls `supabase.from("video_edits").update(...)` for all edits. It does **not** call `update-editing-status`. Changes needed:

- Remove the orphan-insert block (~lines 158–181): this block queries `scripts`, finds scripts with no `video_edits` row, and inserts them. After Sub-project 1, `directSave` guarantees every script has a row, so this block is redundant.
- Remove the `mappedScripts` fallback items and the merge (~lines 204–227): these lines create a second list of items from orphan scripts and merge them into `items`. With the orphan-insert removed, this entire block becomes dead code. After removal, `setItems` should be called only with `mappedVideos` (the direct `video_edits` results).
- Add `"Needs Revision"` to the status dropdown options
- Status options: `Not started` → `In progress` → `Needs Revision` → `Done`

**`src/pages/MasterEditingQueue.tsx`**

- Remove `fetch-editing-queue` call and all Notion item handling
- Remove `notionUsers` state and Notion user fetch
- Remove `notionUsers.map(...)` assignee dropdown (~lines 490–507); replace with a plain free-text `<input>` or `<Input>` field
- Add `"Needs Revision"` to status options
- Remove orphan-auto-create logic (block that creates `video_edits` rows for Notion-only items)
- **Single-item delete** (`handleDeleteItem`, line 381): replace the `delete-editing-item` edge function call with `supabase.from("video_edits").delete().eq("id", deleteConfirmItem.id)`. Do not call `delete-editing-item` at all.
- **Bulk delete** (line 441): already uses `supabase.from("video_edits").delete().in("id", dbIds)` — no change needed.
- **Assignee change** (`handleAssigneeChange`, line 302): the current signature passes `userId` and `propName` (Notion-specific). After migration, the new `update-editing-status` contract accepts `assignee: string` (free text). Rewrite `handleAssigneeChange` to accept `(id: string, userName: string)` and call `update-editing-status` with `{ id, assignee: userName }`. The Notion user picker UI is removed (see assignee dropdown item above).
- **Schedule date** (`schedule-post` call, ~line 401): `schedule-post` writes to `content_calendar`, which is superseded by Sub-project 3. Replace with a direct `supabase.from("video_edits").update({ schedule_date: date }).eq("id", id)` call, consistent with how `EditingQueue.tsx` already handles scheduling (line 335).
- `update-editing-status` callers (~lines 283, 305, 334): update each to send `{ id: itemId, <field>: value }` using the new contract (see below)

**`src/pages/PublicEditingQueue.tsx`**

`PublicEditingQueue.tsx` already has source-based branching: for `source === "db"` items it calls `supabase.from("video_edits").update(...)` directly. The Notion else-branches must be removed entirely:

1. **`fetch-editing-queue`** (line 112): replace with a direct `video_edits` query for the given client
2. **Status change** (~lines 172–178): remove the Notion `else` branch; the `source === "db"` Supabase path already handles this correctly
3. **Post-status change** (~lines 193–199): remove the Notion `else` branch
4. **Revision save** (~lines 224–227): remove the Notion `else` branch
5. **Schedule post** (~lines 246–249): replace `schedule-post` edge function call with `supabase.from("video_edits").update({ schedule_date })` call, same pattern as `EditingQueue.tsx`

**`supabase/functions/update-editing-status/index.ts`**

Rewrite — remove all Notion PATCH logic.

New request body:
```typescript
{
  id: string;           // video_edits.id (UUID)
  status?: string;      // e.g. "In progress", "Done", "Needs Revision"
  assignee?: string;    // free text (resolved display name, not a user ID)
  revisions?: string;   // revision notes text
  post_status?: string; // e.g. "Approved", "Needs Revision", "Done"
}
```

Implementation:
```typescript
const { id, status, assignee, revisions, post_status } = body;
const update: Record<string, any> = {};
if (status !== undefined) update.status = status;
if (assignee !== undefined) update.assignee = assignee;
if (revisions !== undefined) update.revisions = revisions;
if (post_status !== undefined) update.post_status = post_status;
const { error } = await supabase.from("video_edits").update(update).eq("id", id);
```

**`supabase/functions/fetch-editing-queue/index.ts`** — no changes, left unused

### Queue columns

| Column | Source | Editable |
|---|---|---|
| Reel Title | `reel_title` | No |
| Status | `status` | Yes — dropdown |
| Post Status | `post_status` | Yes — dropdown |
| Assignee | `assignee` | Yes — free text |
| Revisions | `revisions` | Yes — text |
| Footage | `footage` | Yes — URL |
| File Submission | `file_submission` | Yes — URL |
| Script | `script_url` | Link only |
| Schedule Date | `schedule_date` | Yes — date picker → auto-adds to calendar |
| Caption | `caption` | Yes — text |

---

## Sub-project 3 — Content Calendar (Local Only)

### Problem

`ContentCalendar.tsx` calls `sync-calendar-status` on mount to reconcile Notion page statuses with `content_calendar`. New calendar entries only appear when a Notion page has been linked. Post approvals call `update-post-status`, which PATCHes Notion.

The `content_calendar` table uses `scheduled_date` (with "d") while `video_edits` uses `schedule_date` (no "d"). The calendar UI appends `T00:00:00` when parsing dates (e.g., `new Date(dateStr + "T00:00:00")`). Since `video_edits.schedule_date` is stored as `TIMESTAMPTZ`, the raw ISO string (e.g., `"2026-03-16T10:00:00+00:00"`) must be truncated to `YYYY-MM-DD` at the mapping boundary to avoid double-timezone issues.

### What changes

**`src/pages/ContentCalendar.tsx`**

- Remove `sync-calendar-status` edge function call on mount (~line 236)
- Replace `content_calendar` query with a `video_edits` query:
  ```typescript
  supabase
    .from("video_edits")
    .select("id, reel_title, schedule_date, post_status, assignee, script_id, file_submission, caption, script_url, revisions")
    .eq("client_id", clientId)
    .not("schedule_date", "is", null)
    .order("schedule_date", { ascending: true })
  ```
- Map results at the query boundary. Truncate `schedule_date` to `YYYY-MM-DD` so calendar date logic works correctly:
  ```typescript
  const posts = (data || []).map(v => ({
    id: v.id,
    title: v.reel_title,
    // Truncate TIMESTAMPTZ to date-only — calendar appends T00:00:00 when parsing
    scheduled_date: (v.schedule_date as string).slice(0, 10),
    post_status: v.post_status,
    file_submission_url: v.file_submission,
    script_url: v.script_url,
    revision_notes: v.revisions ?? null,
    caption: v.caption,
    notion_page_id: null,  // kept for interface compat
  }));
  ```
- Update `CalendarPost` interface: `notion_page_id?: string | null`
- Update `update-post-status` call sites (~lines 288–291 and 321–328):
  - Remove `notion_page_id:` field from both call bodies
  - Change `calendar_entry_id` → `id`
  - Change `new_status` → `status`
  - Keep `revision_notes:` in the "Needs Revision" call (line 327) — new contract supports it

**`src/pages/PublicContentCalendar.tsx`**

- Same query change — read `video_edits` where `schedule_date IS NOT NULL` for the given `clientId`
- Apply the same `schedule_date.slice(0, 10)` truncation at mapping boundary
- Update `CalendarPost` interface: add `revision_notes?: string | null` and `caption?: string | null`, make `notion_page_id` optional
- Update `update-post-status` call sites to use the new contract (remove `notion_page_id`, rename fields as above)

**`supabase/functions/update-post-status/index.ts`**

Rewrite — remove all Notion PATCH logic.

New request body:
```typescript
{
  id: string;              // video_edits.id (UUID)
  status: string;          // new post_status value
  revision_notes?: string; // written to video_edits.revisions when present
}
```

Implementation:
```typescript
const { id, status, revision_notes } = body;
const update: Record<string, any> = { post_status: status };
if (revision_notes !== undefined) update.revisions = revision_notes;
const { error } = await supabase.from("video_edits").update(update).eq("id", id);
```

**`supabase/functions/sync-calendar-status/index.ts`** — no changes, left unused

### Post status workflow (unchanged UX)

`Unpublished` → `Scheduled` → `Approved` → `Done`

`Needs Revision` can come from any state.

### Existing `content_calendar` rows

Rows in `content_calendar` will not appear after this migration since the calendar switches to `video_edits`. For any previously scheduled video, an admin should set `schedule_date` on the corresponding `video_edits` row in the editing queue. The `content_calendar` table is left in place (not dropped).

---

## Notion functions that become unused (not deleted)

| Function | Fate |
|---|---|
| `sync-notion-script` | Unused — not called by any path |
| `bulk-sync-notion-scripts` | Unused |
| `fetch-editing-queue` | Unused |
| `update-editing-status` | Notion PATCH removed; rewritten to DB-only |
| `update-post-status` | Notion PATCH removed; rewritten to DB-only |
| `sync-calendar-status` | Unused — not called |
| `get-notion-db-schema` | Unused |

---

## Data flow after all three sub-projects

```
AIScriptWizard saves script
  → scripts row created
  → script_lines rows created
  → video_edits row auto-created (reel_title, footage, script_url,
    status=Not started, post_status=Unpublished, caption=null)
  → [NO Notion sync call]

Editing Queue loads (EditingQueue / MasterEditingQueue / PublicEditingQueue)
  → reads video_edits directly (no Notion API call)
  → one row per script, no duplicates
  → editor sets schedule_date → video appears on calendar immediately
  → status/assignee/revision edits → video_edits only

Content Calendar loads (ContentCalendar / PublicContentCalendar)
  → reads video_edits where schedule_date IS NOT NULL
  → [NO sync-calendar-status call]
  → approve/revise → video_edits.post_status + video_edits.revisions only
```

---

## Success criteria

- A saved script always produces exactly one `video_edits` row with `reel_title`, `footage`, `script_url` populated
- The editing queue shows all scripts for a client with no duplicates
- Status, assignee, and revision edits in all three queue pages persist to `video_edits` without any Notion call
- Setting `schedule_date` on a `video_edits` row causes that video to appear on the content calendar
- Approving or marking "Needs Revision" (including revision notes) updates `video_edits` without any Notion call
- Setting a schedule date from any queue page writes to `video_edits.schedule_date`, not `content_calendar`
- Deleting an item from `MasterEditingQueue` deletes the `video_edits` row directly (no `delete-editing-item` edge function)
- No "Sync to Notion" button is visible in the UI
- Zero Notion API calls in any user-facing flow
