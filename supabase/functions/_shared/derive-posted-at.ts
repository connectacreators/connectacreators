// Derive a post's creation date directly from its ID, with no network call.
//
// Both Instagram and TikTok encode the creation timestamp inside the post ID,
// so we can always recover a real post date even when the scraper returns none.
// Validated against 12 real Instagram + 8 real TikTok rows (exact to the day,
// and more precise than the scraper's date-only values — it includes the time).
//
//   Instagram: the /reel|p/{shortcode} segment is base64 (custom alphabet) of a
//   64-bit media ID whose top 41 bits are ms since the Instagram epoch.
//   TikTok:    the numeric video ID's top 32 bits are the Unix second.

import type { CanonicalVideo } from "./canonicalize-video-url.ts";

const IG_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const IG_EPOCH_MS = 1314220021721n;

function instagramDate(shortcode: string): string | null {
  let id = 0n;
  for (const ch of shortcode) {
    const v = IG_ALPHABET.indexOf(ch);
    if (v < 0) return null; // not a decodable shortcode
    id = id * 64n + BigInt(v);
  }
  const ms = (id >> 23n) + IG_EPOCH_MS;
  const n = Number(ms);
  // Sanity guard: must land between Instagram's launch and ~now+1d.
  if (n < 1_280_000_000_000 || n > Date.now() + 86_400_000) return null;
  return new Date(n).toISOString();
}

function tiktokDate(postId: string): string | null {
  if (!/^[0-9]+$/.test(postId)) return null; // vm./vt. short tokens aren't numeric
  const secs = BigInt(postId) >> 32n;
  const n = Number(secs) * 1000;
  if (n < 1_400_000_000_000 || n > Date.now() + 86_400_000) return null;
  return new Date(n).toISOString();
}

/**
 * Best-effort post date from the canonical post ID alone. Returns an ISO string
 * for Instagram shortcodes and numeric TikTok IDs; null for everything else
 * (YouTube IDs and TikTok short-link tokens don't encode a timestamp).
 */
export function derivePostedAt(canonical: CanonicalVideo): string | null {
  if (canonical.platform === "instagram") return instagramDate(canonical.postId);
  if (canonical.platform === "tiktok") return tiktokDate(canonical.postId);
  return null;
}
