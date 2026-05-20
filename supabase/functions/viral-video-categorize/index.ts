// supabase/functions/viral-video-categorize/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import {
  isValidContentFormat,
  normalizeNicheSlug,
  type ContentFormat,
} from "../_shared/video-taxonomy.ts";
import { logAnthropicUsage } from "../_shared/log-anthropic-usage.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405, headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userResult } = await userClient.auth.getUser();
  if (!userResult?.user) return json({ error: "unauthorized" }, 401);

  let body: { viral_video_id?: string };
  try { body = await req.json(); } catch { body = {}; }
  if (!body.viral_video_id) return json({ error: "missing_viral_video_id" }, 400);

  const { data: row, error: rowErr } = await admin
    .from("viral_videos")
    .select("id, caption, transcript, framework_meta, content_format, primary_niche, analysis_status")
    .eq("id", body.viral_video_id)
    .single();
  if (rowErr || !row) return json({ error: "row_not_found" }, 404);

  // Cache hit — both already set.
  if (row.content_format && row.primary_niche) {
    return json({
      content_format: row.content_format,
      primary_niche: row.primary_niche,
      cached: true,
    }, 200);
  }

  if (row.analysis_status !== "analyzed") {
    return json({ error: "not_analyzed", message: "Analyze the video first" }, 400);
  }

  const isCaptionStyle = Boolean((row.framework_meta as Record<string, unknown> | null)?.is_caption_style);
  const segments = (row.framework_meta as { visual_segments?: Array<{ description?: string; text_on_screen?: string[] }> } | null)?.visual_segments ?? [];
  const visualHints = segments
    .slice(0, 6)
    .map((s) => s.description ?? (s.text_on_screen ?? []).join(" / "))
    .filter(Boolean)
    .join(" | ");

  const transcript = (row.transcript as string | null) ?? "";
  const caption = (row.caption as string | null) ?? "";
  if (!transcript.trim() && !visualHints) {
    return json({ error: "no_content_to_classify" }, 400);
  }

  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) return json({ error: "anthropic_missing_key" }, 500);

  const prompt = `Classify this video into ONE content_format and ONE primary_niche.

content_format MUST be EXACTLY one of these 11:
- caption_post: text-on-screen + music, no spoken narration
- storytelling: personal anecdote/origin story/lived experience as the spine
- educational: explains a concept or framework conceptually (theory-first, not steps)
- comparison: X vs Y framing, split-screen, before/after, "this person did X vs Y"
- authority: strong stance / hot take / "everyone is wrong about X" / contrarian claim
- reaction: directly responds to another creator's video, trend, or news clip
- listicle: enumerated "Top N", "5 things", numbered countdown
- tutorial: procedural step-by-step "do this, then this" / "how to" demonstration
- vlog: day-in-the-life, behind-the-scenes, lifestyle footage
- selling: product-centered with explicit purchase CTA
- funny: comedy / skit / parody where humor is the primary purpose

PRIORITY RULES — apply IN THIS ORDER. The first rule that matches WINS, ignore later candidates:
1. Split-screen, side-by-side panels, "X vs Y" framing visible on screen, or explicit before/after → comparison
2. Numbered list visible on screen or spoken ("1...", "2...", "Top 5", "3 things") → listicle
3. Direct response to another video/clip/trend (stitch, duet, "let me react to this") → reaction
4. Day-in-the-life / behind-the-scenes / "come with me" / lifestyle vlog footage → vlog
5. Pure text-on-screen narrative with music, no voice → caption_post
6. Comedy skit / character / parody where the joke IS the content → funny
7. Step-by-step procedural demonstration ("first do X, then Y") → tutorial
8. Contrarian / "you're wrong about X" / hot take with strong claim → authority
9. Product-centric with buy/get/order CTA → selling
10. Personal narrative ("when I was…", "this happened to me") → storytelling
11. Concept/framework explanation, no specific procedure → educational

EXAMPLES:
- "$1,000 Salesman vs $1M Salesman" split-screen → comparison (rule 1 wins over tutorial)
- "5 things I wish I knew before launching" → listicle (rule 2 wins over educational)
- "Reacting to this viral marketing fail" → reaction (rule 3 wins over authority)
- "Step 1: open the app. Step 2: tap…" → tutorial (rule 7)
- "Stop telling people to grind. It's killing them." (no split-screen, no list) → authority (rule 8)
- "Why fascia matters for hip mobility" (concept, no steps) → educational (rule 11)
- "How I lost 50K followers in a week" (personal narrative) → storytelling (rule 10)

primary_niche: STRONGLY PREFER one of: personal_branding, fitness, sales, real_estate, finance, ecommerce, coaching, saas_tech, beauty, food, mindset, relationships, education, lifestyle, parenting.
If the video clearly fits none of those (religion, gaming, comedy, politics, true_crime, art, music, etc.), output a new short snake_case slug. EXACTLY ONE niche.

CAPTION: ${caption.slice(0, 300)}

${isCaptionStyle ? "TEXT ON SCREEN" : "TRANSCRIPT"}: ${transcript.slice(0, 2000)}

VISUAL HINTS: ${visualHints.slice(0, 500)}

Output ONLY a JSON object: {"content_format": "<slug>", "primary_niche": "<slug>"}. No commentary.`;

  const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!aiRes.ok) {
    const errText = await aiRes.text();
    return json({ error: "haiku_failed", message: errText.slice(0, 500) }, 500);
  }
  const aiBody = await aiRes.json();
  if (aiBody?.usage) logAnthropicUsage(admin, {
    functionName: "viral-video-categorize", model: "claude-haiku-4-5-20251001",
    usage: aiBody.usage, userId: null,
  });
  let raw = (aiBody.content?.[0]?.text as string ?? "").trim();
  raw = raw.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/\s*```$/, "").trim();

  let parsed: { content_format?: unknown; primary_niche?: unknown };
  try { parsed = JSON.parse(raw); } catch {
    return json({ error: "haiku_no_json", raw }, 500);
  }

  const rawFormat = typeof parsed.content_format === "string" ? parsed.content_format.trim().toLowerCase() : null;
  const contentFormat: ContentFormat = isValidContentFormat(rawFormat)
    ? rawFormat
    : (isCaptionStyle ? "caption_post" : "storytelling");

  const primaryNiche = normalizeNicheSlug(typeof parsed.primary_niche === "string" ? parsed.primary_niche : null);
  if (!primaryNiche) {
    return json({ error: "no_niche_returned", raw }, 500);
  }

  const { error: updateErr } = await admin
    .from("viral_videos")
    .update({ content_format: contentFormat, primary_niche: primaryNiche })
    .eq("id", row.id);
  if (updateErr) {
    return json({
      content_format: contentFormat,
      primary_niche: primaryNiche,
      cached: false,
      cache_update_failed: updateErr.message,
    }, 200);
  }

  return json({ content_format: contentFormat, primary_niche: primaryNiche, cached: false }, 200);
});
