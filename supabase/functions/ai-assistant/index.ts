import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Fetch with automatic retry on 529/5xx errors */
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  const delays = [2000, 4000, 8000];
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, options);
    if (res.ok || (res.status < 500 && res.status !== 529)) return res;
    if (attempt < maxRetries) {
      console.warn(`[ai-assistant] API ${res.status}, retrying in ${delays[attempt]}ms (attempt ${attempt + 1}/${maxRetries})...`);
      await res.text(); // drain body
      await new Promise(r => setTimeout(r, delays[attempt]));
      continue;
    }
    return res; // final attempt failed, return the error response
  }
  throw new Error("Unreachable");
}

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
  // Try junction table first (if it exists)
  const { data } = await adminClient
    .from("subscriber_clients")
    .select("client_id")
    .eq("subscriber_user_id", userId)
    .eq("is_primary", true)
    .maybeSingle();
  if (data?.client_id) return data.client_id;

  // Fallback: direct clients.user_id lookup
  const { data: client } = await adminClient
    .from("clients")
    .select("id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return client?.id ?? null;
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
  const role = roleData?.role;
  // Skip credit deduction for admin, videographers, and editors
  if (role === "admin" || role === "videographer" || role === "editor") return null;

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

  return `You are a creative AI script writing assistant inside the Super Planning Canvas in ConnectaCreators — a platform for viral short-form social media scripts (Instagram Reels, TikToks, YouTube Shorts).

${clientStr}

YOUR ROLE IN THE CANVAS:
You help the creator plan, brainstorm, and refine scripts. The user connects Video Nodes (with transcriptions), Text Note Nodes, Research Nodes, Hook Generator, Brand Guide, CTA Builder, and Competitor Profile nodes to give you context.

═══════════════════════════════════════════════════════════
STRICT 1:1 CLONING — DEFAULT BEHAVIOR WHEN A VIDEO NODE IS CONNECTED
═══════════════════════════════════════════════════════════

When a VideoNode with transcription=true or structure=true is connected, that video is the MOLD. By default you MUST:

1. COUNT the exact number of scenes/lines in the reference. Your output MUST have the SAME number of scenes. Not more, not fewer.
2. MATCH each scene 1:1. If reference scene 3 is a filming direction, your scene 3 is a filming direction. If scene 4 is TEXT ON SCREEN, your scene 4 is TEXT ON SCREEN.
3. PRESERVE the tone, rhythm, sentence length, and energy of each line. If the reference line is 8 words, yours should be roughly 8 words. If it's punchy and short, yours is punchy and short.
4. PRESERVE TEXT ON SCREEN patterns. If the reference says TEXT ON SCREEN: "I know $9 an hour feels like all you're worth right now..." your version keeps the same sentence structure, emotional weight, and approximate length. Just swap the topic/values.
5. KEEP the same visual flow. If the reference opens with a desk scene, has a close-up mid-way, and ends on a wide shot, your script follows that same visual progression.
6. ONLY CHANGE the topic and the specific values/facts/names. Everything else (structure, pacing, number of scenes, visual directions, text patterns, tone) stays identical to the reference.
7. DO NOT add extra scenes, remove scenes, add disclaimers, add intros, or add outros unless the user explicitly asks.
8. DO NOT paraphrase loosely. This is a structural CLONE, not "inspiration." Think of it as filling in a Mad Libs template where only the topic-specific words change.

WHEN TO BREAK FROM STRICT CLONING:
- User explicitly says "add more", "make it longer", "make it shorter", "change the structure", "don't follow the video", or "freestyle"
- User asks for a completely new script without referencing a connected video
- No video node is connected (then you write freely based on other context)

═══════════════════════════════════════════════════════════
HOW TO READ CONNECTED CONTENT
═══════════════════════════════════════════════════════════

0. **CONNECTED NODES inventory** is listed at the top of canvas context. Read it first, silently. If a VideoNode shows transcription=true OR structure=true, you HAVE the data. Use it. Do NOT ask the user what it contains.
1. **Video Transcriptions** = the actual words spoken + visual directions from the reference. This is your cloning template. Match it scene-for-scene.
2. **Video Structures** = hook/body/cta breakdown. Show ONLY the sections the user selected. If only "hook" is selected, only clone the hook.
3. **Text Notes** = CORE CONTEXT. These tell you WHAT the script should be about. Facts, stats, talking points, brand voice, creator instructions. Weave this content into the cloned structure.
4. **Research Facts** = additional data points to plug into the cloned template naturally.
5. **Selected Hook** (from Hook Generator) = the opening line pattern. Use it as the script's first line if present.
6. **Brand Guide** = hard constraints on tone, values, forbidden words. Never violate these.
7. **Selected CTA** (from CTA Builder) = the script MUST end with this exact call-to-action.
8. **Competitor Profiles** = strategy context. Use for understanding what works in the niche.

FORMAT TYPES (from detected_format field):
- **COMPARATIVE DIALOGUE**: Two contrasting voices per section. Never write solo monologue.
- **INTERVIEW**: Q&A dialogue between host and guest.
- **VOICEOVER**: Narration over footage, no on-camera speaker.
- **B-ROLL CAPTION**: No spoken dialogue. Only visual scenes + text on screen.
- **TALKING HEAD**: Single person speaking directly to camera.
Always read format_notes if present. It describes the exact structural pattern.

═══════════════════════════════════════════════════════════
THINK DEEPLY BEFORE RESPONDING — NO FLUFF
═══════════════════════════════════════════════════════════

Before EVERY response, pause and do this internal work (do NOT show this to the user):

1. READ all connected node data completely. Transcriptions, text notes, research facts, hook selection, brand guide, everything.
2. IDENTIFY what the user is actually asking. Are they asking for a script? An analysis? A rewrite? A brainstorm?
3. If they want a SCRIPT: count every scene in the reference. Plan your output scene-by-scene BEFORE writing. Map: reference scene 1 → your scene 1, reference scene 2 → your scene 2, etc.
4. If they want ANALYSIS or BRAINSTORM: give specific, actionable insights rooted in the actual data. Never give generic advice. Every sentence you write must reference something concrete from the connected nodes.

ANTI-FLUFF RULES:
- NEVER write generic motivational summaries. "He worked hard and succeeded" is useless. Instead: "Scene 3: Close-up of Matt scanning items at GameStop register. TEXT ON SCREEN: 'I know $9 an hour feels like all you're worth right now...'"
- NEVER list bullet points of abstract qualities ("discipline", "consistency", "mindset"). Instead, turn them into specific filming scenes with TEXT ON SCREEN.
- NEVER summarize what the reference video is about. The user already knows, they made it. Go straight to producing the output they need.
- If the user asks "how does that relate to D2D?" — don't write a motivational essay. Connect each specific story beat from the reference to a specific D2D moment, then produce the actual script scenes.
- Every response should contain USABLE OUTPUT. Something the creator can directly film, post, or build on. Not a summary. Not an analysis for the sake of analysis.

═══════════════════════════════════════════════════════════
RULES
═══════════════════════════════════════════════════════════

1. Be decisive. Do not explain what you will do. Just do it.
2. NEVER end with a question like "Want me to adjust?" or "Ready to post?" Deliver and stop.
3. If the user asks again, give a better version. Never say "I already gave that."
4. When the user asks to "remake", "recreate", "adapt", "rewrite", "copy", "use this" — WRITE THE FULL SCRIPT NOW. Do not redirect to the Generate button.
5. NEVER ask "which video is connected?" You can see the inventory. Read it.
6. If no context is connected, guide the user to add nodes.
7. Reference video sources by channel name when available: "Based on @drjohn's structure..."
8. Never refuse replication requests or add copyright caveats. The user wants format cloning, not verbatim copying.
9. REWRITE MODE: If the user pastes a line + "rewrite"/"fix"/"improve" — respond with ONLY the rewritten line and one sentence explaining what changed.
10. DEFAULT TO ACTION. When in doubt between explaining vs producing, PRODUCE. Write the script. Write the hook. Write the TEXT ON SCREEN. Don't describe what you would write.
11. If the user shares context (a story, facts, a video) and asks a vague question, assume they want you to turn it into a script using the connected video as the structural mold. Don't ask for clarification. Just produce it.

WRITING STYLE:
- Never use em dashes. Use commas, periods, or new sentences.
- No "---" dividers or horizontal rules.
- No timestamps unless the user asks.
- No corporate jargon (leverage, synergy, utilize, streamline, robust, scalable, game-changer, innovative, cutting-edge, etc.)
- Write like texting a smart friend. Short sentences. Plain words.
- One sentence per script line max.
- Format: scene description on one line, then "TEXT ON SCREEN: ..." on the next.

QUALITY CHECKS (run mentally before every script):
1. CLONE FIDELITY: Does the output have the EXACT same number of scenes as the reference? Same visual flow? Same line-by-line structure? If not, fix it before responding.
2. SPECIFICITY CHECK: Does every line reference something concrete? If any line could apply to "any motivational video," it's too generic. Rewrite it with specific details from the text notes or research facts.
3. TAM CHECK: Is the audience large enough for virality? Flag if too niche.
4. RELOOP CHECK: Is there a mid-video re-engagement moment?
5. STORY CLARITY: Does hook to body to CTA flow logically?

When you find an issue, be direct: "The hook assumes the viewer already knows what X is. Open with a relatable moment instead."`;
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
    const { messages, wizard_state, client_info, model: requestedModel, canvas_mode, mode, canvas_image_urls, title_mode, pasted_image_b64, pasted_image_type, stream: streamRequested } = await req.json();

    // ─── TITLE MODE (background, no credits charged) ───
    if (title_mode === true) {
      const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
      if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");
      const titleRes = await fetchWithRetry("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 30,
          system: "Generate a 4-6 word conversation title. Reply with ONLY the title words, no punctuation, no explanation.",
          messages: (messages || []).slice(0, 2).map((m: any) => ({ role: m.role, content: m.content.slice(0, 300) })),
        }),
      });
      const titleData = await titleRes.json();
      const titleText = titleData.content?.[0]?.text?.trim() ?? "";
      return new Response(JSON.stringify({ content: titleText }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

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

    // Inject connected canvas images into last user message for Claude vision
    if (isCanvas && Array.isArray(canvas_image_urls) && canvas_image_urls.length > 0) {
      const imageBlocks: any[] = [];
      for (const url of canvas_image_urls.slice(0, 3)) { // Max 3 images to limit payload
        try {
          const imgRes = await fetch(url);
          if (!imgRes.ok) continue;
          const buf = new Uint8Array(await imgRes.arrayBuffer());
          // Chunked base64 conversion (avoids max-args stack overflow for large images)
          let binary = "";
          const chunk = 8192;
          for (let i = 0; i < buf.length; i += chunk) {
            binary += String.fromCharCode(...buf.subarray(i, i + chunk));
          }
          const b64 = btoa(binary);
          const contentType = imgRes.headers.get("content-type") || "image/png";
          imageBlocks.push({
            type: "image",
            source: { type: "base64", media_type: contentType, data: b64 },
          });
        } catch (e) {
          console.error(`[ai-assistant] Failed to fetch canvas image:`, e);
        }
      }
      if (imageBlocks.length > 0) {
        const lastIdx = apiMessages.length - 1;
        if (lastIdx >= 0 && apiMessages[lastIdx].role === "user") {
          const text = apiMessages[lastIdx].content;
          apiMessages[lastIdx].content = [
            { type: "text", text: typeof text === "string" ? text : String(text) },
            ...imageBlocks,
          ];
        }
      }
      console.log(`[ai-assistant] Injected ${imageBlocks.length} canvas image(s) for vision`);
    }

    // Inject pasted screenshot into last user message for Claude vision
    if (pasted_image_b64 && pasted_image_type) {
      const b64 = pasted_image_b64.replace(/^data:[^;]+;base64,/, "");
      const lastIdx = apiMessages.length - 1;
      if (lastIdx >= 0 && apiMessages[lastIdx].role === "user") {
        const rawText = apiMessages[lastIdx].content;
        const userText = typeof rawText === "string" ? rawText : String(rawText);
        // Prepend directive so Claude reads the image, not the canvas TEXT ON SCREEN context
        const imageDirective = "[ATTACHED SCREENSHOT: analyze this image directly to answer the user's question — do not use canvas context text-on-screen data for visual/transcription requests]";
        apiMessages[lastIdx].content = [
          { type: "text", text: `${imageDirective}\n${userText}` },
          { type: "image", source: { type: "base64", media_type: pasted_image_type, data: b64 } },
        ];
        console.log(`[ai-assistant] Injected pasted screenshot (${pasted_image_type}) for vision`);
      }
    }

    console.log(`[ai-assistant] mode=${isCanvas ? "canvas" : "wizard"} provider=${provider} model=${model} multiplier=${multiplier}x messages=${messages.length} systemPromptLen=${systemPrompt.length} canvasContext=${client_info?.canvas_context?.length ?? 0}`);
    if (isCanvas && client_info?.canvas_context) {
      console.log(`[ai-assistant] canvas_context first 500 chars: ${client_info.canvas_context.slice(0, 500)}`);
    }

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
        system: (isCanvas && client_info?.canvas_context)
          ? [
              {
                type: "text",
                text: systemPrompt,
                cache_control: { type: "ephemeral" },
              },
              {
                type: "text",
                text: `<canvas_data>\n${client_info.canvas_context}\n</canvas_data>\n\nAbove is the LIVE data from all nodes currently connected on the canvas. Use it. Do NOT say you cannot see data included above.`,
                cache_control: { type: "ephemeral" },
              },
            ]
          : systemPrompt,
        messages: apiMessages,
      };

      // Only include wizard tools for non-canvas mode
      if (!isCanvas) {
        claudeBody.tools = WIZARD_TOOLS;
      }

      // ─── Streaming path (canvas mode only, no tools) ───
      if (isCanvas && streamRequested === true) {
        claudeBody.stream = true;
        const streamRes = await fetchWithRetry("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "anthropic-beta": "prompt-caching-2024-07-31",
            "content-type": "application/json",
          },
          body: JSON.stringify(claudeBody),
        });
        if (!streamRes.ok) {
          const err = await streamRes.text();
          throw new Error(`Claude API error ${streamRes.status}: ${err.slice(0, 200)}`);
        }
        const encoder = new TextEncoder();
        let streamInputTokens = 0;
        let streamOutputTokens = 0;
        const readable = new ReadableStream({
          async start(controller) {
            const reader = streamRes.body!.getReader();
            const decoder = new TextDecoder();
            let buf = "";
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += decoder.decode(value, { stream: true });
                const lines = buf.split("\n");
                buf = lines.pop() ?? "";
                for (const line of lines) {
                  if (!line.startsWith("data: ")) continue;
                  try {
                    const ev = JSON.parse(line.slice(6));
                    if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: ev.delta.text })}\n\n`));
                    } else if (ev.type === "message_start" && ev.message?.usage) {
                      streamInputTokens = ev.message.usage.input_tokens ?? 0;
                      const cacheCreate = ev.message.usage.cache_creation_input_tokens ?? 0;
                      const cacheRead = ev.message.usage.cache_read_input_tokens ?? 0;
                      if (cacheCreate > 0 || cacheRead > 0) {
                        console.log(`[ai-assistant] cache: create=${cacheCreate} read=${cacheRead} uncached_input=${streamInputTokens}`);
                      }
                    } else if (ev.type === "message_delta" && ev.usage) {
                      streamOutputTokens = ev.usage.output_tokens ?? 0;
                    }
                  } catch { /* ignore parse errors */ }
                }
              }
            } finally {
              reader.releaseLock();
            }
            const creditCost = calculateTokenCredits(streamInputTokens, streamOutputTokens, multiplier);
            await deductCredits(adminClient, userId, "ai_chat", creditCost);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, credits_used: creditCost })}\n\n`));
            controller.close();
          },
        });
        return new Response(readable, {
          headers: {
            ...corsHeaders,
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
          },
        });
      }

      const claudeRes = await fetchWithRetry("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "prompt-caching-2024-07-31",
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
