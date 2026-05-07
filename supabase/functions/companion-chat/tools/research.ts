// supabase/functions/companion-chat/tools/research.ts
import type { ToolContext, ToolDef, ToolResult } from "./types.ts";
import { resolveClient } from "./types.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export const RESEARCH_TOOLS: ToolDef[] = [
  {
    name: "run_audience_analysis",
    description: "Run an audience alignment analysis for a client using their Instagram handle. Returns audience score and content uniqueness score out of 10. Costs credits. Tell the user before calling this.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string" },
      },
      required: ["client_name"],
    },
  },
  {
    name: "get_instagram_top_posts",
    description: "Fetch a client's top-performing Instagram posts ranked by engagement. Use before building a content strategy to understand what's already working for them.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string" },
        limit: { type: "number", description: "Number of posts to return (default 6)" },
      },
      required: ["client_name"],
    },
  },
  {
    name: "deep_research",
    description: "Do live web research on a topic and return structured findings with sources. Use when the user asks you to 'research X' or when you need current statistics, trends, or competitor information. Costs credits.",
    input_schema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "What to research (e.g. 'chiropractic social media trends 2025')" },
        context: { type: "string", description: "Optional context to focus the research (e.g. 'for a chiropractor in Texas')" },
      },
      required: ["topic"],
    },
  },
  {
    name: "scrape_viral_channel",
    description: "Scrape viral videos from an Instagram or TikTok account and add them to the viral reference database. Use when a client finds a good reference creator and wants to track them.",
    input_schema: {
      type: "object",
      properties: {
        username: { type: "string", description: "The creator's username (without @)" },
        platform: { type: "string", description: "instagram (default) or tiktok" },
      },
      required: ["username"],
    },
  },
  {
    name: "list_vault_files",
    description: "List footage and media files uploaded to a client's vault. Use before building an editing queue item to know what footage exists.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string" },
      },
      required: ["client_name"],
    },
  },
];

export async function handleResearchTool(
  block: { id: string; name: string; input: Record<string, any> },
  ctx: ToolContext,
): Promise<ToolResult | null> {
  const { adminClient, userId } = ctx;

  if (block.name === "run_audience_analysis") {
    const { client_name } = block.input;
    const client = await resolveClient(ctx, client_name);
    if (!client) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };

    const { data: clientRow } = await adminClient.from("clients").select("onboarding_data").eq("id", client.id).maybeSingle();
    const instagram = (clientRow?.onboarding_data as any)?.instagram;
    if (!instagram) return { type: "tool_result", tool_use_id: block.id, content: `${client.name} has no Instagram handle set in their onboarding profile. Fill that in first.` };

    const res = await fetch(`${SUPABASE_URL}/functions/v1/analyze-audience-alignment`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ client_id: client.id, instagram_handle: instagram }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { type: "tool_result", tool_use_id: block.id, content: `Analysis failed: ${json.error ?? `HTTP ${res.status}`}` };

    const analysis = json.analysis ?? json;
    return {
      type: "tool_result",
      tool_use_id: block.id,
      content: `Audience analysis for ${client.name} (@${instagram}):\nAudience alignment: ${analysis.audience_score ?? "??"}/10 — ${analysis.audience_detail ?? ""}\nContent uniqueness: ${analysis.uniqueness_score ?? "??"}/10 — ${analysis.uniqueness_detail ?? ""}\nSummary: ${analysis.summary ?? "no summary"}`,
    };
  }

  if (block.name === "get_instagram_top_posts") {
    const { client_name, limit = 6 } = block.input;
    const client = await resolveClient(ctx, client_name);
    if (!client) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };

    const { data: clientRow } = await adminClient.from("clients").select("onboarding_data").eq("id", client.id).maybeSingle();
    const instagram = (clientRow?.onboarding_data as any)?.instagram;
    if (!instagram) return { type: "tool_result", tool_use_id: block.id, content: `${client.name} has no Instagram handle set. Add it in their onboarding profile first.` };

    const res = await fetch(`${SUPABASE_URL}/functions/v1/fetch-instagram-top-posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ username: instagram, limit }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { type: "tool_result", tool_use_id: block.id, content: `Failed to fetch posts: ${json.error ?? `HTTP ${res.status}`}` };

    const posts = Array.isArray(json.posts) ? json.posts : Array.isArray(json) ? json : [];
    if (posts.length === 0) return { type: "tool_result", tool_use_id: block.id, content: `No posts found for @${instagram}.` };

    const lines = posts.slice(0, limit).map((p: any, i: number) =>
      `${i + 1}. ${p.views_count ? p.views_count.toLocaleString() + " views" : p.likes_count ? p.likes_count.toLocaleString() + " likes" : "?"} — "${(p.caption ?? "").slice(0, 100)}"`
    );
    return { type: "tool_result", tool_use_id: block.id, content: `Top posts for @${instagram}:\n${lines.join("\n")}` };
  }

  if (block.name === "deep_research") {
    const { topic, context } = block.input;
    const query = context ? `${topic} — ${context}` : topic;

    const res = await fetch(`${SUPABASE_URL}/functions/v1/deep-research`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ query }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { type: "tool_result", tool_use_id: block.id, content: `Research failed: ${json.error ?? `HTTP ${res.status}`}` };

    const result = json.result ?? json.content ?? json.answer ?? JSON.stringify(json).slice(0, 800);
    return { type: "tool_result", tool_use_id: block.id, content: `Research on "${topic}":\n\n${result}` };
  }

  if (block.name === "scrape_viral_channel") {
    const { username, platform = "instagram" } = block.input;

    const res = await fetch(`${SUPABASE_URL}/functions/v1/scrape-channel`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ username: username.replace(/^@/, ""), platform }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { type: "tool_result", tool_use_id: block.id, content: `Scrape failed: ${json.error ?? `HTTP ${res.status}`}` };

    const count = json.videos_added ?? json.count ?? "unknown number of";
    return { type: "tool_result", tool_use_id: block.id, content: `Scraped @${username} on ${platform}. Added ${count} video(s) to the viral database. They're now available as reference frameworks.` };
  }

  if (block.name === "list_vault_files") {
    const { client_name } = block.input;
    const client = await resolveClient(ctx, client_name);
    if (!client) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };

    const { data: files } = await adminClient
      .from("canvas_media")
      .select("id, file_name, file_type, file_size, transcript_status, created_at")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (!files || files.length === 0) return { type: "tool_result", tool_use_id: block.id, content: `No files in ${client.name}'s vault.` };

    const lines = files.map((f: any) => {
      const size = f.file_size ? `${Math.round(f.file_size / 1024 / 1024)}MB` : "?";
      const transcribed = f.transcript_status === "done" ? " [transcribed]" : f.transcript_status === "processing" ? " [transcribing]" : "";
      return `${f.file_name ?? "Untitled"} (${f.file_type ?? "?"}, ${size})${transcribed}`;
    });
    return { type: "tool_result", tool_use_id: block.id, content: `${files.length} file(s) in ${client.name}'s vault:\n${lines.join("\n")}` };
  }

  return null;
}
