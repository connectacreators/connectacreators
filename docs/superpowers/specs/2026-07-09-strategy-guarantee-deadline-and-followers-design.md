# Strategy page: configurable guarantee deadline + all-platform followers

Date: 2026-07-09
Status: Approved, pending implementation

## Context

Both changes are to the client Strategy page (`src/pages/ClientStrategy.tsx`), which lives on `origin/main` (this repo's checked-out branch, `feat/video-editor-phase-1`, is stale relative to main — implementation must branch off/land on main, per [[project_script_editor_on_main]]).

## Feature 1: Configurable guarantee deadline

### Problem

`ViewsGuaranteeCard` (`src/components/strategy/ViewsGuaranteeCard.tsx`) hardcodes `GUARANTEE_DAYS = 90`. Every client's "views guarantee" window is exactly 90 days from the start date, with no way to set a shorter (1 month) or longer (6/12 months) deadline, or no deadline at all.

### Data model

Add a column to `client_strategies`:

```sql
alter table client_strategies
  add column views_goal_duration_months smallint null default 3;
```

- `3` (default) preserves today's behavior for all existing rows (the existing hardcoded 90 days becomes "3 calendar months" — a negligible day-count shift, functionally equivalent).
- `NULL` means **no limit** — there is no deadline, ever. This is unambiguous because the column default is `3`, not `NULL`; a client only ends up with `NULL` by explicit user choice via the dropdown.
- Apply via Supabase MCP (`apply_migration`), not `db push` — see [[project_db_migration_drift]].

### Component changes (`ViewsGuaranteeCard.tsx`)

- Remove the `GUARANTEE_DAYS` constant. Add a `durationMonths: number | null` prop (mirrors the existing `startedAt`/`viewsGoal` prop pattern).
- Compute the end date as `start + durationMonths` calendar months (via `Date.setMonth`), not fixed-day math. When `durationMonths` is `null`, there is no `end`.
- Derived values change shape:
  - `windowOver` = `end ? now >= end : false`
  - `daysLeft` = `end ? days-until-end : null`
  - `totalWindowDays` = `end ? days-between(start, end) : null` (replaces the old fixed `GUARANTEE_DAYS` in the badge)
  - `expectedByNow` / pace marker only computed when `end` exists
- Badge text:
  - Goal hit → "Goal hit" (unchanged)
  - Deadline passed, not hit → "Window ended" (unchanged)
  - Has deadline, in progress → "Day X of N" (unchanged, N now variable)
  - No deadline → "Day X" (no "of N")
- Color logic: when there's no deadline, color is driven only by whether the goal is hit (green) or not (neutral/aqua "in progress") — the amber/red pace-based coloring only applies when a deadline exists, since there's nothing to fall behind on otherwise.
- Progress bar's pace-expectation tick mark is only rendered when `end` exists.
- Edit mode: add a "Guarantee length" `<select>` next to the existing start-date `<input type="date">`, with options 1 / 3 / 6 / 12 months / No limit. Defaults to the client's current `durationMonths` (shows "No limit" when `null`).
- `onPersistGoal` patch shape gains `views_goal_duration_months?: number | null`.

### Caller changes (`ClientStrategy.tsx`)

- `ClientStrategy` interface: add `views_goal_duration_months: number | null`.
- `DEFAULTS`: add `views_goal_duration_months: 3`.
- Pass `durationMonths={s.views_goal_duration_months ?? 3}` to `ViewsGuaranteeCard`.

## Feature 2: All-platform follower count in header

### Problem

The Strategy page header shows only Instagram followers, sourced from `audience_analysis.followers` (a field populated by IG-specific audience analysis). Clients with TikTok/Facebook/YouTube presence don't see those follower counts anywhere on this page.

### Data source

`ClientStrategy.tsx` already fetches `links` via `useClientViralChannels(clientOnboarding, clientId)` (line ~201), which returns `ClientChannelLink[]` — each with `channel.follower_count` and `channel.platform` for every linked platform. This is the same data `ViewsGuaranteeCard`'s per-platform breakdown row already uses, so no new fetch is needed.

### Behavior

- Replace the header's follower line (currently `@handle · N followers`, IG-only) with a combined total: sum `follower_count` across all `links` entries with a resolved `channel`, formatted via the existing `fmtViews` helper (e.g. "24.4K followers").
- Keep the `@handle` prefix as-is (still sourced from `clientOnboarding.instagram`).
- Double-clicking the follower text toggles a boolean (`showFollowerBreakdown`) that reveals an inline per-platform row directly below: icon (via `PLATFORM_ICON`, same as `ViewsGuaranteeCard`) + formatted count, one per linked platform that has a channel. Clicking again collapses it.
- No auto-collapse on outside click — collapsing is manual, matching the low-interaction-cost pattern already used elsewhere on this page (e.g. the pencil-icon edit toggle in `ViewsGuaranteeCard`).

## Out of scope

- No changes to how `audience_analysis.followers` itself is computed/stored — it remains used elsewhere (e.g. profile picture logic untouched).
- No DB constraint enforcing `views_goal_duration_months` to specific values (1/3/6/12/null) — the dropdown is the only gate; direct DB edits aren't validated.
- No migration of historical guarantee windows — this only affects the go-forward computation for each client's current `views_goal_started_at` + new duration field.
