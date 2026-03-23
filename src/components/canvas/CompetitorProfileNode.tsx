// src/components/canvas/CompetitorProfileNode.tsx
import { useState, useCallback, useRef } from "react";
import { Handle, Position } from "@xyflow/react";
import { Loader2, UserSearch, ExternalLink, ChevronRight, X, Youtube } from "lucide-react";
import { Instagram } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// TikTok icon — lucide-react has no TikTok icon, use inline SVG
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
}

interface NodeData {
  profileUrl?: string;
  username?: string | null;
  detectedPlatform?: Platform;
  posts?: CompetitorPost[];
  selectedPostIndex?: number | null;
  status?: "idle" | "loading" | "done" | "error";
  errorMessage?: string | null;
  authToken?: string | null;
  clientId?: string;
  onUpdate?: (updates: Record<string, any>) => void;
  onDelete?: () => void;
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

export default function CompetitorProfileNode({ data }: { data: NodeData }) {
  const {
    profileUrl: savedUrl = "",
    username = null,
    detectedPlatform: savedPlatform = null,
    posts = [],
    selectedPostIndex = null,
    status = "idle",
    errorMessage = null,
    onUpdate,
    onDelete,
  } = data;

  const [inputUrl, setInputUrl] = useState(savedUrl);
  const [liveDetected, setLiveDetected] = useState<Platform>(savedPlatform);
  const [analyzingIndex, setAnalyzingIndex] = useState<number | null>(null);
  // Incremented on every new fetch — lets in-flight analysis detect stale state
  const fetchGeneration = useRef(0);

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
    onUpdate?.({ status: "loading", profileUrl: url, detectedPlatform: platform, errorMessage: null });
    try {
      const { data: result, error } = await supabase.functions.invoke("fetch-profile-top-posts", {
        body: { profileUrl: url, limit: 50 },
      });
      if (error) throw new Error(error.message);
      if (result?.error) throw new Error(result.error);
      onUpdate?.({ status: "done", username: result.username || null, detectedPlatform: result.platform || platform, posts: result.posts || [], selectedPostIndex: null, errorMessage: null });
    } catch (e: any) {
      const msg = e.message || "Failed to fetch posts";
      onUpdate?.({ status: "error", errorMessage: msg });
      toast.error(msg);
    }
  }, [inputUrl, onUpdate]);

  const handleSelectPost = useCallback(async (index: number) => {
    onUpdate?.({ selectedPostIndex: index });
    const post = posts[index];
    if (!post || post.hookType) return;
    const gen = fetchGeneration.current; // capture before async — detects re-fetch mid-analysis
    setAnalyzingIndex(index);
    try {
      const { data: result, error } = await supabase.functions.invoke("ai-build-script", {
        body: { step: "analyze-competitor-post", caption: post.caption, views: post.views, engagement_rate: post.engagement_rate, outlier_score: post.outlier_score },
      });
      if (error) throw new Error(error.message);
      if (result?.error) throw new Error(result.error);
      // If user re-fetched a new profile while this was in-flight, discard stale result
      if (fetchGeneration.current !== gen) return;
      onUpdate?.({ posts: posts.map((p, i) => i === index ? { ...p, hookType: result.hook_type, contentTheme: result.content_theme, whyItWorked: result.why_it_worked, pattern: result.pattern } : p) });
    } catch (e: any) {
      toast.error(`Analysis failed: ${e.message || "Unknown error"}`);
    } finally {
      setAnalyzingIndex(null);
    }
  }, [posts, onUpdate]);

  const selectedPost = selectedPostIndex !== null ? posts[selectedPostIndex] : null;
  const activePlatform = liveDetected || savedPlatform;
  const platformLabel = activePlatform ? PLATFORM_LABELS[activePlatform] : "profile";
  const externalLinkLabel = savedPlatform === "youtube" ? "View on YouTube" : savedPlatform === "tiktok" ? "View on TikTok" : "View on Instagram";

  return (
    <div className="bg-card border border-border rounded-2xl shadow-xl overflow-hidden" style={{ width: 480, minHeight: 200 }}>
      <Handle type="target" position={Position.Left} className="!bg-[#f43f5e] !border-[#f43f5e]" />
      <Handle type="source" position={Position.Right} className="!bg-[#f43f5e] !border-[#f43f5e]" />

      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3" style={{ background: "linear-gradient(135deg, rgba(244,63,94,0.15), rgba(168,85,247,0.15))", borderBottom: "1px solid rgba(244,63,94,0.2)" }}>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "linear-gradient(135deg, #f43f5e, #a855f7)" }}>
          <UserSearch className="w-3.5 h-3.5 text-white" />
        </div>
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
          {/* Platform support badges */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium">Supports:</span>
            <div className="flex items-center gap-1.5">
              <span title="Instagram" className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-medium transition-colors ${activePlatform === "instagram" ? "bg-pink-500/20 text-pink-400" : "bg-muted/30 text-muted-foreground/40"}`}>
                <Instagram className="w-2.5 h-2.5" /> IG
              </span>
              <span title="TikTok" className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-medium transition-colors ${activePlatform === "tiktok" ? "bg-sky-500/20 text-sky-400" : "bg-muted/30 text-muted-foreground/40"}`}>
                <TikTokIcon className="w-2.5 h-2.5" /> TT
              </span>
              <span title="YouTube Shorts" className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-medium transition-colors ${activePlatform === "youtube" ? "bg-red-500/20 text-red-400" : "bg-muted/30 text-muted-foreground/40"}`}>
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

      {/* Done — split layout */}
      {status === "done" && (
        <div className="flex" style={{ minHeight: 280 }}>
          <div className="w-[40%] border-r border-border flex flex-col">
            <div className="px-3 py-2 border-b border-border">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Top Posts</p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {posts.length === 0 ? (
                <p className="text-[10px] text-muted-foreground p-3">No posts found</p>
              ) : posts.map((post, i) => (
                <button key={i} onClick={() => handleSelectPost(i)} className={`w-full text-left px-3 py-2.5 border-b border-border/50 transition-colors hover:bg-muted/30 ${selectedPostIndex === i ? "bg-muted/50" : ""}`}>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-[9px] font-bold" style={{ color: outlierColor(post.outlier_score) }}>#{post.rank} · {post.outlier_score}x</span>
                    <div className="flex items-center gap-1">
                      {analyzingIndex === i && <Loader2 className="w-2.5 h-2.5 animate-spin text-muted-foreground" />}
                      {selectedPostIndex === i && <ChevronRight className="w-2.5 h-2.5 text-muted-foreground" />}
                    </div>
                  </div>
                  <p className="text-[10px] text-foreground/80 leading-snug line-clamp-2">{post.caption || "(no caption)"}</p>
                  <p className="text-[9px] text-muted-foreground mt-1">{post.viewsFormatted || formatViews(post.views)} views</p>
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 flex flex-col">
            <div className="px-3 py-2 border-b border-border">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">AI Insight</p>
            </div>
            {!selectedPost ? (
              <div className="flex-1 flex items-center justify-center p-4">
                <p className="text-[10px] text-muted-foreground text-center">Click a post to see why it worked</p>
              </div>
            ) : analyzingIndex === selectedPostIndex ? (
              <div className="flex-1 flex items-center justify-center p-4 gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                <p className="text-[10px] text-muted-foreground">Analyzing...</p>
              </div>
            ) : (
              <div className="flex-1 p-3 space-y-3 overflow-y-auto">
                {selectedPost.hookType && (
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Hook Type</p>
                    <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold" style={{ background: `${HOOK_TYPE_COLORS[selectedPost.hookType] || "#64748b"}20`, color: HOOK_TYPE_COLORS[selectedPost.hookType] || "#64748b" }}>
                      {HOOK_TYPE_LABELS[selectedPost.hookType] || selectedPost.hookType}
                    </span>
                  </div>
                )}
                {selectedPost.contentTheme && (
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Theme</p>
                    <p className="text-[10px] text-foreground">{selectedPost.contentTheme}</p>
                  </div>
                )}
                {selectedPost.pattern && (
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Pattern</p>
                    <p className="text-[10px] text-foreground/80 leading-relaxed">{selectedPost.pattern}</p>
                  </div>
                )}
                {selectedPost.whyItWorked && (
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Why It Worked</p>
                    <p className="text-[10px] text-foreground/80 leading-relaxed">{selectedPost.whyItWorked}</p>
                  </div>
                )}
                {!selectedPost.hookType && analyzingIndex === null && (
                  <p className="text-[10px] text-muted-foreground">Click the post again to load analysis</p>
                )}
                {selectedPost.url && (
                  <a href={selectedPost.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors mt-1">
                    <ExternalLink className="w-3 h-3" />
                    {externalLinkLabel}
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
