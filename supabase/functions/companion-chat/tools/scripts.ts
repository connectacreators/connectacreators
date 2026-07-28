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
  {
    name: "edit_script_live",
    description: "Rewrite the currently-open Script Surface's content per the user's spoken instruction (e.g. \"make the hook punchier\", \"add a stat about X to the body\", \"cut the CTA to one line\"). Only usable while ACTIVE ACTION SURFACE says a Script Surface is open — for any other script, there is no live-edit path yet; tell the user to open it on the Scripts page instead. Provide the COMPLETE new lines array reflecting the requested change, not just the changed lines — copy every unrelated line byte-for-byte from the ACTIVE ACTION SURFACE content so only the intended part visibly changes.",
    input_schema: {
      type: "object",
      properties: {
        script_id: { type: "string", description: "The open Script Surface's script_id, from ACTIVE ACTION SURFACE." },
        lines: {
          type: "array",
          description: "The FULL new script, every line, in order.",
          items: {
            type: "object",
            properties: {
              section: { type: "string", description: "hook | body | cta" },
              line_type: { type: "string", description: "filming | actor | editor | text_on_screen" },
              text: { type: "string" },
            },
            required: ["section", "line_type", "text"],
          },
        },
        change_summary: { type: "string", description: "One short phrase describing what changed, e.g. \"Punchier hook\" — shown as a small on-screen caption, not spoken aloud." },
      },
      required: ["script_id", "lines", "change_summary"],
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

  if (block.name === "edit_script_live") {
    const { script_id, lines, change_summary } = block.input as {
      script_id: string;
      lines: Array<{ section: string; line_type: string; text: string }>;
      change_summary: string;
    };
    if (!script_id) return { type: "tool_result", tool_use_id: block.id, content: "script_id is required." };
    if (!Array.isArray(lines) || lines.length === 0) {
      return { type: "tool_result", tool_use_id: block.id, content: "lines must be a non-empty array." };
    }

    const { data: script, error: scriptFetchErr } = await adminClient
      .from("scripts")
      .select("id, title, idea_ganadora, client_id, revision")
      .eq("id", script_id)
      .maybeSingle();
    if (scriptFetchErr || !script) {
      return { type: "tool_result", tool_use_id: block.id, content: `Script ${script_id} not found — the Script Surface may have closed.` };
    }

    let clientName: string | null = null;
    if (script.client_id) {
      const { data: clientRow } = await adminClient.from("clients").select("name").eq("id", script.client_id).maybeSingle();
      clientName = clientRow?.name ?? null;
    }

    const { data: oldLines } = await adminClient
      .from("script_lines")
      .select("id, text")
      .eq("script_id", script_id)
      .order("line_number");
    const oldIds = (oldLines ?? []).map((l: { id: string }) => l.id);
    const oldTexts = (oldLines ?? []).map((l: { text: string }) => l.text);

    // Same DB CHECK-constraint guard create_script uses — a bad line_type
    // fails the whole batch insert, not just that row.
    const VALID_LINE_TYPES = new Set(["filming", "actor", "editor", "text_on_screen"]);
    const newRows = lines.map((l, i) => ({
      id: crypto.randomUUID(),
      script_id,
      line_number: i + 1,
      line_type: VALID_LINE_TYPES.has(l.line_type) ? l.line_type : "actor",
      section: l.section || "body",
      text: l.text,
    }));

    const { data: rpcData, error: rpcErr } = await adminClient.rpc("save_script_blocks_atomic", {
      p_script_id: script_id,
      p_expected_revision: script.revision,
      p_upserts: newRows,
      p_delete_ids: oldIds,
    });
    if (rpcErr) {
      return { type: "tool_result", tool_use_id: block.id, content: `Failed to save the edit: ${rpcErr.message}` };
    }

    // raw_content is a denormalized full-text cache (same field create_script
    // populates at insert time) — save_script_blocks_atomic only touches
    // script_lines + revision, so it needs updating separately here.
    await adminClient
      .from("scripts")
      .update({ raw_content: newRows.map((r) => r.text).join("\n") })
      .eq("id", script_id);

    // Which lines actually changed, by position — drives the Script
    // Surface's per-line reveal animation so an edit doesn't re-flash the
    // whole script, just the part that changed.
    const changedLineNumbers = newRows
      .map((r, i) => (oldTexts[i] !== r.text ? r.line_number : null))
      .filter((n): n is number => n !== null);
    if (newRows.length !== oldTexts.length) {
      // Line count changed (added/removed a line) — every line from the
      // first divergence point on has a shifted position, so just flag
      // everything from there onward rather than a precise but fragile
      // realignment.
      const firstDivergence = changedLineNumbers[0] ?? 1;
      for (let n = firstDivergence; n <= newRows.length; n++) {
        if (!changedLineNumbers.includes(n)) changedLineNumbers.push(n);
      }
    }

    actions.push({
      type: "script_surface_update",
      script_id,
      title: script.idea_ganadora ?? script.title ?? "Untitled",
      client_id: script.client_id,
      client_name: clientName,
      lines: newRows.map((r) => ({ id: r.id, section: r.section, line_type: r.line_type, text: r.text })),
      changed_line_numbers: changedLineNumbers,
      change_summary: change_summary || "Updated",
      was_conflicted: !!rpcData?.[0]?.was_conflicted,
    });

    return {
      type: "tool_result",
      tool_use_id: block.id,
      content: `Updated "${script.idea_ganadora ?? script.title}" — ${change_summary || "changes applied"}.`,
    };
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
