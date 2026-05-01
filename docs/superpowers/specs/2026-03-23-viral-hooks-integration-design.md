# Viral Hooks Integration — Design Spec

## Overview

Replace the current 25 hardcoded hook templates in the AI Script Wizard (Step 3) with an AI-curated selection system drawing from 800+ viral hook formulas. The AI picks the 5 best hooks for the user's topic, the user chooses one, and a per-client+topic usage log prevents repetition.

## Goals

- Scale hook library from 25 to 800+ without overwhelming the user
- AI matches hooks to topic context so users always see relevant options
- Never repeat a hook for the same client+topic combination
- Preserve existing remix hook (vault video) functionality
- Keep the same visual language (cyan/teal, rounded cards, sticky bottom bar)
- Use real Lucide icons throughout — no emoji

## Non-Goals

- Admin UI for editing hooks (hooks are curated content, updated by code change)
- Hook analytics/popularity tracking
- Multi-language hook variants (hooks are formula templates, language-agnostic)

---

## Data Layer

### Static Hook File: `src/data/viralHooks.ts`

Parsed from "1,000 Viral Hooks (PBL).pdf". Each hook is a structured object:

```typescript
export interface ViralHook {
  id: string;           // stable ID, e.g. "edu-042"
  text: string;         // the hook formula template
  category: HookCategory;
}

export type HookCategory =
  | "educational"
  | "comparison"
  | "mythBusting"
  | "storytelling"
  | "random"
  | "authority"
  | "dayInTheLife";

export const VIRAL_HOOKS: ViralHook[] = [
  // ~800 entries parsed from PDF
];

// Lookup map for fast access by ID
export const HOOKS_BY_ID = Object.fromEntries(
  VIRAL_HOOKS.map(h => [h.id, h])
);

// Grouped by category for "Browse All" modal
export const HOOKS_BY_CATEGORY = VIRAL_HOOKS.reduce((acc, h) => {
  (acc[h.category] ??= []).push(h);
  return acc;
}, {} as Record<HookCategory, ViralHook[]>);
```

**Category distribution** (approximate from PDF):
- Educational: ~500+
- Storytelling: ~200+
- Myth Busting: ~30
- Comparison: ~25
- Authority: ~25
- Day in the Life: ~15
- Random: ~10

**Category metadata** updated in `AIScriptWizard.tsx` — replaces the old 5-category `HOOK_FORMATS` with 7 new categories. Uses Lucide icons:
- Educational: `BookOpen`
- Comparison: `ArrowLeftRight`
- Myth Busting: `ShieldX`
- Storytelling: `BookText`
- Random: `Shuffle`
- Authority: `Crown`
- Day in the Life: `Camera`

**Category rename mapping** (old → new):

| Old name (current code) | New name | Notes |
|---|---|---|
| `educational` | `educational` | Same |
| `comparisonInspo` | `comparison` | Shortened |
| `storytellingInspo` | `storytelling` | Shortened |
| `authorityInspo` | `authority` | Shortened |
| `randomInspo` | `random` | Shortened |
| _(new)_ | `mythBusting` | New from PDF |
| _(new)_ | `dayInTheLife` | New from PDF |

All references to the old names must be updated:
- `AIScriptWizard.tsx`: `HOOK_FORMATS` constant (removed), `inferHookCategory()` (removed)
- `ai-assistant/index.ts`: `HOOK_CATEGORIES` array (line 78-84), `select_hook` tool enum (line 118-129), `buildSystemPrompt` category descriptions (line 359-365)

### Anti-Repetition Table: `hook_usage`

```sql
CREATE TABLE hook_usage (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  topic text NOT NULL,
  hook_id text NOT NULL,
  used_at timestamptz DEFAULT now(),
  UNIQUE(client_id, topic, hook_id)
);

CREATE INDEX idx_hook_usage_lookup ON hook_usage(client_id, topic);

ALTER TABLE hook_usage ENABLE ROW LEVEL SECURITY;

-- Users can read/write hook_usage for clients they own
CREATE POLICY "Users manage own client hook usage"
  ON hook_usage FOR ALL
  USING (
    client_id IN (
      SELECT id FROM clients WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    client_id IN (
      SELECT id FROM clients WHERE user_id = auth.uid()
    )
  );
```

- **Topic normalization**: Always `topic.trim().toLowerCase()` before insert and query. Applied in both the edge function and the frontend insert. This ensures "5 Tips Para Crecer" and "5 tips para crecer" are treated as the same topic.
- `hook_id` references the static hook's `id` field
- `UNIQUE(client_id, topic, hook_id)` prevents duplicate rows — insert uses `ON CONFLICT DO NOTHING`
- `ON DELETE CASCADE` matches the existing schema convention for client foreign keys

---

## Edge Function: Hook Suggestion

### Dedicated Function: `supabase/functions/suggest-hooks/index.ts`

A **separate lightweight edge function** — not added to `ai-assistant`. Rationale: `ai-assistant` is a chat-based endpoint with message validation, credit deduction, and tool use. Hook suggestion is a simple ranking task that should be free (no credit cost) and has a completely different request shape.

### Request

```typescript
// POST body
{
  "topic": "5 tips para crecer en Instagram",
  "client_id": "uuid",
  "exclude_ids": []  // optional, for "Show 5 More"
}
```

Authentication: Bearer token (same as other functions). No credit deduction — this is a UX helper, not content generation.

### Logic

1. Import `VIRAL_HOOKS` array (bundled with the function at deploy time)
2. Query `hook_usage` for `(client_id, normalized_topic)` to get previously used hook IDs
3. Merge used IDs with `exclude_ids` (from "Show 5 More" requests)
4. Filter those out from the available pool
5. **Pre-filter by category relevance** to reduce token count:
   - Send topic + the 7 category names/descriptions to Claude Haiku
   - Ask it to pick the 3 most relevant categories for this topic
   - Filter the pool to only hooks in those 3 categories (~200-300 hooks instead of 800)
6. Send the filtered hooks + topic to Claude Haiku:
   - Prompt: "From this list of hook formulas, pick the 5 that best match the topic: [topic]. Consider relevance, engagement potential, and variety of styles. Return only the hook IDs as a JSON array."
   - Input: ~4-8K tokens (200-300 hooks instead of 800)
7. Return the 5 selected hooks with full metadata

### Response

```typescript
{
  "hooks": [
    { "id": "edu-042", "text": "Most people think...", "category": "educational" },
    // ... 4 more
  ]
}
```

### Edge Cases

- **All hooks used for this topic**: Reset — clear `hook_usage` for this client+topic and start fresh. Return a `reset: true` flag so the frontend can show a subtle note: "All hooks cycled — starting fresh selection."
- **Fewer than 5 available after filtering**: Return however many are available.
- **"Show 5 More" exhausts the pre-filtered pool**: Expand to all categories for the next batch.

### Cost

- **Category selection call**: ~200 input tokens + ~30 output tokens (negligible)
- **Hook ranking call**: ~4-8K input tokens + ~50 output tokens = ~$0.002 per call with Haiku
- **Per script**: 1-2 suggestion calls = ~$0.004
- **At 20 clients, ~50 scripts/month each**: ~$4/month additional AI cost
- **No credit deduction** — free for users

---

## Frontend: Redesigned Step 3

### State Changes in `AIScriptWizard.tsx`

New state variables:
```typescript
const [suggestedHooks, setSuggestedHooks] = useState<ViralHook[]>([]);
const [hookLoading, setHookLoading] = useState(false);
const [selectedHook, setSelectedHook] = useState<ViralHook | null>(null);
const [shownHookIds, setShownHookIds] = useState<string[]>([]);
const [showBrowseAll, setShowBrowseAll] = useState(false);
```

Removed state and constants:
- `expandedHookCategory` — no more accordion
- `selectedHookCategory` / `selectedTemplate` — replaced by `selectedHook`
- `HOOK_FORMATS` constant — replaced by `VIRAL_HOOKS` from data file
- `inferHookCategory()` — no longer needed

### Auto-Fetch on Step Entry

When Step 3 becomes active and topic is set, automatically call `suggest-hooks`:

```typescript
const hasFetchedForTopic = useRef<string | null>(null);

useEffect(() => {
  const normalizedTopic = topic?.trim().toLowerCase() ?? null;
  if (activeStep === 3 && normalizedTopic && hasFetchedForTopic.current !== normalizedTopic) {
    hasFetchedForTopic.current = normalizedTopic;
    fetchSuggestedHooks();
  }
}, [activeStep, topic]);
```

The ref stores which topic was fetched for. If the user goes back to Step 1 and changes the topic, returning to Step 3 triggers a fresh suggestion fetch. `fetchSuggestedHooks` should be wrapped in `useCallback` with stable deps to satisfy the exhaustive-deps lint rule.

### UI Layout

**Top section** (unchanged): Remix hook option if `initialTemplateVideo` exists.

**AI Suggestions section** (replaces accordion):

- Header: "Best hooks for [topic]" with Lucide `Sparkles` icon
- 5 hook cards in a vertical list:
  - Each card shows: numbered indicator (1-5), hook text in italics, category tag with Lucide icon + label
  - Selected card: cyan border, filled indicator, subtle glow
  - Unselected cards: muted border, outlined indicator
- Two action buttons below the cards:
  - "Show 5 More" (`RefreshCw` icon) — calls `suggest-hooks` with `exclude_ids` of all previously shown hook IDs
  - "Browse All" (`List` icon) — opens a filterable modal

**Loading state**: 5 skeleton cards with pulse animation while AI selects hooks.

**Sticky bottom bar** (unchanged behavior): Shows selected hook text + category, "Next: Choose Style" button.

### "Browse All" Modal

A dialog (shadcn `Dialog`) with:
- **Search input** at the top — filters hook text with 300ms debounce
- **Category filter row** — 7 chip buttons (Lucide icon + label), click to toggle filter. Multiple categories can be active.
- **Virtualized list** — uses a simple windowed approach: render only visible items + buffer. With search and category filtering active, the visible set is typically <100 items, so basic overflow-y-auto with max-height is sufficient. Full virtualization (react-window) is overkill here.
- **Each item** shows: hook text, category icon+label, "Used" badge if in `hook_usage` for current client+topic
- **Click to select** — sets `selectedHook`, closes modal. Does NOT record to `hook_usage` yet (only recorded on script generation).
- **"Show 5 More" history is preserved** — selecting from Browse All clears the shown hooks and resets the suggestion state.

### Payload to Script Generation

`handleGenerateScript()` maps the selected hook to the existing payload fields:

```typescript
// Explicit mapping from new ViralHook to existing payload shape
const hookCategory = selectedHook.category;   // new category name
const hookTemplate = selectedHook.text;        // hook formula text
```

These are sent as `hookCategory` and `hookTemplate` in the wizard state payload, same field names as today. The `ai-assistant` edge function receives and uses them at lines 267-287 and 297-299 — no changes needed to the script generation path itself.

After generation completes, record usage:
```typescript
const normalizedTopic = topic.trim().toLowerCase();
await supabase.from("hook_usage").insert({
  client_id: clientId,
  topic: normalizedTopic,
  hook_id: selectedHook.id,
}).onConflict("client_id,topic,hook_id").ignore();
```

---

## Updates to `ai-assistant/index.ts`

The `suggest-hooks` function is separate, but `ai-assistant` still needs category updates for the AI chat assistant flow (when users interact with the script wizard via chat):

1. **`HOOK_CATEGORIES` array** (line 78-84): Update to 7 new category names
2. **`select_hook` tool schema** (line 115-129): Update `category` enum from old 5 names to new 7 names
3. **`buildSystemPrompt` category descriptions** (line 359-365): Update descriptions for the 7 categories

These are string-level changes — no logic changes needed.

---

## Migration Plan

### What Changes

| File | Change |
|------|--------|
| `src/data/viralHooks.ts` | **New file** — 800+ hooks parsed from PDF with types and lookup maps |
| `src/components/AIScriptWizard.tsx` | Replace Step 3 UI (accordion → AI suggestions), remove `HOOK_FORMATS` and `inferHookCategory()`, update state, add fetch logic, add Browse All modal |
| `supabase/functions/suggest-hooks/index.ts` | **New function** — hook suggestion with category pre-filtering + Claude Haiku ranking |
| `supabase/functions/ai-assistant/index.ts` | Update `HOOK_CATEGORIES`, `select_hook` tool enum, and system prompt category descriptions to new 7 names |
| `supabase/migrations/XXXXXXXX_hook_usage.sql` | New table + index + RLS policy |

### What Stays the Same

- Steps 1, 2, 4, 5 — untouched
- Remix hook option — preserved as-is
- `handleGenerateScript()` payload field names — `hookCategory` + `hookTemplate` still sent
- `ai-assistant` script generation logic (lines 267-299) — receives hook the same way
- All other wizard functionality (vault templates, batch mode, etc.)

### Backwards Compatibility

- `HOOK_FORMATS` constant: removed entirely (only used in Step 3 UI)
- `inferHookCategory()`: removed (only used to map topic → category for the old accordion)
- Old category names (`randomInspo`, `authorityInspo`, etc.) replaced everywhere they appear
