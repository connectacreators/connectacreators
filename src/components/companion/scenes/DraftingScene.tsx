// src/components/companion/scenes/DraftingScene.tsx
import SceneFrame from "./SceneFrame";
import type { SceneEvent } from "@/lib/companion/turn-script";

interface Props { scene: Extract<SceneEvent, { type: "drafting" }>; }

// Word count → animation duration (rough type-on pacing).
function typeMs(text: string): number {
  return Math.max(600, Math.min(2400, text.length * 22));
}

export default function DraftingScene({ scene }: Props) {
  const { verb, meta, payload } = scene;

  // Stagger each section's appearance + type-on by 1.8s.
  const offsets = payload.sections.map((_, i) => i * 1.8);

  return (
    <SceneFrame verb={verb} meta={meta}>
      <div className="broadcast-card relative p-5 sm:p-6">
        <div
          className="absolute -top-3 right-5 px-3 py-1 text-[10px] font-bold uppercase tracking-widest"
          style={{
            background: "#E0A560",
            color: "#1a1410",
            border: "2px solid #1a1410",
            borderRadius: 4,
            boxShadow: "3px 3px 0 #1a1410",
            transform: "rotate(2deg)",
            fontFamily: "Inter, sans-serif",
          }}
        >
          draft v1
        </div>
        {payload.sections.map((s, i) => (
          <div
            key={i}
            className={i < payload.sections.length - 1 ? "mb-4" : ""}
            style={{
              opacity: 0,
              animation: `broadcast-fade-in 0.5s ease-out ${offsets[i]}s forwards`,
            }}
          >
            <div
              className="font-bold text-[10px] uppercase tracking-widest mb-1.5"
              style={{ color: "#b04848", fontFamily: "Inter, sans-serif" }}
            >
              {s.tag}
            </div>
            <div
              className="text-[17px] leading-snug"
              style={{
                color: "#1a1410",
                fontFamily: "'EB Garamond', Georgia, serif",
                whiteSpace: "pre-wrap",
                animation: `broadcast-type-in ${typeMs(s.body)}ms ease-out ${offsets[i] + 0.2}s backwards`,
              }}
              // Allow <scribble>...</scribble> markup in body to render the
              // wavy-red callout used on the punchline. Safe — body comes from
              // our own scene payload, never user input directly.
              dangerouslySetInnerHTML={{
                __html: s.body.replace(
                  /<scribble>(.*?)<\/scribble>/g,
                  '<span class="scribble-wavy">$1</span>',
                ),
              }}
            />
          </div>
        ))}
        {(payload.est_outlier || payload.read_time_sec || payload.matches_note) && (
          <div
            className="mt-4 pt-3.5 flex flex-wrap gap-3 items-center text-[11.5px]"
            style={{
              borderTop: "1.5px dashed rgba(0,0,0,0.18)",
              color: "rgba(26,20,16,0.65)",
              fontFamily: "Inter, sans-serif",
              opacity: 0,
              animation: `broadcast-fade-in 0.5s ease-out ${offsets[offsets.length - 1] + 2}s forwards`,
            }}
          >
            {payload.est_outlier && (
              <span style={{ color: "#1a1410", fontWeight: 700 }}>
                est. {payload.est_outlier.toFixed(1)}x outlier
              </span>
            )}
            {payload.read_time_sec && <><span>·</span><span>{payload.read_time_sec}s read</span></>}
            {payload.matches_note && <><span>·</span><span>{payload.matches_note}</span></>}
          </div>
        )}
      </div>
    </SceneFrame>
  );
}
