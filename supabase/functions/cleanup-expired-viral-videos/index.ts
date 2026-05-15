// supabase/functions/cleanup-expired-viral-videos/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

const CRON_SECRET = "connectacreators-cron-2026";
const BUCKET = "viral-videos";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const cronSecret = req.headers.get("x-cron-secret");
  if (cronSecret !== CRON_SECRET) {
    return new Response("forbidden", { status: 403, headers: corsHeaders });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: expired, error: queryErr } = await admin
    .from("viral_videos")
    .select("id, video_file_url")
    .lt("video_file_expires_at", new Date().toISOString())
    .not("video_file_url", "is", null)
    .limit(500);
  if (queryErr) {
    return new Response(JSON.stringify({ error: queryErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let deleted = 0;
  const errors: Array<{ id: string; error: string }> = [];
  for (const row of (expired ?? []) as Array<{ id: string; video_file_url: string }>) {
    const path = `${row.id}.mp4`;
    const { error: rmErr } = await admin.storage.from(BUCKET).remove([path]);
    if (rmErr && !rmErr.message.toLowerCase().includes("not found")) {
      errors.push({ id: row.id, error: rmErr.message });
      continue;
    }
    const { error: updErr } = await admin
      .from("viral_videos")
      .update({ video_file_url: null, video_file_expires_at: null })
      .eq("id", row.id);
    if (updErr) {
      errors.push({ id: row.id, error: updErr.message });
      continue;
    }
    deleted++;
  }

  return new Response(JSON.stringify({ deleted, errors }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
