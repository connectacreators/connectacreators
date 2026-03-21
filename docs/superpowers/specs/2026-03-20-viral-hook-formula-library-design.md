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
- Exported for use by both frontend (browsing) and edge function (embedded copy)
- Each formula is the template text with `(insert X)` placeholders preserved

---

## 2. AI-Guided Generation (Edge Function)

**Modified file:** `supabase/functions/ai-build-script/index.ts` — `generate-hooks` step

### Changes

- **Categories expanded** from 5 to 7 (add `mythBusting`, `dayInTheLife`)
- **Embed ~10 formulas per category** (~70 total) in the system prompt as structural templates
- **Smart formula selection** — single-prompt approach where AI picks the 5 best-fitting formulas for the topic rather than random selection
- **Anti-repetition** — pass previously generated hooks so the AI avoids reusing the same formula structures

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

Pick the 5 best-fitting formulas and adapt them by filling in
the placeholders with topic-specific content.
```

### Tool Schema Update

```ts
category: {
  type: "string",
  enum: ["educational", "comparison", "mythBusting",
         "storytelling", "random", "authority", "dayInTheLife"]
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
- **Click behavior:**
  - If topic is entered → AI fills placeholders and adds as hook result
  - If no topic → added as-is to selected hook (raw template)

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

### Category Labels Update

Expand `CATEGORY_LABELS` from 5 → 7:

```ts
const CATEGORY_LABELS: Record<string, string> = {
  educational: "Educational",
  randomInspo: "Random",        // keep old key for backward compat
  random: "Random",
  authorityInspo: "Authority",  // keep old key for backward compat
  authority: "Authority",
  comparisonInspo: "Comparison", // keep old key for backward compat
  comparison: "Comparison",
  storytellingInspo: "Story",   // keep old key for backward compat
  storytelling: "Storytelling",
  mythBusting: "Myth Busting",
  dayInTheLife: "Day in the Life",
};
```

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
