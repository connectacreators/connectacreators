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
    const { client_id } = await req.json();
    if (!client_id) throw new Error("client_id is required");

    const NOTION_API_KEY = Deno.env.get("NOTION_API_KEY");
    if (!NOTION_API_KEY) throw new Error("NOTION_API_KEY not configured");

    const serviceSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get the Notion mapping for this client
    const { data: mapping, error: mapErr } = await serviceSupabase
      .from("client_notion_mapping")
      .select("notion_database_id, title_property, script_property, file_submission_property")
      .eq("client_id", client_id)
      .maybeSingle();

    if (mapErr) throw mapErr;
    if (!mapping) {
      return new Response(JSON.stringify({ items: [], message: "No Notion mapping found for this client" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const titleProp = mapping.title_property || "Reel title";
    const scriptProp = mapping.script_property || "Script";
    const fileSubmissionProp = mapping.file_submission_property || "File Submission";

    // Query the Notion database sorted by last edited
    const notionRes = await fetch(`https://api.notion.com/v1/databases/${mapping.notion_database_id}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NOTION_API_KEY}`,
        "Notion-Version": NOTION_API_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
        page_size: 100,
      }),
    });

    if (!notionRes.ok) {
      const errText = await notionRes.text();
      console.error("Notion API error:", notionRes.status, errText);
      throw new Error(`Notion API error: ${notionRes.status}`);
    }

    const notionData = await notionRes.json();

    const items = (notionData.results || []).map((page: any) => {
      const props = page.properties || {};

      // Extract title
      let title = "Untitled";
      const titleField = props[titleProp];
      if (titleField?.title?.length > 0) {
        title = titleField.title.map((t: any) => t.plain_text).join("");
      }

      // Extract status
      let status = "Unknown";
      let statusColor = "default";
      const statusField = props["Status"];
      if (statusField?.status) {
        status = statusField.status.name || "Unknown";
        statusColor = statusField.status.color || "default";
      }

      // Extract file submission URL
      let fileSubmissionUrl: string | null = null;
      const fileField = props[fileSubmissionProp];
      if (fileField?.url) {
        fileSubmissionUrl = fileField.url;
      } else if (fileField?.rich_text?.length > 0) {
        // Sometimes URLs are stored as rich text
        const text = fileField.rich_text.map((t: any) => t.plain_text).join("");
        if (text.startsWith("http")) fileSubmissionUrl = text;
      }

      // Extract script URL
      let scriptUrl: string | null = null;
      const scriptField = props[scriptProp];
      if (scriptField?.url) {
        scriptUrl = scriptField.url;
      }

      // Extract assignee (People property) - store both name and ID
      let assignee: string | null = null;
      let assigneeId: string | null = null;
      let assigneePropName: string | null = null;
      const assigneeNames = ["Assignee", "Assign", "Assigned to", "Asignado"];
      for (const name of assigneeNames) {
        if (props[name]?.people) {
          assigneePropName = name;
          if (props[name].people.length > 0) {
            assignee = props[name].people.map((p: any) => p.name || p.person?.email || "Unknown").join(", ");
            assigneeId = props[name].people[0]?.id || null;
          }
          break;
        }
      }

      return {
        id: page.id,
        title,
        status,
        statusColor,
        fileSubmissionUrl,
        scriptUrl,
        assignee,
        assigneeId,
        assigneePropName,
        lastEdited: page.last_edited_time,
      };
    });

    // Also fetch Notion workspace users for the assignee picker
    let notionUsers: { id: string; name: string }[] = [];
    try {
      const usersRes = await fetch("https://api.notion.com/v1/users", {
        headers: {
          Authorization: `Bearer ${NOTION_API_KEY}`,
          "Notion-Version": NOTION_API_VERSION,
        },
      });
      if (usersRes.ok) {
        const usersData = await usersRes.json();
        notionUsers = (usersData.results || [])
          .filter((u: any) => u.type === "person")
          .map((u: any) => ({ id: u.id, name: u.name || u.person?.email || "Unknown" }));
      }
    } catch (e) {
      console.error("Failed to fetch Notion users:", e);
    }

    // Detect the assignee property name from the first item that has one
    const detectedAssigneeProp = items.find((i: any) => i.assigneePropName)?.assigneePropName || "Assignee";

    return new Response(JSON.stringify({ items, notionUsers, assigneeProperty: detectedAssigneeProp }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("fetch-editing-queue error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
