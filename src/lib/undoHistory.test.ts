import { describe, it, expect } from "vitest";
import { UndoHistory } from "./undoHistory";

describe("UndoHistory", () => {
  it("starts with nothing to undo or redo", () => {
    const h = new UndoHistory<number[]>();
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(false);
    expect(h.undo([1])).toBeNull();
    expect(h.redo([1])).toBeNull();
  });

  it("undo returns the recorded snapshot and stages current for redo", () => {
    const h = new UndoHistory<string>();
    h.record("A"); // user about to change A -> B
    // state is now "B"
    expect(h.canUndo()).toBe(true);
    expect(h.undo("B")).toBe("A");
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(true);
    // state is now "A"; redo brings back "B"
    expect(h.redo("A")).toBe("B");
    expect(h.canRedo()).toBe(false);
    expect(h.canUndo()).toBe(true);
  });

  it("undoes multiple structural changes in reverse order (the deleted-lines bug)", () => {
    const h = new UndoHistory<string[]>();
    const s0 = ["hook", "body", "cta"];
    h.record(s0); // before deleting "body"
    const s1 = ["hook", "cta"];
    h.record(s1); // before deleting "cta"
    const s2 = ["hook"];
    // Two deletions happened; current is s2. Undo must restore them one at a time.
    expect(h.undo(s2)).toEqual(["hook", "cta"]);
    expect(h.undo(["hook", "cta"])).toEqual(["hook", "body", "cta"]);
    expect(h.canUndo()).toBe(false);
  });

  it("a new record after undo clears the redo stack", () => {
    const h = new UndoHistory<string>();
    h.record("A");
    h.undo("B"); // redo now holds "B"
    expect(h.canRedo()).toBe(true);
    h.record("A"); // new action invalidates redo history
    expect(h.canRedo()).toBe(false);
    expect(h.redo("X")).toBeNull();
  });

  it("caps the undo stack at the configured limit, dropping oldest", () => {
    const h = new UndoHistory<number>(3);
    h.record(1);
    h.record(2);
    h.record(3);
    h.record(4); // oldest (1) dropped
    expect(h.undo(99)).toBe(4);
    expect(h.undo(4)).toBe(3);
    expect(h.undo(3)).toBe(2);
    expect(h.canUndo()).toBe(false); // "1" was dropped
  });
});
