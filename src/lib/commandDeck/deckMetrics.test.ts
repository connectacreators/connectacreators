import { describe, it, expect } from "vitest";
import { monthWindow } from "@/lib/strategy/pace";
import { scriptsPace, calendarCoverage, radarBlipsFromCounts } from "./deckMetrics";

describe("scriptsPace", () => {
  it("computes percent of prorated target", () => {
    // Day 15 of a 30-day month → prorated target = round(20 * 15/30) = 10
    const w = monthWindow(2026, 6, new Date(2026, 6, 15));
    const result = scriptsPace(8, 20, w);
    expect(result.count).toBe(8);
    expect(result.target).toBe(20);
    expect(result.pct).toBe(80); // 8 / 10 prorated = 80%
  });

  it("caps at 100% when ahead of pace", () => {
    const w = monthWindow(2026, 6, new Date(2026, 6, 5));
    const result = scriptsPace(50, 20, w);
    expect(result.pct).toBe(100);
  });
});

describe("calendarCoverage", () => {
  it("counts distinct covered days in the next 7", () => {
    const now = new Date(2026, 6, 1, 12, 0, 0);
    const dates = [
      new Date(2026, 6, 1).toISOString(),
      new Date(2026, 6, 1).toISOString(), // duplicate day, should not double-count
      new Date(2026, 6, 3).toISOString(),
      new Date(2026, 6, 20).toISOString(), // outside the 7-day window
    ];
    const result = calendarCoverage(dates, now);
    expect(result.daysCovered).toBe(2);
    expect(result.daysTotal).toBe(7);
  });

  it("returns zero coverage for an empty list", () => {
    expect(calendarCoverage([], new Date(2026, 6, 1)).daysCovered).toBe(0);
  });
});

describe("radarBlipsFromCounts", () => {
  it("emits one blip per unit, capped per category, with correct severities", () => {
    const blips = radarBlipsFromCounts(2, 1, 3);
    expect(blips.filter((b) => b.severity === "crit")).toHaveLength(2);
    expect(blips.filter((b) => b.severity === "warn")).toHaveLength(1);
    expect(blips.filter((b) => b.severity === "info")).toHaveLength(3);
    for (const b of blips) {
      expect(b.radius).toBeGreaterThan(0);
      expect(b.radius).toBeLessThanOrEqual(1);
      expect(b.angle).toBeGreaterThanOrEqual(0);
      expect(b.angle).toBeLessThan(Math.PI * 2);
    }
  });

  it("caps each category at 6 blips so one runaway count can't flood the radar", () => {
    const blips = radarBlipsFromCounts(20, 0, 0);
    expect(blips.filter((b) => b.severity === "crit")).toHaveLength(6);
  });
});
