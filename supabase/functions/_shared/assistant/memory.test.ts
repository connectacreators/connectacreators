// supabase/functions/_shared/assistant/memory.test.ts
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { formatMemoriesForPrompt } from "./memory.ts";
import type { AssistantMemory } from "./types.ts";

Deno.test("formatMemoriesForPrompt — empty list returns empty string", () => {
  assertEquals(formatMemoriesForPrompt([]), "");
});

Deno.test("formatMemoriesForPrompt — groups user vs client memories", () => {
  const mems: AssistantMemory[] = [
    { scope: "user", key: "tone", value: "concise" },
    { scope: "client", clientId: "c1", key: "schedule", value: "Tue/Thu 6pm" },
    { scope: "client", clientId: "c1", key: "voice", value: "direct, Spanish-first" },
  ];
  const out = formatMemoriesForPrompt(mems);
  assertStringIncludes(out, "About the user");
  assertStringIncludes(out, "concise");
  assertStringIncludes(out, "About the active client");
  assertStringIncludes(out, "Tue/Thu 6pm");
  assertStringIncludes(out, "direct, Spanish-first");
});

Deno.test("formatMemoriesForPrompt — only user memories renders single section", () => {
  const out = formatMemoriesForPrompt([{ scope: "user", key: "tone", value: "concise" }]);
  assertStringIncludes(out, "About the user");
  assertEquals(out.includes("About the active client"), false);
});
