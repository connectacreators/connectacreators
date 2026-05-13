# Editing Queue — full AI automation

**Date**: 2026-05-13
**Owner**: Roberto Gauna
**Status**: Approved, ready for plan

## Goal

Give Robby (the Connecta AI assistant) the ability to drive every operation a
human can perform in the editing queue — both the per-client `EditingQueue`
and the admin `MasterEditingQueue` — so the user can say things like
"open the revisions for the latest Dr Calvin video", "mark everything from
this week done", or "delete the X reel and rename Y" and the AI just does it.

This is phase one of a broader "Jarvis-style" automation goal. Subsequent
phases will cover other surfaces (calendar, scripts, leads). They are out of
scope here.

## The specific bug that triggered this

Robby was asked to open a specific video for review (the user wanted the
revisions modal). The model emitted a generic `{type: "navigate",
path: "/editing-queue"}` action, which took the user to the queue list
instead of the modal on the right row. The architectural gap: there's no
primitive to navigate to a *specific item with a specific modal open*. This
spec fixes that and 11 other gaps.

## Existing surface (do not rebuild)

These tools already work and stay as-is:

- `update_editing_status` · `assign_editor` · `add_revision_notes`
  · `mark_post_published` · `reschedule_post` · `generate_caption`
  · `bulk_reschedule_posts` · `add_editing_queue_item` · `get_editing_queue`

## Architecture — deep links + new tools

The chosen approach. Rejected alternatives:

- **Client-side event bus** (`window.__connectaActions.dispatch(…)`) — rejected
  because it doesn't survive refresh, doesn't deep-link, and introduces
  global state.
- **DB mutation tools only, no UI dispatch** — rejected because it doesn't
  fix the open-the-right-modal bug.

### URL param contract

Both `EditingQueue` (per-client) and `MasterEditingQueue` (admin) accept the
following query parameters. The page reads them on mount, applies them, and
strips them from the URL so a refresh doesn't re-open the modal.

| Param | Values | Effect |
|-------|--------|--------|
| `item_id` | uuid | Scroll the row into view + briefly highlight it |
| `modal` | `revisions` / `review` / `footage` / `caption` / `deadline` / `schedule` / `delete` | Open that modal on the targeted item on mount |
| `status` | `not-started` / `in-progress` / `in-review` / `done` | Pre-filter the list |
| `post_status` | `unpublished` / `scheduled` / `published` | Pre-filter |
| `assignee` | name string | Pre-filter |
| `search` | text | Pre-fill search box |
| `sort` | `title` / `status` / `assignee` / `deadline` / `revisions` / `post_status` | Set sort column |
| `dir` | `asc` / `desc` | Sort direction |

Master view distinction: same params, lives at `/master-editing-queue`. Tools
route to the right URL based on whether `client_name` was provided.

### New AI tools (12)

#### Navigation (1)

- **`open_editing_item({ client_name?, item_title, modal? })`** — resolves an
  item by partial title, emits a `navigate` action with
  `?item_id=…&modal=…`. If `client_name` is omitted, navigates to master view.

#### View state (1)

- **`set_editing_queue_view({ client_name?, status?, post_status?, assignee?, search?, sort_by?, sort_dir? })`** —
  emits a `navigate` action with the requested filter/sort URL params. Master
  view if `client_name` is omitted.

#### Single-item mutations (6)

- **`set_deadline({ client_name, item_title, deadline })`** — `deadline` is
  `YYYY-MM-DD` or `null` to clear.
- **`delete_editing_item({ client_name, item_title })`** — soft delete (sets
  `deleted_at`).
- **`restore_editing_item({ client_name, item_title })`** — clears
  `deleted_at`.
- **`permanent_delete_editing_item({ client_name, item_title })`** — hard
  delete. **Always requires plan-mode preview**, regardless of the current
  autonomy mode (hard deletes are unrecoverable).
- **`set_caption({ client_name, item_title, caption })`** — overwrite caption
  directly without regenerating.
- **`rename_editing_item({ client_name, item_title, new_title })`** — rename
  the reel.

#### Bulk mutations (3) — all capped at 14 items per call

Matches the existing `bulk_reschedule_posts` cap. Returns per-item
OK/MISS/AMBIGUOUS lines.

- **`bulk_delete_editing_items({ client_name, item_titles[] })`**
- **`bulk_assign_editor({ client_name, item_titles[], editor_name })`**
- **`bulk_update_status({ client_name, item_titles[], status })`**

### Item resolution algorithm

Centralized into a shared helper `resolveEditingItem(adminClient, clientId | null, query)`.
Every tool that takes `item_title` uses it. Predictable behavior everywhere.

1. **Exact case-insensitive match** on `reel_title` first.
2. **Substring match** (`ilike '%query%'`) if no exact match.
3. If multiple substring matches, prefer:
   - Non-deleted (`deleted_at IS NULL`) over deleted
   - Most recently updated (`updated_at DESC`)
4. If still ambiguous (3+ equally-good matches), the tool **refuses** and
   returns a structured error containing the top 3 candidate titles so the
   model can ask the user "did you mean A, B, or C?".
5. If `clientId === null` (master path), the search spans every client the
   caller owns.

Trash semantics:

- `delete_editing_item` only finds non-deleted items.
- `restore_editing_item` only finds deleted items (`deleted_at IS NOT NULL`).
- `permanent_delete_editing_item` finds either; if the item is still live, it
  soft-deletes then hard-deletes in the same call.

### Autonomy-mode interaction

The existing `autonomy_mode` system-prompt directives at
`supabase/functions/companion-chat/index.ts:807-823` already cover safety.
This spec adds one rule:

- `permanent_delete_editing_item` ALWAYS proposes a plan first via
  `propose_plan`, even in Auto mode. Hard deletes bypass the autonomy
  default because they are unrecoverable.

## Verification

### Manual smoke tests (critical happy paths)

1. "Open the revisions for the latest Dr Calvin video" → opens the revisions
   modal on the right item.
2. "Sort the queue by deadline" → sort applied, URL params strip after mount.
3. "Mark all my pending videos as in review" → bulk update, toast confirms,
   list refreshes.
4. "Delete the X video" → soft delete + toast.
5. "Restore X" → comes back from trash.
6. "Filter by Daniel as assignee" → assignee filter applied.
7. Master view: the same prompts without naming a client.

### Automated tests

Deferred. The repo has no existing Deno test setup for edge functions, and
the user opted to ship fast and validate via chat-based smoke tests. If
recurring resolver misses or mutation bugs show up, we'll add a test
scaffold then (one-time setup, then tests are cheap to add per tool).

### Rollout sequence

1. Land URL param support on both editing-queue pages (no AI involvement
   yet — verify a manually constructed `?item_id=X&modal=revisions` URL
   works).
2. Land the 12 new tools and shared resolver (edge function deploy).
3. Update the tool inventory section of the system prompt so the model
   knows the tools exist.
4. Smoke-test via Robby on every happy path above.
5. Tighten or loosen the resolver based on real misses observed in chat
   logs.

## Files touched

- `supabase/functions/_shared/editing-resolver.ts` — new shared resolver
  (~50 lines).
- `supabase/functions/companion-chat/tools/editing.ts` — add 12 tool
  definitions + handlers (~400 lines).
- `supabase/functions/companion-chat/index.ts` — register the new tools in
  the `TOOLS` array, add a brief tool-inventory blurb to the system prompt.
- `src/pages/EditingQueue.tsx` — URL param effect (~40 lines).
- `src/pages/MasterEditingQueue.tsx` — same URL param effect (~40 lines).
- No test file in this phase (see Automated tests section).

## Out of scope

- Calendar / scripts / leads automation (separate specs).
- Voice-driven invocation (covered by existing voice input; not changed).
- A "redo last action" affordance (the chat surface already preserves
  history; not adding undo toasts).
- UI redesign of `EditingQueue` or `MasterEditingQueue` (only adding the
  URL param effect, not changing visual design).
- Permission / role checks beyond what the existing RLS policies enforce.
