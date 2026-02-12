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

  const { data: roleData } = await userSupabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (roleData?.role !== "admin") {
    return new Response(JSON.stringify({ error: "Admin only" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const serviceSupabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const NOTION_API_KEY = Deno.env.get("NOTION_API_KEY");
    if (!NOTION_API_KEY) throw new Error("NOTION_API_KEY not configured");

    // Get all client->notion mappings with property names
    const { data: mappings, error: mapErr } = await serviceSupabase
      .from("client_notion_mapping")
      .select("client_id, notion_database_id, title_property, script_property, footage_property");
    if (mapErr) throw mapErr;
    if (!mappings || mappings.length === 0) {
      return new Response(JSON.stringify({ synced: 0, message: "No client mappings found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clientDbMap = new Map(mappings.map(m => [m.client_id, m]));

    // Get all scripts not deleted
    const { data: allScripts, error: scriptsErr } = await serviceSupabase
      .from("scripts")
      .select("id, client_id, idea_ganadora, title, google_drive_link, deleted_at")
      .is("deleted_at", null);
    if (scriptsErr) throw scriptsErr;

    // Get existing sync records
    const { data: existingSyncs } = await serviceSupabase
      .from("notion_script_sync")
      .select("script_id");
    const syncedIds = new Set((existingSyncs || []).map(s => s.script_id));

    // Filter to unsynced scripts that have a client mapping
    const toSync = (allScripts || []).filter(
      s => !syncedIds.has(s.id) && clientDbMap.has(s.client_id)
    );

    let synced = 0;
    const errors: string[] = [];

    for (const script of toSync) {
      const mapping = clientDbMap.get(script.client_id)!;
      const notionDbId = mapping.notion_database_id;
      const titleProp = mapping.title_property || "Reel title";
      const scriptProp = mapping.script_property;
      const footageProp = mapping.footage_property;
      const scriptUrl = `https://connectacreators.lovable.app/scripts?id=${script.id}`;

      const properties: Record<string, unknown> = {
        [titleProp]: {
          title: [{ text: { content: script.idea_ganadora || script.title || "Sin título" } }],
        },
        "Status": { status: { name: "Not started" } },
      };

      if (scriptProp) {
        properties[scriptProp] = { url: scriptUrl };
      }

      if (footageProp && script.google_drive_link) {
        properties[footageProp] = { url: script.google_drive_link };
      }

      try {
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
          console.error(`Failed to sync script ${script.id}:`, notionRes.status, errText);
          errors.push(`${script.id}: ${notionRes.status}`);
          continue;
        }

        const notionPage = await notionRes.json();

        // Save immediately after each successful sync
        await serviceSupabase.from("notion_script_sync").upsert({
          script_id: script.id,
          notion_page_id: notionPage.id,
          notion_database_id: notionDbId,
        }, { onConflict: "script_id" });

        synced++;
      } catch (e) {
        console.error(`Error syncing script ${script.id}:`, e);
        errors.push(`${script.id}: ${e instanceof Error ? e.message : "Unknown"}`);
      }
    }

    return new Response(JSON.stringify({ synced, total: toSync.length, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("bulk-sync-notion-scripts error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
