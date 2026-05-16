// src/components/companion/scenes/StatsScene.tsx
import SceneFrame from "./SceneFrame";
import type { SceneEvent } from "@/lib/companion/turn-script";

interface Props { scene: Extract<SceneEvent, { type: "stats" }>; }

export default function StatsScene({ scene }: Props) {
  const { verb, meta, payload } = scene;
  const maxValue = Math.max(...payload.bars.map((b) => b.value), 1);
  const totalWidth = 280;
  const barWidth = totalWidth / payload.bars.length - 10;

  return (
    <SceneFrame verb={verb} meta={meta}>
      <div className="broadcast-card p-5 sm:p-6">
        <div className="flex justify-between items-baseline mb-4 gap-3">
          <div
            className="font-bold text-[10px] uppercase tracking-widest"
            style={{ color: "#b04848", fontFamily: "Inter, sans-serif" }}
          >
            {payload.label}
          </div>
          {payload.scribble && (
            <div className="font-caveat text-[15px]" style={{ color: "#b04848" }}>
              {payload.scribble}
            </div>
          )}
        </div>
        <div className="flex items-baseline gap-3.5 flex-wrap">
          <span
            className="text-[56px] font-medium leading-none"
            style={{ color: "#1a1410", fontFamily: "'EB Garamond', Georgia, serif" }}
          >
            {payload.big_value}
          </span>
          {payload.delta && (
            <span
              className="text-[16px] font-bold px-2.5 py-1 border-[1.5px] rounded-md inline-block font-jetbrains"
              style={{
                color: "#2a6f77",
                borderColor: "#2a6f77",
                background: "rgba(42,111,119,0.10)",
                transform: "rotate(-2deg)",
                opacity: 0,
                animation: "broadcast-fade-in 0.5s ease-out 2.4s forwards",
              }}
            >
              {payload.delta}
            </span>
          )}
        </div>
        <div className="mt-4 h-[110px] relative" style={{ borderBottom: "1.5px solid rgba(0,0,0,0.18)" }}>
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
                  fill={b.highlight ? "#E0A560" : "#1a1410"}
                  stroke={b.highlight ? "#1a1410" : "none"}
                  strokeWidth={1.5}
                  style={{
                    transformOrigin: `${x + barWidth / 2}px 100px`,
                    transform: "scaleY(0)",
                    animation: `bar-grow 1.2s ease-out ${0.3 + i * 0.25}s forwards`,
                  }}
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
                fontSize={16}
                style={{
                  opacity: 0,
                  animation: `broadcast-fade-in 0.4s ease-out ${0.3 + payload.bars.length * 0.25 + 0.3}s forwards`,
                }}
              >
                {payload.peak_label}
              </text>
            )}
          </svg>
        </div>
        <div className="flex justify-between mt-1.5 font-jetbrains text-[10px]" style={{ color: "rgba(26,20,16,0.55)" }}>
          {payload.bars.map((b, i) => <span key={i}>{b.label}</span>)}
        </div>
      </div>
    </SceneFrame>
  );
}
