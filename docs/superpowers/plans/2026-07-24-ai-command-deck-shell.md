# AI Command Deck — Shell & Live Panels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/ai` into the boxless, orb-centered "Command Deck" HUD shell described in `docs/superpowers/specs/2026-07-24-ai-command-deck-design.md`, gated to admins only, with the ambient side panels (System Vitals, Attention Radar, Telemetry, Voice) wired to real data that already exists in the schema today — no new tables.

**Architecture:** New focused components under `src/components/command-deck/` (canvas-based orb/radar/waveform, boxless text panels) composed by a new `CommandDeckLayout` wrapper. `CommandCenter.tsx` gets an admin gate and swaps its existing static empty-state hero for the new layout — the existing chat machinery (`AssistantChat`, `AssistantTextInput`, `streamCompanionChat`, threads, Tasks tab) is untouched and continues to be what renders once a conversation is active, per the spec's "ambient home, chat overlays" principle.

**Tech Stack:** React + TypeScript (Vite), Tailwind + inline styles using `hsl(var(--token))` brand tokens, native Canvas 2D for the orb/radar/waveform, Supabase JS client, Vitest for pure-logic unit tests.

## Global Constraints

- No raw palette hex in JSX/CSS — use `hsl(var(--token))`, matching the existing brand-token pre-commit guard (see memory: Branding hex→token map). Canvas `fillStyle`/`strokeStyle` cannot use `var()` directly, so canvas color values are resolved from the CSS custom properties at runtime (Task 2), never hardcoded hex.
- `/ai` becomes admin-only. Reuse the exact pattern already used by `Finances.tsx`/`Outbound.tsx`/`ApiUsage.tsx`: `useAuth().isAdmin` + `<Navigate to="/dashboard" replace />`. Do not invent a new gating mechanism.
- No new Supabase tables/migrations in this plan — every panel here reads existing tables (`scripts`, `video_edits`, `client_strategies`). The three data gaps requiring schema changes (agency revenue goal, outbound daily log, fleet-wide strategy score) and the action-surface pattern are a separate follow-on plan.
- Respect `prefers-reduced-motion` in every animated component: disable continuous ambient motion (orb rotation/breathing, scan sweep, radar sweep) entirely; one-shot entrance animations may play at near-zero duration instead of being removed.
- This repo has no component-level test suite — only pure-logic unit tests via Vitest (`npm run test`, see `src/lib/*.test.ts` for the existing pattern). Visual/canvas/composition tasks are verified by `npx tsc -p tsconfig.app.json --noEmit` (typecheck; CI runs `vite build` only, no typecheck gate — see memory: CI runs vite build only) plus manual verification in a running dev server per the `run` skill. Do not invent React component tests this codebase doesn't use elsewhere.
- Follow existing patterns exactly where they exist: reuse `src/lib/lifecycleStatus.ts`'s `LIFECYCLE_VALUES`/`isLifecycleStatus` for any `video_edits.lifecycle_status` logic — do not re-derive or hardcode the status strings.

---

## File Structure

**New files:**
- `src/lib/commandDeck/cssColor.ts` — resolves a CSS custom property (e.g. `--aqua`) to a canvas-safe `hsl(...)` string at runtime.
- `src/lib/commandDeck/fibonacciSphere.ts` — pure point-cloud math for the orb (unit tested).
- `src/lib/commandDeck/deckMetrics.ts` — pure aggregation helpers (month-window scripts pace, editing-queue bucket counts, calendar coverage) operating on already-fetched rows (unit tested).
- `src/hooks/useDeckMetrics.ts` — fetches the raw rows from Supabase and runs them through `deckMetrics.ts`; single source for System Vitals + Attention Radar.
- `src/components/command-deck/CommandOrb.tsx` — the rotating volumetric globe (canvas).
- `src/components/command-deck/CommandHeader.tsx` — boxless two-corner header (brand/objective/badges, clock/credits/status).
- `src/components/command-deck/SystemVitals.tsx` — left-column thin-bar metrics.
- `src/components/command-deck/TelemetryLog.tsx` — left-column ticking activity log (Realtime-driven).
- `src/components/command-deck/AttentionRadar.tsx` — right-column sweeping radar (canvas).
- `src/components/command-deck/VoiceWaveform.tsx` — right-column equalizer, wired to the existing `recognizing` dictation state.
- `src/components/command-deck/RollCallBar.tsx` — bottom boxless status strip.
- `src/components/command-deck/CommandDeckLayout.tsx` — the 3-column grid that composes all of the above around a center `children` slot.

**Modified files:**
- `src/pages/CommandCenter.tsx` — add the admin gate; wrap the `rightTab === "chat"` branch in `CommandDeckLayout`; swap `<FingerprintAvatar>` in the empty-state hero for `<CommandOrb>`.

---

## Task 1: Admin-gate `/ai`

**Files:**
- Modify: `src/pages/CommandCenter.tsx:23` (import), `:191` (hook), `:990-992` (guard)
- Test: manual (see Step 5)

**Interfaces:**
- Consumes: `useAuth()` → `{ user, isAdmin, loading }` (already exported by `src/hooks/useAuth.ts` / `src/contexts/AuthContext.tsx`, used identically in `src/pages/Finances.tsx` and `src/pages/Outbound.tsx`).
- Produces: nothing consumed by later tasks (this task is self-contained).

- [ ] **Step 1: Confirm the reference pattern**

Read `src/pages/Finances.tsx` around its `isAdmin`/`authLoading` usage (search `isAdmin` in that file) to copy the exact guard shape used elsewhere in this codebase — don't improvise a new one.

- [ ] **Step 2: Add the import and hook**

In `src/pages/CommandCenter.tsx`, line 23 currently reads:
```tsx
import { useNavigate } from "react-router-dom";
```
Change to:
```tsx
import { useNavigate, Navigate } from "react-router-dom";
```
Line 191 currently reads:
```tsx
const { user } = useAuth();
```
Change to:
```tsx
const { user, isAdmin, loading: authLoading } = useAuth();
```

- [ ] **Step 3: Add the guard immediately before the render return**

Find the `// ── Render ─────` comment (currently just above `return (` around line 991). Insert immediately above it:
```tsx
if (authLoading) {
  return (
    <div className="flex-1 flex items-center justify-center min-h-0" style={{ background: "hsl(var(--ink-on-cream))" }}>
      <div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
    </div>
  );
}
if (!isAdmin) return <Navigate to="/dashboard" replace />;
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep CommandCenter`
Expected: no output (no errors referencing `CommandCenter.tsx`).

- [ ] **Step 5: Manual verification**

Start the dev server (`npm run dev`). Sign in as a non-admin user and visit `/ai` — expect an immediate redirect to `/dashboard`. Sign in as an admin and visit `/ai` — expect the page to load exactly as it did before this change (nothing else in this task alters rendering for admins).

- [ ] **Step 6: Commit**

```bash
git add src/pages/CommandCenter.tsx
git commit -m "feat(ai): gate /ai to admins only"
```

---

## Task 2: `cssColor` canvas-color resolver (with test)

**Files:**
- Create: `src/lib/commandDeck/cssColor.ts`
- Test: `src/lib/commandDeck/cssColor.test.ts`

**Interfaces:**
- Produces: `resolveCssHsl(varName: string, fallback: string): string` — returns e.g. `"hsl(184 41% 70%)"` for `--aqua`. Used by Tasks 4, 6 (indirectly via components), 9, 10.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/commandDeck/cssColor.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveCssHsl } from "./cssColor";

describe("resolveCssHsl", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("wraps a resolved custom property in hsl()", () => {
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      getPropertyValue: (name: string) => (name === "--aqua" ? "184 41% 70%" : ""),
    } as CSSStyleDeclaration);
    expect(resolveCssHsl("--aqua", "0 0% 50%")).toBe("hsl(184 41% 70%)");
  });

  it("falls back when the property is empty", () => {
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      getPropertyValue: () => "",
    } as CSSStyleDeclaration);
    expect(resolveCssHsl("--missing", "0 0% 50%")).toBe("hsl(0 0% 50%)");
  });

  it("falls back when document is unavailable (SSR-safety)", () => {
    const original = globalThis.document;
    // @ts-expect-error — simulate no-document environment
    delete globalThis.document;
    expect(resolveCssHsl("--aqua", "184 41% 70%")).toBe("hsl(184 41% 70%)");
    globalThis.document = original;
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/commandDeck/cssColor.test.ts`
Expected: FAIL — `Cannot find module './cssColor'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/commandDeck/cssColor.ts
// Canvas fillStyle/strokeStyle cannot consume `var(--token)` directly — this
// resolves a brand token to a concrete hsl() string at call time so canvas
// components stay driven by the same tokens as the rest of the app instead
// of hardcoding hex (which the app's brand-token guard forbids elsewhere).
export function resolveCssHsl(varName: string, fallback: string): string {
  if (typeof document === "undefined") return `hsl(${fallback})`;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return `hsl(${raw || fallback})`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/commandDeck/cssColor.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/commandDeck/cssColor.ts src/lib/commandDeck/cssColor.test.ts
git commit -m "feat(ai): add cssColor resolver for canvas-safe brand tokens"
```

---

## Task 3: `fibonacciSphere` orb point-cloud math (with test)

**Files:**
- Create: `src/lib/commandDeck/fibonacciSphere.ts`
- Test: `src/lib/commandDeck/fibonacciSphere.test.ts`

**Interfaces:**
- Produces: `type Point3D = { x: number; y: number; z: number }`, `fibonacciSphere(n: number): Point3D[]`, `rotateX(p: Point3D, angle: number): Point3D`, `rotateY(p: Point3D, angle: number): Point3D`. Used by Task 4 (`CommandOrb.tsx`).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/commandDeck/fibonacciSphere.test.ts
import { describe, it, expect } from "vitest";
import { fibonacciSphere, rotateX, rotateY } from "./fibonacciSphere";

describe("fibonacciSphere", () => {
  it("returns exactly n points", () => {
    expect(fibonacciSphere(50)).toHaveLength(50);
  });

  it("every point lies on the unit sphere", () => {
    for (const p of fibonacciSphere(200)) {
      const r = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
      expect(r).toBeGreaterThan(0.999);
      expect(r).toBeLessThan(1.001);
    }
  });

  it("handles n=1 without dividing by zero", () => {
    expect(() => fibonacciSphere(1)).not.toThrow();
    expect(fibonacciSphere(1)).toHaveLength(1);
  });
});

describe("rotateY", () => {
  it("preserves distance from the y-axis", () => {
    const p = { x: 1, y: 0.4, z: 0 };
    const r = rotateY(p, Math.PI / 3);
    expect(Math.sqrt(r.x * r.x + r.z * r.z)).toBeCloseTo(Math.sqrt(p.x * p.x + p.z * p.z), 5);
    expect(r.y).toBeCloseTo(p.y, 10);
  });

  it("a full 2π rotation returns to the start", () => {
    const p = { x: 0.6, y: 0.2, z: 0.8 };
    const r = rotateY(p, Math.PI * 2);
    expect(r.x).toBeCloseTo(p.x, 5);
    expect(r.z).toBeCloseTo(p.z, 5);
  });
});

describe("rotateX", () => {
  it("preserves distance from the x-axis", () => {
    const p = { x: 0.3, y: 1, z: 0 };
    const r = rotateX(p, Math.PI / 4);
    expect(Math.sqrt(r.y * r.y + r.z * r.z)).toBeCloseTo(Math.sqrt(p.y * p.y + p.z * p.z), 5);
    expect(r.x).toBeCloseTo(p.x, 10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/commandDeck/fibonacciSphere.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/commandDeck/fibonacciSphere.ts
// Pure 3D point-cloud math for the Command Deck orb — kept dependency-free
// and framework-free so it can be unit tested without a canvas or DOM.
export interface Point3D {
  x: number;
  y: number;
  z: number;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Evenly distributes n points across a unit sphere surface. */
export function fibonacciSphere(n: number): Point3D[] {
  const points: Point3D[] = [];
  const denom = Math.max(1, n - 1);
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / denom) * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = GOLDEN_ANGLE * i;
    points.push({ x: Math.cos(theta) * radius, y, z: Math.sin(theta) * radius });
  }
  return points;
}

export function rotateX(p: Point3D, angle: number): Point3D {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c };
}

export function rotateY(p: Point3D, angle: number): Point3D {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/commandDeck/fibonacciSphere.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/commandDeck/fibonacciSphere.ts src/lib/commandDeck/fibonacciSphere.test.ts
git commit -m "feat(ai): add fibonacciSphere point-cloud math for the orb"
```

---

## Task 4: `CommandOrb` component

**Files:**
- Create: `src/components/command-deck/CommandOrb.tsx`

**Interfaces:**
- Consumes: `fibonacciSphere`, `rotateX`, `rotateY`, `Point3D` from `src/lib/commandDeck/fibonacciSphere.ts`; `resolveCssHsl` from `src/lib/commandDeck/cssColor.ts`.
- Produces: `<CommandOrb className?: string />` — a self-contained, self-animating canvas. Used by Task 15 (`CommandCenter.tsx`), and has its power-on entrance class applied in Task 14.

- [ ] **Step 1: Write the component**

```tsx
// src/components/command-deck/CommandOrb.tsx
import { useEffect, useRef } from "react";
import { fibonacciSphere, rotateX, rotateY, type Point3D } from "@/lib/commandDeck/fibonacciSphere";
import { resolveCssHsl } from "@/lib/commandDeck/cssColor";

const TILT = (12 * Math.PI) / 180;

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

export default function CommandOrb({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const aqua = resolveCssHsl("--aqua", "184 41% 70%");

    const basePoints: Point3D[] = fibonacciSphere(560).map((p) => rotateX(p, TILT));
    let raf = 0;
    let t = 0;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas!.clientWidth;
      const h = canvas!.clientHeight;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw() {
      const w = canvas!.clientWidth;
      const h = canvas!.clientHeight;
      const cx = w / 2;
      const cy = h / 2;
      const R = w * 0.3;
      ctx!.clearRect(0, 0, w, h);

      // Outer dashed compass ring
      ctx!.save();
      ctx!.translate(cx, cy);
      ctx!.rotate(-t * 0.16);
      ctx!.strokeStyle = aqua.replace("hsl(", "hsla(").replace(")", ", 0.2)");
      ctx!.lineWidth = 1;
      ctx!.setLineDash([2, 8]);
      ctx!.beginPath();
      ctx!.arc(0, 0, R * 1.42, 0, Math.PI * 2);
      ctx!.stroke();
      ctx!.setLineDash([]);
      ctx!.restore();

      // Volumetric lit-sphere body beneath the point cloud
      const lit = ctx!.createRadialGradient(cx - R * 0.28, cy - R * 0.3, 0, cx, cy, R * 0.98);
      lit.addColorStop(0, "rgba(175,224,227,0.07)");
      lit.addColorStop(0.6, "rgba(143,208,213,0.02)");
      lit.addColorStop(1, "rgba(143,208,213,0)");
      ctx!.fillStyle = lit;
      ctx!.beginPath();
      ctx!.arc(cx, cy, R, 0, Math.PI * 2);
      ctx!.fill();

      // Dense point cloud, back-to-front, smooth depth falloff
      const projected = basePoints
        .map((p) => {
          const rp = rotateY(p, t);
          const persp = 1 + rp.z * 0.22;
          return { x: cx + rp.x * R * persp, y: cy + rp.y * R * persp, z: rp.z };
        })
        .sort((a, b) => a.z - b.z);
      for (const p of projected) {
        const d = smoothstep((p.z + 1) / 2);
        const alpha = 0.1 + d * 0.62;
        const size = 0.55 + d * 1.4;
        ctx!.fillStyle = aqua.replace("hsl(", "hsla(").replace(")", `, ${alpha.toFixed(2)})`);
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx!.fill();
      }

      // Tight, crisp core glow
      const pr = 5 + Math.sin(t * 2.4) * 1;
      const core = ctx!.createRadialGradient(cx, cy, 0, cx, cy, pr + 4);
      core.addColorStop(0, "#EAFAFB");
      core.addColorStop(0.5, aqua);
      core.addColorStop(1, "rgba(143,208,213,0)");
      ctx!.fillStyle = core;
      ctx!.beginPath();
      ctx!.arc(cx, cy, pr + 4, 0, Math.PI * 2);
      ctx!.fill();

      t += 0.0032;
      if (!reduceMotion) raf = requestAnimationFrame(draw);
    }

    resize();
    draw();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
      style={{
        width: "min(60vh, 600px)",
        height: "min(60vh, 600px)",
        maxWidth: "96%",
        display: "block",
        filter:
          "drop-shadow(0 0 3px hsl(var(--aqua) / 0.3)) drop-shadow(0 0 10px hsl(var(--aqua) / 0.12))",
      }}
    />
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep CommandOrb`
Expected: no output.

- [ ] **Step 3: Manual verification**

Temporarily render `<CommandOrb />` on any page you can reach in the dev server (e.g. drop it into `CommandCenter.tsx`'s existing hero area — this will be made permanent in Task 15 — or a scratch route). Confirm: a rotating, glowing point-cloud sphere renders, motion is slow/smooth, no console errors. Remove any temporary scratch usage before committing if you used one outside Task 15's real integration.

- [ ] **Step 4: Commit**

```bash
git add src/components/command-deck/CommandOrb.tsx
git commit -m "feat(ai): add CommandOrb rotating volumetric globe component"
```

---

## Task 5: `deckMetrics` pure aggregation helpers (with test)

**Files:**
- Create: `src/lib/commandDeck/deckMetrics.ts`
- Test: `src/lib/commandDeck/deckMetrics.test.ts`

**Interfaces:**
- Consumes: `MonthWindow`, `monthWindow`, `expectedByToday` from `src/lib/strategy/pace.ts` (existing, verified — do not redefine month-window math, reuse it).
- Produces: `scriptsPace(scriptsThisMonth: number, target: number, w: MonthWindow): { count: number; target: number; pct: number }`, `calendarCoverage(scheduleDates: string[], now?: Date): { daysCovered: number; daysTotal: 7 }`, `type RadarBlip = { angle: number; radius: number; severity: "crit" | "warn" | "info" }`, `radarBlipsFromCounts(needsRevisions: number, notStartedPastDeadline: number, emptyCalendarDays: number): RadarBlip[]`. Used by Task 6 (`useDeckMetrics`).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/commandDeck/deckMetrics.test.ts
import { describe, it, expect } from "vitest";
import { monthWindow } from "@/lib/strategy/pace";
import { scriptsPace, calendarCoverage, radarBlipsFromCounts } from "./deckMetrics";

describe("scriptsPace", () => {
  it("computes percent of prorated target", () => {
    // Day 15 of a 30-day month → prorated target = round(20 * 15/30) = 10
    const w = monthWindow(2026, 6, new Date(2026, 6, 15));
    const result = scriptsPace(8, 20, w);
    expect(result.count).toBe(8);
    expect(result.target).toBe(20);
    expect(result.pct).toBe(80); // 8 / 10 prorated = 80%
  });

  it("caps at 100% when ahead of pace", () => {
    const w = monthWindow(2026, 6, new Date(2026, 6, 5));
    const result = scriptsPace(50, 20, w);
    expect(result.pct).toBe(100);
  });
});

describe("calendarCoverage", () => {
  it("counts distinct covered days in the next 7", () => {
    const now = new Date(2026, 6, 1, 12, 0, 0);
    const dates = [
      new Date(2026, 6, 1).toISOString(),
      new Date(2026, 6, 1).toISOString(), // duplicate day, should not double-count
      new Date(2026, 6, 3).toISOString(),
      new Date(2026, 6, 20).toISOString(), // outside the 7-day window
    ];
    const result = calendarCoverage(dates, now);
    expect(result.daysCovered).toBe(2);
    expect(result.daysTotal).toBe(7);
  });

  it("returns zero coverage for an empty list", () => {
    expect(calendarCoverage([], new Date(2026, 6, 1)).daysCovered).toBe(0);
  });
});

describe("radarBlipsFromCounts", () => {
  it("emits one blip per unit, capped per category, with correct severities", () => {
    const blips = radarBlipsFromCounts(2, 1, 3);
    expect(blips.filter((b) => b.severity === "crit")).toHaveLength(2);
    expect(blips.filter((b) => b.severity === "warn")).toHaveLength(1);
    expect(blips.filter((b) => b.severity === "info")).toHaveLength(3);
    for (const b of blips) {
      expect(b.radius).toBeGreaterThan(0);
      expect(b.radius).toBeLessThanOrEqual(1);
      expect(b.angle).toBeGreaterThanOrEqual(0);
      expect(b.angle).toBeLessThan(Math.PI * 2);
    }
  });

  it("caps each category at 6 blips so one runaway count can't flood the radar", () => {
    const blips = radarBlipsFromCounts(20, 0, 0);
    expect(blips.filter((b) => b.severity === "crit")).toHaveLength(6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/commandDeck/deckMetrics.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/commandDeck/deckMetrics.ts
import { expectedByToday, type MonthWindow } from "@/lib/strategy/pace";

export function scriptsPace(
  scriptsThisMonth: number,
  target: number,
  w: MonthWindow,
): { count: number; target: number; pct: number } {
  const basis = expectedByToday(Math.max(1, target), w);
  const pct = Math.round(Math.min(100, (scriptsThisMonth / basis) * 100));
  return { count: scriptsThisMonth, target, pct };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Distinct calendar days (of the next 7, starting today) that have at
 *  least one item in `scheduleDates`. */
export function calendarCoverage(
  scheduleDates: string[],
  now: Date = new Date(),
): { daysCovered: number; daysTotal: 7 } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime() + 7 * DAY_MS);
  const covered = new Set<string>();
  for (const iso of scheduleDates) {
    const d = new Date(iso);
    if (d >= start && d < end) {
      covered.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    }
  }
  return { daysCovered: covered.size, daysTotal: 7 };
}

export interface RadarBlip {
  angle: number;
  radius: number;
  severity: "crit" | "warn" | "info";
}

const MAX_BLIPS_PER_CATEGORY = 6;

/** Deterministic-enough scatter (not random — stable across re-renders
 *  within a single count) of `count` blips onto the radar for a severity
 *  category, capped so one runaway count can't flood the display. */
function scatter(count: number, severity: RadarBlip["severity"], seedOffset: number): RadarBlip[] {
  const n = Math.min(count, MAX_BLIPS_PER_CATEGORY);
  const blips: RadarBlip[] = [];
  for (let i = 0; i < n; i++) {
    const angle = ((i * 2.399963 + seedOffset) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    const radius = 0.35 + ((i * 0.618) % 1) * 0.6;
    blips.push({ angle, radius, severity });
  }
  return blips;
}

export function radarBlipsFromCounts(
  needsRevisionsCount: number,
  pastDeadlineCount: number,
  emptyCalendarDaysCount: number,
): RadarBlip[] {
  return [
    ...scatter(needsRevisionsCount, "crit", 0.7),
    ...scatter(pastDeadlineCount, "warn", 2.1),
    ...scatter(emptyCalendarDaysCount, "info", 4.5),
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/commandDeck/deckMetrics.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/commandDeck/deckMetrics.ts src/lib/commandDeck/deckMetrics.test.ts
git commit -m "feat(ai): add pure deckMetrics aggregation helpers"
```

---

## Task 6: `useDeckMetrics` data hook

**Files:**
- Create: `src/hooks/useDeckMetrics.ts`

**Interfaces:**
- Consumes: `supabase` from `@/integrations/supabase/client`; `monthWindow` from `@/lib/strategy/pace`; `scriptsPace`, `calendarCoverage`, `radarBlipsFromCounts`, `RadarBlip` from `@/lib/commandDeck/deckMetrics`; `LIFECYCLE_VALUES`, `isLifecycleStatus` from `@/lib/lifecycleStatus`.
- Produces: `useDeckMetrics(): { loading: boolean; scripts: { count: number; target: number; pct: number } | null; editingQueueOpen: number | null; calendar: { daysCovered: number; daysTotal: 7 } | null; radarBlips: RadarBlip[] }`. Used by Task 7 (`SystemVitals`) and Task 9 (`AttentionRadar`).

- [ ] **Step 1: Verify the exact `scripts` and `video_edits` columns before writing the queries**

Run: `grep -n '"scripts"' src/hooks/useScripts.ts | head -5` and `grep -n 'deleted_at' src/pages/Scripts.tsx | head -5` to confirm whether `scripts` has a `deleted_at` column and confirm the draft-status exclusion convention referenced in this repo's own memory ("Any script count MUST `.neq('status','draft')`" — Scripts canvas draft phantoms). Adjust the query below only if this check shows a different column/value than assumed.

- [ ] **Step 2: Write the hook**

```ts
// src/hooks/useDeckMetrics.ts
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { monthWindow } from "@/lib/strategy/pace";
import { scriptsPace, calendarCoverage, radarBlipsFromCounts, type RadarBlip } from "@/lib/commandDeck/deckMetrics";

interface DeckMetrics {
  loading: boolean;
  scripts: { count: number; target: number; pct: number } | null;
  editingQueueOpen: number | null;
  calendar: { daysCovered: number; daysTotal: 7 } | null;
  radarBlips: RadarBlip[];
}

const OPEN_LIFECYCLE = ["Not started", "In progress", "Needs Revisions"] as const;

export function useDeckMetrics(): DeckMetrics {
  const [state, setState] = useState<DeckMetrics>({
    loading: true,
    scripts: null,
    editingQueueOpen: null,
    calendar: null,
    radarBlips: [],
  });

  useEffect(() => {
    let cancelled = false;
    const now = new Date();
    const w = monthWindow(now.getFullYear(), now.getMonth(), now);

    async function load() {
      const [scriptsRes, targetsRes, openEditsRes, needsRevRes, scheduleRes] = await Promise.all([
        supabase
          .from("scripts")
          .select("id", { count: "exact", head: true })
          .neq("status", "draft")
          .gte("created_at", w.startIso)
          .lt("created_at", w.endIso),
        supabase.from("client_strategies").select("scripts_per_month"),
        supabase
          .from("video_edits")
          .select("id", { count: "exact", head: true })
          .in("lifecycle_status", OPEN_LIFECYCLE as unknown as string[])
          .is("deleted_at", null)
          .is("archived_at", null),
        supabase
          .from("video_edits")
          .select("id", { count: "exact", head: true })
          .eq("lifecycle_status", "Needs Revisions")
          .is("deleted_at", null)
          .is("archived_at", null),
        supabase
          .from("video_edits")
          .select("schedule_date")
          .not("schedule_date", "is", null)
          .is("deleted_at", null)
          .is("archived_at", null),
      ]);

      if (cancelled) return;

      const scriptsTarget = (targetsRes.data ?? []).reduce(
        (sum, row: { scripts_per_month: number | null }) => sum + (row.scripts_per_month ?? 0),
        0,
      );
      const scriptsCount = scriptsRes.count ?? 0;
      const editingQueueOpen = openEditsRes.count ?? 0;
      const needsRevisions = needsRevRes.count ?? 0;
      const scheduleDates = (scheduleRes.data ?? [])
        .map((r: { schedule_date: string | null }) => r.schedule_date)
        .filter((d): d is string => Boolean(d));
      const calendar = calendarCoverage(scheduleDates, now);
      const emptyCalendarDays = calendar.daysTotal - calendar.daysCovered;

      setState({
        loading: false,
        scripts: scriptsPace(scriptsCount, scriptsTarget, w),
        editingQueueOpen,
        calendar,
        // Past-deadline count intentionally omitted for now (needs a
        // verified `deadline` semantics pass) — Attention Radar ships with
        // two live categories (needs-revisions, empty-calendar-days) rather
        // than a guessed third.
        radarBlips: radarBlipsFromCounts(needsRevisions, 0, emptyCalendarDays),
      });
    }

    load().catch((err) => {
      console.error("useDeckMetrics failed", err);
      if (!cancelled) setState((s) => ({ ...s, loading: false }));
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep useDeckMetrics`
Expected: no output. If Supabase's generated types reject `lifecycle_status`/`schedule_date`/`deleted_at`/`archived_at` on `video_edits` or `scripts_per_month` on `client_strategies`, check `src/integrations/supabase/types.ts` for the actual generated column names first (memory notes some tables were applied via dashboard and the generated types file can lag) and adjust the select/filter calls to match — do not silently cast with `as any` to suppress a real mismatch.

- [ ] **Step 4: Manual verification**

Temporarily log the hook's return value from a component you can view in the dev server while signed in as admin (this will be wired for real in Task 7/9 — a `console.log` in a scratch spot is fine here). Confirm `scripts`, `editingQueueOpen`, `calendar`, and `radarBlips` all populate with plausible numbers and no Supabase errors in the console. Remove the scratch log before committing.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useDeckMetrics.ts
git commit -m "feat(ai): add useDeckMetrics hook for real vitals + radar data"
```

---

## Task 7: `SystemVitals` component

**Files:**
- Create: `src/components/command-deck/SystemVitals.tsx`

**Interfaces:**
- Consumes: `useDeckMetrics` from `@/hooks/useDeckMetrics`.
- Produces: `<SystemVitals />`. Used by Task 13 (`CommandDeckLayout`).

- [ ] **Step 1: Write the component**

```tsx
// src/components/command-deck/SystemVitals.tsx
import { useDeckMetrics } from "@/hooks/useDeckMetrics";

function Bar({ label, value, denom, pct, tone }: { label: string; value: string; denom: string; pct: number; tone: "aqua" | "warn" | "good" }) {
  const fillColor =
    tone === "good" ? "hsl(var(--good, 141 33% 61%))" : tone === "warn" ? "hsl(var(--honey))" : "hsl(var(--aqua))";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10.5px]" style={{ color: "hsl(var(--bone) / 0.56)" }}>{label}</span>
        <span className="font-mono text-[10.5px] tabular-nums" style={{ color: "hsl(var(--bone))" }}>
          {value}
          <small style={{ color: "hsl(var(--bone) / 0.3)" }}> {denom}</small>
        </span>
      </div>
      <div className="h-[2.5px] rounded-[2px] overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div
          className="h-full rounded-[2px] transition-[width] duration-1000"
          style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: fillColor }}
        />
      </div>
    </div>
  );
}

export default function SystemVitals() {
  const { loading, scripts, editingQueueOpen, calendar } = useDeckMetrics();

  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex items-center gap-2 font-mono text-[9.5px] uppercase"
        style={{ letterSpacing: "0.22em", color: "hsl(var(--aqua) / 0.5)" }}
      >
        <span
          className="inline-block w-1 h-1 rounded-full"
          style={{ background: "hsl(var(--aqua))", boxShadow: "0 0 6px hsl(var(--aqua) / 0.14)" }}
        />
        System Vitals
      </div>

      {loading ? (
        <div className="text-[10.5px]" style={{ color: "hsl(var(--bone) / 0.3)" }}>Loading…</div>
      ) : (
        <>
          {scripts && (
            <Bar
              label="Scripts this month"
              value={String(scripts.count)}
              denom={`/ ${scripts.target}`}
              pct={scripts.pct}
              tone={scripts.pct >= 80 ? "good" : scripts.pct >= 40 ? "warn" : "warn"}
            />
          )}
          {editingQueueOpen !== null && (
            <Bar
              label="Editing queue load"
              value={String(editingQueueOpen)}
              denom="open"
              pct={Math.min(100, editingQueueOpen * 4)}
              tone="aqua"
            />
          )}
          {calendar && (
            <Bar
              label="Calendar · next 7d"
              value={String(calendar.daysCovered)}
              denom={`/ ${calendar.daysTotal} days`}
              pct={(calendar.daysCovered / calendar.daysTotal) * 100}
              tone={calendar.daysCovered >= 5 ? "good" : "warn"}
            />
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep SystemVitals`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/components/command-deck/SystemVitals.tsx
git commit -m "feat(ai): add SystemVitals HUD panel"
```

---

## Task 8: `TelemetryLog` component

**Files:**
- Create: `src/components/command-deck/TelemetryLog.tsx`

**Interfaces:**
- Consumes: `supabase` from `@/integrations/supabase/client` (Realtime channel on `video_edits` and `scripts`, matching the existing Realtime subscription pattern already used in `CommandCenter.tsx` for `assistant_messages` — read that pattern first).
- Produces: `<TelemetryLog />`. Used by Task 13.

- [ ] **Step 1: Read the existing Realtime pattern**

Read `src/pages/CommandCenter.tsx` around its `assistant_messages` `postgres_changes` subscription (search `postgres_changes` in that file) to copy the exact channel-subscribe/cleanup shape already proven in this codebase.

- [ ] **Step 2: Write the component**

```tsx
// src/components/command-deck/TelemetryLog.tsx
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface LogEntry {
  id: string;
  time: string;
  code: string;
  message: string;
}

function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export default function TelemetryLog() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const countRef = useRef(0);

  useEffect(() => {
    const channel = supabase
      .channel("command-deck-telemetry")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "scripts" },
        (payload) => {
          countRef.current += 1;
          setEntries((prev) =>
            [
              { id: `script-${payload.new.id}`, time: stamp(), code: "script.create", message: String(payload.new.title ?? "untitled") },
              ...prev,
            ].slice(0, 6),
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "video_edits" },
        (payload) => {
          countRef.current += 1;
          setEntries((prev) =>
            [
              { id: `edit-${payload.new.id}-${Date.now()}`, time: stamp(), code: "edit.update", message: String(payload.new.reel_title ?? "untitled") },
              ...prev,
            ].slice(0, 6),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex items-center gap-2 font-mono text-[9.5px] uppercase"
        style={{ letterSpacing: "0.22em", color: "hsl(var(--aqua) / 0.5)" }}
      >
        <span
          className="inline-block w-1 h-1 rounded-full"
          style={{ background: "hsl(var(--aqua))", boxShadow: "0 0 6px hsl(var(--aqua) / 0.14)" }}
        />
        Telemetry
        <span className="ml-auto normal-case font-normal" style={{ letterSpacing: "0.08em", fontSize: 8, color: "hsl(var(--bone) / 0.3)" }}>
          live
        </span>
      </div>
      <div className="flex flex-col font-mono text-[9.5px] max-h-[150px] overflow-hidden">
        {entries.length === 0 ? (
          <div style={{ color: "hsl(var(--bone) / 0.3)" }}>Waiting for activity…</div>
        ) : (
          entries.map((e) => (
            <div key={e.id} className="flex gap-2 py-[2.5px]" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <span style={{ color: "rgba(234,230,220,0.4)" }}>{e.time}</span>
              <span style={{ color: "hsl(var(--aqua) / 0.5)" }}>{e.code}</span>
              <span className="truncate" style={{ color: "hsl(var(--bone) / 0.32)" }}>{e.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep TelemetryLog`
Expected: no output.

- [ ] **Step 4: Manual verification**

With the dev server running and signed in as admin, mount `TelemetryLog` (this happens for real in Task 13) and, in a second tab, create or edit a script/video_edit row. Confirm a new line appears within ~1s. Confirm the Realtime channel is torn down (no console warnings about duplicate subscriptions) when the component unmounts.

- [ ] **Step 5: Commit**

```bash
git add src/components/command-deck/TelemetryLog.tsx
git commit -m "feat(ai): add TelemetryLog realtime activity panel"
```

---

## Task 9: `AttentionRadar` component

**Files:**
- Create: `src/components/command-deck/AttentionRadar.tsx`

**Interfaces:**
- Consumes: `useDeckMetrics` from `@/hooks/useDeckMetrics`; `resolveCssHsl` from `@/lib/commandDeck/cssColor`; `RadarBlip` type from `@/lib/commandDeck/deckMetrics`.
- Produces: `<AttentionRadar />`. Used by Task 13.

- [ ] **Step 1: Write the component**

```tsx
// src/components/command-deck/AttentionRadar.tsx
import { useEffect, useRef } from "react";
import { useDeckMetrics } from "@/hooks/useDeckMetrics";
import { resolveCssHsl } from "@/lib/commandDeck/cssColor";
import type { RadarBlip } from "@/lib/commandDeck/deckMetrics";

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function severityColor(sev: RadarBlip["severity"], aqua: string, honey: string, crit: string): string {
  if (sev === "crit") return crit;
  if (sev === "warn") return honey;
  return aqua;
}

export default function AttentionRadar() {
  const { radarBlips } = useDeckMetrics();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const blipsRef = useRef<RadarBlip[]>(radarBlips);
  blipsRef.current = radarBlips;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const aqua = resolveCssHsl("--aqua", "184 41% 70%");
    const honey = resolveCssHsl("--honey", "32 62% 61%");
    const crit = "hsl(4 68% 63%)"; // semantic critical red, intentionally not a brand accent (see dataviz guidance: semantic color is separate from the accent hue)

    let raf = 0;
    let sweep = 0;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas!.clientWidth;
      const h = canvas!.clientHeight;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw() {
      const w = canvas!.clientWidth;
      const h = canvas!.clientHeight;
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) / 2 - 4;
      ctx!.clearRect(0, 0, w, h);

      ctx!.strokeStyle = "rgba(143,208,213,0.14)";
      ctx!.lineWidth = 1;
      for (let g = 1; g <= 3; g++) {
        ctx!.beginPath();
        ctx!.arc(cx, cy, (R * g) / 3, 0, Math.PI * 2);
        ctx!.stroke();
      }

      const sweepGrad = ctx!.createRadialGradient(cx, cy, 0, cx, cy, R);
      sweepGrad.addColorStop(0, "rgba(143,208,213,0.26)");
      sweepGrad.addColorStop(1, "rgba(143,208,213,0)");
      ctx!.save();
      ctx!.translate(cx, cy);
      ctx!.rotate(sweep);
      ctx!.fillStyle = sweepGrad;
      ctx!.beginPath();
      ctx!.moveTo(0, 0);
      ctx!.arc(0, 0, R, -0.4, 0);
      ctx!.closePath();
      ctx!.fill();
      ctx!.restore();

      for (const b of blipsRef.current) {
        const bx = cx + Math.cos(b.angle) * R * b.radius;
        const by = cy + Math.sin(b.angle) * R * b.radius;
        const diff = Math.abs((((sweep % (Math.PI * 2)) - (b.angle < 0 ? b.angle + Math.PI * 2 : b.angle)) + Math.PI * 2) % (Math.PI * 2));
        const glow = diff < 0.5 ? smoothstep(1 - diff / 0.5) : 0;
        ctx!.fillStyle = severityColor(b.severity, aqua, honey, crit);
        ctx!.globalAlpha = 0.4 + glow * 0.6;
        ctx!.beginPath();
        ctx!.arc(bx, by, 2.4 + glow * 2.4, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.globalAlpha = 1;
      }

      sweep += 0.009;
      if (!reduceMotion) raf = requestAnimationFrame(draw);
    }

    resize();
    draw();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex items-center gap-2 font-mono text-[9.5px] uppercase"
        style={{ letterSpacing: "0.22em", color: "hsl(var(--aqua) / 0.5)" }}
      >
        <span
          className="inline-block w-1 h-1 rounded-full"
          style={{ background: "hsl(var(--aqua))", boxShadow: "0 0 6px hsl(var(--aqua) / 0.14)" }}
        />
        Attention Radar
      </div>
      <div className="relative w-[120px] h-[120px]">
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className="w-full h-full block"
          style={{ filter: "drop-shadow(0 0 5px hsl(var(--aqua) / 0.3)) drop-shadow(0 0 16px hsl(var(--aqua) / 0.14))" }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep AttentionRadar`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/components/command-deck/AttentionRadar.tsx
git commit -m "feat(ai): add AttentionRadar panel wired to real overdue/gap counts"
```

---

## Task 10: `VoiceWaveform` component

**Files:**
- Create: `src/components/command-deck/VoiceWaveform.tsx`

**Interfaces:**
- Consumes: `resolveCssHsl` from `@/lib/commandDeck/cssColor`. Takes a `listening: boolean` prop — driven by CommandCenter's existing `recognizing` state (Task 15 wires it; do not add a second speech-recognition listener here).
- Produces: `<VoiceWaveform listening: boolean />`. Used by Task 13/14.

- [ ] **Step 1: Write the component**

```tsx
// src/components/command-deck/VoiceWaveform.tsx
import { useEffect, useRef } from "react";
import { resolveCssHsl } from "@/lib/commandDeck/cssColor";

export default function VoiceWaveform({ listening }: { listening: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const listeningRef = useRef(listening);
  listeningRef.current = listening;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const aqua = resolveCssHsl("--aqua", "184 41% 70%");
    let raf = 0;
    let phase = 0;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas!.clientWidth;
      const h = canvas!.clientHeight;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw() {
      const w = canvas!.clientWidth;
      const h = canvas!.clientHeight;
      ctx!.clearRect(0, 0, w, h);
      const bars = Math.floor(w / 5);
      const amp = listeningRef.current ? 1 : 0.28; // idle: gentle ambient hum; listening: full swing
      for (let i = 0; i < bars; i++) {
        const v = Math.abs(Math.sin(i * 0.4 + phase) + Math.sin(i * 0.13 + phase * 1.7)) * 0.5 * amp;
        const bh = 2 + v * (h - 3);
        ctx!.fillStyle = aqua.replace("hsl(", "hsla(").replace(")", `, ${(0.22 + v * 0.5).toFixed(2)})`);
        ctx!.fillRect(i * 5, (h - bh) / 2, 2.2, bh);
      }
      phase += listeningRef.current ? 0.09 : 0.03;
      if (!reduceMotion) raf = requestAnimationFrame(draw);
    }

    resize();
    draw();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex items-center gap-2 font-mono text-[9.5px] uppercase"
        style={{ letterSpacing: "0.22em", color: "hsl(var(--aqua) / 0.5)" }}
      >
        <span
          className="inline-block w-1 h-1 rounded-full"
          style={{ background: "hsl(var(--aqua))", boxShadow: "0 0 6px hsl(var(--aqua) / 0.14)" }}
        />
        Voice
        <span className="ml-auto normal-case font-normal" style={{ letterSpacing: "0.08em", fontSize: 8, color: "hsl(var(--bone) / 0.3)" }}>
          {listening ? "Listening" : "Idle"}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="w-full h-[46px] block"
        style={{ filter: "drop-shadow(0 0 4px hsl(var(--aqua) / 0.28)) drop-shadow(0 0 12px hsl(var(--aqua) / 0.12))" }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep VoiceWaveform`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/components/command-deck/VoiceWaveform.tsx
git commit -m "feat(ai): add VoiceWaveform panel synced to dictation state"
```

---

## Task 11: `RollCallBar` component

**Files:**
- Create: `src/components/command-deck/RollCallBar.tsx`

**Interfaces:**
- Consumes: `displayName: string`, `companionName: string`, `listening: boolean` props.
- Produces: `<RollCallBar displayName companionName listening />`. Used by Task 13.

- [ ] **Step 1: Write the component**

```tsx
// src/components/command-deck/RollCallBar.tsx
export default function RollCallBar({
  displayName,
  companionName,
  listening,
}: {
  displayName: string;
  companionName: string;
  listening: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between gap-4 flex-wrap pt-2.5"
      style={{ borderTop: "1px solid rgba(255,255,255,0.07)", marginTop: 10 }}
    >
      <span
        className="flex items-center gap-2 font-mono text-[9px] uppercase"
        style={{ letterSpacing: "0.18em", color: "hsl(var(--aqua) / 0.5)" }}
      >
        <span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ background: "hsl(141 33% 61%)", boxShadow: "0 0 8px hsl(141 33% 61% / 0.6)" }}
        />
        Roll call
      </span>
      <div className="flex gap-2">
        <span className="flex items-center gap-1 font-mono text-[8.5px]" style={{ color: "hsl(var(--bone) / 0.3)" }}>
          <span className="w-1 h-1 rounded-full" style={{ background: "hsl(141 33% 61%)" }} />
          {displayName}
        </span>
        <span className="flex items-center gap-1 font-mono text-[8.5px]" style={{ color: "hsl(var(--bone) / 0.3)" }}>
          <span className="w-1 h-1 rounded-full" style={{ background: "hsl(var(--aqua))" }} />
          {companionName}
        </span>
      </div>
      <div className="flex gap-4">
        <span className="font-mono text-[8.5px] uppercase" style={{ letterSpacing: "0.1em", color: "hsl(var(--bone) / 0.3)" }}>
          {listening ? <b style={{ color: "hsl(var(--bone) / 0.56)" }}>Listening</b> : "Standby"}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep RollCallBar`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/components/command-deck/RollCallBar.tsx
git commit -m "feat(ai): add RollCallBar bottom status strip"
```

---

## Task 12: `CommandHeader` component

**Files:**
- Create: `src/components/command-deck/CommandHeader.tsx`

**Interfaces:**
- Consumes: `credits: number | null`, `autonomyLabel: string` props (credits may be `null` while loading — render an em dash).
- Produces: `<CommandHeader credits autonomyLabel />`. Used by Task 13.

- [ ] **Step 1: Write the component**

```tsx
// src/components/command-deck/CommandHeader.tsx
import { useEffect, useState } from "react";

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export default function CommandHeader({ credits, autonomyLabel }: { credits: number | null; autonomyLabel: string }) {
  const now = useClock();
  const p = (n: number) => String(n).padStart(2, "0");
  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const tzOffset = -now.getTimezoneOffset() / 60;

  return (
    <div
      className="flex items-start justify-between gap-5 flex-wrap pb-[11px]"
      style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
    >
      <div className="flex flex-col gap-[7px]">
        <div className="flex items-center gap-3">
          <div className="relative w-[26px] h-[26px] shrink-0">
            <span
              className="absolute inset-0 rounded-full"
              style={{ border: "1px solid hsl(var(--aqua) / 0.5)" }}
            />
            <span
              className="absolute inset-[6px] rounded-full"
              style={{ border: "1px solid hsl(var(--aqua))", boxShadow: "0 0 12px hsl(var(--aqua) / 0.14)" }}
            />
          </div>
          <div className="font-mono text-[12.5px] font-semibold uppercase" style={{ letterSpacing: "0.36em" }}>
            CONNECTA <b style={{ color: "hsl(var(--aqua))" }}>·</b> COMMAND
          </div>
        </div>
        <div className="flex gap-[6px] flex-wrap pl-[37px]">
          <span
            className="font-mono text-[8px] uppercase rounded-[5px] px-[7px] py-[2.5px]"
            style={{ letterSpacing: "0.13em", color: "hsl(var(--bone) / 0.56)", border: "1px solid rgba(255,255,255,0.12)" }}
          >
            Online
          </span>
          <span
            className="font-mono text-[8px] uppercase rounded-[5px] px-[7px] py-[2.5px]"
            style={{ letterSpacing: "0.13em", color: "hsl(var(--honey))", border: "1px solid hsl(var(--honey) / 0.4)" }}
          >
            Admin Clearance
          </span>
          <span
            className="font-mono text-[8px] uppercase rounded-[5px] px-[7px] py-[2.5px]"
            style={{ letterSpacing: "0.13em", color: "hsl(var(--bone) / 0.56)", border: "1px solid rgba(255,255,255,0.12)" }}
          >
            Autonomy: {autonomyLabel}
          </span>
        </div>
      </div>

      <div className="flex flex-col items-end gap-[3px] text-right">
        <div className="font-mono text-[24px] tabular-nums" style={{ letterSpacing: "0.03em", color: "hsl(var(--aqua))" }}>
          {p(now.getHours())}:{p(now.getMinutes())}:{p(now.getSeconds())}
        </div>
        <div className="font-mono text-[9.5px] uppercase" style={{ letterSpacing: "0.14em", color: "hsl(var(--bone) / 0.3)" }}>
          {days[now.getDay()]} {p(now.getDate())} {months[now.getMonth()]} · UTC{tzOffset >= 0 ? "+" : ""}
          {tzOffset}
        </div>
        <div className="flex gap-3.5 mt-1">
          <span className="font-mono text-[9px] uppercase" style={{ letterSpacing: "0.1em", color: "hsl(var(--bone) / 0.3)" }}>
            Credits <b style={{ color: "hsl(var(--bone) / 0.56)" }}>{credits === null ? "—" : credits.toLocaleString()}</b>
          </span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep CommandHeader`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/components/command-deck/CommandHeader.tsx
git commit -m "feat(ai): add CommandHeader boxless two-corner header"
```

---

## Task 13: `CommandDeckLayout` composition

**Files:**
- Create: `src/components/command-deck/CommandDeckLayout.tsx`

**Interfaces:**
- Consumes: `CommandHeader`, `SystemVitals`, `TelemetryLog`, `AttentionRadar`, `VoiceWaveform`, `RollCallBar` (all from Tasks 7–12).
- Produces: `<CommandDeckLayout credits autonomyLabel displayName companionName listening>{children}</CommandDeckLayout>` — a 3-column grid; `children` renders in the center column. Used by Task 15 (its markup is extended by Task 14 first).

- [ ] **Step 1: Write the component**

```tsx
// src/components/command-deck/CommandDeckLayout.tsx
import type { ReactNode } from "react";
import CommandHeader from "./CommandHeader";
import SystemVitals from "./SystemVitals";
import TelemetryLog from "./TelemetryLog";
import AttentionRadar from "./AttentionRadar";
import VoiceWaveform from "./VoiceWaveform";
import RollCallBar from "./RollCallBar";

export default function CommandDeckLayout({
  children,
  credits,
  autonomyLabel,
  displayName,
  companionName,
  listening,
}: {
  children: ReactNode;
  credits: number | null;
  autonomyLabel: string;
  displayName: string;
  companionName: string;
  listening: boolean;
}) {
  return (
    <div className="flex-1 flex flex-col min-h-0 px-4 py-3 gap-2.5">
      <CommandHeader credits={credits} autonomyLabel={autonomyLabel} />

      <div className="flex-1 grid gap-5 min-h-0 pt-2" style={{ gridTemplateColumns: "236px minmax(360px,1fr) 236px" }}>
        <div className="flex flex-col gap-[26px] pt-1.5 overflow-y-auto">
          <SystemVitals />
          <TelemetryLog />
        </div>

        <div className="flex flex-col min-h-0 relative">{children}</div>

        <div className="flex flex-col gap-[26px] pt-1.5 overflow-y-auto">
          <VoiceWaveform listening={listening} />
          <AttentionRadar />
        </div>
      </div>

      <RollCallBar displayName={displayName} companionName={companionName} listening={listening} />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep CommandDeckLayout`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/components/command-deck/CommandDeckLayout.tsx
git commit -m "feat(ai): add CommandDeckLayout 3-column grid composition"
```

---

## Task 14: Atmosphere layer + power-on choreography

**Files:**
- Create: `src/components/command-deck/command-deck.css`
- Modify: `src/components/command-deck/CommandDeckLayout.tsx` (import the CSS; render the vignette/grain/scan overlays; apply entrance classes to the header/side columns), `src/components/command-deck/CommandOrb.tsx` (apply the orb's power-on class)

**Interfaces:**
- Produces: CSS classes `cd-vignette`, `cd-grain`, `cd-scan`, `cd-fade-down`, `cd-fade-left`, `cd-fade-right`, `cd-orb-power-on`. Consumed by Task 15 indirectly (they're wired into `CommandDeckLayout`/`CommandOrb`, which Task 15 already composes — no direct action needed in Task 15 beyond what it already does).

- [ ] **Step 1: Write the CSS file**

```css
/* src/components/command-deck/command-deck.css */
/* Ambient depth for the Command Deck: a darkened-edge vignette, a very
   low-opacity film-grain texture, and an occasional soft light sweep —
   tuned down from earlier passes that read as an obvious scanline gimmick
   (see docs/superpowers/specs/2026-07-24-ai-command-deck-design.md). */

.cd-vignette {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  background: radial-gradient(120% 100% at 50% 38%, transparent 40%, rgba(0, 0, 0, 0.4) 78%, rgba(0, 0, 0, 0.62) 100%);
}

.cd-grain {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  opacity: 0.04;
  mix-blend-mode: overlay;
  background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/></filter><rect width="100%25" height="100%25" filter="url(%23n)"/></svg>');
  background-size: 140px 140px;
}

.cd-scan {
  position: fixed;
  left: 0;
  right: 0;
  height: 240px;
  z-index: 0;
  pointer-events: none;
  background: linear-gradient(
    180deg,
    transparent 0%,
    hsl(var(--aqua) / 0.014) 38%,
    hsl(var(--aqua) / 0.022) 50%,
    hsl(var(--aqua) / 0.014) 62%,
    transparent 100%
  );
  mix-blend-mode: screen;
  animation: cd-scan-move 17s cubic-bezier(0.45, 0, 0.55, 1) infinite;
}
@keyframes cd-scan-move {
  0% { top: -240px; }
  100% { top: 100vh; }
}

.cd-fade-down { animation: cd-fade-down 0.8s cubic-bezier(0.16, 0.8, 0.24, 1) both; }
@keyframes cd-fade-down {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: none; }
}

.cd-fade-left { animation: cd-fade-left 0.9s cubic-bezier(0.16, 0.8, 0.24, 1) 0.12s both; }
@keyframes cd-fade-left {
  from { opacity: 0; transform: translateX(-14px); }
  to { opacity: 1; transform: none; }
}

.cd-fade-right { animation: cd-fade-right 0.9s cubic-bezier(0.16, 0.8, 0.24, 1) 0.22s both; }
@keyframes cd-fade-right {
  from { opacity: 0; transform: translateX(14px); }
  to { opacity: 1; transform: none; }
}

.cd-orb-power-on {
  animation: cd-orb-power-on 1.4s cubic-bezier(0.16, 0.8, 0.24, 1) 0.08s both;
}
@keyframes cd-orb-power-on {
  from {
    opacity: 0;
    transform: scale(0.9);
    filter: blur(14px) drop-shadow(0 0 3px hsl(var(--aqua) / 0.3)) drop-shadow(0 0 10px hsl(var(--aqua) / 0.12));
  }
  to {
    opacity: 1;
    transform: scale(1);
    filter: blur(0px) drop-shadow(0 0 3px hsl(var(--aqua) / 0.3)) drop-shadow(0 0 10px hsl(var(--aqua) / 0.12));
  }
}

@media (prefers-reduced-motion: reduce) {
  .cd-scan {
    animation: none;
    display: none;
  }
  .cd-fade-down,
  .cd-fade-left,
  .cd-fade-right,
  .cd-orb-power-on {
    animation-duration: 0.01ms !important;
    animation-delay: 0s !important;
  }
}
```

- [ ] **Step 2: Wire the overlays and entrance classes into `CommandDeckLayout`**

In `src/components/command-deck/CommandDeckLayout.tsx`, add the import:
```tsx
import "./command-deck.css";
```
Render the three fixed overlays as the first children of the returned root `<div>` (they're `position: fixed`, so their placement in the tree doesn't affect layout — only paint order relative to other fixed/positioned elements, which doesn't matter here since nothing else is fixed):
```tsx
return (
  <div className="flex-1 flex flex-col min-h-0 px-4 py-3 gap-2.5">
    <div className="cd-vignette" />
    <div className="cd-grain" />
    <div className="cd-scan" />
    <div className="cd-fade-down">
      <CommandHeader credits={credits} autonomyLabel={autonomyLabel} />
    </div>

    <div className="flex-1 grid gap-5 min-h-0 pt-2" style={{ gridTemplateColumns: "236px minmax(360px,1fr) 236px" }}>
      <div className="cd-fade-left flex flex-col gap-[26px] pt-1.5 overflow-y-auto">
        <SystemVitals />
        <TelemetryLog />
      </div>

      <div className="flex flex-col min-h-0 relative">{children}</div>

      <div className="cd-fade-right flex flex-col gap-[26px] pt-1.5 overflow-y-auto">
        <VoiceWaveform listening={listening} />
        <AttentionRadar />
      </div>
    </div>

    <RollCallBar displayName={displayName} companionName={companionName} listening={listening} />
  </div>
);
```
(This replaces the previous plain `<div>` wrappers around the header and the two side columns from Task 13 with the same divs plus the new className.)

- [ ] **Step 3: Apply the orb's power-on class**

In `src/components/command-deck/CommandOrb.tsx`, add `cd-orb-power-on` to the canvas's `className`:
```tsx
<canvas
  ref={canvasRef}
  aria-hidden="true"
  className={[className, "cd-orb-power-on"].filter(Boolean).join(" ")}
  style={{
    /* ...unchanged... */
  }}
/>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -E "CommandDeckLayout|CommandOrb"`
Expected: no output.

- [ ] **Step 5: Manual verification**

Reload `/ai` as admin. Confirm: on load, the header drops in, the two side columns slide in from their edges, the orb fades up from a blurred/scaled-down state into full focus — all within about 1.5s, then settles. Confirm a very subtle vignette darkens the corners and a faint sweep of light occasionally passes down the page (should be barely noticeable, not an obvious scanline). In Chrome DevTools, enable "Emulate CSS prefers-reduced-motion: reduce" (Rendering tab) and reload — confirm the scan sweep is gone entirely and everything else appears instantly with no motion.

- [ ] **Step 6: Commit**

```bash
git add src/components/command-deck/command-deck.css src/components/command-deck/CommandDeckLayout.tsx src/components/command-deck/CommandOrb.tsx
git commit -m "feat(ai): add atmosphere layer and power-on choreography"
```

---

## Task 15: Wire the deck into `CommandCenter.tsx`

**Files:**
- Modify: `src/pages/CommandCenter.tsx` (imports near line 22-49; the `rightTab === "chat"` branch around line 1016-1020; the empty-state hero's `<FingerprintAvatar>` around line 1031)

**Interfaces:**
- Consumes: `CommandDeckLayout` (Task 13), `CommandOrb` (Task 4).

- [ ] **Step 1: Re-read the current chat-branch render to confirm line numbers haven't shifted**

Read `src/pages/CommandCenter.tsx` from roughly line 1010 to 1220 fresh (this file may have changed since Tasks 1-13 were written — do not trust the line numbers below blindly, locate the actual JSX by content).

- [ ] **Step 2: Add imports**

Near the existing imports (around line 48-49), add:
```tsx
import CommandDeckLayout from "@/components/command-deck/CommandDeckLayout";
import CommandOrb from "@/components/command-deck/CommandOrb";
```

- [ ] **Step 3: Wrap the chat-tab branch in `CommandDeckLayout`**

Find:
```tsx
{rightTab === "chat" ? (
  <>
    {/* Chat column ... */}
    <main className="flex-1 flex flex-col min-w-0 min-h-0">
```
Change the opening to wrap `<main>` (and its full existing subtree, unchanged) inside `CommandDeckLayout`:
```tsx
{rightTab === "chat" ? (
  <CommandDeckLayout
    credits={null}
    autonomyLabel={autonomyMode ? autonomyMode.toUpperCase() : "ASK"}
    displayName={displayName || "Admin"}
    companionName={companionName || "Robby"}
    listening={recognizing}
  >
    <main className="flex-1 flex flex-col min-w-0 min-h-0">
```
And its closing `</>` becomes `</CommandDeckLayout>`. (Check the actual variable names for `autonomyMode`, `displayName`, `companionName` in the file — they exist under different names in the current code; grep for `displayName` and `companion` in `CommandCenter.tsx` and use whatever is already there rather than inventing new state. If `credits` isn't currently loaded anywhere in this file, pass `null` for now — it renders as "—" per `CommandHeader`'s design — do not add a new credits fetch in this task; that belongs with the Agency Goals follow-on plan.)

- [ ] **Step 4: Swap the static avatar for the orb**

Find:
```tsx
<FingerprintAvatar size="md" tone="light" animated />
```
inside the empty-state hero block, and replace with:
```tsx
<CommandOrb />
```
Leave the `FingerprintAvatar` import in place if it's still used elsewhere in the file (grep to confirm before removing the import — it's also used for message avatars in the active-chat view).

- [ ] **Step 5: Typecheck**

Run: `npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep CommandCenter`
Expected: no output.

- [ ] **Step 6: Manual verification**

Start the dev server, sign in as admin, visit `/ai`. Confirm:
- The full deck renders: header with clock ticking, left column (System Vitals with real numbers, Telemetry log), center orb rotating with the greeting/composer beneath it, right column (Voice waveform, Attention Radar), bottom roll call bar.
- Toggling the mic (existing dictation button) flips the Voice panel's "Idle"/"Listening" label and the roll call bar's status.
- Sending a message still works exactly as before — the chat takes over the center, `AssistantChat` renders normally, nothing in the existing send/stream/thread logic was touched.
- Switching to the Tasks tab still renders exactly as it did before this plan (untouched).
- Resize the window down to a narrow viewport and confirm the layout doesn't break (the grid `minmax` should reflow reasonably; note in a follow-up if it doesn't — full responsive tuning wasn't a specific ask in the spec but shouldn't be broken).

- [ ] **Step 7: Run the full test suite**

Run: `npm run test`
Expected: all existing tests plus the new `cssColor`, `fibonacciSphere`, and `deckMetrics` tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/pages/CommandCenter.tsx
git commit -m "feat(ai): compose the Command Deck into /ai, replacing the static hero"
```

---

## Deferred to the next plan

Not built here — tracked in the design spec and left for a follow-on plan once this shell has shipped and been used for a bit:

- **Header objective line** (e.g. "$50,000 MRR · 50 outbound/day · grow views across roster") — omitted from `CommandHeader` in this plan rather than hardcoded, since its content depends on the revenue-goal and outbound-daily-target settings below, which don't exist yet.
- **Diagnostics ticker** (Client Intel views leaderboard / Strategy Health / Agency Goals rotating channel) — needs the fleet-wide `fulfillmentScore()` aggregation and the agency revenue-goal setting.
- **Outbound Pace gauge + quick-log** — needs the new daily-granularity outbound log table.
- **Action surface pattern** + the revision-review reference implementation.
- **Past-deadline radar category** — `useDeckMetrics` currently ships with only 2 of the 3 radar categories live (needs-revisions, empty-calendar-days); "past deadline" needs a verified read of `video_edits.deadline` semantics before it's added as the third.
- Phase 2 (Realtime voice) per the design spec — entirely separate infra (`realtime-voice` edge function, WebRTC, hybrid tool bridge).
