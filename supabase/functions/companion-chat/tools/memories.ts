// supabase/functions/companion-chat/tools/memories.ts
//
// First-class memory subsystem on the existing assistant_memories table
// (single table, scope discriminator: 'user' or 'client'). Adds pin
// support, source telemetry, server-side LRU caps, and verification
// behavior when the user explicitly asks to remember/forget.

import type { ToolContext, ToolDef, ToolResult } from "./types.ts";

const MAX_VALUE_LENGTH = 250;
const MAX_MEMORIES_PER_SCOPE = 40;

export const MEMORY_TOOLS: ToolDef[] = [
  {
    name: "save_memory",
    description:
      "Persist a long-term fact you want to remember about THIS CLIENT or THE USER (agency owner). Use scope='client' (default) for things tied to one client (methodology, voice, recurring issues). Use scope='user' for the user's own preferences/defaults that apply across all their clients (autonomy default, niche preference, working hours). Pin=true makes the memory load-bearing — it'll never auto-evict when the cap (40) is hit. Set user_requested=true ONLY when the user explicitly said 'remember X' so we confirm the save in your reply; for background saves leave it false. Caller-friendly key like 'methodology' or 'voice_samples', not 'memory_42'. Value capped at 250 chars.",
    input_schema: {
      type: "object",
      properties: {
        key: { type: "string", description: "Snake_case identifier — overwrites if exists" },
        value: { type: "string", description: "What to remember (max 250 chars)" },
        scope: { type: "string", description: "'client' (default) or 'user'" },
        pinned: { type: "boolean", description: "Pin so it never evicts. Default false." },
        user_requested: { type: "boolean", description: "True if user explicitly asked to remember this. Default false." },
      },
      required: ["key", "value"],
    },
  },
  {
    name: "delete_memory",
    description: "Remove a memory by key. Use when the user says 'forget X' or you find a memory is stale/wrong. scope: 'client' (default) or 'user'.",
    input_schema: {
      type: "object",
      properties: {
        key: { type: "string" },
        scope: { type: "string", description: "'client' (default) or 'user'" },
        user_requested: { type: "boolean", description: "True if user explicitly asked to forget. Default false." },
      },
      required: ["key"],
    },
  },
  {
    name: "list_memories",
    description: "List everything you remember. Returns both client and user memories by default. Useful when the user asks 'what do you remember about X?' or for self-check before saving a duplicate.",
    input_schema: {
      type: "object",
      properties: {
        scope: { type: "string", description: "'client' | 'user' | 'both' (default)" },
      },
    },
  },
  {
    name: "pin_memory",
    description: "Mark an existing memory as pinned so it never auto-evicts. Use for load-bearing facts (methodology, voice, primary editor).",
    input_schema: {
      type: "object",
      properties: {
        key: { type: "string" },
        scope: { type: "string", description: "'client' (default) or 'user'" },
      },
      required: ["key"],
    },
  },
  {
    name: "unpin_memory",
    description: "Remove the pin from a memory so it becomes eligible for LRU eviction.",
    input_schema: {
      type: "object",
      properties: {
        key: { type: "string" },
        scope: { type: "string", description: "'client' (default) or 'user'" },
      },
      required: ["key"],
    },
  },
];

function clampValue(value: unknown): string {
  return String(value ?? "").trim().slice(0, MAX_VALUE_LENGTH);
}

function normalizeKey(key: unknown): string {
  return String(key ?? "").trim().toLowerCase().replace(/\s+/g, "_");
}

export async function handleMemoryTool(
  block: { id: string; name: string; input: Record<string, any> },
  ctx: ToolContext,
): Promise<ToolResult | null> {
  const { adminClient, userId, client } = ctx;
  const scope = (block.input?.scope === "user" ? "user" : "client") as "user" | "client";
  const userRequested = block.input?.user_requested === true;
  const targetClientId = scope === "user" ? null : client.id;

  if (block.name === "save_memory") {
    const key = normalizeKey(block.input?.key);
    const value = clampValue(block.input?.value);
    const pinned = block.input?.pinned === true;
    if (!key || !value) {
      return { type: "tool_result", tool_use_id: block.id, content: "Refused: key and value required (value max 250 chars)." };
    }
    const source = userRequested ? "user" : (block.input?.source === "auto" ? "auto" : "model");

    // Check for an existing row to upsert (the partial unique indexes
    // distinguish scope but the table doesn't have a multi-column unique
    // suitable for onConflict; do a manual lookup-then-update/insert).
    const { data: existing } = await adminClient
      .from("assistant_memories")
      .select("id")
      .eq("user_id", userId)
      .eq("scope", scope)
      .eq("key", key)
      .is("client_id", scope === "user" ? null : undefined)
      .eq(scope === "client" ? "client_id" : "user_id", scope === "client" ? client.id : userId)
      .maybeSingle();

    if (existing) {
      const { error } = await adminClient
        .from("assistant_memories")
        .update({ value, pinned, source, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (error) return { type: "tool_result", tool_use_id: block.id, content: `Save failed: ${error.message}` };
    } else {
      const { error } = await adminClient
        .from("assistant_memories")
        .insert({
          user_id: userId,
          scope,
          client_id: targetClientId,
          key,
          value,
          pinned,
          source,
        });
      if (error) return { type: "tool_result", tool_use_id: block.id, content: `Save failed: ${error.message}` };
    }

    // Apply the LRU cap so pinned + recent unpinned survive.
    await adminClient.rpc("enforce_assistant_memory_cap", {
      p_user_id: userId,
      p_scope: scope,
      p_client_id: targetClientId,
      p_max: MAX_MEMORIES_PER_SCOPE,
    });

    if (userRequested) {
      return {
        type: "tool_result",
        tool_use_id: block.id,
        content: `(memory "${key}" saved at ${scope} scope${pinned ? ", pinned" : ""}. INCLUDE this confirmation in your reply so the user knows it landed — e.g. "Got it — saved as [${key}].")`,
      };
    }
    return {
      type: "tool_result",
      tool_use_id: block.id,
      content: `(internal: memory "${key}" persisted silently at ${scope} scope${pinned ? ", pinned" : ""} — do NOT mention "memory" or "saved" to the user; just answer their question naturally)`,
    };
  }

  if (block.name === "delete_memory") {
    const key = normalizeKey(block.input?.key);
    if (!key) return { type: "tool_result", tool_use_id: block.id, content: "Refused: key required." };
    let q = adminClient.from("assistant_memories").delete()
      .eq("user_id", userId)
      .eq("scope", scope)
      .eq("key", key);
    if (scope === "client") q = q.eq("client_id", client.id);
    else q = q.is("client_id", null);
    const { data, error } = await q.select("id").maybeSingle();
    if (error) return { type: "tool_result", tool_use_id: block.id, content: `Delete failed: ${error.message}` };
    if (!data) return { type: "tool_result", tool_use_id: block.id, content: `(no memory found with key "${key}" at ${scope} scope)` };
    if (userRequested) {
      return {
        type: "tool_result",
        tool_use_id: block.id,
        content: `(memory "${key}" deleted at ${scope} scope. INCLUDE a short confirmation in your reply — e.g. "Forgotten — [${key}] is gone.")`,
      };
    }
    return {
      type: "tool_result",
      tool_use_id: block.id,
      content: `(internal: memory "${key}" deleted silently at ${scope} scope — do NOT mention to the user)`,
    };
  }

  if (block.name === "list_memories") {
    const requestedScope = block.input?.scope === "client" || block.input?.scope === "user" ? block.input.scope : "both";
    const sections: string[] = [];

    if (requestedScope === "client" || requestedScope === "both") {
      const { data: cm } = await adminClient
        .from("assistant_memories")
        .select("key, value, pinned, source")
        .eq("user_id", userId)
        .eq("scope", "client")
        .eq("client_id", client.id)
        .order("pinned", { ascending: false })
        .order("updated_at", { ascending: false });
      if (cm && cm.length > 0) {
        const lines = cm.map((m: any) => `${m.pinned ? "[pinned] " : ""}${m.key}: ${m.value}`);
        sections.push(`Client memories (${client.name ?? "?"}):\n${lines.join("\n")}`);
      }
    }
    if (requestedScope === "user" || requestedScope === "both") {
      const { data: um } = await adminClient
        .from("assistant_memories")
        .select("key, value, pinned, source")
        .eq("user_id", userId)
        .eq("scope", "user")
        .is("client_id", null)
        .order("pinned", { ascending: false })
        .order("updated_at", { ascending: false });
      if (um && um.length > 0) {
        const lines = um.map((m: any) => `${m.pinned ? "[pinned] " : ""}${m.key}: ${m.value}`);
        sections.push(`User-level memories (apply across all clients):\n${lines.join("\n")}`);
      }
    }

    if (sections.length === 0) {
      return { type: "tool_result", tool_use_id: block.id, content: "No memories saved yet at the requested scope." };
    }
    return { type: "tool_result", tool_use_id: block.id, content: sections.join("\n\n") };
  }

  if (block.name === "pin_memory" || block.name === "unpin_memory") {
    const key = normalizeKey(block.input?.key);
    if (!key) return { type: "tool_result", tool_use_id: block.id, content: "Refused: key required." };
    const pinned = block.name === "pin_memory";
    let q = adminClient
      .from("assistant_memories")
      .update({ pinned, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("scope", scope)
      .eq("key", key);
    if (scope === "client") q = q.eq("client_id", client.id);
    else q = q.is("client_id", null);
    const { data, error } = await q.select("id").maybeSingle();
    if (error) return { type: "tool_result", tool_use_id: block.id, content: `Update failed: ${error.message}` };
    if (!data) return { type: "tool_result", tool_use_id: block.id, content: `(no memory found with key "${key}" at ${scope} scope)` };
    return {
      type: "tool_result",
      tool_use_id: block.id,
      content: `(internal: memory "${key}" ${pinned ? "pinned" : "unpinned"} at ${scope} scope — mention naturally only if the user asked about it)`,
    };
  }

  return null;
}

/**
 * Load memories for system-prompt injection. Returns formatted blocks the
 * caller stitches into the prompt. Honors the per-scope cap and pinned-first
 * ordering. Both scopes loaded in parallel.
 */
export async function loadMemoriesForPrompt(
  adminClient: any,
  userId: string,
  clientId: string | null,
): Promise<{ clientBlock: string; userBlock: string }> {
  const [userRes, clientRes] = await Promise.all([
    adminClient
      .from("assistant_memories")
      .select("key, value, pinned")
      .eq("user_id", userId)
      .eq("scope", "user")
      .is("client_id", null)
      .order("pinned", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(MAX_MEMORIES_PER_SCOPE),
    clientId
      ? adminClient
          .from("assistant_memories")
          .select("key, value, pinned")
          .eq("user_id", userId)
          .eq("scope", "client")
          .eq("client_id", clientId)
          .order("pinned", { ascending: false })
          .order("updated_at", { ascending: false })
          .limit(MAX_MEMORIES_PER_SCOPE)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const fmt = (rows: Array<{ key: string; value: string; pinned: boolean }>) =>
    rows.map((r) => `- ${r.pinned ? "[pinned] " : ""}${r.key}: ${r.value}`).join("\n");

  const clientBlock = (clientRes.data ?? []).length > 0
    ? `\nWhat you remember about this client (long-term — treat these as facts):\n${fmt(clientRes.data)}`
    : "";
  const userBlock = (userRes.data ?? []).length > 0
    ? `\nWhat you remember about the agency owner (applies across all their clients):\n${fmt(userRes.data)}`
    : "";
  return { clientBlock, userBlock };
}
