# Lead Calendar Frontend Redesign — Design Spec
**Date:** 2026-03-17
**File to modify:** `src/pages/LeadCalendar.tsx`

---

## 1. Goal

Polish the existing Apple Calendar-style lead calendar by (1) rendering event cards with name+time on the top row and a visible status badge on the second row, (2) splitting overlapping events side-by-side using a column-based collision algorithm, and (3) removing the Year view from the view switcher entirely.

---

## 2. Scope

### In scope
- `EventBlock` component: new card layout (medium card), new props for overlap layout
- Overlap/collision detection algorithm: groups overlapping events per day column, assigns column index + cluster size, renders side-by-side
- View switcher: remove "year" option from the pill toggle
- `ViewMode` type: remove `"year"` variant
- Year view JSX block: delete entirely
- `goPrev` / `goNext` year-branch: remove the `else` fallback that incremented `viewYear`
- `headerLabel` computation: remove the `viewMode === "year"` branch

### Out of scope
- Backend / Supabase queries — no changes
- `STATUS_COLORS` and `DEFAULT_STATUS_COLOR` — no changes
- `LeadPopoverCard` — no changes
- Sidebar leads list (chronological scroll list) — no changes
- Mini calendar in sidebar — no changes
- `NowIndicator` — no changes
- `TimeGridLines` — no changes
- `MiniCalendar` — no changes
- Translations (`i18n/translations.ts`) — no changes
- Auth/subscription guard — no changes
- Month view — no changes

---

## 3. Architecture

The file is a single module (`src/pages/LeadCalendar.tsx`, 767 lines) that contains:

| Symbol | Role | Change? |
|---|---|---|
| `STATUS_COLORS` / `DEFAULT_STATUS_COLOR` | Color mapping | No |
| `getStatusColor()` | Helper | No |
| `HOURS` | 7am–9pm array | No |
| `getDaysInMonth`, `getFirstDayOfWeek`, `getWeekDates`, `formatDateStr` | Date utils | No |
| `getHourDecimal`, `formatTime`, `formatHourLabel` | Time utils | No |
| `LeadPopoverCard` | Popover detail card | No |
| `EventBlock` | Event chip in week/day views | **Yes — new props + new card layout** |
| `NowIndicator` | Red "now" line | No |
| `MiniCalendar` | Sidebar mini picker | No |
| `TimeGridLines` | Hour/half-hour grid | No |
| `LeadCalendar` (default export) | Page orchestrator | **Yes — view switcher, year removal, overlap computation** |

The overlap algorithm lives in the `LeadCalendar` component (inside the week/day view render blocks) and passes computed layout data down to `EventBlock` via two new props.

---

## 4. Overlap Layout Algorithm

### Problem

Currently every `EventBlock` is positioned with `left-0.5 right-0.5`, meaning two events at the same time in the same day column fully overlap each other (only the top one is visible). The fix is to detect overlapping events, group them into clusters, and split each cluster horizontally.

### Definitions

- **Overlap window:** Each event is treated as occupying a 45-minute window starting at its exact appointment time. Two events A and B overlap if their 45-minute windows intersect, i.e.:
  ```
  A.start < B.start + 45min  AND  B.start < A.start + 45min
  ```
  In decimal hours: `A.hourDec < B.hourDec + 0.75  AND  B.hourDec < A.hourDec + 0.75`

- **Cluster:** A maximal group of events where every event overlaps with at least one other event in the group (transitive closure). Events that do not overlap with anything form a single-event cluster (clusterSize = 1).

- **Column index:** Within a cluster, each event is assigned a 0-based column index (0, 1, 2, …). The assignment is greedy: iterate events sorted by `hourDec` ascending; assign the smallest column index not yet taken by any overlapping event that was already assigned.

### Pseudocode

```
function computeLayoutForDay(leads: Lead[]): Record<string, { columnIndex: number; columnCount: number }> {
  // 1. Filter leads that have a valid hourDec
  const items = leads
    .filter(l => getHourDecimal(l.appointmentDate) !== null)
    .sort((a, b) => getHourDecimal(a) - getHourDecimal(b))

  // 2. Build adjacency: overlaps[i] = set of indices j where items[i] overlaps items[j]
  for each pair (i, j):
    if abs(hourDec[i] - hourDec[j]) < 0.75:
      overlaps[i].add(j)
      overlaps[j].add(i)

  // 3. Find clusters via union-find or BFS
  visited = new Set()
  clusters = []
  for i in 0..items.length-1:
    if i not in visited:
      cluster = BFS(i, overlaps)   // returns all connected indices
      clusters.push(cluster)
      visited.addAll(cluster)

  // 4. Assign column indices within each cluster
  result = {}
  for cluster of clusters:
    colAssigned = {}   // index -> colIndex
    // Sort cluster members by hourDec
    sorted = cluster.sort by hourDec
    for idx of sorted:
      usedCols = set of colAssigned[j] for j in overlaps[idx] if j in colAssigned
      colAssigned[idx] = smallest non-negative integer not in usedCols

    clusterSize = max(colAssigned.values()) + 1
    for idx of cluster:
      result[items[idx].id] = {
        columnIndex: colAssigned[idx],
        columnCount: clusterSize
      }

  // 5. Single-event items not assigned: columnIndex=0, columnCount=1
  return result
}
```

### Output usage

`computeLayoutForDay` is a **module-level pure helper function** defined outside the `LeadCalendar` component (near the other helper functions at the top of the file). It takes a `Lead[]` and returns a `Record<string, { columnIndex: number; columnCount: number }>` — a plain object keyed by lead ID.

In the **week view**, it is called once per day column inside the `weekDates.map()` loop:
```ts
const layoutMap = computeLayoutForDay(dayLeads);
```
Then each `<EventBlock>` call receives props via bracket access:
```tsx
const layout = layoutMap[lead.id] ?? { columnIndex: 0, columnCount: 1 };
<EventBlock ... columnIndex={layout.columnIndex} columnCount={layout.columnCount} />
```

In the **day view**, it is called once before the events are rendered — same calling pattern.

### Edge cases

- Lead with no valid `appointmentDate` time component: `getHourDecimal` returns `null`; skip it (already filtered by `top < 0` guard in `EventBlock`).
- Single lead in a day: `columnCount = 1`, `columnIndex = 0` — renders full width (same as before).
- Three leads all at the same time: `columnCount = 3`, each gets `columnIndex` 0, 1, 2 — renders at 33% width each.

---

## 5. EventBlock Component Changes

### Current signature

```ts
function EventBlock({
  lead, hourHeight, startHour, isAdmin, isDayView
}: {
  lead: Lead;
  hourHeight: number;
  startHour: number;
  isAdmin: boolean;
  isDayView?: boolean;
})
```

### New signature

```ts
function EventBlock({
  lead, hourHeight, startHour, isAdmin, isDayView,
  columnIndex, columnCount
}: {
  lead: Lead;
  hourHeight: number;
  startHour: number;
  isAdmin: boolean;
  isDayView?: boolean;
  columnIndex?: number;   // 0-based column within overlap cluster (default: 0)
  columnCount?: number;   // total columns in cluster (default: 1)
})
```

Both new props are optional with defaults of `0` and `1` respectively so existing call sites that haven't been updated yet continue to work.

### New positioning logic

Replace the current Tailwind `left-0.5 right-0.5` with inline `style` positioning:

```ts
const colIdx = columnIndex ?? 0;
const colCnt = columnCount ?? 1;
const widthPct = 100 / colCnt;
const leftPct = colIdx * widthPct;

// Inline style on the outer div:
style={{
  top,
  minHeight: 40,
  maxHeight: hourHeight - 2,
  position: "absolute",
  width: `calc(${widthPct}% - 2px)`,
  left: `calc(${leftPct}% + 1px)`,
}}
```

Remove the `absolute left-0.5 right-0.5` Tailwind classes from the className string (positioning is now fully handled by the inline `style` prop — `position: "absolute"` covers what `absolute` did, and `left`/`width` cover what `left-0.5 right-0.5` did).

### New card layout (medium card)

Current layout renders time on the first line, name on the second line in tiny text. Replace with:

**Row 1 (top):** Name + time on the same line, separated by a middle-dot or space, bold name + regular time.
**Row 2:** Status badge — always visible, no hover needed.

```tsx
<div className={`... ${sc.bg} border-l-[3px] ${sc.border} rounded-r-md px-1.5 py-1 ...`}>
  {/* Row 1: name + time */}
  <div className="flex items-baseline gap-1 min-w-0">
    <p className={`text-[10px] font-bold ${sc.text} truncate flex-1`}>
      {lead.fullName || "No name"}
    </p>
    {time && (
      <span className="text-[9px] text-muted-foreground whitespace-nowrap flex-shrink-0">
        {time}
      </span>
    )}
  </div>
  {/* Row 2: status badge */}
  {lead.leadStatus && (
    <div className="mt-0.5">
      <span className={`text-[8px] px-1 py-px rounded-full border ${sc.badge} inline-block leading-none`}>
        {lead.leadStatus}
      </span>
    </div>
  )}
</div>
```

The `minHeight` on the outer div should be increased to accommodate two rows. Use `minHeight: 40` (was 26).

The `maxHeight` remains `hourHeight - 2` (56 - 2 = 54px) so cards never overflow their hour slot.

---

## 6. View Switcher Change

### Current code (line 556–565)

```tsx
<div className="flex bg-muted rounded-md p-0.5">
  {(["day", "week", "month", "year"] as ViewMode[]).map((mode) => (
    <button
      key={mode}
      onClick={() => setViewMode(mode)}
      className={...}
    >
      {mode === "day" ? "Día" : mode === "week" ? tr(t.leadCalendar.week, language) : mode === "month" ? tr(t.leadCalendar.month, language) : tr(t.leadCalendar.year, language)}
    </button>
  ))}
</div>
```

### Change

Remove `"year"` from the modes array and remove the `year` ternary branch from the label expression:

```tsx
<div className="flex bg-muted rounded-md p-0.5">
  {(["day", "week", "month"] as ViewMode[]).map((mode) => (
    <button
      key={mode}
      onClick={() => setViewMode(mode)}
      className={`px-2 py-1 text-[11px] font-medium rounded transition-colors ${viewMode === mode ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
    >
      {mode === "day" ? "Día" : mode === "week" ? tr(t.leadCalendar.week, language) : tr(t.leadCalendar.month, language)}
    </button>
  ))}
</div>
```

### Related cleanup

1. **`ViewMode` type** (line 59): Change `"day" | "week" | "month" | "year"` to `"day" | "week" | "month"`.

2. **`goPrev` / `goNext`** (lines 391–416): Remove the `else { setViewYear(viewYear - 1); }` / `else { setViewYear(viewYear + 1); }` fallback branches. Since `viewMode` can only be `"day"`, `"week"`, or `"month"`, the else branch is dead code after removal. The if-else chain can end after the `week` branch.

3. **`headerLabel`** (lines 424–435): Remove the `viewMode === "year"` branch. The current ternary chain is:
   ```ts
   const headerLabel = viewMode === "day"
     ? ...
     : viewMode === "month"
       ? `${MONTH_NAMES[viewMonth]} ${viewYear}`
       : viewMode === "year"
         ? `${viewYear}`
         : (() => { /* week label IIFE */ })();
   ```
   After removal it must become:
   ```ts
   const headerLabel = viewMode === "day"
     ? ...day label...
     : viewMode === "month"
       ? `${MONTH_NAMES[viewMonth]} ${viewYear}`
       : (() => { /* week label IIFE */ })();
   ```
   The week IIFE moves from being the `else` of the `year` ternary to being the `else` of the `month` ternary. Simply removing the `viewMode === "year" ? \`${viewYear}\` :` text without restructuring the chain will leave the IIFE dangling and produce a syntax error.

4. **Year view JSX block** (lines 711–755): Delete the entire block:
   ```tsx
   {/* ===== YEAR VIEW ===== */}
   {viewMode === "year" && ( ... )}
   ```

---

## 7. Medium Card Design

The event card in week and day views should follow this visual structure:

```
┌─────────────────────────────────┐
│ ▐ John Smith           10:30 AM │  ← Row 1: bold name (truncate) + time (right, smaller)
│ ▐ [● Booked         ]           │  ← Row 2: status badge pill (color-coded)
└─────────────────────────────────┘
  ↑ 3px colored left border
```

**Typography:**
- Name: `text-[10px] font-bold`, colored per status (`sc.text`)
- Time: `text-[9px]`, `text-muted-foreground`, non-wrapping, right-aligned within the flex row
- Status badge: `text-[8px]`, pill shape with `rounded-full`, border + background from `sc.badge`

**Sizing:**
- `minHeight: 40px` (enough for two rows with padding)
- `maxHeight: hourHeight - 2` = 54px (prevents overflow into next hour slot)
- Padding: `px-1.5 py-1`

**Color coding:**
- The existing `border-l-[3px]` colored border is retained — it is the primary visual indicator of status
- The status badge on row 2 provides a secondary text label for the status

**Overflow behavior:**
- Name truncates with CSS `truncate` (overflow hidden + ellipsis)
- If the card is too short to show the status badge (e.g. event card height < 40px due to time grid constraints), the badge may be cut off by `overflow-hidden` on the card — this is acceptable

---

## 8. Files to Modify

**Only one file requires changes:**

```
src/pages/LeadCalendar.tsx
```

Summary of all changes within that file:

| Location | Change |
|---|---|
| Line 59 — `type ViewMode` | Remove `"year"` |
| Lines 171–196 — `EventBlock` function | Add `columnIndex?`, `columnCount?` props; update positioning style; update card layout to two-row medium card |
| Lines 391–416 — `goPrev` / `goNext` | Remove year fallback branches |
| Lines 424–435 — `headerLabel` | Remove year branch |
| Lines 556–565 — view switcher | Remove `"year"` from modes array; simplify label ternary |
| Lines 597–607 — day view render | Compute overlap layout map for the day's leads; pass `columnIndex` and `columnCount` to each `EventBlock` |
| Lines 641–654 — week view render | Compute overlap layout map per day column; pass `columnIndex` and `columnCount` to each `EventBlock` |
| Lines 711–755 — year view JSX | Delete entire block |

No new files. No new imports needed (the algorithm uses only primitives and existing helpers).

> **Note on line numbers:** The line numbers in this table reference the **original unchanged file**. Apply changes from the bottom of the file upward so that earlier edits don't shift the line numbers of sections you haven't reached yet.

---

## 9. Testing

### Manual testing checklist

**Overlap layout — week view:**
1. Find or create two leads with the same appointment time on the same day (e.g. both at 10:00 AM on Monday).
2. Open week view. Verify both cards appear side-by-side in the same day column, each occupying ~50% of the column width, with no visual overlap.
3. Add a third lead at 10:15 AM on the same day (within the 45-minute window). Verify all three appear side-by-side at ~33% width each.
4. Add a fourth lead at 11:30 AM on the same day (outside the 45-minute window from the 10:00 group). Verify it appears full-width.
5. Verify clicking each card still opens the correct popover with the correct lead data.

**Overlap layout — day view:**
1. Switch to day view for the same test day. Verify the same side-by-side layout appears.
2. Verify single-lead days show the event at full width (no horizontal shrinkage).

**Medium card layout:**
1. Verify row 1 shows the lead's full name (truncated if long) and the appointment time.
2. Verify row 2 shows the status badge with correct color per `STATUS_COLORS`.
3. Verify the colored left border matches the status.
4. On a card that is very short (near the top/bottom boundary of the time grid), verify no layout breakage occurs — card clips cleanly via `overflow-hidden`.

**View switcher:**
1. Verify the pill switcher shows exactly three options: Day, Week, Month.
2. Verify "Year" option is completely absent.
3. Verify clicking each option switches the view correctly.
4. Verify no JavaScript errors are thrown when `viewMode` is in its default "week" state.

**Navigation (goPrev/goNext):**
1. In week view, press the left chevron multiple times. Verify the week decrements correctly and no console error appears.
2. In month view, press the right chevron past December. Verify it rolls over to January of the next year.
3. In day view, press the left chevron. Verify it goes to the previous day.

**Regression — unchanged behavior:**
1. Clicking a lead in the sidebar still navigates to day view for that date.
2. Clicking a date in the mini calendar still navigates to day view.
3. Clicking a day number in the week view header still navigates to day view.
4. Clicking a day cell in month view still navigates to day view.
5. The "Today" button navigates all views back to the current date/week/month.
6. The NowIndicator (red line) appears on today's column.
7. All status colors match the `STATUS_COLORS` mapping (yellow = New Lead, green = Booked, etc.).
8. Popover card shows correct lead details on event click.
