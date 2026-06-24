# Archive workflow + split Edited/Published metrics — Design

**Date:** 2026-06-23
**Status:** Approved (design)

## Problem

The Content Strategy dashboard (`/clients/:id/strategy`) shows "Videos edited: 1 / 20"
when the team has actually edited and published many more videos this month.

Root cause: **trash is doing double duty.** To declutter the editing queue, operators
move completed videos to Trash, which sets `video_edits.deleted_at`. The strategy
"Videos edited" count explicitly excludes anything with `deleted_at` set
([ClientStrategy.tsx:199](../../../src/pages/ClientStrategy.tsx#L199)), so every video
trashed for decluttering vanishes from the count. Trashing also cascade-trashes the
linked script ([MasterEditingQueue.tsx:653](../../../src/pages/MasterEditingQueue.tsx#L653)),
so the Scripts pace is undercounted too.

Secondary problem: there is no "Published" metric. The data exists
(`lifecycle_status = "Published"` / `post_status = "Published"`) but is not surfaced; the
current "Videos edited" actually counts Scheduled + Published lumped together under the
legacy `status = "Done"`.

## Goals

1. Give operators a way to remove finished videos from the editing queue **without**
   deleting them from metrics.
2. Surface **Edited** and **Published** as two distinct monthly-pace metrics.
3. Auto-clean archived items after 30 days.

## Non-goals

- Reworking the lifecycle status model.
- Changing how scripts are counted (scripts metric already ignores `deleted_at`).
- Building a configurable retention UI (30 days is fixed for now).

## Data model

Add one column to `video_edits`:

```sql
ALTER TABLE video_edits ADD COLUMN archived_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_video_edits_archived_at ON video_edits (archived_at)
  WHERE archived_at IS NOT NULL;
```

Three mutually-exclusive states (priority: trashed > archived > active):

| State    | Columns                  | In queue? | In metrics? | Recoverable?            |
|----------|--------------------------|-----------|-------------|-------------------------|
| Active   | both NULL                | ✅        | ✅          | —                       |
| Archived | `archived_at` set        | ❌        | ✅          | ✅ (Archived view)      |
| Trashed  | `deleted_at` set         | ❌        | ❌          | ✅ (Trash view)         |

Schema change applies to prod via Supabase MCP/dashboard (per project convention —
never bulk `db push`), and is mirrored in a migration file. Verify the column exists in
prod before deploying code that reads it.

## Editing queue changes

**Both queue components must get the Archive action AND the Archived view** (shared-change
convention: `MasterEditingQueue.tsx` for the master "All Clients" view and
`EditingQueue.tsx` for the per-client/individual view). The Archive button, bulk archive,
Archived view, and Restore must all be visible and functional in **both** the master and
the individual editing queues — not one or the other.

- **List query** gains `.is("archived_at", null)` alongside the existing
  `.is("deleted_at", null)`, so archived items drop out of the main view.
- **Archive action** (single row + bulk selection), placed next to the existing Trash
  action. Sets `archived_at = now()`. Unlike Trash, it does **not** cascade to the
  linked script. No confirmation dialog for single archive (it is recoverable); bulk
  archive shows a lightweight count confirmation matching the existing bulk-trash UX.
- **Archived view**, mirroring the existing Trash view
  ([MasterEditingQueue.tsx:723](../../../src/pages/MasterEditingQueue.tsx#L723)): query
  `archived_at IS NOT NULL AND deleted_at IS NULL`, ordered by `archived_at desc`.
- **Restore from archive** clears `archived_at` (sets it to NULL), returning the item to
  the active queue.

## Strategy dashboard changes

[ClientStrategy.tsx](../../../src/pages/ClientStrategy.tsx) — Monthly Pace becomes four
metrics: **Scripts / Edited / Published / Posts scheduled**.

Counts (all scoped to current month via `created_at >= monthStart`, except posts
scheduled which uses `schedule_date`):

- **Scripts** — unchanged.
- **Edited** = `status = "Done"` AND `deleted_at IS NULL`. (Relabel from "Videos edited".
  Because Archive leaves `deleted_at` NULL, archived edits now count — this alone fixes
  the "1 vs many" bug.)
- **Published** = `post_status = "Published"` AND `deleted_at IS NULL`. (New.)
- **Posts scheduled** — unchanged (`schedule_date >= monthStart`, `deleted_at IS NULL`).

The `counts` state shape, the Monthly Pace section render, the Action Required card, and
the percentage calculations are all updated to include the new Published metric. The
target (`/ 20`) treatment for Published follows the same monthly-target pattern as the
other rows.

## 30-day retention

A daily pg_cron job moves archived items to Trash after 30 days (soft delete — still
recoverable in the Trash view, consistent with "go to delete"):

```sql
UPDATE video_edits
SET deleted_at = now()
WHERE archived_at IS NOT NULL
  AND archived_at < now() - interval '30 days'
  AND deleted_at IS NULL;
```

Because metrics are current-month only, a 30-day-old archived item is already outside the
count window, so this transition never disturbs the displayed numbers. Scheduled via
pg_cron (same mechanism as existing jobs), applied through Supabase MCP.

## Testing

- **Archive/restore round-trip:** archiving removes from queue, keeps in metrics, appears
  in Archived view, restore returns it to queue.
- **Trash unchanged:** trashing still removes from queue and metrics, still cascade-trashes
  the linked script.
- **Metric correctness:** with N edited (some archived, some active, one trashed), Edited =
  active + archived (trashed excluded); Published counts only `post_status = "Published"`.
- **Retention SQL:** an item with `archived_at` older than 30 days gets `deleted_at` set;
  newer archived items and active items are untouched.
- **TypeScript:** verify `tsc` passes by exit code before deploy (CI does not typecheck).

## Rollout

1. Apply schema (column + index) to prod via MCP; verify column exists.
2. Schedule pg_cron retention job via MCP.
3. Ship UI changes (editing queue + strategy dashboard) — typecheck, then push to main
   (CI auto-deploys).
