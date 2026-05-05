// src/components/assistant/AssistantThreadList.tsx
//
// Reusable CHATS sidebar — supersedes both:
//   - src/components/canvas/SessionSidebar.tsx
//   - the inline chat list inside FullscreenAIView.tsx (lines 641-839)
//
// Phase B.1, Task 2 of the companion ↔ canvas AI merge.
//
// Styling uses Tailwind throughout. Dark canvas-style palette so the component
// can drop into both the canvas/fullscreen view and the new unified drawer.

import { useMemo, useState } from "react";
import { MessageSquare, Pencil, Plus, Trash2 } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ThreadListItem {
  id: string;
  name: string;
  /** Optional badge — used for the small origin chip ("Canvas" / "Drawer") */
  origin?: "drawer" | "canvas";
  updatedAt: string;
  messageCount?: number;
}

export interface AssistantThreadListProps {
  threads: ThreadListItem[];
  activeThreadId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => Promise<void> | void;
  onRename?: (id: string, newName: string) => Promise<void> | void;
  onDelete?: (id: string) => Promise<void> | void;
  /** Show date headers (Today / Yesterday / Earlier this week / Earlier) — default true */
  groupByDate?: boolean;
  /** Visual variant: compact (drawer ~360px wide) or full (canvas/fullscreen) */
  variant?: "compact" | "full";
  className?: string;
}

// ── Date helpers ───────────────────────────────────────────────────────────

type GroupLabel = "Today" | "Yesterday" | "Earlier this week" | "Earlier";

function relativeDate(iso: string): GroupLabel {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return "Earlier this week";
  return "Earlier";
}

function relativeShort(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const GROUP_ORDER: GroupLabel[] = [
  "Today",
  "Yesterday",
  "Earlier this week",
  "Earlier",
];

function groupThreads(
  threads: ThreadListItem[],
): Array<{ label: GroupLabel; items: ThreadListItem[] }> {
  const map = new Map<GroupLabel, ThreadListItem[]>();
  for (const t of threads) {
    const label = relativeDate(t.updatedAt);
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(t);
  }
  return GROUP_ORDER
    .filter((label) => map.has(label))
    .map((label) => ({ label, items: map.get(label)! }));
}

// ── Component ──────────────────────────────────────────────────────────────

export function AssistantThreadList({
  threads,
  activeThreadId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  groupByDate = true,
  variant = "full",
  className = "",
}: AssistantThreadListProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Sort by updatedAt desc (defensive — caller may not pre-sort)
  const sorted = useMemo(
    () =>
      [...threads].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    [threads],
  );

  const groups = useMemo(
    () => (groupByDate ? groupThreads(sorted) : null),
    [sorted, groupByDate],
  );

  const compact = variant === "compact";

  const handleRenameSave = async (id: string) => {
    const trimmed = renameValue.trim();
    if (trimmed && onRename) {
      await onRename(id, trimmed);
    }
    setRenamingId(null);
    setRenameValue("");
  };

  const renderItem = (thread: ThreadListItem) => {
    const isActive = thread.id === activeThreadId;
    const isRenaming = renamingId === thread.id;
    const isConfirming = confirmDeleteId === thread.id;

    return (
      <div
        key={thread.id}
        onClick={
          !isRenaming && !isConfirming ? () => onSelect(thread.id) : undefined
        }
        className={[
          "group relative flex items-start gap-2 cursor-pointer transition-colors",
          compact ? "px-2 py-1.5" : "px-3 py-2",
          "border-l-2",
          isActive
            ? "bg-white/[0.04] border-white/20"
            : "border-transparent hover:bg-white/5",
        ].join(" ")}
      >
        <div className="flex-1 min-w-0">
          {isRenaming ? (
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleRenameSave(thread.id);
                if (e.key === "Escape") {
                  setRenamingId(null);
                  setRenameValue("");
                }
              }}
              onBlur={() => void handleRenameSave(thread.id)}
              onClick={(e) => e.stopPropagation()}
              className={[
                "w-full bg-white/5 border border-white/20 rounded px-1.5 py-0.5",
                "text-white outline-none",
                compact ? "text-xs" : "text-sm",
              ].join(" ")}
            />
          ) : isConfirming ? (
            <div
              className="flex flex-col gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="text-[11px] font-medium text-red-400">
                Delete this chat?
              </span>
              <div className="flex gap-1">
                <button
                  className="px-2 py-0.5 rounded bg-red-500/20 text-red-400 text-[10px] hover:bg-red-500/30 transition-colors"
                  onClick={async () => {
                    if (onDelete) await onDelete(thread.id);
                    setConfirmDeleteId(null);
                  }}
                >
                  Delete
                </button>
                <button
                  className="px-2 py-0.5 rounded bg-white/10 text-white/60 text-[10px] hover:bg-white/20 transition-colors"
                  onClick={() => setConfirmDeleteId(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className={[
                    "truncate block",
                    compact ? "text-xs" : "text-sm",
                    isActive
                      ? "text-white/90 font-medium"
                      : "text-white/65",
                  ].join(" ")}
                >
                  {thread.name}
                </span>
                {thread.origin && (
                  <span style={{ width: 4, height: 4, borderRadius: "50%", background: "rgba(255,255,255,0.16)", flexShrink: 0, display: "inline-block" }} />
                )}
              </div>
              <div className="text-[10px] text-white/30 leading-snug">
                {relativeShort(thread.updatedAt)}
                {typeof thread.messageCount === "number" && thread.messageCount > 0 && (
                  <span className="ml-1.5">· {thread.messageCount} msg</span>
                )}
              </div>
            </>
          )}
        </div>

        {/* Hover actions — only visible when not renaming/confirming AND callbacks exist */}
        {!isRenaming && !isConfirming && (onRename || onDelete) && (
          <div
            className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            {onRename && (
              <button
                title="Rename"
                onClick={(e) => {
                  e.stopPropagation();
                  setRenamingId(thread.id);
                  setRenameValue(thread.name);
                }}
                className="p-1 rounded text-white/40 hover:text-white/75 hover:bg-white/5 transition-colors"
              >
                <Pencil className="w-3 h-3" />
              </button>
            )}
            {onDelete && (
              <button
                title="Delete"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDeleteId(thread.id);
                }}
                className="p-1 rounded text-white/40 hover:text-red-400 hover:bg-white/5 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className={[
        "flex flex-col h-full bg-[#111214] text-white",
        className,
      ].join(" ")}
    >
      {/* Header — uppercase label + new chat button */}
      <div
        className={[
          "flex items-center justify-between border-b border-white/10 flex-shrink-0",
          compact ? "px-2 py-2" : "px-3 py-2.5",
        ].join(" ")}
      >
        <span className="text-[10px] font-semibold tracking-[0.08em] uppercase text-white/35">
          Chats
        </span>
        <button
          onClick={() => void onCreate()}
          className={[
            "relative flex items-center gap-1 transition-colors",
            compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-0.5 text-[11px]",
          ].join(" ")}
          style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer" }}
          title="Start a new chat"
        >
          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "hidden", pointerEvents: "none" }} viewBox="0 0 70 22" preserveAspectRatio="none">
            <path d="M5,2 C18,0.5 52,0.5 63,2 C67,2.5 69,5 69,7.5 C69.5,11 69,15 68,18 C67,20.5 64,22 59,22.5 C42,23.5 22,23.5 10,22.5 C5,22 2,20.5 2,18 C1,14 1,10 2,7 C2.5,4 3.5,2.5 5,2 Z" fill="none" stroke="rgba(201,169,110,0.25)" strokeWidth="1" strokeLinecap="round"/>
          </svg>
          <Plus className={compact ? "w-3 h-3" : "w-3.5 h-3.5"} />
          New
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1.5 custom-scrollbar">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
            <MessageSquare className="w-6 h-6 text-white/20" />
            <p className="text-xs text-white/40">
              No chats yet — start a new one
            </p>
          </div>
        ) : groups ? (
          groups.map(({ label, items }) => (
            <div key={label}>
              <div
                className={[
                  "text-[10px] font-semibold tracking-[0.06em] uppercase text-white/20",
                  compact ? "px-2 pt-2 pb-1" : "px-3 pt-2.5 pb-1",
                ].join(" ")}
              >
                {label}
              </div>
              {items.map(renderItem)}
            </div>
          ))
        ) : (
          sorted.map(renderItem)
        )}
      </div>
    </div>
  );
}
