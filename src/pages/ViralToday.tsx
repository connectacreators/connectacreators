import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import DashboardSidebar from "@/components/DashboardSidebar";
import DashboardTopBar from "@/components/DashboardTopBar";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Loader2, TrendingUp, Instagram, Search, ChevronDown, X,
  Plus, Trash2, RefreshCw, Play, Eye, Zap, Radio,
  LayoutGrid, List, ExternalLink, CheckCircle2, AlertCircle,
  Clock, Flame, Filter, SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

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
    videos: "videos",
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
    channels: "channels",
    totalVideos: "total videos",
    scraping: "scraping",
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
    videos: "videos",
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
    channels: "canales",
    totalVideos: "videos totales",
    scraping: "scrapeando",
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

// Proxy Instagram CDN URLs through wsrv.nl to bypass hotlink/CORS restrictions
function proxyImg(url: string | null): string | null {
  if (!url) return null;
  if (url.includes("cdninstagram.com") || url.includes("fbcdn.net")) {
    return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=400&output=webp&q=80`;
  }
  return url;
}

// Extract clean username from full URL or @handle
function parseUsername(raw: string): string {
  const s = raw.trim();
  // Handle full URLs: https://www.instagram.com/username/ or instagram.com/username
  const urlMatch = s.match(/instagram\.com\/([^/?#\s]+)/i);
  if (urlMatch) return urlMatch[1].replace(/\/$/, "").toLowerCase();
  // Strip leading @
  return s.replace(/^@/, "").toLowerCase();
}

function getOutlierColor(score: number): string {
  if (score >= 10) return "text-emerald-400";
  if (score >= 3) return "text-green-400";
  if (score >= 1.5) return "text-lime-400";
  return "text-zinc-500";
}

const PLATFORM_ICON: Record<string, React.ElementType> = {
  instagram: Instagram,
  tiktok: Flame,
};

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
            : "dark:bg-white/[0.04] dark:border-white/10 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:border-white/20 bg-white/30 border-slate-300 text-slate-700 hover:text-slate-900 hover:border-slate-400"
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
            className="absolute top-full mt-1.5 left-0 z-50 min-w-[160px] dark:bg-[#1a1a1f] bg-white border dark:border-white/10 border-slate-300 rounded-xl shadow-2xl overflow-hidden"
          >
            {options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={cn(
                  "w-full text-left px-3.5 py-2 text-xs transition-colors",
                  opt.value === value
                    ? "text-primary dark:bg-primary/10 bg-primary/20"
                    : "dark:text-zinc-300 dark:hover:bg-white/5 text-slate-700 hover:bg-slate-100"
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
            : "dark:bg-white/[0.04] dark:border-white/10 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:border-white/20 bg-white/30 border-slate-300 text-slate-700 hover:text-slate-900 hover:border-slate-400"
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
            className="absolute top-full mt-1.5 left-0 z-50 min-w-[200px] dark:bg-[#1a1a1f] bg-white border dark:border-white/10 border-slate-300 rounded-xl shadow-2xl overflow-hidden"
          >
            {channels.length === 0 ? (
              <p className="px-3.5 py-3 text-xs dark:text-zinc-500 text-slate-600">No channels added yet</p>
            ) : (
              <>
                <button
                  onClick={() => onChange([])}
                  className="w-full text-left px-3.5 py-2 text-xs dark:text-zinc-400 dark:hover:bg-white/5 text-slate-700 hover:bg-slate-100 border-b dark:border-white/5 border-slate-200"
                >
                  All channels
                </button>
                {channels.map((ch) => (
                  <button
                    key={ch.id}
                    onClick={() => toggle(ch.id)}
                    className="w-full text-left px-3.5 py-2 text-xs flex items-center gap-2 dark:text-zinc-300 dark:hover:bg-white/5 text-slate-700 hover:bg-slate-100 transition-colors"
                  >
                    <span
                      className={cn(
                        "w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 transition-colors",
                        selected.includes(ch.id)
                          ? "bg-primary border-primary"
                          : "dark:border-white/20 dark:bg-transparent border-slate-400 bg-transparent"
                      )}
                    >
                      {selected.includes(ch.id) && (
                        <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 12 12">
                          <path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                        </svg>
                      )}
                    </span>
                    @{ch.username}
                    <span className="ml-auto dark:text-zinc-600 text-slate-500 text-[10px]">{ch.video_count} vids</span>
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
function VideoCard({ video }: { video: ViralVideo }) {
  const PlatformIcon = PLATFORM_ICON[video.platform] ?? Instagram;
  const outlierColor = getOutlierColor(video.outlier_score);
  const [imgError, setImgError] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.25 }}
      className="group relative flex flex-col rounded-xl overflow-hidden dark:bg-[#111115] bg-white dark:border dark:border-white/[0.06] dark:hover:border-white/[0.14] border border-slate-200 hover:border-slate-300 transition-all duration-200 hover:-translate-y-0.5 dark:hover:shadow-xl dark:hover:shadow-black/40 hover:shadow-lg hover:shadow-slate-200/50"
    >
      {/* Thumbnail */}
      <a
        href={video.video_url ?? "#"}
        target="_blank"
        rel="noopener noreferrer"
        className="block relative aspect-[4/5] dark:bg-zinc-900 bg-slate-200 overflow-hidden"
      >
        {video.thumbnail_url && !imgError ? (
          <img
            src={proxyImg(video.thumbnail_url) ?? video.thumbnail_url}
            alt={video.caption?.slice(0, 60) ?? "video"}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center dark:bg-gradient-to-br dark:from-zinc-800 dark:to-zinc-900 bg-gradient-to-br from-slate-300 to-slate-400">
            <Play className="w-8 h-8 dark:text-zinc-700 text-slate-500" />
          </div>
        )}

        {/* Platform badge */}
        <div className="absolute top-2 right-2 w-6 h-6 rounded-full dark:bg-black/60 bg-white/80 backdrop-blur-sm flex items-center justify-center dark:border dark:border-white/10 border border-slate-300">
          <PlatformIcon className="w-3 h-3 dark:text-white/80 text-slate-800" />
        </div>

        {/* External link on hover */}
        <div className="absolute inset-0 dark:bg-black/0 bg-white/0 dark:group-hover:bg-black/20 group-hover:bg-white/10 transition-colors duration-200 flex items-center justify-center">
          <ExternalLink className="w-5 h-5 dark:text-white dark:opacity-0 dark:group-hover:opacity-80 text-slate-800 opacity-0 group-hover:opacity-70 transition-opacity duration-200" />
        </div>
      </a>

      {/* Info */}
      <div className="p-3 flex flex-col gap-1.5">
        {/* Caption */}
        <p className="text-[11px] dark:text-zinc-200 text-slate-700 leading-snug line-clamp-2 font-medium min-h-[2.5em]">
          {video.caption || <span className="dark:text-zinc-600 text-slate-500 italic">No caption</span>}
        </p>

        {/* Channel + time */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] dark:text-zinc-500 text-slate-600 font-medium">@{video.channel_username}</span>
          <span className="text-[10px] dark:text-zinc-600 text-slate-500">{timeAgo(video.posted_at)}</span>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-3 pt-0.5 dark:border-white/[0.05] border-t border-slate-300">
          {/* Outlier */}
          <div className="flex items-center gap-1" title="Outlier score">
            {video.outlier_score >= 10 ? (
              <Flame className="w-3 h-3 text-orange-400" />
            ) : (
              <TrendingUp className={cn("w-3 h-3", outlierColor)} />
            )}
            <span className={cn("text-[10px] font-bold tabular-nums", video.outlier_score >= 10 ? "text-orange-400" : outlierColor)}>
              {fmtOutlier(video.outlier_score)}
            </span>
          </div>
          {/* Views */}
          <div className="flex items-center gap-1" title="Views">
            <Eye className="w-3 h-3 dark:text-zinc-500 text-slate-600" />
            <span className="text-[10px] dark:text-zinc-400 text-slate-600 font-medium tabular-nums">
              {fmtViews(video.views_count)}
            </span>
          </div>
          {/* Engagement */}
          <div className="flex items-center gap-1" title="Engagement rate">
            <Zap className="w-3 h-3 dark:text-zinc-500 text-slate-600" />
            <span className="text-[10px] dark:text-zinc-400 text-slate-600 font-medium tabular-nums">
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
}
function ChannelRow({ channel, onScrape, onDelete, isAdmin }: ChannelRowProps) {
  const PlatformIcon = PLATFORM_ICON[channel.platform] ?? Instagram;
  const status = channel.scrape_status;

  return (
    <div className="flex items-center gap-4 px-4 py-3 rounded-xl dark:bg-[#111115] bg-white dark:border dark:border-white/[0.06] dark:hover:border-white/[0.12] border border-slate-200 hover:border-slate-300 transition-all group">
      {/* Platform + username */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-9 h-9 rounded-full dark:bg-gradient-to-br dark:from-zinc-700 dark:to-zinc-800 bg-gradient-to-br from-slate-300 to-slate-400 flex items-center justify-center flex-shrink-0 dark:border dark:border-white/10 border border-slate-300">
          <PlatformIcon className="w-4 h-4 dark:text-zinc-300 text-slate-700" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold dark:text-zinc-100 text-slate-900">@{channel.username}</p>
          <p className="text-[10px] dark:text-zinc-500 text-slate-600 capitalize">{channel.platform}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="hidden sm:flex items-center gap-5 text-center">
        <div>
          <p className="text-sm font-bold dark:text-zinc-200 text-slate-900 tabular-nums">{channel.video_count}</p>
          <p className="text-[10px] dark:text-zinc-600 text-slate-600">videos</p>
        </div>
        <div>
          <p className="text-sm font-bold dark:text-zinc-200 text-slate-900 tabular-nums">{fmtViews(channel.avg_views)}</p>
          <p className="text-[10px] dark:text-zinc-600 text-slate-600">avg views</p>
        </div>
        <div>
          <p className="text-[10px] dark:text-zinc-400 text-slate-700">
            {channel.last_scraped_at ? timeAgo(channel.last_scraped_at) : "never"}
          </p>
          <p className="text-[10px] dark:text-zinc-600 text-slate-600">last scraped</p>
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
          <span className="flex items-center gap-1 text-[10px] dark:text-zinc-600 text-slate-600">
            <Clock className="w-3 h-3" />
            Idle
          </span>
        )}
      </div>

      {/* Actions */}
      {isAdmin && (
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => onScrape(channel)}
            disabled={status === "running"}
            title="Scrape now"
            className="h-7 w-7 rounded-lg flex items-center justify-center dark:bg-white/[0.04] dark:border dark:border-white/10 dark:hover:bg-white/[0.08] dark:hover:border-white/20 bg-slate-200 border border-slate-300 hover:bg-slate-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RefreshCw className={cn("w-3.5 h-3.5 dark:text-zinc-400 text-slate-700", status === "running" && "animate-spin")} />
          </button>
          <button
            onClick={() => onDelete(channel.id)}
            title="Remove channel"
            className="h-7 w-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 dark:bg-white/[0.04] dark:border dark:border-white/10 dark:hover:bg-red-500/10 dark:hover:border-red-500/30 bg-slate-200 border border-slate-300 hover:bg-red-100 hover:border-red-300 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5 dark:text-red-400/70 text-red-600" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Filter options ─────────────────────────────────────────────────────────

const DATE_OPTS: DropdownOption[] = [
  { label: "All time", value: "all" },
  { label: "Last 7 days", value: "7days" },
  { label: "Last 30 days", value: "30days" },
  { label: "Last 3 months", value: "3months" },
  { label: "Last 6 months", value: "6months" },
  { label: "Last 12 months", value: "12months" },
];

const PLATFORM_OPTS: DropdownOption[] = [
  { label: "All platforms", value: "all" },
  { label: "Instagram", value: "instagram" },
  { label: "TikTok", value: "tiktok" },
];

const OUTLIER_OPTS: DropdownOption[] = [
  { label: "Any outlier", value: "0" },
  { label: "> 1.5x", value: "1.5" },
  { label: "> 2x", value: "2" },
  { label: "> 5x", value: "5" },
  { label: "> 10x", value: "10" },
  { label: "> 20x", value: "20" },
  { label: "> 50x", value: "50" },
];

const VIEWS_OPTS: DropdownOption[] = [
  { label: "Any views", value: "0" },
  { label: "> 10K", value: "10000" },
  { label: "> 50K", value: "50000" },
  { label: "> 100K", value: "100000" },
  { label: "> 500K", value: "500000" },
  { label: "> 1M", value: "1000000" },
];

const ENGAGEMENT_OPTS: DropdownOption[] = [
  { label: "Any engagement", value: "0" },
  { label: "> 1%", value: "1" },
  { label: "> 3%", value: "3" },
  { label: "> 5%", value: "5" },
  { label: "> 8%", value: "8" },
  { label: "> 10%", value: "10" },
];

const SORT_OPTS: DropdownOption[] = [
  { label: "Most recent", value: "recent" },
  { label: "Highest outlier", value: "outlier" },
  { label: "Most views", value: "views" },
  { label: "Best engagement", value: "engagement" },
];

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ViralToday() {
  const { user, loading: authLoading, isAdmin } = useAuth();
  const isMobile = typeof window !== "undefined" && window.innerWidth < 1024;
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [lang, setLang] = useState<Language>("en");
  const t = TRANSLATIONS[lang];

  // View: videos | channels
  const [view, setView] = useState<"videos" | "channels">("videos");

  // Data
  const [videos, setVideos] = useState<ViralVideo[]>([]);
  const [channels, setChannels] = useState<ViralChannel[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [loadingChannels, setLoadingChannels] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [filterDate, setFilterDate] = useState("12months");
  const [filterPlatform, setFilterPlatform] = useState("all");
  const [filterOutlier, setFilterOutlier] = useState("0");
  const [filterViews, setFilterViews] = useState("0");
  const [filterEngagement, setFilterEngagement] = useState("0");
  const [filterSort, setFilterSort] = useState("recent");
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);

  // Add channel form
  const [newUsername, setNewUsername] = useState("");
  const [addingChannel, setAddingChannel] = useState(false);

  // Polling ref for running channels
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Data fetching ────────────────────────────────────────────────────────────

  const fetchChannels = useCallback(async () => {
    setLoadingChannels(true);
    try {
      const { data, error } = await supabase
        .from("viral_channels")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setChannels((data ?? []) as ViralChannel[]);
    } catch {
      toast.error("Error loading channels");
    } finally {
      setLoadingChannels(false);
    }
  }, []);

  const fetchVideos = useCallback(async () => {
    setLoadingVideos(true);
    try {
      const { data, error } = await supabase
        .from("viral_videos")
        .select("*")
        .order("posted_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      setVideos((data ?? []) as ViralVideo[]);
    } catch {
      toast.error("Error loading videos");
    } finally {
      setLoadingVideos(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchChannels();
    fetchVideos();
  }, [user, fetchChannels, fetchVideos]);

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
      const stillRunning = channels.filter((c) => c.scrape_status === "running");
      if (stillRunning.length === 0) {
        clearInterval(pollRef.current!);
        pollRef.current = null;
        return;
      }

      for (const ch of stillRunning) {
        if (!ch.apify_run_id) continue;
        try {
          const { data: result, error } = await supabase.functions.invoke("scrape-channel", {
            body: { action: "check", channelId: ch.id, runId: ch.apify_run_id },
          });
          if (error) continue;
          if (result?.status === "done") {
            toast.success(`@${ch.username} scraped — ${result.videosStored ?? 0} videos added`);
            fetchChannels();
            fetchVideos();
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
  }, [channels, fetchChannels, fetchVideos]);

  // ── Actions ──────────────────────────────────────────────────────────────────

  const handleAddChannel = async () => {
    const username = parseUsername(newUsername);
    if (!username) {
      toast.error("Enter a username");
      return;
    }

    setAddingChannel(true);
    try {
      // Create or fetch existing channel
      const { data: existing } = await supabase
        .from("viral_channels")
        .select("id")
        .eq("platform", "instagram")
        .eq("username", username)
        .maybeSingle();

      let channelId: string;

      if (existing) {
        channelId = existing.id;
        toast.info(`@${username} already in your watchlist — re-scraping`);
      } else {
        const { data: created, error } = await supabase
          .from("viral_channels")
          .insert({ username, platform: "instagram", created_by: user?.id })
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
        { body: { channelId, username, platform: "instagram" } }
      );

      if (scrapeError) throw scrapeError;

      if (scrapeResult?.status === "done") {
        toast.success(`@${username} scraped — ${scrapeResult.videosStored ?? 0} videos added`);
        fetchVideos();
        fetchChannels();
      } else {
        toast.info(`Scraping @${username}… check back in a moment`);
        fetchChannels();
      }
    } catch (e: any) {
      toast.error(e.message || "Error adding channel");
    } finally {
      setAddingChannel(false);
    }
  };

  const handleScrape = async (ch: ViralChannel) => {
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

      if (data?.status === "done") {
        toast.success(`@${ch.username} scraped — ${data.videosStored ?? 0} videos`);
        fetchVideos();
        fetchChannels();
      } else {
        toast.info(`Scraping @${ch.username}…`);
        fetchChannels();
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

  // ── Filtered videos ──────────────────────────────────────────────────────────

  const filteredVideos = (() => {
    let result = [...videos];

    // Channel filter
    if (selectedChannelIds.length > 0) {
      result = result.filter((v) => selectedChannelIds.includes(v.channel_id));
    }

    // Platform
    if (filterPlatform !== "all") {
      result = result.filter((v) => v.platform === filterPlatform);
    }

    // Date
    if (filterDate !== "all") {
      const daysMap: Record<string, number> = {
        "7days": 7, "30days": 30, "3months": 90, "6months": 180, "12months": 365,
      };
      const days = daysMap[filterDate];
      if (days) {
        const cutoff = Date.now() - days * 86_400_000;
        result = result.filter(
          (v) => v.posted_at && new Date(v.posted_at).getTime() >= cutoff
        );
      }
    }

    // Outlier
    const minOutlier = parseFloat(filterOutlier);
    if (minOutlier > 0) {
      result = result.filter((v) => v.outlier_score >= minOutlier);
    }

    // Views
    const minViews = parseInt(filterViews);
    if (minViews > 0) {
      result = result.filter((v) => v.views_count >= minViews);
    }

    // Engagement
    const minEngage = parseFloat(filterEngagement);
    if (minEngage > 0) {
      result = result.filter((v) => v.engagement_rate >= minEngage);
    }

    // Search
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (v) =>
          v.caption?.toLowerCase().includes(q) ||
          v.channel_username.toLowerCase().includes(q)
      );
    }

    // Sort
    switch (filterSort) {
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

  const hasActiveFilters =
    filterPlatform !== "all" ||
    filterDate !== "12months" ||
    filterOutlier !== "0" ||
    filterViews !== "0" ||
    filterEngagement !== "0" ||
    selectedChannelIds.length > 0;

  const clearFilters = () => {
    setFilterDate("12months");
    setFilterPlatform("all");
    setFilterOutlier("0");
    setFilterViews("0");
    setFilterEngagement("0");
    setSelectedChannelIds([]);
    setSearch("");
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="min-h-screen dark:bg-[#1a1a1a] bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin dark:text-zinc-600 text-slate-600" />
      </div>
    );
  }

  const runningChannels = channels.filter((c) => c.scrape_status === "running");

  return (
    <div className="min-h-screen flex dark:bg-[#1a1a1a] bg-slate-50">
      {sidebarOpen && (
        <div className="fixed inset-0 dark:bg-black/40 bg-black/20 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      <DashboardSidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} currentPath="/viral-today" />

      <main className="flex-1 flex flex-col min-h-screen overflow-hidden">
        <DashboardTopBar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

        <div className="flex-1 px-5 sm:px-8 pt-6 pb-12 overflow-auto">

          {/* ── Header ── */}
          <div className="mb-5">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-xl font-bold dark:text-zinc-100 text-slate-900 tracking-tight">
                  {view === "videos" ? t.videos : t.channels}
                </h1>
                <p className="text-xs dark:text-zinc-500 text-slate-600 mt-0.5">
                  {view === "videos"
                    ? t.videosDesc
                    : t.channelsDesc}
                </p>
              </div>

              {/* Language toggle + View toggle */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setLang(lang === "en" ? "es" : "en")}
                  className="px-2 py-1 rounded-md text-xs font-medium dark:bg-white/[0.04] dark:border dark:border-white/[0.08] dark:text-zinc-400 dark:hover:bg-white/[0.08] bg-slate-200 border border-slate-300 text-slate-700 hover:bg-slate-300 transition-all"
                >
                  {lang === "en" ? "ES" : "EN"}
                </button>
                <div className="flex items-center gap-1 dark:bg-white/[0.04] dark:border dark:border-white/[0.08] bg-slate-200 border border-slate-300 rounded-lg p-0.5">
                  <button
                    onClick={() => setView("videos")}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                      view === "videos"
                        ? "dark:bg-white/10 dark:text-zinc-100 bg-white text-slate-900"
                        : "dark:text-zinc-500 dark:hover:text-zinc-300 text-slate-700 hover:text-slate-900"
                    )}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    {t.videos}
                    {videos.length > 0 && (
                      <span className="text-[10px] dark:bg-white/10 bg-slate-300 px-1.5 py-0.5 rounded-full">
                        {filteredVideos.length}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setView("channels")}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                      view === "channels"
                        ? "dark:bg-white/10 dark:text-zinc-100 bg-white text-slate-900"
                        : "dark:text-zinc-500 dark:hover:text-zinc-300 text-slate-700 hover:text-slate-900"
                    )}
                  >
                    <Radio className="w-3.5 h-3.5" />
                    {t.channels}
                    {channels.length > 0 && (
                      <span className="text-[10px] dark:bg-white/10 bg-slate-300 px-1.5 py-0.5 rounded-full">
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
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 dark:text-zinc-500 text-slate-600 pointer-events-none" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={t.search}
                      className="w-full h-8 pl-9 pr-4 dark:bg-white/[0.04] dark:border dark:border-white/[0.08] bg-white border border-slate-300 rounded-lg text-xs dark:text-zinc-200 text-slate-900 dark:placeholder-zinc-600 placeholder-slate-500 focus:outline-none dark:focus:border-white/20 dark:focus:bg-white/[0.06] focus:border-primary/50 focus:bg-slate-50 transition-all"
                    />
                    {search && (
                      <button
                        onClick={() => setSearch("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2"
                      >
                        <X className="w-3 h-3 dark:text-zinc-500 text-slate-600" />
                      </button>
                    )}
                  </div>

                  {/* Sort */}
                  <FilterChip
                    label={t.sort}
                    options={SORT_OPTS}
                    value={filterSort}
                    onChange={setFilterSort}
                    isActive={filterSort !== "recent"}
                  />
                </div>

                {/* Filter chips */}
                <div className="flex items-center gap-1.5 mb-5 flex-wrap">
                  <SlidersHorizontal className="w-3.5 h-3.5 dark:text-zinc-600 text-slate-600 flex-shrink-0" />

                  <ChannelChip
                    channels={channels}
                    selected={selectedChannelIds}
                    onChange={setSelectedChannelIds}
                  />

                  <FilterChip
                    label={t.allTime}
                    options={DATE_OPTS}
                    value={filterDate}
                    onChange={setFilterDate}
                    isActive={filterDate !== "all" && filterDate !== "12months"}
                  />

                  <FilterChip
                    label={t.platforms}
                    options={PLATFORM_OPTS}
                    value={filterPlatform}
                    onChange={setFilterPlatform}
                    isActive={filterPlatform !== "all"}
                  />

                  <FilterChip
                    label={t.outlier}
                    options={OUTLIER_OPTS}
                    value={filterOutlier}
                    onChange={setFilterOutlier}
                    isActive={filterOutlier !== "0"}
                  />

                  <FilterChip
                    label={t.views}
                    options={VIEWS_OPTS}
                    value={filterViews}
                    onChange={setFilterViews}
                    isActive={filterViews !== "0"}
                  />

                  <FilterChip
                    label={t.engagement}
                    options={ENGAGEMENT_OPTS}
                    value={filterEngagement}
                    onChange={setFilterEngagement}
                    isActive={filterEngagement !== "0"}
                  />

                  {hasActiveFilters && (
                    <button
                      onClick={clearFilters}
                      className="h-7 px-3 rounded-full text-[11px] font-medium text-red-400 dark:border dark:border-red-500/20 dark:bg-red-500/5 dark:hover:bg-red-500/10 border border-red-300 bg-red-100 hover:bg-red-200 transition-all flex items-center gap-1"
                    >
                      <X className="w-3 h-3" />
                      {t.clear}
                    </button>
                  )}
                </div>

                {/* Running indicator */}
                {runningChannels.length > 0 && (
                  <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg dark:bg-amber-500/5 dark:border dark:border-amber-500/20 bg-amber-100/50 border border-amber-300 text-xs dark:text-amber-400 text-amber-700 w-fit">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {t.scraping} {runningChannels.map((c) => `@${c.username}`).join(", ")}… {t.refreshing}
                  </div>
                )}

                {/* Video grid */}
                {loadingVideos ? (
                  <div className="flex items-center justify-center py-24">
                    <Loader2 className="w-6 h-6 animate-spin dark:text-zinc-600 text-slate-600" />
                  </div>
                ) : videos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-24 text-center">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 dark:bg-white/[0.03] dark:border dark:border-white/[0.06] bg-slate-200 border border-slate-300">
                      <TrendingUp className="w-6 h-6 dark:text-zinc-700 text-slate-600" />
                    </div>
                    <p className="text-sm font-medium dark:text-zinc-400 text-slate-700 mb-1">{t.noVideos}</p>
                    <p className="text-xs dark:text-zinc-600 text-slate-600 max-w-xs mb-5">
                      {t.noVideosDesc}
                    </p>
                    <button
                      onClick={() => setView("channels")}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg dark:bg-white/[0.06] dark:border dark:border-white/[0.12] dark:text-zinc-300 dark:hover:text-zinc-100 dark:hover:bg-white/[0.09] bg-slate-300 border border-slate-400 text-slate-800 hover:bg-slate-400 text-xs font-medium transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {t.addChannels}
                    </button>
                  </div>
                ) : filteredVideos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-24 text-center">
                    <Filter className="w-6 h-6 dark:text-zinc-700 text-slate-600 mb-3" />
                    <p className="text-sm font-medium dark:text-zinc-400 text-slate-700 mb-1">{t.noVideosMatch}</p>
                    <button
                      onClick={clearFilters}
                      className="mt-3 text-xs text-primary hover:text-primary/80 transition-colors"
                    >
                      {t.clearAllFilters}
                    </button>
                  </div>
                ) : (
                  <motion.div
                    layout
                    className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3"
                  >
                    <AnimatePresence>
                      {filteredVideos.map((v) => (
                        <VideoCard key={v.id} video={v} />
                      ))}
                    </AnimatePresence>
                  </motion.div>
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
                {/* Add channel bar */}
                {isAdmin && (
                  <div className="flex items-center gap-2 mb-5 p-4 rounded-xl dark:bg-[#111115] dark:border dark:border-white/[0.07] bg-white border border-slate-200">
                    <div className="w-8 h-8 rounded-full dark:bg-gradient-to-br dark:from-pink-500/20 dark:to-purple-500/20 dark:border dark:border-pink-500/20 bg-gradient-to-br from-pink-100 to-purple-100 border border-pink-300 flex items-center justify-center flex-shrink-0">
                      <Instagram className="w-4 h-4 dark:text-pink-400 text-pink-700" />
                    </div>
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs dark:text-zinc-500 text-slate-600 pointer-events-none">@</span>
                      <input
                        type="text"
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleAddChannel()}
                        placeholder={t.username}
                        className="w-full h-9 pl-7 pr-4 dark:bg-white/[0.04] dark:border dark:border-white/[0.08] bg-slate-100 border border-slate-300 rounded-lg text-sm dark:text-zinc-200 text-slate-900 dark:placeholder-zinc-600 placeholder-slate-500 focus:outline-none dark:focus:border-white/20 focus:border-primary/50 transition-all"
                      />
                    </div>
                    <Button
                      onClick={handleAddChannel}
                      disabled={addingChannel || !newUsername.trim()}
                      className="h-9 px-4 dark:bg-white/[0.08] dark:hover:bg-white/[0.14] dark:border dark:border-white/[0.12] dark:text-zinc-200 bg-slate-300 hover:bg-slate-400 border border-slate-400 text-slate-900 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-all"
                    >
                      {addingChannel ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Plus className="w-3.5 h-3.5" />
                      )}
                      {t.addScrape}
                    </Button>
                  </div>
                )}

                {/* Channel list */}
                {loadingChannels ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-5 h-5 animate-spin dark:text-zinc-600 text-slate-600" />
                  </div>
                ) : channels.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 dark:bg-white/[0.03] dark:border dark:border-white/[0.06] bg-slate-200 border border-slate-300">
                      <Radio className="w-6 h-6 dark:text-zinc-700 text-slate-600" />
                    </div>
                    <p className="text-sm font-medium dark:text-zinc-400 text-slate-700 mb-1">{t.noChannels}</p>
                    <p className="text-xs dark:text-zinc-600 text-slate-600 max-w-xs">
                      {isAdmin
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
                      />
                    ))}

                    {/* Summary */}
                    <div className="pt-4 flex items-center gap-4 text-xs dark:text-zinc-600 text-slate-600 dark:border-t dark:border-white/[0.04] border-t border-slate-300">
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
      </main>
    </div>
  );
}
