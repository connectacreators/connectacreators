// supabase/functions/companion-chat/build-mode.ts
// Dedicated handler for the conversational script builder.
//
// Why this is separate from companion-chat's main flow:
//   - Focused system prompt (no 19 competing rules)
//   - Only the 8 build tools available — no chance of calling the wrong tool
//   - Multi-round Claude execution so the LLM can chain steps in one user turn
//     (e.g., read canvas → generate ideas → present, all without user pinging)
//   - Pre-processes URLs deterministically so URL handling doesn't depend on the LLM
//
// Routing: companion-chat/index.ts checks at the top of every request whether
// a build session exists OR a build trigger was detected, and if so routes here.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import type { BuildSession } from "../_shared/build-session/types.ts";
import {
  createBuildSession,
  getActiveBuildSessionForThread,
  getBuildSession,
} from "../_shared/build-session/service.ts";
import {
  handleBuildTool,
  type BuildToolContext,
  handleAddUrlToViralDatabase,
  handleAddVideoToCanvas,
} from "./build-tool-handlers.ts";

// ── Constants ────────────────────────────────────────────────────────────────

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const ANTHROPIC_MODEL = "claude-sonnet-4-6";
const MAX_ROUNDS = 6; // tool-call rounds per user message

const URL_RE = /https?:\/\/(?:www\.)?(?:instagram\.com|tiktok\.com|youtube\.com|youtu\.be)\/[^\s]+/gi;

// ── Build tool schemas (THE ONLY TOOLS available in build mode) ──────────────

const BUILD_TOOLS = [
  {
    name: "resolve_client",
    description: "Switch the build session to work on a specific client. Call this when the user names a client (e.g. on /ai page where no client is locked from URL). Do NOT call if client is already known.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "Client name or partial name" },
      },
      required: ["client_name"],
    },
  },
  {
    name: "get_canvas_context",
    description: "Read the client's active Super Canvas — text notes, voice transcripts, research notes. Skips video framework nodes. Cached after first call. Call this BEFORE generate_script_ideas if not cached. Do NOT call repeatedly in the same conversation.",
    input_schema: {
      type: "object",
      properties: {
        client_id: { type: "string", description: "The client's UUID" },
      },
      required: ["client_id"],
    },
  },
  {
    name: "generate_script_ideas",
    description: "Generate 5 short-form video idea options based on the client's canvas + strategy + onboarding. Call this once when the user asks for ideas. Do NOT call again in the same conversation unless user explicitly asks for new ideas.",
    input_schema: {
      type: "object",
      properties: {
        client_id: { type: "string", description: "The client's UUID" },
        topic_hint: { type: "string", description: "Optional: user's specific topic" },
      },
      required: ["client_id"],
    },
  },
  {
    name: "search_viral_frameworks",
    description: "Find 3 viral references most relevant to an idea. Returns video URL, thumbnail, caption, channel. Call ONCE per idea. If returns no results, do NOT call again — instead ask user to paste URLs.",
    input_schema: {
      type: "object",
      properties: {
        idea_title: { type: "string", description: "The idea we're finding a framework for" },
        keywords: { type: "array", items: { type: "string" }, description: "3-5 keywords from the idea" },
      },
      required: ["idea_title", "keywords"],
    },
  },
  {
    name: "add_url_to_viral_database",
    description: "Add a user-pasted Instagram/TikTok reel URL to the viral_videos database. NOTE: URLs in the user message are pre-processed automatically — only call this for URLs that aren't already added (rare).",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The full video URL" },
        client_id: { type: "string", description: "The client's UUID" },
      },
      required: ["url", "client_id"],
    },
  },
  {
    name: "add_video_to_canvas",
    description: "Add the chosen viral reference video as a VideoNode on the client's canvas. Auto-transcribes when user opens canvas. Does NOT navigate.",
    input_schema: {
      type: "object",
      properties: {
        client_id: { type: "string", description: "The client's UUID" },
        video_id: { type: "string", description: "The viral_videos row UUID" },
      },
      required: ["client_id", "video_id"],
    },
  },
  {
    name: "draft_script",
    description: "Write a script draft (HOOK/BODY/CTA) mirroring the framework's structure but adapted to the idea + client voice. The tool fetches the framework's full transcript from viral_videos by id (auto-transcribing on demand if needed) so the draft is grounded on real content, not just the caption. Call AFTER add_video_to_canvas — the same video_id you passed to add_video_to_canvas goes here.",
    input_schema: {
      type: "object",
      properties: {
        client_id: { type: "string", description: "The client's UUID" },
        idea_title: { type: "string", description: "The idea title" },
        framework_video_id: { type: "string", description: "The viral_videos UUID of the chosen framework — same id passed to add_video_to_canvas" },
      },
      required: ["client_id", "idea_title", "framework_video_id"],
    },
  },
  {
    name: "save_script",
    description: "Save the approved draft to the client's library. Only call after user approval ('yes', 'generate', 'looks good'). Does NOT navigate.",
    input_schema: {
      type: "object",
      properties: {
        client_id: { type: "string", description: "The client's UUID" },
        title: { type: "string", description: "Script title (the idea title)" },
        hook: { type: "string", description: "The hook lines" },
        body: { type: "string", description: "Body lines on separate lines" },
        cta: { type: "string", description: "Call to action" },
      },
      required: ["client_id", "title", "hook", "body", "cta"],
    },
  },
];

// ── Build trigger ────────────────────────────────────────────────────────────

// Matches script-build intent broadly — "build me a script", "draft a script",
// "give me 3 scripts", "I need a script", "generate scripts about X", etc.
// Plurals via scripts?, optional count via \d+, optional article/me filler.
export const BUILD_TRIGGER = /\b(let'?s\s+)?(build|write|create|make|draft|generate|need|give\s+me)\s+(me\s+)?(\d+\s+|a\s+|an\s+|some\s+)?\s*scripts?\b/i;

// Matches the framework-first flow: "replicate these videos", "I want to copy these"
const FRAMEWORK_TRIGGER = /\b(replicate|copy|mimic|model|remix|base.*on|use.*as.*framework|want.*these|want.*to.*replicate|want.*to.*copy)\b/i;

// Returns true if the message is a framework-first build trigger (user dropping URLs to replicate)
function isFrameworkFirstTrigger(message: string): boolean {
  const urlCount = (message.match(URL_RE) ?? []).length;
  // 2+ URLs alone = framework-first (user clearly dropping a list of references)
  if (urlCount >= 2) return true;
  // 1+ URLs + explicit replication intent
  if (urlCount >= 1 && FRAMEWORK_TRIGGER.test(message)) return true;
  return false;
}

// ── URL pre-processing ───────────────────────────────────────────────────────

interface PreProcessedUrl {
  url: string;
  videoId: string;
  channelUsername: string;
  // Populated after analysis (may be null if analysis timed out or failed)
  hookText: string | null;
  ctaText: string | null;
  frameworkMeta: {
    niche_tags?: string[];
    audience?: string;
    body_structure?: string;
    content_type?: string | null;
    visual_pacing?: { tempo?: string | null };
  } | null;
}

const SUPABASE_URL_BUILD = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY_BUILD = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function preProcessUrls(
  message: string,
  userId: string,
  userAuthHeader: string | null,
  client: { id: string; name: string | null },
  threadId: string | null,
  buildSession: BuildSession | null,
  adminClient: SupabaseClient,
): Promise<PreProcessedUrl[]> {
  const urls = message.match(URL_RE);
  if (!urls || urls.length === 0) return [];

  const ctx: BuildToolContext = {
    adminClient,
    userId,
    userAuthHeader,
    client,
    buildSession,
    threadId,
    progressIds: [],
  };

  // Step 1: Add all URLs to viral_videos (up to 5)
  const added: { url: string; videoId: string; channelUsername: string }[] = [];
  for (const url of urls.slice(0, 5)) {
    try {
      const resultText = await handleAddUrlToViralDatabase({ url, client_id: client.id }, ctx);
      const idMatch = resultText.match(/Video ID:\s*([0-9a-f-]+)/i);
      const userMatch = resultText.match(/@(\S+)\./);
      if (!idMatch) continue;
      added.push({ url, videoId: idMatch[1], channelUsername: userMatch?.[1] ?? "unknown" });
    } catch (e) {
      console.warn(`[build-mode] preProcessUrls add failed for ${url}:`, (e as Error).message);
    }
  }
  if (added.length === 0) return [];

  const isSingleUrl = added.length === 1;

  // Step 2: If single URL (existing flow) — auto-add to canvas, fire background analysis
  if (isSingleUrl) {
    const { url, videoId } = added[0];
    if (buildSession?.canvasStateId) {
      try {
        await handleAddVideoToCanvas({ client_id: client.id, video_id: videoId }, ctx);
      } catch (e) {
        console.warn(`[build-mode] auto add_video_to_canvas failed for ${videoId}:`, (e as Error).message);
      }
    }
    // Background analysis — don't wait
    void fetch(`${SUPABASE_URL_BUILD}/functions/v1/analyze-viral-video`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY_BUILD}` },
      body: JSON.stringify({ video_id: videoId, force: true }),
    }).catch(() => {});
    return [{ url, videoId, channelUsername: added[0].channelUsername, hookText: null, ctaText: null, frameworkMeta: null }];
  }

  // Step 3: Multiple URLs — trigger ALL analyses in parallel, wait up to 40s
  // Don't auto-add to canvas yet — user picks which ones to build
  console.log(`[build-mode] analyzing ${added.length} user-provided frameworks in parallel`);
  const analysisPromises = added.map(({ videoId }) =>
    Promise.race<any>([
      fetch(`${SUPABASE_URL_BUILD}/functions/v1/analyze-viral-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY_BUILD}` },
        body: JSON.stringify({ video_id: videoId, force: true }),
      }).then((r) => r.json()).catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 40_000)),
    ])
  );
  await Promise.allSettled(analysisPromises);

  // Step 4: Read back structural data for all videos
  const results: PreProcessedUrl[] = [];
  for (const { url, videoId, channelUsername } of added) {
    try {
      const { data: video } = await adminClient
        .from("viral_videos")
        .select("id, channel_username, hook_text, cta_text, framework_meta")
        .eq("id", videoId)
        .maybeSingle();
      results.push({
        url,
        videoId,
        channelUsername: (video?.channel_username as string | null) ?? channelUsername,
        hookText: (video?.hook_text as string | null) ?? null,
        ctaText: (video?.cta_text as string | null) ?? null,
        frameworkMeta: (video?.framework_meta as any) ?? null,
      });
    } catch (e) {
      console.warn(`[build-mode] read-back failed for ${videoId}:`, (e as Error).message);
      results.push({ url, videoId, channelUsername, hookText: null, ctaText: null, frameworkMeta: null });
    }
  }
  return results;
}

// ── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(args: {
  client: { id: string; name: string | null };
  buildSession: BuildSession;
  preProcessedUrls: PreProcessedUrl[];
  isOnAiPage: boolean;
}): string {
  const { client, buildSession: bs, preProcessedUrls, isOnAiPage } = args;

  const ideasStr = bs.ideas.length > 0
    ? bs.ideas.map((idea, idx) => `${idx + 1}. ${idea.title}`).join("\n")
    : "(not generated yet)";

  const selectedStr = bs.selectedIdeas.length > 0
    ? bs.selectedIdeas.map((idea, idx) => `${idx + 1}. ${idea.title}`).join("\n")
    : "(not selected yet)";

  const currentIdea = bs.selectedIdeas[bs.currentIdeaIndex];
  const currentIdeaStr = currentIdea
    ? `${bs.currentIdeaIndex + 1}. ${currentIdea.title}`
    : "(none)";

  const isSingleUrl = preProcessedUrls.length === 1;
  const isMultiUrl = preProcessedUrls.length > 1;

  const urlsBlock = preProcessedUrls.length > 0
    ? isSingleUrl
      // ── Single URL: existing flow — auto-placed on canvas, go straight to draft ──
      ? `

USER-PROVIDED FRAMEWORK (already added to viral_videos and placed on canvas):
- video_id=${preProcessedUrls[0].videoId} (@${preProcessedUrls[0].channelUsername}) | ${preProcessedUrls[0].url}

Skip search_viral_frameworks. Proceed directly: ask what idea to build with this framework, then call draft_script with framework_video_id=${preProcessedUrls[0].videoId}.`

      // ── Multiple URLs: show full breakdown, let user pick ──
      : `

USER PROVIDED ${preProcessedUrls.length} FRAMEWORK VIDEOS (already added to viral_videos):
${preProcessedUrls.map((u, i) => {
  const fm = u.frameworkMeta ?? {};
  const niches = Array.isArray(fm.niche_tags) ? fm.niche_tags.join(", ") : "";
  const tempo = fm.visual_pacing?.tempo ?? "";
  const contentType = fm.content_type ?? "";
  const analyzed = u.hookText || fm.body_structure;
  return `${i + 1}. @${u.channelUsername} — video_id=${u.videoId}
   ${analyzed
     ? `Type: ${contentType || "unknown"}${tempo ? ` | Pacing: ${tempo}` : ""}${niches ? ` | Niche: ${niches}` : ""}
   Hook: "${u.hookText ?? "(analyzing...)"}"
   Body: ${fm.body_structure ?? "(analyzing...)"}
   CTA: "${u.ctaText ?? "(analyzing...)"}"`
     : `(analysis in progress — structure data not available yet)`}
   URL: ${u.url}`;
}).join("\n\n")}

WORKFLOW FOR THIS MULTI-URL BUILD:
1. Present the breakdown above to the user. Show them what you see in each framework.
2. Ask: "Which of these do you want to build a script for? I can do all ${preProcessedUrls.length} or specific ones."
3. For each video the user selects (in order):
   a. Ask what IDEA to adapt into this framework's structure (or suggest one from their canvas context)
   b. Call add_video_to_canvas with that video's video_id
   c. Call draft_script with the framework_video_id
   d. Show HOOK / BODY / CTA draft. Ask "Ready to generate?"
   e. On approval, call save_script. Then move to the next one.
4. NEVER call search_viral_frameworks — the user already provided the frameworks.
5. NEVER auto-pick idea #1 silently — always confirm with the user which idea they want for each video.`
    : "";

  return `You are an expert short-form video strategist helping a creator build their next script. You guide them through a step-by-step conversation, narrating what you're doing as you work.

THE CLIENT YOU'RE WORKING ON:
Client: ${client.name ?? "(not yet resolved)"}${client.name ? ` (id: ${client.id})` : ""}

WHAT'S BEEN DONE SO FAR:
- Canvas context: ${bs.cachedCanvasContext !== null ? "cached ✓" : "not read yet"}
- Ideas: ${bs.ideas.length === 0 ? "(not generated yet)" : `\n${ideasStr}`}
- Ideas user selected: ${bs.selectedIdeas.length === 0 ? "(not selected yet)" : `\n${selectedStr}`}
- Current idea (${bs.currentIdeaIndex + 1} of ${bs.selectedIdeas.length || "?"}): ${currentIdeaStr}
- Framework chosen: ${bs.currentFrameworkVideoId ? `id:${bs.currentFrameworkVideoId}` : "(not picked yet)"}
- Script draft: ${bs.currentScriptDraft ? "exists ✓ (full text below)" : "(not drafted yet)"}
- Script saved: ${bs.currentScriptId ? `yes (id:${bs.currentScriptId})` : "no"}${urlsBlock}${bs.currentScriptDraft ? `

CURRENT SCRIPT DRAFT (use these exact strings to call save_script when user approves):
${bs.currentScriptDraft}` : ""}

THE WORKFLOW (follow this order — but skip steps that are already done above):
1. ${isOnAiPage && !client.name ? "Ask which client to work on, then call resolve_client." : "Greet the user briefly. Ask: \"What idea is on your mind? Or say 'give me 5 ideas' and I'll suggest some based on their strategy.\""}
2. If user wants suggestions: call get_canvas_context (only if not cached), then call generate_script_ideas. Present the 5 ideas as a numbered list. Ask: "Which idea(s) do you want to build? Reply with a number, multiple numbers, or 'all'."
3. If user picks an IDEA (e.g., "1", "build idea 2", "first one"): map their pick to ideas[N-1] from the list, tell them which you're working on, then call search_viral_frameworks with that idea's title and keywords (or skip if URLs were pre-processed). Present 3 references with their URLs. Ask: "Which one feels right? Or paste your own."
4. If user picks a FRAMEWORK (e.g., "1", "go with #1", "use the first one") AFTER frameworks were shown: the top match is already stored as current_framework_video_id (see context block above). Call add_video_to_canvas with that video_id, then call draft_script with framework_video_id set to the SAME video_id. The tool fetches the framework's transcript itself — you do NOT pass a caption. Do NOT call search_viral_frameworks again. Show HOOK / BODY / CTA labels clearly. Ask: "Ready to generate?"
5. If user approves (says "generate", "yes", "save it", "looks good", "go ahead"): IMMEDIATELY call save_script with the HOOK/BODY/CTA from the CURRENT SCRIPT DRAFT in your context above. Parse the HOOK / BODY / CTA sections from the draft text. Do NOT ask for confirmation again — the user already approved. After saving, say "Perfect! Now let's work on the next one." and loop to step 3 for the next idea.

RULES:
- Answer ANY question the user asks. Off-topic questions get answered briefly, then return to the build.
- Be conversational and warm. Use the client's name and real details.
- Tools insert their own progress messages — do NOT duplicate them. Just respond to the result.
- Never call multiple tools in parallel unless they're truly independent (rare).
- If a tool returns an error or "no results", tell the user clearly and offer alternatives. Do NOT retry the same tool with the same input.
- If the user pastes URLs, they're already in viral_videos AND on the canvas (see URLS DETECTED above). Skip search_viral_frameworks AND skip add_video_to_canvas for that URL — go straight to draft_script.
- NEVER attribute a script to a framework or creator that isn't actually the chosen framework_video_id. If draft_script returns "(no framework content — generating ungrounded)", tell the user honestly that the script isn't grounded on a specific framework yet and ask if they want to paste a reference or wait for the canvas to transcribe.
- NEVER navigate away from the chat. Everything happens here.
- When you're waiting for the user (e.g., to pick an idea), respond with text only — no tool calls. The user will reply.

Be specific. Be human. Don't say "On it." with no detail. Always tell the user what you're doing and why.`;
}

// ── Multi-round Claude executor ──────────────────────────────────────────────

interface CallClaudeArgs {
  system: string;
  tools: typeof BUILD_TOOLS;
  messages: Array<{ role: "user" | "assistant"; content: any }>;
}

async function callClaude(args: CallClaudeArgs): Promise<any> {
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
      system: args.system,
      tools: args.tools,
      messages: args.messages,
    }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Claude API error: ${json.error?.message ?? res.statusText}`);
  }
  return json;
}

// ── Main entry point ─────────────────────────────────────────────────────────

export interface HandleBuildTurnArgs {
  message: string;
  user: { id: string };
  /** Bearer token forwarded from the original /ai request, used to call other
   * edge functions (transcribe-video) on behalf of the user. */
  userAuthHeader: string | null;
  client: { id: string; name: string | null };
  threadId: string;
  adminClient: SupabaseClient;
  isOnAiPage: boolean;
  existingBuildSession: BuildSession | null;
  buildTriggerMatched: boolean;
}

export interface HandleBuildTurnResult {
  reply: string;
  buildSessionId: string | null;
}

export async function handleBuildTurn(
  args: HandleBuildTurnArgs,
): Promise<HandleBuildTurnResult> {
  const { message, user, userAuthHeader, client, threadId, adminClient, isOnAiPage, buildTriggerMatched } = args;
  let buildSession = args.existingBuildSession;

  console.log("[build-mode] starting turn", {
    user_id: user.id,
    client_id: client.id,
    thread_id: threadId,
    has_session: !!buildSession,
    trigger_matched: buildTriggerMatched,
    message_preview: message.slice(0, 80),
  });

  // 1. Create session if trigger matched and no session exists
  if (!buildSession && buildTriggerMatched) {
    const { data: activeCanvas } = await adminClient
      .from("canvas_states")
      .select("id")
      .eq("client_id", client.id)
      .eq("is_active", true)
      .maybeSingle();

    try {
      buildSession = await createBuildSession(adminClient, {
        userId: user.id,
        clientId: client.id,
        threadId,
        canvasStateId: activeCanvas?.id ?? null,
        autoPilot: false,
      });
      // Set initial phase
      await adminClient
        .from("companion_build_sessions")
        .update({ phase: "Starting build..." })
        .eq("id", buildSession.id);
      console.log("[build-mode] created session", buildSession.id);
    } catch (e) {
      console.error("[build-mode] createBuildSession failed:", (e as Error).message);
      return {
        reply: "Sorry, I had trouble starting the build. Please try again.",
        buildSessionId: null,
      };
    }
  }

  if (!buildSession) {
    // This shouldn't happen if routing is correct, but defend against it
    return {
      reply: "Build session not found. Try saying 'build me a script' to start.",
      buildSessionId: null,
    };
  }

  // 2. Pre-process URLs in user message — auto-add to viral_videos AND auto-place
  //    on the canvas (don't trust the LLM to call add_video_to_canvas reliably).
  const preProcessedUrls = await preProcessUrls(
    message,
    user.id,
    userAuthHeader,
    client,
    threadId,
    buildSession,
    adminClient,
  );
  console.log("[build-mode] pre-processed URLs:", preProcessedUrls.length);

  // 3. Insert user message to thread
  {
    const { error: insertErr } = await adminClient.from("assistant_messages").insert({
      thread_id: threadId,
      role: "user",
      content: { type: "text", text: message },
    });
    if (insertErr) console.warn("[build-mode] insert user msg failed:", insertErr.message);
  }

  // 4. Build system prompt
  const systemPrompt = buildSystemPrompt({
    client,
    buildSession,
    preProcessedUrls,
    isOnAiPage,
  });

  // 5. Multi-round Claude execution
  const messages: Array<{ role: "user" | "assistant"; content: any }> = [
    { role: "user", content: message },
  ];

  let finalReply = "";

  for (let round = 0; round < MAX_ROUNDS; round++) {
    console.log(`[build-mode] round ${round + 1}/${MAX_ROUNDS}`);

    let response: any;
    try {
      response = await callClaude({
        system: systemPrompt,
        tools: BUILD_TOOLS,
        messages,
      });
    } catch (e) {
      console.error("[build-mode] Claude call failed:", (e as Error).message);
      finalReply = `Hmm, something went wrong on my end. Try again?\n\nError: ${(e as Error).message}`;
      break;
    }

    console.log(`[build-mode] round ${round + 1} stop_reason:`, response.stop_reason);

    // Check for paused status BEFORE processing the response
    const fresh = await getBuildSession(adminClient, buildSession.id);
    if (fresh?.status === "paused" || fresh?.status === "cancelled") {
      finalReply = fresh.status === "paused"
        ? "Paused. Reply whenever you're ready to continue."
        : "Build cancelled.";
      console.log(`[build-mode] session ${fresh.status}, exiting loop`);
      break;
    }

    if (response.stop_reason === "end_turn") {
      // Final text response
      const textBlocks = (response.content as any[]).filter((b) => b.type === "text");
      finalReply = textBlocks.map((b: any) => b.text).join("\n\n");
      break;
    }

    if (response.stop_reason === "tool_use") {
      const toolUseBlocks = (response.content as any[]).filter((b) => b.type === "tool_use");
      const textBlocks = (response.content as any[]).filter((b) => b.type === "text");

      // If LLM emitted text + tools, use the text as final reply (will overwrite if tools call also produces text later)
      if (textBlocks.length > 0) {
        finalReply = textBlocks.map((b: any) => b.text).join("\n\n");
      }

      // Reload buildSession (it may have been updated by previous tool calls)
      const refreshed = await getBuildSession(adminClient, buildSession.id);

      const toolResults: any[] = [];
      for (const block of toolUseBlocks) {
        // Fresh progressIds accumulator per tool call so each tool only clears
        // ITS OWN progress messages when it finishes.
        const ctx: BuildToolContext = {
          adminClient,
          userId: user.id,
          userAuthHeader,
          client,
          buildSession: refreshed ?? buildSession,
          threadId,
          progressIds: [],
        };
        console.log(`[build-mode] tool call: ${block.name}`);
        const result = await handleBuildTool(block.name, block.input, block.id, ctx);
        if (result) {
          toolResults.push(result);
        } else {
          // Unknown tool — return error
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: `Unknown tool: ${block.name}. The available tools are: resolve_client, get_canvas_context, generate_script_ideas, search_viral_frameworks, add_url_to_viral_database, add_video_to_canvas, draft_script, save_script.`,
          });
        }
      }

      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: toolResults });

      // Refresh local buildSession reference for next round's prompt computation
      const after = await getBuildSession(adminClient, buildSession.id);
      if (after) buildSession = after;

      continue;
    }

    // Unexpected stop_reason
    console.warn("[build-mode] unexpected stop_reason:", response.stop_reason);
    const textBlocks = (response.content as any[]).filter((b) => b.type === "text");
    finalReply = textBlocks.map((b: any) => b.text).join("\n\n") || "Hmm, I'm not sure what to do next. Can you rephrase?";
    break;
  }

  if (!finalReply) {
    finalReply = "I worked through that — anything else?";
  }

  // 6. Insert final reply to thread
  {
    const { error: replyErr } = await adminClient.from("assistant_messages").insert({
      thread_id: threadId,
      role: "assistant",
      content: { type: "text", text: finalReply },
    });
    if (replyErr) console.warn("[build-mode] insert reply failed:", replyErr.message);
  }

  console.log("[build-mode] turn complete, reply length:", finalReply.length);

  return {
    reply: finalReply,
    buildSessionId: buildSession.id,
  };
}

/**
 * Should this message be routed to build mode?
 * Returns true if there's an active build session OR the message contains a build trigger.
 */
export async function shouldRouteToBuildMode(args: {
  threadId: string | null;
  message: string;
  adminClient: SupabaseClient;
}): Promise<{ route: boolean; existingSession: BuildSession | null; triggerMatched: boolean }> {
  const triggerMatched = BUILD_TRIGGER.test(args.message) || isFrameworkFirstTrigger(args.message);
  let existingSession: BuildSession | null = null;

  if (args.threadId) {
    existingSession = await getActiveBuildSessionForThread(args.adminClient, args.threadId)
      .catch(() => null);

    // Auto-resume paused sessions
    if (existingSession?.status === "paused") {
      await args.adminClient
        .from("companion_build_sessions")
        .update({ status: "running", phase: "Resuming..." })
        .eq("id", existingSession.id);
      existingSession = { ...existingSession, status: "running", phase: "Resuming..." };
    }
  }

  // M5: an existing build session shouldn't capture every future message on
  // the thread. If the user clearly switched topic ("what's my pipeline?",
  // "log this expense"), let it fall through to companion-chat for this turn.
  // Heuristic: route to build mode if EITHER the trigger fired OR the message
  // looks build-flavored (URL drop, idea picking, framework pick, "yes/sure/
  // do it" continuations, very short replies that are likely a continuation).
  const looksLikeContinuation =
    triggerMatched ||
    /\b(idea\s*\d+|first\s+one|second\s+one|build\s+(it|this)|yes|sure|do\s+it|let'?s\s+go|that\s+one|use\s+(it|this)|the\s+\d+)\b/i.test(args.message) ||
    /https?:\/\//i.test(args.message) ||
    args.message.trim().split(/\s+/).length <= 3;

  return {
    route: triggerMatched || (!!existingSession && looksLikeContinuation),
    existingSession,
    triggerMatched,
  };
}
