// supabase/functions/companion-chat/tools/profile-analysis.ts
//
// analyze_my_profile tool implementation. Owns:
//   1. handle resolution + mismatch detection
//   2. invoking the analyze-audience-alignment edge function with extended
//      flags
//   3. returning a structured tool_result payload to Robby AND a signal
//      that the SSE caller should emit a `profile-analysis` embed event

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

// Credit cost per call. Matches Super Canvas's existing competitor-analyze
// pattern (~30 credits per profile scrape + Claude analysis). Privileged
// roles (admin/editor/connecta_plus) skip deduction in deductCredits.
export const PROFILE_ANALYSIS_COST = 30;
export const PROFILE_ANALYSIS_COST_PER_COMPETITOR = 30;

export function normalizeHandle(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/^@/, "").toLowerCase();
}

export function handlesMatch(a: unknown, b: unknown): boolean {
  const na = normalizeHandle(a);
  const nb = normalizeHandle(b);
  if (!na || !nb) return false;
  return na === nb;
}

export type HandleResolution =
  | { kind: "match"; handle: string }
  | { kind: "mismatch"; provided: string; onboarding: string }
  | { kind: "missing" };

export function resolveTargetHandle(args: {
  provided: string | null | undefined;
  onboarding: string | null | undefined;
}): HandleResolution {
  const provided = normalizeHandle(args.provided);
  const onboarding = normalizeHandle(args.onboarding);
  if (!provided && !onboarding) return { kind: "missing" };
  if (!provided && onboarding) return { kind: "match", handle: onboarding };
  if (provided && !onboarding) return { kind: "match", handle: provided };
  if (provided === onboarding) return { kind: "match", handle: provided };
  return { kind: "mismatch", provided, onboarding };
}

export interface AnalyzeMyProfileInput {
  client_id: string;
  client_name: string;
  handle?: string;
  platform: "instagram";
  include_competitors?: boolean;
  /** Skip both caches (client_strategies + viral_channels) and re-scrape
   *  from VPS. Set when the user explicitly asks to refresh, redo, or
   *  scrape again. */
  force_refresh?: boolean;
  /** Set true when the @handle being analyzed is NOT the client's own
   *  profile (e.g. user asked to analyze a competitor). Skips the
   *  handle-mismatch ask and tells the edge function to mirror the
   *  scrape into viral_channels + viral_videos WITHOUT overwriting
   *  the client's audience_analysis. */
  analyze_as_competitor?: boolean;
}

export interface AnalyzeMyProfileResult {
  /** Text block the model receives back as the tool_result content. */
  tool_result_text: string;
  /** When set, the SSE caller should emit a profile-analysis embed event
   *  with this payload. Null when no analysis ran (mismatch, missing handle). */
  embed_payload: Record<string, unknown> | null;
  /** True when the result was served from client_strategies.audience_analysis
   *  cache instead of a fresh scrape — caller should skip credit deduction. */
  cached?: boolean;
}

/** How long a cached analysis stays valid before we re-scrape. 24h is a
 *  reasonable cadence for IG content changes — most accounts post < daily,
 *  and a day-old audit is still actionable. */
const CACHE_TTL_HOURS = 24;

export async function runAnalyzeMyProfile(args: {
  admin: SupabaseClient;
  authHeader: string;
  supabaseUrl: string;
  input: AnalyzeMyProfileInput;
  onboarding: Record<string, unknown>;
}): Promise<AnalyzeMyProfileResult> {
  const { admin, authHeader, supabaseUrl, input, onboarding } = args;

  const resolution = resolveTargetHandle({
    provided: input.handle,
    onboarding: typeof onboarding.instagram === "string" ? onboarding.instagram : null,
  });

  if (resolution.kind === "missing") {
    return {
      tool_result_text: `${input.client_name} has no Instagram handle on their onboarding profile, and you didn't pass one. Ask the user for the handle, or update onboarding.instagram, before retrying.`,
      embed_payload: null,
    };
  }

  // Mismatch check: if user explicitly said this is a competitor, skip
  // the ask and proceed with the provided handle. Otherwise return the
  // 3-option clarification.
  if (resolution.kind === "mismatch" && !input.analyze_as_competitor) {
    return {
      tool_result_text: `handle_mismatch: provided @${resolution.provided}, onboarding has @${resolution.onboarding}. Ask the user: "That's not the IG handle on ${input.client_name}'s onboarding (@${resolution.onboarding}). Is @${resolution.provided} (a) a new account, (b) a typo, or (c) a competitor to analyze instead?" Do NOT call analyze_my_profile again until you have an answer.`,
      embed_payload: null,
    };
  }
  // For competitor mode with mismatch, treat the PROVIDED handle as the
  // target. Re-synthesize the resolution as a match on that handle.
  const targetHandle = resolution.kind === "mismatch"
    ? resolution.provided
    : resolution.handle;
  const asCompetitor = input.analyze_as_competitor === true;

  // Cache check — only meaningful for the client's own profile. Competitor
  // analyses live in viral_channels and don't get a per-client cache row.
  // (Future: layer-2 cache by viral_channels.last_scraped_at for any handle.)
  // Skipped when force_refresh=true.
  const wantsCompetitors = input.include_competitors === true;
  const forceRefresh = input.force_refresh === true;
  if (!asCompetitor && !forceRefresh) {
    const { data: existing } = await admin
      .from("client_strategies")
      .select("audience_analysis")
      .eq("client_id", input.client_id)
      .maybeSingle();
    const cached = (existing?.audience_analysis ?? null) as Record<string, unknown> | null;
    if (cached) {
      const cachedAnalyzedAt = typeof cached.analyzed_at === "string" ? cached.analyzed_at : null;
      const cachedHandle = typeof cached.handle === "string" ? cached.handle.toLowerCase() : null;
      const ageMs = cachedAnalyzedAt ? Date.now() - new Date(cachedAnalyzedAt).getTime() : Infinity;
      const isFresh = ageMs < CACHE_TTL_HOURS * 60 * 60 * 1000;
      const handleMatches = cachedHandle === targetHandle.toLowerCase();
      const hasExtended = Array.isArray(cached.hook_patterns);
      const coversComparison = !wantsCompetitors || cached.comparison != null;
      if (isFresh && handleMatches && hasExtended && coversComparison) {
        const ageHours = Math.max(1, Math.floor(ageMs / (60 * 60 * 1000)));
        const cachedSummary = typeof cached.summary === "string" ? cached.summary : "";
        return {
          tool_result_text: `Using cached analysis (${ageHours}h old) for @${targetHandle}. ${cachedSummary} A ProfileAnalysisEmbed card has been rendered from cache — no new scrape, no credit charge. NEXT: write a 2-3 sentence prose reply summarizing what stands out. If the user explicitly asked for a fresh re-analysis, tell them you used cached data and offer to force-refresh on their next message.`,
          embed_payload: { ...cached, handle: targetHandle, platform: "instagram" },
          cached: true,
        };
      }
    }
  }

  // resolution.kind === "match" (or competitor bypass) — call the edge function
  const payload = {
    client_id: input.client_id,
    extended_dimensions: true,
    include_competitors: wantsCompetitors,
    target_handle: targetHandle,
    is_competitor_view: asCompetitor,
  };

  const res = await fetch(`${supabaseUrl}/functions/v1/analyze-audience-alignment`, {
    method: "POST",
    headers: {
      "Authorization": authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    return {
      tool_result_text: `analyze-audience-alignment failed: ${res.status} ${errText.slice(0, 300)}. Surface to the user as a transient error — they can retry.`,
      embed_payload: null,
    };
  }

  const body = await res.json() as { success?: boolean; analysis?: Record<string, unknown> };
  const analysis = body.analysis ?? {};

  const onboardingCompetitors = Array.isArray(onboarding.top3Profiles)
    ? (onboarding.top3Profiles as unknown[]).filter((s): s is string => typeof s === "string" && s.length > 0)
    : typeof onboarding.top3Profiles === "string" && onboarding.top3Profiles.length > 0
      ? String(onboarding.top3Profiles).split(/[\n,]+/).map((s) => s.trim()).filter(Boolean)
      : [];

  const summaryLines = [
    `Analyzed @${targetHandle}. audience=${analysis.audience_score}/10, uniqueness=${analysis.uniqueness_score}/10.`,
    typeof analysis.summary === "string" ? analysis.summary : "",
  ].filter(Boolean).join(" ");

  // Explicit next-action instructions baked into the tool result so Haiku
  // doesn't terminate the turn after one tool call. Rule 21 alone wasn't
  // landing — the model was emitting the embed and stopping.
  const isFirstPass = input.include_competitors !== true;
  let nextActions: string;
  if (asCompetitor) {
    const existingList = onboardingCompetitors.length > 0
      ? onboardingCompetitors.map((h) => `@${h.replace(/^@/, "")}`).join(", ")
      : "(none yet)";
    const updatedList = [...onboardingCompetitors.map((h) => `@${h.replace(/^@/, "")}`), `@${targetHandle}`].join(", ");
    nextActions = ` NEXT: write a 2-3 sentence prose reply summarizing what stands out about @${targetHandle}'s strategy (what they're doing that's working). CLARIFY the scores: "audience" measures how well their content speaks to ${input.client_name}'s target audience (low = different niche, not a 1:1 model), and "uniqueness" measures how distinctive their hook style is in their own space. Then ASK exactly: "Want me to add @${targetHandle} to ${input.client_name}'s onboarding for future side-by-side comparisons?" — DO NOT re-call analyze_my_profile after this. If the user answers yes (or "sure" / "ok" / "add it" / any affirmative), call fill_onboarding_fields with fields.top3Profiles = "${updatedList}". Existing top3Profiles in onboarding: ${existingList}. If the user declines, just acknowledge and stop. NEVER interpret a "yes" as "re-run the analysis" — they're confirming the onboarding update.`;
  } else if (isFirstPass && onboardingCompetitors.length > 0) {
    nextActions = ` NEXT, YOU MUST DO BOTH OF THESE IN THIS TURN: (1) write a 2-3 sentence prose reply summarizing what stands out (the card already shows the data, so don't list it again — give your interpretation). (2) AFTER your prose, CALL propose_plan with summary "Compare against ${onboardingCompetitors.length} competitor${onboardingCompetitors.length === 1 ? "" : "s"} from onboarding (~2 min)" and one step per competitor: ${onboardingCompetitors.map((h) => `"Pull @${h.replace(/^@/, "")}"`).join(", ")}. Do not skip step 2.`;
  } else if (isFirstPass) {
    nextActions = ` NEXT: write a 2-3 sentence prose reply summarizing what stands out (don't list the numbers — the card shows them). Mention that there are no competitors in onboarding, so a comparative analysis isn't available — they can add up to 3 competitor handles in onboarding to unlock that.`;
  } else {
    nextActions = ` NEXT: write a 2-3 sentence prose reply summarizing the comparison findings — what's the most important strategic takeaway from comparing against the competitors.`;
  }

  return {
    tool_result_text: summaryLines + " A ProfileAnalysisEmbed card has been rendered for the user." + nextActions,
    embed_payload: { ...analysis, handle: targetHandle, platform: "instagram" },
  };
}
