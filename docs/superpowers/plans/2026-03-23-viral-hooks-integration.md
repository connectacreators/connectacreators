# Viral Hooks Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 25 hardcoded hook templates in the AI Script Wizard with 800+ AI-curated viral hooks from a PDF, with per-client+topic anti-repetition tracking.

**Architecture:** Static TypeScript data file holds all hooks. A new `suggest-hooks` edge function uses Claude Haiku to rank the 5 best hooks for a given topic (pre-filtered by category relevance). Frontend Step 3 shows AI suggestions instead of manual accordion browsing. A `hook_usage` DB table prevents repetition.

**Tech Stack:** React + TypeScript (Vite), Supabase (Postgres, Edge Functions/Deno), Claude Haiku API, Lucide icons, shadcn/ui Dialog

**Spec:** `docs/superpowers/specs/2026-03-23-viral-hooks-integration-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/data/viralHooks.ts` | Create | Static hook data: types, ~800 hook entries, lookup maps |
| `supabase/migrations/20260323_hook_usage.sql` | Create | `hook_usage` table, index, RLS policy |
| `supabase/functions/suggest-hooks/index.ts` | Create | Edge function: category pre-filter + Claude Haiku hook ranking |
| `supabase/config.toml` | Modify | Add `[functions.suggest-hooks]` entry |
| `src/components/AIScriptWizard.tsx` | Modify | Replace Step 3 UI, remove old constants, add fetch + Browse All modal |
| `supabase/functions/ai-assistant/index.ts` | Modify | Update category names in 3 locations |

---

## Task 1: Parse PDF into Hook Data File

**Files:**
- Source: `1,000 Viral Hooks (PBL).pdf` (63 pages, user will provide path)
- Create: `src/data/viralHooks.ts`

- [ ] **Step 1: Read the PDF and extract all hooks**

Read the PDF page by page. Extract each hook template text and its category. The PDF has 7 sections: Educational, Comparison, Myth Busting, Storytelling, Random, Authority, Day in the Life.

- [ ] **Step 2: Create the data file with types and entries**

Create `src/data/viralHooks.ts`:

```typescript
export interface ViralHook {
  id: string;
  text: string;
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

// Category metadata for UI display (Lucide icon name, labels, colors)
export const HOOK_CATEGORY_META: Record<HookCategory, {
  icon: string;
  label: { en: string; es: string };
  color: string;
  activeColor: string;
}> = {
  educational: {
    icon: "BookOpen",
    label: { en: "Educational", es: "Educativo" },
    color: "from-[rgba(8,145,178,0.12)] to-[rgba(8,145,178,0.06)] border-[rgba(8,145,178,0.35)] text-[#22d3ee]",
    activeColor: "from-[rgba(8,145,178,0.30)] to-[rgba(8,145,178,0.20)] border-[rgba(8,145,178,0.60)] text-[#22d3ee]",
  },
  comparison: {
    icon: "ArrowLeftRight",
    label: { en: "Comparison", es: "Comparacion" },
    color: "from-[rgba(8,145,178,0.12)] to-[rgba(8,145,178,0.06)] border-[rgba(8,145,178,0.35)] text-[#22d3ee]",
    activeColor: "from-[rgba(8,145,178,0.30)] to-[rgba(8,145,178,0.20)] border-[rgba(8,145,178,0.60)] text-[#22d3ee]",
  },
  mythBusting: {
    icon: "ShieldX",
    label: { en: "Myth Busting", es: "Rompiendo Mitos" },
    color: "from-[rgba(8,145,178,0.12)] to-[rgba(8,145,178,0.06)] border-[rgba(8,145,178,0.35)] text-[#22d3ee]",
    activeColor: "from-[rgba(8,145,178,0.30)] to-[rgba(8,145,178,0.20)] border-[rgba(8,145,178,0.60)] text-[#22d3ee]",
  },
  storytelling: {
    icon: "BookText",
    label: { en: "Storytelling", es: "Storytelling" },
    color: "from-[rgba(8,145,178,0.12)] to-[rgba(8,145,178,0.06)] border-[rgba(8,145,178,0.35)] text-[#22d3ee]",
    activeColor: "from-[rgba(8,145,178,0.30)] to-[rgba(8,145,178,0.20)] border-[rgba(8,145,178,0.60)] text-[#22d3ee]",
  },
  random: {
    icon: "Shuffle",
    label: { en: "Random", es: "Random" },
    color: "from-[rgba(8,145,178,0.12)] to-[rgba(8,145,178,0.06)] border-[rgba(8,145,178,0.35)] text-[#22d3ee]",
    activeColor: "from-[rgba(8,145,178,0.30)] to-[rgba(8,145,178,0.20)] border-[rgba(8,145,178,0.60)] text-[#22d3ee]",
  },
  authority: {
    icon: "Crown",
    label: { en: "Authority", es: "Autoridad" },
    color: "from-[rgba(8,145,178,0.12)] to-[rgba(8,145,178,0.06)] border-[rgba(8,145,178,0.35)] text-[#22d3ee]",
    activeColor: "from-[rgba(8,145,178,0.30)] to-[rgba(8,145,178,0.20)] border-[rgba(8,145,178,0.60)] text-[#22d3ee]",
  },
  dayInTheLife: {
    icon: "Camera",
    label: { en: "Day in the Life", es: "Un Dia en la Vida" },
    color: "from-[rgba(8,145,178,0.12)] to-[rgba(8,145,178,0.06)] border-[rgba(8,145,178,0.35)] text-[#22d3ee]",
    activeColor: "from-[rgba(8,145,178,0.30)] to-[rgba(8,145,178,0.20)] border-[rgba(8,145,178,0.60)] text-[#22d3ee]",
  },
};

export const VIRAL_HOOKS: ViralHook[] = [
  // ~800 entries — each with stable ID like "edu-001", "story-042", etc.
  { id: "edu-001", text: "This represents your X before, during, and after X", category: "educational" },
  // ... all hooks from PDF
];

export const HOOKS_BY_ID = Object.fromEntries(
  VIRAL_HOOKS.map(h => [h.id, h])
);

export const HOOKS_BY_CATEGORY = VIRAL_HOOKS.reduce((acc, h) => {
  (acc[h.category] ??= []).push(h);
  return acc;
}, {} as Record<HookCategory, ViralHook[]>);
```

ID format: `{category_prefix}-{3-digit-number}` where prefixes are: `edu`, `comp`, `myth`, `story`, `rand`, `auth`, `ditl`.

- [ ] **Step 3: Verify hook count and categories**

Run a quick count:
```bash
cd /Users/admin/Desktop/connectacreators && node -e "
const {VIRAL_HOOKS, HOOKS_BY_CATEGORY} = require('./src/data/viralHooks.ts');
console.log('Total hooks:', VIRAL_HOOKS.length);
Object.entries(HOOKS_BY_CATEGORY).forEach(([k,v]) => console.log(k, v.length));
"
```

Expected: ~800 total hooks across 7 categories.

- [ ] **Step 4: Commit**

```bash
git add src/data/viralHooks.ts
git commit -m "feat: add 800+ viral hook templates parsed from PDF

Static data file with types, category metadata, and lookup maps."
```

---

## Task 2: Create Database Migration

**Files:**
- Create: `supabase/migrations/20260323_hook_usage.sql`

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260323_hook_usage.sql`:

```sql
-- Hook usage tracking for anti-repetition in AI Script Wizard
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

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260323_hook_usage.sql
git commit -m "feat: add hook_usage table for anti-repetition tracking

Tracks which hooks each client has used per topic. RLS scoped to client owner."
```

- [ ] **Step 3: Deploy migration**

Run in Supabase Dashboard SQL Editor or via CLI:
```bash
npx supabase db push
```

Verify with: `SELECT count(*) FROM hook_usage;` (should return 0).

---

## Task 3: Create `suggest-hooks` Edge Function

**Files:**
- Create: `supabase/functions/suggest-hooks/index.ts`
- Modify: `supabase/config.toml` — add function entry

- [ ] **Step 1: Create the edge function file**

Create `supabase/functions/suggest-hooks/index.ts`:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Category descriptions for the pre-filter step
const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  educational: "Stats, facts, how-to, tips, tutorials, 'Did you know' hooks",
  comparison: "Before/after, A vs B, 'Most people X but...', side-by-side hooks",
  mythBusting: "Debunking myths, 'Stop doing X', correcting misconceptions",
  storytelling: "Personal stories, narrative-driven, 'X years ago I...' hooks",
  random: "Surprising revelations, unexpected twists, shocking statements",
  authority: "Credibility, experience, transformation, results-based hooks",
  dayInTheLife: "Daily routines, behind-the-scenes, 'A day as a...' hooks",
};

// Import hook data — this will be bundled at deploy time.
// The viralHooks array must be copied into this function's directory
// or imported from a shared location.
// For Supabase Edge Functions, we inline the data as a JSON import.

// NOTE TO IMPLEMENTER: Copy the VIRAL_HOOKS array data into a file
// `supabase/functions/suggest-hooks/hookData.ts` (just the array + types)
// and import it here. Edge functions can't import from src/.

import { VIRAL_HOOKS, type ViralHook } from "./hookData.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth check
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  // Verify user token
  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: userError } = await adminClient.auth.getUser(token);
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ error: "Authentication failed" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { topic, client_id, exclude_ids = [] } = await req.json();

    if (!topic || !client_id) {
      return new Response(JSON.stringify({ error: "topic and client_id are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedTopic = topic.trim().toLowerCase();

    // 1. Get already-used hook IDs for this client+topic
    const { data: usedRows } = await adminClient
      .from("hook_usage")
      .select("hook_id")
      .eq("client_id", client_id)
      .eq("topic", normalizedTopic);

    const usedIds = new Set((usedRows || []).map((r: any) => r.hook_id));
    const excludeSet = new Set([...usedIds, ...exclude_ids]);

    // 2. Filter out used/excluded hooks
    let available = VIRAL_HOOKS.filter(h => !excludeSet.has(h.id));

    // 3. If all hooks exhausted, reset usage for this client+topic
    let reset = false;
    if (available.length === 0) {
      await adminClient
        .from("hook_usage")
        .delete()
        .eq("client_id", client_id)
        .eq("topic", normalizedTopic);
      available = VIRAL_HOOKS.filter(h => !new Set(exclude_ids).has(h.id));
      reset = true;
    }

    // 4. Pre-filter: ask Claude Haiku for 3 most relevant categories
    const categoryRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 100,
        messages: [{
          role: "user",
          content: `Topic: "${normalizedTopic}"

Available hook categories:
${Object.entries(CATEGORY_DESCRIPTIONS).map(([k, v]) => `- ${k}: ${v}`).join("\n")}

Pick the 3 categories that best match this topic. Return ONLY a JSON array of category keys, e.g. ["educational","storytelling","comparison"]`,
        }],
      }),
    });

    let relevantCategories: string[] = [];
    if (categoryRes.ok) {
      const catData = await categoryRes.json();
      const catText = catData.content?.[0]?.text || "[]";
      const match = catText.match(/\[.*\]/s);
      if (match) {
        try { relevantCategories = JSON.parse(match[0]); } catch {}
      }
    }

    // Fallback: if category selection failed, use all categories
    let pool = relevantCategories.length > 0
      ? available.filter(h => relevantCategories.includes(h.category))
      : available;

    // If pre-filtered pool is too small, expand to all
    if (pool.length < 5) {
      pool = available;
    }

    // 5. Ask Claude Haiku to pick the 5 best hooks
    const hookListStr = pool.map(h => `${h.id}: "${h.text}" [${h.category}]`).join("\n");

    const rankRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        messages: [{
          role: "user",
          content: `Topic: "${normalizedTopic}"

Hook formulas (id: "text" [category]):
${hookListStr}

Pick the 5 hooks that best match this topic. Consider relevance, engagement potential, and variety of styles. Return ONLY a JSON array of hook IDs, e.g. ["edu-001","story-042","comp-003","myth-012","auth-005"]`,
        }],
      }),
    });

    let selectedIds: string[] = [];
    if (rankRes.ok) {
      const rankData = await rankRes.json();
      const rankText = rankData.content?.[0]?.text || "[]";
      const match = rankText.match(/\[.*\]/s);
      if (match) {
        try { selectedIds = JSON.parse(match[0]); } catch {}
      }
    }

    // Build response — look up full hook objects
    const hooksById = Object.fromEntries(pool.map(h => [h.id, h]));
    const hooks = selectedIds
      .map(id => hooksById[id])
      .filter(Boolean)
      .slice(0, 5);

    // Fallback: if AI selection failed, pick 5 random from pool
    if (hooks.length === 0) {
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      hooks.push(...shuffled.slice(0, 5));
    }

    return new Response(JSON.stringify({ hooks, reset }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[suggest-hooks] Error:", e);
    return new Response(JSON.stringify({ error: e.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
```

- [ ] **Step 2: Create the hook data file for the edge function**

Create `supabase/functions/suggest-hooks/hookData.ts` — export the same `ViralHook` type and `VIRAL_HOOKS` array. This is a copy of the data from `src/data/viralHooks.ts` (just the type + array, no lookup maps or category metadata).

```typescript
export interface ViralHook {
  id: string;
  text: string;
  category: string;
}

export const VIRAL_HOOKS: ViralHook[] = [
  // Same ~800 entries as src/data/viralHooks.ts
];
```

Note: Supabase Edge Functions cannot import from `src/`. The data must be duplicated. To keep them in sync, add a comment at the top of both files: `// SYNC: keep in sync with supabase/functions/suggest-hooks/hookData.ts` and `// SYNC: keep in sync with src/data/viralHooks.ts`.

- [ ] **Step 3: Add function config to `supabase/config.toml`**

Add after the last `[functions.xxx]` block:

```toml
[functions.suggest-hooks]
verify_jwt = true
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/suggest-hooks/ supabase/config.toml
git commit -m "feat: add suggest-hooks edge function

Two-stage Claude Haiku pipeline: pre-filters by category relevance,
then ranks best 5 hooks for the topic. No credit charge."
```

- [ ] **Step 5: Deploy the function**

```bash
npx supabase functions deploy suggest-hooks
```

---

## Task 4: Update `ai-assistant` Category Names

**Files:**
- Modify: `supabase/functions/ai-assistant/index.ts`

Three string-level changes — no logic changes.

- [ ] **Step 1: Update `HOOK_CATEGORIES` array (line 78-84)**

Replace:
```typescript
const HOOK_CATEGORIES = [
  "educational",
  "randomInspo",
  "authorityInspo",
  "comparisonInspo",
  "storytellingInspo",
];
```

With:
```typescript
const HOOK_CATEGORIES = [
  "educational",
  "comparison",
  "mythBusting",
  "storytelling",
  "random",
  "authority",
  "dayInTheLife",
];
```

- [ ] **Step 2: Update `select_hook` tool enum (line 122)**

Replace:
```typescript
enum: ["educational", "randomInspo", "authorityInspo", "comparisonInspo", "storytellingInspo"],
```

With:
```typescript
enum: ["educational", "comparison", "mythBusting", "storytelling", "random", "authority", "dayInTheLife"],
```

- [ ] **Step 3: Update `buildSystemPrompt` category descriptions (lines 359-364)**

Replace:
```
HOOK CATEGORIES (for select_hook):
- educational: Stats, facts, how-to, "Did you know..." hooks
- randomInspo: Surprising revelations, unexpected twists, shocking statements
- authorityInspo: Credibility, experience, transformation, results-based hooks
- comparisonInspo: Before/after, "Most people X but...", A vs B hooks
- storytellingInspo: Personal stories, narrative-driven hooks
```

With:
```
HOOK CATEGORIES (for select_hook):
- educational: Stats, facts, how-to, tips, tutorials, "Did you know..." hooks
- comparison: Before/after, A vs B, "Most people X but...", side-by-side hooks
- mythBusting: Debunking myths, "Stop doing X", correcting misconceptions
- storytelling: Personal stories, narrative-driven, "X years ago I..." hooks
- random: Surprising revelations, unexpected twists, shocking statements
- authority: Credibility, experience, transformation, results-based hooks
- dayInTheLife: Daily routines, behind-the-scenes, "A day as a..." hooks
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/ai-assistant/index.ts
git commit -m "feat: update hook categories to new 7-category system

Renamed: randomInspo→random, authorityInspo→authority,
comparisonInspo→comparison, storytellingInspo→storytelling.
Added: mythBusting, dayInTheLife."
```

- [ ] **Step 5: Deploy**

```bash
npx supabase functions deploy ai-assistant
```

---

## Task 5: Rewrite Step 3 Frontend — State & Fetch Logic

**Files:**
- Modify: `src/components/AIScriptWizard.tsx`

This task updates state variables and adds the fetch function. The UI rendering is in Task 6.

- [ ] **Step 1: Add import for ViralHook types**

At the top of the file (after existing imports, around line 18), add:

```typescript
import { VIRAL_HOOKS, HOOKS_BY_CATEGORY, HOOK_CATEGORY_META, type ViralHook, type HookCategory } from "@/data/viralHooks";
```

Also add missing Lucide imports (check which are already imported at lines 7-12):

```typescript
// Add to existing Lucide imports: ArrowLeftRight, ShieldX, BookText, Camera, List
```

- [ ] **Step 2: Remove old hook constants and helper**

Delete `inferHookCategory()` function (lines 51-58).

Delete entire `HOOK_FORMATS` constant (lines 61-127).

- [ ] **Step 3: Replace Step 3 state variables (lines 233-236)**

Replace:
```typescript
// Step 3 — Hook
const [expandedHookCategory, setExpandedHookCategory] = useState<string | null>(null);
const [selectedHookCategory, setSelectedHookCategory] = useState<string | null>(null);
const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
```

With:
```typescript
// Step 3 — Hook (AI suggestions)
const [suggestedHooks, setSuggestedHooks] = useState<ViralHook[]>([]);
const [hookLoading, setHookLoading] = useState(false);
const [selectedHook, setSelectedHook] = useState<ViralHook | null>(null);
const [shownHookIds, setShownHookIds] = useState<string[]>([]);
const [showBrowseAll, setShowBrowseAll] = useState(false);
```

- [ ] **Step 4: Add the hook fetch ref and effect**

After the state variables, add:

```typescript
const hasFetchedForTopic = useRef<string | null>(null);

const fetchSuggestedHooks = useCallback(async (excludeIds: string[] = []) => {
  if (!topic || !client?.id) return;
  setHookLoading(true);
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/suggest-hooks`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          topic: topic.trim().toLowerCase(),
          client_id: client.id,
          exclude_ids: excludeIds,
        }),
      }
    );
    const data = await res.json();
    if (data.hooks) {
      setSuggestedHooks(data.hooks);
      setShownHookIds(prev => [...prev, ...data.hooks.map((h: ViralHook) => h.id)]);
      if (data.reset) {
        toast.info(tr({ en: "All hooks cycled — fresh selection!", es: "Todos los hooks usados — seleccion fresca!" }, language));
      }
    }
  } catch (e) {
    console.error("Failed to fetch hook suggestions:", e);
    toast.error(tr({ en: "Could not load hook suggestions", es: "No se pudieron cargar las sugerencias de hooks" }, language));
  } finally {
    setHookLoading(false);
  }
}, [topic, client?.id, language]);

useEffect(() => {
  const normalizedTopic = topic?.trim().toLowerCase() ?? null;
  if (activeStep === 3 && normalizedTopic && hasFetchedForTopic.current !== normalizedTopic) {
    hasFetchedForTopic.current = normalizedTopic;
    setShownHookIds([]);
    setSelectedHook(null);
    setSuggestedHooks([]);
    fetchSuggestedHooks();
  }
}, [activeStep, topic, fetchSuggestedHooks]);
```

- [ ] **Step 5: Update `handleGenerateScript` (lines 929-942)**

Replace the block that reads `selectedHookCategory` / `selectedTemplate` with references to `selectedHook`:

Replace:
```typescript
const effectiveHookCategory = useRemixHook
  ? (remixHookType ? inferHookCategory(remixHookType) : (selectedHookCategory || "educational"))
  : selectedHookCategory;
const effectiveHookTemplate = useRemixHook
  ? (remixHookType || selectedTemplate || "hook_from_remix")
  : selectedTemplate;

if (!useRemixHook && (!effectiveHookCategory || !effectiveHookTemplate)) {
```

With:
```typescript
const effectiveHookCategory = useRemixHook
  ? (remixHookType || selectedHook?.category || "educational")
  : selectedHook?.category;
const effectiveHookTemplate = useRemixHook
  ? (remixHookType || selectedHook?.text || "hook_from_remix")
  : selectedHook?.text;

if (!useRemixHook && (!effectiveHookCategory || !effectiveHookTemplate)) {
```

- [ ] **Step 6: Add hook usage recording after script generation**

After `advanceTo(5);` (line 976), add:

```typescript
// Record hook usage for anti-repetition
if (selectedHook && client?.id) {
  supabase.from("hook_usage").insert({
    client_id: client.id,
    topic: topic.trim().toLowerCase(),
    hook_id: selectedHook.id,
  }).then(() => {}).catch(() => {}); // fire-and-forget
}
```

- [ ] **Step 7: Commit**

```bash
git add src/components/AIScriptWizard.tsx
git commit -m "feat: replace Step 3 state with AI hook suggestion logic

Remove HOOK_FORMATS, inferHookCategory. Add fetch from suggest-hooks
edge function with auto-fetch on step entry and usage recording."
```

---

## Task 6: Rewrite Step 3 Frontend — UI Rendering

**Files:**
- Modify: `src/components/AIScriptWizard.tsx` (the `renderStep3` function, lines 1690-1874)

- [ ] **Step 1: Replace the `renderStep3` function**

Replace the entire `renderStep3` function (lines 1690-1874) with:

```typescript
const renderStep3 = () => {
  // Map icon names to Lucide components
  const iconMap: Record<string, any> = {
    BookOpen, ArrowLeftRight, ShieldX, BookText, Shuffle, Crown, Camera,
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="text-center space-y-2 pb-2">
        <h2 className="text-2xl font-bold text-foreground">
          {tr({ en: "Pick your hook style", es: "Elige el estilo de tu hook" }, language)}
        </h2>
        <p className="text-muted-foreground text-sm">
          {tr({ en: "AI picks the best hooks for your topic. Choose one.", es: "La IA elige los mejores hooks para tu tema. Elige uno." }, language)}
        </p>
      </div>

      {/* Remix hook option — unchanged */}
      {initialTemplateVideo && (
        <button
          onClick={() => {
            if (!remixVaultMatch) return;
            setUseRemixHook(true);
            setSelectedHook(null);
          }}
          disabled={vaultSaving && !remixVaultMatch}
          className={`w-full text-left p-4 rounded-2xl border transition-all ${
            useRemixHook
              ? "border-cyan-400/50 bg-cyan-400/10 ring-1 ring-cyan-400/20"
              : remixVaultMatch
                ? "border-border/60 bg-card/50 hover:border-cyan-400/30 hover:bg-cyan-400/5"
                : vaultSaving
                  ? "border-cyan-400/25 bg-cyan-400/5 cursor-wait"
                  : "border-border/60 bg-card/50 hover:border-cyan-400/30 hover:bg-cyan-400/5"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
              useRemixHook ? "bg-cyan-400 text-white" : vaultSaving && !remixVaultMatch ? "bg-cyan-400/10 text-cyan-400" : "bg-muted text-muted-foreground"
            }`}>
              {useRemixHook ? <Check className="w-4 h-4" /> : vaultSaving && !remixVaultMatch ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-foreground">
                  {tr({ en: "Use hook from remix video", es: "Usar hook del video remixeado" }, language)}
                </p>
                {useRemixHook && (
                  <span className="text-[10px] font-bold text-cyan-400 bg-cyan-400/15 border border-cyan-400/25 px-2 py-0.5 rounded-full">REMIX</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate flex items-center gap-1.5">
                {remixVaultMatch
                  ? (remixVaultMatch.structure_analysis as any)?.hook_type || tr({ en: "Hook detected from video", es: "Hook detectado del video" }, language)
                  : vaultSaving
                    ? <><Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />{tr({ en: "Analyzing video hook...", es: "Analizando hook del video..." }, language)}</>
                    : tr({ en: "Hook style from original video", es: "Estilo de hook del video original" }, language)
                }
              </p>
            </div>
          </div>
        </button>
      )}

      {/* AI Suggestions header */}
      <div className="flex items-center gap-2 pt-2">
        <Sparkles className="w-4 h-4 text-cyan-400" />
        <span className="text-sm font-medium text-cyan-400">
          {tr({ en: "Best hooks for", es: "Mejores hooks para" }, language)} "{topic}"
        </span>
      </div>

      {/* Loading skeleton */}
      {hookLoading && (
        <div className="space-y-3">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="rounded-2xl border border-border/40 p-4 animate-pulse">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Hook suggestion cards */}
      {!hookLoading && suggestedHooks.length > 0 && (
        <div className="space-y-3">
          {suggestedHooks.map((hook, i) => {
            const isSelected = selectedHook?.id === hook.id;
            const meta = HOOK_CATEGORY_META[hook.category as HookCategory];
            const IconComp = meta ? iconMap[meta.icon] : BookOpen;

            return (
              <button
                key={hook.id}
                onClick={() => {
                  setSelectedHook(hook);
                  setUseRemixHook(false);
                }}
                className={`w-full text-left p-4 rounded-2xl border transition-all ${
                  isSelected
                    ? "border-cyan-400/50 bg-cyan-400/10 ring-1 ring-cyan-400/20"
                    : "border-border/40 bg-card/50 hover:border-cyan-400/30 hover:bg-cyan-400/5"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold ${
                    isSelected ? "bg-cyan-400 text-black" : "bg-muted text-muted-foreground"
                  }`}>
                    {isSelected ? <Check className="w-3 h-3" /> : i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground italic leading-relaxed">"{hook.text}"</p>
                    {meta && (
                      <div className="flex items-center gap-1.5 mt-2">
                        {IconComp && <IconComp className="w-3 h-3 text-muted-foreground" />}
                        <span className="text-[10px] text-muted-foreground font-medium">
                          {tr(meta.label, language)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}

          {/* Action buttons */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={() => fetchSuggestedHooks(shownHookIds)}
              disabled={hookLoading}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-cyan-400/30 bg-cyan-400/5 hover:bg-cyan-400/10 text-cyan-400 text-sm transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${hookLoading ? "animate-spin" : ""}`} />
              {tr({ en: "Show 5 More", es: "Mostrar 5 Mas" }, language)}
            </button>
            <button
              onClick={() => setShowBrowseAll(true)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border/40 bg-card/50 hover:bg-card text-muted-foreground hover:text-foreground text-sm transition-all"
            >
              <List className="w-3.5 h-3.5" />
              {tr({ en: "Browse All", es: "Ver Todos" }, language)}
            </button>
          </div>
        </div>
      )}

      {/* Selection summary + next */}
      {(useRemixHook || selectedHook) && (
        <div className="sticky bottom-4 bg-card/95 backdrop-blur border border-cyan-400/25 rounded-2xl p-4 shadow-xl space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-400/20 flex items-center justify-center flex-shrink-0">
              <Check className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="flex-1 min-w-0">
              {useRemixHook ? (
                <>
                  <p className="text-xs text-cyan-400 font-semibold flex items-center gap-1">
                    <span className="text-[10px] bg-cyan-400/15 border border-cyan-400/25 px-1.5 py-0.5 rounded-full">REMIX</span>
                    {tr({ en: "Hook from video", es: "Hook del video" }, language)}
                  </p>
                  <p className="text-sm text-foreground italic truncate">
                    "{(remixVaultMatch?.structure_analysis as any)?.hook_type || "Video hook"}"
                  </p>
                </>
              ) : selectedHook && (
                <>
                  <p className="text-xs text-muted-foreground font-medium">
                    {tr(HOOK_CATEGORY_META[selectedHook.category as HookCategory]?.label || { en: selectedHook.category, es: selectedHook.category }, language)}
                  </p>
                  <p className="text-sm text-foreground italic truncate">"{selectedHook.text}"</p>
                </>
              )}
            </div>
          </div>
          <Button
            onClick={() => advanceTo(4)}
            className="w-full gap-2 bg-cyan-400/15 hover:bg-cyan-400/25 text-cyan-400 border border-cyan-400/40 rounded-xl"
          >
            {tr({ en: "Next: Choose Style", es: "Siguiente: Elegir Estilo" }, language)}
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {!hookLoading && suggestedHooks.length === 0 && !useRemixHook && (
        <p className="text-center text-xs text-muted-foreground">
          {tr({ en: "Loading hook suggestions...", es: "Cargando sugerencias de hooks..." }, language)}
        </p>
      )}

      {/* Browse All Modal */}
      <BrowseAllHooksModal
        open={showBrowseAll}
        onClose={() => setShowBrowseAll(false)}
        onSelect={(hook) => {
          setSelectedHook(hook);
          setUseRemixHook(false);
          setShowBrowseAll(false);
        }}
        language={language}
        clientId={client?.id}
        topic={topic}
      />
    </div>
  );
};
```

- [ ] **Step 2: Add the BrowseAllHooksModal component**

Add this as a new component at the bottom of `AIScriptWizard.tsx` (before the main component's closing export), or as a separate inline component within the file:

```typescript
function BrowseAllHooksModal({
  open,
  onClose,
  onSelect,
  language,
  clientId,
  topic,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (hook: ViralHook) => void;
  language: "en" | "es";
  clientId?: string;
  topic?: string;
}) {
  const [search, setSearch] = useState("");
  const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set());
  const [usedHookIds, setUsedHookIds] = useState<Set<string>>(new Set());
  const debouncedSearch = useRef<string>("");
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>();

  const iconMap: Record<string, any> = {
    BookOpen, ArrowLeftRight, ShieldX, BookText, Shuffle, Crown, Camera,
  };

  // Load used hooks when modal opens
  useEffect(() => {
    if (!open || !clientId || !topic) return;
    const normalizedTopic = topic.trim().toLowerCase();
    supabase
      .from("hook_usage")
      .select("hook_id")
      .eq("client_id", clientId)
      .eq("topic", normalizedTopic)
      .then(({ data }) => {
        setUsedHookIds(new Set((data || []).map(r => r.hook_id)));
      });
  }, [open, clientId, topic]);

  // Debounced search
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      debouncedSearch.current = search;
      // Force re-render by updating a state
      setActiveCategories(prev => new Set(prev));
    }, 300);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [search]);

  const toggleCategory = (cat: string) => {
    setActiveCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const filteredHooks = VIRAL_HOOKS.filter(h => {
    if (activeCategories.size > 0 && !activeCategories.has(h.category)) return false;
    if (debouncedSearch.current && !h.text.toLowerCase().includes(debouncedSearch.current.toLowerCase())) return false;
    return true;
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{tr({ en: "Browse All Hooks", es: "Ver Todos los Hooks" }, language)}</DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={tr({ en: "Search hooks...", es: "Buscar hooks..." }, language)}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Category filter chips */}
        <div className="flex flex-wrap gap-2">
          {(Object.entries(HOOK_CATEGORY_META) as [HookCategory, typeof HOOK_CATEGORY_META[HookCategory]][]).map(([key, meta]) => {
            const IconComp = iconMap[meta.icon];
            const isActive = activeCategories.has(key);
            return (
              <button
                key={key}
                onClick={() => toggleCategory(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                  isActive
                    ? "bg-cyan-400/15 border-cyan-400/40 text-cyan-400"
                    : "bg-card border-border/40 text-muted-foreground hover:border-border"
                }`}
              >
                {IconComp && <IconComp className="w-3 h-3" />}
                {tr(meta.label, language)}
              </button>
            );
          })}
        </div>

        {/* Hook list */}
        <div className="flex-1 overflow-y-auto space-y-2 min-h-0" style={{ maxHeight: "50vh" }}>
          {filteredHooks.map(hook => {
            const meta = HOOK_CATEGORY_META[hook.category as HookCategory];
            const IconComp = meta ? iconMap[meta.icon] : BookOpen;
            const isUsed = usedHookIds.has(hook.id);

            return (
              <button
                key={hook.id}
                onClick={() => onSelect(hook)}
                className="w-full text-left p-3 rounded-xl border border-border/40 bg-card/50 hover:border-cyan-400/30 hover:bg-cyan-400/5 transition-all"
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground italic leading-relaxed">"{hook.text}"</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      {IconComp && <IconComp className="w-3 h-3 text-muted-foreground" />}
                      <span className="text-[10px] text-muted-foreground">{tr(meta?.label || { en: hook.category, es: hook.category }, language)}</span>
                      {isUsed && (
                        <span className="text-[9px] bg-yellow-400/15 text-yellow-500 px-1.5 py-0.5 rounded-full font-medium">
                          {tr({ en: "Used", es: "Usado" }, language)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
          {filteredHooks.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">
              {tr({ en: "No hooks match your search", es: "No hay hooks que coincidan" }, language)}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Verify the build compiles**

```bash
cd /Users/admin/Desktop/connectacreators && npm run build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/AIScriptWizard.tsx
git commit -m "feat: rewrite Step 3 UI with AI hook suggestions + Browse All modal

Replaces manual accordion with AI-curated 5-hook cards, Show 5 More,
and Browse All dialog with search + category filters."
```

---

## Task 7: End-to-End Smoke Test

- [ ] **Step 1: Deploy everything to VPS**

Build and deploy:
```bash
cd /Users/admin/Desktop/connectacreators && npm run build
```

SCP the build to VPS and reload nginx.

- [ ] **Step 2: Test the suggest-hooks function directly**

```bash
curl -X POST "https://hxojqrilwhhrvloiwmfo.supabase.co/functions/v1/suggest-hooks" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <user_token>" \
  -d '{"topic":"5 tips para crecer en instagram","client_id":"<client_id>"}'
```

Expected: JSON response with `hooks` array of 5 objects, each with `id`, `text`, `category`.

- [ ] **Step 3: Test the full wizard flow in browser**

1. Open the AI Script Wizard
2. Complete Step 1 (topic) and Step 2 (facts)
3. On Step 3: verify 5 hook suggestions load automatically
4. Click a hook — verify it gets selected (cyan highlight)
5. Click "Show 5 More" — verify 5 new hooks appear (no duplicates from first batch)
6. Click "Browse All" — verify modal opens with search and category filters
7. Complete the wizard through to script generation
8. Verify `hook_usage` table has a new row (check in Supabase Dashboard)

- [ ] **Step 4: Test anti-repetition**

1. Start a new script with the same topic as Step 3
2. On Step 3: verify the previously used hook does NOT appear in the top 5
3. Verify "Show 5 More" also excludes the used hook

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -A && git commit -m "fix: address smoke test findings"
```
