import { describe, it, expect } from "vitest";
import { rankClientViews, formatViews } from "./clientViews";

describe("rankClientViews", () => {
  it("sorts descending by this-week views", () => {
    const ranked = rankClientViews([
      { clientId: "a", clientName: "A", viewsThisWeek: 100, viewsPriorWeek: 100 },
      { clientId: "b", clientName: "B", viewsThisWeek: 300, viewsPriorWeek: 100 },
      { clientId: "c", clientName: "C", viewsThisWeek: 200, viewsPriorWeek: 100 },
    ]);
    expect(ranked.map((r) => r.clientId)).toEqual(["b", "c", "a"]);
  });

  it("computes week-over-week delta percent", () => {
    const [r] = rankClientViews([{ clientId: "a", clientName: "A", viewsThisWeek: 150, viewsPriorWeek: 100 }]);
    expect(r.deltaPct).toBe(50);
    expect(r.up).toBe(true);
  });

  it("marks a decline as down with a negative delta", () => {
    const [r] = rankClientViews([{ clientId: "a", clientName: "A", viewsThisWeek: 80, viewsPriorWeek: 100 }]);
    expect(r.deltaPct).toBe(-20);
    expect(r.up).toBe(false);
  });

  it("returns null delta when there is no prior-week baseline", () => {
    const [r] = rankClientViews([{ clientId: "a", clientName: "A", viewsThisWeek: 50, viewsPriorWeek: 0 }]);
    expect(r.deltaPct).toBeNull();
    expect(r.up).toBe(true);
  });
});

describe("formatViews", () => {
  it("formats under 1000 as-is", () => {
    expect(formatViews(428)).toBe("428");
  });

  it("formats thousands with a K suffix", () => {
    expect(formatViews(428_431)).toBe("428K");
  });

  it("formats millions with one decimal and an M suffix", () => {
    expect(formatViews(1_200_000)).toBe("1.2M");
  });

  it("handles exactly 1000", () => {
    expect(formatViews(1000)).toBe("1K");
  });
});
