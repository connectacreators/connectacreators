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
import { useCallback, useEffect, useMemo, useRef } from "react";
import type {
  BRollClip,
  Caption,
  EDL,
  Music,
  TextOverlay,
} from "@/lib/videoEditor/edl";
import { sourceTimeToEdlTime } from "@/lib/videoEditor/edl";

export type TimelineSelection =
  | { kind: "video" }
  | { kind: "caption"; id: string }
  | { kind: "text"; id: string }
  | { kind: "broll"; id: string }
  | { kind: "music" }
  | null;

type Props = {
  edl: EDL;
  playheadMs: number;
  selection: TimelineSelection;
  onSelect: (sel: TimelineSelection) => void;
  onSeek: (sourceMs: number) => void;
  onChangeTrim: (sourceStartMs: number, sourceEndMs: number) => void;
  onShiftCaption: (id: string, newFirstWordStartMs: number) => void;
  onChangeOverlay: (id: string, patch: Partial<TextOverlay>) => void;
  onChangeBRoll: (id: string, patch: Partial<BRollClip>) => void;
  onChangeMusic: (music: Music) => void;
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
    onShiftCaption, onChangeOverlay, onChangeBRoll, onChangeMusic,
  } = props;
  const totalSourceMs = edl.source.duration_ms;
  const trackWidthRef = useRef<HTMLDivElement | null>(null);
  const beginDrag = useTimeDrag(trackWidthRef, totalSourceMs);

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

  // Trim handles.
  const onTrimEdge = (which: "in" | "out") => beginDrag((deltaMs) => {
    const clip = edl.clips[0];
    if (which === "in") {
      const next = Math.max(0, Math.min(clip.source_end_ms - 100, clip.source_start_ms + deltaMs));
      onChangeTrim(next, clip.source_end_ms);
    } else {
      const next = Math.max(clip.source_start_ms + 100, Math.min(totalSourceMs, clip.source_end_ms + deltaMs));
      onChangeTrim(clip.source_start_ms, next);
    }
  });

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

  return (
    <div
      className="bg-neutral-950 border-t border-neutral-800 p-3 space-y-1.5"
      onMouseDown={(e) => {
        // Clicking on bare timeline whitespace clears the selection. Blocks
        // stopPropagation so this only fires on actual whitespace clicks.
        if (e.target === e.currentTarget) onSelect(null);
      }}
    >
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

      {/* Video — trim region with handles. */}
      <TrackRow label="Video" height={VIDEO_TRACK_HEIGHT}>
        <div
          onClick={() => onSelect({ kind: "video" })}
          className={`absolute top-0 bottom-0 bg-blue-900/40 border ${isSelected({ kind: "video" }) ? "border-yellow-400 ring-1 ring-yellow-400" : "border-blue-500"} cursor-pointer`}
          style={{
            left: toPct(clip.source_start_ms, totalSourceMs),
            width: toPct(clip.source_end_ms - clip.source_start_ms, totalSourceMs),
          }}
        />
        <div
          onMouseDown={onTrimEdge("in")}
          className="absolute top-0 bottom-0 w-2 -ml-1 bg-blue-400 cursor-ew-resize hover:bg-blue-300"
          style={{ left: toPct(clip.source_start_ms, totalSourceMs) }}
        />
        <div
          onMouseDown={onTrimEdge("out")}
          className="absolute top-0 bottom-0 w-2 -ml-1 bg-blue-400 cursor-ew-resize hover:bg-blue-300"
          style={{ left: toPct(clip.source_end_ms, totalSourceMs) }}
        />
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
            onShift={(t) => onShiftCaption(c.id, t)}
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

      <div className="text-[10px] text-neutral-500 pl-16">
        Trim {(clip.source_start_ms / 1000).toFixed(1)}s → {(clip.source_end_ms / 1000).toFixed(1)}s
        · {((clip.source_end_ms - clip.source_start_ms) / 1000).toFixed(1)}s out
        {selection && ` · selected: ${selection.kind}${"id" in selection ? ` (${selection.id.slice(0, 6)})` : ""}`}
      </div>
    </div>
  );
}

function CaptionBlock({
  cap,
  totalSourceMs,
  selected,
  onSelect,
  onShift,
  onSeek,
  beginDrag,
}: {
  cap: Caption;
  totalSourceMs: number;
  selected: boolean;
  onSelect: () => void;
  onShift: (newFirstWordStartMs: number) => void;
  onSeek: (sourceMs: number) => void;
  beginDrag: (handler: (deltaMs: number) => void) => (e: React.MouseEvent) => void;
}) {
  const start = cap.words[0]?.start_ms ?? 0;
  const end = cap.words[cap.words.length - 1]?.end_ms ?? start + 200;
  const snapStart = useRef(start);
  const onDown = beginDrag((delta) => {
    const dur = end - snapStart.current;
    const next = Math.max(0, Math.min(totalSourceMs - dur, snapStart.current + delta));
    onShift(next);
  });
  return (
    <div
      onMouseDown={(e) => {
        e.stopPropagation();
        snapStart.current = cap.words[0]?.start_ms ?? 0;
        onSelect();
        onDown(e);
      }}
      onClick={(e) => { e.stopPropagation(); onSeek(start); }}
      className={`absolute top-0 bottom-0 bg-blue-700/30 border ${selected ? "border-yellow-400 ring-1 ring-yellow-400" : "border-blue-500"} rounded cursor-grab active:cursor-grabbing px-1 flex items-center`}
      style={{
        left: toPct(start, totalSourceMs),
        width: toPct(Math.max(200, end - start), totalSourceMs),
      }}
      title={cap.words.map((w) => w.text).join(" ")}
    >
      <span className="text-[9px] text-blue-200 truncate">
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
  onSeek,
  onChange,
  beginDrag,
}: {
  ov: TextOverlay;
  totalSourceMs: number;
  selected: boolean;
  onSelect: () => void;
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
      className={`absolute top-0 bottom-0 bg-amber-800/40 border ${selected ? "border-yellow-400 ring-1 ring-yellow-400" : "border-amber-500"} rounded cursor-grab active:cursor-grabbing px-1 flex items-center`}
      style={{
        left: toPct(ov.start_ms, totalSourceMs),
        width: toPct(Math.max(200, ov.end_ms - ov.start_ms), totalSourceMs),
      }}
      title={ov.text}
    >
      <div
        onMouseDown={(e) => { e.stopPropagation(); captureStart(); onLeftDown(e); }}
        className="absolute left-0 top-0 bottom-0 w-1.5 bg-amber-400 cursor-ew-resize"
      />
      <div
        onMouseDown={(e) => { e.stopPropagation(); captureStart(); onRightDown(e); }}
        className="absolute right-0 top-0 bottom-0 w-1.5 bg-amber-400 cursor-ew-resize"
      />
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
  outputToSource: (outMs: number) => number;
  onChange: (patch: Partial<BRollClip>) => void;
  onSeek: (sourceMs: number) => void;
  beginDrag: (handler: (deltaMs: number) => void) => (e: React.MouseEvent) => void;
}) {
  // Display position uses output→source mapping. Width uses the source
  // distance between start and end so cuts collapse the visible block.
  const startSource = outputToSource(br.output_start_ms);
  const dur = br.trim_end_ms - br.trim_start_ms;
  const endSource = outputToSource(br.output_start_ms + dur);

  const snap = useRef(br.output_start_ms);
  const onDown = beginDrag((deltaMs) => {
    // Convert the source-time delta into a target source position, then
    // forward-map through clips to the new output-time start. Snap-forward
    // if dropped inside a removed gap.
    const desiredSource = Math.max(0, Math.min(totalSourceMs, outputToSource(snap.current) + deltaMs));
    const newOutput = sourceTimeToEdlTime(edl, desiredSource);
    onChange({ output_start_ms: Math.round(newOutput) });
  });

  return (
    <div
      onMouseDown={(e) => {
        e.stopPropagation();
        snap.current = br.output_start_ms;
        onSelect();
        onDown(e);
      }}
      onClick={(e) => { e.stopPropagation(); onSeek(startSource); }}
      className={`absolute top-0 bottom-0 bg-purple-900/40 border ${selected ? "border-yellow-400 ring-1 ring-yellow-400" : "border-purple-500"} rounded cursor-grab active:cursor-grabbing px-1 flex items-center`}
      style={{
        left: toPct(startSource, totalSourceMs),
        width: toPct(Math.max(120, endSource - startSource), totalSourceMs),
      }}
      title={`B-roll · ${br.mode} · ${(dur / 1000).toFixed(1)}s`}
    >
      <span className="text-[9px] text-purple-200 truncate">{br.mode}</span>
    </div>
  );
}
