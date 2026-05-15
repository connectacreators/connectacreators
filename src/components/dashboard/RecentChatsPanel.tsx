// src/components/dashboard/RecentChatsPanel.tsx
//
// "Recent chats" panel rendered in the lower half of the sidebar when
// the user is on /ai. Reads from assistant_threads (same source as
// CompanionDrawer and FullscreenAIView), groups by date.

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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
  const [searchParams] = useSearchParams();
  const activeThreadId = searchParams.get("thread");
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

  const onNewChat = () => navigate("/ai");
  const onChatClick = (id: string) => navigate(`/ai?thread=${id}`);

  return (
    <div className="flex flex-col flex-1 min-h-0 pt-2 mt-2" style={{ borderTop: "1px solid rgba(234,230,220,0.06)" }}>
      <div className="px-3 mb-2">
        <button
          type="button"
          onClick={onNewChat}
          className="w-full"
          style={{
            background: "#8FD0D5",
            color: "#141414",
            border: "1px solid #EAE6DC",
            borderRadius: 999,
            padding: "6px 11px",
            fontSize: 11,
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 5,
            cursor: "pointer",
          }}
        >
          <Plus size={12} strokeWidth={2} />
          New chat
        </button>
      </div>

      <div
        className="px-3 mb-1.5"
        style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(234,230,220,0.40)" }}
      >
        Recent
      </div>

      <div
        className="flex-1 min-h-0 overflow-y-auto"
        style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(234,230,220,0.20) transparent" }}
      >
        {groups.map((g) => (
          <div key={g.label}>
            <div
              className="px-3 pt-2 pb-1"
              style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(234,230,220,0.30)" }}
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
                    padding: "5px 14px",
                    fontSize: 11,
                    color: isActive ? "#EAE6DC" : "rgba(234,230,220,0.62)",
                    background: isActive ? "rgba(234,230,220,0.06)" : "transparent",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "rgba(234,230,220,0.04)";
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
