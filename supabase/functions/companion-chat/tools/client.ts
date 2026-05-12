// supabase/functions/companion-chat/tools/client.ts
//
// This module used to also own delete_memory + list_memories that wrote to
// the abandoned companion_state.workflow_context. Those were duplicating
// (and shadowing) the canonical implementations in tools/memories.ts —
// causing Anthropic 400s on duplicate tool names. Removed.

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
];

export async function handleClientTool(
  block: { id: string; name: string; input: Record<string, any> },
  ctx: ToolContext,
): Promise<ToolResult | null> {
  const { adminClient, userId, actions } = ctx;

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

  return null;
}
