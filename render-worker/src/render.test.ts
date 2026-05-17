// render-worker/src/render.test.ts
import { describe, it, expect } from "vitest";
import { buildTrimConcatArgs } from "./render.js";

describe("buildTrimConcatArgs", () => {
  it("builds a single-clip trim+concat filter", () => {
    const args = buildTrimConcatArgs(
      "/in.mp4",
      [{ source_start_ms: 1000, source_end_ms: 5000 }],
      "/out.mp4",
    );
    const fcIdx = args.indexOf("-filter_complex");
    expect(fcIdx).toBeGreaterThan(-1);
    const fc = args[fcIdx + 1];
    expect(fc).toContain("trim=start=1:end=5");
    expect(fc).toContain("concat=n=1:v=1:a=1[vout][aout]");
    expect(args).toContain("/in.mp4");
    expect(args[args.length - 1]).toBe("/out.mp4");
  });

  it("handles multiple clips", () => {
    const args = buildTrimConcatArgs(
      "/in.mp4",
      [
        { source_start_ms: 0, source_end_ms: 2000 },
        { source_start_ms: 4000, source_end_ms: 7000 },
      ],
      "/out.mp4",
    );
    const fc = args[args.indexOf("-filter_complex") + 1];
    expect(fc).toContain("trim=start=0:end=2");
    expect(fc).toContain("trim=start=4:end=7");
    expect(fc).toContain("concat=n=2:v=1:a=1[vout][aout]");
  });

  it("throws on empty clip list", () => {
    expect(() => buildTrimConcatArgs("/in.mp4", [], "/out.mp4")).toThrow();
  });
});
