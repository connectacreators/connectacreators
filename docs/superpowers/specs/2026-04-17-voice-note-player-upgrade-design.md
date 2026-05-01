# Voice Note Player Upgrade — Design Spec

**Date:** 2026-04-17
**File:** `src/components/canvas/MediaNode.tsx`
**Scope:** Voice note player section only (fileType === "voice"). No other node types touched.

---

## Goal

Replace the rough voice note audio player with a polished, harmonious player that supports:
- Drag-to-seek on the progress bar
- Direct speed selection (0.5×, 1×, 1.5×, 2×)

The rest of the node (header, file name, transcription section) stays unchanged.

---

## Layout

Two rows inside `px-3 py-3`:

```
Row 1: [▶/⏸]  [0:12]  [━━━━●──────────]  [1:45]
Row 2:                        [0.5×] [1×] [1.5×] [2×]   (right-aligned)
```

Row 1 and Row 2 share the same horizontal rhythm — the seek bar and speed pills are aligned under each other.

---

## Seek Bar

### Visual
- Track: `h-1` (4px), `rounded-full`, `bg-primary/15`
- Fill: `bg-primary/50`, grows left-to-right with playback
- Thumb: 10×10px circle, `bg-primary`, centered vertically on the track
  - Positioned via `left: ${pct}%` with `transform: translateX(-50%)`
  - `scale-110` on hover / while dragging
  - Transition: `transition-transform duration-100`

### Hit Area
A 20px-tall transparent wrapper div sits over the track to make it easy to grab. The visible 4px bar is centered inside it. `cursor-pointer`.

### Drag-to-Seek
- `onMouseDown` on the hit area: set `isDragging = true`, compute + apply seek position
- `useEffect` attaches `mousemove` and `mouseup` listeners to `document` while `isDragging` is true, removed on cleanup
- `mousemove`: recompute pct from `clientX` relative to bar's `getBoundingClientRect`, clamp 0–1, update `currentTime` on audio element and in state
- `mouseup`: set `isDragging = false`
- Touch: same logic mirrored with `touchstart / touchmove / touchend`

### Click-to-Seek
Existing `onClick` handler on the hit area covers simple taps (no drag intent).

---

## Speed Pills

Four pill buttons in a `flex gap-1 justify-end` row:

| Speed | Label |
|-------|-------|
| 0.5   | 0.5×  |
| 1.0   | 1×    |
| 1.5   | 1.5×  |
| 2.0   | 2×    |

Active pill: `bg-primary/20 border-primary/40 text-primary font-semibold`
Inactive pill: `bg-transparent border-border/30 text-muted-foreground/60 hover:border-primary/30 hover:text-primary/70`

Both: `text-[9px] px-2 py-0.5 rounded-md border transition-colors nodrag`

Clicking a pill sets `playbackRate` directly and applies it to `mediaRef.current.playbackRate`.

Remove `SPEEDS` array and `cycleSpeed` function — replaced entirely by the pill row.

---

## Harmony Notes

- All colors use the existing `primary` token (teal) — no new colors introduced
- Font sizes (`text-[9px]`, `text-[10px]`, `text-[11px]`) match the surrounding node text scale
- Corner radii (`rounded-md`, `rounded-full`) match existing node elements
- No shadows or extra borders beyond what exists in the node today
- The two-row structure uses `space-y-2` consistent with surrounding spacing

---

## State Changes

| State var | Change |
|-----------|--------|
| `playbackRate` | Keep — now driven by pills instead of `cycleSpeed` |
| `isDragging` | New `boolean` ref (not state, to avoid re-renders during drag) |
| `SPEEDS` | Remove |
| `cycleSpeed` | Remove |

`isDragging` is a `useRef<boolean>` so drag mousemove handlers don't cause unnecessary re-renders while scrubbing.

---

## What Does NOT Change

- Header (FileAudio icon, "Voice Note" label, delete button)
- File name display
- Play/pause button appearance
- Time display (`formatTime` helper)
- `audio` element and its event handlers
- Transcription button and results section
- Node handles, width, glass-card styling
