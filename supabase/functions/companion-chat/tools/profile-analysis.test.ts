// supabase/functions/companion-chat/tools/profile-analysis.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  normalizeHandle,
  handlesMatch,
  resolveTargetHandle,
} from "./profile-analysis.ts";

Deno.test("normalizeHandle strips @ and lowercases", () => {
  assertEquals(normalizeHandle("@ByRobertoGauna"), "byrobertogauna");
  assertEquals(normalizeHandle("byrobertogauna"), "byrobertogauna");
  assertEquals(normalizeHandle("  @Foo  "), "foo");
  assertEquals(normalizeHandle(""), "");
  assertEquals(normalizeHandle(null), "");
  assertEquals(normalizeHandle(undefined), "");
});

Deno.test("handlesMatch is case- and @-insensitive", () => {
  assertEquals(handlesMatch("@ByRobertoGauna", "byrobertogauna"), true);
  assertEquals(handlesMatch("byrobertogauna", "@ByRobertoGauna"), true);
  assertEquals(handlesMatch("byrobertogauna", "someoneelse"), false);
  assertEquals(handlesMatch("", "byrobertogauna"), false);
  assertEquals(handlesMatch(null, null), false);
});

Deno.test("resolveTargetHandle uses provided handle when present", () => {
  const r = resolveTargetHandle({ provided: "@foo", onboarding: "@bar" });
  assertEquals(r.kind, "mismatch");
  if (r.kind === "mismatch") {
    assertEquals(r.provided, "foo");
    assertEquals(r.onboarding, "bar");
  }
});

Deno.test("resolveTargetHandle returns match when provided equals onboarding", () => {
  const r = resolveTargetHandle({ provided: "@foo", onboarding: "foo" });
  assertEquals(r.kind, "match");
  if (r.kind === "match") assertEquals(r.handle, "foo");
});

Deno.test("resolveTargetHandle falls back to onboarding when none provided", () => {
  const r = resolveTargetHandle({ provided: null, onboarding: "@foo" });
  assertEquals(r.kind, "match");
  if (r.kind === "match") assertEquals(r.handle, "foo");
});

Deno.test("resolveTargetHandle returns missing when neither present", () => {
  const r = resolveTargetHandle({ provided: null, onboarding: null });
  assertEquals(r.kind, "missing");
});
