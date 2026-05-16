// src/components/companion/scenes/SceneFrame.tsx
import { ReactNode } from "react";

interface Props {
  verb: string;            // italic EB Garamond verb, e.g. "Scanning your chiropractor niche…"
  meta: string;            // JetBrains Mono technical sub-meta
  children: ReactNode;     // the scene-specific content
  /** Hide the pulsing aqua "operation in progress" dot. Used by ThinkingScene. */
  hideDot?: boolean;
}

/**
 * Shared frame around every activity scene. Provides:
 *   • A pulsing aqua dot indicating an operation is in progress.
 *   • The italic verb line (EB Garamond, ~16px).
 *   • The JetBrains-Mono meta line (technical context, sub-text).
 *   • A slot for the scene-specific content below.
 *
 * The frame itself is dark (matches /ai page bg), so individual scenes
 * supply their own bone/ink surfaces as needed.
 */
export default function SceneFrame({ verb, meta, children, hideDot }: Props) {
  return (
    <div
      className="rounded-3xl p-5 my-3"
      style={{
        background: "#0d1015",
        border: "1px solid rgba(234,230,220,0.10)",
      }}
    >
      {verb && (
        <div className="flex items-center gap-2.5 mb-1">
          {!hideDot && (
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{
                background: "#8FD0D5",
                boxShadow: "0 0 10px #8FD0D5",
                animation: "broadcast-pulse 1.4s ease-in-out infinite",
              }}
            />
          )}
          <span
            style={{
              fontFamily: "'EB Garamond', Georgia, serif",
              fontStyle: "italic",
              fontSize: 16,
              color: "rgba(234,230,220,0.85)",
              lineHeight: 1.4,
            }}
          >
            {verb}
          </span>
        </div>
      )}
      {meta && (
        <div
          className="font-jetbrains mb-3"
          style={{
            fontSize: 10,
            color: "rgba(234,230,220,0.45)",
            letterSpacing: "0.04em",
          }}
        >
          {meta}
        </div>
      )}
      {children}
    </div>
  );
}
