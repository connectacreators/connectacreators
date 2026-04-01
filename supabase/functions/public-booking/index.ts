import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NOTION_API_VERSION = "2022-06-28";

/** Convert a Date to decimal hours in a given IANA timezone */
function toLocalDecimalHour(date: Date, timezone: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h + m / 60;
}

/** Compute the UTC offset string (e.g. "-07:00") for a timezone at a given instant */
function getTimezoneOffset(date: Date, timezone: string): string {
  const utcFmt = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", hour: "numeric", minute: "numeric", hour12: false, year: "numeric", month: "2-digit", day: "2-digit" });
  const tzFmt = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "numeric", hour12: false, year: "numeric", month: "2-digit", day: "2-digit" });

  const utcParts = Object.fromEntries(utcFmt.formatToParts(date).map((p) => [p.type, p.value]));
  const tzParts = Object.fromEntries(tzFmt.formatToParts(date).map((p) => [p.type, p.value]));

  const utcMin = (Number(utcParts.day) * 24 + Number(utcParts.hour)) * 60 + Number(utcParts.minute);
  const tzMin = (Number(tzParts.day) * 24 + Number(tzParts.hour)) * 60 + Number(tzParts.minute);

  let diffMin = tzMin - utcMin;
  // Handle day boundary wrap
  if (diffMin > 720) diffMin -= 1440;
  if (diffMin < -720) diffMin += 1440;

  const sign = diffMin >= 0 ? "+" : "-";
  const absDiff = Math.abs(diffMin);
  const oh = String(Math.floor(absDiff / 60)).padStart(2, "0");
  const om = String(absDiff % 60).padStart(2, "0");
  return `${sign}${oh}:${om}`;
}

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
    const clientTimezone = settings.timezone || "America/Denver";

    // ===== GET: Fetch available slots =====
    if (req.method === "GET") {
      const dateStr = url.searchParams.get("date"); // YYYY-MM-DD
      if (!dateStr) {
        return new Response(
          JSON.stringify({
            settings: {
              available_days: settings.available_days,
              start_hour: settings.start_hour,
              end_hour: settings.end_hour,
              slot_duration_minutes: settings.slot_duration_minutes,
              timezone: clientTimezone,
              booking_title: settings.booking_title,
              booking_description: settings.booking_description,
              primary_color: settings.primary_color || "#C4922A",
              secondary_color: settings.secondary_color || "#1A1A1A",
              break_times: settings.break_times || [],
              logo_url: settings.logo_url || null,
            },
            client_name: clientData.name,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Fetch existing leads for this date from Notion to find busy slots
      const startOfDay = `${dateStr}T00:00:00.000`;
      const endOfDay = `${dateStr}T23:59:59.999`;

      const filterClauses: any[] = [
        { property: "Date", date: { on_or_after: startOfDay } },
        { property: "Date", date: { on_or_before: endOfDay } },
        { property: "Lead Status", select: { does_not_equal: "Canceled" } },
      ];

      if (!clientData.notion_lead_database_id) {
        filterClauses.push({ property: "Client", select: { equals: clientNotionName } });
      }

      const filter = { and: filterClauses };

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
            // Convert to the CLIENT's timezone so it matches slot generation
            const hourDec = toLocalDecimalHour(d, clientTimezone);
            return {
              start: hourDec,
              end: hourDec + settings.slot_duration_minutes / 60,
            };
          })
          .filter(Boolean);
      } else {
        console.error("Notion query failed:", await notionResponse.text());
      }

      // Parse break times
      const breakTimes: { start: number; end: number }[] = (settings.break_times || []).map((bt: any) => {
        const [sh, sm] = bt.start.split(":").map(Number);
        const [eh, em] = bt.end.split(":").map(Number);
        return { start: sh + sm / 60, end: eh + em / 60 };
      });

      // Generate available slots
      const slots: string[] = [];
      const durationHours = settings.slot_duration_minutes / 60;
      for (let h = settings.start_hour; h + durationHours <= settings.end_hour; h += durationHours) {
        const isBusy = busySlots.some(
          (b: any) => h < b.end && h + durationHours > b.start
        );
        const isBreak = breakTimes.some(
          (bt) => h < bt.end && h + durationHours > bt.start
        );
        if (!isBusy && !isBreak) {
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

      // Build the datetime with explicit timezone offset so Notion stores it unambiguously
      const bookingDate = new Date(`${date}T${time}:00.000Z`);
      const offset = getTimezoneOffset(bookingDate, clientTimezone);
      const dateTime = `${date}T${time}:00.000${offset}`;

      // Create a new page in the Notion leads database
      const properties: any = {
        "Full Name": { title: [{ text: { content: name } }] },
        "Email": { email: email },
        "Phone Number": { rich_text: [{ text: { content: phone } }] },
        "Date": { date: { start: dateTime } },
        "Lead Status": { select: { name: "Appointment Booked" } },
        "Lead Source": { select: { name: "Website Booking" } },
      };

      if (!clientData.notion_lead_database_id) {
        properties["Client"] = { select: { name: clientNotionName } };
      }

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

      // Save booking to local database + fuzzy-match lead update (fire-and-forget)
      (async () => {
        // 1. Insert booking record
        const { error: bookingError } = await supabase.from("bookings").insert({
          client_id: clientId,
          name,
          email,
          phone,
          message: message || null,
          booking_date: date,
          booking_time: time,
          notion_page_id: createdPage.id,
          status: "confirmed",
        });
        if (bookingError) console.error("Failed to save booking locally:", bookingError);

        // 2. Fuzzy phone match → update existing lead OR create new one
        const normalizePhone = (p: string) => (p || "").replace(/\D/g, "");
        const bookingDigits = normalizePhone(phone);
        if (bookingDigits.length >= 7) {
          const { data: existingLeads } = await supabase
            .from("leads")
            .select("id, phone, status")
            .eq("client_id", clientId);

          const matched = (existingLeads || []).find((lead: any) => {
            const leadDigits = normalizePhone(lead.phone);
            if (leadDigits.length < 7) return false;
            const len = Math.min(10, bookingDigits.length, leadDigits.length);
            return bookingDigits.slice(-len) === leadDigits.slice(-len);
          });

          if (matched) {
            const { error: updateErr } = await supabase.from("leads").update({
              status: "Booked",
              booked: true,
              booking_date: date,
              booking_time: time,
            }).eq("id", (matched as any).id);
            if (updateErr) console.error("Failed to update lead to Booked:", updateErr);
          } else {
            // Direct booker — no prior lead record
            const { error: insertErr } = await supabase.from("leads").insert({
              client_id: clientId,
              name,
              email,
              phone,
              source: "Public Booking",
              status: "Booked",
              booked: true,
              booking_date: date,
              booking_time: time,
            });
            if (insertErr) console.error("Failed to create lead from booking:", insertErr);
          }
        }
      })().catch(err => console.error("Booking/lead link error:", err));

      // Fire-and-forget: send webhook if configured
      if (settings.zapier_webhook_url) {
        fetch(settings.zapier_webhook_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            email,
            phone,
            message: message || "",
            date,
            time,
            client_name: clientNotionName,
            booking_id: createdPage.id,
            timestamp: new Date().toISOString(),
          }),
        }).catch((err) => console.error("Zapier webhook failed:", err));
      }

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
