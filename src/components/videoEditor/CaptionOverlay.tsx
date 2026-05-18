// src/components/videoEditor/CaptionOverlay.tsx
// Renders the active caption (the one whose word range contains the current
// playhead in source time) on top of the preview <video>. Mirrors the styles
// the worker burns in via ASS so what you see is roughly what you export.
import { useEffect, useLayoutEffect, useState } from "react";
import type { Caption } from "@/lib/videoEditor/edl";
import { CAPTION_PRESETS, toPreviewStyle } from "@/lib/videoEditor/captionPresets";

export type VideoBox = { left: number; top: number; width: number; height: number };

type Props = {
  captions: Caption[];
  // Playhead in SOURCE time — matches the timestamps stored on caption words.
  sourceMs: number;
  // The size of the actual rendered <video> within its container, expressed
  // in container-relative coords (left/top relative to the absolute-positioned
  // overlay's offsetParent).
  videoBox: VideoBox | null;
};

export function CaptionOverlay({ captions, sourceMs, videoBox }: Props) {
  if (!videoBox || captions.length === 0) return null;

  const active = captions.find((c) => {
    if (c.words.length === 0) return false;
    const start = c.words[0].start_ms;
    const end = c.words[c.words.length - 1].end_ms;
    return sourceMs >= start && sourceMs <= end;
  });
  if (!active) return null;

  const spec = CAPTION_PRESETS[active.preset];
  const activeWordIdx = active.words.findIndex(
    (w) => sourceMs >= w.start_ms && sourceMs <= w.end_ms,
  );

  const left = videoBox.left + (active.position.x_pct / 100) * videoBox.width;
  const top = videoBox.top + (active.position.y_pct / 100) * videoBox.height;

  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left,
        top,
        transform: "translate(-50%, -50%)",
        maxWidth: videoBox.width * 0.9,
        textAlign: "center",
        background: spec.background === "none" ? undefined : spec.background,
        padding: spec.background === "none" ? 0 : "0.2em 0.6em",
        borderRadius: spec.background === "none" ? 0 : 8,
      }}
    >
      {active.words.map((w, i) => (
        <span
          key={i}
          style={toPreviewStyle(spec, videoBox.height, i === activeWordIdx)}
        >
          {w.text + (i === active.words.length - 1 ? "" : " ")}
        </span>
      ))}
    </div>
  );
}

// Tracks the <video>'s rendered rectangle relative to its parent container.
// The parent must be position:relative so the absolute-positioned overlay
// aligns correctly.
export function useVideoPictureBox(videoRef: React.RefObject<HTMLVideoElement>): VideoBox | null {
  const [box, setBox] = useState<VideoBox | null>(null);

  useLayoutEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const parent = v.parentElement;
    if (!parent) return;

    const measure = () => {
      const vr = v.getBoundingClientRect();
      const pr = parent.getBoundingClientRect();
      // Drop measurements before metadata arrives (zero dims).
      if (vr.width === 0 || vr.height === 0) return;
      setBox({
        left: vr.left - pr.left,
        top: vr.top - pr.top,
        width: vr.width,
        height: vr.height,
      });
    };
    measure();
    const obs = new ResizeObserver(measure);
    obs.observe(parent);
    obs.observe(v);
    v.addEventListener("loadedmetadata", measure);
    return () => {
      obs.disconnect();
      v.removeEventListener("loadedmetadata", measure);
    };
  }, [videoRef]);

  useEffect(() => {
    const onResize = () => {
      const v = videoRef.current;
      const parent = v?.parentElement;
      if (!v || !parent) return;
      const vr = v.getBoundingClientRect();
      const pr = parent.getBoundingClientRect();
      if (vr.width === 0 || vr.height === 0) return;
      setBox({
        left: vr.left - pr.left,
        top: vr.top - pr.top,
        width: vr.width,
        height: vr.height,
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [videoRef]);

  return box;
}
