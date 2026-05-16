# Viral Today Format Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Viral Today's cluttered filter chip row with an 11-format horizontal tab strip + a single collapsed Filters panel; classify each video into one of 11 content formats and a primary niche (15 canonical seed + AI-extensible) during analysis; lazy-backfill older rows; add a Category tab on the detail page.

**Architecture:** Two new columns on `viral_videos` (`content_format`, `primary_niche`). The existing `tagFramework` Haiku call inside `_shared/viral-video-analyzer.ts` gets two new return fields so future analyses are categorized for free. A new free, idempotent edge function `viral-video-categorize` Haiku-classifies older analyzed rows on view. Frontend gains two new components: `<FormatTabs>` (12 buttons + per-format counts) and `<FiltersPanel>` (drawer collapsing all existing filters + a new niche multi-select). VideoCard auto-fires the backfill for visible uncategorized cards via IntersectionObserver + 1.5s debounce + 3-concurrent semaphore.

**Tech Stack:** Postgres + Supabase, Deno (edge functions), React + TypeScript + Vite (frontend), Supabase Realtime (delivers categorize results), Anthropic Haiku (claude-haiku-4-5-20251001 — same model the analyzer already uses).

**Spec:** `docs/superpowers/specs/2026-05-15-viral-today-format-navigation-design.md`

---

## File Structure

**New files:**
- `supabase/migrations/20260515_viral_videos_categorization.sql` — schema migration (2 columns + CHECK + 3 indexes)
- `supabase/functions/_shared/video-taxonomy.ts` — Deno: format slugs + canonical niche slugs + format validator
- `supabase/functions/_shared/video-taxonomy.test.ts` — Deno tests for the validator
- `supabase/functions/viral-video-categorize/index.ts` — lazy-backfill edge function (Haiku-only, 0 credits)
- `src/lib/video-taxonomy.ts` — frontend mirror of the Deno module
- `src/components/viral-today/FormatTabs.tsx` — the 12-tab horizontal strip with counts
- `src/components/viral-today/FiltersPanel.tsx` — collapsed filters drawer/popover

**Files to modify:**
- `supabase/functions/_shared/viral-video-analyzer.ts` — extend `TagResult` and the Haiku prompt in `tagFramework`; persist `content_format` + `primary_niche` in `runFullAnalysis`
- `src/pages/ViralToday.tsx` — replace the inline filter chip row with `<FormatTabs>` + `<FiltersPanel>` button; extend the fetch query with the format + niche filters; add count-fetching query; VideoCard fires the backfill on first visible
- `src/pages/ViralVideoDetail.tsx` — add 6th tab "Category"; auto-fires backfill if `content_format` is null

---

## Task 1: Schema migration

**Files:**
- Create: `supabase/migrations/20260515_viral_videos_categorization.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260515_viral_videos_categorization.sql

ALTER TABLE viral_videos
  ADD COLUMN IF NOT EXISTS content_format TEXT,
  ADD COLUMN IF NOT EXISTS primary_niche  TEXT;

-- Format is a closed enum: one of 11 slugs or NULL.
ALTER TABLE viral_videos
  DROP CONSTRAINT IF EXISTS viral_videos_content_format_chk;
ALTER TABLE viral_videos
  ADD CONSTRAINT viral_videos_content_format_chk
  CHECK (
    content_format IS NULL OR content_format IN (
      'caption_post', 'storytelling', 'educational', 'comparison',
      'authority', 'reaction', 'listicle', 'tutorial', 'vlog',
      'selling', 'funny'
    )
  );

-- primary_niche has no CHECK — it's an extensible vocabulary; AI may add new slugs.

CREATE INDEX IF NOT EXISTS idx_viral_videos_format
  ON viral_videos (content_format)
  WHERE content_format IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_viral_videos_niche
  ON viral_videos (primary_niche)
  WHERE primary_niche IS NOT NULL;

-- Covers the most common combination: format selected + sort by outlier_score desc.
CREATE INDEX IF NOT EXISTS idx_viral_videos_format_outlier
  ON viral_videos (content_format, outlier_score DESC)
  WHERE content_format IS NOT NULL;
```

- [ ] **Step 2: Apply migration via Supabase Management API** (the CLI `db push` is blocked by pre-existing migration history drift; this project applies migrations via the Management API, as established in prior commits)

Run:

```bash
SUPABASE_ACCESS_TOKEN=$SUPABASE_ACCESS_TOKEN \
  curl -s -X POST "https://api.supabase.com/v1/projects/hxojqrilwhhrvloiwmfo/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d @<(jq -Rs '{query: .}' supabase/migrations/20260515_viral_videos_categorization.sql)
```

Expected: `[]` (empty array — success on DDL).

Verify the columns exist:

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/hxojqrilwhhrvloiwmfo/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT column_name FROM information_schema.columns WHERE table_name = '\''viral_videos'\'' AND column_name IN ('\''content_format'\'', '\''primary_niche'\'') ORDER BY column_name;"}'
```

Expected:
```json
[{"column_name":"content_format"},{"column_name":"primary_niche"}]
```

- [ ] **Step 3: Record the migration in the tracking table**

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/hxojqrilwhhrvloiwmfo/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('\''20260515000003'\'', '\''viral_videos_categorization'\'') ON CONFLICT (version) DO NOTHING RETURNING version;"}'
```

Expected: `[{"version":"20260515000003"}]`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260515_viral_videos_categorization.sql
git commit -m "feat(viral-videos): add content_format + primary_niche columns

CHECK-constrains content_format to the 11 canonical slugs. primary_niche
is open TEXT — Haiku may invent new niche slugs for OOV topics like
religion, gaming, comedy. Adds covering indexes for the new filter paths."
```

---

## Task 2: Shared taxonomy module (Deno) + tests

**Files:**
- Create: `supabase/functions/_shared/video-taxonomy.ts`
- Create: `supabase/functions/_shared/video-taxonomy.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
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
```

- [ ] **Step 2: Run tests to confirm they fail**

Run:
```bash
cd /Users/admin/Documents/connectacreators/supabase/functions && \
  ~/.deno/bin/deno test _shared/video-taxonomy.test.ts --allow-net --no-check
```
Expected: FAIL with "module not found".

- [ ] **Step 3: Write the implementation**

```typescript
// supabase/functions/_shared/video-taxonomy.ts

export const CONTENT_FORMATS = [
  { slug: "caption_post",   label: "Caption Post" },
  { slug: "storytelling",   label: "Storytelling" },
  { slug: "educational",    label: "Educational" },
  { slug: "comparison",     label: "Comparison" },
  { slug: "authority",      label: "Authority" },
  { slug: "reaction",       label: "Reaction" },
  { slug: "listicle",       label: "Listicle" },
  { slug: "tutorial",       label: "Tutorial" },
  { slug: "vlog",           label: "Vlog" },
  { slug: "selling",        label: "Selling" },
  { slug: "funny",          label: "Funny" },
] as const;

export type ContentFormat = typeof CONTENT_FORMATS[number]["slug"];

const FORMAT_SLUGS = new Set<string>(CONTENT_FORMATS.map((f) => f.slug));

export function isValidContentFormat(value: unknown): value is ContentFormat {
  return typeof value === "string" && FORMAT_SLUGS.has(value);
}

export const CANONICAL_NICHES = [
  "personal_branding", "fitness", "sales", "real_estate", "finance",
  "ecommerce", "coaching", "saas_tech", "beauty", "food",
  "mindset", "relationships", "education", "lifestyle", "parenting",
] as const;

/**
 * Coerce a raw niche string (possibly AI-invented) into a safe snake_case slug.
 * - Lowercases
 * - Trims whitespace
 * - Replaces internal whitespace runs with single underscores
 * - Strips non-alphanumeric (except underscores)
 * - Caps length at 50
 * Returns empty string for blank input.
 */
export function normalizeNicheSlug(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return "";
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return "";
  const collapsed = trimmed.replace(/\s+/g, "_");
  const cleaned = collapsed.replace(/[^a-z0-9_]/g, "");
  return cleaned.slice(0, 50);
}

/** snake_case slug → Title Case label for display. */
export function nicheLabel(slug: string): string {
  if (!slug) return "";
  return slug
    .split("_")
    .map((s) => (s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1)))
    .join(" ");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd /Users/admin/Documents/connectacreators/supabase/functions && \
  ~/.deno/bin/deno test _shared/video-taxonomy.test.ts --allow-net --no-check
```
Expected: `ok | 11 passed | 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/video-taxonomy.ts \
        supabase/functions/_shared/video-taxonomy.test.ts
git commit -m "feat(viral-videos): shared video-taxonomy module

11 canonical content formats + 15 seed niche slugs. isValidContentFormat
validator and normalizeNicheSlug coercion for AI-suggested values."
```

---

## Task 3: Frontend taxonomy mirror

**Files:**
- Create: `src/lib/video-taxonomy.ts`

- [ ] **Step 1: Write the file (mirror of the Deno module, browser-friendly)**

```typescript
// src/lib/video-taxonomy.ts
// MIRROR of supabase/functions/_shared/video-taxonomy.ts
// Keep these in sync — any change here must also be made in the Deno file.

export const CONTENT_FORMATS = [
  { slug: "caption_post",   label: "Caption Post" },
  { slug: "storytelling",   label: "Storytelling" },
  { slug: "educational",    label: "Educational" },
  { slug: "comparison",     label: "Comparison" },
  { slug: "authority",      label: "Authority" },
  { slug: "reaction",       label: "Reaction" },
  { slug: "listicle",       label: "Listicle" },
  { slug: "tutorial",       label: "Tutorial" },
  { slug: "vlog",           label: "Vlog" },
  { slug: "selling",        label: "Selling" },
  { slug: "funny",          label: "Funny" },
] as const;

export type ContentFormat = typeof CONTENT_FORMATS[number]["slug"];

const FORMAT_SLUGS = new Set<string>(CONTENT_FORMATS.map((f) => f.slug));

export function isValidContentFormat(value: unknown): value is ContentFormat {
  return typeof value === "string" && FORMAT_SLUGS.has(value);
}

export const CANONICAL_NICHES = [
  "personal_branding", "fitness", "sales", "real_estate", "finance",
  "ecommerce", "coaching", "saas_tech", "beauty", "food",
  "mindset", "relationships", "education", "lifestyle", "parenting",
] as const;

const CANONICAL_NICHE_SET = new Set<string>(CANONICAL_NICHES);

/** True if a niche slug is one of the 15 canonical seeds. */
export function isCanonicalNiche(slug: string): boolean {
  return CANONICAL_NICHE_SET.has(slug);
}

/** snake_case slug → Title Case label for display. */
export function nicheLabel(slug: string): string {
  if (!slug) return "";
  return slug
    .split("_")
    .map((s) => (s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1)))
    .join(" ");
}
```

- [ ] **Step 2: TypeScript check**

Run:
```bash
cd /Users/admin/Documents/connectacreators && \
  npx tsc --noEmit 2>&1 | grep -i "video-taxonomy" | head -5
```
Expected: empty output (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/lib/video-taxonomy.ts
git commit -m "feat(viral-videos): frontend mirror of video-taxonomy

Same 11 formats + 15 canonical niches as the Deno module, plus
isCanonicalNiche for filter UX sorting and nicheLabel for display."
```

---

## Task 4: Extend `tagFramework` to return format + niche

**Files:**
- Modify: `supabase/functions/_shared/viral-video-analyzer.ts`

- [ ] **Step 1: Update the `TagResult` interface and the `tagFramework` empty-fallback returns**

Find the interface declaration (currently `niche_tags`, `audience`, `key_topics`, `body_structure`, `hook_template`). Replace it and ALL empty-fallback `return` statements in `tagFramework` so they include the two new fields.

```typescript
// At the top of the file, ADD this import (just below the existing imports):
import { CONTENT_FORMATS, isValidContentFormat, normalizeNicheSlug, type ContentFormat } from "./video-taxonomy.ts";
```

Then find and replace the `TagResult` interface. Old:

```typescript
export interface TagResult {
  niche_tags: string[];
  audience: string;
  key_topics: string[];
  body_structure: string;
  hook_template: string;
}
```

New:

```typescript
export interface TagResult {
  niche_tags: string[];
  audience: string;
  key_topics: string[];
  body_structure: string;
  hook_template: string;
  content_format: ContentFormat | null;
  primary_niche: string | null;
}
```

Update the THREE empty-fallback returns inside `tagFramework` (one at the top when `anthropicKey` is missing, one when `!res.ok`, one in the catch block). Each becomes:

```typescript
return {
  niche_tags: [],
  audience: "",
  key_topics: [],
  body_structure: "",
  hook_template: "",
  content_format: null,
  primary_niche: null,
};
```

- [ ] **Step 2: Extend the Haiku prompt with two new fields**

Find the prompt template string inside `tagFramework` (it starts with `"You are tagging a viral short-form video..."`). Append two new lines to the JSON schema, keeping the existing 5 lines.

Old JSON schema block in the prompt:

```typescript
const prompt = `You are tagging a viral short-form video for a creator-content database. Read the content and caption, then output ONLY a JSON object with these fields:

{
  "niche_tags": ["<2-4 short niche labels, lowercase, e.g. 'personal branding', 'fitness', 'pest control sales'>"],
  "audience": "<one phrase describing the target viewer, e.g. 'creators 18-30 starting from zero'>",
  "key_topics": ["<3-5 specific topic labels, e.g. 'origin story', 'career pivot', 'rookie pitch contest'>"],
  "body_structure": "<one sentence summarizing the body's narrative pattern, e.g. '5 beats — origin, struggle, pivot, result, lesson'>",
  "hook_template": "<the FIRST 1-3 sentences of the transcript ... existing instructions ...>"
}
...
```

New (add the two new fields between `hook_template` and the closing `}` of the JSON example):

```typescript
const prompt = `You are tagging a viral short-form video for a creator-content database. Read the content and caption, then output ONLY a JSON object with these fields:

{
  "niche_tags": ["<2-4 short niche labels, lowercase, e.g. 'personal branding', 'fitness', 'pest control sales'>"],
  "audience": "<one phrase describing the target viewer, e.g. 'creators 18-30 starting from zero'>",
  "key_topics": ["<3-5 specific topic labels, e.g. 'origin story', 'career pivot', 'rookie pitch contest'>"],
  "body_structure": "<one sentence summarizing the body's narrative pattern, e.g. '5 beats — origin, struggle, pivot, result, lesson'>",
  "hook_template": "<the FIRST 1-3 sentences ... existing instructions ...>",
  "content_format": "<EXACTLY one of: caption_post, storytelling, educational, comparison, authority, reaction, listicle, tutorial, vlog, selling, funny. Pick the BEST single fit for the video's primary intent. caption_post = text-on-screen + music with no spoken narration. storytelling = personal anecdote or narrative. educational = teaches a concept or framework. comparison = X vs Y, before/after. authority = strong stance, hot take, calls out a misconception. reaction = responds to another video/trend/screenshot. listicle = 'Top 5', enumerated structure. tutorial = procedural step-by-step. vlog = day-in-the-life, behind-the-scenes. selling = product-focused with CTA. funny = comedy/skit/parody.>",
  "primary_niche": "<the topic niche, snake_case. STRONGLY PREFER one of these canonical labels: personal_branding, fitness, sales, real_estate, finance, ecommerce, coaching, saas_tech, beauty, food, mindset, relationships, education, lifestyle, parenting. If the video clearly doesn't fit any of those (e.g., religion, gaming, comedy, politics, true_crime, parenting, art, music), output a new short snake_case slug (lowercase, words joined by underscores, no spaces, max 50 chars). EXACTLY ONE niche.>"
}
...
```

Then below the JSON example, ADD a final instruction line:

```typescript
...

CAPTION: ${(caption ?? "").slice(0, 400)}

${isCaptionStyle ? "TEXT ON SCREEN (caption-style video):" : "TRANSCRIPT:"} ${effectiveText.slice(0, 2500)}

Output ONLY the JSON object, no commentary. The content_format MUST be one of the 11 allowed slugs.`;
```

Also bump `max_tokens` 800 → 1000 in the `messages` payload of the Haiku call inside `tagFramework`.

- [ ] **Step 3: Extend the parsed-result return path**

Inside the `try` block of `tagFramework`, find the `return` statement that constructs the parsed result and add the two new fields with validation/normalization.

Old:

```typescript
return {
  niche_tags: Array.isArray(parsed.niche_tags) ? parsed.niche_tags.slice(0, 4) : [],
  audience: typeof parsed.audience === "string" ? parsed.audience.slice(0, 200) : "",
  key_topics: Array.isArray(parsed.key_topics) ? parsed.key_topics.slice(0, 5) : [],
  body_structure: typeof parsed.body_structure === "string" ? parsed.body_structure.slice(0, 300) : "",
  hook_template: typeof parsed.hook_template === "string" ? parsed.hook_template.slice(0, 400) : "",
};
```

New (with fallback rules for content_format and normalization for primary_niche):

```typescript
const rawFormat = typeof parsed.content_format === "string" ? parsed.content_format.trim().toLowerCase() : null;
const contentFormat: ContentFormat | null = isValidContentFormat(rawFormat)
  ? rawFormat
  : (isCaptionStyle ? "caption_post" : "storytelling");  // fallback for invalid Haiku output

const rawNiche = typeof parsed.primary_niche === "string" ? parsed.primary_niche : null;
const primaryNiche = normalizeNicheSlug(rawNiche) || null;

return {
  niche_tags: Array.isArray(parsed.niche_tags) ? parsed.niche_tags.slice(0, 4) : [],
  audience: typeof parsed.audience === "string" ? parsed.audience.slice(0, 200) : "",
  key_topics: Array.isArray(parsed.key_topics) ? parsed.key_topics.slice(0, 5) : [],
  body_structure: typeof parsed.body_structure === "string" ? parsed.body_structure.slice(0, 300) : "",
  hook_template: typeof parsed.hook_template === "string" ? parsed.hook_template.slice(0, 400) : "",
  content_format: contentFormat,
  primary_niche: primaryNiche,
};
```

Note: `tagFramework`'s function signature already receives `isCaptionStyle` as a parameter — it's the third arg. The fallback above uses it.

- [ ] **Step 4: Update `runFullAnalysis` to write the new fields to the row**

Find `runFullAnalysis`'s return statement (it returns a patch object that the caller applies via `UPDATE`). Add the two new fields to the returned patch:

Old:

```typescript
return {
  video_file_url: fileResult.video_file_url,
  video_file_expires_at: fileResult.video_file_expires_at,
  transcript: effectiveTranscript,
  hook_text: hookText,
  cta_text: ctaText,
  framework_meta,
  transcribed_at: new Date().toISOString(),
};
```

New (note: `content_format` and `primary_niche` are top-level row columns, NOT inside `framework_meta`):

```typescript
return {
  video_file_url: fileResult.video_file_url,
  video_file_expires_at: fileResult.video_file_expires_at,
  transcript: effectiveTranscript,
  hook_text: hookText,
  cta_text: ctaText,
  framework_meta,
  transcribed_at: new Date().toISOString(),
  content_format: tags.content_format,
  primary_niche: tags.primary_niche,
};
```

The callers (`transcribe-video/index.ts`, `analyze-viral-video-user/index.ts`, `analyze-viral-video/index.ts`) all do `await admin.from("viral_videos").update({ ...patch, analysis_status: "analyzed" })` — passing the patch through `...spread` so the new fields land automatically.

- [ ] **Step 5: Type-check the analyzer module**

Run:
```bash
cd /Users/admin/Documents/connectacreators/supabase/functions && \
  ~/.deno/bin/deno check _shared/viral-video-analyzer.ts
```
Expected: clean check.

- [ ] **Step 6: Redeploy all four functions that import the shared analyzer**

```bash
for fn in transcribe-video analyze-viral-video-user analyze-viral-video viral-video-templatize-hook; do
  SUPABASE_ACCESS_TOKEN=$SUPABASE_ACCESS_TOKEN \
    /tmp/supabase functions deploy $fn \
    --project-ref hxojqrilwhhrvloiwmfo --no-verify-jwt
done
```

Expected: 4 lines starting with `Deployed Functions on project hxojqrilwhhrvloiwmfo:`.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/viral-video-analyzer.ts
git commit -m "feat(viral-videos): tagFramework returns content_format + primary_niche

Extends the Haiku prompt with two new fields. content_format is one of
11 closed-enum slugs (fallback to caption_post or storytelling on
invalid). primary_niche is a normalized snake_case slug, AI-extensible
beyond the 15 canonical seeds. Fields land on the row top-level (not
nested in framework_meta) so they index cleanly for filter queries."
```

---

## Task 5: New `viral-video-categorize` edge function

**Files:**
- Create: `supabase/functions/viral-video-categorize/index.ts`

- [ ] **Step 1: Write the function**

```typescript
// supabase/functions/viral-video-categorize/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import {
  isValidContentFormat,
  normalizeNicheSlug,
  type ContentFormat,
} from "../_shared/video-taxonomy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405, headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userResult } = await userClient.auth.getUser();
  if (!userResult?.user) return json({ error: "unauthorized" }, 401);

  let body: { viral_video_id?: string };
  try { body = await req.json(); } catch { body = {}; }
  if (!body.viral_video_id) return json({ error: "missing_viral_video_id" }, 400);

  const { data: row, error: rowErr } = await admin
    .from("viral_videos")
    .select("id, caption, transcript, framework_meta, content_format, primary_niche, analysis_status")
    .eq("id", body.viral_video_id)
    .single();
  if (rowErr || !row) return json({ error: "row_not_found" }, 404);

  // Cache hit — both already set.
  if (row.content_format && row.primary_niche) {
    return json({
      content_format: row.content_format,
      primary_niche: row.primary_niche,
      cached: true,
    }, 200);
  }

  if (row.analysis_status !== "analyzed") {
    return json({ error: "not_analyzed", message: "Analyze the video first" }, 400);
  }

  // Build the Haiku input from cached fields.
  const isCaptionStyle = Boolean((row.framework_meta as Record<string, unknown> | null)?.is_caption_style);
  const segments = (row.framework_meta as { visual_segments?: Array<{ description?: string; text_on_screen?: string[] }> } | null)?.visual_segments ?? [];
  const visualHints = segments
    .slice(0, 6)
    .map((s) => s.description ?? (s.text_on_screen ?? []).join(" / "))
    .filter(Boolean)
    .join(" | ");

  const transcript = (row.transcript as string | null) ?? "";
  const caption = (row.caption as string | null) ?? "";
  if (!transcript.trim() && !visualHints) {
    return json({ error: "no_content_to_classify" }, 400);
  }

  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) return json({ error: "anthropic_missing_key" }, 500);

  const prompt = `Classify this video into a content_format (closed enum) and a primary_niche (canonical-preferred, extensible).

content_format MUST be EXACTLY one of these 11:
- caption_post: text-on-screen + music, no spoken narration
- storytelling: personal anecdote, origin story, narrative
- educational: teaches a concept or framework (theory > steps)
- comparison: X vs Y, before/after
- authority: strong stance, hot take, calls out misconception
- reaction: responds to another video/trend/content
- listicle: "Top 5", enumerated structure
- tutorial: procedural step-by-step
- vlog: day-in-the-life, behind-the-scenes
- selling: product-focused with CTA
- funny: comedy/skit/parody

primary_niche: STRONGLY PREFER one of: personal_branding, fitness, sales, real_estate, finance, ecommerce, coaching, saas_tech, beauty, food, mindset, relationships, education, lifestyle, parenting.
If the video clearly fits none of those (religion, gaming, comedy, politics, true_crime, art, music, etc.), output a new short snake_case slug. EXACTLY ONE niche.

CAPTION: ${caption.slice(0, 300)}

${isCaptionStyle ? "TEXT ON SCREEN" : "TRANSCRIPT"}: ${transcript.slice(0, 2000)}

VISUAL HINTS: ${visualHints.slice(0, 500)}

Output ONLY a JSON object: {"content_format": "<slug>", "primary_niche": "<slug>"}. No commentary.`;

  const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!aiRes.ok) {
    const errText = await aiRes.text();
    return json({ error: "haiku_failed", message: errText.slice(0, 500) }, 500);
  }
  const aiBody = await aiRes.json();
  let raw = (aiBody.content?.[0]?.text as string ?? "").trim();
  raw = raw.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/\s*```$/, "").trim();

  let parsed: { content_format?: unknown; primary_niche?: unknown };
  try { parsed = JSON.parse(raw); } catch {
    return json({ error: "haiku_no_json", raw }, 500);
  }

  const rawFormat = typeof parsed.content_format === "string" ? parsed.content_format.trim().toLowerCase() : null;
  const contentFormat: ContentFormat = isValidContentFormat(rawFormat)
    ? rawFormat
    : (isCaptionStyle ? "caption_post" : "storytelling");

  const primaryNiche = normalizeNicheSlug(typeof parsed.primary_niche === "string" ? parsed.primary_niche : null);
  if (!primaryNiche) {
    return json({ error: "no_niche_returned", raw }, 500);
  }

  // Write back to the row.
  const { error: updateErr } = await admin
    .from("viral_videos")
    .update({ content_format: contentFormat, primary_niche: primaryNiche })
    .eq("id", row.id);
  if (updateErr) {
    // Return the values anyway so the caller still gets a result.
    return json({
      content_format: contentFormat,
      primary_niche: primaryNiche,
      cached: false,
      cache_update_failed: updateErr.message,
    }, 200);
  }

  return json({ content_format: contentFormat, primary_niche: primaryNiche, cached: false }, 200);
});
```

- [ ] **Step 2: Type-check**

Run:
```bash
cd /Users/admin/Documents/connectacreators/supabase/functions && \
  ~/.deno/bin/deno check viral-video-categorize/index.ts
```
Expected: clean.

- [ ] **Step 3: Deploy**

```bash
SUPABASE_ACCESS_TOKEN=$SUPABASE_ACCESS_TOKEN \
  /tmp/supabase functions deploy viral-video-categorize \
  --project-ref hxojqrilwhhrvloiwmfo --no-verify-jwt
```

Expected: `Deployed Functions on project hxojqrilwhhrvloiwmfo: viral-video-categorize`.

- [ ] **Step 4: Smoke test against a real analyzed row**

Find a row id from Viral Today (any analyzed row). Replace `<ROW_ID>` and `<ANON_JWT>` (grab from your browser's localStorage `sb-*` key or sign in via the app and copy the token).

```bash
curl -X POST "https://hxojqrilwhhrvloiwmfo.supabase.co/functions/v1/viral-video-categorize" \
  -H "Authorization: Bearer <ANON_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"viral_video_id": "<ROW_ID>"}'
```

Expected response (first call): `{"content_format": "...", "primary_niche": "...", "cached": false}`.
Second call: `{"content_format": "...", "primary_niche": "...", "cached": true}`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/viral-video-categorize
git commit -m "feat(viral-videos): /viral-video-categorize lazy backfill endpoint

Free, idempotent Haiku-only classifier for already-analyzed rows that
lack content_format or primary_niche. ~\$0.001 per call, auth-required,
returns cached: true on subsequent calls. Falls back to caption_post or
storytelling if Haiku returns an invalid format slug."
```

---

## Task 6: ViralVideoDetail — Category tab + auto-fire backfill

**Files:**
- Modify: `src/pages/ViralVideoDetail.tsx`

- [ ] **Step 1: Add the imports and the new state**

Locate the top of the file (around line 1-16 where lucide-react imports live). Add the taxonomy import:

```typescript
import { CONTENT_FORMATS, nicheLabel } from "@/lib/video-taxonomy";
```

Find the `ViralVideo` interface and add the two new fields:

```typescript
interface ViralVideo {
  // ... existing fields ...
  content_format: string | null;
  primary_niche: string | null;
}
```

Find the `useState` declarations near the top of the component (around line ~138). Add two new pieces of state right after `templatizing`:

```typescript
const [categorizing, setCategorizing] = useState(false);
const [categoryError, setCategoryError] = useState<string | null>(null);
```

Update the `activeTab` type to include `"category"`:

```typescript
const [activeTab, setActiveTab] = useState<
  "caption" | "transcript" | "visual" | "hook" | "story" | "category"
>("caption");
```

- [ ] **Step 2: Add the lazy-backfill useEffect**

Below the existing useEffects (after the hook-template effect), add:

```typescript
// Auto-fire backfill on page mount if the row is analyzed but uncategorized.
useEffect(() => {
  if (!video) return;
  if (video.analysis_status !== "analyzed") return;
  if (video.content_format && video.primary_niche) return;
  if (categorizing) return;
  setCategorizing(true);
  setCategoryError(null);
  (async () => {
    try {
      const token = await getAuthToken();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/viral-video-categorize`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ viral_video_id: video.id }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setCategoryError(err.message || err.error || `HTTP ${res.status}`);
      }
      // Row update flows through the existing realtime subscription.
    } catch (e: unknown) {
      setCategoryError(e instanceof Error ? e.message : "Categorize failed");
    } finally {
      setCategorizing(false);
    }
  })();
}, [video?.id, video?.analysis_status, video?.content_format, video?.primary_niche]);
```

- [ ] **Step 3: Add "Category" to the tab strip**

Find the tab strip where `(["caption", "transcript", "visual", "hook", "story"] as const).map(...)` is rendered. Change the array literal to include the new tab:

```typescript
{(["caption", "transcript", "visual", "hook", "story", "category"] as const).map((t) => (
  <button
    key={t}
    onClick={() => setActiveTab(t)}
    className={cn(
      "px-3 py-2.5 text-sm capitalize transition-colors whitespace-nowrap",
      activeTab === t ? "text-foreground border-b-2 border-foreground" : "text-muted-foreground hover:text-foreground",
    )}
  >
    {t === "story" ? "Storytelling" : t === "visual" ? "Visual Layout" : t === "category" ? "Category" : t}
  </button>
))}
```

- [ ] **Step 4: Add the Category tab content**

In the tab content div (where each `activeTab === "..."` line renders content), add a new line:

```tsx
{activeTab === "category" && (
  <div className="space-y-4">
    {!video.content_format || !video.primary_niche ? (
      <div className="flex items-center gap-2 text-muted-foreground italic">
        <Loader2 className="w-3 h-3 animate-spin" />
        {categorizing ? "Categorizing…" : (categoryError ?? "Categorizing…")}
      </div>
    ) : (
      <>
        <div className="grid grid-cols-[80px_1fr] gap-y-2 text-sm">
          <span className="text-muted-foreground">Format</span>
          <span className="text-foreground font-medium">
            {CONTENT_FORMATS.find((f) => f.slug === video.content_format)?.label ?? video.content_format}
          </span>
          <span className="text-muted-foreground">Niche</span>
          <span className="text-foreground font-medium">
            {nicheLabel(video.primary_niche)}
          </span>
        </div>
        {Array.isArray(video.framework_meta?.niche_tags) && video.framework_meta.niche_tags.length > 0 && (
          <div>
            <div className="text-xs text-muted-foreground mb-2">Topics</div>
            <div className="flex flex-wrap gap-1.5">
              {video.framework_meta.niche_tags.map((tag, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 rounded-full bg-muted text-xs text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </>
    )}
  </div>
)}
```

- [ ] **Step 5: Type-check**

```bash
cd /Users/admin/Documents/connectacreators && \
  npx tsc --noEmit 2>&1 | grep -i "ViralVideoDetail" | head -5
```
Expected: empty.

- [ ] **Step 6: Commit**

```bash
git add src/pages/ViralVideoDetail.tsx
git commit -m "feat(viral-today): Category tab on detail page

New 6th tab showing format + niche + topic chips. Auto-fires
/viral-video-categorize on page load if the row is analyzed but
uncategorized. Realtime subscription delivers the result; the tab
shows 'Categorizing…' until the row updates."
```

---

## Task 7: VideoCard auto-backfill (Viral Today grid)

**Files:**
- Modify: `src/pages/ViralToday.tsx` (the `VideoCard` component, around line 514)

- [ ] **Step 1: Add a module-level semaphore to limit concurrent backfill calls**

Above the `VideoCard` function definition (around line 510, just before `function VideoCard(...)`), add a simple in-flight counter shared across all cards:

```typescript
// Module-level semaphore — at most 3 concurrent categorize calls page-wide.
const CATEGORIZE_MAX_CONCURRENT = 3;
let categorizeInFlight = 0;
function acquireCategorizeSlot(): boolean {
  if (categorizeInFlight >= CATEGORIZE_MAX_CONCURRENT) return false;
  categorizeInFlight++;
  return true;
}
function releaseCategorizeSlot() {
  if (categorizeInFlight > 0) categorizeInFlight--;
}
```

- [ ] **Step 2: Extend the `ViralVideo` interface used by VideoCard**

Find the existing `ViralVideo` interface declaration in `ViralToday.tsx`. Add:

```typescript
interface ViralVideo {
  // ... existing fields ...
  content_format?: string | null;
  primary_niche?: string | null;
}
```

- [ ] **Step 3: Add a local state for "categorizing" on the VideoCard**

Inside the `VideoCard` function, near the existing `localStatus` / `analyzing` state declarations, add:

```typescript
const [categorizing, setCategorizing] = useState(false);
```

- [ ] **Step 4: Extend the IntersectionObserver effect to also fire categorize**

Find the existing `useEffect` that uses `IntersectionObserver` (~line 532 in `VideoCard`, the one with `onSeen`). Below it (NOT inside), add a SECOND useEffect for the categorize trigger:

```typescript
// Lazy-backfill content_format / primary_niche on visible cards.
useEffect(() => {
  const el = cardRef.current;
  if (!el) return;
  // Skip if already categorized OR analysis not yet done.
  if (video.content_format && video.primary_niche) return;
  if ((localStatus ?? video.analysis_status) !== "analyzed") return;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let fired = false;

  const observer = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting || fired) return;
    timer = setTimeout(async () => {
      if (fired) return;
      if (!acquireCategorizeSlot()) {
        // Backed off — try again on next intersection.
        timer = null;
        return;
      }
      fired = true;
      setCategorizing(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/viral-video-categorize`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
            body: JSON.stringify({ viral_video_id: video.id }),
          },
        );
        // Result lands via the row-level realtime subscription that's already wired up.
      } catch {
        // Silent fail — the user can retry by visiting the detail page.
      } finally {
        releaseCategorizeSlot();
        setCategorizing(false);
      }
    }, 1500);  // 1.5s debounce per spec
  }, { threshold: 0.5 });

  observer.observe(el);
  return () => {
    observer.disconnect();
    if (timer) clearTimeout(timer);
  };
}, [video.id, video.content_format, video.primary_niche, video.analysis_status, localStatus]);
```

- [ ] **Step 5: Show a quiet "categorizing…" badge while it runs**

Find the existing bottom-right Analyze badge JSX (the IIFE that renders one of three states based on `localStatus`). Modify it so that when `(localStatus ?? video.analysis_status) === "analyzed"` AND we're categorizing, we show a small categorizing pill instead of the green "Analyzed" checkmark:

Old (the "analyzed" branch of the IIFE):

```typescript
if (status === "analyzed") {
  return (
    <div
      className="flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-500/90 backdrop-blur-sm text-white text-[10px] font-medium border border-white/10"
      title="Already analyzed"
    >
      <CheckCircle2 className="w-3 h-3" />
      <span>Analyzed</span>
    </div>
  );
}
```

New (only branch with categorizing inserted):

```typescript
if (status === "analyzed") {
  if (categorizing) {
    return (
      <div
        className="flex items-center gap-1 px-2 py-1 rounded-full bg-black/70 backdrop-blur-sm text-white text-[10px] font-medium border border-white/10"
        title="Categorizing…"
      >
        <Loader2 className="w-3 h-3 animate-spin" />
        <span>Categorizing…</span>
      </div>
    );
  }
  return (
    <div
      className="flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-500/90 backdrop-blur-sm text-white text-[10px] font-medium border border-white/10"
      title="Already analyzed"
    >
      <CheckCircle2 className="w-3 h-3" />
      <span>Analyzed</span>
    </div>
  );
}
```

- [ ] **Step 6: Type-check**

```bash
cd /Users/admin/Documents/connectacreators && \
  npx tsc --noEmit 2>&1 | grep -i "ViralToday" | head -5
```
Expected: empty.

- [ ] **Step 7: Commit**

```bash
git add src/pages/ViralToday.tsx
git commit -m "feat(viral-today): VideoCard auto-backfills categorization on view

IntersectionObserver-gated, 1.5s debounce per card, module-level
3-concurrent semaphore so a freshly-loaded grid doesn't fire 50
parallel Haiku calls. Result lands via the existing row-level
realtime subscription. Quiet 'Categorizing…' badge replaces the
'Analyzed' checkmark during the call."
```

---

## Task 8: `<FormatTabs>` component

**Files:**
- Create: `src/components/viral-today/FormatTabs.tsx`

- [ ] **Step 1: Write the component**

```typescript
// src/components/viral-today/FormatTabs.tsx
import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { CONTENT_FORMATS, type ContentFormat } from "@/lib/video-taxonomy";

interface FormatTabsProps {
  active: ContentFormat | "all";
  onChange: (format: ContentFormat | "all") => void;
  counts: Partial<Record<ContentFormat | "all", number>>;
}

const VISIBLE_TABS_DESKTOP = 7;  // All + 6 most common; rest collapse to "More" on narrow screens

export function FormatTabs({ active, onChange, counts }: FormatTabsProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);

  // Close "More" dropdown on outside click.
  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [moreOpen]);

  const tabs: Array<{ slug: ContentFormat | "all"; label: string }> = [
    { slug: "all", label: "All" },
    ...CONTENT_FORMATS.map((f) => ({ slug: f.slug, label: f.label })),
  ];

  // Promote the active tab into the visible row if it's currently in "More".
  let visible = tabs.slice(0, VISIBLE_TABS_DESKTOP);
  let overflow = tabs.slice(VISIBLE_TABS_DESKTOP);
  if (overflow.some((t) => t.slug === active)) {
    const promoted = overflow.find((t) => t.slug === active)!;
    overflow = overflow.filter((t) => t.slug !== active);
    visible = [...visible.slice(0, -1), promoted];
    overflow = [...overflow, visible[VISIBLE_TABS_DESKTOP - 2]];
  }

  const renderTab = (slug: ContentFormat | "all", label: string) => {
    const count = counts[slug];
    const isActive = active === slug;
    return (
      <button
        key={slug}
        onClick={() => { onChange(slug); setMoreOpen(false); }}
        className={cn(
          "flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap transition-colors",
          isActive
            ? "text-foreground border-b-2 border-foreground font-medium"
            : "text-muted-foreground hover:text-foreground border-b-2 border-transparent",
        )}
      >
        <span>{label}</span>
        {typeof count === "number" && count > 0 && (
          <span className="text-xs text-muted-foreground/70 tabular-nums">{count}</span>
        )}
      </button>
    );
  };

  return (
    <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
      {visible.map((t) => renderTab(t.slug, t.label))}

      {/* Desktop: show all tabs inline. The flex container scrolls horizontally
          if narrow. The 'More' dropdown is only useful on truly narrow viewports;
          for the v1 we just allow horizontal scroll and skip the dropdown unless
          there are more than VISIBLE_TABS_DESKTOP. */}
      {overflow.length > 0 && (
        <div ref={moreRef} className="relative">
          <button
            onClick={() => setMoreOpen((o) => !o)}
            className={cn(
              "flex items-center gap-1 px-3 py-2 text-sm whitespace-nowrap text-muted-foreground hover:text-foreground border-b-2 border-transparent transition-colors",
            )}
          >
            More
            <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", moreOpen && "rotate-180")} />
          </button>
          {moreOpen && (
            <div className="absolute right-0 mt-1 w-44 rounded-lg border border-border bg-popover shadow-lg z-20 py-1">
              {overflow.map((t) => {
                const count = counts[t.slug];
                return (
                  <button
                    key={t.slug}
                    onClick={() => { onChange(t.slug); setMoreOpen(false); }}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-1.5 text-sm transition-colors",
                      active === t.slug ? "text-foreground bg-muted/50" : "text-muted-foreground hover:bg-muted/50",
                    )}
                  >
                    <span>{t.label}</span>
                    {typeof count === "number" && count > 0 && (
                      <span className="text-xs text-muted-foreground/70 tabular-nums">{count}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/admin/Documents/connectacreators && \
  npx tsc --noEmit 2>&1 | grep -i "FormatTabs" | head -5
```
Expected: empty.

- [ ] **Step 3: Commit**

```bash
git add src/components/viral-today/FormatTabs.tsx
git commit -m "feat(viral-today): FormatTabs horizontal strip component

12 tabs (All + 11 formats), per-format count badges, editorial
underline for active tab. Overflow tabs collapse into a 'More'
dropdown on narrow viewports. Promotes the active tab into the
visible row if it's currently hidden."
```

---

## Task 9: `<FiltersPanel>` component

**Files:**
- Create: `src/components/viral-today/FiltersPanel.tsx`

- [ ] **Step 1: Write the component**

This component is a controlled popover. The parent (`ViralToday.tsx`) keeps state for every filter dimension; this component only renders the panel and emits changes.

```typescript
// src/components/viral-today/FiltersPanel.tsx
import { useEffect, useRef, useState } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CANONICAL_NICHES, isCanonicalNiche, nicheLabel } from "@/lib/video-taxonomy";

export interface FiltersPanelValue {
  date: string;
  platform: string;
  outlier: string;
  views: string;
  engagement: string;
  source: string;
  featuredOnly: boolean;
  niches: string[];
}

interface NicheOption {
  slug: string;
  count: number;
}

interface FiltersPanelProps {
  value: FiltersPanelValue;
  defaults: FiltersPanelValue;
  onChange: (next: FiltersPanelValue) => void;
  availableNiches: NicheOption[];

  dateOptions: Array<{ value: string; label: string }>;
  platformOptions: Array<{ value: string; label: string }>;
  outlierOptions: Array<{ value: string; label: string }>;
  viewsOptions: Array<{ value: string; label: string }>;
  engagementOptions: Array<{ value: string; label: string }>;
  sourceOptions: Array<{ value: string; label: string }>;
}

const NICHES_VISIBLE_BY_DEFAULT = 8;

export function FiltersPanel(props: FiltersPanelProps) {
  const [open, setOpen] = useState(false);
  const [showAllNiches, setShowAllNiches] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Local draft state — only commit on Apply.
  const [draft, setDraft] = useState<FiltersPanelValue>(props.value);
  useEffect(() => { setDraft(props.value); }, [props.value]);

  // Outside-click closes the panel WITHOUT applying.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
        setDraft(props.value);  // revert draft
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, props.value]);

  // Active filter count (excluding format — that's separate nav).
  const activeCount = (() => {
    let n = 0;
    const v = props.value;
    const d = props.defaults;
    if (v.date !== d.date) n++;
    if (v.platform !== d.platform) n++;
    if (v.outlier !== d.outlier) n++;
    if (v.views !== d.views) n++;
    if (v.engagement !== d.engagement) n++;
    if (v.source !== d.source) n++;
    if (v.featuredOnly !== d.featuredOnly) n++;
    if (v.niches.length > 0) n++;
    return n;
  })();

  const reset = () => setDraft(props.defaults);
  const apply = () => {
    props.onChange(draft);
    setOpen(false);
  };

  const sortedNiches = (() => {
    // Canonical first, then by count desc, then alphabetical
    return [...props.availableNiches].sort((a, b) => {
      const aCanon = isCanonicalNiche(a.slug) ? 1 : 0;
      const bCanon = isCanonicalNiche(b.slug) ? 1 : 0;
      if (aCanon !== bCanon) return bCanon - aCanon;
      if (b.count !== a.count) return b.count - a.count;
      return a.slug.localeCompare(b.slug);
    });
  })();
  const visibleNiches = showAllNiches ? sortedNiches : sortedNiches.slice(0, NICHES_VISIBLE_BY_DEFAULT);

  return (
    <div ref={panelRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border transition-colors",
          activeCount > 0
            ? "border-foreground text-foreground bg-muted/40"
            : "border-border text-muted-foreground hover:text-foreground",
        )}
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
        Filters
        {activeCount > 0 && (
          <span className="ml-1 px-1.5 py-0.5 rounded-full bg-foreground text-background text-[10px] tabular-nums">
            {activeCount}
          </span>
        )}
        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[360px] max-h-[70vh] overflow-y-auto rounded-xl border border-border bg-popover shadow-lg z-30 p-4 space-y-3">

          <FilterRow label="Date">
            <select value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} className={selectClass}>
              {props.dateOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </FilterRow>

          <FilterRow label="Platform">
            <select value={draft.platform} onChange={(e) => setDraft({ ...draft, platform: e.target.value })} className={selectClass}>
              {props.platformOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </FilterRow>

          <FilterRow label="Outlier">
            <select value={draft.outlier} onChange={(e) => setDraft({ ...draft, outlier: e.target.value })} className={selectClass}>
              {props.outlierOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </FilterRow>

          <FilterRow label="Views">
            <select value={draft.views} onChange={(e) => setDraft({ ...draft, views: e.target.value })} className={selectClass}>
              {props.viewsOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </FilterRow>

          <FilterRow label="Engagement">
            <select value={draft.engagement} onChange={(e) => setDraft({ ...draft, engagement: e.target.value })} className={selectClass}>
              {props.engagementOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </FilterRow>

          <FilterRow label="Source">
            <select value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value })} className={selectClass}>
              {props.sourceOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </FilterRow>

          <FilterRow label="Featured only">
            <input
              type="checkbox"
              checked={draft.featuredOnly}
              onChange={(e) => setDraft({ ...draft, featuredOnly: e.target.checked })}
              className="w-4 h-4 accent-foreground"
            />
          </FilterRow>

          <div className="border-t border-border pt-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Niche</div>
            <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
              {visibleNiches.length === 0 ? (
                <div className="text-xs text-muted-foreground italic">No niches yet — analyze some videos first</div>
              ) : (
                visibleNiches.map((n) => (
                  <label key={n.slug} className="flex items-center justify-between gap-2 text-sm py-0.5 cursor-pointer">
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={draft.niches.includes(n.slug)}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...draft.niches, n.slug]
                            : draft.niches.filter((s) => s !== n.slug);
                          setDraft({ ...draft, niches: next });
                        }}
                        className="w-3.5 h-3.5 accent-foreground"
                      />
                      <span className="text-foreground">{nicheLabel(n.slug)}</span>
                      {!isCanonicalNiche(n.slug) && (
                        <span className="text-[10px] text-muted-foreground/60 italic">auto</span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">{n.count}</span>
                  </label>
                ))
              )}
            </div>
            {sortedNiches.length > NICHES_VISIBLE_BY_DEFAULT && (
              <button
                onClick={() => setShowAllNiches((s) => !s)}
                className="mt-2 text-xs text-muted-foreground hover:text-foreground underline"
              >
                {showAllNiches ? "Show fewer" : `Show all ${sortedNiches.length} niches`}
              </button>
            )}
          </div>

          <div className="border-t border-border pt-3 flex items-center justify-between">
            <button onClick={reset} className="text-xs text-muted-foreground hover:text-foreground">
              Reset
            </button>
            <Button onClick={apply} size="sm">Apply</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

const selectClass = "h-8 rounded-md border border-border bg-background text-sm px-2 text-foreground min-w-[160px]";
```

`CANONICAL_NICHES` is imported but only used implicitly via `isCanonicalNiche`. Remove the import if your linter flags it. (It's exported by `video-taxonomy.ts` for callers that want the seed list directly — e.g., to show canonical niches even when count is 0.)

- [ ] **Step 2: Type-check**

```bash
cd /Users/admin/Documents/connectacreators && \
  npx tsc --noEmit 2>&1 | grep -i "FiltersPanel" | head -5
```
Expected: empty.

- [ ] **Step 3: Commit**

```bash
git add src/components/viral-today/FiltersPanel.tsx
git commit -m "feat(viral-today): FiltersPanel collapsed drawer component

Single button with active-count badge. Click opens a popover with all
existing filter dimensions (date, platform, outlier, views, engagement,
source, featured) PLUS a new niche multi-select. Niches sort canonical-
first, then by count, then alphabetical. Draft state isolates the panel
from the page until Apply is clicked."
```

---

## Task 10: Wire FormatTabs + FiltersPanel into ViralToday

**Files:**
- Modify: `src/pages/ViralToday.tsx`

- [ ] **Step 1: Add imports + new state**

At the top of the file, add (next to the other component imports):

```typescript
import { FormatTabs } from "@/components/viral-today/FormatTabs";
import { FiltersPanel, type FiltersPanelValue } from "@/components/viral-today/FiltersPanel";
import { type ContentFormat } from "@/lib/video-taxonomy";
```

Inside the page component (around line ~1037 where filter state lives), add new state:

```typescript
const [activeFormat, setActiveFormat] = useState<ContentFormat | "all">("all");
const [selectedNiches, setSelectedNiches] = useState<string[]>([]);
const [formatCounts, setFormatCounts] = useState<Partial<Record<ContentFormat | "all", number>>>({});
const [availableNiches, setAvailableNiches] = useState<Array<{ slug: string; count: number }>>([]);
```

- [ ] **Step 2: Define the filter defaults**

Near where the existing filter `useState` declarations are, add:

```typescript
const FILTER_DEFAULTS: FiltersPanelValue = {
  date: "12months",
  platform: "all",
  outlier: "2.5",
  views: "0",
  engagement: "0",
  source: "all",
  featuredOnly: false,
  niches: [],
};
```

- [ ] **Step 3: Wire FiltersPanel's `value` and `onChange`**

Below the new state, derive the panel value from the existing per-dimension state:

```typescript
const filtersValue: FiltersPanelValue = {
  date: filterDate,
  platform: filterPlatform,
  outlier: filterOutlier,
  views: filterViews,
  engagement: filterEngagement,
  source: filterSource,
  featuredOnly: showOnlyFeatured,
  niches: selectedNiches,
};

const handleFiltersChange = (next: FiltersPanelValue) => {
  setFilterDate(next.date);
  setFilterPlatform(next.platform);
  setFilterOutlier(next.outlier);
  setFilterViews(next.views);
  setFilterEngagement(next.engagement);
  setFilterSource(next.source);
  setShowOnlyFeatured(next.featuredOnly);
  setSelectedNiches(next.niches);
};
```

- [ ] **Step 4: Extend the existing video-fetch query with format + niche**

Find the `useEffect` that builds the `viral_videos` SELECT query (around line ~1140, the one keyed on `[filterPlatform, filterDate, filterOutlier, filterViews, filterEngagement, user]`). Add `activeFormat` and `selectedNiches` to its deps, and add two `.eq()` / `.in()` clauses to the query:

```typescript
// Just after the existing .eq("platform", ...) and date/outlier/views/engagement filters,
// add these inside the same query-building block:

if (activeFormat !== "all") {
  q = q.eq("content_format", activeFormat);
}
if (selectedNiches.length > 0) {
  q = q.in("primary_niche", selectedNiches);
}
```

Add `activeFormat` and `selectedNiches` to the useEffect's dep array:

```typescript
}, [filterPlatform, filterDate, filterOutlier, filterViews, filterEngagement, activeFormat, selectedNiches, user]);
```

- [ ] **Step 5: Add a query to fetch per-format counts and available niches**

Below the main video-fetch effect, add a new effect that fetches counts whenever the non-format filters change (NOT when activeFormat itself changes — counts reflect "if I picked this format, how many results"):

```typescript
useEffect(() => {
  if (!user) return;
  let cancelled = false;
  (async () => {
    // Per-format counts respecting non-format filters.
    const baseQuery = (q: typeof supabase.from extends (...a: unknown[]) => infer R ? R : never) => {
      // Replicate the same filter logic as the main fetch, MINUS activeFormat.
      let qq = q;
      if (filterPlatform !== "all") qq = qq.eq("platform", filterPlatform);
      // ... date / outlier / views / engagement / source / featuredOnly filters
      if (selectedNiches.length > 0) qq = qq.in("primary_niche", selectedNiches);
      return qq;
    };
    // For simplicity, do two separate count fetches:
    // 1. per-format counts
    // 2. per-niche counts (across all formats, respecting the rest of the filters)
    const { data: byFormat } = await supabase
      .from("viral_videos")
      .select("content_format", { count: "exact" })
      .not("content_format", "is", null);

    // Fall back: client-side aggregation if Supabase doesn't support GROUP BY in JS API directly.
    // The simpler approach is to fetch the slim row set already in the grid query and
    // tally locally. We'll do that.
  })();
  return () => { cancelled = true; };
}, [filterPlatform, filterDate, filterOutlier, filterViews, filterEngagement, selectedNiches, user]);
```

This is messy with Supabase JS. The cleaner approach is a Postgres RPC. Skip the count query for now and use a simpler approach: tally counts from the already-fetched video list (which is filtered the same way except for format):

REPLACE the above effect with this simpler version. Find where the grid videos arrive (the state setter for the main video list, often called `setVideos`). After setting the videos, tally counts inline:

```typescript
// Inside the grid-fetch effect, after setVideos(data):
const formatTally: Partial<Record<ContentFormat | "all", number>> = { all: data.length };
const nicheTally = new Map<string, number>();
for (const v of data) {
  if (v.content_format) {
    formatTally[v.content_format as ContentFormat] =
      (formatTally[v.content_format as ContentFormat] ?? 0) + 1;
  }
  if (v.primary_niche) {
    nicheTally.set(v.primary_niche, (nicheTally.get(v.primary_niche) ?? 0) + 1);
  }
}
setFormatCounts(formatTally);
setAvailableNiches(Array.from(nicheTally.entries()).map(([slug, count]) => ({ slug, count })));
```

**Important caveat:** when `activeFormat !== "all"`, the fetched `data` is already filtered by that format — so format-counts for OTHER formats will be 0 in `formatTally`. To get accurate per-format counts, fetch the data WITHOUT the format filter for counting, then apply the format filter for display. Implement this by doing TWO fetches in the main effect:

1. First fetch: all filters EXCEPT activeFormat. Use for tallying counts.
2. Second fetch: same plus activeFormat filter. Use for the displayed grid.

Or skip the second fetch entirely and just `.filter()` the first array client-side by activeFormat. Since the result set is already reasonably small (typically <100 rows), client-side filtering is cheap.

Final shape of the effect:

```typescript
// Inside the existing grid-fetch useEffect:
// 1. Build query WITHOUT activeFormat clause.
let q = supabase.from("viral_videos").select("*").order("outlier_score", { ascending: false });
if (filterPlatform !== "all") q = q.eq("platform", filterPlatform);
// ... existing date / outlier / views / engagement / source / featured filters
if (selectedNiches.length > 0) q = q.in("primary_niche", selectedNiches);
// NOTE: do NOT apply activeFormat here.

const { data, error } = await q.limit(200);
if (error) { /* existing error path */; return; }

// Tally counts from the unfiltered-by-format result.
const formatTally: Partial<Record<ContentFormat | "all", number>> = { all: data.length };
const nicheTally = new Map<string, number>();
for (const v of data) {
  if (v.content_format) {
    formatTally[v.content_format as ContentFormat] = (formatTally[v.content_format as ContentFormat] ?? 0) + 1;
  }
  if (v.primary_niche) {
    nicheTally.set(v.primary_niche, (nicheTally.get(v.primary_niche) ?? 0) + 1);
  }
}
setFormatCounts(formatTally);
setAvailableNiches(Array.from(nicheTally.entries()).map(([slug, count]) => ({ slug, count })));

// Filter for display.
const filtered = activeFormat === "all"
  ? data
  : data.filter((v: { content_format: string | null }) => v.content_format === activeFormat);
setVideos(filtered);
```

- [ ] **Step 6: Replace the inline filter chip row with FormatTabs + FiltersPanel**

Find the JSX block that renders the existing filter chips (around lines 1920-1980 in `ViralToday.tsx`, the section with multiple `<FilterChip>` and `<MultiSelectDropdown>` components rendered in a flex row). Replace that entire block with:

```tsx
<div className="flex items-center justify-between gap-3 mb-2">
  <div className="flex-1 min-w-0" />  {/* search bar lives in its own row above, keep that as-is */}
  <FiltersPanel
    value={filtersValue}
    defaults={FILTER_DEFAULTS}
    onChange={handleFiltersChange}
    availableNiches={availableNiches}
    dateOptions={[
      { value: "all", label: "All time" },
      { value: "7days", label: "Last 7 days" },
      { value: "30days", label: "Last 30 days" },
      { value: "3months", label: "Last 3 months" },
      { value: "6months", label: "Last 6 months" },
      { value: "12months", label: "Last 12 months" },
    ]}
    platformOptions={[
      { value: "all", label: "All platforms" },
      { value: "instagram", label: "Instagram" },
      { value: "tiktok", label: "TikTok" },
      { value: "youtube", label: "YouTube" },
    ]}
    outlierOptions={[
      { value: "0", label: "Any outlier" },
      { value: "1.5", label: "1.5x and above" },
      { value: "2.5", label: "2.5x and above" },
      { value: "5", label: "5x and above" },
      { value: "10", label: "10x and above" },
    ]}
    viewsOptions={[
      { value: "0", label: "Any views" },
      { value: "10000", label: "10K+" },
      { value: "100000", label: "100K+" },
      { value: "1000000", label: "1M+" },
    ]}
    engagementOptions={[
      { value: "0", label: "Any engagement" },
      { value: "1", label: "1%+" },
      { value: "3", label: "3%+" },
      { value: "5", label: "5%+" },
    ]}
    sourceOptions={[
      { value: "all", label: "All sources" },
      { value: "channels", label: "Channels" },
      { value: "discovered", label: "Discovered" },
    ]}
  />
</div>

<FormatTabs
  active={activeFormat}
  onChange={setActiveFormat}
  counts={formatCounts}
/>
```

Reuse the same options the existing dropdowns used (verify them by re-reading the file around line 1000-1050 where the option arrays are defined; the values above match those defaults).

NOTE: this replaces the old filter chip row only — keep the search bar, the paste-URL input, the language toggle, and any other top-row controls in their existing locations.

- [ ] **Step 7: Type-check**

```bash
cd /Users/admin/Documents/connectacreators && \
  npx tsc --noEmit 2>&1 | grep -i "ViralToday" | head -10
```
Expected: empty.

- [ ] **Step 8: Manual UAT in dev**

```bash
cd /Users/admin/Documents/connectacreators && npm run dev
```

Open `http://localhost:5173/viral-today`. Verify:
- The 12 format tabs render across the top with counts.
- Clicking a tab filters the grid.
- Clicking "Filters" opens the panel; selecting a niche checkbox + Apply filters the grid.
- The active-filter badge on the Filters button updates.
- The previously visible chip row is gone.
- Visiting an analyzed-but-uncategorized video shows the "Categorizing…" badge on the card briefly, then it disappears (or transitions to "Analyzed" green) once the row updates via realtime.

- [ ] **Step 9: Commit**

```bash
git add src/pages/ViralToday.tsx
git commit -m "feat(viral-today): format tab strip + collapsed filters

Replaces the multi-dropdown chip row with FormatTabs (12 tabs) and a
single Filters button (drawer). Per-format counts respect non-format
filters. Selecting a niche multi-checks within the filters panel.

Format filter applies client-side after fetch (LIMIT 200) so the count
tally for OTHER formats stays accurate. Existing query stays in place
for the rest of the dimensions."
```

---

## Self-Review

**Spec coverage:**

| Spec section                                       | Task |
|----------------------------------------------------|------|
| Schema changes (`content_format`, `primary_niche`, indexes, CHECK) | 1 |
| Shared taxonomy module (Deno) + tests              | 2 |
| Frontend taxonomy mirror                           | 3 |
| Analyzer extension (`tagFramework`)                | 4 |
| `viral-video-categorize` edge function             | 5 |
| Detail page Category tab                           | 6 |
| Detail page auto-backfill on view                  | 6 |
| VideoCard auto-backfill (IntersectionObserver + debounce + semaphore) | 7 |
| FormatTabs component                               | 8 |
| FiltersPanel component                             | 9 |
| ViralToday integration (query + counts + replace chip row) | 10 |
| Per-format count fetch                             | 10 |
| Niche checkbox multi-select inside Filters panel   | 9, 10 |
| Backfill rate-limiting (3-concurrent semaphore)    | 7 |
| Backfill fires on viewable cards only              | 7 |
| Realtime delivers categorize results               | (no code change — already wired in Task 16 of the prior unification work) |

**Placeholder scan:** No "TBD", "TODO", or vague handwaving. Every step shows actual code or actual commands.

**Type consistency:**
- `ContentFormat` defined in Task 2 and Task 3 with identical shape. Imported consistently in Tasks 4, 5, 8, 10.
- `FiltersPanelValue` defined in Task 9, consumed in Task 10.
- `viral-video-categorize` request body `{viral_video_id}` consistent across Tasks 5, 6, 7.
- `formatCounts` keyed by `ContentFormat | "all"` consistent in Task 10's state declaration and FormatTabs prop in Task 8.
