# AI Full Parity — Wave 3: Intelligence Layer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 7 tools for multi-client intelligence (stalled clients, weekly priorities), contracts (read + send), and client/memory management (create client, delete/list memories).

**Architecture:** Two new tool files under `tools/`. The `get_all_clients_status` and `get_weekly_priorities` tools do single batch queries instead of N per-client queries — they're the "what should I work on today?" backbone. Waves 1 and 2 must be deployed before this wave.

**Tech Stack:** Deno edge functions, Supabase service role client

---

## File map

| Action | Path | Purpose |
|---|---|---|
| CREATE | `supabase/functions/companion-chat/tools/intelligence.ts` | Multi-client status, weekly priorities, contracts |
| CREATE | `supabase/functions/companion-chat/tools/client.ts` | create_client, delete_memory, list_memories |
| MODIFY | `supabase/functions/companion-chat/index.ts` | Import + wire new modules |

---

## Task 1: Multi-client intelligence + contracts tools

**Files:**
- Create: `supabase/functions/companion-chat/tools/intelligence.ts`

- [ ] **Step 1: Create intelligence.ts**

```typescript
// supabase/functions/companion-chat/tools/intelligence.ts
import type { ToolContext, ToolDef, ToolResult } from "./types.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export const INTELLIGENCE_TOOLS: ToolDef[] = [
  {
    name: "get_all_clients_status",
    description: "Get a status snapshot for ALL clients at once: scripts, videos, and posts this month vs their targets. Returns them sorted by who is most behind. Use when the user asks 'which clients are stalled?', 'how are all my clients doing?', or 'what needs attention?'",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_weekly_priorities",
    description: "Get a ranked action list of what to work on right now across all clients: who has no scripts this month, which scripts are waiting to be recorded, what's in review, and what posts are due this week. The definitive answer to 'what should I do today?'",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_contracts",
    description: "View contracts. If client_name is provided, shows that client's contracts. Otherwise shows all contracts.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "Optional — if omitted, returns all contracts" },
      },
      required: [],
    },
  },
  {
    name: "send_contract",
    description: "Send a contract to a client via email. Call get_contracts first to find the contract_id. In ask/plan mode always confirm before sending.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string" },
        contract_id: { type: "string", description: "UUID of the contract (get from get_contracts first)" },
      },
      required: ["client_name", "contract_id"],
    },
  },
];

export async function handleIntelligenceTool(
  block: { id: string; name: string; input: Record<string, any> },
  ctx: ToolContext,
): Promise<ToolResult | null> {
  const { adminClient, userId, actions } = ctx;

  if (block.name === "get_all_clients_status") {
    const { data: clients } = await adminClient
      .from("clients")
      .select("id, name")
      .eq("user_id", userId)
      .order("name");
    if (!clients || clients.length === 0) return { type: "tool_result", tool_use_id: block.id, content: "No clients found." };

    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

    const rows = await Promise.all(clients.map(async (c: any) => {
      const [{ data: strat }, { count: scripts }, { count: videos }, { count: posts }, { data: lastScript }] = await Promise.all([
        adminClient.from("client_strategies").select("scripts_per_month, videos_edited_per_month, posts_per_month").eq("client_id", c.id).maybeSingle(),
        adminClient.from("scripts").select("id", { count: "exact", head: true }).eq("client_id", c.id).gte("created_at", monthStart),
        adminClient.from("video_edits").select("id", { count: "exact", head: true }).eq("client_id", c.id).eq("status", "Done").is("deleted_at", null).gte("created_at", monthStart),
        adminClient.from("video_edits").select("id", { count: "exact", head: true }).eq("client_id", c.id).gte("schedule_date", monthStart.slice(0, 10)).is("deleted_at", null),
        adminClient.from("scripts").select("created_at").eq("client_id", c.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      return {
        name: c.name,
        scriptsTarget: strat?.scripts_per_month ?? 0,
        scripts: scripts ?? 0,
        videosTarget: strat?.videos_edited_per_month ?? 0,
        videos: videos ?? 0,
        postsTarget: strat?.posts_per_month ?? 0,
        posts: posts ?? 0,
        lastScript: lastScript?.created_at?.slice(0, 10) ?? "never",
      };
    }));

    // Sort by most behind (fewest scripts as primary signal)
    rows.sort((a, b) => {
      const aGap = (a.scriptsTarget - a.scripts) + (a.videosTarget - a.videos);
      const bGap = (b.scriptsTarget - b.scripts) + (b.videosTarget - b.videos);
      return bGap - aGap;
    });

    const lines = rows.map(r => {
      const scriptPct = r.scriptsTarget > 0 ? Math.round((r.scripts / r.scriptsTarget) * 100) : null;
      const stalled = r.scripts === 0 && r.scriptsTarget > 0 ? " ⚠ NO SCRIPTS" : "";
      return `${r.name}: ${r.scripts}/${r.scriptsTarget} scripts · ${r.videos}/${r.videosTarget} videos · ${r.posts}/${r.postsTarget} posts${stalled} (last script: ${r.lastScript})`;
    });

    return { type: "tool_result", tool_use_id: block.id, content: `All clients — ${now.toLocaleString("en-US", { month: "long" })} ${now.getFullYear()}:\n${lines.join("\n")}` };
  }

  if (block.name === "get_weekly_priorities") {
    const { data: clients } = await adminClient.from("clients").select("id, name").eq("user_id", userId);
    if (!clients || clients.length === 0) return { type: "tool_result", tool_use_id: block.id, content: "No clients found." };

    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const weekEnd = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);

    const priorities: string[] = [];

    for (const c of clients) {
      const [{ count: scripts }, { count: scriptTarget }, { data: toRecord }, { data: inReview }, { data: dueSoon }] = await Promise.all([
        adminClient.from("scripts").select("id", { count: "exact", head: true }).eq("client_id", c.id).gte("created_at", monthStart),
        adminClient.from("client_strategies").select("scripts_per_month").eq("client_id", c.id).maybeSingle().then(r => ({ count: r.data?.scripts_per_month ?? 0 })),
        adminClient.from("scripts").select("idea_ganadora, title").eq("client_id", c.id).eq("status", "Approved").eq("grabado", false).limit(3),
        adminClient.from("video_edits").select("reel_title").eq("client_id", c.id).eq("status", "In review").is("deleted_at", null).limit(3),
        adminClient.from("video_edits").select("reel_title, schedule_date").eq("client_id", c.id).gte("schedule_date", now.toISOString().slice(0, 10)).lte("schedule_date", weekEnd).neq("post_status", "Published").is("deleted_at", null).limit(3),
      ]);

      if ((scripts ?? 0) === 0 && (scriptTarget as number) > 0) {
        priorities.push(`🔴 ${c.name} — no scripts this month (target: ${scriptTarget})`);
      }
      for (const s of toRecord ?? []) {
        priorities.push(`🟡 ${c.name} — "${s.idea_ganadora ?? s.title}" approved, not recorded yet`);
      }
      for (const r of inReview ?? []) {
        priorities.push(`🔵 ${c.name} — "${r.reel_title}" in review`);
      }
      for (const d of dueSoon ?? []) {
        priorities.push(`📅 ${c.name} — "${d.reel_title}" due ${d.schedule_date}`);
      }
    }

    if (priorities.length === 0) return { type: "tool_result", tool_use_id: block.id, content: "Everything looks on track — no urgent items." };
    return { type: "tool_result", tool_use_id: block.id, content: `Weekly priorities:\n${priorities.join("\n")}` };
  }

  if (block.name === "get_contracts") {
    const { client_name } = block.input;
    let query = adminClient.from("contracts").select("id, title, status, created_at, signed_at, client_id");

    if (client_name) {
      const { data: clientRow } = await adminClient
        .from("clients")
        .select("id, name")
        .eq("user_id", userId)
        .ilike("name", `%${client_name}%`)
        .limit(1)
        .maybeSingle();
      if (!clientRow) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };
      query = query.eq("client_id", clientRow.id);
    }

    const { data: contracts } = await query.order("created_at", { ascending: false }).limit(20);
    if (!contracts || contracts.length === 0) return { type: "tool_result", tool_use_id: block.id, content: "No contracts found." };

    const lines = contracts.map((c: any) =>
      `[${c.id}] ${c.title ?? "Untitled"} — ${c.status ?? "draft"}${c.signed_at ? ` (signed ${c.signed_at.slice(0, 10)})` : ""}  created: ${c.created_at?.slice(0, 10)}`
    );
    return { type: "tool_result", tool_use_id: block.id, content: `${contracts.length} contract(s):\n${lines.join("\n")}` };
  }

  if (block.name === "send_contract") {
    const { client_name, contract_id } = block.input;
    const { data: clientRow } = await adminClient
      .from("clients")
      .select("id, name")
      .eq("user_id", userId)
      .ilike("name", `%${client_name}%`)
      .limit(1)
      .maybeSingle();
    if (!clientRow) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };

    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-contract`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ contract_id }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { type: "tool_result", tool_use_id: block.id, content: `Failed to send contract: ${json.error ?? `HTTP ${res.status}`}` };

    actions.push({ type: "refresh_data", scope: "contracts" });
    return { type: "tool_result", tool_use_id: block.id, content: `Contract sent to ${clientRow.name}.` };
  }

  return null;
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/companion-chat/tools/intelligence.ts
git commit -m "feat(ai): add multi-client intelligence + contracts tools"
```

---

## Task 2: Client and memory management tools

**Files:**
- Create: `supabase/functions/companion-chat/tools/client.ts`

- [ ] **Step 1: Create client.ts**

```typescript
// supabase/functions/companion-chat/tools/client.ts
import type { ToolContext, ToolDef, ToolResult } from "./types.ts";

export const CLIENT_TOOLS: ToolDef[] = [
  {
    name: "create_client",
    description: "Create a new client in the system. After creating, navigates directly to their page. Use when the user says 'add a new client' or 'create a client named X'.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Client's full name or business name" },
        email: { type: "string", description: "Contact email (optional)" },
        industry: { type: "string", description: "Their industry/niche (optional)" },
        package: { type: "string", description: "Service package (optional)" },
      },
      required: ["name"],
    },
  },
  {
    name: "delete_memory",
    description: "Remove a stored memory key for the current client. Use when the user says 'forget that X' or 'that's no longer true'.",
    input_schema: {
      type: "object",
      properties: {
        key: { type: "string", description: "The memory key to delete (e.g. 'main_story', 'content_pillars')" },
      },
      required: ["key"],
    },
  },
  {
    name: "list_memories",
    description: "Show all stored memories for the current client. Use when the user asks 'what do you know about this client?' or 'what have you saved?'",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

export async function handleClientTool(
  block: { id: string; name: string; input: Record<string, any> },
  ctx: ToolContext,
): Promise<ToolResult | null> {
  const { adminClient, userId, client, actions } = ctx;

  if (block.name === "create_client") {
    const { name, email, industry, package: pkg } = block.input;
    const onboarding_data: Record<string, string> = {};
    if (industry) onboarding_data.industry = industry;
    if (pkg) onboarding_data.package = pkg;

    const { data: newClient, error } = await adminClient
      .from("clients")
      .insert({ user_id: userId, name, email: email ?? null, onboarding_data })
      .select("id, name")
      .single();

    if (error || !newClient) return { type: "tool_result", tool_use_id: block.id, content: `Failed to create client: ${error?.message ?? "unknown"}` };

    actions.push({ type: "open_client", client_id: newClient.id });
    return { type: "tool_result", tool_use_id: block.id, content: `Created client "${newClient.name}". Navigating to their page now.` };
  }

  if (block.name === "delete_memory") {
    const { key } = block.input;
    const { data: state } = await adminClient
      .from("companion_state")
      .select("workflow_context")
      .eq("client_id", client.id)
      .maybeSingle();

    const memories = { ...(state?.workflow_context ?? {}) };
    if (!(key in memories)) return { type: "tool_result", tool_use_id: block.id, content: `No memory found with key "${key}".` };

    delete memories[key];
    await adminClient.from("companion_state").upsert({ client_id: client.id, workflow_context: memories }, { onConflict: "client_id" });
    return { type: "tool_result", tool_use_id: block.id, content: `Deleted memory "${key}".` };
  }

  if (block.name === "list_memories") {
    const { data: state } = await adminClient
      .from("companion_state")
      .select("workflow_context")
      .eq("client_id", client.id)
      .maybeSingle();

    const memories = state?.workflow_context ?? {};
    const keys = Object.keys(memories);
    if (keys.length === 0) return { type: "tool_result", tool_use_id: block.id, content: "No memories saved for this client yet." };

    const lines = keys.map(k => `${k}: ${String(memories[k]).slice(0, 200)}`);
    return { type: "tool_result", tool_use_id: block.id, content: `${keys.length} saved memories:\n${lines.join("\n")}` };
  }

  return null;
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/companion-chat/tools/client.ts
git commit -m "feat(ai): add create_client, delete_memory, list_memories tools"
```

---

## Task 3: Wire Wave 3 tools into index.ts

**Files:**
- Modify: `supabase/functions/companion-chat/index.ts`

- [ ] **Step 1: Add imports**

```typescript
import { INTELLIGENCE_TOOLS, handleIntelligenceTool } from "./tools/intelligence.ts";
import { CLIENT_TOOLS, handleClientTool } from "./tools/client.ts";
```

- [ ] **Step 2: Extend TOOLS array**

After the existing Wave 2 spread lines, add:
```typescript
  // Wave 3 tools
  ...INTELLIGENCE_TOOLS,
  ...CLIENT_TOOLS,
```

- [ ] **Step 3: Add to module handler chain**

Find the Wave 2 module handler block and extend it:
```typescript
const moduleResult =
  await handleLeadTool(block, moduleCtx) ??
  await handleFinanceTool(block, moduleCtx) ??
  await handleScriptTool(block, moduleCtx) ??
  await handleEditingTool(block, moduleCtx) ??
  await handleIntelligenceTool(block, moduleCtx) ??
  await handleClientTool(block, moduleCtx);
if (moduleResult) toolResults.push(moduleResult);
```

- [ ] **Step 4: Update system prompt tool list**

Append to rule 19:
```
get_all_clients_status, get_weekly_priorities, get_contracts, send_contract, create_client, delete_memory, list_memories
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/companion-chat/index.ts
git commit -m "feat(ai): wire Wave 3 intelligence + client/memory tools into companion-chat"
```

---

## Task 4: Deploy and verify Wave 3

- [ ] **Step 1: Deploy**

```bash
npx supabase functions deploy companion-chat
```

- [ ] **Step 2: Test multi-client status**

Open the /ai page and type: `which of my clients are stalled this month?`
Expected: AI calls `get_all_clients_status`, returns a list sorted by who is furthest behind targets.

- [ ] **Step 3: Test weekly priorities**

Type: `what should I work on today?`
Expected: AI calls `get_weekly_priorities`, returns a ranked action list with red/yellow/blue/calendar markers.

- [ ] **Step 4: Test contracts**

Type: `show me all contracts`
Expected: AI calls `get_contracts`, returns list with IDs, titles, and statuses.

- [ ] **Step 5: Test create_client**

Type: `create a new client named Maria Garcia, she's a dentist`
Expected: AI calls `create_client`, app navigates to `/clients/[new-uuid]`.

- [ ] **Step 6: Test memory management**

Type: `what do you know about [current client]?`
Expected: AI calls `list_memories`, returns all saved key-value pairs.

Type: `forget the main_story memory`
Expected: AI calls `delete_memory`, confirms deletion.
