# Viral Framework Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add transcript + visual breakdown + structural metadata to top-outlier viral videos so the conversational script builder can match references on hook structure, niche, pacing, and content type — not just keywords.

**Architecture:** A thin `analyze-viral-video` edge function orchestrates the existing `transcribe-video` (Whisper-based audio transcription) and `analyze-video-multimodal` (frame-by-frame visual + structural analysis) functions, plus one Haiku call for niche tagging. Results are persisted in new columns on `viral_videos`. Only videos meeting `outlier_score >= 5 AND views_count >= 500000` get analyzed. The Viral Today detail page shows a Breakdown panel for analyzed videos. The Remix flow pre-fills the canvas videoNode with cached analysis so it doesn't re-transcribe. Search uses the new fields and falls back to user keyword research when no good match exists.

**Tech Stack:** Supabase Postgres, Deno edge functions, existing transcribe-video + analyze-video-multimodal functions, Anthropic Claude Haiku, React (ViralVideoDetail page, VideoNode), TypeScript.

**Spec:** [docs/superpowers/specs/2026-05-04-viral-framework-analysis-design.md](../specs/2026-05-04-viral-framework-analysis-design.md)

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `supabase/migrations/20260504_viral_videos_framework_analysis.sql` | Create | Add `transcript`, `hook_text`, `cta_text`, `framework_meta`, `transcribed_at` columns + index |
| `supabase/functions/analyze-viral-video/index.ts` | Create | Orchestrator: calls transcribe-video + analyze-video-multimodal + Haiku tagging, writes to viral_videos |
| `supabase/functions/analyze-viral-video/deno.json` | Create | Deno config |
| `supabase/config.toml` | Modify | Register `analyze-viral-video` with `verify_jwt = false` |
| `supabase/functions/companion-chat/build-tool-handlers.ts` | Modify | `handleSearchViralFrameworks` filters on `transcribed_at IS NOT NULL`, uses new fields, returns keyword-research fallback |
| `src/pages/ViralVideoDetail.tsx` | Modify | Add Breakdown panel below video stats; update Remix handler to pass cached analysis |
| `src/pages/Scripts.tsx` | Modify | Pass cached analysis from `remixVideo` state into the videoNode created on canvas |
| `src/components/canvas/VideoNode.tsx` | Modify | Skip auto-transcribe + auto-analyze when `transcription` and `structure` already pre-filled |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260504_viral_videos_framework_analysis.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260504_viral_videos_framework_analysis.sql
-- Adds transcript + structural metadata columns to viral_videos.
-- Only top outliers (5x+ AND 500k+ views) get analyzed; the rest leave these NULL.

ALTER TABLE viral_videos
  ADD COLUMN IF NOT EXISTS transcript text,
  ADD COLUMN IF NOT EXISTS hook_text text,
  ADD COLUMN IF NOT EXISTS cta_text text,
  ADD COLUMN IF NOT EXISTS framework_meta jsonb,
  ADD COLUMN IF NOT EXISTS transcribed_at timestamptz;

-- Partial index for fast filtering on analyzed videos in framework search
CREATE INDEX IF NOT EXISTS idx_viral_videos_analyzed
  ON viral_videos(transcribed_at)
  WHERE transcribed_at IS NOT NULL;

-- Partial index for the backfill query (find unanalyzed qualifying videos)
CREATE INDEX IF NOT EXISTS idx_viral_videos_qualifying_unanalyzed
  ON viral_videos(outlier_score DESC)
  WHERE transcribed_at IS NULL
    AND outlier_score >= 5
    AND views_count >= 500000;
```

- [ ] **Step 2: Apply via Supabase MCP**

Use the `mcp__plugin_supabase_supabase__apply_migration` tool with:
- `project_id`: `hxojqrilwhhrvloiwmfo`
- `name`: `viral_videos_framework_analysis`
- `query`: the SQL above

Expected response: `{ "success": true }`

- [ ] **Step 3: Verify schema**

Run via `mcp__plugin_supabase_supabase__execute_sql`:

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'viral_videos' AND column_name IN ('transcript','hook_text','cta_text','framework_meta','transcribed_at')
ORDER BY ordinal_position;
```

Expected: 5 rows returned with the right types (`text`, `text`, `text`, `jsonb`, `timestamp with time zone`).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260504_viral_videos_framework_analysis.sql
git commit -m "feat(viral): add transcript + framework_meta columns to viral_videos"
```

---

## Task 2: Create analyze-viral-video Edge Function

**Files:**
- Create: `supabase/functions/analyze-viral-video/index.ts`
- Create: `supabase/functions/analyze-viral-video/deno.json`
- Modify: `supabase/config.toml`

This is a thin orchestrator. It calls the EXISTING `transcribe-video` and `analyze-video-multimodal` functions, plus one Haiku call for niche tagging.

- [ ] **Step 1: Write `deno.json`**

```json
{
  "imports": {
    "@supabase/supabase-js": "https://esm.sh/@supabase/supabase-js@2.45.4"
  }
}
```

- [ ] **Step 2: Register in `supabase/config.toml`**

Open `supabase/config.toml`. Find the existing `[functions.companion-chat]` block. After it (or alongside other function blocks), add:

```toml
[functions.analyze-viral-video]
verify_jwt = false
```

- [ ] **Step 3: Write `index.ts`**

```typescript
// supabase/functions/analyze-viral-video/index.ts
// Orchestrator: takes a viral_videos row, calls existing transcribe-video and
// analyze-video-multimodal functions, plus a Haiku call for niche tagging,
// then writes results back to the row.
//
// Idempotent: if transcribed_at IS NOT NULL on the row, returns immediately.
// Threshold: only processes videos where outlier_score >= 5 AND views_count >= 500000.

import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

const MIN_OUTLIER_SCORE = 5;
const MIN_VIEWS = 500_000;

interface RequestBody {
  video_id: string;
  force?: boolean; // re-analyze even if transcribed_at exists
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: RequestBody;
  try {
    body = await req.json() as RequestBody;
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!body.video_id) {
    return new Response(JSON.stringify({ error: "missing video_id" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 1. Load the row
  const { data: video, error: videoErr } = await admin
    .from("viral_videos")
    .select("id, video_url, caption, channel_username, outlier_score, views_count, transcript, transcribed_at")
    .eq("id", body.video_id)
    .maybeSingle();

  if (videoErr || !video) {
    return new Response(JSON.stringify({ error: `video not found: ${body.video_id}` }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 2. Idempotency check
  if (video.transcribed_at && !body.force) {
    return new Response(JSON.stringify({ skipped: true, reason: "already_analyzed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 3. Threshold check
  const outlier = Number(video.outlier_score ?? 0);
  const views = Number(video.views_count ?? 0);
  if (outlier < MIN_OUTLIER_SCORE || views < MIN_VIEWS) {
    return new Response(JSON.stringify({
      skipped: true,
      reason: "below_threshold",
      outlier_score: outlier,
      views_count: views,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  if (!video.video_url) {
    return new Response(JSON.stringify({ error: "no video_url on row" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 4. Call existing transcribe-video function
  const transcribeRes = await fetch(`${SUPABASE_URL}/functions/v1/transcribe-video`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ url: video.video_url }),
  });
  const transcribeJson: any = await transcribeRes.json().catch(() => ({}));
  if (!transcribeRes.ok || !transcribeJson?.transcription) {
    console.error("[analyze-viral-video] transcribe-video failed:", transcribeJson);
    return new Response(JSON.stringify({
      error: "transcribe_failed",
      details: transcribeJson?.error ?? `status ${transcribeRes.status}`,
    }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const transcript: string = transcribeJson.transcription;

  // 5. Call existing analyze-video-multimodal function
  const multimodalRes = await fetch(`${SUPABASE_URL}/functions/v1/analyze-video-multimodal`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      url: video.video_url,
      original_url: video.video_url,
      transcript,
    }),
  });
  const multimodalJson: any = await multimodalRes.json().catch(() => ({}));
  // Even if visual analysis fails partially, we keep the transcript and continue
  const structureData = multimodalRes.ok ? multimodalJson : null;

  // 6. Extract hook_text and cta_text from structure (if available) or fall back to transcript chunks
  let hookText: string | null = null;
  let ctaText: string | null = null;
  if (structureData?.sections && Array.isArray(structureData.sections)) {
    const hookSection = structureData.sections.find((s: any) => s.section === "hook");
    const ctaSection = structureData.sections.find((s: any) => s.section === "cta");
    hookText = hookSection?.actor_text ?? hookSection?.visual_cue ?? null;
    ctaText = ctaSection?.actor_text ?? ctaSection?.visual_cue ?? null;
  }
  if (!hookText && transcript) {
    // Fallback: first 30 words
    hookText = transcript.split(/\s+/).slice(0, 30).join(" ");
  }
  if (!ctaText && transcript) {
    // Fallback: last 30 words
    const words = transcript.split(/\s+/);
    ctaText = words.slice(Math.max(0, words.length - 30)).join(" ");
  }

  // 7. Haiku call for niche/audience/key_topics tagging
  let nicheTags: string[] = [];
  let audience: string = "";
  let keyTopics: string[] = [];
  let bodyStructure: string = "";

  try {
    const tagRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        messages: [{
          role: "user",
          content: `You are tagging a viral short-form video for a creator-content database. Read the transcript and caption, then output ONLY a JSON object with these fields:

{
  "niche_tags": ["<2-4 short niche labels, lowercase, e.g. 'personal branding', 'fitness', 'pest control sales'>"],
  "audience": "<one phrase describing the target viewer, e.g. 'creators 18-30 starting from zero'>",
  "key_topics": ["<3-5 specific topic labels, e.g. 'origin story', 'career pivot', 'rookie pitch contest'>"],
  "body_structure": "<one sentence summarizing the body's narrative pattern, e.g. '5 beats — origin, struggle, pivot, result, lesson'>"
}

CAPTION: ${(video.caption ?? "").slice(0, 400)}

TRANSCRIPT: ${transcript.slice(0, 2500)}

Output ONLY the JSON object, no commentary.`,
        }],
      }),
    });
    const tagJson: any = await tagRes.json();
    if (tagRes.ok) {
      let raw = (tagJson.content?.[0]?.text as string ?? "").trim();
      raw = raw.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/\s*```$/, "").trim();
      const parsed = JSON.parse(raw);
      nicheTags = Array.isArray(parsed.niche_tags) ? parsed.niche_tags.slice(0, 4) : [];
      audience = typeof parsed.audience === "string" ? parsed.audience.slice(0, 200) : "";
      keyTopics = Array.isArray(parsed.key_topics) ? parsed.key_topics.slice(0, 5) : [];
      bodyStructure = typeof parsed.body_structure === "string" ? parsed.body_structure.slice(0, 300) : "";
    } else {
      console.warn("[analyze-viral-video] haiku tagging failed:", tagJson);
    }
  } catch (e) {
    console.warn("[analyze-viral-video] haiku parse error:", (e as Error).message);
  }

  // 8. Compose framework_meta
  const frameworkMeta: Record<string, unknown> = {
    niche_tags: nicheTags,
    audience,
    key_topics: keyTopics,
    body_structure: bodyStructure,
    content_type: structureData?.detected_format ?? null,
    visual_pacing: {
      cuts_per_minute: structureData?.audio_features?.bpm_estimate ?? null,
      tempo: structureData?.audio_features?.energy ?? null,
    },
    visual_segments: Array.isArray(structureData?.visual_segments)
      ? structureData.visual_segments.slice(0, 10)
      : [],
    raw_structure: structureData?.sections ?? null,
  };

  // 9. Persist to viral_videos
  const { error: updateErr } = await admin
    .from("viral_videos")
    .update({
      transcript,
      hook_text: hookText,
      cta_text: ctaText,
      framework_meta: frameworkMeta,
      transcribed_at: new Date().toISOString(),
    })
    .eq("id", body.video_id);

  if (updateErr) {
    console.error("[analyze-viral-video] update failed:", updateErr);
    return new Response(JSON.stringify({ error: "db_update_failed", details: updateErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({
    success: true,
    video_id: body.video_id,
    transcript_length: transcript.length,
    has_structure: !!structureData,
    niche_tags: nicheTags,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
```

- [ ] **Step 4: Deploy the function**

```bash
npx supabase functions deploy analyze-viral-video --no-verify-jwt
```

Expected last line: `Deployed Functions on project hxojqrilwhhrvloiwmfo: analyze-viral-video`

- [ ] **Step 5: Smoke test on one video**

First find a qualifying video to test with via `mcp__plugin_supabase_supabase__execute_sql`:

```sql
SELECT id, channel_username, outlier_score, views_count
FROM viral_videos
WHERE outlier_score >= 5 AND views_count >= 500000 AND transcribed_at IS NULL
ORDER BY outlier_score DESC
LIMIT 1;
```

Note the `id` returned. Then call the function via curl using the anon key:

```bash
ANON_KEY="<anon key from .env file: VITE_SUPABASE_PUBLISHABLE_KEY>"
VIDEO_ID="<the id from the query above>"
curl -X POST "https://hxojqrilwhhrvloiwmfo.supabase.co/functions/v1/analyze-viral-video" \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"video_id\":\"$VIDEO_ID\"}"
```

Expected: `{"success":true, "video_id":"...", "transcript_length":<number>, "has_structure":true, "niche_tags":[...]}`

Then verify the row was updated:

```sql
SELECT id, LENGTH(transcript) as transcript_chars, hook_text, framework_meta->>'content_type' as content_type, framework_meta->'niche_tags' as niche_tags, transcribed_at
FROM viral_videos
WHERE id = '<VIDEO_ID>';
```

Expected: `transcript_chars > 0`, `hook_text` is non-null, `content_type` is non-null, `niche_tags` is a JSON array, `transcribed_at` is recent.

- [ ] **Step 6: Test idempotency**

Re-run the same curl from Step 5. Expected: `{"skipped":true,"reason":"already_analyzed"}`.

- [ ] **Step 7: Test threshold**

Find a non-qualifying video:

```sql
SELECT id FROM viral_videos
WHERE (outlier_score < 5 OR views_count < 500000)
LIMIT 1;
```

Call the function with that ID. Expected: `{"skipped":true,"reason":"below_threshold","outlier_score":..., "views_count":...}`

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/analyze-viral-video/ supabase/config.toml
git commit -m "feat(viral): analyze-viral-video orchestrator (transcribe + multimodal + Haiku tagging)"
```

---

## Task 3: Backfill Existing Qualifying Videos

**Files:** No code files. Uses Supabase SQL + curl.

This is a one-time operation. We rate-limit ourselves to avoid hammering the transcribe service.

- [ ] **Step 1: Count what needs to be backfilled**

```sql
SELECT COUNT(*) FROM viral_videos
WHERE outlier_score >= 5
  AND views_count >= 500000
  AND transcribed_at IS NULL;
```

Note the count. Expected: a number, likely 50-300.

- [ ] **Step 2: Get the list of IDs ordered by outlier**

```sql
SELECT id FROM viral_videos
WHERE outlier_score >= 5
  AND views_count >= 500000
  AND transcribed_at IS NULL
ORDER BY outlier_score DESC;
```

Save the result to a local file `/tmp/viral_to_backfill.txt`, one ID per line.

- [ ] **Step 3: Run the backfill loop**

Replace `<ANON_KEY>` with the actual `VITE_SUPABASE_PUBLISHABLE_KEY` from `.env`.

```bash
ANON_KEY="<paste here>"
while read VIDEO_ID; do
  echo "Analyzing $VIDEO_ID..."
  curl -s -X POST "https://hxojqrilwhhrvloiwmfo.supabase.co/functions/v1/analyze-viral-video" \
    -H "Authorization: Bearer $ANON_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"video_id\":\"$VIDEO_ID\"}" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(' →', 'OK' if d.get('success') else d)"
  sleep 3  # rate-limit to 1 every 3s
done < /tmp/viral_to_backfill.txt
```

Expected: each line prints ` → OK`. Some may print `→ {"skipped": ..., "reason": "already_analyzed"}` if you re-run.

- [ ] **Step 4: Verify completion**

```sql
SELECT
  COUNT(*) FILTER (WHERE transcribed_at IS NOT NULL) as analyzed,
  COUNT(*) FILTER (WHERE transcribed_at IS NULL) as pending
FROM viral_videos
WHERE outlier_score >= 5 AND views_count >= 500000;
```

Expected: `pending = 0` (or near-0 if some videos failed transcription).

- [ ] **Step 5: Spot-check 3 random analyzed videos**

```sql
SELECT id, channel_username, outlier_score, hook_text, framework_meta->'niche_tags' as niches, framework_meta->>'content_type' as content_type
FROM viral_videos
WHERE transcribed_at IS NOT NULL
ORDER BY random()
LIMIT 3;
```

Expected: hook_text reads like a real opener; niches list 2-4 reasonable tags; content_type is a string like `talking_head`.

- [ ] **Step 6: No commit needed** — this was a data-migration step.

---

## Task 4: Hook Into Scrape Pipeline

**Files:**
- Modify: one or more of `supabase/functions/scrape-hashtag/index.ts`, `supabase/functions/scrape-channel/index.ts`, `supabase/functions/scrape-reels-search/index.ts` (whichever inserts into `viral_videos`).

We want: every newly inserted viral_video that meets the threshold automatically gets analyzed in the background.

- [ ] **Step 1: Find which scrape function inserts into viral_videos**

Run:
```bash
grep -l 'from("viral_videos").insert\|.from("viral_videos").upsert' supabase/functions/scrape-*/index.ts supabase/functions/auto-scrape-*/index.ts 2>/dev/null
```

Note each file path returned.

- [ ] **Step 2: For each scrape function, locate the insert and add the trigger**

For each file from Step 1, find the line where `.from("viral_videos").insert(...)` (or `.upsert(...)`) is called. Right after the await of that insert succeeds, add the analyze trigger.

The pattern looks like:

```typescript
// Existing code (example):
const { data: inserted, error } = await admin
  .from("viral_videos")
  .insert(rows)
  .select("id, outlier_score, views_count");
if (error) { /* existing error handling */ }

// ADD: trigger analysis for qualifying rows (fire-and-forget)
if (inserted) {
  for (const row of inserted) {
    if (Number(row.outlier_score ?? 0) >= 5 && Number(row.views_count ?? 0) >= 500000) {
      void fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/analyze-viral-video`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ video_id: row.id }),
      }).catch((e) => console.warn("[scrape] analyze trigger failed:", (e as Error).message));
    }
  }
}
```

If the existing insert doesn't `.select(...)` the needed fields (id, outlier_score, views_count), modify it to do so.

If the existing code uses `upsert` with `onConflict`, the same pattern applies — just make sure `.select("id, outlier_score, views_count")` is appended.

- [ ] **Step 3: Deploy all modified scrape functions**

For each file changed, run the corresponding deploy command:

```bash
npx supabase functions deploy scrape-hashtag --no-verify-jwt
npx supabase functions deploy scrape-channel --no-verify-jwt
npx supabase functions deploy scrape-reels-search --no-verify-jwt
# etc — only the ones you actually modified
```

Expected: each `Deployed Functions on project ...` line.

- [ ] **Step 4: Smoke test the integration**

Trigger one of the scrape functions (manually via the existing UI in the app, e.g. "Refresh viral feed" or whatever flow normally calls them). Wait 1-2 minutes for Whisper to finish, then run:

```sql
SELECT id, channel_username, transcribed_at, framework_meta->>'content_type' as content_type
FROM viral_videos
WHERE created_at > NOW() - INTERVAL '5 minutes'
  AND outlier_score >= 5
  AND views_count >= 500000
ORDER BY created_at DESC
LIMIT 5;
```

Expected: at least one row with non-null `transcribed_at` (analyses run in background; very recent rows might still be pending).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/scrape-*/index.ts supabase/functions/auto-scrape-*/index.ts
git commit -m "feat(viral): trigger analyze-viral-video for qualifying scraped videos"
```

---

## Task 5: Breakdown Panel on ViralVideoDetail Page

**Files:**
- Modify: `src/pages/ViralVideoDetail.tsx`

Add a Breakdown panel that shows when `transcribed_at IS NOT NULL`.

- [ ] **Step 1: Extend the video query to fetch new fields**

In `src/pages/ViralVideoDetail.tsx`, find the data-fetching code for the viral video. Look for `.from("viral_videos").select(...)`. The `select` is likely a comma-separated list of columns. Add the new columns:

```typescript
.select("*, transcript, hook_text, cta_text, framework_meta, transcribed_at")
```

If `*` already covers everything, no change needed (verify with `grep -n 'from("viral_videos")' src/pages/ViralVideoDetail.tsx`).

- [ ] **Step 2: Update the video TypeScript type**

In the same file, find the local TypeScript type/interface for the video record. Add the new fields:

```typescript
// Look for an interface like `interface ViralVideo { ... }` or a Type from a generated supabase types file
// Add these optional fields:
transcript?: string | null;
hook_text?: string | null;
cta_text?: string | null;
framework_meta?: {
  niche_tags?: string[];
  audience?: string;
  key_topics?: string[];
  body_structure?: string;
  content_type?: string | null;
  visual_pacing?: { cuts_per_minute?: number | null; tempo?: string | null };
  visual_style?: string;
} | null;
transcribed_at?: string | null;
```

If the type is auto-generated from Supabase (e.g. uses `Database["public"]["Tables"]["viral_videos"]["Row"]`), the new columns will appear automatically once types are regenerated. Skip this step in that case.

- [ ] **Step 3: Add the Breakdown panel JSX**

Find where the existing video metadata cards are rendered (Step 1 of Task 5 mentions "Card 2: Remix as Script" at line 511 in current file — find a similar boundary). Insert a new card BEFORE the Remix card and AFTER the existing video player + stats. The panel should be conditionally rendered:

```tsx
{video?.transcribed_at && video.framework_meta && (
  <div className="rounded-xl border border-border/40 bg-card p-5">
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-sm font-semibold">Breakdown</h3>
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">AI-analyzed</span>
    </div>

    {/* Top metadata strip */}
    <div className="flex flex-wrap gap-2 mb-4 text-[11px]">
      {video.framework_meta.content_type && (
        <span className="px-2 py-0.5 rounded bg-primary/10 text-primary">
          {video.framework_meta.content_type.replace(/_/g, " ")}
        </span>
      )}
      {video.framework_meta.visual_pacing?.tempo && (
        <span className="px-2 py-0.5 rounded bg-muted text-foreground/80">
          {video.framework_meta.visual_pacing.tempo} pacing
        </span>
      )}
      {(video.framework_meta.niche_tags ?? []).slice(0, 3).map((tag) => (
        <span key={tag} className="px-2 py-0.5 rounded bg-muted text-foreground/80">
          {tag}
        </span>
      ))}
    </div>

    {/* Audience */}
    {video.framework_meta.audience && (
      <div className="mb-3">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Audience</p>
        <p className="text-xs text-foreground">{video.framework_meta.audience}</p>
      </div>
    )}

    {/* Hook / Body / CTA */}
    {video.hook_text && (
      <div className="mb-3">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Hook</p>
        <p className="text-xs text-foreground italic">"{video.hook_text}"</p>
      </div>
    )}
    {video.framework_meta.body_structure && (
      <div className="mb-3">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Body structure</p>
        <p className="text-xs text-foreground">{video.framework_meta.body_structure}</p>
      </div>
    )}
    {video.cta_text && (
      <div className="mb-3">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">CTA</p>
        <p className="text-xs text-foreground italic">"{video.cta_text}"</p>
      </div>
    )}

    {/* Full transcript (collapsed) */}
    {video.transcript && (
      <details className="mt-3">
        <summary className="text-xs cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
          ▼ Full transcript
        </summary>
        <pre className="mt-2 p-3 rounded-lg bg-muted/40 text-[11px] whitespace-pre-wrap font-sans text-foreground/90 max-h-64 overflow-y-auto">
          {video.transcript}
        </pre>
      </details>
    )}
  </div>
)}
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep -E "ViralVideoDetail|error TS" | head -10
```

Expected: no errors related to ViralVideoDetail. If errors, fix them inline (likely TS strict-mode null checks).

- [ ] **Step 5: Manual verification (browser)**

Run `npm run dev` and navigate to a viral video detail page for an analyzed video (find one via SQL first):

```sql
SELECT id FROM viral_videos WHERE transcribed_at IS NOT NULL LIMIT 1;
```

Then visit `http://localhost:<port>/viral-today/video/<id>`.

Expected:
- Video player + stats render unchanged
- A new "Breakdown" panel appears with niche tags, hook, body structure, CTA
- "Full transcript" collapsible expands to show the transcript

Then visit a non-analyzed video. Expected: no Breakdown panel — page looks like before.

- [ ] **Step 6: Commit**

```bash
git add src/pages/ViralVideoDetail.tsx
git commit -m "feat(viral): add Breakdown panel showing transcript + structural metadata"
```

---

## Task 6: Update Remix Flow to Pass Cached Analysis

**Files:**
- Modify: `src/pages/ViralVideoDetail.tsx` (the `handleRemixScript` function at ~line 273)
- Modify: `src/pages/Scripts.tsx` (where `remixVideo` state is consumed)
- Modify: `src/components/canvas/VideoNode.tsx` (skip auto-analysis when pre-filled)

When a user clicks "Remix this video" on an analyzed video, the new canvas videoNode should pre-fill with the cached analysis so it doesn't trigger another transcribe + multimodal call.

- [ ] **Step 1: Pass cached analysis from ViralVideoDetail to Scripts**

In `src/pages/ViralVideoDetail.tsx`, find `handleRemixScript` (around line 273). Update the `remixVideo` payload to include the analysis fields:

Before:
```tsx
state: {
  remixVideo: {
    id: video.id,
    url: video.video_url,
    thumbnail_url: video.thumbnail_url,
    caption: video.caption,
    channel_username: video.channel_username,
    platform: video.platform,
    formatDetection: formatDetection ?? null,
    // ... existing fields
  },
},
```

After:
```tsx
state: {
  remixVideo: {
    id: video.id,
    url: video.video_url,
    thumbnail_url: video.thumbnail_url,
    caption: video.caption,
    channel_username: video.channel_username,
    platform: video.platform,
    formatDetection: formatDetection ?? null,
    // Cached analysis (pass-through if available — videoNode skips re-analysis)
    transcription: video.transcript ?? null,
    hookText: video.hook_text ?? null,
    ctaText: video.cta_text ?? null,
    frameworkMeta: video.framework_meta ?? null,
    isPreAnalyzed: !!video.transcribed_at,
    // ... existing fields you may have
  },
},
```

- [ ] **Step 2: Pass cached analysis from Scripts.tsx into the canvas node**

In `src/pages/Scripts.tsx`, find where `remixVideo` is used to seed a canvas videoNode. Locate where the videoNode `data` payload is constructed (search for `type: "videoNode"`).

Update the `data` to include cached fields when present:

```tsx
{
  id: `videoNode_remix_${Date.now()}`,
  type: "videoNode",
  position: { x: 200, y: 200 },
  width: 240,
  data: {
    url: remixVideo.url,
    caption: remixVideo.caption,
    channel_username: remixVideo.channel_username,
    thumbnailUrl: remixVideo.thumbnail_url,
    // Pre-fill from cached analysis (skips re-transcription + re-analysis)
    ...(remixVideo.isPreAnalyzed ? {
      transcription: remixVideo.transcription ?? undefined,
      // structure rebuilt below from frameworkMeta if present
    } : {}),
    // ... existing canvas-specific fields
  },
}
```

If `remixVideo.frameworkMeta` is present and contains `raw_structure`, also pre-fill `structure`:

```tsx
data: {
  // ... fields above
  ...(remixVideo.isPreAnalyzed && remixVideo.frameworkMeta?.raw_structure ? {
    structure: {
      sections: remixVideo.frameworkMeta.raw_structure,
      detected_format: remixVideo.frameworkMeta.content_type ?? null,
    },
  } : {}),
}
```

The exact insertion point depends on existing code — find the existing call where remixVideo is converted to a videoNode `data` shape (search Scripts.tsx for `remixVideo.url` or `remixVideo.caption`).

- [ ] **Step 3: Update VideoNode to skip auto-analysis when pre-filled**

In `src/components/canvas/VideoNode.tsx`, find the auto-analyze useEffect (around line 858):

```tsx
// Auto-transcribe when node is created with a pre-set URL (from paste handler)
const autoTranscribedRef = useRef(false);
useEffect(() => {
  if (!autoTranscribedRef.current && (d as any).autoTranscribe && urlInput && stage === "idle") {
    autoTranscribedRef.current = true;
    d.onUpdate?.({ autoTranscribe: false });
    setTimeout(() => transcribe(), 80);
  }
// eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

The existing `stage` initialization already short-circuits to `"transcribed"` or `"done"` if `d.transcription` or `d.structure` is pre-set (see line 438-440):

```tsx
const [stage, setStage] = useState<"idle" | "transcribing" | "transcribed" | "analyzing" | "done">(
  d.structure ? "done" : d.transcription ? "transcribed" : "idle"
);
```

So if we pre-fill `transcription` AND `structure`, `stage` starts at `"done"` and the auto-transcribe effect is a no-op (because `stage !== "idle"`). NO code change needed in VideoNode itself — the existing logic handles it.

But verify by reading lines 437-440 to confirm. If those lines no longer match, update the effect's condition to also check `!d.transcription && !d.structure`.

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep -E "Scripts\.tsx|VideoNode|ViralVideoDetail|error TS" | head -10
```

Expected: no errors.

- [ ] **Step 5: Manual verification**

Run `npm run dev`. Navigate to an analyzed viral video (find one via SQL — Task 5 step 5 has the query). Click "Remix Script with AI Wizard".

Expected:
- Canvas opens with a videoNode pre-populated
- The videoNode shows the transcript + visual breakdown immediately (no "Transcribing..." spinner)
- Video playback button still works (uses `data.url`)

Then test with a NON-analyzed video. Expected: existing behavior — videoNode shows "idle" or auto-starts transcription.

- [ ] **Step 6: Commit**

```bash
git add src/pages/ViralVideoDetail.tsx src/pages/Scripts.tsx src/components/canvas/VideoNode.tsx
git commit -m "feat(viral): remix flow uses cached analysis, no re-transcribe on canvas"
```

---

## Task 7: Update search_viral_frameworks to Use New Fields

**Files:**
- Modify: `supabase/functions/companion-chat/build-tool-handlers.ts`

The build flow's framework search now ranks on real structural data and falls back to keyword research when nothing matches.

- [ ] **Step 1: Update the candidate query to include new fields and filter to analyzed-only**

Find `handleSearchViralFrameworks` in `build-tool-handlers.ts`. Find the `query` definition that selects candidates. Replace it with:

```typescript
let query = ctx.adminClient
  .from("viral_videos")
  .select("id, video_url, thumbnail_url, caption, channel_username, views_count, outlier_score, hook_text, cta_text, framework_meta, transcript")
  .not("transcribed_at", "is", null)
  .order("outlier_score", { ascending: false, nullsFirst: false })
  .limit(25);
if (orFilter) query = query.or(orFilter);
const { data: candidates } = await query;
```

The key change: `.not("transcribed_at", "is", null)` filters to analyzed videos only, and the `select` includes the new fields.

- [ ] **Step 2: Update the keyword OR-filter to also search transcripts**

Just below the existing `orFilter` line:

```typescript
const orFilter = input.keywords
  .filter((k) => k.length >= 3)
  .map((k) => `caption.ilike.%${k.replace(/[%,]/g, "")}%`)
  .join(",");
```

Replace it with one that searches both caption and transcript:

```typescript
const orFilter = input.keywords
  .filter((k) => k.length >= 3)
  .flatMap((k) => {
    const safe = k.replace(/[%,]/g, "");
    return [`caption.ilike.%${safe}%`, `transcript.ilike.%${safe}%`];
  })
  .join(",");
```

- [ ] **Step 3: Update the empty-result fallback to suggest keyword research**

Find the existing empty-pool branch:

```typescript
if (pool.length === 0) {
  return `No viral references found for "${input.idea_title}". Suggest the user paste 1-3 Instagram reel URLs and call add_url_to_viral_database for each.`;
}
```

Replace with:

```typescript
if (pool.length === 0) {
  const keywordList = input.keywords.filter((k) => k.length >= 3).join(", ");
  return `No analyzed viral references match "${input.idea_title}" in the database. Best move: ask the user to find references on Instagram or TikTok and paste them.

Suggested keywords for them to search: ${keywordList || input.idea_title}

Tell them:
1. Search those keywords on Instagram (or TikTok)
2. Look for videos with at least 5x the channel's typical view count
3. Paste 1-3 URLs back into this chat
I'll add them to the viral database and use them as the framework.`;
}
```

- [ ] **Step 4: Update the Claude rank prompt to include new structural fields**

Find the part of `handleSearchViralFrameworks` that builds the candidate block (around line 313-318 of current file — search for `candidateBlock` and `caption: ${(v.caption ?? "").slice(0, 200)}`).

Replace with:

```typescript
const candidateBlock = pool
  .map((v, i) => {
    const fm = (v.framework_meta as any) ?? {};
    const niches = Array.isArray(fm.niche_tags) ? fm.niche_tags.join(", ") : "";
    const audience = fm.audience ?? "";
    const contentType = fm.content_type ?? "";
    const tempo = fm.visual_pacing?.tempo ?? "";
    const bodyStructure = fm.body_structure ?? "";
    return `${i + 1}. id=${v.id} | @${v.channel_username ?? "unknown"} | ${v.outlier_score ?? "?"}x
   Niche: ${niches} | Audience: ${audience}
   Type: ${contentType} | Pacing: ${tempo}
   Hook: "${(v.hook_text ?? "").slice(0, 200)}"
   Body: ${bodyStructure}
   CTA: "${(v.cta_text ?? "").slice(0, 120)}"`;
  })
  .join("\n\n");
```

- [ ] **Step 5: Update the rank prompt instructions**

Find the existing `rankPrompt` definition (around line 320-329 — search for `Pick the 3 MOST RELEVANT`). Replace with:

```typescript
const rankPrompt = `Pick the 3 MOST RELEVANT video IDs for a script about this idea.

IDEA: ${input.idea_title}

Match priority (in order):
1. HOOK STRUCTURE — does the candidate's hook open the same way the new script's hook should? (e.g., retrospective story → retrospective story, contrarian statement → contrarian, question → question)
2. NICHE / AUDIENCE — does the niche overlap with the idea's subject?
3. CONTENT TYPE + PACING — talking head / B-roll / tutorial — does the format fit?
4. KEYWORD overlap (already filtered, secondary signal)

Outlier score is a TIEBREAKER, not the main signal. Reject candidates that are off-topic or structurally wrong even if they have huge outliers.

CANDIDATES:
${candidateBlock}

Output ONLY a JSON array of exactly 3 ids: ["uuid1","uuid2","uuid3"]. Nothing else.`;
```

- [ ] **Step 6: Deploy companion-chat**

```bash
npx supabase functions deploy companion-chat --no-verify-jwt
```

Expected: `Deployed Functions on project hxojqrilwhhrvloiwmfo: companion-chat`.

- [ ] **Step 7: Smoke test framework search end-to-end**

Cancel any active build sessions:

```sql
UPDATE companion_build_sessions SET status = 'cancelled' WHERE status IN ('running','paused');
```

Then trigger a build via the test endpoint that already exists (or via the production drawer if available). Use the `test-companion-build` function pattern from earlier sessions if needed:

```bash
ANON_KEY="<anon key>"
USER_ID="<a real user_id who has clients>"
CLIENT_ID="<a real client_id>"

curl -s -X POST "https://hxojqrilwhhrvloiwmfo.supabase.co/functions/v1/test-companion-build" \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"user_id\":\"$USER_ID\",\"client_id\":\"$CLIENT_ID\",\"message\":\"build me a script — give me 5 ideas\"}"
```

(If `test-companion-build` was deleted, recreate the minimal version that wraps `handleBuildTurn` for verification — see prior commits in `git log` for the body.)

Then send: `"1"` (pick idea), and verify the search returns frameworks with hook/body/cta structural data in the LLM's reply.

- [ ] **Step 8: Verify the empty-pool fallback**

Trigger a build with an idea that has no matching analyzed candidates (use a niche very different from existing analyzed videos). The reply should include the keyword-research suggestion text.

- [ ] **Step 9: Commit**

```bash
git add supabase/functions/companion-chat/build-tool-handlers.ts
git commit -m "feat(viral): search_viral_frameworks ranks on hook/niche/pacing, falls back to user keyword research"
```

---

## Task 8: Push and Final Verification

**Files:** None modified.

- [ ] **Step 1: Push all commits**

```bash
git push origin main
```

Expected: `e7ad1f5..XXX  main -> main` or similar.

- [ ] **Step 2: Wait for GitHub Actions frontend deploy** (~6-8 minutes)

Monitor at https://github.com/connectacreators/connectacreators/actions if needed.

- [ ] **Step 3: End-to-end manual test (browser)**

After frontend deploy completes:

1. Hard-refresh `connectacreators.com/ai`
2. Navigate to `/viral-today/video/<analyzed-id>` — confirm Breakdown panel renders
3. Click "Remix Script with AI Wizard" — confirm canvas videoNode pre-loads with transcript + structure (no spinner)
4. Open a client page and the drawer
5. Type "build me a script — give me 5 ideas"
6. Pick an idea
7. Verify the framework search returns relevant results with hook/body/cta breakdown text in the LLM's reply
8. Try an idea that won't match — verify the keyword-research suggestion appears

- [ ] **Step 4: Check edge function logs for any errors**

Use `mcp__plugin_supabase_supabase__get_logs` with `service: "edge-function"`. Scan for any 500s or repeated errors from `analyze-viral-video`, `companion-chat`, or scrape functions.

If errors are found, address them in a follow-up commit.

---

## Self-Review

**1. Spec coverage:**
- ✅ Threshold filter: Task 2 step 3 enforces `>= 5` outlier and `>= 500_000` views
- ✅ Migration columns: Task 1
- ✅ analyze-viral-video orchestrator: Task 2
- ✅ Idempotency: Task 2 step 6 verifies it
- ✅ Backfill: Task 3
- ✅ Going-forward (scrape integration): Task 4
- ✅ Detail-page Breakdown panel: Task 5
- ✅ Remix flow uses cached analysis: Task 6
- ✅ Search ranks on new fields: Task 7 steps 1-5
- ✅ Empty-pool keyword research fallback: Task 7 step 3
- ✅ Search prioritizes hook structure → niche → type → keywords: Task 7 step 5

**2. Placeholder scan:** Reviewed each step. All code blocks are concrete. The Task 4 step 1 grep finds files dynamically (which is correct — we don't know which scrape file is the inserter without checking). Task 6 step 2 says "find existing call" which is unavoidable since the existing code structure isn't fully known; the change pattern is concrete.

**3. Type consistency:**
- `framework_meta` shape consistent across Task 1 (jsonb), Task 2 (object with fields), Task 5 (TypeScript type), Task 7 (read access).
- Field names: `niche_tags`, `audience`, `key_topics`, `body_structure`, `content_type`, `visual_pacing` — consistent everywhere.
- `transcribed_at` used as the analyzed-or-not sentinel everywhere.
- `hook_text` and `cta_text` (snake_case in DB) consistent.

Plan is complete.
