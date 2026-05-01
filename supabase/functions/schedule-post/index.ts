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

  try {
    const body = await req.json();
    const { client_id, notion_page_id, title, scheduled_date, file_submission_url, script_url, skip_notion } = body;

    if (!client_id || !notion_page_id || !title || !scheduled_date) {
      return new Response(JSON.stringify({ error: "Missing required fields: client_id, notion_page_id, title, scheduled_date" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const NOTION_API_KEY = Deno.env.get("NOTION_API_KEY");
    if (!NOTION_API_KEY) throw new Error("NOTION_API_KEY not configured");

    // 1. Upsert into content_calendar table
    // Preserve existing post_status if the record already exists (editors may have changed it in Notion)
    const { data: existingEntry } = await serviceSupabase
      .from("content_calendar")
      .select("id, post_status")
      .eq("client_id", client_id)
      .eq("notion_page_id", notion_page_id)
      .maybeSingle();

    const { data: calendarEntry, error: dbError } = await serviceSupabase
      .from("content_calendar")
      .upsert(
        {
          client_id,
          notion_page_id,
          title,
          scheduled_date,
          post_status: existingEntry?.post_status || "Scheduled",
          file_submission_url: file_submission_url || null,
          script_url: script_url || null,
        },
        { onConflict: "client_id,notion_page_id" }
      )
      .select()
      .single();

    if (dbError) throw dbError;

    // 2. Update Notion page: Post Status + Scheduled Date (skip for DB-only items)
    let notionUpdated = false;
    let notionError: string | null = null;
    let notionDebug: Record<string, unknown> = {};

    if (skip_notion) {
      notionUpdated = true; // treat as success — no Notion page to update
    } else try {
      // Fetch the page to discover actual property names and types
      const pageRes = await fetch(`https://api.notion.com/v1/pages/${notion_page_id}`, {
        headers: {
          Authorization: `Bearer ${NOTION_API_KEY}`,
          "Notion-Version": NOTION_API_VERSION,
        },
      });

      if (!pageRes.ok) {
        notionError = `Failed to fetch Notion page: ${pageRes.status} ${await pageRes.text()}`;
      } else {
        const pageData = await pageRes.json();
        const pageProps: Record<string, any> = pageData.properties || {};
        const databaseId = pageData.parent?.database_id;

        notionDebug.availableProps = Object.entries(pageProps).map(([name, prop]) => ({
          name,
          type: (prop as any)?.type,
        }));

        // ── 1. Update the date property (independent PATCH) ──────────────────
        const dateKeywords = ["scheduled", "date", "post", "publish", "fecha", "programad", "calendario", "cal"];
        // Priority 0: exact well-known names
        const exactDateNames = ["Scheduled Date", "Fecha Programada", "Publish Date", "Date", "Fecha", "Programado", "Scheduled"];
        let datePropName: string | null = null;
        for (const name of exactDateNames) {
          if ((pageProps[name] as any)?.type === "date") { datePropName = name; break; }
        }
        // Priority 1: name contains keyword
        if (!datePropName) {
          for (const [name, prop] of Object.entries(pageProps)) {
            if ((prop as any)?.type === "date") {
              const lname = name.toLowerCase();
              if (dateKeywords.some((kw) => lname.includes(kw))) { datePropName = name; break; }
            }
          }
        }
        // Priority 2: any date property
        if (!datePropName) {
          for (const [name, prop] of Object.entries(pageProps)) {
            if ((prop as any)?.type === "date") { datePropName = name; break; }
          }
        }
        notionDebug.datePropUsed = datePropName;

        if (datePropName) {
          const dateRes = await fetch(`https://api.notion.com/v1/pages/${notion_page_id}`, {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${NOTION_API_KEY}`,
              "Notion-Version": NOTION_API_VERSION,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ properties: { [datePropName]: { date: { start: scheduled_date } } } }),
          });
          if (!dateRes.ok) {
            const t = await dateRes.text();
            console.warn("Date PATCH error:", dateRes.status, t);
            notionError = `Date update failed: ${dateRes.status}`;
          } else {
            notionUpdated = true;
          }
        }

        // ── 2. Update Post Status (separate PATCH, fetch valid options first) ─
        const postStatusProp = pageProps["Post Status"];
        if (postStatusProp && databaseId) {
          // Fetch database schema to get valid option names
          const dbRes = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
            headers: { Authorization: `Bearer ${NOTION_API_KEY}`, "Notion-Version": NOTION_API_VERSION },
          });
          if (dbRes.ok) {
            const dbData = await dbRes.json();
            const dbPostStatus = dbData.properties?.["Post Status"];
            let validOptions: string[] = [];
            if (dbPostStatus?.type === "status") {
              for (const group of dbPostStatus.status?.groups || []) {
                for (const opt of group.option_ids || []) { /* ids, not names */ }
              }
              validOptions = (dbPostStatus.status?.options || []).map((o: any) => o.name as string);
            } else if (dbPostStatus?.type === "select") {
              validOptions = (dbPostStatus.select?.options || []).map((o: any) => o.name as string);
            }
            notionDebug.validStatusOptions = validOptions;

            // Find closest match: exact (case-insensitive) → contains "schedul" → first option
            const keywords = ["schedul", "programad", "post", "approved", "done"];
            let chosenOption: string | null = null;
            const lower = validOptions.map((o) => o.toLowerCase());
            // exact case-insensitive
            chosenOption = validOptions.find((o) => o.toLowerCase() === "scheduled") || null;
            // contains scheduling keyword
            if (!chosenOption) {
              for (const kw of keywords) {
                chosenOption = validOptions.find((o) => o.toLowerCase().includes(kw)) || null;
                if (chosenOption) break;
              }
            }
            // fallback: last option (usually "Done" or similar final state)
            if (!chosenOption && validOptions.length > 0) {
              chosenOption = validOptions[validOptions.length - 1];
            }

            notionDebug.chosenStatusOption = chosenOption;

            if (chosenOption) {
              const statusBody = postStatusProp.type === "status"
                ? { "Post Status": { status: { name: chosenOption } } }
                : { "Post Status": { select: { name: chosenOption } } };
              const statusRes = await fetch(`https://api.notion.com/v1/pages/${notion_page_id}`, {
                method: "PATCH",
                headers: {
                  Authorization: `Bearer ${NOTION_API_KEY}`,
                  "Notion-Version": NOTION_API_VERSION,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ properties: statusBody }),
              });
              if (!statusRes.ok) {
                const t = await statusRes.text();
                console.warn("Status PATCH error:", statusRes.status, t);
                notionError = (notionError ? notionError + " | " : "") + `Status update failed: ${statusRes.status}`;
              } else {
                notionUpdated = true;
              }
            }
          }
        }
      }
    } catch (notionErr) {
      notionError = String(notionErr);
      console.error("Notion update exception:", notionErr);
    }

    return new Response(
      JSON.stringify({ success: true, entry: calendarEntry, notionUpdated, notionError, notionDebug }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.error("schedule-post error:", errorMsg);
    return new Response(
      JSON.stringify({ error: errorMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
