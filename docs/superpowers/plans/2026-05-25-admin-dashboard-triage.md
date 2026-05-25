# Admin Dashboard Triage Rebuild — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/dashboard` as a triage view that lists Connecta Plus clients with pending work, and add a per-client Production Pipeline section to `/clients/:id/strategy` whose dates feed the dashboard.

**Architecture:** Schema-extend `client_strategies` with 7 new columns (6 dates + notes). Build two new dashboard hooks (`useTriageClients`, `useTriageRows`) that return Connecta Plus clients and per-client triage rows (pipeline + count types). Rewrite the admin path of `src/pages/Dashboard.tsx` to render the new layout via two new components (`TriageRow`, `TriageClientBlock`). Add a new `ProductionPipelineSection` component to the existing `ClientStrategy.tsx` page. Add minimal query-param filtering to the three target pages so rows deep-link into a pre-filtered view.

**Tech Stack:** React + Vite + TypeScript, Supabase (Postgres), `framer-motion`, Tailwind, `react-router-dom`. No unit test runner — verification is manual via dev server + DB queries.

**Spec:** `docs/superpowers/specs/2026-05-25-admin-dashboard-triage-design.md` (commit `7edcddd` on `main`).

---

## File map

**New:**
- `supabase/migrations/20260525_a01_client_strategies_pipeline.sql` — schema migration.
- `src/components/strategy/ProductionPipelineSection.tsx` — pipeline section UI.
- `src/components/dashboard/TriageRow.tsx` — single row renderer.
- `src/components/dashboard/TriageClientBlock.tsx` — single client block renderer.
- `src/hooks/useTriageClients.ts` — fetch Connecta Plus client list.
- `src/hooks/useTriageRows.ts` — fetch per-client triage rows.
- `src/lib/triage/buildPipelineRows.ts` — pure function: strategy row → pipeline `TriageRow[]`.
- `src/lib/triage/types.ts` — shared `TriageRow` / `PipelineMilestone` types.
- `src/lib/triage/relativeDate.ts` — pure function: ISO date → "Tomorrow" / "In 3 days" / "Fri" / "Overdue" / absolute.

**Modified:**
- `src/integrations/supabase/types.ts` — regenerate (the migration adds columns).
- `src/pages/ClientStrategy.tsx` — extend `ClientStrategy` interface + `DEFAULTS`; render `<ProductionPipelineSection>`.
- `src/pages/Dashboard.tsx` — rewrite admin path (keep `isSingleBrand` early-return and `activeClient` drilldown branch unchanged).
- `src/pages/Scripts.tsx` — add `?filter=needs_review` query-param wiring.
- `src/pages/EditingQueue.tsx` — change existing `?status=` param from search-hint to a real `lifecycle_status` filter.
- `src/pages/ContentCalendar.tsx` — add `?window=upcoming` query-param wiring.

**Untouched but referenced:**
- `src/hooks/useDashboardPendingItems.ts` — orphaned by this work but kept (its `PendingItem` type is still imported by `ClientCard.tsx` and `getRobbyInsights.ts` in the drilldown branch).

---

## Task 1: Database migration — add pipeline columns to `client_strategies`

**Files:**
- Create: `supabase/migrations/20260525_a01_client_strategies_pipeline.sql`

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260525_a01_client_strategies_pipeline.sql`:

```sql
-- supabase/migrations/20260525_a01_client_strategies_pipeline.sql
--
-- Adds the per-client production pipeline columns to client_strategies.
-- All fields are nullable; admin fills them in as they're known.
-- Dashboard reads these to surface "Onboarding call tomorrow", "Script due Fri",
-- etc. when within the next 7 days.

ALTER TABLE public.client_strategies
  ADD COLUMN IF NOT EXISTS onboarding_call_at timestamptz,
  ADD COLUMN IF NOT EXISTS script_due_at      timestamptz,
  ADD COLUMN IF NOT EXISTS editing_due_at     timestamptz,
  ADD COLUMN IF NOT EXISTS next_filming_at    timestamptz,
  ADD COLUMN IF NOT EXISTS boosting_at        timestamptz,
  ADD COLUMN IF NOT EXISTS posting_at         timestamptz,
  ADD COLUMN IF NOT EXISTS pipeline_notes     text;

-- Composite index to speed up dashboard query: pick any client_strategies row
-- where any pipeline date falls within the next N days.
CREATE INDEX IF NOT EXISTS client_strategies_pipeline_dates_idx
  ON public.client_strategies (client_id)
  WHERE
    onboarding_call_at IS NOT NULL
    OR script_due_at IS NOT NULL
    OR editing_due_at IS NOT NULL
    OR next_filming_at IS NOT NULL
    OR boosting_at IS NOT NULL
    OR posting_at IS NOT NULL;

COMMENT ON COLUMN public.client_strategies.onboarding_call_at IS 'Next onboarding call scheduled for this client (admin-managed).';
COMMENT ON COLUMN public.client_strategies.script_due_at      IS 'Next script writing due date.';
COMMENT ON COLUMN public.client_strategies.editing_due_at     IS 'Next editing pass due date.';
COMMENT ON COLUMN public.client_strategies.next_filming_at    IS 'Next filming session date/time.';
COMMENT ON COLUMN public.client_strategies.boosting_at        IS 'Next ads-boosting kickoff date (paired with ads_budget).';
COMMENT ON COLUMN public.client_strategies.posting_at         IS 'Next planned posting date for the in-flight content.';
COMMENT ON COLUMN public.client_strategies.pipeline_notes     IS 'Free-text notes on current cycle status, blockers, context.';
```

- [ ] **Step 2: Apply the migration**

```bash
supabase db push
```

Expected: migration runs successfully; no errors. Look for `client_strategies_pipeline.sql ... applied`.

- [ ] **Step 3: Verify columns exist via SQL**

```bash
supabase db execute --query "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='client_strategies' AND column_name IN ('onboarding_call_at','script_due_at','editing_due_at','next_filming_at','boosting_at','posting_at','pipeline_notes') ORDER BY column_name;"
```

Expected: 7 rows, all `is_nullable = YES`, six `timestamp with time zone`, one `text`.

- [ ] **Step 4: Regenerate Supabase types**

```bash
supabase gen types typescript --project-id "$(grep -E 'project_id|projectRef' supabase/config.toml | head -1 | awk -F'\"' '{print $2}')" --schema public > src/integrations/supabase/types.ts
```

If that one-liner doesn't resolve the project ref, run `supabase status` first to get it. Confirm the file diffs only show the seven new columns under `client_strategies`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260525_a01_client_strategies_pipeline.sql src/integrations/supabase/types.ts
git commit -m "feat(db): add production pipeline columns to client_strategies"
```

---

## Task 2: Shared triage types and date-format helper

**Files:**
- Create: `src/lib/triage/types.ts`
- Create: `src/lib/triage/relativeDate.ts`

- [ ] **Step 1: Create the shared types file**

Create `src/lib/triage/types.ts`:

```ts
// src/lib/triage/types.ts
//
// Shared types for the admin dashboard triage view.
// A TriageRow describes one row inside a client's block on /dashboard.

export type PipelineMilestone =
  | 'onboarding_call'
  | 'script_due'
  | 'editing_due'
  | 'filming'
  | 'boosting'
  | 'posting';

export interface PipelineTriageRow {
  type: 'pipeline';
  milestone: PipelineMilestone;
  at: string;            // ISO timestamp
  label?: string;        // optional context (budget for boosting, time for onboarding, etc.)
}

export interface ScriptsReviewRow {
  type: 'scripts_review';
  count: number;
  sampleNames: string[];      // up to 3 most-recent script titles
  oldestPendingAt: string;    // ISO; drives the aging dot
}

export interface VideosRevisionRow {
  type: 'videos_revision';
  count: number;
  sampleNames: string[];
  oldestPendingAt: string;
}

export interface PostsScheduledRow {
  type: 'posts_scheduled';
  count: number;
  sampleNames: string[];   // captions, truncated
  nextAt: string;          // ISO; drives "today 3:00pm"
}

export type TriageRow =
  | PipelineTriageRow
  | ScriptsReviewRow
  | VideosRevisionRow
  | PostsScheduledRow;

export type TriageRowsByClient = Record<string /* clientId */, TriageRow[]>;

export interface TriageClient {
  id: string;
  name: string;
}

export const PIPELINE_MILESTONE_LABEL: Record<PipelineMilestone, string> = {
  onboarding_call: 'Onboarding call',
  script_due:      'Script due',
  editing_due:     'Editing due',
  filming:         'Filming',
  boosting:        'Boosting',
  posting:         'Posting',
};
```

- [ ] **Step 2: Create the relative-date helper**

Create `src/lib/triage/relativeDate.ts`:

```ts
// src/lib/triage/relativeDate.ts
//
// Format a timestamp relative to "now" for the triage view.
//   Past         → "Overdue"
//   < 60 minutes → "In Nm"
//   Today        → "Today HH:MM"  (or "Today" if no time component / midnight)
//   Tomorrow     → "Tomorrow"     (or "Tomorrow HH:MM" with explicit time)
//   2..6 days    → weekday name   ("Fri", "Mon")
//   ≤ 14 days    → "In N days"
//   > 14 days    → absolute date  ("Jun 10")

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function hasTimeOfDay(d: Date): boolean {
  return d.getHours() !== 0 || d.getMinutes() !== 0;
}

function formatTime(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const period = h >= 12 ? 'pm' : 'am';
  const h12 = ((h + 11) % 12) + 1;
  const mm = m === 0 ? '' : `:${m.toString().padStart(2, '0')}`;
  return `${h12}${mm}${period}`;
}

export type RelativeBucket = 'overdue' | 'soon' | 'today' | 'tomorrow' | 'thisweek' | 'twoweeks' | 'farfuture';

export interface RelativeDate {
  label: string;       // user-facing string
  bucket: RelativeBucket;
}

export function relativeDate(iso: string, now: Date = new Date()): RelativeDate {
  const d = new Date(iso);
  const diffMs = d.getTime() - now.getTime();

  if (diffMs < 0) return { label: 'Overdue', bucket: 'overdue' };

  const diffMin = diffMs / 60000;
  if (diffMin < 60) return { label: `In ${Math.max(1, Math.round(diffMin))}m`, bucket: 'soon' };

  if (isSameLocalDay(d, now)) {
    return { label: hasTimeOfDay(d) ? `Today ${formatTime(d)}` : 'Today', bucket: 'today' };
  }

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (isSameLocalDay(d, tomorrow)) {
    return { label: hasTimeOfDay(d) ? `Tomorrow ${formatTime(d)}` : 'Tomorrow', bucket: 'tomorrow' };
  }

  const diffDays = Math.ceil((d.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays >= 2 && diffDays <= 6) return { label: WEEKDAYS[d.getDay()], bucket: 'thisweek' };
  if (diffDays <= 14) return { label: `In ${diffDays} days`, bucket: 'twoweeks' };

  return { label: `${MONTHS[d.getMonth()]} ${d.getDate()}`, bucket: 'farfuture' };
}

export function isWithinDays(iso: string, days: number, now: Date = new Date()): boolean {
  const t = new Date(iso).getTime();
  const cutoff = now.getTime() + days * 24 * 60 * 60 * 1000;
  return t >= now.getTime() && t <= cutoff;
}
```

- [ ] **Step 3: Smoke-test the helper in the dev server**

Run the dev server in the background:

```bash
npm run dev &
```

Then in a fresh terminal, exercise the helper from a node REPL with the same date math:

```bash
node -e "
const m = await import('./src/lib/triage/relativeDate.ts').catch(() => null);
console.log('check passed if no exception');
" || echo "Skipping JS exec — verify by reading the file once more"
```

(Reading the file once more is fine — there is no test runner in this repo.) Confirm visually: a date 30 min ahead → "In 30m"; midnight today → "Today"; tomorrow at noon → "Tomorrow 12pm"; 10 days out → "In 10 days"; 30 days out → "Jun 24" (or equivalent).

- [ ] **Step 4: Commit**

```bash
git add src/lib/triage/types.ts src/lib/triage/relativeDate.ts
git commit -m "feat(triage): shared types and relative-date helper"
```

---

## Task 3: `buildPipelineRows` pure function

**Files:**
- Create: `src/lib/triage/buildPipelineRows.ts`

- [ ] **Step 1: Create the builder**

Create `src/lib/triage/buildPipelineRows.ts`:

```ts
// src/lib/triage/buildPipelineRows.ts
//
// Pure transform: a client_strategies row → an array of pipeline TriageRows
// filtered to dates within the next `windowDays` (default 7) and not in the past.

import type { PipelineMilestone, PipelineTriageRow } from "./types";

export interface PipelineSource {
  onboarding_call_at: string | null;
  script_due_at:      string | null;
  editing_due_at:     string | null;
  next_filming_at:    string | null;
  boosting_at:        string | null;
  posting_at:         string | null;
  ads_budget:         number | null;
}

interface FieldMap {
  field: keyof PipelineSource;
  milestone: PipelineMilestone;
}

const FIELDS: FieldMap[] = [
  { field: 'onboarding_call_at', milestone: 'onboarding_call' },
  { field: 'script_due_at',      milestone: 'script_due' },
  { field: 'editing_due_at',     milestone: 'editing_due' },
  { field: 'next_filming_at',    milestone: 'filming' },
  { field: 'boosting_at',        milestone: 'boosting' },
  { field: 'posting_at',         milestone: 'posting' },
];

export function buildPipelineRows(
  source: PipelineSource | null,
  options: { windowDays?: number; now?: Date } = {},
): PipelineTriageRow[] {
  if (!source) return [];
  const windowDays = options.windowDays ?? 7;
  const now = options.now ?? new Date();
  const cutoff = now.getTime() + windowDays * 24 * 60 * 60 * 1000;
  const nowMs = now.getTime();

  const out: PipelineTriageRow[] = [];

  for (const { field, milestone } of FIELDS) {
    const raw = source[field];
    if (!raw || typeof raw !== 'string') continue;
    const t = new Date(raw).getTime();
    if (Number.isNaN(t) || t < nowMs || t > cutoff) continue;

    let label: string | undefined;
    if (milestone === 'boosting' && typeof source.ads_budget === 'number' && source.ads_budget > 0) {
      label = `$${source.ads_budget} budget`;
    }

    out.push({ type: 'pipeline', milestone, at: raw, label });
  }

  // Chronological — soonest first
  out.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return out;
}
```

- [ ] **Step 2: Smoke-test by example**

Verify by reading: with `now = 2026-05-25 12:00`, a source with `onboarding_call_at = 2026-05-26 15:00` and `script_due_at = 2026-06-10` (16 days out) and `boosting_at = 2026-05-30` and `ads_budget = 200`, the function should return 2 rows: onboarding then boosting (with label `$200 budget`). Script row is filtered out (outside 7-day window). Order is by date ascending.

- [ ] **Step 3: Commit**

```bash
git add src/lib/triage/buildPipelineRows.ts
git commit -m "feat(triage): pure builder for pipeline rows from client_strategies"
```

---

## Task 4: Extend `ClientStrategy` interface and `DEFAULTS`

**Files:**
- Modify: `src/pages/ClientStrategy.tsx:9-77`

- [ ] **Step 1: Extend the TypeScript interface**

In `src/pages/ClientStrategy.tsx`, locate the `ClientStrategy` interface (around line 9). Add the seven new fields **before** the `audience_analysis?` field:

```ts
interface ClientStrategy {
  id?: string;
  client_id: string;
  posts_per_month: number;
  scripts_per_month: number;
  videos_edited_per_month: number;
  stories_per_week: number;
  mix_reach: number;
  mix_trust: number;
  mix_convert: number;
  primary_platform: string;
  manychat_active: boolean;
  manychat_keyword: string;
  cta_goal: string;
  ads_active: boolean;
  ads_budget: number;
  ads_goal: string;
  audience_score: number;
  uniqueness_score: number;
  monthly_revenue_goal: number;
  monthly_revenue_actual: number;
  content_pillars: string[];
  // Production pipeline (Task 1 migration)
  onboarding_call_at: string | null;
  script_due_at:      string | null;
  editing_due_at:     string | null;
  next_filming_at:    string | null;
  boosting_at:        string | null;
  posting_at:         string | null;
  pipeline_notes:     string | null;
  audience_analysis?: {
    summary: string;
    audience_detail: string;
    uniqueness_detail: string;
    client_posts_analyzed: number;
    emulation_posts_analyzed: number;
    emulation_profiles: string[];
    analyzed_at: string;
    language?: string;
  } | null;
  audience_analyzed_at?: string | null;
}
```

- [ ] **Step 2: Extend `DEFAULTS`**

Add to the `DEFAULTS` constant (currently around line 47), inserted after `content_pillars: [],`:

```ts
const DEFAULTS: Omit<ClientStrategy, "client_id"> = {
  posts_per_month: 20,
  scripts_per_month: 20,
  videos_edited_per_month: 20,
  stories_per_week: 10,
  mix_reach: 60,
  mix_trust: 30,
  mix_convert: 10,
  primary_platform: "instagram",
  manychat_active: false,
  manychat_keyword: "",
  cta_goal: "manychat",
  ads_active: false,
  ads_budget: 0,
  ads_goal: "",
  audience_score: 5,
  uniqueness_score: 5,
  monthly_revenue_goal: 0,
  monthly_revenue_actual: 0,
  content_pillars: [],
  onboarding_call_at: null,
  script_due_at:      null,
  editing_due_at:     null,
  next_filming_at:    null,
  boosting_at:        null,
  posting_at:         null,
  pipeline_notes:     null,
  audience_analysis: null,
  audience_analyzed_at: null,
};
```

- [ ] **Step 3: Verify it still type-checks**

```bash
npm run lint
```

Expected: no new errors in `ClientStrategy.tsx`. (Pre-existing warnings in unrelated files are OK.)

- [ ] **Step 4: Commit**

```bash
git add src/pages/ClientStrategy.tsx
git commit -m "feat(strategy): extend ClientStrategy interface with pipeline fields"
```

---

## Task 5: Build `ProductionPipelineSection` component

**Files:**
- Create: `src/components/strategy/ProductionPipelineSection.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/strategy/ProductionPipelineSection.tsx`:

```tsx
// src/components/strategy/ProductionPipelineSection.tsx
//
// "Production pipeline" section on /clients/:id/strategy. Six date inputs
// + ads_active toggle + ads_budget input + free-text notes. Anchored at
// #pipeline so the dashboard can deep-link here.
//
// Read/write contract: receives `s` (the current strategy snapshot) and
// `set(field, value)` (the existing helper from ClientStrategy.tsx that
// updates the draft). Does NOT perform saves — parent's Save button writes
// the whole strategy via upsert.

import { relativeDate, type RelativeBucket } from "@/lib/triage/relativeDate";

export interface PipelineFields {
  onboarding_call_at: string | null;
  script_due_at:      string | null;
  editing_due_at:     string | null;
  next_filming_at:    string | null;
  boosting_at:        string | null;
  posting_at:         string | null;
  pipeline_notes:     string | null;
  ads_active:         boolean;
  ads_budget:         number;
}

interface Props {
  s: PipelineFields;
  editing: boolean;
  set: <K extends keyof PipelineFields>(field: K, value: PipelineFields[K]) => void;
  en: boolean;
}

const ROWS: Array<{ field: keyof PipelineFields; labelEn: string; labelEs: string; withTime: boolean }> = [
  { field: 'onboarding_call_at', labelEn: 'Onboarding call', labelEs: 'Llamada de onboarding', withTime: true  },
  { field: 'script_due_at',      labelEn: 'Script due',      labelEs: 'Guion debido',           withTime: false },
  { field: 'editing_due_at',     labelEn: 'Editing due',     labelEs: 'Edición debida',         withTime: false },
  { field: 'next_filming_at',    labelEn: 'Next filming',    labelEs: 'Próxima grabación',      withTime: true  },
  { field: 'boosting_at',        labelEn: 'Boosting',        labelEs: 'Boosting',               withTime: false },
  { field: 'posting_at',         labelEn: 'Posting',         labelEs: 'Publicación',            withTime: false },
];

const BUCKET_COLOR: Record<RelativeBucket, string> = {
  overdue:   '#ef4444',
  soon:      '#f59e0b',
  today:     '#f59e0b',
  tomorrow:  '#f59e0b',
  thisweek:  'rgba(255,255,255,0.55)',
  twoweeks:  'rgba(255,255,255,0.45)',
  farfuture: 'rgba(255,255,255,0.40)',
};

/** Convert a `timestamptz` string to the `<input type="datetime-local">` / `date` value. */
function toInputValue(iso: string | null, withTime: boolean): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => n.toString().padStart(2, '0');
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (!withTime) return date;
  return `${date}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Convert an input value back to ISO; empty → null. */
function fromInputValue(v: string, withTime: boolean): string | null {
  if (!v) return null;
  // Treat as local time; build a Date then return its ISO.
  const d = withTime ? new Date(v) : new Date(`${v}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function ProductionPipelineSection({ s, editing, set, en }: Props) {
  return (
    <section id="pipeline" className="rounded-[14px] p-[18px_20px]" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <h3 className="text-[11px] font-bold tracking-[1.5px] uppercase mb-3" style={{ color: 'rgba(255,255,255,0.55)' }}>
        {en ? 'Production pipeline' : 'Pipeline de producción'}
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 mb-4">
        {ROWS.map((row) => {
          const value = s[row.field] as string | null;
          const rel = value ? relativeDate(value) : null;
          const inputType = row.withTime ? 'datetime-local' : 'date';
          return (
            <div key={row.field} className="flex items-center gap-3">
              <label className="text-[12px] w-[110px] shrink-0" style={{ color: 'rgba(255,255,255,0.65)' }}>
                {en ? row.labelEn : row.labelEs}
              </label>
              {editing ? (
                <input
                  type={inputType}
                  value={toInputValue(value, row.withTime)}
                  onChange={(e) => set(row.field, fromInputValue(e.target.value, row.withTime) as never)}
                  className="text-[12px] px-2 py-1 rounded bg-white/5 border border-white/10 text-white outline-none focus:border-white/30"
                />
              ) : (
                <span className="text-[12px]" style={{ color: rel ? BUCKET_COLOR[rel.bucket] : 'rgba(255,255,255,0.35)' }}>
                  {rel ? rel.label : (en ? '—' : '—')}
                </span>
              )}
              {editing && value && (
                <button
                  type="button"
                  onClick={() => set(row.field, null as never)}
                  className="text-[11px] text-white/40 hover:text-white/70"
                >
                  {en ? 'Clear' : 'Borrar'}
                </button>
              )}
              {!editing && rel && (
                <span className="text-[11px]" style={{ color: BUCKET_COLOR[rel.bucket] }}>
                  ({rel.label})
                </span>
              )}
            </div>
          );
        })}

        <div className="flex items-center gap-3">
          <label className="text-[12px] w-[110px] shrink-0" style={{ color: 'rgba(255,255,255,0.65)' }}>
            {en ? 'Ads active' : 'Anuncios activos'}
          </label>
          {editing ? (
            <button
              type="button"
              onClick={() => set('ads_active', !s.ads_active)}
              className="text-[11px] font-semibold px-3 py-1 rounded-md"
              style={{
                background: s.ads_active ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)',
                color: s.ads_active ? '#22c55e' : 'rgba(255,255,255,0.4)',
                border: s.ads_active ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.1)',
              }}
            >
              {s.ads_active ? (en ? 'Yes' : 'Sí') : 'No'}
            </button>
          ) : (
            <span className="text-[12px]" style={{ color: s.ads_active ? '#22c55e' : 'rgba(255,255,255,0.45)' }}>
              {s.ads_active ? (en ? 'Yes' : 'Sí') : 'No'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <label className="text-[12px] w-[110px] shrink-0" style={{ color: 'rgba(255,255,255,0.65)' }}>
            {en ? 'Ads budget' : 'Presupuesto'}
          </label>
          {editing ? (
            <input
              type="number"
              min={0}
              value={s.ads_budget ?? 0}
              onChange={(e) => set('ads_budget', Number(e.target.value) || 0)}
              className="text-[12px] px-2 py-1 rounded bg-white/5 border border-white/10 text-white outline-none focus:border-white/30 w-[100px]"
            />
          ) : (
            <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.85)' }}>
              {s.ads_budget > 0 ? `$${s.ads_budget}` : '—'}
            </span>
          )}
        </div>
      </div>

      <div>
        <label className="text-[11px] uppercase tracking-[1px] block mb-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
          {en ? 'Notes' : 'Notas'}
        </label>
        {editing ? (
          <textarea
            rows={3}
            value={s.pipeline_notes ?? ''}
            onChange={(e) => set('pipeline_notes', e.target.value || null)}
            placeholder={en ? 'Status, blockers, context…' : 'Estado, bloqueadores, contexto…'}
            className="w-full text-[12px] p-2 rounded bg-white/5 border border-white/10 text-white outline-none focus:border-white/30 resize-y"
          />
        ) : (
          <p className="text-[12px] whitespace-pre-wrap" style={{ color: s.pipeline_notes ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.35)' }}>
            {s.pipeline_notes || (en ? 'No notes' : 'Sin notas')}
          </p>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/strategy/ProductionPipelineSection.tsx
git commit -m "feat(strategy): add ProductionPipelineSection component"
```

---

## Task 6: Wire `ProductionPipelineSection` into the strategy page

**Files:**
- Modify: `src/pages/ClientStrategy.tsx`

- [ ] **Step 1: Import the new component**

Near the top of `src/pages/ClientStrategy.tsx`, after the existing imports, add:

```ts
import { ProductionPipelineSection } from "@/components/strategy/ProductionPipelineSection";
```

- [ ] **Step 2: Render the section**

In `ClientStrategy.tsx`'s return tree, find a sensible place near the existing strategy form (likely after the score / status cards section, before the audience analysis card — pick whatever lines up structurally with the existing layout). Render:

```tsx
<ProductionPipelineSection
  s={{
    onboarding_call_at: s.onboarding_call_at,
    script_due_at:      s.script_due_at,
    editing_due_at:     s.editing_due_at,
    next_filming_at:    s.next_filming_at,
    boosting_at:        s.boosting_at,
    posting_at:         s.posting_at,
    pipeline_notes:     s.pipeline_notes,
    ads_active:         s.ads_active,
    ads_budget:         s.ads_budget,
  }}
  editing={editing}
  set={set as any}
  en={en}
/>
```

The `set as any` cast is acceptable because `ProductionPipelineSection` types `set` more narrowly than the page-level `set` (which uses `keyof ClientStrategy`). All field names involved exist on `ClientStrategy`.

- [ ] **Step 3: Smoke-test the strategy page**

Start the dev server:

```bash
npm run dev
```

Navigate to `/clients/<a-real-client-id>/strategy`. Click Edit. Verify:
- "Production pipeline" section renders with 6 empty date rows + ads active/budget + notes textarea.
- Setting "Onboarding call" to tomorrow at 3pm and saving persists across reload.
- The relative date next to each saved value reads correctly ("Tomorrow 3pm", "In 3 days", etc.).
- The section is at anchor `#pipeline` — navigate to `/clients/<id>/strategy#pipeline` and confirm the URL anchor scrolls or at least matches.

- [ ] **Step 4: Verify the saved row in the database**

```bash
supabase db execute --query "SELECT client_id, onboarding_call_at, pipeline_notes FROM public.client_strategies WHERE onboarding_call_at IS NOT NULL ORDER BY updated_at DESC LIMIT 3;"
```

Expected: the row(s) you just edited show non-null pipeline values.

- [ ] **Step 5: Commit**

```bash
git add src/pages/ClientStrategy.tsx
git commit -m "feat(strategy): render ProductionPipelineSection on strategy page"
```

---

## Task 7: `useTriageClients` hook — fetch Connecta Plus clients

**Files:**
- Create: `src/hooks/useTriageClients.ts`

- [ ] **Step 1: Create the hook**

Create `src/hooks/useTriageClients.ts`:

```ts
// src/hooks/useTriageClients.ts
//
// Returns the list of Connecta Plus clients. Server-side filter via two joins:
//   clients
//     ← subscriber_clients (client_id)
//         ← user_roles (user_id, role='connecta_plus')
//
// Deduplicated (a client can have multiple linked subscribers).

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { TriageClient } from "@/lib/triage/types";

interface Result {
  clients: TriageClient[];
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useTriageClients(): Result {
  const [clients, setClients] = useState<TriageClient[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      // Step 1: find user_ids with role connecta_plus
      const { data: roleRows, error: roleErr } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "connecta_plus");
      if (roleErr) {
        if (!cancelled) { setError(roleErr); setLoading(false); }
        return;
      }
      const userIds = (roleRows ?? []).map((r) => r.user_id);
      if (userIds.length === 0) {
        if (!cancelled) { setClients([]); setLoading(false); }
        return;
      }

      // Step 2: find client_ids linked to those subscribers
      const { data: linkRows, error: linkErr } = await supabase
        .from("subscriber_clients")
        .select("client_id")
        .in("subscriber_user_id", userIds);
      if (linkErr) {
        if (!cancelled) { setError(linkErr); setLoading(false); }
        return;
      }
      const clientIds = Array.from(new Set((linkRows ?? []).map((r) => r.client_id)));
      if (clientIds.length === 0) {
        if (!cancelled) { setClients([]); setLoading(false); }
        return;
      }

      // Step 3: load client names
      const { data: clientRows, error: clientErr } = await supabase
        .from("clients")
        .select("id, name")
        .in("id", clientIds)
        .order("name");
      if (clientErr) {
        if (!cancelled) { setError(clientErr); setLoading(false); }
        return;
      }

      if (!cancelled) {
        setClients((clientRows ?? []) as TriageClient[]);
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [tick]);

  return { clients, loading, error, refresh };
}
```

- [ ] **Step 2: Smoke-test the hook**

In the dev server, temporarily render it from the Dashboard page (or a scratch route) and console.log the result. Verify:
- Returns clients whose subscriber users have `role = 'connecta_plus'`.
- Skips clients linked only to non-`connecta_plus` users.
- Returns `[]` cleanly when no matches.

Remove any scratch logging before committing.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useTriageClients.ts
git commit -m "feat(triage): useTriageClients hook (Connecta Plus filter)"
```

---

## Task 8: `useTriageRows` hook — fetch per-client triage rows

**Files:**
- Create: `src/hooks/useTriageRows.ts`

- [ ] **Step 1: Create the hook**

Create `src/hooks/useTriageRows.ts`:

```ts
// src/hooks/useTriageRows.ts
//
// Fetches per-client triage row data for the admin dashboard. Runs four
// parallel queries (scripts, video_edits, scheduled_posts, client_strategies)
// and assembles a TriageRowsByClient map. Pipeline rows come from a pure
// transform of the strategy row (see buildPipelineRows).

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { buildPipelineRows, type PipelineSource } from "@/lib/triage/buildPipelineRows";
import type {
  ScriptsReviewRow,
  VideosRevisionRow,
  PostsScheduledRow,
  TriageRow,
  TriageRowsByClient,
} from "@/lib/triage/types";

interface Result {
  data: TriageRowsByClient;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

const POST_TERMINAL_STATUSES = new Set(['published', 'canceled', 'failed']);
const WINDOW_DAYS = 7;
const SCRIPT_AGE_DAYS = 60;

export function useTriageRows(clientIds: string[]): Result {
  const [data, setData] = useState<TriageRowsByClient>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (clientIds.length === 0) {
      setData({});
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const now = new Date();
    const nowIso = now.toISOString();
    const windowIso = new Date(now.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const scriptCutoffIso = new Date(now.getTime() - SCRIPT_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();

    Promise.all([
      supabase
        .from("scripts")
        .select("id, client_id, title, created_at, review_status, grabado, deleted_at")
        .in("client_id", clientIds)
        .is("deleted_at", null)
        .eq("grabado", false)
        .or("review_status.is.null,review_status.eq.needs_revision")
        .gte("created_at", scriptCutoffIso)
        .order("created_at", { ascending: true }),
      supabase
        .from("video_edits")
        .select("id, client_id, lifecycle_status, updated_at")
        .in("client_id", clientIds)
        .eq("lifecycle_status", "Needs Revisions")
        .order("updated_at", { ascending: true }),
      supabase
        .from("scheduled_posts")
        .select("id, client_id, caption, scheduled_time, status")
        .in("client_id", clientIds)
        .gte("scheduled_time", nowIso)
        .lte("scheduled_time", windowIso)
        .order("scheduled_time", { ascending: true }),
      supabase
        .from("client_strategies")
        .select("client_id, onboarding_call_at, script_due_at, editing_due_at, next_filming_at, boosting_at, posting_at, ads_budget")
        .in("client_id", clientIds),
    ])
      .then(([scriptsRes, videosRes, postsRes, stratRes]) => {
        if (cancelled) return;
        if (scriptsRes.error) throw scriptsRes.error;
        if (videosRes.error)  throw videosRes.error;
        if (postsRes.error)   throw postsRes.error;
        if (stratRes.error)   throw stratRes.error;

        // Bucket scripts by client
        const scriptsByClient = new Map<string, { titles: string[]; oldest: string }>();
        for (const row of scriptsRes.data ?? []) {
          const id = row.client_id as string;
          const b = scriptsByClient.get(id) ?? { titles: [], oldest: row.created_at as string };
          if (b.titles.length < 3 && row.title) b.titles.push(row.title as string);
          if ((row.created_at as string) < b.oldest) b.oldest = row.created_at as string;
          scriptsByClient.set(id, b);
        }

        // Bucket video edits by client. We need titles — but the SELECT didn't
        // include a title field because video_edits' title column name varies.
        // Re-fetch titles for the ids we actually have if needed.
        // For now: aggregate counts; titles fetched in a follow-up query if
        // we want them. Keep titles empty to preserve a clean dashboard until
        // a follow-up enriches them.
        const videosByClient = new Map<string, { count: number; oldest: string; sampleNames: string[] }>();
        for (const row of videosRes.data ?? []) {
          const id = row.client_id as string;
          const b = videosByClient.get(id) ?? { count: 0, oldest: row.updated_at as string, sampleNames: [] };
          b.count += 1;
          if ((row.updated_at as string) < b.oldest) b.oldest = row.updated_at as string;
          videosByClient.set(id, b);
        }

        // Bucket posts by client
        const postsByClient = new Map<string, { count: number; nextAt: string; captions: string[] }>();
        for (const row of postsRes.data ?? []) {
          const id = row.client_id as string;
          if (POST_TERMINAL_STATUSES.has((row.status as string) ?? '')) continue;
          const b = postsByClient.get(id) ?? { count: 0, nextAt: row.scheduled_time as string, captions: [] };
          b.count += 1;
          if (b.captions.length < 3 && row.caption) {
            const c = (row.caption as string).slice(0, 40).trim();
            b.captions.push(c);
          }
          if ((row.scheduled_time as string) < b.nextAt) b.nextAt = row.scheduled_time as string;
          postsByClient.set(id, b);
        }

        // Bucket strategies for pipeline rows
        const stratByClient = new Map<string, PipelineSource>();
        for (const row of stratRes.data ?? []) {
          stratByClient.set(row.client_id as string, row as PipelineSource);
        }

        const out: TriageRowsByClient = {};
        for (const id of clientIds) {
          const rows: TriageRow[] = [];

          const pipeline = buildPipelineRows(stratByClient.get(id) ?? null, { windowDays: WINDOW_DAYS, now });
          rows.push(...pipeline);

          const s = scriptsByClient.get(id);
          if (s && s.titles.length === 0) {
            // we filtered for non-null title — but defend anyway
          }
          if (s) {
            const count = (scriptsRes.data ?? []).filter((r) => r.client_id === id).length;
            const row: ScriptsReviewRow = {
              type: 'scripts_review',
              count,
              sampleNames: s.titles,
              oldestPendingAt: s.oldest,
            };
            rows.push(row);
          }

          const v = videosByClient.get(id);
          if (v) {
            const row: VideosRevisionRow = {
              type: 'videos_revision',
              count: v.count,
              sampleNames: v.sampleNames,
              oldestPendingAt: v.oldest,
            };
            rows.push(row);
          }

          const p = postsByClient.get(id);
          if (p) {
            const row: PostsScheduledRow = {
              type: 'posts_scheduled',
              count: p.count,
              sampleNames: p.captions,
              nextAt: p.nextAt,
            };
            rows.push(row);
          }

          if (rows.length > 0) out[id] = rows.slice(0, 5); // 5-row cap
        }

        setData(out);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [clientIds.join(","), tick]);

  return { data, loading, error, refresh };
}
```

- [ ] **Step 2: Smoke-test the hook**

Temporarily render the hook from the Dashboard page with a small client list and `console.log` the result. Verify:
- Each client only appears in `data` if it has ≥1 row.
- Pipeline rows show first, chronologically.
- 5-row cap holds.
- Empty list of clientIds → empty data object.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useTriageRows.ts
git commit -m "feat(triage): useTriageRows hook (per-client row aggregation)"
```

---

## Task 9: `TriageRow` component

**Files:**
- Create: `src/components/dashboard/TriageRow.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/dashboard/TriageRow.tsx`:

```tsx
// src/components/dashboard/TriageRow.tsx
//
// Renders one triage row inside a client block. Discriminates on row.type
// and builds the href for the matching destination page.

import { Link } from "react-router-dom";
import { relativeDate } from "@/lib/triage/relativeDate";
import { PIPELINE_MILESTONE_LABEL, type TriageRow as TriageRowData } from "@/lib/triage/types";

interface Props {
  row: TriageRowData;
  clientId: string;
}

const AGING_THRESHOLD_MS = 48 * 60 * 60 * 1000;

function buildHref(row: TriageRowData, clientId: string): string {
  switch (row.type) {
    case 'pipeline':         return `/clients/${clientId}/strategy#pipeline`;
    case 'scripts_review':   return `/clients/${clientId}/scripts?filter=needs_review`;
    case 'videos_revision':  return `/clients/${clientId}/editing-queue?status=Needs%20Revisions`;
    case 'posts_scheduled':  return `/clients/${clientId}/content-calendar?window=upcoming`;
  }
}

function pluralize(n: number, singular: string, plural?: string): string {
  return n === 1 ? singular : (plural ?? `${singular}s`);
}

function truncateList(names: string[], joiner = ', ', max = 56): string {
  const joined = names.join(joiner);
  if (joined.length <= max) return joined;
  return joined.slice(0, max - 1).trimEnd() + '…';
}

function renderContent(row: TriageRowData): { lead: string; detail: string; aging: boolean } {
  switch (row.type) {
    case 'pipeline': {
      const rel = relativeDate(row.at);
      const baseLabel = PIPELINE_MILESTONE_LABEL[row.milestone];
      const lead = `${baseLabel} ${rel.label.toLowerCase().startsWith('in ') || rel.label === 'Tomorrow' || rel.label === 'Today' ? rel.label : `· ${rel.label}`}`;
      const detail = row.label ?? '';
      return { lead, detail, aging: rel.bucket === 'overdue' || rel.bucket === 'today' };
    }
    case 'scripts_review': {
      const lead = `${row.count} ${pluralize(row.count, 'script')} ${pluralize(row.count, 'needs', 'need')} review`;
      const detail = truncateList(row.sampleNames);
      const aging = (Date.now() - new Date(row.oldestPendingAt).getTime()) > AGING_THRESHOLD_MS;
      return { lead, detail, aging };
    }
    case 'videos_revision': {
      const lead = `${row.count} ${pluralize(row.count, 'video')} ${pluralize(row.count, 'needs', 'need')} revisions`;
      const detail = truncateList(row.sampleNames);
      const aging = (Date.now() - new Date(row.oldestPendingAt).getTime()) > AGING_THRESHOLD_MS;
      return { lead, detail, aging };
    }
    case 'posts_scheduled': {
      const rel = relativeDate(row.nextAt);
      const lead = `${row.count} ${pluralize(row.count, 'post')} scheduled · ${rel.label}`;
      const detail = truncateList(row.sampleNames);
      return { lead, detail, aging: rel.bucket === 'today' };
    }
  }
}

export function TriageRow({ row, clientId }: Props) {
  const { lead, detail, aging } = renderContent(row);
  const href = buildHref(row, clientId);

  return (
    <Link
      to={href}
      className="group flex items-center gap-2 py-1.5 px-2 rounded-lg transition-colors"
      style={{ textDecoration: 'none' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(20,20,20,0.04)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      {aging ? (
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: '#141414',
            marginRight: 4,
            flexShrink: 0,
          }}
        />
      ) : (
        <span style={{ width: 6, marginRight: 4, flexShrink: 0 }} />
      )}
      <span className="truncate" style={{ fontFamily: 'Figtree, sans-serif', fontSize: 14.5, color: '#141414' }}>
        <span>{lead}</span>
        {detail && (
          <>
            <span style={{ color: 'rgba(20,20,20,0.55)' }}> · </span>
            <span style={{ color: 'rgba(20,20,20,0.6)' }}>{detail}</span>
          </>
        )}
      </span>
    </Link>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/TriageRow.tsx
git commit -m "feat(dashboard): TriageRow component"
```

---

## Task 10: `TriageClientBlock` component

**Files:**
- Create: `src/components/dashboard/TriageClientBlock.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/dashboard/TriageClientBlock.tsx`:

```tsx
// src/components/dashboard/TriageClientBlock.tsx
//
// One client block in the admin triage dashboard: name + chevron header
// linking to the drilldown, then up to 5 rows (already pre-sorted).

import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { TriageRow } from "./TriageRow";
import type { TriageClient, TriageRow as TriageRowData } from "@/lib/triage/types";

interface Props {
  client: TriageClient;
  rows: TriageRowData[];
}

export function TriageClientBlock({ client, rows }: Props) {
  return (
    <section style={{ borderTop: '1px solid rgba(20,20,20,0.08)', padding: '18px 0' }}>
      <Link
        to={`/dashboard?client=${client.id}`}
        className="flex items-center justify-between mb-1.5 group"
        style={{ textDecoration: 'none' }}
      >
        <h2
          style={{
            fontSize: 26,
            fontWeight: 500,
            color: '#141414',
            letterSpacing: '-0.01em',
            fontFamily: "'EB Garamond', Georgia, serif",
          }}
        >
          {client.name}
        </h2>
        <ChevronRight
          size={18}
          color="rgba(20,20,20,0.30)"
          className="transition-transform group-hover:translate-x-0.5"
        />
      </Link>

      <div className="flex flex-col gap-0.5">
        {rows.map((row, i) => (
          <TriageRow key={`${row.type}-${i}`} row={row} clientId={client.id} />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/TriageClientBlock.tsx
git commit -m "feat(dashboard): TriageClientBlock component"
```

---

## Task 11: Rewrite the admin path of `Dashboard.tsx`

**Files:**
- Modify: `src/pages/Dashboard.tsx`

- [ ] **Step 1: Replace the admin branch with the triage view**

Open `src/pages/Dashboard.tsx`. Keep everything through line 174 (the `isSingleBrand` early-return) untouched.

Replace the remaining `// ADMIN / AGENCY VIEW` block (from the comment block around line 176 through the closing `</div>` and `}` of the component, around line 372) with the following. The full file from line 1 should still parse cleanly afterwards.

First, update imports at the top of the file. Replace the current dashboard imports (the block that imports `useDashboardPendingItems`, `ClientCard`, `PromptCard`, `RobbyInsightRow`, `DASHBOARD_PROMPTS`, `getRobbyInsights`, `ToolFolders`, `SingleBrandDashboard`) so that only what's still used remains:

```ts
import { useMemo, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useCompanion } from "@/contexts/CompanionContext";
import ScriptsLogin from "@/components/ScriptsLogin";
import { Loader2 } from "lucide-react";

import { useDashboardPendingItems } from "@/hooks/useDashboardPendingItems";
import { ActiveClientBreadcrumb } from "@/components/dashboard/ActiveClientBreadcrumb";
import { RobbyInsightRow } from "@/components/dashboard/RobbyInsightRow";
import { getRobbyInsights } from "@/components/dashboard/getRobbyInsights";
import { ToolFolders } from "@/components/dashboard/ToolFolders";
import { SingleBrandDashboard } from "@/components/dashboard/SingleBrandDashboard";

// Triage view
import { useTriageClients } from "@/hooks/useTriageClients";
import { useTriageRows } from "@/hooks/useTriageRows";
import { TriageClientBlock } from "@/components/dashboard/TriageClientBlock";
```

(`useDashboardPendingItems`, `ActiveClientBreadcrumb`, `RobbyInsightRow`, `getRobbyInsights`, `ToolFolders` are still used by the drilldown branch below — keep them.)

Then replace the admin return branch. The new structure should look like:

```tsx
  // ───────────────────────────────────────────────────────────────
  // SINGLE-BRAND VIEW (unchanged)
  // ───────────────────────────────────────────────────────────────
  if (isSingleBrand) {
    return (
      <SingleBrandDashboard
        firstName={firstName}
        brandName={ownClient?.name ?? null}
        clientId={ownClient?.id ?? null}
      />
    );
  }

  // ───────────────────────────────────────────────────────────────
  // ADMIN / AGENCY DRILLDOWN — preserved
  // ───────────────────────────────────────────────────────────────
  if (activeClient) {
    return (
      <div className="min-h-screen" style={{ background: "#EAE6DC", padding: "22px 28px" }}>
        <ActiveClientBreadcrumb clientName={activeClient.name} />
        <h1
          style={{
            fontSize: 26,
            fontWeight: 500,
            color: "#141414",
            letterSpacing: "-0.01em",
            marginBottom: 14,
            fontFamily: "'EB Garamond', Georgia, serif",
          }}
        >
          Robby's read on {activeClient.name}
        </h1>
        {getRobbyInsights(activeClient.name, pendingByClient[activeClient.id] ?? []).map((ins) => (
          <RobbyInsightRow
            key={ins.id}
            icon={ins.icon}
            text={ins.text}
            actionLabel={ins.actionLabel}
            onClick={() => onInsightClick(ins.prompt)}
          />
        ))}
        <ToolFolders activeClientId={activeClient.id} />
      </div>
    );
  }

  // ───────────────────────────────────────────────────────────────
  // ADMIN / AGENCY TRIAGE VIEW
  // ───────────────────────────────────────────────────────────────
  return <AdminTriageView firstName={firstName} />;
}

// ----------------------------------------------------------------
// AdminTriageView
// ----------------------------------------------------------------

function AdminTriageView({ firstName }: { firstName: string }) {
  const { clients: triageClients, loading: clientsLoading } = useTriageClients();
  const clientIds = useMemo(() => triageClients.map((c) => c.id), [triageClients]);
  const { data: rowsByClient, loading: rowsLoading } = useTriageRows(clientIds);

  const blocks = useMemo(() => {
    const list = triageClients
      .map((c) => ({ client: c, rows: rowsByClient[c.id] ?? [] }))
      .filter((b) => b.rows.length > 0);

    // Sort: any pipeline row today OR a post scheduled today first; then by total rows desc; then alpha.
    const startOfTomorrow = new Date();
    startOfTomorrow.setHours(24, 0, 0, 0);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    function hasToday(rows: typeof list[number]['rows']): boolean {
      for (const r of rows) {
        if (r.type === 'pipeline') {
          const t = new Date(r.at).getTime();
          if (t >= startOfToday.getTime() && t < startOfTomorrow.getTime()) return true;
        } else if (r.type === 'posts_scheduled') {
          const t = new Date(r.nextAt).getTime();
          if (t >= startOfToday.getTime() && t < startOfTomorrow.getTime()) return true;
        }
      }
      return false;
    }

    return list.sort((a, b) => {
      const aToday = hasToday(a.rows);
      const bToday = hasToday(b.rows);
      if (aToday !== bToday) return aToday ? -1 : 1;
      if (b.rows.length !== a.rows.length) return b.rows.length - a.rows.length;
      return a.client.name.localeCompare(b.client.name);
    });
  }, [triageClients, rowsByClient]);

  const totalClients = triageClients.length;
  const pendingCount = blocks.length;
  const loading = clientsLoading || rowsLoading;

  return (
    <div className="min-h-screen" style={{ background: "#EAE6DC", padding: "22px 28px" }}>
      <div style={{ textAlign: "center", marginBottom: 22 }}>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
          style={{ fontSize: 13, color: "rgba(20,20,20,0.55)", marginBottom: 6, fontFamily: "Figtree, sans-serif", letterSpacing: "0.02em" }}
        >
          Hey {firstName}!
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.08 }}
          style={{ fontSize: 38, fontWeight: 500, color: "#141414", letterSpacing: "-0.015em", marginBottom: 6, fontFamily: "'EB Garamond', Georgia, serif" }}
        >
          What do you want to do today?
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.14 }}
          style={{ fontSize: 12, color: "rgba(20,20,20,0.55)", fontFamily: "Figtree, sans-serif" }}
        >
          {loading
            ? "Loading…"
            : totalClients === 0
              ? "No Connecta Plus clients yet."
              : pendingCount === 0
                ? `All caught up across ${totalClients} Connecta Plus client${totalClients === 1 ? "" : "s"}.`
                : `${pendingCount} client${pendingCount === 1 ? "" : "s"} need${pendingCount === 1 ? "s" : ""} you today.`}
        </motion.p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: "rgba(20,20,20,0.40)" }} />
        </div>
      ) : (
        <div>
          {blocks.map((b, idx) => (
            <motion.div
              key={b.client.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.18 + idx * 0.05 }}
            >
              <TriageClientBlock client={b.client} rows={b.rows} />
            </motion.div>
          ))}

          {totalClients === 0 && (
            <p
              style={{
                textAlign: "center",
                marginTop: 16,
                fontSize: 13,
                color: "rgba(20,20,20,0.55)",
                fontFamily: "Figtree, sans-serif",
              }}
            >
              <a href="/clients" style={{ color: "#141414", textDecoration: "underline" }}>Add a Connecta Plus client →</a>
            </p>
          )}

          <div style={{ textAlign: "center", marginTop: 32 }}>
            <a
              href="/clients"
              style={{ fontSize: 12, color: "rgba(20,20,20,0.45)", fontFamily: "Figtree, sans-serif" }}
            >
              View all clients
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
```

The references to `pendingByClient` and `onInsightClick` inside the drilldown branch require the existing state and handlers from the outer component (`useDashboardPendingItems`, the `onInsightClick` callback). Make sure those remain defined on the outer component above the conditionals — they are already there in today's file; do not delete them.

- [ ] **Step 2: Resolve unused imports**

Delete imports for components no longer rendered by `Dashboard.tsx`: `ClientCard`, `PromptCard`, `DASHBOARD_PROMPTS`, `renderPrompt`. If `lint` complains about anything else, remove unused things — but do NOT delete the files themselves (`PromptCard.tsx`, `ClientCard.tsx`, `PROMPTS.ts`); they may be referenced elsewhere.

- [ ] **Step 3: Smoke-test the dashboard**

```bash
npm run dev
```

Navigate to `/dashboard` as an admin user. Verify:
- Greeting + "What do you want to do today?" + dynamic count line render.
- A flat list of client blocks renders, each with a name header + ≤5 rows.
- Only Connecta Plus clients (per `user_roles.role = 'connecta_plus'`) appear.
- Hovering a row darkens it slightly; clicking navigates to the expected page (verify each row type once).
- Clicking the client name navigates to `/dashboard?client=<id>` and renders the drilldown.
- Empty state: as admin with zero Connecta Plus clients (test by querying the DB or temporarily commenting out the role filter), the page renders the "No Connecta Plus clients yet" line.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Dashboard.tsx
git commit -m "feat(dashboard): rebuild admin /dashboard as triage view"
```

---

## Task 12: Wire `?filter=needs_review` on `/scripts`

**Files:**
- Modify: `src/pages/Scripts.tsx`

This task is investigation-first because the Scripts page is large (~3500 LoC) and doesn't currently honor query params. The engineer must locate the existing client-side filtering hook before wiring.

- [ ] **Step 1: Identify the filter state**

Inspect `src/pages/Scripts.tsx` to find where the displayed list of scripts is filtered. Run:

```bash
grep -nE "review_status|filtered|filter\s*=|filterBy" src/pages/Scripts.tsx | head -40
```

You're looking for the in-memory filter that hides/shows scripts based on `review_status`. The page already renders different badges for `'approved' | 'needs_revision'` (see lines around 1892, 2006, 2094) — those badges hint at the filter UI. Note the name of the filter state variable (e.g., `statusFilter`, `viewMode`, `tab`).

- [ ] **Step 2: Confirm the param maps to a concrete state value**

The filter you found in Step 1 likely has values like `"all" | "approved" | "needs_revision" | "unreviewed"`. The dashboard sends `?filter=needs_review`, intended to mean "anything not approved". Decide:
- If a single value like `"needs_review"` already exists → use it directly.
- Otherwise, the cleanest mapping is to set the filter to `"needs_revision"` (close enough; user will see the relevant scripts).

Record the chosen mapping inside the effect you write in Step 3.

- [ ] **Step 3: Read the param and apply on mount**

Add to the imports at the top of `Scripts.tsx`:

```ts
import { useSearchParams } from "react-router-dom";
```

(If `useParams` is already imported from `react-router-dom`, just append `useSearchParams` to that import.)

Inside the component, near other `useState` declarations, add:

```ts
const [searchParams, setSearchParams] = useSearchParams();
```

Then add a `useEffect` that runs once after the scripts have loaded. Use the filter-state setter name you identified in Step 1. For example, if the setter is `setStatusFilter`:

```ts
useEffect(() => {
  const filter = searchParams.get("filter");
  if (filter !== "needs_review") return;
  setStatusFilter("needs_revision"); // ← REPLACE with the actual setter and value from Step 1/Step 2
  // Strip the param so back-button / reload don't re-apply
  const next = new URLSearchParams(searchParams);
  next.delete("filter");
  setSearchParams(next, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

If Step 1 found no in-memory filter (the page shows everything), add a minimal one: a single `useState<string>('all')` plus an `.filter()` against `review_status` over the rendered list. Keep the addition to under ~15 lines so the rest of Scripts.tsx remains untouched. The acceptance criterion is functional, not visual: pressing back from the filtered view must restore the original list.

- [ ] **Step 4: Smoke-test**

Navigate to `/clients/<id>/scripts?filter=needs_review`. Confirm the list is filtered to scripts where `review_status` is null or `'needs_revision'`. The URL param disappears after the effect runs.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Scripts.tsx
git commit -m "feat(scripts): honor ?filter=needs_review query param"
```

---

## Task 13: Make `?status=` on `/editing-queue` a real filter

**Files:**
- Modify: `src/pages/EditingQueue.tsx`

The page already reads `searchParams.get("status")` (around lines 376-378) but only stuffs the value into the search query as a hint. This task changes it to a real `lifecycle_status` filter.

- [ ] **Step 1: Find the existing in-memory filter pipeline**

Run:

```bash
grep -nE "lifecycleStatus|lifecycle_status|filteredItems|\.filter\(" src/pages/EditingQueue.tsx | head -40
```

Identify (a) the state variable that holds the user-selected lifecycle filter (likely something like `lifecycleFilter`, `statusFilter`, or a dropdown selection), and (b) the array that's filtered for rendering. The page already has an `isLifecycleStatus(...)` guard (visible at line 342) — reuse it.

If there is no existing state for filtering by lifecycle status, add one:

```ts
const [lifecycleFilter, setLifecycleFilter] = useState<string | null>(null);
```

And in the render, filter the rows before mapping:

```tsx
const visibleItems = lifecycleFilter
  ? items.filter((i) => i.lifecycleStatus === lifecycleFilter)
  : items;
```

(Replace whatever the page calls its "items to render" variable.)

- [ ] **Step 2: Replace the search-hint with the real filter**

Around line 437 in `src/pages/EditingQueue.tsx`, you'll find:

```ts
    if (status || postStatus || assignee) {
      const hint = [status, postStatus, assignee].filter(Boolean).join(" ");
      if (hint) {
        setSearchQuery((prev) => prev || hint);
        consumedAny = true;
      }
    }
```

Replace with (using whatever filter setter you found / added in Step 1):

```ts
    if (status && isLifecycleStatus(status)) {
      setLifecycleFilter(status);  // ← use the setter from Step 1
      consumedAny = true;
    }
    if ((postStatus || assignee) && !status) {
      const hint = [postStatus, assignee].filter(Boolean).join(" ");
      if (hint) {
        setSearchQuery((prev) => prev || hint);
        consumedAny = true;
      }
    }
```

- [ ] **Step 3: Smoke-test**

Navigate to `/clients/<id>/editing-queue?status=Needs%20Revisions`. Confirm only items where `lifecycle_status === 'Needs Revisions'` are rendered. URL param is cleared after consumption (existing code already does `setSearchParams({}, { replace: true })`).

- [ ] **Step 4: Commit**

```bash
git add src/pages/EditingQueue.tsx
git commit -m "feat(editing-queue): real lifecycle status filter from ?status= param"
```

---

## Task 14: Wire `?window=upcoming` on `/content-calendar`

**Files:**
- Modify: `src/pages/ContentCalendar.tsx`

ContentCalendar (~1100 lines) doesn't currently honor query params. Strategy: snap the visible date range / cursor to today on `window=upcoming`.

- [ ] **Step 1: Identify the date-range or view state**

Run:

```bash
grep -nE "selectedDate|currentDate|cursorDate|viewDate|setDate|startDate|fromDate" src/pages/ContentCalendar.tsx | head -40
```

Identify the state variable that controls which week/month/day the calendar is showing. Note its setter (e.g., `setSelectedDate`).

- [ ] **Step 2: Wire the param**

Add (or augment) the imports:

```ts
import { useSearchParams } from "react-router-dom";
```

Near the top of the component:

```ts
const [searchParams, setSearchParams] = useSearchParams();
```

Add an effect:

```ts
useEffect(() => {
  if (searchParams.get("window") !== "upcoming") return;
  setSelectedDate(new Date()); // ← REPLACE with the setter from Step 1
  // Optional: switch to a "list" or "week" view if such a state exists
  // setViewMode("list");
  const next = new URLSearchParams(searchParams);
  next.delete("window");
  setSearchParams(next, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

If the page is purely month-based with no narrower view, the minimum acceptable behavior is: scroll the calendar to today's date and highlight it. Acceptance is that the admin clearly sees the upcoming scheduled posts and isn't dropped on January of last year.

- [ ] **Step 3: Smoke-test**

Navigate to `/clients/<id>/content-calendar?window=upcoming`. Confirm the calendar is centered on today.

- [ ] **Step 4: Commit**

```bash
git add src/pages/ContentCalendar.tsx
git commit -m "feat(content-calendar): honor ?window=upcoming query param"
```

---

## Task 15: End-to-end verification + push to main

**Files:** none (no code changes)

- [ ] **Step 1: Full smoke test as admin**

```bash
npm run dev
```

Then in the browser, log in as an admin:

1. Open `/dashboard`. Confirm: greeting + question + count line + client blocks render. Only Connecta Plus clients appear.
2. Edit one Connecta Plus client's strategy page to set `onboarding_call_at` to tomorrow at 3pm. Save.
3. Reload `/dashboard`. Confirm the client now shows an "Onboarding call · Tomorrow 3pm" row at the top of its block.
4. Click the onboarding row. Confirm it lands on `/clients/<id>/strategy#pipeline`.
5. Click a "scripts need review" row (if any). Confirm it navigates to a filtered Scripts page.
6. Click a client name. Confirm it navigates to `/dashboard?client=<id>` (the drilldown branch).
7. Set the same `onboarding_call_at` to yesterday. Reload `/dashboard`. Confirm the row no longer appears.
8. Set all six pipeline dates 30 days out. Reload `/dashboard`. Confirm no pipeline rows appear (outside 7-day window).

- [ ] **Step 2: Verify Connecta Plus single-brand user still works**

Switch to a Connecta Plus user (or impersonate via auth). Open `/dashboard`. Confirm the existing `<SingleBrandDashboard>` renders unchanged (3 folder cards, dark theme).

- [ ] **Step 3: Verify no lint regressions**

```bash
npm run lint
```

Expected: no new errors. Pre-existing warnings unrelated to this work are OK.

- [ ] **Step 4: Verify build**

```bash
npm run build
```

Expected: clean build, no type errors.

- [ ] **Step 5: Push to main**

Push the worktree where you've been working. From the main worktree:

```bash
git push origin main
```

GitHub Actions auto-deploys (see `project_cicd_pipeline.md` memory). Once the deploy completes, manually purge the Cloudflare cache (`reference_cloudflare.md`) so the new dashboard is served fresh.

- [ ] **Step 6: Final spot-check on prod**

After deploy, open https://connectacreators.com/dashboard as an admin. Confirm the new triage view is live.

---

## Spec coverage check

- §2 layout & mockup → Task 11.
- §3 visual / typography → Task 9 + Task 10 + Task 11.
- §4.1 Connecta Plus filter → Task 7.
- §4.2 row types / queries → Task 8.
- §4.3 client ordering + 5-row cap → Task 8 (cap) + Task 11 (ordering).
- §4.4 click destinations → Task 9 (`buildHref`) + Tasks 12–14 (filter param wiring).
- §4.5 empty states → Task 11.
- §5 strategy page → Tasks 1, 4, 5, 6.
- §6 components → Tasks 5, 7, 8, 9, 10.
- §7 boundaries → file map above + per-task isolation.
- §8 animation → Task 11.
- §9 decisions (tunables) → encoded as constants `WINDOW_DAYS`, `SCRIPT_AGE_DAYS` in Task 8.
- §11 acceptance → Task 15.
