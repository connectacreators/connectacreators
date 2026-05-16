# Viral Today Format Navigation + Category Detection — Design

**Status:** Approved 2026-05-15
**Owner:** @creatorsconnecta
**Implementation phase:** TBD (companion plan to follow)

## Problem

Viral Today currently exposes 7+ filter dropdowns at the top of the page (date, platform, outlier, views, engagement, source, featured) plus a channel multi-select. The chip row feels cluttered. There's no fast way to ask "show me only the Educational videos" or "show me only Reaction videos" — the only available facets are quantitative (outlier score, views) or production-source (platform, channel).

The system already classifies a primitive notion of video format via the `detect-video-format` edge function, but only into two categories (`CAPTION_VIDEO_MUSIC`, `TALKING_HEAD`) and only on demand during the wizard flow. Niche labels exist on each row (`framework_meta.niche_tags[]`) but they're free-form, never surfaced in navigation, and inconsistent (e.g., `"fitness"` vs `"fitness coaching"` vs `"pest control sales"`).

## Goal

Replace the cluttered filter chip row with **format-based navigation**: a horizontal tab strip of 11 canonical content formats. Add a **primary niche** field (controlled vocabulary, extensible by AI) so users can narrow by topic. Detect both during the existing analyze flow (no extra cost) and lazily backfill older rows. Surface format + niche on the detail page as a new `Category` tab.

## Non-goals

- Replacing the existing `detect-video-format` edge function. That serves a separate "format wizard" flow (`TALKING_HEAD` vs `CAPTION_VIDEO_MUSIC` for script generation) and stays untouched.
- Free-form niche editing by users. The taxonomy is AI-curated; manual editing is out of scope for v1.
- Per-format custom layouts on Viral Today (e.g., a different grid for "Funny" vs "Educational"). All formats render the same grid.
- Re-analyzing videos to get format/niche. Backfill uses cached transcript + visual segments only — no Whisper, no cobalt, no multimodal.

## Architecture

```
New analysis (50¢) ──┐                                  ┌── Filter UI (collapsed panel)
                      ├─► viral_videos row              │
Lazy backfill (free) ─┘    + content_format             │
                            + primary_niche             │
                                  │                     │
                                  ├──► Format tab strip (top of Viral Today)
                                  ├──► Niche checkbox multi-select (inside Filters panel)
                                  └──► Category tab (detail page)
```

Two columns added to `viral_videos`. One Haiku-only edge function for backfill. The existing `tagFramework` Haiku call extends its prompt to also return format + niche so new analyses get them for free.

## Format taxonomy (closed enum, 11 values)

Stored as snake_case slug in `viral_videos.content_format`. Display labels are derived client-side.

| Slug              | Label              | Description                                                |
|-------------------|--------------------|------------------------------------------------------------|
| `caption_post`    | Caption Post       | Text on screen + music, no spoken narration                |
| `storytelling`    | Storytelling       | Personal narrative, anecdote, origin story                 |
| `educational`     | Educational        | Teaches a concept or framework (theory > steps)            |
| `comparison`      | Comparison         | X vs Y, before/after, this vs that                         |
| `authority`       | Authority          | Strong stance, hot take, calls out a misconception         |
| `reaction`        | Reaction           | Responds to another video, trend, screenshot, or content   |
| `listicle`        | Listicle           | Enumerated structure: "Top 5", "X reasons why"             |
| `tutorial`        | Tutorial           | Procedural step-by-step instructions                       |
| `vlog`            | Vlog               | Personal lifestyle, day-in-the-life, behind-the-scenes     |
| `selling`         | Selling            | Product-focused, strong CTA, lead-gen                      |
| `funny`           | Funny              | Comedy-first, skit, parody, humor as primary purpose       |

Edge case: if Haiku genuinely can't classify (rare), it defaults to `caption_post` if `is_caption_style`, else `storytelling` (most common fallback). No `other` slug — we want every video assigned.

## Niche taxonomy (canonical-preferred, extensible)

Stored as snake_case slug in `viral_videos.primary_niche`. The seed list lives in a shared module; the column itself is just `TEXT` with no enum constraint. Haiku is instructed to prefer the seed list but may invent new slugs for genuinely out-of-vocabulary topics.

### Seed list (15 canonical)

`personal_branding`, `fitness`, `sales`, `real_estate`, `finance`, `ecommerce`, `coaching`, `saas_tech`, `beauty`, `food`, `mindset`, `relationships`, `education`, `lifestyle`, `parenting`

### Extensibility

The Haiku prompt explicitly tells the model: *"Strongly prefer one of these canonical labels. If the video clearly doesn't fit any (e.g., religion, gaming, comedy, politics, true_crime, art, music), output a new short snake_case label."*

No new table. The filter UI fetches:

```sql
SELECT primary_niche, COUNT(*) as cnt
  FROM viral_videos
  WHERE primary_niche IS NOT NULL
  GROUP BY primary_niche
  ORDER BY
    (primary_niche = ANY('{personal_branding,fitness,...}'::text[])) DESC,  -- canonical first
    cnt DESC,                                                                -- then by frequency
    primary_niche ASC                                                        -- alphabetic tiebreak
```

Auto-discovered niches naturally sort under the canonical 15 until they accumulate enough usage. If a single video is the only one in its niche, the filter still shows it (so the user can find it).

Display labels are derived from the slug: `religion` → "Religion", `personal_branding` → "Personal Branding", etc. (Simple `.split("_").map(capitalize).join(" ")` transformation.)

## Schema changes

Single migration:

```sql
ALTER TABLE viral_videos
  ADD COLUMN IF NOT EXISTS content_format TEXT,
  ADD COLUMN IF NOT EXISTS primary_niche  TEXT;

-- Constrain format to the 11 valid slugs (extensible if we add more in code).
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

-- Indexes for the new filter paths.
CREATE INDEX IF NOT EXISTS idx_viral_videos_format
  ON viral_videos (content_format)
  WHERE content_format IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_viral_videos_niche
  ON viral_videos (primary_niche)
  WHERE primary_niche IS NOT NULL;

-- Composite index covering the most common filter combination:
-- format selected + sort by outlier_score (the default Viral Today sort).
CREATE INDEX IF NOT EXISTS idx_viral_videos_format_outlier
  ON viral_videos (content_format, outlier_score DESC)
  WHERE content_format IS NOT NULL;
```

No constraint on `primary_niche` — open vocabulary by design.

## Shared taxonomy module

Both client and server need the canonical lists. New file `src/lib/video-taxonomy.ts` (frontend) with a Deno mirror at `supabase/functions/_shared/video-taxonomy.ts`.

```typescript
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

export const CANONICAL_NICHES = [
  "personal_branding", "fitness", "sales", "real_estate", "finance",
  "ecommerce", "coaching", "saas_tech", "beauty", "food",
  "mindset", "relationships", "education", "lifestyle", "parenting",
] as const;

export function nicheLabel(slug: string): string {
  return slug.split("_").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" ");
}
```

## Analyzer changes

### Path A — new analyses (free)

Extend `tagFramework` in `supabase/functions/_shared/viral-video-analyzer.ts`:

1. Add `content_format` + `primary_niche` to the `TagResult` interface.
2. Extend the Haiku prompt with two new instructions:

```
"content_format": "<exactly one of: caption_post, storytelling, educational, comparison, authority, reaction, listicle, tutorial, vlog, selling, funny. Pick the BEST single fit. If unsure between two, pick the one that describes the primary intent.>",
"primary_niche": "<the topic niche. Strongly prefer one of these canonical labels: personal_branding, fitness, sales, real_estate, finance, ecommerce, coaching, saas_tech, beauty, food, mindset, relationships, education, lifestyle, parenting. If the video clearly doesn't fit any (e.g., religion, gaming, comedy, politics, true_crime, art, music), output a new short snake_case slug. ONE niche only.>"
```

3. Bump `max_tokens` 800 → 1000 to accommodate the two extra fields.

4. Validate Haiku's `content_format` output against the 11-slug allowlist; fall back to `caption_post` (if `is_caption_style`) or `storytelling` if invalid.

5. `runFullAnalysis` writes `content_format` and `primary_niche` to the row UPDATE alongside `framework_meta`. (Note: these are top-level columns now, not nested under `framework_meta`.)

### Path B — backfill (free, lazy)

New edge function: `viral-video-categorize`.

```typescript
POST /viral-video-categorize { viral_video_id }

1. Auth: require user JWT (any user — no role gating).
2. Load row. Must have analysis_status='analyzed' AND a transcript OR framework_meta.visual_segments.
3. If row.content_format AND row.primary_niche are both already set → return 200 {cached: true, ...}.
4. Build a compact Haiku prompt using row.caption + row.transcript (first 2500 chars) + a few visual_segments.
5. Call Haiku claude-haiku-4-5-20251001, max_tokens 200, asking for JSON: {content_format, primary_niche}.
6. Validate content_format against the allowlist (fallback rules as above).
7. UPDATE viral_videos SET content_format=$, primary_niche=$ WHERE id=$.
8. Return 200 {content_format, primary_niche, cached: false}.
```

No credit deduction. Idempotent. ~200 tokens per call, ~$0.001 per video at Haiku rates.

### When the backfill fires

- **From a VideoCard on Viral Today:** when the card mounts and `row.content_format` is null AND `row.analysis_status === 'analyzed'`. Shows a tiny "categorizing…" badge in the bottom-right (replacing the existing "Analyzed" checkmark briefly). Result lands via the existing realtime subscription on the row.
- **From the ViralVideoDetail page:** same trigger pattern in the data-load effect. The Category tab shows "Categorizing…" until done.

Rate limiting: each card debounces 1500ms after mount before firing, and we batch-fire only the visible cards (IntersectionObserver — same pattern the page already uses for `onSeen`). This prevents 50 simultaneous Haiku calls when the grid first loads.

## Filter UX changes (Viral Today)

### Current state

Top of the page has these filter dropdowns rendered as inline chips:

```
[ Source: All ▾ ]  [ Date: 12 months ▾ ]  [ Platform: All ▾ ]  [ Outlier: 2.5x ▾ ]
[ Views: Any ▾ ]   [ Engagement: Any ▾ ]  [ ✓ Featured only ]   [ Clear ]
```

Plus the channel multi-select dropdown and the "Top Only" toggle. Cluttered.

### New state

**Row 1 — search + filter button (only thing always visible):**

```
[ search… ]                                                          [ Filters · 3 active ▾ ]
```

The "Filters" button shows a count badge when ≥1 filter is non-default. Click → opens a panel (popover dropdown or right-side drawer) containing all the existing filter dropdowns AND the new niche multi-select.

**Row 2 — format tab strip:**

```
All · Caption · Storytelling · Educational · Comparison · Authority · Reaction · Listicle · Tutorial · Vlog · Selling · Funny
```

- 12 tabs (All + 11 formats). On screens narrower than ~1100px, the trailing tabs collapse into a `More ▾` dropdown.
- Active tab gets the editorial underline (matching the existing tabs in the codebase — same component used in `ViralVideoDetail` if reasonable).
- Each tab includes a count next to the label (e.g., `Educational · 47`) so users can see at a glance which formats have content. Counts are fetched whenever the non-format filter state changes (date, platform, outlier, views, engagement, source, featured, niches, channels) via a single grouped query:

  ```sql
  SELECT content_format, COUNT(*) AS cnt
    FROM viral_videos
   WHERE <all non-format filters applied here>
   GROUP BY content_format
  ```

  The counts tell users: "if I pick this format, how many results would I get given my current other filters?" Counts do NOT include the currently-active format itself — choosing a format never reduces the visible counts on the other tabs.

**Filters panel content (when expanded):**

```
┌─ Filters ──────────────────────────────────────────────┐
│  Date           [ 12 months ▾ ]                        │
│  Platform       [ All ▾ ]                              │
│  Outlier        [ 2.5x and above ▾ ]                   │
│  Views          [ Any ▾ ]                              │
│  Engagement     [ Any ▾ ]                              │
│  Source         [ All ▾ ]                              │
│  Featured only  [ ☐ ]                                  │
│  Channels       [ Select channels ▾ ]                  │
│                                                        │
│  Niche                                                 │
│    ☐ Personal Branding (42)                            │
│    ☐ Fitness (38)                                      │
│    ☐ Sales (27)                                        │
│    ☐ Real Estate (19)                                  │
│    ☐ Religion (3)         ← auto-discovered            │
│    ☐ Gaming (2)           ← auto-discovered            │
│    [show all 21 niches]                                │
│                                                        │
│  [ Reset ]                              [ Apply ]      │
└────────────────────────────────────────────────────────┘
```

All existing filter dimensions live here: date, platform, outlier, views, engagement, source, featured-only toggle, channel multi-select, plus the new niche checkbox group. The "Top Only" toggle (currently rendered separately) joins this panel too. The Channels select preserves its existing multi-select behavior.

Defaults stay where they are today (`filterDate=12months`, `filterOutlier=2.5`, etc.). Reset returns to those defaults; Apply closes the panel and re-runs the query.

### Query integration

The existing `useEffect` that triggers the grid fetch (currently keyed on `[filterPlatform, filterDate, filterOutlier, filterViews, filterEngagement, user]`) gains two new dependencies: `activeFormat` and `selectedNiches` (array). The query builder adds:

```typescript
if (activeFormat !== "all") q = q.eq("content_format", activeFormat);
if (selectedNiches.length > 0) q = q.in("primary_niche", selectedNiches);
```

Sort order is unchanged (default outlier_score DESC).

### Filter active count

The "Filters · N active" badge counts how many filter dimensions differ from default. `selectedNiches.length > 0` counts as 1 regardless of how many niches are checked. Format tab is NOT counted (it's separate nav).

## Detail page changes

The right column tabs become:

```
Caption · Transcript · Visual Layout · Hook · Storytelling · Category
```

The new **Category** tab content:

```
Format            Educational
Niche             Fitness

Topics            personal training, transformation, mindset
```

- "Topics" is rendered from the existing `framework_meta.niche_tags[]` array as a chip cloud (read-only).
- If `content_format` or `primary_niche` is null (row pre-dates this work and hasn't been backfilled yet), the tab shows: "Categorizing… this takes a few seconds" with a Loader2 spinner. The categorize endpoint is fired the first time this tab is opened (or on page mount if user lands directly with no categorization).

## Error handling

| Failure                                       | Behavior                                                                         |
|-----------------------------------------------|----------------------------------------------------------------------------------|
| Haiku call fails during new analysis          | `tagFramework` already returns empty fields on failure — extend to also return empty format/niche. Row gets analyzed but uncategorized. The next time someone views it on Viral Today or Detail, the backfill endpoint retries. |
| Haiku call fails during backfill              | 500 returned. Caller can retry. Row stays uncategorized; appears under "Other" or excluded from format-tab counts depending on user choice (default: excluded — counted only in `All`). |
| Haiku returns invalid format slug             | Validator falls back to `caption_post` (if `is_caption_style`) or `storytelling`. |
| Haiku returns a wildly long niche slug        | Slice to 50 chars + lowercase + replace whitespace with `_`. Reject if empty.    |
| User selects a niche then format that excludes it | Both filters AND together; result may be empty. UI shows "No videos match" with a "Clear filters" CTA. |

## Backfill rate-limit and cost

If the user lands on Viral Today with a fresh DB of 500 analyzed-but-uncategorized rows, we don't want 500 parallel Haiku calls. Mitigations:

1. **IntersectionObserver-gated:** only fire for visible cards (existing pattern).
2. **Debounce 1500ms** after card mount (enough to scroll past noise).
3. **Max 3 concurrent in-flight per page session** — a small client-side semaphore.
4. **Realtime delivers result** — once cached on the row, the page UI updates without a re-fetch.

Cost ceiling at Haiku rates: ~$0.001 per video × 500 videos = $0.50 to backfill an entire grid view. Acceptable.

## Rollout

Single PR, three commits:

1. **Schema + shared taxonomy** — migration + `_shared/video-taxonomy.ts` (Deno) + `src/lib/video-taxonomy.ts` (frontend mirror). No behavior change.
2. **Analyzer + categorize endpoint** — extend `tagFramework`, redeploy `transcribe-video` / `analyze-viral-video-user` / `analyze-viral-video` (they share the analyzer module). New `viral-video-categorize` edge function.
3. **Frontend** — format tab strip, collapsed Filters panel, niche checkbox multi-select, VideoCard auto-backfill, new Category tab on ViralVideoDetail.

No feature flag. The change is strictly additive on the data layer. The UI replaces the old chip row but doesn't lose any filter dimensions — they all live in the new collapsed panel.

## Open questions resolved

| Question                                        | Decision                                                              |
|-------------------------------------------------|-----------------------------------------------------------------------|
| Format taxonomy                                 | 11 closed enum: caption_post, storytelling, educational, comparison, authority, reaction, listicle, tutorial, vlog, selling, funny |
| Niche taxonomy                                  | 15 seed canonical, AI may invent new slugs for OOV topics             |
| Format vs niche in nav                          | Format = primary tab strip. Niche = checkbox multi-select inside the collapsed Filters panel + a tab on detail page. |
| Detail-page tabs                                | Single new "Category" tab combining format + niche + topic chips      |
| Backfill strategy                               | Lazy free Haiku-only on view, IntersectionObserver-gated, max-3-concurrent semaphore |
| Should categorize charge credits                | No (0 credits) — it's $0.001 per video and runs invisibly             |
| Replace existing format_detection?              | No, keep it. Different purpose (script wizard format)                 |
| What happens to existing filter dropdowns       | All preserved inside the new collapsed Filters panel                  |
