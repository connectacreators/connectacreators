import { memo, useState, useRef, useCallback, useEffect } from "react";
import { NodeProps, useReactFlow } from "@xyflow/react";
import { X, Bold, Italic, Underline as UIcon, GripHorizontal, Copy, Minus, Plus, Palette, Settings2 } from "lucide-react";

/* ── Data ── */
interface AnnotationData {
  text?: string;
  html?: string; // rich text (contenteditable innerHTML)
  color?: string;
  fontSize?: number;
  width?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: "left" | "center" | "right";
  bgColor?: string | null;
  bgOpacity?: number;
  borderStyle?: "none" | "solid" | "dashed" | "dotted";
  borderWidth?: 1 | 2 | 3;
  borderColor?: string | null;
  shadow?: "none" | "subtle" | "glow";
  nodeOpacity?: number;
  borderRadius?: "sharp" | "rounded" | "pill";
  onUpdate?: (updates: Partial<AnnotationData>) => void;
  onDelete?: () => void;
}

const COLORS = [
  "#ffffff", "#22d3ee", "#a3e635", "#f59e0b", "#f43f5e",
  "#a78bfa", "#60a5fa", "#34d399", "#fb923c", "#94a3b8",
];

const RADIUS_MAP = { sharp: 2, rounded: 8, pill: 999 } as const;

type ResizeEdge = "top" | "bottom" | "left" | "right" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
const CURSORS: Record<ResizeEdge, string> = {
  "top": "ns-resize", "bottom": "ns-resize",
  "left": "ew-resize", "right": "ew-resize",
  "top-left": "nwse-resize", "top-right": "nesw-resize",
  "bottom-left": "nesw-resize", "bottom-right": "nwse-resize",
};

function hexAlpha(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ── Small color row ── */
function ColorRow({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex gap-1 mb-2">
      {COLORS.map(c => (
        <button key={c} onClick={() => onChange(c)}
          className="w-3 h-3 rounded-full border flex-shrink-0"
          style={{ background: c, borderColor: value === c ? "#fff" : "rgba(255,255,255,0.12)", transform: value === c ? "scale(1.2)" : "scale(1)", transition: "transform 0.1s" }}
        />
      ))}
    </div>
  );
}

/* ── Pill selector ── */
function Pills<T extends string>({ options, value, onChange, labels }: {
  options: T[]; value: T; onChange: (v: T) => void; labels?: Record<T, string>;
}) {
  return (
    <div className="flex gap-1">
      {options.map(o => (
        <button key={o} onClick={() => onChange(o)}
          className="px-2 py-0.5 rounded text-[9px] font-semibold transition-colors"
          style={{ background: value === o ? "rgba(8,145,178,0.18)" : "rgba(255,255,255,0.04)", border: `1px solid ${value === o ? "rgba(8,145,178,0.35)" : "rgba(255,255,255,0.06)"}`, color: value === o ? "#22d3ee" : "rgba(255,255,255,0.45)" }}
        >{labels?.[o] ?? o}</button>
      ))}
    </div>
  );
}

/* ── Opacity slider ── */
function OpacitySlider({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="mt-1.5">
      <div className="flex justify-between text-[8px] mb-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>
        <span>{label}</span><span>{Math.round(value * 100)}%</span>
      </div>
      <input type="range" min={10} max={100} value={Math.round(value * 100)}
        onChange={e => onChange(parseInt(e.target.value) / 100)}
        className="w-full h-1 rounded appearance-none cursor-pointer"
        style={{ background: "rgba(255,255,255,0.08)", accentColor: "#22d3ee" }}
      />
    </div>
  );
}

/* ── Popover wrapper ── */
function Popover({ open, onClose, children, title }: {
  open: boolean; onClose: () => void; children: React.ReactNode; title: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", handler); };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div ref={ref} className="nodrag nowheel absolute z-20"
      style={{ bottom: "calc(100% + 6px)", left: 0, minWidth: 140, background: "rgba(20,22,28,0.97)", backdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "8px 10px", boxShadow: "0 8px 28px rgba(0,0,0,0.45)" }}
      onClick={e => e.stopPropagation()}
    >
      <div className="text-[8px] uppercase tracking-widest mb-1.5" style={{ color: "rgba(255,255,255,0.25)", fontWeight: 600 }}>{title}</div>
      {children}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   ANNOTATION NODE — V3 (Rich Text)
   ══════════════════════════════════════════════════════ */
const AnnotationNode = memo(({ id, data, selected }: NodeProps) => {
  const d = data as AnnotationData;
  const { getZoom, updateNode } = useReactFlow();
  const [focused, setFocused] = useState(false);
  const [showToolbar, setShowToolbar] = useState(!d.text && !d.html);
  const [nodeWidth, setNodeWidth] = useState(d.width || 200);
  const [liveFont, setLiveFont] = useState(d.fontSize || 48);
  const [openPopover, setOpenPopover] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resizeRef = useRef<{ edge: ResizeEdge; startX: number; startY: number; startW: number; startFont: number } | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const liveWidthRef = useRef(nodeWidth);
  const liveFontRef = useRef(liveFont);
  const initializedRef = useRef(false);
  liveWidthRef.current = nodeWidth;
  liveFontRef.current = liveFont;

  // Sync from parent (DB restore / realtime)
  useEffect(() => {
    if (!resizeRef.current && d.width != null && d.width !== liveWidthRef.current) setNodeWidth(d.width);
  }, [d.width]);
  useEffect(() => {
    if (!resizeRef.current && d.fontSize != null && d.fontSize !== liveFontRef.current) setLiveFont(d.fontSize);
  }, [d.fontSize]);

  // Sync contenteditable with saved content. Runs on mount AND when remote
  // updates arrive (d.html changes from another tab). Skipped while the local
  // user is actively focused on the editor so we don't clobber their caret or
  // in-flight typing.
  useEffect(() => {
    if (!editorRef.current) return;
    // Don't stomp on the local user's active edit.
    if (focused) return;

    // Compute the HTML that should be in the editor.
    let target: string;
    if (d.html) {
      target = d.html;
    } else if (d.text) {
      // Migrate plain text → preserve old bold/italic/underline as whole-node formatting
      let html = d.text.replace(/\n/g, "<br>");
      if (d.bold) html = `<b>${html}</b>`;
      if (d.italic) html = `<i>${html}</i>`;
      if (d.underline) html = `<u>${html}</u>`;
      target = html;
    } else {
      target = "";
    }

    // Only update if the DOM differs — avoids React overhead and cursor jumps
    // when a node redraws for unrelated reasons.
    if (editorRef.current.innerHTML !== target) {
      editorRef.current.innerHTML = target;
    }
    initializedRef.current = true;
  }, [d.html, d.text, d.bold, d.italic, d.underline, focused]);

  const color = d.color || "#ffffff";
  const align = d.align || "left";

  // V2 styling
  const bgColor = d.bgColor ?? null;
  const bgOpacity = d.bgOpacity ?? 0.15;
  const brdStyle = d.borderStyle ?? "none";
  const brdWidth = d.borderWidth ?? 1;
  const brdColor = d.borderColor ?? null;
  const shadow = d.shadow ?? "none";
  const nodeOpacity = d.nodeOpacity ?? 1;
  const brdRadius = d.borderRadius ?? "rounded";

  useEffect(() => { if (selected || focused) setShowToolbar(true); }, [selected, focused]);
  useEffect(() => {
    if (!selected && !focused && (d.text || d.html)) {
      const t = setTimeout(() => { setShowToolbar(false); setOpenPopover(null); }, 300);
      return () => clearTimeout(t);
    }
  }, [selected, focused, d.text, d.html]);

  const saveContent = useCallback(() => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    const text = editorRef.current.textContent || "";
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => d.onUpdate?.({ html, text }), 300);
  }, [d]);

  const update = useCallback((updates: Partial<AnnotationData>) => d.onUpdate?.(updates), [d]);
  const togglePopover = useCallback((name: string) => setOpenPopover(p => p === name ? null : name), []);

  // execCommand for selection-based formatting
  const execFormat = useCallback((cmd: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value);
    saveContent();
  }, [saveContent]);

  const handleCopy = useCallback(() => {
    const text = editorRef.current?.textContent || d.text || "";
    navigator.clipboard.writeText(text);
  }, [d.text]);

  const active = selected || focused;

  // ── Resize handler ──
  const onResize = useCallback((edge: ResizeEdge, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const zoom = getZoom();
    resizeRef.current = { edge, startX: e.clientX, startY: e.clientY, startW: nodeWidth, startFont: liveFont };
    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const { edge: ed, startX, startY, startW, startFont } = resizeRef.current;
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      const isCorner = ed.includes("-");
      if (isCorner) {
        const signX = ed.includes("right") ? 1 : -1;
        const signY = ed.includes("bottom") ? 1 : -1;
        const avgDelta = (dx * signX + dy * signY) / 2;
        const scale = 1 + avgDelta / startW;
        const newW = Math.max(60, Math.round(startW * scale));
        setNodeWidth(newW);
        updateNode(id, { width: newW });
        setLiveFont(Math.max(8, Math.min(200, Math.round(startFont * scale))));
      } else if (ed === "left" || ed === "right") {
        const sign = ed === "right" ? 1 : -1;
        const newW = Math.max(60, Math.round(startW + dx * sign));
        setNodeWidth(newW);
        updateNode(id, { width: newW });
      } else {
        const sign = ed === "bottom" ? 1 : -1;
        setLiveFont(Math.max(8, Math.min(200, Math.round(startFont + dy * sign * 0.3))));
      }
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      d.onUpdate?.({ width: liveWidthRef.current, fontSize: liveFontRef.current });
      updateNode(id, { width: liveWidthRef.current });
      resizeRef.current = null;
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [nodeWidth, liveFont, d, getZoom, id, updateNode]);

  const HT = 6;
  const edges: { edge: ResizeEdge; style: React.CSSProperties }[] = [
    { edge: "top",    style: { top: -HT/2, left: HT, right: HT, height: HT } },
    { edge: "bottom", style: { bottom: -HT/2, left: HT, right: HT, height: HT } },
    { edge: "left",   style: { left: -HT/2, top: HT, bottom: HT, width: HT } },
    { edge: "right",  style: { right: -HT/2, top: HT, bottom: HT, width: HT } },
    { edge: "top-left",     style: { top: -HT/2, left: -HT/2, width: HT*2, height: HT*2 } },
    { edge: "top-right",    style: { top: -HT/2, right: -HT/2, width: HT*2, height: HT*2 } },
    { edge: "bottom-left",  style: { bottom: -HT/2, left: -HT/2, width: HT*2, height: HT*2 } },
    { edge: "bottom-right", style: { bottom: -HT/2, right: -HT/2, width: HT*2, height: HT*2 } },
  ];

  // Computed styles
  const radius = RADIUS_MAP[brdRadius];
  const containerBg = bgColor ? hexAlpha(bgColor, bgOpacity) : "transparent";
  const containerBlur = bgColor ? "blur(8px)" : undefined;
  const hasBorder = brdStyle !== "none";
  const containerBorder = hasBorder
    ? `${brdWidth}px ${brdStyle} ${brdColor || hexAlpha(color, 0.5)}`
    : active ? `1px dashed ${hexAlpha(color, 0.25)}` : "1px dashed transparent";
  const containerShadow = shadow === "subtle"
    ? "0 4px 16px rgba(0,0,0,0.3)"
    : shadow === "glow" ? `0 0 20px ${hexAlpha(color, 0.25)}, 0 0 40px ${hexAlpha(color, 0.08)}` : undefined;
  const textShadowVal = shadow === "glow"
    ? `0 0 20px ${hexAlpha(color, 0.4)}, 0 1px 4px rgba(0,0,0,0.5)`
    : "0 1px 4px rgba(0,0,0,0.5)";

  const hasBg = !!bgColor;
  const hasStyle = hasBg || hasBorder || shadow !== "none" || nodeOpacity < 1 || brdRadius !== "rounded";

  return (
    <div className="relative group"
      style={{
        width: nodeWidth, minWidth: 60,
        background: containerBg, backdropFilter: containerBlur,
        border: containerBorder, borderRadius: radius,
        boxShadow: containerShadow, opacity: nodeOpacity,
        padding: bgColor || hasBorder ? "8px 12px" : 4,
        transition: "border-color 0.15s, background 0.15s, box-shadow 0.15s, opacity 0.15s, border-radius 0.15s",
      }}
    >
      {/* Drag handle */}
      <div className="flex items-center justify-center cursor-grab active:cursor-grabbing shrink-0"
        style={{ height: active ? 16 : 0, opacity: active ? 0.5 : 0, overflow: "hidden", transition: "height 0.15s, opacity 0.15s" }}
      >
        <GripHorizontal className="w-5 h-3" style={{ color }} />
      </div>

      {/* ── Toolbar ── */}
      {showToolbar && (() => {
        const s = Math.max(1, Math.min(3, liveFont / 32));
        const btnCls = (on?: boolean) => `p-0.5 rounded transition-colors ${on ? "bg-[rgba(8,145,178,0.25)] text-[#22d3ee]" : "text-muted-foreground hover:text-foreground"}`;

        return (
        <div className="nodrag absolute left-0 flex items-center gap-0.5 px-1.5 py-1 rounded-xl bg-card/90 backdrop-blur-md border border-border/60 shadow-xl z-10"
          style={{ whiteSpace: "nowrap", bottom: "100%", marginBottom: 6 * s, transform: `scale(${s})`, transformOrigin: "bottom left" }}
        >
          {/* Color picker — single dot opens popover */}
          <div className="relative">
            <button onClick={() => togglePopover("color")} className="p-0.5 rounded transition-colors hover:bg-muted/30 flex items-center justify-center" title="Text Color">
              <div className="w-3 h-3 rounded-full border border-white/30" style={{ background: color }} />
            </button>
            <Popover open={openPopover === "color"} onClose={() => setOpenPopover(null)} title="Text Color">
              <div className="flex gap-1.5 flex-wrap" style={{ maxWidth: 150 }}>
                {COLORS.map(c => (
                  <button key={c} onClick={() => { update({ color: c }); setOpenPopover(null); }}
                    className="w-4 h-4 rounded-full border-2 transition-transform hover:scale-125"
                    style={{ background: c, borderColor: color === c ? "#fff" : "rgba(255,255,255,0.15)", transform: color === c ? "scale(1.2)" : "scale(1)" }}
                  />
                ))}
              </div>
            </Popover>
          </div>

          <div className="w-px h-4 bg-border/50 mx-0.5" />

          {/* B I U — applies to selection */}
          <button onMouseDown={e => { e.preventDefault(); execFormat("bold"); }} className={btnCls()} title="Bold (Cmd+B)"><Bold className="w-3 h-3" /></button>
          <button onMouseDown={e => { e.preventDefault(); execFormat("italic"); }} className={btnCls()} title="Italic (Cmd+I)"><Italic className="w-3 h-3" /></button>
          <button onMouseDown={e => { e.preventDefault(); execFormat("underline"); }} className={btnCls()} title="Underline (Cmd+U)"><UIcon className="w-3 h-3" /></button>

          <div className="w-px h-4 bg-border/50 mx-0.5" />

          {/* Alignment */}
          {(["left", "center", "right"] as const).map(a => (
            <button key={a} onClick={() => update({ align: a })}
              className={`p-0.5 rounded text-[9px] font-bold transition-colors ${align === a ? "text-[#22d3ee]" : "text-muted-foreground hover:text-foreground"}`}
            >{a === "left" ? "L" : a === "center" ? "C" : "R"}</button>
          ))}

          <div className="w-px h-4 bg-border/50 mx-0.5" />

          {/* Font size */}
          <button onMouseDown={e => { e.preventDefault(); setLiveFont(f => { const nf = Math.max(8, f - 4); d.onUpdate?.({ fontSize: nf }); return nf; }); }} className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors" title="Decrease Size">
            <Minus className="w-3 h-3" />
          </button>
          <span className="text-[9px] font-mono text-muted-foreground w-5 text-center select-none">{liveFont}</span>
          <button onMouseDown={e => { e.preventDefault(); setLiveFont(f => { const nf = Math.min(200, f + 4); d.onUpdate?.({ fontSize: nf }); return nf; }); }} className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors" title="Increase Size">
            <Plus className="w-3 h-3" />
          </button>

          <div className="w-px h-4 bg-border/50 mx-0.5" />

          {/* Style popover (BG, Border, Shadow, Opacity, Radius) */}
          <div className="relative">
            <button onClick={() => togglePopover("style")}
              className={`p-0.5 rounded transition-colors ${hasStyle ? "text-[#84CC16]" : "text-muted-foreground hover:text-foreground"}`}
              style={hasStyle ? { background: "rgba(132,204,22,0.12)", boxShadow: "inset 0 0 0 1px rgba(132,204,22,0.25)" } : {}}
              title="Style"
            >
              <Palette className="w-3 h-3" />
            </button>
            <Popover open={openPopover === "style"} onClose={() => setOpenPopover(null)} title="Style">
              {/* Background */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[8px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>Background</span>
                  <button onClick={() => update({ bgColor: bgColor ? null : color })}
                    className="text-[8px] font-semibold px-1.5 py-0.5 rounded"
                    style={{ background: bgColor ? "rgba(132,204,22,0.15)" : "rgba(255,255,255,0.04)", color: bgColor ? "#84CC16" : "rgba(255,255,255,0.4)" }}
                  >{bgColor ? "ON" : "OFF"}</button>
                </div>
                {bgColor && (
                  <>
                    <ColorRow value={bgColor} onChange={c => update({ bgColor: c })} />
                    <OpacitySlider value={bgOpacity} onChange={v => update({ bgOpacity: v })} label="Opacity" />
                  </>
                )}
              </div>
              {/* Border */}
              <div className="mb-3">
                <div className="text-[8px] uppercase tracking-widest mb-1" style={{ color: "rgba(255,255,255,0.3)" }}>Border</div>
                <Pills options={["none", "solid", "dashed", "dotted"] as const} value={brdStyle} onChange={v => update({ borderStyle: v })} />
                {hasBorder && (
                  <>
                    <div className="mt-1.5"><Pills options={[1, 2, 3] as unknown as ("1"|"2"|"3")[]} value={String(brdWidth) as any} onChange={v => update({ borderWidth: Number(v) as 1|2|3 })} labels={{ "1": "Thin", "2": "Med", "3": "Thick" } as any} /></div>
                    <div className="mt-1.5"><ColorRow value={brdColor || color} onChange={c => update({ borderColor: c })} /></div>
                  </>
                )}
              </div>
              {/* Shadow */}
              <div className="mb-3">
                <div className="text-[8px] uppercase tracking-widest mb-1" style={{ color: "rgba(255,255,255,0.3)" }}>Shadow</div>
                <Pills options={["none", "subtle", "glow"] as const} value={shadow} onChange={v => update({ shadow: v })} />
              </div>
              {/* Radius */}
              <div className="mb-3">
                <div className="text-[8px] uppercase tracking-widest mb-1" style={{ color: "rgba(255,255,255,0.3)" }}>Corners</div>
                <Pills options={["sharp", "rounded", "pill"] as const} value={brdRadius} onChange={v => update({ borderRadius: v })} labels={{ sharp: "Sharp", rounded: "Round", pill: "Pill" }} />
              </div>
              {/* Node Opacity */}
              <OpacitySlider value={nodeOpacity} onChange={v => update({ nodeOpacity: v })} label="Node Opacity" />
            </Popover>
          </div>

          {/* Copy */}
          <button onClick={handleCopy} className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors" title="Copy Text">
            <Copy className="w-3 h-3" />
          </button>

          {/* Delete */}
          {d.onDelete && (
            <button onClick={d.onDelete} className="p-0.5 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/15 transition-colors" title="Delete">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        );
      })()}

      {/* Rich text editor (contenteditable) */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        className="nodrag nowheel bg-transparent outline-none"
        data-placeholder="Type..."
        style={{
          width: "100%", minHeight: "1.3em", color,
          fontSize: liveFont,
          textAlign: align, lineHeight: 1.3, caretColor: color,
          textShadow: textShadowVal,
          padding: "2px 4px",
          wordBreak: "break-word",
        }}
        onInput={saveContent}
        onKeyDown={(e) => {
          // Cmd+B/I/U handled natively by contenteditable via execCommand
          // Stop propagation so canvas doesn't intercept
          if ((e.metaKey || e.ctrlKey) && ["b", "i", "u"].includes(e.key.toLowerCase())) {
            e.stopPropagation();
            // Let browser handle the execCommand natively
            setTimeout(saveContent, 10);
          }
        }}
        onFocus={() => { setFocused(true); }}
        onBlur={() => { setFocused(false); saveContent(); }}
      />

      {/* Resize handles */}
      {active && edges.map(({ edge, style }) => (
        <div key={edge} onMouseDown={(e) => onResize(edge, e)} className="nodrag nopan"
          style={{ position: "absolute", cursor: CURSORS[edge], zIndex: 11, ...style }}
        />
      ))}

      {/* Placeholder styling */}
      <style>{`
        [data-placeholder]:empty::before {
          content: attr(data-placeholder);
          color: rgba(255,255,255,0.2);
          pointer-events: none;
        }
      `}</style>
    </div>
  );
});

AnnotationNode.displayName = "AnnotationNode";
export default AnnotationNode;
