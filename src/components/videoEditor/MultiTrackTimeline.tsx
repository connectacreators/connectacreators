// src/components/videoEditor/MultiTrackTimeline.tsx
// Multi-track timeline below the preview. Time axis = source video duration.
// Tracks (top → bottom):
//   1. Ruler        — click/drag to seek (scrub), playhead cursor.
//   2. Video        — trim handles on both edges (existing behaviour).
//   3. Captions     — one block per caption (first word start..last word end);
//                      drag body to shift all words in source time, click selects.
//   4. Text         — one block per text_overlay (start_ms..end_ms in source);
//                      drag body to translate, drag edges to resize.
//   5. B-roll       — one block per b_roll clip; drag body uses output↔source
//                      inverse mapping so it tracks the rendered timeline.
//   6. Music        — full-width emerald strip; drag to shift music_start_ms.
//
// Phase A adds: selection (click any block to select), keyboard delete
// (Backspace / Delete clears the selected item), b-roll drag, ruler scrub.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  BRollClip,
  Caption,
  EDL,
  Music,
  TextOverlay,
} from "@/lib/videoEditor/edl";
import { sourceTimeToEdlTime, totalDurationMs } from "@/lib/videoEditor/edl";
import { WaveformStrip } from "./WaveformStrip";

export type TimelineSelection =
  | { kind: "video"; id: string }
  | { kind: "caption"; id: string }
  | { kind: "text"; id: string }
  | { kind: "broll"; id: string }
  | { kind: "music" }
  | null;

// Right-click context-menu state.
type CtxMenuState = {
  x: number;
  y: number;
  selection: TimelineSelection;
} | null;

type Props = {
  edl: EDL;
  playheadMs: number;
  selection: TimelineSelection;
  onSelect: (sel: TimelineSelection) => void;
  // Source-time seek — used by transcript clicks and any caller that
  // genuinely has a source-ms value.
  onSeek: (sourceMs: number) => void;
  // Output-time seek — used by the ruler scrub (and any other timeline-X
  // interaction) so we can write the EDL playhead directly instead of
  // round-tripping output → source → output through edl.clips.
  onSeekOutput: (outputMs: number) => void;
  // Trim a specific video clip by id (every EDL clip has its own id, so this
  // works for the single-clip case AND for the multi-clip case produced by
  // 'Remove all silences' or a manual split).
  onChangeTrim: (clipId: string, sourceStartMs: number, sourceEndMs: number) => void;
  // Reorder a V1 clip to a new index in the clips array. Fires on body-drag
  // mouseup with the cumulative output-time delta the user dragged; parent
  // computes the new index from that delta.
  onReorderClip: (clipId: string, deltaOutputMs: number) => void;
  onShiftCaption: (id: string, newFirstWordStartMs: number) => void;
  // Trim a caption's word range. Pass null for the edge you're not moving.
  // Words whose start/end fall outside the new range are dropped.
  onTrimCaption: (id: string, newStartMs: number | null, newEndMs: number | null) => void;
  onChangeOverlay: (id: string, patch: Partial<TextOverlay>) => void;
  onChangeBRoll: (id: string, patch: Partial<BRollClip>) => void;
  onChangeMusic: (music: Music) => void;
  // Phase D context-menu actions. The timeline raises a context-menu DOM
  // node and calls these when the user clicks an item.
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSplit: () => void;
};

const TRACK_HEIGHT = 24;
const RULER_HEIGHT = 18;
const VIDEO_TRACK_HEIGHT = 32;

function TrackRow({
  label,
  height = TRACK_HEIGHT,
  children,
}: {
  label: string;
  height?: number;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-stretch gap-2" style={{ height }}>
      <div className="w-14 shrink-0 text-[9px] uppercase tracking-wider text-neutral-500 flex items-center">
        {label}
      </div>
      <div className="relative flex-1 bg-neutral-900 rounded overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function toPct(ms: number, totalMs: number): string {
  return `${(ms / totalMs) * 100}%`;
}

// Given a desired source-time start for a clip of length `dur`, return the
// closest valid start that doesn't overlap any `siblings`. Builds free
// intervals between the (merged) sibling ranges and picks the placement
// that fits and is nearest to `target`. Works even when siblings overlap
// each other or the target — the dragged clip snaps into a free gap.
function clampToFreeRange(
  target: number,
  dur: number,
  siblings: Array<{ source_start_ms: number; source_end_ms: number }>,
  totalSourceMs: number,
): number {
  if (siblings.length === 0) {
    return Math.max(0, Math.min(totalSourceMs - dur, target));
  }
  const sorted = [...siblings].sort((a, b) => a.source_start_ms - b.source_start_ms);
  const merged: Array<{ start: number; end: number }> = [];
  for (const s of sorted) {
    const last = merged[merged.length - 1];
    if (last && s.source_start_ms <= last.end) {
      last.end = Math.max(last.end, s.source_end_ms);
    } else {
      merged.push({ start: s.source_start_ms, end: s.source_end_ms });
    }
  }
  const free: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  for (const m of merged) {
    if (m.start > cursor) free.push({ start: cursor, end: m.start });
    cursor = Math.max(cursor, m.end);
  }
  if (cursor < totalSourceMs) free.push({ start: cursor, end: totalSourceMs });

  let best = Math.max(0, Math.min(totalSourceMs - dur, target));
  let bestDist = Infinity;
  let foundFit = false;
  for (const iv of free) {
    if (iv.end - iv.start < dur) continue;
    const clamped = Math.max(iv.start, Math.min(iv.end - dur, target));
    const dist = Math.abs(clamped - target);
    if (dist < bestDist) {
      bestDist = dist;
      best = clamped;
      foundFit = true;
    }
  }
  // No free interval can hold the clip — fall back to the bounds-clamped
  // target (caller's last resort; should be rare). Don't return a position
  // that would silently shrink the clip.
  return foundFit ? best : Math.max(0, Math.min(totalSourceMs - dur, target));
}

// Returns a function that wraps a per-drag handler — captures startPx on
// mousedown, then on each mousemove emits a delta-from-start in ms.
function useTimeDrag(
  trackRef: React.RefObject<HTMLDivElement>,
  totalSourceMs: number,
) {
  return useCallback(
    (handler: (deltaMs: number) => void, onEnd?: (finalDeltaMs: number) => void) =>
      (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const track = trackRef.current;
        if (!track) return;
        const rect = track.getBoundingClientRect();
        const startPx = e.clientX;
        let lastDelta = 0;
        const move = (ev: MouseEvent) => {
          const deltaPx = ev.clientX - startPx;
          lastDelta = Math.round((deltaPx / rect.width) * totalSourceMs);
          handler(lastDelta);
        };
        const up = () => {
          window.removeEventListener("mousemove", move);
          window.removeEventListener("mouseup", up);
          if (onEnd) onEnd(lastDelta);
        };
        window.addEventListener("mousemove", move);
        window.addEventListener("mouseup", up);
      },
    [trackRef, totalSourceMs],
  );
}

export function MultiTrackTimeline(props: Props) {
  const {
    edl, playheadMs, selection, onSelect, onSeek, onSeekOutput, onChangeTrim, onReorderClip,
    onShiftCaption, onTrimCaption, onChangeOverlay, onChangeBRoll, onChangeMusic,
    onCopy, onCut, onPaste, onDuplicate, onDelete, onSplit,
  } = props;
  // Timeline X-axis is now OUTPUT time — after Remove-all-silences, clips
  // are concatenated contiguously so there's no visible gap. The source
  // duration is only needed when something genuinely operates in source
  // space (e.g. computing whether a sibling source range is "to the left"
  // of another during free-range clamp).
  const totalSourceMs = edl.source.duration_ms;
  const totalOutputMs = totalDurationMs(edl);
  // Display position for each video clip: cumulative duration up to that
  // clip in output time. Recomputed each render so trim/duration changes
  // ripple immediately.
  const clipsWithOutput = useMemo(() => {
    let cursor = 0;
    return edl.clips.map((c) => {
      const dur = Math.max(0, c.source_end_ms - c.source_start_ms);
      const out = {
        id: c.id,
        source_start_ms: c.source_start_ms,
        source_end_ms: c.source_end_ms,
        output_start_ms: cursor,
        output_end_ms: cursor + dur,
      };
      cursor += dur;
      return out;
    });
  }, [edl.clips]);
  const trackWidthRef = useRef<HTMLDivElement | null>(null);
  const beginDrag = useTimeDrag(trackWidthRef, totalOutputMs);

  // Zoom (1x..8x). Cmd/Ctrl + scroll-wheel adjusts. The inner content is
  // rendered at `${100 * zoom}%` width inside a horizontally-scrolling
  // container, so 2x doubles the timeline width and reveals fine detail.
  const [zoom, setZoom] = useState(1);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const onWheelZoom = (e: React.WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    setZoom((z) => Math.max(1, Math.min(8, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15))));
  };

  // Right-click context menu state.
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState>(null);
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [ctxMenu]);

  // Playhead position on the output-time axis is just playheadMs — no
  // source-mapping needed since the whole timeline now lives in output
  // time. Kept under the same name for downstream call sites below.
  const playheadSourceMs = playheadMs;

  // Clear selection on Escape. Delete-key handler lives in VideoEditor
  // since it needs access to the EDL mutators for each item kind.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onSelect(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSelect]);

  // Build ruler labels — pick a tick interval that gives ~6-10 ticks.
  const ticks = useMemo(() => {
    const totalSec = totalOutputMs / 1000;
    const candidates = [1, 2, 5, 10, 15, 30, 60];
    const target = totalSec / 8;
    const step = candidates.find((c) => c >= target) ?? 60;
    const out: number[] = [];
    for (let t = 0; t <= totalSec; t += step) out.push(t);
    return out;
  }, [totalOutputMs]);

  const clip = edl.clips[0];

  const isSelected = (sel: TimelineSelection): boolean => {
    if (!selection) return false;
    if (selection.kind !== sel?.kind) return false;
    if ("id" in selection && sel && "id" in sel) return selection.id === sel.id;
    return true;
  };

  // Helper to capture right-click on a block and open the context menu.
  const showCtx = (e: React.MouseEvent, sel: TimelineSelection) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect(sel);
    setCtxMenu({ x: e.clientX, y: e.clientY, selection: sel });
  };

  return (
    <div
      ref={scrollerRef}
      className="bg-neutral-950 border-t border-neutral-800 p-3 overflow-x-auto"
      onWheel={onWheelZoom}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onSelect(null);
      }}
    >
    <div className="relative space-y-1.5" style={{ width: `${100 * zoom}%`, minWidth: "100%" }}>
      {/* Ruler — click/drag to seek. */}
      <div ref={trackWidthRef} className="flex items-stretch gap-2" style={{ height: RULER_HEIGHT }}>
        <div className="w-14 shrink-0 text-[9px] uppercase tracking-wider text-neutral-500 flex items-center">
          Time
        </div>
        <div
          className="relative flex-1 border-b border-neutral-800 cursor-pointer select-none"
          onMouseDown={(e) => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const seekFromClient = (clientX: number) => {
              const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
              // Ruler X-axis IS output time, so write the EDL playhead
              // directly via onSeekOutput. Round-tripping through
              // edlOutputTimeToSourceTime + sourceTimeToEdlTime at the
              // parent introduced rounding drift at clip boundaries that
              // could land the playhead in a neighbouring clip.
              onSeekOutput(Math.round(pct * totalOutputMs));
            };
            seekFromClient(e.clientX);
            const move = (ev: MouseEvent) => seekFromClient(ev.clientX);
            const up = () => {
              window.removeEventListener("mousemove", move);
              window.removeEventListener("mouseup", up);
            };
            window.addEventListener("mousemove", move);
            window.addEventListener("mouseup", up);
          }}
          title="Click to seek · drag to scrub"
        >
          {ticks.map((t) => (
            <div
              key={t}
              className="absolute top-0 bottom-0 border-l border-neutral-800 text-[9px] text-neutral-500 pl-1 pointer-events-none"
              style={{ left: toPct(t * 1000, totalOutputMs) }}
            >
              {t}s
            </div>
          ))}
          <div
            className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-yellow-400 pointer-events-none"
            style={{ left: toPct(playheadSourceMs, totalOutputMs) }}
          />
        </div>
      </div>

      {/* Video — one block per EDL clip. Multiple clips happen after the
          user splits the source or runs 'Remove all silences'. Each block
          has its own trim handles (visible when selected) and the entire
          body is draggable as a selection target. */}
      <TrackRow label="Video" height={VIDEO_TRACK_HEIGHT}>
        {clipsWithOutput.map((c) => (
          <VideoClipBlock
            key={c.id}
            clipId={c.id}
            // Display position: cumulative output time so clips render
            // contiguously after Remove-all-silences (no source-time gaps).
            displayStartMs={c.output_start_ms}
            displayEndMs={c.output_end_ms}
            totalDisplayMs={totalOutputMs}
            // Source range — what trim/body-drag mutate via onChangeTrim.
            sourceStartMs={c.source_start_ms}
            sourceEndMs={c.source_end_ms}
            totalSourceMs={totalSourceMs}
            selected={isSelected({ kind: "video", id: c.id })}
            onSelect={() => onSelect({ kind: "video", id: c.id })}
            onContextMenu={(e) => showCtx(e, { kind: "video", id: c.id })}
            onChangeTrim={(s, e) => onChangeTrim(c.id, s, e)}
            onReorder={(deltaOut) => onReorderClip(c.id, deltaOut)}
            onSeek={onSeek}
            beginDrag={beginDrag}
          />
        ))}
        <div
          className="absolute top-0 bottom-0 w-px bg-yellow-400 pointer-events-none"
          style={{ left: toPct(playheadSourceMs, totalOutputMs) }}
        />
      </TrackRow>

      {/* Captions */}
      <TrackRow label="Captions">
        {(edl.captions ?? []).map((c) => (
          <CaptionBlock
            key={c.id}
            cap={c}
            edl={edl}
            totalSourceMs={totalSourceMs}
            totalDisplayMs={totalOutputMs}
            selected={isSelected({ kind: "caption", id: c.id })}
            onSelect={() => onSelect({ kind: "caption", id: c.id })}
            onContextMenu={(e) => showCtx(e, { kind: "caption", id: c.id })}
            onShift={(t) => onShiftCaption(c.id, t)}
            onTrimCaption={onTrimCaption}
            onSeek={onSeek}
            beginDrag={beginDrag}
          />
        ))}
      </TrackRow>

      {/* Text overlays */}
      <TrackRow label="Text">
        {(edl.text_overlays ?? []).map((ov) => (
          <OverlayBlock
            key={ov.id}
            ov={ov}
            edl={edl}
            totalSourceMs={totalSourceMs}
            totalDisplayMs={totalOutputMs}
            selected={isSelected({ kind: "text", id: ov.id })}
            onSelect={() => onSelect({ kind: "text", id: ov.id })}
            onContextMenu={(e) => showCtx(e, { kind: "text", id: ov.id })}
            onSeek={onSeek}
            onChange={(patch) => onChangeOverlay(ov.id, patch)}
            beginDrag={beginDrag}
          />
        ))}
      </TrackRow>

      {/* B-roll — positions stored in OUTPUT time so they map straight to
          the timeline X-axis with no conversion. */}
      <TrackRow label="B-roll">
        {(edl.b_roll ?? []).map((br) => (
          <BRollBlock
            key={br.id}
            br={br}
            totalDisplayMs={totalOutputMs}
            selected={isSelected({ kind: "broll", id: br.id })}
            onSelect={() => onSelect({ kind: "broll", id: br.id })}
            onContextMenu={(e) => showCtx(e, { kind: "broll", id: br.id })}
            onChange={(patch) => onChangeBRoll(br.id, patch)}
            onSeek={onSeek}
            beginDrag={beginDrag}
          />
        ))}
      </TrackRow>

      {/* Music */}
      {edl.music ? (
        <TrackRow label="Music">
          <div
            onMouseDown={beginDrag((deltaMs) => {
              const next = Math.max(0, (edl.music?.music_start_ms ?? 0) + deltaMs);
              onChangeMusic({ ...edl.music!, music_start_ms: next });
            })}
            onClick={() => onSelect({ kind: "music" })}
            onContextMenu={(e) => showCtx(e, { kind: "music" })}
            className={`absolute top-0 bottom-0 left-0 right-0 bg-emerald-900/50 border ${isSelected({ kind: "music" }) ? "border-yellow-400 ring-1 ring-yellow-400" : "border-emerald-500"} rounded cursor-grab active:cursor-grabbing flex items-center px-2 overflow-hidden`}
            title="Drag to shift music start offset"
          >
            <WaveformStrip storagePath={edl.music.storage_path} color="rgba(110,231,183,0.45)" />
            <span className="relative text-[9px] text-emerald-300 truncate">
              ♪ offset {((edl.music.music_start_ms ?? 0) / 1000).toFixed(1)}s · vol {Math.round(edl.music.volume * 100)}%
            </span>
          </div>
        </TrackRow>
      ) : (
        <TrackRow label="Music">
          <div className="absolute top-0 bottom-0 left-0 right-0 flex items-center justify-center text-[9px] text-neutral-600">
            no music — add from the Music tab
          </div>
        </TrackRow>
      )}

      {/* Draggable scrub strip — sits above all tracks at the playhead
          column. Without this, the yellow playhead is pointer-events-none
          so clicks fall through to clip blocks, whose onClick snaps the
          playhead back to that clip's start (= "going back instead").
          The outer wrapper is positioned over the track-stripe area (skips
          the 64px w-14 label + gap-2 column on the left) so its width
          matches the stripes — that means toPct on the inner strip lines
          up with the playhead lines drawn inside each row. */}
      <div className="absolute pointer-events-none z-20" style={{ left: 64, right: 0, top: 0, bottom: 28 }}>
        <div
          ref={scrubAreaRef}
          className="absolute top-0 bottom-0 pointer-events-auto cursor-ew-resize"
          style={{
            left: toPct(playheadSourceMs, totalOutputMs),
            transform: "translateX(-50%)",
            width: 14,
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const parent = scrubAreaRef.current?.parentElement;
            if (!parent) return;
            const rect = parent.getBoundingClientRect();
            const seekFromClient = (clientX: number) => {
              const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
              const outMs = Math.round(pct * totalOutputMs);
              onSeek(Math.round(edlOutputTimeToSourceTime(edl, outMs)));
            };
            seekFromClient(e.clientX);
            const move = (ev: MouseEvent) => seekFromClient(ev.clientX);
            const up = () => {
              window.removeEventListener("mousemove", move);
              window.removeEventListener("mouseup", up);
            };
            window.addEventListener("mousemove", move);
            window.addEventListener("mouseup", up);
          }}
        />
      </div>

      <div className="text-[10px] text-neutral-500 pl-16 flex items-center justify-between">
        <span>
          Trim {(clip.source_start_ms / 1000).toFixed(1)}s → {(clip.source_end_ms / 1000).toFixed(1)}s
          · {((clip.source_end_ms - clip.source_start_ms) / 1000).toFixed(1)}s out
          {selection && ` · selected: ${selection.kind}${"id" in selection ? ` (${selection.id.slice(0, 6)})` : ""}`}
        </span>
        <span className="text-neutral-600">
          Zoom {zoom.toFixed(1)}× · Cmd+scroll to zoom · Cmd+C/X/V/D · S to split · Del to remove
        </span>
      </div>
    </div>

    {/* Context menu — fixed-positioned at click coords. Closes on outside
        click via the effect above. */}
    {ctxMenu && (
      <div
        className="fixed z-50 bg-neutral-900 border border-neutral-700 rounded shadow-lg py-1 text-[11px] min-w-[140px]"
        style={{ left: ctxMenu.x, top: ctxMenu.y }}
        onClick={(e) => e.stopPropagation()}
      >
        {(() => {
          const sel = ctxMenu.selection;
          const canSplit = sel && (sel.kind === "caption" || sel.kind === "broll");
          const items: { label: string; action: () => void; danger?: boolean; disabled?: boolean }[] = [
            { label: "Copy",       action: () => { onCopy(); setCtxMenu(null); }, disabled: !sel },
            { label: "Cut",        action: () => { onCut(); setCtxMenu(null); },  disabled: !sel },
            { label: "Paste",      action: () => { onPaste(); setCtxMenu(null); } },
            { label: "Duplicate",  action: () => { onDuplicate(); setCtxMenu(null); }, disabled: !sel },
            { label: "Split at playhead", action: () => { onSplit(); setCtxMenu(null); }, disabled: !canSplit },
            { label: "Delete",     action: () => { onDelete(); setCtxMenu(null); }, disabled: !sel, danger: true },
          ];
          return items.map((it) => (
            <button
              key={it.label}
              disabled={it.disabled}
              onClick={it.action}
              className={`w-full text-left px-3 py-1 ${it.disabled ? "text-neutral-600 cursor-not-allowed" : it.danger ? "text-red-400 hover:bg-red-950" : "text-neutral-200 hover:bg-neutral-800"}`}
            >
              {it.label}
            </button>
          ));
        })()}
      </div>
    )}
    </div>
  );
}

function VideoClipBlock({
  clipId: _clipId, // not consumed inside the block; parent binds onChangeTrim to it
  displayStartMs,
  displayEndMs,
  totalDisplayMs,
  sourceStartMs,
  sourceEndMs,
  totalSourceMs,
  selected,
  onSelect,
  onContextMenu,
  onChangeTrim,
  onReorder,
  onSeek,
  beginDrag,
}: {
  clipId: string;
  // Position to render at on the timeline (output-time, cumulative). The
  // block always lays out using these — they're what makes the row look
  // contiguous after Remove-all-silences.
  displayStartMs: number;
  displayEndMs: number;
  totalDisplayMs: number;
  // Source range — what the trim handles mutate.
  sourceStartMs: number;
  sourceEndMs: number;
  totalSourceMs: number;
  selected: boolean;
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onChangeTrim: (sourceStartMs: number, sourceEndMs: number) => void;
  // Body-drag mouseup: parent reorders the clip in edl.clips based on the
  // accumulated output-time delta the user pulled.
  onReorder: (deltaOutputMs: number) => void;
  onSeek: (sourceMs: number) => void;
  beginDrag: (
    handler: (deltaMs: number) => void,
    onEnd?: (finalDeltaMs: number) => void,
  ) => (e: React.MouseEvent) => void;
}) {
  const snap = useRef({ start: sourceStartMs, end: sourceEndMs });
  const captureSnap = () => { snap.current = { start: sourceStartMs, end: sourceEndMs }; };
  // Visual offset while dragging — translateX the block by the cumulative
  // delta so the user sees the clip following the cursor. Committed to a
  // reorder on mouseup.
  const [dragOffsetPx, setDragOffsetPx] = useState(0);

  // Body drag — track ghost offset while dragging, commit reorder on
  // mouseup. The drag-delta from useTimeDrag is in output-time ms; convert
  // to a pixel translate via the timeline's px-per-ms ratio (the block's
  // own width / its output duration).
  const onBodyDown = beginDrag(
    (deltaOutMs) => {
      const widthMs = displayEndMs - displayStartMs;
      // Pixel translate = (deltaOutMs / widthMs) * blockWidthPx, but we
      // don't have blockWidthPx in JS — toPct values give us %, so a CSS
      // translate as a fraction of width works: (delta/width) * 100 + "%".
      const pctOfBlock = widthMs > 0 ? (deltaOutMs / widthMs) * 100 : 0;
      setDragOffsetPx(pctOfBlock); // misnamed: pct, not px; treated as % below
    },
    (finalDeltaOutMs) => {
      setDragOffsetPx(0);
      if (Math.abs(finalDeltaOutMs) > 50) onReorder(finalDeltaOutMs);
    },
  );
  const onLeftDown = beginDrag((delta) => {
    const next = Math.max(0, Math.min(snap.current.end - 100, snap.current.start + delta));
    onChangeTrim(next, snap.current.end);
  });
  const onRightDown = beginDrag((delta) => {
    const next = Math.max(snap.current.start + 100, Math.min(totalSourceMs, snap.current.end + delta));
    onChangeTrim(snap.current.start, next);
  });

  return (
    <div
      onMouseDown={(e) => { e.stopPropagation(); captureSnap(); onSelect(); onBodyDown(e); }}
      onClick={(e) => { e.stopPropagation(); onSeek(sourceStartMs); }}
      onContextMenu={onContextMenu}
      className={`absolute top-0 bottom-0 bg-blue-900/40 border ${selected ? "border-yellow-400 ring-1 ring-yellow-400" : "border-blue-500"} cursor-grab active:cursor-grabbing box-border`}
      style={{
        left: toPct(displayStartMs, totalDisplayMs),
        width: toPct(displayEndMs - displayStartMs, totalDisplayMs),
        minWidth: 2,
        // While dragging, translate the block by a fraction of its OWN
        // width so it visually tracks the cursor 1:1 with the user's drag.
        transform: dragOffsetPx ? `translateX(${dragOffsetPx}%)` : undefined,
        opacity: dragOffsetPx ? 0.8 : 1,
        zIndex: dragOffsetPx ? 5 : undefined,
      }}
      title={`Video clip · ${((displayEndMs - displayStartMs) / 1000).toFixed(1)}s · drag to reorder, S to split`}
    >
      {selected && (
        <>
          <div
            onMouseDown={(e) => { e.stopPropagation(); captureSnap(); onLeftDown(e); }}
            className="absolute left-0 top-0 bottom-0 w-2 bg-blue-400 cursor-ew-resize z-10"
            title="Trim clip start"
          />
          <div
            onMouseDown={(e) => { e.stopPropagation(); captureSnap(); onRightDown(e); }}
            className="absolute right-0 top-0 bottom-0 w-2 bg-blue-400 cursor-ew-resize z-10"
            title="Trim clip end"
          />
        </>
      )}
    </div>
  );
}

function CaptionBlock({
  cap,
  edl,
  totalSourceMs,
  totalDisplayMs,
  selected,
  onSelect,
  onContextMenu,
  onShift,
  onTrimCaption,
  onSeek,
  beginDrag,
}: {
  cap: Caption;
  edl: EDL;
  totalSourceMs: number;
  // Width of the timeline in OUTPUT time — display math uses this; the
  // body/trim handlers continue to operate in source space.
  totalDisplayMs: number;
  selected: boolean;
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onShift: (newFirstWordStartMs: number) => void;
  onTrimCaption: (id: string, newStartMs: number | null, newEndMs: number | null) => void;
  onSeek: (sourceMs: number) => void;
  beginDrag: (handler: (deltaMs: number) => void) => (e: React.MouseEvent) => void;
}) {
  const start = cap.words[0]?.start_ms ?? 0;
  const end = cap.words[cap.words.length - 1]?.end_ms ?? start + 200;
  // Position on the timeline = where the caption appears in the rendered
  // output. Map source-time word positions through the EDL.
  const displayStart = sourceTimeToEdlTime(edl, start);
  const displayEnd = sourceTimeToEdlTime(edl, end);
  const snapStart = useRef(start);
  const snapRange = useRef({ start, end });

  const onBodyDown = beginDrag((delta) => {
    const dur = end - snapStart.current;
    const next = Math.max(0, Math.min(totalSourceMs - dur, snapStart.current + delta));
    onShift(next);
  });
  const onLeftDown = beginDrag((delta) => {
    const target = Math.max(0, Math.min(snapRange.current.end - 100, snapRange.current.start + delta));
    onTrimCaption(cap.id, target, null);
  });
  const onRightDown = beginDrag((delta) => {
    const target = Math.max(snapRange.current.start + 100, Math.min(totalSourceMs, snapRange.current.end + delta));
    onTrimCaption(cap.id, null, target);
  });
  const captureRange = () => { snapRange.current = { start, end }; };

  return (
    <div
      onMouseDown={(e) => {
        e.stopPropagation();
        snapStart.current = cap.words[0]?.start_ms ?? 0;
        onSelect();
        onBodyDown(e);
      }}
      onClick={(e) => { e.stopPropagation(); onSeek(start); }}
      onContextMenu={onContextMenu}
      className={`absolute top-0 bottom-0 bg-blue-700/30 border ${selected ? "border-yellow-400 ring-1 ring-yellow-400" : "border-blue-500"} rounded cursor-grab active:cursor-grabbing px-1 flex items-center`}
      style={{
        left: toPct(displayStart, totalDisplayMs),
        width: toPct(Math.max(200, displayEnd - displayStart), totalDisplayMs),
        minWidth: 60,
      }}
      title={cap.words.map((w) => w.text).join(" ")}
    >
      {selected && (
        <>
          <div
            onMouseDown={(e) => { e.stopPropagation(); captureRange(); onLeftDown(e); }}
            className="absolute left-0 top-0 bottom-0 w-2 bg-blue-300 cursor-ew-resize z-10"
            title="Trim caption start (drops earlier words)"
          />
          <div
            onMouseDown={(e) => { e.stopPropagation(); captureRange(); onRightDown(e); }}
            className="absolute right-0 top-0 bottom-0 w-2 bg-blue-300 cursor-ew-resize z-10"
            title="Trim caption end (drops later words)"
          />
        </>
      )}
      <span className="text-[9px] text-blue-200 truncate px-2">
        {cap.words.map((w) => w.text).join(" ")}
      </span>
    </div>
  );
}

function OverlayBlock({
  ov,
  edl,
  totalSourceMs,
  totalDisplayMs,
  selected,
  onSelect,
  onContextMenu,
  onSeek,
  onChange,
  beginDrag,
}: {
  ov: TextOverlay;
  edl: EDL;
  totalSourceMs: number;
  totalDisplayMs: number;
  selected: boolean;
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onSeek: (sourceMs: number) => void;
  onChange: (patch: Partial<TextOverlay>) => void;
  beginDrag: (handler: (deltaMs: number) => void) => (e: React.MouseEvent) => void;
}) {
  const startAt = useRef({ start: ov.start_ms, end: ov.end_ms });
  // Display in OUTPUT time so the overlay block lines up with the same
  // moment in the preview / video clips.
  const displayStart = sourceTimeToEdlTime(edl, ov.start_ms);
  const displayEnd = sourceTimeToEdlTime(edl, ov.end_ms);
  const onBodyDown = beginDrag((delta) => {
    const dur = startAt.current.end - startAt.current.start;
    const nextStart = Math.max(0, Math.min(totalSourceMs - dur, startAt.current.start + delta));
    onChange({ start_ms: nextStart, end_ms: nextStart + dur });
  });
  const onLeftDown = beginDrag((delta) => {
    const nextStart = Math.max(0, Math.min(startAt.current.end - 100, startAt.current.start + delta));
    onChange({ start_ms: nextStart });
  });
  const onRightDown = beginDrag((delta) => {
    const nextEnd = Math.max(startAt.current.start + 100, Math.min(totalSourceMs, startAt.current.end + delta));
    onChange({ end_ms: nextEnd });
  });
  const captureStart = () => {
    startAt.current = { start: ov.start_ms, end: ov.end_ms };
  };

  return (
    <div
      onMouseDown={(e) => { e.stopPropagation(); captureStart(); onSelect(); onBodyDown(e); }}
      onClick={(e) => { e.stopPropagation(); onSeek(ov.start_ms); }}
      onContextMenu={onContextMenu}
      className={`absolute top-0 bottom-0 bg-amber-800/40 border ${selected ? "border-yellow-400 ring-1 ring-yellow-400" : "border-amber-500"} rounded cursor-grab active:cursor-grabbing px-1 flex items-center`}
      style={{
        left: toPct(displayStart, totalDisplayMs),
        width: toPct(Math.max(200, displayEnd - displayStart), totalDisplayMs),
        minWidth: 60,
      }}
      title={ov.text}
    >
      {selected && (
        <>
          <div
            onMouseDown={(e) => { e.stopPropagation(); captureStart(); onLeftDown(e); }}
            className="absolute left-0 top-0 bottom-0 w-2 bg-amber-400 cursor-ew-resize z-10"
          />
          <div
            onMouseDown={(e) => { e.stopPropagation(); captureStart(); onRightDown(e); }}
            className="absolute right-0 top-0 bottom-0 w-2 bg-amber-400 cursor-ew-resize z-10"
          />
        </>
      )}
      <span className="text-[9px] text-amber-200 truncate px-2">{ov.text}</span>
    </div>
  );
}

function BRollBlock({
  br,
  totalDisplayMs,
  selected,
  onSelect,
  onContextMenu,
  onChange,
  onSeek,
  beginDrag,
}: {
  br: BRollClip;
  totalDisplayMs: number;
  selected: boolean;
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onChange: (patch: Partial<BRollClip>) => void;
  onSeek: (sourceMs: number) => void;
  beginDrag: (handler: (deltaMs: number) => void) => (e: React.MouseEvent) => void;
}) {
  // B-roll positions are already stored in OUTPUT time — no mapping needed.
  const dur = br.trim_end_ms - br.trim_start_ms;
  const displayStart = br.output_start_ms;
  const displayEnd = br.output_start_ms + dur;

  const snap = useRef(br.output_start_ms);
  const onBodyDown = beginDrag((deltaMs) => {
    const next = Math.max(0, Math.min(totalDisplayMs - dur, snap.current + deltaMs));
    onChange({ output_start_ms: Math.round(next) });
  });

  const trimSnap = useRef({ ts: br.trim_start_ms, te: br.trim_end_ms });
  const captureTrim = () => { trimSnap.current = { ts: br.trim_start_ms, te: br.trim_end_ms }; };
  const onLeftDown = beginDrag((deltaMs) => {
    const next = Math.max(0, Math.min(trimSnap.current.te - 100, trimSnap.current.ts + deltaMs));
    onChange({ trim_start_ms: next });
  });
  const onRightDown = beginDrag((deltaMs) => {
    const next = Math.max(trimSnap.current.ts + 100, Math.min(br.source_duration_ms, trimSnap.current.te + deltaMs));
    onChange({ trim_end_ms: next });
  });

  return (
    <div
      onMouseDown={(e) => {
        e.stopPropagation();
        snap.current = br.output_start_ms;
        onSelect();
        onBodyDown(e);
      }}
      onClick={(e) => { e.stopPropagation(); onSeek(0); }}
      onContextMenu={onContextMenu}
      className={`absolute top-0 bottom-0 bg-purple-900/40 border ${selected ? "border-yellow-400 ring-1 ring-yellow-400" : "border-purple-500"} rounded cursor-grab active:cursor-grabbing px-1 flex items-center overflow-hidden`}
      style={{
        left: toPct(displayStart, totalDisplayMs),
        width: toPct(Math.max(120, displayEnd - displayStart), totalDisplayMs),
        minWidth: 60,
      }}
      title={`B-roll · ${br.mode} · ${(dur / 1000).toFixed(1)}s · drag to reposition`}
    >
      <WaveformStrip storagePath={br.source_storage_path} color="rgba(216,180,254,0.45)" />
      {selected && (
        <>
          <div
            onMouseDown={(e) => { e.stopPropagation(); captureTrim(); onLeftDown(e); }}
            className="absolute left-0 top-0 bottom-0 w-2 bg-purple-300 cursor-ew-resize z-10"
            title="Trim b-roll start"
          />
          <div
            onMouseDown={(e) => { e.stopPropagation(); captureTrim(); onRightDown(e); }}
            className="absolute right-0 top-0 bottom-0 w-2 bg-purple-300 cursor-ew-resize z-10"
            title="Trim b-roll end"
          />
        </>
      )}
      <span className="text-[9px] text-purple-200 truncate px-2">{br.mode}</span>
    </div>
  );
}
