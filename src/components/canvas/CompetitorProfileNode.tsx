// src/components/canvas/CompetitorProfileNode.tsx
import { useState, useCallback, useRef, useEffect } from "react";
import { Handle, Position, NodeResizer } from "@xyflow/react";
import { Loader2, UserSearch, ExternalLink, ChevronDown, ChevronRight, X, Youtube, Sparkles } from "lucide-react";
import { Instagram } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.28 6.28 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z"/>
    </svg>
  );
}

type Platform = "instagram" | "tiktok" | "youtube" | null;

function detectPlatform(url: string): Platform {
  const s = url.toLowerCase();
  if (s.includes("instagram.com")) return "instagram";
  if (s.includes("tiktok.com")) return "tiktok";
  if (s.includes("youtube.com") || s.includes("youtu.be")) return "youtube";
  return null;
}

interface CompetitorPost {
  rank: number;
  caption: string;
  views: number;
  viewsFormatted: string;
  likes: number;
  comments: number;
  engagement_rate: number;
  outlier_score: number;
  posted_at: string;
  url: string;
  thumbnail?: string | null;
  platform?: string;
  hookType?: string;
  contentTheme?: string;
  whyItWorked?: string;
  pattern?: string;
  applyToClient?: string;
  transcription?: string;
}

interface NodeData {
  profileUrl?: string;
  username?: string | null;
  profilePicUrl?: string | null;
  profilePicB64?: string | null;
  detectedPlatform?: Platform;
  posts?: CompetitorPost[];
  selectedPostIndex?: number | null;
  status?: "idle" | "loading" | "done" | "error";
  errorMessage?: string | null;
  authToken?: string | null;
  clientId?: string;
  onUpdate?: (updates: Record<string, any>) => void;
  onDelete?: () => void;
  onAddVideoNode?: (url: string) => void;
  onTransform?: (profileData: { username: string | null; profilePicUrl: string | null; profilePicB64: string | null; platform: Platform }, posts: CompetitorPost[]) => void;
}

const HOOK_TYPE_LABELS: Record<string, string> = {
  educational: "Educational",
  authority: "Authority",
  story: "Story",
  comparison: "Comparison",
  shock: "Shock",
  random: "Random / Unexpected",
};

const HOOK_TYPE_COLORS: Record<string, string> = {
  educational: "#22d3ee",
  authority: "#f59e0b",
  story: "#a78bfa",
  comparison: "#a3e635",
  shock: "#f43f5e",
  random: "#94a3b8",
};

const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube Shorts",
};

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

function outlierColor(score: number): string {
  if (score >= 5) return "#22d3ee";
  if (score >= 2.5) return "#a3e635";
  return "#64748b";
}

export default function CompetitorProfileNode({ data, selected }: { data: NodeData; selected?: boolean }) {
  const {
    profileUrl: savedUrl = "",
    username = null,
    profilePicUrl = null,
    profilePicB64 = null,
    detectedPlatform: savedPlatform = null,
    posts: rawPosts = [],
    status = "idle",
    errorMessage = null,
    clientId,
    onUpdate,
    onDelete,
    onAddVideoNode,
    onTransform,
  } = data;

  // Show top 10 by outlier score
  const posts = [...rawPosts].sort((a, b) => (b.outlier_score ?? 0) - (a.outlier_score ?? 0)).slice(0, 10);

  const [inputUrl, setInputUrl] = useState(savedUrl);
  const [liveDetected, setLiveDetected] = useState<Platform>(savedPlatform);
  const [analyzingIndices, setAnalyzingIndices] = useState<Set<number>>(new Set());
  const [transcribingIndices, setTranscribingIndices] = useState<Set<number>>(new Set());
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  const [deepAnalyzing, setDeepAnalyzing] = useState(false);
  const [deepProgress, setDeepProgress] = useState({ done: 0, total: 0 });
  const fetchGeneration = useRef(0);
  const deepCancelRef = useRef(false);

  // Fetch client name for "Apply to Client" context
  useEffect(() => {
    if (!clientId) return;
    supabase.from("clients").select("name").eq("id", clientId).single().then(({ data: c }) => {
      if (c?.name) setClientName(c.name);
    });
  }, [clientId]);

  // Reset deep analysis when a new profile is fetched
  useEffect(() => {
    if (status === "loading") {
      deepCancelRef.current = true;
      setDeepAnalyzing(false);
      setDeepProgress({ done: 0, total: 0 });
    }
  }, [status]);

  const handleInputChange = useCallback((val: string) => {
    setInputUrl(val);
    setLiveDetected(detectPlatform(val));
  }, []);

  const handleFetch = useCallback(async () => {
    const url = inputUrl.trim();
    if (!url) { toast.error("Paste a profile URL first"); return; }
    const platform = detectPlatform(url);
    if (!platform) { toast.error("Unsupported URL — paste an Instagram, TikTok, or YouTube channel URL"); return; }
    fetchGeneration.current += 1;
    setExpandedIndex(null);
    onUpdate?.({ status: "loading", profileUrl: url, detectedPlatform: platform, errorMessage: null });
    try {
      let result: any = null;
      let lastError: string | null = null;
      // Retry once — first attempt may timeout while VPS scrapes, second hits vault cache
      for (let attempt = 0; attempt < 2; attempt++) {
        const { data, error } = await supabase.functions.invoke("fetch-profile-top-posts", {
          body: { profileUrl: url, limit: 50 },
        });
        if (error) { lastError = error.message; continue; }
        if (data?.error) { lastError = data.error; continue; }
        result = data;
        break;
      }
      if (!result) throw new Error(lastError || "Failed to fetch posts");
      onUpdate?.({ status: "done", username: result.username || null, profilePicUrl: result.profilePicUrl || null, profilePicB64: result.profilePicB64 || null, detectedPlatform: result.platform || platform, posts: result.posts || [], selectedPostIndex: null, errorMessage: null });
    } catch (e: any) {
      const msg = e.message || "Failed to fetch posts";
      onUpdate?.({ status: "error", errorMessage: msg });
      toast.error(msg);
    }
  }, [inputUrl, onUpdate]);

  const analyzePost = useCallback(async (index: number) => {
    const post = posts[index];
    if (!post || post.hookType) return;
    const gen = fetchGeneration.current;
    setAnalyzingIndices(prev => new Set(prev).add(index));
    try {
      const { data: result, error } = await supabase.functions.invoke("ai-build-script", {
        body: {
          step: "analyze-competitor-post",
          caption: post.caption,
          views: post.views,
          engagement_rate: post.engagement_rate,
          outlier_score: post.outlier_score,
          clientName: clientName || undefined,
        },
      });
      if (error) throw new Error(error.message);
      if (result?.error) throw new Error(result.error);
      if (fetchGeneration.current !== gen) return;
      onUpdate?.({
        posts: posts.map((p, i) => i === index ? {
          ...p,
          hookType: result.hook_type,
          contentTheme: result.content_theme,
          whyItWorked: result.why_it_worked,
          pattern: result.pattern,
          applyToClient: result.apply_to_client,
        } : p),
      });
      window.dispatchEvent(new Event("credits-updated"));
    } catch (e: any) {
      toast.error(`Analysis failed: ${e.message || "Unknown error"}`);
    } finally {
      setAnalyzingIndices(prev => { const next = new Set(prev); next.delete(index); return next; });
    }
  }, [posts, onUpdate, clientName]);

  const transcribePost = useCallback(async (index: number) => {
    const post = posts[index];
    if (!post?.url || post.transcription || transcribingIndices.has(index)) return;
    setTranscribingIndices(prev => new Set(prev).add(index));
    try {
      const { data: result, error } = await supabase.functions.invoke("transcribe-video", {
        body: { url: post.url, source: "competitor" },
      });
      if (error) throw new Error(error.message);
      if (result?.error) throw new Error(result.error);
      const text = result?.transcription;
      if (!text) throw new Error("No transcription returned");
      onUpdate?.({
        posts: posts.map((p, i) => i === index ? { ...p, transcription: text } : p),
      });
      window.dispatchEvent(new Event("credits-updated"));
      toast.success("Transcription complete");
    } catch (e: any) {
      toast.error(`Transcription failed: ${e.message || "Unknown error"}`);
    } finally {
      setTranscribingIndices(prev => { const next = new Set(prev); next.delete(index); return next; });
    }
  }, [posts, onUpdate, transcribingIndices]);

  const handleCardClick = useCallback((index: number) => {
    setExpandedIndex(prev => prev === index ? null : index);
  }, []);

  // Transcribe all posts sequentially — no visual analysis or text AI analysis.
  // Once transformed into VideoNodes, user can manually trigger visual analysis per node.
  const deepAnalyzeAll = useCallback(async () => {
    if (deepAnalyzing || posts.length === 0) return;
    deepCancelRef.current = false;
    setDeepAnalyzing(true);
    const total = posts.length;
    setDeepProgress({ done: 0, total });
    let currentPosts = [...posts];

    for (let i = 0; i < total; i++) {
      if (deepCancelRef.current) break;
      setDeepProgress({ done: i, total });

      // Transcribe if not already done
      if (!currentPosts[i].transcription) {
        setTranscribingIndices(prev => new Set(prev).add(i));
        try {
          const { data: result, error } = await supabase.functions.invoke("transcribe-video", {
            body: { url: currentPosts[i].url, source: "competitor" },
          });
          if (!error && !result?.error && result?.transcription) {
            currentPosts = currentPosts.map((p, j) => j === i ? { ...p, transcription: result.transcription } : p);
            onUpdate?.({ posts: currentPosts });
            window.dispatchEvent(new Event("credits-updated"));
          }
        } catch {}
        setTranscribingIndices(prev => { const next = new Set(prev); next.delete(i); return next; });
      }
    }

    setDeepProgress({ done: total, total });
    setDeepAnalyzing(false);
    if (!deepCancelRef.current) {
      if (onTransform) {
        onTransform(
          { username, profilePicUrl, profilePicB64, platform: savedPlatform },
          currentPosts,
        );
      } else {
        toast.success("Transcription complete for all posts");
      }
    }
  }, [posts, deepAnalyzing, onUpdate, onTransform, username, profilePicUrl, profilePicB64, savedPlatform]);

  const activePlatform = liveDetected || savedPlatform;
  const platformLabel = activePlatform ? PLATFORM_LABELS[activePlatform] : "profile";
  const externalLinkLabel = savedPlatform === "youtube" ? "View on YouTube" : savedPlatform === "tiktok" ? "View on TikTok" : "View on Instagram";

  return (
    <div className="bg-card border border-border rounded-2xl shadow-xl relative flex flex-col" style={{ width: "100%", height: "100%", minWidth: 360, minHeight: 200 }}>
      <NodeResizer minWidth={360} minHeight={200} handleStyle={{ opacity: 0, width: 12, height: 12 }} lineStyle={{ opacity: 0 }} />
      <div className="overflow-hidden rounded-2xl flex flex-col flex-1" style={{ width: "100%", height: "100%" }}>

        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 py-3" style={{ background: "linear-gradient(135deg, rgba(244,63,94,0.15), rgba(168,85,247,0.15))", borderBottom: "1px solid rgba(244,63,94,0.2)" }}>
          {(profilePicB64 || profilePicUrl) ? (
            <img
              src={profilePicB64 || profilePicUrl!}
              alt={username || "Profile"}
              className="w-8 h-8 rounded-full object-cover flex-shrink-0 border-2"
              style={{ borderColor: "rgba(244,63,94,0.4)" }}
              onError={(e) => {
                const img = e.target as HTMLImageElement;
                if (profilePicUrl && !img.src.includes("/api/proxy-image") && !img.src.startsWith("data:")) {
                  img.src = `https://connectacreators.com/api/proxy-image?url=${encodeURIComponent(profilePicUrl)}`;
                } else {
                  img.style.display = "none";
                }
              }}
            />
          ) : (
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "linear-gradient(135deg, #f43f5e, #a855f7)" }}>
              <UserSearch className="w-3.5 h-3.5 text-white" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-foreground leading-none">Competitor Profile</p>
            {username && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                @{username}
                {savedPlatform && <span className="ml-1 opacity-60">· {PLATFORM_LABELS[savedPlatform]}</span>}
              </p>
            )}
          </div>
          {onDelete && (
            <button onClick={onDelete} className="nodrag w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors flex-shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Idle / error */}
        {(status === "idle" || status === "error") && (
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium">Supports:</span>
              <div className="flex items-center gap-1.5">
                <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-medium transition-colors ${activePlatform === "instagram" ? "bg-pink-500/20 text-pink-400" : "bg-muted/30 text-muted-foreground/40"}`}>
                  <Instagram className="w-2.5 h-2.5" /> IG
                </span>
                <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-medium transition-colors ${activePlatform === "tiktok" ? "bg-sky-500/20 text-sky-400" : "bg-muted/30 text-muted-foreground/40"}`}>
                  <TikTokIcon className="w-2.5 h-2.5" /> TT
                </span>
                <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-medium transition-colors ${activePlatform === "youtube" ? "bg-red-500/20 text-red-400" : "bg-muted/30 text-muted-foreground/40"}`}>
                  <Youtube className="w-2.5 h-2.5" /> YT
                </span>
              </div>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Profile URL</label>
              <input
                value={inputUrl}
                onChange={e => handleInputChange(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleFetch(); }}
                placeholder="instagram.com/user · tiktok.com/@user · youtube.com/@channel"
                className="mt-1.5 w-full px-3 py-2 text-xs rounded-xl border border-border bg-muted/30 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-[#f43f5e]/50 transition-colors"
              />
              {inputUrl.trim() && !activePlatform && (
                <p className="text-[10px] text-amber-400 mt-1">Unsupported URL — paste an Instagram, TikTok, or YouTube channel URL</p>
              )}
            </div>
            {status === "error" && errorMessage && <p className="text-xs text-red-400">{errorMessage}</p>}
            <button onClick={handleFetch} disabled={!inputUrl.trim() || !activePlatform || status === "loading"} className="w-full py-2 rounded-xl text-xs font-semibold transition-colors disabled:opacity-40" style={{ background: "linear-gradient(135deg, #f43f5e, #a855f7)", color: "white" }}>
              Fetch &amp; Analyze →
            </button>
          </div>
        )}

        {/* Loading */}
        {status === "loading" && (
          <div className="p-8 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#f43f5e" }} />
            <p className="text-xs text-muted-foreground">Fetching top posts from {platformLabel}...</p>
            <p className="text-[10px] text-muted-foreground/60">This may take up to 30 seconds</p>
          </div>
        )}

        {/* Done — post cards */}
        {status === "done" && (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Sub-header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                Top Outliers ({posts.length})
              </p>
              <div className="flex items-center gap-1.5">
                {(analyzingIndices.size > 0 || transcribingIndices.size > 0) && (
                  <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    {deepAnalyzing ? `${deepProgress.done}/${deepProgress.total}` : "Processing..."}
                  </span>
                )}
                <button
                  onClick={() => { onUpdate?.({ status: "idle" }); setExpandedIndex(null); deepCancelRef.current = true; setDeepAnalyzing(false); }}
                  className="nodrag text-[9px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted/30 transition-colors"
                >
                  ← New profile
                </button>
              </div>
            </div>

            {posts.length === 0 ? (
              <p className="text-[10px] text-muted-foreground p-4">No posts found</p>
            ) : (
              <div className="overflow-y-auto flex-1 min-h-0">
                {posts.map((post, i) => {
                  const isExpanded = expandedIndex === i;
                  const isAnalyzing = analyzingIndices.has(i);
                  const isTranscribing = transcribingIndices.has(i);
                  const hookColor = post.hookType ? (HOOK_TYPE_COLORS[post.hookType] || "#64748b") : null;

                  return (
                    <div key={i} className="border-b border-border/50 last:border-b-0">
                      {/* Card row — div for text selection, chevron is the click target */}
                      <div className={`flex items-start gap-2.5 px-3 py-2.5 transition-colors ${isExpanded ? "bg-muted/20" : ""}`}>
                        {/* Thumbnail */}
                        <div className="flex-shrink-0 rounded overflow-hidden cursor-pointer" style={{ width: 40, height: 72, background: "#0f172a" }} onClick={() => handleCardClick(i)}>
                          {post.thumbnail ? (
                            <img
                              src={`https://connectacreators.com/api/proxy-image?url=${encodeURIComponent(post.thumbnail)}`}
                              alt=""
                              className="w-full h-full object-cover"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-muted-foreground/30 text-xs">&#9654;</div>
                          )}
                        </div>

                        {/* Content — selectable text */}
                        <div className="flex-1 min-w-0 select-text">
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="text-[9px] font-bold tabular-nums" style={{ color: outlierColor(post.outlier_score) }}>
                              #{post.rank} · {post.outlier_score}x
                            </span>
                            <span className="text-[9px] text-muted-foreground tabular-nums">
                              {post.viewsFormatted || formatViews(post.views)} views
                            </span>
                          </div>
                          <p className="text-[10px] text-foreground/80 leading-snug line-clamp-2 mb-1.5 cursor-text">
                            {post.caption || "(no caption)"}
                          </p>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {post.hookType && hookColor && (
                              <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded" style={{ background: `${hookColor}20`, color: hookColor }}>
                                {HOOK_TYPE_LABELS[post.hookType] || post.hookType}
                              </span>
                            )}
                            {post.transcription && (
                              <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "rgba(168,85,247,0.15)", color: "#a855f7" }}>
                                Transcribed
                              </span>
                            )}
                            {(isAnalyzing || isTranscribing) && (
                              <span className="flex items-center gap-0.5 text-[8px] text-muted-foreground">
                                <Loader2 className="w-2 h-2 animate-spin" />
                                {isTranscribing ? "transcribing" : "analyzing"}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Expand chevron */}
                        <button onClick={() => handleCardClick(i)} className="nodrag flex-shrink-0 text-muted-foreground/40 hover:text-muted-foreground mt-1 p-0.5">
                          {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        </button>
                      </div>

                      {/* Expanded detail panel */}
                      {isExpanded && (
                        <div className="px-3 pb-3 pt-0 space-y-2.5 select-text" style={{ background: "rgba(0,0,0,0.15)", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                          {isAnalyzing ? (
                            <div className="flex items-center gap-2 py-3">
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                              <p className="text-[10px] text-muted-foreground">Analyzing post...</p>
                            </div>
                          ) : post.hookType ? (
                            <>
                              {/* Hook Type */}
                              <div className="pt-2.5">
                                <p className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Hook Type</p>
                                {hookColor && (
                                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold" style={{ background: `${hookColor}20`, color: hookColor }}>
                                    {HOOK_TYPE_LABELS[post.hookType] || post.hookType}
                                  </span>
                                )}
                              </div>

                              {/* Why it worked */}
                              {post.whyItWorked && (
                                <div>
                                  <p className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Why It Worked</p>
                                  <p className="text-[10px] text-foreground/80 leading-relaxed cursor-text">{post.whyItWorked}</p>
                                </div>
                              )}

                              {/* Apply to client */}
                              {post.applyToClient && (
                                <div className="rounded-lg p-2.5" style={{ background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.15)" }}>
                                  <p className="text-[8px] font-bold uppercase tracking-widest mb-1" style={{ color: "#22d3ee" }}>
                                    Apply to {clientName || "Client"}
                                  </p>
                                  <p className="text-[10px] leading-relaxed cursor-text" style={{ color: "#94d4db" }}>{post.applyToClient}</p>
                                </div>
                              )}

                              {/* Transcription */}
                              {post.transcription && (
                                <div className="rounded-lg p-2.5" style={{ background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.2)" }}>
                                  <p className="text-[8px] font-bold uppercase tracking-widest mb-1" style={{ color: "#a855f7" }}>Transcription</p>
                                  <p className="text-[10px] leading-relaxed text-foreground/70 max-h-24 overflow-y-auto cursor-text">{post.transcription}</p>
                                </div>
                              )}

                              {/* Add to canvas + external link */}
                              <div className="flex items-center gap-2 flex-wrap">
                                {post.url && onAddVideoNode && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); onAddVideoNode(post.url); }}
                                    className="nodrag flex items-center gap-1 text-[9px] font-semibold px-2 py-1 rounded-md transition-colors"
                                    style={{ background: "rgba(34,211,238,0.12)", color: "#22d3ee", border: "1px solid rgba(34,211,238,0.25)" }}
                                  >
                                    + Add to Canvas
                                  </button>
                                )}
                                {post.url && (
                                  <a
                                    href={post.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="nodrag flex items-center gap-1 text-[9px] text-muted-foreground hover:text-foreground transition-colors"
                                    onClick={e => e.stopPropagation()}
                                  >
                                    <ExternalLink className="w-2.5 h-2.5" />
                                    {externalLinkLabel}
                                  </a>
                                )}
                              </div>
                            </>
                          ) : (
                            <p className="text-[10px] text-muted-foreground py-2">
                              Click "Analyze Top {posts.length} Posts" below to unlock full analysis
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Deep Analyze button at the bottom */}
            {posts.length > 0 && (
              <div className="px-3 py-3 border-t border-border">
                {deepAnalyzing ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Analyzing post {deepProgress.done + 1} of {deepProgress.total}...
                      </span>
                      <button
                        onClick={() => { deepCancelRef.current = true; }}
                        className="nodrag text-[9px] text-red-400 hover:text-red-300"
                      >
                        Cancel
                      </button>
                    </div>
                    <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${deepProgress.total > 0 ? (deepProgress.done / deepProgress.total) * 100 : 0}%`,
                          background: "linear-gradient(90deg, #f43f5e, #a855f7)",
                        }}
                      />
                    </div>
                  </div>
                ) : posts.every(p => p.transcription) ? (
                  <div className="flex items-center gap-1.5 text-[10px] font-medium" style={{ color: "#22d3ee" }}>
                    <Sparkles className="w-3.5 h-3.5" />
                    All {posts.length} posts transcribed — exploding into folder...
                  </div>
                ) : (
                  <button
                    onClick={deepAnalyzeAll}
                    title={`${posts.filter(p => !p.transcription).length * 50 + posts.filter(p => !p.hookType).length * 10} credits`}
                    className="nodrag w-full py-2.5 rounded-xl text-xs font-semibold transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2"
                    style={{ background: "linear-gradient(135deg, #f43f5e, #a855f7)", color: "white" }}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Transcribe Top {posts.length} Outliers
                  </button>
                )}
              </div>
            )}
          </div>
        )}

      </div>
      <Handle type="target" position={Position.Left} className="!bg-[#f43f5e] !border-[#f43f5e] !w-3 !h-3" style={{ zIndex: 50 }} />
      <Handle type="source" position={Position.Right} className="!bg-[#f43f5e] !border-[#f43f5e] !w-3 !h-3" style={{ zIndex: 50 }} />
    </div>
  );
}
