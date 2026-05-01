import { memo } from "react";
import type { RemoteCursor } from "@/hooks/useRealtimeCanvasSync";

interface Props {
  cursors: RemoteCursor[];
  viewport: { x: number; y: number; zoom: number };
}

/**
 * Renders other users' cursors on the canvas as colored pointer arrows
 * with their animal name label. Cursor positions are in flow coordinates —
 * transformed to screen space using the current viewport.
 */
function RemoteCursorsInner({ cursors, viewport }: Props) {
  if (cursors.length === 0) return null;

  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex: 50 }}
    >
      {cursors.map(cursor => {
        // Transform flow coordinates → screen coordinates
        const screenX = cursor.x * viewport.zoom + viewport.x;
        const screenY = cursor.y * viewport.zoom + viewport.y;

        return (
          <div
            key={cursor.tabId}
            className="absolute"
            style={{
              transform: `translate(${screenX}px, ${screenY}px)`,
              transition: "transform 80ms ease-out",
              willChange: "transform",
            }}
          >
            {/* Cursor arrow SVG */}
            <svg
              width="10"
              height="13"
              viewBox="0 0 16 20"
              fill="none"
              style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.5))" }}
            >
              <path
                d="M0.5 0.5L15 10.5L8 11.5L5 19.5L0.5 0.5Z"
                fill={cursor.color}
                stroke="white"
                strokeWidth="0.8"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        );
      })}
    </div>
  );
}

const RemoteCursors = memo(RemoteCursorsInner);
export default RemoteCursors;
