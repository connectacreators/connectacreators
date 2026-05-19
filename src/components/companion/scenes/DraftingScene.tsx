// src/components/companion/scenes/DraftingScene.tsx
import { useMemo } from "react";
import SceneFrame from "./SceneFrame";
import type { SceneEvent } from "@/lib/companion/turn-script";

interface Props { scene: Extract<SceneEvent, { type: "drafting" }>; }

// Stagger each section's text reveal — the script types itself in
// section by section so the user can watch Robby write.
function typeMs(text: string): number {
  return Math.max(600, Math.min(2400, text.length * 20));
}

// Stable content key for the draft so we only animate once per draft.
// Same payload (same tag + body across sections) → same key → no replay
// when the user reopens /ai or remounts the chat list.
function draftKey(payload: { sections: Array<{ tag: string; body: string }> }): string {
  return payload.sections.map((s) => `${s.tag}::${s.body}`).join("|||");
}

// djb2 — tiny stable hash so the localStorage key stays short.
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const STORAGE_PREFIX = "companion_drafting_seen:";

function hasBeenAnimated(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_PREFIX + key) === "1";
  } catch {
    return false;
  }
}

function markAnimated(key: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_PREFIX + key, "1");
  } catch {
    // Storage full or disabled — animation will replay once, no harm.
  }
}

/**
 * Editorial script page — a quiet manuscript spread that types itself in
 * section by section. Bone surface, ink hairline, red eyebrow tags.
 *
 * The type-on animation runs ONCE per draft content. We hash the section
 * bodies, persist "seen" state in localStorage, and skip the animation
 * (rendering the final settled state) on subsequent mounts so revisiting
 * /ai doesn't replay the typewriter on every old draft.
 */
export default function DraftingScene({ scene }: Props) {
  const { verb, meta, payload } = scene;
  const sectionOffsets = payload.sections.map((_, i) => i * 1.6);
  // useMemo so hash isn't recomputed every render; the result is referentially
  // stable across remounts for the same payload.
  const key = useMemo(() => hash(draftKey(payload)), [payload]);
  const alreadySeen = useMemo(() => hasBeenAnimated(key), [key]);
  // First-time mounts: schedule the "seen" flag for after the slowest section
  // finishes typing, so an interrupted view doesn't mark prematurely.
  useMemo(() => {
    if (alreadySeen) return;
    const slowestEndMs =
      sectionOffsets.length === 0
        ? 0
        : (sectionOffsets[sectionOffsets.length - 1] * 1000) +
          350 + 50 +
          typeMs(payload.sections[payload.sections.length - 1].body);
    if (typeof window !== "undefined") {
      window.setTimeout(() => markAnimated(key), slowestEndMs + 100);
    }
  }, [alreadySeen, key]);

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
              style={
                alreadySeen
                  ? undefined
                  : {
                      opacity: 0,
                      animation: `broadcast-fade-in ${fadeDuration}s ease-out ${sectionOffsets[i]}s forwards`,
                    }
              }
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
                  ...(alreadySeen
                    ? null
                    : { animation: `broadcast-type-in ${typeMs(s.body)}ms steps(80, end) ${typeStart}s backwards` }),
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
