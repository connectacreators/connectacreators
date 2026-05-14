// supabase/functions/companion-chat/tools/plans.ts
//
// Preview-and-approve flow ("preview big actions" autonomy mode).
//
// Robby calls propose_plan before kicking off a multi-step or destructive
// action. The plan lands in the pending_plans table; an action of type
// `plan_proposal` is emitted so the frontend can render a checklist card
// (or just a notification, until the rich UI ships). The user approves in
// chat — Robby calls confirm_plan(id) to mark approved, then proceeds to
// execute the steps as normal tool calls.

import type { ToolContext, ToolDef, ToolResult } from "./types.ts";

export const PLAN_TOOLS: ToolDef[] = [
  {
    name: "propose_plan",
    description:
      "Record a multi-step plan and present it to the user for approval BEFORE executing. Call this when you're about to: (a) make 3+ writes in one turn, or (b) take ANY destructive action (delete_script, update_lead_status to lost/closed, send_contract, mark_post_published, large strategy changes). Returns a plan_id and a notice to the user. Wait for the user to say 'yes' / 'approve' / 'go ahead'; then call confirm_plan(plan_id) and proceed to execute the steps. If the user declines, call reject_plan(plan_id) and don't execute. Single-step non-destructive writes don't need a plan — just do them.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "One-line description of what the plan accomplishes (\"build + schedule 5 reels for Dr Calvin this week\")" },
        steps: {
          type: "array",
          description: "Ordered list of steps the AI will execute on approval",
          items: {
            type: "object",
            properties: {
              tool: { type: "string", description: "Tool name that will run (e.g. submit_to_editing_after_save)" },
              description: { type: "string", description: "Plain-English one-liner of what the step does and why" },
            },
            required: ["tool", "description"],
          },
        },
        client_name: { type: "string", description: "Optional: the client this plan is for" },
        notes: { type: "string", description: "Optional: extra context, expected outcome, or risks the user should know" },
        target_item_titles: {
          type: "array",
          items: { type: "string" },
          description: "Optional: when the plan affects specific editing-queue items, list their titles (or partial titles) here so the UI can highlight the affected rows with a subtle pulse while the user decides. Example: ['VIDEO #4', 'VIDEO #5', '(03) So, you\\'re thinking…']. Only include for plans touching the editing queue.",
        },
      },
      required: ["summary", "steps"],
    },
  },
  {
    name: "confirm_plan",
    description: "Mark a previously proposed plan as approved by the user. Call ONLY after the user has said yes/approve/go-ahead in their reply. After this returns success, proceed to execute the plan's steps as normal tool calls in the same conversation.",
    input_schema: {
      type: "object",
      properties: {
        plan_id: { type: "string", description: "UUID returned by propose_plan" },
      },
      required: ["plan_id"],
    },
  },
  {
    name: "reject_plan",
    description: "Mark a previously proposed plan as rejected. Call when the user says no / cancel / not now. After this returns, do not execute any of the plan's steps.",
    input_schema: {
      type: "object",
      properties: {
        plan_id: { type: "string", description: "UUID returned by propose_plan" },
        reason: { type: "string", description: "Optional one-line reason from the user" },
      },
      required: ["plan_id"],
    },
  },
];

export async function handlePlanTool(
  block: { id: string; name: string; input: Record<string, any> },
  ctx: ToolContext,
): Promise<ToolResult | null> {
  const { adminClient, userId, client, actions } = ctx;

  if (block.name === "propose_plan") {
    const { summary, steps, client_name, notes, target_item_titles } = block.input;
    if (!summary || !Array.isArray(steps) || steps.length === 0) {
      return { type: "tool_result", tool_use_id: block.id, content: "Refused: summary and at least one step are required." };
    }
    // Resolve a client_id if a name was passed (best-effort, optional).
    let resolvedClientId: string | null = null;
    if (client_name) {
      const { data } = await adminClient
        .from("clients")
        .select("id")
        .ilike("name", `%${client_name}%`)
        .limit(1)
        .maybeSingle();
      resolvedClientId = data?.id ?? null;
    }
    if (!resolvedClientId && client?.id) resolvedClientId = client.id;

    const { data: plan, error } = await adminClient
      .from("pending_plans")
      .insert({
        user_id: userId,
        client_id: resolvedClientId,
        summary: String(summary).slice(0, 280),
        steps: steps.slice(0, 25),  // cap so a runaway model can't blow up the row
        status: "pending",
        notes: notes ? String(notes).slice(0, 500) : null,
      })
      .select("id")
      .single();
    if (error || !plan) {
      return { type: "tool_result", tool_use_id: block.id, content: `Could not store plan: ${error?.message ?? "unknown error"}` };
    }

    // Emit a structured action so the frontend can render a card later.
    actions.push({
      type: "plan_proposal",
      plan_id: plan.id,
      summary,
      steps: steps.slice(0, 25),
    });

    // If the model named target editing-queue items, resolve them to ids and
    // emit a highlight action. The page pulses those rows so the user can
    // visually confirm what's about to change before approving.
    if (Array.isArray(target_item_titles) && target_item_titles.length > 0 && resolvedClientId) {
      try {
        const { resolveEditingItem } = await import("../_shared/editing-resolver.ts");
        const itemIds: string[] = [];
        for (const raw of target_item_titles.slice(0, 25)) {
          const title = String(raw ?? "").trim();
          if (!title) continue;
          const r = await resolveEditingItem(
            adminClient,
            resolvedClientId,
            ctx.accessibleClientIds,
            title,
            { onlyLive: true },
          );
          if (r.ok) itemIds.push(r.item.id);
        }
        if (itemIds.length > 0) {
          // Navigate the user to the editing queue so they can SEE the pulse
          // and the affected rows before the plan card asks for approval. Use
          // the per-client URL when we have a resolved client; else master.
          const path = resolvedClientId
            ? `/clients/${resolvedClientId}/editing-queue`
            : `/editing-queue`;
          actions.push({ type: "navigate", path });
          actions.push({
            type: "highlight_items",
            scope: "editing_queue",
            item_ids: itemIds,
            plan_id: plan.id,
          });
        }
      } catch (e) {
        console.warn("[propose_plan] highlight_items resolution failed:", e);
      }
    }

    const stepLines = steps
      .slice(0, 25)
      .map((s: any, i: number) => `${i + 1}. ${s.description ?? s.tool ?? "(unnamed step)"}`)
      .join("\n");
    return {
      type: "tool_result",
      tool_use_id: block.id,
      content: `Plan ${plan.id} stored as pending. Show this exact list to the user, ask them to confirm, then call confirm_plan(plan_id) before executing any of the steps.\n\nSummary: ${summary}\nSteps:\n${stepLines}\n\nDO NOT execute any step until the user approves AND you call confirm_plan.`,
    };
  }

  if (block.name === "confirm_plan") {
    const { plan_id } = block.input;
    if (!plan_id) return { type: "tool_result", tool_use_id: block.id, content: "Refused: plan_id is required." };
    const { data: plan, error } = await adminClient
      .from("pending_plans")
      .update({ status: "approved", approved_at: new Date().toISOString() })
      .eq("id", plan_id)
      .eq("user_id", userId)
      .eq("status", "pending")
      .select("id, summary")
      .maybeSingle();
    if (error) return { type: "tool_result", tool_use_id: block.id, content: `Could not confirm: ${error.message}` };
    if (!plan) return { type: "tool_result", tool_use_id: block.id, content: `Plan ${plan_id} not found, not yours, or already actioned.` };
    return {
      type: "tool_result",
      tool_use_id: block.id,
      content: `Plan ${plan.id} approved. Now execute the steps in order using the appropriate tool calls.`,
    };
  }

  if (block.name === "reject_plan") {
    const { plan_id, reason } = block.input;
    if (!plan_id) return { type: "tool_result", tool_use_id: block.id, content: "Refused: plan_id is required." };
    const { data: plan, error } = await adminClient
      .from("pending_plans")
      .update({
        status: "rejected",
        rejected_at: new Date().toISOString(),
        notes: reason ? String(reason).slice(0, 500) : null,
      })
      .eq("id", plan_id)
      .eq("user_id", userId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (error) return { type: "tool_result", tool_use_id: block.id, content: `Could not reject: ${error.message}` };
    if (!plan) return { type: "tool_result", tool_use_id: block.id, content: `Plan ${plan_id} not found, not yours, or already actioned.` };
    return { type: "tool_result", tool_use_id: block.id, content: `Plan ${plan.id} rejected. Do not execute any of its steps.` };
  }

  return null;
}
