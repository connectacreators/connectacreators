# YouTube Shorts Scraper + Unified Competitor Analysis — Design Spec

**Date:** 2026-03-22
**Status:** Approved

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

---

## Platform Detection

Shared utility `detectPlatform(url: string): "instagram" | "tiktok" | "youtube" | null`:

- `instagram.com` → `"instagram"`
- `tiktok.com` → `"tiktok"`
- `youtube.com` or `youtu.be` → `"youtube"`
- No match → `null` (triggers "Unsupported URL" hint in UI)

Used in both frontend (immediate visual feedback as user types) and edge functions (routing logic).

---

## Database Changes

### Migration: `supabase/migrations/20260322_add_youtube_platform.sql`

Add `"youtube"` to the `platform` CHECK constraint on `viral_channels`. No other schema changes — `viral_videos` already has all necessary columns.

---

## Edge Functions

### 1. `scrape-channel/index.ts` (modified)

Adds a `"youtube"` branch alongside the existing `"instagram"` and `"tiktok"` branches.

- Actor: `igview-owner~youtube-shorts-scraper`
- Input: `{ startUrls: [{ url: channelUrl }], maxResults: 100 }`
- Output normalization (YouTube Shorts → viral_videos schema):
  - `views_count` ← `viewCount` or `statistics.viewCount`
  - `likes_count` ← `likeCount` or `statistics.likeCount`
  - `thumbnail_url` ← `thumbnails.high.url` (public CDN, no proxy needed)
  - `video_url` ← `https://youtube.com/shorts/{videoId}`
  - `apify_video_id` ← `videoId`
  - `posted_at` ← `publishedAt`

### 2. `auto-scrape-channels/index.ts` (modified)

Adds `platform === "youtube"` branch in the per-channel processing loop. Uses same delta/full mode pattern:
- Delta: `maxResults: 7`
- Full: `maxResults: 100`

### 3. `fetch-profile-top-posts/index.ts` (new — replaces `fetch-instagram-top-posts`)

Unified edge function for canvas competitor analysis.

**Input:**
```typescript
{ profileUrl: string, limit?: number }  // limit defaults to 50
```

**Flow:**
1. Detect platform from `profileUrl`
2. Cache-first: check `viral_channels` for matching username + platform with `scrape_status: "done"`
   - Cache hit + `video_count >= 20`: return top 10 from `viral_videos` sorted by `views_count` immediately
   - Cache hit + `video_count < 20`: trigger background re-scrape with `maxResults: 100`, then return what's available
   - Cache miss: call Apify, wait 30s + polling
3. Normalize output to shared schema (same field mappings as above)
4. Fire-and-forget save: upsert channel + all videos to `viral_channels` / `viral_videos`
5. Return top 10 posts sorted by `views_count`

**Actor routing:**
- `"instagram"` → `apify~instagram-reel-scraper`
- `"tiktok"` → `apidojo~tiktok-profile-scraper`
- `"youtube"` → `igview-owner~youtube-shorts-scraper`

**Backward compatibility:** `fetch-instagram-top-posts` stays deployed and untouched — old canvas sessions that reference it continue to work.

---

## Frontend

### `CompetitorProfileNode.tsx` (new file, replaces `InstagramProfileNode.tsx`)

**UI changes:**
- Node title: "Competitor Profile" (was "Instagram Profile")
- URL input field with platform logo badges (Instagram / TikTok / YouTube) — grayed out until detected, matching one lights up as user types
- Unrecognized URL shows subtle "Unsupported URL" hint below input
- "Fetch & Analyze" calls `fetch-profile-top-posts` (new function)
- Everything else unchanged: top posts list left, AI analysis panel right, same `analyze-competitor-post` Claude step

**Platform logo badges:**
- Three small icons in a row next to the input (or above it)
- Active platform badge highlighted, others dimmed

### `SuperPlanningCanvas.tsx` (modified)

- Register `CompetitorProfileNode` as the node type for `competitorProfile`
- Also register `instagramProfile` type pointing to the same `CompetitorProfileNode` component — backwards compatibility for saved canvas sessions

### `ViralToday.tsx` (modified)

- Platform filter dropdown: add "YouTube" option alongside Instagram and TikTok
- Video cards for YouTube: thumbnail loads directly (no VPS proxy), external link goes to `youtube.com/shorts/{videoId}`, platform badge shows YouTube icon
- Channels tab: YouTube channels appear in the list with YouTube platform badge

---

## Verification Plan

As part of implementation:
1. Query `viral_videos` for any profile that's been analyzed in the canvas to confirm fire-and-forget saves are landing correctly
2. If gap found (canvas analyzed but no videos in DB), fix the fire-and-forget logic in `fetch-profile-top-posts`
3. Manual test: add a YouTube Shorts channel in Viral Today → confirm videos appear
4. Manual test: paste a YouTube Shorts URL in canvas node → confirm top 10 posts load + AI analysis runs

---

## Files Changed

| File | Type | Change |
|------|------|--------|
| `supabase/migrations/20260322_add_youtube_platform.sql` | New | Add "youtube" to platform constraint |
| `supabase/functions/scrape-channel/index.ts` | Modified | Add YouTube Shorts branch |
| `supabase/functions/auto-scrape-channels/index.ts` | Modified | Add YouTube branch in processing loop |
| `supabase/functions/fetch-profile-top-posts/index.ts` | New | Unified platform router (replaces fetch-instagram-top-posts) |
| `src/components/canvas/CompetitorProfileNode.tsx` | New | Unified node (replaces InstagramProfileNode) |
| `src/pages/SuperPlanningCanvas.tsx` | Modified | Register new node type + alias old type |
| `src/pages/ViralToday.tsx` | Modified | YouTube platform filter + video card support |
