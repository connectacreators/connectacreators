// supabase/functions/companion-chat/tools/finances.ts
import type { ToolContext, ToolDef, ToolResult } from "./types.ts";
import { logAnthropicUsage } from "../../_shared/log-anthropic-usage.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// Declared before FINANCE_TOOLS because a tool description interpolates
// them — a `const` below would still be in the temporal dead zone when this
// module-level array literal is evaluated.
const INCOME_CATEGORIES = ["SMMA", "Bi-Weekly Fee", "One-Time Project", "Other Income"];
const EXPENSE_CATEGORIES = ["Subscriptions", "Ad Spend", "Travel", "Food & Meals", "Contractors", "Software", "Payroll", "Other"];

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
  {
    name: "list_recurring_subscriptions",
    description:
      "List recurring income and expense subscriptions — the monthly/annual TEMPLATES that auto-generate a transaction every period (retainers, software, payroll), not the individual charges. Use for 'what am I paying monthly?', 'what are my retainers?', 'what recurring revenue do we have?', and ALWAYS before update_recurring_subscription or cancel_recurring_subscription so you have the right subscription_id.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", description: "Filter to 'income' or 'expense'. Omit for both." },
        include_ended: { type: "boolean", description: "Include already-cancelled subscriptions (default false)." },
      },
      required: [],
    },
  },
  {
    name: "update_recurring_subscription",
    description:
      "Change a recurring subscription going forward — e.g. 'raise Dr Calvin's retainer to 4500', 'move the Gusto charge to the 15th'. Edits the TEMPLATE, so every month generated from now on uses the new values. Get subscription_id from list_recurring_subscriptions first. IMPORTANT: by default this does NOT touch months already generated (including the current one) — pass also_update_current_month:true when the user means the change starts this month, which is usually what 'change it to X' means for a retainer. State clearly in your reply which months are affected.",
    input_schema: {
      type: "object",
      properties: {
        subscription_id: { type: "string", description: "From list_recurring_subscriptions." },
        amount: { type: "number", description: "New recurring amount." },
        vendor: { type: "string", description: "New vendor name." },
        client: { type: "string", description: "New client name." },
        category: { type: "string", description: `One of: ${[...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES].join(", ")}` },
        description: { type: "string", description: "New description." },
        day_of_month: { type: "number", description: "Day it charges, 1–31." },
        interval: { type: "string", description: "'monthly' or 'annual'." },
        also_update_current_month: { type: "boolean", description: "Also rewrite this month's already-generated transaction (default false)." },
      },
      required: ["subscription_id"],
    },
  },
  {
    name: "cancel_recurring_subscription",
    description:
      "Stop a recurring subscription so it stops generating charges — 'cancel Zapier', 'Dr Calvin churned, stop the retainer'. Also clears already-generated transactions from the stop month onward, so future months don't keep showing it. Get subscription_id from list_recurring_subscriptions first. This is NOT how you delete a single month's charge — for that use the Finances page; cancelling ends the whole subscription.",
    input_schema: {
      type: "object",
      properties: {
        subscription_id: { type: "string", description: "From list_recurring_subscriptions." },
        from_month: { type: "string", description: "YYYY-MM to stop from, inclusive (default: current month)." },
      },
      required: ["subscription_id"],
    },
  },
];

async function callHaikuForParsing(raw: string, today: string, adminClient?: SupabaseClient, userId?: string): Promise<{ amount: number; type: "income" | "expense"; category: string; description: string } | null> {
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
  if (json?.usage) logAnthropicUsage(adminClient ?? null, {
    functionName: "companion-chat/tools/finances", model: "claude-haiku-4-5-20251001",
    usage: json.usage, userId: userId ?? null, metadata: { tool: "log_transaction" },
  });
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

    // Markdown table output — easier for the model to scan and quote back.
    const fmt = (n: number) => "$" + n.toLocaleString();
    const incomeRows = Object.entries(incomeByCat)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, amt]) => `| Income | ${cat} | ${fmt(amt)} |`);
    const expenseRows = Object.entries(expenseByCat)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, amt]) => `| Expense | ${cat} | ${fmt(amt)} |`);
    const table = [
      `${month}/${year} — ${txns.length} transactions`,
      "",
      "| Type | Category | Amount |",
      "|---|---|---|",
      ...incomeRows,
      ...expenseRows,
      "",
      `Income total: ${fmt(totalIncome)}`,
      `Expense total: ${fmt(totalExpenses)}`,
      `Net: ${fmt(net)}`,
    ];
    return { type: "tool_result", tool_use_id: block.id, content: table.join("\n") };
  }

  if (block.name === "log_transaction") {
    const { raw, date } = block.input;
    const today = date ?? new Date().toISOString().slice(0, 10);

    const parsed = await callHaikuForParsing(raw, today, adminClient, userId);
    if (!parsed || !parsed.amount || !parsed.type || !parsed.category) {
      return { type: "tool_result", tool_use_id: block.id, content: `Could not parse transaction from: "${raw}". Please be more specific about the amount and type.` };
    }
    // Validation: amount must be a positive finite number, type must be one of
    // {income, expense}. Reject the row entirely if either is wrong rather than
    // silently writing garbage to finance_transactions.
    const amountNum = Number(parsed.amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return { type: "tool_result", tool_use_id: block.id, content: `Refused: amount must be a positive number, got "${parsed.amount}".` };
    }
    if (parsed.type !== "income" && parsed.type !== "expense") {
      return { type: "tool_result", tool_use_id: block.id, content: `Refused: type must be "income" or "expense", got "${parsed.type}".` };
    }

    const { error } = await adminClient.from("finance_transactions").insert({
      user_id: userId,
      amount: Math.round(amountNum * 100) / 100,
      type: parsed.type,
      category: parsed.category,
      description: parsed.description ?? raw.slice(0, 100),
      date: today,
    });
    if (error) return { type: "tool_result", tool_use_id: block.id, content: `Failed to log transaction: ${error.message}` };

    actions.push({ type: "refresh_data", scope: "finances" });
    return { type: "tool_result", tool_use_id: block.id, content: `Logged: ${parsed.type === "income" ? "+" : "-"}$${parsed.amount} (${parsed.category}) — ${parsed.description}` };
  }

  if (block.name === "list_recurring_subscriptions") {
    const { type, include_ended = false } = block.input as { type?: string; include_ended?: boolean };
    let q = adminClient
      .from("finance_recurring_subscriptions")
      .select("id, type, vendor, client, category, description, amount, interval, day_of_month, start_month, end_month")
      .eq("user_id", userId);
    if (type === "income" || type === "expense") q = q.eq("type", type);
    if (!include_ended) q = q.is("end_month", null);
    const { data, error } = await q.order("amount", { ascending: false });
    if (error) {
      return { type: "tool_result", tool_use_id: block.id, content: `Couldn't read subscriptions: ${error.message}` };
    }
    const rows = (data ?? []) as any[];
    if (rows.length === 0) {
      return { type: "tool_result", tool_use_id: block.id, content: "No recurring subscriptions found." };
    }
    const lines = rows.map((r) => {
      const who = r.client || r.vendor || "(unnamed)";
      const ended = r.end_month ? ` [ENDED after ${r.end_month}]` : "";
      return `${r.id} · ${r.type} · ${who} · $${Number(r.amount).toLocaleString()} ${r.interval} on day ${r.day_of_month} · ${r.category} · since ${r.start_month}${ended}`;
    });
    const monthlyIncome = rows
      .filter((r) => r.type === "income" && r.interval === "monthly" && !r.end_month)
      .reduce((s, r) => s + Number(r.amount), 0);
    const monthlyExpense = rows
      .filter((r) => r.type === "expense" && r.interval === "monthly" && !r.end_month)
      .reduce((s, r) => s + Number(r.amount), 0);
    return {
      type: "tool_result",
      tool_use_id: block.id,
      content: `Recurring subscriptions (id · type · who · amount · schedule · category):\n${lines.join("\n")}\n\nActive monthly recurring income: $${monthlyIncome.toLocaleString()}; monthly recurring expense: $${monthlyExpense.toLocaleString()}.`,
    };
  }

  if (block.name === "update_recurring_subscription") {
    const {
      subscription_id, amount, vendor, client, category, description,
      day_of_month, interval, also_update_current_month = false,
    } = block.input as Record<string, any>;

    const { data: sub } = await adminClient
      .from("finance_recurring_subscriptions")
      .select("id, type, vendor, client, amount, category, interval, day_of_month")
      .eq("id", subscription_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!sub) {
      return { type: "tool_result", tool_use_id: block.id, content: "No such recurring subscription (check list_recurring_subscriptions for valid ids)." };
    }

    const allCats = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES];
    if (category && !allCats.includes(category)) {
      return { type: "tool_result", tool_use_id: block.id, content: `Invalid category "${category}". Use one of: ${allCats.join(", ")}` };
    }
    if (interval && interval !== "monthly" && interval !== "annual") {
      return { type: "tool_result", tool_use_id: block.id, content: `Invalid interval "${interval}" — use 'monthly' or 'annual'.` };
    }
    if (day_of_month !== undefined && (day_of_month < 1 || day_of_month > 31)) {
      return { type: "tool_result", tool_use_id: block.id, content: "day_of_month must be between 1 and 31." };
    }

    const patch: Record<string, unknown> = {};
    if (amount !== undefined) patch.amount = amount;
    if (vendor !== undefined) patch.vendor = vendor;
    if (client !== undefined) patch.client = client;
    if (description !== undefined) patch.description = description;
    if (day_of_month !== undefined) patch.day_of_month = day_of_month;
    if (interval !== undefined) patch.interval = interval;
    if (category !== undefined) {
      patch.category = category;
      patch.deductible_ratio = category === "Food & Meals" ? 0.5 : null;
    }
    if (Object.keys(patch).length === 0) {
      return { type: "tool_result", tool_use_id: block.id, content: "Nothing to change — pass at least one field." };
    }

    const { error: updErr } = await adminClient
      .from("finance_recurring_subscriptions")
      .update(patch)
      .eq("id", subscription_id);
    if (updErr) {
      return { type: "tool_result", tool_use_id: block.id, content: `Couldn't update subscription: ${updErr.message}` };
    }

    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    let currentMonthNote = `Future months only — ${month}'s already-generated charge is unchanged.`;
    if (also_update_current_month) {
      // Only fields that live on the transaction row; day_of_month/interval
      // are schedule settings with no per-transaction equivalent.
      const txPatch: Record<string, unknown> = {};
      if (amount !== undefined) {
        txPatch.amount = amount;
        txPatch.deductible_amount = (category ?? sub.category) === "Food & Meals" ? Number(amount) * 0.5 : null;
      }
      if (vendor !== undefined) txPatch.vendor = vendor;
      if (client !== undefined) txPatch.client = client;
      if (category !== undefined) txPatch.category = category;
      if (description !== undefined) txPatch.description = description;
      if (Object.keys(txPatch).length > 0) {
        const { error: txErr } = await adminClient
          .from("finance_transactions")
          .update(txPatch)
          .eq("recurring_subscription_id", subscription_id)
          .is("deleted_at", null)
          .gte("date", `${month}-01`);
        currentMonthNote = txErr
          ? `Template updated, but ${month}'s charge could not be: ${txErr.message}`
          : `Applied to ${month} onward.`;
      }
    }

    actions.push({ type: "refresh_data", scope: "finances" });
    const who = client ?? sub.client ?? vendor ?? sub.vendor ?? "subscription";
    const amountNote = amount !== undefined ? ` to $${Number(amount).toLocaleString()}` : "";
    return {
      type: "tool_result",
      tool_use_id: block.id,
      content: `Updated recurring ${sub.type} for ${who}${amountNote}. ${currentMonthNote}`,
    };
  }

  if (block.name === "cancel_recurring_subscription") {
    const { subscription_id, from_month } = block.input as { subscription_id: string; from_month?: string };
    const { data: sub } = await adminClient
      .from("finance_recurring_subscriptions")
      .select("id, type, vendor, client, amount")
      .eq("id", subscription_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!sub) {
      return { type: "tool_result", tool_use_id: block.id, content: "No such recurring subscription (check list_recurring_subscriptions for valid ids)." };
    }

    const now = new Date();
    const stopFrom = from_month && /^\d{4}-\d{2}$/.test(from_month)
      ? from_month
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    // end_month is INCLUSIVE in finance_generate_recurring, so stopping at
    // stopFrom means ending the month before it.
    const [sy, sm] = stopFrom.split("-").map(Number);
    const py = sm === 1 ? sy - 1 : sy;
    const pm = sm === 1 ? 12 : sm - 1;
    const endMonth = `${py}-${String(pm).padStart(2, "0")}`;

    const { error: endErr } = await adminClient
      .from("finance_recurring_subscriptions")
      .update({ end_month: endMonth })
      .eq("id", subscription_id);
    if (endErr) {
      return { type: "tool_result", tool_use_id: block.id, content: `Couldn't cancel: ${endErr.message}` };
    }
    const { error: cleanErr } = await adminClient
      .from("finance_transactions")
      .update({ deleted_at: new Date().toISOString() })
      .eq("recurring_subscription_id", subscription_id)
      .is("deleted_at", null)
      .gte("date", `${stopFrom}-01`);

    actions.push({ type: "refresh_data", scope: "finances" });
    const who = sub.client || sub.vendor || "subscription";
    return {
      type: "tool_result",
      tool_use_id: block.id,
      content: cleanErr
        ? `Cancelled ${who} from ${stopFrom}, but couldn't clear already-generated charges: ${cleanErr.message}`
        : `Cancelled the recurring ${sub.type} for ${who} — no charges from ${stopFrom} onward, and any already-generated ones from that month were removed.`,
    };
  }

  if (block.name === "get_revenue_vs_goal") {
    // Half-open [monthStart, nextMonthStart): finance_generate_recurring
    // materializes future-dated income rows whenever /finances is browsed
    // ahead, so an open-ended range reports months that haven't happened.
    // is_ar rows are invoiced-but-unpaid and deleted_at rows are soft
    // deletes — neither is collected revenue.
    const now = new Date();
    const ymd = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const monthStart = ymd(new Date(now.getFullYear(), now.getMonth(), 1));
    const nextMonthStart = ymd(new Date(now.getFullYear(), now.getMonth() + 1, 1));

    const [{ data: txns }, { data: clients }] = await Promise.all([
      adminClient.from("finance_transactions").select("amount, category, is_ar").eq("user_id", userId).eq("type", "income").is("deleted_at", null).gte("date", monthStart).lt("date", nextMonthStart),
      adminClient.from("clients").select("id, name").eq("user_id", userId),
    ]);

    const totalIncome = (txns ?? []).filter((t: any) => !t.is_ar).reduce((s: number, t: any) => s + Number(t.amount), 0);

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
