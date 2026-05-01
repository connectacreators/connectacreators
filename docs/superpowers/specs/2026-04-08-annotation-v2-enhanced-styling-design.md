# Annotation Node V2 — Enhanced Styling

**Date:** 2026-04-08
**Status:** Approved
**Preview:** `public/annotation-v2-preview.html`

## Summary

Upgrade the canvas AnnotationNode with Canva-style visual styling: background fills, borders, shadows, opacity, and border radius. The current workflow stays intact (start blank, style as you go) — just a richer toolbar. All new properties are optional and default to "off", so existing annotations are unaffected.

## Current State

The AnnotationNode (`src/components/canvas/AnnotationNode.tsx`) supports:
- 10 text colors
- Bold / Italic / Underline
- Text alignment (L / C / R)
- 8-direction resize (corners = proportional, edges = width or font)
- Auto-height textarea
- Debounced persistence via `onUpdate` callback
- Delete button

Toolbar layout: `[colors] | [B I U] | [L C R] | [X]`

## Design

### Toolbar Extension

New toolbar: `[colors] | [B I U] | [L C R] | [BG] [Border] [Shadow] [Opacity] [Radius] | [X]`

Five new icon buttons, each opening a small popover panel on click. Popovers close on outside click or selecting a value.

### New Controls

#### 1. Background Fill (BG)
- **Toggle**: Click to enable/disable background
- **Color row**: Same 10 colors as text (picks independently)
- **Opacity slider**: 10%–100% (default 15% when first enabled)
- **Rendering**: Colored rectangle behind text with `backdrop-filter: blur(8px)` for glass effect
- **Active indicator**: Button highlights green when bg is on

#### 2. Border
- **Style pills**: None / Solid / Dashed / Dotted
- **Thickness pills**: Thin (1px) / Medium (2px) / Thick (3px)
- **Color row**: Same 10 colors (defaults to text color if not set)
- **Rendering**: CSS border on the outer container

#### 3. Shadow
- **Three presets** (pill buttons, no sliders):
  - **None**: No shadow
  - **Subtle**: `box-shadow: 0 4px 16px rgba(0,0,0,0.3)` — soft drop shadow
  - **Glow**: `box-shadow: 0 0 20px {color}40, 0 0 40px {color}15` + `text-shadow: 0 0 20px {color}40` — colored glow matching text color
- Glow dynamically uses the current text color

#### 4. Node Opacity
- **Slider**: 20%–100% (default 100%)
- **Rendering**: CSS `opacity` on the entire node container
- Use case: watermark/background labels

#### 5. Border Radius
- **Three presets** (pill buttons):
  - **Sharp**: 2px
  - **Rounded**: 8px (default)
  - **Pill**: 999px
- Only visually relevant when BG fill or Border is active

### Data Model Extension

```typescript
interface AnnotationData {
  // Existing
  text?: string;
  color?: string;
  fontSize?: number;
  width?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: "left" | "center" | "right";

  // New — V2 styling
  bgColor?: string | null;          // null = off
  bgOpacity?: number;               // 0.1–1, default 0.15
  borderStyle?: "none" | "solid" | "dashed" | "dotted";  // default "none"
  borderWidth?: 1 | 2 | 3;          // default 1
  borderColor?: string | null;       // null = inherits text color
  shadow?: "none" | "subtle" | "glow";  // default "none"
  nodeOpacity?: number;              // 0.2–1, default 1
  borderRadius?: "sharp" | "rounded" | "pill";  // default "rounded"

  // Callbacks (not persisted)
  onUpdate?: (updates: Partial<AnnotationData>) => void;
  onDelete?: () => void;
}
```

### Persistence

- All new fields are JSON primitives — serialize to the existing `canvas_states.nodes` JSONB column with zero migration
- Stripped of callbacks by existing `serializeNodes()` via `CALLBACK_KEYS`
- Restored on session load via existing `attachCallbacks()` — no changes needed there
- Realtime sync: same `onUpdate` debounce pattern (300ms), new fields propagate via Supabase Realtime like existing ones

### Backward Compatibility

- All new properties default to their "off" state
- Existing annotations (no new fields in data) render identically to V1
- No DB migration required
- No changes to `SuperPlanningCanvas.tsx` serialization/restoration logic

### Rendering Logic

The outer `<div>` container styling changes from:

```tsx
// V1
border: active ? `1px dashed ${color}44` : "1px dashed transparent",
borderRadius: 6,
```

To computed styles based on new properties:

```tsx
// V2
const radiusMap = { sharp: 2, rounded: 8, pill: 999 };
const r = radiusMap[d.borderRadius || "rounded"];

// Background
const bgStyle = d.bgColor ? {
  background: `${d.bgColor}${Math.round((d.bgOpacity ?? 0.15) * 255).toString(16).padStart(2, '0')}`,
  backdropFilter: "blur(8px)",
} : {};

// Border — show user border when set, otherwise keep dashed selection indicator
const bStyle = d.borderStyle && d.borderStyle !== "none" ? {
  border: `${d.borderWidth || 1}px ${d.borderStyle} ${d.borderColor || color}`,
} : {
  border: active ? `1px dashed ${color}44` : "1px dashed transparent",
};

// Shadow
const shadowStyle = d.shadow === "subtle"
  ? { boxShadow: "0 4px 16px rgba(0,0,0,0.3)" }
  : d.shadow === "glow"
  ? { boxShadow: `0 0 20px ${color}40, 0 0 40px ${color}15`, textShadow: `0 0 20px ${color}40` }
  : {};

// Opacity
const opStyle = { opacity: d.nodeOpacity ?? 1 };
```

### Toolbar Scaling

The toolbar already scales dynamically with font size (`transform: scale(s)` where `s = liveFont / 32`). The new buttons and popovers inherit this scaling. Popovers render above the toolbar with `position: absolute; bottom: 100%` to avoid canvas occlusion.

### Popover Behavior

- Click button to toggle popover open/close
- Only one popover open at a time (clicking another closes the first)
- Popovers have `nodrag nowheel` classes to prevent canvas interactions
- Click outside closes popover (mousedown listener on document)
- All changes apply immediately (no "apply" button)

## Files to Modify

1. **`src/components/canvas/AnnotationNode.tsx`** — All changes here:
   - Extend `AnnotationData` interface with 8 new fields
   - Add 5 new toolbar buttons with SVG icons
   - Add popover components for each control
   - Update container styling to compute from new properties
   - Add popover state management (which is open, close on outside click)

2. No changes needed to:
   - `SuperPlanningCanvas.tsx` (serialization/callbacks already generic)
   - Database schema (JSONB handles new fields automatically)
   - Any other component

## Scope Exclusions

- No preset templates / quick styles (user builds up incrementally)
- No gradient backgrounds (solid color + opacity only)
- No custom font families
- No animation/transition effects on annotations
- No emoji support
