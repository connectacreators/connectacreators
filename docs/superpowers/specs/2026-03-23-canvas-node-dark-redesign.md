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
| Canvas dot-grid background | `#131417` |
| Canvas dot-grid dot color | `rgba(255,255,255,0.04)` |
| Canvas dot-grid gap | `24` (px) |

**Cyan rule:** Cyan (`#22d3ee`) appears **only** on:
1. The small 8px circle dot in each node's header row
2. The ReactFlow connection handles (left/right)

Nowhere else — no cyan backgrounds, no cyan text, no cyan borders.

---

## Files Changed

### 1. `src/index.css`

The `.react-flow .glass-card` override block (lines ~426–515) currently forces white backgrounds and dark text on all canvas nodes. **Replace the entire block** with the following. Do not add to it — replace it entirely.

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

/* Heading / general text inside nodes */
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
.react-flow .glass-card [class*="border-border"] {
  border-color: rgba(255, 255, 255, 0.065) !important;
}

/* Strip cyan/teal inline borders from node headers */
.react-flow .glass-card [class*="border-[rgba(8,145,178"],
.react-flow .glass-card [class*="border-[rgba(14,165,233"],
.react-flow .glass-card [class*="border-[rgba(34,211,238"] {
  border-color: rgba(255, 255, 255, 0.065) !important;
}

/* Inner surface backgrounds (inputs, muted areas) */
.react-flow .glass-card [class*="bg-muted"] {
  background: #272830 !important;
}
.react-flow .glass-card .bg-card,
.react-flow .glass-card .bg-card\/80,
.react-flow .glass-card .bg-card\/70,
.react-flow .glass-card .bg-background {
  background: #272830 !important;
}

/* Strip cyan/teal inline backgrounds from node headers */
.react-flow .glass-card [class*="bg-[rgba(8,145,178"],
.react-flow .glass-card [class*="bg-[rgba(14,165,233"],
.react-flow .glass-card [class*="bg-[rgba(34,211,238"] {
  background: #1e1f24 !important;
}

/* Strip primary/cyan bg utility classes */
.react-flow .glass-card [class*="bg-primary"] {
  background: #272830 !important;
}

/* Strip hardcoded cyan/dark text utility classes */
.react-flow .glass-card [class*="text-[#22d3ee"],
.react-flow .glass-card [class*="text-[#0891B2"],
.react-flow .glass-card [class*="text-primary"],
.react-flow .glass-card [class*="text-cyan"] {
  color: #e0e0e0 !important;
}
```

---

### 2. `src/pages/SuperPlanningCanvas.tsx`

There are **six** places to update. All use a `theme === "light" ? ... : ...` ternary that can be removed since there is no theme toggle.

**Occurrences 1 & 2** — outer and inner wrapper `div` `style` props (lines ~1327, ~1329):
```tsx
// Before
style={{ background: theme === "light" ? "hsl(220 5% 96%)" : "hsl(210, 8%, 10%)" }}
// After
style={{ background: "#131417" }}
```

**Occurrence 3** — `ReactFlow` component `style` prop (line ~1403):
```tsx
// Before
style={{ background: theme === "light" ? "hsl(220 5% 96%)" : "hsl(210, 8%, 10%)" }}
// After
style={{ background: "#131417" }}
```

**Occurrence 4** — `<Background bgColor>` prop (line ~1407):
```tsx
// Before
bgColor={theme === "light" ? "hsl(220 5% 96%)" : "hsl(210, 8%, 10%)"}
// After
bgColor="#131417"
```

**Occurrence 5** — `<Background color>` prop (dot-grid dot color, line ~1408):
```tsx
// Before
color={theme === "light" ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.06)"}
// After
color="rgba(255,255,255,0.04)"
```

Also update `colorMode` prop on the `ReactFlow` component (line ~1394):
```tsx
// Before
colorMode={theme === "light" ? "light" : "dark"}
// After
colorMode="dark"
```

---

### 3. `src/components/canvas/AIAssistantNode.tsx`

Four hardcoded inline styles on the header row (lines ~340–344) bypass the CSS override:

**Line ~340** — header row border:
```tsx
// Before
style={{ background: 'transparent', borderBottom: '1px solid rgba(0,0,0,0.06)' }}
// After
style={{ background: 'transparent', borderBottom: '1px solid rgba(255,255,255,0.07)' }}
```

**Line ~342** — Bot icon:
```tsx
// Before
style={{ color: '#111111' }}
// After
style={{ color: '#e0e0e0' }}
```

**Line ~343** — "Connecta AI" title:
```tsx
// Before
style={{ color: '#111111' }}
// After
style={{ color: '#e0e0e0' }}
```

**Line ~344** — subtitle hint text:
```tsx
// Before
style={{ color: 'rgba(0,0,0,0.4)' }}
// After
style={{ color: 'rgba(255,255,255,0.3)' }}
```

---

### 4. `src/components/canvas/ScriptOutputPanel.tsx`

Two entries have hardcoded dark colors that will be invisible on a dark background.

**Line ~62** — `hook` entry in `SECTION_HEADERS`:
```tsx
// Before
hook: { label: "HOOK", color: "text-[#111111]", bar: "bg-[rgba(0,0,0,0.15)]" },
// After
hook: { label: "HOOK", color: "text-[#e0e0e0]", bar: "bg-[rgba(255,255,255,0.1)]" },
```

**Lines ~35–39** — `actor` entry in `LINE_CONFIG`:
```tsx
// Before
color: "text-[#111111]",
bg: "bg-gradient-to-br from-[rgba(0,0,0,0.04)] to-transparent",
border: "border-[rgba(0,0,0,0.08)]",
dot: "bg-[#555555]",
// After
color: "text-[#e0e0e0]",
bg: "bg-gradient-to-br from-[rgba(255,255,255,0.05)] to-transparent",
border: "border-[rgba(255,255,255,0.08)]",
dot: "bg-[#707278]",
```

---

## Out of Scope — InstagramProfileNode

`InstagramProfileNode.tsx` does **not** use `glass-card` — it uses `bg-card border border-border rounded-2xl`. It is outside the CSS override scope. Since the app's `--card` CSS variable resolves correctly in context, this node will appear acceptably dark without any changes. No edits needed.

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

1. Canvas background is dark charcoal (`#131417`), not light gray
2. All `glass-card` node types (AI, Brand Guide, Research Note, Text Note, CTA, Video, Media, Hook Generator) show dark `#1e1f24` bodies
3. InstagramProfileNode appears reasonably dark (uses CSS vars, not glass-card — acceptable without changes)
4. Cyan appears **only** on the small header dot and connection handles — not in any background, border, or text
5. Text in nodes is readable: `#e0e0e0` headings, `#707278` body, `#42444e` UPPERCASE labels
6. Connection handles are cyan with a faint glow, cutout border matching canvas bg
7. No white flash or white cards visible anywhere on the canvas
8. HOOK section label in script output panel is visible (light text, not black-on-dark)
9. Canvas dot-grid is visible as faint white dots on the dark background
