// supabase/functions/viral-analyze-queue/index.ts
//
// Server-side background batch for viral video analysis. Replaces the old
// browser-bound bulk-analyze loop (closing the tab used to silently drop all
// undispatched work).
//
// Two actions:
//   { action: "enqueue", viral_video_ids: [...] }   — user JWT. Inserts queue
//     rows (batch_id groups them) and returns immediately. The UI reads
//     progress straight from viral_analyze_queue (RLS: requester's own rows).
//   { action: "drain" }                             — x-cron-secret, called by
//     pg_cron every minute. Claims queued rows and runs the same pipeline +
//     credit policy as /analyze-viral-video-user until the time budget runs out.
//
// Failure semantics per drained row:
//   - insufficient credits            → failed (no retry — it won't fix itself)
//   - video already being analyzed    → requeued (retries next drain, max 5)
//   - pipeline error                  → failed + credits refunded if charged
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { runFullAnalysis, type ViralVideoRow, AnalyzerError } from "../_shared/viral-video-analyzer.ts";
import { deductCredits, refundCredits } from "../_shared/credits.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CRON_SECRET = "connectacreators-cron-2026";
const CREDIT_COST = 50;
const ACTION = "analyze_viral_video";
const MAX_ENQUEUE = 100;
const MAX_ATTEMPTS = 5;
const DRAIN_CONCURRENCY = 2;
const DRAIN_DEADLINE_MS = 110_000; // edge wall clock is ~150s; leave headroom
const STALE_CLAIM_MINUTES = 15;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type QueueRow = {
  id: string;
  viral_video_id: string;
  requested_by: string;
  attempts: number;
};

async function processQueueRow(
  admin: SupabaseClient,
  supabaseUrl: string,
  serviceKey: string,
  q: QueueRow,
): Promise<void> {
  const finish = (status: string, error: string | null = null) =>
    admin
      .from("viral_analyze_queue")
      .update({ status, error, finished_at: new Date().toISOString() })
      .eq("id", q.id);
  const requeue = (reason: string) =>
    q.attempts >= MAX_ATTEMPTS
      ? finish("failed", `gave up after ${q.attempts} attempts: ${reason}`)
      : admin
          .from("viral_analyze_queue")
          .update({ status: "queued", started_at: null, error: reason })
          .eq("id", q.id);

  const { data: rowRaw } = await admin
    .from("viral_videos")
    .select("*")
    .eq("id", q.viral_video_id)
    .single();
  if (!rowRaw) {
    await finish("failed", "video row not found");
    return;
  }
  const row = rowRaw as ViralVideoRow & {
    caption: string | null;
    transcript_status: string | null;
    analysis_claimed_at: string | null;
  };

  // Already fully analyzed with a live file → nothing to do.
  if (
    row.analysis_status === "analyzed" &&
    row.video_file_url &&
    row.video_file_expires_at &&
    new Date(row.video_file_expires_at) > new Date()
  ) {
    await finish("done");
    return;
  }

  if (row.transcript_status === "processing") {
    await requeue("pre-transcribe in flight");
    return;
  }

  // Claim the video row (same semantics as analyze-viral-video-user, incl.
  // stale-claim takeover).
  const staleCutoff = new Date(Date.now() - STALE_CLAIM_MINUTES * 60 * 1000);
  const { data: claimedRaw } = await admin
    .from("viral_videos")
    .update({
      analysis_status: "analyzing",
      analysis_error: null,
      analysis_claimed_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .or(
      `analysis_status.in.(pending,failed,analyzed),` +
        `and(analysis_status.eq.analyzing,analysis_claimed_at.is.null),` +
        `and(analysis_status.eq.analyzing,analysis_claimed_at.lt.${staleCutoff.toISOString()})`,
    )
    .select("*")
    .single();
  if (!claimedRaw) {
    await requeue("video claimed by another analysis");
    return;
  }
  const claimed = claimedRaw as ViralVideoRow & { caption: string | null };

  // Same credit policy as the interactive path: fresh transcript costs 50,
  // cached transcript is free. Privileged roles skip deduction inside
  // deductCredits.
  const hasCachedTranscript = typeof claimed.transcript === "string" && claimed.transcript.trim().length > 0;
  if (!hasCachedTranscript) {
    const deductErr = await deductCredits(admin, q.requested_by, ACTION, CREDIT_COST);
    if (deductErr) {
      await admin.from("viral_videos").update({ analysis_status: "pending" }).eq("id", row.id);
      await finish("failed", `insufficient_credits: ${deductErr}`);
      return;
    }
  }

  try {
    const patch = await runFullAnalysis(admin, claimed, claimed.caption, supabaseUrl, serviceKey);
    const { error: updateErr } = await admin
      .from("viral_videos")
      .update({ ...patch, analysis_status: "analyzed", analysis_error: null })
      .eq("id", row.id);
    if (updateErr) throw new AnalyzerError("db_update_failed", updateErr.message);
    await finish("done");
  } catch (err) {
    const code = err instanceof AnalyzerError ? err.code : "unknown_error";
    const message = err instanceof Error ? err.message : String(err);
    await admin
      .from("viral_videos")
      .update({ analysis_status: "failed", analysis_error: `${code}: ${message}` })
      .eq("id", row.id);
    if (!hasCachedTranscript) {
      await refundCredits(admin, q.requested_by, ACTION, CREDIT_COST);
    }
    await finish("failed", `${code}: ${message}`.slice(0, 500));
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  let body: { action?: string; viral_video_ids?: string[] };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // ─── drain (cron) ───
  if (body.action === "drain") {
    if (req.headers.get("x-cron-secret") !== CRON_SECRET) return json({ error: "unauthorized" }, 401);

    const deadline = Date.now() + DRAIN_DEADLINE_MS;
    let processed = 0;

    const worker = async () => {
      while (Date.now() < deadline) {
        // Oldest queued candidates; claim one atomically (status flip races
        // are settled by the .eq("status","queued") guard).
        const { data: candidates } = await admin
          .from("viral_analyze_queue")
          .select("id, viral_video_id, requested_by, attempts")
          .eq("status", "queued")
          .order("created_at", { ascending: true })
          .limit(5);
        if (!candidates || candidates.length === 0) return;

        let mine: QueueRow | null = null;
        for (const c of candidates as QueueRow[]) {
          const { data: claimed } = await admin
            .from("viral_analyze_queue")
            .update({ status: "running", started_at: new Date().toISOString(), attempts: c.attempts + 1 })
            .eq("id", c.id)
            .eq("status", "queued")
            .select("id, viral_video_id, requested_by, attempts")
            .single();
          if (claimed) {
            mine = claimed as QueueRow;
            break;
          }
        }
        if (!mine) continue;

        await processQueueRow(admin, supabaseUrl, serviceKey, mine);
        processed++;
      }
    };

    await Promise.all(Array.from({ length: DRAIN_CONCURRENCY }, () => worker()));

    // Un-stick queue rows whose invocation died mid-run (edge crash): running
    // for >20 minutes goes back to queued (or failed once attempts run out).
    await admin
      .from("viral_analyze_queue")
      .update({ status: "queued", started_at: null, error: "drain invocation died — requeued" })
      .eq("status", "running")
      .lt("started_at", new Date(Date.now() - 20 * 60 * 1000).toISOString())
      .lt("attempts", MAX_ATTEMPTS);
    await admin
      .from("viral_analyze_queue")
      .update({ status: "failed", error: "gave up: drain invocations kept dying", finished_at: new Date().toISOString() })
      .eq("status", "running")
      .lt("started_at", new Date(Date.now() - 20 * 60 * 1000).toISOString())
      .gte("attempts", MAX_ATTEMPTS);

    return json({ processed }, 200);
  }

  // ─── enqueue (user) ───
  if (body.action === "enqueue") {
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userResult } = await userClient.auth.getUser();
    const user = userResult?.user;
    if (!user) return json({ error: "unauthorized" }, 401);

    const ids = (body.viral_video_ids ?? []).slice(0, MAX_ENQUEUE);
    if (ids.length === 0) return json({ error: "missing_viral_video_ids" }, 400);

    // Skip videos that are already analyzed or actively being worked on.
    const { data: videos } = await admin
      .from("viral_videos")
      .select("id, analysis_status")
      .in("id", ids);
    const eligible = new Set(
      (videos ?? [])
        .filter((v) => v.analysis_status !== "analyzed" && v.analysis_status !== "analyzing")
        .map((v) => v.id as string),
    );

    const batchId = crypto.randomUUID();
    let queued = 0;
    let skipped = ids.length - eligible.size;
    for (const id of ids) {
      if (!eligible.has(id)) continue;
      // Per-row insert so the partial unique index (one active queue row per
      // video) turns duplicates into skips instead of failing the batch.
      const { error } = await admin
        .from("viral_analyze_queue")
        .insert({ viral_video_id: id, requested_by: user.id, batch_id: batchId });
      if (error) skipped++;
      else queued++;
    }

    return json({ batch_id: batchId, queued, skipped }, 200);
  }

  return json({ error: "unknown_action" }, 400);
});
