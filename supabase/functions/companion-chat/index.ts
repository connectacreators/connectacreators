import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { VIRAL_HOOKS } from "./hookData.ts";
import { toolToScene } from "../_shared/tool-to-scene.ts";
import {
  createThread as assistantCreateThread,
  appendMessage as assistantAppendMessage,
} from "../_shared/assistant/threads.ts";
import {
  handleBuildTurn,
  shouldRouteToBuildMode,
} from "./build-mode.ts";
import { readCanvasContext } from "./canvasReader.ts";
import { LEAD_TOOLS, handleLeadTool } from "./tools/leads.ts";
import { FINANCE_TOOLS, handleFinanceTool } from "./tools/finances.ts";
import { SCRIPT_TOOLS, handleScriptTool } from "./tools/scripts.ts";
import { EDITING_TOOLS, handleEditingTool } from "./tools/editing.ts";
import { INTELLIGENCE_TOOLS, handleIntelligenceTool } from "./tools/intelligence.ts";
import { CLIENT_TOOLS, handleClientTool } from "./tools/client.ts";
import { RESEARCH_TOOLS, handleResearchTool } from "./tools/research.ts";
import { ANALYTICS_TOOLS, handleAnalyticsTool } from "./tools/analytics.ts";
import { PLAN_TOOLS, handlePlanTool } from "./tools/plans.ts";
import { classifyMode } from "./mode-router.ts";
// Memory subsystem disabled for now — tools/memories.ts and the
// assistant_memories table remain in place for future reactivation.
// import { MEMORY_TOOLS, handleMemoryTool, loadMemoriesForPrompt } from "./tools/memories.ts";
import { resolveClient, getAccessibleClientIds } from "./tools/types.ts";
import {
  runAnalyzeMyProfile,
  PROFILE_ANALYSIS_COST,
  PROFILE_ANALYSIS_COST_PER_COMPETITOR,
} from "./tools/profile-analysis.ts";
import { deductCredits } from "../_shared/credits.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TOOLS = [
  {
    name: "navigate_to_page",
    description: "Navigate the user to a specific page in the app. Only call this when the user EXPLICITLY asks to GO TO or OPEN a page. NEVER call this when the user wants you to SEARCH, FIND, or LOOK UP something — for that use the appropriate data tool: find_viral_videos for the Viral Today database, get_leads for leads, get_finances for transactions, etc. When the user asks to open a CLIENT-SPECIFIC page (\"open Dr Calvin's leads\", \"take me to Acme's editing queue\"), call list_all_clients or get_client_info FIRST to resolve the client_id, then build the path with that id (e.g. /clients/<id>/leads). The drawer auto-opens on the destination so the chat continues there.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Any valid app route. Static (agency-wide) routes: /dashboard, /scripts, /vault, /viral-today, /editing-queue, /content-calendar, /subscription, /ai, /onboarding, /finances, /leads, /contracts, /clients, /lead-calendar, /master-database, /trainings, /subscribers, /settings. Client-specific dynamic routes (use this when the user names a client): /clients/<id>, /clients/<id>/scripts, /clients/<id>/scripts?view=canvas, /clients/<id>/leads, /clients/<id>/lead-calendar, /clients/<id>/booking-settings, /clients/<id>/vault, /clients/<id>/editing-queue, /clients/<id>/content-calendar, /clients/<id>/contracts, /clients/<id>/database, /clients/<id>/landing-page, /clients/<id>/followup-automation. Use open_client tool when navigating to a client's MAIN page; use navigate_to_page with /clients/<id>/<section> for any specific section.",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "open_client",
    description: "Navigate to a specific client's detail page. Use when you've just created a client, looked one up, or the user says 'go to [client name]'. Resolves the name to a UUID so the frontend can build the correct route.",
    input_schema: {
      type: "object",
      properties: {
        client_name: {
          type: "string",
          description: "The client's name to look up and navigate to",
        },
      },
      required: ["client_name"],
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
  // (save_memory / delete_memory / list_memories / pin_memory / unpin_memory
  //  now live in tools/memories.ts as the first-class memory subsystem.)
  {
    name: "find_viral_videos",
    description: "Search the Viral Today database for viral video references. THIS IS the Viral Today page — the user does NOT need to navigate there to search; this tool queries the same data. Every viral_videos row carries a categorized primary_niche (the audience the creator targets) and content_format (the structural pattern of the video) — ALWAYS use these filters when you can infer them, because narrow filters return more relevant references than a topic-only search. Default the niche to the active client's primary_niche (surfaced in the BRAND CONTEXT block). Infer content_format from the user's wording: if they say \"storytelling\" / \"tell a story\" → storytelling; \"funny\" / \"humor\" → funny; \"teach\" / \"explain\" / \"how X works\" → educational; \"how-to\" / \"step by step\" → tutorial; \"X vs Y\" / \"compare\" → comparison; \"top 5\" / \"list\" / \"reasons\" → listicle; \"react to\" / \"hot take\" → reaction; \"my expert opinion\" / \"as a doctor\" → authority; \"day in the life\" / \"behind the scenes\" → vlog; \"closing\" / \"selling\" / \"pitch\" → selling; \"caption-only post\" → caption_post. Returns videos with caption, transcript snippet, hook_text, cta_text, framework_meta, content_format, primary_niche. Sorted by outlier_score desc. Use anytime the user asks to 'find references', 'search Viral Today', 'look for viral [topic]', or as the data source for generate_ideas_from_viral.",
    input_schema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Optional keyword(s) — matched against caption AND transcript. Omit if filtering purely by niche/format." },
        niche: { type: "string", description: "Optional primary_niche slug — the AUDIENCE/INDUSTRY a creator targets. Canonical: personal_branding (doctors, lawyers, dentists, med spas, attorneys), fitness (PT, nutritionists, chiropractors, gyms), sales, real_estate, finance (CPAs, advisors, insurance), ecommerce (Shopify, DTC), coaching (life/business/career coaches), saas_tech (developers, founders), beauty (estheticians, salons), food (chefs, restaurants), mindset, relationships, education, lifestyle, parenting. Default to the active client's primary_niche (in BRAND CONTEXT). Other slugs allowed." },
        content_format: { type: "string", description: "Optional format slug — the STRUCTURAL PATTERN of the video. One of: caption_post (static + caption overlay), storytelling (tension→resolution narrative), educational (teaches a concept), comparison (A vs B), authority (speaks with credentials), reaction (responds to another video/event), listicle (numbered list, e.g. '3 reasons'), tutorial (how-to step-by-step), vlog (day-in-the-life), selling (explicit offer/pitch), funny (comedic). Infer from the user's wording — see tool description." },
        platform: { type: "string", description: "Optional: instagram, tiktok, youtube" },
        min_outlier: { type: "number", description: "Minimum outlier score (default 3). Lower for niche searches with thin inventory." },
        days_back: { type: "number", description: "Optional recency window in days. Omit for all-time." },
        limit: { type: "number", description: "Number of results (default 8, max 25)." },
      },
      required: [],
    },
  },
  {
    name: "analyze_my_profile",
    description: "Pull the top 10 IG posts and render a deep ProfileAnalysisEmbed card: audience fit, uniqueness, hook patterns, format mix, posting cadence, outlier band, top-3 posts with thumbnails. CALL THIS whenever the user asks to analyze a profile, audit an account, or get IG strategy recommendations — even if you already have analysis numbers from a previous turn (the card is what the user wants to see, and only this tool emits it). Pass the @handle from the user's message as `handle`. The tool itself handles the case where onboarding has no handle yet (it just uses the one you passed). The tool also handles handle-mismatch detection — its tool_result_text will start with 'handle_mismatch:' in that case, and only THEN should you ask the user the 3-option clarification. If include_competitors=true, also pulls the emulation_profiles from onboarding and adds a comparison section. ONLY set include_competitors=true after the user has approved a propose_plan card.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "Optional. Defaults to the locked client for this thread." },
        handle: { type: "string", description: "Optional. IG @handle to analyze. Defaults to onboarding_data.instagram." },
        platform: { type: "string", enum: ["instagram"], description: "v1 = instagram only" },
        include_competitors: { type: "boolean", description: "When true, also pulls the client's emulation_profiles and produces a `comparison` section. Default false. ONLY set true after the user has approved a propose_plan card for the comparison." },
        force_refresh: { type: "boolean", description: "When true, skip caches and re-scrape from VPS. Set ONLY when the user explicitly asks to refresh, redo, scrape again, or use the latest data. Default false." },
        analyze_as_competitor: { type: "boolean", description: "Set true when the @handle being analyzed is NOT the user's/client's own profile (e.g. user said 'analyze my competitor @X' or chose option (c) from the handle-mismatch question). Skips the mismatch check, scrapes the provided handle as a standalone competitor analysis, and does NOT overwrite the client's audience_analysis. Default false." },
      },
      required: ["platform"],
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
    description: "Submit a script or content to the editing queue so an editor can work on it. Use when footage is uploaded or a script is ready for production. If you don't know who to assign, call get_weekly_priorities or get_all_clients_status first to see who's lightest on workload.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "The client's name" },
        title: { type: "string", description: "The content title or script name" },
        notes: { type: "string", description: "Optional instructions for the editor" },
        schedule_date: { type: "string", description: "Optional target post date (YYYY-MM-DD)" },
        editor_name: { type: "string", description: "Optional: assign to a specific editor by name" },
        deadline: { type: "string", description: "Optional YYYY-MM-DD deadline for the edit" },
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
    name: "read_canvas",
    description: "Read everything on a client's active Super Canvas — text notes, research notes, and voice/PDF transcriptions. Call this before making content decisions to see what research and ideas already exist, or when the user asks 'what\\'s on the canvas?'.",
    input_schema: {
      type: "object",
      properties: {
        client_name: {
          type: "string",
          description: "The client's name",
        },
      },
      required: ["client_name"],
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
    description: "Update a client's content strategy — tactical targets (posts/scripts/videos per month, content mix %), platform settings, persona (content pillars, primary platform), ManyChat, ads, and revenue goals. Call this whenever the user wants to set or change any strategy field. Pass only the fields being changed.",
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
        primary_platform: { type: "string", description: "Primary distribution platform: instagram | tiktok | youtube | linkedin" },
        content_pillars: { type: "array", items: { type: "string" }, description: "3-5 content pillars describing what the client posts about. e.g. ['client transformation stories', 'tactical how-tos', 'behind-the-scenes']" },
        manychat_active: { type: "boolean", description: "Whether ManyChat is active" },
        manychat_keyword: { type: "string", description: "ManyChat trigger keyword" },
        cta_goal: { type: "string", description: "Primary CTA goal — what action the audience should take" },
        ads_active: { type: "boolean", description: "Whether ads are running" },
        ads_budget: { type: "number", description: "Monthly ads budget in USD" },
        ads_goal: { type: "string", description: "Ads goal — what the spend is meant to drive (leads, awareness, sales, etc.)" },
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
  // ── Follow-up workflow editing (Phase 4) ──────────────────────────────
  {
    name: "get_followup_workflow",
    description: "Read the AI follow-up automation workflow for a client (nodes + edges). Returns a compact summary of the existing steps so you can answer 'what's my current sequence?' or decide where to insert a new step.",
    input_schema: {
      type: "object",
      properties: { client_name: { type: "string", description: "Optional. Defaults to locked client." } },
      required: [],
    },
  },
  {
    name: "add_followup_step",
    description: "Append a step (actionNode) to the END of the client's follow-up automation workflow. Wire up an edge from the current tail node to the new one. Use when the user says 'add a wait 2 days then send an email' / 'tack on another reminder SMS'. For multi-step adds, call this tool multiple times in sequence. Available action_type values: send_email, send_sms, wait, update_lead_status, send_confirmation_email, send_confirmation_sms, send_reminder_email, send_reminder_sms. For 'wait', also pass wait_unit (minutes|hours|days) and wait_amount (number). For 'update_lead_status', pass new_status.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "Optional. Defaults to locked client." },
        action_type: { type: "string", enum: ["send_email", "send_sms", "wait", "update_lead_status", "send_confirmation_email", "send_confirmation_sms", "send_reminder_email", "send_reminder_sms"] },
        label: { type: "string", description: "Short human-readable label, e.g. 'Wait 2 days' / 'Reminder SMS'." },
        use_ai: { type: "boolean", description: "For send_email/send_sms: true if the message body should be AI-generated. Default true." },
        wait_unit: { type: "string", enum: ["minutes", "hours", "days"], description: "Required when action_type is 'wait'." },
        wait_amount: { type: "number", description: "Required when action_type is 'wait'." },
        new_status: { type: "string", description: "Required when action_type is 'update_lead_status'. e.g. 'contacted', 'qualified', 'closed_won', 'closed_lost'." },
      },
      required: ["action_type", "label"],
    },
  },
  // ── Status reads (Phase 4) ────────────────────────────────────────────
  {
    name: "get_social_account_status",
    description: "Check which social platforms (Instagram, TikTok, Facebook, YouTube) are connected for a client and whether any need re-auth. Robby cannot complete OAuth himself — use this to detect disconnected state, then propose open_social_accounts_page to direct the user to the connect button.",
    input_schema: {
      type: "object",
      properties: { client_name: { type: "string", description: "Optional. Defaults to locked client." } },
      required: [],
    },
  },
  {
    name: "get_subscription_info",
    description: "Get the user's current subscription plan, status, and trial info. Use when the user asks 'what plan am I on?' / 'do I have access to X?' / 'when does my trial end?'.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "list_trainings",
    description: "List trainings / SOPs available, filterable by assigned user or category. Use when the user asks 'show me the trainings' or 'what SOPs do we have for editors?'.",
    input_schema: {
      type: "object",
      properties: {
        assigned_to_me: { type: "boolean", description: "When true, return only trainings assigned to the current user." },
        category: { type: "string", description: "Optional category filter." },
      },
      required: [],
    },
  },
  {
    name: "list_contracts",
    description: "List contracts for a client with status (draft, sent, signed, voided). Read-only — drafting new contracts from chat requires file generation outside this surface; for that, open_contracts_page so the user can use the contract builder.",
    input_schema: {
      type: "object",
      properties: { client_name: { type: "string", description: "Optional. Defaults to locked client." } },
      required: [],
    },
  },
  // ── Lead messaging (Phase 2) ──────────────────────────────────────────
  {
    name: "send_lead_followup_now",
    description: "Trigger the AI-generated follow-up message for a specific lead RIGHT NOW (skip the cron). Invokes the send-followup edge function which composes an on-brand email using the client's SMTP settings + the lead's notes. Use when the user says 'send the follow-up to X now', 'message that lead', or after confirming a propose_plan card for outreach. NEVER call without explicit user intent — this sends a real email.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "Optional. Defaults to locked client." },
        lead_id: { type: "string", description: "UUID of the lead in the leads table (from get_leads)." },
      },
      required: ["lead_id"],
    },
  },
  // ── Smart navigation (Phase 2/3) ──────────────────────────────────────
  // These wrap navigate_to_page with auto-resolved client_id, so the
  // model can say "open the followup builder for Boby" without first
  // having to look up Boby's id.
  {
    name: "open_followup_builder",
    description: "Open the AI follow-up automation builder for a client. Use when the user wants to set up, view, or edit their automated lead follow-up workflow.",
    input_schema: {
      type: "object",
      properties: { client_name: { type: "string", description: "Optional. Defaults to locked client." } },
      required: [],
    },
  },
  {
    name: "open_social_accounts_page",
    description: "Open the social accounts page for a client. Use when the user wants to connect IG/TikTok/FB/YouTube or check connection status. OAuth handshake happens in the browser — Robby cannot complete it directly, but this gets the user one click from the action.",
    input_schema: {
      type: "object",
      properties: { client_name: { type: "string", description: "Optional. Defaults to locked client." } },
      required: [],
    },
  },
  {
    name: "open_video_editor",
    description: "Open the in-app video editor for a specific editing-queue item. Use when the user says 'edit that video' / 'open it in the editor' / 'caption this'. The editing_queue_item_id comes from get_editing_queue or open_editing_item.",
    input_schema: {
      type: "object",
      properties: { editing_queue_item_id: { type: "string", description: "UUID of the editing_queue row to open." } },
      required: ["editing_queue_item_id"],
    },
  },
  {
    name: "open_booking_settings",
    description: "Open the booking settings page for a client (where they configure their public booking calendar slots).",
    input_schema: {
      type: "object",
      properties: { client_name: { type: "string", description: "Optional. Defaults to locked client." } },
      required: [],
    },
  },
  {
    name: "open_master_editing_queue",
    description: "Open the master editing queue (admin view across all clients and editors). Use when the user wants to see workload across editors, reassign across editors, or audit throughput.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  // ── Vault (Phase 2) ───────────────────────────────────────────────────
  {
    name: "save_video_to_vault",
    description: "Bookmark a viral_videos row into a client's vault (saved_videos). Use when the user says 'save that to my vault', 'add to vault', 'bookmark this'. Pass viral_video_id from find_viral_videos / find_viral_videos embed payload. Optional `note` field for why they're saving it.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "Optional. Defaults to locked client." },
        viral_video_id: { type: "string", description: "UUID of the viral_videos row (from find_viral_videos / embed)." },
        note: { type: "string", description: "Optional note explaining why they're saving it." },
      },
      required: ["viral_video_id"],
    },
  },
  {
    name: "unsave_video_from_vault",
    description: "Remove a video from a client's vault. Idempotent — no error if the row doesn't exist.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "Optional. Defaults to locked client." },
        viral_video_id: { type: "string", description: "UUID of the viral_videos row to unbookmark." },
      },
      required: ["viral_video_id"],
    },
  },
  {
    name: "list_saved_videos",
    description: "List videos bookmarked to a client's vault. Returns recent saves first. Use when the user asks 'what's in my vault' / 'show my saved videos'.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "Optional. Defaults to locked client." },
        limit: { type: "number", description: "Max results. Default 20." },
      },
      required: [],
    },
  },
  // ── Canvas write surface (Phase 1) ────────────────────────────────────
  {
    name: "add_canvas_node",
    description: "Add a node to the client's active Super Canvas. Use this for any node type not covered by the specific add_* tools above. Supported node_type values and their `data` fields (extra fields are ignored, missing fields default sensibly):\n- brand_guide: tone (Casual|Formal|Funny|Bold), brand_values, forbidden_words, tagline\n- cta_builder: topic, ctas (array of strings), selectedCTA\n- hook_generator: topic, hooks (array of {category, text}), selectedHook, selectedCategory\n- competitor_profile: profileUrl, username (analyzes a competitor IG/TikTok account)\n- competitor_folder: username, posts, platform\n- instagram_profile: profileUrl, username (the client's own profile, for hook mining)\n- annotation: text, color (hex), fontSize, bold, italic, align (left|center|right), bgColor\n- group: label (organizes other nodes into a labelled group)\nPosition is auto-computed unless explicitly provided. Use the add_video_to_canvas / add_research_note_to_canvas / add_idea_nodes_to_canvas / add_script_draft_to_canvas tools above for those specific node types — they have tuned positioning and side effects.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "The client's name. Defaults to the locked client if omitted." },
        node_type: { type: "string", enum: ["brand_guide", "cta_builder", "hook_generator", "competitor_profile", "competitor_folder", "instagram_profile", "annotation", "group"] },
        data: { type: "object", description: "Node-specific payload — see the description for required fields per type.", additionalProperties: true },
        position: { type: "object", description: "Optional {x, y} position. Auto-positioned to the right of the latest column if omitted.", properties: { x: { type: "number" }, y: { type: "number" } } },
      },
      required: ["node_type", "data"],
    },
  },
  {
    name: "delete_canvas_node",
    description: "Remove a node from the client's active Super Canvas by node id. Use after read_canvas to identify the right id. Confirm with the user before deleting non-trivial work (script drafts, populated competitor folders, brand guides).",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "Optional. Defaults to locked client." },
        node_id: { type: "string", description: "The id of the node to delete (from read_canvas)." },
      },
      required: ["node_id"],
    },
  },
  {
    name: "move_canvas_node",
    description: "Reposition a node on the canvas. Useful for organizing the layout when the user asks to move things around.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "Optional. Defaults to locked client." },
        node_id: { type: "string" },
        x: { type: "number" },
        y: { type: "number" },
      },
      required: ["node_id", "x", "y"],
    },
  },
  {
    name: "switch_active_canvas",
    description: "Switch which canvas is active for a client. Use when the user has multiple saved canvases (e.g. a 'brainstorm' canvas and an 'execution' canvas) and asks to switch between them. Call read_canvas first if you need to list available canvases.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "Optional. Defaults to locked client." },
        canvas_id: { type: "string", description: "The target canvas_states.id to activate." },
      },
      required: ["canvas_id"],
    },
  },
  // Wave 2 tools
  ...LEAD_TOOLS,
  ...FINANCE_TOOLS,
  ...SCRIPT_TOOLS,
  ...EDITING_TOOLS,
  // Wave 3 tools
  ...INTELLIGENCE_TOOLS,
  ...CLIENT_TOOLS,
  // Wave 4 tools
  ...RESEARCH_TOOLS,
  // Wave 5 tools (analytics / cross-cutting reads)
  ...ANALYTICS_TOOLS,
  // Wave 6 tools (preview-and-approve plan flow)
  ...PLAN_TOOLS,
  // Memory subsystem disabled for now — see import comment above.
  // ...MEMORY_TOOLS,
];

// ── Static system prologue (cached) ──────────────────────────────────────
// Methodology + rules + tool guidance. Stable across every request, which
// lets Anthropic's prompt cache actually hit. ~10KB. The companion name is
// hardcoded to "Robby" — if a tenant ever uses a different companion_name
// it falls through to slightly stale-feeling intro text but the cache wins
// outweigh that edge case.
const STATIC_SYSTEM_PROLOGUE = `You are Robby, the AI assistant inside Connecta Creators — a done-for-you social media and personal branding platform for service professionals and local business owners.

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

YOUR RULES — FOLLOW EXACTLY:

0. REFINEMENT BIAS — READ THIS FIRST. If the user's latest message is a short instruction that looks like an edit to YOUR PREVIOUS REPLY ("shorter", "rephrase", "in Spanish", "less formal", "redo it", "try again", "no — different", "simpler", "tone it down", "more direct", "no, more casual"), they are NOT asking for a new action — they want you to rewrite what you just said. REWRITE the previous reply with the requested change. Do NOT greet. Do NOT call any tool. Do NOT propose new actions or suggest example prompts ("or say give me 5 ideas…"). Do NOT include emojis. Just give the revised text and stop. If you genuinely have no previous reply to refine, say so briefly and ask what they meant to edit.

1. NEVER use markdown. No asterisks, no bold, no headers, no bullet dashes. Plain text only.
2. NEVER use emojis. Not even 👋 or 🎉 in a "friendly" reply. Zero emojis. Ever.
3. Speak plain English (or Spanish if they write in Spanish).
4. ACTION VS CONVERSATION: Use tools when the user asks for a CONCRETE system action (look up data, find content, schedule, send, change status, navigate, create, analyze). When the user is refining your reply, asking a conversational question, or just chatting — answer with text and don't tool-call your way out of a normal conversation. The default mode is human chat; tools are for system actions.
5. When someone says "fill out the onboarding", "complete my profile", or similar — call fill_onboarding_fields immediately with whatever you know, then navigate them there to review.
6. Keep text replies short: 2-4 sentences. Never long paragraphs.
7. You are a coach who takes action, not a chatbot that asks questions.
8. Never say "pipeline", "leverage", "synergy", "streamline", "utilize", or "robust".
9. CRITICAL: Never ask the user for information you can look up yourself. If someone mentions a client by name, call get_client_info immediately to get their data. Never say "tell me about X" when you can look X up.
10. CRITICAL: If the user says "yes", "ok", "let's go", "sure", "do it" in response to something you suggested — execute it immediately using the appropriate tool. Do not ask again.
11. MEMORY: Long-term memory is currently disabled. If the user says "remember X" or "forget X", explain briefly that you don't have persistent memory right now — they should rely on the active conversation thread (which IS preserved per chat). Do not call any save_memory / delete_memory / list_memories tools (they're not registered). Within a single conversation, you have full thread history; across conversations, you have client_strategies + onboarding_data injected at the top of every prompt.
12. NEVER navigate manually. If navigation is needed, call navigate_to_page — the app takes them there. Never say "head to X", "go to X", "visit X".
13. ONBOARDING CONTEXT: If the user is on /onboarding, do NOT navigate away. Keep filling fields using fill_onboarding_fields until the form is fully complete.
14. PLAIN ENGLISH ONLY: Never use TOFU, MOFU, BOFU, "outlier method", or internal jargon. Translate: reach content = "content that gets new people to find you", trust = "builds authority with your audience", convert = "turns warm viewers into booked leads".
15. NEVER respond with "Done.", "OK.", "Sure." Every response must tell the user (a) what you did, (b) what you found, (c) what the next step is.
16. WHAT'S NEXT: When asked "what to do", "what's next", "now what" — read the CLIENT STRATEGY section already in your context. You already know the goals and gaps. Give a specific numbers-driven recommendation immediately. No need to call get_client_strategy first — it's already loaded above.
17. WORKFLOW GUIDE: (1) Onboarding complete → (2) Instagram handle added → (3) Viral references researched → (4) Winning idea identified → (5) Script created → (6) Client films → (7) Footage submitted to editing queue → (8) Editor assigned → (9) Approved → (10) Scheduled → (11) Posted. Always know where the client is and name the next step.
18. SCRIPT CREATION: Explicit "build me a script" requests are routed to a separate dedicated build flow before reaching you. If a user picks a content idea or asks you to write a script directly here, follow the framework-first workflow: (a) call find_viral_videos with keywords from their idea to surface a viral reference, (b) tell the user which reference you'll model the script after and ask them to confirm or pick another, (c) ONLY THEN call create_script and use the reference's hook/body/CTA structure. Never call create_script as your first move on an idea — viewers want content shaped by proven viral patterns, not bare-knowledge writing.

18-NICHE/FORMAT AWARENESS: Every viral_videos row is tagged with a primary_niche (audience/industry the creator targets — see the BRAND CONTEXT block for the active client's slug) and a content_format (structural pattern: storytelling, educational, comparison, listicle, tutorial, vlog, reaction, authority, selling, funny, caption_post). When you call find_viral_videos:
- PREFER passing the niche param — if the user names the active client (per BRAND CONTEXT) use that primary_niche slug. If the user names a DIFFERENT client (e.g. "viral hooks for Boby" when Calvin is active), either (a) call list_all_clients first to resolve Boby's industry → niche, OR (b) just call find_viral_videos WITHOUT a niche filter as a fallback. Returning a topic-only result is always better than freezing.
- INFER the content_format param from the user's wording and pass it when possible. Examples: "tell a story" / "share an experience" → storytelling · "explain how X works" / "teach" → educational · "how-to" / "step by step" → tutorial · "X vs Y" / "comparing two things" → comparison · "top 3" / "5 reasons" → listicle · "react to" / "hot take on" → reaction · "as a doctor I" / "expert perspective" → authority · "day in my life" / "behind the scenes" → vlog · "pitch" / "selling" / "close" → selling · "funny" / "comedy" / "skit" → funny · "text overlay only" → caption_post.
- Niche+format filtering produces 10x more relevant references than topic-only searches. Always combine the two when both can be inferred. When the user asks something open-ended ("give me hook ideas"), pull the client's primary_niche + a high-engagement format like storytelling or educational.
- NEVER return an empty reply on a viral/hook/idea/reference ask. If unsure about params, call find_viral_videos with whatever you have and summarize what came back. Silence is the worst outcome.
18b. CLIENT IDENTITY: Always use the exact client name from the conversation when calling tools that take client_name. If the user is on /clients/<id>/ the active client is locked from the URL — never name-match a different client. If you're unsure, call list_all_clients first.
18c. PREVIEW BIG ACTIONS: Before executing (a) 3+ writes in one turn (e.g. bulk_schedule_posts of 5 posts) OR (b) ANY destructive action (delete_script, update_lead_status to lost/closed, send_contract, mark_post_published, permanent_delete_editing_item (ALWAYS requires plan, even in Auto mode), large strategy changes), call propose_plan first with a structured list of steps. Then ASK the user "approve to proceed?" in your reply. ONLY when the user says yes/approve/go-ahead, call confirm_plan(plan_id) and execute the steps. If the user says no, call reject_plan(plan_id). Do NOT propose for single-step non-destructive writes — those should just execute. The autonomy mode field overrides this: in "auto" mode skip the proposal and execute; in "ask" or "plan" modes follow this rule strictly.

18d-LIFECYCLE. EDITING-QUEUE HAS ONE STATUS FIELD: lifecycle_status. Values: Not started | In progress | Needs Revisions | Scheduled | Published. This is THE state field. When the user says "scheduled" / "published" / "in progress" / "needs revisions" / "not started" → that is a lifecycle_status value. Use set_lifecycle_status (one item) or bulk_set_lifecycle_status (multiple). NEVER refuse a state change on the grounds that an item is "already X" unless its lifecycle_status literally equals the requested value — and even then, just say so and stop, don't fight the user. The old separate status/post_status fields no longer exist as a user-facing concept; ignore them when reasoning.

18d. EDITING-QUEUE BULK FLOW (mandatory): When the user asks to mutate 2+ editing-queue items in one request (e.g. "change all X to scheduled", "mark all reels as needs revisions", "delete videos 4, 5, 6"), the correct sequence is ALWAYS:
  1. (if you don't already know the items) call get_editing_queue to resolve the list
  2. call propose_plan with steps + target_item_titles set to those item titles (this triggers the navigate-to-page + row-pulse + Approve card the user expects to see)
  3. STOP and wait for the user to approve via the Approve button
  4. when confirm_plan returns success, call bulk_set_lifecycle_status (or bulk_assign_editor / bulk_delete_editing_items / bulk_reschedule_posts as appropriate)
  5. summarize results in one short sentence

Do NOT call bulk_* tools directly without going through propose_plan first for editing-queue requests. The bulk tools' built-in highlight_items emit is a safety net for direct calls in Auto mode — not a substitute for the preview-before-execute flow that ask/plan modes demand.

18c-STRICT — HOW THE PLAN MUST RENDER: The user's UI renders propose_plan output as a custom card (hand-drawn gold outline, numbered steps, Approve/Cancel links). The card is self-sufficient — it contains the summary, every step, and the approve/cancel controls. Mandatory:
- BANNED PHRASES (typing any of these without calling propose_plan in the same turn is a UX failure): "Here's the plan", "Here's my plan", "Here's the plan before I execute", "Plan:", "I'll set ...", "set post status to ... for all N ...", "I'll mark all ...", any preview-style enumeration of "step 1 / step 2 / first I will / then I will / I'll start by".
- TRIGGER PATTERNS (any user message matching these REQUIRES propose_plan, even if you already retrieved the affected list in an earlier turn): "change all X to Y", "mark all X as Y", "set all X to Y", "delete all X", "move all X", "schedule all X", "reschedule all X", "every X needs Y". The rule fires on the affected count, not the verbosity.
- After propose_plan returns, your text reply must be EMPTY. Do NOT say "Approve to proceed?" or "Want me to run this?" — the card's Approve button is the call to action. Return zero text content alongside the propose_plan tool call.
- Pass target_item_titles to propose_plan whenever the plan touches editing-queue rows. The UI uses it to highlight the affected rows with a pulse animation. Example: target_item_titles: ["VIDEO #4", "VIDEO #5", "(03) So, you're thinking..."].
- The ONLY text exception: a clarifying question that isn't covered by the plan (e.g. "do you want this for all clients or just X?"). Plain plan presentations get zero text.
- This rule applies in ask/plan autonomy modes. In auto mode, skip the card and just execute (the bulk tools themselves emit highlight_items, so the user still sees the pulse).
- CRITICAL: ALWAYS pass client_name when you know the client (URL-locked OR named in the user's message — "for Dr Calvin", "boby's videos"). The highlight pulse depends on resolving items to the right client; if you omit client_name the highlight still fires via a global lookup, but per-client lookups are more reliable.
    NEVER return empty text without the tool call here. NEVER say "let me try again" — if titles look ambiguous, propose the plan with your best-fit titles and let highlight_items show the user what you matched. If you genuinely cannot resolve any of the titles, ask ONE specific clarifying question naming what's ambiguous — never the generic rephrase.
19. USE TOOLS: every tool you have is documented in your tool descriptions — read them and call the right one. Don't describe what you'd do or paraphrase — do it. If the user asks something that maps to a tool (read or write), call the tool first, then summarize the result conversationally.

20. IDEA GENERATION CONTEXT FLOW: when the user asks for MULTIPLE content ideas ("give me 15 ideas", "10 reels for X", "ideate", "brainstorm content"), follow this sequence — never just call find_viral_videos and improvise.

   STEP A — RESOLVE TARGET CLIENT (silently, in your reasoning):
   - URL-locked (active client section above is set)? → use that client. Do NOT name-match.
   - Agency view + user named a client? → use that name as client_name; the resolver fuzzy-matches.
   - Agency view + no client named? → ask once: "for which client?" Don't call list_all_clients unless they say "what are my options".

   STEP B — READ WHAT'S ALREADY IN YOUR CONTEXT:
   - The "Onboarding data" block above has industry, story, audience, offer, values for the locked client.
   - The "CLIENT STRATEGY" block has mix_reach/mix_trust/mix_convert, audience_score, cta_goal.
   - You do NOT need to call get_client_info or get_client_strategy for the locked client — it's already injected. Only fetch when targeting a DIFFERENT client (agency view).

   STEP C — CONTEXT QUALITY CHECK:
   - If onboarding for the target client is missing industry OR story OR target audience, OR audience_score is below 5, STOP. Tell the user in one sentence what's thin and ask whether to (a) generate anyway with weaker grounding, or (b) fix onboarding first. Wait for their answer.

   STEP D — PARSE OVERRIDES FROM THE USER'S MESSAGE:
   - count: the number they asked for (default 10 if vague).
   - niche: did they name a niche different from the client's industry? ("15 ideas in the sales niche", "give me fitness ideas for Calvin") → pass as niche override.
   - formats: did they name a format? ("15 funny reels", "10 educational ideas") → pass as formats override.
   - topic_hint: did they name a topic? ("about lead magnets", "around morning routines") → pass as topic_hint.
   - mix_override: did they specify a mix? ("all sales-focused", "more trust content") → adjust mix_override.

   STEP E — CALL generate_ideas_from_viral WITH EXPLICIT PARAMS:
   Do NOT collapse this into a one-shot find_viral_videos + improvisation. The dedicated tool pulls bucketed references (reach/trust/convert), grounds in transcripts and framework_meta, and respects the user's overrides explicitly.

   STEP F — PRESENT:
   - Read back the tool's output. Don't re-list every idea — surface the bucket distribution and ask which one to script first. The tool already returns a numbered list; let the UI show it.
   - If the tool said references were thin, say so honestly: "the database is light on <niche> right now — these are partially generated from your profile. Want me to scrape a reference channel?"

19b. NEVER PROMISE WITHOUT EXECUTING: phrases like "Let me…", "I'll get the…", "I'll pull up…", "Now I'll…", "Let me check…", "First I'll…" MUST be followed by an actual tool call in the SAME response. If you write a "Let me X" sentence and then return text with no tool call, the user gets a dead-end reply and nothing happens. BANNED patterns when you have not yet called a tool this turn:
- "Let me get the list of …"
- "I'll start by pulling up …"
- "Now I'll schedule them out …"
- "Let me confirm the …"
If you find yourself wanting to type any of these, call the tool FIRST, then your text can summarize what came back. After confirm_plan in particular: immediately proceed to execute the steps via the relevant tools — DO NOT just say "let me execute" and stop.

21. PROFILE ANALYSIS — ABSOLUTE RULES (do not invent your own variants):
  a. When the user asks to analyze a profile, audit an account, or get IG strategy: CALL analyze_my_profile. Always. Even if you already have audience_score/uniqueness_score from a previous turn — the embed CARD is what the user wants to see, and only analyze_my_profile renders it.
  b. Pass the @handle from the user's message as the handle argument. Pass platform: "instagram". Do NOT include_competitors on the first call.
  c. If the tool result contains the literal string handle_mismatch: that means onboarding has a different non-empty handle. ONLY in that case, ask the user EXACTLY: "That doesn't match the IG handle on {client}'s onboarding (@{onboarding_handle}). Is @{user_handle} (a) a new account, (b) a typo, or (c) a competitor to analyze instead?" — those three options and nothing else. Never invent your own options like "create client" or "skip the analysis."
    - On answer (a) new account: call analyze_my_profile again with handle=user_handle (no special flags). The tool will analyze it.
    - On answer (b) typo: ask the user for the correct handle. Do NOT call the tool until you have one.
    - On answer (c) competitor: call analyze_my_profile again with handle=user_handle AND analyze_as_competitor=true. The tool will scrape that handle as a standalone competitor analysis without overwriting your client's record. After the card renders, OFFER to add the competitor to onboarding for future comparisons.
  d. After the tool fires successfully and the embed renders, follow the NEXT instructions inside the tool_result_text — they tell you exactly what prose to write and whether to call propose_plan.
  e. On user approval of the propose_plan card (confirm_plan), call analyze_my_profile AGAIN with include_competitors=true.
  f. NEVER call analyze_my_profile with platform other than "instagram" in v1 — if the user asks about TikTok/YouTube, explain we'll support those soon and offer to analyze IG instead.
  g. When the user re-asks "analyze my profile" in the same thread after a previous run, JUST CALL THE TOOL AGAIN. Do not present menus, do not summarize previous results, do not ask "are you sure" — call the tool. The user wants the card.
  h. If the user uses words like "refresh", "redo", "scrape again", "from scratch", or "latest", pass force_refresh: true on the analyze_my_profile call. Otherwise omit it (the tool will use cached data when available, which is the default).

EDITING-QUEUE TOOLS — when the user mentions a specific video / reel / edit:
- set_lifecycle_status / bulk_set_lifecycle_status: PRIMARY state-change tools. Values: Not started | In progress | Needs Revisions | Scheduled | Published. Use these for any "mark X as Y" / "change all to Z" / "set this to scheduled" request.
- open_editing_item: when they want to SEE an item or its modal (revisions, footage, review, caption, deadline, schedule, delete). DEFAULT to this over plain navigation.
- set_editing_queue_view: for sort/filter/search across the queue
- set_deadline: explicit deadline changes
- delete_editing_item / restore_editing_item: soft delete / restore
- permanent_delete_editing_item: HARD delete — ALWAYS call propose_plan first regardless of autonomy mode
- set_caption / rename_editing_item: explicit text changes
- bulk_delete_editing_items / bulk_assign_editor: capped at 14 per call
- (legacy compat, still work but prefer the lifecycle tools: update_editing_status, bulk_update_status, mark_post_published, mark_done_and_published, reschedule_post, bulk_reschedule_posts)`;

// ── Anthropic prompt caching helpers ──────────────────────────────────────
// Wrap the system prompt + tools array with cache_control breakpoints so
// repeated calls within Anthropic's 5-min TTL only pay ~10% of the input
// token cost for these blocks. Saves significant cost on multi-turn
// conversations and forced-retry loops.
//
// IMPORTANT: Anthropic caches by EXACT prefix match. The previous version
// passed the entire dynamic+static system prompt as one block, which
// changed on every request (date, page, client, alerts, brand, memory,
// autonomy mode all vary) — the cache was missing on essentially every
// call. Splitting into STATIC_SYSTEM_PROLOGUE (cached) + dynamic suffix
// (uncached) is what makes the cache actually fire.
function buildCachedSystem(staticPrologue: string, dynamicSuffix: string): unknown[] {
  return [
    { type: "text", text: staticPrologue, cache_control: { type: "ephemeral" } },
    { type: "text", text: dynamicSuffix },
  ];
}

function buildCachedTools<T extends Record<string, unknown>>(tools: T[]): T[] {
  if (tools.length === 0) return tools;
  // Mark cache breakpoint on the LAST tool — Anthropic caches the entire
  // tools array up to and including this point.
  const last = tools[tools.length - 1];
  return [
    ...tools.slice(0, -1),
    { ...last, cache_control: { type: "ephemeral" } } as T,
  ];
}

/**
 * Append the user + assistant messages to the already-resolved assistant_thread.
 * Failures are logged but don't block the response.
 */
async function dualWriteCompanionTurn(
  supabase: any,
  params: {
    threadId: string | null;
    userMessageText: string;
    assistantReplyText: string;
  },
): Promise<string | null> {
  if (!params.threadId) return null;
  try {
    await assistantAppendMessage(supabase, params.threadId, {
      role: "user",
      content: { type: "text", text: params.userMessageText },
    });
    await assistantAppendMessage(supabase, params.threadId, {
      role: "assistant",
      content: { type: "text", text: params.assistantReplyText },
    });
    return params.threadId;
  } catch (err) {
    console.warn("dualWriteCompanionTurn failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

// ─── SSE plumbing ───────────────────────────────────────────────────────────
// companion-chat streams its response as Server-Sent Events so the FE can
// render live scene events (Searching Viral Today…, Drafting hook…, etc.)
// before the model finishes its full tool loop. Event types:
//   - { type: "scene", scene, verb, meta } — emitted before each tool fires
//   - { type: "done", reply, actions, thread_id } — emitted once at the end
//   - { type: "error", message } — fatal failures
// All FE callers consume via `fetch` + `ReadableStream.getReader()` and parse
// the `data: {...}\n\n` event frames.
const SSE_HEADERS = {
  ...corsHeaders,
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  "Connection": "keep-alive",
  "X-Accel-Buffering": "no",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  return new Response(
    new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let closed = false;
        const emit = (event: Record<string, unknown>): void => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          } catch {
            closed = true;
          }
        };
        const closeStream = (): void => {
          if (closed) return;
          closed = true;
          try { controller.close(); } catch { /* already closed */ }
        };

        try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      emit({ type: "error", message: "Unauthorized", status: 401 });
      return closeStream();
    }

    const { message, companion_name, current_path, autonomy_mode, thread_id: incomingThreadId, active_client_id } = await req.json() as {
      message: string;
      companion_name: string;
      current_path?: string;
      autonomy_mode?: "auto" | "ask" | "plan";
      thread_id?: string | null;
      /** Sidebar-selected client (from localStorage.dashboard_viewMode on the
       *  /ai page). Treated like a URL-locked client when present — overrides
       *  the subscriber's primary-client fallback. */
      active_client_id?: string | null;
    };

    if (!message?.trim()) {
      emit({ type: "error", message: "message is required", status: 400 });
      return closeStream();
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
      emit({ type: "error", message: "Unauthorized", status: 401 });
      return closeStream();
    }

    // Resolve the caller's access model once and thread it through every tool.
    //  - Admins (agency owners) see every client.
    //  - Non-admins see clients they own (clients.user_id = caller) UNION
    //    clients they subscribe to via the subscriber_clients junction.
    // Computed in parallel: role read + accessible-client-ids fetch.
    const { data: roleRow } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    const isAdmin = roleRow?.role === "admin";
    const accessibleClientIds = await getAccessibleClientIds(adminClient, user.id, isAdmin);

    // ── @-mention resolution ───────────────────────────────────────────
    // The /ai composer inserts `@<Type>(<entity name>)` tokens via the
    // AssistantTextInput dropdown. Parse them, look up the referenced
    // entities (constrained to the caller's access scope), and build a
    // small context block that gets prepended to the message the model
    // sees. The raw message saved to companion_messages stays untouched
    // — only the model-facing copy is enriched.
    //
    // Token grammar (deliberately permissive — typeLabels can drift):
    //   @<word>(<entity name>)
    // Supported types so far: Client, Video. Unknown types are ignored.
    let modelFacingMessage = message;
    try {
      const mentionRe = /@(Client|Video)\(([^)]+)\)/g;
      const mentions: Array<{ kind: "client" | "video"; name: string }> = [];
      let m: RegExpExecArray | null;
      while ((m = mentionRe.exec(message)) !== null) {
        const kind = m[1].toLowerCase() === "client" ? "client" : "video";
        const name = m[2].trim();
        if (name) mentions.push({ kind, name });
      }
      if (mentions.length > 0) {
        const lookupClient = async (rawName: string) => {
          const q = adminClient
            .from("clients")
            .select("id, name, onboarding_data")
            .ilike("name", rawName)
            .limit(1);
          if (!isAdmin && accessibleClientIds) q.in("id", accessibleClientIds);
          const { data } = await q;
          return data?.[0] ?? null;
        };
        const lookupVideo = async (rawName: string) => {
          const q = adminClient
            .from("video_edits")
            .select("id, reel_title, caption, status, post_status, lifecycle_status, schedule_date, deadline, clients(name)")
            .ilike("reel_title", rawName)
            .limit(1);
          if (!isAdmin && accessibleClientIds) q.in("client_id", accessibleClientIds);
          const { data } = await q;
          return data?.[0] as
            | { id: string; reel_title: string; caption: string | null; status: string | null; post_status: string | null; lifecycle_status: string | null; schedule_date: string | null; deadline: string | null; clients?: { name?: string } | null }
            | null;
        };
        const blocks: string[] = [];
        for (const ref of mentions) {
          if (ref.kind === "client") {
            const c = await lookupClient(ref.name);
            if (!c) {
              blocks.push(`- Client "${ref.name}": (not found or not in your access scope)`);
              continue;
            }
            const onb = c.onboarding_data ?? {};
            const facts: string[] = [];
            if (onb.niche)              facts.push(`Niche: ${onb.niche}`);
            if (onb.target_audience)    facts.push(`Audience: ${onb.target_audience}`);
            if (onb.brand_voice)        facts.push(`Voice: ${onb.brand_voice}`);
            if (onb.content_goal)       facts.push(`Goal: ${onb.content_goal}`);
            if (onb.posting_frequency)  facts.push(`Posting: ${onb.posting_frequency}`);
            const factStr = facts.length ? facts.join(" · ") : "no onboarding data yet";
            blocks.push(`- Client "${c.name}" (id=${c.id}): ${factStr}`);
          } else {
            const v = await lookupVideo(ref.name);
            if (!v) {
              blocks.push(`- Video "${ref.name}": (not found or not in your access scope)`);
              continue;
            }
            const ownerName = v.clients?.name ?? "—";
            const lifecycle = v.lifecycle_status ?? v.post_status ?? v.status ?? "—";
            const captionSnippet = v.caption ? ` Caption: "${v.caption.slice(0, 160)}${v.caption.length > 160 ? "…" : ""}"` : "";
            const when = v.schedule_date ? ` Scheduled: ${v.schedule_date}.` : "";
            const deadline = v.deadline ? ` Deadline: ${v.deadline}.` : "";
            blocks.push(`- Video "${v.reel_title}" (id=${v.id}, client=${ownerName}): status=${lifecycle}.${when}${deadline}${captionSnippet}`);
          }
        }
        if (blocks.length > 0) {
          modelFacingMessage =
            `Referenced via @-mention (resolved from the user's accessible records):\n` +
            blocks.join("\n") +
            `\n\nUser message:\n${message}`;
        }
      }
    } catch (err) {
      // Resolution is best-effort — if it explodes, fall back to the raw
      // message so the user's request still goes through.
      console.warn("[companion-chat] @-mention resolution failed:", err);
    }

    // Client resolution priority (highest first):
    // 1. URL path /clients/:clientId/... (the dedicated client surfaces)
    // 2. active_client_id from the request body (the sidebar selector on
    //    /ai — without this, the function would fall back to the user's
    //    primary client and route work to the WRONG client when the user
    //    has switched the sidebar to a different one)
    // 3. subscriber's primary client (user's own brand)
    // 4. directly-owned client (legacy)
    const urlClientMatch = current_path?.match(/\/clients\/([0-9a-f-]{36})/i);
    const isUuid = (s: string | null | undefined): s is string =>
      !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
    const urlClientId: string | null = urlClientMatch?.[1] ?? (isUuid(active_client_id) ? active_client_id : null);
    // When the user is on the dedicated AI chat surface (/ai), suppress
    // auto-navigation actions emitted by data tools (create_script,
    // schedule_content, etc.). Auto-navigation unmounts CommandCenter and
    // closes the AI session — users came here to chat, not to be teleported.
    const isOnAiSurface = current_path === "/ai" || current_path?.startsWith("/ai/") || false;

    let client: { id: string; name: string | null; onboarding_data: any } | null = null;

    if (urlClientId) {
      // SECURITY: scope the URL-clientId lookup. Admins can load any client.
      // Non-admins must either own the client OR subscribe to it via the
      // subscriber_clients junction (the agency-staff access pattern).
      const allowed = isAdmin || (accessibleClientIds?.includes(urlClientId) ?? false);
      if (allowed) {
        const { data: urlClient } = await adminClient
          .from("clients")
          .select("id, name, onboarding_data")
          .eq("id", urlClientId)
          .maybeSingle();
        if (urlClient) client = urlClient;
      } else {
        console.warn(
          `[companion-chat] User ${user.id} (admin=${isAdmin}) attempted to access client ${urlClientId} they don't have access to; falling back.`,
        );
      }
    }

    // Fallback: user's primary client. Try the subscriber_clients junction
    // first (the canonical "primary" mechanism for non-admin agency users)
    // before falling back to a directly-owned client.
    if (!client) {
      const { data: primarySub } = await adminClient
        .from("subscriber_clients")
        .select("client_id")
        .eq("subscriber_user_id", user.id)
        .eq("is_primary", true)
        .maybeSingle();
      const primaryId = primarySub?.client_id;
      if (primaryId) {
        const { data: subClient } = await adminClient
          .from("clients")
          .select("id, name, onboarding_data")
          .eq("id", primaryId)
          .maybeSingle();
        if (subClient) client = subClient;
      }
    }
    if (!client) {
      const { data: ownClient } = await adminClient
        .from("clients")
        .select("id, name, onboarding_data")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      if (ownClient) client = ownClient;
    }

    if (!client) {
      emit({ type: "error", message: "No client found", status: 400 });
      return closeStream();
    }

    // Centralized client lookup used by every inline handler. Delegates to
    // resolveClient (tools/types.ts) so we get the same multi-strategy fuzzy
    // matching: direct ilike → punctuation-stripped → per-word → prefix.
    // When the URL is locked, resolveClient short-circuits to that client.
    const lockedClient = urlClientId ? { id: client.id, name: client.name } : null;
    const lookupClient = async (clientName: string): Promise<{ id: string; name: string | null } | null> => {
      // Build a minimal ToolContext for resolveClient. actions is unused by
      // resolveClient itself but the type requires it.
      return await resolveClient(
        { adminClient, userId: user.id, client, lockedClient, isAdmin, accessibleClientIds, actions: [] },
        clientName,
      );
    };

    // Use the incoming thread_id if the frontend provided one (continuing an existing chat).
    // If null (user clicked "New Chat" or this is the very first message), create a fresh thread
    // titled from the first 6 words of the message so the thread list shows meaningful names.
    //
    // SECURITY: verify the thread is owned by this user before trusting the
    // ID. Without this check a malicious caller can pass any thread_id and
    // pollute another user's transcript via dualWriteCompanionTurn.
    let resolvedThreadId: string | null = incomingThreadId ?? null;
    if (resolvedThreadId) {
      const { data: threadOwn } = await adminClient
        .from("assistant_threads")
        .select("id")
        .eq("id", resolvedThreadId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!threadOwn) {
        console.warn(
          `[companion-chat] Rejected unowned thread_id ${resolvedThreadId} from user ${user.id}; creating a fresh thread.`,
        );
        resolvedThreadId = null;
      }
    }
    if (!resolvedThreadId) {
      const words = message.trim().split(/\s+/).slice(0, 6).join(" ");
      const title = words.split(/\s+/).length > 3 ? words + "…" : "New chat";
      const { data: newThread } = await adminClient
        .from("assistant_threads")
        .insert({
          user_id: user.id,
          client_id: client.id,
          origin: "drawer",
          title,
        })
        .select("id")
        .single();
      resolvedThreadId = newThread?.id ?? null;
    }

    // ── Build-mode routing ─────────────────────────────────────────────────────
    // If there's an active build session OR the message contains a build trigger,
    // delegate the entire request to build-mode.ts (which has its own focused
    // system prompt + only the 8 build tools + multi-round Claude execution).
    const buildRoute = await shouldRouteToBuildMode({
      threadId: resolvedThreadId,
      message,
      adminClient,
    });

    if (buildRoute.route) {
      if (!resolvedThreadId) {
        emit({ type: "done", reply: "Couldn't set up the build session. Please try again.", actions: [] });
        return closeStream();
      }

      const buildResult = await handleBuildTurn({
        message,
        user: { id: user.id },
        userAuthHeader: authHeader,
        client: { id: client.id, name: client.name },
        threadId: resolvedThreadId,
        adminClient,
        isOnAiPage: !urlClientMatch,
        existingBuildSession: buildRoute.existingSession,
        buildTriggerMatched: buildRoute.triggerMatched,
        isAdmin,
        accessibleClientIds,
      });

      emit({
        type: "done",
        reply: buildResult.reply,
        actions: [],
        thread_id: resolvedThreadId,
        build_session_id: buildResult.buildSessionId,
      });
      return closeStream();
    }

    // Open-alerts count for the system-prompt insert. Cheap (count-only) and
    // gives the model a hint to call get_open_alerts when relevant. Scoped
    // by the same access model as the get_open_alerts tool.
    let openAlertsCount = 0;
    try {
      let alertQ = adminClient
        .from("companion_alerts")
        .select("id", { count: "exact", head: true })
        .is("dismissed_at", null);
      if (!isAdmin) {
        const allowed = accessibleClientIds ?? [];
        if (allowed.length === 0) {
          // No accessible clients → no alerts. Skip the count entirely.
          alertQ = alertQ.eq("id", "00000000-0000-0000-0000-000000000000");
        } else {
          alertQ = alertQ.or(`user_id.eq.${user.id},client_id.in.(${allowed.join(",")})`);
        }
      }
      const { count } = await alertQ;
      openAlertsCount = count ?? 0;
    } catch (e) {
      console.warn("[companion-chat] alert count failed (non-fatal):", e);
    }

    // Load memory, strategy, history in parallel.
    //
    // History is loaded from assistant_messages keyed by THREAD ID, not from
    // companion_messages keyed by client_id. The previous behavior smashed
    // every chat for the same client into one 40-message blob, so unrelated
    // threads bled into each other and the model got confused context from
    // half-finished prior conversations.
    const [strategyRes, historyRes] = await Promise.all([
      adminClient.from("client_strategies").select("*").eq("client_id", client.id).maybeSingle(),
      resolvedThreadId
        ? adminClient.from("assistant_messages").select("role, content").eq("thread_id", resolvedThreadId).order("created_at", { ascending: false }).limit(40)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    // Memory blocks intentionally empty — memory subsystem disabled.
    const clientMemoryBlock = "";
    const userMemoryBlock = "";
    const strat = strategyRes.data;

    // assistant_messages.content is jsonb of shape `{type: "text", text: "..."}`.
    // Coerce to a plain string so Anthropic accepts the content.
    const priorMessages = ((historyRes.data || []) as any[])
      .reverse()
      .map((m: any) => {
        let text: string;
        if (typeof m.content === "string") {
          text = m.content;
        } else if (m.content?.text) {
          text = String(m.content.text);
        } else if (Array.isArray(m.content)) {
          text = m.content.map((b: any) => b?.text ?? "").join("");
        } else {
          text = "";
        }
        return { role: m.role as "user" | "assistant", content: text };
      })
      .filter((m: any) => m.content && m.content.length > 0);

    // M1: ensure messages start with a user role — Anthropic 400s otherwise.
    // Strips any leading assistant turns left over from a prior session.
    const firstUserIdx = priorMessages.findIndex((m: any) => m.role === "user");
    const cleanPriorMessages = firstUserIdx >= 0 ? priorMessages.slice(firstUserIdx) : [];

    // Build brand context from existing onboarding data
    const od = client.onboarding_data || {};
    // Derive the canonical primary_niche slug from the free-text industry so
    // the AI knows EXACTLY what to pass to find_viral_videos / categorization
    // tools. Kept inline (not imported) so this file stays self-contained.
    const INDUSTRY_TO_NICHE: Array<[RegExp, string]> = [
      [/chiropract|physical therap|physio|sports med|wellness|holistic|nutritionist|dietitian/i, "fitness"],
      [/personal train|fitness|gym|crossfit|yoga|pilates/i, "fitness"],
      [/realtor|real estate|mortgage|broker|home loan/i, "real_estate"],
      [/sales|sdr|closer|appointment setter|outbound|cold call/i, "sales"],
      [/financ|cpa|account|tax|wealth|invest|bookkeep|insurance/i, "finance"],
      [/coach|consult|mentor|advisor|life coach|business coach/i, "coaching"],
      [/ecommerce|shopify|amazon fba|dtc|drop ship|online store/i, "ecommerce"],
      [/saas|software|tech|developer|engineer|startup|founder/i, "saas_tech"],
      [/beauty|esthetic|skincare|makeup|cosmetic|hair stylist|salon|nail/i, "beauty"],
      [/food|chef|restaurant|recipe|bakery|cafe/i, "food"],
      [/mindset|self help|productivity|motivation|stoic/i, "mindset"],
      [/dating|relationship|marriage|couples therapy/i, "relationships"],
      [/teach|tutor|education|course creator|professor/i, "education"],
      [/lifestyle|vlog|travel|fashion|home decor/i, "lifestyle"],
      [/parent|mom|dad|family|baby|toddler/i, "parenting"],
      [/lawyer|attorney|immigration|legal|law firm/i, "personal_branding"],
      [/dentist|doctor|medical|surgeon|clinic|aesthetics|med spa/i, "personal_branding"],
    ];
    const derivedNiche = (() => {
      const ind = od.industry as string | undefined;
      if (!ind) return null;
      for (const [re, slug] of INDUSTRY_TO_NICHE) if (re.test(ind)) return slug;
      return null;
    })();
    const brandLines = [
      od.clientName && `Client name: ${od.clientName}`,
      od.industry && `Industry: ${od.industry}${derivedNiche ? ` → primary_niche slug: ${derivedNiche} (USE THIS slug when calling find_viral_videos)` : ""}`,
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
      // "Videos completed this month" uses updated_at (when the edit became
      // Done), not created_at — so edits started in prior months but
      // finished this month count correctly. Also pull the queue's full
      // shape so Robby can answer "what's left?" honestly.
      const [
        { count: scriptsThisMonth },
        { count: videosCompletedThisMonth },
        { count: postsThisMonth },
        { count: editsInProgress },
        { count: editsNeedsRevision },
        { count: editsTotalQueued },
      ] = await Promise.all([
        adminClient.from("scripts").select("id", { count: "exact", head: true }).eq("client_id", client.id).gte("created_at", iso),
        adminClient.from("video_edits").select("id", { count: "exact", head: true }).eq("client_id", client.id).eq("status", "Done").is("deleted_at", null).gte("updated_at", iso),
        adminClient.from("video_edits").select("id", { count: "exact", head: true }).eq("client_id", client.id).gte("schedule_date", iso.slice(0,10)).is("deleted_at", null),
        adminClient.from("video_edits").select("id", { count: "exact", head: true }).eq("client_id", client.id).is("deleted_at", null).neq("status", "Done").neq("status", "Needs Revision"),
        adminClient.from("video_edits").select("id", { count: "exact", head: true }).eq("client_id", client.id).is("deleted_at", null).eq("status", "Needs Revision"),
        adminClient.from("video_edits").select("id", { count: "exact", head: true }).eq("client_id", client.id).is("deleted_at", null).neq("status", "Done"),
      ]);
      const s = scriptsThisMonth ?? 0;
      const v = videosCompletedThisMonth ?? 0;
      const p = postsThisMonth ?? 0;
      const queued = editsTotalQueued ?? 0;
      const inProg = editsInProgress ?? 0;
      const needsRev = editsNeedsRevision ?? 0;
      const analysis = strat.audience_analysis as any;
      strategyContext = `
CLIENT STRATEGY (read this before every decision):
Monthly targets: ${strat.scripts_per_month} scripts / ${strat.videos_edited_per_month} videos edited / ${strat.posts_per_month} posts scheduled
This month so far: ${s}/${strat.scripts_per_month} scripts · ${v}/${strat.videos_edited_per_month} videos completed · ${p}/${strat.posts_per_month} posts scheduled
Editing queue right now: ${queued} total in queue (${inProg} in progress, ${needsRev} needs revision). NEVER claim "nothing in the editing queue" if this number is > 0.
Content mix goal: ${strat.mix_reach}% reach / ${strat.mix_trust}% trust / ${strat.mix_convert}% convert
ManyChat: ${strat.manychat_active ? `active — keyword: "${strat.manychat_keyword || "not set"}"` : "NOT SET UP — should be a priority"}
CTA goal: ${strat.cta_goal || "not set"}
Ads: ${strat.ads_active ? `running — $${strat.ads_budget}/month` : "not running"}
Revenue goal: $${strat.monthly_revenue_goal}/month · this month: $${strat.monthly_revenue_actual}
${analysis?.summary ? `\nAUDIENCE ANALYSIS (from Instagram scrape):\nAudience alignment: ${analysis.audience_score}/10 — ${analysis.audience_detail}\nContent uniqueness: ${analysis.uniqueness_score}/10 — ${analysis.uniqueness_detail}\nSummary: ${analysis.summary}` : ""}`;
    }

    // Memory subsystem currently disabled — memoriesText is empty.
    // (When re-enabled, restore loadMemoriesForPrompt() above and concat
    // userMemoryBlock + clientMemoryBlock here.)
    const memoriesText = `${userMemoryBlock}${clientMemoryBlock}`;

    const name = companion_name || "AI";

    // Ground the model in real time. Without this the model invents arbitrary
    // dates ("manana 22 de julio" when today is May 16) when the user says
    // "tomorrow" or "next Friday".
    const nowIso = new Date().toISOString();
    const today = new Date();
    const todayHuman = today.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "America/New_York",
    });
    const todayIso = nowIso.slice(0, 10);
    const tomorrow = new Date(today.getTime() + 86_400_000);
    const tomorrowIso = tomorrow.toISOString().slice(0, 10);

    // Per-request dynamic context. Kept SMALL and uncached so the giant
    // STATIC_SYSTEM_PROLOGUE (methodology + rules + tool guidance, ~10KB)
    // can hit the Anthropic prompt cache on every call. Without this split
    // the previous one-template approach was failing the cache because
    // these dynamic bits (date, page, client, alerts, brand, strategy,
    // memory, autonomy mode) varied between every request.
    const dynamicSystemContext = `TODAY'S DATE: ${todayHuman} (ISO: ${todayIso}). When the user says "tomorrow" they mean ${tomorrowIso}. Never invent dates — derive every relative date from TODAY'S DATE above. If the user says "next Friday" or "in 2 weeks", compute the actual ISO date and use that in tool calls.

Currently on page: ${current_path || "unknown"}
${urlClientId
  ? `\nACTIVE CLIENT (locked from URL): ${client.name} (id: ${client.id}). Every tool call that takes client_name MUST use "${client.name}" — do NOT name-match other clients. The URL is the source of truth.`
  : `\nAGENCY VIEW: There is NO single active client on this page. The user is the agency owner managing many clients. Whenever they mention a client by name (e.g. "Dr Calvin", "make ideas for X", "what's Y's pipeline"), call the appropriate tool with that name as client_name — the lookup handles fuzzy matching (case, punctuation, partial names all work). NEVER assume the user IS the client; "${client.name}" is just the default credit/billing identity, not the work target. If you genuinely don't know which client they mean, call list_all_clients to see options.`}
${openAlertsCount > 0 ? `\nALERTS: There are ${openAlertsCount} open alert(s) the user hasn't dismissed (stuck clients, overdue scripts, stale leads, etc.). When the user opens a fresh conversation OR asks "what's up", "what needs attention", "catch me up", call get_open_alerts to surface 1-2 of the most relevant items in your reply. Do NOT dump the full list every turn — be selective and conversational.` : ""}
${brandLines ? `\nOnboarding data:\n${brandLines}` : "\nNo onboarding data yet."}
${strategyContext}
${memoriesText}

AUTONOMY MODE: ${autonomy_mode || "ask"}
${autonomy_mode === "auto"
  ? `AUTO MODE — CRITICAL RULES (override everything above):
- You MUST call a tool on every single response. Never output plain text without calling a tool first.
- ALWAYS call respond_to_user alongside other tools so the user knows what you're doing. "On it." is banned. Be specific.
- NEVER ask for permission or confirmation. NEVER say "Confirmas?", "Necesito confirmación", "Confirm?", "Should I…?", "Quieres que…?", "Ready to proceed?", or any similar prompt that waits for a yes/no.
- DO NOT call propose_plan for ANY action in Auto mode — that's an Ask/Plan mode tool. The only exception is permanent_delete_editing_item which always requires a plan.
- This applies to mark_post_published, update_lead_status, send_contract, bulk operations — ALL of them execute immediately in Auto.
- Examples:
    User: "mark it as posted" → IMMEDIATELY call mark_post_published with the script id you have in context. Do NOT ask "Confirmas?".
    User: "schedule for tomorrow" → IMMEDIATELY call schedule_post with tomorrow's ISO date. Do NOT ask which date.
    User: "send to editing" → IMMEDIATELY call submit_to_editing with the lightest-loaded editor. Do NOT ask which editor.
- If the user gave you a clear instruction and you have enough context to act, ACT. If you genuinely lack a required field (no item selected, no client resolved), look it up via the appropriate tool FIRST — don't ask the user for it.

For non-script tasks: Think — what is the single most useful action I can take RIGHT NOW? Take it — and tell the user what you did.

NOTE: Script-build requests are intercepted before reaching you. You don't need to handle "build me a script" here.`
  : autonomy_mode === "plan"
  ? "PLAN MODE: Before doing anything, write out a numbered plan of every step you will take. Ask the user to approve the plan. Only execute after they confirm."
  : "ASK MODE: Before taking any action that changes data or navigates pages, briefly say what you are about to do in one sentence and wait for the user to confirm. Then execute once they say yes."
}`;

    // Build mode is handled separately above (build-mode.ts). Mode is still
    // classified for refinement detection below (tool_choice forcing skip),
    // but the full TOOLS array now ships on every call — per-mode filtering
    // was destroying the prompt cache by changing the tools prefix between
    // requests, which invalidates the entire tools+system cache prefix.
    // Cache reads of $0.02 vs cache writes of $10.16 over 19d confirmed it.
    const detectedMode = classifyMode(message);
    console.log(`[companion-chat][mode] detected=${detectedMode} tools=${TOOLS.length}`);

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

    // Multi-round Claude tool-use loop. Lets Claude chain tool calls
    // (e.g. get_client_info → find_viral_videos → respond) instead of stalling
    // after one round and falling back to "On it.".
    // modelFacingMessage may include resolved @-mention context blocks
    // prepended above the user's raw text; we keep the persisted
    // companion_messages row unchanged.
    const messages: any[] = [...cleanPriorMessages, { role: "user", content: modelFacingMessage }];
    const actions: any[] = [];
    let reply = "";
    let turn1Reply = "";
    // Track tools that emitted user-visible embeds so the fallback at the
    // bottom can synthesize a sensible reply when the model called a tool
    // but produced no follow-up text (Haiku does this frequently).
    let firedViralVideos = 0;
    let firedProfileAnalysis = false;
    // 5 rounds is enough for the longest legitimate chains we see (e.g. resolve
    // client → look up data → maybe one more lookup → respond). build-mode.ts
    // uses 6 because the script-build flow has more discrete steps. If you
    // raise this, also update the wall-clock budget consideration in the loop.
    const MAX_ROUNDS = 5;

    // Speed optimization: route mechanical mutation requests to Haiku.
    // Status changes, deadline sets, assigns, deletes, renames are simple
    // tool selections that don't need Sonnet's reasoning.
    const userText = String(message ?? "").toLowerCase().trim();
    const mechanicalPatterns: RegExp[] = [
      // "mark/set/change X to <status>" — covers "change all master construction
      // videos to scheduled" which previously went to Sonnet without forced
      // tool use and dead-ended on a "Let me pull up…" reply.
      /\b(mark|set|change|update|move)\b[^.]*\b(done|published|unpublished|scheduled|in[- ]?progress|in[- ]?review|not started)\b/,
      /\b(set|add|update|change)\s+(the\s+)?deadline\b/,
      /\b(assign|reassign)\b.*\b(to)\b/,
      /\b(delete|remove|trash)\b/,
      /\b(restore|undelete|untrash)\b/,
      /\b(rename)\b.*\bto\b/,
      /\b(set\s+caption|change\s+caption)\b/,
      /\bbulk\b/,
      // "<verb> all X" — broad bulk-action trigger. Catches "delete all", "schedule
      // all", "reschedule all", "publish all", "approve all", etc.
      /\b(mark|set|change|update|move|delete|remove|restore|rename|publish|schedule|reschedule|assign|approve|reject)\s+all\b/,
    ];
    const isMechanical = mechanicalPatterns.some((re) => re.test(userText));
    // Mode-aware model tiering: read-only modes always use Haiku (cheap +
    // fast), creative modes always use Sonnet, the rest fall back to the
    // mechanical/creative heuristic on the message text.
    const readOnlyModes = new Set(["intelligence", "analytics", "discovery", "finance", "profile-analysis"]);
    const creativeModes = new Set(["scripts", "canvas"]);
    const chosenModel = readOnlyModes.has(detectedMode)
      ? "claude-haiku-4-5-20251001"
      : creativeModes.has(detectedMode)
        ? "claude-sonnet-4-6"
        : isMechanical
          ? "claude-haiku-4-5-20251001"
          : "claude-sonnet-4-6";
    console.log(`[companion-chat] model=${chosenModel} mode=${detectedMode} mechanical=${isMechanical} text="${userText.slice(0, 80)}"`);

    // Dead-end detection: when the model writes "Let me…" / "I'll…" / "Now
    // I'll…" / "I will…" as a text-only reply with no tool call, the
    // conversation ends with a broken promise. We detect this and retry
    // once with tool_choice:any to force the model to follow through.
    const deadEndPatterns: RegExp[] = [
      /\blet me\b/i,
      /\bi['’]ll\b/i,
      /\bi will\b/i,
      /\bnow i\b/i,
      /\bfirst i\b/i,
      /\blet's\b/i,
      /\bgoing to\b/i,
    ];
    let forceToolChoiceNextRound = false;
    let deadEndRetried = false;

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: chosenModel,
          max_tokens: 4096,
          system: buildCachedSystem(STATIC_SYSTEM_PROLOGUE, dynamicSystemContext),
          tools: buildCachedTools(TOOLS),
          // Force a tool call when:
          // (a) round 0 + Auto mode or mechanical prompt — prevents the
          //     initial "Let me pull up…" stall on bulk requests.
          // (b) `forceToolChoiceNextRound` is set by the dead-end retry
          //     branch below — fires when the model promised action via
          //     "Let me/I'll/Now I'll…" text but emitted no tool call.
          // Skip ALL tool-choice forcing when in refinement mode — the user
          // is editing the previous reply, not asking for an action. Forcing
          // a tool here is what produced "got it, keeping things tight 👋"
          // greetings instead of the requested shorter rewrite.
          ...(detectedMode !== "refinement" &&
              ((round === 0 && (autonomy_mode === "auto" || isMechanical)) || forceToolChoiceNextRound)
            ? { tool_choice: { type: "any" } }
            : {}),
          messages,
        }),
      });
      const result = await apiRes.json();
      const usage = result?.usage as { cache_creation_input_tokens?: number; cache_read_input_tokens?: number; input_tokens?: number; output_tokens?: number } | undefined;
      if (usage) {
        console.log(`[companion-chat][cache] round=${round} create=${usage.cache_creation_input_tokens ?? 0} read=${usage.cache_read_input_tokens ?? 0} input=${usage.input_tokens ?? 0} output=${usage.output_tokens ?? 0}`);
      }
      if (!apiRes.ok) {
        console.error("[companion-chat] Claude API error:", result?.error || result);
        const errMsg = `Anthropic returned an error (${apiRes.status}). Try again in a moment.`;
        // If we already have a partial reply from earlier rounds, append the
        // failure marker so the user knows the response was cut short rather
        // than seeing a misleadingly complete-looking message.
        reply = reply ? `${reply}\n\n— ${errMsg}` : errMsg;
        break;
      }

      const textBlocks = (result.content || []).filter((b: any) => b.type === "text");
      if (textBlocks[0]?.text) {
        reply = textBlocks[0].text;
        if (round === 0) turn1Reply = reply;
      }

      if (result.stop_reason !== "tool_use") {
        if (!reply && round === 0) reply = "I'm here — what do you need?";

        // Dead-end retry: model wrote a "Let me/I'll/Now I'll…" promise but
        // emitted no tool call. Push the assistant turn into the message
        // history, append a coaching user turn, and continue the loop with
        // tool_choice:any forced for the next round.
        const looksLikeDeadEnd =
          !deadEndRetried &&
          reply &&
          // Refinement mode is text-only by design — don't burn an extra
          // Anthropic call retrying with tool_choice:any when the user
          // just wanted a rewrite.
          detectedMode !== "refinement" &&
          deadEndPatterns.some((re) => re.test(reply));
        if (looksLikeDeadEnd) {
          deadEndRetried = true;
          forceToolChoiceNextRound = true;
          console.warn(
            "[companion-chat] dead-end detected; retrying with tool_choice:any. reply preview:",
            reply.slice(0, 140),
          );
          messages.push({ role: "assistant", content: result.content });
          messages.push({
            role: "user",
            content:
              "You wrote that you would take action ('Let me…' / 'I'll…' / 'Now I…') but did not call any tool. Call the appropriate tool right now to follow through on what you said. Do not write more text without a tool call.",
          });
          // Clear reply so the user doesn't see the dead-end text if we
          // succeed on retry. If retry fails, the next iteration will set
          // reply to the new response.
          reply = "";
          continue;
        }

        break;
      }

      // Reset forced tool_choice after a successful tool-use round so later
      // rounds can end naturally with a text reply.
      forceToolChoiceNextRound = false;

      const toolUseBlocks = (result.content || []).filter((b: any) => b.type === "tool_use");
      const toolResults: any[] = [];

      for (const block of toolUseBlocks) {
        // Emit a scene hint so the FE can swap its loading indicator from a
        // rotating verb to the real tool's "doing" line. respond_to_user is a
        // pure text pass-through and doesn't deserve a scene flash.
        if (block.name !== "respond_to_user") {
          const hint = toolToScene(block.name);
          emit({ type: "scene", scene: hint.scene, verb: hint.verb, meta: hint.meta, tool: block.name });
        }

        if (block.name === "respond_to_user") {
          // Pure text response wrapped as a tool call (used in auto mode).
          // Only assign reply if we got a non-empty string — otherwise we
          // overwrite a useful prior reply with "" and the user gets the
          // "Let me try again" fallback.
          const msg = typeof block.input.message === "string" ? block.input.message.trim() : "";
          if (msg) {
            reply = msg;
            if (round === 0) turn1Reply = reply;
          }
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Message sent." });
        }

        if (block.name === "create_script") {
          const { client_name, title, formato, lines } = block.input;

          // Honors URL lock when set; falls back to user-scoped name match.
          const targetClient = await lookupClient(client_name);

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

              // Navigate to the client's scripts page (suppressed on /ai so
              // we don't unmount the chat surface mid-conversation)
              if (!isOnAiSurface) actions.push({ type: "navigate", path: "/clients/" + targetClient.id + "/scripts" });
              actions.push({ type: "refresh_data", scope: "scripts" });
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
          // Admins see every client across the agency. Non-admins see the
          // union of clients they own + clients they subscribe to.
          let q = adminClient.from("clients").select("id, name, email, onboarding_data");
          if (!isAdmin) {
            const allowed = accessibleClientIds ?? [];
            if (allowed.length === 0) q = q.eq("id", "00000000-0000-0000-0000-000000000000");
            else q = q.in("id", allowed);
          }
          const { data: allClients } = await q.order("name");
          const summary = (allClients || []).map((c: any) => {
            const od = c.onboarding_data || {};
            return c.name + " (" + c.email + ")" + (od.industry ? " — " + od.industry : "");
          }).join("\n");
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: summary || "No clients found." });
        }

        if (block.name === "find_viral_videos") {
          const { topic, niche, content_format, platform, min_outlier = 3, days_back, limit = 8 } = block.input;
          const cap = Math.min(Math.max(1, limit), 25);
          let query = adminClient
            .from("viral_videos")
            .select("id, channel_username, platform, caption, transcript, views_count, likes_count, comments_count, engagement_rate, outlier_score, video_url, thumbnail_url, hook_text, cta_text, framework_meta, content_format, primary_niche, posted_at, video_file_url")
            .gte("outlier_score", min_outlier)
            .order("outlier_score", { ascending: false })
            .limit(cap);
          if (topic) {
            const safe = String(topic).replace(/[%,]/g, "");
            query = query.or(`caption.ilike.%${safe}%,transcript.ilike.%${safe}%`);
          }
          if (niche) query = query.eq("primary_niche", String(niche).toLowerCase());
          if (content_format) query = query.eq("content_format", String(content_format).toLowerCase());
          if (platform) query = query.eq("platform", platform);
          if (days_back && Number(days_back) > 0) {
            const cutoff = new Date(Date.now() - Number(days_back) * 86_400_000).toISOString();
            query = query.gte("posted_at", cutoff);
          }
          const { data: videos } = await query;

          // Helper: build IG/TikTok search keywords from a topic so an ADMIN
          // can manually scout when our DB has no match. Gated to admins —
          // non-admin subscribers shouldn't be encouraged to scrape directly,
          // since the puppeteer-backed VPS scraper can get rate-limited or
          // banned if every user runs ad-hoc searches.
          const buildSearchHints = (t: string | undefined): string => {
            if (!isAdmin) return "";
            if (!t || !t.trim()) return "";
            const cleaned = t.toLowerCase().replace(/[^\w\s]+/g, "").trim();
            const words = cleaned.split(/\s+/).filter(Boolean);
            const hashtag = words.join("");
            const variants = [
              `#${hashtag}`,
              `#${hashtag}tips`,
              `#${hashtag}reels`,
              ...(words.length > 1 ? [`#${words[0]}`] : []),
            ];
            const igSearch = `https://www.instagram.com/explore/tags/${hashtag}/`;
            const tiktokSearch = `https://www.tiktok.com/tag/${hashtag}`;
            return [
              "",
              "ADMIN-ONLY hints (do NOT share with non-admin users — they can't scout safely):",
              `Hashtags to try: ${variants.join(", ")}`,
              `Instagram explore: ${igSearch}`,
              `TikTok tag: ${tiktokSearch}`,
              `Search keywords (paste into IG/TikTok search): "${t}", "${t} viral", "${t} hook", "${t} tips"`,
            ].join("\n");
          };

          const fmtFiltersUsed = (): string => {
            const parts: string[] = [];
            if (topic) parts.push(`topic="${topic}"`);
            if (niche) parts.push(`niche=${niche}`);
            if (content_format) parts.push(`format=${content_format}`);
            if (platform) parts.push(`platform=${platform}`);
            if (days_back) parts.push(`last ${days_back}d`);
            parts.push(`outlier>=${min_outlier}`);
            return parts.join(", ");
          };

          const fmtVideo = (v: any) => {
            const handle = `@${v.channel_username}`;
            const plat = v.platform ?? "?";
            const views = (v.views_count ?? 0).toLocaleString();
            const out = v.outlier_score?.toFixed?.(1) ?? v.outlier_score ?? "?";
            const eng = v.engagement_rate ? `${v.engagement_rate}%` : "?";
            const fmt = v.content_format ?? "uncategorized";
            const nch = v.primary_niche ?? "?";
            const cap = (v.caption ?? "").slice(0, 180);
            const tx = (v.transcript ?? "").slice(0, 220);
            const hook = v.hook_text ? `Hook: ${v.hook_text}` : "";
            const cta = v.cta_text ? `CTA: ${v.cta_text}` : "";
            const fm = v.framework_meta ? `Framework: ${typeof v.framework_meta === "string" ? v.framework_meta.slice(0, 200) : JSON.stringify(v.framework_meta).slice(0, 200)}` : "";
            const lines = [
              `${handle} (${plat}) — ${views} views, ${eng} eng, ${out}x outlier — [${fmt} / ${nch}]`,
              `Caption: ${cap}`,
              tx && `Transcript: ${tx}`,
              hook,
              cta,
              fm,
              v.video_url && `URL: ${v.video_url}`,
            ].filter(Boolean);
            return lines.join("\n");
          };

          if (!videos || videos.length === 0) {
            // Fallback: top viral videos regardless of filters
            const { data: fallback } = await adminClient
              .from("viral_videos")
              .select("id, channel_username, platform, caption, views_count, outlier_score, content_format, primary_niche, video_url")
              .gte("outlier_score", 5)
              .order("outlier_score", { ascending: false })
              .limit(5);
            const info = (fallback || []).map((v: any) =>
              `@${v.channel_username} (${v.platform}) — ${(v.views_count ?? 0).toLocaleString()} views, ${v.outlier_score}x outlier — [${v.content_format ?? "?"} / ${v.primary_niche ?? "?"}]. Caption: ${(v.caption ?? "").slice(0, 120)}`
            ).join("\n\n");
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: `No matches in our database for filters [${fmtFiltersUsed()}]. Top viral videos overall:\n${info}\n${buildSearchHints(topic)}`,
            });
          } else {
            const body = videos.map(fmtVideo).join("\n\n---\n\n");
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: `${videos.length} viral video(s) found [${fmtFiltersUsed()}]:\n\n${body}`,
            });

            // Emit video-card embeds so the FE can render thumbnail previews
            // inline with Robby's reply. The user sees the actual videos he's
            // referencing instead of just a paragraph of @handle bullet points.
            const ageOf = (postedAt: string | null | undefined): string => {
              if (!postedAt) return "—";
              const days = Math.floor((Date.now() - new Date(postedAt).getTime()) / 86_400_000);
              if (days < 1) return "today";
              if (days === 1) return "1d ago";
              if (days < 7) return `${days}d ago`;
              if (days < 30) return `${Math.floor(days / 7)}w ago`;
              if (days < 365) return `${Math.floor(days / 30)}mo ago`;
              return `${Math.floor(days / 365)}y ago`;
            };
            firedViralVideos += videos.length;
            emit({
              type: "embeds",
              embeds: videos.slice(0, 6).map((v: any) => {
                const fm = (typeof v.framework_meta === "object" && v.framework_meta !== null)
                  ? v.framework_meta
                  : null;
                const bodyStruct = typeof fm?.body_structure === "string"
                  ? fm.body_structure
                  : undefined;
                return {
                  type: "video-card" as const,
                  data: {
                    id: v.id,
                    thumbnail_url: v.thumbnail_url ?? null,
                    username: v.channel_username ?? "unknown",
                    outlier: Number(v.outlier_score ?? 0),
                    views: Number(v.views_count ?? 0),
                    engagement: Number(v.engagement_rate ?? 0),
                    age: ageOf(v.posted_at),
                    format_hint: v.content_format ?? undefined,
                    platform: v.platform ?? undefined,
                    content_format: v.content_format ?? undefined,
                    primary_niche: v.primary_niche ?? undefined,
                    hook_text: typeof v.hook_text === "string" ? v.hook_text.slice(0, 200) : undefined,
                    body_structure: bodyStruct ? bodyStruct.slice(0, 200) : undefined,
                    cta_text: typeof v.cta_text === "string" ? v.cta_text.slice(0, 200) : undefined,
                    video_url: v.video_url ?? undefined,
                    video_file_url: v.video_file_url ?? null,
                  },
                };
              }),
            });
          }
        }

        if (block.name === "analyze_my_profile") {
          const input = block.input as {
            client_name?: string;
            handle?: string;
            platform: "instagram";
            include_competitors?: boolean;
            force_refresh?: boolean;
            analyze_as_competitor?: boolean;
          };

          // Resolution order: explicit client_name → URL-locked client →
          // the request-level resolved client (subscriber's primary, or
          // the user's own owned client). On /ai there is no locked
          // client but `client` IS populated from the subscriber_clients
          // junction — falling back to it lets users analyze themselves
          // without first locking a thread.
          const targetClient = input.client_name
            ? await lookupClient(input.client_name)
            : lockedClient ?? { id: client.id, name: client.name };

          if (!targetClient) {
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: "No client locked to this thread and no client_name given. Ask the user which client to analyze.",
            });
          } else {
            // Hydrate full onboarding_data for the resolved client
            const { data: fullClient } = await adminClient
              .from("clients")
              .select("id, name, onboarding_data")
              .eq("id", targetClient.id)
              .maybeSingle();

            const result = await runAnalyzeMyProfile({
              admin: adminClient,
              authHeader: req.headers.get("Authorization") || "",
              supabaseUrl: Deno.env.get("SUPABASE_URL") || "",
              input: {
                client_id: targetClient.id,
                client_name: targetClient.name || "this client",
                handle: input.handle,
                platform: input.platform,
                include_competitors: input.include_competitors === true,
                force_refresh: input.force_refresh === true,
                analyze_as_competitor: input.analyze_as_competitor === true,
              },
              onboarding: (fullClient?.onboarding_data as Record<string, unknown>) || {},
            });

            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: result.tool_result_text,
            });

            // Charge credits only when an analysis actually ran fresh
            // (embed_payload present AND not served from cache). Mismatch,
            // missing-handle, and cache-hit paths are all free.
            if (result.embed_payload && user?.id) {
              if (!result.cached) {
                const onboardingData = (fullClient?.onboarding_data as Record<string, unknown>) || {};
                const compCount = Array.isArray(onboardingData.top3Profiles)
                  ? (onboardingData.top3Profiles as unknown[]).length
                  : 0;
                const cost = input.include_competitors === true
                  ? PROFILE_ANALYSIS_COST + (PROFILE_ANALYSIS_COST_PER_COMPETITOR * compCount)
                  : PROFILE_ANALYSIS_COST;
                await deductCredits(adminClient, user.id, "analyze_my_profile", cost);
              }

              firedProfileAnalysis = true;
              emit({
                type: "embeds",
                embeds: [{
                  type: "profile-analysis" as const,
                  data: result.embed_payload,
                }],
              });
            }
          }
        }

        if (block.name === "list_client_scripts") {
          const { client_name, limit = 5 } = block.input;
          const targetClient = await lookupClient(client_name);
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
          const targetClient = await lookupClient(client_name);
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
              if (!isOnAiSurface) actions.push({ type: "navigate", path: "/content-calendar" });
              actions.push({ type: "refresh_data", scope: "calendar" });
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Scheduled '" + title + "' for " + date });
            } else {
              await adminClient.from("video_edits").insert({ client_id: targetClient.id, reel_title: title, schedule_date: date, caption: caption || null, status: "Not started", post_status: "Unpublished" });
              if (!isOnAiSurface) actions.push({ type: "navigate", path: "/content-calendar" });
              actions.push({ type: "refresh_data", scope: "calendar" });
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Created and scheduled '" + title + "' for " + date });
            }
          }
        }

        if (block.name === "submit_to_editing_queue") {
          const { client_name, title, notes, schedule_date, editor_name, deadline } = block.input;
          const targetClient = await lookupClient(client_name);
          if (!targetClient) {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Client not found: " + client_name });
          } else {
            const insertPayload: Record<string, unknown> = {
              client_id: targetClient.id,
              reel_title: title,
              status: "Not started",
              post_status: "Unpublished",
              revisions: notes || null,
              schedule_date: schedule_date || null,
            };
            if (editor_name) insertPayload.assignee = editor_name;
            if (deadline) insertPayload.deadline = deadline;
            await adminClient.from("video_edits").insert(insertPayload).select("id").single();
            if (!isOnAiSurface) actions.push({ type: "navigate", path: "/editing-queue" });
            actions.push({ type: "refresh_data", scope: "editing_queue" });
            const assigneeNote = editor_name ? ` (assigned to ${editor_name})` : " (unassigned)";
            const deadlineNote = deadline ? `, deadline ${deadline}` : "";
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `"${title}" added to editing queue for ${targetClient.name}${assigneeNote}${deadlineNote}.` });
          }
        }

        if (block.name === "get_editing_queue") {
          const { client_name } = block.input;
          const targetClient = await lookupClient(client_name);
          if (!targetClient) {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Client not found: " + client_name });
          } else {
            // Footage status comes from any of: footage, file_url,
            // file_submission, storage_path, storage_url. If ANY is set, the
            // editor has raw material to work with. Surface this so Robby
            // doesn't tell the user "find out if the editor has the footage"
            // when it's already been uploaded.
            const { data: items } = await adminClient
              .from("video_edits")
              .select("reel_title, status, assignee, schedule_date, post_status, footage, file_url, file_submission, storage_path, storage_url, deadline")
              .eq("client_id", targetClient.id)
              .is("deleted_at", null)
              .order("created_at", { ascending: false })
              .limit(10);
            const info = (items || []).map((i: any) => {
              const hasFootage = !!(i.footage || i.file_url || i.file_submission || i.storage_path || i.storage_url);
              const footageMark = hasFootage ? "[footage attached]" : "[no footage uploaded yet]";
              const deadlineMark = i.deadline ? ` deadline ${String(i.deadline).slice(0, 10)}` : "";
              return `${i.reel_title || "Untitled"} — ${i.status}${i.assignee ? ` (editor: ${i.assignee})` : " (no editor)"} ${footageMark}${i.schedule_date ? ` — posts ${String(i.schedule_date).slice(0, 10)}` : ""}${deadlineMark}`;
            }).join("\n");
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Editing queue for ${targetClient.name}:\n${info}` });
          }
        }

        if (block.name === "get_content_calendar") {
          const { client_name, days_ahead = 14 } = block.input;
          const targetClient = await lookupClient(client_name);
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
          const targetClient = await lookupClient(client_name);
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
              if (!isOnAiSurface) actions.push({ type: "navigate", path: "/scripts?view=canvas" });
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Note added to " + targetClient.name + "'s canvas." });
            } else {
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "No active canvas found for " + targetClient.name + ". Have them open the Connecta AI canvas first." });
            }
          }
        }

        if (block.name === "read_canvas") {
          const { client_name } = block.input;
          const targetClient = await lookupClient(client_name);
          if (!targetClient) {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `No client found matching "${client_name}"` });
          } else {
            const context = await readCanvasContext(adminClient, targetClient.id);
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: context });
          }
        }

        if (block.name === "add_video_to_canvas") {
          const { client_name, video_url, video_title, channel_username, reason } = block.input;
          const targetClient = await lookupClient(client_name);
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
              if (!isOnAiSurface) actions.push({ type: "navigate", path: "/scripts?view=canvas" });
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Video node added to canvas for ${targetClient.name}: "${video_title}". The node will auto-transcribe when the canvas opens. Row position: ${rowY}.` });
            }
          }
        }

        if (block.name === "add_research_note_to_canvas") {
          const { client_name, hook_type, hook_text, why_it_works, how_to_adapt } = block.input;
          const targetClient = await lookupClient(client_name);
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
          const targetClient = await lookupClient(client_name);
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
          const targetClient = await lookupClient(client_name);
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
          const targetClient = await lookupClient(client_name);
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
              if (!isOnAiSurface) actions.push({ type: "navigate", path: `/clients/${targetClient.id}/scripts` });
              actions.push({ type: "refresh_data", scope: "scripts" });
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Script "${title}" saved to ${targetClient.name}'s scripts library.` });
            }
          }
        }

        // ── Canvas write-surface dispatch (Phase 1) ──────────────────────
        // Resolution: explicit client_name → URL-locked → request-level
        // resolved client. Matches the pattern analyze_my_profile uses.
        const resolveCanvasClient = async (clientName: string | undefined) =>
          clientName ? await lookupClient(clientName)
            : lockedClient ?? { id: client.id, name: client.name };

        // ── Follow-up workflow editing + status reads (Phase 4) ──────────

        if (block.name === "get_followup_workflow") {
          const { client_name } = block.input as { client_name?: string };
          const targetClient = await resolveCanvasClient(client_name);
          if (!targetClient) {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "No client to read the workflow for." });
          } else {
            const { data: wf } = await adminClient
              .from("followup_workflows")
              .select("id, name, is_active, nodes, edges, updated_at")
              .eq("client_id", targetClient.id)
              .maybeSingle();
            if (!wf) {
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `${targetClient.name} has no follow-up workflow yet. Open the builder with open_followup_builder so they can create one.` });
            } else {
              const nodes = Array.isArray(wf.nodes) ? (wf.nodes as any[]) : [];
              const edges = Array.isArray(wf.edges) ? (wf.edges as any[]) : [];
              const lines = nodes
                .filter((n) => n?.type === "actionNode")
                .map((n) => {
                  const d = n.data ?? {};
                  const extra = d.action_type === "wait" ? ` (${d.wait_amount} ${d.wait_unit})`
                    : d.action_type === "update_lead_status" ? ` → ${d.new_status}` : "";
                  return `${n.id}: ${d.label ?? d.action_type}${extra}`;
                });
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Workflow "${wf.name}" for ${targetClient.name} (${wf.is_active ? "ACTIVE" : "paused"}, ${nodes.length} nodes, ${edges.length} edges):\n${lines.join("\n") || "(empty)"}` });
            }
          }
        }

        if (block.name === "add_followup_step") {
          const { client_name, action_type, label, use_ai, wait_unit, wait_amount, new_status } = block.input as {
            client_name?: string; action_type: string; label: string; use_ai?: boolean; wait_unit?: string; wait_amount?: number; new_status?: string;
          };
          const targetClient = await resolveCanvasClient(client_name);
          if (!targetClient) {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "No client to add a step for." });
          } else {
            // Validate wait + status args inline
            if (action_type === "wait" && (!wait_unit || typeof wait_amount !== "number")) {
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "action_type=wait requires wait_unit (minutes|hours|days) and wait_amount (number). Ask the user how long." });
            } else if (action_type === "update_lead_status" && !new_status) {
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "action_type=update_lead_status requires new_status. Ask the user which status." });
            } else {
              const { data: wf } = await adminClient
                .from("followup_workflows")
                .select("id, nodes, edges")
                .eq("client_id", targetClient.id)
                .maybeSingle();
              if (!wf) {
                toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `${targetClient.name} has no workflow yet — create one by opening the builder first (open_followup_builder).` });
              } else {
                const nodes = Array.isArray(wf.nodes) ? (wf.nodes as any[]) : [];
                const edges = Array.isArray(wf.edges) ? (wf.edges as any[]) : [];
                // Find tail nodes: action nodes that don't appear as a `source` in any edge.
                const sourceIds = new Set(edges.map((e) => e?.source).filter(Boolean));
                const actionNodes = nodes.filter((n) => n?.type === "actionNode");
                const tails = actionNodes.filter((n) => !sourceIds.has(n.id));
                const tail = tails[tails.length - 1] ?? actionNodes[actionNodes.length - 1] ?? null;
                // Position the new node to the right of the tail (or at a sensible default)
                const tailPos = tail?.position ?? { x: 200, y: 300 };
                const newId = `action_${action_type}_${Date.now()}`;
                const newData: Record<string, any> = { label, action_type };
                if (action_type === "send_email" || action_type === "send_sms") newData.use_ai = use_ai !== false;
                if (action_type === "wait") { newData.wait_unit = wait_unit; newData.wait_amount = wait_amount; }
                if (action_type === "update_lead_status") newData.new_status = new_status;
                const newNode = { id: newId, type: "actionNode", position: { x: (tailPos.x ?? 0) + 240, y: tailPos.y ?? 300 }, data: newData };
                const updatedNodes = [...nodes, newNode];
                const updatedEdges = tail ? [...edges, { id: `e_${tail.id}_${newId}`, source: tail.id, target: newId }] : edges;
                const { error } = await adminClient.from("followup_workflows").update({ nodes: updatedNodes, edges: updatedEdges, updated_at: new Date().toISOString() }).eq("id", wf.id);
                if (error) {
                  toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Failed to add step: ${error.message}` });
                } else {
                  toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Appended "${label}" (${action_type}, id=${newId}) to ${targetClient.name}'s workflow. Wired from previous step ${tail?.id ?? "(none — orphan node, no previous tail)"}.` });
                }
              }
            }
          }
        }

        if (block.name === "get_social_account_status") {
          const { client_name } = block.input as { client_name?: string };
          const targetClient = await resolveCanvasClient(client_name);
          if (!targetClient) {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "No client to check social accounts for." });
          } else {
            const { data: rows } = await adminClient
              .from("social_connections")
              .select("platform, account_label, status, last_error, last_used_at")
              .eq("client_id", targetClient.id);
            const platforms = ["instagram", "tiktok", "facebook", "youtube"];
            const byPlatform = new Map<string, any[]>();
            for (const r of (rows ?? [])) {
              const arr = byPlatform.get(r.platform) ?? [];
              arr.push(r); byPlatform.set(r.platform, arr);
            }
            const lines = platforms.map((p) => {
              const accounts = byPlatform.get(p) ?? [];
              if (accounts.length === 0) return `${p}: NOT CONNECTED`;
              const status = accounts.map((a) => `${a.account_label} [${a.status}]${a.last_error ? ` (err: ${a.last_error.slice(0, 50)})` : ""}`).join(", ");
              return `${p}: ${status}`;
            });
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Social accounts for ${targetClient.name}:\n${lines.join("\n")}\n\nIf any are not connected or need re-auth, suggest open_social_accounts_page to direct the user to the connect button.` });
          }
        }

        if (block.name === "get_subscription_info") {
          const { data: sub } = await adminClient
            .from("subscriptions")
            .select("plan_type, status, trial_ends_at, subscribed_at, is_manually_assigned")
            .eq("user_id", user.id)
            .maybeSingle();
          if (!sub) {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "No subscription record found for this user — likely on the free tier or admin-comped." });
          } else {
            const trial = sub.trial_ends_at ? ` (trial ends ${new Date(sub.trial_ends_at).toISOString().slice(0, 10)})` : "";
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Subscription: plan=${sub.plan_type}, status=${sub.status}${trial}${sub.is_manually_assigned ? ", manually-assigned" : ""}.` });
          }
        }

        if (block.name === "list_trainings") {
          const { assigned_to_me, category } = block.input as { assigned_to_me?: boolean; category?: string };
          let q = adminClient.from("trainings").select("id, title, category, is_published, assigned_to_user_id, created_at").eq("is_published", true).order("created_at", { ascending: false }).limit(30);
          if (assigned_to_me) q = q.eq("assigned_to_user_id", user.id);
          if (category) q = q.eq("category", category);
          const { data: rows } = await q;
          if (!rows || rows.length === 0) {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "No matching trainings." });
          } else {
            const lines = rows.map((r) => `${r.id}: ${r.title}${r.category ? ` [${r.category}]` : ""}`);
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `${rows.length} training(s):\n${lines.join("\n")}` });
          }
        }

        if (block.name === "list_contracts") {
          const { client_name } = block.input as { client_name?: string };
          const targetClient = await resolveCanvasClient(client_name);
          if (!targetClient) {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "No client to list contracts for." });
          } else {
            const { data: rows } = await adminClient
              .from("contracts")
              .select("id, title, status, created_at")
              .eq("client_id", targetClient.id)
              .order("created_at", { ascending: false })
              .limit(20);
            if (!rows || rows.length === 0) {
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `No contracts for ${targetClient.name}.` });
            } else {
              const lines = rows.map((r) => `${r.id}: ${r.title} [${r.status}]`);
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `${rows.length} contract(s) for ${targetClient.name}:\n${lines.join("\n")}\n\nTo draft a new one, open the contracts page (the builder is not exposed via chat — needs file generation).` });
            }
          }
        }

        // ── Lead messaging + smart navigation (Phase 2/3) ────────────────

        if (block.name === "send_lead_followup_now") {
          const { client_name, lead_id } = block.input as { client_name?: string; lead_id: string };
          const targetClient = await resolveCanvasClient(client_name);
          if (!targetClient) {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "No client context for the follow-up send." });
          } else {
            const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-followup`;
            try {
              const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: req.headers.get("Authorization") || "" },
                body: JSON.stringify({ lead_id, client_id: targetClient.id }),
              });
              const body = await res.json().catch(() => ({}));
              if (!res.ok || body?.success === false) {
                toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Send failed: ${body?.error ?? `HTTP ${res.status}`}. Surface as transient error.` });
              } else {
                toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Sent follow-up to lead ${lead_id} (attempt ${body?.attempt ?? "?"}). Tell the user it's out and let them know the next step in the sequence will fire automatically based on the lead's status.` });
              }
            } catch (err) {
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Send error: ${String(err).slice(0, 200)}` });
            }
          }
        }

        if (block.name === "open_followup_builder") {
          const { client_name } = block.input as { client_name?: string };
          const targetClient = await resolveCanvasClient(client_name);
          if (!targetClient) {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "No client to open the follow-up builder for." });
          } else {
            actions.push({ type: "navigate", path: `/clients/${targetClient.id}/followup-builder` });
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Opening ${targetClient.name}'s follow-up automation builder.` });
          }
        }

        if (block.name === "open_social_accounts_page") {
          const { client_name } = block.input as { client_name?: string };
          const targetClient = await resolveCanvasClient(client_name);
          if (!targetClient) {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "No client to open social accounts for." });
          } else {
            actions.push({ type: "navigate", path: `/clients/${targetClient.id}/social-accounts` });
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Opening ${targetClient.name}'s social accounts page. The actual connect/refresh OAuth flow happens in the browser there.` });
          }
        }

        if (block.name === "open_video_editor") {
          const { editing_queue_item_id } = block.input as { editing_queue_item_id: string };
          actions.push({ type: "navigate", path: `/editing/${editing_queue_item_id}/edit` });
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Opening the video editor for item ${editing_queue_item_id}. The user can caption, trim, and submit for review from there.` });
        }

        if (block.name === "open_booking_settings") {
          const { client_name } = block.input as { client_name?: string };
          const targetClient = await resolveCanvasClient(client_name);
          if (!targetClient) {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "No client to open booking settings for." });
          } else {
            actions.push({ type: "navigate", path: `/clients/${targetClient.id}/booking-settings` });
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Opening ${targetClient.name}'s booking settings.` });
          }
        }

        if (block.name === "open_master_editing_queue") {
          actions.push({ type: "navigate", path: "/editing-queue" });
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Opening the master editing queue (cross-client view).` });
        }

        if (block.name === "add_canvas_node") {
          const { client_name, node_type, data, position } = block.input as {
            client_name?: string; node_type: string; data: Record<string, unknown>; position?: { x: number; y: number };
          };
          const targetClient = await resolveCanvasClient(client_name);
          if (!targetClient) {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "No client to add the node to. Ask which client." });
          } else {
            const { data: canvasState } = await adminClient
              .from("canvas_states").select("id, nodes").eq("client_id", targetClient.id).eq("is_active", true).limit(1).maybeSingle();
            if (!canvasState) {
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `No active canvas for ${targetClient.name}. Have the user open Super Canvas first.` });
            } else {
              const existingNodes = Array.isArray(canvasState.nodes) ? canvasState.nodes : [];
              // Map our enum to the FE node `type` string and pick a reasonable
              // default position based on existing column counts.
              const typeMap: Record<string, string> = {
                brand_guide: "brandGuideNode",
                cta_builder: "ctaBuilderNode",
                hook_generator: "hookGeneratorNode",
                competitor_profile: "competitorProfileNode",
                competitor_folder: "competitorFolderNode",
                instagram_profile: "instagramProfileNode",
                annotation: "annotationNode",
                group: "groupNode",
              };
              const feType = typeMap[node_type];
              if (!feType) {
                toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Unknown node_type: ${node_type}. Valid: ${Object.keys(typeMap).join(", ")}.` });
              } else {
                const sameTypeCount = existingNodes.filter((n: any) => n.type === feType).length;
                const fallbackPos = {
                  x: 1000 + (sameTypeCount % 3) * 380,
                  y: Math.floor(sameTypeCount / 3) * 440,
                };
                const nodeId = `${feType}_${Date.now()}`;
                const newNode = {
                  id: nodeId,
                  type: feType,
                  position: position ?? fallbackPos,
                  data,
                };
                await adminClient.from("canvas_states").update({ nodes: [...existingNodes, newNode] }).eq("id", canvasState.id);
                if (!isOnAiSurface) actions.push({ type: "navigate", path: "/scripts?view=canvas" });
                toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `${feType} (id=${nodeId}) added to ${targetClient.name}'s canvas at (${newNode.position.x}, ${newNode.position.y}).` });
              }
            }
          }
        }

        if (block.name === "delete_canvas_node") {
          const { client_name, node_id } = block.input as { client_name?: string; node_id: string };
          const targetClient = await resolveCanvasClient(client_name);
          if (!targetClient) {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "No client to delete from." });
          } else {
            const { data: canvasState } = await adminClient
              .from("canvas_states").select("id, nodes").eq("client_id", targetClient.id).eq("is_active", true).limit(1).maybeSingle();
            if (!canvasState) {
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `No active canvas for ${targetClient.name}.` });
            } else {
              const existingNodes = Array.isArray(canvasState.nodes) ? canvasState.nodes : [];
              const filtered = existingNodes.filter((n: any) => n?.id !== node_id);
              if (filtered.length === existingNodes.length) {
                toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Node ${node_id} not found on ${targetClient.name}'s canvas.` });
              } else {
                await adminClient.from("canvas_states").update({ nodes: filtered }).eq("id", canvasState.id);
                toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Deleted node ${node_id} from ${targetClient.name}'s canvas.` });
              }
            }
          }
        }

        if (block.name === "move_canvas_node") {
          const { client_name, node_id, x, y } = block.input as { client_name?: string; node_id: string; x: number; y: number };
          const targetClient = await resolveCanvasClient(client_name);
          if (!targetClient) {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "No client to move on." });
          } else {
            const { data: canvasState } = await adminClient
              .from("canvas_states").select("id, nodes").eq("client_id", targetClient.id).eq("is_active", true).limit(1).maybeSingle();
            if (!canvasState) {
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `No active canvas for ${targetClient.name}.` });
            } else {
              const existingNodes = Array.isArray(canvasState.nodes) ? canvasState.nodes : [];
              let found = false;
              const updated = existingNodes.map((n: any) => {
                if (n?.id === node_id) {
                  found = true;
                  return { ...n, position: { x, y } };
                }
                return n;
              });
              if (!found) {
                toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Node ${node_id} not found.` });
              } else {
                await adminClient.from("canvas_states").update({ nodes: updated }).eq("id", canvasState.id);
                toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Moved ${node_id} to (${x}, ${y}).` });
              }
            }
          }
        }

        if (block.name === "save_video_to_vault") {
          const { client_name, viral_video_id, note } = block.input as { client_name?: string; viral_video_id: string; note?: string };
          const targetClient = await resolveCanvasClient(client_name);
          if (!targetClient) {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "No client to save to." });
          } else {
            const { error } = await adminClient
              .from("saved_videos")
              .upsert(
                { client_id: targetClient.id, viral_video_id, saved_by: user.id, note: note ?? null },
                { onConflict: "client_id,viral_video_id", ignoreDuplicates: false },
              );
            if (error) {
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Failed to save: ${error.message}` });
            } else {
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Saved video ${viral_video_id} to ${targetClient.name}'s vault.` });
            }
          }
        }

        if (block.name === "unsave_video_from_vault") {
          const { client_name, viral_video_id } = block.input as { client_name?: string; viral_video_id: string };
          const targetClient = await resolveCanvasClient(client_name);
          if (!targetClient) {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "No client to unsave from." });
          } else {
            await adminClient.from("saved_videos").delete().eq("client_id", targetClient.id).eq("viral_video_id", viral_video_id);
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Removed video ${viral_video_id} from ${targetClient.name}'s vault.` });
          }
        }

        if (block.name === "list_saved_videos") {
          const { client_name, limit = 20 } = block.input as { client_name?: string; limit?: number };
          const targetClient = await resolveCanvasClient(client_name);
          if (!targetClient) {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "No client to list for." });
          } else {
            const { data: rows } = await adminClient
              .from("saved_videos")
              .select("viral_video_id, note, saved_at, viral_videos(channel_username, platform, views_count, outlier_score, hook_text)")
              .eq("client_id", targetClient.id)
              .order("saved_at", { ascending: false })
              .limit(Math.min(Math.max(limit, 1), 50));
            if (!rows || rows.length === 0) {
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `${targetClient.name}'s vault is empty.` });
            } else {
              const lines = rows.map((r: any) => {
                const v = r.viral_videos;
                const meta = v ? `@${v.channel_username} · ${v.views_count?.toLocaleString() ?? "?"} views · ${v.outlier_score ?? "?"}x` : "(viral_video missing)";
                return `${r.viral_video_id} — ${meta}${r.note ? ` — note: ${r.note}` : ""}`;
              });
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `${rows.length} saved video(s) in ${targetClient.name}'s vault:\n${lines.join("\n")}` });
            }
          }
        }

        if (block.name === "switch_active_canvas") {
          const { client_name, canvas_id } = block.input as { client_name?: string; canvas_id: string };
          const targetClient = await resolveCanvasClient(client_name);
          if (!targetClient) {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "No client to switch canvases for." });
          } else {
            // Verify the target canvas belongs to this client.
            const { data: target } = await adminClient
              .from("canvas_states").select("id, name").eq("id", canvas_id).eq("client_id", targetClient.id).maybeSingle();
            if (!target) {
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Canvas ${canvas_id} not found for ${targetClient.name}.` });
            } else {
              // Deactivate the others, activate this one.
              await adminClient.from("canvas_states").update({ is_active: false }).eq("client_id", targetClient.id);
              await adminClient.from("canvas_states").update({ is_active: true }).eq("id", canvas_id);
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Activated canvas "${target.name ?? canvas_id}" for ${targetClient.name}.` });
            }
          }
        }

        if (block.name === "get_client_strategy") {
          const { client_name } = block.input;
          const targetClient = await lookupClient(client_name);

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

            // videoCount uses updated_at (when the edit became Done) instead
            // of created_at (when it was queued). Edits started in prior
            // months but completed THIS month should still count.
            // Plus surface in-progress + needs-revision so Robby can
            // honestly say "X done, Y in progress, Z need revision" instead
            // of falsely claiming "nothing in the editing queue".
            const [
              { count: scriptCount },
              { count: videoCount },
              { count: calCount },
              { count: editsInProgress },
              { count: editsNeedsRevision },
              { count: editsTotalQueued },
            ] = await Promise.all([
              adminClient.from("scripts").select("id", { count: "exact", head: true }).eq("client_id", targetClient.id).gte("created_at", iso),
              adminClient.from("video_edits").select("id", { count: "exact", head: true }).eq("client_id", targetClient.id).eq("status", "Done").is("deleted_at", null).gte("updated_at", iso),
              adminClient.from("video_edits").select("id", { count: "exact", head: true }).eq("client_id", targetClient.id).gte("schedule_date", iso.slice(0, 10)).is("deleted_at", null),
              adminClient.from("video_edits").select("id", { count: "exact", head: true }).eq("client_id", targetClient.id).is("deleted_at", null).neq("status", "Done").neq("status", "Needs Revision"),
              adminClient.from("video_edits").select("id", { count: "exact", head: true }).eq("client_id", targetClient.id).is("deleted_at", null).eq("status", "Needs Revision"),
              adminClient.from("video_edits").select("id", { count: "exact", head: true }).eq("client_id", targetClient.id).is("deleted_at", null).neq("status", "Done"),
            ]);

            const s = strat || { posts_per_month: 20, scripts_per_month: 20, videos_edited_per_month: 20, stories_per_week: 10, mix_reach: 60, mix_trust: 30, mix_convert: 10, manychat_active: false, manychat_keyword: null, cta_goal: "manychat", ads_active: false, ads_budget: 0, monthly_revenue_goal: 0, monthly_revenue_actual: 0 };

            const analysis = (s as any).audience_analysis;
            const summaryLines = [
              "Strategy for " + targetClient.name + ":",
              "Monthly targets: " + s.scripts_per_month + " scripts, " + s.videos_edited_per_month + " videos edited, " + s.posts_per_month + " posts scheduled",
              "This month so far: " + (scriptCount || 0) + " scripts, " + (videoCount || 0) + " videos completed, " + (calCount || 0) + " posts scheduled",
              "Editing queue right now: " + (editsTotalQueued || 0) + " total (" + (editsInProgress || 0) + " in progress, " + (editsNeedsRevision || 0) + " needs revision). DO NOT say 'nothing in the queue' if this is > 0.",
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
          const targetClient = await lookupClient(client_name);

          if (!targetClient) {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Client not found: " + client_name });
          } else {
            // Build the patch with validation. The model has a track record of
            // hallucinating numbers when "balancing the mix" — clamp anything
            // suspect before we commit it.
            const patch: Record<string, any> = { client_id: targetClient.id };
            const numericNonNeg = ["posts_per_month","scripts_per_month","videos_edited_per_month","stories_per_week","ads_budget","monthly_revenue_goal","monthly_revenue_actual"];
            const percentages = ["mix_reach","mix_trust","mix_convert"];
            const validationNotes: string[] = [];

            for (const f of numericNonNeg) {
              if (updates[f] !== undefined) {
                const n = Number(updates[f]);
                if (Number.isFinite(n) && n >= 0) patch[f] = Math.round(n);
                else validationNotes.push(`${f}=${updates[f]} (must be a non-negative number, ignored)`);
              }
            }
            for (const f of percentages) {
              if (updates[f] !== undefined) {
                const n = Number(updates[f]);
                if (Number.isFinite(n)) patch[f] = Math.max(0, Math.min(100, Math.round(n)));
                else validationNotes.push(`${f}=${updates[f]} (must be a number 0-100, ignored)`);
              }
            }
            // If all three mix percentages were touched and they sum to >100, warn but accept
            // (the model can fix on the next round). If <100, accept silently — the user may
            // be tweaking one slice.
            if (["mix_reach","mix_trust","mix_convert"].every((f) => updates[f] !== undefined)) {
              const sum = (patch.mix_reach ?? 0) + (patch.mix_trust ?? 0) + (patch.mix_convert ?? 0);
              if (sum > 100) {
                validationNotes.push(`mix percentages sum to ${sum}% (>100, will likely look wrong on the dashboard)`);
              }
            }
            // Booleans + free-text fields pass through as-is
            for (const f of ["manychat_active","ads_active"]) {
              if (updates[f] !== undefined) patch[f] = !!updates[f];
            }
            for (const f of ["manychat_keyword","cta_goal","primary_platform","ads_goal"]) {
              if (updates[f] !== undefined) patch[f] = updates[f];
            }
            // content_pillars is a TEXT[] array — accept array of strings, drop
            // non-strings defensively. Empty array clears the field.
            if (updates.content_pillars !== undefined) {
              if (Array.isArray(updates.content_pillars)) {
                patch.content_pillars = updates.content_pillars
                  .filter((s: unknown): s is string => typeof s === "string" && s.length > 0)
                  .slice(0, 8);
              } else {
                validationNotes.push(`content_pillars must be an array of strings, ignored`);
              }
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
              const notes = validationNotes.length > 0 ? ` (notes: ${validationNotes.join("; ")})` : "";
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Strategy updated for " + targetClient.name + ". Changed: " + changed + notes });
            }
          }
        }

        if (block.name === "get_client_info") {
          const { client_name } = block.input;
          // If the URL is locked, ignore the name and pull info for the locked
          // client directly. Otherwise name-match within the user's tenant.
          const baseQuery = adminClient.from("clients").select("name, email, onboarding_data");
          const { data: clientInfo } = await (lockedClient
            ? baseQuery.eq("id", lockedClient.id).maybeSingle()
            : baseQuery.eq("user_id", user.id).ilike("name", `%${client_name}%`).limit(1).maybeSingle());
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

        // (save_memory now handled by handleMemoryTool in tools/memories.ts)

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

        if (block.name === "open_client") {
          const { client_name } = block.input;
          const { data: targetClient } = await adminClient
            .from("clients")
            .select("id, name")
            .eq("user_id", user.id)
            .ilike("name", `%${client_name}%`)
            .limit(1)
            .maybeSingle();
          if (!targetClient) {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `No client found matching "${client_name}"` });
          } else {
            actions.push({ type: "open_client", client_id: targetClient.id });
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Navigating to ${targetClient.name}'s page.` });
          }
        }

        // Wave 2 + 3 + 4 module handlers — try each in order, use first non-null result.
        // lockedClient is set when the user is on /clients/<id>/* so tools that take
        // client_name will resolve to the URL-pinned client and ignore the model's
        // argument (prevents the AI from acting on a different client of the same user).
        const moduleCtx = {
          adminClient,
          userId: user.id,
          client,
          lockedClient: urlClientId ? { id: client.id, name: client.name } : null,
          isAdmin,
          accessibleClientIds,
          actions,
          currentPath: current_path,
        };
        const moduleResult =
          await handleLeadTool(block, moduleCtx) ??
          await handleFinanceTool(block, moduleCtx) ??
          await handleScriptTool(block, moduleCtx) ??
          await handleEditingTool(block, moduleCtx) ??
          await handleIntelligenceTool(block, moduleCtx) ??
          await handleClientTool(block, moduleCtx) ??
          await handleResearchTool(block, moduleCtx) ??
          await handleAnalyticsTool(block, moduleCtx) ??
          await handlePlanTool(block, moduleCtx);
        // handleMemoryTool removed while memory is disabled.
        if (moduleResult) toolResults.push(moduleResult);

        // Fallback: ensure every tool_use_id has a matching tool_result, otherwise
        // Anthropic's next-round request 400s with "tool_use without tool_result".
        if (!toolResults.some((r) => r.tool_use_id === block.id)) {
          console.warn(`[companion-chat] Unhandled tool call: ${block.name}`);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: `Tool "${block.name}" is not implemented or returned no result.`,
            is_error: true,
          });
        }
      }

      // Surface orchestrator-built script results directly if we don't have a text reply yet.
      const orchestratorResult = toolResults.find((r) =>
        typeof r.content === "string" && r.content.startsWith("BUILT a complete script")
      );
      if (orchestratorResult && !reply) reply = orchestratorResult.content;

      // Append this round's assistant turn + tool results to the conversation,
      // then loop so Claude can chain another tool or write a final reply.
      messages.push({ role: "assistant", content: result.content });
      messages.push({ role: "user", content: toolResults });
    }

    // H4: if we exhausted MAX_ROUNDS while still in tool_use, the model never
    // wrote a final text reply. Force one with tool_choice: none so the user
    // doesn't see a stuck-looking response.
    if (!reply) {
      try {
        const finalRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-6",
            max_tokens: 1024,
            system: buildCachedSystem(STATIC_SYSTEM_PROLOGUE, dynamicSystemContext),
            tools: buildCachedTools(TOOLS),
            tool_choice: { type: "none" },
            messages,
          }),
        });
        if (finalRes.ok) {
          const finalResult = await finalRes.json();
          const finalText = (finalResult.content || []).find(
            (b: any) => b.type === "text",
          );
          if (finalText?.text) reply = finalText.text;
        }
      } catch (e) {
        console.error("[companion-chat] Forced-text final round failed:", e);
      }
    }

    // Multi-target safety net: fire forced propose_plan retry in TWO cases —
    //   (a) the model returned empty reply (turn 1 bailed), OR
    //   (b) the model returned a banned preamble like "Here's the plan to
    //       delete both:" without actually calling propose_plan.
    // Both produce the same broken UX. See plan-preview spec 2026-05-16.
    const looksMultiTarget =
      /\b(trash|delete|remove|mark|set|move|reschedule|publish|schedule|change|borrar|borra|elimina|eliminar|publicar|publica|programar|programa|marcar|marca|cambiar|cambia|mover|mueve)\b[\s\S]*?(\b(these|those|all|every|both|estos|estas|esos|esas|todos|todas|ambos|ambas)\b|:)/i.test(message);
    const hasPlanProposal = actions.some((a: any) => a?.type === "plan_proposal");
    const replyIsBannedPreamble = !!reply && !hasPlanProposal && /\b(here'?s (the|my) plan|the plan (to|for|is)|i'?ll (set|mark|move|delete|trash|schedule|reschedule)|first i'?ll|then i'?ll|aqu[ií] (est[aá]|tienes?) (el|mi) plan|este es (el|mi) plan|el plan (es|para)|voy a (borrar|eliminar|publicar|programar|marcar|cambiar|mover))\b/i.test(reply);
    if ((!reply || replyIsBannedPreamble) && looksMultiTarget && !hasPlanProposal) {
      try {
          const forcedRes = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
              "anthropic-version": "2023-06-01",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "claude-sonnet-4-6",
              max_tokens: 1024,
              system: buildCachedSystem(STATIC_SYSTEM_PROLOGUE, dynamicSystemContext),
              tools: buildCachedTools(TOOLS),
              tool_choice: { type: "tool", name: "propose_plan" },
              messages,
            }),
          });
          if (forcedRes.ok) {
            const forcedResult = await forcedRes.json();
            for (const block of forcedResult.content || []) {
              if (block.type === "tool_use" && block.name === "propose_plan") {
                const moduleCtx = {
                  adminClient,
                  userId: user.id,
                  client,
                  lockedClient: urlClientId ? { id: client.id, name: client.name } : null,
                  isAdmin,
                  accessibleClientIds,
                  actions,
                };
                await handlePlanTool(block, moduleCtx as any);
                reply = ""; // plan card is self-sufficient; no text needed
                break;
              }
            }
          }
      } catch (e) {
        console.error("[companion-chat] Forced propose_plan retry failed:", e);
      }
    }

    // Approval safety net: when the model returned empty AND the user's
    // message looks like an approval of a previously-proposed plan
    // ("soft delete all", "yes", "approve", "sí", "dale", etc.), look up
    // the most recent pending plan for this client and force-call
    // confirm_plan with its id. Avoids the "I want to make sure I get the
    // right items" loop after the user already confirmed.
    const looksApproval =
      /^\s*(yes|yep|yeah|sure|ok|okay|go|do it|do them|delete (all|them)|trash (all|them)|soft delete (all|them)|approve|proceed|confirm|si|s[íi] dale|dale|h[aá]zlo|adelante|apru[eé]balo|aprobar|aprobado|aprueba|confirmar|confirma|hagamoslo|hag[áa]moslo)\b/i.test(message.trim());
    if (!reply && looksApproval && !hasPlanProposal) {
      try {
        const { data: pendingPlan } = await adminClient
          .from("pending_plans")
          .select("id")
          .eq("user_id", user.id)
          .eq("client_id", client.id)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (pendingPlan?.id) {
          const forcedRes = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
              "anthropic-version": "2023-06-01",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "claude-sonnet-4-6",
              max_tokens: 1024,
              system: buildCachedSystem(STATIC_SYSTEM_PROLOGUE, dynamicSystemContext),
              tools: buildCachedTools(TOOLS),
              tool_choice: { type: "tool", name: "confirm_plan" },
              messages: [
                ...messages,
                {
                  role: "user",
                  content: `(System) The user approved pending plan ${pendingPlan.id}. Call confirm_plan with that exact plan_id now, then execute every step.`,
                },
              ],
            }),
          });
          if (forcedRes.ok) {
            const forcedResult = await forcedRes.json();
            const moduleCtx = {
              adminClient,
              userId: user.id,
              client,
              lockedClient: urlClientId ? { id: client.id, name: client.name } : null,
              isAdmin,
              accessibleClientIds,
              actions,
              currentPath: current_path,
            };
            for (const block of forcedResult.content || []) {
              if (block.type === "tool_use" && block.name === "confirm_plan") {
                await handlePlanTool(block, moduleCtx as any);
                reply = ""; // confirmation is implicit via row mutation
                break;
              }
            }
          }
        }
      } catch (e) {
        console.error("[companion-chat] Forced confirm_plan retry failed:", e);
      }
    }

    // Viral-content safety net: when the model returns empty AND the user
    // asked for viral references / hooks / ideas / framework inspiration,
    // force one more round with tool_choice locked to find_viral_videos.
    // Failure mode in the wild: user says "give me 3 viral hooks for Boby"
    // when Boby isn't the active client → model can't infer niche → bails.
    const looksViralAsk =
      /\b(viral|hook|hooks|ideas?|references?|inspir|framework|references|guion(es)?|ganchos?|idea(s)?\s+(virales?|de\s+contenido))\b/i.test(message);
    if (!reply && looksViralAsk && !hasPlanProposal && !looksApproval) {
      try {
        const forcedRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-6",
            max_tokens: 1024,
            system: buildCachedSystem(STATIC_SYSTEM_PROLOGUE, dynamicSystemContext),
            tools: buildCachedTools(TOOLS),
            tool_choice: { type: "tool", name: "find_viral_videos" },
            messages,
          }),
        });
        if (forcedRes.ok) {
          const forcedResult = await forcedRes.json();
          // Let the next round summarize the find_viral_videos result. We push
          // the assistant turn + the tool_result back into messages, then ask
          // the model to write a final text reply without further tool calls.
          for (const block of forcedResult.content || []) {
            if (block.type === "tool_use" && block.name === "find_viral_videos") {
              const { topic, niche, content_format, platform, min_outlier = 3, days_back, limit = 8 } = block.input as any;
              // Run the same query the in-loop tool handler would have run.
              let query = adminClient
                .from("viral_videos")
                .select("id, channel_username, platform, caption, transcript, views_count, likes_count, comments_count, engagement_rate, outlier_score, video_url, thumbnail_url, hook_text, cta_text, framework_meta, content_format, primary_niche, posted_at, video_file_url")
                .gte("outlier_score", min_outlier ?? 3)
                .order("outlier_score", { ascending: false })
                .limit(Math.min(limit ?? 8, 25));
              if (niche) query = query.eq("primary_niche", String(niche).toLowerCase());
              if (content_format) query = query.eq("content_format", String(content_format).toLowerCase());
              if (platform) query = query.eq("platform", String(platform).toLowerCase());
              if (days_back) {
                const cutoff = new Date(Date.now() - days_back * 86_400_000).toISOString();
                query = query.gte("posted_at", cutoff);
              }
              if (topic) query = query.or(`caption.ilike.%${topic}%,transcript.ilike.%${topic}%`);
              const { data: viralRows } = await query;
              const compact = (viralRows || []).slice(0, 12).map((v: any) =>
                `@${v.channel_username} (${v.platform}) — ${(v.views_count ?? 0).toLocaleString()} views, ${v.outlier_score}x outlier — [${v.content_format ?? "?"} / ${v.primary_niche ?? "?"}]. Hook: ${(v.hook_text ?? "").slice(0, 120)} | Caption: ${(v.caption ?? "").slice(0, 120)}`
              ).join("\n");
              // Append assistant + tool_result + ask for final text.
              // Extract a count from the user's original message ("give me 3
              // hooks") so we can tell the model exactly how many items to
              // produce — and explicitly forbid [X]-style placeholders.
              const countMatch = message.match(/\b(\d+)\b/);
              const askedCount = countMatch ? Math.min(parseInt(countMatch[1], 10) || 3, 12) : 3;
              const wantsHooks = /\bhooks?\b|\bganchos?\b/i.test(message);
              const itemLabel = wantsHooks ? "hooks" : /\bidea/i.test(message) ? "ideas" : "items";
              const itemSingular = itemLabel.slice(0, -1);
              const formatGuidance = "\n\nUsing the references above as inspiration, write " +
                askedCount + " " + itemLabel + " tailored to the active client.\n" +
                "Format: a 1-2 sentence intro explaining what these are and the patterns you pulled from. " +
                "Then a numbered list — for each item, give a 1-2 sentence explanation of WHY it works " +
                "(referencing the viral pattern), then the actual " + itemSingular + " in quotes. " +
                "Use SPECIFIC client details from BRAND CONTEXT — NEVER use placeholder brackets like [X], [client], or <name>. " +
                "If you don't have a specific detail, omit it rather than templating.";
              const followupMessages = [
                ...messages,
                { role: "assistant", content: forcedResult.content },
                {
                  role: "user",
                  content: [
                    {
                      type: "tool_result",
                      tool_use_id: block.id,
                      content: (compact || "(no matching viral videos found)") + formatGuidance,
                    },
                  ],
                },
              ];
              const finalRes2 = await fetch("https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: {
                  "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
                  "anthropic-version": "2023-06-01",
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  model: "claude-sonnet-4-6",
                  max_tokens: 1024,
                  system: buildCachedSystem(STATIC_SYSTEM_PROLOGUE, dynamicSystemContext),
                  tools: buildCachedTools(TOOLS),
                  tool_choice: { type: "none" },
                  messages: followupMessages,
                }),
              });
              if (finalRes2.ok) {
                const finalResult2 = await finalRes2.json();
                const finalText2 = (finalResult2.content || []).find((b: any) => b.type === "text");
                if (finalText2?.text) reply = finalText2.text;
              }
              break;
            }
          }
        }
      } catch (e) {
        console.error("[companion-chat] Forced find_viral_videos retry failed:", e);
      }
    }

    if (!reply) {
      // If we tried both forced retries and still nothing produced a plan,
      // ask a useful clarifying question instead of the silent "rephrase
      // that". Skip the clarifying question if the user looked like they
      // were just approving — the generic message is less confusing there.
      const fallback = looksApproval
        ? "Let me try again — could you rephrase that?"
        : looksMultiTarget
        ? "I want to make sure I get the right items — can you list them by exact title, one per line?"
        : "Let me try again — could you rephrase that?";
      // If a tool fired user-visible embeds but the model produced no
      // follow-up text, synthesize a sensible default instead of asking
      // them to rephrase — the cards above are the answer.
      const embedReply = firedProfileAnalysis
        ? "Here's the breakdown. The card above shows the audience/uniqueness scores, hook patterns, and top posts — tell me what you want to dig into."
        : firedViralVideos > 0
          ? `Pulled ${firedViralVideos} viral reference${firedViralVideos === 1 ? "" : "s"} that match. Tell me which one you want to model the script after, or ask me to draft one off the top performer.`
          : null;
      reply = turn1Reply || embedReply || fallback;
    }

    // Save assistant reply
    await adminClient.from("companion_messages").insert({
      client_id: client.id,
      role: "assistant",
      content: reply,
    });

    // Phase A dual-write to the new unified tables (non-blocking on failure).
    const threadId = await dualWriteCompanionTurn(adminClient, {
      threadId: resolvedThreadId,
      userMessageText: message,
      assistantReplyText: reply,
    });

    emit({ type: "done", reply, actions, thread_id: threadId });
    return closeStream();
        } catch (err) {
          emit({ type: "error", message: String(err), status: 500 });
          return closeStream();
        }
      },
    }),
    { headers: SSE_HEADERS },
  );
});
