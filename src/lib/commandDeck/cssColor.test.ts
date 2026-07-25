import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { resolveCssHsl } from "./cssColor";

describe("resolveCssHsl", () => {
  beforeEach(() => {
    // Stub window and document for tests that need DOM APIs, without affecting
    // SSR-safety branches in other tests or production code. Tests that need
    // different behavior (e.g., no-document case in test 3) override locally.
    vi.stubGlobal("window", {
      getComputedStyle: () => ({
        getPropertyValue: () => "",
      }),
    });
    vi.stubGlobal("document", {
      documentElement: {},
    });
    // Also stub global getComputedStyle for the resolveCssHsl implementation
    vi.stubGlobal("getComputedStyle", () => ({
      getPropertyValue: () => "",
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("wraps a resolved custom property in hsl()", () => {
    vi.spyOn(globalThis, "getComputedStyle" as any).mockReturnValue({
      getPropertyValue: (name: string) => (name === "--aqua" ? "184 41% 70%" : ""),
    } as unknown as CSSStyleDeclaration);
    expect(resolveCssHsl("--aqua", "0 0% 50%")).toBe("hsl(184 41% 70%)");
  });

  it("falls back when the property is empty", () => {
    vi.spyOn(globalThis, "getComputedStyle" as any).mockReturnValue({
      getPropertyValue: () => "",
    } as unknown as CSSStyleDeclaration);
    expect(resolveCssHsl("--missing", "0 0% 50%")).toBe("hsl(0 0% 50%)");
  });

  it("falls back when document is unavailable (SSR-safety)", () => {
    const original = globalThis.document;
    delete globalThis.document;
    expect(resolveCssHsl("--aqua", "184 41% 70%")).toBe("hsl(184 41% 70%)");
    globalThis.document = original;
  });
});
