import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { deriveFromLegacy } from "../_shared/lifecycleStatus.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// The client's editor = the editor-role member assigned to the client in
// videographer_clients (the team↔client junction table). Mirrors
// public-review-post so both calendars hand revisions to the same person.
// deno-lint-ignore no-explicit-any
async function resolveClientEditor(service: any, clientId: string): Promise<string | null> {
  const { data: team } = await service
    .from("videographer_clients")
    .select("videographer_user_id")
    .eq("client_id", clientId);
  const ids = (team ?? []).map((t: { videographer_user_id: string }) => t.videographer_user_id);
  if (ids.length === 0) return null;
  const { data: editors } = await service
    .from("user_roles")
    .select("user_id")
    .eq("role", "editor")
    .in("user_id", ids)
    .limit(1);
  return editors && editors.length > 0 ? editors[0].user_id : null;
}

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

    // Fetch current workflow status so we can derive lifecycle_status, plus
    // client_id so a revision can be handed back to the client's editor.
    const { data: current } = await serviceSupabase
      .from("video_edits")
      .select("status, client_id")
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

    // Send-for-revision hands the row back to the client's editor — same
    // handoff public-review-post does, so private and public calendar
    // revisions behave identically. If no editor is assigned to the client,
    // leave the assignee as-is for the admin to route.
    if (newLifecycle === "Needs Revisions" && current?.client_id) {
      const editorId = await resolveClientEditor(serviceSupabase, current.client_id);
      if (editorId) {
        const { data: prof } = await serviceSupabase
          .from("profiles").select("display_name").eq("user_id", editorId).maybeSingle();
        update.assignee_user_id = editorId;
        update.assignee = (prof as { display_name?: string } | null)?.display_name ?? null;
      }
    }

    const { error } = await serviceSupabase
      .from("video_edits")
      .update(update)
      .eq("id", id);

    if (error) throw error;

    // The editing queue's Revisions modal reads from revision_comments
    // (timestamped, threaded) — NOT video_edits.revisions. Mirror the note
    // there as a general (untimestamped) comment so the editor actually sees
    // it. source_ref stays null so it isn't scoped away to a version tab.
    const note = typeof revision_notes === "string" ? revision_notes.trim() : "";
    if (newLifecycle === "Needs Revisions" && note) {
      // The revision dialog pre-fills the previous notes, so an unchanged
      // resubmit would duplicate the comment — skip if an identical open
      // general note already exists.
      const { data: dupe } = await serviceSupabase
        .from("revision_comments")
        .select("id")
        .eq("video_edit_id", id)
        .is("timestamp_seconds", null)
        .eq("comment", note)
        .eq("resolved", false)
        .limit(1);
      if (!dupe || dupe.length === 0) {
        // Attribute the note to the caller (client, strategist or admin).
        const [{ data: prof }, { data: roles }] = await Promise.all([
          serviceSupabase.from("profiles").select("display_name").eq("user_id", user.id).maybeSingle(),
          serviceSupabase.from("user_roles").select("role").eq("user_id", user.id),
        ]);
        const roleList = (roles ?? []).map((r: { role: string }) => r.role);
        const authorRole = roleList.includes("admin") ? "admin"
          : roleList.includes("content_strategist") ? "content_strategist"
          : roleList.includes("editor") ? "editor"
          : "client";
        const { error: commentErr } = await serviceSupabase
          .from("revision_comments")
          .insert([{
            video_edit_id: id,
            timestamp_seconds: null,
            comment: note,
            author_name: (prof as { display_name?: string } | null)?.display_name || user.email || "Client",
            author_role: authorRole,
            author_id: user.id,
            source_ref: null,
            internal_only: false,
            resolved: false,
          }]);
        // Don't fail the request over the mirror insert — the status change
        // already landed; just surface it in logs.
        if (commentErr) console.error("update-post-status comment insert error:", commentErr.message);
      }
    }

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
