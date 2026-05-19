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

export type AspectRatio = "source" | "9:16" | "1:1" | "16:9";

// Target dimensions per aspect ratio. Standard short-form sizes; source
// passes through with no reframing.
const ASPECT_DIMS: Record<Exclude<AspectRatio, "source">, { w: number; h: number }> = {
  "9:16": { w: 1080, h: 1920 },
  "1:1": { w: 1080, h: 1080 },
  "16:9": { w: 1920, h: 1080 },
};

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
// concat output so captions burn into the final video. If an aspect ratio
// is requested, scale+crop the concatenated video to that target. If a
// music path is provided, mix it under the source audio.
export function buildTrimConcatArgs(
  input: string,
  clips: Clip[],
  output: string,
  options: {
    subtitlesAssPath?: string;
    aspectRatio?: AspectRatio;
    musicPath?: string;
    musicVolume?: number; // 0..1
  } = {},
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

  // Pipeline stages downstream of concat. We build them by string-appending
  // labels: v0 → vTrim (after aspect reframe) → vSubs (after subtitles).
  // Audio similarly: a0 → aFinal (after music mix).
  const aspect = options.aspectRatio ?? "source";
  const wantsReframe = aspect !== "source";
  const hasCaptions = !!options.subtitlesAssPath;
  const hasMusic = !!options.musicPath;

  // Stage 1: concat outputs.
  const concatVideoOut = wantsReframe || hasCaptions ? "[vConcat]" : "[vout]";
  const concatAudioOut = hasMusic ? "[aConcat]" : "[aout]";
  const concatFilter = `${concatInputs}concat=n=${clips.length}:v=1:a=1${concatVideoOut}${concatAudioOut}`;

  // Stage 2: aspect-ratio reframe (scale + crop).
  let reframeFilter = "";
  if (wantsReframe) {
    const { w, h } = ASPECT_DIMS[aspect as Exclude<AspectRatio, "source">];
    const out = hasCaptions ? "[vReframed]" : "[vout]";
    reframeFilter = `;[vConcat]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}${out}`;
  }

  // Stage 3: burn-in subtitles (last video step).
  let captionFilter = "";
  if (hasCaptions) {
    const escapeForFilter = (p: string) =>
      p.replace(/\\/g, "/").replace(/:/g, "\\:");
    const escapedAss = escapeForFilter(options.subtitlesAssPath as string);
    const escapedFontsDir = escapeForFilter(FONTS_DIR);
    const subsIn = wantsReframe ? "[vReframed]" : "[vConcat]";
    captionFilter = `;${subsIn}subtitles='${escapedAss}':fontsdir='${escapedFontsDir}'[vout]`;
  }

  // Audio: optionally mix the music track. Source audio stays at full
  // volume; music is attenuated by musicVolume (0..1).
  let musicFilter = "";
  if (hasMusic) {
    const vol = Math.max(0, Math.min(1, options.musicVolume ?? 0.3));
    // The music input is the second `-i` (index 1).
    musicFilter =
      `;[1:a]volume=${vol},aresample=async=1[aMusic]` +
      `;[aConcat][aMusic]amix=inputs=2:dropout_transition=0:duration=first[aout]`;
  }

  const fc = `${trims};${concatFilter}${reframeFilter}${captionFilter}${musicFilter}`;

  // Inputs: source video first, optional music second.
  const inputArgs: string[] = ["-i", input];
  if (hasMusic) inputArgs.push("-i", options.musicPath as string);

  return [
    "-y",
    ...inputArgs,
    "-filter_complex", fc,
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
  options: {
    subtitlesAssPath?: string;
    aspectRatio?: AspectRatio;
    musicPath?: string;
    musicVolume?: number;
  } = {},
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
