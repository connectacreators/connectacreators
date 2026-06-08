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
