// Shared parsing for Viral Today channel handles. Used by the Viral Today
// add-channel flow and the Strategy page's channel-link detection so both
// normalize usernames identically.

export type ViralPlatform = "instagram" | "tiktok" | "youtube";

// Detect platform and extract clean username from full URL or @handle
export function detectPlatformAndUsername(raw: string): { username: string; platform: ViralPlatform } {
  const s = raw.trim();

  // TikTok URL
  const tiktokMatch = s.match(/tiktok\.com\/@?([^/?#\s]+)/i);
  if (tiktokMatch) {
    return { username: tiktokMatch[1].replace(/\/$/, "").toLowerCase(), platform: "tiktok" };
  }

  // Instagram URL
  const instaMatch = s.match(/instagram\.com\/([^/?#\s]+)/i);
  if (instaMatch) {
    return { username: instaMatch[1].replace(/\/$/, "").toLowerCase(), platform: "instagram" };
  }

  // YouTube URL variants
  if (s.includes("youtube.com") || s.includes("youtu.be")) {
    const handleMatch = s.match(/youtube\.com\/@([^/?#\s]+)/i);
    const customMatch = s.match(/youtube\.com\/c\/([^/?#\s]+)/i);
    const channelMatch = s.match(/youtube\.com\/channel\/([^/?#\s]+)/i);
    const username =
      handleMatch?.[1] ?? customMatch?.[1] ?? channelMatch?.[1] ?? s.replace(/^.*youtube\.com\//i, "").split(/[/?#]/)[0];
    return { username: username.replace(/\/$/, ""), platform: "youtube" };
  }

  // @handle with no URL — assume Instagram
  const clean = s.replace(/^@/, "").trim().toLowerCase();
  return { username: clean, platform: "instagram" };
}

const HAS_URL = /instagram\.com|tiktok\.com|youtube\.com|youtu\.be/i;

/** Resolve one onboarding social field to a (platform, username) pair.
 *  Bare handles inherit the field's platform; URLs win over the field. */
export function parseOnboardingHandle(raw: unknown, fieldPlatform: ViralPlatform): { username: string; platform: ViralPlatform } | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const detected = detectPlatformAndUsername(s);
  if (!detected.username) return null;
  return { username: detected.username, platform: HAS_URL.test(s) ? detected.platform : fieldPlatform };
}

/** All scrapeable channels declared in onboarding_data (Facebook excluded —
 *  no scraper exists for it). Deduped by platform+username. */
export function onboardingSocialChannels(onboarding: Record<string, unknown>): { username: string; platform: ViralPlatform }[] {
  const fields: [ViralPlatform, unknown][] = [
    ["instagram", onboarding.instagram],
    ["tiktok", onboarding.tiktok],
    ["youtube", onboarding.youtube],
  ];
  const seen = new Set<string>();
  const out: { username: string; platform: ViralPlatform }[] = [];
  for (const [platform, raw] of fields) {
    const parsed = parseOnboardingHandle(raw, platform);
    if (!parsed) continue;
    const key = `${parsed.platform}:${parsed.username}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(parsed);
  }
  return out;
}
