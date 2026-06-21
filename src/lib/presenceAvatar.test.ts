import { describe, it, expect } from "vitest";
import { initialsFromName, colorForUser, dedupePresenceByUser } from "./presenceAvatar";
import type { PresenceUser } from "@/hooks/useRealtimePresence";

const u = (userId: string, name?: string, tabId = userId + "-t"): PresenceUser => ({
  tabId, userId, name, animalName: "Cat", color: "#fff", lastActive: 0,
});

describe("initialsFromName", () => {
  it("returns up to two uppercase initials", () => {
    expect(initialsFromName("Roberto Gauna")).toBe("RG");
    expect(initialsFromName("joss")).toBe("J");
  });
  it("falls back to ? when empty/undefined", () => {
    expect(initialsFromName(undefined)).toBe("?");
    expect(initialsFromName("   ")).toBe("?");
  });
});

describe("colorForUser", () => {
  it("is deterministic per userId", () => {
    expect(colorForUser("abc")).toBe(colorForUser("abc"));
  });
  it("returns an hsl() string", () => {
    expect(colorForUser("abc")).toMatch(/^hsl\(/);
  });
});

describe("dedupePresenceByUser", () => {
  it("keeps one entry per userId, preserving order", () => {
    const list = [u("a", "A"), u("b", "B"), u("a", "A", "a-t2")];
    expect(dedupePresenceByUser(list).map((x) => x.userId)).toEqual(["a", "b"]);
  });
});
