import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { VIRAL_HOOKS, type HookFormula } from "./hookData.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  educational: "Stats, facts, how-to, tips, tutorials, Did you know hooks",
  comparison: "Before/after, A vs B, Most people X but, side-by-side hooks",
  mythBusting: "Debunking myths, Stop doing X, correcting misconceptions",
  storytelling: "Personal stories, narrative-driven, X years ago I hooks",
  random: "Surprising revelations, unexpected twists, shocking statements",
  authority: "Credibility, experience, transformation, results-based hooks",
  dayInTheLife: "Daily routines, behind-the-scenes, A day as a hooks",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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
    let relevantCategories: string[] = [];
    try {
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

      if (categoryRes.ok) {
        const catData = await categoryRes.json();
        const catText = catData.content?.[0]?.text || "[]";
        const match = catText.match(/\[.*\]/s);
        if (match) {
          try { relevantCategories = JSON.parse(match[0]); } catch { /* ignore */ }
        }
      }
    } catch (e) {
      console.error("[suggest-hooks] Category pre-filter failed:", e);
    }

    // Filter to relevant categories (fallback: use all)
    let pool = relevantCategories.length > 0
      ? available.filter(h => relevantCategories.includes(h.category))
      : available;

    if (pool.length < 5) {
      pool = available;
    }

    // 5. Ask Claude Haiku to pick the 5 best hooks
    const hookListStr = pool.map(h => `${h.id}: "${h.template}" [${h.category}]`).join("\n");

    let selectedIds: string[] = [];
    try {
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

      if (rankRes.ok) {
        const rankData = await rankRes.json();
        const rankText = rankData.content?.[0]?.text || "[]";
        const match = rankText.match(/\[.*\]/s);
        if (match) {
          try { selectedIds = JSON.parse(match[0]); } catch { /* ignore */ }
        }
      }
    } catch (e) {
      console.error("[suggest-hooks] Hook ranking failed:", e);
    }

    // Build response
    const hooksById = Object.fromEntries(pool.map(h => [h.id, h]));
    const hooks: HookFormula[] = selectedIds
      .map(id => hooksById[id])
      .filter(Boolean)
      .slice(0, 5);

    // Fallback: if AI selection failed, pick 5 random from pool
    if (hooks.length === 0) {
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      hooks.push(...shuffled.slice(0, 5));
    }

    console.log(`[suggest-hooks] topic="${normalizedTopic}" returned=${hooks.length} reset=${reset} pool=${pool.length}`);

    return new Response(JSON.stringify({ hooks, reset }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[suggest-hooks] Error:", e);
    return new Response(JSON.stringify({ error: e.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
