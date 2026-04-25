# Finances — Category Breakdown Panels

**Date:** 2026-04-24
**Status:** Design — ready for implementation
**Scope:** Add an always-visible "by category" breakdown card for each side of the flat grid (Income, Expenses), placed inside the existing right-rail SUMMARY aside. Bars + percentages. Click-to-filter wired into the grid's category filter. Recalculates when the grid is filtered.

---

## Why

The flat grid shows individual rows; it doesn't answer "where is most of my money going this month?" Today the only way to see that is the Charts view, which forces a context switch. The user wants the spreadsheet reflex — *small SUMIF table next to my data* — without leaving the grid.

## Out of scope (deferred)

- Stacked bar / sparkline / time series of category totals across months. Charts view stays the place for that.
- Drill-down by sub-category or vendor inside a category.
- Editable budget targets per category ("Software budget = $200/mo" comparison).
- Custom category creation. Categories stay the canonical enum from [`useFinanceTransactions.ts`](src/hooks/useFinanceTransactions.ts).

## Layout

The right-rail aside today renders a single component: `<MonthlySummary>`. We append two breakdown cards beneath it, in this stacking order:

1. `MonthlySummary` *(existing)*
2. `CategoryBreakdownCard kind="income"` *(new)*
3. `CategoryBreakdownCard kind="expense"` *(new)*

Each breakdown card is its own bordered card matching the existing summary card's chrome (rounded 14px, `bg-card`, `border border-border/60`, ~12px padding). It only renders when its corresponding grid has at least one matching row in the current filtered set; an empty grid hides its breakdown card.

## Card anatomy

```
┌─────────────────────────────────────────┐
│  EXPENSES BY CATEGORY        $4,397.87  │  ← title + filtered total
├─────────────────────────────────────────┤
│  Software                $2,103.45  48% │
│  ████████████████████░░░░░░░░░░░░       │  ← bar, color from categoryColor()
│  Travel                  $1,332.75  30% │
│  ████████████░░░░░░░░░░░░░░░░░░░░       │
│  Contractors               $542.18  12% │
│  ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░       │
│  Food & Meals              $214.49   5% │
│  ██░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░       │
│  Subscriptions             $205.00   5% │
│  ██░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░       │
└─────────────────────────────────────────┘
```

- Title row: small-caps uppercase `font-size: 9px; letter-spacing: 1px; color: muted` for the title; tabular-num total in `text-foreground` aligned right.
- Each category row is a `<button>`:
  - Top line: category name (left), `$amount` + `%` (right, `tabular-nums`).
  - Bottom line: 3px-tall progress bar; fill color = the category's chip color from [`categoryColors.ts`](src/components/finances/categoryColors.ts); width = `(amount / total) * 100%`.
  - Padding `6px 4px`, divider line below each row except the last.
- Sort: amount desc.
- Categories with `$0` filtered totals are hidden.

## Behavior

**Filter coupling.** The card receives `rows` (already filtered by the grid's current filter state) and computes its breakdown from those. Sort/selection in the grid don't affect the breakdown. This means:

- Default month view → both grid totals and breakdown match the section header total ($4,397.87).
- Apply Category=Software filter on the grid → breakdown collapses to a single bar at 100% Software.
- Apply Vendor=Anthropic filter → breakdown shows only categories present in Anthropic's rows.

**Click to filter.** Clicking a category row in the breakdown applies a `kind: "set", values: new Set([category])` filter to the grid's `category` column. Clicking the same row again clears the category filter. The active row in the breakdown gets a 1px teal outline + slightly raised background. Only one category-row can be active at a time.

This means the click handler needs the grid's `setFilter` callback, so the grid must lift its filter state up. Currently filter state lives inside `useFilterable` inside `FlatTransactionGrid`. We extract it: `Finances.tsx` owns the filter state per kind and passes both `rows` and `setFilter` down to grid + breakdown card.

**Empty / no matches.** If the filter set produces 0 rows, the card hides itself. If the grid has rows but the filter set has zero (e.g. user filtered to a category with no entries this month), show "No expenses match this filter." inline in the breakdown card.

## Components

| New / mod | File | Responsibility |
|---|---|---|
| new | `src/components/finances/CategoryBreakdownCard.tsx` | The card. Props: `kind`, `rows` (already filtered), `total`, `activeCategory`, `onCategoryToggle`. Pure, no fetching. |
| modified | `src/pages/Finances.tsx` | Lift `categoryFilter: FinanceCategory \| null` state for income and expense (two pieces of state). Compute filtered rows here. Pass filtered rows + `setCategoryFilter` callbacks to both `FlatTransactionGrid` and `CategoryBreakdownCard`. Render the two breakdown cards below `<MonthlySummary>` in the aside. |
| modified | `src/components/finances/FlatTransactionGrid.tsx` | Accept `controlledCategoryFilter` (optional). When provided, the grid's internal `category` filter state is overridden / hidden. Internal sort and other-column filters stay unchanged. |

The breakdown card stays under ~80 lines. The grid change is a single optional prop wiring; doesn't touch the row-level logic. `Finances.tsx` grows by ~30 lines (state + props), well below the file-size threshold.

## Visual spec

- Card container: `rounded-2xl border border-border bg-card p-3` (matching the existing `MonthlySummary` shell).
- Title: `text-[9px] font-bold uppercase tracking-[1.2px] text-muted-foreground`.
- Total: `text-xs font-semibold tabular-nums text-foreground` aligned right.
- Divider: `border-b border-border/30` between the title and rows; `border-b border-border/20` between rows.
- Row hover: `bg-muted/40`.
- Active row: `bg-cyan-500/10 outline outline-1 outline-cyan-500/40 outline-offset-[-1px] rounded-md`.
- Row name: `text-[11px] text-foreground`.
- Row amount: `text-[11px] font-semibold tabular-nums text-foreground`.
- Row %: `text-[10px] text-muted-foreground ml-1.5`.
- Bar track: `h-[3px] bg-muted/40 rounded-full mt-1`.
- Bar fill: inline style `background: <categoryColor.text>; width: <pct>%`.

## Accessibility

- Each row is a `<button>` with `aria-pressed={isActive}` and `aria-label="Filter to {category} ({amount}, {pct}%)"`.
- The card title is a `<h3>` (or `<h2>`, depending on heading hierarchy in the surrounding layout).
- Visual bar is `<div role="presentation">` since the data is in the adjacent text spans.

## Edge cases

- **All categories show zero** — the card hides itself entirely (no "no breakdown to show" empty state — the absence speaks for itself).
- **Very long category name** — truncate with ellipsis; tooltip on hover shows the full name. None of the canonical categories are long enough to need this in practice, but typed-in custom values (none today, but possible future) should not break the layout.
- **A row whose amount is $0** (legacy data; theoretically possible) — included in the count but excluded from the bar so the bar doesn't render at width 0%. Edge case in practice.
- **Negative amounts** (refunds, currently not modelled but possible) — treat as positive for the % calculation; bar still rendered. Future enhancement: a "Net" mode toggle.

## Files touched

```
src/components/finances/CategoryBreakdownCard.tsx     (new, ~75 lines)
src/components/finances/FlatTransactionGrid.tsx       (modified — accept optional controlled category filter)
src/pages/Finances.tsx                                (modified — lift category filter state, render the two cards)
```

## Deployment

1. Build
2. `scp` to VPS
3. Cloudflare purge

No schema, no edge function, no hook changes.

## Future (separate specs)

- Time-series breakdown comparison ("vs last month") inside the same card.
- Budget targets per category, with a colored bar overlay showing actual vs budget.
- Drill-down on row click: click a category once to filter, click *again* to expand the row and show top vendors within it. (Currently click-twice = clear filter; this would be a chord like Shift+click.)
