// src/pages/CommandCenter.tsx
//
// Phase B.2 — `/ai` companion command-center page redesigned as a three-panel
// canvas-AI-style layout that uses the shared `@/components/assistant` primitives.
//
// Layout:
//   ┌────────────────────────────────────────────────────────────────┐
//   │ HEADER: ← Back  Companion · [mode pill]   tabs (Chat / Tasks)  │
//   ├──────────┬────────────────────────────────────┬────────────────┤
//   │ CHATS    │  AssistantChat                     │ AI SEES        │
//   │ + New    │                                    │ (off-canvas:   │
//   │ threads  │  AssistantTextInput                │  empty state)  │
//   └──────────┴────────────────────────────────────┴────────────────┘
//
// Phase 1's task system (To Do / In Progress / Done) survives as a separate
// "Tasks" tab in the header so users today aren't broken — same task cards,
// same actions, same priority colors.
//
// Reads threads + messages from `assistant_threads` / `assistant_messages`
// (Phase A foundation; second surface using the new tables after CompanionDrawer).

import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  ListChecks,
} from "lucide-react";
import { useCompanion } from "@/contexts/CompanionContext";
import { useAuth } from "@/hooks/useAuth";
import { useAssistantMode, useCurrentPath } from "@/hooks/useAssistantMode";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import {
  AssistantChat,
  AssistantContextPanel,
  AssistantTextInput,
  AssistantThreadList,
  type ThreadListItem,
} from "@/components/assistant";
import type { AssistantMessage } from "@/components/canvas/CanvasAIPanel.shared";

interface ThreadRow {
  id: string;
  title: string | null;
  origin: "drawer" | "canvas";
  client_id: string | null;
  canvas_node_id: string | null;
  message_count: number;
  last_message_at: string | null;
  updated_at: string;
}

interface MsgRow {
  id: string;
  role: "user" | "assistant" | "tool";
  content: any;
  created_at: string;
}

type RightTab = "chat" | "tasks";
type TaskFilter = "todo" | "in_progress" | "done";

export default function CommandCenter() {
  const { user } = useAuth();
  const {
    companionName,
    clientId: ownClientId,
    tasks,
    loadingTasks,
    refreshTasks,
    autonomyMode,
  } = useCompanion();
  const { mode, clientId: urlClientId } = useAssistantMode();
  const path = useCurrentPath();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const en = language === "en";

  // URL clientId takes precedence; fallback to user's own primary client
  const activeClientId = urlClientId ?? ownClientId;

  // ── Thread / chat state ────────────────────────────────────────────────
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MsgRow[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  // ── Right-tab state (Chat vs Tasks) ────────────────────────────────────
  const [rightTab, setRightTab] = useState<RightTab>("chat");
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("todo");
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  // Refresh tasks each time this page is visited so completed actions clear
  useEffect(() => {
    void refreshTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Threads loader ─────────────────────────────────────────────────────
  const loadThreads = useCallback(async () => {
    if (!user) return;
    let query = supabase
      .from("assistant_threads")
      .select(
        "id, title, origin, client_id, canvas_node_id, message_count, last_message_at, updated_at",
      )
      .eq("user_id", user.id)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(50);
    if (mode === "client" && activeClientId) {
      query = query.eq("client_id", activeClientId);
    } else {
      query = query.is("client_id", null);
    }
    const { data, error } = await query;
    if (!error) setThreads((data ?? []) as ThreadRow[]);
  }, [user, mode, activeClientId]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  // ── Messages for active thread ─────────────────────────────────────────
  useEffect(() => {
    if (!activeThreadId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("assistant_messages")
        .select("id, role, content, created_at")
        .eq("thread_id", activeThreadId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (!cancelled && !error) setMessages((data ?? []) as MsgRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeThreadId]);

  // ── ThreadRow → ThreadListItem ─────────────────────────────────────────
  const threadListItems: ThreadListItem[] = useMemo(
    () =>
      threads.map((t) => ({
        id: t.id,
        name: t.title ?? "Chat",
        origin: t.origin,
        updatedAt: t.last_message_at ?? t.updated_at,
        messageCount: t.message_count,
      })),
    [threads],
  );

  const handleSelectThread = useCallback(
    (threadId: string) => {
      const thread = threads.find((t) => t.id === threadId);
      if (!thread) return;
      if (thread.origin === "canvas" && thread.client_id) {
        // Canvas-origin chat → navigate to that canvas
        navigate(
          `/clients/${thread.client_id}/scripts?view=canvas&chatId=${thread.id}`,
        );
        return;
      }
      // Drawer-origin chat → load it inline
      setActiveThreadId(threadId);
      setRightTab("chat");
    },
    [threads, navigate],
  );

  const handleNewThread = useCallback(() => {
    setActiveThreadId(null);
    setMessages([]);
    setRightTab("chat");
  }, []);

  // ── Send a message via companion-chat (dual-writes to new tables) ──────
  const handleSend = useCallback(async () => {
    if (!input.trim() || sending || !user) return;
    const text = input.trim();
    setInput("");
    setSending(true);

    const optimistic: MsgRow = {
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `tmp-${Date.now()}`,
      role: "user",
      content: { type: "text", text },
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase.functions.invoke("companion-chat", {
        body: {
          message: text,
          companion_name: companionName,
          current_path: path,
          autonomy_mode: autonomyMode,
        },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (data?.reply) {
        const assistantMsg: MsgRow = {
          id:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `tmp-${Date.now() + 1}`,
          role: "assistant",
          content: { type: "text", text: data.reply },
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      }

      if (Array.isArray(data?.actions)) {
        for (const action of data.actions) {
          if (action?.type === "navigate" && typeof action.path === "string") {
            navigate(action.path);
          }
          if (action?.type === "fill_onboarding") {
            window.dispatchEvent(
              new CustomEvent("companion:fill-onboarding", {
                detail: action.fields,
              }),
            );
          }
        }
      }

      // Refresh both the threads list and tasks (companion-chat may have
      // mutated state that affects tasks)
      await loadThreads();
      void refreshTasks();
    } finally {
      setSending(false);
    }
  }, [
    input,
    sending,
    user,
    companionName,
    path,
    autonomyMode,
    navigate,
    loadThreads,
    refreshTasks,
  ]);

  // ── MsgRow[] → AssistantMessage[] for AssistantChat ────────────────────
  const chatMessages: AssistantMessage[] = useMemo(() => {
    return messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map<AssistantMessage>((m) => {
        const c: any = m.content;
        let content = "";
        if (typeof c === "string") {
          content = c;
        } else if (c && typeof c === "object" && typeof c.text === "string") {
          content = c.text;
        } else {
          content = JSON.stringify(c ?? "");
        }
        return {
          role: m.role as "user" | "assistant",
          content,
        };
      });
  }, [messages]);

  // ── Task filtering (preserve Phase 1 priorities) ───────────────────────
  // Existing tasks shape uses priority red/amber/blue. Map onto:
  //   todo         = red + amber (urgent)
  //   in_progress  = blue (in flight)
  //   done         = (none today — task system v2)
  const visibleTasks = useMemo(
    () => tasks.filter((t) => !dismissedIds.has(t.id)),
    [tasks, dismissedIds],
  );

  const filteredTasks = useMemo(() => {
    if (taskFilter === "todo") {
      return visibleTasks.filter(
        (t) => t.priority === "red" || t.priority === "amber",
      );
    }
    if (taskFilter === "in_progress") {
      return visibleTasks.filter((t) => t.priority === "blue");
    }
    return [];
  }, [visibleTasks, taskFilter]);

  const todoCount = visibleTasks.filter(
    (t) => t.priority === "red" || t.priority === "amber",
  ).length;
  const inProgressCount = visibleTasks.filter(
    (t) => t.priority === "blue",
  ).length;

  // Dot color shared with Phase 1
  const dotColor: Record<string, string> = {
    red: "#ef4444",
    amber: "#f59e0b",
    blue: "#22d3ee",
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 flex flex-col bg-[#0a0f1c] text-white">
      {/* Header — mirrors FullscreenAIView: just back button + centered title */}
      <header className="grid grid-cols-[auto_1fr_auto] items-center px-4 py-2.5 border-b border-white/5">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-xs text-white/45 hover:text-white/80 transition-colors w-fit"
        >
          <ArrowLeft className="w-3 h-3" />
          {en ? "Back" : "Atrás"}
        </button>
        <div className="text-center text-xs font-semibold truncate" style={{ color: "#e0e0e0" }}>
          {companionName}
        </div>
        {/* Right slot: tasks toggle (kept tucked, neutral) */}
        <button
          onClick={() => setRightTab(rightTab === "tasks" ? "chat" : "tasks")}
          className={`flex items-center gap-1 text-xs transition-colors px-2 py-1 rounded justify-self-end ${
            rightTab === "tasks"
              ? "bg-white/[0.08] text-white border border-white/15"
              : "text-white/45 hover:text-white/80 border border-transparent"
          }`}
          title={en ? "Tasks" : "Tareas"}
        >
          <ListChecks className="w-3 h-3" />
          {todoCount > 0 && (
            <span className="px-1 rounded bg-red-500 text-white text-[9px] font-bold">
              {todoCount}
            </span>
          )}
        </button>
      </header>

      {/* Main 3-column layout (chat tab) OR full-width tasks (tasks tab) */}
      <div className="flex-1 flex min-h-0">
        {rightTab === "chat" ? (
          <>
            {/* CHATS sidebar */}
            <aside className="w-[260px] bg-[#0c1424] border-r border-white/[0.04] flex flex-col">
              <AssistantThreadList
                threads={threadListItems}
                activeThreadId={activeThreadId}
                onSelect={handleSelectThread}
                onCreate={handleNewThread}
                groupByDate
                variant="full"
                className="flex-1 min-h-0"
              />
            </aside>

            {/* Chat column */}
            <main className="flex-1 flex flex-col min-w-0 min-h-0">
              <div className="flex-1 min-h-0 overflow-hidden">
                <AssistantChat
                  messages={chatMessages}
                  loading={sending}
                  variant="full"
                  greeting={
                    en
                      ? `What are we doing today?`
                      : `¿Qué hacemos hoy?`
                  }
                  greetingSubtitle={
                    en
                      ? "Ask anything about your pipeline, scripts, or clients."
                      : "Pregunta lo que sea sobre tu pipeline, scripts o clientes."
                  }
                />
              </div>
              <div className="border-t border-white/[0.05]">
                <AssistantTextInput
                  value={input}
                  onChange={setInput}
                  onSend={handleSend}
                  loading={sending}
                  variant="full"
                  placeholder={
                    en
                      ? "Ask anything..."
                      : "Pregunta lo que sea..."
                  }
                />
              </div>
            </main>

            {/* AI SEES (off-canvas: empty state) */}
            <aside className="w-[260px] bg-[#0c1424] border-l border-white/[0.04] flex flex-col">
              <AssistantContextPanel
                nodes={[]}
                emptyMessage={
                  en
                    ? "Open a canvas to see connected nodes feeding the AI."
                    : "Abre un canvas para ver los nodos conectados al AI."
                }
                className="flex-1 min-h-0"
              />
            </aside>
          </>
        ) : (
          /* Tasks tab — full-width Phase 1 task list */
          <div className="flex-1 overflow-auto p-6">
            {/* Task subtab filter */}
            <div className="flex gap-2 mb-4 max-w-3xl mx-auto">
              {(
                [
                  {
                    key: "todo" as TaskFilter,
                    label: en ? "To Do" : "Pendiente",
                    icon: Clock,
                    count: todoCount,
                  },
                  {
                    key: "in_progress" as TaskFilter,
                    label: en ? "In Progress" : "En curso",
                    icon: ListChecks,
                    count: inProgressCount,
                  },
                  {
                    key: "done" as TaskFilter,
                    label: en ? "Done" : "Completado",
                    icon: CheckCircle2,
                    count: 0,
                  },
                ]
              ).map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTaskFilter(t.key)}
                  className={`px-3 py-1.5 rounded text-xs flex items-center gap-1.5 transition-colors ${
                    taskFilter === t.key
                      ? "bg-white/[0.08] text-white border border-white/15"
                      : "bg-transparent text-white/45 border border-transparent hover:text-white/70"
                  }`}
                >
                  <t.icon className="w-3 h-3" />
                  {t.label}
                  {t.count > 0 && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-300">
                      {t.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Task cards (preserve Phase 1 styling + actions) */}
            <div className="max-w-3xl mx-auto space-y-2">
              {loadingTasks && taskFilter === "todo" && (
                <div className="py-10 text-center text-sm text-white/40">
                  {en
                    ? `${companionName} is checking your pipeline...`
                    : `${companionName} está revisando tu pipeline...`}
                </div>
              )}
              {!loadingTasks && filteredTasks.length === 0 && (
                <div className="py-12 text-center text-sm text-white/40">
                  {taskFilter === "done"
                    ? en
                      ? "Completed tasks will appear here."
                      : "Las tareas completadas aparecerán aquí."
                    : taskFilter === "in_progress"
                      ? en
                        ? "Nothing in progress right now."
                        : "Nada en curso ahora mismo."
                      : en
                        ? `You're all caught up! ${companionName} will let you know when something needs attention.`
                        : `¡Estás al día! ${companionName} te avisará cuando algo necesite atención.`}
                </div>
              )}
              {filteredTasks.map((task) => (
                <div
                  key={task.id}
                  className="rounded-xl p-3.5 flex items-start gap-3"
                  style={{
                    background:
                      task.priority === "red"
                        ? "rgba(239,68,68,0.04)"
                        : task.priority === "amber"
                          ? "rgba(245,158,11,0.04)"
                          : "rgba(255,255,255,0.03)",
                    border: `1px solid ${
                      task.priority === "red"
                        ? "rgba(239,68,68,0.2)"
                        : task.priority === "amber"
                          ? "rgba(245,158,11,0.18)"
                          : "rgba(255,255,255,0.08)"
                    }`,
                  }}
                >
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
                    style={{ background: dotColor[task.priority] }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-white leading-tight">
                      {en ? task.titleEn : task.titleEs}
                    </p>
                    <p className="text-[11px] text-white/40 mt-1 leading-relaxed">
                      {en ? task.subtitleEn : task.subtitleEs}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                    <button
                      onClick={() => navigate(task.actionPath)}
                      className="text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80"
                      style={{
                        background: "rgba(255,255,255,0.08)",
                        color: "#e0e0e0",
                        border: "1px solid rgba(255,255,255,0.15)",
                      }}
                    >
                      {en ? task.actionLabelEn : task.actionLabelEs}
                    </button>
                    <button
                      onClick={() =>
                        setDismissedIds(
                          (prev) => new Set([...prev, task.id]),
                        )
                      }
                      className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-opacity hover:opacity-80"
                      style={{
                        background: "rgba(255,255,255,0.04)",
                        color: "rgba(255,255,255,0.35)",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      {en ? task.skipLabelEn : task.skipLabelEs}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
