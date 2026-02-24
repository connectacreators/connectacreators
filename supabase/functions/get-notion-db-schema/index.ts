import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

interface NotionProperty {
  name: string;
  type: string;
  id: string;
  options?: Array<{ name: string; color?: string }>;
}

interface NotionPage {
  id: string;
  title: string;
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { database_id } = await req.json();

    if (!database_id) {
      return new Response(JSON.stringify({ error: "database_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const notionApiKey = Deno.env.get("NOTION_API_KEY");
    if (!notionApiKey) {
      console.error("NOTION_API_KEY not set");
      return new Response(JSON.stringify({ error: "NOTION_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const headers = {
      Authorization: `Bearer ${notionApiKey}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    };

    // Fetch database schema
    const dbResponse = await fetch(`https://api.notion.com/v1/databases/${database_id}`, {
      method: "GET",
      headers,
    });

    if (!dbResponse.ok) {
      const error = await dbResponse.text();
      console.error(`Notion DB fetch error: ${dbResponse.status}`, error);
      return new Response(
        JSON.stringify({
          error: `Failed to fetch database: ${dbResponse.status}`,
          detail: error,
        }),
        {
          status: dbResponse.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const dbData = await dbResponse.json();
    const properties: NotionProperty[] = [];

    // Parse database properties
    for (const [key, prop] of Object.entries(dbData.properties || {})) {
      const propType = (prop as any).type || "unknown";
      const notionProp: NotionProperty = {
        name: key,
        type: propType,
        id: key,
      };

      // Extract options for select/status/multi_select fields
      if (propType === "select" && (prop as any).select?.options) {
        notionProp.options = (prop as any).select.options.map(
          (opt: any) => ({ name: opt.name, color: opt.color })
        );
      } else if (propType === "status" && (prop as any).status?.options) {
        notionProp.options = (prop as any).status.options.map(
          (opt: any) => ({ name: opt.name, color: opt.color })
        );
      } else if (propType === "multi_select" && (prop as any).multi_select?.options) {
        notionProp.options = (prop as any).multi_select.options.map(
          (opt: any) => ({ name: opt.name, color: opt.color })
        );
      }

      properties.push(notionProp);
    }

    // Fetch recent pages
    const queryResponse = await fetch(
      `https://api.notion.com/v1/databases/${database_id}/query`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          page_size: 25,
          sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
        }),
      }
    );

    const pages: NotionPage[] = [];
    if (queryResponse.ok) {
      const queryData = await queryResponse.json();
      for (const page of queryData.results || []) {
        // Extract title from the title property
        let title = "Untitled";
        for (const [key, prop] of Object.entries(page.properties || {})) {
          if ((prop as any).type === "title" && (prop as any).title?.length > 0) {
            title = (prop as any).title
              .map((t: any) => t.plain_text)
              .join("");
            break;
          }
        }
        pages.push({
          id: page.id,
          title: title || "Untitled",
        });
      }
    }

    return new Response(
      JSON.stringify({
        properties,
        pages,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", detail: String(error) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
