// supabase/functions/viral-video-refresh-file/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { acquireVideoFile, type ViralVideoRow, AnalyzerError } from "../_shared/viral-video-analyzer.ts";

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
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userResult } = await userClient.auth.getUser();
  if (!userResult?.user) return json({ error: "unauthorized" }, 401);

  let body: { viral_video_id?: string };
  try { body = await req.json(); } catch { body = {}; }
  if (!body.viral_video_id) return json({ error: "missing_viral_video_id" }, 400);

  const { data: rowRaw, error: rowErr } = await admin
    .from("viral_videos")
    .select("*")
    .eq("id", body.viral_video_id)
    .single();
  if (rowErr || !rowRaw) return json({ error: "row_not_found" }, 404);
  const row = rowRaw as ViralVideoRow;

  if (row.analysis_status !== "analyzed") {
    return json({ error: "not_analyzed", message: "Use /analyze-viral-video-user instead" }, 400);
  }

  try {
    // Pass a row with nulled video_file_url so acquireVideoFile re-downloads.
    const { video_file_url, video_file_expires_at } = await acquireVideoFile(admin, {
      ...row,
      video_file_url: null,
      video_file_expires_at: null,
    });
    const { data: updated } = await admin
      .from("viral_videos")
      .update({ video_file_url, video_file_expires_at })
      .eq("id", row.id)
      .select("*")
      .single();
    return json({ row: updated }, 200);
  } catch (err) {
    if (err instanceof AnalyzerError && (err.code === "cobalt_failed" || err.code === "cobalt_no_url")) {
      return json({ error: "source_unavailable", message: "Original video URL is no longer reachable" }, 410);
    }
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: "refresh_failed", message }, 500);
  }
});
