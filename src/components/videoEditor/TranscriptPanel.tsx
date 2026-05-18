// src/components/videoEditor/TranscriptPanel.tsx
import { useEffect, useMemo, useRef } from "react";
import type { TranscriptWord, SilenceSegment } from "@/hooks/useTranscript";

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
};

function formatSeconds(ms: number) {
  const s = ms / 1000;
  return s < 10 ? s.toFixed(1) + "s" : Math.round(s) + "s";
}

export function TranscriptPanel(props: Props) {
  const activeRef = useRef<HTMLSpanElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

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
        // Only show silences strictly after this word — skip ones we've already passed.
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
          <p className="text-xs">
            {units.map((u, idx) =>
              u.kind === "word" ? (
                <span
                  key={`w${idx}`}
                  ref={u.index === activeIndex ? activeRef : null}
                  onClick={() => props.onSeek(u.word.start_ms)}
                  className={`cursor-pointer rounded px-0.5 ${
                    u.index === activeIndex
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
