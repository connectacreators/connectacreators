import { Instagram, Youtube, Facebook } from "lucide-react";
import type React from "react";

export function fmtViews(n: number): string {
  // 999,500+ rounds to "1000K" via the K branch — promote to M instead.
  if (n >= 999_500) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

export function fmtOutlier(score: number): string {
  if (score >= 100) return `${Math.round(score)}x`;
  if (score >= 10) return `${score.toFixed(1)}x`;
  return `${score.toFixed(1)}x`;
}

export function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const d = Math.floor(diff / 86_400_000);
  if (d < 1) return "today";
  if (d === 1) return "1d ago";
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

// Exported so callers (e.g. ViralToday's channel-avatar scrubbing) can use
// the same expiry detection rule. Defined once here so we don't drift.
//
// Matches Instagram / Facebook signed-CDN hosts that expire silently. TikTok
// is handled separately below — TikTok URLs always live on `tiktokcdn` so we
// can't blanket-skip them; we check the embedded `x-expires` timestamp.
export const EXPIRED_CDN_PATTERN = /cdninstagram\.com|fbcdn\.net|scontent[-.]|instagram\.f[a-z]{3}/;

/**
 * True if the URL is a signed TikTok CDN URL whose `x-expires` query param
 * is in the past. Returns false for non-TikTok URLs and for TikTok URLs
 * without a parseable x-expires (treat as "try it, may succeed").
 */
function isExpiredTikTokUrl(url: string): boolean {
  if (!/tiktokcdn|tiktokv\.com/i.test(url)) return false;
  try {
    const m = url.match(/[?&]x-expires=(\d+)/);
    if (!m) return false;
    const exp = parseInt(m[1], 10);
    if (!Number.isFinite(exp)) return false;
    // x-expires is unix seconds. Compare to seconds, not ms.
    return exp * 1000 < Date.now();
  } catch {
    return false;
  }
}

export function proxyImg(url: string | null): string | null {
  if (!url) return null;
  // Self-hosted thumb-cache (or any path on our own domain) is always fine.
  if (url.includes("connectacreators.com")) return url;
  // Instagram + Facebook signed CDNs rotate within ~1h and reject hotlinks
  // from third parties shortly after. Anything not already self-hosted is
  // effectively dead — return null so the card renders its gradient
  // placeholder instead of a broken-img icon. New scrapes go through
  // /cache-thumbnail at insert time, so this only filters legacy rows.
  if (EXPIRED_CDN_PATTERN.test(url)) return null;
  // TikTok URLs are valid until their embedded x-expires passes.
  if (isExpiredTikTokUrl(url)) return null;
  // YouTube img.youtube.com, fresh TikTok signed URLs, direct images — pass.
  return url;
}

export function getOutlierColor(score: number): string {
  if (score >= 15) return "text-orange-400";
  if (score >= 5) return "text-green-400";
  if (score >= 2) return "text-lime-400";
  return "text-zinc-500";
}

export function viralBadgeClass(score: number): string {
  if (score >= 15) return "badge-amber";
  if (score >= 5) return "badge-lime";
  if (score >= 2) return "badge-cyan";
  return "badge-neutral";
}

export function getViewsColor(views: number): string {
  if (views >= 1_000_000) return "text-orange-400";
  if (views >= 500_000) return "text-green-400";
  if (views >= 100_000) return "text-lime-400";
  return "text-muted-foreground";
}

export function getEngagementColor(rate: number): string {
  if (rate >= 15) return "text-orange-400";
  if (rate >= 9) return "text-green-400";
  if (rate >= 5.5) return "text-lime-400";
  return "text-muted-foreground";
}

export function TikTokIcon({ className = "", ...props }: React.SVGProps<SVGSVGElement> & { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} {...props}>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.51a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.98a8.21 8.21 0 0 0 4.8 1.54V7.08a4.84 4.84 0 0 1-1.04-.39z" />
    </svg>
  );
}

export const PLATFORM_ICON: Record<string, React.ElementType> = {
  instagram: Instagram,
  tiktok: TikTokIcon,
  youtube: Youtube,
  facebook: Facebook,
};

// Neutral charcoal gradients for missing-thumbnail placeholders. The old set
// mixed saturated purples/greens/oranges that clashed with whatever palette
// the account has selected — placeholders should recede, not add color.
const GRID_PALETTES = [
  ["#121316", "#23262C"], ["#101216", "#1F252E"],
  ["#131417", "#262930"], ["#0F1114", "#212730"],
  ["#141519", "#282B31"], ["#101317", "#242A32"],
  ["#121418", "#2A2D34"], ["#0F1216", "#1E232B"],
];

export function gridGradientFor(name: string) {
  let h = 0;
  for (const c of name || "") h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  const p = GRID_PALETTES[h % GRID_PALETTES.length];
  return `linear-gradient(160deg, ${p[0]} 0%, ${p[1]} 100%)`;
}
