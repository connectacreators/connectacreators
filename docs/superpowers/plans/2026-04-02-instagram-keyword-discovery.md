# Instagram Keyword Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins search Instagram Reels by keyword (e.g. "funny sales") to discover trending videos in any niche, and automatically clean up stale scraped data after 6 months.

**Architecture:** New VPS endpoint `/scrape-reels-search` calls Instagram's `clips/search` API with session cookies + WARP proxy. New Supabase edge function `scrape-reels-search` wraps it with admin-only auth + cache guard + post-processing. Frontend adds a "Search Instagram" button to the existing Videos tab search bar (admin-only) and a Source filter chip.

**Tech Stack:** Node.js (VPS), Deno (edge function), React/TypeScript (frontend), Supabase, Instagram private API

**Spec:** `docs/superpowers/specs/2026-04-02-instagram-keyword-discovery-design.md`

---

### Task 1: VPS Endpoint — `/scrape-reels-search`

**Files:**
- Modify: `/var/www/ytdlp-server.js` on VPS (add new route handler)

This runs on the VPS at 72.62.200.145. The file is modified via SSH/SCP, not locally.

- [ ] **Step 1: Write the route handler**

Add this route handler to `ytdlp-server.js` on VPS, alongside the existing `/scrape-profile` handler. It follows the same pattern: session cookies + WARP SOCKS5 proxy + curl + pagination with delays.

```javascript
// ── /scrape-reels-search — keyword search for Instagram Reels ───────────────
app.post('/scrape-reels-search', async (req, res) => {
  if (req.headers['x-api-key'] !== API_KEY) return res.status(401).json({ error: 'Unauthorized' });

  const { query, limit = 150 } = req.body;
  if (!query || typeof query !== 'string') return res.status(400).json({ error: 'query is required' });

  const safeLim = Math.min(limit, 150);
  console.log('Reels search:', JSON.stringify(query), 'limit:', safeLim);

  // Load session cookies
  let cookieHeader = '';
  let csrfToken = '';
  try {
    const cookies = JSON.parse(fs.readFileSync('/var/www/ig-session-cookies.json', 'utf8'));
    cookieHeader = cookies.map(c => c.name + '=' + c.value).join('; ');
    csrfToken = cookies.find(c => c.name === 'csrftoken')?.value || '';
    console.log('Loaded', cookies.length, 'session cookies');
  } catch (e) {
    console.log('No session cookies — cannot search Instagram');
    return res.status(500).json({ error: 'Instagram session expired', code: 'SESSION_EXPIRED' });
  }

  function igApiFetch(apiUrl, method, postData) {
    const args = [
      '-s', '--max-time', '20',
      '--socks5-hostname', '127.0.0.1:1080',
      '-H', 'User-Agent: Instagram 275.0.0.27.98 Android',
      '-H', 'X-IG-App-ID: 936619743392459',
      '-H', 'X-CSRFToken: ' + csrfToken,
      '-H', 'Cookie: ' + cookieHeader,
    ];
    if (method === 'POST') {
      args.push('-X', 'POST');
      args.push('-H', 'Content-Type: application/x-www-form-urlencoded');
      if (postData) args.push('-d', postData);
    }
    args.push(apiUrl);
    try {
      const result = require('child_process').execFileSync('curl', args, { maxBuffer: 10 * 1024 * 1024, timeout: 25000 });
      return JSON.parse(result.toString());
    } catch (e) {
      console.error('igApiFetch error:', e.message?.slice(0, 200));
      return null;
    }
  }

  const results = [];
  let maxId = '';
  let hasMore = true;
  let pageNum = 0;
  const MAX_PAGES = 5;

  try {
    while (results.length < safeLim && hasMore && pageNum < MAX_PAGES) {
      pageNum++;
      let postData = 'q=' + encodeURIComponent(query) + '&page_size=30';
      if (maxId) postData += '&max_id=' + maxId;

      console.log('Search page', pageNum + '/' + MAX_PAGES, 'total so far:', results.length);

      const data = igApiFetch('https://i.instagram.com/api/v1/clips/search/', 'POST', postData);

      if (!data || data.status !== 'ok') {
        console.log('Clips search failed on page', pageNum, 'status:', data?.status);
        if (data?.message?.includes('rate')) {
          return res.status(429).json({ error: 'Rate limited by Instagram', code: 'RATE_LIMITED' });
        }
        break;
      }

      const items = data.items || [];
      if (items.length === 0) break;

      for (const item of items) {
        const media = item.media;
        if (!media) continue;
        if (results.find(r => r.id === media.code)) continue;

        results.push({
          id: media.code,
          url: 'https://www.instagram.com/reel/' + media.code + '/',
          thumbnail: media.image_versions2?.candidates?.[0]?.url || null,
          title: media.caption?.text || '',
          views: media.play_count || media.view_count || 0,
          likes: media.like_count || 0,
          comments: media.comment_count || 0,
          posted_at: media.taken_at || 0,
          owner_username: media.user?.username || media.owner?.username || 'unknown',
        });
      }

      hasMore = data.paging_info?.more_available === true;
      maxId = data.paging_info?.max_id || '';
      if (!hasMore || !maxId) break;

      // 4-6s random delay
      const delay = 4000 + Math.floor(Math.random() * 2000);
      await new Promise(r => setTimeout(r, delay));
    }

    console.log('Search done:', results.length, 'results for', JSON.stringify(query));
    res.json({
      posts: results.slice(0, safeLim),
      totalPosts: results.length,
      query,
      platform: 'instagram',
    });
  } catch (err) {
    console.error('Reels search error:', err.message);
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 2: Deploy to VPS**

Write the handler to a temp file, SCP to VPS, inject into `ytdlp-server.js`, and restart the PM2 process:

```bash
# SCP the patch script to VPS
scp /tmp/add-reels-search.js root@72.62.200.145:/tmp/

# SSH to VPS and execute
ssh root@72.62.200.145 "node /tmp/add-reels-search.js && pm2 restart ytdlp-server"
```

- [ ] **Step 3: Test the endpoint**

SSH into VPS and test with curl:

```bash
curl -s -X POST http://127.0.0.1:3099/scrape-reels-search \
  -H "Content-Type: application/json" \
  -H "x-api-key: ytdlp_connecta_2026_secret" \
  -d '{"query":"funny sales","limit":10}' | python3 -m json.tool | head -40
```

Expected: JSON with `posts` array containing reels with `id`, `url`, `owner_username`, `views`, etc.

- [ ] **Step 4: Verify rate limiting works**

Confirm the response includes posts from different creators (various `owner_username` values), and that the delay between pages is respected in the PM2 logs:

```bash
ssh root@72.62.200.145 "pm2 logs ytdlp-server --lines 20 --nostream"
```

Expected: logs showing "Search page 1/5", delay, "Search page 2/5", etc.

---

### Task 2: Edge Function — `scrape-reels-search`

**Files:**
- Create: `supabase/functions/scrape-reels-search/index.ts`

- [ ] **Step 1: Create the edge function**

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const VPS_SERVER = "http://72.62.200.145:3099";
const VPS_API_KEY = "ytdlp_connecta_2026_secret";
const CACHE_TTL_HOURS = 6;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function shouldCacheThumbnail(url: string | null): boolean {
  if (!url) return false;
  return /cdninstagram\.com|fbcdn\.net|instagram\.f|scontent/.test(url);
}

async function cacheThumbnail(cdnUrl: string, key: string): Promise<string | null> {
  try {
    const res = await fetch(`${VPS_SERVER}/cache-thumbnail`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": VPS_API_KEY },
      body: JSON.stringify({ url: cdnUrl, key }),
    });
    if (!res.ok) return null;
    const { cached_url } = await res.json();
    return cached_url || null;
  } catch { return null; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // ── Auth: admin-only ──────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: "Unauthorized" }, 401);

  // Check admin role
  const { data: roleData } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (roleData?.role !== "admin") {
    return json({ error: "Admin access required" }, 403);
  }

  try {
    const { query } = await req.json();
    if (!query || typeof query !== "string" || !query.trim()) {
      return json({ error: "query is required" }, 400);
    }

    const cleanQuery = query.trim().toLowerCase();

    // ── Cache guard: skip if same query searched within 6 hours ────────────
    const cacheThreshold = new Date(Date.now() - CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString();
    const { data: cachedRow } = await adminClient
      .from("viral_videos")
      .select("id")
      .eq("hashtag_source", cleanQuery)
      .gt("scraped_at", cacheThreshold)
      .limit(1)
      .maybeSingle();

    if (cachedRow) {
      return json({
        inserted: 0,
        query: cleanQuery,
        cached: true,
        message: `Already searched "${cleanQuery}" within the last ${CACHE_TTL_HOURS} hours`,
      });
    }

    // ── Call VPS /scrape-reels-search ──────────────────────────────────────
    console.log(`[scrape-reels-search] Searching: "${cleanQuery}"`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    let vpsRes: Response;
    try {
      vpsRes = await fetch(`${VPS_SERVER}/scrape-reels-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": VPS_API_KEY },
        body: JSON.stringify({ query: cleanQuery, limit: 150 }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!vpsRes.ok) {
      const errBody = await vpsRes.json().catch(() => ({ error: "VPS error" }));
      throw new Error(errBody.error || `VPS HTTP ${vpsRes.status}`);
    }

    const vpsData = await vpsRes.json();
    const posts: any[] = vpsData.posts ?? [];
    console.log(`[scrape-reels-search] VPS returned ${posts.length} posts`);

    if (posts.length === 0) {
      return json({ inserted: 0, query: cleanQuery, cached: false, message: "No results found" });
    }

    // ── Process posts ─────────────────────────────────────────────────────
    const now = Date.now();
    const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;

    const videos = posts
      .map((post: any) => {
        const videoId = post.id;
        if (!videoId) return null;

        const views = Number(post.views) || 0;
        const likes = Number(post.likes) || 0;
        const comments = Number(post.comments) || 0;
        const engagementRate = views > 0 ? ((likes + comments) / views) * 100 : 0;

        let postedAt: string | null = null;
        if (post.posted_at) {
          const raw = post.posted_at;
          const num = typeof raw === "number" ? raw : Number(raw);
          if (!isNaN(num) && num > 0) {
            const ts = new Date(num < 2e10 ? num * 1000 : num);
            if (!isNaN(ts.getTime())) {
              if (ts.getTime() < oneYearAgo) return null; // too old
              postedAt = ts.toISOString();
            }
          } else if (typeof raw === "string") {
            const ts = new Date(raw);
            if (!isNaN(ts.getTime())) {
              if (ts.getTime() < oneYearAgo) return null;
              postedAt = ts.toISOString();
            }
          }
        }

        return {
          channel_id: null,
          channel_username: post.owner_username || "unknown",
          platform: "instagram",
          video_url: post.url,
          thumbnail_url: post.thumbnail || null,
          caption: (post.title ?? "").slice(0, 600),
          views_count: views,
          likes_count: likes,
          comments_count: comments,
          engagement_rate: Math.round(engagementRate * 100) / 100,
          outlier_score: 1, // recalculated below
          posted_at: postedAt,
          scraped_at: new Date().toISOString(),
          apify_video_id: String(videoId),
          hashtag_source: cleanQuery,
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null && v.apify_video_id !== null);

    if (videos.length === 0) {
      return json({ inserted: 0, query: cleanQuery, cached: false, message: "No recent videos found" });
    }

    // Calculate outlier scores (relative to batch average)
    const totalViews = videos.reduce((sum, v) => sum + v.views_count, 0);
    const avgViews = totalViews / videos.length;
    const videosWithOutlier = videos.map(v => ({
      ...v,
      outlier_score: avgViews > 0 ? Math.round((v.views_count / avgViews) * 10) / 10 : 1,
    }));

    // Cache CDN thumbnails
    for (const v of videosWithOutlier) {
      if (shouldCacheThumbnail(v.thumbnail_url) && v.apify_video_id) {
        const key = `search_${v.apify_video_id}`;
        const cached = await cacheThumbnail(v.thumbnail_url!, key);
        if (cached) v.thumbnail_url = cached;
      }
    }

    // ── Upsert ────────────────────────────────────────────────────────────
    const { error: upsertErr } = await adminClient
      .from("viral_videos")
      .upsert(videosWithOutlier, {
        onConflict: "platform,apify_video_id",
        ignoreDuplicates: false,
      });

    if (upsertErr) {
      console.error("[scrape-reels-search] Upsert error:", upsertErr);
      throw new Error("Database upsert failed: " + upsertErr.message);
    }

    console.log(`[scrape-reels-search] Upserted ${videosWithOutlier.length} videos for "${cleanQuery}"`);

    return json({
      inserted: videosWithOutlier.length,
      query: cleanQuery,
      total_scraped: posts.length,
      cached: false,
    });
  } catch (e: any) {
    console.error("[scrape-reels-search] Error:", e);
    return json({ error: e.message || "Unknown error" }, 500);
  }
});
```

- [ ] **Step 2: Deploy the edge function**

```bash
SUPABASE_ACCESS_TOKEN=sbp_1d2c448ddcdac6bbfea59ee7e2dec86640427574 \
  npx supabase functions deploy scrape-reels-search \
  --no-verify-jwt --project-ref hxojqrilwhhrvloiwmfo
```

Expected: "Deployed Functions on project hxojqrilwhhrvloiwmfo: scrape-reels-search"

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/scrape-reels-search/index.ts
git commit -m "feat: add scrape-reels-search edge function (admin-only keyword discovery)"
```

---

### Task 3: Data Cleanup in Auto-Scrape Cron

**Files:**
- Modify: `supabase/functions/auto-scrape-channels/index.ts` (add cleanup step before the final return)

- [ ] **Step 1: Add the cleanup step**

Insert after the channel processing loop (after line 294 `if (result.error) errors.push(...)`) and before the final `return json(...)`:

```typescript
    // ── Cleanup: delete videos scraped more than 6 months ago ─────────────
    let cleanedUp = 0;
    try {
      const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
      const { data: staleRows, error: deleteErr } = await supabase
        .from("viral_videos")
        .delete()
        .lt("scraped_at", sixMonthsAgo)
        .select("channel_id", { count: "exact", head: true });

      cleanedUp = staleRows ? (staleRows as any).length ?? 0 : 0;
      if (deleteErr) {
        console.error("Cleanup delete error:", deleteErr);
      } else if (cleanedUp > 0) {
        console.log(`Cleaned up ${cleanedUp} stale videos (scraped > 6 months ago)`);
        // Recalculate video_count for all channels
        const { data: channelCounts } = await supabase
          .from("viral_videos")
          .select("channel_id")
          .not("channel_id", "is", null);

        if (channelCounts) {
          const counts: Record<string, number> = {};
          for (const row of channelCounts) {
            if (row.channel_id) counts[row.channel_id] = (counts[row.channel_id] || 0) + 1;
          }
          for (const [chId, count] of Object.entries(counts)) {
            await supabase.from("viral_channels").update({ video_count: count }).eq("id", chId);
          }
        }
      }
    } catch (cleanupErr: any) {
      console.error("Cleanup error:", cleanupErr.message);
    }
```

Then update the return statement to include `cleaned_up`:

```typescript
    return json({
      success: true,
      mode,
      processed: sortedChannels.length,
      new_videos: totalNewVideos,
      errors,
      cleaned_up: cleanedUp,
    });
```

- [ ] **Step 2: Deploy the updated function**

```bash
SUPABASE_ACCESS_TOKEN=sbp_1d2c448ddcdac6bbfea59ee7e2dec86640427574 \
  npx supabase functions deploy auto-scrape-channels \
  --no-verify-jwt --project-ref hxojqrilwhhrvloiwmfo
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/auto-scrape-channels/index.ts
git commit -m "feat: add 6-month data cleanup to auto-scrape cron"
```

---

### Task 4: Frontend — "Search Instagram" Button + Source Filter

**Files:**
- Modify: `src/pages/ViralToday.tsx`

- [ ] **Step 1: Add state for discovery search**

After the existing `const [search, setSearch] = useState("");` (line 732), add:

```typescript
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [filterSource, setFilterSource] = useState("all"); // "all" | "channels" | "discovered"
```

- [ ] **Step 2: Add the discovery handler**

After the existing `handleDeleteChannel` function (around line 987), add:

```typescript
  const handleDiscoverSearch = async () => {
    if (!search.trim() || isDiscovering) return;
    setIsDiscovering(true);
    try {
      const { data, error } = await supabase.functions.invoke("scrape-reels-search", {
        body: { query: search.trim() },
      });
      if (error) throw error;
      if (data?.cached) {
        toast.info(`Already searched "${search.trim()}" recently`);
      } else {
        toast.success(`Found ${data?.inserted ?? 0} videos for "${search.trim()}"`);
        fetchVideos();
      }
    } catch (e: any) {
      toast.error(e.message || "Search failed");
    } finally {
      setIsDiscovering(false);
    }
  };
```

- [ ] **Step 3: Add source filter to the filter logic**

Inside the `filteredVideos` IIFE (around line 1000), add a source filter block after the channel filter and before the platform filter:

```typescript
    // Source filter
    if (filterSource === "channels") {
      result = result.filter((v) => v.channel_id !== null);
    } else if (filterSource === "discovered") {
      result = result.filter((v) => v.channel_id === null);
    }
```

- [ ] **Step 4: Update `hasActiveFilters` and `clearFilters`**

Add `filterSource` to `hasActiveFilters`:

```typescript
  const hasActiveFilters =
    filterPlatform !== "all" ||
    filterDate !== "12months" ||
    filterOutlier !== "0" ||
    filterViews !== "0" ||
    filterEngagement !== "0" ||
    filterSource !== "all" ||
    selectedChannelIds.length > 0;
```

Add to `clearFilters`:

```typescript
  const clearFilters = () => {
    setFilterDate("12months");
    setFilterPlatform("all");
    setFilterOutlier("0");
    setFilterViews("0");
    setFilterEngagement("0");
    setFilterSource("all");
    setSelectedChannelIds([]);
    setSearch("");
    setCurrentPage(0);
  };
```

- [ ] **Step 5: Add "Search Instagram" button to the search bar**

In the Videos tab search bar section (around line 1200), add the button after the search input's wrapping `<div>` and before the Sort `<FilterChip>`:

```tsx
                  {/* Search Instagram — admin only */}
                  {isAdmin && (
                    <Button
                      onClick={handleDiscoverSearch}
                      disabled={isDiscovering || !search.trim()}
                      className="h-8 px-3 bg-pink-500/15 hover:bg-pink-500/25 border border-pink-500/30 text-pink-400 text-[11px] font-semibold rounded-lg flex items-center gap-1.5 transition-all shrink-0"
                    >
                      {isDiscovering ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Instagram className="w-3 h-3" />
                      )}
                      {isDiscovering ? "Searching…" : "Search Instagram"}
                    </Button>
                  )}
```

- [ ] **Step 6: Add Source filter chip to filter bar**

Add a new `FilterChip` in the filter chips row (around line 1232), after the `<SlidersHorizontal>` icon and before the `<ChannelChip>`:

```tsx
                  <FilterChip
                    label="Source"
                    options={[
                      { label: "All sources", value: "all" },
                      { label: "Channels", value: "channels" },
                      { label: "Discovered", value: "discovered" },
                    ]}
                    value={filterSource}
                    onChange={setFilterSource}
                    isActive={filterSource !== "all"}
                  />
```

- [ ] **Step 7: Build and verify**

```bash
npm run build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 8: Deploy to VPS**

```bash
scp -r dist/. root@72.62.200.145:/var/www/connectacreators/
ssh root@72.62.200.145 "nginx -s reload"
```

- [ ] **Step 9: Commit**

```bash
git add src/pages/ViralToday.tsx
git commit -m "feat: add Search Instagram button (admin) + source filter to Viral Today"
```

---

### Task 5: End-to-End Test

- [ ] **Step 1: Test the full flow**

1. Go to `connectacreators.com/viral-today` logged in as admin
2. Switch to the Videos tab
3. Type "funny sales" in the search bar
4. Click "Search Instagram" button
5. Wait for the search to complete (~30s)
6. Verify toast shows "Found X videos for 'funny sales'"
7. Verify new videos appear in the grid with various `@usernames`
8. Click the "Source" filter → select "Discovered" → verify only keyword-discovered videos appear
9. Click "Source" → "Channels" → verify only channel-scraped videos appear
10. Click "Source" → "All sources" → verify everything appears

- [ ] **Step 2: Test cache guard**

1. Search "funny sales" again immediately
2. Verify toast shows "Already searched 'funny sales' recently"
3. Verify no new VPS call was made (instant response)

- [ ] **Step 3: Test non-admin access**

1. Log in as a non-admin user
2. Go to Viral Today → Videos tab
3. Verify the "Search Instagram" button is NOT visible
4. Verify the Source filter chip IS visible (everyone can filter, only admins can trigger new searches)
