// src/components/CompanionDrawer.tsx
//
// Right-side companion drawer (~380px wide). Replaces the old compact panel
// rendered by CompanionBubble. Phase B.2 of the companion ↔ canvas AI merge.
//
// Architecture:
//  - Reads the active companion + autonomy mode from CompanionContext
//  - Reads the active client/agency mode from useAssistantMode() (URL-derived)
//  - Loads thread metadata + messages from the new `assistant_threads` /
//    `assistant_messages` tables (Phase A foundation; companion-chat already
//    dual-writes into them).
//  - Sends user messages through the existing `companion-chat` edge function.
//
// Tabs (left rail): ≡ Threads · 💬 Chat · 👁 AI Sees (placeholder).
// Header: avatar + companion name + mode pill + ⛶ (open /ai) + × (close).

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bot, Eye, List, Maximize2, MessageSquare, X } from "lucide-react";
import { useCompanion } from "@/contexts/CompanionContext";
import { useAssistantMode, useCurrentPath } from "@/hooks/useAssistantMode";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  AssistantChat,
  AssistantTextInput,
  AssistantThreadList,
  type ThreadListItem,
} from "@/components/assistant";
import type { AssistantMessage } from "@/components/canvas/CanvasAIPanel.shared";

type DrawerTab = "threads" | "chat" | "context";

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

export default function CompanionDrawer() {
  const {
    companionName,
    clientId: ownClientId,
    autonomyMode,
    setIsOpen,
  } = useCompanion();
  const { user } = useAuth();
  const { mode, clientId: urlClientId } = useAssistantMode();
  const path = useCurrentPath();
  const navigate = useNavigate();

  // URL clientId takes precedence; fallback to user's own primary client.
  const activeClientId = urlClientId ?? ownClientId;

  const [tab, setTab] = useState<DrawerTab>("chat");
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MsgRow[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  // ── Threads loader ──────────────────────────────────────────────────────
  const loadThreads = useCallback(async () => {
    if (!user) return;
    let query = supabase
      .from("assistant_threads")
      .select(
        "id, title, origin, client_id, canvas_node_id, message_count, last_message_at, updated_at",
      )
      .eq("user_id", user.id)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(20);
    if (mode === "client" && activeClientId) {
      query = query.eq("client_id", activeClientId);
    } else {
      // Agency mode: drawer-origin threads not tied to a specific client
      query = query.is("client_id", null);
    }
    const { data, error } = await query;
    if (!error) setThreads((data ?? []) as ThreadRow[]);
  }, [user, mode, activeClientId]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  // ── Messages for active thread ──────────────────────────────────────────
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
        .limit(100);
      if (!cancelled && !error) setMessages((data ?? []) as MsgRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeThreadId]);

  // ── Map ThreadRow → ThreadListItem ──────────────────────────────────────
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
        // Canvas-origin chat → navigate to that canvas + close the drawer.
        navigate(
          `/clients/${thread.client_id}/scripts?view=canvas&chatId=${thread.id}`,
        );
        setIsOpen(false);
        return;
      }
      // Drawer-origin chat → load it inline.
      setActiveThreadId(threadId);
      setTab("chat");
    },
    [threads, navigate, setIsOpen],
  );

  const handleNewThread = useCallback(() => {
    setActiveThreadId(null);
    setMessages([]);
    setTab("chat");
  }, []);

  // ── Send a message via companion-chat (dual-writes to new tables) ───────
  const handleSend = useCallback(async () => {
    if (!input.trim() || sending || !user) return;
    const text = input.trim();
    setInput("");
    setSending(true);

    // Optimistic user-message append
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

      // Execute any actions returned by the AI (preserve old bubble behavior)
      if (Array.isArray(data?.actions)) {
        for (const action of data.actions) {
          if (action?.type === "navigate" && typeof action.path === "string") {
            navigate(action.path);
            setIsOpen(false);
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

      // Refresh threads list (companion-chat dual-write created/updated one).
      await loadThreads();
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
    setIsOpen,
    loadThreads,
  ]);

  // ── Convert MsgRow[] → AssistantMessage[] for AssistantChat ─────────────
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

  return (
    <aside
      className="fixed top-0 right-0 z-50 h-screen w-[380px] flex glass-card border-l border-l-white/8 rounded-none"
      style={{ boxShadow: "-10px 0 30px rgba(0,0,0,0.5)" }}
    >
      {/* Tabs strip */}
      <nav className="w-10 border-r border-white/[0.04] flex flex-col items-center pt-4 gap-2" style={{ background: "rgba(255,255,255,0.02)" }}>
        <TabBtn
          icon={List}
          active={tab === "threads"}
          onClick={() => setTab("threads")}
          title="Chats"
        />
        <TabBtn
          icon={MessageSquare}
          active={tab === "chat"}
          onClick={() => setTab("chat")}
          title="Chat"
        />
        <TabBtn
          icon={Eye}
          active={tab === "context"}
          onClick={() => setTab("context")}
          title="AI sees"
        />
      </nav>

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header — matches CanvasAIPanel header (subtle, single-line) */}
        <header
          className="flex items-center justify-between px-3 py-2.5 flex-shrink-0"
          style={{ background: "transparent", borderBottom: "1px solid rgba(255,255,255,0.07)" }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Bot className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#e0e0e0" }} />
            <span className="text-xs font-semibold truncate" style={{ color: "#e0e0e0" }}>
              {companionName}
            </span>
            <span className="text-[9px] truncate" style={{ color: "rgba(255,255,255,0.3)" }}>
              {mode === "agency" ? "Agency mode" : `· working on this client`}
            </span>
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button
              onClick={() => {
                navigate("/ai");
                setIsOpen(false);
              }}
              className="p-0.5 rounded hover:bg-white/5 transition-colors"
              title="Open full view"
              style={{ color: "rgba(255,255,255,0.4)" }}
            >
              <Maximize2 className="w-3 h-3" />
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="p-0.5 rounded hover:bg-red-500/20 transition-colors"
              title="Close"
              style={{ color: "rgba(255,255,255,0.4)" }}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </header>

        {/* Tab content */}
        <div className="flex-1 min-h-0 flex flex-col">
          {tab === "threads" && (
            <AssistantThreadList
              threads={threadListItems}
              activeThreadId={activeThreadId}
              onSelect={handleSelectThread}
              onCreate={handleNewThread}
              groupByDate
              variant="compact"
              className="flex-1 min-h-0"
            />
          )}

          {tab === "chat" && (
            <>
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                <AssistantChat
                  messages={chatMessages}
                  loading={sending}
                  variant="compact"
                  greeting={`Hi, I'm ${companionName}.`}
                  greetingSubtitle="Ask me anything about your work."
                />
              </div>
              <div className="p-2 border-t border-white/[0.04]">
                <AssistantTextInput
                  value={input}
                  onChange={setInput}
                  onSend={handleSend}
                  loading={sending}
                  variant="compact"
                  placeholder={`Ask ${companionName}...`}
                />
              </div>
            </>
          )}

          {tab === "context" && (
            <div className="flex-1 flex items-center justify-center p-6 text-center text-xs text-white/40">
              {mode === "agency"
                ? "AI Sees is empty in agency mode. Open a canvas to see connected nodes feeding the AI."
                : "Open a canvas to see the connected nodes feeding the AI."}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

function TabBtn({
  icon: Icon,
  active,
  onClick,
  title,
}: {
  icon: any;
  active: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={
        "w-7 h-7 rounded flex items-center justify-center transition-colors " +
        (active
          ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
          : "bg-white/[0.04] text-white/40 border border-transparent hover:text-white/70")
      }
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  );
}

