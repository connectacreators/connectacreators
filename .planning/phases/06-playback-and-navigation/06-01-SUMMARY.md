---
phase: 06-playback-and-navigation
plan: "01"
subsystem: viral-reel-feed
tags: [playback, navigation, bugfix, video, autoplay]
dependency_graph:
  requires: []
  provides: [REEL-01, REEL-02, REEL-03, REEL-04, NAV-01, NAV-02]
  affects: [src/pages/ViralReelFeed.tsx]
tech_stack:
  added: []
  patterns: [data-ready dataset flag, readyState preload detection, fixed viewport positioning]
key_files:
  created: []
  modified:
    - src/pages/ViralReelFeed.tsx
decisions:
  - "onCanPlay sets data-ready immediately to prevent stall timeout restart loop"
  - "readyState >= 2 check catches pre-buffered adjacent videos in play-state effect"
  - "Nav arrows use fixed positioning so they are immune to parent transform changes"
  - "Build runs locally; dist is rsync'd to VPS (no source files on VPS)"
metrics:
  duration: "2 min"
  completed_date: "2026-04-06"
  tasks_completed: 3
  files_changed: 1
---

# Phase 6 Plan 01: Playback and Navigation Bug Fixes Summary

**One-liner:** Six reel feed bugs fixed in ViralReelFeed.tsx — data-ready on canPlay prevents restart loops, readyState check catches pre-buffered autoplay failures, and fixed-position nav arrows eliminate scroll drift.

## What Was Built

All six playback and navigation bugs in the viral reels feed were fixed with three surgical edits to `src/pages/ViralReelFeed.tsx`. No architectural changes were made.

### REEL-01/REEL-02 — Black box and auto-restart loop

**Root cause:** The stall timeout fires because `onCanPlay` did not set `data-ready`. After 10 seconds, the timeout reloaded `vid.src` even for a healthy video — causing the visual black box and the restart loop.

**Fix:**
- `onCanPlay` handler now sets `e.currentTarget.dataset.ready = "true"` immediately before attempting `play()`.
- The stall timeout's inner fallback block now sets `vid.dataset.ready = "true"` immediately after switching to the stream-reel src, so it cannot re-fire for the same element.
- Version bumped from v11 to v12; console identity string updated.

### REEL-03 — Autoplay failures on scroll

**Root cause:** When a user scrolls quickly, an adjacent card may have already buffered (`readyState >= 2`) while the `canplay` event was in the "non-active" state. When that card becomes active, `canplay` doesn't re-fire and the `video.paused` check alone misses the case where playback was never started.

**Fix:** Play-state effect condition changed from `video.paused && !pausedRef.current` to `!pausedRef.current && (video.paused || video.readyState >= 2)`. This catches pre-buffered videos that are technically not paused but not playing either.

### REEL-04 — Graceful failure UI

**Status:** Already implemented in a previous session. Confirmed `failedVideoIds.has(v.id) && isActive` block at line 860 shows "Video unavailable" with Retry and Open Original buttons. No code change needed.

### NAV-01/NAV-02 — Arrow drift

**Root cause:** Nav arrows used `position: absolute; top: 50%` inside a parent whose height changes with the reel column translateY transform. As the user scrolls deeper, the parent grows and the arrows drift downward.

**Fix:** Changed arrow wrapper from `absolute top-1/2 ... z-10` to `fixed top-1/2 ... z-[50]`. Fixed positioning is viewport-relative and completely immune to parent layout/transform changes. z-index elevated to 50 to clear all stacking contexts.

## Deployment

- Build ran locally: `npm run build` — completed in 4.83 seconds, no TypeScript or Vite errors.
- Deployed via `rsync -avz --delete dist/ root@72.62.200.145:/var/www/connectacreators/`
- Nginx reloaded on VPS.
- Console should log `[ViralReelFeed] v12 — data-ready on canPlay + stall-timeout guard` on the live site.

## Tasks

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Fix black box (REEL-01) and auto-restart loop (REEL-02) | 98f8bf4 | src/pages/ViralReelFeed.tsx |
| 2 | Fix autoplay failures (REEL-03) and confirm REEL-04 | e35dd2a | src/pages/ViralReelFeed.tsx |
| 3 | Fix arrow drift (NAV-01, NAV-02) + deploy to VPS | abda974 | src/pages/ViralReelFeed.tsx |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] VPS source files not present — built locally instead**

- **Found during:** Task 3 deployment
- **Issue:** The plan instructed SCP of a single source file followed by `npm run build` on the VPS. However, the VPS does not have the React source project — it only serves the compiled `dist` folder from `/var/www/connectacreators/`.
- **Fix:** Built locally with `npm run build`, then rsync'd the entire `dist/` to VPS. Same end result (live site updated).
- **Files modified:** dist/ (deployed to VPS)
- **Commit:** abda974 (includes the nav fix that triggered deployment)

## Self-Check: PASSED

- FOUND: src/pages/ViralReelFeed.tsx
- FOUND: commit 98f8bf4 (Task 1)
- FOUND: commit e35dd2a (Task 2)
- FOUND: commit abda974 (Task 3)
