// supabase/functions/_shared/profile-analysis-parser.ts
//
// Defensive parser for the extended profile-analysis Claude output. Claude
// occasionally returns malformed JSON, missing fields, or wrong types — this
// module always returns a fully-shaped ExtendedAnalysisPayload so downstream
// code never has to guard against missing keys.

import {
  buildEmptyExtendedPayload,
  type ComparisonSection,
  type ExtendedAnalysisPayload,
  type HookPattern,
  type TopPostRef,
} from "./profile-analysis-types.ts";

function clamp01(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return Math.max(0, Math.min(1, v));
}

function asNumber(n: unknown, fallback = 0): number {
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

function asString(s: unknown, fallback: string | null = null): string | null {
  return typeof s === "string" && s.length > 0 ? s : fallback;
}

function parseHookPatterns(raw: unknown): HookPattern[] {
  if (!Array.isArray(raw)) return [];
  const out: HookPattern[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const pattern = asString(obj.pattern);
    if (!pattern) continue;
    out.push({
      pattern,
      frequency: clamp01(obj.frequency),
      example: typeof obj.example === "string" ? obj.example : undefined,
    });
  }
  return out;
}

function parseFormatMix(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof k !== "string" || k.length === 0) continue;
    out[k] = clamp01(v);
  }
  return out;
}

function parseTopPosts(raw: unknown): TopPostRef[] {
  if (!Array.isArray(raw)) return [];
  const out: TopPostRef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const id = asString(obj.id);
    if (!id) continue;
    out.push({
      id,
      thumbnail: asString(obj.thumbnail),
      views: asNumber(obj.views),
      outlier_ratio: asNumber(obj.outlier_ratio),
      hook: typeof obj.hook === "string" ? obj.hook : "",
    });
  }
  return out;
}

function parseComparison(raw: unknown): ComparisonSection | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  const formatMixDelta: Record<string, number> = {};
  if (obj.format_mix_delta && typeof obj.format_mix_delta === "object") {
    for (const [k, v] of Object.entries(obj.format_mix_delta as Record<string, unknown>)) {
      formatMixDelta[k] = asNumber(v);
    }
  }
  return {
    cadence_delta_pct: asNumber(obj.cadence_delta_pct),
    format_mix_delta: formatMixDelta,
    common_winning_hooks: Array.isArray(obj.common_winning_hooks)
      ? obj.common_winning_hooks.filter((s): s is string => typeof s === "string")
      : [],
    where_youre_winning: typeof obj.where_youre_winning === "string" ? obj.where_youre_winning : "",
    where_theyre_winning: typeof obj.where_theyre_winning === "string" ? obj.where_theyre_winning : "",
  };
}

export function parseExtendedAnalysis(raw: unknown): ExtendedAnalysisPayload {
  const base = buildEmptyExtendedPayload();
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;

  base.hook_patterns = parseHookPatterns(obj.hook_patterns);
  base.format_mix = parseFormatMix(obj.format_mix);

  if (obj.cadence && typeof obj.cadence === "object") {
    const c = obj.cadence as Record<string, unknown>;
    base.cadence = {
      posts_per_week: asNumber(c.posts_per_week),
      last_post_at: asString(c.last_post_at),
    };
  }

  if (obj.outlier_band && typeof obj.outlier_band === "object") {
    const o = obj.outlier_band as Record<string, unknown>;
    base.outlier_band = {
      median: asNumber(o.median),
      top: asNumber(o.top),
      top_post_id: asString(o.top_post_id),
    };
  }

  base.top_posts = parseTopPosts(obj.top_posts);

  const comparison = parseComparison(obj.comparison);
  if (comparison) base.comparison = comparison;

  return base;
}
