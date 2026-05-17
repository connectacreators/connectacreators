// src/lib/videoEditor/editorProjectsApi.ts
import { supabase } from "@/integrations/supabase/client";
import type { EDL } from "./edl";

export type EditorProject = {
  id: string;
  video_edit_id: string;
  edl: EDL;
  updated_at: string;
};

export async function loadEditorProject(videoEditId: string): Promise<EditorProject | null> {
  const { data, error } = await supabase
    .from("editor_projects")
    .select("id, video_edit_id, edl, updated_at")
    .eq("video_edit_id", videoEditId)
    .maybeSingle();
  if (error) throw error;
  return data as EditorProject | null;
}

export async function upsertEditorProject(params: {
  videoEditId: string;
  edl: EDL;
}): Promise<EditorProject> {
  const { data, error } = await supabase
    .from("editor_projects")
    .upsert(
      { video_edit_id: params.videoEditId, edl: params.edl },
      { onConflict: "video_edit_id" },
    )
    .select("id, video_edit_id, edl, updated_at")
    .single();
  if (error) throw error;
  return data as EditorProject;
}
