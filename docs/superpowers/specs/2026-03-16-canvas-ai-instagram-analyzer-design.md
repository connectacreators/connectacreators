# Canvas AI Improvements + Instagram Profile Analyzer — Design Spec

**Date:** 2026-03-16
**Status:** Revised v2

---

## 1. Problem

The Super Planning Canvas AI assistant produces scripts that sometimes contain corporate jargon, em dashes, and unclear story flow. It also lacks checks for TAM size, reloop moments, and template fidelity. Additionally, users need a way to analyze a competitor's top-performing Instagram posts directly on the canvas and compare that strategy to their client's content plan.

---

## 2. Goals

1. Improve AI script quality — eliminate jargon, em dashes, and add explicit quality checks (TAM, reloop, template fidelity, story clarity, audience match)
2. Add an Instagram Profile Analyzer node so users can paste a competitor's profile URL, fetch their top 10 posts (ranked by views), and have the AI surface strategic insights
3. Feed competitor insights into canvas context so the "Generate Script" flow can reference proven patterns from the space

---

## 3. Scope

### In scope
- Prompt improvements to `ai-assistant` (canvas mode) and `ai-build-script` (canvas-generate step)
- New `InstagramProfileNode` canvas component
- New `fetch-instagram-top-posts` Supabase edge function
- New `analyze-competitor-post` step in `ai-build-script`
- Canvas context wiring for competitor data
- Updated quick chips in `CanvasAIPanel` with chip-to-prompt expansion
- `hasContext` guard updated so competitor-only canvas enables Generate Script
- Toolbar button for the new node

### Out of scope
- Storing competitor analysis in the database (in-memory canvas only)
- Analyzing TikTok profiles (Instagram only for now)
- Changing the existing script wizard flow

---

## 4. Architecture

### 4.1 New Edge Function — `fetch-instagram-top-posts`

- **Input:** `{ profileUrl: string, limit?: number }` (default limit: 50)
- **Actor:** `apify~instagram-profile-scraper` — dedicated profile scraper, **not** the `instagram-reel-scraper` used by `scrape-channel`
- **Endpoint:** `POST https://api.apify.com/v2/acts/apify~instagram-profile-scraper/runs?token=apify_api_XcMx5KAjTPY1wBow3wgTaA3Y4wdiwL0MbbI2&waitForFinish=30`
- **Input body:** `{ "usernames": [username], "resultsLimit": 50 }`
- **Field mapping** (defensive, with fallbacks for both actor schemas):
  - views: `videoViewCount ?? videoPlayCount ?? playsCount ?? viewCount ?? 0`
  - likes: `likesCount ?? diggCount ?? likes ?? 0`
  - comments: `commentsCount ?? commentCount ?? comments ?? 0`
  - videoId: `shortCode ?? id ?? pk ?? videoId ?? ""`
  - caption: `(caption ?? captionText ?? text ?? desc ?? "").slice(0, 600)`
  - thumbnail: `displayUrl ?? thumbnailUrl ?? coverUrl ?? previewUrl ?? null`
  - timestamp: parse `timestamp ?? taken_at_timestamp ?? createTime` (unix seconds or ISO)
  - url: `https://www.instagram.com/reel/{shortCode}/` if shortCode exists, else `https://www.instagram.com/p/{id}/`
- **Polling strategy:** `waitForFinish=30`. If still `RUNNING`, one additional poll after 15s. If still running, return partial dataset items (graceful degradation).
- **Post-processing:**
  1. Filter items with no views and no videoId
  2. Calculate `outlier_score = views / avgViews * 10` relative to the fetched set
  3. Sort by views descending, return top 10
- **No DB writes** — pure in-memory response
- **Auth:** `verify_jwt = true`
- **Credits:** 0 (free)
- **`supabase/config.toml` entry:**
  ```toml
  [functions.fetch-instagram-top-posts]
  verify_jwt = true
  ```

### 4.2 New Step — `analyze-competitor-post` in `ai-build-script`

- **Input:** `{ caption, views, engagement_rate, outlier_score }`
- **Output:** `{ hook_type, content_theme, why_it_worked, pattern }`
- **hook_type enum:** `educational | authority | story | comparison | shock | random`
- **Model:** `claude-haiku-4-5`
- **Credits:** 0 (add `"analyze-competitor-post": 0` to `CREDIT_COSTS`)
- **Triggered from frontend:** when user clicks a post row in `InstagramProfileNode` and the post's `hookType` is not yet populated

### 4.3 New Component — `InstagramProfileNode`

**States:** `idle → loading → done | error`

**Node data shape:**
```typescript
interface CompetitorPost {
  rank: number; caption: string; views: number; likes: number;
  comments: number; engagement_rate: number; outlier_score: number;
  posted_at: string; url: string;
  hookType?: string; contentTheme?: string; whyItWorked?: string; pattern?: string;
}
interface InstagramProfileNodeData {
  profileUrl: string; username: string | null; posts: CompetitorPost[];
  selectedPostIndex: number | null; aiInsight: string | null;
  status: "idle" | "loading" | "done" | "error"; errorMessage: string | null;
  onUpdate: (u: Partial<InstagramProfileNodeData>) => void;
  onDelete: () => void; authToken: string | null;
}
```

**Done state layout:**
```
┌─────────────────────────────────────┐
│ IG  Competitor Analysis             │
│     @username                       │
├──────────────────┬──────────────────┤
│ TOP POSTS (40%)  │ AI INSIGHT (60%) │
│ #1 · 8.4x  ────►│ Hook: Authority  │
│ #2 · 6.2x        │ Pattern: ...     │
│ #3 · 4.7x        │ Why it worked:.. │
│ ...              │ [Compare →]      │
└──────────────────┴──────────────────┘
```

- Post row click → calls `analyze-competitor-post` step if not yet analyzed → fills right panel
- "Compare to client →" button pre-fills canvas AI input
- **Initial width:** 480px
- **Handles:** left (target) + right (source) for edge connections

**Canvas context contribution** (when `status === "done"` and connected to AI node):
```
COMPETITOR ANALYSIS (@username):
- Top hook patterns: [list from hookType fields]
- Top content themes: [list from contentTheme fields]
- Best post: "[caption snippet]" — Nx outlier, Mviews
- Date range: YYYY-MM-DD – YYYY-MM-DD
```

### 4.4 Canvas Context Updates

**`CanvasContext` interface** (`CanvasAIPanel.tsx` line 81):
```typescript
competitor_profiles?: Array<{
  username: string;
  top_posts: any[];
  hook_patterns: string[];
  content_themes: string[];
}> | null;
```

**`hasContext` guard** — updated to also return `true` when `competitor_profiles.length > 0`.

**`canvas-generate` prompt** — new `<competitor_analysis>` block injected after `${clientSection}`.

---

## 5. AI Prompt Improvements

### 5.1 Canvas Chat (`ai-assistant/buildCanvasSystemPrompt`)

Added at end of returned prompt:
- **Writing style rules:** no em dashes, no corporate jargon (explicit banned word list), plain English, one sentence per line
- **5 quality checks** the AI runs before every script suggestion: TAM, reloop, template fidelity, audience match, story clarity
- Direct feedback style: "The hook assumes the viewer already knows what X is — they probably do not."

### 5.2 Canvas Generate (`ai-build-script/canvasSystemPrompt`)

- **`<style_guide>` expanded:** explicit em dash ban, explicit jargon ban with word list, "14-year-old test"
- **`<quality_checklist>` block added** (7 items) before the virality_score instruction
- **Virality score** updated to also average `template_fidelity` and `story_clarity`
- **`<competitor_analysis>` block** injected when `competitor_profiles` is present in request body

---

## 6. Quick Chips Update

**New chips:** `Suggest a hook | Make it punchy | Shorten it | Check my TAM | Does it reloop? | Is story clear?`

**Chip-to-prompt expansion map** in `sendMessage`:
- `"Check my TAM"` → detailed TAM analysis prompt asking for specific audience size and breadth
- `"Does it reloop?"` → rehook assessment prompt, asks for exact location and suggestion if missing
- `"Is story clear?"` → hook→body→CTA flow analysis, flags gaps and assumed knowledge

"Translate to Spanish" removed from chips (still accessible via text input).

---

## 7. Toolbar Update

Add `UserSearch` button (lucide-react v0.462 — confirmed available) to center pill in `CanvasToolbar`:
- **Title:** "Add Competitor Profile"
- **Color:** pink/red hover (`hover:text-[#f43f5e]`) matching Instagram brand
- **Calls:** `onAddNode("instagramProfileNode")`
- **`onAddNode` prop type union** updated in both `CanvasToolbar.tsx` and `SuperPlanningCanvas.tsx` `addNode` callback

---

## 8. Files Changed

| File | Change |
|------|--------|
| `supabase/functions/fetch-instagram-top-posts/index.ts` | **New** — Apify `instagram-profile-scraper` fetch + defensive field mapping + sort |
| `supabase/functions/ai-build-script/index.ts` | Add `analyze-competitor-post` step (free), expand `canvasSystemPrompt` style guide + quality checklist + virality score criteria, add `<competitor_analysis>` block to `canvas-generate` |
| `supabase/functions/ai-assistant/index.ts` | Expand `buildCanvasSystemPrompt` with writing rules + 5 quality checks |
| `src/components/canvas/InstagramProfileNode.tsx` | **New** — competitor analysis node, split layout, Apify fetch, inline AI insight |
| `src/components/canvas/CanvasAIPanel.tsx` | `CanvasContext` interface, `hasContext` guard, quick chips, chip-to-prompt expansion, competitor context in `sendMessage` and `generateScript` |
| `src/components/canvas/CanvasToolbar.tsx` | `onAddNode` type union + `UserSearch` import + new button |
| `src/pages/SuperPlanningCanvas.tsx` | Import + register `instagramProfileNode`, `addNode` union + width case, `canvasContext` useMemo competitor extraction |
| `supabase/config.toml` | Add `[functions.fetch-instagram-top-posts]` entry |

---

## 9. Verification

1. Add competitor node → paste Instagram profile URL → "Fetch & Analyze" → top 10 posts appear ranked by views with outlier scores
2. Click post row → right panel fills with hook type, pattern, "why it worked" (~2s)
3. Connect competitor node to AI assistant → canvas chat references `@username`'s patterns
4. "Generate Script" with competitor node connected → generated script references competitor hook patterns as inspiration
5. Canvas chat responses: no em dashes, no jargon
6. "Check my TAM" → specific TAM analysis. "Does it reloop?" → rehook check. "Is story clear?" → flow analysis
7. With only a competitor node connected, "Generate Script" button is enabled
8. `npm run build` passes with no TypeScript errors
9. Deploy: `npx supabase functions deploy fetch-instagram-top-posts && npx supabase functions deploy ai-build-script && npx supabase functions deploy ai-assistant`
