// src/lib/videoEditor/captionPresets.ts
// Caption preset definitions. A single source of truth drives:
//   1. The browser overlay preview (CSS via toPreviewStyle)
//   2. The worker's ASS subtitle generation (server-side, see render-worker)
// Keep the two views aligned by deriving both from the same record.
//
// fontSizePctHeight is expressed as a percentage of the rendered frame height
// (NOT the preview window height). The worker's ASS PlayResY is 1080, so
// fontSizePctHeight=4.5 means ~49px text at 1080p. The preview multiplies the
// same percentage by the live <video> picture-box height so what you see is
// roughly what gets burned in.
import type { CaptionPreset } from "./edl";

export type CaptionPresetSpec = {
  id: CaptionPreset;
  label: string;
  description: string;
  font: string;                 // CSS font-family stack used for preview
  fontSizePctHeight: number;    // base font-size as % of the output frame height
  weight: number;
  uppercase: boolean;
  fillColor: string;
  highlightFillColor: string;   // applied to the currently-active word
  strokeColor: string;
  strokeWidthPctHeight: number; // stroke width as % of frame height (so it scales)
  shadow: boolean;
  background: string;
};

export const CAPTION_PRESETS: Record<CaptionPreset, CaptionPresetSpec> = {
  tiktok_word_pop: {
    id: "tiktok_word_pop",
    label: "TikTok Word Pop",
    description: "Montserrat Black, current word pops on black outline",
    // TikTok's real caption font is proprietary; Montserrat Black is the
    // closest free Google-Fonts equivalent visually.
    font: '"Montserrat", "Inter", "Helvetica Neue", Arial, sans-serif',
    fontSizePctHeight: 4.5,
    weight: 900,
    uppercase: false,
    fillColor: "#ffffff",
    highlightFillColor: "#ffffff",
    strokeColor: "#000000",
    strokeWidthPctHeight: 0.28,
    shadow: true,
    background: "none",
  },
  ig_reels_classic: {
    id: "ig_reels_classic",
    label: "IG Reels Classic",
    description: "Inter Bold, white on translucent black pill",
    font: '"Inter", "Helvetica Neue", Helvetica, Arial, sans-serif',
    fontSizePctHeight: 3.7,
    weight: 700,
    uppercase: false,
    fillColor: "#ffffff",
    highlightFillColor: "#ffffff",
    strokeColor: "transparent",
    strokeWidthPctHeight: 0,
    shadow: false,
    background: "rgba(0,0,0,0.55)",
  },
  shorts_bold: {
    id: "shorts_bold",
    label: "Shorts Bold",
    description: "Anton condensed, white fill, black outline",
    // Anton is the iconic YouTube Shorts caption look — narrow tall heavy.
    font: '"Anton", "Impact", "Helvetica Neue", sans-serif',
    fontSizePctHeight: 5.2,
    weight: 400, // Anton is intrinsically heavy; weight stays 400
    uppercase: false,
    fillColor: "#ffffff",
    highlightFillColor: "#ffffff",
    strokeColor: "#000000",
    strokeWidthPctHeight: 0.37,
    shadow: true,
    background: "none",
  },
};

// CSS object for the active-word preview overlay. `frameHeightPx` is the
// height of the <video>'s rendered picture box. `size` is the per-caption
// multiplier (default 1.0).
export function toPreviewStyle(
  spec: CaptionPresetSpec,
  frameHeightPx: number,
  isActive: boolean,
  size = 1,
): React.CSSProperties {
  const fontSize = (frameHeightPx * spec.fontSizePctHeight * size) / 100;
  const strokeWidth = (frameHeightPx * spec.strokeWidthPctHeight * size) / 100;
  const color = isActive ? spec.highlightFillColor : spec.fillColor;
  return {
    fontFamily: spec.font,
    fontWeight: spec.weight,
    fontSize: `${fontSize}px`,
    color,
    textTransform: spec.uppercase ? "uppercase" : "none",
    WebkitTextStroke: strokeWidth > 0 ? `${strokeWidth}px ${spec.strokeColor}` : undefined,
    textShadow: spec.shadow ? `0 ${frameHeightPx * 0.002}px ${frameHeightPx * 0.005}px rgba(0,0,0,0.7)` : undefined,
    letterSpacing: "0.02em",
    lineHeight: 1.05,
  };
}
