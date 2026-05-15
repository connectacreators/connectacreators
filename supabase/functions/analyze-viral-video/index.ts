// supabase/functions/analyze-viral-video/index.ts
// Orchestrator: takes a viral_videos row, calls the shared runFullAnalysis pipeline,
// then writes results back to the row.
//
// Idempotent: if transcribed_at IS NOT NULL on the row, returns immediately.
// Threshold: only processes videos where outlier_score >= 5 AND views_count >= 500000.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { runFullAnalysis, type ViralVideoRow, AnalyzerError } from "../_shared/viral-video-analyzer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MIN_OUTLIER_SCORE = 5;
const MIN_VIEWS = 500_000;

interface RequestBody {
  video_id: string;
  force?: boolean; // re-analyze even if transcribed_at exists
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: RequestBody;
  try {
    body = await req.json() as RequestBody;
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!body.video_id) {
    return new Response(JSON.stringify({ error: "missing video_id" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 1. Load the row
  const { data: video, error: videoErr } = await admin
    .from("viral_videos")
    .select("id, video_url, caption, channel_username, outlier_score, views_count, transcript, transcribed_at, platform, apify_video_id, framework_meta, video_file_url, video_file_expires_at, analysis_status")
    .eq("id", body.video_id)
    .maybeSingle();

  if (videoErr || !video) {
    return new Response(JSON.stringify({ error: `video not found: ${body.video_id}` }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 2. Idempotency check
  if (video.transcribed_at && !body.force) {
    return new Response(JSON.stringify({ skipped: true, reason: "already_analyzed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 3. Threshold check
  const outlier = Number(video.outlier_score ?? 0);
  const views = Number(video.views_count ?? 0);
  if (outlier < MIN_OUTLIER_SCORE || views < MIN_VIEWS) {
    return new Response(JSON.stringify({
      skipped: true,
      reason: "below_threshold",
      outlier_score: outlier,
      views_count: views,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  if (!video.video_url) {
    return new Response(JSON.stringify({ error: "no video_url on row" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 4. Run the unified pipeline.
  let patch;
  try {
    patch = await runFullAnalysis(
      admin,
      video as ViralVideoRow,
      (video as any).caption ?? null,
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
    );
  } catch (err) {
    const code = err instanceof AnalyzerError ? err.code : "unknown_error";
    const message = err instanceof Error ? err.message : String(err);
    await admin.from("viral_videos")
      .update({ analysis_status: "failed", analysis_error: `${code}: ${message}` })
      .eq("id", body.video_id);
    return new Response(JSON.stringify({ error: code, message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 5. Persist.
  const { error: updateErr } = await admin
    .from("viral_videos")
    .update({ ...patch, analysis_status: "analyzed", analysis_error: null })
    .eq("id", body.video_id);

  if (updateErr) {
    console.error("[analyze-viral-video] update failed:", updateErr);
    return new Response(JSON.stringify({ error: "db_update_failed", details: updateErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({
    success: true,
    video_id: body.video_id,
    transcript_length: patch.transcript.length,
    has_structure: !!patch.framework_meta?.visual_segments && (patch.framework_meta.visual_segments as unknown[]).length > 0,
    niche_tags: (patch.framework_meta?.niche_tags as string[]) ?? [],
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
