// render-worker/src/index.ts
// In dev, load .env.local from the worker dir so local OpenAI / Supabase keys
// flow in without manual shell exports. In prod (systemd) the EnvironmentFile
// already sets these, and dotenv's `override: false` keeps system env winning.
import "dotenv/config";
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: false });

import { promises as fs } from "node:fs";
import {
  claimNextJob,
  claimNextTranscribeJob,
  getVideoEditStoragePath,
  makeClient,
  markDone,
  markError,
  markTranscribeDone,
  markTranscribeError,
  reclaimOrphanedJobs,
  saveSilenceSegments,
  saveTranscript,
  updateProgress,
  updateTranscribeProgress,
  type RenderJobRow,
  type TranscribeJobRow,
} from "./db.js";
// Audio-import jobs are now handled synchronously inside the
// `import-audio-from-url` edge function via the VPS yt-dlp service —
// the worker no longer participates in that flow.
import { downloadToFile } from "./storage.js";
import { uploadFile } from "./storage.js";
import { runRender, totalOutputDurationMs, type BRollInput } from "./render.js";
import { detectSilences, extractAudio, transcribeWithWhisper } from "./transcribe.js";
import { writeAssFile, type Caption, type TextOverlay } from "./captions.js";

const POLL_MS = Number(process.env.POLL_INTERVAL_MS ?? 4000);
const WORK_DIR = process.env.WORK_DIR ?? "/tmp/connecta-renders";
const SOURCE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "footage";
const OUT_BUCKET = process.env.SUPABASE_OUTPUT_BUCKET ?? "footage";
const SILENCE_NOISE_DB = Number(process.env.SILENCE_NOISE_DB ?? -30);
const SILENCE_MIN_MS = Number(process.env.SILENCE_MIN_MS ?? 400);

async function processRenderJob(client: ReturnType<typeof makeClient>, job: RenderJobRow) {
  const workDir = path.join(WORK_DIR, job.id);
  const input = path.join(workDir, "input.mp4");
  const output = path.join(workDir, "output.mp4");
  await fs.mkdir(workDir, { recursive: true });

  await updateProgress(client, job.id, 5);
  await downloadToFile(client, SOURCE_BUCKET, job.edl_snapshot.source.storage_path, input);

  // If the EDL ships captions, write an .ass file and pass it to the
  // renderer so they burn in. Output duration is what the captions clip to.
  const captions: Caption[] = (job.edl_snapshot as { captions?: Caption[] }).captions ?? [];
  const overlays: TextOverlay[] = (job.edl_snapshot as { text_overlays?: TextOverlay[] }).text_overlays ?? [];
  const music = (job.edl_snapshot as {
    music?: { storage_path: string; volume: number; music_start_ms?: number };
  }).music;
  const outputDurationMs = totalOutputDurationMs(job.edl_snapshot.clips);
  const assPath = path.join(workDir, "captions.ass");
  const { hadCaptions } = await writeAssFile(
    assPath,
    captions,
    job.edl_snapshot.clips,
    outputDurationMs,
    overlays,
  );

  // Optionally pull the music track to local disk so ffmpeg can ingest it.
  let musicPath: string | undefined;
  if (music?.storage_path) {
    musicPath = path.join(workDir, "music" + path.extname(music.storage_path));
    await downloadToFile(client, SOURCE_BUCKET, music.storage_path, musicPath);
  }

  // Download each b-roll clip locally; the filter graph needs file paths.
  type BRollEdl = {
    id: string;
    source_storage_path: string;
    source_duration_ms: number;
    trim_start_ms: number;
    trim_end_ms: number;
    output_start_ms: number;
    mode: "fullscreen" | "pip";
    position: { x_pct: number; y_pct: number; width_pct: number };
  };
  const brollEdls: BRollEdl[] =
    (job.edl_snapshot as { b_roll?: BRollEdl[] }).b_roll ?? [];
  const brolls: BRollInput[] = [];
  for (let i = 0; i < brollEdls.length; i++) {
    const br = brollEdls[i];
    const localPath = path.join(workDir, `broll-${i}` + path.extname(br.source_storage_path));
    await downloadToFile(client, SOURCE_BUCKET, br.source_storage_path, localPath);
    brolls.push({
      id: br.id,
      local_path: localPath,
      source_duration_ms: br.source_duration_ms,
      trim_start_ms: br.trim_start_ms,
      trim_end_ms: br.trim_end_ms,
      output_start_ms: br.output_start_ms,
      mode: br.mode,
      position: br.position,
    });
  }

  await updateProgress(client, job.id, 20);
  await runRender(input, job.edl_snapshot.clips, output, {
    subtitlesAssPath: hadCaptions ? assPath : undefined,
    aspectRatio: job.aspect_ratio as "source" | "9:16" | "1:1" | "16:9",
    musicPath,
    musicVolume: music?.volume,
    musicStartMs: music?.music_start_ms,
    brolls,
  });

  await updateProgress(client, job.id, 80);
  const outPath = `renders/${job.editor_project_id}/${job.id}.mp4`;
  await uploadFile(client, OUT_BUCKET, outPath, output);

  await markDone(client, job.id, outPath);

  await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
}

async function processTranscribeJob(client: ReturnType<typeof makeClient>, job: TranscribeJobRow) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set on worker");

  const storagePath = await getVideoEditStoragePath(client, job.video_edit_id);
  if (!storagePath) throw new Error(`video_edit ${job.video_edit_id} has no storage_path`);

  const workDir = path.join(WORK_DIR, `transcribe-${job.id}`);
  const videoPath = path.join(workDir, "input.mp4");
  const audioPath = path.join(workDir, "audio.mp3");
  await fs.mkdir(workDir, { recursive: true });

  await updateTranscribeProgress(client, job.id, 5);
  await downloadToFile(client, SOURCE_BUCKET, storagePath, videoPath);

  await updateTranscribeProgress(client, job.id, 25);
  await extractAudio(videoPath, audioPath);

  await updateTranscribeProgress(client, job.id, 45);
  const words = await transcribeWithWhisper(audioPath, apiKey);
  await saveTranscript(client, job.video_edit_id, words, "openai");

  await updateTranscribeProgress(client, job.id, 80);
  const silences = await detectSilences(audioPath, {
    noiseDb: SILENCE_NOISE_DB,
    minDurationMs: SILENCE_MIN_MS,
  });
  await saveSilenceSegments(client, job.video_edit_id, silences, SILENCE_MIN_MS, SILENCE_NOISE_DB);

  await markTranscribeDone(client, job.id);

  await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
}

async function tick(client: ReturnType<typeof makeClient>) {
  await reclaimOrphanedJobs(client).catch((e) => {
    console.error("[render-worker] orphan reclaim failed", e);
  });

  // Render jobs first — they're user-facing exports. Transcribe + audio
  // imports are background and yield to renders.
  const render = await claimNextJob(client);
  if (render) {
    try {
      await processRenderJob(client, render);
    } catch (err) {
      const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
      console.error(`[render-worker] render ${render.id} failed:`, msg);
      await markError(client, render.id, msg);
    }
    return;
  }

  const tj = await claimNextTranscribeJob(client);
  if (tj) {
    try {
      await processTranscribeJob(client, tj);
    } catch (err) {
      const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
      console.error(`[render-worker] transcribe ${tj.id} failed:`, msg);
      await markTranscribeError(client, tj.id, msg);
    }
  }
}

async function main() {
  const client = makeClient();
  console.log(`[render-worker] starting; poll=${POLL_MS}ms`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await tick(client);
    } catch (e) {
      console.error("[render-worker] tick crashed", e);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main().catch((e) => {
  console.error("[render-worker] fatal", e);
  process.exit(1);
});
