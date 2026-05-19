// src/components/videoEditor/PreviewStage.tsx
import { useEffect, useRef } from "react";
import type { EDL } from "@/lib/videoEditor/edl";
import { CaptionOverlay, useVideoPictureBox } from "./CaptionOverlay";

type Props = {
  sourceUrl: string;
  edl: EDL;
  // Controlled playhead in ms (0 to totalDurationMs(edl)).
  playheadMs: number;
  playing: boolean;
  onPlayheadChange: (ms: number) => void;
  onEnded: () => void;
  onMoveCaption?: (captionId: string, x_pct: number, y_pct: number) => void;
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

export function PreviewStage({ sourceUrl, edl, playheadMs, playing, onPlayheadChange, onEnded, onMoveCaption }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoBox = useVideoPictureBox(videoRef);

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

  // Per-frame: emit playhead in EDL time and jump across removed clip gaps.
  // The previous version only checked the current clip's end boundary, which
  // failed when sourceMs landed BETWEEN clips (e.g. after "Remove all silences"
  // created multiple non-contiguous segments). Playback would freeze in the
  // first silence and never reach the next clip — the user reported that as
  // "the silence function only trims to the first sentence."
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let raf = 0;
    const tick = () => {
      if (!v.paused) {
        const sourceMs = v.currentTime * 1000;
        // Find which clip (if any) currently contains the video's source time.
        // Accumulate edl-time only for clips that have *already fully played*.
        let edlMs = 0;
        let insideClipIdx = -1;
        for (let i = 0; i < edl.clips.length; i++) {
          const c = edl.clips[i];
          if (sourceMs >= c.source_start_ms && sourceMs <= c.source_end_ms) {
            edlMs += sourceMs - c.source_start_ms;
            insideClipIdx = i;
            break;
          }
          if (c.source_end_ms < sourceMs) {
            edlMs += Math.max(0, c.source_end_ms - c.source_start_ms);
          }
        }
        if (insideClipIdx >= 0) {
          onPlayheadChange(edlMs);
        } else {
          // We're in a removed gap. Jump to the next clip that starts after
          // the current sourceMs; if there isn't one, we've fallen off the end.
          const next = edl.clips.find((c) => c.source_start_ms > sourceMs);
          if (next) {
            v.currentTime = next.source_start_ms / 1000;
          } else {
            v.pause();
            onEnded();
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [edl, onPlayheadChange, onEnded]);

  // Caption overlay needs the source time, not EDL time.
  const sourceMs = (() => {
    const mapped = edlTimeToSourceTime(edl, playheadMs);
    return mapped ? mapped.sourceMs : 0;
  })();

  return (
    <div className="relative flex-1 flex items-center justify-center bg-black min-h-0">
      <video
        ref={videoRef}
        src={sourceUrl}
        className="max-h-full max-w-full"
        playsInline
        controls={false}
      />
      <CaptionOverlay
        captions={edl.captions ?? []}
        sourceMs={sourceMs}
        videoBox={videoBox}
        onMoveCaption={onMoveCaption}
      />
    </div>
  );
}
