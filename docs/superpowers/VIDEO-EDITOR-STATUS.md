# Video Editor — Status

_Last updated 2026-05-19. Branch: `feat/video-editor-phase-1`. Latest commit: `00a1171`._

In-browser video editor for the connectacreators app. Open a video edit
from `/editor` or any editing-queue row → trim, transcribe, cut silences,
generate captions, drop text overlays + b-roll, set background music, and
export an MP4 with everything burned in.

---

## Phase status

| Phase | Scope | Status |
|---|---|---|
| **1 — Trim & export** | Single-source EDL, drag-handle trim, render job → MP4 in Storage | ✅ Shipped |
| **2 — Transcription & silences** | Whisper word timestamps, ffmpeg silencedetect, "Remove all silences" | ✅ Shipped |
| **3 — Captions** | 3 presets, auto + manual, live preview, ASS burn-in, full manipulation | ✅ Shipped |
| **4 — Text overlays** | 3 user-spec presets (TikTok / Helvetica / Impact), draggable on preview, double-click to edit inline | ✅ Shipped |
| **5 — Music + aspect reframe** | Background audio (upload OR import-from-URL via VPS yt-dlp), volume, real 9:16/1:1/16:9 reframe | ✅ Shipped |
| **6 — B-roll / second video track** | Upload secondary video, fullscreen + PIP modes, multi-clip, b-roll plays in preview | ✅ Shipped |
| **CapCut-style timeline (A–D)** | Multi-track timeline, selection, drag, trim, split, copy/cut/paste/duplicate, zoom, right-click menu, ruler scrub | ✅ Shipped |
| **7 — AI wiring on `/ai`** | Edge function / tool that builds EDL JSON from a script for Robby | ⏳ Pending (last phase) |

Spec lives at `docs/superpowers/specs/2026-05-16-video-editor-design.md`.
The CapCut-style timeline plan: `docs/superpowers/specs/2026-05-19-capcut-style-timeline-plan.md`.
EDL schema reference for Robby/AI consumption: `docs/superpowers/VIDEO-EDITOR-EDL-SCHEMA.md`.

---

## What works end-to-end right now

The complete user flow:

1. **Pick a video** from `/editor` or any editing-queue row → lands on `/editing/:id/edit`.
2. **Auto-transcription** kicks off on first open. Whisper word timestamps + ffmpeg silence detection populate `transcripts` and `silence_segments`.
3. **Right panel** (5 tabs): Script / Captions / Text / Music / B-roll.
   - Script: transcript with click-to-seek, drag-select to make a caption block, "Auto captions" buttons, "Remove all silences".
   - Captions: dedicated panel with "Apply to all" toggle, per-block size slider, position presets, style picker, drag-reorder.
   - Text: 3 presets (TikTok/Helvetica/Impact), add at playhead button, per-overlay editing.
   - Music: upload OR paste a TikTok/IG/YT URL — VPS yt-dlp extracts the audio.
   - B-roll: upload a second video, choose Full / PIP, set placement + trim.
4. **Multi-track timeline** below the preview shows everything (every clip, captions, text, b-roll, music) on a shared source-time axis with ruler scrub + zoom.
5. **Live preview** plays the source video with captions, text overlays, b-roll cutaways, and music — all synced to the playhead.
6. **Export** queues a `render_jobs` row → local worker downloads everything, runs the ffmpeg filter graph (trim + concat + reframe + b-roll overlays + subtitle burn-in + music mix), uploads the MP4 back to Storage, returns a download link.

---

## Architecture

### Routes
- `/editor` — list of editable videos.
- `/editing/:id/edit` — the standalone editor.
- `/editing-queue` and `/clients/:clientId/editing-queue` — both have "Open editor" row menu items.

Feature gate: `IS_VIDEO_EDITOR_ENABLED` via `VITE_FEATURE_VIDEO_EDITOR=true`.

### DB tables (admin RLS)

| Table | Purpose |
|---|---|
| `editor_projects` | 1:1 EDL state per `video_edits.id`, autosaved |
| `render_jobs` | Render queue |
| `transcripts` | One Whisper transcript per video |
| `silence_segments` | Detected silence ranges |
| `transcribe_jobs` | Transcription queue |
| `audio_import_jobs` | URL-import queue (synchronous via edge function) |

### Edge functions

| Function | Purpose |
|---|---|
| `editor-job` | Enqueues a `render_jobs` row |
| `transcribe-job` | Enqueues a `transcribe_jobs` row |
| `import-audio-from-url` | Synchronous — calls VPS `/extract-audio`, uploads to Storage, marks the `audio_import_jobs` row 'done' |

### Worker (`render-worker/`)

Polls render + transcribe queues every 4s. Source files:

- `src/index.ts` — main loop; render → transcribe priority order; orphan-job reclamation.
- `src/render.ts` — ffmpeg filter graph: trim → concat → reframe → b-roll overlays → subtitles → music mix.
- `src/captions.ts` — ASS file generator for captions + text overlays.
- `src/transcribe.ts` — audio extract → Whisper → silencedetect.
- `src/storage.ts` — Supabase Storage helpers.
- `src/db.ts` — queue mutators, orphan reclamation.

Bundled fonts: `render-worker/assets/fonts/{Inter-Bold, Inter-Black, Montserrat-Black, Anton-Regular}.ttf`. ffmpeg sees them via `fontsdir=` on the subtitles filter.

### Frontend EDL & helpers

- `src/lib/videoEditor/edl.ts` — full EDL type + helpers (`emptyEDL`, `totalDurationMs`, `sourceTimeToEdlTime`, `edlOutputTimeToSourceTime`, `clipsFromSilences`, `captionsFromTranscript`).
- `src/lib/videoEditor/captionPresets.ts` — 3 caption preset specs (browser CSS + worker ASS).
- `src/lib/videoEditor/textOverlayPresets.ts` — 3 text-overlay preset specs.
- `src/lib/videoEditor/featureGate.ts` — gate flag.

### Key components

- `src/pages/VideoEditor.tsx` — orchestrates everything; selection state; clipboard; keyboard shortcuts.
- `src/components/videoEditor/PreviewStage.tsx` — `<video>` + music `<audio>` + caption overlay + b-roll overlay.
- `src/components/videoEditor/CaptionOverlay.tsx` — caption + text-overlay rendering on the preview (drag, double-click edit, resize handle).
- `src/components/videoEditor/BRollPreview.tsx` — per-b-roll `<video>` element synced to the playhead.
- `src/components/videoEditor/MultiTrackTimeline.tsx` — 5-track timeline (Video / Captions / Text / B-roll / Music). VideoClipBlock / CaptionBlock / OverlayBlock / BRollBlock components.
- `src/components/videoEditor/TranscriptPanel.tsx` — Script tab.
- `src/components/videoEditor/CaptionsPanel.tsx` — Captions tab.
- `src/components/videoEditor/TextOverlaysPanel.tsx` — Text tab.
- `src/components/videoEditor/MusicPanel.tsx` — Music tab (upload + URL import).
- `src/components/videoEditor/BRollPanel.tsx` — B-roll tab.
- `src/components/videoEditor/ExportDialog.tsx` — aspect picker + progress + Preview/Download.

### Hooks

- `src/hooks/useEditorProject.ts` — load/save `editor_projects.edl` with autosave.
- `src/hooks/useRenderJob.ts` — submit/poll render jobs.
- `src/hooks/useTranscript.ts` — fetch transcript + poll transcribe jobs.
- `src/hooks/useAudioImport.ts` — submit/poll audio-import jobs.

---

## Timeline UX (CapCut-style, Phase A → D shipped)

| Action | How |
|---|---|
| Select | Click any block. Yellow ring. |
| Deselect | Click whitespace OR Esc. |
| Drag in time | Drag body of any block. |
| Trim edges | Click block to select → drag the left or right edge. |
| Multi-clip video | Every `edl.clip` is its own block. After "Remove all silences" you get many segments, all individually editable. |
| Split at playhead | `S` key with a video clip / caption / b-roll selected. |
| Copy / Cut / Paste | `Cmd/Ctrl + C / X / V`. Paste anchors at the playhead. |
| Duplicate | `Cmd/Ctrl + D`. Video clips → inserts a copy after the original. Others → paste copy. |
| Delete | `Delete` / `Backspace`. Video keeps at least one clip. |
| Seek / scrub | Click or drag along the time ruler. |
| Zoom | `Cmd/Ctrl + scroll` over the timeline (1×–8×). |
| Right-click menu | Same actions as keyboard shortcuts. |

Inputs / contenteditable text are excluded from keyboard shortcuts so caption-word editing doesn't trigger them.

---

## Running locally

```bash
# Frontend
npm run dev                                # vite on :8080

# Worker (separate terminal — reads render-worker/.env.local)
cd render-worker && npm run dev
```

`render-worker/.env.local` (gitignored):

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

Repo root needs `VITE_FEATURE_VIDEO_EDITOR=true`.

VPS at `http://72.62.200.145:3099` (yt-dlp service) handles audio-from-URL imports via `/extract-audio` — same endpoint `transcribe-canvas-media` uses.

---

## Open issues / next-session work

These are the things the user reported in the session that ended around
commit `00a1171` but didn't get fixed before compact:

1. **B-roll fullscreen clip not editable in timeline.** The user says they can't make a fullscreen b-roll "longer or shorter or cut or trim or duplicate." Tracker:
   - Trim handles exist (left + right edges in `BRollBlock`, shipped commit `10591c4`) and only appear when selected.
   - Possible cause: clip body might be too narrow, OR the trim handles drag math uses `totalSourceMs` (main video) instead of b-roll source — visually changing trim by 1px shifts trim_end_ms by `totalSourceMs/trackWidth` ms, which is huge for short b-rolls.
   - Suggested fix: tighten the trim drag scale for b-roll specifically (use a finer scale, or expose a separate trim-in-source-of-broll knob).
   - Also: split (`S` key) on a fullscreen b-roll works via `handleSplitBRoll` — verify Cmd-D duplicate inserts the clone with offset output_start so it doesn't overlap.

2. **"Remove all silences" doesn't actually trim dead air.** The user expects clicking it to compress the timeline by skipping silent ranges. Today it:
   - Reads `transcriptState.silences` (must be transcribed first).
   - Calls `clipsFromSilences(duration_ms, silences)` → returns an array of non-silent clip ranges.
   - Sets `edl.clips = those ranges`.
   - With the multi-clip Video track now shipped, each non-silent range shows as its own block.
   - Possible cause: transcription wasn't complete when the user clicked, OR `silence_segments` table is empty, OR clips were generated but the preview shows them as one wide block instead of multiple gapped blocks.
   - Suggested debug: query `silence_segments` for this `video_edit_id`, inspect the resulting `edl.clips`, verify the timeline shows multi-clip after the click.

3. **Caption / b-roll trim handles only appear when selected** — that's deliberate (Phase D fix for narrow blocks), but it may not be obvious. UX hint: when no item is selected, show a "Click any block to edit" hint somewhere.

---

## Phase 7 — AI wiring (not started)

EDL is already AI-friendly — every editor mutation is JSON. Robby just
needs to write to `editor_projects.edl`. The plan is to wire a tool into
`companion-chat` that:

1. Takes (`video_edit_id`, `instructions` or structured fields)
2. Reads the current EDL + transcript
3. Generates a new EDL (Claude-prompted with `VIDEO-EDITOR-EDL-SCHEMA.md` as system context)
4. Writes it back to `editor_projects.edl`

Existing infrastructure to lean on:
- `companion-chat` already has a tool-use loop (`build-tool-handlers.ts`).
- `viral-video-analyzer.ts` shows the pattern for calling VPS endpoints from edge functions.
- Schema doc has a "How Robby uses this" section + a full action-to-EDL-mutation table.

---

## How to resume in a fresh session

1. **Read this file** (you're doing it).
2. Check the latest commits:
   ```bash
   git log --oneline feat/video-editor-phase-1 -20
   ```
3. Start the dev environment:
   ```bash
   npm run dev                         # vite on :8080
   cd render-worker && npm run dev    # worker
   ```
4. Refer to `docs/superpowers/VIDEO-EDITOR-EDL-SCHEMA.md` for the full EDL spec.
5. Refer to `docs/superpowers/specs/2026-05-19-capcut-style-timeline-plan.md` for the timeline design and deferred items (snap-to-edges, multi-select, audio waveform).
6. **Top of the queue for next session**:
   - Reproduce the b-roll trim issue with the user; tighten `BRollBlock` trim drag math.
   - Reproduce "Remove all silences" no-op; check `transcripts` + `silence_segments` rows, then verify `handleRemoveSilences` populates multiple clips and the timeline renders them.
   - Then Phase 7 — wire Robby on `/ai` to build EDLs from scripts.

The user has been moving fast through requirements. Default to shipping
fixes / commits quickly and asking for clarification only when a UX
decision is genuinely ambiguous.
