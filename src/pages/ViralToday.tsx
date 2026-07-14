import { useState, useEffect, useCallback, useRef, useMemo, memo, Suspense, lazy } from "react";
import PageTransition from "@/components/PageTransition";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { readCache, writeCache } from "@/lib/sessionCache";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { toast } from "sonner";
import {
  Loader2, TrendingUp, Instagram, Search, ChevronDown, X,
  Plus, Trash2, RefreshCw, Play, Eye, Zap, Radio, ArrowRight,
  LayoutGrid, List, ExternalLink, CheckCircle2, AlertCircle,
  Clock, Flame, Filter, SlidersHorizontal, Youtube, CheckSquare, Star,
  Sparkles, Download, Facebook,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useCredits } from "@/hooks/useCredits";
import { getAuthToken } from "@/lib/getAuthToken";
import { detectPlatformAndUsername } from "@/lib/viral/channelHandle";
const BatchScriptModal = lazy(() => import("@/components/BatchScriptModal"));
import { FilterRail } from "@/components/viral-today/FilterRail";
import BulkAnalyzeModal from "@/components/viral-today/BulkAnalyzeModal";
import { type FiltersPanelValue } from "@/components/viral-today/FilterRail";
import { type ContentFormat, nicheLabel } from "@/lib/video-taxonomy";
import {
  fmtViews,
  fmtOutlier,
  timeAgo,
  proxyImg,
  getOutlierColor,
  viralBadgeClass,
  getViewsColor,
  getEngagementColor,
  gridGradientFor,
  PLATFORM_ICON,
  TikTokIcon,
  EXPIRED_CDN_PATTERN,
} from "@/lib/viral-card-utils";

// ── Language support ──────────────────────────────────────────────────────

type Language = "en" | "es";

// ── "Calm" motion (Viral Today redesign) ──
// Slow ease-out (quint-ish) with a gentle rise-and-fade entrance. Per-card
// delay is derived from the card's index and HARD-CAPPED: with 100 cards per
// page an uncapped 0.05s stagger put card #100 on screen at ~5s. The calm
// wave now finishes in ~0.36s regardless of page size.
const CALM_EASE = [0.22, 1, 0.36, 1] as const;
// Container only propagates hidden→show to children; delays live on the cards.
const CALM_GRID_VARIANTS: Variants = { hidden: {}, show: {} };
const CALM_CARD_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: CALM_EASE, delay: Math.min(i * 0.03, 0.36) },
  }),
};

// Filter option sets — shared by the desktop rail and the mobile drawer.
const VT_DATE_OPTS = [
  { value: "all", label: "All time" },
  { value: "7days", label: "Last 7 days" },
  { value: "30days", label: "Last 30 days" },
  { value: "3months", label: "Last 3 months" },
  { value: "6months", label: "Last 6 months" },
  { value: "12months", label: "Last 12 months" },
];
const VT_PLATFORM_OPTS = [
  { value: "all", label: "All platforms" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
  { value: "facebook", label: "Facebook" },
];
const VT_OUTLIER_OPTS = [
  { value: "0", label: "Any outlier" },
  { value: "1.5", label: "1.5x and above" },
  { value: "2.5", label: "2.5x and above" },
  { value: "5", label: "5x and above" },
  { value: "10", label: "10x and above" },
];
const VT_VIEWS_OPTS = [
  { value: "0", label: "Any views" },
  { value: "10000", label: "10K+" },
  { value: "100000", label: "100K+" },
  { value: "1000000", label: "1M+" },
];
const VT_ENGAGEMENT_OPTS = [
  { value: "0", label: "Any engagement" },
  { value: "1", label: "1%+" },
  { value: "3", label: "3%+" },
  { value: "5", label: "5%+" },
];
const VT_SOURCE_OPTS = [
  { value: "all", label: "All sources" },
  { value: "channels", label: "Channels" },
  { value: "discovered", label: "Discovered" },
];

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
    facebook: "Facebook",
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
    facebook: "Facebook",
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

interface Watchlist {
  id: string;
  name: string;
  sort_order: number;
}

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
  user_submitted?: boolean | null;
  submitted_by?: string | null;
  is_featured_framework?: boolean;
  niche_tags?: string[];
  framework_score?: number;
  analysis_status?: "pending" | "analyzing" | "analyzed" | "failed" | null;
  analysis_error?: string | null;
  content_format?: string | null;
  primary_niche?: string | null;
  video_file_url?: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// ── Feed score algorithm ─────────────────────────────────────────────────────
// Used by "For You" sort. Higher = shown first. Ranking philosophy:
//  - HARD signal first: the client's canonical primary_niche slug. Anything
//    matching that gets a big boost so it floats over everything else.
//  - Soft signal next: keyword/affinity bumps for slight personalization.
//  - Fallback (no niche, no match): raw outlier × views × recency so top
//    performers surface — matches the user's stated fallback.
function buildFeedScorer(
  interactions: Map<string, { seen_count: number; clicked: boolean }>,
  nicheKeywords: string[],
  userChannelIds: Set<string>,
  clientNiche: string | null,
) {
  return (v: ViralVideo, now: number): number => {
    // 1. Outlier base (0–100+) — every algorithm starts with raw virality
    let score = (v.outlier_score ?? 0) * 10;

    // 2. Views ladder (0–25) — log-scaled so 10M views ≈ +25, 100k ≈ +12
    const views = v.views_count ?? 0;
    if (views > 0) score += Math.min(25, Math.log10(views + 1) * 3.5);

    // 3. Recency boost (0–30): 30 pts if today, 0 if 90+ days old
    const ageMs = now - new Date(v.posted_at ?? v.scraped_at).getTime();
    const ageDays = ageMs / 86_400_000;
    score += Math.max(0, 30 - (ageDays / 90) * 30);

    // 4. PRIMARY NICHE MATCH (+60) — canonical slug check, the strongest
    //    personalization signal. Matches "fitness" → "fitness", etc.
    if (clientNiche && v.primary_niche === clientNiche) {
      score += 60;
    }

    // 5. Keyword fallback (+15) — softer signal for clients without a
    //    derivable niche slug. Caption / channel substring match.
    if (nicheKeywords.length > 0) {
      const text = ((v.caption || "") + " " + (v.channel_username || "")).toLowerCase();
      if (nicheKeywords.some(kw => text.includes(kw))) {
        score += 15;
      }
    }

    // 6. Channel affinity (+20) — user explicitly added this channel
    if (v.channel_id && userChannelIds.has(v.channel_id)) {
      score += 20;
    }

    // 7. Unseen bonus (+15) — reward fresh-to-user videos but don't
    //    crowd out objectively-better-but-seen ones
    const inter = interactions.get(v.id);
    if (!inter) score += 15;

    return score;
  };
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
// Module-level semaphore — at most 3 concurrent categorize calls page-wide.
const CATEGORIZE_MAX_CONCURRENT = 3;
let categorizeInFlight = 0;
function acquireCategorizeSlot(): boolean {
  if (categorizeInFlight >= CATEGORIZE_MAX_CONCURRENT) return false;
  categorizeInFlight++;
  return true;
}
function releaseCategorizeSlot() {
  if (categorizeInFlight > 0) categorizeInFlight--;
}

// Video card — memoized so a page of 100 cards doesn't re-render when one
// card's selection flips or unrelated page state changes. All callbacks
// passed in are stable (useCallback) for the memo to hold.
const VideoCard = memo(function VideoCard({
  video, index = 0, isAdmin, onDelete, selected, onToggleSelect, onSeen, onClickVideo, onToggleFeatured, onChannelClick,
}: {
  video: ViralVideo;
  index?: number;
  isAdmin?: boolean;
  onDelete?: (id: string) => void;
  selected?: boolean;
  onToggleSelect?: (video: ViralVideo) => void;
  onSeen?: (id: string) => void;
  onClickVideo?: (id: string) => void;
  onToggleFeatured?: (video: ViralVideo) => void;
  onChannelClick?: (username: string) => void;
}) {
  const PlatformIcon = PLATFORM_ICON[video.platform] ?? Instagram;
  const outlierColor = getOutlierColor(video.outlier_score);
  const [imgError, setImgError] = useState(false);
  const [posterError, setPosterError] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [localStatus, setLocalStatus] = useState<string | null | undefined>(video.analysis_status);
  const [analyzing, setAnalyzing] = useState(false);
  const [categorizing, setCategorizing] = useState(false);
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

  // Lazy-backfill content_format / primary_niche on visible cards.
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    // Skip if already categorized OR analysis not yet done.
    if (video.content_format && video.primary_niche) return;
    if ((localStatus ?? video.analysis_status) !== "analyzed") return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let fired = false;
    let visible = false;

    const attempt = async () => {
      if (fired || !visible) return;
      if (!acquireCategorizeSlot()) {
        // All slots busy. IntersectionObserver only fires on threshold
        // CROSSINGS, so a card that stays fully visible would never retry —
        // reschedule ourselves until a slot frees up.
        timer = setTimeout(attempt, 3000);
        return;
      }
      fired = true;
      setCategorizing(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/viral-video-categorize`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
            body: JSON.stringify({ viral_video_id: video.id }),
          },
        );
        // Result lands via the row-level realtime subscription already wired up.
      } catch {
        // Silent fail — the user can retry by visiting the detail page.
      } finally {
        releaseCategorizeSlot();
        setCategorizing(false);
      }
    };

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (!entry.isIntersecting) {
        if (timer) { clearTimeout(timer); timer = null; }
        return;
      }
      if (fired) return;
      timer = setTimeout(attempt, 1500); // 1.5s debounce per spec
    }, { threshold: 0.5 });

    observer.observe(el);
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [video.id, video.content_format, video.primary_niche, video.analysis_status, localStatus]);

  // Analysis status arrives via the page-level realtime subscription (the grid
  // patches the videos array) — sync the prop into the optimistic local state.
  useEffect(() => {
    setLocalStatus(video.analysis_status);
  }, [video.analysis_status]);

  const handleAnalyze = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setAnalyzing(true);
    setLocalStatus("analyzing");
    try {
      const token = await getAuthToken();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-viral-video-user`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ viral_video_id: video.id }),
        },
      );
      if (res.status === 402) {
        setLocalStatus(video.analysis_status);
        toast.error("Not enough credits to analyze this video");
        return;
      }
      if (res.status === 409) {
        // Another analyze already in flight — keep "analyzing" state; realtime will update us.
        return;
      }
      if (!res.ok) {
        setLocalStatus(video.analysis_status);
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string; error?: string }).message || (err as { message?: string; error?: string }).error || `HTTP ${res.status}`);
      }
      toast.success("Analyzing…");
      window.dispatchEvent(new Event("credits-updated"));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Analyze failed";
      toast.error(message);
      setLocalStatus(video.analysis_status);
    } finally {
      setAnalyzing(false);
    }
  };

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
      variants={CALM_CARD_VARIANTS}
      custom={index}
      whileHover={{ y: -4 }}
      transition={{ type: "tween", duration: 0.34, ease: CALM_EASE }}
      className={cn(
        "group relative flex flex-col rounded-xl overflow-hidden bg-card border hover:border-border hover:shadow-xl transition-[box-shadow,border-color] duration-300",
        selected ? "border-primary ring-1 ring-primary/30" : "border-border"
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
        {(() => {
          const src = !imgError ? proxyImg(video.thumbnail_url) : null;
          if (src) {
            return (
              <img
                src={src}
                alt={video.caption?.slice(0, 60) ?? "video"}
                className="relative w-full h-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.06]"
                onError={() => setImgError(true)}
              />
            );
          }
          // Thumbnail missing/expired. Analyzed videos have the video file
          // stored on our side (downloaded during analysis — cost is sunk):
          // use its first frame as a poster instead of the gradient.
          const status = localStatus ?? video.analysis_status;
          if (status === "analyzed" && video.video_file_url && !posterError) {
            return (
              <video
                src={video.video_file_url}
                preload="metadata"
                muted
                playsInline
                className="relative w-full h-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.06]"
                onError={() => setPosterError(true)}
              />
            );
          }
          return (
            <div className="absolute inset-0 flex items-center justify-center">
              <Play className="w-8 h-8 text-white/60" />
            </div>
          );
        })()}

        {/* Top-left: platform icon + admin checkbox overlay */}
        <div className="absolute top-2 left-2 z-10">
          {isAdmin && onToggleSelect ? (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleSelect(video); }}
              className={cn(
                "w-6 h-6 rounded-md flex items-center justify-center border transition-all",
                selected
                  ? "bg-primary border-primary"
                  : "bg-black/60 backdrop-blur-sm border-white/20 hover:border-primary/60"
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

        {/* Top-right: star (featured) + trash (admin) or external link (non-admin) */}
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
          {/* Featured star — admin can toggle, non-admin sees read-only when featured */}
          {(video.is_featured_framework || isAdmin) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (isAdmin && onToggleFeatured) onToggleFeatured(video);
              }}
              className={cn(
                "w-6 h-6 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center border transition-colors",
                video.is_featured_framework
                  ? "border-yellow-400/60 hover:bg-yellow-500/20"
                  : "border-white/10 hover:border-yellow-400/40",
                !isAdmin && "cursor-default",
              )}
              title={video.is_featured_framework ? "Top Framework" : "Mark as Top Framework"}
              disabled={!isAdmin}
            >
              <Star
                className={cn(
                  "w-3 h-3",
                  video.is_featured_framework ? "text-yellow-400 fill-yellow-400" : "text-white/40",
                )}
              />
            </button>
          )}

          {isAdmin ? (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="w-6 h-6 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center border border-white/10 hover:bg-red-600/80 transition-colors"
              title="Remove video"
            >
              {deleting ? <Loader2 className="w-3 h-3 text-white animate-spin" /> : <Trash2 className="w-3 h-3 text-white/80" />}
            </button>
          ) : video.video_url ? (
            // Only render with a real URL — href="#" just scrolled to top.
            <a
              href={video.video_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="w-6 h-6 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center border border-white/10 hover:bg-black/80 transition-colors"
              title="Open original"
            >
              <ExternalLink className="w-3 h-3 text-white/80" />
            </a>
          ) : null}
        </div>

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200 flex items-center justify-center pointer-events-none">
          <Play className="w-5 h-5 text-white opacity-0 group-hover:opacity-80 transition-opacity duration-200" />
        </div>

        {/* Bottom-right: analyze status badge */}
        <div className="absolute bottom-2 right-2 z-10">
          {(() => {
            const status = localStatus ?? video.analysis_status;
            if (status === "analyzed") {
              if (categorizing) {
                return (
                  <div
                    className="flex items-center gap-1 px-2 py-1 rounded-full bg-black/70 backdrop-blur-sm text-white text-[10px] font-medium border border-white/10"
                    title="Categorizing…"
                  >
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Categorizing…</span>
                  </div>
                );
              }
              return (
                <div
                  className="flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-500/90 backdrop-blur-sm text-white text-[10px] font-medium border border-white/10"
                  title="Already analyzed"
                >
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Analyzed</span>
                </div>
              );
            }
            if (status === "analyzing") {
              return (
                <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-black/70 backdrop-blur-sm text-white text-[10px] font-medium border border-white/10">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Analyzing…</span>
                </div>
              );
            }
            if (status === "failed") {
              return (
                <button
                  onClick={handleAnalyze}
                  disabled={analyzing}
                  className="flex items-center gap-1 px-2 py-1 rounded-full bg-red-500/90 hover:bg-red-500 backdrop-blur-sm text-white text-[10px] font-medium border border-white/10 transition-colors disabled:opacity-60"
                  title={`Last analysis failed${video.analysis_error ? `: ${video.analysis_error}` : ""} — click to retry`}
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Failed — Retry</span>
                </button>
              );
            }
            return (
              <button
                onClick={handleAnalyze}
                disabled={analyzing}
                className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/90 hover:bg-primary backdrop-blur-sm text-white text-[10px] font-medium border border-white/10 transition-colors disabled:opacity-60"
                title="Analyze this video (50 credits)"
              >
                <Sparkles className="w-3 h-3" />
                <span>Analyze · 50c</span>
              </button>
            );
          })()}
        </div>
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col gap-1.5">
        {/* Caption */}
        <p className="text-[11px] text-foreground leading-snug line-clamp-1 font-medium">
          {video.caption || <span className="text-muted-foreground italic">No caption</span>}
        </p>

        {/* Channel + time */}
        <div className="flex items-center justify-between">
          {onChannelClick && video.channel_username ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onChannelClick(video.channel_username); }}
              className="text-[10px] text-muted-foreground font-medium hover:text-primary hover:underline transition-colors"
              title={`Show only @${video.channel_username}'s videos`}
            >
              @{video.channel_username}
            </button>
          ) : (
            <span className="text-[10px] text-muted-foreground font-medium">@{video.channel_username}</span>
          )}
          <span
            className="text-[10px] text-muted-foreground"
            title={video.user_submitted ? "You added this from /ai" : undefined}
          >
            {timeAgo(video.posted_at)}
          </span>
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
});

// Channel row
interface ChannelRowProps {
  channel: ViralChannel;
  onScrape: (ch: ViralChannel) => void;
  onDelete: (id: string) => void;
  isAdmin: boolean;
  canScrape: boolean;
  scrapeDisabledReason?: string;
  watchlists?: Watchlist[];
  channelListIds?: Set<string>;
  onToggleInList?: (channelId: string, listId: string) => void;
  onCreateList?: (name: string) => Promise<string | null>;
  isQueued?: boolean;
}
function ChannelRow({ channel, onScrape, onDelete, isAdmin, canScrape, scrapeDisabledReason, watchlists, channelListIds, onToggleInList, onCreateList, isQueued }: ChannelRowProps) {
  const PlatformIcon = PLATFORM_ICON[channel.platform] ?? Instagram;
  const status = channel.scrape_status;
  const [listMenuOpen, setListMenuOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const listMenuRef = useRef<HTMLDivElement>(null);
  const inAnyList = (channelListIds?.size ?? 0) > 0;

  // Close the assignment popover on outside click.
  useEffect(() => {
    if (!listMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (listMenuRef.current && !listMenuRef.current.contains(e.target as Node)) setListMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [listMenuOpen]);

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
        {isQueued && status !== "running" && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock className="w-3 h-3" />
            Queued…
          </span>
        )}
        {status === "running" && (
          <span className="flex items-center gap-1 text-[10px] text-amber-400">
            <Loader2 className="w-3 h-3 animate-spin" />
            Scraping…
          </span>
        )}
        {status === "done" && !isQueued && (
          <span className="flex items-center gap-1 text-[10px] text-emerald-400">
            <CheckCircle2 className="w-3 h-3" />
            Done
          </span>
        )}
        {status === "error" && !isQueued && (
          <span className="flex items-center gap-1 text-[10px] text-red-400" title={channel.scrape_error ?? ""}>
            <AlertCircle className="w-3 h-3" />
            Error
          </span>
        )}
        {status === "idle" && !isQueued && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock className="w-3 h-3" />
            Idle
          </span>
        )}
      </div>

      {/* Watchlist assignment — pick which list(s) this channel belongs to */}
      {onToggleInList && (
        <div className="relative flex-shrink-0" ref={listMenuRef}>
          <button
            onClick={() => setListMenuOpen((o) => !o)}
            title={inAnyList ? "In watchlist(s) — click to edit" : "Add to a watchlist"}
            className={cn(
              "h-7 w-7 rounded-lg flex items-center justify-center border transition-all",
              inAnyList
                ? "bg-primary/15 border-primary/40 text-primary"
                : "bg-muted border-border text-muted-foreground hover:text-foreground",
            )}
          >
            <Star className={cn("w-3.5 h-3.5", inAnyList && "fill-current")} />
          </button>
          {listMenuOpen && (
            <div className="absolute right-0 top-9 z-30 w-56 rounded-xl border border-border bg-card shadow-xl p-2 space-y-0.5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1">Add to watchlist</p>
              {(watchlists ?? []).length === 0 && (
                <p className="text-[11px] text-muted-foreground px-2 py-1.5">No lists yet — create one below.</p>
              )}
              <div className="max-h-48 overflow-y-auto space-y-0.5">
                {(watchlists ?? []).map((w) => {
                  const checked = channelListIds?.has(w.id) ?? false;
                  return (
                    <button
                      key={w.id}
                      onClick={() => onToggleInList(channel.id, w.id)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-foreground hover:bg-muted text-left"
                    >
                      <span className={cn(
                        "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0",
                        checked ? "bg-primary border-primary text-primary-foreground" : "border-border",
                      )}>
                        {checked && <CheckSquare className="w-3 h-3" />}
                      </span>
                      <span className="truncate">{w.name}</span>
                    </button>
                  );
                })}
              </div>
              {onCreateList && (
                <div className="flex items-center gap-1 pt-1.5 mt-1 border-t border-border">
                  <input
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key === "Enter" && newListName.trim()) {
                        const id = await onCreateList(newListName);
                        if (id) { onToggleInList(channel.id, id); setNewListName(""); }
                      }
                    }}
                    placeholder="New list…"
                    className="flex-1 h-7 px-2 bg-input border border-border rounded-md text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50"
                  />
                  <button
                    onClick={async () => {
                      if (!newListName.trim()) return;
                      const id = await onCreateList(newListName);
                      if (id) { onToggleInList(channel.id, id); setNewListName(""); }
                    }}
                    className="h-7 w-7 rounded-md flex items-center justify-center bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

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
  { label: t.facebook, value: "facebook" },
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
  { label: t.forYou, value: "foryou" },
  { label: t.mostRecent, value: "recent" },
  { label: t.highestOutlier, value: "outlier" },
  { label: t.mostViews, value: "views" },
  { label: t.bestEngagement, value: "engagement" },
];

// ── Watchlist manager (channels view, right rail) ────────────────────────────
interface WatchlistManagerProps {
  watchlists: { id: string; name: string; count: number }[];
  activeWatchlistId: string;
  onActiveWatchlistChange: (id: string) => void;
  channels: ViralChannel[];
  activeWatchlistChannelIds: Set<string>;
  listsByChannel: Map<string, Set<string>>;
  onCreateList: (name: string) => Promise<string | null>;
  onRenameList: (id: string, name: string) => void;
  onDeleteList: (id: string) => void;
  onToggleInList: (channelId: string, listId: string) => void;
}
function WatchlistManager({
  watchlists, activeWatchlistId, onActiveWatchlistChange, channels,
  activeWatchlistChannelIds, listsByChannel, onCreateList, onRenameList, onDeleteList, onToggleInList,
}: WatchlistManagerProps) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  const activeList = watchlists.find((w) => w.id === activeWatchlistId);
  const listChannels = channels.filter((c) => activeWatchlistChannelIds.has(c.id));

  const removeChannel = (channelId: string) => {
    if (activeWatchlistId === "all") {
      // Remove from every list it belongs to.
      for (const listId of listsByChannel.get(channelId) ?? []) onToggleInList(channelId, listId);
    } else {
      onToggleInList(channelId, activeWatchlistId);
    }
  };

  return (
    <aside className="hidden lg:block w-[300px] shrink-0 self-start sticky top-2">
      <div className="rounded-xl border border-border bg-card/40 overflow-hidden">
        <div className="px-4 py-3 border-b border-border space-y-2">
          <div className="flex items-center gap-2">
            <select
              value={activeWatchlistId}
              onChange={(e) => { onActiveWatchlistChange(e.target.value); setRenaming(false); }}
              className="flex-1 h-8 px-2 bg-input border border-border rounded-md text-xs font-medium text-foreground focus:outline-none focus:border-primary/50"
            >
              {/* Union across every list — not the currently-active selection's size */}
              <option value="all">All watchlists ({listsByChannel.size})</option>
              {watchlists.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.count})</option>)}
            </select>
            <button
              onClick={() => { setCreating((c) => !c); setNewName(""); }}
              title="New list"
              className="h-8 w-8 rounded-md flex items-center justify-center bg-primary text-primary-foreground hover:bg-primary/90 flex-shrink-0"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {creating && (
            <div className="flex items-center gap-1">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === "Enter" && newName.trim()) {
                    const id = await onCreateList(newName);
                    if (id) { onActiveWatchlistChange(id); setNewName(""); setCreating(false); }
                  }
                  if (e.key === "Escape") { setCreating(false); setNewName(""); }
                }}
                placeholder="List name…"
                className="flex-1 h-7 px-2 bg-input border border-border rounded-md text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50"
              />
              <button
                onClick={async () => {
                  if (!newName.trim()) return;
                  const id = await onCreateList(newName);
                  if (id) { onActiveWatchlistChange(id); setNewName(""); setCreating(false); }
                }}
                className="text-[11px] px-2 h-7 rounded-md bg-muted border border-border text-foreground hover:bg-muted/80"
              >
                Add
              </button>
            </div>
          )}

          {/* Rename / delete controls for a specific selected list */}
          {activeList && !creating && (
            renaming ? (
              <div className="flex items-center gap-1">
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && renameValue.trim()) { onRenameList(activeList.id, renameValue); setRenaming(false); }
                    if (e.key === "Escape") setRenaming(false);
                  }}
                  className="flex-1 h-7 px-2 bg-input border border-border rounded-md text-xs text-foreground focus:outline-none focus:border-primary/50"
                />
                <button onClick={() => { if (renameValue.trim()) onRenameList(activeList.id, renameValue); setRenaming(false); }} className="text-[11px] px-2 h-7 rounded-md bg-muted border border-border text-foreground hover:bg-muted/80">Save</button>
              </div>
            ) : (
              <div className="flex items-center gap-3 px-0.5">
                <button onClick={() => { setRenaming(true); setRenameValue(activeList.name); }} className="text-[11px] text-muted-foreground hover:text-foreground">Rename</button>
                <button
                  onClick={() => { if (confirm(`Delete watchlist "${activeList.name}"? Channels stay in your other lists.`)) onDeleteList(activeList.id); }}
                  className="text-[11px] text-muted-foreground hover:text-destructive"
                >
                  Delete list
                </button>
              </div>
            )
          )}
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2 space-y-1">
          {listChannels.length === 0 ? (
            <p className="text-xs text-muted-foreground p-4 text-center leading-relaxed">
              {watchlists.length === 0
                ? <>Create a list above, then star channels to add them.</>
                : <>No channels in this view yet. Use the <span className="text-foreground font-medium">★</span> on a channel to add it.</>}
            </p>
          ) : (
            listChannels.map((c) => {
              const PIcon = PLATFORM_ICON[c.platform] ?? Instagram;
              return (
                <div key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/50 group">
                  {c.avatar_url ? (
                    <img src={proxyImg(c.avatar_url) ?? c.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover border border-border" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center border border-border"><PIcon className="w-3.5 h-3.5 text-muted-foreground" /></div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground truncate">@{c.username}</p>
                    <p className="text-[10px] text-muted-foreground">{c.video_count} videos</p>
                  </div>
                  <button onClick={() => removeChannel(c.id)} title={activeWatchlistId === "all" ? "Remove from all lists" : "Remove from this list"} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </aside>
  );
}

// ── CSV export helpers ────────────────────────────────────────────────────────

// Quote/escape a single CSV cell. Empty/missing analysis fields export as "None".
function csvCell(value: unknown): string {
  if (value === null || value === undefined || value === "") return '"None"';
  const s = Array.isArray(value) ? value.join(" | ") : String(value);
  if (s.trim() === "") return '"None"';
  return `"${s.replace(/"/g, '""')}"`;
}

// Plain-value cell (always-present metadata) — does NOT substitute "None".
function csvNum(value: unknown): string {
  if (value === null || value === undefined) return '""';
  return `"${String(value).replace(/"/g, '""')}"`;
}

// Flatten framework_meta.visual_segments into a readable, single-cell breakdown.
function visualBreakdownForCsv(meta: any): string {
  const segments = (meta?.visual_segments ?? []) as Array<{
    start?: number; end?: number; description?: string; text_on_screen?: string[];
  }>;
  if (!Array.isArray(segments) || segments.length === 0) return "";
  return segments
    .map((s) => {
      const start = typeof s.start === "number" ? s.start.toFixed(1) : "?";
      const end = typeof s.end === "number" ? s.end.toFixed(1) : "?";
      const text = (s.text_on_screen ?? []).length ? ` | text: ${(s.text_on_screen ?? []).join(" / ")}` : "";
      return `[${start}s–${end}s] ${s.description ?? ""}${text}`;
    })
    .join("\n");
}

// Persisted filter state — restores the user's last-used filters across sessions
// instead of resetting to hardcoded defaults each visit. Reset still clears to
// FILTER_DEFAULTS.
const VT_FILTERS_KEY = "vt_filters";
function readSavedFilters(): Record<string, any> {
  try { return JSON.parse(localStorage.getItem(VT_FILTERS_KEY) || "{}") || {}; } catch { return {}; }
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ViralToday() {
  // Lazy: parsed from localStorage once at mount, not re-parsed every render.
  const [savedFilters] = useState(readSavedFilters);
  const { user, loading: authLoading, isAdmin, isVideographer } = useAuth();
  const { credits, refetch: refetchCredits } = useCredits();
  const navigate = useNavigate();
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
  const [view, setView] = useState<"videos" | "channels">("videos");

  // Data — hydrate from cache for instant render, refetch in background.
  const [videos, setVideos] = useState<ViralVideo[]>(() => readCache<ViralVideo[]>("viral_videos", []));
  const [channels, setChannels] = useState<ViralChannel[]>(() => readCache<ViralChannel[]>("viral_channels", []));

  // ONE page-level realtime subscription keeps analysis/categorize badges live.
  // (Each card used to open its own postgres_changes channel — 100 websocket
  // channel joins per page render.) Returns `prev` untouched unless a listed
  // row actually changed a badge-relevant field, so scrape-time stat updates
  // don't cause re-renders.
  useEffect(() => {
    const channel = supabase
      .channel("viral_videos_grid_status")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "viral_videos" },
        (payload) => {
          const next = payload.new as Partial<ViralVideo> & { id: string };
          setVideos((prev) => {
            const idx = prev.findIndex((v) => v.id === next.id);
            if (idx === -1) return prev;
            const cur = prev[idx];
            if (
              cur.analysis_status === next.analysis_status &&
              cur.content_format === next.content_format &&
              cur.primary_niche === next.primary_niche
            ) {
              return prev;
            }
            const copy = [...prev];
            copy[idx] = {
              ...cur,
              analysis_status: next.analysis_status ?? cur.analysis_status,
              analysis_error: next.analysis_error ?? null,
              content_format: next.content_format ?? cur.content_format,
              primary_niche: next.primary_niche ?? cur.primary_niche,
            };
            return copy;
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Realtime fallback: if the websocket drops, "Analyzing…" badges strand
  // forever. While any card is analyzing, poll those rows every 10s and patch
  // whatever realtime missed. No-ops (and no interval) when nothing is
  // in flight. The ref lets the interval read the latest list without
  // re-subscribing on every videos change.
  const videosStateRef = useRef<ViralVideo[]>([]);
  useEffect(() => { videosStateRef.current = videos; }, [videos]);
  const hasAnalyzing = videos.some((v) => v.analysis_status === "analyzing");
  useEffect(() => {
    if (!hasAnalyzing) return;
    const iv = setInterval(async () => {
      const ids = videosStateRef.current
        .filter((v) => v.analysis_status === "analyzing")
        .map((v) => v.id);
      if (ids.length === 0) return;
      const { data } = await supabase
        .from("viral_videos")
        .select("id, analysis_status, analysis_error, content_format, primary_niche")
        .in("id", ids.slice(0, 200));
      if (!data?.length) return;
      const byId = new Map(data.map((r: any) => [r.id, r]));
      setVideos((prev) =>
        prev.map((v) => {
          const fresh = byId.get(v.id);
          if (!fresh || fresh.analysis_status === v.analysis_status) return v;
          return { ...v, ...fresh };
        }),
      );
    }, 10_000);
    return () => clearInterval(iv);
  }, [hasAnalyzing]);

  const [loadingVideos, setLoadingVideos] = useState(false);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [channelSearch, setChannelSearch] = useState("");

  // Filters — initialized from the user's last saved session (localStorage).
  const [search, setSearch] = useState("");
  // Debounced copy of `search` used by the (memoized) filter pipeline — the
  // input stays instant while filtering waits for typing to settle.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 150);
    return () => clearTimeout(t);
  }, [search]);
  const [filterDate, setFilterDate] = useState<string>(savedFilters.date ?? "12months");
  const [filterPlatform, setFilterPlatform] = useState<string>(savedFilters.platform ?? "all");
  const [filterOutlier, setFilterOutlier] = useState<string>(savedFilters.outlier ?? "5");
  const [filterViews, setFilterViews] = useState<string>(savedFilters.views ?? "100000");
  const [filterEngagement, setFilterEngagement] = useState<string>(savedFilters.engagement ?? "0");
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [filterSource, setFilterSource] = useState<string>(savedFilters.source ?? "all"); // "all" | "channels" | "discovered"
  const [filterSort, setFilterSort] = useState<string>(savedFilters.sort ?? "recent");
  const [showOnlyFeatured, setShowOnlyFeatured] = useState<boolean>(savedFilters.featuredOnly ?? false);
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const videosPerPage = 100;

  // Format tab + niche filters
  const [activeFormat, setActiveFormat] = useState<ContentFormat | "all">(savedFilters.activeFormat ?? "all");
  const [selectedNiches, setSelectedNiches] = useState<string[]>(savedFilters.niches ?? []);

  // Client-side filters narrow the list without a refetch — jump back to page
  // 1 when they change, or a user on page 3 can land on an empty page.
  useEffect(() => {
    setCurrentPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, filterSource, filterSort, showOnlyFeatured, activeFormat, selectedNiches]);

  // Persist filters so the next visit restores the user's last-used settings.
  useEffect(() => {
    try {
      localStorage.setItem(VT_FILTERS_KEY, JSON.stringify({
        date: filterDate, platform: filterPlatform, outlier: filterOutlier, views: filterViews,
        engagement: filterEngagement, source: filterSource, sort: filterSort,
        featuredOnly: showOnlyFeatured, activeFormat, niches: selectedNiches,
      }));
    } catch { /* ignore quota/availability errors */ }
  }, [filterDate, filterPlatform, filterOutlier, filterViews, filterEngagement, filterSource, filterSort, showOnlyFeatured, activeFormat, selectedNiches]);

  // ── Watchlists — per-user NAMED lists of channels that can drive the feed ────
  // membersByList: listId -> channelIds. activeWatchlistId selects which list
  // drives the "watchlist" feed ("all" = union of every list's channels).
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [membersByList, setMembersByList] = useState<Record<string, string[]>>({});
  const [activeWatchlistId, setActiveWatchlistId] = useState<string>(
    () => localStorage.getItem("vt_active_watchlist") || "all",
  );
  const [feedMode, setFeedMode] = useState<"global" | "watchlist">(
    () => (localStorage.getItem("vt_feed_mode") as "global" | "watchlist") || "global",
  );
  useEffect(() => { localStorage.setItem("vt_feed_mode", feedMode); }, [feedMode]);
  useEffect(() => { localStorage.setItem("vt_active_watchlist", activeWatchlistId); }, [activeWatchlistId]);
  // Feed-mode/watchlist switches also narrow the list client-side — reset paging.
  useEffect(() => { setCurrentPage(0); }, [feedMode, activeWatchlistId]);

  // Load the signed-in user's lists + memberships once.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [{ data: lists }, { data: members }] = await Promise.all([
        supabase.from("channel_watchlists").select("id, name, sort_order").eq("user_id", user.id)
          .order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
        supabase.from("channel_watchlist_members").select("watchlist_id, channel_id").eq("user_id", user.id),
      ]);
      if (cancelled) return;
      setWatchlists((lists ?? []) as Watchlist[]);
      const map: Record<string, string[]> = {};
      for (const m of (members ?? []) as { watchlist_id: string; channel_id: string }[]) {
        (map[m.watchlist_id] ??= []).push(m.channel_id);
      }
      setMembersByList(map);
      // Drop a stale persisted selection that no longer maps to a real list.
      const listIds = new Set((lists ?? []).map((l: { id: string }) => l.id));
      setActiveWatchlistId((cur) => (cur === "all" || listIds.has(cur) ? cur : "all"));
      // First visit with populated lists and no saved preference → default to watchlist.
      if ((members ?? []).length > 0 && !localStorage.getItem("vt_feed_mode")) setFeedMode("watchlist");
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Channels in the currently-active list selection — drives the watchlist feed.
  const activeWatchlistChannelIds = useMemo(() => {
    const s = new Set<string>();
    if (activeWatchlistId === "all") {
      for (const ids of Object.values(membersByList)) for (const id of ids) s.add(id);
    } else {
      for (const id of membersByList[activeWatchlistId] ?? []) s.add(id);
    }
    return s;
  }, [membersByList, activeWatchlistId]);

  // Reverse index: channelId -> Set<listId> (for the per-channel assignment popover).
  const listsByChannel = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const [listId, ids] of Object.entries(membersByList)) {
      for (const id of ids) {
        if (!m.has(id)) m.set(id, new Set());
        m.get(id)!.add(listId);
      }
    }
    return m;
  }, [membersByList]);

  // Per-list channel counts, for the feed dropdown labels.
  const watchlistsWithCounts = useMemo(
    () => watchlists.map((w) => ({ ...w, count: (membersByList[w.id] ?? []).length })),
    [watchlists, membersByList],
  );

  const createWatchlist = useCallback(async (name: string): Promise<string | null> => {
    if (!user) { toast.error("Sign in to use watchlists"); return null; }
    const trimmed = name.trim();
    if (!trimmed) return null;
    const sort_order = watchlists.length;
    const { data, error } = await supabase
      .from("channel_watchlists")
      .insert({ user_id: user.id, name: trimmed, sort_order })
      .select("id, name, sort_order")
      .single();
    if (error || !data) { toast.error("Couldn't create list"); return null; }
    setWatchlists((prev) => [...prev, data as Watchlist]);
    setMembersByList((prev) => ({ ...prev, [data.id]: [] }));
    return data.id;
  }, [user, watchlists.length]);

  const renameWatchlist = useCallback(async (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const prev = watchlists;
    setWatchlists((p) => p.map((w) => (w.id === id ? { ...w, name: trimmed } : w)));
    const { error } = await supabase.from("channel_watchlists").update({ name: trimmed }).eq("id", id);
    if (error) { setWatchlists(prev); toast.error("Couldn't rename list"); }
  }, [watchlists]);

  const deleteWatchlist = useCallback(async (id: string) => {
    const prevLists = watchlists;
    const prevMembers = membersByList;
    setWatchlists((p) => p.filter((w) => w.id !== id));
    setMembersByList((p) => { const next = { ...p }; delete next[id]; return next; });
    if (activeWatchlistId === id) setActiveWatchlistId("all");
    const { error } = await supabase.from("channel_watchlists").delete().eq("id", id);
    if (error) { setWatchlists(prevLists); setMembersByList(prevMembers); toast.error("Couldn't delete list"); }
  }, [watchlists, membersByList, activeWatchlistId]);

  // Add/remove a channel to/from a specific list (many-to-many).
  const toggleChannelInList = useCallback(async (channelId: string, listId: string) => {
    if (!user) { toast.error("Sign in to use watchlists"); return; }
    const inList = (membersByList[listId] ?? []).includes(channelId);
    setMembersByList((prev) => {
      const cur = prev[listId] ?? [];
      return { ...prev, [listId]: inList ? cur.filter((id) => id !== channelId) : [...cur, channelId] };
    });
    const q = inList
      ? supabase.from("channel_watchlist_members").delete().eq("watchlist_id", listId).eq("channel_id", channelId)
      : supabase.from("channel_watchlist_members").insert({ watchlist_id: listId, channel_id: channelId, user_id: user.id });
    const { error } = await q;
    if (error) {
      setMembersByList((prev) => {
        const cur = prev[listId] ?? [];
        return { ...prev, [listId]: inList ? [...cur, channelId] : cur.filter((id) => id !== channelId) };
      });
      toast.error("Couldn't update list");
    }
  }, [user, membersByList]);

  // Admin: paste URL to add framework
  const [pasteUrl, setPasteUrl] = useState("");
  const [addUrlOpen, setAddUrlOpen] = useState(false);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [pastingUrl, setPastingUrl] = useState(false);

  // ── Feed algorithm state ──────────────────────────────────────────────────
  // initialInteractions is the snapshot from DB at mount — used for "For You" sort's unseen_bonus.
  // Read-only: no session tracking, no flush, no mid-session updates.
  const [initialInteractions, setInitialInteractions] = useState<Map<string, { seen_count: number; clicked: boolean }>>(new Map());
  const [nicheKeywords, setNicheKeywords] = useState<string[]>([]);
  const [userChannelIds, setUserChannelIds] = useState<Set<string>>(new Set());
  // Canonical primary_niche slug derived from the active client's industry —
  // the strongest signal for "For You" relevance. Null when no client is
  // selected or industry doesn't map to a known slug; in that case For You
  // falls back to top-performer ranking (outlier × views × recency).
  const [clientNiche, setClientNiche] = useState<string | null>(null);

  // CSV export (admin)
  const [exporting, setExporting] = useState(false);

  // Bulk analyze (filtered view)
  const [bulkOpen, setBulkOpen] = useState(false);

  // Add channel form
  const [newUsername, setNewUsername] = useState("");
  const [addingChannel, setAddingChannel] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<"instagram" | "tiktok" | "youtube" | "facebook">("instagram");
  const [platformDropdownOpen, setPlatformDropdownOpen] = useState(false);

  // Sequential scrape queue — the VPS scrapes one profile at a time, so added
  // channels are processed one-by-one in the background. The Add button frees up
  // immediately after each insert; queued cards show "Queued…", the active one
  // shows "Scraping…". scrapeQueueRef holds pending jobs; queuedIds drives the badge.
  const scrapeQueueRef = useRef<{ channelId: string; username: string; platform: string }[]>([]);
  const processingQueueRef = useRef(false);
  const [queuedIds, setQueuedIds] = useState<Set<string>>(new Set());

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

  // The page scrolls inside this container — jump back to the top whenever
  // the page number changes, or "Next" strands the user at the bottom of the
  // new page's grid.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [currentPage]);

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
    } catch (e: any) {
      const msg = e?.message || e?.error_description || e?.code || "unknown";
      console.warn("[ViralToday] fetchChannels failed:", e);
      // Channels initial state hydrates from localStorage cache, so a fetch
      // failure isn't fatal — the page still works with stale-but-usable data.
      // Only toast if we have NOTHING to fall back on; otherwise stay silent
      // so a transient network blip doesn't pop a scary toast on every refresh.
      if (channelsRef.current.length === 0) {
        toast.error(`Error loading channels: ${msg}`);
      }
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

      // Only the columns the grid renders — `*` also dragged transcript +
      // framework_meta for 5,000 rows into memory/sessionStorage on every
      // filter change (heavy egress; the CSV export runs its own targeted
      // query for those fields, and the detail page fetches its own row).
      const GRID_COLUMNS =
        "id, channel_id, channel_username, platform, video_url, thumbnail_url, caption, " +
        "views_count, likes_count, comments_count, engagement_rate, outlier_score, posted_at, " +
        "scraped_at, apify_video_id, hashtag_source, user_submitted, submitted_by, " +
        "is_featured_framework, niche_tags, framework_score, analysis_status, analysis_error, " +
        "content_format, primary_niche, video_file_url";

      while (allVideos.length < MAX_VIDEOS) {
        let q = supabase
          .from("viral_videos")
          .select(GRID_COLUMNS)
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

      // Filters are authoritative for ALL videos, including the user's own
      // submissions. A submitted video is fetched by the same filtered query
      // above; if it doesn't meet the active outlier/views/engagement/date/
      // platform filters it is correctly hidden, exactly like a scraped video.
      // (Previously we re-fetched the user's submissions unconditionally and
      // prepended them, which let them bypass every filter.)

      setVideos(allVideos);
      writeCache("viral_videos", allVideos);
      setCurrentPage(0);
    } catch {
      toast.error("Error loading videos");
    } finally {
      setLoadingVideos(false);
    }
  }, [filterPlatform, filterDate, filterOutlier, filterViews, filterEngagement, user]);

  // Mount-only: load channels + videos once when user becomes available
  const didMount = useRef(false);
  useEffect(() => {
    if (!user || didMount.current) return;
    didMount.current = true;
    fetchChannels();
    fetchVideos();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Background backfill: categorize analyzed-but-uncategorized videos ─────
  // The /viral-video-categorize edge function runs per-video and was previously
  // only fired by ViralVideoDetail when an admin opened a video. That left
  // most videos with content_format=NULL so they never appeared in any
  // format tab. Here we drain that backlog quietly on the landing: batches
  // of 5, ~1s spacing, only for admins, only IDs we haven't tried this session.
  const categorizeAttempted = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!isAdmin || !user) return;
    if (videos.length === 0) return;

    const pending = videos
      .filter((v) => v.analysis_status === "analyzed")
      .filter((v) => !v.content_format || !v.primary_niche)
      .filter((v) => !categorizeAttempted.current.has(v.id))
      .map((v) => v.id);

    if (pending.length === 0) return;

    let cancelled = false;
    const BATCH = 5;
    const GAP_MS = 1000;

    (async () => {
      const token = await getAuthToken();
      for (let i = 0; i < pending.length; i += BATCH) {
        if (cancelled) return;
        const slice = pending.slice(i, i + BATCH);
        slice.forEach((id) => categorizeAttempted.current.add(id));
        await Promise.all(
          slice.map(async (id) => {
            try {
              const res = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/viral-video-categorize`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                  body: JSON.stringify({ viral_video_id: id }),
                },
              );
              if (!res.ok) return;
              const result = await res.json();
              if (!cancelled && result?.content_format) {
                setVideos((prev) =>
                  prev.map((v) =>
                    v.id === id
                      ? { ...v, content_format: result.content_format, primary_niche: result.primary_niche }
                      : v,
                  ),
                );
              }
            } catch {
              // Silent fail — leave the row uncategorized; the next session will retry.
            }
          }),
        );
        if (i + BATCH < pending.length) {
          await new Promise((r) => setTimeout(r, GAP_MS));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAdmin, user, videos]);

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

  // ── Fetch niche keywords + derived primary_niche from selected client ────
  useEffect(() => {
    const clientId = localStorage.getItem("dashboard_viewMode");
    if (!clientId || clientId === "master" || clientId === "me") {
      setNicheKeywords([]);
      setClientNiche(null);
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
      const od = (data.onboarding_data ?? {}) as Record<string, string>;
      if (kws.length === 0 && data.onboarding_data) {
        const fields = [od.industry, od.industryOther, od.niche, od.target_client, od.unique_offer].filter(Boolean);
        const extracted = fields.join(" ").toLowerCase().split(/[\s,;|]+/).filter(w => w.length > 2);
        kws = [...new Set(extracted)];
        // Persist auto-extracted keywords
        if (kws.length > 0) {
          await supabase.from("clients").update({ niche_keywords: kws }).eq("id", clientId);
        }
      }
      setNicheKeywords(kws);

      // Map the client's free-text industry to a canonical primary_niche slug
      // (same vocabulary as viral_videos.primary_niche). Lets the For You
      // scorer do a hard slug-equality match instead of fuzzy keyword search.
      const INDUSTRY_TO_NICHE: Array<[RegExp, string]> = [
        [/chiropract|physical therap|physio|sports med|wellness|holistic|nutritionist|dietitian/i, "fitness"],
        [/personal train|fitness|gym|crossfit|yoga|pilates/i, "fitness"],
        [/realtor|real estate|mortgage|broker|home loan/i, "real_estate"],
        [/sales|sdr|closer|appointment setter|outbound|cold call/i, "sales"],
        [/financ|cpa|account|tax|wealth|invest|bookkeep|insurance/i, "finance"],
        [/coach|consult|mentor|advisor|life coach|business coach/i, "coaching"],
        [/ecommerce|shopify|amazon fba|dtc|drop ship|online store/i, "ecommerce"],
        [/saas|software|tech|developer|engineer|startup|founder/i, "saas_tech"],
        [/beauty|esthetic|skincare|makeup|cosmetic|hair stylist|salon|nail/i, "beauty"],
        [/food|chef|restaurant|recipe|bakery|cafe/i, "food"],
        [/mindset|self help|productivity|motivation|stoic/i, "mindset"],
        [/dating|relationship|marriage|couples therapy/i, "relationships"],
        [/teach|tutor|education|course creator|professor/i, "education"],
        [/lifestyle|vlog|travel|fashion|home decor/i, "lifestyle"],
        [/parent|mom|dad|family|baby|toddler/i, "parenting"],
        [/lawyer|attorney|immigration|legal|law firm/i, "personal_branding"],
        [/dentist|doctor|medical|surgeon|clinic|aesthetics|med spa/i, "personal_branding"],
      ];
      const industryText = [od.industry, od.industryOther, od.niche].filter(Boolean).join(" ");
      let derivedNiche: string | null = null;
      for (const [re, slug] of INDUSTRY_TO_NICHE) {
        if (re.test(industryText)) { derivedNiche = slug; break; }
      }
      setClientNiche(derivedNiche);
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

  // ── Callback for VideoCard to report "seen" (2s at 50%+ visible) ──────────
  // Feeds the For You sort's unseen bonus on FUTURE visits (the scorer only
  // reads the mount-time snapshot). Deduped per session so scrolling doesn't
  // spam upserts; never overwrites a clicked=true row (upsert would reset it,
  // so seen-only writes use ignoreDuplicates and clicks stay authoritative).
  const seenReportedRef = useRef<Set<string>>(new Set());
  const markSeen = useCallback(async (videoId: string) => {
    if (!user || seenReportedRef.current.has(videoId)) return;
    seenReportedRef.current.add(videoId);
    await supabase.from("viral_video_interactions").upsert({
      user_id: user.id,
      video_id: videoId,
      seen_count: 1,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: "user_id,video_id", ignoreDuplicates: true });
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

  // Drain the scrape queue one job at a time. The VPS only scrapes one profile
  // at a time (concurrent calls return server_busy), so jobs run sequentially.
  // On server_busy we wait and retry the SAME job rather than dropping it.
  const processScrapeQueue = useCallback(async () => {
    if (processingQueueRef.current) return;
    processingQueueRef.current = true;
    try {
      while (scrapeQueueRef.current.length > 0) {
        const job = scrapeQueueRef.current[0];

        // Move this job from "Queued…" → "Scraping…"
        setQueuedIds((prev) => { const next = new Set(prev); next.delete(job.channelId); return next; });
        await supabase
          .from("viral_channels")
          .update({ scrape_status: "running", scrape_error: null })
          .eq("id", job.channelId);
        setChannels((prev) =>
          prev.map((c) => (c.id === job.channelId ? { ...c, scrape_status: "running" } : c)),
        );

        // Run the scrape, auto-retrying while the VPS is busy.
        let settled = false;
        while (!settled) {
          let result: any = null;
          let invokeError: any = null;
          try {
            const resp = await supabase.functions.invoke("scrape-channel", {
              body: { channelId: job.channelId, username: job.username, platform: job.platform },
            });
            result = resp.data;
            invokeError = resp.error;
          } catch (e) {
            invokeError = e;
          }

          if (result?.server_busy) {
            // VPS busy — keep the job queued and retry shortly.
            await new Promise((r) => setTimeout(r, 8_000));
            continue;
          }

          if (invokeError) {
            toast.error(`@${job.username} scrape failed`);
            await supabase
              .from("viral_channels")
              .update({ scrape_status: "error", scrape_error: invokeError.message ?? "scrape failed" })
              .eq("id", job.channelId);
          } else if (result?.status === "done") {
            toast.success(`@${job.username} scraped — ${result.videosStored ?? 0} videos added`);
          } else {
            toast.info(`Scraping @${job.username}… check back in a moment`);
          }

          // Increment scrape usage for non-admin (admins/videographers exempt).
          // Read the CURRENT value first: the loop's closure captured `credits`
          // once, so writing `credits.used + 1` for every queued job used to
          // stamp the same number N times — N queued scrapes charged as 1.
          if (!invokeError && !isAdmin && !isVideographer && credits?.id) {
            const { data: fresh } = await supabase
              .from("clients")
              .select("channel_scrapes_used")
              .eq("id", credits.id)
              .single();
            await supabase
              .from("clients")
              .update({ channel_scrapes_used: (fresh?.channel_scrapes_used ?? credits.channel_scrapes_used ?? 0) + 1 })
              .eq("id", credits.id);
            refetchCredits();
          }
          settled = true;
        }

        // Done with this job — drop it and refresh from the server.
        scrapeQueueRef.current = scrapeQueueRef.current.slice(1);
        await fetchChannels();
        fetchVideos();
      }
    } finally {
      processingQueueRef.current = false;
    }
  }, [isAdmin, isVideographer, credits, refetchCredits, fetchChannels, fetchVideos]);

  // Add a channel to the scrape queue and kick off the processor (non-blocking).
  const enqueueScrape = useCallback(
    (job: { channelId: string; username: string; platform: string }) => {
      scrapeQueueRef.current = [...scrapeQueueRef.current, job];
      setQueuedIds((prev) => new Set(prev).add(job.channelId));
      void processScrapeQueue();
    },
    [processScrapeQueue],
  );

  const handleAddChannel = async () => {
    const detected = detectPlatformAndUsername(newUsername);
    const hasUrlPattern = /instagram\.com|tiktok\.com|youtube\.com|youtu\.be|facebook\.com|fb\.watch/i.test(newUsername.trim());
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

    // Only block the button for the brief insert — NOT for the scrape itself,
    // so users can queue up several channels in a row.
    setAddingChannel(true);
    let channelId: string;
    try {
      // Create or fetch existing channel
      const { data: existing } = await supabase
        .from("viral_channels")
        .select("id")
        .eq("platform", platform)
        .eq("username", username)
        .maybeSingle();

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
    } catch (e: any) {
      toast.error(e.message || "Error adding channel");
      return;
    } finally {
      setAddingChannel(false);
    }

    // Hand off to the sequential background queue; button is already free.
    enqueueScrape({ channelId, username, platform });
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

      // Fresh-read before incrementing (same stale-closure hazard as the queue).
      const bumpUsage = async () => {
        if (isAdmin || isVideographer || !credits?.id) return;
        const { data: fresh } = await supabase
          .from("clients").select("channel_scrapes_used").eq("id", credits.id).single();
        await supabase.from("clients")
          .update({ channel_scrapes_used: (fresh?.channel_scrapes_used ?? credits.channel_scrapes_used ?? 0) + 1 })
          .eq("id", credits.id);
        refetchCredits();
      };

      if (data?.status === "done") {
        toast.success(`@${ch.username} scraped — ${data.videosStored ?? 0} videos`);
        fetchVideos();
        fetchChannels();
        await bumpUsage();
      } else {
        toast.info(`Scraping @${ch.username}…`);
        fetchChannels();
        await bumpUsage();
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

  // Stable identities — VideoCard is React.memo'd; inline arrows here would
  // defeat it and re-render all 100 cards on every page render.
  const handleToggleFeatured = useCallback(async (video: ViralVideo) => {
    const next = !video.is_featured_framework;
    const { error } = await supabase
      .from("viral_videos")
      .update({ is_featured_framework: next })
      .eq("id", video.id);
    if (error) {
      toast.error("Failed to update framework status");
      return;
    }
    setVideos((prev) =>
      prev.map((v) => (v.id === video.id ? { ...v, is_featured_framework: next } : v))
    );
    toast.success(next ? "Marked as Top Framework" : "Removed from Top Frameworks");
  }, []);

  const handleVideoDeleted = useCallback((id: string) => {
    setVideos((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const handleChannelFilter = useCallback((username: string) => {
    setSearch(username);
  }, []);

  const handlePasteUrl = async () => {
    if (!pasteUrl.trim() || pastingUrl) return;
    setPastingUrl(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scrape-framework-url`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ url: pasteUrl.trim() }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        // Analysis can fail even when the row was inserted. Still surface the row
        // (it'll show as failed and the user can retry on the detail page).
        if (data.id) {
          const handle = data.channel_username && data.channel_username !== "unknown"
            ? ` @${data.channel_username}`
            : "";
          const reason = typeof data.error === "string" ? data.error.split(":")[0] : null;
          toast.warning(
            `Framework added but analysis failed${handle}${reason ? ` (${reason})` : ""}. Open the video to retry.`,
            {
              action: {
                label: "Open",
                onClick: () => navigate(`/viral-today/video/${data.id}`),
              },
              duration: 8000,
            },
          );
          setPasteUrl("");
          fetchVideos();
          return;
        }
        throw new Error(data.error || "Failed to add framework");
      }
      const status = data.status as string | undefined;
      // Deep-link to the video from the toast: a fresh video rarely clears
      // the default outlier/views filters, so it often isn't visible in the
      // grid after the refetch — without this link, success looks like a no-op.
      const viewAction = data.id
        ? { action: { label: "View video", onClick: () => navigate(`/viral-today/video/${data.id}`) }, duration: 8000 }
        : undefined;
      if (status === "already_analyzed" || status === "raced_existing") {
        toast.info(`Already in your library — @${data.channel_username}`, viewAction);
      } else if (status === "analyzed_existing") {
        toast.success(`Framework analyzed — @${data.channel_username}`, viewAction);
      } else {
        toast.success(`Framework added & analyzed — @${data.channel_username}`, viewAction);
      }
      setPasteUrl("");
      fetchVideos();
    } catch (e: any) {
      toast.error(e.message || "Failed to add framework");
    } finally {
      setPastingUrl(false);
    }
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
        setFilterViews("0");
      } else {
        toast.success(`Found ${data?.inserted ?? 0} videos for "${search.trim()}"`);
        // Auto-switch to Discovered source + drop outlier AND views minimums —
        // discovered videos under 100K views were invisible with only the
        // outlier filter cleared.
        setFilterSource("discovered");
        setFilterOutlier("0");
        setFilterViews("0");
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
    () => buildFeedScorer(initialInteractions, nicheKeywords, userChannelIds, clientNiche),
    [initialInteractions, nicheKeywords, userChannelIds, clientNiche]
  );

  // ── Filtered videos ──────────────────────────────────────────────────────────
  // MEMOIZED — this used to be an IIFE that re-filtered AND re-sorted up to
  // 5,000 rows on every render (every keystroke, every hover-driven state
  // change), with Date parsing inside the sort comparators. Now it runs only
  // when an input actually changes, search is debounced, and sort keys are
  // computed once per video (decorate-sort-undecorate) instead of per
  // comparison.
  const { videos: filteredVideos, formatCounts, availableNiches } = useMemo(() => {
    let result = [...videos];

    // Feed mode — "watchlist" narrows to the user's watchlist channels.
    if (feedMode === "watchlist") {
      result = result.filter((v) => v.channel_id != null && activeWatchlistChannelIds.has(v.channel_id));
    }

    // Source filter
    if (filterSource === "channels") {
      result = result.filter((v) => v.channel_id !== null);
    } else if (filterSource === "discovered") {
      result = result.filter((v) => v.channel_id === null);
    }

    // Top frameworks toggle — show only admin-curated featured frameworks
    if (showOnlyFeatured) {
      result = result.filter((v) => v.is_featured_framework === true);
    }

    // Niche filter
    if (selectedNiches.length > 0) {
      result = result.filter((v) => v.primary_niche != null && selectedNiches.includes(v.primary_niche));
    }

    // Platform, date, outlier, views, engagement are filtered server-side in fetchVideos()

    // Smart search: hashtag_source match, strip #/@, partial words, joined words
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.trim().toLowerCase();
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

    // Sort — decorate-sort-undecorate for the expensive keys so scores and
    // timestamps are computed once per video, not once per comparison.
    switch (filterSort) {
      case "foryou": {
        const now = Date.now();
        const scored = result.map((v) => [computeFeedScore(v, now), v] as const);
        scored.sort((a, b) => b[0] - a[0]);
        result = scored.map((s) => s[1]);
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
      default: {
        // recent — sort by true post date. Videos with no known post date
        // (e.g. a submission whose scraper couldn't recover the original
        // date) sort to the bottom instead of pinning to top as "now".
        const stamped = result.map(
          (v) => [v.posted_at ? Date.parse(v.posted_at) : 0, v] as const,
        );
        stamped.sort((a, b) => b[0] - a[0]);
        result = stamped.map((s) => s[1]);
      }
    }

    // Tally per-format counts BEFORE applying activeFormat (counts reflect all other filters).
    const formatTally: Partial<Record<ContentFormat | "all", number>> = { all: result.length };
    const nicheTally = new Map<string, number>();
    for (const v of result) {
      if (v.content_format) {
        formatTally[v.content_format as ContentFormat] =
          (formatTally[v.content_format as ContentFormat] ?? 0) + 1;
      }
      if (v.primary_niche) {
        nicheTally.set(v.primary_niche, (nicheTally.get(v.primary_niche) ?? 0) + 1);
      }
    }

    // Apply the active-format filter for display.
    const filteredByFormat =
      activeFormat === "all"
        ? result
        : result.filter((v) => v.content_format === activeFormat);

    return {
      videos: filteredByFormat,
      formatCounts: formatTally,
      availableNiches: Array.from(nicheTally.entries()).map(([slug, count]) => ({ slug, count })),
    };
  }, [
    videos, feedMode, activeWatchlistChannelIds, filterSource, showOnlyFeatured,
    selectedNiches, debouncedSearch, filterSort, computeFeedScore, activeFormat,
  ]);

  // Pagination
  const totalPages = Math.ceil(filteredVideos.length / videosPerPage);
  const paginatedVideos = filteredVideos.slice(
    currentPage * videosPerPage,
    (currentPage + 1) * videosPerPage
  );

  // ── Bulk analyze: eligible = not yet analyzed and not in flight ─────────────
  const bulkEligibleCount = Math.min(
    filteredVideos.filter(
      (v) => v.analysis_status !== "analyzed" && v.analysis_status !== "analyzing",
    ).length,
    100,
  );
  const isFreeAnalyze = isAdmin || isVideographer;
  const spendBalance = (credits?.credits_balance ?? 0) + (credits?.topup_credits_balance ?? 0);

  // ── Export current filtered videos (up to 100) to CSV (admin only) ──────────
  const handleExportCsv = async () => {
    const rows = filteredVideos.slice(0, 100);
    if (rows.length === 0) {
      toast.error("No videos to export");
      return;
    }
    setExporting(true);
    try {
      // Fetch analysis columns for the exported videos in one query and merge by id.
      const ids = rows.map((v) => v.id);
      const analysisById = new Map<string, any>();
      const { data: analysisRows, error: analysisErr } = await supabase
        .from("viral_videos")
        .select("id, transcript, hook_text, cta_text, framework_meta, transcribed_at, analysis_status")
        .in("id", ids);
      if (analysisErr) {
        toast.warning("Couldn't load analysis text — exporting metadata only");
      } else {
        for (const r of analysisRows ?? []) analysisById.set(r.id, r);
      }

      const headers = [
        "channel_username", "platform", "posted_at", "video_url", "caption",
        "views_count", "likes_count", "comments_count", "engagement_rate",
        "outlier_score", "framework_score", "primary_niche", "content_format",
        "niche_tags", "analysis_status", "hook_text", "cta_text", "transcript",
        "visual_breakdown", "audience", "key_topics", "body_structure",
        "hook_template", "scraped_at",
      ];

      const lines = [headers.map((h) => csvNum(h)).join(",")];
      for (const v of rows) {
        const a = analysisById.get(v.id) ?? {};
        const fm = a.framework_meta ?? {};
        lines.push([
          csvNum(v.channel_username),
          csvNum(v.platform),
          csvNum(v.posted_at),
          csvNum(v.video_url),
          csvCell(v.caption),
          csvNum(v.views_count),
          csvNum(v.likes_count),
          csvNum(v.comments_count),
          csvNum(v.engagement_rate),
          csvNum(v.outlier_score),
          csvNum(v.framework_score),
          csvCell(v.primary_niche),
          csvCell(v.content_format),
          csvCell(v.niche_tags),
          csvCell(a.analysis_status ?? v.analysis_status),
          csvCell(a.hook_text),
          csvCell(a.cta_text),
          csvCell(a.transcript),
          csvCell(visualBreakdownForCsv(fm)),
          csvCell(fm.audience),
          csvCell(fm.key_topics),
          csvCell(fm.body_structure),
          csvCell(fm.hook_template),
          csvNum(v.scraped_at),
        ].join(","));
      }

      // UTF-8 BOM so Excel renders Spanish accents correctly.
      const csv = "﻿" + lines.join("\r\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const today = new Date().toISOString().slice(0, 10);
      const a = document.createElement("a");
      a.href = url;
      a.download = `viral-today-export-${today}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`Exported ${rows.length} video${rows.length === 1 ? "" : "s"}`);
    } catch (e: any) {
      toast.error(e.message || "Export failed");
    } finally {
      setExporting(false);
    }
  };

  // Reset to the same defaults a first visit gets (and the rail's Reset
  // button) — previously this landed on outlier 0 / views 0, a different
  // state than every other reset path. Also resets feed mode: "Clear all
  // filters" in Watchlist mode with an empty list used to be a dead end.
  const clearFilters = () => {
    setFilterDate("12months");
    setFilterPlatform("all");
    setFilterOutlier("5");
    setFilterViews("100000");
    setFilterEngagement("0");
    setFilterSource("all");
    setFilterSort("recent");
    setSelectedChannelIds([]);
    setSearch("");
    setShowOnlyFeatured(false);
    setSelectedNiches([]);
    setActiveFormat("all");
    setFeedMode("global");
    setCurrentPage(0);
  };

  // True whenever the SERVER-side filters could be excluding rows — used to
  // tell "your library is empty" apart from "your filters hid everything".
  const serverFiltersActive =
    filterOutlier !== "0" || filterViews !== "0" || filterEngagement !== "0" ||
    filterDate !== "all" || filterPlatform !== "all";

  // Escape hatch for the filtered-empty state: drop every server-side filter
  // (the regular clearFilters returns to the curated defaults, which are
  // themselves filters — useless when those defaults ARE what hid everything).
  const showAllVideos = () => {
    setFilterDate("all");
    setFilterPlatform("all");
    setFilterOutlier("0");
    setFilterViews("0");
    setFilterEngagement("0");
    setFeedMode("global");
    setCurrentPage(0);
  };

  // ── FiltersPanel integration ─────────────────────────────────────────────────

  const FILTER_DEFAULTS: FiltersPanelValue = {
    date: "12months",
    platform: "all",
    outlier: "5",
    views: "100000",
    engagement: "0",
    source: "all",
    featuredOnly: false,
    niches: [],
  };

  const filtersValue: FiltersPanelValue = {
    date: filterDate,
    platform: filterPlatform,
    outlier: filterOutlier,
    views: filterViews,
    engagement: filterEngagement,
    source: filterSource,
    featuredOnly: showOnlyFeatured,
    niches: selectedNiches,
  };

  const handleFiltersChange = (next: FiltersPanelValue) => {
    setFilterDate(next.date);
    setFilterPlatform(next.platform);
    setFilterOutlier(next.outlier);
    setFilterViews(next.views);
    setFilterEngagement(next.engagement);
    setFilterSource(next.source);
    setShowOnlyFeatured(next.featuredOnly);
    setSelectedNiches(next.niches);
  };

  // Count of non-default measurement filters (for the mobile Filters badge).
  const filterActiveCount = (() => {
    let n = 0;
    if (filtersValue.date !== FILTER_DEFAULTS.date) n++;
    if (filtersValue.platform !== FILTER_DEFAULTS.platform) n++;
    if (filtersValue.outlier !== FILTER_DEFAULTS.outlier) n++;
    if (filtersValue.views !== FILTER_DEFAULTS.views) n++;
    if (filtersValue.engagement !== FILTER_DEFAULTS.engagement) n++;
    if (filtersValue.source !== FILTER_DEFAULTS.source) n++;
    if (filtersValue.featuredOnly !== FILTER_DEFAULTS.featuredOnly) n++;
    if (filtersValue.niches.length > 0) n++;
    if (selectedChannelIds.length > 0) n++;
    return n;
  })();

  // ── Render ───────────────────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const runningChannels = channels.filter((c) => c.scrape_status === "running");

  return (
    <PageTransition className="editorial-page flex-1 flex flex-col min-h-screen overflow-hidden">

        <div ref={scrollRef} className="flex-1 px-5 sm:px-8 pt-6 pb-12 overflow-auto">

          {/* ── Header ── */}
          <div className="mb-5">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-xl font-bold text-foreground tracking-tight font-serif">
                  {view === "videos" ? "Videos" : t.channels}
                </h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {view === "videos" ? t.videosDesc : t.channelsDesc}
                </p>
              </div>

              {/* Language toggle + View toggle */}
              <div className="flex items-center gap-2">
                {view === "videos" && (
                  <button
                    onClick={() => setBulkOpen(true)}
                    disabled={bulkEligibleCount === 0}
                    title={
                      bulkEligibleCount === 0
                        ? "All filtered videos are already analyzed"
                        : `Analyze the ${bulkEligibleCount} un-analyzed video${bulkEligibleCount === 1 ? "" : "s"} in the current filtered view`
                    }
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-primary/90 border border-primary text-primary-foreground hover:bg-primary transition-all disabled:opacity-50"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Bulk analyze
                  </button>
                )}
                {isAdmin && view === "videos" && (
                  <button
                    onClick={handleExportCsv}
                    disabled={exporting || filteredVideos.length === 0}
                    title={`Export the ${Math.min(filteredVideos.length, 100)} currently filtered video${filteredVideos.length === 1 ? "" : "s"} to CSV`}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-muted border border-border text-foreground hover:bg-muted/80 transition-all disabled:opacity-50"
                  >
                    {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    Export CSV
                  </button>
                )}
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
                {/* Two-column: persistent filter rail + content */}
                <div className="flex gap-6 items-start">

                  {/* Desktop filter rail */}
                  <aside className="hidden lg:flex flex-col w-[220px] shrink-0 self-start sticky top-2 h-[calc(100vh-6rem)] rounded-xl border border-border bg-card/40 overflow-hidden">
                    <FilterRail
                      activeFormat={activeFormat}
                      formatCounts={formatCounts}
                      onFormatChange={setActiveFormat}
                      value={filtersValue}
                      defaults={FILTER_DEFAULTS}
                      onChange={handleFiltersChange}
                      availableNiches={availableNiches}
                      feedMode={feedMode}
                      onFeedModeChange={setFeedMode}
                      watchlistCount={activeWatchlistChannelIds.size}
                      allChannelCount={listsByChannel.size}
                      watchlists={watchlistsWithCounts}
                      activeWatchlistId={activeWatchlistId}
                      onActiveWatchlistChange={setActiveWatchlistId}
                      onCreateList={createWatchlist}
                      onManageChannels={() => setView("channels")}
                      dateOptions={VT_DATE_OPTS}
                      platformOptions={VT_PLATFORM_OPTS}
                      outlierOptions={VT_OUTLIER_OPTS}
                      viewsOptions={VT_VIEWS_OPTS}
                      engagementOptions={VT_ENGAGEMENT_OPTS}
                      sourceOptions={VT_SOURCE_OPTS}
                    />
                  </aside>

                  {/* Main column */}
                  <div className="flex-1 min-w-0">

                    {/* Slim toolbar */}
                    <div className="flex items-center gap-2 mb-4">
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
                          <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                            <X className="w-3 h-3 text-muted-foreground" />
                          </button>
                        )}
                      </div>

                      {/* Mobile: open filter drawer */}
                      <button
                        onClick={() => setFilterDrawerOpen(true)}
                        className="lg:hidden h-8 px-3 inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted text-xs text-foreground shrink-0"
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                        Filters
                        {filterActiveCount > 0 && (
                          <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-foreground text-background text-[10px] tabular-nums">{filterActiveCount}</span>
                        )}
                      </button>

                      {/* Search Instagram — admin only */}
                      {isAdmin && (
                        <Button
                          onClick={handleDiscoverSearch}
                          disabled={isDiscovering || !search.trim()}
                          className="h-8 px-3 bg-pink-500/15 hover:bg-pink-500/25 border border-pink-500/30 text-pink-400 text-[11px] font-semibold rounded-lg flex items-center gap-1.5 transition-all shrink-0"
                        >
                          {isDiscovering ? <Loader2 className="w-3 h-3 animate-spin" /> : <Instagram className="w-3 h-3" />}
                          {isDiscovering ? "Searching…" : "Search Instagram"}
                        </Button>
                      )}

                      {/* Sort */}
                      <FilterChip
                        label={t.sort}
                        options={getSortOpts(t)}
                        value={filterSort}
                        onChange={setFilterSort}
                        isActive={filterSort !== "recent"}
                      />

                      {/* Admin: Add framework toggle */}
                      {isAdmin && (
                        <Button
                          onClick={() => setAddUrlOpen((o) => !o)}
                          className="h-8 px-3 bg-yellow-500/15 hover:bg-yellow-500/25 border border-yellow-500/30 text-yellow-400 text-[11px] font-semibold rounded-lg flex items-center gap-1.5 shrink-0"
                        >
                          <Star className="w-3 h-3" />
                          Add framework
                        </Button>
                      )}
                    </div>

                    {/* Admin: Add framework inline field (toggled) */}
                    {isAdmin && addUrlOpen && (
                      <div className="flex items-center gap-2 mb-4">
                        <div className="relative flex-1 max-w-sm">
                          <input
                            type="url"
                            value={pasteUrl}
                            onChange={(e) => setPasteUrl(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handlePasteUrl()}
                            autoFocus
                            placeholder="Paste Instagram or TikTok URL…"
                            className="w-full h-8 rounded-lg border border-yellow-500/30 bg-yellow-500/5 text-sm px-3 pr-8 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-yellow-500/60"
                          />
                          {pasteUrl && (
                            <button
                              onClick={() => setPasteUrl("")}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        <Button
                          onClick={handlePasteUrl}
                          disabled={!pasteUrl.trim() || pastingUrl}
                          className="h-8 px-3 bg-yellow-500/15 hover:bg-yellow-500/25 border border-yellow-500/30 text-yellow-400 text-[11px] font-semibold rounded-lg flex items-center gap-1.5"
                        >
                          {pastingUrl ? <Loader2 className="w-3 h-3 animate-spin" /> : <Star className="w-3 h-3" />}
                          {pastingUrl ? "Adding…" : "Add"}
                        </Button>
                      </div>
                    )}

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
                ) : videos.length === 0 && serverFiltersActive ? (
                  // Server-side filters returned zero rows. This is NOT the
                  // onboarding case — the library may be full; the filters
                  // hid everything. Name the filters and offer the real fix.
                  <div className="flex flex-col items-center justify-center py-24 text-center">
                    <Filter className="w-6 h-6 text-muted-foreground mb-3" />
                    <p className="text-sm font-medium text-foreground mb-1">{t.noVideosMatch}</p>
                    <div className="flex items-center gap-1.5 flex-wrap justify-center my-3 max-w-md">
                      {filterOutlier !== "0" && (
                        <span className="px-2.5 py-1 rounded-full border border-primary/40 bg-primary/10 text-primary text-[10px] font-medium">Outlier ≥ {filterOutlier}x</span>
                      )}
                      {filterViews !== "0" && (
                        <span className="px-2.5 py-1 rounded-full border border-primary/40 bg-primary/10 text-primary text-[10px] font-medium">Views ≥ {fmtViews(parseInt(filterViews))}</span>
                      )}
                      {filterEngagement !== "0" && (
                        <span className="px-2.5 py-1 rounded-full border border-primary/40 bg-primary/10 text-primary text-[10px] font-medium">Engagement ≥ {filterEngagement}%</span>
                      )}
                      {filterDate !== "all" && (
                        <span className="px-2.5 py-1 rounded-full border border-primary/40 bg-primary/10 text-primary text-[10px] font-medium">{getDateOpts(t).find((o) => o.value === filterDate)?.label ?? filterDate}</span>
                      )}
                      {filterPlatform !== "all" && (
                        <span className="px-2.5 py-1 rounded-full border border-primary/40 bg-primary/10 text-primary text-[10px] font-medium capitalize">{filterPlatform}</span>
                      )}
                    </div>
                    <button
                      onClick={showAllVideos}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-medium transition-all"
                    >
                      Show all videos
                    </button>
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
                    <Filter className="w-6 h-6 text-muted-foreground mb-3" />
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
                      variants={CALM_GRID_VARIANTS}
                      initial="hidden"
                      animate="show"
                      className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5 mb-6"
                    >
                      {/* No AnimatePresence here on purpose: page changes used
                          to run 100 exit + 100 enter animations at once. */}
                      {paginatedVideos.map((v, i) => (
                        <VideoCard
                          key={v.id}
                          video={v}
                          index={i}
                          isAdmin={isAdmin}
                          onDelete={handleVideoDeleted}
                          selected={selectedVideos.has(v.id)}
                          onToggleSelect={toggleVideoSelect}
                          onClickVideo={reportClick}
                          onSeen={markSeen}
                          onToggleFeatured={isAdmin ? handleToggleFeatured : undefined}
                          onChannelClick={handleChannelFilter}
                        />
                      ))}
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
                  </div>{/* /main column */}
                </div>{/* /two-column wrapper */}

                {/* Mobile filter drawer */}
                {filterDrawerOpen && (
                  <div className="fixed inset-0 z-40 lg:hidden">
                    <div className="absolute inset-0 bg-black/50" onClick={() => setFilterDrawerOpen(false)} />
                    <motion.aside
                      initial={{ x: "-100%" }}
                      animate={{ x: 0 }}
                      transition={{ type: "tween", duration: 0.34, ease: CALM_EASE }}
                      className="absolute left-0 top-0 h-full w-[280px] max-w-[85vw] bg-card border-r border-border flex flex-col"
                    >
                      <div className="flex items-center justify-between px-3 py-3 border-b border-border">
                        <span className="text-sm font-medium text-foreground">Filters</span>
                        <button onClick={() => setFilterDrawerOpen(false)} className="text-muted-foreground hover:text-foreground">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex-1 min-h-0">
                        <FilterRail
                          activeFormat={activeFormat}
                          formatCounts={formatCounts}
                          onFormatChange={setActiveFormat}
                          value={filtersValue}
                          defaults={FILTER_DEFAULTS}
                          onChange={handleFiltersChange}
                          availableNiches={availableNiches}
                          feedMode={feedMode}
                          onFeedModeChange={setFeedMode}
                          watchlistCount={activeWatchlistChannelIds.size}
                          allChannelCount={listsByChannel.size}
                          watchlists={watchlistsWithCounts}
                          activeWatchlistId={activeWatchlistId}
                          onActiveWatchlistChange={setActiveWatchlistId}
                          onCreateList={createWatchlist}
                          onManageChannels={() => { setView("channels"); setFilterDrawerOpen(false); }}
                          dateOptions={VT_DATE_OPTS}
                          platformOptions={VT_PLATFORM_OPTS}
                          outlierOptions={VT_OUTLIER_OPTS}
                          viewsOptions={VT_VIEWS_OPTS}
                          engagementOptions={VT_ENGAGEMENT_OPTS}
                          sourceOptions={VT_SOURCE_OPTS}
                          onApplied={() => setFilterDrawerOpen(false)}
                        />
                      </div>
                    </motion.aside>
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
                      const hasUrl = /instagram\.com|tiktok\.com|youtube\.com|youtu\.be|facebook\.com|fb\.watch/i.test(newUsername.trim());
                      const autoDetected = newUsername.trim() && hasUrl ? detectPlatformAndUsername(newUsername).platform : null;
                      const activePlatform = autoDetected ?? selectedPlatform;
                      const PLATFORMS = [
                        { value: "instagram" as const, label: "Instagram Reels", icon: Instagram, color: "text-pink-400",   bg: "bg-pink-500/10" },
                        { value: "tiktok"    as const, label: "TikTok",          icon: TikTokIcon, color: "text-orange-400", bg: "bg-orange-500/10" },
                        { value: "youtube"   as const, label: "YouTube Shorts",  icon: Youtube,   color: "text-red-400",    bg: "bg-red-500/10" },
                        { value: "facebook"  as const, label: "Facebook Reels",  icon: Facebook,  color: "text-blue-400",   bg: "bg-blue-500/10" },
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
                  <div className="flex gap-6 items-start">
                    {/* Discovery (left) — search + channels grouped by niche */}
                    <div className="flex-1 min-w-0">
                      <div className="relative mb-4 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                        <input
                          type="text"
                          value={channelSearch}
                          onChange={(e) => setChannelSearch(e.target.value)}
                          placeholder="Search channels…"
                          className="w-full h-9 pl-9 pr-4 bg-input border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50"
                        />
                      </div>

                      {(() => {
                        // Derive each channel's niche from its videos (most common primary_niche).
                        const counts = new Map<string, Map<string, number>>();
                        for (const v of videos) {
                          if (!v.channel_id || !v.primary_niche) continue;
                          let m = counts.get(v.channel_id);
                          if (!m) { m = new Map(); counts.set(v.channel_id, m); }
                          m.set(v.primary_niche, (m.get(v.primary_niche) ?? 0) + 1);
                        }
                        const nicheByChannel = new Map<string, string>();
                        for (const [cid, m] of counts) {
                          let best = "", bestN = 0;
                          for (const [n, c] of m) if (c > bestN) { best = n; bestN = c; }
                          if (best) nicheByChannel.set(cid, best);
                        }
                        const q = channelSearch.trim().toLowerCase();
                        const matched = channels.filter((c) => {
                          if (!q) return true;
                          if (c.username.toLowerCase().includes(q)) return true;
                          // Also match the channel's derived category/niche (the group headers).
                          const niche = nicheByChannel.get(c.id);
                          if (niche && (niche.toLowerCase().includes(q) || nicheLabel(niche).toLowerCase().includes(q))) return true;
                          return false;
                        });
                        if (matched.length === 0) {
                          return <p className="text-sm text-muted-foreground py-8 text-center">No channels match “{channelSearch}”.</p>;
                        }
                        const groups = new Map<string, ViralChannel[]>();
                        for (const c of matched) {
                          const key = nicheByChannel.get(c.id) ?? "__other";
                          if (!groups.has(key)) groups.set(key, []);
                          groups.get(key)!.push(c);
                        }
                        const orderedKeys = [...groups.keys()].sort((a, b) => {
                          if (a === "__other") return 1;
                          if (b === "__other") return -1;
                          return groups.get(b)!.length - groups.get(a)!.length;
                        });
                        return (
                          <div className="space-y-6">
                            {orderedKeys.map((key) => (
                              <div key={key}>
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                                  {key === "__other" ? "Other" : nicheLabel(key)}
                                  <span className="ml-1.5 text-muted-foreground/50">{groups.get(key)!.length}</span>
                                </p>
                                <div className="space-y-2">
                                  {groups.get(key)!.map((ch) => (
                                    <ChannelRow
                                      key={ch.id}
                                      channel={ch}
                                      onScrape={handleScrape}
                                      onDelete={handleDeleteChannel}
                                      isAdmin={isAdmin}
                                      canScrape={canScrape}
                                      scrapeDisabledReason={scrapeDisabledReason}
                                      watchlists={watchlists}
                                      channelListIds={listsByChannel.get(ch.id)}
                                      onToggleInList={toggleChannelInList}
                                      onCreateList={createWatchlist}
                                      isQueued={queuedIds.has(ch.id)}
                                    />
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Watchlists manager (right) */}
                    <WatchlistManager
                      watchlists={watchlistsWithCounts}
                      activeWatchlistId={activeWatchlistId}
                      onActiveWatchlistChange={setActiveWatchlistId}
                      channels={channels}
                      activeWatchlistChannelIds={activeWatchlistChannelIds}
                      listsByChannel={listsByChannel}
                      onCreateList={createWatchlist}
                      onRenameList={renameWatchlist}
                      onDeleteList={deleteWatchlist}
                      onToggleInList={toggleChannelInList}
                    />
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      {/* Floating action bar — appears from the FIRST selection (a single
          selected card used to give zero feedback until a second was picked) */}
      <AnimatePresence>
        {isAdmin && selectedVideos.size >= 1 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 px-5 py-3 rounded-2xl shadow-2xl bg-card/90 backdrop-blur-md border border-border"
          >
            <span className="text-[13px] text-muted-foreground">
              <span className="font-bold" style={{ color: "hsl(var(--aqua))" }}>{selectedVideos.size}</span>
              {" "}video{selectedVideos.size === 1 ? "" : "s"} selected
            </span>
            <button
              onClick={() => setShowBatchModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:brightness-110 text-primary-foreground"
              style={{ background: "hsl(var(--aqua))" }}
            >
              Generate Script{selectedVideos.size === 1 ? "" : "s"} <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setSelectedVideos(new Map())}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors bg-transparent border-none cursor-pointer"
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

      {bulkOpen && (
        <BulkAnalyzeModal
          videos={filteredVideos}
          isFree={isFreeAnalyze}
          balance={spendBalance}
          onClose={() => setBulkOpen(false)}
          onDone={() => fetchVideos()}
        />
      )}
      </PageTransition>
  );
}
