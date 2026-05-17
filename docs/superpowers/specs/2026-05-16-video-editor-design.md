# In-App Video Editor — Design Spec

**Date:** 2026-05-16
**Branch context:** feat/ai-live-broadcast (this work would land on its own branch)
**Status:** Approved scope, pending implementation plan

---

## 1. Goal

Add a simple, web-based video editor to ConnectACreators so anyone with access to a `video_edits` row can trim, caption, score, and export a short-form video — without leaving the app. The editor is intentionally narrow: it covers the things creators actually do for IG Reels / TikTok / Shorts, and nothing else.

A future v1.1 layers AI script alignment on top of the same surface, but v1 keeps the AI work limited to silence detection and word-timed transcription.

## 2. Users & Access

Anyone who can already open the video_edits row. No new role gates in v1 — same access rules as `EditingQueue` / `MasterEditingQueue`.

The editor opens from a `video_edits` row via a new "Edit" action and lives at `/editing/:id/edit` (full-screen route, dark theme). FKs in this spec reference `video_edits.id` — the table backing the editing-queue UI.

## 3. Scope

### In scope (v1)

- Multi-clip timeline (add, reorder, trim, split clips from a single source MP4)
- One-click silence/dead-air removal driven by `silencedetect` output
- Word-by-word captions in IG / TikTok / Reels-style presets, auto-timed from a server-side transcript
- Static text overlays in the same caption presets
- Music: upload an audio file from the browser, place it on a music track, set volume
- Export to 9:16 (primary), 1:1, and 16:9
- Save / load EDL state per video_edits row
- Render job status with progress, error reporting, and a downloadable result that writes back to the video_edits row's storage URL

### Out of scope (v1)

- AI script alignment / retake detection (deferred to v1.1)
- B-roll auto-suggestion library
- Multi-track video (only one video track; clips concat in sequence)
- Color grading, filters, transitions beyond hard cuts
- Visual effects, keyframe animation
- Built-in music library (only user-uploaded audio in v1; library is a later add)
- Mobile/touch optimization (desktop-first; mobile is "view export results" only)

## 4. Architecture

Three layers, each with a single responsibility.

### 4.1 Browser editor (React)

Built into the existing Vite/React app. New route: `/editing/:id/edit`.

- Pure EDL builder — *nothing is rendered locally*. The browser produces a JSON Edit Decision List and previews it live using an HTML5 `<video>` element plus a canvas overlay for captions/text.
- Preview correctness comes from a single source of truth: the same caption rendering function runs in the browser preview canvas and is serialized into FFmpeg `ass` subtitle format for the server render. Same timing data, same styling.
- State managed locally with React state + a small reducer; persisted to a new `editor_projects` table tied to `video_edits.id`. Autosave on every change (debounced).

Key components:

- `VideoEditorPage` — full-screen route shell, loads project state.
- `EditorTopBar` — back link, title, save indicator, Export button.
- `ToolRail` — left icon rail (Cut, Caption, Music, Text, Clips).
- `PreviewStage` — `<video>` + canvas overlay; respects aspect ratio.
- `TranscriptPanel` — right column; click-to-seek, strikethrough silences are kept-or-removed toggles, drag-select to create caption.
- `Timeline` — bottom; three tracks (Video, Captions, Music) with draggable/trimmable blocks.
- `ExportDialog` — aspect ratio + format picker, submits to Edge Function.

### 4.2 Supabase Edge Function `editor-job`

Thin orchestration layer. Validates EDL, writes a `render_jobs` row, returns `job_id`. Browser subscribes to job status via Supabase Realtime (or short-polls if Realtime isn't trivially available on that table).

A second function `transcribe-footage` runs on footage upload (or on first-open of the editor for legacy footage). It calls the chosen transcription API (Deepgram or OpenAI Whisper — picked at implementation time based on cost / word-timestamp quality), and writes `transcripts` + `silence_segments` rows.

### 4.3 VPS render worker

A long-running Node process on the existing VPS (the one we deploy via `./deploy-expect.sh`). FFmpeg is already available there and there's no Edge-Function wall-clock limit. The worker:

1. Polls `render_jobs` for `status = 'queued'`, claims with `update ... returning` to avoid races.
2. Downloads source MP4 from Supabase Storage.
3. Generates an `.ass` subtitle file from the EDL caption track (using the same style presets the browser previewed).
4. Builds an FFmpeg `filter_complex`:
   - Trim and concat the video segments (per `clips[]`).
   - Apply the `ass` subtitle filter for burned-in captions.
   - Apply a `drawtext` chain (or extend the `ass` file) for static text overlays.
   - Mix audio: original video audio + uploaded music (`amix`), with per-track volume.
   - Apply silence cuts (these are just additional clip splits in the timeline — they become part of the concat list, not a separate filter).
   - Scale/pad/crop to target aspect ratio.
5. Uploads the resulting MP4 back to Supabase Storage, sets `render_jobs.status = 'done'`, writes the storage URL to the video_edits row.

The worker runs as a systemd service on the VPS, restartable, logged. Same deploy script ships it alongside any other VPS services.

## 5. Data Model

Four new tables, all RLS-scoped to existing access on `video_edits`.

### `editor_projects`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | pk |
| `video_edit_id` | uuid | fk, unique — one project per queue item |
| `edl` | jsonb | full EDL document (see below) |
| `updated_at` | timestamptz | autosave timestamp |
| `created_by` | uuid | |

### `transcripts`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | pk |
| `video_edit_id` | uuid | fk |
| `words` | jsonb | array of `{text, start, end, confidence}` |
| `provider` | text | `deepgram` / `openai` |
| `created_at` | timestamptz | |

### `silence_segments`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | pk |
| `video_edit_id` | uuid | fk |
| `start_ms` | int | |
| `end_ms` | int | |
| `min_duration_ms` | int | the silencedetect threshold used |
| `noise_db` | int | the noise floor used |

### `render_jobs`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | pk |
| `editor_project_id` | uuid | fk |
| `edl_snapshot` | jsonb | frozen EDL at job submit time |
| `status` | text | `queued` / `running` / `done` / `error` |
| `progress` | int | 0–100, written by worker |
| `error_message` | text | nullable |
| `output_storage_path` | text | nullable |
| `aspect_ratio` | text | `9:16` / `1:1` / `16:9` |
| `created_at` | timestamptz | |
| `claimed_at` | timestamptz | nullable |
| `finished_at` | timestamptz | nullable |

### EDL shape

```jsonc
{
  "source": { "storage_path": "footage/abc.mp4", "duration_ms": 240000 },
  "aspect_ratio": "9:16",
  "clips": [
    { "id": "c1", "source_start_ms": 0, "source_end_ms": 8500 },
    { "id": "c2", "source_start_ms": 9200, "source_end_ms": 22000 }
  ],
  "captions": [
    {
      "id": "cap1",
      "preset": "tiktok_word_pop",   // or "ig_reels_classic", "shorts_bold"
      "words": [
        { "text": "EVERY", "start_ms": 0, "end_ms": 300 },
        { "text": "CREATOR", "start_ms": 300, "end_ms": 700 }
      ],
      "position": { "x_pct": 50, "y_pct": 80, "anchor": "center" }
    }
  ],
  "text_overlays": [
    {
      "id": "t1",
      "preset": "tiktok_word_pop",
      "text": "FREE GUIDE",
      "start_ms": 5000,
      "end_ms": 9000,
      "position": { "x_pct": 50, "y_pct": 20, "anchor": "center" }
    }
  ],
  "music": {
    "storage_path": "music/user/abc.mp3",
    "start_ms": 0,
    "volume": 0.3
  }
}
```

## 6. UI Layout

Full-screen route, dark theme. Four regions:

- **Top bar (44px)** — back to queue, title, autosave status, Export button.
- **Tool rail (60px left)** — icon buttons: Cut, Caption, Music, Text, Clips. Selecting a tool changes the right panel and the timeline interaction.
- **Preview stage (center, flex)** — `<video>` element scaled to the project's aspect ratio, canvas overlay for captions/text. Time scrubber + play below.
- **Right panel (280px)** — defaults to the Transcript view. Click any word to seek. Strikethrough words inside `silence_segments` toggle "keep this silence." Drag-select a span of words to "make a caption from this." Tools other than Cut/Caption swap this panel for their controls (e.g., Music shows the upload + volume slider).
- **Timeline (bottom, ~140px)** — three tracks (Video, Captions, Music) with a ruler. Drag to move clips, drag handles to trim, click to select. Snap to caption word boundaries.

See `layout.html` in the brainstorm session for the rendered mockup.

## 7. Render Pipeline Detail

### Silence detection

Runs once per source clip via the worker (triggered on transcription completion). Command shape:

```
ffmpeg -i input.mp4 -af silencedetect=noise=-30dB:d=0.4 -f null -
```

Parse stderr for `silence_start` / `silence_end`, write `silence_segments` rows. Defaults: −30 dB, 400 ms minimum. The browser editor can re-trigger detection with different thresholds.

### Captions / Text overlays

Generated as a single `.ass` file per render job. ASS supports per-word `\k`-style timing and per-style fonts, strokes, shadows, positions — which covers IG / TikTok / Reels caption looks without writing a custom overlay renderer. We define a small palette of presets:

- `tiktok_word_pop` — bold sans, white fill on highlighted word's black background; surrounding words white with black stroke.
- `ig_reels_classic` — Helvetica-ish, all-caps, white on translucent black pill.
- `shorts_bold` — yellow stroke, black fill, drop shadow.

A preset is a small data structure (font, fill, stroke, background, position rules); the same data drives both the browser canvas preview and the `.ass` style block.

### Audio mixing

```
[0:a]volume=1.0[va];
[1:a]volume=0.3[ma];
[va][ma]amix=inputs=2:duration=longest[a]
```

Where `[0]` is the concat'd video and `[1]` is the music file (delayed to its start_ms via `adelay`).

### Aspect ratio handling

Source footage is whatever the user uploaded. The export target is one of 9:16 / 1:1 / 16:9. For target ≠ source, the worker applies `scale,pad` (letterbox/pillarbox, fill color from preset) or `scale,crop` (smart-center) based on a user toggle in the Export dialog. Default: pad.

## 8. Phased Ship

Each phase ends with something demoable.

- **Phase 1 — Pipeline shell (~1.5 wk).** Route, layout shell, single-clip trim, Export button. Worker renders a trimmed clip end-to-end. No captions, no transcript, no music.
- **Phase 2 — Transcript + silence removal (~1 wk).** `transcribe-footage` function, `TranscriptPanel`, click-to-seek, silence-segment toggles, "Remove all silences" one-click action.
- **Phase 3 — Captions (~1.5 wk).** Three preset styles, browser canvas preview, `.ass` generation in worker, drag-select-from-transcript to create.
- **Phase 4 — Music (~0.5 wk).** Upload to Storage, music track on timeline, `amix` in worker, volume slider.
- **Phase 5 — Static text overlays + export polish (~0.5 wk).** Text overlay tool using caption presets, aspect-ratio picker in Export dialog, smart-crop vs pad toggle.

Total: ~5 weeks of focused work for v1.

## 9. Open Questions / Risks

- **Transcription provider choice.** Deepgram has stronger word-timestamps and lower cost per minute; OpenAI Whisper has zero infra setup and a single API key. Decision at Phase 2 start.
- **ASS feature parity in browser preview.** ASS supports more styling than HTML canvas can trivially match. Mitigation: lock caption presets to a subset that's representable in both, and write a small test suite that compares preview canvas output to a one-frame FFmpeg render to catch drift.
- **VPS worker capacity.** A single worker handles one render at a time. If two team members hit Export simultaneously the second waits. Acceptable for v1 (small team); we add a second worker process via systemd if/when queue depth becomes a problem.
- **Source MP4 reliability.** Some footage in `EditingQueue` lives in external storage (Notion, Drive). The worker assumes Supabase Storage. Phase 1 should include a "move source to Storage" step if the video_edits row isn't already there.
- **Realtime vs polling for job status.** Realtime on `render_jobs` is nicer UX but adds a Supabase setup step. Phase 1 ships with 2-second polling; we upgrade to Realtime if it feels laggy.

## 10. Non-Goals

This editor will not become Premiere or CapCut. If a future need pushes us toward multi-track video, color, or heavy effects, we hand off to a desktop tool — we don't grow the in-app editor past simple short-form work.
