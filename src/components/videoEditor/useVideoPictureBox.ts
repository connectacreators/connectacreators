// src/components/videoEditor/useVideoPictureBox.ts
// Tracks the <video>'s rendered rectangle relative to its parent container.
// The parent must be position:relative so absolute-positioned overlays
// (captions, text, b-roll) align correctly. Lives in its own file so React
// Fast Refresh can HMR-update CaptionOverlay.tsx cleanly — co-locating a
// hook with a component breaks the "consistent components exports" rule
// and forces a full page reload on every edit.
import { useEffect, useLayoutEffect, useState } from "react";

export type VideoBox = { left: number; top: number; width: number; height: number };

export function useVideoPictureBox(
  videoRef: React.RefObject<HTMLVideoElement>,
): VideoBox | null {
  const [box, setBox] = useState<VideoBox | null>(null);

  useLayoutEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const parent = v.parentElement;
    if (!parent) return;

    const measure = () => {
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
