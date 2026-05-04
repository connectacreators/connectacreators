// supabase/functions/_shared/assistant/mode.ts
import type { AssistantMode, AssistantSurface } from "./types.ts";

const CLIENT_PATH_RE = /^\/clients\/([^/?#]+)(?:[/?#].*)?$/;

/**
 * Pure function: derive the operating mode from a request path.
 * Client-mode iff the path starts with `/clients/<id>` (with `<id>` not equal to a known
 * agency-level segment). Otherwise agency.
 */
export function detectModeFromPath(path: string): AssistantMode {
  // Trim any host/origin prefix the caller might pass (defensive)
  const cleanPath = path.startsWith("http") ? new URL(path).pathname + (new URL(path).search ?? "") : path;
  const match = CLIENT_PATH_RE.exec(cleanPath);
  if (match && match[1] && match[1] !== "" && match[1] !== "/") {
    return { mode: "client", clientId: match[1] };
  }
  return { mode: "agency", clientId: null };
}

const SHARED_BOTH_MODES = [
  "save_memory",
  "navigate_to_page",
  "list_all_clients",
  "get_client_info",
  "find_viral_videos",
  "fill_onboarding_fields",
];

const CLIENT_ONLY = [
  "get_client_strategy",
  "get_scripts",
  "create_script",
  "schedule_content",
  "submit_to_editing_queue",
  "create_canvas_note",
  "add_video_to_canvas",
  "add_research_note",
  "add_idea_nodes",
  "add_script_draft",
];

const AGENCY_ONLY = [
  "get_editing_queue_cross_client",
];

const CLIENT_ALSO = [
  "get_editing_queue_single_client",
  "get_content_calendar",
];

const CANVAS_ONLY = [
  "generate_script_streaming",
];

export function toolsForMode(
  mode: AssistantMode,
  surface: AssistantSurface,
): string[] {
  const tools: string[] = [...SHARED_BOTH_MODES];
  if (mode.mode === "agency") {
    tools.push(...AGENCY_ONLY, "get_content_calendar");
  } else {
    tools.push(...CLIENT_ONLY, ...CLIENT_ALSO);
  }
  if (surface === "canvas") {
    tools.push(...CANVAS_ONLY);
  }
  return tools;
}
