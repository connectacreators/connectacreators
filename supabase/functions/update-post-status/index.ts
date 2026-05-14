import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { deriveFromLegacy } from "../_shared/lifecycleStatus.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized - missing auth header" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userSupabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: userError } = await userSupabase.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: `Unauthorized - ${userError?.message || "no user"}` }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    // Accept both old field names and new for backward compatibility during migration
    const id = body.id ?? body.calendar_entry_id;
    const status = body.status ?? body.new_status;
    const revision_notes = body.revision_notes;

    if (!id || !status) {
      return new Response(JSON.stringify({ error: "id and status are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch current workflow status so we can derive lifecycle_status.
    const { data: current } = await serviceSupabase
      .from("video_edits")
      .select("status")
      .eq("id", id)
      .single();

    // Map the action's "status" arg directly to lifecycle_status. The legacy
    // CC sends post_status-style values (Approved / Needs Revision / Scheduled
    // / Published). deriveFromLegacy only catches Needs Revision when it's the
    // WORKFLOW status — so calling it here for revisions would silently
    // produce "In progress" and break the editing-queue display.
    let newLifecycle: "Not started" | "In progress" | "Needs Revisions" | "Scheduled" | "Published";
    if (status === "Published")          newLifecycle = "Published";
    else if (status === "Approved")      newLifecycle = "Published";          // CC's approval = publish-ready
    else if (status === "Scheduled")     newLifecycle = "Scheduled";
    else if (status === "Needs Revision") newLifecycle = "Needs Revisions";
    else                                  newLifecycle = deriveFromLegacy(current?.status, status);

    // Also sync the workflow `status` column so legacy readers that look at
    // it (EditingQueue's revisions modal pulls from `revisions`, but other
    // queries filter on `status`) stay coherent.
    const legacyStatusFromLifecycle: Record<string, string> = {
      "Not started":     "Not started",
      "In progress":     "In progress",
      "Needs Revisions": "Needs Revision",
      "Scheduled":       "Done",                  // editor work is finished when scheduled
      "Published":       "Done",
    };

    const update: Record<string, unknown> = {
      post_status:      status,
      status:           legacyStatusFromLifecycle[newLifecycle] ?? current?.status,
      lifecycle_status: newLifecycle,
    };
    if (revision_notes !== undefined) update.revisions = revision_notes;

    const { error } = await serviceSupabase
      .from("video_edits")
      .update(update)
      .eq("id", id);

    if (error) throw error;

    return new Response(
      JSON.stringify({ success: true, newStatus: status }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.error("update-post-status error:", errorMsg);
    return new Response(
      JSON.stringify({ error: errorMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
