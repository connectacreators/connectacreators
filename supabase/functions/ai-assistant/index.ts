import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const HOOK_CATEGORIES = [
  "educational",
  "randomInspo",
  "authorityInspo",
  "comparisonInspo",
  "storytellingInspo",
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
          enum: ["educational", "randomInspo", "authorityInspo", "comparisonInspo", "storytellingInspo"],
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
    name: "run_autopilot",
    description: "Run full autopilot: research → pick best hook → pick format → generate script, all in one click. Use when user says 'do everything', 'complete all steps', 'just generate it', or wants zero manual steps.",
    input_schema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Optional topic override. If omitted, uses current wizard topic." },
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
1. **Video Transcriptions** are FORMAT TEMPLATES. When the user asks you to generate or suggest a script, you MUST replicate the same structure, spoken rhythm, pacing, hook style, section transitions, and visual flow from the reference video. Write new content about the given topic but in the EXACT SAME FORMAT as the reference.
2. **Video Structures** show ONLY the sections the user selected (hook, body, cta). If only "hook" is selected, ONLY use the hook as a template. If all three are selected, template the entire structure. Respect what sections the user chose.
3. **Text Notes** are CORE CONTEXT — treat them as both research material AND creator instructions. Whatever text is in the notes, USE IT. If notes contain facts, stats, or talking points, weave them into the script. If notes contain brand voice or instructions, follow them exactly. Text notes are the primary source of what the script should be about.
4. **Research Facts** provide additional data points to weave into the script naturally.

RULES:
1. Always respond with helpful, actionable text. Be concise but thorough.
2. When suggesting hooks or scripts, reference the connected context directly.
3. If the user asks to "generate script", tell them to click the "Generate Script" button for the full AI script generation. You can help brainstorm, suggest hooks, refine ideas, and answer questions.
4. Keep responses focused and practical — no fluff.
5. If no context is connected, guide the user to add video references or text notes first.
6. You can suggest hook ideas, rewrite lines, translate content, and give creative direction.
- When the canvas context includes video sources with channel names (e.g., "from @drjohn"), reference them by name in your responses: "Based on @drjohn's video structure..."
- REWRITE MODE: If the user sends a message where they paste a line of script text (in quotes) followed by words like "rewrite", "fix", "improve", or "change" — respond with ONLY two things: (1) the rewritten line, and (2) one sentence explaining what you changed. No preamble, no pleasantries, no "Here's the revised version:" prefix. Just the line and the explanation.
  Example user: 'Fix this: "When I woke up this morning"' 
  Example response: "The second my alarm went off at 6am, I knew something was different." — Made it more specific and visual to pull viewers in immediately.`;
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
- Step 1 = Topic → complete_step_1 or run_autopilot
- Step 2 = Research facts (shows 5 facts, top 3 auto-selected)
- Step 3 = Hook selection → select_hook
- Step 4 = Format/style → select_format or set_script_options
- Step 5 = Generated script → generate_script or edit_line

HOOK CATEGORIES (for select_hook):
- educational: Stats, facts, how-to, "Did you know..." hooks
- randomInspo: Surprising revelations, unexpected twists, shocking statements
- authorityInspo: Credibility, experience, transformation, results-based hooks
- comparisonInspo: Before/after, "Most people X but...", A vs B hooks
- storytellingInspo: Personal stories, narrative-driven hooks

RULES:
1. ALWAYS call a tool when one applies — never just describe what you would do.
2. Keep your text response to 1-2 sentences max. The tool does the work.
3. When user says "do everything" / "complete all" / "generate my script" → call run_autopilot immediately.
4. When user says "complete step 1" or describes their business → call complete_step_1.
5. When user asks to pick a hook → call select_hook with the best match for their topic.
6. If type detection panel is showing (type_confirmed=false), tell user to confirm video type first.
7. Never re-do a completed step unless user explicitly asks.`;
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

  try {
    const { messages, wizard_state, client_info, model: requestedModel, canvas_mode } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages array is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalize model ID — ensure it's a valid Anthropic API model
    const MODEL_MAP: Record<string, string> = {
      "claude-haiku-4-5": "claude-haiku-4-5-20251001",
      "claude-sonnet-4-5-20250514": "claude-sonnet-4-5-20250514",
      "claude-opus-4-20250514": "claude-opus-4-20250514",
    };
    const model = MODEL_MAP[requestedModel] || requestedModel || "claude-haiku-4-5-20251001";

    // Canvas mode: simpler prompt, no wizard tools
    const isCanvas = !!canvas_mode;
    const systemPrompt = isCanvas
      ? buildCanvasSystemPrompt(client_info)
      : buildSystemPrompt(wizard_state, client_info);

    const claudeBody: any = {
      model,
      max_tokens: model.includes("opus") ? 4096 : model.includes("sonnet") ? 2048 : 1024,
      system: systemPrompt,
      messages: messages.map((m: any) => ({ role: m.role, content: m.content })),
    };

    // Only include wizard tools for non-canvas mode
    if (!isCanvas) {
      claudeBody.tools = WIZARD_TOOLS;
    }

    console.log(`[ai-assistant] mode=${isCanvas ? "canvas" : "wizard"} model=${model} messages=${messages.length}`);

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

    let action: { type: string; payload: any } | null = null;
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
      run_autopilot: "Running full autopilot — research, hook, and script...",
      advance_step: "Moving to the next step...",
      edit_line: "Script line updated!",
    };
    const displayMessage = textBlock?.text?.trim() || (action ? (ACTION_MESSAGES[action.type] || "Done!") : "I couldn't generate a response. Please try again.");

    return new Response(
      JSON.stringify({ message: displayMessage, action }),
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
