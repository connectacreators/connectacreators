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
