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

    // Load long-term memory from companion_state
    const { data: companionState } = await adminClient
      .from("companion_state")
      .select("workflow_context")
      .eq("client_id", client.id)
      .maybeSingle();

    const savedMemories: Record<string, string> = companionState?.workflow_context || {};

    // Last 40 messages for context (expanded from 20)
    const { data: history } = await adminClient
      .from("companion_messages")
      .select("role, content")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false })
      .limit(40);

    const priorMessages = (history || []).reverse().map((m: any) => ({
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
    ].filter(Boolean).join("\n");

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
12. CRITICAL: When asked to create, build, write, or make a script — first call get_hooks to find the best hook structure, optionally call find_viral_videos for references, then call create_script with the FULL script (hook + all body lines + CTA). Never output the script as text in the chat. Build it and save it to the database, then navigate to it.
13. PLAIN ENGLISH ONLY: Never use marketing jargon with clients. Translate everything: "TOFU" = "content that gets new people to find you", "MOFU" = "content that builds trust with your audience", "BOFU" = "content that gets people to book or buy". Never say TOFU, MOFU, BOFU, "outlier method", "virality score", or any internal methodology terms.
14. TOOLS AVAILABLE: You have tools for everything — navigating pages, filling onboarding, creating scripts, finding viral videos, scheduling content, submitting to editing queue, checking calendars, creating canvas notes, looking up clients, and getting hook templates. Use them. Do not describe what you would do — do it.
15. NEVER respond with "Done.", "OK.", "Sure.", or any vague single-word/short answer. Every response must be useful, specific, and actionable. If you just completed an action, tell the user exactly what you did, what you found, and what the next step is.
18. SCRIPT PREVIEW BEFORE SAVING: Before calling create_script, ALWAYS show the full script as a preview in your respond_to_user message first. Format it clearly: show the hook, each body line, and the CTA. Then say "Should I save this?" Wait for confirmation before calling create_script. Exception: only skip preview in Auto mode if the user explicitly said "just do it" or "auto".
19. WHEN CONTEXT IS UNCLEAR: If someone says "build a script for me" without specifying which client or topic, use get_client_info on the currently selected client and their recent data to make a smart decision. Never just say "Done." — always explain what you're doing or what you need.
20. AFTER EVERY ACTION: Tell the user (a) what you just did, (b) what you found or created, (c) what the next step is. Always 3 parts. No exceptions.
16. When the user asks "what to do now", "what's next", "now what", or similar — ALWAYS call get_client_strategy AND get_client_info AND get_editing_queue AND get_content_calendar FIRST to understand the full picture. The strategy tells you their monthly goals and how far behind they are. Use that to give a specific, numbers-driven recommendation. Never guess. Look it up, then tell them exactly what to do. Example: "You need 20 scripts this month and you've done 2. Let's write 3 today. Your ManyChat isn't set up — that's next after scripts."
17. WORKFLOW GUIDE: The Connecta workflow for a client is always: (1) Onboarding complete → (2) Canvas loaded with research and brand info → (3) Viral video references found → (4) Script created → (5) Client films → (6) Footage submitted to editing queue → (7) Editor assigned → (8) Approved → (9) Scheduled to content calendar → (10) Posted. Always know where the client is in this workflow and tell them the next specific step.
13. CRITICAL: Never tell the user to go somewhere or navigate manually. If navigation is needed, call the navigate_to_page tool immediately — the app will take them there automatically. Do not say "head to X" or "go to X" or "visit X". Just call the tool.
12. CONTEXT RULE: If the user is currently on /onboarding, do NOT navigate them away. Stay on that page and keep filling fields using fill_onboarding_fields. "Take me to the next step" means fill the next empty fields on this page, not navigate elsewhere. Only navigate away from /onboarding after the form is fully complete and saved.
10. CRITICAL: If the user says "yes", "ok", "let's go", "sure", "do it" in response to something you suggested — execute it immediately using the appropriate tool. Do not ask again.
11. MEMORY: Whenever you learn something important about the client — their main story with specific numbers, their content pillars, their target audience, a great hook idea, a business result, a preference — call save_memory immediately. Don't wait to be asked. Think of this like taking notes on a client you'll work with for years. Save things that would be valuable to remember in 6 months.

AUTONOMY MODE: ${autonomy_mode || "ask"}
${autonomy_mode === "auto"
  ? `AUTO MODE — CRITICAL RULES:
- You MUST call a tool on every single response. Never output plain text without calling a tool first.
- Use respond_to_user for conversational replies, navigate_to_page to navigate, fill_onboarding_fields to fill forms, save_memory to remember things.
- NEVER say "let me do X" or "I will do X". Just DO it by calling the tool. Then use respond_to_user to tell them what you did.
- NEVER ask for permission or confirmation. The user selected Auto mode — they want you to act.
- If the user is already on a page you were about to navigate to, skip the navigation and do the next useful thing instead.
- Think: what is the single most useful action I can take RIGHT NOW? Take it.`
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
        max_tokens: 1024,
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

    // Process response — may have tool_use blocks
    if (firstResult.stop_reason === "tool_use") {
      const toolUseBlocks = firstResult.content.filter((b: any) => b.type === "tool_use");
      const textBlocks = firstResult.content.filter((b: any) => b.type === "text");
      if (textBlocks.length > 0) reply = textBlocks[0].text;

      const toolResults: any[] = [];

      for (const block of toolUseBlocks) {
        if (block.name === "respond_to_user") {
          // Pure text response wrapped as a tool call (used in auto mode)
          reply = block.input.message || "";
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

            const summary = [
              "Strategy for " + targetClient.name + ":",
              "Monthly targets: " + s.scripts_per_month + " scripts, " + s.videos_edited_per_month + " videos edited, " + s.posts_per_month + " posts scheduled",
              "This month so far: " + (scriptCount || 0) + " scripts, " + (videoCount || 0) + " videos done, " + (calCount || 0) + " posts scheduled",
              "Content mix: " + s.mix_reach + "% reach / " + s.mix_trust + "% trust / " + s.mix_convert + "% convert",
              "Stories per week: " + s.stories_per_week,
              "ManyChat: " + (s.manychat_active ? "active, keyword: " + (s.manychat_keyword || "not set") : "not set up"),
              "CTA goal: " + s.cta_goal,
              "Ads: " + (s.ads_active ? "running, budget $" + s.ads_budget + "/month" : "not running"),
              "Revenue goal: $" + s.monthly_revenue_goal + "/month, this month: $" + s.monthly_revenue_actual,
            ].join("\n");

            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: summary });
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

      // Second Claude call to get the text reply after tool use
      if (!reply) {
        const secondRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-6",
            max_tokens: 512,
            system: systemPrompt,
            tools: TOOLS,
            messages: [
              ...priorMessages,
              { role: "user", content: message },
              { role: "assistant", content: firstResult.content },
              { role: "user", content: toolResults },
            ],
          }),
        });
        const secondResult = await secondRes.json();
        const textBlock = secondResult.content?.find((b: any) => b.type === "text");
        reply = textBlock?.text || "Done.";
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
