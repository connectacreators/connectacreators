// src/components/companion/embeds/ScriptCardEmbed.tsx
import type { ScriptCardEmbedData } from "@/lib/companion/turn-script";

interface Props {
  data: ScriptCardEmbedData;
  onRegen?: () => void;
  onShip?: () => void;
}

/**
 * Settled version of the drafting scene card — all sections visible, no
 * type-on animation, action buttons available. Used when Robby references
 * a completed draft inline.
 */
export default function ScriptCardEmbed({ data, onRegen, onShip }: Props) {
  return (
    <div className="broadcast-card relative px-5 py-5 sm:px-6">
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
        draft
      </div>
      {data.sections.map((s, i) => (
        <div key={i} className={i < data.sections.length - 1 ? "mb-4" : ""}>
          <div
            className="font-bold text-[10px] uppercase tracking-widest mb-1.5"
            style={{ color: "#b04848", fontFamily: "Inter, sans-serif" }}
          >
            {s.tag}
          </div>
          <div
            className="text-[16px] leading-snug"
            style={{ color: "#1a1410", fontFamily: "var(--font-display, 'EB Garamond'), Georgia, serif", whiteSpace: "pre-wrap" }}
            dangerouslySetInnerHTML={{
              __html: s.body.replace(/<scribble>(.*?)<\/scribble>/g, '<span class="scribble-wavy">$1</span>'),
            }}
          />
        </div>
      ))}
      {(data.est_outlier || data.read_time_sec || data.matches_note || onRegen || onShip) && (
        <div
          className="mt-4 pt-3.5 flex flex-wrap gap-3 items-center text-[11.5px]"
          style={{ borderTop: "1.5px dashed rgba(0,0,0,0.18)", color: "rgba(26,20,16,0.65)", fontFamily: "Inter, sans-serif" }}
        >
          {data.est_outlier && <span style={{ color: "#1a1410", fontWeight: 700 }}>est. {data.est_outlier.toFixed(1)}x outlier</span>}
          {data.read_time_sec && <><span>·</span><span>{data.read_time_sec}s read</span></>}
          {data.matches_note && <><span>·</span><span>{data.matches_note}</span></>}
          {(onRegen || onShip) && (
            <div className="ml-auto flex gap-2">
              {onRegen && (
                <button
                  onClick={onRegen}
                  className="px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded"
                  style={{ background: "#fdf3d6", color: "#1a1410", border: "1.5px solid #1a1410", boxShadow: "2px 2px 0 rgba(0,0,0,0.4)", fontFamily: "Inter, sans-serif" }}
                >
                  ↻ regen
                </button>
              )}
              {onShip && (
                <button
                  onClick={onShip}
                  className="px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded"
                  style={{ background: "#1a1410", color: "#ffd07a", border: "1.5px solid #1a1410", boxShadow: "2px 2px 0 rgba(0,0,0,0.4)", fontFamily: "Inter, sans-serif" }}
                >
                  ▶ ship to canvas
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
