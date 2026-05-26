// src/components/companion/embeds/VideoCardEmbed.tsx
//
// Compact horizontal video reference card. Used inline when Robby
// returns viral video references via find_viral_videos.
//
// Layout (single row):
//   ┌─────────┬──────────────────────────────────────────────────────┐
//   │  9:16   │ @username · platform · format · niche                │
//   │  thumb  │ 1.1M · 3.1% · 2mo ago                                │
//   │ (clip)  │ Hook: "..."   Body: "..."   CTA: "..."               │
//   │ ▶ tap   │                                              [Open ↗]│
//   └─────────┴──────────────────────────────────────────────────────┘
//
// Click anywhere on the row → /viral-today/video/:id (the detail page).
// Click the play button → swaps the thumbnail for an inline ViralVideoPlayer
// without leaving the chat.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Play, ExternalLink } from "lucide-react";
import type { VideoCardEmbedData } from "@/lib/companion/turn-script";
import { ViralVideoPlayer } from "@/components/video/ViralVideoPlayer";

interface Props {
  data: VideoCardEmbedData;
  onClick?: (id: string) => void;
}

function fmtViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function titleCase(slug: string | undefined): string {
  if (!slug) return "";
  return slug
    .split("_")
    .map((s) => (s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1)))
    .join(" ");
}

export default function VideoCardEmbed({ data, onClick }: Props) {
  const navigate = useNavigate();
  const [playing, setPlaying] = useState(false);

  const goToDetail = () => {
    if (onClick) {
      onClick(data.id);
    } else {
      navigate(`/viral-today/video/${data.id}`);
    }
  };

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  const formatLabel = titleCase(data.content_format);
  const nicheLabel = titleCase(data.primary_niche);
  const platformLabel = data.platform ? data.platform[0].toUpperCase() + data.platform.slice(1) : "";

  return (
    <div
      className="flex gap-3 rounded-xl overflow-hidden cursor-pointer transition-all"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid hsl(var(--bone) / 0.10)",
      }}
      onClick={goToDetail}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "hsl(var(--honey) / 0.40)";
        e.currentTarget.style.background = "rgba(255,255,255,0.06)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "hsl(var(--bone) / 0.10)";
        e.currentTarget.style.background = "rgba(255,255,255,0.04)";
      }}
    >
      {/* Left: thumbnail (9:16, ~96px wide) with play overlay → swaps to inline player */}
      <div
        className="relative flex-shrink-0"
        style={{ width: 96, aspectRatio: "9 / 16", background: "#1a1410" }}
        onClick={stop}
      >
        {playing ? (
          <ViralVideoPlayer
            src={data.video_file_url ?? null}
            fallbackProxyUrl={data.video_url
              ? `https://connectacreators.com/api/stream-reel?url=${encodeURIComponent(data.video_url)}&nocache=1`
              : null}
            aspectRatio="9:16"
            compact
          />
        ) : (
          <>
            {data.thumbnail_url ? (
              <img
                src={data.thumbnail_url}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : (
              <div
                className="absolute inset-0"
                style={{ background: "linear-gradient(135deg, #4a3a30 0%, #2a1808 100%)" }}
              />
            )}
            <button
              onClick={(e) => { e.stopPropagation(); setPlaying(true); }}
              aria-label="Play"
              className="absolute inset-0 flex items-center justify-center hover:bg-black/30 transition-colors group"
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center opacity-90 group-hover:opacity-100 group-hover:scale-110 transition-all"
                style={{
                  background: "hsl(var(--honey))",
                  border: "1.5px solid hsl(var(--ink))",
                  boxShadow: "2px 2px 0 hsl(var(--ink))",
                }}
              >
                <Play size={12} fill="hsl(var(--ink))" style={{ marginLeft: 1, color: "hsl(var(--ink))" }} />
              </div>
            </button>
            <div
              className="absolute top-1 right-1 px-1.5 py-0.5 rounded text-[9px] font-bold"
              style={{ background: "rgba(0,0,0,0.75)", color: "hsl(var(--honey))" }}
            >
              {data.outlier.toFixed(1)}x
            </div>
          </>
        )}
      </div>

      {/* Right: info column */}
      <div className="flex-1 min-w-0 py-2 pr-2.5 flex flex-col gap-1">
        {/* Header row: @handle · platform · format · niche */}
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <span
            className="text-[11px] font-semibold truncate"
            style={{ color: "hsl(var(--bone) / 0.95)" }}
          >
            @{data.username}
          </span>
          {platformLabel && (
            <span className="text-[9px]" style={{ color: "hsl(var(--bone) / 0.40)" }}>
              · {platformLabel}
            </span>
          )}
          {formatLabel && (
            <span
              className="text-[9px] px-1.5 py-0.5 rounded"
              style={{
                background: "hsl(var(--aqua) / 0.12)",
                color: "hsl(var(--aqua) / 0.90)",
                border: "1px solid hsl(var(--aqua) / 0.20)",
              }}
            >
              {formatLabel}
            </span>
          )}
          {nicheLabel && (
            <span
              className="text-[9px] px-1.5 py-0.5 rounded"
              style={{
                background: "hsl(var(--honey) / 0.12)",
                color: "hsl(var(--honey) / 0.90)",
                border: "1px solid hsl(var(--honey) / 0.20)",
              }}
            >
              {nicheLabel}
            </span>
          )}
          <a
            href={data.video_url ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            onClick={stop}
            className="ml-auto text-[9px] flex items-center gap-0.5 hover:opacity-100 opacity-60 transition-opacity"
            style={{ color: "hsl(var(--bone) / 0.75)" }}
            title="Open original"
          >
            <ExternalLink size={9} />
          </a>
        </div>

        {/* Stats row */}
        <div className="flex gap-2 text-[10px] font-jetbrains" style={{ color: "hsl(var(--bone) / 0.65)" }}>
          <span style={{ color: "hsl(var(--honey))" }}>{fmtViews(data.views)}</span>
          <span>·</span>
          <span>{data.engagement.toFixed(1)}%</span>
          <span>·</span>
          <span>{data.age}</span>
        </div>

        {/* Breakdown — hook / body / cta (compact, only what exists) */}
        <div className="space-y-0.5 mt-0.5">
          {data.hook_text && (
            <div className="text-[10.5px] leading-snug min-w-0">
              <span style={{ color: "hsl(var(--aqua) / 0.85)", fontWeight: 600 }}>Hook: </span>
              <span style={{ color: "hsl(var(--bone) / 0.85)" }} className="line-clamp-2">
                {data.hook_text}
              </span>
            </div>
          )}
          {data.body_structure && (
            <div className="text-[10.5px] leading-snug min-w-0">
              <span style={{ color: "hsl(var(--aqua) / 0.85)", fontWeight: 600 }}>Body: </span>
              <span style={{ color: "hsl(var(--bone) / 0.70)" }} className="line-clamp-1">
                {data.body_structure}
              </span>
            </div>
          )}
          {data.cta_text && (
            <div className="text-[10.5px] leading-snug min-w-0">
              <span style={{ color: "hsl(var(--aqua) / 0.85)", fontWeight: 600 }}>CTA: </span>
              <span style={{ color: "hsl(var(--bone) / 0.70)" }} className="line-clamp-1">
                {data.cta_text}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
