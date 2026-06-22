import { describe, it, expect } from "vitest";
import { scriptBodyLength, SCRIPT_BODY_CHAR_LIMIT } from "./scriptLength";
import type { ScriptLine } from "@/hooks/useScripts";

const line = (text: string, over: Partial<ScriptLine> = {}): ScriptLine => ({
  line_number: 1, line_type: "actor", section: "body", text, block_kind: "line", ...over,
});

describe("scriptBodyLength", () => {
  it("sums content-line text lengths", () => {
    expect(scriptBodyLength([line("hello"), line("world!")])).toBe(11);
  });
  it("excludes heading rows", () => {
    expect(scriptBodyLength([line("Hook", { block_kind: "heading" }), line("abc")])).toBe(3);
  });
  it("treats missing block_kind as content", () => {
    expect(scriptBodyLength([{ line_number: 1, line_type: "actor", section: "body", text: "abcd" } as ScriptLine])).toBe(4);
  });
  it("handles empty/missing text as 0", () => {
    expect(scriptBodyLength([line(""), { ...line("x"), text: undefined as any }])).toBe(0);
  });
  it("exposes a 15000 limit", () => {
    expect(SCRIPT_BODY_CHAR_LIMIT).toBe(15000);
  });
});
