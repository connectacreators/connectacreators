import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NOTION_API_VERSION = "2022-06-28";

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

  const userSupabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: userError } = await userSupabase.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { page_id, status, assignee_id, assignee_property, revisions, revision_property } = body;
    if (!page_id) throw new Error("page_id is required");
    if (!status && assignee_id === undefined && revisions === undefined) throw new Error("status, assignee_id, or revisions is required");

    const NOTION_API_KEY = Deno.env.get("NOTION_API_KEY");
    if (!NOTION_API_KEY) throw new Error("NOTION_API_KEY not configured");

    const properties: Record<string, any> = {};

    if (status) {
      properties.Status = { status: { name: status } };
    }

    if (assignee_id !== undefined) {
      // Determine which property name to use for the assignee
      const propName = assignee_property || "Assignee";
      if (assignee_id === null || assignee_id === "") {
        // Clear assignee
        properties[propName] = { people: [] };
      } else {
        properties[propName] = { people: [{ id: assignee_id }] };
      }
    }

    if (revisions !== undefined) {
      const propName = revision_property || "Revisions";
      properties[propName] = {
        rich_text: revisions ? [{ type: "text", text: { content: revisions } }] : [],
      };
    }

    const notionRes = await fetch(`https://api.notion.com/v1/pages/${page_id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${NOTION_API_KEY}`,
        "Notion-Version": NOTION_API_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ properties }),
    });

    if (!notionRes.ok) {
      const errText = await notionRes.text();
      console.error("Notion update error:", notionRes.status, errText);
      throw new Error(`Notion API error: ${notionRes.status}`);
    }

    const result = await notionRes.json();

    return new Response(JSON.stringify({ success: true, id: result.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("update-editing-status error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
