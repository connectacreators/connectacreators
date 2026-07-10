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

// ffprobe-static doesn't ship a portable binary on the VPS reliably; we
// shell out to the system ffprobe (apt-installed alongside ffmpeg) for
// dim detection only. Fall back to env override if PATH doesn't have it.
const FFPROBE_PATH = process.env.FFPROBE_PATH ?? "ffprobe";

export type Clip = {
  source_start_ms: number;
  source_end_ms: number;
  // 1.0 = normal speed. Omitted = 1.0. Applied via setpts + atempo.
  playback_speed?: number;
  // Outgoing transition to the NEXT clip. Currently only "fade" (dip to
  // black) is supported. Ignored on the last clip.
  transition_out?: { kind: "fade"; duration_ms: number };
};

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
  // Higher = rendered later in the overlay chain = visible ON TOP. Used
  // to disambiguate overlapping b-rolls. Omitted defaults to 0.
  z_index?: number;
};

// Target dimensions per aspect ratio. Standard short-form sizes; source
// passes through with no reframing.
const ASPECT_DIMS: Record<Exclude<AspectRatio, "source">, { w: number; h: number }> = {
  "9:16": { w: 1080, h: 1920 },
  "1:1":  { w: 1080, h: 1080 },
  "16:9": { w: 1920, h: 1080 },
};

// Output duration of a single clip, accounting for playback_speed.
function clipOutputMs(c: Clip): number {
  const sourceLen = Math.max(0, c.source_end_ms - c.source_start_ms);
  const speed = c.playback_speed && c.playback_speed > 0 ? c.playback_speed : 1;
  return sourceLen / speed;
}

// Total output duration of the concatenated clips, in ms. Used by the caption
// generator and by callers that need to know the post-trim length.
export function totalOutputDurationMs(clips: Clip[]): number {
  return clips.reduce((sum, c) => sum + clipOutputMs(c), 0);
}

// ffprobe a video file → {w,h} pixel dims of the first video stream.
// Used when aspect="source" so b-roll overlays scale to the actual source
// canvas (not the 1920×1080 fallback that clipped portrait sources).
export async function probeVideoDims(input: string): Promise<{ w: number; h: number }> {
  const args = [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height",
    "-of", "csv=p=0:s=x",
    input,
  ];
  const out = await new Promise<string>((resolve, reject) => {
    const proc = spawn(FFPROBE_PATH, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`ffprobe exited ${code}: ${stderr.slice(-400)}`));
    });
  });
  const m = out.trim().match(/^(\d+)x(\d+)/);
  if (!m) throw new Error(`ffprobe could not parse dims from "${out}"`);
  return { w: parseInt(m[1], 10), h: parseInt(m[2], 10) };
}

// Build an FFmpeg filter_complex string that trims each clip, applies any
// per-clip speed change and fade-out transition, concats them, then layers
// reframe → b-roll → subtitles → loudnorm → music mix in that order.
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
    musicFadeInMs?: number;      // ramp music in from silence at the output start
    musicFadeOutMs?: number;     // ramp to silence at the output end
    brolls?: BRollInput[];
    // Probed dimensions of the source video. Required to scale fullscreen
    // b-roll correctly when aspect="source" (otherwise we'd guess 1920×1080
    // and crop portrait sources). For non-source aspects this is ignored.
    sourceDims?: { w: number; h: number };
    // When true, run the source audio through ffmpeg's `loudnorm` filter
    // targeting -16 LUFS (TikTok/Instagram spec). Defaults off so legacy
    // EDLs without an explicit setting keep the same loudness.
    loudnessNormalize?: boolean;
  } = {},
): string[] {
  if (clips.length === 0) throw new Error("no clips");

  // Per-clip trim + speed + fade. Each clip's output streams are labeled
  // [vN] / [aN] for the concat stage to swallow. Fades are applied AFTER
  // setpts so start_time values are in OUTPUT seconds (already speed-adjusted).
  const trimSegments: string[] = [];
  clips.forEach((c, i) => {
    const start = c.source_start_ms / 1000;
    const end = c.source_end_ms / 1000;
    const speed = c.playback_speed && c.playback_speed > 0 ? c.playback_speed : 1;
    const outSec = clipOutputMs(c) / 1000;

    // Speed: setpts=PTS/speed makes the clip play faster (PTS smaller =
    // frames closer together); atempo does the same for audio. atempo's
    // valid range is [0.5, 100] in modern ffmpeg — outside that the
    // worker errors, which is correct (UI clamps to [0.25, 4] anyway,
    // and we chain atempo for sub-0.5).
    const vSetPts = speed === 1 ? "setpts=PTS-STARTPTS" : `setpts=(PTS-STARTPTS)/${speed}`;
    // For audio speeds <0.5 chain two atempo filters (each constrained to
    // [0.5, 2.0]) — e.g. 0.25× = atempo=0.5,atempo=0.5.
    const aSpeedChain = (() => {
      if (speed === 1) return "";
      if (speed >= 0.5 && speed <= 2.0) return `,atempo=${speed}`;
      // Decompose into a chain of [0.5..2.0] factors.
      let remaining = speed;
      const parts: number[] = [];
      while (remaining < 0.5) { parts.push(0.5); remaining /= 0.5; }
      while (remaining > 2.0) { parts.push(2.0); remaining /= 2.0; }
      parts.push(remaining);
      return "," + parts.map((p) => `atempo=${p}`).join(",");
    })();

    // Outgoing fade for the transition to the next clip. start_time is in
    // OUTPUT seconds relative to this clip's start.
    const outDurMs = c.transition_out?.kind === "fade"
      ? Math.min(c.transition_out.duration_ms, clipOutputMs(c))
      : 0;
    // Incoming fade from the previous clip's transition (mirror of its
    // transition_out so the dip-to-black ramps back up at this clip's
    // start). Skip on the first clip.
    const prev = i > 0 ? clips[i - 1] : null;
    const inDurMs = prev?.transition_out?.kind === "fade"
      ? Math.min(prev.transition_out.duration_ms, clipOutputMs(c))
      : 0;

    const vFades: string[] = [];
    const aFades: string[] = [];
    if (inDurMs > 0) {
      vFades.push(`fade=in:st=0:d=${(inDurMs / 1000).toFixed(3)}`);
      aFades.push(`afade=in:st=0:d=${(inDurMs / 1000).toFixed(3)}`);
    }
    if (outDurMs > 0) {
      const st = ((outSec * 1000 - outDurMs) / 1000).toFixed(3);
      const d = (outDurMs / 1000).toFixed(3);
      vFades.push(`fade=out:st=${st}:d=${d}`);
      aFades.push(`afade=out:st=${st}:d=${d}`);
    }
    const vFadeStr = vFades.length ? "," + vFades.join(",") : "";
    const aFadeStr = aFades.length ? "," + aFades.join(",") : "";

    trimSegments.push(
      `[0:v]trim=start=${start}:end=${end},${vSetPts}${vFadeStr}[v${i}]`,
    );
    trimSegments.push(
      `[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS${aSpeedChain}${aFadeStr}[a${i}]`,
    );
  });
  const trims = trimSegments.join(";");
  const concatInputs = clips.map((_, i) => `[v${i}][a${i}]`).join("");

  // Pipeline stages downstream of concat. We build them by string-appending
  // labels: v0 → vTrim (after aspect reframe) → vSubs (after subtitles).
  // Audio similarly: a0 → aFinal (after music mix).
  const aspect = options.aspectRatio ?? "source";
  const wantsReframe = aspect !== "source";
  const hasCaptions = !!options.subtitlesAssPath;
  const hasMusic = !!options.musicPath;
  const wantsLoudnorm = !!options.loudnessNormalize;
  // Sort b-rolls so lower z_index renders FIRST (earlier in the overlay
  // chain = lower in the visual stack). Stable sort preserves array order
  // for equal z values, which matches the historic "last in array = on top"
  // behaviour when no z is set.
  const brolls = [...(options.brolls ?? [])].sort(
    (a, b) => (a.z_index ?? 0) - (b.z_index ?? 0),
  );
  const hasBroll = brolls.length > 0;

  // Stage 1: concat outputs. The video flows: concat → reframe → broll
  // overlays → subtitles → [vout]. We only allocate intermediate labels for
  // the stages we actually need so the no-options case still produces the
  // exact same filtergraph as Phase 1.
  const concatVideoOut = wantsReframe || hasCaptions || hasBroll ? "[vConcat]" : "[vout]";
  const concatAudioOut = hasMusic || wantsLoudnorm ? "[aConcat]" : "[aout]";
  const concatFilter = `${concatInputs}concat=n=${clips.length}:v=1:a=1${concatVideoOut}${concatAudioOut}`;

  // Output dimensions after stage 2. Used to size pip b-rolls (width_pct of
  // the output width). When no reframe, fall back to the probed source dims
  // (preferred) or 1920×1080 as a last resort.
  const targetDims = wantsReframe
    ? ASPECT_DIMS[aspect as Exclude<AspectRatio, "source">]
    : (options.sourceDims ?? { w: 1920, h: 1080 });

  // Stage 2: aspect-ratio reframe (scale + crop).
  let reframeFilter = "";
  if (wantsReframe) {
    const { w, h } = ASPECT_DIMS[aspect as Exclude<AspectRatio, "source">];
    const reframeOut = hasBroll || hasCaptions ? "[vReframed]" : "[vout]";
    reframeFilter = `;[vConcat]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}${reframeOut}`;
  }

  // Stage 2.5: b-roll overlays. Each b-roll is trimmed and either fully
  // covers the main video or sits as a PIP box, enabled only during its
  // output-time window. Higher z_index renders LATER → visually on top.
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
      const endSec = ((br.output_start_ms + (br.trim_end_ms - br.trim_start_ms)) / 1000).toFixed(3);

      // Trim + reset timestamps; shift PTS to the output start so overlay
      // can synchronize. For fullscreen, scale to target dims (covers full
      // frame); for pip, scale width to width_pct of base width.
      if (br.mode === "fullscreen") {
        segments.push(
          `[${inputIdx}:v]trim=start=${trimSec}:end=${trimEnd},setpts=PTS-STARTPTS+${startSec}/TB,scale=${targetDims.w}:${targetDims.h}:force_original_aspect_ratio=increase,crop=${targetDims.w}:${targetDims.h}[br${i}]`,
        );
      } else {
        // PIP: width = width_pct of main width; height auto.
        const widthPx = Math.round((br.position.width_pct / 100) * targetDims.w);
        segments.push(
          `[${inputIdx}:v]trim=start=${trimSec}:end=${trimEnd},setpts=PTS-STARTPTS+${startSec}/TB,scale=${widthPx}:-2[br${i}]`,
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

  // Audio chain: optionally loudness-normalize the concatenated source
  // audio (TikTok / IG target -16 LUFS, -1 dB true peak, 11 LU range), then
  // optionally mix in music with optional fades. Single-pass loudnorm is
  // less accurate than two-pass but doesn't require a probe round-trip
  // and ships an audible improvement vs the raw audio that mobile creators
  // currently get.
  let audioFilter = "";
  let lastAudioLabel = "[aConcat]";
  if (wantsLoudnorm) {
    const next = hasMusic ? "[aLoud]" : "[aout]";
    audioFilter += `;${lastAudioLabel}loudnorm=I=-16:LRA=11:TP=-1${next}`;
    lastAudioLabel = next;
  }
  if (hasMusic) {
    const vol = Math.max(0, Math.min(1, options.musicVolume ?? 0.3));
    const startSec = ((options.musicStartMs ?? 0) / 1000).toFixed(3);
    const fadeInSec = ((options.musicFadeInMs ?? 0) / 1000).toFixed(3);
    const fadeOutSec = ((options.musicFadeOutMs ?? 0) / 1000).toFixed(3);
    const totalOutSec = totalOutputDurationMs(clips) / 1000;
    const fadeOutStartSec = Math.max(0, totalOutSec - (options.musicFadeOutMs ?? 0) / 1000).toFixed(3);
    const fades: string[] = [];
    if ((options.musicFadeInMs ?? 0) > 0) fades.push(`afade=in:st=0:d=${fadeInSec}`);
    if ((options.musicFadeOutMs ?? 0) > 0) fades.push(`afade=out:st=${fadeOutStartSec}:d=${fadeOutSec}`);
    const fadeChain = fades.length ? "," + fades.join(",") : "";
    audioFilter +=
      `;[1:a]atrim=start=${startSec},asetpts=PTS-STARTPTS,volume=${vol}${fadeChain},aresample=async=1[aMusic]` +
      `;${lastAudioLabel}[aMusic]amix=inputs=2:dropout_transition=0:duration=first[aout]`;
  }

  const fc = `${trims};${concatFilter}${reframeFilter}${brollFilter}${captionFilter}${audioFilter}`;

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
    musicFadeInMs?: number;
    musicFadeOutMs?: number;
    brolls?: BRollInput[];
    sourceDims?: { w: number; h: number };
    loudnessNormalize?: boolean;
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
