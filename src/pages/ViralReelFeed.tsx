import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Star, Play, ChevronDown, Eye, Heart, MessageCircle, Zap,
  Flame, Instagram, Music, Youtube,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useClients, type Client } from "@/hooks/useClients";
import connectaLogoLight from "@/assets/connecta-logo-text-light.png";

const VPS_API = "https://connectacreators.com/api";

interface ViralVideo {
  id: string;
  channel_username: string;
  platform: string;
  video_url: string;
  thumbnail_url: string | null;
  caption: string | null;
  views_count: number;
  likes_count: number;
  comments_count: number;
  engagement_rate: number;
  outlier_score: number;
  posted_at: string | null;
  scraped_at: string | null;
}

// ── Utility helpers ──
const PALETTES = [
  ["#0f0c1e", "#3d1054"], ["#001624", "#003d5c"],
  ["#0a0a14", "#1a3a5c"], ["#0c0c0c", "#1a0a2e"],
  ["#001a10", "#003320"], ["#1a001a", "#3d0066"],
  ["#1a0a00", "#3d2000"], ["#000d1a", "#001f3d"],
];

function gradientFor(name: string) {
  let h = 0;
  for (const c of name || "") h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  const p = PALETTES[h % PALETTES.length];
  return `linear-gradient(160deg, ${p[0]} 0%, ${p[1]} 100%)`;
}

function fmtV(n: number) {
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n || 0);
}

function fmtO(s: number) {
  return s >= 100 ? `${Math.round(s)}x` : `${parseFloat(String(s)).toFixed(1)}x`;
}

function fmtEng(r: number | null) {
  if (r == null || r === 0) return "—";
  return r < 1 ? `${(r * 100).toFixed(1)}%` : `${parseFloat(String(r)).toFixed(1)}%`;
}

function inits(u: string) {
  return (u || "?").replace("@", "").slice(0, 2).toUpperCase();
}

function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const ms = Date.now() - new Date(dateStr).getTime();
  if (ms < 0 || isNaN(ms)) return "";
  const days = Math.floor(ms / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function proxyImg(url: string | null, videoUrl?: string): string | null {
  if (!url) return null;
  if (url.includes("connectacreators.com/thumb-cache")) return url;
  if (url.includes("connectacreators.com")) return url;
  if (videoUrl) return `${VPS_API}/resolve-thumb?url=${encodeURIComponent(videoUrl)}`;
  return `${VPS_API}/proxy-image?url=${encodeURIComponent(url)}`;
}

/** Get stream URL — always goes through VPS (which caches to disk) */
function getStreamUrl(video: ViralVideo): string {
  const url = video.video_url;
  if (/cdninstagram\.com|fbcdn\.net/.test(url)) {
    return `${VPS_API}/proxy-video?url=${encodeURIComponent(url)}`;
  }
  return `${VPS_API}/stream-reel?url=${encodeURIComponent(url)}`;
}

const TABS = [
  { label: "Top Outliers", value: "all", Icon: Flame },
  { label: "Instagram", value: "instagram", Icon: Instagram },
  { label: "TikTok", value: "tiktok", Icon: Music },
  { label: "YouTube", value: "youtube", Icon: Youtube },
];

// ════════════════════════════════════════════════════════════════════════════
// v14 — Single video element, lazy stream, no batch resolution
// ════════════════════════════════════════════════════════════════════════════
export default function ViralReelFeed() {
  useEffect(() => { console.log("[ViralReelFeed] v14 — single-video, lazy-stream"); }, []);
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { clients, loading: clientsLoading } = useClients(!!user);

  // ── Core state ──
  const [feedVideos, setFeedVideos] = useState<ViralVideo[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [platform, setPlatform] = useState("all");
  const [loading, setLoading] = useState(true);
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [avatarMap, setAvatarMap] = useState<Record<string, string>>({});
  const [remixClientId, setRemixClientId] = useState("");
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  // ── Feed algorithm state (frozen on load) ──
  const [videos, setVideos] = useState<ViralVideo[]>([]);
  const [initialInteractions, setInitialInteractions] = useState<Map<string, { seen_count: number; clicked: boolean }>>(new Map());
  const [interactionsReady, setInteractionsReady] = useState(false);
  const [nicheKeywords, setNicheKeywords] = useState<string[]>([]);
  const [userChannelIds, setUserChannelIds] = useState<Set<string>>(new Set());
  const seenThisSession = useRef<Set<string>>(new Set());

  // ── Refs ──
  const wrapperRef = useRef<HTMLDivElement>(null);
  const colRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);   // SINGLE video element
  const mutedRef = useRef(true);
  const hasInteracted = useRef(false);
  const activeIdxRef = useRef(0);
  const pausedRef = useRef(false);
  const scrollingRef = useRef(false);
  const touchStartY = useRef(0);
  const wheelAccum = useRef(0);
  const failedIndices = useRef<Set<number>>(new Set());

  const clientOptions = isAdmin
    ? clients.map((c) => ({ id: c.id, name: c.name || c.id }))
    : (() => {
        const own = clients.find((c: Client) => c.user_id === user?.id);
        return own ? [{ id: own.id, name: own.name || own.id }] : [];
      })();

  useEffect(() => {
    if (clientOptions.length === 1) setRemixClientId(clientOptions[0].id);
  }, [clientOptions.length]);

  // Keep refs in sync
  useEffect(() => { activeIdxRef.current = activeIdx; }, [activeIdx]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  const currentVideo = feedVideos[activeIdx] ?? null;

  // ── Unmute on first interaction ──
  useEffect(() => {
    const unmute = () => {
      if (hasInteracted.current) return;
      hasInteracted.current = true;
      mutedRef.current = false;
      setMuted(false);
      if (videoRef.current) videoRef.current.muted = false;
    };
    document.addEventListener("click", unmute, { once: true });
    document.addEventListener("touchstart", unmute, { once: true });
    return () => {
      document.removeEventListener("click", unmute);
      document.removeEventListener("touchstart", unmute);
    };
  }, []);

  // ══════════════════════════════════════════════════════════════════════════
  // VIDEO PLAYBACK — single element, swap src on navigation
  // ══════════════════════════════════════════════════════════════════════════

  // Load video when activeIdx changes
  useEffect(() => {
    const vid = videoRef.current;
    const video = feedVideos[activeIdx];
    if (!vid || !video) return;

    // Reset state
    setVideoReady(false);
    setPaused(false);

    // Set source — always stream through VPS
    const src = getStreamUrl(video);
    vid.src = src;
    vid.muted = mutedRef.current;
    vid.load();
    vid.play().catch(() => {});
  }, [activeIdx, feedVideos]);

  // Polling: check readyState, try play when data arrives
  useEffect(() => {
    if (videoReady || feedVideos.length === 0) return;
    const iv = setInterval(() => {
      const vid = videoRef.current;
      if (!vid) return;
      if (vid.readyState >= 2 || vid.currentTime > 0) {
        setVideoReady(true);
        if (vid.paused && !pausedRef.current) {
          vid.muted = mutedRef.current;
          vid.play().catch(() => {});
        }
      }
    }, 250);
    return () => clearInterval(iv);
  }, [activeIdx, videoReady, feedVideos.length]);

  // Auto-skip if video stuck (readyState 0) after 6s
  useEffect(() => {
    if (feedVideos.length === 0 || videoReady || paused) return;
    const timer = setTimeout(() => {
      const vid = videoRef.current;
      if (!vid || vid.readyState === 0) {
        console.warn("[ViralReelFeed] Auto-skip: stuck at readyState 0");
        failedIndices.current.add(activeIdx);
        setActiveIdx(prev => {
          const next = findNextValid(prev, 1);
          return next !== prev ? next : prev;
        });
      }
    }, 6000);
    return () => clearTimeout(timer);
  }, [activeIdx, videoReady, feedVideos.length, paused]);

  const togglePlayPause = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    if (vid.paused) {
      vid.muted = mutedRef.current;
      vid.play().catch(() => {});
      setPaused(false);
    } else {
      vid.pause();
      setPaused(true);
    }
  }, []);

  // ══════════════════════════════════════════════════════════════════════════
  // SCROLL NAVIGATION
  // ══════════════════════════════════════════════════════════════════════════

  // Measure container height
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const measure = () => {
      const h = wrapper.clientHeight;
      if (h > 0) {
        wrapper.style.setProperty("--card-h", `${h}px`);
        if (colRef.current) colRef.current.style.transform = `translateY(-${activeIdx * h}px)`;
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, [activeIdx]);

  const findNextValid = useCallback((from: number, dir: 1 | -1): number => {
    let idx = from + dir;
    const max = feedVideos.length - 1;
    while (idx >= 0 && idx <= max && failedIndices.current.has(idx)) idx += dir;
    return Math.max(0, Math.min(idx, max));
  }, [feedVideos.length]);

  const scrollToIdx = useCallback((idx: number) => {
    const col = colRef.current;
    const wrapper = wrapperRef.current;
    if (!col || !wrapper) return;
    col.style.transform = `translateY(-${idx * wrapper.clientHeight}px)`;
  }, []);

  useEffect(() => { scrollToIdx(activeIdx); }, [activeIdx, scrollToIdx]);

  // Navigation helper — always reads latest state via ref
  const navigate1 = useCallback((dir: 1 | -1) => {
    if (scrollingRef.current) return;
    scrollingRef.current = true;
    setActiveIdx(prev => {
      const max = feedVideos.length - 1;
      const next = Math.max(0, Math.min(max, prev + dir));
      return next;
    });
    // Lock scroll for duration of CSS transition (400ms) + buffer
    setTimeout(() => { scrollingRef.current = false; wheelAccum.current = 0; }, 500);
  }, [feedVideos.length]);

  // Wheel — simple: one scroll gesture = one video
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (scrollingRef.current) return; // locked during transition
      wheelAccum.current += e.deltaY;
      // Require a minimum delta to avoid accidental micro-scrolls
      if (Math.abs(wheelAccum.current) < 60) return;
      const dir = wheelAccum.current > 0 ? 1 : -1;
      wheelAccum.current = 0;
      navigate1(dir as 1 | -1);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [navigate1]);

  // Touch — swipe up/down
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const onTouchStart = (e: TouchEvent) => { touchStartY.current = e.touches[0].clientY; };
    const onTouchEnd = (e: TouchEvent) => {
      const delta = touchStartY.current - e.changedTouches[0].clientY;
      if (Math.abs(delta) < 60) return;
      navigate1(delta > 0 ? 1 : -1);
    };
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => { el.removeEventListener("touchstart", onTouchStart); el.removeEventListener("touchend", onTouchEnd); };
  }, [navigate1]);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        navigate1(1);
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        navigate1(-1);
      } else if (e.key === " ") {
        e.preventDefault();
        togglePlayPause();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate1, togglePlayPause]);

  // ══════════════════════════════════════════════════════════════════════════
  // DATA LOADING
  // ══════════════════════════════════════════════════════════════════════════

  const loadAvatars = useCallback(async (usernames: string[]) => {
    try {
      const uniq = [...new Set(usernames)].filter(Boolean);
      if (!uniq.length) return;
      const { data } = await supabase.from("viral_channels").select("username, avatar_url").in("username", uniq);
      if (data) {
        const map: Record<string, string> = {};
        (data as any[]).forEach((r) => { if (r.avatar_url) map[r.username] = r.avatar_url; });
        setAvatarMap(map);
      }
    } catch (_) {}
  }, []);

  const loadVideos = useCallback(async (plat: string) => {
    setLoading(true);
    const PAGE_SIZE = 1000;
    const MAX_VIDEOS = 3000;
    let allVideos: ViralVideo[] = [];
    let page = 0;
    const threshold = parseFloat(localStorage.getItem('viral_outlier_threshold') ?? '5');
    while (allVideos.length < MAX_VIDEOS) {
      let query = supabase
        .from("viral_videos")
        .select("id, channel_id, channel_username, platform, video_url, thumbnail_url, caption, views_count, likes_count, comments_count, engagement_rate, outlier_score, posted_at, scraped_at")
        .gte("outlier_score", threshold)
        .order("outlier_score", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (plat !== "all") query = (query as any).eq("platform", plat);
      const { data, error } = await query;
      if (error) { toast.error("Failed to load videos"); setLoading(false); return; }
      const batch = (data as ViralVideo[]) || [];
      allVideos = [...allVideos, ...batch];
      if (batch.length < PAGE_SIZE) break;
      page++;
    }
    setVideos(allVideos);
    setLoading(false);
    if (allVideos.length) loadAvatars(allVideos.map((v) => v.channel_username));
  }, [loadAvatars]);

  useEffect(() => { loadVideos("all"); }, [loadVideos]);

  // ── Feed algorithm ──
  const buildFeed = useCallback((allVideos: ViralVideo[], interactions: Map<string, { seen_count: number; clicked: boolean }>) => {
    const now = Date.now();
    const filtered = allVideos.filter(v => {
      const inter = interactions.get(v.id);
      return !inter || inter.seen_count < 10;
    });
    const scored = filtered.map(v => {
      let score = v.outlier_score * 10;
      const ageDays = (now - new Date((v as any).posted_at ?? (v as any).scraped_at ?? now).getTime()) / 86_400_000;
      score += Math.max(0, 30 - (ageDays / 90) * 30);
      if (nicheKeywords.length > 0) {
        const text = ((v.caption || "") + " " + v.channel_username).toLowerCase();
        if (nicheKeywords.some(kw => text.includes(kw))) score += 40;
      }
      if ((v as any).channel_id && userChannelIds.has((v as any).channel_id)) score += 20;
      const inter = interactions.get(v.id);
      if (!inter) { score += 25; } else { score -= inter.seen_count * 15; }
      return { video: v, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.map(s => s.video);
  }, [nicheKeywords, userChannelIds]);

  // Interactions + niche
  useEffect(() => {
    if (!user) { setInteractionsReady(true); return; }
    (async () => {
      const { data } = await supabase.from("viral_video_interactions").select("video_id, seen_count, clicked").eq("user_id", user.id);
      if (data) {
        const map = new Map<string, { seen_count: number; clicked: boolean }>();
        data.forEach((r: any) => map.set(r.video_id, { seen_count: r.seen_count, clicked: r.clicked }));
        setInitialInteractions(map);
      }
      setInteractionsReady(true);
    })();
    const clientId = localStorage.getItem("dashboard_viewMode");
    if (clientId && clientId !== "master" && clientId !== "me") {
      (async () => {
        const { data } = await supabase.from("clients").select("niche_keywords, onboarding_data").eq("id", clientId).maybeSingle();
        if (!data) return;
        let kws: string[] = data.niche_keywords ?? [];
        if (kws.length === 0 && data.onboarding_data) {
          const od = data.onboarding_data as Record<string, string>;
          const fields = [od.industry, od.industryOther, od.niche, od.target_client, od.unique_offer].filter(Boolean);
          kws = [...new Set(fields.join(" ").toLowerCase().split(/[\s,;|]+/).filter(w => w.length > 2))];
        }
        setNicheKeywords(kws);
      })();
    }
    (async () => {
      const { data } = await supabase.from("viral_channels").select("id, created_by");
      if (data) setUserChannelIds(new Set(data.filter((c: any) => c.created_by === user.id).map((c: any) => c.id)));
    })();
  }, [user]);

  // Build frozen feed
  useEffect(() => {
    if (loading || !interactionsReady || videos.length === 0) return;
    const feed = buildFeed(videos, initialInteractions);
    setFeedVideos(feed);
    setActiveIdx(0);
  }, [loading, interactionsReady, videos, initialInteractions, buildFeed]);

  // Flush seen
  const flushSeen = useCallback(async () => {
    if (!user || seenThisSession.current.size === 0) return;
    const ids = Array.from(seenThisSession.current);
    seenThisSession.current.clear();
    try { await supabase.rpc("upsert_video_seen", { p_user_id: user.id, p_video_ids: ids }); } catch (e) { console.error("[ReelFeed] flush seen:", e); }
  }, [user]);

  useEffect(() => {
    const timer = setInterval(flushSeen, 30_000);
    const handleUnload = () => flushSeen();
    window.addEventListener("beforeunload", handleUnload);
    return () => { clearInterval(timer); window.removeEventListener("beforeunload", handleUnload); flushSeen(); };
  }, [flushSeen]);

  // Mark seen after 3s
  useEffect(() => {
    const vid = feedVideos[activeIdx];
    if (!vid) return;
    const timer = setTimeout(() => seenThisSession.current.add(vid.id), 3000);
    return () => clearTimeout(timer);
  }, [activeIdx, feedVideos]);

  // ── Inspire Script ──
  const handleInspireScript = () => {
    if (!currentVideo || !remixClientId) { toast.error("Select a client first"); return; }
    navigate(`/clients/${remixClientId}/scripts`, {
      state: {
        remixVideo: {
          id: currentVideo.id, url: currentVideo.video_url,
          thumbnail_url: currentVideo.thumbnail_url, caption: currentVideo.caption,
          channel_username: currentVideo.channel_username, platform: currentVideo.platform,
        },
      },
    });
  };

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════

  return (
    <>
      <style>{`
        .reel-col-wrapper { overflow: hidden; touch-action: none; }
        .reel-col {
          display: flex; flex-direction: column;
          transition: transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        }
        .reel-col::-webkit-scrollbar { display: none; }
        .reel-card {
          min-height: var(--card-h, 100%);
          height: var(--card-h, 100%);
          flex: 0 0 var(--card-h, 100%);
        }
        @keyframes reelSpin { to { transform: rotate(360deg) } }
        .reel-spin { animation: reelSpin 0.8s linear infinite; }
      `}</style>

      <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-background">

        {/* ── TABS (desktop) ── */}
        <div className="hidden lg:flex items-center gap-1.5 px-5 py-2.5 border-b border-border flex-shrink-0">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => { setPlatform(tab.value); loadVideos(tab.value); }}
              className={cn(
                "px-4 py-1.5 rounded-full text-xs font-medium border transition-all flex items-center gap-1.5",
                platform === tab.value
                  ? "bg-card border-border/80 text-foreground font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <tab.Icon className={cn("w-3.5 h-3.5", tab.value === "all" && platform === tab.value && "text-orange-400")} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── FEED ── */}
        {(loading || !interactionsReady) ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full reel-spin" />
            <span className="text-sm text-muted-foreground">Loading viral feed…</span>
          </div>
        ) : feedVideos.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center">
              <Eye className="w-7 h-7 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground max-w-xs">
              You've seen all the top content! Check back later or explore the Grid view.
            </p>
          </div>
        ) : (
          <div className="flex-1 flex min-h-0 overflow-hidden">

            {/* ── VIDEO COLUMN ── */}
            <div className="flex-1 flex justify-center overflow-hidden relative">

              {/* Floating controls overlay */}
              <div className="w-full lg:w-[380px] absolute inset-0 mx-auto pointer-events-none z-20">
                <div
                  className="absolute top-0 left-0 right-0 h-20 pointer-events-none lg:hidden"
                  style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.65) 0%, transparent 100%)" }}
                />
                <div className="absolute top-3 left-4 pointer-events-none">
                  <img src={connectaLogoLight} alt="Connecta" className="h-5 object-contain opacity-80 drop-shadow-lg" />
                </div>
                <div className="absolute top-3 right-3 pointer-events-auto flex items-center gap-1 lg:hidden">
                  {TABS.map((tab) => (
                    <button
                      key={tab.value}
                      onClick={() => { setPlatform(tab.value); loadVideos(tab.value); }}
                      title={tab.label}
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center border transition-all backdrop-blur-sm",
                        platform === tab.value
                          ? "bg-white/25 border-white/40 text-white"
                          : "border-white/15 text-white/60 bg-black/30 hover:text-white"
                      )}
                    >
                      <tab.Icon className="w-3.5 h-3.5" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Scroll container */}
              <div ref={wrapperRef} className="reel-col-wrapper w-full lg:w-[380px] bg-black absolute inset-0 mx-auto">

              {/* PERSISTENT video element — sits ABOVE the scroll column, never unmounts */}
              <video
                ref={videoRef}
                className="absolute inset-0 w-full h-full object-cover"
                style={{ zIndex: 5, opacity: videoReady ? 1 : 0, transition: "opacity 0.3s" }}
                playsInline
                muted={muted}
                loop
                preload="auto"
                onClick={togglePlayPause}
                onPlaying={() => setVideoReady(true)}
                onTimeUpdate={(e) => {
                  if (!videoReady && e.currentTarget.currentTime > 0) setVideoReady(true);
                }}
                onCanPlay={(e) => {
                  if (e.currentTarget.paused && !pausedRef.current) {
                    e.currentTarget.muted = mutedRef.current;
                    e.currentTarget.play().catch(() => {});
                  }
                }}
                onError={() => {
                  const vid = videoRef.current;
                  const video = feedVideos[activeIdxRef.current];
                  if (!vid || !video) return;
                  const streamUrl = `${VPS_API}/stream-reel?url=${encodeURIComponent(video.video_url)}`;
                  if (!vid.src.includes('/stream-reel')) {
                    vid.src = streamUrl;
                    vid.load();
                    vid.play().catch(() => {});
                  } else {
                    failedIndices.current.add(activeIdxRef.current);
                    setTimeout(() => {
                      setActiveIdx(prev => {
                        const next = findNextValid(prev, 1);
                        return next !== prev ? next : prev;
                      });
                    }, 800);
                  }
                }}
              />

              {/* Loading spinner — above video */}
              {!videoReady && !paused && feedVideos.length > 0 && (
                <div className="absolute inset-0 z-[6] flex items-center justify-center pointer-events-none">
                  <div className="w-10 h-10 border-2 border-white/20 border-t-white/60 rounded-full reel-spin" />
                </div>
              )}

              {/* Paused indicator — above video */}
              {paused && (
                <div className="absolute inset-0 z-[6] flex items-center justify-center pointer-events-none">
                  <div className="w-16 h-16 rounded-full bg-black/50 backdrop-blur-md border border-white/20 flex items-center justify-center animate-in fade-in zoom-in duration-200">
                    <Play className="w-7 h-7 text-white fill-white ml-1" />
                  </div>
                </div>
              )}

              <div ref={colRef} className="reel-col w-full h-full" style={{ position: "relative", zIndex: 7 }}>
                {feedVideos.map((v, idx) => {
                  const isActive = idx === activeIdx;
                  const nearActive = Math.abs(idx - activeIdx) <= 3;

                  // Virtualize — only render nearby cards
                  if (!nearActive) return <div key={v.id} className="reel-card w-full" />;

                  const avatarUrl = avatarMap[v.channel_username];
                  return (
                    <div
                      key={v.id}
                      className="reel-card relative w-full overflow-hidden cursor-pointer"
                      style={{ pointerEvents: isActive ? "none" : "auto" }}
                      onClick={() => { if (isActive) togglePlayPause(); }}
                    >
                      {/* Gradient bg — hidden on active card when video plays */}
                      <div
                        className="absolute inset-0 z-0"
                        style={{
                          background: gradientFor(v.channel_username),
                          opacity: isActive && videoReady ? 0 : 1,
                          transition: "opacity 0.3s",
                        }}
                      />

                      {/* Thumbnail — fades when video plays on active card */}
                      {v.thumbnail_url && (
                        <img
                          src={nearActive ? (proxyImg(v.thumbnail_url, v.video_url) ?? v.thumbnail_url) : undefined}
                          alt=""
                          className="absolute inset-0 w-full h-full object-cover z-[2]"
                          style={{
                            opacity: isActive && videoReady ? 0 : 1,
                            transition: "opacity 0.3s",
                            pointerEvents: "none",
                          }}
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0"; }}
                        />
                      )}

                      {/* Mobile right-side actions (TikTok-style) */}
                      {isActive && (
                        <div className="absolute right-3 bottom-[140px] z-[6] flex flex-col items-center gap-5 lg:hidden" style={{ pointerEvents: "auto" }}>
                          <div className="flex flex-col items-center gap-1">
                            <div className="w-11 h-11 rounded-full bg-black/40 backdrop-blur-sm border border-white/20 flex items-center justify-center">
                              <Flame className="w-5 h-5 text-orange-400 fill-orange-400" />
                            </div>
                            <span className="text-white text-[10px] font-bold drop-shadow">{fmtO(v.outlier_score)}</span>
                          </div>
                          <div className="flex flex-col items-center gap-1">
                            <div className="w-11 h-11 rounded-full bg-black/40 backdrop-blur-sm border border-white/20 flex items-center justify-center">
                              <Eye className="w-5 h-5 text-white/80" />
                            </div>
                            <span className="text-white text-[10px] font-bold drop-shadow">{fmtV(v.views_count)}</span>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); setMobileSheetOpen(true); }}
                            className="flex flex-col items-center gap-1"
                          >
                            <div
                              className="w-11 h-11 rounded-full flex items-center justify-center border border-white/20"
                              style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}
                            >
                              <Star className="w-5 h-5 text-white fill-white" />
                            </div>
                            <span className="text-white text-[10px] font-bold drop-shadow">Script</span>
                          </button>
                        </div>
                      )}

                      {/* Bottom overlay */}
                      <div
                        className="absolute bottom-0 left-0 right-0 z-[5] p-4 pb-20 lg:pb-5 pr-16 lg:pr-4"
                        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.6) 40%, rgba(0,0,0,0.2) 70%, transparent 100%)" }}
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          {avatarUrl ? (
                            <img src={avatarUrl} alt="" className="w-9 h-9 rounded-full border-2 border-white/40 object-cover flex-shrink-0" />
                          ) : (
                            <div
                              className="w-9 h-9 rounded-full border-2 border-white/40 flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
                              style={{ background: gradientFor(v.channel_username) }}
                            >
                              {inits(v.channel_username)}
                            </div>
                          )}
                          <span className="text-sm font-bold text-white drop-shadow-lg">@{v.channel_username}</span>
                        </div>
                        {v.caption && (
                          <p className="text-[13px] text-white/90 leading-relaxed line-clamp-3 drop-shadow">{v.caption}</p>
                        )}
                      </div>

                      {/* Scroll hint on first card */}
                      {idx === 0 && (
                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-[6] flex flex-col items-center gap-0.5 pointer-events-none animate-bounce opacity-40">
                          <ChevronDown className="w-4 h-4 text-white" />
                          <span className="text-[9px] text-white/50 uppercase tracking-widest">scroll</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              </div>
            </div>

            {/* ── INFO PANEL (desktop) ── */}
            <div className="hidden lg:flex w-[300px] flex-shrink-0 flex-col border-l border-border bg-card overflow-hidden">
              {currentVideo ? (
                <>
                  <div className="flex items-center gap-3 p-5 border-b border-border flex-shrink-0">
                    <div className="relative flex-shrink-0">
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center overflow-hidden border-2 border-white/10"
                        style={{ background: gradientFor(currentVideo.channel_username) }}
                      >
                        {avatarMap[currentVideo.channel_username] ? (
                          <img src={avatarMap[currentVideo.channel_username]} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-sm font-bold text-white">{inits(currentVideo.channel_username)}</span>
                        )}
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-card border-2 border-card flex items-center justify-center">
                        {currentVideo.platform === "instagram" ? <Instagram className="w-3 h-3 text-pink-400" /> : currentVideo.platform === "tiktok" ? <Music className="w-3 h-3 text-cyan-400" /> : <Youtube className="w-3 h-3 text-red-400" />}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-foreground truncate">@{currentVideo.channel_username}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground capitalize">{currentVideo.platform}</span>
                        {timeAgo(currentVideo.posted_at) && (
                          <>
                            <span className="text-muted-foreground/40">·</span>
                            <span className="text-xs text-muted-foreground">{timeAgo(currentVideo.posted_at)}</span>
                          </>
                        )}
                      </div>
                    </div>
                    {currentVideo.platform === "instagram" ? (
                      <a href={currentVideo.video_url} target="_blank" rel="noopener noreferrer" title="Open on Instagram"
                        className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center hover:opacity-80 transition-opacity"
                        style={{ background: "linear-gradient(135deg, #e1306c, #fd1d1d, #fcb045)" }}>
                        <Instagram className="w-4 h-4 text-white" />
                      </a>
                    ) : currentVideo.platform === "tiktok" ? (
                      <a href={currentVideo.video_url} target="_blank" rel="noopener noreferrer" title="Open on TikTok"
                        className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center hover:opacity-80 transition-opacity bg-black">
                        <Music className="w-4 h-4 text-cyan-400" />
                      </a>
                    ) : (
                      <a href={currentVideo.video_url} target="_blank" rel="noopener noreferrer" title="Open on YouTube"
                        className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center hover:opacity-80 transition-opacity bg-[#ff0000]">
                        <Youtube className="w-4 h-4 text-white" />
                      </a>
                    )}
                  </div>

                  <div className="px-5 py-4 border-b border-border flex-shrink-0">
                    <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest mb-2">Outlier Score</p>
                    <div className={cn(
                      "inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold",
                      currentVideo.outlier_score >= 20
                        ? "bg-orange-500/20 border border-orange-500/50 text-orange-400"
                        : "bg-orange-500/10 border border-orange-500/20 text-orange-500/75"
                    )}>
                      <Flame className="w-5 h-5 text-orange-400 fill-orange-400" />
                      <span className="text-3xl leading-none">{fmtO(currentVideo.outlier_score)}</span>
                      <span className="text-xs font-medium opacity-60 self-end mb-0.5">outlier</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 p-4 border-b border-border flex-shrink-0">
                    {[
                      { icon: <Eye className="w-4 h-4 text-muted-foreground" />, val: fmtV(currentVideo.views_count), lbl: "Views" },
                      { icon: <Heart className="w-4 h-4 text-red-400" />, val: fmtV(currentVideo.likes_count), lbl: "Likes" },
                      { icon: <MessageCircle className="w-4 h-4 text-muted-foreground" />, val: fmtV(currentVideo.comments_count), lbl: "Comments" },
                      { icon: <Zap className="w-4 h-4 text-primary" />, val: fmtEng(currentVideo.engagement_rate), lbl: "Engagement" },
                    ].map((s) => (
                      <div key={s.lbl} className={cn("rounded-xl p-3 border", s.lbl === "Engagement" ? "bg-primary/5 border-primary/15" : "bg-muted/40 border-border")}>
                        <div className="mb-1">{s.icon}</div>
                        <div className="text-[17px] font-bold text-foreground leading-tight">{s.val}</div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mt-0.5">{s.lbl}</div>
                      </div>
                    ))}
                  </div>

                  <div className="flex-1 min-h-0 p-4 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                    <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest mb-2">Caption</p>
                    <p className="text-sm text-foreground/80 leading-relaxed">
                      {currentVideo.caption
                        ? currentVideo.caption.split(/(#\w+)/g).map((part, i) =>
                            part.startsWith("#") ? <span key={i} className="text-primary">{part}</span> : part
                          )
                        : "—"}
                    </p>
                  </div>

                  <div className="p-4 pt-3 border-t border-border flex flex-col gap-2 flex-shrink-0">
                    {clientOptions.length > 1 && (
                      <select value={remixClientId} onChange={(e) => setRemixClientId(e.target.value)}
                        className="w-full h-9 rounded-lg border border-border bg-background text-sm px-3 text-foreground">
                        <option value="">Select client…</option>
                        {clientOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    )}
                    <button
                      onClick={handleInspireScript}
                      disabled={!remixClientId || clientsLoading}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-background font-semibold text-sm hover:opacity-90 transition-all disabled:opacity-50"
                    >
                      <Star className="w-4 h-4 fill-current" /> Inspire Script
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-sm text-muted-foreground">Scroll to a video</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Mobile Inspire Script bottom sheet */}
      {mobileSheetOpen && (
        <>
          <div className="fixed inset-0 z-[60] bg-black/60 lg:hidden" onClick={() => setMobileSheetOpen(false)} />
          <div
            className="fixed bottom-0 left-0 right-0 z-[70] lg:hidden rounded-t-2xl bg-card border-t border-border p-5 pb-10 animate-in slide-in-from-bottom duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-muted-foreground/30 rounded-full mx-auto mb-5" />
            <p className="font-bold text-base text-foreground mb-0.5">Inspire a Script</p>
            {currentVideo && (
              <p className="text-xs text-muted-foreground mb-4 truncate">@{currentVideo.channel_username} · {currentVideo.platform}</p>
            )}
            {clientOptions.length > 1 && (
              <select value={remixClientId} onChange={(e) => setRemixClientId(e.target.value)}
                className="w-full h-11 rounded-xl border border-border bg-background text-sm px-3 text-foreground mb-3">
                <option value="">Select client…</option>
                {clientOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            <button
              onClick={() => { setMobileSheetOpen(false); handleInspireScript(); }}
              disabled={!remixClientId || clientsLoading}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-white font-semibold text-sm disabled:opacity-50 transition-all"
              style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}
            >
              <Star className="w-4 h-4 fill-current" /> Open Canvas
            </button>
          </div>
        </>
      )}
    </>
  );
}
