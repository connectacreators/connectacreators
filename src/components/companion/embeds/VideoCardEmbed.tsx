// src/components/companion/embeds/VideoCardEmbed.tsx
import type { VideoCardEmbedData } from "@/lib/companion/turn-script";

interface Props {
  data: VideoCardEmbedData;
  onClick?: (id: string) => void;
}

function fmtViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export default function VideoCardEmbed({ data, onClick }: Props) {
  return (
    <div
      className="rounded-xl overflow-hidden cursor-pointer transition-all"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(234,230,220,0.12)",
      }}
      onClick={() => onClick?.(data.id)}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.borderColor = "rgba(143,208,213,0.40)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "";
        e.currentTarget.style.borderColor = "rgba(234,230,220,0.12)";
      }}
    >
      <div className="relative" style={{ aspectRatio: "9 / 16", background: "#1a1410", overflow: "hidden" }}>
        {data.thumbnail_url ? (
          <img src={data.thumbnail_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(135deg, #4a3a30 0%, #2a1808 100%)" }}
          />
        )}
        {data.caption_overlay && (
          <div
            className="absolute top-3 left-1.5 right-1.5 text-center font-bold text-[9px] leading-tight"
            style={{ color: "#fff", textShadow: "1px 1px 0 #000" }}
          >
            {data.caption_overlay}
          </div>
        )}
        <div
          className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[8.5px] font-bold tracking-wider"
          style={{ background: "rgba(0,0,0,0.7)", color: "#E0A560" }}
        >
          {data.outlier.toFixed(1)}x
        </div>
        <div className="absolute bottom-1.5 left-1.5 text-[10px]" style={{ color: "rgba(255,255,255,0.75)" }}>
          @{data.username}
        </div>
      </div>
      <div className="px-2.5 py-2">
        {data.format_hint && (
          <div className="text-[10px] font-semibold truncate" style={{ color: "rgba(234,230,220,0.7)" }}>
            {data.format_hint}
          </div>
        )}
        <div className="flex gap-2 mt-1 font-jetbrains text-[9.5px]" style={{ color: "rgba(234,230,220,0.85)" }}>
          <span style={{ color: "#E0A560" }}>{fmtViews(data.views)}</span>
          <span>{data.engagement.toFixed(1)}%</span>
          <span>{data.age}</span>
        </div>
      </div>
    </div>
  );
}
