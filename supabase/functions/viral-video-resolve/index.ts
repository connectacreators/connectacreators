// supabase/functions/viral-video-resolve/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { canonicalizeVideoUrl } from "../_shared/canonicalize-video-url.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status: number): Response {
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

  // Auth: require user JWT.
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return jsonResponse({ error: "unauthorized" }, 401);
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userResult } = await userClient.auth.getUser();
  const user = userResult?.user;
  if (!user) return jsonResponse({ error: "unauthorized" }, 401);

  let body: { url?: string };
  try { body = await req.json(); } catch { body = {}; }
  if (!body.url) return jsonResponse({ error: "missing_url" }, 400);

  const canonical = canonicalizeVideoUrl(body.url);
  if (!canonical) return jsonResponse({ error: "unsupported_url" }, 400);

  // Find by (platform, apify_video_id).
  const { data: existing, error: findErr } = await admin
    .from("viral_videos")
    .select("*")
    .eq("platform", canonical.platform)
    .eq("apify_video_id", canonical.postId)
    .maybeSingle();
  if (findErr) return jsonResponse({ error: "db_error", message: findErr.message }, 500);
  if (existing) return jsonResponse({ row: existing, created: false }, 200);

  // Best-effort channel_username extraction from URL.
  let channelUsername = "unknown";
  const igHandle = canonical.normalizedUrl.match(/instagram\.com\/([^/]+)\/(?:reel|p)\//);
  const ttHandle = body.url.match(/tiktok\.com\/@([^/]+)\/video\//);
  if (igHandle) channelUsername = igHandle[1];
  else if (ttHandle) channelUsername = ttHandle[1];

  // Insert pending stub.
  const insertPayload = {
    platform: canonical.platform,
    apify_video_id: canonical.postId,
    video_url: canonical.normalizedUrl,
    channel_username: channelUsername,
    analysis_status: "pending",
    user_submitted: true,
    submitted_by: user.id,
    outlier_score: 0,
    views_count: 0,
    likes_count: 0,
    comments_count: 0,
    scraped_at: new Date().toISOString(),
  };

  const { data: inserted, error: insertErr } = await admin
    .from("viral_videos")
    .insert(insertPayload)
    .select("*")
    .single();

  if (insertErr) {
    // 23505 = unique violation; race with another resolver. Re-select.
    if (insertErr.code === "23505") {
      const { data: winner } = await admin
        .from("viral_videos")
        .select("*")
        .eq("platform", canonical.platform)
        .eq("apify_video_id", canonical.postId)
        .single();
      if (winner) return jsonResponse({ row: winner, created: false }, 200);
    }
    return jsonResponse({ error: "insert_failed", message: insertErr.message }, 500);
  }

  return jsonResponse({ row: inserted, created: true }, 201);
});
