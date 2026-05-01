# Viral Feed Overhaul — Design Spec

**Date**: 2026-04-06
**Status**: Approved
**Scope**: ViralToday.tsx (Grid), ViralReelFeed.tsx (Reels), VPS server (new endpoint)

## Problem Statement

Three critical UX issues in the Viral Today experience:

1. **Reels feed auto-scroll bug**: When a video hasn't loaded, the feed skips ahead to the next cached video. When the skipped video finally loads, the feed scrolls BACK to it, interrupting the user mid-watch. Root cause: `sortedVideos` useMemo re-sorts when `failedVideoIds` changes, and the anchoring effect chases the moved video by calling `setActiveIdx`.

2. **Repeated video display**: Users keep seeing videos they've already watched multiple times. Root cause: `initialInteractions` (seen counts) is loaded once at mount and never updated during the session. The scoring penalty (`-15 * seen_count`) uses stale data.

3. **Grid view instability**: The Grid shares the same algorithmic scoring, seen-tracking, and re-sort logic as the Reels feed, causing videos to shift position and disappear mid-session.

## Design Decisions

- **Grid view**: Pure data explorer. No session tracking, no re-sorting, no failed-video penalties. "For You" sort is a lightweight niche+unseen boost, not a live algorithm.
- **Reels feed**: YouTube Shorts model. Videos seen 3+ times are hard-filtered out. Feed order is computed once and frozen for the session. No mid-session re-sorting.
- **Batch-gated playback**: Instagram-style. Videos are pre-cached in batches of 10 before being shown. No skipping, no jumping back.
- **Seen threshold**: 3+ views = permanently hidden from Reels. Grid always shows everything.

---

## Part 1: Grid View (ViralToday.tsx)

### Remove

- `failedVideoIdsRef` and its `-9999` penalty in sort
- `seenThisSession` ref, `flushSeen` timer, `flushTimerRef` (session-tracking machinery)
- `IntersectionObserver` seen-marking in `VideoCard` (`onSeen` callback)
- `algorithmNavigating` ref and the anchoring effect
- "Show Seen" eye toggle button and `showSeen` state
- The `seen_count >= 4` hard-filter in `filteredVideos`

### Keep

- `initialInteractions` fetch at mount — needed for "For You" sort's unseen_bonus (read-only, no flush/tracking)
- All existing sort options: Recent, Outlier, Views, Engagement
- "For You" sort option — but with simplified scoring (see below)
- All server-side filters: platform, date, outlier, views, engagement
- Client-side filters: source, channel, search
- Pagination (100 per page)

### Simplified "For You" Sort

```
score = outlier_score * 10
      + recency_bonus       (30 pts if today, 0 if 90+ days old)
      + niche_match          (+40 if caption/username matches client niche keywords)
      + channel_affinity     (+20 if user added this channel)
      + unseen_bonus         (+25 if video has no entry in initialInteractions)
```

No `seen_count` scaling penalty. No failed-video penalty. No session tracking. Sort is stable — same inputs always produce same output.

### Result

Grid is a stable data explorer. Videos never jump, disappear, or re-sort mid-session. Every video in the database is always visible.

---

## Part 2: Reels Feed (ViralReelFeed.tsx)

### Architecture: Three Subsystems

#### 2A. Feed Construction (runs once on load)

1. Fetch videos from `viral_videos` table (top outliers, platform filter, same query as now)
2. Fetch `viral_video_interactions` for the current user
3. **Hard-filter**: Remove any video with `seen_count >= 3`
4. **Score and sort** remaining videos:
   ```
   score = outlier_score * 10
         + recency_bonus       (30 pts if today, 0 if 90+ days)
         + niche_match          (+40)
         + channel_affinity     (+20)
         + unseen_bonus         (+25 if seen_count === 0)
         - seen_penalty         (-15 * seen_count, for seen_count 1-2)
   ```
5. Store as `feedVideos` — a **frozen array** for the session. No `useMemo` that recomputes on state changes.
6. **Empty state**: If all videos are filtered out (user has seen everything 3+ times), show a message: "You've seen all the top content! Check back later or explore the Grid view." with a link to the Grid.

**What's deleted:**
- `failedVideoIdsRef` penalty (`-9999`)
- `algorithmNavigating` ref
- Anchoring effect that chases pinnedId after re-sort
- Any `useMemo` dependency on `failedVideoIds` or session state

#### 2B. Batch-Gated Playback

**New VPS endpoint: `POST /resolve-batch`**

Request:
```json
{
  "videos": [
    { "url": "https://www.instagram.com/reel/CODE1/", "platform": "instagram" },
    { "url": "https://www.tiktok.com/@user/video/123", "platform": "tiktok" }
  ]
}
```

Response (when all resolved):
```json
{
  "results": {
    "CODE1": "https://connectacreators.com/video-cache/ig_CODE1.mp4",
    "CODE2": "https://connectacreators.com/video-cache/tt_CODE2.mp4"
  },
  "failed": ["CODE3"]
}
```

Behavior:
- Resolves all videos in parallel (IG API for Instagram, Cobalt/yt-dlp for TikTok/YouTube)
- Caches each to `/var/www/video-cache/` on disk
- Returns only when all are resolved or timed out (30s max per video)
- Failed videos are reported so the frontend can silently drop them

**Frontend batch flow:**

1. Split `feedVideos` into chunks of 10
2. On mount: call `/resolve-batch` with batch 1. Show loading screen (spinner + "Loading your feed...")
3. When batch 1 returns: update `urlMap` with cached URLs, reveal feed, start playing video 1
4. **Lookahead trigger**: When user reaches video 7 (or 8), fire `/resolve-batch` for batch 2 in background
5. **Boundary gate**: If user reaches video 10 and batch 2 isn't ready, show a per-video spinner on video 11's slot. User stays on video 10 until batch 2 arrives. No skipping forward.
6. Failed videos from `/resolve-batch` response: silently remove from `feedVideos` at the batch boundary (not mid-playback). Indices don't shift for already-visible videos.

#### 2C. Scroll Behavior

- `activeIdx` is changed ONLY by user action: swipe, wheel, arrow keys, tap
- No algorithm-driven `setActiveIdx` calls
- No `algorithmNavigating` ref — nothing auto-navigates
- No stall timeout that swaps video `src` mid-play
- `onError` on a `<video>` element: show retry button overlay (existing UI). Do NOT re-sort or skip.
- Playback reset effect: simplified to just `setPaused(false)` and `setVideoReady(false)` on `activeIdx` change

#### 2D. Seen Tracking (simplified)

- After 3 seconds on a video, add its ID to `seenThisSession` ref
- Flush to DB via `upsert_video_seen` RPC every 30s + on `beforeunload`
- `initialInteractions` is loaded once at mount, used only during feed construction (step 2A), never updated mid-session
- No `IntersectionObserver` — Reels is one-video-at-a-time, activeIdx change is the trigger

---

## Part 3: VPS Server Changes

### New Endpoint: `POST /resolve-batch`

Location: `/var/www/ytdlp-server.js`

```
POST /resolve-batch
Content-Type: application/json

Body: { "videos": [{ "url": "...", "platform": "..." }, ...] }
Response: { "results": { "CODE": "cached_url", ... }, "failed": ["CODE", ...] }
```

Logic:
1. For each video, check disk cache first (`/var/www/video-cache/{plat}_{code}.mp4`)
2. If not cached, resolve in parallel:
   - **Instagram**: IG private API (`/api/v1/media/{id}/info/`) → get `video_versions[0].url` → download to cache
   - **TikTok**: Cobalt (`localhost:9001`) → get CDN URL → download to cache
   - **YouTube**: yt-dlp `--get-url` → get CDN URL → download to cache
3. Wait for all to complete (30s timeout per video)
4. Return map of code → cached URL, plus list of failed codes

Concurrency limit: max 3 parallel downloads per request. Global semaphore of 5 total concurrent downloads across all requests to prevent VPS overload when multiple users hit the feed simultaneously.

### Existing Endpoints (unchanged)

- `/stream-reel`: Still works as fallback for individual video resolution
- `/cache-status`: Still works for checking which videos are cached
- `/resolve-thumb`: Thumbnail resolution (patched earlier today with IG API)
- `/prefetch`: Can be deprecated once `/resolve-batch` is live

---

## Alternative Approach: Pre-Cache Cron (Option C)

If the batch-gated approach proves too slow or unreliable, an alternative is a background cron job:

- Run every 2 hours (or nightly)
- Fetch top 200 videos by outlier score from `viral_videos`
- For each uncached video, resolve and download to `/var/www/video-cache/`
- Feed only shows pre-cached videos (filter by cache-status on load)
- **Pros**: Zero load time, no per-request resolution latency
- **Cons**: Feed is stale (new viral content has up to 2-hour delay), requires scheduled job setup, disk usage grows faster
- **When to use**: If IG API rate limits become a problem with batch resolution, or if the VPS can't handle parallel downloads during peak usage

---

## Files Modified

| File | Changes |
|------|---------|
| `src/pages/ViralToday.tsx` | Remove algorithm/session-tracking, simplify "For You" sort |
| `src/pages/ViralReelFeed.tsx` | Batch-gated playback, frozen feed order, remove re-sort/anchoring |
| `/var/www/ytdlp-server.js` (VPS) | Add `POST /resolve-batch` endpoint |

## Migration Notes

- No database changes required — `viral_video_interactions` table and `upsert_video_seen` RPC are reused as-is
- The `seen_count >= 3` threshold is a frontend filter, not a DB constraint — easy to adjust later
- Grid view changes and Reels changes are independent — can be deployed separately
