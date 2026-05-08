// supabase/functions/companion-chat/tools/intelligence.ts
import type { ToolContext, ToolDef, ToolResult } from "./types.ts";
import { resolveClient } from "./types.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export const INTELLIGENCE_TOOLS: ToolDef[] = [
  {
    name: "get_all_clients_status",
    description: "Get a status snapshot for ALL clients at once: scripts, videos, and posts this month vs their targets. Returns them sorted by who is most behind. Use when the user asks 'which clients are stalled?', 'how are all my clients doing?', or 'what needs attention?'",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_weekly_priorities",
    description: "Get a ranked action list of what to work on right now across all clients: who has no scripts this month, which scripts are waiting to be recorded, what's in review, and what posts are due this week. The definitive answer to 'what should I do today?'",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_contracts",
    description: "View contracts. If client_name is provided, shows that client's contracts. Otherwise shows all contracts.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "Optional — if omitted, returns all contracts" },
      },
      required: [],
    },
  },
  {
    name: "send_contract",
    description: "Send a contract to a client via email. Call get_contracts first to find the contract_id. In ask/plan mode always confirm before sending.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string" },
        contract_id: { type: "string", description: "UUID of the contract (get from get_contracts first)" },
      },
      required: ["client_name", "contract_id"],
    },
  },
  {
    name: "get_open_alerts",
    description: "Read the proactive alerts the system has surfaced for this user: stuck clients (no posts 14d+), approved scripts not recorded after 7d, video edits past deadline, leads with overdue follow-ups, clients behind monthly revenue goal. Call this when the user opens a fresh conversation, asks 'what needs my attention?', or any time you want to coach them on what's most urgent. Returns up to 10 alerts ranked by severity then recency. Mention the most relevant 1-2 in your response — don't dump the whole list.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "dismiss_alert",
    description: "Mark a specific alert as handled or no longer relevant. Use after the user has addressed the issue or explicitly said they don't want to see it again. Pass the alert id from get_open_alerts.",
    input_schema: {
      type: "object",
      properties: {
        alert_id: { type: "string", description: "UUID of the alert to dismiss" },
      },
      required: ["alert_id"],
    },
  },
];

export async function handleIntelligenceTool(
  block: { id: string; name: string; input: Record<string, any> },
  ctx: ToolContext,
): Promise<ToolResult | null> {
  const { adminClient, userId, actions } = ctx;

  if (block.name === "get_all_clients_status") {
    const { data: clients } = await adminClient
      .from("clients")
      .select("id, name")
      .eq("user_id", userId)
      .order("name");
    if (!clients || clients.length === 0) return { type: "tool_result", tool_use_id: block.id, content: "No clients found." };

    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

    const rows = await Promise.all(clients.map(async (c: any) => {
      const [{ data: strat }, { count: scripts }, { count: videos }, { count: posts }, { data: lastScript }] = await Promise.all([
        adminClient.from("client_strategies").select("scripts_per_month, videos_edited_per_month, posts_per_month").eq("client_id", c.id).maybeSingle(),
        adminClient.from("scripts").select("id", { count: "exact", head: true }).eq("client_id", c.id).gte("created_at", monthStart),
        adminClient.from("video_edits").select("id", { count: "exact", head: true }).eq("client_id", c.id).eq("status", "Done").is("deleted_at", null).gte("created_at", monthStart),
        adminClient.from("video_edits").select("id", { count: "exact", head: true }).eq("client_id", c.id).gte("schedule_date", monthStart.slice(0, 10)).is("deleted_at", null),
        adminClient.from("scripts").select("created_at").eq("client_id", c.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      return {
        name: c.name,
        scriptsTarget: strat?.scripts_per_month ?? 0,
        scripts: scripts ?? 0,
        videosTarget: strat?.videos_edited_per_month ?? 0,
        videos: videos ?? 0,
        postsTarget: strat?.posts_per_month ?? 0,
        posts: posts ?? 0,
        lastScript: lastScript?.created_at?.slice(0, 10) ?? "never",
      };
    }));

    // Sort by most behind (fewest scripts as primary signal)
    rows.sort((a, b) => {
      const aGap = (a.scriptsTarget - a.scripts) + (a.videosTarget - a.videos);
      const bGap = (b.scriptsTarget - b.scripts) + (b.videosTarget - b.videos);
      return bGap - aGap;
    });

    const lines = rows.map(r => {
      // No emojis — rule 2 of the system prompt forbids them, and the model
      // gets confused when tool output contradicts its own output rules.
      const stalled = r.scripts === 0 && r.scriptsTarget > 0 ? " [STALLED — no scripts this month]" : "";
      return `${r.name}: ${r.scripts}/${r.scriptsTarget} scripts, ${r.videos}/${r.videosTarget} videos, ${r.posts}/${r.postsTarget} posts${stalled} (last script: ${r.lastScript})`;
    });

    return { type: "tool_result", tool_use_id: block.id, content: `All clients — ${now.toLocaleString("en-US", { month: "long" })} ${now.getFullYear()}:\n${lines.join("\n")}` };
  }

  if (block.name === "get_weekly_priorities") {
    const { data: clients } = await adminClient.from("clients").select("id, name").eq("user_id", userId);
    if (!clients || clients.length === 0) return { type: "tool_result", tool_use_id: block.id, content: "No clients found." };

    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const weekEnd = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);

    const priorities: string[] = [];

    for (const c of clients) {
      const [{ count: scripts }, { count: scriptTarget }, { data: toRecord }, { data: inReview }, { data: dueSoon }] = await Promise.all([
        adminClient.from("scripts").select("id", { count: "exact", head: true }).eq("client_id", c.id).gte("created_at", monthStart),
        adminClient.from("client_strategies").select("scripts_per_month").eq("client_id", c.id).maybeSingle().then(r => ({ count: r.data?.scripts_per_month ?? 0 })),
        adminClient.from("scripts").select("idea_ganadora, title").eq("client_id", c.id).eq("status", "Approved").eq("grabado", false).limit(3),
        adminClient.from("video_edits").select("reel_title").eq("client_id", c.id).eq("status", "In review").is("deleted_at", null).limit(3),
        adminClient.from("video_edits").select("reel_title, schedule_date").eq("client_id", c.id).gte("schedule_date", now.toISOString().slice(0, 10)).lte("schedule_date", weekEnd).neq("post_status", "Published").is("deleted_at", null).limit(3),
      ]);

      if ((scripts ?? 0) === 0 && (scriptTarget as number) > 0) {
        priorities.push(`🔴 ${c.name} — no scripts this month (target: ${scriptTarget})`);
      }
      for (const s of toRecord ?? []) {
        priorities.push(`🟡 ${c.name} — "${s.idea_ganadora ?? s.title}" approved, not recorded yet`);
      }
      for (const r of inReview ?? []) {
        priorities.push(`🔵 ${c.name} — "${r.reel_title}" in review`);
      }
      for (const d of dueSoon ?? []) {
        priorities.push(`📅 ${c.name} — "${d.reel_title}" due ${d.schedule_date}`);
      }
    }

    if (priorities.length === 0) return { type: "tool_result", tool_use_id: block.id, content: "Everything looks on track — no urgent items." };
    return { type: "tool_result", tool_use_id: block.id, content: `Weekly priorities:\n${priorities.join("\n")}` };
  }

  if (block.name === "get_contracts") {
    const { client_name } = block.input;
    let query = adminClient.from("contracts").select("id, title, status, created_at, signed_at, client_id");

    if (client_name) {
      const clientRow = await resolveClient(ctx, client_name);
      if (!clientRow) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };
      query = query.eq("client_id", clientRow.id);
    }

    const { data: contracts } = await query.order("created_at", { ascending: false }).limit(20);
    if (!contracts || contracts.length === 0) return { type: "tool_result", tool_use_id: block.id, content: "No contracts found." };

    const lines = contracts.map((c: any) =>
      `[${c.id}] ${c.title ?? "Untitled"} — ${c.status ?? "draft"}${c.signed_at ? ` (signed ${c.signed_at.slice(0, 10)})` : ""}  created: ${c.created_at?.slice(0, 10)}`
    );
    return { type: "tool_result", tool_use_id: block.id, content: `${contracts.length} contract(s):\n${lines.join("\n")}` };
  }

  if (block.name === "send_contract") {
    const { client_name, contract_id } = block.input;
    const clientRow = await resolveClient(ctx, client_name);
    if (!clientRow) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };

    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-contract`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ contract_id }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { type: "tool_result", tool_use_id: block.id, content: `Failed to send contract: ${json.error ?? `HTTP ${res.status}`}` };

    actions.push({ type: "refresh_data", scope: "contracts" });
    return { type: "tool_result", tool_use_id: block.id, content: `Contract sent to ${clientRow.name}.` };
  }

  if (block.name === "get_open_alerts") {
    // Admins see alerts across the whole agency; non-admins see alerts
    // scoped to clients they own or subscribe to. The companion_alerts
    // table is keyed on user_id (the client owner), so for admins we drop
    // the user_id filter; for subscribers we filter by accessibleClientIds.
    let q = ctx.adminClient
      .from("companion_alerts")
      .select("id, kind, severity, title, body, client_id, created_at")
      .is("dismissed_at", null);
    if (!ctx.isAdmin) {
      const allowed = ctx.accessibleClientIds ?? [];
      if (allowed.length === 0) return { type: "tool_result", tool_use_id: block.id, content: "No open alerts." };
      // Either the alert directly targets this user, or it concerns a
      // client they subscribe to.
      q = q.or(`user_id.eq.${ctx.userId},client_id.in.(${allowed.join(",")})`);
    }
    // severity sort: high → normal → low. Postgres orders text alphabetically
    // and "high" < "low" < "normal", so we have to compute a numeric rank
    // client-side. Fetch a generous window and sort in JS.
    const { data: alerts } = await q.order("created_at", { ascending: false }).limit(50);
    if (!alerts || alerts.length === 0) {
      return { type: "tool_result", tool_use_id: block.id, content: "No open alerts. Everything looks on track." };
    }
    const sevRank: Record<string, number> = { high: 0, normal: 1, low: 2 };
    const sorted = [...alerts]
      .sort((a, b) => (sevRank[a.severity] ?? 1) - (sevRank[b.severity] ?? 1))
      .slice(0, 10);
    const lines = sorted.map((a) =>
      `[${a.severity}] (id: ${a.id}) ${a.title}${a.body ? "\n  " + a.body : ""}`,
    );
    return {
      type: "tool_result",
      tool_use_id: block.id,
      content: `${alerts.length} open alert(s); top ${sorted.length}:\n\n${lines.join("\n\n")}`,
    };
  }

  if (block.name === "dismiss_alert") {
    const { alert_id } = block.input;
    if (!alert_id) {
      return { type: "tool_result", tool_use_id: block.id, content: "Refused: alert_id is required." };
    }
    // Build update: set dismissed_at = now(); ownership filter for non-admins.
    let q = ctx.adminClient
      .from("companion_alerts")
      .update({ dismissed_at: new Date().toISOString() })
      .eq("id", alert_id);
    if (!ctx.isAdmin) {
      const allowed = ctx.accessibleClientIds ?? [];
      if (allowed.length === 0) {
        return { type: "tool_result", tool_use_id: block.id, content: "No alerts you can dismiss." };
      }
      q = q.or(`user_id.eq.${ctx.userId},client_id.in.(${allowed.join(",")})`);
    }
    const { data, error } = await q.select("id").maybeSingle();
    if (error) return { type: "tool_result", tool_use_id: block.id, content: `Failed to dismiss: ${error.message}` };
    if (!data) return { type: "tool_result", tool_use_id: block.id, content: `Alert ${alert_id} not found or not accessible.` };
    return { type: "tool_result", tool_use_id: block.id, content: `Alert dismissed.` };
  }

  return null;
}
