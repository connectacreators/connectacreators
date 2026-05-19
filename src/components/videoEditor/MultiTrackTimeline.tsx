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
import { sourceTimeToEdlTime } from "@/lib/videoEditor/edl";

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
  onSeek: (sourceMs: number) => void;
  // Trim a specific video clip by id (every EDL clip has its own id, so this
  // works for the single-clip case AND for the multi-clip case produced by
  // 'Remove all silences' or a manual split).
  onChangeTrim: (clipId: string, sourceStartMs: number, sourceEndMs: number) => void;
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

// Returns a function that wraps a per-drag handler — captures startPx on
// mousedown, then on each mousemove emits a delta-from-start in ms.
function useTimeDrag(
  trackRef: React.RefObject<HTMLDivElement>,
  totalSourceMs: number,
) {
  return useCallback(
    (handler: (deltaMs: number) => void) => (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const startPx = e.clientX;
      const move = (ev: MouseEvent) => {
        const deltaPx = ev.clientX - startPx;
        const deltaMs = Math.round((deltaPx / rect.width) * totalSourceMs);
        handler(deltaMs);
      };
      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    },
    [trackRef, totalSourceMs],
  );
}

export function MultiTrackTimeline(props: Props) {
  const {
    edl, playheadMs, selection, onSelect, onSeek, onChangeTrim,
    onShiftCaption, onTrimCaption, onChangeOverlay, onChangeBRoll, onChangeMusic,
    onCopy, onCut, onPaste, onDuplicate, onDelete, onSplit,
  } = props;
  const totalSourceMs = edl.source.duration_ms;
  const trackWidthRef = useRef<HTMLDivElement | null>(null);
  const beginDrag = useTimeDrag(trackWidthRef, totalSourceMs);

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

  // Source-time playhead for the cursor on this source-time axis.
  const playheadSourceMs = useMemo(() => {
    let acc = 0;
    for (const c of edl.clips) {
      const len = Math.max(0, c.source_end_ms - c.source_start_ms);
      if (playheadMs <= acc + len) return c.source_start_ms + (playheadMs - acc);
      acc += len;
    }
    return edl.clips[edl.clips.length - 1]?.source_end_ms ?? 0;
  }, [edl.clips, playheadMs]);

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
    const totalSec = totalSourceMs / 1000;
    const candidates = [1, 2, 5, 10, 15, 30, 60];
    const target = totalSec / 8;
    const step = candidates.find((c) => c >= target) ?? 60;
    const out: number[] = [];
    for (let t = 0; t <= totalSec; t += step) out.push(t);
    return out;
  }, [totalSourceMs]);

  const clip = edl.clips[0];

  const outputToSource = (outMs: number): number => {
    let acc = 0;
    for (const c of edl.clips) {
      const len = Math.max(0, c.source_end_ms - c.source_start_ms);
      if (outMs <= acc + len) return c.source_start_ms + (outMs - acc);
      acc += len;
    }
    return totalSourceMs;
  };

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
    <div className="space-y-1.5" style={{ width: `${100 * zoom}%`, minWidth: "100%" }}>
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
              onSeek(Math.round(pct * totalSourceMs));
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
              style={{ left: toPct(t * 1000, totalSourceMs) }}
            >
              {t}s
            </div>
          ))}
          <div
            className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-yellow-400 pointer-events-none"
            style={{ left: toPct(playheadSourceMs, totalSourceMs) }}
          />
        </div>
      </div>

      {/* Video — one block per EDL clip. Multiple clips happen after the
          user splits the source or runs 'Remove all silences'. Each block
          has its own trim handles (visible when selected) and the entire
          body is draggable as a selection target. */}
      <TrackRow label="Video" height={VIDEO_TRACK_HEIGHT}>
        {edl.clips.map((c) => (
          <VideoClipBlock
            key={c.id}
            clipId={c.id}
            startMs={c.source_start_ms}
            endMs={c.source_end_ms}
            totalSourceMs={totalSourceMs}
            selected={isSelected({ kind: "video", id: c.id })}
            onSelect={() => onSelect({ kind: "video", id: c.id })}
            onContextMenu={(e) => showCtx(e, { kind: "video", id: c.id })}
            onChangeTrim={(s, e) => onChangeTrim(c.id, s, e)}
            onSeek={onSeek}
            beginDrag={beginDrag}
          />
        ))}
        <div
          className="absolute top-0 bottom-0 w-px bg-yellow-400 pointer-events-none"
          style={{ left: toPct(playheadSourceMs, totalSourceMs) }}
        />
      </TrackRow>

      {/* Captions */}
      <TrackRow label="Captions">
        {(edl.captions ?? []).map((c) => (
          <CaptionBlock
            key={c.id}
            cap={c}
            totalSourceMs={totalSourceMs}
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
            totalSourceMs={totalSourceMs}
            selected={isSelected({ kind: "text", id: ov.id })}
            onSelect={() => onSelect({ kind: "text", id: ov.id })}
            onContextMenu={(e) => showCtx(e, { kind: "text", id: ov.id })}
            onSeek={onSeek}
            onChange={(patch) => onChangeOverlay(ov.id, patch)}
            beginDrag={beginDrag}
          />
        ))}
      </TrackRow>

      {/* B-roll — draggable via output↔source inverse mapping. */}
      <TrackRow label="B-roll">
        {(edl.b_roll ?? []).map((br) => (
          <BRollBlock
            key={br.id}
            br={br}
            edl={edl}
            totalSourceMs={totalSourceMs}
            selected={isSelected({ kind: "broll", id: br.id })}
            onSelect={() => onSelect({ kind: "broll", id: br.id })}
            onContextMenu={(e) => showCtx(e, { kind: "broll", id: br.id })}
            outputToSource={outputToSource}
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
            className={`absolute top-0 bottom-0 left-0 right-0 bg-emerald-900/50 border ${isSelected({ kind: "music" }) ? "border-yellow-400 ring-1 ring-yellow-400" : "border-emerald-500"} rounded cursor-grab active:cursor-grabbing flex items-center px-2`}
            title="Drag to shift music start offset"
          >
            <span className="text-[9px] text-emerald-300 truncate">
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
  clipId,
  startMs,
  endMs,
  totalSourceMs,
  selected,
  onSelect,
  onContextMenu,
  onChangeTrim,
  onSeek,
  beginDrag,
}: {
  clipId: string;
  startMs: number;
  endMs: number;
  totalSourceMs: number;
  selected: boolean;
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  // Replace this clip's [start, end] with new source-time bounds.
  onChangeTrim: (sourceStartMs: number, sourceEndMs: number) => void;
  onSeek: (sourceMs: number) => void;
  beginDrag: (handler: (deltaMs: number) => void) => (e: React.MouseEvent) => void;
}) {
  const snap = useRef({ start: startMs, end: endMs });
  const captureSnap = () => { snap.current = { start: startMs, end: endMs }; };

  // Body drag — translates the clip's [start, end] in source space (keeps
  // its duration). Useful when the user wants to re-position a split clip.
  const onBodyDown = beginDrag((delta) => {
    const dur = snap.current.end - snap.current.start;
    const nextStart = Math.max(0, Math.min(totalSourceMs - dur, snap.current.start + delta));
    onChangeTrim(nextStart, nextStart + dur);
  });
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
      onClick={(e) => { e.stopPropagation(); onSeek(startMs); }}
      onContextMenu={onContextMenu}
      className={`absolute top-0 bottom-0 bg-blue-900/40 border ${selected ? "border-yellow-400 ring-1 ring-yellow-400" : "border-blue-500"} cursor-grab active:cursor-grabbing box-border`}
      style={{
        left: toPct(startMs, totalSourceMs),
        width: toPct(endMs - startMs, totalSourceMs),
        // No minWidth — small clips render at their true width so adjacent
        // segments after Remove-all-silences don't visually overlap each
        // other. If a clip is too narrow to click, zoom (Cmd+scroll).
        minWidth: 2,
      }}
      title={`Video clip · ${((endMs - startMs) / 1000).toFixed(1)}s · drag to move, S to split`}
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
  totalSourceMs,
  selected,
  onSelect,
  onContextMenu,
  onShift,
  onTrimCaption,
  onSeek,
  beginDrag,
}: {
  cap: Caption;
  totalSourceMs: number;
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
        left: toPct(start, totalSourceMs),
        width: toPct(Math.max(200, end - start), totalSourceMs),
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
  totalSourceMs,
  selected,
  onSelect,
  onContextMenu,
  onSeek,
  onChange,
  beginDrag,
}: {
  ov: TextOverlay;
  totalSourceMs: number;
  selected: boolean;
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onSeek: (sourceMs: number) => void;
  onChange: (patch: Partial<TextOverlay>) => void;
  beginDrag: (handler: (deltaMs: number) => void) => (e: React.MouseEvent) => void;
}) {
  const startAt = useRef({ start: ov.start_ms, end: ov.end_ms });
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
        left: toPct(ov.start_ms, totalSourceMs),
        width: toPct(Math.max(200, ov.end_ms - ov.start_ms), totalSourceMs),
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
  edl,
  totalSourceMs,
  selected,
  onSelect,
  onContextMenu,
  outputToSource,
  onChange,
  onSeek,
  beginDrag,
}: {
  br: BRollClip;
  edl: EDL;
  totalSourceMs: number;
  selected: boolean;
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  outputToSource: (outMs: number) => number;
  onChange: (patch: Partial<BRollClip>) => void;
  onSeek: (sourceMs: number) => void;
  beginDrag: (handler: (deltaMs: number) => void) => (e: React.MouseEvent) => void;
}) {
  const startSource = outputToSource(br.output_start_ms);
  const dur = br.trim_end_ms - br.trim_start_ms;
  const endSource = outputToSource(br.output_start_ms + dur);

  // Body drag — move output_start_ms.
  const snap = useRef(br.output_start_ms);
  const onBodyDown = beginDrag((deltaMs) => {
    const desiredSource = Math.max(0, Math.min(totalSourceMs, outputToSource(snap.current) + deltaMs));
    const newOutput = sourceTimeToEdlTime(edl, desiredSource);
    onChange({ output_start_ms: Math.round(newOutput) });
  });

  // Edge trim drags modify the b-roll's internal trim window (trim_start_ms
  // / trim_end_ms), keeping output_start_ms fixed. Left handle pushes
  // trim_start in, right handle pulls trim_end back. Both clamp within
  // [0, source_duration_ms].
  const trimSnap = useRef({ ts: br.trim_start_ms, te: br.trim_end_ms });
  const captureTrim = () => { trimSnap.current = { ts: br.trim_start_ms, te: br.trim_end_ms }; };
  // Source-side pixel scale is the same as the rest of the timeline. ms
  // here means "ms of internal trim shift", which equals 1:1 source-time.
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
      onClick={(e) => { e.stopPropagation(); onSeek(startSource); }}
      onContextMenu={onContextMenu}
      className={`absolute top-0 bottom-0 bg-purple-900/40 border ${selected ? "border-yellow-400 ring-1 ring-yellow-400" : "border-purple-500"} rounded cursor-grab active:cursor-grabbing px-1 flex items-center`}
      style={{
        left: toPct(startSource, totalSourceMs),
        width: toPct(Math.max(120, endSource - startSource), totalSourceMs),
        // Always at least 60px wide so the user can grab the body even when
        // the source-time mapping collapses (e.g., b-roll placed past the
        // current trim).
        minWidth: 60,
      }}
      title={`B-roll · ${br.mode} · ${(dur / 1000).toFixed(1)}s · drag to reposition`}
    >
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
