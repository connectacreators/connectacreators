import { useState, useEffect } from "react";
import { Search, X, TrendingUp, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

function proxyImg(url: string | null): string | null {
  if (!url) return null;
  if (url.includes("cdninstagram.com") || url.includes("fbcdn.net")) {
    return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=400&output=webp&q=80`;
  }
  return url;
}

function fmtViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

interface ViralVideo {
  id: string;
  video_url: string | null;
  thumbnail_url: string | null;
  caption: string | null;
  channel_username: string;
  platform: string;
  outlier_score: number | null;
  views_count: number | null;
}

interface Props {
  onSelect: (videoUrl: string, channelUsername: string, caption: string | null) => void;
  onClose: () => void;
}

export default function ViralVideoPickerModal({ onSelect, onClose }: Props) {
  const [videos, setVideos] = useState<ViralVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("viral_videos")
        .select("id, video_url, thumbnail_url, caption, channel_username, platform, outlier_score, views_count")
        .order("outlier_score", { ascending: false })
        .limit(100);
      setVideos(data ?? []);
      setLoading(false);
    };
    load();
  }, []);

  const filtered = search.trim()
    ? videos.filter(v =>
        v.channel_username?.toLowerCase().includes(search.toLowerCase()) ||
        v.caption?.toLowerCase().includes(search.toLowerCase())
      )
    : videos;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">Browse Viral Videos</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        {/* Search */}
        <div className="px-4 py-2 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2 bg-muted/40 border border-border/60 rounded-lg px-3 py-1.5">
            <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by channel or caption..."
              className="flex-1 text-xs bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none"
              autoFocus
            />
          </div>
        </div>
        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-12">No videos found</p>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {filtered.map((v) => (
                <button
                  key={v.id}
                  onClick={() => v.video_url && onSelect(v.video_url, v.channel_username, v.caption)}
                  disabled={!v.video_url}
                  className="group relative rounded-xl overflow-hidden border border-border hover:border-primary/50 transition-all text-left disabled:opacity-50"
                >
                  {proxyImg(v.thumbnail_url) ? (
                    <img src={proxyImg(v.thumbnail_url)!} alt="" className="w-full aspect-[9/16] object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  ) : null}
                  <div className="w-full aspect-[9/16] bg-muted absolute inset-0 -z-10 flex items-center justify-center">
                    <TrendingUp className="w-6 h-6 text-muted-foreground/40" />
                  </div>
                  {/* Always-visible bottom info bar */}
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent pt-6 pb-2 px-2">
                    <p className="text-white text-[10px] font-semibold truncate">@{v.channel_username}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {v.outlier_score && v.outlier_score > 1 && (
                        <span className="text-orange-400 text-[9px] font-bold">{v.outlier_score >= 10 ? "🔥" : "📈"} {v.outlier_score.toFixed(1)}x</span>
                      )}
                      {v.views_count && v.views_count > 0 && (
                        <span className="text-white/70 text-[9px]">{fmtViews(v.views_count)}</span>
                      )}
                    </div>
                  </div>
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-white text-xs font-semibold bg-primary px-3 py-1 rounded-lg">Use This</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
