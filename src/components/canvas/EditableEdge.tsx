import { useState, useRef, useEffect, useCallback } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  useReactFlow,
  type EdgeProps,
} from "@xyflow/react";

const EDGE_COLORS = [
  "hsl(44 75% 87%)", "#22d3ee", "#f43f5e", "#a3e635", "#f59e0b",
  "#a78bfa", "#60a5fa", "#34d399", "#fb923c", "#ffffff",
];

const EDGE_WIDTHS = [1, 2, 3, 5];

type PathType = "bezier" | "smoothstep" | "straight";
type StrokeStyle = "solid" | "dashed" | "dotted";

export default function EditableEdge({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition, selected, data, style, markerEnd,
}: EdgeProps) {
  const { setEdges } = useReactFlow();
  const [showToolbar, setShowToolbar] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Edge data props (stored in edge.data)
  const edgeColor = (data as any)?.color || (style as any)?.stroke || "hsl(44 75% 87%)";
  const edgeWidth = (data as any)?.width || (style as any)?.strokeWidth || 1.5;
  const pathType: PathType = (data as any)?.pathType || "bezier";
  const strokeStyle: StrokeStyle = (data as any)?.strokeStyle || "solid";
  const hasArrow = (data as any)?.arrow ?? false;

  // Compute path based on type
  let path: string, labelX: number, labelY: number;
  if (pathType === "smoothstep") {
    [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  } else if (pathType === "straight") {
    [path, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  } else {
    [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  }

  // Show toolbar when selected
  useEffect(() => {
    if (selected) setShowToolbar(true);
    else {
      const t = setTimeout(() => setShowToolbar(false), 200);
      return () => clearTimeout(t);
    }
  }, [selected]);

  const updateEdge = useCallback((updates: Record<string, any>) => {
    setEdges(eds => eds.map(e => e.id === id ? { ...e, data: { ...e.data, ...updates } } : e));
  }, [id, setEdges]);

  const updateStyle = useCallback((updates: Record<string, any>) => {
    setEdges(eds => eds.map(e => e.id === id ? {
      ...e,
      style: { ...e.style, ...updates },
      data: { ...e.data, ...updates },
    } : e));
  }, [id, setEdges]);

  // Stroke dasharray
  const dashArray = strokeStyle === "dashed" ? "8 4" : strokeStyle === "dotted" ? "2 4" : undefined;

  // Arrow marker
  const marker = hasArrow ? `url(#edge-arrow-${id})` : undefined;

  return (
    <>
      {/* Custom arrow marker */}
      {hasArrow && (
        <svg style={{ position: "absolute", width: 0, height: 0 }}>
          <defs>
            <marker
              id={`edge-arrow-${id}`}
              viewBox="0 0 10 10"
              refX="8" refY="5"
              markerWidth="6" markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={edgeColor} />
            </marker>
          </defs>
        </svg>
      )}

      {/* Invisible wider path for easier clicking */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        style={{ cursor: "pointer" }}
      />

      {/* Visible edge */}
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: edgeColor,
          strokeWidth: edgeWidth,
          strokeDasharray: dashArray,
          strokeOpacity: selected ? 1 : 0.7,
          transition: "stroke-opacity 0.15s",
        }}
        markerEnd={marker || markerEnd}
      />

      {/* Selection highlight */}
      {selected && (
        <path
          d={path}
          fill="none"
          stroke={edgeColor}
          strokeWidth={edgeWidth + 4}
          strokeOpacity={0.15}
          strokeLinecap="round"
        />
      )}

      {/* Toolbar */}
      {showToolbar && (
        <EdgeLabelRenderer>
          <div
            ref={toolbarRef}
            className="nodrag nopan"
            style={{
              position: "absolute",
              transform: `translate(-50%, -100%) translate(${labelX}px,${labelY - 12}px)`,
              pointerEvents: "all",
              zIndex: 1000,
            }}
          >
            <div className="flex items-center gap-1 px-2 py-1.5 rounded-xl bg-card/95 backdrop-blur-md border border-border/60 shadow-xl"
              style={{ whiteSpace: "nowrap" }}
            >
              {/* Path type */}
              <div className="relative group">
                <button className="p-1 rounded-lg text-[#94a3b8] hover:text-foreground hover:bg-muted/30 transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    {pathType === "straight" ? <line x1="4" y1="20" x2="20" y2="4" /> :
                     pathType === "smoothstep" ? <><line x1="4" y1="20" x2="4" y2="10" /><line x1="4" y1="10" x2="20" y2="10" /><line x1="20" y1="10" x2="20" y2="4" /></> :
                     <path d="M4 20 C4 12, 20 12, 20 4" />}
                  </svg>
                </button>
                <div className="absolute h-2 w-full left-0 top-full" />
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 rounded-xl bg-card border border-border shadow-xl z-50 overflow-hidden py-1 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity">
                  {(["bezier", "smoothstep", "straight"] as const).map(t => (
                    <button key={t} onClick={() => updateEdge({ pathType: t })}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors text-left ${pathType === t ? "text-[#22d3ee] bg-[rgba(8,145,178,0.1)]" : "text-muted-foreground hover:text-foreground hover:bg-muted/30"}`}
                    >
                      {t === "bezier" ? "Curve" : t === "smoothstep" ? "Step" : "Straight"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="w-px h-4 bg-border/40 mx-0.5" />

              {/* Stroke style */}
              <div className="relative group">
                <button className="p-1 rounded-lg text-[#94a3b8] hover:text-foreground hover:bg-muted/30 transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                    strokeDasharray={strokeStyle === "dashed" ? "6 3" : strokeStyle === "dotted" ? "2 3" : undefined}
                  >
                    <line x1="3" y1="12" x2="21" y2="12" />
                  </svg>
                </button>
                <div className="absolute h-2 w-full left-0 top-full" />
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 rounded-xl bg-card border border-border shadow-xl z-50 overflow-hidden py-1 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity">
                  {(["solid", "dashed", "dotted"] as const).map(s => (
                    <button key={s} onClick={() => updateStyle({ strokeStyle: s })}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors text-left capitalize ${strokeStyle === s ? "text-[#22d3ee] bg-[rgba(8,145,178,0.1)]" : "text-muted-foreground hover:text-foreground hover:bg-muted/30"}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Arrow toggle */}
              <button onClick={() => updateEdge({ arrow: !hasArrow })}
                className={`p-1 rounded-lg transition-colors ${hasArrow ? "text-[#22d3ee] bg-[rgba(8,145,178,0.15)]" : "text-[#94a3b8] hover:text-foreground hover:bg-muted/30"}`}
                title={hasArrow ? "Remove Arrow" : "Add Arrow"}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                </svg>
              </button>

              <div className="w-px h-4 bg-border/40 mx-0.5" />

              {/* Color */}
              <div className="relative group">
                <button className="p-1 rounded-lg hover:bg-muted/30 transition-colors flex items-center justify-center">
                  <div className="w-3.5 h-3.5 rounded-full border border-white/30" style={{ background: edgeColor }} />
                </button>
                <div className="absolute h-2 w-full left-0 top-full" />
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 p-2 rounded-xl bg-card border border-border shadow-xl z-50 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity">
                  <div className="flex gap-1.5">
                    {EDGE_COLORS.map(c => (
                      <button key={c} onClick={() => updateStyle({ color: c, stroke: c })}
                        className={`w-4 h-4 rounded-full border-2 transition-transform hover:scale-110 ${edgeColor === c ? "border-white scale-110" : "border-transparent"}`}
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Width */}
              <div className="relative group">
                <button className="p-1 rounded-lg hover:bg-muted/30 transition-colors flex items-center justify-center">
                  <div className="rounded-full bg-[#94a3b8]" style={{ width: Math.max(3, edgeWidth * 1.8), height: Math.max(3, edgeWidth * 1.8) }} />
                </button>
                <div className="absolute h-2 w-full left-0 top-full" />
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 p-2 rounded-xl bg-card border border-border shadow-xl z-50 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity">
                  <div className="flex items-center gap-1.5">
                    {EDGE_WIDTHS.map(w => (
                      <button key={w} onClick={() => updateStyle({ width: w, strokeWidth: w })}
                        className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors ${edgeWidth === w ? "bg-[rgba(8,145,178,0.2)]" : "hover:bg-muted/30"}`}
                      >
                        <div className="rounded-full" style={{ width: Math.max(3, w * 1.8), height: Math.max(3, w * 1.8), background: edgeWidth === w ? "#22d3ee" : "#94a3b8" }} />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="w-px h-4 bg-border/40 mx-0.5" />

              {/* Delete */}
              <button onClick={() => setEdges(eds => eds.filter(e => e.id !== id))}
                className="p-1 rounded-lg text-[#94a3b8] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title="Delete"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
