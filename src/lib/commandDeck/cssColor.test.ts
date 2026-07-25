import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveCssHsl } from "./cssColor";

describe("resolveCssHsl", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("wraps a resolved custom property in hsl()", () => {
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      getPropertyValue: (name: string) => (name === "--aqua" ? "184 41% 70%" : ""),
    } as CSSStyleDeclaration);
    expect(resolveCssHsl("--aqua", "0 0% 50%")).toBe("hsl(184 41% 70%)");
  });

  it("falls back when the property is empty", () => {
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      getPropertyValue: () => "",
    } as CSSStyleDeclaration);
    expect(resolveCssHsl("--missing", "0 0% 50%")).toBe("hsl(0 0% 50%)");
  });

  it("falls back when document is unavailable (SSR-safety)", () => {
    const original = globalThis.document;
    // @ts-expect-error — simulate no-document environment
    delete globalThis.document;
    expect(resolveCssHsl("--aqua", "184 41% 70%")).toBe("hsl(184 41% 70%)");
    globalThis.document = original;
  });
});
