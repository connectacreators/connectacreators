import { describe, it, expect } from "vitest";
import { classifyLink, LINK_BADGE_LABEL } from "./linkBadge";

describe("classifyLink", () => {
  it("detects Calendly", () => {
    expect(classifyLink("https://calendly.com/drmiller/intro")).toBe("calendly");
    expect(classifyLink("CALENDLY.COM/x")).toBe("calendly");
  });

  it("detects other booking platforms", () => {
    expect(classifyLink("https://acuityscheduling.com/x")).toBe("booking");
    expect(classifyLink("https://squareup.com/appointments/y")).toBe("booking");
    expect(classifyLink("https://www.setmore.com/z")).toBe("booking");
  });

  it("detects a booking intent in the path of an own-domain link", () => {
    expect(classifyLink("https://millerchiro.com/book-now")).toBe("booking");
    expect(classifyLink("https://millerchiro.com/schedule")).toBe("booking");
    expect(classifyLink("https://millerchiro.com/appointment")).toBe("booking");
  });

  it("falls back to a plain site for anything else", () => {
    expect(classifyLink("https://millerchiro.com")).toBe("site");
    expect(classifyLink("https://linktr.ee/miller")).toBe("site");
  });

  it("reports absence for empty input", () => {
    expect(classifyLink(null)).toBe("none");
    expect(classifyLink(undefined)).toBe("none");
    expect(classifyLink("")).toBe("none");
    expect(classifyLink("   ")).toBe("none");
  });

  it("labels every badge", () => {
    expect(LINK_BADGE_LABEL.calendly).toBe("Calendly");
    expect(LINK_BADGE_LABEL.booking).toBe("Booking");
    expect(LINK_BADGE_LABEL.site).toBe("Site");
    expect(LINK_BADGE_LABEL.none).toBe("None");
  });
});
