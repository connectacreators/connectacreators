# Scale Approach A — Cloudflare + VPS Hardening

**Date:** 2026-04-02
**Goal:** Support 20-50 concurrent users with ~$0-10/mo additional cost

## Architecture

```
Users
  ↓
Cloudflare CDN (caches /video-cache/, /thumb-cache/, /avatars/, static assets)
  ↓ cache miss only
Nginx (rate limiting, static file serve, proxy to Node)
  ↓
ytdlp-server.js — PM2 cluster mode (1 worker per CPU core)
  ↓
p-queue job gate (max 2 concurrent ffmpeg/yt-dlp/Puppeteer spawns)
```

## Changes

### 1. Cloudflare CDN
- Point DNS to Cloudflare (free tier)
- Cache rules: `/video-cache/*`, `/thumb-cache/*`, `/avatars/*` → Cache Everything, 7-day edge TTL
- Static assets (`/assets/*`, `*.js`, `*.css`) → Cache Everything, 30-day edge TTL
- API routes (`/api/*`) → Bypass cache
- Result: cached videos served from Cloudflare edge, VPS never touched

### 2. PM2 Cluster Mode
- Change `ytdlp-server.js` PM2 config from `instances: 1` to `instances: 'max'`
- Node.js cluster spreads concurrent HTTP requests across all CPU cores
- Each worker is independent — one crash doesn't kill others

### 3. In-Process Job Queue (p-queue)
- Install `p-queue` on VPS
- Wrap ffmpeg, yt-dlp, Puppeteer spawns in a shared queue: `concurrency: 2`
- Heavy endpoints affected: `/cobalt-proxy`, `/extract-audio`, `/analyze-video`, `/download-video`, `/ig-thumbnail`
- Light endpoints (proxy-image, proxy-video) bypass queue — they're just passthrough

### 4. Instagram Account Rotation
- Store 3-4 burner account cookie files: `/var/www/ig-cookies-1.json`, `ig-cookies-2.json`, etc.
- Round-robin selection per scrape request
- On `login_required`, mark that account as stale, pick next
- Removes single point of failure for scraping

### 5. ViralToday Server-Side Filtering
- Current: fetch 5,000 videos to client, filter in JS
- New: pass filters (platform, date range, min_views, outlier) as Postgres query params
- Add DB indexes: `(platform, scraped_at, views_count, outlier_score)`
- Result: ~10x less data transfer, faster page load

## Implementation Order
1. PM2 cluster (5 min, immediate win, no user action)
2. p-queue job gate (30 min, protects VPS from overload)
3. ViralToday server-side filtering (1-2 hrs, reduces DB egress)
4. Instagram account rotation (30 min, needs new burner accounts)
5. Cloudflare DNS setup (15 min, requires user to change nameservers)

## What Stays the Same
- Supabase, all edge functions
- Cobalt instance (port 9001)
- WARP proxy
- nginx config (minor additions only)
- All frontend routes and API contracts
