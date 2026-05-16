// src/components/companion/scenes/DraftingScene.tsx
import SceneFrame from "./SceneFrame";
import type { SceneEvent } from "@/lib/companion/turn-script";

interface Props { scene: Extract<SceneEvent, { type: "drafting" }>; }

// Stagger each section's text reveal — the script types itself in
// section by section so the user can watch Robby write.
function typeMs(text: string): number {
  return Math.max(600, Math.min(2400, text.length * 20));
}

/**
 * Editorial script page — a quiet manuscript spread that types itself in
 * section by section. Bone surface, ink hairline, red eyebrow tags.
 */
export default function DraftingScene({ scene }: Props) {
  const { verb, meta, payload } = scene;
  const sectionOffsets = payload.sections.map((_, i) => i * 1.6);

  return (
    <SceneFrame verb={verb} meta={meta}>
      <div
        className="px-5 py-5 sm:px-6"
        style={{
          background: "#fdf3d6",
          color: "#1a1410",
          border: "1px solid rgba(26,20,16,0.85)",
          borderRadius: 6,
          fontFamily: "'EB Garamond', Georgia, serif",
        }}
      >
        {payload.sections.map((s, i) => {
          // Fade-in finishes at sectionOffsets[i] + 0.35s → start typing 50ms later
          // so the user sees the card settle first, then the text writes itself in.
          const fadeDuration = 0.35;
          const typeStart = sectionOffsets[i] + fadeDuration + 0.05;
          return (
            <div
              key={i}
              className={i < payload.sections.length - 1 ? "mb-4" : ""}
              style={{
                opacity: 0,
                animation: `broadcast-fade-in ${fadeDuration}s ease-out ${sectionOffsets[i]}s forwards`,
              }}
            >
              <div
                className="font-bold text-[9.5px] uppercase tracking-[0.18em] mb-1"
                style={{ color: "rgba(176,72,72,0.85)", fontFamily: "Inter, sans-serif" }}
              >
                {s.tag}
              </div>
              <div
                className="text-[16px] leading-snug"
                style={{
                  color: "#1a1410",
                  whiteSpace: "pre-wrap",
                  animation: `broadcast-type-in ${typeMs(s.body)}ms steps(80, end) ${typeStart}s backwards`,
                }}
                dangerouslySetInnerHTML={{
                  __html: s.body.replace(
                    /<scribble>(.*?)<\/scribble>/g,
                    '<span class="scribble-wavy">$1</span>',
                  ),
                }}
              />
            </div>
          );
        })}
        {(payload.est_outlier || payload.read_time_sec || payload.matches_note) && (
          <div
            className="mt-4 pt-3 flex flex-wrap gap-2.5 items-center text-[11px]"
            style={{
              borderTop: "1px solid rgba(26,20,16,0.18)",
              color: "rgba(26,20,16,0.55)",
              fontFamily: "Inter, sans-serif",
            }}
          >
            {payload.est_outlier && <span style={{ color: "#1a1410", fontWeight: 600 }}>est. {payload.est_outlier.toFixed(1)}x</span>}
            {payload.read_time_sec && <><span>·</span><span>{payload.read_time_sec}s read</span></>}
            {payload.matches_note && <><span>·</span><span>{payload.matches_note}</span></>}
          </div>
        )}
      </div>
    </SceneFrame>
  );
}
