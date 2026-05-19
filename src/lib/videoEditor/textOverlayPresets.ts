// src/lib/videoEditor/textOverlayPresets.ts
// Visual presets for static text overlays (title cards, lower-thirds, CTAs).
// Mirror structure to captionPresets so both surfaces share patterns and
// the worker's ASS generation can be uniform. Same single-source-of-truth
// approach: this spec drives both browser CSS preview and worker ASS style.
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
  background: string;
  // Default position when a new overlay is dropped via this preset.
  defaultPosition: { x_pct: number; y_pct: number };
};

export const TEXT_OVERLAY_PRESETS: Record<TextOverlayPreset, TextOverlayPresetSpec> = {
  title_card: {
    id: "title_card",
    label: "Title Card",
    description: "Big bold title near the top",
    font: '"Montserrat", "Inter", "Helvetica Neue", sans-serif',
    fontSizePctHeight: 7,
    weight: 900,
    uppercase: true,
    fillColor: "#ffffff",
    strokeColor: "#000000",
    strokeWidthPctHeight: 0.3,
    shadow: true,
    background: "none",
    defaultPosition: { x_pct: 50, y_pct: 18 },
  },
  lower_third: {
    id: "lower_third",
    label: "Lower Third",
    description: "Subtle label in the lower-third area",
    font: '"Inter", "Helvetica Neue", Helvetica, Arial, sans-serif',
    fontSizePctHeight: 3.2,
    weight: 700,
    uppercase: false,
    fillColor: "#ffffff",
    strokeColor: "transparent",
    strokeWidthPctHeight: 0,
    shadow: true,
    background: "rgba(0,0,0,0.55)",
    defaultPosition: { x_pct: 25, y_pct: 88 },
  },
  cta_chip: {
    id: "cta_chip",
    label: "CTA Chip",
    description: "Pill banner with a call to action",
    font: '"Montserrat", "Inter", sans-serif',
    fontSizePctHeight: 4,
    weight: 800,
    uppercase: true,
    fillColor: "#000000",
    strokeColor: "transparent",
    strokeWidthPctHeight: 0,
    shadow: false,
    background: "#ffd400",
    defaultPosition: { x_pct: 50, y_pct: 88 },
  },
  subtle_caption: {
    id: "subtle_caption",
    label: "Subtle Caption",
    description: "Minimal label, place anywhere",
    font: '"Inter", "Helvetica Neue", Helvetica, Arial, sans-serif',
    fontSizePctHeight: 3,
    weight: 500,
    uppercase: false,
    fillColor: "#ffffff",
    strokeColor: "#000000",
    strokeWidthPctHeight: 0.15,
    shadow: true,
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
