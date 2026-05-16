import { useState, useEffect } from "react";
import PageTransition from "@/components/PageTransition";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, ExternalLink,
  Archive, Wand2, Loader2, CheckCircle2,
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
import { CONTENT_FORMATS, nicheLabel } from "@/lib/video-taxonomy";

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
    hook_template?: string;
    content_type?: string | null;
    visual_pacing?: { cuts_per_minute?: number | null; tempo?: string | null };
  } | null;
  transcribed_at?: string | null;
  video_file_url: string | null;
  video_file_expires_at: string | null;
  analysis_status: "pending" | "analyzing" | "analyzed" | "failed";
  analysis_error: string | null;
  content_format: string | null;
  primary_niche: string | null;
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


const VPS_API = "https://connectacreators.com/api";

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
  const { clients } = useClients(!!user);
  const { showOutOfCreditsModal } = useOutOfCredits();

  const [video, setVideo] = useState<ViralVideo | null>(null);
  const [loading, setLoading] = useState(true);

  // Format detection state
  const [detectingFormat, setDetectingFormat] = useState(false);
  const [formatDetection, setFormatDetection] = useState<FormatDetection | null>(null);

  // Analyze flow state
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "caption" | "transcript" | "visual" | "hook" | "story" | "category"
  >("caption");

  // Hook template state (lazy-fetched / backfilled on first Hook tab view)
  const [hookTemplate, setHookTemplate] = useState<string | null>(null);
  const [templatizing, setTemplatizing] = useState(false);

  // Categorize backfill state
  const [categorizing, setCategorizing] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  // Save to Vault state
  const [saveClientId, setSaveClientId] = useState("");
  const [saveMode, setSaveMode] = useState<"idle" | "transcribing" | "analyzing" | "saving" | "done" | "error">("idle");

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

  // ==================== HOOK TEMPLATE (lazy backfill) ====================
  useEffect(() => {
    if (activeTab !== "hook" || !video) return;
    // Prefer framework_meta.hook_template if already cached.
    const cached = video.framework_meta?.hook_template;
    if (typeof cached === "string" && cached.length > 0) {
      setHookTemplate(cached);
      return;
    }
    if (video.analysis_status !== "analyzed" || !video.hook_text) {
      setHookTemplate(null);
      return;
    }
    if (templatizing || hookTemplate) return;
    setTemplatizing(true);
    (async () => {
      try {
        const token = await getAuthToken();
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/viral-video-templatize-hook`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ viral_video_id: video.id }),
          },
        );
        const body = await res.json();
        if (res.ok && body.hook_template) {
          setHookTemplate(body.hook_template);
        } else {
          setHookTemplate(null);
        }
      } catch {
        setHookTemplate(null);
      } finally {
        setTemplatizing(false);
      }
    })();
  }, [activeTab, video?.id, video?.framework_meta, video?.hook_text, video?.analysis_status]);

  // ==================== CATEGORY BACKFILL ====================
  // Auto-fire /viral-video-categorize on mount if analyzed but uncategorized.
  useEffect(() => {
    if (!video) return;
    if (video.analysis_status !== "analyzed") return;
    if (video.content_format && video.primary_niche) return;
    if (categorizing) return;
    setCategorizing(true);
    setCategoryError(null);
    (async () => {
      try {
        const token = await getAuthToken();
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/viral-video-categorize`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ viral_video_id: video.id }),
          },
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setCategoryError(err.message || err.error || `HTTP ${res.status}`);
        }
        // Row update flows through the existing realtime subscription.
      } catch (e: unknown) {
        setCategoryError(e instanceof Error ? e.message : "Categorize failed");
      } finally {
        setCategorizing(false);
      }
    })();
  }, [video?.id, video?.analysis_status, video?.content_format, video?.primary_niche]);

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
          video_file_url: video.video_file_url,
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
      <div className="editorial-page min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!video) return null;

  const outlierColor = getOutlierColor(video.outlier_score);

  return (
    <PageTransition className="editorial-page min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/85 backdrop-blur-md border-b border-border px-4 py-3 flex items-center gap-3">
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

            {/* Single compact metadata line */}
            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className={cn("font-semibold tabular-nums", video.outlier_score >= 10 ? "text-orange-400" : outlierColor)}>
                {fmtOutlier(video.outlier_score)}
              </span>
              <span>·</span>
              <span className="tabular-nums">{fmtViews(video.views_count)} views</span>
              <span>·</span>
              <span className="tabular-nums">{video.engagement_rate.toFixed(1)}%</span>
              <span>·</span>
              <span>{timeAgo(video.posted_at)}</span>
              {formatDetection && (() => {
                const fmt = formatDetection.format;
                const cfg: Record<string, { label: string; color: string }> = {
                  TALKING_HEAD: { label: "Talking Head", color: "text-blue-400" },
                  VOICEOVER: { label: "Voiceover", color: "text-purple-400" },
                  TEXT_STORY: { label: "Text Story", color: "text-orange-400" },
                };
                const c = cfg[fmt] || cfg.TALKING_HEAD;
                return (<><span>·</span><span className={c.color}>{c.label}</span></>);
              })()}
              {detectingFormat && !formatDetection && (
                <><span>·</span><span className="italic opacity-60">detecting format…</span></>
              )}
            </div>
          </div>

          {/* ===== RIGHT COLUMN: tabs (fills available height, scrolls internally) ===== */}
          <div className="flex flex-col min-w-0 min-h-0">

            {/* Tabs box — flex-1 with min-h-0 so it scrolls inside, not the page */}
            {/* Treat any row with a cached transcript as analyzed for display purposes.
                Legacy rows from the pre-unification single-step transcribe-video flow
                have transcript but analysis_status='pending' — the user already paid
                for that transcript, so show it instead of an Analyze prompt. */}
            <div className="flex-1 min-h-0 border border-border rounded-2xl flex flex-col overflow-hidden">
              {(video.analysis_status === "analyzed" || (video.transcript && video.transcript.trim().length > 0)) ? (
                <>
                  <div className="flex gap-2 border-b border-border px-4 flex-shrink-0 overflow-x-auto">
                    {(["caption", "transcript", "visual", "hook", "story", "category"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setActiveTab(t)}
                        className={cn(
                          "px-3 py-2.5 text-sm capitalize transition-colors whitespace-nowrap",
                          activeTab === t ? "text-foreground border-b-2 border-foreground" : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {t === "story" ? "Storytelling" : t === "visual" ? "Visual Layout" : t === "category" ? "Category" : t}
                      </button>
                    ))}
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto p-4 text-sm text-foreground/80 whitespace-pre-wrap">
                    {activeTab === "caption" && (video.caption ?? "(no caption)")}
                    {activeTab === "transcript" && (video.transcript ?? "(no transcript)")}
                    {activeTab === "visual" && renderVisualSegments(video.framework_meta)}
                    {activeTab === "hook" && (
                      templatizing ? (
                        <div className="flex items-center gap-2 text-muted-foreground italic">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Generating template…
                        </div>
                      ) : (hookTemplate ?? video.hook_text ?? "(no hook)")
                    )}
                    {activeTab === "story" && ((video.framework_meta?.body_structure as string) ?? "(no story format)")}
                    {activeTab === "category" && (
                      <div className="space-y-4">
                        {!video.content_format || !video.primary_niche ? (
                          <div className="flex items-center gap-2 text-muted-foreground italic">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            {categorizing ? "Categorizing…" : (categoryError ?? "Categorizing…")}
                          </div>
                        ) : (
                          <>
                            <div className="grid grid-cols-[80px_1fr] gap-y-2 text-sm">
                              <span className="text-muted-foreground">Format</span>
                              <span className="text-foreground font-medium">
                                {CONTENT_FORMATS.find((f) => f.slug === video.content_format)?.label ?? video.content_format}
                              </span>
                              <span className="text-muted-foreground">Niche</span>
                              <span className="text-foreground font-medium">
                                {nicheLabel(video.primary_niche ?? "")}
                              </span>
                            </div>
                            {Array.isArray(video.framework_meta?.niche_tags) && (video.framework_meta?.niche_tags ?? []).length > 0 && (
                              <div>
                                <div className="text-xs text-muted-foreground mb-2">Topics</div>
                                <div className="flex flex-wrap gap-1.5">
                                  {(video.framework_meta?.niche_tags ?? []).map((tag, idx) => (
                                    <span
                                      key={idx}
                                      className="px-2 py-0.5 rounded-full bg-muted text-xs text-muted-foreground"
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
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

        {/* ===== Action row: ghost buttons, right-aligned ===== */}
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">

          {/* Save to Vault */}
          {clientOptions.length === 1 ? (
            <Button
              onClick={handleSaveToVault}
              disabled={saveMode !== "idle"}
              variant="ghost"
              size="sm"
              className="gap-2"
            >
              {saveMode === "transcribing" || saveMode === "analyzing" || saveMode === "saving" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : saveMode === "done" ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <Archive className="w-4 h-4" />
              )}
              {saveMode === "idle" ? "Save to Vault" :
               saveMode === "transcribing" ? "Transcribing…" :
               saveMode === "analyzing" ? "Analyzing…" :
               saveMode === "saving" ? "Saving…" :
               saveMode === "done" ? "Saved" :
               saveMode === "error" ? "Failed — retry" : "Save to Vault"}
            </Button>
          ) : clientOptions.length > 1 ? (
            <div className="flex items-center gap-1">
              <select
                value={saveClientId}
                onChange={(e) => setSaveClientId(e.target.value)}
                className="h-8 rounded-md border border-border bg-background text-xs px-2"
              >
                <option value="">Vault…</option>
                {clientOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <Button
                onClick={handleSaveToVault}
                disabled={!saveClientId || saveMode !== "idle"}
                variant="ghost"
                size="sm"
                className="gap-2"
              >
                {saveMode === "transcribing" || saveMode === "analyzing" || saveMode === "saving" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : saveMode === "done" ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Archive className="w-4 h-4" />
                )}
                {saveMode === "idle" ? "Save" :
                 saveMode === "transcribing" ? "Transcribing…" :
                 saveMode === "analyzing" ? "Analyzing…" :
                 saveMode === "saving" ? "Saving…" :
                 saveMode === "done" ? "Saved" :
                 saveMode === "error" ? "Retry" : "Save"}
              </Button>
            </div>
          ) : null}

          {/* Remix Script */}
          {clientOptions.length === 1 ? (
            <Button onClick={handleRemixScript} variant="ghost" size="sm" className="gap-2">
              <Wand2 className="w-4 h-4" />
              Remix Script
            </Button>
          ) : clientOptions.length > 1 ? (
            <div className="flex items-center gap-1">
              <select
                value={remixClientId}
                onChange={(e) => setRemixClientId(e.target.value)}
                className="h-8 rounded-md border border-border bg-background text-xs px-2"
              >
                <option value="">Client…</option>
                {clientOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <Button onClick={handleRemixScript} disabled={!remixClientId} variant="ghost" size="sm" className="gap-2">
                <Wand2 className="w-4 h-4" />
                Remix
              </Button>
            </div>
          ) : null}

          {/* Open in Canvas */}
          <Button onClick={handleOpenInCanvas} variant="ghost" size="sm" className="gap-2">
            Open in Canvas
          </Button>
        </div>
      </div>
    </PageTransition>
  );
}
