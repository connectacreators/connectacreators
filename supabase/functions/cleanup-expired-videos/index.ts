import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const CRON_SECRET = "connectacreators-cron-2026";
const SUPABASE_URL = "https://hxojqrilwhhrvloiwmfo.supabase.co";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Verify cron secret
  const cronSecret = req.headers.get("x-cron-secret");
  if (cronSecret !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  let filesDeleted = 0;
  let recordsDeleted = 0;
  const errors: string[] = [];

  // Stage 1: Delete expired video FILES (90 days)
  try {
    const { data: expiredFiles, error: fetchErr } = await supabase
      .from("video_edits")
      .select("id, storage_path")
      .eq("upload_source", "supabase")
      .lt("file_expires_at", new Date().toISOString())
      .not("storage_path", "is", null);

    if (fetchErr) throw fetchErr;

    for (const row of expiredFiles || []) {
      try {
        // Delete file from storage
        const { error: storageErr } = await supabase.storage
          .from("footage")
          .remove([row.storage_path]);

        if (storageErr) {
          errors.push(`Storage delete failed for ${row.id}: ${storageErr.message}`);
          continue;
        }

        // Clear storage columns on the row
        const { error: updateErr } = await supabase
          .from("video_edits")
          .update({ storage_path: null, storage_url: null })
          .eq("id", row.id);

        if (updateErr) {
          errors.push(`DB update failed for ${row.id}: ${updateErr.message}`);
          continue;
        }

        filesDeleted++;
      } catch (e: any) {
        errors.push(`File cleanup error for ${row.id}: ${e.message}`);
      }
    }
  } catch (e: any) {
    errors.push(`Stage 1 query error: ${e.message}`);
  }

  // Stage 2: Delete expired RECORDS (180 days)
  try {
    const { data: expiredRecords, error: fetchErr } = await supabase
      .from("video_edits")
      .select("id")
      .eq("upload_source", "supabase")
      .lt("record_expires_at", new Date().toISOString());

    if (fetchErr) throw fetchErr;

    for (const row of expiredRecords || []) {
      try {
        const { error: deleteErr } = await supabase
          .from("video_edits")
          .delete()
          .eq("id", row.id);

        if (deleteErr) {
          errors.push(`Record delete failed for ${row.id}: ${deleteErr.message}`);
          continue;
        }

        recordsDeleted++;
      } catch (e: any) {
        errors.push(`Record cleanup error for ${row.id}: ${e.message}`);
      }
    }
  } catch (e: any) {
    errors.push(`Stage 2 query error: ${e.message}`);
  }

  const result = {
    files_deleted: filesDeleted,
    records_deleted: recordsDeleted,
    errors: errors.length > 0 ? errors : undefined,
  };

  console.log("Cleanup result:", JSON.stringify(result));

  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
