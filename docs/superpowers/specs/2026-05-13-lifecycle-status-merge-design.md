# Merge `status` + `post_status` into one `lifecycle_status`

**Date**: 2026-05-13
**Owner**: Roberto Gauna
**Status**: Approved (user authorized autonomous execution)

## Goal

`video_edits` currently exposes two near-orthogonal status fields:

- `status` — editor workflow (`Not started` | `In progress` | `In review` |
  `Needs Revision` | `Done`)
- `post_status` — publishing state (`Unpublished` | `Scheduled` | `Published`)

Robby (and humans) confuse them constantly. Recent failure: user asked
"change all master construction videos to scheduled", model saw items
marked `Done` in `status` and replied "all are already Done or Scheduled"
— different field entirely. There is also no AI tool that sets
`post_status` to `Scheduled` (only `Published`), so the operation can't
even be performed without a database write outside the tool surface.

Replace both with a single linear `lifecycle_status` field. One source of
truth, one set of values, one tool surface.

## Final values (5)

- **Not started** — row created, no editing yet
- **In progress** — being edited; review may be requested but it's still
  pre-approval
- **Needs Revisions** — review came back asking for changes; back to
  editor
- **Scheduled** — approved + has a posting date set
- **Published** — went live on social

Linear flow with a single backwards edge (Needs Revisions → In progress).
Anything that was "In review" collapses into "In progress" — the
distinction wasn't load-bearing for downstream behavior. Anything that
was "Done + Unpublished" — meaning edited but not scheduled — also
collapses into "In progress" so the user is reminded to schedule it.

## Backfill mapping (run during migration)

Each existing row's `(status, post_status)` tuple maps to one new value.
Precedence top → bottom; first match wins.

| Condition | → new `lifecycle_status` |
|---|---|
| `post_status = 'Published'` | `Published` |
| `post_status = 'Scheduled'` | `Scheduled` |
| `status ILIKE 'Needs Revision%'` | `Needs Revisions` |
| `status = 'Not started'` | `Not started` |
| `status IN ('In progress','In review','Done')` AND `post_status = 'Unpublished'` | `In progress` |
| anything else (defensive) | `Not started` |

## Migration strategy

Two-phase to keep production safe.

**Phase 1 (this spec)**: Add `lifecycle_status text NOT NULL DEFAULT 'Not started'` with a CHECK constraint. Backfill from existing rows. Update every read site to use the new column. Update every write site to write both old + new for the next ~week so we can roll back if anything goes sideways. AI tools collapse into one set.

**Phase 2 (later spec, after ~1 week of clean prod)**: Drop `status` and `post_status` columns. Drop the dual-write code paths. Drop the old AI tools that were left as compatibility wrappers.

## Code surface (Phase 1)

### Database
- New migration file: `supabase/migrations/<TIMESTAMP>_lifecycle_status.sql`
- Add column with CHECK constraint
- Backfill SQL per mapping above
- DO NOT drop old columns this pass

### Types
- `src/integrations/supabase/types.ts` — regenerate or hand-edit `lifecycle_status` field on `video_edits` Row / Insert / Update types

### Pages (read-side)
- `src/pages/EditingQueue.tsx` — merge the Status + Post Status columns into one Lifecycle column
- `src/pages/MasterEditingQueue.tsx` — same
- `src/pages/PublicEditingQueue.tsx` — same
- `src/pages/ContentCalendar.tsx` / `PublicContentCalendar.tsx` — read `lifecycle_status` instead of `post_status`
- `src/pages/ClientDatabase.tsx` / `MasterDatabase.tsx` — rollups
- `src/pages/Scripts.tsx` — wherever editing queue status appears

### Pages (write-side)
Every page that writes `status` OR `post_status` writes both old + new for compat during phase 1. Helper: `src/lib/lifecycleStatus.ts` with `splitLifecycleStatus(value)` → `{status, post_status}` so writes update all three columns from one input.

### Edge functions
- `supabase/functions/update-editing-status/index.ts` — accept lifecycle_status
- `supabase/functions/update-post-status/index.ts` — accept lifecycle_status (or deprecate, route to update-editing-status)
- `supabase/functions/sync-calendar-status/index.ts` — read lifecycle_status
- `supabase/functions/schedule-post/index.ts` — set lifecycle_status='Scheduled' when scheduling
- `supabase/functions/fetch-editing-queue/index.ts` — return lifecycle_status

### AI tools (companion-chat)
- New: `set_lifecycle_status(client_name, item_title, lifecycle_status)`
- New: `bulk_set_lifecycle_status(client_name, item_titles, lifecycle_status)` — replaces both `bulk_update_status` AND a never-shipped `bulk_set_post_status`
- Keep `mark_post_published` and `mark_done_and_published` but reroute them under the hood to set `lifecycle_status='Published'`
- Update tool inventory section of system prompt
- Remove rule 18d-FIELDS (no longer needed — one field)

## Out of scope (Phase 2)

- Dropping old columns
- Removing dual-write code
- Removing deprecated AI tools

## Verification

After deploy:

1. Visit `/editing-queue` (master) and `/clients/:id/editing-queue` (per-client) — single Lifecycle column visible with correct values backfilled
2. Robby in drawer: "change all master construction videos to scheduled" → navigates, pulses rows, plan card asks approve, on approve runs `bulk_set_lifecycle_status` with value `Scheduled`
3. A write to the old `status` field (e.g. via existing UI dropdown) still works AND updates `lifecycle_status` correctly
4. Calendar shows scheduled posts based on `lifecycle_status='Scheduled'`
