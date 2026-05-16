import { memo, useState, useEffect, useRef } from "react";
import { Handle, Position, NodeProps, NodeResizer } from "@xyflow/react";
import { Film, X, Loader2, Link, ChevronDown, ChevronUp, Sparkles, Archive, Eye, Type, Music2, Zap, MicOff, Clock, Play, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useOutOfCredits } from "@/contexts/OutOfCreditsContext";
import { ViralVideoPlayer } from "@/components/video/ViralVideoPlayer";

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
    headerBg: "rgba(143,208,213,0.10)",
    headerBorder: "rgba(143,208,213,0.20)",
    cardBorder: "rgba(143,208,213,0.25)",
    chevronColor: "rgba(143,208,213,0.5)",
    transcriptBorder: "rgba(143,208,213,0.12)",
    btnPrimaryBg: "rgba(143,208,213,0.12)",
    btnPrimaryBorder: "rgba(143,208,213,0.30)",
    btnPrimaryText: "#8FD0D5",
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
  /** When this VideoNode mirrors a row in viral_videos, transcript + analysis
   * results are persisted back to that row so the AI can ground future
   * scripts on real content instead of just the caption. */
  viralVideoId?: string | null;
  /** Mark the node as auto-transcribe-on-mount (set by build-mode when it
   * adds a video deterministically). */
  autoTranscribe?: boolean;
  /** Mirrors viral_videos.analysis_status for realtime-driven state hydration. */
  analysisStatus?: "pending" | "analyzing" | "analyzed" | "failed";
  analysisError?: string | null;
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
  hook: { label: "Hook", accent: "text-[#8FD0D5]", bg: "bg-[rgba(143,208,213,0.08)]", border: "border-[rgba(143,208,213,0.2)]" },
  body: { label: "Body", accent: "text-[rgba(20,20,20,0.55)]", bg: "bg-[rgba(20,20,20,0.04)]", border: "border-[rgba(20,20,20,0.08)]" },
  cta:  { label: "CTA",  accent: "text-[#F0BC7D]", bg: "bg-[rgba(224,165,96,0.08)]", border: "border-[rgba(224,165,96,0.20)]" },
};


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
  const [vaultSaved, setVaultSaved] = useState(false);
  const [thumbStatus, setThumbStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [thumbError, setThumbError] = useState<string | null>(null);
  const [videoFileUrl, setVideoFileUrl] = useState<string | null>(d.videoFileUrl || null);
  const [videoTitle, setVideoTitle] = useState<string | null>(d.videoTitle ?? null);
  const [videoLabel, setVideoLabel] = useState<string | null>(d.videoLabel ?? null);
  const [playingVideo, setPlayingVideo] = useState(false);
  const [downloadingVideo, setDownloadingVideo] = useState(false);

  // Dropdown states — start expanded when we landed with cached analysis
  // (e.g. Remix from Viral Today passes autoExpandAnalysis=true). Falsy
  // initial data leaves them collapsed as before.
  const _autoExpand = !!(d as any).autoExpandAnalysis;
  const [showTranscript, setShowTranscript] = useState(
    _autoExpand && typeof d.transcription === "string" && d.transcription.trim().length > 0
  );
  const [showBreakdown, setShowBreakdown] = useState(
    _autoExpand && (!!d.structure || !!(d as any).videoAnalysis)
  );

  // ─── Helper: derive a readable label from available metadata ───
  const deriveVideoLabel = (title?: string | null, caption?: string | null, transcription?: string | null, username?: string | null): string => {
    if (title) return title.slice(0, 50);
    if (caption) return caption.split(/[\n.!?]/)[0].trim().slice(0, 50);
    if (transcription) return transcription.split(/[.!?\n]/)[0].trim().slice(0, 50);
    if (username) return `@${username}`;
    return "Video";
  };

  // ─── Step 1: Resolve URL → obtain viralVideoId and cached fields ───
  const handleUrlSubmit = async (url: string) => {
    if (!url.trim()) { toast.error("Paste a video URL first."); return; }
    setStage("transcribing"); // reuse "transcribing" stage for the fetching UI
    setThumbStatus("loading");
    setThumbError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/viral-video-resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ url: url.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).message || (err as any).error || "Couldn't recognize that URL");
      }
      const { row } = await res.json();

      // Hydrate UI from cached row fields.
      // `structure` matches the legacy ai-build-script output shape: {sections, hook_text, cta_text, detected_format}.
      // framework_meta.raw_structure IS the sections array (from /analyze-video-multimodal).
      const updates: Partial<VideoData> = {
        viralVideoId: row.id,
        url: row.video_url ?? url.trim(),
        transcription: row.transcript ?? undefined,
        analysisStatus: row.analysis_status,
        structure: row.framework_meta?.raw_structure
          ? {
              sections: row.framework_meta.raw_structure,
              hook_text: row.hook_text,
              cta_text: row.cta_text,
              detected_format: row.framework_meta.content_type ?? null,
            }
          : undefined,
        videoAnalysis: row.framework_meta?.visual_segments
          ? { visual_segments: row.framework_meta.visual_segments, audio: row.framework_meta.audio, duration_seconds: row.framework_meta.duration_seconds }
          : undefined,
      };

      if (row.thumbnail_url) {
        const proxied = proxyInstagramUrl(row.thumbnail_url);
        setThumbnailUrl(proxied);
        setThumbStatus("done");
        updates.thumbnailUrl = proxied;
      } else {
        setThumbStatus("idle");
      }

      if (row.video_file_url) {
        setVideoFileUrl(row.video_file_url);
        updates.videoFileUrl = row.video_file_url;
      }

      if (row.title) {
        setVideoTitle(row.title);
        updates.videoTitle = row.title;
      }

      // Derive label from available data
      if (!videoLabel) {
        const label = deriveVideoLabel(row.title, d.caption, row.transcript, d.channel_username);
        setVideoLabel(label);
        updates.videoLabel = label;
      }

      d.onUpdate?.(updates);

      // ─── Legacy-row fallbacks: ensure playback + thumbnail exist ───
      // Legacy rows from the pre-unification flow have transcript but no
      // video_file_url or thumbnail_url. Wire up the VPS stream proxy (free —
      // just URL construction) so playback works, and fire-and-forget the
      // thumbnail fetch.
      const sourceUrl = row.video_url ?? url.trim();
      if (!row.video_file_url && sourceUrl) {
        downloadVideoFile(sourceUrl, false);
      }
      if (!row.thumbnail_url && sourceUrl) {
        setThumbStatus("loading");
        fetch(`${SUPABASE_URL}/functions/v1/fetch-thumbnail`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ url: sourceUrl }),
        })
          .then((r) => r.ok ? r.json() : null)
          .then((j) => {
            if (j?.thumbnail_url) {
              const proxied = proxyInstagramUrl(j.thumbnail_url);
              setThumbnailUrl(proxied);
              setThumbStatus("done");
              d.onUpdate?.({ thumbnailUrl: proxied });
            } else {
              setThumbStatus("error");
            }
          })
          .catch(() => setThumbStatus("error"));
      }

      // Stage decision:
      // - If transcript exists (regardless of analysis_status), treat as already-analyzed.
      //   The user has paid for that transcript before — don't re-charge.
      // - Otherwise gate on analysis_status.
      const hasCachedTranscript = typeof row.transcript === "string" && row.transcript.trim().length > 0;
      if (row.analysis_status === "analyzed" || hasCachedTranscript) {
        setStage("done");
      } else if (row.analysis_status === "analyzing") {
        setStage("analyzing");
      } else {
        setStage("transcribed"); // row resolved, ready to analyze
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to resolve URL");
      setStage("idle");
    }
  };

  // ─── Step 2: Unified analyze — calls /analyze-viral-video-user ───
  const analyze = async () => {
    if (!d.viralVideoId) {
      toast.error("Resolve a URL first");
      return;
    }
    setStage("analyzing");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/analyze-viral-video-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ viral_video_id: d.viralVideoId }),
      });
      if (res.status === 402) {
        showOutOfCreditsModal();
        setStage("transcribed");
        return;
      }
      if (res.status === 409) {
        // Another analyze is in flight — realtime subscription will update us
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).message || (err as any).error || "Analyze failed");
      }
      const { row } = await res.json();
      d.onUpdate?.({
        transcription: row.transcript,
        videoFileUrl: row.video_file_url,
        structure: row.framework_meta,
        videoAnalysis: row.framework_meta?.visual_segments
          ? { visual_segments: row.framework_meta.visual_segments, audio: row.framework_meta.audio, duration_seconds: row.framework_meta.duration_seconds }
          : undefined,
        analysisStatus: "analyzed",
      });
      if (row.video_file_url) setVideoFileUrl(row.video_file_url);
      setStage("done");
      setShowBreakdown(true);
      window.dispatchEvent(new Event("credits-updated"));
    } catch (e: any) {
      toast.error(e.message || "Analyze failed");
      setStage("transcribed");
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
    d.onUpdate?.({ url: undefined, transcription: undefined, structure: undefined, videoAnalysis: undefined, thumbnailUrl: undefined, videoTitle: undefined, videoFileUrl: undefined, selectedSections: undefined, viralVideoId: undefined, analysisStatus: undefined });
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
    if (!d.viralVideoId) { toast.error("Video still analyzing — try again in a moment."); return; }
    setSavingVault(true);
    try {
      const { data: existing } = await supabase
        .from("saved_videos")
        .select("id")
        .eq("client_id", d.clientId)
        .eq("viral_video_id", d.viralVideoId)
        .maybeSingle();
      if (existing) {
        toast.info("Already in Vault");
        setVaultSaved(true);
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("saved_videos").insert({
        client_id: d.clientId,
        viral_video_id: d.viralVideoId,
        saved_by: user?.id ?? null,
      });
      if (error) throw error;
      toast.success("Saved to Vault!");
      setVaultSaved(true);
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

  // Auto-submit when node is created with a pre-set URL (from build-mode paste handler)
  const autoTranscribedRef = useRef(false);
  useEffect(() => {
    if (!autoTranscribedRef.current && (d as any).autoTranscribe && urlInput && stage === "idle") {
      autoTranscribedRef.current = true;
      d.onUpdate?.({ autoTranscribe: false });
      setTimeout(() => handleUrlSubmit(urlInput), 80);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Detect if this viral_video is already saved in the client's Vault
  useEffect(() => {
    if (!d.viralVideoId || !d.clientId) return;
    let cancelled = false;
    supabase
      .from("saved_videos")
      .select("id")
      .eq("client_id", d.clientId)
      .eq("viral_video_id", d.viralVideoId)
      .maybeSingle()
      .then(({ data }) => { if (!cancelled && data) setVaultSaved(true); });
    return () => { cancelled = true; };
  }, [d.viralVideoId, d.clientId]);

  // Realtime subscription — keep node in sync with viral_videos row
  useEffect(() => {
    if (!d.viralVideoId) return;
    const channel = supabase
      .channel(`videonode:${d.viralVideoId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "viral_videos", filter: `id=eq.${d.viralVideoId}` },
        (payload) => {
          const row = payload.new as any;
          const updates: Partial<VideoData> = {
            transcription: row.transcript,
            videoFileUrl: row.video_file_url,
            structure: row.framework_meta?.raw_structure
              ? {
                  sections: row.framework_meta.raw_structure,
                  hook_text: row.hook_text,
                  cta_text: row.cta_text,
                  detected_format: row.framework_meta.content_type ?? null,
                }
              : undefined,
            videoAnalysis: row.framework_meta?.visual_segments
              ? { visual_segments: row.framework_meta.visual_segments, audio: row.framework_meta.audio, duration_seconds: row.framework_meta.duration_seconds }
              : undefined,
            analysisStatus: row.analysis_status,
          };
          if (row.video_file_url) setVideoFileUrl(row.video_file_url);
          d.onUpdate?.(updates);
          if (row.analysis_status === "analyzed") { setStage("done"); setShowBreakdown(true); }
          else if (row.analysis_status === "analyzing") setStage("analyzing");
          else if (row.analysis_status === "failed") setStage("transcribed");
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.viralVideoId]);

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
                  onKeyDown={(e) => e.key === "Enter" && handleUrlSubmit(urlInput.trim())}
                />
              </div>
              <button
                onClick={() => handleUrlSubmit(urlInput.trim())}
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

          {/* Thumbnail hero / Video Player */}
          <div className="relative">
            {playingVideo && videoFileUrl ? (
              <div className="nodrag relative w-full">
                <ViralVideoPlayer
                  src={videoFileUrl}
                  aspectRatio="auto"
                />
              </div>
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
                {/* Play button overlay — hidden for long YouTube (Shorts get playback).
                    Hand-drawn doodle SVG matching ViralVideoPlayer's paused-state overlay. */}
                {d.url && !isLongYt && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors pointer-events-none">
                    {downloadingVideo ? (
                      <div style={{ width: 64, height: 64 }}>
                        <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%" }} aria-hidden>
                          <path
                            d="M 50 8 Q 84 10, 92 50 Q 90 86, 50 92 Q 12 88, 8 50 Q 12 12, 50 8 Z"
                            fill="hsl(var(--honey))"
                            stroke="hsl(var(--ink))"
                            strokeWidth="3"
                            strokeLinejoin="round"
                          />
                          <foreignObject x="32" y="32" width="36" height="36">
                            <Loader2 className="w-9 h-9 animate-spin" style={{ color: "hsl(var(--ink))" }} />
                          </foreignObject>
                        </svg>
                      </div>
                    ) : (
                      <div style={{ width: 64, height: 64 }}>
                        <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%" }} aria-hidden>
                          <path
                            d="M 50 8 Q 84 10, 92 50 Q 90 86, 50 92 Q 12 88, 8 50 Q 12 12, 50 8 Z"
                            fill="hsl(var(--honey))"
                            stroke="hsl(var(--ink))"
                            strokeWidth="3"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M 40 32 Q 38 30, 42 32 L 70 48 Q 72 50, 70 52 L 42 68 Q 38 70, 40 68 Z"
                            fill="hsl(var(--ink))"
                            strokeLinejoin="round"
                          />
                        </svg>
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

          {/* Status banner */}
          {stage === "transcribing" && (
            <div className="px-3 py-1.5 border-b text-[10px]" style={{ background: "rgba(20,20,20,0.04)", borderColor: "rgba(20,20,20,0.10)", color: "#ffffff" }}>
              Resolving video... {thumbStatus === "loading" ? "| Fetching thumbnail..." : thumbStatus === "done" ? "| Thumbnail ready" : thumbStatus === "error" ? `| Thumb error: ${thumbError}` : ""}
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

            {/* ── Unified Analyze button (shown when row is resolved but not yet analyzed) ──
                 Hard guard: never show if the row already has transcript/structure/videoAnalysis.
                 Legacy rows have transcript but the broader state may not have caught up yet. */}
            {stage === "transcribed" && !hasStructure && !hasTranscript && !(d as any).videoAnalysis && (
              <div className="px-3 py-2">
                <button
                  onClick={analyze}
                  className="nodrag px-3 py-1.5 bg-accent text-accent-foreground rounded text-xs flex items-center gap-1.5 hover:opacity-90 transition-opacity"
                >
                  <Sparkles className="w-3.5 h-3.5" /> Analyze (50 credits)
                </button>
              </div>
            )}
            {stage === "analyzing" && !hasStructure && (
              <div className="px-3 py-2">
                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing&hellip; (30-90s)
                </div>
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
                    {hasStructure && d.structure && Array.isArray(d.structure.sections) && d.structure.sections.map((sec, i) => {
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
                                  <span key={j} className="inline-flex items-center gap-1 text-[9px] px-2 py-0.5 rounded bg-[rgba(143,208,213,0.08)] border border-[rgba(143,208,213,0.2)] text-[#8FD0D5]/80">
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
                  disabled={savingVault || vaultSaved || !d.clientId || !d.viralVideoId}
                  title={!d.viralVideoId ? "Analyzing — try again when ready" : undefined}
                  className="nodrag flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-[rgba(143,208,213,0.25)] bg-[rgba(143,208,213,0.08)] text-[#8FD0D5] hover:bg-[rgba(143,208,213,0.15)] text-[11px] font-medium transition-colors disabled:opacity-40"
                >
                  {savingVault ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : vaultSaved ? (
                    <CheckCircle2 className="w-3 h-3" />
                  ) : (
                    <Archive className="w-3 h-3" />
                  )}
                  {savingVault ? "Saving..." : vaultSaved ? "Saved" : "Save to Vault"}
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
