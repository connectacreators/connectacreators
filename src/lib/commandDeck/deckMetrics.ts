import { expectedByToday, type MonthWindow } from "@/lib/strategy/pace";

export function scriptsPace(
  scriptsThisMonth: number,
  target: number,
  w: MonthWindow,
): { count: number; target: number; pct: number } {
  const basis = expectedByToday(Math.max(1, target), w);
  const pct = Math.round(Math.min(100, (scriptsThisMonth / basis) * 100));
  return { count: scriptsThisMonth, target, pct };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Distinct calendar days (of the next 7, starting today) that have at
 *  least one item in `scheduleDates`. */
export function calendarCoverage(
  scheduleDates: string[],
  now: Date = new Date(),
): { daysCovered: number; daysTotal: 7 } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime() + 7 * DAY_MS);
  const covered = new Set<string>();
  for (const iso of scheduleDates) {
    const d = new Date(iso);
    if (d >= start && d < end) {
      covered.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    }
  }
  return { daysCovered: covered.size, daysTotal: 7 };
}

export interface RadarBlip {
  angle: number;
  radius: number;
  severity: "crit" | "warn" | "info";
}

const MAX_BLIPS_PER_CATEGORY = 6;

/** Deterministic-enough scatter (not random — stable across re-renders
 *  within a single count) of `count` blips onto the radar for a severity
 *  category, capped so one runaway count can't flood the display. */
function scatter(count: number, severity: RadarBlip["severity"], seedOffset: number): RadarBlip[] {
  const n = Math.min(count, MAX_BLIPS_PER_CATEGORY);
  const blips: RadarBlip[] = [];
  for (let i = 0; i < n; i++) {
    const angle = ((i * 2.399963 + seedOffset) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    const radius = 0.35 + ((i * 0.618) % 1) * 0.6;
    blips.push({ angle, radius, severity });
  }
  return blips;
}

export function radarBlipsFromCounts(
  needsRevisionsCount: number,
  pastDeadlineCount: number,
  emptyCalendarDaysCount: number,
): RadarBlip[] {
  return [
    ...scatter(needsRevisionsCount, "crit", 0.7),
    ...scatter(pastDeadlineCount, "warn", 2.1),
    ...scatter(emptyCalendarDaysCount, "info", 4.5),
  ];
}
