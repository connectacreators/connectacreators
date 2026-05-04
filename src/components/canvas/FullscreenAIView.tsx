import { useState, useEffect, useCallback, useMemo, useRef, memo } from "react";
import { Node } from "@xyflow/react";
import { ChevronLeft } from "lucide-react";
import CanvasAIPanel from "./CanvasAIPanel";
import ScriptOutputPanel from "./ScriptOutputPanel";
import { AssistantContextPanel, AssistantThreadList } from "@/components/assistant";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRealtimeChatSync } from "@/hooks/useRealtimeChatSync";

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

  const [generatedScript, setGeneratedScript] = useState<any>(null);

  // Right panel collapsed state
  const [contextPanelCollapsed, setContextPanelCollapsed] = useState(false);

  // ─── Live chat sync (broadcast-based) ───
  const isRemoteUpdateRef = useRef(false);
  // Streaming content from a remote collaborator (live typewriter from another user/tab).
  const [remoteStreamingContent, setRemoteStreamingContent] = useState<string | null>(null);
  // Forward decl for activeChatIdRef (assigned below) so onRemoteActiveChat can read it
  const activeChatIdRefForRoom = useRef<string | null>(null);
  const aiRoomId = (selectedClient.id && chatNodeId) ? `${selectedClient.id}:${chatNodeId}` : null;
  const { broadcastMessages, broadcastStreaming, broadcastActiveChat } = useRealtimeChatSync({
    chatId: activeChatId,
    onRemoteMessages: useCallback((messages) => {
      // Another tab sent updated messages — REPLACE our state entirely
      isRemoteUpdateRef.current = true;
      setActiveMessages(messages.length > MAX_MESSAGES ? messages.slice(-MAX_MESSAGES) : messages);
      setTimeout(() => { isRemoteUpdateRef.current = false; }, 100);
    }, []),
    onRemoteStreaming: useCallback((content) => {
      setRemoteStreamingContent(content);
    }, []),
    roomId: aiRoomId,
    onRemoteActiveChat: useCallback((remoteChatId) => {
      if (!remoteChatId) { setActiveChatId(null); setActiveMessages([]); return; }
      if (remoteChatId === activeChatIdRefForRoom.current) return;
      isRemoteUpdateRef.current = true;
      setActiveChatId(remoteChatId);
      supabase.from("canvas_ai_chats").select("messages").eq("id", remoteChatId).single()
        .then(({ data }) => {
          const msgs = (data?.messages as ChatMessage[]) || [];
          setActiveMessages(msgs.length > MAX_MESSAGES ? msgs.slice(-MAX_MESSAGES) : msgs);
          setTimeout(() => { isRemoteUpdateRef.current = false; }, 100);
        });
    }, []),
  });
  const broadcastStreamingRef = useRef(broadcastStreaming);
  broadcastStreamingRef.current = broadcastStreaming;
  const broadcastActiveChatRef = useRef(broadcastActiveChat);
  broadcastActiveChatRef.current = broadcastActiveChat;

  // Refs for unmount flush
  const activeChatIdRef = useRef<string | null>(null);
  const activeMessagesRef = useRef<ChatMessage[]>([]);
  const sessionTokenRef = useRef<string | null>(null);
  // In-flight streaming response from CanvasAIPanel (null when no stream is active).
  // Persisted along with messages on unmount/visibility-hidden so a refresh during
  // streaming doesn't lose the response that was being typed.
  const streamingPartialRef = useRef<string | null>(null);

  // Keep refs in sync
  useEffect(() => {
    activeChatIdRef.current = activeChatId;
    activeChatIdRefForRoom.current = activeChatId;
  }, [activeChatId]);
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
        // Chats are shared across the team for this client+node — RLS gates per-client access.
        const { data: rows } = await supabase
          .from("canvas_ai_chats")
          .select("id, name, updated_at")
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
    // Chats are shared across the team for this client+node — RLS gates per-client access.
    const { data: rows } = await supabase
      .from("canvas_ai_chats")
      .select("id, name, updated_at")
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

  // Cross-user sync: subscribe to canvas_ai_chats inserts/renames/deletes for this client+node.
  // Refreshes the sidebar list when another collaborator creates, renames, or deletes a chat.
  // Filtered by client_id only (Supabase realtime supports a single filter); node_id is checked
  // client-side. Switches active chat if the active one is deleted.
  useEffect(() => {
    if (!selectedClient.id || !chatNodeId) return;
    const channel = supabase
      .channel(`canvas-ai-chats-list:${selectedClient.id}:${chatNodeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "canvas_ai_chats", filter: `client_id=eq.${selectedClient.id}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as { node_id?: string; id?: string } | null;
          if (!row || row.node_id !== chatNodeId) return;
          refreshChatList();
          if (payload.eventType === "DELETE" && row.id && row.id === activeChatIdRef.current) {
            setActiveChatId(null);
            setActiveMessages([]);
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedClient.id, chatNodeId, refreshChatList]);

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

  // Beacon save (keepalive fetch) — used for unmount, page unload, and tab-hidden recovery.
  // Includes any in-flight streaming response so a refresh mid-stream doesn't lose the reply.
  const beaconSaveChat = useCallback(() => {
    const chatId = activeChatIdRef.current;
    if (!chatId) return;
    let msgs = activeMessagesRef.current;
    const partial = streamingPartialRef.current;
    if (partial && partial.length > 0) {
      msgs = [...msgs, { role: "assistant" as const, content: partial }];
    }
    if (msgs.length === 0) return;
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
  }, []);

  // Beacon save on unmount
  useEffect(() => {
    return beaconSaveChat;
  }, [beaconSaveChat]);

  // Beacon save on tab hidden / page hide — covers tab discard and refresh while streaming
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") beaconSaveChat(); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", beaconSaveChat);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", beaconSaveChat);
    };
  }, [beaconSaveChat]);

  // Track in-flight streaming response from CanvasAIPanel and broadcast it to collaborators.
  const handleStreamingPartial = useCallback((content: string | null) => {
    streamingPartialRef.current = content;
    broadcastStreamingRef.current?.(content);
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
      broadcastActiveChatRef.current?.(row.id);
      setActiveMessages([]);
      window.dispatchEvent(new CustomEvent("canvas-ai-chat-changed", { detail: { clientId: selectedClient.id, nodeId: chatNodeId } }));
    }
  }, [user, selectedClient.id, chats.length, chatNodeId]);

  // Delete a chat
  const deleteChat = useCallback(async (chatId: string) => {
    await supabase.from("canvas_ai_chats").delete().eq("id", chatId);
    try { localStorage.removeItem(`cc_chat_${chatId}`); } catch { /* ignore */ }
    setChats((prev) => prev.filter((c) => c.id !== chatId));
    if (activeChatId === chatId) {
      const remaining = chats.filter((c) => c.id !== chatId);
      const next = remaining.length > 0 ? remaining[0].id : null;
      setActiveChatId(next);
      broadcastActiveChatRef.current?.(next);
      setActiveMessages([]);
    }
    window.dispatchEvent(new CustomEvent("canvas-ai-chat-changed", { detail: { clientId: selectedClient.id, nodeId: chatNodeId } }));
  }, [activeChatId, chats, selectedClient.id, chatNodeId]);

  // Rename a chat (called by AssistantThreadList after inline edit)
  const renameChat = useCallback(async (chatId: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    await supabase.from("canvas_ai_chats").update({ name: trimmed }).eq("id", chatId);
    setChats((prev) => prev.map((c) => c.id === chatId ? { ...c, name: trimmed } : c));
    window.dispatchEvent(new CustomEvent("canvas-ai-chat-changed", { detail: { clientId: selectedClient.id, nodeId: chatNodeId } }));
  }, [selectedClient.id, chatNodeId]);

  // Switch chat — lazy-load messages
  const switchChat = useCallback(
    async (chatId: string) => {
      if (activeChatId && activeMessages.length > 0) {
        persistMessages(activeChatId, activeMessages);
      }
      setActiveChatId(chatId);
      broadcastActiveChatRef.current?.(chatId); // collaborators follow this switch
      setActiveMessages([]);

      const { data: chatData } = await supabase
        .from("canvas_ai_chats")
        .select("messages")
        .eq("id", chatId)
        .single();
      let msgs: ChatMessage[] = (chatData?.messages as any) || [];
      try {
        const lsRaw = localStorage.getItem(`cc_chat_${chatId}`);
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

        // Broadcast full messages to other tabs (only if this is a local change, not a remote echo)
        if (!isRemoteUpdateRef.current && capped.length > 0) {
          broadcastMessages(capped);
        }
      }
    },
    [activeChatId, persistMessages, broadcastMessages]
  );

  const handleGenerateScript = useCallback((script: any) => {
    setGeneratedScript(script);
  }, []);

  // Filtered nodes for context panel
  const contextNodes = useMemo(() => {
    return nodes.filter((n) => {
      if (EXCLUDED_NODE_TYPES.has(n.type as string)) return false;
      if (n.id === "ai-assistant") return false;
      return true;
    });
  }, [nodes]);

  // Thread list items for AssistantThreadList
  const threadItems = useMemo(
    () => chats.map((c) => ({
      id: c.id,
      name: c.name,
      origin: "canvas" as const,
      updatedAt: c.updated_at,
    })),
    [chats]
  );

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
            borderRight: "1px solid #2a2b30",
            overflow: "hidden",
          }}
        >
          <AssistantThreadList
            threads={threadItems}
            activeThreadId={activeChatId}
            onSelect={(id) => switchChat(id)}
            onCreate={createChat}
            onRename={renameChat}
            onDelete={deleteChat}
            groupByDate
            variant="full"
          />
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
          ) : generatedScript ? (
            <ScriptOutputPanel
              script={generatedScript}
              onSave={(editedScript) => {
                if (onSaveScript) return onSaveScript(editedScript);
              }}
              onClear={() => setGeneratedScript(null)}
              onRefine={(feedback) => {
                setGeneratedScript(null);
                // TODO: could pipe feedback back to AI panel
              }}
            />
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
              onStreamingPartial={handleStreamingPartial}
              remoteStreamingContent={remoteStreamingContent}
              onSaveScript={onSaveScript}
              initialInput={initialDraftInput}
              onInitialInputConsumed={() => { (window as any).__canvasAIDraftInput = null; }}
              fullscreen
            />
          )}
        </div>

        {/* Right — AI sees context panel */}
        <AssistantContextPanel
          nodes={contextNodes.map((n) => {
            const d = n.data as any;
            const typeLabel = NODE_TYPE_LABEL[n.type as string] || (n.type as string);
            const displayName = d?.videoLabel || d?.videoTitle
              || (d?.channel_username ? `@${d.channel_username}` : null)
              || d?.topic || d?.fileName || d?.label || typeLabel;
            return {
              id: n.id,
              type: n.type as string,
              label: displayName,
            };
          })}
          typeColorMap={NODE_TYPE_COLOR}
          typeLabelMap={NODE_TYPE_LABEL}
          collapsed={contextPanelCollapsed}
          onToggleCollapsed={() => setContextPanelCollapsed((v) => !v)}
        />
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
