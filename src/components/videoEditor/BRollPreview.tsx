// src/components/videoEditor/BRollPreview.tsx
// Renders active b-roll clips on top of the main video preview. Each clip
// is its own <video> element synced to the EDL playhead: when the playhead
// (in OUTPUT time) is inside [output_start_ms, output_start_ms + dur], the
// b-roll plays from `trim_start_ms + (playhead - output_start_ms)`. Mode
// is either fullscreen (covers the entire picture box) or pip (small box
// at x_pct/y_pct with width width_pct of the main frame).
//
// Signed URLs are cached in a Map by storage_path so adjacent renders
// don't re-sign the same clip. B-roll audio is muted in preview — the
// worker also drops it on export.
import { useEffect, useMemo, useRef, useState } from "react";
import type { BRollClip } from "@/lib/videoEditor/edl";
import { supabase } from "@/integrations/supabase/client";
import type { VideoBox } from "./useVideoPictureBox";

type Props = {
  brolls: BRollClip[];
  // Current playhead in EDL OUTPUT time.
  playheadMs: number;
  playing: boolean;
  videoBox: VideoBox | null;
};

export function BRollPreview({ brolls, playheadMs, playing, videoBox }: Props) {
  const [urls, setUrls] = useState<Record<string, string>>({});

  // Sign each b-roll's storage_path on demand. Re-signs whenever the set
  // of storage paths changes; existing entries are kept.
  useEffect(() => {
    if (!videoBox) return;
    const paths = brolls.map((b) => b.source_storage_path);
    const missing = paths.filter((p) => !urls[p]);
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const additions: Record<string, string> = {};
      for (const p of missing) {
        try {
          const { data, error } = await supabase.storage
            .from("footage")
            .createSignedUrl(p, 3600);
          if (!cancelled && data?.signedUrl && !error) {
            additions[p] = data.signedUrl;
          }
        } catch { /* swallow; non-blocking */ }
      }
      if (!cancelled && Object.keys(additions).length > 0) {
        setUrls((prev) => ({ ...prev, ...additions }));
      }
    })();
    return () => { cancelled = true; };
  }, [brolls, urls, videoBox]);

  // Active b-rolls = those whose window contains the current playhead.
  // Multiple can be active simultaneously (e.g. a fullscreen + a pip).
  const active = useMemo(() => {
    return brolls.filter((b) => {
      const dur = b.trim_end_ms - b.trim_start_ms;
      return playheadMs >= b.output_start_ms && playheadMs <= b.output_start_ms + dur;
    });
  }, [brolls, playheadMs]);

  if (!videoBox || active.length === 0) return null;

  return (
    <>
      {active.map((br) =>
        br.kind === "image" ? (
          <BRollImage
            key={br.id}
            br={br}
            src={urls[br.source_storage_path]}
            videoBox={videoBox}
          />
        ) : (
          <BRollVideo
            key={br.id}
            br={br}
            src={urls[br.source_storage_path]}
            playheadMs={playheadMs}
            playing={playing}
            videoBox={videoBox}
          />
        ),
      )}
    </>
  );
}

// Position of a b-roll clip within the picture box — shared by the video and
// still-image renderers. Fullscreen covers the box; PIP is a smaller frame.
function brollBoxStyle(br: BRollClip, videoBox: VideoBox): React.CSSProperties {
  if (br.mode === "fullscreen") {
    return {
      left: videoBox.left,
      top: videoBox.top,
      width: videoBox.width,
      height: videoBox.height,
    };
  }
  const w = (br.position.width_pct / 100) * videoBox.width;
  // Keep the aspect via auto height (we don't know the b-roll's natural dims
  // at render time; let the element handle it via objectFit:contain).
  const cx = videoBox.left + (br.position.x_pct / 100) * videoBox.width;
  const cy = videoBox.top + (br.position.y_pct / 100) * videoBox.height;
  return {
    left: cx - w / 2,
    top: cy - (w * 9 / 16) / 2, // approximate; libass-side picks real aspect
    width: w,
    height: "auto",
  };
}

// Still image b-roll: no playhead sync, just held on screen for its window.
function BRollImage({
  br,
  src,
  videoBox,
}: {
  br: BRollClip;
  src: string | undefined;
  videoBox: VideoBox;
}) {
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      className="absolute pointer-events-none object-cover"
      style={{
        ...brollBoxStyle(br, videoBox),
        outline: br.mode === "pip" ? "1px solid rgba(255,255,255,0.4)" : undefined,
        borderRadius: br.mode === "pip" ? 6 : 0,
      }}
    />
  );
}

function BRollVideo({
  br,
  src,
  playheadMs,
  playing,
  videoBox,
}: {
  br: BRollClip;
  src: string | undefined;
  playheadMs: number;
  playing: boolean;
  videoBox: VideoBox;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);

  // Compute the desired b-roll currentTime each render — derived from how
  // far into the clip's output window the playhead has progressed.
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const offsetIntoClip = playheadMs - br.output_start_ms;
    const desiredSec = (br.trim_start_ms + Math.max(0, offsetIntoClip)) / 1000;
    if (Math.abs(v.currentTime - desiredSec) > 0.1) {
      try { v.currentTime = desiredSec; } catch { /* before metadata */ }
    }
    if (playing) {
      void v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [playing, playheadMs, br.output_start_ms, br.trim_start_ms]);

  if (!src) return null;

  const style = brollBoxStyle(br, videoBox);

  return (
    <video
      ref={ref}
      src={src}
      muted
      playsInline
      preload="auto"
      className="absolute pointer-events-none object-cover"
      style={{
        ...style,
        // PIP boxes get a subtle border so they're visible against a dark
        // matching background; fullscreen has none.
        outline: br.mode === "pip" ? "1px solid rgba(255,255,255,0.4)" : undefined,
        borderRadius: br.mode === "pip" ? 6 : 0,
      }}
    />
  );
}
