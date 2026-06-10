import { describe, it, expect } from "vitest";
import { buildPipelineRows } from "@/lib/triage/buildPipelineRows";

describe("vitest wiring", () => {
  it("buildPipelineRows returns [] for null source", () => {
    expect(buildPipelineRows(null)).toEqual([]);
  });
});
