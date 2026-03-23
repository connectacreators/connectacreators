# Canvas Node Dark Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle all Super Planning Canvas nodes from white cards to flat dark charcoal (#1e1f24) with cyan accents only on header dots and connection handles.

**Architecture:** Pure CSS and inline-style changes across 4 files. The bulk of the work is replacing one large CSS override block in `index.css` that currently forces white/dark on all `.react-flow .glass-card` nodes. Three individual component files have hardcoded inline style values that also need flipping. No logic changes anywhere.

**Tech Stack:** React 18, Tailwind CSS, ReactFlow (`@xyflow/react`), plain CSS overrides in `src/index.css`

**Spec:** `docs/superpowers/specs/2026-03-23-canvas-node-dark-redesign.md`

---

## File Map

| File | Action | What changes |
|---|---|---|
| `src/index.css` | Modify lines ~424–515 | Replace entire `.react-flow .glass-card` block with dark equivalents |
| `src/pages/SuperPlanningCanvas.tsx` | Modify lines 1327, 1329, 1394, 1403, 1407, 1408 | 6 inline background/color ternaries → fixed dark values |
| `src/components/canvas/AIAssistantNode.tsx` | Modify lines 340, 342, 343, 344 | 4 hardcoded `#111111` / `rgba(0,0,0,...)` inline styles → light equivalents |
| `src/components/canvas/ScriptOutputPanel.tsx` | Modify lines ~35–42, ~62 | `actor` LINE_CONFIG + `hook` SECTION_HEADER dark values → light equivalents |

---

## Task 1: Replace canvas CSS block in `src/index.css`

**Files:**
- Modify: `src/index.css` lines ~424–515

This is the main task. The existing block (starting with `/* ReactFlow — White glassy canvas node cards */`) forces white backgrounds and dark text on every `glass-card` inside ReactFlow. Replace the entire block.

- [ ] **Find the start of the block to replace**

```bash
grep -n "White glassy canvas node cards" src/index.css
```

Expected output: a line number around 424.

- [ ] **Find the end of the block to replace**

```bash
grep -n "Handle connection dots" src/index.css
```

Expected output: a line number around 511. The block ends after `.react-flow .glass-card .react-flow__handle { background: #555555 !important; }` — the next line is a blank line or a comment about handle sizing (`Make connection handles bigger`). Do NOT replace anything past that point.

- [ ] **Replace the entire block** (from `/* ReactFlow — White glassy canvas node cards */` through the closing `}` of `.react-flow .glass-card .react-flow__handle`) with:

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

/* Handle connection dots — cyan with glow */
.react-flow .glass-card .react-flow__handle {
  background: #22d3ee !important;
  border-color: #131417 !important;
  box-shadow: 0 0 6px rgba(34, 211, 238, 0.4) !important;
}
```

- [ ] **Verify no stray old rules remain**

```bash
grep -n "#111111\|rgba(255,255,255,0.95)\|White glassy\|#555555" src/index.css
```

Expected: no matches inside the canvas block (there may be matches elsewhere in the file — that's fine, only check that the lines around 424–515 are gone).

- [ ] **TypeScript/build check**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected: no errors (CSS changes don't affect TS).

- [ ] **Commit**

```bash
git add src/index.css
git commit -m "feat(canvas): dark charcoal node cards — replace CSS override block"
```

---

## Task 2: Update canvas background in `src/pages/SuperPlanningCanvas.tsx`

**Files:**
- Modify: `src/pages/SuperPlanningCanvas.tsx` lines 1327, 1329, 1394, 1403, 1407, 1408

Six one-line changes. Each replaces a `theme === "light" ? ... : ...` ternary with a fixed dark value.

- [ ] **Change line 1327** — outer wrapper div background:

Find:
```tsx
    <div className="flex h-full overflow-hidden" style={{ background: theme === "light" ? "hsl(220 5% 96%)" : "hsl(210, 8%, 10%)" }}>
```
Replace with:
```tsx
    <div className="flex h-full overflow-hidden" style={{ background: "#131417" }}>
```

- [ ] **Change line 1329** — inner wrapper div background:

Find:
```tsx
      <div className="flex-1 relative min-w-0" style={{ background: theme === "light" ? "hsl(220 5% 96%)" : "hsl(210, 8%, 10%)" }}>
```
Replace with:
```tsx
      <div className="flex-1 relative min-w-0" style={{ background: "#131417" }}>
```

- [ ] **Change line 1394** — ReactFlow colorMode prop:

Find:
```tsx
          colorMode={theme === "light" ? "light" : "dark"}
```
Replace with:
```tsx
          colorMode="dark"
```

- [ ] **Change line 1403** — ReactFlow style prop background:

Find:
```tsx
          style={{ background: theme === "light" ? "hsl(220 5% 96%)" : "hsl(210, 8%, 10%)" }}
```
Replace with:
```tsx
          style={{ background: "#131417" }}
```

- [ ] **Change line 1407** — Background component bgColor:

Find:
```tsx
            bgColor={theme === "light" ? "hsl(220 5% 96%)" : "hsl(210, 8%, 10%)"}
```
Replace with:
```tsx
            bgColor="#131417"
```

- [ ] **Change line 1408** — Background component dot color:

Find:
```tsx
            color={theme === "light" ? "#cbd5e1" : "rgba(255, 255, 255, 0.15)"}
```
Replace with:
```tsx
            color="rgba(255,255,255,0.04)"
```

- [ ] **Verify all 6 ternaries are gone**

```bash
grep -n "theme === \"light\"" src/pages/SuperPlanningCanvas.tsx
```

Expected: no output (all ternaries removed).

- [ ] **Commit**

```bash
git add src/pages/SuperPlanningCanvas.tsx
git commit -m "feat(canvas): dark canvas background — remove theme ternaries"
```

---

## Task 3: Fix hardcoded dark inline styles in `src/components/canvas/AIAssistantNode.tsx`

**Files:**
- Modify: `src/components/canvas/AIAssistantNode.tsx` lines 340–344

The header row of the AI Assistant node has four hardcoded inline styles with dark values that bypass the CSS override. The exact lines:

- [ ] **Change line 340** — header row border-bottom:

Find:
```tsx
        <div className="flex items-center justify-between px-3 py-2.5 flex-shrink-0 cursor-default" style={{ background: 'transparent', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
```
Replace with:
```tsx
        <div className="flex items-center justify-between px-3 py-2.5 flex-shrink-0 cursor-default" style={{ background: 'transparent', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
```

- [ ] **Change line 342** — Bot icon color:

Find:
```tsx
            <Bot className="w-3.5 h-3.5" style={{ color: '#111111' }} />
```
Replace with:
```tsx
            <Bot className="w-3.5 h-3.5" style={{ color: '#e0e0e0' }} />
```

- [ ] **Change line 343** — "Connecta AI" title color:

Find:
```tsx
            <span className="text-xs font-semibold" style={{ color: '#111111' }}>Connecta AI</span>
```
Replace with:
```tsx
            <span className="text-xs font-semibold" style={{ color: '#e0e0e0' }}>Connecta AI</span>
```

- [ ] **Change line 344** — subtitle hint color:

Find:
```tsx
            <span className="text-[9px]" style={{ color: 'rgba(0,0,0,0.4)' }}>Draw edges from nodes to connect context</span>
```
Replace with:
```tsx
            <span className="text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>Draw edges from nodes to connect context</span>
```

- [ ] **Verify no dark inline styles remain in this file**

```bash
grep -n "color: '#111111'\|color: 'rgba(0,0,0" src/components/canvas/AIAssistantNode.tsx
```

Expected: no output.

- [ ] **Commit**

```bash
git add src/components/canvas/AIAssistantNode.tsx
git commit -m "feat(canvas): AIAssistantNode — fix hardcoded dark header inline styles"
```

---

## Task 4: Fix hardcoded dark values in `src/components/canvas/ScriptOutputPanel.tsx`

**Files:**
- Modify: `src/components/canvas/ScriptOutputPanel.tsx` lines ~35–42 and ~62

Two entries in the config objects use dark colors that will be invisible on the dark node background.

- [ ] **Change the `actor` entry in `LINE_CONFIG`** (lines ~35–42):

Find:
```tsx
  actor: {
    color: "text-[#111111]",
    bg: "bg-gradient-to-br from-[rgba(0,0,0,0.04)] to-transparent",
    border: "border-[rgba(0,0,0,0.08)]",
    dot: "bg-[#555555]",
```
Replace with:
```tsx
  actor: {
    color: "text-[#e0e0e0]",
    bg: "bg-gradient-to-br from-[rgba(255,255,255,0.05)] to-transparent",
    border: "border-[rgba(255,255,255,0.08)]",
    dot: "bg-[#707278]",
```

- [ ] **Change the `hook` entry in `SECTION_HEADERS`** (line ~62):

Find:
```tsx
  hook: { label: "HOOK", color: "text-[#111111]", bar: "bg-[rgba(0,0,0,0.15)]" },
```
Replace with:
```tsx
  hook: { label: "HOOK", color: "text-[#e0e0e0]", bar: "bg-[rgba(255,255,255,0.1)]" },
```

- [ ] **Verify no dark values remain in these config objects**

```bash
grep -n "#111111\|rgba(0,0,0,0.04)\|rgba(0,0,0,0.08)\|rgba(0,0,0,0.15)\|#555555" src/components/canvas/ScriptOutputPanel.tsx
```

Expected: no output.

- [ ] **Commit**

```bash
git add src/components/canvas/ScriptOutputPanel.tsx
git commit -m "feat(canvas): ScriptOutputPanel — fix dark actor/hook config values"
```

---

## Task 5: Build, verify & deploy

- [ ] **Full production build**

```bash
npm run build 2>&1 | tail -10
```

Expected: `✓ built in X.XXs` with no errors. Chunk size warnings are OK.

- [ ] **Visual verification checklist**

```bash
npm run dev
```

Open `http://localhost:8082` and navigate to the Super Planning Canvas. Verify all of the following:

- [ ] Canvas background is dark (`#131417`), not light gray
- [ ] All `glass-card` node types (AI, Brand Guide, Research Note, Text Note, CTA, Video, Media, Hook Generator) show dark `#1e1f24` bodies
- [ ] InstagramProfileNode appears dark (uses CSS vars, not glass-card — acceptable as-is)
- [ ] Cyan appears **only** on the small header dot and connection handles — not in any background, border, or label text
- [ ] Heading text is light (`#e0e0e0`), muted text is `#707278`
- [ ] Connection handles are cyan with a faint glow and dark cutout border
- [ ] No white cards or white flash anywhere on the canvas
- [ ] HOOK section label in the script output panel is visible (light, not black-on-dark)
- [ ] Canvas dot-grid is visible as faint white dots

- [ ] **Deploy to VPS**

```bash
tar -czf /tmp/dist.tar.gz dist/

expect << 'EOF'
set timeout 60
spawn scp /tmp/dist.tar.gz root@72.62.200.145:/tmp/dist.tar.gz
expect "password:" { send "Loqueveoloveo290802#\r"; exp_continue }
expect eof
EOF

expect << 'EOF'
set timeout 60
spawn ssh root@72.62.200.145 "rm -rf /var/www/connectacreators/dist && tar -xzf /tmp/dist.tar.gz -C /var/www/connectacreators/ && nginx -s reload && echo DONE"
expect "password:" { send "Loqueveoloveo290802#\r"; exp_continue }
expect "DONE" {}
expect eof
EOF
```

- [ ] **Confirm live site**

```bash
curl -s -o /dev/null -w "%{http_code}" https://connectacreators.com/
```

Expected: `200`

- [ ] **Final commit**

```bash
git add -A
git commit -m "feat(canvas): dark charcoal node redesign — complete"
```
