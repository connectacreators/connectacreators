# Viral Today × Super Canvas Unification — Design

**Status:** Approved 2026-05-15
**Owner:** @creatorsconnecta
**Implementation phase:** TBD (see companion plan)

## Problem

Viral Today and the Super Canvas video node currently maintain divergent flows around the same underlying data:

- **Viral Today** renders a grid of videos scraped by the VPS Puppeteer service (`72.62.200.145:3099`) into `viral_videos`. Top outliers are auto-analyzed by a cron job (`analyze-viral-video`). Users can only browse — they can't analyze, can't play natively from a detail view, and there is no detail view at all.
- **Super Canvas VideoNode** lets a user paste a video URL, then transcribes it (50 credits via `/transcribe-video`) and, in a separate click, generates a visual breakdown (0 credits via `/analyze-video-multimodal`). The transcript is written back to a `viral_videos` row **only** when the node was created from `/ai` chat build mode with a pre-bound `viralVideoId`. Fresh Canvas pastes never touch `viral_videos`; their analysis is orphaned to canvas state.
- The visual breakdown (`framework_meta.visual_segments`, audio features) is never persisted back to `viral_videos` from Canvas. The cron pipeline writes it, but no user-facing path does.
- Video playback in Viral Today is via on-demand VPS proxy with no persistence; Instagram CDN URLs expire after 60–90 days, so videos eventually become unplayable.

The result: users pay credits twice for the same URL if they happen to paste it in different places, the analysis cache is fragmented, the detail experience is missing, and playback degrades over time. Competitor (Sandcastles.ai) has a single unified detail experience that we want to match.

## Goal

`viral_videos` becomes the **only** source of truth for any external video the system has ever seen. Every entry point — VPS Puppeteer scrape, `/ai` chat paste, Canvas paste, Viral Today detail page — converges on the same row, the same analysis cache, and the same video file. A single "Analyze" action unifies transcript + visual breakdown. Playback is persistent for 90 days via Supabase Storage.

## Non-goals

- Per-user libraries / "private" videos. Storage is global; the analysis cache is shared.
- Replacing the existing VPS Puppeteer scraper. The cron-driven channel scrapes keep running unchanged; only the post-scrape *analysis* path is touched (and only to share code with the new user-triggered analyze function).
- Replacing the `transcribe-canvas-media` edge function. That serves a separate "canvas builder uploads" feature and is out of scope.
- Long-term video archival beyond 90 days. After expiry the row keeps its transcript/visual breakdown forever, but the file is deleted. Re-fetch is a separate user action.
- Hosting (Mux, CDN). We use Supabase Storage directly.

## Architecture

One sentence: every video URL that enters the system, from any surface, finds-or-creates a row in `viral_videos` keyed by `(platform, apify_video_id)`, and every analysis flow reads-and-writes that row.

```
VPS Puppeteer scrape ─┐
/ai chat paste ───────┼─► viral_videos row ─► ViralTodayDetailPage (/viral-today/:id)
Canvas paste ─────────┘  + Storage MP4    └─► Canvas VideoNode
Viral Today re-analyze ─────────────────  └─► /ai chat reference
```

The deduplication key is the existing `UNIQUE (platform, apify_video_id) NULLS NOT DISTINCT`. The legacy column name `apify_video_id` stores the platform-native post ID (Instagram shortcode, TikTok video ID, YouTube video ID). For Canvas-pasted URLs, we extract this ID from the URL via a shared canonicalization helper — no schema rename, no new column.

### Why this works

- The bottleneck today is that Canvas paste skips the row entirely. Once Canvas always finds-or-creates a row, all four entry paths converge.
- The cron-driven `analyze-viral-video` and the new user-triggered analyze function share the same downstream logic. Both write the same fields to the same row. Whichever runs first wins; the other becomes a noop.
- Storage of the MP4 in Supabase Storage decouples playback from upstream CDN expiration. We already have precedent: `video_edits` writes to a `footage` bucket and `cleanup-expired-videos` enforces 90-day retention. We mirror that pattern with a new `viral-videos` bucket and `cleanup-expired-viral-videos` function.

## Schema changes

Single migration on `viral_videos`:

```sql
ALTER TABLE viral_videos
  ADD COLUMN video_file_url        TEXT,
  ADD COLUMN video_file_expires_at TIMESTAMPTZ,
  ADD COLUMN analysis_status       TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN analysis_error        TEXT;

-- Status state machine:
--   'pending'   row exists, no analysis yet
--   'analyzing' an analyze flow is in progress (advisory lock)
--   'analyzed'  transcript + framework_meta + visual_segments all populated
--   'failed'    analyze flow errored; analysis_error has details

-- Backfill: a row counts as 'analyzed' only if BOTH transcript and visual breakdown exist.
-- Rows with just a transcript (older Canvas flows that didn't write framework_meta back)
-- stay 'pending' so the user can trigger a full unified analyze and fill in the gap.
-- This is intentional: those rows already have a transcript cached, so the unified
-- analyzer will skip the Whisper step on a re-run (transcript IS NOT NULL short-circuit).
UPDATE viral_videos
  SET analysis_status = 'analyzed'
  WHERE transcribed_at IS NOT NULL
    AND framework_meta IS NOT NULL
    AND framework_meta ? 'visual_segments';

-- Index for cleanup job lookups.
CREATE INDEX idx_viral_videos_file_expires
  ON viral_videos (video_file_expires_at)
  WHERE video_file_url IS NOT NULL;

-- Index for grid queries that need to surface analyzed-but-non-outlier user submissions.
-- (Currently the grid filters by outlier criteria; we keep that. This index is for
-- the future "Community submitted" tab if we ever add it. Not required for v1.)
CREATE INDEX idx_viral_videos_analysis_status
  ON viral_videos (analysis_status, scraped_at DESC);
```

The existing `transcript_status` column stays for backward compat but becomes derivable from `analysis_status`. No code reads it directly today outside of `transcribe-video`, which we are refactoring anyway.

### New Storage bucket

`viral-videos`, private, files named `{viral_video_id}.mp4`. RLS: authenticated users can read; only the service role can write. Mirror of the existing `footage` bucket policy.

## URL canonicalization helper

Single shared module: `supabase/functions/_shared/canonicalize-video-url.ts` and a mirror at `src/lib/canonicalize-video-url.ts`.

Input: any pasted URL. Output: `{ platform: 'instagram' | 'tiktok' | 'youtube' | 'facebook', postId: string, normalizedUrl: string }` or `null` if unrecognized.

Patterns:

| Platform  | URL patterns                                                       | postId source     |
|-----------|--------------------------------------------------------------------|-------------------|
| instagram | `/reel/{shortcode}`, `/p/{shortcode}`, `/reels/{shortcode}`        | shortcode         |
| tiktok    | `/video/{id}`, `/@{user}/video/{id}`, `vm.tiktok.com/{shortcode}`  | id (resolve shortcode if needed via existing VPS endpoint) |
| youtube   | `?v={id}`, `/shorts/{id}`, `youtu.be/{id}`                         | id                |
| facebook  | `/reel/{id}`, `/watch?v={id}`, `/videos/{id}`                      | id                |

`normalizedUrl` strips tracking query params (`igsh`, `utm_*`, `si`, `feature`, `fbclid`, etc.) and lowercases the host. Used for display only; deduplication still goes through `(platform, postId)`.

## Flows

### A. Find-or-create (Canvas paste, /ai chat paste, Viral Today direct link)

New edge function: `/viral-video-resolve`.

```
POST /viral-video-resolve { url: string }

1. canonicalize_video_url(url) → { platform, postId, normalizedUrl }
   if null → return 400 "Unrecognized video URL".
2. SELECT * FROM viral_videos WHERE platform=$1 AND apify_video_id=$2
3. If row exists → return row (200).
4. If not → INSERT {
     platform, apify_video_id: postId, video_url: normalizedUrl,
     channel_username: extract_handle_from_url(url) OR 'unknown',
     analysis_status: 'pending',
     user_submitted: true,
     submitted_by: auth.uid(),
     outlier_score: 0,
     views_count: 0, likes_count: 0, comments_count: 0,
     scraped_at: now()
   } and return the new row.
5. Idempotency: handle 23505 (unique violation) by re-selecting and returning the winner.
```

Frontend uses this from:

- **VideoNode** on URL paste (replaces today's no-op pre-transcribe behavior).
- **/ai chat** when a user pastes a URL in build mode (replaces the existing inline upsert).
- **`/viral-today/:id` deep link** when the ID isn't yet known but a URL is.

After resolve, the frontend has a `viral_video_id` and pre-populates whatever fields are filled. UI state branches on `analysis_status`:

| Status      | UI                                                                                   |
|-------------|--------------------------------------------------------------------------------------|
| pending     | "Analyze (50 credits)" button enabled                                                |
| analyzing   | Disabled progress indicator; realtime subscription updates                            |
| analyzed    | Transcript, visual breakdown, framework all rendered. No analyze button.             |
| failed      | "Retry analyze (50 credits)" button + `analysis_error` message                       |

### B. Unified analyze (single button on both surfaces)

New edge function: `/analyze-viral-video-user`.

This is the user-session variant of the existing cron-driven `/analyze-viral-video`. Both should share their core logic via a new `_shared/viral-video-analyzer.ts` module so we maintain one analyze pipeline.

```
POST /analyze-viral-video-user { viral_video_id: string }

1. Auth: require user JWT.
2. SELECT viral_videos WHERE id=$1 FOR UPDATE.
3. If analysis_status='analyzed' AND video_file_url IS NOT NULL → return 200 noop.
4. If analysis_status='analyzing' → return 409 (caller should subscribe to realtime).
5. UPDATE row SET analysis_status='analyzing', analysis_error=NULL.
6. Deduct 50 credits via deduct_credits_atomic('analyze_viral_video', 50).
   On insufficient credits → revert status to 'pending', return 402.
7. shared_analyzer.analyze(row):
   a. VPS /cobalt-proxy → download MP4 to VPS disk (existing logic).
   b. Upload MP4 → Supabase Storage bucket viral-videos/{id}.mp4.
      Get signed URL, store in video_file_url.
      Set video_file_expires_at = now() + interval '90 days'.
      Skip if video_file_url already set and file still exists in bucket.
   c. Transcript: YouTube captions fast-path, else Whisper via VPS /extract-audio
      (existing logic from transcribe-video, extracted to shared module).
      Skip if row.transcript IS NOT NULL (cache short-circuit — important for
      legacy rows that have transcript but no visual breakdown).
   d. Call /analyze-video-multimodal → visual_segments + audio features.
      Skip if framework_meta already contains visual_segments.
   e. Haiku tagging: niche_tags, audience, key_topics, body_structure, is_caption_style.
      Caption-style override: if visual_segments have text_on_screen AND transcript
      word count < 40, treat visual text as the transcript for search/indexing
      (existing logic from cron analyzer).
8. UPDATE row SET
     transcript, hook_text, cta_text, framework_meta,
     transcribed_at = now(), analysis_status = 'analyzed', analysis_error = NULL.
9. On any exception in step 7:
     UPDATE row SET analysis_status='failed', analysis_error=<message>.
     Refund 50 credits via deduct_credits_atomic('analyze_viral_video_refund', -50).
     Return 500.
10. Return updated row.
```

**Concurrency:** Step 2's `SELECT FOR UPDATE` plus step 4's 409 prevent two concurrent analyze calls. The advisory-lock equivalent is the row-level lock held by the transaction; once one client commits `analysis_status='analyzing'`, others see it and bail out.

**Realtime:** Frontend subscribes to the row via `supabase.channel().on('postgres_changes', ...)` so concurrent viewers see progress and the final transition to `'analyzed'`.

### C. Viral Today detail page

New route: `/viral-today/:id`. New component: `src/pages/ViralTodayDetail.tsx`.

```
┌─ /viral-today/:id ────────────────────────────────────────┐
│ ← back   @joshlyons.sales · 3d ago                         │
│                                                            │
│ ┌─────────────┐   Summary                                  │
│ │  [player]   │   Jacob earned $100k a month in...         │
│ │   9:16      │                                            │
│ │             │   [ Transcript | Visual | Hook | Story ]   │
│ │             │   ─────────────────────────────────────    │
│ │             │   Yeah, in October I did $113,000...       │
│ └─────────────┘                                            │
│ 32.5x  103K  1%                                            │
│                                                            │
│ [ Create script ]  [ Open in canvas ]                      │
└────────────────────────────────────────────────────────────┘
```

**Player:** HTML5 `<video>` with `src = video_file_url`. Falls back to existing VPS `/stream-reel?url=` proxy if `video_file_url IS NULL` (e.g., expired). Aspect ratio detection mirrors Canvas's `CanvasVideoPlayer`. **Use a shared `<ViralVideoPlayer>` component** extracted from `CanvasVideoPlayer` so both surfaces match.

**Tabs:** Transcript (string), Visual Layout (segments timeline), Hook (`hook_text` + leading visual segments), Storytelling Format (derived from `framework_meta.body_structure`).

**CTAs:**

| State                              | Bottom action                                              |
|------------------------------------|------------------------------------------------------------|
| analysis_status ≠ 'analyzed'       | `[ Analyze (50 credits) ]` primary                          |
| analysis_status = 'analyzed'       | `[ Create script ]` `[ Open in canvas ]`                    |
| video_file_url IS NULL but status='analyzed' | `[ Refresh video ]` (free) plus the two above |
| Source URL also dead               | "Source no longer available" notice; both CTAs still work since transcript/analysis are cached |

**`Open in Canvas`:** Navigate to `/canvas?attach=<viral_video_id>`. Canvas creates a `VideoNode` pre-bound to that ID and immediately pulls all fields from the row. No re-bill.

### D. 90-day cleanup

New edge function: `cleanup-expired-viral-videos`, scheduled on the same daily cron as the existing `cleanup-expired-videos`.

```
SELECT id, video_file_url FROM viral_videos
  WHERE video_file_expires_at < now() AND video_file_url IS NOT NULL
  LIMIT 500;

For each:
  supabase.storage.from('viral-videos').remove([`${id}.mp4`]);
  UPDATE viral_videos SET video_file_url=NULL, video_file_expires_at=NULL WHERE id=$1;
```

Transcript, framework_meta, and all metadata stay forever. Only the MP4 is deleted.

**Refresh-video flow** for the post-expiry case:

```
POST /viral-video-refresh-file { viral_video_id }

1. Auth: require user JWT (no credit cost).
2. Load row; require analysis_status='analyzed'.
3. Run shared_analyzer.download_and_upload(row):
     VPS /cobalt-proxy → MP4 → Supabase Storage → set video_file_url + expires_at.
4. If VPS reports source URL is dead → return 410 "Source no longer available".
```

This is intentionally cheaper than a full re-analyze: no transcript, no Whisper, no visual breakdown — just re-acquire the file.

### E. Grid filter behavior (no code change required)

The existing `/viral-today` grid filter (outlier criteria, top-only toggle, hashtag source, etc.) is left untouched. User-pasted videos that don't meet the criteria exist in the DB but don't surface in the main feed. They remain reachable via direct URL (`/viral-today/:id`), from inside Canvas (which always pulls fresh from the row), and from `/ai` chat references. This is the "Filtered: only if it meets the viral threshold" decision from brainstorming.

## Refactor of existing code

### Canvas `VideoNode.tsx`

- On URL paste, call `/viral-video-resolve` before anything else; store the returned `viralVideoId` on the node.
- Collapse the two-button flow (`Go` + `Generate Visual Breakdown`) into a single `Analyze` button that calls `/analyze-viral-video-user`. The current `transcribe()` and `runVisualAnalysis()` functions are deleted; a single `analyze()` replaces both.
- Pre-populate from row: if `transcript`, `framework_meta`, `video_file_url` are already filled, render them immediately and skip the button.
- Player swap: replace `CanvasVideoPlayer`'s direct `videoFileUrl` plumbing with the new shared `<ViralVideoPlayer>` reading from `viral_videos.video_file_url`.

### `transcribe-video` edge function

Becomes thin: still accepts `{ url, viral_video_id? }` for backward compat with any non-Canvas caller, but internally just resolves the row via the shared helper and delegates to the new shared analyzer module. Eventually can be removed once all callers move to `/analyze-viral-video-user`, but **not in this spec** — leave it in place.

### `analyze-viral-video` (cron) edge function

Refactored to import the shared analyzer module. Same outlier filter logic; same cron schedule; same no-credit behavior.

### `/ai` chat URL paste

Replace its current direct upsert into `viral_videos` with a call to `/viral-video-resolve` for consistency. Then continue with whatever build-mode-specific flow it was doing.

## Error handling

| Failure                            | Behavior                                                                         |
|------------------------------------|----------------------------------------------------------------------------------|
| Unrecognized URL                   | 400 from resolve; toast "Unsupported URL"                                        |
| VPS cobalt-proxy fails             | analyze_status='failed', refund credits, surface "Couldn't fetch video" in UI    |
| Storage upload fails               | Same as above; treat as transient                                                |
| Whisper times out                  | Same — full refund, no partial state                                             |
| Visual breakdown fails post-transcript | analyze_status='failed', refund (we treat both as one atomic step from the user's POV) |
| Concurrent analyze (two clients)   | Second client gets 409, falls back to realtime subscription                      |
| Cleanup tries to delete missing file | Log warning, still null the columns                                            |
| Refresh-file with dead source URL  | 410, UI shows "Source no longer available", row keeps `video_file_url=NULL`      |

## Testing

This is a backend-heavy change; unit tests on the canonicalization helper plus integration tests on the analyze pipeline are the priority.

- **`canonicalize-video-url.test.ts`**: table-driven tests across all four platforms, with and without query params, including expired-format edge cases (e.g., `vm.tiktok.com` short links).
- **`viral-video-resolve.test.ts`**: hits a local Supabase fixture; verifies find vs. create, idempotency under 23505, RLS for `submitted_by`.
- **`analyze-viral-video-user.test.ts`**: mocks the shared analyzer; verifies state-machine transitions, credit deduction, refund on failure, 409 on concurrent call.
- **Manual UAT** on `/viral-today/:id` for: pending → analyzing → analyzed transitions via realtime; expired-file refresh path; Canvas paste of an already-analyzed URL (verify zero re-bill).

## Rollout

Single-PR sequencing — three commits in order:

1. **Schema + shared helpers**: migration, canonicalization helpers, new bucket, RLS policies. No behavior change.
2. **Edge functions**: `/viral-video-resolve`, `/analyze-viral-video-user`, `/viral-video-refresh-file`, `cleanup-expired-viral-videos`, plus shared analyzer module. `analyze-viral-video` cron refactored to use the shared module (no behavior change for it).
3. **Frontend**: `ViralTodayDetail` page, route wiring, `VideoNode` refactor to use resolve + unified analyze, `<ViralVideoPlayer>` shared component, `Open in Canvas` deep-link handler.

No feature flag — the change is strictly additive on the data layer, and the UI surfaces (Viral Today detail page, single Canvas analyze button) are direct improvements with no behavioral regressions. Beta-gated if the PR is deployed before we've verified the cleanup cron and storage costs in staging.

## Open questions resolved during brainstorming

| Question                                    | Decision                                                      |
|---------------------------------------------|---------------------------------------------------------------|
| Visibility scope                            | Global pool, shared analysis cache                            |
| Detail UX                                   | Dedicated `/viral-today/:id` page (not modal, not Canvas)     |
| Analyze trigger                             | Single "Analyze" button; Canvas updated to match              |
| Grid clutter from user-pasted videos        | Filtered by existing outlier criteria; no special "community submitted" tab in v1 |
| Playback persistence                        | Supabase Storage `viral-videos` bucket, 90-day TTL, then refresh-file path |
| `apify_video_id` rename                     | No — keep legacy name; populate from URL via shared helper    |
| Apify vs Puppeteer                          | Clarified: VPS Puppeteer (`72.62.200.145:3099`), no Apify     |
