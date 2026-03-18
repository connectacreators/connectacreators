# Viral Finder Pipeline Optimization — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the display bug that prevents hashtag-scraped videos from appearing in ViralToday, and add early filtering, velocity scoring, composite ranking, and caching to the scrape-hashtag edge function.

**Architecture:** Three independent changes applied in order: (1) DB migration adds the missing `hashtag_source` column, (2) ViralToday.tsx fixes the sort order and type interface, (3) scrape-hashtag edge function gains a cache guard, 50K early filter, velocity score, and composite ranking that reduces stored posts from 200 → 50.

**Tech Stack:** Supabase Edge Functions (Deno/TypeScript), React + TypeScript (Vite), Supabase JS client, PostgreSQL migration SQL.

**Spec:** `docs/superpowers/specs/2026-03-18-viral-finder-pipeline-optimization-design.md`

---

## Chunk 1: DB Migration + ViralToday Display Fix

### Task 1: Create and apply DB migration

**Files:**
- Create: `supabase/migrations/20260318_add_hashtag_source.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260318_add_hashtag_source.sql

-- Add hashtag_source column to viral_videos.
-- This column stores the sorted, comma-joined hashtag cache key for rows
-- inserted by the scrape-hashtag edge function (e.g. "fitness,travel").
-- Channel-scraped rows leave it NULL.
ALTER TABLE viral_videos ADD COLUMN IF NOT EXISTS hashtag_source TEXT;

-- Composite index for the cache guard query:
--   WHERE hashtag_source = $1 AND scraped_at > now() - interval '6 hours'
-- Partial (WHERE hashtag_source IS NOT NULL) keeps the index small — only
-- hashtag-scraped rows need it.
CREATE INDEX IF NOT EXISTS idx_viral_videos_hashtag_scraped
  ON viral_videos(hashtag_source, scraped_at DESC)
  WHERE hashtag_source IS NOT NULL;

-- Index for the full-table ORDER BY scraped_at DESC used by fetchVideos in ViralToday.
-- Without this, the paginated feed query does a sequential scan.
CREATE INDEX IF NOT EXISTS idx_viral_videos_scraped_at
  ON viral_videos(scraped_at DESC);
```

- [ ] **Step 2: Apply the migration**

Open Supabase Dashboard → SQL Editor. Copy the entire contents of the file you just created and run it. Do not retype it — paste from the file to avoid drift.

- [ ] **Step 3: Verify the column and indexes exist**

In Supabase Dashboard → Table Editor → `viral_videos`, confirm `hashtag_source` column is present with type `text` and nullable. Also confirm the index appears in Database → Indexes.

- [ ] **Step 4: Commit the migration file**

```bash
git add supabase/migrations/20260318_add_hashtag_source.sql
git commit -m "feat: add hashtag_source column and composite index to viral_videos"
```

---

### Task 2: Fix ViralToday sort order and TypeScript interface

**Files:**
- Modify: `src/pages/ViralToday.tsx` (lines 144–160 for interface, line 743 for sort)

- [ ] **Step 1: Add `hashtag_source` to the `ViralVideo` interface**

Find the `ViralVideo` interface (around line 144). Add the new field at the end:

```typescript
interface ViralVideo {
  id: string;
  channel_id: string;
  channel_username: string;
  platform: string;
  video_url: string | null;
  thumbnail_url: string | null;
  caption: string | null;
  views_count: number;
  likes_count: number;
  comments_count: number;
  engagement_rate: number;
  outlier_score: number;
  posted_at: string | null;
  scraped_at: string;
  apify_video_id: string | null;
  hashtag_source?: string | null;   // ← ADD THIS LINE
}
```

- [ ] **Step 2: Change the fetch sort order in `fetchVideos`**

Find the `fetchVideos` function (around line 740). Make a one-line change inside the existing paginated `while` loop — do NOT replace the loop:

```typescript
// BEFORE (one line inside the existing while loop):
.order("posted_at", { ascending: false })

// AFTER (same location, one line only):
.order("scraped_at", { ascending: false })
```

Do not touch any other part of the `while` loop, the `PAGE_SIZE`, `MAX_VIDEOS`, or `allVideos` logic.

- [ ] **Step 3: Build to verify no TypeScript errors**

```bash
cd /var/www/connectacreators && npm run build
```

Expected: build completes with no errors. If there are TypeScript errors, fix them before continuing.

- [ ] **Step 4: Commit**

```bash
git add src/pages/ViralToday.tsx
git commit -m "fix: order viral_videos by scraped_at so hashtag scrapes appear at top of feed"
```

---

## Chunk 2: scrape-hashtag Pipeline Optimization

### Task 3: Refactor scrape-hashtag edge function

This task rewrites the entire `scrape-hashtag/index.ts` with all optimizations applied. The existing structure is preserved; new logic is added in layers.

**Files:**
- Modify: `supabase/functions/scrape-hashtag/index.ts`

- [ ] **Step 1: Replace the file with the optimized version**

Replace the full contents of `supabase/functions/scrape-hashtag/index.ts`:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const APIFY_TOKEN = "apify_api_XcMx5KAjTPY1wBow3wgTaA3Y4wdiwL0MbbI2";
const ACTOR_ID = "apify~instagram-hashtag-scraper";
const SCRAPE_LIMIT = 500;       // Fetch large pool — more candidates = better top picks
const MAX_RESULTS = 50;          // Keep only top 50 by composite score (was 200)
const MIN_VIEWS = 50_000;       // Discard anything below this before scoring
const CACHE_TTL_HOURS = 6;      // Skip Apify if same hashtags scraped within this window
const POLL_TIMEOUT_MS = 55000;
const POLL_INTERVAL_MS = 3000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Build a stable cache key from a list of hashtag strings.
// Sort alphabetically so ["travel","fitness"] and ["fitness","travel"] produce the same key.
//
// NOTE: The previous version of this function used unsorted join(",").
// Rows written before this deploy have unsorted hashtag_source values and will not
// match this sorted key, causing a one-time cold-start Apify call per hashtag combo.
// This is intentional and harmless — the cache will populate correctly going forward.
function buildCacheKey(tags: string[]): string {
  return [...tags].sort().join(",");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { hashtags } = await req.json() as { hashtags: string[] };
    if (!hashtags?.length) {
      return new Response(JSON.stringify({ error: "hashtags array required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Clean hashtags (strip # prefix if included)
    const cleanTags = hashtags.map(h => h.replace(/^#/, "").trim()).filter(Boolean);
    const cacheKey = buildCacheKey(cleanTags);

    // ── 1. Cache guard ────────────────────────────────────────────────────────
    // If the same hashtag combination was scraped within CACHE_TTL_HOURS, skip Apify.
    const cacheThreshold = new Date(Date.now() - CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString();
    const { data: cachedRow } = await supabase
      .from("viral_videos")
      .select("id")
      .eq("hashtag_source", cacheKey)
      .gt("scraped_at", cacheThreshold)
      .limit(1)
      .maybeSingle();

    if (cachedRow) {
      return new Response(
        JSON.stringify({ inserted: 0, cached: true, message: "Results from cache (scraped < 6h ago)", hashtags: cleanTags }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 2. Start Apify run ────────────────────────────────────────────────────
    const runRes = await fetch(
      `https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${APIFY_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hashtags: cleanTags,
          resultsLimit: SCRAPE_LIMIT,
          scrapeType: "top",
          onlyTopPosts: true,
        }),
      }
    );

    if (!runRes.ok) {
      const err = await runRes.text();
      throw new Error(`Apify start failed: ${err}`);
    }

    const { data: runData } = await runRes.json();
    const runId = runData.id;
    const datasetId = runData.defaultDatasetId;

    // Poll until finished
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let status = runData.status;

    while (!["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(status) && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
      const pollRes = await fetch(
        `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`
      );
      const pollData = await pollRes.json();
      status = pollData.data?.status ?? status;
    }

    if (status === "FAILED" || status === "ABORTED") {
      throw new Error(`Apify run ${status}`);
    }

    // Fetch full dataset
    const datasetRes = await fetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&limit=${SCRAPE_LIMIT}&clean=true`
    );
    if (!datasetRes.ok) throw new Error("Failed to fetch dataset");
    const items: any[] = await datasetRes.json();

    if (!items.length) {
      return new Response(JSON.stringify({ inserted: 0, message: "No results from Apify" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 3. Early filter: video posts only, then discard below MIN_VIEWS ───────
    const now = Date.now();
    const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;

    const videoPosts = items
      .filter(item => item.type === "Video" || item.isVideo === true || item.videoUrl)
      .map(item => {
        const views = item.videoViewCount ?? item.videoPlayCount ?? item.playsCount ?? 0;
        const likes = item.likesCount ?? item.likeCount ?? 0;
        const comments = item.commentsCount ?? item.commentCount ?? 0;
        const videoId = item.shortCode ?? item.id ?? item.pk;
        const ownerUsername = item.ownerUsername ?? item.owner?.username ?? "unknown";
        const caption = (item.caption ?? item.text ?? "").slice(0, 600);
        const thumbnail = typeof item.displayUrl === "string"
          ? item.displayUrl
          : (item.displayUrl?.url ?? item.thumbnailUrl ?? item.coverUrl ?? null);
        const videoUrl = item.videoUrl ?? `https://www.instagram.com/reel/${videoId}/`;
        const postUrl = item.url ?? `https://www.instagram.com/reel/${videoId}/`;

        let postedAt: string | null = null;
        let ageInDays = 0;
        if (item.timestamp) {
          const ts = typeof item.timestamp === "number"
            ? new Date(item.timestamp * 1000)
            : new Date(item.timestamp);
          if (!isNaN(ts.getTime())) {
            postedAt = ts.toISOString();
            ageInDays = (now - ts.getTime()) / 86_400_000;
          }
        }

        return { views, likes, comments, videoId, ownerUsername, caption, thumbnail, postUrl, postedAt, ageInDays };
      })
      .filter(p => {
        if (!p.videoId) return false;
        if (p.views < MIN_VIEWS) return false;                         // early filter: < 50K views
        if (p.postedAt && new Date(p.postedAt).getTime() < oneYearAgo) return false; // older than 1 year
        return true;
      });

    if (!videoPosts.length) {
      return new Response(
        JSON.stringify({ inserted: 0, message: "No posts met the 50K views threshold" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 4. Velocity + composite ranking ──────────────────────────────────────
    // velocity = views / max(age_in_days, 1)
    // Posts with no posted_at get velocity = 0 (neutral).
    const scored = videoPosts.map(p => ({
      ...p,
      velocity: p.postedAt ? p.views / Math.max(p.ageInDays, 1) : 0,
    }));

    // Use reduce instead of spread to avoid stack overflow if SCRAPE_LIMIT is ever increased.
    const maxViews    = scored.reduce((m, p) => p.views > m ? p.views : m, 0);
    const maxVelocity = scored.reduce((m, p) => p.velocity > m ? p.velocity : m, 0);

    // Zero-guard: if every post has no posted_at, maxVelocity == 0 → weight 100% on views.
    const ranked = scored
      .map(p => {
        const normViews    = p.views / maxViews;
        const normVelocity = maxVelocity > 0 ? p.velocity / maxVelocity : 0;
        const composite    = maxVelocity > 0
          ? 0.7 * normViews + 0.3 * normVelocity
          : normViews;
        return { ...p, composite };
      })
      .sort((a, b) => b.composite - a.composite)
      .slice(0, MAX_RESULTS);

    // ── 5. Outlier score (relative to kept batch avg) ─────────────────────────
    const viewsList = ranked.map(p => p.views);
    const avgViews  = viewsList.reduce((a, b) => a + b, 0) / viewsList.length;

    const rows: any[] = ranked.map(p => ({
      channel_id: null,
      channel_username: p.ownerUsername,
      platform: "instagram",
      video_url: p.postUrl,
      thumbnail_url: p.thumbnail,
      caption: p.caption,
      views_count: p.views,
      likes_count: p.likes,
      comments_count: p.comments,
      engagement_rate: Math.round(p.views > 0 ? ((p.likes + p.comments) / p.views) * 10000 : 0) / 100,
      outlier_score: Math.round((p.views / avgViews) * 100) / 100,
      posted_at: p.postedAt,
      scraped_at: new Date().toISOString(),
      apify_video_id: p.videoId,
      hashtag_source: cacheKey,
    }));

    // ── 6. Upsert ─────────────────────────────────────────────────────────────
    const { error: upsertErr, count } = await supabase
      .from("viral_videos")
      .upsert(rows, { onConflict: "platform,apify_video_id", ignoreDuplicates: false })
      .select("id", { count: "exact", head: true });

    if (upsertErr) throw new Error(`DB upsert failed: ${upsertErr.message}`);

    return new Response(
      JSON.stringify({
        inserted: count ?? rows.length,
        hashtags: cleanTags,
        total_scraped: items.length,
        after_early_filter: videoPosts.length,
        total_processed: ranked.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("scrape-hashtag error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
```

- [ ] **Step 2: Deploy the function to Supabase**

SSH to the VPS and deploy:

```bash
cd /var/www/connectacreators
npx supabase functions deploy scrape-hashtag --project-ref hxojqrilwhhrvloiwmfo
```

Expected output: `Deployed Functions scrape-hashtag`

- [ ] **Step 3: Test the cache guard (call the function twice with the same hashtag)**

First call — should trigger Apify and return inserted count:
```bash
curl -X POST https://hxojqrilwhhrvloiwmfo.supabase.co/functions/v1/scrape-hashtag \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4b2pxcmlsd2hocnZsb2l3bWZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NDI2ODIsImV4cCI6MjA4NzIxODY4Mn0.rE0InfGUiq-Xl7DSJVWoaem_zQ_LnIzhDFzzLQ5k54k" \
  -d '{"hashtags": ["videomarketing"]}' | jq .
```

Expected response (after Apify completes):
```json
{
  "inserted": 50,
  "hashtags": ["videomarketing"],
  "total_scraped": 500,
  "after_early_filter": 120,
  "total_processed": 50
}
```

Second call immediately after — should return cached:
```bash
curl -X POST https://hxojqrilwhhrvloiwmfo.supabase.co/functions/v1/scrape-hashtag \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4b2pxcmlsd2hocnZsb2l3bWZvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTY0MjY4MiwiZXhwIjoyMDg3MjE4NjgyfQ.ksq6adDCNE0HVtw-swYm60vJWQ2CWzMbDBvAIw_V010" \
  -d '{"hashtags": ["videomarketing"]}' | jq .
```

Expected:
```json
{
  "inserted": 0,
  "cached": true,
  "message": "Results from cache (scraped < 6h ago)",
  "hashtags": ["videomarketing"]
}
```

- [ ] **Step 4: Verify the early filter at the DB level**

Run this in Supabase Dashboard → SQL Editor to confirm no sub-50K videos were inserted:

```sql
SELECT MIN(views_count), COUNT(*)
FROM viral_videos
WHERE hashtag_source = 'videomarketing';
```

Expected: `MIN(views_count) >= 50000` and `COUNT(*) <= 50`.

- [ ] **Step 5: Verify videos appear in ViralToday**

1. Open the app in the browser
2. Go to Viral Today → Videos tab
3. Confirm the newly scraped videos from `#videomarketing` appear at the top of the feed (ordered by `scraped_at DESC`)
4. Confirm all visible cards show views ≥ 50K

- [ ] **Step 6: Build the frontend to verify no regressions**

```bash
cd /var/www/connectacreators && npm run build
```

Expected: build completes with 0 TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/scrape-hashtag/index.ts
git commit -m "feat: optimize scrape-hashtag with cache guard, 50K early filter, velocity scoring, and composite ranking"
```

---

## Verification Checklist

After all tasks are complete, confirm:

- [ ] `hashtag_source` column visible in Supabase Table Editor → `viral_videos`
- [ ] Composite index `idx_viral_videos_hashtag_scraped` visible in Database → Indexes
- [ ] Scraping a hashtag for the first time triggers Apify and returns `inserted: 50` (or fewer if batch < 50)
- [ ] Scraping the same hashtag again within 6h returns `cached: true` with no Apify call
- [ ] All inserted videos have `views_count >= 50000`
- [ ] Scraped videos appear at the top of the ViralToday Videos tab immediately after scraping
- [ ] Response includes `total_scraped`, `after_early_filter`, `total_processed` for observability
- [ ] `npm run build` passes with 0 errors
