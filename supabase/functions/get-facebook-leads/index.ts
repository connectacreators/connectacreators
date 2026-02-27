import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FB_API = "https://graph.facebook.com/v19.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { client_id, page_id, form_id, limit = 3 } = await req.json();

    if (!client_id || !page_id || !form_id) {
      return new Response(
        JSON.stringify({ error: "Missing client_id, page_id, or form_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get page access token
    const { data: pageRow } = await supabase
      .from("facebook_pages")
      .select("page_access_token")
      .eq("client_id", client_id)
      .eq("page_id", page_id)
      .single();

    if (!pageRow?.page_access_token) {
      return new Response(JSON.stringify({ error: "Page not found or not connected" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch leads from Facebook API
    const leadsRes = await fetch(
      `${FB_API}/${form_id}/leads?fields=id,created_time,field_data,ad_id,ad_name&limit=${limit}&access_token=${pageRow.page_access_token}`
    );

    if (!leadsRes.ok) {
      const errData = await leadsRes.json();
      console.error("Facebook API error:", errData);
      return new Response(
        JSON.stringify({ error: `Failed to fetch leads: ${errData.error?.message || leadsRes.statusText}` }),
        { status: leadsRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const leadsData = await leadsRes.json();

    // Parse lead data
    const leads = (leadsData.data || []).map((lead: any) => {
      const fieldData: Record<string, string> = {};

      if (lead.field_data) {
        lead.field_data.forEach((field: any) => {
          fieldData[field.name] = field.values?.[0] || "";
        });
      }

      return {
        id: lead.id,
        created_time: lead.created_time,
        name: fieldData["Full Name"] || fieldData["Name"] || "",
        email: fieldData["Email"] || "",
        phone: fieldData["Phone Number"] || fieldData["Phone"] || "",
        message: fieldData["Message"] || fieldData["Comments"] || "",
        ad_name: lead.ad_name || "",
        raw_fields: fieldData,
      };
    });

    return new Response(JSON.stringify({ leads, count: leads.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("get-facebook-leads error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
