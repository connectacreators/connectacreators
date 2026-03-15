import { memo, useState, useEffect, useRef } from "react";
import { Handle, Position, NodeProps, NodeResizer } from "@xyflow/react";
import { Film, X, Loader2, Link, ChevronDown, ChevronUp, Sparkles, Archive, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const VPS_API_URL = "https://connectacreators.com/api";
const VPS_API_KEY = "ytdlp_connecta_2026_secret";

interface Section {
  section: "hook" | "body" | "cta";
  actor_text: string;
  visual_cue: string;
}

interface VideoStructure {
  detected_format: string;
  sections: Section[];
}

interface VideoData {
  url?: string;
  transcription?: string;
  structure?: VideoStructure;
  caption?: string;
  channel_username?: string;
  thumbnailUrl?: string | null;
  videoFileUrl?: string | null;
  selectedSections?: string[];
  clientId?: string | null;
  onUpdate?: (updates: Partial<VideoData>) => void;
  onDelete?: () => void;
  authToken?: string | null;
}

const SECTION_COLORS: Record<string, { label: string; accent: string; bg: string; border: string }> = {
  hook: { label: "Hook", accent: "text-amber-400", bg: "bg-amber-500/8", border: "border-amber-500/25" },
  body: { label: "Body", accent: "text-blue-400", bg: "bg-blue-500/8", border: "border-blue-500/25" },
  cta:  { label: "CTA",  accent: "text-green-400", bg: "bg-green-500/8", border: "border-green-500/25" },
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

const VideoNode = memo(({ data }: NodeProps) => {
  const d = data as VideoData;
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
  const [playingVideo, setPlayingVideo] = useState(false);
  const [downloadingVideo, setDownloadingVideo] = useState(false);

  // Dropdown states
  const [showTranscript, setShowTranscript] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);

  // ─── Step 1: Transcribe (fires thumbnail fetch in parallel) ───
  const transcribe = async () => {
    if (!urlInput.trim()) { toast.error("Paste a video URL first."); return; }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = d.authToken || session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      setStage("transcribing");
      setThumbStatus("loading");
      setThumbError(null);

      // Download video MP4 — fire-and-forget for playback
      downloadVideoFile(urlInput.trim());

      // Thumbnail — fire-and-forget with visible status
      const thumbUrl = `${SUPABASE_URL}/functions/v1/fetch-thumbnail`;
      console.log("[VideoNode] Fetching thumbnail from:", thumbUrl);
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
          setThumbnailUrl(j.thumbnail_url);
          setThumbStatus("done");
          d.onUpdate?.({ thumbnailUrl: j.thumbnail_url });
        } else {
          setThumbStatus("error");
          setThumbError(j.error || "No thumbnail returned");
        }
      }).catch(err => {
        console.error("[VideoNode] Thumbnail fetch failed:", err);
        setThumbStatus("error");
        setThumbError(err.message || "Fetch failed");
      });

      // Transcribe
      const res = await fetch(`${SUPABASE_URL}/functions/v1/transcribe-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url: urlInput.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Transcription failed");

      d.onUpdate?.({ url: urlInput.trim(), transcription: json.transcription });
      setStage("transcribed");
    } catch (e: any) {
      toast.error(e.message || "Processing failed");
      setStage("idle");
    }
  };

  // ─── Download video for playback (fire-and-forget during transcription) ───
  const downloadVideoFile = async (videoUrl: string) => {
    setDownloadingVideo(true);
    try {
      const res = await fetch(`${VPS_API_URL}/download-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": VPS_API_KEY },
        body: JSON.stringify({ url: videoUrl }),
      });
      const json = await res.json();
      if (res.ok && json.video_url) {
        setVideoFileUrl(json.video_url);
        d.onUpdate?.({ videoFileUrl: json.video_url });
      }
    } catch (e) {
      console.error("[VideoNode] Video download failed:", e);
    } finally {
      setDownloadingVideo(false);
    }
  };

  // ─── Step 2: Analyze structure (manual button click) ───
  const analyzeStructure = async () => {
    if (!d.transcription) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = d.authToken || session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      setStage("analyzing");
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-build-script`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ step: "analyze-structure", transcription: d.transcription, caption: d.caption }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Analysis failed");

      d.onUpdate?.({ structure: json });
      setStage("done");
      setShowBreakdown(true);
    } catch (e: any) {
      toast.error(e.message || "Analysis failed");
      setStage("transcribed");
    }
  };

  // ─── Reset ───
  const reset = () => {
    setStage("idle");
    setThumbnailUrl(null);
    setVideoFileUrl(null);
    setPlayingVideo(false);
    setShowTranscript(false);
    setShowBreakdown(false);
    setSelectedSections(["hook", "body", "cta"]);
    d.onUpdate?.({ url: undefined, transcription: undefined, structure: undefined, thumbnailUrl: undefined, videoFileUrl: undefined, selectedSections: undefined });
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
      const token = d.authToken || session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-build-script`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ step: "analyze-template", transcription: d.transcription, url: urlInput }),
      });
      const analysis = await res.json();
      if (!res.ok) throw new Error(analysis.error || "Analysis failed");

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

  // Detect platform for aspect ratio: Instagram/TikTok = 9:19 (vertical), YouTube = 16:9
  const isVertical = urlInput.includes("instagram.com") || urlInput.includes("tiktok.com");
  const aspectRatio = isVertical ? "9 / 19" : "16 / 9";

  return (
    <div
      className="bg-white/95 dark:bg-[#252525] backdrop-blur-sm border border-border/60 dark:border-white/8 rounded-2xl shadow-xl"
      style={{ width: "100%", minWidth: "180px" }}
    >
      <NodeResizer
        minWidth={180}
        minHeight={120}
        handleStyle={{ opacity: 0, width: 12, height: 12 }}
        lineStyle={{ opacity: 0 }}
      />
      {/* ──────── IDLE: URL Input ──────── */}
      {stage === "idle" && !thumbnailUrl && (
        <>
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 bg-primary/10 border-b border-primary/20">
            <div className="flex items-center gap-2">
              <Film className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold text-primary/80">Video Reference</span>
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
            <p className="text-[10px] text-muted-foreground px-0.5">Instagram, TikTok, YouTube — transcribes audio automatically.</p>
          </div>
        </>
      )}

      {/* ──────── HAS VIDEO: Thumbnail-first layout ──────── */}
      {(hasVideo || thumbnailUrl) && (
        <>
          {/* Thumbnail hero / Video player */}
          <div className="relative">
            {playingVideo && videoFileUrl ? (
              <div className="relative">
                <video
                  src={videoFileUrl}
                  controls
                  autoPlay
                  className="w-full nodrag"
                  style={{ aspectRatio }}
                />
                <button
                  onClick={() => setPlayingVideo(false)}
                  className="nodrag absolute top-2 left-2 p-1 rounded-lg bg-black/60 backdrop-blur-sm hover:bg-black/80 text-white/90 hover:text-white transition-colors z-10"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : thumbnailUrl ? (
              <div className="relative group cursor-pointer" onClick={() => { if (videoFileUrl) setPlayingVideo(true); }}>
                <img
                  src={thumbnailUrl}
                  alt="Video thumbnail"
                  className="w-full object-cover"
                  style={{ aspectRatio }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
                {/* Play button overlay */}
                {(videoFileUrl || downloadingVideo) && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
                    {downloadingVideo ? (
                      <div className="w-12 h-12 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
                        <Loader2 className="w-6 h-6 text-white animate-spin" />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Play className="w-6 h-6 text-white ml-0.5" fill="white" />
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

            {/* Top-right controls */}
            <div className="absolute top-2 right-2 flex gap-1.5">
              {d.onDelete && (
                <button onClick={d.onDelete} className="nodrag p-1 rounded-lg bg-black/40 backdrop-blur-sm hover:bg-red-500/60 text-white/80 hover:text-white transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Bottom overlay: format badge + reset */}
            <div className="absolute bottom-0 left-0 right-0 px-3 py-2 bg-gradient-to-t from-black/60 to-transparent flex items-end justify-between">
              <div className="flex items-center gap-1.5">
                <Film className="w-3 h-3 text-white/70" />
                <span className="text-[10px] font-semibold text-white/90">Video Reference</span>
                {hasStructure && d.structure && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/20 text-white/80 border border-white/20">
                    {d.structure.detected_format}
                  </span>
                )}
              </div>
              <button onClick={reset} className="nodrag text-[10px] text-white/60 hover:text-white transition-colors">
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
                  className="nodrag w-full flex items-center justify-between px-3 py-2.5 border-b border-border/40 hover:bg-muted/20 transition-colors"
                >
                  <span className="text-xs font-semibold text-foreground/80">Transcript</span>
                  {showTranscript
                    ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                    : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                </button>
                {showTranscript && (
                  <div className="px-3 py-2.5 border-b border-border/40 bg-muted/10 nowheel" style={{ maxHeight: "200px", overflowY: "auto" }}>
                    <p className="text-[11px] text-foreground/80 leading-relaxed whitespace-pre-wrap">{d.transcription}</p>
                  </div>
                )}
              </div>
            )}

            {/* ── "Generate Visual Breakdown" button ── */}
            {hasTranscript && !hasStructure && (
              <div className="px-3 py-3">
                <button
                  onClick={analyzeStructure}
                  disabled={stage === "analyzing"}
                  className="nodrag w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-primary/10 border border-primary/25 text-primary/80 hover:bg-primary/20 hover:text-primary transition-colors disabled:opacity-50 text-xs font-semibold"
                >
                  {stage === "analyzing"
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing...</>
                    : <><Sparkles className="w-3.5 h-3.5" /> Generate Visual Breakdown</>}
                </button>
              </div>
            )}

            {/* ── Dropdown 2: Visual Breakdown ── */}
            {hasStructure && d.structure && (
              <div>
                <button
                  onClick={() => setShowBreakdown(v => !v)}
                  className="nodrag w-full flex items-center justify-between px-3 py-2.5 border-b border-border/40 hover:bg-muted/20 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-foreground/80">Visual Breakdown</span>
                    {/* Section toggle chips inline */}
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
                  </div>
                  {showBreakdown
                    ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                    : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                </button>

                {showBreakdown && (
                  <div className="px-3 py-2.5 space-y-3 border-b border-border/40 nowheel" style={{ maxHeight: "360px", overflowY: "auto" }}>
                    {d.structure.sections.map((sec, i) => {
                      const c = SECTION_COLORS[sec.section] || SECTION_COLORS.body;
                      return (
                        <div key={i} className={`rounded-xl border ${c.border} ${c.bg} overflow-hidden`}>
                          {/* Section label */}
                          <div className="px-3 py-1.5 border-b border-white/5">
                            <span className={`text-[10px] font-bold uppercase ${c.accent}`}>{c.label}</span>
                          </div>

                          {/* What is said */}
                          <div className="px-3 py-2">
                            <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">What is said</p>
                            <p className="text-[11px] text-foreground/90 leading-relaxed">{sec.actor_text}</p>
                          </div>

                          {/* Visual — what is shown */}
                          {sec.visual_cue && (
                            <div className="px-3 py-2 border-t border-white/5 bg-black/5">
                              <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Visual</p>
                              <p className="text-[11px] text-foreground/70 leading-relaxed italic">{sec.visual_cue}</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
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
                  className="nodrag flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-amber-500/30 bg-amber-500/8 text-amber-400 hover:bg-amber-500/15 text-[11px] font-medium transition-colors disabled:opacity-40"
                >
                  {savingVault ? <Loader2 className="w-3 h-3 animate-spin" /> : <Archive className="w-3 h-3" />}
                  {savingVault ? "Saving..." : "Save to Vault"}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      <Handle type="source" position={Position.Right} className="!bg-primary !border-primary/70" />
    </div>
  );
});

VideoNode.displayName = "VideoNode";
export default VideoNode;
