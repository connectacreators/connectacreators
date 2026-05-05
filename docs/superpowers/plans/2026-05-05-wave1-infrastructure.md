# AI Full Parity — Wave 1: Infrastructure

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the new-chat thread bug, add dynamic navigation, add `refresh_data` / `open_client` / `show_notification` frontend action types, and give the Drawer + /ai page the ability to read canvas content.

**Architecture:** All backend changes are in `companion-chat/index.ts` and a new `canvasReader.ts` helper. Frontend changes touch `CompanionDrawer.tsx`, `CommandCenter.tsx`, and six data pages that need to react when the AI writes to their data. A shared `tools/types.ts` is created here so Waves 2–4 can import it.

**Tech Stack:** Deno edge functions (Supabase), React, TypeScript, Supabase JS client

---

## File map

| Action | Path | Purpose |
|---|---|---|
| CREATE | `supabase/functions/companion-chat/canvasReader.ts` | Shared canvas-read helper (extracted from build-tool-handlers) |
| CREATE | `supabase/functions/companion-chat/tools/types.ts` | Shared ToolContext, ToolDef, resolveClient helper for Waves 2–4 |
| MODIFY | `supabase/functions/companion-chat/index.ts` | Thread fix, open_client tool, read_canvas tool, nav description update |
| MODIFY | `src/components/CompanionDrawer.tsx` | Pass thread_id, handle new action types |
| MODIFY | `src/pages/CommandCenter.tsx` | Pass thread_id, handle new action types |
| MODIFY | `src/pages/LeadTracker.tsx` | ai:data-changed listener |
| MODIFY | `src/pages/EditingQueue.tsx` | ai:data-changed listener |
| MODIFY | `src/pages/ContentCalendar.tsx` | ai:data-changed listener |
| MODIFY | `src/pages/Scripts.tsx` | ai:data-changed listener |
| MODIFY | `src/pages/Finances.tsx` | ai:data-changed listener |
| MODIFY | `src/pages/ContractsPage.tsx` | ai:data-changed listener |

---

## Task 1: Create shared types + canvas reader helper

**Files:**
- Create: `supabase/functions/companion-chat/tools/types.ts`
- Create: `supabase/functions/companion-chat/canvasReader.ts`

- [ ] **Step 1: Create the tools directory and types file**

```typescript
// supabase/functions/companion-chat/tools/types.ts
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export interface ToolContext {
  adminClient: SupabaseClient;
  userId: string;
  client: { id: string; name: string | null; onboarding_data?: any };
  /** Mutable array — handlers push action objects here */
  actions: Array<{ type: string; [key: string]: unknown }>;
}

export interface ToolDef {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export type ToolResult = {
  type: "tool_result";
  tool_use_id: string;
  content: string;
};

/**
 * Look up a client by name (case-insensitive partial match) scoped to a user.
 * Returns null and does NOT throw if not found.
 */
export async function resolveClient(
  adminClient: SupabaseClient,
  userId: string,
  clientName: string,
): Promise<{ id: string; name: string } | null> {
  const { data } = await adminClient
    .from("clients")
    .select("id, name")
    .eq("user_id", userId)
    .ilike("name", `%${clientName}%`)
    .limit(1)
    .maybeSingle();
  return data ?? null;
}
```

- [ ] **Step 2: Create canvasReader.ts**

```typescript
// supabase/functions/companion-chat/canvasReader.ts
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

/**
 * Read the active canvas for a client and return its content as a formatted string.
 * Extracted from build-tool-handlers.ts handleGetCanvasContext so both regular
 * companion-chat (Drawer/AI page) and build mode can use the same logic.
 */
export async function readCanvasContext(
  adminClient: SupabaseClient,
  clientId: string,
): Promise<string> {
  const { data: canvases } = await adminClient
    .from("canvas_states")
    .select("id, name, nodes")
    .eq("client_id", clientId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false });

  if (!canvases || canvases.length === 0) {
    return "No active canvas found for this client.";
  }

  const canvas = canvases[0];
  const nodes = (canvas.nodes as any[]) ?? [];

  const textNodes = nodes.filter((n: any) => n.type === "textNoteNode");
  const researchNodes = nodes.filter((n: any) => n.type === "researchNoteNode");
  const mediaNodes = nodes.filter(
    (n: any) =>
      n.type === "mediaNode" &&
      (n.data?.fileType === "voice" || n.data?.fileType === "pdf") &&
      typeof n.data?.audioTranscription === "string",
  );

  const lines: string[] = [];

  if (mediaNodes.length > 0) {
    lines.push("# Voice/PDF Transcripts:");
    for (const n of mediaNodes.slice(0, 6)) {
      const text = ((n.data?.audioTranscription as string) ?? "").slice(0, 1000);
      if (text.trim()) lines.push(`- ${text}`);
    }
  }

  if (textNodes.length > 0) {
    lines.push("# Text Notes:");
    for (const n of textNodes.slice(0, 12)) {
      const text = ((n.data?.noteText as string) ?? "").slice(0, 800);
      if (text.trim()) lines.push(`- ${text}`);
    }
  }

  if (researchNodes.length > 0) {
    lines.push("# Research Notes:");
    for (const n of researchNodes.slice(0, 8)) {
      const text = ((n.data?.text as string) ?? "").slice(0, 800);
      if (text.trim()) lines.push(`- ${text}`);
    }
  }

  if (lines.length === 0) {
    return `Canvas "${canvas.name ?? "untitled"}" is empty.`;
  }

  const summary = [
    mediaNodes.length > 0 ? `${mediaNodes.length} transcript(s)` : null,
    textNodes.length > 0 ? `${textNodes.length} text note(s)` : null,
    researchNodes.length > 0 ? `${researchNodes.length} research note(s)` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return `Canvas "${canvas.name ?? "untitled"}" — ${summary}.\n\n${lines.join("\n")}`;
}
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/companion-chat/tools/types.ts supabase/functions/companion-chat/canvasReader.ts
git commit -m "feat(ai): add shared ToolContext types and canvasReader helper"
```

---

## Task 2: Fix the new-chat thread bug in companion-chat/index.ts

**Files:**
- Modify: `supabase/functions/companion-chat/index.ts`

The bug: the edge function always finds and reuses the thread titled "Active companion chat" regardless of whether the user clicked "New Chat". Fix: accept `thread_id` from the frontend; create a fresh thread when null.

- [ ] **Step 1: Update the request body destructuring (line ~417)**

Find:
```typescript
const { message, companion_name, current_path, autonomy_mode } = await req.json() as {
  message: string;
  companion_name: string;
  current_path?: string;
  autonomy_mode?: "auto" | "ask" | "plan";
};
```

Replace with:
```typescript
const { message, companion_name, current_path, autonomy_mode, thread_id: incomingThreadId } = await req.json() as {
  message: string;
  companion_name: string;
  current_path?: string;
  autonomy_mode?: "auto" | "ask" | "plan";
  thread_id?: string | null;
};
```

- [ ] **Step 2: Replace the sentinel thread lookup (~lines 473–483)**

Find and delete this entire block:
```typescript
const sentinel = "Active companion chat";
const { data: _sentinelThread } = await adminClient
  .from("assistant_threads")
  .select("id")
  .eq("user_id", user.id)
  .eq("client_id", client.id)
  .eq("origin", "drawer")
  .eq("title", sentinel)
  .maybeSingle();
let resolvedThreadId: string | null = _sentinelThread?.id ?? null;
```

Replace with:
```typescript
// Use the incoming thread_id if the frontend provided one (continuing an existing chat).
// If null (user clicked "New Chat" or this is the very first message), create a fresh thread
// titled from the first 6 words of the message so the thread list shows meaningful names.
let resolvedThreadId: string | null = incomingThreadId ?? null;
if (!resolvedThreadId) {
  const words = message.trim().split(/\s+/).slice(0, 6).join(" ");
  const title = words.split(/\s+/).length > 3 ? words + "…" : "New chat";
  const { data: newThread } = await adminClient
    .from("assistant_threads")
    .insert({
      user_id: user.id,
      client_id: client.id,
      origin: "drawer",
      title,
    })
    .select("id")
    .single();
  resolvedThreadId = newThread?.id ?? null;
}
```

- [ ] **Step 3: Simplify dualWriteCompanionTurn (near top of file, ~lines 362–406)**

The function no longer needs to look up or create a thread — the thread is already resolved. Replace the entire function:

```typescript
/**
 * Append the user + assistant messages to the already-resolved assistant_thread.
 * Failures are logged but don't block the response.
 */
async function dualWriteCompanionTurn(
  supabase: any,
  params: {
    threadId: string | null;
    userMessageText: string;
    assistantReplyText: string;
  },
): Promise<string | null> {
  if (!params.threadId) return null;
  try {
    await assistantAppendMessage(supabase, params.threadId, {
      role: "user",
      content: { type: "text", text: params.userMessageText },
    });
    await assistantAppendMessage(supabase, params.threadId, {
      role: "assistant",
      content: { type: "text", text: params.assistantReplyText },
    });
    return params.threadId;
  } catch (err) {
    console.warn("dualWriteCompanionTurn failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
```

- [ ] **Step 4: Update the dualWriteCompanionTurn call at the bottom of serve() (~line 1347)**

Find:
```typescript
const threadId = await dualWriteCompanionTurn(adminClient, {
  userId: user.id,
  clientId: client.id,
  userMessageText: message,
  assistantReplyText: reply,
});
```

Replace with:
```typescript
const threadId = await dualWriteCompanionTurn(adminClient, {
  threadId: resolvedThreadId,
  userMessageText: message,
  assistantReplyText: reply,
});
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/companion-chat/index.ts
git commit -m "fix(ai): new-chat always creates fresh thread instead of reusing sentinel"
```

---

## Task 3: Add open_client tool + update navigate_to_page description

**Files:**
- Modify: `supabase/functions/companion-chat/index.ts`

- [ ] **Step 1: Update navigate_to_page description in TOOLS array (~line 20)**

Find the `navigate_to_page` tool's `path` property description:
```
"Page path. Options: /onboarding, /scripts, /vault, /viral-today, /editing-queue, /content-calendar, /subscription, /ai, /dashboard",
```

Replace with:
```
"Any valid app route. Static routes: /dashboard, /scripts, /vault, /viral-today, /editing-queue, /content-calendar, /subscription, /ai, /onboarding, /finances, /leads, /contracts. Dynamic routes: /clients/:clientId, /clients/:clientId/scripts, /clients/:clientId/scripts?view=canvas. Use open_client tool instead of navigate_to_page when navigating to a client by name.",
```

- [ ] **Step 2: Add open_client to the TOOLS array (after navigate_to_page)**

```typescript
{
  name: "open_client",
  description: "Navigate to a specific client's detail page. Use when you've just created a client, looked one up, or the user says 'go to [client name]'. Resolves the name to a UUID so the frontend can build the correct route.",
  input_schema: {
    type: "object",
    properties: {
      client_name: {
        type: "string",
        description: "The client's name to look up and navigate to",
      },
    },
    required: ["client_name"],
  },
},
```

- [ ] **Step 3: Add open_client handler in the tool-use loop (after the fill_onboarding_fields handler block, ~line 1264)**

```typescript
if (block.name === "open_client") {
  const { client_name } = block.input;
  const { data: targetClient } = await adminClient
    .from("clients")
    .select("id, name")
    .eq("user_id", user.id)
    .ilike("name", `%${client_name}%`)
    .limit(1)
    .maybeSingle();
  if (!targetClient) {
    toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `No client found matching "${client_name}"` });
  } else {
    actions.push({ type: "open_client", client_id: targetClient.id });
    toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Navigating to ${targetClient.name}'s page.` });
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/companion-chat/index.ts
git commit -m "feat(ai): add open_client tool and expand navigate_to_page to all routes"
```

---

## Task 4: Add read_canvas tool

**Files:**
- Modify: `supabase/functions/companion-chat/index.ts`

- [ ] **Step 1: Import canvasReader at top of index.ts (after the existing imports)**

```typescript
import { readCanvasContext } from "./canvasReader.ts";
```

- [ ] **Step 2: Add read_canvas to the TOOLS array (after create_canvas_note)**

```typescript
{
  name: "read_canvas",
  description: "Read everything on a client's active Super Canvas — text notes, research notes, and voice/PDF transcriptions. Call this before making content decisions to see what research and ideas already exist, or when the user asks 'what's on the canvas?'.",
  input_schema: {
    type: "object",
    properties: {
      client_name: {
        type: "string",
        description: "The client's name",
      },
    },
    required: ["client_name"],
  },
},
```

- [ ] **Step 3: Add read_canvas handler in the tool-use loop**

```typescript
if (block.name === "read_canvas") {
  const { client_name } = block.input;
  const { data: targetClient } = await adminClient
    .from("clients")
    .select("id, name")
    .eq("user_id", user.id)
    .ilike("name", `%${client_name}%`)
    .limit(1)
    .maybeSingle();
  if (!targetClient) {
    toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `No client found matching "${client_name}"` });
  } else {
    const context = await readCanvasContext(adminClient, targetClient.id);
    toolResults.push({ type: "tool_result", tool_use_id: block.id, content: context });
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/companion-chat/index.ts
git commit -m "feat(ai): add read_canvas tool — Drawer and /ai page can now read canvas content"
```

---

## Task 5: Add refresh_data action to the edge function

**Files:**
- Modify: `supabase/functions/companion-chat/index.ts`

Every write tool handler will push a `refresh_data` action. This task adds the pattern to the existing write tools so the frontend knows to reload after the AI writes.

- [ ] **Step 1: Add refresh_data actions to existing write tool handlers**

Find each existing write tool handler and add the appropriate action push **before** the `toolResults.push(...)` line:

**schedule_content handler** — add after the `actions.push({ type: "navigate"... })` line:
```typescript
actions.push({ type: "refresh_data", scope: "calendar" });
```

**submit_to_editing_queue handler** — add after the `actions.push({ type: "navigate"... })` line:
```typescript
actions.push({ type: "refresh_data", scope: "editing_queue" });
```

**save_script_from_canvas handler** — add after the `actions.push({ type: "navigate"... })` line:
```typescript
actions.push({ type: "refresh_data", scope: "scripts" });
```

**create_script handler** — add after the `actions.push({ type: "navigate"... })` line:
```typescript
actions.push({ type: "refresh_data", scope: "scripts" });
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/companion-chat/index.ts
git commit -m "feat(ai): add refresh_data actions to existing write tool handlers"
```

---

## Task 6: Handle new action types in CompanionDrawer

**Files:**
- Modify: `src/components/CompanionDrawer.tsx`

- [ ] **Step 1: Pass thread_id in handleSend**

In `handleSend`, find the `supabase.functions.invoke("companion-chat", ...)` call and add `thread_id` to the body:

```typescript
const { data } = await supabase.functions.invoke("companion-chat", {
  body: {
    message: text,
    companion_name: companionName,
    current_path: path,
    autonomy_mode: autonomyMode,
    thread_id: activeThreadId ?? null,
  },
  headers: { Authorization: `Bearer ${session.access_token}` },
});
```

- [ ] **Step 2: Handle open_client, refresh_data, and show_notification actions**

In `handleSend`, find the existing `if (action?.type === "navigate" ...)` block and add cases:

```typescript
if (Array.isArray(data?.actions)) {
  for (const action of data.actions) {
    if (action?.type === "navigate" && typeof action.path === "string") {
      navigate(action.path);
      setIsOpen(false);
    }
    if (action?.type === "fill_onboarding") {
      window.dispatchEvent(
        new CustomEvent("companion:fill-onboarding", {
          detail: action.fields,
        }),
      );
    }
    if (action?.type === "open_client" && typeof action.client_id === "string") {
      navigate(`/clients/${action.client_id}`);
      setIsOpen(false);
    }
    if (action?.type === "refresh_data") {
      window.dispatchEvent(
        new CustomEvent("ai:data-changed", {
          detail: { scope: action.scope ?? "all" },
        }),
      );
    }
    if (action?.type === "show_notification" && typeof action.message === "string") {
      window.dispatchEvent(
        new CustomEvent("ai:notification", {
          detail: { message: action.message },
        }),
      );
    }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/CompanionDrawer.tsx
git commit -m "feat(ai): pass thread_id and handle open_client/refresh_data/show_notification in Drawer"
```

---

## Task 7: Handle new action types in CommandCenter (/ai page)

**Files:**
- Modify: `src/pages/CommandCenter.tsx`

- [ ] **Step 1: Pass thread_id in handleSend**

Same change as Task 6 Step 1 — add `thread_id: activeThreadId ?? null` to the companion-chat invocation body in `CommandCenter.tsx`'s `handleSend`.

- [ ] **Step 2: Handle open_client, refresh_data, show_notification**

Find the existing `if (Array.isArray(data?.actions))` block and replace with the same full handler from Task 6 Step 2 (without `setIsOpen(false)` since there's no drawer to close):

```typescript
if (Array.isArray(data?.actions)) {
  for (const action of data.actions) {
    if (action?.type === "navigate" && typeof action.path === "string") {
      navigate(action.path);
    }
    if (action?.type === "fill_onboarding") {
      window.dispatchEvent(
        new CustomEvent("companion:fill-onboarding", {
          detail: action.fields,
        }),
      );
    }
    if (action?.type === "open_client" && typeof action.client_id === "string") {
      navigate(`/clients/${action.client_id}`);
    }
    if (action?.type === "refresh_data") {
      window.dispatchEvent(
        new CustomEvent("ai:data-changed", {
          detail: { scope: action.scope ?? "all" },
        }),
      );
    }
    if (action?.type === "show_notification" && typeof action.message === "string") {
      window.dispatchEvent(
        new CustomEvent("ai:notification", {
          detail: { message: action.message },
        }),
      );
    }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/CommandCenter.tsx
git commit -m "feat(ai): pass thread_id and handle new action types in CommandCenter"
```

---

## Task 8: Add ai:data-changed listeners to data pages

**Files:**
- Modify: `src/pages/LeadTracker.tsx`
- Modify: `src/pages/EditingQueue.tsx`
- Modify: `src/pages/ContentCalendar.tsx`
- Modify: `src/pages/Scripts.tsx`
- Modify: `src/pages/Finances.tsx`
- Modify: `src/pages/ContractsPage.tsx`

The pattern is identical for each page. Find the page's primary data-fetching function (typically named `fetchData`, `loadData`, `refetch`, or similar), then add this `useEffect` hook near the other effects:

```typescript
// Re-fetch when the AI writes to this page's data
useEffect(() => {
  const handler = (e: Event) => {
    const scope = (e as CustomEvent).detail?.scope as string;
    if (scope === "SCOPE_NAME" || scope === "all") {
      // call this page's primary refetch function
    }
  };
  window.addEventListener("ai:data-changed", handler);
  return () => window.removeEventListener("ai:data-changed", handler);
}, [/* same deps as the primary fetch useEffect */]);
```

- [ ] **Step 1: Add listener to LeadTracker.tsx**

Find the function that fetches leads (look for a `useEffect` that queries the `leads` table or calls `leadService.getLeadsByClient`). Call it `refetchLeads` if it doesn't have a stable reference already. Add:

```typescript
useEffect(() => {
  const handler = (e: Event) => {
    const scope = (e as CustomEvent).detail?.scope as string;
    if (scope === "leads" || scope === "all") refetchLeads();
  };
  window.addEventListener("ai:data-changed", handler);
  return () => window.removeEventListener("ai:data-changed", handler);
}, [refetchLeads]);
```

- [ ] **Step 2: Add listener to EditingQueue.tsx**

Find the function that fetches editing queue items (queries `video_edits`). Add:

```typescript
useEffect(() => {
  const handler = (e: Event) => {
    const scope = (e as CustomEvent).detail?.scope as string;
    if (scope === "editing_queue" || scope === "all") refetchQueue();
  };
  window.addEventListener("ai:data-changed", handler);
  return () => window.removeEventListener("ai:data-changed", handler);
}, [refetchQueue]);
```

- [ ] **Step 3: Add listener to ContentCalendar.tsx**

```typescript
useEffect(() => {
  const handler = (e: Event) => {
    const scope = (e as CustomEvent).detail?.scope as string;
    if (scope === "calendar" || scope === "all") refetchCalendar();
  };
  window.addEventListener("ai:data-changed", handler);
  return () => window.removeEventListener("ai:data-changed", handler);
}, [refetchCalendar]);
```

- [ ] **Step 4: Add listener to Scripts.tsx**

```typescript
useEffect(() => {
  const handler = (e: Event) => {
    const scope = (e as CustomEvent).detail?.scope as string;
    if (scope === "scripts" || scope === "all") refetchScripts();
  };
  window.addEventListener("ai:data-changed", handler);
  return () => window.removeEventListener("ai:data-changed", handler);
}, [refetchScripts]);
```

- [ ] **Step 5: Add listener to Finances.tsx**

```typescript
useEffect(() => {
  const handler = (e: Event) => {
    const scope = (e as CustomEvent).detail?.scope as string;
    if (scope === "finances" || scope === "all") refetchFinances();
  };
  window.addEventListener("ai:data-changed", handler);
  return () => window.removeEventListener("ai:data-changed", handler);
}, [refetchFinances]);
```

- [ ] **Step 6: Add listener to ContractsPage.tsx**

```typescript
useEffect(() => {
  const handler = (e: Event) => {
    const scope = (e as CustomEvent).detail?.scope as string;
    if (scope === "contracts" || scope === "all") refetchContracts();
  };
  window.addEventListener("ai:data-changed", handler);
  return () => window.removeEventListener("ai:data-changed", handler);
}, [refetchContracts]);
```

- [ ] **Step 7: Commit all data page changes**

```bash
git add src/pages/LeadTracker.tsx src/pages/EditingQueue.tsx src/pages/ContentCalendar.tsx src/pages/Scripts.tsx src/pages/Finances.tsx src/pages/ContractsPage.tsx
git commit -m "feat(ai): add ai:data-changed listeners so pages refresh when AI writes"
```

---

## Task 9: Update system prompt to list new tools

**Files:**
- Modify: `supabase/functions/companion-chat/index.ts`

- [ ] **Step 1: Update rule 19 in the system prompt (~line 640)**

Find:
```
19. TOOLS: You have navigate_to_page, fill_onboarding_fields, create_script, find_viral_videos, schedule_content, submit_to_editing_queue, get_editing_queue, get_content_calendar, create_canvas_note, list_all_clients, get_client_info, get_hooks, get_client_strategy, save_memory, respond_to_user. Use them. Don't describe what you'd do — do it.
```

Replace with:
```
19. TOOLS: navigate_to_page, open_client, fill_onboarding_fields, create_script, find_viral_videos, schedule_content, submit_to_editing_queue, get_editing_queue, get_content_calendar, create_canvas_note, read_canvas, list_all_clients, get_client_info, get_hooks, get_client_strategy, update_client_strategy, save_memory, respond_to_user, add_video_to_canvas, add_research_note_to_canvas, add_idea_nodes_to_canvas, add_script_draft_to_canvas, save_script_from_canvas. Use them. Don't describe what you'd do — do it.
```

(Wave 2–4 tools will be added to this list in their respective plans.)

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/companion-chat/index.ts
git commit -m "feat(ai): update system prompt tool list for Wave 1 new tools"
```

---

## Task 10: Deploy and verify

- [ ] **Step 1: Deploy the companion-chat edge function**

```bash
npx supabase functions deploy companion-chat
```

Expected output: `Deployed companion-chat`

- [ ] **Step 2: Verify new-chat thread bug is fixed**

1. Open the app and navigate to any client page
2. Open the Companion Drawer
3. Send any message — note the thread ID returned (visible in browser DevTools → Network → companion-chat response → `thread_id`)
4. Click "New Chat" (or the + button in the drawer)
5. Send another message
6. Verify the `thread_id` in the response is **different** from step 3
7. Verify the thread list in the drawer shows 2 separate threads with meaningful names

- [ ] **Step 3: Verify open_client works**

In the Drawer, type: `go to [a client name you have]`
Expected: AI navigates to `/clients/[uuid]` and closes the drawer.

- [ ] **Step 4: Verify read_canvas works**

On a client page with an active canvas that has text notes, open the Drawer and type: `what's on the canvas?`
Expected: AI describes the canvas content without needing to be in build mode.

- [ ] **Step 5: Verify refresh_data works**

1. Open EditingQueue in one browser tab
2. Open the Drawer in another tab (or the same tab with drawer open)
3. Ask the AI to submit something to the editing queue for a client
4. Without reloading the page, check if the editing queue updated
Expected: New item appears without page reload.
