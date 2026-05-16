// src/components/companion/scenes/VideoAnalysisScene.tsx
import SceneFrame from "./SceneFrame";
import type { SceneEvent } from "@/lib/companion/turn-script";

interface Props { scene: Extract<SceneEvent, { type: "video-analysis" }>; }

const SECTION_COLOR = {
  hook: { bg: "rgba(224,165,96,0.40)", border: "#E0A560", text: "#E0A560", word_bg: "rgba(224,165,96,0.20)", word_text: "#ffd07a" },
  body: { bg: "rgba(143,208,213,0.25)", border: "#8FD0D5", text: "#8FD0D5", word_bg: "rgba(143,208,213,0.15)", word_text: "#b5e4e8" },
  cta:  { bg: "rgba(127,180,138,0.30)", border: "#7fb48a", text: "#7fb48a", word_bg: "rgba(127,180,138,0.18)", word_text: "#b8e0c0" },
} as const;

export default function VideoAnalysisScene({ scene }: Props) {
  const { verb, meta, payload } = scene;
  const duration = Math.max(...payload.markers.map((m) => m.end), 1);

  return (
    <SceneFrame verb={verb} meta={meta}>
      <div className="grid gap-4" style={{ gridTemplateColumns: "200px 1fr" }}>
        <div
          className="relative rounded-xl overflow-hidden"
          style={{
            aspectRatio: "9 / 16",
            background: payload.video_url
              ? "#0a0d12"
              : "linear-gradient(135deg, #2a4838 0%, #0a1810 100%)",
            border: "2px solid rgba(234,230,220,0.20)",
            boxShadow: "4px 5px 0 rgba(0,0,0,0.4)",
          }}
        >
          {payload.video_url ? (
            <video src={payload.video_url} className="w-full h-full object-cover" muted autoPlay loop playsInline />
          ) : payload.caption ? (
            <div
              className="absolute top-3.5 left-2 right-2 text-center font-bold text-[13px]"
              style={{ color: "#ffe488", textShadow: "1px 1px 0 #000", lineHeight: 1.1 }}
            >
              "{payload.caption}"
            </div>
          ) : null}
          <div
            className="absolute top-0 left-0 right-0 h-[3px]"
            style={{
              background: "linear-gradient(90deg, transparent, #8FD0D5, transparent)",
              boxShadow: "0 0 10px #8FD0D5",
              animation: "scanline 2s ease-in-out infinite",
            }}
          />
          <div className="absolute bottom-0 left-0 right-0 h-[5px]" style={{ background: "rgba(0,0,0,0.6)" }}>
            <div style={{ height: "100%", background: "#E0A560", animation: "pb-fill 4s linear forwards", width: 0 }} />
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <div
            className="relative h-[38px] rounded-md mt-5"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(234,230,220,0.10)" }}
          >
            <div
              className="absolute -top-4 left-1 font-bold text-[9px] uppercase tracking-widest"
              style={{ color: "rgba(234,230,220,0.6)", fontFamily: "Inter, sans-serif" }}
            >
              timeline
            </div>
            {payload.markers.map((m, i) => {
              const c = SECTION_COLOR[m.section];
              const left = (m.start / duration) * 100;
              const width = ((m.end - m.start) / duration) * 100;
              return (
                <div
                  key={i}
                  className="absolute top-1 bottom-1 rounded"
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    background: c.bg,
                    border: `1px solid ${c.border}`,
                    opacity: 0,
                    animation: `broadcast-fade-in 0.4s ease-out ${0.6 + i * 0.6}s forwards`,
                  }}
                >
                  <div
                    className="absolute top-full mt-0.5 font-caveat whitespace-nowrap text-[12px]"
                    style={{ color: c.text }}
                  >
                    {m.label}
                  </div>
                </div>
              );
            })}
            <div
              className="absolute -top-0.5 -bottom-0.5 w-0.5"
              style={{
                background: "#E0A560",
                boxShadow: "0 0 8px #E0A560",
                left: 0,
                animation: "playhead-sweep 4s linear forwards",
              }}
            />
          </div>
          <div
            className="flex-1 rounded-lg px-4 py-3 mt-6"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(234,230,220,0.10)",
              fontFamily: "'EB Garamond', Georgia, serif",
              fontSize: 14.5,
              lineHeight: 1.55,
              color: "rgba(234,230,220,0.92)",
            }}
          >
            {payload.transcript.map((t, i) => {
              const c = SECTION_COLOR[t.section];
              return (
                <span
                  key={i}
                  className="inline-block mr-1"
                  style={{
                    background: c.word_bg,
                    color: c.word_text,
                    padding: "0 3px",
                    borderRadius: 2,
                    opacity: 0,
                    animation: `broadcast-fade-in 0.15s ease-out ${0.1 + i * 0.1}s forwards`,
                  }}
                >
                  {t.word}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </SceneFrame>
  );
}
