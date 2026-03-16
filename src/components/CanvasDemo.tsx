import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

// Exact app color tokens from index.css
const C = {
  bg: "#06090c",
  cyan: "#0891B2",
  cyanL: "#22d3ee",
  lime: "#84CC16",
  limeL: "#a3e635",
  red: "#f43f5e",
  purple: "#a855f7",
  fg: "#e2e8f0",
  fgDim: "rgba(226,232,240,0.45)",
  muted: "#64748b",
  cardBg: "rgba(255,255,255,0.035)",
  cardBorder: "rgba(255,255,255,0.07)",
  cardShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 4px 20px rgba(0,0,0,0.3)",
};

interface NodeState {
  videoVisible: boolean;
  compVisible: boolean;
  aiVisible: boolean;
  videoGlow: boolean;
  compGlow: boolean;
  aiGlow: boolean;
  edge1Drawn: boolean;
  edge2Drawn: boolean;
  progWidth: number;
  progVisible: boolean;
  structVisible: boolean;
  ctxVideoTag: boolean;
  ctxCompTag: boolean;
  genBtnVisible: boolean;
  scriptVisible: boolean;
  line1Typed: boolean;
  line2Typed: boolean;
  line3Typed: boolean;
}

const INITIAL: NodeState = {
  videoVisible: false, compVisible: false, aiVisible: false,
  videoGlow: false, compGlow: false, aiGlow: false,
  edge1Drawn: false, edge2Drawn: false,
  progWidth: 0, progVisible: false, structVisible: false,
  ctxVideoTag: false, ctxCompTag: false,
  genBtnVisible: false, scriptVisible: false,
  line1Typed: false, line2Typed: false, line3Typed: false,
};

// Positions as fraction of container dimensions
const PCT = {
  videoX: 0.07, videoY: 0.18,
  compX: 0.07, compY: 0.56,
  aiX: 0.52,   aiY: 0.20,
};

export default function CanvasDemo() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [nodes, setNodes] = useState<NodeState>(INITIAL);
  const [cursor, setCursor] = useState({ x: 200, y: 200 });
  const [rings, setRings] = useState<{ id: number; x: number; y: number }[]>([]);
  const [trails, setTrails] = useState<{ id: number; x: number; y: number }[]>([]);
  const [stepLabel, setStepLabel] = useState("");
  const [capStep, setCapStep] = useState(1);
  const [activeDot, setActiveDot] = useState(0);
  const pausedRef = useRef(false);
  const ringId = useRef(0);
  const trailId = useRef(0);

  function dim() {
    const w = wrapRef.current?.offsetWidth || 900;
    const h = wrapRef.current?.offsetHeight || 500;
    return { w, h };
  }

  function mv(x: number, y: number) { setCursor({ x, y }); }

  function click(x: number, y: number) {
    mv(x, y);
    const id = ++ringId.current;
    setRings(r => [...r, { id, x, y }]);
    setTimeout(() => setRings(r => r.filter(r2 => r2.id !== id)), 550);
  }

  function trail(x: number, y: number) {
    const id = ++trailId.current;
    setTrails(r => [...r, { id, x, y }]);
    setTimeout(() => setTrails(r => r.filter(r2 => r2.id !== id)), 600);
  }

  function upd(patch: Partial<NodeState>) {
    setNodes(n => ({ ...n, ...patch }));
  }

  // Accumulates only non-paused elapsed time — no cascade on unpause
  function wait(ms: number) {
    return new Promise<void>(res => {
      let elapsed = 0;
      let last = Date.now();
      const check = () => {
        if (!pausedRef.current) elapsed += Date.now() - last;
        last = Date.now();
        if (elapsed >= ms) return res();
        setTimeout(check, 20);
      };
      setTimeout(check, 20);
    });
  }

  async function drag(x1: number, y1: number, x2: number, y2: number, steps = 8, dur = 380) {
    mv(x1, y1);
    await wait(100);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, u = 1 - t;
      const x = x1 * u + x2 * t, y = y1 * u + y2 * t;
      mv(x, y);
      trail(x, y);
      await wait(dur / steps);
    }
  }

  async function step0() {
    setActiveDot(0); setCapStep(1); setStepLabel("Drop a viral video onto the canvas");
    const { w, h } = dim();
    const vx = w * PCT.videoX, vy = h * PCT.videoY;
    mv(w * 0.3, 28);
    await wait(180);
    await drag(w * 0.3, 28, vx + 90, vy + 55, 6, 300);
    click(vx + 90, vy + 55);
    upd({ videoVisible: true });
    await wait(260);
    upd({ progVisible: true, progWidth: 100 });
    mv(vx + 70, vy + 120);
    await wait(1300);
    upd({ structVisible: true, progVisible: false });
    setStepLabel("AI extracted Hook · Body · CTA ✓");
    await wait(1000);
  }

  async function step1() {
    setActiveDot(1); setCapStep(2); setStepLabel("Connect Video Node to AI");
    const { w, h } = dim();
    const vx = w * PCT.videoX, vy = h * PCT.videoY;
    const ax = w * PCT.aiX, ay = h * PCT.aiY;
    const vRight = { x: vx + 215, y: vy + 95 };
    const aLeft  = { x: ax,       y: ay + 95 };
    upd({ aiVisible: true });
    mv(vRight.x - 4, vRight.y);
    await wait(280);
    await drag(vRight.x, vRight.y, aLeft.x, aLeft.y, 10, 450);
    click(aLeft.x, aLeft.y);
    upd({ edge1Drawn: true, videoGlow: true, aiGlow: true, ctxVideoTag: true, genBtnVisible: true });
    mv(ax + 130, ay + 100);
    setStepLabel("AI sees the full video structure instantly");
    await wait(1200);
  }

  async function step2() {
    setActiveDot(2); setCapStep(3); setStepLabel("Add a competitor profile");
    const { w, h } = dim();
    const cx = w * PCT.compX, cy = h * PCT.compY;
    const ax = w * PCT.aiX, ay = h * PCT.aiY;
    mv(w * 0.25, 28);
    await wait(180);
    await drag(w * 0.25, 28, cx + 90, cy + 50, 6, 300);
    click(cx + 90, cy + 50);
    upd({ compVisible: true });
    await wait(450);
    setStepLabel("Connect competitor → AI");
    const cRight = { x: cx + 215, y: cy + 90 };
    const aLeft  = { x: ax,       y: ay + 130 };
    mv(cRight.x - 4, cRight.y);
    await wait(280);
    await drag(cRight.x, cRight.y, aLeft.x, aLeft.y, 10, 480);
    click(aLeft.x, aLeft.y);
    upd({ edge2Drawn: true, compGlow: true, ctxCompTag: true });
    setStepLabel("Competitor top posts now in context");
    await wait(1100);
  }

  async function step3() {
    setActiveDot(3); setCapStep(4); setStepLabel("Generate script from all nodes");
    const { w, h } = dim();
    const ax = w * PCT.aiX, ay = h * PCT.aiY;
    mv(ax + 125, ay + 185);
    await wait(380);
    click(ax + 125, ay + 188);
    upd({ genBtnVisible: false, scriptVisible: true });
    await wait(280);
    upd({ line1Typed: true });
    await wait(950);
    upd({ line2Typed: true });
    await wait(850);
    upd({ line3Typed: true });
    mv(ax + 125, ay + 270);
    setStepLabel("Full viral script — ready to film ✨");
    await wait(2200);
  }

  function reset() {
    setNodes(INITIAL);
    setStepLabel("");
  }

  useEffect(() => {
    let alive = true;
    async function loop() {
      await wait(500);
      while (alive) {
        await step0(); await step1(); await step2(); await step3();
        await wait(1000);
        reset();
        await wait(600);
      }
    }
    loop();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function edgePath(x1: number, y1: number, x2: number, y2: number) {
    const mx = (x1 + x2) / 2;
    return `M ${x1},${y1} C ${mx},${y1} ${mx},${y2} ${x2},${y2}`;
  }

  const { w: W, h: H } = dim();
  const vx = W * PCT.videoX, vy = H * PCT.videoY;
  const cx = W * PCT.compX, cy = H * PCT.compY;
  const ax = W * PCT.aiX,   ay = H * PCT.aiY;

  const nodeStyle = (visible: boolean, glowColor?: string): CSSProperties => ({
    position: "absolute", borderRadius: 16, overflow: "hidden",
    background: C.cardBg,
    border: `1px solid ${glowColor ? glowColor + "80" : C.cardBorder}`,
    boxShadow: glowColor
      ? `${C.cardShadow}, 0 0 22px ${glowColor}55`
      : C.cardShadow,
    backdropFilter: "blur(24px) saturate(150%)",
    opacity: visible ? 1 : 0,
    transform: visible ? "scale(1)" : "scale(0.88)",
    transition: "opacity 0.35s ease, transform 0.35s ease, box-shadow 0.25s, border-color 0.25s",
  });

  const capColors = ["linear-gradient(135deg,#0891B2,#22d3ee)", "linear-gradient(135deg,#0891B2,#22d3ee)", "linear-gradient(135deg,#be185d,#f43f5e)", "linear-gradient(135deg,#16a34a,#84CC16)"];

  return (
    <div
      ref={wrapRef}
      style={{ width: "100%", height: "100%", position: "relative", background: C.bg, overflow: "hidden" }}
      // Note: id="demo" is on the parent <section> in Home.tsx — do not add it here
      onMouseEnter={() => { pausedRef.current = true; }}
      onMouseLeave={() => { pausedRef.current = false; }}
    >
      {/* Dot grid */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.045) 1px, transparent 1px)", backgroundSize: "22px 22px" }} />
      {/* Ambient glow */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(ellipse at 18% 8%, rgba(8,145,178,0.08) 0%, transparent 52%), radial-gradient(ellipse at 82% 92%, rgba(132,204,22,0.06) 0%, transparent 52%)" }} />

      {/* Toolbar */}
      <div style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(8,145,178,0.12)", backdropFilter: "blur(20px)", borderRadius: 10, padding: "5px 14px", display: "flex", alignItems: "center", gap: 10, zIndex: 50 }}>
        {["🎬 Video", "🔍 Competitor", "🤖 AI", "📝 Note"].map((label, i) => (
          <span key={i} style={{ fontSize: 9.5, color: C.muted, display: "flex", alignItems: "center", gap: 3 }}>
            {label}
            {i < 3 && <span style={{ width: 1, height: 13, background: "rgba(255,255,255,0.08)", margin: "0 2px", display: "inline-block" }} />}
          </span>
        ))}
      </div>

      {/* Step caption */}
      {stepLabel && (
        <div style={{ position: "absolute", top: 52, left: "50%", transform: "translateX(-50%)", background: "rgba(6,9,12,0.8)", border: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(10px)", borderRadius: 8, padding: "5px 14px", display: "flex", alignItems: "center", gap: 8, zIndex: 50, whiteSpace: "nowrap" }}>
          <div style={{ width: 18, height: 18, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: "#fff", flexShrink: 0, background: capColors[capStep - 1] }}>
            {capStep}
          </div>
          <span style={{ fontSize: 10.5, color: "rgba(226,232,240,0.6)" }}>{stepLabel}</span>
        </div>
      )}

      {/* SVG edges */}
      <svg style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }} width="100%" height="100%">
        <defs>
          <marker id="mc2" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto">
            <path d="M0,.5 L7,3.5 L0,6.5 Z" fill="rgba(34,211,238,.75)" />
          </marker>
          <marker id="mr2" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto">
            <path d="M0,.5 L7,3.5 L0,6.5 Z" fill="rgba(244,63,94,.7)" />
          </marker>
        </defs>
        <path d={edgePath(vx + 215, vy + 95, ax, ay + 95)} fill="none" stroke="rgba(34,211,238,0.55)" strokeWidth="1.5" markerEnd="url(#mc2)" strokeDasharray="280" strokeDashoffset={nodes.edge1Drawn ? 0 : 280} style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(.4,0,.2,1)" }} />
        <path d={edgePath(cx + 215, cy + 90, ax, ay + 130)} fill="none" stroke="rgba(244,63,94,0.55)" strokeWidth="1.5" markerEnd="url(#mr2)" strokeDasharray="350" strokeDashoffset={nodes.edge2Drawn ? 0 : 350} style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(.4,0,.2,1)" }} />
      </svg>

      {/* ── VIDEO NODE ── */}
      <div style={{ ...nodeStyle(nodes.videoVisible, nodes.videoGlow ? C.cyanL : undefined), left: vx, top: vy, width: 215 }}>
        <div style={{ position: "absolute", right: -5, top: "50%", transform: "translateY(-50%)", width: 10, height: 10, borderRadius: "50%", background: C.cyan, border: "1.5px solid rgba(8,145,178,0.7)", zIndex: 10 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 12px 8px", borderBottom: "1px solid rgba(8,145,178,0.15)", background: "rgba(8,145,178,0.08)" }}>
          <div style={{ width: 22, height: 22, borderRadius: 7, background: "rgba(8,145,178,0.2)", border: "1px solid rgba(8,145,178,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}>🎬</div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.cyanL }}>Video Node</div>
            <div style={{ fontSize: 9, color: C.fgDim }}>Analyze reel structure</div>
          </div>
        </div>
        <div style={{ margin: "10px 12px 6px", height: 72, borderRadius: 8, background: "linear-gradient(135deg,rgba(8,145,178,0.2),rgba(0,0,0,0.5))", border: "1px solid rgba(8,145,178,0.2)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(8,145,178,0.4)", border: "1.5px solid rgba(34,211,238,0.5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>▶</div>
          <div style={{ position: "absolute", bottom: 5, left: 7, fontSize: 8, color: "rgba(255,255,255,0.55)", background: "rgba(0,0,0,0.55)", borderRadius: 3, padding: "1px 5px" }}>@viral.fitness</div>
        </div>
        <div style={{ margin: "0 12px 5px", height: 2, background: "rgba(255,255,255,0.07)", borderRadius: 2, overflow: "hidden", display: nodes.progVisible ? "block" : "none" }}>
          <div style={{ height: "100%", borderRadius: 2, background: "linear-gradient(90deg,#0891B2,#84CC16)", width: `${nodes.progWidth}%`, transition: "width 1.4s linear" }} />
        </div>
        <div style={{ margin: "0 12px 6px", fontSize: 9, color: C.cyanL, opacity: nodes.progVisible ? 1 : 0, transition: "opacity 0.3s" }}>Analyzing structure...</div>
        <div style={{ margin: "0 10px 10px", display: nodes.structVisible ? "flex" : "none", flexDirection: "column", gap: 3 }}>
          {([["HOOK", C.cyanL, "rgba(8,145,178,0.08)", "rgba(8,145,178,0.2)", '"Nobody tells you this..."'], ["BODY", "#94a3b8", "rgba(148,163,184,0.06)", "rgba(148,163,184,0.15)", "Authority → stat → story"], ["CTA", C.limeL, "rgba(132,204,22,0.06)", "rgba(132,204,22,0.15)", 'Comment "guide" below']] as const).map(([label, color, bg, border, text]) => (
            <div key={label} style={{ borderRadius: 5, padding: "3px 8px", display: "flex", alignItems: "center", gap: 5, background: bg, border: `1px solid ${border}` }}>
              <span style={{ color, fontSize: 8, fontWeight: 700 }}>{label}</span>
              <span style={{ color: C.fgDim, fontSize: 8 }}>{text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── COMPETITOR NODE ── */}
      <div style={{ ...nodeStyle(nodes.compVisible, nodes.compGlow ? C.red : undefined), left: cx, top: cy, width: 215 }}>
        <div style={{ position: "absolute", right: -5, top: "50%", transform: "translateY(-50%)", width: 10, height: 10, borderRadius: "50%", background: C.red, border: "1.5px solid rgba(244,63,94,0.7)", zIndex: 10 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 12px 8px", borderBottom: "1px solid rgba(244,63,94,0.2)", background: "linear-gradient(135deg,rgba(244,63,94,0.15),rgba(168,85,247,0.15))" }}>
          <div style={{ width: 22, height: 22, borderRadius: 7, background: "linear-gradient(135deg,#f43f5e,#a855f7)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}>🔍</div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.fg }}>Competitor Analysis</div>
            <div style={{ fontSize: 9, color: "rgba(244,63,94,0.8)" }}>@dr.rival.fitness</div>
          </div>
        </div>
        <div style={{ margin: "8px 10px", display: "flex", flexDirection: "column", gap: 3 }}>
          {([["#1", "5.2x", "1.2M", "rgba(244,63,94,0.1)", C.red, C.cyanL], ["#2", "3.1x", "890K", "rgba(244,63,94,0.07)", C.red, C.limeL], ["#3", "2.4x", "650K", "rgba(244,63,94,0.05)", C.muted, C.muted], ["#4", "1.8x", "480K", "rgba(244,63,94,0.03)", C.muted, C.muted]] as const).map(([rank, score, views, rowBg, vColor, badgeColor]) => (
            <div key={rank} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderRadius: 5, padding: "3px 9px", background: rowBg }}>
              <span style={{ color: C.fgDim, fontSize: 9 }}>{rank} · Reel</span>
              <span style={{ fontSize: 8, fontWeight: 600, borderRadius: 20, padding: "1px 6px", background: `${badgeColor}18`, color: badgeColor, border: `1px solid ${badgeColor}33` }}>{score}</span>
              <span style={{ color: vColor, fontSize: 9, fontWeight: 700 }}>{views}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── AI ASSISTANT NODE ── */}
      <div style={{ ...nodeStyle(nodes.aiVisible, nodes.aiGlow ? "#a78bfa" : undefined), left: ax, top: ay, width: 260 }}>
        <div style={{ position: "absolute", left: -5, top: "50%", transform: "translateY(-50%)", width: 10, height: 10, borderRadius: "50%", background: C.cyan, border: "1.5px solid rgba(8,145,178,0.7)", zIndex: 10 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 12px 8px", borderBottom: "1px solid rgba(8,145,178,0.15)", background: "rgba(8,145,178,0.08)" }}>
          <div style={{ width: 22, height: 22, borderRadius: 7, background: "rgba(8,145,178,0.15)", border: "1px solid rgba(8,145,178,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}>🤖</div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.cyan }}>Connecta AI</div>
            <div style={{ fontSize: 9, color: C.fgDim }}>Draw edges from nodes to connect context</div>
          </div>
        </div>
        {!nodes.ctxVideoTag && (
          <div style={{ margin: "12px 13px", fontSize: 10, color: C.fgDim, lineHeight: 1.55 }}>Connect nodes to start generating scripts...</div>
        )}
        {nodes.ctxVideoTag && (
          <div style={{ margin: "8px 12px", display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ borderRadius: 4, padding: "3px 8px", fontSize: 9, display: "flex", alignItems: "center", gap: 5, background: "rgba(8,145,178,0.08)", border: "1px solid rgba(8,145,178,0.2)" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.cyanL, flexShrink: 0 }} />
              <span style={{ color: C.cyanL }}>VideoNode · @viral.fitness</span>
            </div>
            {nodes.ctxCompTag && (
              <div style={{ borderRadius: 4, padding: "3px 8px", fontSize: 9, display: "flex", alignItems: "center", gap: 5, background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.2)" }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.red, flexShrink: 0 }} />
                <span style={{ color: C.red }}>CompetitorNode · @dr.rival.fitness</span>
              </div>
            )}
          </div>
        )}
        {nodes.genBtnVisible && !nodes.scriptVisible && (
          <div style={{ margin: "6px 11px 10px", background: "linear-gradient(135deg,#0891B2,#84CC16)", borderRadius: 8, padding: "7px 10px", textAlign: "center", fontSize: 10, fontWeight: 600, color: "#fff", boxShadow: "0 4px 16px rgba(8,145,178,0.35), inset 0 1px 0 rgba(255,255,255,0.15)", cursor: "pointer" }}>
            ✨ Generate Script
          </div>
        )}
        {nodes.scriptVisible && (
          <div style={{ margin: "6px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
            {([
              ["HOOK", C.cyanL, "rgba(8,145,178,0.08)", "rgba(8,145,178,0.2)", '"The thing most creators never talk about..."', nodes.line1Typed],
              ["BODY", "#94a3b8", "rgba(148,163,184,0.06)", "rgba(148,163,184,0.15)", "I wasted 6 months before I found this...", nodes.line2Typed],
              ["CTA", C.limeL, "rgba(132,204,22,0.06)", "rgba(132,204,22,0.15)", 'Comment "YES" for the full breakdown', nodes.line3Typed],
            ] as const).map(([label, color, bg, border, text, typed]) => (
              <div key={label} style={{ borderRadius: 6, padding: "5px 9px", background: bg, border: `1px solid ${border}` }}>
                <div style={{ fontSize: 8, fontWeight: 700, color, letterSpacing: 0.4, marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 9, color: C.fgDim, lineHeight: 1.5, overflow: "hidden", whiteSpace: "nowrap", width: typed ? "100%" : 0, transition: "width 1s steps(26)" }}>
                  {text}
                </div>
              </div>
            ))}
            <div style={{ display: "flex", gap: 5, marginTop: 2 }}>
              <div style={{ flex: 1, background: "linear-gradient(135deg,#0891B2,#84CC16)", borderRadius: 6, padding: 6, textAlign: "center", fontSize: 9.5, fontWeight: 600, color: "#fff", boxShadow: "0 4px 12px rgba(8,145,178,0.3)" }}>✓ Copy Script</div>
              <div style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: 6, textAlign: "center", fontSize: 9.5, color: C.muted }}>↻ Regenerate</div>
            </div>
          </div>
        )}
      </div>

      {/* Cursor */}
      <div style={{ position: "absolute", left: cursor.x, top: cursor.y, pointerEvents: "none", zIndex: 200, filter: "drop-shadow(0 2px 5px rgba(0,0,0,.7))", transition: "left 0.5s cubic-bezier(.4,0,.2,1), top 0.5s cubic-bezier(.4,0,.2,1)" }}>
        <svg width="18" height="22" viewBox="0 0 18 22">
          <path d="M1,1 L1,17 L5,13 L8,20 L10.5,19 L7.5,12 L13,12 Z" fill="white" stroke="#111" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      </div>

      {/* Click rings */}
      {rings.map(r => (
        <div key={r.id} style={{ position: "absolute", left: r.x - 4, top: r.y - 4, width: 24, height: 24, borderRadius: "50%", border: "2px solid rgba(34,211,238,0.9)", animation: "cdRip 0.45s ease-out forwards", pointerEvents: "none", zIndex: 201 }} />
      ))}

      {/* Trail dots */}
      {trails.map(t => (
        <div key={t.id} style={{ position: "absolute", left: t.x - 3, top: t.y - 3, width: 7, height: 7, borderRadius: "50%", background: "rgba(34,211,238,0.4)", animation: "cdTr 0.5s ease forwards", pointerEvents: "none", zIndex: 199 }} />
      ))}

      {/* Bottom label */}
      <div style={{ position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", background: "rgba(6,9,12,0.88)", border: "1px solid rgba(8,145,178,0.2)", backdropFilter: "blur(12px)", borderRadius: 20, padding: "5px 18px", fontSize: 11.5, color: "rgba(226,232,240,0.75)", pointerEvents: "none", zIndex: 100, whiteSpace: "nowrap", opacity: stepLabel ? 1 : 0, transition: "opacity 0.25s" }}>
        {stepLabel}
      </div>

      {/* Step dots */}
      <div style={{ position: "absolute", bottom: 16, right: 16, display: "flex", flexDirection: "column", gap: 5, zIndex: 100 }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{ width: 5, height: activeDot === i ? 15 : 5, borderRadius: activeDot === i ? 3 : "50%", background: activeDot === i ? C.cyanL : "rgba(255,255,255,0.14)", transition: "all 0.25s" }} />
        ))}
      </div>

      {/* Keyframes */}
      <style>{`
        @keyframes cdRip { from{opacity:1;transform:scale(.4)} to{opacity:0;transform:scale(2)} }
        @keyframes cdTr  { from{opacity:.7;transform:scale(1)} to{opacity:0;transform:scale(.2)} }
      `}</style>
    </div>
  );
}
