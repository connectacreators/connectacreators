import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  VolumeX, Volume2, Star,
  Play, ChevronUp, ChevronDown, Eye, Heart, MessageCircle, Zap,
  Flame, Instagram, Music, Youtube,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useClients, type Client } from "@/hooks/useClients";
import connectaLogoLight from "@/assets/connecta-logo-text-light.png";

const VPS_API = "https://connectacreators.com/api";
const VPS_API_KEY = "ytdlp_connecta_2026_secret";

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
}

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

function proxyImg(url: string | null): string | null {
  if (!url) return null;
  if (url.includes("connectacreators.com/thumb-cache")) return url;
  if (url.includes("cdninstagram.com") || url.includes("fbcdn.net") || url.includes("instagram.f")) {
    return `https://connectacreators.com/api/proxy-image?url=${encodeURIComponent(url)}`;
  }
  return url;
}

const TABS = [
  { label: "Top Outliers", value: "all", Icon: Flame },
  { label: "Instagram", value: "instagram", Icon: Instagram },
  { label: "TikTok", value: "tiktok", Icon: Music },
  { label: "YouTube", value: "youtube", Icon: Youtube },
];

export default function ViralReelFeed() {
  // v7 — cache-first + Inspire Script + mobile responsive
  useEffect(() => { console.log("[ViralReelFeed] v7 — cache-first + inspire + mobile"); }, []);
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { clients, loading: clientsLoading } = useClients(!!user);
  const [videos, setVideos] = useState<ViralVideo[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [platform, setPlatform] = useState("all");
  const [loading, setLoading] = useState(true);
  const [muted, setMuted] = useState(true);
  const [avatarMap, setAvatarMap] = useState<Record<string, string>>({});
  const [paused, setPaused] = useState(false);
  const [useEmbed, setUseEmbed] = useState(false); // YouTube embed fallback
  const [remixClientId, setRemixClientId] = useState("");
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  // ── Feed algorithm state ──
  const [interactions, setInteractions] = useState<Map<string, { seen_count: number; clicked: boolean }>>(new Map());
  const [nicheKeywords, setNicheKeywords] = useState<string[]>([]);
  const [userChannelIds, setUserChannelIds] = useState<Set<string>>(new Set());
  const seenThisSession = useRef<Set<string>>(new Set());

  // Build client options (admin sees all, user sees own)
  const clientOptions = isAdmin
    ? clients.map((c) => ({ id: c.id, name: c.name || c.id }))
    : (() => {
        const own = clients.find((c: Client) => c.user_id === user?.id);
        return own ? [{ id: own.id, name: own.name || own.id }] : [];
      })();

  // Auto-select if only one client
  useEffect(() => {
    if (clientOptions.length === 1) setRemixClientId(clientOptions[0].id);
  }, [clientOptions.length]);

  const colRef = useRef<HTMLDivElement>(null);
  const activeVideoRef = useRef<HTMLVideoElement | null>(null);
  const mutedRef = useRef(true);
  const activeIdxRef = useRef(0);
  const pausedRef = useRef(false);
  const igErrorStage = useRef<Map<string, "cobalt" | "stream" | "failed">>(new Map());
  const [igFailed, setIgFailed] = useState<Set<string>>(new Set());

  // Keep refs in sync with state (so event handlers always have latest values)
  useEffect(() => { activeIdxRef.current = activeIdx; }, [activeIdx]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  // ── Sorted videos using feed algorithm ──
  const sortedVideos = useMemo(() => {
    const now = Date.now();
    return [...videos]
      .filter(v => {
        const inter = interactions.get(v.id);
        return !inter || inter.seen_count < 4;
      })
      .sort((a, b) => {
        const scoreFor = (v: ViralVideo) => {
          let s = v.outlier_score * 10;
          const ageDays = (now - new Date((v as any).posted_at ?? (v as any).scraped_at ?? now).getTime()) / 86_400_000;
          s += Math.max(0, 30 - (ageDays / 90) * 30);
          if (nicheKeywords.length > 0) {
            const text = ((v.caption || "") + " " + v.channel_username).toLowerCase();
            if (nicheKeywords.some(kw => text.includes(kw))) s += 40;
          }
          if ((v as any).channel_id && userChannelIds.has((v as any).channel_id)) s += 20;
          const inter = interactions.get(v.id);
          if (inter) { s -= inter.seen_count * 15; if (inter.clicked) s -= 10; }
          return s;
        };
        return scoreFor(b) - scoreFor(a);
      });
  }, [videos, interactions, nicheKeywords, userChannelIds]);

  const currentVideo = sortedVideos[activeIdx] ?? null;

  // ── Measure container height via CSS custom property (NO re-renders) ──
  useEffect(() => {
    const col = colRef.current;
    if (!col) return;
    const measure = () => {
      const h = col.clientHeight;
      if (h > 0) col.style.setProperty("--card-h", `${h}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(col);
    return () => ro.disconnect();
  }, []);

  // ── Build video URL: cache-first (verified via HEAD), then stream fallback ──
  const resolvedUrls = useRef<Map<string, string>>(new Map());

  const getCacheUrl = useCallback((video: ViralVideo): string | null => {
    const url = video.video_url;
    if (/connectacreators\.com\/(video-cache|videos|api)/.test(url)) return url;
    const id = (url.match(/\/reel\/([^/?]+)/) || url.match(/\/p\/([^/?]+)/) ||
                url.match(/\/video\/([^/?]+)/) || url.match(/\/shorts\/([^/?]+)/))?.[1];
    if (!id) return null;
    const plat = url.includes("instagram") ? "ig" : url.includes("tiktok") ? "tt" : "yt";
    return `https://connectacreators.com/video-cache/${plat}_${id}.mp4`;
  }, []);

  const getStreamUrl = useCallback((video: ViralVideo): string => {
    const url = video.video_url;
    if (/cdninstagram\.com|fbcdn\.net/.test(url)) {
      return `${VPS_API}/proxy-video?url=${encodeURIComponent(url)}`;
    }
    return `${VPS_API}/stream-reel?url=${encodeURIComponent(url)}`;
  }, []);

  // Pre-resolve video URLs via HEAD check to avoid cache-miss glitch
  const getResolvedUrl = useCallback((video: ViralVideo): string => {
    if (resolvedUrls.current.has(video.id)) return resolvedUrls.current.get(video.id)!;
    const cached = getCacheUrl(video);
    if (!cached) {
      const url = getStreamUrl(video);
      resolvedUrls.current.set(video.id, url);
      return url;
    }
    // Start HEAD check in background, return cache URL optimistically
    fetch(cached, { method: "HEAD" }).then(res => {
      if (!res.ok) {
        resolvedUrls.current.set(video.id, getStreamUrl(video));
      } else {
        resolvedUrls.current.set(video.id, cached);
      }
    }).catch(() => {
      resolvedUrls.current.set(video.id, getStreamUrl(video));
    });
    return cached; // optimistic: try cache first
  }, [getCacheUrl, getStreamUrl]);

  // ── Scroll → determine active index using IntersectionObserver ──
  const observerRef = useRef<IntersectionObserver | null>(null);
  const cardRefCallback = useCallback((el: HTMLDivElement | null, idx: number) => {
    if (!el) return;
    el.dataset.idx = String(idx);
  }, []);

  useEffect(() => {
    const col = colRef.current;
    if (!col || !sortedVideos.length) return;

    observerRef.current?.disconnect();
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            const idx = Number((entry.target as HTMLElement).dataset.idx);
            if (!isNaN(idx)) setActiveIdx(idx);
          }
        }
      },
      { root: col, threshold: 0.5 }
    );
    observerRef.current = obs;

    col.querySelectorAll(".reel-card").forEach((card) => obs.observe(card));
    return () => obs.disconnect();
  }, [sortedVideos]);

  // ── PLAY EFFECT: retry fallback for autoPlay ──
  // Video element is conditionally rendered only for active card.
  // autoPlay handles initial play; this retries if browser blocks it.
  useEffect(() => {
    if (paused || !sortedVideos.length) return;
    let cancelled = false;

    const tryPlay = () => {
      if (cancelled) return;
      const vid = activeVideoRef.current;
      if (!vid || pausedRef.current) return;
      vid.muted = mutedRef.current;
      if (vid.paused) {
        vid.play().then(() => {
          vid.dataset.ready = "true";
        }).catch(() => {
          if (!cancelled) setTimeout(tryPlay, 400);
        });
      }
    };

    const t = setTimeout(tryPlay, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [activeIdx, paused, videos]);

  useEffect(() => {
    setPaused(false);
    setUseEmbed(false);
    // Reset IG error state for the newly active video
    const v = sortedVideos[activeIdx];
    if (v) {
      igErrorStage.current.delete(v.id);
      setIgFailed((prev) => {
        if (!prev.has(v.id)) return prev;
        const next = new Set(prev);
        next.delete(v.id);
        return next;
      });
    }
  }, [activeIdx]);

  const togglePlayPause = useCallback(() => {
    const vid = activeVideoRef.current;
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

  // ── Load avatars ──
  const loadAvatars = useCallback(async (usernames: string[]) => {
    try {
      const uniq = [...new Set(usernames)].filter(Boolean);
      if (!uniq.length) return;
      const { data } = await supabase
        .from("viral_channels")
        .select("username, avatar_url")
        .in("username", uniq);
      if (data) {
        const map: Record<string, string> = {};
        (data as any[]).forEach((r) => {
          if (r.avatar_url) map[r.username] = r.avatar_url;
        });
        setAvatarMap(map);
      }
    } catch (_) {}
  }, []);

  // ── Load videos from DB ──
  const loadVideos = useCallback(
    async (plat: string) => {
      setLoading(true);

      let query = supabase
        .from("viral_videos")
        .select(
          "id, channel_id, channel_username, platform, video_url, thumbnail_url, caption, views_count, likes_count, comments_count, engagement_rate, outlier_score, posted_at, scraped_at"
        )
        .order("outlier_score", { ascending: false })
        .limit(100);

      if (plat !== "all") query = (query as any).eq("platform", plat);

      const { data, error } = await query;
      if (error) { toast.error("Failed to load videos"); setLoading(false); return; }

      setVideos((data as ViralVideo[]) || []);
      setActiveIdx(0);
      setLoading(false);

      if (data?.length) loadAvatars((data as ViralVideo[]).map((v) => v.channel_username));
    },
    [loadAvatars]
  );

  useEffect(() => { loadVideos("all"); }, [loadVideos]);

  // ── Feed algorithm: fetch interactions + niche keywords + channel affinity ──
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
        setInteractions(map);
      }
    })();
    // Niche keywords from selected client
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
    // Channel affinity
    (async () => {
      const { data } = await supabase.from("viral_channels").select("id, created_by");
      if (data) setUserChannelIds(new Set(data.filter((c: any) => c.created_by === user.id).map((c: any) => c.id)));
    })();
  }, [user]);

  // Flush seen to DB every 30s + on unmount
  const flushSeen = useCallback(async () => {
    if (!user || seenThisSession.current.size === 0) return;
    const ids = Array.from(seenThisSession.current);
    seenThisSession.current.clear();
    try {
      await supabase.rpc("upsert_video_seen", { p_user_id: user.id, p_video_ids: ids });
      setInteractions(prev => {
        const next = new Map(prev);
        ids.forEach(id => {
          const ex = next.get(id);
          next.set(id, { seen_count: (ex?.seen_count ?? 0) + 1, clicked: ex?.clicked ?? false });
        });
        return next;
      });
    } catch (e) { console.error("[ReelFeed] flush seen failed:", e); }
  }, [user]);

  useEffect(() => {
    const timer = setInterval(flushSeen, 30_000);
    const handleUnload = () => flushSeen();
    window.addEventListener("beforeunload", handleUnload);
    return () => { clearInterval(timer); window.removeEventListener("beforeunload", handleUnload); flushSeen(); };
  }, [flushSeen]);

  // Pre-resolve URLs for next 3 videos to eliminate glitch on scroll
  useEffect(() => {
    for (let i = activeIdx; i < Math.min(activeIdx + 4, sortedVideos.length); i++) {
      const v = sortedVideos[i];
      if (v && !resolvedUrls.current.has(v.id)) getResolvedUrl(v);
    }
  }, [activeIdx, sortedVideos, getResolvedUrl]);

  // Mark active reel as "seen" after 3s viewing
  useEffect(() => {
    const v = sortedVideos[activeIdx];
    if (!v) return;
    const timer = setTimeout(() => seenThisSession.current.add(v.id), 3000);
    return () => clearTimeout(timer);
  }, [activeIdx, sortedVideos]);

  useEffect(() => {
    if (sortedVideos.length && colRef.current) colRef.current.scrollTo(0, 0);
  }, [videos]);

  // ── Handlers ──
  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    const vid = activeVideoRef.current;
    if (vid) vid.muted = next;
  }, []);

  const navScroll = (dir: number) => {
    const col = colRef.current;
    if (!col) return;
    const cards = col.querySelectorAll(".reel-card");
    const target = cards[activeIdx + dir] as HTMLElement;
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleInspireScript = () => {
    if (!currentVideo || !remixClientId) {
      toast.error("Select a client first");
      return;
    }
    navigate(`/clients/${remixClientId}/scripts`, {
      state: {
        remixVideo: {
          id: currentVideo.id,
          url: currentVideo.video_url,
          thumbnail_url: currentVideo.thumbnail_url,
          caption: currentVideo.caption,
          channel_username: currentVideo.channel_username,
          platform: currentVideo.platform,
        },
      },
    });
  };

  return (
    <>
      <style>{`
        .reel-col {
          display: flex;
          flex-direction: column;
          scroll-snap-type: y mandatory;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
          overflow-y: scroll;
        }
        .reel-col::-webkit-scrollbar { display: none; }
        .reel-card {
          scroll-snap-align: start;
          scroll-snap-stop: always;
          min-height: var(--card-h, 100%);
          height: var(--card-h, 100%);
          flex: 0 0 var(--card-h, 100%);
        }
        .reel-card video {
          opacity: 0;
          transition: opacity 0.4s;
          object-fit: cover;
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          z-index: 1;
        }
        .reel-card video[data-ready="true"], .reel-card iframe[data-ready="true"] { opacity: 1; }
        .reel-card iframe {
          opacity: 1;
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          z-index: 1;
        }
        @keyframes reelSpin { to { transform: rotate(360deg) } }
        .reel-spin { animation: reelSpin 0.8s linear infinite; }
      `}</style>

      <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-background">

        {/* ── TABS (desktop only) ── */}
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
        {loading ? (
          <div className="flex-1 flex items-center justify-center gap-3">
            <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full reel-spin" />
            <span className="text-sm text-muted-foreground">Loading viral feed…</span>
          </div>
        ) : !sortedVideos.length ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">No videos found for this filter</p>
          </div>
        ) : (
          <div className="flex-1 flex min-h-0 overflow-hidden">

            {/* ── VIDEO COLUMN ── */}
            <div className="flex-1 flex justify-center overflow-hidden relative">

              {/* Nav arrows */}
              <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-10 hidden lg:flex">
                <button
                  onClick={() => navScroll(-1)}
                  className="w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center hover:bg-muted transition-all disabled:opacity-30"
                  disabled={activeIdx === 0}
                >
                  <ChevronUp className="w-4 h-4 text-muted-foreground" />
                </button>
                <button
                  onClick={() => navScroll(1)}
                  className="w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center hover:bg-muted transition-all disabled:opacity-30"
                  disabled={activeIdx === sortedVideos.length - 1}
                >
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>

              {/* Floating controls overlay — same bounds as reel-col */}
              <div className="w-full lg:w-[380px] absolute inset-0 mx-auto pointer-events-none z-20">
                {/* Top gradient — mobile only, replaces the missing header */}
                <div
                  className="absolute top-0 left-0 right-0 h-20 pointer-events-none lg:hidden"
                  style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.65) 0%, transparent 100%)" }}
                />

                {/* Floating Connecta logo — mobile only, centered at top */}
                <div className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none lg:hidden">
                  <img
                    src={connectaLogoLight}
                    alt="Connecta"
                    className="h-5 object-contain opacity-75"
                  />
                </div>

                {/* Mute button — icon-only on mobile, with text on desktop */}
                <button
                  onClick={toggleMute}
                  className="absolute top-3 left-4 pointer-events-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-black/60 backdrop-blur-sm border border-white/15 text-xs font-medium text-white/90 hover:bg-black/80 transition-all"
                >
                  {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                  <span className="hidden lg:inline">{muted ? "Muted" : "Sound on"}</span>
                </button>

                {/* Platform filter — icon pills, mobile only, top right */}
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

              {/* Scroll container — absolute to get parent height reliably */}
              <div
                ref={colRef}
                className="reel-col w-full lg:w-[380px] bg-black absolute inset-0 mx-auto"
              >
                {sortedVideos.map((v, idx) => {
                  const avatarUrl = avatarMap[v.channel_username];
                  const isActive = idx === activeIdx;
                  return (
                    <div
                      key={v.id}
                      ref={(el) => cardRefCallback(el, idx)}
                      className="reel-card relative w-full overflow-hidden cursor-pointer"
                      onClick={() => { if (isActive) togglePlayPause(); }}
                    >
                      {/* Gradient bg */}
                      <div className="absolute inset-0 z-0" style={{ background: gradientFor(v.channel_username) }} />

                      {/* Thumbnail — proxied to avoid expired CDN 403s */}
                      {v.thumbnail_url && (
                        <img
                          src={proxyImg(v.thumbnail_url) ?? v.thumbnail_url}
                          alt=""
                          className="absolute inset-0 w-full h-full object-cover z-[0]"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                        />
                      )}

                      {/* Video — cache-first, stream-reel fallback, YouTube embed last resort */}
                      {isActive && (useEmbed && v.platform === "youtube" ? (
                        <iframe
                          src={`https://www.youtube.com/embed/${(v.video_url.match(/\/shorts\/([^/?]+)/) || [])[1] || ""}?autoplay=1&mute=${muted ? 1 : 0}&loop=1&playlist=${(v.video_url.match(/\/shorts\/([^/?]+)/) || [])[1] || ""}&playsinline=1&controls=0&modestbranding=1&rel=0`}
                          className="absolute inset-0 w-full h-full z-[1]"
                          style={{ border: "none" }}
                          allow="autoplay; encrypted-media"
                          allowFullScreen
                          onLoad={() => {
                            const card = colRef.current?.querySelectorAll(".reel-card")[activeIdx];
                            const vid = card?.querySelector("iframe");
                            if (vid) (vid as HTMLElement).dataset.ready = "true";
                          }}
                          data-ready="true"
                        />
                      ) : (
                        <video
                          ref={activeVideoRef}
                          src={getResolvedUrl(v)}
                          autoPlay
                          playsInline
                          muted
                          loop
                          preload="auto"
                          onPlaying={(e) => { e.currentTarget.dataset.ready = "true"; }}
                          onCanPlay={(e) => {
                            if (e.currentTarget.paused && !pausedRef.current) {
                              e.currentTarget.muted = mutedRef.current;
                              e.currentTarget.play().catch(() => {});
                            }
                          }}
                          onError={() => {
                            const vid = activeVideoRef.current;
                            if (!vid) return;

                            if (v.platform === "youtube") {
                              setUseEmbed(true);
                              return;
                            }

                            if (v.platform === "instagram") {
                              const stage = igErrorStage.current.get(v.id);
                              if (!stage) {
                                // Stage 1: cache failed → try stream-reel (yt-dlp with IG cookies)
                                igErrorStage.current.set(v.id, "stream");
                                const fallback = getStreamUrl(v);
                                resolvedUrls.current.set(v.id, fallback);
                                vid.src = fallback;
                                vid.load();
                                vid.play().catch(() => {});
                              } else if (stage === "stream") {
                                // Stage 2: stream-reel also failed → show Watch on Instagram
                                igErrorStage.current.set(v.id, "failed");
                                setIgFailed((prev) => new Set(prev).add(v.id));
                              }
                              return;
                            }

                            // Non-instagram: existing fallback
                            const fallback = getStreamUrl(v);
                            if (!vid.src.includes("/stream-reel") && !vid.src.includes("/proxy-video")) {
                              resolvedUrls.current.set(v.id, fallback);
                              vid.src = fallback;
                              vid.load();
                              vid.play().catch(() => {});
                            }
                          }}
                        />
                      ))}

                      {/* Paused indicator */}
                      {isActive && paused && (
                        <div className="absolute inset-0 z-[3] flex items-center justify-center pointer-events-none">
                          <div className="w-16 h-16 rounded-full bg-black/50 backdrop-blur-md border border-white/20 flex items-center justify-center animate-in fade-in zoom-in duration-200">
                            <Play className="w-7 h-7 text-white fill-white ml-1" />
                          </div>
                        </div>
                      )}

                      {/* Watch on Instagram fallback — all video sources failed */}
                      {isActive && igFailed.has(v.id) && v.platform === "instagram" && (
                        <div className="absolute bottom-[100px] left-4 z-[6] pointer-events-auto">
                          <a
                            href={v.video_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white"
                            style={{ background: "linear-gradient(135deg, #e1306c, #fd1d1d, #fcb045)" }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Instagram className="w-3.5 h-3.5" />
                            Watch on Instagram
                          </a>
                        </div>
                      )}

                      {/* Mobile right-side actions (TikTok-style) */}
                      {isActive && (
                        <div className="absolute right-3 bottom-[140px] z-[6] flex flex-col items-center gap-5 lg:hidden">
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

                      {/* Bottom overlay — Instagram-style username + caption above bottom nav */}
                      <div
                        className="absolute bottom-0 left-0 right-0 z-[5] p-4 pb-24 lg:pb-5 pr-16 lg:pr-4"
                        style={{
                          background: "linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.6) 40%, rgba(0,0,0,0.2) 70%, transparent 100%)",
                        }}
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

            {/* ── INFO PANEL (hidden on mobile — full TikTok/Reels experience) ── */}
            <div className="hidden lg:flex w-[300px] flex-shrink-0 flex-col border-l border-border bg-card overflow-hidden">
              {currentVideo ? (
                <>
                  {/* Creator header */}
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
                      <p className="text-xs text-muted-foreground capitalize mt-0.5">{currentVideo.platform}</p>
                    </div>
                    <a
                      href={currentVideo.video_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open on Instagram"
                      className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center hover:opacity-80 transition-opacity"
                      style={{ background: "linear-gradient(135deg, #e1306c, #fd1d1d, #fcb045)" }}
                    >
                      <Instagram className="w-4 h-4 text-white" />
                    </a>
                  </div>

                  {/* Outlier badge */}
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

                  {/* Stats grid */}
                  <div className="grid grid-cols-2 gap-2 p-4 border-b border-border flex-shrink-0">
                    {[
                      { icon: <Eye className="w-4 h-4 text-muted-foreground" />, val: fmtV(currentVideo.views_count), lbl: "Views", accent: false },
                      { icon: <Heart className="w-4 h-4 text-red-400" />, val: fmtV(currentVideo.likes_count), lbl: "Likes", accent: false },
                      { icon: <MessageCircle className="w-4 h-4 text-muted-foreground" />, val: fmtV(currentVideo.comments_count), lbl: "Comments", accent: false },
                      { icon: <Zap className="w-4 h-4 text-primary" />, val: fmtEng(currentVideo.engagement_rate), lbl: "Engagement", accent: true },
                    ].map((s) => (
                      <div
                        key={s.lbl}
                        className={cn(
                          "rounded-xl p-3 border",
                          s.accent ? "bg-primary/5 border-primary/15" : "bg-muted/40 border-border"
                        )}
                      >
                        <div className="mb-1">{s.icon}</div>
                        <div className="text-[17px] font-bold text-foreground leading-tight">{s.val}</div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mt-0.5">{s.lbl}</div>
                      </div>
                    ))}
                  </div>

                  {/* Caption */}
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

                  {/* Actions — Inspire Script */}
                  <div className="p-4 pt-3 border-t border-border flex flex-col gap-2 flex-shrink-0">
                    {clientOptions.length > 1 && (
                      <select
                        value={remixClientId}
                        onChange={(e) => setRemixClientId(e.target.value)}
                        className="w-full h-9 rounded-lg border border-border bg-background text-sm px-3 text-foreground"
                      >
                        <option value="">Select client…</option>
                        {clientOptions.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    )}
                    <button
                      onClick={handleInspireScript}
                      disabled={!remixClientId || clientsLoading}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-background font-semibold text-sm hover:opacity-90 transition-all disabled:opacity-50"
                    >
                      <Star className="w-4 h-4 fill-current" />
                      Inspire Script
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
          <div
            className="fixed inset-0 z-[60] bg-black/60 lg:hidden"
            onClick={() => setMobileSheetOpen(false)}
          />
          <div
            className="fixed bottom-0 left-0 right-0 z-[70] lg:hidden rounded-t-2xl bg-card border-t border-border p-5 pb-10 animate-in slide-in-from-bottom duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-muted-foreground/30 rounded-full mx-auto mb-5" />
            <p className="font-bold text-base text-foreground mb-0.5">Inspire a Script</p>
            {currentVideo && (
              <p className="text-xs text-muted-foreground mb-4 truncate">
                @{currentVideo.channel_username} · {currentVideo.platform}
              </p>
            )}
            {clientOptions.length > 1 && (
              <select
                value={remixClientId}
                onChange={(e) => setRemixClientId(e.target.value)}
                className="w-full h-11 rounded-xl border border-border bg-background text-sm px-3 text-foreground mb-3"
              >
                <option value="">Select client…</option>
                {clientOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
            <button
              onClick={() => { setMobileSheetOpen(false); handleInspireScript(); }}
              disabled={!remixClientId || clientsLoading}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-white font-semibold text-sm disabled:opacity-50 transition-all"
              style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}
            >
              <Star className="w-4 h-4 fill-current" />
              Open Canvas
            </button>
          </div>
        </>
      )}
    </>
  );
}
