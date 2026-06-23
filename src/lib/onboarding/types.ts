import { toProfilesArray } from "./richText";

/** Shape of the onboarding form. Stored as JSONB in clients.onboarding_data. */
export interface OnboardingData {
  clientName: string;
  email: string;
  instagram: string;
  instagramPassword: string;
  tiktok: string;
  tiktokPassword: string;
  youtube: string;
  youtubePassword: string;
  facebook: string;
  facebookPassword: string;
  package: string;
  adBudget: string;
  /** Profiles to emulate — now a list (legacy values were newline strings). */
  top3Profiles: string[];
  targetClient: string;
  industry: string;
  industryOther: string;
  state: string;
  /** Rich-text (HTML) long responses. */
  uniqueOffer: string;
  uniqueValues: string;
  competition: string;
  /** Contrarian beliefs vs other experts in their space. */
  contrarianBeliefs: string;
  story: string;
  callLink: string;
  additionalNotes: string;
}

/** Long free-text answers that use the rich-text (B/I/U + voice) editor. */
export const RICH_TEXT_FIELDS = [
  "uniqueOffer",
  "uniqueValues",
  "competition",
  "contrarianBeliefs",
  "story",
  "targetClient",
  "additionalNotes",
] as const;

export const EMPTY_ONBOARDING: OnboardingData = {
  clientName: "",
  email: "",
  instagram: "",
  instagramPassword: "",
  tiktok: "",
  tiktokPassword: "",
  youtube: "",
  youtubePassword: "",
  facebook: "",
  facebookPassword: "",
  package: "",
  adBudget: "",
  top3Profiles: [],
  targetClient: "",
  industry: "",
  industryOther: "",
  state: "",
  uniqueOffer: "",
  uniqueValues: "",
  competition: "",
  contrarianBeliefs: "",
  story: "",
  callLink: "",
  additionalNotes: "",
};

/**
 * Merge raw onboarding_data (any legacy shape) into a complete OnboardingData.
 * Coerces top3Profiles from a legacy newline string into an array.
 */
export function normalizeOnboarding(raw: Record<string, unknown> | null | undefined): OnboardingData {
  const data = { ...EMPTY_ONBOARDING, ...(raw || {}) } as OnboardingData;
  data.top3Profiles = toProfilesArray((raw || {})["top3Profiles" as keyof typeof raw]);
  return data;
}

/** Trim a form before persisting: drop empty profile rows. */
export function prepareForSave(data: OnboardingData): OnboardingData {
  return {
    ...data,
    top3Profiles: data.top3Profiles.map((p) => p.trim()).filter(Boolean),
  };
}

/**
 * Social credentials. These are uniquely fragile: the form blanks them on a
 * stale local draft, and the AI companion's fill tool never carries them — so a
 * full-blob save can silently wipe them.
 */
export const PASSWORD_FIELDS = [
  "instagramPassword",
  "tiktokPassword",
  "youtubePassword",
  "facebookPassword",
] as const;

/**
 * Guard against silent credential loss: a blank password in the outgoing payload
 * must never overwrite a non-empty password already stored. Returns a new payload
 * with empty password fields backfilled from `stored`. A non-empty incoming value
 * (an intentional change) is always respected.
 */
export function preservePasswords(
  payload: OnboardingData,
  stored: Record<string, unknown> | null | undefined,
): OnboardingData {
  if (!stored) return payload;
  const next = { ...payload };
  for (const key of PASSWORD_FIELDS) {
    const incoming = next[key];
    const prev = stored[key];
    if ((!incoming || !incoming.trim()) && typeof prev === "string" && prev.trim()) {
      next[key] = prev;
    }
  }
  return next;
}
