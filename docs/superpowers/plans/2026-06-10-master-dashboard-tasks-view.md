# Master Dashboard Tasks View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deadline-driven "Tasks" view to the admin master dashboard (alongside the existing per-client "Clients" view), turning per-client pipeline milestones into one by-when agenda, and fix the dark card-bleed bug.

**Architecture:** A pure transform (`buildAgenda`) flattens every client's existing triage rows into milestone "tasks", folds status counts into matching deadlines, and buckets them into urgency lanes. Two small presentational components render lanes/items; a segmented toggle (persisted to `localStorage`) switches between the unchanged Clients view and the new Tasks view inside `AdminTriageView`.

**Tech Stack:** React + TypeScript, framer-motion (already used), lucide-react icons, Vite. Pure logic tested with vitest (added here — the frontend has no runner yet).

**Base:** worktree `feat/master-dashboard-tasks-view` off `origin/main`. Spec: `docs/superpowers/specs/2026-06-10-master-dashboard-tasks-view-design.md`.

**Conventions to honor (from repo memory):**
- App-surface code uses branding tokens (`hsl(var(--ink-on-cream))`, `hsl(var(--cream))`), NOT raw palette hex — the pre-commit hook blocks `#141414/#EAE6DC/...`. The monogram palette hex (`#C5882F` etc.) and the accent hex `#A85B1F`/`#2F6B62` are already allowed/used in these files; reuse the existing constants, don't add new blocked hex.
- CI runs `vite build` only (no tsc). Verify types with `npx tsc --noEmit` by EXIT CODE before claiming done.

---

## File Structure

**New:**
- `src/lib/triage/clientMonogram.ts` — shared `colorFor` + `initials` (extracted from `TriageClientBlock`).
- `src/lib/triage/buildAgenda.ts` — pure transform: rows → urgency lanes.
- `src/lib/triage/buildAgenda.test.ts` — unit tests for the transform.
- `src/lib/triage/buildPipelineRows.test.ts` — unit tests for the per-milestone window.
- `src/components/dashboard/AgendaItem.tsx` — one agenda row.
- `src/components/dashboard/AgendaLane.tsx` — sticky lane header + its items.
- `src/components/dashboard/MasterViewToggle.tsx` — segmented Clients/Tasks control.

**Modified:**
- `src/lib/triage/buildPipelineRows.ts` — per-milestone window (filming/onboarding 10d).
- `src/components/dashboard/TriageClientBlock.tsx` — use shared monogram helpers.
- `src/pages/Dashboard.tsx` — toggle + Tasks branch + full-height cream wrapper (bug fix).
- `package.json` — add `vitest` devDep + `test` script.

---

## Task 1: Add a test runner (vitest)

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install vitest**

Run: `npm install -D vitest@^2.0.5`
Expected: `package.json` gains `vitest` under devDependencies; exit 0.

- [ ] **Step 2: Add the test script**

In `package.json`, add to `"scripts"` (after `"lint": "eslint .",`):

```json
    "test": "vitest run",
```

- [ ] **Step 3: Sanity test that the alias + runner work**

Create `src/lib/triage/buildPipelineRows.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildPipelineRows } from "@/lib/triage/buildPipelineRows";

describe("vitest wiring", () => {
  it("buildPipelineRows returns [] for null source", () => {
    expect(buildPipelineRows(null)).toEqual([]);
  });
});
```

- [ ] **Step 4: Run it**

Run: `npx vitest run src/lib/triage/buildPipelineRows.test.ts`
Expected: 1 passing test. (Vitest auto-reads `vite.config.ts`, so the `@/` alias resolves.)

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/lib/triage/buildPipelineRows.test.ts
git commit -m "test: add vitest runner for frontend pure logic"
```

---

## Task 2: Extract shared monogram helpers

`colorFor` and `initials` currently live privately in `TriageClientBlock.tsx`. The agenda needs the same logic; extract to a shared module and have the block re-use it (DRY).

**Files:**
- Create: `src/lib/triage/clientMonogram.ts`
- Create: `src/lib/triage/clientMonogram.test.ts`
- Modify: `src/components/dashboard/TriageClientBlock.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/lib/triage/clientMonogram.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { colorFor, initials, MONOGRAM_PALETTE } from "@/lib/triage/clientMonogram";

describe("clientMonogram", () => {
  it("colorFor is deterministic and returns a palette slot", () => {
    const a = colorFor("Dr Calvin's Clinic");
    const b = colorFor("Dr Calvin's Clinic");
    expect(a).toEqual(b);
    expect(MONOGRAM_PALETTE).toContainEqual(a);
  });

  it("initials uses first two words when present", () => {
    expect(initials("Master Construction")).toBe("MC");
  });

  it("initials strips apostrophes and falls back to first two chars", () => {
    expect(initials("Spencer")).toBe("SP");
    expect(initials("Dr Calvin's Clinic")).toBe("DC");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/triage/clientMonogram.test.ts`
Expected: FAIL — cannot resolve `@/lib/triage/clientMonogram`.

- [ ] **Step 3: Create the module**

Create `src/lib/triage/clientMonogram.ts` (verbatim move of the existing helpers):

```ts
// src/lib/triage/clientMonogram.ts
//
// Deterministic monogram avatar fallback shared by the dashboard Clients and
// Tasks views: a hashed palette color + 2-letter initials for a client name.

export interface Monogram { bg: string; fg: string; }

// Picks one slot per client-name hash. These hex values are the allowed
// monogram palette (not blocked by the branding pre-commit hook).
export const MONOGRAM_PALETTE: Monogram[] = [
  { bg: '#C5882F', fg: '#FFFFFF' },  // honey
  { bg: '#2F6B62', fg: '#FFFFFF' },  // pine
  { bg: '#7C5BAE', fg: '#FFFFFF' },  // violet
  { bg: '#B23A2A', fg: '#FFFFFF' },  // brick
  { bg: '#1F4D72', fg: '#FFFFFF' },  // navy
  { bg: '#3D7846', fg: '#FFFFFF' },  // forest
  { bg: 'hsl(var(--ink-on-cream))', fg: 'hsl(var(--cream))' },  // ink
];

export function colorFor(name: string): Monogram {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return MONOGRAM_PALETTE[Math.abs(h) % MONOGRAM_PALETTE.length];
}

export function initials(name: string): string {
  const cleaned = name.replace(/['']/g, '').trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return cleaned.slice(0, 2).toUpperCase();
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/triage/clientMonogram.test.ts`
Expected: 3 passing tests.

- [ ] **Step 5: Refactor `TriageClientBlock` to use the shared helpers**

In `src/components/dashboard/TriageClientBlock.tsx`:

- Add import near the top (with the other imports):

```ts
import { colorFor, initials } from "@/lib/triage/clientMonogram";
```

- DELETE the local `MONOGRAM_PALETTE` array, the local `colorFor` function, and the local `initials` function (the block of lines from `// Deterministic monogram palette …` through the end of `function initials(...) { … }`). Leave the rest of the component (which calls `colorFor(client.name)` and `initials(client.name)`) untouched.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0 (no errors).

- [ ] **Step 7: Commit**

```bash
git add src/lib/triage/clientMonogram.ts src/lib/triage/clientMonogram.test.ts src/components/dashboard/TriageClientBlock.tsx
git commit -m "refactor(dashboard): extract shared client monogram helpers"
```

---

## Task 3: Per-milestone prep window in `buildPipelineRows`

Filming and onboarding should surface earlier (10 days) than the rest (7) so the operator has time to prepare. Keep `windowDays` as the base window for backward compatibility with `useTriageRows`.

**Files:**
- Modify: `src/lib/triage/buildPipelineRows.ts`
- Modify: `src/lib/triage/buildPipelineRows.test.ts`

- [ ] **Step 1: Write the failing tests**

Replace the contents of `src/lib/triage/buildPipelineRows.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { buildPipelineRows, type PipelineSource } from "@/lib/triage/buildPipelineRows";

const NOW = new Date("2026-06-10T12:00:00Z");
function daysFromNow(n: number): string {
  return new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000).toISOString();
}
const empty: PipelineSource = {
  onboarding_call_at: null, script_due_at: null, editing_due_at: null,
  next_filming_at: null, boosting_at: null, posting_at: null, ads_budget: null,
};

describe("buildPipelineRows windowing", () => {
  it("returns [] for null source", () => {
    expect(buildPipelineRows(null)).toEqual([]);
  });

  it("excludes a script due 9 days out (base 7d window)", () => {
    const src = { ...empty, script_due_at: daysFromNow(9) };
    const rows = buildPipelineRows(src, { windowDays: 7, now: NOW });
    expect(rows.find((r) => r.milestone === "script_due")).toBeUndefined();
  });

  it("INCLUDES a filming 9 days out (10d prep window)", () => {
    const src = { ...empty, next_filming_at: daysFromNow(9) };
    const rows = buildPipelineRows(src, { windowDays: 7, now: NOW });
    expect(rows.find((r) => r.milestone === "filming")).toBeDefined();
  });

  it("INCLUDES an onboarding call 9 days out (10d prep window)", () => {
    const src = { ...empty, onboarding_call_at: daysFromNow(9) };
    const rows = buildPipelineRows(src, { windowDays: 7, now: NOW });
    expect(rows.find((r) => r.milestone === "onboarding_call")).toBeDefined();
  });

  it("excludes filming 11 days out (beyond 10d)", () => {
    const src = { ...empty, next_filming_at: daysFromNow(11) };
    const rows = buildPipelineRows(src, { windowDays: 7, now: NOW });
    expect(rows.find((r) => r.milestone === "filming")).toBeUndefined();
  });

  it("excludes past dates", () => {
    const src = { ...empty, script_due_at: daysFromNow(-1) };
    expect(buildPipelineRows(src, { windowDays: 7, now: NOW })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/triage/buildPipelineRows.test.ts`
Expected: FAIL — filming/onboarding 9-days-out cases fail (currently windowed at 7).

- [ ] **Step 3: Implement the per-milestone window**

In `src/lib/triage/buildPipelineRows.ts`, replace the body of the `for` loop's cutoff logic. Specifically, after the `const FIELDS: FieldMap[] = [...]` array, add a prep-window constant:

```ts
// Filming + onboarding need lead time to prepare — surface them earlier.
const PREP_WINDOW_DAYS = 10;
const PREP_MILESTONES: ReadonlySet<PipelineMilestone> = new Set(['filming', 'onboarding_call']);
```

Then inside `buildPipelineRows`, replace the single `cutoff` with a per-milestone cutoff. Change:

```ts
  const cutoff = now.getTime() + windowDays * 24 * 60 * 60 * 1000;
  const nowMs = now.getTime();
```

to:

```ts
  const nowMs = now.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const cutoffFor = (m: PipelineMilestone) =>
    nowMs + (PREP_MILESTONES.has(m) ? Math.max(windowDays, PREP_WINDOW_DAYS) : windowDays) * dayMs;
```

And in the loop, change the guard:

```ts
    if (Number.isNaN(t) || t < nowMs || t > cutoff) continue;
```

to:

```ts
    if (Number.isNaN(t) || t < nowMs || t > cutoffFor(milestone)) continue;
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/triage/buildPipelineRows.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/triage/buildPipelineRows.ts src/lib/triage/buildPipelineRows.test.ts
git commit -m "feat(triage): 10-day prep window for filming and onboarding"
```

---

## Task 4: The `buildAgenda` transform (core logic)

**Files:**
- Create: `src/lib/triage/buildAgenda.ts`
- Create: `src/lib/triage/buildAgenda.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/triage/buildAgenda.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildAgenda } from "@/lib/triage/buildAgenda";
import type { TriageClient, TriageRowsByClient } from "@/lib/triage/types";

const NOW = new Date("2026-06-10T12:00:00Z");
function at(n: number): string {
  return new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000).toISOString();
}
const clients: TriageClient[] = [
  { id: "c1", name: "Dr Calvin's Clinic" },
  { id: "c2", name: "Master Construction" },
];

function lane(agenda: ReturnType<typeof buildAgenda>, key: string) {
  return agenda.find((l) => l.key === key);
}

describe("buildAgenda", () => {
  it("returns no lanes for empty input", () => {
    expect(buildAgenda([], {}, NOW)).toEqual([]);
  });

  it("buckets an overdue editing deadline into the overdue lane", () => {
    const rows: TriageRowsByClient = {
      c2: [{ type: "pipeline", milestone: "editing_due", at: at(-2) }],
    };
    const agenda = buildAgenda(clients, rows, NOW);
    const overdue = lane(agenda, "overdue");
    expect(overdue?.items[0].verb).toBe("Lock the edit");
    expect(overdue?.items[0].clientName).toBe("Master Construction");
  });

  it("folds a matching scripts_review count into the script_due item", () => {
    const rows: TriageRowsByClient = {
      c1: [
        { type: "pipeline", milestone: "script_due", at: at(3) },
        { type: "scripts_review", count: 3, sampleNames: [], oldestPendingAt: at(-1) },
      ],
    };
    const agenda = buildAgenda(clients, rows, NOW);
    const items = agenda.flatMap((l) => l.items);
    const scriptItems = items.filter((i) => i.clientId === "c1");
    // one merged item, not two
    expect(scriptItems).toHaveLength(1);
    expect(scriptItems[0].verb).toBe("Write & send script");
    expect(scriptItems[0].count).toBe(3);
    expect(scriptItems[0].countLabel).toBe("3 ready for review");
  });

  it("keeps an unpaired scripts_review as its own dated item", () => {
    const rows: TriageRowsByClient = {
      c1: [{ type: "scripts_review", count: 2, sampleNames: [], oldestPendingAt: at(-1) }],
    };
    const agenda = buildAgenda(clients, rows, NOW);
    const items = agenda.flatMap((l) => l.items);
    expect(items).toHaveLength(1);
    expect(items[0].verb).toBe("Review scripts");
    expect(items[0].count).toBe(2);
  });

  it("marks filming and onboarding as prep", () => {
    const rows: TriageRowsByClient = {
      c1: [{ type: "pipeline", milestone: "filming", at: at(1) }],
    };
    const agenda = buildAgenda(clients, rows, NOW);
    const item = agenda.flatMap((l) => l.items)[0];
    expect(item.isPrep).toBe(true);
    expect(item.verb).toBe("Prep the shoot");
  });

  it("orders lanes overdue→today→tomorrow→thisweek→later and sorts within", () => {
    const rows: TriageRowsByClient = {
      c1: [
        { type: "pipeline", milestone: "posting", at: at(0.1) },     // today
        { type: "pipeline", milestone: "script_due", at: at(4) },    // this week
        { type: "pipeline", milestone: "editing_due", at: at(-1) },  // overdue
      ],
    };
    const agenda = buildAgenda(clients, rows, NOW);
    expect(agenda.map((l) => l.key)).toEqual(["overdue", "today", "thisweek"]);
  });

  it("carries the boosting budget label as context", () => {
    const rows: TriageRowsByClient = {
      c1: [{ type: "pipeline", milestone: "boosting", at: at(3), label: "$400 budget" }],
    };
    const item = buildAgenda(clients, rows, NOW).flatMap((l) => l.items)[0];
    expect(item.verb).toBe("Set up boost");
    expect(item.context).toBe("$400 budget");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/triage/buildAgenda.test.ts`
Expected: FAIL — cannot resolve `@/lib/triage/buildAgenda`.

- [ ] **Step 3: Implement `buildAgenda`**

Create `src/lib/triage/buildAgenda.ts`:

```ts
// src/lib/triage/buildAgenda.ts
//
// Pure transform powering the dashboard "Tasks" view. Flattens every client's
// triage rows into milestone "tasks", folds status counts into their matching
// deadline, and groups the result into urgency lanes (soonest first).

import { relativeDate, type RelativeBucket } from "./relativeDate";
import type {
  TriageClient,
  TriageRow,
  TriageRowsByClient,
  PipelineMilestone,
} from "./types";

export type AgendaLaneKey = "overdue" | "today" | "tomorrow" | "thisweek" | "later";

export type AgendaKind =
  | PipelineMilestone
  | "scripts_review"
  | "videos_revision"
  | "posts_scheduled";

export interface AgendaItem {
  key: string;            // `${clientId}:${kind}` — stable React key
  clientId: string;
  clientName: string;
  kind: AgendaKind;
  verb: string;
  sortDate: string;       // ISO
  chipLabel: string;
  bucket: RelativeBucket;
  href: string;
  isPrep: boolean;
  count?: number;
  countLabel?: string;
  context?: string;
}

export interface AgendaLane {
  key: AgendaLaneKey;
  label: string;
  items: AgendaItem[];
}

const LANE_ORDER: AgendaLaneKey[] = ["overdue", "today", "tomorrow", "thisweek", "later"];
const LANE_LABEL: Record<AgendaLaneKey, string> = {
  overdue: "Overdue",
  today: "Today",
  tomorrow: "Tomorrow",
  thisweek: "This week",
  later: "Later",
};

function laneFor(bucket: RelativeBucket): AgendaLaneKey {
  switch (bucket) {
    case "overdue": return "overdue";
    case "soon":
    case "today": return "today";
    case "tomorrow": return "tomorrow";
    case "thisweek": return "thisweek";
    case "twoweeks":
    case "farfuture": return "later";
  }
}

const PREP_MILESTONES: ReadonlySet<AgendaKind> = new Set(["filming", "onboarding_call"]);

// Count row types and the pipeline milestone each folds into.
const COUNT_FOLD: Record<"scripts_review" | "videos_revision" | "posts_scheduled", PipelineMilestone> = {
  scripts_review: "script_due",
  videos_revision: "editing_due",
  posts_scheduled: "posting",
};

function hrefFor(kind: AgendaKind, clientId: string): string {
  switch (kind) {
    case "script_due":
    case "scripts_review":  return `/clients/${clientId}/scripts?filter=needs_review`;
    case "editing_due":
    case "videos_revision": return `/clients/${clientId}/editing-queue?status=Needs%20Revisions`;
    case "posting":
    case "posts_scheduled": return `/clients/${clientId}/content-calendar?window=upcoming`;
    default:                return `/clients/${clientId}/strategy#pipeline`;
  }
}

function pipelineVerb(m: PipelineMilestone): { verb: string; context?: string } {
  switch (m) {
    case "onboarding_call": return { verb: "Onboarding call", context: "review intake first" };
    case "script_due":      return { verb: "Write & send script" };
    case "filming":         return { verb: "Prep the shoot", context: "shot list + confirm talent" };
    case "editing_due":     return { verb: "Lock the edit" };
    case "boosting":        return { verb: "Set up boost" };
    case "posting":         return { verb: "Confirm posting" };
  }
}

function countMeta(kind: "scripts_review" | "videos_revision" | "posts_scheduled", count: number) {
  switch (kind) {
    case "scripts_review":  return { verb: "Review scripts",   countLabel: `${count} ready for review` };
    case "videos_revision": return { verb: "Edits in revision", countLabel: `${count} in revision` };
    case "posts_scheduled": return { verb: "Posts scheduled",  countLabel: `${count} scheduled` };
  }
}

function countDate(row: Extract<TriageRow, { type: "scripts_review" | "videos_revision" | "posts_scheduled" }>): string {
  return row.type === "posts_scheduled" ? row.nextAt : row.oldestPendingAt;
}

export function buildAgenda(
  clients: TriageClient[],
  rowsByClient: TriageRowsByClient,
  now: Date = new Date(),
): AgendaLane[] {
  const nameById = new Map(clients.map((c) => [c.id, c.name]));
  const items: AgendaItem[] = [];

  for (const client of clients) {
    const rows = rowsByClient[client.id] ?? [];
    const clientName = nameById.get(client.id) ?? client.name;

    // Index pipeline milestones and count rows for this client.
    const pipelineByMilestone = new Map<PipelineMilestone, Extract<TriageRow, { type: "pipeline" }>>();
    const countRows: Array<Extract<TriageRow, { type: "scripts_review" | "videos_revision" | "posts_scheduled" }>> = [];
    for (const row of rows) {
      if (row.type === "pipeline") pipelineByMilestone.set(row.milestone, row);
      else countRows.push(row);
    }

    const consumedCountTypes = new Set<string>();

    // 1) Pipeline milestones → items (folding the matching count when present).
    for (const [milestone, row] of pipelineByMilestone) {
      const { verb, context: baseContext } = pipelineVerb(milestone);
      const rel = relativeDate(row.at, now);
      const folded = (Object.keys(COUNT_FOLD) as Array<keyof typeof COUNT_FOLD>)
        .find((ct) => COUNT_FOLD[ct] === milestone);
      let count: number | undefined;
      let countLabel: string | undefined;
      if (folded) {
        const cr = countRows.find((c) => c.type === folded);
        if (cr) {
          consumedCountTypes.add(folded);
          count = cr.count;
          countLabel = countMeta(folded, cr.count).countLabel;
        }
      }
      items.push({
        key: `${client.id}:${milestone}`,
        clientId: client.id,
        clientName,
        kind: milestone,
        verb,
        sortDate: row.at,
        chipLabel: rel.label,
        bucket: rel.bucket,
        href: hrefFor(milestone, client.id),
        isPrep: PREP_MILESTONES.has(milestone),
        count,
        countLabel,
        context: row.label ?? baseContext,
      });
    }

    // 2) Unpaired count rows → their own items, dated by their aging timestamp.
    for (const cr of countRows) {
      if (consumedCountTypes.has(cr.type)) continue;
      const date = countDate(cr);
      const rel = relativeDate(date, now);
      const { verb, countLabel } = countMeta(cr.type, cr.count);
      items.push({
        key: `${client.id}:${cr.type}`,
        clientId: client.id,
        clientName,
        kind: cr.type,
        verb,
        sortDate: date,
        chipLabel: rel.label,
        bucket: rel.bucket,
        href: hrefFor(cr.type, client.id),
        isPrep: false,
        count: cr.count,
        countLabel,
      });
    }
  }

  // Group into lanes, sort within by date, drop empty lanes, keep lane order.
  const byLane = new Map<AgendaLaneKey, AgendaItem[]>();
  for (const item of items) {
    const lane = laneFor(item.bucket);
    const arr = byLane.get(lane) ?? [];
    arr.push(item);
    byLane.set(lane, arr);
  }

  const lanes: AgendaLane[] = [];
  for (const key of LANE_ORDER) {
    const laneItems = byLane.get(key);
    if (!laneItems || laneItems.length === 0) continue;
    laneItems.sort((a, b) => new Date(a.sortDate).getTime() - new Date(b.sortDate).getTime());
    lanes.push({ key, label: LANE_LABEL[key], items: laneItems });
  }
  return lanes;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/triage/buildAgenda.test.ts`
Expected: all 7 tests pass.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/triage/buildAgenda.ts src/lib/triage/buildAgenda.test.ts
git commit -m "feat(triage): buildAgenda transform for by-when Tasks view"
```

---

## Task 5: `AgendaItem` component

**Files:**
- Create: `src/components/dashboard/AgendaItem.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/dashboard/AgendaItem.tsx`:

```tsx
// src/components/dashboard/AgendaItem.tsx
//
// One row in the dashboard Tasks agenda: milestone icon tile · verb (+ PREP) /
// client avatar + name + folded count · relative-date chip. Links to the same
// destination the per-client triage rows use.

import { Link } from "react-router-dom";
import {
  FileText, Film, Send, PhoneCall, PenLine, Scissors, Camera, TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { ClientAvatar } from "./ClientAvatar";
import { colorFor, initials } from "@/lib/triage/clientMonogram";
import type { RelativeBucket } from "@/lib/triage/relativeDate";
import type { AgendaItem as AgendaItemData, AgendaKind } from "@/lib/triage/buildAgenda";

const KIND_ICON: Record<AgendaKind, LucideIcon> = {
  onboarding_call: PhoneCall,
  script_due:      PenLine,
  editing_due:     Scissors,
  filming:         Camera,
  boosting:        TrendingUp,
  posting:         Send,
  scripts_review:  FileText,
  videos_revision: Film,
  posts_scheduled: Send,
};

// Tile + chip tint per urgency bucket (mirrors TriageRow's palette).
const BUCKET_TINT: Record<RelativeBucket, { bg: string; fg: string }> = {
  overdue:   { bg: 'rgba(178,58,42,0.12)',  fg: '#B23A2A' },
  soon:      { bg: 'rgba(197,136,47,0.14)', fg: '#A85B1F' },
  today:     { bg: 'rgba(197,136,47,0.14)', fg: '#A85B1F' },
  tomorrow:  { bg: 'hsl(var(--ink-on-cream) / 0.06)', fg: 'hsl(var(--ink-on-cream))' },
  thisweek:  { bg: 'hsl(var(--ink-on-cream) / 0.06)', fg: 'hsl(var(--ink-on-cream))' },
  twoweeks:  { bg: 'hsl(var(--ink-on-cream) / 0.06)', fg: 'hsl(var(--ink-on-cream) / 0.7)' },
  farfuture: { bg: 'hsl(var(--ink-on-cream) / 0.05)', fg: 'hsl(var(--ink-on-cream) / 0.55)' },
};

function rowHoverIn(e: React.MouseEvent<HTMLAnchorElement>) {
  e.currentTarget.style.transform = 'translateY(-1px)';
  e.currentTarget.style.boxShadow = '0 10px 26px hsl(var(--ink-on-cream) / 0.06)';
}
function rowHoverOut(e: React.MouseEvent<HTMLAnchorElement>) {
  e.currentTarget.style.transform = 'none';
  e.currentTarget.style.boxShadow = 'none';
}

export function AgendaItem({ item }: { item: AgendaItemData }) {
  const Icon = KIND_ICON[item.kind];
  const tint = BUCKET_TINT[item.bucket];
  const mono = colorFor(item.clientName);

  return (
    <Link
      to={item.href}
      className="flex items-center gap-3 rounded-[13px] transition-all"
      style={{
        textDecoration: 'none',
        background: 'rgba(255,255,255,0.62)',
        border: '1px solid hsl(var(--ink-on-cream) / 0.07)',
        padding: '12px 14px',
        marginBottom: 9,
      }}
      onMouseEnter={rowHoverIn}
      onMouseLeave={rowHoverOut}
    >
      <div
        className="flex items-center justify-center shrink-0"
        style={{ width: 36, height: 36, borderRadius: 10, background: tint.bg }}
      >
        <Icon size={17} color={tint.fg} strokeWidth={1.75} />
      </div>

      <div className="flex-1 min-w-0">
        <div
          className="flex items-center gap-2"
          style={{ fontFamily: "var(--font-display, 'EB Garamond'), Georgia, serif", fontSize: 16, color: 'hsl(var(--ink-on-cream))', lineHeight: 1.15 }}
        >
          <span className="truncate">{item.verb}</span>
          {item.isPrep && (
            <span
              style={{
                fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', color: '#A85B1F',
                background: 'rgba(197,136,47,0.18)', padding: '2px 7px', borderRadius: 999, flexShrink: 0,
              }}
            >
              PREP
            </span>
          )}
        </div>
        <div
          className="flex items-center gap-1.5 mt-0.5 min-w-0"
          style={{ fontSize: 12, color: 'hsl(var(--ink-on-cream) / 0.55)', fontFamily: 'var(--font-body, Figtree), sans-serif' }}
        >
          <ClientAvatar
            picUrl={undefined}
            alt={item.clientName}
            size={17}
            fallback={
              <span
                style={{
                  width: 17, height: 17, borderRadius: 999, background: mono.bg, color: mono.fg,
                  fontFamily: "var(--font-display, 'EB Garamond'), Georgia, serif", fontSize: 8, fontWeight: 600,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}
              >
                {initials(item.clientName)}
              </span>
            }
            style={{ width: 17, height: 17 }}
          />
          <span className="truncate">{item.clientName}</span>
          {item.countLabel && (
            <>
              <span aria-hidden>·</span>
              <span style={{ color: '#A85B1F', fontWeight: 600, flexShrink: 0 }}>{item.countLabel}</span>
            </>
          )}
          {!item.countLabel && item.context && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{item.context}</span>
            </>
          )}
        </div>
      </div>

      <span
        style={{
          fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 999,
          whiteSpace: 'nowrap', background: tint.bg, color: tint.fg, flexShrink: 0,
        }}
      >
        {item.chipLabel}
      </span>
    </Link>
  );
}
```

> Note: `picUrl` is wired through in Task 7 (the lane passes a `picUrl` map). For now it's `undefined`, exercising the initials fallback. We replace this with a real prop in Task 6.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/AgendaItem.tsx
git commit -m "feat(dashboard): AgendaItem row for Tasks view"
```

---

## Task 6: `AgendaLane` component (with avatar wiring)

**Files:**
- Create: `src/components/dashboard/AgendaLane.tsx`
- Modify: `src/components/dashboard/AgendaItem.tsx` (accept a real `picUrl`)

- [ ] **Step 1: Give `AgendaItem` a real `picUrl` prop**

In `src/components/dashboard/AgendaItem.tsx`:

- Change the signature line:

```tsx
export function AgendaItem({ item }: { item: AgendaItemData }) {
```

to:

```tsx
export function AgendaItem({ item, picUrl }: { item: AgendaItemData; picUrl?: string | null }) {
```

- Change the `ClientAvatar` `picUrl={undefined}` line to:

```tsx
            picUrl={picUrl}
```

- [ ] **Step 2: Create the lane**

Create `src/components/dashboard/AgendaLane.tsx`:

```tsx
// src/components/dashboard/AgendaLane.tsx
//
// One urgency lane in the Tasks agenda: a sticky label + hairline rule, then
// its items. The parent supplies the client_id -> profile-pic map so each item
// can show the client's photo (initials fallback).

import { AgendaItem } from "./AgendaItem";
import type { AgendaLane as AgendaLaneData } from "@/lib/triage/buildAgenda";

const LANE_ACCENT: Record<string, string> = {
  overdue:  '#B23A2A',
  today:    '#A85B1F',
  tomorrow: 'hsl(var(--ink-on-cream) / 0.5)',
  thisweek: 'hsl(var(--ink-on-cream) / 0.5)',
  later:    'hsl(var(--ink-on-cream) / 0.5)',
};

export function AgendaLane({ lane, picByClient }: { lane: AgendaLaneData; picByClient: Record<string, string> }) {
  const accent = LANE_ACCENT[lane.key];
  return (
    <section>
      <div
        className="flex items-center gap-2"
        style={{
          position: 'sticky', top: 46, zIndex: 4, background: 'hsl(var(--cream))',
          padding: '14px 0 8px', fontSize: 10.5, letterSpacing: '0.14em',
          textTransform: 'uppercase', fontWeight: 700, color: accent,
        }}
      >
        <span>{lane.label}</span>
        <span style={{ flex: 1, height: 1, background: 'hsl(var(--ink-on-cream) / 0.1)' }} />
      </div>
      {lane.items.map((item) => (
        <AgendaItem key={item.key} item={item} picUrl={picByClient[item.clientId]} />
      ))}
    </section>
  );
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/components/dashboard/AgendaLane.tsx src/components/dashboard/AgendaItem.tsx
git commit -m "feat(dashboard): AgendaLane with sticky header + avatar wiring"
```

---

## Task 7: `MasterViewToggle` + persistence hook

**Files:**
- Create: `src/components/dashboard/MasterViewToggle.tsx`

- [ ] **Step 1: Create the toggle (and its persisted-state hook)**

Create `src/components/dashboard/MasterViewToggle.tsx`:

```tsx
// src/components/dashboard/MasterViewToggle.tsx
//
// Segmented Clients/Tasks control for the admin master dashboard, plus a small
// hook that persists the choice to localStorage (default: clients).

import { useCallback, useState } from "react";
import { LayoutGrid, ListChecks } from "lucide-react";

export type MasterView = "clients" | "tasks";
const STORAGE_KEY = "dashboard.masterView";

export function useMasterView(): [MasterView, (v: MasterView) => void] {
  const [view, setView] = useState<MasterView>(() => {
    if (typeof window === "undefined") return "clients";
    return window.localStorage.getItem(STORAGE_KEY) === "tasks" ? "tasks" : "clients";
  });
  const set = useCallback((v: MasterView) => {
    setView(v);
    try { window.localStorage.setItem(STORAGE_KEY, v); } catch { /* ignore */ }
  }, []);
  return [view, set];
}

const OPTIONS: Array<{ value: MasterView; label: string; Icon: typeof LayoutGrid }> = [
  { value: "clients", label: "Clients", Icon: LayoutGrid },
  { value: "tasks",   label: "Tasks",   Icon: ListChecks },
];

export function MasterViewToggle({ view, onChange }: { view: MasterView; onChange: (v: MasterView) => void }) {
  return (
    <div
      role="tablist"
      aria-label="Dashboard view"
      style={{ display: 'inline-flex', background: 'hsl(var(--ink-on-cream) / 0.06)', borderRadius: 999, padding: 3 }}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const on = view === value;
        return (
          <button
            key={value}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(value)}
            style={{
              border: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 999,
              font: "600 12px/1 var(--font-body, Figtree), sans-serif",
              background: on ? 'hsl(var(--ink-on-cream))' : 'transparent',
              color: on ? 'hsl(var(--cream))' : 'hsl(var(--ink-on-cream) / 0.55)',
              boxShadow: on ? '0 1px 3px hsl(var(--ink-on-cream) / 0.18)' : 'none',
              transition: 'background .15s, color .15s',
            }}
          >
            <Icon size={14} strokeWidth={2} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/components/dashboard/MasterViewToggle.tsx
git commit -m "feat(dashboard): MasterViewToggle + persisted view hook"
```

---

## Task 8: Wire Tasks view + toggle + bug fix into `AdminTriageView`

**Files:**
- Modify: `src/pages/Dashboard.tsx`

- [ ] **Step 1: Add imports**

In `src/pages/Dashboard.tsx`, add to the dashboard imports block:

```ts
import { buildAgenda } from "@/lib/triage/buildAgenda";
import { AgendaLane } from "@/components/dashboard/AgendaLane";
import { MasterViewToggle, useMasterView } from "@/components/dashboard/MasterViewToggle";
```

- [ ] **Step 2: Compute the agenda + view state inside `AdminTriageView`**

In `AdminTriageView`, immediately after the existing line:

```ts
  const profilePics = useClientProfilePics(clientIds);
```

add:

```ts
  const [view, setView] = useMasterView();
  const agenda = useMemo(
    () => buildAgenda(triageClients, rowsByClient),
    [triageClients, rowsByClient],
  );
```

- [ ] **Step 3: Fix the dark-bleed background (full-height cream wrapper)**

In `AdminTriageView`'s returned JSX, change the outer wrapper. Replace:

```tsx
    <div
      className="min-h-screen relative"
      style={{
        background:
          "radial-gradient(1100px 600px at 50% -200px, rgba(197,136,47,0.12), hsl(var(--bone) / 0) 60%), hsl(var(--cream))",
        padding: "40px 28px 64px",
      }}
    >
```

with:

```tsx
    <div
      className="relative"
      style={{
        minHeight: "100%",
        background:
          "radial-gradient(1100px 600px at 50% -200px, rgba(197,136,47,0.12), hsl(var(--bone) / 0) 60%), hsl(var(--cream))",
        padding: "40px 28px 64px",
      }}
    >
```

(`minHeight: 100%` fills the scroll container so translucent cards never composite over the ink `bg-background`; the gradient sits on an opaque cream base.)

- [ ] **Step 4: Add the toggle to the header**

Directly below the opening `<div style={{ maxWidth: 720, margin: "0 auto" }}>`, insert a toggle row above the centered header:

```tsx
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <MasterViewToggle view={view} onChange={setView} />
        </div>
```

- [ ] **Step 5: Render the Tasks branch**

Find the final content block — the `) : (` that precedes `<div>{blocks.map(...)}` (the populated state). Wrap that populated branch so Tasks view renders the agenda instead of the client blocks. Replace:

```tsx
        ) : (
          <div>
            {blocks.map((b, idx) => (
```

with:

```tsx
        ) : view === "tasks" ? (
          <div>
            {agenda.map((lane) => (
              <AgendaLane key={lane.key} lane={lane} picByClient={profilePics} />
            ))}
          </div>
        ) : (
          <div>
            {blocks.map((b, idx) => (
```

The existing `pendingCount === 0` empty state and `loading` state remain shared across both views (they sit above this branch and are unchanged).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 7: Build**

Run: `npm run build`
Expected: build succeeds (exit 0).

- [ ] **Step 8: Commit**

```bash
git add src/pages/Dashboard.tsx
git commit -m "feat(dashboard): Tasks view + Clients/Tasks toggle + dark-bleed fix"
```

---

## Task 9: Manual verification

**Files:** none (verification only)

- [ ] **Step 1: Run the dev server**

Run: `npm run dev` and open `/dashboard` as an admin/master user.

- [ ] **Step 2: Verify the checklist**

- Default view is **Clients** (your existing per-client layout), now with no dark/grey band when you scroll a long roster to the bottom.
- Toggling to **Tasks** shows the by-when agenda: lanes Overdue → Today → Tomorrow → This week → Later, soonest first.
- Reload the page → the last-selected view persists.
- A client with both a `script_due` and pending review scripts shows ONE line ("Write & send script · N ready for review"), not two.
- Filming/onboarding rows show the **PREP** badge and appear up to ~10 days out.
- Avatars show the Instagram photo where present, initials otherwise.
- Clicking a Tasks item lands on the right page (scripts / editing-queue / content-calendar / strategy#pipeline).

- [ ] **Step 3: Run the full test suite**

Run: `npm run test`
Expected: all triage tests pass.

- [ ] **Step 4 (optional): reduced-motion**

The current header/blocks use framer-motion `animate` on mount (instant, not scroll-tied). The agenda inherits the same page; no scroll-tied motion was added in this plan, so no reduced-motion regression. (If scroll-reveal stagger is added later, gate it behind `prefers-reduced-motion`.)

---

## Self-Review notes

- **Spec coverage:** two views + default Clients (Task 7–8); persisted toggle (Task 7); buildAgenda fold/unpaired/bucket/lane-order (Task 4); prep window (Task 3); ClientAvatar reuse + shared monogram (Task 2, 5–6); lucide icons, no emoji (Task 5); bug fix (Task 8 Step 3); deep-links (Task 4 `hrefFor`). Covered.
- **Type consistency:** `AgendaItem`/`AgendaLane`/`AgendaKind`/`MasterView` names are used identically across Tasks 4–8. `buildAgenda(clients, rowsByClient, now?)` signature matches its call site in Task 8.
- **Scope note on motion:** the spec mentioned scroll-reveal stagger; this plan keeps the existing mount animation and does NOT add IntersectionObserver scroll-reveal, to avoid a reduced-motion regression and keep scrolling smooth. Flagged here as a deliberate, deferrable polish item rather than silently dropped.
