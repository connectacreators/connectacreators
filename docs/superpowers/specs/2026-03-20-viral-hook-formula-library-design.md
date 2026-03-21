# Viral Hook Formula Library — Design Spec

## Problem

The Hook Generator canvas node currently generates hooks from scratch using AI with no reference material. This produces generic, unpredictable results. The user has a library of 1000+ proven viral hook formulas organized by category that should guide hook generation and be browsable.

## Solution

Three-part integration:

1. **Data layer** — TypeScript constants file with all 1000+ formulas
2. **AI-guided generation** — Edge function uses formulas as structural templates, with smart selection (best-fit for topic, no repeats)
3. **Browse/search UI** — Inline popover on the Hook Generator node for manually browsing and selecting formulas

---

## 1. Data Layer

**New file:** `src/data/viralHookFormulas.ts`

```ts
export interface HookFormula {
  category: string;
  template: string;
}

export const HOOK_CATEGORIES = [
  "educational",
  "comparison",
  "mythBusting",
  "storytelling",
  "random",
  "authority",
  "dayInTheLife",
] as const;

export type HookCategory = (typeof HOOK_CATEGORIES)[number];

export const HOOK_CATEGORY_LABELS: Record<HookCategory, string> = {
  educational: "Educational",
  comparison: "Comparison",
  mythBusting: "Myth Busting",
  storytelling: "Storytelling",
  random: "Random",
  authority: "Authority",
  dayInTheLife: "Day in the Life",
};

export const VIRAL_HOOK_FORMULAS: HookFormula[] = [
  // ~1000+ entries extracted from PDF
  { category: "educational", template: "Here's exactly how much (insert action) you need to (insert result)" },
  { category: "educational", template: "It took me 10 years to learn this but I'll teach it to you in less than 1 minute" },
  // ... all formulas
];

export function getFormulasByCategory(cat: HookCategory): HookFormula[] {
  return VIRAL_HOOK_FORMULAS.filter((f) => f.category === cat);
}
```

- All 1000+ formulas from the PDF, categorized into 7 groups
- **Frontend-only file** — imported by `HookGeneratorNode.tsx` for browsing
- The edge function **cannot** import from `src/` — it embeds a hardcoded curated subset (~70 formulas) directly in its prompt string
- Each formula is the template text with `(insert X)` placeholders preserved

---

## 2. AI-Guided Generation (Edge Function)

**Modified file:** `supabase/functions/ai-build-script/index.ts` — `generate-hooks` step

### Changes

- **Categories expanded** from 5 to 7 (add `mythBusting`, `dayInTheLife`)
- **Hardcoded curated subset** — ~10 formulas per category (~70 total) embedded directly in the prompt string (edge functions can't import from `src/`)
- **Smart formula selection** — single-prompt approach where AI picks the 3-7 best-fitting formulas for the topic rather than random selection
- **Anti-repetition** — frontend sends `previousHooks` array in the request body; edge function injects them into the prompt as "avoid these"
- **Flexible count** — tool schema allows 3-7 hooks (`minItems: 3, maxItems: 7`) so the AI doesn't force-fit formulas that don't match the topic

### Anti-Repetition Data Flow

1. **Frontend sends:** `{ step: "generate-hooks", topic, previousHooks: ["hook text 1", "hook text 2", ...] }`
2. **Edge function reads:** `body.previousHooks` and injects into prompt: `"Do NOT reuse these formula structures (already generated): \n- hook text 1\n- hook text 2\n..."`
3. **Edge function returns:** new hooks
4. **Frontend accumulates:** after receiving response, appends new hook texts to `previousHooks` via `onUpdate({ previousHooks: [...prev, ...newHookTexts] })`
5. **Cap at 20:** if `previousHooks.length > 20`, keep only the last 20 to avoid bloating the prompt

### Prompt Structure

```
You are a creative hook writer for short-form social media scripts.
Below are proven viral hook FORMULAS organized by category.
Choose the 5 that fit BEST for the given topic — only pick formulas
where the topic naturally fills the placeholders.
Do NOT force a formula that doesn't fit.
Each hook must use a DIFFERENT formula structure.

{Previously generated hooks to avoid, if any}

EDUCATIONAL:
- "Here's exactly how much (insert action) you need to (insert result)"
- "It took me 10 years to learn this but I'll teach it in under 1 minute"
...

COMPARISON:
- "This is an (insert noun), and this is an (insert noun)"
...

{7 categories, ~10 formulas each}

Topic: "{user topic}"

Pick the 3-7 best-fitting formulas and adapt them by filling in
the placeholders with topic-specific content. Only include formulas
that genuinely fit — do not force a formula just to reach a count.
```

### Tool Schema Update

```ts
hooks: {
  type: "array",
  items: {
    type: "object",
    properties: {
      category: {
        type: "string",
        enum: ["educational", "comparison", "mythBusting",
               "storytelling", "random", "authority", "dayInTheLife"]
      },
      text: { type: "string" },
    },
    required: ["category", "text"],
  },
  minItems: 3,
  maxItems: 7,
}
```

---

## 3. Browse/Search UI (Frontend)

**Modified file:** `src/components/canvas/HookGeneratorNode.tsx`

### Search Icon

- Small `Search` icon (lucide) placed to the left of the "Generate" button
- Same subtle styling as existing controls
- Click toggles open/closed the formula browser popover

### Popover Layout

```
┌─────────────────────────────────────┐
│ [Educational] [Comparison] [Myth..] │  ← category chips (horizontal scroll)
│ [Story] [Random] [Authority] [Day]  │
├─────────────────────────────────────┤
│ 🔍 Search formulas...               │  ← text filter
├─────────────────────────────────────┤
│ EDUCATIONAL                         │
│ ┌─────────────────────────────────┐ │
│ │ Here's exactly how much (insert │ │  ← clickable formula card
│ │ action) you need to (insert...  │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ It took me 10 years to learn... │ │
│ └─────────────────────────────────┘ │
│           ... scrollable ...        │
└─────────────────────────────────────┘
  ~320px wide, max-height ~350px
```

- **Category chips:** 7 pills, one active at a time, click to filter, click again to show all
- **Search input:** filters formulas by keyword across all categories
- **Formula cards:** compact, show template text + small category tag
- **Click behavior:** Client-side placeholder fill (no AI call, zero credits, instant):
  - If topic is entered → regex replaces `(insert ...)` placeholders with the topic text, adds as a hook result with a brief loading pulse on the card
  - If no topic → added as-is to selected hook (raw template)
  - No additional edge function step needed — this is purely client-side string manipulation

### Node Data Changes

```ts
interface HookGeneratorData {
  topic?: string;
  hooks?: Array<{ category: string; text: string }>;
  selectedHook?: string;
  selectedCategory?: string;
  previousHooks?: string[];  // NEW: tracks hooks across generations for anti-repetition
  onUpdate?: (updates: Partial<...>) => void;
  onDelete?: () => void;
  authToken?: string | null;
}
```

### Category Key Migration

Old keys (`randomInspo`, `authorityInspo`, `comparisonInspo`, `storytellingInspo`) exist in persisted canvas states. A `normalizeCategory()` utility maps old → new:

```ts
const CATEGORY_KEY_MAP: Record<string, string> = {
  randomInspo: "random",
  authorityInspo: "authority",
  comparisonInspo: "comparison",
  storytellingInspo: "storytelling",
};

function normalizeCategory(key: string): string {
  return CATEGORY_KEY_MAP[key] ?? key;
}
```

Called when loading persisted hooks from `canvas_states` and in `CATEGORY_LABELS` lookups. The edge function only returns new-style keys going forward.

### Category Labels Update

Expand `CATEGORY_LABELS` to 7 new-style keys:

```ts
const CATEGORY_LABELS: Record<string, string> = {
  educational: "Educational",
  random: "Random",
  authority: "Authority",
  comparison: "Comparison",
  storytelling: "Storytelling",
  mythBusting: "Myth Busting",
  dayInTheLife: "Day in the Life",
};
```

**Note:** `AIScriptWizard.tsx` has its own `HOOK_FORMATS` with old-style keys — not changed in this phase. Future consolidation task if needed.

---

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/data/viralHookFormulas.ts` | New | 1000+ formulas data + helpers |
| `supabase/functions/ai-build-script/index.ts` | Modify | Smart formula-guided generation |
| `src/components/canvas/HookGeneratorNode.tsx` | Modify | Browse popover + updated categories |

## Out of Scope

- No database table for formulas (constants file approach)
- No admin UI for editing formulas
- No analytics on which formulas perform best
- CTA Builder node unchanged
