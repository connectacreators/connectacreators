// supabase/functions/import-audio-from-url/index.ts
// Enqueues an audio-import job. The local render-worker picks it up,
// runs yt-dlp to extract the audio track from the URL (TikTok / IG /
// YouTube / direct file), uploads the resulting MP3 to the footage
// bucket, and the frontend then writes the storage_path into the EDL.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { corsHeaders } from "../_shared/cors.ts";

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

  const { data: ve, error: veErr } = await supabase
    .from("video_edits")
    .select("id")
    .eq("id", body.video_edit_id)
    .maybeSingle();
  if (veErr) return text(veErr.message, 500);
  if (!ve) return text("video_edit not found", 404);

  const { data: created, error: insErr } = await supabase
    .from("audio_import_jobs")
    .insert({
      video_edit_id: body.video_edit_id,
      url: body.url,
      status: "queued",
    })
    .select("id, status, progress, error_message, output_storage_path, duration_ms, created_at, finished_at")
    .single();
  if (insErr) return text(insErr.message, 500);

  return new Response(JSON.stringify(created), {
    status: 200,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
});
