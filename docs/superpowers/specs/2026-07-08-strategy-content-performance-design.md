# Strategy Page: Content Performance Tab + Viral Today Channel Link

**Date:** 2026-07-08
**Status:** Approved
**Surfaces:** `src/pages/ClientStrategy.tsx`, shared handle parser in `src/lib/`, `analyze-audience-alignment` edge function (MCP deploy)

## Problem

The per-client Strategy page has no view of how the client's actual posts perform. That data already exists in Viral Today (`viral_channels` + `viral_videos`: views, likes, comments, engagement rate, outlier score, auto-refreshed every 4h by pg_cron) — but only for channels someone manually pasted into Viral Today. Separately, the Audience Alignment section live-scrapes the client's Instagram via the VPS every 7 days, duplicating scraping work and missing the richer signals (outlier score, comments, 90-day history) Viral Today already computes.

## Goals

1. A **Performance tab** on the Strategy page showing the client's recent-post metrics from Viral Today data.
2. A **channel-link workflow**: detect when the client's onboarding handles (IG/TikTok/YouTube) are missing from Viral Today and let the team add them in one click.
3. **Audience Alignment** reads the client's posts from Viral Today when available, falling back to the existing live scrape when not.

Out of scope: Facebook (no scraper exists), `top3Profiles` reference accounts (keep their existing live scrape), schema changes, mass backfill.

## 1. Page structure

`ClientStrategy.tsx` gets a tab bar under the existing header (profile pic + handle remain visible on both tabs):

- **Strategy** — the current page content, unchanged.
- **Performance** — the new view.

Tab state is a `?tab=performance` query param (linkable, survives refresh). The "Edit Strategy" button renders only on the Strategy tab. Styling follows the page's existing StatusCard / glass-card system; use branding tokens, not palette hex.

## 2. Channel link detection (client-side, no schema)

On page load, alongside the existing onboarding fetch:

1. Read `instagram`, `tiktok`, `youtube` from `clients.onboarding_data`. Facebook is excluded.
2. Normalize each handle/URL with the parsing logic Viral Today already uses (`detectPlatformAndUsername`), **extracted to a shared helper in `src/lib/`** so both pages import one implementation. ViralToday.tsx switches to the shared import.
3. Query `viral_channels` for the (platform, username) pairs → `linkedChannels[]` and `missingChannels[]`.

Matching is live (recomputed per load), so a handle changed in onboarding self-heals on the next visit. No mapping table.

## 3. Add-to-Viral-Today prompt (team only)

**Visibility:** `role !== "client"` (from `useAuth()`) AND `missingChannels.length > 0` AND not dismissed this session.

**Placement:** a warning banner in two places — inside the Audience Alignment card, and at the top of the Performance tab.

**Copy:** "@handle is not on Viral Today — its posts aren't being tracked." (Spanish equivalent for `language === "es"`.)

**Actions:**

1. **Yes, add all** — adds every missing channel among IG/TikTok/YouTube that exists in onboarding.
2. **Only Instagram** — adds just the IG channel. If IG is already linked, the label adapts to the highest-priority missing platform (IG > TikTok > YouTube), e.g. "Only TikTok".
3. **Not now** — dismisses for the session (`sessionStorage` key scoped to client id). Reappears on a later visit while channels are still missing; never shows once nothing is missing.

**Add flow** reuses Viral Today's exact pattern (`handleAddChannel`, ViralToday.tsx:1552): select-or-insert into `viral_channels`, then invoke `scrape-channel` with `{ channelId, username, platform }`. Channels are scraped **sequentially** (the VPS rejects concurrent runs with `server_busy`); on `server_busy`, retry that channel once after ~30s, then leave it queued for the 4h auto-scrape and say so in a toast. Team adds from this page do **not** increment client `channel_scrapes_used`.

While a scrape runs, the Performance tab shows the channel as "Scraping…" and polls `viral_channels.scrape_status` (same poll pattern as Viral Today) until `done`/`error`.

## 4. Performance tab content

All reads are direct client-side Supabase queries against `viral_channels` / `viral_videos` (same access pattern as Viral Today).

- **Platform switcher** — chips for each linked channel (avatar_url + @handle). Instagram is default when linked; otherwise the first linked channel.
- **Summary stats** over the selected channel's most recent 20 posts: average views, average engagement rate, average likes, best outlier score, posts tracked (total `video_count`).
- **Post list** — most recent first (`posted_at` desc, fall back `scraped_at`), showing per post: thumbnail, caption snippet, posted date, views, likes, comments, engagement rate, outlier score badge using Viral Today's outlier color scale. Row links to `video_url` (new tab).
- **Footer** — "Last scraped Xh ago · auto-refreshes every 4 hours" from `last_scraped_at`, plus a "View in Viral Today" link.
- **Empty states:**
  - Channel exists but scrape running → "Scraping @handle… first results in a few minutes."
  - Channel scrape errored → show `scrape_error` with a re-scrape button (team only).
  - No channels linked → team sees the add-prompt banner; clients see "Your channels aren't being tracked yet — ask your strategist."

## 5. Audience Alignment data source

`analyze-audience-alignment` (edge function; deployed via MCP, not CI — diff against repo before deploying) gains a Viral Today fast-path:

1. Parse the client's IG handle; look it up in `viral_channels` (platform `instagram`). If a channel exists with `scrape_status = 'done'` and **≥3 videos** in `viral_videos`, build the client-posts payload from `viral_videos`: caption, views_count, likes_count, comments_count, engagement_rate, outlier_score. Skip the VPS profile scrape for the client entirely.
2. Otherwise fall back to the existing live VPS scrape unchanged — no client loses analysis.
3. On the fast path, profile pic = `viral_channels.avatar_url`; preserve the previously stored follower count instead of dropping it (viral_channels has no follower column).
4. The prompt gains outlier/comment context on the fast path (e.g. "post X is a 12× outlier"), improving the verdict quality.
5. `audience_analysis` JSON gains `data_source: "viral_today" | "live_scrape"`. The card footer surfaces it: "Based on N tracked posts from Viral Today" vs the current text.
6. Reference profiles (`top3Profiles` emulation scrape) untouched. Response shape otherwise unchanged so the existing UI keeps rendering.

A channel whose latest scrape errored counts as *not linked* for the fast-path (falls back to live scrape).

## Error handling

- Per-channel add failures toast individually and leave the banner visible.
- `scrape-channel` `server_busy` → single retry after 30s, then defer to auto-scrape with an informative toast.
- Edge-fn fast-path failure (e.g. viral query error) falls through to the live scrape rather than failing the analysis.

## Testing / verification

- `tsc --noEmit` verified by **exit code** before any deploy (CI runs vite build only, no typecheck).
- Manual verify matrix: client with IG only; client with IG+TikTok+YouTube; client with no handles; client whose channel is already in Viral Today.
- Edge fn: invoke against one linked and one unlinked client before MCP deploy; confirm `data_source` in the stored `audience_analysis`.
- Frontend ships via main (build + manual VPS upload per current CI workaround); edge fn ships via MCP.
