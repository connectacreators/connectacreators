# Viral Finder Pipeline Optimization — Design Spec

**Date:** 2026-03-18
**Status:** Approved

---

## Problem

The Instagram hashtag scraper (`scrape-hashtag`) returns mostly recent posts instead of high-performing ones. Two compounding issues:

1. **Waste:** Up to 500 posts are fetched and 200 are stored regardless of quality. Most have low views and add noise.
2. **Display bug:** Hashtag-scraped videos never appear in the ViralToday feed because:
   - The `hashtag_source` column doesn't exist in `viral_videos`, causing the upsert to fail server-side.
   - Even if it did succeed, `fetchVideos` orders by `posted_at DESC` — hashtag posts have old `posted_at` dates (original post date) and sink below channel-scraped videos with recent dates.

---

## Scope

- `supabase/functions/scrape-hashtag/index.ts` — pipeline optimization
- `supabase/migrations/` — add `hashtag_source` column with composite index
- `src/pages/ViralToday.tsx` — fix feed sort order + update `ViralVideo` interface

No new tables, no new edge functions.

---

## Design

### 1. Cache Guard (before Apify call)

**Cache key:** Sort the requested hashtag tags alphabetically and join with comma. Example: `["travel", "fitness"]` → cache key `"fitness,travel"`. This ensures consistent matching regardless of input order. The stored `hashtag_source` value uses the same format.

Before starting an Apify run, query `viral_videos`:
```sql
SELECT 1 FROM viral_videos
WHERE hashtag_source = '<sorted-joined-key>'
  AND scraped_at > now() - interval '6 hours'
LIMIT 1
```

If any row exists, skip the Apify call and return:
```json
{ "inserted": 0, "cached": true, "message": "Results from cache (scraped < 6h ago)" }
```

This is purely a protection against redundant manual scrapes. No auto-scheduling.

### 2. Early Filter (immediately after Apify returns)

After fetching the Apify dataset, before any scoring or DB work:

```
discard all posts where views < 50,000
```

If zero posts survive the filter, return:
```json
{ "inserted": 0, "message": "No posts met the 50K views threshold" }
```

This gives the frontend a clear signal to distinguish "Apify returned nothing" from "posts were filtered out."

### 3. Velocity Score

For each post surviving the early filter:

```
velocity = views / max(age_in_days, 1)
```

Where `age_in_days = (now - posted_at) / 86400`. Posts with no `posted_at` receive `velocity = 0` (neutral — neither penalized nor rewarded for missing data).

Velocity captures trending posts: a 200K-view post from 2 days ago outranks a 300K-view post from 60 days ago on velocity.

### 4. Composite Ranking + Cap

Normalize both signals against the batch maximum:

```
normalized_views    = views / max_views_in_batch
normalized_velocity = velocity / max_velocity_in_batch   (see zero-guard below)
composite_score     = 0.7 * normalized_views + 0.3 * normalized_velocity
```

**Zero-guard for velocity:** If `max_velocity_in_batch == 0` (i.e. every surviving post has no `posted_at`), set all `normalized_velocity = 0` and weight 100% on views: `composite_score = normalized_views`.

Sort descending by `composite_score`. Keep top **50** posts (down from 200). Only these 50 are upserted to `viral_videos`.

**Outlier score:** Computed as `views / avg_views_of_kept_batch`. Because the kept batch is the top 50 by composite score, average views will be higher than if computed from all 500 scraped posts. This means outlier scores from hashtag scrapes will be slightly deflated compared to channel-scraped videos. This is intentional — it reflects performance relative to other high-performers in the batch.

### 5. Display Bug Fix — DB Migration

Add `hashtag_source TEXT` column to `viral_videos` with a composite index to support the cache guard query efficiently:

```sql
ALTER TABLE viral_videos ADD COLUMN IF NOT EXISTS hashtag_source TEXT;
CREATE INDEX IF NOT EXISTS idx_viral_videos_hashtag_scraped
  ON viral_videos(hashtag_source, scraped_at DESC)
  WHERE hashtag_source IS NOT NULL;
```

A composite index on `(hashtag_source, scraped_at)` is used rather than a single-column index on `hashtag_source` because the cache guard always filters on both columns together.

### 6. Display Bug Fix — Feed Sort Order

In `ViralToday.tsx`, `fetchVideos` changes:

```
.order("posted_at", { ascending: false })
→
.order("scraped_at", { ascending: false })
```

`scraped_at` is always `now()` at insert time (DB default). This ensures the most recently scraped batch always floats to the top.

**Date filter interaction:** The frontend Date filter (in `filteredVideos`) filters on `v.posted_at` and skips posts where `posted_at` is null. Hashtag posts with no timestamp will therefore be hidden when the user activates a date range filter. This is acceptable behavior — a post with no timestamp cannot be meaningfully included in a date-bounded result.

**Polling refresh query (line 808):** The secondary query inside the channel poll interval also uses `.order("posted_at", ...)` but is channel-only (`.eq("channel_id", ch.id)`). Channel-scraped videos always have valid `posted_at`, so no change is needed there. It is explicitly out of scope.

### 7. TypeScript Interface Update

Add `hashtag_source?: string` to the `ViralVideo` interface in `ViralToday.tsx` for type completeness:

```typescript
interface ViralVideo {
  // ... existing fields
  hashtag_source?: string | null;
}
```

---

## Constants After Changes

| Constant | Before | After |
|---|---|---|
| `SCRAPE_LIMIT` | 500 | 500 (unchanged — larger pool = better top picks) |
| `MAX_RESULTS` | 200 | 50 |
| Min views threshold | none | 50,000 |
| Cache TTL | none | 6 hours |

---

## Data Flow

```
User triggers scrape (tags: ["fitness", "travel"])
  → Sort tags → cache key: "fitness,travel"
  → Cache check: any viral_videos row with hashtag_source="fitness,travel" AND scraped_at > now()-6h?
      YES → return { cached: true }, skip Apify
      NO  → call Apify (500 posts)
            → early filter: discard views < 50K
            → if 0 survive → return { inserted: 0, message: "No posts met threshold" }
            → compute velocity per post (views / max(age_days, 1)), 0 for null posted_at
            → normalize views + velocity against batch max
            → zero-guard: if max_velocity == 0, weight 100% views
            → composite score (70/30), sort desc, keep top 50
            → compute outlier_score (views / avg_views_of_kept_batch)
            → upsert to viral_videos (with hashtag_source="fitness,travel", scraped_at=now())
```

---

## Creator Aggregation Compatibility

Hashtag-scraped videos have `channel_id = null` and `channel_username` set to the post owner. The ViralToday "Channels" tab only shows `viral_channels` rows (which hashtag scrapes never create), so channel-level metrics are unaffected. The "Videos" tab shows all `viral_videos` rows regardless of `channel_id`.

---

## What Is Not Changed

- `scrape-channel` — unaffected
- `fetch-instagram-top-posts` — unaffected
- `analyze-video-multimodal` — unaffected
- Channel poll query at ViralToday line 808 — out of scope
- Credit deduction logic — unaffected
- Any frontend UI beyond the sort fix and interface update
