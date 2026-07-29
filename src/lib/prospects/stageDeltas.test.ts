import { describe, it, expect } from "vitest";
import { stageDeltas, STAGE_ORDER, MAX_STAGE } from "./stageDeltas";
import { EMPTY_COUNTS, computeRates } from "@/hooks/useOutboundMetrics";

describe("STAGE_ORDER", () => {
  it("is the six outbound funnel stages in sheet order", () => {
    expect(STAGE_ORDER).toEqual([
      "pre_initiated", "message_seen", "initiated",
      "engaged", "calendly_sent", "booked",
    ]);
    expect(MAX_STAGE).toBe(6);
  });
});

describe("stageDeltas", () => {
  it("counts only pre_initiated when a sourced row is first targeted", () => {
    expect(stageDeltas(0, 1)).toEqual([{ stage: "pre_initiated", delta: 1 }]);
  });

  it("fills every stage below when advancing several at once", () => {
    expect(stageDeltas(0, 3)).toEqual([
      { stage: "pre_initiated", delta: 1 },
      { stage: "message_seen", delta: 1 },
      { stage: "initiated", delta: 1 },
    ]);
  });

  it("un-counts only the stages given up when retreating", () => {
    expect(stageDeltas(4, 2)).toEqual([
      { stage: "initiated", delta: -1 },
      { stage: "engaged", delta: -1 },
    ]);
  });

  it("writes nothing for a no-op transition", () => {
    expect(stageDeltas(3, 3)).toEqual([]);
    expect(stageDeltas(0, 0)).toEqual([]);
  });

  it("clamps out-of-range input instead of producing junk stages", () => {
    expect(stageDeltas(-5, 1)).toEqual([{ stage: "pre_initiated", delta: 1 }]);
    expect(stageDeltas(0, 99)).toHaveLength(6);
    expect(stageDeltas(0, Number.NaN)).toEqual([]);
  });

  it("keeps the funnel monotone across an arbitrary transition sequence", () => {
    // Apply many transitions to real counters, then assert no stage ever
    // exceeds the one above it — which is what keeps every rate <= 100%.
    const counts = { ...EMPTY_COUNTS };
    const rows = [0, 0, 0, 0, 0];
    const moves: [number, number][] = [
      [0, 1], [1, 3], [2, 6], [3, 2], [4, 5],
      [0, 6], [1, 0], [2, 4], [3, 6], [4, 1],
    ];
    for (const [row, to] of moves) {
      for (const d of stageDeltas(rows[row], to)) counts[d.stage] += d.delta;
      rows[row] = to;
    }
    for (let i = 1; i < STAGE_ORDER.length; i++) {
      expect(counts[STAGE_ORDER[i]]).toBeLessThanOrEqual(counts[STAGE_ORDER[i - 1]]);
    }
    for (const r of computeRates(counts).steps) {
      if (r.value === "—") continue;
      expect(Number.parseFloat(r.value)).toBeLessThanOrEqual(100);
    }
  });

  it("never drives a counter negative when every row is fully retreated", () => {
    const counts = { ...EMPTY_COUNTS };
    const apply = (from: number, to: number) => {
      for (const d of stageDeltas(from, to)) counts[d.stage] += d.delta;
    };
    apply(0, 6); apply(0, 4); apply(6, 0); apply(4, 0);
    for (const s of STAGE_ORDER) expect(counts[s]).toBe(0);
  });
});
