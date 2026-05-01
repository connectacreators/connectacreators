import { useState, useEffect, useCallback } from "react";
import { Instagram, StickyNote, Link2, MessageSquare, Wand2, ChevronRight } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface SpotRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const CALLOUT_W = 234;
const PRIMARY = "hsl(44 75% 87%)"; // brand gold

const STEPS = [
  {
    target: "video-btn",
    title: "Drop a Video URL",
    desc: "Paste an Instagram, TikTok or YouTube link — AI transcribes it instantly.",
    placement: "below" as const,
    spotR: 12,
    Icon: Instagram,
  },
  {
    target: "note-btn",
    title: "Add Client Notes",
    desc: "Drop your client's values, tone and goals here as context.",
    placement: "below" as const,
    spotR: 12,
    Icon: StickyNote,
  },
  {
    target: "ai-node",
    title: "Connect to AI",
    desc: "Drag an edge from any node to the AI assistant to feed it context.",
    placement: "left" as const,
    spotR: 16,
    Icon: Link2,
  },
  {
    target: "ai-chat-input",
    title: "Chat & Refine",
    desc: "Answer AI questions to shape the tone, CTA and format of your script.",
    placement: "above" as const,
    spotR: 10,
    Icon: MessageSquare,
  },
  {
    target: "generate-script",
    title: "Generate Script",
    desc: "Click Generate — your full Hook → Body → CTA script appears instantly.",
    placement: "left" as const,
    spotR: 10,
    Icon: Wand2,
  },
];

/* ─── Mini animations ──────────────────────────────────────── */

function AnimUrlType() {
  const s: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", height: "100%", padding: "0 14px" };
  const field: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 6,
    background: "rgba(0,0,0,0.35)", border: `1px solid rgba(240,220,150,0.2)`,
    borderRadius: 7, padding: "5px 10px", width: "100%",
  };
  return (
    <div style={s}>
      <div style={field}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(240,220,150,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
        <div style={{ fontSize: 10, color: PRIMARY, fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", width: 0, animation: "ctUrlType 3.2s steps(24) infinite" }}>
          instagram.com/reel/abc123
        </div>
        <div style={{ width: 1.5, height: 12, background: PRIMARY, animation: "ctBlink 0.6s step-end infinite", flexShrink: 0 }} />
      </div>
    </div>
  );
}

function AnimNoteLines() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7, width: "100%", padding: "8px 16px", justifyContent: "center", height: "100%" }}>
      {([["92%", "0s"], ["68%", "0.18s"], ["80%", "0.36s"]] as [string, string][]).map(([w, delay], i) => (
        <div key={i} style={{ height: 5, borderRadius: 3, background: "rgba(240,220,150,0.28)", width: w, transformOrigin: "left", animation: `ctNoteGrow 2.8s ${delay} ease-in-out infinite` }} />
      ))}
    </div>
  );
}

function AnimTravelDot() {
  const nodeBox: React.CSSProperties = {
    width: 22, height: 22, borderRadius: 6,
    border: "1.5px solid rgba(240,220,150,0.4)", background: "rgba(240,220,150,0.08)",
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    color: "rgba(240,220,150,0.7)",
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 14px", height: "100%", width: "100%" }}>
      <div style={nodeBox}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 8-6 4 6 4V8z" /><rect x="2" y="6" width="14" height="12" rx="2" /></svg>
      </div>
      <div style={{ flex: 1, height: 1, position: "relative", background: "repeating-linear-gradient(to right, rgba(240,220,150,0.4) 0, rgba(240,220,150,0.4) 4px, transparent 4px, transparent 7px)" }}>
        <div style={{ position: "absolute", width: 7, height: 7, borderRadius: "50%", background: PRIMARY, top: "50%", transform: "translateY(-50%)", boxShadow: `0 0 8px rgba(240,220,150,0.9)`, animation: "ctDotTravel 1.8s cubic-bezier(0.4,0,0.6,1) infinite" }} />
      </div>
      <div style={{ ...nodeBox, border: "1.5px solid rgba(160,220,160,0.4)", background: "rgba(120,220,150,0.08)", color: "rgba(140,220,160,0.7)" }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
      </div>
    </div>
  );
}

function AnimChatBubs() {
  const base: React.CSSProperties = { borderRadius: 8, padding: "5px 9px", fontSize: 10, maxWidth: 136, opacity: 0, transform: "translateY(5px)" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%", padding: "6px 12px", justifyContent: "center", height: "100%" }}>
      <div style={{ ...base, alignSelf: "flex-end", background: "rgba(240,220,150,0.12)", border: "1px solid rgba(240,220,150,0.22)", color: PRIMARY, animation: "ctBubIn 3.2s 0s ease-out infinite" }}>
        Make it more punchy!
      </div>
      <div style={{ ...base, alignSelf: "flex-start", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#c0c0c0", animation: "ctBubIn 3.2s 0.85s ease-out infinite" }}>
        Sharp hook coming right up...
      </div>
    </div>
  );
}

function AnimScriptBars() {
  const lines = [
    { dot: "#f87171", bar: "rgba(248,113,113,0.4)", delay: "0s" },
    { dot: "#818cf8", bar: "rgba(129,140,248,0.4)", delay: "0.2s" },
    { dot: "#34d399", bar: "rgba(52,211,153,0.4)",  delay: "0.4s" },
    { dot: "#818cf8", bar: "rgba(129,140,248,0.4)", delay: "0.6s" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 16px", width: "100%", justifyContent: "center", height: "100%" }}>
      {lines.map((l, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: l.dot, flexShrink: 0 }} />
          <div style={{ height: 5, borderRadius: 3, background: l.bar, flex: 1, transformOrigin: "left", animation: `ctScriptBar 3s ${l.delay} ease-in-out infinite` }} />
        </div>
      ))}
    </div>
  );
}

const ANIM_COMPONENTS = [AnimUrlType, AnimNoteLines, AnimTravelDot, AnimChatBubs, AnimScriptBars];

/* ─── Callout arrow ─────────────────────────────────────────── */

function CalloutArrow({ placement }: { placement: "below" | "left" | "above" }) {
  const base: React.CSSProperties = {
    position: "absolute", width: 12, height: 12,
    background: "rgba(14,14,18,0.9)", transform: "rotate(45deg)",
  };
  if (placement === "below") return (
    <div style={{ ...base, top: -7, left: 28, borderLeft: "1px solid rgba(240,220,150,0.22)", borderTop: "1px solid rgba(240,220,150,0.22)" }} />
  );
  if (placement === "left") return (
    <div style={{ ...base, right: -7, top: 36, borderRight: "1px solid rgba(240,220,150,0.22)", borderBottom: "1px solid rgba(240,220,150,0.22)" }} />
  );
  // above
  return (
    <div style={{ ...base, bottom: -7, left: 28, borderRight: "1px solid rgba(240,220,150,0.22)", borderBottom: "1px solid rgba(240,220,150,0.22)" }} />
  );
}

/* ─── Main component ────────────────────────────────────────── */

export default function CanvasTutorial({ open, onClose }: Props) {
  const [step, setStep] = useState(0);
  const [animKey, setAnimKey] = useState(0);
  const [rect, setRect] = useState<SpotRect | null>(null);

  const measure = useCallback((targetStep: number) => {
    const sel = STEPS[targetStep]?.target;
    if (!sel) return;
    const el = document.querySelector(`[data-tutorial-target="${sel}"]`);
    if (!el) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, []);

  useEffect(() => {
    if (!open) return;
    measure(step);
    const onResize = () => measure(step);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, step, measure]);

  useEffect(() => {
    if (open) { setStep(0); setAnimKey(k => k + 1); }
  }, [open]);

  const goTo = (next: number) => {
    setStep(next);
    setAnimKey(k => k + 1);
  };

  const finish = () => {
    localStorage.setItem("connecta_canvas_tutorial_seen", "1");
    onClose();
  };

  if (!open) return null;

  const { placement, spotR, Icon } = STEPS[step];
  const AnimComp = ANIM_COMPONENTS[step];

  // Spotlight style
  const spotStyle: React.CSSProperties = rect
    ? {
        position: "fixed",
        top: rect.top - 4,
        left: rect.left - 4,
        width: rect.width + 8,
        height: rect.height + 8,
        boxShadow: "0 0 0 9999px rgba(0,0,0,0.76)",
        borderRadius: spotR,
        zIndex: 9999,
        pointerEvents: "none",
        outline: `2px solid rgba(240,220,150,0.6)`,
        outlineOffset: 1,
        animation: "ctRingPulse 1.5s ease-in-out infinite",
      }
    : { display: "none" };

  // Callout position
  const calloutTop = () => {
    if (!rect) return "50%";
    if (placement === "below") return rect.top + rect.height + 8 + 12;
    if (placement === "left") return Math.max(8, Math.min(rect.top - 20, window.innerHeight - 310 - 8));
    // above
    return Math.max(8, rect.top - 12 - 290);
  };
  const calloutLeft = () => {
    if (!rect) return "50%";
    if (placement === "below" || placement === "above") {
      return Math.max(8, Math.min(rect.left - 10, window.innerWidth - CALLOUT_W - 8));
    }
    // left
    return Math.max(8, rect.left - CALLOUT_W - 14);
  };

  const calloutStyle: React.CSSProperties = {
    position: "fixed",
    top: calloutTop(),
    left: calloutLeft(),
    width: CALLOUT_W,
    zIndex: 10000,
    background: "rgba(14,14,18,0.72)",
    backdropFilter: "blur(22px)",
    WebkitBackdropFilter: "blur(22px)",
    border: "1px solid rgba(240,220,150,0.22)",
    borderRadius: 14,
    padding: "14px 16px",
    boxShadow: "0 10px 48px rgba(0,0,0,0.8), 0 0 0 1px rgba(240,220,150,0.06), inset 0 1px 0 rgba(255,255,255,0.07)",
    animation: "ctCalloutIn 0.28s ease both",
    pointerEvents: "all",
  };

  return (
    <>
      <style>{`
        @keyframes ctUrlType {
          0%, 5%   { width: 0; }
          55%, 85% { width: 148px; }
          96%, 100% { width: 0; }
        }
        @keyframes ctBlink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
        @keyframes ctNoteGrow {
          0%, 8%   { transform: scaleX(0); opacity: 0; }
          38%, 78% { transform: scaleX(1); opacity: 1; }
          96%, 100% { transform: scaleX(1); opacity: 0; }
        }
        @keyframes ctDotTravel {
          0%   { left: 0%; opacity: 0; }
          8%   { opacity: 1; }
          88%  { opacity: 1; }
          100% { left: 100%; opacity: 0; }
        }
        @keyframes ctBubIn {
          0%, 5%   { opacity: 0; transform: translateY(5px); }
          20%, 72% { opacity: 1; transform: translateY(0); }
          88%, 100% { opacity: 0; transform: translateY(0); }
        }
        @keyframes ctScriptBar {
          0%, 6%   { transform: scaleX(0); opacity: 0; }
          32%, 78% { transform: scaleX(1); opacity: 1; }
          96%, 100% { transform: scaleX(1); opacity: 0; }
        }
        @keyframes ctRingPulse {
          0%, 100% { outline-color: rgba(240,220,150,0.4); }
          50%       { outline-color: rgba(240,220,150,0.85); }
        }
        @keyframes ctCalloutIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Click-blocking layer (transparent, behind spotlight) */}
      <div
        style={{ position: "fixed", inset: 0, zIndex: 9997, pointerEvents: "all" }}
        onClick={(e) => e.stopPropagation()}
      />

      {/* Spotlight hole */}
      <div style={spotStyle} />

      {/* Callout bubble */}
      <div style={calloutStyle} key={animKey}>
        <CalloutArrow placement={placement} />

        {/* Header: icon chip + label + title */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <div style={{
            width: 32, height: 32, flexShrink: 0,
            background: "rgba(240,220,150,0.1)", border: "1px solid rgba(240,220,150,0.2)",
            borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
            color: PRIMARY,
          }}>
            <Icon size={16} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: "rgba(240,220,150,0.6)", fontWeight: 600, letterSpacing: "0.4px", textTransform: "uppercase", marginBottom: 1 }}>
              Step {step + 1} of {STEPS.length}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>
              {STEPS[step].title}
            </div>
          </div>
        </div>

        {/* Mini animation box */}
        <div style={{
          background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 9, height: 56, overflow: "hidden", marginBottom: 10,
          display: "flex", alignItems: "center",
        }} key={`anim-${animKey}`}>
          <AnimComp />
        </div>

        {/* Description */}
        <div style={{ fontSize: 11, color: "#999", lineHeight: 1.55, marginBottom: 10 }}>
          {STEPS[step].desc}
        </div>

        {/* Progress pips */}
        <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{
              flex: 1, height: 3, borderRadius: 2,
              background: i < step
                ? "rgba(240,220,150,0.4)"
                : i === step
                  ? PRIMARY
                  : "rgba(255,255,255,0.08)",
              position: "relative", overflow: "hidden",
            }}>
              {i === step && (
                <div style={{
                  position: "absolute", top: 0, left: "-100%", width: "50%", height: "100%",
                  background: "linear-gradient(to right, transparent, rgba(255,255,255,0.55), transparent)",
                  animation: "ctBlink 1.8s ease-in-out infinite",
                }} />
              )}
            </div>
          ))}
        </div>

        {/* Nav buttons */}
        <div style={{ display: "flex", gap: 6 }}>
          {step < STEPS.length - 1 ? (
            <button
              onClick={() => goTo(step + 1)}
              style={{
                flex: 1, background: "rgba(240,220,150,0.1)", border: "1px solid rgba(240,220,150,0.28)",
                borderRadius: 8, padding: "6px 10px", fontSize: 11, color: PRIMARY,
                fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
              }}
            >
              Next <ChevronRight size={12} />
            </button>
          ) : (
            <button
              onClick={finish}
              style={{
                flex: 1, background: "rgba(240,220,150,0.18)", border: "1px solid rgba(240,220,150,0.5)",
                borderRadius: 8, padding: "6px 10px", fontSize: 11, color: PRIMARY,
                fontWeight: 700, cursor: "pointer",
              }}
            >
              Done
            </button>
          )}
          <button
            onClick={finish}
            style={{
              flex: 1, background: "transparent", border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 8, padding: "6px 10px", fontSize: 11, color: "#555",
              cursor: "pointer",
            }}
          >
            Skip
          </button>
        </div>
      </div>
    </>
  );
}
