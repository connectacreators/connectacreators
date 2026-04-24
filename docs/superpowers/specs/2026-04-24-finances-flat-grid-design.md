# Finances — Flat Editable Grid

**Date:** 2026-04-24
**Status:** Design — ready for implementation plan
**Scope:** Replace the category-grouped Table view on the Finances page with a pair of flat, inline-editable spreadsheet-style grids (Income on top, Expenses below). Each grid supports sort, per-column filter, bulk select, and inline cell editing. No keyboard navigation for v1.

---

## Why

Roberto works his books in Google Sheets because the current grouped-by-category Table view doesn't let him sort, filter, bulk-edit, or click straight into a cell. He wants to stay inside Connecta but keep the "I can push rows around like Excel" muscle memory. The Card view stays for quick glances; the flat grid becomes the working surface.

## Scope — in and out

**In:**

- Two flat grids (Income, Expenses) replacing the current grouped `TransactionsTable`.
- Inline cell editing on every editable column (autosave on blur).
- Sort by any column header (click cycles asc → desc → unsorted).
- Filter popover on select columns (Client/Vendor/Category/Amount-range/A-R).
- Row multi-select with a bulk action bar (Recategorize, Mark A/R, Delete, Clear).
- An "Add row" affordance at the bottom of each grid that opens a fresh blank row inline.
- All icons from `lucide-react` — no emoji, no unicode glyphs used as icons.

**Out (deferred):**

- Keyboard navigation (arrow keys, Tab-across-cells, Cmd+Z, clipboard paste). Real spreadsheet keyboard behavior is its own project.
- Column resize / reorder. Columns are fixed for v1.
- Freeze header / sticky scroll. The grids are paginated-by-month so height stays bounded.
- Single unified grid with a Type filter. Two stacked grids per user's choice.
- Pivot/totals-by-group. Column totals still live in the section header total (existing behavior).

## Columns

### Income grid

| # | Column | Editable | Cell UI | Notes |
|---|---|---|---|---|
| 1 | (checkbox) | — | Check / unchecked | Header checkbox = select all in view |
| 2 | Client | yes | Autocomplete input, suggestions = distinct `client` values from the current user's last 90 days of transactions + any custom typed value | `client` field |
| 3 | Date | yes | Date picker | `date` field; default sort column, desc |
| 4 | Description | yes | Text input, free-form | `description` field |
| 5 | Amount | yes | Currency input, right-aligned | `amount` field; parses `$1,234.56`, `1234.56`, `1.2k` |
| 6 | A/R | yes | Toggle chip (empty / "A/R" pill) | `is_ar` field |
| 7 | (row menu) | — | `MoreHorizontal` icon; opens Edit-in-modal / Delete / Duplicate | Keeps the existing edit-modal path for complex edits (attachments, recurrence) |

### Expense grid

| # | Column | Editable | Cell UI | Notes |
|---|---|---|---|---|
| 1 | (checkbox) | — | | |
| 2 | Vendor | yes | Autocomplete input, suggestions = distinct `vendor` values from the current user's last 90 days of transactions | `vendor` field |
| 3 | Category | yes | `Select` with the `FinanceCategory` enum values; rendered as a color-coded chip when not editing | `category` field |
| 4 | Date | yes | Date picker | `date`; default sort column, desc |
| 5 | Description | yes | Text input | `description` field |
| 6 | Amount | yes | Currency input, right-aligned | `amount`; same parser as income |
| 7 | Attachment | no | `Paperclip` icon when `attachment_url` present (clickable, opens attachment); empty otherwise | Upload handled in the row-menu Edit modal, not inline |
| 8 | (row menu) | — | Same as income | |

## Sort, filter, bulk — behavior details

**Sort.** Click any column header (other than checkbox, menu, attachment) to cycle through `asc → desc → off`. A small `ArrowUp` / `ArrowDown` icon appears next to the active header. Only one column sorted at a time per grid. Default on mount: `Date` desc.

**Filter.** Client, Vendor, Category show a `ChevronDown` in the header. Clicking it opens a popover with a checklist of all values present in the current grid's data. Amount shows a popover with `min` / `max` inputs. A/R shows a three-state toggle (`All / A-R only / Non-A-R only`). An active filter adds a small teal dot on the header. Filters persist for the lifetime of the Finances page session (not across page navigation — simple in-memory state).

**Bulk bar.** When ≥1 row is selected in a grid, a bar slides in above the table body:
- `Recategorize ▾` — opens a Select with all categories; applying updates every selected row to that category.
- `Mark A/R` — toggles `is_ar` on all selected (uses majority state to pick direction; all non-A/R → mark; any A/R → clear).
- `Delete` — opens a confirm dialog ("Delete N entries? This cannot be undone."), then soft-deletes all via the existing `deleted_at` pattern.
- `Clear` — deselects.

The bulk bar only appears for the grid whose rows are currently selected. Selecting rows in Income does not also select Expenses.

**Add row.** Bottom of each grid has a `Plus` icon + "Add income row…" / "Add expense row…" text on a dashed border. Clicking starts editing a fresh row; the first editable cell (Client or Vendor) is focused. Blurring without any changes discards the draft. Any change triggers autosave and appends the row permanently.

## Cell edit lifecycle

1. Cell is clicked (or Add row is activated) → cell swaps to its editor UI.
2. User types / picks / toggles.
3. On blur OR Enter → call `updateTransaction(id, patch)` from the existing `useFinanceTransactions` hook. UI updates optimistically before the request resolves.
4. On success → silent. On failure → revert the optimistic update and surface a toast with retry.
5. Escape cancels the edit and reverts to the pre-edit value.

No loading spinner on individual cells — autosave is fast enough that a spinner adds more visual noise than reassurance. If the request is still pending when another cell is edited, requests are allowed to overlap (each targets a different column).

## Components

| New | File | Responsibility |
|---|---|---|
| new | `src/components/finances/FlatTransactionGrid.tsx` | Single-purpose grid. Props: `kind: "income" \| "expense"`, `rows`, `onUpdate`, `onDelete`, `onCreate`. Owns local sort / filter / selection state. Renders its header, bulk bar, body rows, and Add-row affordance. |
| new | `src/components/finances/cells/TextCell.tsx` | Click-to-edit text input. |
| new | `src/components/finances/cells/NumberCell.tsx` | Currency parser + right-aligned display. |
| new | `src/components/finances/cells/DateCell.tsx` | Date picker using existing shadcn Calendar popover. |
| new | `src/components/finances/cells/SelectCell.tsx` | Category / Type dropdown; renders a color-coded chip when idle. |
| new | `src/components/finances/cells/ToggleCell.tsx` | A/R chip toggle. |
| new | `src/components/finances/cells/AttachmentCell.tsx` | Read-only paperclip icon + click-to-open URL. |
| modified | `src/pages/Finances.tsx` | Replace `TransactionsTable` with two `FlatTransactionGrid` instances under the `view === "table"` branch. |
| removed | `src/components/finances/TransactionsTable.tsx` | Deleted — grouped-by-category view is going away per the scope decision. |

The cell primitives each stay under ~80 lines. `FlatTransactionGrid.tsx` stays under ~400 lines by keeping filter/sort logic in small helper hooks (`useSortable`, `useFilterable`, `useSelection`) colocated in the same folder. If any of those exceed ~120 lines, split further.

## Data and save path

No schema changes. All edits go through the existing hook:

```ts
updateTransaction(id, patch: Partial<NewFinanceTransaction>)
deleteTransaction(id)
createTransaction(tx, recurrence?)
```

Bulk delete fans out N `deleteTransaction` calls in parallel. Bulk recategorize / mark A/R do the same with `updateTransaction`. If any single call fails, the others still proceed; a summary toast reports "N updated, M failed."

## Visual spec

- Grid container: `border: 1px solid rgba(148,163,184,0.18); border-radius: 10px;`
- Section header (income): linear gradient with `rgba(16,185,129,0.08) → rgba(16,185,129,0.02)`; title + total in `#10b981`.
- Section header (expense): same with `rgba(239,68,68,…)` and `#ef4444`.
- Thead: `background: rgba(255,255,255,0.02); font-size: 10px; uppercase; letter-spacing: 0.6px; color: #94a3b8`. Sorted column gets `color: #22d3ee; background: rgba(34,211,238,0.05)`.
- Tbody rows: `font-size: 11px; border-bottom: 1px solid rgba(148,163,184,0.06)`. Hover `background: rgba(255,255,255,0.02)`. Selected `background: rgba(34,211,238,0.07)`.
- Editing cell: outline `2px solid rgba(34,211,238,0.55); outline-offset: -2px; background: rgba(34,211,238,0.08)`.
- Category chips: color-coded by category (Software purple, Food amber, Travel blue, SMMA emerald, …). Chip colors centralized in a `CATEGORY_COLORS` map alongside the existing category enum.
- Bulk bar: `background: rgba(34,211,238,0.12); border-bottom: 1px solid rgba(34,211,238,0.2); color: #22d3ee`.
- Add row: dashed `border-top: 1px dashed rgba(148,163,184,0.15)`; muted until hover; teal on hover.

## Accessibility

- Each cell is a `<button>` (idle state) that becomes an `<input>` / `<select>` when activated. `aria-label` describes the cell's purpose ("Amount for Anthropic on April 23").
- Column headers are `<button>`s inside the `<th>` so screen readers announce them as interactive. Sort state is surfaced via `aria-sort`.
- Bulk checkboxes have `aria-label="Select row"` (row checkboxes) / `aria-label="Select all rows"` (header).
- Filter popovers trap focus and close on Escape.

## Edge cases

- **No income / no expenses in the month** → render the grid shell with just the "Add row" affordance. No "empty state" illustration — the Add row is the call to action.
- **Mid-edit when the month changes** → prompt to discard / save before switching; if save, runs the request before navigation.
- **Amount parse failure** ("abc") → cell turns red-outlined, tooltip explains; blur does not save.
- **A/R toggle on a draft row that hasn't been saved yet** → the draft row collects all cell values locally, then fires a single `createTransaction` on the first field that makes it a valid row (has Client/Vendor + Amount). A/R is just another field in that payload.
- **Bulk delete with a draft row in selection** → the draft is silently discarded (never existed server-side).
- **Recurring transactions** (`recurring_subscription_id` set) → editable like regular rows, but the row menu exposes a "Stop recurring" item in addition to Edit / Delete / Duplicate. Out of scope to change amount on the template from inline edit (route them to the edit modal).

## Files touched

```
src/pages/Finances.tsx                                    (modified — swap table view)
src/components/finances/FlatTransactionGrid.tsx           (new)
src/components/finances/cells/TextCell.tsx                (new)
src/components/finances/cells/NumberCell.tsx              (new)
src/components/finances/cells/DateCell.tsx                (new)
src/components/finances/cells/SelectCell.tsx              (new)
src/components/finances/cells/ToggleCell.tsx              (new)
src/components/finances/cells/AttachmentCell.tsx          (new)
src/components/finances/useSortable.ts                    (new)
src/components/finances/useFilterable.ts                  (new)
src/components/finances/useSelection.ts                   (new)
src/components/finances/categoryColors.ts                 (new — centralized color map)
src/components/finances/TransactionsTable.tsx             (deleted)
```

## Deployment

1. Build
2. `scp` to VPS
3. Cloudflare purge

No schema changes, no edge functions touched.

## Future (separate specs)

- Keyboard navigation across cells (arrow keys, Tab, Shift+Tab, Enter/Escape, Cmd+Z, clipboard paste).
- Column resize and reorder with persistence per user.
- Multi-column sort (shift-click a second header).
- Export selected rows as CSV from the bulk bar.
- Grouped/pivoted read-only view as an additional toggle inside the Sheet view.
