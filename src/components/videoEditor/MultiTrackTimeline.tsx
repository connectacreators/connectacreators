// src/components/videoEditor/MultiTrackTimeline.tsx
// Multi-track timeline below the preview. Time axis = source video duration.
// Tracks (top → bottom):
//   1. Ruler        — time labels every 1/2/5/10s depending on duration.
//   2. Video        — single block from clip.source_start_ms .. source_end_ms,
//                      trim handles on both edges (existing behaviour).
//   3. Captions     — one block per caption (first word start .. last word end);
//                      drag body to shift all words in source time, click to seek.
//   4. Text         — one block per text_overlay (start_ms..end_ms in source time);
//                      drag body to translate, drag edges to resize.
//   5. B-roll       — one block per b_roll clip mapped from OUTPUT time to a
//                      source-time position by walking edl.clips. Display-only
//                      for now (drag would require inverse-mapping).
//   6. Music        — full-width emerald strip; drag to shift music_start_ms.
//
// Every drag updates the EDL through the provided handlers. The visible time
// scale = source.duration_ms, so all blocks share a common pixel/ms ratio.
import { useCallback, useMemo, useRef } from "react";
import type {
  BRollClip,
  Caption,
  EDL,
  Music,
  TextOverlay,
} from "@/lib/videoEditor/edl";

type Props = {
  edl: EDL;
  // Used for seek-to-block clicks and the playhead cursor.
  playheadMs: number;
  onSeek: (sourceMs: number) => void;
  onChangeTrim: (sourceStartMs: number, sourceEndMs: number) => void;
  // Shift a caption block so its first word starts at `newFirstWordStartMs`.
  // The handler in VideoEditor translates all words by the delta from the
  // current first word position. Absolute (not incremental).
  onShiftCaption: (id: string, newFirstWordStartMs: number) => void;
  onChangeOverlay: (id: string, patch: Partial<TextOverlay>) => void;
  onChangeMusic: (music: Music) => void;
};

const TRACK_HEIGHT = 22;
const RULER_HEIGHT = 18;
const VIDEO_TRACK_HEIGHT = 32;

// One row of the timeline. `label` shows on the left rail; `children` is
// absolutely-positioned within the right (track) area.
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

// Source-time-percent → CSS percent string.
function toPct(ms: number, totalMs: number): string {
  return `${(ms / totalMs) * 100}%`;
}

// Generic helper to attach a drag-to-translate handler. `unitMsPerPx` is the
// pixel-to-ms scale based on the track's current rendered width. Each drag
// reports a delta in ms relative to where the pointer first went down.
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
  const { edl, playheadMs, onSeek, onChangeTrim, onShiftCaption, onChangeOverlay, onChangeMusic } = props;
  const totalSourceMs = edl.source.duration_ms;
  const trackWidthRef = useRef<HTMLDivElement | null>(null);
  const beginDrag = useTimeDrag(trackWidthRef, totalSourceMs);

  // Convert the EDL-time playhead into a source-time position so the
  // visual cursor on this source-time axis lines up with what's playing.
  const playheadSourceMs = useMemo(() => {
    let acc = 0;
    for (const c of edl.clips) {
      const len = Math.max(0, c.source_end_ms - c.source_start_ms);
      if (playheadMs <= acc + len) return c.source_start_ms + (playheadMs - acc);
      acc += len;
    }
    return edl.clips[edl.clips.length - 1]?.source_end_ms ?? 0;
  }, [edl.clips, playheadMs]);

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

  // Trim handles. Reuse the existing per-edge pattern.
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

  // Convert an OUTPUT-time millisecond to a SOURCE-time millisecond by walking
  // clips. Used to position b-roll blocks (whose times live in output space)
  // on this source-time axis.
  const outputToSource = (outMs: number): number => {
    let acc = 0;
    for (const c of edl.clips) {
      const len = Math.max(0, c.source_end_ms - c.source_start_ms);
      if (outMs <= acc + len) return c.source_start_ms + (outMs - acc);
      acc += len;
    }
    return totalSourceMs;
  };

  return (
    <div className="bg-neutral-950 border-t border-neutral-800 p-3 space-y-1.5">
      {/* Ruler — click/drag to seek. Shares its width ref with all blocks
          so the pixel-to-ms scale is consistent. */}
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
          {/* Playhead cursor on the ruler */}
          <div
            className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-yellow-400 pointer-events-none"
            style={{ left: toPct(playheadSourceMs, totalSourceMs) }}
          />
        </div>
      </div>

      {/* Video — trim region with handles. */}
      <TrackRow label="Video" height={VIDEO_TRACK_HEIGHT}>
        <div
          className="absolute top-0 bottom-0 bg-blue-900/40 border border-blue-500"
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
        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0 w-px bg-yellow-400 pointer-events-none"
          style={{ left: toPct(playheadMs, totalSourceMs) }}
        />
      </TrackRow>

      {/* Captions — one block per caption block. */}
      <TrackRow label="Captions">
        {(edl.captions ?? []).map((c) => (
          <CaptionBlock
            key={c.id}
            cap={c}
            totalSourceMs={totalSourceMs}
            onShift={(delta) => onShiftCaption(c.id, delta)}
            onSeek={onSeek}
            beginDrag={beginDrag}
          />
        ))}
      </TrackRow>

      {/* Text overlays — draggable + resizable. */}
      <TrackRow label="Text">
        {(edl.text_overlays ?? []).map((ov) => (
          <OverlayBlock
            key={ov.id}
            ov={ov}
            totalSourceMs={totalSourceMs}
            onSeek={onSeek}
            onChange={(patch) => onChangeOverlay(ov.id, patch)}
            beginDrag={beginDrag}
          />
        ))}
      </TrackRow>

      {/* B-roll — display only for now (position is in output time). */}
      <TrackRow label="B-roll">
        {(edl.b_roll ?? []).map((br) => {
          const startSource = outputToSource(br.output_start_ms);
          const dur = br.trim_end_ms - br.trim_start_ms;
          const endSource = outputToSource(br.output_start_ms + dur);
          return (
            <div
              key={br.id}
              onClick={() => onSeek(startSource)}
              className="absolute top-0 bottom-0 bg-purple-900/40 border border-purple-500 rounded cursor-pointer hover:bg-purple-900/60 px-1 flex items-center"
              style={{
                left: toPct(startSource, totalSourceMs),
                width: toPct(Math.max(100, endSource - startSource), totalSourceMs),
              }}
              title={`B-roll · ${br.mode} · ${(dur / 1000).toFixed(1)}s`}
            >
              <span className="text-[9px] text-purple-200 truncate">{br.mode}</span>
            </div>
          );
        })}
      </TrackRow>

      {/* Music — single full-width block, drag to shift music_start_ms. */}
      {edl.music ? (
        <TrackRow label="Music">
          <div
            onMouseDown={beginDrag((deltaMs) => {
              const next = Math.max(0, (edl.music?.music_start_ms ?? 0) + deltaMs);
              onChangeMusic({ ...edl.music!, music_start_ms: next });
            })}
            className="absolute top-0 bottom-0 left-0 right-0 bg-emerald-900/50 border border-emerald-500 rounded cursor-grab active:cursor-grabbing flex items-center px-2"
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
      </div>
    </div>
  );
}

function CaptionBlock({
  cap,
  totalSourceMs,
  onShift,
  onSeek,
  beginDrag,
}: {
  cap: Caption;
  totalSourceMs: number;
  onShift: (newFirstWordStartMs: number) => void;
  onSeek: (sourceMs: number) => void;
  beginDrag: (handler: (deltaMs: number) => void) => (e: React.MouseEvent) => void;
}) {
  const start = cap.words[0]?.start_ms ?? 0;
  const end = cap.words[cap.words.length - 1]?.end_ms ?? start + 200;
  // Snapshot the first-word start at drag-down so each mousemove emits the
  // ABSOLUTE target start (snapshot + delta) — avoids accumulating shifts.
  const snapStart = useRef(start);
  const onDown = beginDrag((delta) => {
    const dur = end - snapStart.current;
    const next = Math.max(0, Math.min(totalSourceMs - dur, snapStart.current + delta));
    onShift(next);
  });
  return (
    <div
      onMouseDown={(e) => { snapStart.current = cap.words[0]?.start_ms ?? 0; onDown(e); }}
      onClick={(e) => { e.stopPropagation(); onSeek(start); }}
      className="absolute top-0 bottom-0 bg-blue-700/30 border border-blue-500 rounded cursor-grab active:cursor-grabbing px-1 flex items-center"
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
  onSeek,
  onChange,
  beginDrag,
}: {
  ov: TextOverlay;
  totalSourceMs: number;
  onSeek: (sourceMs: number) => void;
  onChange: (patch: Partial<TextOverlay>) => void;
  beginDrag: (handler: (deltaMs: number) => void) => (e: React.MouseEvent) => void;
}) {
  // Snapshot start/end at drag-start so cumulative delta works correctly.
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
      onMouseDown={(e) => { captureStart(); onBodyDown(e); }}
      onClick={(e) => { e.stopPropagation(); onSeek(ov.start_ms); }}
      className="absolute top-0 bottom-0 bg-amber-800/40 border border-amber-500 rounded cursor-grab active:cursor-grabbing px-1 flex items-center"
      style={{
        left: toPct(ov.start_ms, totalSourceMs),
        width: toPct(Math.max(200, ov.end_ms - ov.start_ms), totalSourceMs),
      }}
      title={ov.text}
    >
      {/* Edge handles for resize */}
      <div
        onMouseDown={(e) => { captureStart(); onLeftDown(e); }}
        className="absolute left-0 top-0 bottom-0 w-1.5 bg-amber-400 cursor-ew-resize"
      />
      <div
        onMouseDown={(e) => { captureStart(); onRightDown(e); }}
        className="absolute right-0 top-0 bottom-0 w-1.5 bg-amber-400 cursor-ew-resize"
      />
      <span className="text-[9px] text-amber-200 truncate px-2">{ov.text}</span>
    </div>
  );
}
