# YouTube Shorts Scraper + Unified Competitor Analysis — Design Spec

**Date:** 2026-03-22
**Status:** Approved

---

## ⚠️ BLOCKING PREREQUISITE

Before any implementation begins:

1. Visit `https://apify.com/igview-owner/youtube-shorts-scraper` and check the actor README
2. Confirm exact input field names — specifically:
   - The result limit field (may not be `maxResults` — using the wrong name silently fetches unlimited results, repeating the $60+ Instagram cost incident)
   - The start URLs field (`startUrls` — confirm)
3. Run a test scrape with limit=2 on a known YouTube channel to verify cost and response shape
4. Document confirmed field names in the PR description before merging any code

Do not begin coding the YouTube branches until step 3 is complete.

---

## Overview

Add YouTube Shorts profile scraping to Viral Today and expand the Super Planning Canvas competitor analysis node to support Instagram, TikTok, and YouTube Shorts via a single unified `CompetitorProfileNode`. Platform is auto-detected from the pasted URL.

---

## Goals

1. Users can add YouTube Shorts channels to Viral Today (same flow as Instagram/TikTok)
2. YouTube channels are auto-scraped daily alongside Instagram/TikTok channels
3. The canvas `CompetitorProfileNode` supports all 3 platforms via URL auto-detection
4. TikTok competitor analysis is added to the canvas (previously Viral Today only)
5. The existing canvas → Viral Today fire-and-forget save flow is verified and hardened

---

## Apify Actors

| Platform | Actor | Used By |
|----------|-------|---------|
| Instagram (channel) | `apidojo~instagram-scraper` | scrape-channel, auto-scrape-channels |
| TikTok (channel) | `apidojo~tiktok-profile-scraper` | scrape-channel, auto-scrape-channels |
| YouTube Shorts (channel) | `igview-owner~youtube-shorts-scraper` | scrape-channel, auto-scrape-channels |
| Instagram (canvas top posts) | `apify~instagram-reel-scraper` | fetch-profile-top-posts |
| TikTok (canvas top posts) | `apidojo~tiktok-profile-scraper` | fetch-profile-top-posts |
| YouTube Shorts (canvas top posts) | `igview-owner~youtube-shorts-scraper` | fetch-profile-top-posts |

> **CRITICAL**: The exact Apify input field name that controls result limit for `igview-owner~youtube-shorts-scraper` must be verified before writing any code — using the wrong field name silently fetches unlimited results (repeat of the $60+ Instagram incident with `maxItems` vs `resultsLimit`). Verify by checking the actor's README at `https://apify.com/igview-owner/youtube-shorts-scraper` or running a test call with a small known limit and checking the run cost.

---

## Platform Detection

**Two independent implementations** (frontend and edge functions cannot share modules — Vite/React vs. Deno runtimes):

Both implement the same logic: `detectPlatform(url: string): "instagram" | "tiktok" | "youtube" | null`

- `instagram.com` → `"instagram"`
- `tiktok.com` → `"tiktok"`
- `youtube.com` or `youtu.be` → `"youtube"`
- No match → `null`

**YouTube URL variants** — all of these must be accepted:
- `youtube.com/@handle` — primary format
- `youtube.com/channel/UCxxxxxxxx` — channel ID format
- `youtube.com/c/customname` — legacy custom URL

**Rejected with user-facing error:**
- `youtube.com/shorts/VIDEO_ID` — single video URL, not a channel
- Any URL that doesn't match a known pattern

**`ViralToday.tsx`**: The existing `detectPlatformAndUsername()` function return type must be updated from `"instagram" | "tiktok"` to include `"youtube"`, plus a YouTube URL regex added.

---

## Database Changes

**No migration needed.** The `viral_channels.platform` CHECK constraint already includes `"youtube"`:
```sql
CHECK (platform IN ('instagram', 'tiktok', 'youtube'))
```

All edge functions must use the canonical string `"youtube"` (not `"youtube_shorts"` or anything else) — `viral_videos.platform` is unconstrained text so bad values would silently be stored and never match the platform filter.

---

## Edge Functions

### 1. `scrape-channel/index.ts` (modified)

Adds a `"youtube"` branch alongside existing `"instagram"` and `"tiktok"` branches.

**Actor input** (verify field names before coding):
```typescript
{
  startUrls: [{ url: channelUrl }],  // full URL (not username), passed directly
  maxResults: 100  // VERIFY: may be named differently — check actor README
}
```

**YouTube URL parsing**: Unlike Instagram/TikTok where `cleanUsername()` strips to a handle, YouTube channels are passed as full URLs to the actor. The `cleanUsername` logic must handle:
- `@handle` → `https://youtube.com/@handle`
- `youtube.com/@handle` → pass through
- `youtube.com/channel/UCxxx` → pass through
- `youtube.com/c/name` → pass through
- Single video URL → reject with error before calling Apify

**Output normalization** (verify exact field names from actor response):
```typescript
views_count    ← viewCount | statistics?.viewCount | 0
likes_count    ← likeCount | statistics?.likeCount | 0
comments_count ← commentCount | statistics?.commentCount | 0
thumbnail_url  ← thumbnails?.high?.url | thumbnails?.default?.url | null
video_url      ← `https://youtube.com/shorts/${videoId}`
apify_video_id ← videoId | id
posted_at      ← publishedAt (ISO string or convert from timestamp)
caption        ← title | description | snippet?.title | ""
platform       ← "youtube"  // canonical string, always
```

### 2. `auto-scrape-channels/index.ts` (modified)

Adds `platform === "youtube"` branch in the per-channel processing loop. Same delta/full pattern using verified limit field name (see note above).

**Timeout risk**: Adding YouTube channels increases the total channel count and batch count. Each batch waits up to 120s + 4 polls. If total YouTube+Instagram+TikTok channels exceed ~30, the 400s edge function wall-clock limit may be hit. **Mitigation**: process YouTube channels last in the loop — if timeout hits, Instagram and TikTok (most critical) have already been processed.

### 3. `fetch-profile-top-posts/index.ts` (new)

Replaces `fetch-instagram-top-posts` for canvas competitor analysis.

**Input:**
```typescript
{ profileUrl: string, limit?: number }  // limit defaults to 50
```

**Flow:**
1. Detect platform from `profileUrl`
2. Parse username/identifier from URL
3. Cache-first check — query `viral_channels` by `username` + `platform` (compound key — same handle can exist on multiple platforms):
   - Hit + `video_count >= 20`: return top 10 from `viral_videos` ORDER BY `views_count DESC LIMIT 10`
   - Hit + `video_count < 20`: proceed with Apify call to fill out data
   - Miss: proceed with Apify call
4. Call Apify with correct actor + input for detected platform
5. Normalize output to shared schema
6. Fire-and-forget save: upsert to `viral_channels` + `viral_videos` via `EdgeRuntime.waitUntil(savePromise)` — does not block the response
7. Return top 10 posts sorted by `views_count`

**Actor routing + input schemas:**
```typescript
// Instagram
actor: "apify~instagram-reel-scraper"
input: { username: [username], resultsLimit: limit }

// TikTok
actor: "apidojo~tiktok-profile-scraper"
input: { handles: [username], resultsPerPage: limit }

// YouTube
actor: "igview-owner~youtube-shorts-scraper"
input: { startUrls: [{ url: channelUrl }], maxResults: limit }  // VERIFY field name
```

**Backward compatibility**: `fetch-instagram-top-posts` stays deployed and untouched — existing canvas sessions that reference it continue to work.

---

## Frontend

### `CompetitorProfileNode.tsx` (new file)

Replaces `InstagramProfileNode.tsx`.

**UI layout:**
- Node title: "Competitor Profile"
- Three platform logo badges (Instagram / TikTok / YouTube icons) in a row — all dimmed on load, matching one highlights as user types URL
- URL input field below badges
- Unrecognized URL: subtle "Unsupported URL" hint below input
- "Fetch & Analyze" button calls `fetch-profile-top-posts`
- Everything else identical: top posts list left, AI analysis panel right, same `analyze-competitor-post` Claude step

### `SuperPlanningCanvas.tsx` (modified)

**Node type registration** — both types point to the same component:
```typescript
const nodeTypes = {
  competitorProfileNode: CompetitorProfileNode,
  instagramProfileNode: CompetitorProfileNode,  // alias for backward compat with saved sessions
  // ... other types
}
```

**AI context filter** — currently filters `n.type === "instagramProfileNode"`. Must be updated to:
```typescript
n.type === "instagramProfileNode" || n.type === "competitorProfileNode"
```

**Toolbar updates required:**
- `CanvasToolbar.tsx` `onAddNode` prop type union: add `"competitorProfileNode"`
- `addNode` callback union in `SuperPlanningCanvas.tsx`: add `"competitorProfileNode"`
- Toolbar button: add "Competitor Profile" button (or rename existing Instagram button)
- Initial node width map: add `competitorProfileNode` entry

### `ViralToday.tsx` (modified)

- Platform filter dropdown: add "YouTube" option
- `detectPlatformAndUsername()`: update return type to include `"youtube"`, add YouTube URL regex
- Video cards for YouTube: thumbnail at `i.ytimg.com` loads directly (no VPS proxy — YouTube thumbnails are public CDN with no hotlink protection, confirmed)
- External link for YouTube videos: `https://youtube.com/shorts/{videoId}`
- Platform badge: YouTube icon

---

## Verification Steps (during implementation)

1. Query `viral_videos` for any profile previously analyzed in the canvas — confirm fire-and-forget saves are landing. If gap found, fix in new `fetch-profile-top-posts`.
2. Check `igview-owner~youtube-shorts-scraper` actor README to verify exact input field names before coding.
3. Manual test: add a YouTube Shorts channel in Viral Today → confirm videos appear in the Videos tab.
4. Manual test: paste YouTube Shorts channel URL in canvas node → confirm platform badge lights up, top 10 posts load, AI analysis runs.
5. Manual test: paste old Instagram URL in canvas node (backward compat) → confirm nothing is broken.

---

## Files Changed

| File | Type | Change |
|------|------|--------|
| `supabase/functions/scrape-channel/index.ts` | Modified | Add YouTube Shorts branch + URL parsing |
| `supabase/functions/auto-scrape-channels/index.ts` | Modified | Add YouTube branch, process last for timeout safety |
| `supabase/functions/fetch-profile-top-posts/index.ts` | New | Unified platform router (replaces fetch-instagram-top-posts) |
| `src/components/canvas/CompetitorProfileNode.tsx` | New | Unified node with platform badges |
| `src/components/canvas/CanvasToolbar.tsx` | Modified | Add competitorProfileNode to type union + button |
| `src/pages/SuperPlanningCanvas.tsx` | Modified | Register both node types, update AI context filter, toolbar union |
| `src/pages/ViralToday.tsx` | Modified | YouTube in platform filter, detectPlatformAndUsername update |
