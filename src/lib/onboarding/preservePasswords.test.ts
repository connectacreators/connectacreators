import { describe, it, expect } from "vitest";
import { preservePasswords, PASSWORD_FIELDS, EMPTY_ONBOARDING, type OnboardingData } from "./types";

function form(overrides: Partial<OnboardingData> = {}): OnboardingData {
  return { ...EMPTY_ONBOARDING, ...overrides };
}

describe("preservePasswords", () => {
  it("backfills a blank password from the stored value (the wipe bug)", () => {
    const payload = form({ clientName: "Bravo Bonetti", instagramPassword: "", tiktokPassword: "" });
    const stored = { instagramPassword: "BravoBonetti2026!", tiktokPassword: "BravoBonetti2026!" };
    const out = preservePasswords(payload, stored);
    expect(out.instagramPassword).toBe("BravoBonetti2026!");
    expect(out.tiktokPassword).toBe("BravoBonetti2026!");
    // non-password fields pass through untouched
    expect(out.clientName).toBe("Bravo Bonetti");
  });

  it("keeps a newly-typed (non-empty) password — does not clobber an intentional change", () => {
    const payload = form({ instagramPassword: "NewPass123!" });
    const stored = { instagramPassword: "OldPass000!" };
    expect(preservePasswords(payload, stored).instagramPassword).toBe("NewPass123!");
  });

  it("treats whitespace-only incoming as blank", () => {
    const payload = form({ tiktokPassword: "   " });
    const stored = { tiktokPassword: "real-secret" };
    expect(preservePasswords(payload, stored).tiktokPassword).toBe("real-secret");
  });

  it("leaves blank when nothing is stored (no false data)", () => {
    const payload = form({ youtubePassword: "" });
    expect(preservePasswords(payload, {}).youtubePassword).toBe("");
    expect(preservePasswords(payload, null).youtubePassword).toBe("");
  });

  it("never touches non-password fields even if stored has more keys", () => {
    const payload = form({ instagram: "newhandle", instagramPassword: "" });
    const stored = { instagram: "oldhandle", instagramPassword: "secret" };
    const out = preservePasswords(payload, stored);
    expect(out.instagram).toBe("newhandle"); // handle change respected
    expect(out.instagramPassword).toBe("secret"); // password preserved
  });

  it("covers all four credential fields", () => {
    expect([...PASSWORD_FIELDS].sort()).toEqual(
      ["facebookPassword", "instagramPassword", "tiktokPassword", "youtubePassword"].sort(),
    );
  });
});
