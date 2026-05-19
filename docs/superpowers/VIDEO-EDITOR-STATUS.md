# Video Editor — Status

_Last updated 2026-05-18. Branch: `feat/video-editor-phase-1`. Latest commit: `1204d7a`._

In-browser video editor for the connectacreators app. Open a video edit from `/editor` or any editing-queue row → trim, transcribe, cut silences, generate captions, export an MP4 with the captions burned in.

---

## Phase status

| Phase | Scope | Status |
|---|---|---|
| **1 — Trim & export** | Single-source EDL, drag-handle trim, render job → MP4 in Storage | ✅ Shipped |
| **2 — Transcription & silences** | Whisper word timestamps, ffmpeg silencedetect, "Remove all silences" | ✅ Shipped |
| **3 — Captions** | 3 presets (TikTok/Reels/Shorts), auto + manual, live preview, ASS burn-in, full manipulation | ✅ Shipped |
| **4 — Text overlays** | Title cards / lower-thirds / CTAs (static text, presets, positions) | ⏳ Not started |
| **5 — Music + aspect reframe** | Background audio track, real 9:16/1:1/16:9 conversion | ⏳ Not started |
| **6 — B-roll / second video track** | Drop a second clip onto the timeline above the main one | ⏳ Not started |

Spec lives at `docs/superpowers/specs/2026-05-16-video-editor-design.md`. Original Phase 1 plan at `docs/superpowers/plans/2026-05-16-video-editor-phase-1.md`.

---

## What works end-to-end right now

1. From `/editor` (or any editing-queue "Open editor" menu item) you land in the full-screen editor at `/editing/:id/edit`.
2. The editor auto-creates an `editor_projects` row (1:1 with `video_edits.id`) and loads its EDL with autosave.
3. A `transcribe-job` is auto-queued on first open if no transcript exists. The local worker downloads the video, extracts mp3 audio via ffmpeg, calls OpenAI Whisper, writes `transcripts` + `silence_segments`.
4. The right-side **Transcript** panel shows words with click-to-seek + active-word highlight. **Remove all silences** + **Auto captions (3 styles)** + drag-select to make a single caption.
5. Each caption block can be: resized (slider 38–200%), restyled, repositioned (presets or dragged on the preview), reordered (timeslot swap), split between any two words, individual words double-clicked to edit. There's also a global "All blocks" card that fans size/style changes out to every block.
6. **Export** → `editor-job` edge function enqueues a `render_jobs` row → worker writes a `.ass` subtitle file → ffmpeg trim/concat + `subtitles` filter burns captions into the final MP4 → uploaded to `footage` bucket → signed URL with `?download=<title>.mp4` returned for direct save-as.

---

## Architecture

### Routes
- `/editor` — list of every `video_edits` row with footage (`Editor.tsx`, sidebar item "Editor" + Film icon).
- `/editing/:id/edit` — the editor itself (`VideoEditor.tsx`). Standalone, not under DashboardLayout.
- `/editing-queue` and `/clients/:clientId/editing-queue` — existing queue pages, both now have an **Open editor** row menu item.

Feature gate: `IS_VIDEO_EDITOR_ENABLED` from `src/lib/videoEditor/featureGate.ts` (driven by `VITE_FEATURE_VIDEO_EDITOR=true` in `.env.local`).

### DB tables (all admin-only RLS via `is_admin()`)

| Table | Migration | Purpose |
|---|---|---|
| `editor_projects` | `20260516_a01_video_editor_phase1.sql` | 1:1 EDL state per `video_edits` row, autosaved |
| `render_jobs` | `20260516_a01_video_editor_phase1.sql` | Render queue (status/progress/output_storage_path) |
| `transcripts` | `20260518_a01_video_editor_phase2.sql` | One Whisper transcript per `video_edits` row, words JSONB |
| `silence_segments` | `20260518_a01_video_editor_phase2.sql` | Detected silence ranges in SOURCE time |
| `transcribe_jobs` | `20260518_a01_video_editor_phase2.sql` | Transcription queue mirroring render_jobs shape |

### Edge functions

| Function | Path | Purpose |
|---|---|---|
| `editor-job` | `supabase/functions/editor-job/index.ts` | Enqueues a `render_jobs` row; CORS preflight handled |
| `transcribe-job` | `supabase/functions/transcribe-job/index.ts` | Enqueues a `transcribe_jobs` row (no-op if transcript already exists) |

Both deploy with `--no-verify-jwt` per project convention.

### Worker (`render-worker/`)

Single Node process polling both queues every 4s. Source files:

- `src/index.ts` — main loop; render jobs first, transcribe jobs second.
- `src/db.ts` — supabase-js client + queue claim/update helpers (uses `ws` polyfill for Node 20).
- `src/storage.ts` — download + upload helpers.
- `src/render.ts` — ffmpeg filter graph builder (trim + concat + optional `subtitles` filter).
- `src/transcribe.ts` — ffmpeg audio extract → Whisper POST → ffmpeg silencedetect parser.
- `src/captions.ts` — ASS file generator (per-word `\kf` karaoke, source→output time mapping, per-caption `\fs` size override).

Tests under `render-worker/src/*.test.ts` (vitest, 8 cases). Run `npm test` in `render-worker/`.

### Frontend EDL & helpers

- `src/lib/videoEditor/edl.ts` — EDL type, helpers: `emptyEDL`, `totalDurationMs`, `sourceTimeToEdlTime`, `clipsFromSilences`, `captionsFromTranscript`.
- `src/lib/videoEditor/captionPresets.ts` — preset specs (font, fill, stroke, bg, fontSizePctHeight) + `toPreviewStyle()` for the browser overlay.
- `src/lib/videoEditor/featureGate.ts` — gate flag.

### Key React components

- `src/pages/VideoEditor.tsx` — orchestrates everything: source loading, EDL state, transcript, captions, export.
- `src/components/videoEditor/EditorTopBar.tsx` — back to `/editing-queue`, title, save status, Export.
- `src/components/videoEditor/PreviewStage.tsx` — `<video>` + caption overlay + per-frame rAF playhead (jumps across removed silence gaps).
- `src/components/videoEditor/CaptionOverlay.tsx` — absolute-positioned overlay tied to the video's picture box, draggable to reposition.
- `src/components/videoEditor/TrimTimeline.tsx` — bottom-bar trim handles.
- `src/components/videoEditor/TranscriptPanel.tsx` — words list with drag-select, click-to-seek, auto-caption buttons.
- `src/components/videoEditor/CaptionsList.tsx` — per-block manipulation panel (word strip, style, size slider, position, order, split, delete) + global "All blocks" card.
- `src/components/videoEditor/ExportDialog.tsx` — aspect picker, progress, Preview/Download, Render again.

### Hooks

- `src/hooks/useEditorProject.ts` — loads/saves `editor_projects.edl` with autosave debouncing.
- `src/hooks/useRenderJob.ts` — submits render jobs, polls, exposes `reset()` so the dialog returns to the picker after a finished run.
- `src/hooks/useTranscript.ts` — fetches transcripts/silences, polls `transcribe_jobs` while running.

---

## Running locally

```bash
# Frontend
npm run dev                                # vite on :8080

# Worker (separate terminal — reads render-worker/.env.local)
cd render-worker && npm run dev
```

`render-worker/.env.local` (gitignored) must contain:

```
SUPABASE_URL=https://hxojqrilwhhrvloiwmfo.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role>
SUPABASE_STORAGE_BUCKET=footage
SUPABASE_OUTPUT_BUCKET=footage
OPENAI_API_KEY=<openai>
POLL_INTERVAL_MS=4000
WORK_DIR=/tmp/connecta-renders
SILENCE_NOISE_DB=-30
SILENCE_MIN_MS=400
```

Repo root `.env.local` needs `VITE_FEATURE_VIDEO_EDITOR=true` to expose the editor routes + sidebar item.

---

## Recent decisions & non-obvious things

- **Worker is local-only right now.** No VPS deploy yet. The Mac running `npm run dev` in `render-worker/` is the only consumer of the queue. Phase 5+ will likely push this to the existing VPS.
- **Audio extraction before Whisper.** Whisper's 25MB API limit blocks raw mp4 uploads for typical videos. The worker extracts mono 16kHz 64kbps mp3 first (~480KB/min), well under the limit even for 30-minute talks.
- **Silence detection runs on the extracted audio**, not the original — `ffmpeg silencedetect=noise=-30dB:d=0.4`, then stderr parsed for `silence_start` / `silence_end`.
- **Caption preset sizes are a percentage of frame height, not raw pixels.** A single `fontSizePctHeight` per preset drives both browser preview CSS and the worker's ASS PlayResY=1080 `\fs` value. Per-caption `size` (37.5–200%) multiplies on top via `\fs<int>` override.
- **Anthropic API can't do transcription.** It's text+image only. OpenAI Whisper (or Deepgram) is the only option for the speech-to-text step. Anthropic will earn its keep in Phase 3+ extensions (smart caption rewording, auto-cut suggestions) but not here.
- **Playback across removed silence gaps was broken until commit `7fdebd4`** — the per-frame tick now hops to the next clip's start when sourceMs lands in a gap. This was the "remove silences only plays the first sentence" bug.
- **CORS preflight** is handled via `supabase/functions/_shared/cors.ts` (already existed for other edge functions). Both `editor-job` and `transcribe-job` import it.
- **Render result URLs use Supabase's `?download=<filename>`** trick so the browser saves to disk instead of streaming inline. Preview and Download are separate anchors in `ExportDialog`.
- **The Shorts preset is white-fill + black-outline + Impact** — user feedback rejected the yellow-stroke version.
- **Merge button was removed** by user feedback — Split (✂ between words) is the more useful inverse for fixing auto-caption chunking.

---

## Open caveats / known issues

- **Font rendering parity** between browser preview and ffmpeg ASS depends on whichever fonts ffmpeg's libass resolves via fontconfig. Impact, Inter, and Helvetica usually exist on macOS; on a Linux VPS they may fall back to DejaVu unless we install them. Will need to bundle a font directory + `fontsdir` option when we deploy the worker to the VPS.
- **No undo.** Every EDL mutation autosaves. If a user splits/edits a caption wrong, the only recovery is manual. Consider a small in-memory undo stack later.
- **Drag-on-preview position is per-caption.** Moving one caption doesn't move the others; use the "All blocks → Style/Size" card for fan-out, but there's no "Pos: all" yet. Easy add if needed.
- **Reorder swaps both blocks' timeslots.** That can desync caption text from speech if the user reorders captions whose words come from different parts of the transcript. The arrows are useful for ordering manual blocks; the auto-caption flow shouldn't need them.
- **Aspect ratio picker in Export.** The buttons are wired but the worker still always renders at the source aspect — actual reframing is Phase 5.

---

## How to resume

1. Read this file.
2. Make sure `render-worker` and vite are both running (see "Running locally").
3. Open `/editor` and click a video → exercise the full flow: trim, transcript, silences, captions, export.
4. Next phase: **Phase 4 (text overlays)**. Spec is in `docs/superpowers/specs/2026-05-16-video-editor-design.md` under section "Phase 4". Pattern follows captions: EDL adds `text_overlays[]`, frontend gets an overlay editor + draggable preview, worker generates an additional ASS file (or extends the same one) for the static text.

Phase 4-6 are independent enough that they can be picked up in any order. Phase 5 (music) is the smallest standalone effort if a quick win is needed first.
