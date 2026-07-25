// supabase/functions/companion-chat/tools/scripts.ts
import type { ToolContext, ToolDef, ToolResult } from "./types.ts";
import { resolveClient } from "./types.ts";

export const SCRIPT_TOOLS: ToolDef[] = [
  {
    name: "get_script",
    description: "Fetch a script's full content (hook, body, CTA) and return it in your reply so the user can see/discuss it without leaving the page. Use when the user says 'open the script for X', 'show me the script', 'what does the script say', 'read me the script'. This is read-only — for changes, use update_script_status / mark_script_recorded.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string" },
        script_title: { type: "string", description: "Title or partial title. Omit to use the client's most recently created script." },
      },
      required: ["client_name"],
    },
  },
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

  if (block.name === "get_script") {
    const { client_name, script_title } = block.input as { client_name: string; script_title?: string };
    const client = await resolveClient(ctx, client_name);
    if (!client) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };

    const script = script_title
      ? await findScript(adminClient, client.id, script_title)
      : (
          await adminClient
            .from("scripts")
            .select("id, title, idea_ganadora, status, grabado")
            .eq("client_id", client.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        ).data;
    if (!script) {
      return { type: "tool_result", tool_use_id: block.id, content: `No script found${script_title ? ` matching "${script_title}"` : ""} for ${client.name}.` };
    }

    const { data: lines } = await adminClient
      .from("script_lines")
      .select("line_type, section, text, block_kind")
      .eq("script_id", script.id)
      .order("line_number");

    const scriptLabel = script.idea_ganadora ?? script.title ?? "Untitled";
    if (!lines || lines.length === 0) {
      return { type: "tool_result", tool_use_id: block.id, content: `"${scriptLabel}" has no content yet (empty script).` };
    }

    const bySection: Record<string, string[]> = {};
    for (const l of lines) {
      if (l.block_kind === "heading") continue; // headings are structural, not spoken content
      const sec = (l.section || "body") as string;
      (bySection[sec] ??= []).push(l.text);
    }
    const sectionOrder = ["hook", "body", "cta"];
    const parts: string[] = [];
    for (const sec of sectionOrder) {
      if (bySection[sec]?.length) parts.push(`${sec.toUpperCase()}:\n${bySection[sec].join("\n")}`);
    }
    for (const sec of Object.keys(bySection)) {
      if (!sectionOrder.includes(sec)) parts.push(`${sec.toUpperCase()}:\n${bySection[sec].join("\n")}`);
    }

    return {
      type: "tool_result",
      tool_use_id: block.id,
      content: `"${scriptLabel}" (status: ${script.status}):\n\n${parts.join("\n\n")}`,
    };
  }

  if (block.name === "update_script_status") {
    const { client_name, script_title, status } = block.input;
    const client = await resolveClient(ctx, client_name);
    if (!client) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };
    const script = await findScript(adminClient, client.id, script_title);
    if (!script) return { type: "tool_result", tool_use_id: block.id, content: `No script found matching "${script_title}" for ${client.name}` };
    await adminClient.from("scripts").update({ status }).eq("id", script.id);
    actions.push({ type: "refresh_data", scope: "scripts" });
    return { type: "tool_result", tool_use_id: block.id, content: `"${script.idea_ganadora ?? script.title}" status updated to "${status}".` };
  }

  if (block.name === "mark_script_recorded") {
    const { client_name, script_title } = block.input;
    const client = await resolveClient(ctx, client_name);
    if (!client) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };
    const script = await findScript(adminClient, client.id, script_title);
    if (!script) return { type: "tool_result", tool_use_id: block.id, content: `No script found matching "${script_title}" for ${client.name}` };
    await adminClient.from("scripts").update({ grabado: true, status: "Recorded" }).eq("id", script.id);
    actions.push({ type: "refresh_data", scope: "scripts" });
    return { type: "tool_result", tool_use_id: block.id, content: `"${script.idea_ganadora ?? script.title}" marked as recorded.` };
  }

  if (block.name === "delete_script") {
    const { client_name, script_title } = block.input;
    const client = await resolveClient(ctx, client_name);
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
