import { useState, useEffect } from "react";
import PageTransition from "@/components/PageTransition";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, ExternalLink, Flame, TrendingUp, Eye, Zap, Clock,
  Archive, Wand2, Loader2, CheckCircle2, AlertCircle,
  Mic, Film, AlignLeft, ScanSearch,
} from "lucide-react";
import { ViralVideoPlayer } from "@/components/video/ViralVideoPlayer";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useClients, type Client } from "@/hooks/useClients";
import { supabase } from "@/integrations/supabase/client";
import { getAuthToken } from "@/lib/getAuthToken";
import { toast } from "sonner";
import { useOutOfCredits } from "@/contexts/OutOfCreditsContext";
import { cn } from "@/lib/utils";

// ==================== TYPES ====================
interface FormatDetection {
  format: "TALKING_HEAD" | "VOICEOVER" | "TEXT_STORY";
  confidence: number;
  detection_stage: string;
  detected_at: string;
  reason?: string;
  wizard_config: {
    suggested_format: string;
    prompt_hint: string;
    use_transcript_as_template: boolean;
  };
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
  format_detection: FormatDetection | null;
  transcript?: string | null;
  hook_text?: string | null;
  cta_text?: string | null;
  framework_meta?: {
    niche_tags?: string[];
    audience?: string;
    key_topics?: string[];
    body_structure?: string;
    content_type?: string | null;
    visual_pacing?: { cuts_per_minute?: number | null; tempo?: string | null };
  } | null;
  transcribed_at?: string | null;
  video_file_url: string | null;
  video_file_expires_at: string | null;
  analysis_status: "pending" | "analyzing" | "analyzed" | "failed";
  analysis_error: string | null;
}

interface ClientOption {
  id: string;
  name: string;
}

// ==================== HELPERS (same as ViralToday) ====================
function fmtViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function fmtOutlier(score: number): string {
  if (score >= 100) return `${Math.round(score)}x`;
  if (score >= 10) return `${score.toFixed(1)}x`;
  return `${score.toFixed(1)}x`;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}


function getOutlierColor(score: number): string {
  if (score >= 10) return "text-orange-400";
  if (score >= 5) return "text-emerald-400";
  if (score >= 2) return "text-green-400";
  if (score >= 1.5) return "text-lime-400";
  return "text-gray-400";
}

// ==================== STAT CARD ====================
function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: string; icon: any; color?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 p-3 rounded-xl bg-card border border-border">
      <Icon className={cn("w-4 h-4", color || "text-muted-foreground")} />
      <span className={cn("text-sm font-bold tabular-nums", color || "text-foreground")}>{value}</span>
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
    </div>
  );
}

const VPS_API = "https://connectacreators.com/api";

function getStreamUrl(video: ViralVideo): string {
  const url = video.video_url ?? "";
  // Always stream without caching to disk — pass nocache=1 so VPS streams but never saves mp4
  return `${VPS_API}/stream-reel?url=${encodeURIComponent(url)}&nocache=1`;
}

// ==================== HELPERS ====================
function renderVisualSegments(meta: Record<string, unknown> | null | undefined): string {
  if (!meta) return "(no visual breakdown)";
  const segments = (meta.visual_segments as Array<{
    start: number; end: number; description: string; text_on_screen: string[];
  }> | undefined) ?? [];
  if (segments.length === 0) return "(no visual breakdown)";
  return segments
    .map((s) => `[${s.start.toFixed(1)}s–${s.end.toFixed(1)}s] ${s.description}${s.text_on_screen.length ? `\n   text: ${s.text_on_screen.join(" | ")}` : ""}`)
    .join("\n\n");
}

// ==================== MAIN PAGE ====================
export default function ViralVideoDetail() {
  const { videoId } = useParams<{ videoId: string }>();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { clients, loading: clientsLoading } = useClients(!!user);
  const { showOutOfCreditsModal } = useOutOfCredits();

  const [video, setVideo] = useState<ViralVideo | null>(null);
  const [loading, setLoading] = useState(true);

  // Format detection state
  const [detectingFormat, setDetectingFormat] = useState(false);
  const [formatDetection, setFormatDetection] = useState<FormatDetection | null>(null);

  // Analyze flow state
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"transcript" | "visual" | "hook" | "story">("transcript");

  // Save to Vault state
  const [saveClientId, setSaveClientId] = useState("");
  const [saveMode, setSaveMode] = useState<"idle" | "transcribing" | "analyzing" | "saving" | "done" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  // Remix state
  const [remixClientId, setRemixClientId] = useState("");

  // ==================== DATA FETCH + REALTIME ====================
  useEffect(() => {
    if (!videoId) return;
    let mounted = true;

    (async () => {
      const { data, error } = await supabase
        .from("viral_videos")
        .select("*")
        .eq("id", videoId)
        .single();
      if (!mounted) return;
      if (error || !data) {
        navigate("/viral-today");
        return;
      }
      const v = data as ViralVideo;
      setVideo(v);
      setLoading(false);
      // Restore cached detection if available
      if (v.format_detection) setFormatDetection(v.format_detection);
    })();

    const channel = supabase
      .channel(`viral_videos:${videoId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "viral_videos", filter: `id=eq.${videoId}` },
        (payload) => {
          if (mounted) {
            const fresh = payload.new as ViralVideo;
            setVideo(fresh);
            if (fresh.format_detection) setFormatDetection(fresh.format_detection);
          }
        },
      )
      .subscribe();

    return () => { mounted = false; supabase.removeChannel(channel); };
  }, [videoId, navigate]);

  // ==================== FORMAT DETECTION ====================
  useEffect(() => {
    if (!video || video.format_detection || detectingFormat) return;
    if (!video.thumbnail_url) return;

    setDetectingFormat(true);
    getAuthToken().then((token) => {
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/detect-video-format`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          video_id: video.id,
          thumbnail_url: video.thumbnail_url,
          caption: video.caption,
        }),
      })
        .then((r) => r.json())
        .then((result: FormatDetection) => {
          if (result.format) setFormatDetection(result);
        })
        .catch(() => { /* silent fail — detection is non-blocking */ })
        .finally(() => setDetectingFormat(false));
    });
  }, [video]);

  // ==================== CLIENT OPTIONS ====================
  const isStaff = isAdmin;
  const clientOptions: ClientOption[] = isStaff
    ? clients.map((c) => ({ id: c.id, name: c.name || c.id }))
    : (() => {
        const own = clients.find((c: Client) => c.user_id === user?.id);
        return own ? [{ id: own.id, name: own.name || own.id }] : [];
      })();

  // Auto-select if only one client
  useEffect(() => {
    if (clientOptions.length === 1) {
      setSaveClientId(clientOptions[0].id);
      setRemixClientId(clientOptions[0].id);
    }
  }, [clientOptions.length]);

  // ==================== SAVE TO VAULT ====================
  const handleSaveToVault = async () => {
    if (!video || !saveClientId) return;
    setSaveMode("transcribing");
    setSaveError(null);

    try {
      const token = await getAuthToken();
      const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
      const baseUrl = import.meta.env.VITE_SUPABASE_URL;

      // Step 1: Transcribe
      const transcribeRes = await fetch(`${baseUrl}/functions/v1/transcribe-video`, {
        method: "POST",
        headers,
        body: JSON.stringify({ url: video.video_url }),
      });
      if (!transcribeRes.ok) {
        const err = await transcribeRes.json().catch(() => ({}));
        if (err.insufficient_credits) {
          showOutOfCreditsModal();
          setSaveMode("idle");
          return;
        }
        throw new Error(err.error || "Transcription failed");
      }
      const { transcription } = await transcribeRes.json();

      // Step 2: Analyze
      setSaveMode("analyzing");
      const analyzeRes = await fetch(`${baseUrl}/functions/v1/ai-build-script`, {
        method: "POST",
        headers,
        body: JSON.stringify({ step: "analyze-template", transcription }),
      });
      if (!analyzeRes.ok) {
        const err = await analyzeRes.json().catch(() => ({}));
        if (err.insufficient_credits) {
          showOutOfCreditsModal();
          setSaveMode("idle");
          return;
        }
        throw new Error(err.error || "Analysis failed");
      }
      const analysis = await analyzeRes.json();

      // Step 3: Save
      setSaveMode("saving");
      const { error: insertError } = await supabase.from("vault_templates").insert({
        client_id: saveClientId,
        name: analysis.suggested_name || `@${video.channel_username} template`,
        source_url: video.video_url,
        thumbnail_url: video.thumbnail_url,
        transcription,
        structure_analysis: analysis.structure_analysis || null,
        template_lines: analysis.template_lines || null,
      });
      if (insertError) throw insertError;

      setSaveMode("done");
      toast.success("Saved to Vault!");
    } catch (e: any) {
      setSaveError(e.message || "Failed to save to vault");
      setSaveMode("error");
    }
  };

  // ==================== REMIX SCRIPT ====================
  const handleRemixScript = () => {
    if (!video || !remixClientId) return;
    navigate(`/clients/${remixClientId}/scripts`, {
      state: {
        remixVideo: {
          id: video.id,
          url: video.video_url,
          thumbnail_url: video.thumbnail_url,
          caption: video.caption,
          channel_username: video.channel_username,
          platform: video.platform,
          formatDetection: formatDetection ?? null,
          // Cached analysis — skips re-transcription/re-analysis on canvas
          transcription: video.transcript ?? null,
          hookText: video.hook_text ?? null,
          ctaText: video.cta_text ?? null,
          frameworkMeta: video.framework_meta ?? null,
          isPreAnalyzed: !!video.transcribed_at,
        },
      },
    });
  };

  // ==================== ANALYZE ====================
  const handleAnalyze = async () => {
    if (!video) return;
    setAnalyzing(true);
    setAnalyzeError(null);
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
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 402) {
          showOutOfCreditsModal();
          return;
        }
        throw new Error(err.message || err.error || `HTTP ${res.status}`);
      }
      // Row updates flow via realtime subscription — no manual state update.
    } catch (e: any) {
      setAnalyzeError(e.message || "Analyze failed");
      toast.error(e.message || "Analyze failed");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleRefreshFile = async () => {
    if (!video) return;
    try {
      const token = await getAuthToken();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/viral-video-refresh-file`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ viral_video_id: video.id }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 410) {
          toast.error("Source video is no longer available");
          return;
        }
        throw new Error(err.message || "Refresh failed");
      }
      toast.success("Refreshing… check back in a few seconds");
    } catch (e: any) {
      toast.error(e.message || "Refresh failed");
    }
  };

  const handleOpenInCanvas = () => {
    if (!video) return;
    navigate(`/canvas?attach=${video.id}`);
  };

  // ==================== RENDER ====================
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!video) return null;

  const outlierColor = getOutlierColor(video.outlier_score);

  return (
    <PageTransition className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            @{video.channel_username}
          </p>
        </div>
        <a
          href={video.video_url ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Open original
        </a>
      </div>

      {/* Main content — single-view no-scroll layout */}
      <div className="max-w-7xl mx-auto px-4 py-4">
        {/* Two-column grid: fixed 360px player col + flex-1 tabs col */}
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5 lg:h-[calc(100vh-9rem)]">

          {/* ===== LEFT COLUMN: Player + stats + badges + caption ===== */}
          <div className="flex flex-col gap-3 min-w-0">
            {/* ViralVideoPlayer — plays file_url or falls back to VPS proxy stream */}
            <ViralVideoPlayer
              src={video.video_file_url}
              fallbackProxyUrl={video.video_url ? `${VPS_API}/stream-reel?url=${encodeURIComponent(video.video_url)}&nocache=1` : null}
              aspectRatio="auto"
              onExpired={handleRefreshFile}
            />

            {/* Stats grid */}
            <div className="grid grid-cols-4 gap-2">
              <StatCard
                label="Outlier"
                value={fmtOutlier(video.outlier_score)}
                icon={video.outlier_score >= 10 ? Flame : TrendingUp}
                color={video.outlier_score >= 10 ? "text-orange-400" : outlierColor}
              />
              <StatCard
                label="Views"
                value={fmtViews(video.views_count)}
                icon={Eye}
              />
              <StatCard
                label="Engagement"
                value={`${video.engagement_rate.toFixed(1)}%`}
                icon={Zap}
              />
              <StatCard
                label="Posted"
                value={timeAgo(video.posted_at)}
                icon={Clock}
              />
            </div>

            {/* Format Detection Badge */}
            {detectingFormat && !formatDetection && (
              <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-muted/50 border border-border text-sm text-muted-foreground">
                <ScanSearch className="w-4 h-4 animate-pulse flex-shrink-0" />
                Analyzing video format...
              </div>
            )}
            {formatDetection && (() => {
              const fmt = formatDetection.format;
              const pct = Math.round(formatDetection.confidence * 100);
              const cfg: Record<string, { icon: any; label: string; color: string; bg: string; border: string }> = {
                TALKING_HEAD: { icon: Mic, label: "Talking Head", color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/25" },
                VOICEOVER: { icon: Film, label: "Voiceover / B-Roll", color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/25" },
                TEXT_STORY: { icon: AlignLeft, label: "Text Story", color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/25" },
              };
              const c = cfg[fmt] || cfg.TALKING_HEAD;
              return (
                <div className={cn("flex items-center gap-2.5 px-4 py-2.5 rounded-xl border text-sm", c.bg, c.border)}>
                  <c.icon className={cn("w-4 h-4 flex-shrink-0", c.color)} />
                  <span className={cn("font-semibold", c.color)}>{c.label}</span>
                  <span className="text-muted-foreground text-xs ml-1">{pct}% confidence</span>
                  {fmt === "TEXT_STORY" && (
                    <span className="ml-auto text-xs text-orange-400/80">Minimal spoken audio detected</span>
                  )}
                </div>
              );
            })()}

            {/* Caption */}
            {video.caption && (
              <div className="p-3 rounded-xl bg-card border border-border">
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{video.caption}</p>
              </div>
            )}

            {/* Channel line */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground font-medium">@{video.channel_username}</span>
              <span className="text-muted-foreground capitalize">{video.platform}</span>
            </div>
          </div>

          {/* ===== RIGHT COLUMN: Analyze / tabs (fills available height, scrolls internally) ===== */}
          <div className="flex flex-col min-w-0 min-h-0">
            {/* Summary line */}
            <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
              {video.caption || "(no caption)"}
            </p>

            {/* Tabs box — flex-1 with min-h-0 so it scrolls inside, not the page */}
            <div className="flex-1 min-h-0 border border-border rounded-2xl flex flex-col overflow-hidden">
              {video.analysis_status === "analyzed" ? (
                <>
                  <div className="flex gap-2 border-b border-border px-4 flex-shrink-0">
                    {(["transcript", "visual", "hook", "story"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setActiveTab(t)}
                        className={cn(
                          "px-3 py-2.5 text-sm capitalize transition-colors whitespace-nowrap",
                          activeTab === t ? "text-foreground border-b-2 border-foreground" : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {t === "story" ? "Storytelling" : t === "visual" ? "Visual Layout" : t}
                      </button>
                    ))}
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto p-4 text-sm text-foreground/80 whitespace-pre-wrap">
                    {activeTab === "transcript" && (video.transcript ?? "(no transcript)")}
                    {activeTab === "visual" && renderVisualSegments(video.framework_meta)}
                    {activeTab === "hook" && (video.hook_text ?? "(no hook)")}
                    {activeTab === "story" && ((video.framework_meta?.body_structure as string) ?? "(no story format)")}
                  </div>
                  {!video.video_file_url && (
                    <button
                      onClick={handleRefreshFile}
                      className="text-xs text-muted-foreground underline px-4 py-2 border-t border-border text-left flex-shrink-0 hover:text-foreground transition-colors"
                    >
                      Video file expired — click to refresh
                    </button>
                  )}
                </>
              ) : video.analysis_status === "analyzing" ? (
                <div className="flex-1 flex items-center justify-center gap-3">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">Analyzing… 30-90 seconds</span>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center p-6">
                  <button
                    onClick={handleAnalyze}
                    disabled={analyzing}
                    className="px-6 py-3 bg-foreground text-background rounded-xl disabled:opacity-50 text-sm font-semibold"
                  >
                    {analyzing ? "Starting…" : video.analysis_status === "failed" ? "Retry analyze (50 credits)" : "Analyze video (50 credits)"}
                  </button>
                </div>
              )}
            </div>

            {/* Error lines */}
            {(video.analysis_status === "failed" && video.analysis_error) && (
              <div className="mt-2 text-xs text-destructive">{video.analysis_error}</div>
            )}
            {analyzeError && <div className="mt-2 text-xs text-destructive">{analyzeError}</div>}
          </div>
        </div>

        {/* ===== Action row: compact horizontal cards under the grid ===== */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">

          {/* Card 1: Save to Vault */}
          <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card">
            <div className="w-9 h-9 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
              <Archive className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">Save to Vault</p>
              {clientOptions.length > 1 ? (
                <select
                  value={saveClientId}
                  onChange={(e) => setSaveClientId(e.target.value)}
                  className="mt-0.5 w-full h-6 rounded border border-border bg-background text-[11px] px-1 text-foreground"
                >
                  <option value="">Select vault...</option>
                  {clientOptions.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              ) : clientOptions.length === 1 ? (
                <p className="text-[11px] text-muted-foreground truncate">{clientOptions[0].name}</p>
              ) : null}
            </div>
            <div className="flex-shrink-0">
              {saveMode === "idle" && (
                <Button
                  onClick={handleSaveToVault}
                  disabled={!saveClientId || clientsLoading}
                  size="sm"
                  className="bg-amber-500 hover:bg-amber-600 text-white text-xs h-7 px-2.5"
                >
                  Save
                </Button>
              )}
              {(saveMode === "transcribing" || saveMode === "analyzing" || saveMode === "saving") && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span className="hidden sm:inline">
                    {saveMode === "transcribing" ? "Transcribing…" : saveMode === "analyzing" ? "Analyzing…" : "Saving…"}
                  </span>
                </div>
              )}
              {saveMode === "done" && (
                <div className="flex items-center gap-1 text-xs text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Saved!</span>
                </div>
              )}
              {saveMode === "error" && (
                <button
                  onClick={() => { setSaveMode("idle"); setSaveError(null); }}
                  className="text-xs text-destructive underline"
                >
                  Retry
                </button>
              )}
            </div>
          </div>

          {/* Card 2: Remix Script */}
          <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card">
            <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
              <Wand2 className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">Remix Script</p>
              {clientOptions.length > 1 ? (
                <select
                  value={remixClientId}
                  onChange={(e) => setRemixClientId(e.target.value)}
                  className="mt-0.5 w-full h-6 rounded border border-border bg-background text-[11px] px-1 text-foreground"
                >
                  <option value="">Select client...</option>
                  {clientOptions.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              ) : clientOptions.length === 1 ? (
                <p className="text-[11px] text-muted-foreground truncate">{clientOptions[0].name}</p>
              ) : null}
            </div>
            <Button
              onClick={handleRemixScript}
              disabled={!remixClientId || clientsLoading}
              size="sm"
              variant="outline"
              className="flex-shrink-0 text-xs h-7 px-2.5"
            >
              <Wand2 className="w-3.5 h-3.5 mr-1" />
              Remix
            </Button>
          </div>

          {/* Card 3: Open in Canvas */}
          <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card">
            <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
              <ExternalLink className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">Open in Canvas</p>
              <p className="text-[11px] text-muted-foreground truncate">AI Canvas workspace</p>
            </div>
            <button
              onClick={handleOpenInCanvas}
              className="flex-shrink-0 px-2.5 h-7 border border-border rounded-md text-xs hover:bg-muted/50 transition-colors"
            >
              Open
            </button>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
