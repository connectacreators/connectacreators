// src/components/videoEditor/TrimTimeline.tsx
import { useCallback, useRef } from "react";
import type { EDL } from "@/lib/videoEditor/edl";

type Props = {
  edl: EDL;
  onChange: (next: EDL) => void;
};

export function TrimTimeline({ edl, onChange }: Props) {
  const clip = edl.clips[0];
  const totalSourceMs = edl.source.duration_ms;
  const trackRef = useRef<HTMLDivElement | null>(null);

  const pctFromMs = (ms: number) => (ms / totalSourceMs) * 100;

  const handleDrag = useCallback(
    (which: "in" | "out") => (e: React.MouseEvent) => {
      e.preventDefault();
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();

      const move = (ev: MouseEvent) => {
        const pct = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
        const ms = Math.round(pct * totalSourceMs);
        const next: EDL = {
          ...edl,
          clips: [
            which === "in"
              ? { ...clip, source_start_ms: Math.min(ms, clip.source_end_ms - 100) }
              : { ...clip, source_end_ms: Math.max(ms, clip.source_start_ms + 100) },
          ],
        };
        onChange(next);
      };
      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    },
    [clip, edl, onChange, totalSourceMs],
  );

  return (
    <div className="h-32 bg-neutral-950 border-t border-neutral-800 p-3">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-2">Video</div>
      <div ref={trackRef} className="relative h-10 bg-neutral-900 rounded select-none">
        {/* Selected region */}
        <div
          className="absolute top-0 bottom-0 bg-blue-900/40 border border-blue-500"
          style={{
            left: `${pctFromMs(clip.source_start_ms)}%`,
            width: `${pctFromMs(clip.source_end_ms - clip.source_start_ms)}%`,
          }}
        />
        {/* In handle */}
        <div
          onMouseDown={handleDrag("in")}
          className="absolute top-0 bottom-0 w-2 -ml-1 bg-blue-400 cursor-ew-resize"
          style={{ left: `${pctFromMs(clip.source_start_ms)}%` }}
        />
        {/* Out handle */}
        <div
          onMouseDown={handleDrag("out")}
          className="absolute top-0 bottom-0 w-2 -ml-1 bg-blue-400 cursor-ew-resize"
          style={{ left: `${pctFromMs(clip.source_end_ms)}%` }}
        />
      </div>
      <div className="text-[10px] text-neutral-500 mt-2">
        Trim: {(clip.source_start_ms / 1000).toFixed(1)}s → {(clip.source_end_ms / 1000).toFixed(1)}s
        ({((clip.source_end_ms - clip.source_start_ms) / 1000).toFixed(1)}s out)
      </div>
    </div>
  );
}
