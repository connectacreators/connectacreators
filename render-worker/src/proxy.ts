// render-worker/src/proxy.ts
import ffmpegPath from "ffmpeg-static";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

if (!ffmpegPath) throw new Error("ffmpeg-static did not resolve a binary path");

/** Mirror a source object key into the proxy bucket, forcing a .mp4 extension. */
export function proxyPathFor(sourcePath: string): string {
  const dir = path.posix.dirname(sourcePath);
  const base = path.posix.basename(sourcePath);
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const name = `${stem}.mp4`;
  return dir === "." ? name : `${dir}/${name}`;
}

/**
 * ffmpeg args for a 720p web-preview proxy: H.264 video, AAC audio, moov atom
 * at the front (+faststart) so playback starts without a full download.
 * `scale=-2:'min(720,ih)'` caps height at 720p, keeps aspect, and never
 * upscales a smaller source. Re-encoding to H.264 also fixes HEVC sources.
 *
 * `ultrafast` (vs the old `veryfast`) is the single biggest lever on
 * time-to-playable: the encode dominates proxy wall-clock for large 4K
 * originals, and at 720p the quality is more than enough for a review preview.
 *
 * When `input` is an http(s) URL, ffmpeg streams the original straight from the
 * signed source URL instead of us pre-downloading it — the network read
 * overlaps the encode and we never buffer a multi-GB original into worker
 * memory. The `-reconnect*` flags ride out transient drops on long reads and
 * are only valid for network protocols, so they're omitted for file inputs.
 */
export function buildProxyArgs(input: string, output: string): string[] {
  const isUrl = /^https?:\/\//i.test(input);
  const inputOpts = isUrl
    ? ["-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "5"]
    : [];
  return [
    ...inputOpts,
    "-i", input,
    "-vf", "scale=-2:'min(720,ih)'",
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-crf", "23",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    "-y",
    output,
  ];
}

/** Transcode `input` to a proxy at `output`. Throws on non-zero ffmpeg exit. */
export async function runProxy(input: string, output: string): Promise<void> {
  await fs.mkdir(path.dirname(output), { recursive: true });
  const args = buildProxyArgs(input, output);
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(ffmpegPath as string, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg proxy exited ${code}: ${stderr.slice(-500)}`));
    });
  });
}
