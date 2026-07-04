// src/components/strategy/pipelineDates.ts
//
// Pure date helpers for the Production Pipeline section (ClientStrategy).
// Extracted out of ProductionPipelineSection.tsx so they're unit-testable
// without mounting the component.

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export type PipelineBucket = 'overdue' | 'soon' | 'far';

// Traffic-light coloring for pipeline dates, by how far away the date is:
//   red    → overdue (date already passed)
//   yellow → due within the next 7 days
//   green  → 7+ days away
export const PIPELINE_BUCKET_COLOR: Record<PipelineBucket, string> = {
  overdue: '#ef4444', // red
  soon:    '#f59e0b', // amber/yellow
  far:     '#22c55e', // green
};

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** red = overdue, yellow = within 7 days, green = further out. Date-only
 *  fields compare at calendar-day granularity so "due today" isn't overdue. */
export function pipelineBucket(iso: string, withTime: boolean, now: Date = new Date()): PipelineBucket {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'far';
  if (withTime) {
    if (d.getTime() < now.getTime()) return 'overdue';
    const days = (d.getTime() - now.getTime()) / 86_400_000;
    return days <= 7 ? 'soon' : 'far';
  }
  const dDay = startOfDay(d).getTime();
  const today = startOfDay(now).getTime();
  if (dDay < today) return 'overdue';
  const days = Math.round((dDay - today) / 86_400_000);
  return days <= 7 ? 'soon' : 'far';
}

export function formatTime(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const period = h >= 12 ? 'pm' : 'am';
  const h12 = ((h + 11) % 12) + 1;
  const mm = m === 0 ? '' : `:${m.toString().padStart(2, '0')}`;
  return `${h12}${mm}${period}`;
}

/** Absolute date label, e.g. "Mon Jun 14" — adds time for timed fields
 *  that carry a non-midnight time, e.g. "Mon Jun 14, 5:17pm". */
export function formatAbsolute(iso: string, withTime: boolean): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const base = `${WEEKDAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}`;
  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
  return withTime && hasTime ? `${base}, ${formatTime(d)}` : base;
}

/** Convert a `timestamptz` string to the `<input type="datetime-local">` / `date` value. */
export function toInputValue(iso: string | null, withTime: boolean): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => n.toString().padStart(2, '0');
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (!withTime) return date;
  return `${date}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Convert an input value back to ISO; empty → null. */
export function fromInputValue(v: string, withTime: boolean): string | null {
  if (!v) return null;
  const d = withTime ? new Date(v) : new Date(`${v}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Suggest the next occurrence of `fromIso`'s weekday, strictly after `now`
 *  (never today, never the past) — used by the "Schedule next?" prompt. */
export function nextSameWeekday(fromIso: string, now: Date = new Date()): string {
  const target = new Date(fromIso).getDay();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  do { d.setDate(d.getDate() + 1); } while (d.getDay() !== target);
  return d.toISOString();
}

/** Sort pipeline rows overdue → soon → far → unset. */
export function sortByUrgency<T extends { iso: string | null }>(rows: T[], now: Date = new Date()): T[] {
  const rank = (r: T) => r.iso === null ? 3 : ({ overdue: 0, soon: 1, far: 2 } as const)[pipelineBucket(r.iso, false, now)];
  return [...rows].sort((a, b) => rank(a) - rank(b));
}
