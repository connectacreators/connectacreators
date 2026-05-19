// src/components/companion/embeds/ProfileAnalysisEmbed.tsx
//
// Structured embed for analyze_my_profile output. Renders inline in chat
// after Robby's 2-3 sentence prose framing. Honey/aqua accent colors per
// the existing video-card pattern.

import { useState } from "react";
import type { ProfileAnalysisEmbedData } from "@/lib/companion/turn-script";
import { ViralVideoPlayer } from "@/components/video/ViralVideoPlayer";

interface Props {
  data: ProfileAnalysisEmbedData;
}

function fmtCount(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function fmtPct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function fmtSignedPct(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${Math.round(n)}%`;
}

function fmtSignedRatio(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${Math.round(n * 100)}pp`;
}

export default function ProfileAnalysisEmbed({ data }: Props) {
  const [playingTopIdx, setPlayingTopIdx] = useState<number | null>(null);
  const cadenceFmt = data.cadence.posts_per_week.toFixed(1);
  const outlierTop = data.outlier_band.median > 0
    ? (data.outlier_band.top / data.outlier_band.median).toFixed(1)
    : "—";

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(234,230,220,0.10)",
        padding: 14,
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        {data.profilePicUrl ? (
          <img
            src={data.profilePicUrl}
            alt=""
            className="w-10 h-10 rounded-full object-cover flex-shrink-0"
            style={{ border: "1px solid rgba(234,230,220,0.15)" }}
          />
        ) : (
          <div
            className="w-10 h-10 rounded-full flex-shrink-0"
            style={{
              background: "linear-gradient(135deg, #4a3a30 0%, #2a1808 100%)",
              border: "1px solid rgba(234,230,220,0.15)",
            }}
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold" style={{ color: "rgba(234,230,220,0.95)" }}>
            @{data.handle}
          </div>
          <div className="text-[10px]" style={{ color: "rgba(234,230,220,0.55)" }}>
            {fmtCount(data.followers)} followers · {data.platform}
          </div>
        </div>
        <div className="flex gap-1.5 flex-shrink-0">
          <span
            className="text-[10px] px-2 py-1 rounded font-jetbrains"
            style={{
              background: "rgba(143,208,213,0.12)",
              color: "rgba(143,208,213,0.95)",
              border: "1px solid rgba(143,208,213,0.20)",
            }}
          >
            audience {data.audience_score}/10
          </span>
          <span
            className="text-[10px] px-2 py-1 rounded font-jetbrains"
            style={{
              background: "rgba(224,165,96,0.12)",
              color: "rgba(224,165,96,0.95)",
              border: "1px solid rgba(224,165,96,0.20)",
            }}
          >
            unique {data.uniqueness_score}/10
          </span>
        </div>
      </div>

      {/* Quick stats row */}
      <div
        className="flex gap-3 text-[11px] mb-3 pb-3 font-jetbrains"
        style={{
          color: "rgba(234,230,220,0.70)",
          borderBottom: "1px solid rgba(234,230,220,0.08)",
        }}
      >
        <span><span style={{ color: "#E0A560" }}>{cadenceFmt}</span> posts/wk</span>
        <span>·</span>
        <span>
          {Object.entries(data.format_mix)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 2)
            .map(([k, v]) => `${fmtPct(v)} ${k}`)
            .join(" / ")}
        </span>
        <span>·</span>
        <span><span style={{ color: "#E0A560" }}>{outlierTop}×</span> outlier top</span>
      </div>

      {/* Hook patterns */}
      {data.hook_patterns.length > 0 && (
        <div className="mb-3">
          <div
            className="text-[9px] font-semibold uppercase tracking-wider mb-1.5"
            style={{ color: "rgba(143,208,213,0.90)" }}
          >
            Hook patterns
          </div>
          <div className="space-y-1">
            {data.hook_patterns.slice(0, 4).map((hp, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px] leading-snug">
                <span style={{ color: "rgba(224,165,96,0.95)", minWidth: 32, fontVariantNumeric: "tabular-nums" }}>
                  {fmtPct(hp.frequency)}
                </span>
                <span style={{ color: "rgba(234,230,220,0.85)" }}>
                  <span style={{ fontWeight: 600 }}>{hp.pattern}</span>
                  {hp.example && (
                    <span style={{ color: "rgba(234,230,220,0.55)" }}> — "{hp.example}"</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top posts */}
      {data.top_posts.length > 0 && (
        <div className="mb-3">
          <div
            className="text-[9px] font-semibold uppercase tracking-wider mb-1.5"
            style={{ color: "rgba(143,208,213,0.90)" }}
          >
            Top {Math.min(3, data.top_posts.length)} posts
          </div>
          <div className="flex gap-2">
            {data.top_posts.slice(0, 3).map((p, i) => (
              <div
                key={p.id}
                className="relative flex-1"
                style={{
                  aspectRatio: "9 / 16",
                  background: "#1a1410",
                  borderRadius: 6,
                  overflow: "hidden",
                  cursor: "pointer",
                }}
                onClick={() => setPlayingTopIdx(playingTopIdx === i ? null : i)}
              >
                {playingTopIdx === i ? (
                  <ViralVideoPlayer
                    src={null}
                    fallbackProxyUrl={p.video_url
                      ? `https://connectacreators.com/api/stream-reel?url=${encodeURIComponent(p.video_url)}&nocache=1`
                      : null}
                    aspectRatio="9:16"
                    compact
                  />
                ) : (
                  <>
                    {p.thumbnail ? (
                      <img
                        src={p.thumbnail}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    ) : (
                      <div
                        className="absolute inset-0"
                        style={{ background: "linear-gradient(135deg, #4a3a30 0%, #2a1808 100%)" }}
                      />
                    )}
                    <div
                      className="absolute top-1 right-1 px-1.5 py-0.5 rounded text-[9px] font-bold"
                      style={{ background: "rgba(0,0,0,0.75)", color: "#E0A560" }}
                    >
                      {p.outlier_ratio.toFixed(1)}×
                    </div>
                    <div
                      className="absolute bottom-1 left-1 right-1 text-[8px] truncate font-jetbrains"
                      style={{ color: "rgba(234,230,220,0.90)" }}
                    >
                      {fmtCount(p.views)} views
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Comparison section — only when present */}
      {data.comparison && (
        <div
          className="mt-3 pt-3"
          style={{ borderTop: "1px solid rgba(234,230,220,0.10)" }}
        >
          <div
            className="text-[9px] font-semibold uppercase tracking-wider mb-1.5"
            style={{ color: "rgba(143,208,213,0.90)" }}
          >
            vs competitors
          </div>
          <div className="space-y-1.5 text-[11px] leading-snug">
            <div style={{ color: "rgba(234,230,220,0.85)" }}>
              <span style={{ fontWeight: 600 }}>Cadence:</span>{" "}
              <span style={{ color: data.comparison.cadence_delta_pct < 0 ? "#E0A560" : "#8FD0D5", fontWeight: 600 }}>
                {fmtSignedPct(data.comparison.cadence_delta_pct)}
              </span>
              <span style={{ color: "rgba(234,230,220,0.55)" }}> vs competitor avg</span>
            </div>
            {Object.keys(data.comparison.format_mix_delta).length > 0 && (
              <div style={{ color: "rgba(234,230,220,0.85)" }}>
                <span style={{ fontWeight: 600 }}>Format gap:</span>{" "}
                <span style={{ color: "rgba(234,230,220,0.70)" }}>
                  {Object.entries(data.comparison.format_mix_delta)
                    .filter(([, v]) => Math.abs(v) >= 0.05)
                    .map(([k, v]) => `${k} ${fmtSignedRatio(v)}`)
                    .join(", ") || "even"}
                </span>
              </div>
            )}
            {data.comparison.common_winning_hooks.length > 0 && (
              <div style={{ color: "rgba(234,230,220,0.85)" }}>
                <span style={{ fontWeight: 600 }}>Their winning hooks:</span>{" "}
                <span style={{ color: "rgba(234,230,220,0.70)" }}>
                  {data.comparison.common_winning_hooks.slice(0, 3).join(", ")}
                </span>
              </div>
            )}
            {data.comparison.where_youre_winning && (
              <div style={{ color: "rgba(234,230,220,0.70)" }}>
                <span style={{ color: "#8FD0D5", fontWeight: 600 }}>You win:</span>{" "}
                {data.comparison.where_youre_winning}
              </div>
            )}
            {data.comparison.where_theyre_winning && (
              <div style={{ color: "rgba(234,230,220,0.70)" }}>
                <span style={{ color: "#E0A560", fontWeight: 600 }}>They win:</span>{" "}
                {data.comparison.where_theyre_winning}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
