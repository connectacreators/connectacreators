# LLM-Driven Conversational Script Builder — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the FSM-based process-build-step architecture with an LLM-as-conductor approach where companion-chat injects build context into the system prompt and 8 build tools drive the conversational script-building workflow.

**Architecture:** companion-chat loads the active build session at the start of each request and injects a context block into the system prompt. The LLM calls 8 build tools in sequence, each of which inserts a live progress message into the chat thread (visible via Realtime) before doing its work. The FSM, process-build-step, and build-fsm modules are deleted.

**Tech Stack:** Deno edge functions (companion-chat), Supabase Postgres + Realtime, React (BuildBanner, AssistantChat), TypeScript

**Spec:** `docs/superpowers/specs/2026-05-04-llm-driven-script-builder-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/20260504_simplify_build_sessions.sql` | Create | Add `phase` column, drop FSM columns, update status CHECK |
| `supabase/functions/_shared/build-session/types.ts` | Modify | Remove FSM fields, add `phase` |
| `supabase/functions/_shared/build-session/service.ts` | Modify | Remove FSM fields from mapper/patch |
| `supabase/functions/companion-chat/build-tool-handlers.ts` | Create | All 8 build tool handlers + logBuildProgress helper |
| `supabase/functions/companion-chat/index.ts` | Modify | Import + wire build tools, inject build context, simplify trigger detection |
| `supabase/functions/process-build-step/` | Delete | Entire folder |
| `supabase/functions/_shared/build-fsm/` | Delete | Entire folder |
| `src/hooks/useActiveBuildSessions.ts` | Modify | Replace `current_state` with `phase` |
| `src/components/companion/BuildBanner.tsx` | Modify | Use `phase` directly, remove STATE_LABEL map |
| `src/components/canvas/CanvasAIPanel.shared.tsx` | Modify | Add `is_progress` field to AssistantMessage |
| `src/components/assistant/AssistantChat.tsx` | Modify | Render progress messages with muted italic style |
| `src/components/CompanionDrawer.tsx` | Modify | Pass `is_progress` through message conversion |
| `src/pages/CommandCenter.tsx` | Modify | Pass `is_progress` through message conversion |

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/20260504_simplify_build_sessions.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/20260504_simplify_build_sessions.sql
-- Replace FSM-specific columns with simpler checkpoint model.
-- Phase 1+2 FSM is retired; LLM-as-conductor takes over.

-- Add the phase column (human-readable label for BuildBanner)
ALTER TABLE companion_build_sessions
  ADD COLUMN IF NOT EXISTS phase text NOT NULL DEFAULT '';

-- Remove FSM-only columns
ALTER TABLE companion_build_sessions
  DROP COLUMN IF EXISTS current_state,
  DROP COLUMN IF EXISTS error_message,
  DROP COLUMN IF EXISTS token_usage,
  DROP COLUMN IF EXISTS last_activity_at,
  DROP COLUMN IF EXISTS user_input;

-- Update status CHECK to remove FSM-specific values
ALTER TABLE companion_build_sessions
  DROP CONSTRAINT IF EXISTS companion_build_sessions_status_check;
ALTER TABLE companion_build_sessions
  ADD CONSTRAINT companion_build_sessions_status_check
  CHECK (status IN ('running', 'paused', 'completed', 'cancelled'));

-- Cancel any active sessions (clean slate for the new system)
UPDATE companion_build_sessions
  SET status = 'cancelled'
  WHERE status NOT IN ('completed', 'cancelled');

-- Drop old index that referenced awaiting_user
DROP INDEX IF EXISTS idx_build_sessions_user_active;
CREATE INDEX IF NOT EXISTS idx_build_sessions_user_active
  ON companion_build_sessions(user_id, status)
  WHERE status IN ('running', 'paused');
```

- [ ] **Step 2: Apply via Supabase MCP**

Use `mcp__plugin_supabase_supabase__apply_migration` with:
- `name`: `simplify_build_sessions`
- `query`: the SQL above

Expected: `{ "success": true }`

- [ ] **Step 3: Verify the schema**

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'companion_build_sessions'
ORDER BY ordinal_position;
```

Expected: `phase` column present, `current_state` / `error_message` / `token_usage` / `last_activity_at` / `user_input` absent.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260504_simplify_build_sessions.sql
git commit -m "feat(builder): simplify companion_build_sessions — retire FSM columns, add phase"
```

---

## Task 2: Update Build Session Types and Service

**Files:**
- Modify: `supabase/functions/_shared/build-session/types.ts`
- Modify: `supabase/functions/_shared/build-session/service.ts`

- [ ] **Step 1: Rewrite `types.ts`**

Replace the entire file with:

```typescript
// supabase/functions/_shared/build-session/types.ts

export type BuildStatus = "running" | "paused" | "completed" | "cancelled";

export interface BuildIdea {
  title: string;
  keywords?: string[];
  description?: string;
}

export interface BuildSession {
  id: string;
  userId: string;
  clientId: string;
  threadId: string;
  canvasStateId: string | null;
  status: BuildStatus;
  phase: string;
  ideas: BuildIdea[];
  currentIdeaIndex: number;
  selectedIdeas: BuildIdea[];
  currentFrameworkVideoId: string | null;
  currentScriptDraft: string | null;
  currentScriptId: string | null;
  cachedCanvasContext: string | null;
  cachedCanvasContextAt: string | null;
  autoPilot: boolean;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Update `rowToBuildSession` in `service.ts`**

Replace the `rowToBuildSession` function:

```typescript
export function rowToBuildSession(row: Record<string, unknown>): BuildSession {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    clientId: row.client_id as string,
    threadId: row.thread_id as string,
    canvasStateId: (row.canvas_state_id as string | null) ?? null,
    status: row.status as BuildStatus,
    phase: (row.phase as string) ?? "",
    ideas: (row.ideas as BuildSession["ideas"]) ?? [],
    currentIdeaIndex: (row.current_idea_index as number) ?? 0,
    selectedIdeas: (row.selected_ideas as BuildSession["selectedIdeas"]) ?? [],
    currentFrameworkVideoId: (row.current_framework_video_id as string | null) ?? null,
    currentScriptDraft: (row.current_script_draft as string | null) ?? null,
    currentScriptId: (row.current_script_id as string | null) ?? null,
    cachedCanvasContext: (row.cached_canvas_context as string | null) ?? null,
    cachedCanvasContextAt: (row.cached_canvas_context_at as string | null) ?? null,
    autoPilot: (row.auto_pilot as boolean) ?? false,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
```

- [ ] **Step 3: Update `getActiveBuildSessionForThread` to remove `awaiting_user`**

Find the `getActiveBuildSessionForThread` function. Change:
```typescript
.in("status", ["running", "awaiting_user", "paused"])
```
to:
```typescript
.in("status", ["running", "paused"])
```

- [ ] **Step 4: Update `UpdateBuildSessionPatch` interface and `updateBuildSession`**

Replace the `UpdateBuildSessionPatch` interface and `updateBuildSession` function:

```typescript
export interface UpdateBuildSessionPatch {
  status?: BuildSession["status"];
  phase?: string;
  clientId?: string;
  canvasStateId?: string | null;
  autoPilot?: boolean;
  ideas?: BuildSession["ideas"];
  currentIdeaIndex?: number;
  selectedIdeas?: BuildSession["selectedIdeas"];
  currentFrameworkVideoId?: string | null;
  currentScriptDraft?: string | null;
  currentScriptId?: string | null;
  cachedCanvasContext?: string | null;
  cachedCanvasContextAt?: string | null;
}

export async function updateBuildSession(
  client: SupabaseClient,
  id: string,
  patch: UpdateBuildSessionPatch,
): Promise<BuildSession> {
  const dbPatch: Record<string, unknown> = {};
  if (patch.status !== undefined) dbPatch.status = patch.status;
  if (patch.phase !== undefined) dbPatch.phase = patch.phase;
  if (patch.clientId !== undefined) dbPatch.client_id = patch.clientId;
  if (patch.canvasStateId !== undefined) dbPatch.canvas_state_id = patch.canvasStateId;
  if (patch.autoPilot !== undefined) dbPatch.auto_pilot = patch.autoPilot;
  if (patch.ideas !== undefined) dbPatch.ideas = patch.ideas;
  if (patch.currentIdeaIndex !== undefined) dbPatch.current_idea_index = patch.currentIdeaIndex;
  if (patch.selectedIdeas !== undefined) dbPatch.selected_ideas = patch.selectedIdeas;
  if (patch.currentFrameworkVideoId !== undefined) dbPatch.current_framework_video_id = patch.currentFrameworkVideoId;
  if (patch.currentScriptDraft !== undefined) dbPatch.current_script_draft = patch.currentScriptDraft;
  if (patch.currentScriptId !== undefined) dbPatch.current_script_id = patch.currentScriptId;
  if (patch.cachedCanvasContext !== undefined) dbPatch.cached_canvas_context = patch.cachedCanvasContext;
  if (patch.cachedCanvasContextAt !== undefined) dbPatch.cached_canvas_context_at = patch.cachedCanvasContextAt;
  const { data, error } = await client
    .from("companion_build_sessions")
    .update(dbPatch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`updateBuildSession: ${error.message}`);
  return rowToBuildSession(data as Record<string, unknown>);
}
```

- [ ] **Step 5: Remove the import of `BuildStateName` from `types.ts`**

The old `types.ts` imported `BuildStateName` from `../build-fsm/states.ts`. That import is now gone. Verify `service.ts` no longer imports anything from `_shared/build-fsm/`.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/build-session/types.ts supabase/functions/_shared/build-session/service.ts
git commit -m "feat(builder): update BuildSession types — remove FSM fields, add phase"
```

---

## Task 3: Create build-tool-handlers.ts

**Files:**
- Create: `supabase/functions/companion-chat/build-tool-handlers.ts`

This file contains the `logBuildProgress` helper and all 8 build tool handlers. Each handler: (1) checks if the build is paused, (2) inserts a progress message to the thread, (3) does its work, (4) returns a tool result string.

- [ ] **Step 1: Create the file**

```typescript
// supabase/functions/companion-chat/build-tool-handlers.ts
// Handlers for the 8 LLM-callable build tools.
// Each handler:
//   1. Returns early if build is paused (sets the paused signal)
//   2. Inserts a live progress message via assistant_messages
//   3. Does its work
//   4. Returns a tool result string for Claude to read
//
// Pattern: all DB writes use the service role key (adminClient).
// Thread writes use direct supabase inserts, not assistantAppendMessage,
// to avoid double-counting message counts for progress messages.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import type { BuildSession } from "../_shared/build-session/types.ts";
import { updateBuildSession } from "../_shared/build-session/service.ts";

// ── Context passed to every handler ──────────────────────────────────────────

export interface BuildToolContext {
  adminClient: SupabaseClient;
  userId: string;
  client: { id: string; name: string | null };
  buildSession: BuildSession | null;
  threadId: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Insert a live progress message into the thread (appears via Realtime). */
export async function logBuildProgress(
  ctx: BuildToolContext,
  text: string,
  phase?: string,
): Promise<void> {
  const { adminClient, buildSession, threadId } = ctx;
  if (threadId) {
    await adminClient.from("assistant_messages").insert({
      thread_id: threadId,
      role: "assistant",
      content: { type: "text", text, is_progress: true },
    }).catch(() => {});
  }
  if (phase && buildSession) {
    await adminClient
      .from("companion_build_sessions")
      .update({ phase })
      .eq("id", buildSession.id)
      .catch(() => {});
  }
}

/** Check if the build has been paused (user clicked Pause). */
async function checkPaused(ctx: BuildToolContext): Promise<boolean> {
  if (!ctx.buildSession) return false;
  const { data } = await ctx.adminClient
    .from("companion_build_sessions")
    .select("status")
    .eq("id", ctx.buildSession.id)
    .maybeSingle();
  return data?.status === "paused";
}

async function callClaudeHaiku(prompt: string, system?: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      ...(system ? { system } : {}),
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Claude Haiku error: ${json.error?.message ?? res.statusText}`);
  return (json.content?.[0]?.text as string ?? "").trim();
}

async function callClaudeSonnet(prompt: string, system?: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      ...(system ? { system } : {}),
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Claude Sonnet error: ${json.error?.message ?? res.statusText}`);
  return (json.content?.[0]?.text as string ?? "").trim();
}

// ── Tool 1: resolve_client ────────────────────────────────────────────────────

export async function handleResolveClient(
  input: { client_name: string },
  ctx: BuildToolContext,
): Promise<string> {
  if (await checkPaused(ctx)) return "Build is paused. User will resume when ready.";

  const { data: targetClient } = await ctx.adminClient
    .from("clients")
    .select("id, name, onboarding_data")
    .eq("user_id", ctx.userId)
    .ilike("name", `%${input.client_name}%`)
    .limit(1)
    .maybeSingle();

  if (!targetClient) {
    return `No client found matching "${input.client_name}". Ask the user to clarify the name.`;
  }

  if (ctx.buildSession) {
    await ctx.adminClient
      .from("companion_build_sessions")
      .update({ client_id: targetClient.id, phase: `Working on ${targetClient.name}` })
      .eq("id", ctx.buildSession.id);
  }

  await logBuildProgress(ctx, `Got it — switching focus to **${targetClient.name}**.`);

  const od = (targetClient.onboarding_data as any) ?? {};
  return `Client resolved: ${targetClient.name} (id: ${targetClient.id}). Niche: ${od.niche ?? od.industry ?? "unknown"}. Audience: ${od.audience ?? "unknown"}.`;
}

// ── Tool 2: get_canvas_context ────────────────────────────────────────────────

export async function handleGetCanvasContext(
  input: { client_id: string },
  ctx: BuildToolContext,
): Promise<string> {
  if (await checkPaused(ctx)) return "Build is paused. User will resume when ready.";

  // Return cached context if available (avoid re-reading every turn)
  if (ctx.buildSession?.cachedCanvasContext !== null && ctx.buildSession?.cachedCanvasContext !== undefined) {
    return `Using cached canvas context (read earlier this session).\n\n${ctx.buildSession.cachedCanvasContext || "(canvas was empty)"}`;
  }

  // Find client's active canvases
  const { data: canvases } = await ctx.adminClient
    .from("canvas_states")
    .select("id, name, nodes")
    .eq("client_id", input.client_id)
    .eq("is_active", true)
    .order("updated_at", { ascending: false });

  if (!canvases || canvases.length === 0) {
    await logBuildProgress(ctx, "No active canvas found — I'll use your strategy notes instead.", "Reading context...");
    if (ctx.buildSession) {
      await updateBuildSession(ctx.adminClient, ctx.buildSession.id, {
        cachedCanvasContext: "",
        cachedCanvasContextAt: new Date().toISOString(),
      });
    }
    return "No active canvas found for this client. Proceeding with strategy + onboarding data only.";
  }

  // Use first canvas; if multiple exist, the LLM will have been told to ask first
  const canvas = canvases[0];

  if (ctx.buildSession) {
    await updateBuildSession(ctx.adminClient, ctx.buildSession.id, {
      canvasStateId: canvas.id,
      phase: "Reading canvas...",
    });
  }

  const nodes = (canvas.nodes as any[]) ?? [];
  const textNodes = nodes.filter((n) => n.type === "textNoteNode");
  const researchNodes = nodes.filter((n) => n.type === "researchNoteNode");
  const mediaNodes = nodes.filter((n) =>
    n.type === "mediaNode" &&
    (n.data?.fileType === "voice" || n.data?.fileType === "pdf") &&
    typeof n.data?.audioTranscription === "string"
  );

  const lines: string[] = [];

  if (mediaNodes.length > 0) {
    await logBuildProgress(ctx, `Reading ${mediaNodes.length} voice/PDF transcript${mediaNodes.length > 1 ? "s" : ""}...`);
    lines.push("# Voice/PDF Transcripts:");
    for (const n of mediaNodes.slice(0, 6)) {
      const text = ((n.data?.audioTranscription as string) ?? "").slice(0, 1000);
      if (text.trim()) lines.push(`- ${text}`);
    }
  }

  if (textNodes.length > 0) {
    await logBuildProgress(ctx, `Reading ${textNodes.length} text note${textNodes.length > 1 ? "s" : ""}...`);
    lines.push("# Text Notes:");
    for (const n of textNodes.slice(0, 12)) {
      const text = ((n.data?.noteText as string) ?? "").slice(0, 800);
      if (text.trim()) lines.push(`- ${text}`);
    }
  }

  if (researchNodes.length > 0) {
    await logBuildProgress(ctx, `Reading ${researchNodes.length} research note${researchNodes.length > 1 ? "s" : ""}...`);
    lines.push("# Research Notes:");
    for (const n of researchNodes.slice(0, 8)) {
      const text = ((n.data?.text as string) ?? "").slice(0, 800);
      if (text.trim()) lines.push(`- ${text}`);
    }
  }

  if (lines.length === 0) {
    await logBuildProgress(ctx, "Canvas is empty — I'll use your strategy notes instead.", "Context read");
  }

  const context = lines.join("\n");
  const summary = [
    mediaNodes.length > 0 ? `${mediaNodes.length} transcript(s)` : null,
    textNodes.length > 0 ? `${textNodes.length} text note(s)` : null,
    researchNodes.length > 0 ? `${researchNodes.length} research note(s)` : null,
  ].filter(Boolean).join(", ") || "nothing found";

  if (ctx.buildSession) {
    await updateBuildSession(ctx.adminClient, ctx.buildSession.id, {
      cachedCanvasContext: context,
      cachedCanvasContextAt: new Date().toISOString(),
      phase: "Context read",
    });
  }

  return `Canvas "${canvas.name ?? "untitled"}" read. Found: ${summary}.\n\nCANVAS CONTEXT:\n${context}`;
}

// ── Tool 3: generate_script_ideas ─────────────────────────────────────────────

export async function handleGenerateScriptIdeas(
  input: { client_id: string; topic_hint?: string },
  ctx: BuildToolContext,
): Promise<string> {
  if (await checkPaused(ctx)) return "Build is paused. User will resume when ready.";
  await logBuildProgress(ctx, "Coming up with ideas based on what I'm seeing...", "Generating ideas...");

  const [{ data: clientRow }, { data: strategy }] = await Promise.all([
    ctx.adminClient.from("clients").select("name, onboarding_data").eq("id", input.client_id).maybeSingle(),
    ctx.adminClient.from("client_strategies").select("*").eq("client_id", input.client_id).maybeSingle(),
  ]);

  const od = (clientRow?.onboarding_data as any) ?? {};
  const canvasCtx = ctx.buildSession?.cachedCanvasContext ?? "";

  const prompt = `Generate exactly 5 short-form video ideas for this creator.

CREATOR PROFILE:
- Name: ${clientRow?.name ?? "unknown"}
- Niche: ${od.niche ?? od.industry ?? "social media"}
- Audience: ${od.audience ?? "general audience"}
- Offer: ${od.uniqueOffer ?? od.offer ?? ""}

${strategy ? `STRATEGY:\n${JSON.stringify(strategy).slice(0, 1500)}\n` : ""}

${canvasCtx ? `CANVAS CONTEXT (use this heavily for grounded ideas):\n${canvasCtx.slice(0, 2500)}\n` : ""}

${input.topic_hint ? `USER'S SPECIFIC TOPIC REQUEST: ${input.topic_hint}\n` : ""}

RULES:
- Ideas must be specific to this creator's story, niche, and audience — not generic
- Use real details from their canvas/onboarding (numbers, results, names) when available
- Each idea must have 3-5 search keywords for finding viral reference videos

Output ONLY a JSON array, no commentary:
[{"title": "<one sentence concept>", "keywords": ["<keyword1>", "<keyword2>", "<keyword3>"]}]`;

  let raw = "";
  try {
    raw = await callClaudeHaiku(prompt);
    raw = raw.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/\s*```$/, "").trim();
    const ideas = JSON.parse(raw);
    if (!Array.isArray(ideas) || ideas.length === 0) throw new Error("empty");

    if (ctx.buildSession) {
      await updateBuildSession(ctx.adminClient, ctx.buildSession.id, {
        ideas,
        selectedIdeas: [],
        currentIdeaIndex: 0,
        phase: "Ideas ready",
      });
    }

    const list = ideas.map((idea: any, i: number) => `${i + 1}. ${idea.title}`).join("\n");
    return `Generated 5 ideas:\n${list}`;
  } catch (e) {
    return `Failed to generate ideas: ${(e as Error).message}. Raw response: ${raw.slice(0, 200)}`;
  }
}

// ── Tool 4: search_viral_frameworks ───────────────────────────────────────────

export async function handleSearchViralFrameworks(
  input: { idea_title: string; keywords: string[] },
  ctx: BuildToolContext,
): Promise<string> {
  if (await checkPaused(ctx)) return "Build is paused. User will resume when ready.";
  await logBuildProgress(ctx, `Searching viral frameworks for "${input.idea_title}"...`, "Searching frameworks...");

  const orFilter = input.keywords
    .filter((k) => k.length >= 3)
    .map((k) => `caption.ilike.%${k.replace(/[%,]/g, "")}%`)
    .join(",");

  let query = ctx.adminClient
    .from("viral_videos")
    .select("id, video_url, thumbnail_url, caption, channel_username, views_count, outlier_score")
    .order("outlier_score", { ascending: false, nullsFirst: false })
    .limit(25);
  if (orFilter) query = query.or(orFilter);
  const { data: candidates } = await query;

  const pool = ((candidates as any[]) ?? []).filter((v) => (v.caption ?? "").trim().length > 0);

  if (pool.length === 0) {
    return `No viral references found for "${input.idea_title}". Suggest the user paste 1-3 Instagram reel URLs and call add_url_to_viral_database for each.`;
  }

  // Ask Haiku to rank by relevance (not just outlier score)
  let top3 = pool.slice(0, 3);
  if (pool.length > 3) {
    const candidateBlock = pool
      .map((v, i) => `${i + 1}. id=${v.id} | @${v.channel_username ?? "unknown"} | ${v.outlier_score ?? "?"}x | caption: ${(v.caption ?? "").slice(0, 200)}`)
      .join("\n");

    const rankPrompt = `Pick the 3 MOST RELEVANT video IDs for a script about this idea:

IDEA: ${input.idea_title}

CANDIDATES:
${candidateBlock}

Output ONLY a JSON array of exactly 3 ids: ["uuid1","uuid2","uuid3"]. Nothing else.`;
    try {
      let ranked = await callClaudeHaiku(rankPrompt);
      ranked = ranked.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/\s*```$/, "").trim();
      const ids = JSON.parse(ranked) as string[];
      if (Array.isArray(ids) && ids.length > 0) {
        const map = new Map(pool.map((v) => [v.id, v]));
        const ordered = ids.map((id) => map.get(id)).filter(Boolean) as any[];
        // Top up if < 3
        const seen = new Set(ordered.map((v) => v.id));
        for (const v of pool) {
          if (ordered.length >= 3) break;
          if (!seen.has(v.id)) ordered.push(v);
        }
        top3 = ordered.slice(0, 3);
      }
    } catch {
      // ranking failed, keep pool.slice(0,3)
    }
  }

  // Default to top pick
  if (ctx.buildSession && top3[0]?.id) {
    await updateBuildSession(ctx.adminClient, ctx.buildSession.id, {
      currentFrameworkVideoId: top3[0].id,
      phase: "Frameworks found",
    });
  }

  const result = top3.map((v, i) => {
    const cap = (v.caption ?? "").slice(0, 150);
    return `${i + 1}. @${v.channel_username ?? "unknown"} — ${v.outlier_score ?? "?"}x\n   Caption: ${cap}\n   URL: ${v.video_url ?? ""}\n   Thumbnail: ${v.thumbnail_url ?? ""}`;
  }).join("\n\n");

  return `Top 3 viral references for "${input.idea_title}" (ranked by relevance):\n\n${result}\n\nDefault pick: #1 (${top3[0]?.channel_username ?? "unknown"})`;
}

// ── Tool 5: add_url_to_viral_database ─────────────────────────────────────────

export async function handleAddUrlToViralDatabase(
  input: { url: string; client_id: string },
  ctx: BuildToolContext,
): Promise<string> {
  if (await checkPaused(ctx)) return "Build is paused. User will resume when ready.";
  await logBuildProgress(ctx, `Adding ${input.url} to the Viral Database...`, "Adding to viral DB...");

  // Parse channel username from URL (best-effort)
  const usernameMatch = input.url.match(/instagram\.com\/(?:reel\/)?@?([^/?]+)/i) ??
    input.url.match(/tiktok\.com\/@([^/?]+)/i);
  const channelUsername = usernameMatch?.[1]?.replace(/^@/, "") ?? "unknown";

  const { data: inserted, error } = await ctx.adminClient
    .from("viral_videos")
    .insert({
      video_url: input.url,
      channel_username: channelUsername,
      caption: "(user-submitted — pending enrichment)",
      platform: input.url.includes("tiktok") ? "tiktok" : "instagram",
      views_count: 0,
      outlier_score: null,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return `Failed to add URL to viral database: ${error?.message ?? "unknown error"}`;
  }

  if (ctx.buildSession) {
    await updateBuildSession(ctx.adminClient, ctx.buildSession.id, {
      currentFrameworkVideoId: inserted.id,
      phase: "URL added to viral DB",
    });
  }

  return `Added ${input.url} to viral database. Video ID: ${inserted.id}. @${channelUsername}. Use this ID as the framework reference.`;
}

// ── Tool 6: add_video_to_canvas ───────────────────────────────────────────────

export async function handleAddVideoToCanvas(
  input: { client_id: string; video_id: string },
  ctx: BuildToolContext,
): Promise<string> {
  if (await checkPaused(ctx)) return "Build is paused. User will resume when ready.";

  const clientName = ctx.client.name ?? "client";
  await logBuildProgress(ctx, `Adding video to ${clientName}'s canvas...`, "Adding to canvas...");

  // Load video data
  const { data: video } = await ctx.adminClient
    .from("viral_videos")
    .select("id, video_url, caption, channel_username, thumbnail_url, views_count")
    .eq("id", input.video_id)
    .maybeSingle();

  if (!video) {
    return `Video ${input.video_id} not found in viral_videos.`;
  }

  // Get or find canvas
  const canvasId = ctx.buildSession?.canvasStateId ?? null;
  if (!canvasId) {
    return "No active canvas linked to this build session. Canvas must be open for the client.";
  }

  const { data: canvas } = await ctx.adminClient
    .from("canvas_states")
    .select("nodes")
    .eq("id", canvasId)
    .maybeSingle();

  const nodes = ((canvas?.nodes as any[]) ?? []).slice();
  const existingVideoCount = nodes.filter((n: any) => n.type === "videoNode").length;
  const yOffset = existingVideoCount * 600;

  const newNodeId = `videoNode_llmbuild_${Date.now()}`;
  nodes.push({
    id: newNodeId,
    type: "videoNode",
    position: { x: 200, y: 200 + yOffset },
    width: 240,
    data: {
      url: video.video_url,
      caption: video.caption,
      channel_username: video.channel_username,
      thumbnailUrl: video.thumbnail_url,
      views_count: video.views_count,
    },
  });

  await ctx.adminClient
    .from("canvas_states")
    .update({ nodes })
    .eq("id", canvasId);

  if (ctx.buildSession) {
    await updateBuildSession(ctx.adminClient, ctx.buildSession.id, {
      currentFrameworkVideoId: video.id,
      phase: "Video on canvas",
    });
  }

  return `VideoNode added to ${clientName}'s canvas. Video: @${video.channel_username ?? "unknown"} — ${(video.caption ?? "").slice(0, 100)}. The node will auto-transcribe when the user opens the canvas.`;
}

// ── Tool 7: draft_script ──────────────────────────────────────────────────────

export async function handleDraftScript(
  input: { client_id: string; idea_title: string; framework_caption: string },
  ctx: BuildToolContext,
): Promise<string> {
  if (await checkPaused(ctx)) return "Build is paused. User will resume when ready.";
  await logBuildProgress(ctx, "Drafting your script...", "Drafting...");

  const { data: clientRow } = await ctx.adminClient
    .from("clients")
    .select("name, onboarding_data")
    .eq("id", input.client_id)
    .maybeSingle();

  const od = (clientRow?.onboarding_data as any) ?? {};
  const canvasCtx = ctx.buildSession?.cachedCanvasContext ?? "";

  const prompt = `Write a short-form video script. Use the SAME structural beats as the reference framework but adapt every line to match the new idea and creator.

NEW IDEA: ${input.idea_title}

REFERENCE FRAMEWORK CAPTION (mirror its hook style, pacing, body structure, CTA pattern — not the words):
${input.framework_caption.slice(0, 800)}

CREATOR:
- Name: ${clientRow?.name ?? ""}
- Niche: ${od.niche ?? od.industry ?? ""}
- Voice: ${od.tone ?? "conversational, direct"}
- Audience: ${od.audience ?? ""}

${canvasCtx ? `CANVAS CONTEXT (use specific details from here — real numbers, real stories, real words from their notes):\n${canvasCtx.slice(0, 1500)}\n` : ""}

RULES:
- Keep the same structure as the framework (same number of body beats, same CTA pattern)
- Change the words and specific value to match the new idea
- Use the creator's real details where possible
- Output ONLY these three labeled sections, no other text:

HOOK: <1-2 punchy lines>
BODY: <3-6 short lines, one per line>
CTA: <1 line>`;

  let draft = "";
  try {
    draft = await callClaudeSonnet(prompt);
  } catch (e) {
    return `Drafting failed: ${(e as Error).message}`;
  }

  if (ctx.buildSession) {
    await updateBuildSession(ctx.adminClient, ctx.buildSession.id, {
      currentScriptDraft: draft,
      phase: "Draft ready",
    });
  }

  return `Script draft:\n\n${draft}`;
}

// ── Tool 8: save_script ───────────────────────────────────────────────────────

export async function handleSaveScript(
  input: { client_id: string; title: string; hook: string; body: string; cta: string },
  ctx: BuildToolContext,
): Promise<string> {
  if (await checkPaused(ctx)) return "Build is paused. User will resume when ready.";
  await logBuildProgress(ctx, `Saving script to ${ctx.client.name ?? "client"}'s library...`, "Saving...");

  const rawContent = [input.hook, input.body, input.cta].join("\n");

  const { data: script, error: scriptErr } = await ctx.adminClient
    .from("scripts")
    .insert({
      client_id: input.client_id,
      title: input.title.slice(0, 120),
      hook: input.hook,
      body: input.body,
      cta: input.cta,
      raw_content: rawContent,
      status: "Idea",
      category: "reach",
    })
    .select("id")
    .single();

  if (scriptErr || !script) {
    return `Save failed: ${scriptErr?.message ?? "unknown error"}`;
  }

  // Insert script lines
  const bodyLines = input.body.split("\n").map((l) => l.trim()).filter(Boolean);
  const lineRows = [
    { script_id: script.id, line_index: 0, content: input.hook, line_type: "hook" },
    ...bodyLines.map((line, i) => ({ script_id: script.id, line_index: i + 1, content: line, line_type: "body" })),
    { script_id: script.id, line_index: bodyLines.length + 1, content: input.cta, line_type: "cta" },
  ];
  await ctx.adminClient.from("script_lines").insert(lineRows);

  if (ctx.buildSession) {
    await updateBuildSession(ctx.adminClient, ctx.buildSession.id, {
      currentScriptId: script.id,
      phase: "Script saved",
    });
  }

  return `Script "${input.title}" saved to ${ctx.client.name ?? "client"}'s library (id: ${script.id}). The user can view it in their scripts section.`;
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

/** Try to handle a tool call as a build tool. Returns null if not a build tool. */
export async function handleBuildTool(
  toolName: string,
  toolInput: Record<string, any>,
  toolUseId: string,
  ctx: BuildToolContext,
): Promise<{ type: "tool_result"; tool_use_id: string; content: string } | null> {
  let content: string | null = null;

  switch (toolName) {
    case "resolve_client":
      content = await handleResolveClient(toolInput as { client_name: string }, ctx);
      break;
    case "get_canvas_context":
      content = await handleGetCanvasContext(toolInput as { client_id: string }, ctx);
      break;
    case "generate_script_ideas":
      content = await handleGenerateScriptIdeas(
        toolInput as { client_id: string; topic_hint?: string },
        ctx,
      );
      break;
    case "search_viral_frameworks":
      content = await handleSearchViralFrameworks(
        toolInput as { idea_title: string; keywords: string[] },
        ctx,
      );
      break;
    case "add_url_to_viral_database":
      content = await handleAddUrlToViralDatabase(
        toolInput as { url: string; client_id: string },
        ctx,
      );
      break;
    case "add_video_to_canvas":
      content = await handleAddVideoToCanvas(
        toolInput as { client_id: string; video_id: string },
        ctx,
      );
      break;
    case "draft_script":
      content = await handleDraftScript(
        toolInput as { client_id: string; idea_title: string; framework_caption: string },
        ctx,
      );
      break;
    case "save_script":
      content = await handleSaveScript(
        toolInput as { client_id: string; title: string; hook: string; body: string; cta: string },
        ctx,
      );
      break;
    default:
      return null;
  }

  return { type: "tool_result", tool_use_id: toolUseId, content };
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/companion-chat/build-tool-handlers.ts
git commit -m "feat(builder): add 8 build tool handlers with live progress messages"
```

---

## Task 4: Wire Build Tools into companion-chat

**Files:**
- Modify: `supabase/functions/companion-chat/index.ts`

This task has 5 sub-steps: import, add tool schemas, load build session, inject context, wire dispatcher.

- [ ] **Step 1: Add import at top of index.ts**

After the existing imports (around line 15), add:

```typescript
import {
  handleBuildTool,
  logBuildProgress,
  type BuildToolContext,
} from "./build-tool-handlers.ts";
```

Also add to the existing `_shared/build-session/service.ts` import (it already imports `createBuildSession`, `getActiveBuildSessionForThread`). Add `getBuildSession` if not already imported:

```typescript
import {
  createBuildSession,
  getBuildSession,
  getActiveBuildSessionForThread,
} from "../_shared/build-session/service.ts";
```

- [ ] **Step 2: Add 8 build tool schemas to the TOOLS array**

The TOOLS array ends with the `respond_to_user` tool. Find the closing `];` and insert these schemas before it:

```typescript
  {
    name: "resolve_client",
    description: "Switch the build session to work on a specific client. Call this when the user is on the /ai page (no client locked from URL) and names which client they want to build for. Do NOT call if a client is already known from context.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "Client name or partial name" },
      },
      required: ["client_name"],
    },
  },
  {
    name: "get_canvas_context",
    description: "Read the client's active Super Canvas — text notes, voice transcripts, research notes. Skips video framework nodes to save tokens. Results are cached in the build session so only call this once per build. Call before generate_script_ideas.",
    input_schema: {
      type: "object",
      properties: {
        client_id: { type: "string", description: "The client's UUID" },
      },
      required: ["client_id"],
    },
  },
  {
    name: "generate_script_ideas",
    description: "Generate 5 short-form video ideas based on the client's canvas context, strategy, and onboarding profile. Always call get_canvas_context first unless context is already cached.",
    input_schema: {
      type: "object",
      properties: {
        client_id: { type: "string", description: "The client's UUID" },
        topic_hint: { type: "string", description: "Optional: the user's specific topic or direction" },
      },
      required: ["client_id"],
    },
  },
  {
    name: "search_viral_frameworks",
    description: "Find the 3 most relevant viral video references for an idea. Uses Claude to rank by relevance, not just outlier score. Returns video URL, thumbnail URL, caption, and channel username for each result.",
    input_schema: {
      type: "object",
      properties: {
        idea_title: { type: "string", description: "The idea we're finding a framework for" },
        keywords: {
          type: "array",
          items: { type: "string" },
          description: "3-5 search keywords from the idea title",
        },
      },
      required: ["idea_title", "keywords"],
    },
  },
  {
    name: "add_url_to_viral_database",
    description: "Add a user-provided Instagram or TikTok reel URL to the viral_videos database. Call when the user pastes their own video links instead of using the AI suggestions.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The full video URL" },
        client_id: { type: "string", description: "The client's UUID" },
      },
      required: ["url", "client_id"],
    },
  },
  {
    name: "add_video_to_canvas",
    description: "Add the chosen viral reference video as a VideoNode on the client's active canvas. The node auto-transcribes when the user opens the canvas. Does NOT navigate away from the current page.",
    input_schema: {
      type: "object",
      properties: {
        client_id: { type: "string", description: "The client's UUID" },
        video_id: { type: "string", description: "The viral_videos row UUID to add" },
      },
      required: ["client_id", "video_id"],
    },
  },
  {
    name: "draft_script",
    description: "Write a full script draft (HOOK / BODY / CTA) that mirrors the viral framework's structure but adapts it to the chosen idea and the client's voice, niche, and canvas context.",
    input_schema: {
      type: "object",
      properties: {
        client_id: { type: "string", description: "The client's UUID" },
        idea_title: { type: "string", description: "The idea title" },
        framework_caption: { type: "string", description: "The viral video caption to use as structural reference" },
      },
      required: ["client_id", "idea_title", "framework_caption"],
    },
  },
  {
    name: "save_script",
    description: "Save the approved script to the client's scripts library. Only call after the user approves ('yes', 'generate', 'looks good', etc.). Does NOT navigate away.",
    input_schema: {
      type: "object",
      properties: {
        client_id: { type: "string", description: "The client's UUID" },
        title: { type: "string", description: "Script title (the idea title)" },
        hook: { type: "string", description: "The hook lines" },
        body: { type: "string", description: "Body lines, each on its own line" },
        cta: { type: "string", description: "The call to action" },
      },
      required: ["client_id", "title", "hook", "body", "cta"],
    },
  },
```

- [ ] **Step 3: Load active build session before the system prompt is built**

Find the section after client resolution and before the `Promise.all([companionStateRes, strategyRes, historyRes])` call (around line 643). Add a build session lookup here:

```typescript
// ── Load active build session (if any) ──────────────────────────────────────
const activeBuildSession = await getActiveBuildSessionForThread(adminClient, threadId ?? "")
  .catch(() => null);

// If user is paused and sends a message, auto-resume
if (activeBuildSession?.status === "paused") {
  await adminClient
    .from("companion_build_sessions")
    .update({ status: "running", phase: "Resuming..." })
    .eq("id", activeBuildSession.id);
  activeBuildSession.status = "running";
}
```

Where `threadId` is the thread resolved in `dualWriteCompanionTurn` — you'll need to look up or compute it before this point. Find where the sentinel thread is looked up (the `dualWriteCompanionTurn` function) and extract the thread ID lookup earlier, storing it in a variable `resolvedThreadId`.

**Specific change:** The `dualWriteCompanionTurn` call happens at the end of the function (line ~1891). You need to resolve the thread ID earlier. Add this block right after client is resolved (around line 482):

```typescript
// Pre-resolve the companion thread so we can use thread_id for build session lookup
// and for build tool progress messages.
const sentinel = "Active companion chat";
const { data: _existingThread } = await adminClient
  .from("assistant_threads")
  .select("id")
  .eq("user_id", user.id)
  .eq("client_id", client.id)
  .eq("origin", "drawer")
  .eq("title", sentinel)
  .maybeSingle();
const resolvedThreadId: string | null = _existingThread?.id ?? null;
```

Then the build session lookup uses `resolvedThreadId`:

```typescript
const activeBuildSession = await getActiveBuildSessionForThread(adminClient, resolvedThreadId ?? "")
  .catch(() => null);
```

- [ ] **Step 4: Add build context block to system prompt**

Find where the `systemPrompt` string is built (the large template literal around line 700). After the system prompt is constructed, add the build context block:

```typescript
// ── Build context injection ──────────────────────────────────────────────────
let buildContextBlock = "";
if (activeBuildSession) {
  const bs = activeBuildSession;
  const ideasStr = bs.ideas.length > 0
    ? bs.ideas.map((i, idx) => `${idx + 1}. ${i.title}`).join("\n")
    : "not yet";
  const selectedStr = bs.selectedIdeas.length > 0
    ? bs.selectedIdeas.map((i) => i.title).join(", ")
    : "not yet";
  const currentIdea = bs.selectedIdeas[bs.currentIdeaIndex]?.title ?? "none";

  buildContextBlock = `

━━━ ACTIVE SCRIPT BUILD ━━━
Client: ${client.name ?? "unknown"} (id: ${client.id})
Canvas: ${bs.canvasStateId ? "linked" : "none"}

What's been done:
- Canvas context: ${bs.cachedCanvasContext !== null ? "cached ✓" : "not read yet"}
- Ideas generated: ${ideasStr}
- Ideas selected: ${selectedStr}
- Current idea (${bs.currentIdeaIndex + 1}): ${currentIdea}
- Framework video: ${bs.currentFrameworkVideoId ? `id:${bs.currentFrameworkVideoId}` : "not chosen yet"}
- Script draft: ${bs.currentScriptDraft ? "exists ✓" : "not yet"}
- Script saved: ${bs.currentScriptId ? `yes (id:${bs.currentScriptId})` : "no"}

Status: ${bs.status}
Build session id: ${bs.id}
━━━━━━━━━━━━━━━━━━━━━━━━━

You are in SCRIPT BUILD MODE. Rules:
- Answer ANY question the user asks. After answering, return to the build.
- Use the build tools to advance each step. Don't skip steps.
- Tools insert their own progress messages. Do NOT duplicate with your own narration — just act on the tool result.
- NEVER call navigate_to_page during a build. Everything stays in this drawer.
- NEVER call build_script_full_pipeline. Use the 8 build tools instead.
- Present ideas and frameworks as numbered lists.
- Show script draft with HOOK / BODY / CTA labels. After showing, ask "Ready to generate?"
- After saving, say "Perfect! Now let's work on the next one." if more ideas remain.
- If user pastes URLs (instagram.com/reel/..., tiktok.com/...), call add_url_to_viral_database for each.
- Canvas context is cached — never call get_canvas_context twice in the same session unless user explicitly asks to re-read.
- If on the /ai page (no URL client context), call resolve_client first if client is not yet confirmed.`;
}

const finalSystemPrompt = systemPrompt + buildContextBlock;
```

Then replace the first Claude API call's `system: systemPrompt` with `system: finalSystemPrompt`.

Also replace the second Claude API call's `system: systemPrompt` with `system: finalSystemPrompt` (there's a second call at line ~1831).

- [ ] **Step 5: Wire build tool dispatcher into the tool-execution loop**

Find the `for (const block of toolUseBlocks)` loop (line ~833). At the TOP of the loop body (before the existing `if (block.name === "respond_to_user")` check), add:

```typescript
// ── Build tool dispatcher ────────────────────────────────────────────────────
const buildCtx: BuildToolContext = {
  adminClient,
  userId: user.id,
  client: { id: client.id, name: client.name },
  buildSession: activeBuildSession,
  threadId: resolvedThreadId,
};
const buildResult = await handleBuildTool(block.name, block.input, block.id, buildCtx);
if (buildResult) {
  toolResults.push(buildResult);
  continue; // handled — skip all the if-blocks below
}
```

- [ ] **Step 6: Simplify build trigger detection**

Find the old FSM routing block (lines ~485-650). Replace the entire block from `// ── Conversational script builder: awaiting_user reply routing (Phase 2) ──` through `// Thread creation failed — return an error instead of falling through` with:

```typescript
// ── Conversational script builder bootstrap ──────────────────────────────────
// If user says "build me a script" and no build session exists, create one.
// We then fall through to the normal LLM path — the LLM handles the conversation
// with build context injected into the system prompt.
const BUILD_TRIGGER = /\b(let'?s\s+)?(build|write|create|make)\s+(me\s+)?a?\s*script\b/i;
if (BUILD_TRIGGER.test(message) && !activeBuildSession) {
  const { data: activeCanvas } = await adminClient
    .from("canvas_states")
    .select("id")
    .eq("client_id", client.id)
    .eq("is_active", true)
    .maybeSingle();

  try {
    await createBuildSession(adminClient, {
      userId: user.id,
      clientId: client.id,
      threadId: resolvedThreadId ?? "",
      canvasStateId: activeCanvas?.id ?? null,
      autoPilot: false,
    });
  } catch (e) {
    console.warn("[companion-chat] createBuildSession failed:", (e as Error).message);
  }
  // Fall through to LLM — no early return. LLM picks up the new session via
  // the build context block injected into the system prompt.
}
```

Note: `activeBuildSession` was loaded before this block (Task 4, Step 3). Move the session load to happen BEFORE this trigger check. The order in the function should be:

1. Parse request body
2. Resolve user + client
3. Pre-resolve thread ID (`resolvedThreadId`)
4. Load active build session (`activeBuildSession`)
5. Build trigger check (create session if needed, fall through)
6. Load memory/strategy/history
7. Build system prompt + inject build context block
8. Call Claude
9. Execute tools
10. Get reply + dual-write

- [ ] **Step 7: Remove `build_script_full_pipeline` reference from system prompt Rule 18**

Find the system prompt section around line 746-774 that says `"When asked to build a script, write a script, create content, or anything similar, you MUST call ONE tool: build_script_full_pipeline"`.

Replace that entire Rule 18 section with:

```
18. SCRIPT CREATION WORKFLOW: When asked to build a script, use the 8 build tools in sequence (see ACTIVE SCRIPT BUILD context block if a build session is running). Do NOT call build_script_full_pipeline — that tool is deprecated. If no build session exists, the companion-chat will create one automatically when the user says "build me a script".
```

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/companion-chat/index.ts
git commit -m "feat(builder): wire 8 build tools into companion-chat — LLM-as-conductor"
```

---

## Task 5: Remove Old FSM Code

**Files:**
- Delete: `supabase/functions/process-build-step/` (entire folder)
- Delete: `supabase/functions/_shared/build-fsm/` (entire folder)
- Modify: `supabase/config.toml` (remove process-build-step registration)

- [ ] **Step 1: Delete process-build-step**

```bash
rm -rf supabase/functions/process-build-step/
```

- [ ] **Step 2: Delete build-fsm shared module**

```bash
rm -rf supabase/functions/_shared/build-fsm/
```

- [ ] **Step 3: Remove from config.toml**

Open `supabase/config.toml`. Find and delete this block:
```toml
[functions.process-build-step]
verify_jwt = false
```

- [ ] **Step 4: Remove import of build-fsm from build-session service**

Open `supabase/functions/_shared/build-session/service.ts`. Verify it no longer imports from `../build-fsm/states.ts`. (Task 2 already removed this — confirm it's gone.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(builder): retire process-build-step and build-fsm modules"
```

---

## Task 6: Frontend — Hook and BuildBanner

**Files:**
- Modify: `src/hooks/useActiveBuildSessions.ts`
- Modify: `src/components/companion/BuildBanner.tsx`

- [ ] **Step 1: Update `useActiveBuildSessions` — replace `current_state` with `phase`**

In `src/hooks/useActiveBuildSessions.ts`, update the `BuildStatus` type, `ActiveBuildSession` interface, and the active statuses:

```typescript
export type BuildStatus = "running" | "paused" | "completed" | "cancelled";

export interface ActiveBuildSession {
  id: string;
  client_id: string;
  thread_id: string;
  status: BuildStatus;
  phase: string;          // ← was current_state: string
  auto_pilot: boolean;
  updated_at: string;
}

const ACTIVE_STATUSES: BuildStatus[] = ["running", "paused"];
```

Update the `.select()` call in the `load` function:
```typescript
.select("id, client_id, thread_id, status, phase, auto_pilot, updated_at")
```

- [ ] **Step 2: Rewrite `BuildBanner.tsx`**

Replace the entire file:

```tsx
// src/components/companion/BuildBanner.tsx
import { Loader2, Pause, Play, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { ActiveBuildSession } from "@/hooks/useActiveBuildSessions";

interface Props {
  session: ActiveBuildSession;
}

export function BuildBanner({ session }: Props) {
  const label = session.phase || "Building script...";
  const isRunning = session.status === "running";
  const isPaused = session.status === "paused";

  async function handleCancel() {
    if (!confirm("Cancel this build? You can start over anytime.")) return;
    await supabase
      .from("companion_build_sessions")
      .update({ status: "cancelled" })
      .eq("id", session.id);
  }

  async function handlePause() {
    await supabase
      .from("companion_build_sessions")
      .update({ status: "paused", phase: "Paused" })
      .eq("id", session.id);
  }

  async function handleResume() {
    await supabase
      .from("companion_build_sessions")
      .update({ status: "running", phase: "Resuming..." })
      .eq("id", session.id);
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-primary/30 bg-primary/5">
      {isRunning ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin text-primary flex-shrink-0" />
      ) : (
        <span className="w-3.5 h-3.5 rounded-full bg-amber-400 flex-shrink-0" />
      )}
      <span className="text-xs flex-1 text-foreground truncate">{label}</span>
      {isRunning && (
        <button
          onClick={handlePause}
          className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-foreground"
          aria-label="Pause build"
          title="Pause"
        >
          <Pause className="w-3 h-3" />
        </button>
      )}
      {isPaused && (
        <button
          onClick={handleResume}
          className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-foreground"
          aria-label="Resume build"
          title="Resume"
        >
          <Play className="w-3 h-3" />
        </button>
      )}
      <button
        onClick={handleCancel}
        className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400"
        aria-label="Cancel build"
        title="Cancel"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep -E "useActiveBuildSessions|BuildBanner|error TS"
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useActiveBuildSessions.ts src/components/companion/BuildBanner.tsx
git commit -m "feat(builder): BuildBanner uses phase string, Resume button added"
```

---

## Task 7: Frontend — Progress Message Rendering

**Files:**
- Modify: `src/components/canvas/CanvasAIPanel.shared.tsx`
- Modify: `src/components/assistant/AssistantChat.tsx`
- Modify: `src/components/CompanionDrawer.tsx`
- Modify: `src/pages/CommandCenter.tsx`

- [ ] **Step 1: Add `is_progress` to `AssistantMessage` type**

In `src/components/canvas/CanvasAIPanel.shared.tsx`, find the `AssistantMessage` interface and add:

```typescript
export interface AssistantMessage {
  role: "user" | "assistant";
  content: string;
  type?: "text" | "image" | "script_preview";
  is_progress?: boolean;   // ← add this line
  image_b64?: string;
  _blobUrl?: string;
  revised_prompt?: string;
  credits_used?: number;
  script_data?: ScriptResult;
  _imagePreview?: string;
  is_research?: boolean;
  source_count?: number;
  research_topic?: string;
  actual_model?: string;
  downgraded?: boolean;
  meta?: DeckMeta;
}
```

- [ ] **Step 2: Render progress messages in `AssistantChat.tsx`**

Find the assistant message rendering section (around line 306, the `msg.role === "assistant"` block). Add a progress message variant BEFORE the existing `msg.type === "script_preview"` check:

```tsx
{msg.role === "assistant" ? (
  msg.is_progress ? (
    <div className="flex items-center gap-1.5 text-muted-foreground/60">
      <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
      <span className="text-[11px] italic">{msg.content}</span>
    </div>
  ) : msg.type === "script_preview" && msg.script_data ? (
    // ... existing script_preview block
```

Make sure `Loader2` is in the imports at the top of `AssistantChat.tsx` (it likely already is — check `import { ..., Loader2, ... } from "lucide-react"`).

- [ ] **Step 3: Pass `is_progress` through `CompanionDrawer.tsx` message conversion**

In `src/components/CompanionDrawer.tsx`, find the `chatMessages` useMemo that converts `MsgRow[]` to `AssistantMessage[]`. The conversion reads `m.content.text`. Update it to also pass `is_progress`:

```typescript
const chatMessages: AssistantMessage[] = useMemo(() => {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map<AssistantMessage>((m) => {
      const c: any = m.content;
      let content = "";
      if (typeof c === "string") {
        content = c;
      } else if (c && typeof c === "object" && typeof c.text === "string") {
        content = c.text;
      } else {
        content = JSON.stringify(c ?? "");
      }
      return {
        role: m.role as "user" | "assistant",
        content,
        is_progress: c?.is_progress === true,   // ← add this line
      };
    });
}, [messages]);
```

- [ ] **Step 4: Same change in `CommandCenter.tsx`**

Find the equivalent `chatMessages` useMemo in `src/pages/CommandCenter.tsx` (around line 289). Apply the same `is_progress` passthrough:

```typescript
return {
  role: m.role as "user" | "assistant",
  content,
  is_progress: (m.content as any)?.is_progress === true,   // ← add this
};
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep "error TS"
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/components/canvas/CanvasAIPanel.shared.tsx src/components/assistant/AssistantChat.tsx src/components/CompanionDrawer.tsx src/pages/CommandCenter.tsx
git commit -m "feat(builder): render progress messages as muted italic with spinner"
```

---

## Task 8: Deploy and Smoke Test

**Files:** None modified — deployment and verification only.

- [ ] **Step 1: Deploy companion-chat**

```bash
npx supabase functions deploy companion-chat --no-verify-jwt 2>&1 | tail -3
```

Expected: `Deployed Functions on project hxojqrilwhhrvloiwmfo: companion-chat`

- [ ] **Step 2: Confirm process-build-step is gone**

```bash
npx supabase functions list 2>&1 | grep process-build-step
```

Expected: no output (function no longer exists).

- [ ] **Step 3: Push frontend to trigger GitHub Actions**

```bash
git push origin main
```

Wait ~6-8 minutes for the GitHub Actions frontend deploy to complete.

- [ ] **Step 4: Smoke test — basic flow**

1. Open `connectacreators.com/ai` as Roberto
2. Type: `build me a script`
3. Expected within 2-3 seconds:
   - BuildBanner appears (phase: "Building script..." or similar)
   - LLM asks "Got it! Tell me what idea is on your mind, or say 'give me 5 ideas'"
4. Type: `give me 5 ideas`
5. Expected:
   - Progress messages appear: "Reading [N] text notes...", "Coming up with ideas..."
   - 5 ideas presented as numbered list
   - LLM asks if you want to find frameworks
6. Type: `where did you get this from?`
7. Expected: LLM ANSWERS the question, then returns to the build ("Want me to find frameworks?")
8. Type: `yes find them`
9. Expected:
   - Progress: "Searching viral frameworks for '[idea]'..."
   - 3 relevant results with URLs (not construction reels if the idea is about D2D sales)
   - LLM asks if user likes them or wants to paste own

- [ ] **Step 5: Smoke test — pause/resume**

1. During a build (LLM is presenting ideas), click the Pause button in BuildBanner
2. Expected: BuildBanner switches to amber dot + Resume button
3. Type a message
4. Expected: LLM acknowledges paused state, offers to resume
5. Click Resume
6. Expected: build continues from last checkpoint

- [ ] **Step 6: Smoke test — from client drawer**

1. Navigate to a client page (e.g. Roger Jimenez)
2. Open the companion drawer
3. Type: `let's build a script`
4. Expected: same flow but client is already known — LLM skips "which client?" and goes straight to idea question
5. Verify the drawer never navigates away

- [ ] **Step 7: Final commit if any fixes needed**

If any bugs are found during smoke testing, fix inline and commit before proceeding.

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| LLM handles all messages when build active | Task 4 Step 3-5 |
| Build context injected into system prompt | Task 4 Step 4 |
| 8 build tools with progress messages | Task 3 |
| Tools check paused status before running | Task 3 (checkPaused in each handler) |
| Pause button works | Task 6 Step 2 (handlePause) |
| Resume button works | Task 6 Step 2 (handleResume) |
| Progress messages appear live via Realtime | Task 3 (logBuildProgress inserts to assistant_messages) |
| Progress messages render differently (muted/italic) | Task 7 |
| FSM / process-build-step retired | Task 5 |
| DB schema simplified | Task 1 |
| BuildBanner uses phase string | Task 6 |
| No navigation during build | Task 4 Step 7 (system prompt rule) |
| /ai page asks "which client?" | Task 3 Tool 1 (resolve_client) + system prompt instruction |
| Canvas context cached per session | Task 3 Tool 2 (checkPaused early return + cache check) |
| Framework search ranked by relevance | Task 3 Tool 4 (Haiku ranking call) |
| User can paste own URLs | Task 3 Tool 5 (add_url_to_viral_database) |

**No placeholders found.** All code blocks are complete.

**Type consistency:** `BuildSession.phase` (string) matches `ActiveBuildSession.phase` (string) matches `build_session_id.phase` (text column). `BuildToolContext.buildSession` is `BuildSession | null` consistently across all handlers.
