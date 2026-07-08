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
  let filesDeleted = 0;

  // 1. Delete expired video_edits (clean up storage files first).
  // Footage lives under `${client_id}/${video_edit_id}/` (plus a `submission/`
  // subfolder) in the `footage` bucket, with 720p proxies mirroring the same
  // paths in `footage-proxies`. Deleting only `storage_path` would leak every
  // other file in the folder, so wipe the whole prefix in both buckets.
  try {
    const { data: expiredVideos } = await supabase
      .from("video_edits")
      .select("id, client_id")
      .not("deleted_at", "is", null)
      .lt("deleted_at", cutoffDate);

    for (const ve of expiredVideos ?? []) {
      try {
        if (ve.client_id && ve.id) {
          const prefixes = [
            `${ve.client_id}/${ve.id}/`,
            `${ve.client_id}/${ve.id}/submission/`,
          ];
          for (const bucket of ["footage", "footage-proxies"]) {
            const paths: string[] = [];
            for (const prefix of prefixes) {
              const { data: objects } = await supabase.storage
                .from(bucket)
                .list(prefix, { limit: 1000 });
              for (const obj of objects ?? []) {
                if (obj.name && !obj.name.endsWith("/")) paths.push(`${prefix}${obj.name}`);
              }
            }
            if (paths.length > 0) {
              const { error: storageErr } = await supabase.storage.from(bucket).remove(paths);
              if (storageErr) {
                errors.push(`${bucket} cleanup failed for ${ve.id}: ${storageErr.message}`);
              } else {
                filesDeleted += paths.length;
              }
            }
          }
          // Drop proxy tracking rows so nothing points at the deleted files.
          await supabase
            .from("footage_proxies")
            .delete()
            .like("source_path", `${ve.client_id}/${ve.id}/%`);
        }

        const { error } = await supabase.from("video_edits").delete().eq("id", ve.id);
        if (error) throw error;
        videoEditsDeleted++;
      } catch (e: any) {
        errors.push(`video_edit ${ve.id} cleanup: ${e.message}`);
      }
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
      files_deleted: filesDeleted,
      errors,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});
