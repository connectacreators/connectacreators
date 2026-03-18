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
- `supabase/migrations/` — add `hashtag_source` column
- `src/pages/ViralToday.tsx` — fix feed sort order

No new tables, no new edge functions, no frontend UI changes.

---

## Design

### 1. Cache Guard (before Apify call)

Before starting an Apify run, query `viral_videos` for rows where:
- `hashtag_source` matches the requested tag(s)
- `scraped_at > now() - 6 hours`

If any rows exist, skip the Apify call and return:
```json
{ "inserted": 0, "cached": true, "message": "Results from cache (scraped < 6h ago)" }
```

This is purely a protection against redundant manual scrapes within a short window. No auto-scheduling. No periodic re-scraping.

### 2. Early Filter (immediately after Apify returns)

After fetching the Apify dataset, before any scoring or DB work:

```
discard all posts where views < 50,000
```

This eliminates low-signal posts before they touch scoring, ranking, or the database.

### 3. Velocity Score

For each post surviving the early filter:

```
velocity = views / max(age_in_days, 1)
```

Where `age_in_days = (now - posted_at) / 86400`. Posts with no `posted_at` receive `velocity = 0` (neutral — neither penalized nor rewarded).

Velocity captures trending posts: a 200K-view post from 2 days ago outranks a 300K-view post from 60 days ago on velocity.

### 4. Composite Ranking + Cap

Normalize both signals against the batch maximum:

```
normalized_views    = views / max_views_in_batch
normalized_velocity = velocity / max_velocity_in_batch
composite_score     = 0.7 * normalized_views + 0.3 * normalized_velocity
```

Sort descending by `composite_score`. Keep top **50** posts (down from 200). Only these 50 are upserted to `viral_videos`.

The existing `outlier_score` calculation (views / avg_views of the kept batch) remains unchanged.

### 5. Display Bug Fix — DB Migration

Add `hashtag_source TEXT` column to `viral_videos`:

```sql
ALTER TABLE viral_videos ADD COLUMN IF NOT EXISTS hashtag_source TEXT;
CREATE INDEX IF NOT EXISTS idx_viral_videos_hashtag_source ON viral_videos(hashtag_source);
```

The index supports the cache guard query efficiently.

### 6. Display Bug Fix — Feed Sort Order

In `ViralToday.tsx`, `fetchVideos` changes:

```
.order("posted_at", { ascending: false })
→
.order("scraped_at", { ascending: false })
```

`scraped_at` is always `now()` at insert time (DB default). This ensures the most recently scraped batch (whether from channel or hashtag) always floats to the top of the feed.

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
User triggers scrape
  → Cache check: same hashtag scraped < 6h ago?
      YES → return cached, skip Apify
      NO  → call Apify (500 posts)
            → filter: discard views < 50K
            → score: compute velocity per post
            → rank: composite score (70/30), keep top 50
            → upsert to viral_videos (with hashtag_source, scraped_at)
```

---

## Creator Aggregation Compatibility

Hashtag-scraped videos have `channel_id = null` and `channel_username` set to the post owner. This is unchanged. The ViralToday "Channels" tab only shows `viral_channels` rows (which hashtag scrapes don't create), so channel-level metrics are unaffected. The "Videos" tab shows all `viral_videos` rows regardless of `channel_id`.

---

## What Is Not Changed

- `scrape-channel` — unaffected
- `fetch-instagram-top-posts` — unaffected
- `analyze-video-multimodal` — unaffected (not part of this pipeline)
- Any UI beyond the one-line sort change in `fetchVideos`
- Credit deduction logic
