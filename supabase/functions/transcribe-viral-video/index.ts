// supabase/functions/transcribe-viral-video/index.ts
//
// Lightweight "pre-analyze" step for the Super Canvas video drop flow. When a
// user pastes a fresh URL we want them to see the transcript IMMEDIATELY so
// they can decide whether the video is worth the full visual analysis — they
// shouldn't have to pay 50 credits just to read what was said.
//
// This function:
//   1. Looks up the viral_videos row by id (the row is already created by
//      /viral-video-resolve during URL submit, so the id always exists AND
//      already has caption / thumbnail / stats populated where the VPS could
//      provide them).
//   2. Returns immediately if transcript is already cached.
//   3. Otherwise runs acquireTranscript() — YouTube uses the public captions
//      API (free), Instagram/TikTok run Whisper (~$0.005/video, eaten as a
//      UX investment so the canvas feels frictionless).
//   4. Updates row.transcript and returns it.
//
// Charges 0 credits. The expensive visual breakdown / categorization remains
// gated behind /analyze-viral-video-user, which becomes effectively free for
// canvas-dropped videos because the transcript is already cached when the
// user clicks Analyze.
//
// transcript_status is written through the lifecycle so /analyze-viral-video-user
// can detect an in-flight pre-transcribe and avoid double-Whispering the same
// video when the user clicks Analyze before this finishes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { acquireTranscript, type ViralVideoRow, AnalyzerError } from "../_shared/viral-video-analyzer.ts";

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

  // Auth — accept either a user JWT (normal canvas-drop flow) OR the
  // service-role key (internal backfill / cron calls).
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const token = authHeader.slice("Bearer ".length).trim();
  const isServiceRole = token === serviceKey;
  if (!isServiceRole) {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userResult } = await userClient.auth.getUser();
    if (!userResult?.user) return json({ error: "unauthorized" }, 401);
  }

  let body: { viral_video_id?: string };
  try { body = await req.json(); } catch { body = {}; }
  if (!body.viral_video_id) return json({ error: "missing_viral_video_id" }, 400);

  // Look up the row. Use service-role so we don't fight RLS for the canvas
  // use case — viral_videos is a shared reference library, not user-scoped.
  const { data: row, error: fetchErr } = await admin
    .from("viral_videos")
    .select("*")
    .eq("id", body.viral_video_id)
    .single();
  if (fetchErr || !row) return json({ error: "video_not_found", message: fetchErr?.message }, 404);

  const typed = row as ViralVideoRow & {
    transcript: string | null;
    transcript_status: string | null;
  };

  // Short-circuit if transcript already cached.
  if (typed.transcript && typed.transcript.trim().length > 0) {
    return json({ row: typed, status: "cached", transcript: typed.transcript }, 200);
  }

  // Mark in-flight so /analyze-viral-video-user can see and avoid a second
  // Whisper job if the user clicks Analyze before this returns.
  await admin
    .from("viral_videos")
    .update({ transcript_status: "processing" })
    .eq("id", typed.id);

  // Transcript acquisition. acquireTranscript handles the YouTube captions
  // fast-path and the Whisper fallback internally. Only needs video_url +
  // platform from the row — caption/thumbnail/stats are display fields and
  // are not on this critical path.
  let transcript: string;
  try {
    transcript = await acquireTranscript(typed);
  } catch (err) {
    const code = err instanceof AnalyzerError ? err.code : "unknown_error";
    const message = err instanceof Error ? err.message : String(err);
    await admin
      .from("viral_videos")
      .update({ transcript_status: "failed", transcript_error: `${code}: ${message}`.slice(0, 500) })
      .eq("id", typed.id);
    return json({ error: code, message }, 500);
  }

  if (!transcript || !transcript.trim()) {
    await admin
      .from("viral_videos")
      .update({ transcript_status: "failed", transcript_error: "empty_transcript" })
      .eq("id", typed.id);
    return json({ error: "empty_transcript", message: "Transcript acquired but empty" }, 500);
  }

  // Persist. Don't touch analysis_status — the full /analyze-viral-video-user
  // call still needs to run for visual breakdown + categorization, and it
  // gates its own claim on that field.
  const { data: updated, error: updateErr } = await admin
    .from("viral_videos")
    .update({
      transcript,
      transcribed_at: new Date().toISOString(),
      transcript_status: "done",
      transcript_error: null,
    })
    .eq("id", typed.id)
    .select("*")
    .single();
  if (updateErr) return json({ error: "db_update_failed", message: updateErr.message }, 500);

  return json({ row: updated, status: "transcribed", transcript }, 200);
});
