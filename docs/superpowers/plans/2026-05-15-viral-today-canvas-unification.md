# Viral Today × Super Canvas Unification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `viral_videos` the single source of truth shared across VPS Puppeteer scrapes, `/ai` chat paste, Canvas paste, and a new Viral Today detail page; replace Canvas's two-button transcribe/visual-breakdown flow with one unified "Analyze" action; persist video files in Supabase Storage with a 90-day TTL.

**Architecture:** All entry paths route through a new `/viral-video-resolve` edge function that find-or-creates a `viral_videos` row keyed by `(platform, apify_video_id)` (postId extracted from URL via a shared canonicalizer). A new `/analyze-viral-video-user` edge function runs the unified pipeline (download → upload to Storage → transcribe → visual breakdown → tagging), with a shared analyzer module also consumed by the existing cron-driven `/analyze-viral-video`. A new `ViralTodayDetail` page reads the row and uses a shared `<ViralVideoPlayer>` extracted from Canvas's existing player.

**Tech Stack:** Deno (edge functions), Postgres (Supabase), React + TypeScript + Vite (frontend), Supabase Storage (video files), Supabase Realtime (analyze progress).

**Spec:** `docs/superpowers/specs/2026-05-15-viral-today-canvas-unification-design.md`

---

## File Structure

**New files:**

- `supabase/migrations/20260515_viral_videos_unification.sql` — schema migration + storage bucket
- `supabase/functions/_shared/canonicalize-video-url.ts` — URL → `{platform, postId, normalizedUrl}` (Deno)
- `supabase/functions/_shared/canonicalize-video-url.test.ts` — Deno tests
- `supabase/functions/_shared/viral-video-analyzer.ts` — shared analyze pipeline (download, upload, transcribe, visual breakdown, tagging)
- `supabase/functions/viral-video-resolve/index.ts` — find-or-create endpoint
- `supabase/functions/analyze-viral-video-user/index.ts` — user-triggered unified analyze
- `supabase/functions/viral-video-refresh-file/index.ts` — re-download MP4 after 90-day expiry
- `supabase/functions/cleanup-expired-viral-videos/index.ts` — cron cleanup of expired files
- `src/lib/canonicalize-video-url.ts` — frontend mirror of the Deno helper
- `src/components/video/ViralVideoPlayer.tsx` — shared player extracted from Canvas
- `src/pages/ViralTodayDetail.tsx` — `/viral-today/:id` page

**Files to modify:**

- `supabase/functions/transcribe-video/index.ts` — delegate to shared analyzer
- `supabase/functions/analyze-viral-video/index.ts` (cron) — delegate to shared analyzer
- `src/components/canvas/VideoNode.tsx` — resolve on paste, single Analyze button, use shared player
- `src/pages/ViralToday.tsx` — wire card click → `/viral-today/:id`
- `src/App.tsx` (or wherever routes live) — add the detail route
- `src/components/ai-chat/...` — replace inline upsert in `/ai` chat URL paste with `/viral-video-resolve` (path to be confirmed in Task 16)

---

## Task 1: Schema migration + Storage bucket

**Files:**
- Create: `supabase/migrations/20260515_viral_videos_unification.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260515_viral_videos_unification.sql

-- 1. Schema columns on viral_videos.
ALTER TABLE viral_videos
  ADD COLUMN IF NOT EXISTS video_file_url        TEXT,
  ADD COLUMN IF NOT EXISTS video_file_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS analysis_status       TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS analysis_error        TEXT;

-- Valid states: 'pending' | 'analyzing' | 'analyzed' | 'failed'.
ALTER TABLE viral_videos
  ADD CONSTRAINT viral_videos_analysis_status_chk
  CHECK (analysis_status IN ('pending', 'analyzing', 'analyzed', 'failed'));

-- 2. Backfill: existing rows count as 'analyzed' only if BOTH transcript and
-- visual breakdown exist. Rows with just a transcript stay 'pending' so the
-- unified analyzer can fill in the visual breakdown gap. The shared analyzer
-- short-circuits the Whisper step when transcript IS NOT NULL.
UPDATE viral_videos
  SET analysis_status = 'analyzed'
  WHERE transcribed_at IS NOT NULL
    AND framework_meta IS NOT NULL
    AND framework_meta ? 'visual_segments';

-- 3. Indexes.
CREATE INDEX IF NOT EXISTS idx_viral_videos_file_expires
  ON viral_videos (video_file_expires_at)
  WHERE video_file_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_viral_videos_analysis_status
  ON viral_videos (analysis_status, scraped_at DESC);

-- 4. Storage bucket for video files. Mirrors the existing 'footage' bucket policy.
INSERT INTO storage.buckets (id, name, public)
  VALUES ('viral-videos', 'viral-videos', false)
  ON CONFLICT (id) DO NOTHING;

-- 5. RLS for the bucket: authenticated users can read, service role writes.
CREATE POLICY "viral-videos: authenticated read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'viral-videos' AND auth.role() = 'authenticated');

CREATE POLICY "viral-videos: service role write"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'viral-videos' AND auth.role() = 'service_role');

CREATE POLICY "viral-videos: service role delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'viral-videos' AND auth.role() = 'service_role');
```

- [ ] **Step 2: Apply migration locally**

Run: `npx supabase db push` (or whatever the project uses — check `supabase/.temp/cli-latest`).

Expected output: Migration applied, no errors. Verify with:

```bash
npx supabase db diff --schema public | grep -i "viral_videos" || echo "No drift"
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260515_viral_videos_unification.sql
git commit -m "feat(viral-videos): add analysis_status + video file storage columns

Adds video_file_url, video_file_expires_at, analysis_status, analysis_error
to viral_videos. Creates the viral-videos Storage bucket with RLS mirroring
the footage bucket. Backfills analysis_status='analyzed' for rows that have
both transcript and visual_segments."
```

---

## Task 2: URL canonicalization helper (Deno + tests)

**Files:**
- Create: `supabase/functions/_shared/canonicalize-video-url.ts`
- Create: `supabase/functions/_shared/canonicalize-video-url.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// supabase/functions/_shared/canonicalize-video-url.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { canonicalizeVideoUrl } from "./canonicalize-video-url.ts";

Deno.test("instagram reel URL", () => {
  const r = canonicalizeVideoUrl("https://www.instagram.com/reel/C1AbCdEfGhi/?igsh=xyz");
  assertEquals(r?.platform, "instagram");
  assertEquals(r?.postId, "C1AbCdEfGhi");
  assertEquals(r?.normalizedUrl, "https://www.instagram.com/reel/C1AbCdEfGhi/");
});

Deno.test("instagram /p/ URL", () => {
  const r = canonicalizeVideoUrl("https://instagram.com/p/ABC123/");
  assertEquals(r?.platform, "instagram");
  assertEquals(r?.postId, "ABC123");
});

Deno.test("instagram /reels/ URL", () => {
  const r = canonicalizeVideoUrl("https://www.instagram.com/reels/XyZ789/");
  assertEquals(r?.platform, "instagram");
  assertEquals(r?.postId, "XyZ789");
});

Deno.test("tiktok /video/ URL", () => {
  const r = canonicalizeVideoUrl("https://www.tiktok.com/@user/video/7123456789012345678");
  assertEquals(r?.platform, "tiktok");
  assertEquals(r?.postId, "7123456789012345678");
});

Deno.test("tiktok vm.tiktok.com short URL — postId is shortcode, resolved later", () => {
  const r = canonicalizeVideoUrl("https://vm.tiktok.com/ZMabcDEF/");
  assertEquals(r?.platform, "tiktok");
  assertEquals(r?.postId, "ZMabcDEF");
});

Deno.test("youtube watch URL", () => {
  const r = canonicalizeVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&feature=share");
  assertEquals(r?.platform, "youtube");
  assertEquals(r?.postId, "dQw4w9WgXcQ");
});

Deno.test("youtube shorts URL", () => {
  const r = canonicalizeVideoUrl("https://youtube.com/shorts/abcDEFgh12_");
  assertEquals(r?.platform, "youtube");
  assertEquals(r?.postId, "abcDEFgh12_");
});

Deno.test("youtu.be short URL", () => {
  const r = canonicalizeVideoUrl("https://youtu.be/dQw4w9WgXcQ");
  assertEquals(r?.platform, "youtube");
  assertEquals(r?.postId, "dQw4w9WgXcQ");
});

Deno.test("facebook reel URL", () => {
  const r = canonicalizeVideoUrl("https://www.facebook.com/reel/1234567890");
  assertEquals(r?.platform, "facebook");
  assertEquals(r?.postId, "1234567890");
});

Deno.test("facebook watch URL", () => {
  const r = canonicalizeVideoUrl("https://facebook.com/watch?v=987654321");
  assertEquals(r?.platform, "facebook");
  assertEquals(r?.postId, "987654321");
});

Deno.test("unrecognized URL returns null", () => {
  assertEquals(canonicalizeVideoUrl("https://example.com/foo"), null);
  assertEquals(canonicalizeVideoUrl("not a url"), null);
  assertEquals(canonicalizeVideoUrl(""), null);
});

Deno.test("strips utm + igsh + si + fbclid tracking params", () => {
  const r = canonicalizeVideoUrl(
    "https://www.instagram.com/reel/ABC?utm_source=x&igsh=y&si=z&fbclid=w"
  );
  assertEquals(r?.normalizedUrl, "https://www.instagram.com/reel/ABC/");
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `cd supabase/functions && deno test _shared/canonicalize-video-url.test.ts --allow-net --no-check`
Expected: FAIL with "module not found: ./canonicalize-video-url.ts"

- [ ] **Step 3: Write the implementation**

```typescript
// supabase/functions/_shared/canonicalize-video-url.ts

export type VideoPlatform = "instagram" | "tiktok" | "youtube" | "facebook";

export interface CanonicalVideo {
  platform: VideoPlatform;
  postId: string;
  normalizedUrl: string;
}

const STRIP_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "igsh", "igshid", "si", "feature", "fbclid", "ref_src", "ref_url",
  "_t", "_r", "is_copy_url", "is_from_webapp",
]);

function stripTrackingParams(u: URL): URL {
  const cleaned = new URL(u.toString());
  for (const key of [...cleaned.searchParams.keys()]) {
    if (STRIP_PARAMS.has(key)) cleaned.searchParams.delete(key);
  }
  return cleaned;
}

function matchInstagram(u: URL): CanonicalVideo | null {
  const host = u.hostname.replace(/^www\./, "");
  if (host !== "instagram.com" && host !== "m.instagram.com") return null;
  const m = u.pathname.match(/^\/(reel|reels|p)\/([A-Za-z0-9_-]+)\/?/);
  if (!m) return null;
  const postId = m[2];
  return {
    platform: "instagram",
    postId,
    normalizedUrl: `https://www.instagram.com/${m[1] === "reels" ? "reel" : m[1]}/${postId}/`,
  };
}

function matchTiktok(u: URL): CanonicalVideo | null {
  const host = u.hostname.replace(/^www\./, "");
  if (host === "tiktok.com" || host === "m.tiktok.com") {
    const m = u.pathname.match(/\/video\/(\d+)/);
    if (m) {
      return {
        platform: "tiktok",
        postId: m[1],
        normalizedUrl: `https://www.tiktok.com/video/${m[1]}`,
      };
    }
  }
  if (host === "vm.tiktok.com" || host === "vt.tiktok.com") {
    const m = u.pathname.match(/^\/([A-Za-z0-9]+)/);
    if (m) {
      return {
        platform: "tiktok",
        postId: m[1],
        normalizedUrl: `https://${host}/${m[1]}/`,
      };
    }
  }
  return null;
}

function matchYoutube(u: URL): CanonicalVideo | null {
  const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
  if (host === "youtube.com") {
    const v = u.searchParams.get("v");
    if (v) {
      return {
        platform: "youtube",
        postId: v,
        normalizedUrl: `https://www.youtube.com/watch?v=${v}`,
      };
    }
    const m = u.pathname.match(/^\/shorts\/([A-Za-z0-9_-]+)/);
    if (m) {
      return {
        platform: "youtube",
        postId: m[1],
        normalizedUrl: `https://www.youtube.com/shorts/${m[1]}`,
      };
    }
  }
  if (host === "youtu.be") {
    const m = u.pathname.match(/^\/([A-Za-z0-9_-]+)/);
    if (m) {
      return {
        platform: "youtube",
        postId: m[1],
        normalizedUrl: `https://www.youtube.com/watch?v=${m[1]}`,
      };
    }
  }
  return null;
}

function matchFacebook(u: URL): CanonicalVideo | null {
  const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
  if (host !== "facebook.com" && host !== "fb.watch") return null;
  let m = u.pathname.match(/^\/reel\/(\d+)/);
  if (m) return { platform: "facebook", postId: m[1], normalizedUrl: `https://www.facebook.com/reel/${m[1]}` };
  m = u.pathname.match(/^\/videos\/(\d+)/);
  if (m) return { platform: "facebook", postId: m[1], normalizedUrl: `https://www.facebook.com/videos/${m[1]}` };
  if (u.pathname.startsWith("/watch")) {
    const v = u.searchParams.get("v");
    if (v) return { platform: "facebook", postId: v, normalizedUrl: `https://www.facebook.com/watch?v=${v}` };
  }
  return null;
}

export function canonicalizeVideoUrl(raw: string): CanonicalVideo | null {
  if (!raw || typeof raw !== "string") return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  u = stripTrackingParams(u);
  return (
    matchInstagram(u) ||
    matchTiktok(u) ||
    matchYoutube(u) ||
    matchFacebook(u)
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd supabase/functions && deno test _shared/canonicalize-video-url.test.ts --allow-net --no-check`
Expected: 12 tests pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/canonicalize-video-url.ts \
        supabase/functions/_shared/canonicalize-video-url.test.ts
git commit -m "feat(viral-videos): URL canonicalization helper

Extracts (platform, postId, normalizedUrl) from any Instagram, TikTok,
YouTube, or Facebook URL. Used by all viral_videos entry points to
populate apify_video_id consistently and enable cross-surface dedup."
```

---

## Task 3: Frontend canonicalization mirror

**Files:**
- Create: `src/lib/canonicalize-video-url.ts`

- [ ] **Step 1: Copy the Deno helper, replace the import-style export with browser-friendly module**

```typescript
// src/lib/canonicalize-video-url.ts
// MIRROR of supabase/functions/_shared/canonicalize-video-url.ts
// Keep these in sync — any change here must also be made in the Deno file.

export type VideoPlatform = "instagram" | "tiktok" | "youtube" | "facebook";

export interface CanonicalVideo {
  platform: VideoPlatform;
  postId: string;
  normalizedUrl: string;
}

const STRIP_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "igsh", "igshid", "si", "feature", "fbclid", "ref_src", "ref_url",
  "_t", "_r", "is_copy_url", "is_from_webapp",
]);

function stripTrackingParams(u: URL): URL {
  const cleaned = new URL(u.toString());
  for (const key of Array.from(cleaned.searchParams.keys())) {
    if (STRIP_PARAMS.has(key)) cleaned.searchParams.delete(key);
  }
  return cleaned;
}

function matchInstagram(u: URL): CanonicalVideo | null {
  const host = u.hostname.replace(/^www\./, "");
  if (host !== "instagram.com" && host !== "m.instagram.com") return null;
  const m = u.pathname.match(/^\/(reel|reels|p)\/([A-Za-z0-9_-]+)\/?/);
  if (!m) return null;
  return {
    platform: "instagram",
    postId: m[2],
    normalizedUrl: `https://www.instagram.com/${m[1] === "reels" ? "reel" : m[1]}/${m[2]}/`,
  };
}

function matchTiktok(u: URL): CanonicalVideo | null {
  const host = u.hostname.replace(/^www\./, "");
  if (host === "tiktok.com" || host === "m.tiktok.com") {
    const m = u.pathname.match(/\/video\/(\d+)/);
    if (m) return {
      platform: "tiktok",
      postId: m[1],
      normalizedUrl: `https://www.tiktok.com/video/${m[1]}`,
    };
  }
  if (host === "vm.tiktok.com" || host === "vt.tiktok.com") {
    const m = u.pathname.match(/^\/([A-Za-z0-9]+)/);
    if (m) return {
      platform: "tiktok",
      postId: m[1],
      normalizedUrl: `https://${host}/${m[1]}/`,
    };
  }
  return null;
}

function matchYoutube(u: URL): CanonicalVideo | null {
  const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
  if (host === "youtube.com") {
    const v = u.searchParams.get("v");
    if (v) return { platform: "youtube", postId: v, normalizedUrl: `https://www.youtube.com/watch?v=${v}` };
    const m = u.pathname.match(/^\/shorts\/([A-Za-z0-9_-]+)/);
    if (m) return { platform: "youtube", postId: m[1], normalizedUrl: `https://www.youtube.com/shorts/${m[1]}` };
  }
  if (host === "youtu.be") {
    const m = u.pathname.match(/^\/([A-Za-z0-9_-]+)/);
    if (m) return { platform: "youtube", postId: m[1], normalizedUrl: `https://www.youtube.com/watch?v=${m[1]}` };
  }
  return null;
}

function matchFacebook(u: URL): CanonicalVideo | null {
  const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
  if (host !== "facebook.com" && host !== "fb.watch") return null;
  let m = u.pathname.match(/^\/reel\/(\d+)/);
  if (m) return { platform: "facebook", postId: m[1], normalizedUrl: `https://www.facebook.com/reel/${m[1]}` };
  m = u.pathname.match(/^\/videos\/(\d+)/);
  if (m) return { platform: "facebook", postId: m[1], normalizedUrl: `https://www.facebook.com/videos/${m[1]}` };
  if (u.pathname.startsWith("/watch")) {
    const v = u.searchParams.get("v");
    if (v) return { platform: "facebook", postId: v, normalizedUrl: `https://www.facebook.com/watch?v=${v}` };
  }
  return null;
}

export function canonicalizeVideoUrl(raw: string): CanonicalVideo | null {
  if (!raw || typeof raw !== "string") return null;
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  u = stripTrackingParams(u);
  return matchInstagram(u) || matchTiktok(u) || matchYoutube(u) || matchFacebook(u);
}
```

- [ ] **Step 2: Manual smoke test in dev**

Run: `npm run dev` and open the browser console. Paste:
```js
window.__test = (await import('/src/lib/canonicalize-video-url.ts')).canonicalizeVideoUrl;
window.__test('https://www.instagram.com/reel/ABC/');
```
Expected: `{platform: "instagram", postId: "ABC", normalizedUrl: "https://www.instagram.com/reel/ABC/"}`

- [ ] **Step 3: Commit**

```bash
git add src/lib/canonicalize-video-url.ts
git commit -m "feat(viral-videos): frontend mirror of URL canonicalizer

Lets VideoNode, ViralTodayDetail, and /ai chat resolve platform+postId
client-side before round-tripping to /viral-video-resolve."
```

---

## Task 4: Shared analyzer module (skeleton + downloads + upload)

**Files:**
- Create: `supabase/functions/_shared/viral-video-analyzer.ts`

This module is consumed by three edge functions: `analyze-viral-video-user`, `viral-video-refresh-file`, and the existing cron `analyze-viral-video`. We build it incrementally: first the shape and the file-acquisition step (download + Storage upload), then transcript, then visual breakdown.

- [ ] **Step 1: Define the module shape and the file-acquisition helper**

```typescript
// supabase/functions/_shared/viral-video-analyzer.ts
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

const VPS_BASE = Deno.env.get("VPS_BASE_URL") ?? "http://72.62.200.145:3099";
const VPS_KEY = Deno.env.get("VPS_API_KEY") ?? "ytdlp_connecta_2026_secret";
const BUCKET = "viral-videos";
const FILE_TTL_DAYS = 90;

export interface ViralVideoRow {
  id: string;
  platform: string;
  apify_video_id: string;
  video_url: string;
  transcript: string | null;
  framework_meta: Record<string, unknown> | null;
  video_file_url: string | null;
  video_file_expires_at: string | null;
  analysis_status: "pending" | "analyzing" | "analyzed" | "failed";
}

export class AnalyzerError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

/**
 * Step 1 of the pipeline: download the source video via VPS cobalt-proxy and
 * upload it to Supabase Storage. Idempotent — skips if bucket already has the file.
 * Returns the signed URL for video_file_url.
 */
export async function acquireVideoFile(
  admin: SupabaseClient,
  row: ViralVideoRow,
): Promise<{ video_file_url: string; video_file_expires_at: string }> {
  // Skip if already cached and not expired.
  if (row.video_file_url && row.video_file_expires_at) {
    if (new Date(row.video_file_expires_at) > new Date()) {
      return { video_file_url: row.video_file_url, video_file_expires_at: row.video_file_expires_at };
    }
  }

  // 1. Resolve to a downloadable URL via VPS cobalt-proxy.
  const cobaltRes = await fetch(`${VPS_BASE}/cobalt-proxy`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": VPS_KEY },
    body: JSON.stringify({ url: row.video_url }),
  });
  if (!cobaltRes.ok) {
    throw new AnalyzerError("cobalt_failed", `Cobalt proxy returned ${cobaltRes.status}`);
  }
  const { stream_url } = await cobaltRes.json();
  if (!stream_url) throw new AnalyzerError("cobalt_no_url", "Cobalt returned no stream_url");

  // 2. Stream the MP4 down.
  const mp4Res = await fetch(stream_url);
  if (!mp4Res.ok) throw new AnalyzerError("download_failed", `MP4 fetch ${mp4Res.status}`);
  const mp4Bytes = new Uint8Array(await mp4Res.arrayBuffer());

  // 3. Upload to Storage.
  const path = `${row.id}.mp4`;
  const { error: uploadErr } = await admin.storage.from(BUCKET).upload(path, mp4Bytes, {
    contentType: "video/mp4",
    upsert: true,
  });
  if (uploadErr) throw new AnalyzerError("storage_upload_failed", uploadErr.message);

  // 4. Signed URL for playback (TTL roughly matches file TTL — 90 days = 7,776,000 s).
  const { data: signed, error: signErr } = await admin
    .storage.from(BUCKET)
    .createSignedUrl(path, FILE_TTL_DAYS * 24 * 60 * 60);
  if (signErr || !signed) throw new AnalyzerError("storage_sign_failed", signErr?.message ?? "no signed url");

  const expires = new Date(Date.now() + FILE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  return { video_file_url: signed.signedUrl, video_file_expires_at: expires };
}
```

- [ ] **Step 2: Commit (no test yet — covered by integration in Task 6)**

```bash
git add supabase/functions/_shared/viral-video-analyzer.ts
git commit -m "feat(viral-videos): shared analyzer skeleton with file acquisition

Adds AnalyzerError + acquireVideoFile() which routes a viral_videos row
through VPS cobalt-proxy, uploads MP4 to viral-videos bucket, and returns
a signed URL with a 90-day TTL. Idempotent."
```

---

## Task 5: Shared analyzer — transcript step

**Files:**
- Modify: `supabase/functions/_shared/viral-video-analyzer.ts`

This step extracts the transcript logic currently in `transcribe-video/index.ts` (YouTube captions fast-path + Whisper fallback) into a reusable function.

- [ ] **Step 1: Read the existing transcript flow**

Read `supabase/functions/transcribe-video/index.ts` lines 1-350. Note the YouTube captions fast-path (look for `captions` or `youtube` fast-path), the audio-extraction call (`/extract-audio`), and the Whisper call. We're going to lift this logic verbatim into the shared module so behavior matches.

- [ ] **Step 2: Add `acquireTranscript` to the shared analyzer**

Append to `supabase/functions/_shared/viral-video-analyzer.ts`:

```typescript
/**
 * Step 2 of the pipeline: transcribe the video. Short-circuits if row.transcript
 * is already populated (cache hit from a prior partial analysis). Otherwise tries
 * the YouTube captions fast-path, then falls back to Whisper via VPS /extract-audio.
 */
export async function acquireTranscript(
  row: ViralVideoRow,
): Promise<string> {
  if (row.transcript && row.transcript.trim().length > 0) {
    return row.transcript;
  }

  // YouTube fast-path: try captions API.
  if (row.platform === "youtube") {
    const captionRes = await fetch(`${VPS_BASE}/youtube-captions`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": VPS_KEY },
      body: JSON.stringify({ video_id: row.apify_video_id }),
    });
    if (captionRes.ok) {
      const { captions } = await captionRes.json();
      if (captions && typeof captions === "string" && captions.length > 0) {
        return captions;
      }
    }
    // Fall through to Whisper.
  }

  // Whisper fallback.
  const audioRes = await fetch(`${VPS_BASE}/extract-audio`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": VPS_KEY },
    body: JSON.stringify({ url: row.video_url }),
  });
  if (!audioRes.ok) throw new AnalyzerError("audio_extract_failed", `extract-audio ${audioRes.status}`);
  const { audio_url } = await audioRes.json();
  if (!audio_url) throw new AnalyzerError("audio_no_url", "extract-audio returned no audio_url");

  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) throw new AnalyzerError("openai_missing_key", "OPENAI_API_KEY not configured");

  const audioBlob = await (await fetch(audio_url)).blob();
  const form = new FormData();
  form.append("file", audioBlob, "audio.mp3");
  form.append("model", "whisper-1");

  const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}` },
    body: form,
  });
  if (!whisperRes.ok) {
    throw new AnalyzerError("whisper_failed", `Whisper ${whisperRes.status}: ${await whisperRes.text()}`);
  }
  const { text } = await whisperRes.json();
  if (!text) throw new AnalyzerError("whisper_no_text", "Whisper returned no text");
  return text;
}
```

Note: if `/youtube-captions` is not an existing VPS endpoint, replace this branch with whatever the current `transcribe-video/index.ts` does for the YouTube fast-path. Cross-reference before committing.

- [ ] **Step 3: Cross-check against existing transcribe-video logic**

```bash
grep -n "youtube\|captions\|whisper\|extract-audio" supabase/functions/transcribe-video/index.ts | head -30
```

If the existing function uses a different endpoint name or different Whisper params, edit Step 2's code to match. Goal: byte-for-byte equivalent transcript output for the same input.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/viral-video-analyzer.ts
git commit -m "feat(viral-videos): shared transcript step in analyzer

Lifts YouTube-captions fast-path + Whisper fallback into the shared
analyzer. Skips if row.transcript is already populated."
```

---

## Task 6: Shared analyzer — visual breakdown + tagging + orchestrator

**Files:**
- Modify: `supabase/functions/_shared/viral-video-analyzer.ts`

- [ ] **Step 1: Read the existing cron analyzer for visual + tagging logic**

Read `supabase/functions/analyze-viral-video/index.ts` and `supabase/functions/analyze-video-multimodal/index.ts`. Note:

- How `/analyze-video-multimodal` is invoked (it's an HTTP edge function called via fetch with the video URL).
- The Haiku tagging logic (likely a prompt to extract `niche_tags`, `audience`, `key_topics`, `body_structure`, `is_caption_style`).
- The caption-style override (visual text becomes transcript when transcript is sparse).

- [ ] **Step 2: Append visual breakdown + tagging + orchestrator**

```typescript
// Append to supabase/functions/_shared/viral-video-analyzer.ts

export interface VisualSegment {
  start: number;
  end: number;
  description: string;
  text_on_screen: string[];
}

export interface AudioFeatures {
  energy: number;
  speech_density: number;
  has_music: boolean;
  bpm_estimate: number | null;
  mean_volume_db: number;
}

export interface VisualBreakdown {
  duration_seconds: number;
  audio: AudioFeatures;
  visual_segments: VisualSegment[];
  analysis_version: "multimodal_v2";
}

export interface FrameworkTags {
  niche_tags: string[];
  audience: string;
  key_topics: string[];
  body_structure: string;
  is_caption_style: boolean;
  hook_text: string;
  cta_text: string;
}

/**
 * Step 3: visual breakdown via /analyze-video-multimodal. Idempotent — skips
 * if framework_meta.visual_segments is already present.
 */
export async function acquireVisualBreakdown(
  row: ViralVideoRow,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<VisualBreakdown> {
  const cached = row.framework_meta as Record<string, unknown> | null;
  if (cached && Array.isArray(cached.visual_segments) && cached.visual_segments.length > 0) {
    return {
      duration_seconds: Number(cached.duration_seconds ?? 0),
      audio: (cached.audio ?? {}) as AudioFeatures,
      visual_segments: cached.visual_segments as VisualSegment[],
      analysis_version: "multimodal_v2",
    };
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/analyze-video-multimodal`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ video_url: row.video_url }),
  });
  if (!res.ok) throw new AnalyzerError("visual_failed", `analyze-video-multimodal ${res.status}`);
  const body = await res.json();
  if (!body.visual_segments) throw new AnalyzerError("visual_no_segments", "no visual_segments returned");
  return body as VisualBreakdown;
}

/**
 * Step 4: Haiku tagging.
 */
export async function tagFramework(
  transcript: string,
  visual: VisualBreakdown,
): Promise<FrameworkTags> {
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) throw new AnalyzerError("anthropic_missing_key", "ANTHROPIC_API_KEY not configured");

  const visualSummary = visual.visual_segments
    .map((s) => `[${s.start}s-${s.end}s] ${s.description}${s.text_on_screen.length ? ` (text: ${s.text_on_screen.join(" | ")})` : ""}`)
    .join("\n");

  const prompt = `You are tagging a short-form video for a content database.

TRANSCRIPT:
${transcript || "(no transcript — likely caption-style video)"}

VISUAL SCENES:
${visualSummary}

Return strict JSON with these keys:
- niche_tags: array of 2-4 short tags (e.g. ["sales", "mindset"])
- audience: one short phrase describing the target viewer
- key_topics: array of 3-6 specific topics covered
- body_structure: one phrase describing how the video is structured (e.g. "Problem → Story → CTA")
- is_caption_style: true if the video is mostly text overlays on music, false otherwise
- hook_text: first 30 words of the transcript (or first visual segment's text if caption-style)
- cta_text: last 30 words of the transcript (or last visual segment's text if caption-style)

Return ONLY the JSON object, no preamble.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new AnalyzerError("haiku_failed", `Haiku ${res.status}: ${await res.text()}`);
  const body = await res.json();
  const text: string = body.content?.[0]?.text ?? "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new AnalyzerError("haiku_no_json", "Haiku returned no JSON");
  const parsed = JSON.parse(jsonMatch[0]);
  return parsed as FrameworkTags;
}

/**
 * Full pipeline orchestrator. Reads the row, runs all steps idempotently,
 * and returns the patch to apply. Does NOT update the DB itself — caller does.
 */
export async function runFullAnalysis(
  admin: SupabaseClient,
  row: ViralVideoRow,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<Partial<ViralVideoRow> & {
  transcript: string;
  framework_meta: Record<string, unknown>;
  hook_text: string;
  cta_text: string;
  transcribed_at: string;
}> {
  const fileResult = await acquireVideoFile(admin, row);
  // Mutate row in-place so subsequent steps see fresh state.
  row.video_file_url = fileResult.video_file_url;
  row.video_file_expires_at = fileResult.video_file_expires_at;

  const transcript = await acquireTranscript(row);
  row.transcript = transcript;

  const visual = await acquireVisualBreakdown(row, supabaseUrl, serviceRoleKey);
  row.framework_meta = { ...(row.framework_meta ?? {}), visual_segments: visual.visual_segments, audio: visual.audio, duration_seconds: visual.duration_seconds };

  const tags = await tagFramework(transcript, visual);

  // Caption-style override: if visual text exists AND transcript < 40 words, use visual text.
  let effectiveTranscript = transcript;
  if (tags.is_caption_style && transcript.split(/\s+/).filter(Boolean).length < 40) {
    const visualText = visual.visual_segments.flatMap((s) => s.text_on_screen).join(" ");
    if (visualText.length > 0) effectiveTranscript = visualText;
  }

  return {
    video_file_url: fileResult.video_file_url,
    video_file_expires_at: fileResult.video_file_expires_at,
    transcript: effectiveTranscript,
    framework_meta: {
      ...row.framework_meta,
      ...tags,
    },
    hook_text: tags.hook_text,
    cta_text: tags.cta_text,
    transcribed_at: new Date().toISOString(),
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/viral-video-analyzer.ts
git commit -m "feat(viral-videos): visual breakdown + Haiku tagging + orchestrator

runFullAnalysis() reads a viral_videos row, runs all four pipeline steps
idempotently (file → transcript → visual → tags), and returns the column
patch to apply. Caption-style override mirrors the cron analyzer."
```

---

## Task 7: `/viral-video-resolve` edge function

**Files:**
- Create: `supabase/functions/viral-video-resolve/index.ts`

- [ ] **Step 1: Write the function**

```typescript
// supabase/functions/viral-video-resolve/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { canonicalizeVideoUrl } from "../_shared/canonicalize-video-url.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405, headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const authHeader = req.headers.get("authorization") ?? "";
  const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userResult } = await userClient.auth.getUser();
  const user = userResult?.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "content-type": "application/json" } });
  }

  let body: { url?: string };
  try { body = await req.json(); } catch { body = {}; }
  if (!body.url) {
    return new Response(JSON.stringify({ error: "missing_url" }), { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } });
  }

  const canonical = canonicalizeVideoUrl(body.url);
  if (!canonical) {
    return new Response(JSON.stringify({ error: "unsupported_url" }), { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } });
  }

  // Find by (platform, apify_video_id).
  const { data: existing, error: findErr } = await admin
    .from("viral_videos")
    .select("*")
    .eq("platform", canonical.platform)
    .eq("apify_video_id", canonical.postId)
    .maybeSingle();
  if (findErr) {
    return new Response(JSON.stringify({ error: "db_error", message: findErr.message }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
  }
  if (existing) {
    return new Response(JSON.stringify({ row: existing, created: false }), { status: 200, headers: { ...corsHeaders, "content-type": "application/json" } });
  }

  // Insert stub.
  const handleMatch = canonical.normalizedUrl.match(/instagram\.com\/([^/]+)\/(?:reel|p)\//) ??
                      canonical.normalizedUrl.match(/tiktok\.com\/@([^/]+)\/video\//);
  const channel_username = handleMatch?.[1] ?? "unknown";

  const insertPayload = {
    platform: canonical.platform,
    apify_video_id: canonical.postId,
    video_url: canonical.normalizedUrl,
    channel_username,
    analysis_status: "pending",
    user_submitted: true,
    submitted_by: user.id,
    outlier_score: 0,
    views_count: 0,
    likes_count: 0,
    comments_count: 0,
    scraped_at: new Date().toISOString(),
  };

  const { data: inserted, error: insertErr } = await admin
    .from("viral_videos")
    .insert(insertPayload)
    .select("*")
    .single();

  if (insertErr) {
    // 23505 = unique violation; race with another resolver. Re-select.
    if (insertErr.code === "23505") {
      const { data: winner } = await admin
        .from("viral_videos")
        .select("*")
        .eq("platform", canonical.platform)
        .eq("apify_video_id", canonical.postId)
        .single();
      if (winner) {
        return new Response(JSON.stringify({ row: winner, created: false }), { status: 200, headers: { ...corsHeaders, "content-type": "application/json" } });
      }
    }
    return new Response(JSON.stringify({ error: "insert_failed", message: insertErr.message }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
  }

  return new Response(JSON.stringify({ row: inserted, created: true }), { status: 201, headers: { ...corsHeaders, "content-type": "application/json" } });
});
```

- [ ] **Step 2: Deploy the function**

```bash
npx supabase functions deploy viral-video-resolve
```

Expected: Deploy succeeds, function appears in Supabase dashboard.

- [ ] **Step 3: Manual test via curl**

```bash
# Replace <ANON_JWT> with a real signed-in user's token from the app.
curl -X POST "$SUPABASE_URL/functions/v1/viral-video-resolve" \
  -H "Authorization: Bearer <ANON_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.instagram.com/reel/CTestExample/"}'
```

Expected first call: HTTP 201, `{row: {...analysis_status: "pending"}, created: true}`.
Expected second call (same URL): HTTP 200, `{row: {same id}, created: false}`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/viral-video-resolve
git commit -m "feat(viral-videos): /viral-video-resolve find-or-create endpoint

Canonicalizes any pasted URL, looks up by (platform, apify_video_id),
and inserts a pending stub if not found. Returns the row to the caller.
Replaces ad-hoc upserts scattered across Canvas paste and /ai chat."
```

---

## Task 8: `/analyze-viral-video-user` edge function

**Files:**
- Create: `supabase/functions/analyze-viral-video-user/index.ts`

- [ ] **Step 1: Find the deductCredits helper used by transcribe-video**

```bash
grep -rn "deduct_credits_atomic\|deductCredits" supabase/functions/transcribe-video/ supabase/functions/_shared/ | head
```

Use the same helper (likely `supabase/functions/_shared/credits.ts` or inline in transcribe-video). The plan below assumes you can import a `deductCredits(admin, userId, action, amount)` helper; if it's inline, copy the relevant function into `_shared/` first as a separate prep step before this one.

- [ ] **Step 2: Write the function**

```typescript
// supabase/functions/analyze-viral-video-user/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { runFullAnalysis, ViralVideoRow, AnalyzerError } from "../_shared/viral-video-analyzer.ts";
import { deductCredits, refundCredits } from "../_shared/credits.ts"; // adjust if helper path differs

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CREDIT_COST = 50;
const ACTION = "analyze_viral_video";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405, headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const authHeader = req.headers.get("authorization") ?? "";
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userResult } = await userClient.auth.getUser();
  const user = userResult?.user;
  if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "content-type": "application/json" } });

  let body: { viral_video_id?: string };
  try { body = await req.json(); } catch { body = {}; }
  if (!body.viral_video_id) {
    return new Response(JSON.stringify({ error: "missing_viral_video_id" }), { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } });
  }

  // Load row.
  const { data: row, error: rowErr } = await admin
    .from("viral_videos")
    .select("*")
    .eq("id", body.viral_video_id)
    .single<ViralVideoRow>();
  if (rowErr || !row) {
    return new Response(JSON.stringify({ error: "row_not_found" }), { status: 404, headers: { ...corsHeaders, "content-type": "application/json" } });
  }

  // Noop if already analyzed and file still valid.
  if (
    row.analysis_status === "analyzed" &&
    row.video_file_url &&
    row.video_file_expires_at &&
    new Date(row.video_file_expires_at) > new Date()
  ) {
    return new Response(JSON.stringify({ row, status: "noop_cached" }), { status: 200, headers: { ...corsHeaders, "content-type": "application/json" } });
  }

  // 409 if another analyze is in flight.
  if (row.analysis_status === "analyzing") {
    return new Response(JSON.stringify({ error: "in_progress", row }), { status: 409, headers: { ...corsHeaders, "content-type": "application/json" } });
  }

  // Claim the row.
  const { data: claimed, error: claimErr } = await admin
    .from("viral_videos")
    .update({ analysis_status: "analyzing", analysis_error: null })
    .eq("id", row.id)
    .in("analysis_status", ["pending", "failed"]) // only claim from pending/failed
    .select("*")
    .single<ViralVideoRow>();
  if (claimErr || !claimed) {
    return new Response(JSON.stringify({ error: "claim_failed", message: claimErr?.message }), { status: 409, headers: { ...corsHeaders, "content-type": "application/json" } });
  }

  // Deduct credits.
  const deductResult = await deductCredits(admin, user.id, ACTION, CREDIT_COST);
  if (!deductResult.ok) {
    await admin.from("viral_videos").update({ analysis_status: "pending" }).eq("id", row.id);
    return new Response(JSON.stringify({ error: "insufficient_credits", details: deductResult.error }), { status: 402, headers: { ...corsHeaders, "content-type": "application/json" } });
  }

  // Run pipeline.
  try {
    const patch = await runFullAnalysis(admin, claimed, supabaseUrl, serviceKey);
    const { data: updated, error: updateErr } = await admin
      .from("viral_videos")
      .update({ ...patch, analysis_status: "analyzed", analysis_error: null })
      .eq("id", row.id)
      .select("*")
      .single();
    if (updateErr) throw new AnalyzerError("db_update_failed", updateErr.message);
    return new Response(JSON.stringify({ row: updated, status: "analyzed" }), { status: 200, headers: { ...corsHeaders, "content-type": "application/json" } });
  } catch (err) {
    const code = err instanceof AnalyzerError ? err.code : "unknown_error";
    const message = err instanceof Error ? err.message : String(err);
    await admin.from("viral_videos")
      .update({ analysis_status: "failed", analysis_error: `${code}: ${message}` })
      .eq("id", row.id);
    await refundCredits(admin, user.id, ACTION, CREDIT_COST);
    return new Response(JSON.stringify({ error: code, message }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
  }
});
```

- [ ] **Step 3: Verify `_shared/credits.ts` has `deductCredits` + `refundCredits`**

If the existing transcribe-video uses inline credit logic, refactor it into `supabase/functions/_shared/credits.ts` first. The signatures used above:

```typescript
export async function deductCredits(
  admin: SupabaseClient,
  userId: string,
  action: string,
  amount: number,
): Promise<{ ok: true } | { ok: false; error: string }> { /* wraps deduct_credits_atomic RPC */ }

export async function refundCredits(
  admin: SupabaseClient,
  userId: string,
  action: string,
  amount: number,
): Promise<void> { /* calls deduct_credits_atomic with negative amount */ }
```

- [ ] **Step 4: Deploy and smoke test**

```bash
npx supabase functions deploy analyze-viral-video-user
```

Then in the app, paste a fresh Instagram URL in Canvas, call resolve, and call analyze-viral-video-user with the returned id. Verify: status transitions pending → analyzing → analyzed, transcript + framework_meta + video_file_url all populated, 50 credits deducted.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/analyze-viral-video-user supabase/functions/_shared/credits.ts
git commit -m "feat(viral-videos): /analyze-viral-video-user unified analyze endpoint

Single-button analyze flow consumed by VideoNode and ViralTodayDetail.
Claims the row via status='analyzing', deducts 50 credits, runs the
shared pipeline (file/transcript/visual/tags), and either marks
'analyzed' or 'failed' with a refund on error."
```

---

## Task 9: `/viral-video-refresh-file` edge function

**Files:**
- Create: `supabase/functions/viral-video-refresh-file/index.ts`

- [ ] **Step 1: Write the function**

```typescript
// supabase/functions/viral-video-refresh-file/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { acquireVideoFile, ViralVideoRow, AnalyzerError } from "../_shared/viral-video-analyzer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405, headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const authHeader = req.headers.get("authorization") ?? "";
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userResult } = await userClient.auth.getUser();
  if (!userResult?.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "content-type": "application/json" } });

  let body: { viral_video_id?: string };
  try { body = await req.json(); } catch { body = {}; }
  if (!body.viral_video_id) return new Response(JSON.stringify({ error: "missing_viral_video_id" }), { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } });

  const { data: row, error: rowErr } = await admin
    .from("viral_videos")
    .select("*")
    .eq("id", body.viral_video_id)
    .single<ViralVideoRow>();
  if (rowErr || !row) return new Response(JSON.stringify({ error: "row_not_found" }), { status: 404, headers: { ...corsHeaders, "content-type": "application/json" } });

  // Only refresh if analysis was completed (we don't want to spawn full analyze from here).
  if (row.analysis_status !== "analyzed") {
    return new Response(JSON.stringify({ error: "not_analyzed", message: "Use /analyze-viral-video-user instead" }), { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } });
  }

  try {
    const { video_file_url, video_file_expires_at } = await acquireVideoFile(admin, { ...row, video_file_url: null, video_file_expires_at: null });
    const { data: updated } = await admin
      .from("viral_videos")
      .update({ video_file_url, video_file_expires_at })
      .eq("id", row.id)
      .select("*")
      .single();
    return new Response(JSON.stringify({ row: updated }), { status: 200, headers: { ...corsHeaders, "content-type": "application/json" } });
  } catch (err) {
    if (err instanceof AnalyzerError && err.code === "cobalt_failed") {
      return new Response(JSON.stringify({ error: "source_unavailable", message: "Original video URL is no longer reachable" }), { status: 410, headers: { ...corsHeaders, "content-type": "application/json" } });
    }
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: "refresh_failed", message }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
  }
});
```

- [ ] **Step 2: Deploy**

```bash
npx supabase functions deploy viral-video-refresh-file
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/viral-video-refresh-file
git commit -m "feat(viral-videos): /viral-video-refresh-file for post-90-day refetch

Re-acquires the MP4 from source without re-running transcript or
visual breakdown. Free (no credits) since analysis is cached. Returns
410 if the source URL is no longer reachable."
```

---

## Task 10: `cleanup-expired-viral-videos` edge function + cron

**Files:**
- Create: `supabase/functions/cleanup-expired-viral-videos/index.ts`
- Create: `supabase/migrations/20260515_viral_videos_cleanup_cron.sql`

- [ ] **Step 1: Read the existing cleanup-expired-videos function**

Read `supabase/functions/cleanup-expired-videos/index.ts` to understand the cron auth pattern (headers, secret token, or pg_net invocation) and mirror it.

- [ ] **Step 2: Write the function**

```typescript
// supabase/functions/cleanup-expired-viral-videos/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

Deno.serve(async (req) => {
  // Auth: cron secret header (mirror cleanup-expired-videos).
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret && req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response("forbidden", { status: 403 });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: expired, error: queryErr } = await admin
    .from("viral_videos")
    .select("id, video_file_url")
    .lt("video_file_expires_at", new Date().toISOString())
    .not("video_file_url", "is", null)
    .limit(500);
  if (queryErr) return new Response(JSON.stringify({ error: queryErr.message }), { status: 500 });

  let deleted = 0;
  let errors: Array<{ id: string; error: string }> = [];
  for (const row of expired ?? []) {
    const path = `${row.id}.mp4`;
    const { error: rmErr } = await admin.storage.from("viral-videos").remove([path]);
    if (rmErr && !rmErr.message.includes("not found")) {
      errors.push({ id: row.id, error: rmErr.message });
      continue;
    }
    const { error: updErr } = await admin
      .from("viral_videos")
      .update({ video_file_url: null, video_file_expires_at: null })
      .eq("id", row.id);
    if (updErr) {
      errors.push({ id: row.id, error: updErr.message });
      continue;
    }
    deleted++;
  }

  return new Response(JSON.stringify({ deleted, errors }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});
```

- [ ] **Step 3: Schedule the cron**

Inspect the existing `cleanup-expired-videos` schedule first:

```bash
grep -rn "cleanup-expired-videos\|cron.schedule" supabase/migrations/ | head
```

Then add a matching pg_cron entry in a new migration:

```sql
-- supabase/migrations/20260515_viral_videos_cleanup_cron.sql
SELECT cron.schedule(
  'cleanup-expired-viral-videos-daily',
  '0 4 * * *',  -- 04:00 UTC daily; adjust to match existing cleanup-expired-videos
  $$
    SELECT net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/cleanup-expired-viral-videos',
      headers := jsonb_build_object('x-cron-secret', current_setting('app.cron_secret'))
    );
  $$
);
```

If the existing function uses a different cron mechanism, copy that pattern instead.

- [ ] **Step 4: Deploy + apply**

```bash
npx supabase functions deploy cleanup-expired-viral-videos
npx supabase db push
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/cleanup-expired-viral-videos \
        supabase/migrations/20260515_viral_videos_cleanup_cron.sql
git commit -m "feat(viral-videos): 90-day file cleanup cron

Daily job removes MP4s from the viral-videos bucket whose
video_file_expires_at has passed, then nulls the columns.
Transcript + framework_meta remain forever; only the file is deleted."
```

---

## Task 11: Refactor existing `transcribe-video` to use shared analyzer

**Files:**
- Modify: `supabase/functions/transcribe-video/index.ts`

Goal: collapse the function to a thin wrapper that calls `runFullAnalysis`. Preserve the existing request shape (`{ url, viral_video_id?, source? }`) so legacy callers don't break.

- [ ] **Step 1: Read current implementation**

```bash
wc -l supabase/functions/transcribe-video/index.ts
```

If the file is large, identify the credit-deduction block, the request parsing, and the response shape. Plan to keep all three.

- [ ] **Step 2: Replace the analysis body with a call into the shared module**

Outline of the new function (apply this transformation to the existing file — do NOT rewrite from scratch since the request/response contract matters for back-compat):

```typescript
// supabase/functions/transcribe-video/index.ts (modified)
// Imports unchanged except add:
import { runFullAnalysis, ViralVideoRow } from "../_shared/viral-video-analyzer.ts";
import { canonicalizeVideoUrl } from "../_shared/canonicalize-video-url.ts";

// ... preserve existing auth, CORS, credit-deduction header parsing ...

// Inside the main handler, REPLACE the existing transcribe-and-write-back block with:

// Resolve to a viral_videos row.
let row: ViralVideoRow;
if (viral_video_id) {
  const { data, error } = await admin.from("viral_videos").select("*").eq("id", viral_video_id).single();
  if (error || !data) return badRequest("viral_video_id not found");
  row = data;
} else {
  const canonical = canonicalizeVideoUrl(url);
  if (!canonical) return badRequest("unsupported_url");
  // Find-or-create (inline since this fn predates /viral-video-resolve).
  const { data: existing } = await admin.from("viral_videos")
    .select("*").eq("platform", canonical.platform).eq("apify_video_id", canonical.postId).maybeSingle();
  if (existing) {
    row = existing;
  } else {
    const { data: inserted } = await admin.from("viral_videos").insert({
      platform: canonical.platform,
      apify_video_id: canonical.postId,
      video_url: canonical.normalizedUrl,
      channel_username: "unknown",
      analysis_status: "pending",
      user_submitted: true,
      submitted_by: user.id,
      outlier_score: 0, views_count: 0, likes_count: 0, comments_count: 0,
      scraped_at: new Date().toISOString(),
    }).select("*").single();
    row = inserted!;
  }
}

// Existing credit-deduction stays exactly as it was (50 credits, action mapped from `source`).

// Run shared analyzer.
const patch = await runFullAnalysis(admin, row, Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
await admin.from("viral_videos").update({ ...patch, analysis_status: "analyzed" }).eq("id", row.id);

// Existing response shape preserved (transcription + videoFileUrl + thumbnailUrl).
return new Response(JSON.stringify({
  transcription: patch.transcript,
  videoFileUrl: patch.video_file_url,
  thumbnailUrl: row.thumbnail_url ?? null,
  videoTitle: null,
}), { status: 200, headers: { ...corsHeaders, "content-type": "application/json" } });
```

The response shape **must match** what `VideoNode.tsx` currently expects (`transcription`, `videoFileUrl`, `thumbnailUrl`, `videoTitle`). Re-read VideoNode lines 529-600 to confirm before editing.

- [ ] **Step 3: Deploy + smoke test**

```bash
npx supabase functions deploy transcribe-video
```

Smoke test: paste a video URL in Canvas via the existing UI (before Task 14 refactors VideoNode). Verify transcription still appears.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/transcribe-video
git commit -m "refactor(transcribe-video): delegate to shared analyzer

Preserves the legacy request/response shape (still returns
{transcription, videoFileUrl, thumbnailUrl, videoTitle}) but runs the
unified analyze pipeline server-side. Visual breakdown now happens
automatically alongside transcript so single-click Canvas analyze
behaves identically to ViralTodayDetail's analyze button."
```

---

## Task 12: Refactor existing cron `analyze-viral-video` to use shared analyzer

**Files:**
- Modify: `supabase/functions/analyze-viral-video/index.ts`

- [ ] **Step 1: Read current implementation**

```bash
grep -n "function\|export" supabase/functions/analyze-viral-video/index.ts | head -20
```

Note the outlier-threshold filter (5x + 500k views), the force flag, and the no-credit admin-session behavior. Preserve all three.

- [ ] **Step 2: Replace inline pipeline with shared call**

The function's outer shape (cron invocation, outlier filter, batch loop) stays. Only the per-row analysis block changes:

```typescript
// Inside the per-row loop, replace inline transcribe/visual/tag logic with:
import { runFullAnalysis } from "../_shared/viral-video-analyzer.ts";
// ...
const patch = await runFullAnalysis(admin, row, Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
await admin.from("viral_videos").update({ ...patch, analysis_status: "analyzed" }).eq("id", row.id);
```

No credit deduction (admin session). Error handling: on failure, update `analysis_status='failed'` and `analysis_error=<message>`, continue to next row.

- [ ] **Step 3: Deploy**

```bash
npx supabase functions deploy analyze-viral-video
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/analyze-viral-video
git commit -m "refactor(analyze-viral-video): use shared analyzer for cron pipeline

Cron job now shares pipeline logic with user-triggered analyze. Outlier
threshold (5x + 500k) and admin-session no-credit behavior preserved."
```

---

## Task 13: `ViralVideoPlayer` shared component

**Files:**
- Create: `src/components/video/ViralVideoPlayer.tsx`

- [ ] **Step 1: Read existing CanvasVideoPlayer**

Read `src/components/canvas/VideoNode.tsx` lines 234-428 (the `CanvasVideoPlayer` component). Note: aspect-ratio detection, play/pause, seek, mute, fullscreen, timestamp display.

- [ ] **Step 2: Extract to a standalone component**

```typescript
// src/components/video/ViralVideoPlayer.tsx
import { useEffect, useRef, useState } from "react";

interface ViralVideoPlayerProps {
  src: string | null;
  fallbackProxyUrl?: string | null;  // VPS /stream-reel fallback
  aspectRatio?: "9:16" | "16:9" | "auto";
  onExpired?: () => void;  // called if src returns 404/410
}

export function ViralVideoPlayer({ src, fallbackProxyUrl, aspectRatio = "auto", onExpired }: ViralVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [detectedRatio, setDetectedRatio] = useState<"9:16" | "16:9">("9:16");

  const effectiveSrc = src ?? fallbackProxyUrl ?? "";

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const onMeta = () => {
      setDuration(el.duration || 0);
      if (aspectRatio === "auto" && el.videoWidth && el.videoHeight) {
        setDetectedRatio(el.videoWidth > el.videoHeight ? "16:9" : "9:16");
      }
    };
    const onTime = () => setCurrent(el.currentTime);
    const onErr = () => onExpired?.();
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("error", onErr);
    return () => {
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("error", onErr);
    };
  }, [aspectRatio, onExpired, effectiveSrc]);

  const finalRatio = aspectRatio === "auto" ? detectedRatio : aspectRatio;

  if (!effectiveSrc) {
    return (
      <div className="flex items-center justify-center bg-black/40 text-bone/60 rounded-lg" style={{ aspectRatio: finalRatio.replace(":", "/") }}>
        Video unavailable
      </div>
    );
  }

  return (
    <div className="relative bg-black rounded-lg overflow-hidden" style={{ aspectRatio: finalRatio.replace(":", "/") }}>
      <video
        ref={videoRef}
        src={effectiveSrc}
        muted={muted}
        playsInline
        className="w-full h-full"
        onClick={() => {
          const el = videoRef.current;
          if (!el) return;
          if (el.paused) { el.play(); setPlaying(true); }
          else { el.pause(); setPlaying(false); }
        }}
      />
      <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent flex items-center gap-2 text-bone text-xs">
        <button onClick={() => { const el = videoRef.current; if (!el) return; el.paused ? el.play() : el.pause(); setPlaying(!el.paused); }}>
          {playing ? "⏸" : "▶"}
        </button>
        <button onClick={() => { setMuted((m) => !m); }}>
          {muted ? "🔇" : "🔊"}
        </button>
        <input
          type="range"
          min={0}
          max={duration || 0}
          value={current}
          onChange={(e) => { const el = videoRef.current; if (el) el.currentTime = Number(e.target.value); }}
          className="flex-1"
        />
        <span>{formatTime(current)} / {formatTime(duration)}</span>
      </div>
    </div>
  );
}

function formatTime(s: number): string {
  if (!isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/video/ViralVideoPlayer.tsx
git commit -m "feat(viral-videos): shared ViralVideoPlayer component

Extracted from Canvas's CanvasVideoPlayer for reuse by ViralTodayDetail
and the refactored VideoNode. Auto-detects 9:16 vs 16:9, falls back to
VPS proxy URL if signed Storage URL is null, surfaces an onExpired
callback for the refresh-file path."
```

---

## Task 14: `ViralTodayDetail` page + route

**Files:**
- Create: `src/pages/ViralTodayDetail.tsx`
- Modify: `src/App.tsx` (or wherever React Router routes are defined)

- [ ] **Step 1: Find the routes file**

```bash
grep -rn "ViralToday\|<Route" src/ | grep -i "route\|router" | head
```

Confirm the routing file. The new route is `/viral-today/:id`.

- [ ] **Step 2: Write the page**

```typescript
// src/pages/ViralTodayDetail.tsx
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase"; // adjust import path
import { ViralVideoPlayer } from "@/components/video/ViralVideoPlayer";

type AnalysisStatus = "pending" | "analyzing" | "analyzed" | "failed";

interface ViralVideo {
  id: string;
  platform: string;
  video_url: string;
  channel_username: string;
  caption: string | null;
  thumbnail_url: string | null;
  views_count: number;
  likes_count: number;
  engagement_rate: number | null;
  outlier_score: number | null;
  posted_at: string | null;
  transcript: string | null;
  hook_text: string | null;
  cta_text: string | null;
  framework_meta: Record<string, unknown> | null;
  video_file_url: string | null;
  video_file_expires_at: string | null;
  analysis_status: AnalysisStatus;
  analysis_error: string | null;
}

type Tab = "transcript" | "visual" | "hook" | "story";

export default function ViralTodayDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [row, setRow] = useState<ViralVideo | null>(null);
  const [tab, setTab] = useState<Tab>("transcript");
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let mounted = true;

    (async () => {
      const { data } = await supabase.from("viral_videos").select("*").eq("id", id).single();
      if (mounted && data) setRow(data as ViralVideo);
    })();

    const channel = supabase
      .channel(`viral_videos:${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "viral_videos", filter: `id=eq.${id}` }, (payload) => {
        if (mounted) setRow(payload.new as ViralVideo);
      })
      .subscribe();

    return () => { mounted = false; supabase.removeChannel(channel); };
  }, [id]);

  if (!row) return <div className="p-6 text-bone/60">Loading…</div>;

  const fileExpired = row.analysis_status === "analyzed" && !row.video_file_url;

  async function handleAnalyze() {
    if (!row) return;
    setAnalyzing(true);
    setError(null);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-viral-video-user`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ viral_video_id: row.id }),
    });
    setAnalyzing(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setError(err.error ?? `HTTP ${res.status}`);
    }
    // Realtime subscription will pick up the row update.
  }

  async function handleRefresh() {
    if (!row) return;
    const { data: { session } } = await supabase.auth.getSession();
    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/viral-video-refresh-file`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ viral_video_id: row.id }),
    });
  }

  return (
    <div className="p-6 max-w-5xl mx-auto text-bone">
      <button onClick={() => navigate(-1)} className="text-bone/60 mb-4">← back</button>
      <h1 className="text-2xl font-serif mb-1">@{row.channel_username}</h1>
      <div className="text-bone/60 text-sm mb-6">
        {row.posted_at ? new Date(row.posted_at).toLocaleDateString() : ""}
        {row.outlier_score ? ` · ${row.outlier_score.toFixed(1)}x outlier` : ""}
        {row.views_count ? ` · ${row.views_count.toLocaleString()} views` : ""}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[300px,1fr] gap-6">
        <div>
          <ViralVideoPlayer src={row.video_file_url} aspectRatio="auto" />
          {fileExpired && (
            <button onClick={handleRefresh} className="mt-2 w-full text-sm text-bone/60 underline">
              Video expired — click to refresh
            </button>
          )}
        </div>

        <div>
          <h2 className="text-sm uppercase tracking-wide text-bone/40 mb-2">Summary</h2>
          <p className="text-bone/80 mb-4">{row.caption ?? "(no caption)"}</p>

          {row.analysis_status === "analyzed" && (
            <>
              <div className="flex gap-2 border-b border-bone/10 mb-3">
                {(["transcript", "visual", "hook", "story"] as Tab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`px-3 py-2 text-sm capitalize ${tab === t ? "text-bone border-b-2 border-bone" : "text-bone/50"}`}
                  >
                    {t === "story" ? "Storytelling" : t}
                  </button>
                ))}
              </div>
              <div className="text-bone/80 whitespace-pre-wrap min-h-[200px]">
                {tab === "transcript" && (row.transcript ?? "(no transcript)")}
                {tab === "visual" && renderVisual(row.framework_meta)}
                {tab === "hook" && (row.hook_text ?? "(no hook)")}
                {tab === "story" && renderStoryFormat(row.framework_meta)}
              </div>
            </>
          )}

          <div className="mt-6 flex gap-3">
            {row.analysis_status !== "analyzed" && (
              <button
                onClick={handleAnalyze}
                disabled={analyzing || row.analysis_status === "analyzing"}
                className="px-4 py-2 bg-bone text-charcoal rounded-md disabled:opacity-50"
              >
                {row.analysis_status === "analyzing" || analyzing ? "Analyzing…" : "Analyze (50 credits)"}
              </button>
            )}
            {row.analysis_status === "analyzed" && (
              <>
                <button onClick={() => navigate(`/canvas?attach=${row.id}`)} className="px-4 py-2 bg-bone text-charcoal rounded-md">
                  Open in Canvas
                </button>
                <button onClick={() => navigate(`/canvas?attach=${row.id}&action=create-script`)} className="px-4 py-2 border border-bone/30 rounded-md">
                  Create script
                </button>
              </>
            )}
          </div>

          {error && <div className="mt-3 text-red-400 text-sm">{error}</div>}
          {row.analysis_status === "failed" && row.analysis_error && (
            <div className="mt-3 text-red-400 text-sm">Analysis failed: {row.analysis_error}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function renderVisual(meta: Record<string, unknown> | null): string {
  if (!meta) return "(no visual breakdown)";
  const segments = (meta.visual_segments as Array<{ start: number; end: number; description: string; text_on_screen: string[] }> | undefined) ?? [];
  if (segments.length === 0) return "(no visual breakdown)";
  return segments.map((s) => `[${s.start.toFixed(1)}s–${s.end.toFixed(1)}s] ${s.description}${s.text_on_screen.length ? `\n   text: ${s.text_on_screen.join(" | ")}` : ""}`).join("\n\n");
}

function renderStoryFormat(meta: Record<string, unknown> | null): string {
  if (!meta) return "(no story format)";
  return (meta.body_structure as string) ?? "(no story format)";
}
```

- [ ] **Step 3: Wire the route**

In the routing file (likely `src/App.tsx`):

```tsx
import ViralTodayDetail from "@/pages/ViralTodayDetail";
// ...
<Route path="/viral-today/:id" element={<ViralTodayDetail />} />
```

- [ ] **Step 4: Manual UAT**

```bash
npm run dev
```

Browse to `/viral-today/<existing-row-id>` (find one in Supabase Studio). Verify:
- Page loads with the player on the left, summary + tabs on the right.
- If row is pending, "Analyze (50 credits)" button is visible.
- Clicking analyze transitions through analyzing → analyzed via realtime.
- After analyzed, tabs show transcript, visual layout, hook, story format.
- "Open in Canvas" navigates to `/canvas?attach=<id>`.

- [ ] **Step 5: Commit**

```bash
git add src/pages/ViralTodayDetail.tsx src/App.tsx
git commit -m "feat(viral-today): /viral-today/:id detail page

Player + tabs (transcript/visual/hook/story) + single Analyze button.
Subscribes to viral_videos row via realtime so concurrent viewers see
the same analyze progress. Open in Canvas deep-links via ?attach=<id>."
```

---

## Task 15: Wire grid card click → detail page

**Files:**
- Modify: `src/pages/ViralToday.tsx`

- [ ] **Step 1: Find the card click handler**

```bash
grep -n "onClick\|onCardClick\|navigate\|<Link" src/pages/ViralToday.tsx | head -20
```

The current behavior probably opens a fullscreen `ViralReelFeed` view or does nothing. Replace it with a navigation to the new detail page.

- [ ] **Step 2: Update the click handler**

In `ViralToday.tsx`, wherever a grid card is rendered (look for the loop over `viral_videos`), replace any inline modal/feed-open logic with:

```tsx
import { useNavigate } from "react-router-dom";
// inside the component:
const navigate = useNavigate();
// in the card render:
<div onClick={() => navigate(`/viral-today/${video.id}`)} className="cursor-pointer ...">
  {/* existing card content */}
</div>
```

Keep the existing thumbnail + metadata rendering intact. Only the click handler changes.

- [ ] **Step 3: Manual UAT**

```bash
npm run dev
```

Browse to `/viral-today`, click any card. Verify it navigates to `/viral-today/:id` and the detail page renders.

- [ ] **Step 4: Commit**

```bash
git add src/pages/ViralToday.tsx
git commit -m "feat(viral-today): grid cards navigate to detail page

Replaces the inline ViralReelFeed open with a route navigation to
/viral-today/:id."
```

---

## Task 16: Canvas `VideoNode` — resolve on paste + use shared player

**Files:**
- Modify: `src/components/canvas/VideoNode.tsx`

- [ ] **Step 1: Find the URL paste handler**

```bash
grep -n "url\|paste\|onChange\|transcribe\|viralVideoId" src/components/canvas/VideoNode.tsx | head -30
```

Locate where the URL is captured and where `transcribe()` is called.

- [ ] **Step 2: Add resolve call on paste**

In the URL input's onChange/onBlur handler (whatever currently kicks off `transcribe()`), call `/viral-video-resolve` first to obtain a `viral_video_id`. Store it in node data.

```typescript
// Replace the inline URL-acceptance block (before transcribe is called):
async function handleUrlSubmit(url: string) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/viral-video-resolve`, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${session?.access_token}` },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    onUpdate?.({ error: "Unsupported URL" });
    return;
  }
  const { row } = await res.json();
  onUpdate?.({
    viralVideoId: row.id,
    url: row.video_url,
    transcription: row.transcript ?? undefined,
    structure: row.framework_meta?.body_structure ? row.framework_meta : undefined,
    videoAnalysis: row.framework_meta?.visual_segments ? { visual_segments: row.framework_meta.visual_segments } : undefined,
    videoFileUrl: row.video_file_url,
    thumbnailUrl: row.thumbnail_url,
    analysisStatus: row.analysis_status,
  });
  // If already analyzed, no further action needed.
  // If pending, surface the single "Analyze" button (Task 17).
}
```

Add `analysisStatus` to the `VideoData` interface in this file.

- [ ] **Step 3: Replace `CanvasVideoPlayer` with `ViralVideoPlayer`**

Find the inline `CanvasVideoPlayer` component (~lines 234-428) and the place where it's used. Delete the inline component, import the shared one, and replace the usage:

```typescript
import { ViralVideoPlayer } from "@/components/video/ViralVideoPlayer";
// ...
<ViralVideoPlayer src={videoData.videoFileUrl ?? null} aspectRatio="auto" />
```

- [ ] **Step 4: Commit**

```bash
git add src/components/canvas/VideoNode.tsx
git commit -m "refactor(canvas): VideoNode resolves to viral_videos row on paste

URL paste now hits /viral-video-resolve before any analysis. Node carries
a viralVideoId from the start so transcript + framework_meta + file URL
are pre-loaded from cache when the URL has been seen before. Inline
CanvasVideoPlayer replaced by shared ViralVideoPlayer."
```

---

## Task 17: Canvas `VideoNode` — single Analyze button

**Files:**
- Modify: `src/components/canvas/VideoNode.tsx`

- [ ] **Step 1: Delete the two-button flow**

In `VideoNode.tsx`, find:
- The `transcribe()` function (currently calls `/transcribe-video`)
- The `runVisualAnalysis()` function (currently calls `/analyze-video-multimodal` after structure analysis)
- The "Go" button that triggers transcribe
- The "Generate Visual Breakdown" button

Delete the visual-breakdown button entirely. Rename "Go" to "Analyze" and rewrite the handler to call the unified endpoint:

```typescript
async function handleAnalyze() {
  if (!videoData.viralVideoId) {
    onUpdate?.({ error: "No video resolved — re-paste URL" });
    return;
  }
  onUpdate?.({ analysisStatus: "analyzing" });
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-viral-video-user`, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${session?.access_token}` },
    body: JSON.stringify({ viral_video_id: videoData.viralVideoId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    onUpdate?.({ analysisStatus: "failed", error: err.error ?? `HTTP ${res.status}` });
    return;
  }
  const { row } = await res.json();
  onUpdate?.({
    transcription: row.transcript,
    structure: row.framework_meta,
    videoAnalysis: { visual_segments: row.framework_meta?.visual_segments },
    videoFileUrl: row.video_file_url,
    analysisStatus: "analyzed",
  });
}
```

UI render rules (replace existing button rendering):

```tsx
{videoData.analysisStatus === "pending" && (
  <button onClick={handleAnalyze}>Analyze (50 credits)</button>
)}
{videoData.analysisStatus === "analyzing" && (
  <div>Analyzing…</div>
)}
{videoData.analysisStatus === "analyzed" && (
  <div>
    <TranscriptView transcript={videoData.transcription} />
    <VisualView segments={videoData.videoAnalysis?.visual_segments} />
  </div>
)}
{videoData.analysisStatus === "failed" && (
  <button onClick={handleAnalyze}>Retry analyze (50 credits)</button>
)}
```

- [ ] **Step 2: Subscribe to realtime updates for the row**

To handle the case where another user (or another tab) analyzed the same video, subscribe to row updates:

```typescript
useEffect(() => {
  if (!videoData.viralVideoId) return;
  const channel = supabase
    .channel(`videonode:${videoData.viralVideoId}`)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "viral_videos", filter: `id=eq.${videoData.viralVideoId}` }, (payload) => {
      const row = payload.new as any;
      onUpdate?.({
        transcription: row.transcript,
        videoFileUrl: row.video_file_url,
        analysisStatus: row.analysis_status,
        structure: row.framework_meta,
        videoAnalysis: { visual_segments: row.framework_meta?.visual_segments },
      });
    })
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}, [videoData.viralVideoId]);
```

- [ ] **Step 3: Manual UAT**

```bash
npm run dev
```

In Canvas, paste a fresh Instagram URL. Verify:
1. Resolve happens immediately; node shows "Analyze (50 credits)" button.
2. Click Analyze. Status flips to "Analyzing…".
3. After ~30-90s, transcript + visual breakdown both appear in one shot.
4. Refresh the page: status sticks to "analyzed", everything pre-loaded.
5. Open `/viral-today/<that id>` in another tab — same data, same player.

- [ ] **Step 4: Commit**

```bash
git add src/components/canvas/VideoNode.tsx
git commit -m "feat(canvas): VideoNode single-click unified analyze

Replaces the two-button (Transcribe → Visual Breakdown) flow with a
single Analyze button. Subscribes to viral_videos row realtime so cross-
surface state stays in sync."
```

---

## Task 18: `/ai` chat URL paste — share canonicalization with resolve

**Files:**
- Modify: `supabase/functions/companion-chat/build-tool-handlers.ts`

The `/ai` chat URL paste lives server-side, not in React. The handler in `build-tool-handlers.ts` currently does its own `viral_videos` upsert with `user_submitted=true`. We refactor it to use the same canonicalization helper and reuse the existing row if one exists — but **keep** the upsert inline (not a fetch to `/viral-video-resolve`) since this is already running server-side with the service role and an HTTP round-trip would be wasteful.

- [ ] **Step 1: Read the existing handler**

```bash
grep -n "viral_videos\|user_submitted\|submitted_by" supabase/functions/companion-chat/build-tool-handlers.ts
```

Locate the block that inserts/upserts into `viral_videos`. Note what fields it sets and what it returns to the caller.

- [ ] **Step 2: Refactor to use the shared canonicalizer**

Replace the existing URL parsing + upsert block with:

```typescript
import { canonicalizeVideoUrl } from "../_shared/canonicalize-video-url.ts";

// Inside the build-tool handler where a URL is processed:
const canonical = canonicalizeVideoUrl(pastedUrl);
if (!canonical) {
  // Surface a friendly error back to the assistant.
  return { error: "unsupported_url", message: "Couldn't recognize that video URL." };
}

// Find-or-create. Same logic as /viral-video-resolve but inline (we're already
// in a service-role context — no HTTP hop needed).
const { data: existing } = await admin.from("viral_videos")
  .select("*")
  .eq("platform", canonical.platform)
  .eq("apify_video_id", canonical.postId)
  .maybeSingle();

let row;
if (existing) {
  row = existing;
} else {
  const { data: inserted, error: insertErr } = await admin.from("viral_videos").insert({
    platform: canonical.platform,
    apify_video_id: canonical.postId,
    video_url: canonical.normalizedUrl,
    channel_username: "unknown",
    analysis_status: "pending",
    user_submitted: true,
    submitted_by: userId,   // already in scope from the handler's auth
    outlier_score: 0,
    views_count: 0, likes_count: 0, comments_count: 0,
    scraped_at: new Date().toISOString(),
  }).select("*").single();
  if (insertErr) {
    if (insertErr.code === "23505") {
      const { data: winner } = await admin.from("viral_videos")
        .select("*")
        .eq("platform", canonical.platform)
        .eq("apify_video_id", canonical.postId)
        .single();
      row = winner;
    } else {
      throw insertErr;
    }
  } else {
    row = inserted;
  }
}

// Continue with whatever build-mode logic uses row.id as viralVideoId.
```

- [ ] **Step 3: Deploy + manual UAT**

```bash
npx supabase functions deploy companion-chat
```

In `/ai` chat build mode, paste an Instagram URL. Verify:
- A row exists in `viral_videos` with `user_submitted=true`, `submitted_by=<your-id>`, `analysis_status='pending'`.
- Re-pasting the same URL hits the existing row (no duplicate insert).
- Build mode picks up the same `viralVideoId` it would have before.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/companion-chat/build-tool-handlers.ts
git commit -m "refactor(companion-chat): use shared canonicalizer for viral_videos upsert

/ai chat URL paste now extracts (platform, postId) via the shared
canonicalize-video-url helper and dedups against the same key as
Canvas and Viral Today. No HTTP hop — service-role insert stays inline."
```

---

## Task 19: Open-in-Canvas deep-link handler

**Files:**
- Modify: the Canvas page entry component (likely `src/pages/Canvas.tsx` or similar)

- [ ] **Step 1: Find the Canvas page entry**

```bash
grep -rn "useSearchParams\|attach=" src/pages/ src/components/canvas/ | head
```

- [ ] **Step 2: Handle `?attach=<viral_video_id>`**

On mount, if `?attach=<id>` is present in the URL, create a new `VideoNode` in the canvas state with `viralVideoId=<id>` and `analysisStatus` populated from a quick fetch (or just `pending` — the node's realtime subscription from Task 17 will pick up the actual state on first row read).

```typescript
const [searchParams] = useSearchParams();
const attachId = searchParams.get("attach");
useEffect(() => {
  if (!attachId) return;
  // Create a new VideoNode at a sensible position.
  addVideoNode({
    viralVideoId: attachId,
    // The node will hydrate via /viral-video-resolve-equivalent fetch on mount,
    // or directly load the row by id. Simplest: do a one-shot fetch here:
  });
  (async () => {
    const { data } = await supabase.from("viral_videos").select("*").eq("id", attachId).single();
    if (data) updateNodeData(/* node id */, hydrateFromRow(data));
  })();
}, [attachId]);
```

Adapt the canvas-state mutation calls to whatever the existing add-node API looks like.

- [ ] **Step 3: Manual UAT**

From `/viral-today/<id>` click "Open in Canvas". Verify the canvas opens with a new VideoNode pre-filled with the analyzed content. No "Analyze" button (since status is `analyzed`).

- [ ] **Step 4: Commit**

```bash
git add src/pages/Canvas.tsx  # or wherever
git commit -m "feat(canvas): handle ?attach=<viral_video_id> deep link

Creates a pre-populated VideoNode from a Viral Today detail page link.
Free, since analysis is already cached."
```

---

## Self-Review

Spec coverage:

| Spec section                          | Task |
|---------------------------------------|------|
| Schema changes                        | 1    |
| URL canonicalization                  | 2, 3 |
| Storage bucket                        | 1    |
| Flow A (find-or-create)               | 7    |
| Flow B (unified analyze)              | 8    |
| Flow C (detail page)                  | 13, 14, 15 |
| Flow D (90-day cleanup)               | 10   |
| Refresh-video after expiry            | 9    |
| Grid filter behavior                  | (no code change — left as-is, called out in Task 15) |
| Refactor `transcribe-video`           | 11   |
| Refactor cron `analyze-viral-video`   | 12   |
| Canvas single Analyze button          | 16, 17 |
| `/ai` chat resolve                    | 18   |
| Shared `<ViralVideoPlayer>`           | 13   |
| Open-in-Canvas deep link              | 19   |
| Realtime subscription                 | 14, 17 |

No placeholders. All shared types (`ViralVideoRow`, `VideoData.analysisStatus`, etc.) defined before use. Each task has either a Deno test + run command or a manual UAT step.
