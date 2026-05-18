# Analyze My Profile — Design

> Robby ("/ai") gains a deep profile-analysis flow that wraps the existing
> `analyze-audience-alignment` edge function, extends its output with hook
> patterns / format mix / cadence / outlier band, renders results as a
> structured embed card in chat, and gates competitor scraping behind a
> `propose_plan` confirm.

**Owner:** creatorsconnecta@gmail.com
**Date:** 2026-05-18
**Status:** Approved — ready for implementation plan

---

## Goal

Today, if a user asks Robby "analyze my profile @byrobertogauna and tell me my IG strategy," Robby has no tool to actually look at the profile. Best case he reads `client_strategies` and writes a generic answer from prior context. Worst case he hallucinates strategy advice with no data.

This spec adds a single Robby tool, `analyze_my_profile`, that:
1. Pulls the client's top 10 IG posts (top-by-views, via existing VPS scraper)
2. Runs an extended Claude analysis covering audience fit, uniqueness, hook patterns, format mix, posting cadence, and outlier band
3. Renders the output as a `ProfileAnalysisEmbed` card in chat plus a short prose framing
4. Persists structured findings into `client_strategies.audience_analysis` so future Robby answers have the context for free
5. Offers to also pull onboarded competitors (via existing `propose_plan` / `confirm_plan` flow) for a comparative analysis

## Non-goals

- TikTok / YouTube analysis (IG only in v1)
- Versioned analysis history (overwrites the existing `audience_analysis` payload)
- Auto-updating `onboarding_data.instagram` on handle mismatch
- Strategy page UI changes (output flows into existing `audience_analysis` field; the Strategy page already reads it)
- New analysis triggered from Super Canvas (Super Canvas's `CompetitorProfileNode` already does its own thing; we don't unify them in v1)

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  User: "analyze @byrobertogauna and tell me my IG strategy"          │
└─────────────────────────────────────┬────────────────────────────────┘
                                      ▼
┌──────────────────────────────────────────────────────────────────────┐
│  companion-chat (Claude tool-use loop)                               │
│   ├─ resolve @handle vs onboarding_data.instagram                    │
│   │    └─ mismatch → ask 3-pill question, halt                       │
│   ├─ call analyze_my_profile tool                                    │
│   │    └─ emits SSE scene: { tone: "video-analysis", verb: "Pulling  │
│   │       your top 10 posts...", meta: "fetch-profile-top-posts" }   │
│   └─ on result → respond_to_user with prose + ProfileAnalysisEmbed   │
└─────────────────────────────────────┬────────────────────────────────┘
                                      ▼
┌──────────────────────────────────────────────────────────────────────┐
│  analyze-audience-alignment (EXISTING, extended)                     │
│   1. fetch-profile-top-posts(handle, 10)   ← existing                │
│   2. if include_competitors: fetch-profile-top-posts(each comp, 10)  │
│   3. Claude analysis with EXTENDED prompt (see below)                │
│   4. UPSERT client_strategies.audience_analysis ← extended payload   │
└──────────────────────────────────────────────────────────────────────┘
```

### After Robby renders the first card

```
┌──────────────────────────────────────────────────────────────────────┐
│  Robby calls propose_plan({                                          │
│    summary: "Compare against 3 competitors from onboarding",         │
│    steps: ["Pull @comp1", "Pull @comp2", "Pull @comp3",              │
│             "Re-run analysis with comparison delta"]                 │
│  })                                                                  │
│   → Plan card renders with Approve / Reject                          │
└─────────────────────────────────────┬────────────────────────────────┘
                                      │ Approve
                                      ▼
┌──────────────────────────────────────────────────────────────────────┐
│  confirm_plan → analyze_my_profile({ include_competitors: true })    │
│   → second ProfileAnalysisEmbed with `comparison` section            │
└──────────────────────────────────────────────────────────────────────┘
```

## Components

### 1. New Robby tool: `analyze_my_profile`

Lives in `supabase/functions/companion-chat/tools/profile-analysis.ts` (new file). Registered in the tool list in `companion-chat/index.ts`.

**Schema:**

```ts
{
  name: "analyze_my_profile",
  description: "Pull the client's top 10 IG posts and run a deep analysis: audience fit, uniqueness, hook patterns, format mix, posting cadence, outlier band. Use when the user asks to analyze their profile, audit their account, or get strategy recommendations. If include_competitors=true, also pulls the emulation_profiles from onboarding and adds a comparison section. Always verify the handle matches onboarding_data.instagram first.",
  input_schema: {
    type: "object",
    properties: {
      client_name: { type: "string", description: "Optional. Defaults to the locked client for this thread." },
      handle: { type: "string", description: "Optional. IG @handle to analyze. Defaults to onboarding_data.instagram." },
      platform: { type: "string", enum: ["instagram"], description: "v1 = instagram only" },
      include_competitors: { type: "boolean", description: "When true, also pulls the client's emulation_profiles and produces a `comparison` section. Default false." }
    },
    required: ["platform"]
  }
}
```

**Handler logic:**

1. Resolve client via `lockedClient ?? lookupClient(client_name)`. If neither, return error to model: `"No client locked to this thread. Ask the user which client."`
2. Read `onboarding_data.instagram` and `onboarding_data.top3Profiles`.
3. Resolve target handle:
   - If `handle` argument provided AND it doesn't equal `onboarding_data.instagram`, return to the model a special status: `"handle_mismatch"` with both values. The system prompt instructs Robby to ask the 3-pill question (this is/new account/competitor) before re-calling.
   - Else use `onboarding_data.instagram`.
4. Invoke `analyze-audience-alignment` edge function with extended payload:
   ```json
   {
     "client_id": "...",
     "instagram_handle": "byrobertogauna",
     "include_competitors": false,
     "extended_dimensions": true
   }
   ```
5. Return the resulting `audience_analysis` JSON as the tool result. Robby composes a prose summary and emits a `profile-analysis` embed via SSE.

### 2. Extend `analyze-audience-alignment` edge function

Two new request fields:
- `extended_dimensions: boolean` (default false for backwards compat — Super Canvas still uses the existing call shape)
- `include_competitors: boolean` (already implied by `emulation_profiles` presence — make explicit so Robby can request a profile-only call first)

**Extended Claude prompt additions:**

Append to the existing audience-alignment prompt:

```
Also return these structured fields:

"hook_patterns": [
  { "pattern": "question-led", "frequency": 0.4, "example": "What if..." },
  { "pattern": "story-led",    "frequency": 0.6, "example": "Last week I..." }
],
"format_mix": { "reel": 0.2, "carousel": 0.8 },
"cadence":     { "posts_per_week": 2.3, "last_post_at": "2026-05-15" },
"outlier_band": { "median": 12000, "top": 50000, "top_post_id": "abc123" },
"top_posts":   [ { "id": "...", "thumbnail": "...", "views": 50000, "outlier_ratio": 4.2, "hook": "..." }, ... ]

If competitor data is included, ALSO return:
"comparison": {
  "cadence_delta_pct": -45,      // negative = posting less than competitors
  "format_mix_delta": { "reel": +0.5 },   // delta vs competitor average
  "common_winning_hooks": ["number-led", "controversy"],
  "where_youre_winning": "<1 sentence>",
  "where_theyre_winning": "<1 sentence>"
}
```

The function MUST upsert all new fields onto `client_strategies.audience_analysis` (single JSONB column — no schema migration needed).

### 3. New embed type: `profile-analysis`

**Files:**
- `src/lib/companion/turn-script.ts` — extend `EmbedRef` union with new `profile-analysis` variant
- `src/components/companion/embeds/ProfileAnalysisEmbed.tsx` — new component
- `src/components/companion/TurnRenderer.tsx` — register the new variant in `renderEmbed` switch
- `src/components/assistant/AssistantChat.tsx` — register the new variant in `renderEmbed` switch

**ProfileAnalysisEmbedData shape:**

```ts
interface ProfileAnalysisEmbedData {
  handle: string;
  platform: "instagram";
  profile_pic_url: string | null;
  followers: number | null;
  audience_score: number;       // 0-10
  uniqueness_score: number;     // 0-10
  summary: string;              // 2-3 sentence framing
  hook_patterns: Array<{ pattern: string; frequency: number; example?: string }>;
  format_mix: Record<string, number>;
  cadence: { posts_per_week: number; last_post_at: string };
  outlier_band: { median: number; top: number };
  top_posts: Array<{ id: string; thumbnail: string; views: number; outlier_ratio: number; hook: string }>;
  comparison?: {
    cadence_delta_pct: number;
    format_mix_delta: Record<string, number>;
    common_winning_hooks: string[];
    where_youre_winning: string;
    where_theyre_winning: string;
  };
}
```

**Visual layout (editorial style, matches existing VideoCardEmbed):**

```
┌──────────────────────────────────────────────────────────────────┐
│ [avatar] @byrobertogauna           Audience 7/10  Unique 4/10    │
│          12.3K followers                                          │
│                                                                   │
│   2.3 posts/wk · 80% carousel / 20% reel · 0.8× outlier band     │
│                                                                   │
│   Hook patterns                                                   │
│    ▸ Question-led (60%) — "What if..."                            │
│    ▸ Story-led (40%) — "Last week I..."                           │
│                                                                   │
│   Top 3 posts                                                     │
│    [9:16 thumb] [9:16 thumb] [9:16 thumb]                        │
│      4.2×          2.1×        1.8×                               │
│                                                                   │
│   ▼ vs competitors (only when comparison present)                 │
│   You're posting 45% less than your competitors. Their format    │
│   mix is reversed — 70% reels vs your 20%. Winning hooks they    │
│   share: number-led, controversy.                                 │
└──────────────────────────────────────────────────────────────────┘
```

- Honey/aqua accent colors per existing pattern (`hsl(var(--honey))`, `hsl(var(--aqua))`)
- Thumbnails click → swap to inline `ViralVideoPlayer` (same pattern as `VideoCardEmbed`)
- Card click → no nav (no detail page exists for a profile analysis)

### 4. Robby system-prompt additions

Add to `supabase/functions/companion-chat/system-prompt.ts` (or wherever the prompt lives):

```
PROFILE ANALYSIS RULES:

When the user asks to analyze their profile, audit their account, or get
strategy recommendations:

1. If their @handle is in the message, verify it matches the locked
   client's onboarding_data.instagram BEFORE calling any tool.

2. If the handle does NOT match, ASK first — do not scrape. Say:
   "That doesn't match the IG handle on {client_name}'s onboarding
   (@{onboarding_handle}). Is @{user_handle} (a) a new account for
   {client_name}, (b) a typo, or (c) a competitor you want analyzed?"

3. Call analyze_my_profile WITHOUT include_competitors first. Wait for
   the embed to render.

4. After the first analysis renders, if the client has emulation_profiles
   in onboarding, call propose_plan with summary "Compare against {N}
   competitors from onboarding" and steps listing each handle to pull.

5. On user approval (confirm_plan), call analyze_my_profile AGAIN with
   include_competitors=true. The second call returns a payload with a
   `comparison` section. Render a second ProfileAnalysisEmbed.

6. NEVER call analyze_my_profile without a locked client. Ask which
   client first.
```

### 5. Credit cost

Match Super Canvas's existing competitor-analyze pattern. Charge on each `analyze_my_profile` call:
- Profile-only: same cost as a single Super Canvas competitor analyze
- `include_competitors=true`: cost × (1 + competitor count)

Implementation: existing credit-deduction helpers in `supabase/functions/_shared/credits.ts` — add `analyze_my_profile` to the operation registry.

## Edge cases

- **No instagram handle in onboarding**: Robby returns `"This client has no IG handle on their onboarding profile. Add it first, then I can analyze."`
- **No emulation_profiles in onboarding**: Robby skips the propose_plan step. Output ends after the first embed with a note: "Add 3 competitor accounts to your onboarding to unlock comparative analysis."
- **VPS scrape fails on the user's handle**: edge function returns error, Robby surfaces it as text: "I couldn't reach the IG scraper just now — try again in a minute." No credit charge.
- **VPS scrape fails on one competitor mid-batch**: skip that competitor, surface a warning in the embed (`"Couldn't pull @comp2 — skipped"`), still charge for the ones that worked.
- **Private IG account**: VPS returns 0 posts. Edge function returns 422; Robby says: "@{handle} looks private — I can't pull their posts. Want to point me at a public account?"

## Persistence

Single JSONB column extension. The `audience_analysis` field on `client_strategies` is the source of truth. Future tool calls (e.g. `get_client_strategy`, `create_script`) read this field and get the structured data for free — no new reads to wire up.

Overwrite semantics: each `analyze_my_profile` call REPLACES the entire `audience_analysis` JSON. We do not maintain history in v1.

## Out-of-scope flags

Mark these in code as `// TODO(profile-analysis-v2):`
- TikTok / YouTube platform support (`platform` enum extension)
- Versioned history (new `profile_analyses` table)
- Auto-update `onboarding_data.instagram` on confirmed mismatch
- Reusing this flow from Super Canvas's `CompetitorProfileNode` (would unify the two analyze paths)

## Risk register

| Risk | Mitigation |
|------|------------|
| Extended Claude prompt produces malformed JSON for new fields | Same JSON-extraction fallback the function already has (`rawText.match(/\{[\s\S]*\}/)`). Add defensive defaults if a field is missing — never throw. |
| Competitor scrape sequence times out (3 × 60s) | Run scrapes in parallel via `Promise.allSettled`. Function timeout already covers this. |
| `propose_plan` doesn't re-trigger the tool correctly on approval | Existing `propose_plan` / `confirm_plan` flow is proven for other Robby tools (verify against `create_script` flow during implementation). |
| User reaction to "this took 2 min" | propose_plan card already shows the step count; UX is explicit. Add a `scanning` scene during execution so it's not silent. |
| Double-charging on retry | Idempotency: store an `analyze_in_flight` flag on `client_strategies` for the duration of the call. Reject duplicate calls. |

## Open questions punted to implementation

- Exact threshold for the outlier_band median calculation (use `views / median(views) >= 2` as outlier threshold, copy from existing viral_videos logic).
- Whether `client_strategies.audience_analyzed_at` should also be bumped (yes — single source of truth for "when did we last look at this").
