// Free (0-credit) lazy backfill: generates and caches framework_meta.hook_template
// for already-analyzed rows that don't have one yet.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

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
    .select("id, hook_text, transcript, caption, framework_meta, analysis_status")
    .eq("id", body.viral_video_id)
    .single();
  if (rowErr || !row) return json({ error: "row_not_found" }, 404);

  // Cache hit — already templatized.
  const existingTemplate = (row.framework_meta as Record<string, unknown> | null)?.hook_template;
  if (typeof existingTemplate === "string" && existingTemplate.length > 0) {
    return json({ hook_template: existingTemplate, cached: true }, 200);
  }

  if (row.analysis_status !== "analyzed") {
    return json({ error: "not_analyzed", message: "Analyze the video first" }, 400);
  }

  const sourceHook = (row.hook_text as string | null) ??
    ((row.transcript as string | null) ?? "").split(/\s+/).slice(0, 30).join(" ");
  if (!sourceHook || sourceHook.trim().length === 0) {
    return json({ error: "no_hook_text" }, 400);
  }

  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) return json({ error: "anthropic_missing_key" }, 500);

  const prompt = `Convert this video hook into a reusable template by replacing specific numbers, names, niches, products, dollar amounts, and concrete nouns with ALL-CAPS bracketed placeholders like [NICHE], [METRIC], [NUMBER], [PRODUCT], [PAIN POINT]. Keep the rhythm, sentence structure, and emotional beats intact. Match the source language.

CAPTION: ${(row.caption as string | null ?? "").slice(0, 200)}
HOOK: ${sourceHook.slice(0, 600)}

Output ONLY the templatized hook as a plain string, no JSON, no quotes, no preamble.`;

  const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!aiRes.ok) {
    const errText = await aiRes.text();
    return json({ error: "haiku_failed", message: errText.slice(0, 500) }, 500);
  }
  const aiBody = await aiRes.json();
  let template = (aiBody.content?.[0]?.text as string ?? "").trim();
  template = template.replace(/^["']|["']$/g, "").trim().slice(0, 400);

  if (!template) return json({ error: "empty_template" }, 500);

  // Cache it.
  const meta = (row.framework_meta as Record<string, unknown> | null) ?? {};
  const newMeta = { ...meta, hook_template: template };
  const { error: updateErr } = await admin
    .from("viral_videos")
    .update({ framework_meta: newMeta })
    .eq("id", row.id);
  if (updateErr) {
    return json({ error: "cache_update_failed", message: updateErr.message, hook_template: template }, 200);
  }

  return json({ hook_template: template, cached: false }, 200);
});
