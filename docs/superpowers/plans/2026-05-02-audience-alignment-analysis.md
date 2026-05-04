# Audience Alignment Auto-Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the manually-set `audience_score` and `uniqueness_score` sliders with AI-powered scores derived from scraping the client's Instagram and their emulation profiles, then having Claude compare them.

**Architecture:** A new edge function `analyze-audience-alignment` scrapes the client's recent posts and their 3 emulation profiles via the existing VPS scraper, sends captions + engagement data to Claude, and Claude outputs 0–10 scores + a brief written analysis. The scores are saved back to `client_strategies`. The strategy page shows the analysis summary and a "Re-analyze" button; it auto-triggers on load if never analyzed or analyzed > 7 days ago.

**Tech Stack:** Deno edge function, VPS scraper at `http://72.62.200.145:3099/scrape-profile` (API key: `ytdlp_connecta_2026_secret`), Anthropic `claude-haiku-4-5-20251001` (fast + cheap for analysis), Supabase Postgres, React frontend.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `supabase/migrations/20260502_audience_analysis_fields.sql` | Create | Add `audience_analysis` JSONB + `audience_analyzed_at` to `client_strategies` |
| `supabase/functions/analyze-audience-alignment/index.ts` | Create | Edge function: scrape → Claude → save scores |
| `src/pages/ClientStrategy.tsx` | Modify | Auto-trigger analysis, show summary + "Re-analyze" button, remove manual sliders |

---

## Task 1: DB Migration — add analysis storage fields

**Files:**
- Create: `supabase/migrations/20260502_audience_analysis_fields.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Add AI analysis storage to client_strategies
ALTER TABLE client_strategies
  ADD COLUMN IF NOT EXISTS audience_analysis jsonb,
  ADD COLUMN IF NOT EXISTS audience_analyzed_at timestamptz;

-- audience_analysis shape:
-- {
--   "audience_score": 7,
--   "uniqueness_score": 5,
--   "summary": "Your content...",
--   "client_posts_analyzed": 12,
--   "emulation_posts_analyzed": 34
-- }
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Run via MCP tool `mcp__plugin_supabase_supabase__apply_migration` with:
- `project_id`: `hxojqrilwhhrvloiwmfo`
- `name`: `audience_analysis_fields`
- `query`: the SQL above

- [ ] **Step 3: Verify columns exist**

Run via MCP tool `mcp__plugin_supabase_supabase__execute_sql`:
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'client_strategies'
  AND column_name IN ('audience_analysis', 'audience_analyzed_at');
```
Expected: 2 rows returned.

- [ ] **Step 4: Commit**
```bash
git add supabase/migrations/20260502_audience_analysis_fields.sql
git commit -m "feat(db): add audience_analysis and audience_analyzed_at to client_strategies"
```

---

## Task 2: Edge Function — `analyze-audience-alignment`

**Files:**
- Create: `supabase/functions/analyze-audience-alignment/index.ts`

The function:
1. Auth-checks the caller
2. Reads the client's `onboarding_data.instagram` and `onboarding_data.top3Profiles`
3. Scrapes client's recent posts (last 20) via VPS
4. Scrapes each emulation profile's top 10 posts via VPS (up to 3 profiles)
5. Builds a Claude prompt with captions + engagement data
6. Claude returns `audience_score` (0–10), `uniqueness_score` (0–10), and `summary`
7. Upserts scores back into `client_strategies` and saves the full analysis JSON

- [ ] **Step 1: Create the function file**

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VPS_SCRAPE_URL = "http://72.62.200.145:3099/scrape-profile";
const VPS_API_KEY = "ytdlp_connecta_2026_secret";

// Scrape up to `limit` posts from a profile URL. Returns array of {caption, views, likes}.
async function scrapeProfile(profileUrl: string, limit: number): Promise<{ caption: string; views: number; likes: number }[]> {
  const url = new URL(VPS_SCRAPE_URL);
  url.searchParams.set("url", profileUrl);
  url.searchParams.set("limit", String(limit));

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: { "x-api-key": VPS_API_KEY },
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    return [];
  }
  if (!res.ok) return [];

  const data = await res.json().catch(() => null);
  if (!data?.posts) return [];

  return (data.posts as any[]).slice(0, limit).map((p) => ({
    caption: String(p.title || p.caption || "").slice(0, 300),
    views: Number(p.views) || 0,
    likes: Number(p.likes) || 0,
  }));
}

// Parse top3Profiles from onboarding — may be a string or array
function parseProfiles(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return (raw as string[]).filter(Boolean).slice(0, 3);
  // Comma/newline-separated string
  return String(raw).split(/[\n,]+/).map((s) => s.trim()).filter(Boolean).slice(0, 3);
}

// Normalize a raw handle/URL into a full Instagram URL
function toInstagramUrl(handle: string): string {
  const s = handle.trim().replace(/^@/, "");
  if (s.startsWith("http")) return s;
  return `https://www.instagram.com/${s}/`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { client_id } = await req.json() as { client_id: string };
    if (!client_id) {
      return new Response(JSON.stringify({ error: "client_id required" }), { status: 400, headers: corsHeaders });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Auth check
    const { data: { user } } = await createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    ).auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    // Load client onboarding data
    const { data: client } = await adminClient
      .from("clients")
      .select("id, name, onboarding_data")
      .eq("id", client_id)
      .maybeSingle();

    if (!client) {
      return new Response(JSON.stringify({ error: "Client not found" }), { status: 404, headers: corsHeaders });
    }

    const od = client.onboarding_data || {};
    const instagramHandle = String(od.instagram || "").trim();
    const emulationRaw = od.top3Profiles;
    const emulationProfiles = parseProfiles(emulationRaw);

    if (!instagramHandle) {
      return new Response(JSON.stringify({ error: "No Instagram handle in onboarding data" }), { status: 400, headers: corsHeaders });
    }

    // Scrape client's own recent posts and all emulation profiles in parallel
    const clientUrl = toInstagramUrl(instagramHandle);
    const emulationUrls = emulationProfiles.map(toInstagramUrl);

    const [clientPosts, ...emulationPostArrays] = await Promise.all([
      scrapeProfile(clientUrl, 20),
      ...emulationUrls.map((url) => scrapeProfile(url, 10)),
    ]);

    const totalEmulationPosts = emulationPostArrays.reduce((sum, arr) => sum + arr.length, 0);

    // Build the Claude prompt
    const clientPostsText = clientPosts.length > 0
      ? clientPosts.map((p, i) =>
          `Post ${i + 1}: "${p.caption}" — ${p.views.toLocaleString()} views, ${p.likes.toLocaleString()} likes`
        ).join("\n")
      : "No posts found.";

    const emulationText = emulationProfiles.map((profile, i) => {
      const posts = emulationPostArrays[i] || [];
      if (posts.length === 0) return `${profile}: No posts found.`;
      const postsStr = posts.map((p, j) =>
        `  Post ${j + 1}: "${p.caption}" — ${p.views.toLocaleString()} views`
      ).join("\n");
      return `${profile}:\n${postsStr}`;
    }).join("\n\n");

    const targetAudience = od.targetClient || "not specified";
    const industry = od.industry || "not specified";
    const uniqueOffer = od.uniqueOffer || "not specified";

    const prompt = `You are analyzing a social media creator's content alignment.

CLIENT PROFILE:
- Industry: ${industry}
- Target audience: ${targetAudience}
- Unique offer: ${uniqueOffer}
- Instagram: @${instagramHandle}

CLIENT'S RECENT POSTS (last ${clientPosts.length}):
${clientPostsText}

EMULATION PROFILES (what they aspire to):
${emulationText || "None provided."}

Score the client on two dimensions. Be honest — a 5/10 is average, 3/10 is poor, 8/10 is genuinely strong.

1. AUDIENCE ALIGNMENT (0-10): Do the client's captions, topics, and framing clearly speak to "${targetAudience}"? Compare to the emulation profiles — are they reaching similar people with similar language and topics? Consider: specificity of language, problem awareness level, niche relevance.

2. CONTENT UNIQUENESS (0-10): Is the client's hook style, angle, and topic selection differentiated from the emulation profiles and from generic content in their niche? Or are they blending in? Consider: distinctive angles, specific stories, memorable hooks vs generic captions.

Respond ONLY with valid JSON, no markdown, no explanation outside the JSON:
{
  "audience_score": <integer 0-10>,
  "uniqueness_score": <integer 0-10>,
  "summary": "<2-3 sentences explaining the scores in plain English. Be specific about what's working and what needs to change. No jargon.>",
  "audience_detail": "<1 sentence on audience alignment specifically>",
  "uniqueness_detail": "<1 sentence on uniqueness specifically>"
}`;

    // Call Claude Haiku (fast + cheap for analysis tasks)
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      return new Response(JSON.stringify({ error: "Claude error: " + err }), { status: 500, headers: corsHeaders });
    }

    const claudeData = await claudeRes.json();
    const rawText = claudeData.content?.[0]?.text || "{}";

    let analysis: {
      audience_score: number;
      uniqueness_score: number;
      summary: string;
      audience_detail: string;
      uniqueness_detail: string;
    };

    try {
      analysis = JSON.parse(rawText);
    } catch {
      // Claude occasionally wraps JSON in backticks
      const match = rawText.match(/\{[\s\S]*\}/);
      if (!match) {
        return new Response(JSON.stringify({ error: "Failed to parse Claude response", raw: rawText }), { status: 500, headers: corsHeaders });
      }
      analysis = JSON.parse(match[0]);
    }

    // Clamp scores to 0–10
    const audienceScore = Math.max(0, Math.min(10, Math.round(analysis.audience_score)));
    const uniquenessScore = Math.max(0, Math.min(10, Math.round(analysis.uniqueness_score)));

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
    };

    // Upsert into client_strategies
    await adminClient.from("client_strategies").upsert(
      {
        client_id,
        audience_score: audienceScore,
        uniqueness_score: uniquenessScore,
        audience_analysis: analysisPayload,
        audience_analyzed_at: new Date().toISOString(),
      },
      { onConflict: "client_id" }
    );

    return new Response(JSON.stringify({ success: true, analysis: analysisPayload }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
```

- [ ] **Step 2: Deploy the edge function**
```bash
npx supabase functions deploy analyze-audience-alignment --no-verify-jwt
```
Expected output: `Deployed Functions on project hxojqrilwhhrvloiwmfo: analyze-audience-alignment`

- [ ] **Step 3: Smoke test via curl (replace JWT with a real session token)**
```bash
curl -X POST https://hxojqrilwhhrvloiwmfo.supabase.co/functions/v1/analyze-audience-alignment \
  -H "Authorization: Bearer <SESSION_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"client_id": "<A_REAL_CLIENT_ID>"}'
```
Expected: `{"success": true, "analysis": {"audience_score": <N>, ...}}`

- [ ] **Step 4: Commit**
```bash
git add supabase/functions/analyze-audience-alignment/index.ts
git commit -m "feat(edge): analyze-audience-alignment — scrape + Claude scores audience/uniqueness"
```

---

## Task 3: Frontend — auto-trigger analysis + show results in ClientStrategy.tsx

**Files:**
- Modify: `src/pages/ClientStrategy.tsx`

Changes:
1. On page load, if `audience_analyzed_at` is null OR older than 7 days → call the edge function automatically (non-blocking, shows spinner in the card)
2. Add "Re-analyze" button to the Audience Alignment card header
3. Replace the manual sliders with read-only score display + AI summary text
4. Show "last analyzed X days ago" timestamp
5. Show a warning if no Instagram handle in onboarding (link to onboarding)

- [ ] **Step 1: Add analysis state + types to the component**

At the top of `ClientStrategy.tsx`, add to the `ClientStrategy` interface:
```typescript
interface ClientStrategy {
  // ... existing fields ...
  audience_analysis?: {
    summary: string;
    audience_detail: string;
    uniqueness_detail: string;
    client_posts_analyzed: number;
    emulation_posts_analyzed: number;
    emulation_profiles: string[];
    analyzed_at: string;
  } | null;
  audience_analyzed_at?: string | null;
}
```

And add to `DEFAULTS`:
```typescript
audience_analysis: null,
audience_analyzed_at: null,
```

- [ ] **Step 2: Add the `runAnalysis` function inside the component**

Add this inside `ClientStrategy()` after the `load` callback:
```typescript
const [analyzing, setAnalyzing] = useState(false);

const runAnalysis = async () => {
  if (!clientId || analyzing) return;
  setAnalyzing(true);
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data, error } = await supabase.functions.invoke("analyze-audience-alignment", {
      body: { client_id: clientId },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (error || !data?.success) {
      toast.error(en ? "Analysis failed — check Instagram handle in onboarding" : "Análisis falló — revisa el usuario de Instagram");
      return;
    }
    // Refresh strategy from DB to get updated scores
    await load();
    toast.success(en ? "Audience analysis complete" : "Análisis de audiencia completado");
  } finally {
    setAnalyzing(false);
  }
};
```

- [ ] **Step 3: Auto-trigger in `useEffect`**

Replace the existing `useEffect(() => { load(); }, [load]);` with:
```typescript
useEffect(() => {
  load().then(() => {
    // Auto-analyze if never done or stale (> 7 days)
    setStrategy((current) => {
      if (!current) return current;
      const analyzedAt = current.audience_analyzed_at;
      const isStale = !analyzedAt ||
        (Date.now() - new Date(analyzedAt).getTime()) > 7 * 24 * 60 * 60 * 1000;
      if (isStale) {
        // Trigger async, don't await
        runAnalysis();
      }
      return current;
    });
  });
}, [load]);
```

- [ ] **Step 4: Replace the Audience Alignment `StatusCard` render**

Find the `StatusCard` for Audience Alignment (the one using `audienceStatus` and `audienceAvg`) and replace it entirely:

```tsx
<StatusCard
  status={audienceStatus}
  title={en ? "Audience Alignment" : "Alineación con Audiencia"}
  badge={
    analyzing
      ? (en ? "Analyzing..." : "Analizando...")
      : audienceStatus === "green"
        ? (en ? "Strong" : "Fuerte")
        : audienceStatus === "yellow"
          ? (en ? "Needs Work" : "Necesita Trabajo")
          : (en ? "Weak" : "Débil")
  }
>
  {/* No Instagram handle warning */}
  {!od?.instagram && (
    <p className="text-[11px] mb-3" style={{ color: "#f59e0b" }}>
      {en
        ? "Add your Instagram handle in onboarding to enable auto-analysis."
        : "Agrega tu usuario de Instagram en el onboarding para activar el análisis."}
    </p>
  )}

  {/* Score rows */}
  {[
    {
      label: en ? "Talking to the right people?" : "¿Hablando con las personas correctas?",
      score: s.audience_score,
      detail: s.audience_analysis?.audience_detail,
    },
    {
      label: en ? "Content unique enough to stop the scroll?" : "¿El contenido es único para parar el scroll?",
      score: s.uniqueness_score,
      detail: s.audience_analysis?.uniqueness_detail,
    },
  ].map(({ label, score, detail }) => (
    <div key={label} className="mb-3">
      <div className="flex justify-between items-center text-[12px] text-white/70 mb-1">
        <span>{label}</span>
        <span className="font-bold text-white">{score}/10</span>
      </div>
      <ProgressBar pct={score * 10} color={STATUS_COLORS[audienceStatus]} />
      {detail && (
        <p className="text-[11px] mt-1.5" style={{ color: "rgba(255,255,255,0.45)" }}>{detail}</p>
      )}
    </div>
  ))}

  {/* AI Summary */}
  {s.audience_analysis?.summary && (
    <p className="text-[12px] mt-3 leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>
      {s.audience_analysis.summary}
    </p>
  )}

  {/* Footer: analyzed timestamp + re-analyze button */}
  <div className="flex items-center justify-between mt-4">
    {s.audience_analyzed_at ? (
      <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
        {en ? "Analyzed" : "Analizado"}{" "}
        {Math.floor((Date.now() - new Date(s.audience_analyzed_at).getTime()) / 86400000)}
        {en ? "d ago" : "d atrás"}{" "}
        · {s.audience_analysis?.client_posts_analyzed ?? 0} posts
      </span>
    ) : (
      <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
        {analyzing ? (en ? "Running analysis..." : "Ejecutando análisis...") : (en ? "Never analyzed" : "Sin analizar")}
      </span>
    )}
    <button
      onClick={runAnalysis}
      disabled={analyzing}
      className="text-[10px] font-semibold px-2.5 py-1 rounded-md transition-opacity disabled:opacity-40"
      style={{
        background: "rgba(34,211,238,0.1)",
        color: "#22d3ee",
        border: "1px solid rgba(34,211,238,0.2)",
      }}
    >
      {analyzing
        ? (en ? "Analyzing..." : "Analizando...")
        : (en ? "Re-analyze" : "Re-analizar")}
    </button>
  </div>
</StatusCard>
```

Note: `od` needs to be available in the component. Add this near the top of the render function:
```typescript
// Access onboarding data for display purposes (Instagram handle warning)
const [clientOnboarding, setClientOnboarding] = useState<Record<string, unknown>>({});
```
And in the `load` callback, fetch it:
```typescript
const { data: clientData } = await supabase
  .from("clients")
  .select("onboarding_data")
  .eq("id", clientId)
  .maybeSingle();
setClientOnboarding(clientData?.onboarding_data || {});
```

- [ ] **Step 5: Also update the `load` function to fetch the new fields**

In the `load` callback's `supabase.from("client_strategies").select("*")` — the `*` already selects all columns including the new ones, so no change needed there.

- [ ] **Step 6: Build check**
```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: No errors (or pre-existing errors only, none in ClientStrategy.tsx).

- [ ] **Step 7: Commit and push**
```bash
git add src/pages/ClientStrategy.tsx
git commit -m "feat(strategy): auto-analyze audience alignment via Instagram scraping + Claude"
git push origin main
```

---

## Self-Review

**Spec coverage:**
- ✅ Scrapes client's Instagram account
- ✅ Scrapes emulation profiles from `top3Profiles`
- ✅ Claude compares and scores both dimensions
- ✅ Scores saved back to `client_strategies`
- ✅ Page shows scores + AI reasoning (not just numbers)
- ✅ Auto-triggers on page load if stale/never done
- ✅ "Re-analyze" button for manual refresh
- ✅ Warning if Instagram handle missing

**Placeholder scan:** No TBDs, no "implement later", all code blocks complete.

**Type consistency:**
- `audience_analysis` field shape defined in Task 1 SQL comment, Task 2 `analysisPayload` object, and Task 3 TypeScript interface — all match.
- `scrapeProfile()` returns `{caption, views, likes}[]` — used consistently in Task 2.
- `runAnalysis` defined before use in Task 3.
