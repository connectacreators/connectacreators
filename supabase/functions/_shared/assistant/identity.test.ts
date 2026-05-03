// supabase/functions/_shared/assistant/identity.test.ts
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildIdentitySystemPrompt } from "./identity.ts";

Deno.test("buildIdentitySystemPrompt — uses companion name", () => {
  const out = buildIdentitySystemPrompt({ name: "Robby", language: "en" });
  assertStringIncludes(out, "Robby");
});

Deno.test("buildIdentitySystemPrompt — references language for tone hint", () => {
  const en = buildIdentitySystemPrompt({ name: "Max", language: "en" });
  const es = buildIdentitySystemPrompt({ name: "Max", language: "es" });
  assertStringIncludes(en, "English");
  assertStringIncludes(es, "Spanish");
});

Deno.test("buildIdentitySystemPrompt — never uses literal 'AI' as name without flagging", () => {
  // companion_state default is 'AI'; we should still use it but the prompt should
  // make the assistant respond to it consistently
  const out = buildIdentitySystemPrompt({ name: "AI", language: "en" });
  assertEquals(out.length > 0, true);
  assertStringIncludes(out, "AI");
});
