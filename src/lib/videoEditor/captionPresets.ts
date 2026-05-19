// src/lib/videoEditor/captionPresets.ts
// Caption preset definitions. A single source of truth drives:
//   1. The browser overlay preview (CSS via toPreviewStyle)
//   2. The worker's ASS subtitle generation (server-side, see render-worker)
// Keep the two views aligned by deriving both from the same record.
import type { CaptionPreset } from "./edl";

export type CaptionPresetSpec = {
  id: CaptionPreset;
  label: string;
  description: string;
  font: string;                 // CSS font-family stack used for preview
  fontSizePctHeight: number;    // font-size as % of the preview frame height
  weight: number;
  uppercase: boolean;
  // Colors are CSS strings; the ASS generator converts to BGR hex.
  fillColor: string;
  highlightFillColor: string;   // applied to the currently-active word
  strokeColor: string;
  strokeWidthPx: number;        // approximate stroke width in preview pixels
  shadow: boolean;
  // Background pill behind the whole line ("none" or "rgba(...)").
  background: string;
};

export const CAPTION_PRESETS: Record<CaptionPreset, CaptionPresetSpec> = {
  tiktok_word_pop: {
    id: "tiktok_word_pop",
    label: "TikTok Word Pop",
    description: "Bold sans, current word pops on black",
    font: '"Inter", "Helvetica Neue", Arial, sans-serif',
    fontSizePctHeight: 6.5,
    weight: 900,
    uppercase: true,
    fillColor: "#ffffff",
    highlightFillColor: "#ffffff",
    strokeColor: "#000000",
    strokeWidthPx: 3,
    shadow: true,
    background: "none",
  },
  ig_reels_classic: {
    id: "ig_reels_classic",
    label: "IG Reels Classic",
    description: "All-caps white on translucent black pill",
    font: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    fontSizePctHeight: 5,
    weight: 700,
    uppercase: true,
    fillColor: "#ffffff",
    highlightFillColor: "#ffffff",
    strokeColor: "transparent",
    strokeWidthPx: 0,
    shadow: false,
    background: "rgba(0,0,0,0.55)",
  },
  shorts_bold: {
    id: "shorts_bold",
    label: "Shorts Bold",
    description: "Impact, white fill, black outline",
    font: '"Impact", "Inter", sans-serif',
    fontSizePctHeight: 7,
    weight: 900,
    uppercase: true,
    fillColor: "#ffffff",
    highlightFillColor: "#ffffff",
    strokeColor: "#000000",
    strokeWidthPx: 5,
    shadow: true,
    background: "none",
  },
};

// CSS object for the active-word preview overlay. The frame height is the
// available height of the preview stage; using `em` derived from height keeps
// the size proportional regardless of video aspect.
export function toPreviewStyle(spec: CaptionPresetSpec, frameHeightPx: number, isActive: boolean): React.CSSProperties {
  const fontSize = (frameHeightPx * spec.fontSizePctHeight) / 100;
  const color = isActive ? spec.highlightFillColor : spec.fillColor;
  return {
    fontFamily: spec.font,
    fontWeight: spec.weight,
    fontSize: `${fontSize}px`,
    color,
    textTransform: spec.uppercase ? "uppercase" : "none",
    WebkitTextStroke:
      spec.strokeWidthPx > 0 ? `${spec.strokeWidthPx}px ${spec.strokeColor}` : undefined,
    textShadow: spec.shadow ? "0 2px 6px rgba(0,0,0,0.7)" : undefined,
    letterSpacing: "0.02em",
    lineHeight: 1.05,
  };
}
