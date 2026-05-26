// src/components/companion/scenes/VideoAnalysisScene.tsx
import SceneFrame from "./SceneFrame";
import type { SceneEvent } from "@/lib/companion/turn-script";

interface Props { scene: Extract<SceneEvent, { type: "video-analysis" }>; }

const SECTION_LABEL = { hook: "Hook", body: "Body", cta: "CTA" } as const;
const SECTION_INK   = { hook: "#b08040", body: "#3d6f74", cta: "#4a6f4f" } as const;
const SECTION_TINT  = { hook: "rgba(176,128,64,0.10)", body: "rgba(61,111,116,0.10)", cta: "rgba(74,111,79,0.10)" } as const;

/**
 * Editorial video analysis spread — video frame on left, marker timeline +
 * transcript on right. No scanline beam, no playhead sweep, no glow.
 * Words tinted by section so the transcript reads as a typeset spread.
 */
export default function VideoAnalysisScene({ scene }: Props) {
  const { verb, meta, payload } = scene;
  const duration = Math.max(...payload.markers.map((m) => m.end), 1);

  return (
    <SceneFrame verb={verb} meta={meta}>
      <div className="grid gap-4" style={{ gridTemplateColumns: "180px 1fr" }}>
        <div
          className="relative overflow-hidden"
          style={{
            aspectRatio: "9 / 16",
            background: payload.video_url
              ? "#0a0d12"
              : "linear-gradient(135deg, #2a4838 0%, #0a1810 100%)",
            border: "1px solid rgba(234,230,220,0.18)",
            borderRadius: 4,
          }}
        >
          {payload.video_url ? (
            <video src={payload.video_url} className="w-full h-full object-cover" muted autoPlay loop playsInline />
          ) : payload.caption ? (
            <div
              className="absolute top-3 left-2 right-2 text-center font-bold text-[12px]"
              style={{ color: "#ffe488", textShadow: "1px 1px 0 #000", lineHeight: 1.1 }}
            >
              "{payload.caption}"
            </div>
          ) : null}
        </div>
        <div className="flex flex-col gap-3">
          <div
            className="relative h-[32px] flex"
            style={{ borderBottom: "1px solid rgba(234,230,220,0.10)" }}
          >
            {payload.markers.map((m, i) => {
              const left = (m.start / duration) * 100;
              const width = ((m.end - m.start) / duration) * 100;
              return (
                <div
                  key={i}
                  className="absolute top-0 bottom-0"
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    background: SECTION_TINT[m.section],
                    borderLeft: `1px solid ${SECTION_INK[m.section]}`,
                  }}
                >
                  <div
                    className="absolute top-1 left-1.5 font-jetbrains text-[9px] uppercase tracking-widest"
                    style={{ color: SECTION_INK[m.section] }}
                  >
                    {m.label}
                  </div>
                </div>
              );
            })}
          </div>
          <div
            className="flex-1"
            style={{
              fontFamily: "var(--font-display, 'EB Garamond'), Georgia, serif",
              fontSize: 14,
              lineHeight: 1.65,
              color: "rgba(234,230,220,0.85)",
            }}
          >
            {payload.transcript.map((t, i) => (
              <span
                key={i}
                className="inline mr-1"
                style={{ color: SECTION_INK[t.section] }}
                title={SECTION_LABEL[t.section]}
              >
                {t.word}
              </span>
            ))}
          </div>
        </div>
      </div>
    </SceneFrame>
  );
}
