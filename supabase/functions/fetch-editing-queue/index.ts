import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NOTION_API_VERSION = "2022-06-28";

async function fetchQueueForClient(
  serviceSupabase: any,
  clientId: string,
  NOTION_API_KEY: string
) {
  const { data: mapping, error: mapErr } = await serviceSupabase
    .from("client_notion_mapping")
    .select("notion_database_id, title_property, script_property, file_submission_property")
    .eq("client_id", clientId)
    .maybeSingle();

  if (mapErr) throw mapErr;
  if (!mapping) return { items: [], notionUsers: [], assigneeProperty: "Assignee", revisionProperty: "Revisions" };

  const titleProp = mapping.title_property || "Reel title";
  const scriptProp = mapping.script_property || "Script";
  const fileSubmissionProp = mapping.file_submission_property || "File Submission";

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

    let title = "Untitled";
    const titleField = props[titleProp];
    if (titleField?.title?.length > 0) {
      title = titleField.title.map((t: any) => t.plain_text).join("");
    }

    let status = "Unknown";
    let statusColor = "default";
    const statusField = props["Status"];
    if (statusField?.status) {
      status = statusField.status.name || "Unknown";
      statusColor = statusField.status.color || "default";
    }

    let fileSubmissionUrl: string | null = null;
    const fileField = props[fileSubmissionProp];
    if (fileField?.url) {
      fileSubmissionUrl = fileField.url;
    } else if (fileField?.rich_text?.length > 0) {
      const text = fileField.rich_text.map((t: any) => t.plain_text).join("");
      if (text.startsWith("http")) fileSubmissionUrl = text;
    }

    let scriptUrl: string | null = null;
    const scriptField = props[scriptProp];
    if (scriptField?.url) {
      scriptUrl = scriptField.url;
    }

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

    let revisions: string | null = null;
    const revisionNames = ["Revisions", "Revisiones", "Revision", "Revisión", "Notes", "Notas"];
    let revisionPropName: string | null = null;
    for (const name of revisionNames) {
      if (props[name]?.rich_text !== undefined) {
        revisionPropName = name;
        if (props[name].rich_text.length > 0) {
          revisions = props[name].rich_text.map((t: any) => t.plain_text).join("");
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
      revisions,
      revisionPropName,
      lastEdited: page.last_edited_time,
    };
  });

  // Fetch Notion workspace users
  const notionUsersMap = new Map<string, string>();
  try {
    const usersRes = await fetch("https://api.notion.com/v1/users", {
      headers: {
        Authorization: `Bearer ${NOTION_API_KEY}`,
        "Notion-Version": NOTION_API_VERSION,
      },
    });
    if (usersRes.ok) {
      const usersData = await usersRes.json();
      (usersData.results || [])
        .filter((u: any) => u.type === "person")
        .forEach((u: any) => {
          const name = u.name || u.person?.email || "Unknown";
          notionUsersMap.set(u.id, name);
        });
    }
  } catch (e) {
    console.error("Failed to fetch Notion users:", e);
  }

  for (const item of items) {
    if (item.assigneeId && !notionUsersMap.has(item.assigneeId) && item.assignee) {
      notionUsersMap.set(item.assigneeId, item.assignee);
    }
  }

  const notionUsers = Array.from(notionUsersMap.entries()).map(([id, name]) => ({ id, name }));
  const detectedAssigneeProp = items.find((i: any) => i.assigneePropName)?.assigneePropName || "Assignee";
  const detectedRevisionProp = items.find((i: any) => i.revisionPropName)?.revisionPropName || "Revisions";

  return { items, notionUsers, assigneeProperty: detectedAssigneeProp, revisionProperty: detectedRevisionProp };
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
    const { client_id, client_ids } = body;

    const NOTION_API_KEY = Deno.env.get("NOTION_API_KEY");
    if (!NOTION_API_KEY) throw new Error("NOTION_API_KEY not configured");

    const serviceSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Batch mode: multiple client_ids ──
    if (client_ids && Array.isArray(client_ids) && client_ids.length > 0) {
      // Fetch client names
      const { data: clientsData } = await serviceSupabase
        .from("clients")
        .select("id, name")
        .in("id", client_ids);

      const clientNameMap = new Map<string, string>();
      (clientsData || []).forEach((c: any) => clientNameMap.set(c.id, c.name));

      const allItems: any[] = [];
      const allUsersMap = new Map<string, string>();
      let assigneeProp = "Assignee";
      let revisionProp = "Revisions";

      const results = await Promise.allSettled(
        client_ids.map((cid: string) => fetchQueueForClient(serviceSupabase, cid, NOTION_API_KEY))
      );

      results.forEach((result, idx) => {
        if (result.status === "fulfilled") {
          const cid = client_ids[idx];
          const cName = clientNameMap.get(cid) || "Unknown";
          const data = result.value;

          data.items.forEach((item: any) => {
            allItems.push({ ...item, clientId: cid, clientName: cName });
          });
          data.notionUsers.forEach((u: any) => {
            if (!allUsersMap.has(u.id)) allUsersMap.set(u.id, u.name);
          });
          if (data.assigneeProperty !== "Assignee") assigneeProp = data.assigneeProperty;
          if (data.revisionProperty !== "Revisions") revisionProp = data.revisionProperty;
        } else {
          console.error(`Failed to fetch queue for client ${client_ids[idx]}:`, result.reason);
        }
      });

      const notionUsers = Array.from(allUsersMap.entries()).map(([id, name]) => ({ id, name }));

      return new Response(JSON.stringify({ items: allItems, notionUsers, assigneeProperty: assigneeProp, revisionProperty: revisionProp }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Single client mode (backward compatible) ──
    if (!client_id) throw new Error("client_id is required");

    const result = await fetchQueueForClient(serviceSupabase, client_id, NOTION_API_KEY);

    return new Response(JSON.stringify(result), {
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
