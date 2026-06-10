import { describe, it, expect } from "vitest";
import { colorFor, initials, MONOGRAM_PALETTE } from "@/lib/triage/clientMonogram";

describe("clientMonogram", () => {
  it("colorFor is deterministic and returns a palette slot", () => {
    const a = colorFor("Dr Calvin's Clinic");
    const b = colorFor("Dr Calvin's Clinic");
    expect(a).toEqual(b);
    expect(MONOGRAM_PALETTE).toContainEqual(a);
  });

  it("initials uses first two words when present", () => {
    expect(initials("Master Construction")).toBe("MC");
  });

  it("initials strips apostrophes and falls back to first two chars", () => {
    expect(initials("Spencer")).toBe("SP");
    expect(initials("Dr Calvin's Clinic")).toBe("DC");
  });
});
