// src/components/companion/scenes/ThinkingScene.tsx
import SceneFrame from "./SceneFrame";
import type { SceneEvent } from "@/lib/companion/turn-script";

interface Props { scene: Extract<SceneEvent, { type: "thinking" }>; }

/**
 * Quiet thinking indicator — three small dots cycling under the italic
 * hint. The fingerprint avatar is dropped entirely in the editorial pass:
 * the verb + dots carry it, no glowing halo.
 */
export default function ThinkingScene({ scene }: Props) {
  return (
    <SceneFrame verb={scene.verb} meta={scene.meta} hideDot>
      <div className="flex items-center gap-2 py-1">
        <span
          style={{
            fontFamily: "var(--font-display, 'EB Garamond'), Georgia, serif",
            fontStyle: "italic",
            fontSize: 14,
            color: "hsl(var(--bone) / 0.65)",
          }}
        >
          {scene.payload.hint}
        </span>
        <span className="flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="inline-block rounded-full"
              style={{
                width: 4,
                height: 4,
                background: "hsl(var(--bone) / 0.45)",
                animation: `broadcast-pulse 1.4s ease-in-out ${i * 0.18}s infinite`,
              }}
            />
          ))}
        </span>
      </div>
    </SceneFrame>
  );
}
