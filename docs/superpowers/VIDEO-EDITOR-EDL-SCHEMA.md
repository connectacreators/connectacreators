# Video Editor — EDL Schema (AI-Controllable Surface)

The video editor is a **pure function** on a JSON document stored in
`public.editor_projects.edl` (one row per `video_edits.id`). Every editor
UI action is a mutation on this JSON. The render worker reads the same
JSON to produce the final MP4.

**Robby and other AI agents can edit videos by writing this JSON directly.**
There is no "private" or "UI-only" state — the EDL is the full spec.

This document is the single source of truth for that schema. Keep it
up-to-date as new features land.

---

## Top-level shape

```jsonc
{
  "source": {
    "storage_path": "<clientId>/<videoEditId>/<filename>.mp4",
    "duration_ms": 240000
  },
  "aspect_ratio": "source",        // "source" | "9:16" | "1:1" | "16:9"
  "clips":         [ /* trim ranges */ ],
  "captions":      [ /* word-timed caption blocks */ ],
  "text_overlays": [ /* static text */ ],
  "music":         { /* optional background audio */ },
  "b_roll":        [ /* optional secondary video clips */ ]
}
```

Only `source`, `aspect_ratio`, and `clips` are required. Everything else
is optional and additive.

---

## `source`

```jsonc
{
  "storage_path": "abc-123/.../video.mp4",   // path in the `footage` bucket
  "duration_ms": 240000                       // probed once on first open
}
```

`storage_path` is the location of the source video inside Supabase
Storage's `footage` bucket. Don't put a full URL here — just the path.

---

## `aspect_ratio`

One of `"source"`, `"9:16"`, `"1:1"`, `"16:9"`. The worker uses
`scale=...:force_original_aspect_ratio=increase,crop=...` to cover then
crop. `"source"` is a pass-through.

Output dimensions:
| value | width | height |
|---|---|---|
| `9:16` | 1080 | 1920 |
| `1:1` | 1080 | 1080 |
| `16:9` | 1920 | 1080 |
| `source` | source dims | source dims |

---

## `clips[]`

Trim ranges in the source video that play, in order, in the output.

```jsonc
[
  { "id": "<uuid>", "source_start_ms": 7143, "source_end_ms": 12358 }
]
```

To keep the whole source: a single clip from 0 to `source.duration_ms`.
To "remove silences": split into many clips that skip the silent segments
(see `clipsFromSilences` in `src/lib/videoEditor/edl.ts`).

---

## `captions[]` (optional)

Per-word timed text. Burned in via the worker's ASS subtitles pipeline.

```jsonc
[
  {
    "id": "<uuid>",
    "preset": "tiktok_word_pop",     // "tiktok_word_pop" | "ig_reels_classic" | "shorts_bold"
    "size": 1.0,                      // multiplier on preset base font size (0.375–2.0)
    "position": {
      "x_pct": 50,                   // 0..100, horizontal anchor
      "y_pct": 80,                   // 0..100, where the BOTTOM of the text sits
      "anchor": "center"
    },
    "words": [
      { "text": "Hello",   "start_ms": 1000, "end_ms": 1400 },
      { "text": "world",   "start_ms": 1500, "end_ms": 1900 }
    ]
  }
]
```

**Times are in SOURCE time**, not output time. The worker maps each word
to its output position by walking `clips`. Words inside removed silence
ranges are dropped.

Presets:
- `tiktok_word_pop` — Montserrat Black, white fill + black outline, word-pop highlight
- `ig_reels_classic` — Inter Bold, white text on translucent black pill
- `shorts_bold` — Anton condensed, white fill + black outline

---

## `text_overlays[]` (optional)

Static text on top of the video. No per-word timing — appears for a fixed
SOURCE-time range and disappears.

```jsonc
[
  {
    "id": "<uuid>",
    "text": "FREE GUIDE",
    "preset": "cta_chip",            // "title_card" | "lower_third" | "cta_chip" | "subtle_caption"
    "start_ms": 18000,
    "end_ms":   22000,
    "position": { "x_pct": 50, "y_pct": 88, "anchor": "center" },
    "size": 1.0
  }
]
```

Presets:
- `title_card` — big bold title near the top of the frame
- `lower_third` — small label in the lower-left
- `cta_chip` — yellow pill banner, bottom-center
- `subtle_caption` — minimal label, place anywhere

---

## `music` (optional)

```jsonc
{
  "storage_path": "music/<videoEditId>/<filename>.mp3",
  "volume": 0.3,                      // 0..1, attenuated under source audio
  "music_start_ms": 0                  // optional, where in the file to start
}
```

Worker mixes with `amix`. Source audio stays at full volume.

---

## `b_roll[]` (optional)

Secondary video clips overlaid on the main timeline.

```jsonc
[
  {
    "id": "<uuid>",
    "source_storage_path": "broll/<videoEditId>/<filename>.mp4",
    "source_duration_ms": 15000,
    "trim_start_ms": 0,
    "trim_end_ms":   4000,           // play 4 seconds of this b-roll
    "output_start_ms": 8000,         // appear at output_ms=8s
    "mode": "fullscreen",            // "fullscreen" | "pip"
    "position": { "x_pct": 50, "y_pct": 50, "width_pct": 40 }
  }
]
```

- `fullscreen` → fully covers main video during its `[output_start_ms, output_start_ms + (trim_end-trim_start)]` window
- `pip` → small box at (x_pct, y_pct), width = `width_pct%` of main width

**B-roll times are in OUTPUT time** (after trim + reframe), not source.
B-roll audio is dropped in v1.

---

## How Robby uses this

1. **Read** the current EDL:
   ```sql
   select edl from editor_projects where video_edit_id = $1;
   ```

2. **Build a new EDL** in memory matching the desired video. Common
   recipes:

   - **Generate TikTok-style captions from a transcript:**
     - For each transcript word block, append a `Caption` with
       `preset: "tiktok_word_pop"`, `position: {x_pct:50, y_pct:80, anchor:"center"}`,
       `size: 0.8`, and the words array.

   - **Remove silences and shrink the video:**
     - Fetch `silence_segments` for the video.
     - Replace `clips` with the output of `clipsFromSilences(duration_ms, silences)`.

   - **Add a CTA at the end:**
     - Append a `text_overlay` with `preset: "cta_chip"`, text "FREE GUIDE",
       `start_ms: <last 5 seconds>`, `end_ms: <source duration>`, position
       `{x_pct:50, y_pct:88}`.

   - **Drop a b-roll cutaway over a specific sentence:**
     - Find the source time of the target sentence in the transcript.
     - Map it to OUTPUT time (walk `clips`).
     - Append a `BRollClip` with `mode: "fullscreen"` and that output time.

3. **Write** the new EDL back:
   ```sql
   update editor_projects set edl = $1, updated_at = now()
     where video_edit_id = $2;
   ```
   Or call the `build-editor-edl` edge function which validates first.

4. **Trigger a render** via the existing `editor-job` edge function (or
   leave the user to hit Export — they may want to review first).

---

## Editor capabilities — full action surface

Every UI action below maps to an EDL mutation. Robby can perform any of
these by writing EDL JSON.

| Action | EDL mutation |
|---|---|
| Trim video | Replace `clips[0]` (start/end) |
| Remove silences | Replace `clips` with non-silent ranges |
| Add caption block | Append to `captions[]` |
| Auto-caption from transcript | Replace `captions[]` with chunked transcript words |
| Change caption preset | Update `captions[i].preset` |
| Resize caption | Update `captions[i].size` |
| Move caption | Update `captions[i].position` |
| Edit caption text | Update `captions[i].words[j].text` |
| Split caption block | Split `captions[i].words` into two new caption blocks |
| Add text overlay | Append to `text_overlays[]` |
| Move/resize/retime overlay | Update `text_overlays[i].*` |
| Set background music | Set `music` field |
| Mute / remove music | Delete `music` field |
| Pick aspect ratio | Update top-level `aspect_ratio` |
| Add b-roll cutaway | Append to `b_roll[]` |
| Position/trim b-roll | Update `b_roll[i].*` |

Everything else is computed downstream by the worker from this JSON.

---

## Provisos / non-features

- **No undo.** Every EDL update overwrites. AI agents should write
  conservative diffs (preserve existing fields) and let the user review.
- **No multi-user collaboration.** Last writer wins on the EDL row.
- **B-roll audio is dropped** in v1. Only the source video's audio plays.
- **Drag-position is per-caption** unless the editor's "Apply to all"
  toggle is on. AI writing positions directly bypasses that toggle —
  the AI must explicitly write the same position to every caption block
  if it wants them aligned.
