import { memo, useState, useEffect, useCallback, useRef } from "react";
import { Handle, Position, NodeProps, NodeResizer, useUpdateNodeInternals } from "@xyflow/react";
import { Bot, X, MessageSquare, Plus, Trash2, ChevronLeft, ChevronRight, Loader2, Pencil, Check } from "lucide-react";
import CanvasAIPanel, { type CanvasContext } from "./CanvasAIPanel";
import ScriptOutputPanel from "./ScriptOutputPanel";
import { supabase } from "@/integrations/supabase/client";
import { loadCanvasChatMessages } from "@/lib/canvasChatBridge";
import { useAuth } from "@/hooks/useAuth";
import { useRealtimeChatSync } from "@/hooks/useRealtimeChatSync";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

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

/** Strip base64 image data before persisting to DB/localStorage to avoid size limits */
function stripImagesForPersistence(messages: ChatMessage[]): ChatMessage[] {
  return messages.map(m => {
    const stripped: any = { ...m };
    if (m.type === "image" && m.image_b64) {
      stripped.image_b64 = undefined;
      stripped.content = m.revised_prompt || "[Generated image]";
    }
    // Never persist user-message screenshot previews (large base64 data URLs)
    if ((m as any)._imagePreview) stripped._imagePreview = undefined;
    return stripped;
  });
}

interface AIAssistantData {
  canvasContext?: CanvasContext;
  canvasContextRef?: React.RefObject<CanvasContext>;
  clientInfo?: { name?: string; target?: string };
  clientId?: string;
  nodeId?: string;
  authToken: string | null;
  format: string;
  language: "en" | "es";
  aiModel: string;
  remixMode?: boolean;
  remixContext?: {
    channel_username: string;
    format: string | null;
    prompt_hint: string | null;
  } | null;
  onFormatChange: (f: string) => void;
  onLanguageChange: (l: "en" | "es") => void;
  onModelChange: (m: string) => void;
  onSaveScript: (script: any) => Promise<void>;
  onDelete?: () => void;
}

const EMPTY_CONTEXT: CanvasContext = {
  transcriptions: [],
  structures: [],
  text_notes: "",
  research_facts: [],
  primary_topic: "",
};

const MAX_MESSAGES = 30;

const AIAssistantNode = memo(({ id, data }: NodeProps) => {
  const d = data as AIAssistantData;
  const { user } = useAuth();
  const updateNodeInternals = useUpdateNodeInternals();
  const [generatedScript, setGeneratedScript] = useState<any>(null);
  const [refinementInput, setRefinementInput] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeMessages, setActiveMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [chatsLoaded, setChatsLoaded] = useState(false);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingChatName, setEditingChatName] = useState("");
  const [isDragOverAI, setIsDragOverAI] = useState(false);
  const [droppedAIImage, setDroppedAIImage] = useState<{ dataUrl: string; mimeType: string } | null>(null);
  const activeChatIdRef = useRef<string | null>(null);
  const activeMessagesRef = useRef<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const sessionTokenRef = useRef<string | null>(null);
  // In-flight streaming response from CanvasAIPanel (null when no stream is active).
  // Persisted along with messages on unmount/visibility-hidden so a refresh during
  // streaming doesn't lose the response that was being typed.
  const streamingPartialRef = useRef<string | null>(null);

  // ─── Live chat sync ───
  const isRemoteUpdateRef = useRef(false);
  // Streaming content from a remote collaborator (live typewriter from another user/tab).
  const [remoteStreamingContent, setRemoteStreamingContent] = useState<string | null>(null);
  // Room-scoped channel for active-chat-id sync — clientId+nodeId scope means everyone
  // viewing the same AI node (across users + tabs) follows when one of them switches chat.
  const aiRoomId = (d.clientId && d.nodeId) ? `${d.clientId}:${d.nodeId}` : null;
  const { broadcastMessages, broadcastStreaming, broadcastActiveChat } = useRealtimeChatSync({
    chatId: activeChatId,
    onRemoteMessages: useCallback((messages) => {
      isRemoteUpdateRef.current = true;
      setActiveMessages(messages);
      setTimeout(() => { isRemoteUpdateRef.current = false; }, 100);
    }, []),
    onRemoteStreaming: useCallback((content) => {
      setRemoteStreamingContent(content);
    }, []),
    roomId: aiRoomId,
    onRemoteActiveChat: useCallback((remoteChatId) => {
      // Follow the collaborator's switch — load that chat locally
      if (!remoteChatId) { setActiveChatId(null); setActiveMessages([]); return; }
      if (remoteChatId === activeChatIdRef.current) return;
      isRemoteUpdateRef.current = true;
      setActiveChatId(remoteChatId);
      // Load messages for the new active chat from the unified table
      loadCanvasChatMessages(remoteChatId).then((msgs) => {
        setActiveMessages(msgs.length > MAX_MESSAGES ? msgs.slice(-MAX_MESSAGES) : msgs);
        setTimeout(() => { isRemoteUpdateRef.current = false; }, 100);
      });
    }, []),
  });
  const broadcastStreamingRef = useRef(broadcastStreaming);
  broadcastStreamingRef.current = broadcastStreaming;
  const broadcastActiveChatRef = useRef(broadcastActiveChat);
  broadcastActiveChatRef.current = broadcastActiveChat;

  // Tell React Flow to recalculate handle positions after spinner → panel transition
  useEffect(() => { if (chatsLoaded) updateNodeInternals(id); }, [chatsLoaded, id, updateNodeInternals]);

  // Keep refs in sync for unmount flush
  useEffect(() => { activeChatIdRef.current = activeChatId; }, [activeChatId]);
  useEffect(() => { activeMessagesRef.current = activeMessages; }, [activeMessages]);
  // Fetch and keep user's JWT for beacon saves (RLS requires user token, not anon key)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      sessionTokenRef.current = session?.access_token ?? null;
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      sessionTokenRef.current = session?.access_token ?? null;
    });
    return () => subscription.unsubscribe();
  }, []);

  // Refresh just the chat list metadata (sidebar) without touching active messages
  const refreshChatList = useCallback(async () => {
    if (!user || !d.clientId || !d.nodeId) return;
    // Chats are shared across the team for this client+node — RLS gates per-client access.
    const { data: rows } = await supabase
      .from("canvas_ai_chats")
      .select("id, name, updated_at")
      .eq("client_id", d.clientId)
      .eq("node_id", d.nodeId)
      .order("updated_at", { ascending: false });
    if (rows) {
      setChats(prev => rows.map(r => ({
        ...r,
        messages: prev.find(c => c.id === r.id)?.messages || [],
      })) as ChatSession[]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, d.clientId, d.nodeId]);

  // Cross-user sync: subscribe to canvas_ai_chats inserts/renames/deletes for this client+node.
  // Refreshes the sidebar list when another collaborator creates, renames, or deletes a chat.
  // Filtered by client_id only (Supabase realtime supports a single filter); node_id is checked
  // client-side. Switches active chat if the active one is deleted.
  useEffect(() => {
    if (!d.clientId || !d.nodeId) return;
    const channel = supabase
      .channel(`canvas-ai-chats-list:${d.clientId}:${d.nodeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "canvas_ai_chats", filter: `client_id=eq.${d.clientId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as { node_id?: string; id?: string } | null;
          if (!row || row.node_id !== d.nodeId) return;
          refreshChatList();
          if (payload.eventType === "DELETE" && row.id && row.id === activeChatIdRef.current) {
            setActiveChatId(null);
            setActiveMessages([]);
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [d.clientId, d.nodeId, refreshChatList]);

  // Listen for cross-view chat changes (fullscreen ↔ canvas node live sync)
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent;
      if (ce.detail?.clientId === d.clientId && ce.detail?.nodeId === d.nodeId) {
        refreshChatList();
      }
    };
    window.addEventListener("canvas-ai-chat-changed", handler);
    return () => window.removeEventListener("canvas-ai-chat-changed", handler);
  }, [d.clientId, d.nodeId, refreshChatList]);

  // Load chats — if none exist, create one inline so activeChatId is always set before chatsLoaded=true
  useEffect(() => {
    console.log("[chat] load effect fired — user:", !!user, "clientId:", d.clientId, "nodeId:", d.nodeId);
    if (!user || !d.clientId || !d.nodeId) { setChatsLoaded(true); return; }
    setChatsLoaded(false);
    (async () => {
      try {
        // Only fetch metadata (no messages) for sidebar list — saves memory.
        // Chats are shared across the team for this client+node — RLS gates per-client access.
        const { data: rows } = await supabase
          .from("canvas_ai_chats")
          .select("id, name, updated_at")
          .eq("client_id", d.clientId)
          .eq("node_id", d.nodeId)
          .order("updated_at", { ascending: false });

        console.log("[chat] DB query returned rows:", rows?.length ?? 0);
        if (rows && rows.length > 0) {
          // Set chats with empty messages (loaded on demand)
          setChats(rows.map(r => ({ ...r, messages: [] })) as ChatSession[]);
          const activeRow = rows[0];
          setActiveChatId(activeRow.id);

          // Load messages ONLY for the active chat — unified read from
          // assistant_messages so the canvas + drawer share state.
          let restoredMsgs: any[] = await loadCanvasChatMessages(activeRow.id);

          // Check localStorage for messages newer than DB (in case Supabase save lagged)
          const lsKey = `cc_chat_${activeRow.id}`;
          try {
            const lsRaw = localStorage.getItem(lsKey);
            if (lsRaw) {
              const lsMsgs = JSON.parse(lsRaw);
              if (Array.isArray(lsMsgs) && lsMsgs.length > restoredMsgs.length) {
                console.log("[chat] localStorage has more messages than DB — using localStorage");
                restoredMsgs = lsMsgs;
              }
            }
          } catch { /* ignore */ }
          setActiveMessages(restoredMsgs.length > MAX_MESSAGES ? restoredMsgs.slice(-MAX_MESSAGES) : restoredMsgs);
        } else {
          // No chats yet — create the first one before revealing the panel
          const { data: newRow, error: insertErr } = await supabase
            .from("canvas_ai_chats")
            .insert({ user_id: user.id, client_id: d.clientId, node_id: d.nodeId, name: "Chat 1", messages: [] })
            .select("id, name, messages, updated_at")
            .single();
          if (insertErr) console.error("[canvas_ai_chats] insert failed:", insertErr);
          if (newRow) {
            setChats([newRow as ChatSession]);
            setActiveChatId(newRow.id);
            setActiveMessages([]);
          }
        }
      } catch (err) {
        console.error("[canvas_ai_chats] load error:", err);
      } finally {
        setChatsLoaded(true);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, d.clientId, d.nodeId]);

  // Persist messages to DB immediately (no debounce — called on demand)
  const persistMessages = useCallback(async (chatId: string, msgs: ChatMessage[]) => {
    console.log("[chat] persistMessages chatId:", chatId, "msgs:", msgs.length);
    // Strip base64 images before saving to DB/localStorage to avoid size limits
    const safeMsgs = stripImagesForPersistence(msgs);
    const firstUserMsg = safeMsgs.find(m => m.role === "user");
    const autoName = firstUserMsg
      ? firstUserMsg.content.slice(0, 40) + (firstUserMsg.content.length > 40 ? "…" : "")
      : undefined;

    const updateData: any = { messages: safeMsgs, updated_at: new Date().toISOString() };
    if (autoName) updateData.name = autoName;

    const { error } = await supabase.from("canvas_ai_chats").update(updateData).eq("id", chatId);
    if (error) console.error("[chat] update failed:", error);

    setChats(prev => prev.map(c => c.id === chatId
      ? { ...c, messages: msgs as any, updated_at: updateData.updated_at, ...(autoName ? { name: autoName } : {}) }
      : c
    ));
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
    const firstUserMsg = msgs.find(m => m.role === "user");
    const autoName = firstUserMsg
      ? firstUserMsg.content.slice(0, 40) + (firstUserMsg.content.length > 40 ? "…" : "")
      : undefined;
    const safeMsgs = stripImagesForPersistence(msgs as ChatMessage[]);
    const updateData: any = { messages: safeMsgs, updated_at: new Date().toISOString() };
    if (autoName) updateData.name = autoName;
    const token = sessionTokenRef.current || SUPABASE_ANON_KEY;
    try {
      fetch(
        `${SUPABASE_URL}/rest/v1/canvas_ai_chats?id=eq.${chatId}`,
        {
          method: "PATCH",
          keepalive: true,
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token}`,
            Prefer: "return=minimal",
          },
          body: JSON.stringify(updateData),
        }
      );
    } catch { /* best effort */ }
  }, []);

  // Beacon save on unmount — belt-and-suspenders for tab close
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

  // Track in-flight streaming response from CanvasAIPanel and broadcast it to collaborators
  // so they see the live typewriter (broadcastStreaming throttles internally to ~10fps).
  const handleStreamingPartial = useCallback((content: string | null) => {
    streamingPartialRef.current = content;
    broadcastStreamingRef.current?.(content);
  }, []);

  // Create a new chat
  const createChat = useCallback(async () => {
    if (!user || !d.clientId || !d.nodeId) return;
    const { data: row, error } = await supabase
      .from("canvas_ai_chats")
      .insert({
        user_id: user.id,
        client_id: d.clientId,
        node_id: d.nodeId,
        name: `Chat ${chats.length + 1}`,
        messages: [],
      })
      .select("id, name, messages, updated_at")
      .single();
    if (row && !error) {
      setChats(prev => [row as ChatSession, ...prev]);
      setActiveChatId(row.id);
      broadcastActiveChatRef.current?.(row.id); // collaborators follow into the new chat
      setActiveMessages([]);
      window.dispatchEvent(new CustomEvent("canvas-ai-chat-changed", { detail: { clientId: d.clientId, nodeId: d.nodeId } }));
    }
  }, [user, d.clientId, d.nodeId, chats.length]);

  // Switch to a chat — lazy-load messages from DB
  const switchChat = useCallback(async (chat: ChatSession) => {
    if (activeChatId && activeMessages.length > 0) {
      persistMessages(activeChatId, activeMessages);
    }
    setActiveChatId(chat.id);
    broadcastActiveChatRef.current?.(chat.id); // collaborators follow this switch
    setGeneratedScript(null);
    setActiveMessages([]); // Clear immediately so panel doesn't show stale messages
    // Fetch messages for this chat on demand
    const { data: chatData } = await supabase
      .from("canvas_ai_chats")
      .select("messages")
      .eq("id", chat.id)
      .single();
    let msgs = (chatData?.messages as any) || [];
    // Check localStorage fallback
    try {
      const lsRaw = localStorage.getItem(`cc_chat_${chat.id}`);
      if (lsRaw) {
        const lsMsgs = JSON.parse(lsRaw);
        if (Array.isArray(lsMsgs) && lsMsgs.length > msgs.length) msgs = lsMsgs;
      }
    } catch { /* ignore */ }
    setActiveMessages(msgs.length > MAX_MESSAGES ? msgs.slice(-MAX_MESSAGES) : msgs);
  }, [activeChatId, activeMessages, persistMessages]);

  // Delete a chat
  const deleteChat = useCallback(async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await supabase.from("canvas_ai_chats").delete().eq("id", chatId);
    setChats(prev => prev.filter(c => c.id !== chatId));
    // Clean up localStorage for deleted chat
    try { localStorage.removeItem(`cc_chat_${chatId}`); } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent("canvas-ai-chat-changed", { detail: { clientId: d.clientId, nodeId: d.nodeId } }));
    if (activeChatId === chatId) {
      const remaining = chats.filter(c => c.id !== chatId);
      if (remaining.length > 0) {
        setActiveChatId(remaining[0].id);
        broadcastActiveChatRef.current?.(remaining[0].id);
        // Messages will be empty in chats state (lazy-loaded), so just clear
        setActiveMessages([]);
      } else {
        setActiveChatId(null);
        broadcastActiveChatRef.current?.(null);
        setActiveMessages([]);
      }
    }
  }, [activeChatId, chats]);

  // Rename a chat
  const startRename = useCallback((chat: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingChatId(chat.id);
    setEditingChatName(chat.name);
  }, []);

  const commitRename = useCallback(async (chatId: string) => {
    const trimmed = editingChatName.trim();
    if (trimmed) {
      await supabase.from("canvas_ai_chats").update({ name: trimmed }).eq("id", chatId);
      setChats(prev => prev.map(c => c.id === chatId ? { ...c, name: trimmed } : c));
      window.dispatchEvent(new CustomEvent("canvas-ai-chat-changed", { detail: { clientId: d.clientId, nodeId: d.nodeId } }));
    }
    setEditingChatId(null);
  }, [editingChatName, d.clientId, d.nodeId]);

  // When CanvasAIPanel updates messages, persist immediately (no debounce)
  const handleMessagesChange = useCallback((msgs: ChatMessage[]) => {
    console.log("[chat] handleMessagesChange called, activeChatId:", activeChatId, "msgs.length:", msgs.length);
    const capped = msgs.length > MAX_MESSAGES ? msgs.slice(-MAX_MESSAGES) : msgs;
    activeMessagesRef.current = capped;
    setActiveMessages(capped);
    if (activeChatId) {
      try { localStorage.setItem(`cc_chat_${activeChatId}`, JSON.stringify(stripImagesForPersistence(capped).slice(-MAX_MESSAGES))); } catch { /* ignore */ }
      persistMessages(activeChatId, capped);

      // Broadcast to other tabs (skip if this was a remote update)
      if (!isRemoteUpdateRef.current && capped.length > 0) {
        broadcastMessages(capped);
      }
    } else {
      console.warn("[chat] handleMessagesChange called but activeChatId is null — save skipped");
    }
  }, [activeChatId, persistMessages, broadcastMessages]);

  const handleRefine = (scriptText: string) => {
    setRefinementInput(`Please refine this script:\n\n${scriptText}`);
    setGeneratedScript(null);
  };

  return (
    <div
      data-tutorial-target="ai-node"
      className="glass-card rounded-2xl shadow-2xl flex flex-row relative"
      style={{ width: "100%", height: "100%", minWidth: "340px", minHeight: "400px",
        ...(isDragOverAI ? { boxShadow: "0 0 0 2px rgba(34,211,238,0.6), 0 0 24px rgba(34,211,238,0.15)" } : {})
      }}
      onDragOver={(e) => {
        const hasImage = Array.from(e.dataTransfer.items).some(i => i.kind === "file" && i.type.startsWith("image/"));
        if (!hasImage) return;
        e.preventDefault();
        e.stopPropagation(); // prevent canvas from also showing its overlay
        setIsDragOverAI(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOverAI(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOverAI(false);
        const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith("image/"));
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const dataUrl = ev.target?.result as string;
          if (dataUrl) setDroppedAIImage({ dataUrl, mimeType: file.type });
        };
        reader.readAsDataURL(file);
      }}
    >
      {/* Drop overlay — only image drops on the AI node */}
      {isDragOverAI && (
        <div className="absolute inset-0 z-50 rounded-2xl pointer-events-none flex items-center justify-center"
          style={{ background: "rgba(34,211,238,0.07)", border: "2px dashed rgba(34,211,238,0.5)" }}>
          <div className="bg-card/90 backdrop-blur-sm border border-primary/30 rounded-xl px-5 py-3 flex flex-col items-center gap-1.5 shadow-xl">
            <Bot className="w-6 h-6 text-primary" />
            <p className="text-xs font-semibold text-foreground">Drop image for AI</p>
            <p className="text-[10px] text-muted-foreground">Claude will analyze it</p>
          </div>
        </div>
      )}
      <NodeResizer
        minWidth={340}
        minHeight={400}
        handleStyle={{ background: "transparent", border: "none", opacity: 0, width: 14, height: 14 }}
        lineStyle={{ border: "none" }}
      />

      {/* Content wrapper — absolute inset-0 + overflow:hidden clips precisely to rounded corners without clipping Handles */}
      <div className="absolute inset-0 overflow-hidden rounded-2xl flex flex-row pointer-events-auto">

      {/* Chat Sidebar — left side */}
      <div
        className={`flex-shrink-0 border-r border-border/50 flex flex-col bg-muted/20 transition-all duration-200 overflow-hidden ${
          sidebarOpen ? "w-[160px]" : "w-[32px]"
        }`}
      >
        {/* Toggle button */}
        <button
          onClick={() => setSidebarOpen(o => !o)}
          className="nodrag flex items-center justify-center py-2 hover:bg-muted/60 transition-colors border-b border-border/30"
          title={sidebarOpen ? "Collapse" : "Saved Chats"}
        >
          {sidebarOpen ? (
            <ChevronLeft className="w-3 h-3 text-muted-foreground" />
          ) : (
            <MessageSquare className="w-3 h-3 text-muted-foreground" />
          )}
        </button>

        {sidebarOpen && (
          <>
            {/* New Chat button */}
            <button
              onClick={createChat}
              className="nodrag flex items-center gap-1.5 px-2 py-1.5 text-[10px] text-primary hover:bg-primary/10 transition-colors border-b border-border/30"
            >
              <Plus className="w-3 h-3" />
              New Chat
            </button>

            {/* Chat list */}
            <div className="flex-1 overflow-y-auto nodrag nowheel">
              {chats.map(chat => (
                <div
                  key={chat.id}
                  onClick={() => editingChatId !== chat.id && switchChat(chat)}
                  className={`w-full text-left px-2 py-1.5 text-[10px] flex items-center gap-1 group transition-colors cursor-pointer ${
                    activeChatId === chat.id
                      ? "bg-primary/15 text-primary font-medium"
                      : "text-muted-foreground hover:bg-muted/60"
                  }`}
                >
                  <MessageSquare className="w-2.5 h-2.5 flex-shrink-0" />
                  {editingChatId === chat.id ? (
                    <input
                      autoFocus
                      value={editingChatName}
                      onChange={e => setEditingChatName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") commitRename(chat.id); if (e.key === "Escape") setEditingChatId(null); }}
                      onBlur={() => commitRename(chat.id)}
                      onClick={e => e.stopPropagation()}
                      className="nodrag flex-1 bg-muted/60 border border-primary/40 rounded px-1 py-0 text-[10px] text-foreground outline-none min-w-0"
                    />
                  ) : (
                    <span className="truncate flex-1">{chat.name}</span>
                  )}
                  <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all">
                    <button
                      onClick={(e) => startRename(chat, e)}
                      className="p-0.5 hover:text-primary transition-colors"
                      title="Rename"
                    >
                      <Pencil className="w-2.5 h-2.5" />
                    </button>
                    <button
                      onClick={(e) => deleteChat(chat.id, e)}
                      className="p-0.5 hover:text-red-400 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 flex-shrink-0 cursor-default" style={{ background: 'transparent', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-2">
            <Bot className="w-3.5 h-3.5" style={{ color: '#e0e0e0' }} />
            <span className="text-xs font-semibold" style={{ color: '#e0e0e0' }}>Connecta AI</span>
            <span className="text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>Draw edges from nodes to connect context</span>
          </div>
          {d.onDelete && (
            <button
              onClick={d.onDelete}
              className="nodrag p-0.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Content — nodrag + nowheel prevents canvas drag/scroll capture */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0 nodrag nowheel">
          {generatedScript ? (
            <ScriptOutputPanel
              script={generatedScript}
              onSave={(editedScript) => {
                const fn = d.onSaveScript || (window as any).__canvasSaveScript;
                if (fn) return fn(editedScript);
              }}
              onClear={() => setGeneratedScript(null)}
              onRefine={handleRefine}
            />
          ) : !chatsLoaded ? (
            <div className="flex items-center justify-center flex-1">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <CanvasAIPanel
              key={activeChatId ?? "no-chat"}
              canvasContext={d.canvasContextRef?.current ?? d.canvasContext ?? EMPTY_CONTEXT}
              canvasContextRef={d.canvasContextRef}
              clientInfo={d.clientInfo}
              onGenerateScript={setGeneratedScript}
              authToken={d.authToken}
              format={d.format}
              language={d.language}
              aiModel={d.aiModel || "claude-haiku-4-5"}
              remixMode={d.remixMode ?? false}
              remixContext={d.remixContext ?? null}
              onFormatChange={d.onFormatChange}
              onLanguageChange={d.onLanguageChange}
              onModelChange={d.onModelChange}
              initialInput={refinementInput}
              onInitialInputConsumed={() => setRefinementInput(null)}
              initialMessages={activeMessages}
              onMessagesChange={handleMessagesChange}
              onStreamingPartial={handleStreamingPartial}
              remoteStreamingContent={remoteStreamingContent}
              onSaveScript={d.onSaveScript}
              externalDroppedImage={droppedAIImage}
              chatId={activeChatId}
            />
          )}
        </div>
      </div>

      </div>{/* end content wrapper */}

      <Handle type="target" position={Position.Left} className="!bg-primary !border-primary/70 !w-3 !h-3" style={{ zIndex: 50 }} />
      <Handle type="source" position={Position.Right} className="!bg-primary !border-primary/70 !w-3 !h-3" style={{ zIndex: 50 }} />
    </div>
  );
});

AIAssistantNode.displayName = "AIAssistantNode";
export default AIAssistantNode;
