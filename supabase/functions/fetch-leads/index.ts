import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NOTION_API_VERSION = "2022-06-28";
const LEADS_DATABASE_ID = "5c1f88c1-0938-41b3-bb84-64e70fd58eb7";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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

  const userId = user.id;

  try {
    const NOTION_API_KEY = Deno.env.get("NOTION_API_KEY");
    if (!NOTION_API_KEY) throw new Error("NOTION_API_KEY not configured");

    const url = new URL(req.url);
    let clientName = url.searchParams.get("client_name");

    // Check user role
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    const isAdmin = roleData?.role === "admin";
    const isVideographer = roleData?.role === "videographer";

    if (!clientName) {
      if (isVideographer) {
        // Get all assigned client names for videographer
        const { data: assignments } = await supabase
          .from("videographer_clients")
          .select("client_id, clients(name, notion_lead_name)")
          .eq("videographer_user_id", userId);

        const assignedNames = (assignments || [])
          .map((a: any) => a.clients?.notion_lead_name || a.clients?.name)
          .filter(Boolean);

        if (assignedNames.length === 0 && !isAdmin) {
          return new Response(JSON.stringify({ leads: [], total: 0, statusOptions: [], sourceOptions: [] }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // We'll handle multi-client filter below
        clientName = null;
        // Store for later use
        (req as any).__assignedNames = assignedNames;
      } else if (!isAdmin) {
        // Regular client
        const { data: clientData } = await supabase
          .from("clients")
          .select("name, notion_lead_name")
          .eq("user_id", userId)
          .maybeSingle();

        if (!clientData) {
          return new Response(JSON.stringify({ error: "No client linked to user" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        clientName = (clientData as any).notion_lead_name || clientData.name;
      }
    } else if (!isAdmin) {
      // Non-admin passed client_name — verify access
      if (isVideographer) {
        const { data: assignments } = await supabase
          .from("videographer_clients")
          .select("client_id, clients(name)")
          .eq("videographer_user_id", userId);

        const assignedNames = (assignments || []).map((a: any) => a.clients?.name).filter(Boolean);
        if (!assignedNames.includes(clientName)) {
          return new Response(JSON.stringify({ error: "Forbidden" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        const { data: clientData } = await supabase
          .from("clients")
          .select("name")
          .eq("user_id", userId)
          .maybeSingle();

        if (!clientData || clientData.name !== clientName) {
          return new Response(JSON.stringify({ error: "Forbidden" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // Build Notion query filter
    let filter: any = undefined;
    const assignedNames = (req as any).__assignedNames as string[] | undefined;

    if (clientName) {
      filter = { property: "Client", select: { equals: clientName } };
    } else if (isVideographer && assignedNames && assignedNames.length > 0) {
      if (assignedNames.length === 1) {
        filter = { property: "Client", select: { equals: assignedNames[0] } };
      } else {
        filter = {
          or: assignedNames.map((name: string) => ({
            property: "Client",
            select: { equals: name },
          })),
        };
      }
    }

    // Fetch database schema
    const schemaResponse = await fetch(
      `https://api.notion.com/v1/databases/${LEADS_DATABASE_ID}`,
      {
        headers: {
          Authorization: `Bearer ${NOTION_API_KEY}`,
          "Notion-Version": NOTION_API_VERSION,
        },
      }
    );

    let statusOptions: string[] = [];
    let sourceOptions: string[] = [];
    if (schemaResponse.ok) {
      const schemaData = await schemaResponse.json();
      statusOptions = (schemaData.properties?.["Lead Status"]?.select?.options || []).map((o: any) => o.name);
      sourceOptions = (schemaData.properties?.["Lead Source"]?.select?.options || []).map((o: any) => o.name);
    } else {
      await schemaResponse.text(); // consume body
    }

    // Query Notion
    const notionResponse = await fetch(
      `https://api.notion.com/v1/databases/${LEADS_DATABASE_ID}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${NOTION_API_KEY}`,
          "Notion-Version": NOTION_API_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filter,
          page_size: 100,
          sorts: [{ property: "Date", direction: "descending" }],
        }),
      }
    );

    if (!notionResponse.ok) {
      const errText = await notionResponse.text();
      console.error("Notion API error:", notionResponse.status, errText);
      throw new Error(`Notion API error: ${notionResponse.status}`);
    }

    const notionData = await notionResponse.json();

    const leads = notionData.results.map((page: any) => {
      const props = page.properties;
      return {
        id: page.id,
        fullName: props["Full Name"]?.title?.[0]?.plain_text || "",
        email: props["Email"]?.email || "",
        phone: props["Phone Number"]?.rich_text?.[0]?.plain_text || "",
        leadStatus: props["Lead Status"]?.select?.name || "",
        leadSource: props["Lead Source"]?.select?.name || "",
        client: props["Client"]?.select?.name || "",
        campaignName: props["Campaign Name"]?.rich_text?.[0]?.plain_text || "",
        notes: props["Notes"]?.rich_text?.[0]?.plain_text || "",
        createdDate: props["Date"]?.date?.start || "",
        lastContacted: props["Last Contacted"]?.date?.start || "",
        appointmentDate: props["Date"]?.date?.start || "",
        notionUrl: page.url,
      };
    });

    return new Response(
      JSON.stringify({ leads, hasMore: notionData.has_more, total: leads.length, statusOptions, sourceOptions }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("fetch-leads error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
