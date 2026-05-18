// src/lib/videoEditor/edl.ts

export type AspectRatio = "9:16" | "1:1" | "16:9" | "source";

export type Clip = {
  id: string;
  source_start_ms: number;
  source_end_ms: number;
};

export type CaptionPreset = "tiktok_word_pop" | "ig_reels_classic" | "shorts_bold";

// Times on caption words are in SOURCE time (same as transcript words). The
// worker maps them to output time using the clips array.
export type CaptionWord = {
  text: string;
  start_ms: number;
  end_ms: number;
};

export type Caption = {
  id: string;
  preset: CaptionPreset;
  words: CaptionWord[];
  // x_pct/y_pct are anchor positions in 0-100 space (left-to-right, top-to-bottom).
  // anchor "center" means the text block is centered on (x, y).
  position: { x_pct: number; y_pct: number; anchor: "center" };
};

export type EDL = {
  source: {
    storage_path: string;       // e.g. "footage/<video_edit_id>/source.mp4"
    duration_ms: number;        // total source duration, set on first load
  };
  aspect_ratio: AspectRatio;
  clips: Clip[];
  captions?: Caption[];

  // Phase 2 stops here. Phase 4+ adds: text_overlays, music. Keep the shape
  // forward-compatible (additive only).
};

export function emptyEDL(sourceStoragePath: string, durationMs: number): EDL {
  return {
    source: { storage_path: sourceStoragePath, duration_ms: durationMs },
    aspect_ratio: "source",
    clips: [
      { id: crypto.randomUUID(), source_start_ms: 0, source_end_ms: durationMs },
    ],
  };
}

export function totalDurationMs(edl: EDL): number {
  return edl.clips.reduce(
    (sum, c) => sum + Math.max(0, c.source_end_ms - c.source_start_ms),
    0,
  );
}

// Build a default set of caption blocks from a flat transcript. Chunks the
// words into short groups so each caption block stays readable on a phone
// screen — break at any pause longer than `pauseBreakMs`, otherwise cap at
// `maxWordsPerBlock` words per chunk. This is the auto-caption equivalent
// of drag-selecting every sensible phrase and applying the preset.
export function captionsFromTranscript(
  words: { text: string; start_ms: number; end_ms: number }[],
  preset: CaptionPreset,
  opts: { maxWordsPerBlock?: number; pauseBreakMs?: number; position?: { x_pct: number; y_pct: number } } = {},
): Caption[] {
  const maxWords = opts.maxWordsPerBlock ?? 5;
  const pauseBreak = opts.pauseBreakMs ?? 600;
  const pos = opts.position ?? { x_pct: 50, y_pct: 80 };

  const blocks: Caption[] = [];
  let current: CaptionWord[] = [];
  const flush = () => {
    if (current.length === 0) return;
    blocks.push({
      id: crypto.randomUUID(),
      preset,
      words: current,
      position: { x_pct: pos.x_pct, y_pct: pos.y_pct, anchor: "center" },
    });
    current = [];
  };

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    current.push({ text: w.text, start_ms: w.start_ms, end_ms: w.end_ms });
    const next = words[i + 1];
    const reachedSize = current.length >= maxWords;
    const reachedPause = !!next && next.start_ms - w.end_ms >= pauseBreak;
    if (reachedSize || reachedPause || !next) flush();
  }
  return blocks;
}

// Convert a timestamp in source time to the equivalent timestamp in EDL
// output time (what the preview's playhead uses). If the source time falls
// inside a clip, return the corresponding output offset. If it falls inside
// a removed range, snap forward to the start of the next clip — that is
// what users expect from "click here in the transcript."
export function sourceTimeToEdlTime(edl: EDL, sourceMs: number): number {
  let acc = 0;
  for (const c of edl.clips) {
    if (sourceMs < c.source_start_ms) return acc;       // gap → snap forward
    const len = Math.max(0, c.source_end_ms - c.source_start_ms);
    if (sourceMs <= c.source_end_ms) {
      return acc + (sourceMs - c.source_start_ms);
    }
    acc += len;
  }
  return Math.max(0, acc - 1);                          // past last clip → end
}

// Subtract a sorted, non-overlapping list of silence ranges from the source
// duration. Returns the non-silence ranges as clips. Used by the "Remove all
// silences" action; pads each cut by `padMs` on either side so the audio
// doesn't clip mid-word.
export function clipsFromSilences(
  durationMs: number,
  silences: { start_ms: number; end_ms: number }[],
  padMs = 80,
): Clip[] {
  const sorted = [...silences]
    .map((s) => ({
      start_ms: Math.max(0, s.start_ms + padMs),
      end_ms: Math.min(durationMs, s.end_ms - padMs),
    }))
    .filter((s) => s.end_ms > s.start_ms)
    .sort((a, b) => a.start_ms - b.start_ms);

  // Merge overlaps after padding.
  const merged: { start_ms: number; end_ms: number }[] = [];
  for (const s of sorted) {
    const last = merged[merged.length - 1];
    if (last && s.start_ms <= last.end_ms) {
      last.end_ms = Math.max(last.end_ms, s.end_ms);
    } else {
      merged.push({ ...s });
    }
  }

  const out: Clip[] = [];
  let cursor = 0;
  for (const s of merged) {
    if (s.start_ms > cursor) {
      out.push({ id: crypto.randomUUID(), source_start_ms: cursor, source_end_ms: s.start_ms });
    }
    cursor = s.end_ms;
  }
  if (cursor < durationMs) {
    out.push({ id: crypto.randomUUID(), source_start_ms: cursor, source_end_ms: durationMs });
  }
  return out;
}
