// Map every companion-chat tool name → a scene hint the FE can render
// while the tool is executing. Used by companion-chat's SSE stream:
// before dispatching each tool, the function emits a scene event with
// {scene, verb, meta} so the FE shows a live progress indicator that
// matches what's actually happening instead of a rotating placeholder.
//
// The scene types match the BroadcastTurn SceneType in
// src/lib/companion/turn-script.ts. Verbs are short editorial phrases
// (EB Garamond italic on the FE). Meta lines are technical hints
// (JetBrains Mono small text).

export type SceneType =
  | "scanning"
  | "drafting"
  | "stats"
  | "video-analysis"
  | "thinking";

export interface SceneHint {
  scene: SceneType;
  verb: string;
  meta: string;
}

const TOOL_HINTS: Record<string, SceneHint> = {
  // ─── Lookup / read tools → scanning ────────────────────────────────────
  list_all_clients:      { scene: "scanning", verb: "Looking up your clients",         meta: "clients · list" },
  get_client_info:       { scene: "scanning", verb: "Reading the client file",         meta: "clients · single" },
  get_client_strategy:   { scene: "scanning", verb: "Reading your strategy",           meta: "client_strategies" },
  list_client_scripts:   { scene: "scanning", verb: "Pulling up the scripts",          meta: "scripts · list" },
  find_viral_videos:     { scene: "scanning", verb: "Searching Viral Today",           meta: "viral_videos · query" },
  analyze_my_profile:    { scene: "video-analysis", verb: "Analyzing your profile",      meta: "fetch-profile-top-posts · top 10" },
  get_hooks:             { scene: "scanning", verb: "Gathering hook templates",        meta: "viral_hooks" },
  get_editing_queue:     { scene: "scanning", verb: "Checking the editing queue",      meta: "editing_queue" },
  get_content_calendar:  { scene: "stats",    verb: "Pulling the content calendar",    meta: "scheduled_posts" },
  read_canvas:           { scene: "scanning", verb: "Reading the canvas",              meta: "canvas_states" },
  get_open_alerts:       { scene: "scanning", verb: "Reading open alerts",             meta: "alerts · open" },
  get_leads:             { scene: "scanning", verb: "Reading leads",                   meta: "leads" },
  get_finances:          { scene: "stats",    verb: "Pulling financials",              meta: "finance_entries" },
  get_editor_workload:   { scene: "stats",    verb: "Weighing editor workload",        meta: "team_members" },

  // ─── Write tools → drafting ────────────────────────────────────────────
  create_script:               { scene: "drafting", verb: "Drafting the script",            meta: "scripts · insert" },
  draft_script:                { scene: "drafting", verb: "Drafting hook · body · CTA",     meta: "claude · live" },
  fill_onboarding_fields:      { scene: "drafting", verb: "Filling onboarding fields",      meta: "onboarding_data" },
  update_client_strategy:      { scene: "drafting", verb: "Updating client strategy",       meta: "client_strategies" },
  create_canvas_note:          { scene: "drafting", verb: "Adding a canvas note",           meta: "canvas_states" },
  add_research_note_to_canvas: { scene: "drafting", verb: "Adding research to canvas",      meta: "canvas_states" },
  add_idea_nodes_to_canvas:    { scene: "drafting", verb: "Sketching ideas on canvas",      meta: "canvas_states" },
  add_script_draft_to_canvas:  { scene: "drafting", verb: "Adding script draft to canvas",  meta: "canvas_states" },
  generate_script_ideas:       { scene: "drafting", verb: "Generating ideas",               meta: "haiku · 5 ideas" },
  templatize_script:           { scene: "drafting", verb: "Templatizing the script",        meta: "scripts · template" },

  // ─── Status / action tools → thinking ──────────────────────────────────
  schedule_content:            { scene: "thinking", verb: "Scheduling the post",            meta: "scheduled_posts" },
  schedule_post_after_save:    { scene: "thinking", verb: "Scheduling the post",            meta: "scheduled_posts" },
  submit_to_editing_queue:     { scene: "thinking", verb: "Sending to editing",             meta: "editing_queue · insert" },
  submit_to_editing_after_save: { scene: "thinking", verb: "Sending to editing",            meta: "editing_queue · insert" },
  mark_post_published:         { scene: "thinking", verb: "Marking as published",           meta: "scheduled_posts" },
  update_editing_status:       { scene: "thinking", verb: "Updating editing status",        meta: "editing_queue" },
  update_lead_status:          { scene: "thinking", verb: "Updating lead status",           meta: "leads" },
  add_video_to_canvas:         { scene: "thinking", verb: "Adding the video to canvas",     meta: "canvas_states" },
  add_canvas_node:             { scene: "drafting", verb: "Adding the node to canvas",      meta: "canvas_states" },
  delete_canvas_node:          { scene: "thinking", verb: "Removing the node",              meta: "canvas_states" },
  move_canvas_node:            { scene: "thinking", verb: "Moving the node",                meta: "canvas_states" },
  switch_active_canvas:        { scene: "thinking", verb: "Switching canvases",             meta: "canvas_states" },
  save_script_from_canvas:     { scene: "thinking", verb: "Saving the script",              meta: "scripts · insert" },
  save_video_to_vault:         { scene: "thinking", verb: "Saving to vault",                meta: "saved_videos" },
  unsave_video_from_vault:     { scene: "thinking", verb: "Removing from vault",            meta: "saved_videos" },
  list_saved_videos:           { scene: "scanning", verb: "Reading your vault",             meta: "saved_videos" },
  send_lead_followup_now:      { scene: "thinking", verb: "Sending the follow-up",          meta: "send-followup" },
  open_followup_builder:       { scene: "thinking", verb: "Opening follow-up builder",      meta: "navigation" },
  open_social_accounts_page:   { scene: "thinking", verb: "Opening social accounts",        meta: "navigation" },
  open_video_editor:           { scene: "thinking", verb: "Opening the video editor",       meta: "navigation" },
  open_booking_settings:       { scene: "thinking", verb: "Opening booking settings",       meta: "navigation" },
  open_master_editing_queue:   { scene: "thinking", verb: "Opening the master queue",       meta: "navigation" },
  save_script:                 { scene: "thinking", verb: "Saving the script",              meta: "scripts · insert" },
  navigate_to_page:            { scene: "thinking", verb: "Heading there",                  meta: "navigation" },
  open_client:                 { scene: "thinking", verb: "Opening the client",             meta: "navigation" },
  respond_to_user:             { scene: "thinking", verb: "Composing the reply",            meta: "claude · text" },
  search_viral_frameworks:     { scene: "scanning", verb: "Searching frameworks",           meta: "viral_videos · framework" },

  // ─── Plan/confirm tools → thinking ─────────────────────────────────────
  propose_plan:                { scene: "thinking", verb: "Drafting a plan",                meta: "plan · proposal" },
  confirm_plan:                { scene: "thinking", verb: "Executing the plan",             meta: "plan · execute" },
  reject_plan:                 { scene: "thinking", verb: "Cancelling the plan",            meta: "plan · cancel" },

  // ─── Bulk operations → drafting (looks like a lot of writing) ─────────
  bulk_schedule_posts:         { scene: "drafting", verb: "Scheduling posts",               meta: "bulk · scheduled_posts" },
  bulk_assign_editor:          { scene: "drafting", verb: "Assigning editors",              meta: "bulk · editing_queue" },
  bulk_update_status:          { scene: "drafting", verb: "Updating items",                 meta: "bulk · status" },
  bulk_reschedule_posts:       { scene: "drafting", verb: "Rescheduling posts",             meta: "bulk · scheduled_posts" },
  bulk_delete_editing_items:   { scene: "drafting", verb: "Cleaning up the queue",          meta: "bulk · editing_queue" },

  // ─── Video framework / categorize → video-analysis ─────────────────────
  set_caption:                 { scene: "drafting", verb: "Editing the caption",            meta: "scripts" },
  rename_editing_item:         { scene: "drafting", verb: "Renaming the item",              meta: "editing_queue" },
  highlight_items:             { scene: "thinking", verb: "Highlighting items",             meta: "ui · highlight" },
};

/**
 * Returns a scene hint for the given tool name. Falls back to a generic
 * "thinking" scene if the tool isn't mapped — safe default for any new
 * tool added without an explicit hint.
 */
export function toolToScene(toolName: string): SceneHint {
  return TOOL_HINTS[toolName] ?? {
    scene: "thinking",
    verb: "Working",
    meta: toolName,
  };
}
