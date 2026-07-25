import { describe, it, expect } from "vitest";
import { outboundPct, outboundPaceState } from "./outboundPace";

describe("outboundPct", () => {
  it("computes percent of target", () => {
    expect(outboundPct(32, 50)).toBe(64);
  });

  it("caps at 100 when over target", () => {
    expect(outboundPct(75, 50)).toBe(100);
  });

  it("returns 0 when target is not positive", () => {
    expect(outboundPct(10, 0)).toBe(0);
  });
});

describe("outboundPaceState", () => {
  it("is ahead once the target is met, regardless of time of day", () => {
    const morning = new Date(2026, 6, 25, 9, 0);
    expect(outboundPaceState(50, 50, morning)).toBe("ahead");
  });

  it("is on-pace when at or above the expected-by-now fraction", () => {
    const noon = new Date(2026, 6, 25, 12, 0); // 50% through the day
    expect(outboundPaceState(25, 50, noon)).toBe("on-pace");
  });

  it("is behind when under the expected-by-now fraction", () => {
    const noon = new Date(2026, 6, 25, 12, 0);
    expect(outboundPaceState(5, 50, noon)).toBe("behind");
  });
});
