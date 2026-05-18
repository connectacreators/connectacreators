// src/lib/videoEditor/edl.ts

export type AspectRatio = "9:16" | "1:1" | "16:9" | "source";

export type Clip = {
  id: string;
  source_start_ms: number;
  source_end_ms: number;
};

export type EDL = {
  source: {
    storage_path: string;       // e.g. "footage/<video_edit_id>/source.mp4"
    duration_ms: number;        // total source duration, set on first load
  };
  aspect_ratio: AspectRatio;
  clips: Clip[];

  // Phase 1 stops here. Phase 2+ will add: silence_segments, captions,
  // text_overlays, music. Keep the shape forward-compatible (additive only).
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
