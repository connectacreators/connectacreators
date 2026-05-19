# CapCut-Style Multi-Track Timeline — Plan

_Branch: `feat/video-editor-phase-1`. Builds on the
`MultiTrackTimeline.tsx` skeleton that landed in commit a82c6bd ff._

The current timeline shows all elements (video / captions / text /
b-roll / music) but only the video trim and overlay edges are draggable.
The user wants a full CapCut surface: **trim, copy, cut, paste, drag,
keyboard-shortcut everything** for every track. This doc lays out the
plan to get there.

---

## Goals

1. Every element on every track is **selectable**.
2. Selected element supports the full action set:
   - **Drag** (move in time)
   - **Trim** (drag the left/right edge to change start/end)
   - **Copy / Cut / Paste** (clipboard semantics)
   - **Delete** (Backspace / Delete key)
   - **Split** (`S` key — split at playhead)
   - **Duplicate** (`Cmd/Ctrl+D`)
3. B-roll specifically must be **draggable** on its own track (it's
   currently display-only because it lives in OUTPUT time on a SOURCE
   timeline; we'll add inverse mapping).
4. Multi-select with `Cmd/Ctrl+click` (stretch goal).

---

## Architectural decisions

### Track types

| Track | Time space | Mutable | Notes |
|---|---|---|---|
| **Video** | source | trim only | Always one clip from the source. Trim handles already work. |
| **Captions** | source | drag, trim, split, copy/paste, delete | A caption block is the unit. Drag shifts all words by Δ. Trim shifts only the first/last word's start/end. |
| **Text overlays** | source | drag, trim, copy/paste, delete | Already partly working in the new timeline. |
| **B-roll** | output | drag, trim (both internal trim and output position), copy/paste, delete | Stored in output time, displayed on source axis via inverse-map. |
| **Music** | source | drag (offset only), no copy | One global music track. |

### Selection model

Add `selectedTimelineItem: { type: "video" \| "caption" \| "text" \| "broll" \| "music"; id?: string } \| null` to `VideoEditor` state. Each block listens for click and sets selection. Selected block gets a yellow ring. Keyboard handlers attach to `document` and read from the selection.

### Clipboard

In-memory only (no system clipboard) for v1:
```ts
type TimelineClipboard = {
  kind: "caption" | "text" | "broll";
  payload: Caption | TextOverlay | BRollClip;  // deep copy
} | null;
```

Stored in a `useRef` so it survives re-renders without causing churn.

Paste places the copied item at the **current playhead**. New `id` (so it's an independent block) and timestamps shifted so its start equals the playhead.

### Drag math (already partially done)

`useTimeDrag(trackRef, totalSourceMs)` (already in
`MultiTrackTimeline.tsx`) emits `deltaMs` relative to drag-start. Each
block snapshots its original start/end at `mousedown` so cumulative
deltas don't accumulate. We keep that pattern.

### B-roll inverse mapping

The b-roll block needs three operations on the source-time axis:
1. **Display**: convert `output_start_ms` → source-time position via the
   existing `outputToSource` walk.
2. **Drag**: capture the source-time position on `mousedown`, on each
   move compute the new desired source-time position, then forward-map
   to output time using `sourceTimeToEdlTime` (already in `edl.ts`).
3. **Trim**: same conversion for the trailing edge.

Edge case: if the user drags a b-roll into a silence-cut range, snap to
the nearest valid output position (start of next clip).

### Keyboard shortcuts

Wire on the editor route's top-level container with `tabIndex={0}` so it
captures keys:
- `Backspace` / `Delete` → delete selected item
- `Cmd/Ctrl+C` → copy
- `Cmd/Ctrl+X` → cut (copy + delete)
- `Cmd/Ctrl+V` → paste at playhead
- `Cmd/Ctrl+D` → duplicate selected
- `S` → split selected at playhead (only meaningful for captions and
  b-roll right now — split=splice a block into two with the playhead as
  the boundary)
- `Space` → play / pause (already-bound in the play button; we just hook
  it globally too)
- `Esc` → clear selection

Inside contenteditable / inputs, all shortcuts no-op via
`e.target.isContentEditable` check.

---

## Implementation phases

### Phase A — selection + delete + drag-all (~half day)

1. Add `selectedTimelineItem` state in `VideoEditor`.
2. Generalize `MultiTrackTimeline` blocks to take `selected` boolean +
   `onSelect()` callback. Yellow ring when selected.
3. Wire `Backspace` / `Delete` key on the route container to call the
   right delete handler based on selection.
4. Add drag-to-move on the **B-roll block** (with output↔source mapping).
5. Add drag-to-move on the **caption block** (already shipped — just verify).

### Phase B — copy / cut / paste / duplicate (~half day)

1. Add `clipboardRef` and copy/cut/duplicate handlers.
2. Wire `Cmd/Ctrl+C/X/V/D` on the route container.
3. Paste creates a new item with a fresh `id` and timestamps shifted so
   start lands at the playhead. For captions, shift all word timestamps
   by the same delta. For text/b-roll, shift start/end. Clamp at source
   duration.

### Phase C — split + trim handles on all tracks (~half day)

1. Each non-music block gets left + right trim handles (already on
   text-overlay, extend to caption and b-roll).
2. For captions: trimming the left edge drops words whose `start_ms <
   newStart`. Trimming right drops words whose `end_ms > newEnd`. (Or
   shift the existing word timing — design choice; default: drop.)
3. Split (`S` key with a caption / b-roll selected):
   - Caption: find the first word whose `start_ms >= playheadSource`,
     split the words array there into two blocks. Same `id`-replace
     pattern as the existing `handleSplitCaption`.
   - B-roll: split the output-time range at the playhead, with two
     b-roll clips sharing the same source file but different trim and
     output positions.

### Phase D — polish (~quarter day)

1. Zoom in/out on the time axis (pinch / scroll-wheel + Cmd).
2. Snap-to-other-block (within 100ms of any edge).
3. Visible playhead head + scrubber (drag the ruler to seek).
4. Multi-select with `Cmd/Ctrl+click` (selected items move together).
5. Right-click context menu on blocks: Copy / Cut / Delete / Duplicate /
   Split here.

---

## File-by-file changes

- `src/components/videoEditor/MultiTrackTimeline.tsx` — extend
  block components to take `selected` + `onSelect`. Add b-roll
  drag handler. Add left+right trim handles to caption and b-roll
  blocks (text-overlay already has them).
- `src/pages/VideoEditor.tsx` — add `selectedTimelineItem` state,
  clipboard ref, keyboard listener `useEffect` on `document`, and
  copy/cut/paste/duplicate/delete/split handlers that branch on the
  selection's `kind`.
- `src/lib/videoEditor/edl.ts` — add a `cloneCaption / cloneOverlay /
  cloneBRoll` utility that deep-copies and re-issues `id`s. Avoids
  scattering `crypto.randomUUID()` calls across handlers.

---

## Out of scope (deferred)

- Audio waveforms on the music track (visual only).
- Marker / chapter pins on the timeline.
- Undo / redo (orthogonal — would touch every handler).
- Drag a block between tracks (not meaningful here since track type =
  data type).
- Frame-level scrubbing (preview seek is already keyframe-jumpy on most
  encoded videos; would need server-side proxy MP4s).
