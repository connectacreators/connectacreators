import { useState } from "react";
import { Plus, ChevronLeft, ChevronRight, Pencil, Trash2 } from "lucide-react";

export interface SessionItem {
  id: string;
  name: string;
  is_active: boolean;
  updated_at: string;
}

interface Props {
  sessions: SessionItem[];
  activeSessionId: string | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onNewChat: () => void;
  onSwitch: (session: SessionItem) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

function relativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function SessionSidebar({
  sessions,
  activeSessionId,
  collapsed,
  onToggleCollapsed,
  onNewChat,
  onSwitch,
  onRename,
  onDelete,
}: Props) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleRenameSave = (id: string) => {
    if (renameValue.trim()) onRename(id, renameValue.trim());
    setRenamingId(null);
  };

  return (
    // Outer wrapper: no overflow-hidden → toggle button stays visible when sidebar is collapsed
    <div className="relative flex-shrink-0 flex">

      {/* Collapsible panel — overflow:hidden clips the content but NOT the toggle */}
      <div
        className="flex flex-col border-r border-border/50 bg-card/60 backdrop-blur-sm transition-all duration-200 overflow-hidden"
        style={{ width: collapsed ? 0 : 220 }}
      >
        {/* Inner content — minWidth prevents layout reflow during width animation */}
        <div className="flex flex-col h-full p-2 gap-1" style={{ minWidth: 220 }}>

          {/* New chat button — mt-10 clears space for the toggle button at top-12 */}
          <button
            onClick={onNewChat}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-foreground hover:bg-muted/50 transition-colors border border-border/50 mt-10"
          >
            <Plus className="w-4 h-4 flex-shrink-0" />
            New chat
          </button>

          {/* Session list */}
          <div className="flex-1 overflow-y-auto mt-1 space-y-0.5">
            {sessions.map(session => {
              const isActive = session.id === activeSessionId;
              const isRenaming = renamingId === session.id;
              const isConfirming = confirmDeleteId === session.id;

              return (
                <div
                  key={session.id}
                  className={`group relative flex items-start px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                  }`}
                  onClick={!isRenaming && !isConfirming ? () => onSwitch(session) : undefined}
                >
                  {isRenaming ? (
                    <input
                      autoFocus
                      className="flex-1 text-sm bg-transparent border-b border-primary outline-none py-0.5 w-full"
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") handleRenameSave(session.id);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      onBlur={() => handleRenameSave(session.id)}
                      onClick={e => e.stopPropagation()}
                    />
                  ) : isConfirming ? (
                    <div className="flex-1 flex flex-col gap-1" onClick={e => e.stopPropagation()}>
                      <span className="text-[11px] text-red-400 font-medium">Delete this chat?</span>
                      <div className="flex gap-1">
                        <button
                          className="text-[10px] px-2 py-0.5 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                          onClick={() => { onDelete(session.id); setConfirmDeleteId(null); }}
                        >
                          Delete
                        </button>
                        <button
                          className="text-[10px] px-2 py-0.5 rounded bg-muted/50 text-muted-foreground hover:bg-muted transition-colors"
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate leading-snug">{session.name}</div>
                        <div className="text-[10px] text-muted-foreground/60 leading-snug">
                          {relativeTime(session.updated_at)}
                        </div>
                      </div>
                      <div className="hidden group-hover:flex items-center gap-0.5 ml-1 flex-shrink-0">
                        <button
                          className="p-1 rounded hover:bg-muted/50 transition-colors"
                          title="Rename"
                          onClick={e => {
                            e.stopPropagation();
                            setRenamingId(session.id);
                            setRenameValue(session.name);
                          }}
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          className="p-1 rounded hover:bg-red-500/10 hover:text-red-400 transition-colors"
                          title="Delete"
                          onClick={e => {
                            e.stopPropagation();
                            setConfirmDeleteId(session.id);
                          }}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>   {/* end session list */}

        </div>   {/* end inner content */}
      </div>   {/* end collapsible panel */}

      {/* Toggle button — sibling of collapsible panel, never clipped */}
      <button
        className="absolute -right-3 top-12 z-20 w-6 h-6 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground shadow-md"
        onClick={onToggleCollapsed}
        title={collapsed ? "Open sessions" : "Close sessions"}
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>

    </div>   {/* end outer wrapper */}
  );
}
