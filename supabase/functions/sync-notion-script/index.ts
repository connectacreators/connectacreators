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

  // Auth check
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

  // Use service role client for reading/writing mapping tables (RLS = admin only)
  const serviceSupabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { script_id, client_id, title, google_drive_link, action } = await req.json();

    if (!script_id || !client_id || !action) {
      return new Response(JSON.stringify({ error: "script_id, client_id, and action are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const NOTION_API_KEY = Deno.env.get("NOTION_API_KEY");
    if (!NOTION_API_KEY) throw new Error("NOTION_API_KEY not configured");

    // Look up client's Notion database ID
    const { data: mapping, error: mapErr } = await serviceSupabase
      .from("client_notion_mapping")
      .select("notion_database_id")
      .eq("client_id", client_id)
      .maybeSingle();

    if (mapErr) throw mapErr;
    if (!mapping) {
      console.log(`No Notion mapping for client ${client_id}, skipping sync`);
      return new Response(JSON.stringify({ skipped: true, reason: "No Notion mapping for client" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const notionDbId = mapping.notion_database_id;
    const scriptUrl = `https://connectacreators.lovable.app/scripts?id=${script_id}`;

    // Build Notion properties
    const properties: Record<string, unknown> = {
      "Reel title": {
        title: [{ text: { content: title || "Sin título" } }],
      },
      "Script": {
        url: scriptUrl,
      },
    };

    if (google_drive_link) {
      properties["Footage"] = { url: google_drive_link };
    }

    if (action === "create") {
      // Add default status on create
      properties["Status"] = { status: { name: "Not started" } };

      const notionRes = await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${NOTION_API_KEY}`,
          "Notion-Version": NOTION_API_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          parent: { database_id: notionDbId },
          properties,
        }),
      });

      if (!notionRes.ok) {
        const errText = await notionRes.text();
        console.error("Notion create error:", notionRes.status, errText);
        throw new Error(`Notion API error: ${notionRes.status} - ${errText}`);
      }

      const notionPage = await notionRes.json();

      // Store mapping
      const { error: syncErr } = await serviceSupabase
        .from("notion_script_sync")
        .insert({
          script_id,
          notion_page_id: notionPage.id,
          notion_database_id: notionDbId,
        });
      if (syncErr) {
        console.error("Error saving sync mapping:", syncErr);
      }

      return new Response(JSON.stringify({ success: true, notion_page_id: notionPage.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (action === "update") {
      // Find existing Notion page ID
      const { data: syncData, error: syncErr } = await serviceSupabase
        .from("notion_script_sync")
        .select("notion_page_id")
        .eq("script_id", script_id)
        .maybeSingle();

      if (syncErr) throw syncErr;
      if (!syncData) {
        console.log(`No sync record for script ${script_id}, skipping update`);
        return new Response(JSON.stringify({ skipped: true, reason: "No sync record" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const notionRes = await fetch(`https://api.notion.com/v1/pages/${syncData.notion_page_id}`, {
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
        throw new Error(`Notion API error: ${notionRes.status} - ${errText}`);
      }

      return new Response(JSON.stringify({ success: true, notion_page_id: syncData.notion_page_id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action. Use 'create' or 'update'" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("sync-notion-script error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
