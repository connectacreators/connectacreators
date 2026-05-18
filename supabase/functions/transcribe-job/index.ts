// supabase/functions/transcribe-job/index.ts
// Enqueues a transcription job for a video_edit. The local render-worker
// picks it up, extracts audio via ffmpeg, calls OpenAI Whisper, and writes
// the transcripts + silence_segments rows.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { corsHeaders } from "../_shared/cors.ts";

type Body = { video_edit_id: string };

function text(body: string, status: number) {
  return new Response(body, { status, headers: corsHeaders });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return text("method not allowed", 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return text("invalid json", 400);
  }
  if (!body.video_edit_id || typeof body.video_edit_id !== "string") {
    return text("video_edit_id required", 400);
  }

  // Confirm the video_edit exists and has a storage path (RLS gates access).
  const { data: ve, error: veErr } = await supabase
    .from("video_edits")
    .select("id, storage_path")
    .eq("id", body.video_edit_id)
    .maybeSingle();
  if (veErr) return text(veErr.message, 500);
  if (!ve) return text("video_edit not found", 404);
  if (!(ve as { storage_path: string | null }).storage_path) {
    return text("video_edit has no storage_path", 400);
  }

  // If a transcript already exists, no-op; the worker would just rewrite it.
  const { data: existing } = await supabase
    .from("transcripts")
    .select("id")
    .eq("video_edit_id", body.video_edit_id)
    .maybeSingle();
  if (existing) {
    return new Response(JSON.stringify({ status: "exists" }), {
      status: 200,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  // If a job is already queued/running for this video, return it.
  const { data: openJob } = await supabase
    .from("transcribe_jobs")
    .select("id, status, progress, error_message, created_at, finished_at")
    .eq("video_edit_id", body.video_edit_id)
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (openJob) {
    return new Response(JSON.stringify(openJob), {
      status: 200,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  const { data: created, error: insErr } = await supabase
    .from("transcribe_jobs")
    .insert({ video_edit_id: body.video_edit_id, status: "queued" })
    .select("id, status, progress, error_message, created_at, finished_at")
    .single();
  if (insErr) return text(insErr.message, 500);

  return new Response(JSON.stringify(created), {
    status: 200,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
});
