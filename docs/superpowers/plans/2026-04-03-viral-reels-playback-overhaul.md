# Viral Reels Playback Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overhaul the Viral Reels feed so every video plays reliably — cache-status pre-check eliminates HEAD-check race conditions, lookahead prefetch makes uncached videos near-instant, 5x+ outlier filter removes junk, and a background daemon passively builds the video cache over time.

**Architecture:** Frontend batch-checks `/cache-status` on page load to build a `urlMap` (cached → direct file URL, uncached → stream-reel URL) before any video elements render. On scroll, a fire-and-forget `/prefetch` call tells the VPS to pre-resolve CDN URLs for the next 5 videos. VPS stores resolved URLs in memory (5-min TTL) so the next `/stream-reel` call is instant. A `cache-daemon.js` cron script downloads the top-50 5x+ outlier videos every 2 hours.

**Tech Stack:** React/TypeScript (frontend), Node.js HTTP server at `/var/www/ytdlp-server.js` (VPS, port 3099), Cobalt (port 9001) for CDN URL resolution, nginx as proxy (`/api/*` → `localhost:3099`), PM2 for process management.

---

## File Map

| File | Change |
|---|---|
| `src/pages/ViralReelFeed.tsx` | Overhaul: remove HEAD-check, add urlMap, pre-buffer, prefetch effect, auto-advance |
| `src/pages/Settings.tsx` | Add "Viral Feed" section with outlier threshold slider |
| `/var/www/ytdlp-server.js` (VPS) | Add prefetch globals + `/prefetch` endpoint; modify `/stream-reel` to check prefetch map |
| `/var/www/cache-daemon.js` (VPS, new) | Background script: fetch top outliers from Supabase, queue for warm-cache |
| VPS crontab | 2 new entries: daemon every 2h, cleanup old files daily |

---

## Task 1 — VPS: Add prefetch globals to ytdlp-server.js

**Files:**
- Modify: `/var/www/ytdlp-server.js` (VPS, around line 947 — near `const warmQueue = [];`)

- [ ] **Step 1: SSH into VPS and open the file**

```bash
expect -c '
spawn ssh -o StrictHostKeyChecking=no root@72.62.200.145 "grep -n \"const warmQueue\" /var/www/ytdlp-server.js"
expect "password:"
send "Loqueveoloveo290802#\r"
expect eof
'
```

Expected output: a line number like `947:const warmQueue = [];`

- [ ] **Step 2: Append prefetch globals right after the warmQueue block**

Find the exact text `let warmRunning = 0;` in the file and add the following **immediately after** that line:

```js
// ─── Lookahead prefetch map ──────────────────────────────────────────────
const prefetchedUrls = new Map(); // url → { cdnUrl, expiresAt }
let prefetchRunning = 0;
const PREFETCH_CONCURRENCY = 3;
// ─────────────────────────────────────────────────────────────────────────
```

Use this expect script to make the edit:

```bash
expect -c '
spawn ssh -o StrictHostKeyChecking=no root@72.62.200.145 "sed -i '\''s/let warmRunning = 0;/let warmRunning = 0;\n\n\/\/ ─── Lookahead prefetch map ──────────────────────────────────────────────\nconst prefetchedUrls = new Map(); \/\/ url → { cdnUrl, expiresAt }\nlet prefetchRunning = 0;\nconst PREFETCH_CONCURRENCY = 3;\n\/\/ ─────────────────────────────────────────────────────────────────────────/'\'' /var/www/ytdlp-server.js"
expect "password:"
send "Loqueveoloveo290802#\r"
expect eof
'
```

- [ ] **Step 3: Verify the insertion**

```bash
expect -c '
spawn ssh -o StrictHostKeyChecking=no root@72.62.200.145 "grep -n \"prefetchedUrls\|prefetchRunning\|PREFETCH_CONCURRENCY\" /var/www/ytdlp-server.js | head -6"
expect "password:"
send "Loqueveoloveo290802#\r"
expect eof
'
```

Expected: 3 matching lines around the warmQueue area.

---

## Task 2 — VPS: Add /prefetch endpoint to ytdlp-server.js

**Files:**
- Modify: `/var/www/ytdlp-server.js` (VPS) — insert after the `/cache-status` endpoint block

The `/cache-status` endpoint ends with `return;` around line 1196. Add `/prefetch` right after it, before `/stream-reel`.

- [ ] **Step 1: Find the exact line number of the /stream-reel comment**

```bash
expect -c '
spawn ssh -o StrictHostKeyChecking=no root@72.62.200.145 "grep -n \"== /stream-reel ==\" /var/www/ytdlp-server.js"
expect "password:"
send "Loqueveoloveo290802#\r"
expect eof
'
```

Note the line number. Call it LINE_STREAM (e.g., 1199).

- [ ] **Step 2: Create the prefetch endpoint insertion file**

```bash
expect -c '
spawn ssh -o StrictHostKeyChecking=no root@72.62.200.145 "cat > /tmp/prefetch-endpoint.js << '\''ENDOFFILE'\''
  // ==================== /prefetch (lookahead CDN URL resolution) ====================
  if ((req.method === \"POST\" || req.method === \"OPTIONS\") && req.url === \"/prefetch\") {
    if (req.method === \"OPTIONS\") { res.writeHead(204, corsHeaders); res.end(); return; }
    let body = \"\";
    req.on(\"data\", d => { body += d; });
    req.on(\"end\", () => {
      try {
        const { videos } = JSON.parse(body || \"{}\");
        let queued = 0;
        (videos || []).forEach(({ url, platform }) => {
          if (!url) return;
          // Skip if disk-cached
          const urlId = (url.match(/\\/reel\\/([^\\/?]+)/) || url.match(/\\/p\\/([^\\/?]+)/) ||
                        url.match(/\\/video\\/([^\\/?]+)/) || url.match(/\\/shorts\\/([^\\/?]+)/))?.[1];
          if (urlId) {
            const plat = platform === \"instagram\" ? \"ig\" : platform === \"tiktok\" ? \"tt\" : \"yt\";
            if (fs.existsSync(\"/var/www/video-cache/\" + plat + \"_\" + urlId + \".mp4\")) return;
          }
          // Skip if already in prefetch map and not expired
          const existing = prefetchedUrls.get(url);
          if (existing && existing.expiresAt > Date.now()) return;
          // Skip if at concurrency limit
          if (prefetchRunning >= PREFETCH_CONCURRENCY) return;
          prefetchRunning++;
          queued++;
          (async () => {
            try {
              const cobaltBody = JSON.stringify({ url, videoQuality: \"720\", filenameStyle: \"basic\", downloadMode: \"auto\" });
              const cdnResult = await new Promise((resolve, reject) => {
                const hr = require(\"http\").request(\"http://localhost:9001/\", {
                  method: \"POST\",
                  headers: { \"Content-Type\": \"application/json\", \"Accept\": \"application/json\", \"Content-Length\": Buffer.byteLength(cobaltBody) },
                }, (r2) => {
                  let d = \"\"; r2.on(\"data\", c => { d += c; }); r2.on(\"end\", () => resolve(d));
                });
                hr.on(\"error\", reject);
                hr.setTimeout(15000, () => { hr.destroy(); reject(new Error(\"Cobalt timeout\")); });
                hr.write(cobaltBody); hr.end();
              });
              const parsed = JSON.parse(cdnResult);
              const cdnUrl = parsed?.url || (Array.isArray(parsed?.urls) ? parsed.urls[0] : null);
              if (cdnUrl) {
                prefetchedUrls.set(url, { cdnUrl, expiresAt: Date.now() + 5 * 60 * 1000 });
                console.log(\"[prefetch] resolved:\", url.slice(-30));
              } else {
                console.log(\"[prefetch] no CDN URL from Cobalt for:\", url.slice(-30));
              }
            } catch (e) {
              console.log(\"[prefetch] failed:\", e.message.slice(0, 80));
            } finally {
              prefetchRunning--;
            }
          })();
        });
        res.writeHead(200, { ...corsHeaders, \"Content-Type\": \"application/json\" });
        res.end(JSON.stringify({ queued }));
      } catch (e) {
        res.writeHead(400, corsHeaders); res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

ENDOFFILE"
expect "password:"
send "Loqueveoloveo290802#\r"
expect eof
'
```

- [ ] **Step 3: Insert the endpoint file into ytdlp-server.js before /stream-reel**

Replace LINE_STREAM with the actual line number found in Step 1:

```bash
expect -c '
spawn ssh -o StrictHostKeyChecking=no root@72.62.200.145 "sed -i \"LINE_STREAMr /tmp/prefetch-endpoint.js\" /var/www/ytdlp-server.js"
expect "password:"
send "Loqueveoloveo290802#\r"
expect eof
'
```

- [ ] **Step 4: Verify insertion**

```bash
expect -c '
spawn ssh -o StrictHostKeyChecking=no root@72.62.200.145 "grep -n \"/prefetch\" /var/www/ytdlp-server.js | head -5"
expect "password:"
send "Loqueveoloveo290802#\r"
expect eof
'
```

Expected: lines matching `/prefetch` around the expected location.

---

## Task 3 — VPS: Modify /stream-reel to check prefetch map

**Files:**
- Modify: `/var/www/ytdlp-server.js` — inside `/stream-reel`, after disk cache block, before Cobalt call

- [ ] **Step 1: Find the "Resolve via Cobalt" comment line number**

```bash
expect -c '
spawn ssh -o StrictHostKeyChecking=no root@72.62.200.145 "grep -n \"Resolve via Cobalt\" /var/www/ytdlp-server.js"
expect "password:"
send "Loqueveoloveo290802#\r"
expect eof
'
```

Note the line number (LINE_COBALT).

- [ ] **Step 2: Create the prefetch-check insertion file**

```bash
expect -c '
spawn ssh -o StrictHostKeyChecking=no root@72.62.200.145 "cat > /tmp/prefetch-check.js << '\''ENDOFFILE'\''
      // ── Check in-memory prefetch cache (pre-resolved CDN URL) ──
      const _prefEntry = prefetchedUrls.get(videoUrl);
      if (_prefEntry && _prefEntry.expiresAt > Date.now()) {
        const _cdnUrl = _prefEntry.cdnUrl;
        console.log(\"[stream-reel] prefetch hit:\", cacheId || videoUrl.slice(-20));
        const _cdnProto = _cdnUrl.startsWith(\"https\") ? require(\"https\") : require(\"http\");
        const _cdnReq = _cdnProto.get(_cdnUrl, {
          headers: {
            \"User-Agent\": \"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)\",
            ...(rangeHeader ? { \"Range\": rangeHeader } : {}),
          }
        }, (_cdnRes) => {
          const _h = {
            \"Content-Type\": _cdnRes.headers[\"content-type\"] || \"video/mp4\",
            \"Accept-Ranges\": \"bytes\",
            \"Access-Control-Allow-Origin\": \"*\",
            \"Cache-Control\": \"public, max-age=300\",
          };
          if (_cdnRes.headers[\"content-length\"]) _h[\"Content-Length\"] = _cdnRes.headers[\"content-length\"];
          if (_cdnRes.headers[\"content-range\"]) _h[\"Content-Range\"] = _cdnRes.headers[\"content-range\"];
          res.writeHead(_cdnRes.statusCode || 200, _h);
          _cdnRes.pipe(res);
        });
        _cdnReq.on(\"error\", () => {
          prefetchedUrls.delete(videoUrl); // clear expired/bad entry
          if (!res.headersSent) { res.writeHead(502); res.end(\"Prefetch CDN error\"); }
        });
        _cdnReq.setTimeout(10000, () => _cdnReq.destroy());
        return;
      }
      // ── End prefetch cache check ──

ENDOFFILE"
expect "password:"
send "Loqueveoloveo290802#\r"
expect eof
'
```

- [ ] **Step 3: Insert the prefetch check before the Cobalt call**

Replace LINE_COBALT with the actual line number:

```bash
expect -c '
spawn ssh -o StrictHostKeyChecking=no root@72.62.200.145 "sed -i \"LINE_COBALTr /tmp/prefetch-check.js\" /var/www/ytdlp-server.js"
expect "password:"
send "Loqueveoloveo290802#\r"
expect eof
'
```

- [ ] **Step 4: Verify**

```bash
expect -c '
spawn ssh -o StrictHostKeyChecking=no root@72.62.200.145 "grep -n \"prefetch hit\|prefetch cache\" /var/www/ytdlp-server.js | head -5"
expect "password:"
send "Loqueveoloveo290802#\r"
expect eof
'
```

---

## Task 4 — VPS: Restart server and test /prefetch endpoint

- [ ] **Step 1: Restart the PM2 process**

```bash
expect -c '
spawn ssh -o StrictHostKeyChecking=no root@72.62.200.145 "pm2 restart ytdlp-server && sleep 3 && pm2 status"
expect "password:"
send "Loqueveoloveo290802#\r"
expect eof
'
```

Expected: `ytdlp-server` shows `online`.

- [ ] **Step 2: Test /prefetch returns 200**

```bash
expect -c '
spawn ssh -o StrictHostKeyChecking=no root@72.62.200.145 "curl -s -X POST http://localhost:3099/prefetch -H '\''Content-Type: application/json'\'' -d '\''{\"videos\":[{\"url\":\"https://www.instagram.com/reel/C9tOCzCv4Ms/\",\"platform\":\"instagram\"}]}'\'' "
expect "password:"
send "Loqueveoloveo290802#\r"
expect eof
'
```

Expected: `{"queued":1}` or `{"queued":0}` (0 if that reel is already cached).

- [ ] **Step 3: Test /cache-status still works**

```bash
expect -c '
spawn ssh -o StrictHostKeyChecking=no root@72.62.200.145 "curl -s '\''http://localhost:3099/cache-status?ids=C9tOCzCv4Ms,ABC123TEST'\''"
expect "password:"
send "Loqueveoloveo290802#\r"
expect eof
'
```

Expected: `{"C9tOCzCv4Ms":true,"ABC123TEST":false}` (C9tOCzCv4Ms is already in cache).

- [ ] **Step 4: Check PM2 logs for errors**

```bash
expect -c '
spawn ssh -o StrictHostKeyChecking=no root@72.62.200.145 "pm2 logs ytdlp-server --lines 20 --nostream"
expect "password:"
send "Loqueveoloveo290802#\r"
expect eof
'
```

Expected: No `SyntaxError` or `ReferenceError`. Should see `[prefetch] resolved:` if the prefetch completed.

---

## Task 5 — VPS: Create cache-daemon.js and add cron

**Files:**
- Create: `/var/www/cache-daemon.js`
- Modify: VPS crontab

- [ ] **Step 1: Write cache-daemon.js**

```bash
expect -c '
spawn ssh -o StrictHostKeyChecking=no root@72.62.200.145 "cat > /var/www/cache-daemon.js << '\''ENDOFSCRIPT'\''
#!/usr/bin/env node
// cache-daemon.js — Queue top outlier videos for background download
// Runs every 2 hours via cron: 0 */2 * * * /usr/bin/node /var/www/cache-daemon.js

const https = require(\"https\");
const http = require(\"http\");

const SUPABASE_URL = \"https://hxojqrilwhhrvloiwmfo.supabase.co\";
const SUPABASE_KEY = \"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4b2pxcmlsd2hocnZsb2l3bWZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NDI2ODIsImV4cCI6MjA4NzIxODY4Mn0.rE0InfGUiq-Xl7DSJVWoaem_zQ_LnIzhDFzzLQ5k54k\";
const WARM_URL = \"http://localhost:3099/warm-cache\";
const MIN_OUTLIER = 5;
const LIMIT = 50;

function log(msg) { console.log(\"[cache-daemon]\", new Date().toISOString(), msg); }

async function fetchOutliers() {
  const url = SUPABASE_URL + \"/rest/v1/viral_videos?select=id,video_url,platform,outlier_score&outlier_score=gte.\" + MIN_OUTLIER + \"&order=outlier_score.desc&limit=\" + LIMIT;
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { apikey: SUPABASE_KEY, Authorization: \"Bearer \" + SUPABASE_KEY, Accept: \"application/json\" } }, (res) => {
      let d = \"\"; res.on(\"data\", c => { d += c; }); res.on(\"end\", () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
    }).on(\"error\", reject);
  });
}

async function postWarm(videos) {
  const body = JSON.stringify({ videos });
  return new Promise((resolve, reject) => {
    const r = http.request(WARM_URL, { method: \"POST\", headers: { \"Content-Type\": \"application/json\", \"Content-Length\": Buffer.byteLength(body) } }, (res) => {
      let d = \"\"; res.on(\"data\", c => { d += c; }); res.on(\"end\", () => { try { resolve(JSON.parse(d)); } catch(e) { resolve({ queued: 0 }); } });
    });
    r.on(\"error\", reject); r.write(body); r.end();
  });
}

async function main() {
  log(\"Starting\");
  const videos = await fetchOutliers();
  log(\"Fetched \" + videos.length + \" outlier videos from Supabase\");
  const batch = videos.map(v => ({ id: v.id, url: v.video_url, platform: v.platform }));
  const result = await postWarm(batch);
  log(\"Queued \" + result.queued + \" new videos (queue size: \" + result.queue_size + \")\");
  log(\"Done\");
}

main().catch(e => { log(\"ERROR: \" + e.message); process.exit(1); });
ENDOFSCRIPT"
expect "password:"
send "Loqueveoloveo290802#\r"
expect eof
'
```

- [ ] **Step 2: Test cache-daemon.js manually**

```bash
expect -c '
spawn ssh -o StrictHostKeyChecking=no root@72.62.200.145 "/usr/bin/node /var/www/cache-daemon.js"
expect "password:"
send "Loqueveoloveo290802#\r"
expect eof
'
```

Expected output (example):
```
[cache-daemon] 2026-04-03T... Starting
[cache-daemon] 2026-04-03T... Fetched 50 outlier videos from Supabase
[cache-daemon] 2026-04-03T... Queued 20 new videos (queue size: 20)
[cache-daemon] 2026-04-03T... Done
```

If `queued: 0`, it means all 50 are already cached — that's fine.

- [ ] **Step 3: Add cron entries**

```bash
expect -c '
spawn ssh -o StrictHostKeyChecking=no root@72.62.200.145 "(crontab -l 2>/dev/null; echo \"0 */2 * * * /usr/bin/node /var/www/cache-daemon.js >> /var/www/cache-daemon.log 2>&1\"; echo \"0 3 * * * find /var/www/video-cache -name '\''*.mp4'\'' -mtime +30 -delete >> /var/www/cache-daemon.log 2>&1\") | crontab -"
expect "password:"
send "Loqueveoloveo290802#\r"
expect eof
'
```

- [ ] **Step 4: Verify cron entries**

```bash
expect -c '
spawn ssh -o StrictHostKeyChecking=no root@72.62.200.145 "crontab -l | grep cache"
expect "password:"
send "Loqueveoloveo290802#\r"
expect eof
'
```

Expected:
```
0 */2 * * * /usr/bin/node /var/www/cache-daemon.js >> /var/www/cache-daemon.log 2>&1
0 3 * * * find /var/www/video-cache -name '*.mp4' -mtime +30 -delete >> /var/www/cache-daemon.log 2>&1
```

---

## Task 6 — Frontend: Overhaul ViralReelFeed.tsx — URL resolution

**Files:**
- Modify: `src/pages/ViralReelFeed.tsx`

This task replaces the broken HEAD-check URL resolution with a batch cache-status check.

- [ ] **Step 1: Add urlMap state and buildUrlMap function**

In `ViralReelFeed.tsx`, find the line:
```ts
const igErrorStage = useRef<Map<string, "cobalt" | "stream" | "failed">>(new Map());
```

Add **after** it:
```ts
const [urlMap, setUrlMap] = useState<Map<string, string>>(new Map());

const buildUrlMap = useCallback(async (vids: ViralVideo[]): Promise<Map<string, string>> => {
  const map = new Map<string, string>();
  const codeToVideo = new Map<string, ViralVideo>();
  vids.forEach(v => {
    const code = (v.video_url.match(/\/reel\/([^/?]+)/) ||
                  v.video_url.match(/\/p\/([^/?]+)/) ||
                  v.video_url.match(/\/video\/([^/?]+)/) ||
                  v.video_url.match(/\/shorts\/([^/?]+)/))?.[1];
    if (code) codeToVideo.set(code, v);
  });
  const codes = Array.from(codeToVideo.keys());
  if (codes.length > 0) {
    try {
      const res = await fetch(`${VPS_API}/cache-status?ids=${codes.join(',')}`);
      const status: Record<string, boolean> = await res.json();
      codeToVideo.forEach((v, code) => {
        const plat = v.platform === 'instagram' ? 'ig' : v.platform === 'tiktok' ? 'tt' : 'yt';
        map.set(v.id, status[code]
          ? `https://connectacreators.com/video-cache/${plat}_${code}.mp4`
          : `${VPS_API}/stream-reel?url=${encodeURIComponent(v.video_url)}`
        );
      });
    } catch {
      // Fallback: all go through stream-reel
    }
  }
  // Any video without a shortcode → stream-reel
  vids.forEach(v => {
    if (!map.has(v.id)) {
      map.set(v.id, `${VPS_API}/stream-reel?url=${encodeURIComponent(v.video_url)}`);
    }
  });
  return map;
}, []);
```

- [ ] **Step 2: Delete the old URL resolution code**

Delete these three blocks entirely:

1. The `resolvedUrls` ref and the three functions that follow it:
```ts
// ── Build video URL: cache-first (verified via HEAD), then stream fallback ──
const resolvedUrls = useRef<Map<string, string>>(new Map());

const getCacheUrl = useCallback(...)
const getStreamUrl = useCallback(...)
const getResolvedUrl = useCallback(...)
```

2. The warm-cache fire-on-mount effect (the `useEffect` that does `fetch(\`${VPS_API}/warm-cache\`, ...)`):
```ts
// ── Pre-warm video cache on mount: fire-and-forget ──
useEffect(() => {
  if (!videos.length) return;
  const toWarm = videos.slice(0, 20).map(...)
  fetch(`${VPS_API}/warm-cache`, { ... }).catch(() => {});
}, [videos]);
```

3. The pre-resolve effect:
```ts
// Pre-resolve URLs for next 3 videos to eliminate glitch on scroll
useEffect(() => {
  for (let i = activeIdx; i < Math.min(activeIdx + 4, sortedVideos.length); i++) {
    ...
  }
}, [activeIdx, sortedVideos, getResolvedUrl]);
```

Keep `getStreamUrl` — it's still used in the error handler. Only delete `getCacheUrl` and `getResolvedUrl`.

- [ ] **Step 3: Add outlier threshold to loadVideos**

In `loadVideos`, find:
```ts
let query = supabase
  .from("viral_videos")
  .select(
    "id, channel_id, channel_username, platform, video_url, thumbnail_url, caption, views_count, likes_count, comments_count, engagement_rate, outlier_score, posted_at, scraped_at"
  )
  .order("outlier_score", { ascending: false })
  .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
```

Replace with:
```ts
const threshold = parseFloat(localStorage.getItem('viral_outlier_threshold') ?? '5');
let query = supabase
  .from("viral_videos")
  .select(
    "id, channel_id, channel_username, platform, video_url, thumbnail_url, caption, views_count, likes_count, comments_count, engagement_rate, outlier_score, posted_at, scraped_at"
  )
  .gte("outlier_score", threshold)
  .order("outlier_score", { ascending: false })
  .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
```

- [ ] **Step 4: Call buildUrlMap after loading videos**

In `loadVideos`, find:
```ts
setVideos(allVideos);
setActiveIdx(0);
setLoading(false);

if (data?.length) loadAvatars((data as ViralVideo[]).map((v) => v.channel_username));
```

Replace with:
```ts
const map = await buildUrlMap(allVideos);
setUrlMap(map);
setVideos(allVideos);
setActiveIdx(0);
setLoading(false);

if (allVideos.length) loadAvatars(allVideos.map((v) => v.channel_username));
```

Also update the `loadVideos` dependency array from `[loadAvatars]` to `[loadAvatars, buildUrlMap]`.

- [ ] **Step 5: Update video element to use urlMap**

In the JSX, find the `<video>` element's `src` prop:
```tsx
src={getResolvedUrl(v)}
```

Replace with:
```tsx
src={urlMap.get(v.id) ?? `${VPS_API}/stream-reel?url=${encodeURIComponent(v.video_url)}`}
```

- [ ] **Step 6: Commit**

```bash
cd /Users/admin/Desktop/connectacreators
git add src/pages/ViralReelFeed.tsx
git commit -m "feat(reels): batch cache-status URL map, outlier filter, remove HEAD-check race"
```

---

## Task 7 — Frontend: Add pre-buffer and prefetch-on-scroll

**Files:**
- Modify: `src/pages/ViralReelFeed.tsx`

- [ ] **Step 1: Add prefetch-on-scroll effect**

Find the "Mark active reel as seen" effect:
```ts
useEffect(() => {
  const v = sortedVideos[activeIdx];
  if (!v) return;
  const timer = setTimeout(() => seenThisSession.current.add(v.id), 3000);
  return () => clearTimeout(timer);
}, [activeIdx, sortedVideos]);
```

Add this **after** it:
```ts
// Fire-and-forget prefetch for next 5 uncached videos
useEffect(() => {
  if (!sortedVideos.length || !urlMap.size) return;
  const uncached = sortedVideos
    .slice(activeIdx + 1, activeIdx + 6)
    .filter(v => (urlMap.get(v.id) ?? '').includes('/stream-reel'))
    .map(v => ({ url: v.video_url, platform: v.platform }));
  if (!uncached.length) return;
  fetch(`${VPS_API}/prefetch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videos: uncached }),
  }).catch(() => {});
}, [activeIdx, sortedVideos, urlMap]);
```

- [ ] **Step 2: Add hidden pre-buffer elements**

In the JSX `return`, find the closing `</>` at the very end of the component. Just before it, add:

```tsx
{/* Hidden pre-buffer — triggers browser to start fetching next 2 videos */}
<div className="sr-only" aria-hidden="true">
  {[1, 2].map(offset => {
    const v = sortedVideos[activeIdx + offset];
    if (!v) return null;
    const src = urlMap.get(v.id);
    if (!src) return null;
    return (
      <video
        key={`prebuf-${v.id}-${activeIdx}`}
        src={src}
        preload="auto"
        muted
        playsInline
      />
    );
  })}
</div>
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/ViralReelFeed.tsx
git commit -m "feat(reels): add lookahead prefetch effect and hidden pre-buffer elements"
```

---

## Task 8 — Frontend: Simplify error handling + auto-advance on failure

**Files:**
- Modify: `src/pages/ViralReelFeed.tsx`

- [ ] **Step 1: Replace the onError handler**

Find the `onError` prop on the `<video>` element (the entire `onError={() => { ... }}` block, which currently has the `igErrorStage` multi-stage logic). Replace the entire `onError` prop with:

```tsx
onError={() => {
  const vid = activeVideoRef.current;
  if (!vid) return;

  if (v.platform === "youtube") {
    setUseEmbed(true);
    return;
  }

  // Single retry: if not already using stream-reel, try it once
  const streamUrl = getStreamUrl(v);
  if (!vid.src.includes('/stream-reel') && !vid.src.includes('/proxy-video')) {
    vid.src = streamUrl;
    vid.load();
    vid.play().catch(() => {});
  } else {
    // Both cache and stream-reel failed — skip this video silently
    setFailedVideoIds(prev => new Set([...prev, v.id]));
  }
}}
```

- [ ] **Step 2: Add auto-advance effect**

Find the effect that resets `paused` and `useEmbed` on `activeIdx` change:
```ts
useEffect(() => {
  setPaused(false);
  setUseEmbed(false);
  const v = sortedVideos[activeIdx];
  if (v) igErrorStage.current.delete(v.id);
}, [activeIdx]);
```

Replace it with (removes the igErrorStage reference since it's deleted):
```ts
useEffect(() => {
  setPaused(false);
  setUseEmbed(false);
}, [activeIdx]);
```

Then add a new effect after it:
```ts
// Auto-advance when active video fails — scroll to next card silently
useEffect(() => {
  const v = sortedVideos[activeIdx];
  if (!v || !failedVideoIds.has(v.id)) return;
  const col = colRef.current;
  if (!col) return;
  const cards = col.querySelectorAll('.reel-card');
  const target = cards[activeIdx + 1] as HTMLElement;
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}, [failedVideoIds, activeIdx, sortedVideos]);
```

- [ ] **Step 3: Delete igErrorStage ref**

Find and delete:
```ts
const igErrorStage = useRef<Map<string, "cobalt" | "stream" | "failed">>(new Map());
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/ViralReelFeed.tsx
git commit -m "feat(reels): simplified error handling — one retry then silent auto-advance"
```

---

## Task 9 — Frontend: Add Viral Feed section to Settings

**Files:**
- Modify: `src/pages/Settings.tsx`

- [ ] **Step 1: Add threshold state**

In `Settings.tsx`, after the existing state declarations (around line 29), add:
```ts
const [viralThreshold, setViralThreshold] = useState<number>(
  parseFloat(localStorage.getItem('viral_outlier_threshold') ?? '5')
);

const handleViralThresholdChange = (val: number) => {
  setViralThreshold(val);
  localStorage.setItem('viral_outlier_threshold', String(val));
};
```

- [ ] **Step 2: Add Viral Feed settings card**

Find the comment `{/* Delete Account — only for non-admin users */}` (around line 200) and add this **immediately before** it:

```tsx
{/* Viral Feed settings */}
<div className="glass-card rounded-xl p-6 space-y-4">
  <h2 className="text-lg font-semibold text-foreground">Viral Feed</h2>
  <p className="text-sm text-muted-foreground">
    Set the minimum outlier score for videos shown in the Viral Reels feed. Higher = only the most viral content.
  </p>
  <div className="space-y-3">
    <div className="flex items-center justify-between">
      <span className="text-sm text-foreground">Minimum outlier score</span>
      <span className="text-sm font-bold text-primary">≥ {viralThreshold}x</span>
    </div>
    <input
      type="range"
      min={1}
      max={20}
      step={0.5}
      value={viralThreshold}
      onChange={(e) => handleViralThresholdChange(parseFloat(e.target.value))}
      className="w-full accent-primary"
    />
    <div className="flex gap-2 flex-wrap">
      {[
        { label: 'Any', value: 1 },
        { label: '≥ 3x', value: 3 },
        { label: '≥ 5x', value: 5 },
        { label: '≥ 10x 🔥', value: 10 },
        { label: '≥ 20x 🔥', value: 20 },
      ].map(({ label, value }) => (
        <button
          key={value}
          onClick={() => handleViralThresholdChange(value)}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
            viralThreshold === value
              ? 'bg-primary/20 border-primary/50 text-primary'
              : 'border-border text-muted-foreground hover:text-foreground hover:border-border/80'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
    <p className="text-xs text-muted-foreground">Takes effect next time you open the Viral Reels page.</p>
  </div>
</div>

```

- [ ] **Step 3: Commit**

```bash
git add src/pages/Settings.tsx
git commit -m "feat(settings): add Viral Feed outlier threshold control"
```

---

## Task 10 — Build and deploy

- [ ] **Step 1: Build locally and check for TypeScript errors**

```bash
cd /Users/admin/Desktop/connectacreators
npm run build 2>&1 | tail -30
```

Expected: Build succeeds with no TypeScript errors. If errors appear, fix them before continuing (likely unused variable from deleted `igErrorStage` ref or missing `getStreamUrl` import).

- [ ] **Step 2: SCP the dist folder to VPS**

```bash
expect -c '
spawn scp -o StrictHostKeyChecking=no -r /Users/admin/Desktop/connectacreators/dist/. root@72.62.200.145:/var/www/connectacreators/
expect "password:"
send "Loqueveoloveo290802#\r"
expect eof
'
```

- [ ] **Step 3: Reload nginx**

```bash
expect -c '
spawn ssh -o StrictHostKeyChecking=no root@72.62.200.145 "nginx -s reload"
expect "password:"
send "Loqueveoloveo290802#\r"
expect eof
'
```

- [ ] **Step 4: Smoke-test in browser**

Open `https://connectacreators.com` → navigate to Viral Today → Reels tab.

Verify:
1. Feed loads (videos appear)
2. First video plays automatically with no flicker
3. Scroll to next video → plays within 1–2s
4. No CSS layout glitches
5. Check Settings → "Viral Feed" section appears with slider and chips

- [ ] **Step 5: Final commit**

```bash
cd /Users/admin/Desktop/connectacreators
git add .
git commit -m "feat(reels): viral reels playback overhaul — TikTok-like experience"
```
