# Canvas Brighter Teal Redesign — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all cyan color references across the canvas with a Brighter Teal palette, switch the background from dots to notebook grid lines, add ambient glow to nodes, and add a client name badge to the toolbar.

**Architecture:** Pure visual refactor — find-and-replace color values across CSS and 12 TSX component files. No logic changes, no new files, no database changes. The `glass-card` CSS class gets an ambient glow addition; `glass-card-cyan` gets teal values. Each node file's hardcoded `rgba(8,145,178,...)` and `#22d3ee` references become `rgba(20,184,166,...)` and `#2dd4bf`. One new prop (`clientName`) added to `CanvasToolbar`.

**Tech Stack:** React, TypeScript, Tailwind CSS, ReactFlow (`@xyflow/react`), CSS

**Spec:** `docs/superpowers/specs/2026-03-21-canvas-brighter-teal-redesign-design.md`

---

## File Structure

All modifications — no new files.

| File | Responsibility |
|------|---------------|
| `src/index.css` | Global CSS classes: `glass-card`, `glass-card-cyan`, `badge-cyan`, compat aliases, CSS vars |
| `src/pages/SuperPlanningCanvas.tsx` | Canvas background, wrapper div bg colors, `drawColor` default |
| `src/components/canvas/CanvasToolbar.tsx` | Toolbar button colors, draw palette, client badge |
| `src/components/canvas/VideoNode.tsx` | Video node header, section colors, analysis badges |
| `src/components/canvas/TextNoteNode.tsx` | Rich text toolbar button active state |
| `src/components/canvas/ResearchNoteNode.tsx` | Impact score color function |
| `src/components/canvas/AIAssistantNode.tsx` | AI node header |
| `src/components/canvas/HookGeneratorNode.tsx` | Hook node header, category pills, buttons, selected states |
| `src/components/canvas/BrandGuideNode.tsx` | Brand guide header, icon color |
| `src/components/canvas/MediaNode.tsx` | Media node headers (3 locations), badge |
| `src/components/canvas/InstagramProfileNode.tsx` | Hook type color map, outlier score color |
| `src/components/canvas/ScriptOutputPanel.tsx` | Line type styles, section headers, score color |

---

## Chunk 1: Global CSS + Canvas Background

### Task 1: Update CSS variables and global classes in index.css

**Files:**
- Modify: `src/index.css:12-13` (CSS vars)
- Modify: `src/index.css:228-234` (glass-card-cyan)
- Modify: `src/index.css:210-216` (glass-card — add glow)
- Modify: `src/index.css:250,254` (glass-input-surface)
- Modify: `src/index.css:262,270` (glass-topbar)
- Modify: `src/index.css:278` (ambient-glow)
- Modify: `src/index.css:298` (badge-cyan)
- Modify: `src/index.css:305,307` (btn-primary-glass)
- Modify: `src/index.css:436-439` (compat aliases)

- [ ] **Step 1: Update --background CSS variable**

In `src/index.css`, change line 12 only (leave `--card` unchanged — it affects all pages):
```css
/* FROM */
--background: 210 25% 4%;        /* #060c12 */
/* TO */
--background: 200 50% 3%;        /* #040d12 */
```

- [ ] **Step 2: Update glass-card base class — add ambient teal glow**

In `src/index.css`, change the `.glass-card` class (lines 210-217):
```css
/* FROM */
.glass-card {
  background: rgba(255, 255, 255, 0.035);
  backdrop-filter: blur(24px) saturate(150%);
  -webkit-backdrop-filter: blur(24px) saturate(150%);
  border: 1px solid rgba(255, 255, 255, 0.07);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 4px 20px rgba(0,0,0,0.3);
  position: relative;
}

/* TO */
.glass-card {
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(24px) saturate(150%);
  -webkit-backdrop-filter: blur(24px) saturate(150%);
  border: 1px solid rgba(20, 184, 166, 0.18);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 4px 20px rgba(0,0,0,0.3), 0 0 20px rgba(20, 184, 166, 0.04);
  position: relative;
}
```

- [ ] **Step 3: Update glass-card-cyan modifier**

In `src/index.css`, change `.glass-card-cyan` (lines 228-235):
```css
/* FROM */
.glass-card-cyan {
  background: rgba(8, 145, 178, 0.07);
  border-color: rgba(8, 145, 178, 0.2);
  box-shadow: inset 0 1px 0 rgba(8, 145, 178, 0.15),
              0 4px 20px rgba(0,0,0,0.3),
              0 0 30px rgba(8, 145, 178, 0.06);
  position: relative;
}

/* TO */
.glass-card-cyan {
  background: rgba(20, 184, 166, 0.07);
  border-color: rgba(20, 184, 166, 0.2);
  box-shadow: inset 0 1px 0 rgba(20, 184, 166, 0.15),
              0 4px 20px rgba(0,0,0,0.3),
              0 0 30px rgba(20, 184, 166, 0.06);
  position: relative;
}
```

- [ ] **Step 4: Update glass-sidebar**

In `src/index.css`, change lines 188 and 196:
```css
/* line 188 — glass-sidebar border — FROM */
border-right: 1px solid rgba(8, 145, 178, 0.10);
/* TO */
border-right: 1px solid rgba(20, 184, 166, 0.10);

/* line 196 — glass-sidebar::before gradient — FROM */
background: linear-gradient(180deg, rgba(8, 145, 178, 0.08) 0%, transparent 100%);
/* TO */
background: linear-gradient(180deg, rgba(20, 184, 166, 0.08) 0%, transparent 100%);
```

- [ ] **Step 5: Update glass-input-surface**

In `src/index.css`, change lines 250, 254, and 255:
```css
/* line 250 — FROM */
border: 1px solid rgba(8, 145, 178, 0.18);
/* TO */
border: 1px solid rgba(20, 184, 166, 0.18);

/* line 254 — FROM */
border-color: rgba(8, 145, 178, 0.5);
/* TO */
border-color: rgba(20, 184, 166, 0.5);

/* line 255 — focus ring box-shadow — FROM */
box-shadow: 0 0 0 3px rgba(8, 145, 178, 0.1), inset 0 1px 3px rgba(0,0,0,0.2);
/* TO */
box-shadow: 0 0 0 3px rgba(20, 184, 166, 0.1), inset 0 1px 3px rgba(0,0,0,0.2);
```

- [ ] **Step 6: Update glass-topbar and ambient-glow**

In `src/index.css`:
```css
/* line 262 — glass-topbar border — FROM */
border: 1px solid rgba(8, 145, 178, 0.12);
/* TO */
border: 1px solid rgba(20, 184, 166, 0.12);

/* line 270 — glass-topbar::before gradient — FROM */
background: linear-gradient(90deg, transparent, rgba(8,145,178,0.4), rgba(132,204,22,0.2), transparent);
/* TO */
background: linear-gradient(90deg, transparent, rgba(20,184,166,0.4), rgba(132,204,22,0.2), transparent);

/* line 278 — ambient-glow — FROM */
radial-gradient(ellipse at 20% 0%, rgba(8, 145, 178, 0.08) 0%, transparent 50%),
/* TO */
radial-gradient(ellipse at 20% 0%, rgba(20, 184, 166, 0.08) 0%, transparent 50%),
```

- [ ] **Step 7: Update gradient-brand and btn-secondary-glass**

In `src/index.css`:
```css
/* line 284 — gradient-brand — FROM */
background: linear-gradient(135deg, #0891B2, #84CC16);
/* TO */
background: linear-gradient(135deg, #0d9488, #84CC16);

/* lines 316-319 — btn-secondary-glass — FROM */
.btn-secondary-glass {
  background: rgba(8, 145, 178, 0.1);
  border: 1px solid rgba(8, 145, 178, 0.25);
  color: #22d3ee;
}
/* TO */
.btn-secondary-glass {
  background: rgba(20, 184, 166, 0.1);
  border: 1px solid rgba(20, 184, 166, 0.25);
  color: #2dd4bf;
}
```

- [ ] **Step 8: Update badge-cyan**

In `src/index.css`, change line 298:
```css
/* FROM */
.badge-cyan { background: rgba(8,145,178,0.15);  color: #22d3ee; border: 1px solid rgba(8,145,178,0.25); }
/* TO */
.badge-cyan { background: rgba(20,184,166,0.15);  color: #2dd4bf; border: 1px solid rgba(20,184,166,0.25); }
```

- [ ] **Step 9: Update btn-primary-glass**

In `src/index.css`, change lines 305 and 307:
```css
/* line 305 — FROM */
background: linear-gradient(135deg, #0891B2, #84CC16);
/* TO */
background: linear-gradient(135deg, #0d9488, #84CC16);

/* line 307 — FROM */
box-shadow: 0 4px 20px rgba(8,145,178,0.35), inset 0 1px 0 rgba(255,255,255,0.15);
/* TO */
box-shadow: 0 4px 20px rgba(20,184,166,0.35), inset 0 1px 0 rgba(255,255,255,0.15);
```

- [ ] **Step 10: Update backward-compat aliases**

In `src/index.css`, change lines 436-439:
```css
/* line 436 — glass-ios-strong — replace all rgba(8,145,178,...) with rgba(20,184,166,...) */
.glass-ios-strong { background: rgba(20,184,166,0.07); backdrop-filter: blur(24px) saturate(150%); -webkit-backdrop-filter: blur(24px) saturate(150%); border: 1px solid rgba(20,184,166,0.2); box-shadow: inset 0 1px 0 rgba(20,184,166,0.15), 0 4px 20px rgba(0,0,0,0.3), 0 0 30px rgba(20,184,166,0.06); position: relative; }

/* line 437 — sidebar-glass */
.sidebar-glass { background: rgba(20,184,166,0.04); backdrop-filter: blur(72px) saturate(180%) brightness(1.04); -webkit-backdrop-filter: blur(72px) saturate(180%) brightness(1.04); border-right: 1px solid rgba(20,184,166,0.12); position: relative; }

/* line 438 — btn-17-primary */
.btn-17-primary { background: linear-gradient(135deg, #0d9488, #84CC16); color: #fff; box-shadow: 0 4px 20px rgba(20,184,166,0.35), inset 0 1px 0 rgba(255,255,255,0.15); position: relative; overflow: hidden; }

/* line 439 — btn-17-secondary */
.btn-17-secondary { background: rgba(20,184,166,0.1); border: 1px solid rgba(20,184,166,0.25); color: #2dd4bf; }
```

- [ ] **Step 11: Commit CSS changes**

```bash
git add src/index.css
git commit -m "style(canvas): update global CSS from cyan to brighter teal palette"
```

---

### Task 2: Update canvas background and drawing default in SuperPlanningCanvas.tsx

**Files:**
- Modify: `src/pages/SuperPlanningCanvas.tsx:149` (drawColor default)
- Modify: `src/pages/SuperPlanningCanvas.tsx:1327,1329` (wrapper div backgrounds)
- Modify: `src/pages/SuperPlanningCanvas.tsx:1402` (ReactFlow style bg)
- Modify: `src/pages/SuperPlanningCanvas.tsx:1404-1410` (Background component)

- [ ] **Step 1: Update drawColor default**

In `src/pages/SuperPlanningCanvas.tsx`, change line 149:
```tsx
// FROM
const [drawColor, setDrawColor] = useState("#22d3ee");
// TO
const [drawColor, setDrawColor] = useState("#2dd4bf");
```

- [ ] **Step 2: Update wrapper div background colors**

Change line 1327:
```tsx
// FROM
<div className="flex h-full overflow-hidden" style={{ background: theme === "light" ? "hsl(220 5% 96%)" : "#06090c" }}>
// TO
<div className="flex h-full overflow-hidden" style={{ background: theme === "light" ? "hsl(220 5% 96%)" : "#040d12" }}>
```

Change line 1329:
```tsx
// FROM
<div className="flex-1 relative min-w-0" style={{ background: theme === "light" ? "hsl(220 5% 96%)" : "#06090c" }}>
// TO
<div className="flex-1 relative min-w-0" style={{ background: theme === "light" ? "hsl(220 5% 96%)" : "#040d12" }}>
```

- [ ] **Step 3: Update ReactFlow style and Background component**

Change line 1402:
```tsx
// FROM
style={{ background: theme === "light" ? "hsl(220 5% 96%)" : "#06090c" }}
// TO
style={{ background: theme === "light" ? "hsl(220 5% 96%)" : "#040d12" }}
```

Change lines 1404-1410:
```tsx
// FROM
<Background
  variant={BackgroundVariant.Dots}
  bgColor={theme === "light" ? "hsl(220 5% 96%)" : "#06090c"}
  color={theme === "light" ? "#cbd5e1" : "#0d1f2a"}
  gap={24}
  size={1}
/>

// TO
<Background
  variant={BackgroundVariant.Lines}
  bgColor={theme === "light" ? "hsl(220 5% 96%)" : "#040d12"}
  color={theme === "light" ? "#cbd5e1" : "rgba(20, 184, 166, 0.06)"}
  gap={28}
  size={1}
/>
```

- [ ] **Step 4: Pass clientName to CanvasToolbar**

Find the `<CanvasToolbar` JSX at line 1330 and add the `clientName` prop:
```tsx
<CanvasToolbar
  clientName={selectedClient?.name}
  onAddNode={addNode}
  // ... rest of props unchanged
```

- [ ] **Step 5: Commit canvas background changes**

```bash
git add src/pages/SuperPlanningCanvas.tsx
git commit -m "style(canvas): notebook grid background + teal drawing default + clientName prop"
```

---

## Chunk 2: Toolbar + All Node Components

### Task 3: Update CanvasToolbar colors and add client badge

**Files:**
- Modify: `src/components/canvas/CanvasToolbar.tsx`

- [ ] **Step 1: Add clientName prop to Props interface**

At line 22 in the Props interface, add before `onAddNode`:
```tsx
  clientName?: string;
```

Update the function signature at line 236 — add `clientName` to the existing explicit destructuring (keep all named props, don't use `...rest`):
```tsx
export default function CanvasToolbar({ clientName, onAddNode, onBack, onZoomIn, onZoomOut, onShowTutorial, onOpenViralPicker, drawingMode, onToggleDrawing, onClearDrawing, drawColor, onDrawColorChange, saveStatus, sessions, activeSessionId, onNewSession, onSwitchSession, onRenameSession, onDeleteSession, sessionStorageUsed = 0 }: Props) {
```

- [ ] **Step 2: Update IconBtn accent color**

Change line 64:
```tsx
// FROM
? "text-[#22d3ee] hover:text-[#22d3ee] hover:bg-[rgba(8,145,178,0.15)]"
// TO
? "text-[#2dd4bf] hover:text-[#2dd4bf] hover:bg-[rgba(20,184,166,0.15)]"
```

- [ ] **Step 3: Update DRAW_COLORS palette**

Change line 78:
```tsx
// FROM
const DRAW_COLORS = ["#22d3ee", "#f43f5e", "#a3e635", "#f59e0b", "#a78bfa", "#ffffff"];
// TO
const DRAW_COLORS = ["#2dd4bf", "#f43f5e", "#a3e635", "#f59e0b", "#a78bfa", "#ffffff"];
```

- [ ] **Step 4: Update toolbar button hover colors**

Replace all 4 occurrences of the toolbar button pattern (lines 293, 302, 311, 320):
```tsx
// FROM (each line)
className="p-2 rounded-lg text-[#94a3b8] hover:text-[#22d3ee] hover:bg-[rgba(8,145,178,0.1)] transition-colors"
// TO
className="p-2 rounded-lg text-[#94a3b8] hover:text-[#2dd4bf] hover:bg-[rgba(20,184,166,0.1)] transition-colors"
```

- [ ] **Step 5: Update drawing mode toggle active state**

Change line 342:
```tsx
// FROM
? "text-[#22d3ee] bg-[rgba(8,145,178,0.2)] ring-1 ring-[#22d3ee]/40"
// TO
? "text-[#2dd4bf] bg-[rgba(20,184,166,0.2)] ring-1 ring-[#2dd4bf]/40"
```

- [ ] **Step 6: Add client badge in toolbar left section**

After the Back button (after line 246), add the client badge:
```tsx
{/* Client workspace badge */}
{clientName && (
  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[rgba(20,184,166,0.08)] border border-[rgba(20,184,166,0.2)] text-[#2dd4bf]">
    <div className="w-5 h-5 rounded-md bg-[rgba(20,184,166,0.15)] flex items-center justify-center text-[10px] font-bold text-[#2dd4bf]">
      {clientName.charAt(0).toUpperCase()}
    </div>
    <span className="text-[11px] font-medium max-w-[120px] truncate">{clientName}</span>
  </div>
)}
```

- [ ] **Step 7: Commit toolbar changes**

```bash
git add src/components/canvas/CanvasToolbar.tsx
git commit -m "style(canvas): teal toolbar colors + client workspace badge"
```

---

### Task 4: Update VideoNode colors

**Files:**
- Modify: `src/components/canvas/VideoNode.tsx`

- [ ] **Step 1: Update SECTION_COLORS hook entry**

Change line 68:
```tsx
// FROM
hook: { label: "Hook", accent: "text-[#22d3ee]", bg: "bg-[rgba(8,145,178,0.08)]", border: "border-[rgba(8,145,178,0.2)]" },
// TO
hook: { label: "Hook", accent: "text-[#2dd4bf]", bg: "bg-[rgba(20,184,166,0.08)]", border: "border-[rgba(20,184,166,0.2)]" },
```

- [ ] **Step 2: Update header bg/border**

Change line 436:
```tsx
// FROM
<div className="flex items-center justify-between px-3 py-2.5 bg-[rgba(8,145,178,0.08)] border-b border-[rgba(8,145,178,0.15)]">
// TO
<div className="flex items-center justify-between px-3 py-2.5 bg-[rgba(20,184,166,0.10)] border-b border-[rgba(20,184,166,0.20)]">
```

- [ ] **Step 3: Update analysis badge and action button**

Change line 750 (keyword badges):
```tsx
// FROM
className="inline-flex items-center gap-1 text-[9px] px-2 py-0.5 rounded bg-[rgba(8,145,178,0.08)] border border-[rgba(8,145,178,0.2)] text-[#22d3ee]/80"
// TO
className="inline-flex items-center gap-1 text-[9px] px-2 py-0.5 rounded bg-[rgba(20,184,166,0.08)] border border-[rgba(20,184,166,0.2)] text-[#2dd4bf]/80"
```

Change line 793 (analyze button):
```tsx
// FROM
className="nodrag flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-[rgba(8,145,178,0.25)] bg-[rgba(8,145,178,0.08)] text-[#22d3ee] hover:bg-[rgba(8,145,178,0.15)] text-[11px] font-medium transition-colors disabled:opacity-40"
// TO
className="nodrag flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-[rgba(20,184,166,0.25)] bg-[rgba(20,184,166,0.08)] text-[#2dd4bf] hover:bg-[rgba(20,184,166,0.15)] text-[11px] font-medium transition-colors disabled:opacity-40"
```

- [ ] **Step 4: Commit**

```bash
git add src/components/canvas/VideoNode.tsx
git commit -m "style(canvas): teal colors for VideoNode"
```

---

### Task 5: Update TextNoteNode colors

**Files:**
- Modify: `src/components/canvas/TextNoteNode.tsx:24`

- [ ] **Step 1: Update TBtn active state**

Change line 24:
```tsx
// FROM
className={`nodrag p-1 rounded transition-colors ${active ? "bg-[rgba(8,145,178,0.2)] text-[#22d3ee]" : "text-muted-foreground hover:text-foreground hover:bg-muted/30"}`}
// TO
className={`nodrag p-1 rounded transition-colors ${active ? "bg-[rgba(20,184,166,0.2)] text-[#2dd4bf]" : "text-muted-foreground hover:text-foreground hover:bg-muted/30"}`}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/canvas/TextNoteNode.tsx
git commit -m "style(canvas): teal active state for TextNoteNode toolbar"
```

---

### Task 6: Update ResearchNoteNode colors

**Files:**
- Modify: `src/components/canvas/ResearchNoteNode.tsx:20`

- [ ] **Step 1: Update impactColor function**

Change line 20:
```tsx
// FROM
score >= 9.5 ? "text-[#22d3ee] border-[rgba(8,145,178,0.5)] bg-[rgba(8,145,178,0.15)]" :
// TO
score >= 9.5 ? "text-[#2dd4bf] border-[rgba(20,184,166,0.5)] bg-[rgba(20,184,166,0.15)]" :
```

- [ ] **Step 2: Commit**

```bash
git add src/components/canvas/ResearchNoteNode.tsx
git commit -m "style(canvas): teal impact color for ResearchNoteNode"
```

---

### Task 7: Update AIAssistantNode colors

**Files:**
- Modify: `src/components/canvas/AIAssistantNode.tsx:340`

- [ ] **Step 1: Update header bg/border**

Change line 340:
```tsx
// FROM
<div className="flex items-center justify-between px-3 py-2.5 bg-[rgba(8,145,178,0.08)] border-b border-[rgba(8,145,178,0.15)] flex-shrink-0 cursor-default">
// TO
<div className="flex items-center justify-between px-3 py-2.5 bg-[rgba(20,184,166,0.10)] border-b border-[rgba(20,184,166,0.20)] flex-shrink-0 cursor-default">
```

- [ ] **Step 2: Commit**

```bash
git add src/components/canvas/AIAssistantNode.tsx
git commit -m "style(canvas): teal header for AIAssistantNode"
```

---

### Task 8: Update HookGeneratorNode colors

**Files:**
- Modify: `src/components/canvas/HookGeneratorNode.tsx` (lines 117-228)

- [ ] **Step 1: Replace all cyan references**

This file has the most occurrences. Replace ALL instances using these substitutions:
```
rgba(8,145,178,0.06)  →  rgba(20,184,166,0.06)
rgba(8,145,178,0.12)  →  rgba(20,184,166,0.12)
rgba(8,145,178,0.15)  →  rgba(20,184,166,0.15)
rgba(8,145,178,0.2)   →  rgba(20,184,166,0.2)
rgba(8,145,178,0.25)  →  rgba(20,184,166,0.25)
rgba(8,145,178,0.3)   →  rgba(20,184,166,0.3)
#22d3ee               →  #2dd4bf
```

Affected lines: 117, 119, 142, 152, 169, 194, 221, 226, 228

- [ ] **Step 2: Commit**

```bash
git add src/components/canvas/HookGeneratorNode.tsx
git commit -m "style(canvas): teal colors for HookGeneratorNode"
```

---

### Task 9: Update BrandGuideNode colors

**Files:**
- Modify: `src/components/canvas/BrandGuideNode.tsx:32,34`

- [ ] **Step 1: Update header and icon**

Change line 32:
```tsx
// FROM
<div className="flex items-center justify-between px-3 py-2.5 bg-[rgba(8,145,178,0.08)] border-b border-[rgba(8,145,178,0.15)]">
// TO
<div className="flex items-center justify-between px-3 py-2.5 bg-[rgba(20,184,166,0.10)] border-b border-[rgba(20,184,166,0.20)]">
```

Change line 34:
```tsx
// FROM
<BookOpen className="w-3.5 h-3.5 text-[#22d3ee]" />
// TO
<BookOpen className="w-3.5 h-3.5 text-[#2dd4bf]" />
```

- [ ] **Step 2: Commit**

```bash
git add src/components/canvas/BrandGuideNode.tsx
git commit -m "style(canvas): teal header for BrandGuideNode"
```

---

### Task 10: Update MediaNode colors

**Files:**
- Modify: `src/components/canvas/MediaNode.tsx` (lines 350, 428, 613, 823)

- [ ] **Step 1: Replace all cyan references**

Replace ALL instances:
```
rgba(8,145,178,0.08)  →  rgba(20,184,166,0.10)
rgba(8,145,178,0.15)  →  rgba(20,184,166,0.20)
rgba(8,145,178,0.2)   →  rgba(20,184,166,0.2)
#22d3ee               →  #2dd4bf
```

Affected lines: 350, 428, 613 (headers), 823 (badge)

- [ ] **Step 2: Commit**

```bash
git add src/components/canvas/MediaNode.tsx
git commit -m "style(canvas): teal colors for MediaNode"
```

---

### Task 11: Update InstagramProfileNode colors

**Files:**
- Modify: `src/components/canvas/InstagramProfileNode.tsx:50,65`

- [ ] **Step 1: Update HOOK_TYPE_COLORS**

Change line 50:
```tsx
// FROM
educational: "#22d3ee",
// TO
educational: "#2dd4bf",
```

- [ ] **Step 2: Update outlierColor function**

Change line 65:
```tsx
// FROM
if (score >= 5) return "#22d3ee";
// TO
if (score >= 5) return "#2dd4bf";
```

- [ ] **Step 3: Commit**

```bash
git add src/components/canvas/InstagramProfileNode.tsx
git commit -m "style(canvas): teal colors for InstagramProfileNode"
```

---

### Task 12: Update ScriptOutputPanel colors

**Files:**
- Modify: `src/components/canvas/ScriptOutputPanel.tsx` (lines 36-39, 62, 97)

- [ ] **Step 1: Update LINE_TYPE_STYLES actor entry**

Change lines 36-39:
```tsx
// FROM
actor: {
  color: "text-[#22d3ee]",
  bg: "bg-gradient-to-br from-[rgba(8,145,178,0.1)] to-[rgba(8,145,178,0.02)]",
  border: "border-[rgba(8,145,178,0.25)]",
  dot: "bg-[#0891B2]",
// TO
actor: {
  color: "text-[#2dd4bf]",
  bg: "bg-gradient-to-br from-[rgba(20,184,166,0.1)] to-[rgba(20,184,166,0.02)]",
  border: "border-[rgba(20,184,166,0.25)]",
  dot: "bg-[#0d9488]",
```

- [ ] **Step 2: Update SECTION_HEADERS hook entry**

Change line 62:
```tsx
// FROM
hook: { label: "HOOK", color: "text-[#22d3ee]", bar: "bg-[rgba(8,145,178,0.4)]" },
// TO
hook: { label: "HOOK", color: "text-[#2dd4bf]", bar: "bg-[rgba(20,184,166,0.4)]" },
```

- [ ] **Step 3: Update scoreColor**

Change line 97:
```tsx
// FROM
const scoreColor = script.virality_score >= 8 ? "text-[#a3e635]" : script.virality_score >= 6 ? "text-[#22d3ee]" : "text-orange-400";
// TO
const scoreColor = script.virality_score >= 8 ? "text-[#a3e635]" : script.virality_score >= 6 ? "text-[#2dd4bf]" : "text-orange-400";
```

- [ ] **Step 4: Commit**

```bash
git add src/components/canvas/ScriptOutputPanel.tsx
git commit -m "style(canvas): teal colors for ScriptOutputPanel"
```

---

## Chunk 3: Visual Verification + Deploy

### Task 13: Build and verify

- [ ] **Step 1: Build the project**

```bash
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 2: Visual verification checklist**

Open the app and navigate to a client's canvas. Verify:
1. Canvas shows notebook-style teal grid lines (not dots)
2. All node headers are teal-tinted (not cyan)
3. Nodes have subtle ambient teal glow
4. Client name badge appears in toolbar (left side, next to back button)
5. Drawing tool default color is teal (#2dd4bf)
6. Hook generator pills, buttons, selected states are teal
7. Video node section colors use teal for hook
8. Light theme still works unchanged
9. No visible cyan remnants anywhere on the canvas

- [ ] **Step 3: Deploy to VPS**

Use expect scripts to SCP the dist to VPS. Clear old assets first to prevent stale JS:
```bash
# 1. Clear old assets on VPS
ssh root@72.62.200.145 "rm -rf /var/www/connectacreators/assets/*"

# 2. Upload new build
scp -r dist/* root@72.62.200.145:/var/www/connectacreators/
```
