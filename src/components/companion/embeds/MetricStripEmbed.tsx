// src/components/companion/embeds/MetricStripEmbed.tsx
import type { MetricStripEmbedData } from "@/lib/companion/turn-script";

interface Props { data: MetricStripEmbedData; }

export default function MetricStripEmbed({ data }: Props) {
  const maxValue = Math.max(...data.bars.map((b) => b.value), 1);
  const totalWidth = 280;

  return (
    <div className="broadcast-card p-4">
      <div className="flex justify-between items-baseline mb-2.5 gap-2">
        <div
          className="font-bold text-[9px] uppercase tracking-widest"
          style={{ color: "#b04848", fontFamily: "Inter, sans-serif" }}
        >
          {data.label}
        </div>
        {data.scribble && (
          <div className="font-caveat text-[13px]" style={{ color: "#b04848" }}>
            {data.scribble}
          </div>
        )}
      </div>
      <div className="flex items-baseline gap-2.5">
        <span
          className="text-[34px] font-medium leading-none"
          style={{ color: "#1a1410", fontFamily: "var(--font-display, 'EB Garamond'), Georgia, serif" }}
        >
          {data.big_value}
        </span>
        {data.delta && (
          <span
            className="text-[12px] font-bold px-2 py-0.5 border-[1.5px] rounded font-jetbrains"
            style={{
              color: "#2a6f77",
              borderColor: "#2a6f77",
              background: "rgba(42,111,119,0.10)",
              transform: "rotate(-2deg)",
            }}
          >
            {data.delta}
          </span>
        )}
      </div>
      <svg viewBox={`0 0 ${totalWidth} 60`} preserveAspectRatio="none" className="w-full h-[34px] mt-2">
        {(() => {
          const points = data.bars.map((b, i) => {
            const x = (i / (data.bars.length - 1 || 1)) * (totalWidth - 8) + 4;
            const y = 56 - (b.value / maxValue) * 50;
            return `${x},${y}`;
          });
          return <polyline points={points.join(" ")} fill="none" stroke="#1a1410" strokeWidth={2} strokeLinecap="round" />;
        })()}
      </svg>
    </div>
  );
}
