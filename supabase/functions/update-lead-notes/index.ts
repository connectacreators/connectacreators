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
    const { leadId, notes, clientId } = await req.json();

    if (!leadId || notes === undefined || notes === null) {
      return new Response(JSON.stringify({ error: "leadId and notes are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Sanitize notes — trim whitespace, cap at 10,000 chars
    const sanitizedNotes = String(notes).trim().slice(0, 10000);

    // Authorization check — allow admin, videographer, and client users
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    const isAdmin = roleData?.role === "admin";
    const isVideographer = roleData?.role === "videographer";

    if (!isAdmin) {
      if (isVideographer) {
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

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── DB Lead (id starts with "db_") ──
    if (leadId.startsWith("db_")) {
      const realId = leadId.slice(3);
      const { error: dbError } = await adminClient
        .from("leads")
        .update({ notes: sanitizedNotes || null })
        .eq("id", realId);

      if (dbError) throw new Error(`DB update error: ${dbError.message}`);

      // Also try to sync to Notion if the client has a leads database configured
      if (clientId) {
        const NOTION_API_KEY = Deno.env.get("NOTION_API_KEY");
        if (NOTION_API_KEY) {
          try {
            // Get lead's email/phone to find the matching Notion page
            const { data: leadRow } = await adminClient
              .from("leads")
              .select("email, phone, name")
              .eq("id", realId)
              .single();

            const { data: notionMapping } = await adminClient
              .from("client_notion_mapping")
              .select("notion_leads_database_id")
              .eq("client_id", clientId)
              .maybeSingle();

            const leadsDbId = (notionMapping as any)?.notion_leads_database_id;

            if (leadsDbId && leadRow) {
              // Search Notion for matching lead page by email
              const searchFilters: any[] = [];
              if (leadRow.email) {
                searchFilters.push({ property: "Email", email: { equals: leadRow.email } });
              }
              if (leadRow.phone) {
                searchFilters.push({ property: "Phone Number", rich_text: { contains: leadRow.phone.slice(-7) } });
              }

              if (searchFilters.length > 0) {
                const searchBody: any = { page_size: 1 };
                if (searchFilters.length === 1) {
                  searchBody.filter = searchFilters[0];
                } else {
                  searchBody.filter = { or: searchFilters };
                }

                const searchRes = await fetch(
                  `https://api.notion.com/v1/databases/${leadsDbId}/query`,
                  {
                    method: "POST",
                    headers: {
                      Authorization: `Bearer ${NOTION_API_KEY}`,
                      "Notion-Version": NOTION_API_VERSION,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify(searchBody),
                  }
                );

                if (searchRes.ok) {
                  const searchData = await searchRes.json();
                  const notionPage = searchData.results?.[0];

                  if (notionPage) {
                    // Update the Notes field on the found Notion page
                    await fetch(`https://api.notion.com/v1/pages/${notionPage.id}`, {
                      method: "PATCH",
                      headers: {
                        Authorization: `Bearer ${NOTION_API_KEY}`,
                        "Notion-Version": NOTION_API_VERSION,
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({
                        properties: {
                          "Notes": {
                            rich_text: sanitizedNotes
                              ? [{ type: "text", text: { content: sanitizedNotes } }]
                              : [],
                          },
                        },
                      }),
                    });
                  }
                }
              }
            }
          } catch (notionSyncErr) {
            // Non-fatal: DB was already updated, Notion sync is best-effort
            console.warn("Notion sync error (non-fatal):", notionSyncErr);
          }
        }
      }

      return new Response(JSON.stringify({ success: true, id: realId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Notion Lead (id is a Notion page ID) ──
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
          "Notes": {
            rich_text: sanitizedNotes
              ? [{ type: "text", text: { content: sanitizedNotes } }]
              : [],
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

    return new Response(JSON.stringify({ success: true, id: updated.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("update-lead-notes error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
