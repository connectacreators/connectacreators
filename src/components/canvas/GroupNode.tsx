import { memo, useState, useCallback, useRef, useEffect } from "react";
import { NodeProps, NodeResizer } from "@xyflow/react";
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
      className={`group relative w-full h-full rounded-xl border backdrop-blur-xl transition-colors ${
        d.isDropTarget
          ? "bg-purple-500/10 border-purple-500/50"
          : "bg-black/45 border-white/20"
      }`}
      style={{ minWidth: 200, minHeight: 150 }}
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
        <div className="flex items-center gap-1.5 px-2 py-1 bg-white/5 rounded-md max-w-[80%]">
          <Folder className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
          {editing ? (
            <input
              ref={inputRef}
              className="nodrag bg-transparent text-white/85 text-xs font-medium outline-none border-b border-purple-400/50 min-w-[60px] max-w-full"
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={saveLabel}
            />
          ) : (
            <span
              className="text-white/85 text-xs font-medium truncate cursor-text"
              onDoubleClick={() => { setEditValue(d.label || "New Group"); setEditing(true); }}
            >
              {d.label || "New Group"}
            </span>
          )}
          {(d.childCount ?? 0) > 0 && (
            <span className="text-white/30 text-[10px] ml-1 flex-shrink-0">
              {d.childCount} node{(d.childCount ?? 0) !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Delete button */}
        <button
          className="nodrag ml-auto p-1 rounded-md text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
          onClick={() => d.onDelete?.()}
          title="Delete group"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
});

GroupNode.displayName = "GroupNode";
export default GroupNode;
