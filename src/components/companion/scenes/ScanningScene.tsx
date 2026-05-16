// src/components/companion/scenes/ScanningScene.tsx
import SceneFrame from "./SceneFrame";
import type { SceneEvent } from "@/lib/companion/turn-script";

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg, #8FD0D5, #E0A560)",
  "linear-gradient(135deg, #c47272, #b88840)",
  "linear-gradient(135deg, #7fa0c4, #4a6890)",
  "linear-gradient(135deg, #c4a572, #6a4818)",
  "linear-gradient(135deg, #8FD0D5, #2a6f77)",
  "linear-gradient(135deg, #ff9090, #c44545)",
  "linear-gradient(135deg, #b8d090, #6a8a40)",
  "linear-gradient(135deg, #d8a0d0, #8048a0)",
];

interface Props { scene: Extract<SceneEvent, { type: "scanning" }>; }

export default function ScanningScene({ scene }: Props) {
  const { verb, meta, payload } = scene;
  return (
    <SceneFrame verb={verb} meta={meta}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {payload.channels.map((c, i) => {
          const isHit = c.status === "hit";
          const isDone = c.status === "done";
          const isChecking = c.status === "checking";
          const borderColor = isHit ? "rgba(224,165,96,0.5)"
            : isChecking ? "rgba(143,208,213,0.4)"
            : isDone ? "rgba(127,180,138,0.30)"
            : "rgba(234,230,220,0.10)";
          const bg = isHit ? "rgba(224,165,96,0.08)"
            : isChecking ? "rgba(143,208,213,0.05)"
            : isDone ? "rgba(127,180,138,0.04)"
            : "rgba(255,255,255,0.03)";
          const noteColor = isHit ? "#E0A560"
            : isDone ? "#7fb48a"
            : "rgba(234,230,220,0.45)";
          const iconColor = isHit ? "#E0A560"
            : isDone ? "#7fb48a"
            : isChecking ? "#8FD0D5"
            : "rgba(234,230,220,0.45)";
          return (
            <div
              key={c.id}
              className="flex items-center gap-2.5 p-2.5 rounded-lg text-xs"
              style={{
                background: bg,
                border: `1px solid ${borderColor}`,
                opacity: c.status === "queued" ? 0.4 : 1,
                boxShadow: isHit ? "3px 3px 0 rgba(0,0,0,0.4)" : undefined,
                animation: `broadcast-fade-in 0.4s ease-out ${i * 0.18}s backwards`,
              }}
            >
              <span
                className="w-7 h-7 rounded-full flex-shrink-0"
                style={{
                  background: AVATAR_GRADIENTS[(c.avatar_seed ?? 0) % AVATAR_GRADIENTS.length],
                  border: "1.5px solid rgba(0,0,0,0.5)",
                }}
              />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[11.5px] truncate" style={{ color: "#EAE6DC" }}>
                  @{c.username}
                </div>
                <div className="font-jetbrains text-[9px] mt-px truncate" style={{ color: noteColor }}>
                  {c.note ?? c.status}
                </div>
              </div>
              <span
                className="text-[11px] font-bold"
                style={{
                  color: iconColor,
                  display: "inline-block",
                  animation: isChecking ? "spin 1s linear infinite" : undefined,
                }}
              >
                {isHit ? "★" : isDone ? "✓" : isChecking ? "⟳" : "·"}
              </span>
              {isHit && (
                <span
                  className="w-1.5 h-1.5 rounded-full ml-1 flex-shrink-0"
                  style={{
                    background: "#E0A560",
                    boxShadow: "0 0 6px #E0A560",
                    animation: "broadcast-pulse 1.5s ease-in-out infinite",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
      {payload.summary && (
        <div
          className="mt-3.5 px-3.5 py-2.5 rounded-lg text-sm"
          style={{
            background: "rgba(224,165,96,0.10)",
            border: "1px solid rgba(224,165,96,0.30)",
            color: "#ffd07a",
            fontFamily: "'EB Garamond', Georgia, serif",
            fontStyle: "italic",
            animation: `broadcast-fade-in 0.5s ease-out ${payload.channels.length * 0.18 + 0.2}s backwards`,
          }}
        >
          {payload.summary}
        </div>
      )}
    </SceneFrame>
  );
}
