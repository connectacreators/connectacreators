# Hero Redesign + Logo Integration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hero section and features grid in `Home.tsx` with: (1) horse logo in navbar, (2) new headline + two CTAs + canvas screenshot mockup, (3) animated "See it work" canvas demo replacing the features grid. Everything below the features section stays untouched.

**Architecture:** All changes are confined to `src/pages/Home.tsx` and a new `src/components/CanvasDemo.tsx` component. The canvas demo is a self-contained React component with pure CSS animations and no external dependencies — it mirrors the actual canvas node aesthetics (glass-card styles, exact color tokens) from `src/index.css`.

**Tech Stack:** React, TypeScript, Framer Motion (already in project), Tailwind CSS, existing app design tokens from `src/index.css`

---

## Chunk 1: Horse Logo in Navbar + Hero Copy

### Task 0: Define missing `btn-17-hero` CSS class

**Files:**
- Modify: `src/index.css`

The class `btn-17-hero` is used in the existing `Home.tsx` (bottom CTA section, line ~283) but is not defined in `index.css`. This is a pre-existing bug that needs to be fixed before the hero work.

- [ ] **Step 1: Add `btn-17-hero` to `src/index.css`**

Find the existing `btn-17` block (around line 430):

```css
.btn-17-primary { background: linear-gradient(135deg, #0891B2, #84CC16); ... }
.btn-17-secondary { background: rgba(8,145,178,0.1); ... }
.btn-17 { background: rgba(255,255,255,0.04); ... }
```

Add `btn-17-hero` after `btn-17-primary`:

```css
.btn-17-hero { background: linear-gradient(135deg, #0891B2, #84CC16); color: #fff; box-shadow: 0 4px 20px rgba(8,145,178,0.35), inset 0 1px 0 rgba(255,255,255,0.15); border-radius: 9999px; }
```

- [ ] **Step 2: Commit**

```bash
git add src/index.css
git commit -m "fix(styles): define missing btn-17-hero class"
```

---

### Task 1: Add horse logo to navbar

**Files:**
- Modify: `src/pages/Home.tsx:87-103`

The navbar currently shows `connecta-logo-text-light.png` / `connecta-logo-text-dark.png`. Replace with the horse SVG icon + "Connecta" wordmark text, using the existing `chess-knight-white.svg` asset with a cyan-to-lime gradient background pill.

- [ ] **Step 1: Update the navbar import — add the horse SVG asset**

In `src/pages/Home.tsx`, add this import near the top with the other asset imports:

```tsx
import horseIcon from "@/assets/chess-knight-white.svg";
```

> ⚠️ **Do NOT remove** the `connectaLoginLogo` and `connectaLoginLogoDark` imports — the footer at the bottom of the file still uses them.

- [ ] **Step 2: Replace the navbar logo with horse icon + wordmark**

Find and replace the `<header>` logo `<img>` element (line ~89-93):

```tsx
// BEFORE
<img
  src={theme === "light" ? connectaLoginLogoDark : connectaLoginLogo}
  alt="Connecta"
  className="h-6 object-contain"
/>

// AFTER
<div className="flex items-center gap-2.5">
  <div
    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
    style={{ background: "linear-gradient(135deg, #0891B2, #84CC16)", boxShadow: "0 2px 8px rgba(8,145,178,0.4)" }}
  >
    <img src={horseIcon} alt="" className="w-5 h-5" />
  </div>
  <span className="font-bold text-base tracking-tight text-foreground">Connecta</span>
</div>
```

- [ ] **Step 3: Verify navbar still renders — check no import errors**

Run: `npm run build 2>&1 | tail -20` from `/Users/admin/Desktop/connectacreators`
Expected: build completes with no TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add src/pages/Home.tsx
git commit -m "feat(home): add horse logo + wordmark to navbar"
```

---

### Task 2: Update hero headline, subhead, and CTAs

**Files:**
- Modify: `src/pages/Home.tsx:106-160`
- Modify: `src/i18n/translations.ts` (heroTitle, heroSubtitle keys)

- [ ] **Step 1: Update translation strings for hero copy**

In `src/i18n/translations.ts`, find `heroTitle` and `heroSubtitle` (around line 298) and update:

```ts
// BEFORE
heroTitle: { en: "Connect with your clients faster", es: "Connecta con tus clientes más rápido" },
heroSubtitle: { ... }

// AFTER
heroTitle: { en: "Replicate Viral Videos. Generate Scripts in Seconds.", es: "Replica Videos Virales. Genera Scripts en Segundos." },
heroSubtitle: {
  en: "The AI canvas that turns competitor research into content your clients love.",
  es: "El canvas con IA que convierte investigación de competidores en contenido que tus clientes aman.",
},
```

- [ ] **Step 2: Replace the hero section JSX**

Find the `{/* Hero */}` section (lines ~106-160) and replace the entire `<section>` with:

```tsx
{/* Hero */}
<section className="min-h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden">
  <DottedGlobe />
  <div className="max-w-4xl mx-auto text-center flex flex-col items-center pt-24 relative z-10">
    {/* Pill label */}
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mb-8"
    >
      <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs tracking-widest uppercase font-medium"
        style={{ background: "rgba(8,145,178,0.1)", border: "1px solid rgba(8,145,178,0.25)", color: "#22d3ee" }}>
        AI-Powered Content Studio
      </span>
    </motion.div>

    {/* Headline — two lines, second line gets gradient */}
    <motion.h1
      className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.05] mb-6"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15, duration: 0.55, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      Replicate Viral Videos.<br />
      <span style={{
        background: "linear-gradient(135deg, #06B6D4, #84CC16)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
      }}>
        Generate Scripts in Seconds.
      </span>
    </motion.h1>

    {/* Subheadline */}
    <motion.p
      className="text-muted-foreground text-base sm:text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.45, duration: 0.6 }}
    >
      {tr(t.home.heroSubtitle, language)}
    </motion.p>

    {/* Two CTAs */}
    <motion.div
      className="flex flex-col sm:flex-row items-center gap-4 mb-16"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.65, duration: 0.4 }}
    >
      <Link to="/select-plan">
        <button
          className="px-8 py-3 rounded-full text-sm font-semibold text-white"
          style={{
            background: "linear-gradient(135deg, #0891B2, #84CC16)",
            boxShadow: "0 4px 20px rgba(8,145,178,0.4), inset 0 1px 0 rgba(255,255,255,0.15)",
          }}
        >
          Start Free Trial →
        </button>
      </Link>
      <a href="#demo">
        <button
          className="px-8 py-3 rounded-full text-sm font-semibold"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "#94a3b8",
          }}
        >
          See Demo
        </button>
      </a>
    </motion.div>

    {/* Canvas screenshot mockup */}
    <motion.div
      className="w-full max-w-5xl rounded-2xl overflow-hidden relative"
      style={{
        border: "1px solid rgba(8,145,178,0.2)",
        boxShadow: "0 32px 80px rgba(0,0,0,0.5), 0 0 60px rgba(8,145,178,0.08)",
      }}
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.85, duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      {/* Browser chrome bar */}
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="w-3 h-3 rounded-full" style={{ background: "#f43f5e", opacity: 0.7 }} />
        <div className="w-3 h-3 rounded-full" style={{ background: "#f59e0b", opacity: 0.7 }} />
        <div className="w-3 h-3 rounded-full" style={{ background: "#a3e635", opacity: 0.7 }} />
        <div
          className="flex-1 mx-4 rounded-md px-3 py-1 text-xs text-center"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#64748b" }}
        >
          connectacreators.com/canvas
        </div>
      </div>
      {/* Canvas preview — dark bg with node mockups */}
      <div
        className="relative w-full"
        style={{
          background: "#06090c",
          minHeight: "340px",
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        {/* ambient glow */}
        <div style={{ position:"absolute", inset:0, pointerEvents:"none",
          background: "radial-gradient(ellipse at 20% 20%, rgba(8,145,178,0.07) 0%, transparent 55%), radial-gradient(ellipse at 80% 80%, rgba(132,204,22,0.05) 0%, transparent 55%)" }} />
        {/* Three node mockups */}
        <div className="absolute flex gap-4 items-start" style={{ left: "5%", top: "14%", right: "5%" }}>
          {/* Video node */}
          <div className="rounded-xl overflow-hidden flex-shrink-0" style={{ width:180, background:"rgba(8,145,178,0.07)", border:"1px solid rgba(8,145,178,0.2)", boxShadow:"inset 0 1px 0 rgba(8,145,178,0.15), 0 4px 20px rgba(0,0,0,0.3)" }}>
            <div className="flex items-center gap-2 px-3 py-2.5" style={{ background:"rgba(8,145,178,0.08)", borderBottom:"1px solid rgba(8,145,178,0.15)" }}>
              <div className="w-5 h-5 rounded-md flex items-center justify-center text-xs" style={{ background:"rgba(8,145,178,0.2)", border:"1px solid rgba(8,145,178,0.3)" }}>🎬</div>
              <span className="text-xs font-semibold" style={{ color:"#22d3ee" }}>Video Node</span>
            </div>
            <div className="m-2.5 rounded-lg flex items-center justify-center" style={{ height:56, background:"linear-gradient(135deg,rgba(8,145,178,0.2),rgba(0,0,0,0.5))", border:"1px solid rgba(8,145,178,0.2)" }}>
              <span style={{ fontSize:20 }}>▶</span>
            </div>
            <div className="mx-2.5 mb-1" style={{ height:2, background:"rgba(255,255,255,0.06)", borderRadius:2 }}>
              <div style={{ width:"75%", height:"100%", background:"linear-gradient(90deg,#0891B2,#84CC16)", borderRadius:2 }} />
            </div>
            <div className="mx-2.5 mb-2.5 flex flex-col gap-1">
              {[["HOOK","#22d3ee","rgba(8,145,178,0.08)","rgba(8,145,178,0.2)"],["BODY","#94a3b8","rgba(148,163,184,0.06)","rgba(148,163,184,0.15)"],["CTA","#a3e635","rgba(132,204,22,0.06)","rgba(132,204,22,0.15)"]].map(([label,color,bg,border]) => (
                <div key={label} className="flex items-center gap-1.5 rounded px-1.5 py-1" style={{ background:bg, border:`1px solid ${border}` }}>
                  <span style={{ fontSize:7, fontWeight:700, color }}>{label}</span>
                  <span style={{ fontSize:7, color:"rgba(226,232,240,0.4)" }}>Hook detected</span>
                </div>
              ))}
            </div>
          </div>

          {/* SVG edge video→AI */}
          <div className="flex items-center self-center" style={{ marginTop:-20 }}>
            <svg width="60" height="24" style={{ overflow:"visible" }}>
              <path d="M 0,12 C 20,12 40,12 60,12" stroke="rgba(34,211,238,0.5)" strokeWidth="1.5" fill="none" strokeDasharray="3,2"/>
              <circle cx="60" cy="12" r="3" fill="#22d3ee"/>
            </svg>
          </div>

          {/* AI node */}
          <div className="rounded-xl overflow-hidden flex-1" style={{ background:"rgba(255,255,255,0.035)", border:"1px solid rgba(255,255,255,0.07)", boxShadow:"inset 0 1px 0 rgba(255,255,255,0.06), 0 4px 20px rgba(0,0,0,0.3)" }}>
            <div className="flex items-center gap-2 px-3 py-2.5" style={{ background:"rgba(8,145,178,0.08)", borderBottom:"1px solid rgba(8,145,178,0.15)" }}>
              <div className="w-5 h-5 rounded-md flex items-center justify-center text-xs" style={{ background:"rgba(8,145,178,0.15)", border:"1px solid rgba(8,145,178,0.25)" }}>🤖</div>
              <span className="text-xs font-semibold" style={{ color:"#0891B2" }}>Connecta AI</span>
              <span className="text-xs ml-1" style={{ color:"rgba(226,232,240,0.35)" }}>Draw edges from nodes to connect context</span>
            </div>
            <div className="p-3 flex flex-col gap-2">
              <div className="flex gap-1.5">
                <div className="rounded px-2 py-1 text-xs flex items-center gap-1.5" style={{ background:"rgba(8,145,178,0.08)", border:"1px solid rgba(8,145,178,0.2)" }}>
                  <div style={{ width:5, height:5, borderRadius:"50%", background:"#22d3ee", flexShrink:0 }}/>
                  <span style={{ color:"#22d3ee", fontSize:9 }}>VideoNode · @viral.fitness</span>
                </div>
                <div className="rounded px-2 py-1 text-xs flex items-center gap-1.5" style={{ background:"rgba(244,63,94,0.08)", border:"1px solid rgba(244,63,94,0.2)" }}>
                  <div style={{ width:5, height:5, borderRadius:"50%", background:"#f43f5e", flexShrink:0 }}/>
                  <span style={{ color:"#f43f5e", fontSize:9 }}>CompetitorNode</span>
                </div>
              </div>
              {[["HOOK","#22d3ee","rgba(8,145,178,0.08)","rgba(8,145,178,0.2)","\"The thing most creators never...\""],["BODY","#94a3b8","rgba(148,163,184,0.06)","rgba(148,163,184,0.15)","I wasted 6 months before I..."],["CTA","#a3e635","rgba(132,204,22,0.06)","rgba(132,204,22,0.15)","Comment \"YES\" for the full list"]].map(([label,color,bg,border,text]) => (
                <div key={label} className="rounded-md p-2" style={{ background:bg, border:`1px solid ${border}` }}>
                  <div style={{ fontSize:8, fontWeight:700, color, marginBottom:2 }}>{label}</div>
                  <div style={{ fontSize:9, color:"rgba(226,232,240,0.45)" }}>{text}</div>
                </div>
              ))}
              <div className="rounded-lg py-2 text-center text-xs font-semibold text-white" style={{ background:"linear-gradient(135deg,#0891B2,#84CC16)", boxShadow:"0 4px 12px rgba(8,145,178,0.3)" }}>✓ Copy Script</div>
            </div>
          </div>

          {/* SVG edge comp→AI */}
          <div className="absolute" style={{ left:"23%", top:"68%" }}>
            <svg width="80" height="80" style={{ overflow:"visible" }}>
              <path d="M 0,0 C 40,0 40,60 80,60" stroke="rgba(244,63,94,0.45)" strokeWidth="1.5" fill="none" strokeDasharray="3,2"/>
            </svg>
          </div>

          {/* Competitor node — bottom left */}
          <div className="absolute rounded-xl overflow-hidden" style={{ left:"5%", top:"55%", width:175, background:"rgba(255,255,255,0.035)", border:"1px solid rgba(255,255,255,0.07)", boxShadow:"inset 0 1px 0 rgba(255,255,255,0.06), 0 4px 20px rgba(0,0,0,0.3)" }}>
            <div className="flex items-center gap-2 px-3 py-2.5" style={{ background:"linear-gradient(135deg,rgba(244,63,94,0.15),rgba(168,85,247,0.15))", borderBottom:"1px solid rgba(244,63,94,0.2)" }}>
              <div className="w-5 h-5 rounded-md flex items-center justify-center text-xs" style={{ background:"linear-gradient(135deg,#f43f5e,#a855f7)" }}>🔍</div>
              <div>
                <div className="text-xs font-semibold text-foreground leading-none">Competitor Analysis</div>
                <div style={{ fontSize:9, color:"rgba(244,63,94,0.8)", marginTop:1 }}>@dr.rival.fitness</div>
              </div>
            </div>
            <div className="p-2 flex flex-col gap-1">
              {[["#1","5.2x","1.2M","rgba(244,63,94,0.1)","#f43f5e","rgba(34,211,238,0.1)","#22d3ee"],["#2","3.1x","890K","rgba(244,63,94,0.07)","#f43f5e","rgba(163,230,53,0.1)","#a3e635"],["#3","2.4x","650K","rgba(244,63,94,0.05)","#64748b","rgba(255,255,255,0.05)","#64748b"]].map(([rank,score,views,rowBg,vColor,badgeBg,badgeColor]) => (
                <div key={rank} className="flex items-center justify-between rounded px-2 py-1" style={{ background:rowBg }}>
                  <span style={{ fontSize:9, color:"rgba(226,232,240,0.45)" }}>{rank} · Reel</span>
                  <span style={{ fontSize:8, fontWeight:600, borderRadius:20, padding:"1px 5px", background:badgeBg, color:badgeColor, border:`1px solid ${badgeBg}` }}>{score}</span>
                  <span style={{ fontSize:9, fontWeight:700, color:vColor }}>{views}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* bottom fade */}
        <div style={{ position:"absolute", bottom:0, left:0, right:0, height:"30%", background:"linear-gradient(to bottom, transparent, #06090c)", pointerEvents:"none" }} />
      </div>
    </motion.div>
  </div>
</section>
```

- [ ] **Step 3: Build to verify no TypeScript errors**

Run: `npm run build 2>&1 | tail -20`
Expected: clean build

- [ ] **Step 4: Commit**

```bash
git add src/pages/Home.tsx src/i18n/translations.ts
git commit -m "feat(home): new hero — viral video headline, two CTAs, canvas screenshot mockup"
```

---

## Chunk 2: Animated Canvas Demo ("See it work")

### Task 3: Create the CanvasDemo component

**Files:**
- Create: `src/components/CanvasDemo.tsx`

This is the animated canvas demo — a self-contained React component with no external dependencies. It uses `useEffect` + `useRef` for the animation loop, and inline styles matching the app's exact design tokens. No Framer Motion needed — pure CSS transitions + JS timing.

- [ ] **Step 1: Create `src/components/CanvasDemo.tsx`**

```tsx
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

// Exact app color tokens
const C = {
  bg: "#06090c",
  cyan: "#0891B2",
  cyanL: "#22d3ee",
  lime: "#84CC16",
  limeL: "#a3e635",
  red: "#f43f5e",
  purple: "#a855f7",
  fg: "#e2e8f0",
  fgDim: "rgba(226,232,240,0.45)",
  muted: "#64748b",
  cardBg: "rgba(255,255,255,0.035)",
  cardBorder: "rgba(255,255,255,0.07)",
  cardShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 4px 20px rgba(0,0,0,0.3)",
};

interface NodeState {
  videoVisible: boolean;
  compVisible: boolean;
  aiVisible: boolean;
  videoGlow: boolean;
  compGlow: boolean;
  aiGlow: boolean;
  edge1Drawn: boolean;
  edge2Drawn: boolean;
  progWidth: number;
  progVisible: boolean;
  structVisible: boolean;
  ctxVideoTag: boolean;
  ctxCompTag: boolean;
  genBtnVisible: boolean;
  scriptVisible: boolean;
  line1Typed: boolean;
  line2Typed: boolean;
  line3Typed: boolean;
}

const INITIAL: NodeState = {
  videoVisible: false, compVisible: false, aiVisible: false,
  videoGlow: false, compGlow: false, aiGlow: false,
  edge1Drawn: false, edge2Drawn: false,
  progWidth: 0, progVisible: false, structVisible: false,
  ctxVideoTag: false, ctxCompTag: false,
  genBtnVisible: false, scriptVisible: false,
  line1Typed: false, line2Typed: false, line3Typed: false,
};

interface CursorPos { x: number; y: number; }

// Positions as % of container width/height — computed at render time
// We use fixed pixel offsets from known % anchors
const PCT = {
  videoX: 0.07, videoY: 0.18,
  compX: 0.07, compY: 0.56,
  aiX: 0.52, aiY: 0.20,
};

export default function CanvasDemo() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [nodes, setNodes] = useState<NodeState>(INITIAL);
  const [cursor, setCursor] = useState<CursorPos>({ x: 200, y: 200 });
  const [rings, setRings] = useState<{ id: number; x: number; y: number }[]>([]);
  const [trails, setTrails] = useState<{ id: number; x: number; y: number }[]>([]);
  const [stepLabel, setStepLabel] = useState("");
  const [capStep, setCapStep] = useState(1);
  const [activeDot, setActiveDot] = useState(0);
  const pausedRef = useRef(false);
  const ringId = useRef(0);
  const trailId = useRef(0);

  function dim() {
    const w = wrapRef.current?.offsetWidth || 800;
    const h = wrapRef.current?.offsetHeight || 500;
    return { w, h };
  }

  function pct(xPct: number, yPct: number) {
    const { w, h } = dim();
    return { x: w * xPct, y: h * yPct };
  }

  function mv(x: number, y: number) {
    setCursor({ x, y });
  }

  function click(x: number, y: number) {
    mv(x, y);
    const id = ++ringId.current;
    setRings(r => [...r, { id, x, y }]);
    setTimeout(() => setRings(r => r.filter(r2 => r2.id !== id)), 550);
  }

  function trail(x: number, y: number) {
    const id = ++trailId.current;
    setTrails(r => [...r, { id, x, y }]);
    setTimeout(() => setTrails(r => r.filter(r2 => r2.id !== id)), 600);
  }

  function upd(patch: Partial<NodeState>) {
    setNodes(n => ({ ...n, ...patch }));
  }

  function tip(t: string) { setStepLabel(t); }

  function wait(ms: number) {
    return new Promise<void>(res => {
      let elapsed = 0;
      let last = Date.now();
      const check = () => {
        if (!pausedRef.current) elapsed += Date.now() - last;
        last = Date.now();
        if (elapsed >= ms) return res();
        setTimeout(check, 20);
      };
      setTimeout(check, 20);
    });
  }

  async function drag(x1: number, y1: number, x2: number, y2: number, steps = 8, dur = 380) {
    mv(x1, y1);
    await wait(100);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, u = 1 - t;
      const x = x1 * u + x2 * t, y = y1 * u + y2 * t;
      mv(x, y);
      trail(x, y);
      await wait(dur / steps);
    }
  }

  async function step0() {
    setActiveDot(0); setCapStep(1); tip("Drop a viral video onto the canvas");
    const { w, h } = dim();
    const vx = w * PCT.videoX, vy = h * PCT.videoY;
    mv(w * 0.3, 28);
    await wait(180);
    await drag(w * 0.3, 28, vx + 90, vy + 55, 6, 300);
    click(vx + 90, vy + 55);
    upd({ videoVisible: true });
    await wait(260);
    upd({ progVisible: true, progWidth: 100 });
    mv(vx + 70, vy + 120);
    await wait(1300);
    upd({ structVisible: true, progVisible: false });
    tip("AI extracted Hook · Body · CTA ✓");
    await wait(1000);
  }

  async function step1() {
    setActiveDot(1); setCapStep(2); tip("Connect Video Node to AI");
    const { w, h } = dim();
    const vx = w * PCT.videoX, vy = h * PCT.videoY;
    const ax = w * PCT.aiX, ay = h * PCT.aiY;
    const vRight = { x: vx + 210, y: vy + 95 };
    const aLeft  = { x: ax,       y: ay + 95 };
    upd({ aiVisible: true });
    mv(vRight.x - 4, vRight.y);
    await wait(280);
    await drag(vRight.x, vRight.y, aLeft.x, aLeft.y, 10, 450);
    click(aLeft.x, aLeft.y);
    upd({ edge1Drawn: true, videoGlow: true, aiGlow: true, ctxVideoTag: true, genBtnVisible: true });
    mv(ax + 130, ay + 100);
    tip("AI sees the full video structure instantly");
    await wait(1200);
  }

  async function step2() {
    setActiveDot(2); setCapStep(3); tip("Add a competitor profile");
    const { w, h } = dim();
    const cx = w * PCT.compX, cy = h * PCT.compY;
    const ax = w * PCT.aiX, ay = h * PCT.aiY;
    mv(w * 0.25, 28);
    await wait(180);
    await drag(w * 0.25, 28, cx + 90, cy + 50, 6, 300);
    click(cx + 90, cy + 50);
    upd({ compVisible: true });
    await wait(450);
    tip("Connect competitor → AI");
    const cRight = { x: cx + 210, y: cy + 90 };
    const aLeft  = { x: ax,       y: ay + 130 };
    mv(cRight.x - 4, cRight.y);
    await wait(280);
    await drag(cRight.x, cRight.y, aLeft.x, aLeft.y, 10, 480);
    click(aLeft.x, aLeft.y);
    upd({ edge2Drawn: true, compGlow: true, ctxCompTag: true });
    tip("Competitor top posts now in context");
    await wait(1100);
  }

  async function step3() {
    setActiveDot(3); setCapStep(4); tip("Generate script from all nodes");
    const { w, h } = dim();
    const ax = w * PCT.aiX, ay = h * PCT.aiY;
    mv(ax + 125, ay + 185);
    await wait(380);
    click(ax + 125, ay + 188);
    upd({ genBtnVisible: false, scriptVisible: true });
    await wait(280);
    upd({ line1Typed: true });
    await wait(950);
    upd({ line2Typed: true });
    await wait(850);
    upd({ line3Typed: true });
    mv(ax + 125, ay + 270);
    tip("Full viral script — ready to film ✨");
    await wait(2200);
  }

  function reset() {
    setNodes(INITIAL);
    setStepLabel("");
  }

  useEffect(() => {
    let alive = true;
    async function loop() {
      await wait(500);
      while (alive) {
        await step0(); await step1(); await step2(); await step3();
        await wait(1000);
        reset();
        await wait(600);
      }
    }
    loop();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Edge path calculation ──
  function edgePath(x1: number, y1: number, x2: number, y2: number) {
    const mx = (x1 + x2) / 2;
    return `M ${x1},${y1} C ${mx},${y1} ${mx},${y2} ${x2},${y2}`;
  }

  const { w: W, h: H } = dim();
  const vx = W * PCT.videoX, vy = H * PCT.videoY;
  const cx = W * PCT.compX, cy = H * PCT.compY;
  const ax = W * PCT.aiX,   ay = H * PCT.aiY;

  const nodeStyle = (visible: boolean, glow?: string): CSSProperties => ({
    position: "absolute", borderRadius: 16, overflow: "hidden",
    background: C.cardBg, border: `1px solid ${glow || C.cardBorder}`,
    boxShadow: glow ? `${C.cardShadow}, 0 0 22px ${glow}66` : C.cardShadow,
    backdropFilter: "blur(24px) saturate(150%)",
    opacity: visible ? 1 : 0,
    transform: visible ? "scale(1)" : "scale(0.88)",
    transition: "opacity 0.35s ease, transform 0.35s ease, box-shadow 0.25s, border-color 0.25s",
  });

  return (
    <div
      ref={wrapRef}
      style={{ width: "100%", height: "100%", position: "relative", background: C.bg, overflow: "hidden" }}
      // Note: id="demo" lives on the parent <section> in Home.tsx — do not add it here
      onMouseEnter={() => { pausedRef.current = true; }}
      onMouseLeave={() => { pausedRef.current = false; }}
    >
      {/* Dot grid */}
      <div style={{ position:"absolute", inset:0, pointerEvents:"none",
        backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.045) 1px, transparent 1px)",
        backgroundSize: "22px 22px" }} />
      {/* Ambient glow */}
      <div style={{ position:"absolute", inset:0, pointerEvents:"none",
        background: "radial-gradient(ellipse at 18% 8%, rgba(8,145,178,0.08) 0%, transparent 52%), radial-gradient(ellipse at 82% 92%, rgba(132,204,22,0.06) 0%, transparent 52%)" }} />

      {/* Toolbar strip */}
      <div style={{ position:"absolute", top:14, left:"50%", transform:"translateX(-50%)",
        background:"rgba(255,255,255,0.03)", border:"1px solid rgba(8,145,178,0.12)",
        backdropFilter:"blur(20px)", borderRadius:10, padding:"5px 14px",
        display:"flex", alignItems:"center", gap:10, zIndex:50 }}>
        {["🎬 Video","🔍 Competitor","🤖 AI","📝 Note"].map((label, i) => (
          <span key={i} style={{ fontSize:9.5, color:C.muted, display:"flex", alignItems:"center", gap:3 }}>
            {label}
            {i < 3 && <span style={{ width:1, height:13, background:"rgba(255,255,255,0.08)", margin:"0 2px", display:"inline-block" }} />}
          </span>
        ))}
      </div>

      {/* Step caption */}
      <div style={{ position:"absolute", top:52, left:"50%", transform:"translateX(-50%)",
        background:"rgba(6,9,12,0.8)", border:"1px solid rgba(255,255,255,0.07)",
        backdropFilter:"blur(10px)", borderRadius:8, padding:"5px 14px",
        display:"flex", alignItems:"center", gap:8, zIndex:50, whiteSpace:"nowrap" }}>
        <div style={{ width:18, height:18, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:9, fontWeight:800, color:"#fff", flexShrink:0,
          background: capStep <= 2 ? "linear-gradient(135deg,#0891B2,#22d3ee)" : capStep === 3 ? "linear-gradient(135deg,#be185d,#f43f5e)" : "linear-gradient(135deg,#16a34a,#84CC16)" }}>
          {capStep}
        </div>
        <span style={{ fontSize:10.5, color:"rgba(226,232,240,0.6)" }}>{stepLabel}</span>
      </div>

      {/* SVG edges */}
      <svg style={{ position:"absolute", inset:0, pointerEvents:"none", overflow:"visible" }} width="100%" height="100%">
        <defs>
          <marker id="mc2" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto">
            <path d="M0,.5 L7,3.5 L0,6.5 Z" fill="rgba(34,211,238,.75)"/>
          </marker>
          <marker id="mr2" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto">
            <path d="M0,.5 L7,3.5 L0,6.5 Z" fill="rgba(244,63,94,.7)"/>
          </marker>
        </defs>
        {/* video → AI */}
        <path
          d={edgePath(vx + 210, vy + 95, ax, ay + 95)}
          fill="none" stroke="rgba(34,211,238,0.55)" strokeWidth="1.5"
          markerEnd="url(#mc2)"
          strokeDasharray="240" strokeDashoffset={nodes.edge1Drawn ? 0 : 240}
          style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(.4,0,.2,1)" }}
        />
        {/* comp → AI */}
        <path
          d={edgePath(cx + 210, cy + 90, ax, ay + 130)}
          fill="none" stroke="rgba(244,63,94,0.55)" strokeWidth="1.5"
          markerEnd="url(#mr2)"
          strokeDasharray="300" strokeDashoffset={nodes.edge2Drawn ? 0 : 300}
          style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(.4,0,.2,1)" }}
        />
      </svg>

      {/* ── VIDEO NODE ── */}
      <div style={{ ...nodeStyle(nodes.videoVisible, nodes.videoGlow ? C.cyanL : undefined), left: vx, top: vy, width: 210 }}>
        <div style={{ display:"flex", alignItems:"center", gap:7, padding:"9px 12px 8px", borderBottom:"1px solid rgba(8,145,178,0.15)", background:"rgba(8,145,178,0.08)" }}>
          <div style={{ width:22, height:22, borderRadius:7, background:"rgba(8,145,178,0.2)", border:"1px solid rgba(8,145,178,0.3)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11 }}>🎬</div>
          <div>
            <div style={{ fontSize:11, fontWeight:600, color:C.cyanL }}>Video Node</div>
            <div style={{ fontSize:9, color:C.fgDim }}>Analyze reel structure</div>
          </div>
          <div style={{ position:"absolute", right:-5, top:"50%", transform:"translateY(-50%)", width:10, height:10, borderRadius:"50%", background:C.cyan, border:"1.5px solid rgba(8,145,178,0.7)", zIndex:10 }} />
        </div>
        <div style={{ margin:"10px 12px 6px", height:72, borderRadius:8, background:"linear-gradient(135deg,rgba(8,145,178,0.2),rgba(0,0,0,0.5))", border:"1px solid rgba(8,145,178,0.2)", display:"flex", alignItems:"center", justifyContent:"center", position:"relative", overflow:"hidden" }}>
          <div style={{ width:28, height:28, borderRadius:"50%", background:"rgba(8,145,178,0.4)", border:"1.5px solid rgba(34,211,238,0.5)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12 }}>▶</div>
          <div style={{ position:"absolute", bottom:5, left:7, fontSize:8, color:"rgba(255,255,255,0.55)", background:"rgba(0,0,0,0.55)", borderRadius:3, padding:"1px 5px" }}>@viral.fitness</div>
        </div>
        {/* Progress bar */}
        <div style={{ margin:"0 12px 5px", height:2, background:"rgba(255,255,255,0.07)", borderRadius:2, overflow:"hidden", display: nodes.progVisible ? "block" : "none" }}>
          <div style={{ height:"100%", borderRadius:2, background:"linear-gradient(90deg,#0891B2,#84CC16)", width:`${nodes.progWidth}%`, transition:"width 1.4s linear" }} />
        </div>
        <div style={{ margin:"0 12px 6px", fontSize:9, color:C.cyanL, opacity: nodes.progVisible ? 1 : 0, transition:"opacity 0.3s" }}>Analyzing structure...</div>
        {/* Structure pills */}
        <div style={{ margin:"0 10px 10px", display: nodes.structVisible ? "flex" : "none", flexDirection:"column", gap:3 }}>
          {([["HOOK",C.cyanL,"rgba(8,145,178,0.08)","rgba(8,145,178,0.2)","\"Nobody tells you this...\""],["BODY","#94a3b8","rgba(148,163,184,0.06)","rgba(148,163,184,0.15)","Authority → stat → story"],["CTA",C.limeL,"rgba(132,204,22,0.06)","rgba(132,204,22,0.15)","Comment \"guide\" below"]] as const).map(([label,color,bg,border,text]) => (
            <div key={label} style={{ borderRadius:5, padding:"3px 8px", display:"flex", alignItems:"center", gap:5, background:bg, border:`1px solid ${border}` }}>
              <span style={{ color, fontSize:8, fontWeight:700 }}>{label}</span>
              <span style={{ color:C.fgDim, fontSize:8 }}>{text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── COMPETITOR NODE ── */}
      <div style={{ ...nodeStyle(nodes.compVisible, nodes.compGlow ? "#f43f5e" : undefined), left: cx, top: cy, width: 210 }}>
        <div style={{ display:"flex", alignItems:"center", gap:7, padding:"9px 12px 8px", borderBottom:"1px solid rgba(244,63,94,0.2)", background:"linear-gradient(135deg,rgba(244,63,94,0.15),rgba(168,85,247,0.15))" }}>
          <div style={{ width:22, height:22, borderRadius:7, background:"linear-gradient(135deg,#f43f5e,#a855f7)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11 }}>🔍</div>
          <div>
            <div style={{ fontSize:11, fontWeight:600, color:C.fg }}>Competitor Analysis</div>
            <div style={{ fontSize:9, color:"rgba(244,63,94,0.8)" }}>@dr.rival.fitness</div>
          </div>
          <div style={{ position:"absolute", right:-5, top:"50%", transform:"translateY(-50%)", width:10, height:10, borderRadius:"50%", background:"#f43f5e", border:"1.5px solid rgba(244,63,94,0.7)", zIndex:10 }} />
        </div>
        <div style={{ margin:"8px 10px", display:"flex", flexDirection:"column", gap:3 }}>
          {([["#1","5.2x","1.2M","rgba(244,63,94,0.1)","#f43f5e","rgba(34,211,238,0.1)","#22d3ee"],["#2","3.1x","890K","rgba(244,63,94,0.07)","#f43f5e","rgba(163,230,53,0.1)","#a3e635"],["#3","2.4x","650K","rgba(244,63,94,0.05)","#64748b","rgba(255,255,255,0.05)","#64748b"],["#4","1.8x","480K","rgba(244,63,94,0.03)","#64748b","rgba(255,255,255,0.05)","#64748b"]] as const).map(([rank,score,views,rowBg,vColor,badgeBg,badgeColor]) => (
            <div key={rank} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", borderRadius:5, padding:"3px 9px", background:rowBg }}>
              <span style={{ color:C.fgDim, fontSize:9 }}>{rank} · Reel</span>
              <span style={{ fontSize:8, fontWeight:600, borderRadius:20, padding:"1px 6px", background:badgeBg, color:badgeColor, border:`1px solid ${badgeBg}` }}>{score}</span>
              <span style={{ color:vColor, fontSize:9, fontWeight:700 }}>{views}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── AI NODE ── */}
      <div style={{ ...nodeStyle(nodes.aiVisible, nodes.aiGlow ? "#a78bfa" : undefined), left: ax, top: ay, width: 255 }}>
        <div style={{ display:"flex", alignItems:"center", gap:7, padding:"9px 12px 8px", borderBottom:"1px solid rgba(8,145,178,0.15)", background:"rgba(8,145,178,0.08)" }}>
          <div style={{ position:"absolute", left:-5, top:"50%", transform:"translateY(-50%)", width:10, height:10, borderRadius:"50%", background:C.cyan, border:"1.5px solid rgba(8,145,178,0.7)", zIndex:10 }} />
          <div style={{ width:22, height:22, borderRadius:7, background:"rgba(8,145,178,0.15)", border:"1px solid rgba(8,145,178,0.25)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11 }}>🤖</div>
          <div>
            <div style={{ fontSize:11, fontWeight:600, color:C.cyan }}>Connecta AI</div>
            <div style={{ fontSize:9, color:C.fgDim }}>Draw edges from nodes to connect context</div>
          </div>
        </div>
        {/* idle */}
        {!nodes.ctxVideoTag && (
          <div style={{ margin:"12px 13px", fontSize:10, color:C.fgDim, lineHeight:1.55 }}>Connect nodes to start generating scripts...</div>
        )}
        {/* context tags */}
        {nodes.ctxVideoTag && (
          <div style={{ margin:"8px 12px", display:"flex", flexDirection:"column", gap:3 }}>
            <div style={{ borderRadius:4, padding:"3px 8px", fontSize:9, display:"flex", alignItems:"center", gap:5, background:"rgba(8,145,178,0.08)", border:"1px solid rgba(8,145,178,0.2)" }}>
              <div style={{ width:6, height:6, borderRadius:"50%", background:C.cyanL, flexShrink:0 }}/>
              <span style={{ color:C.cyanL }}>VideoNode · @viral.fitness</span>
            </div>
            {nodes.ctxCompTag && (
              <div style={{ borderRadius:4, padding:"3px 8px", fontSize:9, display:"flex", alignItems:"center", gap:5, background:"rgba(244,63,94,0.08)", border:"1px solid rgba(244,63,94,0.2)" }}>
                <div style={{ width:6, height:6, borderRadius:"50%", background:"#f43f5e", flexShrink:0 }}/>
                <span style={{ color:"#f43f5e" }}>CompetitorNode · @dr.rival.fitness</span>
              </div>
            )}
          </div>
        )}
        {/* gen button */}
        {nodes.genBtnVisible && !nodes.scriptVisible && (
          <div style={{ margin:"6px 11px 10px", background:"linear-gradient(135deg,#0891B2,#84CC16)", borderRadius:8, padding:"7px 10px", textAlign:"center", fontSize:10, fontWeight:600, color:"#fff", boxShadow:"0 4px 16px rgba(8,145,178,0.35), inset 0 1px 0 rgba(255,255,255,0.15)", cursor:"pointer" }}>
            ✨ Generate Script
          </div>
        )}
        {/* script output */}
        {nodes.scriptVisible && (
          <div style={{ margin:"6px 10px", display:"flex", flexDirection:"column", gap:4 }}>
            {([
              ["HOOK", C.cyanL, "rgba(8,145,178,0.08)", "rgba(8,145,178,0.2)", '"The thing most creators never talk about..."', nodes.line1Typed],
              ["BODY", "#94a3b8", "rgba(148,163,184,0.06)", "rgba(148,163,184,0.15)", "I wasted 6 months before I found this...", nodes.line2Typed],
              ["CTA", C.limeL, "rgba(132,204,22,0.06)", "rgba(132,204,22,0.15)", 'Comment "YES" for the full breakdown', nodes.line3Typed],
            ] as const).map(([label, color, bg, border, text, typed]) => (
              <div key={label} style={{ borderRadius:6, padding:"5px 9px", background:bg, border:`1px solid ${border}` }}>
                <div style={{ fontSize:8, fontWeight:700, color, letterSpacing:0.4, marginBottom:2 }}>{label}</div>
                <div style={{ fontSize:9, color:C.fgDim, lineHeight:1.5, overflow:"hidden", whiteSpace:"nowrap", width: typed ? "100%" : 0, transition:"width 1s steps(26)" }}>
                  {text}
                </div>
              </div>
            ))}
            <div style={{ display:"flex", gap:5, marginTop:2 }}>
              <div style={{ flex:1, background:"linear-gradient(135deg,#0891B2,#84CC16)", borderRadius:6, padding:6, textAlign:"center", fontSize:9.5, fontWeight:600, color:"#fff", boxShadow:"0 4px 12px rgba(8,145,178,0.3)" }}>✓ Copy Script</div>
              <div style={{ flex:1, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:6, padding:6, textAlign:"center", fontSize:9.5, color:C.muted }}>↻ Regenerate</div>
            </div>
          </div>
        )}
      </div>

      {/* Cursor */}
      <div style={{ position:"absolute", left: cursor.x, top: cursor.y, pointerEvents:"none", zIndex:200,
        filter:"drop-shadow(0 2px 5px rgba(0,0,0,.7))",
        transition:"left 0.5s cubic-bezier(.4,0,.2,1), top 0.5s cubic-bezier(.4,0,.2,1)" }}>
        <svg width="18" height="22" viewBox="0 0 18 22">
          <path d="M1,1 L1,17 L5,13 L8,20 L10.5,19 L7.5,12 L13,12 Z" fill="white" stroke="#111" strokeWidth="1.2" strokeLinejoin="round"/>
        </svg>
      </div>

      {/* Click rings */}
      {rings.map(r => (
        <div key={r.id} style={{ position:"absolute", left:r.x-4, top:r.y-4, width:24, height:24, borderRadius:"50%", border:"2px solid rgba(34,211,238,0.9)", animation:"rip 0.45s ease-out forwards", pointerEvents:"none", zIndex:201 }} />
      ))}

      {/* Trails */}
      {trails.map(t => (
        <div key={t.id} style={{ position:"absolute", left:t.x-3, top:t.y-3, width:7, height:7, borderRadius:"50%", background:"rgba(34,211,238,0.4)", animation:"tr 0.5s ease forwards", pointerEvents:"none", zIndex:199 }} />
      ))}

      {/* Bottom label */}
      <div style={{ position:"absolute", bottom:16, left:"50%", transform:"translateX(-50%)",
        background:"rgba(6,9,12,0.88)", border:"1px solid rgba(8,145,178,0.2)",
        backdropFilter:"blur(12px)", borderRadius:20, padding:"5px 18px",
        fontSize:11.5, color:"rgba(226,232,240,0.75)", pointerEvents:"none",
        zIndex:100, whiteSpace:"nowrap", opacity: stepLabel ? 1 : 0, transition:"opacity 0.25s" }}>
        {stepLabel}
      </div>

      {/* Step dots */}
      <div style={{ position:"absolute", bottom:16, right:16, display:"flex", flexDirection:"column", gap:5, zIndex:100 }}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{ width:5, height: activeDot===i ? 15 : 5, borderRadius: activeDot===i ? 3 : "50%", background: activeDot===i ? C.cyanL : "rgba(255,255,255,0.14)", transition:"all 0.25s" }} />
        ))}
      </div>

      {/* CSS keyframes injected once */}
      <style>{`
        @keyframes rip { from{opacity:1;transform:scale(.4)} to{opacity:0;transform:scale(2)} }
        @keyframes tr  { from{opacity:.7;transform:scale(1)} to{opacity:0;transform:scale(.2)} }
      `}</style>
    </div>
  );
}
```

- [ ] **Step 2: Build to verify no TypeScript errors**

Run: `npm run build 2>&1 | tail -20`
Expected: clean build, no TS errors

- [ ] **Step 3: Commit**

```bash
git add src/components/CanvasDemo.tsx
git commit -m "feat(canvas-demo): add animated guided canvas demo component"
```

---

### Task 4: Replace features grid with the "See it work" section

**Files:**
- Modify: `src/pages/Home.tsx:162-203`

- [ ] **Step 1: Import CanvasDemo in Home.tsx**

Add import near the top of `Home.tsx`:

```tsx
import CanvasDemo from "@/components/CanvasDemo";
```

- [ ] **Step 2: Replace the Features section JSX**

Find the `{/* Features */}` section (lines ~162-203) and replace the entire `<section>` with:

```tsx
{/* See it work — animated canvas demo */}
<section id="demo" className="py-24 px-6">
  <div className="max-w-7xl mx-auto">
    <motion.div
      className="text-center mb-12"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      custom={0}
      variants={fadeUp}
    >
      <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4">
        See it work
      </h2>
      <p className="text-muted-foreground text-base sm:text-lg max-w-xl mx-auto">
        Drop nodes. Draw edges. Watch AI generate your script.
      </p>
    </motion.div>

    <motion.div
      className="rounded-2xl overflow-hidden"
      style={{
        border: "1px solid rgba(8,145,178,0.2)",
        boxShadow: "0 24px 60px rgba(0,0,0,0.4), 0 0 40px rgba(8,145,178,0.06)",
        height: "520px",
      }}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: 0.2, duration: 0.6 }}
    >
      <CanvasDemo />
    </motion.div>

    <motion.p
      className="text-center text-xs text-muted-foreground/50 mt-4"
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ delay: 0.5 }}
    >
      Hover to pause the demo
    </motion.p>
  </div>
</section>
```

- [ ] **Step 3: Build to verify**

Run: `npm run build 2>&1 | tail -20`
Expected: clean build

- [ ] **Step 4: Commit**

```bash
git add src/pages/Home.tsx
git commit -m "feat(home): replace feature cards with animated canvas demo section"
```

---

## Chunk 3: Deploy

### Task 5: Build and deploy to VPS

- [ ] **Step 1: Final production build**

```bash
cd /Users/admin/Desktop/connectacreators && npm run build 2>&1 | tail -10
```
Expected: `dist/` folder updated, no errors

- [ ] **Step 2: Deploy to VPS via rsync**

```bash
rsync -avz --delete dist/ root@72.62.200.145:/var/www/connectacreators/
```

- [ ] **Step 3: Verify live site**

Open https://connectacreators.com — check:
1. Navbar shows horse logo (green gradient square + "Connecta" text)
2. Hero headline reads "Replicate Viral Videos. / Generate Scripts in Seconds."
3. Two CTA buttons visible: "Start Free Trial →" and "See Demo"
4. Canvas screenshot mockup visible below CTAs
5. Scrolling down shows "See it work" section with animated demo
6. "How It Works", bottom CTA, footer all unchanged below
