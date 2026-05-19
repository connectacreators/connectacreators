// src/components/videoEditor/CaptionOverlay.tsx
// Renders the active caption (the one whose word range contains the current
// playhead in source time) on top of the preview <video>. Mirrors the styles
// the worker burns in via ASS so what you see is roughly what you export.
// Drag the caption to reposition it on the video — emits the new x_pct/y_pct
// (clamped to [0, 100]) via onMoveCaption.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  onMoveCaption?: (captionId: string, x_pct: number, y_pct: number) => void;
};

export function CaptionOverlay({ captions, sourceMs, videoBox, onMoveCaption }: Props) {
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ captionId: string; offsetX: number; offsetY: number } | null>(null);

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

  // Drag math: track the offset from the pointer to the caption's
  // BOTTOM-CENTER on screen at pointer-down. (left, top) now positions the
  // caption's bottom-center, so we lock that anchor to the pointer.
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!onMoveCaption) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const containerRect = (e.currentTarget.offsetParent as HTMLElement | null)?.getBoundingClientRect();
    if (!containerRect) return;
    const anchorScreenX = containerRect.left + left;
    const anchorScreenY = containerRect.top + top;
    dragRef.current = {
      captionId: active.id,
      offsetX: e.clientX - anchorScreenX,
      offsetY: e.clientY - anchorScreenY,
    };
    setDragOffset({ x: 0, y: 0 });
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || !onMoveCaption) return;
    const containerRect = (e.currentTarget.offsetParent as HTMLElement | null)?.getBoundingClientRect();
    if (!containerRect) return;
    const desiredAnchorScreenX = e.clientX - dragRef.current.offsetX;
    const desiredAnchorScreenY = e.clientY - dragRef.current.offsetY;
    const desiredContainerX = desiredAnchorScreenX - containerRect.left;
    const desiredContainerY = desiredAnchorScreenY - containerRect.top;
    const pctX = ((desiredContainerX - videoBox.left) / videoBox.width) * 100;
    const pctY = ((desiredContainerY - videoBox.top) / videoBox.height) * 100;
    const clampedX = Math.max(5, Math.min(95, pctX));
    const clampedY = Math.max(5, Math.min(95, pctY));
    onMoveCaption(dragRef.current.captionId, clampedX, clampedY);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    dragRef.current = null;
    setDragOffset(null);
  };

  return (
    <div
      className={onMoveCaption ? "absolute select-none cursor-move" : "pointer-events-none absolute"}
      style={{
        left,
        top,
        // BOTTOM-anchored: y_pct is "where the bottom of the caption sits".
        // This matches how social-media captions are positioned (Btm = bottom
        // of text near 80% mark) and matches the worker's ASS alignment=2
        // (bottom-center) interpretation of \pos(x,y).
        transform: "translate(-50%, -100%)",
        // Effective text width — kept slightly wider than the previous 0.9
        // so wrapping behaviour matches the worker's ASS, which has tiny
        // MarginL/MarginR (~97% of frame usable).
        maxWidth: videoBox.width * 0.95,
        textAlign: "center",
        background: spec.background === "none" ? undefined : spec.background,
        padding: spec.background === "none" ? 0 : "0.2em 0.6em",
        borderRadius: spec.background === "none" ? 0 : 8,
        outline: dragOffset !== null ? "2px dashed rgba(59,130,246,0.7)" : undefined,
        touchAction: "none",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {active.words.map((w, i) => (
        <span
          key={i}
          style={toPreviewStyle(spec, videoBox.height, i === activeWordIdx, active.size ?? 1)}
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
