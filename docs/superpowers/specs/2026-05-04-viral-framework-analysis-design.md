# Viral Framework Analysis — Design Spec

**Date:** 2026-05-04
**Status:** Approved — ready for implementation plan
**Related:** [docs/superpowers/specs/2026-05-04-llm-driven-script-builder-design.md](2026-05-04-llm-driven-script-builder-design.md)

---

## Problem

The conversational script builder picks viral references for the LLM to mimic, but the matching is weak. Right now the system pulls candidates by keyword-matching the Instagram/TikTok caption and ranks by Claude reading those captions. Captions are clickbait — they don't tell the LLM what's actually in the video, which means it can't match on the things that matter for replicating a script: hook structure, body pacing, content type, niche fit.

The result is references that look right on paper but are off-tone or off-topic when the user actually compares them to the idea.

---

## Goal

Give the LLM enough structural data about each viral video that it can match references on:

1. **Script structure** — does the hook open the same way? Does the body have similar beats? Is the CTA the same kind of ask?
2. **Niche / audience** — same subject area, same target viewer.
3. **Keywords** — already covered, but transcript adds 10x more searchable text than caption.
4. **Visual pacing and type** — talking head vs. B-roll, fast cuts vs. slow, on-screen text vs. clean.

Only do this for videos worth modeling: top outliers (5x+ outlier score AND 500k+ views).

---

## Scope decisions

- **Only analyze qualifying outliers.** Filter: `outlier_score >= 5 AND views_count >= 500000`. Everything else stays caption-only — not worth the cost or noise.
- **Show the breakdown on the video DETAIL page, not the gallery.** Gallery stays clean. Detail (`/viral-today/video/:videoId`) gains a Breakdown panel.
- **Remix re-uses analyzed data.** When a user clicks "Remix this video" on an analyzed video, the canvas videoNode pre-fills with the transcript and breakdown — no re-transcription triggered. Video playback still works (uses `video_url` like today).
- **When the AI can't find a strong reference, it tells the user how to find one themselves.** Returns specific keywords to search on Instagram/TikTok, the 5x rule, and instructions to paste URLs back to add to the viral DB.

---

## Data model

### New columns on `viral_videos`

| Column | Type | Purpose |
|---|---|---|
| `transcript` | text nullable | Full transcribed audio |
| `hook_text` | text nullable | First ~5s of transcript |
| `cta_text` | text nullable | Last ~5s of transcript |
| `framework_meta` | jsonb nullable | Structural breakdown (see shape below) |
| `transcribed_at` | timestamptz nullable | Indicates this video has been analyzed (sentinel for queries + remix) |

### `framework_meta` shape

```json
{
  "niche_tags": ["personal branding", "creator economy"],
  "audience": "creators 18-30 starting from zero",
  "body_structure": "5 beats — origin, struggle, pivot, result, lesson",
  "content_type": "talking_head",
  "visual_pacing": {
    "cuts_per_minute": 18,
    "tempo": "medium"
  },
  "visual_style": "creator on camera, kitchen setting, occasional text overlays",
  "key_topics": ["origin story", "career pivot", "athlete to entrepreneur"]
}
```

`content_type` enum: `talking_head` / `b_roll_voiceover` / `tutorial_screen_record` / `story_multi_scene` / `text_overlay_explainer` / `dance_trend` / `other`

`visual_pacing.tempo` enum: `slow` / `medium` / `fast`

### Migration

```sql
ALTER TABLE viral_videos
  ADD COLUMN IF NOT EXISTS transcript text,
  ADD COLUMN IF NOT EXISTS hook_text text,
  ADD COLUMN IF NOT EXISTS cta_text text,
  ADD COLUMN IF NOT EXISTS framework_meta jsonb,
  ADD COLUMN IF NOT EXISTS transcribed_at timestamptz;

-- Index for fast filtering on analyzed videos in search
CREATE INDEX IF NOT EXISTS idx_viral_videos_analyzed
  ON viral_videos(transcribed_at)
  WHERE transcribed_at IS NOT NULL;
```

---

## The analyze pipeline

### New edge function: `analyze-viral-video`

**Input:** `{ video_id: string }`

**Idempotent:** if `transcribed_at IS NOT NULL` for this row, returns immediately.

**Steps (in order):**

1. Load the row from `viral_videos` (need `video_url` and `caption`)
2. Verify it qualifies: `outlier_score >= 5 AND views_count >= 500000`. If not, return a 200 with `{skipped: true, reason: "below_threshold"}`.
3. **Transcribe audio** — call Whisper API (OpenAI) with the video URL. Get transcript with timestamps. ~$0.006/minute.
4. **Sample 5 frames** evenly spaced across the video. Use ffmpeg or a frame-extraction service. Convert to base64.
5. **Vision pass** — single Claude call with all 5 frames + the prompt: "Describe what type of video this is, the visual pacing, cuts per minute, visual style, and any text-on-screen patterns." Returns structured JSON for `content_type`, `visual_pacing`, `visual_style`.
6. **Structural pass** — Haiku call on the transcript: "Extract `hook_text` (first 5s), `cta_text` (last 5s), `body_structure` (one-sentence summary of body beats), `niche_tags[]`, `audience`, `key_topics[]`."
7. **Update the row** with all fields + `transcribed_at = now()`.
8. Return `{success: true, video_id}`.

**Estimated cost per video:** ~$0.03 (Whisper $0.003 + vision $0.025 + Haiku $0.001).

### Backfill

One-time SQL script triggers `analyze-viral-video` for every row matching the criteria:

```sql
SELECT id FROM viral_videos
WHERE outlier_score >= 5
  AND views_count >= 500000
  AND transcribed_at IS NULL
ORDER BY outlier_score DESC;
```

Run a backfill function (or a small script using `pg_net.http_post`) that calls `analyze-viral-video` for each ID. Rate-limit to ~5 concurrent calls to avoid hammering Whisper.

**Estimated total cost:** depends on count. If ~200 qualifying videos exist today: ~$6.

### Going forward

Hook into the existing scrape pipeline. After a new viral_video is inserted, if it meets criteria, queue `analyze-viral-video` for it. Implementation options:

- **Postgres trigger** that calls `pg_net.http_post` on insert if criteria met
- **Cron job** that polls every 10 minutes for unanalyzed qualifying videos and processes them

Either works; trigger is more responsive but pg_net needs to be enabled. Cron is more conservative.

---

## Frontend changes

### `ViralVideoDetail` page (`/viral-today/video/:videoId`)

Add a new "Breakdown" panel below the existing video metadata. Only shown when `transcribed_at IS NOT NULL`.

Layout:

```
┌─ existing video player + stats ─┐
│                                  │
└──────────────────────────────────┘
┌─ Breakdown ──────────────────────┐
│ TYPE: Talking head · PACING: Med │
│ NICHE: personal branding         │
│ AUDIENCE: creators 18-30...      │
│                                  │
│ HOOK: "Send to a guy that..."    │
│ BODY: 5 beats — origin, ...      │
│ CTA: "Follow if you're..."       │
│                                  │
│ ▼ Full transcript (collapsed)    │
└──────────────────────────────────┘
[ Existing "Remix this video" btn ]
```

If `transcribed_at IS NULL`, the panel doesn't render — the video card and existing layout are unchanged.

### Remix flow

The existing "Remix this video" button sends the user to a canvas with a videoNode. Currently the videoNode auto-transcribes on canvas open.

**Update:** when the videoNode is created from a Remix click, look up `viral_videos.transcript` and `framework_meta`. If they exist, pre-fill the videoNode's `data` so the canvas doesn't trigger re-analysis:

```typescript
// before (current)
nodes.push({
  type: "videoNode",
  data: {
    url: video.video_url,
    caption: video.caption,
    // ... triggers auto-transcription on render
  }
});

// after (new)
nodes.push({
  type: "videoNode",
  data: {
    url: video.video_url,
    caption: video.caption,
    audioTranscription: video.transcript ?? undefined,  // ← pre-filled
    visualBreakdown: video.framework_meta?.visual_style ?? undefined,
    frameworkMeta: video.framework_meta ?? undefined,
    skipAutoAnalysis: video.transcribed_at != null,  // ← new flag
  }
});
```

The existing canvas auto-transcribe code checks `data.audioTranscription` before transcribing — already short-circuits on present data. We just need to make sure `skipAutoAnalysis` skips the visual breakdown call too if it's also present.

Video playback works the same — uses `data.url` like always.

---

## Search/ranking changes

### `search_viral_frameworks` filter

Update the candidate query to require analyzed videos:

```typescript
let query = ctx.adminClient
  .from("viral_videos")
  .select("id, video_url, thumbnail_url, caption, channel_username, views_count, outlier_score, hook_text, cta_text, framework_meta, transcript")
  .not("transcribed_at", "is", null)  // ← only ranked videos
  .order("outlier_score", { ascending: false, nullsFirst: false })
  .limit(25);
```

Why filter to analyzed-only: an unanalyzed video has nothing for Claude to reason about beyond its caption, and we know that signal is weak. If the candidate pool is empty after this filter (rare for the major niches once backfill runs), we fall to the keyword-research suggestion below.

### Ranking prompt change

Each candidate sent to Claude now looks like:

```
1. id=<uuid> | @williamscxtt — 5.5x | personal_branding,creator_economy | talking_head,medium pacing
HOOK: "Send to a guy that needs to hear this — if we haven't met..."
BODY: 5 beats, retrospective storytelling — origin → struggle → pivot → result → lesson
CTA: "Follow if you're building from zero"
KEY TOPICS: origin story, debt to success, building authority
```

The ranking instruction:

> Rank by: (a) hook structure match — does the opening pattern feel like the kind of opener the new script needs? (b) niche/audience overlap, (c) content_type and pacing fit, (d) keyword overlap. Outlier score is a tiebreaker only. Reject candidates where structure or niche obviously doesn't fit.

### When no match: keyword research suggestion

If the post-rank candidates list has < 3 strong fits (heuristic: rank confidence below threshold, or pool is empty), the tool returns:

```
I couldn't find strong references in the database. Best move: search Instagram or
TikTok for videos in this niche that hit 5x+ the account's average views, then paste
the URLs here.

Try these search terms: <keywords from the idea, comma-separated>

How to find them:
1. Search those keywords on Instagram (or TikTok)
2. Open creators in the result
3. Check if a video has 5x+ the channel's typical view count
4. Paste 1-3 URLs back here

I'll add them to the database and use them as your framework.
```

The LLM relays this verbatim. The user pastes URLs → existing `add_url_to_viral_database` (which we already pre-process URLs in build-mode.ts) picks them up → search continues with those URLs as frameworks.

---

## Out of scope (for this round)

- Backfill of videos that don't meet the 5x/500k threshold (cost-prohibitive, marginal value)
- Re-analysis on stale data (videos analyzed once stay analyzed; if needed later, add a `force` flag to `analyze-viral-video`)
- Showing the breakdown on the gallery cards (cluttered, not worth it)
- Video chaptering / fine-grained beat detection (`body_structure` summary is enough for the LLM)
- Real-time UI for the analyze pipeline (it runs in the background; the breakdown just appears on the detail page when it's ready)

---

## Implementation phases

A reasonable plan splits this into 4 phases:

1. **Migration + analyze pipeline** — add columns, build `analyze-viral-video` function, end-to-end test on one video
2. **Backfill + scrape integration** — process existing qualifying videos, hook into scrape pipeline for new ones
3. **Frontend** — Breakdown panel on detail page, Remix flow update
4. **Search update** — wire new fields into `search_viral_frameworks`, add keyword-research fallback

Each phase is testable independently.

---

## Cost summary

| Item | One-time | Ongoing |
|---|---|---|
| Backfill (~200 qualifying videos) | ~$6 | — |
| Per new viral video that qualifies | — | ~$0.03 |
| Storage (transcripts ~5KB each) | negligible | negligible |

If 50 new qualifying videos are scraped per day: ~$1.50/day, $45/mo. Bounded by the 5x AND 500k filter — most scraped videos won't qualify.
