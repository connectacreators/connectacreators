// Frontend mirror of supabase/functions/_shared/tool-to-scene.ts.
// Used by the streaming consumer to fall back gracefully if the backend
// somehow emits a scene event without a hint (e.g. older deploys).

import type { SceneType } from "./turn-script";

export interface SceneHint {
  scene: SceneType;
  verb: string;
  meta: string;
}

const TOOL_HINTS: Record<string, SceneHint> = {
  list_all_clients:      { scene: "scanning", verb: "Looking up your clients",         meta: "clients · list" },
  get_client_info:       { scene: "scanning", verb: "Reading the client file",         meta: "clients · single" },
  get_client_strategy:   { scene: "scanning", verb: "Reading your strategy",           meta: "client_strategies" },
  list_client_scripts:   { scene: "scanning", verb: "Pulling up the scripts",          meta: "scripts · list" },
  find_viral_videos:     { scene: "scanning", verb: "Searching Viral Today",           meta: "viral_videos · query" },
  get_hooks:             { scene: "scanning", verb: "Gathering hook templates",        meta: "viral_hooks" },
  get_editing_queue:     { scene: "scanning", verb: "Checking the editing queue",      meta: "editing_queue" },
  get_content_calendar:  { scene: "stats",    verb: "Pulling the content calendar",    meta: "scheduled_posts" },
  read_canvas:           { scene: "scanning", verb: "Reading the canvas",              meta: "canvas_states" },
  create_script:         { scene: "drafting", verb: "Drafting the script",             meta: "scripts · insert" },
  draft_script:          { scene: "drafting", verb: "Drafting hook · body · CTA",      meta: "claude · live" },
  fill_onboarding_fields:{ scene: "drafting", verb: "Filling onboarding fields",       meta: "onboarding_data" },
  schedule_content:      { scene: "thinking", verb: "Scheduling the post",             meta: "scheduled_posts" },
  submit_to_editing_queue:{ scene: "thinking", verb: "Sending to editing",             meta: "editing_queue · insert" },
  navigate_to_page:      { scene: "thinking", verb: "Heading there",                   meta: "navigation" },
  respond_to_user:       { scene: "thinking", verb: "Composing the reply",             meta: "claude · text" },
};

export function toolToScene(toolName: string): SceneHint {
  return TOOL_HINTS[toolName] ?? {
    scene: "thinking",
    verb: "Working",
    meta: toolName,
  };
}
