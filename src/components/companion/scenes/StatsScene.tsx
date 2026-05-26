// src/components/companion/scenes/StatsScene.tsx
import SceneFrame from "./SceneFrame";
import type { SceneEvent } from "@/lib/companion/turn-script";

interface Props { scene: Extract<SceneEvent, { type: "stats" }>; }

/**
 * Editorial stats spread — chart at final state, no bar-grow animation.
 * The numbers carry it. Caveat scribble call-out optional.
 */
export default function StatsScene({ scene }: Props) {
  const { verb, meta, payload } = scene;
  const maxValue = Math.max(...payload.bars.map((b) => b.value), 1);
  const totalWidth = 280;
  const barWidth = totalWidth / payload.bars.length - 10;

  return (
    <SceneFrame verb={verb} meta={meta}>
      <div
        className="px-5 py-5 sm:px-6"
        style={{
          background: "#fdf3d6",
          color: "#1a1410",
          border: "1px solid rgba(26,20,16,0.85)",
          borderRadius: 6,
          fontFamily: "var(--font-display, 'EB Garamond'), Georgia, serif",
        }}
      >
        <div className="flex justify-between items-baseline mb-3 gap-3">
          <div
            className="font-bold text-[9.5px] uppercase tracking-[0.18em]"
            style={{ color: "rgba(176,72,72,0.85)", fontFamily: "Inter, sans-serif" }}
          >
            {payload.label}
          </div>
          {payload.scribble && (
            <div className="font-caveat text-[14px]" style={{ color: "#b04848" }}>
              {payload.scribble}
            </div>
          )}
        </div>
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="text-[44px] font-medium leading-none" style={{ color: "#1a1410" }}>
            {payload.big_value}
          </span>
          {payload.delta && (
            <span
              className="text-[13px] font-bold px-2 py-0.5 border rounded font-jetbrains"
              style={{ color: "#2a6f77", borderColor: "rgba(42,111,119,0.55)", background: "transparent" }}
            >
              {payload.delta}
            </span>
          )}
        </div>
        <div className="mt-3.5 h-[90px] relative" style={{ borderBottom: "1px solid rgba(26,20,16,0.18)" }}>
          <svg viewBox={`0 0 ${totalWidth} 100`} preserveAspectRatio="none" className="w-full h-full">
            {payload.bars.map((b, i) => {
              const height = (b.value / maxValue) * 86 + 6;
              const x = i * (barWidth + 10) + 5;
              const y = 100 - height;
              return (
                <rect
                  key={i}
                  x={x}
                  y={y}
                  width={barWidth}
                  height={height}
                  fill={b.highlight ? "#1a1410" : "rgba(26,20,16,0.35)"}
                />
              );
            })}
            {payload.peak_label && (
              <text
                x={totalWidth - barWidth / 2 - 5}
                y={8}
                textAnchor="middle"
                className="font-caveat"
                fill="#b04848"
                fontSize={14}
              >
                {payload.peak_label}
              </text>
            )}
          </svg>
        </div>
        <div className="flex justify-between mt-1 font-jetbrains text-[9.5px]" style={{ color: "rgba(26,20,16,0.5)" }}>
          {payload.bars.map((b, i) => <span key={i}>{b.label}</span>)}
        </div>
      </div>
    </SceneFrame>
  );
}
