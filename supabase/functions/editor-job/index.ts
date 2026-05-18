// supabase/functions/editor-job/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { corsHeaders } from "../_shared/cors.ts";

const ALLOWED_ASPECTS = new Set(["source", "9:16", "1:1", "16:9"]);

type Body = {
  editor_project_id: string;
  edl: unknown;
  aspect_ratio: string;
};

function text(body: string, status: number) {
  return new Response(body, { status, headers: corsHeaders });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return text("method not allowed", 405);
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
    return text("invalid json", 400);
  }

  if (!body.editor_project_id || typeof body.editor_project_id !== "string") {
    return text("editor_project_id required", 400);
  }
  if (!ALLOWED_ASPECTS.has(body.aspect_ratio)) {
    return text("aspect_ratio invalid", 400);
  }
  if (!body.edl || typeof body.edl !== "object") {
    return text("edl required", 400);
  }
  const edl = body.edl as { source?: { storage_path?: string }; clips?: unknown[] };
  if (!edl.source?.storage_path || !Array.isArray(edl.clips) || edl.clips.length === 0) {
    return text("edl.source.storage_path and edl.clips required", 400);
  }

  const { data: project, error: projErr } = await supabase
    .from("editor_projects")
    .select("id")
    .eq("id", body.editor_project_id)
    .maybeSingle();
  if (projErr) return text(projErr.message, 500);
  if (!project) return text("project not found", 404);

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
  if (insertErr) return text(insertErr.message, 500);

  return new Response(JSON.stringify(created), {
    status: 200,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
});
