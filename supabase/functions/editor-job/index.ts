// supabase/functions/editor-job/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const ALLOWED_ASPECTS = new Set(["source", "9:16", "1:1", "16:9"]);

type Body = {
  editor_project_id: string;
  edl: unknown;
  aspect_ratio: string;
};

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  // Basic shape validation. Detailed EDL validation lives in later phases —
  // Phase 1 only enforces what the worker needs to run a trim.
  if (!body.editor_project_id || typeof body.editor_project_id !== "string") {
    return new Response("editor_project_id required", { status: 400 });
  }
  if (!ALLOWED_ASPECTS.has(body.aspect_ratio)) {
    return new Response("aspect_ratio invalid", { status: 400 });
  }
  if (!body.edl || typeof body.edl !== "object") {
    return new Response("edl required", { status: 400 });
  }
  const edl = body.edl as { source?: { storage_path?: string }; clips?: unknown[] };
  if (!edl.source?.storage_path || !Array.isArray(edl.clips) || edl.clips.length === 0) {
    return new Response("edl.source.storage_path and edl.clips required", { status: 400 });
  }

  // Confirm the project exists (RLS will further restrict to admin).
  const { data: project, error: projErr } = await supabase
    .from("editor_projects")
    .select("id")
    .eq("id", body.editor_project_id)
    .maybeSingle();
  if (projErr) return new Response(projErr.message, { status: 500 });
  if (!project) return new Response("project not found", { status: 404 });

  const { data: created, error: insertErr } = await supabase
    .from("render_jobs")
    .insert({
      editor_project_id: body.editor_project_id,
      edl_snapshot: body.edl,
      aspect_ratio: body.aspect_ratio,
      status: "queued",
    })
    .select("id, status, progress, output_storage_path, error_message, aspect_ratio, created_at, finished_at")
    .single();
  if (insertErr) return new Response(insertErr.message, { status: 500 });

  return new Response(JSON.stringify(created), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});
