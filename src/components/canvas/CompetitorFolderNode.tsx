// src/components/canvas/CompetitorFolderNode.tsx
import { memo } from "react";
import { NodeProps, NodeResizer, Handle, Position } from "@xyflow/react";
import { ChevronUp, ChevronDown, X, UserSearch } from "lucide-react";
import { Instagram, Youtube } from "lucide-react";

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.28 6.28 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z"/>
    </svg>
  );
}

interface CompetitorPost {
  hookType?: string;
  contentTheme?: string;
  outlier_score?: number;
  caption?: string;
  url?: string;
}

interface CompetitorFolderData {
  username?: string;
  profilePicUrl?: string | null;
  profilePicB64?: string | null;
  platform?: "instagram" | "tiktok" | "youtube" | null;
  posts?: CompetitorPost[];
  avgOutlierScore?: number;
  topOutlierScore?: number;
  collapsed?: boolean;
  _expandedWidth?: number;
  _expandedHeight?: number;
  onUpdate?: (updates: Record<string, any>) => void;
  onDelete?: () => void;
  onCollapseToggle?: (collapsed: boolean) => void;
}

const PLATFORM_ICONS: Record<string, React.ReactNode> = {
  instagram: <Instagram className="w-3 h-3" />,
  tiktok: <TikTokIcon className="w-3 h-3" />,
  youtube: <Youtube className="w-3 h-3" />,
};

const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
};

function outlierColor(score: number): string {
  if (score >= 5) return "#22d3ee";
  if (score >= 2.5) return "#a3e635";
  return "#64748b";
}

const CompetitorFolderNode = memo(({ data, selected }: NodeProps) => {
  const d = data as CompetitorFolderData;
  const {
    username,
    profilePicUrl,
    profilePicB64,
    platform,
    posts = [],
    avgOutlierScore = 0,
    topOutlierScore = 0,
    collapsed = false,
    onDelete,
    onCollapseToggle,
  } = d;

  const platformLabel = platform ? PLATFORM_LABELS[platform] : "Social";
  const platformIcon = platform ? PLATFORM_ICONS[platform] : null;

  // Count hook types for summary tags
  const hookCounts: Record<string, number> = {};
  posts.forEach(p => { if (p.hookType) hookCounts[p.hookType] = (hookCounts[p.hookType] || 0) + 1; });
  const topHooks = Object.entries(hookCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);

  const HOOK_COLORS: Record<string, string> = {
    educational: "#22d3ee",
    authority: "#f59e0b",
    story: "#a78bfa",
    comparison: "#a3e635",
    shock: "#f43f5e",
    random: "#94a3b8",
  };

  // Profile picture with proxy fallback
  const picSrc = profilePicB64 || (profilePicUrl ? `https://connectacreators.com/api/proxy-image?url=${encodeURIComponent(profilePicUrl)}` : null);

  const ProfileHeader = (
    <div
      className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
      style={{
        background: "linear-gradient(135deg, rgba(244,63,94,0.18), rgba(168,85,247,0.18))",
        borderBottom: collapsed ? "none" : "1px solid rgba(244,63,94,0.2)",
        borderRadius: collapsed ? "12px" : "12px 12px 0 0",
      }}
    >
      {/* Avatar */}
      {picSrc ? (
        <img
          src={picSrc}
          alt={username || "Profile"}
          className="w-9 h-9 rounded-full object-cover flex-shrink-0 border-2"
          style={{ borderColor: "rgba(244,63,94,0.4)" }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      ) : (
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: "linear-gradient(135deg, #f43f5e, #a855f7)" }}
        >
          <UserSearch className="w-4 h-4 text-white" />
        </div>
      )}

      {/* Name + platform */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-foreground leading-none truncate">
          @{username || "unknown"}
        </p>
        <div className="flex items-center gap-1 mt-0.5">
          <span className="text-muted-foreground" style={{ display: "flex", alignItems: "center" }}>
            {platformIcon}
          </span>
          <span className="text-[10px] text-muted-foreground">{platformLabel}</span>
          <span className="text-[10px] text-muted-foreground/40">· {posts.length} videos</span>
        </div>
        {/* Hook tags */}
        <div className="flex items-center gap-1 mt-1.5 flex-wrap">
          {topHooks.map(([hook, count]) => (
            <span
              key={hook}
              className="text-[8px] font-semibold px-1.5 py-0.5 rounded"
              style={{ background: `${HOOK_COLORS[hook] || "#64748b"}20`, color: HOOK_COLORS[hook] || "#64748b" }}
            >
              {hook} ×{count}
            </span>
          ))}
        </div>
      </div>

      {/* Outlier stats */}
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <div
          className="px-2 py-1 rounded-lg text-center"
          style={{ background: `${outlierColor(topOutlierScore)}15`, border: `1px solid ${outlierColor(topOutlierScore)}30` }}
        >
          <div className="text-sm font-black tabular-nums" style={{ color: outlierColor(topOutlierScore) }}>
            {topOutlierScore}x
          </div>
          <div className="text-[7px] text-muted-foreground leading-none">top outlier</div>
        </div>
        <div className="text-[9px] text-muted-foreground tabular-nums">
          avg <span style={{ color: outlierColor(avgOutlierScore) }}>{avgOutlierScore}x</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col items-center gap-1 flex-shrink-0 ml-1">
        <button
          className="nodrag w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
          onClick={() => onCollapseToggle?.(!collapsed)}
          title={collapsed ? "Expand folder" : "Collapse folder"}
        >
          {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
        </button>
        {onDelete && (
          <button
            className="nodrag w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
            onClick={onDelete}
            title="Delete folder"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );

  if (collapsed) {
    return (
      <div
        className="bg-card border border-border rounded-xl shadow-xl relative"
        style={{ minWidth: 320 }}
      >
        {ProfileHeader}
        <Handle type="source" position={Position.Right} className="!bg-primary !border-primary/70 !w-3 !h-3" style={{ zIndex: 100, right: -8 }} />
        <Handle type="target" position={Position.Left} className="!bg-primary !border-primary/70 !w-3 !h-3" style={{ zIndex: 100, left: -8 }} />
      </div>
    );
  }

  // Expanded: folder with transparent body (children rendered inside by React Flow)
  return (
    <div
      className={`relative w-full h-full rounded-xl border backdrop-blur-sm transition-colors ${selected ? "border-[rgba(244,63,94,0.5)]" : "border-[rgba(244,63,94,0.25)]"}`}
      style={{
        background: "linear-gradient(145deg, rgba(244,63,94,0.06) 0%, rgba(168,85,247,0.08) 100%)",
        minWidth: 340,
        minHeight: 200,
      }}
    >
      <NodeResizer
        minWidth={340}
        minHeight={200}
        handleStyle={{ opacity: 0, width: 12, height: 12 }}
        lineStyle={{ opacity: 0 }}
        isVisible={selected}
      />
      {ProfileHeader}
      {/* Default body handles — backwards-compatible for existing edges. Pushed outside body and z-100 to win over children. */}
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-primary !border-primary/70 !w-3 !h-3"
        style={{ zIndex: 100, right: -10 }}
      />
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-primary !border-primary/70 !w-3 !h-3"
        style={{ zIndex: 100, left: -10 }}
      />
      {/* Header handles — pinned to the (always-uncovered) profile bar so users can drag from a guaranteed-clickable spot. */}
      <Handle
        id="header-source"
        type="source"
        position={Position.Right}
        className="!bg-rose-500 !border-rose-200 !w-4 !h-4 !shadow-lg"
        style={{ top: 30, right: -10, zIndex: 101 }}
      />
      <Handle
        id="header-target"
        type="target"
        position={Position.Left}
        className="!bg-rose-500 !border-rose-200 !w-4 !h-4 !shadow-lg"
        style={{ top: 30, left: -10, zIndex: 101 }}
      />
    </div>
  );
});

CompetitorFolderNode.displayName = "CompetitorFolderNode";
export default CompetitorFolderNode;
