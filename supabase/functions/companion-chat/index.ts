import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { VIRAL_HOOKS } from "./hookData.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TOOLS = [
  {
    name: "navigate_to_page",
    description: "Navigate the user to a specific page in the app. Use this when the user needs to go somewhere or after you've completed an action.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Page path. Options: /onboarding, /scripts, /vault, /viral-today, /editing-queue, /content-calendar, /subscription, /ai, /dashboard",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "fill_onboarding_fields",
    description: "Fill in the client onboarding profile. Use when the user asks you to complete their profile, or when you have enough context to fill specific fields on their behalf.",
    input_schema: {
      type: "object",
      properties: {
        fields: {
          type: "object",
          description: "Key-value pairs. Available fields: clientName, email, instagram, tiktok, youtube, facebook, package, adBudget, top3Profiles, targetClient, industry, state, uniqueOffer, uniqueValues, competition, story, callLink, additionalNotes",
          additionalProperties: { type: "string" },
        },
        navigate_to_onboarding: {
          type: "boolean",
          description: "Set true to navigate the user to /onboarding after filling so they can review",
        },
      },
      required: ["fields"],
    },
  },
  {
    name: "save_memory",
    description: "Save an important fact about this client to long-term memory. Use this whenever you learn something significant: their main story, content pillars, target audience, best hooks, business results, key decisions, preferences. These memories persist forever and will be available in every future conversation.",
    input_schema: {
      type: "object",
      properties: {
        key: {
          type: "string",
          description: "Short identifier for this memory, e.g. 'main_story', 'content_pillars', 'target_audience', 'best_hook', 'business_result', 'preference'",
        },
        value: {
          type: "string",
          description: "The fact to remember, written as a clear statement. Be specific. Include numbers, names, and details.",
        },
      },
      required: ["key", "value"],
    },
  },
  {
    name: "find_viral_videos",
    description: "Search for viral videos by topic or niche to use as content inspiration. Returns videos with high outlier scores sorted by performance. Use this when looking for viral references for a client's content.",
    input_schema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Topic or keyword to search (e.g. 'sales', 'fitness', 'immigration attorney')" },
        platform: { type: "string", description: "Optional: instagram, tiktok, youtube" },
        limit: { type: "number", description: "Number of results to return (default 5, max 10)" },
      },
      required: ["topic"],
    },
  },
  {
    name: "list_client_scripts",
    description: "List existing scripts for a client. Use to check what scripts already exist before creating new ones.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "The client's name" },
        limit: { type: "number", description: "Number of scripts to return (default 5)" },
      },
      required: ["client_name"],
    },
  },
  {
    name: "schedule_content",
    description: "Schedule a piece of content to the client's content calendar. Sets a post date for a video or script.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "The client's name" },
        title: { type: "string", description: "The script or content title to schedule" },
        date: { type: "string", description: "The date to schedule it (YYYY-MM-DD format)" },
        caption: { type: "string", description: "Optional caption for the post" },
      },
      required: ["client_name", "title", "date"],
    },
  },
  {
    name: "submit_to_editing_queue",
    description: "Submit a script or content to the editing queue so an editor can work on it. Use when footage is uploaded or a script is ready for production.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "The client's name" },
        title: { type: "string", description: "The content title or script name" },
        notes: { type: "string", description: "Optional instructions for the editor" },
        schedule_date: { type: "string", description: "Optional target post date (YYYY-MM-DD)" },
      },
      required: ["client_name", "title"],
    },
  },
  {
    name: "get_editing_queue",
    description: "Check the current status of the editing queue for a client. Shows what's in progress, pending, and done.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "The client's name" },
      },
      required: ["client_name"],
    },
  },
  {
    name: "get_content_calendar",
    description: "View what content is scheduled in the content calendar for a client. Shows upcoming posts.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "The client's name" },
        days_ahead: { type: "number", description: "How many days ahead to look (default 14)" },
      },
      required: ["client_name"],
    },
  },
  {
    name: "create_canvas_note",
    description: "Create a text note or research note in the client's SuperPlanningCanvas. Use to add ideas, content pillars, research findings, or any notes to the canvas workspace.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "The client's name" },
        content: { type: "string", description: "The note content to add to the canvas" },
        note_type: { type: "string", description: "text_note or research_note (default: text_note)" },
      },
      required: ["client_name", "content"],
    },
  },
  {
    name: "get_hooks",
    description: "Get powerful viral hook templates from the hooks library. Use when building scripts to find the best hook structure for the content type. Filter by category to get relevant hooks.",
    input_schema: {
      type: "object",
      properties: {
        category: { type: "string", description: "Hook category: educational, storytelling, controversial, transformation, curiosity, social_proof, or leave empty for mixed" },
        count: { type: "number", description: "Number of hooks to return (default 5)" },
      },
      required: [],
    },
  },
  {
    name: "list_all_clients",
    description: "List all clients in the system with their basic info. Use when the user asks about their clients or you need to find a client.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get_client_info",
    description: "Look up a client's information by name. Use this BEFORE asking the user for info about a client. Always try to find the client yourself first. Returns their onboarding data, industry, story, and offer.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "The client's name or partial name to search for" },
      },
      required: ["client_name"],
    },
  },
  {
    name: "get_client_strategy",
    description: "Get a client's content strategy — their monthly posting targets, content mix, ManyChat keyword, CTA goal, ads status, and current month's progress. Call this before making any content decisions for a client so Robby knows exactly what the goals are.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "The client's name to look up" },
      },
      required: ["client_name"],
    },
  },
  {
    name: "update_client_strategy",
    description: "Update a client's content strategy settings — posts per month, scripts per month, videos per month, stories per week, content mix percentages, ManyChat settings, ads status, or revenue goals. Call this when the user wants to change any of these targets.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "The client's name" },
        posts_per_month: { type: "number", description: "Monthly posts target" },
        scripts_per_month: { type: "number", description: "Monthly scripts target" },
        videos_edited_per_month: { type: "number", description: "Monthly videos edited target" },
        stories_per_week: { type: "number", description: "Stories per week target" },
        mix_reach: { type: "number", description: "Reach content % (0-100)" },
        mix_trust: { type: "number", description: "Trust content % (0-100)" },
        mix_convert: { type: "number", description: "Convert content % (0-100)" },
        manychat_active: { type: "boolean", description: "Whether ManyChat is active" },
        manychat_keyword: { type: "string", description: "ManyChat trigger keyword" },
        cta_goal: { type: "string", description: "Primary CTA goal" },
        ads_active: { type: "boolean", description: "Whether ads are running" },
        ads_budget: { type: "number", description: "Monthly ads budget in USD" },
        monthly_revenue_goal: { type: "number", description: "Monthly revenue goal in USD" },
        monthly_revenue_actual: { type: "number", description: "Actual revenue this month in USD" },
      },
      required: ["client_name"],
    },
  },
  {
    name: "create_script",
    description: "Create and SAVE a real script in the system for a specific client. Call this when the user asks to build, write, create, or make a script. This inserts it into the database so the client can see and use it. Always build the full script — hook, body lines, CTA — then call this tool to save it.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "The client's name (used to find their account)" },
        title: { type: "string", description: "The script title / winning hook idea" },
        formato: { type: "string", description: "Video format: talking_head, b_roll, interview, variado" },
        lines: {
          type: "array",
          description: "All script lines in order",
          items: {
            type: "object",
            properties: {
              section: { type: "string", description: "hook, body, or cta" },
              line_type: { type: "string", description: "e.g. hook, screen_text, voiceover, body, cta" },
              text: { type: "string", description: "The actual script text for this line" },
            },
            required: ["section", "line_type", "text"],
          },
        },
      },
      required: ["client_name", "title", "lines"],
    },
  },
  {
    name: "respond_to_user",
    description: "Send a text response to the user. Use this when no other action is needed — just a message. In auto mode, you must always call a tool, so use this when the response is purely conversational.",
    input_schema: {
      type: "object",
      properties: {
        message: { type: "string", description: "The message to send to the user." },
      },
      required: ["message"],
    },
  },
  {
    name: "add_video_to_canvas",
    description: "Add a viral reference video as a VideoNode on the client's Super Canvas. The node will auto-transcribe when the user opens the canvas. Call this immediately after find_viral_videos to place the reference video visibly on the canvas. Always call this BEFORE add_research_note_to_canvas.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "The client's name" },
        video_url: { type: "string", description: "The full URL of the viral video" },
        video_title: { type: "string", description: "Title or hook of the video" },
        channel_username: { type: "string", description: "The creator's username (e.g. @victorheras)" },
        reason: { type: "string", description: "One sentence: why this video was chosen as inspiration" },
      },
      required: ["client_name", "video_url", "video_title", "reason"],
    },
  },
  {
    name: "add_research_note_to_canvas",
    description: "Add a research note to the canvas analyzing the viral video. Call this after add_video_to_canvas. Use the find_viral_videos caption and your knowledge of hook patterns to analyze the video structure.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "The client's name" },
        hook_type: { type: "string", description: "The hook category: storytelling, educational, comparison, authority, pattern_interrupt, or curiosity_gap" },
        hook_text: { type: "string", description: "The actual hook (first line of the video based on caption/title)" },
        why_it_works: { type: "string", description: "2-3 sentences: why this video performed. Be specific about the hook mechanism, not generic." },
        how_to_adapt: { type: "string", description: "1 sentence: how to apply this structure to the client's specific story and offer" },
      },
      required: ["client_name", "hook_type", "hook_text", "why_it_works", "how_to_adapt"],
    },
  },
  {
    name: "add_idea_nodes_to_canvas",
    description: "Add winning idea nodes to the canvas. In Auto mode: call with 1 idea (your best pick). In Ask or Plan mode: call with 3 ideas across different categories so the user can pick. Each idea is the WHAT — the hook premise tailored to this client's story and audience.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "The client's name" },
        ideas: {
          type: "array",
          description: "1 idea in Auto mode, 3 ideas in Ask/Plan mode. Each across a different category.",
          items: {
            type: "object",
            properties: {
              number: { type: "number", description: "1, 2, or 3" },
              category: { type: "string", description: "storytelling | educational | comparison | authority | pattern_interrupt | curiosity_gap" },
              hook_sentence: { type: "string", description: "The exact first line of the video — specific, not generic. Uses the client's real numbers/story." },
              framework: { type: "string", description: "The script structure: e.g. 'vulnerability open → 3 moments → turning point → ManyChat CTA'" },
              why_it_works: { type: "string", description: "One sentence: why this idea will stop the scroll for the target audience" },
            },
            required: ["number", "category", "hook_sentence", "framework", "why_it_works"],
          },
        },
      },
      required: ["client_name", "ideas"],
    },
  },
  {
    name: "add_script_draft_to_canvas",
    description: "Add the full script draft as a node on the canvas. The draft is the winning idea plugged into the framework — every line written. Call this after the idea is selected (either you chose it in Auto mode, or the user picked one in Ask/Plan mode). Do NOT call save_script_from_canvas yet.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "The client's name" },
        title: { type: "string", description: "The winning idea / hook title" },
        category: { type: "string", description: "The idea category used" },
        framework: { type: "string", description: "The framework applied" },
        hook: { type: "string", description: "The hook line(s)" },
        body: { type: "string", description: "The full body of the script, each line on a new line" },
        cta: { type: "string", description: "The call to action" },
      },
      required: ["client_name", "title", "category", "framework", "hook", "body", "cta"],
    },
  },
  {
    name: "save_script_from_canvas",
    description: "Save the canvas script draft to the scripts library. In Auto mode call this immediately after add_script_draft_to_canvas. In Ask mode only call this after the user confirms ('yes', 'save it', 'looks good'). In Plan mode only after explicit approval.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "The client's name" },
        title: { type: "string", description: "The script title / winning idea" },
        hook: { type: "string", description: "The hook line(s)" },
        body: { type: "string", description: "The body lines, each on a new line" },
        cta: { type: "string", description: "The call to action" },
        category: { type: "string", description: "The idea category" },
        framework: { type: "string", description: "The framework used" },
      },
      required: ["client_name", "title", "hook", "body", "cta"],
    },
  },
  {
    name: "build_script_full_pipeline",
    description: "ATOMIC ORCHESTRATOR — Use this for ALL script creation requests in Auto mode (and as the default in Ask/Plan when the user wants you to handle everything). Single call that does the COMPLETE pipeline: searches viral references, picks the best one, adds video node to canvas, generates research analysis, generates the winning idea, builds the full script, places everything on the canvas, and saves to scripts library. Returns a summary of what was built. Use this instead of calling find_viral_videos + add_video_to_canvas + add_research_note_to_canvas + add_idea_nodes_to_canvas + add_script_draft_to_canvas + save_script_from_canvas separately.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "The client's name" },
        topic: { type: "string", description: "Optional topic/niche keyword to search viral videos. If not provided, infers from client industry." },
        content_type: { type: "string", description: "reach | trust | convert. Determines hook framework. Pick based on what the client is most behind on per their strategy." },
      },
      required: ["client_name"],
    },
  },
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { message, companion_name, current_path, autonomy_mode } = await req.json() as {
      message: string;
      companion_name: string;
      current_path?: string;
      autonomy_mode?: "auto" | "ask" | "plan";
    };

    if (!message?.trim()) {
      return new Response(JSON.stringify({ error: "message is required" }), { status: 400, headers: corsHeaders });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: { user } } = await createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    ).auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { data: client } = await adminClient
      .from("clients")
      .select("id, name, onboarding_data")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!client) {
      return new Response(JSON.stringify({ error: "No client found" }), { status: 400, headers: corsHeaders });
    }

    // Load memory, strategy, history in parallel
    const [companionStateRes, strategyRes, historyRes] = await Promise.all([
      adminClient.from("companion_state").select("workflow_context").eq("client_id", client.id).maybeSingle(),
      adminClient.from("client_strategies").select("*").eq("client_id", client.id).maybeSingle(),
      adminClient.from("companion_messages").select("role, content").eq("client_id", client.id).order("created_at", { ascending: false }).limit(40),
    ]);

    const savedMemories: Record<string, string> = companionStateRes.data?.workflow_context || {};
    const strat = strategyRes.data;

    const priorMessages = ((historyRes.data || []) as any[]).reverse().map((m: any) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    // Build brand context from existing onboarding data
    const od = client.onboarding_data || {};
    const brandLines = [
      od.clientName && `Client name: ${od.clientName}`,
      od.industry && `Industry: ${od.industry}`,
      od.uniqueOffer && `Unique offer: ${od.uniqueOffer}`,
      od.targetClient && `Target audience: ${od.targetClient}`,
      od.uniqueValues && `Key values: ${od.uniqueValues}`,
      od.competition && `Competition: ${od.competition}`,
      od.story && `Story: ${od.story}`,
      od.instagram && `Instagram: @${od.instagram}`,
    ].filter(Boolean).join("\n");

    // Build strategy context — injected at startup so Mario always knows the plan
    let strategyContext = "";
    if (strat) {
      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
      const iso = monthStart.toISOString();
      const [{ count: scriptsThisMonth }, { count: videosThisMonth }, { count: postsThisMonth }] = await Promise.all([
        adminClient.from("scripts").select("id", { count: "exact", head: true }).eq("client_id", client.id).gte("created_at", iso),
        adminClient.from("video_edits").select("id", { count: "exact", head: true }).eq("client_id", client.id).eq("status", "Done").is("deleted_at", null).gte("created_at", iso),
        adminClient.from("video_edits").select("id", { count: "exact", head: true }).eq("client_id", client.id).gte("schedule_date", iso.slice(0,10)).is("deleted_at", null),
      ]);
      const s = scriptsThisMonth ?? 0;
      const v = videosThisMonth ?? 0;
      const p = postsThisMonth ?? 0;
      const analysis = strat.audience_analysis as any;
      strategyContext = `
CLIENT STRATEGY (read this before every decision):
Monthly targets: ${strat.scripts_per_month} scripts / ${strat.videos_edited_per_month} videos edited / ${strat.posts_per_month} posts scheduled
This month so far: ${s}/${strat.scripts_per_month} scripts · ${v}/${strat.videos_edited_per_month} videos · ${p}/${strat.posts_per_month} posts
Content mix goal: ${strat.mix_reach}% reach / ${strat.mix_trust}% trust / ${strat.mix_convert}% convert
ManyChat: ${strat.manychat_active ? `active — keyword: "${strat.manychat_keyword || "not set"}"` : "NOT SET UP — should be a priority"}
CTA goal: ${strat.cta_goal || "not set"}
Ads: ${strat.ads_active ? `running — $${strat.ads_budget}/month` : "not running"}
Revenue goal: $${strat.monthly_revenue_goal}/month · this month: $${strat.monthly_revenue_actual}
${analysis?.summary ? `\nAUDIENCE ANALYSIS (from Instagram scrape):\nAudience alignment: ${analysis.audience_score}/10 — ${analysis.audience_detail}\nContent uniqueness: ${analysis.uniqueness_score}/10 — ${analysis.uniqueness_detail}\nSummary: ${analysis.summary}` : ""}`;
    }

    // Format saved memories for injection
    const memoriesText = Object.keys(savedMemories).length > 0
      ? "\nWhat you remember about this client (long-term memory — treat these as facts):\n" +
        Object.entries(savedMemories).map(([k, v]) => `- ${k}: ${v}`).join("\n")
      : "";

    const name = companion_name || "AI";
    const systemPrompt = `You are ${name}, the AI assistant inside Connecta Creators — a done-for-you social media and personal branding platform for service professionals and local business owners.

WHAT CONNECTA DOES:
Connecta is a done-for-you agency focused on organic social media strategy and personal branding. The core offer is building authority and attention through organic content, then turning that attention into leads and clients.

The methodology:
- Outlier Method: Study the top 1% of content in the niche, reverse-engineer why it performed, then adapt it to the client's voice and offer.
- Protagonist-Focused Branding: Every account has one clear face. People follow people, not logos. Content is built around one person's personality, story, and expertise.
- TOFU/MOFU/BOFU funnel: TOFU = broad viral content to grow reach. MOFU = trust and authority content. BOFU = conversion content to turn warm audience into booked leads.
- Hook-First Scripting: The first 3 seconds of every video are the most important. Scripts are built backwards from the hook.
- ManyChat + Lead Magnets: Keyword triggers on viral posts that automatically DM a lead magnet to commenters, moving them into a real conversation.
- Compounding consistency: Not one viral post, but a system that stacks content week over week around the same protagonist and offer.

WHAT CONNECTA DOES NOT DO: SEO, web design, traditional PR, email marketing, e-commerce, B2B/enterprise work.

User's name: ${client.name || "there"}
Currently on page: ${current_path || "unknown"}
${brandLines ? `\nOnboarding data:\n${brandLines}` : "\nNo onboarding data yet."}
${strategyContext}
${memoriesText}

YOUR RULES — FOLLOW EXACTLY:
1. NEVER use markdown. No asterisks, no bold, no headers, no bullet dashes. Plain text only.
2. NEVER use emojis.
3. Speak plain English (or Spanish if they write in Spanish).
4. Be direct and action-oriented. When someone asks you to do something, DO IT using your tools — don't just ask questions.
5. When someone says "fill out the onboarding", "complete my profile", or similar — call fill_onboarding_fields immediately with whatever you know, then navigate them there to review.
6. Keep text replies short: 2-4 sentences. Never long paragraphs.
7. You are a coach who takes action, not a chatbot that asks questions.
8. Never say "pipeline", "leverage", "synergy", "streamline", "utilize", or "robust".
9. CRITICAL: Never ask the user for information you can look up yourself. If someone mentions a client by name, call get_client_info immediately to get their data. Never say "tell me about X" when you can look X up.
10. CRITICAL: If the user says "yes", "ok", "let's go", "sure", "do it" in response to something you suggested — execute it immediately using the appropriate tool. Do not ask again.
11. MEMORY: Whenever you learn something important — their story with specific numbers, content pillars, target audience, a great hook idea, a business result, preference — call save_memory immediately. Don't wait to be asked.
12. NEVER navigate manually. If navigation is needed, call navigate_to_page — the app takes them there. Never say "head to X", "go to X", "visit X".
13. ONBOARDING CONTEXT: If the user is on /onboarding, do NOT navigate away. Keep filling fields using fill_onboarding_fields until the form is fully complete.
14. PLAIN ENGLISH ONLY: Never use TOFU, MOFU, BOFU, "outlier method", or internal jargon. Translate: reach content = "content that gets new people to find you", trust = "builds authority with your audience", convert = "turns warm viewers into booked leads".
15. NEVER respond with "Done.", "OK.", "Sure." Every response must tell the user (a) what you did, (b) what you found, (c) what the next step is.
16. WHAT'S NEXT: When asked "what to do", "what's next", "now what" — read the CLIENT STRATEGY section already in your context. You already know the goals and gaps. Give a specific numbers-driven recommendation immediately. No need to call get_client_strategy first — it's already loaded above.
17. WORKFLOW GUIDE: (1) Onboarding complete → (2) Instagram handle added → (3) Viral references researched → (4) Winning idea identified → (5) Script created → (6) Client films → (7) Footage submitted to editing queue → (8) Editor assigned → (9) Approved → (10) Scheduled → (11) Posted. Always know where the client is and name the next step.
18. SCRIPT CREATION — MANDATORY ORCHESTRATOR PATTERN.

When asked to build a script, write a script, create content, or anything similar, you MUST call ONE tool: build_script_full_pipeline. That single tool does everything: searches viral references, picks the best one, adds video node to canvas, generates research analysis, identifies the winning idea, builds the full script, places all nodes on the canvas, and saves to scripts library.

USAGE:
- Pass client_name (the user's name from CLIENT STRATEGY context).
- Pass content_type ("reach" / "trust" / "convert") based on which is most behind in the strategy.
- Optionally pass topic to bias the viral search.

After build_script_full_pipeline returns, call respond_to_user with what was built — what reference video was used, the hook type, the winning idea verbatim, and that the script is saved. Be specific. Use the data from the tool result, not made-up details.

DO NOT call find_viral_videos, add_video_to_canvas, add_research_note_to_canvas, add_idea_nodes_to_canvas, add_script_draft_to_canvas, or save_script_from_canvas separately. Those are deprecated for the orchestrated flow. Use build_script_full_pipeline only.

For batch ("build 20 scripts"): call build_script_full_pipeline 20 times in the same response (or as many as you can per response — at least 5 in parallel). Vary the content_type each time to balance the mix.

In Ask/Plan mode, you may still call build_script_full_pipeline directly — the user wants the work done. Just announce what you're about to do first, then call it.
19. TOOLS: You have navigate_to_page, fill_onboarding_fields, create_script, find_viral_videos, schedule_content, submit_to_editing_queue, get_editing_queue, get_content_calendar, create_canvas_note, list_all_clients, get_client_info, get_hooks, get_client_strategy, save_memory, respond_to_user. Use them. Don't describe what you'd do — do it.

AUTONOMY MODE: ${autonomy_mode || "ask"}
${autonomy_mode === "auto"
  ? `AUTO MODE — CRITICAL RULES:
- You MUST call a tool on every single response. Never output plain text without calling a tool first.
- ALWAYS call respond_to_user alongside other tools so the user knows what you're doing. "On it." is banned. Be specific.
- NEVER ask for permission or confirmation. The user selected Auto mode — they want you to act.

SCRIPT CREATION IN AUTO MODE: When asked to build a script, call build_script_full_pipeline (the orchestrator that does everything atomically) AND respond_to_user in the SAME response. Two tools, that's it. Do NOT call navigate_to_page as your first action. The orchestrator handles all the work.

For everything else (non-script tasks): Think: what is the single most useful action I can take RIGHT NOW? Take it — and tell the user what you're doing.`
  : autonomy_mode === "plan"
  ? "PLAN MODE: Before doing anything, write out a numbered plan of every step you will take. Ask the user to approve the plan. Only execute after they confirm."
  : "ASK MODE: Before taking any action that changes data or navigates pages, briefly say what you are about to do in one sentence and wait for the user to confirm. Then execute once they say yes."
}`;

    // Save user message
    await adminClient.from("companion_messages").insert({
      client_id: client.id,
      role: "user",
      content: message,
    });

    // Prune to 50 messages
    const { data: allMsgs } = await adminClient
      .from("companion_messages")
      .select("id")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false });

    if (allMsgs && allMsgs.length > 50) {
      const toDelete = allMsgs.slice(50).map((m: any) => m.id);
      await adminClient.from("companion_messages").delete().in("id", toDelete);
    }

    // First Claude call with tools
    const firstRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system: systemPrompt,
        tools: TOOLS,
        // In auto mode, force Claude to always call a tool (never just output text)
        ...(autonomy_mode === "auto" ? { tool_choice: { type: "any" } } : {}),
        messages: [...priorMessages, { role: "user", content: message }],
      }),
    });

    const firstResult = await firstRes.json();
    const actions: any[] = [];
    let reply = "";
    let turn1Reply = ""; // preserve Turn 1 reply as fallback if Turn 2 only navigates

    // Process response — may have tool_use blocks
    if (firstResult.stop_reason === "tool_use") {
      const toolUseBlocks = firstResult.content.filter((b: any) => b.type === "tool_use");
      const textBlocks = firstResult.content.filter((b: any) => b.type === "text");
      if (textBlocks.length > 0) { reply = textBlocks[0].text; turn1Reply = reply; }

      const toolResults: any[] = [];

      for (const block of toolUseBlocks) {
        if (block.name === "respond_to_user") {
          // Pure text response wrapped as a tool call (used in auto mode)
          reply = block.input.message || "";
          turn1Reply = reply;
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Message sent." });
        }

        if (block.name === "create_script") {
          const { client_name, title, formato, lines } = block.input;

          // Find the client
          const { data: targetClient } = await adminClient
            .from("clients")
            .select("id, name")
            .ilike("name", "%" + client_name + "%")
            .limit(1)
            .maybeSingle();

          if (!targetClient) {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Client not found: " + client_name });
          } else {
            // Insert the script
            const rawContent = lines.map((l: any) => l.text).join("\n");
            const { data: script, error: scriptErr } = await adminClient
              .from("scripts")
              .insert({
                client_id: targetClient.id,
                title,
                idea_ganadora: title,
                raw_content: rawContent,
                formato: formato || null,
                status: "complete",
              })
              .select("id")
              .single();

            if (scriptErr || !script) {
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Error saving script: " + (scriptErr?.message || "unknown") });
            } else {
              // Insert script lines
              const lineRows = lines.map((l: any, i: number) => ({
                script_id: script.id,
                line_number: i + 1,
                line_type: l.line_type || "body",
                section: l.section || "body",
                text: l.text,
              }));
              await adminClient.from("script_lines").insert(lineRows);

              // Navigate to the client's scripts page
              actions.push({ type: "navigate", path: "/clients/" + targetClient.id + "/scripts" });
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Script saved for " + targetClient.name + " with " + lines.length + " lines." });
            }
          }
        }

        if (block.name === "get_hooks") {
          const { category, count = 5 } = block.input;
          let pool = VIRAL_HOOKS;
          if (category) pool = pool.filter((h: any) => h.category.toLowerCase().includes(category.toLowerCase()));
          const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, count);
          const result = shuffled.map((h: any) => "[" + h.category + "] " + h.template).join("\n\n");
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Hook templates:\n\n" + result });
        }

        if (block.name === "list_all_clients") {
          const { data: allClients } = await adminClient
            .from("clients")
            .select("id, name, email, onboarding_data")
            .order("name");
          const summary = (allClients || []).map((c: any) => {
            const od = c.onboarding_data || {};
            return c.name + " (" + c.email + ")" + (od.industry ? " — " + od.industry : "");
          }).join("\n");
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: summary || "No clients found." });
        }

        if (block.name === "find_viral_videos") {
          const { topic, platform, limit = 5 } = block.input;
          let query = adminClient
            .from("viral_videos")
            .select("id, channel_username, platform, caption, views_count, likes_count, outlier_score, video_url, thumbnail_url")
            .gte("outlier_score", 3)
            .order("outlier_score", { ascending: false })
            .limit(Math.min(limit, 10));
          if (topic) query = query.ilike("caption", "%" + topic + "%");
          if (platform) query = query.eq("platform", platform);
          const { data: videos } = await query;
          if (!videos || videos.length === 0) {
            // Fallback: top viral videos regardless of caption match
            const { data: fallback } = await adminClient
              .from("viral_videos")
              .select("id, channel_username, platform, caption, views_count, outlier_score, video_url")
              .gte("outlier_score", 5)
              .order("outlier_score", { ascending: false })
              .limit(5);
            const info = (fallback || []).map((v: any) =>
              "@" + v.channel_username + " (" + v.platform + ") — " + (v.views_count || 0).toLocaleString() + " views, outlier score " + v.outlier_score + ". Caption: " + (v.caption || "").slice(0, 100)
            ).join("\n\n");
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "No exact matches for topic. Top viral videos:\n" + info });
          } else {
            const info = videos.map((v: any) =>
              "@" + v.channel_username + " (" + v.platform + ") — " + (v.views_count || 0).toLocaleString() + " views, outlier score " + v.outlier_score + ". Caption: " + (v.caption || "").slice(0, 150)
            ).join("\n\n");
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: videos.length + " viral videos found:\n\n" + info });
          }
        }

        if (block.name === "list_client_scripts") {
          const { client_name, limit = 5 } = block.input;
          const { data: targetClient } = await adminClient.from("clients").select("id, name").ilike("name", "%" + client_name + "%").limit(1).maybeSingle();
          if (!targetClient) {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Client not found: " + client_name });
          } else {
            const { data: scripts } = await adminClient
              .from("scripts")
              .select("id, idea_ganadora, status, created_at, review_status")
              .eq("client_id", targetClient.id)
              .order("created_at", { ascending: false })
              .limit(limit);
            const info = (scripts || []).map((s: any) =>
              (s.idea_ganadora || "Untitled") + " — " + (s.status || "draft") + (s.review_status ? " (" + s.review_status + ")" : "")
            ).join("\n");
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: (scripts?.length || 0) + " scripts for " + targetClient.name + ":\n" + info });
          }
        }

        if (block.name === "schedule_content") {
          const { client_name, title, date, caption } = block.input;
          const { data: targetClient } = await adminClient.from("clients").select("id, name").ilike("name", "%" + client_name + "%").limit(1).maybeSingle();
          if (!targetClient) {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Client not found: " + client_name });
          } else {
            // Find matching video_edit or create one
            const { data: existing } = await adminClient
              .from("video_edits")
              .select("id")
              .eq("client_id", targetClient.id)
              .ilike("reel_title", "%" + title + "%")
              .limit(1)
              .maybeSingle();
            if (existing) {
              await adminClient.from("video_edits").update({ schedule_date: date, caption: caption || null }).eq("id", existing.id);
              actions.push({ type: "navigate", path: "/content-calendar" });
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Scheduled '" + title + "' for " + date });
            } else {
              await adminClient.from("video_edits").insert({ client_id: targetClient.id, reel_title: title, schedule_date: date, caption: caption || null, status: "Not started", post_status: "Unpublished" });
              actions.push({ type: "navigate", path: "/content-calendar" });
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Created and scheduled '" + title + "' for " + date });
            }
          }
        }

        if (block.name === "submit_to_editing_queue") {
          const { client_name, title, notes, schedule_date } = block.input;
          const { data: targetClient } = await adminClient.from("clients").select("id, name").ilike("name", "%" + client_name + "%").limit(1).maybeSingle();
          if (!targetClient) {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Client not found: " + client_name });
          } else {
            const { data: ve } = await adminClient.from("video_edits").insert({
              client_id: targetClient.id,
              reel_title: title,
              status: "Not started",
              post_status: "Unpublished",
              revisions: notes || null,
              schedule_date: schedule_date || null,
            }).select("id").single();
            actions.push({ type: "navigate", path: "/editing-queue" });
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "'" + title + "' added to editing queue for " + targetClient.name });
          }
        }

        if (block.name === "get_editing_queue") {
          const { client_name } = block.input;
          const { data: targetClient } = await adminClient.from("clients").select("id, name").ilike("name", "%" + client_name + "%").limit(1).maybeSingle();
          if (!targetClient) {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Client not found: " + client_name });
          } else {
            const { data: items } = await adminClient
              .from("video_edits")
              .select("reel_title, status, assignee, schedule_date, post_status")
              .eq("client_id", targetClient.id)
              .is("deleted_at", null)
              .order("created_at", { ascending: false })
              .limit(10);
            const info = (items || []).map((i: any) =>
              (i.reel_title || "Untitled") + " — " + i.status + (i.assignee ? " (editor: " + i.assignee + ")" : " (no editor)") + (i.schedule_date ? " — posts " + i.schedule_date : "")
            ).join("\n");
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Editing queue for " + targetClient.name + ":\n" + info });
          }
        }

        if (block.name === "get_content_calendar") {
          const { client_name, days_ahead = 14 } = block.input;
          const { data: targetClient } = await adminClient.from("clients").select("id, name").ilike("name", "%" + client_name + "%").limit(1).maybeSingle();
          if (!targetClient) {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Client not found: " + client_name });
          } else {
            const today = new Date().toISOString().slice(0, 10);
            const future = new Date(Date.now() + days_ahead * 86400000).toISOString().slice(0, 10);
            const { data: items } = await adminClient
              .from("video_edits")
              .select("reel_title, schedule_date, post_status, caption")
              .eq("client_id", targetClient.id)
              .gte("schedule_date", today)
              .lte("schedule_date", future)
              .is("deleted_at", null)
              .order("schedule_date");
            if (!items || items.length === 0) {
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "No content scheduled in the next " + days_ahead + " days for " + targetClient.name });
            } else {
              const info = items.map((i: any) => i.schedule_date + ": " + (i.reel_title || "Untitled") + " — " + i.post_status).join("\n");
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Content calendar for " + targetClient.name + " (next " + days_ahead + " days):\n" + info });
            }
          }
        }

        if (block.name === "create_canvas_note") {
          const { client_name, content, note_type = "text_note" } = block.input;
          const { data: targetClient } = await adminClient.from("clients").select("id, name").ilike("name", "%" + client_name + "%").limit(1).maybeSingle();
          if (!targetClient) {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Client not found: " + client_name });
          } else {
            // Get or find active canvas state
            const { data: canvasState } = await adminClient
              .from("canvas_states")
              .select("id, nodes")
              .eq("client_id", targetClient.id)
              .eq("is_active", true)
              .limit(1)
              .maybeSingle();
            const nodeId = crypto.randomUUID();
            const newNode = {
              id: nodeId,
              type: note_type === "research_note" ? "researchNote" : "textNote",
              position: { x: Math.floor(Math.random() * 400) + 100, y: Math.floor(Math.random() * 300) + 100 },
              data: { text: content, content, label: content.slice(0, 50) },
            };
            if (canvasState) {
              const existingNodes = Array.isArray(canvasState.nodes) ? canvasState.nodes : [];
              await adminClient.from("canvas_states").update({ nodes: [...existingNodes, newNode] }).eq("id", canvasState.id);
              actions.push({ type: "navigate", path: "/scripts?view=canvas" });
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Note added to " + targetClient.name + "'s canvas." });
            } else {
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "No active canvas found for " + targetClient.name + ". Have them open the Connecta AI canvas first." });
            }
          }
        }

        if (block.name === "add_video_to_canvas") {
          const { client_name, video_url, video_title, channel_username, reason } = block.input;
          const { data: targetClient } = await adminClient
            .from("clients").select("id, name").ilike("name", "%" + client_name + "%").limit(1).maybeSingle();
          if (!targetClient) {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Client not found: " + client_name });
          } else {
            const { data: canvasState } = await adminClient
              .from("canvas_states").select("id, nodes").eq("client_id", targetClient.id).eq("is_active", true).limit(1).maybeSingle();
            if (!canvasState) {
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "No active canvas for " + targetClient.name + ". Have the user open Super Canvas first." });
            } else {
              const existingNodes = Array.isArray(canvasState.nodes) ? canvasState.nodes : [];
              const videoNodeCount = existingNodes.filter((n: any) => n.type === "videoNode").length;
              const rowY = videoNodeCount * 700;
              const nodeId = `videoNode_mario_${Date.now()}`;
              const newNode = {
                id: nodeId,
                type: "videoNode",
                position: { x: 50, y: rowY },
                data: {
                  url: video_url,
                  videoTitle: video_title,
                  videoLabel: video_title,
                  channel_username: channel_username || "",
                  caption: reason,
                },
              };
              await adminClient.from("canvas_states").update({ nodes: [...existingNodes, newNode] }).eq("id", canvasState.id);
              actions.push({ type: "navigate", path: "/scripts?view=canvas" });
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Video node added to canvas for ${targetClient.name}: "${video_title}". The node will auto-transcribe when the canvas opens. Row position: ${rowY}.` });
            }
          }
        }

        if (block.name === "add_research_note_to_canvas") {
          const { client_name, hook_type, hook_text, why_it_works, how_to_adapt } = block.input;
          const { data: targetClient } = await adminClient
            .from("clients").select("id, name").ilike("name", "%" + client_name + "%").limit(1).maybeSingle();
          if (!targetClient) {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Client not found: " + client_name });
          } else {
            const { data: canvasState } = await adminClient
              .from("canvas_states").select("id, nodes").eq("client_id", targetClient.id).eq("is_active", true).limit(1).maybeSingle();
            if (!canvasState) {
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "No active canvas for " + targetClient.name + "." });
            } else {
              const existingNodes = Array.isArray(canvasState.nodes) ? canvasState.nodes : [];
              const videoNodeCount = existingNodes.filter((n: any) => n.type === "videoNode").length;
              const rowY = Math.max(0, videoNodeCount - 1) * 700;
              const nodeId = `textNoteNode_research_${Date.now()}`;
              const noteText = `HOOK TYPE: ${hook_type.toUpperCase()}\n\nHook: "${hook_text}"\n\nWhy it works: ${why_it_works}\n\nHow to adapt: ${how_to_adapt}`;
              const newNode = {
                id: nodeId,
                type: "textNoteNode",
                position: { x: 370, y: rowY },
                data: {
                  noteText,
                  noteHtml: `<p><strong>HOOK TYPE: ${hook_type.toUpperCase()}</strong></p><p>Hook: "${hook_text}"</p><p>Why it works: ${why_it_works}</p><p>How to adapt: ${how_to_adapt}</p>`,
                },
              };
              await adminClient.from("canvas_states").update({ nodes: [...existingNodes, newNode] }).eq("id", canvasState.id);
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Research note added to ${targetClient.name}'s canvas.` });
            }
          }
        }

        if (block.name === "add_idea_nodes_to_canvas") {
          const { client_name, ideas } = block.input;
          const { data: targetClient } = await adminClient
            .from("clients").select("id, name").ilike("name", "%" + client_name + "%").limit(1).maybeSingle();
          if (!targetClient) {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Client not found: " + client_name });
          } else {
            const { data: canvasState } = await adminClient
              .from("canvas_states").select("id, nodes").eq("client_id", targetClient.id).eq("is_active", true).limit(1).maybeSingle();
            if (!canvasState) {
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "No active canvas for " + targetClient.name + "." });
            } else {
              const existingNodes = Array.isArray(canvasState.nodes) ? canvasState.nodes : [];
              const videoNodeCount = existingNodes.filter((n: any) => n.type === "videoNode").length;
              const rowY = Math.max(0, videoNodeCount - 1) * 700;
              const ideaNodes = (ideas as any[]).map((idea: any, i: number) => {
                const nodeId = `textNoteNode_idea_${Date.now()}_${i}`;
                const noteText = `IDEA ${idea.number} — ${idea.category.toUpperCase()}\n\n"${idea.hook_sentence}"\n\nFramework: ${idea.framework}\n\nWhy it works: ${idea.why_it_works}`;
                return {
                  id: nodeId,
                  type: "textNoteNode",
                  position: { x: 680, y: rowY + i * 210 },
                  data: {
                    noteText,
                    noteHtml: `<p><strong>IDEA ${idea.number} — ${idea.category.toUpperCase()}</strong></p><p>"${idea.hook_sentence}"</p><p>Framework: ${idea.framework}</p><p>Why it works: ${idea.why_it_works}</p>`,
                  },
                };
              });
              await adminClient.from("canvas_states").update({ nodes: [...existingNodes, ...ideaNodes] }).eq("id", canvasState.id);
              const summary = (ideas as any[]).map((idea: any) => `Idea ${idea.number} (${idea.category}): "${idea.hook_sentence}"`).join("\n");
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `${ideas.length} idea node(s) added to canvas:\n${summary}` });
            }
          }
        }

        if (block.name === "add_script_draft_to_canvas") {
          const { client_name, title, category, framework, hook, body, cta } = block.input;
          const { data: targetClient } = await adminClient
            .from("clients").select("id, name").ilike("name", "%" + client_name + "%").limit(1).maybeSingle();
          if (!targetClient) {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Client not found: " + client_name });
          } else {
            const { data: canvasState } = await adminClient
              .from("canvas_states").select("id, nodes").eq("client_id", targetClient.id).eq("is_active", true).limit(1).maybeSingle();
            if (!canvasState) {
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "No active canvas for " + targetClient.name + "." });
            } else {
              const existingNodes = Array.isArray(canvasState.nodes) ? canvasState.nodes : [];
              const videoNodeCount = existingNodes.filter((n: any) => n.type === "videoNode").length;
              const rowY = Math.max(0, videoNodeCount - 1) * 700;
              const nodeId = `textNoteNode_script_${Date.now()}`;
              const noteText = `SCRIPT DRAFT — ${category.toUpperCase()}\nFramework: ${framework}\n\nHOOK:\n${hook}\n\nBODY:\n${body}\n\nCTA:\n${cta}`;
              const newNode = {
                id: nodeId,
                type: "textNoteNode",
                position: { x: 980, y: rowY },
                data: {
                  noteText,
                  noteHtml: `<p><strong>SCRIPT DRAFT — ${category.toUpperCase()}</strong></p><p>Framework: ${framework}</p><p><strong>HOOK:</strong></p><p>${hook.replace(/\n/g, "<br>")}</p><p><strong>BODY:</strong></p><p>${body.replace(/\n/g, "<br>")}</p><p><strong>CTA:</strong></p><p>${cta}</p>`,
                  width: 320,
                },
              };
              await adminClient.from("canvas_states").update({ nodes: [...existingNodes, newNode] }).eq("id", canvasState.id);
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Script draft added to ${targetClient.name}'s canvas: "${title}". The user can edit it directly on the canvas.` });
            }
          }
        }

        if (block.name === "save_script_from_canvas") {
          const { client_name, title, hook, body, cta, category, framework } = block.input;
          const { data: targetClient } = await adminClient
            .from("clients").select("id, name").ilike("name", "%" + client_name + "%").limit(1).maybeSingle();
          if (!targetClient) {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Client not found: " + client_name });
          } else {
            const rawContent = [hook, body, cta].join("\n");
            const { data: script, error: scriptErr } = await adminClient
              .from("scripts")
              .insert({
                client_id: targetClient.id,
                title,
                idea_ganadora: title,
                raw_content: rawContent,
                formato: "talking_head",
                status: "complete",
              })
              .select("id")
              .single();
            if (scriptErr || !script) {
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Error saving script: " + (scriptErr?.message || "unknown") });
            } else {
              const bodyLines = body.split("\n").filter(Boolean);
              const lineRows = [
                { script_id: script.id, line_number: 1, line_type: "hook", section: "hook", text: hook },
                ...bodyLines.map((line: string, i: number) => ({
                  script_id: script.id, line_number: i + 2, line_type: "body", section: "body", text: line,
                })),
                { script_id: script.id, line_number: bodyLines.length + 2, line_type: "cta", section: "cta", text: cta },
              ];
              await adminClient.from("script_lines").insert(lineRows);
              actions.push({ type: "navigate", path: `/clients/${targetClient.id}/scripts` });
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Script "${title}" saved to ${targetClient.name}'s scripts library.` });
            }
          }
        }

        if (block.name === "get_client_strategy") {
          const { client_name } = block.input;
          const { data: targetClient } = await adminClient
            .from("clients")
            .select("id, name")
            .ilike("name", "%" + client_name + "%")
            .limit(1)
            .maybeSingle();

          if (!targetClient) {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Client not found: " + client_name });
          } else {
            const { data: strat } = await adminClient
              .from("client_strategies")
              .select("*")
              .eq("client_id", targetClient.id)
              .maybeSingle();

            const monthStart = new Date();
            monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
            const iso = monthStart.toISOString();

            const [{ count: scriptCount }, { count: videoCount }, { count: calCount }] = await Promise.all([
              adminClient.from("scripts").select("id", { count: "exact", head: true }).eq("client_id", targetClient.id).gte("created_at", iso),
              adminClient.from("video_edits").select("id", { count: "exact", head: true }).eq("client_id", targetClient.id).eq("status", "Done").is("deleted_at", null).gte("created_at", iso),
              adminClient.from("video_edits").select("id", { count: "exact", head: true }).eq("client_id", targetClient.id).gte("schedule_date", iso.slice(0, 10)).is("deleted_at", null),
            ]);

            const s = strat || { posts_per_month: 20, scripts_per_month: 20, videos_edited_per_month: 20, stories_per_week: 10, mix_reach: 60, mix_trust: 30, mix_convert: 10, manychat_active: false, manychat_keyword: null, cta_goal: "manychat", ads_active: false, ads_budget: 0, monthly_revenue_goal: 0, monthly_revenue_actual: 0 };

            const analysis = (s as any).audience_analysis;
            const summaryLines = [
              "Strategy for " + targetClient.name + ":",
              "Monthly targets: " + s.scripts_per_month + " scripts, " + s.videos_edited_per_month + " videos edited, " + s.posts_per_month + " posts scheduled",
              "This month so far: " + (scriptCount || 0) + " scripts, " + (videoCount || 0) + " videos done, " + (calCount || 0) + " posts scheduled",
              "Content mix: " + s.mix_reach + "% reach / " + s.mix_trust + "% trust / " + s.mix_convert + "% convert",
              "Stories per week: " + s.stories_per_week,
              "ManyChat: " + (s.manychat_active ? "active, keyword: " + (s.manychat_keyword || "not set") : "NOT SET UP — priority action"),
              "CTA goal: " + s.cta_goal,
              "Ads: " + (s.ads_active ? "running, budget $" + s.ads_budget + "/month" : "not running"),
              "Revenue goal: $" + s.monthly_revenue_goal + "/month, this month: $" + s.monthly_revenue_actual,
              analysis ? [
                "Audience alignment: " + analysis.audience_score + "/10 — " + (analysis.audience_detail || ""),
                "Content uniqueness: " + analysis.uniqueness_score + "/10 — " + (analysis.uniqueness_detail || ""),
                "Analysis: " + (analysis.summary || ""),
              ].join("\n") : "Audience analysis: not yet run",
            ].join("\n");
            const summary = summaryLines;

            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: summary });
          }
        }

        if (block.name === "update_client_strategy") {
          const { client_name, ...updates } = block.input;
          const { data: targetClient } = await adminClient
            .from("clients")
            .select("id, name")
            .ilike("name", "%" + client_name + "%")
            .limit(1)
            .maybeSingle();

          if (!targetClient) {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Client not found: " + client_name });
          } else {
            // Remove undefined values
            const patch: Record<string, any> = { client_id: targetClient.id };
            const fields = ["posts_per_month","scripts_per_month","videos_edited_per_month","stories_per_week","mix_reach","mix_trust","mix_convert","manychat_active","manychat_keyword","cta_goal","ads_active","ads_budget","monthly_revenue_goal","monthly_revenue_actual"];
            for (const f of fields) {
              if (updates[f] !== undefined) patch[f] = updates[f];
            }

            const { error } = await adminClient
              .from("client_strategies")
              .upsert(patch, { onConflict: "client_id" });

            if (error) {
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Failed to update strategy: " + error.message });
            } else {
              const changed = Object.entries(patch)
                .filter(([k]) => k !== "client_id")
                .map(([k, v]) => `${k}: ${v}`)
                .join(", ");
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Strategy updated for " + targetClient.name + ". Changed: " + changed });
            }
          }
        }

        if (block.name === "get_client_info") {
          const { client_name } = block.input;
          const { data: clientInfo } = await adminClient
            .from("clients")
            .select("name, email, onboarding_data")
            .ilike("name", `%${client_name}%`)
            .limit(1)
            .maybeSingle();
          const info = clientInfo
            ? `Client: ${clientInfo.name} (${clientInfo.email})\n${JSON.stringify(clientInfo.onboarding_data || {}, null, 2)}`
            : `No client found matching "${client_name}"`;
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: info });
        }

        if (block.name === "navigate_to_page") {
          const { path } = block.input;
          actions.push({ type: "navigate", path });
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Navigating to " + path });
        }

        if (block.name === "save_memory") {
          const { key, value } = block.input;
          const updatedMemories = { ...savedMemories, [key]: value };
          await adminClient.from("companion_state").upsert(
            { client_id: client.id, workflow_context: updatedMemories },
            { onConflict: "client_id" }
          );
          // Update local copy so subsequent saves in same call stack correctly
          savedMemories[key] = value;
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Saved memory: " + key });
        }

        if (block.name === "build_script_full_pipeline") {
          const { client_name, topic, content_type } = block.input;
          // 1. Look up client + onboarding + strategy
          const { data: targetClient } = await adminClient
            .from("clients").select("id, name, onboarding_data").ilike("name", "%" + client_name + "%").limit(1).maybeSingle();
          if (!targetClient) {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Client not found: " + client_name });
          } else {
            const od = (targetClient.onboarding_data as any) || {};
            const inferredTopic = topic || od.industry || od.uniqueOffer || "social media";
            const inferredContentType = content_type || "reach";

            // 2. Get or create active canvas (pick most recently updated if multiple)
            let { data: canvasState } = await adminClient
              .from("canvas_states").select("id, nodes").eq("client_id", targetClient.id).eq("is_active", true).order("updated_at", { ascending: false }).limit(1).maybeSingle();
            if (!canvasState) {
              const { data: newCanvas } = await adminClient.from("canvas_states").insert({
                client_id: targetClient.id, is_active: true, nodes: [], edges: [],
              }).select("id, nodes").single();
              canvasState = newCanvas;
            }
            if (!canvasState) {
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Could not create canvas for " + targetClient.name });
            } else {
              const existingNodes = Array.isArray(canvasState.nodes) ? canvasState.nodes : [];
              const videoNodeCount = existingNodes.filter((n: any) => n.type === "videoNode").length;
              const rowY = videoNodeCount * 700;

              // 3. Find viral video (try topic match, fall back to top viral)
              let { data: videos } = await adminClient
                .from("viral_videos")
                .select("id, channel_username, platform, caption, views_count, outlier_score, video_url")
                .ilike("caption", "%" + inferredTopic + "%")
                .gte("outlier_score", 3)
                .order("outlier_score", { ascending: false })
                .limit(5);
              if (!videos || videos.length === 0) {
                const { data: fallback } = await adminClient
                  .from("viral_videos")
                  .select("id, channel_username, platform, caption, views_count, outlier_score, video_url")
                  .gte("outlier_score", 5)
                  .order("outlier_score", { ascending: false })
                  .limit(5);
                videos = fallback || [];
              }
              if (videos.length === 0) {
                toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "No viral videos in the database to reference. Add some via the Viral Today scraper first." });
              } else {
                const chosenVideo = videos[0];

                // 4. Call Claude internally to generate analysis + idea + script
                const synthesisPrompt = `You are building a script for ${targetClient.name}. Generate the analysis, winning idea, and full script.

CLIENT CONTEXT:
- Industry: ${od.industry || "not specified"}
- Target audience: ${od.targetClient || "not specified"}
- Unique offer: ${od.uniqueOffer || "not specified"}
- Story: ${od.story || "not specified"}
- Instagram: @${od.instagram || "not specified"}

VIRAL REFERENCE:
- Creator: @${chosenVideo.channel_username}
- Views: ${(chosenVideo.views_count || 0).toLocaleString()}
- Caption/title: "${(chosenVideo.caption || "").slice(0, 400)}"

CONTENT TYPE NEEDED: ${inferredContentType}

Generate JSON with this exact structure (no markdown, no explanation, just valid JSON):
{
  "research": {
    "hook_type": "<storytelling | educational | comparison | authority | pattern_interrupt | curiosity_gap>",
    "hook_text": "<the actual first line of the reference video — extract from caption>",
    "why_it_works": "<2-3 sentences explaining the hook mechanism specifically>",
    "how_to_adapt": "<1 sentence on how to apply to ${targetClient.name}'s specific story>"
  },
  "idea": {
    "category": "<one of the 6 categories>",
    "hook_sentence": "<the WINNING idea — first line of THE NEW script. Specific. Uses ${targetClient.name}'s real numbers/story. NOT generic.>",
    "framework": "<vulnerability open / authority lead / problem-solution / etc.>",
    "why_it_works": "<1 sentence on why this idea will stop the scroll for the target audience>"
  },
  "script": {
    "title": "<short title — same as the hook_sentence or the core idea>",
    "hook": "<the opening 1-2 sentences>",
    "body": "<3-5 body lines, separated by \\n. Each line is one beat in the script.>",
    "cta": "<the call to action — should match the client's CTA goal>"
  }
}`;

                let synthesisRes: Response;
                let synthesisText = "";
                let synthesis: any = {};
                try {
                  synthesisRes = await fetch("https://api.anthropic.com/v1/messages", {
                    method: "POST",
                    headers: {
                      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
                      "anthropic-version": "2023-06-01",
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      model: "claude-sonnet-4-6",
                      max_tokens: 2048,
                      messages: [{ role: "user", content: synthesisPrompt }],
                    }),
                  });
                  if (!synthesisRes.ok) {
                    const errText = await synthesisRes.text();
                    console.error("[orchestrator] Anthropic API error:", synthesisRes.status, errText);
                    toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Anthropic API error: " + synthesisRes.status + " — " + errText.slice(0, 300) });
                    continue;
                  }
                  const synthesisJson = await synthesisRes.json();
                  synthesisText = synthesisJson.content?.[0]?.text || "";
                  if (!synthesisText) {
                    console.error("[orchestrator] Empty synthesis response:", JSON.stringify(synthesisJson).slice(0, 500));
                    toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Empty response from synthesis. " + JSON.stringify(synthesisJson).slice(0, 300) });
                    continue;
                  }
                  try {
                    synthesis = JSON.parse(synthesisText);
                  } catch {
                    const match = synthesisText.match(/\{[\s\S]*\}/);
                    if (match) synthesis = JSON.parse(match[0]);
                  }
                } catch (apiErr) {
                  console.error("[orchestrator] Synthesis fetch threw:", apiErr);
                  toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Synthesis call failed: " + String(apiErr).slice(0, 300) });
                  continue;
                }

                if (!synthesis.script || !synthesis.idea || !synthesis.research) {
                  console.error("[orchestrator] Incomplete synthesis:", synthesisText.slice(0, 500));
                  toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Failed to generate script synthesis. Raw: " + synthesisText.slice(0, 500) });
                } else {
                  // 5. Build all canvas nodes
                  const ts = Date.now();
                  const videoNode = {
                    id: `videoNode_pipeline_${ts}`,
                    type: "videoNode",
                    position: { x: 50, y: rowY },
                    data: {
                      url: chosenVideo.video_url,
                      videoTitle: (chosenVideo.caption || "").slice(0, 80),
                      videoLabel: (chosenVideo.caption || "").slice(0, 80),
                      channel_username: chosenVideo.channel_username || "",
                      caption: (chosenVideo.caption || "").slice(0, 200),
                    },
                  };
                  const r = synthesis.research;
                  const researchNode = {
                    id: `textNoteNode_research_${ts}`,
                    type: "textNoteNode",
                    position: { x: 370, y: rowY },
                    data: {
                      noteText: `HOOK TYPE: ${(r.hook_type || "").toUpperCase()}\n\nHook: "${r.hook_text || ""}"\n\nWhy it works: ${r.why_it_works || ""}\n\nHow to adapt: ${r.how_to_adapt || ""}`,
                      noteHtml: `<p><strong>HOOK TYPE: ${(r.hook_type || "").toUpperCase()}</strong></p><p>Hook: "${r.hook_text || ""}"</p><p>Why it works: ${r.why_it_works || ""}</p><p>How to adapt: ${r.how_to_adapt || ""}</p>`,
                    },
                  };
                  const idea = synthesis.idea;
                  const ideaNode = {
                    id: `textNoteNode_idea_${ts}`,
                    type: "textNoteNode",
                    position: { x: 680, y: rowY },
                    data: {
                      noteText: `WINNING IDEA — ${(idea.category || "").toUpperCase()}\n\n"${idea.hook_sentence || ""}"\n\nFramework: ${idea.framework || ""}\n\nWhy it works: ${idea.why_it_works || ""}`,
                      noteHtml: `<p><strong>WINNING IDEA — ${(idea.category || "").toUpperCase()}</strong></p><p>"${idea.hook_sentence || ""}"</p><p>Framework: ${idea.framework || ""}</p><p>Why it works: ${idea.why_it_works || ""}</p>`,
                    },
                  };
                  const sc = synthesis.script;
                  const scriptNode = {
                    id: `textNoteNode_script_${ts}`,
                    type: "textNoteNode",
                    position: { x: 980, y: rowY },
                    data: {
                      noteText: `SCRIPT — ${(idea.category || "").toUpperCase()}\nFramework: ${idea.framework || ""}\n\nHOOK:\n${sc.hook || ""}\n\nBODY:\n${sc.body || ""}\n\nCTA:\n${sc.cta || ""}`,
                      noteHtml: `<p><strong>SCRIPT — ${(idea.category || "").toUpperCase()}</strong></p><p>Framework: ${idea.framework || ""}</p><p><strong>HOOK:</strong></p><p>${(sc.hook || "").replace(/\n/g, "<br>")}</p><p><strong>BODY:</strong></p><p>${(sc.body || "").replace(/\n/g, "<br>")}</p><p><strong>CTA:</strong></p><p>${sc.cta || ""}</p>`,
                      width: 320,
                    },
                  };

                  const newNodes = [videoNode, researchNode, ideaNode, scriptNode];
                  await adminClient.from("canvas_states").update({ nodes: [...existingNodes, ...newNodes] }).eq("id", canvasState.id);

                  // 6. Save script to library
                  const rawContent = [sc.hook || "", sc.body || "", sc.cta || ""].join("\n");
                  const { data: scriptRow } = await adminClient
                    .from("scripts")
                    .insert({
                      client_id: targetClient.id,
                      title: sc.title || idea.hook_sentence || "Untitled",
                      idea_ganadora: idea.hook_sentence || sc.title || "",
                      raw_content: rawContent,
                      formato: "talking_head",
                      status: "complete",
                    })
                    .select("id")
                    .single();
                  if (scriptRow) {
                    const bodyLines = (sc.body || "").split("\n").filter(Boolean);
                    const lineRows = [
                      { script_id: scriptRow.id, line_number: 1, line_type: "hook", section: "hook", text: sc.hook || "" },
                      ...bodyLines.map((line: string, i: number) => ({
                        script_id: scriptRow.id, line_number: i + 2, line_type: "body", section: "body", text: line,
                      })),
                      { script_id: scriptRow.id, line_number: bodyLines.length + 2, line_type: "cta", section: "cta", text: sc.cta || "" },
                    ];
                    await adminClient.from("script_lines").insert(lineRows);
                  }

                  // 7. Navigate to canvas (client-specific path)
                  actions.push({ type: "navigate", path: `/clients/${targetClient.id}/scripts?view=canvas` });

                  const summary = `BUILT a complete script for ${targetClient.name}.

REFERENCE: @${chosenVideo.channel_username} (${(chosenVideo.views_count || 0).toLocaleString()} views) — ${r.hook_type} hook
WINNING IDEA: "${idea.hook_sentence}"
FRAMEWORK: ${idea.framework}

The canvas now has 4 nodes: video reference, research analysis, winning idea, and full script draft. The script has been saved to the scripts library.

Tell the user this in your respond_to_user — be specific about what you found and what the winning idea was.`;
                  toolResults.push({ type: "tool_result", tool_use_id: block.id, content: summary });
                }
              }
            }
          }
        }

        if (block.name === "fill_onboarding_fields") {
          const { fields, navigate_to_onboarding } = block.input;
          // Merge new fields into existing onboarding_data
          const merged = { ...(client.onboarding_data || {}), ...fields };
          await adminClient.from("clients").update({ onboarding_data: merged }).eq("id", client.id);
          actions.push({ type: "fill_onboarding", fields });
          if (navigate_to_onboarding) actions.push({ type: "navigate", path: "/onboarding" });
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: "Filled fields: " + Object.keys(fields).join(", "),
          });
        }
      }

      // Second Claude call to synthesize tool results into a recommendation.
      // Always run if there are real data lookups — even if reply was already set by
      // respond_to_user in Turn 1 (e.g. "Let me look everything up..."). Without this,
      // the lookup results are silently discarded and Mario never gives the recommendation.
      const hasDataLookups = toolResults.some((r) =>
        r.content !== "Message sent." && !String(r.content).startsWith("Navigating to")
      );
      if (!reply || hasDataLookups) {
        const secondRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-6",
            max_tokens: 1024,
            system: systemPrompt,
            tools: TOOLS,
            ...(autonomy_mode === "auto" ? { tool_choice: { type: "any" } } : {}),
            messages: [
              ...priorMessages,
              { role: "user", content: message },
              { role: "assistant", content: firstResult.content },
              { role: "user", content: toolResults },
            ],
          }),
        });
        const secondResult = await secondRes.json();
        // In auto mode Mario uses respond_to_user tool; in ask/plan it outputs plain text
        if (secondResult.stop_reason === "tool_use") {
          const respondBlock = secondResult.content?.find(
            (b: any) => b.type === "tool_use" && b.name === "respond_to_user"
          );
          const textBlock = secondResult.content?.find((b: any) => b.type === "text");
          const secondReply = respondBlock?.input?.message || textBlock?.text;
          if (secondReply) reply = secondReply;
          // Capture any navigation actions from the second turn
          const navBlock = secondResult.content?.find(
            (b: any) => b.type === "tool_use" && b.name === "navigate_to_page"
          );
          if (navBlock?.input?.path) actions.push({ type: "navigate", path: navBlock.input.path });
        } else {
          const textBlock = secondResult.content?.find((b: any) => b.type === "text");
          if (textBlock?.text) reply = textBlock.text;
        }
        // If Turn 2 only navigated (no text/respond_to_user), fall back to Turn 1 reply
        if (!reply) reply = turn1Reply || "On it.";
      }
    } else {
      // Normal text response
      const textBlock = firstResult.content?.find((b: any) => b.type === "text");
      reply = textBlock?.text || "I'm here — what do you need?";
    }

    // Save assistant reply
    await adminClient.from("companion_messages").insert({
      client_id: client.id,
      role: "assistant",
      content: reply,
    });

    return new Response(JSON.stringify({ reply, actions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
