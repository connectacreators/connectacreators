// src/components/companion/scenes/ThinkingScene.tsx
import SceneFrame from "./SceneFrame";
import type { SceneEvent } from "@/lib/companion/turn-script";

interface Props { scene: Extract<SceneEvent, { type: "thinking" }>; }

/**
 * The ONLY scene where the fingerprint avatar pulses. Used when Robby ran
 * no tools and is purely reasoning. Per spec, the fingerprint never appears
 * as a generic loading state for tool calls.
 */
export default function ThinkingScene({ scene }: Props) {
  return (
    <SceneFrame verb={scene.verb} meta={scene.meta} hideDot>
      <div className="flex items-center gap-3 py-2">
        <div
          className="w-7 h-7 rounded-full relative flex-shrink-0"
          style={{
            background: "radial-gradient(circle at 35% 35%, rgba(143,208,213,0.6), rgba(143,208,213,0.1) 70%)",
            border: "1px solid rgba(143,208,213,0.35)",
            animation: "think-pulse 1.8s ease-in-out infinite",
          }}
        >
          <span
            className="absolute rounded-full"
            style={{ inset: 4, border: "1px solid rgba(143,208,213,0.45)" }}
          />
          <span
            className="absolute rounded-full"
            style={{ inset: 9, border: "1px solid rgba(143,208,213,0.45)" }}
          />
        </div>
        <span
          style={{
            fontFamily: "'EB Garamond', Georgia, serif",
            fontStyle: "italic",
            fontSize: 14,
            color: "rgba(234,230,220,0.65)",
          }}
        >
          {scene.payload.hint}
        </span>
      </div>
    </SceneFrame>
  );
}
