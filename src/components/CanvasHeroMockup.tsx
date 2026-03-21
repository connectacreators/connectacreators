import { motion } from "framer-motion";

const gold = "#22d3ee";

const inputNodes = [
  { id: "viral", label: "Viral Video", icon: "▶", iconBg: "rgba(8,145,178,.08)", iconColor: "rgba(34,211,238,.6)",
    preview: "@fitnessmindset · 12x outlier", hasThumb: true,
    features: ["Paste any video URL", "Auto-transcribe with AI", "Detect format & structure", "Visual + audio analysis"] },
  { id: "notes", label: "Text Notes", icon: "✎", iconBg: "rgba(250,204,21,.06)", iconColor: "rgba(250,204,21,.5)",
    preview: "Ideas, research, and briefs",
    features: ["Rich text editor", "AI reads notes as context", "Link to videos & scripts"] },
  { id: "competitor", label: "Competitor Analysis", icon: "☯", iconBg: "rgba(168,85,247,.06)", iconColor: "rgba(168,85,247,.5)",
    preview: "Top posts from any profile",
    features: ["Enter any Instagram handle", "Hook type analysis", "Why-it-worked breakdown"] },
  { id: "media", label: "Media Upload", icon: "⇧", iconBg: "rgba(249,115,22,.06)", iconColor: "rgba(249,115,22,.5)",
    preview: "Images, videos, files",
    features: ["Upload from your device", "Reference visuals on canvas", "Attach assets to scripts"] },
];

const outputFeatures = [
  "Structured: Hook, Body, CTA",
  "Matched to your brand voice",
  "Save to Script Vault",
  "Share via public link",
  "Teleprompter-ready",
];

const aiMessages = [
  { role: "user" as const, text: "Use the visual structure from video 1 but adapt the script and text on screen to my brand voice" },
  { role: "ai" as const, html: `I'll keep the <span style="color:${gold};font-weight:600">same visual pacing</span> — the 3-second hook cut, the B-roll transition at 0:12, and the text overlay timing. But I'll rewrite all <span style="color:${gold};font-weight:600">dialogue and on-screen text</span> to match your bold, direct tone.` },
  { role: "script" as const, lines: [
    { tag: "HOOK (0-3s)", text: '"Stop scrolling. This changed everything."' },
    { tag: "BODY (3-45s)", text: '"Most creators spend 3 hours on a script. I do it in 10 minutes..."' },
  ]},
  { role: "user" as const, text: "Make the hook more aggressive" },
  { role: "ai" as const, html: `Updated: <span style="color:${gold};font-weight:600">"You're doing it wrong. Every single day."</span> — mirrors the 12x outlier pattern but with your confrontational style.` },
];

export default function CanvasHeroMockup() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.4 }}
      className="w-full max-w-[1120px] mx-auto px-4 md:px-12"
    >
      <div className="text-center mb-12">
        <span style={{ fontSize: 10, letterSpacing: "0.2em", color: "rgba(255,255,255,.1)", fontWeight: 600, textTransform: "uppercase" as const }}>
          How It Works — Your AI Planning Canvas
        </span>
      </div>

      <div className="canvas-grid" style={{
        display: "grid",
        gridTemplateColumns: "240px 1fr 220px",
        gap: 0,
        alignItems: "start",
        position: "relative",
      }}>
        <svg style={{ position: "absolute", inset: 0, pointerEvents: "none" as const, zIndex: 1, overflow: "visible" as const }}>
          <style>{`@keyframes dash-flow{to{stroke-dashoffset:-24}}.flow-line{stroke-dasharray:8,5;animation:dash-flow 2s linear infinite;}`}</style>
          <path d="M 236 60 C 310 60, 280 130, 300 130" className="flow-line" stroke="rgba(8,145,178,.13)" strokeWidth="1.2" fill="none"/>
          <path d="M 236 148 C 290 148, 280 170, 300 170" className="flow-line" stroke="rgba(8,145,178,.13)" strokeWidth="1.2" fill="none"/>
          <path d="M 236 230 C 290 230, 280 210, 300 210" className="flow-line" stroke="rgba(8,145,178,.13)" strokeWidth="1.2" fill="none"/>
          <path d="M 236 312 C 310 312, 280 250, 300 250" className="flow-line" stroke="rgba(8,145,178,.13)" strokeWidth="1.2" fill="none"/>
          <path d="M 740 190 C 780 190, 790 190, 808 190" className="flow-line" stroke="rgba(132,204,22,.1)" strokeWidth="1.2" fill="none"/>
        </svg>

        <div style={{ display: "flex", flexDirection: "column" as const, gap: 10, paddingRight: 32 }}>
          <div style={{ fontSize: 9, letterSpacing: "0.18em", fontWeight: 700, textTransform: "uppercase" as const, color: "rgba(34,211,238,.3)", marginBottom: 8, paddingLeft: 4 }}>Research</div>
          {inputNodes.map((node) => (
            <InputNode key={node.id} {...node} />
          ))}
        </div>

        <div style={{ padding: "0 24px" }}>
          <div style={{ fontSize: 9, letterSpacing: "0.18em", fontWeight: 700, textTransform: "uppercase" as const, color: "rgba(34,211,238,.3)", marginBottom: 8, paddingLeft: 4 }}>AI Assistant</div>
          <AIChat messages={aiMessages} />
        </div>

        <div style={{ paddingLeft: 32 }}>
          <div style={{ fontSize: 9, letterSpacing: "0.18em", fontWeight: 700, textTransform: "uppercase" as const, color: "rgba(132,204,22,.3)", marginBottom: 8, paddingLeft: 4 }}>Output</div>
          <OutputNode features={outputFeatures} />
        </div>
      </div>

      <style>{`
        .canvas-grid:has(.c-node:hover) .c-node:not(:hover),
        .canvas-grid:has(.c-node:hover) .ai-chat-card { opacity: .35; transition: opacity .35s; }
        .canvas-grid:has(.ai-chat-card:hover) .c-node { opacity: .35; transition: opacity .35s; }
        .canvas-grid:has(.c-node:hover) .output-node { opacity: .35; transition: opacity .35s; }
        .canvas-grid:has(.output-node:hover) .c-node,
        .canvas-grid:has(.output-node:hover) .ai-chat-card { opacity: .35; transition: opacity .35s; }
        @media (max-width: 768px) {
          .canvas-grid { grid-template-columns: 1fr !important; gap: 16px !important; }
          .canvas-grid svg { display: none; }
          .canvas-grid > div { padding: 0 !important; }
        }
      `}</style>
    </motion.div>
  );
}

function InputNode({ label, icon, iconBg, iconColor, preview, features, hasThumb }: {
  label: string; icon: string; iconBg: string; iconColor: string;
  preview: string; features: string[]; hasThumb?: boolean;
}) {
  return (
    <div className="c-node" style={{
      borderRadius: 14, border: "1px solid rgba(255,255,255,.05)",
      background: "rgba(255,255,255,.015)", cursor: "default",
      transition: "border-color .4s, box-shadow .4s, transform .4s cubic-bezier(.4,0,.2,1)",
      position: "relative",
      backdropFilter: "blur(6px)",
    }}>
      <div style={{ position: "absolute", right: -5, top: "50%", transform: "translateY(-50%)", width: 8, height: 8, borderRadius: "50%", background: "rgba(8,145,178,.25)", border: "1px solid rgba(8,145,178,.15)", zIndex: 5 }} />
      <div className="c-node-head" style={{ padding: "12px 16px", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,.5)", borderBottom: "1px solid rgba(255,255,255,.025)", display: "flex", alignItems: "center", gap: 10, transition: "color .3s" }}>
        <div style={{ width: 22, height: 22, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, background: iconBg, color: iconColor, flexShrink: 0 }}>{icon}</div>
        {label}
      </div>
      <div className="c-node-preview" style={{ padding: "10px 16px", transition: "all .3s" }}>
        {hasThumb && (
          <div style={{ width: "100%", height: 42, borderRadius: 8, background: "linear-gradient(135deg,rgba(8,145,178,.05),rgba(8,145,178,.015))", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 14, opacity: .12 }}>▶</span>
          </div>
        )}
        <div style={{ fontSize: 11, color: "rgba(255,255,255,.2)", lineHeight: 1.4 }}>{preview}</div>
      </div>
      <div className="c-node-expanded" style={{ position: "absolute", top: 0, left: 0, right: 0, background: "rgba(6,9,12,.97)", borderRadius: 14, opacity: 0, pointerEvents: "none", padding: "44px 16px 14px", transition: "opacity .3s", zIndex: 10 }}>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {features.map((f, i) => (
            <li key={i} style={{ fontSize: 12, color: "rgba(255,255,255,.45)", padding: "3.5px 0", lineHeight: 1.45, display: "flex", alignItems: "flex-start", gap: 10 }}>
              <span style={{ width: 4, height: 4, borderRadius: "50%", flexShrink: 0, marginTop: 6, background: "rgba(34,211,238,.45)" }} />
              {f}
            </li>
          ))}
        </ul>
      </div>
      <style>{`
        .c-node:hover { border-color: rgba(8,145,178,.2) !important; box-shadow: 0 12px 48px rgba(0,0,0,.5), 0 0 0 1px rgba(8,145,178,.08); transform: translateY(-4px) scale(1.01); z-index: 100; }
        .c-node:hover .c-node-head { color: #22d3ee !important; }
        .c-node:hover .c-node-expanded { opacity: 1 !important; pointer-events: auto !important; }
        .c-node:hover .c-node-preview { opacity: 0 !important; }
      `}</style>
    </div>
  );
}

function AIChat({ messages }: { messages: typeof aiMessages }) {
  return (
    <div className="ai-chat-card" style={{
      background: "rgba(6,9,12,.92)", border: "1px solid rgba(8,145,178,.12)", borderRadius: 18,
      display: "flex", flexDirection: "column" as const, overflow: "hidden", backdropFilter: "blur(20px)",
      boxShadow: "0 12px 48px rgba(0,0,0,.35), 0 0 120px rgba(6,182,212,.02), inset 0 1px 0 rgba(255,255,255,.03)",
      transition: "all .4s cubic-bezier(.4,0,.2,1)", position: "relative" as const,
    }}>
      <div style={{ position: "absolute", left: -5, top: "50%", transform: "translateY(-50%)", width: 8, height: 8, borderRadius: "50%", background: "rgba(8,145,178,.25)", border: "1px solid rgba(8,145,178,.15)", zIndex: 5 }} />
      <div style={{ position: "absolute", right: -5, top: "50%", transform: "translateY(-50%)", width: 8, height: 8, borderRadius: "50%", background: "rgba(132,204,22,.2)", border: "1px solid rgba(132,204,22,.12)", zIndex: 5 }} />
      <div style={{ padding: "16px 22px", borderBottom: "1px solid rgba(255,255,255,.03)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: gold, letterSpacing: "0.02em" }}>AI Assistant</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,.2)", marginTop: 2 }}>4 nodes connected as context</div>
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "rgba(255,255,255,.05)" }} />
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "rgba(255,255,255,.05)" }} />
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", opacity: .35 }} />
        </div>
      </div>
      <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column" as const, gap: 10, minHeight: 200 }}>
        {messages.map((msg, i) => {
          if (msg.role === "user") return (
            <div key={i} style={{ padding: "11px 16px", borderRadius: 14, fontSize: 13, lineHeight: 1.55, maxWidth: "88%", background: "rgba(8,145,178,.06)", color: "rgba(255,255,255,.55)", alignSelf: "flex-end", borderBottomRightRadius: 4 }}>{msg.text}</div>
          );
          if (msg.role === "ai") return (
            <div key={i} style={{ padding: "11px 16px", borderRadius: 14, fontSize: 13, lineHeight: 1.55, maxWidth: "88%", background: "rgba(255,255,255,.02)", color: "rgba(255,255,255,.5)", alignSelf: "flex-start" as const, borderBottomLeftRadius: 4, border: "1px solid rgba(255,255,255,.025)" }} dangerouslySetInnerHTML={{ __html: msg.html! }} />
          );
          if (msg.role === "script") return (
            <div key={i} style={{ background: "rgba(8,145,178,.03)", border: "1px solid rgba(8,145,178,.06)", borderRadius: 12, padding: "12px 16px", fontSize: 13, lineHeight: 1.55, alignSelf: "flex-start" as const, maxWidth: "88%", color: "rgba(255,255,255,.42)" }}>
              {msg.lines!.map((l, j) => (
                <div key={j} style={{ marginTop: j > 0 ? 8 : 0 }}>
                  <div style={{ fontSize: 9, color: "rgba(8,145,178,.45)", fontWeight: 700, letterSpacing: "0.08em", marginBottom: 3 }}>{l.tag}</div>
                  {l.text}
                </div>
              ))}
            </div>
          );
          return null;
        })}
      </div>
      <div style={{ padding: "14px 22px", borderTop: "1px solid rgba(255,255,255,.03)", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, background: "rgba(255,255,255,.02)", border: "1px solid rgba(8,145,178,.06)", borderRadius: 12, padding: "12px 16px", fontSize: 13, color: "rgba(255,255,255,.18)", display: "flex", alignItems: "center" }}>
          Ask the AI assistant...<span style={{ display: "inline-block", width: 1, height: 15, background: gold, marginLeft: 3 }} className="ai-blink" />
        </div>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(8,145,178,.08)", border: "1px solid rgba(8,145,178,.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, color: gold, cursor: "pointer" }}>↑</div>
      </div>
      <style>{`
        .ai-chat-card:hover { border-color: rgba(8,145,178,.25) !important; box-shadow: 0 16px 60px rgba(0,0,0,.5), 0 0 120px rgba(6,182,212,.04), inset 0 1px 0 rgba(255,255,255,.04) !important; opacity: 1 !important; }
        @keyframes ai-blink { 0%,50%{opacity:1} 51%,100%{opacity:0} }
        .ai-blink { animation: ai-blink 1s infinite; }
      `}</style>
    </div>
  );
}

function OutputNode({ features }: { features: string[] }) {
  return (
    <div className="output-node" style={{
      borderRadius: 14, border: "1px solid rgba(132,204,22,.08)",
      background: "rgba(132,204,22,.015)", cursor: "default",
      transition: "border-color .4s, box-shadow .4s, transform .4s cubic-bezier(.4,0,.2,1)",
      position: "relative" as const,
      backdropFilter: "blur(6px)",
    }}>
      <div style={{ position: "absolute", left: -5, top: "50%", transform: "translateY(-50%)", width: 8, height: 8, borderRadius: "50%", background: "rgba(132,204,22,.2)", border: "1px solid rgba(132,204,22,.12)", zIndex: 5 }} />
      <div style={{ padding: "12px 16px", fontSize: 12, fontWeight: 600, color: "rgba(132,204,22,.5)", borderBottom: "1px solid rgba(132,204,22,.04)", display: "flex", alignItems: "center", gap: 10, transition: "color .3s" }}>
        <div style={{ width: 22, height: 22, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, background: "rgba(132,204,22,.06)", color: "rgba(132,204,22,.5)", flexShrink: 0 }}>✓</div>
        Generated Script
      </div>
      <div className="output-preview" style={{ padding: "10px 16px", transition: "all .3s" }}>
        {[{ tag: "HOOK", text: '"You\'re doing it wrong..."' }, { tag: "BODY", text: '"Most creators spend..."' }, { tag: "CTA", text: '"Follow for the full..."' }].map((s, i) => (
          <div key={i} style={{ marginBottom: i < 2 ? 7 : 0 }}>
            <span style={{ fontSize: 8, fontWeight: 700, color: "rgba(132,204,22,.3)", letterSpacing: "0.08em" }}>{s.tag}</span>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.2)", lineHeight: 1.4 }}>{s.text}</div>
          </div>
        ))}
      </div>
      <div className="output-expanded" style={{ position: "absolute", top: 0, left: 0, right: 0, background: "rgba(6,9,12,.97)", borderRadius: 14, opacity: 0, pointerEvents: "none", padding: "44px 16px 14px", transition: "opacity .3s", zIndex: 10 }}>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {features.map((f, i) => (
            <li key={i} style={{ fontSize: 12, color: "rgba(255,255,255,.45)", padding: "3.5px 0", lineHeight: 1.45, display: "flex", alignItems: "flex-start", gap: 10 }}>
              <span style={{ width: 4, height: 4, borderRadius: "50%", flexShrink: 0, marginTop: 6, background: "rgba(132,204,22,.45)" }} />
              {f}
            </li>
          ))}
        </ul>
      </div>
      <style>{`
        .output-node:hover { border-color: rgba(132,204,22,.18) !important; box-shadow: 0 12px 48px rgba(0,0,0,.5), 0 0 0 1px rgba(132,204,22,.06); transform: translateY(-4px) scale(1.01); z-index: 100; }
        .output-node:hover .output-expanded { opacity: 1 !important; pointer-events: auto !important; }
        .output-node:hover .output-preview { opacity: 0 !important; }
      `}</style>
    </div>
  );
}
