import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NOTION_API_VERSION = "2022-06-28";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const NOTION_API_KEY = Deno.env.get("NOTION_API_KEY");
    if (!NOTION_API_KEY) throw new Error("NOTION_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const url = new URL(req.url);
    const clientId = url.searchParams.get("client_id");

    if (!clientId) {
      return new Response(JSON.stringify({ error: "client_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch booking settings
    const { data: settings, error: settingsError } = await supabase
      .from("booking_settings")
      .select("*")
      .eq("client_id", clientId)
      .eq("is_active", true)
      .maybeSingle();

    if (settingsError || !settings) {
      return new Response(
        JSON.stringify({ error: "Booking not available for this client" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch client info to get Notion database ID
    const { data: clientData } = await supabase
      .from("clients")
      .select("name, notion_lead_name, notion_lead_database_id")
      .eq("id", clientId)
      .maybeSingle();

    if (!clientData) {
      return new Response(
        JSON.stringify({ error: "Client not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const DEFAULT_LEADS_DATABASE_ID = "5c1f88c1-0938-41b3-bb84-64e70fd58eb7";
    const leadsDbId = clientData.notion_lead_database_id || DEFAULT_LEADS_DATABASE_ID;
    const clientNotionName = clientData.notion_lead_name || clientData.name;

    // ===== GET: Fetch available slots =====
    if (req.method === "GET") {
      const dateStr = url.searchParams.get("date"); // YYYY-MM-DD
      if (!dateStr) {
        // Return settings only
        return new Response(
          JSON.stringify({
            settings: {
              available_days: settings.available_days,
              start_hour: settings.start_hour,
              end_hour: settings.end_hour,
              slot_duration_minutes: settings.slot_duration_minutes,
              timezone: settings.timezone,
              booking_title: settings.booking_title,
              booking_description: settings.booking_description,
              primary_color: settings.primary_color || "#C4922A",
              secondary_color: settings.secondary_color || "#1A1A1A",
            },
            client_name: clientData.name,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Fetch existing leads for this date from Notion to find busy slots
      const startOfDay = `${dateStr}T00:00:00.000Z`;
      const endOfDay = `${dateStr}T23:59:59.999Z`;

      const filter: any = {
        and: [
          { property: "Date", date: { on_or_after: startOfDay } },
          { property: "Date", date: { on_or_before: endOfDay } },
        ],
      };

      // If using shared DB, filter by client
      if (!clientData.notion_lead_database_id) {
        filter.and.push({ property: "Client", select: { equals: clientNotionName } });
      }

      const notionResponse = await fetch(
        `https://api.notion.com/v1/databases/${leadsDbId}/query`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${NOTION_API_KEY}`,
            "Notion-Version": NOTION_API_VERSION,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ filter, page_size: 100 }),
        }
      );

      let busySlots: { start: number; end: number }[] = [];

      if (notionResponse.ok) {
        const notionData = await notionResponse.json();
        busySlots = notionData.results
          .map((page: any) => {
            const dateVal = page.properties["Date"]?.date?.start;
            if (!dateVal || !dateVal.includes("T")) return null;
            const d = new Date(dateVal);
            const hourDec = d.getHours() + d.getMinutes() / 60;
            return {
              start: hourDec,
              end: hourDec + settings.slot_duration_minutes / 60,
            };
          })
          .filter(Boolean);
      } else {
        console.error("Notion query failed:", await notionResponse.text());
      }

      // Generate available slots
      const slots: string[] = [];
      const durationHours = settings.slot_duration_minutes / 60;
      for (let h = settings.start_hour; h + durationHours <= settings.end_hour; h += durationHours) {
        const isBusy = busySlots.some(
          (b: any) => h < b.end && h + durationHours > b.start
        );
        if (!isBusy) {
          const hours = Math.floor(h);
          const minutes = Math.round((h - hours) * 60);
          slots.push(`${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`);
        }
      }

      return new Response(
        JSON.stringify({ date: dateStr, available_slots: slots, busy_count: busySlots.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===== POST: Create a booking in Notion =====
    if (req.method === "POST") {
      const body = await req.json();
      const { name, email, phone, message, date, time } = body;

      if (!name || !email || !phone || !date || !time) {
        return new Response(
          JSON.stringify({ error: "name, email, phone, date and time are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Build the datetime
      const dateTime = `${date}T${time}:00.000`;

      // Create a new page in the Notion leads database
      const properties: any = {
        "Full Name": { title: [{ text: { content: name } }] },
        "Email": { email: email },
        "Phone Number": { rich_text: [{ text: { content: phone } }] },
        "Date": { date: { start: dateTime } },
        "Lead Status": { select: { name: "Appointment Booked" } },
        "Lead Source": { select: { name: "Website Booking" } },
      };

      // Add client select if using shared DB
      if (!clientData.notion_lead_database_id) {
        properties["Client"] = { select: { name: clientNotionName } };
      }

      // Add notes/message
      if (message) {
        properties["Notes"] = { rich_text: [{ text: { content: message } }] };
      }

      const createResponse = await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${NOTION_API_KEY}`,
          "Notion-Version": NOTION_API_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          parent: { database_id: leadsDbId },
          properties,
        }),
      });

      if (!createResponse.ok) {
        const errText = await createResponse.text();
        console.error("Failed to create Notion page:", errText);
        return new Response(
          JSON.stringify({ error: "Failed to create booking" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const createdPage = await createResponse.json();

      return new Response(
        JSON.stringify({ success: true, booking_id: createdPage.id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("public-booking error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
