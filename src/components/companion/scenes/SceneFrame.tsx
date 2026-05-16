// src/components/companion/scenes/SceneFrame.tsx
import { ReactNode } from "react";

interface Props {
  verb: string;
  meta: string;
  children: ReactNode;
  /** Hide the leading bullet. Used by ThinkingScene. */
  hideDot?: boolean;
}

/**
 * Shared frame around every activity scene. Quiet editorial header:
 *   • Italic EB Garamond verb line (no animation, no glow).
 *   • Small JetBrains Mono meta line under it.
 *   • Slot for the scene content below.
 *
 * No pulsing dots, no glows. The content is the story.
 */
export default function SceneFrame({ verb, meta, children, hideDot }: Props) {
  return (
    <div className="my-2 px-1">
      {verb && (
        <div className="flex items-baseline gap-2 mb-0.5">
          {!hideDot && (
            <span
              className="inline-block rounded-full flex-shrink-0"
              style={{ width: 4, height: 4, background: "rgba(234,230,220,0.45)" }}
            />
          )}
          <span
            style={{
              fontFamily: "'EB Garamond', Georgia, serif",
              fontStyle: "italic",
              fontSize: 15,
              color: "rgba(234,230,220,0.78)",
              lineHeight: 1.45,
            }}
          >
            {verb}
          </span>
        </div>
      )}
      {meta && (
        <div
          className="font-jetbrains mb-2.5"
          style={{
            fontSize: 10,
            color: "rgba(234,230,220,0.40)",
            letterSpacing: "0.04em",
            paddingLeft: hideDot ? 0 : 12,
          }}
        >
          {meta}
        </div>
      )}
      {children}
    </div>
  );
}
