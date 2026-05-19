// supabase/functions/companion-chat/mode-router.ts
//
// Keyword-based intent classifier. Picks one of ~10 modes from the user's
// message text; the dispatcher uses the picked mode to filter the full
// tool registry down to a relevant subset (mode tools + COMMON_TOOLS).
// Net effect: ~70% fewer tool definitions shipped to Claude per turn.
//
// If classification misfires, COMMON_TOOLS still includes navigate /
// client lookup / propose_plan / respond_to_user, so the model can
// always escape — and we ship a much broader "general" fallback when
// no keywords match.

export type Mode =
  | "editing"
  | "leads"
  | "discovery"
  | "scripts"
  | "canvas"
  | "profile-analysis"
  | "analytics"
  | "finance"
  | "intelligence"
  | "general";

/** Tools available in EVERY mode — navigation, client lookup, plan
 *  proposal, onboarding, memory. Adding to this is expensive; keep tight. */
export const COMMON_TOOLS: string[] = [
  "navigate_to_page",
  "open_client",
  "list_all_clients",
  "get_client_info",
  "get_client_strategy",
  "update_client_strategy",
  "fill_onboarding_fields",
  "propose_plan",
  "confirm_plan",
  "reject_plan",
  "respond_to_user",
  "create_client",
  "get_content_calendar",
];

/** Tools added on top of COMMON_TOOLS per mode. */
export const MODE_TOOLS: Record<Mode, string[]> = {
  editing: [
    "open_editing_item",
    "set_editing_queue_view",
    "set_lifecycle_status",
    "bulk_set_lifecycle_status",
    "set_deadline",
    "delete_editing_item",
    "restore_editing_item",
    "permanent_delete_editing_item",
    "set_caption",
    "rename_editing_item",
    "update_editing_status",
    "assign_editor",
    "add_revision_notes",
    "mark_post_published",
    "mark_done_and_published",
    "reschedule_post",
    "generate_caption",
    "bulk_reschedule_posts",
    "bulk_delete_editing_items",
    "bulk_assign_editor",
    "bulk_update_status",
    "get_editing_queue",
    "submit_to_editing_queue",
    "schedule_content",
  ],
  leads: [
    "get_leads",
    "get_pipeline_summary",
    "update_lead_status",
    "add_lead_notes",
    "create_lead",
    "bulk_update_lead_status",
    "draft_lead_outreach",
  ],
  discovery: [
    "find_viral_videos",
    "get_hooks",
    "scrape_viral_channel",
    "generate_ideas_from_viral",
    "deep_research",
  ],
  scripts: [
    "create_script",
    "list_client_scripts",
    "update_script_status",
    "mark_script_recorded",
    "delete_script",
  ],
  canvas: [
    "read_canvas",
    "create_canvas_note",
    "add_video_to_canvas",
    "add_research_note_to_canvas",
    "add_idea_nodes_to_canvas",
    "add_script_draft_to_canvas",
    "save_script_from_canvas",
    "add_canvas_node",
    "delete_canvas_node",
    "move_canvas_node",
    "switch_active_canvas",
  ],
  "profile-analysis": [
    "analyze_my_profile",
    "run_audience_analysis",
    "get_instagram_top_posts",
  ],
  analytics: [
    "get_post_performance",
    "compare_clients",
    "get_recent_activity",
    "generate_week_plan",
    "get_morning_brief",
    "get_overdue_items",
    "bulk_schedule_posts",
  ],
  finance: [
    "get_finances",
    "log_transaction",
    "get_revenue_vs_goal",
  ],
  intelligence: [
    "get_all_clients_status",
    "get_weekly_priorities",
    "get_contracts",
    "send_contract",
    "get_open_alerts",
    "dismiss_alert",
  ],
  // General fallback — broader cross-section so the model has options
  // when classification is ambiguous. Intentionally includes a handful
  // from several modes to handle "what should I do?" / "how are things?"
  // queries.
  general: [
    "find_viral_videos",
    "get_editing_queue",
    "get_leads",
    "list_client_scripts",
    "get_morning_brief",
    "get_overdue_items",
    "get_all_clients_status",
    "get_weekly_priorities",
    "get_open_alerts",
    "analyze_my_profile",
    "read_canvas",
  ],
};

/** Classify a user message into a mode. Order matters: more specific
 *  patterns first so they win over generic ones. */
export function classifyMode(message: string): Mode {
  const m = message.toLowerCase();
  // Most specific intents first
  if (/\b(viral|trending|outlier|inspirations?|references?|find videos?|reels? to model|reference reels?)\b/.test(m)) return "discovery";
  if (/\b(analyz\w*|audit|hook patterns?|format mix|outlier band|competitor.*profile|my profile|profile.*strategy|@\w+'s? profile)\b/.test(m)) return "profile-analysis";
  if (/\b(edit|reel|clip|footage|queue|caption|publish|render|assign editor|mark.*(done|published|in progress)|revision)\b/.test(m)) return "editing";
  if (/\b(lead|booking|prospect|outreach|follow.?up|pipeline|interested|sales call|book.*call)\b/.test(m)) return "leads";
  if (/\b(scripts?|draft|hook.*(body|cta)|write.*(content|idea|reel)|generate.*script)\b/.test(m)) return "scripts";
  if (/\b(canvas|sticky|brainstorm|board|idea node|research note|whiteboard)\b/.test(m)) return "canvas";
  if (/\b(brief|priorit\w*|alert\w*|weekly status|morning brief|today\b|recent|what.*happening|status update)\b/.test(m)) return "intelligence";
  if (/\b(revenue|finance|invoice|MRR|transaction|payment|paid|topup|credit\b)\b/.test(m)) return "finance";
  if (/\b(performance|views?|engagement|compare clients?|week plan|how.*doing|metric|stats)\b/.test(m)) return "analytics";
  if (/\b(hooks?\b)/.test(m)) return "discovery"; // "give me hooks" → discovery
  return "general";
}

/** Resolve the final tool-name allow-list for a classified mode. */
export function toolNamesForMode(mode: Mode): Set<string> {
  return new Set([...COMMON_TOOLS, ...MODE_TOOLS[mode]]);
}
