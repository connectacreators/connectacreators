# Videographer + Editor: Resolve Revisions

**Date:** 2026-04-24
**Status:** Design — ready for implementation
**Scope:** Give the `videographer` and `editor` roles the same revision-resolve capabilities as `admin` inside the VideoReviewModal — both per-comment toggle and the "mark all unresolved as complete" bulk action. Keep delete and internal-note privileges admin-only.

---

## Why

Today, only admins can mark client revision comments as resolved (individually or all at once). Videographers and editors actually do the work and need to close the loop themselves; routing every "I fixed it" back through an admin is friction the team has been bumping into.

## Out of scope

- Comment **deletion** stays admin-only (it's a destructive housekeeping action).
- The **"Internal-only"** toggle on new comments stays admin-only (it's a visibility privilege call).
- Comment **creation** by videographer/editor — they can already type comments; this spec doesn't change anything there.
- RLS policy changes — the current policy already allows any authenticated user to update `revision_comments`. The gate is purely UI-level, and that's where the fix lives.

## What changes

In [`src/components/VideoReviewModal.tsx`](src/components/VideoReviewModal.tsx):

1. Pull `isVideographer` and `isEditor` from `useAuth()` alongside `isAdmin`.
2. Compute `const canResolve = isAdmin || isVideographer || isEditor;` once near the top of the component.
3. Replace `isAdmin` with `canResolve` at the **resolve gates** only:
   - `~line 504` — the "mark all unresolved as complete" bar
   - `~line 547` — the per-comment "Unmark complete" button (shown when `c.resolved` is true)
   - `~line 554` — the per-comment "Mark complete" button (shown when `c.resolved` is false)
4. Leave `isAdmin` untouched at:
   - `~line 473` — the "Internal-only" toggle for new comments
   - `~line 581` — the delete affordance on each comment row
   - `~line 332` — the filter that hides `internal_only` comments from non-admins (videographer/editor still don't see internal admin notes)

## Edge cases

- **A videographer with no client assignment** can still resolve comments on any modal they have access to. Access to the modal itself is gated by upstream routes; this spec doesn't widen that surface.
- **A resolved comment shows up "opacity-40"** in the list. After this change, a videographer / editor can also click to unmark it. No visual changes.
- **No realtime sync** — if two roles resolve the same comment simultaneously, last-write-wins. Already true today; not new.
- **Audit trail** — `revision_comments` doesn't store *who* resolved a comment. Not changed by this spec; flag if needed later.

## Files touched

```
src/components/VideoReviewModal.tsx     (modified — 1 destructure line + 1 derived constant + 4 gate replacements)
```

No new files, no DB changes, no edge functions.

## Deployment

1. Build
2. `scp` to VPS
3. Cloudflare purge

## Future (separate specs)

- Optional: store `resolved_by_user_id` and `resolved_at` on `revision_comments` so the UI can show "resolved by Carlos · 2h ago" and we get a real audit trail.
- Extending delete/internal-only to videographer/editor if the team wants full parity (currently kept admin-only).
