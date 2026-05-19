// supabase/functions/_shared/profile-analysis-types.ts
//
// Shared types for the extended profile-analysis payload. Used by both the
// analyze-audience-alignment edge function (which writes them) and the
// companion-chat tool (which forwards them to the FE embed).

export interface HookPattern {
  pattern: string;        // "question-led" | "story-led" | "number-led" | etc
  frequency: number;      // 0..1
  example?: string;       // short caption fragment
}

export interface CadenceStats {
  posts_per_week: number;
  last_post_at: string | null;  // ISO date
}

export interface OutlierBand {
  median: number;
  top: number;
  top_post_id: string | null;
}

export interface TopPostRef {
  id: string;
  thumbnail: string | null;
  views: number;
  outlier_ratio: number;
  hook: string;
}

export interface ComparisonSection {
  cadence_delta_pct: number;
  format_mix_delta: Record<string, number>;
  common_winning_hooks: string[];
  where_youre_winning: string;
  where_theyre_winning: string;
}

export interface ExtendedAnalysisPayload {
  hook_patterns: HookPattern[];
  format_mix: Record<string, number>;
  cadence: CadenceStats;
  outlier_band: OutlierBand;
  top_posts: TopPostRef[];
  comparison?: ComparisonSection;
}

export const EXTENDED_FIELD_KEYS = [
  "hook_patterns",
  "format_mix",
  "cadence",
  "outlier_band",
  "top_posts",
] as const;

export function buildEmptyExtendedPayload(): ExtendedAnalysisPayload {
  return {
    hook_patterns: [],
    format_mix: {},
    cadence: { posts_per_week: 0, last_post_at: null },
    outlier_band: { median: 0, top: 0, top_post_id: null },
    top_posts: [],
  };
}
