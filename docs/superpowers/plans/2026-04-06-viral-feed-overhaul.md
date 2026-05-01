# Viral Feed Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three critical UX bugs: Grid video disappearing/re-sorting, Reels auto-scroll interruption, and repeated video display — by making the Grid a pure data explorer and the Reels feed a batch-gated, frozen-order Instagram-style experience.

**Architecture:** Grid View strips all session-tracking and algorithm penalties, keeping only a simplified "For You" sort with niche+unseen boosts. Reels Feed freezes video order after construction, hard-filters videos seen 3+ times, and uses a new `/resolve-batch` VPS endpoint to pre-cache videos in batches of 10 before showing them. No mid-session re-sorting or auto-scrolling in either view.

**Tech Stack:** React (TypeScript), Supabase (viral_video_interactions table), Node.js VPS server (Express on port 3099), Instagram Private API, Cobalt (port 9001), yt-dlp

---

## File Structure

| File | Changes |
|------|---------|
| `src/pages/ViralToday.tsx` | Remove session-tracking machinery, simplify "For You" sort, remove eye toggle |
| `src/pages/ViralReelFeed.tsx` | Batch-gated playback, frozen feed order, seen 3+ filter, remove re-sort/anchoring |
| VPS: `/var/www/ytdlp-server.js` | Add `POST /resolve-batch` endpoint |

---

### Task 1: Strip Session Tracking from Grid View (ViralToday.tsx)

**Files:**
- Modify: `src/pages/ViralToday.tsx`

**What to remove:**
- `seenThisSession` ref (line 911)
- `flushTimerRef` ref (line 912)
- `showSeen` state (line 903)
- `flushSeen` callback (lines 1099-1111)
- Flush timer effect (lines 1113-1122)
- `reportSeen` callback (lines 1125-1127)
- `onSeen={reportSeen}` prop on VideoCard (line 1820)
- Eye toggle button in toolbar (lines 1676-1689)
- `seen_count >= 4` hard-filter in `filteredVideos` (lines 1417-1423)

**What to keep:**
- `initialInteractions` fetch (for unseen_bonus in "For You" sort) — read-only
- `reportClick` callback (for click tracking to DB)
- All existing sort options, filters, pagination

- [ ] **Step 1: Remove `seenThisSession` ref, `flushTimerRef` ref, and `showSeen` state**

In `src/pages/ViralToday.tsx`, delete these three declarations:

```typescript
// DELETE line 903:
const [showSeen, setShowSeen] = useState(true);

// DELETE line 911:
const seenThisSession = useRef<Set<string>>(new Set());

// DELETE line 912:
const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
```

- [ ] **Step 2: Remove `flushSeen` callback and its timer effect**

Delete the `flushSeen` callback (lines 1096-1111) and the timer/beforeunload effect (lines 1113-1122):

```typescript
// DELETE lines 1096-1122 (the entire flushSeen callback + timer effect)
```

- [ ] **Step 3: Remove `reportSeen` callback**

Delete lines 1124-1127:

```typescript
// DELETE:
const reportSeen = useCallback((videoId: string) => {
  seenThisSession.current.add(videoId);
}, []);
```

- [ ] **Step 4: Remove `onSeen` prop from VideoCard**

At line 1820, remove the `onSeen={reportSeen}` prop:

```tsx
// BEFORE:
<VideoCard
  key={v.id}
  video={v}
  isAdmin={isAdmin}
  onDelete={(id) => setVideos((prev) => prev.filter((x) => x.id !== id))}
  selected={selectedVideos.has(v.id)}
  onToggleSelect={toggleVideoSelect}
  onSeen={reportSeen}          // ← DELETE THIS LINE
  onClickVideo={reportClick}
/>
```

- [ ] **Step 5: Remove eye toggle button from toolbar**

Delete the eye toggle button (lines 1676-1689):

```tsx
// DELETE these lines:
{/* Show seen toggle */}
<button
  onClick={() => setShowSeen(s => !s)}
  className={cn(
    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border",
    showSeen
      ? "bg-primary/15 border-primary/30 text-primary"
      : "bg-muted/50 border-border text-muted-foreground hover:text-foreground"
  )}
  title={showSeen ? "All videos shown (click to hide seen videos)" : "Seen videos hidden (click to show all)"}
>
  <Eye className="w-3.5 h-3.5" />
  {showSeen ? "All" : "Fresh"}
</button>
```

- [ ] **Step 6: Remove `seen_count >= 4` hard-filter from `filteredVideos`**

Delete lines 1417-1423 from the `filteredVideos` computation:

```typescript
// DELETE:
// Hard hide: remove videos seen 4+ times (unless "Show seen" is on)
if (!showSeen) {
  result = result.filter(v => {
    const inter = initialInteractions.get(v.id);
    return !inter || inter.seen_count < 4;
  });
}
```

- [ ] **Step 7: Simplify `buildFeedScorer` — replace seen penalty with unseen bonus**

Replace the scoring function at lines 281-317 with simplified version:

```typescript
function buildFeedScorer(
  interactions: Map<string, { seen_count: number; clicked: boolean }>,
  nicheKeywords: string[],
  userChannelIds: Set<string>,
) {
  return (v: ViralVideo, now: number): number => {
    // 1. Outlier base (0–100+)
    let score = v.outlier_score * 10;

    // 2. Recency boost (0–30): 30 pts if today, 0 if 90+ days old
    const ageMs = now - new Date(v.posted_at ?? v.scraped_at).getTime();
    const ageDays = ageMs / 86_400_000;
    score += Math.max(0, 30 - (ageDays / 90) * 30);

    // 3. Niche relevance (+40)
    if (nicheKeywords.length > 0) {
      const text = ((v.caption || "") + " " + v.channel_username).toLowerCase();
      if (nicheKeywords.some(kw => text.includes(kw))) {
        score += 40;
      }
    }

    // 4. Channel affinity (+20) — user added this channel
    if (v.channel_id && userChannelIds.has(v.channel_id)) {
      score += 20;
    }

    // 5. Unseen bonus (+25) — reward videos the user hasn't seen
    const inter = interactions.get(v.id);
    if (!inter) {
      score += 25;
    }
    // No seen_count penalty, no click penalty — Grid shows everything equally

    return score;
  };
}
```

- [ ] **Step 8: Verify Grid builds and renders correctly**

Run: `npm run build` on VPS
Expected: Build succeeds with no TypeScript errors related to removed variables.

- [ ] **Step 9: Commit Grid View changes**

```bash
git add src/pages/ViralToday.tsx
git commit -m "feat(viral): strip session tracking from Grid view, simplify For You sort

Grid is now a pure data explorer — no session tracking, no seen penalty,
no mid-session re-sorting. For You sort uses unseen_bonus (+25) instead
of seen_count penalty."
```

---

### Task 2: Add `POST /resolve-batch` Endpoint to VPS Server

**Files:**
- Modify: `/var/www/ytdlp-server.js` (VPS)

This endpoint resolves and caches videos in parallel batches. The frontend will call it with up to 10 videos at a time.

- [ ] **Step 1: Add the `/resolve-batch` endpoint to `ytdlp-server.js`**

Add after the existing `/prefetch` endpoint (around line 1400). This endpoint:
- Accepts `{ videos: [{ url, platform }] }`
- For each video, extracts the shortcode/ID
- Checks disk cache first (`/var/www/video-cache/{plat}_{code}.mp4`)
- Resolves uncached videos in parallel (max 3 concurrent per request):
  - Instagram: IG Private API → download video to cache
  - TikTok: Cobalt (port 9001) → download to cache
  - YouTube: yt-dlp `--get-url` → download to cache
- Returns `{ results: { code: cachedUrl }, failed: [code] }`
- 30s timeout per video, global semaphore of 5 total concurrent downloads

```javascript
// ── POST /resolve-batch ── Batch video resolution + caching ──────────────
// Used by Reels feed to pre-cache videos before showing them.
// Request: { videos: [{ url, platform }] }
// Response: { results: { CODE: "https://connectacreators.com/video-cache/ig_CODE.mp4" }, failed: ["CODE"] }

let batchSemaphore = 0;
const MAX_BATCH_CONCURRENT = 5;

app.post('/resolve-batch', async (req, res) => {
  const { videos } = req.body;
  if (!Array.isArray(videos) || videos.length === 0) {
    return res.json({ results: {}, failed: [] });
  }

  const results = {};
  const failed = [];

  // Extract code from URL
  function extractCode(url) {
    const m = url.match(/\/reel\/([^/?]+)/) ||
              url.match(/\/p\/([^/?]+)/) ||
              url.match(/\/video\/([^/?]+)/) ||
              url.match(/\/shorts\/([^/?]+)/);
    return m ? m[1] : null;
  }

  // Platform prefix for cache filename
  function platPrefix(platform) {
    if (platform === 'instagram') return 'ig';
    if (platform === 'tiktok') return 'tt';
    return 'yt';
  }

  // Resolve a single video — returns cached URL or null
  async function resolveOne(video) {
    const code = extractCode(video.url);
    if (!code) return null;

    const prefix = platPrefix(video.platform);
    const cachePath = `/var/www/video-cache/${prefix}_${code}.mp4`;

    // Check disk cache first
    try {
      await fs.promises.access(cachePath);
      return { code, url: `https://connectacreators.com/video-cache/${prefix}_${code}.mp4` };
    } catch {}

    // Wait for global semaphore
    while (batchSemaphore >= MAX_BATCH_CONCURRENT) {
      await new Promise(r => setTimeout(r, 200));
    }
    batchSemaphore++;

    try {
      let cdnUrl = null;

      if (video.platform === 'instagram') {
        // IG Private API
        cdnUrl = await resolveIgVideoUrl(code);
      } else if (video.platform === 'tiktok') {
        // Cobalt
        cdnUrl = await resolveCobaltUrl(video.url);
      } else if (video.platform === 'youtube') {
        // yt-dlp
        cdnUrl = await resolveYtdlpUrl(video.url);
      }

      if (cdnUrl) {
        // Download to cache
        await downloadToCache(cdnUrl, cachePath);
        return { code, url: `https://connectacreators.com/video-cache/${prefix}_${code}.mp4` };
      }
      return null;
    } catch (err) {
      console.error(`[resolve-batch] Failed ${code}:`, err.message);
      return null;
    } finally {
      batchSemaphore--;
    }
  }

  // Helper: resolve Instagram video URL via Private API
  async function resolveIgVideoUrl(code) {
    try {
      const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
      let mediaId = BigInt(0);
      for (const c of code) {
        mediaId = mediaId * BigInt(64) + BigInt(ALPHA.indexOf(c));
      }

      const cookies = getNextIgCookies();
      const curlCmd = `curl -s --max-time 15 --proxy socks5h://127.0.0.1:1080 ` +
        `-H "User-Agent: Instagram 275.0.0.27.98 Android" ` +
        `-H "Cookie: ${cookies}" ` +
        `"https://i.instagram.com/api/v1/media/${mediaId}/info/"`;

      const { stdout } = await execPromise(curlCmd, { timeout: 20000 });
      const data = JSON.parse(stdout);
      const item = data.items?.[0];
      if (!item) return null;

      const versions = item.video_versions || item.carousel_media?.[0]?.video_versions;
      if (!versions?.length) return null;
      return versions[0].url;
    } catch {
      return null;
    }
  }

  // Helper: resolve via Cobalt
  async function resolveCobaltUrl(url) {
    try {
      const resp = await fetch('http://localhost:9001/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ url, videoQuality: '720' }),
      });
      const data = await resp.json();
      if (data.status === 'redirect' || data.status === 'stream') {
        return data.url;
      }
      if (data.status === 'picker' && data.picker?.[0]?.url) {
        return data.picker[0].url;
      }
      return null;
    } catch {
      return null;
    }
  }

  // Helper: resolve via yt-dlp
  async function resolveYtdlpUrl(url) {
    try {
      const { stdout } = await execPromise(
        `yt-dlp --get-url -f "best[height<=720]" "${url}"`,
        { timeout: 20000 }
      );
      return stdout.trim().split('\n')[0] || null;
    } catch {
      return null;
    }
  }

  // Helper: download CDN URL to local cache file
  async function downloadToCache(cdnUrl, cachePath) {
    const tmpPath = cachePath + '.tmp';
    const { stdout: curlOut } = await execPromise(
      `curl -s -L --max-time 30 -o "${tmpPath}" "${cdnUrl}"`,
      { timeout: 35000 }
    );
    // Verify file exists and has content
    const stat = await fs.promises.stat(tmpPath);
    if (stat.size < 1000) {
      await fs.promises.unlink(tmpPath).catch(() => {});
      throw new Error('Downloaded file too small');
    }
    await fs.promises.rename(tmpPath, cachePath);
  }

  // Process videos with concurrency limit of 3 per request
  const BATCH_CONCURRENCY = 3;
  const chunks = [];
  for (let i = 0; i < videos.length; i += BATCH_CONCURRENCY) {
    chunks.push(videos.slice(i, i + BATCH_CONCURRENCY));
  }

  for (const chunk of chunks) {
    const settled = await Promise.allSettled(
      chunk.map(v => {
        const code = extractCode(v.url);
        return Promise.race([
          resolveOne(v),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 30000)),
        ]).then(result => {
          if (result) {
            results[result.code] = result.url;
          } else if (code) {
            failed.push(code);
          }
        }).catch(() => {
          if (code) failed.push(code);
        });
      })
    );
  }

  res.json({ results, failed });
});
```

- [ ] **Step 2: Verify the endpoint uses existing IG API patterns**

Check that `getNextIgCookies()`, `execPromise`, and the WARP proxy pattern match what's already in `ytdlp-server.js`. The helper functions above mirror the existing `/stream-reel` and `/resolve-thumb` patterns. If `getNextIgCookies` or `execPromise` aren't available at that scope, use the existing global versions.

- [ ] **Step 3: Test the endpoint manually**

```bash
curl -X POST https://connectacreators.com/api/resolve-batch \
  -H "Content-Type: application/json" \
  -d '{"videos":[{"url":"https://www.instagram.com/reel/DGoV5YxsDiK/","platform":"instagram"}]}'
```

Expected: `{ "results": { "DGoV5YxsDiK": "https://connectacreators.com/video-cache/ig_DGoV5YxsDiK.mp4" }, "failed": [] }`

- [ ] **Step 4: Restart the VPS server**

```bash
pm2 restart ytdlp-server
```

- [ ] **Step 5: Commit VPS changes**

```bash
git add /var/www/ytdlp-server.js
git commit -m "feat(vps): add POST /resolve-batch endpoint for batch video resolution

Resolves videos in parallel (max 3 per request, 5 global concurrent),
caches to disk, returns map of code → cached URL. Supports Instagram
(IG Private API), TikTok (Cobalt), and YouTube (yt-dlp)."
```

---

### Task 3: Rewrite Reels Feed Construction (ViralReelFeed.tsx)

**Files:**
- Modify: `src/pages/ViralReelFeed.tsx`

**What to remove:**
- `failedVideoIds` state and `failedVideoIdsRef` ref (lines 145-146)
- `algorithmNavigating` ref (line 125)
- `currentVideoIdRef` ref (line 152)
- `sortedVideos` useMemo with `-9999` penalty (lines 213-233)
- Anchoring effect (lines 237-270)
- `currentVideoIdRef` update effect (lines 273-276)
- Stall timeout effect (lines 405-430)
- Algorithm-skip in playback reset effect (lines 393-403)
- `buildUrlMap` callback (lines 154-186)
- Fire-and-forget prefetch effect (lines 574-587)
- `urlMap.get(v.id)` references in video rendering (line 800)
- Failed video error UI and retry buttons (lines 787, 855-900, 893-901)
- `failedVideoIds.has(v.id)` checks in loading spinner (line 904)

**What to add:**
- `feedVideos` state — frozen array, set once, never recomputed
- `batchUrlMap` state — maps video ID → cached URL, updated per batch
- `currentBatch` ref — tracks which batch is loaded
- `batchLoading` state — shows loading UI between batches
- Batch resolution logic using `/resolve-batch`
- Seen 3+ hard-filter during feed construction
- Empty state when all videos are seen

- [ ] **Step 1: Remove old state/refs and add new batch state**

Replace the old state declarations (around lines 102-152) — keep what's needed, remove what's not:

**Remove these declarations:**
```typescript
// DELETE:
const [failedVideoIds, setFailedVideoIds] = useState<Set<string>>(new Set());
const failedVideoIdsRef = useRef<Set<string>>(new Set());
const currentVideoIdRef = useRef<string | null>(null);
const algorithmNavigating = useRef(false);
```

**Add new batch state (after existing state declarations):**
```typescript
// ── Batch-gated playback state ──
const [feedVideos, setFeedVideos] = useState<ViralVideo[]>([]); // frozen feed order
const [batchUrlMap, setBatchUrlMap] = useState<Map<string, string>>(new Map()); // video ID → cached URL
const currentBatchRef = useRef(0); // which batch is currently loaded
const [batchLoading, setBatchLoading] = useState(false); // true while waiting for a batch
const [initialLoading, setInitialLoading] = useState(true); // true until first batch is ready
const BATCH_SIZE = 10;
```

- [ ] **Step 2: Remove `buildUrlMap` callback**

Delete lines 154-186 (the entire `buildUrlMap` useCallback).

- [ ] **Step 3: Replace `sortedVideos` useMemo with frozen feed construction**

Delete the `sortedVideos` useMemo (lines 213-233) and the anchoring effect (lines 237-270) and the `currentVideoIdRef` update effect (lines 273-276).

Replace with a feed construction function that runs once:

```typescript
// ── Build frozen feed from videos + interactions ──
// Runs once when both videos and interactions are loaded. Never recomputes.
const buildFeed = useCallback((allVideos: ViralVideo[], interactions: Map<string, { seen_count: number; clicked: boolean }>) => {
  const now = Date.now();

  // Hard-filter: remove videos seen 3+ times
  const filtered = allVideos.filter(v => {
    const inter = interactions.get(v.id);
    return !inter || inter.seen_count < 3;
  });

  // Score and sort
  const scored = filtered.map(v => {
    let score = v.outlier_score * 10;

    // Recency (0-30)
    const ageDays = (now - new Date((v as any).posted_at ?? (v as any).scraped_at ?? now).getTime()) / 86_400_000;
    score += Math.max(0, 30 - (ageDays / 90) * 30);

    // Niche match (+40)
    if (nicheKeywords.length > 0) {
      const text = ((v.caption || "") + " " + v.channel_username).toLowerCase();
      if (nicheKeywords.some(kw => text.includes(kw))) score += 40;
    }

    // Channel affinity (+20)
    if ((v as any).channel_id && userChannelIds.has((v as any).channel_id)) score += 20;

    // Unseen bonus (+25) or seen penalty (-15 per view for 1-2 views)
    const inter = interactions.get(v.id);
    if (!inter) {
      score += 25;
    } else {
      score -= inter.seen_count * 15;
    }

    return { video: v, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.video);
}, [nicheKeywords, userChannelIds]);
```

- [ ] **Step 4: Add batch resolution function**

```typescript
// ── Resolve a batch of videos via /resolve-batch ──
const resolveBatch = useCallback(async (batchVideos: ViralVideo[]): Promise<Map<string, string>> => {
  const map = new Map<string, string>();
  if (!batchVideos.length) return map;

  try {
    const payload = batchVideos.map(v => ({ url: v.video_url, platform: v.platform }));
    const res = await fetch(`${VPS_API}/resolve-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videos: payload }),
    });
    const data = await res.json();

    // Map results back to video IDs
    batchVideos.forEach(v => {
      const code = (v.video_url.match(/\/reel\/([^/?]+)/) ||
                    v.video_url.match(/\/p\/([^/?]+)/) ||
                    v.video_url.match(/\/video\/([^/?]+)/) ||
                    v.video_url.match(/\/shorts\/([^/?]+)/))?.[1];
      if (code && data.results[code]) {
        map.set(v.id, data.results[code]);
      }
      // Failed videos: fall back to stream-reel
      if (code && data.failed?.includes(code)) {
        map.set(v.id, `${VPS_API}/stream-reel?url=${encodeURIComponent(v.video_url)}`);
      }
    });

    // Anything not in results or failed: also fall back
    batchVideos.forEach(v => {
      if (!map.has(v.id)) {
        map.set(v.id, `${VPS_API}/stream-reel?url=${encodeURIComponent(v.video_url)}`);
      }
    });
  } catch {
    // Complete failure: all fall back to stream-reel
    batchVideos.forEach(v => {
      map.set(v.id, `${VPS_API}/stream-reel?url=${encodeURIComponent(v.video_url)}`);
    });
  }

  return map;
}, []);
```

- [ ] **Step 5: Rewrite `loadVideos` to construct frozen feed + resolve first batch**

Replace the existing `loadVideos` callback (lines 465-505) with:

```typescript
const loadVideos = useCallback(
  async (plat: string) => {
    setLoading(true);
    setInitialLoading(true);

    const PAGE_SIZE = 1000;
    const MAX_VIDEOS = 3000;
    let allVideos: ViralVideo[] = [];
    let page = 0;

    const threshold = parseFloat(localStorage.getItem('viral_outlier_threshold') ?? '5');
    while (allVideos.length < MAX_VIDEOS) {
      let query = supabase
        .from("viral_videos")
        .select(
          "id, channel_id, channel_username, platform, video_url, thumbnail_url, caption, views_count, likes_count, comments_count, engagement_rate, outlier_score, posted_at, scraped_at"
        )
        .gte("outlier_score", threshold)
        .order("outlier_score", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (plat !== "all") query = (query as any).eq("platform", plat);

      const { data, error } = await query;
      if (error) { toast.error("Failed to load videos"); setLoading(false); return; }

      const batch = (data as ViralVideo[]) || [];
      allVideos = [...allVideos, ...batch];
      if (batch.length < PAGE_SIZE) break;
      page++;
    }

    setVideos(allVideos);
    setLoading(false);

    if (allVideos.length) loadAvatars(allVideos.map((v) => v.channel_username));
  },
  [loadAvatars]
);
```

- [ ] **Step 6: Add effect to construct feed once videos + interactions are ready**

This replaces the old sortedVideos useMemo. It runs once when both data sources are loaded:

```typescript
// ── Construct frozen feed once videos + interactions are ready ──
useEffect(() => {
  if (loading || !interactionsReady || videos.length === 0) return;

  const feed = buildFeed(videos, initialInteractions);
  setFeedVideos(feed);
  setActiveIdx(0);
  currentBatchRef.current = 0;

  // Resolve first batch
  const firstBatch = feed.slice(0, BATCH_SIZE);
  if (firstBatch.length === 0) {
    setInitialLoading(false);
    return;
  }

  (async () => {
    const urls = await resolveBatch(firstBatch);
    setBatchUrlMap(urls);
    setInitialLoading(false);
  })();
}, [loading, interactionsReady, videos, initialInteractions, buildFeed, resolveBatch]);
```

- [ ] **Step 7: Add lookahead batch resolution effect**

When user reaches video 7 of the current batch, pre-fetch the next batch:

```typescript
// ── Lookahead: pre-resolve next batch when user reaches video 7+ in current batch ──
useEffect(() => {
  if (feedVideos.length === 0 || initialLoading) return;

  const batchStart = currentBatchRef.current * BATCH_SIZE;
  const posInBatch = activeIdx - batchStart;

  // Trigger lookahead at position 7 within current batch
  if (posInBatch >= 7) {
    const nextBatchIdx = currentBatchRef.current + 1;
    const nextStart = nextBatchIdx * BATCH_SIZE;
    const nextBatch = feedVideos.slice(nextStart, nextStart + BATCH_SIZE);

    if (nextBatch.length > 0 && !batchUrlMap.has(nextBatch[0].id)) {
      // Haven't resolved this batch yet
      (async () => {
        const urls = await resolveBatch(nextBatch);
        setBatchUrlMap(prev => {
          const next = new Map(prev);
          urls.forEach((v, k) => next.set(k, v));
          return next;
        });
        currentBatchRef.current = nextBatchIdx;
      })();
    }
  }
}, [activeIdx, feedVideos, initialLoading, batchUrlMap, resolveBatch]);
```

- [ ] **Step 8: Add boundary gate — prevent scrolling past unresolved videos**

Modify the wheel and touch handlers to check if the next video has a resolved URL. In the `setActiveIdx` calls within the wheel handler (line 334) and touch handler (line 359), add boundary checking:

```typescript
// In wheel handler, replace:
// setActiveIdx(prev => Math.max(0, Math.min(prev + dir, sortedVideos.length - 1)));
// With:
setActiveIdx(prev => {
  const next = Math.max(0, Math.min(prev + dir, feedVideos.length - 1));
  // Boundary gate: don't scroll past unresolved videos
  if (next > prev && !batchUrlMap.has(feedVideos[next]?.id)) {
    setBatchLoading(true);
    return prev; // Stay on current video
  }
  setBatchLoading(false);
  return next;
});

// Same change in touch handler
```

- [ ] **Step 9: Remove stall timeout effect**

Delete the stall timeout effect (lines 405-430):

```typescript
// DELETE: entire stall timeout useEffect (lines 405-430)
```

- [ ] **Step 10: Simplify playback reset effect**

Replace the playback reset effect (lines 393-403) with a simpler version that doesn't check `algorithmNavigating`:

```typescript
useEffect(() => {
  setPaused(false);
  setUseEmbed(false);
  setVideoReady(false);
}, [activeIdx]);
```

- [ ] **Step 11: Remove old prefetch effect**

Delete the fire-and-forget prefetch effect (lines 574-587):

```typescript
// DELETE: entire prefetch useEffect (lines 574-587)
```

- [ ] **Step 12: Update video rendering to use `feedVideos` and `batchUrlMap`**

In the JSX rendering section (starting around line 761), replace all references:
- `sortedVideos` → `feedVideos`
- `sortedVideos.length` → `feedVideos.length` (in wheel/touch handlers, nav arrows, etc.)
- `urlMap.get(v.id)` → `batchUrlMap.get(v.id)` (line 800)
- Remove `failedVideoIds.has(v.id)` checks (lines 787, 904)
- Remove failed video error UI (lines 855-900)
- Remove small error badge for non-active failed cards (lines 893-901)
- `currentVideo` declaration: change from `const currentVideo = sortedVideos[activeIdx] ?? null;` to `const currentVideo = feedVideos[activeIdx] ?? null;`

- [ ] **Step 13: Add initial loading screen**

Replace the existing loading condition (lines 685-689) to show batch loading state:

```tsx
{(loading || !interactionsReady || initialLoading) ? (
  <div className="flex-1 flex flex-col items-center justify-center gap-3">
    <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full reel-spin" />
    <span className="text-sm text-muted-foreground">
      {initialLoading && !loading ? "Pre-caching your feed…" : "Loading viral feed…"}
    </span>
  </div>
) : feedVideos.length === 0 ? (
  <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
    <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center">
      <Eye className="w-7 h-7 text-muted-foreground" />
    </div>
    <p className="text-sm text-muted-foreground max-w-xs">
      You've seen all the top content! Check back later or explore the Grid view.
    </p>
  </div>
) : (
  /* existing feed content */
```

- [ ] **Step 14: Add batch boundary spinner**

Inside the video card rendering (around line 770), add a loading spinner when the user hits the batch boundary:

```tsx
{/* Batch boundary loading spinner */}
{batchLoading && isActive && (
  <div className="absolute inset-0 z-[4] flex flex-col items-center justify-center gap-3 pointer-events-none">
    <div className="w-10 h-10 border-2 border-white/20 border-t-white/60 rounded-full reel-spin" />
    <span className="text-sm text-white/70">Loading next batch…</span>
  </div>
)}
```

- [ ] **Step 15: Remove `urlMap` state and `setUrlMap` references**

Delete the `urlMap` state declaration (line 150):
```typescript
// DELETE:
const [urlMap, setUrlMap] = useState<Map<string, string>>(new Map());
```

Also delete the `setUrlMap(map)` call in `loadVideos` (it was removed in Step 5 already).

- [ ] **Step 16: Update `navScroll` to use feedVideos and boundary check**

```typescript
const navScroll = (dir: number) => {
  const next = activeIdx + dir;
  if (next >= 0 && next < feedVideos.length) {
    // Boundary gate
    if (next > activeIdx && !batchUrlMap.has(feedVideos[next]?.id)) {
      setBatchLoading(true);
      return;
    }
    setBatchLoading(false);
    setActiveIdx(next);
  }
};
```

- [ ] **Step 17: Verify Reels builds correctly**

Run: `npm run build` on VPS
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 18: Commit Reels Feed changes**

```bash
git add src/pages/ViralReelFeed.tsx
git commit -m "feat(viral): batch-gated Reels feed with frozen order and seen 3+ filter

Feed order is computed once and frozen for the session. Videos seen 3+
times are hard-filtered out. Videos are pre-cached in batches of 10
via /resolve-batch before being shown. No mid-session re-sorting,
no auto-scrolling, no skipping."
```

---

### Task 4: Build and Deploy to VPS

**Files:**
- All modified files deployed to VPS

- [ ] **Step 1: Build the React app**

```bash
cd /var/www/connectacreators && npm run build
```

- [ ] **Step 2: Deploy the build to nginx**

The build output in `dist/` should already be served by nginx. Verify:
```bash
ls -la /var/www/connectacreators/dist/index.html
```

- [ ] **Step 3: Deploy VPS server changes**

```bash
pm2 restart ytdlp-server
```

- [ ] **Step 4: Verify the deployment**

- Visit `https://connectacreators.com` and navigate to Viral Today
- Grid view: all videos visible, no eye toggle, no session tracking
- Reels view: loading spinner while first batch resolves, then plays smoothly
- Test that scrolling past batch boundary shows loading if next batch isn't ready

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "deploy: viral feed overhaul — Grid cleanup + batch-gated Reels"
```

---

## Alternative Approach: Pre-Cache Cron (Option C)

If the batch-gated approach proves too slow or unreliable (e.g., IG API rate limits during peak usage):

1. Create a cron job that runs every 2 hours
2. Fetches top 200 videos by outlier score from `viral_videos`
3. For each uncached video, resolves and downloads to `/var/www/video-cache/`
4. Feed only shows pre-cached videos (filter by cache-status on load)

**Pros:** Zero load time, no per-request resolution latency
**Cons:** Feed is stale (new content has up to 2-hour delay), disk usage grows faster

Implement this if `/resolve-batch` response times consistently exceed 15s for a batch of 10.
