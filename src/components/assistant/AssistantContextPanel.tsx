// src/components/assistant/AssistantContextPanel.tsx
//
// "AI sees" right-side context panel — pure presentational component.
// Receives a list of nodes (already filtered + display-resolved by caller)
// plus type → color/label maps. The component knows nothing about canvas
// internals; the same component works on `/ai` (off-canvas, empty) and on
// the canvas (showing connected nodes).
//
// Lifted out of `src/components/canvas/FullscreenAIView.tsx` (Phase B.1,
// Task 5). Styling copied verbatim to preserve UX.

export interface ContextNode {
  id: string;
  type: string;
  /** Display label — caller is responsible for resolving from node.data */
  label: string;
}

export interface AssistantContextPanelProps {
  nodes: ContextNode[];
  /** Map of node-type → CSS color (e.g. "#84cc16" for videoNode) — caller passes the canvas's NODE_TYPE_COLOR */
  typeColorMap?: Record<string, string>;
  /** Map of node-type → display label (e.g. "videoNode" → "Video") */
  typeLabelMap?: Record<string, string>;
  /** Default fallback color when typeColorMap doesn't have an entry */
  fallbackColor?: string;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  /** Custom empty-state message (off-canvas vs no-nodes-connected) */
  emptyMessage?: string;
  className?: string;
}

export function AssistantContextPanel({
  nodes,
  typeColorMap,
  typeLabelMap,
  fallbackColor = "#888",
  collapsed = false,
  onToggleCollapsed,
  emptyMessage = "No nodes on canvas yet",
  className,
}: AssistantContextPanelProps) {
  return (
    <div
      className={className}
      style={{
        width: collapsed ? 32 : 180,
        flexShrink: 0,
        background: "#111214",
        borderLeft: "1px solid #2a2b30",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        transition: "width 0.25s ease",
      }}
    >
      {collapsed ? (
        /* Collapsed strip */
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "10px 0",
            gap: 8,
          }}
        >
          <button
            onClick={onToggleCollapsed}
            title="Expand AI context panel"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "rgba(255,255,255,0.35)",
              padding: 4,
              borderRadius: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.color = "#22d3ee")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.35)")
            }
          >
            <span style={{ fontSize: 14 }}>&#8250;</span>
          </button>
          <div
            style={{
              writingMode: "vertical-rl",
              textOrientation: "mixed",
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.22)",
              marginTop: 4,
            }}
          >
            AI sees
          </div>
        </div>
      ) : (
        /* Expanded panel */
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Panel header */}
          <div
            style={{
              padding: "10px 12px 8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottom: "1px solid #2a2b30",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.35)",
                }}
              >
                AI sees
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#22d3ee",
                  background: "rgba(34,211,238,0.1)",
                  borderRadius: 4,
                  padding: "1px 5px",
                }}
              >
                {nodes.length}
              </span>
            </div>
            <button
              onClick={onToggleCollapsed}
              title="Collapse AI context panel"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "rgba(255,255,255,0.35)",
                padding: 2,
                borderRadius: 4,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                lineHeight: 1,
                transition: "color 0.15s",
              }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.color = "#22d3ee")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.35)")
              }
            >
              &#8249;
            </button>
          </div>

          {/* Node list */}
          <div
            style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}
            className="custom-scrollbar"
          >
            {nodes.length === 0 ? (
              <div
                style={{
                  padding: "12px",
                  fontSize: 11,
                  color: "rgba(255,255,255,0.25)",
                  textAlign: "center",
                  lineHeight: 1.5,
                }}
              >
                {emptyMessage}
              </div>
            ) : (
              nodes.map((node) => {
                const color = typeColorMap?.[node.type] || fallbackColor;
                const typeLabel = typeLabelMap?.[node.type] || node.type;

                return (
                  <div
                    key={node.id}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 8,
                      padding: "5px 12px",
                    }}
                  >
                    <div
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: color,
                        flexShrink: 0,
                        marginTop: 3,
                      }}
                    />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontSize: 11,
                          color: "rgba(255,255,255,0.7)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {node.label}
                      </div>
                      <div
                        style={{
                          fontSize: 9,
                          color: "rgba(255,255,255,0.28)",
                          marginTop: 1,
                        }}
                      >
                        {typeLabel}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "8px 12px",
              borderTop: "1px solid #2a2b30",
              flexShrink: 0,
            }}
          >
            <p
              style={{
                fontSize: 10,
                color: "rgba(255,255,255,0.22)",
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              Add nodes in canvas to give the AI more context
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
