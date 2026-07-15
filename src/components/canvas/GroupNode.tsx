import { memo, useState, useCallback, useRef, useEffect } from "react";
import { Handle, Position, NodeProps, NodeResizer } from "@xyflow/react";
import { Folder, X } from "lucide-react";

interface GroupNodeData {
  label?: string;
  childCount?: number;
  isDropTarget?: boolean;
  onUpdate?: (updates: Partial<GroupNodeData>) => void;
  onDelete?: () => void;
}

const GroupNode = memo(({ data, selected }: NodeProps) => {
  const d = data as GroupNodeData;
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(d.label || "New Group");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const saveLabel = useCallback(() => {
    const trimmed = editValue.trim() || "New Group";
    setEditValue(trimmed);
    d.onUpdate?.({ label: trimmed });
    setEditing(false);
  }, [editValue, d]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") saveLabel();
    if (e.key === "Escape") { setEditValue(d.label || "New Group"); setEditing(false); }
  }, [saveLabel, d.label]);

  return (
    <div
      className="group relative w-full h-full rounded-2xl transition-colors"
      style={{
        minWidth: 200,
        minHeight: 150,
        background: "hsl(var(--cream))",
        border: d.isDropTarget ? "1px solid hsl(var(--aqua))" : "1px solid hsl(var(--ink-on-cream))",
        boxShadow: selected
          ? "3px 3px 0 hsl(var(--ink-on-cream)), 0 0 0 2px hsl(var(--aqua))"
          : "3px 3px 0 hsl(var(--ink-on-cream))",
      }}
    >
      <NodeResizer
        minWidth={200}
        minHeight={150}
        handleStyle={{ opacity: 0, width: 12, height: 12 }}
        lineStyle={{ opacity: 0 }}
        isVisible={selected}
      />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md max-w-[80%]" style={{ background: "hsl(var(--ink-on-cream) / 0.05)" }}>
          <Folder className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "hsl(var(--ink-on-cream))" }} />
          {editing ? (
            <input
              ref={inputRef}
              className="nodrag bg-transparent text-xs font-medium outline-none min-w-[60px] max-w-full"
              style={{ color: "hsl(var(--ink-on-cream))", borderBottom: "1px solid hsl(var(--ink-on-cream))" }}
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={saveLabel}
            />
          ) : (
            <span
              className="text-xs font-medium truncate cursor-text"
              style={{ color: "hsl(var(--ink-on-cream))" }}
              onDoubleClick={() => { setEditValue(d.label || "New Group"); setEditing(true); }}
            >
              {d.label || "New Group"}
            </span>
          )}
          {(d.childCount ?? 0) > 0 && (
            <span className="text-[10px] ml-1 flex-shrink-0" style={{ color: "hsl(var(--ink-on-cream) / 0.50)" }}>
              {d.childCount} node{(d.childCount ?? 0) !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Delete button */}
        <button
          className="nodrag ml-auto p-1 rounded-md hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
          style={{ color: "hsl(var(--ink-on-cream) / 0.40)" }}
          onClick={() => d.onDelete?.()}
          title="Delete group"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Connector dots — wire the whole folder (all nested nodes' context) to the AI assistant */}
      <Handle type="target" position={Position.Left} className="!bg-primary !border-primary/70 !w-3 !h-3" style={{ zIndex: 50 }} />
      <Handle type="source" position={Position.Right} className="!bg-primary !border-primary/70 !w-3 !h-3" style={{ zIndex: 50 }} />
    </div>
  );
});

GroupNode.displayName = "GroupNode";
export default GroupNode;
