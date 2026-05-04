// src/components/canvas/SessionSidebar.tsx
//
// Thin canvas-side adapter around the shared <AssistantThreadList>.
// Maps the canvas's SessionItem shape to ThreadListItem and adds the
// canvas-specific collapse toggle button on the outside of the panel.

import { ChevronLeft, ChevronRight } from "lucide-react";
import { AssistantThreadList } from "@/components/assistant";

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
  // Adapt SessionItem → ThreadListItem
  const threads = sessions.map((s) => ({
    id: s.id,
    name: s.name,
    origin: "canvas" as const,
    updatedAt: s.updated_at,
  }));

  // The shared list selects by id — re-resolve to the original SessionItem so
  // callers that depend on the full object keep working.
  const handleSelect = (id: string) => {
    const session = sessions.find((s) => s.id === id);
    if (session) onSwitch(session);
  };

  return (
    // Outer wrapper: no overflow-hidden so the toggle button stays visible
    // when the sidebar is collapsed.
    <div className="relative flex-shrink-0 flex">
      {/* Collapsible panel */}
      <div
        className="flex flex-col border-r border-border/50 bg-card/60 backdrop-blur-sm transition-all duration-200 overflow-hidden"
        style={{ width: collapsed ? 0 : 220 }}
      >
        <div className="flex flex-col h-full" style={{ minWidth: 220 }}>
          <AssistantThreadList
            threads={threads}
            activeThreadId={activeSessionId}
            onSelect={handleSelect}
            onCreate={onNewChat}
            onRename={onRename}
            onDelete={onDelete}
            groupByDate
            variant="full"
          />
        </div>
      </div>

      {/* Toggle button — sibling of collapsible panel, never clipped */}
      <button
        className="absolute -right-3 top-12 z-20 w-6 h-6 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground shadow-md"
        onClick={onToggleCollapsed}
        title={collapsed ? "Open sessions" : "Close sessions"}
      >
        {collapsed ? (
          <ChevronRight className="w-3 h-3" />
        ) : (
          <ChevronLeft className="w-3 h-3" />
        )}
      </button>
    </div>
  );
}
