# Viral Hook Formula Library — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate 1000+ proven viral hook formulas into the Hook Generator canvas node — both as AI generation templates and a browsable formula library.

**Architecture:** Three-layer approach: (1) TypeScript constants file with all formulas for frontend browsing, (2) curated subset of ~70 formulas hardcoded in the edge function prompt for AI-guided generation with smart selection + anti-repetition, (3) inline popover UI on the Hook Generator node with category chips and text search.

**Tech Stack:** React (Vite), Supabase Edge Functions (Deno), Claude Haiku API, Tailwind CSS, lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-03-20-viral-hook-formula-library-design.md`

---

## Deployment Note

**Tasks 2, 3, and 4 MUST deploy together** in a single VPS build. The edge function (Task 2) returns new-style category keys (`comparison` instead of `comparisonInspo`). The old frontend doesn't know these keys, so deploying the edge function alone would show raw category strings instead of labels. Build order: Task 1 → Task 3 → Task 4 → Task 2 → Task 5 (deploy all at once).

---

## Task 1: Create Formula Data File

**Files:**
- Create: `src/data/viralHookFormulas.ts` (ensure `src/data/` directory exists — `mkdir -p src/data`)

This is the largest task — extracting all 1000+ formulas from the PDF into a typed TypeScript file. **Expected file size: ~2000-4000 lines.** The PDF "1000 Viral Hooks (PBL).pdf" must be uploaded/available for the implementer to extract every formula across all 63 pages.

- [ ] **Step 1: Create the data file with types, categories, and helpers**

```ts
// src/data/viralHookFormulas.ts

export interface HookFormula {
  category: HookCategory;
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
  // ─── EDUCATIONAL ───
  { category: "educational", template: "Here's exactly how much (insert action/item) you need to (insert result)" },
  { category: "educational", template: "It took me 10 years to learn this but I'll teach it to you in less than 1 minute" },
  // ... all educational formulas from PDF

  // ─── COMPARISON ───
  { category: "comparison", template: "This is an (insert noun), and this is an (insert noun)" },
  { category: "comparison", template: "For this (insert item) you could have all of these (insert item)" },
  // ... all comparison formulas from PDF

  // ─── MYTH BUSTING ───
  { category: "mythBusting", template: "This is why doing (insert action) makes you (insert pain point)" },
  { category: "mythBusting", template: "Stop using (insert item) for (insert result)" },
  // ... all myth busting formulas from PDF

  // ─── STORYTELLING ───
  { category: "storytelling", template: "I started my (insert business) when I was (insert age) with (insert $)" },
  { category: "storytelling", template: "X years ago my (insert person) told me (insert quote)" },
  // ... all storytelling formulas from PDF

  // ─── RANDOM ───
  // ... all random formulas from PDF

  // ─── AUTHORITY ───
  { category: "authority", template: "My (insert before state) used to look like this and now they look like this" },
  { category: "authority", template: "10 YEARS it took me from (insert before state) to (insert after state)" },
  // ... all authority formulas from PDF

  // ─── DAY IN THE LIFE ───
  { category: "dayInTheLife", template: "We all have the same 24 hours in a day so here I am putting my 24 hours to work" },
  // ... all day in the life formulas from PDF
];

export function getFormulasByCategory(cat: HookCategory): HookFormula[] {
  return VIRAL_HOOK_FORMULAS.filter((f) => f.category === cat);
}
```

**Important:** The user must re-upload the PDF "1000 Viral Hooks (PBL).pdf" so the implementer can extract every formula. All 63 pages must be read and every hook template entered as an array entry. Preserve `(insert X)` placeholder syntax exactly.

- [ ] **Step 2: Verify the file compiles**

Run: `npx tsc --noEmit src/data/viralHookFormulas.ts` or check that `npx vite build` succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/data/viralHookFormulas.ts
git commit -m "feat: add 1000+ viral hook formula data file"
```

---

## Task 2: Update Edge Function — Formula-Guided Generation

**Files:**
- Modify: `supabase/functions/ai-build-script/index.ts` (lines 1202-1255, the `generate-hooks` block)

- [ ] **Step 1: Replace the `generate-hooks` block**

Replace the existing block (lines 1202-1255) with the new formula-guided version. The full replacement code:

```ts
    // ─── Step: generate-hooks ───
    if (step === "generate-hooks") {
      const { topic, previousHooks } = body;
      if (!topic?.trim()) return errorResponse("topic is required for generate-hooks");

      // Curated subset of ~70 proven viral hook formulas (10 per category)
      const FORMULA_BANK = `
EDUCATIONAL:
- "Here's exactly how much (insert action/item) you need to (insert result)"
- "It took me 10 years to learn this but I'll teach it to you in less than 1 minute"
- "(Insert number) things I wish I knew before (insert action)"
- "Stop (insert action) if you want to (insert result)"
- "The real reason why (insert topic) is (insert revelation)"
- "Most people don't know this about (insert topic)"
- "I tested (insert thing) for (insert time) — here's what happened"
- "The biggest mistake people make with (insert topic)"
- "Why (insert common belief) is actually wrong"
- "Here's a hack for (insert topic) that actually works"

COMPARISON:
- "This is an (insert noun), and this is an (insert noun)"
- "For this (insert item) you could have all of these (insert item)"
- "(Insert option A) vs (insert option B) — which is actually better?"
- "What (insert $) gets you at (insert place A) vs (insert place B)"
- "I compared (insert thing A) and (insert thing B) so you don't have to"
- "Everyone chooses (insert option A) but (insert option B) is actually better"
- "The difference between (insert level A) and (insert level B)"
- "What most people use vs what professionals use for (insert topic)"
- "I tried the cheap version vs the expensive version of (insert item)"
- "(Insert thing) then vs now — the difference is insane"

MYTH BUSTING:
- "This is why doing (insert action) makes you (insert pain point)"
- "Stop using (insert item) for (insert result)"
- "Everything you've been told about (insert topic) is wrong"
- "No, (insert common advice) does NOT (insert claimed result)"
- "(Insert popular thing) is actually ruining your (insert area)"
- "The (insert topic) industry doesn't want you to know this"
- "I used to believe (insert myth) until I discovered (insert truth)"
- "Why (insert popular advice) is the worst thing you can do"
- "3 (insert topic) myths that are costing you (insert consequence)"
- "If you're still (insert action), you need to hear this"

STORYTELLING:
- "I started my (insert business) when I was (insert age) with (insert $)"
- "X years ago my (insert person) told me (insert quote)"
- "I was (insert bad situation) until I discovered (insert solution)"
- "Nobody believed me when I said (insert claim) — here's what happened"
- "The moment that changed everything for my (insert area)"
- "I almost gave up on (insert goal) but then (insert turning point)"
- "Here's the story of how I went from (insert before) to (insert after)"
- "My (insert person) thought I was crazy when I (insert action)"
- "The worst advice I ever received about (insert topic)"
- "I failed at (insert thing) (insert number) times before this worked"

RANDOM:
- "POV: you're a (insert role) and (insert scenario)"
- "Things that just hit different when (insert situation)"
- "Tell me you're a (insert identity) without telling me you're a (insert identity)"
- "Nobody talks about (insert topic) and it shows"
- "This is your sign to (insert action)"
- "Unpopular opinion: (insert hot take about topic)"
- "If (insert topic) was a person, they'd be (insert comparison)"
- "Day (insert number) of (insert challenge) until (insert goal)"
- "Ranking (insert things) from worst to best"
- "Watch this before you (insert action)"

AUTHORITY:
- "My (insert before state) used to look like this and now they look like this"
- "10 YEARS it took me from (insert before state) to (insert after state)"
- "After (insert number) years of (insert expertise), here's my honest advice"
- "I've (insert credential/achievement) — here's what nobody tells you"
- "As a (insert profession) for (insert years), this is what I recommend"
- "I've helped (insert number) people (insert result) — this is the #1 thing that works"
- "Most (insert professionals) won't tell you this"
- "After working with (insert number)+ clients, I can tell you (insert insight)"
- "The advice I give to every (insert audience) who (insert situation)"
- "I built a (insert achievement) by doing this one thing differently"

DAY IN THE LIFE:
- "We all have the same 24 hours in a day so here I am putting my 24 hours to work"
- "A day in the life of a (insert profession) in (insert location)"
- "What a (insert $amount/timeframe) day looks like as a (insert profession)"
- "Come to work with me as a (insert profession)"
- "How I spend my mornings as a (insert profession)"
- "Behind the scenes of running a (insert business/practice)"
- "What most people don't see about being a (insert profession)"
- "5 AM to 10 PM — a realistic day in my life as a (insert profession)"
- "The part of my job nobody talks about"
- "This is what (insert time period) of hard work actually looks like"
`;

      // Build anti-repetition clause
      let avoidClause = "";
      if (Array.isArray(previousHooks) && previousHooks.length > 0) {
        const capped = previousHooks.slice(-20);
        avoidClause = `\n\nIMPORTANT — Do NOT reuse these formula structures (already generated):\n${capped.map(h => `- "${h}"`).join("\n")}\n`;
      }

      const hooksSystem = `You are a creative hook writer for short-form social media scripts.
Below are proven viral hook FORMULAS organized by category. Choose the ones that fit BEST for the given topic — only pick formulas where the topic naturally fills the placeholders. Do NOT force a formula that doesn't fit. Each hook must use a DIFFERENT formula structure.${avoidClause}

${FORMULA_BANK}

Return a JSON tool call only — no prose.`;

      const hooksUserPrompt = `Topic: "${topic}"

Pick the 3-7 best-fitting formulas from the bank above and adapt them by filling in the placeholders with topic-specific content. Only include formulas that genuinely fit — do not force a formula just to reach a count.`;

      const hooksTools = [{
        name: "return_hooks",
        description: "Return 3-7 hooks based on proven viral formulas",
        input_schema: {
          type: "object",
          properties: {
            hooks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  category: { type: "string", enum: ["educational", "comparison", "mythBusting", "storytelling", "random", "authority", "dayInTheLife"] },
                  text: { type: "string" },
                },
                required: ["category", "text"],
              },
              minItems: 3,
              maxItems: 7,
            },
          },
          required: ["hooks"],
        },
      }];

      const hooksData = await callClaude(
        ANTHROPIC_API_KEY,
        hooksSystem,
        hooksUserPrompt,
        hooksTools,
        { type: "tool", name: "return_hooks" },
        "claude-haiku-4-5-20251001",
      );

      const hookToolUse = hooksData.content?.find((b: any) => b.type === "tool_use");
      if (!hookToolUse) return errorResponse("Failed to generate hooks");
      const hooksResult = hookToolUse.input as { hooks: Array<{ category: string; text: string }> };

      return new Response(JSON.stringify({ hooks: hooksResult.hooks }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
```

- [ ] **Step 2: Verify the edge function has no syntax errors**

Run: `cd supabase/functions/ai-build-script && deno check index.ts` (or just verify the Supabase deploy succeeds)

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/ai-build-script/index.ts
git commit -m "feat: formula-guided hook generation with anti-repetition"
```

---

## Task 3: Update HookGeneratorNode — Category Migration + Anti-Repetition

**Files:**
- Modify: `src/components/canvas/HookGeneratorNode.tsx`

This task updates the node's data flow — new categories, `normalizeCategory()`, and `previousHooks` accumulation. No UI changes yet.

- [ ] **Step 1: Update category labels and add normalizeCategory**

At the top of the file, replace `CATEGORY_LABELS` (lines 17-23) with:

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

- [ ] **Step 2: Add `previousHooks` to interface and update `generate()`**

Update the `HookGeneratorData` interface (lines 7-15) to include:

```ts
interface HookGeneratorData {
  topic?: string;
  hooks?: Array<{ category: string; text: string }>;
  selectedHook?: string;
  selectedCategory?: string;
  previousHooks?: string[];
  onUpdate?: (updates: Partial<Omit<HookGeneratorData, "onUpdate" | "onDelete">>) => void;
  onDelete?: () => void;
  authToken?: string | null;
}
```

Update the `generate()` function to send `previousHooks` and accumulate after response:

```ts
  const generate = async () => {
    if (!topic.trim()) { toast.error("Enter a topic first"); return; }
    setLoading(true);
    const dd = d as HookGeneratorData;
    dd.onUpdate?.({ topic });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = dd.authToken || session?.access_token;
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-build-script`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          step: "generate-hooks",
          topic: topic.trim(),
          previousHooks: dd.previousHooks ?? [],
        }),
      });
      const json = await res.json();
      if (json.hooks) {
        const newHookTexts = json.hooks.map((h: any) => h.text);
        const prevHooks = [...(dd.previousHooks ?? []), ...newHookTexts].slice(-20);
        dd.onUpdate?.({ hooks: json.hooks, selectedHook: undefined, selectedCategory: undefined, previousHooks: prevHooks });
      } else {
        toast.error("Failed to generate hooks");
      }
    } catch { toast.error("Error generating hooks"); }
    finally { setLoading(false); }
  };
```

- [ ] **Step 3: Update category display to use `normalizeCategory`**

In the JSX where hooks are rendered (line 109), change:

```ts
// Old:
{CATEGORY_LABELS[hook.category] ?? hook.category}

// New:
{CATEGORY_LABELS[normalizeCategory(hook.category)] ?? hook.category}
```

- [ ] **Step 4: Verify build**

Run: `npx vite build`
Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/canvas/HookGeneratorNode.tsx
git commit -m "feat: add category migration + anti-repetition to hook generator"
```

---

## Task 4: Add Formula Browse/Search Popover UI

**Files:**
- Modify: `src/components/canvas/HookGeneratorNode.tsx`

This task adds the search icon and the popover with category chips, text search, and clickable formula cards.

- [ ] **Step 1: Add imports**

Update the imports at the top of the file:

```ts
import { useState, useMemo } from "react";
import { NodeProps, Handle, Position } from "@xyflow/react";
import { Anchor, Loader2, X, Check, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { VIRAL_HOOK_FORMULAS, HOOK_CATEGORIES, HOOK_CATEGORY_LABELS, type HookCategory } from "@/data/viralHookFormulas";
```

- [ ] **Step 2: Add popover state and filter logic**

Inside the component function, after the existing state declarations, add:

```ts
  const [showFormulas, setShowFormulas] = useState(false);
  const [formulaCategory, setFormulaCategory] = useState<HookCategory | null>(null);
  const [formulaSearch, setFormulaSearch] = useState("");

  const filteredFormulas = useMemo(() => {
    let results = VIRAL_HOOK_FORMULAS;
    if (formulaCategory) {
      results = results.filter(f => f.category === formulaCategory);
    }
    if (formulaSearch.trim()) {
      const q = formulaSearch.toLowerCase();
      results = results.filter(f => f.template.toLowerCase().includes(q));
    }
    return results;
  }, [formulaCategory, formulaSearch]);
```

- [ ] **Step 3: Add formula click handler**

```ts
  const handleFormulaClick = (template: string, category: string) => {
    const dd = d as HookGeneratorData;
    let filled = template;
    if (topic.trim()) {
      // Only replace the FIRST placeholder with the topic;
      // leave remaining placeholders so the user can manually edit them.
      // This avoids nonsensical output on multi-placeholder templates
      // like "This is an (insert noun), and this is an (insert noun)"
      filled = template.replace(/\(insert [^)]+\)/i, topic.trim());
    }
    const newHook = { category, text: filled };
    const currentHooks = dd.hooks ?? [];
    dd.onUpdate?.({
      hooks: [...currentHooks, newHook],
      selectedHook: filled,
      selectedCategory: category,
    });
    setShowFormulas(false);
  };
```

- [ ] **Step 4: Add Search icon button next to Generate**

In the input row JSX (the `<div className="px-3 pt-3 pb-2 flex gap-2">` block), add the search button between the input and the Generate button:

```tsx
      {/* Input */}
      <div className="px-3 pt-3 pb-2 flex gap-2">
        <input
          value={topic}
          onChange={(e) => {
            setTopic(e.target.value);
            (d as HookGeneratorData).onUpdate?.({ topic: e.target.value });
          }}
          onKeyDown={(e) => e.key === "Enter" && generate()}
          placeholder="Topic (e.g. lower back pain)"
          className="flex-1 text-xs bg-muted/40 border border-border/60 rounded-lg px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
        />
        <button
          onClick={() => setShowFormulas(!showFormulas)}
          className={`px-2 py-1.5 text-xs rounded-lg border transition-colors flex items-center ${
            showFormulas
              ? "bg-[rgba(8,145,178,0.15)] border-[rgba(8,145,178,0.3)] text-[#22d3ee]"
              : "bg-muted/30 border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted/50"
          }`}
          title="Browse hook formulas"
        >
          <Search className="w-3 h-3" />
        </button>
        <button
          onClick={generate}
          disabled={loading}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[rgba(8,145,178,0.12)] text-[#22d3ee] border border-[rgba(8,145,178,0.25)] hover:bg-[rgba(8,145,178,0.2)] disabled:opacity-50 transition-colors flex items-center gap-1"
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Generate"}
        </button>
      </div>
```

- [ ] **Step 5: Add the formula browser popover JSX**

Insert this block right after the input row `</div>` and before the hook results section:

```tsx
      {/* Formula browser popover */}
      {showFormulas && (
        <div className="px-3 pb-2">
          <div className="rounded-lg border border-border/60 bg-background/95 backdrop-blur-sm overflow-hidden">
            {/* Category chips */}
            <div className="flex flex-wrap gap-1 px-2.5 pt-2.5 pb-1.5">
              {HOOK_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFormulaCategory(formulaCategory === cat ? null : cat)}
                  className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors ${
                    formulaCategory === cat
                      ? "bg-[rgba(8,145,178,0.15)] border-[rgba(8,145,178,0.3)] text-[#22d3ee]"
                      : "bg-muted/30 border-border/40 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {HOOK_CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
            {/* Search input */}
            <div className="px-2.5 pb-1.5">
              <input
                value={formulaSearch}
                onChange={(e) => setFormulaSearch(e.target.value)}
                placeholder="Search formulas..."
                className="w-full text-[11px] bg-muted/40 border border-border/60 rounded-md px-2 py-1 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
              />
            </div>
            {/* Formula list */}
            <div className="max-h-[280px] overflow-y-auto px-2.5 pb-2.5 space-y-1">
              {filteredFormulas.slice(0, 50).map((formula, i) => (
                <button
                  key={i}
                  onClick={() => handleFormulaClick(formula.template, formula.category)}
                  className="w-full text-left rounded-md border border-border/30 bg-muted/20 hover:bg-muted/40 px-2 py-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  <span className="text-[9px] uppercase tracking-wide text-[#22d3ee]/70 font-medium">
                    {HOOK_CATEGORY_LABELS[formula.category as HookCategory]}
                  </span>
                  <p className="leading-relaxed mt-0.5">{formula.template}</p>
                </button>
              ))}
              {filteredFormulas.length > 50 && (
                <p className="text-[10px] text-muted-foreground text-center py-1">
                  {filteredFormulas.length - 50} more — narrow your search
                </p>
              )}
              {filteredFormulas.length === 0 && (
                <p className="text-[10px] text-muted-foreground text-center py-2">No formulas match</p>
              )}
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 6: Verify build**

Run: `npx vite build`
Expected: Build succeeds with no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/canvas/HookGeneratorNode.tsx
git commit -m "feat: add formula browse/search popover to hook generator node"
```

---

## Task 5: Deploy to VPS

**Files:** Built dist + edge function

- [ ] **Step 1: Build locally**

```bash
npx vite build
```

- [ ] **Step 2: Deploy edge function to Supabase**

```bash
npx supabase functions deploy ai-build-script
```

- [ ] **Step 3: SCP dist to VPS and copy to nginx root**

Use expect script to SCP the `dist/` folder to VPS at `72.62.200.145`, then SSH in and copy contents to `/var/www/connectacreators/`.

- [ ] **Step 4: Verify on live site**

Open the canvas, add a Hook Generator node, verify:
1. "Generate" button produces formula-guided hooks (not generic ones)
2. Search icon opens the formula browser popover
3. Category chips filter correctly
4. Text search filters by keyword
5. Clicking a formula with a topic fills placeholders and adds it as a hook
6. Clicking "Generate" multiple times avoids repeating the same hooks

- [ ] **Step 5: Commit any deployment fixes**

```bash
git add -A
git commit -m "chore: deploy viral hook formula library"
```
