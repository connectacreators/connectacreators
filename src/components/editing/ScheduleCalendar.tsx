import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { DayContentProps } from "react-day-picker";

import { Calendar } from "@/components/ui/calendar";
import type { LifecycleStatus } from "@/lib/lifecycleStatus";

/**
 * In-app calendar date picker for the Schedule Post modal. Replaces the native
 * <input type="date"> so each day can show dots for the videos already
 * scheduled on it — preventing accidental double-booking of one client's feed.
 *
 * Dot colors mirror LIFECYCLE_STYLE so they read the same as the status
 * badges in the queue: green = Published, primary (brand teal) = Scheduled.
 */

const DOT_CAP = 3; // max dots drawn per day before collapsing to "+N"

export interface DayCount {
  published: number;
  scheduled: number;
}

/** Minimal shape this component needs from an editing-queue item. */
export interface ScheduleCountsInput {
  scheduledDate: string | null;
  lifecycleStatus: LifecycleStatus;
  clientId?: string;
}

/**
 * Format a Date as a local `yyyy-MM-dd` key. Deliberately NOT
 * `toISOString()` — that returns UTC and shifts the day across timezones
 * (the classic off-by-one the native picker was prone to).
 */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parse a `yyyy-MM-dd` key into a LOCAL midnight Date (no UTC shift). */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/**
 * Build a `yyyy-MM-dd` -> {published, scheduled} map from items already in
 * memory. Pass `clientId` to restrict counts to a single client's feed.
 */
export function buildScheduleCounts(
  items: ScheduleCountsInput[],
  clientId?: string,
): Map<string, DayCount> {
  const map = new Map<string, DayCount>();
  for (const item of items) {
    if (!item.scheduledDate) continue;
    if (clientId && item.clientId !== clientId) continue;
    const key = item.scheduledDate.slice(0, 10); // normalize off any time part
    const entry = map.get(key) ?? { published: 0, scheduled: 0 };
    if (item.lifecycleStatus === "Published") entry.published += 1;
    else entry.scheduled += 1;
    map.set(key, entry);
  }
  return map;
}

interface ScheduleCalendarProps {
  /** Currently selected date as `yyyy-MM-dd`, or "" / null when unset. */
  value: string | null;
  /** Called with the new `yyyy-MM-dd` key when a day is picked. */
  onChange: (key: string) => void;
  /** Per-day counts to render as dots (build with buildScheduleCounts). */
  counts: Map<string, DayCount>;
  /** Earliest selectable day; days before this are disabled. */
  minDate?: Date;
  language?: "en" | "es";
}

export function ScheduleCalendar({
  value,
  onChange,
  counts,
  minDate,
  language = "en",
}: ScheduleCalendarProps) {
  const selected = value ? parseDateKey(value) : undefined;

  const DayContent = React.useCallback(
    ({ date }: DayContentProps) => {
      const c = counts.get(toDateKey(date));
      const total = c ? c.published + c.scheduled : 0;

      // Published dots first (green), then scheduled (brand primary).
      const dots: ("published" | "scheduled")[] = [];
      if (c) {
        for (let i = 0; i < c.published; i++) dots.push("published");
        for (let i = 0; i < c.scheduled; i++) dots.push("scheduled");
      }

      const overflow = total > DOT_CAP;
      const shown = overflow ? dots.slice(0, DOT_CAP - 1) : dots;

      return (
        <div className="relative flex h-full w-full items-center justify-center">
          <span>{date.getDate()}</span>
          {total > 0 && (
            <span className="pointer-events-none absolute -bottom-[3px] left-1/2 flex -translate-x-1/2 items-center gap-[2px]">
              {shown.map((kind, i) => (
                <span
                  key={i}
                  className={`h-1 w-1 rounded-full ${
                    kind === "published" ? "bg-green-500" : "bg-primary"
                  }`}
                />
              ))}
              {overflow && (
                <span className="text-[7px] font-medium leading-none text-muted-foreground">
                  +{total - (DOT_CAP - 1)}
                </span>
              )}
            </span>
          )}
        </div>
      );
    },
    [counts],
  );

  return (
    <div className="flex flex-col items-center gap-2">
      <Calendar
        mode="single"
        selected={selected}
        onSelect={(d) => d && onChange(toDateKey(d))}
        defaultMonth={selected ?? minDate}
        disabled={minDate ? { before: minDate } : undefined}
        showOutsideDays
        className="rounded-md border p-2"
        classNames={{
          // Drop the square accent fill the base Calendar paints behind a
          // selected day's cell — it bled a mismatched rounded square around
          // the circular day buttons. The day button carries the selection.
          cell: "h-9 w-9 text-center text-sm p-0 relative focus-within:relative focus-within:z-20",
          // Selected day = solid aqua circle with the dark ink number forced
          // on (the ghost base otherwise leaves it the light foreground, which
          // is invisible on aqua). `!` also wins over day_today when the
          // selected day is today.
          day_selected:
            "!bg-primary !text-primary-foreground rounded-full font-semibold hover:!bg-primary hover:!text-primary-foreground focus:!bg-primary focus:!text-primary-foreground",
          // Today (when not the selected day) = subtle aqua ring, not the
          // honey accent square the base Calendar used.
          day_today:
            "rounded-full font-semibold text-foreground ring-1 ring-inset ring-primary/60",
        }}
        components={{
          IconLeft: () => <ChevronLeft className="h-4 w-4" />,
          IconRight: () => <ChevronRight className="h-4 w-4" />,
          DayContent,
        }}
      />
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
          {language === "en" ? "Published" : "Publicado"}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          {language === "en" ? "Scheduled" : "Programado"}
        </span>
      </div>
    </div>
  );
}
