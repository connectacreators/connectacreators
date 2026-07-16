# Viral Today — Mobile Optimization

**Date:** 2026-07-15 · **Approved:** user picked 2-col minimal cards, status-chip + tap→detail, full scope incl. detail page, then "Go start implementing now".

## Problems (verified in code)

- Card actions (Star/Play/Analyze) hover-gated → unreachable on touch; tooltips hover-only.
- Toolbar row doesn't wrap: search crushed at 375px.
- 2-col cards carry desktop chrome (caption, 3 colored stats, platform icon) → oversaturated.
- Filter drawer = left slide-in with 11px controls.
- Channels view: WatchlistManager is `hidden lg:block` → inaccessible on mobile.
- Detail page: player buries tabs; Use in Script/Save at the very bottom; tab strip scrolls with no cue.

## Design (mobile = `<md` unless noted; desktop pixels unchanged)

1. **Cards:** thumbnail + mobile-only stats row (outlier colored — the one accent; views muted) + @channel. Caption/engagement/platform/timestamp hidden `<md`. Hover bar and admin select-checkbox `hidden md:flex`. Always-visible status chip on thumbnail (✓ analyzed / spinner / ! failed; nothing when pending), non-interactive; whole card taps → detail. Grid `gap-3 md:gap-5`.
2. **Toolbar:** `flex-wrap`; search `w-full` on mobile (own row), chips wrap below.
3. **Filter drawer → bottom sheet** (`<lg`): slides from bottom, `max-h-[85vh]`, rounded top, grab handle, safe-area padding; same FilterRail inside with bumped tap targets (`h-9 lg:h-7` style).
4. **Channels view:** mobile "Lists" button → bottom sheet hosting WatchlistManager (new `variant="sheet"` prop); sidebar variant unchanged on lg+.
5. **Detail page:** player wrapper `max-w-[280px] mx-auto md:max-w-none` (caps height ≈60vh); action row becomes fixed bottom bar on mobile (`max-md:fixed` + blur + safe-area, page gets `pb-24 md:pb-4`); "Used in N scripts" hidden on mobile; tab strip gets right edge-fade cue (`md:hidden`).
6. **Pagination (videos + channels):** taller tap targets on mobile (`py-2 md:py-1.5`).

## Approach

Responsive edits inside existing components (Tailwind 3.4 breakpoints incl. `max-md:`). No component forks, no monolith refactor. Verify: vite build, then CI deploy; desktop verified unchanged at md+ (classes only add mobile variants).
