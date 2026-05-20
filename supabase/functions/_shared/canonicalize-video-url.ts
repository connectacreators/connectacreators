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
  for (const key of [...cleaned.searchParams.keys()]) {
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
  return {
    platform: "instagram",
    postId,
    normalizedUrl: `https://www.instagram.com/${m[1] === "reels" ? "reel" : m[1]}/${postId}/`,
  };
}

function matchTiktok(u: URL): CanonicalVideo | null {
  const host = u.hostname.replace(/^www\./, "");
  if (host === "tiktok.com" || host === "m.tiktok.com") {
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
  // Modern Facebook short-share URLs: /share/v/{token}, /share/r/{token},
  // /share/p/{token}. Token is alphanumeric, not numeric. Treat as opaque
  // postId and let the downstream scraper (yt-dlp on VPS) follow Facebook's
  // own redirect to the canonical video URL.
  m = u.pathname.match(/^\/share\/(?:v|r|p)\/([A-Za-z0-9]+)/);
  if (m) return { platform: "facebook", postId: m[1], normalizedUrl: `https://www.facebook.com${u.pathname}` };
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
