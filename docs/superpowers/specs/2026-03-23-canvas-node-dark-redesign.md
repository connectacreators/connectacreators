# Canvas Node Dark Redesign — Design Spec
**Date:** 2026-03-23
**Status:** Approved

---

## Problem

The Super Planning Canvas nodes currently render as white cards (`rgba(255,255,255,0.95)`) on a light-gray canvas background (`hsl(220 5% 96%)`). This feels flat and inconsistent with the dark, focused aesthetic the user wants — similar to the ChatGPT dark UI: near-black surfaces, soft neutral text, minimal chrome.

## Goal

Restyle all canvas nodes to a flat charcoal dark aesthetic with a subtle blue-gray tint and cyan accents only on header dots and connection handles.

---

## Color Tokens

| Role | Value |
|---|---|
| Canvas background | `#131417` |
| Node body | `#1e1f24` |
| Inner input/surface | `#272830` |
| Node border | `rgba(255,255,255,0.08)` |
| Inner border | `rgba(255,255,255,0.065)` |
| Heading text | `#e0e0e0` |
| Body / muted text | `#707278` |
| Label text (UPPERCASE) | `#42444e` |
| Delete button color | `#383a42` |
| Cyan dot (header) | `#22d3ee` at `opacity: 0.8` |
| Handle fill | `#22d3ee` |
| Handle border | `#131417` (matches canvas bg, creates cutout look) |
| Handle glow | `box-shadow: 0 0 6px rgba(34,211,238,0.4)` |
| Canvas dot-grid dot | `rgba(255,255,255,0.035)` at `22px` spacing |

**Cyan rule:** Cyan (`#22d3ee`) appears **only** on:
1. The small 8px circle dot in each node's header row
2. The ReactFlow connection handles (left/right)

Nowhere else — no cyan backgrounds, no cyan text, no cyan borders.

---

## Files Changed

### 1. `src/index.css`

The `.react-flow .glass-card` override block (around line 426) currently forces white backgrounds and dark text on all canvas nodes. Replace the entire block with dark equivalents:

```css
/* ReactFlow — Dark charcoal canvas node cards */
.react-flow .glass-card {
  background: #1e1f24;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 5px 20px rgba(0, 0, 0, 0.5);
  color: #e0e0e0;
}
.react-flow .glass-card::before {
  display: none;
}

/* Heading text inside nodes */
.react-flow .glass-card,
.react-flow .glass-card p,
.react-flow .glass-card strong,
.react-flow .glass-card label,
.react-flow .glass-card h1,
.react-flow .glass-card h2,
.react-flow .glass-card h3 {
  color: #e0e0e0;
}

/* Muted text */
.react-flow .glass-card .text-muted-foreground,
.react-flow .glass-card .text-muted-foreground\/50,
.react-flow .glass-card .text-muted-foreground\/60,
.react-flow .glass-card .text-muted-foreground\/70,
.react-flow .glass-card [class*="text-muted"] {
  color: #707278 !important;
}

/* Inner borders */
.react-flow .glass-card .border-border,
.react-flow .glass-card .border-border\/50,
.react-flow .glass-card .border-border\/60,
.react-flow .glass-card .border-border\/40,
.react-flow .glass-card .border-border\/30,
.react-flow .glass-card [class*="border-border"] {
  border-color: rgba(255, 255, 255, 0.065) !important;
}

/* Inner surface backgrounds (inputs, muted areas) */
.react-flow .glass-card .bg-muted\/40,
.react-flow .glass-card .bg-muted\/30,
.react-flow .glass-card .bg-muted\/50,
.react-flow .glass-card .bg-muted\/20,
.react-flow .glass-card .bg-muted\/10,
.react-flow .glass-card [class*="bg-muted"] {
  background: #272830 !important;
}

.react-flow .glass-card .bg-card,
.react-flow .glass-card .bg-card\/80,
.react-flow .glass-card .bg-card\/70,
.react-flow .glass-card .bg-background {
  background: #272830 !important;
}

/* Strip any old cyan header backgrounds — use node body color instead */
.react-flow .glass-card [class*="bg-[rgba(8,145,178"],
.react-flow .glass-card [class*="bg-[rgba(14,165,233"] {
  background: #1e1f24 !important;
}

/* ReactFlow handle override */
.react-flow .glass-card .react-flow__handle,
.react-flow__handle {
  background: #22d3ee !important;
  border-color: #131417 !important;
  box-shadow: 0 0 6px rgba(34, 211, 238, 0.4) !important;
}
```

Also remove or neutralize any remaining rules in that block that reference `#111111`, `rgba(0,0,0,...)` text colors, or white backgrounds.

---

### 2. `src/pages/SuperPlanningCanvas.tsx`

Three inline `style` props set the canvas and wrapper background. Change all three:

**Find:**
```tsx
style={{ background: theme === "light" ? "hsl(220 5% 96%)" : "hsl(210, 8%, 10%)" }}
```

**Replace all three occurrences with:**
```tsx
style={{ background: "#131417" }}
```

(The theme toggle no longer exists, so the ternary can be removed entirely.)

Also update the ReactFlow component's own `style` prop (same pattern, same replacement).

---

### 3. `src/components/canvas/AIAssistantNode.tsx`

This node has hardcoded inline styles on its header row that bypass the CSS override. Three changes:

**Header icon color** (line ~342):
```tsx
// Before
style={{ color: '#111111' }}
// After
style={{ color: '#e0e0e0' }}
```

**Header title color** (line ~343):
```tsx
// Before
style={{ color: '#111111' }}
// After
style={{ color: '#e0e0e0' }}
```

**Header subtitle color** (line ~344):
```tsx
// Before
style={{ color: 'rgba(0,0,0,0.4)' }}
// After
style={{ color: 'rgba(255,255,255,0.3)' }}
```

**Header row border-bottom** (line ~340):
```tsx
// Before
style={{ background: 'transparent', borderBottom: '1px solid rgba(0,0,0,0.06)' }}
// After
style={{ background: 'transparent', borderBottom: '1px solid rgba(255,255,255,0.07)' }}
```

---

## Non-Goals

- No changes to node layout, sizing, or functionality
- No changes to any pages outside the canvas
- No changes to the sidebar, toolbar, or session panel chrome
- No per-node-type color differentiation (all nodes share the same dark token set)
- No dark mode toggle or theming — canvas is always dark

---

## Verification

After implementation, open the Super Planning Canvas and confirm:

1. Canvas background is dark (`#131417`), not light gray
2. All node types (AI, Brand Guide, Research Note, Text Note, CTA, Video, Media, Instagram, Hook Generator) show dark charcoal bodies
3. Cyan appears only on the small header dot and handles — not in any background or text
4. Text in nodes is readable (`#e0e0e0` headings, `#707278` body)
5. Connection handles are cyan with a faint glow
6. No white flash or white cards visible anywhere on the canvas
