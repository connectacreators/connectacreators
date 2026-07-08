# Revision note time ranges — design

**Date:** 2026-07-08 · **Status:** approved (user), implementing

## Problem

Revision notes on video edits capture a single `timestamp_seconds`. Reviewers
often need to flag a *span* ("cut from 0:26 to 0:31"), which today gets written
into the note text by hand and can't be visualized or jumped to precisely.

## Decision summary

- New nullable column `revision_comments.end_timestamp_seconds integer`
  (applied to prod via Supabase MCP 2026-07-08, verified). A note with only
  `timestamp_seconds` is a point note (all existing rows unchanged); with both
  it is a range. `end` is always `> start` when present.
- Range creation ships on **both** surfaces: internal `VideoReviewModal` and
  public no-login `PublicVideoReview`. No edge-function changes —
  `public-review-post` only creates general (null-timestamp) notes.

## Composer interaction (both surfaces)

When the video is paused and seekable (Supabase source), the timestamp chip
behaves as today. **Double-click the chip** to enter range mode:

- Start locks at the chip's time. A second "end" chip appears that live-follows
  the playhead (`→ 0:41 ⏺`) whenever the playhead is past the start.
- Play/scrub to where the issue ends, then **click the end chip to lock it**.
  An ✕ clears back to single-point mode. Double-clicking again also exits.
- Hitting Add while the end is still following uses the current playhead as
  the end. An end ≤ start silently saves as a normal point note — no error
  states.
- Drive/no-seek path: the manual timestamp field and the leading-note-prefix
  parser accept `1:23-1:45` (also `–`/`—`/`to`) to set a range by typing.

## Display

- Note cards: `0:28 – 0:41 — Jump`; Jump seeks to the start.
- Progress-bar overlay: ranged notes render a translucent segment from
  start% to end% in the author-role color, plus the existing dot at the start.
  Point notes keep just the dot. Same treatment on PublicVideoReview's simpler
  progress bar.
- Sorting, resolve/edit/delete, internal-only, multi-version source tabs and
  the mobile tab layout are unchanged.

## Files

- `src/services/revisionCommentService.ts` — `end_timestamp_seconds` on
  `RevisionComment` + `CreateCommentInput`, passed through `createComment`.
- `src/integrations/supabase/types.ts` — add column to `revision_comments`
  Row/Insert/Update types.
- `src/components/VideoReviewModal.tsx` — range-mode state, chips, range
  parsing, card display, overlay segments.
- `src/pages/PublicVideoReview.tsx` — same, adapted to its inline player.

## Rollout

Worktree off `origin/main` (never the stale `feat/video-editor-phase-1`
checkout). Order: DB column (done) → `tsc` verified by exit code → build →
push to main → manual VPS deploy (CI "Deploy to VPS" step is firewalled).
