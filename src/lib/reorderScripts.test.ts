import { describe, it, expect } from "vitest";
import { computeReorder } from "./reorderScripts";

describe("computeReorder", () => {
  const view = ["A", "B", "C", "D"];

  it("dragging an item down lands it after the drop target (arrayMove parity)", () => {
    // drop A onto C
    expect(computeReorder(view, ["A"], "C")).toEqual(["B", "C", "A", "D"]);
  });

  it("dragging an item up lands it before the drop target (arrayMove parity)", () => {
    // drop D onto B
    expect(computeReorder(view, ["D"], "B")).toEqual(["A", "D", "B", "C"]);
  });

  it("dropping onto the immediate neighbor swaps them", () => {
    expect(computeReorder(view, ["B"], "C")).toEqual(["A", "C", "B", "D"]);
    expect(computeReorder(view, ["C"], "B")).toEqual(["A", "C", "B", "D"]);
  });

  it("dropping an item onto itself is a no-op", () => {
    expect(computeReorder(view, ["B"], "B")).toEqual(["A", "B", "C", "D"]);
  });

  it("moves a multi-item selection as a contiguous block, preserving its order", () => {
    const v = ["A", "B", "C", "D", "E"];
    // drop selection {A,B} onto D -> block lands after D
    expect(computeReorder(v, ["A", "B"], "D")).toEqual(["C", "D", "A", "B", "E"]);
    // drop selection {D,E} onto B -> block lands before B
    expect(computeReorder(v, ["D", "E"], "B")).toEqual(["A", "D", "E", "B", "C"]);
  });

  it("ignores moving ids that are not in the view and bails if target is missing", () => {
    expect(computeReorder(view, ["Z"], "C")).toEqual(["A", "B", "C", "D"]);
    expect(computeReorder(view, ["A"], "Z")).toEqual(["A", "B", "C", "D"]);
  });

  it("dropping onto a member of the moving selection is a no-op", () => {
    expect(computeReorder(view, ["A", "B"], "A")).toEqual(["A", "B", "C", "D"]);
  });
});
