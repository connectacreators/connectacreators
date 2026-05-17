// render-worker/src/db.ts
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export type RenderJobRow = {
  id: string;
  editor_project_id: string;
  edl_snapshot: {
    source: { storage_path: string; duration_ms: number };
    aspect_ratio: string;
    clips: { id: string; source_start_ms: number; source_end_ms: number }[];
  };
  aspect_ratio: string;
  status: "queued" | "running" | "done" | "error";
};

export function makeClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
  return createClient(url, key, { auth: { persistSession: false } });
}

// Claim the oldest queued job atomically. Returns null if nothing to do.
export async function claimNextJob(client: SupabaseClient): Promise<RenderJobRow | null> {
  // Single-row UPDATE ... RETURNING via a transactional RPC would be ideal, but
  // a CTE-based update through the REST API works for one worker. With multiple
  // workers we'd add a Postgres function with FOR UPDATE SKIP LOCKED — Phase 1
  // assumes one worker, which the spec marks as acceptable.

  const { data: candidate } = await client
    .from("render_jobs")
    .select("id")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!candidate) return null;

  const { data: claimed, error } = await client
    .from("render_jobs")
    .update({ status: "running", claimed_at: new Date().toISOString(), progress: 1 })
    .eq("id", candidate.id)
    .eq("status", "queued")
    .select("id, editor_project_id, edl_snapshot, aspect_ratio, status")
    .maybeSingle();

  if (error) throw error;
  return (claimed as RenderJobRow | null) ?? null;
}

export async function updateProgress(client: SupabaseClient, id: string, progress: number) {
  await client.from("render_jobs").update({ progress }).eq("id", id);
}

export async function markDone(client: SupabaseClient, id: string, outputStoragePath: string) {
  await client
    .from("render_jobs")
    .update({
      status: "done",
      progress: 100,
      output_storage_path: outputStoragePath,
      finished_at: new Date().toISOString(),
    })
    .eq("id", id);
}

export async function markError(client: SupabaseClient, id: string, message: string) {
  await client
    .from("render_jobs")
    .update({
      status: "error",
      error_message: message.slice(0, 2000),
      finished_at: new Date().toISOString(),
    })
    .eq("id", id);
}
