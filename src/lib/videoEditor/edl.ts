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
