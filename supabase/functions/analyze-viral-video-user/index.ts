// supabase/functions/analyze-viral-video-user/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { runFullAnalysis, type ViralVideoRow, AnalyzerError } from "../_shared/viral-video-analyzer.ts";
import { deductCredits, refundCredits } from "../_shared/credits.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CREDIT_COST = 50;
const ACTION = "analyze_viral_video";

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

  // Auth.
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userResult } = await userClient.auth.getUser();
  const user = userResult?.user;
  if (!user) return json({ error: "unauthorized" }, 401);

  // Parse body.
  let body: { viral_video_id?: string };
  try { body = await req.json(); } catch { body = {}; }
  if (!body.viral_video_id) return json({ error: "missing_viral_video_id" }, 400);

  // Load row.
  const { data: rowRaw, error: rowErr } = await admin
    .from("viral_videos")
    .select("*")
    .eq("id", body.viral_video_id)
    .single();
  if (rowErr || !rowRaw) return json({ error: "row_not_found" }, 404);
  const row = rowRaw as ViralVideoRow & { caption: string | null };

  // Noop if already fully analyzed and file is still valid.
  if (
    row.analysis_status === "analyzed" &&
    row.video_file_url &&
    row.video_file_expires_at &&
    new Date(row.video_file_expires_at) > new Date()
  ) {
    return json({ row, status: "noop_cached" }, 200);
  }

  // 409 if another analyze is in flight.
  if (row.analysis_status === "analyzing") {
    return json({ error: "in_progress", row }, 409);
  }

  // Claim the row atomically (only from pending/failed/analyzed-but-expired).
  const { data: claimedRaw, error: claimErr } = await admin
    .from("viral_videos")
    .update({ analysis_status: "analyzing", analysis_error: null })
    .eq("id", row.id)
    .in("analysis_status", ["pending", "failed", "analyzed"])
    .select("*")
    .single();
  if (claimErr || !claimedRaw) return json({ error: "claim_failed", message: claimErr?.message }, 409);
  const claimed = claimedRaw as ViralVideoRow & { caption: string | null };

  // ─── Credit policy ───
  // - Fresh analysis (no transcript yet): 50 credits — the Whisper step is the
  //   bulk of our cost.
  // - Partial cache (transcript already on the row, but visual breakdown or
  //   file missing): FREE. The user paid for the transcript previously; we
  //   only owe the marginal cost of the multimodal call + Haiku tagging
  //   (~$0.006), well below threshold for charging again.
  const hasCachedTranscript = typeof claimed.transcript === "string" && claimed.transcript.trim().length > 0;
  if (!hasCachedTranscript) {
    const deductErr = await deductCredits(admin, user.id, ACTION, CREDIT_COST);
    if (deductErr) {
      // Revert claim.
      await admin.from("viral_videos").update({ analysis_status: "pending" }).eq("id", row.id);
      return json({ error: "insufficient_credits", details: deductErr }, 402);
    }
  }

  // Run pipeline.
  try {
    const patch = await runFullAnalysis(admin, claimed, claimed.caption, supabaseUrl, serviceKey);
    const { data: updated, error: updateErr } = await admin
      .from("viral_videos")
      .update({ ...patch, analysis_status: "analyzed", analysis_error: null })
      .eq("id", row.id)
      .select("*")
      .single();
    if (updateErr) throw new AnalyzerError("db_update_failed", updateErr.message);
    return json({ row: updated, status: "analyzed", free: hasCachedTranscript }, 200);
  } catch (err) {
    const code = err instanceof AnalyzerError ? err.code : "unknown_error";
    const message = err instanceof Error ? err.message : String(err);
    await admin.from("viral_videos")
      .update({ analysis_status: "failed", analysis_error: `${code}: ${message}` })
      .eq("id", row.id);
    // Only refund if we actually charged.
    if (!hasCachedTranscript) {
      await refundCredits(admin, user.id, ACTION, CREDIT_COST);
    }
    return json({ error: code, message }, 500);
  }
});
