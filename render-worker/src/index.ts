// render-worker/src/index.ts
// Env comes from systemd's EnvironmentFile in prod and from the shell (or a
// manually sourced .env) in dev. No dotenv dependency — keeps the package
// lean and the runtime requirements explicit.
import path from "node:path";
import { promises as fs } from "node:fs";
import {
  claimNextJob,
  makeClient,
  markDone,
  markError,
  updateProgress,
  type RenderJobRow,
} from "./db.js";
import { downloadToFile, uploadFile } from "./storage.js";
import { runRender } from "./render.js";

const POLL_MS = Number(process.env.POLL_INTERVAL_MS ?? 4000);
const WORK_DIR = process.env.WORK_DIR ?? "/tmp/connecta-renders";
const SOURCE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "footage";
const OUT_BUCKET = process.env.SUPABASE_OUTPUT_BUCKET ?? "footage";

async function processJob(client: ReturnType<typeof makeClient>, job: RenderJobRow) {
  const workDir = path.join(WORK_DIR, job.id);
  const input = path.join(workDir, "input.mp4");
  const output = path.join(workDir, "output.mp4");
  await fs.mkdir(workDir, { recursive: true });

  await updateProgress(client, job.id, 5);
  await downloadToFile(client, SOURCE_BUCKET, job.edl_snapshot.source.storage_path, input);

  await updateProgress(client, job.id, 20);
  await runRender(input, job.edl_snapshot.clips, output);

  await updateProgress(client, job.id, 80);
  const outPath = `renders/${job.editor_project_id}/${job.id}.mp4`;
  await uploadFile(client, OUT_BUCKET, outPath, output);

  await markDone(client, job.id, outPath);

  // Best-effort cleanup; failures here are non-fatal.
  await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
}

async function tick(client: ReturnType<typeof makeClient>) {
  const job = await claimNextJob(client);
  if (!job) return;
  try {
    await processJob(client, job);
  } catch (err) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
    console.error(`[render-worker] job ${job.id} failed:`, msg);
    await markError(client, job.id, msg);
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
