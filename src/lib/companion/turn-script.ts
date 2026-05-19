// src/lib/companion/turn-script.ts
// Type definitions for the /ai live broadcast turn model.
// An assistant turn is composed of:
//   1. Zero or more activity scenes — large editorial animations of work in progress.
//   2. An italic narrative line (EB Garamond) — one sentence framing the operation.
//   3. Zero or more inline embeds — rich content Robby references.

export type SceneType =
  | "scanning"
  | "drafting"
  | "stats"
  | "video-analysis"
  | "thinking";

// ── Scene payloads — discriminated union ────────────────────────────────────
export interface ScanningPayload {
  /** Each row: a channel being scanned, with its current status. */
  channels: Array<{
    id: string;
    username: string;
    avatar_seed?: number;       // 0-7, picks gradient color
    status: "queued" | "checking" | "done" | "hit";
    note?: string;              // "3 new · 12.4x outlier" | "no updates" | etc
  }>;
  /** Summary line shown at the bottom once scanning completes. */
  summary?: string;
}

export interface DraftingPayload {
  sections: Array<{ tag: string; body: string }>;  // { tag: "Hook", body: "..." }
  est_outlier?: number;
  read_time_sec?: number;
  matches_note?: string;
}

export interface StatsPayload {
  label: string;                 // "Views · last 7 days"
  big_value: string;             // "28.4K"
  delta?: string;                // "+44% wow"
  bars: Array<{ label: string; value: number; highlight?: boolean }>;
  scribble?: string;             // bottom italic quote
  peak_label?: string;           // "12.4x ✦" — Caveat-font label over peak bar
}

export interface VideoAnalysisPayload {
  video_url: string | null;
  caption?: string;
  markers: Array<{ section: "hook" | "body" | "cta"; start: number; end: number; label: string }>;
  /** Transcript words to stream in. Each word carries its section tint. */
  transcript: Array<{ word: string; section: "hook" | "body" | "cta" }>;
}

export interface ThinkingPayload {
  hint: string;                  // "Thinking — comparing patterns across your last 12 wins"
}

export type SceneEvent =
  | { type: "scanning"; verb: string; meta: string; payload: ScanningPayload }
  | { type: "drafting"; verb: string; meta: string; payload: DraftingPayload }
  | { type: "stats"; verb: string; meta: string; payload: StatsPayload }
  | { type: "video-analysis"; verb: string; meta: string; payload: VideoAnalysisPayload }
  | { type: "thinking"; verb: string; meta: string; payload: ThinkingPayload };

// ── Embed payloads ──────────────────────────────────────────────────────────
export type EmbedType =
  | "video-card"
  | "video-player"
  | "metric-strip"
  | "framework-deck"
  | "channel-grid"
  | "script-card"
  | "profile-analysis";

export interface VideoCardEmbedData {
  id: string;
  thumbnail_url: string | null;
  caption_overlay?: string;       // small text overlaid on the thumb
  username: string;
  outlier: number;                // 8.2 → "8.2x" badge
  views: number;
  engagement: number;             // 4.6 → "4.6%"
  age: string;                    // "2d ago"
  format_hint?: string;           // "Comparison · split-screen"
  // Rich breakdown fields — populated by find_viral_videos so the embed
  // can render a compact horizontal card with hook/body/CTA snippets
  // instead of just a thumbnail. All optional so legacy payloads still
  // render the simple card.
  platform?: string;              // "instagram" | "tiktok" | "youtube"
  content_format?: string;        // canonical slug e.g. "comparison"
  primary_niche?: string;         // canonical slug e.g. "sales"
  hook_text?: string;
  body_structure?: string;
  cta_text?: string;
  video_url?: string;             // source URL (linked from the card)
  video_file_url?: string | null; // Supabase Storage signed URL for inline playback
}

export interface VideoPlayerEmbedData extends VideoCardEmbedData {
  video_file_url: string | null;
}

export interface MetricStripEmbedData extends StatsPayload {}

export interface FrameworkDeckEmbedData {
  cards: Array<{
    tag: string;                  // "Framework · Comparison"
    headline: string;             // hook line, may contain <scribble>...</scribble>
  }>;
}

export interface ChannelGridEmbedData {
  channels: Array<{ id: string; username: string; status: "active" | "paused" | "hot" }>;
}

export interface ScriptCardEmbedData extends DraftingPayload {}

export interface HookPatternRef {
  pattern: string;
  frequency: number;
  example?: string;
}

export interface TopPostRef {
  id: string;
  thumbnail: string | null;
  views: number;
  outlier_ratio: number;
  hook: string;
}

export interface ComparisonRef {
  cadence_delta_pct: number;
  format_mix_delta: Record<string, number>;
  common_winning_hooks: string[];
  where_youre_winning: string;
  where_theyre_winning: string;
}

export interface ProfileAnalysisEmbedData {
  handle: string;
  platform: "instagram";
  profilePicUrl?: string | null;
  followers?: number | null;
  audience_score: number;
  uniqueness_score: number;
  summary: string;
  hook_patterns: HookPatternRef[];
  format_mix: Record<string, number>;
  cadence: { posts_per_week: number; last_post_at: string | null };
  outlier_band: { median: number; top: number; top_post_id?: string | null };
  top_posts: TopPostRef[];
  comparison?: ComparisonRef;
}

export type EmbedRef =
  | { type: "video-card"; data: VideoCardEmbedData }
  | { type: "video-player"; data: VideoPlayerEmbedData }
  | { type: "metric-strip"; data: MetricStripEmbedData }
  | { type: "framework-deck"; data: FrameworkDeckEmbedData }
  | { type: "channel-grid"; data: ChannelGridEmbedData }
  | { type: "script-card"; data: ScriptCardEmbedData }
  | { type: "profile-analysis"; data: ProfileAnalysisEmbedData };

// ── Full turn ───────────────────────────────────────────────────────────────
export interface BroadcastTurn {
  scenes: SceneEvent[];
  narrative: string;              // italic EB Garamond text
  embeds: EmbedRef[];
}
