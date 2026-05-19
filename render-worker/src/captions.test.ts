// render-worker/src/captions.test.ts
import { describe, it, expect } from "vitest";
import { buildAssFile, type Caption } from "./captions.js";

const baseCaption: Caption = {
  id: "c1",
  preset: "tiktok_word_pop",
  position: { x_pct: 50, y_pct: 80, anchor: "center" },
  words: [
    { text: "HELLO", start_ms: 1000, end_ms: 1400 },
    { text: "WORLD", start_ms: 1500, end_ms: 1900 },
  ],
};

describe("buildAssFile", () => {
  it("emits valid script header + styles + events", () => {
    const ass = buildAssFile([baseCaption], [{ source_start_ms: 0, source_end_ms: 5000 }], 5000);
    expect(ass).toContain("[Script Info]");
    expect(ass).toContain("[V4+ Styles]");
    expect(ass).toContain("Style: tiktok_word_pop");
    expect(ass).toContain("[Events]");
    expect(ass).toContain("Dialogue:");
    expect(ass).toContain("HELLO");
    expect(ass).toContain("WORLD");
  });

  it("maps source time to output time across trim cuts", () => {
    // Two clips: 0-2000 (keep) and 4000-6000 (keep). A word at source_ms=4100
    // should appear at output_ms = 2000 + 100 = 2100.
    const cap: Caption = {
      ...baseCaption,
      words: [{ text: "JUMP", start_ms: 4100, end_ms: 4500 }],
    };
    const ass = buildAssFile(
      [cap],
      [
        { source_start_ms: 0, source_end_ms: 2000 },
        { source_start_ms: 4000, source_end_ms: 6000 },
      ],
      4000,
    );
    expect(ass).toContain("JUMP");
    // Expect start at output_ms 2100 → 0:00:02.10
    expect(ass).toMatch(/0:00:02\.\d{2}/);
  });

  it("drops words inside removed (silence-cut) ranges", () => {
    // Clips skip 2000-3000. A word at source_ms=2500 is unreachable.
    const cap: Caption = {
      ...baseCaption,
      words: [
        { text: "BEFORE", start_ms: 1000, end_ms: 1400 },
        { text: "GONE", start_ms: 2500, end_ms: 2700 },
        { text: "AFTER", start_ms: 3200, end_ms: 3400 },
      ],
    };
    const ass = buildAssFile(
      [cap],
      [
        { source_start_ms: 0, source_end_ms: 2000 },
        { source_start_ms: 3000, source_end_ms: 5000 },
      ],
      4000,
    );
    expect(ass).toContain("BEFORE");
    expect(ass).toContain("AFTER");
    expect(ass).not.toContain("GONE");
  });

  it("preserves transcript casing by default (matches browser preview)", () => {
    // Default presets keep Whisper's sentence case so what the user sees in
    // the editor preview matches the burned-in render.
    const cap: Caption = {
      ...baseCaption,
      preset: "tiktok_word_pop",
      words: [{ text: "okay so", start_ms: 100, end_ms: 600 }],
    };
    const ass = buildAssFile([cap], [{ source_start_ms: 0, source_end_ms: 5000 }], 5000);
    expect(ass).toContain("okay so");
    expect(ass).not.toContain("OKAY SO");
  });

  it("emits no Dialogue line when every word is in a removed range", () => {
    const cap: Caption = {
      ...baseCaption,
      words: [{ text: "NEVER", start_ms: 2500, end_ms: 2700 }],
    };
    const ass = buildAssFile(
      [cap],
      [
        { source_start_ms: 0, source_end_ms: 2000 },
        { source_start_ms: 3000, source_end_ms: 5000 },
      ],
      4000,
    );
    expect(ass).not.toContain("Dialogue:");
  });
});
