# Collaborative Script Editing — Design Spec

**Date:** 2026-06-20
**Status:** Approved (design), pending spec review
**Author:** Roberto + Claude
**Surface:** `src/pages/Scripts.tsx` (the unified block editor) + `src/hooks/useScripts.ts` data layer

## Problem

A paying client's script was silently overwritten. Two browser sessions had the **same script open at once**; both made edits; the session that auto-saved **last** wiped the other's work. No warning, no recovery.

### Root cause (confirmed)

The block editor auto-saves the whole document every ~900ms (and on the "Save" button) via
`saveScriptBlocks → replaceAllLines`, which performs a **delete-all-`script_lines`-then-reinsert**.
There is **no concurrency control**: each open session blindly rewrites the entire document from
its own in-memory copy. Last writer wins; the other session's edits are destroyed.

The caption field has the same shape of bug via its on-blur full-field overwrite.

### Confirmed during investigation

- The incident data was *not* recoverable from version history (`script_versions` was empty for the
  affected script) and there is **no local/browser draft backup** (no `localStorage`/`sessionStorage`
  persistence in the editor). A second, divergent copy happened to survive in the legacy
  `scripts.raw_content` blob, but that is incidental, not a reliable safety net.
- `script_lines` already has a stable primary key `id uuid default gen_random_uuid()`. The editor
  currently discards it on every save (delete + reinsert generates fresh ids).
- Reusable realtime infrastructure already exists and is proven in Super Canvas:
  - `src/hooks/useRealtimePresence.ts` — Supabase presence (avatars), keyed per browser tab.
  - `src/hooks/useRealtimeCanvasSync.ts` — Supabase **broadcast** channel sync (positions/edges/cursors).
  - `src/components/canvas/PresenceAvatars.tsx` / `PixelAvatars.tsx` — avatar UI.
  - Broadcast + presence channels need **no** table additions to the realtime publication.

## Goals

1. **Never silently overwrite another session's work.** (Hard requirement.)
2. Co-editing that **feels near-live** (~1s), block by block — chosen liveness level: *near-live block
   sync*, not character-level OT.
3. A **presence banner** showing the **real people** currently in the script (name/initials + color),
   like Super Canvas's avatar function.

## Non-goals (YAGNI)

- Character-level operational transform / CRDT cursors. Out of scope.
- Merge UI / conflict-resolution dialogs. Same-line simultaneous edits resolve as last-write-wins,
  made visible by live sync.
- Offline editing / queued-while-disconnected sync.
- Read-only locking of the second session.

## Liveness contract (agreed behaviour)

- Two people editing **different blocks**: both edits always preserved. No conflict, ever.
- Two people editing the **same block** at the same time: the last edit to that block wins, but both
  saw it update live (~1s), so it is visible rather than silent.
- Block add / remove / reorder: reconciled across sessions via a structure broadcast.

## Architecture

Three layers, built and shipped in three phases. Phase 1 is the safety guarantee and stands alone;
Phases 2–3 add the collaborative feel.

### Layer 1 — Stable block identity (foundation for everything)

The in-editor block model (`ScriptLine` in the docBlocks array) gains a **stable `id`** equal to the
DB `script_lines.id`:

- `getScriptBlocks` returns `id` for each row (today it selects everything but `id`).
- New blocks created in the editor get a client-generated `id = crypto.randomUUID()` **at creation
  time**, so identity is stable from birth and consistent once broadcast/persisted.
- This `id` (not the ephemeral `uid` from `withUids`) becomes the canonical key for diffing, saving,
  and realtime matching. The existing `uid` may remain for React keys/drag but `id` is authoritative
  for persistence and sync.

### Layer 2 — Non-destructive diff-based save (the no-overwrite guarantee)

Replace `saveScriptBlocks`'s delete-all-reinsert with a **diff-based** persist in `useScripts.ts`:

Inputs: the full ordered block list (each with stable `id`), plus an explicit set of
`removedIds` (blocks the user deleted in this session).

Algorithm:
1. Normalize/renumber blocks (reuse existing `normalizeBlocks`: line_number = index+1, section from
   nearest heading).
2. **Empty-document safety** (kept): if there is no content line, do nothing and return the persisted
   blocks untouched.
3. **Upsert** each block by `id` (insert if new, update text/rich_text/line_type/section/block_kind/
   line_number if changed). Use a single `upsert(..., { onConflict: 'id' })`.
4. **Delete only `removedIds`** — rows the user explicitly removed. Never delete a row merely because
   it is absent from the local copy (it may be a block another session just added that this session
   has not merged yet). This is the rule that prevents cross-session destruction.
5. Atomically bump `scripts.revision` (see backstop below).

**Backstop — optimistic revision:** add `scripts.revision integer not null default 0`. On load, the
session records the loaded revision. The diff-save performs a conditional bump
(`update scripts set revision = revision + 1 where id = :id and revision = :loaded`). If 0 rows match,
another session advanced the document since load: the save proceeds (diff-save is already
non-destructive) but the session **refreshes its loaded revision and re-reads** so it converges, and
surfaces a quiet "synced with changes from another session" toast rather than fighting. The revision
is a convergence signal, not a hard lock — the real safety is the diff in steps 3–4.

> Migration applied via Supabase MCP/dashboard per project convention (no bulk `db push`); verify the
> column exists in prod before deploying code that reads it.

### Layer 3a — Presence banner (real people)

- Extend `useRealtimePresence` with an optional `displayName` (and keep the existing color). The
  presence payload already carries `userId`, `color`, `lastActive`; add `name`.
- In `Scripts.tsx`, call `useRealtimePresence({ roomId: \`script:${viewingScriptId}\`, userId,
  displayName })` when a script is open. Resolve `displayName` from the loaded profile/user.
- New component `ScriptPresenceBanner` (small, focused): renders colored circular avatars with
  initials, name on hover/tooltip, deduped by `userId` (one avatar per person even with multiple
  tabs), shown in the editor header near the script title. Hidden when no one else is present.

### Layer 3b — Near-live block sync (`useRealtimeScriptSync`)

New hook modeled on `useRealtimeCanvasSync`, broadcast channel `script-sync:<scriptId>`:

Outbound (this session → others), self-echo guarded by `tabId`:
- `block-edit` — `{ id, text, rich_text, line_type, section, block_kind }`, debounced ~300ms per
  block while typing.
- `doc-structure` — `{ order: string[] }` (block ids in order) plus any **new** blocks' content,
  sent when blocks are added, removed, or reordered.
- `caption` — `{ caption }`, debounced, so the caption co-edits too.

Inbound (apply to local docBlocks without disrupting the user):
- `block-edit`: update the block with the matching `id`. **Focus guard** — if the local user is
  currently editing that exact block (focused), skip applying (last-write-wins, visible). Apply to all
  other blocks immediately.
- `doc-structure`: reconcile local order to the broadcast order; append blocks present remotely but
  missing locally; drop blocks absent remotely **only if** not currently focused/being-created
  locally.
- `caption`: update caption unless the caption box is focused locally.

Persistence stays via the Layer-2 diff-save (~900ms debounce) in each session. Broadcast is ephemeral
(presence/feel); the DB diff-save is the durable record. Because both sessions converge in memory via
broadcast and the save is non-destructive, the persisted result contains both sessions' edits.

## Components & interfaces

| Unit | Responsibility | Depends on |
|------|----------------|------------|
| `getScriptBlocks` (mod) | Return rows **with `id`** | supabase |
| `saveScriptBlocks` (rewrite) | Diff-based upsert + explicit-delete + revision bump | supabase, `normalizeBlocks` |
| `computeBlockDiff` (new, pure) | Given prev-persisted ids, next blocks, removedIds → {upserts, deletes} | none (unit-tested) |
| `applyRemoteBlockEdit` / `applyRemoteStructure` (new, pure reducers) | Merge a remote event into a docBlocks array, honoring focus guard | none (unit-tested) |
| `useRealtimeScriptSync` (new hook) | Broadcast + receive block/structure/caption events | supabase, reducers |
| `useRealtimePresence` (mod) | Carry `displayName` | supabase |
| `ScriptPresenceBanner` (new) | Render real-people avatars | `useRealtimePresence` |
| `Scripts.tsx` (wire-up) | Track `id` on blocks, `removedIds`, mount sync + banner | the above |

## Data flow (two sessions, A and B)

1. Both load the script → docBlocks carry stable `id`s; each records `revision`.
2. A edits block X → local state updates → `block-edit{X}` broadcast → B merges X (not focused) → A's
   ~900ms diff-save upserts X.
3. B edits block Y → symmetric. A and B now both hold {X', Y'}.
4. Either session's diff-save upserts only its changed blocks and deletes only its explicit removals →
   DB holds {X', Y'}. Nothing wiped.
5. If a broadcast was missed and B's save lags with stale X, the revision mismatch makes B re-read and
   converge; worst case is same-block last-write-wins, surfaced via toast.

## Error handling

- Save failure: keep existing toast; do **not** clear local docBlocks (no data loss on transient
  failure). The diff-save never deletes non-explicitly-removed rows, so a partial failure cannot wipe
  the doc.
- Realtime channel down: editing still works and still persists via diff-save; sync/presence simply
  degrade to non-live. No correctness dependency on the channel.
- Empty/half-loaded doc: existing empty-document guard prevents destructive saves.

## Testing

- **Unit (pure functions):**
  - `computeBlockDiff`: add-only, edit-only, remove (explicit) only, reorder, mixed; and the critical
    case — a block absent locally but **not** in `removedIds` is **not** deleted.
  - `applyRemoteBlockEdit`: updates matching id; no-ops on focused block; ignores unknown id.
  - `applyRemoteStructure`: reorders, appends remote-new, preserves locally-focused/new blocks.
- **Manual two-tab/two-device test** before each phase ships: edit different lines (both survive);
  edit same line (last wins, visible); add/remove/reorder; presence avatars appear/disappear.
- Verify `tsc` exit code before deploy (CI runs `vite build` only — no typecheck).

## Rollout (phased)

- **Phase 1 — Layer 1 + Layer 2** (stable ids + non-destructive diff-save + revision backstop).
  Stops the data loss. Ship and verify in prod with a two-tab test before continuing.
- **Phase 2 — Layer 3a** (presence avatars banner).
- **Phase 3 — Layer 3b** (`useRealtimeScriptSync`: live block + caption sync).

Each phase is independently shippable and independently valuable.

## Risks

- Touches the production save path (high blast radius) → Phase 1 isolated and verified first.
- `revision` column requires a verified prod migration before its code ships (DB drift caution).
- Diff-save correctness is load-bearing for the no-overwrite guarantee → covered by unit tests on
  `computeBlockDiff`, especially the conservative-delete rule.
