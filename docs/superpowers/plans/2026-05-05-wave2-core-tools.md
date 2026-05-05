# AI Full Parity — Wave 2: Core Business Tools

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 16 tools giving the AI full control over Leads, Finances, Script lifecycle, Editing queue, and Content calendar.

**Architecture:** All new tools live in focused files under `supabase/functions/companion-chat/tools/`. Each file exports `TOOL_DEFS` (Claude tool schemas) and a `handleToolBlock` function. The main `index.ts` spreads the defs into its `TOOLS` array and calls each module's handler in the tool loop. Wave 1 must be deployed before this wave.

**Tech Stack:** Deno edge functions, Supabase service role client, Claude Haiku (inline, for `log_transaction` parsing and `generate_caption`)

**Prerequisite:** Wave 1 plan must be complete — specifically `tools/types.ts` must exist.

---

## File map

| Action | Path | Purpose |
|---|---|---|
| CREATE | `supabase/functions/companion-chat/tools/leads.ts` | 5 lead tools |
| CREATE | `supabase/functions/companion-chat/tools/finances.ts` | 3 finance tools |
| CREATE | `supabase/functions/companion-chat/tools/scripts.ts` | 3 script lifecycle tools |
| CREATE | `supabase/functions/companion-chat/tools/editing.ts` | 4 editing queue + 2 calendar tools |
| MODIFY | `supabase/functions/companion-chat/index.ts` | Import + spread all new TOOL_DEFS, call new handlers |

---

## Task 1: Leads tools

**Files:**
- Create: `supabase/functions/companion-chat/tools/leads.ts`

- [ ] **Step 1: Create leads.ts**

```typescript
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
    const client = await resolveClient(adminClient, userId, client_name);
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
    const client = await resolveClient(adminClient, userId, client_name);
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
    const client = await resolveClient(adminClient, userId, client_name);
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
    const client = await resolveClient(adminClient, userId, client_name);
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
    const client = await resolveClient(adminClient, userId, client_name);
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

  return null;
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/companion-chat/tools/leads.ts
git commit -m "feat(ai): add 5 lead tools — get_leads, get_pipeline_summary, update_lead_status, add_lead_notes, create_lead"
```

---

## Task 2: Finance tools

**Files:**
- Create: `supabase/functions/companion-chat/tools/finances.ts`

- [ ] **Step 1: Create finances.ts**

```typescript
// supabase/functions/companion-chat/tools/finances.ts
import type { ToolContext, ToolDef, ToolResult } from "./types.ts";

export const FINANCE_TOOLS: ToolDef[] = [
  {
    name: "get_finances",
    description: "Get income, expenses, and net for a specific month. Defaults to current month. Use when the user asks 'how are we doing financially?' or 'what's our revenue this month?'",
    input_schema: {
      type: "object",
      properties: {
        month: { type: "number", description: "Month number 1–12 (default: current month)" },
        year: { type: "number", description: "4-digit year (default: current year)" },
      },
      required: [],
    },
  },
  {
    name: "log_transaction",
    description: "Log an income or expense in natural language. Examples: 'Client X paid $2,500 for SMMA', 'Paid $99 for software subscription'. Parses the amount, type, and category automatically.",
    input_schema: {
      type: "object",
      properties: {
        raw: { type: "string", description: "Natural language description of the transaction, including amount" },
        date: { type: "string", description: "Date in YYYY-MM-DD format (default: today)" },
      },
      required: ["raw"],
    },
  },
  {
    name: "get_revenue_vs_goal",
    description: "Compare actual revenue this month against each client's monthly revenue goal. Use when asked 'how are we tracking?' or 'are we hitting our goals?'",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

const INCOME_CATEGORIES = ["SMMA", "Bi-Weekly Fee", "One-Time Project", "Other Income"];
const EXPENSE_CATEGORIES = ["Subscriptions", "Ad Spend", "Travel", "Food & Meals", "Contractors", "Software", "Payroll", "Other"];

async function callHaikuForParsing(raw: string, today: string): Promise<{ amount: number; type: "income" | "expense"; category: string; description: string } | null> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      messages: [{
        role: "user",
        content: `Parse this transaction and output ONLY valid JSON with keys: amount (number, no currency symbol), type ("income" or "expense"), category (pick from income list if income: ${INCOME_CATEGORIES.join(", ")}; or expense list if expense: ${EXPENSE_CATEGORIES.join(", ")}), description (clean short description).

Transaction: "${raw}"

Output only JSON, nothing else.`,
      }],
    }),
  });
  const json = await res.json();
  const text = (json.content?.[0]?.text as string ?? "").trim().replace(/^```json\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(text); } catch { return null; }
}

export async function handleFinanceTool(
  block: { id: string; name: string; input: Record<string, any> },
  ctx: ToolContext,
): Promise<ToolResult | null> {
  const { adminClient, userId, actions } = ctx;

  if (block.name === "get_finances") {
    const now = new Date();
    const month = block.input.month ?? (now.getMonth() + 1);
    const year = block.input.year ?? now.getFullYear();
    const from = `${year}-${String(month).padStart(2, "0")}-01`;
    const toDate = new Date(year, month, 0);
    const to = `${year}-${String(month).padStart(2, "0")}-${String(toDate.getDate()).padStart(2, "0")}`;

    const { data: txns } = await adminClient
      .from("finance_transactions")
      .select("amount, type, category, description")
      .eq("user_id", userId)
      .gte("date", from)
      .lte("date", to);

    if (!txns || txns.length === 0) return { type: "tool_result", tool_use_id: block.id, content: `No transactions found for ${month}/${year}.` };

    const income = txns.filter((t: any) => t.type === "income");
    const expenses = txns.filter((t: any) => t.type === "expense");
    const totalIncome = income.reduce((s: number, t: any) => s + Number(t.amount), 0);
    const totalExpenses = expenses.reduce((s: number, t: any) => s + Number(t.amount), 0);
    const net = totalIncome - totalExpenses;

    const incomeByCat: Record<string, number> = {};
    for (const t of income) incomeByCat[t.category] = (incomeByCat[t.category] ?? 0) + Number(t.amount);
    const expenseByCat: Record<string, number> = {};
    for (const t of expenses) expenseByCat[t.category] = (expenseByCat[t.category] ?? 0) + Number(t.amount);

    const lines = [
      `${month}/${year} — ${txns.length} transactions`,
      `Income: $${totalIncome.toLocaleString()}`,
      ...Object.entries(incomeByCat).map(([k, v]) => `  ${k}: $${v.toLocaleString()}`),
      `Expenses: $${totalExpenses.toLocaleString()}`,
      ...Object.entries(expenseByCat).map(([k, v]) => `  ${k}: $${v.toLocaleString()}`),
      `Net: $${net.toLocaleString()}`,
    ];
    return { type: "tool_result", tool_use_id: block.id, content: lines.join("\n") };
  }

  if (block.name === "log_transaction") {
    const { raw, date } = block.input;
    const today = date ?? new Date().toISOString().slice(0, 10);

    const parsed = await callHaikuForParsing(raw, today);
    if (!parsed || !parsed.amount || !parsed.type || !parsed.category) {
      return { type: "tool_result", tool_use_id: block.id, content: `Could not parse transaction from: "${raw}". Please be more specific about the amount and type.` };
    }

    const { error } = await adminClient.from("finance_transactions").insert({
      user_id: userId,
      amount: parsed.amount,
      type: parsed.type,
      category: parsed.category,
      description: parsed.description ?? raw.slice(0, 100),
      date: today,
    });
    if (error) return { type: "tool_result", tool_use_id: block.id, content: `Failed to log transaction: ${error.message}` };

    actions.push({ type: "refresh_data", scope: "finances" });
    return { type: "tool_result", tool_use_id: block.id, content: `Logged: ${parsed.type === "income" ? "+" : "-"}$${parsed.amount} (${parsed.category}) — ${parsed.description}` };
  }

  if (block.name === "get_revenue_vs_goal") {
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

    const [{ data: txns }, { data: clients }] = await Promise.all([
      adminClient.from("finance_transactions").select("amount, category").eq("user_id", userId).eq("type", "income").gte("date", monthStart),
      adminClient.from("clients").select("id, name").eq("user_id", userId),
    ]);

    const totalIncome = (txns ?? []).reduce((s: number, t: any) => s + Number(t.amount), 0);

    const strategyRows = await Promise.all(
      (clients ?? []).map((c: any) =>
        adminClient.from("client_strategies").select("monthly_revenue_goal, monthly_revenue_actual").eq("client_id", c.id).maybeSingle()
          .then(({ data }) => ({ name: c.name, goal: data?.monthly_revenue_goal ?? 0, actual: data?.monthly_revenue_actual ?? 0 }))
      )
    );

    const totalGoal = strategyRows.reduce((s, r) => s + r.goal, 0);
    const pct = totalGoal > 0 ? Math.round((totalIncome / totalGoal) * 100) : 0;
    const lines = [
      `Revenue vs Goal — ${now.toLocaleString("en-US", { month: "long" })} ${now.getFullYear()}`,
      `Agency total: $${totalIncome.toLocaleString()} / $${totalGoal.toLocaleString()} (${pct}%)`,
      "",
      ...strategyRows.filter(r => r.goal > 0).map(r => `${r.name}: goal $${r.goal.toLocaleString()}`),
    ];
    return { type: "tool_result", tool_use_id: block.id, content: lines.join("\n") };
  }

  return null;
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/companion-chat/tools/finances.ts
git commit -m "feat(ai): add 3 finance tools — get_finances, log_transaction, get_revenue_vs_goal"
```

---

## Task 3: Script lifecycle tools

**Files:**
- Create: `supabase/functions/companion-chat/tools/scripts.ts`

- [ ] **Step 1: Create scripts.ts**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/companion-chat/tools/scripts.ts
git commit -m "feat(ai): add 3 script lifecycle tools — update_script_status, mark_script_recorded, delete_script"
```

---

## Task 4: Editing queue + calendar tools

**Files:**
- Create: `supabase/functions/companion-chat/tools/editing.ts`

- [ ] **Step 1: Create editing.ts**

```typescript
// supabase/functions/companion-chat/tools/editing.ts
import type { ToolContext, ToolDef, ToolResult } from "./types.ts";
import { resolveClient } from "./types.ts";

export const EDITING_TOOLS: ToolDef[] = [
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
    description: "Generate an Instagram or TikTok caption for a post using the client's brand voice. Returns the caption text for the user to review — does NOT auto-save.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string" },
        hook: { type: "string", description: "The video hook or main message to base the caption on" },
        platform: { type: "string", description: "instagram (default) or tiktok" },
        cta_keyword: { type: "string", description: "ManyChat keyword trigger to include (optional)" },
      },
      required: ["client_name", "hook"],
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

  if (block.name === "update_editing_status") {
    const { client_name, item_title, status } = block.input;
    const client = await resolveClient(adminClient, userId, client_name);
    if (!client) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };
    const item = await findEditItem(adminClient, client.id, item_title);
    if (!item) return { type: "tool_result", tool_use_id: block.id, content: `No editing item found matching "${item_title}" for ${client.name}` };
    await adminClient.from("video_edits").update({ status }).eq("id", item.id);
    actions.push({ type: "refresh_data", scope: "editing_queue" });
    return { type: "tool_result", tool_use_id: block.id, content: `"${item.reel_title}" status updated to "${status}".` };
  }

  if (block.name === "assign_editor") {
    const { client_name, item_title, editor_name } = block.input;
    const client = await resolveClient(adminClient, userId, client_name);
    if (!client) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };
    const item = await findEditItem(adminClient, client.id, item_title);
    if (!item) return { type: "tool_result", tool_use_id: block.id, content: `No editing item found matching "${item_title}" for ${client.name}` };
    await adminClient.from("video_edits").update({ assignee: editor_name }).eq("id", item.id);
    actions.push({ type: "refresh_data", scope: "editing_queue" });
    return { type: "tool_result", tool_use_id: block.id, content: `"${item.reel_title}" assigned to ${editor_name}.` };
  }

  if (block.name === "add_revision_notes") {
    const { client_name, item_title, notes } = block.input;
    const client = await resolveClient(adminClient, userId, client_name);
    if (!client) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };
    const item = await findEditItem(adminClient, client.id, item_title);
    if (!item) return { type: "tool_result", tool_use_id: block.id, content: `No editing item found matching "${item_title}" for ${client.name}` };
    const existing = item.revisions ? item.revisions + "\n---\n" : "";
    const timestamp = new Date().toISOString().slice(0, 10);
    await adminClient.from("video_edits").update({ revisions: `${existing}[${timestamp}] ${notes}` }).eq("id", item.id);
    actions.push({ type: "refresh_data", scope: "editing_queue" });
    return { type: "tool_result", tool_use_id: block.id, content: `Revision notes added to "${item.reel_title}".` };
  }

  if (block.name === "mark_post_published") {
    const { client_name, item_title } = block.input;
    const client = await resolveClient(adminClient, userId, client_name);
    if (!client) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };
    const item = await findEditItem(adminClient, client.id, item_title);
    if (!item) return { type: "tool_result", tool_use_id: block.id, content: `No item found matching "${item_title}" for ${client.name}` };
    await adminClient.from("video_edits").update({ post_status: "Published" }).eq("id", item.id);
    actions.push({ type: "refresh_data", scope: "editing_queue" });
    actions.push({ type: "refresh_data", scope: "calendar" });
    return { type: "tool_result", tool_use_id: block.id, content: `"${item.reel_title}" marked as Published.` };
  }

  if (block.name === "reschedule_post") {
    const { client_name, title, new_date } = block.input;
    const client = await resolveClient(adminClient, userId, client_name);
    if (!client) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };
    const item = await findEditItem(adminClient, client.id, title);
    if (!item) return { type: "tool_result", tool_use_id: block.id, content: `No post found matching "${title}" for ${client.name}` };
    await adminClient.from("video_edits").update({ schedule_date: new_date }).eq("id", item.id);
    actions.push({ type: "refresh_data", scope: "calendar" });
    return { type: "tool_result", tool_use_id: block.id, content: `"${item.reel_title}" rescheduled to ${new_date}.` };
  }

  if (block.name === "generate_caption") {
    const { client_name, hook, platform = "instagram", cta_keyword } = block.input;
    const client = await resolveClient(adminClient, userId, client_name);
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
    return { type: "tool_result", tool_use_id: block.id, content: `Caption for "${client.name}" (${platform}):\n\n${caption}\n\n(This is a draft — copy it or ask me to adjust before saving.)` };
  }

  return null;
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/companion-chat/tools/editing.ts
git commit -m "feat(ai): add 6 editing/calendar tools — update_editing_status, assign_editor, add_revision_notes, mark_post_published, reschedule_post, generate_caption"
```

---

## Task 5: Wire all Wave 2 tools into index.ts

**Files:**
- Modify: `supabase/functions/companion-chat/index.ts`

- [ ] **Step 1: Add imports at the top of index.ts (after existing imports)**

```typescript
import { LEAD_TOOLS, handleLeadTool } from "./tools/leads.ts";
import { FINANCE_TOOLS, handleFinanceTool } from "./tools/finances.ts";
import { SCRIPT_TOOLS, handleScriptTool } from "./tools/scripts.ts";
import { EDITING_TOOLS, handleEditingTool } from "./tools/editing.ts";
```

- [ ] **Step 2: Extend the TOOLS array**

Find the closing `];` of the TOOLS array and add before it:

```typescript
  // Wave 2 tools
  ...LEAD_TOOLS,
  ...FINANCE_TOOLS,
  ...SCRIPT_TOOLS,
  ...EDITING_TOOLS,
```

- [ ] **Step 3: Add module handlers to the tool loop**

In the tool-use loop, after all existing `if (block.name === "...")` handler blocks (just before the closing `}` of the `for (const block of toolUseBlocks)` loop), add:

```typescript
// Wave 2 module handlers — try each module in order, use first non-null result
const moduleCtx = { adminClient, userId: user.id, client, actions };
const moduleResult =
  await handleLeadTool(block, moduleCtx) ??
  await handleFinanceTool(block, moduleCtx) ??
  await handleScriptTool(block, moduleCtx) ??
  await handleEditingTool(block, moduleCtx);
if (moduleResult) toolResults.push(moduleResult);
```

- [ ] **Step 4: Update the system prompt tool list (rule 19)**

Append to the tool list in the system prompt:
```
get_leads, get_pipeline_summary, update_lead_status, add_lead_notes, create_lead, get_finances, log_transaction, get_revenue_vs_goal, update_script_status, mark_script_recorded, delete_script, update_editing_status, assign_editor, add_revision_notes, mark_post_published, reschedule_post, generate_caption
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/companion-chat/index.ts
git commit -m "feat(ai): wire Wave 2 tools into companion-chat (leads, finances, scripts, editing/calendar)"
```

---

## Task 6: Deploy and verify Wave 2

- [ ] **Step 1: Deploy**

```bash
npx supabase functions deploy companion-chat
```

- [ ] **Step 2: Test leads**

Open the Drawer and type: `how many leads does [client name] have?`
Expected: AI calls `get_pipeline_summary` and returns a count breakdown.

Type: `create a lead named John Smith for [client name] with email john@test.com`
Expected: AI calls `create_lead`, lead appears in Lead Tracker without page reload.

- [ ] **Step 3: Test finances**

Type: `log that client X paid $2,500 for SMMA`
Expected: AI calls `log_transaction`, transaction appears in Finances page without reload.

Type: `how are we doing financially this month?`
Expected: AI calls `get_finances` and returns income/expense breakdown.

- [ ] **Step 4: Test script lifecycle**

Type: `mark [script title] as recorded for [client name]`
Expected: AI calls `mark_script_recorded`, script status updates in Scripts page.

- [ ] **Step 5: Test editing queue**

Type: `assign [editor name] to [video title] for [client name]`
Expected: AI calls `assign_editor`, editing queue updates without reload.

- [ ] **Step 6: Test caption generation**

Type: `generate a caption for [client name] — hook: "I went from 0 to 100 clients in 6 months"`
Expected: AI calls `generate_caption` and returns caption text (does NOT auto-save).
