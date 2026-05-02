import { memo, useState, useEffect, useRef, useCallback } from "react";
import { Handle, Position, NodeProps, NodeResizer } from "@xyflow/react";
import { Film, X, Loader2, Link, ChevronDown, ChevronUp, Sparkles, Archive, Play, Pause, Eye, Type, Music2, Zap, MicOff, Clock, Volume2, VolumeX, Maximize, Minimize } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useOutOfCredits } from "@/contexts/OutOfCreditsContext";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const VPS_API_URL = "https://connectacreators.com/api";
const VPS_API_KEY = "ytdlp_connecta_2026_secret";

// Instagram CDN URLs are CORS-blocked in browsers — proxy through VPS
const proxyInstagramUrl = (url: string): string => {
  if (!url || url.startsWith("data:")) return url;
  if (url.includes("cdninstagram.com") || url.includes("fbcdn.net")) {
    return `${VPS_API_URL}/proxy-image?url=${encodeURIComponent(url)}`;
  }
  return url;
};

// ─── Platform detection ───────────────────────────────────────────────────
type Platform = "youtube" | "instagram" | "tiktok" | "facebook" | "default";

function detectPlatform(url: string): Platform {
  if (/youtube\.com|youtu\.be/.test(url)) return "youtube";
  if (/instagram\.com/.test(url)) return "instagram";
  if (/tiktok\.com/.test(url)) return "tiktok";
  if (/facebook\.com|fb\.watch/.test(url)) return "facebook";
  return "default";
}

const PLATFORM_THEME: Record<Platform, {
  label: string;
  headerBg: string;
  headerBorder: string;
  cardBorder: string;
  chevronColor: string;
  transcriptBorder: string;
  btnPrimaryBg: string;
  btnPrimaryBorder: string;
  btnPrimaryText: string;
  extraBoxShadow?: string;
  labelStyle?: React.CSSProperties;
}> = {
  youtube: {
    label: "YouTube",
    headerBg: "rgba(239,68,68,0.12)",
    headerBorder: "rgba(239,68,68,0.22)",
    cardBorder: "rgba(239,68,68,0.5)",
    chevronColor: "rgba(239,68,68,0.6)",
    transcriptBorder: "rgba(239,68,68,0.12)",
    btnPrimaryBg: "rgba(239,68,68,0.12)",
    btnPrimaryBorder: "rgba(239,68,68,0.3)",
    btnPrimaryText: "rgba(239,68,68,0.9)",
  },
  instagram: {
    label: "Instagram",
    headerBg: "linear-gradient(135deg, rgba(131,58,180,0.20) 0%, rgba(253,29,29,0.14) 60%, rgba(252,176,69,0.10) 100%)",
    headerBorder: "rgba(193,53,132,0.22)",
    cardBorder: "rgba(193,53,132,0.5)",
    chevronColor: "rgba(193,53,132,0.65)",
    transcriptBorder: "rgba(193,53,132,0.12)",
    btnPrimaryBg: "rgba(193,53,132,0.12)",
    btnPrimaryBorder: "rgba(193,53,132,0.3)",
    btnPrimaryText: "rgba(225,48,108,0.9)",
    labelStyle: {
      background: "linear-gradient(90deg,#c13584,#e1306c)",
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
    },
  },
  tiktok: {
    label: "TikTok",
    headerBg: "rgba(10,10,10,0.95)",
    headerBorder: "rgba(37,244,238,0.15)",
    cardBorder: "rgba(37,244,238,0.35)",
    chevronColor: "rgba(37,244,238,0.65)",
    transcriptBorder: "rgba(37,244,238,0.12)",
    btnPrimaryBg: "rgba(37,244,238,0.08)",
    btnPrimaryBorder: "rgba(37,244,238,0.28)",
    btnPrimaryText: "rgba(37,244,238,0.88)",
    extraBoxShadow: "2px 0 0 rgba(254,44,85,0.25), -2px 0 0 rgba(37,244,238,0.20)",
    labelStyle: {
      background: "linear-gradient(90deg,#25f4ee,#fe2c55)",
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
    },
  },
  facebook: {
    label: "Facebook",
    headerBg: "rgba(24,119,242,0.12)",
    headerBorder: "rgba(24,119,242,0.20)",
    cardBorder: "rgba(24,119,242,0.5)",
    chevronColor: "rgba(24,119,242,0.65)",
    transcriptBorder: "rgba(24,119,242,0.12)",
    btnPrimaryBg: "rgba(24,119,242,0.12)",
    btnPrimaryBorder: "rgba(24,119,242,0.32)",
    btnPrimaryText: "rgba(24,119,242,0.95)",
  },
  default: {
    label: "Video Reference",
    headerBg: "rgba(8,145,178,0.10)",
    headerBorder: "rgba(8,145,178,0.20)",
    cardBorder: "rgba(8,145,178,0.25)",
    chevronColor: "rgba(34,211,238,0.5)",
    transcriptBorder: "rgba(8,145,178,0.12)",
    btnPrimaryBg: "rgba(8,145,178,0.12)",
    btnPrimaryBorder: "rgba(8,145,178,0.30)",
    btnPrimaryText: "rgba(34,211,238,0.85)",
  },
};

// ─── Platform SVG icons ───────────────────────────────────────────────────
function YouTubeIcon() {
  return (
    <svg width="20" height="14" viewBox="0 0 20 14" fill="none">
      <rect width="20" height="14" rx="3.5" fill="#FF0000"/>
      <path d="M8 4L13.5 7L8 10V4Z" fill="white"/>
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <defs>
        <radialGradient id="ig-rad" cx="30%" cy="107%" r="150%">
          <stop offset="0%" stopColor="#fdf497"/>
          <stop offset="5%" stopColor="#fdf497"/>
          <stop offset="45%" stopColor="#fd5949"/>
          <stop offset="60%" stopColor="#d6249f"/>
          <stop offset="90%" stopColor="#285AEB"/>
        </radialGradient>
      </defs>
      <rect x="1" y="1" width="22" height="22" rx="6" fill="url(#ig-rad)"/>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" stroke="white" strokeWidth="1.5" fill="none"/>
      <circle cx="12" cy="12" r="4" stroke="white" strokeWidth="1.5" fill="none"/>
      <circle cx="17.2" cy="6.8" r="1.1" fill="white"/>
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg width="14" height="16" viewBox="0 0 14 16" fill="none">
      <path d="M9.5 0C9.7 1.8 10.7 2.8 12.5 3V5.3C11.3 5.2 10.3 4.8 9.5 4.2V9C9.5 11.5 7.5 13.5 5 13.5C2.5 13.5 0.5 11.5 0.5 9C0.5 6.5 2.5 4.5 5 4.5C5.2 4.5 5.4 4.5 5.6 4.6V6.9C5.4 6.8 5.2 6.8 5 6.8C3.7 6.8 2.7 7.8 2.7 9C2.7 10.2 3.7 11.2 5 11.2C6.3 11.2 7.3 10.2 7.3 9V0H9.5Z" fill="#fe2c55" opacity="0.6" transform="translate(0.5,0.5)"/>
      <path d="M9.5 0C9.7 1.8 10.7 2.8 12.5 3V5.3C11.3 5.2 10.3 4.8 9.5 4.2V9C9.5 11.5 7.5 13.5 5 13.5C2.5 13.5 0.5 11.5 0.5 9C0.5 6.5 2.5 4.5 5 4.5C5.2 4.5 5.4 4.5 5.6 4.6V6.9C5.4 6.8 5.2 6.8 5 6.8C3.7 6.8 2.7 7.8 2.7 9C2.7 10.2 3.7 11.2 5 11.2C6.3 11.2 7.3 10.2 7.3 9V0H9.5Z" fill="#25f4ee" opacity="0.6" transform="translate(-0.5,-0.5)"/>
      <path d="M9.5 0C9.7 1.8 10.7 2.8 12.5 3V5.3C11.3 5.2 10.3 4.8 9.5 4.2V9C9.5 11.5 7.5 13.5 5 13.5C2.5 13.5 0.5 11.5 0.5 9C0.5 6.5 2.5 4.5 5 4.5C5.2 4.5 5.4 4.5 5.6 4.6V6.9C5.4 6.8 5.2 6.8 5 6.8C3.7 6.8 2.7 7.8 2.7 9C2.7 10.2 3.7 11.2 5 11.2C6.3 11.2 7.3 10.2 7.3 9V0H9.5Z" fill="white"/>
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="11" fill="#1877F2"/>
      <path d="M15.5 8H13.5C13.2 8 13 8.2 13 8.5V10H15.5L15.1 12.5H13V19H10.5V12.5H9V10H10.5V8.5C10.5 6.6 11.9 5 13.8 5H15.5V8Z" fill="white"/>
    </svg>
  );
}

function PlatformIcon({ platform }: { platform: Platform }) {
  if (platform === "youtube") return <YouTubeIcon />;
  if (platform === "instagram") return <InstagramIcon />;
  if (platform === "tiktok") return <TikTokIcon />;
  if (platform === "facebook") return <FacebookIcon />;
  return <Film className="w-3.5 h-3.5 text-primary" />;
}

interface Section {
  section: "hook" | "body" | "cta";
  actor_text: string;
  visual_cue: string;
}

interface VideoStructure {
  detected_format: string;
  sections: Section[];
}

interface VisualSegmentNode {
  start: number;
  end: number;
  description: string;
  text_on_screen?: string[];
}

interface VideoAnalysisData {
  visual_segments: VisualSegmentNode[];
  audio: { energy: string; has_music: boolean; speech_density: string; bpm_estimate: number };
  duration_seconds: number;
}

interface VideoData {
  url?: string;
  transcription?: string;
  structure?: VideoStructure;
  videoAnalysis?: VideoAnalysisData;
  caption?: string;
  channel_username?: string;
  thumbnailUrl?: string | null;
  videoTitle?: string | null;        // ← add this line
  videoLabel?: string | null;
  videoFileUrl?: string | null;
  cdnVideoUrl?: string | null;
  selectedSections?: string[];
  clientId?: string | null;
  onUpdate?: (updates: Partial<VideoData>) => void;
  onDelete?: () => void;
  authToken?: string | null;
}

const viralBadgeClass = (score: number): string => {
  if (score >= 8) return 'badge-lime';
  if (score >= 4) return 'badge-cyan';
  return 'badge-neutral';
};

const SECTION_COLORS: Record<string, { label: string; accent: string; bg: string; border: string }> = {
  hook: { label: "Hook", accent: "text-[#22d3ee]", bg: "bg-[rgba(8,145,178,0.08)]", border: "border-[rgba(8,145,178,0.2)]" },
  body: { label: "Body", accent: "text-[#94a3b8]", bg: "bg-[rgba(148,163,184,0.06)]", border: "border-[rgba(148,163,184,0.15)]" },
  cta:  { label: "CTA",  accent: "text-[#a3e635]", bg: "bg-[rgba(132,204,22,0.06)]", border: "border-[rgba(132,204,22,0.15)]" },
};

// ── Custom Video Player ─────────────────────────────────────────────
function CanvasVideoPlayer({ src, aspectRatio, onClose, onAspectDetected }: { src: string; aspectRatio: string; onClose: () => void; onAspectDetected?: (ratio: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [detectedRatio, setDetectedRatio] = useState<string | null>(null);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimeout.current) clearTimeout(hideTimeout.current);
    hideTimeout.current = setTimeout(() => {
      if (playing) setShowControls(false);
    }, 2500);
  }, [playing]);

  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); }
    else { v.pause(); setPlaying(false); setShowControls(true); }
    resetHideTimer();
  }, [resetHideTimer]);

  const handleTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    setCurrentTime(v.currentTime);
    setProgress(v.currentTime / v.duration);
  }, []);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    const bar = progressRef.current;
    if (!v || !bar) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    v.currentTime = ratio * v.duration;
    resetHideTimer();
  }, [resetHideTimer]);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
    resetHideTimer();
  }, [resetHideTimer]);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.();
      setFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setFullscreen(false);
    }
    resetHideTimer();
  }, [resetHideTimer]);

  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  useEffect(() => { resetHideTimer(); }, [resetHideTimer]);

  const accentColor = "#22d3ee";

  return (
    <div
      ref={containerRef}
      className="nodrag relative w-full overflow-hidden"
      style={{
        aspectRatio: detectedRatio || aspectRatio,
        background: "#000",
        borderRadius: fullscreen ? 0 : undefined,
        cursor: "pointer",
      }}
      onMouseMove={resetHideTimer}
      onMouseLeave={() => { if (playing) setShowControls(false); }}
      onClick={toggle}
    >
      <video
        ref={videoRef}
        src={src}
        autoPlay
        playsInline
        className="w-full h-full object-contain"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={() => {
          const v = videoRef.current;
          if (!v) return;
          setDuration(v.duration ?? 0);
          if (v.videoWidth && v.videoHeight) {
            const ratio = v.videoWidth < v.videoHeight ? "9 / 16" : "16 / 9";
            setDetectedRatio(ratio);
            onAspectDetected?.(ratio);
          }
        }}
        onEnded={() => { setPlaying(false); setShowControls(true); }}
        onError={(e) => {
          console.error("[CanvasVideoPlayer] Video load error:", (e.target as HTMLVideoElement).error);
          toast.error("Video failed to load");
          onClose();
        }}
      />

      {/* Big play overlay when paused */}
      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <div
            className="flex items-center justify-center"
            style={{
              width: 56, height: 56, borderRadius: "50%",
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.2)",
              backdropFilter: "blur(12px)",
            }}
          >
            <Play className="w-5 h-5 text-white/90 ml-0.5" fill="rgba(255,255,255,0.9)" />
          </div>
        </div>
      )}

      {/* Close button */}
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="absolute top-2 left-2 p-1 rounded-lg bg-black/50 backdrop-blur-sm hover:bg-black/70 text-white/80 hover:text-white transition-colors z-10"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      {/* Controls bar */}
      <div
        className="absolute bottom-0 left-0 right-0 z-10"
        style={{
          padding: "20px 10px 8px",
          background: "linear-gradient(0deg, rgba(0,0,0,0.8) 0%, transparent 100%)",
          transition: "opacity 0.3s ease",
          opacity: showControls ? 1 : 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Progress bar */}
        <div
          ref={progressRef}
          className="nodrag"
          style={{ height: 3, background: "rgba(255,255,255,0.15)", borderRadius: 2, marginBottom: 8, cursor: "pointer", position: "relative" }}
          onClick={handleSeek}
        >
          <div style={{ height: "100%", width: `${progress * 100}%`, background: accentColor, borderRadius: 2, position: "relative" }}>
            <div style={{
              position: "absolute", right: -4, top: "50%", transform: "translateY(-50%)",
              width: 8, height: 8, borderRadius: "50%", background: "#fff",
              boxShadow: `0 0 6px ${accentColor}`,
            }} />
          </div>
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-2">
          <button onClick={toggle} className="nodrag bg-transparent border-none cursor-pointer text-white p-0 flex items-center">
            {playing ? <Pause size={13} /> : <Play size={13} />}
          </button>
          <button onClick={toggleMute} className="nodrag bg-transparent border-none cursor-pointer text-white/60 p-0 flex items-center">
            {muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
          </button>
          <span className="text-[10px] text-white/40 tabular-nums tracking-wide">
            {fmt(currentTime)} / {fmt(duration)}
          </span>
          <div className="flex-1" />
          <button onClick={toggleFullscreen} className="nodrag bg-transparent border-none cursor-pointer text-white/60 p-0 flex items-center">
            {fullscreen ? <Minimize size={12} /> : <Maximize size={12} />}
          </button>
        </div>
      </div>
    </div>
  );
}

/*
 * VideoNode — Thumbnail-first interaction model
 *
 * States:
 *   idle        → URL input visible, no thumbnail
 *   transcribing → Loading overlay on thumbnail
 *   transcribed  → Thumbnail + transcript dropdown + "Generate Visual Breakdown" button
 *   analyzing    → Spinner on breakdown button
 *   done         → Thumbnail + transcript dropdown + visual breakdown dropdown
 */

const VideoNode = memo(({ data, selected }: NodeProps) => {
  const d = data as VideoData;
  const { showOutOfCreditsModal } = useOutOfCredits();
  const [urlInput, setUrlInput] = useState(d.url || "");
  const [stage, setStage] = useState<"idle" | "transcribing" | "transcribed" | "analyzing" | "done">(
    d.structure ? "done" : d.transcription ? "transcribed" : "idle"
  );
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(d.thumbnailUrl || null);
  const [selectedSections, setSelectedSections] = useState<string[]>(d.selectedSections || ["hook", "body", "cta"]);
  const [savingVault, setSavingVault] = useState(false);
  const [thumbStatus, setThumbStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [thumbError, setThumbError] = useState<string | null>(null);
  const [videoFileUrl, setVideoFileUrl] = useState<string | null>(d.videoFileUrl || null);
  const [videoTitle, setVideoTitle] = useState<string | null>(d.videoTitle ?? null);
  const [videoLabel, setVideoLabel] = useState<string | null>(d.videoLabel ?? null);
  const [playingVideo, setPlayingVideo] = useState(false);
  const [downloadingVideo, setDownloadingVideo] = useState(false);

  // Dropdown states
  const [showTranscript, setShowTranscript] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);

  // Dual progress for parallel analysis
  const [structureProgress, setStructureProgress] = useState<"idle"|"running"|"done"|"error">("idle");
  const [visualProgress, setVisualProgress] = useState<"idle"|"running"|"done"|"error">("idle");

  // ─── Step 1: Transcribe (fires thumbnail fetch in parallel) ───
  const deriveVideoLabel = (title?: string | null, caption?: string | null, transcription?: string | null, username?: string | null): string => {
    if (title) return title.slice(0, 50);
    if (caption) return caption.split(/[\n.!?]/)[0].trim().slice(0, 50);
    if (transcription) return transcription.split(/[.!?\n]/)[0].trim().slice(0, 50);
    if (username) return `@${username}`;
    return "Video";
  };

  const transcribe = async () => {
    if (!urlInput.trim()) { toast.error("Paste a video URL first."); return; }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      // Prefer fresh session token over prop (prop can go stale in long sessions)
      const token = session?.access_token || d.authToken || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      setStage("transcribing");
      setThumbStatus("loading");
      setThumbError(null);

      // Download video MP4 — fire-and-forget for playback
      // YouTube Shorts are treated like TikTok (downloadable short-form), regular YT is not
      const isIg = /instagram\.com/.test(urlInput);
      const isYtUrl = /youtube\.com|youtu\.be/.test(urlInput);
      const isYtShort = /youtube\.com\/shorts\//.test(urlInput);
      const isLongYt = isYtUrl && !isYtShort;
      if (!isIg && !isLongYt) downloadVideoFile(urlInput.trim());

      // Thumbnail — fire-and-forget for non-YouTube (YouTube thumbnail comes back in transcribe-video response)
      // YouTube Shorts also get thumbnails from transcribe-video response, so skip fetch
      const thumbUrl = `${SUPABASE_URL}/functions/v1/fetch-thumbnail`;
      const skipThumbFetch = isYtUrl;
      console.log("[VideoNode] Fetching thumbnail from:", thumbUrl);
      if (!skipThumbFetch) {
        fetch(thumbUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ url: urlInput.trim() }),
        }).then(r => {
          console.log("[VideoNode] Thumbnail response status:", r.status);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        }).then(j => {
          console.log("[VideoNode] Thumbnail result:", j.thumbnail_url ? `got ${j.thumbnail_url.length} chars` : "null");
          if (j.thumbnail_url) {
            const proxied = proxyInstagramUrl(j.thumbnail_url);
            console.log("[VideoNode] Thumbnail proxied:", proxied.slice(0, 100));
            setThumbnailUrl(proxied);
            setThumbStatus("done");
            d.onUpdate?.({ thumbnailUrl: proxied });
          } else {
            setThumbStatus("error");
            setThumbError(j.error || "No thumbnail returned");
          }
        }).catch(err => {
          console.error("[VideoNode] Thumbnail fetch failed:", err);
          setThumbStatus("error");
          setThumbError(err.message || "Fetch failed");
        });
      }

      // Transcribe
      const res = await fetch(`${SUPABASE_URL}/functions/v1/transcribe-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url: urlInput.trim() }),
      });
      const json = await res.json();
      console.log("[VideoNode] transcribe-video response:", JSON.stringify({
        hasTranscription: !!json.transcription,
        transcriptionLen: json.transcription?.length,
        thumbnail_url: json.thumbnail_url ? `${json.thumbnail_url.slice(0, 60)}... (${json.thumbnail_url.length} chars)` : null,
        videoUrl: json.videoUrl ? json.videoUrl.slice(0, 80) + "..." : null,
        error: json.error,
      }));
      if (!res.ok) {
        if (json.insufficient_credits) {
          showOutOfCreditsModal();
          setStage("idle");
          return;
        }
        throw new Error(json.error || "Transcription failed");
      }

      const updates: Partial<VideoData> = { url: urlInput.trim(), transcription: json.transcription };

      // Capture title for YouTube
      if (json.video_title) {
        setVideoTitle(json.video_title);
        updates.videoTitle = json.video_title;
      }

      // Auto-label: derive a short readable name from available data
      if (!videoLabel) {
        const label = deriveVideoLabel(json.video_title, d.caption, json.transcription, d.channel_username);
        setVideoLabel(label);
        updates.videoLabel = label;
      }

      // Store CDN video URL for later visual analysis (Instagram CDN URLs expire, so use ASAP)
      if (json.videoUrl) {
        updates.cdnVideoUrl = json.videoUrl;
      }

      // Use thumbnail from transcription response if fetch-thumbnail hasn't resolved or failed
      if (json.thumbnail_url && (!thumbnailUrl || thumbStatus === "error")) {
        const proxied = proxyInstagramUrl(json.thumbnail_url);
        console.log("[VideoNode] Setting thumbnail from transcription response:", proxied.slice(0, 100));
        setThumbnailUrl(proxied);
        setThumbStatus("done");
        updates.thumbnailUrl = proxied;
      } else {
        console.log("[VideoNode] No thumbnail from transcription. thumbnail_url:", json.thumbnail_url, "current thumbnailUrl:", thumbnailUrl);
      }

      // For Instagram: trigger VPS video download for playback using the CDN URL
      if (isIg && json.videoUrl) {
        console.log("[VideoNode] Triggering IG video download from CDN URL");
        downloadVideoFile(json.videoUrl);
      } else if (isIg) {
        console.log("[VideoNode] IG but no videoUrl in response — no playback");
      }

      d.onUpdate?.(updates);
      setStage("transcribed");

      // Signal credits change so FloatingCredits updates without page refresh
      window.dispatchEvent(new Event("credits-updated"));
    } catch (e: any) {
      toast.error(e.message || "Processing failed");
      setStage("idle");
    }
  };

  // ─── Download video for playback ───
  const downloadVideoFile = async (videoUrl: string, autoPlay = false) => {
    console.log("[VideoNode] downloadVideoFile called:", videoUrl.slice(0, 80), "autoPlay:", autoPlay);

    // Already a cached/proxied URL on our own domain — play directly
    const isOwnUrl = /connectacreators\.com\/(video-cache|api\/proxy-video)/.test(videoUrl);
    if (isOwnUrl) {
      console.log("[VideoNode] Already a cached/proxied URL — playing directly");
      setVideoFileUrl(videoUrl);
      d.onUpdate?.({ videoFileUrl: videoUrl });
      if (autoPlay) setPlayingVideo(true);
      return;
    }

    // For Instagram CDN URLs — proxy directly, no download needed
    const isIgCDN = /cdninstagram\.com|fbcdn\.net/.test(videoUrl);
    if (isIgCDN) {
      const proxied = `${VPS_API_URL}/proxy-video?url=${encodeURIComponent(videoUrl)}`;
      console.log("[VideoNode] Using VPS proxy for IG CDN video");
      setVideoFileUrl(proxied);
      d.onUpdate?.({ videoFileUrl: proxied });
      if (autoPlay) setPlayingVideo(true);
      return;
    }

    // For Instagram/TikTok page URLs — use /stream-reel (Cobalt) which works reliably
    const isIgOrTt = /instagram\.com|tiktok\.com/.test(videoUrl);
    if (isIgOrTt) {
      const streamUrl = `${VPS_API_URL}/stream-reel?url=${encodeURIComponent(videoUrl)}`;
      console.log("[VideoNode] Using /stream-reel for IG/TT page URL");
      setVideoFileUrl(streamUrl);
      d.onUpdate?.({ videoFileUrl: streamUrl });
      if (autoPlay) setPlayingVideo(true);
      return;
    }

    // For other page URLs (YouTube, etc.) — download via VPS, cache as MP4
    setDownloadingVideo(true);
    toast.info("Preparing video for playback...");
    try {
      const res = await fetch(`${VPS_API_URL}/download-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": VPS_API_KEY },
        body: JSON.stringify({ url: videoUrl }),
      });
      const json = await res.json();
      console.log("[VideoNode] /download-video response:", res.status, json);
      if (res.ok && json.video_url) {
        setVideoFileUrl(json.video_url);
        d.onUpdate?.({ videoFileUrl: json.video_url });
        if (autoPlay) setPlayingVideo(true);
      } else {
        toast.error("Could not load video: " + (json.error || "Unknown error"));
      }
    } catch (e: any) {
      console.error("[VideoNode] Video download failed:", e);
      toast.error("Video download failed: " + (e.message || "Network error"));
    } finally {
      setDownloadingVideo(false);
    }
  };

  // ─── Step 2: Analyze structure + visual scenes in parallel ───
  const analyzeStructure = async () => {
    if (!d.transcription) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      // Prefer fresh session token over prop (prop can go stale in long sessions)
      const token = session?.access_token || d.authToken || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

      setStage("analyzing");
      setStructureProgress("running");

      // Skip visual analysis for long YouTube videos (too large to download/analyze)
      const videoUrl = d.url || urlInput;
      const isLongYouTube = /(?:youtube\.com\/watch|youtu\.be\/)/.test(videoUrl) && !/youtube\.com\/shorts\//.test(videoUrl);

      if (isLongYouTube) {
        setVisualProgress("done"); // No visual for long YT
      } else {
        setVisualProgress("running");
      }

      const structurePromise = fetch(`${SUPABASE_URL}/functions/v1/ai-build-script`, {
        method: "POST", headers,
        body: JSON.stringify({ step: "analyze-structure", transcription: d.transcription, caption: d.caption }),
      }).then(r => r.json());

      const visualPromise = isLongYouTube
        ? Promise.resolve({ skipped: true })
        : fetch(`${SUPABASE_URL}/functions/v1/analyze-video-multimodal`, {
            method: "POST", headers,
            body: JSON.stringify({ url: d.cdnVideoUrl || videoUrl, original_url: videoUrl, transcript: d.transcription }),
          }).then(r => r.json());

      const [structureRes, visualRes] = await Promise.allSettled([structurePromise, visualPromise]);

      let structureOk = false;
      let visualOk = false;
      const updates: Partial<VideoData> = {};

      if (structureRes.status === "fulfilled" && structureRes.value.insufficient_credits) {
        showOutOfCreditsModal();
        setStage("transcribed");
        return;
      }

      if (structureRes.status === "fulfilled" && !structureRes.value.error) {
        let structure = structureRes.value;
        // B-roll fallback: if detected format is caption-style and transcription is sparse,
        // synthesize structure from visual segments for a more meaningful breakdown
        if (
          visualRes.status === "fulfilled" &&
          !visualRes.value.error &&
          structure.detected_format === "CAPTION_VIDEO_MUSIC" &&
          (d.transcription?.trim().split(/\s+/).filter(Boolean).length ?? 0) < 20 &&
          visualRes.value.visual_segments?.length > 0
        ) {
          const segs: VisualSegmentNode[] = visualRes.value.visual_segments;
          const hookSeg = segs[0];
          const ctaSeg = segs[segs.length - 1];
          const bodySeg = segs.slice(1, -1);
          const buildSection = (seg: VisualSegmentNode, label: "hook" | "body" | "cta") => ({
            section: label,
            actor_text: seg.text_on_screen?.join(" ") || seg.description,
            visual_cue: seg.description,
          });
          structure = {
            detected_format: "CAPTION_VIDEO_MUSIC",
            sections: [
              buildSection(hookSeg, "hook"),
              ...(bodySeg.length > 0
                ? [{ section: "body" as const, actor_text: bodySeg.map(s => s.text_on_screen?.join(" ") || s.description).join(" "), visual_cue: bodySeg.map(s => s.description).join("; ") }]
                : []),
              ...(segs.length > 1 ? [buildSection(ctaSeg, "cta")] : []),
            ],
          };
        }
        updates.structure = structure;
        setStructureProgress("done");
        structureOk = true;
      } else {
        setStructureProgress("error");
      }

      if (visualRes.status === "fulfilled" && !visualRes.value.error && !visualRes.value.skipped) {
        updates.videoAnalysis = visualRes.value;
        setVisualProgress("done");
        visualOk = true;
      } else if (visualRes.status === "fulfilled" && visualRes.value.skipped) {
        setVisualProgress("done"); // Skipped for long YouTube — not an error
      } else {
        setVisualProgress("error");
      }

      if (structureOk || visualOk) {
        d.onUpdate?.(updates);
        setStage("done");
        setShowBreakdown(true);
      } else {
        toast.error("Analysis failed — please try again");
        setStage("transcribed");
      }
    } catch (e: any) {
      toast.error(e.message || "Analysis failed");
      setStage("transcribed");
    }
  };

  // ─── Re-run visual analysis only (when structure exists but videoAnalysis is missing) ───
  const reAnalyzeVisual = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      // Prefer fresh session token over prop (prop can go stale in long sessions)
      const token = session?.access_token || d.authToken || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

      setVisualProgress("running");

      const visualRes = await fetch(`${SUPABASE_URL}/functions/v1/analyze-video-multimodal`, {
        method: "POST", headers,
        body: JSON.stringify({ url: d.cdnVideoUrl || d.url || urlInput, original_url: d.url || urlInput, transcript: d.transcription || "" }),
      }).then(r => r.json());

      if (visualRes.error) throw new Error(visualRes.error);

      d.onUpdate?.({ videoAnalysis: visualRes });
      setVisualProgress("done");
      setShowBreakdown(true);
    } catch (e: any) {
      console.error("[VideoNode] reAnalyzeVisual error:", e);
      setVisualProgress("error");
      toast.error("Visual analysis failed: " + (e.message || "unknown error"));
    }
  };

  // ─── Reset ───
  const reset = () => {
    setStage("idle");
    setThumbnailUrl(null);
    setVideoFileUrl(null);
    setVideoTitle(null);
    setPlayingVideo(false);
    setShowTranscript(false);
    setShowBreakdown(false);
    setSelectedSections(["hook", "body", "cta"]);
    setStructureProgress("idle");
    setVisualProgress("idle");
    d.onUpdate?.({ url: undefined, transcription: undefined, structure: undefined, videoAnalysis: undefined, thumbnailUrl: undefined, videoTitle: undefined, videoFileUrl: undefined, selectedSections: undefined });
  };

  // ─── Toggle section context ───
  const toggleSection = (section: string) => {
    if (selectedSections.includes(section) && selectedSections.length === 1) return;
    const updated = selectedSections.includes(section)
      ? selectedSections.filter(s => s !== section)
      : [...selectedSections, section];
    setSelectedSections(updated);
    d.onUpdate?.({ selectedSections: updated });
  };

  // ─── Save to Vault ───
  const saveToVault = async () => {
    if (!d.clientId) { toast.error("No client selected."); return; }
    setSavingVault(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      // Prefer fresh session token over prop (prop can go stale in long sessions)
      const token = session?.access_token || d.authToken || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-build-script`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ step: "analyze-template", transcription: d.transcription, url: urlInput }),
      });
      const analysis = await res.json();
      if (!res.ok) {
        if (analysis.insufficient_credits) {
          showOutOfCreditsModal();
          return;
        }
        throw new Error(analysis.error || "Analysis failed");
      }

      await supabase.from("vault_templates").insert({
        client_id: d.clientId,
        name: analysis.suggested_name || "Untitled",
        source_url: urlInput,
        transcription: d.transcription,
        structure_analysis: d.structure || null,
        template_lines: analysis.template_lines || null,
        thumbnail_url: thumbnailUrl,
      });
      toast.success("Saved to Vault!");
    } catch (e: any) {
      toast.error(e.message || "Vault save failed");
    } finally {
      setSavingVault(false);
    }
  };

  // Seed label from caption for nodes that already have one but no label yet
  useEffect(() => {
    if (!videoLabel && (d.caption || d.channel_username)) {
      const label = deriveVideoLabel(d.videoTitle, d.caption, d.transcription, d.channel_username);
      setVideoLabel(label);
      d.onUpdate?.({ videoLabel: label });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-transcribe when node is created with a pre-set URL (from paste handler)
  const autoTranscribedRef = useRef(false);
  useEffect(() => {
    if (!autoTranscribedRef.current && (d as any).autoTranscribe && urlInput && stage === "idle") {
      autoTranscribedRef.current = true;
      d.onUpdate?.({ autoTranscribe: false });
      setTimeout(() => transcribe(), 80);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasVideo = stage !== "idle";
  const hasTranscript = !!d.transcription;
  const hasStructure = !!d.structure;

  // Detect platform — YouTube Shorts are treated as short-form (like TikTok)
  const isYt = /youtube\.com|youtu\.be/.test(d.url || urlInput);
  const isYtShort = /youtube\.com\/shorts\//.test(d.url || urlInput);
  const isLongYt = isYt && !isYtShort;
  const platform = detectPlatform(d.url || urlInput);
  const theme = PLATFORM_THEME[platform];
  const urlForDetect = d.url || urlInput;
  const isYouTubeShort = /youtube\.com\/shorts\//.test(urlForDetect);
  const isFbReel = /facebook\.com\/reel/.test(urlForDetect);
  const isVertical = urlForDetect.includes("instagram.com") || urlForDetect.includes("tiktok.com") || isYouTubeShort || isFbReel;
  const [detectedAspect, setDetectedAspect] = useState<string | null>(null);
  // Force vertical for known short-form platforms — don't let thumbnail detection override
  const aspectRatio = isVertical ? "9 / 16" : (detectedAspect || "16 / 9");

  return (
    <div
      className="glass-card rounded-2xl shadow-xl relative"
      style={{
        width: "100%",
        minWidth: "180px",
        border: `1px solid ${theme.cardBorder}`,
        boxShadow: selected
          ? `0 0 0 2px ${theme.cardBorder}, 0 8px 24px rgba(0,0,0,0.4)${theme.extraBoxShadow ? `, ${theme.extraBoxShadow}` : ""}`
          : theme.extraBoxShadow
            ? `0 8px 24px rgba(0,0,0,0.4), ${theme.extraBoxShadow}`
            : undefined,
      }}
    >
      <NodeResizer
        minWidth={180}
        minHeight={120}
        handleStyle={{ opacity: 0, width: 12, height: 12 }}
        lineStyle={{ opacity: 0 }}
      />
      <div className="overflow-hidden rounded-2xl">
      {/* ──────── IDLE: URL Input ──────── */}
      {stage === "idle" && !thumbnailUrl && (
        <>
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5" style={{ background: theme.headerBg, borderBottom: `1px solid ${theme.headerBorder}` }}>
            <div className="flex items-center gap-2">
              <PlatformIcon platform={platform} />
              <span className="text-xs font-semibold" style={theme.labelStyle ?? { color: theme.btnPrimaryText }}>{theme.label}</span>
            </div>
            {d.onDelete && (
              <button onClick={d.onDelete} className="nodrag p-0.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <div className="p-3 space-y-2">
            <div className="flex gap-2">
              <div className="flex-1 flex items-center gap-2 bg-muted/30 border border-border rounded-xl px-3 py-2">
                <Link className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <input
                  className="nodrag flex-1 bg-transparent text-sm text-foreground placeholder-muted-foreground focus:outline-none"
                  placeholder="Paste video URL..."
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && transcribe()}
                />
              </div>
              <button
                onClick={transcribe}
                disabled={!urlInput.trim()}
                className="nodrag px-3 py-2 rounded-xl bg-primary/15 border border-primary/30 text-primary/80 hover:bg-primary/25 hover:text-primary transition-colors disabled:opacity-40 text-xs font-medium"
              >
                Go
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground px-0.5">Instagram, TikTok, YouTube — paste a URL to get transcript.</p>
          </div>
        </>
      )}

      {/* ──────── HAS VIDEO: Thumbnail-first layout ──────── */}
      {(hasVideo || thumbnailUrl) && (
        <>
          {/* Drag handle header — always draggable, shows delete */}
          <div className="flex items-center justify-between px-3 py-1.5" style={{ background: theme.headerBg, borderBottom: `1px solid ${theme.headerBorder}`, cursor: "grab" }}>
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <PlatformIcon platform={platform} />
              {videoLabel ? (
                <span className="text-[10px] font-medium text-white/75 truncate">{videoLabel}</span>
              ) : (
                <span className="text-[10px] font-semibold" style={theme.labelStyle ?? { color: theme.btnPrimaryText }}>{theme.label}</span>
              )}
            </div>
            {d.onDelete && (
              <button onClick={d.onDelete} className="nodrag p-0.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors flex-shrink-0">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Thumbnail hero / Custom Video Player */}
          <div className="relative">
            {playingVideo && videoFileUrl ? (
              <CanvasVideoPlayer
                src={videoFileUrl}
                aspectRatio={aspectRatio}
                onClose={() => setPlayingVideo(false)}
                onAspectDetected={setDetectedAspect}
              />
            ) : thumbnailUrl ? (
              <div className={`relative group ${isLongYt ? "cursor-default" : "cursor-pointer"}`} onClick={() => {
                if (isLongYt) return;  // Long YouTube has no playback (Shorts do)
                if (videoFileUrl) { setPlayingVideo(true); return; }
                if (downloadingVideo) return;
                if (d.url) downloadVideoFile(d.cdnVideoUrl || d.url, true);
              }}>
                <img
                  src={thumbnailUrl}
                  alt="Video thumbnail"
                  className="w-full object-cover"
                  style={{ aspectRatio }}
                  onLoad={(e) => {
                    const img = e.target as HTMLImageElement;
                    if (img.naturalWidth && img.naturalHeight && !detectedAspect) {
                      setDetectedAspect(img.naturalWidth < img.naturalHeight ? "9 / 16" : "16 / 9");
                    }
                  }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
                {/* Video title — YouTube only */}
                {isYt && videoTitle && (
                  <div className="px-3 py-2 bg-black/60 backdrop-blur-sm">
                    <p className="text-[11px] font-medium text-white/90 leading-snug line-clamp-2">{videoTitle}</p>
                  </div>
                )}
                {/* Play button overlay — hidden for long YouTube (Shorts get playback) */}
                {d.url && !isLongYt && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
                    {downloadingVideo ? (
                      <div className="w-12 h-12 rounded-full bg-black/50 backdrop-blur-sm border border-white/10 flex items-center justify-center">
                        <Loader2 className="w-5 h-5 text-white animate-spin" />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-md border border-white/15 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Play className="w-5 h-5 text-white ml-0.5" fill="white" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div
                className="w-full flex flex-col items-center justify-center gap-2"
                style={{
                  aspectRatio,
                  background: urlInput.includes("instagram") ? "linear-gradient(135deg, #833ab4 0%, #fd1d1d 50%, #fcb045 100%)"
                    : urlInput.includes("tiktok") ? "linear-gradient(135deg, #010101 0%, #25f4ee 50%, #fe2c55 100%)"
                    : "linear-gradient(135deg, #1a1a2e 0%, #4a148c 100%)",
                }}
              >
                {thumbStatus === "loading" ? (
                  <>
                    <Loader2 className="w-6 h-6 animate-spin text-white/80" />
                    <span className="text-[10px] text-white/70 font-medium">Loading thumbnail...</span>
                  </>
                ) : thumbStatus === "error" || thumbStatus === "done" ? (
                  <>
                    <Film className="w-10 h-10 text-white/40" />
                    <span className="text-[10px] text-white/50 font-medium">
                      {urlInput.includes("instagram") ? "Instagram Reel" : urlInput.includes("tiktok") ? "TikTok" : "Video"}
                    </span>
                  </>
                ) : (
                  <Film className="w-10 h-10 text-primary/30" />
                )}
              </div>
            )}

            {/* Loading overlay */}
            {stage === "transcribing" && (
              <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex flex-col items-center justify-center gap-2">
                <Loader2 className="w-7 h-7 animate-spin text-white" />
                <span className="text-xs text-white/80 font-medium">Transcribing...</span>
              </div>
            )}

            {/* Top-right controls — delete handled by header X, no duplicate here */}

            {/* Bottom overlay: format badge + reset only */}
            <div className="absolute bottom-0 left-0 right-0 px-3 py-1.5 bg-gradient-to-t from-black/60 to-transparent flex items-end justify-between">
              <div className="flex items-center gap-1.5">
                {hasStructure && d.structure && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/20 text-white/80 border border-white/20">
                    {d.structure.detected_format}
                  </span>
                )}
              </div>
              <button onClick={reset} className="nodrag text-[10px] text-white/50 hover:text-white transition-colors">
                reset
              </button>
            </div>
          </div>

          {/* Debug status */}
          {stage === "transcribing" && (
            <div className="px-3 py-1.5 bg-primary/5 border-b border-border/30 text-[10px] text-muted-foreground">
              Transcribing audio... {thumbStatus === "loading" ? "| Thumbnail loading..." : thumbStatus === "done" ? "| Thumbnail ready" : thumbStatus === "error" ? `| Thumb error: ${thumbError}` : ""}
            </div>
          )}

          {/* ──────── Content below thumbnail ──────── */}
          <div className="space-y-0">

            {/* ── Dropdown 1: Transcript ── */}
            {hasTranscript && (
              <div>
                <button
                  onClick={() => setShowTranscript(v => !v)}
                  className="nodrag w-full flex items-center justify-between px-3 py-2.5 transition-colors"
                  style={{ borderBottom: `1px solid ${theme.transcriptBorder}` }}
                >
                  <span className="text-xs font-semibold text-foreground/80">Transcript</span>
                  {showTranscript
                    ? <ChevronUp className="w-3.5 h-3.5" style={{ color: theme.chevronColor }} />
                    : <ChevronDown className="w-3.5 h-3.5" style={{ color: theme.chevronColor }} />}
                </button>
                {showTranscript && (
                  <div className="px-3 py-2.5 border-b border-border/40 bg-muted/10 nowheel nodrag" style={{ maxHeight: "200px", overflowY: "auto" }}>
                    <p className="text-[11px] text-foreground/80 leading-relaxed whitespace-pre-wrap select-text cursor-text" style={{ userSelect: "text" }}>{d.transcription}</p>
                  </div>
                )}
              </div>
            )}

            {/* ── "Generate Visual Breakdown" button — hidden for long YouTube ── */}
            {hasTranscript && !hasStructure && !isLongYt && (
              <div className="px-3 py-2">
                {stage !== "analyzing" ? (
                  <button
                    onClick={analyzeStructure}
                    className="nodrag w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl transition-colors text-xs font-semibold"
                    style={{ background: theme.btnPrimaryBg, border: `1px solid ${theme.btnPrimaryBorder}`, color: theme.btnPrimaryText }}
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Generate Visual Breakdown
                  </button>
                ) : (
                  <div className="space-y-1.5">
                    {/* Structure progress */}
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${structureProgress === "done" ? "bg-[rgba(132,204,22,0.06)] border border-[rgba(132,204,22,0.12)]" : "bg-primary/6 border border-primary/15"}`}>
                      {structureProgress === "done"
                        ? <span className="text-[#a3e635] text-[11px]">✓</span>
                        : <Loader2 className="w-3 h-3 animate-spin text-primary/70 flex-shrink-0" />}
                      <span className={structureProgress === "done" ? "text-[#a3e635]/80" : "text-primary/70"}>
                        Structure analysis{structureProgress === "done" ? " complete" : "…"}
                      </span>
                    </div>
                    {/* Visual progress */}
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${visualProgress === "done" ? "bg-[rgba(132,204,22,0.06)] border border-[rgba(132,204,22,0.12)]" : "bg-primary/6 border border-primary/15"}`}>
                      {visualProgress === "done"
                        ? <span className="text-[#a3e635] text-[11px]">✓</span>
                        : <Loader2 className="w-3 h-3 animate-spin text-primary/70 flex-shrink-0" />}
                      <span className={visualProgress === "done" ? "text-[#a3e635]/80" : "text-primary/70"}>
                        Visual scene analysis{visualProgress === "done" ? " complete" : "…"}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Dropdown 2: Visual Breakdown (merged) ── */}
            {(hasStructure || (d as any).videoAnalysis) && (
              <div>
                <button
                  onClick={() => setShowBreakdown(v => !v)}
                  className="nodrag w-full flex items-center justify-between px-3 py-2.5 border-b border-border/40 hover:bg-muted/20 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-foreground/80">Visual Breakdown</span>
                    {hasStructure && (
                      <div className="flex gap-1">
                        {(["hook", "body", "cta"] as const).map(s => {
                          const active = selectedSections.includes(s);
                          return (
                            <span
                              key={s}
                              onClick={(e) => { e.stopPropagation(); toggleSection(s); }}
                              className={`nodrag cursor-pointer px-1.5 py-0.5 rounded text-[8px] font-bold uppercase transition-colors border
                                ${active ? `${SECTION_COLORS[s].accent} ${SECTION_COLORS[s].bg} ${SECTION_COLORS[s].border}` : "text-muted-foreground/40 bg-transparent border-border/30"}`}
                            >
                              {s}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {showBreakdown
                    ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                    : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                </button>

                {showBreakdown && (
                  <div className="px-3 py-2.5 space-y-3 border-b border-border/40 nowheel" style={{ maxHeight: "400px", overflowY: "auto" }}>

                    {/* ── Script Structure sections ── */}
                    {hasStructure && d.structure && d.structure.sections.map((sec, i) => {
                      const c = SECTION_COLORS[sec.section] || SECTION_COLORS.body;
                      return (
                        <div key={i} className={`rounded-xl border ${c.border} ${c.bg} overflow-hidden`}>
                          <div className="px-3 py-1.5 border-b border-white/5">
                            <span className={`text-[10px] font-bold uppercase ${c.accent}`}>{c.label}</span>
                          </div>
                          <div className="px-3 py-2">
                            <p className="text-[11px] text-foreground/90 leading-relaxed">{sec.actor_text}</p>
                          </div>
                          {sec.visual_cue && (
                            <div className="px-3 py-1.5 border-t border-white/5 bg-black/5 flex items-start gap-1.5">
                              <Eye className="w-3 h-3 text-muted-foreground/50 mt-0.5 flex-shrink-0" />
                              <p className="text-[10px] text-foreground/60 leading-relaxed italic">{sec.visual_cue}</p>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* ── Re-run visual analysis button (when missing) ── */}
                    {!(d as any).videoAnalysis && visualProgress !== "running" && (
                      <button
                        onClick={reAnalyzeVisual}
                        className="nodrag w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-primary/10 border border-primary/25 text-primary/80 hover:bg-primary/20 hover:text-primary transition-colors text-xs font-semibold"
                      >
                        <Sparkles className="w-3.5 h-3.5" /> Run Visual Analysis
                      </button>
                    )}
                    {visualProgress === "running" && !(d as any).videoAnalysis && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs bg-primary/6 border border-primary/15">
                        <Loader2 className="w-3 h-3 animate-spin text-primary/70 flex-shrink-0" />
                        <span className="text-primary/70">Visual scene analysis…</span>
                      </div>
                    )}

                    {/* ── Visual Scenes (from multimodal analysis) ── */}
                    {(d as any).videoAnalysis?.visual_segments?.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5 pt-1">
                          <div className="flex-1 h-px bg-border/30" />
                          <span className="text-[9px] font-semibold text-muted-foreground/50 uppercase tracking-wider">Visual Scenes</span>
                          <div className="flex-1 h-px bg-border/30" />
                        </div>
                        {((d as any).videoAnalysis.visual_segments as VisualSegmentNode[]).map((seg, i) => (
                          <div key={i} className="rounded-lg border border-border/20 bg-muted/8 px-2.5 py-2 space-y-1.5">
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" />
                              <span className="text-[9px] font-semibold text-muted-foreground/60">
                                {seg.start}s – {seg.end}s
                              </span>
                            </div>
                            <p className="text-[10px] text-foreground/70 leading-relaxed">{seg.description}</p>
                            {seg.text_on_screen && seg.text_on_screen.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {seg.text_on_screen.map((txt, j) => (
                                  <span key={j} className="inline-flex items-center gap-1 text-[9px] px-2 py-0.5 rounded bg-[rgba(8,145,178,0.08)] border border-[rgba(8,145,178,0.2)] text-[#22d3ee]/80">
                                    <Type className="w-2.5 h-2.5 flex-shrink-0" />
                                    {txt}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}

                        {/* Audio summary chips */}
                        {(d as any).videoAnalysis?.audio && (
                          <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border/20">
                            {(d as any).videoAnalysis.audio.has_music && (
                              <span className="inline-flex items-center gap-1 text-[9px] px-2 py-1 rounded-lg bg-muted/20 border border-border/20 text-muted-foreground/70">
                                <Music2 className="w-2.5 h-2.5" /> Music
                              </span>
                            )}
                            {(d as any).videoAnalysis.audio.energy === "high" && (
                              <span className="inline-flex items-center gap-1 text-[9px] px-2 py-1 rounded-lg bg-muted/20 border border-border/20 text-muted-foreground/70">
                                <Zap className="w-2.5 h-2.5" /> High energy
                              </span>
                            )}
                            {(d as any).videoAnalysis.audio.speech_density === "low" && (
                              <span className="inline-flex items-center gap-1 text-[9px] px-2 py-1 rounded-lg bg-muted/20 border border-border/20 text-muted-foreground/70">
                                <MicOff className="w-2.5 h-2.5" /> No speech
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Bottom actions: Save to Vault ── */}
            {hasTranscript && (
              <div className="px-3 py-2.5 flex gap-2">
                <button
                  onClick={saveToVault}
                  disabled={savingVault || !d.clientId}
                  className="nodrag flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-[rgba(8,145,178,0.25)] bg-[rgba(8,145,178,0.08)] text-[#22d3ee] hover:bg-[rgba(8,145,178,0.15)] text-[11px] font-medium transition-colors disabled:opacity-40"
                >
                  {savingVault ? <Loader2 className="w-3 h-3 animate-spin" /> : <Archive className="w-3 h-3" />}
                  {savingVault ? "Saving..." : "Save to Vault"}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      </div>{/* end content wrapper */}
      <Handle type="target" position={Position.Left} className="!bg-primary !border-primary/70 !w-3 !h-3" style={{ zIndex: 50 }} />
      <Handle type="source" position={Position.Right} className="!bg-primary !border-primary/70 !w-3 !h-3" style={{ zIndex: 50 }} />
    </div>
  );
});

VideoNode.displayName = "VideoNode";
export default VideoNode;
