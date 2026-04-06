---
phase: 07-seen-tracking-and-thumbnails
plan: "01"
subsystem: viral-feed
tags: [seen-tracking, thumbnails, bugfix, viral-today, viral-reel-feed]
dependency_graph:
  requires: []
  provides: [SEEN-01, SEEN-02, SEEN-03, SEEN-04, THUMB-01, THUMB-02, THUMB-03]
  affects:
    - src/pages/ViralReelFeed.tsx
    - src/pages/ViralToday.tsx
tech_stack:
  added: []
  patterns: [gradient-base-layer, seen-penalty-sort, TikTok-model-feed]
key_files:
  created: []
  modified:
    - src/pages/ViralReelFeed.tsx
    - src/pages/ViralToday.tsx
decisions:
  - "Remove .filter(seen_count < 4) from sortedVideos — seen penalty in sort score deprioritizes but never hides videos"
  - "showSeen defaults to true so all videos appear on first grid load"
  - "GRID_PALETTES gradient renders as permanent base layer; img covers it when loaded"
  - "Build runs locally; dist is rsync'd to VPS (no source files on VPS)"
metrics:
  duration: "5 min"
  completed_date: "2026-04-06"
  tasks_completed: 2
  files_changed: 2
---

# Phase 7 Plan 01: Seen Tracking and Thumbnails Summary

**One-liner:** Three root-cause bugs fixed — seen-count filter removed from reels feed (TikTok model), grid defaults to showing all videos, and VideoCard always renders a branded gradient behind the thumbnail.

## What Was Built

Three surgical edits across two files resolved all seven requirements (SEEN-01 through THUMB-03) without architectural changes.

### SEEN-01/SEEN-02/SEEN-03 — Reels feed shrinks mid-session

**Root cause:** `sortedVideos` useMemo in `ViralReelFeed.tsx` had `.filter(v => !inter || inter.seen_count < 4)`. This removed videos the user had seen 4+ times, shrinking the feed list as the session progressed.

**Fix:** Removed the `.filter()` call entirely. The existing seen-count penalty (`s -= inter.seen_count * 15`) already pushes heavily-seen videos to the bottom of the sort order. Videos appear lower but are never removed from the list.

### SEEN-04 — Grid hides already-watched videos on first load

**Root cause:** `useState(false)` on `showSeen` in `ViralToday.tsx` meant every fresh page load filtered out seen videos immediately, hiding potentially relevant content.

**Fix:** Changed to `useState(true)`. Updated the Eye button tooltip from "Hiding heavily-seen videos is OFF / Videos seen 4+ times are hidden" to "All videos shown (click to hide seen videos) / Seen videos hidden (click to show all)".

### THUMB-01/THUMB-02/THUMB-03 — Blank thumbnail slots

**Root cause:** When `thumbnail_url` is null or `imgError` is true, the fallback was a plain `bg-muted` div with a grey Play icon — visually indistinct from a loading error.

**Fix:**
- Added `GRID_PALETTES` (8 dark color pairs) and `gridGradientFor(name: string)` function — deterministic hash maps channel_username to a palette for consistent per-channel colors.
- Gradient `<div>` now renders unconditionally as an `absolute inset-0` base layer inside the thumbnail container.
- `<img>` gets `relative` positioning so it covers the gradient when it loads successfully.
- Fallback branch (no thumbnail or imgError) uses `absolute inset-0` centering with `text-white/60` Play icon — visible against the dark gradient.

## Deployment

The VPS has no React source files — it only serves the compiled `dist/` folder. Same pattern as Phase 6.

- Build ran locally: `npm run build` — completed in 4.79 seconds, no TypeScript or Vite errors.
- Deployed via `rsync -avz --delete dist/ root@72.62.200.145:/var/www/connectacreators/`
- Nginx reloaded: `systemctl reload nginx` — exited cleanly.
- `index.html` timestamp confirmed: `Apr 6 02:15 UTC`.

## Tasks

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Apply all three code fixes | c9dadda | src/pages/ViralReelFeed.tsx, src/pages/ViralToday.tsx |
| 2 | Build locally, rsync to VPS, reload nginx | 399c609 | (deploy — dist is gitignored) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] VPS source files not present — built locally instead**

- **Found during:** Task 2 deployment
- **Issue:** The plan instructed SCP of source files to `/var/www/connectacreators/src/pages/` followed by `npm run build` on the VPS. However, `/var/www/connectacreators/` is the compiled `dist/` output directory — there is no `src/` subdirectory and no build toolchain on the VPS.
- **Fix:** Built locally with `npm run build` (4.79s), then rsync'd the entire `dist/` to VPS. Identical end result (live site updated with new JS bundles).
- **Files modified:** dist/ (deployed to VPS, not tracked in git)
- **Commit:** 399c609

This is the same deviation documented in Phase 6 Plan 01 — it is the established deployment pattern for this project.

## Self-Check: PASSED

- FOUND: src/pages/ViralReelFeed.tsx (filter removed at line 215)
- FOUND: src/pages/ViralToday.tsx (showSeen=true at line 883, GRID_PALETTES added after line 322)
- FOUND: commit c9dadda (Task 1 — code fixes)
- FOUND: commit 399c609 (Task 2 — deployment)
