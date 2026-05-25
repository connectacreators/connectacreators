# Admin Dashboard — Triage Rebuild

**Status:** Draft for review
**Date:** 2026-05-25
**Scope:** Rebuild `/dashboard` for the admin/agency role. Includes a new per-client "Production pipeline" section on `/clients/:id/strategy` whose dates feed the dashboard. Connecta Plus role dashboard is a separate spec (to be written next).

## 1. Why

Today's `/dashboard` greets the admin with a generic "What are we doing today?" hero, then shows three sections of roughly equal weight: a client roster, six "Start with Robby" prompt cards, and tool folders. The admin's actual job when they open this page is **triage**: figure out which clients need attention right now and jump into the specific resource that needs work.

The current layout doesn't optimize for that. The prompt cards are a launcher (a different job), the tool folders duplicate the sidebar, and the client roster shows only count badges ("3 to approve") with no per-item detail — the admin still has to click into each client to learn what's actually waiting.

## 2. What we're building

A focused triage page. When the admin lands on `/dashboard`:

```
Hey Roberto!
What do you want to do today?

────────────────────────────────────────────────
Acme Co.                                       →
  Onboarding call tomorrow · 3:00pm
  Script due Fri · "Q3 launch"
  3 scripts need review · QuickWins, ColdOpen, Patient testim…
  2 videos need revisions · Reel A, Cold open
  1 post scheduled · today 3:00pm — "Q3 launch"

────────────────────────────────────────────────
Dr Calvin                                      →
  Filming Tue Jun 10
  1 script needs review · Patient testimonial v2

────────────────────────────────────────────────
Bella's Beauty                                 →
  Boosting Sat · $200 budget
  2 videos need revisions · Hair tutorial, Brow reel
```

The page shows **only Connecta Plus clients with pending work or imminent pipeline dates**. Each client block has up to **five rows total** — pipeline date rows (within next 7 days, soonest first) come first, then grouped count rows (scripts/videos/posts). Each row is a link: count rows go to that resource's filtered page; pipeline rows go to `/clients/<id>/strategy`.

### Out of scope for this page

- The six "Start with Robby" prompt cards — removed.
- The `<ToolFolders>` section — removed (tool folders remain in the sidebar).
- Lead-related rows — `Leads` are surfaced on the Connecta Plus dashboard (separate spec), not the admin triage view.
- The `?client=<id>` drilldown view in the current Dashboard (Robby's read, ActiveClientBreadcrumb, ToolFolders) — moves to a dedicated route in a later phase, or stays where it is. **For this rebuild we keep the existing drilldown route working but stop entering it from the dashboard header — the client name in each block links to it.**

## 3. Layout & visual

- Background: `#EAE6DC` (existing editorial palette token).
- Padding: `22px 28px` (matches current Dashboard.tsx).
- Header block:
  - Greeting line: `Hey {firstName}!` — Figtree, ~14px, `rgba(20,20,20,0.55)`.
  - Subtitle: `What do you want to do today?` — EB Garamond, ~38px, weight 500, color `#141414`, letter-spacing `-0.015em`.
  - The dynamic count line ("3 clients need you today" / "All caught up across 8 clients") sits one line below the subtitle as the third line of the header, in Figtree ~12px, `rgba(20,20,20,0.55)`.
- Client list: vertical stack of client blocks. Hairline divider (`1px rgba(20,20,20,0.08)`) between blocks. No card chrome — the page is a quiet typographic list.
- Per-client block:
  - **Client name**: EB Garamond, ~26px, weight 500, `#141414`. A subtle `→` chevron at right; the whole header is a link to `/dashboard?client=<id>`.
  - **Rows below**: Figtree, ~14.5px, `#141414` for the lead, `rgba(20,20,20,0.6)` for the truncated names after the middle-dot separator.
  - **Row hover**: background nudges to `rgba(20,20,20,0.04)`, rounded 8px.
  - **Aging indicator**: if any item in the row has been pending > 48 hours, a small ink-color dot (`6px`) sits to the left of the row. No badges, no chips, no buttons.
- Truncation: each row is one line. Text overflows with ellipsis at the viewport edge — it never wraps.

## 4. Data

### 4.1 Which clients show up

A new hook `useTriageClients()` returns Connecta Plus clients only:

```ts
// Pseudocode
clients
  INNER JOIN subscriber_clients ON subscriber_clients.client_id = clients.id
  INNER JOIN user_roles ON user_roles.user_id = subscriber_clients.subscriber_user_id
  WHERE user_roles.role = 'connecta_plus'
```

Implement with a Supabase `select` using nested joins; do not fetch all clients then filter in JS. Deduplicate (one client could have multiple linked subscribers).

A small "View all clients" link (Figtree, 12px, dim) sits at the bottom of the page for the admin to reach the unfiltered roster when needed. Points to `/clients` (or the equivalent existing route — confirm during implementation).

### 4.2 Which rows show up per client

A new hook `useTriageRows(clientIds: string[])` returns per-client row data:

```ts
type PipelineMilestone =
  | 'onboarding_call'
  | 'script_due'
  | 'editing_due'
  | 'filming'
  | 'boosting'
  | 'posting';

type TriageRow =
  | {
      type: 'pipeline';
      milestone: PipelineMilestone;
      at: string;        // ISO; absolute date/time
      label?: string;    // optional context (e.g., boosting budget, script title)
    }
  | {
      type: 'scripts_review';
      count: number;
      sampleNames: string[];   // up to 3 most-recent script titles
      oldestPendingAt: string; // ISO; drives the aging dot
    }
  | {
      type: 'videos_revision';
      count: number;
      sampleNames: string[];   // up to 3 most-recent video edit titles
      oldestPendingAt: string;
    }
  | {
      type: 'posts_scheduled';
      count: number;
      sampleNames: string[];   // up to 3 next-scheduled post titles (or captions truncated)
      nextAt: string;           // ISO; drives the "today 3:00pm" label
    };

type TriageRowsByClient = Record<string /* clientId */, TriageRow[]>;
```

Source queries:

- **scripts_review** — from `scripts` where:
  - `client_id` in scope
  - `deleted_at IS NULL`
  - `(review_status IS NULL OR review_status = 'needs_revision')` — both "not yet reviewed" and "sent back for revisions" qualify (per design decision).
  - `grabado = false` — already-recorded scripts moved on, even if still unapproved.
  - `created_at > now() - interval '60 days'` — guard against ancient scripts inflating the count. **Tunable**; documented as a default the admin can adjust later.
- **videos_revision** — from `video_edits` where `client_id` in scope and `lifecycle_status = 'Needs Revisions'`. (Same source the existing `useDashboardPendingItems` already uses.)
- **posts_scheduled** — from `scheduled_posts` where `client_id` in scope, `scheduled_at >= now()`, `scheduled_at <= now() + interval '7 days'`, and `status NOT IN ('published','canceled','failed')`. (We surface upcoming, not in-flight failures — failures could be a future row type if needed.)
- **pipeline (×6)** — from `client_strategies` columns `onboarding_call_at`, `script_due_at`, `editing_due_at`, `next_filming_at`, `boosting_at`, `posting_at`. A pipeline row is emitted for each non-null date where `date >= now()` and `date <= now() + interval '7 days'`. Each becomes a single `TriageRow` of `type: 'pipeline'`. The `label` is derived per milestone: `boosting` uses `ads_budget` if set ("$200 budget"); `script_due` / `editing_due` / `posting` use the linked content title if obvious (otherwise omitted); `onboarding_call` uses the time-of-day ("3:00pm") if present.

For each type, `sampleNames` is the top 3 sorted by relevance:
- scripts: oldest `created_at` first (oldest pending = most needs attention)
- videos: oldest `updated_at` first
- posts: nearest `scheduled_at` first

A client appears in the triage list iff it has at least one row.

### 4.3 Client ordering & per-client row ordering

**Client ordering** — soft urgency sort:

1. Clients with any **pipeline row dated today** OR a `posts_scheduled` row whose `nextAt` is today → top.
2. Then clients with at least one pipeline row within the next 7 days (sorted by their soonest pipeline date).
3. Then by total pending count across count rows (descending).
4. Ties broken alphabetically by client name.

**Per-client row ordering** — within a single client block:

1. Pipeline rows first, chronological (soonest `at` first).
2. Then count rows in this order: scripts_review, videos_revision, posts_scheduled.
3. Cap at **5 rows per client**. If a client has more, the implicit truncation is acceptable — the chevron next to the client name leads to the drilldown / strategy page where the full picture lives. (No "+N more" affordance; keeps the visual quiet.)

### 4.4 Row click destinations

Each row navigates to the resource page for that client, pre-filtered:

| Row type | Click target |
|---|---|
| `pipeline` (any milestone) | `/clients/<id>/strategy#pipeline` |
| `scripts_review` | `/scripts?client=<id>&filter=needs_review` |
| `videos_revision` | `/edit-queue?client=<id>&status=needs_revisions` |
| `posts_scheduled` | `/scheduler?client=<id>&window=upcoming` |

If the target pages don't already honor those query params, adding the filter wiring is part of this work. Plan steps to:

1. Read each target page's current query-param handling.
2. Add support for the filter param if missing — without changing default behavior when the param is absent.
3. Verify the link from the triage row produces a pre-filtered view.

### 4.5 Empty states

- No Connecta Plus clients exist → header subtitle becomes `What do you want to do today?` (unchanged) and below it: `No Connecta Plus clients yet.` with a link to `/clients` to add one. No client blocks render.
- Connecta Plus clients exist, all caught up → header count line: `All caught up across N Connecta Plus clients.` No client blocks render.
- Loading → centered spinner replacing the client list; header still visible.
- Error fetching → small inline error line under the header; never blank the page.

## 5. Strategy page — Production pipeline section

### 5.1 Schema (extension of `client_strategies`)

Add the following columns. Migration is purely additive — no existing column moves or changes type.

```sql
ALTER TABLE client_strategies
  ADD COLUMN onboarding_call_at  timestamptz,
  ADD COLUMN script_due_at       timestamptz,
  ADD COLUMN editing_due_at      timestamptz,
  ADD COLUMN next_filming_at     timestamptz,
  ADD COLUMN boosting_at         timestamptz,
  ADD COLUMN posting_at          timestamptz,
  ADD COLUMN pipeline_notes      text;
```

All fields nullable. Admin enters dates as they're known; missing = nothing surfaces on the dashboard for that milestone. Existing `ads_active` and `ads_budget` are **reused** (no duplication).

`timestamptz` not `date` so an admin can specify a time (e.g., onboarding call at 3:00pm). UI may collapse to date-only entry if simpler — the column accommodates either.

### 5.2 UI on `/clients/:id/strategy`

A new section titled **Production pipeline** added to the existing strategy page, anchored at `#pipeline` (so dashboard rows can deep-link to it). Layout: a compact two-column table — milestone label on the left, editable date input on the right. After the dates, two fields: the existing **Ads active** toggle and **Ads budget** input (already on the page — leave them where they are if it makes more sense visually; otherwise group them inside this section).

```
Production pipeline                                            ┌─────┐
                                                               │ Save│
                                                               └─────┘
  Onboarding call          [ 2026-05-30  3:00pm  ]   [Clear]
  Script due               [ 2026-06-02           ]   [Clear]
  Editing due              [ 2026-06-06           ]   [Clear]
  Next filming             [ 2026-06-10           ]   [Clear]
  Boosting                 [ 2026-06-15           ]   [Clear]
  Posting                  [ 2026-06-12           ]   [Clear]

  Notes
  ┌────────────────────────────────────────────────────────────────┐
  │ Waiting on raw footage from client. Filming pushed from Mon.   │
  └────────────────────────────────────────────────────────────────┘
```

Each row shows a small status hint to the right of the date input:
- Within next 24h → "Tomorrow" (amber)
- Within next 7 days → relative day ("In 3 days", "Fri")
- In the past → "Overdue" (red — until admin updates or clears)
- Far future → absolute date

The notes textarea is free-form and persists on save. Notes do **not** surface as dashboard rows — they're context for the admin when they land on the strategy page.

### 5.3 Save behavior

Save button writes all pipeline fields in one update (joined with the existing strategy save if practical, or as a separate "Save pipeline" if simpler). Use the existing toast-on-save pattern from `ClientStrategy.tsx`. No autosave — explicit save matches the rest of that page.

## 6. Components

New files:

- `src/components/dashboard/TriageClientBlock.tsx` — renders one client block: name header + rows.
- `src/components/dashboard/TriageRow.tsx` — renders a single row. Discriminates on `row.type`: pipeline rows render milestone label + relative date + optional context label; count rows render count + label + middle-dot + truncated names + optional aging dot. Builds the link href internally based on row type.
- `src/hooks/useTriageClients.ts` — fetches the Connecta Plus client list. Returns `{ clients, loading, error, refresh }`.
- `src/hooks/useTriageRows.ts` — fetches `TriageRowsByClient` for a given list of clientIds. Runs the four source queries (scripts, video_edits, scheduled_posts, client_strategies) in parallel and assembles the per-client row arrays including pipeline rows. Returns `{ data, loading, error, refresh }`.
- `src/components/strategy/ProductionPipelineSection.tsx` — the new section on the strategy page. Renders the six date inputs + notes textarea + relative-date hints. Reads/writes `client_strategies` pipeline columns. Receives the current strategy object and a save callback from the parent `ClientStrategy.tsx`.

Reused / lightly modified:
- `src/pages/Dashboard.tsx` — the admin path (the existing `if (isSingleBrand)` early-return stays; everything after it gets rewritten). The `?client=<id>` drilldown branch (`ActiveClientBreadcrumb`, `RobbyInsightRow`, `ToolFolders`) stays for now — the client-name link in each block enters it.
- `src/pages/ClientStrategy.tsx` — extended: imports `ProductionPipelineSection` and renders it; extends the strategy save payload to include the new pipeline columns; extends the `ClientStrategy` TS interface and `DEFAULTS` to include the new fields (all `null` by default).
- `src/hooks/useDashboardPendingItems.ts` — kept as-is; still used by the SingleBrand path. The triage view doesn't depend on it.

Removed from the admin path:
- The 6 `<PromptCard>` grid.
- The roster-card `<ClientCard>` grid.
- The `<ToolFolders activeClientId={null}>` on the root admin view (still rendered on the drilldown).

## 7. Boundaries & isolation

Each new unit has one job and a clear contract:

- `useTriageClients` — input: nothing (reads auth via the supabase client RLS context). Output: `{ id, name }[]`, filtered to Connecta Plus.
- `useTriageRows` — input: `clientIds: string[]`. Output: `TriageRowsByClient`. Doesn't know about Connecta Plus or auth.
- `TriageRow` — input: a `TriageRow` + `clientId`. Output: a rendered row with a link. Doesn't know about other rows or the client.
- `TriageClientBlock` — input: `{ id, name }` + `TriageRow[]`. Output: a rendered block. Doesn't know about other clients or fetching.
- `ProductionPipelineSection` — input: the strategy object (the pipeline fields) + an `onChange` callback. Output: rendered date inputs + notes textarea. Doesn't know about the rest of the strategy form or how saves are wired — just emits new field values.

The dashboard page composes: `useTriageClients` → `useTriageRows(clientIds)` → render header + blocks. Anything you'd want to change about row appearance, click destination, or aging-dot logic lives in `TriageRow`. Anything about which clients qualify lives in `useTriageClients`. Anything about row data lives in `useTriageRows`. The strategy page imports `ProductionPipelineSection` and wires it into its existing form-state.

## 8. Animation

Keep the existing motion vocabulary from `Dashboard.tsx` — opacity/y fade-in, ~0.45s `[0.25, 0.46, 0.45, 0.94]` easing, ~0.05s stagger between blocks. The greeting and subtitle animate in first; the client list staggers in after. The waving-hand emoji is dropped — the new tone is calmer, the question itself ("What do you want to do today?") carries the energy.

## 9. Decisions worth flagging

These are choices made in this spec that we should double-check during implementation, not blockers now:

1. **60-day script age cap.** Scripts older than 60 days with `review_status IS NULL` likely represent stale work, not active triage. Excluding them keeps counts honest. Tunable.
2. **`grabado = true` excludes scripts.** Once a script is recorded, the review state is moot for triage purposes. If the team disagrees this is correct, easy to flip.
3. **Posts within 7 days only.** Beyond a week out is planning, not triage. Tunable.
4. **Pipeline window also 7 days.** A pipeline date only surfaces on the dashboard when it's within the next 7 days. Beyond that, admin sees them on `/strategy`. Tunable.
5. **Past pipeline dates don't surface on the dashboard.** Once a date is in the past it disappears from the dashboard row list. The strategy page shows "Overdue" so the admin can update it from there. We don't want the dashboard cluttered with stale dates.
6. **The drilldown route stays.** The client-name chevron leads to the existing `/dashboard?client=<id>` view. We don't redesign it here. If the drilldown view also feels off in practice, that's a follow-up spec.
7. **No keyboard navigation in v1.** Rows are normal links; the user's browser/screen-reader handles it. If the admin spends a lot of time on this page we can add arrow-key navigation later.
8. **Pipeline notes are private context.** They don't surface anywhere except the strategy page. If we later want notes visible on the dashboard (e.g., on hover), that's a follow-up.

## 10. Non-goals

- Real-time updates (websockets, polling). The triage view fetches on mount and on a manual refresh. If the admin acts on something and comes back, the page re-mounts and re-fetches. We don't optimize for "watch this page update as the world changes."
- Per-row quick actions (approve/dismiss). Each row is a navigation link only.
- A separate `/triage` route. This *is* the admin's `/dashboard`.
- A cross-client `/pipeline` page. Each pipeline lives on its client's strategy page; cross-client visibility comes from the dashboard's combined row list. A standalone cross-client table is a possible follow-up if the dashboard surfacing proves insufficient.
- Automatic advancement of pipeline dates (e.g., "filming done → bump to next cycle"). Admin updates dates manually.
- Mobile-specific layout. The page works on mobile via the existing responsive scaffolding; no special design considered here.

## 11. Acceptance

The page is shipped when:

- Migration adds the seven new columns to `client_strategies` (`onboarding_call_at`, `script_due_at`, `editing_due_at`, `next_filming_at`, `boosting_at`, `posting_at`, `pipeline_notes`).
- `/clients/:id/strategy` renders the Production pipeline section with all six date inputs + notes. Save persists. Relative-date hints render correctly (Tomorrow / In N days / Fri / Overdue / absolute date).
- Admin lands on `/dashboard` and sees: greeting, subtitle, dynamic count line, then a flat list of Connecta Plus clients with pending rows. No prompt cards, no tool folders, no roster grid.
- Pipeline rows appear on the dashboard for any non-null date within next 7 days, chronologically (soonest first), capped at 5 rows total per client (pipeline rows before count rows).
- Each row links to the correct destination: count rows go to pre-filtered resource pages; pipeline rows go to `/clients/<id>/strategy#pipeline`.
- Empty states render cleanly (no Connecta Plus clients; all caught up; loading; error).
- Connecta Plus single-brand users still see their existing `<SingleBrandDashboard>` — no regression.
- The `?client=<id>` drilldown still works when entered via the client-name link.
