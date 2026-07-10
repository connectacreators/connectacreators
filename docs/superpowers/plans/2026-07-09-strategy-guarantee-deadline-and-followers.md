# Strategy Guarantee Deadline + All-Platform Followers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the guarantee window's deadline be configured (1/3/6/12 months, or no limit) instead of hardcoded 90 days, and show combined follower counts across all linked platforms (not just Instagram) in the Strategy page header.

**Architecture:** One new nullable DB column (`client_strategies.views_goal_duration_months`) drives duration math already living in `ViewsGuaranteeCard`; the header reuses the `links` array (`useClientViralChannels`) already fetched by `ClientStrategy.tsx` to sum follower counts, with a double-click-toggled breakdown row.

**Tech Stack:** React + TypeScript, Supabase (Postgres + client-side `@supabase/supabase-js`), Tailwind utility classes, `lucide-react` icons.

## Global Constraints

- Work happens in this worktree, branch `worktree-strategy-guarantee-followers`, tracking `origin/main` — this is the live app; `feat/video-editor-phase-1` is unrelated/stale (see spec).
- Use `hsl(var(--...))` branding tokens for any new app-surface color, never raw hex, per existing repo convention (`ViewsGuaranteeCard.tsx` already follows this for the "Save" button).
- Apply the DB migration via Supabase MCP (`apply_migration`), not `supabase db push`.
- No new dependencies — reuse `fmtViews` / `PLATFORM_ICON` from `src/lib/viral-card-utils.tsx`.
- Spec: `docs/superpowers/specs/2026-07-09-strategy-guarantee-deadline-and-followers-design.md`.

---

### Task 1: DB migration — `views_goal_duration_months` column

**Files:**
- Create: `supabase/migrations/20260709_views_goal_duration_months.sql`

**Interfaces:**
- Produces: `client_strategies.views_goal_duration_months` (smallint, nullable, default `3`) — consumed by Task 3 (`ClientStrategy.tsx`) and indirectly Task 2 (`ViewsGuaranteeCard.tsx` prop).

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/20260709_views_goal_duration_months.sql
alter table client_strategies
  add column if not exists views_goal_duration_months smallint null default 3;

comment on column client_strategies.views_goal_duration_months is
  'Guarantee window length in months from views_goal_started_at. NULL = no deadline (default 3 preserves the prior hardcoded 90-day behavior).';
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Call the `apply_migration` MCP tool with:
- `name`: `views_goal_duration_months`
- `query`: the SQL from Step 1

Expected: tool reports success, no error.

- [ ] **Step 3: Verify the column exists**

Call the `execute_sql` MCP tool with:
```sql
select column_name, data_type, column_default, is_nullable
from information_schema.columns
where table_name = 'client_strategies' and column_name = 'views_goal_duration_months';
```

Expected: one row — `data_type = smallint`, `column_default = 3`, `is_nullable = YES`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260709_views_goal_duration_months.sql
git commit -m "$(cat <<'EOF'
feat(db): add client_strategies.views_goal_duration_months

Nullable duration (months) for the views-guarantee window; NULL means
no deadline. Default 3 preserves the previous hardcoded 90-day window.
EOF
)"
```

---

### Task 2: `ViewsGuaranteeCard` — configurable duration

**Files:**
- Modify: `src/components/strategy/ViewsGuaranteeCard.tsx` (full file — current content shown below as the "before" baseline)
- Test: manual (this component has no existing test file; verification is via Task 4's app smoke test)

**Interfaces:**
- Consumes: `client_strategies.views_goal_duration_months` (Task 1)
- Produces: `ViewsGuaranteeCard` prop `durationMonths: number | null` and `onPersistGoal` patch field `views_goal_duration_months?: number | null` — consumed by Task 3 (`ClientStrategy.tsx`)

Current file (baseline, for reference — do not skip re-reading it before editing, it may have moved since this plan was written):

```tsx
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Pencil, Check } from "lucide-react";
import { fmtViews, PLATFORM_ICON } from "@/lib/viral-card-utils";
import type { ClientChannelLink } from "@/hooks/useClientViralChannels";

const GUARANTEE_DAYS = 90;


// ── Views guarantee tracker ─────────────────────────────────────────────────
// "1M views in 90 days" (goal configurable): sums current view counts of all
// posts published inside the window, across every linked channel.
export function ViewsGuaranteeCard({ linked, en, viewsGoal, startedAt, fallbackStart, onPersistGoal }: {
  linked: ClientChannelLink[];
  en: boolean;
  viewsGoal: number;
  startedAt: string | null;
  fallbackStart: string | null;
  onPersistGoal?: (patch: { views_goal?: number; views_goal_started_at?: string | null }) => void;
}) {
  const [byPlatform, setByPlatform] = useState<Record<string, number> | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftGoal, setDraftGoal] = useState(String(viewsGoal));
  const [draftStart, setDraftStart] = useState("");

  // Window: explicit start > onboarding call > trailing 90 days.
  const startIso = startedAt || fallbackStart || new Date(Date.now() - GUARANTEE_DAYS * 86_400_000).toISOString();
  const usingFallback = !startedAt;
  const start = new Date(startIso);
  const end = new Date(start.getTime() + GUARANTEE_DAYS * 86_400_000);
  const now = new Date();
  const elapsedDays = Math.max(0, Math.min(GUARANTEE_DAYS, Math.floor((now.getTime() - start.getTime()) / 86_400_000)));
  const windowOver = now >= end;
  const daysLeft = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86_400_000));

  const channelIds = linked.map(l => l.channel!.id);
  const idsKey = channelIds.join(",");

  useEffect(() => {
    if (channelIds.length === 0) { setByPlatform({}); return; }
    let cancelled = false;
    supabase
      .from("viral_videos")
      .select("platform, views_count")
      .in("channel_id", channelIds)
      .gte("posted_at", start.toISOString())
      .lt("posted_at", end.toISOString())
      .limit(2000)
      .then(({ data, error }) => {
        if (cancelled) return;
        // A transient RLS/auth blip returns no rows — keep the last good totals
        // instead of flashing 0 views.
        if (error) return;
        const sums: Record<string, number> = {};
        for (const v of (data || []) as { platform: string; views_count: number }[]) {
          sums[v.platform] = (sums[v.platform] || 0) + (v.views_count || 0);
        }
        setByPlatform(sums);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, startIso]);

  const total = Object.values(byPlatform || {}).reduce((s, n) => s + n, 0);
  const pct = Math.min(100, (total / Math.max(1, viewsGoal)) * 100);
  const expectedByNow = viewsGoal * (elapsedDays / GUARANTEE_DAYS);
  const hit = total >= viewsGoal;
  const color = hit ? "#22c55e" : windowOver ? "#ef4444" : total >= expectedByNow ? "#22c55e" : total >= expectedByNow * 0.6 ? "#f59e0b" : "#ef4444";

  const fmtDate = (d: Date) => d.toLocaleDateString(en ? "en-US" : "es-MX", { month: "short", day: "numeric", year: "numeric" });

  const saveEdit = () => {
    const goal = Math.max(1, Math.round(Number(draftGoal) || viewsGoal));
    const patch: { views_goal: number; views_goal_started_at?: string | null } = { views_goal: goal };
    if (draftStart) {
      const [y, m, d] = draftStart.split("-").map(Number);
      patch.views_goal_started_at = new Date(y, m - 1, d).toISOString();
    }
    onPersistGoal?.(patch);
    setEditing(false);
  };

  return (
    <div className="glass-card rounded-xl p-5" style={{ border: `1px solid ${color}33` }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-bold tracking-[1px] uppercase" style={{ color }}>
          {fmtViews(viewsGoal)} {en ? "views guarantee" : "vistas garantizadas"}
        </span>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${color}12`, border: `1px solid ${color}38`, color }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
            {hit
              ? (en ? "Goal hit" : "Meta cumplida")
              : windowOver
                ? (en ? "Window ended" : "Ventana terminada")
                : (en ? `Day ${elapsedDays} of ${GUARANTEE_DAYS}` : `Día ${elapsedDays} de ${GUARANTEE_DAYS}`)}
          </span>
          {onPersistGoal && (
            <button onClick={() => { setDraftGoal(String(viewsGoal)); setDraftStart(startIso.slice(0, 10)); setEditing(e => !e); }}
              className="text-white/30 hover:text-white/70 transition-colors" title={en ? "Edit goal / start date" : "Editar meta / fecha de inicio"}>
              <Pencil className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <div className="flex items-end gap-3 flex-wrap mb-3">
          <label className="flex flex-col gap-1 text-[10px] text-white/40">
            {en ? "Views goal" : "Meta de vistas"}
            <input type="number" value={draftGoal} onChange={e => setDraftGoal(e.target.value)}
              className="bg-white/[0.06] border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-sm text-white outline-none w-36" />
          </label>
          <label className="flex flex-col gap-1 text-[10px] text-white/40">
            {en ? "Started working on" : "Inicio de trabajo"}
            <input type="date" value={draftStart} onChange={e => setDraftStart(e.target.value)}
              className="bg-white/[0.06] border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-sm text-white outline-none" />
          </label>
          <button onClick={saveEdit}
            className="flex items-center gap-1 text-[11px] font-semibold px-3 py-2 rounded-lg"
            style={{ background: "hsl(var(--aqua) / 0.12)", color: "hsl(var(--aqua))", border: "1px solid hsl(var(--aqua) / 0.3)" }}>
            <Check className="w-3 h-3" /> {en ? "Save" : "Guardar"}
          </button>
        </div>
      ) : null}

      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-black" style={{ color }}>
          {byPlatform === null ? "…" : fmtViews(total)}
        </span>
        <span className="text-xs text-white/35">/ {fmtViews(viewsGoal)} {en ? "views" : "vistas"}</span>
        {!windowOver && !hit && byPlatform !== null && (
          <span className="text-[11px] ml-auto" style={{ color }}>
            {total >= expectedByNow
              ? (en ? "on pace" : "al ritmo")
              : (en ? `expected ~${fmtViews(Math.round(expectedByNow))} by today` : `esperado ~${fmtViews(Math.round(expectedByNow))} hoy`)}
            {" · "}{daysLeft} {en ? "days left" : "días restantes"}
          </span>
        )}
      </div>
      <div className="relative h-2 rounded-full bg-white/[0.07] overflow-hidden mt-2 mb-3">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
        {!windowOver && (
          <div className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-white/50" style={{ left: `${Math.min(100, (expectedByNow / Math.max(1, viewsGoal)) * 100)}%` }} />
        )}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          {(["instagram", "tiktok", "youtube", "facebook"] as const).filter(p => (byPlatform?.[p] ?? 0) > 0 || linked.some(l => l.platform === p)).map(p => {
            const Icon = PLATFORM_ICON[p];
            return (
              <span key={p} className="flex items-center gap-1.5 text-[11px] text-white/60">
                {Icon && <Icon className="w-3.5 h-3.5 text-white/35" />}
                <span className="font-semibold text-white/80">{fmtViews(byPlatform?.[p] ?? 0)}</span>
              </span>
            );
          })}
        </div>
        <span className="text-[10px] text-white/30">
          {en ? "Posts published since" : "Posts publicados desde"} {fmtDate(start)}
          {usingFallback && (en ? " (auto — set an official start date)" : " (auto — define la fecha oficial de inicio)")}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 1: Replace the whole file with the duration-aware version**

```tsx
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Pencil, Check } from "lucide-react";
import { fmtViews, PLATFORM_ICON } from "@/lib/viral-card-utils";
import type { ClientChannelLink } from "@/hooks/useClientViralChannels";

const DEFAULT_DURATION_MONTHS = 3;
const DURATION_OPTIONS = [1, 3, 6, 12] as const;

function addMonths(d: Date, months: number): Date {
  const result = new Date(d.getTime());
  result.setMonth(result.getMonth() + months);
  return result;
}

// ── Views guarantee tracker ─────────────────────────────────────────────────
// "1M views in N months" (goal + deadline both configurable): sums current
// view counts of all posts published inside the window, across every linked
// channel. durationMonths === null means no deadline at all.
export function ViewsGuaranteeCard({ linked, en, viewsGoal, startedAt, durationMonths, fallbackStart, onPersistGoal }: {
  linked: ClientChannelLink[];
  en: boolean;
  viewsGoal: number;
  startedAt: string | null;
  durationMonths: number | null;
  fallbackStart: string | null;
  onPersistGoal?: (patch: { views_goal?: number; views_goal_started_at?: string | null; views_goal_duration_months?: number | null }) => void;
}) {
  const [byPlatform, setByPlatform] = useState<Record<string, number> | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftGoal, setDraftGoal] = useState(String(viewsGoal));
  const [draftStart, setDraftStart] = useState("");
  const [draftDuration, setDraftDuration] = useState<string>(String(durationMonths ?? ""));

  // Window: explicit start > onboarding call > trailing default-duration window.
  const startIso = startedAt || fallbackStart || new Date(Date.now() - DEFAULT_DURATION_MONTHS * 30 * 86_400_000).toISOString();
  const usingFallback = !startedAt;
  const start = new Date(startIso);
  const end = durationMonths == null ? null : addMonths(start, durationMonths);
  const now = new Date();
  const totalWindowDays = end ? Math.round((end.getTime() - start.getTime()) / 86_400_000) : null;
  const elapsedDaysRaw = Math.floor((now.getTime() - start.getTime()) / 86_400_000);
  const elapsedDays = Math.max(0, totalWindowDays != null ? Math.min(totalWindowDays, elapsedDaysRaw) : elapsedDaysRaw);
  const windowOver = end ? now >= end : false;
  const daysLeft = end ? Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86_400_000)) : null;

  const channelIds = linked.map(l => l.channel!.id);
  const idsKey = channelIds.join(",");

  useEffect(() => {
    if (channelIds.length === 0) { setByPlatform({}); return; }
    let cancelled = false;
    let query = supabase
      .from("viral_videos")
      .select("platform, views_count")
      .in("channel_id", channelIds)
      .gte("posted_at", start.toISOString());
    if (end) query = query.lt("posted_at", end.toISOString());
    query
      .limit(2000)
      .then(({ data, error }) => {
        if (cancelled) return;
        // A transient RLS/auth blip returns no rows — keep the last good totals
        // instead of flashing 0 views.
        if (error) return;
        const sums: Record<string, number> = {};
        for (const v of (data || []) as { platform: string; views_count: number }[]) {
          sums[v.platform] = (sums[v.platform] || 0) + (v.views_count || 0);
        }
        setByPlatform(sums);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, startIso, durationMonths]);

  const total = Object.values(byPlatform || {}).reduce((s, n) => s + n, 0);
  const pct = Math.min(100, (total / Math.max(1, viewsGoal)) * 100);
  const expectedByNow = totalWindowDays != null ? viewsGoal * (elapsedDays / Math.max(1, totalWindowDays)) : null;
  const hit = total >= viewsGoal;
  // Bare hex (not an hsl() token) because the border/badge styles below
  // append a hex alpha suffix directly onto `color` (e.g. `${color}33`).
  const color = hit
    ? "#22c55e"
    : windowOver
      ? "#ef4444"
      : expectedByNow == null
        ? "#8FD0D5"
        : total >= expectedByNow ? "#22c55e" : total >= expectedByNow * 0.6 ? "#f59e0b" : "#ef4444";

  const fmtDate = (d: Date) => d.toLocaleDateString(en ? "en-US" : "es-MX", { month: "short", day: "numeric", year: "numeric" });

  const saveEdit = () => {
    const goal = Math.max(1, Math.round(Number(draftGoal) || viewsGoal));
    const patch: { views_goal: number; views_goal_started_at?: string | null; views_goal_duration_months?: number | null } = {
      views_goal: goal,
      views_goal_duration_months: draftDuration === "" ? null : Math.max(1, Math.round(Number(draftDuration))),
    };
    if (draftStart) {
      const [y, m, d] = draftStart.split("-").map(Number);
      patch.views_goal_started_at = new Date(y, m - 1, d).toISOString();
    }
    onPersistGoal?.(patch);
    setEditing(false);
  };

  return (
    <div className="glass-card rounded-xl p-5" style={{ border: `1px solid ${color}33` }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-bold tracking-[1px] uppercase" style={{ color }}>
          {fmtViews(viewsGoal)} {en ? "views guarantee" : "vistas garantizadas"}
        </span>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${color}12`, border: `1px solid ${color}38`, color }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
            {hit
              ? (en ? "Goal hit" : "Meta cumplida")
              : windowOver
                ? (en ? "Window ended" : "Ventana terminada")
                : totalWindowDays != null
                  ? (en ? `Day ${elapsedDays} of ${totalWindowDays}` : `Día ${elapsedDays} de ${totalWindowDays}`)
                  : (en ? `Day ${elapsedDays}` : `Día ${elapsedDays}`)}
          </span>
          {onPersistGoal && (
            <button onClick={() => { setDraftGoal(String(viewsGoal)); setDraftStart(startIso.slice(0, 10)); setDraftDuration(String(durationMonths ?? "")); setEditing(e => !e); }}
              className="text-white/30 hover:text-white/70 transition-colors" title={en ? "Edit goal / start date" : "Editar meta / fecha de inicio"}>
              <Pencil className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <div className="flex items-end gap-3 flex-wrap mb-3">
          <label className="flex flex-col gap-1 text-[10px] text-white/40">
            {en ? "Views goal" : "Meta de vistas"}
            <input type="number" value={draftGoal} onChange={e => setDraftGoal(e.target.value)}
              className="bg-white/[0.06] border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-sm text-white outline-none w-36" />
          </label>
          <label className="flex flex-col gap-1 text-[10px] text-white/40">
            {en ? "Started working on" : "Inicio de trabajo"}
            <input type="date" value={draftStart} onChange={e => setDraftStart(e.target.value)}
              className="bg-white/[0.06] border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-sm text-white outline-none" />
          </label>
          <label className="flex flex-col gap-1 text-[10px] text-white/40">
            {en ? "Guarantee length" : "Duración de garantía"}
            <select value={draftDuration} onChange={e => setDraftDuration(e.target.value)}
              className="bg-white/[0.06] border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-sm text-white outline-none">
              {DURATION_OPTIONS.map(m => (
                <option key={m} value={m} className="bg-black">
                  {m} {en ? (m === 1 ? "month" : "months") : (m === 1 ? "mes" : "meses")}
                </option>
              ))}
              <option value="" className="bg-black">{en ? "No limit" : "Sin límite"}</option>
            </select>
          </label>
          <button onClick={saveEdit}
            className="flex items-center gap-1 text-[11px] font-semibold px-3 py-2 rounded-lg"
            style={{ background: "hsl(var(--aqua) / 0.12)", color: "hsl(var(--aqua))", border: "1px solid hsl(var(--aqua) / 0.3)" }}>
            <Check className="w-3 h-3" /> {en ? "Save" : "Guardar"}
          </button>
        </div>
      ) : null}

      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-black" style={{ color }}>
          {byPlatform === null ? "…" : fmtViews(total)}
        </span>
        <span className="text-xs text-white/35">/ {fmtViews(viewsGoal)} {en ? "views" : "vistas"}</span>
        {!windowOver && !hit && byPlatform !== null && expectedByNow != null && (
          <span className="text-[11px] ml-auto" style={{ color }}>
            {total >= expectedByNow
              ? (en ? "on pace" : "al ritmo")
              : (en ? `expected ~${fmtViews(Math.round(expectedByNow))} by today` : `esperado ~${fmtViews(Math.round(expectedByNow))} hoy`)}
            {daysLeft != null && <>{" · "}{daysLeft} {en ? "days left" : "días restantes"}</>}
          </span>
        )}
      </div>
      <div className="relative h-2 rounded-full bg-white/[0.07] overflow-hidden mt-2 mb-3">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
        {!windowOver && expectedByNow != null && (
          <div className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-white/50" style={{ left: `${Math.min(100, (expectedByNow / Math.max(1, viewsGoal)) * 100)}%` }} />
        )}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          {(["instagram", "tiktok", "youtube", "facebook"] as const).filter(p => (byPlatform?.[p] ?? 0) > 0 || linked.some(l => l.platform === p)).map(p => {
            const Icon = PLATFORM_ICON[p];
            return (
              <span key={p} className="flex items-center gap-1.5 text-[11px] text-white/60">
                {Icon && <Icon className="w-3.5 h-3.5 text-white/35" />}
                <span className="font-semibold text-white/80">{fmtViews(byPlatform?.[p] ?? 0)}</span>
              </span>
            );
          })}
        </div>
        <span className="text-[10px] text-white/30">
          {en ? "Posts published since" : "Posts publicados desde"} {fmtDate(start)}
          {usingFallback && (en ? " (auto — set an official start date)" : " (auto — define la fecha oficial de inicio)")}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p .` (from repo root of this worktree)
Expected: exit code 0, no errors referencing `ViewsGuaranteeCard.tsx` (Task 3 wires the caller next — a dangling `durationMonths` prop error at the call site is expected until Task 3 lands; if this task is run standalone, confirm no *other* errors exist in this file).

- [ ] **Step 3: Commit**

```bash
git add src/components/strategy/ViewsGuaranteeCard.tsx
git commit -m "$(cat <<'EOF'
feat(strategy): make views-guarantee deadline configurable

Replace the hardcoded 90-day GUARANTEE_DAYS with a durationMonths prop
(1/3/6/12, or null for no deadline). Badge, pace marker, and color
logic all degrade gracefully when there's no deadline.
EOF
)"
```

---

### Task 3: Wire duration prop through `ClientStrategy.tsx`

**Files:**
- Modify: `src/pages/ClientStrategy.tsx:17` (interface), `:40-41`, `:92-93` (defaults), `:595-602` (call site)

**Interfaces:**
- Consumes: `ViewsGuaranteeCard` prop `durationMonths` and `onPersistGoal` patch shape (Task 2)
- Produces: nothing new for later tasks (this closes out Feature 1)

- [ ] **Step 1: Add the field to the `ClientStrategy` interface**

In `src/pages/ClientStrategy.tsx`, find:

```tsx
  views_goal: number;
  views_goal_started_at: string | null;
```

Replace with:

```tsx
  views_goal: number;
  views_goal_started_at: string | null;
  views_goal_duration_months: number | null;
```

- [ ] **Step 2: Add the field to `DEFAULTS`**

Find:

```tsx
  views_goal: 1_000_000,
  views_goal_started_at: null,
```

Replace with:

```tsx
  views_goal: 1_000_000,
  views_goal_started_at: null,
  views_goal_duration_months: 3,
```

- [ ] **Step 3: Pass the prop at the call site**

Find:

```tsx
        <ViewsGuaranteeCard
          linked={links.filter(l => l.channel)}
          en={en}
          viewsGoal={s.views_goal ?? 1_000_000}
          startedAt={s.views_goal_started_at ?? null}
          fallbackStart={s.onboarding_call_at}
          onPersistGoal={isTeam ? (patch) => persistFields(patch as Partial<ClientStrategy>) : undefined}
        />
```

Replace with:

```tsx
        <ViewsGuaranteeCard
          linked={links.filter(l => l.channel)}
          en={en}
          viewsGoal={s.views_goal ?? 1_000_000}
          startedAt={s.views_goal_started_at ?? null}
          durationMonths={s.views_goal_duration_months ?? 3}
          fallbackStart={s.onboarding_call_at}
          onPersistGoal={isTeam ? (patch) => persistFields(patch as Partial<ClientStrategy>) : undefined}
        />
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: exit code 0, no errors.

- [ ] **Step 5: Manual smoke test**

Run: `npm run dev` (or the project's existing dev script), open a client's `/strategy` page as a team/admin user, click the pencil icon on the views-guarantee card.
Expected: a "Guarantee length" dropdown appears with 1/3/6/12 months and "No limit". Select "No limit", click Save, confirm the badge changes to "Day N" (no "of N") and the page doesn't error. Reload and confirm the choice persisted. Set it back to "3 months" and confirm behavior matches the pre-change UI (Day N of ~90).

- [ ] **Step 6: Commit**

```bash
git add src/pages/ClientStrategy.tsx
git commit -m "$(cat <<'EOF'
feat(strategy): persist views_goal_duration_months from the UI

Wires the new duration field from client_strategies through to
ViewsGuaranteeCard so the guarantee deadline is editable end to end.
EOF
)"
```

---

### Task 4: All-platform follower count in the header

**Files:**
- Modify: `src/pages/ClientStrategy.tsx:193` (state block), `:439-465` (header JSX)

**Interfaces:**
- Consumes: `links: ClientChannelLink[]` (already in scope at line 201, from `useClientViralChannels`), `PLATFORM_ICON` and `fmtViews` from `src/lib/viral-card-utils.tsx`
- Produces: nothing consumed by other tasks — this is the last task.

- [ ] **Step 1: Add the toggle state and import `PLATFORM_ICON`**

Find the top-of-file import:

```tsx
import { ViewsGuaranteeCard } from "@/components/strategy/ViewsGuaranteeCard";
```

Add directly below it:

```tsx
import { PLATFORM_ICON, fmtViews } from "@/lib/viral-card-utils";
```

Find:

```tsx
  const [editing, setEditing] = useState(false);
```

Add directly below it:

```tsx
  const [showFollowerBreakdown, setShowFollowerBreakdown] = useState(false);
```

- [ ] **Step 2: Replace the header follower line**

Find:

```tsx
          <div>
            <h1 className="text-xl font-black text-foreground font-serif">{en ? "Content Strategy" : "Estrategia de Contenido"}</h1>
            {clientOnboarding.instagram ? (
              <p className="text-xs text-muted-foreground mt-0.5">
                @{String(clientOnboarding.instagram).replace(/^@/, "")}
                {(s.audience_analysis as any)?.followers ? ` · ${((s.audience_analysis as any).followers as number).toLocaleString()} followers` : ""}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-0.5">{en ? "Robby reads this before every content decision" : "Robby lee esto antes de cada decisión de contenido"}</p>
            )}
          </div>
```

Replace with:

```tsx
          <div>
            <h1 className="text-xl font-black text-foreground font-serif">{en ? "Content Strategy" : "Estrategia de Contenido"}</h1>
            {clientOnboarding.instagram ? (
              <>
                <p
                  className="text-xs text-muted-foreground mt-0.5 select-none cursor-pointer"
                  onDoubleClick={() => setShowFollowerBreakdown(v => !v)}
                  title={en ? "Double-click for per-platform breakdown" : "Doble clic para ver el desglose por plataforma"}
                >
                  @{String(clientOnboarding.instagram).replace(/^@/, "")}
                  {(() => {
                    const linkedWithChannel = links.filter(l => l.channel);
                    const totalFollowers = linkedWithChannel.reduce((sum, l) => sum + (l.channel?.follower_count ?? 0), 0);
                    return totalFollowers > 0 ? ` · ${fmtViews(totalFollowers)} followers` : "";
                  })()}
                </p>
                {showFollowerBreakdown && (
                  <div className="flex items-center gap-3 flex-wrap mt-1">
                    {links.filter(l => l.channel && (l.channel.follower_count ?? 0) > 0).map(l => {
                      const Icon = PLATFORM_ICON[l.platform];
                      return (
                        <span key={l.platform} className="flex items-center gap-1.5 text-[11px] text-white/60">
                          {Icon && <Icon className="w-3.5 h-3.5 text-white/35" />}
                          <span className="font-semibold text-white/80">{fmtViews(l.channel!.follower_count ?? 0)}</span>
                        </span>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground mt-0.5">{en ? "Robby reads this before every content decision" : "Robby lee esto antes de cada decisión de contenido"}</p>
            )}
          </div>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: exit code 0, no errors.

- [ ] **Step 4: Manual smoke test**

Run the dev server, open a client's `/strategy` page for a client with 2+ linked platforms (e.g. IG + TikTok).
Expected: header shows one combined follower count (e.g. "24.4K followers"). Double-click it — a row of platform icons + per-platform counts appears below. Double-click again — it collapses. Confirm a client with zero linked channels shows no follower text (no " · 0 followers" artifact) and no crash.

- [ ] **Step 5: Commit**

```bash
git add src/pages/ClientStrategy.tsx
git commit -m "$(cat <<'EOF'
feat(strategy): show combined follower count across all linked platforms

Header previously showed Instagram-only followers from audience_analysis.
Now sums follower_count across every linked channel (IG/TikTok/FB/YouTube)
already fetched via useClientViralChannels, with a double-click-toggled
per-platform breakdown.
EOF
)"
```

---

## Post-implementation

Once all 4 tasks are committed in this worktree, use `superpowers:finishing-a-development-branch` to decide how to land `worktree-strategy-guarantee-followers` onto `main` (push + PR, or direct merge) — per [[feedback_ship_by_default]], confirm the diff looks right, then ship without re-asking.
