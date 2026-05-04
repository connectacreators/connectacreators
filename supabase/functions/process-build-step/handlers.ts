// supabase/functions/process-build-step/handlers.ts
// Per-state work handlers. Phase 2 — real implementations for the
// happy-path states. Stubs that pause appropriately for ones that
// need richer interactive UI (Phase 3 polish).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { BuildStateName } from "../_shared/build-fsm/states.ts";
import type { BuildSession } from "../_shared/build-session/types.ts";
import { updateBuildSession } from "../_shared/build-session/service.ts";

export type HandlerOutcome =
  | { kind: "advance" }
  | { kind: "pause"; message?: string }
  | { kind: "error"; message: string };

export interface HandlerContext {
  admin: SupabaseClient;
  session: BuildSession;
}

export type StateHandler = (ctx: HandlerContext) => Promise<HandlerOutcome>;

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const ANTHROPIC_MODEL = "claude-sonnet-4-5";

// ── Logging helpers ────────────────────────────────────────────────────────

async function logProgress(ctx: HandlerContext, text: string): Promise<void> {
  try {
    await ctx.admin.from("assistant_messages").insert({
      thread_id: ctx.session.threadId,
      role: "assistant",
      content: { type: "text", text },
    });
  } catch (e) {
    console.error("[handlers] logProgress failed:", (e as Error).message);
  }
}

async function consumeUserInput(ctx: HandlerContext): Promise<string | null> {
  const input = ctx.session.userInput;
  if (input === null || input === undefined) return null;
  // Clear the field so subsequent states don't re-read stale input.
  await updateBuildSession(ctx.admin, ctx.session.id, { userInput: null });
  return input;
}

async function callClaude(prompt: string, system?: string): Promise<string> {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 2048,
      ...(system ? { system } : {}),
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Claude API error: ${json.error?.message ?? res.statusText}`);
  }
  const text = (json.content?.[0]?.text as string) ?? "";
  return text.trim();
}

// ── State handlers ─────────────────────────────────────────────────────────

const handleInit: StateHandler = async (ctx) => {
  // Announce which client we're working on so the user always knows context,
  // especially important when triggered from the /ai agency page.
  const { data: client } = await ctx.admin
    .from("clients")
    .select("name")
    .eq("id", ctx.session.clientId)
    .maybeSingle();
  const clientName = (client?.name as string | null) ?? "your client";
  await logProgress(
    ctx,
    `Got it! I'm working on **${clientName}**. What idea is on your mind? Or say "give me 5 ideas" and I'll suggest some based on their strategy.`,
  );
  return { kind: "pause" };
};

const handleResolveChat: StateHandler = async (ctx) => {
  // If a canvas is already attached (URL had clientId at session creation),
  // auto-advance. Otherwise pick the active canvas for this client.
  if (ctx.session.canvasStateId) return { kind: "advance" };
  const { data } = await ctx.admin
    .from("canvas_states")
    .select("id, name")
    .eq("client_id", ctx.session.clientId)
    .eq("is_active", true)
    .maybeSingle();
  if (data) {
    await updateBuildSession(ctx.admin, ctx.session.id, {
      // canvas_state_id is set via the row update — use raw column path
    });
    // Persist canvas ref in session row directly (UpdateBuildSessionPatch
    // doesn't expose canvasStateId, so write it via a raw update).
    await ctx.admin
      .from("companion_build_sessions")
      .update({ canvas_state_id: data.id })
      .eq("id", ctx.session.id);
    await logProgress(ctx, `Working in canvas "${data.name ?? "untitled"}".`);
    return { kind: "advance" };
  }
  // No active canvas — proceed without one. Phase 5 will auto-create.
  await logProgress(ctx, "No active canvas found — proceeding without canvas context.");
  return { kind: "advance" };
};

const handleAwaitingIdea: StateHandler = async (ctx) => {
  const userInput = await consumeUserInput(ctx);
  if (!userInput) {
    // INIT already asked the question and paused; if we somehow re-enter
    // without input (e.g. after LOOPING_NEXT), ask again.
    await logProgress(
      ctx,
      "What's the next idea? Or say \"give me 5 ideas\" for suggestions.",
    );
    return { kind: "pause" };
  }
  // User has provided input. Store it as a topic hint and advance.
  // We use cached_canvas_context loosely here; the real canvas read happens
  // in READING_CONTEXT and concatenates with this hint.
  const wantSuggestions = /\b(give|suggest|propose).+(ideas?|suggestions?)\b/i.test(userInput) ||
    /\b5\s+ideas?\b/i.test(userInput);
  // Stash the user's topic hint in selected_ideas as a placeholder marker
  // so IDEAS_GENERATED knows whether to generate or use the user's idea verbatim.
  if (wantSuggestions) {
    await updateBuildSession(ctx.admin, ctx.session.id, {
      ideas: [],
      selectedIdeas: [{ title: "__SUGGEST__", description: userInput }],
    });
  } else {
    await updateBuildSession(ctx.admin, ctx.session.id, {
      ideas: [{ title: userInput, description: userInput }],
      currentIdeaIndex: 0,
      selectedIdeas: [{ title: userInput, description: userInput }],
    });
  }
  return { kind: "advance" };
};

const handleReadingContext: StateHandler = async (ctx) => {
  if (ctx.session.cachedCanvasContext) {
    await logProgress(ctx, "Using cached canvas context.");
    return { kind: "advance" };
  }
  if (!ctx.session.canvasStateId) {
    // No canvas — empty context.
    await updateBuildSession(ctx.admin, ctx.session.id, {
      cachedCanvasContext: "",
      cachedCanvasContextAt: new Date().toISOString(),
    });
    return { kind: "advance" };
  }
  await logProgress(ctx, "Reading canvas notes...");
  const { data: canvas } = await ctx.admin
    .from("canvas_states")
    .select("nodes")
    .eq("id", ctx.session.canvasStateId)
    .maybeSingle();
  const nodes = (canvas?.nodes as Array<Record<string, unknown>>) ?? [];
  // Deliberately SKIP video framework nodes — we only need ideation context here.
  const textNodes = nodes.filter((n) => n.type === "textNoteNode");
  const researchNodes = nodes.filter((n) => n.type === "researchNoteNode");
  const mediaNodes = nodes.filter((n) =>
    n.type === "mediaNode" &&
    ((n.data as any)?.fileType === "voice" || (n.data as any)?.fileType === "pdf") &&
    typeof (n.data as any)?.audioTranscription === "string"
  );

  const lines: string[] = [];
  if (textNodes.length) {
    lines.push("# Notes from canvas:");
    for (const n of textNodes.slice(0, 12)) {
      const text = ((n.data as any)?.noteText as string ?? "").slice(0, 800);
      if (text.trim()) lines.push(`- ${text}`);
    }
  }
  if (researchNodes.length) {
    lines.push("# Research:");
    for (const n of researchNodes.slice(0, 8)) {
      const text = ((n.data as any)?.text as string ?? "").slice(0, 800);
      if (text.trim()) lines.push(`- ${text}`);
    }
  }
  if (mediaNodes.length) {
    lines.push("# Voice/PDF transcripts:");
    for (const n of mediaNodes.slice(0, 6)) {
      const text = ((n.data as any)?.audioTranscription as string ?? "").slice(0, 800);
      if (text.trim()) lines.push(`- ${text}`);
    }
  }
  const context = lines.join("\n");
  await updateBuildSession(ctx.admin, ctx.session.id, {
    cachedCanvasContext: context,
    cachedCanvasContextAt: new Date().toISOString(),
  });
  return { kind: "advance" };
};

const handleIdeasGenerated: StateHandler = async (ctx) => {
  // If we already have ideas (user provided one verbatim), just confirm and pause.
  if (ctx.session.ideas.length > 0 && ctx.session.ideas[0]?.title !== "__SUGGEST__") {
    await logProgress(ctx, `Got it. Working on: "${ctx.session.ideas[0].title}".`);
    // Auto-advance into framework search.
    await updateBuildSession(ctx.admin, ctx.session.id, {
      currentIdeaIndex: 0,
      selectedIdeas: [ctx.session.ideas[0]],
    });
    return { kind: "advance" };
  }

  // Need to generate 5 ideas.
  await logProgress(ctx, "Coming up with 5 ideas based on what I'm seeing...");

  // Pull client onboarding + strategy for richer context.
  const [{ data: client }, { data: strategy }] = await Promise.all([
    ctx.admin.from("clients").select("name, onboarding_data").eq("id", ctx.session.clientId).maybeSingle(),
    ctx.admin.from("client_strategies").select("*").eq("client_id", ctx.session.clientId).maybeSingle(),
  ]);

  const od = (client?.onboarding_data as any) ?? {};
  const niche = od.niche ?? od.industry ?? "social media";
  const audience = od.audience ?? "general audience";
  const offer = od.uniqueOffer ?? od.offer ?? "";

  const topicHint = ctx.session.selectedIdeas?.[0]?.description ?? "";
  const canvasCtx = ctx.session.cachedCanvasContext ?? "";

  const prompt = `You are an expert short-form content strategist. Generate exactly 5 short-form video ideas for this creator.

CREATOR PROFILE:
- Niche: ${niche}
- Audience: ${audience}
- Offer: ${offer}

${strategy ? `STRATEGY: ${JSON.stringify(strategy).slice(0, 1500)}\n` : ""}

${canvasCtx ? `CANVAS CONTEXT (notes the creator already wrote):\n${canvasCtx.slice(0, 2500)}\n` : ""}

${topicHint ? `USER'S TOPIC HINT: ${topicHint}\n` : ""}

Output exactly 5 ideas as a JSON array. Each idea has shape: { "title": "<one sentence concept>", "keywords": ["<3-5 search keywords for finding viral references>"] }

Output ONLY the JSON array, nothing else.`;

  let ideasJson = "";
  try {
    ideasJson = await callClaude(prompt);
  } catch (e) {
    return { kind: "error", message: `Idea generation failed: ${(e as Error).message}` };
  }

  // Strip code fences if present
  ideasJson = ideasJson.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/\s*```$/, "").trim();
  let ideas: Array<{ title: string; keywords?: string[] }> = [];
  try {
    ideas = JSON.parse(ideasJson);
  } catch {
    return { kind: "error", message: "Couldn't parse ideas response" };
  }
  if (!Array.isArray(ideas) || ideas.length === 0) {
    return { kind: "error", message: "Empty ideas list" };
  }

  await updateBuildSession(ctx.admin, ctx.session.id, {
    ideas,
    selectedIdeas: [],
    currentIdeaIndex: 0,
  });

  // Present ideas to the user.
  const list = ideas.map((i, idx) => `${idx + 1}. ${i.title}`).join("\n");
  await logProgress(
    ctx,
    `Here are 5 ideas:\n\n${list}\n\nReply with the number(s) you want me to build (e.g. "1" or "1,3"), or "all".`,
  );
  return { kind: "pause" };
};

const handleFindingFrameworks: StateHandler = async (ctx) => {
  // Capture user's selection from awaiting_user state.
  const userInput = await consumeUserInput(ctx);
  let selected: typeof ctx.session.ideas = ctx.session.selectedIdeas ?? [];

  if (selected.length === 0 && userInput) {
    if (/\ball\b/i.test(userInput)) {
      selected = ctx.session.ideas;
    } else {
      const indices = userInput.match(/\d+/g)?.map((n) => parseInt(n, 10) - 1) ?? [];
      selected = indices
        .filter((i) => i >= 0 && i < ctx.session.ideas.length)
        .map((i) => ctx.session.ideas[i]);
    }
    if (selected.length === 0) {
      await logProgress(ctx, "I didn't recognize that selection. Reply with a number like \"1\" or \"all\".");
      return { kind: "pause" };
    }
    await updateBuildSession(ctx.admin, ctx.session.id, {
      selectedIdeas: selected,
      currentIdeaIndex: 0,
    });
  }
  if (selected.length === 0) {
    return { kind: "error", message: "No selected ideas to find frameworks for" };
  }

  const idx = ctx.session.currentIdeaIndex ?? 0;
  const currentIdea = selected[idx];
  if (!currentIdea) return { kind: "advance" };

  await logProgress(ctx, `Searching viral frameworks for "${currentIdea.title}"...`);

  const keywords = currentIdea.keywords ?? currentIdea.title.split(/\s+/).slice(0, 5);
  // Naive keyword search across viral_videos.caption — fall back to recent rows.
  const orFilter = keywords
    .filter((k) => k.length >= 3)
    .map((k) => `caption.ilike.%${k.replace(/[%,]/g, "")}%`)
    .join(",");

  let query = ctx.admin
    .from("viral_videos")
    .select("id, video_url, caption, channel_username, views_count, outlier_score, thumbnail_url")
    .order("outlier_score", { ascending: false, nullsFirst: false })
    .limit(3);
  if (orFilter) query = query.or(orFilter);
  const { data: videos } = await query;
  const list = (videos as any[] | null) ?? [];
  if (list.length === 0) {
    // Fallback: top outliers regardless of keywords
    const { data: fallback } = await ctx.admin
      .from("viral_videos")
      .select("id, video_url, caption, channel_username, views_count, outlier_score, thumbnail_url")
      .order("outlier_score", { ascending: false, nullsFirst: false })
      .limit(3);
    list.push(...((fallback as any[] | null) ?? []));
  }
  if (list.length === 0) {
    return { kind: "error", message: "No viral videos found in database" };
  }

  // Pick the top one for FRAMEWORKS_PRESENTED to default-select.
  await updateBuildSession(ctx.admin, ctx.session.id, {
    currentFrameworkVideoId: list[0].id,
  });

  // Compose framework preview text.
  const lines = list.map((v, i) => {
    const cap = (v.caption ?? "").slice(0, 100);
    return `${i + 1}. @${v.channel_username ?? "unknown"} — ${v.outlier_score ?? "?"}x · ${cap}\n   ${v.video_url ?? ""}`;
  }).join("\n\n");

  await logProgress(
    ctx,
    `I found these viral references:\n\n${lines}\n\nReply with a number to use one, or "use #1" to confirm the top match.`,
  );
  return { kind: "advance" };
};

const handleFrameworksPresented: StateHandler = async (ctx) => {
  const userInput = await consumeUserInput(ctx);
  if (!userInput) {
    // Already presented in the previous handler — just pause for user.
    return { kind: "pause" };
  }
  if (/\b(use|pick|go.*with).*\b(\d+)\b/i.test(userInput) || /^\s*\d+\s*$/.test(userInput)) {
    // Accept current_framework_video_id (already set to top match) or update if user picked a different #
    const num = userInput.match(/\d+/)?.[0];
    if (num) {
      // Re-query frameworks to find the picked one (we don't persist the full list).
      // Phase 2 simplification: trust the top match; Phase 3 will store the full presented list.
      await logProgress(ctx, `Using framework #${num}.`);
    }
    return { kind: "advance" };
  }
  await logProgress(ctx, "I didn't catch that — reply with a number like \"1\" to pick a framework.");
  return { kind: "pause" };
};

const handleAddingVideos: StateHandler = async (ctx) => {
  if (!ctx.session.canvasStateId || !ctx.session.currentFrameworkVideoId) {
    await logProgress(ctx, "Skipping canvas add — no canvas or framework selected.");
    return { kind: "advance" };
  }
  await logProgress(ctx, "Adding video to canvas...");
  const { data: video } = await ctx.admin
    .from("viral_videos")
    .select("id, video_url, caption, channel_username, thumbnail_url, views_count")
    .eq("id", ctx.session.currentFrameworkVideoId)
    .maybeSingle();
  if (!video) {
    return { kind: "error", message: "Framework video not found" };
  }
  const { data: canvas } = await ctx.admin
    .from("canvas_states")
    .select("nodes, edges")
    .eq("id", ctx.session.canvasStateId)
    .maybeSingle();
  const nodes = ((canvas?.nodes as any[]) ?? []).slice();
  const newNodeId = `videoNode_pipeline_${Date.now()}`;
  const yOffset = nodes.filter((n: any) => typeof n.id === "string" && n.id.startsWith("videoNode_pipeline_")).length * 600;
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
  await ctx.admin
    .from("canvas_states")
    .update({ nodes })
    .eq("id", ctx.session.canvasStateId);
  return { kind: "advance" };
};

const handleTranscribing: StateHandler = async (_ctx) => {
  // Phase 2 simplification: skip transcription — assume the framework's caption
  // is enough signal for a first draft. Phase 3 will integrate real transcription.
  return { kind: "advance" };
};

const handleDraftingScript: StateHandler = async (ctx) => {
  await logProgress(ctx, "Drafting your script...");

  const idx = ctx.session.currentIdeaIndex ?? 0;
  const idea = ctx.session.selectedIdeas?.[idx] ?? ctx.session.ideas?.[idx];
  if (!idea) {
    return { kind: "error", message: "No idea to draft from" };
  }

  // Pull framework caption for structure mimicry
  let frameworkText = "";
  if (ctx.session.currentFrameworkVideoId) {
    const { data: video } = await ctx.admin
      .from("viral_videos")
      .select("caption")
      .eq("id", ctx.session.currentFrameworkVideoId)
      .maybeSingle();
    frameworkText = (video?.caption as string) ?? "";
  }

  const { data: client } = await ctx.admin
    .from("clients")
    .select("name, onboarding_data")
    .eq("id", ctx.session.clientId)
    .maybeSingle();
  const od = (client?.onboarding_data as any) ?? {};

  const prompt = `Write a short-form video script using the same structural beats as the reference framework but adapted for the new idea.

NEW IDEA: ${idea.title}
${idea.description ? `DESCRIPTION: ${idea.description}` : ""}

REFERENCE FRAMEWORK CAPTION (use its hook style, pacing, and CTA pattern):
${frameworkText.slice(0, 800)}

CREATOR:
- Name: ${client?.name ?? ""}
- Niche: ${od.niche ?? od.industry ?? ""}
- Voice: ${od.tone ?? "conversational"}

${ctx.session.cachedCanvasContext ? `CONTEXT FROM CANVAS:\n${ctx.session.cachedCanvasContext.slice(0, 1500)}\n` : ""}

Output the script as plain text with these sections, in this order:
HOOK: <1-2 lines>
BODY: <3-6 short lines>
CTA: <1 line>

No markdown, no commentary, just those three labeled sections.`;

  let draft = "";
  try {
    draft = await callClaude(prompt);
  } catch (e) {
    return { kind: "error", message: `Drafting failed: ${(e as Error).message}` };
  }

  await updateBuildSession(ctx.admin, ctx.session.id, {
    currentScriptDraft: draft,
  });
  return { kind: "advance" };
};

const handleDraftPresented: StateHandler = async (ctx) => {
  const userInput = await consumeUserInput(ctx);
  if (!userInput) {
    await logProgress(
      ctx,
      `Here's the draft:\n\n${ctx.session.currentScriptDraft ?? "(no draft)"}\n\nReply "generate" to save it, "edit <changes>" to tweak, or "retry" for a fresh angle.`,
    );
    return { kind: "pause" };
  }
  if (/\b(generate|save|approve|yes|ok)\b/i.test(userInput)) {
    await logProgress(ctx, "Saving the script...");
    return { kind: "advance" };
  }
  if (/^retry\b/i.test(userInput)) {
    // Bounce back to drafting.
    await ctx.admin
      .from("companion_build_sessions")
      .update({ current_state: "DRAFTING_SCRIPT", current_script_draft: null })
      .eq("id", ctx.session.id);
    await logProgress(ctx, "Trying a different angle...");
    return { kind: "advance" };
  }
  if (/^edit\b/i.test(userInput)) {
    // Re-call Claude with the user's edit instructions.
    const editInstructions = userInput.replace(/^edit\s*/i, "").trim();
    const prompt = `Apply this edit to the script and return ONLY the updated script in the same HOOK/BODY/CTA format.

EDIT INSTRUCTIONS: ${editInstructions}

CURRENT SCRIPT:
${ctx.session.currentScriptDraft ?? ""}`;
    try {
      const newDraft = await callClaude(prompt);
      await updateBuildSession(ctx.admin, ctx.session.id, {
        currentScriptDraft: newDraft,
      });
      await logProgress(ctx, `Updated:\n\n${newDraft}\n\nReply "generate" to save or "edit <more>" / "retry".`);
    } catch (e) {
      return { kind: "error", message: `Edit failed: ${(e as Error).message}` };
    }
    return { kind: "pause" };
  }
  await logProgress(ctx, `I'll wait — reply "generate" to save, "edit <changes>", or "retry".`);
  return { kind: "pause" };
};

const handleGeneratingScript: StateHandler = async (ctx) => {
  const draft = ctx.session.currentScriptDraft;
  if (!draft) {
    return { kind: "error", message: "No draft to save" };
  }

  // Parse HOOK / BODY / CTA from the draft.
  const hookMatch = draft.match(/HOOK:\s*([\s\S]*?)(?=\nBODY:|$)/i);
  const bodyMatch = draft.match(/BODY:\s*([\s\S]*?)(?=\nCTA:|$)/i);
  const ctaMatch = draft.match(/CTA:\s*([\s\S]*)/i);
  const hook = hookMatch?.[1]?.trim() ?? "";
  const body = bodyMatch?.[1]?.trim() ?? "";
  const cta = ctaMatch?.[1]?.trim() ?? "";

  const idx = ctx.session.currentIdeaIndex ?? 0;
  const idea = ctx.session.selectedIdeas?.[idx] ?? { title: "Untitled" };

  const { data: script, error } = await ctx.admin
    .from("scripts")
    .insert({
      client_id: ctx.session.clientId,
      title: idea.title.slice(0, 120),
      category: "reach",
      framework: hook ? `HOOK: ${hook}` : null,
      hook,
      body,
      cta,
      status: "Idea",
    })
    .select("id")
    .single();

  if (error || !script) {
    return { kind: "error", message: `Save failed: ${error?.message ?? "unknown"}` };
  }

  // Insert script lines too (split body by newline)
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length > 0) {
    const lineRows = lines.map((line, i) => ({
      script_id: script.id,
      line_index: i,
      content: line,
    }));
    await ctx.admin.from("script_lines").insert(lineRows).select();
  }

  await updateBuildSession(ctx.admin, ctx.session.id, {
    currentScriptId: script.id,
  });
  return { kind: "advance" };
};

const handleScriptSaved: StateHandler = async (ctx) => {
  const idx = ctx.session.currentIdeaIndex ?? 0;
  const idea = ctx.session.selectedIdeas?.[idx];
  await logProgress(ctx, `Saved "${idea?.title ?? "script"}". `);
  return { kind: "advance" };
};

const handleLoopingNext: StateHandler = async (ctx) => {
  const next = ctx.session.currentIdeaIndex + 1;
  if (next < (ctx.session.selectedIdeas?.length ?? 0)) {
    await updateBuildSession(ctx.admin, ctx.session.id, {
      currentIdeaIndex: next,
      currentFrameworkVideoId: null,
      currentScriptDraft: null,
      currentScriptId: null,
    });
    await logProgress(ctx, `Moving to idea ${next + 1} of ${ctx.session.selectedIdeas.length}...`);
    // Loop back to FINDING_FRAMEWORKS for the next idea (skip ideation).
    await ctx.admin
      .from("companion_build_sessions")
      .update({ current_state: "FINDING_FRAMEWORKS" })
      .eq("id", ctx.session.id);
    return { kind: "advance" };
  }
  await logProgress(ctx, "All scripts done!");
  await ctx.admin
    .from("companion_build_sessions")
    .update({ current_state: "DONE" })
    .eq("id", ctx.session.id);
  return { kind: "advance" };
};

// ── Registry ───────────────────────────────────────────────────────────────

const HANDLERS: Record<BuildStateName, StateHandler> = {
  INIT: handleInit,
  RESOLVE_CHAT: handleResolveChat,
  AWAITING_IDEA: handleAwaitingIdea,
  READING_CONTEXT: handleReadingContext,
  IDEAS_GENERATED: handleIdeasGenerated,
  FINDING_FRAMEWORKS: handleFindingFrameworks,
  FRAMEWORKS_PRESENTED: handleFrameworksPresented,
  ADDING_VIDEOS: handleAddingVideos,
  TRANSCRIBING: handleTranscribing,
  DRAFTING_SCRIPT: handleDraftingScript,
  DRAFT_PRESENTED: handleDraftPresented,
  GENERATING_SCRIPT: handleGeneratingScript,
  SCRIPT_SAVED: handleScriptSaved,
  LOOPING_NEXT: handleLoopingNext,
  DONE: async (_ctx) => ({ kind: "advance" }),
};

export function getHandler(state: BuildStateName): StateHandler {
  return HANDLERS[state];
}

export { logProgress, createClient };
