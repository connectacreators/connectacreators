# Master Dashboard — Tasks View (pipeline agenda)

**Date:** 2026-06-10
**Status:** Approved (design)
**Base branch:** `origin/main` (worktree `feat/master-dashboard-tasks-view`)
**Surface:** `/dashboard` admin/agency master view (`AdminTriageView` in `src/pages/Dashboard.tsx`)

## Problem

The admin master dashboard renders a per-client list of triage cards
(`TriageClientBlock`). Two issues:

1. **Visual bug.** The cards are translucent white (`rgba(255,255,255,0.55)` +
   blur) painted over a cream `min-h-screen` wrapper, but the outer dashboard
   scroll container is `bg-background` (`--ink`, ~#141414). Where the cream
   doesn't cover the full scroll height, lower cards bleed onto near-black and
   render as dim grey gradients — they look broken/disabled.
2. **Wrong altitude.** The view is organized by *client*, but the operator's
   real question is *"what do I need to do, and when?"* across the whole roster.
   The pipeline (per-client milestone deadlines on the strategy page) already
   holds that information; the dashboard should surface it.

## Goal

Add a second, deadline-driven **Tasks** view to the master dashboard while
keeping the existing per-client view as the default. Fix the dark-bleed bug for
both. Motion-rich but easy to scroll.

## Pipeline model (existing, unchanged)

Per-client `client_strategies` row stores milestone dates, surfaced today via
`buildPipelineRows` → `PipelineTriageRow`:

| Field | Milestone | Operator action (verb) |
|---|---|---|
| `onboarding_call_at` | `onboarding_call` | **Onboarding call** — show up prepped |
| `script_due_at` | `script_due` | **Write & send script** |
| `next_filming_at` | `filming` | **Prep the shoot** (shot list, confirm talent/location) |
| `editing_due_at` | `editing_due` | **Lock the edit** |
| `boosting_at` | `boosting` | **Set up boost** (· `$ads_budget`) |
| `posting_at` | `posting` | **Confirm posting** |

Plus three status/count rows already produced by `useTriageRows`:
`scripts_review`, `videos_revision`, `posts_scheduled` (each carries a date —
`oldestPendingAt` or `nextAt`).

## Design

### Two views, one toggle

`AdminTriageView` gains a segmented control in its header: **Clients | Tasks**.

- **Clients** (default) — the existing `TriageClientBlock` list, unchanged
  except the shared dark-bleed fix.
- **Tasks** (new) — the pipeline agenda described below.
- Selected view persisted to `localStorage` (key `dashboard.masterView`,
  values `"clients" | "tasks"`, default `"clients"`). Read once on mount.

### Tasks view: by-when agenda

Organizing principle is **urgency**, not client. One flat, scrollable agenda of
milestone tasks across every client, soonest first, grouped into lanes:

```
Overdue · Today · Tomorrow · This week · Later
```

Empty lanes don't render. Items sorted ascending by date within each lane.

**Item anatomy:** `[milestone icon tile] [verb (serif)] [PREP badge?]` /
`[client avatar][client name] · [folded count?]` ... `[relative-date chip]`.

- **Icons:** lucide line-icons already imported in `TriageRow`
  (`PenLine`, `Camera`, `Scissors`, `TrendingUp`, `Send`, `PhoneCall`). **No emoji.**
- **Avatar:** reuse `ClientAvatar` with `picUrl={profilePics[clientId]}`
  (from existing `useClientProfilePics`) and an initials-monogram fallback.
- **Date chip:** `relativeDate(sortDate).label`, tinted by bucket (reuse the
  bucket tint logic already in `TriageRow`).
- **PREP badge:** small honey pill on `filming` and `onboarding_call` rows.

### The transform — `src/lib/triage/buildAgenda.ts` (pure, TDD)

```
buildAgenda(clients: TriageClient[], rowsByClient: TriageRowsByClient, now?: Date)
  → AgendaLane[]
```

where

```ts
type AgendaLaneKey = 'overdue' | 'today' | 'tomorrow' | 'thisweek' | 'later';
interface AgendaItem {
  key: string;            // stable: `${clientId}:${milestoneOrType}`
  clientId: string;
  clientName: string;
  kind: PipelineMilestone | 'scripts_review' | 'videos_revision' | 'posts_scheduled';
  verb: string;           // "Write & send script"
  sortDate: string;       // ISO
  chipLabel: string;      // relativeDate().label
  bucket: RelativeBucket;
  count?: number;         // folded count, when present
  countLabel?: string;    // "3 ready for review"
  context?: string;       // "$400 budget", "review intake first", "shot list + confirm talent"
  isPrep?: boolean;       // filming | onboarding_call
}
interface AgendaLane { key: AgendaLaneKey; label: string; items: AgendaItem[]; }
```

**Steps:**

1. For each client, walk its rows. Build a candidate item per row with a
   resolved `sortDate` (pipeline `at`; else `oldestPendingAt`/`nextAt`).
2. **Fold counts into deadlines.** When a client has both a pipeline row and its
   matching count row, merge the count into the pipeline item
   (`count`/`countLabel`) and drop the standalone count item. Mapping:
   `script_due`↔`scripts_review`, `editing_due`↔`videos_revision`,
   `posting`↔`posts_scheduled`. An **unpaired** count keeps its own item, dated
   by its aging timestamp, with a verb like "Review N scripts" /
   "N edits in revision" / "N posts scheduled".
3. Assign `verb`, `context`, `isPrep` from `kind`.
4. Bucket each item via `relativeDate(sortDate).bucket`, mapping
   `soon→today` and `twoweeks|farfuture→later`. Lane order fixed as above.
5. Sort items within each lane ascending by `sortDate`. Drop empty lanes.

Pure and deterministic (inject `now`); covered by unit tests for: folding,
unpaired counts, bucketing boundaries, lane ordering, empty input.

### Prep lead time — `buildPipelineRows`

`filming` and `onboarding_call` use a **10-day** window; the other four stay at
**7 days**. One small change to `buildPipelineRows` (per-milestone window
instead of a single `windowDays`). This is what makes a shoot surface with
enough runway to prep.

### Components

- `src/components/dashboard/AgendaLane.tsx` — sticky lane header (label +
  hairline rule) + its items.
- `src/components/dashboard/AgendaItem.tsx` — one row; links to the same
  destination the current rows use (`buildHref` logic reused/extracted):
  scripts → `?filter=needs_review`, videos → editing-queue, posts → calendar,
  pipeline → `strategy#pipeline`.
- `src/components/dashboard/MasterViewToggle.tsx` — segmented Clients/Tasks
  control.
- `src/lib/triage/clientMonogram.ts` — extracted `colorFor` + `initials` (today
  duplicated in `TriageClientBlock`), shared by both views.

### Motion

- Sticky condensed date header with live counts ("1 overdue · 2 today · 3 this
  week"), and sticky lane dividers below it.
- Items fade + rise in, staggered, via IntersectionObserver (or framer-motion
  `whileInView`). **Respect `prefers-reduced-motion`** — render static.
- Subtle hover lift on items (matches existing card hover).

### Bug fix (both views)

Paint the cream radial-gradient on a wrapper guaranteed to cover the full
scrollable height (`min-height: 100%` of the scroll area, opaque cream base) so
translucent surfaces never composite over the ink `bg-background`. Verify by
scrolling a long roster to the very bottom — no grey/dark band.

## Edge cases

- **No pending items** → existing "Nothing on fire." empty state (both views).
- **No clients** → existing roster-empty prompt.
- **Client with counts but no pipeline dates** → unpaired count items appear,
  dated by aging timestamp; never dropped.
- **Image fails to decode** → `ClientAvatar` already falls back to initials.

## Out of scope (v1)

- "By stage" grouping / a third organizing mode (can layer on later — the toggle
  pattern leaves room).
- Any change to how pipeline dates are entered (strategy page unchanged).
- Mobile-specific redesign beyond the existing responsive behavior.

## Testing

- Unit: `buildAgenda` (folding, unpaired counts, bucket boundaries at
  now/midnight/+7d/+10d, lane order, empty). `buildPipelineRows` per-milestone
  window.
- Manual: toggle persists across reload; Tasks agenda matches seeded pipeline
  dates; avatars show photo when present and initials otherwise; deep-links land
  correctly; scroll to bottom shows no dark bleed; reduced-motion renders static.

## Files

New: `src/lib/triage/buildAgenda.ts`, `src/lib/triage/buildAgenda.test.ts`,
`src/lib/triage/clientMonogram.ts`,
`src/components/dashboard/AgendaLane.tsx`,
`src/components/dashboard/AgendaItem.tsx`,
`src/components/dashboard/MasterViewToggle.tsx`.

Modified: `src/pages/Dashboard.tsx` (toggle + Tasks branch + bug-fix wrapper),
`src/lib/triage/buildPipelineRows.ts` (per-milestone window),
`src/components/dashboard/TriageClientBlock.tsx` (use shared monogram helpers).
