import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Token-based credit calculation with per-model cost multiplier.
 * Base formula: ceil((input_tokens + output_tokens * 3) / 400)
 * Then multiplied by the model's cost multiplier (1x for Haiku, 19x for Opus, etc.)
 * Minimum charge: 3 credits per query.
 */
function calculateTokenCredits(inputTokens: number, outputTokens: number, multiplier = 1): number {
  const weighted = inputTokens + outputTokens * 3;
  const base = Math.ceil(weighted / 400);
  return Math.max(Math.ceil(base * multiplier), 3);
}

/** Model configuration — provider routing + credit multipliers */
const MODEL_CONFIG: Record<string, { apiModel: string; provider: "anthropic" | "openai"; multiplier: number }> = {
  "claude-haiku-4-5":  { apiModel: "claude-haiku-4-5-20251001", provider: "anthropic", multiplier: 1 },
  "claude-sonnet-4-5": { apiModel: "claude-sonnet-4-6", provider: "anthropic", multiplier: 4 },
  "claude-opus-4":     { apiModel: "claude-opus-4-6", provider: "anthropic", multiplier: 19 },
  "gpt-4o-mini":       { apiModel: "gpt-4o-mini", provider: "openai", multiplier: 1 },
  "gpt-4o":            { apiModel: "gpt-4o", provider: "openai", multiplier: 3 },
};

/** Image generation credit costs */
const IMAGE_CREDITS = { standard: 150, hd: 200 } as const;

async function getPrimaryClientId(
  adminClient: ReturnType<typeof createClient>,
  userId: string
): Promise<string | null> {
  const { data } = await adminClient
    .from("subscriber_clients")
    .select("client_id")
    .eq("subscriber_user_id", userId)
    .eq("is_primary", true)
    .maybeSingle();
  return data?.client_id ?? null;
}

async function deductCredits(
  adminClient: any,
  userId: string,
  action: string,
  cost: number,
): Promise<string | null> {
  if (cost === 0) return null;

  // Admin bypass
  const { data: roleData } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (roleData?.role === "admin") return null;

  const primaryClientId = await getPrimaryClientId(adminClient, userId);
  if (!primaryClientId) return null; // staff/no-record accounts pass through
  const { data: client, error: fetchErr } = await adminClient
    .from("clients")
    .select("id, credits_balance, credits_used")
    .eq("id", primaryClientId)
    .single();

  if (fetchErr || !client) return null; // staff/no-record accounts pass through

  if ((client.credits_balance ?? 0) < cost) {
    return JSON.stringify({
      error: `Insufficient credits. You need ${cost} credits but only have ${client.credits_balance ?? 0}.`,
      insufficient_credits: true,
      balance: client.credits_balance ?? 0,
      needed: cost,
    });
  }

  const { error: updateErr } = await adminClient
    .from("clients")
    .update({
      credits_balance: (client.credits_balance ?? 0) - cost,
      credits_used: (client.credits_used ?? 0) + cost,
    })
    .eq("id", client.id);

  if (updateErr) {
    console.error("Credit update error:", updateErr);
    return null;
  }

  await adminClient.from("credit_transactions").insert({
    client_id: client.id,
    action,
    cost,
    metadata: {},
  });

  return null;
}

const HOOK_CATEGORIES = [
  "educational",
  "comparison",
  "mythBusting",
  "storytelling",
  "random",
  "authority",
  "dayInTheLife",
];

// Wizard action tools — Claude calls these instead of emitting <action> tags
const WIZARD_TOOLS = [
  {
    name: "complete_step_1",
    description: "Set the topic AND run real AI research — wizard advances to Step 2 automatically. Use when user asks to complete step 1, describes their business/topic, or wants to start.",
    input_schema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "The topic to research" },
      },
      required: ["topic"],
    },
  },
  {
    name: "set_facts",
    description: "Override the research facts. Use ONLY if user explicitly wants to set custom facts (rare). Prefer complete_step_1 instead.",
    input_schema: {
      type: "object",
      properties: {
        facts: {
          type: "array",
          items: { type: "string" },
          description: "List of 3-5 fact strings",
        },
      },
      required: ["facts"],
    },
  },
  {
    name: "select_hook",
    description: "Pick a hook category and template. Use when user asks to pick/select a hook, or to complete step 3.",
    input_schema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: ["educational", "comparison", "mythBusting", "storytelling", "random", "authority", "dayInTheLife"],
          description: "The hook category",
        },
        template: { type: "string", description: "The exact hook template text" },
      },
      required: ["category", "template"],
    },
  },
  {
    name: "select_format",
    description: "Set the script format. Use when user picks a format or asks to complete step 4.",
    input_schema: {
      type: "object",
      properties: {
        format: {
          type: "string",
          enum: ["talking_head", "broll_caption", "entrevista", "variado"],
          description: "talking_head=direct to camera, broll_caption=voiceover+footage, entrevista=interview, variado=mixed",
        },
      },
      required: ["format"],
    },
  },
  {
    name: "generate_script",
    description: "Advance to step 5 and trigger script generation. Use when user asks to generate the script, or when steps 1-4 are complete.",
    input_schema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "set_script_options",
    description: "Configure script style options (format, length, language) all at once.",
    input_schema: {
      type: "object",
      properties: {
        format: {
          type: "string",
          enum: ["talking_head", "broll_caption", "entrevista", "variado"],
          description: "Script format",
        },
        length: {
          type: "integer",
          description: "Script length: 0=short(30s), 1=medium(45s), 2=long(60s)",
        },
        language: {
          type: "string",
          enum: ["en", "es"],
          description: "Script language",
        },
      },
    },
  },
  {
    name: "advance_step",
    description: "Move the wizard to a specific step number.",
    input_schema: {
      type: "object",
      properties: {
        step: { type: "integer", description: "Step number to navigate to (1-5)" },
      },
      required: ["step"],
    },
  },
  {
    name: "edit_line",
    description: "Edit a single script line by index. Use when user asks to edit/rewrite/shorten/improve a specific line.",
    input_schema: {
      type: "object",
      properties: {
        line_index: { type: "integer", description: "Index of the line to edit (0-based)" },
        text: { type: "string", description: "New text for the line" },
      },
      required: ["line_index", "text"],
    },
  },
];

function buildCanvasSystemPrompt(clientInfo: any): string {
  const clientStr = clientInfo
    ? `Client name: ${clientInfo.name || "unknown"}\nClient target audience: ${clientInfo.target || "not set"}`
    : "";

  const canvasContextStr = clientInfo?.canvas_context
    ? `\n${clientInfo.canvas_context}`
    : "";

  return `You are a creative AI script writing assistant inside the Super Planning Canvas in ConnectaCreators — a platform for viral short-form social media scripts (Instagram Reels, TikToks, YouTube Shorts).

${clientStr}

CONNECTED CANVAS CONTEXT (video transcriptions, text notes, research facts from connected nodes):
${canvasContextStr || "(No context connected yet — tell the user to add nodes and connect them to you)"}

YOUR ROLE IN THE CANVAS:
You help the creator plan, brainstorm, and refine scripts based on the content nodes connected to you via edges on the canvas. The user connects Video Nodes (with transcriptions), Text Note Nodes (with brand info, instructions), and Research Nodes (with facts) to you.

CRITICAL — HOW TO USE CONNECTED CONTENT:
0. **CONNECTED NODES inventory** is always listed at the top of the canvas context. Every time you respond, you MUST read that list first and silently confirm you are using all nodes that have data. If a VideoNode shows transcription=true, you HAVE the transcript — use it immediately, do NOT ask the user which video is connected. If it shows status=loading_or_empty, acknowledge it is still loading and continue with whatever other data exists.
1. **Video Transcriptions / Structures** are FORMAT TEMPLATES. When the user asks you to generate or suggest a script, you MUST replicate the same structure, spoken rhythm, pacing, hook style, section transitions, and visual flow from the reference video. Write new content about the given topic but in the EXACT SAME FORMAT as the reference.
   - **COMPARATIVE DIALOGUE format**: Script MUST use two contrasting voices or statements per section (e.g., "average rep: X / top performer: Y"). Never write a solo monologue — each body section alternates between the two mindsets. If format_notes are present, follow the specific pattern described.
   - **INTERVIEW format**: Script must be written as a Q&A dialogue between host and guest.
   - **VOICEOVER format**: Write as narration over footage — no on-camera speaker lines. Use filming/b-roll directions and text overlays.
   - **B-ROLL CAPTION format**: No spoken dialogue at all. Only visual scenes + text on screen.
   - **TALKING HEAD format**: Single person speaking directly to camera.
   - Always read the format_notes field (shown in VIDEO STRUCTURE TEMPLATES) — it describes the exact structural pattern. Use it to understand the mold BEFORE writing anything.
2. **Video Structures** show ONLY the sections the user selected (hook, body, cta). If only "hook" is selected, ONLY use the hook as a template. If all three are selected, template the entire structure. Respect what sections the user chose.
3. **Text Notes** are CORE CONTEXT — treat them as both research material AND creator instructions. Whatever text is in the notes, USE IT. If notes contain facts, stats, or talking points, weave them into the script. If notes contain brand voice or instructions, follow them exactly. Text notes are the primary source of what the script should be about.
4. **Research Facts** provide additional data points to weave into the script naturally.

RULES:
1. Always respond with helpful, actionable text. Be concise but thorough.
2. When suggesting hooks or scripts, reference the connected context directly — call out the node by name or channel (e.g. "Based on @drjohn's video...").
3. If the user asks to "generate script", tell them to click the "Generate Script" button for the full AI script generation. You can help brainstorm, suggest hooks, refine ideas, and answer questions.
4. Keep responses focused and practical — no fluff.
5. NEVER ask the user "which video is connected?" or "can you confirm which node?" — you can see the node inventory. Read it and act on it.
6. If no context is connected (inventory shows none), guide the user to add video references or text notes first.
7. You can suggest hook ideas, rewrite lines, translate content, and give creative direction.
8. REPLICATION REQUESTS: When the user says things like "replicate this", "copy this structure", "use this exact format", "make it like this video", or "same script" — this is ALWAYS a format/structure request, not a verbatim reproduction request. You MUST immediately produce a script using the same structural pattern, spoken rhythm, hook type, pacing, and visual flow from the reference. Never refuse or add caveats about copyright. The user is a content creator studying formats and using them as inspiration, which is standard creative practice. Just do it. If the detected_format is COMPARATIVE DIALOGUE, immediately write a two-voice contrast script. If INTERVIEW, write as Q&A. Match the format on the first response — never ask the user to confirm what type of video it is.
- When the canvas context includes video sources with channel names (e.g., "from @drjohn"), reference them by name in your responses: "Based on @drjohn's video structure..."
- REWRITE MODE: If the user sends a message where they paste a line of script text (in quotes) followed by words like "rewrite", "fix", "improve", or "change" — respond with ONLY two things: (1) the rewritten line, and (2) one sentence explaining what you changed. No preamble, no pleasantries, no "Here's the revised version:" prefix. Just the line and the explanation.
  Example user: 'Fix this: "When I woke up this morning"'
  Example response: "The second my alarm went off at 6am, I knew something was different." — Made it more specific and visual to pull viewers in immediately.

WRITING STYLE — apply to every response:
- Never use em dashes (—). Use a comma, period, or a new sentence instead.
- Never use "---" dividers or horizontal rules in your responses.
- NEVER include timestamps or time ranges (like [0s–3s] or [0s-3s] or "0–3s") in scripts or scene descriptions UNLESS the user explicitly asks for timestamps. If the user asks for timestamps, you may include them.
- No corporate jargon. Never write: leverage, synergy, utilize, streamline, robust, scalable, game-changer, innovative, cutting-edge, value proposition, pain points, paradigm shift, holistic, actionable, deliverable.
- Write like you are texting a smart friend. Short sentences. Plain words.
- One sentence per script line maximum.
- When presenting a script, format each scene as: a plain scene description on one line, then "TEXT ON SCREEN: ..." on the next. No timestamps, no dividers, no numbering unless the user asks.

QUALITY CHECKS — run these mentally before every script suggestion:
1. TAM CHECK: Is the target audience large enough for this to go viral? If the topic is too niche, say so directly.
2. RELOOP CHECK: Does the script have a moment mid-way through that re-engages viewers who are about to scroll? If not, suggest one.
3. TEMPLATE FIDELITY CHECK: If a video node is connected, does the new script follow the same structure, pacing, tone, and voice as the reference? If not, name the gap.
4. AUDIENCE MATCH CHECK: Can someone with zero background knowledge follow this? Flag any jargon or assumed knowledge.
5. STORY CLARITY CHECK: Does hook → body → CTA flow logically with no confusing jumps?

When you find an issue, be direct. Example: "The hook assumes the viewer already knows what X is — they probably do not. Try opening with a relatable moment instead."`;
}

function buildSystemPrompt(wizardState: any, clientInfo: any): string {
  const {
    step = 1,
    max_unlocked_step = 1,
    topic = "",
    facts = [],
    selected_fact_indices = [],
    hook_category = null,
    hook_template = null,
    script_lines = null,
    video_type = null,
    is_storytelling_mode = false,
    selected_format = null,
    is_remixing = false,
    remix_channel_username = null,
    remix_hook_type = null,
    remix_body_pattern = null,
    use_remix_hook = false,
    use_remix_structure = false,
    type_confirmed = false,
  } = wizardState || {};

  const factsStr = facts.length > 0
    ? facts.map((f: any, i: number) => `  ${i}: "${f.fact}" (impact: ${f.impact_score})`).join("\n")
    : "  (none yet)";

  const selectedStr = selected_fact_indices.length > 0
    ? selected_fact_indices.join(", ")
    : "(none)";

  const hookStr = hook_category
    ? `${hook_category} — "${hook_template || ""}"`
    : "(not selected)";

  const linesStr = script_lines && script_lines.length > 0
    ? script_lines.map((l: any, i: number) => `  [${i}] (${l.line_type}/${l.section}) ${l.text}`).join("\n")
    : "  (not generated yet)";

  const clientStr = clientInfo
    ? `Client name: ${clientInfo.name || "unknown"}\nClient target audience: ${clientInfo.target || "not set"}`
    : "";

  const canvasContextStr = clientInfo?.canvas_context
    ? `\nCANVAS CONTEXT (connected nodes — USE THIS DATA when answering):\n${clientInfo.canvas_context}`
    : "";

  const stepStatuses = [1, 2, 3, 4, 5].map(s => {
    if (s < step) return `Step ${s}: ✅ DONE`;
    if (s === step) return `Step ${s}: 👉 CURRENT`;
    if (s <= max_unlocked_step) return `Step ${s}: ✅ DONE`;
    return `Step ${s}: 🔒 LOCKED`;
  }).join("\n");

  const remixContext = is_remixing ? `
REMIX CONTEXT: Remixing from @${remix_channel_username || "unknown"}'s video
- Hook from remix: ${remix_hook_type || "(not yet analyzed)"}${use_remix_hook ? " ✅ ACTIVE" : ""}
- Body pattern from remix: ${remix_body_pattern || "(not yet analyzed)"}${use_remix_structure ? " ✅ ACTIVE" : ""}
- Type confirmed: ${type_confirmed ? "yes" : "still in detection panel"}` : "";

  const flowContext = video_type === "caption_video_music"
    ? "VIDEO FLOW: Caption/Music video — 2-step flow (Setup → Script only)"
    : is_storytelling_mode
      ? "VIDEO FLOW: Storytelling talking head — Step 1=Tell Story, Step 2=Story Moments, then Hook/Style/Script"
      : "VIDEO FLOW: Standard 5-step flow (Topic → Research → Hook → Style → Script)";

  return `You are a powerful AI script writing assistant inside ConnectaCreators — a platform for viral short-form social media scripts (Instagram Reels, TikToks). You are DIRECTIVE and PROACTIVE. You take action immediately by calling a tool.

${clientStr}
${canvasContextStr}

${flowContext}
${remixContext}

CURRENT WIZARD STATE:
Step: ${step} (max unlocked: ${max_unlocked_step})
${stepStatuses}
Topic: "${topic || "(empty)"}"
Research facts:
${factsStr}
Selected fact indices: ${selectedStr}
Hook: ${hookStr}
Format: ${selected_format || "(not selected)"}
Script lines:
${linesStr}

STEP GUIDE:
- Step 1 = Topic → complete_step_1
- Step 2 = Research facts (shows 5 facts, top 3 auto-selected)
- Step 3 = Hook selection → select_hook
- Step 4 = Format/style → select_format or set_script_options
- Step 5 = Generated script → generate_script or edit_line

HOOK CATEGORIES (for select_hook):
- educational: Stats, facts, how-to, tips, tutorials, "Did you know..." hooks
- comparison: Before/after, A vs B, "Most people X but...", side-by-side hooks
- mythBusting: Debunking myths, "Stop doing X", correcting misconceptions
- storytelling: Personal stories, narrative-driven, "X years ago I..." hooks
- random: Surprising revelations, unexpected twists, shocking statements
- authority: Credibility, experience, transformation, results-based hooks
- dayInTheLife: Daily routines, behind-the-scenes, "A day as a..." hooks

RULES:
1. ALWAYS call a tool when one applies — never just describe what you would do.
2. Keep your text response to 1-2 sentences max. The tool does the work.
3. When user says "complete step 1" or describes their business → call complete_step_1.
4. When user asks to pick a hook → call select_hook with the best match for their topic.
5. If type detection panel is showing (type_confirmed=false), tell user to confirm video type first.
6. Never re-do a completed step unless user explicitly asks.`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  // Extract user from JWT
  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: userError } = await adminClient.auth.getUser(token);
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ error: "Authentication failed" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userId = userData.user.id;

  // Pre-check: estimate minimum credits needed based on request
  // Parse body early to know model/mode (re-read via clone not needed — we peek at content-type)
  let _preBody: any = {};
  try { _preBody = await req.clone().json(); } catch { /* ignore */ }
  const _preModel = _preBody.model || "claude-haiku-4-5";
  const _preMode = _preBody.mode;
  const _preConfig = MODEL_CONFIG[_preModel] || MODEL_CONFIG["claude-haiku-4-5"];
  const _minCredits = _preMode === "image"
    ? IMAGE_CREDITS.standard  // 150 for images
    : Math.max(3, Math.ceil(3 * _preConfig.multiplier)); // base minimum * multiplier
  {
    const { data: roleData } = await adminClient.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
    if (roleData?.role !== "admin") {
      const _primaryClientId = await getPrimaryClientId(adminClient, userId);
      const { data: clientCheck } = _primaryClientId
        ? await adminClient.from("clients").select("credits_balance").eq("id", _primaryClientId).single()
        : { data: null };
      if (clientCheck && (clientCheck.credits_balance ?? 0) < _minCredits) {
        return new Response(JSON.stringify({
          error: `Insufficient credits. You need at least ${_minCredits} credits but only have ${clientCheck.credits_balance ?? 0}.`,
          insufficient_credits: true,
          balance: clientCheck.credits_balance ?? 0,
          needed: _minCredits,
        }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
  }

  try {
    const { messages, wizard_state, client_info, model: requestedModel, canvas_mode, mode } = await req.json();

    // ─── IMAGE GENERATION PATH ───
    if (mode === "image") {
      const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
      if (!OPENAI_API_KEY) {
        return new Response(JSON.stringify({ error: "OPENAI_API_KEY not configured" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const prompt = messages?.[messages.length - 1]?.content;
      if (!prompt) {
        return new Response(JSON.stringify({ error: "No prompt provided for image generation" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const size = (messages[messages.length - 1] as any).size || "1024x1024";
      const isHD = size !== "1024x1024";
      const flatCost = isHD ? IMAGE_CREDITS.hd : IMAGE_CREDITS.standard;

      // Pre-check credits for image
      const imgCreditErr = await deductCredits(adminClient, userId, "ai_image", flatCost);
      if (imgCreditErr) {
        const parsed = JSON.parse(imgCreditErr);
        if (parsed.insufficient_credits) {
          return new Response(imgCreditErr, {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      console.log(`[ai-assistant] IMAGE mode size=${size} cost=${flatCost}`);

      // Use the user's prompt directly — DALL-E 3 already rewrites prompts internally
      // Only add a safety hint if needed, don't override user intent
      const callDalle = async (p: string) => {
        return await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
          body: JSON.stringify({
            model: "dall-e-3",
            prompt: p,
            size,
            response_format: "b64_json",
            n: 1,
          }),
        });
      };

      // First attempt with user's actual prompt
      let dalleRes = await callDalle(prompt);

      // If safety-flagged, retry with a softened version (don't change the meaning)
      if (!dalleRes.ok) {
        const firstErr = await dalleRes.text();
        console.error(`[ai-assistant] DALL-E attempt 1 error:`, firstErr);
        let isSafetyBlock = false;
        try {
          const p = JSON.parse(firstErr);
          isSafetyBlock = p?.error?.type === "image_generation_user_error" ||
            (p?.error?.message || "").includes("safety system");
        } catch (_) {}

        if (isSafetyBlock) {
          // Retry: keep user intent but frame as illustration
          const fallbackPrompt = `Digital illustration depicting: ${prompt}. Stylized artwork, no real people.`;
          console.log(`[ai-assistant] Retrying with softened prompt`);
          dalleRes = await callDalle(fallbackPrompt);
        }
      }

      if (!dalleRes.ok) {
        const err = await dalleRes.text();
        console.error(`[ai-assistant] DALL-E final error ${dalleRes.status}:`, err);
        // Parse DALL-E error and return a user-friendly message
        let userMessage = "Image generation failed. Please try a different description.";
        try {
          const parsed = JSON.parse(err);
          if (parsed?.error?.type === "image_generation_user_error" ||
              parsed?.error?.message?.includes("safety system")) {
            userMessage = "This prompt couldn't pass the image safety filter even after simplification. Try describing what you want without mentioning specific people, brands, or sensitive topics.";
          } else if (parsed?.error?.message) {
            userMessage = parsed.error.message;
          }
        } catch (_) { /* not JSON, use default message */ }
        return new Response(JSON.stringify({ error: userMessage }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const dalleData = await dalleRes.json();
      const imageB64 = dalleData.data?.[0]?.b64_json;
      const revisedPrompt = dalleData.data?.[0]?.revised_prompt;

      return new Response(JSON.stringify({
        type: "image",
        image_b64: imageB64,
        revised_prompt: revisedPrompt,
        size,
        credits_used: flatCost,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── TEXT CHAT PATH (Anthropic + OpenAI) ───
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages array is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve model config
    const config = MODEL_CONFIG[requestedModel] || MODEL_CONFIG["claude-haiku-4-5"];
    const model = config.apiModel;
    const provider = config.provider;
    const multiplier = config.multiplier;

    // Canvas mode: simpler prompt, no wizard tools
    const isCanvas = !!canvas_mode;
    const systemPrompt = isCanvas
      ? buildCanvasSystemPrompt(client_info)
      : buildSystemPrompt(wizard_state, client_info);

    const apiMessages = messages.map((m: any) => ({ role: m.role, content: m.content }));

    console.log(`[ai-assistant] mode=${isCanvas ? "canvas" : "wizard"} provider=${provider} model=${model} multiplier=${multiplier}x messages=${messages.length}`);

    let displayMessage = "";
    let action: { type: string; payload: any } | null = null;
    let inputTokens = 0;
    let outputTokens = 0;

    if (provider === "openai") {
      // ─── OpenAI Chat Completions ───
      const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
      if (!OPENAI_API_KEY) {
        return new Response(JSON.stringify({ error: "OPENAI_API_KEY not configured" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const openaiMessages = [
        { role: "system", content: systemPrompt },
        ...apiMessages,
      ];

      const maxTokens = model.includes("4o-mini") ? 1024 : 2048;

      const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: JSON.stringify({
          model,
          messages: openaiMessages,
          max_tokens: maxTokens,
        }),
      });

      if (!openaiRes.ok) {
        const err = await openaiRes.text();
        console.error(`[ai-assistant] OpenAI error ${openaiRes.status}:`, err);
        throw new Error(`OpenAI error ${openaiRes.status}: ${err.slice(0, 200)}`);
      }

      const openaiData = await openaiRes.json();
      displayMessage = openaiData.choices?.[0]?.message?.content?.trim() || "I couldn't generate a response.";
      inputTokens = openaiData.usage?.prompt_tokens ?? 0;
      outputTokens = openaiData.usage?.completion_tokens ?? 0;

    } else {
      // ─── Anthropic Messages API (existing path) ───
      const claudeBody: any = {
        model,
        max_tokens: model.includes("opus") ? 4096 : model.includes("sonnet") ? 2048 : 1024,
        system: systemPrompt,
        messages: apiMessages,
      };

      // Only include wizard tools for non-canvas mode
      if (!isCanvas) {
        claudeBody.tools = WIZARD_TOOLS;
      }

      const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify(claudeBody),
      });

      if (!claudeRes.ok) {
        const err = await claudeRes.text();
        console.error(`[ai-assistant] Claude API error ${claudeRes.status}:`, err);
        throw new Error(`Claude API error ${claudeRes.status}: ${err.slice(0, 200)}`);
      }

      const claudeData = await claudeRes.json();

      // Extract tool use block (the action) and text block (the message)
      const toolUseBlock = claudeData.content?.find((b: any) => b.type === "tool_use");
      const textBlock = claudeData.content?.find((b: any) => b.type === "text");

      if (toolUseBlock) {
        action = { type: toolUseBlock.name, payload: toolUseBlock.input };
      }

      const ACTION_MESSAGES: Record<string, string> = {
        complete_step_1: "Running research on your topic...",
        set_facts: "Facts updated! Moving to hook selection.",
        select_hook: "Hook selected! Ready to generate your script.",
        select_format: "Format set!",
        generate_script: "Generating your script now...",
        set_script_options: "Script options updated!",
        advance_step: "Moving to the next step...",
        edit_line: "Script line updated!",
      };
      displayMessage = textBlock?.text?.trim() || (action ? (ACTION_MESSAGES[action.type] || "Done!") : "I couldn't generate a response. Please try again.");
      inputTokens = claudeData.usage?.input_tokens ?? 0;
      outputTokens = claudeData.usage?.output_tokens ?? 0;
    }

    // Deduct credits based on actual token usage + model multiplier
    const creditCost = calculateTokenCredits(inputTokens, outputTokens, multiplier);
    console.log(`[ai-assistant] provider=${provider} tokens: in=${inputTokens} out=${outputTokens} multiplier=${multiplier}x credits=${creditCost}`);

    const creditErr = await deductCredits(adminClient, userId, "ai_chat", creditCost);
    if (creditErr) {
      const parsed = JSON.parse(creditErr);
      if (parsed.insufficient_credits) {
        // Still return the response (API call already happened) but warn
        console.warn(`[ai-assistant] Post-call credit deduction failed: insufficient credits`);
      }
    }

    return new Response(
      JSON.stringify({ message: displayMessage, action, credits_used: creditCost }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("ai-assistant error:", e);
    return new Response(
      JSON.stringify({ error: e.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
