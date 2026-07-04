import { describe, it, expect } from "vitest";
import { monthWindow, expectedByToday, pacePct, paceState, fulfillmentScore } from "./pace";

const NOW = new Date(2026, 6, 3, 12, 0, 0); // Jul 3 2026 local

describe("monthWindow", () => {
  it("marks the current month and its day-of", () => {
    const w = monthWindow(2026, 6, NOW);
    expect(w.isCurrent).toBe(true);
    expect(w.dayOf).toBe(3);
    expect(w.daysInMonth).toBe(31);
    expect(new Date(w.startIso).getTime()).toBe(new Date(2026, 6, 1).getTime());
    expect(new Date(w.endIso).getTime()).toBe(new Date(2026, 7, 1).getTime());
  });
  it("treats past months as complete", () => {
    const w = monthWindow(2026, 5, NOW); // June
    expect(w.isCurrent).toBe(false);
    expect(w.dayOf).toBe(30);
    expect(w.daysInMonth).toBe(30);
  });
});

describe("expectedByToday", () => {
  it("prorates the current month, min 1", () => {
    expect(expectedByToday(20, monthWindow(2026, 6, NOW))).toBe(2); // 20*3/31 ≈ 1.9 → 2
    expect(expectedByToday(3, monthWindow(2026, 6, NOW))).toBe(1);  // round(0.29) → min 1
  });
  it("uses the full target for past months", () => {
    expect(expectedByToday(20, monthWindow(2026, 5, NOW))).toBe(20);
  });
});

describe("pacePct / paceState", () => {
  const cur = monthWindow(2026, 6, NOW);
  const past = monthWindow(2026, 5, NOW);
  it("scores current month against expected-by-today, capped at 100", () => {
    expect(pacePct(8, 20, cur)).toBe(100);  // 8 vs expected 2
    expect(pacePct(0, 20, cur)).toBe(0);
    expect(pacePct(1, 20, cur)).toBe(50);   // 1 of expected 2
  });
  it("scores past months against the full target", () => {
    expect(pacePct(7, 20, past)).toBe(35);
    expect(pacePct(20, 20, past)).toBe(100);
  });
  it("classifies ahead/close/behind vs expected", () => {
    expect(paceState(8, 20, cur)).toBe("ahead");
    expect(paceState(1, 20, cur)).toBe("close");   // ≥ 50% of expected
    expect(paceState(0, 20, cur)).toBe("behind");
    expect(paceState(20, 20, past)).toBe("ahead"); // hit target
    expect(paceState(7, 20, past)).toBe("behind"); // 35% < 50%
  });
});

describe("pacePct / paceState edge cases", () => {
  const cur = monthWindow(2026, 6, NOW);
  it("guards against a zero target via Math.max(1, …)", () => {
    expect(pacePct(0, 0, cur)).toBe(0);
    expect(Number.isNaN(pacePct(0, 0, cur))).toBe(false);
    expect(paceState(0, 0, cur)).toBe("behind");
  });
});

describe("monthWindow leap year", () => {
  it("counts 29 days in Feb 2028 (leap year), non-current month", () => {
    const w = monthWindow(2028, 1, new Date(2028, 0, 15)); // now = Jan 2028
    expect(w.isCurrent).toBe(false);
    expect(w.daysInMonth).toBe(29);
    expect(w.dayOf).toBe(29);
  });
});

describe("fulfillmentScore", () => {
  const inputs = {
    scripts: 8, edited: 0, scheduled: 2,
    scriptsTarget: 20, editedTarget: 20, scheduledTarget: 20,
    manychatActive: true, audienceScore: 6, uniquenessScore: 5,
  };
  it("prorates the current month (no early-month panic)", () => {
    // scripts 100*.25 + edited 0*.25 + sched 100*.20 + manychat 100*.15 + aud 55*.15 = 68.25 → 68
    expect(fulfillmentScore(inputs, monthWindow(2026, 6, NOW))).toBe(68);
  });
  it("scores past months against full targets", () => {
    const june = { ...inputs, scripts: 20, edited: 7, scheduled: 3 };
    // 100*.25 + 35*.25 + 15*.20 + 100*.15 + 55*.15 = 60.0
    expect(fulfillmentScore(june, monthWindow(2026, 5, NOW))).toBe(60);
  });
});
