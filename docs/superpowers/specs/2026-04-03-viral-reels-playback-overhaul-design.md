# Viral Reels Playback Overhaul — Design Spec

**Date:** 2026-04-03
**Status:** Approved
**Approach:** C — Cache-status pre-check + URL pre-resolution + lookahead prefetch + nightly daemon

## Problem

- Some Instagram videos won't play
- Some cause CSS glitches (opacity flicker from retry cycle)
- Some only show the thumbnail
- Root cause: HEAD-check race condition — video element renders with an optimistic URL before the cache check resolves async. Error → retry → error cycle causes the flicker.
- Feed shows low-outlier videos (no filter)

## Design Decisions

| Decision | Choice |
|---|---|
| Approach | C: cache-status + prefetch + daemon |
| Outlier threshold | In Settings page (not on Reels UI) |
| Failed video behavior | Silent auto-advance to next |
| Default threshold | 5.0x |

---

## Section 1 — Frontend: `src/pages/ViralReelFeed.tsx`

### 1.1 Outlier filter in DB query
- Add `.gte('outlier_score', threshold)` to the Supabase query
- Read threshold from `localStorage.getItem('viral_outlier_threshold') ?? 5`
- Reduces fetch from 3000 → ~200–400 videos

### 1.2 Batch cache-status check (new)
- After DB fetch, extract shortcodes from all video URLs using existing regex patterns
- Batch GET `https://connectacreators.com/api/cache-status?ids=CODE1,CODE2,…`
- Response: `{ CODE: true|false, … }`
- Build `urlMap: Map<videoId, resolvedUrl>`:
  - Cached → `https://connectacreators.com/video-cache/{plat}_{CODE}.mp4`
  - Uncached → `https://connectacreators.com/api/stream-reel?url=…`
- Done before `setLoading(false)` — videos render with correct URLs from frame 1

### 1.3 Remove HEAD-check race condition (deleted)
- Delete: `resolvedUrls` ref, `getCacheUrl()`, `getResolvedUrl()`, the warm-cache fire on mount, all HEAD fetch logic
- Replace: `urlMap.get(v.id)` — always returns a known-good URL, no async guessing

### 1.4 Pre-buffer next 2 videos (new)
- Render hidden `<video preload="auto" muted playsInline>` elements for `activeIdx+1` and `activeIdx+2`
- Placed outside the scroll container, `display:none`
- Browser buffers them in background; when user scrolls there playback starts in <300ms

### 1.5 Lookahead prefetch on scroll (new)
- Effect on `activeIdx` change: fire-and-forget POST to `/api/prefetch` with videos at `idx+1` through `idx+5` that are NOT in disk cache (i.e., their `urlMap` entry is a stream-reel URL)
- VPS resolves CDN URLs in background and stores in memory map
- Next `/stream-reel` call for those URLs skips Cobalt extraction → near-instant

### 1.6 Silent auto-advance on failure (changed)
- `onError` handler: one retry with stream-reel URL (if not already stream), then `setFailedVideoIds(prev => new Set([...prev, v.id]))`
- New effect: when `failedVideoIds` contains `sortedVideos[activeIdx].id` → scroll to next card
- Remove the 3-stage Instagram error retry (`igErrorStage`) — simplify to one retry then skip

---

## Section 2 — Settings: `src/pages/Settings.tsx`

### New "Viral Feed" section
- Slider: 1x–20x range, step 0.5
- Quick chips: Any · ≥3x · ≥5x (default) · ≥10x · ≥20x 🔥
- Persisted to `localStorage('viral_outlier_threshold')`
- Change takes effect on next Viral Reels page load
- No backend / DB changes needed

---

## Section 3 — VPS: `ytdlp-server.js`

### 3.1 New `/prefetch` endpoint
```
POST /prefetch
Body: { videos: [{ url: string, platform: string }] }
Response: { queued: N }  (immediate, non-blocking)
```

**Behavior:**
1. For each video URL: skip if disk-cached OR already in `prefetchedUrls` map
2. Fire Cobalt extraction in background (non-blocking, no streaming)
3. On success: store `prefetchedUrls.set(url, { cdnUrl, expiresAt: Date.now() + 5*60*1000 })`
4. Concurrency limit: max 3 concurrent prefetch extractions (separate from `warmRunning`)
5. Expired entries cleaned up lazily on next lookup

### 3.2 Modified `/stream-reel`
Add step 2 (between disk-cache check and Cobalt call):
```js
// Check in-memory prefetch cache
const prefetched = prefetchedUrls.get(videoUrl);
if (prefetched && prefetched.expiresAt > Date.now()) {
  // Stream directly from pre-resolved CDN URL — skips 2-5s Cobalt extraction
  // ... pipe CDN response to client with Range support
}
```

---

## Section 4 — VPS: New files

### 4.1 `/var/www/cache-daemon.js`
- Queries Supabase REST API for top 100 videos where `outlier_score >= 5`, ordered DESC
- Filters out already-cached files in `/var/www/video-cache/`
- POSTs uncached batch to `http://localhost:{PORT}/warm-cache`
- Logs to `/var/www/cache-daemon.log`

### 4.2 Crontab entries (2 new)
```cron
# Cache top outlier videos every 2 hours
0 */2 * * * /usr/bin/node /var/www/cache-daemon.js >> /var/www/cache-daemon.log 2>&1

# Clean up videos older than 30 days
0 3 * * * find /var/www/video-cache -name "*.mp4" -mtime +30 -delete
```

---

## Files Changed

| File | Change |
|---|---|
| `src/pages/ViralReelFeed.tsx` | Overhaul player logic |
| `src/pages/Settings.tsx` | Add Viral Feed section |
| `ytdlp-server.js` (VPS) | Add /prefetch, modify /stream-reel |
| `cache-daemon.js` (VPS, new) | Background caching script |
| `crontab` (VPS) | 2 new cron entries |

## Expected UX After Deployment

| Scenario | Before | After |
|---|---|---|
| Cached video | Flicker, sometimes fails | Plays in <0.5s |
| Uncached, prefetched | — | Plays in 1–2s |
| Uncached, cold | 3–8s or fails | 3–5s (Cobalt, first scroll only) |
| Failed video | CSS glitch, stuck thumbnail | Silent skip to next |
| Low outlier junk | Shows in feed | Filtered out at DB level |
