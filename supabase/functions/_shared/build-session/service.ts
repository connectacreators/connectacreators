// supabase/functions/_shared/build-session/service.ts
// DB CRUD wrappers + row mapping for companion_build_sessions.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import type { BuildSession, BuildStatus } from "./types.ts";

export function rowToBuildSession(row: Record<string, unknown>): BuildSession {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    clientId: row.client_id as string,
    threadId: row.thread_id as string,
    canvasStateId: (row.canvas_state_id as string | null) ?? null,
    status: row.status as BuildStatus,
    phase: (row.phase as string) ?? "",
    ideas: (row.ideas as BuildSession["ideas"]) ?? [],
    currentIdeaIndex: (row.current_idea_index as number) ?? 0,
    selectedIdeas: (row.selected_ideas as BuildSession["selectedIdeas"]) ?? [],
    currentFrameworkVideoId: (row.current_framework_video_id as string | null) ?? null,
    currentScriptDraft: (row.current_script_draft as string | null) ?? null,
    currentScriptId: (row.current_script_id as string | null) ?? null,
    cachedCanvasContext: (row.cached_canvas_context as string | null) ?? null,
    cachedCanvasContextAt: (row.cached_canvas_context_at as string | null) ?? null,
    autoPilot: (row.auto_pilot as boolean) ?? false,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function createBuildSession(
  client: SupabaseClient,
  init: {
    userId: string;
    clientId: string;
    threadId: string;
    canvasStateId?: string | null;
    autoPilot?: boolean;
  },
): Promise<BuildSession> {
  const { data, error } = await client
    .from("companion_build_sessions")
    .insert({
      user_id: init.userId,
      client_id: init.clientId,
      thread_id: init.threadId,
      canvas_state_id: init.canvasStateId ?? null,
      auto_pilot: init.autoPilot ?? false,
    })
    .select("*")
    .single();
  if (error) throw new Error(`createBuildSession: ${error.message}`);
  return rowToBuildSession(data as Record<string, unknown>);
}

export async function getBuildSession(
  client: SupabaseClient,
  id: string,
): Promise<BuildSession | null> {
  const { data, error } = await client
    .from("companion_build_sessions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getBuildSession: ${error.message}`);
  return data ? rowToBuildSession(data as Record<string, unknown>) : null;
}

export async function getActiveBuildSessionForThread(
  client: SupabaseClient,
  threadId: string,
): Promise<BuildSession | null> {
  const { data, error } = await client
    .from("companion_build_sessions")
    .select("*")
    .eq("thread_id", threadId)
    .in("status", ["running", "paused"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getActiveBuildSessionForThread: ${error.message}`);
  return data ? rowToBuildSession(data as Record<string, unknown>) : null;
}

export interface UpdateBuildSessionPatch {
  status?: BuildSession["status"];
  phase?: string;
  clientId?: string;
  canvasStateId?: string | null;
  autoPilot?: boolean;
  ideas?: BuildSession["ideas"];
  currentIdeaIndex?: number;
  selectedIdeas?: BuildSession["selectedIdeas"];
  currentFrameworkVideoId?: string | null;
  currentScriptDraft?: string | null;
  currentScriptId?: string | null;
  cachedCanvasContext?: string | null;
  cachedCanvasContextAt?: string | null;
}

export async function updateBuildSession(
  client: SupabaseClient,
  id: string,
  patch: UpdateBuildSessionPatch,
): Promise<BuildSession> {
  const dbPatch: Record<string, unknown> = {};
  if (patch.status !== undefined) dbPatch.status = patch.status;
  if (patch.phase !== undefined) dbPatch.phase = patch.phase;
  if (patch.clientId !== undefined) dbPatch.client_id = patch.clientId;
  if (patch.canvasStateId !== undefined) dbPatch.canvas_state_id = patch.canvasStateId;
  if (patch.autoPilot !== undefined) dbPatch.auto_pilot = patch.autoPilot;
  if (patch.ideas !== undefined) dbPatch.ideas = patch.ideas;
  if (patch.currentIdeaIndex !== undefined) dbPatch.current_idea_index = patch.currentIdeaIndex;
  if (patch.selectedIdeas !== undefined) dbPatch.selected_ideas = patch.selectedIdeas;
  if (patch.currentFrameworkVideoId !== undefined) dbPatch.current_framework_video_id = patch.currentFrameworkVideoId;
  if (patch.currentScriptDraft !== undefined) dbPatch.current_script_draft = patch.currentScriptDraft;
  if (patch.currentScriptId !== undefined) dbPatch.current_script_id = patch.currentScriptId;
  if (patch.cachedCanvasContext !== undefined) dbPatch.cached_canvas_context = patch.cachedCanvasContext;
  if (patch.cachedCanvasContextAt !== undefined) dbPatch.cached_canvas_context_at = patch.cachedCanvasContextAt;
  const { data, error } = await client
    .from("companion_build_sessions")
    .update(dbPatch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`updateBuildSession: ${error.message}`);
  return rowToBuildSession(data as Record<string, unknown>);
}
