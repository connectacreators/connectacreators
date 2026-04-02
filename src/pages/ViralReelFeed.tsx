import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  VolumeX, Volume2, Star, Copy, ExternalLink,
  Play, ChevronUp, ChevronDown, Eye, Heart, MessageCircle, Zap,
  Flame, Instagram, Music, Youtube,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

const TABS = [
  { label: "Top Outliers", value: "all", Icon: Flame },
  { label: "Instagram", value: "instagram", Icon: Instagram },
  { label: "TikTok", value: "tiktok", Icon: Music },
  { label: "YouTube", value: "youtube", Icon: Youtube },
];

export default function ViralReelFeed() {
  const [videos, setVideos] = useState<ViralVideo[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [platform, setPlatform] = useState("all");
  const [loading, setLoading] = useState(true);
  const [muted, setMuted] = useState(true);
  const [avatarMap, setAvatarMap] = useState<Record<string, string>>({});
  const [paused, setPaused] = useState(false);

  const colRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const mutedRef = useRef(true);

  const currentVideo = videos[activeIdx] ?? null;

  // ── Scroll → determine active index using IntersectionObserver ──
  const observerRef = useRef<IntersectionObserver | null>(null);
  const cardRefCallback = useCallback((el: HTMLDivElement | null, idx: number) => {
    if (!el) return;
    el.dataset.idx = String(idx);
  }, []);

  useEffect(() => {
    const col = colRef.current;
    if (!col || !videos.length) return;

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
  }, [videos]);

  // ── Play/pause on active index change ──
  useEffect(() => {
    videoRefs.current.forEach((v, i) => {
      if (!v) return;
      if (i === activeIdx && !paused) {
        v.muted = mutedRef.current;
        if (v.src && v.readyState >= 2) v.play().catch(() => {});
      } else {
        v.pause();
      }
    });
  }, [activeIdx, paused]);

  useEffect(() => { setPaused(false); }, [activeIdx]);

  const togglePlayPause = useCallback(() => {
    const vid = videoRefs.current[activeIdx];
    if (!vid || !vid.src) return;
    if (vid.paused) {
      vid.muted = mutedRef.current;
      vid.play().catch(() => {});
      setPaused(false);
    } else {
      vid.pause();
      setPaused(true);
    }
  }, [activeIdx]);

  // ── Build streaming URL ──
  const videoSrc = useCallback((videoUrl: string) => {
    return `${VPS_API}/stream-reel?url=${encodeURIComponent(videoUrl)}`;
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
      videoRefs.current = [];

      let query = supabase
        .from("viral_videos")
        .select(
          "id, channel_username, platform, video_url, thumbnail_url, caption, views_count, likes_count, comments_count, engagement_rate, outlier_score"
        )
        .order("outlier_score", { ascending: false })
        .limit(30);

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

  useEffect(() => {
    if (videos.length && colRef.current) colRef.current.scrollTo(0, 0);
  }, [videos]);

  // ── Handlers ──
  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    videoRefs.current.forEach((v) => { if (v) v.muted = next; });
  }, []);

  const navScroll = (dir: number) => {
    const col = colRef.current;
    if (!col) return;
    const cards = col.querySelectorAll(".reel-card");
    const target = cards[activeIdx + dir] as HTMLElement;
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleCopy = () => {
    if (currentVideo?.caption) navigator.clipboard.writeText(currentVideo.caption).then(() => toast("Caption copied"));
  };
  const handleOpen = () => {
    if (currentVideo?.video_url) window.open(currentVideo.video_url, "_blank");
  };

  return (
    <>
      <style>{`
        .reel-col {
          scroll-snap-type: y mandatory;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }
        .reel-col::-webkit-scrollbar { display: none; }
        .reel-card {
          scroll-snap-align: start;
          scroll-snap-stop: always;
          min-height: 100%;
          max-height: 100%;
          flex: 0 0 100%;
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
        .reel-card video[data-ready="true"] { opacity: 1; }
        @keyframes reelSpin { to { transform: rotate(360deg) } }
        .reel-spin { animation: reelSpin 0.8s linear infinite; }
      `}</style>

      <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-background">

        {/* ── TABS ── */}
        <div className="flex items-center gap-1.5 px-5 py-2.5 border-b border-border flex-shrink-0">
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
        ) : !videos.length ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">No videos found for this filter</p>
          </div>
        ) : (
          <div className="flex-1 flex min-h-0 overflow-hidden">

            {/* ── VIDEO COLUMN ── */}
            <div className="flex-1 flex justify-center items-stretch overflow-hidden relative">

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
                  disabled={activeIdx === videos.length - 1}
                >
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>

              {/* Mute pill */}
              <button
                onClick={toggleMute}
                className="absolute top-3 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-sm border border-white/15 text-xs font-medium text-white/90 hover:bg-black/80 transition-all"
                style={{ left: "calc(50% - 180px)" }}
              >
                {muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                {muted ? "Muted" : "Sound on"}
              </button>

              {/* Scroll container — cards always rendered, no cardH guard */}
              <div
                ref={colRef}
                className="reel-col w-[380px] flex-shrink-0 overflow-y-scroll bg-black"
                style={{ height: "100%" }}
              >
                {videos.map((v, idx) => {
                  const avatarUrl = avatarMap[v.channel_username];
                  const isActive = idx === activeIdx;
                  const shouldLoad = isActive || idx === activeIdx + 1;
                  return (
                    <div
                      key={v.id}
                      ref={(el) => cardRefCallback(el, idx)}
                      className="reel-card relative w-full overflow-hidden cursor-pointer"
                      onClick={() => { if (isActive) togglePlayPause(); }}
                    >
                      {/* Gradient bg */}
                      <div className="absolute inset-0 z-0" style={{ background: gradientFor(v.channel_username) }} />

                      {/* Thumbnail */}
                      {v.thumbnail_url && (
                        <img
                          src={v.thumbnail_url}
                          alt=""
                          className="absolute inset-0 w-full h-full object-cover z-[0]"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                        />
                      )}

                      {/* Video element */}
                      <video
                        ref={(el) => { videoRefs.current[idx] = el; }}
                        src={shouldLoad ? videoSrc(v.video_url) : undefined}
                        playsInline
                        muted
                        loop
                        preload={isActive ? "auto" : "metadata"}
                        onCanPlay={(e) => {
                          const vid = e.currentTarget;
                          vid.dataset.ready = "true";
                          if (idx === activeIdx && !paused) vid.play().catch(() => {});
                        }}
                      />

                      {/* Paused indicator */}
                      {isActive && paused && (
                        <div className="absolute inset-0 z-[3] flex items-center justify-center pointer-events-none">
                          <div className="w-16 h-16 rounded-full bg-black/50 backdrop-blur-md border border-white/20 flex items-center justify-center animate-in fade-in zoom-in duration-200">
                            <Play className="w-7 h-7 text-white fill-white ml-1" />
                          </div>
                        </div>
                      )}

                      {/* Bottom overlay */}
                      <div
                        className="absolute bottom-0 left-0 right-0 z-[5] p-4 pb-5"
                        style={{
                          background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.42) 55%, transparent 100%)",
                        }}
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          {avatarUrl ? (
                            <img src={avatarUrl} alt="" className="w-8 h-8 rounded-full border border-white/30 object-cover flex-shrink-0" />
                          ) : (
                            <div
                              className="w-8 h-8 rounded-full border-2 border-white/40 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                              style={{ background: gradientFor(v.channel_username) }}
                            >
                              {inits(v.channel_username)}
                            </div>
                          )}
                          <span className="text-sm font-bold text-white drop-shadow">@{v.channel_username}</span>
                        </div>
                        {v.caption && (
                          <p className="text-xs text-white/80 leading-relaxed line-clamp-2">{v.caption}</p>
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

            {/* ── INFO PANEL ── */}
            <div className="w-[300px] flex-shrink-0 flex flex-col border-l border-border bg-card overflow-hidden">
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
                    <button
                      onClick={handleOpen}
                      className="w-8 h-8 rounded-lg bg-muted border border-border flex items-center justify-center hover:bg-border transition-all flex-shrink-0"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
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

                  {/* Actions */}
                  <div className="p-4 pt-3 border-t border-border flex flex-col gap-2 flex-shrink-0">
                    <button
                      onClick={() => toast("Script Wizard — coming soon!")}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-background font-semibold text-sm hover:opacity-90 transition-all"
                    >
                      <Star className="w-4 h-4 fill-current" />
                      Inspire Script
                    </button>
                    <div className="flex gap-2">
                      <button
                        onClick={handleCopy}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-muted border border-border text-sm font-medium text-foreground/80 hover:text-foreground hover:bg-muted/80 transition-all"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Copy
                      </button>
                      <button
                        onClick={handleOpen}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-muted border border-border text-sm font-medium text-foreground/80 hover:text-foreground hover:bg-muted/80 transition-all"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Original
                      </button>
                    </div>
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
    </>
  );
}
