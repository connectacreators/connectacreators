// src/lib/videoEditor/renderJobsApi.ts
import { supabase } from "@/integrations/supabase/client";
import type { EDL, AspectRatio } from "./edl";

export type RenderJob = {
  id: string;
  status: "queued" | "running" | "done" | "error";
  progress: number;
  output_storage_path: string | null;
  error_message: string | null;
  aspect_ratio: AspectRatio;
  created_at: string;
  finished_at: string | null;
};

export async function submitRenderJob(params: {
  editorProjectId: string;
  edl: EDL;
  aspectRatio: AspectRatio;
}): Promise<RenderJob> {
  const { data, error } = await supabase.functions.invoke("editor-job", {
    body: {
      editor_project_id: params.editorProjectId,
      edl: params.edl,
      aspect_ratio: params.aspectRatio,
    },
  });
  if (error) throw error;
  return data as RenderJob;
}

export async function fetchRenderJob(id: string): Promise<RenderJob> {
  const { data, error } = await supabase
    .from("render_jobs")
    .select("id, status, progress, output_storage_path, error_message, aspect_ratio, created_at, finished_at")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as RenderJob;
}
