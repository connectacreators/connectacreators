// src/components/companion/scenes/ScanningScene.tsx
import SceneFrame from "./SceneFrame";
import type { SceneEvent } from "@/lib/companion/turn-script";

interface Props { scene: Extract<SceneEvent, { type: "scanning" }>; }

const STATUS_LABEL: Record<string, string> = {
  queued: "queued",
  checking: "checking",
  done: "no updates",
  hit: "new",
};

/**
 * Editorial scanning list — quiet table-of-contents look. No glow, no
 * pulse, no spinning icons. Real channels with their status as dotted
 * leaders. The "live" feel comes from showing real results.
 */
export default function ScanningScene({ scene }: Props) {
  const { verb, meta, payload } = scene;
  return (
    <SceneFrame verb={verb} meta={meta}>
      <div className="flex flex-col">
        {payload.channels.map((c, i) => {
          const isHit = c.status === "hit";
          const isQueued = c.status === "queued";
          const tone = isHit
            ? "#1a1410"
            : isQueued
              ? "rgba(234,230,220,0.35)"
              : "rgba(234,230,220,0.78)";
          return (
            <div
              key={c.id}
              className="flex items-baseline gap-3 py-1.5"
              style={{
                borderBottom: i < payload.channels.length - 1
                  ? "1px solid rgba(234,230,220,0.08)"
                  : "none",
              }}
            >
              <span
                className="flex-shrink-0 font-jetbrains text-[10px]"
                style={{ color: "rgba(234,230,220,0.35)", width: 18 }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span
                className="font-medium text-[13px] flex-shrink-0"
                style={{
                  color: tone === "#1a1410" ? "#EAE6DC" : tone,
                  fontFamily: "'EB Garamond', Georgia, serif",
                  fontStyle: isHit ? "italic" : "normal",
                }}
              >
                @{c.username}
              </span>
              <span
                aria-hidden
                className="flex-1"
                style={{
                  borderBottom: "1px dotted rgba(234,230,220,0.18)",
                  transform: "translateY(-3px)",
                }}
              />
              <span
                className="font-jetbrains text-[10px] flex-shrink-0"
                style={{
                  color: isHit
                    ? "#E0A560"
                    : c.status === "done"
                      ? "rgba(127,180,138,0.65)"
                      : "rgba(234,230,220,0.45)",
                  letterSpacing: "0.04em",
                }}
              >
                {c.note ?? STATUS_LABEL[c.status] ?? c.status}
              </span>
            </div>
          );
        })}
      </div>
      {payload.summary && (
        <div
          className="mt-3 text-[13px]"
          style={{
            fontFamily: "'EB Garamond', Georgia, serif",
            fontStyle: "italic",
            color: "rgba(234,230,220,0.78)",
          }}
        >
          {payload.summary}
        </div>
      )}
    </SceneFrame>
  );
}
