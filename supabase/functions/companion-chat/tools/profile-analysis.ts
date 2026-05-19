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
}

export interface AnalyzeMyProfileResult {
  /** Text block the model receives back as the tool_result content. */
  tool_result_text: string;
  /** When set, the SSE caller should emit a profile-analysis embed event
   *  with this payload. Null when no analysis ran (mismatch, missing handle). */
  embed_payload: Record<string, unknown> | null;
}

export async function runAnalyzeMyProfile(args: {
  admin: SupabaseClient;
  authHeader: string;
  supabaseUrl: string;
  input: AnalyzeMyProfileInput;
  onboarding: Record<string, unknown>;
}): Promise<AnalyzeMyProfileResult> {
  const { admin: _admin, authHeader, supabaseUrl, input, onboarding } = args;

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

  if (resolution.kind === "mismatch") {
    return {
      tool_result_text: `handle_mismatch: provided @${resolution.provided}, onboarding has @${resolution.onboarding}. Ask the user: "That's not the IG handle on ${input.client_name}'s onboarding (@${resolution.onboarding}). Is @${resolution.provided} (a) a new account, (b) a typo, or (c) a competitor to analyze instead?" Do NOT call analyze_my_profile again until you have an answer.`,
      embed_payload: null,
    };
  }

  // resolution.kind === "match" — call the edge function
  const payload = {
    client_id: input.client_id,
    extended_dimensions: true,
    include_competitors: input.include_competitors === true,
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

  // Two-line summary the model uses to compose its prose framing.
  const summaryLines = [
    `Analyzed @${resolution.handle}. audience=${analysis.audience_score}/10, uniqueness=${analysis.uniqueness_score}/10.`,
    typeof analysis.summary === "string" ? analysis.summary : "",
  ].filter(Boolean).join(" ");

  return {
    tool_result_text: summaryLines + " A ProfileAnalysisEmbed card has been rendered for the user — your prose reply should be 2-3 sentences framing the result, not a full breakdown.",
    embed_payload: { ...analysis, handle: resolution.handle, platform: "instagram" },
  };
}
