# YouTube Shorts Scraper + Unified Competitor Analysis — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add YouTube Shorts profile scraping to Viral Today and upgrade the canvas competitor analysis node to support Instagram, TikTok, and YouTube Shorts with URL-based platform auto-detection.

**Architecture:** New `fetch-profile-top-posts` edge function unifies all three platforms with a platform router. `CompetitorProfileNode` replaces `InstagramProfileNode` on the canvas. `scrape-channel` and `auto-scrape-channels` gain a YouTube branch. Backwards compatibility maintained via node type alias.

**Tech Stack:** Deno/TypeScript (Supabase edge functions), React + Vite, React Flow, Apify API, Supabase (viral_channels + viral_videos tables)

**Spec:** `docs/superpowers/specs/2026-03-22-youtube-shorts-scraper-design.md`

---

## ✅ PREREQUISITE: YouTube Actor Schema — CONFIRMED

Test run completed 2026-03-23. All field names are confirmed. No need to verify again.

**Actor:** `igview-owner~youtube-shorts-scraper`

**Confirmed input format:**
```json
{ "channelUrl": "https://youtube.com/@handle", "maxResults": 2 }
```
- Use `channelUrl` (single string, NOT `startUrls` array)
- Use `maxResults` for the limit

**Confirmed output item shape** (`itemType: "short"`):
```json
{
  "itemType": "short",
  "videoId": "94w6q1SWX0M",
  "title": "video title / caption",
  "viewCountText": "3.5K views",
  "thumbnail": "https://i.ytimg.com/vi/ID/frame0.jpg",
  "thumbnails": [{"url": "...", "width": 1080, "height": 1920}],
  "shortUrl": "https://www.youtube.com/shorts/94w6q1SWX0M",
  "channelId": "UCxxx",
  "channelTitle": "YouTube",
  "channelHandle": "@YouTube"
}
```

**Critical notes for implementation:**
1. First dataset item is `channel_metadata` — filter to only `item.itemType === "short"`
2. **No numeric viewCount** — only `viewCountText` string (e.g., "3.5K views", "1.2M views"). Must parse it.
3. **No likeCount, commentCount, publishedAt** — set these to 0 / null
4. Use `shortUrl` for `video_url`, `thumbnail` for `thumbnail_url`, `videoId` for `apify_video_id`, `title` for `caption`
5. Thumbnail URLs are public `i.ytimg.com` CDN — no proxy needed

**viewCountText parser function** (add to all YouTube-using edge functions):
```typescript
function parseYouTubeViewCount(text: string | undefined): number {
  if (!text) return 0;
  const clean = text.replace(/[^0-9.KMBkmb]/g, "").toUpperCase();
  if (clean.endsWith("B")) return Math.round(parseFloat(clean) * 1_000_000_000);
  if (clean.endsWith("M")) return Math.round(parseFloat(clean) * 1_000_000);
  if (clean.endsWith("K")) return Math.round(parseFloat(clean) * 1_000);
  return parseInt(clean) || 0;
}
```

---

## Task 1: New edge function — `fetch-profile-top-posts`

**Files:**
- Create: `supabase/functions/fetch-profile-top-posts/index.ts`

This replaces `fetch-instagram-top-posts` for canvas competitor analysis. It routes to the correct Apify actor based on URL detection, normalizes output, and fire-and-forgets saves to the vault.

- [ ] **Step 1: Create the file**

```typescript
// supabase/functions/fetch-profile-top-posts/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APIFY_TOKEN = "apify_api_XcMx5KAjTPY1wBow3wgTaA3Y4wdiwL0MbbI2";
const APIFY_ACTOR_INSTAGRAM = "apify~instagram-reel-scraper";
const APIFY_ACTOR_TIKTOK = "apidojo~tiktok-profile-scraper";
const APIFY_ACTOR_YOUTUBE = "igview-owner~youtube-shorts-scraper";

// HARD CAP: never fetch more than 100 posts per call.
const MAX_RESULTS = 100;

type Platform = "instagram" | "tiktok" | "youtube";

// ── Platform detection ────────────────────────────────────────────────────────
function detectPlatform(url: string): Platform | null {
  const s = url.toLowerCase();
  if (s.includes("instagram.com")) return "instagram";
  if (s.includes("tiktok.com")) return "tiktok";
  if (s.includes("youtube.com") || s.includes("youtu.be")) return "youtube";
  return null;
}

// ── Username extraction ───────────────────────────────────────────────────────
function parseIdentifier(profileUrl: string, platform: Platform): { username: string; fullUrl: string } {
  const s = profileUrl.trim();

  if (platform === "instagram") {
    let u = s.replace(/^https?:\/\/(www\.)?/, "").replace(/^instagram\.com\//, "").replace(/^@/, "");
    u = u.split(/[/?#]/)[0].toLowerCase();
    return { username: u, fullUrl: `https://www.instagram.com/${u}/` };
  }

  if (platform === "tiktok") {
    const match = s.match(/tiktok\.com\/@?([^/?#\s]+)/i);
    const u = match ? match[1].replace(/\/$/, "").toLowerCase() : s.replace(/^@/, "").trim().toLowerCase();
    return { username: u, fullUrl: `https://www.tiktok.com/@${u}` };
  }

  // YouTube: handle @handle, /channel/UCxxx, /c/customname — pass full URL to actor
  const handleMatch = s.match(/youtube\.com\/@([^/?#\s]+)/i);
  const customMatch = s.match(/youtube\.com\/c\/([^/?#\s]+)/i);
  const channelMatch = s.match(/youtube\.com\/channel\/([^/?#\s]+)/i);

  if (handleMatch) {
    const u = handleMatch[1].replace(/\/$/, "");
    return { username: u, fullUrl: `https://youtube.com/@${u}` };
  }
  if (customMatch) {
    const u = customMatch[1].replace(/\/$/, "");
    return { username: u, fullUrl: `https://youtube.com/c/${u}` };
  }
  if (channelMatch) {
    const u = channelMatch[1].replace(/\/$/, "");
    return { username: u, fullUrl: `https://youtube.com/channel/${u}` };
  }

  // Bare @handle fallback
  const bare = s.replace(/^@/, "").trim();
  return { username: bare, fullUrl: `https://youtube.com/@${bare}` };
}

// ── Build Apify actor input per platform ─────────────────────────────────────
function buildActorInput(platform: Platform, username: string, fullUrl: string, limit: number): { actorId: string; input: Record<string, unknown> } {
  const safeLimit = Math.min(limit, MAX_RESULTS);

  if (platform === "instagram") {
    return {
      actorId: APIFY_ACTOR_INSTAGRAM,
      input: { username: [username], resultsLimit: safeLimit },
    };
  }

  if (platform === "tiktok") {
    return {
      actorId: APIFY_ACTOR_TIKTOK,
      input: {
        handles: [username],
        startUrls: [{ url: fullUrl }],
        resultsPerPage: safeLimit,
        shouldDownloadVideos: false,
        shouldDownloadCovers: false,
      },
    };
  }

  // YouTube — confirmed: input is channelUrl (string) + maxResults (number)
  return {
    actorId: APIFY_ACTOR_YOUTUBE,
    input: { channelUrl: fullUrl, maxResults: safeLimit },
  };
}

// ── Normalize a raw Apify item to a common shape ──────────────────────────────
function normalizeItem(item: any, platform: Platform, username: string) {
  let views = 0;
  let likes = 0;
  let comments = 0;
  let videoId = "";
  let caption = "";
  let thumbnail: string | null = null;
  let postedAt = "";
  let url = "";

  if (platform === "instagram") {
    views = item.videoPlayCount ?? item.videoViewCount ?? item.playsCount ?? item.playCount ?? item.viewCount ?? 0;
    likes = item.likesCount ?? item.diggCount ?? item.likes ?? 0;
    comments = item.commentsCount ?? item.commentCount ?? item.comments ?? 0;
    videoId = item.shortCode ?? item.id ?? item.pk ?? "";
    caption = (item.caption ?? item.captionText ?? item.text ?? "").slice(0, 600);
    thumbnail = item.displayUrl ?? item.thumbnailUrl ?? item.coverUrl ?? null;
    postedAt = parseTimestamp(item.timestamp ?? item.taken_at_timestamp);
    url = item.shortCode ? `https://www.instagram.com/reel/${item.shortCode}/` : item.id ? `https://www.instagram.com/p/${item.id}/` : "";
  }

  if (platform === "tiktok") {
    views = item.video?.playCount ?? item.videoViewCount ?? item.playsCount ?? item.plays ?? item.viewCount ?? 0;
    likes = item.likeCount ?? item.likesCount ?? item.diggCount ?? 0;
    comments = item.commentCount ?? item.commentsCount ?? 0;
    videoId = item.id ?? item.aweme_id ?? "";
    caption = (item.caption ?? item.desc ?? item.text ?? "").slice(0, 600);
    thumbnail = item.coverUrl ?? item.cover ?? item.thumbnailUrl ?? (typeof item.image === "object" ? item.image?.url : item.image) ?? null;
    postedAt = parseTimestamp(item.createTime ?? item.create_time ?? item.createdAt);
    url = item.webVideoUrl ?? item.url ?? (videoId ? `https://www.tiktok.com/@${username}/video/${videoId}` : "");
  }

  if (platform === "youtube") {
    // Actor returns itemType: "short" for videos, "channel_metadata" for the first item
    // viewCountText is a string like "3.5K views" — no numeric viewCount field
    views = parseYouTubeViewCount(item.viewCountText);
    likes = 0;    // actor does not return like count
    comments = 0; // actor does not return comment count
    videoId = item.videoId ?? item.id ?? "";
    caption = (item.title ?? "").slice(0, 600);
    thumbnail = item.thumbnail ?? item.thumbnails?.[0]?.url ?? null;
    postedAt = ""; // actor does not return publish date
    url = item.shortUrl ?? (videoId ? `https://www.youtube.com/shorts/${videoId}` : "");
  }

  const engagement = views > 0 ? ((likes + comments) / views) * 100 : 0;

  return { views: Number(views) || 0, likes: Number(likes) || 0, comments: Number(comments) || 0, videoId: String(videoId), caption, thumbnail, postedAt, url, engagement };
}

// Parses YouTube viewCountText like "3.5K views", "1.2M views" to a number
function parseYouTubeViewCount(text: string | undefined): number {
  if (!text) return 0;
  const clean = text.replace(/[^0-9.KMBkmb]/g, "").toUpperCase();
  if (clean.endsWith("B")) return Math.round(parseFloat(clean) * 1_000_000_000);
  if (clean.endsWith("M")) return Math.round(parseFloat(clean) * 1_000_000);
  if (clean.endsWith("K")) return Math.round(parseFloat(clean) * 1_000);
  return parseInt(clean) || 0;
}

function parseTimestamp(raw: any): string {
  if (!raw) return "";
  if (typeof raw === "number") {
    const ms = raw < 1e10 ? raw * 1000 : raw;
    return new Date(ms).toISOString();
  }
  if (typeof raw === "string") {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return "";
}

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

// ── Save all scraped posts to the vault (viral_channels + viral_videos) ───────
async function saveToVault(supabase: any, username: string, platform: Platform, items: ReturnType<typeof normalizeItem>[], avgViews: number) {
  try {
    const { data: channelRow, error: chErr } = await supabase
      .from("viral_channels")
      .upsert(
        { username, platform, avg_views: Math.round(avgViews), video_count: items.length, scrape_status: "done", last_scraped_at: new Date().toISOString() },
        { onConflict: "username,platform" }
      )
      .select("id")
      .single();

    if (chErr || !channelRow?.id) {
      console.error("[fetch-profile-top-posts] channel upsert failed:", chErr?.message);
      return;
    }

    const videoRows = items
      .filter((p) => p.videoId)
      .map((p) => ({
        channel_id: channelRow.id,
        channel_username: username,
        platform,
        video_url: p.url,
        thumbnail_url: p.thumbnail,
        caption: p.caption,
        views_count: p.views,
        likes_count: p.likes,
        comments_count: p.comments,
        engagement_rate: parseFloat(p.engagement.toFixed(2)),
        outlier_score: parseFloat((avgViews > 0 ? (p.views / avgViews) * 10 : 1).toFixed(2)),
        posted_at: p.postedAt || null,
        scraped_at: new Date().toISOString(),
        apify_video_id: p.videoId,
      }));

    if (videoRows.length === 0) return;

    const { error: vErr } = await supabase
      .from("viral_videos")
      .upsert(videoRows, { onConflict: "platform,apify_video_id", ignoreDuplicates: false });

    if (vErr) console.error("[fetch-profile-top-posts] videos upsert failed:", vErr.message);
    else console.log(`[fetch-profile-top-posts] saved ${videoRows.length} videos for @${username} (${platform})`);
  } catch (e: any) {
    console.error("[fetch-profile-top-posts] saveToVault error:", e.message);
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { profileUrl, limit = 50 } = await req.json();
    if (!profileUrl) return json({ error: "profileUrl is required" }, 400);

    const platform = detectPlatform(profileUrl);
    if (!platform) return json({ error: "Unsupported platform — paste an Instagram, TikTok, or YouTube channel URL" }, 400);

    // Reject single YouTube video URLs
    if (platform === "youtube" && profileUrl.includes("youtube.com/shorts/") && !profileUrl.includes("@")) {
      return json({ error: "Paste a YouTube channel URL, not a single video URL" }, 400);
    }

    const { username, fullUrl } = parseIdentifier(profileUrl, platform);
    if (!username) return json({ error: "Could not parse username from URL" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ── 1. Cache check (by username + platform compound key) ─────────────────
    console.log(`[fetch-profile-top-posts] checking vault for @${username} (${platform})`);
    const { data: channelRow } = await supabase
      .from("viral_channels")
      .select("id, avg_views, video_count")
      .eq("username", username)
      .eq("platform", platform)
      .eq("scrape_status", "done")
      .maybeSingle();

    if (channelRow?.id && (channelRow.video_count ?? 0) >= 20) {
      const { data: vaultVideos } = await supabase
        .from("viral_videos")
        .select("video_url, caption, views_count, likes_count, comments_count, engagement_rate, outlier_score, posted_at, thumbnail_url")
        .eq("channel_id", channelRow.id)
        .gt("views_count", 0)
        .order("views_count", { ascending: false })
        .limit(10);

      if (vaultVideos && vaultVideos.length > 0) {
        console.log(`[fetch-profile-top-posts] cache hit — ${vaultVideos.length} posts from vault for @${username}`);
        return json({
          posts: vaultVideos.map((v: any, i: number) => ({
            rank: i + 1, caption: v.caption, views: v.views_count, viewsFormatted: formatViews(v.views_count),
            likes: v.likes_count, comments: v.comments_count, engagement_rate: v.engagement_rate,
            outlier_score: v.outlier_score, posted_at: v.posted_at, url: v.video_url, thumbnail: v.thumbnail_url,
          })),
          username, platform, fromVault: true,
        });
      }
    }

    // ── 2. Cache miss (or < 20 videos) — call Apify ──────────────────────────
    console.log(`[fetch-profile-top-posts] cache miss — fetching from Apify for @${username} (${platform})`);
    const { actorId, input } = buildActorInput(platform, username, fullUrl, limit);

    const runRes = await fetch(
      `https://api.apify.com/v2/acts/${actorId}/runs?token=${APIFY_TOKEN}&waitForFinish=30`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }
    );

    if (!runRes.ok) {
      const errText = await runRes.text();
      throw new Error(`Apify run failed: ${runRes.status} ${errText.slice(0, 200)}`);
    }

    const runData = await runRes.json();
    let runStatus = runData?.data?.status ?? "UNKNOWN";
    let datasetId = runData?.data?.defaultDatasetId ?? null;
    const runId = runData?.data?.id ?? null;

    if (runStatus === "RUNNING" && runId) {
      await new Promise(r => setTimeout(r, 15000));
      const pollRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`);
      if (pollRes.ok) {
        const p = await pollRes.json();
        runStatus = p?.data?.status ?? runStatus;
        datasetId = p?.data?.defaultDatasetId ?? datasetId;
      }
    }

    // Note: waitForFinish=30 + 15s poll = 45s max wait. YouTube actor timing is unknown;
    // if posts come back empty, the actor may still be running. The canvas node shows a
    // 30s loading message — this is acceptable for a first fetch. Cache hits will be instant.
    if (!datasetId) throw new Error("No dataset ID from Apify");

    const itemsRes = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&limit=${limit}`);
    if (!itemsRes.ok) throw new Error(`Dataset fetch failed: ${itemsRes.status}`);

    const rawItems: any[] = await itemsRes.json();
    console.log(`[fetch-profile-top-posts] got ${rawItems.length} raw items (${platform})`);

    // YouTube actor returns a "channel_metadata" item first — filter to only video items
    const videoItems = platform === "youtube"
      ? rawItems.filter(item => item.itemType === "short")
      : rawItems;

    const normalized = videoItems
      .map(item => normalizeItem(item, platform, username))
      .filter(p => p.videoId); // YouTube videos may have 0 views (very new shorts)

    if (normalized.length === 0) {
      return json({ posts: [], username, platform, message: "No posts found for this profile" });
    }

    const avgViews = normalized.reduce((s, p) => s + p.views, 0) / normalized.length;

    // ── 3. Save all to vault (fire-and-forget) ────────────────────────────────
    saveToVault(supabase, username, platform, normalized, avgViews);

    const sorted = [...normalized].sort((a, b) => b.views - a.views).slice(0, 10);

    return json({
      posts: sorted.map((p, i) => ({
        rank: i + 1, caption: p.caption, views: p.views, viewsFormatted: formatViews(p.views),
        likes: p.likes, comments: p.comments,
        engagement_rate: parseFloat(p.engagement.toFixed(2)),
        outlier_score: parseFloat((p.views / avgViews * 10).toFixed(1)),
        posted_at: p.postedAt, url: p.url, thumbnail: p.thumbnail,
        platform,
      })),
      username, platform,
    });

  } catch (e: any) {
    console.error("[fetch-profile-top-posts] error:", e);
    return json({ error: e.message || "Unknown error" }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/fetch-profile-top-posts/index.ts
git commit -m "feat: add fetch-profile-top-posts edge function (unified Instagram/TikTok/YouTube router)"
```

---

## Task 2: Update `scrape-channel` — add YouTube Shorts branch

**Files:**
- Modify: `supabase/functions/scrape-channel/index.ts`

- [ ] **Step 1: Add YouTube actor constant at line 11**

Find:
```typescript
const APIFY_ACTOR_TIKTOK = "apidojo~tiktok-profile-scraper";
```

Replace with:
```typescript
const APIFY_ACTOR_TIKTOK = "apidojo~tiktok-profile-scraper";
const APIFY_ACTOR_YOUTUBE = "igview-owner~youtube-shorts-scraper";
```

- [ ] **Step 2: Update `getActorId` (line 13)**

Find:
```typescript
function getActorId(platform: string) {
  return platform === "tiktok" ? APIFY_ACTOR_TIKTOK : APIFY_ACTOR_INSTAGRAM;
}
```

Replace with:
```typescript
function getActorId(platform: string) {
  if (platform === "tiktok") return APIFY_ACTOR_TIKTOK;
  if (platform === "youtube") return APIFY_ACTOR_YOUTUBE;
  return APIFY_ACTOR_INSTAGRAM;
}
```

- [ ] **Step 3: Update `buildApifyInput` — add YouTube branch (line 22)**

Find the end of `buildApifyInput` — the `return { startUrls: ..., maxItems: safeLimit }` block. Replace the entire function with:

```typescript
function buildApifyInput(platform: string, username: string, resultsLimit: number) {
  const safeLimit = Math.min(resultsLimit, MAX_RESULTS_PER_CHANNEL);
  if (platform === "tiktok") {
    return {
      handles: [username],
      startUrls: [{ url: `https://www.tiktok.com/@${username}` }],
      resultsPerPage: safeLimit,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
    };
  }
  if (platform === "youtube") {
    // Confirmed: channelUrl (string) + maxResults — NOT startUrls array
    const youtubeUrl = username.startsWith("http") ? username : `https://youtube.com/@${username}`;
    return {
      channelUrl: youtubeUrl,
      maxResults: safeLimit,
    };
  }
  // apidojo~instagram-scraper: maxItems is the actual limit field
  // (resultsLimit is silently ignored by this actor — must use maxItems)
  return {
    startUrls: [`https://www.instagram.com/${username}/`],
    maxItems: safeLimit,
  };
}
```

- [ ] **Step 4: Update `cleanUsername` URL parsing — add YouTube (line 90)**

Find:
```typescript
const tiktokMatch = username.match(/tiktok\.com\/@?([^/?#\s]+)/i);
const instaMatch = username.match(/instagram\.com\/([^/?#\s]+)/i);
const cleanUsername = tiktokMatch
  ? tiktokMatch[1].replace(/\/$/, "").toLowerCase()
  : instaMatch
    ? instaMatch[1].replace(/\/$/, "").toLowerCase()
    : username.replace(/^@/, "").trim().toLowerCase();
```

Replace with:
```typescript
const tiktokMatch = username.match(/tiktok\.com\/@?([^/?#\s]+)/i);
const instaMatch = username.match(/instagram\.com\/([^/?#\s]+)/i);
const ytHandleMatch = username.match(/youtube\.com\/@([^/?#\s]+)/i);
const ytCustomMatch = username.match(/youtube\.com\/c\/([^/?#\s]+)/i);
const ytChannelMatch = username.match(/youtube\.com\/channel\/([^/?#\s]+)/i);

// Reject single YouTube video URLs before calling Apify
if (platform === "youtube" && username.includes("youtube.com/shorts/") && !ytHandleMatch && !ytCustomMatch && !ytChannelMatch) {
  await supabase.from("viral_channels").update({ scrape_status: "error", scrape_error: "Paste a YouTube channel URL, not a single video URL" }).eq("id", channelId);
  return json({ error: "Paste a YouTube channel URL, not a single video URL" }, 400);
}

// For YouTube, store the clean handle/ID; pass the full URL to buildApifyInput
const cleanUsername =
  tiktokMatch ? tiktokMatch[1].replace(/\/$/, "").toLowerCase()
  : instaMatch ? instaMatch[1].replace(/\/$/, "").toLowerCase()
  : ytHandleMatch ? ytHandleMatch[1].replace(/\/$/, "")
  : ytCustomMatch ? ytCustomMatch[1].replace(/\/$/, "")
  : ytChannelMatch ? ytChannelMatch[1].replace(/\/$/, "")
  : username.replace(/^@/, "").trim();

// For YouTube, also build the canonical full URL to pass to buildApifyInput
const youtubeFullUrl =
  ytHandleMatch ? `https://youtube.com/@${cleanUsername}`
  : ytCustomMatch ? `https://youtube.com/c/${cleanUsername}`
  : ytChannelMatch ? `https://youtube.com/channel/${cleanUsername}`
  : `https://youtube.com/@${cleanUsername}`;

// Pass full URL as "username" for youtube (buildApifyInput checks startsWith("http"))
const apifyUsername = platform === "youtube" ? youtubeFullUrl : cleanUsername;
```

Then in the `buildApifyInput` call (line 112), change `cleanUsername` to `apifyUsername`:
```typescript
body: JSON.stringify(buildApifyInput(platform, apifyUsername, 7)),
```

And in `processDataset` call (line 138):
```typescript
const count = await processDataset(supabase, channelId, cleanUsername, platform, datasetId);
```
(Keep using `cleanUsername` here — this is what gets stored in `channel_username` in viral_videos)

- [ ] **Step 5: Update `processDataset` — add YouTube field normalization**

In `processDataset`, the item mapping block handles Instagram + TikTok fields. Add YouTube field handling to the existing fallback chain:

**First, add `parseYouTubeViewCount` helper at the top of the file** (after the constants):
```typescript
function parseYouTubeViewCount(text: string | undefined): number {
  if (!text) return 0;
  const clean = text.replace(/[^0-9.KMBkmb]/g, "").toUpperCase();
  if (clean.endsWith("B")) return Math.round(parseFloat(clean) * 1_000_000_000);
  if (clean.endsWith("M")) return Math.round(parseFloat(clean) * 1_000_000);
  if (clean.endsWith("K")) return Math.round(parseFloat(clean) * 1_000);
  return parseInt(clean) || 0;
}
```

Then update the `views` line (line 187). YouTube uses `viewCountText` (string), not a numeric field:
```typescript
const views =
  (platform === "youtube" ? parseYouTubeViewCount(item.viewCountText) : null) ??
  item.video?.playCount ??
  item.videoViewCount ??
  item.videoPlayCount ??
  item.playsCount ??
  item.plays ??
  item.viewCount ??
  0;

const likes = item.likeCount ?? item.likesCount ?? item.diggCount ?? item.likes ?? 0;
const comments = item.commentCount ?? item.commentsCount ?? item.comments ?? 0;
```

For `videoId` (line 202), add YouTube field:
```typescript
const videoId =
  item.videoId ??                // YouTube
  item.code ??
  item.shortCode ??
  item.id ??
  item.pk ??
  item.aweme_id ??
  null;
```

For `thumbnailUrl` (line 211) — YouTube actor returns `thumbnail` (string) and `thumbnails` (array):
```typescript
const thumbnailUrl =
  item.thumbnail ??              // YouTube Shorts (direct string URL)
  item.thumbnails?.[0]?.url ??   // YouTube Shorts array fallback
  (typeof item.image === "object" ? item.image?.url : item.image) ??
  item.displayUrl ??
  item.thumbnailUrl ??
  item.coverUrl ??
  item.cover ??
  item.previewUrl ??
  null;
```

For `videoUrl` (line 222), YouTube actor returns `shortUrl` directly:
```typescript
const videoUrl =
  item.shortUrl ??               // YouTube Shorts (full URL already provided)
  (platform === "youtube" && (item.videoId ?? item.id)
    ? `https://www.youtube.com/shorts/${item.videoId ?? item.id}`
    : null) ??
  item.url ??
  item.webVideoUrl ??
  (item.code ? `https://www.instagram.com/p/${item.code}/` : null) ??
  (item.shortCode ? `https://www.instagram.com/reel/${item.shortCode}/` : null) ??
  (platform === "tiktok" && (item.id ?? item.aweme_id)
    ? `https://www.tiktok.com/@${username}/video/${item.id ?? item.aweme_id}`
    : null) ??
  null;
```

For `caption` (line 248), add YouTube title:
```typescript
const caption = (
  item.title ??                  // YouTube Shorts
  item.caption ??
  item.captionText ??
  item.text ??
  item.desc ??
  ""
).slice(0, 600);
```

For `rawTs` (line 238) — YouTube actor does NOT return publish dates, so leave the existing fallback chain as-is (it will just return null for YouTube items, which is fine):
```typescript
const rawTs = item.createdAt ?? item.timestamp ?? item.taken_at_timestamp ?? item.createTime ?? item.create_time;
// Note: YouTube actor does not return publishedAt — posted_at will be null for YouTube Shorts
```

**Also add this before the `videos` array processing** in `processDataset` (after line 183, before the `.map()`):
```typescript
// YouTube actor: filter to only short items (first item is channel_metadata)
const processItems = platform === "youtube"
  ? items.filter((item: any) => item.itemType === "short")
  : items;
```
Then use `processItems` instead of `items` in the `.map()` call.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/scrape-channel/index.ts
git commit -m "feat: add YouTube Shorts branch to scrape-channel edge function"
```

---

## Task 3: Update `auto-scrape-channels` — add YouTube Shorts

**Files:**
- Modify: `supabase/functions/auto-scrape-channels/index.ts`

- [ ] **Step 1: Add YouTube actor constant (line 11)**

Find:
```typescript
const APIFY_ACTOR_TIKTOK = "apidojo~tiktok-profile-scraper";
```

Replace with:
```typescript
const APIFY_ACTOR_TIKTOK = "apidojo~tiktok-profile-scraper";
const APIFY_ACTOR_YOUTUBE = "igview-owner~youtube-shorts-scraper";
```

- [ ] **Step 2: Update `getActorId` (line 18)**

Find:
```typescript
function getActorId(platform: string) {
  return platform === "tiktok" ? APIFY_ACTOR_TIKTOK : APIFY_ACTOR_INSTAGRAM;
}
```

Replace with:
```typescript
function getActorId(platform: string) {
  if (platform === "tiktok") return APIFY_ACTOR_TIKTOK;
  if (platform === "youtube") return APIFY_ACTOR_YOUTUBE;
  return APIFY_ACTOR_INSTAGRAM;
}
```

- [ ] **Step 3: Update `buildApifyInput` — add YouTube branch (line 27)**

Find the Instagram return at the end of `buildApifyInput`. Add the YouTube branch before it:

```typescript
function buildApifyInput(platform: string, username: string, resultsLimit: number) {
  const safeLimit = Math.min(resultsLimit, MAX_RESULTS_PER_CHANNEL);
  if (platform === "tiktok") {
    return {
      handles: [username],
      startUrls: [{ url: `https://www.tiktok.com/@${username}` }],
      resultsPerPage: safeLimit,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
    };
  }
  if (platform === "youtube") {
    // username is stored clean identifier (handle or channel ID)
    // Confirmed input: channelUrl (string) + maxResults (number)
    const youtubeUrl = username.startsWith("UC")
      ? `https://youtube.com/channel/${username}`
      : `https://youtube.com/@${username}`;
    return {
      channelUrl: youtubeUrl,
      maxResults: safeLimit,
    };
  }
  return {
    startUrls: [`https://www.instagram.com/${username}/`],
    maxItems: safeLimit,
  };
}
```

- [ ] **Step 4: Sort YouTube channels to process last (timeout safety)**

In the main handler, find where channels are fetched from the DB. After fetching all channels, sort them so YouTube channels are last:

```typescript
// Process YouTube channels last — if 400s wall-clock limit is hit, Instagram/TikTok are already done
const sortedChannels = [
  ...channels.filter((c: any) => c.platform !== "youtube"),
  ...channels.filter((c: any) => c.platform === "youtube"),
];
```

Then use `sortedChannels` instead of `channels` in the batch processing loop.

- [ ] **Step 5: Update item mapping in `processChannel()` in auto-scrape-channels**

Note: `auto-scrape-channels/index.ts` does NOT have a `processDataset()` function. The field mapping is inlined inside `processChannel()` starting around line 117. Apply the same YouTube field additions there — same fields as Task 2 Step 5: add `item.viewCount`, `item.videoId`, `item.thumbnails?.high?.url`, `item.title`, `item.publishedAt`, and YouTube video URL construction (`https://youtube.com/shorts/${videoId}`) to the respective fallback chains.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/auto-scrape-channels/index.ts
git commit -m "feat: add YouTube Shorts to auto-scrape-channels daily cron"
```

---

## Task 4: Create `CompetitorProfileNode.tsx`

**Files:**
- Create: `src/components/canvas/CompetitorProfileNode.tsx`

This replaces `InstagramProfileNode.tsx`. It adds platform auto-detection, three platform badge icons, and calls `fetch-profile-top-posts`.

- [ ] **Step 1: Create the file**

```tsx
// src/components/canvas/CompetitorProfileNode.tsx
import { useState, useCallback } from "react";
import { Handle, Position } from "@xyflow/react";
import { Loader2, UserSearch, ExternalLink, ChevronRight, X, Youtube } from "lucide-react";
import { Instagram } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// TikTok icon (lucide-react has no TikTok icon — use inline SVG)
function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.28 6.28 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z"/>
    </svg>
  );
}

type Platform = "instagram" | "tiktok" | "youtube" | null;

function detectPlatform(url: string): Platform {
  const s = url.toLowerCase();
  if (s.includes("instagram.com")) return "instagram";
  if (s.includes("tiktok.com")) return "tiktok";
  if (s.includes("youtube.com") || s.includes("youtu.be")) return "youtube";
  return null;
}

interface CompetitorPost {
  rank: number;
  caption: string;
  views: number;
  viewsFormatted: string;
  likes: number;
  comments: number;
  engagement_rate: number;
  outlier_score: number;
  posted_at: string;
  url: string;
  thumbnail?: string | null;
  platform?: string;
  hookType?: string;
  contentTheme?: string;
  whyItWorked?: string;
  pattern?: string;
}

interface NodeData {
  profileUrl?: string;
  username?: string | null;
  detectedPlatform?: Platform;
  posts?: CompetitorPost[];
  selectedPostIndex?: number | null;
  status?: "idle" | "loading" | "done" | "error";
  errorMessage?: string | null;
  authToken?: string | null;
  clientId?: string;
  onUpdate?: (updates: Record<string, any>) => void;
  onDelete?: () => void;
}

const HOOK_TYPE_LABELS: Record<string, string> = {
  educational: "Educational",
  authority: "Authority",
  story: "Story",
  comparison: "Comparison",
  shock: "Shock",
  random: "Random / Unexpected",
};

const HOOK_TYPE_COLORS: Record<string, string> = {
  educational: "#22d3ee",
  authority: "#f59e0b",
  story: "#a78bfa",
  comparison: "#a3e635",
  shock: "#f43f5e",
  random: "#94a3b8",
};

const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube Shorts",
};

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

function outlierColor(score: number): string {
  if (score >= 5) return "#22d3ee";
  if (score >= 2.5) return "#a3e635";
  return "#64748b";
}

export default function CompetitorProfileNode({ data }: { data: NodeData }) {
  const {
    profileUrl: savedUrl = "",
    username = null,
    detectedPlatform: savedPlatform = null,
    posts = [],
    selectedPostIndex = null,
    status = "idle",
    errorMessage = null,
    onUpdate,
    onDelete,
  } = data;

  const [inputUrl, setInputUrl] = useState(savedUrl);
  const [liveDetected, setLiveDetected] = useState<Platform>(savedPlatform);
  const [analyzingIndex, setAnalyzingIndex] = useState<number | null>(null);

  const handleInputChange = useCallback((val: string) => {
    setInputUrl(val);
    setLiveDetected(detectPlatform(val));
  }, []);

  const handleFetch = useCallback(async () => {
    const url = inputUrl.trim();
    if (!url) { toast.error("Paste a profile URL first"); return; }

    const platform = detectPlatform(url);
    if (!platform) { toast.error("Unsupported URL — paste an Instagram, TikTok, or YouTube channel URL"); return; }

    onUpdate?.({ status: "loading", profileUrl: url, detectedPlatform: platform, errorMessage: null });

    try {
      const { data: result, error } = await supabase.functions.invoke("fetch-profile-top-posts", {
        body: { profileUrl: url, limit: 50 },
      });

      if (error) throw new Error(error.message);
      if (result?.error) throw new Error(result.error);

      onUpdate?.({
        status: "done",
        username: result.username || null,
        detectedPlatform: result.platform || platform,
        posts: result.posts || [],
        selectedPostIndex: null,
        errorMessage: null,
      });
    } catch (e: any) {
      const msg = e.message || "Failed to fetch posts";
      onUpdate?.({ status: "error", errorMessage: msg });
      toast.error(msg);
    }
  }, [inputUrl, onUpdate]);

  const handleSelectPost = useCallback(async (index: number) => {
    onUpdate?.({ selectedPostIndex: index });
    const post = posts[index];
    if (!post || post.hookType) return;

    setAnalyzingIndex(index);
    try {
      const { data: result, error } = await supabase.functions.invoke("ai-build-script", {
        body: {
          step: "analyze-competitor-post",
          caption: post.caption,
          views: post.views,
          engagement_rate: post.engagement_rate,
          outlier_score: post.outlier_score,
        },
      });

      if (error) throw new Error(error.message);
      if (result?.error) throw new Error(result.error);

      onUpdate?.({
        posts: posts.map((p, i) =>
          i === index
            ? { ...p, hookType: result.hook_type, contentTheme: result.content_theme, whyItWorked: result.why_it_worked, pattern: result.pattern }
            : p
        ),
      });
    } catch (e: any) {
      toast.error(`Analysis failed: ${e.message || "Unknown error"}`);
    } finally {
      setAnalyzingIndex(null);
    }
  }, [posts, onUpdate]);

  const selectedPost = selectedPostIndex !== null ? posts[selectedPostIndex] : null;
  const activePlatform = liveDetected || savedPlatform;

  // Determine the platform label for the loading message
  const platformLabel = activePlatform ? PLATFORM_LABELS[activePlatform] : "profile";

  // Determine external link label
  const externalLinkLabel = savedPlatform === "youtube" ? "View on YouTube" : savedPlatform === "tiktok" ? "View on TikTok" : "View on Instagram";

  return (
    <div
      className="bg-card border border-border rounded-2xl shadow-xl overflow-hidden"
      style={{ width: 480, minHeight: 200 }}
    >
      <Handle type="target" position={Position.Left} className="!bg-[#f43f5e] !border-[#f43f5e]" />
      <Handle type="source" position={Position.Right} className="!bg-[#f43f5e] !border-[#f43f5e]" />

      {/* Header */}
      <div
        className="flex items-center gap-2.5 px-4 py-3"
        style={{ background: "linear-gradient(135deg, rgba(244,63,94,0.15), rgba(168,85,247,0.15))", borderBottom: "1px solid rgba(244,63,94,0.2)" }}
      >
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: "linear-gradient(135deg, #f43f5e, #a855f7)" }}
        >
          <UserSearch className="w-3.5 h-3.5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-foreground leading-none">Competitor Profile</p>
          {username && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              @{username}
              {savedPlatform && <span className="ml-1 opacity-60">· {PLATFORM_LABELS[savedPlatform]}</span>}
            </p>
          )}
        </div>
        {onDelete && (
          <button
            onClick={onDelete}
            className="nodrag w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors flex-shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Idle / error state */}
      {(status === "idle" || status === "error") && (
        <div className="p-4 space-y-3">
          {/* Platform support badges */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium">Supports:</span>
            <div className="flex items-center gap-1.5">
              <span
                title="Instagram"
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-medium transition-colors ${
                  activePlatform === "instagram"
                    ? "bg-pink-500/20 text-pink-400"
                    : "bg-muted/30 text-muted-foreground/40"
                }`}
              >
                <Instagram className="w-2.5 h-2.5" /> IG
              </span>
              <span
                title="TikTok"
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-medium transition-colors ${
                  activePlatform === "tiktok"
                    ? "bg-sky-500/20 text-sky-400"
                    : "bg-muted/30 text-muted-foreground/40"
                }`}
              >
                <TikTokIcon className="w-2.5 h-2.5" /> TT
              </span>
              <span
                title="YouTube Shorts"
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-medium transition-colors ${
                  activePlatform === "youtube"
                    ? "bg-red-500/20 text-red-400"
                    : "bg-muted/30 text-muted-foreground/40"
                }`}
              >
                <Youtube className="w-2.5 h-2.5" /> YT
              </span>
            </div>
          </div>

          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Profile URL</label>
            <input
              value={inputUrl}
              onChange={e => handleInputChange(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleFetch(); }}
              placeholder="instagram.com/user · tiktok.com/@user · youtube.com/@channel"
              className="mt-1.5 w-full px-3 py-2 text-xs rounded-xl border border-border bg-muted/30 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-[#f43f5e]/50 transition-colors"
            />
            {inputUrl.trim() && !activePlatform && (
              <p className="text-[10px] text-amber-400 mt-1">Unsupported URL — paste an Instagram, TikTok, or YouTube channel URL</p>
            )}
          </div>
          {status === "error" && errorMessage && (
            <p className="text-xs text-red-400">{errorMessage}</p>
          )}
          <button
            onClick={handleFetch}
            disabled={!inputUrl.trim() || !activePlatform}
            className="w-full py-2 rounded-xl text-xs font-semibold transition-colors disabled:opacity-40"
            style={{ background: "linear-gradient(135deg, #f43f5e, #a855f7)", color: "white" }}
          >
            Fetch &amp; Analyze →
          </button>
        </div>
      )}

      {/* Loading */}
      {status === "loading" && (
        <div className="p-8 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#f43f5e" }} />
          <p className="text-xs text-muted-foreground">Fetching top posts from {platformLabel}...</p>
          <p className="text-[10px] text-muted-foreground/60">This may take up to 30 seconds</p>
        </div>
      )}

      {/* Done — split layout */}
      {status === "done" && (
        <div className="flex" style={{ minHeight: 280 }}>
          {/* Left: post list */}
          <div className="w-[40%] border-r border-border flex flex-col">
            <div className="px-3 py-2 border-b border-border">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Top Posts</p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {posts.length === 0 ? (
                <p className="text-[10px] text-muted-foreground p-3">No posts found</p>
              ) : posts.map((post, i) => (
                <button
                  key={i}
                  onClick={() => handleSelectPost(i)}
                  className={`w-full text-left px-3 py-2.5 border-b border-border/50 transition-colors hover:bg-muted/30 ${selectedPostIndex === i ? "bg-muted/50" : ""}`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-[9px] font-bold" style={{ color: outlierColor(post.outlier_score) }}>
                      #{post.rank} · {post.outlier_score}x
                    </span>
                    <div className="flex items-center gap-1">
                      {analyzingIndex === i && <Loader2 className="w-2.5 h-2.5 animate-spin text-muted-foreground" />}
                      {selectedPostIndex === i && <ChevronRight className="w-2.5 h-2.5 text-muted-foreground" />}
                    </div>
                  </div>
                  <p className="text-[10px] text-foreground/80 leading-snug line-clamp-2">{post.caption || "(no caption)"}</p>
                  <p className="text-[9px] text-muted-foreground mt-1">{post.viewsFormatted || formatViews(post.views)} views</p>
                </button>
              ))}
            </div>
          </div>

          {/* Right: AI insight panel */}
          <div className="flex-1 flex flex-col">
            <div className="px-3 py-2 border-b border-border">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">AI Insight</p>
            </div>
            {!selectedPost ? (
              <div className="flex-1 flex items-center justify-center p-4">
                <p className="text-[10px] text-muted-foreground text-center">Click a post to see why it worked</p>
              </div>
            ) : analyzingIndex === selectedPostIndex ? (
              <div className="flex-1 flex items-center justify-center p-4 gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                <p className="text-[10px] text-muted-foreground">Analyzing...</p>
              </div>
            ) : (
              <div className="flex-1 p-3 space-y-3 overflow-y-auto">
                {selectedPost.hookType && (
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Hook Type</p>
                    <span
                      className="inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold"
                      style={{
                        background: `${HOOK_TYPE_COLORS[selectedPost.hookType] || "#64748b"}20`,
                        color: HOOK_TYPE_COLORS[selectedPost.hookType] || "#64748b",
                      }}
                    >
                      {HOOK_TYPE_LABELS[selectedPost.hookType] || selectedPost.hookType}
                    </span>
                  </div>
                )}
                {selectedPost.contentTheme && (
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Theme</p>
                    <p className="text-[10px] text-foreground">{selectedPost.contentTheme}</p>
                  </div>
                )}
                {selectedPost.pattern && (
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Pattern</p>
                    <p className="text-[10px] text-foreground/80 leading-relaxed">{selectedPost.pattern}</p>
                  </div>
                )}
                {selectedPost.whyItWorked && (
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Why It Worked</p>
                    <p className="text-[10px] text-foreground/80 leading-relaxed">{selectedPost.whyItWorked}</p>
                  </div>
                )}
                {!selectedPost.hookType && !analyzingIndex && (
                  <p className="text-[10px] text-muted-foreground">Click the post again to load analysis</p>
                )}
                {selectedPost.url && (
                  <a
                    href={selectedPost.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors mt-1"
                  >
                    <ExternalLink className="w-3 h-3" />
                    {externalLinkLabel}
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/canvas/CompetitorProfileNode.tsx
git commit -m "feat: add CompetitorProfileNode with Instagram/TikTok/YouTube platform detection"
```

---

## Task 5: Update `SuperPlanningCanvas.tsx`

**Files:**
- Modify: `src/pages/SuperPlanningCanvas.tsx`

Three changes: (a) import + register new node, (b) update AI context filter, (c) update addNode type union and width map.

- [ ] **Step 1: Update import (top of file)**

Find the `InstagramProfileNode` import and add the new one alongside it:
```typescript
import InstagramProfileNode from "@/components/canvas/InstagramProfileNode";
import CompetitorProfileNode from "@/components/canvas/CompetitorProfileNode";
```

- [ ] **Step 2: Update `nodeTypes` (line 70)**

Find:
```typescript
  instagramProfileNode: InstagramProfileNode,
```

Replace with:
```typescript
  instagramProfileNode: CompetitorProfileNode,  // alias — backward compat for saved sessions
  competitorProfileNode: CompetitorProfileNode,
```

- [ ] **Step 3: Update AI context filter (lines 730-734)**

Find:
```typescript
const instagramProfileNodes = contextNodes.filter(
  n => n.type === "instagramProfileNode" &&
  (n.data as any).status === "done" &&
  ((n.data as any).posts?.length ?? 0) > 0
);
```

Replace with:
```typescript
const instagramProfileNodes = contextNodes.filter(
  n => (n.type === "instagramProfileNode" || n.type === "competitorProfileNode") &&
  (n.data as any).status === "done" &&
  ((n.data as any).posts?.length ?? 0) > 0
);
```

- [ ] **Step 4: Update `addNode` type union (line 887)**

Find:
```typescript
const addNode = useCallback((type: "videoNode" | "textNoteNode" | "researchNoteNode" | "hookGeneratorNode" | "brandGuideNode" | "ctaBuilderNode" | "instagramProfileNode" | "mediaNode" | "groupNode") => {
```

Replace with:
```typescript
const addNode = useCallback((type: "videoNode" | "textNoteNode" | "researchNoteNode" | "hookGeneratorNode" | "brandGuideNode" | "ctaBuilderNode" | "instagramProfileNode" | "competitorProfileNode" | "mediaNode" | "groupNode") => {
```

- [ ] **Step 5: Update node width map (line 898)**

Find:
```typescript
: type === "instagramProfileNode" ? 480
```

Replace with:
```typescript
: (type === "instagramProfileNode" || type === "competitorProfileNode") ? 480
```

- [ ] **Step 6: Commit**

```bash
git add src/pages/SuperPlanningCanvas.tsx
git commit -m "feat: register CompetitorProfileNode in canvas, update AI context filter and type unions"
```

---

## Task 6: Update `CanvasToolbar.tsx`

**Files:**
- Modify: `src/components/canvas/CanvasToolbar.tsx`

- [ ] **Step 1: Update `onAddNode` prop type (line 23)**

Find:
```typescript
  onAddNode: (type: "videoNode" | "textNoteNode" | "researchNoteNode" | "hookGeneratorNode" | "brandGuideNode" | "ctaBuilderNode" | "instagramProfileNode" | "mediaNode" | "groupNode") => void;
```

Replace with:
```typescript
  onAddNode: (type: "videoNode" | "textNoteNode" | "researchNoteNode" | "hookGeneratorNode" | "brandGuideNode" | "ctaBuilderNode" | "instagramProfileNode" | "competitorProfileNode" | "mediaNode" | "groupNode") => void;
```

- [ ] **Step 2: Update the toolbar button call site (line 329)**

Find:
```typescript
        <button
          onClick={() => onAddNode("instagramProfileNode")}
          title="Add Competitor Profile"
```

Replace with:
```typescript
        <button
          onClick={() => onAddNode("competitorProfileNode")}
          title="Add Competitor Profile"
```

- [ ] **Step 3: Commit**

```bash
git add src/components/canvas/CanvasToolbar.tsx
git commit -m "feat: add competitorProfileNode to CanvasToolbar onAddNode type union"
```

---

## Task 7: Update `ViralToday.tsx`

**Files:**
- Modify: `src/pages/ViralToday.tsx`

Four changes: YouTube icon in `PLATFORM_ICON`, YouTube option in `getPlatformOpts`, translations, and `detectPlatformAndUsername` function update.

- [ ] **Step 1: Add Youtube to imports (line 1)**

Find the lucide-react import line and add `Youtube`:
```typescript
import { ..., Youtube } from "lucide-react";
```

- [ ] **Step 2: Update `PLATFORM_ICON` (line 239)**

Find:
```typescript
const PLATFORM_ICON: Record<string, React.ElementType> = {
  instagram: Instagram,
  tiktok: Flame,
};
```

Replace with:
```typescript
const PLATFORM_ICON: Record<string, React.ElementType> = {
  instagram: Instagram,
  tiktok: Flame,
  youtube: Youtube,
};
```

- [ ] **Step 3: Add youtube translation keys to EN object (around line 30)**

Find the `tiktok: "TikTok"` line in the EN translations and add youtube after it:
```typescript
    tiktok: "TikTok",
    youtube: "YouTube",
```

Do the same in the ES translations object:
```typescript
    tiktok: "TikTok",
    youtube: "YouTube",
```

- [ ] **Step 4: Update `getPlatformOpts` (line 619)**

Find:
```typescript
const getPlatformOpts = (t: any): DropdownOption[] => [
  { label: t.allPlatforms, value: "all" },
  { label: t.instagram, value: "instagram" },
  { label: t.tiktok, value: "tiktok" },
];
```

Replace with:
```typescript
const getPlatformOpts = (t: any): DropdownOption[] => [
  { label: t.allPlatforms, value: "all" },
  { label: t.instagram, value: "instagram" },
  { label: t.tiktok, value: "tiktok" },
  { label: t.youtube, value: "youtube" },
];
```

- [ ] **Step 5: Update `detectPlatformAndUsername` (line 200)**

Find:
```typescript
function detectPlatformAndUsername(raw: string): { username: string; platform: "instagram" | "tiktok" } {
  const s = raw.trim();
  // TikTok URL: tiktok.com/@username
```

Replace the entire function:
```typescript
function detectPlatformAndUsername(raw: string): { username: string; platform: "instagram" | "tiktok" | "youtube" } {
  const s = raw.trim();

  // TikTok URL
  const tiktokMatch = s.match(/tiktok\.com\/@?([^/?#\s]+)/i);
  if (tiktokMatch) {
    return { username: tiktokMatch[1].replace(/\/$/, "").toLowerCase(), platform: "tiktok" };
  }

  // Instagram URL
  const instaMatch = s.match(/instagram\.com\/([^/?#\s]+)/i);
  if (instaMatch) {
    return { username: instaMatch[1].replace(/\/$/, "").toLowerCase(), platform: "instagram" };
  }

  // YouTube URL variants
  if (s.includes("youtube.com") || s.includes("youtu.be")) {
    const handleMatch = s.match(/youtube\.com\/@([^/?#\s]+)/i);
    const customMatch = s.match(/youtube\.com\/c\/([^/?#\s]+)/i);
    const channelMatch = s.match(/youtube\.com\/channel\/([^/?#\s]+)/i);
    const username =
      handleMatch?.[1] ?? customMatch?.[1] ?? channelMatch?.[1] ?? s.replace(/^.*youtube\.com\//i, "").split(/[/?#]/)[0];
    return { username: username.replace(/\/$/, ""), platform: "youtube" };
  }

  // @handle with no URL — assume Instagram
  const clean = s.replace(/^@/, "").trim().toLowerCase();
  return { username: clean, platform: "instagram" };
}
```

- [ ] **Step 6: Commit**

```bash
git add src/pages/ViralToday.tsx
git commit -m "feat: add YouTube Shorts support to Viral Today (platform filter, detection, icons)"
```

---

## Task 8: Deploy edge functions to Supabase

- [ ] **Step 1: Deploy `fetch-profile-top-posts`**

```bash
cd /Users/admin/Desktop/connectacreators
npx supabase functions deploy fetch-profile-top-posts --project-ref hxojqrilwhhrvloiwmfo
```

Expected output: `Deployed function fetch-profile-top-posts`

- [ ] **Step 2: Deploy `scrape-channel`**

```bash
npx supabase functions deploy scrape-channel --project-ref hxojqrilwhhrvloiwmfo
```

- [ ] **Step 3: Deploy `auto-scrape-channels`**

```bash
npx supabase functions deploy auto-scrape-channels --project-ref hxojqrilwhhrvloiwmfo
```

- [ ] **Step 4: Smoke-test `fetch-profile-top-posts` with a known Instagram profile**

```bash
curl -X POST "https://hxojqrilwhhrvloiwmfo.supabase.co/functions/v1/fetch-profile-top-posts" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4b2pxcmlsd2hocnZsb2l3bWZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NDI2ODIsImV4cCI6MjA4NzIxODY4Mn0.rE0InfGUiq-Xl7DSJVWoaem_zQ_LnIzhDFzzLQ5k54k" \
  -d '{"profileUrl":"https://instagram.com/natgeo","limit":10}' | python3 -m json.tool
```

Expected: `{ "posts": [...], "username": "natgeo", "platform": "instagram" }`

- [ ] **Step 5: Smoke-test with a YouTube channel**

```bash
curl -X POST "https://hxojqrilwhhrvloiwmfo.supabase.co/functions/v1/fetch-profile-top-posts" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4b2pxcmlsd2hocnZsb2l3bWZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NDI2ODIsImV4cCI6MjA4NzIxODY4Mn0.rE0InfGUiq-Xl7DSJVWoaem_zQ_LnIzhDFzzLQ5k54k" \
  -d '{"profileUrl":"https://youtube.com/@MrBeast","limit":10}' | python3 -m json.tool
```

Expected: `{ "posts": [...], "username": "MrBeast", "platform": "youtube" }`

- [ ] **Step 6: Commit deploy confirmation**

```bash
git commit --allow-empty -m "chore: deploy fetch-profile-top-posts, scrape-channel, auto-scrape-channels"
```

---

## Task 9: Build and deploy frontend to VPS

- [ ] **Step 1: Build on VPS**

SSH into VPS and run:
```bash
cd /var/www/connectacreators && npm run build
```

Expected: build completes with no errors, `dist/` folder updated.

- [ ] **Step 2: Reload nginx**

```bash
nginx -s reload
```

- [ ] **Step 3: Manual test — Viral Today YouTube channel add**

1. Go to `https://connectacreators.com/viral-today`
2. Click the Channels tab
3. In the "Add channel" input, paste `https://youtube.com/@MrBeast`
4. Expected: platform auto-detects as YouTube, "Scrape" button appears
5. Trigger scrape → confirm status changes to "running" then "done"
6. Go to Videos tab, filter by Platform = YouTube
7. Expected: MrBeast Shorts appear with YouTube platform badge

- [ ] **Step 4: Manual test — Canvas CompetitorProfileNode**

1. Open Super Planning Canvas
2. Click "Competitor Profile" button in toolbar
3. New node appears — confirm it shows "Competitor Profile" title + 3 platform badges (IG, TT, YT all dimmed)
4. Paste `https://instagram.com/natgeo` → confirm IG badge lights up
5. Click "Fetch & Analyze" → posts load
6. Paste `https://youtube.com/@MrBeast` → confirm YT badge lights up, posts load
7. Click a post → AI analysis runs

- [ ] **Step 5: Manual test — backward compat**

1. If any existing canvas sessions have saved `instagramProfileNode` nodes, open one
2. Confirm the node renders correctly as a CompetitorProfileNode
3. Confirm existing posts still display

- [ ] **Step 6: Final commit**

```bash
git add -p  # stage any remaining changes
git commit -m "feat: YouTube Shorts scraper + unified CompetitorProfileNode complete"
```
