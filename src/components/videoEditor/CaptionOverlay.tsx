// src/components/videoEditor/CaptionOverlay.tsx
// Renders the active caption (the one whose word range contains the current
// playhead in source time) on top of the preview <video>. Mirrors the styles
// the worker burns in via ASS so what you see is roughly what you export.
// Drag the caption to reposition it on the video — emits the new x_pct/y_pct
// (clamped to [0, 100]) via onMoveCaption.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Caption, TextOverlay } from "@/lib/videoEditor/edl";
import { CAPTION_PRESETS, toPreviewStyle } from "@/lib/videoEditor/captionPresets";
import { TEXT_OVERLAY_PRESETS, toOverlayPreviewStyle } from "@/lib/videoEditor/textOverlayPresets";

export type VideoBox = { left: number; top: number; width: number; height: number };

type Props = {
  captions: Caption[];
  overlays: TextOverlay[];
  // Playhead in SOURCE time — matches the timestamps stored on caption words.
  sourceMs: number;
  // The size of the actual rendered <video> within its container, expressed
  // in container-relative coords (left/top relative to the absolute-positioned
  // overlay's offsetParent).
  videoBox: VideoBox | null;
  onMoveCaption?: (captionId: string, x_pct: number, y_pct: number) => void;
  onResizeCaption?: (captionId: string, size: number) => void;
  onMoveOverlay?: (overlayId: string, x_pct: number, y_pct: number) => void;
};

export function CaptionOverlay({ captions, overlays, sourceMs, videoBox, onMoveCaption, onResizeCaption, onMoveOverlay }: Props) {
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ captionId: string; offsetX: number; offsetY: number } | null>(null);
  const captionRef = useRef<HTMLDivElement | null>(null);
  const resizeRef = useRef<{
    captionId: string;
    startSize: number;
    startDist: number;
    centerX: number;
    centerY: number;
  } | null>(null);
  const [resizing, setResizing] = useState(false);

  if (!videoBox) return null;
  const hasContent = captions.length > 0 || overlays.length > 0;
  if (!hasContent) return null;

  const activeCaption = captions.find((c) => {
    if (c.words.length === 0) return false;
    const start = c.words[0].start_ms;
    const end = c.words[c.words.length - 1].end_ms;
    return sourceMs >= start && sourceMs <= end;
  });

  // Static overlays that are currently within their source-time window.
  // Multiple can show at once.
  const activeOverlays = overlays.filter(
    (o) => sourceMs >= o.start_ms && sourceMs <= o.end_ms,
  );

  // Use a synthetic "active" reference for the caption-specific handlers
  // below — they need the active caption's id and size for drag/resize math.
  const active = activeCaption;
  if (!active && activeOverlays.length === 0) return null;

  const spec = active ? CAPTION_PRESETS[active.preset] : null;
  const activeWordIdx = active
    ? active.words.findIndex((w) => sourceMs >= w.start_ms && sourceMs <= w.end_ms)
    : -1;

  // Drag math: track the offset from the pointer to the caption's
  // BOTTOM-CENTER on screen. (active.position.x_pct, y_pct) describes the
  // bottom-center inside the picture box.
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!onMoveCaption || !active) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    // The element is positioned with its bottom-center at the anchor point —
    // that's the bottom-center of its bounding rect.
    const anchorScreenX = rect.left + rect.width / 2;
    const anchorScreenY = rect.bottom;
    dragRef.current = {
      captionId: active.id,
      offsetX: e.clientX - anchorScreenX,
      offsetY: e.clientY - anchorScreenY,
    };
    setDragOffset({ x: 0, y: 0 });
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || !onMoveCaption || !videoBox) return;
    // Frame-shaped wrapper rect (we hardcode its parent's offsetParent below).
    const frame = (e.currentTarget.parentElement as HTMLElement | null)?.getBoundingClientRect();
    if (!frame) return;
    const desiredAnchorScreenX = e.clientX - dragRef.current.offsetX;
    const desiredAnchorScreenY = e.clientY - dragRef.current.offsetY;
    const pctX = ((desiredAnchorScreenX - frame.left) / frame.width) * 100;
    const pctY = ((desiredAnchorScreenY - frame.top) / frame.height) * 100;
    const clampedX = Math.max(5, Math.min(95, pctX));
    const clampedY = Math.max(5, Math.min(95, pctY));
    onMoveCaption(dragRef.current.captionId, clampedX, clampedY);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    dragRef.current = null;
    setDragOffset(null);
  };

  // Corner resize: grab the bottom-right handle and drag outward → bigger,
  // inward → smaller. Scale is computed from the change in pointer distance
  // to the caption's screen center.
  const onResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!onResizeCaption || !captionRef.current || !active) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const rect = captionRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const startDist = Math.hypot(e.clientX - centerX, e.clientY - centerY) || 1;
    resizeRef.current = {
      captionId: active.id,
      startSize: active.size ?? 1,
      startDist,
      centerX,
      centerY,
    };
    setResizing(true);
  };
  const onResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeRef.current || !onResizeCaption) return;
    e.stopPropagation();
    const dist = Math.hypot(
      e.clientX - resizeRef.current.centerX,
      e.clientY - resizeRef.current.centerY,
    );
    const ratio = dist / resizeRef.current.startDist;
    const nextSize = Math.max(0.375, Math.min(2.0, resizeRef.current.startSize * ratio));
    onResizeCaption(resizeRef.current.captionId, nextSize);
  };
  const onResizeEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    resizeRef.current = null;
    setResizing(false);
  };

  // Use a frame-shaped wrapper that exactly matches the rendered video
  // picture box. Position the caption inside it with CSS percentages — the
  // browser handles all the math natively, so there's no computed-pixel
  // drift between videoBox measurements and actual layout.
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: videoBox.left,
        top: videoBox.top,
        width: videoBox.width,
        height: videoBox.height,
      }}
    >
      {/* Active caption block (per-word karaoke). */}
      {active && spec && (
        <div
          ref={captionRef}
          className={onMoveCaption ? "absolute select-none cursor-move" : "pointer-events-none absolute"}
          style={{
            left: `${active.position.x_pct}%`,
            bottom: `${100 - active.position.y_pct}%`,
            transform: "translateX(-50%)",
            maxWidth: "95%",
            textAlign: "center",
            background: spec.background === "none" ? undefined : spec.background,
            padding: spec.background === "none" ? 0 : "0.2em 0.6em",
            borderRadius: spec.background === "none" ? 0 : 8,
            outline: dragOffset !== null || resizing ? "2px dashed rgba(59,130,246,0.7)" : undefined,
            touchAction: "none",
            pointerEvents: onMoveCaption ? "auto" : "none",
            whiteSpace: "nowrap",
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
          {onResizeCaption && (
            <div
              onPointerDown={onResizeStart}
              onPointerMove={onResizeMove}
              onPointerUp={onResizeEnd}
              style={{
                position: "absolute",
                right: -6,
                bottom: -6,
                width: 14,
                height: 14,
                borderRadius: 3,
                background: "rgba(59, 130, 246, 0.85)",
                border: "1.5px solid white",
                cursor: "nwse-resize",
                touchAction: "none",
                pointerEvents: "auto",
              }}
              title="Drag to resize"
            />
          )}
        </div>
      )}

      {/* Active text overlays — each is independent. Multiple can show at once. */}
      {activeOverlays.map((ov) => {
        const ovSpec = TEXT_OVERLAY_PRESETS[ov.preset];
        const text = ovSpec.uppercase ? ov.text.toUpperCase() : ov.text;
        return (
          <div
            key={ov.id}
            className={onMoveOverlay ? "absolute select-none cursor-move" : "pointer-events-none absolute"}
            style={{
              left: `${ov.position.x_pct}%`,
              bottom: `${100 - ov.position.y_pct}%`,
              transform: "translateX(-50%)",
              maxWidth: "95%",
              textAlign: "center",
              background: ovSpec.background === "none" ? undefined : ovSpec.background,
              padding: ovSpec.background === "none" ? 0 : "0.4em 1em",
              borderRadius: ovSpec.background === "none" ? 0 : 999,
              pointerEvents: onMoveOverlay ? "auto" : "none",
              whiteSpace: "nowrap",
            }}
          >
            <span style={toOverlayPreviewStyle(ovSpec, videoBox.height, ov.size ?? 1)}>
              {text}
            </span>
          </div>
        );
      })}
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
