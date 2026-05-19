// src/lib/videoEditor/textOverlayPresets.ts
// Visual presets for static text overlays. Three options matching common
// short-form social-video looks. Spec drives both browser CSS preview and
// the worker's ASS style block.
import type { TextOverlayPreset } from "./edl";

export type TextOverlayPresetSpec = {
  id: TextOverlayPreset;
  label: string;
  description: string;
  font: string;
  fontSizePctHeight: number;
  weight: number;
  uppercase: boolean;
  fillColor: string;
  strokeColor: string;
  strokeWidthPctHeight: number;
  shadow: boolean;
  background: string;       // CSS — "none" for transparent, else a color/rgba
  // Default position when a new overlay is created with this preset.
  defaultPosition: { x_pct: number; y_pct: number };
};

export const TEXT_OVERLAY_PRESETS: Record<TextOverlayPreset, TextOverlayPresetSpec> = {
  tiktok: {
    id: "tiktok",
    label: "TikTok",
    description: "Montserrat Black, white text, black stroke, no background",
    font: '"Montserrat", "Inter", "Helvetica Neue", sans-serif',
    fontSizePctHeight: 6,
    weight: 900,
    uppercase: false,
    fillColor: "#ffffff",
    strokeColor: "#000000",
    strokeWidthPctHeight: 0.35,
    shadow: false,
    background: "none",
    defaultPosition: { x_pct: 50, y_pct: 50 },
  },
  helvetica: {
    id: "helvetica",
    label: "Helvetica",
    description: "Helvetica, white text on 80% black box, no shadow",
    font: '"Helvetica Neue", Helvetica, "Inter", Arial, sans-serif',
    fontSizePctHeight: 4.2,
    weight: 700,
    uppercase: false,
    fillColor: "#ffffff",
    strokeColor: "transparent",
    strokeWidthPctHeight: 0,
    shadow: false,
    background: "rgba(0,0,0,0.8)",
    defaultPosition: { x_pct: 50, y_pct: 50 },
  },
  impact: {
    id: "impact",
    label: "Impact",
    description: "Impact-style condensed, white text, black stroke, no background",
    font: '"Anton", "Impact", "Helvetica Neue", sans-serif',
    fontSizePctHeight: 7,
    weight: 400,
    uppercase: false,
    fillColor: "#ffffff",
    strokeColor: "#000000",
    strokeWidthPctHeight: 0.4,
    shadow: false,
    background: "none",
    defaultPosition: { x_pct: 50, y_pct: 50 },
  },
};

export function toOverlayPreviewStyle(
  spec: TextOverlayPresetSpec,
  frameHeightPx: number,
  size = 1,
): React.CSSProperties {
  const fontSize = (frameHeightPx * spec.fontSizePctHeight * size) / 100;
  const strokeWidth = (frameHeightPx * spec.strokeWidthPctHeight * size) / 100;
  return {
    fontFamily: spec.font,
    fontWeight: spec.weight,
    fontSize: `${fontSize}px`,
    color: spec.fillColor,
    textTransform: spec.uppercase ? "uppercase" : "none",
    WebkitTextStroke: strokeWidth > 0 ? `${strokeWidth}px ${spec.strokeColor}` : undefined,
    textShadow: spec.shadow ? `0 ${frameHeightPx * 0.002}px ${frameHeightPx * 0.005}px rgba(0,0,0,0.7)` : undefined,
    letterSpacing: "0.02em",
    lineHeight: 1.05,
  };
}
