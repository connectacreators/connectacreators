// The Command Deck's Script Surface — companion to RevisionReviewSurface.
// Opens when create_script or edit_script_live fires while on /ai: the orb
// shrinks back (same focusMode/mini-orb treatment RevisionReviewSurface
// gets from CommandCenter) and the script's current content shows here,
// live. A voice-guided edit ("make the hook punchier") re-renders the
// whole script but only visually replays the lines that actually changed —
// via the same broadcast-fade-in/broadcast-type-in keyframes AIScriptWizard's
// "watch it write" reveal already uses (src/index.css), reused rather than
// redefined so the two live-reveal moments in the app feel like one system.
import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";

export interface ScriptSurfaceLine {
  id: string;
  section: string;
  line_type: string;
  text: string;
}

export interface ScriptSurfaceState {
  scriptId: string;
  clientId: string | null;
  clientName: string | null;
  title: string;
  lines: ScriptSurfaceLine[];
  changeSummary?: string;
}

const SECTION_COLOR: Record<string, string> = {
  hook: "hsl(var(--honey))",
  body: "hsl(var(--aqua))",
  cta: "hsl(var(--good, 141 33% 61%))",
};
const SECTION_ORDER = ["hook", "body", "cta"];

function typeDurationMs(text: string): number {
  return Math.max(300, Math.min(1400, text.length * 14));
}

export default function ScriptEditSurface({
  surface,
  recentlyChangedLineIds,
  onClose,
}: {
  surface: ScriptSurfaceState;
  /** Line ids touched by the most recent edit — only these get the
   *  fade-in/typewriter reveal; everything else renders statically so an
   *  edit doesn't re-flash the whole script every time. */
  recentlyChangedLineIds: Set<string> | null;
  onClose: () => void;
}) {
  // Freezes which ids get the entrance animation for THIS render only — if
  // recentlyChangedLineIds changed again mid-animation (a fast follow-up
  // edit), each new set of lines still gets its own reveal rather than
  // fighting over one shared animation state.
  const [animatedOnceIds] = useState(() => new Set<string>());
  const seenRef = useRef(animatedOnceIds);

  const bySection: Record<string, ScriptSurfaceLine[]> = {};
  for (const line of surface.lines) {
    const sec = line.section || "body";
    (bySection[sec] ??= []).push(line);
  }
  const sections = [
    ...SECTION_ORDER.filter((s) => bySection[s]?.length),
    ...Object.keys(bySection).filter((s) => !SECTION_ORDER.includes(s)),
  ];

  useEffect(() => {
    // Once a line has played its reveal, never replay it just because a
    // later, unrelated edit re-renders the surface.
    if (recentlyChangedLineIds) {
      for (const id of recentlyChangedLineIds) seenRef.current.add(id);
    }
  }, [recentlyChangedLineIds]);

  return (
    <div className="w-full max-w-2xl flex-1 flex flex-col min-h-0 items-center justify-center overflow-y-auto py-4">
      <div className="w-full flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div
            className="flex items-center gap-2 font-mono text-[9.5px] uppercase"
            style={{ letterSpacing: "0.22em", color: "hsl(var(--aqua) / 0.6)" }}
          >
            <span
              className="inline-block w-1 h-1 rounded-full"
              style={{ background: "hsl(var(--aqua))", boxShadow: "0 0 6px hsl(var(--aqua) / 0.14)" }}
            />
            Script Surface
          </div>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-[9.5px] font-mono uppercase transition-colors px-2 py-1 rounded-full"
            style={{ letterSpacing: "0.1em", color: "hsl(var(--bone) / 0.4)", border: "1px solid rgba(255,255,255,0.08)" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "hsl(var(--bone) / 0.85)"; e.currentTarget.style.borderColor = "hsl(var(--aqua) / 0.4)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "hsl(var(--bone) / 0.4)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
          >
            <ArrowLeft className="w-3 h-3" />
            Back to deck
          </button>
        </div>

        <div>
          <div className="font-mono text-[10px] uppercase mb-1.5" style={{ letterSpacing: "0.12em", color: "hsl(var(--bone) / 0.4)" }}>
            {surface.clientName || "Master queue"}
          </div>
          <h2 className="font-serif" style={{ fontSize: 24, lineHeight: 1.25, color: "hsl(var(--bone))", letterSpacing: "-0.01em" }}>
            {surface.title}
          </h2>
          {surface.changeSummary && (
            <div
              className="font-mono text-[9.5px] mt-1"
              style={{ color: "hsl(var(--aqua) / 0.7)", animation: "broadcast-fade-in 0.4s ease-out both" }}
            >
              {surface.changeSummary}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {sections.map((section, si) => (
            <div key={section} style={si > 0 ? { borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 16 } : undefined}>
              <div
                className="font-mono text-[9px] uppercase mb-2"
                style={{ letterSpacing: "0.14em", color: SECTION_COLOR[section] ?? "hsl(var(--bone) / 0.3)" }}
              >
                {section}
              </div>
              <div className="flex flex-col gap-2.5">
                {bySection[section].map((line) => {
                  const isFresh = recentlyChangedLineIds?.has(line.id) && !seenRef.current.has(line.id);
                  return (
                    <p
                      key={line.id}
                      className="text-[14px] leading-snug"
                      style={{
                        color: "hsl(var(--bone) / 0.85)",
                        whiteSpace: "pre-wrap",
                        ...(isFresh
                          ? { animation: `broadcast-type-in ${typeDurationMs(line.text)}ms steps(60, end) both` }
                          : null),
                      }}
                    >
                      {line.text}
                    </p>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
