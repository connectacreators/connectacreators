import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const NOTION_API_VERSION = "2022-06-28";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { client_id } = await req.json();
    if (!client_id) throw new Error("client_id required");

    const NOTION_API_KEY = Deno.env.get("NOTION_API_KEY");
    if (!NOTION_API_KEY) throw new Error("NOTION_API_KEY not configured");

    const serviceSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get notion database ID for this client
    const { data: mapping } = await serviceSupabase
      .from("client_notion_mapping")
      .select("notion_database_id")
      .eq("client_id", client_id)
      .maybeSingle();

    if (!mapping?.notion_database_id) {
      return new Response(
        JSON.stringify({ synced: 0, message: "No Notion mapping found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch all pages from the Notion database
    const notionRes = await fetch(
      `https://api.notion.com/v1/databases/${mapping.notion_database_id}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${NOTION_API_KEY}`,
          "Notion-Version": NOTION_API_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ page_size: 100 }),
      }
    );

    if (!notionRes.ok) throw new Error(`Notion API error: ${notionRes.status}`);

    const notionData = await notionRes.json();

    // Build map of page_id → Post Status from Notion
    const notionStatusMap = new Map<string, string>();
    for (const page of notionData.results || []) {
      const props = page.properties || {};
      const postStatusField = props["Post Status"];
      let postStatus: string | null = null;
      if (postStatusField?.select?.name) postStatus = postStatusField.select.name;
      else if (postStatusField?.status?.name) postStatus = postStatusField.status.name;
      if (postStatus) {
        notionStatusMap.set(page.id, postStatus);
      }
    }

    if (notionStatusMap.size === 0) {
      return new Response(
        JSON.stringify({ synced: 0, message: "No Post Status values found in Notion" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get current content_calendar entries for this client
    const { data: calRows } = await serviceSupabase
      .from("content_calendar")
      .select("id, notion_page_id, post_status")
      .eq("client_id", client_id);

    if (!calRows || calRows.length === 0) {
      return new Response(
        JSON.stringify({ synced: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update entries where Notion status differs from stored status
    let synced = 0;
    for (const row of calRows) {
      const notionStatus = notionStatusMap.get(row.notion_page_id);
      if (notionStatus && notionStatus !== row.post_status) {
        const { error } = await serviceSupabase
          .from("content_calendar")
          .update({ post_status: notionStatus })
          .eq("id", row.id);
        if (!error) synced++;
        else console.error("Update error for row", row.id, error);
      }
    }

    return new Response(
      JSON.stringify({ synced }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("sync-calendar-status error:", e);
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
