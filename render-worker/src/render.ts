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

// One b-roll clip with a downloaded local path. The worker handles input
// indexing — first b-roll is input #2 (if music exists it's #1).
export type BRollInput = {
  id: string;
  local_path: string;
  source_duration_ms: number;
  trim_start_ms: number;
  trim_end_ms: number;
  output_start_ms: number;
  mode: "fullscreen" | "pip";
  position: { x_pct: number; y_pct: number; width_pct: number };
};

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
    musicVolume?: number;        // 0..1
    musicStartMs?: number;       // offset into the music file (skip first N ms)
    brolls?: BRollInput[];
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
  const brolls = options.brolls ?? [];
  const hasBroll = brolls.length > 0;

  // Stage 1: concat outputs. The video flows: concat → reframe → broll
  // overlays → subtitles → [vout]. We only allocate intermediate labels for
  // the stages we actually need so the no-options case still produces the
  // exact same filtergraph as Phase 1.
  const concatVideoOut = wantsReframe || hasCaptions || hasBroll ? "[vConcat]" : "[vout]";
  const concatAudioOut = hasMusic ? "[aConcat]" : "[aout]";
  const concatFilter = `${concatInputs}concat=n=${clips.length}:v=1:a=1${concatVideoOut}${concatAudioOut}`;

  // Output dimensions after stage 2. Used to size pip b-rolls (width_pct of
  // the output width). When no reframe, we don't know the exact dims at
  // graph-build time, so pip uses iw/ih expressions at runtime instead.
  const targetDims = wantsReframe
    ? ASPECT_DIMS[aspect as Exclude<AspectRatio, "source">]
    : null;

  // Stage 2: aspect-ratio reframe (scale + crop).
  let reframeFilter = "";
  if (wantsReframe) {
    const { w, h } = targetDims!;
    const reframeOut = hasBroll || hasCaptions ? "[vReframed]" : "[vout]";
    reframeFilter = `;[vConcat]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}${reframeOut}`;
  }

  // Stage 2.5: b-roll overlays. Each b-roll is trimmed and either fully
  // covers the main video or sits as a PIP box, enabled only during its
  // output-time window.
  let brollFilter = "";
  let brollVideoLabel = wantsReframe ? "[vReframed]" : "[vConcat]";
  if (hasBroll) {
    const segments: string[] = [];
    // Each b-roll is a separate input. With music as #1, b-rolls start at
    // #2; without music they start at #1.
    const brollInputStart = hasMusic ? 2 : 1;
    brolls.forEach((br, i) => {
      const inputIdx = brollInputStart + i;
      const trimSec = (br.trim_start_ms / 1000).toFixed(3);
      const trimEnd = (br.trim_end_ms / 1000).toFixed(3);
      const startSec = (br.output_start_ms / 1000).toFixed(3);
      const durSec = ((br.trim_end_ms - br.trim_start_ms) / 1000).toFixed(3);
      const endSec = ((br.output_start_ms + (br.trim_end_ms - br.trim_start_ms)) / 1000).toFixed(3);

      // Trim + reset timestamps; shift PTS to the output start so overlay
      // can synchronize. For fullscreen, scale to target dims (covers full
      // frame); for pip, scale width to width_pct of base width.
      if (br.mode === "fullscreen") {
        const scaleW = targetDims ? targetDims.w : 1920;
        const scaleH = targetDims ? targetDims.h : 1080;
        segments.push(
          `[${inputIdx}:v]trim=start=${trimSec}:end=${trimEnd},setpts=PTS-STARTPTS+${startSec}/TB,scale=${scaleW}:${scaleH}:force_original_aspect_ratio=increase,crop=${scaleW}:${scaleH}[br${i}]`,
        );
      } else {
        // PIP: width = width_pct of main width; height auto.
        const widthExpr = targetDims
          ? `${Math.round((br.position.width_pct / 100) * targetDims.w)}`
          : `iw*${(br.position.width_pct / 100).toFixed(3)}`;
        segments.push(
          `[${inputIdx}:v]trim=start=${trimSec}:end=${trimEnd},setpts=PTS-STARTPTS+${startSec}/TB,scale=${widthExpr}:-2[br${i}]`,
        );
      }

      // Overlay onto the running base. Each overlay produces a new base
      // label so we can chain across multiple b-rolls.
      const overlayIn = i === 0 ? brollVideoLabel : `[vBR${i - 1}]`;
      const isLast = i === brolls.length - 1;
      const overlayOut = isLast && !hasCaptions ? "[vout]" : `[vBR${i}]`;
      const enable = `between(t,${startSec},${endSec})`;
      let xy: string;
      if (br.mode === "fullscreen") {
        xy = "x=0:y=0";
      } else {
        // Center the pip box at (x_pct, y_pct) of the main frame.
        xy = `x=(W*${(br.position.x_pct / 100).toFixed(3)})-w/2:y=(H*${(br.position.y_pct / 100).toFixed(3)})-h/2`;
      }
      segments.push(
        `${overlayIn}[br${i}]overlay=${xy}:enable='${enable}'${overlayOut}`,
      );

      brollVideoLabel = overlayOut;
    });
    brollFilter = ";" + segments.join(";");
  }

  // Stage 3: burn-in subtitles (last video step).
  let captionFilter = "";
  if (hasCaptions) {
    const escapeForFilter = (p: string) =>
      p.replace(/\\/g, "/").replace(/:/g, "\\:");
    const escapedAss = escapeForFilter(options.subtitlesAssPath as string);
    const escapedFontsDir = escapeForFilter(FONTS_DIR);
    const subsIn = brollVideoLabel; // whatever the latest video label is
    captionFilter = `;${subsIn}subtitles='${escapedAss}':fontsdir='${escapedFontsDir}'[vout]`;
  }

  // Audio: optionally mix the music track. Source audio stays at full
  // volume; music is attenuated by musicVolume (0..1). B-roll audio is
  // dropped in v1 (only video is overlaid).
  let musicFilter = "";
  if (hasMusic) {
    const vol = Math.max(0, Math.min(1, options.musicVolume ?? 0.3));
    const startSec = ((options.musicStartMs ?? 0) / 1000).toFixed(3);
    // Skip into the music file via atrim, then volume + resample, then mix.
    musicFilter =
      `;[1:a]atrim=start=${startSec},asetpts=PTS-STARTPTS,volume=${vol},aresample=async=1[aMusic]` +
      `;[aConcat][aMusic]amix=inputs=2:dropout_transition=0:duration=first[aout]`;
  }

  const fc = `${trims};${concatFilter}${reframeFilter}${brollFilter}${captionFilter}${musicFilter}`;

  // Inputs: source video first, optional music second, then b-rolls.
  const inputArgs: string[] = ["-i", input];
  if (hasMusic) inputArgs.push("-i", options.musicPath as string);
  for (const br of brolls) inputArgs.push("-i", br.local_path);

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
    musicStartMs?: number;
    brolls?: BRollInput[];
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
