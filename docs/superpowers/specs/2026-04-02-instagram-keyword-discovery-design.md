# Instagram Keyword Discovery + Data Cleanup

**Date:** 2026-04-02
**Status:** Approved
**Scope:** VPS endpoint, edge function, ViralToday.tsx UI, data cleanup cron

## Problem

Viral Today only discovers content by scraping specific profiles. Admins have no way to search "what's trending right now" in a niche. They must already know which creators to follow. This limits content discovery to known channels.

Additionally, `viral_videos` grows unbounded — no cleanup exists for stale data.

## Solution

1. Instagram Reels keyword search via authenticated API
2. Admin-only "Search Instagram" button in the existing Videos tab search bar
3. Automatic 6-month cleanup of stale scraped data

---

## 1. VPS Endpoint: `/scrape-reels-search`

**Location:** `/var/www/ytdlp-server.js` (new route handler)

### Request

```
POST /scrape-reels-search
Headers: x-api-key: ytdlp_connecta_2026_secret
Body: { "query": "funny sales", "limit": 150 }
```

### Implementation

- Calls `POST https://i.instagram.com/api/v1/clips/search/` with form-encoded body `q=<query>&page_size=30`
- Uses existing session cookies from `/var/www/ig-session-cookies.json`
- Routes through Cloudflare WARP SOCKS5 proxy (`--socks5-hostname 127.0.0.1:1080`) via `execFileSync("curl", [...])`
- Same headers as profile scraping: `User-Agent: Instagram 275.0.0.27.98 Android`, `X-IG-App-ID: 936619743392459`, `X-CSRFToken`, `Cookie`
- Paginates up to 5 pages using `max_id` from `paging_info`
- 4-6 second random delay between pages (same safety pattern as profile scraper)
- Hard cap: `Math.min(limit, 150)` — never more than 150 results

### Response

```json
{
  "posts": [
    {
      "id": "CxYz123abc",
      "url": "https://www.instagram.com/reel/CxYz123abc/",
      "thumbnail": "https://cdninstagram.com/...",
      "title": "When the client says they want it 'clean' #sales #funny",
      "views": 500000,
      "likes": 12000,
      "comments": 340,
      "posted_at": 1711900000,
      "owner_username": "salesguy_mike"
    }
  ],
  "totalPosts": 142,
  "query": "funny sales",
  "platform": "instagram"
}
```

Each post includes `owner_username` since results come from different creators.

### Error Handling

- If session cookies are missing/expired: return `{ error: "Instagram session expired", code: "SESSION_EXPIRED" }`
- If Instagram returns 429: return `{ error: "Rate limited", code: "RATE_LIMITED" }`
- If query returns no results: return `{ posts: [], totalPosts: 0, query }`

---

## 2. Edge Function: `scrape-reels-search`

**Location:** `supabase/functions/scrape-reels-search/index.ts`

### Auth

- Validates JWT from Authorization header
- Queries `user_roles` table — **only `role = 'admin'` allowed**
- Non-admins receive `403 Forbidden`

### Cache Guard

Before calling VPS, check if this exact query was searched recently:

```sql
SELECT id FROM viral_videos
WHERE hashtag_source = <query> AND scraped_at > NOW() - INTERVAL '6 hours'
LIMIT 1
```

If found, return `{ cached: true, message: "Results from cache (searched < 6h ago)" }` without calling VPS.

### VPS Call

- `POST http://72.62.200.145:3099/scrape-reels-search` with `{ query, limit: 150 }`
- 60-second timeout (keyword search may be slower than profile scrape)

### Post Processing

Same pipeline as `scrape-channel`:

1. Filter: drop posts older than 12 months (`posted_at`)
2. Filter: drop posts with no `id`
3. Parse `posted_at` (unix timestamp or ISO string → ISO)
4. Calculate `engagement_rate`: `(likes + comments) / views * 100`
5. Calculate batch `avg_views` and `outlier_score` per video: `views / avg_views`
6. Cache expiring CDN thumbnails via VPS `/cache-thumbnail`

### Storage

Upsert to `viral_videos`:

```typescript
{
  channel_id: null,                    // no channel — discovered content
  channel_username: post.owner_username,  // the creator
  platform: "instagram",
  video_url: post.url,
  thumbnail_url: post.thumbnail,       // or cached VPS URL
  caption: post.title.slice(0, 600),
  views_count: post.views,
  likes_count: post.likes,
  comments_count: post.comments,
  engagement_rate: calculated,
  outlier_score: calculated,
  posted_at: parsed,
  scraped_at: new Date().toISOString(),
  apify_video_id: post.id,            // shortcode for dedup
  hashtag_source: query,               // reuse existing column for source/cache key
}
```

Dedup: `onConflict: "platform,apify_video_id"`, `ignoreDuplicates: false` (updates stats on re-search).

### Response

```json
{
  "inserted": 87,
  "query": "funny sales",
  "total_scraped": 142,
  "cached": false
}
```

---

## 3. Frontend: ViralToday.tsx Videos Tab

### Search Bar Enhancement

The existing search bar in the Videos tab currently filters locally by caption/username text. Changes:

**For all users:** No change. Type to filter, press Enter or just type — instant local filter.

**For admins only:** A "Search Instagram" button appears to the right of the search bar.

```
[🔍 Search videos...                           ] [ 🔎 Search Instagram ]
```

- Button only visible when `isAdmin === true`
- Button disabled when search input is empty or a search is in progress
- On click:
  1. Set `isDiscovering = true` (loading state)
  2. Call `supabase.functions.invoke("scrape-reels-search", { body: { query: searchText } })`
  3. On success: toast "Found X videos for '{query}'" + refresh video list
  4. On cached: toast "Already searched '{query}' recently"
  5. On error: toast error message
  6. Set `isDiscovering = false`
- While loading: button shows spinner, text changes to "Searching..."

### Source Filter Chip

New filter added to the existing filter bar (alongside Platform, Outlier, Views, etc.):

**Label:** "Source"
**Options:**
- `All` (default) — shows all videos
- `Channels` — `channel_id IS NOT NULL` (profile-scraped videos)
- `Discovered` — `channel_id IS NULL` (keyword-discovered videos)

Implementation: frontend-only filter applied to the already-fetched `videos` array. No DB query change needed.

### Video Card — Owner Badge

For discovered videos (`channel_id === null`), the video card shows the `channel_username` with a subtle "discovered" indicator so the admin knows this video came from a keyword search, not a monitored channel.

No major card redesign — just display `@owner_username` where the channel name normally appears, since these videos already have `channel_username` populated with the creator's handle.

---

## 4. Data Cleanup: 6-Month Scraped-At Pruning

### Location

Added as a final step in `auto-scrape-channels/index.ts` (daily cron).

### Logic

```sql
DELETE FROM viral_videos WHERE scraped_at < NOW() - INTERVAL '6 months'
```

### Post-Cleanup

After deletion, update affected channels:

```sql
-- For each channel that had videos deleted, recalculate video_count
UPDATE viral_channels SET
  video_count = (SELECT COUNT(*) FROM viral_videos WHERE channel_id = viral_channels.id)
WHERE id IN (
  -- channels that had at least one video before the cutoff
  SELECT DISTINCT channel_id FROM viral_videos WHERE channel_id IS NOT NULL
)
```

### Logging

Log the count of deleted rows in the cron response: `{ ..., cleaned_up: 47 }`.

### Safety

- Videos re-scraped by daily cron have `scraped_at` refreshed → they survive
- Discovered videos that haven't been re-searched → cleaned up after 6 months
- No user confirmation needed — fully automatic

---

## 5. Files Changed

| File | Change |
|------|--------|
| `/var/www/ytdlp-server.js` | Add `/scrape-reels-search` route handler |
| `supabase/functions/scrape-reels-search/index.ts` | New edge function |
| `supabase/functions/auto-scrape-channels/index.ts` | Add 6-month cleanup step at end |
| `src/pages/ViralToday.tsx` | Add "Search Instagram" button (admin), source filter chip |

---

## 6. Out of Scope (Future)

- TikTok keyword search (Instagram first, TikTok later)
- Non-admin access to keyword discovery
- Saved keyword searches (admin saves keywords, cron auto-runs them daily)
- Daily auto-search trending topics
