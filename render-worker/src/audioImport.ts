// render-worker/src/audioImport.ts
// Extracts audio from a public URL (TikTok / Instagram Reel / YouTube /
// direct media link) using yt-dlp, then probes the MP3 duration.
// yt-dlp must be on PATH (install via `brew install yt-dlp` on macOS or
// `pip install -U yt-dlp` on Linux).
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";

if (!ffmpegPath) throw new Error("ffmpeg-static did not resolve a binary path");

export type AudioImportResult = {
  filePath: string;       // local mp3 path
  durationMs: number;
};

export async function extractAudioFromUrl(url: string, workDir: string): Promise<AudioImportResult> {
  await fs.mkdir(workDir, { recursive: true });
  // -x = extract audio; --audio-format mp3 forces mp3 even from native formats.
  // -o template makes yt-dlp emit a predictable filename.
  const outTemplate = path.join(workDir, "audio.%(ext)s");
  const args = [
    "-x",
    "--audio-format", "mp3",
    "--audio-quality", "192K",
    "-o", outTemplate,
    "--no-playlist",
    "--no-warnings",
    "--restrict-filenames",
    url,
  ];

  const stderr = await new Promise<string>((resolve, reject) => {
    const proc = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    proc.stdout.on("data", (d) => { out += d.toString(); });
    proc.stderr.on("data", (d) => { err += d.toString(); });
    proc.on("error", (e) => reject(new Error(`yt-dlp spawn failed: ${e.message}. Install with 'brew install yt-dlp'.`)));
    proc.on("close", (code) => {
      if (code === 0) resolve(out + err);
      else reject(new Error(`yt-dlp exited ${code}: ${(err || out).slice(-500)}`));
    });
  });
  void stderr;

  const filePath = path.join(workDir, "audio.mp3");
  // Sanity-check that the file landed.
  await fs.access(filePath);

  // Probe duration via ffprobe-equivalent (ffmpeg with no output, parse stderr).
  const durationMs = await probeDurationMs(filePath);
  return { filePath, durationMs };
}

function probeDurationMs(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath as string, ["-i", filePath], { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    proc.stderr.on("data", (d) => { err += d.toString(); });
    proc.on("error", reject);
    // ffmpeg with no output args returns non-zero, but stderr has duration.
    proc.on("close", () => {
      const m = err.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
      if (!m) return reject(new Error("could not parse duration"));
      const h = parseInt(m[1]);
      const min = parseInt(m[2]);
      const s = parseInt(m[3]);
      const cs = parseInt(m[4]);
      resolve(h * 3600000 + min * 60000 + s * 1000 + cs * 10);
    });
  });
}
