import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const CRON_SECRET = "connectacreators-cron-2026";
const RETENTION_DAYS = 90;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Verify cron secret
  const secret = req.headers.get("x-cron-secret");
  if (secret !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const cutoffDate = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const errors: string[] = [];
  let scriptsDeleted = 0;
  let videoEditsDeleted = 0;

  // 1. Delete expired video_edits (clean up storage files first)
  try {
    const { data: expiredVideos } = await supabase
      .from("video_edits")
      .select("id, storage_path")
      .not("deleted_at", "is", null)
      .lt("deleted_at", cutoffDate);

    if (expiredVideos && expiredVideos.length > 0) {
      // Clean up storage files
      const storagePaths = expiredVideos
        .filter((v: any) => v.storage_path)
        .map((v: any) => v.storage_path);

      if (storagePaths.length > 0) {
        await supabase.storage.from("footage").remove(storagePaths);
      }

      // Delete records
      const ids = expiredVideos.map((v: any) => v.id);
      const { error } = await supabase.from("video_edits").delete().in("id", ids);
      if (error) throw error;
      videoEditsDeleted = ids.length;
    }
  } catch (e: any) {
    errors.push(`video_edits cleanup: ${e.message}`);
  }

  // 2. Delete expired scripts
  try {
    const { data: expiredScripts } = await supabase
      .from("scripts")
      .select("id")
      .not("deleted_at", "is", null)
      .lt("deleted_at", cutoffDate);

    if (expiredScripts && expiredScripts.length > 0) {
      const ids = expiredScripts.map((s: any) => s.id);
      const { error } = await supabase.from("scripts").delete().in("id", ids);
      if (error) throw error;
      scriptsDeleted = ids.length;
    }
  } catch (e: any) {
    errors.push(`scripts cleanup: ${e.message}`);
  }

  return new Response(
    JSON.stringify({
      scripts_deleted: scriptsDeleted,
      video_edits_deleted: videoEditsDeleted,
      errors,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});
