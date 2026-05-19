// supabase/functions/_shared/profile-analysis-parser.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseExtendedAnalysis } from "./profile-analysis-parser.ts";

Deno.test("parseExtendedAnalysis returns defaults on empty input", () => {
  const p = parseExtendedAnalysis({});
  assertEquals(p.hook_patterns, []);
  assertEquals(p.format_mix, {});
  assertEquals(p.cadence.posts_per_week, 0);
});

Deno.test("parseExtendedAnalysis preserves valid fields", () => {
  const input = {
    hook_patterns: [{ pattern: "story-led", frequency: 0.6, example: "Last week..." }],
    format_mix: { reel: 0.2, carousel: 0.8 },
    cadence: { posts_per_week: 2.3, last_post_at: "2026-05-15" },
    outlier_band: { median: 12000, top: 50000, top_post_id: "abc" },
    top_posts: [],
  };
  const p = parseExtendedAnalysis(input);
  assertEquals(p.hook_patterns[0].pattern, "story-led");
  assertEquals(p.format_mix.carousel, 0.8);
  assertEquals(p.cadence.posts_per_week, 2.3);
  assertEquals(p.outlier_band.top, 50000);
});

Deno.test("parseExtendedAnalysis clamps frequency to 0..1", () => {
  const input = { hook_patterns: [{ pattern: "x", frequency: 1.7 }] };
  const p = parseExtendedAnalysis(input);
  assertEquals(p.hook_patterns[0].frequency, 1);
});

Deno.test("parseExtendedAnalysis drops malformed hook_patterns entries", () => {
  const input = {
    hook_patterns: [
      { pattern: "good", frequency: 0.5 },
      "not-an-object",
      { frequency: 0.3 },  // missing pattern
      null,
    ],
  };
  const p = parseExtendedAnalysis(input);
  assertEquals(p.hook_patterns.length, 1);
  assertEquals(p.hook_patterns[0].pattern, "good");
});

Deno.test("parseExtendedAnalysis preserves comparison when present", () => {
  const input = {
    comparison: {
      cadence_delta_pct: -45,
      format_mix_delta: { reel: 0.5 },
      common_winning_hooks: ["number-led"],
      where_youre_winning: "deeper niche knowledge",
      where_theyre_winning: "more reels per week",
    },
  };
  const p = parseExtendedAnalysis(input);
  assertEquals(p.comparison?.cadence_delta_pct, -45);
  assertEquals(p.comparison?.common_winning_hooks, ["number-led"]);
});

Deno.test("parseExtendedAnalysis omits comparison when absent", () => {
  const p = parseExtendedAnalysis({});
  assertEquals(p.comparison, undefined);
});
