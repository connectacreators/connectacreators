// Pure month-window / pace / score math for the client Strategy page.
// Current month is judged against "expected by today" (prorated target);
// past months are judged against the full target and never change.

export interface MonthWindow {
  year: number;
  month: number; // 0-based
  startIso: string;
  endIso: string; // exclusive
  isCurrent: boolean;
  dayOf: number;
  daysInMonth: number;
}

export function monthWindow(year: number, month: number, now: Date = new Date()): MonthWindow {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const isCurrent = now.getFullYear() === year && now.getMonth() === month;
  return {
    year, month,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    isCurrent,
    dayOf: isCurrent ? now.getDate() : daysInMonth,
    daysInMonth,
  };
}

/** Prorated target for the current month (min 1); full target for past months. */
export function expectedByToday(target: number, w: MonthWindow): number {
  if (!w.isCurrent) return target;
  return Math.max(1, Math.round(target * (w.dayOf / w.daysInMonth)));
}

export function pacePct(count: number, target: number, w: MonthWindow): number {
  const basis = expectedByToday(Math.max(1, target), w);
  return Math.round(Math.min(100, (count / basis) * 100));
}

export type PaceState = "ahead" | "close" | "behind";

export function paceState(count: number, target: number, w: MonthWindow): PaceState {
  const basis = expectedByToday(Math.max(1, target), w);
  if (count >= basis) return "ahead";
  if (count >= basis * 0.5) return "close";
  return "behind";
}

export interface ScoreInputs {
  scripts: number;
  edited: number;
  scheduled: number;
  scriptsTarget: number;
  editedTarget: number;
  scheduledTarget: number;
  manychatActive: boolean;
  audienceScore: number;
  uniquenessScore: number;
}

/** Same weights as the legacy calcScore: scripts .25, edited .25,
 *  scheduled .20, ManyChat .15, audience .15. */
export function fulfillmentScore(i: ScoreInputs, w: MonthWindow): number {
  const scriptsPct = pacePct(i.scripts, i.scriptsTarget, w);
  const editedPct = pacePct(i.edited, i.editedTarget, w);
  const scheduledPct = pacePct(i.scheduled, i.scheduledTarget, w);
  const manychatPct = i.manychatActive ? 100 : 0;
  const audiencePct = ((i.audienceScore + i.uniquenessScore) / 2) * 10;
  return Math.round(
    scriptsPct * 0.25 + editedPct * 0.25 + scheduledPct * 0.20 +
    manychatPct * 0.15 + audiencePct * 0.15,
  );
}
