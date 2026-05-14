// supabase/functions/companion-chat/tools/editing.ts
import type { ToolContext, ToolDef, ToolResult } from "./types.ts";
import { resolveClient } from "./types.ts";
import { resolveEditingItem, ambiguousMessage } from "../_shared/editing-resolver.ts";

export const EDITING_TOOLS: ToolDef[] = [
  {
    name: "open_editing_item",
    description: "Open a specific editing-queue item in the user's browser, optionally opening a modal on it (revisions / review / footage / caption / deadline / schedule / delete). Use this when the user asks to 'show me X', 'open the revisions for Y', 'let me see the footage for Z', etc. Resolves the item by partial title. If client_name is omitted, navigates to the master editing queue.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "Client name. Omit to navigate to the admin master view." },
        item_title: { type: "string", description: "Title or partial title of the editing item to open." },
        modal: { type: "string", description: "Optional modal to open on the item: revisions (or 'review') opens the video review modal where the user watches the video and adds revision comments. 'notes' opens a text-only revision-instructions textarea. footage / caption / deadline / schedule / delete open their respective modals." },
      },
      required: ["item_title"],
    },
  },
  {
    name: "set_editing_queue_view",
    description: "Filter and sort the editing queue view in the user's browser. Use when the user asks 'show me only X status', 'sort by deadline', 'find everything assigned to Y', etc. If client_name is omitted, applies to the master view.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "Client name. Omit for master view." },
        status: { type: "string", description: "Filter by item status: Not started | In progress | In review | Done" },
        post_status: { type: "string", description: "Filter by post status: Unpublished | Scheduled | Published" },
        assignee: { type: "string", description: "Filter by assignee name" },
        search: { type: "string", description: "Pre-fill the search box" },
        sort_by: { type: "string", description: "Column to sort by: title | status | assignee | deadline | revisions | post_status | client (master view only)" },
        sort_dir: { type: "string", description: "Sort direction: asc | desc" },
      },
      required: [],
    },
  },
  {
    name: "set_deadline",
    description: "Set or clear a deadline on an editing queue item. Pass deadline=null to clear.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string" },
        item_title: { type: "string" },
        deadline: { type: "string", description: "YYYY-MM-DD, or null to clear" },
      },
      required: ["client_name", "item_title", "deadline"],
    },
  },
  {
    name: "delete_editing_item",
    description: "Soft-delete an editing queue item (moves it to trash; can be restored).",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string" },
        item_title: { type: "string" },
      },
      required: ["client_name", "item_title"],
    },
  },
  {
    name: "restore_editing_item",
    description: "Restore a soft-deleted editing queue item from the trash.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string" },
        item_title: { type: "string" },
      },
      required: ["client_name", "item_title"],
    },
  },
  {
    name: "permanent_delete_editing_item",
    description: "Permanently delete an editing queue item. UNRECOVERABLE. Must be confirmed by user via propose_plan first, regardless of autonomy mode.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string" },
        item_title: { type: "string" },
      },
      required: ["client_name", "item_title"],
    },
  },
  {
    name: "set_caption",
    description: "Overwrite the caption on an editing queue item. Use when the user dictates a caption directly (does not call the AI to generate one — use generate_caption for that).",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string" },
        item_title: { type: "string" },
        caption: { type: "string" },
      },
      required: ["client_name", "item_title", "caption"],
    },
  },
  {
    name: "rename_editing_item",
    description: "Rename the reel title on an editing queue item.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string" },
        item_title: { type: "string", description: "Current title or partial title." },
        new_title: { type: "string" },
      },
      required: ["client_name", "item_title", "new_title"],
    },
  },
  {
    name: "update_editing_status",
    description: "Update the status of an item in the editing queue.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string" },
        item_title: { type: "string", description: "Title or partial title of the editing item" },
        status: { type: "string", description: "Not started | In progress | In review | Done" },
      },
      required: ["client_name", "item_title", "status"],
    },
  },
  {
    name: "assign_editor",
    description: "Assign an editor to an editing queue item.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string" },
        item_title: { type: "string" },
        editor_name: { type: "string", description: "Name of the editor to assign" },
      },
      required: ["client_name", "item_title", "editor_name"],
    },
  },
  {
    name: "add_revision_notes",
    description: "Add revision instructions to an editing queue item. Existing notes are preserved.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string" },
        item_title: { type: "string" },
        notes: { type: "string", description: "Revision instructions for the editor" },
      },
      required: ["client_name", "item_title", "notes"],
    },
  },
  {
    name: "mark_post_published",
    description: "Mark a post as published. Works for both editing queue items and content calendar entries (same table).",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string" },
        item_title: { type: "string" },
      },
      required: ["client_name", "item_title"],
    },
  },
  {
    name: "mark_done_and_published",
    description: "Convenience: in one call, set status=Done AND post_status=Published on an editing queue item. Use when the user says 'mark X as done and published' or similar. Saves a round-trip vs calling update_editing_status + mark_post_published separately.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string" },
        item_title: { type: "string" },
      },
      required: ["client_name", "item_title"],
    },
  },
  {
    name: "reschedule_post",
    description: "Change the scheduled date for a content calendar post.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string" },
        title: { type: "string", description: "Title or partial title of the post" },
        new_date: { type: "string", description: "New date in YYYY-MM-DD format" },
      },
      required: ["client_name", "title", "new_date"],
    },
  },
  {
    name: "generate_caption",
    description: "Generate an Instagram or TikTok caption for a post using the client's brand voice. Returns the caption text. If auto_apply_to_title is provided, the generated caption is also written to that video_edits row's caption column (matched by title).",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string" },
        hook: { type: "string", description: "The video hook or main message to base the caption on" },
        platform: { type: "string", description: "instagram (default) or tiktok" },
        cta_keyword: { type: "string", description: "ManyChat keyword trigger to include (optional)" },
        auto_apply_to_title: { type: "string", description: "Optional: title (or partial) of the video_edits row this caption is for. If set, the generated caption is automatically saved to that row." },
      },
      required: ["client_name", "hook"],
    },
  },
  {
    name: "bulk_reschedule_posts",
    description: "Move multiple scheduled posts to new dates in one call. Use when the user reshuffles a whole week (\"push everything from this week to next week\") or shifts multiple posts at once. Each item: title (or partial) + new_date (YYYY-MM-DD).",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              new_date: { type: "string", description: "YYYY-MM-DD" },
            },
            required: ["title", "new_date"],
          },
        },
      },
      required: ["client_name", "items"],
    },
  },
  {
    name: "bulk_delete_editing_items",
    description: "Soft-delete multiple editing items in one call. Capped at 14 per call.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string" },
        item_titles: { type: "array", items: { type: "string" } },
      },
      required: ["client_name", "item_titles"],
    },
  },
  {
    name: "bulk_assign_editor",
    description: "Assign an editor to multiple items in one call. Capped at 14.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string" },
        item_titles: { type: "array", items: { type: "string" } },
        editor_name: { type: "string" },
      },
      required: ["client_name", "item_titles", "editor_name"],
    },
  },
  {
    name: "bulk_update_status",
    description: "Set status on multiple items in one call. Capped at 14. status: Not started | In progress | In review | Done.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string" },
        item_titles: { type: "array", items: { type: "string" } },
        status: { type: "string" },
      },
      required: ["client_name", "item_titles", "status"],
    },
  },
];

async function findEditItem(adminClient: any, clientId: string, titlePartial: string) {
  const { data } = await adminClient
    .from("video_edits")
    .select("id, reel_title, status, assignee, revisions")
    .eq("client_id", clientId)
    .is("deleted_at", null)
    .ilike("reel_title", `%${titlePartial}%`)
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

export async function handleEditingTool(
  block: { id: string; name: string; input: Record<string, any> },
  ctx: ToolContext,
): Promise<ToolResult | null> {
  const { adminClient, userId, actions } = ctx;

  if (block.name === "open_editing_item") {
    const { client_name, item_title, modal } = block.input as { client_name?: string; item_title: string; modal?: string };
    const validModals = ["revisions", "review", "notes", "footage", "caption", "deadline", "schedule", "delete"];
    if (modal && !validModals.includes(modal)) {
      return { type: "tool_result", tool_use_id: block.id, content: `Invalid modal "${modal}". Use one of: ${validModals.join(", ")}.` };
    }

    let targetClientId: string | null = null;
    let targetClientName: string | null = null;
    if (client_name) {
      const c = await resolveClient(ctx, client_name);
      if (!c) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };
      targetClientId = c.id;
      targetClientName = c.name ?? null;
    }

    const result = await resolveEditingItem(
      adminClient,
      targetClientId,
      ctx.accessibleClientIds,
      item_title,
    );
    if (!result.ok) {
      if (result.reason === "ambiguous") {
        return { type: "tool_result", tool_use_id: block.id, content: ambiguousMessage(item_title, result.candidates) };
      }
      return { type: "tool_result", tool_use_id: block.id, content: `No editing item found matching "${item_title}"${targetClientName ? ` for ${targetClientName}` : ""}.` };
    }

    // Build the navigation URL.
    const params = new URLSearchParams();
    params.set("item_id", result.item.id);
    if (modal) params.set("modal", modal);
    const basePath = targetClientId
      ? `/clients/${targetClientId}/editing-queue`
      : `/editing-queue`;
    const path = `${basePath}?${params.toString()}`;

    actions.push({ type: "navigate", path });
    const where = targetClientName ?? "master queue";
    const what = modal ? ` and opened the ${modal} view` : "";
    return { type: "tool_result", tool_use_id: block.id, content: `Opened "${result.item.reel_title}" in ${where}${what}.` };
  }

  if (block.name === "set_editing_queue_view") {
    const { client_name, status, post_status, assignee, search, sort_by, sort_dir } = block.input as {
      client_name?: string;
      status?: string;
      post_status?: string;
      assignee?: string;
      search?: string;
      sort_by?: string;
      sort_dir?: string;
    };

    let targetClientId: string | null = null;
    if (client_name) {
      const c = await resolveClient(ctx, client_name);
      if (!c) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };
      targetClientId = c.id;
    }

    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (post_status) params.set("post_status", post_status);
    if (assignee) params.set("assignee", assignee);
    if (search) params.set("search", search);
    if (sort_by) params.set("sort", sort_by);
    if (sort_dir === "asc" || sort_dir === "desc") params.set("dir", sort_dir);

    if (Array.from(params.keys()).length === 0) {
      return { type: "tool_result", tool_use_id: block.id, content: "No filter or sort provided — nothing to apply." };
    }

    const basePath = targetClientId
      ? `/clients/${targetClientId}/editing-queue`
      : `/editing-queue`;
    const path = `${basePath}?${params.toString()}`;
    actions.push({ type: "navigate", path });

    const parts: string[] = [];
    if (status) parts.push(`status=${status}`);
    if (post_status) parts.push(`post_status=${post_status}`);
    if (assignee) parts.push(`assignee=${assignee}`);
    if (search) parts.push(`search="${search}"`);
    if (sort_by) parts.push(`sort=${sort_by}${sort_dir ? ` ${sort_dir}` : ""}`);
    return { type: "tool_result", tool_use_id: block.id, content: `Applied: ${parts.join(", ")}.` };
  }

  if (block.name === "update_editing_status") {
    const { client_name, item_title, status } = block.input;
    const client = await resolveClient(ctx, client_name);
    if (!client) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };
    const item = await findEditItem(adminClient, client.id, item_title);
    if (!item) return { type: "tool_result", tool_use_id: block.id, content: `No editing item found matching "${item_title}" for ${client.name}` };
    await adminClient.from("video_edits").update({ status }).eq("id", item.id);
    actions.push({ type: "refresh_data", scope: "editing_queue" });
    return { type: "tool_result", tool_use_id: block.id, content: `"${item.reel_title}" status updated to "${status}".` };
  }

  if (block.name === "assign_editor") {
    const { client_name, item_title, editor_name } = block.input;
    const client = await resolveClient(ctx, client_name);
    if (!client) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };
    const item = await findEditItem(adminClient, client.id, item_title);
    if (!item) return { type: "tool_result", tool_use_id: block.id, content: `No editing item found matching "${item_title}" for ${client.name}` };
    await adminClient.from("video_edits").update({ assignee: editor_name }).eq("id", item.id);
    actions.push({ type: "refresh_data", scope: "editing_queue" });
    return { type: "tool_result", tool_use_id: block.id, content: `"${item.reel_title}" assigned to ${editor_name}.` };
  }

  if (block.name === "add_revision_notes") {
    const { client_name, item_title, notes } = block.input;
    const client = await resolveClient(ctx, client_name);
    if (!client) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };
    const item = await findEditItem(adminClient, client.id, item_title);
    if (!item) return { type: "tool_result", tool_use_id: block.id, content: `No editing item found matching "${item_title}" for ${client.name}` };
    const existing = item.revisions ? item.revisions + "\n---\n" : "";
    const timestamp = new Date().toISOString().slice(0, 10);
    await adminClient.from("video_edits").update({ revisions: `${existing}[${timestamp}] ${notes}` }).eq("id", item.id);
    actions.push({ type: "refresh_data", scope: "editing_queue" });
    return { type: "tool_result", tool_use_id: block.id, content: `Revision notes added to "${item.reel_title}".` };
  }

  if (block.name === "set_deadline") {
    const { client_name, item_title, deadline } = block.input as { client_name: string; item_title: string; deadline: string | null };
    const client = await resolveClient(ctx, client_name);
    if (!client) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };
    const r = await resolveEditingItem(adminClient, client.id, ctx.accessibleClientIds, item_title, { onlyLive: true });
    if (!r.ok) {
      if (r.reason === "ambiguous") return { type: "tool_result", tool_use_id: block.id, content: ambiguousMessage(item_title, r.candidates) };
      return { type: "tool_result", tool_use_id: block.id, content: `No editing item matched "${item_title}" for ${client.name}.` };
    }
    const newDeadline = deadline === null || deadline === "" ? null : deadline;
    const { error: updErr } = await adminClient.from("video_edits").update({ deadline: newDeadline }).eq("id", r.item.id);
    if (updErr) {
      return { type: "tool_result", tool_use_id: block.id, content: `Update failed for "${r.item.reel_title}": ${updErr.message}` };
    }
    actions.push({ type: "refresh_data", scope: "editing_queue" });
    return { type: "tool_result", tool_use_id: block.id, content: newDeadline ? `Deadline for "${r.item.reel_title}" set to ${newDeadline}.` : `Deadline cleared for "${r.item.reel_title}".` };
  }

  if (block.name === "delete_editing_item") {
    const { client_name, item_title } = block.input as { client_name: string; item_title: string };
    const client = await resolveClient(ctx, client_name);
    if (!client) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };
    const r = await resolveEditingItem(adminClient, client.id, ctx.accessibleClientIds, item_title, { onlyLive: true });
    if (!r.ok) {
      if (r.reason === "ambiguous") return { type: "tool_result", tool_use_id: block.id, content: ambiguousMessage(item_title, r.candidates) };
      return { type: "tool_result", tool_use_id: block.id, content: `No live editing item matched "${item_title}" for ${client.name}.` };
    }
    const { error: updErr } = await adminClient.from("video_edits").update({ deleted_at: new Date().toISOString() }).eq("id", r.item.id);
    if (updErr) {
      return { type: "tool_result", tool_use_id: block.id, content: `Update failed for "${r.item.reel_title}": ${updErr.message}` };
    }
    actions.push({ type: "refresh_data", scope: "editing_queue" });
    return { type: "tool_result", tool_use_id: block.id, content: `"${r.item.reel_title}" moved to trash. Use restore_editing_item to bring it back.` };
  }

  if (block.name === "restore_editing_item") {
    const { client_name, item_title } = block.input as { client_name: string; item_title: string };
    const client = await resolveClient(ctx, client_name);
    if (!client) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };
    const r = await resolveEditingItem(adminClient, client.id, ctx.accessibleClientIds, item_title, { onlyDeleted: true });
    if (!r.ok) {
      if (r.reason === "ambiguous") return { type: "tool_result", tool_use_id: block.id, content: ambiguousMessage(item_title, r.candidates) };
      return { type: "tool_result", tool_use_id: block.id, content: `No trashed editing item matched "${item_title}" for ${client.name}.` };
    }
    const { error: updErr } = await adminClient.from("video_edits").update({ deleted_at: null }).eq("id", r.item.id);
    if (updErr) {
      return { type: "tool_result", tool_use_id: block.id, content: `Update failed for "${r.item.reel_title}": ${updErr.message}` };
    }
    actions.push({ type: "refresh_data", scope: "editing_queue" });
    return { type: "tool_result", tool_use_id: block.id, content: `"${r.item.reel_title}" restored from trash.` };
  }

  if (block.name === "permanent_delete_editing_item") {
    const { client_name, item_title } = block.input as { client_name: string; item_title: string };
    const client = await resolveClient(ctx, client_name);
    if (!client) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };
    const r = await resolveEditingItem(adminClient, client.id, ctx.accessibleClientIds, item_title);
    if (!r.ok) {
      if (r.reason === "ambiguous") return { type: "tool_result", tool_use_id: block.id, content: ambiguousMessage(item_title, r.candidates) };
      return { type: "tool_result", tool_use_id: block.id, content: `No editing item matched "${item_title}" for ${client.name}.` };
    }
    const { error: delErr } = await adminClient.from("video_edits").delete().eq("id", r.item.id);
    if (delErr) {
      return { type: "tool_result", tool_use_id: block.id, content: `Delete failed for "${r.item.reel_title}": ${delErr.message}` };
    }
    actions.push({ type: "refresh_data", scope: "editing_queue" });
    return { type: "tool_result", tool_use_id: block.id, content: `"${r.item.reel_title}" permanently deleted. This cannot be undone.` };
  }

  if (block.name === "set_caption") {
    const { client_name, item_title, caption } = block.input as { client_name: string; item_title: string; caption: string };
    const client = await resolveClient(ctx, client_name);
    if (!client) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };
    const r = await resolveEditingItem(adminClient, client.id, ctx.accessibleClientIds, item_title, { onlyLive: true });
    if (!r.ok) {
      if (r.reason === "ambiguous") return { type: "tool_result", tool_use_id: block.id, content: ambiguousMessage(item_title, r.candidates) };
      return { type: "tool_result", tool_use_id: block.id, content: `No editing item matched "${item_title}" for ${client.name}.` };
    }
    const { error: updErr } = await adminClient.from("video_edits").update({ caption }).eq("id", r.item.id);
    if (updErr) {
      return { type: "tool_result", tool_use_id: block.id, content: `Update failed for "${r.item.reel_title}": ${updErr.message}` };
    }
    actions.push({ type: "refresh_data", scope: "editing_queue" });
    actions.push({ type: "refresh_data", scope: "calendar" });
    return { type: "tool_result", tool_use_id: block.id, content: `Caption updated for "${r.item.reel_title}".` };
  }

  if (block.name === "rename_editing_item") {
    const { client_name, item_title, new_title } = block.input as { client_name: string; item_title: string; new_title: string };
    const trimmed = new_title.trim();
    if (!trimmed) return { type: "tool_result", tool_use_id: block.id, content: "Refused: new_title must be non-empty." };
    const client = await resolveClient(ctx, client_name);
    if (!client) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };
    const r = await resolveEditingItem(adminClient, client.id, ctx.accessibleClientIds, item_title, { onlyLive: true });
    if (!r.ok) {
      if (r.reason === "ambiguous") return { type: "tool_result", tool_use_id: block.id, content: ambiguousMessage(item_title, r.candidates) };
      return { type: "tool_result", tool_use_id: block.id, content: `No editing item matched "${item_title}" for ${client.name}.` };
    }
    const { error: updErr } = await adminClient.from("video_edits").update({ reel_title: trimmed }).eq("id", r.item.id);
    if (updErr) {
      return { type: "tool_result", tool_use_id: block.id, content: `Update failed for "${r.item.reel_title}": ${updErr.message}` };
    }
    actions.push({ type: "refresh_data", scope: "editing_queue" });
    return { type: "tool_result", tool_use_id: block.id, content: `"${r.item.reel_title}" renamed to "${trimmed}".` };
  }

  if (block.name === "mark_post_published") {
    const { client_name, item_title } = block.input;
    const client = await resolveClient(ctx, client_name);
    if (!client) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };
    const item = await findEditItem(adminClient, client.id, item_title);
    if (!item) return { type: "tool_result", tool_use_id: block.id, content: `No item found matching "${item_title}" for ${client.name}` };
    await adminClient.from("video_edits").update({ post_status: "Published" }).eq("id", item.id);
    actions.push({ type: "refresh_data", scope: "editing_queue" });
    actions.push({ type: "refresh_data", scope: "calendar" });
    return { type: "tool_result", tool_use_id: block.id, content: `"${item.reel_title}" marked as Published.` };
  }

  if (block.name === "mark_done_and_published") {
    const { client_name, item_title } = block.input as { client_name: string; item_title: string };
    const client = await resolveClient(ctx, client_name);
    if (!client) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };
    const r = await resolveEditingItem(adminClient, client.id, ctx.accessibleClientIds, item_title, { onlyLive: true });
    if (!r.ok) {
      if (r.reason === "ambiguous") return { type: "tool_result", tool_use_id: block.id, content: ambiguousMessage(item_title, r.candidates) };
      return { type: "tool_result", tool_use_id: block.id, content: `No live editing item matched "${item_title}" for ${client.name}.` };
    }
    const { error: updErr } = await adminClient
      .from("video_edits")
      .update({ status: "Done", post_status: "Published" })
      .eq("id", r.item.id);
    if (updErr) {
      return { type: "tool_result", tool_use_id: block.id, content: `Update failed for "${r.item.reel_title}": ${updErr.message}` };
    }
    actions.push({ type: "refresh_data", scope: "editing_queue" });
    actions.push({ type: "refresh_data", scope: "calendar" });
    return { type: "tool_result", tool_use_id: block.id, content: `"${r.item.reel_title}" marked as Done and Published.` };
  }

  if (block.name === "reschedule_post") {
    const { client_name, title, new_date } = block.input;
    const client = await resolveClient(ctx, client_name);
    if (!client) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };
    const item = await findEditItem(adminClient, client.id, title);
    if (!item) return { type: "tool_result", tool_use_id: block.id, content: `No post found matching "${title}" for ${client.name}` };
    await adminClient.from("video_edits").update({ schedule_date: new_date }).eq("id", item.id);
    actions.push({ type: "refresh_data", scope: "calendar" });
    return { type: "tool_result", tool_use_id: block.id, content: `"${item.reel_title}" rescheduled to ${new_date}.` };
  }

  if (block.name === "generate_caption") {
    const { client_name, hook, platform = "instagram", cta_keyword, auto_apply_to_title } = block.input;
    const client = await resolveClient(ctx, client_name);
    if (!client) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };

    const { data: clientRow } = await adminClient.from("clients").select("onboarding_data").eq("id", client.id).maybeSingle();
    const od = (clientRow?.onboarding_data as any) ?? {};

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        messages: [{
          role: "user",
          content: `Write a ${platform} caption for this video.

Video hook / main message: "${hook}"

Creator profile:
- Name: ${od.clientName ?? client.name}
- Industry: ${od.industry ?? "not set"}
- Offer: ${od.uniqueOffer ?? "not set"}
- Audience: ${od.targetClient ?? "not set"}
${cta_keyword ? `- ManyChat keyword: comment "${cta_keyword}" to get [lead magnet]` : ""}

Rules:
- Write in first person, conversational tone
- 2–4 sentences max
- No hashtags unless they're the only text after the main copy
- ${cta_keyword ? `End with a CTA referencing the keyword "${cta_keyword}"` : "End with a soft engagement CTA (question or opinion ask)"}
- Sound human, not like a brand post

Caption only, no other text.`,
        }],
      }),
    });
    const json = await res.json();
    const caption = (json.content?.[0]?.text as string ?? "").trim();

    // Optional: auto-apply the generated caption to a specific video_edits row.
    let appliedNote = "";
    if (caption && auto_apply_to_title) {
      const item = await findEditItem(adminClient, client.id, String(auto_apply_to_title));
      if (item) {
        const { error: applyErr } = await adminClient.from("video_edits").update({ caption }).eq("id", item.id);
        if (applyErr) {
          appliedNote = `\n\n(Could not auto-apply: ${applyErr.message})`;
        } else {
          actions.push({ type: "refresh_data", scope: "calendar" });
          actions.push({ type: "refresh_data", scope: "editing_queue" });
          appliedNote = `\n\nSaved to "${item.reel_title}" automatically.`;
        }
      } else {
        appliedNote = `\n\n(No video_edits row matched "${auto_apply_to_title}" — copy the caption manually.)`;
      }
    }
    return { type: "tool_result", tool_use_id: block.id, content: `Caption for "${client.name}" (${platform}):\n\n${caption}${appliedNote || "\n\n(This is a draft — copy it or pass auto_apply_to_title next time to save automatically.)"}` };
  }

  if (block.name === "bulk_reschedule_posts") {
    const { client_name, items } = block.input;
    const client = await resolveClient(ctx, client_name);
    if (!client) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };
    if (!Array.isArray(items) || items.length === 0) {
      return { type: "tool_result", tool_use_id: block.id, content: "Refused: items must be a non-empty array." };
    }
    if (items.length > 14) {
      return { type: "tool_result", tool_use_id: block.id, content: `Refused: cap is 14 per call (got ${items.length}).` };
    }
    const lines: string[] = [];
    let touched = 0;
    for (const it of items) {
      const title = String(it?.title ?? "").trim();
      const newDate = String(it?.new_date ?? "").trim();
      if (!title || !newDate) {
        lines.push(`SKIP: missing title or new_date — ${JSON.stringify(it).slice(0, 80)}`);
        continue;
      }
      const item = await findEditItem(adminClient, client.id, title);
      if (!item) { lines.push(`MISS "${title}" — no post matched`); continue; }
      const { error } = await adminClient.from("video_edits").update({ schedule_date: newDate }).eq("id", item.id);
      if (error) lines.push(`FAIL "${item.reel_title}": ${error.message}`);
      else { touched += 1; lines.push(`OK "${item.reel_title}" → ${newDate}`); }
    }
    actions.push({ type: "refresh_data", scope: "calendar" });
    return { type: "tool_result", tool_use_id: block.id, content: `Rescheduled ${touched}/${items.length} for ${client.name}:\n${lines.join("\n")}` };
  }

  // Shared helper for bulk operations — resolves each title and runs `mutate`
  // for the resolved item id. Returns the per-item status string.
  async function runBulk(
    client_name: string,
    item_titles: unknown,
    mutate: (id: string) => Promise<{ error: unknown }>,
    actionVerb: string,
  ): Promise<ToolResult> {
    if (!Array.isArray(item_titles) || item_titles.length === 0) {
      return { type: "tool_result", tool_use_id: block.id, content: "Refused: item_titles must be a non-empty array." };
    }
    if (item_titles.length > 14) {
      return { type: "tool_result", tool_use_id: block.id, content: `Refused: cap is 14 per call (got ${item_titles.length}).` };
    }
    const client = await resolveClient(ctx, client_name);
    if (!client) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };

    // Pass 1: resolve every title to an id first, so we can emit a
    // highlight_items action BEFORE the mutations run. The page pulses
    // those rows while the bulk operation lands, giving the user a
    // visual cue even when the model skipped propose_plan.
    type ResolvedItem = { id: string; reel_title: string };
    const resolved: Array<ResolvedItem | null> = [];
    const lines: string[] = [];
    for (const raw of item_titles) {
      const title = String(raw ?? "").trim();
      if (!title) { lines.push("SKIP: empty title"); resolved.push(null); continue; }
      const r = await resolveEditingItem(adminClient, client.id, ctx.accessibleClientIds, title, { onlyLive: true });
      if (!r.ok) {
        if (r.reason === "ambiguous") lines.push(`AMBIGUOUS "${title}" — ${r.candidates.length} matches`);
        else lines.push(`MISS "${title}"`);
        resolved.push(null);
        continue;
      }
      resolved.push({ id: r.item.id, reel_title: r.item.reel_title });
    }
    const resolvedIds = resolved.filter((x): x is ResolvedItem => x !== null).map((x) => x.id);
    if (resolvedIds.length > 0) {
      actions.push({ type: "highlight_items", scope: "editing_queue", item_ids: resolvedIds });
    }

    // Pass 2: apply mutations.
    let touched = 0;
    for (let i = 0; i < resolved.length; i++) {
      const r = resolved[i];
      if (!r) continue;
      const res = await mutate(r.id);
      if (res.error) lines.push(`FAIL "${r.reel_title}": ${(res.error as { message?: string }).message ?? "unknown"}`);
      else { touched += 1; lines.push(`OK "${r.reel_title}"`); }
    }
    actions.push({ type: "refresh_data", scope: "editing_queue" });
    return { type: "tool_result", tool_use_id: block.id, content: `${actionVerb} ${touched}/${item_titles.length} for ${client.name}:\n${lines.join("\n")}` };
  }

  if (block.name === "bulk_delete_editing_items") {
    const { client_name, item_titles } = block.input as { client_name: string; item_titles: string[] };
    return runBulk(client_name, item_titles, async (id) => {
      const { error } = await adminClient.from("video_edits").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      return { error };
    }, "Soft-deleted");
  }

  if (block.name === "bulk_assign_editor") {
    const { client_name, item_titles, editor_name } = block.input as { client_name: string; item_titles: string[]; editor_name: string };
    return runBulk(client_name, item_titles, async (id) => {
      const { error } = await adminClient.from("video_edits").update({ assignee: editor_name }).eq("id", id);
      return { error };
    }, `Assigned to ${editor_name}:`);
  }

  if (block.name === "bulk_update_status") {
    const { client_name, item_titles, status } = block.input as { client_name: string; item_titles: string[]; status: string };
    const valid = ["Not started", "In progress", "In review", "Done"];
    if (!valid.includes(status)) {
      return { type: "tool_result", tool_use_id: block.id, content: `Invalid status "${status}". Use one of: ${valid.join(", ")}.` };
    }
    return runBulk(client_name, item_titles, async (id) => {
      const { error } = await adminClient.from("video_edits").update({ status }).eq("id", id);
      return { error };
    }, `Set status to "${status}":`);
  }

  return null;
}
