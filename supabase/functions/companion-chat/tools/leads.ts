// supabase/functions/companion-chat/tools/leads.ts
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import type { ToolContext, ToolDef, ToolResult } from "./types.ts";
import { resolveClient } from "./types.ts";

export const LEAD_TOOLS: ToolDef[] = [
  {
    name: "get_leads",
    description: "Get leads for a client. Optionally filter by status. Use this before updating a lead to find its name, or when the user asks about their pipeline.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "The client's name" },
        status: { type: "string", description: "Optional filter: new, contacted, interested, booked, stopped" },
        limit: { type: "number", description: "Max results to return (default 10)" },
      },
      required: ["client_name"],
    },
  },
  {
    name: "get_pipeline_summary",
    description: "Get a count of leads by status for a client — the instant pipeline snapshot. Use when the user asks 'how many leads does X have?' or 'what's the pipeline looking like?'",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "The client's name" },
      },
      required: ["client_name"],
    },
  },
  {
    name: "update_lead_status",
    description: "Update a lead's status. Call get_leads first if you need to find the lead's exact name.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "The client's name" },
        lead_name: { type: "string", description: "The lead's name (partial match works)" },
        new_status: { type: "string", description: "new | contacted | interested | booked | lost | stopped" },
      },
      required: ["client_name", "lead_name", "new_status"],
    },
  },
  {
    name: "add_lead_notes",
    description: "Append notes to a lead. Existing notes are preserved. Use when the user says 'note that X' or 'add a note to lead Y'.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "The client's name" },
        lead_name: { type: "string", description: "The lead's name (partial match works)" },
        notes: { type: "string", description: "Notes to append" },
      },
      required: ["client_name", "lead_name", "notes"],
    },
  },
  {
    name: "create_lead",
    description: "Add a new lead for a client. If email is provided, triggers the follow-up sequence automatically.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "The client's name" },
        name: { type: "string", description: "Lead's full name" },
        phone: { type: "string", description: "Phone number (optional)" },
        email: { type: "string", description: "Email — triggers auto follow-up if provided" },
        source: { type: "string", description: "Where this lead came from (optional)" },
        notes: { type: "string", description: "Initial notes (optional)" },
      },
      required: ["client_name", "name"],
    },
  },
  {
    name: "bulk_update_lead_status",
    description: "Update status on multiple leads at once. Use when the user is sweeping the pipeline (\"mark these 4 as booked\", \"these 3 are lost\"). Each item: lead_name + new_status.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string" },
        updates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              lead_name: { type: "string" },
              new_status: { type: "string", description: "new | contacted | interested | booked | lost | closed" },
            },
            required: ["lead_name", "new_status"],
          },
        },
      },
      required: ["client_name", "updates"],
    },
  },
  {
    name: "draft_lead_outreach",
    description: "Generate a personalized first-touch DM/email per lead. Reads the lead's notes + the client's onboarding voice + offer to write a short, on-brand message. Returns the drafts as text — does NOT send anything. Use when the user says \"draft DMs for these leads\" or \"what should I send X?\". The user can copy-paste from chat.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string" },
        lead_names: {
          type: "array",
          items: { type: "string" },
          description: "Names of leads to draft for. Up to 5 per call.",
        },
        channel: {
          type: "string",
          description: "Default 'dm'. Use 'email' for longer-form. The model adjusts tone and length.",
        },
      },
      required: ["client_name", "lead_names"],
    },
  },
];

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export async function handleLeadTool(
  block: { id: string; name: string; input: Record<string, any> },
  ctx: ToolContext,
): Promise<ToolResult | null> {
  const { adminClient, userId, actions } = ctx;

  if (block.name === "get_leads") {
    const { client_name, status, limit = 10 } = block.input;
    const client = await resolveClient(ctx, client_name);
    if (!client) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };

    let query = adminClient
      .from("leads")
      .select("id, name, status, notes, booked, last_contacted_at, created_at, source, email, phone")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (status) query = query.eq("status", status);
    const { data: leads } = await query;

    if (!leads || leads.length === 0) {
      return { type: "tool_result", tool_use_id: block.id, content: `No leads found for ${client.name}${status ? ` with status "${status}"` : ""}.` };
    }
    const lines = leads.map((l: any) =>
      `${l.name} — ${l.status}${l.booked ? " (BOOKED)" : ""}${l.notes ? ` | notes: ${l.notes.slice(0, 80)}` : ""}${l.last_contacted_at ? ` | last contact: ${l.last_contacted_at.slice(0, 10)}` : ""}`
    );
    return { type: "tool_result", tool_use_id: block.id, content: `${leads.length} lead(s) for ${client.name}:\n${lines.join("\n")}` };
  }

  if (block.name === "get_pipeline_summary") {
    const { client_name } = block.input;
    const client = await resolveClient(ctx, client_name);
    if (!client) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };

    const { data: leads } = await adminClient
      .from("leads")
      .select("status, booked")
      .eq("client_id", client.id);

    if (!leads || leads.length === 0) return { type: "tool_result", tool_use_id: block.id, content: `No leads for ${client.name} yet.` };

    const counts: Record<string, number> = {};
    for (const l of leads) counts[l.status] = (counts[l.status] ?? 0) + 1;
    const booked = leads.filter((l: any) => l.booked).length;
    const lines = Object.entries(counts).map(([s, c]) => `${s}: ${c}`);
    return { type: "tool_result", tool_use_id: block.id, content: `Pipeline for ${client.name} (${leads.length} total, ${booked} booked):\n${lines.join("\n")}` };
  }

  if (block.name === "update_lead_status") {
    const { client_name, lead_name, new_status } = block.input;
    const client = await resolveClient(ctx, client_name);
    if (!client) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };

    const { data: lead } = await adminClient
      .from("leads")
      .select("id, name")
      .eq("client_id", client.id)
      .ilike("name", `%${lead_name}%`)
      .limit(1)
      .maybeSingle();
    if (!lead) return { type: "tool_result", tool_use_id: block.id, content: `No lead found matching "${lead_name}" for ${client.name}` };

    await adminClient.from("leads").update({ status: new_status }).eq("id", lead.id);
    actions.push({ type: "refresh_data", scope: "leads" });
    return { type: "tool_result", tool_use_id: block.id, content: `Updated ${lead.name}'s status to "${new_status}".` };
  }

  if (block.name === "add_lead_notes") {
    const { client_name, lead_name, notes } = block.input;
    const client = await resolveClient(ctx, client_name);
    if (!client) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };

    const { data: lead } = await adminClient
      .from("leads")
      .select("id, name, notes")
      .eq("client_id", client.id)
      .ilike("name", `%${lead_name}%`)
      .limit(1)
      .maybeSingle();
    if (!lead) return { type: "tool_result", tool_use_id: block.id, content: `No lead found matching "${lead_name}" for ${client.name}` };

    const existing = lead.notes ? lead.notes + "\n---\n" : "";
    const timestamp = new Date().toISOString().slice(0, 10);
    await adminClient.from("leads").update({ notes: `${existing}[${timestamp}] ${notes}` }).eq("id", lead.id);
    actions.push({ type: "refresh_data", scope: "leads" });
    return { type: "tool_result", tool_use_id: block.id, content: `Added notes to ${lead.name}.` };
  }

  if (block.name === "create_lead") {
    const { client_name, name, phone, email, source, notes } = block.input;
    const client = await resolveClient(ctx, client_name);
    if (!client) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };

    const { data: newLead, error } = await adminClient
      .from("leads")
      .insert({
        client_id: client.id,
        name,
        phone: phone ?? null,
        email: email ?? null,
        source: source ?? null,
        notes: notes ?? null,
        status: "new",
        next_follow_up_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error || !newLead) return { type: "tool_result", tool_use_id: block.id, content: `Failed to create lead: ${error?.message ?? "unknown"}` };

    // Trigger follow-up sequence if email was provided
    if (email) {
      await fetch(`${SUPABASE_URL}/functions/v1/send-followup`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
        body: JSON.stringify({ lead_id: newLead.id }),
      }).catch((e) => console.warn("send-followup trigger failed:", e));
    }

    actions.push({ type: "refresh_data", scope: "leads" });
    return { type: "tool_result", tool_use_id: block.id, content: `Created lead "${name}" for ${client.name}${email ? " — follow-up sequence triggered." : "."}` };
  }

  if (block.name === "bulk_update_lead_status") {
    const { client_name, updates } = block.input;
    const client = await resolveClient(ctx, client_name);
    if (!client) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };
    if (!Array.isArray(updates) || updates.length === 0) {
      return { type: "tool_result", tool_use_id: block.id, content: "Refused: updates must be a non-empty array." };
    }
    if (updates.length > 25) {
      return { type: "tool_result", tool_use_id: block.id, content: `Refused: too many updates (${updates.length}). Cap is 25 per call.` };
    }
    const lines: string[] = [];
    let touched = 0;
    for (const u of updates) {
      const leadName = String(u?.lead_name ?? "").trim();
      const newStatus = String(u?.new_status ?? "").trim();
      if (!leadName || !newStatus) {
        lines.push(`SKIP: missing lead_name or new_status — ${JSON.stringify(u).slice(0, 80)}`);
        continue;
      }
      const { data: lead } = await adminClient
        .from("leads")
        .select("id, name")
        .eq("client_id", client.id)
        .ilike("name", `%${leadName}%`)
        .limit(1)
        .maybeSingle();
      if (!lead) { lines.push(`MISS "${leadName}" — no lead matched`); continue; }
      const { error } = await adminClient.from("leads").update({ status: newStatus }).eq("id", lead.id);
      if (error) lines.push(`FAIL "${lead.name}": ${error.message}`);
      else { touched += 1; lines.push(`OK ${lead.name} → ${newStatus}`); }
    }
    actions.push({ type: "refresh_data", scope: "leads" });
    return { type: "tool_result", tool_use_id: block.id, content: `Updated ${touched}/${updates.length} for ${client.name}:\n${lines.join("\n")}` };
  }

  if (block.name === "draft_lead_outreach") {
    const { client_name, lead_names, channel = "dm" } = block.input;
    const client = await resolveClient(ctx, client_name);
    if (!client) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };
    if (!Array.isArray(lead_names) || lead_names.length === 0) {
      return { type: "tool_result", tool_use_id: block.id, content: "Refused: lead_names must be a non-empty array." };
    }
    if (lead_names.length > 5) {
      return { type: "tool_result", tool_use_id: block.id, content: `Refused: cap is 5 leads per call (got ${lead_names.length}).` };
    }

    const { data: clientRow } = await adminClient.from("clients").select("name, onboarding_data").eq("id", client.id).maybeSingle();
    const od = (clientRow?.onboarding_data as any) ?? {};
    const voiceBlock = [
      `Creator: ${od.clientName ?? client.name}`,
      `Industry: ${od.industry ?? "?"}`,
      `Offer: ${od.uniqueOffer ?? "?"}`,
      `Audience: ${od.targetClient ?? "?"}`,
      `Voice / values: ${od.uniqueValues ?? "conversational, direct"}`,
    ].join("\n");

    // Resolve each lead and pull its notes for personalization
    const drafts: string[] = [];
    for (const name of lead_names.slice(0, 5)) {
      const trimmed = String(name).trim();
      if (!trimmed) continue;
      const { data: lead } = await adminClient
        .from("leads")
        .select("id, name, status, source, notes")
        .eq("client_id", client.id)
        .ilike("name", `%${trimmed}%`)
        .limit(1)
        .maybeSingle();
      if (!lead) {
        drafts.push(`--- ${trimmed} ---\n(No lead matched.)`);
        continue;
      }
      const prompt = `Write a short ${channel === "email" ? "first-touch email" : "first-touch DM"} from the creator below to a new lead.

CREATOR PROFILE:
${voiceBlock}

LEAD:
- Name: ${lead.name}
- Status: ${lead.status ?? "new"}
- Source: ${lead.source ?? "unknown"}
- Notes: ${lead.notes ?? "(none)"}

RULES:
- ${channel === "email" ? "Subject line on first line, then a 4-6 sentence body" : "Single short DM (3-5 sentences max)"}
- First-person, sound human, no buzzwords
- Reference something specific from the notes if available; otherwise lead with the creator's offer
- End with a clear, low-friction CTA (a single yes/no question)
- No emojis, no hashtags

Output the message only, no preamble.`;

      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: channel === "email" ? 400 : 200,
            messages: [{ role: "user", content: prompt }],
          }),
        });
        if (!res.ok) {
          drafts.push(`--- ${lead.name} ---\n(Generation failed: HTTP ${res.status})`);
          continue;
        }
        const json = await res.json();
        const text = (json.content?.[0]?.text as string ?? "").trim();
        drafts.push(`--- ${lead.name} (${channel}) ---\n${text || "(empty draft)"}`);
      } catch (e) {
        drafts.push(`--- ${lead.name} ---\n(Error: ${(e as Error).message})`);
      }
    }
    return {
      type: "tool_result",
      tool_use_id: block.id,
      content: `Drafted ${drafts.length} ${channel}(s) for ${client.name}. Copy whichever you like — nothing has been sent.\n\n${drafts.join("\n\n")}`,
    };
  }

  return null;
}
