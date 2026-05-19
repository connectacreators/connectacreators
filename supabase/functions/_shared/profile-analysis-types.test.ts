// supabase/functions/_shared/profile-analysis-types.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  EXTENDED_FIELD_KEYS,
  buildEmptyExtendedPayload,
} from "./profile-analysis-types.ts";

Deno.test("EXTENDED_FIELD_KEYS lists exactly the 5 new top-level keys", () => {
  assertEquals([...EXTENDED_FIELD_KEYS].sort(), [
    "cadence",
    "format_mix",
    "hook_patterns",
    "outlier_band",
    "top_posts",
  ]);
});

Deno.test("buildEmptyExtendedPayload returns safe defaults", () => {
  const p = buildEmptyExtendedPayload();
  assertEquals(p.hook_patterns, []);
  assertEquals(p.format_mix, {});
  assertEquals(p.cadence.posts_per_week, 0);
  assertEquals(p.cadence.last_post_at, null);
  assertEquals(p.outlier_band.median, 0);
  assertEquals(p.outlier_band.top, 0);
  assertEquals(p.outlier_band.top_post_id, null);
  assertEquals(p.top_posts, []);
});
