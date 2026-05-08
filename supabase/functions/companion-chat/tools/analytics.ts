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
  {
    name: "generate_week_plan",
    description:
      "Draft a 7-day content plan for a client sized to their strategy targets (mix of reach/trust/convert) and grounded in their onboarding voice. Returns a numbered list of post ideas with proposed dates and content type. The user can then say 'schedule them' and you call bulk_schedule_posts with the items. Use this for the weekly-planning workflow on Sundays/Mondays.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string" },
        start_date: {
          type: "string",
          description: "Optional YYYY-MM-DD start date for the 7-day plan. Defaults to tomorrow.",
        },
        posts: {
          type: "number",
          description: "How many posts to plan. Default 5 (matches a typical 5-7 reels/week cadence).",
        },
      },
      required: ["client_name"],
    },
  },
  {
    name: "get_morning_brief",
    description:
      "One-shot 'what changed since I logged off' summary. Returns: scripts created in last 24h, leads added, edits status-changed, posts published, contracts signed — plus a count of open alerts. Call this proactively when the user opens a fresh /ai conversation with a vague greeting like 'morning', 'hey', 'what's up'. Don't dump the whole thing — pick the 1-2 things that actually need their attention.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_overdue_items",
    description:
      "Cross-cutting overdue list: video_edits past their deadline that aren't Done, leads whose next_follow_up_at is in the past and aren't closed, scripts approved >7d ago that haven't been recorded. Use when the user asks 'what's stuck?' or 'what's behind?'. Complements the alerts pipeline — alerts batch every 6h, this is fresh.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "bulk_schedule_posts",
    description:
      "Schedule N posts for one client in a single call. Each item creates or updates a video_edits row with schedule_date set. Use after generate_week_plan when the user confirms, or any time the user wants to batch-schedule.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string" },
        items: {
          type: "array",
          description: "List of posts to schedule",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              date: { type: "string", description: "YYYY-MM-DD" },
              caption: { type: "string", description: "Optional caption text" },
            },
            required: ["title", "date"],
          },
        },
      },
      required: ["client_name", "items"],
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

  if (block.name === "generate_week_plan") {
    const { client_name, start_date, posts = 5 } = block.input;
    const client = await resolveClient(ctx, client_name);
    if (!client) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };

    // Pull the planning ingredients in parallel: strategy targets, onboarding
    // voice, last 14d of titles so we don't repeat ourselves.
    const tomorrow = start_date ?? new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const fourteenAgo = new Date(Date.now() - 14 * 86_400_000).toISOString();
    const [stratRes, clientRes, recentEditsRes] = await Promise.all([
      adminClient.from("client_strategies").select("posts_per_month, scripts_per_month, mix_reach, mix_trust, mix_convert, manychat_active, manychat_keyword, cta_goal").eq("client_id", client.id).maybeSingle(),
      adminClient.from("clients").select("onboarding_data").eq("id", client.id).maybeSingle(),
      adminClient.from("video_edits").select("reel_title, schedule_date").eq("client_id", client.id).is("deleted_at", null).gte("created_at", fourteenAgo).limit(15),
    ]);
    const strat = stratRes.data ?? {} as any;
    const od = (clientRes.data?.onboarding_data as any) ?? {};
    const recentTitles = (recentEditsRes.data ?? []).map((r: any) => r.reel_title).filter(Boolean);

    const mixReach = strat.mix_reach ?? 60;
    const mixTrust = strat.mix_trust ?? 30;
    const mixConvert = strat.mix_convert ?? 10;
    const numPosts = Math.max(1, Math.min(posts ?? 5, 7));

    // How many of each kind, rounded so the totals match numPosts.
    const reachCount = Math.round((mixReach / 100) * numPosts);
    const trustCount = Math.round((mixTrust / 100) * numPosts);
    const convertCount = Math.max(0, numPosts - reachCount - trustCount);

    const prompt = `You are planning a ${numPosts}-day short-form content calendar for one creator.

CREATOR PROFILE:
- Name: ${od.clientName ?? client.name}
- Industry: ${od.industry ?? "unknown"}
- Audience: ${od.targetClient ?? "unknown"}
- Offer: ${od.uniqueOffer ?? "unknown"}
- Voice / values: ${od.uniqueValues ?? "unspecified"}
- Story / origin: ${od.story ?? "unspecified"}
- Story-with-numbers / backstory: ${od.storyNumbers ?? "unspecified"}

STRATEGY:
- Monthly post target: ${strat.posts_per_month ?? "unset"}
- Content mix: ${mixReach}% reach / ${mixTrust}% trust / ${mixConvert}% convert
- ManyChat: ${strat.manychat_active ? `active, keyword "${strat.manychat_keyword ?? "?"}"` : "not active"}
- CTA goal: ${strat.cta_goal ?? "unset"}

RECENT POSTS (last 14d — DO NOT repeat angles):
${recentTitles.length > 0 ? recentTitles.map((t: string) => `- ${t}`).join("\n") : "(none — fresh slate)"}

Plan exactly ${numPosts} posts (${reachCount} reach, ${trustCount} trust, ${convertCount} convert), one per consecutive day starting ${tomorrow}.

For each post, output ONE line in this exact format (no markdown, no preamble):
DATE | TYPE | TITLE | HOOK_ANGLE | WHY_IT_FITS

Where:
- DATE is YYYY-MM-DD starting from ${tomorrow}
- TYPE is one of: reach, trust, convert
- TITLE is a 4-8 word working title
- HOOK_ANGLE is a 5-12 word hook idea
- WHY_IT_FITS is one short sentence

Output ${numPosts} lines, nothing else.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { type: "tool_result", tool_use_id: block.id, content: `Plan generation failed: ${err.error?.message ?? res.statusText}` };
    }
    const json = await res.json();
    const planText = (json.content?.[0]?.text as string ?? "").trim();
    if (!planText) return { type: "tool_result", tool_use_id: block.id, content: "Plan generator returned empty output. Try again." };

    return {
      type: "tool_result",
      tool_use_id: block.id,
      content: `Draft ${numPosts}-day plan for ${client.name} starting ${tomorrow}:\n\n${planText}\n\nIf the user approves, call bulk_schedule_posts with these items (each line's TITLE and DATE — caption optional). If they want changes, regenerate with adjusted mix or different start date.`,
    };
  }

  if (block.name === "get_morning_brief") {
    // Resolve every client_id this caller can see; for non-admins use the
    // shared accessible-set, for admins skip the filter.
    const { data: userClients } = await adminClient.from("clients").select("id, name").eq("user_id", userId);
    const clientIds = (userClients ?? []).map((c: any) => c.id);
    const idLookup = Object.fromEntries((userClients ?? []).map((c: any) => [c.id, c.name]));
    if (clientIds.length === 0) {
      return { type: "tool_result", tool_use_id: block.id, content: "Morning brief: no clients in your account yet." };
    }
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [scriptsRes, leadsRes, editsRes, contractsRes, alertsRes] = await Promise.all([
      adminClient.from("scripts").select("client_id, idea_ganadora, status, created_at").in("client_id", clientIds).gte("created_at", since).order("created_at", { ascending: false }).limit(8),
      adminClient.from("leads").select("client_id, name, status, created_at").in("client_id", clientIds).gte("created_at", since).order("created_at", { ascending: false }).limit(8),
      adminClient.from("video_edits").select("client_id, reel_title, status, post_status, updated_at").in("client_id", clientIds).is("deleted_at", null).gte("updated_at", since).order("updated_at", { ascending: false }).limit(8),
      adminClient.from("contracts").select("client_id, title, status, created_at").in("client_id", clientIds).gte("created_at", since).order("created_at", { ascending: false }).limit(5),
      adminClient.from("companion_alerts").select("id", { count: "exact", head: true }).eq("user_id", userId).is("dismissed_at", null),
    ]);
    const lines: string[] = [];
    const alertCount = alertsRes.count ?? 0;
    if (alertCount > 0) lines.push(`${alertCount} open alert(s) — call get_open_alerts for the urgent ones.`);
    for (const s of scriptsRes.data ?? []) lines.push(`new script · ${idLookup[s.client_id] ?? "?"} · "${s.idea_ganadora ?? "untitled"}"`);
    for (const l of leadsRes.data ?? []) lines.push(`new lead · ${idLookup[l.client_id] ?? "?"} · ${l.name} (${l.status ?? "new"})`);
    for (const e of editsRes.data ?? []) lines.push(`edit update · ${idLookup[e.client_id] ?? "?"} · "${e.reel_title}" → ${e.status ?? "?"}${e.post_status === "Published" ? " · PUBLISHED" : ""}`);
    for (const c of contractsRes.data ?? []) lines.push(`contract · ${idLookup[c.client_id] ?? "?"} · "${c.title ?? "untitled"}" (${c.status ?? "draft"})`);
    if (lines.length === 0) return { type: "tool_result", tool_use_id: block.id, content: "Morning brief: nothing changed in the last 24 hours." };
    return {
      type: "tool_result",
      tool_use_id: block.id,
      content: `Morning brief — last 24h:\n${lines.join("\n")}`,
    };
  }

  if (block.name === "get_overdue_items") {
    const { data: userClients } = await adminClient.from("clients").select("id, name").eq("user_id", userId);
    const clientIds = (userClients ?? []).map((c: any) => c.id);
    const idLookup = Object.fromEntries((userClients ?? []).map((c: any) => [c.id, c.name]));
    if (clientIds.length === 0) {
      return { type: "tool_result", tool_use_id: block.id, content: "No clients to check." };
    }
    const nowIso = new Date().toISOString();
    const sevenAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const [editsRes, leadsRes, scriptsRes] = await Promise.all([
      adminClient.from("video_edits").select("client_id, reel_title, status, deadline, assignee, footage, file_url, file_submission, storage_path, storage_url").in("client_id", clientIds).is("deleted_at", null).lt("deadline", nowIso).neq("status", "Done").neq("status", "Published").order("deadline", { ascending: true }).limit(15),
      adminClient.from("leads").select("client_id, name, status, next_follow_up_at").in("client_id", clientIds).lt("next_follow_up_at", nowIso).not("status", "in", "(lost,booked,closed,won)").order("next_follow_up_at", { ascending: true }).limit(15),
      adminClient.from("scripts").select("client_id, idea_ganadora, title, created_at").in("client_id", clientIds).eq("status", "Approved").eq("grabado", false).lt("created_at", sevenAgo).order("created_at", { ascending: true }).limit(15),
    ]);
    const blocks: string[] = [];
    if ((editsRes.data ?? []).length > 0) {
      const editLines = editsRes.data!.map((e: any) => {
        const hasFootage = !!(e.footage || e.file_url || e.file_submission || e.storage_path || e.storage_url);
        return `  ${idLookup[e.client_id] ?? "?"} · "${e.reel_title}" · ${e.status ?? "not started"} · due ${String(e.deadline).slice(0, 10)} · ${hasFootage ? "footage attached" : "NO FOOTAGE YET"}${e.assignee ? ` · ${e.assignee}` : ""}`;
      });
      blocks.push(`Edits past deadline (${editsRes.data!.length}):\n${editLines.join("\n")}`);
    }
    if ((leadsRes.data ?? []).length > 0) {
      const leadLines = leadsRes.data!.map((l: any) => `  ${idLookup[l.client_id] ?? "?"} · ${l.name} · ${l.status ?? "?"} · followup was ${String(l.next_follow_up_at).slice(0, 10)}`);
      blocks.push(`Leads with overdue follow-up (${leadsRes.data!.length}):\n${leadLines.join("\n")}`);
    }
    if ((scriptsRes.data ?? []).length > 0) {
      const scriptLines = scriptsRes.data!.map((s: any) => `  ${idLookup[s.client_id] ?? "?"} · "${s.idea_ganadora ?? s.title ?? "untitled"}" · approved ${String(s.created_at).slice(0, 10)}`);
      blocks.push(`Scripts approved >7d ago, not recorded (${scriptsRes.data!.length}):\n${scriptLines.join("\n")}`);
    }
    if (blocks.length === 0) return { type: "tool_result", tool_use_id: block.id, content: "Nothing overdue. You're caught up." };
    return { type: "tool_result", tool_use_id: block.id, content: blocks.join("\n\n") };
  }

  if (block.name === "bulk_schedule_posts") {
    const { client_name, items } = block.input;
    const client = await resolveClient(ctx, client_name);
    if (!client) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };
    if (!Array.isArray(items) || items.length === 0) {
      return { type: "tool_result", tool_use_id: block.id, content: "Refused: items must be a non-empty array." };
    }
    if (items.length > 14) {
      return { type: "tool_result", tool_use_id: block.id, content: `Refused: too many items (${items.length}). Cap is 14 per call.` };
    }

    const results: string[] = [];
    let updated = 0;
    let inserted = 0;
    for (const item of items) {
      const title = String(item?.title ?? "").trim();
      const date = String(item?.date ?? "").trim();
      const caption = item?.caption ? String(item.caption) : null;
      if (!title || !date) {
        results.push(`SKIP: missing title or date — ${JSON.stringify(item).slice(0, 80)}`);
        continue;
      }
      // Prefer updating an existing video_edits row matched by title.
      const { data: existing } = await adminClient
        .from("video_edits")
        .select("id")
        .eq("client_id", client.id)
        .ilike("reel_title", `%${title.slice(0, 80)}%`)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
      if (existing) {
        const update: Record<string, unknown> = { schedule_date: date };
        if (caption) update.caption = caption;
        const { error } = await adminClient.from("video_edits").update(update).eq("id", existing.id);
        if (error) results.push(`FAIL update "${title}": ${error.message}`);
        else { updated += 1; results.push(`UPDATED "${title}" → ${date}`); }
      } else {
        const { error } = await adminClient.from("video_edits").insert({
          client_id: client.id,
          reel_title: title.slice(0, 120),
          status: "Not started",
          post_status: "Unpublished",
          schedule_date: date,
          caption,
        });
        if (error) results.push(`FAIL insert "${title}": ${error.message}`);
        else { inserted += 1; results.push(`SCHEDULED "${title}" → ${date}`); }
      }
    }
    actions.push({ type: "refresh_data", scope: "calendar" });
    actions.push({ type: "refresh_data", scope: "editing_queue" });
    return {
      type: "tool_result",
      tool_use_id: block.id,
      content: `Bulk schedule for ${client.name}: ${inserted} new + ${updated} updated.\n\n${results.join("\n")}`,
    };
  }

  return null;
}
