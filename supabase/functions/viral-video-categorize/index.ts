// supabase/functions/viral-video-categorize/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import {
  isValidContentFormat,
  normalizeNicheSlug,
  type ContentFormat,
} from "../_shared/video-taxonomy.ts";

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

  const prompt = `Classify this video into a content_format (closed enum) and a primary_niche (canonical-preferred, extensible).

content_format MUST be EXACTLY one of these 11:
- caption_post: text-on-screen + music, no spoken narration
- storytelling: personal anecdote, origin story, narrative
- educational: teaches a concept or framework (theory > steps)
- comparison: X vs Y, before/after
- authority: strong stance, hot take, calls out misconception
- reaction: responds to another video/trend/content
- listicle: "Top 5", enumerated structure
- tutorial: procedural step-by-step
- vlog: day-in-the-life, behind-the-scenes
- selling: product-focused with CTA
- funny: comedy/skit/parody

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
