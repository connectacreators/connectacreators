import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from "react";
const ViralReelFeed = lazy(() => import("./ViralReelFeed"));
import PageTransition from "@/components/PageTransition";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { readCache, writeCache } from "@/lib/sessionCache";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Loader2, TrendingUp, Instagram, Search, ChevronDown, X,
  Plus, Trash2, RefreshCw, Play, Eye, Zap, Radio, ArrowRight,
  LayoutGrid, List, ExternalLink, CheckCircle2, AlertCircle,
  Clock, Flame, Filter, SlidersHorizontal, Youtube, CheckSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useCredits } from "@/hooks/useCredits";
const BatchScriptModal = lazy(() => import("@/components/BatchScriptModal"));

// ── Language support ──────────────────────────────────────────────────────

type Language = "en" | "es";

const TRANSLATIONS = {
  en: {
    videos: "Videos",
    channels: "Channels",
    videosDesc: "Discover what's gone viral in your niche, and why it worked",
    channelsDesc: "Manage the channels you're monitoring for viral content",
    search: "Search for videos by topic or @channel",
    sort: "Sort",
    platforms: "Platform",
    allPlatforms: "All platforms",
    instagram: "Instagram",
    tiktok: "TikTok",
    youtube: "YouTube",
    outlier: "Outlier",
    anyOutlier: "Any outlier",
    views: "Views",
    anyViews: "Any views",
    engagement: "Engagement",
    anyEngagement: "Any engagement",
    allTime: "All time",
    last7Days: "Last 7 days",
    last30Days: "Last 30 days",
    last3Months: "Last 3 months",
    last6Months: "Last 6 months",
    last12Months: "Last 12 months",
    forYou: "For you",
    mostRecent: "Most recent",
    highestOutlier: "Highest outlier",
    mostViews: "Most views",
    bestEngagement: "Best engagement",
    clear: "Clear",
    scraping: "Scraping",
    refreshing: "refreshing automatically",
    noVideos: "No videos yet",
    noVideosDesc: "Add channels in the Channels tab and scrape them to start discovering viral content.",
    addChannels: "Add channels",
    noVideosMatch: "No videos match these filters",
    clearAllFilters: "Clear all filters",
    username: "username",
    addScrape: "Add & Scrape",
    avgViews: "avg views",
    lastScraped: "last scraped",
    never: "never",
    idle: "Idle",
    running: "Running",
    done: "Done",
    error: "Error",
    scrapeNow: "Scrape now",
    removeChannel: "Remove channel",
    noChannels: "No channels yet",
    noChannelsDesc: "Add an Instagram handle above to start scraping viral reels.",
    noChannelsTeamDesc: "Channels will appear here once added by your team.",
    totalVideos: "total videos",
  },
  es: {
    videos: "Videos",
    channels: "Canales",
    videosDesc: "Descubre qué se ha viralizado en tu nicho y por qué funcionó",
    channelsDesc: "Gestiona los canales que estás monitoreando para contenido viral",
    search: "Buscar videos por tema o @canal",
    sort: "Ordenar",
    platforms: "Plataforma",
    allPlatforms: "Todas las plataformas",
    instagram: "Instagram",
    tiktok: "TikTok",
    youtube: "YouTube",
    outlier: "Outlier",
    anyOutlier: "Cualquier outlier",
    views: "Vistas",
    anyViews: "Cualquier vista",
    engagement: "Engagement",
    anyEngagement: "Cualquier engagement",
    allTime: "Todos los tiempos",
    last7Days: "Últimos 7 días",
    last30Days: "Últimos 30 días",
    last3Months: "Últimos 3 meses",
    last6Months: "Últimos 6 meses",
    last12Months: "Últimos 12 meses",
    forYou: "Para ti",
    mostRecent: "Más reciente",
    highestOutlier: "Mayor outlier",
    mostViews: "Más vistas",
    bestEngagement: "Mejor engagement",
    clear: "Limpiar",
    scraping: "Scrapeando",
    refreshing: "actualizando automáticamente",
    noVideos: "Sin videos aún",
    noVideosDesc: "Añade canales en la pestaña Canales y scrapéalos para comenzar a descubrir contenido viral.",
    addChannels: "Añadir canales",
    noVideosMatch: "No hay videos que coincidan con estos filtros",
    clearAllFilters: "Limpiar todos los filtros",
    username: "usuario",
    addScrape: "Añadir y Scrapear",
    avgViews: "vistas promedio",
    lastScraped: "último scrapeado",
    never: "nunca",
    idle: "Inactivo",
    running: "En progreso",
    done: "Listo",
    error: "Error",
    scrapeNow: "Scrapear ahora",
    removeChannel: "Remover canal",
    noChannels: "Sin canales aún",
    noChannelsDesc: "Añade un usuario de Instagram arriba para comenzar a scrapear reels virales.",
    noChannelsTeamDesc: "Los canales aparecerán aquí una vez añadidos por tu equipo.",
    totalVideos: "videos totales",
  },
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface ViralChannel {
  id: string;
  username: string;
  platform: string;
  display_name: string | null;
  avatar_url: string | null;
  avg_views: number;
  video_count: number;
  last_scraped_at: string | null;
  scrape_status: "idle" | "running" | "done" | "error";
  scrape_error: string | null;
  apify_run_id: string | null;
  created_at: string;
  created_by: string | null;
}

interface ViralVideo {
  id: string;
  channel_id: string;
  channel_username: string;
  platform: string;
  video_url: string | null;
  thumbnail_url: string | null;
  caption: string | null;
  views_count: number;
  likes_count: number;
  comments_count: number;
  engagement_rate: number;
  outlier_score: number;
  posted_at: string | null;
  scraped_at: string;
  apify_video_id: string | null;
  hashtag_source?: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

function fmtOutlier(score: number): string {
  if (score >= 100) return `${Math.round(score)}x`;
  if (score >= 10) return `${score.toFixed(1)}x`;
  return `${score.toFixed(1)}x`;
}

function timeAgo(dateStr: string | null): string {
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

// Resolve thumbnails via yt-dlp cache when a video URL is available, else proxy the CDN URL
const EXPIRED_CDN_PATTERN = /cdninstagram\.com|fbcdn\.net|scontent[-.]|instagram\.f[a-z]{3}/;

function proxyImg(url: string | null, videoUrl?: string): string | null {
  if (url?.includes("connectacreators.com/thumb-cache")) return url;
  if (url?.includes("connectacreators.com")) return url;
  // Prefer resolve-thumb (VPS yt-dlp cache) when we have the video URL — avoids expired CDN URLs.
  if (videoUrl) {
    return `https://connectacreators.com/api/resolve-thumb?url=${encodeURIComponent(videoUrl)}`;
  }
  if (!url) return null;
  // Instagram/Facebook CDN URLs expire — don't bother proxying them, show fallback instead.
  if (EXPIRED_CDN_PATTERN.test(url)) return null;
  // For other CDN URLs, proxy through VPS
  return `https://connectacreators.com/api/proxy-image?url=${encodeURIComponent(url)}`;
}

// Detect platform and extract clean username from full URL or @handle
function detectPlatformAndUsername(raw: string): { username: string; platform: "instagram" | "tiktok" | "youtube" } {
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

function getOutlierColor(score: number): string {
  if (score >= 15) return "text-orange-400";
  if (score >= 5) return "text-green-400";
  if (score >= 2) return "text-lime-400";
  return "text-zinc-500";
}

function viralBadgeClass(score: number): string {
  if (score >= 15) return 'badge-amber';
  if (score >= 5) return 'badge-lime';
  if (score >= 2) return 'badge-cyan';
  return 'badge-neutral';
}

function getViewsColor(views: number): string {
  if (views >= 1_000_000) return "text-orange-400";
  if (views >= 500_000) return "text-green-400";
  if (views >= 100_000) return "text-lime-400";
  return "text-muted-foreground";
}

function getEngagementColor(rate: number): string {
  if (rate >= 15) return "text-orange-400";
  if (rate >= 9) return "text-green-400";
  if (rate >= 5.5) return "text-lime-400";
  return "text-muted-foreground";
}

// TikTok SVG icon (lucide doesn't include one)
function TikTokIcon({ className = "", ...props }: React.SVGProps<SVGSVGElement> & { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} {...props}>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.51a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.98a8.21 8.21 0 0 0 4.8 1.54V7.08a4.84 4.84 0 0 1-1.04-.39z" />
    </svg>
  );
}

// ── Feed score algorithm ─────────────────────────────────────────────────────
// Used by "For You" sort. Higher = shown first.
function buildFeedScorer(
  interactions: Map<string, { seen_count: number; clicked: boolean }>,
  nicheKeywords: string[],
  userChannelIds: Set<string>,
) {
  return (v: ViralVideo, now: number): number => {
    // 1. Outlier base (0–100+)
    let score = v.outlier_score * 10;

    // 2. Recency boost (0–30): 30 pts if today, 0 if 90+ days old
    const ageMs = now - new Date(v.posted_at ?? v.scraped_at).getTime();
    const ageDays = ageMs / 86_400_000;
    score += Math.max(0, 30 - (ageDays / 90) * 30);

    // 3. Niche relevance (+40)
    if (nicheKeywords.length > 0) {
      const text = ((v.caption || "") + " " + v.channel_username).toLowerCase();
      if (nicheKeywords.some(kw => text.includes(kw))) {
        score += 40;
      }
    }

    // 4. Channel affinity (+20) — user added this channel
    if (v.channel_id && userChannelIds.has(v.channel_id)) {
      score += 20;
    }

    // 5. Unseen bonus (+25) — reward videos the user hasn't seen
    const inter = interactions.get(v.id);
    if (!inter) {
      score += 25;
    }

    return score;
  };
}

const PLATFORM_ICON: Record<string, React.ElementType> = {
  instagram: Instagram,
  tiktok: TikTokIcon,
  youtube: Youtube,
};

const GRID_PALETTES = [
  ["#0f0c1e", "#3d1054"], ["#001624", "#003d5c"],
  ["#0a0a14", "#1a3a5c"], ["#0c0c0c", "#1a0a2e"],
  ["#001a10", "#003320"], ["#1a001a", "#3d0066"],
  ["#1a0a00", "#3d2000"], ["#000d1a", "#001f3d"],
];

function gridGradientFor(name: string) {
  let h = 0;
  for (const c of name || "") h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  const p = GRID_PALETTES[h % GRID_PALETTES.length];
  return `linear-gradient(160deg, ${p[0]} 0%, ${p[1]} 100%)`;
}

// ── Sub-components ─────────────────────────────────────────────────────────

interface DropdownOption { label: string; value: string }
interface FilterChipProps {
  label: string;
  options: DropdownOption[];
  value: string;
  onChange: (v: string) => void;
  isActive?: boolean;
}
function FilterChip({ label, options, value, onChange, isActive }: FilterChipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-1.5 h-7 px-3 rounded-full text-[11px] font-medium border transition-all whitespace-nowrap",
          isActive
            ? "bg-primary/15 border-primary/50 text-primary"
            : "bg-muted border-border text-muted-foreground hover:text-foreground hover:border-border"
        )}
      >
        {selected?.label ?? label}
        <ChevronDown className={cn("w-3 h-3 transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="absolute top-full mt-1.5 left-0 z-50 min-w-[160px] bg-popover border border-border rounded-xl shadow-2xl overflow-hidden"
          >
            {options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={cn(
                  "w-full text-left px-3.5 py-2 text-xs transition-colors text-foreground hover:bg-muted",
                  opt.value === value && "bg-primary/20 text-primary"
                )}
              >
                {opt.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Multi-select chip for channels
interface ChannelChipProps {
  channels: ViralChannel[];
  selected: string[];
  onChange: (ids: string[]) => void;
}
function ChannelChip({ channels, selected, onChange }: ChannelChipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const label =
    selected.length === 0
      ? `${channels.length} channels`
      : selected.length === 1
      ? `@${channels.find((c) => c.id === selected[0])?.username ?? "?"}`
      : `${selected.length} channels`;

  const isActive = selected.length > 0;

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-1.5 h-7 px-3 rounded-full text-[11px] font-medium border transition-all whitespace-nowrap",
          isActive
            ? "bg-primary/15 border-primary/50 text-primary"
            : "bg-muted border-border text-muted-foreground hover:text-foreground hover:border-border"
        )}
      >
        {label}
        <ChevronDown className={cn("w-3 h-3 transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="absolute top-full mt-1.5 left-0 z-50 min-w-[200px] bg-popover border border-border rounded-xl shadow-2xl overflow-hidden"
          >
            {channels.length === 0 ? (
              <p className="px-3.5 py-3 text-xs text-muted-foreground">No channels added yet</p>
            ) : (
              <>
                <button
                  onClick={() => onChange([])}
                  className="w-full text-left px-3.5 py-2 text-xs text-foreground hover:bg-muted border-b border-border"
                >
                  All channels
                </button>
                {channels.map((ch) => (
                  <button
                    key={ch.id}
                    onClick={() => toggle(ch.id)}
                    className="w-full text-left px-3.5 py-2 text-xs flex items-center gap-2 text-foreground hover:bg-muted transition-colors"
                  >
                    <span
                      className={cn(
                        "w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 transition-colors",
                        selected.includes(ch.id)
                          ? "bg-primary border-primary"
                          : "border-border bg-transparent"
                      )}
                    >
                      {selected.includes(ch.id) && (
                        <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 12 12">
                          <path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                        </svg>
                      )}
                    </span>
                    @{ch.username}
                    <span className="ml-auto text-muted-foreground text-[10px]">{ch.video_count} vids</span>
                  </button>
                ))}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Video card
function VideoCard({
  video, isAdmin, onDelete, selected, onToggleSelect, onSeen, onClickVideo,
}: {
  video: ViralVideo;
  isAdmin?: boolean;
  onDelete?: (id: string) => void;
  selected?: boolean;
  onToggleSelect?: (video: ViralVideo) => void;
  onSeen?: (id: string) => void;
  onClickVideo?: (id: string) => void;
}) {
  const PlatformIcon = PLATFORM_ICON[video.platform] ?? Instagram;
  const outlierColor = getOutlierColor(video.outlier_score);
  const [imgError, setImgError] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();
  const cardRef = useRef<HTMLDivElement>(null);

  // IntersectionObserver — report "seen" after 2s visible at 50%+
  useEffect(() => {
    const el = cardRef.current;
    if (!el || !onSeen) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          timer = setTimeout(() => onSeen(video.id), 2000);
        } else if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [video.id, onSeen]);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Remove this video from the database?")) return;
    setDeleting(true);
    const { error } = await supabase.from("viral_videos").delete().eq("id", video.id);
    if (error) {
      toast.error("Failed to delete video");
      setDeleting(false);
    } else {
      toast.success("Video removed");
      onDelete?.(video.id);
    }
  };

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "group relative flex flex-col rounded-xl overflow-hidden bg-card border hover:border-border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg",
        selected ? "border-cyan-500 ring-1 ring-cyan-500/30" : "border-border"
      )}
    >
      {/* Thumbnail — click navigates to detail page */}
      <div
        onClick={() => { onClickVideo?.(video.id); navigate(`/viral-today/video/${video.id}`); }}
        className="block relative aspect-[4/5] bg-muted overflow-hidden cursor-pointer"
      >
        {/* Gradient always renders as base layer — shows when image is absent or fails */}
        <div
          className="absolute inset-0"
          style={{ background: gridGradientFor(video.channel_username) }}
        />
        {!imgError && (video.thumbnail_url || video.video_url) ? (
          <img
            src={proxyImg(video.thumbnail_url, video.video_url) ?? undefined}
            alt={video.caption?.slice(0, 60) ?? "video"}
            className="relative w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Play className="w-8 h-8 text-white/60" />
          </div>
        )}

        {/* Top-left: platform icon + admin checkbox overlay */}
        <div className="absolute top-2 left-2 z-10">
          {isAdmin && onToggleSelect ? (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleSelect(video); }}
              className={cn(
                "w-6 h-6 rounded-md flex items-center justify-center border transition-all",
                selected
                  ? "bg-cyan-500 border-cyan-400"
                  : "bg-black/60 backdrop-blur-sm border-white/20 hover:border-cyan-400/60"
              )}
            >
              {selected ? (
                <CheckSquare className="w-3.5 h-3.5 text-white" />
              ) : (
                <PlatformIcon className="w-3 h-3 text-white/80" />
              )}
            </button>
          ) : (
            <div className="w-6 h-6 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center border border-white/10">
              <PlatformIcon className="w-3 h-3 text-white/80" />
            </div>
          )}
        </div>

        {/* Top-right: trash (admin) or external link (non-admin) */}
        {isAdmin ? (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center border border-white/10 z-10 hover:bg-red-600/80 transition-colors"
            title="Remove video"
          >
            {deleting ? <Loader2 className="w-3 h-3 text-white animate-spin" /> : <Trash2 className="w-3 h-3 text-white/80" />}
          </button>
        ) : (
          <a
            href={video.video_url ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center border border-white/10 z-10 hover:bg-black/80 transition-colors"
            title="Open original"
          >
            <ExternalLink className="w-3 h-3 text-white/80" />
          </a>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200 flex items-center justify-center pointer-events-none">
          <Play className="w-5 h-5 text-white opacity-0 group-hover:opacity-80 transition-opacity duration-200" />
        </div>
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col gap-1.5">
        {/* Caption */}
        <p className="text-[11px] text-foreground leading-snug line-clamp-2 font-medium min-h-[2.5em]">
          {video.caption || <span className="text-muted-foreground italic">No caption</span>}
        </p>

        {/* Channel + time */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground font-medium">@{video.channel_username}</span>
          <span className="text-[10px] text-muted-foreground">{timeAgo(video.posted_at)}</span>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-3 pt-0.5 border-t border-border">
          {/* Outlier */}
          <div className="flex items-center gap-1" title="Outlier score">
            {video.outlier_score >= 15 ? (
              <Flame className="text-orange-400 w-3.5 h-3.5" />
            ) : (
              <TrendingUp className={cn("w-3 h-3", outlierColor)} />
            )}
            <span className={viralBadgeClass(video.outlier_score)}>
              {fmtOutlier(video.outlier_score)}
            </span>
          </div>
          {/* Views */}
          <div className="flex items-center gap-1" title="Views">
            <Eye className={cn("w-3 h-3", getViewsColor(video.views_count))} />
            <span className={cn("text-[10px] font-medium tabular-nums", getViewsColor(video.views_count))}>
              {fmtViews(video.views_count)}
            </span>
          </div>
          {/* Engagement */}
          <div className="flex items-center gap-1" title="Engagement rate">
            <Zap className={cn("w-3 h-3", getEngagementColor(video.engagement_rate))} />
            <span className={cn("text-[10px] font-medium tabular-nums", getEngagementColor(video.engagement_rate))}>
              {video.engagement_rate.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// Channel row
interface ChannelRowProps {
  channel: ViralChannel;
  onScrape: (ch: ViralChannel) => void;
  onDelete: (id: string) => void;
  isAdmin: boolean;
  canScrape: boolean;
  scrapeDisabledReason?: string;
}
function ChannelRow({ channel, onScrape, onDelete, isAdmin, canScrape, scrapeDisabledReason }: ChannelRowProps) {
  const PlatformIcon = PLATFORM_ICON[channel.platform] ?? Instagram;
  const status = channel.scrape_status;

  return (
    <div className="flex items-center gap-4 px-4 py-3 rounded-xl bg-card border border-border hover:border-border transition-all group">
      {/* Platform + username */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="relative flex-shrink-0">
          {channel.avatar_url ? (
            <img
              src={proxyImg(channel.avatar_url) ?? channel.avatar_url}
              alt={channel.username}
              className="w-9 h-9 rounded-full object-cover border border-border"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }}
            />
          ) : null}
          <div className={`w-9 h-9 rounded-full bg-muted flex items-center justify-center border border-border ${channel.avatar_url ? 'hidden' : ''}`}>
            <PlatformIcon className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-card border border-border flex items-center justify-center">
            <PlatformIcon className="w-2.5 h-2.5 text-muted-foreground" />
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">@{channel.username}</p>
          <p className="text-[10px] text-muted-foreground capitalize">{channel.platform}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="hidden sm:flex items-center gap-5 text-center">
        <div>
          <p className="text-sm font-bold text-foreground tabular-nums">{channel.video_count}</p>
          <p className="text-[10px] text-muted-foreground">videos</p>
        </div>
        <div>
          <p className="text-sm font-bold text-foreground tabular-nums">{fmtViews(channel.avg_views)}</p>
          <p className="text-[10px] text-muted-foreground">avg views</p>
        </div>
        <div>
          <p className="text-[10px] text-foreground">
            {channel.last_scraped_at ? timeAgo(channel.last_scraped_at) : "never"}
          </p>
          <p className="text-[10px] text-muted-foreground">last scraped</p>
        </div>
      </div>

      {/* Status */}
      <div className="flex items-center gap-1.5 w-20 justify-center">
        {status === "running" && (
          <span className="flex items-center gap-1 text-[10px] text-amber-400">
            <Loader2 className="w-3 h-3 animate-spin" />
            Scraping…
          </span>
        )}
        {status === "done" && (
          <span className="flex items-center gap-1 text-[10px] text-emerald-400">
            <CheckCircle2 className="w-3 h-3" />
            Done
          </span>
        )}
        {status === "error" && (
          <span className="flex items-center gap-1 text-[10px] text-red-400" title={channel.scrape_error ?? ""}>
            <AlertCircle className="w-3 h-3" />
            Error
          </span>
        )}
        {status === "idle" && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock className="w-3 h-3" />
            Idle
          </span>
        )}
      </div>

      {/* Actions */}
      {(isAdmin || canScrape) && (
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => onScrape(channel)}
            disabled={status === "running" || !canScrape}
            title={!canScrape ? (scrapeDisabledReason || "Scrape limit reached") : "Scrape now"}
            className="h-7 w-7 rounded-lg flex items-center justify-center bg-muted border border-border hover:bg-muted transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RefreshCw className={cn("w-3.5 h-3.5 text-muted-foreground", status === "running" && "animate-spin")} />
          </button>
          {isAdmin && (
            <button
              onClick={() => onDelete(channel.id)}
              title="Remove channel"
              className="h-7 w-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 bg-muted border border-border hover:bg-red-500/10 hover:border-red-500/30 transition-all"
            >
              <Trash2 className="w-3.5 h-3.5 text-destructive" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Filter options ─────────────────────────────────────────────────────────

const getDateOpts = (t: any): DropdownOption[] => [
  { label: t.allTime, value: "all" },
  { label: t.last7Days, value: "7days" },
  { label: t.last30Days, value: "30days" },
  { label: t.last3Months, value: "3months" },
  { label: t.last6Months, value: "6months" },
  { label: t.last12Months, value: "12months" },
];

const getPlatformOpts = (t: any): DropdownOption[] => [
  { label: t.allPlatforms, value: "all" },
  { label: t.instagram, value: "instagram" },
  { label: t.tiktok, value: "tiktok" },
  { label: t.youtube, value: "youtube" },
];

const getOutlierOpts = (t: any): DropdownOption[] => [
  { label: t.anyOutlier, value: "0" },
  { label: "> 1.5x", value: "1.5" },
  { label: "> 2x", value: "2" },
  { label: "> 5x", value: "5" },
  { label: "> 10x", value: "10" },
  { label: "> 20x", value: "20" },
  { label: "> 50x", value: "50" },
];

const getViewsOpts = (t: any): DropdownOption[] => [
  { label: t.anyViews, value: "0" },
  { label: "> 10K", value: "10000" },
  { label: "> 50K", value: "50000" },
  { label: "> 100K", value: "100000" },
  { label: "> 500K", value: "500000" },
  { label: "> 1M", value: "1000000" },
];

const getEngagementOpts = (t: any): DropdownOption[] => [
  { label: t.anyEngagement, value: "0" },
  { label: "> 1%", value: "1" },
  { label: "> 3%", value: "3" },
  { label: "> 5%", value: "5" },
  { label: "> 8%", value: "8" },
  { label: "> 10%", value: "10" },
];

const getSortOpts = (t: any): DropdownOption[] => [
  { label: `✦ ${t.forYou}`, value: "foryou" },
  { label: t.mostRecent, value: "recent" },
  { label: t.highestOutlier, value: "outlier" },
  { label: t.mostViews, value: "views" },
  { label: t.bestEngagement, value: "engagement" },
];

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ViralToday() {
  const { user, loading: authLoading, isAdmin, isVideographer } = useAuth();
  const { credits, refetch: refetchCredits } = useCredits();
  const [lang, setLang] = useState<Language>("en");
  const t = TRANSLATIONS[lang];

  // A user can scrape if they have a scrape limit configured (regardless of status label)
  const hasSubscription = !!(credits && credits.channel_scrapes_limit > 0);
  const effectiveScrapeLimit = credits?.channel_scrapes_limit ?? 0;
  const scrapesRemaining = credits ? Math.max(0, effectiveScrapeLimit - (credits.channel_scrapes_used ?? 0)) : 0;
  const canScrape = isAdmin || isVideographer || (hasSubscription && scrapesRemaining > 0);
  const scrapeDisabledReason = !hasSubscription
    ? "No scrape limit configured"
    : scrapesRemaining <= 0
    ? `Scrape limit reached (${credits?.channel_scrapes_used ?? 0}/${effectiveScrapeLimit})`
    : undefined;

  // View: videos | channels
  const [view, setView] = useState<"videos" | "channels" | "reels">(isAdmin ? "reels" : "videos");

  // Data — hydrate from cache for instant render, refetch in background.
  const [videos, setVideos] = useState<ViralVideo[]>(() => readCache<ViralVideo[]>("viral_videos", []));
  const [channels, setChannels] = useState<ViralChannel[]>(() => readCache<ViralChannel[]>("viral_channels", []));
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [loadingChannels, setLoadingChannels] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [filterDate, setFilterDate] = useState("12months");
  const [filterPlatform, setFilterPlatform] = useState("all");
  const [filterOutlier, setFilterOutlier] = useState("2.5");
  const [filterViews, setFilterViews] = useState("0");
  const [filterEngagement, setFilterEngagement] = useState("0");
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [filterSource, setFilterSource] = useState("all"); // "all" | "channels" | "discovered"
  const [filterSort, setFilterSort] = useState("foryou");
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const videosPerPage = 100;

  // ── Feed algorithm state ──────────────────────────────────────────────────
  // initialInteractions is the snapshot from DB at mount — used for "For You" sort's unseen_bonus.
  // Read-only: no session tracking, no flush, no mid-session updates.
  const [initialInteractions, setInitialInteractions] = useState<Map<string, { seen_count: number; clicked: boolean }>>(new Map());
  const [nicheKeywords, setNicheKeywords] = useState<string[]>([]);
  const [userChannelIds, setUserChannelIds] = useState<Set<string>>(new Set());

  // Add channel form
  const [newUsername, setNewUsername] = useState("");
  const [addingChannel, setAddingChannel] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<"instagram" | "tiktok" | "youtube">("instagram");
  const [platformDropdownOpen, setPlatformDropdownOpen] = useState(false);

  // Batch selection
  const [selectedVideos, setSelectedVideos] = useState<Map<string, ViralVideo>>(new Map());
  const [showBatchModal, setShowBatchModal] = useState(false);

  const toggleVideoSelect = useCallback((video: ViralVideo) => {
    setSelectedVideos((prev) => {
      const next = new Map(prev);
      if (next.has(video.id)) {
        next.delete(video.id);
      } else {
        if (next.size >= 10) {
          toast.error("Maximum 10 videos per batch");
          return prev;
        }
        next.set(video.id, video);
      }
      return next;
    });
  }, []);

  // Polling ref for running channels
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelsRef = useRef<ViralChannel[]>([]);

  // ── Data fetching ────────────────────────────────────────────────────────────

  const fetchChannels = useCallback(async () => {
    setLoadingChannels(true);
    try {
      let q = supabase.from("viral_channels").select("*").order("created_at", { ascending: false });
      // Non-admin users only see their own channels
      if (!isAdmin && !isVideographer && user) {
        q = q.eq("created_by", user.id);
      }
      const { data, error } = await q;
      if (error) throw error;
      const channels = (data ?? []) as ViralChannel[];
      setChannels(channels);
      writeCache("viral_channels", channels);

      // Clear stale Instagram/Facebook CDN avatar URLs so they re-cache on next scrape.
      // These URLs expire — storing them causes broken images until the channel is re-scraped.
      const staleIds = channels
        .filter(c => c.avatar_url && EXPIRED_CDN_PATTERN.test(c.avatar_url))
        .map(c => c.id);
      if (staleIds.length > 0) {
        supabase.from("viral_channels")
          .update({ avatar_url: null })
          .in("id", staleIds)
          .then(() => {
            setChannels(prev => prev.map(c => staleIds.includes(c.id) ? { ...c, avatar_url: null } : c));
          });
      }
    } catch {
      toast.error("Error loading channels");
    } finally {
      setLoadingChannels(false);
    }
  }, [isAdmin, isVideographer, user]);

  const fetchVideos = useCallback(async (opts?: {
    platform?: string; date?: string; outlier?: string; views?: string; engagement?: string;
  }) => {
    setLoadingVideos(true);
    try {
      const PAGE_SIZE = 1000;
      const MAX_VIDEOS = 5000;
      let allVideos: ViralVideo[] = [];
      let page = 0;

      while (allVideos.length < MAX_VIDEOS) {
        let q = supabase
          .from("viral_videos")
          .select("*")
          .order("scraped_at", { ascending: false });

        // ── Server-side filters (pushed to Postgres) ──────────────────────────
        const p = opts?.platform ?? filterPlatform;
        if (p && p !== "all") q = q.eq("platform", p);

        const d = opts?.date ?? filterDate;
        if (d && d !== "all") {
          const daysMap: Record<string, number> = { "7days": 7, "30days": 30, "3months": 90, "6months": 180, "12months": 365 };
          const days = daysMap[d];
          if (days) {
            const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
            q = q.gte("posted_at", cutoff);
          }
        }

        const o = parseFloat(opts?.outlier ?? filterOutlier);
        if (o > 0) q = q.gte("outlier_score", o);

        const v = parseInt(opts?.views ?? filterViews);
        if (v > 0) q = q.gte("views_count", v);

        const e = parseFloat(opts?.engagement ?? filterEngagement);
        if (e > 0) q = q.gte("engagement_rate", e);

        q = q.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        const { data, error } = await q;

        if (error) throw error;
        const batch = (data ?? []) as ViralVideo[];
        allVideos = [...allVideos, ...batch];

        if (batch.length < PAGE_SIZE) break;
        page++;
      }

      setVideos(allVideos);
      writeCache("viral_videos", allVideos);
      setCurrentPage(0);
    } catch {
      toast.error("Error loading videos");
    } finally {
      setLoadingVideos(false);
    }
  }, [filterPlatform, filterDate, filterOutlier, filterViews, filterEngagement]);

  // Mount-only: load channels + videos once when user becomes available
  const didMount = useRef(false);
  useEffect(() => {
    if (!user || didMount.current) return;
    didMount.current = true;
    fetchChannels();
    fetchVideos();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Re-fetch from server when heavy filters change (debounced) ────────────
  const filterGenRef = useRef(0);
  useEffect(() => {
    if (!user) return;
    // Skip the initial mount (fetchVideos already called above)
    const gen = ++filterGenRef.current;
    if (gen === 1) return;
    const timer = setTimeout(() => {
      if (filterGenRef.current === gen) fetchVideos();
    }, 300);
    return () => clearTimeout(timer);
  }, [filterPlatform, filterDate, filterOutlier, filterViews, filterEngagement]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch user interactions for feed algorithm ────────────────────────────
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("viral_video_interactions")
        .select("video_id, seen_count, clicked")
        .eq("user_id", user.id);
      if (data) {
        const map = new Map<string, { seen_count: number; clicked: boolean }>();
        data.forEach((r: any) => map.set(r.video_id, { seen_count: r.seen_count, clicked: r.clicked }));
        setInitialInteractions(map);
      }
    })();
  }, [user]);

  // ── Fetch niche keywords from selected client ─────────────────────────────
  useEffect(() => {
    const clientId = localStorage.getItem("dashboard_viewMode");
    if (!clientId || clientId === "master" || clientId === "me") {
      setNicheKeywords([]);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("clients")
        .select("niche_keywords, onboarding_data")
        .eq("id", clientId)
        .maybeSingle();
      if (!data) return;
      // Use stored keywords, or auto-extract from onboarding
      let kws: string[] = data.niche_keywords ?? [];
      if (kws.length === 0 && data.onboarding_data) {
        const od = data.onboarding_data as Record<string, string>;
        const fields = [od.industry, od.industryOther, od.niche, od.target_client, od.unique_offer].filter(Boolean);
        const extracted = fields.join(" ").toLowerCase().split(/[\s,;|]+/).filter(w => w.length > 2);
        kws = [...new Set(extracted)];
        // Persist auto-extracted keywords
        if (kws.length > 0) {
          await supabase.from("clients").update({ niche_keywords: kws }).eq("id", clientId);
        }
      }
      setNicheKeywords(kws);
    })();
  }, []);

  // ── Track which channels the current user added (for affinity boost) ──────
  useEffect(() => {
    if (!user) return;
    const owned = new Set(channels.filter(c => (c as any).created_by === user.id).map(c => c.id));
    setUserChannelIds(owned);
  }, [channels, user]);

  // ── Callback for VideoCard to report click ────────────────────────────────
  // Only writes to DB for future sessions — no local state update so grid stays stable.
  const reportClick = useCallback(async (videoId: string) => {
    if (!user) return;
    await supabase.from("viral_video_interactions").upsert({
      user_id: user.id,
      video_id: videoId,
      clicked: true,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: "user_id,video_id" });
  }, [user]);

  // Keep channelsRef in sync so the poll interval always reads the latest channels
  useEffect(() => {
    channelsRef.current = channels;
  }, [channels]);

  // Poll running channels every 8 seconds
  useEffect(() => {
    const running = channels.filter((c) => c.scrape_status === "running");
    if (running.length === 0) {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      return;
    }

    if (pollRef.current) return; // already polling

    pollRef.current = setInterval(async () => {
      const stillRunning = channelsRef.current.filter((c) => c.scrape_status === "running");
      if (stillRunning.length === 0) {
        clearInterval(pollRef.current!);
        pollRef.current = null;
        return;
      }

      for (const ch of stillRunning) {
        try {
          const { data: result, error } = await supabase.functions.invoke("scrape-channel", {
            body: { action: "check", channelId: ch.id },
          });
          if (error) continue;
          if (result?.status === "done") {
            toast.success(`@${ch.username} scraped — ${result.videosStored ?? 0} videos updated`);
            fetchChannels();
            // Refresh videos for this channel (replace existing rows with updated stats)
            const { data: newVideos } = await supabase
              .from("viral_videos")
              .select("*")
              .eq("channel_id", ch.id)
              .order("posted_at", { ascending: false })
              .limit(200);
            if (newVideos && newVideos.length > 0) {
              setVideos((prev) => {
                // Replace all videos from this channel with the freshly fetched ones
                const others = prev.filter((v) => v.channel_id !== ch.id);
                return [...(newVideos as ViralVideo[]), ...others];
              });
            }
          } else if (result?.status === "error") {
            toast.error(`@${ch.username} scrape failed`);
            fetchChannels();
          }
        } catch {
          // silent poll failure
        }
      }
    }, 8_000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [channels, fetchChannels]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ──────────────────────────────────────────────────────────────────

  const handleAddChannel = async () => {
    const detected = detectPlatformAndUsername(newUsername);
    const hasUrlPattern = /instagram\.com|tiktok\.com|youtube\.com|youtu\.be/i.test(newUsername.trim());
    const platform = hasUrlPattern ? detected.platform : selectedPlatform;
    const username = detected.username;
    if (!username) {
      toast.error("Enter a username or URL");
      return;
    }

    // Enforce scrape limits for non-admin users
    if (!isAdmin && !canScrape) {
      toast.error(scrapeDisabledReason || "Scrape limit reached");
      return;
    }

    setAddingChannel(true);
    try {
      // Create or fetch existing channel
      const { data: existing } = await supabase
        .from("viral_channels")
        .select("id")
        .eq("platform", platform)
        .eq("username", username)
        .maybeSingle();

      let channelId: string;

      if (existing) {
        channelId = existing.id;
        toast.info(`@${username} already in your watchlist — re-scraping`);
      } else {
        const { data: created, error } = await supabase
          .from("viral_channels")
          .insert({ username, platform, created_by: user?.id })
          .select("id")
          .single();
        if (error) throw error;
        channelId = created.id;
      }

      setNewUsername("");
      await fetchChannels();

      // Trigger scrape
      const { data: scrapeResult, error: scrapeError } = await supabase.functions.invoke(
        "scrape-channel",
        { body: { channelId, username, platform } }
      );

      if (scrapeError) throw scrapeError;

      if (scrapeResult?.server_busy) {
        toast.warning("Server busy — please try again in ~30 seconds");
        fetchChannels();
        return;
      }

      if (scrapeResult?.status === "done") {
        toast.success(`@${username} scraped — ${scrapeResult.videosStored ?? 0} videos added`);
        fetchVideos();
        fetchChannels();
        // Increment scrape usage for non-admin
        if (!isAdmin && !isVideographer && credits?.id) {
          await supabase.from("clients").update({ channel_scrapes_used: (credits.channel_scrapes_used ?? 0) + 1 }).eq("id", credits.id);
          refetchCredits();
        }
      } else {
        toast.info(`Scraping @${username}… check back in a moment`);
        fetchChannels();
        if (!isAdmin && !isVideographer && credits?.id) {
          await supabase.from("clients").update({ channel_scrapes_used: (credits.channel_scrapes_used ?? 0) + 1 }).eq("id", credits.id);
          refetchCredits();
        }
      }
    } catch (e: any) {
      toast.error(e.message || "Error adding channel");
    } finally {
      setAddingChannel(false);
    }
  };

  const handleScrape = async (ch: ViralChannel) => {
    if (!isAdmin && !canScrape) {
      toast.error(scrapeDisabledReason || "Scrape limit reached");
      return;
    }
    try {
      await supabase
        .from("viral_channels")
        .update({ scrape_status: "running" })
        .eq("id", ch.id);
      setChannels((prev) =>
        prev.map((c) => (c.id === ch.id ? { ...c, scrape_status: "running" } : c))
      );

      const { data, error } = await supabase.functions.invoke("scrape-channel", {
        body: { channelId: ch.id, username: ch.username, platform: ch.platform },
      });

      if (error) throw error;

      if (data?.server_busy) {
        toast.warning("Server busy — please try again in ~30 seconds");
        fetchChannels();
        return;
      }

      if (data?.status === "done") {
        toast.success(`@${ch.username} scraped — ${data.videosStored ?? 0} videos`);
        fetchVideos();
        fetchChannels();
        if (!isAdmin && !isVideographer && credits?.id) {
          await supabase.from("clients").update({ channel_scrapes_used: (credits.channel_scrapes_used ?? 0) + 1 }).eq("id", credits.id);
          refetchCredits();
        }
      } else {
        toast.info(`Scraping @${ch.username}…`);
        fetchChannels();
        if (!isAdmin && !isVideographer && credits?.id) {
          await supabase.from("clients").update({ channel_scrapes_used: (credits.channel_scrapes_used ?? 0) + 1 }).eq("id", credits.id);
          refetchCredits();
        }
      }
    } catch (e: any) {
      toast.error(e.message || "Error scraping channel");
      fetchChannels();
    }
  };

  const handleDeleteChannel = async (id: string) => {
    const ch = channels.find((c) => c.id === id);
    if (!confirm(`Remove @${ch?.username ?? "this channel"} and all its videos?`)) return;
    const { error } = await supabase.from("viral_channels").delete().eq("id", id);
    if (error) {
      toast.error("Error removing channel");
      return;
    }
    toast.success("Channel removed");
    setChannels((prev) => prev.filter((c) => c.id !== id));
    setVideos((prev) => prev.filter((v) => v.channel_id !== id));
  };

  const handleDiscoverSearch = async () => {
    if (!search.trim() || isDiscovering) return;
    setIsDiscovering(true);
    try {
      const { data, error } = await supabase.functions.invoke("scrape-reels-search", {
        body: { query: search.trim() },
      });
      if (error) {
        // Extract actual error from edge function response
        let msg = "Search failed";
        try {
          const body = data ?? (error as any).context ? await (error as any).context?.json?.() : null;
          msg = body?.error || error.message || msg;
        } catch { msg = error.message || msg; }
        // Friendly messages for known IG errors
        if (msg.includes("challenge_required") || msg.includes("login_required")) {
          msg = "Instagram search is temporarily unavailable. Please try again in a few minutes.";
        }
        throw new Error(msg);
      }
      if (data?.cached) {
        toast.info(`Already searched "${search.trim()}" recently — switch Source to "Discovered" to see results`);
        setFilterSource("discovered");
        setFilterOutlier("0");
      } else {
        toast.success(`Found ${data?.inserted ?? 0} videos for "${search.trim()}"`);
        // Auto-switch to Discovered source + remove outlier filter so results are visible
        setFilterSource("discovered");
        setFilterOutlier("0");
        fetchVideos();
      }
    } catch (e: any) {
      toast.error(e.message || "Search failed");
    } finally {
      setIsDiscovering(false);
    }
  };

  // ── Feed score function (memoized) ─────────────────────────────────────────
  const computeFeedScore = useMemo(
    () => buildFeedScorer(initialInteractions, nicheKeywords, userChannelIds),
    [initialInteractions, nicheKeywords, userChannelIds]
  );

  // ── Filtered videos ──────────────────────────────────────────────────────────

  const filteredVideos = (() => {
    let result = [...videos];

    // Channel filter
    if (selectedChannelIds.length > 0) {
      result = result.filter((v) => selectedChannelIds.includes(v.channel_id));
    }

    // Source filter
    if (filterSource === "channels") {
      result = result.filter((v) => v.channel_id !== null);
    } else if (filterSource === "discovered") {
      result = result.filter((v) => v.channel_id === null);
    }

    // Platform, date, outlier, views, engagement are filtered server-side in fetchVideos()

    // Smart search: hashtag_source match, strip #/@, partial words, joined words
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const words = q.split(/\s+/);
      const joined = words.join(""); // "saleshumor"
      result = result.filter((v) => {
        // 1. Direct match on hashtag_source (discovered videos tagged with this query)
        if (v.hashtag_source && v.hashtag_source.toLowerCase().includes(q)) return true;
        // Build searchable text: caption + username, strip # and @
        const raw = ((v.caption || "") + " " + v.channel_username).toLowerCase();
        const clean = raw.replace(/[#@]/g, ""); // "#saleshumor" → "saleshumor"
        // 2. Every word found independently ("sales" + "humor" both in text)
        if (words.every((w) => clean.includes(w))) return true;
        // 3. Joined query as one word ("saleshumor" in "saleshumor #funny")
        if (clean.replace(/\s+/g, "").includes(joined)) return true;
        // 4. Any single word partial match on hashtags (so "sales" finds "#saleslife")
        if (words.some((w) => clean.includes(w))) return true;
        return false;
      });
    }

    // Sort
    switch (filterSort) {
      case "foryou": {
        const now = Date.now();
        result.sort((a, b) => {
          const scoreA = computeFeedScore(a, now);
          const scoreB = computeFeedScore(b, now);
          return scoreB - scoreA;
        });
        break;
      }
      case "outlier":
        result.sort((a, b) => b.outlier_score - a.outlier_score);
        break;
      case "views":
        result.sort((a, b) => b.views_count - a.views_count);
        break;
      case "engagement":
        result.sort((a, b) => b.engagement_rate - a.engagement_rate);
        break;
      default: // recent
        result.sort(
          (a, b) =>
            new Date(b.posted_at ?? b.scraped_at).getTime() -
            new Date(a.posted_at ?? a.scraped_at).getTime()
        );
    }

    return result;
  })();

  // Pagination
  const totalPages = Math.ceil(filteredVideos.length / videosPerPage);
  const paginatedVideos = filteredVideos.slice(
    currentPage * videosPerPage,
    (currentPage + 1) * videosPerPage
  );

  const hasActiveFilters =
    filterPlatform !== "all" ||
    filterDate !== "12months" ||
    filterOutlier !== "0" ||
    filterViews !== "0" ||
    filterEngagement !== "0" ||
    filterSource !== "all" ||
    selectedChannelIds.length > 0;

  const clearFilters = () => {
    setFilterDate("12months");
    setFilterPlatform("all");
    setFilterOutlier("0");
    setFilterViews("0");
    setFilterEngagement("0");
    setFilterSource("all");
    setFilterSort("foryou");
    setSelectedChannelIds([]);
    setSearch("");
    setShowSeen(false);
    setCurrentPage(0);
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const runningChannels = channels.filter((c) => c.scrape_status === "running");

  // ── Reels view — admin only, full-height, own scroll context ────────────
  if (view === "reels" && isAdmin) {
    return (
      <PageTransition className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Compact header */}
        <div className="px-5 sm:px-8 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-xl font-bold text-foreground tracking-tight font-caslon">Viral Reels</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Scroll through your top viral content</p>
            </div>
            <div className="flex items-center gap-1 bg-muted border border-border rounded-lg p-0.5">
              <button
                onClick={() => setView("videos")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground transition-all"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                Grid
              </button>
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-card text-foreground transition-all">
                <Play className="w-3.5 h-3.5" />
                Reels
              </button>
              <button
                onClick={() => setView("channels")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground transition-all"
              >
                <Radio className="w-3.5 h-3.5" />
                {t.channels}
              </button>
            </div>
          </div>
        </div>
        {/* Reel feed fills remaining height */}
        <Suspense fallback={<div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
          <ViralReelFeed />
        </Suspense>
      </PageTransition>
    );
  }

  return (
    <PageTransition className="flex-1 flex flex-col min-h-screen overflow-hidden">

        <div className="flex-1 px-5 sm:px-8 pt-6 pb-12 overflow-auto">

          {/* ── Header ── */}
          <div className="mb-5">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-xl font-bold text-foreground tracking-tight font-caslon">
                  {view === "videos" ? "Videos" : view === "reels" ? "Viral Reels" : t.channels}
                </h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {view === "videos"
                    ? t.videosDesc
                    : view === "reels"
                    ? "Scroll through your top viral content"
                    : t.channelsDesc}
                </p>
              </div>

              {/* Language toggle + View toggle */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setLang(lang === "en" ? "es" : "en")}
                  className="px-2 py-1 rounded-md text-xs font-medium bg-muted border border-border text-foreground hover:bg-muted/80 transition-all"
                >
                  {lang === "en" ? "ES" : "EN"}
                </button>
                <div className="flex items-center gap-1 bg-muted border border-border rounded-lg p-0.5">
                  <button
                    onClick={() => setView("videos")}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                      view === "videos"
                        ? "bg-card text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    {t.videos}
                    {videos.length > 0 && (
                      <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full">
                        {filteredVideos.length}
                      </span>
                    )}
                  </button>
                  {isAdmin ? (
                    <button
                      onClick={() => setView("reels")}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                        view === "reels"
                          ? "bg-card text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Play className="w-3.5 h-3.5" />
                      Reels
                    </button>
                  ) : (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground/50 cursor-default" title="Coming soon">
                      <Play className="w-3.5 h-3.5" />
                      Reels
                      <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded-full">Soon</span>
                    </span>
                  )}
                  <button
                    onClick={() => setView("channels")}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                      view === "channels"
                        ? "bg-card text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Radio className="w-3.5 h-3.5" />
                    {t.channels}
                    {channels.length > 0 && (
                      <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full">
                        {channels.length}
                      </span>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ── VIDEOS VIEW ── */}
          <AnimatePresence mode="wait">
            {view === "videos" && (
              <motion.div
                key="videos"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {/* Search + sort bar */}
                <div className="flex items-center gap-2 mb-3">
                  <div className="relative flex-1 max-w-lg">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={t.search}
                      className="w-full h-8 pl-9 pr-4 bg-input border border-border rounded-lg text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50 transition-all"
                    />
                    {search && (
                      <button
                        onClick={() => setSearch("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2"
                      >
                        <X className="w-3 h-3 text-muted-foreground" />
                      </button>
                    )}
                  </div>

                  {/* Search Instagram — admin only */}
                  {isAdmin && (
                    <Button
                      onClick={handleDiscoverSearch}
                      disabled={isDiscovering || !search.trim()}
                      className="h-8 px-3 bg-pink-500/15 hover:bg-pink-500/25 border border-pink-500/30 text-pink-400 text-[11px] font-semibold rounded-lg flex items-center gap-1.5 transition-all shrink-0"
                    >
                      {isDiscovering ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Instagram className="w-3 h-3" />
                      )}
                      {isDiscovering ? "Searching…" : "Search Instagram"}
                    </Button>
                  )}

                  {/* Sort */}
                  <FilterChip
                    label={t.sort}
                    options={getSortOpts(t)}
                    value={filterSort}
                    onChange={setFilterSort}
                    isActive={filterSort !== "foryou"}
                  />

                </div>

                {/* Filter chips */}
                <div className="flex items-center gap-1.5 mb-5 flex-wrap">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-[#94a3b8] flex-shrink-0" />

                  <ChannelChip
                    channels={channels}
                    selected={selectedChannelIds}
                    onChange={setSelectedChannelIds}
                  />

                  <FilterChip
                    label="Source"
                    options={[
                      { label: "All sources", value: "all" },
                      { label: "Channels", value: "channels" },
                      { label: "Discovered", value: "discovered" },
                    ]}
                    value={filterSource}
                    onChange={setFilterSource}
                    isActive={filterSource !== "all"}
                  />

                  <FilterChip
                    label={t.allTime}
                    options={getDateOpts(t)}
                    value={filterDate}
                    onChange={setFilterDate}
                    isActive={filterDate !== "all" && filterDate !== "12months"}
                  />

                  <FilterChip
                    label={t.platforms}
                    options={getPlatformOpts(t)}
                    value={filterPlatform}
                    onChange={setFilterPlatform}
                    isActive={filterPlatform !== "all"}
                  />

                  <FilterChip
                    label={t.outlier}
                    options={getOutlierOpts(t)}
                    value={filterOutlier}
                    onChange={setFilterOutlier}
                    isActive={filterOutlier !== "0"}
                  />

                  <FilterChip
                    label={t.views}
                    options={getViewsOpts(t)}
                    value={filterViews}
                    onChange={setFilterViews}
                    isActive={filterViews !== "0"}
                  />

                  <FilterChip
                    label={t.engagement}
                    options={getEngagementOpts(t)}
                    value={filterEngagement}
                    onChange={setFilterEngagement}
                    isActive={filterEngagement !== "0"}
                  />

                  {hasActiveFilters && (
                    <button
                      onClick={clearFilters}
                      className="h-7 px-3 rounded-full text-[11px] font-medium text-destructive border border-destructive/30 bg-destructive/10 hover:bg-destructive/20 transition-all flex items-center gap-1"
                    >
                      <X className="w-3 h-3" />
                      {t.clear}
                    </button>
                  )}
                </div>

                {/* Running indicator */}
                {runningChannels.length > 0 && (
                  <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-400 w-fit">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {t.scraping} {runningChannels.map((c) => `@${c.username}`).join(", ")}… {t.refreshing}
                  </div>
                )}

                {/* Video grid */}
                {loadingVideos ? (
                  <div className="flex items-center justify-center py-24">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : videos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-24 text-center">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 bg-muted border border-border">
                      <TrendingUp className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium text-foreground mb-1">{t.noVideos}</p>
                    <p className="text-xs text-muted-foreground max-w-xs mb-5">
                      {t.noVideosDesc}
                    </p>
                    <button
                      onClick={() => setView("channels")}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-muted border border-border text-foreground hover:bg-muted/80 text-xs font-medium transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {t.addChannels}
                    </button>
                  </div>
                ) : filteredVideos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-24 text-center">
                    <Filter className="w-6 h-6 text-[#94a3b8] mb-3" />
                    <p className="text-sm font-medium text-foreground mb-1">{t.noVideosMatch}</p>
                    <button
                      onClick={clearFilters}
                      className="mt-3 text-xs text-primary hover:text-primary/80 transition-colors"
                    >
                      {t.clearAllFilters}
                    </button>
                  </div>
                ) : (
                  <div>
                    <motion.div
                      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 mb-6"
                    >
                      <AnimatePresence>
                        {paginatedVideos.map((v) => (
                          <VideoCard
                            key={v.id}
                            video={v}
                            isAdmin={isAdmin}
                            onDelete={(id) => setVideos((prev) => prev.filter((x) => x.id !== id))}
                            selected={selectedVideos.has(v.id)}
                            onToggleSelect={toggleVideoSelect}
                            onClickVideo={reportClick}
                          />
                        ))}
                      </AnimatePresence>
                    </motion.div>

                    {/* Pagination Controls - Simple Centered */}
                    {videos.length > 0 && (
                      <div className="mt-8 flex flex-col items-center justify-center gap-4">
                        <div className="flex items-center gap-2 flex-wrap justify-center">
                          <button
                            onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                            disabled={currentPage === 0}
                            className="px-3 py-1.5 rounded-md text-xs font-semibold bg-muted text-foreground border border-border disabled:opacity-50 disabled:cursor-not-allowed hover:bg-muted/80 transition-all"
                          >
                            Previous
                          </button>
                          <div className="flex items-center gap-1 flex-wrap justify-center">
                            {(() => {
                              const pages: (number | "...")[] = [];
                              if (totalPages <= 7) {
                                for (let i = 0; i < totalPages; i++) pages.push(i);
                              } else {
                                pages.push(0);
                                if (currentPage > 3) pages.push("...");
                                for (let i = Math.max(1, currentPage - 1); i <= Math.min(totalPages - 2, currentPage + 1); i++) pages.push(i);
                                if (currentPage < totalPages - 4) pages.push("...");
                                pages.push(totalPages - 1);
                              }
                              return pages.map((page, idx) =>
                                page === "..." ? (
                                  <span key={`ellipsis-${idx}`} className="px-1 text-xs text-muted-foreground">…</span>
                                ) : (
                                  <button
                                    key={page}
                                    onClick={() => setCurrentPage(page)}
                                    className={cn(
                                      "px-2 py-1 rounded-md text-xs font-semibold transition-all border",
                                      currentPage === page
                                        ? "bg-primary text-primary-foreground border-primary"
                                        : "bg-muted text-foreground border-border hover:bg-muted/80"
                                    )}
                                  >
                                    {page + 1}
                                  </button>
                                )
                              );
                            })()}
                          </div>
                          <button
                            onClick={() => setCurrentPage(Math.min(Math.max(0, totalPages - 1), currentPage + 1))}
                            disabled={currentPage >= totalPages - 1}
                            className="px-3 py-1.5 rounded-md text-xs font-semibold bg-muted text-foreground border border-border disabled:opacity-50 disabled:cursor-not-allowed hover:bg-muted/80 transition-all"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}

            {/* ── CHANNELS VIEW ── */}
            {view === "channels" && (
              <motion.div
                key="channels"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {/* Add channel — compact row with platform dropdown */}
                {(isAdmin || isVideographer || hasSubscription) && (
                  <div className="flex flex-col gap-2 mb-5">
                    {(() => {
                      const hasUrl = /instagram\.com|tiktok\.com|youtube\.com|youtu\.be/i.test(newUsername.trim());
                      const autoDetected = newUsername.trim() && hasUrl ? detectPlatformAndUsername(newUsername).platform : null;
                      const activePlatform = autoDetected ?? selectedPlatform;
                      const PLATFORMS = [
                        { value: "instagram" as const, label: "Instagram Reels", icon: Instagram, color: "text-pink-400",   bg: "bg-pink-500/10" },
                        { value: "tiktok"    as const, label: "TikTok",          icon: TikTokIcon, color: "text-orange-400", bg: "bg-orange-500/10" },
                        { value: "youtube"   as const, label: "YouTube Shorts",  icon: Youtube,   color: "text-red-400",    bg: "bg-red-500/10" },
                      ];
                      const activeCfg = PLATFORMS.find(p => p.value === activePlatform)!;
                      const ActiveIcon = activeCfg.icon;
                      return (
                        <div className="flex items-center gap-2 p-3 rounded-xl bg-card border border-border">
                          {/* Platform dropdown */}
                          <div className="relative flex-shrink-0">
                            <button
                              onClick={() => setPlatformDropdownOpen(o => !o)}
                              className={`flex items-center gap-2 h-9 px-3 rounded-lg border text-xs font-semibold transition-all ${activeCfg.bg} ${activeCfg.color} border-transparent hover:border-border`}
                            >
                              <ActiveIcon className="w-3.5 h-3.5" />
                              {activeCfg.label}
                              <ChevronDown className={`w-3 h-3 transition-transform ${platformDropdownOpen ? "rotate-180" : ""}`} />
                            </button>
                            {platformDropdownOpen && (
                              <div className="absolute top-full left-0 mt-1 w-44 rounded-lg bg-popover border border-border shadow-lg z-50 py-1 overflow-hidden">
                                {PLATFORMS.map((p) => {
                                  const PIcon = p.icon;
                                  const isActive = activePlatform === p.value;
                                  return (
                                    <button
                                      key={p.value}
                                      onClick={() => { setSelectedPlatform(p.value); setNewUsername(""); setPlatformDropdownOpen(false); }}
                                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium transition-all text-left ${
                                        isActive ? `${p.bg} ${p.color}` : "text-muted-foreground hover:text-foreground hover:bg-muted"
                                      }`}
                                    >
                                      <PIcon className="w-3.5 h-3.5 flex-shrink-0" />
                                      {p.label}
                                      {isActive && <CheckCircle2 className="w-3 h-3 ml-auto" />}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                          {/* Username input */}
                          <input
                            type="text"
                            value={newUsername}
                            onChange={(e) => { setNewUsername(e.target.value); setPlatformDropdownOpen(false); }}
                            onKeyDown={(e) => e.key === "Enter" && handleAddChannel()}
                            placeholder="@username"
                            disabled={!canScrape && !isAdmin}
                            className="flex-1 h-9 px-3 bg-input border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50 transition-all disabled:opacity-50"
                          />
                          {/* Submit */}
                          <Button
                            onClick={handleAddChannel}
                            disabled={addingChannel || !newUsername.trim() || (!canScrape && !isAdmin)}
                            className="h-9 px-4 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all shrink-0"
                          >
                            {addingChannel ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                            {t.addScrape}
                          </Button>
                        </div>
                      );
                    })()}
                    {/* Scrape usage for subscribers */}
                    {!isAdmin && !isVideographer && credits && credits.channel_scrapes_limit > 0 && (
                      <div className="flex items-center gap-2 px-4 text-xs text-muted-foreground">
                        <span>{credits.channel_scrapes_used} / {credits.channel_scrapes_limit} scrapes used</span>
                        {scrapesRemaining <= 3 && scrapesRemaining > 0 && (
                          <span className="text-yellow-500 font-medium">{scrapesRemaining} remaining</span>
                        )}
                        {scrapesRemaining <= 0 && (
                          <span className="text-red-400 font-medium">Limit reached</span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Channel list */}
                {loadingChannels ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : channels.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 bg-muted border border-border">
                      <Radio className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium text-foreground mb-1">{t.noChannels}</p>
                    <p className="text-xs text-muted-foreground max-w-xs">
                      {(isAdmin || isVideographer || hasSubscription)
                        ? t.noChannelsDesc
                        : t.noChannelsTeamDesc}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {channels.map((ch) => (
                      <ChannelRow
                        key={ch.id}
                        channel={ch}
                        onScrape={handleScrape}
                        onDelete={handleDeleteChannel}
                        isAdmin={isAdmin}
                        canScrape={canScrape}
                        scrapeDisabledReason={scrapeDisabledReason}
                      />
                    ))}

                    {/* Summary */}
                    <div className="pt-4 flex items-center gap-4 text-xs text-muted-foreground border-t border-border">
                      <span>{channels.length} {t.channels}</span>
                      <span>·</span>
                      <span>{videos.length} {t.totalVideos}</span>
                      {runningChannels.length > 0 && (
                        <>
                          <span>·</span>
                          <span className="text-amber-500 flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            {runningChannels.length} {t.scraping}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      {/* Floating action bar — visible when 2+ videos selected (admin only) */}
      <AnimatePresence>
        {isAdmin && selectedVideos.size >= 2 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 px-5 py-3 rounded-2xl shadow-2xl"
            style={{
              background: "rgba(24,24,27,0.85)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(63,63,70,0.5)",
            }}
          >
            <span style={{ fontSize: 13, color: "#a1a1aa" }}>
              <span style={{ color: "#06b6d4", fontWeight: 700 }}>{selectedVideos.size}</span> videos selected
            </span>
            <button
              onClick={() => setShowBatchModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:brightness-110"
              style={{ background: "#06b6d4", color: "#000" }}
            >
              Generate Scripts <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setSelectedVideos(new Map())}
              style={{ fontSize: 12, color: "#71717a", background: "none", border: "none", cursor: "pointer" }}
              className="hover:text-white transition-colors"
            >
              Clear
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Batch Script Modal */}
      <Suspense fallback={null}>
        {showBatchModal && (
          <BatchScriptModal
            open={showBatchModal}
            onClose={() => setShowBatchModal(false)}
            selectedVideos={selectedVideos}
            onRemoveVideo={(id) => {
              setSelectedVideos((prev) => {
                const next = new Map(prev);
                next.delete(id);
                return next;
              });
            }}
          />
        )}
      </Suspense>
      </PageTransition>
  );
}
