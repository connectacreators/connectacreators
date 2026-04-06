import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Star, Play, ChevronUp, ChevronDown, Eye, Heart, MessageCircle, Zap,
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
  posted_at: string | null;
  scraped_at: string | null;
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
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

function proxyImg(url: string | null, videoUrl?: string): string | null {
  if (!url) return null;
  if (url.includes("connectacreators.com/thumb-cache")) return url;
  if (url.includes("connectacreators.com")) return url;
  if (url.includes("tiktokcdn") || url.includes("googlevideo") || url.includes("ytimg")) {
    if (videoUrl) return `https://connectacreators.com/api/resolve-thumb?url=${encodeURIComponent(videoUrl)}`;
    return `https://connectacreators.com/api/proxy-image?url=${encodeURIComponent(url)}`;
  }
  return `https://connectacreators.com/api/proxy-image?url=${encodeURIComponent(url)}`;
}

const TABS = [
  { label: "Top Outliers", value: "all", Icon: Flame },
  { label: "Instagram", value: "instagram", Icon: Instagram },
  { label: "TikTok", value: "tiktok", Icon: Music },
  { label: "YouTube", value: "youtube", Icon: Youtube },
];

export default function ViralReelFeed() {
  // v12 — data-ready on canPlay, stall-timeout marks ready to prevent restart loop
  useEffect(() => { console.log("[ViralReelFeed] v12 — data-ready on canPlay + stall-timeout guard"); }, []);
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
  const [videoReady, setVideoReady] = useState(false);
  const [useEmbed, setUseEmbed] = useState(false);
  const [remixClientId, setRemixClientId] = useState("");
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  // ── Feed algorithm state ──
  // initialInteractions is the snapshot loaded from DB at mount — used for sorting/filtering.
  // It NEVER changes during the session so the feed order stays stable (like TikTok/Instagram).
  // seenThisSession still flushes to DB every 30s for future sessions, but doesn't re-sort the current feed.
  const [initialInteractions, setInitialInteractions] = useState<Map<string, { seen_count: number; clicked: boolean }>>(new Map());
  const [interactionsReady, setInteractionsReady] = useState(false);
  const [nicheKeywords, setNicheKeywords] = useState<string[]>([]);
  const [userChannelIds, setUserChannelIds] = useState<Set<string>>(new Set());
  const seenThisSession = useRef<Set<string>>(new Set());
  // Set true before any setActiveIdx that originates from algorithm re-sort (not user swipe)
  // so the reset effect can skip playback disruption for the same physical video
  const algorithmNavigating = useRef(false);

  const clientOptions = isAdmin
    ? clients.map((c) => ({ id: c.id, name: c.name || c.id }))
    : (() => {
        const own = clients.find((c: Client) => c.user_id === user?.id);
        return own ? [{ id: own.id, name: own.name || own.id }] : [];
      })();

  useEffect(() => {
    if (clientOptions.length === 1) setRemixClientId(clientOptions[0].id);
  }, [clientOptions.length]);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const colRef = useRef<HTMLDivElement>(null);
  const activeVideoRef = useRef<HTMLVideoElement | null>(null);
  const mutedRef = useRef(true);
  const hasInteracted = useRef(false);
  const activeIdxRef = useRef(0);
  const pausedRef = useRef(false);
  const [failedVideoIds, setFailedVideoIds] = useState<Set<string>>(new Set());
  const failedVideoIdsRef = useRef<Set<string>>(new Set());
  const scrollingRef = useRef(false);
  const touchStartY = useRef(0);
  const wheelAccum = useRef(0);
  const [urlMap, setUrlMap] = useState<Map<string, string>>(new Map());
  // Track current video by ID so re-sorts don't silently swap the displayed video
  const currentVideoIdRef = useRef<string | null>(null);

  const buildUrlMap = useCallback(async (vids: ViralVideo[]): Promise<Map<string, string>> => {
    const map = new Map<string, string>();
    const codeToVideo = new Map<string, ViralVideo>();
    vids.forEach(v => {
      const code = (v.video_url.match(/\/reel\/([^/?]+)/) ||
                    v.video_url.match(/\/p\/([^/?]+)/) ||
                    v.video_url.match(/\/video\/([^/?]+)/) ||
                    v.video_url.match(/\/shorts\/([^/?]+)/))?.[1];
      if (code) codeToVideo.set(code, v);
    });
    const codes = Array.from(codeToVideo.keys());
    if (codes.length > 0) {
      try {
        const res = await fetch(`${VPS_API}/cache-status?ids=${codes.join(',')}`);
        const status: Record<string, boolean> = await res.json();
        codeToVideo.forEach((v, code) => {
          const plat = v.platform === 'instagram' ? 'ig' : v.platform === 'tiktok' ? 'tt' : 'yt';
          map.set(v.id, status[code]
            ? `https://connectacreators.com/video-cache/${plat}_${code}.mp4`
            : `${VPS_API}/stream-reel?url=${encodeURIComponent(v.video_url)}`
          );
        });
      } catch {
        // Fallback: all go through stream-reel
      }
    }
    vids.forEach(v => {
      if (!map.has(v.id)) {
        map.set(v.id, `${VPS_API}/stream-reel?url=${encodeURIComponent(v.video_url)}`);
      }
    });
    return map;
  }, []);

  // Keep refs in sync
  useEffect(() => { activeIdxRef.current = activeIdx; }, [activeIdx]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  // Unmute on first user interaction (autoplay policy requires muted start)
  useEffect(() => {
    const unmute = () => {
      if (hasInteracted.current) return;
      hasInteracted.current = true;
      mutedRef.current = false;
      setMuted(false);
      const vid = activeVideoRef.current;
      if (vid) vid.muted = false;
    };
    document.addEventListener("click", unmute, { once: true });
    document.addEventListener("touchstart", unmute, { once: true });
    return () => {
      document.removeEventListener("click", unmute);
      document.removeEventListener("touchstart", unmute);
    };
  }, []);

  // ── Sorted videos using feed algorithm ──
  // Uses initialInteractions (DB snapshot at mount), NOT live session data.
  // This means the feed order is locked once loaded — no mid-session re-sorting or disappearing.
  const sortedVideos = useMemo(() => {
    const now = Date.now();
    return [...videos]
      .filter(v => {
        const inter = initialInteractions.get(v.id);
        return !inter || inter.seen_count < 4;
      })
      .sort((a, b) => {
        const scoreFor = (v: ViralVideo) => {
          let s = v.outlier_score * 10;
          if (failedVideoIdsRef.current.has(v.id)) s -= 9999;
          const ageDays = (now - new Date((v as any).posted_at ?? (v as any).scraped_at ?? now).getTime()) / 86_400_000;
          s += Math.max(0, 30 - (ageDays / 90) * 30);
          if (nicheKeywords.length > 0) {
            const text = ((v.caption || "") + " " + v.channel_username).toLowerCase();
            if (nicheKeywords.some(kw => text.includes(kw))) s += 40;
          }
          if ((v as any).channel_id && userChannelIds.has((v as any).channel_id)) s += 20;
          const inter = initialInteractions.get(v.id);
          if (inter) { s -= inter.seen_count * 15; if (inter.clicked) s -= 10; }
          return s;
        };
        return scoreFor(b) - scoreFor(a);
      });
  }, [videos, initialInteractions, nicheKeywords, userChannelIds]);

  const currentVideo = sortedVideos[activeIdx] ?? null;

  // ── Keep activeIdx anchored to the same video after re-sorts ──
  // Safety net: if sortedVideos recomputes (e.g. platform tab switch), keep the
  // user on the same video by finding it in the new array and updating activeIdx.
  useEffect(() => {
    if (!sortedVideos.length) return;
    const pinnedId = currentVideoIdRef.current;
    if (!pinnedId) {
      // First render: record the initial video
      currentVideoIdRef.current = sortedVideos[0]?.id ?? null;
      return;
    }
    const newIdx = sortedVideos.findIndex(v => v.id === pinnedId);
    if (newIdx === -1) {
      // Current video was filtered out — clamp to bounds only if position actually changes
      const clampedIdx = Math.min(activeIdxRef.current, sortedVideos.length - 1);
      if (clampedIdx !== activeIdxRef.current) {
        algorithmNavigating.current = true;
        activeIdxRef.current = clampedIdx;
        setActiveIdx(clampedIdx);
      }
    } else if (newIdx !== activeIdxRef.current) {
      // Video moved in the sort — silently repoint activeIdx without triggering playback reset
      algorithmNavigating.current = true;
      activeIdxRef.current = newIdx;
      setActiveIdx(newIdx);
      // Also update translateY directly to avoid flash
      const wrapper = wrapperRef.current;
      const col = colRef.current;
      if (wrapper && col) {
        const cardH = wrapper.clientHeight;
        col.style.transform = `translateY(-${newIdx * cardH}px)`;
      }
    }
  }, [sortedVideos]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update currentVideoIdRef whenever activeIdx changes (user scrolled)
  useEffect(() => {
    const vid = sortedVideos[activeIdx];
    if (vid) currentVideoIdRef.current = vid.id;
  }, [activeIdx, sortedVideos]);

  // ── Measure container height via CSS custom property ──
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const measure = () => {
      const h = wrapper.clientHeight;
      if (h > 0) {
        wrapper.style.setProperty("--card-h", `${h}px`);
        if (colRef.current) {
          colRef.current.style.transform = `translateY(-${activeIdx * h}px)`;
        }
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, [activeIdx]);

  const getStreamUrl = useCallback((video: ViralVideo): string => {
    const url = video.video_url;
    if (/cdninstagram\.com|fbcdn\.net/.test(url)) {
      return `${VPS_API}/proxy-video?url=${encodeURIComponent(url)}`;
    }
    return `${VPS_API}/stream-reel?url=${encodeURIComponent(url)}`;
  }, []);

  // ── Controlled positioning via transform ──
  const scrollToIdx = useCallback((idx: number) => {
    const col = colRef.current;
    const wrapper = wrapperRef.current;
    if (!col || !wrapper) return;
    const cardH = wrapper.clientHeight;
    col.style.transform = `translateY(-${idx * cardH}px)`;
  }, []);

  useEffect(() => {
    scrollToIdx(activeIdx);
  }, [activeIdx, scrollToIdx]);

  // Wheel handler: accumulate small deltas, navigate on threshold
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (scrollingRef.current) { wheelAccum.current = 0; return; }

      wheelAccum.current += e.deltaY;
      if (Math.abs(wheelAccum.current) < 150) return;

      const dir = wheelAccum.current > 0 ? 1 : -1;
      wheelAccum.current = 0;
      scrollingRef.current = true;

      setActiveIdx(prev => Math.max(0, Math.min(prev + dir, sortedVideos.length - 1)));

      setTimeout(() => { scrollingRef.current = false; wheelAccum.current = 0; }, 1200);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [sortedVideos.length]);

  // Touch handler: swipe up/down to navigate
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      touchStartY.current = e.touches[0].clientY;
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (scrollingRef.current) return;
      const delta = touchStartY.current - e.changedTouches[0].clientY;
      if (Math.abs(delta) < 80) return;

      scrollingRef.current = true;
      const dir = delta > 0 ? 1 : -1;

      setActiveIdx(prev => Math.max(0, Math.min(prev + dir, sortedVideos.length - 1)));

      setTimeout(() => { scrollingRef.current = false; }, 400);
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [sortedVideos.length]);

  // ── Manage play state across 3 video elements ──
  // Only runs on activeIdx or paused change — never on sortedVideos ref change
  useEffect(() => {
    if (!colRef.current) return;
    const cards = colRef.current.querySelectorAll(".reel-card");
    cards.forEach((card, idx) => {
      const video = card.querySelector("video");
      if (!video) return;
      if (idx === activeIdx) {
        video.muted = mutedRef.current;
        if (!pausedRef.current && (video.paused || video.readyState >= 2)) {
          video.muted = mutedRef.current;
          video.play().catch(() => {});
        }
      } else {
        if (!video.paused) video.pause();
        video.muted = true;
      }
    });
  }, [activeIdx, paused]);

  useEffect(() => {
    // Algorithm re-sorts move the same playing video to a new index position.
    // Don't reset playback state — the video is still physically playing.
    if (algorithmNavigating.current) {
      algorithmNavigating.current = false;
      return;
    }
    setPaused(false);
    setUseEmbed(false);
    setVideoReady(false);
  }, [activeIdx]);

  // ── Stall timeout: if active video hasn't started playing after 10s, fall back to stream-reel ──
  useEffect(() => {
    if (useEmbed) return; // YouTube embed handles itself
    const cv = sortedVideos[activeIdx];
    if (!cv) return;
    const timer = setTimeout(() => {
      const vid = activeVideoRef.current;
      if (!vid || vid.dataset.ready === "true") return;
      const streamUrl = getStreamUrl(cv);
      if (!vid.src.includes('/stream-reel') && !vid.src.includes('/proxy-video')) {
        vid.src = streamUrl;
        vid.load();
        vid.play().catch(() => {});
        // Mark ready so this timeout won't re-fire for the same element.
        // The video will set itself truly ready once onCanPlay / onPlaying fires on the new src.
        vid.dataset.ready = "true";
      } else {
        setFailedVideoIds(prev => {
          const next = new Set([...prev, cv.id]);
          failedVideoIdsRef.current = next;
          return next;
        });
      }
    }, 10000);
    return () => clearTimeout(timer);
  }, [activeIdx, useEmbed]); // eslint-disable-line react-hooks/exhaustive-deps

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

      const PAGE_SIZE = 1000;
      const MAX_VIDEOS = 3000;
      let allVideos: ViralVideo[] = [];
      let page = 0;

      const threshold = parseFloat(localStorage.getItem('viral_outlier_threshold') ?? '5');
      while (allVideos.length < MAX_VIDEOS) {
        let query = supabase
          .from("viral_videos")
          .select(
            "id, channel_id, channel_username, platform, video_url, thumbnail_url, caption, views_count, likes_count, comments_count, engagement_rate, outlier_score, posted_at, scraped_at"
          )
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

      const map = await buildUrlMap(allVideos);
      setUrlMap(map);
      setVideos(allVideos);
      setActiveIdx(0);
      setLoading(false);

      if (allVideos.length) loadAvatars(allVideos.map((v) => v.channel_username));
    },
    [loadAvatars, buildUrlMap]
  );

  useEffect(() => { loadVideos("all"); }, [loadVideos]);

  // ── Feed algorithm: fetch interactions + niche keywords + channel affinity ──
  useEffect(() => {
    if (!user) { setInteractionsReady(true); return; } // no user = no personalization, unblock feed
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
      setInteractionsReady(true); // unblock feed — both videos AND interactions are now loaded
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

  // Flush seen to DB every 30s + on unmount.
  // Only writes to DB for future sessions — does NOT update local state,
  // so the current feed order stays stable (no mid-session re-sorting).
  const flushSeen = useCallback(async () => {
    if (!user || seenThisSession.current.size === 0) return;
    const ids = Array.from(seenThisSession.current);
    seenThisSession.current.clear();
    try {
      await supabase.rpc("upsert_video_seen", { p_user_id: user.id, p_video_ids: ids });
    } catch (e) { console.error("[ReelFeed] flush seen failed:", e); }
  }, [user]);

  useEffect(() => {
    const timer = setInterval(flushSeen, 30_000);
    const handleUnload = () => flushSeen();
    window.addEventListener("beforeunload", handleUnload);
    return () => { clearInterval(timer); window.removeEventListener("beforeunload", handleUnload); flushSeen(); };
  }, [flushSeen]);

  // Mark active reel as "seen" after 3s viewing.
  // Depends only on activeIdx (not sortedVideos) so re-sorts don't reset the timer.
  // currentVideoIdRef is set by the "update currentVideoIdRef" effect (declared above this one)
  // which runs first whenever activeIdx changes, so the captured id is always correct.
  useEffect(() => {
    const id = currentVideoIdRef.current;
    if (!id) return;
    const timer = setTimeout(() => seenThisSession.current.add(id), 3000);
    return () => clearTimeout(timer);
  }, [activeIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fire-and-forget prefetch for next 5 uncached videos
  useEffect(() => {
    if (!sortedVideos.length || !urlMap.size) return;
    const uncached = sortedVideos
      .slice(activeIdx + 1, activeIdx + 6)
      .filter(v => (urlMap.get(v.id) ?? '').includes('/stream-reel'))
      .map(v => ({ url: v.video_url, platform: v.platform }));
    if (!uncached.length) return;
    fetch(`${VPS_API}/prefetch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videos: uncached }),
    }).catch(() => {});
  }, [activeIdx, sortedVideos, urlMap]);

  useEffect(() => {
    if (sortedVideos.length && colRef.current) colRef.current.style.transform = "translateY(0px)";
  }, [videos]);

  // ── Handlers ──

  const navScroll = (dir: number) => {
    const next = activeIdx + dir;
    if (next >= 0 && next < sortedVideos.length) {
      setActiveIdx(next);
    }
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
        .reel-col-wrapper {
          overflow: hidden;
          touch-action: none;
        }
        .reel-col {
          display: flex;
          flex-direction: column;
          transition: transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        }
        .reel-col::-webkit-scrollbar { display: none; }
        .reel-card {
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
        .reel-card video[data-ready="true"],
        .reel-card iframe[data-ready="true"] { opacity: 1; }
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
        {(loading || !interactionsReady) ? (
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

              {/* Floating controls overlay */}
              <div className="w-full lg:w-[380px] absolute inset-0 mx-auto pointer-events-none z-20">
                <div
                  className="absolute top-0 left-0 right-0 h-20 pointer-events-none lg:hidden"
                  style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.65) 0%, transparent 100%)" }}
                />

                <div className="absolute top-3 left-4 pointer-events-none">
                  <img
                    src={connectaLogoLight}
                    alt="Connecta"
                    className="h-5 object-contain opacity-80 drop-shadow-lg"
                  />
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
              <div
                ref={wrapperRef}
                className="reel-col-wrapper w-full lg:w-[380px] bg-black absolute inset-0 mx-auto"
              >
              <div
                ref={colRef}
                className="reel-col w-full"
              >
                {sortedVideos.map((v, idx) => {
                  const avatarUrl = avatarMap[v.channel_username];
                  const isActive = idx === activeIdx;
                  const isAdjacent = Math.abs(idx - activeIdx) <= 1;
                  const nearActive = Math.abs(idx - activeIdx) <= 4;
                  return (
                    <div
                      key={v.id}
                      className="reel-card relative w-full overflow-hidden cursor-pointer"
                      onClick={() => { if (isActive) togglePlayPause(); }}
                    >
                      {/* Gradient bg */}
                      <div className="absolute inset-0 z-0" style={{ background: gradientFor(v.channel_username) }} />

                      {/* Thumbnail */}
                      {v.thumbnail_url && (
                        <img
                          src={nearActive ? (proxyImg(v.thumbnail_url, v.video_url) ?? v.thumbnail_url) : undefined}
                          alt=""
                          className="absolute inset-0 w-full h-full object-cover z-[0]"
                          style={nearActive ? undefined : { visibility: "hidden" }}
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                        />
                      )}

                      {/* Video — 3-element: prev + active + next */}
                      {isAdjacent && !failedVideoIds.has(v.id) && (
                        (useEmbed && v.platform === "youtube" && isActive) ? (
                        <iframe
                          src={`https://www.youtube.com/embed/${(v.video_url.match(/\/shorts\/([^/?]+)/) || [])[1] || ""}?autoplay=1&mute=${muted ? 1 : 0}&loop=1&playlist=${(v.video_url.match(/\/shorts\/([^/?]+)/) || [])[1] || ""}&playsinline=1&controls=0&modestbranding=1&rel=0`}
                          className="absolute inset-0 w-full h-full z-[1]"
                          style={{ border: "none" }}
                          allow="autoplay; encrypted-media"
                          allowFullScreen
                          data-ready="true"
                        />
                      ) : (
                        <video
                          ref={isActive ? activeVideoRef : undefined}
                          src={urlMap.get(v.id) ?? `${VPS_API}/stream-reel?url=${encodeURIComponent(v.video_url)}`}
                          autoPlay={isActive}
                          playsInline
                          muted={isActive ? muted : true}
                          loop
                          preload="auto"
                          onPlaying={(e) => { e.currentTarget.dataset.ready = "true"; if (isActive) setVideoReady(true); }}
                          onTimeUpdate={(e) => {
                            // Fallback: if onPlaying didn't fire but video is advancing, show it
                            if (e.currentTarget.dataset.ready !== "true" && e.currentTarget.currentTime > 0) {
                              e.currentTarget.dataset.ready = "true";
                              if (isActive) setVideoReady(true);
                            }
                          }}
                          onCanPlay={(e) => {
                            // Mark ready immediately so the stall timeout won't fire and restart the video.
                            e.currentTarget.dataset.ready = "true";
                            if (isActive) setVideoReady(true);
                            if (isActive && e.currentTarget.paused && !pausedRef.current) {
                              e.currentTarget.muted = mutedRef.current;
                              e.currentTarget.play().catch(() => {});
                            }
                          }}
                          onLoadedData={(e) => {
                            if (isActive && e.currentTarget.paused && !pausedRef.current) {
                              e.currentTarget.muted = mutedRef.current;
                              e.currentTarget.play().catch(() => {});
                            }
                          }}
                          onError={() => {
                            if (!isActive) return;
                            const vid = activeVideoRef.current;
                            if (!vid) return;

                            if (v.platform === "youtube") {
                              setUseEmbed(true);
                              return;
                            }

                            const streamUrl = getStreamUrl(v);
                            if (!vid.src.includes('/stream-reel') && !vid.src.includes('/proxy-video')) {
                              vid.src = streamUrl;
                              vid.load();
                              vid.play().catch(() => {});
                            } else {
                              setFailedVideoIds(prev => {
                                const next = new Set([...prev, v.id]);
                                failedVideoIdsRef.current = next;
                                return next;
                              });
                            }
                          }}
                        />
                      ))}

                      {/* Error state — retry button for failed videos */}
                      {failedVideoIds.has(v.id) && isActive && (
                        <div className="absolute inset-0 z-[3] flex flex-col items-center justify-center gap-4">
                          <div className="w-16 h-16 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center">
                            <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <p className="text-white/80 text-sm font-medium">Video unavailable</p>
                          <div className="flex gap-3">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setFailedVideoIds(prev => {
                                  const next = new Set(prev);
                                  next.delete(v.id);
                                  failedVideoIdsRef.current = next;
                                  return next;
                                });
                              }}
                              className="px-5 py-2 rounded-full bg-white/15 backdrop-blur-sm border border-white/20 text-white text-sm font-medium hover:bg-white/25 transition-all"
                            >
                              Retry
                            </button>
                            <a
                              href={v.video_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="px-5 py-2 rounded-full bg-white/15 backdrop-blur-sm border border-white/20 text-white text-sm font-medium hover:bg-white/25 transition-all"
                            >
                              Open Original
                            </a>
                          </div>
                        </div>
                      )}

                      {/* Small error badge for non-active failed cards */}
                      {failedVideoIds.has(v.id) && !isActive && nearActive && (
                        <div className="absolute top-3 right-3 z-[3]">
                          <div className="w-8 h-8 rounded-full bg-red-500/30 backdrop-blur-sm flex items-center justify-center">
                            <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01" />
                            </svg>
                          </div>
                        </div>
                      )}

                      {/* Loading spinner — while video hasn't started playing */}
                      {isActive && !videoReady && !paused && !failedVideoIds.has(v.id) && !useEmbed && (
                        <div className="absolute inset-0 z-[2] flex items-center justify-center pointer-events-none">
                          <div className="w-10 h-10 border-2 border-white/20 border-t-white/60 rounded-full reel-spin" />
                        </div>
                      )}

                      {/* Paused indicator */}
                      {isActive && paused && (
                        <div className="absolute inset-0 z-[3] flex items-center justify-center pointer-events-none">
                          <div className="w-16 h-16 rounded-full bg-black/50 backdrop-blur-md border border-white/20 flex items-center justify-center animate-in fade-in zoom-in duration-200">
                            <Play className="w-7 h-7 text-white fill-white ml-1" />
                          </div>
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

                      {/* Bottom overlay */}
                      <div
                        className="absolute bottom-0 left-0 right-0 z-[5] p-4 pb-20 lg:pb-5 pr-16 lg:pr-4"
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
            </div>

            {/* ── INFO PANEL (hidden on mobile) ── */}
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
                    ) : currentVideo.platform === "tiktok" ? (
                      <a
                        href={currentVideo.video_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open on TikTok"
                        className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center hover:opacity-80 transition-opacity bg-black"
                      >
                        <Music className="w-4 h-4 text-cyan-400" />
                      </a>
                    ) : (
                      <a
                        href={currentVideo.video_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open on YouTube"
                        className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center hover:opacity-80 transition-opacity bg-[#ff0000]"
                      >
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
