# /ai Live Broadcast Chat — Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the frontend for the live broadcast chat — every Robby turn renders editorial scenes + inline embeds in the chat canvas, with the fingerprint reserved for pure-reasoning. Phase A ships the 4 marquee scenes (scanning, drafting, stats, video analysis), all 6 embed types, a preview route for visual iteration, and one real end-to-end flow.

**Architecture:** New `src/components/companion/scenes/` and `src/components/companion/embeds/` directories house presentational components. A `TurnRenderer` composes 0–N scenes + italic narrative + 0–N embeds per assistant turn. `AssistantMessage` gains optional `scenes` and `embeds` fields; when absent, the existing text rendering is unchanged. A `/ai/preview` route renders mock turns for editorial review without needing real agent calls. One real flow (drafting hook via AssistantChat) wires end-to-end as proof.

**Tech Stack:** React 18 · TypeScript · Tailwind (arbitrary values for editorial colors) · CSS animations + clip-path · EB Garamond + Caveat + JetBrains Mono (Google Fonts) · `useReducedMotion` for accessibility.

**Out of scope (Phase B, separate plan):** 8 remaining scenes (Polaroid, Versus, Calendar, Chest, Highlighter, Stamp, Magnifier, Catalog), agent-side scene event emission, full tool→scene adapter for every backend function.

---

### Task 0: Branch + Caveat font + CSS tokens

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Create a feature branch**

```bash
git checkout -b feat/ai-live-broadcast
```

- [ ] **Step 2: Add the Caveat font import + editorial broadcast tokens to index.css**

Append at the end of `src/index.css`:

```css
@import url('https://fonts.googleapis.com/css2?family=Caveat:wght@500;600;700&display=swap');

/* ─── Editorial broadcast tokens (used by /ai live scenes) ─── */
.broadcast-card {
  background: linear-gradient(180deg, #fdf3d6 0%, #f0e3b8 100%);
  color: #1a1410;
  border: 2px solid #1a1410;
  border-radius: 12px;
  box-shadow: 5px 6px 0 rgba(0, 0, 0, 0.50);
}
.broadcast-card-sm {
  background: #fff8e8;
  color: #1a1410;
  border: 1.5px solid #1a1410;
  border-radius: 8px;
  box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.45);
}
.scribble-wavy {
  text-decoration: underline wavy rgba(176, 72, 72, 0.55);
  text-decoration-thickness: 1.5px;
  color: #b04848;
  font-style: italic;
}
.font-caveat { font-family: 'Caveat', cursive; }
.font-jetbrains { font-family: 'JetBrains Mono', ui-monospace, monospace; }

@keyframes broadcast-fade-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes broadcast-pulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.3; }
}
@keyframes broadcast-type-in {
  from { clip-path: inset(0 100% 0 0); }
  to   { clip-path: inset(0 0 0 0); }
}
```

- [ ] **Step 3: Verify dev server picks up the changes**

Run: `npm run dev`
Open: `http://localhost:8080/`
Expected: page loads, no console errors. Then `Cmd+Opt+I` and type in the console:
```js
getComputedStyle(document.body).fontFamily
```
Expected: existing fonts; Caveat is loaded but not applied yet.

- [ ] **Step 4: Commit**

```bash
git add src/index.css
git commit -m "feat(ai): add Caveat font + editorial broadcast CSS tokens"
```

---

### Task 1: Turn-script types

**Files:**
- Create: `src/lib/companion/turn-script.ts`

- [ ] **Step 1: Create the types file**

```typescript
// src/lib/companion/turn-script.ts
// Type definitions for the /ai live broadcast turn model.
// An assistant turn is composed of:
//   1. Zero or more activity scenes — large editorial animations of work in progress.
//   2. An italic narrative line (EB Garamond) — one sentence framing the operation.
//   3. Zero or more inline embeds — rich content Robby references.

export type SceneType =
  | "scanning"
  | "drafting"
  | "stats"
  | "video-analysis"
  | "thinking";

// ── Scene payloads — discriminated union ────────────────────────────────────
export interface ScanningPayload {
  /** Each row: a channel being scanned, with its current status. */
  channels: Array<{
    id: string;
    username: string;
    avatar_seed?: number;       // 0-7, picks gradient color
    status: "queued" | "checking" | "done" | "hit";
    note?: string;              // "3 new · 12.4x outlier" | "no updates" | etc
  }>;
  /** Summary line shown at the bottom once scanning completes. */
  summary?: string;
}

export interface DraftingPayload {
  sections: Array<{ tag: string; body: string }>;  // { tag: "Hook", body: "..." }
  est_outlier?: number;
  read_time_sec?: number;
  matches_note?: string;
}

export interface StatsPayload {
  label: string;                 // "Views · last 7 days"
  big_value: string;             // "28.4K"
  delta?: string;                // "+44% wow"
  bars: Array<{ label: string; value: number; highlight?: boolean }>;
  scribble?: string;             // bottom italic quote
  peak_label?: string;           // "12.4x ✦" — Caveat-font label over peak bar
}

export interface VideoAnalysisPayload {
  video_url: string | null;
  caption?: string;
  markers: Array<{ section: "hook" | "body" | "cta"; start: number; end: number; label: string }>;
  /** Transcript words to stream in. Each word carries its section tint. */
  transcript: Array<{ word: string; section: "hook" | "body" | "cta" }>;
}

export interface ThinkingPayload {
  hint: string;                  // "Thinking — comparing patterns across your last 12 wins"
}

export type SceneEvent =
  | { type: "scanning"; verb: string; meta: string; payload: ScanningPayload }
  | { type: "drafting"; verb: string; meta: string; payload: DraftingPayload }
  | { type: "stats"; verb: string; meta: string; payload: StatsPayload }
  | { type: "video-analysis"; verb: string; meta: string; payload: VideoAnalysisPayload }
  | { type: "thinking"; verb: string; meta: string; payload: ThinkingPayload };

// ── Embed payloads ──────────────────────────────────────────────────────────
export type EmbedType =
  | "video-card"
  | "video-player"
  | "metric-strip"
  | "framework-deck"
  | "channel-grid"
  | "script-card";

export interface VideoCardEmbedData {
  id: string;
  thumbnail_url: string | null;
  caption_overlay?: string;       // small text overlaid on the thumb
  username: string;
  outlier: number;                // 8.2 → "8.2x" badge
  views: number;
  engagement: number;             // 4.6 → "4.6%"
  age: string;                    // "2d ago"
  format_hint?: string;           // "Comparison · split-screen"
}

export interface VideoPlayerEmbedData extends VideoCardEmbedData {
  video_file_url: string | null;
}

export interface MetricStripEmbedData extends StatsPayload {}

export interface FrameworkDeckEmbedData {
  cards: Array<{
    tag: string;                  // "Framework · Comparison"
    headline: string;             // hook line, may contain <scribble>...</scribble>
  }>;
}

export interface ChannelGridEmbedData {
  channels: Array<{ id: string; username: string; status: "active" | "paused" | "hot" }>;
}

export interface ScriptCardEmbedData extends DraftingPayload {}

export type EmbedRef =
  | { type: "video-card"; data: VideoCardEmbedData }
  | { type: "video-player"; data: VideoPlayerEmbedData }
  | { type: "metric-strip"; data: MetricStripEmbedData }
  | { type: "framework-deck"; data: FrameworkDeckEmbedData }
  | { type: "channel-grid"; data: ChannelGridEmbedData }
  | { type: "script-card"; data: ScriptCardEmbedData };

// ── Full turn ───────────────────────────────────────────────────────────────
export interface BroadcastTurn {
  scenes: SceneEvent[];
  narrative: string;              // italic EB Garamond text
  embeds: EmbedRef[];
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: exit code 0 (no errors)

- [ ] **Step 3: Commit**

```bash
git add src/lib/companion/turn-script.ts
git commit -m "feat(ai): add BroadcastTurn type model for scenes + embeds"
```

---

### Task 2: SceneFrame shared wrapper

**Files:**
- Create: `src/components/companion/scenes/SceneFrame.tsx`

- [ ] **Step 1: Create the SceneFrame component**

```tsx
// src/components/companion/scenes/SceneFrame.tsx
import { ReactNode } from "react";

interface Props {
  verb: string;            // italic EB Garamond verb, e.g. "Scanning your chiropractor niche…"
  meta: string;            // JetBrains Mono technical sub-meta
  children: ReactNode;     // the scene-specific content
  /** Hide the pulsing aqua "operation in progress" dot. Used by ThinkingScene. */
  hideDot?: boolean;
}

/**
 * Shared frame around every activity scene. Provides:
 *   • A pulsing aqua dot indicating an operation is in progress.
 *   • The italic verb line (EB Garamond, ~16px).
 *   • The JetBrains-Mono meta line (technical context, sub-text).
 *   • A slot for the scene-specific content below.
 *
 * The frame itself is dark (matches /ai page bg), so individual scenes
 * supply their own bone/ink surfaces as needed.
 */
export default function SceneFrame({ verb, meta, children, hideDot }: Props) {
  return (
    <div
      className="rounded-3xl p-5 my-3"
      style={{
        background: "#0d1015",
        border: "1px solid rgba(234,230,220,0.10)",
      }}
    >
      <div className="flex items-center gap-2.5 mb-1">
        {!hideDot && (
          <span
            className="w-2 h-2 rounded-full"
            style={{
              background: "#8FD0D5",
              boxShadow: "0 0 10px #8FD0D5",
              animation: "broadcast-pulse 1.4s ease-in-out infinite",
            }}
          />
        )}
        <span
          style={{
            fontFamily: "'EB Garamond', Georgia, serif",
            fontStyle: "italic",
            fontSize: 16,
            color: "rgba(234,230,220,0.85)",
            lineHeight: 1.4,
          }}
        >
          {verb}
        </span>
      </div>
      <div
        className="font-jetbrains mb-3"
        style={{
          fontSize: 10,
          color: "rgba(234,230,220,0.45)",
          letterSpacing: "0.04em",
        }}
      >
        {meta}
      </div>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/companion/scenes/SceneFrame.tsx
git commit -m "feat(ai): SceneFrame wrapper for activity scenes"
```

---

### Task 3: ScanningScene

**Files:**
- Create: `src/components/companion/scenes/ScanningScene.tsx`

- [ ] **Step 1: Create the scene**

```tsx
// src/components/companion/scenes/ScanningScene.tsx
import SceneFrame from "./SceneFrame";
import type { SceneEvent } from "@/lib/companion/turn-script";

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg, #8FD0D5, #E0A560)",
  "linear-gradient(135deg, #c47272, #b88840)",
  "linear-gradient(135deg, #7fa0c4, #4a6890)",
  "linear-gradient(135deg, #c4a572, #6a4818)",
  "linear-gradient(135deg, #8FD0D5, #2a6f77)",
  "linear-gradient(135deg, #ff9090, #c44545)",
  "linear-gradient(135deg, #b8d090, #6a8a40)",
  "linear-gradient(135deg, #d8a0d0, #8048a0)",
];

interface Props { scene: Extract<SceneEvent, { type: "scanning" }>; }

export default function ScanningScene({ scene }: Props) {
  const { verb, meta, payload } = scene;
  return (
    <SceneFrame verb={verb} meta={meta}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {payload.channels.map((c, i) => {
          const isHit = c.status === "hit";
          const isDone = c.status === "done";
          const isChecking = c.status === "checking";
          const borderColor = isHit ? "rgba(224,165,96,0.5)"
            : isChecking ? "rgba(143,208,213,0.4)"
            : isDone ? "rgba(127,180,138,0.30)"
            : "rgba(234,230,220,0.10)";
          const bg = isHit ? "rgba(224,165,96,0.08)"
            : isChecking ? "rgba(143,208,213,0.05)"
            : isDone ? "rgba(127,180,138,0.04)"
            : "rgba(255,255,255,0.03)";
          const noteColor = isHit ? "#E0A560"
            : isDone ? "#7fb48a"
            : "rgba(234,230,220,0.45)";
          const iconColor = isHit ? "#E0A560"
            : isDone ? "#7fb48a"
            : isChecking ? "#8FD0D5"
            : "rgba(234,230,220,0.45)";
          return (
            <div
              key={c.id}
              className="flex items-center gap-2.5 p-2.5 rounded-lg text-xs"
              style={{
                background: bg,
                border: `1px solid ${borderColor}`,
                opacity: c.status === "queued" ? 0.4 : 1,
                boxShadow: isHit ? "3px 3px 0 rgba(0,0,0,0.4)" : undefined,
                animation: `broadcast-fade-in 0.4s ease-out ${i * 0.18}s backwards`,
              }}
            >
              <span
                className="w-7 h-7 rounded-full flex-shrink-0"
                style={{
                  background: AVATAR_GRADIENTS[(c.avatar_seed ?? 0) % AVATAR_GRADIENTS.length],
                  border: "1.5px solid rgba(0,0,0,0.5)",
                }}
              />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[11.5px]" style={{ color: "#EAE6DC" }}>
                  @{c.username}
                </div>
                <div className="font-jetbrains text-[9px] mt-px" style={{ color: noteColor }}>
                  {c.note ?? c.status}
                </div>
              </div>
              <span
                className="text-[11px] font-bold"
                style={{
                  color: iconColor,
                  animation: isChecking ? "spin 1s linear infinite" : undefined,
                }}
              >
                {isHit ? "★" : isDone ? "✓" : isChecking ? "⟳" : "·"}
              </span>
              {isHit && (
                <span
                  className="w-1.5 h-1.5 rounded-full ml-1"
                  style={{
                    background: "#E0A560",
                    boxShadow: "0 0 6px #E0A560",
                    animation: "broadcast-pulse 1.5s ease-in-out infinite",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
      {payload.summary && (
        <div
          className="mt-3.5 px-3.5 py-2.5 rounded-lg text-sm"
          style={{
            background: "rgba(224,165,96,0.10)",
            border: "1px solid rgba(224,165,96,0.30)",
            color: "#ffd07a",
            fontFamily: "'EB Garamond', Georgia, serif",
            fontStyle: "italic",
            animation: `broadcast-fade-in 0.5s ease-out ${payload.channels.length * 0.18 + 0.2}s backwards`,
          }}
        >
          {payload.summary}
        </div>
      )}
    </SceneFrame>
  );
}
```

- [ ] **Step 2: Add the `spin` keyframe to index.css (if not already present)**

Check `src/index.css` for `@keyframes spin`. If absent, append:

```css
@keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
```

- [ ] **Step 3: Commit**

```bash
git add src/components/companion/scenes/ScanningScene.tsx src/index.css
git commit -m "feat(ai): ScanningScene — live channel grid checking off"
```

---

### Task 4: DraftingScene

**Files:**
- Create: `src/components/companion/scenes/DraftingScene.tsx`

- [ ] **Step 1: Create the scene**

```tsx
// src/components/companion/scenes/DraftingScene.tsx
import SceneFrame from "./SceneFrame";
import type { SceneEvent } from "@/lib/companion/turn-script";

interface Props { scene: Extract<SceneEvent, { type: "drafting" }>; }

// Word count → animation duration (rough type-on pacing).
function typeMs(text: string): number {
  return Math.max(600, Math.min(2400, text.length * 22));
}

export default function DraftingScene({ scene }: Props) {
  const { verb, meta, payload } = scene;

  // Stagger each section's appearance + type-on by 1.8s.
  const offsets = payload.sections.map((_, i) => i * 1.8);

  return (
    <SceneFrame verb={verb} meta={meta}>
      <div className="broadcast-card relative p-5 sm:p-6">
        <div
          className="absolute -top-3 right-5 px-3 py-1 text-[10px] font-bold uppercase tracking-widest"
          style={{
            background: "#E0A560",
            color: "#1a1410",
            border: "2px solid #1a1410",
            borderRadius: 4,
            boxShadow: "3px 3px 0 #1a1410",
            transform: "rotate(2deg)",
            fontFamily: "Inter, sans-serif",
          }}
        >
          draft v1
        </div>
        {payload.sections.map((s, i) => (
          <div
            key={i}
            className={i < payload.sections.length - 1 ? "mb-4" : ""}
            style={{
              opacity: 0,
              animation: `broadcast-fade-in 0.5s ease-out ${offsets[i]}s forwards`,
            }}
          >
            <div
              className="font-bold text-[10px] uppercase tracking-widest mb-1.5"
              style={{ color: "#b04848", fontFamily: "Inter, sans-serif" }}
            >
              {s.tag}
            </div>
            <div
              className="text-[17px] leading-snug"
              style={{
                color: "#1a1410",
                fontFamily: "'EB Garamond', Georgia, serif",
                animation: `broadcast-type-in ${typeMs(s.body)}ms ease-out ${offsets[i] + 0.2}s backwards`,
              }}
              // Allow <scribble>...</scribble> markup in body to render the
              // wavy-red callout used on the punchline. Safe — body comes from
              // our own scene payload, never user input directly.
              dangerouslySetInnerHTML={{
                __html: s.body.replace(
                  /<scribble>(.*?)<\/scribble>/g,
                  '<span class="scribble-wavy">$1</span>',
                ),
              }}
            />
          </div>
        ))}
        {(payload.est_outlier || payload.read_time_sec || payload.matches_note) && (
          <div
            className="mt-4 pt-3.5 flex flex-wrap gap-3 items-center text-[11.5px]"
            style={{
              borderTop: "1.5px dashed rgba(0,0,0,0.18)",
              color: "rgba(26,20,16,0.65)",
              fontFamily: "Inter, sans-serif",
              opacity: 0,
              animation: `broadcast-fade-in 0.5s ease-out ${offsets[offsets.length - 1] + 2}s forwards`,
            }}
          >
            {payload.est_outlier && (
              <span style={{ color: "#1a1410", fontWeight: 700 }}>
                est. {payload.est_outlier.toFixed(1)}x outlier
              </span>
            )}
            {payload.read_time_sec && <><span>·</span><span>{payload.read_time_sec}s read</span></>}
            {payload.matches_note && <><span>·</span><span>{payload.matches_note}</span></>}
          </div>
        )}
      </div>
    </SceneFrame>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/companion/scenes/DraftingScene.tsx
git commit -m "feat(ai): DraftingScene — live script card with type-on sections"
```

---

### Task 5: StatsScene

**Files:**
- Create: `src/components/companion/scenes/StatsScene.tsx`

- [ ] **Step 1: Create the scene**

```tsx
// src/components/companion/scenes/StatsScene.tsx
import SceneFrame from "./SceneFrame";
import type { SceneEvent } from "@/lib/companion/turn-script";

interface Props { scene: Extract<SceneEvent, { type: "stats" }>; }

export default function StatsScene({ scene }: Props) {
  const { verb, meta, payload } = scene;
  const maxValue = Math.max(...payload.bars.map((b) => b.value), 1);
  const totalWidth = 280;
  const barWidth = totalWidth / payload.bars.length - 10;

  return (
    <SceneFrame verb={verb} meta={meta}>
      <div className="broadcast-card p-5 sm:p-6">
        <div className="flex justify-between items-baseline mb-4">
          <div
            className="font-bold text-[10px] uppercase tracking-widest"
            style={{ color: "#b04848", fontFamily: "Inter, sans-serif" }}
          >
            {payload.label}
          </div>
          {payload.scribble && (
            <div className="font-caveat text-[15px]" style={{ color: "#b04848" }}>
              {payload.scribble}
            </div>
          )}
        </div>
        <div className="flex items-baseline gap-3.5">
          <span
            className="text-[56px] font-medium leading-none"
            style={{ color: "#1a1410", fontFamily: "'EB Garamond', Georgia, serif" }}
          >
            {payload.big_value}
          </span>
          {payload.delta && (
            <span
              className="text-[16px] font-bold px-2.5 py-1 border-[1.5px] rounded-md inline-block font-jetbrains"
              style={{
                color: "#2a6f77",
                borderColor: "#2a6f77",
                background: "rgba(42,111,119,0.10)",
                transform: "rotate(-2deg)",
                opacity: 0,
                animation: "broadcast-fade-in 0.5s ease-out 2.4s forwards",
              }}
            >
              {payload.delta}
            </span>
          )}
        </div>
        <div className="mt-4 h-[110px] relative" style={{ borderBottom: "1.5px solid rgba(0,0,0,0.18)" }}>
          <svg viewBox={`0 0 ${totalWidth} 100`} preserveAspectRatio="none" className="w-full h-full">
            {payload.bars.map((b, i) => {
              const height = (b.value / maxValue) * 86 + 6;
              const x = i * (barWidth + 10) + 5;
              const y = 100 - height;
              return (
                <rect
                  key={i}
                  x={x}
                  y={y}
                  width={barWidth}
                  height={height}
                  fill={b.highlight ? "#E0A560" : "#1a1410"}
                  stroke={b.highlight ? "#1a1410" : "none"}
                  strokeWidth={1.5}
                  style={{
                    transformOrigin: `${x + barWidth / 2}px 100px`,
                    transform: "scaleY(0)",
                    animation: `bar-grow 1.2s ease-out ${0.3 + i * 0.25}s forwards`,
                  }}
                />
              );
            })}
            {payload.peak_label && (
              <text
                x={totalWidth - barWidth / 2 - 5}
                y={8}
                textAnchor="middle"
                className="font-caveat"
                fill="#b04848"
                fontSize={16}
                style={{
                  opacity: 0,
                  animation: `broadcast-fade-in 0.4s ease-out ${0.3 + payload.bars.length * 0.25 + 0.3}s forwards`,
                }}
              >
                {payload.peak_label}
              </text>
            )}
          </svg>
        </div>
        <div className="flex justify-between mt-1.5 font-jetbrains text-[10px]" style={{ color: "rgba(26,20,16,0.55)" }}>
          {payload.bars.map((b, i) => <span key={i}>{b.label}</span>)}
        </div>
      </div>
    </SceneFrame>
  );
}
```

- [ ] **Step 2: Add the `bar-grow` keyframe to index.css**

Append to `src/index.css`:

```css
@keyframes bar-grow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
```

- [ ] **Step 3: Commit**

```bash
git add src/components/companion/scenes/StatsScene.tsx src/index.css
git commit -m "feat(ai): StatsScene — live chart drawing with peak label"
```

---

### Task 6: VideoAnalysisScene

**Files:**
- Create: `src/components/companion/scenes/VideoAnalysisScene.tsx`

- [ ] **Step 1: Create the scene**

```tsx
// src/components/companion/scenes/VideoAnalysisScene.tsx
import SceneFrame from "./SceneFrame";
import type { SceneEvent } from "@/lib/companion/turn-script";

interface Props { scene: Extract<SceneEvent, { type: "video-analysis" }>; }

const SECTION_COLOR = {
  hook: { bg: "rgba(224,165,96,0.40)", border: "#E0A560", text: "#E0A560", word_bg: "rgba(224,165,96,0.20)", word_text: "#ffd07a" },
  body: { bg: "rgba(143,208,213,0.25)", border: "#8FD0D5", text: "#8FD0D5", word_bg: "rgba(143,208,213,0.15)", word_text: "#b5e4e8" },
  cta:  { bg: "rgba(127,180,138,0.30)", border: "#7fb48a", text: "#7fb48a", word_bg: "rgba(127,180,138,0.18)", word_text: "#b8e0c0" },
} as const;

export default function VideoAnalysisScene({ scene }: Props) {
  const { verb, meta, payload } = scene;
  const duration = Math.max(...payload.markers.map((m) => m.end), 1);

  return (
    <SceneFrame verb={verb} meta={meta}>
      <div className="grid grid-cols-[200px_1fr] gap-4.5" style={{ gap: 18 }}>
        <div
          className="relative rounded-xl overflow-hidden"
          style={{
            aspectRatio: "9 / 16",
            background: payload.video_url
              ? "#0a0d12"
              : "linear-gradient(135deg, #2a4838 0%, #0a1810 100%)",
            border: "2px solid rgba(234,230,220,0.20)",
            boxShadow: "4px 5px 0 rgba(0,0,0,0.4)",
          }}
        >
          {payload.video_url ? (
            <video src={payload.video_url} className="w-full h-full object-cover" muted autoPlay loop playsInline />
          ) : payload.caption ? (
            <div
              className="absolute top-3.5 left-2 right-2 text-center font-bold text-[13px]"
              style={{ color: "#ffe488", textShadow: "1px 1px 0 #000", lineHeight: 1.1 }}
            >
              "{payload.caption}"
            </div>
          ) : null}
          <div
            className="absolute top-0 left-0 right-0 h-[3px]"
            style={{
              background: "linear-gradient(90deg, transparent, #8FD0D5, transparent)",
              boxShadow: "0 0 10px #8FD0D5",
              animation: "scanline 2s ease-in-out infinite",
            }}
          />
          <div className="absolute bottom-0 left-0 right-0 h-[5px]" style={{ background: "rgba(0,0,0,0.6)" }}>
            <div style={{ height: "100%", background: "#E0A560", animation: "pb-fill 4s linear forwards", width: 0 }} />
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <div
            className="relative h-[38px] rounded-md"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(234,230,220,0.10)", marginTop: 16 }}
          >
            <div
              className="absolute -top-4 left-1 font-bold text-[9px] uppercase tracking-widest"
              style={{ color: "rgba(234,230,220,0.6)", fontFamily: "Inter, sans-serif" }}
            >
              timeline
            </div>
            {payload.markers.map((m, i) => {
              const c = SECTION_COLOR[m.section];
              const left = (m.start / duration) * 100;
              const width = ((m.end - m.start) / duration) * 100;
              return (
                <div
                  key={i}
                  className="absolute top-1 bottom-1 rounded"
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    background: c.bg,
                    border: `1px solid ${c.border}`,
                    opacity: 0,
                    animation: `broadcast-fade-in 0.4s ease-out ${0.6 + i * 0.6}s forwards`,
                  }}
                >
                  <div
                    className="absolute top-full mt-0.5 font-caveat whitespace-nowrap text-[12px]"
                    style={{ color: c.text }}
                  >
                    {m.label}
                  </div>
                </div>
              );
            })}
            <div
              className="absolute -top-0.5 -bottom-0.5 w-0.5"
              style={{
                background: "#E0A560",
                boxShadow: "0 0 8px #E0A560",
                left: 0,
                animation: "playhead-sweep 4s linear forwards",
              }}
            />
          </div>
          <div
            className="flex-1 rounded-lg px-4 py-3 mt-6"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(234,230,220,0.10)",
              fontFamily: "'EB Garamond', Georgia, serif",
              fontSize: 14.5,
              lineHeight: 1.55,
              color: "rgba(234,230,220,0.92)",
            }}
          >
            {payload.transcript.map((t, i) => {
              const c = SECTION_COLOR[t.section];
              return (
                <span
                  key={i}
                  className="inline-block mr-1"
                  style={{
                    background: c.word_bg,
                    color: c.word_text,
                    padding: "0 3px",
                    borderRadius: 2,
                    opacity: 0,
                    animation: `broadcast-fade-in 0.15s ease-out ${0.1 + i * 0.1}s forwards`,
                  }}
                >
                  {t.word}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </SceneFrame>
  );
}
```

- [ ] **Step 2: Add `scanline`, `pb-fill`, `playhead-sweep` keyframes to index.css**

Append:

```css
@keyframes scanline {
  0%, 100% { top: 0; }
  50%      { top: calc(100% - 3px); }
}
@keyframes pb-fill { to { width: 100%; } }
@keyframes playhead-sweep { to { left: calc(100% - 2px); } }
```

- [ ] **Step 3: Commit**

```bash
git add src/components/companion/scenes/VideoAnalysisScene.tsx src/index.css
git commit -m "feat(ai): VideoAnalysisScene — video + timeline markers + word transcript"
```

---

### Task 7: ThinkingScene (fingerprint)

**Files:**
- Create: `src/components/companion/scenes/ThinkingScene.tsx`

- [ ] **Step 1: Create the scene**

```tsx
// src/components/companion/scenes/ThinkingScene.tsx
import SceneFrame from "./SceneFrame";
import type { SceneEvent } from "@/lib/companion/turn-script";

interface Props { scene: Extract<SceneEvent, { type: "thinking" }>; }

/**
 * The ONLY scene where the fingerprint avatar pulses. Used when Robby ran
 * no tools and is purely reasoning. Per spec, the fingerprint never appears
 * as a generic loading state for tool calls.
 */
export default function ThinkingScene({ scene }: Props) {
  return (
    <SceneFrame verb={scene.verb} meta={scene.meta} hideDot>
      <div className="flex items-center gap-3 py-2">
        <div
          className="w-7 h-7 rounded-full relative"
          style={{
            background: "radial-gradient(circle at 35% 35%, rgba(143,208,213,0.6), rgba(143,208,213,0.1) 70%)",
            border: "1px solid rgba(143,208,213,0.35)",
            animation: "think-pulse 1.8s ease-in-out infinite",
          }}
        >
          <span
            className="absolute rounded-full"
            style={{ inset: 4, border: "1px solid rgba(143,208,213,0.45)" }}
          />
          <span
            className="absolute rounded-full"
            style={{ inset: 9, border: "1px solid rgba(143,208,213,0.45)" }}
          />
        </div>
        <span
          style={{
            fontFamily: "'EB Garamond', Georgia, serif",
            fontStyle: "italic",
            fontSize: 14,
            color: "rgba(234,230,220,0.65)",
          }}
        >
          {scene.payload.hint}
        </span>
      </div>
    </SceneFrame>
  );
}
```

- [ ] **Step 2: Add `think-pulse` keyframe to index.css**

Append:

```css
@keyframes think-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(143,208,213,0.4); }
  50%      { box-shadow: 0 0 0 8px rgba(143,208,213,0); }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/companion/scenes/ThinkingScene.tsx src/index.css
git commit -m "feat(ai): ThinkingScene — fingerprint for pure-reasoning turns only"
```

---

### Task 8: VideoCardEmbed

**Files:**
- Create: `src/components/companion/embeds/VideoCardEmbed.tsx`

- [ ] **Step 1: Create the embed**

```tsx
// src/components/companion/embeds/VideoCardEmbed.tsx
import type { VideoCardEmbedData } from "@/lib/companion/turn-script";

interface Props {
  data: VideoCardEmbedData;
  onClick?: (id: string) => void;
}

function fmtViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export default function VideoCardEmbed({ data, onClick }: Props) {
  return (
    <div
      className="rounded-xl overflow-hidden cursor-pointer transition-all"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(234,230,220,0.12)",
      }}
      onClick={() => onClick?.(data.id)}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.borderColor = "rgba(143,208,213,0.40)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "";
        e.currentTarget.style.borderColor = "rgba(234,230,220,0.12)";
      }}
    >
      <div className="relative" style={{ aspectRatio: "9 / 16", background: "#1a1410", overflow: "hidden" }}>
        {data.thumbnail_url ? (
          <img src={data.thumbnail_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(135deg, #4a3a30 0%, #2a1808 100%)" }}
          />
        )}
        {data.caption_overlay && (
          <div
            className="absolute top-3 left-1.5 right-1.5 text-center font-bold text-[9px] leading-tight"
            style={{ color: "#fff", textShadow: "1px 1px 0 #000" }}
          >
            {data.caption_overlay}
          </div>
        )}
        <div
          className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[8.5px] font-bold tracking-wider"
          style={{ background: "rgba(0,0,0,0.7)", color: "#E0A560" }}
        >
          {data.outlier.toFixed(1)}x
        </div>
        <div className="absolute bottom-1.5 left-1.5 text-[10px]" style={{ color: "rgba(255,255,255,0.75)" }}>
          @{data.username}
        </div>
      </div>
      <div className="px-2.5 py-2">
        {data.format_hint && (
          <div className="text-[10px] font-semibold" style={{ color: "rgba(234,230,220,0.7)" }}>
            {data.format_hint}
          </div>
        )}
        <div className="flex gap-2 mt-1 font-jetbrains text-[9.5px]" style={{ color: "rgba(234,230,220,0.85)" }}>
          <span style={{ color: "#E0A560" }}>{fmtViews(data.views)}</span>
          <span>{data.engagement.toFixed(1)}%</span>
          <span>{data.age}</span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/companion/embeds/VideoCardEmbed.tsx
git commit -m "feat(ai): VideoCardEmbed — inline thumbnail card with stats"
```

---

### Task 9: VideoPlayerEmbed

**Files:**
- Create: `src/components/companion/embeds/VideoPlayerEmbed.tsx`

- [ ] **Step 1: Create the embed**

```tsx
// src/components/companion/embeds/VideoPlayerEmbed.tsx
import { useRef, useState } from "react";
import type { VideoPlayerEmbedData } from "@/lib/companion/turn-script";

interface Props { data: VideoPlayerEmbedData; }

export default function VideoPlayerEmbed({ data }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); }
    else { v.pause(); setPlaying(false); }
  };

  return (
    <div
      className="relative rounded-xl overflow-hidden cursor-pointer"
      style={{
        aspectRatio: "9 / 16",
        maxWidth: 240,
        border: "1.5px solid rgba(234,230,220,0.18)",
        background: "#0a0d12",
        boxShadow: "4px 4px 0 rgba(0,0,0,0.4)",
      }}
      onClick={toggle}
    >
      {data.video_file_url ? (
        <video ref={ref} src={data.video_file_url} className="w-full h-full object-cover" muted loop playsInline />
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(135deg, #2a3548 0%, #0e1420 100%)" }}
        />
      )}
      {data.caption_overlay && !playing && (
        <div
          className="absolute top-3 left-2 right-2 text-center font-bold text-[11px] leading-tight"
          style={{ color: "#fff", textShadow: "1px 1px 0 #000" }}
        >
          {data.caption_overlay}
        </div>
      )}
      {!playing && (
        <div
          className="absolute top-1/2 left-1/2 w-11 h-11 rounded-full flex items-center justify-center"
          style={{
            transform: "translate(-50%, -50%)",
            background: "#E0A560",
            border: "2px solid #1a1410",
            color: "#1a1410",
            fontSize: 16,
            boxShadow: "3px 3px 0 rgba(0,0,0,0.4)",
          }}
        >
          ▶
        </div>
      )}
      <div
        className="absolute bottom-3.5 left-2 right-2 flex justify-between font-jetbrains text-[9px]"
        style={{ color: "#fff" }}
      >
        <span>@{data.username}</span>
        <span
          className="px-1.5 py-0.5 rounded font-bold"
          style={{ background: "rgba(0,0,0,0.7)", color: "#E0A560" }}
        >
          {data.outlier.toFixed(1)}x
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/companion/embeds/VideoPlayerEmbed.tsx
git commit -m "feat(ai): VideoPlayerEmbed — inline tappable player"
```

---

### Task 10: MetricStripEmbed

**Files:**
- Create: `src/components/companion/embeds/MetricStripEmbed.tsx`

- [ ] **Step 1: Create the embed**

```tsx
// src/components/companion/embeds/MetricStripEmbed.tsx
import type { MetricStripEmbedData } from "@/lib/companion/turn-script";

interface Props { data: MetricStripEmbedData; }

export default function MetricStripEmbed({ data }: Props) {
  // Reuse the same visual as StatsScene's interior card, sans the SceneFrame wrap.
  const maxValue = Math.max(...data.bars.map((b) => b.value), 1);
  const totalWidth = 280;

  return (
    <div className="broadcast-card p-4">
      <div className="flex justify-between items-baseline mb-2.5">
        <div
          className="font-bold text-[9px] uppercase tracking-widest"
          style={{ color: "#b04848", fontFamily: "Inter, sans-serif" }}
        >
          {data.label}
        </div>
        {data.scribble && (
          <div className="font-caveat text-[13px]" style={{ color: "#b04848" }}>
            {data.scribble}
          </div>
        )}
      </div>
      <div className="flex items-baseline gap-2.5">
        <span
          className="text-[34px] font-medium leading-none"
          style={{ color: "#1a1410", fontFamily: "'EB Garamond', Georgia, serif" }}
        >
          {data.big_value}
        </span>
        {data.delta && (
          <span
            className="text-[12px] font-bold px-2 py-0.5 border-[1.5px] rounded font-jetbrains"
            style={{ color: "#2a6f77", borderColor: "#2a6f77", background: "rgba(42,111,119,0.10)", transform: "rotate(-2deg)" }}
          >
            {data.delta}
          </span>
        )}
      </div>
      <svg viewBox={`0 0 ${totalWidth} 60`} preserveAspectRatio="none" className="w-full h-[34px] mt-2">
        {(() => {
          const points = data.bars.map((b, i) => {
            const x = (i / (data.bars.length - 1 || 1)) * (totalWidth - 8) + 4;
            const y = 56 - (b.value / maxValue) * 50;
            return `${x},${y}`;
          });
          return <polyline points={points.join(" ")} fill="none" stroke="#1a1410" strokeWidth={2} strokeLinecap="round" />;
        })()}
      </svg>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/companion/embeds/MetricStripEmbed.tsx
git commit -m "feat(ai): MetricStripEmbed — bone card with sparkline + scribble"
```

---

### Task 11: FrameworkDeckEmbed

**Files:**
- Create: `src/components/companion/embeds/FrameworkDeckEmbed.tsx`

- [ ] **Step 1: Create the embed**

```tsx
// src/components/companion/embeds/FrameworkDeckEmbed.tsx
import type { FrameworkDeckEmbedData } from "@/lib/companion/turn-script";

interface Props { data: FrameworkDeckEmbedData; }

export default function FrameworkDeckEmbed({ data }: Props) {
  const front = data.cards[0];
  const backCount = Math.min(2, data.cards.length - 1);

  if (!front) return null;

  return (
    <div className="relative pr-4 pb-5" style={{ maxWidth: 320 }}>
      {Array.from({ length: backCount }).map((_, i) => (
        <div
          key={i}
          className="broadcast-card-sm absolute"
          style={{
            top: 4 + i * 4,
            left: 4 + i * 4,
            right: 12 - i * 4,
            height: "100%",
            transform: `rotate(${-2 - i * 1.5}deg)`,
            background: i === 0 ? "#f0e3b8" : "#e8d8a8",
            zIndex: 1 - i,
          }}
        />
      ))}
      <div
        className="broadcast-card-sm relative px-3 py-2.5"
        style={{ background: "#fff8e8", transform: "rotate(1deg)", zIndex: 2 }}
      >
        <div
          className="font-bold text-[8.5px] uppercase tracking-widest mb-1"
          style={{ color: "#b04848", fontFamily: "Inter, sans-serif" }}
        >
          {front.tag}
        </div>
        <div
          className="font-medium text-[13.5px] leading-snug"
          style={{ color: "#1a1410", fontFamily: "'EB Garamond', Georgia, serif" }}
          dangerouslySetInnerHTML={{
            __html: front.headline.replace(
              /<scribble>(.*?)<\/scribble>/g,
              '<span class="scribble-wavy">$1</span>',
            ),
          }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/companion/embeds/FrameworkDeckEmbed.tsx
git commit -m "feat(ai): FrameworkDeckEmbed — stacked bone cards"
```

---

### Task 12: ChannelGridEmbed + ScriptCardEmbed

**Files:**
- Create: `src/components/companion/embeds/ChannelGridEmbed.tsx`
- Create: `src/components/companion/embeds/ScriptCardEmbed.tsx`

- [ ] **Step 1: Create ChannelGridEmbed**

```tsx
// src/components/companion/embeds/ChannelGridEmbed.tsx
import type { ChannelGridEmbedData } from "@/lib/companion/turn-script";

interface Props { data: ChannelGridEmbedData; }

const STATUS_COLOR = {
  active: { dot: "#7fb48a", text: "#7fb48a" },
  paused: { dot: "rgba(234,230,220,0.35)", text: "rgba(234,230,220,0.45)" },
  hot:    { dot: "#E0A560", text: "#E0A560" },
} as const;

export default function ChannelGridEmbed({ data }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {data.channels.map((c) => {
        const s = STATUS_COLOR[c.status];
        return (
          <div
            key={c.id}
            className="flex items-center gap-2 p-2 rounded-md"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(234,230,220,0.10)" }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: s.dot, boxShadow: c.status === "hot" ? `0 0 6px ${s.dot}` : "none" }}
            />
            <span className="text-[11px] font-medium" style={{ color: "#EAE6DC" }}>@{c.username}</span>
            <span className="ml-auto text-[9px] uppercase tracking-widest" style={{ color: s.text, fontFamily: "Inter, sans-serif" }}>
              {c.status}
            </span>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Create ScriptCardEmbed**

```tsx
// src/components/companion/embeds/ScriptCardEmbed.tsx
import type { ScriptCardEmbedData } from "@/lib/companion/turn-script";

interface Props {
  data: ScriptCardEmbedData;
  onRegen?: () => void;
  onShip?: () => void;
}

/**
 * Settled version of the drafting scene card — all sections visible, no
 * type-on animation, action buttons available. Used when Robby references
 * a completed draft inline.
 */
export default function ScriptCardEmbed({ data, onRegen, onShip }: Props) {
  return (
    <div className="broadcast-card relative px-5 py-5 sm:px-6">
      <div
        className="absolute -top-3 right-5 px-3 py-1 text-[10px] font-bold uppercase tracking-widest"
        style={{
          background: "#E0A560",
          color: "#1a1410",
          border: "2px solid #1a1410",
          borderRadius: 4,
          boxShadow: "3px 3px 0 #1a1410",
          transform: "rotate(2deg)",
          fontFamily: "Inter, sans-serif",
        }}
      >
        draft
      </div>
      {data.sections.map((s, i) => (
        <div key={i} className={i < data.sections.length - 1 ? "mb-4" : ""}>
          <div
            className="font-bold text-[10px] uppercase tracking-widest mb-1.5"
            style={{ color: "#b04848", fontFamily: "Inter, sans-serif" }}
          >
            {s.tag}
          </div>
          <div
            className="text-[16px] leading-snug"
            style={{ color: "#1a1410", fontFamily: "'EB Garamond', Georgia, serif" }}
            dangerouslySetInnerHTML={{
              __html: s.body.replace(/<scribble>(.*?)<\/scribble>/g, '<span class="scribble-wavy">$1</span>'),
            }}
          />
        </div>
      ))}
      {(data.est_outlier || data.read_time_sec || data.matches_note || onRegen || onShip) && (
        <div
          className="mt-4 pt-3.5 flex flex-wrap gap-3 items-center text-[11.5px]"
          style={{ borderTop: "1.5px dashed rgba(0,0,0,0.18)", color: "rgba(26,20,16,0.65)", fontFamily: "Inter, sans-serif" }}
        >
          {data.est_outlier && <span style={{ color: "#1a1410", fontWeight: 700 }}>est. {data.est_outlier.toFixed(1)}x outlier</span>}
          {data.read_time_sec && <><span>·</span><span>{data.read_time_sec}s read</span></>}
          {data.matches_note && <><span>·</span><span>{data.matches_note}</span></>}
          {(onRegen || onShip) && (
            <div className="ml-auto flex gap-2">
              {onRegen && (
                <button
                  onClick={onRegen}
                  className="px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded"
                  style={{ background: "#fdf3d6", color: "#1a1410", border: "1.5px solid #1a1410", boxShadow: "2px 2px 0 rgba(0,0,0,0.4)", fontFamily: "Inter, sans-serif" }}
                >
                  ↻ regen
                </button>
              )}
              {onShip && (
                <button
                  onClick={onShip}
                  className="px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded"
                  style={{ background: "#1a1410", color: "#ffd07a", border: "1.5px solid #1a1410", boxShadow: "2px 2px 0 rgba(0,0,0,0.4)", fontFamily: "Inter, sans-serif" }}
                >
                  ▶ ship to canvas
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/companion/embeds/ChannelGridEmbed.tsx src/components/companion/embeds/ScriptCardEmbed.tsx
git commit -m "feat(ai): ChannelGridEmbed + ScriptCardEmbed"
```

---

### Task 13: TurnRenderer

**Files:**
- Create: `src/components/companion/TurnRenderer.tsx`

- [ ] **Step 1: Create the renderer**

```tsx
// src/components/companion/TurnRenderer.tsx
import ScanningScene from "./scenes/ScanningScene";
import DraftingScene from "./scenes/DraftingScene";
import StatsScene from "./scenes/StatsScene";
import VideoAnalysisScene from "./scenes/VideoAnalysisScene";
import ThinkingScene from "./scenes/ThinkingScene";

import VideoCardEmbed from "./embeds/VideoCardEmbed";
import VideoPlayerEmbed from "./embeds/VideoPlayerEmbed";
import MetricStripEmbed from "./embeds/MetricStripEmbed";
import FrameworkDeckEmbed from "./embeds/FrameworkDeckEmbed";
import ChannelGridEmbed from "./embeds/ChannelGridEmbed";
import ScriptCardEmbed from "./embeds/ScriptCardEmbed";

import type { BroadcastTurn, SceneEvent, EmbedRef } from "@/lib/companion/turn-script";

interface Props {
  turn: BroadcastTurn;
  onEmbedClick?: (embed: EmbedRef) => void;
}

function renderScene(s: SceneEvent) {
  switch (s.type) {
    case "scanning":        return <ScanningScene scene={s} />;
    case "drafting":        return <DraftingScene scene={s} />;
    case "stats":           return <StatsScene scene={s} />;
    case "video-analysis":  return <VideoAnalysisScene scene={s} />;
    case "thinking":        return <ThinkingScene scene={s} />;
  }
}

function renderEmbed(e: EmbedRef, onClick?: (e: EmbedRef) => void) {
  switch (e.type) {
    case "video-card":      return <VideoCardEmbed data={e.data} onClick={() => onClick?.(e)} />;
    case "video-player":    return <VideoPlayerEmbed data={e.data} />;
    case "metric-strip":    return <MetricStripEmbed data={e.data} />;
    case "framework-deck":  return <FrameworkDeckEmbed data={e.data} />;
    case "channel-grid":    return <ChannelGridEmbed data={e.data} />;
    case "script-card":     return <ScriptCardEmbed data={e.data} />;
  }
}

/**
 * Renders a single assistant turn:
 *   1. Each scene in order (full-width inside the chat column).
 *   2. The italic narrative line.
 *   3. Embeds (single video card = full-width-ish; multiple = grid).
 */
export default function TurnRenderer({ turn, onEmbedClick }: Props) {
  const videoCards = turn.embeds.filter((e) => e.type === "video-card");
  const otherEmbeds = turn.embeds.filter((e) => e.type !== "video-card");

  return (
    <div className="flex flex-col gap-3">
      {turn.scenes.map((s, i) => (
        <div key={`scene-${i}`}>{renderScene(s)}</div>
      ))}
      {turn.narrative && (
        <div
          className="px-1"
          style={{
            fontFamily: "'EB Garamond', Georgia, serif",
            fontSize: 16,
            lineHeight: 1.5,
            color: "#EAE6DC",
            letterSpacing: "-0.005em",
            fontStyle: turn.scenes.length > 0 ? "normal" : "italic",
          }}
        >
          {turn.narrative}
        </div>
      )}
      {videoCards.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {videoCards.map((e, i) => (
            <div key={`vc-${i}`}>{renderEmbed(e, onEmbedClick)}</div>
          ))}
        </div>
      )}
      {otherEmbeds.map((e, i) => (
        <div key={`em-${i}`}>{renderEmbed(e, onEmbedClick)}</div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/companion/TurnRenderer.tsx
git commit -m "feat(ai): TurnRenderer composes scenes + narrative + embeds"
```

---

### Task 14: Preview route at /ai/preview

**Files:**
- Create: `src/pages/CommandCenterPreview.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create CommandCenterPreview**

```tsx
// src/pages/CommandCenterPreview.tsx
// Visual-regression sandbox for the /ai live broadcast scenes + embeds.
// Mock turns demonstrate every component with realistic content. Reachable
// only on localhost — keep it out of customer-facing surfaces.

import TurnRenderer from "@/components/companion/TurnRenderer";
import type { BroadcastTurn } from "@/lib/companion/turn-script";

const MOCK_TURNS: { title: string; turn: BroadcastTurn }[] = [
  {
    title: "Scanning competitors",
    turn: {
      scenes: [{
        type: "scanning",
        verb: "Scanning your chiropractor niche…",
        meta: "scrape-channels · 51 sources · live status",
        payload: {
          channels: [
            { id: "1", username: "joe_gennusa",       avatar_seed: 0, status: "hit",      note: "3 new · 12.4x outlier" },
            { id: "2", username: "leilahormozi",      avatar_seed: 1, status: "done",     note: "2 new" },
            { id: "3", username: "drjones_dc",        avatar_seed: 2, status: "done",     note: "no updates" },
            { id: "4", username: "kaysen.stevens",    avatar_seed: 3, status: "hit",      note: "1 new · 5.4x" },
            { id: "5", username: "squat_university",  avatar_seed: 4, status: "done",     note: "no updates" },
            { id: "6", username: "herasmedia",        avatar_seed: 5, status: "checking", note: "checking…" },
            { id: "7", username: "odalundekvam",      avatar_seed: 6, status: "queued",   note: "queued" },
            { id: "8", username: "grant.cardone",     avatar_seed: 7, status: "queued",   note: "queued" },
          ],
          summary: "★ Three hits worth your time — pulling them now.",
        },
      }],
      narrative: "Pulled three. The split-screen one is hot — @joe_gennusa just dropped a comparison opener pacing for 12x in your sub-niche.",
      embeds: [
        { type: "video-card", data: { id: "v1", thumbnail_url: null, caption_overlay: '"It"s a bit expensive"', username: "joe_gennusa", outlier: 8.2, views: 523_000, engagement: 4.6, age: "2d ago", format_hint: "Comparison · split-screen" } },
        { type: "video-card", data: { id: "v2", thumbnail_url: null, caption_overlay: "Why most chiros lose",      username: "leilahormozi", outlier: 7.1, views: 1_800_000, engagement: 3.8, age: "3w ago", format_hint: "Authority · talking head" } },
        { type: "video-card", data: { id: "v3", thumbnail_url: null, caption_overlay: "DOOR TO DOOR",              username: "kaysen.stevens", outlier: 5.4, views: 628_000, engagement: 2.2, age: "2w ago", format_hint: "Tutorial · POV" } },
      ],
    },
  },
  {
    title: "Drafting",
    turn: {
      scenes: [{
        type: "drafting",
        verb: "Writing Calvin's Tuesday hook…",
        meta: "claude-haiku · borrowing split-screen rhythm · target: week-2 churn",
        payload: {
          sections: [
            { tag: "Hook", body: "Most chiros lose patients in week 2. <scribble>Here's what they're doing wrong.</scribble>" },
            { tag: "Body · split-screen", body: "Left: confident posture, exact follow-up timing.\nRight: vague schedule, no reminder, patient gone." },
            { tag: "CTA", body: "Save this if your retention is leaking after the first appointment." },
          ],
          est_outlier: 12.1,
          read_time_sec: 22,
          matches_note: "matches Calvin's last 3 hooks",
        },
      }],
      narrative: "Here. Borrowed the rhythm from Joe's split-screen and mapped it to Calvin's churn pain.",
      embeds: [],
    },
  },
  {
    title: "Pulling stats",
    turn: {
      scenes: [{
        type: "stats",
        verb: "Loading Calvin's last 7 days from Instagram Insights…",
        meta: "ig-insights · 3 reels · live",
        payload: {
          label: "Views · last 7 days",
          big_value: "28.4K",
          delta: "+44% wow",
          scribble: "↑ best week since launch ✦",
          bars: [
            { label: "WED", value: 22 }, { label: "THU", value: 32 },
            { label: "FRI", value: 28 }, { label: "SAT", value: 40 },
            { label: "SUN", value: 52 }, { label: "MON", value: 58, highlight: true },
            { label: "TUE", value: 86, highlight: true },
          ],
          peak_label: "12.4x ✦",
        },
      }],
      narrative: "Climbing. Thursday's hook finally cracked the niche cap — first 10x of his career.",
      embeds: [],
    },
  },
  {
    title: "Video analysis",
    turn: {
      scenes: [{
        type: "video-analysis",
        verb: "Reading @joe_gennusa's split-screen…",
        meta: "whisper + multimodal · marking hook / body / CTA",
        payload: {
          video_url: null,
          caption: "It's a bit expensive",
          markers: [
            { section: "hook", start: 0, end: 5,  label: "hook · 0-5s" },
            { section: "body", start: 5, end: 32, label: "body · 5-32s" },
            { section: "cta",  start: 32, end: 38, label: "CTA · 32-38s" },
          ],
          transcript: [
            ...['"It"s','a','bit','expensive"','—'].map((w) => ({ word: w, section: "hook" as const })),
            ...['here"s','what','a','$1,000','salesman','does:','he','apologizes,','drops','the','price.','The','$1M','salesman?','He','asks','one','question.'].map((w) => ({ word: w, section: "body" as const })),
            ...['Follow','for','part','2.'].map((w) => ({ word: w, section: "cta" as const })),
          ],
        },
      }],
      narrative: "His hook is the price tease. The body is the contrast structure I've been recommending to Calvin.",
      embeds: [],
    },
  },
  {
    title: "Pure thinking (fingerprint)",
    turn: {
      scenes: [{
        type: "thinking",
        verb: "",
        meta: "",
        payload: { hint: "Thinking — comparing patterns across your last 12 wins" },
      }],
      narrative: "Two patterns repeat: contrarian openers + week-2 framing. Want me to test a third?",
      embeds: [],
    },
  },
  {
    title: "Embeds — gallery",
    turn: {
      scenes: [],
      narrative: "Inline references — what Robby renders when he mentions a thing.",
      embeds: [
        { type: "metric-strip", data: { label: "Calvin · last 3 reels", big_value: "28.4K", delta: "+44%", bars: [
          { label: "Sun", value: 12 }, { label: "Mon", value: 30 }, { label: "Tue", value: 60 },
        ], scribble: "first 10x of his career ✦" } },
        { type: "framework-deck", data: { cards: [
          { tag: "Framework · Comparison", headline: "Most chiros lose patients in <scribble>week 2</scribble>" },
          { tag: "Framework · Listicle", headline: "5 ways your retention is leaking" },
        ] } },
        { type: "channel-grid", data: { channels: [
          { id: "c1", username: "joe_gennusa", status: "hot" },
          { id: "c2", username: "leilahormozi", status: "active" },
          { id: "c3", username: "drjones_dc", status: "paused" },
        ] } },
        { type: "script-card", data: {
          sections: [
            { tag: "Hook", body: "Stop telling chiros to <scribble>just post more</scribble>." },
            { tag: "CTA", body: "Follow for the part-2 fix." },
          ],
          est_outlier: 7.4, read_time_sec: 18, matches_note: "matches your authority pattern",
        } },
      ],
    },
  },
];

export default function CommandCenterPreview() {
  return (
    <div className="min-h-screen" style={{ background: "#141414" }}>
      <div className="max-w-3xl mx-auto px-5 py-10">
        <h1
          className="text-3xl font-medium mb-1"
          style={{ color: "#EAE6DC", fontFamily: "'EB Garamond', Georgia, serif" }}
        >
          /ai live broadcast — preview
        </h1>
        <p className="text-sm mb-8" style={{ color: "rgba(234,230,220,0.55)" }}>
          Every scene and embed with mock data. Reload to replay the animations.
        </p>
        {MOCK_TURNS.map((m, i) => (
          <div key={i} className="mb-10">
            <div
              className="text-[10px] tracking-widest uppercase font-bold mb-3"
              style={{ color: "#8FD0D5", fontFamily: "Inter, sans-serif" }}
            >
              {String(i + 1).padStart(2, "0")} · {m.title}
            </div>
            <TurnRenderer turn={m.turn} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the route to App.tsx**

Find the existing `<Route path="/ai" element={<CommandCenter />} />` line in [src/App.tsx](src/App.tsx). Add ABOVE it:

```tsx
const CommandCenterPreview = lazy(() => import("./pages/CommandCenterPreview"));
```

And add the route, immediately after the `/ai` route:

```tsx
<Route path="/ai/preview" element={<CommandCenterPreview />} />
```

- [ ] **Step 3: Run the dev server and visually verify**

Run: `npm run dev`
Open: `http://localhost:8080/ai/preview`
Expected: page renders six numbered sections, all animations play on load. No console errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/CommandCenterPreview.tsx src/App.tsx
git commit -m "feat(ai): /ai/preview route renders all scenes + embeds with mock data"
```

---

### Task 15: Reduced-motion support

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Add a global rule for `prefers-reduced-motion: reduce`**

Append to `src/index.css`:

```css
@media (prefers-reduced-motion: reduce) {
  /* When a user prefers reduced motion, snap every broadcast animation
     to its end state. We override clip-path (text reveals), opacity,
     and transform to their finished values; spin/scanline/pulse loops
     are reduced to a single static frame. */
  [style*="broadcast-fade-in"],
  [style*="broadcast-type-in"],
  [style*="bar-grow"],
  [style*="playhead-sweep"],
  [style*="pb-fill"] {
    animation: none !important;
    opacity: 1 !important;
    transform: none !important;
    clip-path: none !important;
  }
  [style*="broadcast-pulse"],
  [style*="think-pulse"],
  [style*="scanline"] {
    animation: none !important;
  }
}
```

- [ ] **Step 2: Verify in DevTools**

Open: `http://localhost:8080/ai/preview`
DevTools → Rendering tab → "Emulate CSS media feature prefers-reduced-motion" → reduce
Expected: animations don't replay on reload; all text/cards visible immediately.

- [ ] **Step 3: Commit**

```bash
git add src/index.css
git commit -m "feat(ai): respect prefers-reduced-motion on all broadcast animations"
```

---

### Task 16: Extend AssistantMessage to carry a turn

**Files:**
- Modify: `src/components/canvas/CanvasAIPanel.shared.tsx`

- [ ] **Step 1: Add the optional `broadcast` field to AssistantMessage**

Edit `src/components/canvas/CanvasAIPanel.shared.tsx`. Find the `AssistantMessage` interface (around line 37) and add `import type { BroadcastTurn } from "@/lib/companion/turn-script";` at the top of the file. Then add this property to the interface (preserve the rest):

```typescript
  /** Phase A: when present, AssistantChat renders this turn via TurnRenderer
   *  instead of the plain text content. The text content stays as a fallback
   *  so non-upgraded surfaces still render something. */
  broadcast?: BroadcastTurn;
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: exit code 0

- [ ] **Step 3: Commit**

```bash
git add src/components/canvas/CanvasAIPanel.shared.tsx
git commit -m "feat(ai): AssistantMessage carries optional broadcast turn"
```

---

### Task 17: Render the broadcast turn in AssistantChat

**Files:**
- Modify: `src/components/assistant/AssistantChat.tsx`

- [ ] **Step 1: Read the file and find the assistant-message render branch**

Run: `grep -n "role === \"assistant\"\|role===\"assistant\"" src/components/assistant/AssistantChat.tsx | head -5`

You'll find one or more conditional blocks rendering assistant content. Identify the one rendering the textual `content`.

- [ ] **Step 2: Import TurnRenderer at the top of the file**

Add to the imports:

```typescript
import TurnRenderer from "@/components/companion/TurnRenderer";
```

- [ ] **Step 3: Wrap the assistant content with a broadcast check**

Inside the render path for assistant messages, where `m.content` is rendered, wrap it like this (the exact surrounding JSX will vary; preserve any wrappers/classes that were already there):

```tsx
{m.broadcast ? (
  <TurnRenderer turn={m.broadcast} />
) : (
  /* existing text-rendering JSX stays here unchanged */
)}
```

- [ ] **Step 4: Verify nothing breaks for existing chats**

Open: `http://localhost:8080/ai` (admin user)
Send: "what should I post today?"
Expected: response renders normally (no broadcast field set → falls back to text). No console errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/assistant/AssistantChat.tsx
git commit -m "feat(ai): AssistantChat renders broadcast turns via TurnRenderer"
```

---

### Task 18: Wire a real "draft hook" flow end-to-end

**Files:**
- Modify: `src/pages/CommandCenter.tsx`

This task connects a real Robby reply to a real DraftingScene. We're not changing the agent backend yet — we'll detect a script_data response and convert it into a broadcast turn client-side. That gives us one working end-to-end demonstration without touching edge functions.

- [ ] **Step 1: Find the message-receive path in CommandCenter.tsx**

Run: `grep -n "script_data\|setChatMessages" src/pages/CommandCenter.tsx | head -8`

You're looking for where `chatMessages` is updated after an assistant reply arrives. There's likely a `setChatMessages((prev) => [...prev, assistantMsg])` pattern.

- [ ] **Step 2: Add a client-side broadcast inference helper at the top of CommandCenter.tsx**

Just below the existing imports, add:

```typescript
import type { BroadcastTurn } from "@/lib/companion/turn-script";

/**
 * Phase A bridge: when the agent returns a `script_data` payload (drafting
 * succeeded), construct a BroadcastTurn so the existing plain-text reply
 * gets upgraded to a DraftingScene + ScriptCardEmbed. The backend isn't
 * emitting scenes yet — this is a frontend-only inference.
 */
function inferBroadcastFromAssistantReply(msg: {
  content?: string;
  script_data?: { hook?: string; body?: string; cta?: string; title?: string };
}): BroadcastTurn | undefined {
  if (!msg.script_data) return undefined;
  const sections = [
    msg.script_data.hook && { tag: "Hook", body: msg.script_data.hook },
    msg.script_data.body && { tag: "Body", body: msg.script_data.body },
    msg.script_data.cta  && { tag: "CTA",  body: msg.script_data.cta },
  ].filter(Boolean) as Array<{ tag: string; body: string }>;
  if (sections.length === 0) return undefined;
  return {
    scenes: [{
      type: "drafting",
      verb: msg.script_data.title ? `Drafting: ${msg.script_data.title}` : "Drafting…",
      meta: "claude · live",
      payload: { sections },
    }],
    narrative: msg.content?.trim() || "",
    embeds: [],
  };
}
```

- [ ] **Step 3: Attach the inferred turn to the assistant message**

Find the line where the assistant message is appended (e.g. `setChatMessages((prev) => [...prev, { role: "assistant", content, script_data, ... }])`). Augment the object literal so it includes `broadcast`:

```typescript
setChatMessages((prev) => [
  ...prev,
  {
    role: "assistant",
    content,
    // ...existing fields...
    broadcast: inferBroadcastFromAssistantReply({ content, script_data }),
  },
]);
```

The exact field names depend on the existing variables — keep them as-is and just add the `broadcast` line.

- [ ] **Step 4: Test the real flow**

Run: `npm run dev`
Open: `http://localhost:8080/ai`
Send a message that triggers script generation: "draft a 30-second hook about week-2 churn"
Expected: when the response arrives, the DraftingScene appears with the hook/body/CTA typing in, the honey "draft v1" sticker, and the est-outlier footer. The plain text underneath is the agent's framing line.

- [ ] **Step 5: Commit**

```bash
git add src/pages/CommandCenter.tsx
git commit -m "feat(ai): live drafting scene fires when agent returns script_data"
```

---

### Task 19: Final visual review + push branch

- [ ] **Step 1: Walk through both surfaces side by side**

In two browser tabs, open:
- `http://localhost:8080/ai/preview` — confirm all 6 mock turns animate cleanly
- `http://localhost:8080/ai` — send "draft a hook about retention" and confirm the real DraftingScene fires

Watch specifically for:
- Hard offset shadows on every bone card (not blurry drop shadows)
- EB Garamond italic for verbs and narrative
- Caveat for the scribble note + Caveat callouts (peak_label, scribble)
- JetBrains Mono for technical meta lines
- Honey + aqua + sage + rose used semantically, never decoratively
- No fingerprint visible on any non-thinking turn

If any scene feels off, file it as a follow-up — don't fix inline at this stage.

- [ ] **Step 2: Push the branch**

```bash
git push -u origin feat/ai-live-broadcast
```

- [ ] **Step 3: Confirm local build succeeds**

Run: `npm run build`
Expected: exit 0, no TypeScript errors. Note the bundle size delta (should be small — these are all presentational components).

- [ ] **Step 4: Tell the user we're ready for review**

The work is on `feat/ai-live-broadcast`. Phase A is complete:
- 4 marquee scenes (Scanning, Drafting, Stats, VideoAnalysis) + ThinkingScene
- 6 embeds (VideoCard, VideoPlayer, MetricStrip, FrameworkDeck, ChannelGrid, ScriptCard)
- `/ai/preview` route for visual iteration
- Real drafting flow wired on `/ai`
- `prefers-reduced-motion` respected

Phase B (next plan, not in scope here): 8 remaining scenes + agent-side scene event emission.

---

## Phase B (out of scope — separate plan)

For reference only — a future plan will cover:

1. Build the 8 remaining scenes: Polaroid (thumbnail gen), Versus (comparison), Calendar (scheduling), Chest (vault search), Highlighter (transcript), Stamp (categorize), Magnifier (trends), and any new ones discovered.
2. Modify the agent backend (`ai-build-script`, the chat agent function) to emit structured `scenes[]` and `embeds[]` arrays in its response — replacing the client-side `inferBroadcastFromAssistantReply` bridge.
3. Wire a `tool-to-scene.ts` adapter on the backend that maps every tool call (scrape-channels, viral-video-categorize, etc.) to its scene event.
4. Mobile-specific layout for /ai broadcast — narrow viewport adjustments per scene.
5. Voice narration of activity scenes (optional, far future).
