import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { VIRAL_HOOKS } from "./hookData.ts";

/** Pick a random sample of hooks, balanced across categories */
function sampleHooks(count = 50): string {
  // Group by category
  const byCategory = new Map<string, typeof VIRAL_HOOKS>();
  for (const h of VIRAL_HOOKS) {
    const list = byCategory.get(h.category) || [];
    list.push(h);
    byCategory.set(h.category, list);
  }
  const categories = Array.from(byCategory.keys());
  const perCat = Math.max(3, Math.floor(count / categories.length));
  const sampled: typeof VIRAL_HOOKS = [];
  for (const cat of categories) {
    const pool = byCategory.get(cat)!;
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    sampled.push(...shuffled.slice(0, perCat));
  }
  // Shuffle final list and trim to count
  const final = sampled.sort(() => Math.random() - 0.5).slice(0, count);
  return final.map(h => `[${h.category}] ${h.template}`).join("\n");
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Shared instruction block — tells the model how to batch clarifying questions as
// a structured payload the client renders as an interactive picker card. Keep the
// schema in sync with src/lib/parseDeck.ts on the frontend.
const QUESTION_DECK_PROTOCOL = `
═══════════════════════════════════════════════════════════
QUESTION DECK PROTOCOL — WHEN ASKING MULTIPLE CLARIFYING QUESTIONS
═══════════════════════════════════════════════════════════

When you need the user to answer 2+ clarifying questions before you can continue (e.g. picking which angle, which emotional beat, which specific number, which length), emit a single JSON payload INSTEAD of a prose numbered list. The client renders it as an interactive one-question-at-a-time picker so the user can tap suggested answers or type their own.

WHEN TO USE:
- You genuinely need 2 or more answers from the user before continuing.
- The answers are independent of each other (you don't need Q1's answer to shape Q2).
- You can propose 2–4 concrete candidate answers per question, drawn from the user's connected context.

WHEN NOT TO USE:
- You only need one clarifying question → ask it in prose.
- You are offering suggestions, variations, or options for the user to choose from as an answer → write them normally (the deck is for YOU asking the USER, not the other way around).
- You don't have concrete chip candidates grounded in the user's context.

RULES:
- Each question has 2–4 suggested chips. Chips must be short answer fragments drawn from the user's connected context (video transcripts, notes, research) — NOT generic placeholders like "Option A" or "Something else".
- When used, the payload is the ENTIRE response. No markdown before or after. Any framing text goes inside the "preamble" field.
- Max 5 questions per deck.
- Every question has a stable short \`id\` (e.g. "opening_hardship", "flip_number"). The client uses it to key answers.

SCHEMA:
\`\`\`json
{
  "type": "questions_deck",
  "preamble": "Optional one-line framing.",
  "questions": [
    {
      "id": "short_stable_slug",
      "label": "Short UI label (2–4 words)",
      "question": "The full question to the user.",
      "body": "Optional one-line context to help them answer.",
      "chips": ["Suggested answer A", "Suggested answer B", "Suggested answer C"]
    }
  ]
}
\`\`\`

After the user answers, you will receive their answers in the next user message as "Q1 — <label>: <answer>" lines.

YOUR RESPONSE TO THOSE ANSWERS MUST BE PLAIN PROSE — not another questions_deck JSON. One short acknowledgment sentence, then continue with whatever you were going to do (suggest hooks, rewrite the script section, generate, etc.). Do not emit another deck in direct response to a user's deck answers. Only emit a new deck later if a genuinely new round of multi-question clarification is needed.
`;

/** Strip lone/broken surrogates that break JSON serialization for Claude API */
function sanitizeText(s: string): string {
  // Remove lone high surrogates (U+D800–U+DBFF) not followed by a low surrogate,
  // and lone low surrogates (U+DC00–U+DFFF) not preceded by a high surrogate.
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "")
           .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
}

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
/**
 * Intent classifier for silent model routing. Called once per canvas chat
 * turn to decide whether to keep the user's selected (expensive) model or
 * silently downgrade. The goal: never drop quality on research/synthesis
 * requests, but stop burning Opus credits on "make it shorter" follow-ups.
 *
 * Returns:
 *   "deep"   → keep the requested model; user is asking the AI to read,
 *              synthesize across nodes, or produce fresh creative work.
 *   "light"  → downgrade to Haiku; it's a tiny refinement of the last turn.
 *   "medium" → downgrade Opus→Sonnet; leave Sonnet alone. Ordinary rewrites.
 */
function classifyIntent(text: string): "deep" | "light" | "medium" {
  const t = (text || "").toLowerCase().trim();
  if (!t) return "light";

  // Deep signals — research/synthesis/creative-from-scratch work.
  const deepPatterns: RegExp[] = [
    /\b(research|scan|look\s+(?:through|across|at)|search(?:\s+through)?|find(?:\s+in)?|comb\s+through|dig\s+through)\b/,
    /\b(across|among|combine(?:d)?|compare|contrast|synthesiz|merge)\b.*\b(nodes?|notes?|transcripts?|sources?|memos?)\b/,
    /\b(be\s+thorough|think\s+(?:carefully|deeply|hard)|take\s+your\s+time|reason\s+through)\b/,
    /\b(quote|pull|grab|extract|lift)\s+(?:the\s+|a\s+|any\s+)?(?:line|stat|number|quote|moment|fact|detail)\b/,
    /\b(write|generate|draft|build|create)\s+.*\b(script|video|full|complete|draft)\b/,
    /\b(give|write|brainstorm|come\s+up\s+with)\s+.*\b(\d{1,3})\s+(?:ideas?|angles?|hooks?|variations?|options?)\b/,
    /\b(what\s+does|what\s+do|where\s+does|where\s+did|which\s+of|how\s+did)\b.*\b(note|memo|transcript|video|brand|file|node)s?\b/,
  ];
  if (deepPatterns.some((r) => r.test(t))) return "deep";

  // Light signals — trivial refinements. Short messages that are clearly
  // editing the last response rather than asking for new reasoning.
  const lightPatterns: RegExp[] = [
    /^(?:no|nope|nah|yes|yep|yeah|ok|okay|sure|cool|try\s+again|again|different|another|one\s+more|next|continue|more)[\s!.?]*$/,
    /^(?:make\s+it\s+)?(?:shorter|longer|tighter|punchier|sharper|simpler|clearer|cleaner|bolder|softer|rougher|smoother)[\s!.?]*$/,
    /^(?:shorter|longer|tighter|punchier|sharper|simpler|clearer|cleaner|bolder|softer|rougher|smoother)[\s!.?]*$/,
    /^(?:fix|tweak|polish|edit)\s+(?:that|this|it|line\s+\d+)[\s!.?]*$/,
    /^(?:now|then)?\s*(?:make|put)\s+it\s+(?:more|less)\s+\w+[\s!.?]*$/,
    /^(?:cut|remove|drop)\s+(?:that|the\s+\w+|it)[\s!.?]*$/,
    /^(?:swap|replace)\s+.{1,40}[\s!.?]*$/,
  ];
  if (t.length < 80 && lightPatterns.some((r) => r.test(t))) return "light";

  // Very short generic tokens always light.
  if (t.length < 25 && !/\?/.test(t)) return "light";

  return "medium";
}

function calculateTokenCredits(inputTokens: number, outputTokens: number, multiplier = 1): number {
  const weighted = inputTokens + outputTokens * 3;
  const base = Math.ceil(weighted / 400);
  return Math.max(Math.ceil(base * multiplier), 3);
}

/** Model configuration — provider routing + credit multipliers */
const MODEL_CONFIG: Record<string, { apiModel: string; provider: "anthropic" | "openai"; multiplier: number }> = {
  "claude-haiku-4-5":  { apiModel: "claude-haiku-4-5-20251001", provider: "anthropic", multiplier: 1 },
  "claude-sonnet-4-5": { apiModel: "claude-sonnet-4-6", provider: "anthropic", multiplier: 4 },
  "claude-opus-4":     { apiModel: "claude-opus-4-7", provider: "anthropic", multiplier: 19 },
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
  if (role === "admin" || role === "videographer" || role === "editor" || role === "connecta_plus") return null;

  const primaryClientId = await getPrimaryClientId(adminClient, userId);
  if (!primaryClientId) return null;

  // Atomic check-and-deduct via DB function — eliminates race condition
  // where two concurrent requests both pass the balance check and overdraft.
  const { data: result, error } = await adminClient.rpc("deduct_credits_atomic", {
    p_client_id: primaryClientId,
    p_action: action,
    p_cost: cost,
  });

  if (error) {
    console.error("Credit deduction error:", error);
    return null; // Don't block on credit tracking errors
  }

  if (!result?.ok) {
    return JSON.stringify(result); // Contains error, insufficient_credits, balance, needed
  }

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
${QUESTION_DECK_PROTOCOL}

═══════════════════════════════════════════════════════════
THE CANVAS IS LIVE — ALWAYS RE-READ BEFORE ASSUMING
═══════════════════════════════════════════════════════════

The <canvas_data> block sent with each message reflects the CURRENT state of every connected node. The user can swap video nodes, reconnect edges, or edit notes between turns. **Never trust a previous turn's understanding of the reference video** — the attached video may have changed.

WHEN THE USER REFERENCES "the video node" / "the attached video" / "this video" / "the reference":
1. STOP and re-read the Video Transcription block in <canvas_data> right now — don't rely on what you said earlier.
2. Quote the ACTUAL opening line of the transcript back briefly, e.g.
   *"Reading the current video — it opens with: '…'"*
   This proves you're on the right video and gives the user a sanity check.
3. THEN answer the request.

WHEN THE USER PUSHES BACK ON FORMAT/PATTERN:
Phrases like "that's not what it is", "the pattern is different", "look again", "no the format is...", "you missed the point" mean your prior reading of the reference was wrong.
1. Re-read the full transcript.
2. Restate what you actually see: the hook line, the structural pattern, the tone, the rhythm. Keep it to 2–3 sentences.
3. Ask one targeted confirmation question BEFORE generating anything new (e.g. "Is the pattern a contrarian flip of conventional advice — yes or different?").
Do NOT silently regenerate with the same (wrong) mental model.

VARIATIONS / IDEAS / ANGLES / HOOKS REQUESTS:
When the user asks for multiple variations referencing a connected video ("give me 15 angles", "10 hooks", "5 variations in this format"):
1. Open by naming the STRUCTURAL PATTERN you detected in one line, e.g.
   *"Pattern detected: contrarian flip of a widely-accepted belief (claims the opposite of what everyone assumes)."*
   Valid patterns include: contrarian flip, surprising root-cause, confession→lesson, list-where-only-one-mattered, reframe of common wisdom, unexpected advice, myth debunk, identity challenge.
2. Never reduce a pattern to a surface trait. "Simple language" / "short sentences" / "explain like you're 5" are NOT patterns — they're delivery style. The pattern is the ARGUMENTATIVE STRUCTURE: what does the hook claim and how does it subvert the listener's expectation?
3. Each variation must match the pattern applied to a new topic relevant to the target audience. All N items share the SAME structural move, different subject matter.

═══════════════════════════════════════════════════════════
SHARPNESS RULES — ALWAYS ON FOR REWRITES / VARIATIONS / TIGHTENING
═══════════════════════════════════════════════════════════
The #1 reason scripts feel "off" is vague, run-on sentences that read like a case study instead of speech. When you rewrite, sharpen, or generate variations/hooks/pairs:

- **Short sentences.** Default to 4–12 words. Break long thoughts into two short ones. Rhythm beats comprehensiveness.
- **One beat per sentence.** A sentence that tries to do two things (setup + payoff, fact + lesson) is two sentences, not one.
- **Specific nouns and numbers.** "$17/hr", "20 DMs", "6 AM", "one says yes" — never "a few", "a lot", "some people". If the user didn't give a number, invent a plausible one grounded in the audience's world.
- **Reframes, not restatements.** A good line doesn't just describe the contrast — it re-labels it. *"I don't call it burnout — I call it a weak week."* That's a reframe. *"When I'm tired I tell myself to take a week off"* is a restatement and dead on arrival.
- **Lines you'd say out loud.** Read each line silently. If it sounds like a LinkedIn post or a business case study, rewrite it. It should sound like the creator talking to a friend.
- **No connector bloat.** Cut "completely", "literally", "actually", "and then", "every single one", "the fact that". They leak energy. Leave them only when they create rhythm (e.g. *"Half ignore me. One says yes. That's all I need."*).
- **Emotional nuance over pure contrast.** A LEFT/RIGHT pair where RIGHT shows the creator is a robot is boring. RIGHT that acknowledges the pull of LEFT and still chooses differently is human. *"I love my boys. But I stopped hanging out every weekend when I realized we were just venting the same problems."* beats *"I cut off my friends."*
- **No hedging or meta.** Don't say "here's a rewrite that's sharper" — just give the rewrite. No disclaimers, no "hope this helps", no "feel free to tweak". Ship the lines.

═══════════════════════════════════════════════════════════
STRICT 1:1 CLONING — DEFAULT BEHAVIOR WHEN A VIDEO NODE IS CONNECTED
═══════════════════════════════════════════════════════════

When a VideoNode with transcription=true or structure=true is connected, that video is the MOLD. By default you MUST:

1. DETERMINE THE ACTUAL VISUAL SCENE COUNT using this priority:
   a. If video_analyses exists with visual_segments → THOSE are the real scenes. Count them. That's your scene count.
   b. If detected_format is TALKING HEAD → it's almost always ONE continuous shot. Do NOT break it into multiple scenes unless the visual segments say otherwise.
   c. If ONLY a transcript exists (no visual analysis) → assume it's a SINGLE CONTINUOUS SHOT. The transcript is one take. Do NOT invent scene breaks from paragraph breaks or topic shifts in the transcript text. A pause in speech is NOT a scene change.
   d. Multiple scenes only exist when there are ACTUAL camera cuts, location changes, or different visual setups confirmed by visual analysis data.
2. Your output MUST have the SAME number of visual scenes as the reference. If the video is one continuous talking head shot, your script is ONE scene with ONE filming direction, not 10 scenes.
3. MATCH each scene 1:1. If reference scene 3 is a filming direction, your scene 3 is a filming direction. If scene 4 is TEXT ON SCREEN, your scene 4 is TEXT ON SCREEN.
4. PRESERVE the tone, rhythm, sentence length, and energy. If the reference line is 8 words, yours should be roughly 8 words. If it's punchy and short, yours is punchy and short.
5. PRESERVE TEXT ON SCREEN patterns. If the reference says TEXT ON SCREEN: "I know $9 an hour feels like all you're worth right now..." your version keeps the same sentence structure, emotional weight, and approximate length. Just swap the topic/values.
6. KEEP the same visual flow. If it's one continuous talking head shot, your script is one continuous talking head shot. Don't add cuts that don't exist.
7. ONLY CHANGE the topic and the specific values/facts/names. Everything else (structure, pacing, number of scenes, visual directions, text patterns, tone) stays identical to the reference.
8. DO NOT add extra scenes, remove scenes, add disclaimers, add intros, or add outros unless the user explicitly asks.
9. DO NOT paraphrase loosely. This is a structural CLONE, not "inspiration." Think of it as filling in a Mad Libs template where only the topic-specific words change.
10. CRITICAL: A 60-second video of someone talking to camera = 1 scene. Not 7. Not 10. ONE. The script for that video is: "Scene: [person] speaking directly to camera, close-up. [Full script text here]." That's it.

WHEN TO BREAK FROM STRICT CLONING:
- User explicitly says "add more", "make it longer", "make it shorter", "change the structure", "don't follow the video", or "freestyle"
- User asks for a completely new script without referencing a connected video
- No video node is connected (then you write freely based on other context)

═══════════════════════════════════════════════════════════
SELF-PROPOSED STRUCTURE — STRICT FOLLOW-THROUGH
═══════════════════════════════════════════════════════════

When you propose a scene structure in your response (e.g. "Scene 1: Hook — do X, Scene 2: Body — do Y..."), that structure becomes a binding contract. If the user then asks you to generate the actual script:

1. COUNT your proposed scenes. Your script MUST have exactly that many scenes. Not one more, not one fewer.
2. MATCH each scene description 1:1. If you said "Scene 3: Show the patient reacting" — that scene must be exactly about that, not reinterpreted.
3. DO NOT pad, add explanations, add transition scenes, or add an outro unless your structure included one.
4. DO NOT silently change a scene's purpose. "Scene 5: The fix moment" means show the fix in scene 5 — not in scene 4 or 6.
5. If the user pastes your own structure back and says "now write this" — replicate it word-for-word as a Mad Libs template. Only fill in the topic-specific blanks.

SELF-CHECK before generating: "Did I propose N scenes? Does my output have exactly N scenes? Does each scene match what I described?" If not, fix it before responding.

═══════════════════════════════════════════════════════════
HOW TO READ CONNECTED CONTENT
═══════════════════════════════════════════════════════════

0. **CONNECTED NODES inventory** is listed at the top of canvas context. Read it first, silently. If a VideoNode shows transcription=true OR structure=true, you HAVE the data. Use it. Do NOT ask the user what it contains. Same for competitor posts — if a Transcription field appears under any competitor post, treat it as real data you can read and use right now.
1. **Video Transcriptions** = the actual words spoken + visual directions from the reference. This is your cloning template. Match it scene-for-scene.
2. **Video Structures** = hook/body/cta breakdown. Show ONLY the sections the user selected. If only "hook" is selected, only clone the hook.
3. **Text Notes** = CORE CONTEXT. These tell you WHAT the script should be about. Facts, stats, talking points, brand voice, creator instructions. Weave this content into the cloned structure.
4. **Research Facts** = additional data points to plug into the cloned template naturally.
5. **Selected Hook** (from Hook Generator) = the opening line pattern. Use it as the script's first line if present.
6. **Brand Guide** = hard constraints on tone, values, forbidden words. Never violate these.
7. **Selected CTA** (from CTA Builder) = the script MUST end with this exact call-to-action.
8. **Competitor Profiles** = each post includes its real URL, caption, outlier score, hook type, why it worked, apply-to-client advice, and sometimes a Transcription of the actual audio. RULES:
   - If a post has a Transcription field, USE IT immediately — read it, break it down, clone it, analyze it. Do NOT say you can't access Instagram or watch videos. You already have the words.
   - If a FRESHLY TRANSCRIBED section appears in the context, that was auto-fetched for the user's current request — use it as the primary source for the analysis/cloning task.
   - If the user asks to transcribe/copy/analyze a post and no transcription exists yet, say: "I'll transcribe that — give me a moment." The system is fetching it automatically. On retry it will appear.
   - Never tell the user to go watch the video manually. Never say "I can't access Instagram." You either have the transcript or the system is fetching it.
   - When the user asks for a competitor post URL, give it directly — it's real data.

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
12. When the user asks for a URL from a connected competitor node, give it. The URLs in competitor post data are real — don't say you "don't have access to URLs."
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
1. CLONE FIDELITY: Does the output have the EXACT same number of VISUAL scenes as the reference? If the reference is one continuous talking head shot, your output is ONE scene — not broken into numbered scenes. If you wrote "Scene 1, Scene 2, Scene 3..." but the reference video has no cuts, you failed. Fix it.
2. SPECIFICITY CHECK: Does every line reference something concrete? If any line could apply to "any motivational video," it's too generic. Rewrite it with specific details from the text notes or research facts.
3. TAM CHECK: Is the audience large enough for virality? Flag if too niche.
4. RELOOP CHECK: Is there a mid-video re-engagement moment?
5. STORY CLARITY: Does hook to body to CTA flow logically?

When you find an issue, be direct: "The hook assumes the viewer already knows what X is. Open with a relatable moment instead."

═══════════════════════════════════════════════════════
HOOK FORMULAS DATABASE — USE THESE WHEN SUGGESTING HOOKS
═══════════════════════════════════════════════════════

You have access to a curated library of 986 proven viral hook formulas. Below is a random sample. When the user asks you to suggest a hook, write a hook, or improve a hook, you MUST:

1. BASE your suggestion on one of these proven formulas. Adapt the template to the user's topic/niche.
2. NEVER invent a generic hook from scratch. Always start from a formula below and customize it.
3. When suggesting multiple hook options, use DIFFERENT formulas for each option.
4. Tell the user which category the hook comes from (educational, storytelling, myth busting, authority, comparison, day in the life, random).
5. Fill in the (insert X) placeholders with specific details from the user's context/topic.

HOOK FORMULAS (random sample — each request gets different hooks):
${sampleHooks(50)}`;
}

// ─── Ideation / Brainstorm mode ───────────────────────────────────────────────
// When the user flips on Ideation mode (or uses the "Brainstorm off-brand"
// chip), we drop the strict cloning / brand-voice instructions and let the
// model think broadly. Only the bare client name/target is passed through so
// the creative direction is still aware of who the script is ultimately for —
// it just isn't shackled to the connected voice notes and transcripts.
function buildIdeationSystemPrompt(clientInfo: any): string {
  const audienceHint = clientInfo?.target
    ? `The eventual audience is: ${clientInfo.target}. Use that as a loose filter, not a cage.`
    : "";
  const clientHint = clientInfo?.name
    ? `The creator is: ${clientInfo.name}.`
    : "";

  return `You are in IDEATION / BRAINSTORM mode inside ConnectaCreators' Super Planning Canvas.

${clientHint}
${audienceHint}

YOUR JOB RIGHT NOW:
Think like a smart, culturally fluent viral writer — NOT like a brand-safe assistant.
The user is exploring angles, hooks, and concepts. They want creative range, sharp cultural observations, punchy one-liners, and "I can't believe you said that" energy when it fits the topic.

HARD RULES FOR THIS MODE:
1. IGNORE any prior brand guide, voice memos, transcripts, or "stay on-brand" instructions from this session. They were context for script-writing, not brainstorming. Right now, the user's latest prompt is the only instruction that matters.
2. NEVER sanitize cultural observations to make them "nicer." If the user asks for "not normal things people do to impress others," give them the actual sharp versions (renting a Lambo for a Reel, flying to Dubai for content, 9-to-5 you hate to afford a car you can't) — not gym-routine or book-reading platitudes.
3. DO NOT default to the client's existing bits or voice. Bring outside reference points, internet culture, observational humor, and fresh angles.
4. Be specific. "A BMW you can't afford" beats "an expensive car." Specificity is where virality lives.
5. Variety is the point. If the user asks for 10 ideas, give 10 genuinely different ones — different flavors, tones, and angles.
6. Short and punchy by default. One line per idea unless asked for more.
7. If the user's prompt is ambiguous, ask one sharp clarifying question — but only one. Then assume and deliver.
8. No disclaimers, no hedging, no "I can't give personalized advice," no "remember to stay authentic." Just ship the ideas.

WHEN TO LEAVE THIS MODE:
You don't leave it on your own. The user flips the Ideation toggle off when they're ready to write the actual script. Until then, brainstorm.
${QUESTION_DECK_PROTOCOL}`;
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
    ? `\nCANVAS CONTEXT (connected nodes — USE THIS DATA when answering):\n${sanitizeText(clientInfo.canvas_context)}`
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
    const _role = roleData?.role;
    if (_role !== "admin" && _role !== "videographer" && _role !== "editor" && _role !== "connecta_plus") {
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
    const { messages, wizard_state, client_info, model: requestedModel, canvas_mode, mode, canvas_image_urls, title_mode, pasted_image_b64, pasted_image_type, stream: streamRequested, thinking: thinkingRequested, ideation_mode: ideationMode } = await req.json();

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

    // Resolve model config (what the user asked for)
    const requestedConfig = MODEL_CONFIG[requestedModel] || MODEL_CONFIG["claude-haiku-4-5"];

    // ── Intent-aware routing ──────────────────────────────────────────────
    // Classify the latest user message. Deep/research-like turns keep the
    // requested model + full context. Light follow-up turns silently
    // downgrade to a cheaper model. Credits are charged using the model that
    // actually runs — savings pass through to the end user.
    const isCanvas = !!canvas_mode;
    const isIdeation = !!ideationMode && isCanvas;
    const latestUserText = (() => {
      const last = [...messages].reverse().find((m: any) => m.role === "user");
      if (!last) return "";
      if (typeof last.content === "string") return last.content;
      if (Array.isArray(last.content)) return last.content.map((c: any) => c?.text ?? "").join(" ");
      return String(last.content ?? "");
    })();
    const routedModelKey = (() => {
      // Don't re-route when the user's already on the cheapest tier or
      // using OpenAI (different cost curve).
      if (requestedConfig.provider !== "anthropic") return requestedModel;
      if (requestedModel === "claude-haiku-4-5") return requestedModel;
      // Generation-style endpoints always honor the requested model.
      if (!isCanvas) return requestedModel;
      // Ideation is creative — keep the full-powered model.
      if (isIdeation) return requestedModel;
      const intent = classifyIntent(latestUserText);
      if (intent === "deep") return requestedModel;                 // keep Opus/Sonnet
      if (intent === "light") return "claude-haiku-4-5";            // downgrade all the way
      return requestedModel === "claude-opus-4"
        ? "claude-sonnet-4-5"                                       // medium → Sonnet from Opus
        : requestedModel;                                           // Sonnet requested → keep Sonnet
    })();
    const config = MODEL_CONFIG[routedModelKey] || requestedConfig;
    const model = config.apiModel;
    const provider = config.provider;
    const multiplier = config.multiplier;
    const wasDowngraded = routedModelKey !== requestedModel;

    // Canvas mode: simpler prompt, no wizard tools
    const systemPrompt = isIdeation
      ? buildIdeationSystemPrompt(client_info)
      : isCanvas
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

    console.log(`[ai-assistant] mode=${isCanvas ? "canvas" : "wizard"} provider=${provider} requested=${requestedModel} routed=${routedModelKey}${wasDowngraded ? ` (DOWNGRADED)` : ""} multiplier=${multiplier}x messages=${messages.length} systemPromptLen=${systemPrompt.length} canvasContext=${client_info?.canvas_context?.length ?? 0}${thinkingRequested ? " thinking=on" : ""}`);
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
      // Disable extended thinking on light follow-up turns (Haiku doesn't
      // support it anyway, but this also kills ~10k thinking tokens per turn
      // on Opus/Sonnet when the user is just tightening the last reply).
      const isLightTurn = classifyIntent(latestUserText) === "light";
      const isThinking = !!thinkingRequested && !isLightTurn && (model.includes("sonnet") || model.includes("opus"));
      const thinkingBudget = model.includes("opus") ? 10000 : 5000;
      // Canvas chat max_tokens is lower than generation — most replies are
      // conversational, not full scripts. Keep 4096 for non-canvas paths.
      const baseMaxTokens = isCanvas
        ? (model.includes("opus") ? 1536 : model.includes("sonnet") ? 1024 : 1024)
        : (model.includes("opus") ? 4096 : model.includes("sonnet") ? 2048 : 1024);
      // Opus 4.7+ deprecates thinking.type=enabled in favor of adaptive thinking + output_config.effort.
      // Detect the new generation by model ID.
      const usesAdaptiveThinking = /opus-4-7|opus-5|sonnet-4-7|sonnet-5/.test(model);
      const thinkingBlock = isThinking
        ? (usesAdaptiveThinking
            ? { thinking: { type: "adaptive" as const }, output_config: { effort: "high" as const } }
            : { thinking: { type: "enabled" as const, budget_tokens: thinkingBudget } })
        : {};
      const claudeBody: any = {
        model,
        max_tokens: isThinking ? baseMaxTokens + thinkingBudget : baseMaxTokens,
        ...thinkingBlock,
        system: (isCanvas && client_info?.canvas_context)
          ? [
              {
                type: "text",
                text: systemPrompt,
                cache_control: { type: "ephemeral" },
              },
              {
                type: "text",
                text: `<canvas_data>\n${sanitizeText(client_info.canvas_context)}\n</canvas_data>\n\nAbove is the LIVE data from all nodes currently connected on the canvas. Use it. Do NOT say you cannot see data included above.`,
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
                    } else if (ev.type === "content_block_delta" && ev.delta?.type === "thinking_delta") {
                      // Extended thinking block — skip (don't send to client)
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
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, credits_used: creditCost, actual_model: routedModelKey, requested_model: requestedModel, downgraded: wasDowngraded })}\n\n`));
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
      JSON.stringify({ message: displayMessage, action, credits_used: creditCost, actual_model: routedModelKey, requested_model: requestedModel, downgraded: wasDowngraded }),
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
