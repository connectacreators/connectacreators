// src/components/companion/scenes/DraftingScene.tsx
import SceneFrame from "./SceneFrame";
import type { SceneEvent } from "@/lib/companion/turn-script";

interface Props { scene: Extract<SceneEvent, { type: "drafting" }>; }

/**
 * Editorial script page — a quiet manuscript spread. No type-on theatre,
 * no honey "draft v1" sticker, no hard-shadow drama. The script content
 * is what matters; the layout frames it.
 */
export default function DraftingScene({ scene }: Props) {
  const { verb, meta, payload } = scene;
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
        {payload.sections.map((s, i) => (
          <div key={i} className={i < payload.sections.length - 1 ? "mb-4" : ""}>
            <div
              className="font-bold text-[9.5px] uppercase tracking-[0.18em] mb-1"
              style={{ color: "rgba(176,72,72,0.85)", fontFamily: "Inter, sans-serif" }}
            >
              {s.tag}
            </div>
            <div
              className="text-[16px] leading-snug"
              style={{ color: "#1a1410", whiteSpace: "pre-wrap" }}
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
