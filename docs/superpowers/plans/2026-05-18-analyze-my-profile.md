# Analyze My Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire a new `analyze_my_profile` tool into Robby that wraps the existing `analyze-audience-alignment` edge function, extends its output with hook patterns / format mix / cadence / outlier band, and renders the result as a structured `ProfileAnalysisEmbed` card in chat.

**Architecture:** Edge function gets two new request flags (`extended_dimensions`, `include_competitors`) and a richer Claude prompt; a new Robby tool wraps it; a new embed type lights up in the chat surfaces; competitor gating reuses the existing `propose_plan` / `confirm_plan` flow. No DB migration — the new fields land on the existing `client_strategies.audience_analysis` JSONB column.

**Tech Stack:** Deno (Supabase Edge Functions), React 18 + TypeScript + Vite, Supabase Postgres + JSONB, Claude Haiku 4.5 (claude-haiku-4-5-20251001), SSE streaming via `ReadableStream`.

**Spec:** [`docs/superpowers/specs/2026-05-18-analyze-my-profile-design.md`](../specs/2026-05-18-analyze-my-profile-design.md)

---

## Task 1: Define extended analysis types in shared module

A single shared file holds the TypeScript types for the extended payload so both the edge function and the FE embed agree on shape. Keeps the data contract honest.

**Files:**
- Create: `supabase/functions/_shared/profile-analysis-types.ts`
- Create: `supabase/functions/_shared/profile-analysis-types.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// supabase/functions/_shared/profile-analysis-types.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  EXTENDED_FIELD_KEYS,
  buildEmptyExtendedPayload,
} from "./profile-analysis-types.ts";

Deno.test("EXTENDED_FIELD_KEYS lists exactly the 5 new top-level keys", () => {
  assertEquals(EXTENDED_FIELD_KEYS.sort(), [
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd supabase/functions && deno test _shared/profile-analysis-types.test.ts --allow-env`
Expected: FAIL with "Module not found" or "cannot resolve ./profile-analysis-types.ts"

- [ ] **Step 3: Write the type module**

```ts
// supabase/functions/_shared/profile-analysis-types.ts
//
// Shared types for the extended profile-analysis payload. Used by both the
// analyze-audience-alignment edge function (which writes them) and the
// companion-chat tool (which forwards them to the FE embed).

export interface HookPattern {
  pattern: string;        // "question-led" | "story-led" | "number-led" | etc
  frequency: number;      // 0..1
  example?: string;       // short caption fragment
}

export interface CadenceStats {
  posts_per_week: number;
  last_post_at: string | null;  // ISO date
}

export interface OutlierBand {
  median: number;
  top: number;
  top_post_id: string | null;
}

export interface TopPostRef {
  id: string;
  thumbnail: string | null;
  views: number;
  outlier_ratio: number;
  hook: string;
}

export interface ComparisonSection {
  cadence_delta_pct: number;
  format_mix_delta: Record<string, number>;
  common_winning_hooks: string[];
  where_youre_winning: string;
  where_theyre_winning: string;
}

export interface ExtendedAnalysisPayload {
  hook_patterns: HookPattern[];
  format_mix: Record<string, number>;
  cadence: CadenceStats;
  outlier_band: OutlierBand;
  top_posts: TopPostRef[];
  comparison?: ComparisonSection;
}

export const EXTENDED_FIELD_KEYS = [
  "hook_patterns",
  "format_mix",
  "cadence",
  "outlier_band",
  "top_posts",
] as const;

export function buildEmptyExtendedPayload(): ExtendedAnalysisPayload {
  return {
    hook_patterns: [],
    format_mix: {},
    cadence: { posts_per_week: 0, last_post_at: null },
    outlier_band: { median: 0, top: 0, top_post_id: null },
    top_posts: [],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd supabase/functions && deno test _shared/profile-analysis-types.test.ts --allow-env`
Expected: PASS, 2/2 tests OK

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/profile-analysis-types.ts \
        supabase/functions/_shared/profile-analysis-types.test.ts
git commit -m "feat(profile-analysis): shared types for extended analysis payload"
```

---

## Task 2: Add Claude-output normalizer (defensive parser)

The edge function already has a brittle JSON-extraction fallback for the existing fields. The extended fields need the same defensive treatment. Extract this into a tested helper so a malformed Claude response can't crash the function.

**Files:**
- Create: `supabase/functions/_shared/profile-analysis-parser.ts`
- Create: `supabase/functions/_shared/profile-analysis-parser.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd supabase/functions && deno test _shared/profile-analysis-parser.test.ts --allow-env`
Expected: FAIL with "Module not found"

- [ ] **Step 3: Write the parser**

```ts
// supabase/functions/_shared/profile-analysis-parser.ts
//
// Defensive parser for the extended profile-analysis Claude output. Claude
// occasionally returns malformed JSON, missing fields, or wrong types — this
// module always returns a fully-shaped ExtendedAnalysisPayload so downstream
// code never has to guard against missing keys.

import {
  buildEmptyExtendedPayload,
  type ComparisonSection,
  type ExtendedAnalysisPayload,
  type HookPattern,
  type TopPostRef,
} from "./profile-analysis-types.ts";

function clamp01(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return Math.max(0, Math.min(1, v));
}

function asNumber(n: unknown, fallback = 0): number {
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

function asString(s: unknown, fallback: string | null = null): string | null {
  return typeof s === "string" && s.length > 0 ? s : fallback;
}

function parseHookPatterns(raw: unknown): HookPattern[] {
  if (!Array.isArray(raw)) return [];
  const out: HookPattern[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const pattern = asString(obj.pattern);
    if (!pattern) continue;
    out.push({
      pattern,
      frequency: clamp01(obj.frequency),
      example: typeof obj.example === "string" ? obj.example : undefined,
    });
  }
  return out;
}

function parseFormatMix(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof k !== "string" || k.length === 0) continue;
    out[k] = clamp01(v);
  }
  return out;
}

function parseTopPosts(raw: unknown): TopPostRef[] {
  if (!Array.isArray(raw)) return [];
  const out: TopPostRef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const id = asString(obj.id);
    if (!id) continue;
    out.push({
      id,
      thumbnail: asString(obj.thumbnail),
      views: asNumber(obj.views),
      outlier_ratio: asNumber(obj.outlier_ratio),
      hook: typeof obj.hook === "string" ? obj.hook : "",
    });
  }
  return out;
}

function parseComparison(raw: unknown): ComparisonSection | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  const formatMixDelta: Record<string, number> = {};
  if (obj.format_mix_delta && typeof obj.format_mix_delta === "object") {
    for (const [k, v] of Object.entries(obj.format_mix_delta as Record<string, unknown>)) {
      formatMixDelta[k] = asNumber(v);
    }
  }
  return {
    cadence_delta_pct: asNumber(obj.cadence_delta_pct),
    format_mix_delta: formatMixDelta,
    common_winning_hooks: Array.isArray(obj.common_winning_hooks)
      ? obj.common_winning_hooks.filter((s): s is string => typeof s === "string")
      : [],
    where_youre_winning: typeof obj.where_youre_winning === "string" ? obj.where_youre_winning : "",
    where_theyre_winning: typeof obj.where_theyre_winning === "string" ? obj.where_theyre_winning : "",
  };
}

export function parseExtendedAnalysis(raw: unknown): ExtendedAnalysisPayload {
  const base = buildEmptyExtendedPayload();
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;

  base.hook_patterns = parseHookPatterns(obj.hook_patterns);
  base.format_mix = parseFormatMix(obj.format_mix);

  if (obj.cadence && typeof obj.cadence === "object") {
    const c = obj.cadence as Record<string, unknown>;
    base.cadence = {
      posts_per_week: asNumber(c.posts_per_week),
      last_post_at: asString(c.last_post_at),
    };
  }

  if (obj.outlier_band && typeof obj.outlier_band === "object") {
    const o = obj.outlier_band as Record<string, unknown>;
    base.outlier_band = {
      median: asNumber(o.median),
      top: asNumber(o.top),
      top_post_id: asString(o.top_post_id),
    };
  }

  base.top_posts = parseTopPosts(obj.top_posts);

  const comparison = parseComparison(obj.comparison);
  if (comparison) base.comparison = comparison;

  return base;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd supabase/functions && deno test _shared/profile-analysis-parser.test.ts --allow-env`
Expected: PASS, 6/6 tests OK

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/profile-analysis-parser.ts \
        supabase/functions/_shared/profile-analysis-parser.test.ts
git commit -m "feat(profile-analysis): defensive parser for extended Claude output"
```

---

## Task 3: Extend `analyze-audience-alignment` edge function

Add the two new request flags, the extended Claude prompt section, and the new JSON fields on the persisted payload. Keep the existing fields untouched so Super Canvas's call path remains 100% backwards compatible.

**Files:**
- Modify: `supabase/functions/analyze-audience-alignment/index.ts:95-99` (request body schema)
- Modify: `supabase/functions/analyze-audience-alignment/index.ts:172-199` (Claude prompt)
- Modify: `supabase/functions/analyze-audience-alignment/index.ts:200-272` (response parsing + persistence)

- [ ] **Step 1: Add the new request fields**

Find:
```ts
    const { client_id, language } = await req.json() as { client_id: string; language?: string };
    if (!client_id) {
      return new Response(JSON.stringify({ error: "client_id required" }), { status: 400, headers: corsHeaders });
    }
    const lang = language === "es" ? "es" : "en";
```

Replace with:
```ts
    const {
      client_id,
      language,
      extended_dimensions = false,
      include_competitors = true,
    } = await req.json() as {
      client_id: string;
      language?: string;
      extended_dimensions?: boolean;
      include_competitors?: boolean;
    };
    if (!client_id) {
      return new Response(JSON.stringify({ error: "client_id required" }), { status: 400, headers: corsHeaders });
    }
    const lang = language === "es" ? "es" : "en";
```

- [ ] **Step 2: Gate competitor scrape on `include_competitors`**

Find:
```ts
    const [clientResult, ...emulationResults] = await Promise.all([
      scrapeProfile(instagramHandle, 10),
      ...emulationProfiles.map((handle) => scrapeProfile(handle, 10)),
    ]);
```

Replace with:
```ts
    const competitorsRequested = include_competitors && emulationProfiles.length > 0;
    const [clientResult, ...emulationResults] = await Promise.all([
      scrapeProfile(instagramHandle, 10),
      ...(competitorsRequested
        ? emulationProfiles.map((handle) => scrapeProfile(handle, 10))
        : []),
    ]);
```

- [ ] **Step 3: Import the parser and extend the prompt**

At the top of the file, alongside other imports, add:

```ts
import { parseExtendedAnalysis } from "../_shared/profile-analysis-parser.ts";
import type { ExtendedAnalysisPayload } from "../_shared/profile-analysis-types.ts";
```

Find the existing prompt assignment (`const prompt = \`...\``) and replace its JSON-shape instruction block. The OLD shape instruction ends with:

```
Respond ONLY with valid JSON, no markdown, no explanation outside the JSON:
{
  "audience_score": <integer 0-10>,
  "uniqueness_score": <integer 0-10>,
  "summary": "<...>",
  "audience_detail": "<...>",
  "uniqueness_detail": "<...>"
}`;
```

Replace the closing JSON block (everything from `Respond ONLY` through the final ``` ` ``` ) with:

```ts
Respond ONLY with valid JSON, no markdown, no explanation outside the JSON:
{
  "audience_score": <integer 0-10>,
  "uniqueness_score": <integer 0-10>,
  "summary": "<2-3 sentences on what these recent posts show about audience alignment and uniqueness. Be specific — name the patterns you see. No jargon.>${noEmulationProfiles ? " End with exactly this sentence: 'Add competitor or reference accounts in your onboarding profile to get a more precise benchmark for these scores.'" : ""}",
  "audience_detail": "<1 sentence on audience alignment — what specifically is or isn't connecting with ${targetAudience}>",
  "uniqueness_detail": "<1 sentence on what makes the content blend in or stand out>"${extended_dimensions ? `,
  "hook_patterns": [
    { "pattern": "<short slug like 'question-led', 'story-led', 'number-led', 'controversy'>", "frequency": <0..1>, "example": "<<=80 char caption fragment>" }
  ],
  "format_mix": { "reel": <0..1>, "carousel": <0..1>, "static": <0..1>, "video": <0..1> },
  "cadence": { "posts_per_week": <number>, "last_post_at": "<ISO date of most recent post in this sample>" },
  "outlier_band": { "median": <median views across the sample>, "top": <max views in sample>, "top_post_id": "<id of top post>" },
  "top_posts": [
    { "id": "<post id>", "thumbnail": "<thumbnail url if available else null>", "views": <number>, "outlier_ratio": <views / median>, "hook": "<<=100 char caption opening line>" }
  ]${competitorsRequested ? `,
  "comparison": {
    "cadence_delta_pct": <signed percent: client's posts/wk minus avg competitor posts/wk, expressed as percent of competitor avg. Negative = client posts less.>,
    "format_mix_delta": { "reel": <signed delta vs competitor avg>, "carousel": <signed delta>, ... },
    "common_winning_hooks": ["<hook patterns that appear in top competitor posts>"],
    "where_youre_winning": "<1 short sentence>",
    "where_theyre_winning": "<1 short sentence>"
  }` : ""}` : ""}
}`;
```

- [ ] **Step 4: Parse the extended fields and merge into the persisted payload**

Find:
```ts
    const analysisPayload = {
      audience_score: audienceScore,
      uniqueness_score: uniquenessScore,
      summary: analysis.summary || "",
      audience_detail: analysis.audience_detail || "",
      uniqueness_detail: analysis.uniqueness_detail || "",
      client_posts_analyzed: clientPosts.length,
      emulation_posts_analyzed: totalEmulationPosts,
      emulation_profiles: emulationProfiles,
      analyzed_at: new Date().toISOString(),
      language: lang,
      profilePicUrl: profilePicUrl || null,
      followers: followers || null,
    };
```

Replace with:
```ts
    const extended: ExtendedAnalysisPayload | null = extended_dimensions
      ? parseExtendedAnalysis(analysis as unknown)
      : null;

    const analysisPayload = {
      audience_score: audienceScore,
      uniqueness_score: uniquenessScore,
      summary: analysis.summary || "",
      audience_detail: analysis.audience_detail || "",
      uniqueness_detail: analysis.uniqueness_detail || "",
      client_posts_analyzed: clientPosts.length,
      emulation_posts_analyzed: totalEmulationPosts,
      emulation_profiles: emulationProfiles,
      analyzed_at: new Date().toISOString(),
      language: lang,
      profilePicUrl: profilePicUrl || null,
      followers: followers || null,
      ...(extended ? extended : {}),
      handle: instagramHandle,
      platform: "instagram" as const,
    };
```

- [ ] **Step 5: Widen Claude `analysis` typing + bump max_tokens**

Find:
```ts
    let analysis: {
      audience_score: number;
      uniqueness_score: number;
      summary: string;
      audience_detail: string;
      uniqueness_detail: string;
    };
```

Replace with:
```ts
    let analysis: {
      audience_score: number;
      uniqueness_score: number;
      summary: string;
      audience_detail: string;
      uniqueness_detail: string;
      // Extended fields — optional; parsed defensively by parseExtendedAnalysis.
      hook_patterns?: unknown;
      format_mix?: unknown;
      cadence?: unknown;
      outlier_band?: unknown;
      top_posts?: unknown;
      comparison?: unknown;
    };
```

Then find:
```ts
        max_tokens: 512,
```

Replace with:
```ts
        max_tokens: extended_dimensions ? 2048 : 512,
```

- [ ] **Step 6: Deploy the function to staging and smoke-test**

Deploy:
```bash
SUPABASE_ACCESS_TOKEN=$SUPABASE_ACCESS_TOKEN \
  npx supabase functions deploy analyze-audience-alignment \
  --project-ref hxojqrilwhhrvloiwmfo
```
Expected: `Deployed Function analyze-audience-alignment`

Then smoke-test with the existing call shape (no extended_dimensions). It MUST still work:
```bash
# Replace <CLIENT_ID> with a real client id that has an IG handle in onboarding
curl -s -X POST \
  "https://hxojqrilwhhrvloiwmfo.supabase.co/functions/v1/analyze-audience-alignment" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"client_id":"<CLIENT_ID>"}' | jq '.analysis | keys'
```
Expected: a JSON object containing at minimum `audience_score`, `uniqueness_score`, `summary`. No `hook_patterns` key (since `extended_dimensions` is false). Super Canvas's call path is unaffected.

- [ ] **Step 7: Smoke-test the extended shape**

```bash
curl -s -X POST \
  "https://hxojqrilwhhrvloiwmfo.supabase.co/functions/v1/analyze-audience-alignment" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"client_id":"<CLIENT_ID>","extended_dimensions":true,"include_competitors":false}' \
  | jq '.analysis | { audience_score, hook_patterns, format_mix, cadence, outlier_band }'
```
Expected: response contains `audience_score` AND `hook_patterns` (array), `format_mix` (object), `cadence`, `outlier_band`. `comparison` is absent because `include_competitors` was false.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/analyze-audience-alignment/index.ts
git commit -m "feat(analyze-audience-alignment): extended_dimensions + include_competitors flags"
```

---

## Task 4: Define cost constants in the tool handler

`deductCredits` takes a literal `cost: number` per call site — there is no central cost registry. Define the costs as constants in the new tool handler so they're discoverable.

**Files:**
- Modify: `supabase/functions/companion-chat/tools/profile-analysis.ts`

- [ ] **Step 1: Add the cost constants**

At the top of `profile-analysis.ts` (after the imports), add:

```ts
// Credit cost per call. Matches Super Canvas's existing competitor-analyze
// pattern (~30 credits per profile scrape + Claude analysis). Privileged
// roles (admin/editor/connecta_plus) skip deduction in deductCredits.
export const PROFILE_ANALYSIS_COST = 30;
export const PROFILE_ANALYSIS_COST_PER_COMPETITOR = 30;
```

The actual `deductCredits` call lives in the dispatch case (Task 7) — these constants exist so a future engineer can find them in one place.

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/companion-chat/tools/profile-analysis.ts
git commit -m "feat(profile-analysis): cost constants for analyze_my_profile"
```

---

## Task 5: Add scene hint for `analyze_my_profile`

The companion-chat SSE stream emits a scene event before each tool dispatch so the FE shows a live progress indicator. The new tool needs an entry in the hint map.

**Files:**
- Modify: `supabase/functions/_shared/tool-to-scene.ts`

- [ ] **Step 1: Add the hint**

Find the `TOOL_HINTS` record and add (in the "scanning" group, near `find_viral_videos`):

```ts
analyze_my_profile:    { scene: "video-analysis", verb: "Analyzing your profile",      meta: "fetch-profile-top-posts · top 10" },
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/_shared/tool-to-scene.ts
git commit -m "feat(tool-to-scene): video-analysis hint for analyze_my_profile"
```

---

## Task 6: Implement the `analyze_my_profile` tool handler

A focused module that owns: handle resolution, mismatch detection, invoking the edge function, returning the structured payload to Robby and an embed-emit signal.

**Files:**
- Create: `supabase/functions/companion-chat/tools/profile-analysis.ts`
- Create: `supabase/functions/companion-chat/tools/profile-analysis.test.ts`

- [ ] **Step 1: Write the failing test (pure helpers only)**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd supabase/functions && deno test companion-chat/tools/profile-analysis.test.ts --allow-env`
Expected: FAIL with "Module not found"

- [ ] **Step 3: Implement the handler module**

```ts
// supabase/functions/companion-chat/tools/profile-analysis.ts
//
// analyze_my_profile tool implementation. Owns:
//   1. handle resolution + mismatch detection
//   2. invoking the analyze-audience-alignment edge function with extended
//      flags
//   3. returning a structured tool_result payload to Robby AND a signal
//      that the SSE caller should emit a `profile-analysis` embed event

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

export function normalizeHandle(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/^@/, "").toLowerCase();
}

export function handlesMatch(a: unknown, b: unknown): boolean {
  const na = normalizeHandle(a);
  const nb = normalizeHandle(b);
  if (!na || !nb) return false;
  return na === nb;
}

export type HandleResolution =
  | { kind: "match"; handle: string }
  | { kind: "mismatch"; provided: string; onboarding: string }
  | { kind: "missing" };

export function resolveTargetHandle(args: {
  provided: string | null | undefined;
  onboarding: string | null | undefined;
}): HandleResolution {
  const provided = normalizeHandle(args.provided);
  const onboarding = normalizeHandle(args.onboarding);
  if (!provided && !onboarding) return { kind: "missing" };
  if (!provided && onboarding) return { kind: "match", handle: onboarding };
  if (provided && !onboarding) return { kind: "match", handle: provided };
  if (provided === onboarding) return { kind: "match", handle: provided };
  return { kind: "mismatch", provided, onboarding };
}

export interface AnalyzeMyProfileInput {
  client_id: string;
  client_name: string;
  handle?: string;
  platform: "instagram";
  include_competitors?: boolean;
}

export interface AnalyzeMyProfileResult {
  /** Text block the model receives back as the tool_result content. */
  tool_result_text: string;
  /** When set, the SSE caller should emit a profile-analysis embed event
   *  with this payload. Null when no analysis ran (mismatch, missing handle). */
  embed_payload: Record<string, unknown> | null;
}

export async function runAnalyzeMyProfile(args: {
  admin: SupabaseClient;
  authHeader: string;
  supabaseUrl: string;
  input: AnalyzeMyProfileInput;
  onboarding: Record<string, unknown>;
}): Promise<AnalyzeMyProfileResult> {
  const { admin, authHeader, supabaseUrl, input, onboarding } = args;

  const resolution = resolveTargetHandle({
    provided: input.handle,
    onboarding: typeof onboarding.instagram === "string" ? onboarding.instagram : null,
  });

  if (resolution.kind === "missing") {
    return {
      tool_result_text: `${input.client_name} has no Instagram handle on their onboarding profile, and you didn't pass one. Ask the user for the handle, or update onboarding.instagram, before retrying.`,
      embed_payload: null,
    };
  }

  if (resolution.kind === "mismatch") {
    return {
      tool_result_text: `handle_mismatch: provided @${resolution.provided}, onboarding has @${resolution.onboarding}. Ask the user: "That's not the IG handle on ${input.client_name}'s onboarding (@${resolution.onboarding}). Is @${resolution.provided} (a) a new account, (b) a typo, or (c) a competitor to analyze instead?" Do NOT call analyze_my_profile again until you have an answer.`,
      embed_payload: null,
    };
  }

  // resolution.kind === "match" — call the edge function
  const payload = {
    client_id: input.client_id,
    extended_dimensions: true,
    include_competitors: input.include_competitors === true,
  };

  const res = await fetch(`${supabaseUrl}/functions/v1/analyze-audience-alignment`, {
    method: "POST",
    headers: {
      "Authorization": authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    return {
      tool_result_text: `analyze-audience-alignment failed: ${res.status} ${errText.slice(0, 300)}. Surface to the user as a transient error — they can retry.`,
      embed_payload: null,
    };
  }

  const body = await res.json() as { success?: boolean; analysis?: Record<string, unknown> };
  const analysis = body.analysis ?? {};

  // Two-line summary the model uses to compose its prose framing.
  const summaryLines = [
    `Analyzed @${resolution.handle}. audience=${analysis.audience_score}/10, uniqueness=${analysis.uniqueness_score}/10.`,
    typeof analysis.summary === "string" ? analysis.summary : "",
  ].filter(Boolean).join(" ");

  return {
    tool_result_text: summaryLines + " A ProfileAnalysisEmbed card has been rendered for the user — your prose reply should be 2-3 sentences framing the result, not a full breakdown.",
    embed_payload: { ...analysis, handle: resolution.handle, platform: "instagram" },
  };
}
```

- [ ] **Step 4: Run test to verify pure helpers pass**

Run: `cd supabase/functions && deno test companion-chat/tools/profile-analysis.test.ts --allow-env`
Expected: PASS, 6/6 tests OK

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/companion-chat/tools/profile-analysis.ts \
        supabase/functions/companion-chat/tools/profile-analysis.test.ts
git commit -m "feat(companion-chat): analyze_my_profile tool handler"
```

---

## Task 7: Register `analyze_my_profile` tool schema in companion-chat

The schema entry tells Claude the tool exists. The dispatch case wires the handler into the tool-use loop.

**Files:**
- Modify: `supabase/functions/companion-chat/index.ts` (tool schema array — near line 84 `find_viral_videos`)
- Modify: `supabase/functions/companion-chat/index.ts` (tool dispatch — near line 1471 where `find_viral_videos` emits embeds)

- [ ] **Step 1: Add the tool schema**

Find the array of tool definitions (the one containing `name: "find_viral_videos"`). Add this entry right after `find_viral_videos`:

```ts
{
  name: "analyze_my_profile",
  description: "Pull the client's top 10 IG posts and run a deep analysis: audience fit, uniqueness, hook patterns, format mix, posting cadence, outlier band. Use when the user asks to analyze their profile, audit their account, or get IG strategy recommendations. If include_competitors=true, also pulls the emulation_profiles from onboarding and adds a comparison section. ALWAYS verify the handle matches onboarding_data.instagram first — if the user passes a different @handle, do NOT call this; ask them whether it's a new account, typo, or competitor.",
  input_schema: {
    type: "object",
    properties: {
      client_name: { type: "string", description: "Optional. Defaults to the locked client for this thread." },
      handle: { type: "string", description: "Optional. IG @handle to analyze. Defaults to onboarding_data.instagram." },
      platform: { type: "string", enum: ["instagram"], description: "v1 = instagram only" },
      include_competitors: { type: "boolean", description: "When true, also pulls the client's emulation_profiles and produces a `comparison` section. Default false. ONLY set true after the user has approved a propose_plan card for the comparison." },
    },
    required: ["platform"],
  },
},
```

- [ ] **Step 2: Import the handler at the top of index.ts**

Find the imports block at the top of `supabase/functions/companion-chat/index.ts`. Add:

```ts
import {
  runAnalyzeMyProfile,
  PROFILE_ANALYSIS_COST,
  PROFILE_ANALYSIS_COST_PER_COMPETITOR,
} from "./tools/profile-analysis.ts";
```

`deductCredits` is already imported in `index.ts` for other tools — check `grep -n "deductCredits" supabase/functions/companion-chat/index.ts`. If not, add `import { deductCredits } from "../_shared/credits.ts";`.

- [ ] **Step 3: Add the dispatch case (with credit deduction)**

Find the dispatch chain in the tool-use loop. The pattern looks like a series of `if (block.name === "find_viral_videos") { ... }`. After the `find_viral_videos` block (which ends with the `emit({ type: "embeds", ... })` call near line 1515), add:

```ts
        if (block.name === "analyze_my_profile") {
          const input = block.input as {
            client_name?: string;
            handle?: string;
            platform: "instagram";
            include_competitors?: boolean;
          };

          const targetClient = input.client_name
            ? await lookupClient(input.client_name)
            : lockedClient;

          if (!targetClient) {
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: "No client locked to this thread and no client_name given. Ask the user which client to analyze.",
            });
          } else {
            // Hydrate full onboarding_data for the resolved client
            const { data: fullClient } = await adminClient
              .from("clients")
              .select("id, name, onboarding_data")
              .eq("id", targetClient.id)
              .maybeSingle();

            const result = await runAnalyzeMyProfile({
              admin: adminClient,
              authHeader: req.headers.get("Authorization") || "",
              supabaseUrl: Deno.env.get("SUPABASE_URL") || "",
              input: {
                client_id: targetClient.id,
                client_name: targetClient.name || "this client",
                handle: input.handle,
                platform: input.platform,
                include_competitors: input.include_competitors === true,
              },
              onboarding: (fullClient?.onboarding_data as Record<string, unknown>) || {},
            });

            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: result.tool_result_text,
            });

            // Charge credits only when an analysis actually ran (embed_payload
            // present). Mismatch and missing-handle paths are free.
            if (result.embed_payload && user?.id) {
              const onboardingData = (fullClient?.onboarding_data as Record<string, unknown>) || {};
              const compCount = Array.isArray(onboardingData.top3Profiles)
                ? (onboardingData.top3Profiles as unknown[]).length
                : 0;
              const cost = input.include_competitors === true
                ? PROFILE_ANALYSIS_COST + (PROFILE_ANALYSIS_COST_PER_COMPETITOR * compCount)
                : PROFILE_ANALYSIS_COST;
              await deductCredits(adminClient, user.id, "analyze_my_profile", cost);

              emit({
                type: "embeds",
                embeds: [{
                  type: "profile-analysis" as const,
                  data: result.embed_payload,
                }],
              });
            }
          }
        }
```

Note: `adminClient`, `req`, `lockedClient`, `lookupClient`, `toolResults`, `emit`, and `block` are all in scope — they're already used by the `find_viral_videos` case above.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/companion-chat/index.ts
git commit -m "feat(companion-chat): wire analyze_my_profile tool dispatch + embed emit"
```

---

## Task 8: Add system-prompt rules for profile analysis

The model needs explicit instructions: handle-mismatch check, profile-only first call, propose_plan for competitors, no-handle case. Without these the model will mis-fire.

**Files:**
- Modify: `supabase/functions/companion-chat/index.ts` (system prompt — find the SCRIPT CREATION / NICHE/FORMAT rules near line 985-991)

- [ ] **Step 1: Locate the system prompt rules section**

```bash
grep -n "SCRIPT CREATION\|NICHE/FORMAT\|18-NICHE" supabase/functions/companion-chat/index.ts | head -5
```

The rules are numbered (e.g. `18.`, `19.`). Find the highest existing number — call it `N`.

- [ ] **Step 2: Append the new rules**

Add a new block AFTER the last existing numbered rule (use `N+1` where N is the current max):

```ts
${N+1}. PROFILE ANALYSIS: When the user asks to analyze their profile, audit their account, or get strategy recommendations:
  a. If the user's message contains an @handle, verify it matches the locked client's onboarding_data.instagram BEFORE calling any tool.
  b. If the handle does NOT match onboarding, ASK first — do not scrape: "That doesn't match the IG handle on {client}'s onboarding (@{onboarding_handle}). Is @{user_handle} (a) a new account for {client}, (b) a typo, or (c) a competitor you want analyzed instead?" Wait for the answer.
  c. Call analyze_my_profile WITHOUT include_competitors first. After the embed renders, write a 2-3 sentence prose framing (not a full breakdown — the embed already shows the data).
  d. If the client has emulation_profiles in onboarding, IMMEDIATELY call propose_plan with summary "Compare against {N} competitors from onboarding (~2 min)" and one step per competitor handle.
  e. On user approval (confirm_plan), call analyze_my_profile AGAIN with include_competitors=true. Render the second embed with the comparison section.
  f. NEVER call analyze_my_profile without a locked client. Ask which client first.
  g. NEVER call analyze_my_profile with platform other than "instagram" in v1 — if the user asks about TikTok/YouTube, explain we'll support those soon and offer to analyze IG instead.
```

Replace `${N+1}` with the actual number (e.g. `21.` if 20 was the last rule). Use a template literal or string concat — match the existing style.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/companion-chat/index.ts
git commit -m "feat(companion-chat): system prompt rules for analyze_my_profile"
```

---

## Task 9: Deploy the companion-chat edge function

Backend is complete. Deploy the function so the FE changes in subsequent tasks can talk to it.

- [ ] **Step 1: Deploy**

```bash
SUPABASE_ACCESS_TOKEN=$SUPABASE_ACCESS_TOKEN \
  npx supabase functions deploy companion-chat \
  --project-ref hxojqrilwhhrvloiwmfo
```

Expected output: `Deployed Function companion-chat`.

- [ ] **Step 2: Verify the tool registration via /ai**

Open /ai in the browser, locked to a real client with an IG handle in onboarding. Type: "analyze my profile". Observe:
- The thinking indicator shows "Analyzing your profile · fetch-profile-top-posts · top 10"
- The reply takes 30–60s
- An embed event arrives in the network tab (filter `companion-chat`) with `type: "embeds"` and an entry of `type: "profile-analysis"`

The embed will NOT render yet (no FE component). That's expected — verify the network payload only.

If the network call shows a `handle_mismatch` text response, that proves the handle-check path works. Move on.

---

## Task 10: Add `profile-analysis` to the `EmbedRef` union

The FE typesystem needs to know about the new embed kind before any component can render it.

**Files:**
- Modify: `src/lib/companion/turn-script.ts`

- [ ] **Step 1: Extend the `EmbedType` union**

Find:
```ts
export type EmbedType =
  | "video-card"
  | "video-player"
  | "metric-strip"
  | "framework-deck"
  | "channel-grid"
  | "script-card";
```

Replace with:
```ts
export type EmbedType =
  | "video-card"
  | "video-player"
  | "metric-strip"
  | "framework-deck"
  | "channel-grid"
  | "script-card"
  | "profile-analysis";
```

- [ ] **Step 2: Add the data interface**

After the `ScriptCardEmbedData` interface, add:

```ts
export interface HookPatternRef {
  pattern: string;
  frequency: number;
  example?: string;
}

export interface TopPostRef {
  id: string;
  thumbnail: string | null;
  views: number;
  outlier_ratio: number;
  hook: string;
}

export interface ComparisonRef {
  cadence_delta_pct: number;
  format_mix_delta: Record<string, number>;
  common_winning_hooks: string[];
  where_youre_winning: string;
  where_theyre_winning: string;
}

export interface ProfileAnalysisEmbedData {
  handle: string;
  platform: "instagram";
  profilePicUrl?: string | null;
  followers?: number | null;
  audience_score: number;
  uniqueness_score: number;
  summary: string;
  hook_patterns: HookPatternRef[];
  format_mix: Record<string, number>;
  cadence: { posts_per_week: number; last_post_at: string | null };
  outlier_band: { median: number; top: number; top_post_id?: string | null };
  top_posts: TopPostRef[];
  comparison?: ComparisonRef;
}
```

- [ ] **Step 3: Extend the `EmbedRef` discriminated union**

Find:
```ts
export type EmbedRef =
  | { type: "video-card"; data: VideoCardEmbedData }
  | { type: "video-player"; data: VideoPlayerEmbedData }
  | { type: "metric-strip"; data: MetricStripEmbedData }
  | { type: "framework-deck"; data: FrameworkDeckEmbedData }
  | { type: "channel-grid"; data: ChannelGridEmbedData }
  | { type: "script-card"; data: ScriptCardEmbedData };
```

Replace with:
```ts
export type EmbedRef =
  | { type: "video-card"; data: VideoCardEmbedData }
  | { type: "video-player"; data: VideoPlayerEmbedData }
  | { type: "metric-strip"; data: MetricStripEmbedData }
  | { type: "framework-deck"; data: FrameworkDeckEmbedData }
  | { type: "channel-grid"; data: ChannelGridEmbedData }
  | { type: "script-card"; data: ScriptCardEmbedData }
  | { type: "profile-analysis"; data: ProfileAnalysisEmbedData };
```

- [ ] **Step 4: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: zero output (clean).

- [ ] **Step 5: Commit**

```bash
git add src/lib/companion/turn-script.ts
git commit -m "feat(turn-script): profile-analysis embed type"
```

---

## Task 11: Build the `ProfileAnalysisEmbed` component

Editorial-style structured card: avatar/handle/followers/scores header, quick stats row, hook patterns list, top-3 posts grid, optional comparison section.

**Files:**
- Create: `src/components/companion/embeds/ProfileAnalysisEmbed.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/companion/embeds/ProfileAnalysisEmbed.tsx
//
// Structured embed for analyze_my_profile output. Renders inline in chat
// after Robby's 2-3 sentence prose framing. Honey/aqua accent colors per
// the existing video-card pattern.

import { useState } from "react";
import type { ProfileAnalysisEmbedData } from "@/lib/companion/turn-script";
import { ViralVideoPlayer } from "@/components/video/ViralVideoPlayer";

interface Props {
  data: ProfileAnalysisEmbedData;
}

function fmtCount(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function fmtPct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function fmtSignedPct(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${Math.round(n)}%`;
}

function fmtSignedRatio(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${Math.round(n * 100)}pp`;
}

export default function ProfileAnalysisEmbed({ data }: Props) {
  const [playingTopIdx, setPlayingTopIdx] = useState<number | null>(null);
  const cadenceFmt = data.cadence.posts_per_week.toFixed(1);
  const outlierTop = data.outlier_band.median > 0
    ? (data.outlier_band.top / data.outlier_band.median).toFixed(1)
    : "—";

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(234,230,220,0.10)",
        padding: 14,
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        {data.profilePicUrl ? (
          <img
            src={data.profilePicUrl}
            alt=""
            className="w-10 h-10 rounded-full object-cover flex-shrink-0"
            style={{ border: "1px solid rgba(234,230,220,0.15)" }}
          />
        ) : (
          <div
            className="w-10 h-10 rounded-full flex-shrink-0"
            style={{
              background: "linear-gradient(135deg, #4a3a30 0%, #2a1808 100%)",
              border: "1px solid rgba(234,230,220,0.15)",
            }}
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold" style={{ color: "rgba(234,230,220,0.95)" }}>
            @{data.handle}
          </div>
          <div className="text-[10px]" style={{ color: "rgba(234,230,220,0.55)" }}>
            {fmtCount(data.followers)} followers · {data.platform}
          </div>
        </div>
        <div className="flex gap-1.5 flex-shrink-0">
          <span
            className="text-[10px] px-2 py-1 rounded font-jetbrains"
            style={{
              background: "rgba(143,208,213,0.12)",
              color: "rgba(143,208,213,0.95)",
              border: "1px solid rgba(143,208,213,0.20)",
            }}
          >
            audience {data.audience_score}/10
          </span>
          <span
            className="text-[10px] px-2 py-1 rounded font-jetbrains"
            style={{
              background: "rgba(224,165,96,0.12)",
              color: "rgba(224,165,96,0.95)",
              border: "1px solid rgba(224,165,96,0.20)",
            }}
          >
            unique {data.uniqueness_score}/10
          </span>
        </div>
      </div>

      {/* Quick stats row */}
      <div
        className="flex gap-3 text-[11px] mb-3 pb-3 font-jetbrains"
        style={{
          color: "rgba(234,230,220,0.70)",
          borderBottom: "1px solid rgba(234,230,220,0.08)",
        }}
      >
        <span><span style={{ color: "#E0A560" }}>{cadenceFmt}</span> posts/wk</span>
        <span>·</span>
        <span>
          {Object.entries(data.format_mix)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 2)
            .map(([k, v]) => `${fmtPct(v)} ${k}`)
            .join(" / ")}
        </span>
        <span>·</span>
        <span><span style={{ color: "#E0A560" }}>{outlierTop}×</span> outlier top</span>
      </div>

      {/* Hook patterns */}
      {data.hook_patterns.length > 0 && (
        <div className="mb-3">
          <div
            className="text-[9px] font-semibold uppercase tracking-wider mb-1.5"
            style={{ color: "rgba(143,208,213,0.90)" }}
          >
            Hook patterns
          </div>
          <div className="space-y-1">
            {data.hook_patterns.slice(0, 4).map((hp, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px] leading-snug">
                <span style={{ color: "rgba(224,165,96,0.95)", minWidth: 32, fontVariantNumeric: "tabular-nums" }}>
                  {fmtPct(hp.frequency)}
                </span>
                <span style={{ color: "rgba(234,230,220,0.85)" }}>
                  <span style={{ fontWeight: 600 }}>{hp.pattern}</span>
                  {hp.example && (
                    <span style={{ color: "rgba(234,230,220,0.55)" }}> — "{hp.example}"</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top posts */}
      {data.top_posts.length > 0 && (
        <div className="mb-3">
          <div
            className="text-[9px] font-semibold uppercase tracking-wider mb-1.5"
            style={{ color: "rgba(143,208,213,0.90)" }}
          >
            Top {Math.min(3, data.top_posts.length)} posts
          </div>
          <div className="flex gap-2">
            {data.top_posts.slice(0, 3).map((p, i) => (
              <div
                key={p.id}
                className="relative flex-1"
                style={{
                  aspectRatio: "9 / 16",
                  background: "#1a1410",
                  borderRadius: 6,
                  overflow: "hidden",
                  cursor: "pointer",
                }}
                onClick={() => setPlayingTopIdx(playingTopIdx === i ? null : i)}
              >
                {playingTopIdx === i ? (
                  <ViralVideoPlayer
                    src={null}
                    fallbackProxyUrl={p.thumbnail
                      ? `https://connectacreators.com/api/stream-reel?url=${encodeURIComponent(p.thumbnail)}&nocache=1`
                      : null}
                    aspectRatio="9:16"
                    compact
                  />
                ) : (
                  <>
                    {p.thumbnail ? (
                      <img
                        src={p.thumbnail}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    ) : (
                      <div
                        className="absolute inset-0"
                        style={{ background: "linear-gradient(135deg, #4a3a30 0%, #2a1808 100%)" }}
                      />
                    )}
                    <div
                      className="absolute top-1 right-1 px-1.5 py-0.5 rounded text-[9px] font-bold"
                      style={{ background: "rgba(0,0,0,0.75)", color: "#E0A560" }}
                    >
                      {p.outlier_ratio.toFixed(1)}×
                    </div>
                    <div
                      className="absolute bottom-1 left-1 right-1 text-[8px] truncate font-jetbrains"
                      style={{ color: "rgba(234,230,220,0.90)" }}
                    >
                      {fmtCount(p.views)} views
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Comparison section — only when present */}
      {data.comparison && (
        <div
          className="mt-3 pt-3"
          style={{ borderTop: "1px solid rgba(234,230,220,0.10)" }}
        >
          <div
            className="text-[9px] font-semibold uppercase tracking-wider mb-1.5"
            style={{ color: "rgba(143,208,213,0.90)" }}
          >
            vs competitors
          </div>
          <div className="space-y-1.5 text-[11px] leading-snug">
            <div style={{ color: "rgba(234,230,220,0.85)" }}>
              <span style={{ fontWeight: 600 }}>Cadence:</span>{" "}
              <span style={{ color: data.comparison.cadence_delta_pct < 0 ? "#E0A560" : "#8FD0D5", fontWeight: 600 }}>
                {fmtSignedPct(data.comparison.cadence_delta_pct)}
              </span>
              <span style={{ color: "rgba(234,230,220,0.55)" }}> vs competitor avg</span>
            </div>
            {Object.keys(data.comparison.format_mix_delta).length > 0 && (
              <div style={{ color: "rgba(234,230,220,0.85)" }}>
                <span style={{ fontWeight: 600 }}>Format gap:</span>{" "}
                <span style={{ color: "rgba(234,230,220,0.70)" }}>
                  {Object.entries(data.comparison.format_mix_delta)
                    .filter(([, v]) => Math.abs(v) >= 0.05)
                    .map(([k, v]) => `${k} ${fmtSignedRatio(v)}`)
                    .join(", ") || "even"}
                </span>
              </div>
            )}
            {data.comparison.common_winning_hooks.length > 0 && (
              <div style={{ color: "rgba(234,230,220,0.85)" }}>
                <span style={{ fontWeight: 600 }}>Their winning hooks:</span>{" "}
                <span style={{ color: "rgba(234,230,220,0.70)" }}>
                  {data.comparison.common_winning_hooks.slice(0, 3).join(", ")}
                </span>
              </div>
            )}
            {data.comparison.where_youre_winning && (
              <div style={{ color: "rgba(234,230,220,0.70)" }}>
                <span style={{ color: "#8FD0D5", fontWeight: 600 }}>You win:</span>{" "}
                {data.comparison.where_youre_winning}
              </div>
            )}
            {data.comparison.where_theyre_winning && (
              <div style={{ color: "rgba(234,230,220,0.70)" }}>
                <span style={{ color: "#E0A560", fontWeight: 600 }}>They win:</span>{" "}
                {data.comparison.where_theyre_winning}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: zero output (clean).

- [ ] **Step 3: Commit**

```bash
git add src/components/companion/embeds/ProfileAnalysisEmbed.tsx
git commit -m "feat(embeds): ProfileAnalysisEmbed card component"
```

---

## Task 12: Register `profile-analysis` in `TurnRenderer`

The drawer/canvas turn renderer iterates `EmbedRef` and dispatches to a component per type. Add the case.

**Files:**
- Modify: `src/components/companion/TurnRenderer.tsx`

- [ ] **Step 1: Add the import**

Find the imports block (the existing embed imports `VideoCardEmbed`, `MetricStripEmbed`, etc.). Add:

```tsx
import ProfileAnalysisEmbed from "./embeds/ProfileAnalysisEmbed";
```

- [ ] **Step 2: Add the case in `renderEmbed`**

Find:
```tsx
function renderEmbed(e: EmbedRef, onClick?: (e: EmbedRef) => void) {
  switch (e.type) {
    case "video-card":      return <VideoCardEmbed data={e.data} onClick={() => onClick?.(e)} />;
    case "video-player":    return <VideoPlayerEmbed data={e.data} />;
    case "metric-strip":    return <MetricStripEmbed data={e.data} />;
    case "framework-deck":  return <FrameworkDeckEmbed data={e.data} />;
    case "channel-grid":    return <ChannelGridEmbed data={e.data} />;
    case "script-card":     return <ScriptCardEmbed data={e.data} />;
  }
}
```

Replace with:
```tsx
function renderEmbed(e: EmbedRef, onClick?: (e: EmbedRef) => void) {
  switch (e.type) {
    case "video-card":       return <VideoCardEmbed data={e.data} onClick={() => onClick?.(e)} />;
    case "video-player":     return <VideoPlayerEmbed data={e.data} />;
    case "metric-strip":     return <MetricStripEmbed data={e.data} />;
    case "framework-deck":   return <FrameworkDeckEmbed data={e.data} />;
    case "channel-grid":     return <ChannelGridEmbed data={e.data} />;
    case "script-card":      return <ScriptCardEmbed data={e.data} />;
    case "profile-analysis": return <ProfileAnalysisEmbed data={e.data} />;
  }
}
```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: zero output. (If TS complains about `e.data` typing in the switch, the discriminated union from Task 10 should narrow it — re-check Task 10 was committed.)

- [ ] **Step 4: Commit**

```bash
git add src/components/companion/TurnRenderer.tsx
git commit -m "feat(turn-renderer): register profile-analysis embed"
```

---

## Task 13: Register `profile-analysis` in `AssistantChat`

`AssistantChat` has a parallel `renderEmbed` switch (the one we just added in the italic-text fix). Add the same case there.

**Files:**
- Modify: `src/components/assistant/AssistantChat.tsx`

- [ ] **Step 1: Add the import**

Find the existing embed imports (`VideoCardEmbed`, `VideoPlayerEmbed`, etc.). Add:

```tsx
import ProfileAnalysisEmbed from "@/components/companion/embeds/ProfileAnalysisEmbed";
```

- [ ] **Step 2: Add the case in `renderEmbed`**

Find:
```tsx
function renderEmbed(e: EmbedRef) {
  switch (e.type) {
    case "video-card":     return <VideoCardEmbed data={e.data} />;
    case "video-player":   return <VideoPlayerEmbed data={e.data} />;
    case "metric-strip":   return <MetricStripEmbed data={e.data} />;
    case "framework-deck": return <FrameworkDeckEmbed data={e.data} />;
    case "channel-grid":   return <ChannelGridEmbed data={e.data} />;
    case "script-card":    return <ScriptCardEmbed data={e.data} />;
  }
}
```

Replace with:
```tsx
function renderEmbed(e: EmbedRef) {
  switch (e.type) {
    case "video-card":       return <VideoCardEmbed data={e.data} />;
    case "video-player":     return <VideoPlayerEmbed data={e.data} />;
    case "metric-strip":     return <MetricStripEmbed data={e.data} />;
    case "framework-deck":   return <FrameworkDeckEmbed data={e.data} />;
    case "channel-grid":     return <ChannelGridEmbed data={e.data} />;
    case "script-card":      return <ScriptCardEmbed data={e.data} />;
    case "profile-analysis": return <ProfileAnalysisEmbed data={e.data} />;
  }
}
```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: zero output.

- [ ] **Step 4: Commit**

```bash
git add src/components/assistant/AssistantChat.tsx
git commit -m "feat(assistant-chat): register profile-analysis embed"
```

---

## Task 14: Wire `profile-analysis` embed handling in SSE consumer

The SSE consumer routes embed events to per-thread pending-embed buckets. Both `CompanionDrawer` and `CommandCenter` filter on `embed.type` in places — verify nothing in those paths drops unknown types.

**Files:**
- Read: `src/lib/companion/stream-companion-chat.ts` (verify it passes-through unknown embed types)
- Read: `src/components/CompanionDrawer.tsx` (verify embed accumulation isn't type-gated)
- Read: `src/pages/CommandCenter.tsx` (same)

- [ ] **Step 1: Verify the SSE consumer doesn't filter embed types**

```bash
grep -nE "embed\.type|embeds\.filter" src/lib/companion/stream-companion-chat.ts src/components/CompanionDrawer.tsx src/pages/CommandCenter.tsx
```

If any of these filter `embed.type === "video-card"` (or any whitelist), the new `profile-analysis` embed will be silently dropped. Find each such filter and broaden it.

If no whitelist is found, this task is a no-op — `EmbedRef` is just stored as-is in the pending bucket and routed through `renderEmbed`. Skip the remaining steps.

- [ ] **Step 2 (only if whitelists found): Broaden them**

For each location, change `e.type === "video-card"` to accept the full union. Since pending embeds are typed `EmbedRef[]`, the safest change is to remove the filter entirely.

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: zero output.

- [ ] **Step 4: Commit (skip if Step 1 was a no-op)**

```bash
git add src/lib/companion/stream-companion-chat.ts src/components/CompanionDrawer.tsx src/pages/CommandCenter.tsx
git commit -m "fix(sse-consumer): accept profile-analysis embed type"
```

---

## Task 15: End-to-end smoke test

Run the full happy path in the live app. Verify each branch (handle match, handle mismatch, propose_plan competitor confirm).

- [ ] **Step 1: Push FE changes to main (auto-deploys via CI)**

```bash
git push origin HEAD:main
```

Wait ~2 min for the GitHub Actions deploy to complete. Verify the latest commit is live by hard-refreshing connectacreators.com.

- [ ] **Step 2: Smoke 1 — handle match**

Open /ai. Lock to a client that has IG handle "@foo" in onboarding (use any real client). Type:

> "Analyze my profile @foo and tell me my IG strategy"

Expected (in order):
- Scanning indicator: "Analyzing your profile · fetch-profile-top-posts · top 10"
- ~30-60s wait
- Robby reply: 2-3 sentence prose framing
- A `ProfileAnalysisEmbed` card rendered BELOW the prose with scores, hook patterns, top-3 posts
- If onboarding has emulation_profiles: a separate Plan card with Approve / Reject

- [ ] **Step 3: Smoke 2 — handle mismatch**

Same client (onboarding @foo). Type:

> "Analyze @some_other_handle"

Expected:
- NO scrape happens (no scanning indicator beyond brief thinking)
- Robby asks the 3-option mismatch question
- Reply takes <5s (no VPS call burned on a typo)

- [ ] **Step 4: Smoke 3 — competitor approval flow**

From the result of Smoke 1, click "Approve" on the propose_plan card. Expected:
- Scanning indicator runs longer (~2 min)
- A SECOND `ProfileAnalysisEmbed` renders with the `comparison` section populated
- The persisted `client_strategies.audience_analysis` row contains both passes' fields (verify in Supabase Studio)

- [ ] **Step 5: Smoke 4 — no IG handle in onboarding**

Lock to a client whose onboarding has empty `instagram`. Type "analyze my profile".

Expected: Robby replies "{client} has no IG handle on their onboarding profile. Add it first." No scrape, no credit charge.

- [ ] **Step 6: Verify credits deducted**

For a non-privileged user, after a successful match-flow run, check the `credits_ledger` (or equivalent table) for a row with `action = "analyze_my_profile"` and the configured cost.

- [ ] **Step 7: Commit any small fixes uncovered during smoke testing**

If smoke turns up issues, fix them, recommit, re-deploy. Don't move on until all four smoke flows pass.

---

## Task 16: Final cleanup pass

- [ ] **Step 1: Remove any debug logs added during smoke testing**

```bash
git diff main..HEAD -- supabase/functions/ src/ | grep -E "console\.(log|debug)" | head -20
```

Remove or downgrade noisy logs.

- [ ] **Step 2: Verify the spec coverage**

Re-read [docs/superpowers/specs/2026-05-18-analyze-my-profile-design.md](../specs/2026-05-18-analyze-my-profile-design.md):
- ☐ `analyze_my_profile` tool exists and is dispatched (Tasks 6-7)
- ☐ `extended_dimensions` + `include_competitors` flags work (Task 3)
- ☐ Structured embed renders (Tasks 11-13)
- ☐ Persistence onto `client_strategies.audience_analysis` (Task 3)
- ☐ Competitor confirm gated through `propose_plan` (Task 8, behavioral — model-driven)
- ☐ Handle mismatch asks before scraping (Tasks 6, 8)
- ☐ Credit cost charged (Task 4)
- ☐ Scene hint (Task 5)
- ☐ Smoke test passes (Task 15)

- [ ] **Step 3: Final commit if anything changed**

```bash
git add -A
git commit -m "chore(profile-analysis): final cleanup after smoke testing" || true
git push origin HEAD:main
```

---

## Out of scope (deferred to v2)

- TikTok / YouTube platform support (`platform` enum extension on the tool schema and on `ProfileAnalysisEmbedData`)
- Versioned history (new `profile_analyses` table keyed by `(client_id, analyzed_at)`)
- Auto-update `onboarding_data.instagram` on confirmed mismatch
- Unifying this flow with Super Canvas's `CompetitorProfileNode`
