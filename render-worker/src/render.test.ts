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

  it("loops an image b-roll for its window and trims from 0", () => {
    const args = buildTrimConcatArgs(
      "/in.mp4",
      [{ source_start_ms: 0, source_end_ms: 10000 }],
      "/out.mp4",
      {
        brolls: [{
          id: "img1",
          kind: "image",
          local_path: "/still.jpg",
          source_duration_ms: 5000,
          // A nonzero trim_start must NOT desync: the looped still spans
          // 0..(trim_end-trim_start), so the filter trims from 0.
          trim_start_ms: 2000,
          trim_end_ms: 5000,
          output_start_ms: 1000,
          mode: "fullscreen",
          position: { x_pct: 50, y_pct: 50, width_pct: 40 },
        }],
      },
    );
    // The image input is looped and capped to the 3s window (5000-2000).
    const i = args.indexOf("/still.jpg");
    expect(i).toBeGreaterThan(-1);
    expect(args[i - 1]).toBe("-i");
    expect(args.slice(i - 5, i - 1)).toEqual(["-loop", "1", "-t", "3.000"]);
    // Filter trims the looped stream from 0, not from trim_start.
    const fc = args[args.indexOf("-filter_complex") + 1];
    expect(fc).toContain("trim=start=0.000:end=3.000");
    // Overlay is enabled across the output window [1s, 4s].
    expect(fc).toContain("between(t,1.000,4.000)");
  });

  it("does not loop a video b-roll", () => {
    const args = buildTrimConcatArgs(
      "/in.mp4",
      [{ source_start_ms: 0, source_end_ms: 10000 }],
      "/out.mp4",
      {
        brolls: [{
          id: "vid1",
          kind: "video",
          local_path: "/clip.mp4",
          source_duration_ms: 8000,
          trim_start_ms: 2000,
          trim_end_ms: 5000,
          output_start_ms: 1000,
          mode: "fullscreen",
          position: { x_pct: 50, y_pct: 50, width_pct: 40 },
        }],
      },
    );
    const i = args.indexOf("/clip.mp4");
    expect(args[i - 1]).toBe("-i");
    expect(args.slice(i - 4, i)).not.toContain("-loop");
    // Video b-roll trims the real source range.
    const fc = args[args.indexOf("-filter_complex") + 1];
    expect(fc).toContain("trim=start=2.000:end=5.000");
  });
});
