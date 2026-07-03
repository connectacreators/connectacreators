// src/lib/canonicalize-video-url.ts
// MIRROR of supabase/functions/_shared/canonicalize-video-url.ts
// Keep these in sync — any change here must also be made in the Deno file.

export type VideoPlatform = "instagram" | "tiktok" | "youtube" | "facebook";

export interface CanonicalVideo {
  platform: VideoPlatform;
  postId: string;
  normalizedUrl: string;
}

const STRIP_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "igsh", "igshid", "si", "feature", "fbclid", "ref_src", "ref_url",
  "_t", "_r", "is_copy_url", "is_from_webapp",
]);

function stripTrackingParams(u: URL): URL {
  const cleaned = new URL(u.toString());
  for (const key of Array.from(cleaned.searchParams.keys())) {
    if (STRIP_PARAMS.has(key)) cleaned.searchParams.delete(key);
  }
  return cleaned;
}

function matchInstagram(u: URL): CanonicalVideo | null {
  const host = u.hostname.replace(/^www\./, "");
  if (host !== "instagram.com" && host !== "m.instagram.com") return null;
  const m = u.pathname.match(/^\/(reel|reels|p)\/([A-Za-z0-9_-]+)\/?/);
  if (!m) return null;
  const postId = m[2];
  // /p/, /reel/ and /reels/ with the same shortcode are the SAME post —
  // Instagram serves them interchangeably. Normalize all three to /reel/ so
  // the shortcode is the identity (a /p/-pasted reference used to miss the
  // /reel/-stored viral_videos row entirely).
  return {
    platform: "instagram",
    postId,
    normalizedUrl: `https://www.instagram.com/reel/${postId}/`,
  };
}

function matchTiktok(u: URL): CanonicalVideo | null {
  const host = u.hostname.replace(/^www\./, "");
  if (host === "tiktok.com" || host === "m.tiktok.com") {
    // Standard form: /@username/video/ID. Preserve the @username — TikTok
    // redirects the username-less /video/ID form to a 404 page, which makes
    // yt-dlp fail with "Unsupported URL" during download/transcription.
    const withUser = u.pathname.match(/^\/@([\w.-]+)\/video\/(\d+)/);
    if (withUser) {
      return {
        platform: "tiktok",
        postId: withUser[2],
        normalizedUrl: `https://www.tiktok.com/@${withUser[1]}/video/${withUser[2]}`,
      };
    }
    // Bare /video/ID with no username in the source URL — keep as-is. postId
    // is the canonical dedup key, so resolve still works; this form just isn't
    // directly downloadable (the username can't be recovered from ID alone).
    const m = u.pathname.match(/\/video\/(\d+)/);
    if (m) {
      return {
        platform: "tiktok",
        postId: m[1],
        normalizedUrl: `https://www.tiktok.com/video/${m[1]}`,
      };
    }
  }
  if (host === "vm.tiktok.com" || host === "vt.tiktok.com") {
    const m = u.pathname.match(/^\/([A-Za-z0-9]+)/);
    if (m) {
      return {
        platform: "tiktok",
        postId: m[1],
        normalizedUrl: `https://${host}/${m[1]}/`,
      };
    }
  }
  return null;
}

function matchYoutube(u: URL): CanonicalVideo | null {
  const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
  if (host === "youtube.com") {
    const v = u.searchParams.get("v");
    if (v) {
      return {
        platform: "youtube",
        postId: v,
        normalizedUrl: `https://www.youtube.com/watch?v=${v}`,
      };
    }
    const m = u.pathname.match(/^\/shorts\/([A-Za-z0-9_-]+)/);
    if (m) {
      return {
        platform: "youtube",
        postId: m[1],
        normalizedUrl: `https://www.youtube.com/shorts/${m[1]}`,
      };
    }
  }
  if (host === "youtu.be") {
    const m = u.pathname.match(/^\/([A-Za-z0-9_-]+)/);
    if (m) {
      return {
        platform: "youtube",
        postId: m[1],
        normalizedUrl: `https://www.youtube.com/watch?v=${m[1]}`,
      };
    }
  }
  return null;
}

function matchFacebook(u: URL): CanonicalVideo | null {
  const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
  if (host !== "facebook.com" && host !== "fb.watch") return null;
  let m = u.pathname.match(/^\/reel\/(\d+)/);
  if (m) return { platform: "facebook", postId: m[1], normalizedUrl: `https://www.facebook.com/reel/${m[1]}` };
  m = u.pathname.match(/^\/videos\/(\d+)/);
  if (m) return { platform: "facebook", postId: m[1], normalizedUrl: `https://www.facebook.com/videos/${m[1]}` };
  if (u.pathname.startsWith("/watch")) {
    const v = u.searchParams.get("v");
    if (v) return { platform: "facebook", postId: v, normalizedUrl: `https://www.facebook.com/watch?v=${v}` };
  }
  return null;
}

export function canonicalizeVideoUrl(raw: string): CanonicalVideo | null {
  if (!raw || typeof raw !== "string") return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  u = stripTrackingParams(u);
  return (
    matchInstagram(u) ||
    matchTiktok(u) ||
    matchYoutube(u) ||
    matchFacebook(u)
  );
}

/**
 * All URL spellings a viral_videos row for this video might be stored under.
 * DB rows predate canonicalization changes (Instagram rows exist in both
 * /reel/ and /p/ form), so lookups by video_url should use
 * `.in("video_url", videoUrlLookupVariants(url))` instead of eq(canonical).
 * First element is always the canonical form (preferred for writes).
 */
export function videoUrlLookupVariants(raw: string): string[] {
  const canonical = canonicalizeVideoUrl(raw);
  if (!canonical) {
    const t = (raw ?? "").trim();
    return t ? [t] : [];
  }
  const variants = [canonical.normalizedUrl];
  if (canonical.platform === "instagram") {
    variants.push(`https://www.instagram.com/p/${canonical.postId}/`);
  }
  const t = (raw ?? "").trim();
  if (t && !variants.includes(t)) variants.push(t);
  return variants;
}
