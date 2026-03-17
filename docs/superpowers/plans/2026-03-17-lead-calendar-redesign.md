# Lead Calendar Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `LeadCalendar.tsx` to show medium event cards with status badges, split overlapping same-time events side-by-side (Google/Apple Calendar style), and remove the Year view.

**Architecture:** All changes are confined to a single file (`src/pages/LeadCalendar.tsx`). A new module-level pure helper `computeLayoutForDay()` implements the collision algorithm. `EventBlock` gets two new optional props (`columnIndex`, `columnCount`) that control horizontal placement. The rest of the file (sidebar, popover, colors, Supabase queries) is untouched.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, shadcn/ui (Popover). No new dependencies.

---

## Chunk 1: Year View Removal

Work bottom-up through the file so line numbers stay accurate for each step.

### Task 1: Delete the year view JSX block

**Files:**
- Modify: `src/pages/LeadCalendar.tsx:711-755`

- [ ] **Step 1: Delete the year view JSX block**

  In `src/pages/LeadCalendar.tsx`, find and delete the entire block from the comment through the closing `)}`:

  ```tsx
  {/* ===== YEAR VIEW ===== */}
  {viewMode === "year" && (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 sm:gap-3">
      {MONTH_NAMES.map((_mName, mIdx) => {
        ...
      })}
    </div>
  )}
  ```

  Delete everything from `{/* ===== YEAR VIEW ===== */}` through the closing `)}` (lines 711–755 in the original file). The month view JSX block above it remains.

- [ ] **Step 2: Update the view switcher** (around line 556 — work upward from year JSX)

  Find the view switcher:
  ```tsx
  {(["day", "week", "month", "year"] as ViewMode[]).map((mode) => (
    <button
      key={mode}
      onClick={() => setViewMode(mode)}
      className={`px-2 py-1 text-[11px] font-medium rounded transition-colors ${viewMode === mode ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
    >
      {mode === "day" ? "Día" : mode === "week" ? tr(t.leadCalendar.week, language) : mode === "month" ? tr(t.leadCalendar.month, language) : tr(t.leadCalendar.year, language)}
    </button>
  ))}
  ```

  Replace with:
  ```tsx
  {(["day", "week", "month"] as ViewMode[]).map((mode) => (
    <button
      key={mode}
      onClick={() => setViewMode(mode)}
      className={`px-2 py-1 text-[11px] font-medium rounded transition-colors ${viewMode === mode ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
    >
      {mode === "day" ? "Día" : mode === "week" ? tr(t.leadCalendar.week, language) : tr(t.leadCalendar.month, language)}
    </button>
  ))}
  ```

- [ ] **Step 3: Fix the `headerLabel` ternary chain** (around line 424 — continuing upward)

  Current:
  ```ts
  const headerLabel = viewMode === "day"
    ? viewDate.toLocaleDateString(...)
    : viewMode === "month"
      ? `${MONTH_NAMES[viewMonth]} ${viewYear}`
      : viewMode === "year"
        ? `${viewYear}`
        : (() => {
            const dates = getWeekDates(viewWeekStart);
            const s = dates[0]; const e = dates[6];
            if (s.getMonth() === e.getMonth()) return `${s.getDate()} – ${e.getDate()} ${MONTH_NAMES[s.getMonth()]} ${s.getFullYear()}`;
            return `${s.getDate()} ${MONTH_SHORT[s.getMonth()]} – ${e.getDate()} ${MONTH_SHORT[e.getMonth()]} ${e.getFullYear()}`;
          })();
  ```

  Replace with (remove the `viewMode === "year"` branch, promote the week IIFE to be the direct else of `month`):
  ```ts
  const headerLabel = viewMode === "day"
    ? viewDate.toLocaleDateString(language === "en" ? "en-US" : "es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : viewMode === "month"
      ? `${MONTH_NAMES[viewMonth]} ${viewYear}`
      : (() => {
          const dates = getWeekDates(viewWeekStart);
          const s = dates[0]; const e = dates[6];
          if (s.getMonth() === e.getMonth()) return `${s.getDate()} – ${e.getDate()} ${MONTH_NAMES[s.getMonth()]} ${s.getFullYear()}`;
          return `${s.getDate()} ${MONTH_SHORT[s.getMonth()]} – ${e.getDate()} ${MONTH_SHORT[e.getMonth()]} ${e.getFullYear()}`;
        })();
  ```

- [ ] **Step 4: Remove year branches from `goPrev` and `goNext`** (around line 391 — continuing upward)

  In `goPrev`, the current last branch is:
  ```ts
  } else { setViewYear(viewYear - 1); }
  ```
  Delete that `else` branch entirely. The function should end after the `week` branch:
  ```ts
  const goPrev = () => {
    if (viewMode === "day") {
      const d = new Date(viewDate);
      d.setDate(d.getDate() - 1);
      setViewDate(d);
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    } else if (viewMode === "month") {
      if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); } else setViewMonth(viewMonth - 1);
    } else if (viewMode === "week") {
      const d = new Date(viewWeekStart); d.setDate(d.getDate() - 7); setViewWeekStart(d);
    }
  };
  ```

  Do the same for `goNext` — remove its final `else { setViewYear(viewYear + 1); }` branch.

- [ ] **Step 5: Update the `ViewMode` type** (line 59 — top of file, last change)

  Find:
  ```ts
  type ViewMode = "day" | "week" | "month" | "year";
  ```
  Replace with:
  ```ts
  type ViewMode = "day" | "week" | "month";
  ```

- [ ] **Step 6: Build and verify no TypeScript errors**

  ```bash
  cd /Users/admin/Desktop/connectacreators && npm run build 2>&1 | tail -30
  ```
  Expected: build succeeds with 0 TypeScript errors. If there are errors referencing `"year"`, you missed a branch — search for `"year"` in the file and remove any remaining references.

- [ ] **Step 7: Commit**

  ```bash
  cd /Users/admin/Desktop/connectacreators
  git add src/pages/LeadCalendar.tsx
  git commit -m "feat(calendar): remove Year view, keep Day/Week/Month only"
  ```

---

## Chunk 2: Overlap Layout Algorithm + Updated EventBlock

### Task 2: Add `computeLayoutForDay` helper and update `EventBlock`

**Files:**
- Modify: `src/pages/LeadCalendar.tsx` (multiple locations)

**Context:** The file currently has these module-level helpers in order (lines 83–133):
```
HOURS constant
getDaysInMonth / getFirstDayOfWeek / getWeekDates / formatDateStr
getHourDecimal / formatTime / formatHourLabel
```
Add `computeLayoutForDay` after `formatHourLabel` and before `LeadPopoverCard`.

- [ ] **Step 1: Add `computeLayoutForDay` after `formatHourLabel`**

  Find the `formatHourLabel` function (ends around line 132):
  ```ts
  function formatHourLabel(h: number) {
    if (h === 0) return "12 AM";
    if (h < 12) return `${h} AM`;
    if (h === 12) return "12 PM";
    return `${h - 12} PM`;
  }
  ```

  Insert the following **immediately after** that closing brace, before the `// ---- Lead Popover Card ----` comment:

  ```ts
  // ---- Overlap layout algorithm ----
  // Returns a Record<leadId, { columnIndex, columnCount }> for all leads in a single day.
  // Events within 45 minutes of each other are grouped into clusters and rendered side-by-side.
  function computeLayoutForDay(leads: Lead[]): Record<string, { columnIndex: number; columnCount: number }> {
    // Filter to leads with valid time, sort by time ascending
    const items = leads
      .filter((l) => getHourDecimal(l.appointmentDate) !== null)
      .sort((a, b) => (getHourDecimal(a.appointmentDate) ?? 0) - (getHourDecimal(b.appointmentDate) ?? 0));

    if (items.length === 0) return {};

    // Build adjacency list: overlaps[i] = set of indices j where items[i] and items[j] overlap
    const overlaps: Set<number>[] = items.map(() => new Set<number>());
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const hi = getHourDecimal(items[i].appointmentDate) ?? 0;
        const hj = getHourDecimal(items[j].appointmentDate) ?? 0;
        if (Math.abs(hi - hj) < 0.75) {
          overlaps[i].add(j);
          overlaps[j].add(i);
        }
      }
    }

    // BFS to find clusters (connected components in the overlap graph)
    const visited = new Set<number>();
    const clusters: number[][] = [];
    for (let i = 0; i < items.length; i++) {
      if (visited.has(i)) continue;
      const cluster: number[] = [];
      const queue = [i];
      while (queue.length > 0) {
        const idx = queue.shift()!;
        if (visited.has(idx)) continue;
        visited.add(idx);
        cluster.push(idx);
        overlaps[idx].forEach((neighbor) => {
          if (!visited.has(neighbor)) queue.push(neighbor);
        });
      }
      clusters.push(cluster);
    }

    // Assign column indices within each cluster (greedy, sorted by time)
    const result: Record<string, { columnIndex: number; columnCount: number }> = {};
    for (const cluster of clusters) {
      // Sort cluster members by their time
      const sorted = [...cluster].sort(
        (a, b) => (getHourDecimal(items[a].appointmentDate) ?? 0) - (getHourDecimal(items[b].appointmentDate) ?? 0)
      );
      const colAssigned: Record<number, number> = {};
      for (const idx of sorted) {
        const usedCols = new Set<number>();
        overlaps[idx].forEach((j) => {
          if (j in colAssigned) usedCols.add(colAssigned[j]);
        });
        let col = 0;
        while (usedCols.has(col)) col++;
        colAssigned[idx] = col;
      }
      const colValues = Object.values(colAssigned);
      const clusterSize = colValues.length > 0 ? Math.max(...colValues) + 1 : 1;
      for (const idx of cluster) {
        result[items[idx].id] = {
          columnIndex: colAssigned[idx],
          columnCount: clusterSize,
        };
      }
    }
    return result;
  }
  ```

- [ ] **Step 2: Update `EventBlock` signature and rendering**

  Find the `EventBlock` function (lines 172–196 in original file):
  ```tsx
  function EventBlock({ lead, hourHeight, startHour, isAdmin, isDayView }: { lead: Lead; hourHeight: number; startHour: number; isAdmin: boolean; isDayView?: boolean }) {
    const hourDec = getHourDecimal(lead.appointmentDate);
    const time = formatTime(lead.appointmentDate);
    if (hourDec === null) return null;
    const top = (hourDec - startHour) * hourHeight;
    if (top < 0) return null;
    const sc = getStatusColor(lead.leadStatus);

    return (
      <Popover>
        <PopoverTrigger asChild>
          <div
            className={`absolute left-0.5 right-0.5 ${sc.bg} border-l-[3px] ${sc.border} rounded-r-md px-1.5 py-0.5 cursor-pointer hover:brightness-110 hover:shadow-sm transition-all z-10 overflow-hidden`}
            style={{ top, minHeight: 26, maxHeight: hourHeight - 2 }}
          >
            <p className={`text-[9px] ${isDayView ? "sm:text-xs" : "sm:text-[10px]"} font-bold ${sc.text} truncate`}>{time}</p>
            <p className={`text-[8px] ${isDayView ? "sm:text-[11px]" : "sm:text-[9px]"} text-foreground truncate`}>{lead.fullName || "No name"}</p>
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3" side="right" align="start">
          <LeadPopoverCard lead={lead} isAdmin={isAdmin} />
        </PopoverContent>
      </Popover>
    );
  }
  ```

  Replace the entire `EventBlock` function with:
  ```tsx
  function EventBlock({
    lead, hourHeight, startHour, isAdmin, isDayView, columnIndex, columnCount,
  }: {
    lead: Lead;
    hourHeight: number;
    startHour: number;
    isAdmin: boolean;
    isDayView?: boolean;
    columnIndex?: number;
    columnCount?: number;
  }) {
    const hourDec = getHourDecimal(lead.appointmentDate);
    const time = formatTime(lead.appointmentDate);
    if (hourDec === null) return null;
    const top = (hourDec - startHour) * hourHeight;
    if (top < 0) return null;
    const sc = getStatusColor(lead.leadStatus);

    const colIdx = columnIndex ?? 0;
    const colCnt = columnCount ?? 1;
    const widthPct = 100 / colCnt;
    const leftPct = colIdx * widthPct;

    return (
      <Popover>
        <PopoverTrigger asChild>
          <div
            className={`${sc.bg} border-l-[3px] ${sc.border} rounded-r-md px-1.5 py-1 cursor-pointer hover:brightness-110 hover:shadow-sm transition-all z-10 overflow-hidden`}
            style={{
              position: "absolute",
              top,
              minHeight: 40,
              maxHeight: hourHeight - 2,
              width: `calc(${widthPct}% - 2px)`,
              left: `calc(${leftPct}% + 1px)`,
            }}
          >
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
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3" side="right" align="start">
          <LeadPopoverCard lead={lead} isAdmin={isAdmin} />
        </PopoverContent>
      </Popover>
    );
  }
  ```

- [ ] **Step 3: Build and verify**

  ```bash
  cd /Users/admin/Desktop/connectacreators && npm run build 2>&1 | tail -30
  ```
  Expected: build succeeds with 0 TypeScript errors.

- [ ] **Step 4: Commit**

  ```bash
  cd /Users/admin/Desktop/connectacreators
  git add src/pages/LeadCalendar.tsx
  git commit -m "feat(calendar): add overlap layout algorithm + medium event cards"
  ```

---

## Chunk 3: Wire Overlap Props into Day and Week Views

### Task 3: Pass `columnIndex` / `columnCount` to `EventBlock` in day and week views

**Files:**
- Modify: `src/pages/LeadCalendar.tsx` (day view render block ~line 597, week view render block ~line 641)

**Context:** The day and week view render blocks currently call `<EventBlock>` without `columnIndex`/`columnCount`. Those props default to `0`/`1` (full width) if omitted. We now call `computeLayoutForDay` per day and pass the computed values.

> **Note:** The `~line 597` and `~line 641` annotations below reference the **original unchanged file**. After Chunks 1 and 2 are applied, actual line numbers will have shifted (Chunk 1 removes ~45 lines; Chunk 2 adds ~70 lines). Identify the correct location by matching the JSX content shown, not by line number.

- [ ] **Step 1: Update the day view render block**

  Find the day view block. It currently contains:
  ```tsx
  <div className="absolute top-0 bottom-0 left-14 right-0">
    {dayLeads.map((lead) => (
      <EventBlock key={lead.id} lead={lead} hourHeight={HOUR_HEIGHT} startHour={HOURS[0]} isAdmin={isAdmin} isDayView />
    ))}
    {isToday && <NowIndicator hourHeight={HOUR_HEIGHT} startHour={HOURS[0]} />}
  </div>
  ```

  Replace with:
  ```tsx
  <div className="absolute top-0 bottom-0 left-14 right-0">
    {(() => {
      const layoutMap = computeLayoutForDay(dayLeads);
      return dayLeads.map((lead) => {
        const layout = layoutMap[lead.id] ?? { columnIndex: 0, columnCount: 1 };
        return (
          <EventBlock
            key={lead.id}
            lead={lead}
            hourHeight={HOUR_HEIGHT}
            startHour={HOURS[0]}
            isAdmin={isAdmin}
            isDayView
            columnIndex={layout.columnIndex}
            columnCount={layout.columnCount}
          />
        );
      });
    })()}
    {isToday && <NowIndicator hourHeight={HOUR_HEIGHT} startHour={HOURS[0]} />}
  </div>
  ```

- [ ] **Step 2: Update the week view render block**

  Find the week view day column render. It currently contains:
  ```tsx
  <div key={colIdx} className={`relative ${colIdx > 0 ? "border-l border-border/30" : ""} ${isToday ? "bg-primary/5" : ""}`}>
    {dayLeads.map((lead) => (
      <EventBlock key={lead.id} lead={lead} hourHeight={HOUR_HEIGHT} startHour={HOURS[0]} isAdmin={isAdmin} />
    ))}
    {isToday && <NowIndicator hourHeight={HOUR_HEIGHT} startHour={HOURS[0]} />}
  </div>
  ```

  Replace with:
  ```tsx
  <div key={colIdx} className={`relative ${colIdx > 0 ? "border-l border-border/30" : ""} ${isToday ? "bg-primary/5" : ""}`}>
    {(() => {
      const layoutMap = computeLayoutForDay(dayLeads);
      return dayLeads.map((lead) => {
        const layout = layoutMap[lead.id] ?? { columnIndex: 0, columnCount: 1 };
        return (
          <EventBlock
            key={lead.id}
            lead={lead}
            hourHeight={HOUR_HEIGHT}
            startHour={HOURS[0]}
            isAdmin={isAdmin}
            columnIndex={layout.columnIndex}
            columnCount={layout.columnCount}
          />
        );
      });
    })()}
    {isToday && <NowIndicator hourHeight={HOUR_HEIGHT} startHour={HOURS[0]} />}
  </div>
  ```

- [ ] **Step 3: Build and verify clean**

  ```bash
  cd /Users/admin/Desktop/connectacreators && npm run build 2>&1 | tail -30
  ```
  Expected: build succeeds, 0 errors, 0 TypeScript errors.

- [ ] **Step 4: Commit**

  ```bash
  cd /Users/admin/Desktop/connectacreators
  git add src/pages/LeadCalendar.tsx
  git commit -m "feat(calendar): wire overlap column layout into day and week views"
  ```

---

## Chunk 4: Deploy to VPS

### Task 4: Build and deploy to production

**Files:**
- Deploy: `/var/www/connectacreators/` on VPS (72.62.200.145)

- [ ] **Step 1: Build production bundle on VPS**

  The user's preference is to build on the VPS. SCP the updated source file to VPS and rebuild:

  ```bash
  # SCP the updated file to VPS
  scp /Users/admin/Desktop/connectacreators/src/pages/LeadCalendar.tsx root@72.62.200.145:/var/www/connectacreators/src/pages/LeadCalendar.tsx
  ```

  Then SSH and rebuild:
  ```bash
  ssh root@72.62.200.145 "cd /var/www/connectacreators && npm run build 2>&1 | tail -20"
  ```
  Expected: build succeeds in ~20-30s.

- [ ] **Step 2: Reload nginx**

  ```bash
  ssh root@72.62.200.145 "nginx -s reload"
  ```

- [ ] **Step 3: Smoke test**

  Open `https://connectacreators.com/lead-calendar` in browser and verify:
  1. View switcher shows only Day / Week / Month (no Year)
  2. Event cards show name + time on row 1, status badge on row 2
  3. If there are leads with the same time, they appear side-by-side

---

## Manual Verification Checklist

After deployment, verify these scenarios manually:

**Overlap layout:**
- [ ] Two leads at the same time on the same day → appear side-by-side at 50% width each
- [ ] Three leads within 45 minutes → appear side-by-side at 33% width each
- [ ] Lead outside the 45-minute window → appears full width independently
- [ ] Clicking any overlapping event card opens the correct popover

**Medium card:**
- [ ] Row 1: name (bold, colored) + time (smaller, muted) on same line
- [ ] Row 2: status badge with pill shape and correct color
- [ ] Long names truncate with ellipsis

**Year view removed:**
- [ ] View switcher shows exactly: Día | Week | Month
- [ ] No "Year" button visible
- [ ] No console errors on page load

**Regression:**
- [ ] Clicking sidebar lead → navigates to day view for that date
- [ ] Mini calendar date click → navigates to day view
- [ ] Today button → returns to current week/month/day
- [ ] NowIndicator (red line) visible on today in week view
- [ ] Popover card still shows all lead details (phone, email, status, notes)
