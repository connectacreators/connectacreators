// render-worker/src/captions.ts
// Generates an Advanced SubStation Alpha (.ass) file from the captions array
// in the EDL. The worker pipes this through ffmpeg's `subtitles` filter to
// burn captions into the output. Per-word highlight is done with karaoke
// `{\k}` timing tags on a single ASS event line per caption block.
//
// One subtlety: caption word timestamps are in SOURCE time, but the rendered
// output is in EDL time (since trims/silence-cuts compress the timeline).
// We map source → output by walking the clips array.
import { promises as fs } from "node:fs";

export type CaptionWord = { text: string; start_ms: number; end_ms: number };
export type CaptionPreset = "tiktok_word_pop" | "ig_reels_classic" | "shorts_bold";

export type Caption = {
  id: string;
  preset: CaptionPreset;
  words: CaptionWord[];
  position: { x_pct: number; y_pct: number; anchor: "center" };
  // Multiplier on the preset's base font size. Defaults to 1 when missing.
  size?: number;
};

export type TextOverlayPreset = "tiktok" | "helvetica" | "impact";

export type TextOverlay = {
  id: string;
  text: string;
  preset: TextOverlayPreset;
  start_ms: number;
  end_ms: number;
  position: { x_pct: number; y_pct: number; anchor: "center" };
  size?: number;
};

export type Clip = { source_start_ms: number; source_end_ms: number };

// ASS uses centiseconds (1/100s). Output dimensions inform x/y placement.
const PLAYRES_W = 1920;
const PLAYRES_H = 1080;

// PrimaryColour / OutlineColour / BackColour in ASS are BGR with optional
// alpha byte (00 = opaque, FF = fully transparent). Encoded as
// &H<AA><BB><GG><RR> reversed.
function cssHexToAssBGR(hex: string, alpha = 0): string {
  if (hex === "transparent") return "&H00FFFFFF";
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const a = alpha & 0xff;
  return (
    "&H" +
    a.toString(16).padStart(2, "0").toUpperCase() +
    b.toString(16).padStart(2, "0").toUpperCase() +
    g.toString(16).padStart(2, "0").toUpperCase() +
    r.toString(16).padStart(2, "0").toUpperCase()
  );
}

// Pre-mapped preset → ASS style record. The font/fill/stroke choices mirror
// CAPTION_PRESETS in the frontend captionPresets.ts.
const PRESET_STYLES: Record<CaptionPreset, {
  fontName: string;
  fontSize: number;             // assumes 1080p playres
  bold: 1 | 0;
  uppercase: boolean;           // applied to every word's text before emission
  primaryColour: string;        // fill
  secondaryColour: string;      // karaoke highlight fill (for `\k` if used)
  outlineColour: string;
  outlineWidth: number;
  shadowDepth: number;
  borderStyle: 1 | 3;           // 1 = outline+drop shadow, 3 = opaque box
  backColour: string;
  alignment: number;            // ASS \an1-\an9; 2 = bottom-center
  marginV: number;
}> = {
  tiktok_word_pop: {
    // Montserrat Black ships with the worker (assets/fonts/Montserrat-Black.ttf)
    // and matches the browser preview's Montserrat 900. libass loads it
    // through ffmpeg's fontsdir.
    fontName: "Montserrat",
    // Base sizes correspond to fontSizePctHeight in the frontend preset
    // module (e.g. 4.5% of 1080 = 48.6 → 48). Per-caption `size` multiplies
    // this via a `\fs` override on each Dialogue line.
    fontSize: 48,
    bold: 1,
    uppercase: false,
    primaryColour: cssHexToAssBGR("#ffffff"),
    secondaryColour: cssHexToAssBGR("#ffffff"),
    outlineColour: cssHexToAssBGR("#000000"),
    outlineWidth: 3,
    shadowDepth: 2,
    borderStyle: 1,
    backColour: cssHexToAssBGR("#000000", 0x80),
    // alignment 2 = bottom-center. With \pos(x,y) this anchors the BOTTOM of
    // the text at (x,y), which matches the browser preview's
    // translate(-50%, -100%) so y_pct means "where the bottom of the caption
    // sits" in both.
    alignment: 2,
    marginV: 0,
  },
  ig_reels_classic: {
    fontName: "Inter",
    fontSize: 40,
    bold: 1,
    uppercase: false,
    primaryColour: cssHexToAssBGR("#ffffff"),
    secondaryColour: cssHexToAssBGR("#ffffff"),
    outlineColour: cssHexToAssBGR("#000000"),
    outlineWidth: 2,
    shadowDepth: 0,
    borderStyle: 3,
    backColour: cssHexToAssBGR("#000000", 0x55),
    // alignment 2 = bottom-center. With \pos(x,y) this anchors the BOTTOM of
    // the text at (x,y), which matches the browser preview's
    // translate(-50%, -100%) so y_pct means "where the bottom of the caption
    // sits" in both.
    alignment: 2,
    marginV: 0,
  },
  shorts_bold: {
    // Anton ships with the worker (assets/fonts/Anton-Regular.ttf); it's the
    // iconic YouTube Shorts caption font — narrow tall heavy sans.
    fontName: "Anton",
    fontSize: 56,
    bold: 1,
    uppercase: false,
    primaryColour: cssHexToAssBGR("#ffffff"),
    secondaryColour: cssHexToAssBGR("#ffffff"),
    outlineColour: cssHexToAssBGR("#000000"),
    outlineWidth: 4,
    shadowDepth: 3,
    borderStyle: 1,
    backColour: cssHexToAssBGR("#000000", 0x80),
    // alignment 2 = bottom-center. With \pos(x,y) this anchors the BOTTOM of
    // the text at (x,y), which matches the browser preview's
    // translate(-50%, -100%) so y_pct means "where the bottom of the caption
    // sits" in both.
    alignment: 2,
    marginV: 0,
  },
};

// Text overlay preset styles — mirror the user-spec'd three presets that
// the browser preview also uses.
const OVERLAY_STYLES: Record<TextOverlayPreset, {
  fontName: string;
  fontSize: number;
  bold: 1 | 0;
  uppercase: boolean;
  primaryColour: string;
  outlineColour: string;
  outlineWidth: number;
  shadowDepth: number;
  borderStyle: 1 | 3;
  backColour: string;
  alignment: number;
}> = {
  // Montserrat Black, white fill, black stroke, no background.
  tiktok: {
    fontName: "Montserrat",
    fontSize: 64,
    bold: 1,
    uppercase: false,
    primaryColour: cssHexToAssBGR("#ffffff"),
    outlineColour: cssHexToAssBGR("#000000"),
    outlineWidth: 4,
    shadowDepth: 0,
    borderStyle: 1,
    backColour: cssHexToAssBGR("#000000", 0),
    alignment: 5, // center, since user wants center anchoring for text on screen
  },
  // Helvetica, white on translucent black box, no shadow/outline.
  helvetica: {
    fontName: "Helvetica Neue",
    fontSize: 45,
    bold: 1,
    uppercase: false,
    primaryColour: cssHexToAssBGR("#ffffff"),
    outlineColour: cssHexToAssBGR("#000000"),
    outlineWidth: 0,
    shadowDepth: 0,
    borderStyle: 3,                       // opaque box
    backColour: cssHexToAssBGR("#000000", 0x33), // 80% opaque → 0x33 transparency
    alignment: 5,
  },
  // Impact/Anton condensed, white fill, black stroke, no background.
  impact: {
    fontName: "Anton",
    fontSize: 76,
    bold: 1,
    uppercase: false,
    primaryColour: cssHexToAssBGR("#ffffff"),
    outlineColour: cssHexToAssBGR("#000000"),
    outlineWidth: 5,
    shadowDepth: 0,
    borderStyle: 1,
    backColour: cssHexToAssBGR("#000000", 0),
    alignment: 5,
  },
};

// Map a source-time millisecond to an output-time millisecond by walking the
// clips. Returns null if the source time falls inside a removed (silence)
// segment — caller should drop those words from the caption.
function sourceMsToOutputMs(sourceMs: number, clips: Clip[]): number | null {
  let acc = 0;
  for (const c of clips) {
    if (sourceMs < c.source_start_ms) return null;
    const len = Math.max(0, c.source_end_ms - c.source_start_ms);
    if (sourceMs <= c.source_end_ms) {
      return acc + (sourceMs - c.source_start_ms);
    }
    acc += len;
  }
  return null;
}

function msToAssTime(ms: number): string {
  // h:mm:ss.cs (centiseconds)
  const total = Math.max(0, Math.round(ms / 10)); // 1 unit = 10ms
  const cs = total % 100;
  const sec = Math.floor(total / 100) % 60;
  const min = Math.floor(total / 6000) % 60;
  const hr = Math.floor(total / 360000);
  return (
    `${hr}:${min.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}.${cs
      .toString()
      .padStart(2, "0")}`
  );
}

// Escape ASS-special characters in word text.
function escapeAss(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\{/g, "\\{").replace(/\}/g, "\\}");
}

export function buildAssFile(
  captions: Caption[],
  clips: Clip[],
  outputDurationMs: number,
  overlays: TextOverlay[] = [],
): string {
  // Header: define PlayResX/Y so positioning math agrees with the renderer.
  // Most TikTok-style content is 9:16 (1080x1920), and even 1080p horizontal
  // benefits from these as a default canvas.
  const header = [
    "[Script Info]",
    "Title: connecta-captions",
    "ScriptType: v4.00+",
    `PlayResX: ${PLAYRES_W}`,
    `PlayResY: ${PLAYRES_H}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
  ];

  for (const preset of Object.keys(PRESET_STYLES) as CaptionPreset[]) {
    const s = PRESET_STYLES[preset];
    header.push(
      `Style: ${preset},${s.fontName},${s.fontSize},${s.primaryColour},${s.secondaryColour},${s.outlineColour},${s.backColour},${s.bold},0,0,0,100,100,0,0,${s.borderStyle},${s.outlineWidth},${s.shadowDepth},${s.alignment},20,20,${s.marginV},1`,
    );
  }
  // Overlay styles share the same ASS Style table — namespaced with a
  // 'overlay_' prefix to avoid colliding with caption preset names if both
  // ever overlap.
  for (const preset of Object.keys(OVERLAY_STYLES) as TextOverlayPreset[]) {
    const s = OVERLAY_STYLES[preset];
    header.push(
      `Style: overlay_${preset},${s.fontName},${s.fontSize},${s.primaryColour},${s.primaryColour},${s.outlineColour},${s.backColour},${s.bold},0,0,0,100,100,0,0,${s.borderStyle},${s.outlineWidth},${s.shadowDepth},${s.alignment},20,20,0,1`,
    );
  }
  header.push("", "[Events]");
  header.push("Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text");

  const lines: string[] = [];
  for (const cap of captions) {
    // Map each word to output time. Drop words whose source time falls in a
    // removed segment (they can't be visible anyway).
    const mapped = cap.words
      .map((w) => {
        const start = sourceMsToOutputMs(w.start_ms, clips);
        const end = sourceMsToOutputMs(w.end_ms, clips);
        return start !== null && end !== null && end > start
          ? { text: w.text, start, end }
          : null;
      })
      .filter((w): w is { text: string; start: number; end: number } => w !== null);

    if (mapped.length === 0) continue;

    const blockStart = Math.max(0, mapped[0].start);
    const blockEnd = Math.min(outputDurationMs, mapped[mapped.length - 1].end);
    if (blockEnd <= blockStart) continue;

    // Build the karaoke text. We use `{\rPresetName}` then per-word
    // `{\k<centisecs>}` tags. The `\k` value is the word's duration; ASS
    // advances the highlight word by word. We also use \pos to anchor the
    // text at the requested x_pct/y_pct.
    const x = Math.round((cap.position.x_pct / 100) * PLAYRES_W);
    const y = Math.round((cap.position.y_pct / 100) * PLAYRES_H);

    // Per-caption size multiplier is applied via a \fs<int> override at the
    // start of the line. ASS doesn't support floats here so we round.
    const presetSpec = PRESET_STYLES[cap.preset];
    const sizeMult = cap.size ?? 1;
    const scaledFs = Math.max(8, Math.round(presetSpec.fontSize * sizeMult));

    // Build word tokens. For per-word pop we use the highlight color via
    // the karaoke `\kf` (fill animation) so the *current* word changes
    // appearance briefly — sufficient for the v1 effect.
    let textBuf = `{\\pos(${x},${y})\\fs${scaledFs}}`;
    let cursor = blockStart;
    for (let i = 0; i < mapped.length; i++) {
      const w = mapped[i];
      // Insert a gap (k0) if the next word doesn't follow immediately.
      const gap = Math.max(0, w.start - cursor);
      if (gap > 0) textBuf += `{\\k${Math.round(gap / 10)}}`;
      const dur = Math.max(1, w.end - w.start);
      // Match the browser preview's text-transform setting so what you see
      // is what you get — preview uppercases via CSS, we uppercase here.
      const wordText = presetSpec.uppercase ? w.text.toUpperCase() : w.text;
      // \kf = sweep highlight; we treat the duration as the highlight time.
      textBuf += `{\\kf${Math.round(dur / 10)}}${escapeAss(wordText)}`;
      if (i < mapped.length - 1) textBuf += " ";
      cursor = w.end;
    }

    lines.push(
      `Dialogue: 0,${msToAssTime(blockStart)},${msToAssTime(blockEnd)},${cap.preset},,0,0,0,,${textBuf}`,
    );
  }

  // Static text overlays — each maps a SOURCE time range to OUTPUT time
  // via the clips array. If a range falls fully inside a removed clip we
  // drop the overlay; if partially, we clip to the visible portion.
  for (const ov of overlays) {
    if (!ov.text.trim()) continue;
    const startOut = sourceMsToOutputMs(ov.start_ms, clips);
    const endOut = sourceMsToOutputMs(ov.end_ms, clips);
    if (startOut === null || endOut === null || endOut <= startOut) continue;

    // Fall back to the TikTok preset for legacy preset names left over
    // from earlier schema versions (old EDLs may reference title_card etc).
    const ovSpec = OVERLAY_STYLES[ov.preset] ?? OVERLAY_STYLES.tiktok;
    const effectivePresetName = (OVERLAY_STYLES[ov.preset] ? ov.preset : "tiktok") as TextOverlayPreset;
    const sizeMult = ov.size ?? 1;
    const scaledFs = Math.max(8, Math.round(ovSpec.fontSize * sizeMult));
    const x = Math.round((ov.position.x_pct / 100) * PLAYRES_W);
    const y = Math.round((ov.position.y_pct / 100) * PLAYRES_H);
    const text = ovSpec.uppercase ? ov.text.toUpperCase() : ov.text;
    const styleName = `overlay_${effectivePresetName}`;
    const line = `Dialogue: 1,${msToAssTime(startOut)},${msToAssTime(endOut)},${styleName},,0,0,0,,{\\pos(${x},${y})\\fs${scaledFs}}${escapeAss(text)}`;
    lines.push(line);
  }

  return header.concat(lines).join("\n") + "\n";
}

export async function writeAssFile(
  outputPath: string,
  captions: Caption[],
  clips: Clip[],
  outputDurationMs: number,
  overlays: TextOverlay[] = [],
): Promise<{ path: string; hadCaptions: boolean }> {
  if (captions.length === 0 && overlays.length === 0) {
    return { path: outputPath, hadCaptions: false };
  }
  const ass = buildAssFile(captions, clips, outputDurationMs, overlays);
  await fs.writeFile(outputPath, ass, "utf-8");
  return { path: outputPath, hadCaptions: true };
}
