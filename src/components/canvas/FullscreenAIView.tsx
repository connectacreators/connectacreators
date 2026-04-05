import { useState, useEffect, useCallback, useMemo, useRef, memo } from "react";
import { Node } from "@xyflow/react";
import { ChevronLeft, Pencil, Trash2 } from "lucide-react";
import CanvasAIPanel from "./CanvasAIPanel";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// ── Constants ──────────────────────────────────────────────────────────────

const FULLSCREEN_AI_NODE_ID = "ai-assistant";
const MAX_MESSAGES = 30;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

// ── Types ──────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  type?: "text" | "image" | "script_preview";
  image_b64?: string;
  revised_prompt?: string;
  credits_used?: number;
  script_data?: any;
}

interface ChatSession {
  id: string;
  name: string;
  messages: ChatMessage[];
  updated_at: string;
}

export interface FullscreenAIViewProps {
  nodes: Node[];
  selectedClient: { id: string; name?: string; target?: string };
  activeSessionId?: string | null;
  authToken: string | null;
  format: string;
  language: "en" | "es";
  aiModel: string;
  canvasContextRef: React.RefObject<any>;
  initialDraftInput?: string | null;
  onClose: () => void;
  onFormatChange: (f: string) => void;
  onLanguageChange: (l: "en" | "es") => void;
  onModelChange: (m: string) => void;
  onSaveScript: (script: any) => Promise<void>;
}

// ── Node type config ───────────────────────────────────────────────────────

const NODE_TYPE_COLOR: Record<string, string> = {
  videoNode: "#f97316",
  textNoteNode: "#a78bfa",
  researchNoteNode: "#34d399",
  hookGeneratorNode: "#facc15",
  brandGuideNode: "#f472b6",
  ctaBuilderNode: "#fb923c",
  instagramProfileNode: "#818cf8",
  competitorProfileNode: "#818cf8",
  mediaNode: "#22d3ee",
  onboardingFormNode: "#22d3ee",
};

const NODE_TYPE_LABEL: Record<string, string> = {
  videoNode: "Video",
  textNoteNode: "Text Note",
  researchNoteNode: "Research Note",
  hookGeneratorNode: "Hook Generator",
  brandGuideNode: "Brand Guide",
  ctaBuilderNode: "CTA Builder",
  instagramProfileNode: "Instagram Profile",
  competitorProfileNode: "Competitor Profile",
  mediaNode: "Media",
  onboardingFormNode: "Onboarding Form",
};

const EXCLUDED_NODE_TYPES = new Set([
  "aiAssistantNode",
  "groupNode",
  "annotationNode",
]);

// ── Helpers ────────────────────────────────────────────────────────────────

/** Strip base64 image data before persisting to DB/localStorage to avoid size limits */
function stripImagesForPersistence(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) => {
    const stripped: any = { ...m };
    if (m.type === "image" && m.image_b64) {
      stripped.image_b64 = undefined;
      stripped.content = m.revised_prompt || "[Generated image]";
    }
    if ((m as any)._imagePreview) stripped._imagePreview = undefined;
    return stripped;
  });
}

function relativeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function groupChatsByDate(chats: ChatSession[]): Array<{ label: string; chats: ChatSession[] }> {
  const map = new Map<string, ChatSession[]>();
  for (const chat of chats) {
    const label = relativeDate(chat.updated_at);
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(chat);
  }
  return Array.from(map.entries()).map(([label, chats]) => ({ label, chats }));
}

// ── Component ──────────────────────────────────────────────────────────────

const FullscreenAIView = memo(function FullscreenAIView({
  nodes,
  selectedClient,
  activeSessionId,
  authToken,
  format,
  language,
  aiModel,
  canvasContextRef,
  initialDraftInput,
  onClose,
  onFormatChange,
  onLanguageChange,
  onModelChange,
  onSaveScript,
}: FullscreenAIViewProps) {
  const { user } = useAuth();

  // Each canvas session gets its own AI chat history
  const chatNodeId = activeSessionId || FULLSCREEN_AI_NODE_ID;

  // Chat state
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeMessages, setActiveMessages] = useState<ChatMessage[]>([]);
  const [chatsLoaded, setChatsLoaded] = useState(false);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingChatName, setEditingChatName] = useState("");

  // Right panel collapsed state
  const [contextPanelCollapsed, setContextPanelCollapsed] = useState(false);

  // Refs for unmount flush
  const activeChatIdRef = useRef<string | null>(null);
  const activeMessagesRef = useRef<ChatMessage[]>([]);
  const sessionTokenRef = useRef<string | null>(null);

  // Keep refs in sync
  useEffect(() => { activeChatIdRef.current = activeChatId; }, [activeChatId]);
  useEffect(() => { activeMessagesRef.current = activeMessages; }, [activeMessages]);

  // Track session token for beacon saves
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      sessionTokenRef.current = session?.access_token ?? null;
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      sessionTokenRef.current = session?.access_token ?? null;
    });
    return () => subscription.unsubscribe();
  }, []);

  // Load chats on mount
  useEffect(() => {
    if (!user || !selectedClient.id) {
      setChatsLoaded(true);
      return;
    }
    setChatsLoaded(false);
    (async () => {
      try {
        const { data: rows } = await supabase
          .from("canvas_ai_chats")
          .select("id, name, updated_at")
          .eq("user_id", user.id)
          .eq("client_id", selectedClient.id)
          .eq("node_id", chatNodeId)
          .order("updated_at", { ascending: false });

        if (rows && rows.length > 0) {
          setChats(rows.map((r) => ({ ...r, messages: [] })) as ChatSession[]);
          const activeRow = rows[0];
          setActiveChatId(activeRow.id);

          // Load messages for active chat
          const { data: activeData } = await supabase
            .from("canvas_ai_chats")
            .select("messages")
            .eq("id", activeRow.id)
            .single();
          let restoredMsgs: ChatMessage[] = (activeData?.messages as any) || [];

          // Check localStorage fallback
          try {
            const lsRaw = localStorage.getItem(`cc_chat_${activeRow.id}`);
            if (lsRaw) {
              const lsMsgs = JSON.parse(lsRaw);
              if (Array.isArray(lsMsgs) && lsMsgs.length > restoredMsgs.length) {
                restoredMsgs = lsMsgs;
              }
            }
          } catch { /* ignore */ }

          setActiveMessages(
            restoredMsgs.length > MAX_MESSAGES ? restoredMsgs.slice(-MAX_MESSAGES) : restoredMsgs
          );
        } else {
          // No chats — create first one
          const { data: newRow, error: insertErr } = await supabase
            .from("canvas_ai_chats")
            .insert({
              user_id: user.id,
              client_id: selectedClient.id,
              node_id: chatNodeId,
              name: "Chat 1",
              messages: [],
            })
            .select("id, name, messages, updated_at")
            .single();
          if (insertErr) console.error("[fullscreen_ai] insert failed:", insertErr);
          if (newRow) {
            setChats([newRow as ChatSession]);
            setActiveChatId(newRow.id);
            setActiveMessages([]);
          }
        }
      } catch (err) {
        console.error("[fullscreen_ai] load error:", err);
      } finally {
        setChatsLoaded(true);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, selectedClient.id, chatNodeId]);

  // Refresh just the chat list metadata (sidebar) without touching active messages
  const refreshChatList = useCallback(async () => {
    if (!user || !selectedClient.id) return;
    const { data: rows } = await supabase
      .from("canvas_ai_chats")
      .select("id, name, updated_at")
      .eq("user_id", user.id)
      .eq("client_id", selectedClient.id)
      .eq("node_id", chatNodeId)
      .order("updated_at", { ascending: false });
    if (rows) {
      setChats(prev => rows.map(r => ({
        ...r,
        messages: prev.find(c => c.id === r.id)?.messages || [],
      })) as ChatSession[]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, selectedClient.id, chatNodeId]);

  // Listen for cross-view chat changes (canvas node ↔ fullscreen live sync)
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent;
      if (ce.detail?.clientId === selectedClient.id && ce.detail?.nodeId === chatNodeId) {
        refreshChatList();
      }
    };
    window.addEventListener("canvas-ai-chat-changed", handler);
    return () => window.removeEventListener("canvas-ai-chat-changed", handler);
  }, [selectedClient.id, chatNodeId, refreshChatList]);

  // Persist messages
  const persistMessages = useCallback(async (chatId: string, msgs: ChatMessage[]) => {
    const safeMsgs = stripImagesForPersistence(msgs);
    const firstUserMsg = safeMsgs.find((m) => m.role === "user");
    const autoName = firstUserMsg
      ? firstUserMsg.content.slice(0, 40) + (firstUserMsg.content.length > 40 ? "..." : "")
      : undefined;

    const updateData: any = { messages: safeMsgs, updated_at: new Date().toISOString() };
    if (autoName) updateData.name = autoName;

    const { error } = await supabase.from("canvas_ai_chats").update(updateData).eq("id", chatId);
    if (error) console.error("[fullscreen_ai] update failed:", error);

    setChats((prev) =>
      prev.map((c) =>
        c.id === chatId
          ? { ...c, messages: msgs, updated_at: updateData.updated_at, ...(autoName ? { name: autoName } : {}) }
          : c
      )
    );
  }, []);

  // Beacon save on unmount
  useEffect(() => {
    return () => {
      const chatId = activeChatIdRef.current;
      const msgs = activeMessagesRef.current;
      if (!chatId || msgs.length === 0) return;
      const firstUserMsg = msgs.find((m) => m.role === "user");
      const autoName = firstUserMsg
        ? firstUserMsg.content.slice(0, 40) + (firstUserMsg.content.length > 40 ? "..." : "")
        : undefined;
      const safeMsgs = stripImagesForPersistence(msgs);
      const updateData: any = { messages: safeMsgs, updated_at: new Date().toISOString() };
      if (autoName) updateData.name = autoName;
      const token = sessionTokenRef.current || SUPABASE_ANON_KEY;
      try {
        fetch(`${SUPABASE_URL}/rest/v1/canvas_ai_chats?id=eq.${chatId}`, {
          method: "PATCH",
          keepalive: true,
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token}`,
            Prefer: "return=minimal",
          },
          body: JSON.stringify(updateData),
        });
      } catch { /* best effort */ }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Create new chat
  const createChat = useCallback(async () => {
    if (!user || !selectedClient.id) return;
    const { data: row, error } = await supabase
      .from("canvas_ai_chats")
      .insert({
        user_id: user.id,
        client_id: selectedClient.id,
        node_id: chatNodeId,
        name: `Chat ${chats.length + 1}`,
        messages: [],
      })
      .select("id, name, messages, updated_at")
      .single();
    if (row && !error) {
      setChats((prev) => [row as ChatSession, ...prev]);
      setActiveChatId(row.id);
      setActiveMessages([]);
      window.dispatchEvent(new CustomEvent("canvas-ai-chat-changed", { detail: { clientId: selectedClient.id, nodeId: chatNodeId } }));
    }
  }, [user, selectedClient.id, chats.length, chatNodeId]);

  // Delete a chat
  const deleteChat = useCallback(async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await supabase.from("canvas_ai_chats").delete().eq("id", chatId);
    try { localStorage.removeItem(`cc_chat_${chatId}`); } catch { /* ignore */ }
    setChats((prev) => prev.filter((c) => c.id !== chatId));
    if (activeChatId === chatId) {
      const remaining = chats.filter((c) => c.id !== chatId);
      setActiveChatId(remaining.length > 0 ? remaining[0].id : null);
      setActiveMessages([]);
    }
    window.dispatchEvent(new CustomEvent("canvas-ai-chat-changed", { detail: { clientId: selectedClient.id, nodeId: chatNodeId } }));
  }, [activeChatId, chats, selectedClient.id, chatNodeId]);

  // Rename handlers
  const startRename = useCallback((chat: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingChatId(chat.id);
    setEditingChatName(chat.name);
  }, []);

  const commitRename = useCallback(async (chatId: string) => {
    const trimmed = editingChatName.trim();
    if (trimmed) {
      await supabase.from("canvas_ai_chats").update({ name: trimmed }).eq("id", chatId);
      setChats((prev) => prev.map((c) => c.id === chatId ? { ...c, name: trimmed } : c));
      window.dispatchEvent(new CustomEvent("canvas-ai-chat-changed", { detail: { clientId: selectedClient.id, nodeId: chatNodeId } }));
    }
    setEditingChatId(null);
  }, [editingChatName, selectedClient.id, chatNodeId]);

  // Switch chat — lazy-load messages
  const switchChat = useCallback(
    async (chat: ChatSession) => {
      if (activeChatId && activeMessages.length > 0) {
        persistMessages(activeChatId, activeMessages);
      }
      setActiveChatId(chat.id);
      setActiveMessages([]);

      const { data: chatData } = await supabase
        .from("canvas_ai_chats")
        .select("messages")
        .eq("id", chat.id)
        .single();
      let msgs: ChatMessage[] = (chatData?.messages as any) || [];
      try {
        const lsRaw = localStorage.getItem(`cc_chat_${chat.id}`);
        if (lsRaw) {
          const lsMsgs = JSON.parse(lsRaw);
          if (Array.isArray(lsMsgs) && lsMsgs.length > msgs.length) msgs = lsMsgs;
        }
      } catch { /* ignore */ }
      setActiveMessages(msgs.length > MAX_MESSAGES ? msgs.slice(-MAX_MESSAGES) : msgs);
    },
    [activeChatId, activeMessages, persistMessages]
  );

  // Messages change handler
  const handleMessagesChange = useCallback(
    (msgs: ChatMessage[]) => {
      const capped = msgs.length > MAX_MESSAGES ? msgs.slice(-MAX_MESSAGES) : msgs;
      activeMessagesRef.current = capped;
      setActiveMessages(capped);
      if (activeChatId) {
        try {
          localStorage.setItem(
            `cc_chat_${activeChatId}`,
            JSON.stringify(stripImagesForPersistence(capped).slice(-MAX_MESSAGES))
          );
        } catch { /* ignore */ }
        persistMessages(activeChatId, capped);
      }
    },
    [activeChatId, persistMessages]
  );

  // Handle script generation (no separate output panel — stays in CanvasAIPanel)
  const handleGenerateScript = useCallback((_script: any) => {
    // No-op: CanvasAIPanel shows inline script preview in chat
  }, []);

  // Filtered nodes for context panel
  const contextNodes = useMemo(() => {
    return nodes.filter((n) => {
      if (EXCLUDED_NODE_TYPES.has(n.type as string)) return false;
      if (n.id === "ai-assistant") return false;
      return true;
    });
  }, [nodes]);

  // Grouped chats for sidebar
  const groupedChats = useMemo(() => groupChatsByDate(chats), [chats]);

  // Canvas context — read from ref at render time
  const canvasContext = canvasContextRef.current ?? {
    transcriptions: [],
    structures: [],
    text_notes: "",
    research_facts: [],
    primary_topic: "",
  };

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        flexDirection: "column",
        background: "#131417",
        fontFamily: "inherit",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          height: 44,
          flexShrink: 0,
          background: "#1a1b1f",
          borderBottom: "1px solid #2a2b30",
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          gap: 12,
        }}
      >
        {/* Back button */}
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "rgba(255,255,255,0.45)",
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "4px 8px",
            borderRadius: 6,
            transition: "color 0.15s, background 0.15s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.75)";
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.45)";
            (e.currentTarget as HTMLButtonElement).style.background = "none";
          }}
        >
          <ChevronLeft style={{ width: 16, height: 16 }} />
          Canvas
        </button>

        {/* Center: client name */}
        <div style={{ flex: 1, textAlign: "center" }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "rgba(255,255,255,0.85)",
              letterSpacing: 0.1,
            }}
          >
            {selectedClient.name || "Client"}
          </span>
        </div>

        {/* Right spacer — matches back button width for centering */}
        <div style={{ width: 80 }} />
      </div>

      {/* Body: sidebar + chat + context panel */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Left — Conversation sidebar (200px) */}
        <div
          style={{
            width: 200,
            flexShrink: 0,
            background: "#111214",
            borderRight: "1px solid #2a2b30",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Sidebar header */}
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
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.35)",
              }}
            >
              Chats
            </span>
            <button
              onClick={createChat}
              style={{
                background: "none",
                border: "1px solid #22d3ee",
                borderRadius: 5,
                color: "#22d3ee",
                fontSize: 11,
                cursor: "pointer",
                padding: "2px 8px",
                lineHeight: 1.5,
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.background = "rgba(34,211,238,0.1)")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.background = "none")
              }
            >
              + New
            </button>
          </div>

          {/* Chat list */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "6px 0",
            }}
            className="custom-scrollbar"
          >
            {groupedChats.map(({ label, chats: group }) => (
              <div key={label}>
                {/* Date section header */}
                <div
                  style={{
                    padding: "8px 12px 3px",
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    color: "rgba(255,255,255,0.22)",
                    textTransform: "uppercase",
                  }}
                >
                  {label}
                </div>
                {group.map((chat) => {
                  const isActive = activeChatId === chat.id;
                  const isEditing = editingChatId === chat.id;
                  return (
                    <div
                      key={chat.id}
                      onClick={() => !isEditing && switchChat(chat)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        background: isActive ? "rgba(34,211,238,0.08)" : "none",
                        borderLeft: isActive ? "2px solid #22d3ee" : "2px solid transparent",
                        cursor: "pointer",
                        padding: "6px 10px 6px 10px",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        transition: "background 0.12s",
                        position: "relative",
                      }}
                      className="chat-item-row"
                      onMouseEnter={(e) => {
                        if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.04)";
                        const actions = (e.currentTarget as HTMLDivElement).querySelector(".chat-actions") as HTMLElement | null;
                        if (actions) actions.style.opacity = "1";
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "none";
                        const actions = (e.currentTarget as HTMLDivElement).querySelector(".chat-actions") as HTMLElement | null;
                        if (actions) actions.style.opacity = "0";
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {isEditing ? (
                          <input
                            autoFocus
                            value={editingChatName}
                            onChange={(e) => setEditingChatName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitRename(chat.id);
                              if (e.key === "Escape") setEditingChatId(null);
                            }}
                            onBlur={() => commitRename(chat.id)}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              width: "100%",
                              background: "rgba(34,211,238,0.08)",
                              border: "1px solid rgba(34,211,238,0.4)",
                              borderRadius: 4,
                              padding: "1px 5px",
                              fontSize: 11,
                              color: "#e8e8e8",
                              outline: "none",
                            }}
                          />
                        ) : (
                          <span style={{
                            fontSize: 11,
                            color: isActive ? "#22d3ee" : "rgba(255,255,255,0.65)",
                            fontWeight: isActive ? 600 : 400,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            display: "block",
                          }}>
                            {chat.name}
                          </span>
                        )}
                        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>
                          {relativeDate(chat.updated_at)}
                        </span>
                      </div>
                      {/* Action buttons — visible on hover */}
                      <div
                        className="chat-actions"
                        style={{ display: "flex", gap: 3, opacity: 0, transition: "opacity 0.12s", flexShrink: 0 }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={(e) => startRename(chat, e)}
                          title="Rename"
                          style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "rgba(255,255,255,0.4)", lineHeight: 1 }}
                          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#22d3ee")}
                          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.4)")}
                        >
                          <Pencil style={{ width: 11, height: 11 }} />
                        </button>
                        <button
                          onClick={(e) => deleteChat(chat.id, e)}
                          title="Delete"
                          style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "rgba(255,255,255,0.4)", lineHeight: 1 }}
                          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#f87171")}
                          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.4)")}
                        >
                          <Trash2 style={{ width: 11, height: 11 }} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}

            {chats.length === 0 && chatsLoaded && (
              <div
                style={{
                  padding: "20px 12px",
                  fontSize: 11,
                  color: "rgba(255,255,255,0.25)",
                  textAlign: "center",
                }}
              >
                No chats yet
              </div>
            )}
          </div>
        </div>

        {/* Center — Chat area */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            minWidth: 0,
          }}
        >
          {!chatsLoaded ? (
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "rgba(255,255,255,0.3)",
                fontSize: 13,
              }}
            >
              Loading...
            </div>
          ) : (
            <CanvasAIPanel
              key={activeChatId ?? "no-chat"}
              canvasContext={canvasContext}
              canvasContextRef={canvasContextRef}
              clientInfo={{ name: selectedClient.name, target: selectedClient.target }}
              onGenerateScript={handleGenerateScript}
              authToken={authToken}
              format={format}
              language={language}
              aiModel={aiModel || "claude-haiku-4-5"}
              onFormatChange={onFormatChange}
              onLanguageChange={onLanguageChange}
              onModelChange={onModelChange}
              initialMessages={activeMessages}
              onMessagesChange={handleMessagesChange}
              onSaveScript={onSaveScript}
              initialInput={initialDraftInput}
              onInitialInputConsumed={() => { (window as any).__canvasAIDraftInput = null; }}
            />
          )}
        </div>

        {/* Right — AI sees context panel */}
        <div
          style={{
            width: contextPanelCollapsed ? 32 : 180,
            flexShrink: 0,
            background: "#111214",
            borderLeft: "1px solid #2a2b30",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            transition: "width 0.25s ease",
          }}
        >
          {contextPanelCollapsed ? (
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
                onClick={() => setContextPanelCollapsed(false)}
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
                    {contextNodes.length}
                  </span>
                </div>
                <button
                  onClick={() => setContextPanelCollapsed(true)}
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
                {contextNodes.length === 0 ? (
                  <div
                    style={{
                      padding: "12px",
                      fontSize: 11,
                      color: "rgba(255,255,255,0.25)",
                      textAlign: "center",
                      lineHeight: 1.5,
                    }}
                  >
                    No nodes on canvas yet
                  </div>
                ) : (
                  contextNodes.map((node) => {
                    const type = node.type as string;
                    const d = node.data as any;
                    const color = NODE_TYPE_COLOR[type] || "#888";
                    const typeLabel = NODE_TYPE_LABEL[type] || type;
                    const displayName = d?.videoLabel || d?.videoTitle
                      || (d?.channel_username ? `@${d.channel_username}` : null)
                      || d?.topic || d?.fileName || d?.label || typeLabel;

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
                            {displayName}
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
      </div>

      {/* Custom scrollbar styles */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: transparent;
          border: 1px solid #22d3ee;
          border-radius: 99px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(34,211,238,0.1);
        }
      `}</style>
    </div>
  );
});

export default FullscreenAIView;
