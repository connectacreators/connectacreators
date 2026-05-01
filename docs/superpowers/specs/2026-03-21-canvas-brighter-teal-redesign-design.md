# Canvas Brighter Teal Redesign — Design Spec

## Goal

Upgrade the canvas visual identity from the current dark cyan theme to a **Brighter Teal** palette with notebook-style grid background, polished glass morphism nodes with stronger glow/accent borders, and improved client-canvas workspace UX.

## Scope

- **Visual polish only** — no new node types, no new AI features
- **Client-canvas UX** — surface the existing per-client canvas relationship more clearly
- Theme changes apply to **dark mode only** (light mode unchanged for now)

---

## 1. Canvas Background

### Current
```tsx
// SuperPlanningCanvas.tsx lines 1405-1410
<Background
  variant={BackgroundVariant.Dots}
  bgColor={theme === "light" ? "hsl(220 5% 96%)" : "#06090c"}
  color={theme === "light" ? "#cbd5e1" : "#0d1f2a"}
  gap={24}
  size={1}
/>
// Also: wrapper divs at lines 1327, 1329, 1402 use "#06090c" for dark bg
```

### New
```tsx
<Background
  variant={BackgroundVariant.Lines}
  bgColor={theme === "light" ? "hsl(220 5% 96%)" : "#040d12"}
  color={theme === "light" ? "#cbd5e1" : "rgba(20, 184, 166, 0.06)"}
  gap={28}
  size={1}
/>
// Update wrapper divs at lines 1327, 1329, 1402: "#06090c" → "#040d12"
```

**Rationale:** `BackgroundVariant.Lines` gives notebook-style grid. Deep ocean dark background (`#040d12`) with ultra-subtle teal gridlines. Gap of 28px matches notebook paper proportions.

---

## 2. Color Palette Changes

| Element | Current | New (Brighter Teal) |
|---------|---------|---------------------|
| Canvas background | `#06090c` | `#040d12` |
| Grid lines | `#0d1f2a` (dots) | `rgba(20,184,166,0.06)` (lines) |
| Primary accent | `#22d3ee` (cyan-400) | `#2dd4bf` (teal-400) |
| Primary accent dark | `#0891B2` (cyan-600) | `#0d9488` (teal-600) |
| Primary glow (all opacities) | `rgba(8,145,178,0.XX)` | `rgba(20,184,166,0.XX)` — replace at every opacity level (0.04, 0.06, 0.08, 0.10, 0.12, 0.15, 0.20, 0.25, 0.3, etc.) |
| Node header bg | `rgba(8,145,178,0.08)` | `rgba(20,184,166,0.10)` |
| Node header border | `rgba(8,145,178,0.15)` | `rgba(20,184,166,0.20)` |
| Node icon color | `#22d3ee` | `#2dd4bf` |
| Handle color | `!bg-primary !border-primary/70` | unchanged (uses CSS var) |
| Drawing default | `#22d3ee` | `#2dd4bf` |
| Secondary accent (lime) | `#a3e635` | `#a3e635` (unchanged) |
| Toolbar active states | cyan-based | teal-based |

**Node-specific accent colors stay unchanged** — rose for competitor profiles, lime for CTA, amber for hooks, purple for groups. Only the primary cyan → teal shift.

---

## 3. Node Glass Morphism — Polished

### Current Node Card Pattern
Nodes already use the `glass-card` CSS class (from recent refactor). Headers already use explicit `rgba(8,145,178,0.08)` backgrounds with `rgba(8,145,178,0.15)` borders.
```
- Background: glass-card class (backdrop-filter: blur(24px))
- Border: 1px solid rgba(8,145,178,0.15) on headers
- No glow effects
```

### New Node Card Pattern
```
- Background: rgba(255,255,255,0.03) with backdrop-blur(12px)
- Border: 1px solid rgba(20,184,166,0.18)
- Box-shadow: 0 0 20px rgba(20,184,166,0.04) (subtle ambient glow)
- On hover/selected: box-shadow intensifies to 0 0 24px rgba(20,184,166,0.08)
- Border-radius: 14px (up from current ~12px)
```

### CSS Class Strategy
The `glass-card` base class in `src/index.css` (line 210) provides `backdrop-filter: blur(24px)`. The `glass-card-cyan` modifier (line 228) adds cyan-based border/shadow. **Update `glass-card-cyan` in-place** to use teal values — do NOT create new classes. Add the ambient glow `box-shadow` to the `glass-card` base class. Node-level inline styles override where needed.

Additional CSS classes to update in `src/index.css`:
- `badge-cyan` (line 298): `rgba(8,145,178,...)` → `rgba(20,184,166,...)`; `#22d3ee` → `#2dd4bf`
- `.glass-ios-strong` (line 436): all `rgba(8,145,178,...)` → `rgba(20,184,166,...)`
- `.sidebar-glass` (line 437): `rgba(8,145,178,...)` → `rgba(20,184,166,...)`
- `.btn-17-primary` (line 438): `#0891B2` → `#0d9488`
- `.btn-17-secondary` (line 439): `rgba(8,145,178,...)` → `rgba(20,184,166,...)`; `#22d3ee` → `#2dd4bf`
- `--background` CSS var (line 12): already `#060c12` — update to `#040d12` to match canvas

### Header Bar (per node)
```
- Background: rgba(20,184,166,0.10)
- Border-bottom: 1px solid rgba(20,184,166,0.20)
- Icon: #2dd4bf
- Font-weight: 600, text-xs
```

This keeps the existing glass feel but adds the teal glow halo and slightly stronger borders. No dramatic change — just more polished.

---

## 4. Toolbar Updates

### Current
- Center pill with node buttons using cyan hover states
- Drawing color palette: `["#22d3ee", "#f43f5e", "#a3e635", "#f59e0b", "#a78bfa", "#ffffff"]`

### New
- Same layout — only color references change from cyan → teal
- Drawing default color: `#2dd4bf`
- Drawing palette: `["#2dd4bf", "#f43f5e", "#a3e635", "#f59e0b", "#a78bfa", "#ffffff"]`
- Active button ring: teal-400 instead of cyan-400
- Toolbar background: match new canvas bg tone

---

## 5. Client Canvas Workspace UX

### Current State
- Client-specific canvases already work (DB: `canvas_states.client_id`)
- Client selection happens BEFORE entering the canvas
- No visible client indicator once inside the canvas

### Enhancement
- Add a **client badge** in the toolbar (left side, next to back button)
  - Shows client name + small avatar/initial circle
  - Teal-tinted badge: `bg-teal-500/10 border border-teal-500/20 text-teal-300`
  - Click opens client detail page (or no-op for now)
- This makes it clear "you're working in [Client Name]'s workspace"
- **Requires:** Add `clientName?: string` prop to `CanvasToolbar` Props interface; pass `selectedClient.name` from `SuperPlanningCanvas.tsx`
- No other workflow changes — the existing per-client session system is already well-built

---

## 6. Files to Modify

| File | Changes |
|------|---------|
| `src/index.css` | Update `glass-card-cyan`, `badge-cyan`, `.glass-ios-strong`, `.sidebar-glass`, `.btn-17-primary`, `.btn-17-secondary`: all cyan → teal. Update `--background` CSS var to `#040d12`. |
| `src/pages/SuperPlanningCanvas.tsx` | Background variant (`Dots` → `Lines`), bg colors (`#06090c` → `#040d12`) at lines 1327/1329/1402/1406, grid color, `drawColor` default (`useState("#22d3ee")` → `"#2dd4bf"`), pass `clientName` to toolbar |
| `src/components/canvas/CanvasToolbar.tsx` | Toolbar colors, drawing palette, add `clientName` prop + client badge |
| `src/components/canvas/VideoNode.tsx` | Header `rgba(8,145,178,...)` → `rgba(20,184,166,...)`, section colors (hook accent `#22d3ee` → `#2dd4bf`), icon color |
| `src/components/canvas/TextNoteNode.tsx` | Header bg/border cyan → teal |
| `src/components/canvas/ResearchNoteNode.tsx` | Header bg/border cyan → teal |
| `src/components/canvas/AIAssistantNode.tsx` | Header `rgba(8,145,178,0.08)` → `rgba(20,184,166,0.10)`, border, sidebar accent colors |
| `src/components/canvas/HookGeneratorNode.tsx` | Header bg/border cyan → teal |
| `src/components/canvas/BrandGuideNode.tsx` | Header `rgba(8,145,178,...)` → `rgba(20,184,166,...)`, icon `#22d3ee` → `#2dd4bf` |
| `src/components/canvas/MediaNode.tsx` | Header bg/border cyan → teal, icon color |
| `src/components/canvas/InstagramProfileNode.tsx` | Hook type color map (`#22d3ee` → `#2dd4bf`), outlier score color |
| `src/components/canvas/ScriptOutputPanel.tsx` | Accent colors (`#0891B2` → `#0d9488`) |

**No new files. No database changes. No new dependencies.**

---

## 7. What This Does NOT Include

- No new node types
- No multi-model AI switching
- No new workflow features (editing queue integration, content calendar push, etc.)
- No light theme changes
- No mobile layout changes
- No animation/motion additions beyond hover glow
- No changes to AI prompts or script generation logic

---

## 8. Success Criteria

1. Canvas background shows notebook-style teal grid lines (not dots)
2. All node headers use the new teal palette consistently
3. Nodes have subtle ambient teal glow
4. Client name is visible in toolbar when working on a client's canvas
5. Drawing tool default color is teal
6. No visual regressions in existing functionality
7. Light theme still works unchanged
