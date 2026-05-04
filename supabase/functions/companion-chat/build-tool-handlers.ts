// supabase/functions/companion-chat/build-tool-handlers.ts
// Handlers for the 8 LLM-callable build tools.
// Each handler:
//   1. Returns early if build is paused
//   2. Inserts a live progress message via assistant_messages (→ Realtime → drawer)
//   3. Does its work
//   4. Returns a tool result string for Claude to read

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import type { BuildSession } from "../_shared/build-session/types.ts";
import { updateBuildSession } from "../_shared/build-session/service.ts";

// ── Context passed to every handler ──────────────────────────────────────────

export interface BuildToolContext {
  adminClient: SupabaseClient;
  userId: string;
  client: { id: string; name: string | null };
  buildSession: BuildSession | null;
  threadId: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Insert a live progress message into the thread (appears via Realtime). */
export async function logBuildProgress(
  ctx: BuildToolContext,
  text: string,
  phase?: string,
): Promise<void> {
  const { adminClient, buildSession, threadId } = ctx;
  if (threadId) {
    await adminClient.from("assistant_messages").insert({
      thread_id: threadId,
      role: "assistant",
      content: { type: "text", text, is_progress: true },
    }).catch(() => {});
  }
  if (phase && buildSession) {
    await adminClient
      .from("companion_build_sessions")
      .update({ phase })
      .eq("id", buildSession.id)
      .catch(() => {});
  }
}

/** Check if the build has been paused by the user. */
async function checkPaused(ctx: BuildToolContext): Promise<boolean> {
  if (!ctx.buildSession) return false;
  const { data } = await ctx.adminClient
    .from("companion_build_sessions")
    .select("status")
    .eq("id", ctx.buildSession.id)
    .maybeSingle();
  return data?.status === "paused";
}

async function callClaudeHaiku(prompt: string, system?: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      ...(system ? { system } : {}),
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Claude Haiku error: ${json.error?.message ?? res.statusText}`);
  return (json.content?.[0]?.text as string ?? "").trim();
}

async function callClaudeSonnet(prompt: string, system?: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      ...(system ? { system } : {}),
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Claude Sonnet error: ${json.error?.message ?? res.statusText}`);
  return (json.content?.[0]?.text as string ?? "").trim();
}

// ── Tool 1: resolve_client ────────────────────────────────────────────────────

export async function handleResolveClient(
  input: { client_name: string },
  ctx: BuildToolContext,
): Promise<string> {
  if (await checkPaused(ctx)) return "Build is paused. User will resume when ready.";
  await logBuildProgress(ctx, "On it — looking up client...", "Resolving client...");

  const { data: targetClient } = await ctx.adminClient
    .from("clients")
    .select("id, name, onboarding_data")
    .eq("user_id", ctx.userId)
    .ilike("name", `%${input.client_name}%`)
    .limit(1)
    .maybeSingle();

  if (!targetClient) {
    return `No client found matching "${input.client_name}". Ask the user to clarify the name.`;
  }

  if (ctx.buildSession) {
    await ctx.adminClient
      .from("companion_build_sessions")
      .update({ client_id: targetClient.id, phase: `Working on ${targetClient.name}` })
      .eq("id", ctx.buildSession.id);
  }

  await logBuildProgress(ctx, `Got it — switching focus to **${targetClient.name}**.`);

  const od = (targetClient.onboarding_data as any) ?? {};
  return `Client resolved: ${targetClient.name} (id: ${targetClient.id}). Niche: ${od.niche ?? od.industry ?? "unknown"}. Audience: ${od.audience ?? "unknown"}.`;
}

// ── Tool 2: get_canvas_context ────────────────────────────────────────────────

export async function handleGetCanvasContext(
  input: { client_id: string },
  ctx: BuildToolContext,
): Promise<string> {
  if (await checkPaused(ctx)) return "Build is paused. User will resume when ready.";

  // Return cached context if available
  if (ctx.buildSession?.cachedCanvasContext !== null && ctx.buildSession?.cachedCanvasContext !== undefined) {
    return `Using cached canvas context (read earlier this session).\n\n${ctx.buildSession.cachedCanvasContext || "(canvas was empty)"}`;
  }

  await logBuildProgress(ctx, "Reading your canvas...", "Reading canvas...");

  const { data: canvases } = await ctx.adminClient
    .from("canvas_states")
    .select("id, name, nodes")
    .eq("client_id", input.client_id)
    .eq("is_active", true)
    .order("updated_at", { ascending: false });

  if (!canvases || canvases.length === 0) {
    await logBuildProgress(ctx, "No active canvas found — I'll use your strategy notes instead.", "Reading context...");
    if (ctx.buildSession) {
      await updateBuildSession(ctx.adminClient, ctx.buildSession.id, {
        cachedCanvasContext: "",
        cachedCanvasContextAt: new Date().toISOString(),
      });
    }
    return "No active canvas found for this client. Proceeding with strategy + onboarding data only.";
  }

  const canvas = canvases[0];

  if (ctx.buildSession) {
    await updateBuildSession(ctx.adminClient, ctx.buildSession.id, {
      canvasStateId: canvas.id,
      phase: "Reading canvas...",
    });
  }

  const nodes = (canvas.nodes as any[]) ?? [];
  const textNodes = nodes.filter((n) => n.type === "textNoteNode");
  const researchNodes = nodes.filter((n) => n.type === "researchNoteNode");
  const mediaNodes = nodes.filter((n) =>
    n.type === "mediaNode" &&
    (n.data?.fileType === "voice" || n.data?.fileType === "pdf") &&
    typeof n.data?.audioTranscription === "string"
  );

  const lines: string[] = [];

  if (mediaNodes.length > 0) {
    await logBuildProgress(ctx, `Reading ${mediaNodes.length} voice/PDF transcript${mediaNodes.length > 1 ? "s" : ""}...`);
    lines.push("# Voice/PDF Transcripts:");
    for (const n of mediaNodes.slice(0, 6)) {
      const text = ((n.data?.audioTranscription as string) ?? "").slice(0, 1000);
      if (text.trim()) lines.push(`- ${text}`);
    }
  }

  if (textNodes.length > 0) {
    await logBuildProgress(ctx, `Reading ${textNodes.length} text note${textNodes.length > 1 ? "s" : ""}...`);
    lines.push("# Text Notes:");
    for (const n of textNodes.slice(0, 12)) {
      const text = ((n.data?.noteText as string) ?? "").slice(0, 800);
      if (text.trim()) lines.push(`- ${text}`);
    }
  }

  if (researchNodes.length > 0) {
    await logBuildProgress(ctx, `Reading ${researchNodes.length} research note${researchNodes.length > 1 ? "s" : ""}...`);
    lines.push("# Research Notes:");
    for (const n of researchNodes.slice(0, 8)) {
      const text = ((n.data?.text as string) ?? "").slice(0, 800);
      if (text.trim()) lines.push(`- ${text}`);
    }
  }

  if (lines.length === 0) {
    await logBuildProgress(ctx, "Canvas is empty — I'll use your strategy notes instead.", "Context read");
  }

  const context = lines.join("\n");
  const summary = [
    mediaNodes.length > 0 ? `${mediaNodes.length} transcript(s)` : null,
    textNodes.length > 0 ? `${textNodes.length} text note(s)` : null,
    researchNodes.length > 0 ? `${researchNodes.length} research note(s)` : null,
  ].filter(Boolean).join(", ") || "nothing found";

  if (ctx.buildSession) {
    await updateBuildSession(ctx.adminClient, ctx.buildSession.id, {
      cachedCanvasContext: context,
      cachedCanvasContextAt: new Date().toISOString(),
      phase: "Context read",
    });
  }

  return `Canvas "${canvas.name ?? "untitled"}" read. Found: ${summary}.\n\nCANVAS CONTEXT:\n${context}`;
}

// ── Tool 3: generate_script_ideas ─────────────────────────────────────────────

export async function handleGenerateScriptIdeas(
  input: { client_id: string; topic_hint?: string },
  ctx: BuildToolContext,
): Promise<string> {
  if (await checkPaused(ctx)) return "Build is paused. User will resume when ready.";
  await logBuildProgress(ctx, "Coming up with ideas based on what I'm seeing...", "Generating ideas...");

  const [{ data: clientRow }, { data: strategy }] = await Promise.all([
    ctx.adminClient.from("clients").select("name, onboarding_data").eq("id", input.client_id).maybeSingle(),
    ctx.adminClient.from("client_strategies").select("*").eq("client_id", input.client_id).maybeSingle(),
  ]);

  const od = (clientRow?.onboarding_data as any) ?? {};
  const canvasCtx = ctx.buildSession?.cachedCanvasContext ?? "";

  const prompt = `Generate exactly 5 short-form video ideas for this creator.

CREATOR PROFILE:
- Name: ${clientRow?.name ?? "unknown"}
- Niche: ${od.niche ?? od.industry ?? "social media"}
- Audience: ${od.audience ?? "general audience"}
- Offer: ${od.uniqueOffer ?? od.offer ?? ""}

${strategy ? `STRATEGY:\n${JSON.stringify(strategy).slice(0, 1500)}\n` : ""}

${canvasCtx ? `CANVAS CONTEXT (use this heavily for grounded ideas):\n${canvasCtx.slice(0, 2500)}\n` : ""}

${input.topic_hint ? `USER'S SPECIFIC TOPIC REQUEST: ${input.topic_hint}\n` : ""}

RULES:
- Ideas must be specific to this creator's story, niche, and audience — not generic
- Use real details from their canvas/onboarding (numbers, results, names) when available
- Each idea must have 3-5 search keywords for finding viral reference videos

Output ONLY a JSON array, no commentary:
[{"title": "<one sentence concept>", "keywords": ["<keyword1>", "<keyword2>", "<keyword3>"]}]`;

  let raw = "";
  try {
    raw = await callClaudeHaiku(prompt);
    raw = raw.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/\s*```$/, "").trim();
    const ideas = JSON.parse(raw);
    if (!Array.isArray(ideas) || ideas.length === 0) throw new Error("empty array");

    if (ctx.buildSession) {
      await updateBuildSession(ctx.adminClient, ctx.buildSession.id, {
        ideas,
        selectedIdeas: [],
        currentIdeaIndex: 0,
        phase: "Ideas ready",
      });
    }

    const list = ideas.map((idea: any, i: number) => `${i + 1}. ${idea.title}`).join("\n");
    return `Generated 5 ideas:\n${list}`;
  } catch (e) {
    return `Failed to generate ideas: ${(e as Error).message}. Raw response: ${raw.slice(0, 200)}`;
  }
}

// ── Tool 4: search_viral_frameworks ───────────────────────────────────────────

export async function handleSearchViralFrameworks(
  input: { idea_title: string; keywords: string[] },
  ctx: BuildToolContext,
): Promise<string> {
  if (await checkPaused(ctx)) return "Build is paused. User will resume when ready.";
  await logBuildProgress(ctx, `Searching viral frameworks for "${input.idea_title}"...`, "Searching frameworks...");

  const orFilter = input.keywords
    .filter((k) => k.length >= 3)
    .map((k) => `caption.ilike.%${k.replace(/[%,]/g, "")}%`)
    .join(",");

  let query = ctx.adminClient
    .from("viral_videos")
    .select("id, video_url, thumbnail_url, caption, channel_username, views_count, outlier_score")
    .order("outlier_score", { ascending: false, nullsFirst: false })
    .limit(25);
  if (orFilter) query = query.or(orFilter);
  const { data: candidates } = await query;

  const pool = ((candidates as any[]) ?? []).filter((v) => (v.caption ?? "").trim().length > 0);

  if (pool.length === 0) {
    return `No viral references found for "${input.idea_title}". Suggest the user paste 1-3 Instagram reel URLs and call add_url_to_viral_database for each.`;
  }

  let top3 = pool.slice(0, 3);
  if (pool.length > 3) {
    const candidateBlock = pool
      .map((v, i) => `${i + 1}. id=${v.id} | @${v.channel_username ?? "unknown"} | ${v.outlier_score ?? "?"}x | caption: ${(v.caption ?? "").slice(0, 200)}`)
      .join("\n");

    const rankPrompt = `Pick the 3 MOST RELEVANT video IDs for a script about this idea:

IDEA: ${input.idea_title}

CANDIDATES:
${candidateBlock}

Output ONLY a JSON array of exactly 3 ids: ["uuid1","uuid2","uuid3"]. Nothing else.`;
    try {
      let ranked = await callClaudeHaiku(rankPrompt);
      ranked = ranked.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/\s*```$/, "").trim();
      const ids = JSON.parse(ranked) as string[];
      if (Array.isArray(ids) && ids.length > 0) {
        const map = new Map(pool.map((v) => [v.id, v]));
        const ordered = ids.map((id) => map.get(id)).filter(Boolean) as any[];
        const seen = new Set(ordered.map((v) => v.id));
        for (const v of pool) {
          if (ordered.length >= 3) break;
          if (!seen.has(v.id)) ordered.push(v);
        }
        top3 = ordered.slice(0, 3);
      }
    } catch {
      // ranking failed, keep pool.slice(0,3)
    }
  }

  if (ctx.buildSession && top3[0]?.id) {
    await updateBuildSession(ctx.adminClient, ctx.buildSession.id, {
      currentFrameworkVideoId: top3[0].id,
      phase: "Frameworks found",
    });
  }

  const result = top3.map((v, i) => {
    const cap = (v.caption ?? "").slice(0, 150);
    return `${i + 1}. @${v.channel_username ?? "unknown"} — ${v.outlier_score ?? "?"}x\n   Caption: ${cap}\n   URL: ${v.video_url ?? ""}\n   Thumbnail: ${v.thumbnail_url ?? ""}`;
  }).join("\n\n");

  return `Top 3 viral references for "${input.idea_title}" (ranked by relevance):\n\n${result}\n\nDefault pick: #1 (@${top3[0]?.channel_username ?? "unknown"})`;
}

// ── Tool 5: add_url_to_viral_database ─────────────────────────────────────────

export async function handleAddUrlToViralDatabase(
  input: { url: string; client_id: string },
  ctx: BuildToolContext,
): Promise<string> {
  if (await checkPaused(ctx)) return "Build is paused. User will resume when ready.";
  await logBuildProgress(ctx, `Adding ${input.url} to the Viral Database...`, "Adding to viral DB...");

  const usernameMatch = input.url.match(/instagram\.com\/(?:reel\/)?@?([^/?]+)/i) ??
    input.url.match(/tiktok\.com\/@([^/?]+)/i);
  const channelUsername = usernameMatch?.[1]?.replace(/^@/, "") ?? "unknown";

  const { data: inserted, error } = await ctx.adminClient
    .from("viral_videos")
    .insert({
      video_url: input.url,
      channel_username: channelUsername,
      caption: "(user-submitted — pending enrichment)",
      platform: input.url.includes("tiktok") ? "tiktok" : "instagram",
      views_count: 0,
      outlier_score: null,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return `Failed to add URL to viral database: ${error?.message ?? "unknown error"}`;
  }

  if (ctx.buildSession) {
    await updateBuildSession(ctx.adminClient, ctx.buildSession.id, {
      currentFrameworkVideoId: inserted.id,
      phase: "URL added to viral DB",
    });
  }

  return `Added ${input.url} to viral database. Video ID: ${inserted.id}. @${channelUsername}. Use this ID as the framework reference.`;
}

// ── Tool 6: add_video_to_canvas ───────────────────────────────────────────────

export async function handleAddVideoToCanvas(
  input: { client_id: string; video_id: string },
  ctx: BuildToolContext,
): Promise<string> {
  if (await checkPaused(ctx)) return "Build is paused. User will resume when ready.";

  const clientName = ctx.client.name ?? "client";
  await logBuildProgress(ctx, `Adding video to ${clientName}'s canvas...`, "Adding to canvas...");

  const { data: video } = await ctx.adminClient
    .from("viral_videos")
    .select("id, video_url, caption, channel_username, thumbnail_url, views_count")
    .eq("id", input.video_id)
    .maybeSingle();

  if (!video) {
    return `Video ${input.video_id} not found in viral_videos.`;
  }

  const canvasId = ctx.buildSession?.canvasStateId ?? null;
  if (!canvasId) {
    return "No active canvas linked to this build session. Canvas must be open for the client first.";
  }

  const { data: canvas } = await ctx.adminClient
    .from("canvas_states")
    .select("nodes")
    .eq("id", canvasId)
    .maybeSingle();

  const nodes = ((canvas?.nodes as any[]) ?? []).slice();
  const existingVideoCount = nodes.filter((n: any) => n.type === "videoNode").length;
  const yOffset = existingVideoCount * 600;

  const newNodeId = `videoNode_llmbuild_${Date.now()}`;
  nodes.push({
    id: newNodeId,
    type: "videoNode",
    position: { x: 200, y: 200 + yOffset },
    width: 240,
    data: {
      url: video.video_url,
      caption: video.caption,
      channel_username: video.channel_username,
      thumbnailUrl: video.thumbnail_url,
      views_count: video.views_count,
    },
  });

  await ctx.adminClient
    .from("canvas_states")
    .update({ nodes })
    .eq("id", canvasId);

  if (ctx.buildSession) {
    await updateBuildSession(ctx.adminClient, ctx.buildSession.id, {
      currentFrameworkVideoId: video.id,
      phase: "Video on canvas",
    });
  }

  return `VideoNode added to ${clientName}'s canvas. Video: @${video.channel_username ?? "unknown"} — ${(video.caption ?? "").slice(0, 100)}. The node will auto-transcribe when the user opens the canvas.`;
}

// ── Tool 7: draft_script ──────────────────────────────────────────────────────

export async function handleDraftScript(
  input: { client_id: string; idea_title: string; framework_caption: string },
  ctx: BuildToolContext,
): Promise<string> {
  if (await checkPaused(ctx)) return "Build is paused. User will resume when ready.";
  await logBuildProgress(ctx, "Drafting your script...", "Drafting...");

  const { data: clientRow } = await ctx.adminClient
    .from("clients")
    .select("name, onboarding_data")
    .eq("id", input.client_id)
    .maybeSingle();

  const od = (clientRow?.onboarding_data as any) ?? {};
  const canvasCtx = ctx.buildSession?.cachedCanvasContext ?? "";

  const prompt = `Write a short-form video script. Use the SAME structural beats as the reference framework but adapt every line to match the new idea and creator.

NEW IDEA: ${input.idea_title}

REFERENCE FRAMEWORK CAPTION (mirror its hook style, pacing, body structure, CTA pattern — not the words):
${input.framework_caption.slice(0, 800)}

CREATOR:
- Name: ${clientRow?.name ?? ""}
- Niche: ${od.niche ?? od.industry ?? ""}
- Voice: ${od.tone ?? "conversational, direct"}
- Audience: ${od.audience ?? ""}

${canvasCtx ? `CANVAS CONTEXT (use specific details from here — real numbers, real stories, real words from their notes):\n${canvasCtx.slice(0, 1500)}\n` : ""}

RULES:
- Keep the same structure as the framework (same number of body beats, same CTA pattern)
- Change the words and specific value to match the new idea
- Use the creator's real details where possible
- Output ONLY these three labeled sections, no other text:

HOOK: <1-2 punchy lines>
BODY: <3-6 short lines, one per line>
CTA: <1 line>`;

  let draft = "";
  try {
    draft = await callClaudeSonnet(prompt);
  } catch (e) {
    return `Drafting failed: ${(e as Error).message}`;
  }

  if (ctx.buildSession) {
    await updateBuildSession(ctx.adminClient, ctx.buildSession.id, {
      currentScriptDraft: draft,
      phase: "Draft ready",
    });
  }

  return `Script draft:\n\n${draft}`;
}

// ── Tool 8: save_script ───────────────────────────────────────────────────────

export async function handleSaveScript(
  input: { client_id: string; title: string; hook: string; body: string; cta: string },
  ctx: BuildToolContext,
): Promise<string> {
  if (await checkPaused(ctx)) return "Build is paused. User will resume when ready.";
  await logBuildProgress(ctx, `Saving script to ${ctx.client.name ?? "client"}'s library...`, "Saving...");

  const rawContent = [input.hook, input.body, input.cta].join("\n");

  const { data: script, error: scriptErr } = await ctx.adminClient
    .from("scripts")
    .insert({
      client_id: input.client_id,
      title: input.title.slice(0, 120),
      hook: input.hook,
      body: input.body,
      cta: input.cta,
      raw_content: rawContent,
      status: "Idea",
      category: "reach",
    })
    .select("id")
    .single();

  if (scriptErr || !script) {
    return `Save failed: ${scriptErr?.message ?? "unknown error"}`;
  }

  const bodyLines = input.body.split("\n").map((l) => l.trim()).filter(Boolean);
  const lineRows = [
    { script_id: script.id, line_index: 0, content: input.hook, line_type: "hook" },
    ...bodyLines.map((line, i) => ({ script_id: script.id, line_index: i + 1, content: line, line_type: "body" })),
    { script_id: script.id, line_index: bodyLines.length + 1, content: input.cta, line_type: "cta" },
  ];
  await ctx.adminClient.from("script_lines").insert(lineRows);

  if (ctx.buildSession) {
    await updateBuildSession(ctx.adminClient, ctx.buildSession.id, {
      currentScriptId: script.id,
      phase: "Script saved",
    });
  }

  return `Script "${input.title}" saved to ${ctx.client.name ?? "client"}'s library (id: ${script.id}). The user can view it in their scripts section.`;
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

/** Try to handle a tool call as a build tool. Returns null if not a build tool. */
export async function handleBuildTool(
  toolName: string,
  toolInput: Record<string, any>,
  toolUseId: string,
  ctx: BuildToolContext,
): Promise<{ type: "tool_result"; tool_use_id: string; content: string } | null> {
  let content: string | null = null;

  switch (toolName) {
    case "resolve_client":
      content = await handleResolveClient(toolInput as { client_name: string }, ctx);
      break;
    case "get_canvas_context":
      content = await handleGetCanvasContext(toolInput as { client_id: string }, ctx);
      break;
    case "generate_script_ideas":
      content = await handleGenerateScriptIdeas(
        toolInput as { client_id: string; topic_hint?: string },
        ctx,
      );
      break;
    case "search_viral_frameworks":
      content = await handleSearchViralFrameworks(
        toolInput as { idea_title: string; keywords: string[] },
        ctx,
      );
      break;
    case "add_url_to_viral_database":
      content = await handleAddUrlToViralDatabase(
        toolInput as { url: string; client_id: string },
        ctx,
      );
      break;
    case "add_video_to_canvas":
      content = await handleAddVideoToCanvas(
        toolInput as { client_id: string; video_id: string },
        ctx,
      );
      break;
    case "draft_script":
      content = await handleDraftScript(
        toolInput as { client_id: string; idea_title: string; framework_caption: string },
        ctx,
      );
      break;
    case "save_script":
      content = await handleSaveScript(
        toolInput as { client_id: string; title: string; hook: string; body: string; cta: string },
        ctx,
      );
      break;
    default:
      return null;
  }

  return { type: "tool_result", tool_use_id: toolUseId, content: content ?? "" };
}
