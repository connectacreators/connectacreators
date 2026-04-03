// src/components/canvas/ScriptBatchNode.tsx
import { memo, useState } from "react";
import { type NodeProps, NodeResizer } from "@xyflow/react";
import { ChevronDown, ChevronUp, ExternalLink, Instagram, Youtube } from "lucide-react";

// TikTok icon (matches ViralToday pattern — lucide doesn't have TikTok)
function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4h-.19z" />
    </svg>
  );
}

const PLATFORM_ICON: Record<string, React.ElementType> = {
  instagram: Instagram,
  tiktok: TikTokIcon,
  youtube: Youtube,
};

interface ScriptBatchData {
  script: {
    lines: { line_type: string; section: string; text: string }[];
    idea_ganadora: string;
    target: string;
    formato: string;
    virality_score: number;
  } | null;
  videoThumbnail: string | null;
  videoUrl: string | null;
  videoCaption: string | null;
  ownerUsername: string | null;
  outlierScore: number | null;
  platform: string | null;
  onUpdate?: (updates: Partial<ScriptBatchData>) => void;
  onDelete?: () => void;
}

function proxyImg(url: string | null): string | null {
  if (!url) return null;
  if (url.includes("connectacreators.com/thumb-cache")) return url;
  if (url.includes("cdninstagram.com") || url.includes("fbcdn.net")) {
    return `https://connectacreators.com/api/proxy-image?url=${encodeURIComponent(url)}`;
  }
  return url;
}

const ScriptBatchNode = memo(({ data, selected }: NodeProps) => {
  const d = data as ScriptBatchData;
  const [expanded, setExpanded] = useState(false);
  const [imgError, setImgError] = useState(false);

  const PlatformIcon = PLATFORM_ICON[d.platform || "instagram"] ?? Instagram;
  const title = d.script?.idea_ganadora || "Batch Script";
  const previewLines = d.script?.lines?.slice(0, 2).map((l) => l.text).join(" ") || "";
  const fullScript = d.script?.lines?.map((l) => {
    const prefix = l.section === "hook" ? "HOOK: " : l.section === "cta" ? "CTA: " : "";
    return `${prefix}${l.text}`;
  }).join("\n") || "";

  return (
    <div
      className="rounded-xl shadow-lg relative overflow-hidden"
      style={{
        width: 260,
        background: "#18181b",
        border: selected ? "1.5px solid #06b6d4" : "1px solid #27272a",
        borderLeft: "4px solid #06b6d4",
      }}
    >
      <NodeResizer
        minWidth={220}
        minHeight={100}
        handleStyle={{ width: 8, height: 8, borderRadius: 4 }}
      />

      {/* Drag handle + delete */}
      <div
        className="drag-handle flex items-center justify-between px-3 py-2"
        style={{ cursor: "grab", borderBottom: "1px solid #27272a" }}
      >
        <div className="flex items-center gap-1.5">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: "#06b6d4" }}
          />
          <span
            style={{ fontSize: 10, color: "#06b6d4", fontWeight: 600 }}
          >
            BATCH SCRIPT
          </span>
        </div>
        {d.onDelete && (
          <button
            onClick={d.onDelete}
            className="text-zinc-500 hover:text-red-400 transition-colors"
            style={{ fontSize: 11 }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Thumbnail */}
      {d.videoThumbnail && !imgError ? (
        <div style={{ width: "100%", height: 100, overflow: "hidden", position: "relative" }}>
          <img
            src={proxyImg(d.videoThumbnail) ?? d.videoThumbnail}
            alt={title}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={() => setImgError(true)}
          />
          {/* Platform badge */}
          <div
            className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <PlatformIcon className="w-2.5 h-2.5 text-white/80" />
          </div>
        </div>
      ) : (
        <div
          className="flex items-center justify-center"
          style={{ width: "100%", height: 60, background: "#27272a" }}
        >
          <PlatformIcon className="w-5 h-5 text-zinc-500" />
        </div>
      )}

      {/* Content */}
      <div className="px-3 py-2">
        {/* Title */}
        <p style={{ fontSize: 13, fontWeight: 600, color: "#fafafa", marginBottom: 4 }}>
          {title}
        </p>

        {/* Source metadata */}
        <div className="flex items-center gap-1.5" style={{ marginBottom: 6 }}>
          {d.ownerUsername && (
            <span style={{ fontSize: 10, color: "#71717a" }}>
              @{d.ownerUsername}
            </span>
          )}
          {d.outlierScore != null && (
            <>
              <span style={{ fontSize: 10, color: "#3f3f46" }}>·</span>
              <span style={{ fontSize: 10, color: "#71717a" }}>
                {d.outlierScore >= 10 ? Math.round(d.outlierScore) : d.outlierScore.toFixed(1)}x
              </span>
            </>
          )}
          {d.script?.virality_score != null && (
            <>
              <span style={{ fontSize: 10, color: "#3f3f46" }}>·</span>
              <span style={{ fontSize: 10, color: "#06b6d4" }}>
                {d.script.virality_score.toFixed(1)} virality
              </span>
            </>
          )}
        </div>

        {/* Preview or full script */}
        {expanded ? (
          <pre
            style={{
              fontSize: 11,
              color: "#a1a1aa",
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxHeight: 300,
              overflowY: "auto",
              marginBottom: 6,
              fontFamily: "inherit",
            }}
          >
            {fullScript}
          </pre>
        ) : (
          <p
            style={{
              fontSize: 11,
              color: "#a1a1aa",
              lineHeight: 1.4,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              marginBottom: 6,
            }}
          >
            "{previewLines}"
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 hover:opacity-80 transition-opacity"
            style={{ fontSize: 11, color: "#06b6d4", background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            {expanded ? (
              <>
                Collapse <ChevronUp className="w-3 h-3" />
              </>
            ) : (
              <>
                Expand script <ChevronDown className="w-3 h-3" />
              </>
            )}
          </button>

          {d.videoUrl && (
            <a
              href={d.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 11, color: "#71717a" }}
              className="hover:text-white transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
});

ScriptBatchNode.displayName = "ScriptBatchNode";
export default ScriptBatchNode;
