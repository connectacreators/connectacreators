import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const INCOME_CATEGORIES = ["SMMA", "Bi-Weekly Fee", "One-Time Project", "Other Income"];
const EXPENSE_CATEGORIES = [
  "Subscriptions", "Ad Spend", "Travel", "Food & Meals",
  "Contractors", "Software", "Payroll", "Other",
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // ── Admin-only gate (JWT-validated inside the function) ────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const authed = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: { user }, error: userError } = await authed.auth.getUser();
  if (userError || !user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();

  if (!roleRow) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  // ── Parse request ──────────────────────────────────────────────────────────
  let raw = "";
  let today = new Date().toISOString().slice(0, 10);
  try {
    const body = await req.json();
    raw = typeof body?.raw === "string" ? body.raw.trim() : "";
    if (typeof body?.today === "string") today = body.today;
  } catch { /* fall through */ }

  if (!raw) {
    return jsonResponse({ error: "empty_input" }, 400);
  }

  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) {
    return jsonResponse({ error: "ai_unconfigured" }, 500);
  }

  // ── Claude call with structured tool output ────────────────────────────────
  const systemPrompt = `You are a finance assistant for Connecta Creators, an SMMA agency based in Utah.
Parse the user's message into a single financial transaction.

Rules:
- Food/meals → category "Food & Meals"; set deductible_amount to amount/2; set needsClarification=true with a question confirming business purpose (e.g. "Was this a team/business meal?") unless the message already makes it obvious.
- If a client is named (e.g. Saratoga, Dr Calvin, IOTA Media, Master Construction, ZiguFit), extract it into the "client" field.
- For expenses, extract vendor (software/app name, store, etc.).
- date defaults to the "today" ISO value the caller supplied unless the user explicitly mentions a different date.
- If the entry is ambiguous (e.g. can't tell income vs expense, missing amount), set needsClarification=true and fill clarificationQuestion + clarificationOptions (2–3 short strings).
- Amounts must be positive numbers. If no amount can be extracted, set needsClarification and ask for it.
- Never invent data. Leave optional fields null if unknown.`;

  const userMessage = `today=${today}\n\nEntry: ${raw}`;

  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
        tools: [{
          name: "log_transaction",
          description: "Return the parsed finance transaction.",
          input_schema: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["income", "expense"] },
              amount: { type: "number" },
              vendor: { type: ["string", "null"] },
              client: { type: ["string", "null"] },
              category: {
                type: "string",
                enum: [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES],
              },
              description: { type: ["string", "null"] },
              date: { type: "string", description: "ISO date (YYYY-MM-DD)" },
              payment_method: { type: ["string", "null"] },
              is_ar: { type: "boolean", description: "true if income is not yet collected" },
              deductible_amount: {
                type: ["number", "null"],
                description: "50% of amount for Food & Meals, otherwise null",
              },
              needsClarification: { type: "boolean" },
              clarificationQuestion: { type: ["string", "null"] },
              clarificationOptions: {
                type: ["array", "null"],
                items: { type: "string" },
              },
            },
            required: ["type", "amount", "category", "date", "needsClarification"],
            additionalProperties: false,
          },
        }],
        tool_choice: { type: "tool", name: "log_transaction" },
      }),
    });
  } catch (e) {
    console.error("Anthropic fetch failed", e);
    return jsonResponse({ error: "ai_unreachable" }, 502);
  }

  if (!response.ok) {
    const text = await response.text();
    console.error("Anthropic error", response.status, text);
    if (response.status === 429) return jsonResponse({ error: "rate_limit" }, 429);
    return jsonResponse({ error: "ai_error" }, 502);
  }

  const data = await response.json();
  const toolUse = (data.content ?? []).find((b: any) => b.type === "tool_use");
  if (!toolUse?.input) {
    console.error("No tool_use in response", JSON.stringify(data).slice(0, 500));
    return jsonResponse({ error: "unparseable" }, 200);
  }

  const parsed = toolUse.input as Record<string, unknown>;
  // Normalise nulls → undefined so the client JSON stays tidy.
  for (const k of Object.keys(parsed)) {
    if (parsed[k] === null) delete parsed[k];
  }

  return jsonResponse({ parsed });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
