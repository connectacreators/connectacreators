import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Public, no-login review endpoint for the shared content-calendar link.
// Anyone with a client's share link (/public/calendar/:clientId) can approve
// or request revisions on that client's posts WITHOUT an account.
//
// This mirrors the existing reads model: the public calendar already exposes
// every post for a client to anyone with the link (RLS allows anon reads).
// Writes here are deliberately narrow — only an approve/revision lifecycle
// flip on a post that PROVABLY belongs to the supplied client_id. We never
// trust post_id alone; the caller must also know the client_id the post hangs
// off, and we verify ownership server-side before touching anything.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

  try {
    const body = await req.json();
    const postId: string | undefined = body.post_id ?? body.id;
    const clientId: string | undefined = body.client_id;
    const action: string | undefined = body.action; // "approve" | "revision"
    const revisionNotes: string | undefined = body.revision_notes;
    const reviewerName: string | undefined = body.reviewer_name;

    if (!postId || !clientId || !action) {
      return new Response(
        JSON.stringify({ error: "post_id, client_id and action are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (action !== "approve" && action !== "revision") {
      return new Response(
        JSON.stringify({ error: "action must be 'approve' or 'revision'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const serviceSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Ownership gate: the post must exist AND belong to the supplied client.
    const { data: current, error: fetchErr } = await serviceSupabase
      .from("video_edits")
      .select("id, client_id, status, revisions")
      .eq("id", postId)
      .is("deleted_at", null)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!current || current.client_id !== clientId) {
      // Don't leak whether the post exists — same response either way.
      return new Response(JSON.stringify({ error: "Post not found for this calendar" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Map to the same lifecycle/legacy values update-post-status uses so the
    // editing queue and other readers stay coherent.
    let postStatus: string;
    let lifecycle: "Needs Revisions" | "Published";
    let legacyStatus: string;
    const update: Record<string, unknown> = {};

    if (action === "approve") {
      postStatus = "Approved";
      lifecycle = "Published"; // CC's approval = publish-ready (matches update-post-status)
      legacyStatus = "Done";
    } else {
      postStatus = "Needs Revision";
      lifecycle = "Needs Revisions";
      legacyStatus = "Needs Revision";
      // Attribute the note to the reviewer when a name was provided.
      const note = (revisionNotes ?? "").trim();
      update.revisions = reviewerName?.trim()
        ? `${reviewerName.trim()}: ${note}`
        : note;
    }

    update.post_status = postStatus;
    update.lifecycle_status = lifecycle;
    update.status = legacyStatus;

    const { error: updErr } = await serviceSupabase
      .from("video_edits")
      .update(update)
      .eq("id", postId)
      .eq("client_id", clientId); // belt-and-suspenders: scope the write to the owner

    if (updErr) throw updErr;

    return new Response(
      JSON.stringify({ success: true, lifecycle_status: lifecycle, post_status: postStatus }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("public-review-post error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
