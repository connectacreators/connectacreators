import { describe, it, expect } from "vitest";
import {
  toDateKey,
  parseDateKey,
  buildScheduleCounts,
  type ScheduleCountsInput,
} from "./ScheduleCalendar";

describe("toDateKey / parseDateKey (timezone-safe)", () => {
  it("formats a local Date as yyyy-MM-dd without UTC shift", () => {
    // Local midnight Jun 17 2026 must stay Jun 17 — never roll to the 16th
    // the way `new Date('2026-06-17').toISOString()` would in negative-offset zones.
    const d = new Date(2026, 5, 17, 0, 0, 0);
    expect(toDateKey(d)).toBe("2026-06-17");
  });

  it("formats a late-evening local Date as the same day", () => {
    const d = new Date(2026, 5, 17, 23, 30, 0);
    expect(toDateKey(d)).toBe("2026-06-17");
  });

  it("round-trips key -> Date -> key", () => {
    expect(toDateKey(parseDateKey("2026-06-17"))).toBe("2026-06-17");
  });

  it("parses a key into a local midnight Date on the correct day", () => {
    const d = parseDateKey("2026-12-01");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(11); // December
    expect(d.getDate()).toBe(1);
  });
});

describe("buildScheduleCounts", () => {
  const items: ScheduleCountsInput[] = [
    { scheduledDate: "2026-06-17", lifecycleStatus: "Scheduled", clientId: "a" },
    { scheduledDate: "2026-06-17", lifecycleStatus: "Published", clientId: "a" },
    { scheduledDate: "2026-06-17", lifecycleStatus: "Scheduled", clientId: "b" },
    { scheduledDate: "2026-06-18", lifecycleStatus: "Scheduled", clientId: "a" },
    { scheduledDate: null, lifecycleStatus: "Scheduled", clientId: "a" },
  ];

  it("buckets published vs scheduled per day", () => {
    const map = buildScheduleCounts(items);
    expect(map.get("2026-06-17")).toEqual({ published: 1, scheduled: 2 });
    expect(map.get("2026-06-18")).toEqual({ published: 0, scheduled: 1 });
  });

  it("ignores items without a scheduled date", () => {
    const map = buildScheduleCounts(items);
    const total = [...map.values()].reduce(
      (n, c) => n + c.published + c.scheduled,
      0,
    );
    expect(total).toBe(4); // the null-date item is excluded
  });

  it("filters to a single client when clientId is given", () => {
    const map = buildScheduleCounts(items, "a");
    // client "b" video on the 17th must not be counted
    expect(map.get("2026-06-17")).toEqual({ published: 1, scheduled: 1 });
    expect(map.get("2026-06-18")).toEqual({ published: 0, scheduled: 1 });
  });

  it("normalizes a timestamp-ish scheduledDate to its day key", () => {
    const map = buildScheduleCounts([
      {
        scheduledDate: "2026-06-17T00:00:00.000Z",
        lifecycleStatus: "Scheduled",
        clientId: "a",
      },
    ]);
    expect(map.get("2026-06-17")).toEqual({ published: 0, scheduled: 1 });
  });
});
