// render-worker/src/db.ts
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import ws from "ws";

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
  // Node 20 lacks native WebSocket; supply the ws polyfill so supabase-js's
  // realtime client can initialize even though the worker doesn't use realtime.
  return createClient(url, key, {
    auth: { persistSession: false },
    realtime: { transport: ws as unknown as typeof WebSocket },
  });
}

// Reclaim "running" jobs that haven't progressed in `staleMs` and put them
// back in the queue. Called on each tick — survives worker restarts that
// would otherwise orphan in-flight jobs at their last-known progress.
export async function reclaimOrphanedJobs(client: SupabaseClient, staleMs = 60_000) {
  const cutoff = new Date(Date.now() - staleMs).toISOString();
  // Render jobs: anything 'running' with claimed_at older than staleMs goes
  // back to 'queued'. The next claim will pick it up.
  await client
    .from("render_jobs")
    .update({ status: "queued", claimed_at: null, progress: 0 })
    .eq("status", "running")
    .lt("claimed_at", cutoff);
  await client
    .from("transcribe_jobs")
    .update({ status: "queued", claimed_at: null, progress: 0 })
    .eq("status", "running")
    .lt("claimed_at", cutoff);
  await client
    .from("audio_import_jobs")
    .update({ status: "queued", claimed_at: null, progress: 0 })
    .eq("status", "running")
    .lt("claimed_at", cutoff);
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

// ---- Transcribe jobs ----

export type TranscribeJobRow = {
  id: string;
  video_edit_id: string;
  status: "queued" | "running" | "done" | "error";
};

export async function claimNextTranscribeJob(client: SupabaseClient): Promise<TranscribeJobRow | null> {
  const { data: candidate } = await client
    .from("transcribe_jobs")
    .select("id")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!candidate) return null;

  const { data: claimed, error } = await client
    .from("transcribe_jobs")
    .update({ status: "running", claimed_at: new Date().toISOString(), progress: 1 })
    .eq("id", candidate.id)
    .eq("status", "queued")
    .select("id, video_edit_id, status")
    .maybeSingle();
  if (error) throw error;
  return (claimed as TranscribeJobRow | null) ?? null;
}

export async function updateTranscribeProgress(client: SupabaseClient, id: string, progress: number) {
  await client.from("transcribe_jobs").update({ progress }).eq("id", id);
}

export async function markTranscribeDone(client: SupabaseClient, id: string) {
  await client
    .from("transcribe_jobs")
    .update({ status: "done", progress: 100, finished_at: new Date().toISOString() })
    .eq("id", id);
}

export async function markTranscribeError(client: SupabaseClient, id: string, message: string) {
  await client
    .from("transcribe_jobs")
    .update({
      status: "error",
      error_message: message.slice(0, 2000),
      finished_at: new Date().toISOString(),
    })
    .eq("id", id);
}

export async function saveTranscript(
  client: SupabaseClient,
  videoEditId: string,
  words: { text: string; start_ms: number; end_ms: number }[],
  provider: "openai" | "deepgram",
) {
  // upsert by video_edit_id
  await client
    .from("transcripts")
    .upsert({ video_edit_id: videoEditId, words, provider }, { onConflict: "video_edit_id" });
}

export async function saveSilenceSegments(
  client: SupabaseClient,
  videoEditId: string,
  segments: { start_ms: number; end_ms: number }[],
  minDurationMs: number,
  noiseDb: number,
) {
  // Replace any prior segments for this video — current threshold values
  // overwrite previous detection runs.
  await client.from("silence_segments").delete().eq("video_edit_id", videoEditId);
  if (segments.length === 0) return;
  await client.from("silence_segments").insert(
    segments.map((s) => ({
      video_edit_id: videoEditId,
      start_ms: s.start_ms,
      end_ms: s.end_ms,
      min_duration_ms: minDurationMs,
      noise_db: noiseDb,
    })),
  );
}

// Fetch the source storage_path for a video_edit. The worker resolves the
// storage path itself rather than trusting client-supplied state.
// ---- Audio-import jobs ----

export type AudioImportJobRow = {
  id: string;
  video_edit_id: string;
  url: string;
  status: "queued" | "running" | "done" | "error";
};

export async function claimNextAudioImportJob(client: SupabaseClient): Promise<AudioImportJobRow | null> {
  const { data: candidate } = await client
    .from("audio_import_jobs")
    .select("id")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!candidate) return null;

  const { data: claimed, error } = await client
    .from("audio_import_jobs")
    .update({ status: "running", claimed_at: new Date().toISOString(), progress: 1 })
    .eq("id", candidate.id)
    .eq("status", "queued")
    .select("id, video_edit_id, url, status")
    .maybeSingle();
  if (error) throw error;
  return (claimed as AudioImportJobRow | null) ?? null;
}

export async function updateAudioImportProgress(client: SupabaseClient, id: string, progress: number) {
  await client.from("audio_import_jobs").update({ progress }).eq("id", id);
}

export async function markAudioImportDone(
  client: SupabaseClient,
  id: string,
  outputStoragePath: string,
  durationMs: number,
) {
  await client
    .from("audio_import_jobs")
    .update({
      status: "done",
      progress: 100,
      output_storage_path: outputStoragePath,
      duration_ms: durationMs,
      finished_at: new Date().toISOString(),
    })
    .eq("id", id);
}

export async function markAudioImportError(client: SupabaseClient, id: string, message: string) {
  await client
    .from("audio_import_jobs")
    .update({
      status: "error",
      error_message: message.slice(0, 2000),
      finished_at: new Date().toISOString(),
    })
    .eq("id", id);
}

export async function getVideoEditStoragePath(client: SupabaseClient, videoEditId: string): Promise<string | null> {
  const { data } = await client
    .from("video_edits")
    .select("storage_path")
    .eq("id", videoEditId)
    .maybeSingle();
  return (data as { storage_path: string | null } | null)?.storage_path ?? null;
}
