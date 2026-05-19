// supabase/functions/import-audio-from-url/index.ts
// Imports audio from a public URL (TikTok / Instagram Reel / YouTube /
// direct media link) by calling the VPS yt-dlp service (the same one
// transcribe-canvas-media uses for video → audio extraction). The
// returned MP3 lands in the footage bucket at music/<videoEditId>/, and
// the frontend writes the storage_path into editor_projects.edl.music.
//
// Synchronous: the edge function does the whole thing inline (VPS call +
// Storage upload) and returns the finished audio_import_jobs row in
// "done" state. The job row is still written so the UI can show
// progress / errors via a familiar queue shape.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { corsHeaders } from "../_shared/cors.ts";

const VPS_SERVER = "http://72.62.200.145:3099";
const VPS_API_KEY = "ytdlp_connecta_2026_secret";

type Body = { video_edit_id: string; url: string };

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
  if (!body.url || typeof body.url !== "string" || !/^https?:\/\//.test(body.url)) {
    return text("valid http(s) url required", 400);
  }

  // Confirm the video_edit exists (RLS will further restrict).
  const { data: ve, error: veErr } = await supabase
    .from("video_edits")
    .select("id")
    .eq("id", body.video_edit_id)
    .maybeSingle();
  if (veErr) return text(veErr.message, 500);
  if (!ve) return text("video_edit not found", 404);

  // Create the job row up front so any failure is recorded and visible to
  // the frontend if it polls.
  const { data: created, error: insErr } = await supabase
    .from("audio_import_jobs")
    .insert({ video_edit_id: body.video_edit_id, url: body.url, status: "running", progress: 10 })
    .select("id")
    .single();
  if (insErr) return text(insErr.message, 500);
  const jobId = (created as { id: string }).id;

  const markError = async (msg: string) => {
    await supabase
      .from("audio_import_jobs")
      .update({
        status: "error",
        error_message: msg.slice(0, 2000),
        finished_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  };

  try {
    // ── Step 1: Ask the VPS yt-dlp service to extract MP3 audio. ──
    const vpsRes = await fetch(`${VPS_SERVER}/extract-audio`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": VPS_API_KEY },
      body: JSON.stringify({ url: body.url }),
      signal: AbortSignal.timeout(55_000),
    });
    if (!vpsRes.ok) {
      const errBody = await vpsRes.text().catch(() => "");
      let errMsg = `VPS extract-audio failed (HTTP ${vpsRes.status})`;
      try {
        const parsed = JSON.parse(errBody);
        if (parsed.error) errMsg = parsed.error;
      } catch { if (errBody) errMsg = errBody.slice(0, 400); }
      await markError(errMsg);
      return text(errMsg, 502);
    }
    const audioBlob = await vpsRes.blob();
    if (audioBlob.size === 0) {
      await markError("VPS returned empty audio");
      return text("VPS returned empty audio", 502);
    }

    await supabase.from("audio_import_jobs")
      .update({ progress: 70 }).eq("id", jobId);

    // ── Step 2: Upload to Storage. ──
    const storagePath = `music/${body.video_edit_id}/imported-${Date.now()}.mp3`;
    const { error: upErr } = await supabase.storage
      .from("footage")
      .upload(storagePath, audioBlob, { contentType: "audio/mpeg", upsert: true });
    if (upErr) {
      await markError(`storage upload: ${upErr.message}`);
      return text(`storage upload: ${upErr.message}`, 500);
    }

    // ── Step 3: Mark job done. duration_ms is derived client-side from
    // the <audio> element's loadedmetadata event since the edge runtime
    // has no ffprobe handy. ──
    const { data: done, error: doneErr } = await supabase
      .from("audio_import_jobs")
      .update({
        status: "done",
        progress: 100,
        output_storage_path: storagePath,
        finished_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .select("id, status, progress, output_storage_path, duration_ms, error_message, created_at, finished_at")
      .single();
    if (doneErr) return text(doneErr.message, 500);

    return new Response(JSON.stringify(done), {
      status: 200,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await markError(msg);
    return text(msg, 500);
  }
});
