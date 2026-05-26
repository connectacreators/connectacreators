// src/components/dashboard/RecentChatsPanel.tsx
//
// "Recent chats" panel rendered in the lower half of the sidebar when
// the user is on /ai. Reads from assistant_threads (same source as
// CompanionDrawer and FullscreenAIView), groups by date.

import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useActiveChat } from "@/hooks/useActiveChat";
import { Plus } from "lucide-react";

interface Thread {
  id: string;
  title: string | null;
  last_message_at: string | null;
  updated_at: string;
}

interface ThreadGroup {
  label: string;
  threads: Thread[];
}

function groupByDate(threads: Thread[]): ThreadGroup[] {
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  const today: Thread[] = [];
  const yesterday: Thread[] = [];
  const lastWeek: Thread[] = [];
  const older: Thread[] = [];
  for (const t of threads) {
    const ts = new Date(t.last_message_at ?? t.updated_at).getTime();
    const age = now - ts;
    if (age < oneDay) today.push(t);
    else if (age < 2 * oneDay) yesterday.push(t);
    else if (age < 7 * oneDay) lastWeek.push(t);
    else older.push(t);
  }
  const groups: ThreadGroup[] = [];
  if (today.length)     groups.push({ label: "Today",     threads: today });
  if (yesterday.length) groups.push({ label: "Yesterday", threads: yesterday });
  if (lastWeek.length)  groups.push({ label: "Last week", threads: lastWeek });
  if (older.length)     groups.push({ label: "Older",     threads: older });
  return groups;
}

export function RecentChatsPanel() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Use the shared useActiveChat hook (localStorage + cross-tab broadcast) so
  // clicks in this sidebar sync immediately with CommandCenter's content
  // pane. Reading the URL `?thread=...` alone wouldn't work — CommandCenter
  // reads from useActiveChat, not the URL, so the two surfaces would diverge.
  const { activeThreadId, setActiveChat, clearActiveChat } = useActiveChat();
  const [threads, setThreads] = useState<Thread[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from("assistant_threads")
      .select("id, title, last_message_at, updated_at")
      .eq("user_id", user.id)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(50)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error) setThreads((data ?? []) as Thread[]);
      });
    return () => { cancelled = true; };
  }, [user]);

  const groups = groupByDate(threads);

  const onNewChat = () => {
    clearActiveChat();
    if (location.pathname !== "/ai") navigate("/ai");
  };
  const onChatClick = (id: string) => {
    setActiveChat(id, null);
    if (location.pathname !== "/ai") navigate("/ai");
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 pt-2 mt-1" style={{ borderTop: "1px solid hsl(var(--bone) / 0.06)" }}>
      {/* New chat — subtle row, Claude-style. Same color treatment as the
          nav items above so it reads as part of the same list. */}
      <button
        type="button"
        onClick={onNewChat}
        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-[#aaaaaa] hover:text-[#e8e8e8] transition-colors"
      >
        <Plus className="w-4 h-4 flex-shrink-0" strokeWidth={1.75} />
        New chat
      </button>

      <div
        className="flex-1 min-h-0 overflow-y-auto pt-1"
        style={{ scrollbarWidth: "thin", scrollbarColor: "hsl(var(--bone) / 0.20) transparent" }}
      >
        {groups.map((g) => (
          <div key={g.label} className="mb-1">
            <div
              className="px-3 pt-2 pb-0.5"
              style={{ fontSize: 10, color: "hsl(var(--bone) / 0.32)" }}
            >
              {g.label}
            </div>
            {g.threads.map((t) => {
              const isActive = t.id === activeThreadId;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onChatClick(t.id)}
                  className="block w-full text-left truncate"
                  style={{
                    padding: "4px 12px",
                    fontSize: 12,
                    lineHeight: 1.35,
                    color: isActive ? "hsl(var(--cream))" : "hsl(var(--bone) / 0.55)",
                    background: isActive ? "hsl(var(--bone) / 0.05)" : "transparent",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "hsl(var(--bone) / 0.03)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                  }}
                >
                  {t.title ?? "Untitled chat"}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
