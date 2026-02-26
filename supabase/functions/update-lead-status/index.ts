import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NOTION_API_VERSION = "2022-06-28";
const ALLOWED_STATUSES = [
  "Meta Ad (Not Booked)",
  "Appointment Booked",
  "Canceled",
  "Follow up #1 (Not Booked)",
  "Follow up #2 (Not Booked)",
  "Follow up #3 (Not Booked)",
];

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
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { leadId, newStatus, clientId } = await req.json();

    if (!leadId || !newStatus) {
      return new Response(JSON.stringify({ error: "leadId and newStatus are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!ALLOWED_STATUSES.includes(newStatus)) {
      return new Response(JSON.stringify({ error: `Status must be one of: ${ALLOWED_STATUSES.join(", ")}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check role
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    const isAdmin = roleData?.role === "admin";
    const isVideographer = roleData?.role === "videographer";

    // Non-admins need to verify access
    if (!isAdmin) {
      if (isVideographer) {
        // Check videographer has assigned clients
        const { data: assignments } = await supabase
          .from("videographer_clients")
          .select("client_id")
          .eq("videographer_user_id", user.id);
        if (!assignments || assignments.length === 0) {
          return new Response(JSON.stringify({ error: "Forbidden" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        // Client - check they have a linked client record
        const { data: clientData } = await supabase
          .from("clients")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (!clientData) {
          return new Response(JSON.stringify({ error: "Forbidden" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // Update Notion page
    const NOTION_API_KEY = Deno.env.get("NOTION_API_KEY");
    if (!NOTION_API_KEY) throw new Error("NOTION_API_KEY not configured");

    const notionRes = await fetch(`https://api.notion.com/v1/pages/${leadId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${NOTION_API_KEY}`,
        "Notion-Version": NOTION_API_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        properties: {
          "Lead Status": {
            select: { name: newStatus },
          },
        },
      }),
    });

    if (!notionRes.ok) {
      const errText = await notionRes.text();
      console.error("Notion update error:", notionRes.status, errText);
      throw new Error(`Notion API error: ${notionRes.status}`);
    }

    const updated = await notionRes.json();

    // Fire workflows watching this status change (Phase 2 — Lead Status Changed trigger)
    if (clientId) {
      try {
        const adminClient = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        const { data: workflows } = await adminClient
          .from("client_workflows")
          .select("*")
          .eq("client_id", clientId)
          .eq("trigger_type", "lead_status_changed")
          .eq("is_active", true);

        for (const workflow of workflows || []) {
          if (workflow.trigger_config?.status_to_watch === newStatus) {
            // Invoke execute-workflow
            await adminClient.functions.invoke("execute-workflow", {
              body: {
                workflow_id: workflow.id,
                client_id: clientId,
                trigger_data: {
                  notion_page_id: leadId,
                  status: newStatus,
                  client_id: clientId,
                  triggered_at: new Date().toISOString(),
                },
                steps: workflow.steps,
              },
            });

            // Update last_triggered_at
            await adminClient
              .from("client_workflows")
              .update({ last_triggered_at: new Date().toISOString() })
              .eq("id", workflow.id);
          }
        }
      } catch (wfErr) {
        console.error("Workflow fire error (non-fatal):", wfErr);
        // Non-fatal — don't fail the status update if workflow trigger fails
      }
    }

    return new Response(JSON.stringify({ success: true, id: updated.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("update-lead-status error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
