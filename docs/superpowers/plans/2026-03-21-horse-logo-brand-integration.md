# Horse Logo Brand Integration — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the Connecta horse logo across 4 touchpoints: landing page hero (animated video), post-login splash screen, dashboard sidebar icon, and browser favicon.

**Architecture:** Copy video/image assets to appropriate locations (videos in `public/assets/`, PNG in `src/assets/`). Build a `CanvasHeroMockup` component for the interactive canvas representation. Build a `SplashScreen` component for post-login animation. Modify existing `LandingPageNew.tsx` hero section and `DashboardSidebar.tsx` logo area. Replace favicon.

**Tech Stack:** React 18, TypeScript, Vite, framer-motion, CSS blend modes (`mix-blend-mode: lighten`), CSS `:has()` selector, SVG animated paths.

**Spec:** `docs/superpowers/specs/2026-03-21-horse-logo-brand-integration-design.md`

---

## Chunk 1: Asset Setup & Favicon

### Task 1: Copy assets to project

**Files:**
- Create: `public/assets/horse-hero.mp4`
- Create: `public/assets/horse-splash.mp4`
- Create: `src/assets/connecta-horse-logo.png`

- [ ] **Step 1: Create public/assets directory and copy video files**

```bash
mkdir -p public/assets
cp "/Users/admin/Downloads/hf_20260321_025830_aea5faa4-7299-47a9-a81f-d6fd8712d2f0.mp4" public/assets/horse-hero.mp4
cp "/Users/admin/Downloads/hf_20260321_042607_dbe04f45-e491-40a5-bea3-1efd6b46acb6.mp4" public/assets/horse-splash.mp4
```

- [ ] **Step 2: Copy horse PNG to src/assets**

```bash
cp "/Users/admin/Documents/Connecta-Horse-Logo.png" src/assets/connecta-horse-logo.png
```

- [ ] **Step 3: Verify all files exist**

```bash
ls -la public/assets/horse-hero.mp4 public/assets/horse-splash.mp4 src/assets/connecta-horse-logo.png
```

Expected: 3 files listed (7.2MB, 3.2MB, 267KB approximately)

- [ ] **Step 4: Commit**

```bash
git add public/assets/ src/assets/connecta-horse-logo.png
git commit -m "chore: add horse logo assets (PNG + hero/splash videos)"
```

---

### Task 2: Replace favicon

**Files:**
- Modify: `public/favicon.png`

- [ ] **Step 1: Create 32x32 favicon from horse PNG**

Use sips (macOS built-in) to resize:

```bash
sips -z 32 32 "/Users/admin/Documents/Connecta-Horse-Logo.png" --out public/favicon.png
```

- [ ] **Step 2: Verify favicon was replaced**

```bash
sips -g pixelWidth -g pixelHeight public/favicon.png
```

Expected: pixelWidth: 32, pixelHeight: 32

- [ ] **Step 3: Commit**

```bash
git add public/favicon.png
git commit -m "feat: replace favicon with horse logo"
```

---

## Chunk 2: Dashboard Sidebar

### Task 3: Replace sidebar text wordmark with horse icon

**Files:**
- Modify: `src/components/DashboardSidebar.tsx:17-18` (imports)
- Modify: `src/components/DashboardSidebar.tsx:220-234` (logo render block)

- [ ] **Step 1: Update imports**

At `src/components/DashboardSidebar.tsx`, replace lines 17-18:

```typescript
// REMOVE these two lines:
import connectaLoginLogo from "@/assets/connecta-logo-text-light.png";
import connectaLoginLogoDark from "@/assets/connecta-logo-text-dark.png";

// ADD this line:
import connectaHorseLogo from "@/assets/connecta-horse-logo.png";
```

- [ ] **Step 2: Update logo rendering**

At `src/components/DashboardSidebar.tsx`, find the logo `<img>` tag inside the logo area div (around line 222-226). Replace:

```typescript
// BEFORE:
<img
  src={theme === "light" ? connectaLoginLogoDark : connectaLoginLogo}
  alt="Connecta"
  className="h-5 object-contain hover:opacity-80 transition-opacity rounded-md"
/>

// AFTER:
<img
  src={connectaHorseLogo}
  alt="Connecta"
  className="h-8 object-contain hover:opacity-80 transition-opacity"
/>
```

Note: Single image for both themes (horse logo has its own colors). Height increased from `h-5` to `h-8` (~32px).

- [ ] **Step 3: Verify build passes**

```bash
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/DashboardSidebar.tsx
git commit -m "feat(sidebar): replace text wordmark with horse logo icon"
```

---

## Chunk 3: Canvas Hero Mockup Component

### Task 4: Create CanvasHeroMockup component

**Files:**
- Create: `src/components/CanvasHeroMockup.tsx`

This is the interactive 3-column canvas representation (Research nodes → AI Assistant chat → Generated Script output) that replaces the existing ViralTodayMiniMockup + ScriptWizardHeroMockup in the hero.

- [ ] **Step 1: Create the component file**

Create `src/components/CanvasHeroMockup.tsx` with the following structure:

```tsx
import { motion } from "framer-motion";

const gold = "#22d3ee";

// Node data
const inputNodes = [
  { id: "viral", label: "Viral Video", icon: "▶", iconBg: "rgba(8,145,178,.08)", iconColor: "rgba(34,211,238,.6)",
    preview: "@fitnessmindset · 12x outlier", hasThumb: true,
    features: ["Paste any video URL", "Auto-transcribe with AI", "Detect format & structure", "Visual + audio analysis"] },
  { id: "notes", label: "Text Notes", icon: "✎", iconBg: "rgba(250,204,21,.06)", iconColor: "rgba(250,204,21,.5)",
    preview: "Ideas, research, and briefs",
    features: ["Rich text editor", "AI reads notes as context", "Link to videos & scripts"] },
  { id: "competitor", label: "Competitor Analysis", icon: "☯", iconBg: "rgba(168,85,247,.06)", iconColor: "rgba(168,85,247,.5)",
    preview: "Top posts from any profile",
    features: ["Enter any Instagram handle", "Hook type analysis", "Why-it-worked breakdown"] },
  { id: "media", label: "Media Upload", icon: "⇧", iconBg: "rgba(249,115,22,.06)", iconColor: "rgba(249,115,22,.5)",
    preview: "Images, videos, files",
    features: ["Upload from your device", "Reference visuals on canvas", "Attach assets to scripts"] },
];

const outputFeatures = [
  "Structured: Hook, Body, CTA",
  "Matched to your brand voice",
  "Save to Script Vault",
  "Share via public link",
  "Teleprompter-ready",
];

const aiMessages = [
  { role: "user" as const, text: "Use the visual structure from video 1 but adapt the script and text on screen to my brand voice" },
  { role: "ai" as const, html: `I'll keep the <span style="color:${gold};font-weight:600">same visual pacing</span> — the 3-second hook cut, the B-roll transition at 0:12, and the text overlay timing. But I'll rewrite all <span style="color:${gold};font-weight:600">dialogue and on-screen text</span> to match your bold, direct tone.` },
  { role: "script" as const, lines: [
    { tag: "HOOK (0-3s)", text: `"Stop scrolling. This changed everything."` },
    { tag: "BODY (3-45s)", text: `"Most creators spend 3 hours on a script. I do it in 10 minutes..."` },
  ]},
  { role: "user" as const, text: "Make the hook more aggressive" },
  { role: "ai" as const, html: `Updated: <span style="color:${gold};font-weight:600">"You're doing it wrong. Every single day."</span> — mirrors the 12x outlier pattern but with your confrontational style.` },
];

export default function CanvasHeroMockup() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.4 }}
      className="w-full max-w-[1120px] mx-auto px-4 md:px-12"
    >
      {/* Section label */}
      <div className="text-center mb-12">
        <span style={{ fontSize: 10, letterSpacing: "0.2em", color: "rgba(255,255,255,.1)", fontWeight: 600, textTransform: "uppercase" }}>
          How It Works — Your AI Planning Canvas
        </span>
      </div>

      {/* 3-column grid */}
      <div className="canvas-grid" style={{
        display: "grid",
        gridTemplateColumns: "240px 1fr 220px",
        gap: 0,
        alignItems: "start",
        position: "relative",
      }}>

        {/* SVG Connectors */}
        <svg style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1, overflow: "visible" }}>
          <style>{`@keyframes dash-flow{to{stroke-dashoffset:-24}}.flow-line{stroke-dasharray:8,5;animation:dash-flow 2s linear infinite;}`}</style>
          <path d="M 236 60 C 310 60, 280 130, 300 130" className="flow-line" stroke="rgba(8,145,178,.13)" strokeWidth="1.2" fill="none"/>
          <path d="M 236 148 C 290 148, 280 170, 300 170" className="flow-line" stroke="rgba(8,145,178,.13)" strokeWidth="1.2" fill="none"/>
          <path d="M 236 230 C 290 230, 280 210, 300 210" className="flow-line" stroke="rgba(8,145,178,.13)" strokeWidth="1.2" fill="none"/>
          <path d="M 236 312 C 310 312, 280 250, 300 250" className="flow-line" stroke="rgba(8,145,178,.13)" strokeWidth="1.2" fill="none"/>
          <path d="M 740 190 C 780 190, 790 190, 808 190" className="flow-line" stroke="rgba(132,204,22,.1)" strokeWidth="1.2" fill="none"/>
        </svg>

        {/* LEFT: Input Nodes */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingRight: 32 }}>
          <div style={{ fontSize: 9, letterSpacing: "0.18em", fontWeight: 700, textTransform: "uppercase", color: "rgba(34,211,238,.3)", marginBottom: 8, paddingLeft: 4 }}>Research</div>
          {inputNodes.map((node) => (
            <InputNode key={node.id} {...node} />
          ))}
        </div>

        {/* CENTER: AI Chat */}
        <div style={{ padding: "0 24px" }}>
          <div style={{ fontSize: 9, letterSpacing: "0.18em", fontWeight: 700, textTransform: "uppercase", color: "rgba(34,211,238,.3)", marginBottom: 8, paddingLeft: 4 }}>AI Assistant</div>
          <AIChat messages={aiMessages} />
        </div>

        {/* RIGHT: Output */}
        <div style={{ paddingLeft: 32 }}>
          <div style={{ fontSize: 9, letterSpacing: "0.18em", fontWeight: 700, textTransform: "uppercase", color: "rgba(132,204,22,.3)", marginBottom: 8, paddingLeft: 4 }}>Output</div>
          <OutputNode features={outputFeatures} />
        </div>
      </div>

      {/* Hover interaction CSS */}
      <style>{`
        .canvas-grid:has(.c-node:hover) .c-node:not(:hover),
        .canvas-grid:has(.c-node:hover) .ai-chat-card { opacity: .35; transition: opacity .35s; }
        .canvas-grid:has(.ai-chat-card:hover) .c-node { opacity: .35; transition: opacity .35s; }
        .canvas-grid:has(.c-node:hover) .output-node { opacity: .35; transition: opacity .35s; }
        .canvas-grid:has(.output-node:hover) .c-node,
        .canvas-grid:has(.output-node:hover) .ai-chat-card { opacity: .35; transition: opacity .35s; }

        @media (max-width: 768px) {
          .canvas-grid { grid-template-columns: 1fr !important; gap: 16px !important; }
          .canvas-grid svg { display: none; }
          .canvas-grid > div { padding: 0 !important; }
        }
      `}</style>
    </motion.div>
  );
}

/* ── Input Node ── */
function InputNode({ label, icon, iconBg, iconColor, preview, features, hasThumb }: {
  label: string; icon: string; iconBg: string; iconColor: string;
  preview: string; features: string[]; hasThumb?: boolean;
}) {
  return (
    <div className="c-node" style={{
      borderRadius: 14, border: "1px solid rgba(255,255,255,.05)",
      background: "rgba(255,255,255,.015)", overflow: "hidden", cursor: "default",
      transition: "all .4s cubic-bezier(.4,0,.2,1)", position: "relative",
      backdropFilter: "blur(6px)",
    }}>
      {/* Connection dot */}
      <div style={{ position: "absolute", right: -5, top: "50%", transform: "translateY(-50%)", width: 8, height: 8, borderRadius: "50%", background: "rgba(8,145,178,.25)", border: "1px solid rgba(8,145,178,.15)", zIndex: 5 }} />
      {/* Header */}
      <div className="c-node-head" style={{ padding: "12px 16px", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,.5)", borderBottom: "1px solid rgba(255,255,255,.025)", display: "flex", alignItems: "center", gap: 10, transition: "color .3s" }}>
        <div style={{ width: 22, height: 22, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, background: iconBg, color: iconColor, flexShrink: 0 }}>{icon}</div>
        {label}
      </div>
      {/* Preview (visible by default) */}
      <div className="c-node-preview" style={{ padding: "10px 16px", transition: "all .3s" }}>
        {hasThumb && (
          <div style={{ width: "100%", height: 42, borderRadius: 8, background: "linear-gradient(135deg,rgba(8,145,178,.05),rgba(8,145,178,.015))", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 14, opacity: .12 }}>▶</span>
          </div>
        )}
        <div style={{ fontSize: 11, color: "rgba(255,255,255,.2)", lineHeight: 1.4 }}>{preview}</div>
      </div>
      {/* Expanded (visible on hover) */}
      <div className="c-node-expanded" style={{ maxHeight: 0, overflow: "hidden", opacity: 0, padding: "0 16px", transition: "max-height .4s cubic-bezier(.4,0,.2,1), opacity .3s, padding .3s" }}>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {features.map((f, i) => (
            <li key={i} style={{ fontSize: 12, color: "rgba(255,255,255,.45)", padding: "3.5px 0", lineHeight: 1.45, display: "flex", alignItems: "flex-start", gap: 10 }}>
              <span style={{ width: 4, height: 4, borderRadius: "50%", flexShrink: 0, marginTop: 6, background: "rgba(34,211,238,.45)" }} />
              {f}
            </li>
          ))}
        </ul>
      </div>

      {/* Hover styles injected via CSS class */}
      <style>{`
        .c-node:hover { border-color: rgba(8,145,178,.2) !important; box-shadow: 0 12px 48px rgba(0,0,0,.5), 0 0 0 1px rgba(8,145,178,.08); transform: translateY(-4px) scale(1.01); z-index: 100; }
        .c-node:hover .c-node-head { color: #22d3ee !important; }
        .c-node:hover .c-node-expanded { max-height: 240px !important; opacity: 1 !important; padding: 12px 16px 14px !important; }
        .c-node:hover .c-node-preview { opacity: 0 !important; max-height: 0 !important; padding: 0 !important; overflow: hidden !important; }
      `}</style>
    </div>
  );
}

/* ── AI Chat Card ── */
function AIChat({ messages }: { messages: typeof aiMessages }) {
  return (
    <div className="ai-chat-card" style={{
      background: "rgba(6,9,12,.92)", border: "1px solid rgba(8,145,178,.12)", borderRadius: 18,
      display: "flex", flexDirection: "column", overflow: "hidden", backdropFilter: "blur(20px)",
      boxShadow: "0 12px 48px rgba(0,0,0,.35), 0 0 120px rgba(6,182,212,.02), inset 0 1px 0 rgba(255,255,255,.03)",
      transition: "all .4s cubic-bezier(.4,0,.2,1)", position: "relative",
    }}>
      {/* Connection dots */}
      <div style={{ position: "absolute", left: -5, top: "50%", transform: "translateY(-50%)", width: 8, height: 8, borderRadius: "50%", background: "rgba(8,145,178,.25)", border: "1px solid rgba(8,145,178,.15)", zIndex: 5 }} />
      <div style={{ position: "absolute", right: -5, top: "50%", transform: "translateY(-50%)", width: 8, height: 8, borderRadius: "50%", background: "rgba(132,204,22,.2)", border: "1px solid rgba(132,204,22,.12)", zIndex: 5 }} />

      {/* Header */}
      <div style={{ padding: "16px 22px", borderBottom: "1px solid rgba(255,255,255,.03)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: gold, letterSpacing: "0.02em" }}>AI Assistant</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,.2)", marginTop: 2 }}>4 nodes connected as context</div>
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "rgba(255,255,255,.05)" }} />
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "rgba(255,255,255,.05)" }} />
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", opacity: .35 }} />
        </div>
      </div>

      {/* Messages */}
      <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 10, minHeight: 200 }}>
        {messages.map((msg, i) => {
          if (msg.role === "user") return (
            <div key={i} style={{ padding: "11px 16px", borderRadius: 14, fontSize: 13, lineHeight: 1.55, maxWidth: "88%", background: "rgba(8,145,178,.06)", color: "rgba(255,255,255,.55)", alignSelf: "flex-end", borderBottomRightRadius: 4 }}>{msg.text}</div>
          );
          if (msg.role === "ai") return (
            <div key={i} style={{ padding: "11px 16px", borderRadius: 14, fontSize: 13, lineHeight: 1.55, maxWidth: "88%", background: "rgba(255,255,255,.02)", color: "rgba(255,255,255,.5)", alignSelf: "flex-start", borderBottomLeftRadius: 4, border: "1px solid rgba(255,255,255,.025)" }} dangerouslySetInnerHTML={{ __html: msg.html! }} />
          );
          if (msg.role === "script") return (
            <div key={i} style={{ background: "rgba(8,145,178,.03)", border: "1px solid rgba(8,145,178,.06)", borderRadius: 12, padding: "12px 16px", fontSize: 13, lineHeight: 1.55, alignSelf: "flex-start", maxWidth: "88%", color: "rgba(255,255,255,.42)" }}>
              {msg.lines!.map((l, j) => (
                <div key={j} style={{ marginTop: j > 0 ? 8 : 0 }}>
                  <div style={{ fontSize: 9, color: "rgba(8,145,178,.45)", fontWeight: 700, letterSpacing: "0.08em", marginBottom: 3 }}>{l.tag}</div>
                  {l.text}
                </div>
              ))}
            </div>
          );
          return null;
        })}
      </div>

      {/* Input bar */}
      <div style={{ padding: "14px 22px", borderTop: "1px solid rgba(255,255,255,.03)", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, background: "rgba(255,255,255,.02)", border: "1px solid rgba(8,145,178,.06)", borderRadius: 12, padding: "12px 16px", fontSize: 13, color: "rgba(255,255,255,.18)", display: "flex", alignItems: "center" }}>
          Ask the AI assistant...<span style={{ display: "inline-block", width: 1, height: 15, background: gold, marginLeft: 3 }} className="ai-blink" />
        </div>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(8,145,178,.08)", border: "1px solid rgba(8,145,178,.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, color: gold, cursor: "pointer" }}>↑</div>
      </div>

      <style>{`
        .ai-chat-card:hover { border-color: rgba(8,145,178,.25) !important; box-shadow: 0 16px 60px rgba(0,0,0,.5), 0 0 120px rgba(6,182,212,.04), inset 0 1px 0 rgba(255,255,255,.04) !important; opacity: 1 !important; }
        @keyframes ai-blink { 0%,50%{opacity:1} 51%,100%{opacity:0} }
        .ai-blink { animation: ai-blink 1s infinite; }
      `}</style>
    </div>
  );
}

/* ── Output Node ── */
function OutputNode({ features }: { features: string[] }) {
  return (
    <div className="output-node" style={{
      borderRadius: 14, border: "1px solid rgba(132,204,22,.08)",
      background: "rgba(132,204,22,.015)", overflow: "hidden", cursor: "default",
      transition: "all .4s cubic-bezier(.4,0,.2,1)", position: "relative",
      backdropFilter: "blur(6px)",
    }}>
      {/* Connection dot */}
      <div style={{ position: "absolute", left: -5, top: "50%", transform: "translateY(-50%)", width: 8, height: 8, borderRadius: "50%", background: "rgba(132,204,22,.2)", border: "1px solid rgba(132,204,22,.12)", zIndex: 5 }} />
      {/* Header */}
      <div style={{ padding: "12px 16px", fontSize: 12, fontWeight: 600, color: "rgba(132,204,22,.5)", borderBottom: "1px solid rgba(132,204,22,.04)", display: "flex", alignItems: "center", gap: 10, transition: "color .3s" }}>
        <div style={{ width: 22, height: 22, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, background: "rgba(132,204,22,.06)", color: "rgba(132,204,22,.5)", flexShrink: 0 }}>✓</div>
        Generated Script
      </div>
      {/* Preview */}
      <div className="output-preview" style={{ padding: "10px 16px", transition: "all .3s" }}>
        {[{ tag: "HOOK", text: `"You're doing it wrong..."` }, { tag: "BODY", text: `"Most creators spend..."` }, { tag: "CTA", text: `"Follow for the full..."` }].map((s, i) => (
          <div key={i} style={{ marginBottom: i < 2 ? 7 : 0 }}>
            <span style={{ fontSize: 8, fontWeight: 700, color: "rgba(132,204,22,.3)", letterSpacing: "0.08em" }}>{s.tag}</span>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.2)", lineHeight: 1.4 }}>{s.text}</div>
          </div>
        ))}
      </div>
      {/* Expanded */}
      <div className="output-expanded" style={{ maxHeight: 0, overflow: "hidden", opacity: 0, padding: "0 16px", transition: "max-height .4s cubic-bezier(.4,0,.2,1), opacity .3s, padding .3s" }}>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {features.map((f, i) => (
            <li key={i} style={{ fontSize: 12, color: "rgba(255,255,255,.45)", padding: "3.5px 0", lineHeight: 1.45, display: "flex", alignItems: "flex-start", gap: 10 }}>
              <span style={{ width: 4, height: 4, borderRadius: "50%", flexShrink: 0, marginTop: 6, background: "rgba(132,204,22,.45)" }} />
              {f}
            </li>
          ))}
        </ul>
      </div>

      <style>{`
        .output-node:hover { border-color: rgba(132,204,22,.18) !important; box-shadow: 0 12px 48px rgba(0,0,0,.5), 0 0 0 1px rgba(132,204,22,.06); transform: translateY(-4px) scale(1.01); z-index: 100; }
        .output-node:hover div[style*="color: rgba(132,204,22,.5)"] { color: #84CC16 !important; }
        .output-node:hover .output-expanded { max-height: 240px !important; opacity: 1 !important; padding: 12px 16px 14px !important; }
        .output-node:hover .output-preview { opacity: 0 !important; max-height: 0 !important; padding: 0 !important; overflow: hidden !important; }
      `}</style>
    </div>
  );
}
```

- [ ] **Step 2: Verify build passes**

```bash
npm run build
```

Expected: Build succeeds. No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/CanvasHeroMockup.tsx
git commit -m "feat: add CanvasHeroMockup interactive component for landing hero"
```

---

## Chunk 4: Landing Page Hero Redesign

### Task 5: Update LandingPageNew.tsx hero section

**Files:**
- Modify: `src/pages/LandingPageNew.tsx:1-16` (imports)
- Modify: `src/pages/LandingPageNew.tsx:775-865` (hero section)

- [ ] **Step 1: Add imports**

At the top of `src/pages/LandingPageNew.tsx`, add after the existing imports (around line 16):

```typescript
import connectaHorseLogo from "@/assets/connecta-horse-logo.png";
import CanvasHeroMockup from "@/components/CanvasHeroMockup";
```

- [ ] **Step 2: Add ambient glow CSS**

Add a `<style>` block inside the component return (at the very top, before the first div), or within the existing JSX structure:

```tsx
<style>{`
  .glow-orb { position: fixed; border-radius: 50%; pointer-events: none; will-change: transform, opacity; }
  .glow-orb-1 { top: -30%; left: 30%; width: 1200px; height: 1000px; background: radial-gradient(circle, rgba(6,182,212,.6), transparent 60%); opacity: .06; filter: blur(200px); animation: g1 16s ease-in-out infinite; }
  .glow-orb-2 { bottom: -20%; right: -10%; width: 1000px; height: 800px; background: radial-gradient(circle, rgba(132,204,22,.5), transparent 60%); opacity: .03; filter: blur(180px); animation: g2 20s ease-in-out infinite; }
  .glow-orb-3 { top: 30%; right: 20%; width: 600px; height: 600px; background: radial-gradient(circle, rgba(8,145,178,.4), transparent 60%); opacity: .04; filter: blur(160px); animation: g3 22s ease-in-out infinite; }
  @keyframes g1 { 0%,100%{opacity:.06;transform:scale(1) translate(0,0)} 50%{opacity:.09;transform:scale(1.05) translate(30px,-20px)} }
  @keyframes g2 { 0%,100%{opacity:.03;transform:translate(0,0)} 50%{opacity:.05;transform:translate(-25px,15px)} }
  @keyframes g3 { 0%,100%{opacity:.04;transform:scale(1)} 50%{opacity:.06;transform:scale(1.1) translate(-15px,10px)} }
  @keyframes horse-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
  @keyframes horse-glow-pulse { 0%,100%{opacity:.6;transform:scale(1)} 50%{opacity:1;transform:scale(1.08)} }
`}</style>
```

- [ ] **Step 3: Add ambient glow divs**

Add right after the opening wrapper div of the page (before the nav):

```tsx
<div className="glow-orb glow-orb-1" />
<div className="glow-orb glow-orb-2" />
<div className="glow-orb glow-orb-3" />
```

- [ ] **Step 4: Replace hero section**

Find the hero section (around lines 775-865). Replace the entire `grid md:grid-cols-2` hero block with:

```tsx
{/* HERO */}
<section className="relative flex flex-col items-center" style={{ padding: "140px 48px 60px" }}>
  {/* Horse logo — prominently above pill */}
  <div className="relative z-10 flex items-center justify-center mb-5">
    {/* Glow behind horse */}
    <div style={{
      position: "absolute", width: 300, height: 300, borderRadius: "50%",
      background: "radial-gradient(circle, rgba(6,182,212,.15), rgba(132,204,22,.05) 50%, transparent 70%)",
      filter: "blur(40px)", animation: "horse-glow-pulse 6s ease-in-out infinite",
    }} />
    <video
      autoPlay loop muted playsInline
      style={{
        height: 180, objectFit: "contain", position: "relative", zIndex: 1,
        mixBlendMode: "lighten",
        filter: "brightness(1.3) contrast(1.4)",
        maskImage: "radial-gradient(ellipse 75% 75% at 50% 50%, black 40%, transparent 68%)",
        WebkitMaskImage: "radial-gradient(ellipse 75% 75% at 50% 50%, black 40%, transparent 68%)",
        animation: "horse-float 8s ease-in-out infinite",
      }}
    >
      <source src="/assets/horse-hero.mp4" type="video/mp4" />
    </video>
  </div>

  {/* Headline */}
  <motion.div
    className="text-center relative z-10"
    style={{ maxWidth: 720 }}
    initial={{ opacity: 0, y: 30 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.7, delay: 0.15 }}
  >
    <motion.div
      className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full mb-6"
      style={{ border: "1px solid rgba(8,145,178,.15)", background: "rgba(8,145,178,.03)", fontSize: 10, color: "rgba(34,211,238,.55)", fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase" }}
    >
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: gold, opacity: .5 }} />
      AI-Powered Creator Platform
    </motion.div>

    <h1 style={{ fontSize: 56, fontWeight: 300, lineHeight: 1.08, marginBottom: 20, letterSpacing: -2, color: "rgba(255,255,255,.92)" }}>
      Create viral short-form<br />
      <b style={{ fontWeight: 700, background: goldGradient, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>videos in seconds</b>
    </h1>

    <p style={{ fontSize: 17, color: "rgba(255,255,255,.35)", lineHeight: 1.7, marginBottom: 36, maxWidth: 520, marginLeft: "auto", marginRight: "auto" }}>
      Research viral outliers, remix them into scripts, and publish — all from one AI-powered canvas.
    </p>

    <Link
      to="/dashboard"
      className="inline-flex items-center gap-2.5 hover:scale-[1.02] transition-transform"
      style={{ padding: "14px 34px", borderRadius: 12, fontSize: 14, fontWeight: 600, color: "#fff", background: "linear-gradient(135deg, rgba(6,182,212,.12), rgba(132,204,22,.06))", border: "1px solid rgba(8,145,178,.25)", textDecoration: "none", letterSpacing: "0.02em" }}
    >
      <Play size={14} />
      Try It Free
    </Link>
  </motion.div>
</section>

{/* CANVAS MOCKUP */}
<section className="relative pb-24">
  {/* Subtle watermark behind canvas */}
  <img
    src={connectaHorseLogo}
    alt=""
    style={{
      position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
      height: 500, objectFit: "contain", opacity: .04, pointerEvents: "none",
      mixBlendMode: "screen",
      maskImage: "radial-gradient(ellipse 60% 60% at 50% 50%, black 15%, transparent 55%)",
      WebkitMaskImage: "radial-gradient(ellipse 60% 60% at 50% 50%, black 15%, transparent 55%)",
    }}
  />
  <CanvasHeroMockup />
</section>
```

- [ ] **Step 5: Remove old mockup components**

Find and remove the `ViralTodayMiniMockup` and `ScriptWizardHeroMockup` component definitions from `LandingPageNew.tsx`. They are defined as functions within the file (search for `function ViralTodayMiniMockup` and `function ScriptWizardHeroMockup`). Delete the entire function bodies. Also remove any unused imports they relied on.

- [ ] **Step 6: Verify build passes**

```bash
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 7: Commit**

```bash
git add src/pages/LandingPageNew.tsx
git commit -m "feat(hero): horse logo above headline + interactive canvas mockup"
```

---

## Chunk 5: Splash Screen

### Task 6: Create SplashScreen component

**Files:**
- Create: `src/components/SplashScreen.tsx`

- [ ] **Step 1: Create the splash component**

Create `src/components/SplashScreen.tsx`:

```tsx
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface SplashScreenProps {
  onComplete: () => void;
}

export default function SplashScreen({ onComplete }: SplashScreenProps) {
  const [visible, setVisible] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    // Start video at 1 second
    if (videoRef.current) {
      videoRef.current.currentTime = 1;
      videoRef.current.play().catch(() => {});
    }

    // Auto-dismiss after 1.2s
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onCompleteRef.current(), 450); // wait for fade-out
    }, 1200);

    return () => clearTimeout(timer);
  }, []); // stable — no dependency on onComplete

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45 }}
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "#06090c",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
          }}
        >
          {/* Ring pulse */}
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: [0, 0.35, 0], scale: [0.5, 2.8] }}
            transition={{ duration: 1.2, ease: "easeOut" }}
            style={{
              position: "absolute", width: 200, height: 200, borderRadius: "50%",
              border: "1px solid rgba(34,211,238,.25)",
            }}
          />

          {/* Video */}
          <motion.video
            ref={videoRef}
            muted
            playsInline
            initial={{ opacity: 0, scale: 1.3, filter: "blur(20px) brightness(1.3) contrast(1.4)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px) brightness(1.3) contrast(1.4)" }}
            transition={{ duration: 0.8, type: "spring", bounce: 0.4 }}
            style={{
              height: 220, objectFit: "contain",
              mixBlendMode: "lighten",
              maskImage: "radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 75%)",
              WebkitMaskImage: "radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 75%)",
            }}
          >
            <source src="/assets/horse-splash.mp4" type="video/mp4" />
          </motion.video>

          {/* Loading bar */}
          <div style={{ width: 140, height: 2, borderRadius: 4, background: "rgba(255,255,255,.04)", marginTop: 32, overflow: "hidden" }}>
            <motion.div
              initial={{ width: "0%" }}
              animate={{ width: "100%" }}
              transition={{ duration: 1.2, ease: "easeOut" }}
              style={{ height: "100%", borderRadius: 4, background: "linear-gradient(90deg, #06B6D4, #84CC16)" }}
            />
          </div>

          {/* Text */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            style={{ fontSize: 10, color: "rgba(255,255,255,.15)", letterSpacing: "0.2em", marginTop: 16, fontWeight: 500 }}
          >
            CONNECTA
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Verify build passes**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/SplashScreen.tsx
git commit -m "feat: add post-login SplashScreen component"
```

---

### Task 7: Wire splash into Dashboard

**Files:**
- Modify: `src/pages/Dashboard.tsx` (add splash before welcome modal)

- [ ] **Step 1: Add import**

At the top of `src/pages/Dashboard.tsx`, add:

```typescript
import SplashScreen from "@/components/SplashScreen";
```

- [ ] **Step 2: Add splash state**

Inside the Dashboard component, near the existing state declarations (around lines 28-34), add:

```typescript
const [showSplash, setShowSplash] = useState(() => {
  // Show splash once per session
  if (sessionStorage.getItem("splash_shown")) return false;
  sessionStorage.setItem("splash_shown", "1");
  return true;
});
```

- [ ] **Step 3: Add SplashScreen to JSX**

In the return JSX, add right before the closing `</>` or at the top of the return block:

```tsx
{showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}
```

Make sure this renders BEFORE the `WelcomeSubscriptionModal` so splash plays first, then modal shows after.

- [ ] **Step 4: Verify build passes**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Dashboard.tsx
git commit -m "feat(dashboard): wire splash screen on first session load"
```

---

## Chunk 6: Final Verification

### Task 8: Full build and manual verification

- [ ] **Step 1: Run full build**

```bash
npm run build
```

Expected: Build succeeds with zero errors.

- [ ] **Step 2: Manual verification checklist**

Start dev server (`npm run dev`) and verify:

1. **Landing page (`/`)**: Horse video floats above "AI-Powered Creator Platform" pill. Black background invisible. Canvas mockup shows 3-column layout with hover interactions.
2. **Splash screen**: Click CTA → splash shows animated horse (from 1s mark), loading bar, "CONNECTA" text, then fades to dashboard.
3. **Dashboard sidebar**: Horse icon only, no text wordmark.
4. **Favicon**: Browser tab shows horse icon.
5. **Mobile**: Canvas mockup stacks vertically, SVG connectors hidden.

- [ ] **Step 3: Final commit if any adjustments needed**

```bash
git add -A
git commit -m "fix: final adjustments from manual verification"
```
