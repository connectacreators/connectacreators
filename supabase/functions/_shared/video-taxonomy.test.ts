// supabase/functions/_shared/video-taxonomy.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  CONTENT_FORMATS,
  CANONICAL_NICHES,
  isValidContentFormat,
  normalizeNicheSlug,
  nicheLabel,
} from "./video-taxonomy.ts";

Deno.test("CONTENT_FORMATS has 11 entries", () => {
  assertEquals(CONTENT_FORMATS.length, 11);
});

Deno.test("CONTENT_FORMATS includes all 11 canonical slugs", () => {
  const slugs = CONTENT_FORMATS.map((f) => f.slug).sort();
  assertEquals(slugs, [
    "authority", "caption_post", "comparison", "educational", "funny",
    "listicle", "reaction", "selling", "storytelling", "tutorial", "vlog",
  ]);
});

Deno.test("CANONICAL_NICHES has 15 entries", () => {
  assertEquals(CANONICAL_NICHES.length, 15);
});

Deno.test("isValidContentFormat — accepts all 11", () => {
  for (const f of CONTENT_FORMATS) {
    assertEquals(isValidContentFormat(f.slug), true);
  }
});

Deno.test("isValidContentFormat — rejects invalid slugs", () => {
  assertEquals(isValidContentFormat("other"), false);
  assertEquals(isValidContentFormat("Educational"), false);  // wrong case
  assertEquals(isValidContentFormat(""), false);
  assertEquals(isValidContentFormat(null as unknown as string), false);
});

Deno.test("normalizeNicheSlug — lowercases", () => {
  assertEquals(normalizeNicheSlug("Religion"), "religion");
});

Deno.test("normalizeNicheSlug — replaces whitespace with underscores", () => {
  assertEquals(normalizeNicheSlug("True Crime"), "true_crime");
  assertEquals(normalizeNicheSlug("  Hot   Yoga  "), "hot_yoga");
});

Deno.test("normalizeNicheSlug — strips non-alphanumeric except underscores", () => {
  assertEquals(normalizeNicheSlug("personal-branding!"), "personalbranding");
  assertEquals(normalizeNicheSlug("rock&roll"), "rockroll");
});

Deno.test("normalizeNicheSlug — caps length at 50", () => {
  const long = "x".repeat(80);
  assertEquals(normalizeNicheSlug(long).length, 50);
});

Deno.test("normalizeNicheSlug — empty input returns empty string", () => {
  assertEquals(normalizeNicheSlug(""), "");
  assertEquals(normalizeNicheSlug("   "), "");
});

Deno.test("nicheLabel — title-cases snake_case slugs", () => {
  assertEquals(nicheLabel("personal_branding"), "Personal Branding");
  assertEquals(nicheLabel("religion"), "Religion");
  assertEquals(nicheLabel("saas_tech"), "Saas Tech");
});
