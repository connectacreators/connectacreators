import { describe, it, expect } from "vitest";
import { computeBlockDiff, buildBaseline, blockSignature } from "./scriptBlockDiff";
import type { ScriptLine } from "@/hooks/useScripts";

const blk = (id: string, n: number, text: string, over: Partial<ScriptLine> = {}): ScriptLine & { id: string } => ({
  id, line_number: n, line_type: "actor", section: "body", text, block_kind: "line", ...over,
});

describe("computeBlockDiff", () => {
  it("treats a block with no baseline entry as a new upsert", () => {
    const next = [blk("a", 1, "hello")];
    const { upserts, deleteIds } = computeBlockDiff(next, new Map(), []);
    expect(upserts.map((u) => u.id)).toEqual(["a"]);
    expect(deleteIds).toEqual([]);
  });

  it("omits an unchanged block from upserts (prevents clobber)", () => {
    const next = [blk("a", 1, "hello")];
    const baseline = buildBaseline(next);
    const { upserts } = computeBlockDiff(next, baseline, []);
    expect(upserts).toEqual([]);
  });

  it("upserts only the block whose content changed", () => {
    const loaded = [blk("a", 1, "hello"), blk("b", 2, "world")];
    const baseline = buildBaseline(loaded);
    const next = [blk("a", 1, "hello"), blk("b", 2, "WORLD!")];
    const { upserts } = computeBlockDiff(next, baseline, []);
    expect(upserts.map((u) => u.id)).toEqual(["b"]);
  });

  it("deletes only explicitly removed ids that are gone", () => {
    const next = [blk("a", 1, "hello")];
    const baseline = buildBaseline([blk("a", 1, "hello"), blk("b", 2, "world")]);
    const { deleteIds } = computeBlockDiff(next, baseline, ["b", "b"]);
    expect(deleteIds).toEqual(["b"]);
  });

  it("never deletes an id that is still present (re-added)", () => {
    const next = [blk("a", 1, "hello"), blk("b", 2, "back")];
    const { deleteIds } = computeBlockDiff(next, new Map(), ["b"]);
    expect(deleteIds).toEqual([]);
  });

  it("normalizes rich_text undefined and missing block_kind in the signature", () => {
    expect(blockSignature(blk("a", 1, "x"))).toEqual(
      blockSignature({ id: "a", line_number: 1, line_type: "actor", section: "body", text: "x", rich_text: null } as any),
    );
  });
});
