# AI Full Parity — Wave 4: Research + Analysis

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 5 tools wiring existing edge functions (deep-research, scrape-channel, analyze-audience-alignment, fetch-instagram-top-posts) into the companion and add vault file listing.

**Architecture:** One new tool file. All 5 tools are thin wrappers that invoke existing edge functions via `fetch()` with the service role key. No new DB logic. Waves 1–3 must be deployed before this wave.

**Tech Stack:** Deno edge functions, existing Supabase edge functions as sub-services

---

## File map

| Action | Path | Purpose |
|---|---|---|
| CREATE | `supabase/functions/companion-chat/tools/research.ts` | 5 research + analysis tools |
| MODIFY | `supabase/functions/companion-chat/index.ts` | Import + wire new module |

---

## Task 1: Research and analysis tools

**Files:**
- Create: `supabase/functions/companion-chat/tools/research.ts`

- [ ] **Step 1: Create research.ts**

```typescript
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
    const client = await resolveClient(adminClient, userId, client_name);
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
    const client = await resolveClient(adminClient, userId, client_name);
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
    const client = await resolveClient(adminClient, userId, client_name);
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
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/companion-chat/tools/research.ts
git commit -m "feat(ai): add 5 research tools — run_audience_analysis, get_instagram_top_posts, deep_research, scrape_viral_channel, list_vault_files"
```

---

## Task 2: Wire Wave 4 into index.ts

**Files:**
- Modify: `supabase/functions/companion-chat/index.ts`

- [ ] **Step 1: Add import**

```typescript
import { RESEARCH_TOOLS, handleResearchTool } from "./tools/research.ts";
```

- [ ] **Step 2: Extend TOOLS array**

```typescript
  // Wave 4 tools
  ...RESEARCH_TOOLS,
```

- [ ] **Step 3: Extend module handler chain**

```typescript
const moduleResult =
  await handleLeadTool(block, moduleCtx) ??
  await handleFinanceTool(block, moduleCtx) ??
  await handleScriptTool(block, moduleCtx) ??
  await handleEditingTool(block, moduleCtx) ??
  await handleIntelligenceTool(block, moduleCtx) ??
  await handleClientTool(block, moduleCtx) ??
  await handleResearchTool(block, moduleCtx);
if (moduleResult) toolResults.push(moduleResult);
```

- [ ] **Step 4: Final system prompt update — rule 19 final form**

Replace rule 19 entirely with the complete tool list:

```
19. TOOLS: navigate_to_page, open_client, fill_onboarding_fields, create_script, find_viral_videos, schedule_content, submit_to_editing_queue, get_editing_queue, get_content_calendar, create_canvas_note, read_canvas, list_all_clients, get_client_info, get_hooks, get_client_strategy, update_client_strategy, save_memory, delete_memory, list_memories, respond_to_user, add_video_to_canvas, add_research_note_to_canvas, add_idea_nodes_to_canvas, add_script_draft_to_canvas, save_script_from_canvas, get_leads, get_pipeline_summary, update_lead_status, add_lead_notes, create_lead, get_finances, log_transaction, get_revenue_vs_goal, update_script_status, mark_script_recorded, delete_script, update_editing_status, assign_editor, add_revision_notes, mark_post_published, reschedule_post, generate_caption, get_all_clients_status, get_weekly_priorities, get_contracts, send_contract, create_client, run_audience_analysis, get_instagram_top_posts, deep_research, scrape_viral_channel, list_vault_files. Use them. Don't describe what you'd do — do it.
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/companion-chat/index.ts
git commit -m "feat(ai): wire Wave 4 research tools + finalize full tool list in system prompt"
```

---

## Task 3: Deploy and verify Wave 4

- [ ] **Step 1: Deploy**

```bash
npx supabase functions deploy companion-chat
```

- [ ] **Step 2: Test deep research**

Open the /ai page or Drawer and type: `research chiropractic social media trends for a client who treats sports injuries`
Expected: AI calls `deep_research` and returns structured findings with sources. May take 10–30 seconds.

- [ ] **Step 3: Test viral channel scrape**

Type: `scrape @victorfitness on instagram and add their videos to the database`
Expected: AI calls `scrape_viral_channel` and confirms how many videos were added.

- [ ] **Step 4: Test audience analysis**

On a client that has an Instagram handle set in their onboarding, type: `run an audience analysis for [client name]`
Expected: AI calls `run_audience_analysis` and returns scores out of 10.

- [ ] **Step 5: Test vault listing**

Type: `what footage does [client name] have in their vault?`
Expected: AI calls `list_vault_files` and returns file names, types, and sizes.

- [ ] **Step 6: Final end-to-end verify — "do anything" check**

Run through this sequence in the Drawer to confirm the full system works:

1. `"What should I work on today?"` → calls `get_weekly_priorities`
2. `"Show me the pipeline for [client name]"` → calls `get_pipeline_summary`
3. `"Log that [client] paid $3,000 for SMMA"` → calls `log_transaction`, Finances page refreshes
4. `"Create a new client named [name]"` → calls `create_client`, navigates to client page
5. `"Read the canvas for [client]"` → calls `read_canvas`, returns notes
6. `"What's on the content calendar for [client] this week?"` → calls `get_content_calendar`
7. `"New chat"` button → new thread created (different ID than previous)
