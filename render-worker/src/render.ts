// render-worker/src/render.ts
import ffmpegPath from "ffmpeg-static";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (!ffmpegPath) throw new Error("ffmpeg-static did not resolve a binary path");

// Bundled fonts directory: Inter.ttf (variable) lives at
// render-worker/assets/fonts/. Passing it to libass via `fontsdir=` makes
// the subtitles filter use the exact same font file the browser preview
// loads (served as /fonts/Inter.ttf from public/), eliminating font fallback
// differences between Chrome and libass.
const FONTS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "assets",
  "fonts",
);

export type Clip = { source_start_ms: number; source_end_ms: number };

// Total output duration of the concatenated clips, in ms. Used by the caption
// generator and by callers that need to know the post-trim length.
export function totalOutputDurationMs(clips: Clip[]): number {
  return clips.reduce(
    (sum, c) => sum + Math.max(0, c.source_end_ms - c.source_start_ms),
    0,
  );
}

// Build an FFmpeg filter_complex string that trims each clip and concats them.
// If an ASS subtitle file is provided, append a `subtitles` filter on the
// concat output so captions burn into the final video.
export function buildTrimConcatArgs(
  input: string,
  clips: Clip[],
  output: string,
  options: { subtitlesAssPath?: string } = {},
): string[] {
  if (clips.length === 0) throw new Error("no clips");
  const trims = clips
    .map((c, i) => {
      const start = c.source_start_ms / 1000;
      const end = c.source_end_ms / 1000;
      return (
        `[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS[v${i}];` +
        `[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS[a${i}]`
      );
    })
    .join(";");
  const concatInputs = clips.map((_, i) => `[v${i}][a${i}]`).join("");
  // No captions: concat directly to [vout]. With captions: concat to [vraw]
  // and chain a subtitles filter that produces [vout]. Keeping the no-caption
  // path identical to the Phase 1 output keeps existing tests + behavior stable.
  const hasCaptions = !!options.subtitlesAssPath;
  const concatOutLabel = hasCaptions ? "[vraw]" : "[vout]";
  const concatFilter = `${concatInputs}concat=n=${clips.length}:v=1:a=1${concatOutLabel}[aout]`;

  let captionFilter = "";
  if (hasCaptions) {
    // ffmpeg's subtitles filter needs forward slashes and escaped colons —
    // ':' is an argument separator in the filtergraph syntax. Plain POSIX
    // paths rarely contain colons, but we escape defensively.
    const escapeForFilter = (p: string) =>
      p.replace(/\\/g, "/").replace(/:/g, "\\:");
    const escapedAss = escapeForFilter(options.subtitlesAssPath as string);
    const escapedFontsDir = escapeForFilter(FONTS_DIR);
    captionFilter =
      `;[vraw]subtitles='${escapedAss}':fontsdir='${escapedFontsDir}'[vout]`;
  }

  return [
    "-y",
    "-i", input,
    "-filter_complex", `${trims};${concatFilter}${captionFilter}`,
    "-map", "[vout]",
    "-map", "[aout]",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "20",
    "-c:a", "aac",
    "-movflags", "+faststart",
    output,
  ];
}

export async function runRender(
  input: string,
  clips: Clip[],
  output: string,
  options: { subtitlesAssPath?: string } = {},
): Promise<void> {
  await fs.mkdir(path.dirname(output), { recursive: true });
  const args = buildTrimConcatArgs(input, clips, output, options);
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(ffmpegPath as string, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`));
    });
  });
}
