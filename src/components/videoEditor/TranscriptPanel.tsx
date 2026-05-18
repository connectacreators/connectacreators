// src/components/videoEditor/TranscriptPanel.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { TranscriptWord, SilenceSegment } from "@/hooks/useTranscript";
import type { CaptionPreset } from "@/lib/videoEditor/edl";
import { CAPTION_PRESETS } from "@/lib/videoEditor/captionPresets";

type Props = {
  state:
    | { phase: "idle" }
    | { phase: "loading" }
    | { phase: "missing" }
    | { phase: "running"; jobStatus: "queued" | "running" | "done" | "error"; progress: number; errorMessage?: string | null }
    | { phase: "ready"; words: TranscriptWord[]; silences: SilenceSegment[] }
    | { phase: "error"; message: string };
  playheadMs: number;
  onSeek: (ms: number) => void;
  onStart: () => void;
  onRemoveSilences: () => void;
  onCreateCaption: (words: TranscriptWord[], preset: CaptionPreset) => void;
};

function formatSeconds(ms: number) {
  const s = ms / 1000;
  return s < 10 ? s.toFixed(1) + "s" : Math.round(s) + "s";
}

export function TranscriptPanel(props: Props) {
  const activeRef = useRef<HTMLSpanElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Drag-select state for "Make caption from this range."
  // dragStart/dragEnd are word indices. While the user is mid-drag, dragging
  // is true; on release, dragging flips back to false but start/end stay so
  // the "Make caption" toolbar can read them. A single-word click without
  // movement still triggers a seek instead of a selection — see handlers.
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [dragMoved, setDragMoved] = useState(false);

  // Auto-end drag when the mouse releases anywhere — handles users dragging
  // out of the panel before letting go.
  useEffect(() => {
    if (!isMouseDown) return;
    const onUp = () => setIsMouseDown(false);
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [isMouseDown]);

  // Find active word index (first whose range contains the playhead).
  const activeIndex = useMemo(() => {
    if (props.state.phase !== "ready") return -1;
    const ph = props.playheadMs;
    return props.state.words.findIndex((w) => ph >= w.start_ms && ph <= w.end_ms);
  }, [props.state, props.playheadMs]);

  // Auto-scroll the active word into view.
  useEffect(() => {
    if (activeRef.current && containerRef.current) {
      const el = activeRef.current;
      const c = containerRef.current;
      const elRect = el.getBoundingClientRect();
      const cRect = c.getBoundingClientRect();
      if (elRect.top < cRect.top + 40 || elRect.bottom > cRect.bottom - 40) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [activeIndex]);

  // Build interleaved render units: word | silence-gap marker.
  const units = useMemo(() => {
    if (props.state.phase !== "ready") return [] as Array<
      | { kind: "word"; index: number; word: TranscriptWord }
      | { kind: "silence"; ms: number }
    >;
    const { words, silences } = props.state;
    const list: Array<
      | { kind: "word"; index: number; word: TranscriptWord }
      | { kind: "silence"; ms: number }
    > = [];
    let silenceCursor = 0;
    for (let i = 0; i < words.length; i++) {
      list.push({ kind: "word", index: i, word: words[i] });
      // Insert any silence that ends before the next word starts.
      const nextStart = i + 1 < words.length ? words[i + 1].start_ms : Infinity;
      while (
        silenceCursor < silences.length &&
        silences[silenceCursor].end_ms <= nextStart
      ) {
        const s = silences[silenceCursor];
        if (s.start_ms >= words[i].end_ms) {
          list.push({ kind: "silence", ms: s.end_ms - s.start_ms });
        }
        silenceCursor++;
      }
    }
    return list;
  }, [props.state]);

  const totalSilenceMs = useMemo(() => {
    if (props.state.phase !== "ready") return 0;
    return props.state.silences.reduce((acc, s) => acc + (s.end_ms - s.start_ms), 0);
  }, [props.state]);

  const selectionRange = useMemo(() => {
    if (dragStart === null || dragEnd === null) return null;
    const lo = Math.min(dragStart, dragEnd);
    const hi = Math.max(dragStart, dragEnd);
    if (lo === hi && !dragMoved) return null;          // single-click = seek, not selection
    return { lo, hi };
  }, [dragStart, dragEnd, dragMoved]);

  const handleWordMouseDown = (i: number) => {
    setDragStart(i);
    setDragEnd(i);
    setDragMoved(false);
    setIsMouseDown(true);
  };
  const handleWordMouseEnter = (i: number) => {
    if (!isMouseDown) return;
    setDragEnd(i);
    setDragMoved(true);
  };
  const handleWordClick = (i: number, ms: number) => {
    // Only treat as a seek if the user did not drag-select.
    if (!dragMoved) props.onSeek(ms);
  };

  const isSelected = (i: number) =>
    selectionRange ? i >= selectionRange.lo && i <= selectionRange.hi : false;

  const createCaption = (preset: CaptionPreset) => {
    if (!selectionRange || props.state.phase !== "ready") return;
    const words = props.state.words.slice(selectionRange.lo, selectionRange.hi + 1);
    if (words.length === 0) return;
    props.onCreateCaption(words, preset);
    setDragStart(null);
    setDragEnd(null);
    setDragMoved(false);
  };

  return (
    <div className="h-full flex flex-col bg-neutral-950 border-l border-neutral-800 text-neutral-200 text-sm">
      <div className="p-3 border-b border-neutral-800 space-y-2">
        <div className="text-xs uppercase tracking-wider text-neutral-500">Transcript</div>
        {props.state.phase === "ready" && (
          <>
            <div className="text-[11px] text-neutral-400">
              {props.state.silences.length} silences
              {totalSilenceMs > 0 ? ` · ${formatSeconds(totalSilenceMs)} total` : ""}
            </div>
            <button
              className="w-full px-2 py-1 text-xs bg-blue-700 hover:bg-blue-600 text-white rounded disabled:opacity-50"
              onClick={props.onRemoveSilences}
              disabled={props.state.silences.length === 0}
            >
              Remove all silences
            </button>
          </>
        )}
      </div>

      {/* Caption toolbar — only visible when a range of words is drag-selected. */}
      {selectionRange && props.state.phase === "ready" && (
        <div className="p-3 border-b border-neutral-800 bg-neutral-900/60 space-y-2">
          <div className="text-[11px] text-neutral-400">
            {selectionRange.hi - selectionRange.lo + 1} words selected — pick a caption style:
          </div>
          <div className="grid grid-cols-3 gap-1">
            {(Object.keys(CAPTION_PRESETS) as CaptionPreset[]).map((p) => (
              <button
                key={p}
                onClick={() => createCaption(p)}
                title={CAPTION_PRESETS[p].description}
                className="text-[10px] px-2 py-1 bg-neutral-800 hover:bg-blue-700 text-white rounded leading-tight"
              >
                {CAPTION_PRESETS[p].label}
              </button>
            ))}
          </div>
          <button
            onClick={() => { setDragStart(null); setDragEnd(null); setDragMoved(false); }}
            className="w-full text-[10px] text-neutral-500 hover:text-neutral-300"
          >
            Clear selection
          </button>
        </div>
      )}

      <div ref={containerRef} className="flex-1 overflow-y-auto p-3 leading-relaxed">
        {props.state.phase === "idle" || props.state.phase === "loading" ? (
          <div className="text-neutral-500 text-xs">Loading…</div>
        ) : props.state.phase === "missing" ? (
          <div className="space-y-2 text-center pt-6">
            <p className="text-neutral-400 text-xs">No transcript yet.</p>
            <button
              onClick={props.onStart}
              className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white text-xs rounded"
            >
              Transcribe audio
            </button>
          </div>
        ) : props.state.phase === "running" ? (
          <div className="space-y-2">
            <p className="text-xs text-neutral-400">
              Transcribing… ({props.state.progress}%)
            </p>
            <div className="h-1.5 bg-neutral-800 rounded overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all"
                style={{ width: `${props.state.progress}%` }}
              />
            </div>
            {props.state.errorMessage && (
              <p className="text-[10px] text-red-400">{props.state.errorMessage}</p>
            )}
          </div>
        ) : props.state.phase === "error" ? (
          <p className="text-red-400 text-xs">Error: {props.state.message}</p>
        ) : (
          <p className="text-xs select-none">
            {units.map((u, idx) =>
              u.kind === "word" ? (
                <span
                  key={`w${idx}`}
                  ref={u.index === activeIndex ? activeRef : null}
                  onMouseDown={() => handleWordMouseDown(u.index)}
                  onMouseEnter={() => handleWordMouseEnter(u.index)}
                  onClick={() => handleWordClick(u.index, u.word.start_ms)}
                  className={`cursor-pointer rounded px-0.5 ${
                    isSelected(u.index)
                      ? "bg-emerald-700 text-white"
                      : u.index === activeIndex
                      ? "bg-blue-600 text-white"
                      : "hover:bg-neutral-800"
                  }`}
                >
                  {u.word.text + " "}
                </span>
              ) : (
                <span
                  key={`s${idx}`}
                  className="inline-block mx-1 px-1.5 py-0.5 text-[9px] text-neutral-500 bg-neutral-900 rounded align-middle"
                  title="Silence"
                >
                  · {formatSeconds(u.ms)} ·
                </span>
              ),
            )}
          </p>
        )}
      </div>
    </div>
  );
}
