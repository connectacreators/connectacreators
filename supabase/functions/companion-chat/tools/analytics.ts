// supabase/functions/companion-chat/tools/analytics.ts
//
// Cross-cutting analytics & timeline tools that the audit flagged as obvious
// missing capabilities for an agency owner: which posts are underperforming,
// how do two clients compare, what changed in the last N days.
//
// All three are pure-read and respect URL-locked client identity via resolveClient.

import type { ToolContext, ToolDef, ToolResult } from "./types.ts";
import { resolveClient } from "./types.ts";

export const ANALYTICS_TOOLS: ToolDef[] = [
  {
    name: "get_post_performance",
    description:
      "Pull recent post engagement stats (views, likes, comments, outlier score) for a client based on the channel_username on their viral_videos rows. Use to answer 'which of my posts is underperforming?' or 'what's working this month?'. Returns up to 15 most recent posts.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string" },
        days_back: {
          type: "number",
          description: "How many days back to look. Default 30.",
        },
      },
      required: ["client_name"],
    },
  },
  {
    name: "compare_clients",
    description:
      "Side-by-side comparison of two clients' targets vs actuals for the current month: scripts, videos edited, posts scheduled, revenue. Use when the user asks 'how does X compare to Y' or 'who's behind / ahead this month?'.",
    input_schema: {
      type: "object",
      properties: {
        client_a: { type: "string" },
        client_b: { type: "string" },
      },
      required: ["client_a", "client_b"],
    },
  },
  {
    name: "get_recent_activity",
    description:
      "Flat timeline of what changed across the agency in the last N days: new scripts, leads, editing-queue updates, scheduled posts, contracts. Use when the user asks 'catch me up' or 'what happened this week?'. Up to 30 events, newest first.",
    input_schema: {
      type: "object",
      properties: {
        days_back: {
          type: "number",
          description: "How many days back to scan. Default 7.",
        },
        client_name: {
          type: "string",
          description: "Optional — restrict to one client.",
        },
      },
    },
  },
];

export async function handleAnalyticsTool(
  block: { id: string; name: string; input: Record<string, any> },
  ctx: ToolContext,
): Promise<ToolResult | null> {
  const { adminClient, userId } = ctx;

  if (block.name === "get_post_performance") {
    const { client_name, days_back = 30 } = block.input;
    const client = await resolveClient(ctx, client_name);
    if (!client) {
      return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };
    }
    const { data: clientRow } = await adminClient
      .from("clients")
      .select("onboarding_data")
      .eq("id", client.id)
      .maybeSingle();
    const handle = (clientRow?.onboarding_data as any)?.instagram?.replace(/^@/, "");
    if (!handle) {
      return {
        type: "tool_result",
        tool_use_id: block.id,
        content: `${client.name} has no Instagram handle in their onboarding profile, so I can't pull post performance. Add the handle first.`,
      };
    }
    const cutoff = new Date(Date.now() - days_back * 86_400_000).toISOString();
    const { data: posts } = await adminClient
      .from("viral_videos")
      .select("caption, views_count, likes_count, comments_count, engagement_rate, outlier_score, posted_at, video_url")
      .ilike("channel_username", handle)
      .gte("posted_at", cutoff)
      .order("posted_at", { ascending: false })
      .limit(15);
    if (!posts || posts.length === 0) {
      return {
        type: "tool_result",
        tool_use_id: block.id,
        content: `No posts for @${handle} in the last ${days_back} days.`,
      };
    }
    const sorted = [...posts].sort((a, b) => (a.outlier_score ?? 0) - (b.outlier_score ?? 0));
    const worst = sorted[0];
    const best = sorted[sorted.length - 1];
    const lines = posts.map((p, i) => {
      const v = (p.views_count ?? 0).toLocaleString();
      const eng = p.engagement_rate ? `${p.engagement_rate}%` : "?";
      const out = p.outlier_score?.toFixed(1) ?? "?";
      const date = p.posted_at?.slice(0, 10) ?? "?";
      const cap = (p.caption ?? "").slice(0, 60);
      return `${i + 1}. [${date}] ${v} views · ${eng} eng · ${out}x outlier — ${cap}`;
    });
    const summary = `${posts.length} posts in last ${days_back} days for @${handle}. Best: ${best.outlier_score?.toFixed(1)}x outlier. Worst: ${worst.outlier_score?.toFixed(1)}x outlier.`;
    return {
      type: "tool_result",
      tool_use_id: block.id,
      content: `${summary}\n\n${lines.join("\n")}`,
    };
  }

  if (block.name === "compare_clients") {
    const { client_a, client_b } = block.input;
    const [ca, cb] = await Promise.all([resolveClient(ctx, client_a), resolveClient(ctx, client_b)]);
    if (!ca) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_a}"` };
    if (!cb) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_b}"` };
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const iso = monthStart.toISOString();
    const today = new Date().toISOString().slice(0, 10);
    async function loadFor(c: { id: string; name: string }) {
      const [strat, scripts, videos, posts] = await Promise.all([
        adminClient.from("client_strategies").select("scripts_per_month, videos_edited_per_month, posts_per_month, monthly_revenue_goal, monthly_revenue_actual").eq("client_id", c.id).maybeSingle(),
        adminClient.from("scripts").select("id", { count: "exact", head: true }).eq("client_id", c.id).gte("created_at", iso),
        adminClient.from("video_edits").select("id", { count: "exact", head: true }).eq("client_id", c.id).eq("status", "Done").is("deleted_at", null).gte("created_at", iso),
        adminClient.from("video_edits").select("id", { count: "exact", head: true }).eq("client_id", c.id).gte("schedule_date", today.slice(0, 7) + "-01").is("deleted_at", null),
      ]);
      const s = strat.data ?? {} as any;
      return {
        scriptsActual: scripts.count ?? 0,
        scriptsGoal: s.scripts_per_month ?? 0,
        videosActual: videos.count ?? 0,
        videosGoal: s.videos_edited_per_month ?? 0,
        postsActual: posts.count ?? 0,
        postsGoal: s.posts_per_month ?? 0,
        revActual: s.monthly_revenue_actual ?? 0,
        revGoal: s.monthly_revenue_goal ?? 0,
      };
    }
    const [a, b] = await Promise.all([loadFor(ca), loadFor(cb)]);
    const fmt = (n: number) => n.toLocaleString();
    const pct = (got: number, goal: number) => goal > 0 ? Math.round((got / goal) * 100) + "%" : "—";
    const block_ = (label: string, name: string, x: typeof a) =>
      `${label} ${name}\n  Scripts: ${x.scriptsActual}/${x.scriptsGoal} (${pct(x.scriptsActual, x.scriptsGoal)})\n  Videos edited: ${x.videosActual}/${x.videosGoal} (${pct(x.videosActual, x.videosGoal)})\n  Posts scheduled: ${x.postsActual}/${x.postsGoal} (${pct(x.postsActual, x.postsGoal)})\n  Revenue: $${fmt(x.revActual)} / $${fmt(x.revGoal)} (${pct(x.revActual, x.revGoal)})`;
    return {
      type: "tool_result",
      tool_use_id: block.id,
      content: `This month so far:\n\n${block_("A.", ca.name, a)}\n\n${block_("B.", cb.name, b)}`,
    };
  }

  if (block.name === "get_recent_activity") {
    const { days_back = 7, client_name } = block.input;
    const cutoff = new Date(Date.now() - days_back * 86_400_000).toISOString();
    let scopedClientId: string | null = null;
    if (client_name) {
      const c = await resolveClient(ctx, client_name);
      if (!c) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };
      scopedClientId = c.id;
    }
    // Build user_id-scoped client filter so we don't leak other tenants' rows.
    const { data: userClients } = await adminClient.from("clients").select("id, name").eq("user_id", userId);
    const clientIds = (userClients ?? []).map((c: any) => c.id);
    const idLookup = Object.fromEntries((userClients ?? []).map((c: any) => [c.id, c.name]));
    const allowed = scopedClientId ? [scopedClientId] : clientIds;
    if (allowed.length === 0) {
      return { type: "tool_result", tool_use_id: block.id, content: "No clients to scan." };
    }
    const [scripts, leads, edits, contracts] = await Promise.all([
      adminClient.from("scripts").select("client_id, idea_ganadora, title, status, created_at").in("client_id", allowed).gte("created_at", cutoff).order("created_at", { ascending: false }).limit(15),
      adminClient.from("leads").select("client_id, name, status, created_at").in("client_id", allowed).gte("created_at", cutoff).order("created_at", { ascending: false }).limit(15),
      adminClient.from("video_edits").select("client_id, reel_title, status, created_at").in("client_id", allowed).is("deleted_at", null).gte("created_at", cutoff).order("created_at", { ascending: false }).limit(15),
      adminClient.from("contracts").select("client_id, title, status, created_at").in("client_id", allowed).gte("created_at", cutoff).order("created_at", { ascending: false }).limit(10),
    ]);
    type Event = { ts: string; client: string; line: string };
    const events: Event[] = [];
    for (const s of scripts.data ?? []) events.push({ ts: s.created_at, client: idLookup[s.client_id] ?? "?", line: `script "${s.idea_ganadora ?? s.title ?? "untitled"}" (${s.status ?? "draft"})` });
    for (const l of leads.data ?? []) events.push({ ts: l.created_at, client: idLookup[l.client_id] ?? "?", line: `new lead ${l.name} (${l.status ?? "new"})` });
    for (const e of edits.data ?? []) events.push({ ts: e.created_at, client: idLookup[e.client_id] ?? "?", line: `edit "${e.reel_title ?? "untitled"}" (${e.status ?? "?"})` });
    for (const c of contracts.data ?? []) events.push({ ts: c.created_at, client: idLookup[c.client_id] ?? "?", line: `contract "${c.title ?? "untitled"}" (${c.status ?? "draft"})` });
    events.sort((a, b) => b.ts.localeCompare(a.ts));
    if (events.length === 0) {
      return { type: "tool_result", tool_use_id: block.id, content: `Nothing new in the last ${days_back} days${client_name ? ` for ${client_name}` : ""}.` };
    }
    const top = events.slice(0, 30);
    const lines = top.map((e) => `[${e.ts.slice(0, 10)}] ${e.client} — ${e.line}`);
    return {
      type: "tool_result",
      tool_use_id: block.id,
      content: `${events.length} event(s) in last ${days_back} days${client_name ? ` for ${client_name}` : ""}:\n${lines.join("\n")}`,
    };
  }

  return null;
}
