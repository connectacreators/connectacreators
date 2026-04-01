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

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Use service role client for all DB operations and JWT validation
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Validate the user's JWT using service role
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const url = new URL(req.url);
    const clientIdParam = url.searchParams.get("client_id");
    let clientName = url.searchParams.get("client_name");

    // Check user role
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    const isAdmin = roleData?.role === "admin";
    const isVideographer = roleData?.role === "videographer";

    // Resolve clientId and clientName
    let resolvedClientId: string | null = clientIdParam;

    // If client_id provided, resolve clientName from it
    if (resolvedClientId && !clientName) {
      const { data: clientById } = await supabaseAdmin
        .from("clients")
        .select("name, notion_lead_name")
        .eq("id", resolvedClientId)
        .maybeSingle();
      if (clientById) {
        clientName = (clientById as any).notion_lead_name || clientById.name;
      }
    }

    // If non-admin/videographer with no clientId, get their own client
    if (!isAdmin && !isVideographer && !resolvedClientId) {
      const { data: clientData } = await supabaseAdmin
        .from("clients")
        .select("id, name, notion_lead_name")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!clientData) {
        return new Response(JSON.stringify({ error: "No client linked to user" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      resolvedClientId = clientData.id;
      clientName = (clientData as any).notion_lead_name || clientData.name;
    }

    // If we have clientName but still no clientId, resolve from name (e.g. LeadCalendar passes client_name only)
    if (!resolvedClientId && clientName) {
      const { data: clientByName } = await supabaseAdmin
        .from("clients")
        .select("id")
        .or(`notion_lead_name.eq.${clientName},name.eq.${clientName}`)
        .maybeSingle();
      if (clientByName?.id) resolvedClientId = clientByName.id;
    }

    // -------- FETCH FROM SUPABASE LEADS TABLE --------
    let dbLeads: any[] = [];

    if (resolvedClientId) {
      const { data: leadsData } = await supabaseAdmin
        .from("leads")
        .select("*")
        .eq("client_id", resolvedClientId)
        .order("created_at", { ascending: false });

      dbLeads = (leadsData || []).map((lead: any) => {
        let apptDate = "";
        if (lead.booking_date) {
          apptDate = lead.booking_time
            ? `${lead.booking_date}T${lead.booking_time}`
            : `${lead.booking_date}T09:00`;
        }
        return {
          id: `db_${lead.id}`,
          fullName: lead.name || "",
          email: lead.email || "",
          phone: lead.phone || "",
          leadStatus: lead.status || "New Lead",
          leadSource: lead.source || "",
          client: clientName || "",
          campaignName: "",
          notes: lead.notes || "",
          createdDate: lead.created_at || "",
          lastContacted: lead.last_contacted_at || "",
          appointmentDate: apptDate,
          bookingTime: lead.booking_time || "",
          booked: lead.booked || false,
          notionUrl: "",
        };
      });
    } else if (isAdmin) {
      // Admin with no specific client — fetch all leads with client name
      const { data: leadsData } = await supabaseAdmin
        .from("leads")
        .select("*, clients(name)")
        .order("created_at", { ascending: false });

      dbLeads = (leadsData || []).map((lead: any) => {
        let apptDate = "";
        if (lead.booking_date) {
          apptDate = lead.booking_time
            ? `${lead.booking_date}T${lead.booking_time}`
            : `${lead.booking_date}T09:00`;
        }
        return {
          id: `db_${lead.id}`,
          fullName: lead.name || "",
          email: lead.email || "",
          phone: lead.phone || "",
          leadStatus: lead.status || "New Lead",
          leadSource: lead.source || "",
          client: lead.clients?.name || "",
          campaignName: "",
          notes: lead.notes || "",
          createdDate: lead.created_at || "",
          lastContacted: lead.last_contacted_at || "",
          appointmentDate: apptDate,
          bookingTime: lead.booking_time || "",
          booked: lead.booked || false,
          notionUrl: "",
        };
      });
    }

    // -------- FETCH FROM NOTION (if configured for this client) --------
    let notionLeads: any[] = [];
    let statusOptions: string[] = [];
    let sourceOptions: string[] = [];

    const NOTION_API_KEY = Deno.env.get("NOTION_API_KEY");

    if (NOTION_API_KEY && resolvedClientId) {
      const { data: notionMapping } = await supabaseAdmin
        .from("client_notion_mapping")
        .select("notion_leads_database_id")
        .eq("client_id", resolvedClientId)
        .maybeSingle();

      const leadsDbId = (notionMapping as any)?.notion_leads_database_id;

      if (leadsDbId) {
        // Fetch schema for status/source options
        try {
          const schemaResponse = await fetch(
            `https://api.notion.com/v1/databases/${leadsDbId}`,
            {
              headers: {
                Authorization: `Bearer ${NOTION_API_KEY}`,
                "Notion-Version": NOTION_API_VERSION,
              },
            }
          );

          if (schemaResponse.ok) {
            const schemaData = await schemaResponse.json();
            statusOptions = (schemaData.properties?.["Lead Status"]?.select?.options || []).map((o: any) => o.name);
            sourceOptions = (schemaData.properties?.["Lead Source"]?.select?.options || []).map((o: any) => o.name);
          } else {
            await schemaResponse.text();
          }
        } catch (_) { /* ignore schema errors */ }

        // Fetch leads from Notion
        try {
          const notionResponse = await fetch(
            `https://api.notion.com/v1/databases/${leadsDbId}/query`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${NOTION_API_KEY}`,
                "Notion-Version": NOTION_API_VERSION,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                page_size: 100,
                sorts: [{ property: "Date", direction: "descending" }],
                ...(clientName ? {
                  filter: {
                    property: "Client",
                    select: { equals: clientName },
                  },
                } : {}),
              }),
            }
          );

          if (notionResponse.ok) {
            const notionData = await notionResponse.json();
            notionLeads = notionData.results.map((page: any) => {
              const props = page.properties;
              return {
                id: page.id,
                fullName: props["Full Name"]?.title?.[0]?.plain_text || "",
                email: props["Email"]?.email || "",
                phone: props["Phone Number"]?.rich_text?.[0]?.plain_text || "",
                leadStatus: props["Lead Status"]?.select?.name || "",
                leadSource: props["Lead Source"]?.select?.name || "",
                client: props["Client"]?.select?.name || clientName || "",
                campaignName: props["Campaign Name"]?.rich_text?.[0]?.plain_text || "",
                notes: props["Notes"]?.rich_text?.[0]?.plain_text || "",
                createdDate: props["Date"]?.date?.start || "",
                lastContacted: props["Last Contacted"]?.date?.start || "",
                appointmentDate: props["Date"]?.date?.start || "",
                notionUrl: page.url,
              };
            });
          } else {
            await notionResponse.text();
          }
        } catch (_) { /* ignore Notion errors, fall back to DB leads */ }
      }
    }

    // -------- MERGE: Notion leads + DB leads (deduplicate by email/phone) --------
    // Notion leads take priority as they have richer data
    const emailsSeen = new Set<string>();
    const phonesSeen = new Set<string>();
    const merged: any[] = [];

    for (const lead of notionLeads) {
      merged.push(lead);
      if (lead.email) emailsSeen.add(lead.email.toLowerCase());
      if (lead.phone) phonesSeen.add(lead.phone.replace(/\D/g, ""));
    }

    for (const lead of dbLeads) {
      const emailKey = lead.email?.toLowerCase();
      const phoneKey = lead.phone?.replace(/\D/g, "");
      const isDup =
        (emailKey && emailsSeen.has(emailKey)) ||
        (phoneKey && phoneKey.length >= 7 && phonesSeen.has(phoneKey));
      if (!isDup) {
        merged.push(lead);
        if (emailKey) emailsSeen.add(emailKey);
        if (phoneKey && phoneKey.length >= 7) phonesSeen.add(phoneKey);
      }
    }

    // Sort by createdDate descending
    merged.sort((a, b) => {
      const dateA = a.createdDate ? new Date(a.createdDate).getTime() : 0;
      const dateB = b.createdDate ? new Date(b.createdDate).getTime() : 0;
      return dateB - dateA;
    });

    return new Response(
      JSON.stringify({ leads: merged, total: merged.length, statusOptions, sourceOptions }),
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
