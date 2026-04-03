# Design: Instagram Search — 50+ Viral Posts

**Date:** 2026-04-03
**Status:** Approved

## Problem

The "Search Instagram" button on Viral Today returns an unpredictable number of results — often 10-30 — when the user needs at least 50 viral posts (≥100k views, ≥2.5x outlier score) per search.

**Root causes:**
- VPS scraper limited to 5 accounts × 30 clips = 150 raw user posts
- Only 3 hashtags × ~15 posts = ~45 raw hashtag posts
- Username/fullname filter drops relevant creators (e.g. garyvee for "business advice")
- ~210 raw posts total → after 100k+2.0x filter → only 15-30 survive

## Solution

Expand scraping breadth on both the VPS and edge function, with slightly longer delays to avoid detection. No frontend changes needed.

## Changes

### VPS — `/var/www/ytdlp-server.js` (`/scrape-reels-search` route)

| Setting | Before | After |
|---|---|---|
| Username/fullname filter | Required match on query words | Removed |
| Max accounts | 5 | 8 |
| Clips per user | 30 | 40 |
| Max hashtags | 3 | 5 |
| Hashtag pages per tag | 1 | 2 (using `next_max_id` cursor) |
| Request delay between users | 1200–2000ms | 1500–2500ms |
| Raw post cap | 300 | 600 |
| VPS pre-filter outlier threshold | ≥ 2.0x | ≥ 1.5x |

**Expected throughput:** ~320 user posts + ~200 hashtag posts = ~520 raw → ~70-90 pass 100k+1.5x filter → ~50-60 survive edge function's 2.5x cut.

**Hashtag pagination:** After fetching page 0, check response for `next_max_id`. If present, fetch page 1 with `page=1&max_id={next_max_id}`. Cap at 2 pages per tag.

### Edge Function — `supabase/functions/scrape-reels-search/index.ts`

- `outlier_score >= 2.0` → `outlier_score >= 2.5`
- VPS limit param: `150` → `300`
- Error message: update to reflect "min 100k views + 2.5x outlier"

### Frontend — no changes

The "Search Instagram" button, toast messages, and auto-switch to "Discovered" source all work correctly as-is.

## Risk Mitigation

- Account cookie rotation (`getNextIgCookies()`) already distributes load across IG sessions
- Cloudflare WARP proxy already handles IP rotation
- Longer delays (1.5-2.5s) partially offset increased request volume
- `clips/user/` endpoint fetches public content — lower risk than auth-gated APIs
- 6-hour cache guard remains unchanged — prevents re-scraping same query within 6h

## Cache Behavior

The 6-hour cache guard stays. If a query was searched in the last 6 hours, the function returns early with `cached: true` and the frontend switches to "Discovered" view.
