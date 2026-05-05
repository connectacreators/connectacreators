// supabase/functions/companion-chat/tools/scripts.ts
import type { ToolContext, ToolDef, ToolResult } from "./types.ts";
import { resolveClient } from "./types.ts";

export const SCRIPT_TOOLS: ToolDef[] = [
  {
    name: "update_script_status",
    description: "Change a script's status. Use when the user says a script is ready, approved, or needs review.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string" },
        script_title: { type: "string", description: "Title or partial title of the script" },
        status: { type: "string", description: "Idea | Recorded | In Review | Approved | complete" },
      },
      required: ["client_name", "script_title", "status"],
    },
  },
  {
    name: "mark_script_recorded",
    description: "Mark a script as recorded (sets grabado = true, status = Recorded). Use when the client says they filmed it.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string" },
        script_title: { type: "string", description: "Title or partial title of the script" },
      },
      required: ["client_name", "script_title"],
    },
  },
  {
    name: "delete_script",
    description: "Permanently delete a script. In ask/plan mode always confirm first. Use only when the user explicitly asks to delete.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string" },
        script_title: { type: "string", description: "Title or partial title of the script to delete" },
      },
      required: ["client_name", "script_title"],
    },
  },
];

async function findScript(adminClient: any, clientId: string, titlePartial: string) {
  const { data } = await adminClient
    .from("scripts")
    .select("id, title, idea_ganadora, status, grabado")
    .eq("client_id", clientId)
    .ilike("idea_ganadora", `%${titlePartial}%`)
    .limit(1)
    .maybeSingle();
  if (data) return data;
  // Fallback: try matching on raw title column
  const { data: data2 } = await adminClient
    .from("scripts")
    .select("id, title, idea_ganadora, status, grabado")
    .eq("client_id", clientId)
    .ilike("title", `%${titlePartial}%`)
    .limit(1)
    .maybeSingle();
  return data2 ?? null;
}

export async function handleScriptTool(
  block: { id: string; name: string; input: Record<string, any> },
  ctx: ToolContext,
): Promise<ToolResult | null> {
  const { adminClient, userId, actions } = ctx;

  if (block.name === "update_script_status") {
    const { client_name, script_title, status } = block.input;
    const client = await resolveClient(adminClient, userId, client_name);
    if (!client) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };
    const script = await findScript(adminClient, client.id, script_title);
    if (!script) return { type: "tool_result", tool_use_id: block.id, content: `No script found matching "${script_title}" for ${client.name}` };
    await adminClient.from("scripts").update({ status }).eq("id", script.id);
    actions.push({ type: "refresh_data", scope: "scripts" });
    return { type: "tool_result", tool_use_id: block.id, content: `"${script.idea_ganadora ?? script.title}" status updated to "${status}".` };
  }

  if (block.name === "mark_script_recorded") {
    const { client_name, script_title } = block.input;
    const client = await resolveClient(adminClient, userId, client_name);
    if (!client) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };
    const script = await findScript(adminClient, client.id, script_title);
    if (!script) return { type: "tool_result", tool_use_id: block.id, content: `No script found matching "${script_title}" for ${client.name}` };
    await adminClient.from("scripts").update({ grabado: true, status: "Recorded" }).eq("id", script.id);
    actions.push({ type: "refresh_data", scope: "scripts" });
    return { type: "tool_result", tool_use_id: block.id, content: `"${script.idea_ganadora ?? script.title}" marked as recorded.` };
  }

  if (block.name === "delete_script") {
    const { client_name, script_title } = block.input;
    const client = await resolveClient(adminClient, userId, client_name);
    if (!client) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };
    const script = await findScript(adminClient, client.id, script_title);
    if (!script) return { type: "tool_result", tool_use_id: block.id, content: `No script found matching "${script_title}" for ${client.name}` };
    await adminClient.from("script_lines").delete().eq("script_id", script.id);
    await adminClient.from("scripts").delete().eq("id", script.id);
    actions.push({ type: "refresh_data", scope: "scripts" });
    return { type: "tool_result", tool_use_id: block.id, content: `Deleted script "${script.idea_ganadora ?? script.title}" for ${client.name}.` };
  }

  return null;
}
