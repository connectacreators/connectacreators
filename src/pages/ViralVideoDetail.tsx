import { useState, useEffect } from "react";
import PageTransition from "@/components/PageTransition";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, ExternalLink, Flame, TrendingUp, Eye, Zap, Clock,
  Archive, Wand2, Loader2, CheckCircle2, AlertCircle, Play,
  Mic, Film, AlignLeft, ScanSearch,
} from "lucide-react";
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

function proxyImg(url: string): string {
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=800&output=webp`;
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

// ==================== MAIN PAGE ====================
export default function ViralVideoDetail() {
  const { videoId } = useParams<{ videoId: string }>();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { clients, loading: clientsLoading } = useClients(!!user);
  const { showOutOfCreditsModal } = useOutOfCredits();

  const [video, setVideo] = useState<ViralVideo | null>(null);
  const [loading, setLoading] = useState(true);
  const [imgError, setImgError] = useState(false);
  const [videoSrc] = useState<string | null>(null);
  const [videoFailed] = useState(false);
  const [videoErrorStage] = useState<"cache" | "stream" | null>(null);

  // Format detection state
  const [detectingFormat, setDetectingFormat] = useState(false);
  const [formatDetection, setFormatDetection] = useState<FormatDetection | null>(null);

  // Save to Vault state
  const [saveClientId, setSaveClientId] = useState("");
  const [saveMode, setSaveMode] = useState<"idle" | "transcribing" | "analyzing" | "saving" | "done" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  // Remix state
  const [remixClientId, setRemixClientId] = useState("");

  // ==================== DATA FETCH ====================
  useEffect(() => {
    if (!videoId) return;
    supabase
      .from("viral_videos")
      .select("*")
      .eq("id", videoId)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          navigate("/viral-today");
          return;
        }
        const v = data as ViralVideo;
        setVideo(v);
        setLoading(false);
        // Restore cached detection if available
        if (v.format_detection) {
          setFormatDetection(v.format_detection);
        }
      });
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
        },
      },
    });
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

      {/* Main content */}
      <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col lg:flex-row gap-6">

        {/* ===== LEFT PANEL: Video Preview ===== */}
        <div className="w-full lg:w-[58%] space-y-4">

          {/* Video preview — thumbnail only, watch on platform */}
          <div className="relative bg-black rounded-2xl overflow-hidden" style={{ aspectRatio: "9/16", maxHeight: "520px" }}>
            {video.thumbnail_url && !imgError ? (
              <img
                src={proxyImg(video.thumbnail_url)}
                alt={video.caption?.slice(0, 60) || "video"}
                className="absolute inset-0 w-full h-full object-cover"
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-muted">
                <Play className="w-12 h-12 text-white/30" />
              </div>
            )}
            {/* Watch on platform button */}
            <a
              href={video.video_url ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/80 backdrop-blur-sm text-white px-5 py-2.5 rounded-full text-sm font-medium hover:bg-black/90 transition-all border border-white/10"
            >
              <ExternalLink className="w-4 h-4" />
              Watch on {video.platform === "instagram" ? "Instagram" : video.platform === "tiktok" ? "TikTok" : "YouTube"}
            </a>
          </div>

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
            <div className="p-4 rounded-xl bg-card border border-border">
              <p className="text-sm text-muted-foreground leading-relaxed">{video.caption}</p>
            </div>
          )}

          {/* Channel */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground font-medium">@{video.channel_username}</span>
            <span className="text-xs text-muted-foreground capitalize">{video.platform}</span>
          </div>
        </div>

        {/* ===== RIGHT PANEL: Actions ===== */}
        <div className="w-full lg:w-[42%] space-y-4">
          <h2 className="text-xl font-bold text-foreground">What would you like to do today?</h2>

          {/* ===== Card 1: Save to Vault ===== */}
          <div className="p-5 rounded-2xl border border-border bg-card space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                <Archive className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="font-semibold text-foreground text-sm">Save to Vault as Template</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  AI will transcribe the video and save its structure to your vault
                </p>
              </div>
            </div>

            {/* Client selector */}
            {clientOptions.length > 1 && (
              <select
                value={saveClientId}
                onChange={(e) => setSaveClientId(e.target.value)}
                className="w-full h-9 rounded-lg border border-border bg-background text-sm px-3 text-foreground"
              >
                <option value="">Select client vault...</option>
                {clientOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
            {clientOptions.length === 1 && (
              <p className="text-xs text-muted-foreground">
                Vault: <span className="text-foreground font-medium">{clientOptions[0].name}</span>
              </p>
            )}

            {/* Status / Button */}
            {saveMode === "idle" && (
              <Button
                onClick={handleSaveToVault}
                disabled={!saveClientId || clientsLoading}
                className="w-full bg-amber-500 hover:bg-amber-600 text-white"
              >
                <Archive className="w-4 h-4 mr-2" />
                Save to Vault
              </Button>
            )}
            {(saveMode === "transcribing" || saveMode === "analyzing" || saveMode === "saving") && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 rounded-lg bg-muted/50">
                <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                <span>
                  {saveMode === "transcribing" ? "Transcribing video..." :
                   saveMode === "analyzing" ? "Analyzing structure..." :
                   "Saving to vault..."}
                </span>
              </div>
            )}
            {saveMode === "done" && (
              <div className="flex items-center gap-2 text-sm text-emerald-400 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                Saved to Vault! You can now use this as a hook template in the Script Wizard.
              </div>
            )}
            {saveMode === "error" && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-destructive p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {saveError}
                </div>
                <Button
                  onClick={() => { setSaveMode("idle"); setSaveError(null); }}
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  Try Again
                </Button>
              </div>
            )}
          </div>

          {/* ===== Card 2: Remix as Script ===== */}
          <div className="p-5 rounded-2xl border border-border bg-card space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
                <Wand2 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-foreground text-sm">Remix as Original Script</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Use this video's structure to create a brand new script for a client
                </p>
              </div>
            </div>

            {/* Client selector */}
            {clientOptions.length > 1 && (
              <select
                value={remixClientId}
                onChange={(e) => setRemixClientId(e.target.value)}
                className="w-full h-9 rounded-lg border border-border bg-background text-sm px-3 text-foreground"
              >
                <option value="">Select client...</option>
                {clientOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
            {clientOptions.length === 1 && (
              <p className="text-xs text-muted-foreground">
                Client: <span className="text-foreground font-medium">{clientOptions[0].name}</span>
              </p>
            )}

            <Button
              onClick={handleRemixScript}
              disabled={!remixClientId || clientsLoading}
              className="w-full"
              variant="outline"
            >
              <Wand2 className="w-4 h-4 mr-2" />
              Remix Script with AI Wizard
            </Button>
          </div>

          {/* Info note */}
          <p className="text-xs text-muted-foreground text-center leading-relaxed">
            Remixing opens the AI Script Wizard pre-loaded with this video's structure.
            You'll choose your own topic and the AI will follow the same hook and body pattern.
          </p>
        </div>
      </div>
    </PageTransition>
  );
}
