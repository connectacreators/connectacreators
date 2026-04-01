import { memo, useState, useEffect, useCallback, useRef } from "react";
import { Handle, Position, NodeProps, NodeResizer, useUpdateNodeInternals } from "@xyflow/react";
import { Bot, X, MessageSquare, Plus, Trash2, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import CanvasAIPanel, { type CanvasContext } from "./CanvasAIPanel";
import ScriptOutputPanel from "./ScriptOutputPanel";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

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
  const [isDragOverAI, setIsDragOverAI] = useState(false);
  const [droppedAIImage, setDroppedAIImage] = useState<{ dataUrl: string; mimeType: string } | null>(null);
  const activeChatIdRef = useRef<string | null>(null);
  const activeMessagesRef = useRef<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const sessionTokenRef = useRef<string | null>(null);

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

  // Load chats — if none exist, create one inline so activeChatId is always set before chatsLoaded=true
  useEffect(() => {
    console.log("[chat] load effect fired — user:", !!user, "clientId:", d.clientId, "nodeId:", d.nodeId);
    if (!user || !d.clientId || !d.nodeId) { setChatsLoaded(true); return; }
    setChatsLoaded(false);
    (async () => {
      try {
        // Only fetch metadata (no messages) for sidebar list — saves memory
        const { data: rows } = await supabase
          .from("canvas_ai_chats")
          .select("id, name, updated_at")
          .eq("user_id", user.id)
          .eq("client_id", d.clientId)
          .eq("node_id", d.nodeId)
          .order("updated_at", { ascending: false });

        console.log("[chat] DB query returned rows:", rows?.length ?? 0);
        if (rows && rows.length > 0) {
          // Set chats with empty messages (loaded on demand)
          setChats(rows.map(r => ({ ...r, messages: [] })) as ChatSession[]);
          const activeRow = rows[0];
          setActiveChatId(activeRow.id);

          // Load messages ONLY for the active chat
          const { data: activeData } = await supabase
            .from("canvas_ai_chats")
            .select("messages")
            .eq("id", activeRow.id)
            .single();
          let restoredMsgs = (activeData?.messages as any) || [];

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

  // Beacon save on unmount (keepalive fetch) — belt-and-suspenders for tab close
  useEffect(() => {
    return () => {
      const chatId = activeChatIdRef.current;
      const msgs = activeMessagesRef.current;
      if (!chatId || msgs.length === 0) return;
      const firstUserMsg = msgs.find(m => m.role === "user");
      const autoName = firstUserMsg
        ? firstUserMsg.content.slice(0, 40) + (firstUserMsg.content.length > 40 ? "…" : "")
        : undefined;
      const safeMsgs = stripImagesForPersistence(msgs);
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
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setActiveMessages([]);
    }
  }, [user, d.clientId, d.nodeId, chats.length]);

  // Switch to a chat — lazy-load messages from DB
  const switchChat = useCallback(async (chat: ChatSession) => {
    if (activeChatId && activeMessages.length > 0) {
      persistMessages(activeChatId, activeMessages);
    }
    setActiveChatId(chat.id);
    setGeneratedScript(null);
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
    if (activeChatId === chatId) {
      const remaining = chats.filter(c => c.id !== chatId);
      if (remaining.length > 0) {
        setActiveChatId(remaining[0].id);
        // Messages will be empty in chats state (lazy-loaded), so just clear
        setActiveMessages([]);
      } else {
        setActiveChatId(null);
        setActiveMessages([]);
      }
    }
  }, [activeChatId, chats]);

  // When CanvasAIPanel updates messages, persist immediately (no debounce)
  const handleMessagesChange = useCallback((msgs: ChatMessage[]) => {
    console.log("[chat] handleMessagesChange called, activeChatId:", activeChatId, "msgs.length:", msgs.length);
    const capped = msgs.length > MAX_MESSAGES ? msgs.slice(-MAX_MESSAGES) : msgs;
    activeMessagesRef.current = capped;
    setActiveMessages(capped);
    if (activeChatId) {
      try { localStorage.setItem(`cc_chat_${activeChatId}`, JSON.stringify(stripImagesForPersistence(capped).slice(-MAX_MESSAGES))); } catch { /* ignore */ }
      persistMessages(activeChatId, capped);
    } else {
      console.warn("[chat] handleMessagesChange called but activeChatId is null — save skipped");
    }
  }, [activeChatId, persistMessages]);

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
                <button
                  key={chat.id}
                  onClick={() => switchChat(chat)}
                  className={`w-full text-left px-2 py-1.5 text-[10px] truncate flex items-center gap-1 group transition-colors ${
                    activeChatId === chat.id
                      ? "bg-primary/15 text-primary font-medium"
                      : "text-muted-foreground hover:bg-muted/60"
                  }`}
                >
                  <MessageSquare className="w-2.5 h-2.5 flex-shrink-0" />
                  <span className="truncate flex-1">{chat.name}</span>
                  <button
                    onClick={(e) => deleteChat(chat.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-400 transition-all flex-shrink-0"
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                </button>
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
              onSaveScript={d.onSaveScript}
              externalDroppedImage={droppedAIImage}
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
