// src/components/videoEditor/PreviewStage.tsx
import { useEffect, useRef } from "react";
import type { EDL } from "@/lib/videoEditor/edl";

type Props = {
  sourceUrl: string;
  edl: EDL;
  // Controlled playhead in ms (0 to totalDurationMs(edl)).
  playheadMs: number;
  playing: boolean;
  onPlayheadChange: (ms: number) => void;
  onEnded: () => void;
};

// Map EDL playhead (output time) -> source time (input time) by walking clips.
function edlTimeToSourceTime(edl: EDL, edlMs: number): { sourceMs: number; clipIndex: number } | null {
  let acc = 0;
  for (let i = 0; i < edl.clips.length; i++) {
    const c = edl.clips[i];
    const len = Math.max(0, c.source_end_ms - c.source_start_ms);
    if (edlMs <= acc + len) {
      return { sourceMs: c.source_start_ms + (edlMs - acc), clipIndex: i };
    }
    acc += len;
  }
  return null;
}

export function PreviewStage({ sourceUrl, edl, playheadMs, playing, onPlayheadChange, onEnded }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Sync video element's currentTime with edl playhead.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const mapped = edlTimeToSourceTime(edl, playheadMs);
    if (!mapped) return;
    const sourceSec = mapped.sourceMs / 1000;
    if (Math.abs(v.currentTime - sourceSec) > 0.05) {
      v.currentTime = sourceSec;
    }
  }, [playheadMs, edl]);

  // Drive play/pause.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (playing) void v.play();
    else v.pause();
  }, [playing]);

  // Per-frame: emit playhead changes and stop at clip boundary.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let raf = 0;
    const tick = () => {
      if (!v.paused) {
        const sourceMs = v.currentTime * 1000;
        let acc = 0;
        for (const c of edl.clips) {
          if (sourceMs >= c.source_start_ms && sourceMs <= c.source_end_ms) {
            onPlayheadChange(acc + (sourceMs - c.source_start_ms));
            break;
          }
          acc += Math.max(0, c.source_end_ms - c.source_start_ms);
        }
        // If we ran past the active clip's end, advance to the next clip's start.
        const mapped = edlTimeToSourceTime(edl, acc);
        if (mapped) {
          const active = edl.clips[mapped.clipIndex];
          if (sourceMs > active.source_end_ms) {
            const nextClip = edl.clips[mapped.clipIndex + 1];
            if (nextClip) v.currentTime = nextClip.source_start_ms / 1000;
            else {
              v.pause();
              onEnded();
            }
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [edl, onPlayheadChange, onEnded]);

  return (
    <div className="flex-1 flex items-center justify-center bg-black min-h-0">
      <video
        ref={videoRef}
        src={sourceUrl}
        className="max-h-full max-w-full"
        playsInline
        controls={false}
      />
    </div>
  );
}
