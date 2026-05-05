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
  if (!res.ok) return null;
  const json = await res.json().catch(() => ({}));
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
    const totalIncome = income.reduce((s: number, t: any) => s + (Number(t.amount) || 0), 0);
    const totalExpenses = expenses.reduce((s: number, t: any) => s + (Number(t.amount) || 0), 0);
    const net = totalIncome - totalExpenses;

    const incomeByCat: Record<string, number> = {};
    for (const t of income) incomeByCat[t.category] = (incomeByCat[t.category] ?? 0) + (Number(t.amount) || 0);
    const expenseByCat: Record<string, number> = {};
    for (const t of expenses) expenseByCat[t.category] = (expenseByCat[t.category] ?? 0) + (Number(t.amount) || 0);

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

    const totalIncome = (txns ?? []).reduce((s: number, t: any) => s + (Number(t.amount) || 0), 0);

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
