import { useState, useEffect } from "react";
import PageTransition from "@/components/PageTransition";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, ExternalLink,
  Archive, Wand2, Loader2, CheckCircle2, Pencil, Check, X as XIcon,
  NotebookPen,
} from "lucide-react";
import UseInScriptModal from "@/components/viral-today/UseInScriptModal";
import { videoUrlLookupVariants } from "@/lib/canonicalize-video-url";
import { ViralVideoPlayer } from "@/components/video/ViralVideoPlayer";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useClients, type Client } from "@/hooks/useClients";
import { supabase } from "@/integrations/supabase/client";
import { getAuthToken } from "@/lib/getAuthToken";
import { toast } from "sonner";
import { useOutOfCredits } from "@/contexts/OutOfCreditsContext";
import { cn } from "@/lib/utils";
import { CONTENT_FORMATS, nicheLabel } from "@/lib/video-taxonomy";
import { fmtViews, fmtOutlier, timeAgo, getOutlierColor } from "@/lib/viral-card-utils";

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

// Formatting + color helpers are imported from viral-card-utils — this page
// used to keep local copies with DIFFERENT thresholds, so the same video got
// a different outlier color here than in the grid.

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
  const [saveMode, setSaveMode] = useState<"idle" | "saving" | "done" | "error">("idle");

  // Remix state
  const [remixClientId, setRemixClientId] = useState("");

  // Use-in-Script state: modal open + which scripts already use this video.
  const [useInScriptOpen, setUseInScriptOpen] = useState(false);
  const [usedInScripts, setUsedInScripts] = useState<{ id: string; title: string | null }[]>([]);

  // Inline-edit state for channel_username + caption (rows scraped from URLs
  // sometimes have unknown handles or no caption — let the user fix it).
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [editingCaption, setEditingCaption] = useState(false);
  const [captionDraft, setCaptionDraft] = useState("");

  const saveUsername = async () => {
    if (!video) return;
    const next = usernameDraft.trim().replace(/^@/, "");
    if (!next || next === video.channel_username) { setEditingUsername(false); return; }
    const { error } = await supabase
      .from("viral_videos")
      .update({ channel_username: next })
      .eq("id", video.id);
    if (error) { toast.error(`Couldn't save: ${error.message}`); return; }
    setVideo({ ...video, channel_username: next });
    setEditingUsername(false);
    toast.success(`Handle set to @${next}`);
  };

  const saveCaption = async () => {
    if (!video) return;
    const next = captionDraft.trim();
    if (next === (video.caption ?? "")) { setEditingCaption(false); return; }
    const { error } = await supabase
      .from("viral_videos")
      .update({ caption: next || null })
      .eq("id", video.id);
    if (error) { toast.error(`Couldn't save: ${error.message}`); return; }
    setVideo({ ...video, caption: next || null });
    setEditingCaption(false);
    toast.success("Caption saved");
  };

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
  // Staff dropdowns (Use in Script / Remix / Vault) list ONLY Connecta+
  // clients — same definition as the sidebar client selector: users holding
  // the connecta_plus role, excluding sub-profiles. The full clients table is
  // mostly test rows and non-content accounts.
  const isStaff = isAdmin;
  const [plusClients, setPlusClients] = useState<ClientOption[]>([]);
  useEffect(() => {
    if (!isStaff) return;
    let cancelled = false;
    (async () => {
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "connecta_plus");
      const userIds = (roleRows ?? []).map((r) => r.user_id);
      if (cancelled || userIds.length === 0) return;
      const { data } = await supabase
        .from("clients")
        .select("id, name")
        .in("user_id", userIds)
        .is("parent_subscriber_id", null)
        .order("name");
      if (cancelled || !data) return;
      setPlusClients(data.map((c) => ({ id: c.id, name: c.name || c.id })));
    })();
    return () => {
      cancelled = true;
    };
  }, [isStaff]);

  const clientOptions: ClientOption[] = isStaff
    ? (() => {
        // Staff see the Connecta+ client list, but a staff member's OWN client
        // row isn't a Connecta+ account so it's absent — let them pick
        // themselves too (e.g. Roberto remixing a script for his own account).
        const own = clients.find((c: Client) => c.user_id === user?.id);
        if (own && !plusClients.some((o) => o.id === own.id)) {
          return [{ id: own.id, name: own.name || own.id }, ...plusClients];
        }
        return plusClients;
      })()
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
    if (!video || !saveClientId || !user) return;
    setSaveMode("saving");
    try {
      // Detect pre-existing row so we can give the right toast.
      const { data: existing } = await supabase
        .from("saved_videos")
        .select("id")
        .eq("client_id", saveClientId)
        .eq("viral_video_id", video.id)
        .maybeSingle();

      if (existing) {
        setSaveMode("done");
        toast.info("Already saved to this client's Vault");
        return;
      }

      const { error: insertError } = await supabase
        .from("saved_videos")
        .insert({ client_id: saveClientId, viral_video_id: video.id, saved_by: user.id });
      if (insertError) throw insertError;

      setSaveMode("done");
      toast.success("Saved to Vault!");
    } catch (e: any) {
      console.error(e);
      setSaveMode("error");
      toast.error(e.message || "Failed to save");
    }
  };

  // ==================== USED-IN-SCRIPTS INDICATOR ====================
  // Which scripts already reference this video in either inspiration lane.
  // Matches both the canonicalized URL (what UseInScriptModal writes) and the
  // raw URL (legacy manual pastes). Re-runs when the modal closes so the
  // indicator reflects fresh attachments.
  useEffect(() => {
    if (!video?.video_url || useInScriptOpen) return;
    // Every spelling a script might have stored (IG /p/ vs /reel/, raw paste).
    const urls = videoUrlLookupVariants(video.video_url);
    let cancelled = false;
    (async () => {
      const queries = [
        ...urls.map((u) =>
          supabase
            .from("scripts")
            .select("id, title")
            .contains("inspiration_urls", [u])
            .is("deleted_at", null)
            .neq("status", "draft"),
        ),
        supabase
          .from("scripts")
          .select("id, title")
          .in("format_reference_url", urls)
          .is("deleted_at", null)
          .neq("status", "draft"),
      ];
      const results = await Promise.all(queries);
      if (cancelled) return;
      const byId = new Map<string, { id: string; title: string | null }>();
      for (const r of results) {
        for (const s of (r.data ?? []) as { id: string; title: string | null }[]) byId.set(s.id, s);
      }
      setUsedInScripts(Array.from(byId.values()));
    })();
    return () => {
      cancelled = true;
    };
  }, [video?.video_url, useInScriptOpen]);

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
        if (res.status === 409 && err.error === "transcribe_in_progress") {
          toast.info("Auto-transcribing first — try Analyze again in a moment.");
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
          onClick={() => {
            // On a direct/shared link there's no in-app history — navigate(-1)
            // would leave the app entirely. react-router stamps an idx on
            // history.state; idx 0 means this is the first in-app entry.
            if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
            else navigate("/viral-today");
          }}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="flex-1 min-w-0">
          {editingUsername ? (
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-muted-foreground">@</span>
              <input
                autoFocus
                value={usernameDraft}
                onChange={(e) => setUsernameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveUsername();
                  if (e.key === "Escape") setEditingUsername(false);
                }}
                placeholder="username"
                className="text-sm font-medium text-foreground bg-transparent border-b border-border focus:border-foreground outline-none w-40"
              />
              <button onClick={saveUsername} className="p-1 text-muted-foreground hover:text-foreground" title="Save"><Check className="w-3.5 h-3.5" /></button>
              <button onClick={() => setEditingUsername(false)} className="p-1 text-muted-foreground hover:text-foreground" title="Cancel"><XIcon className="w-3.5 h-3.5" /></button>
            </div>
          ) : (
            <button
              onClick={() => { setUsernameDraft(video.channel_username === "unknown" ? "" : video.channel_username); setEditingUsername(true); }}
              className={cn(
                "group inline-flex items-center gap-1.5 text-sm font-medium truncate transition-colors",
                video.channel_username === "unknown"
                  ? "text-muted-foreground italic hover:text-foreground"
                  : "text-foreground hover:text-foreground/80",
              )}
              title="Click to edit handle"
            >
              <span className="truncate">@{video.channel_username}</span>
              <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity flex-shrink-0" />
            </button>
          )}
        </div>
        {video.video_url && (
          <a
            href={video.video_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open original
          </a>
        )}
      </div>

      {/* Main content — single-view no-scroll layout. Mobile: extra bottom
          padding clears the fixed action bar. */}
      <div className="max-w-7xl mx-auto px-4 py-4 pb-24 md:pb-4">
        {/* Two-column grid: fixed 360px player col + flex-1 tabs col */}
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5 lg:h-[calc(100vh-9rem)]">

          {/* ===== LEFT COLUMN: Player + stats + badges + caption ===== */}
          <div className="flex flex-col gap-3 min-w-0">
            {/* ViralVideoPlayer — plays file_url or falls back to VPS proxy stream.
                Mobile: cap the player's width so a portrait video tops out
                around 60vh instead of pushing the analysis below the fold. */}
            <div className="w-full max-w-[280px] mx-auto md:max-w-none">
              <ViralVideoPlayer
                src={video.video_file_url}
                fallbackProxyUrl={video.video_url ? `${VPS_API}/stream-reel?url=${encodeURIComponent(video.video_url)}&nocache=1` : null}
                aspectRatio="auto"
                onExpired={handleRefreshFile}
              />
            </div>

            {/* Single compact metadata line */}
            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className={cn("font-semibold tabular-nums", outlierColor)}>
                {fmtOutlier(video.outlier_score)}
              </span>
              <span>·</span>
              <span className="tabular-nums">{fmtViews(video.views_count)} views</span>
              <span>·</span>
              <span className="tabular-nums">{video.engagement_rate.toFixed(1)}%</span>
              <span>·</span>
              <span>{timeAgo(video.posted_at) || "—"}</span>
              {formatDetection && (() => {
                const fmt = formatDetection.format;
                // Plain metadata — the old per-format blue/purple/orange added
                // colors that ignored the account's selected palette.
                const LABELS: Record<string, string> = {
                  TALKING_HEAD: "Talking Head",
                  VOICEOVER: "Voiceover",
                  TEXT_STORY: "Text Story",
                };
                return (<><span>·</span><span className="text-foreground/80">{LABELS[fmt] ?? "Talking Head"}</span></>);
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
                  <div className="relative flex-shrink-0">
                    {/* Right edge fade — mobile cue that the tab strip scrolls */}
                    <div className="md:hidden pointer-events-none absolute right-0 top-0 h-full w-8 bg-gradient-to-l from-background to-transparent z-10" aria-hidden />
                  <div className="flex gap-2 border-b border-border px-4 overflow-x-auto">
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
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto p-4 text-sm text-foreground/80 whitespace-pre-wrap">
                    {activeTab === "caption" && (editingCaption ? (
                      <div className="flex flex-col gap-2 not-prose">
                        <textarea
                          autoFocus
                          value={captionDraft}
                          onChange={(e) => setCaptionDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") setEditingCaption(false);
                          }}
                          placeholder="Paste the original caption…"
                          className="w-full min-h-[180px] resize-y bg-transparent border border-border focus:border-foreground outline-none rounded-lg p-3 text-sm leading-relaxed"
                        />
                        <div className="flex items-center gap-2">
                          <button onClick={saveCaption} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-foreground text-background rounded-md text-xs font-medium hover:opacity-90">
                            <Check className="w-3.5 h-3.5" /> Save
                          </button>
                          <button onClick={() => setEditingCaption(false)} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setCaptionDraft(video.caption ?? ""); setEditingCaption(true); }}
                        className="group block w-full text-left hover:bg-muted/20 rounded-md -m-2 p-2 transition-colors"
                        title="Click to edit caption"
                      >
                        <span className={cn(video.caption ? "" : "text-muted-foreground italic")}>
                          {video.caption ?? "(no caption — click to add one)"}
                        </span>
                        <Pencil className="inline-block ml-2 w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity align-baseline" />
                      </button>
                    ))}
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
                      {video.video_file_expires_at
                        ? "Video file expired — click to refresh"
                        : "Fetch video file for playback"}
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
                    title="Costs 50 credits (free for staff)"
                    className="px-6 py-3 bg-foreground text-background rounded-xl disabled:opacity-50 text-sm font-semibold"
                  >
                    {analyzing ? "Starting…" : video.analysis_status === "failed" ? "Retry analyze" : "Analyze video"}
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

        {/* ===== Action row: ghost buttons, right-aligned. Mobile: fixed
            bottom bar so Use in Script / Save are always one thumb-tap away. ===== */}
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2 max-md:fixed max-md:bottom-0 max-md:inset-x-0 max-md:z-30 max-md:m-0 max-md:px-3 max-md:py-2 max-md:pb-[calc(0.5rem+env(safe-area-inset-bottom))] max-md:bg-card/95 max-md:backdrop-blur-md max-md:border-t max-md:border-border">

          {/* Used-in indicator (left side of the row; desktop only — the
              mobile bar keeps just the actions) */}
          {usedInScripts.length > 0 && (
            <span
              className="hidden md:inline mr-auto text-xs text-muted-foreground"
              title={usedInScripts.map((s) => s.title ?? "Untitled").join("\n")}
            >
              Used in {usedInScripts.length} script{usedInScripts.length !== 1 ? "s" : ""}
            </span>
          )}

          {/* Use in Script — attach to an existing script (idea / format lane)
              or create a new script pre-linked to this video. */}
          {clientOptions.length > 0 && video.video_url && (
            <Button onClick={() => setUseInScriptOpen(true)} variant="ghost" size="sm" className="gap-2">
              <NotebookPen className="w-4 h-4" />
              Use in Script
            </Button>
          )}

          {/* Save to Vault */}
          {clientOptions.length === 1 ? (
            <Button
              onClick={handleSaveToVault}
              disabled={saveMode === "saving"}
              variant="ghost"
              size="sm"
              className="gap-2"
            >
              {saveMode === "saving" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : saveMode === "done" ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <Archive className="w-4 h-4" />
              )}
              {saveMode === "saving" ? "Saving…" :
               saveMode === "done" ? "Saved" :
               saveMode === "error" ? "Failed — retry" : "Save to Vault"}
            </Button>
          ) : clientOptions.length > 1 ? (
            <div className="flex items-center gap-1">
              {/* Themed select (Radix) — value must be non-empty, so the
                  placeholder carries the unselected state. */}
              <Select
                value={saveClientId || undefined}
                onValueChange={(v) => {
                  setSaveClientId(v);
                  // A previous "Saved ✓" belongs to the OLD client — reset so
                  // the button doesn't claim client B is saved.
                  setSaveMode("idle");
                }}
              >
                <SelectTrigger className="h-8 w-auto min-w-[120px] text-xs px-2">
                  <SelectValue placeholder="Vault…" />
                </SelectTrigger>
                <SelectContent>
                  {clientOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={handleSaveToVault}
                disabled={!saveClientId || saveMode === "saving"}
                variant="ghost"
                size="sm"
                className="gap-2"
              >
                {saveMode === "saving" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : saveMode === "done" ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Archive className="w-4 h-4" />
                )}
                {saveMode === "saving" ? "Saving…" :
                 saveMode === "done" ? "Saved" :
                 saveMode === "error" ? "Retry" : "Save"}
              </Button>
            </div>
          ) : null}

          {/* Remix in Canvas */}
          {clientOptions.length === 1 ? (
            <Button onClick={handleRemixScript} variant="ghost" size="sm" className="gap-2">
              <Wand2 className="w-4 h-4" />
              Remix in Canvas
            </Button>
          ) : clientOptions.length > 1 ? (
            <div className="flex items-center gap-1">
              <Select value={remixClientId || undefined} onValueChange={setRemixClientId}>
                <SelectTrigger className="h-8 w-auto min-w-[120px] text-xs px-2">
                  <SelectValue placeholder="Client…" />
                </SelectTrigger>
                <SelectContent>
                  {clientOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleRemixScript} disabled={!remixClientId} variant="ghost" size="sm" className="gap-2">
                <Wand2 className="w-4 h-4" />
                Remix in Canvas
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {video.video_url && (
        <UseInScriptModal
          open={useInScriptOpen}
          onClose={() => setUseInScriptOpen(false)}
          video={{
            id: video.id,
            video_url: video.video_url,
            caption: video.caption,
            channel_username: video.channel_username,
          }}
          clientOptions={clientOptions}
        />
      )}
    </PageTransition>
  );
}
