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
  /** User's bearer token forwarded from the original /ai request. Used to
   * call other edge functions (e.g. transcribe-video) on behalf of the user
   * so credit deduction lands on the right account. */
  userAuthHeader?: string | null;
  /** Accumulator: tool wrappers push inserted progress message IDs here so
   * they can be cleared once the tool's work is done. */
  progressIds?: string[];
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Insert a live progress message into the thread (appears via Realtime). */
export async function logBuildProgress(
  ctx: BuildToolContext,
  text: string,
  phase?: string,
): Promise<void> {
  const { adminClient, buildSession, threadId, progressIds } = ctx;
  if (threadId) {
    const { data: inserted, error: msgErr } = await adminClient
      .from("assistant_messages")
      .insert({
        thread_id: threadId,
        role: "assistant",
        content: { type: "text", text, is_progress: true },
      })
      .select("id")
      .single();
    if (msgErr) console.warn("[logBuildProgress] insert failed:", msgErr.message);
    if (inserted?.id && progressIds) progressIds.push(inserted.id);
  }
  if (phase && buildSession) {
    const { error: phaseErr } = await adminClient
      .from("companion_build_sessions")
      .update({ phase })
      .eq("id", buildSession.id);
    if (phaseErr) console.warn("[logBuildProgress] phase update failed:", phaseErr.message);
  }
}

/** Delete all progress messages tracked in the context's progressIds. Called
 * after the tool's work is done so the user sees them flash and disappear. */
export async function clearBuildProgress(ctx: BuildToolContext): Promise<void> {
  const ids = ctx.progressIds;
  if (!ids || ids.length === 0) return;
  const { error } = await ctx.adminClient
    .from("assistant_messages")
    .delete()
    .in("id", ids);
  if (error) console.warn("[clearBuildProgress] delete failed:", error.message);
  // Reset the array so subsequent tools start fresh
  ids.length = 0;
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

  // Search both caption AND transcript for keyword matches
  const orFilter = input.keywords
    .filter((k) => k.length >= 3)
    .flatMap((k) => {
      const safe = k.replace(/[%,]/g, "");
      return [`caption.ilike.%${safe}%`, `transcript.ilike.%${safe}%`];
    })
    .join(",");

  // Only consider analyzed videos — unanalyzed ones don't have enough signal to rank
  let query = ctx.adminClient
    .from("viral_videos")
    .select("id, video_url, thumbnail_url, caption, channel_username, views_count, outlier_score, hook_text, cta_text, framework_meta, transcript")
    .not("transcribed_at", "is", null)
    .order("outlier_score", { ascending: false, nullsFirst: false })
    .limit(25);
  if (orFilter) query = query.or(orFilter);
  const { data: candidates } = await query;

  const pool = ((candidates as any[]) ?? []).filter((v) => (v.caption ?? "").trim().length > 0);

  if (pool.length === 0) {
    const keywordList = input.keywords.filter((k) => k.length >= 3).join(", ");
    return `No analyzed viral references match "${input.idea_title}" in the database.

Best move: ask the user to find references on Instagram or TikTok and paste them. Tell them:

Suggested keywords to search: ${keywordList || input.idea_title}

Steps:
1. Search those keywords on Instagram (or TikTok)
2. Look for videos with at least 5x the channel's typical view count
3. Paste 1-3 URLs back into this chat

I'll add them to the viral database and use them as the framework.`;
  }

  // Use Claude Haiku to rank by relevance (with all the new structural data)
  let top3 = pool.slice(0, 3);
  if (pool.length > 3) {
    const candidateBlock = pool
      .map((v, i) => {
        const fm = (v.framework_meta as any) ?? {};
        const niches = Array.isArray(fm.niche_tags) ? fm.niche_tags.join(", ") : "";
        const audience = fm.audience ?? "";
        const contentType = fm.content_type ?? "";
        const tempo = fm.visual_pacing?.tempo ?? "";
        const bodyStructure = fm.body_structure ?? "";
        return `${i + 1}. id=${v.id} | @${v.channel_username ?? "unknown"} | ${v.outlier_score ?? "?"}x
   Niche: ${niches} | Audience: ${audience}
   Type: ${contentType} | Pacing: ${tempo}
   Hook: "${(v.hook_text ?? "").slice(0, 200)}"
   Body: ${bodyStructure}
   CTA: "${(v.cta_text ?? "").slice(0, 120)}"`;
      })
      .join("\n\n");

    const rankPrompt = `Pick the 3 MOST RELEVANT video IDs for a script about this idea.

IDEA: ${input.idea_title}

Match priority (in order):
1. HOOK STRUCTURE — does the candidate's hook open the same way the new script's hook should? (e.g., retrospective story → retrospective story, contrarian statement → contrarian, question → question)
2. NICHE / AUDIENCE — does the niche overlap with the idea's subject?
3. CONTENT TYPE + PACING — talking head / B-roll / tutorial — does the format fit?
4. KEYWORD overlap (already filtered, secondary signal)

Outlier score is a TIEBREAKER, not the main signal. Reject candidates that are off-topic or structurally wrong even if they have huge outliers.

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

  // Mark this idea as the currently-selected one (calling search implies user picked it)
  if (ctx.buildSession && top3[0]?.id) {
    const matchedIdea = ctx.buildSession.ideas.find(
      (i) => i.title.toLowerCase() === input.idea_title.toLowerCase(),
    ) ?? { title: input.idea_title, keywords: input.keywords };

    const existingSelected = ctx.buildSession.selectedIdeas ?? [];
    const alreadySelected = existingSelected.some(
      (i) => i.title.toLowerCase() === input.idea_title.toLowerCase(),
    );

    await updateBuildSession(ctx.adminClient, ctx.buildSession.id, {
      currentFrameworkVideoId: top3[0].id,
      selectedIdeas: alreadySelected ? existingSelected : [matchedIdea],
      currentIdeaIndex: 0,
      phase: "Frameworks found",
    });
  }

  // Format the output for the LLM — show structural data not just outlier
  const result = top3
    .map((v, i) => {
      const fm = (v.framework_meta as any) ?? {};
      const niches = Array.isArray(fm.niche_tags) ? fm.niche_tags.join(", ") : "";
      const tempo = fm.visual_pacing?.tempo ?? "";
      const contentType = fm.content_type ?? "";
      return `${i + 1}. @${v.channel_username ?? "unknown"} — ${v.outlier_score ?? "?"}x
   Niche: ${niches}${contentType ? ` | Type: ${contentType.replace(/_/g, " ")}` : ""}${tempo ? ` | Pacing: ${tempo}` : ""}
   Hook: "${(v.hook_text ?? "").slice(0, 150)}"
   URL: ${v.video_url ?? ""}
   Thumbnail: ${v.thumbnail_url ?? ""}
   ID: ${v.id}`;
    })
    .join("\n\n");

  return `Top 3 viral references for "${input.idea_title}" (ranked by hook structure + niche fit):

${result}

Default pick: #1 (@${top3[0]?.channel_username ?? "unknown"})`;
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

  const platform = input.url.includes("tiktok")
    ? "tiktok"
    : /youtube\.com|youtu\.be/.test(input.url)
      ? "youtube"
      : "instagram";

  const { data: inserted, error } = await ctx.adminClient
    .from("viral_videos")
    .insert({
      video_url: input.url,
      channel_username: channelUsername,
      caption: "(user-submitted — pending enrichment)",
      platform,
      views_count: 0,
      outlier_score: null,
      user_submitted: true,
      submitted_by: ctx.userId || null,
      transcript_status: "pending",
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
      viralVideoId: video.id,
      autoTranscribe: true,
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

/**
 * Ensure the framework video has a transcript stored on viral_videos.transcript.
 *
 * Lazy: only transcribes when called (during draft_script). If the video is
 * already transcribed, returns it instantly. Otherwise calls transcribe-video
 * with the user's bearer token so credits land on the right account, persists
 * the result, and returns it. Returns null if transcription fails so the
 * caller can fall back to caption-only grounding.
 */
async function ensureFrameworkTranscript(
  videoId: string,
  ctx: BuildToolContext,
): Promise<{ transcript: string | null; error: string | null; cached: boolean }> {
  const { data: video } = await ctx.adminClient
    .from("viral_videos")
    .select("id, video_url, transcript, transcript_status, channel_username")
    .eq("id", videoId)
    .maybeSingle();

  if (!video) return { transcript: null, error: "video not found", cached: false };
  if (video.transcript && video.transcript.trim().length > 0) {
    return { transcript: video.transcript, error: null, cached: true };
  }
  if (!video.video_url) return { transcript: null, error: "no url", cached: false };
  if (!ctx.userAuthHeader) return { transcript: null, error: "no user auth available", cached: false };

  // Mark processing so concurrent calls don't double-bill
  await ctx.adminClient
    .from("viral_videos")
    .update({ transcript_status: "processing" })
    .eq("id", videoId);

  await logBuildProgress(
    ctx,
    `Transcribing @${video.channel_username ?? "video"}...`,
    "Transcribing framework...",
  );

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/transcribe-video`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: ctx.userAuthHeader,
      },
      body: JSON.stringify({
        url: video.video_url,
        viral_video_id: videoId,
        source: "build_mode",
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.transcription) {
      const err = json.error ?? `HTTP ${res.status}`;
      await ctx.adminClient
        .from("viral_videos")
        .update({ transcript_status: "failed", transcript_error: String(err).slice(0, 500) })
        .eq("id", videoId);
      return { transcript: null, error: String(err), cached: false };
    }
    // transcribe-video persists when viral_video_id is provided, but write here
    // too so we don't depend on that.
    await ctx.adminClient
      .from("viral_videos")
      .update({
        transcript: json.transcription,
        transcript_status: "done",
        transcribed_at: new Date().toISOString(),
        transcript_error: null,
      })
      .eq("id", videoId);
    return { transcript: json.transcription as string, error: null, cached: false };
  } catch (e) {
    const msg = (e as Error).message;
    await ctx.adminClient
      .from("viral_videos")
      .update({ transcript_status: "failed", transcript_error: msg.slice(0, 500) })
      .eq("id", videoId);
    return { transcript: null, error: msg, cached: false };
  }
}

export async function handleDraftScript(
  input: { client_id: string; idea_title: string; framework_video_id: string },
  ctx: BuildToolContext,
): Promise<string> {
  if (await checkPaused(ctx)) return "Build is paused. User will resume when ready.";

  // Resolve the framework video — fall back to currentFrameworkVideoId if the
  // LLM forgot to pass one (defensive).
  const videoId = input.framework_video_id || ctx.buildSession?.currentFrameworkVideoId || "";
  if (!videoId) {
    return "Cannot draft: no framework video selected. Call add_video_to_canvas first or have the user paste a reference URL.";
  }

  const { data: framework } = await ctx.adminClient
    .from("viral_videos")
    .select("id, video_url, caption, channel_username, transcript, structure_analysis")
    .eq("id", videoId)
    .maybeSingle();

  if (!framework) {
    return `Framework video ${videoId} not found in viral_videos.`;
  }

  await logBuildProgress(ctx, "Drafting your script...", "Drafting...");

  // Try to ground on transcript. Lazy-transcribe if missing.
  let transcriptResult = await ensureFrameworkTranscript(videoId, ctx);

  const transcript = transcriptResult.transcript;
  const caption = (framework.caption ?? "").trim();
  const captionIsPlaceholder = caption === "(user-submitted — pending enrichment)";

  const [{ data: clientRow }] = await Promise.all([
    ctx.adminClient.from("clients").select("name, onboarding_data").eq("id", input.client_id).maybeSingle(),
  ]);

  const od = (clientRow?.onboarding_data as any) ?? {};
  const canvasCtx = ctx.buildSession?.cachedCanvasContext ?? "";

  // Build the framework reference block honestly: prefer transcript, fall back
  // to caption only if no transcript is available. NEVER fabricate framework
  // attribution if grounding is absent.
  let frameworkBlock: string;
  let groundingNote: string;
  if (transcript && transcript.length > 50) {
    frameworkBlock = `REFERENCE FRAMEWORK — actual spoken content from @${framework.channel_username ?? "creator"}:
"""
${transcript.slice(0, 2500)}
"""

Mirror its hook style, pacing, body beats, and CTA pattern — but rewrite every line for the new idea below.`;
    groundingNote = transcriptResult.cached
      ? `(grounded on cached transcript)`
      : `(transcribed live for this draft)`;
  } else if (caption.length > 0 && !captionIsPlaceholder) {
    frameworkBlock = `REFERENCE FRAMEWORK CAPTION (transcript not available — only caption):
${caption.slice(0, 800)}

Mirror its hook style and tone where you can.`;
    groundingNote = `(grounded on caption only — transcript ${transcriptResult.error ? `failed: ${transcriptResult.error.slice(0, 80)}` : "not available"})`;
  } else {
    frameworkBlock = `NO REFERENCE FRAMEWORK CONTENT AVAILABLE.

Generate a generic short-form structure for the idea. Do NOT name or imply a specific framework or creator — you don't have one.`;
    groundingNote = `(no framework content — generating ungrounded; tell the user)`;
  }

  const prompt = `Write a short-form video script. ${transcript ? "Use the SAME structural beats as the reference framework but adapt every line to match the new idea and creator." : "Adapt the reference (if any) to the new idea and creator."}

NEW IDEA: ${input.idea_title}

${frameworkBlock}

CREATOR:
- Name: ${clientRow?.name ?? ""}
- Niche: ${od.niche ?? od.industry ?? ""}
- Voice: ${od.tone ?? "conversational, direct"}
- Audience: ${od.audience ?? ""}

${canvasCtx ? `CANVAS CONTEXT (use specific details from here — real numbers, real stories, real words from their notes):\n${canvasCtx.slice(0, 1500)}\n` : ""}

RULES:
- Keep the same structure as the framework when one is provided (same number of body beats, same CTA pattern)
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

  // Return both the draft AND the grounding note so the LLM can be honest
  // with the user about what was used as reference.
  return `Script draft ${groundingNote}:\n\n${draft}`;
}

// ── Tool 8: save_script ───────────────────────────────────────────────────────

export async function handleSaveScript(
  input: { client_id: string; title: string; hook: string; body: string; cta: string },
  ctx: BuildToolContext,
): Promise<string> {
  if (await checkPaused(ctx)) return "Build is paused. User will resume when ready.";
  await logBuildProgress(ctx, `Saving script to ${ctx.client.name ?? "client"}'s library...`, "Saving...");

  const rawContent = [
    `HOOK: ${input.hook}`,
    `BODY: ${input.body}`,
    `CTA: ${input.cta}`,
  ].join("\n\n");

  const { data: script, error: scriptErr } = await ctx.adminClient
    .from("scripts")
    .insert({
      client_id: input.client_id,
      title: input.title.slice(0, 120),
      raw_content: rawContent,
      idea_ganadora: input.title.slice(0, 120),
      formato: "talking_head",
      status: "Idea",
      grabado: false,
    })
    .select("id")
    .single();

  if (scriptErr || !script) {
    console.error("[save_script] insert failed:", scriptErr);
    return `Save failed: ${scriptErr?.message ?? "unknown error"}`;
  }

  const bodyLines = input.body.split("\n").map((l) => l.trim()).filter(Boolean);
  const lineRows = [
    { script_id: script.id, line_number: 1, line_type: "actor", section: "hook", text: input.hook },
    ...bodyLines.map((line, i) => ({
      script_id: script.id,
      line_number: i + 2,
      line_type: "actor",
      section: "body",
      text: line,
    })),
    {
      script_id: script.id,
      line_number: bodyLines.length + 2,
      line_type: "actor",
      section: "cta",
      text: input.cta,
    },
  ];
  const { error: linesErr } = await ctx.adminClient.from("script_lines").insert(lineRows);
  if (linesErr) {
    console.error("[save_script] script_lines insert FAILED:", JSON.stringify(linesErr));
    console.error("[save_script] payload was:", JSON.stringify(lineRows).slice(0, 500));
  } else {
    console.log("[save_script] inserted", lineRows.length, "script_lines");
  }

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
        toolInput as { client_id: string; idea_title: string; framework_video_id: string },
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

  // Tool's work is done — clear the progress messages so the spinners stop.
  await clearBuildProgress(ctx);

  return { type: "tool_result", tool_use_id: toolUseId, content: content ?? "" };
}
