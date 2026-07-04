import { describe, it, expect } from "vitest";
import { nextSameWeekday, sortByUrgency } from "./pipelineDates";

const NOW = new Date(2026, 6, 3); // Fri Jul 3 2026

// Build local-midnight ISO strings the same way `fromInputValue` does, so
// fixtures match real pipeline data (not UTC-midnight strings that would
// shift a day in this machine's UTC-6 timezone).
const iso = (y: number, m0: number, d: number) => new Date(y, m0, d).toISOString();
const localSlice = (y: number, m0: number, d: number) => new Date(y, m0, d).toISOString().slice(0, 10);

describe("nextSameWeekday", () => {
  it("suggests the overdue date's weekday, next week from today", () => {
    // Mon Jun 29 local → next Monday after Fri Jul 3 = Mon Jul 6
    expect(nextSameWeekday(iso(2026, 5, 29), NOW).slice(0, 10)).toBe(localSlice(2026, 6, 6));
  });
  it("never suggests today or the past", () => {
    // Fri Jun 19 local, today Fri Jul 3 → next Friday = Jul 10
    expect(nextSameWeekday(iso(2026, 5, 19), NOW).slice(0, 10)).toBe(localSlice(2026, 6, 10));
  });
});

describe("sortByUrgency", () => {
  it("orders overdue → soon → far → unset", () => {
    const rows = [
      { field: "boosting_at", iso: null },
      { field: "script_due_at", iso: iso(2026, 6, 6) },   // soon (in 3d)
      { field: "posting_at", iso: iso(2026, 5, 18) },      // overdue
      { field: "onboarding_call_at", iso: iso(2026, 7, 1) }, // far
    ];
    expect(sortByUrgency(rows, NOW).map(r => r.field))
      .toEqual(["posting_at", "script_due_at", "onboarding_call_at", "boosting_at"]);
  });
});
