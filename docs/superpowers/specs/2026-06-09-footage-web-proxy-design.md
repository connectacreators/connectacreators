# Footage Web-Proxy Pipeline — Design

**Date:** 2026-06-09
**Status:** Approved (design) — pending implementation plan
**Author:** Spencer + Claude

## Problem

Clicking play on an uploaded footage clip in the Footage panel takes ~20 seconds
to start. Root cause: footage is uploaded byte-for-byte as-is, and raw iPhone
`.MOV` files store their index (the `moov` atom) at the **end** of the file. A
browser `<video>` element cannot begin playback until it has the `moov` atom, so
for these files it must download the **entire clip** before the first frame.
Large iPhone clips pulled from Supabase storage = the ~20s stall. Some clips are
also HEVC (H.265), which Chrome plays inconsistently.

Confirmed by investigation:
- `src/services/videoUploadService.ts` uploads raw files via TUS with **no**
  transcode / remux / faststart step.
- The only `-movflags +faststart` in the codebase is `render-worker/src/render.ts`,
  which runs **only** on video-editor EDL exports — never on previewed footage.
- No codec detection / HEVC fallback anywhere in `src/`.
- Signed URLs are generated eagerly with a 1h TTL and are stable — **not** a
  contributing factor.

## Goals

- New footage uploads start playing in the panel near-instantly.
- HEVC clips play reliably in Chrome.
- The full-quality **original is never modified or deleted** — editors still
  download/edit the camera file.

## Non-Goals

- **No backfill** of already-uploaded footage in this release (existing files keep
  playing slowly until re-uploaded; a backfill pass can be added later).
- Link-imported footage (Google Drive / pasted URLs) is out of scope — those are
  not storage objects and are not proxied.
- No change to the video-editor export pipeline.

## Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Original vs proxy | **Keep original untouched; add a separate web proxy** for preview |
| Proxy quality | **720p** H.264 + faststart (small, fast, fine for previews) |
| Backfill | **New uploads only** for now |
| Trigger | **Approach A** — DB trigger on `storage.objects` insert |

## Architecture

```
upload (unchanged)                 render-worker (VPS, has ffmpeg, polls queue)
  │  original lands in `footage`        │
  ▼                                     ▼
storage.objects AFTER INSERT      claim queued job → download original →
  trigger (footage + video ext)   ffmpeg downscale 720p H.264 +faststart →
  → INSERT footage_proxies(queued)  upload to `footage-proxies` → mark done
                                          │
panel loadFiles ── reads footage_proxies ─┘
  proxy done → player streams proxy (fast)
  else        → original + "Optimizing…" hint
```

The render-worker is an existing polling job runner on the VPS (systemd). It
already claims jobs from DB queue tables every ~4s, already has `ffmpeg`, and
already reads/writes the `footage` bucket. We add a third job type alongside the
existing render and transcribe queues.

## Components

### 1. Storage bucket: `footage-proxies` (new)

- Mirrors the source path: a source at `footage/<clientId>/<videoEditId>/clip.mov`
  gets a proxy at `footage-proxies/<clientId>/<videoEditId>/clip.mp4`.
- A **separate bucket** (not a subfolder of `footage`) so the panel's existing
  folder listing stays clean and there is zero chance of the pipeline touching an
  original.
- RLS: service-role write (worker), authenticated read (mirrors the `footage`
  bucket's read policy).

### 2. Table: `footage_proxies` (new — also the job queue)

| Column | Notes |
|---|---|
| `id` | uuid pk |
| `source_bucket` | text, default `'footage'` |
| `source_path` | text, **unique** (the object key in `footage`) |
| `proxy_bucket` | text, default `'footage-proxies'` |
| `proxy_path` | text, nullable until done |
| `status` | text: `queued` \| `processing` \| `done` \| `error` |
| `error` | text, nullable |
| `attempts` | int, default 0 (for reclaim/retry) |
| `locked_at` | timestamptz, nullable (worker claim, for orphan reclaim) |
| `created_at` / `updated_at` | timestamptz |

The worker claims `where status='queued'` (and reclaims rows stuck in
`processing` past a timeout), matching the existing render/transcribe claim
pattern in `render-worker/src/db.ts`.

### 3. DB trigger on `storage.objects`

`AFTER INSERT ON storage.objects` → when `NEW.bucket_id = 'footage'` AND the file
extension is a video (`.mov`, `.mp4`, `.m4v`, `.webm`, `.avi`, `.mkv`, etc.) →
`INSERT INTO footage_proxies (source_path, status) VALUES (NEW.name, 'queued')
ON CONFLICT (source_path) DO NOTHING`.

- Images are skipped (the panel previews them directly; no proxy needed).
- Proxies land in a different bucket, so the trigger never fires for them → no
  loop.
- Idempotent via the unique constraint + `ON CONFLICT DO NOTHING`.
- Applied via the Supabase dashboard and verified in prod (per the project's
  migration-drift practice — no bulk `db push`).

### 4. render-worker: `processProxyJob`

New job handler mirroring the existing ones:
1. `claimNextProxyJob` (queued → processing, set `locked_at`).
2. Download the original from `footage` to local disk.
3. Transcode:
   `ffmpeg -i in -vf scale=-2:720 -c:v libx264 -preset veryfast -crf 23
   -c:a aac -movflags +faststart -y out.mp4`
   - `scale=-2:720` downscales to 720p preserving aspect (and never upscales past
     source via `min`-style guard if source < 720p — implementation detail).
   - Re-encoding to H.264 fixes HEVC automatically (ffmpeg decodes HEVC → encodes
     H.264) in the same pass.
4. Upload `out.mp4` to `footage-proxies` at the mirrored path (`.mp4` extension).
5. `markProxyDone` (status=done, set `proxy_path`). On failure, `markProxyError`
   with the message and increment `attempts`.

The worker's poll loop also tries the proxy queue each tick (after render and
transcribe), so no new process/service is introduced.

### 5. Panel: `FootagePanel.tsx`

- `loadFiles` additionally queries `footage_proxies` for the current folder's
  source paths (single query) and builds a `source_path → { status, proxy_path }`
  map.
- For each listed file:
  - proxy `done` → create a signed URL for `proxy_path` in `footage-proxies` and
    use it as the `<video>` `src` (fast playback).
  - otherwise → use the original signed URL as today, and show a subtle
    "Optimizing for playback…" hint when status is `queued`/`processing`.
- Bump the inline player to `preload="metadata"` (`ThemedVideoPlayer`) — harmless,
  and helps once proxies (faststart) are in place.
- Images and link-imported footage are unaffected.

## Data Flow (happy path)

1. User uploads `IMG_6001.MOV` → lands at `footage/<c>/<v>/IMG_6001.mov`.
2. Trigger inserts `footage_proxies` row, status `queued`.
3. Worker (within ~4s) claims it → status `processing`.
4. Worker transcodes → uploads `footage-proxies/<c>/<v>/IMG_6001.mp4` → status
   `done`.
5. Next time the panel loads that folder, the player streams the 720p faststart
   proxy → playback starts in ~1s.
6. Between steps 2–4, opening the clip falls back to the original (slow but works)
   with an "Optimizing…" hint.

## Error Handling

- **Transcode failure** → status `error`, message stored; panel silently falls
  back to the original (no proxy = current behavior). A failed proxy never blocks
  preview.
- **Orphaned `processing` jobs** (worker crash) → reclaimed after a timeout, same
  as existing queues; `attempts` caps retries to avoid poison-pill loops.
- **Trigger never double-enqueues** (unique `source_path` + `ON CONFLICT`).
- **Original is read-only** throughout — the worker only downloads it; the proxy
  is written to a different bucket.

## Testing

- **render-worker** (`render-worker/src/*.test.ts` pattern): unit test
  `processProxyJob` ffmpeg arg construction and the claim/markDone/markError db
  helpers; a transcode smoke test on a small fixture clip (incl. an HEVC sample)
  asserting the output is H.264 + faststart.
- **Trigger**: SQL test inserting a fake `storage.objects` row for a `.mov` in
  `footage` asserts a `queued` row appears; a `.jpg` and a `footage-proxies`
  insert assert no row appears.
- **Panel**: the source→proxy mapping picks the proxy when `done` and falls back
  otherwise; "Optimizing…" hint shows only for `queued`/`processing`.

## Rollout

1. Create `footage-proxies` bucket + RLS (dashboard, verify in prod).
2. Create `footage_proxies` table + trigger (dashboard, verify in prod).
3. Deploy render-worker with the new job type (VPS).
4. Ship the panel changes (auto-deploy via CI).
5. Verify end-to-end with a fresh iPhone `.MOV` upload.

## Open Implementation Details (resolved during planning)

- Exact `scale` guard so sub-720p sources aren't upscaled.
- Whether to store proxy width/height for the panel's aspect calc (vs reading from
  the proxy on load).
- Worker poll ordering / fairness across three queues.
