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

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  CheckCircle2,
  Clock,
  ListChecks,
  PanelLeftClose,
  PanelLeftOpen,
  User as UserIcon,
  Clapperboard,
} from "lucide-react";
import type { MentionableNode } from "@/components/assistant";
import { useCompanion } from "@/contexts/CompanionContext";
import { useAuth } from "@/hooks/useAuth";
import { useAssistantMode, useCurrentPath } from "@/hooks/useAssistantMode";
import { useLanguage } from "@/hooks/useLanguage";
import { useActiveChat } from "@/hooks/useActiveChat";
import { supabase } from "@/integrations/supabase/client";
import { streamCompanionChat, type SceneEvent, type EmbedRef } from "@/lib/companion/stream-companion-chat";
import {
  AssistantChat,
  AssistantTextInput,
  AssistantThreadList,
  FingerprintAvatar,
  type ThreadListItem,
} from "@/components/assistant";
import { AI_MODELS, type AssistantMessage } from "@/components/canvas/CanvasAIPanel.shared";

// Persisted across sessions so the user's last model/thinking choice survives
// reloads. Keys are versioned so we can invalidate in a future migration.
const PREFS_KEY = "ai_command_center_prefs_v1";
interface AiPrefs { model: string; thinkingEnabled: boolean }
function loadPrefs(): AiPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (typeof p?.model === "string") return { model: p.model, thinkingEnabled: Boolean(p.thinkingEnabled) };
    }
  } catch { /* ignore */ }
  return { model: "claude-sonnet-4-5", thinkingEnabled: false };
}
function savePrefs(prefs: AiPrefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}

// Detect a build-mode script draft in an assistant message. draft_script
// emits a strict format: TITLE: ...\nHOOK: ...\nBODY: ...\nCTA: ... — this
// regex pulls out the four sections so we can render InlineScriptPreview
// with the real title.
function parseScriptDraft(text: string): { title?: string; hook: string; body: string; cta: string } | null {
  if (!/HOOK:/i.test(text) || !/BODY:/i.test(text) || !/CTA:/i.test(text)) return null;
  const titleMatch = /TITLE:\s*([^\n]+)/i.exec(text);
  const hookMatch = /HOOK:\s*([\s\S]*?)(?=\n\s*BODY:)/i.exec(text);
  const bodyMatch = /BODY:\s*([\s\S]*?)(?=\n\s*CTA:)/i.exec(text);
  const ctaMatch = /CTA:\s*([\s\S]*?)(?:\n\n|$)/i.exec(text);
  if (!hookMatch || !bodyMatch || !ctaMatch) return null;
  const hook = hookMatch[1].trim();
  const body = bodyMatch[1].trim();
  const cta = ctaMatch[1].trim();
  if (!hook || !body || !cta) return null;
  const title = titleMatch?.[1]?.trim();
  return { title, hook, body, cta };
}

/**
 * Heuristic fallback for the common case where the agent writes a hook
 * inside a quoted block instead of using TITLE/Hook/Body/CTA labels:
 *
 *   I have enough context to write a strong 30-second hook…
 *   ---
 *   "Most people who start treatment feel amazing after week one. Week
 *    two is where they quit — and that one decision costs them months
 *    of progress…"
 *   ---
 *
 * Finds the longest straight or curly-quoted block ≥ 40 chars and
 * treats it as a single-section "Hook" draft. Returns null if no
 * substantial quoted block is found.
 */
function extractQuotedHook(text: string): { hook: string } | null {
  if (!text) return null;
  // Match either "...." or "...." spanning across lines.
  const candidates: string[] = [];
  const patterns = [
    /"([^"]{40,}?)"/gs,    // straight quotes
    /["]([^"]{40,}?)["]/gs,  // typographic
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      candidates.push(m[1].trim());
    }
  }
  if (candidates.length === 0) return null;
  // Only fire on SINGLE-hook drafts. If the message has multiple quoted
  // blocks (user asked for "3 hooks") or substantial surrounding prose
  // (>240 non-quoted chars — usually a multi-hook breakdown or general
  // chat), let it render as normal text. The card UI swallows everything
  // around the quote, which felt great for one-shot hook drafts and
  // terrible for everything else.
  if (candidates.length > 1) return null;
  const quoted = candidates[0];
  const nonQuotedChars = text.replace(/"[^"]+"/g, "").replace(/["][^"]+["]/g, "").trim().length;
  if (nonQuotedChars > 240) return null;
  // Skip placeholder hooks — if the quote contains [X], [name], <bracket>
  // tokens, the model returned a template not a real hook.
  if (/\[[A-Za-z][^\]]{0,20}\]|<[A-Za-z][^>]{0,20}>/.test(quoted)) return null;
  return { hook: quoted };
}

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

// Compact one-line mode selector — replaces the old 3-pill row. Cycles
// auto → ask → plan on click; the active mode label sits inline so the
// control fits inside the composer footer without screaming for attention.
function CompactModeSelect({
  mode,
  setMode,
}: {
  mode: "auto" | "ask" | "plan";
  setMode: (m: "auto" | "ask" | "plan") => void;
}) {
  const labels: Record<typeof mode, string> = { auto: "Auto", ask: "Ask", plan: "Plan" };
  const tips: Record<typeof mode, string> = {
    auto: "Auto — Robby acts without confirming",
    ask: "Ask — Robby confirms before changing data",
    plan: "Plan — Robby writes a plan and waits for approval",
  };
  const next = (cur: typeof mode): typeof mode => (cur === "auto" ? "ask" : cur === "ask" ? "plan" : "auto");
  return (
    <button
      type="button"
      onClick={() => setMode(next(mode))}
      title={tips[mode]}
      className="flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-md transition-all"
      style={{
        background: "rgba(143,208,213,0.10)",
        color: "rgba(143,208,213,0.95)",
        border: "1px solid rgba(143,208,213,0.25)",
      }}
    >
      <span className="text-white/40 font-normal">Mode</span>
      <span>{labels[mode]}</span>
    </button>
  );
}

export default function CommandCenter() {
  const { user } = useAuth();
  const {
    companionName,
    clientId: ownClientId,
    tasks,
    loadingTasks,
    refreshTasks,
    autonomyMode,
    setAutonomyMode,
  } = useCompanion();
  const { mode, clientId: urlClientId } = useAssistantMode();
  const path = useCurrentPath();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const en = language === "en";

  // URL clientId takes precedence; fallback to user's own primary client
  const activeClientId = urlClientId ?? ownClientId;

  // ── Display name for greeting ─────────────────────────────────────────
  const [displayName, setDisplayName] = useState<string | null>(null);
  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        const dn = data?.display_name?.trim();
        if (dn) setDisplayName(dn.split(" ")[0]);
      });
  }, [user]);

  const SUGGESTIONS = en
    ? [
        "What needs my attention?",
        "Show me my pipeline",
        "Which clients are stalled?",
      ]
    : [
        "¿Qué necesita mi atención?",
        "Muéstrame mi pipeline",
        "¿Qué clientes están atascados?",
      ];

  // ── Thread / chat state ────────────────────────────────────────────────
  // activeThreadId is persisted via useActiveChat so the same conversation
  // continues if the user navigates between /ai and any drawer-enabled page.
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const { activeThreadId, setActiveChat, clearActiveChat } = useActiveChat();
  const setActiveThreadId = useCallback(
    (next: string | null) => {
      if (next) setActiveChat(next, null);
      else clearActiveChat();
    },
    [setActiveChat, clearActiveChat],
  );
  const [messages, setMessages] = useState<MsgRow[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  // Voice input via Web Speech API. Pattern matches CanvasAIPanel.tsx so the
  // two assistants behave identically.
  const [recognizing, setRecognizing] = useState(false);
  const recognitionRef = useRef<any>(null);
  // AbortController for the in-flight companion-chat fetch. Stop button
  // aborts this; the fetch path uses raw fetch so the signal actually
  // cancels the network call (functions.invoke doesn't accept signal).
  const abortControllerRef = useRef<AbortController | null>(null);

  // ── Tier-2 input controls (parity with Canvas AI panel) ───────────────
  // Persisted: model choice + thinking toggle (user usually picks once).
  // Per-message: image attachment + image-gen mode + research mode.
  const initialPrefs = useMemo(() => loadPrefs(), []);
  const [selectedModel, setSelectedModel] = useState<string>(initialPrefs.model);
  const [thinkingEnabled, setThinkingEnabled] = useState<boolean>(initialPrefs.thinkingEnabled);
  useEffect(() => { savePrefs({ model: selectedModel, thinkingEnabled }); }, [selectedModel, thinkingEnabled]);
  const [pastedImage, setPastedImage] = useState<{ dataUrl: string; mimeType: string } | null>(null);
  const [imageMode, setImageMode] = useState<boolean>(false);
  const [isResearchMode, setIsResearchMode] = useState<boolean>(false);

  // ── @-mention sources (Tier-3 parity, adapted for /ai) ────────────────
  // Canvas mentions canvas nodes; /ai doesn't have those, so we surface the
  // closest agency-relevant entities: clients the user has access to, plus
  // their 30 most-recently-touched editing-queue items. These get formatted
  // into MentionableNode[] and rendered in the @-dropdown that's already
  // wired in AssistantTextInput.
  const [mentionableNodes, setMentionableNodes] = useState<MentionableNode[]>([]);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [clientsRes, editsRes] = await Promise.all([
        supabase
          .from("clients")
          .select("id, name")
          .order("name", { ascending: true })
          .limit(200),
        supabase
          .from("video_edits")
          .select("id, reel_title, clients(name)")
          .order("updated_at", { ascending: false, nullsFirst: false })
          .limit(30),
      ]);
      if (cancelled) return;
      // AssistantTextInput filters by `typeLabel` + `detail` (case-insensitive
      // substring) and inserts `@<typeLabel>(<detail>)` into the message. Put
      // the entity NAME in `detail` so (a) the user can filter by typing the
      // name and (b) the inserted token is human-readable AND machine-parseable
      // by the companion-chat function: "@Client(Dr Calvin)", "@Video(<title>)".
      const nodes: MentionableNode[] = [];
      for (const c of clientsRes.data ?? []) {
        if (!c?.name) continue;
        nodes.push({ id: `client:${c.id}`, type: "client", detail: c.name });
      }
      for (const v of editsRes.data ?? []) {
        const v2 = v as { id: string; reel_title: string | null; clients?: { name?: string } | null };
        if (!v2.reel_title) continue;
        nodes.push({ id: `edit:${v2.id}`, type: "edit", detail: v2.reel_title });
      }
      setMentionableNodes(nodes);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const mentionIconMap = useMemo<Record<string, React.ReactNode>>(
    () => ({
      client: <UserIcon className="w-3.5 h-3.5" />,
      edit:   <Clapperboard className="w-3.5 h-3.5" />,
    }),
    [],
  );
  const mentionLabelMap = useMemo<Record<string, string>>(
    () => ({ client: "Client", edit: "Video" }),
    [],
  );

  // Image paste handler — same shape as CanvasAIPanel.handlePaste
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData?.items ?? []);
    const imageItem = items.find((it) => it.type.startsWith("image/"));
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      if (dataUrl) setPastedImage({ dataUrl, mimeType: file.type });
    };
    reader.readAsDataURL(file);
  }, []);
  // Live scene from companion-chat SSE — drives ThinkingAnimation.
  const [currentScene, setCurrentScene] = useState<SceneEvent | null>(null);
  // Embeds keyed by thread_id so switching threads doesn't carry embeds
  // across — previous bug: every chat showed the same find_viral_videos
  // thumbnails because state was global.
  const [pendingEmbedsByThread, setPendingEmbedsByThread] = useState<Record<string, EmbedRef[]>>({});
  // Latest pending plan proposal — rendered as an inline card under the
  // assistant's reply with Approve / Reject buttons. Cleared when the
  // user clicks either, or when a new plan arrives. Only one shown at a
  // time so old proposals don't pile up.
  const [latestPlan, setLatestPlan] = useState<
    { plan_id: string; summary: string; steps: Array<{ tool?: string; description?: string }> } | null
  >(null);

  // ── Right-tab state (Chat vs Tasks) ────────────────────────────────────
  const [rightTab, setRightTab] = useState<RightTab>("chat");

  // Chats sidebar collapsed state — persisted to localStorage. Toggleable via
  // the panel-icon button in the header or Cmd/Ctrl+. keyboard shortcut.
  const [chatsSidebarOpen, setChatsSidebarOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("cc_chats_sidebar_open") !== "false";
  });
  useEffect(() => {
    try {
      localStorage.setItem("cc_chats_sidebar_open", chatsSidebarOpen ? "true" : "false");
    } catch { /* ignore */ }
  }, [chatsSidebarOpen]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ".") {
        e.preventDefault();
        setChatsSidebarOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
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
    }
    // Agency mode: show ALL user threads (drawer + canvas) so /ai is synced with the drawer
    const { data, error } = await query;
    if (!error) setThreads((data ?? []) as ThreadRow[]);
  }, [user, mode, activeClientId]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  // ── Messages for active thread (with Realtime for FSM messages) ──────────
  const loadMessagesForThread = useCallback(async (threadId: string) => {
    const { data, error } = await supabase
      .from("assistant_messages")
      .select("id, role, content, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (!error) setMessages((data ?? []) as MsgRow[]);
  }, []);

  useEffect(() => {
    if (!activeThreadId) {
      setMessages([]);
      return;
    }
    void loadMessagesForThread(activeThreadId);

    const channel = supabase
      .channel(`cc-msgs-${activeThreadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "assistant_messages",
          filter: `thread_id=eq.${activeThreadId}`,
        },
        (payload: any) => {
          const newMsg = payload.new as MsgRow;
          if (newMsg.role === "tool") return;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            const filtered = prev.filter(
              (m) => !(m.id.startsWith("tmp-") && m.role === newMsg.role),
            );
            return [...filtered, newMsg];
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeThreadId, loadMessagesForThread]);

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

  const handleDeleteThread = useCallback(
    async (threadId: string) => {
      const { error } = await supabase
        .from("assistant_threads")
        .delete()
        .eq("id", threadId);
      if (error) {
        console.error("[CommandCenter] delete thread failed:", error);
        toast.error(en ? "Could not delete chat" : "No se pudo eliminar el chat");
        return;
      }
      setThreads((prev) => prev.filter((t) => t.id !== threadId));
      if (activeThreadId === threadId) {
        setActiveThreadId(null);
        setMessages([]);
      }
      toast.success(en ? "Chat deleted" : "Chat eliminado");
    },
    [activeThreadId, en],
  );

  const handleRenameThread = useCallback(
    async (threadId: string, newName: string) => {
      const { error } = await supabase
        .from("assistant_threads")
        .update({ title: newName })
        .eq("id", threadId);
      if (error) {
        console.error("[CommandCenter] rename thread failed:", error);
        toast.error(en ? "Could not rename chat" : "No se pudo renombrar el chat");
        return;
      }
      setThreads((prev) =>
        prev.map((t) => (t.id === threadId ? { ...t, title: newName } : t)),
      );
    },
    [en],
  );

  /**
   * Toggle Web Speech API recording. Mirrors CanvasAIPanel.toggleVoice so the
   * two assistants behave identically. Result is appended to the input field.
   */
  const toggleVoice = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error(en ? "Voice input not supported in this browser" : "Entrada de voz no soportada en este navegador");
      return;
    }
    if (recognizing) {
      recognitionRef.current?.stop();
      setRecognizing(false);
      return;
    }
    const rec = new SR();
    rec.lang = en ? "en-US" : "es-ES";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      const transcript = e.results[0]?.[0]?.transcript || "";
      if (transcript) {
        setInput((prev) => (prev ? prev + " " + transcript : transcript));
      }
    };
    rec.onerror = () => setRecognizing(false);
    rec.onend = () => setRecognizing(false);
    recognitionRef.current = rec;
    rec.start();
    setRecognizing(true);
  }, [recognizing, en]);

  /** Stop the in-flight companion-chat request. */
  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setSending(false);
  }, []);

  // ── Send a message via companion-chat (dual-writes to new tables) ──────
  // Accepts an optional override so callers (e.g. the InlineScriptPreview
  // Approve button) can send a synthetic message without going through the
  // input field.
  const handleSend = useCallback(async (override?: string) => {
    const raw = override ?? input;
    console.log("[ai] handleSend called", { hasText: !!raw.trim(), sending, hasUser: !!user, raw: raw.slice(0, 60) });
    if (!raw.trim() || sending || !user) {
      console.warn("[ai] handleSend early-return", { hasText: !!raw.trim(), sending, hasUser: !!user });
      return;
    }
    const text = raw.trim();
    if (!override) setInput("");
    setSending(true);

    const optimistic: MsgRow = {
      id: `tmp-${Date.now()}`,
      role: "user",
      content: { type: "text", text },
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    // Reset embeds for this thread so they don't leak into the new reply.
    if (activeThreadId) {
      setPendingEmbedsByThread((prev) => {
        const next = { ...prev };
        delete next[activeThreadId];
        return next;
      });
    }

    // Fresh AbortController so the Stop button can interrupt this request.
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      // SSE stream — companion-chat emits scene events live so we can update
      // the ThinkingAnimation as tools fire, then emits a final `done` event
      // with the same {reply, actions, thread_id} shape the rest of this
      // function expects.
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
      const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
      const streamResult = await streamCompanionChat({
        supabaseUrl: SUPABASE_URL,
        anonKey: ANON,
        accessToken: session.access_token,
        body: {
          message: text,
          companion_name: companionName,
          current_path: path,
          autonomy_mode: autonomyMode,
          thread_id: activeThreadId ?? null,
          // Tier-2 controls — passed through to companion-chat which already
          // honors these fields when sent (same payload Canvas uses).
          model: selectedModel,
          extended_thinking: thinkingEnabled,
          image_mode: imageMode,
          is_research: isResearchMode,
          image_b64: pastedImage?.dataUrl ?? null,
          image_mime_type: pastedImage?.mimeType ?? null,
        },
        signal: controller.signal,
        callbacks: {
          onScene: (scene) => setCurrentScene(scene),
          onEmbeds: (event) => {
            const tid = activeThreadId ?? "__pending__";
            setPendingEmbedsByThread((prev) => ({
              ...prev,
              [tid]: [...(prev[tid] ?? []), ...event.embeds],
            }));
          },
        },
      });
      // Clear the pasted image on successful send so the next message
      // starts fresh — same UX as Canvas.
      setPastedImage(null);
      setCurrentScene(null);
      const data = streamResult.done ?? null;

      // Activate the thread from the response so Realtime subscription fires
      const returnedThreadId = data?.thread_id as string | undefined;
      if (returnedThreadId && !activeThreadId) {
        setActiveThreadId(returnedThreadId);
        setRightTab("chat");
        // useEffect fires loadMessagesForThread automatically
      } else if (returnedThreadId && activeThreadId) {
        await loadMessagesForThread(activeThreadId);
      }

      // Only navigate for non-FSM responses (FSM returns actions: [])
      if (Array.isArray(data?.actions)) {
        for (const action of data.actions) {
          if (action?.type === "navigate" && typeof action.path === "string") {
            // Navigate in the same tab. The active thread is persisted via
            // useActiveChat (localStorage), so the destination's
            // CompanionDrawer will auto-resume the conversation. Refuse
            // non-relative paths so an AI action can't open external URLs.
            if (action.path.startsWith("/")) {
              // Refresh the active-chat timestamp so the destination drawer
              // recognizes this as a fresh nav and auto-opens.
              if (activeThreadId) setActiveChat(activeThreadId, null);
              navigate(action.path);
            } else {
              console.warn("[ai] refused non-relative navigation:", action.path);
            }
          } else if (
            action?.type !== "fill_onboarding" &&
            action?.type !== "open_client" &&
            action?.type !== "refresh_data" &&
            action?.type !== "highlight_items" &&
            action?.type !== "show_notification" &&
            action?.type !== "plan_proposal"
          ) {
            console.warn("[ai] unhandled action type:", action?.type, action);
          }
          if (action?.type === "plan_proposal" && typeof action.plan_id === "string") {
            // Render the plan as an inline card with Approve / Reject buttons.
            // Only the most-recent plan is shown — older proposals get cleared.
            setLatestPlan({
              plan_id: action.plan_id,
              summary: typeof action.summary === "string" ? action.summary : "Plan proposed",
              steps: Array.isArray(action.steps) ? action.steps : [],
            });
          }
          if (action?.type === "fill_onboarding") {
            window.dispatchEvent(
              new CustomEvent("companion:fill-onboarding", {
                detail: action.fields,
              }),
            );
          }
          if (action?.type === "open_client" && typeof action.client_id === "string") {
            navigate(`/clients/${action.client_id}`);
          }
          if (action?.type === "refresh_data") {
            window.dispatchEvent(
              new CustomEvent("ai:data-changed", {
                detail: { scope: action.scope ?? "all" },
              }),
            );
          }
          if (action?.type === "highlight_items" && Array.isArray(action.item_ids)) {
            window.dispatchEvent(
              new CustomEvent("ai:highlight-items", {
                detail: { scope: action.scope ?? "editing_queue", item_ids: action.item_ids },
              }),
            );
          }
          if (action?.type === "show_notification" && typeof action.message === "string") {
            window.dispatchEvent(
              new CustomEvent("ai:notification", {
                detail: { message: action.message },
              }),
            );
          }
        }
      }

      await loadThreads();
      void refreshTasks();
    } catch (err: any) {
      // Abort is a clean user action — silently drop the pending optimistic
      // message and let UI return to idle. Other errors surface a toast.
      if (err?.name === "AbortError") {
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      } else {
        console.error("[ai] handleSend error:", err);
        toast.error(en ? "Failed to send. Try again." : "Error al enviar. Inténtalo de nuevo.");
      }
    } finally {
      // Only clear the controller if it's still ours (stopGeneration may have
      // already nulled it).
      if (abortControllerRef.current === controller) abortControllerRef.current = null;
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
    activeThreadId,
    loadMessagesForThread,
    en,
    setActiveChat,
    selectedModel,
    thinkingEnabled,
    imageMode,
    isResearchMode,
    pastedImage,
  ]);

  // ── MsgRow[] → AssistantMessage[] for AssistantChat ────────────────────
  //
  // When an assistant message contains a script draft (HOOK / BODY / CTA
  // labels in the canonical build-mode output format), we synthesize an
  // additional script_preview message right after it so AssistantChat
  // renders the InlineScriptPreview component with an Approve button.
  // The synthetic message is UI-only — it never lands in the DB.
  const chatMessages: AssistantMessage[] = useMemo(() => {
    const out: AssistantMessage[] = [];
    for (const m of messages.filter((mm) => mm.role === "user" || mm.role === "assistant")) {
      const c: any = m.content;
      let content = "";
      if (typeof c === "string") {
        content = c;
      } else if (c && typeof c === "object" && typeof c.text === "string") {
        content = c.text;
      } else {
        content = JSON.stringify(c ?? "");
      }
      // Detect a script draft eagerly — when present, attach a live broadcast
      // turn to the assistant text message so AssistantChat renders the
      // DraftingScene. The existing script_preview synthetic still appears
      // below, providing the Save button.
      const draft = m.role === "assistant" && content ? parseScriptDraft(content) : null;
      const draftSections = draft
        ? ([
            draft.hook && { tag: "Hook", body: draft.hook },
            draft.body && { tag: "Body", body: draft.body },
            draft.cta  && { tag: "CTA",  body: draft.cta },
          ].filter(Boolean) as Array<{ tag: string; body: string }>)
        : [];

      // Fallback: if the strict TITLE/Hook/Body/CTA parse failed but the
      // assistant returned a quoted block ≥ 40 chars (the common shape for
      // hook-only drafts), surface the quote as a single-section Hook card.
      const quotedHook = !draft && m.role === "assistant" && content
        ? extractQuotedHook(content)
        : null;
      const fallbackSections: Array<{ tag: string; body: string }> = quotedHook
        ? [{ tag: "Hook", body: quotedHook.hook }]
        : [];

      const broadcastSections = draftSections.length > 0 ? draftSections : fallbackSections;
      const broadcastTitle = draft?.title ? `Drafting: ${draft.title}` : "Hook draft";

      out.push({
        role: m.role as "user" | "assistant",
        content,
        is_progress: (m.content as any)?.is_progress === true,
        broadcast: broadcastSections.length > 0
          ? {
              scenes: [{
                type: "drafting" as const,
                verb: broadcastTitle,
                meta: "claude · live",
                payload: { sections: broadcastSections },
              }],
              narrative: "",
              embeds: [],
            }
          : undefined,
      });

      if (draft) {
        out.push({
          role: "assistant",
          content: "",
          type: "script_preview",
          script_data: {
            hook: draft.hook,
            body: draft.body,
            cta: draft.cta,
            idea_title: draft.title ?? "Untitled draft",
          } as any,
        });
      }
    }
    // Append the latest plan_proposal card as a synthetic message AFTER the
    // last assistant message (so the user sees it under Robby's reply that
    // proposed it). Cleared on approve/reject.
    if (latestPlan) {
      out.push({
        role: "assistant",
        content: "",
        type: "plan_proposal",
        plan_data: latestPlan,
      });
    }
    // Attach pending embeds (scoped to the active thread) to the most recent
    // non-progress assistant text message so the user sees thumbnail previews
    // of what Robby is referencing. Per-thread scoping prevents the bug
    // where every chat showed the same find_viral_videos cards. Set `embeds`
    // directly (not `broadcast`) so the text reply keeps its normal style —
    // AssistantChat renders embeds after the text body, not as italic
    // narrative. If a broadcast IS present (live draft scenes), merge the
    // embeds into it so the existing TurnRenderer path keeps working.
    const threadEmbeds = (activeThreadId && pendingEmbedsByThread[activeThreadId]) || [];
    if (threadEmbeds.length > 0) {
      for (let i = out.length - 1; i >= 0; i--) {
        const m = out[i];
        if (m.role === "assistant" && !m.is_progress && m.type !== "plan_proposal" && m.type !== "script_preview") {
          const existing = m.broadcast;
          out[i] = existing && existing.scenes.length > 0
            ? { ...m, broadcast: { ...existing, embeds: [...existing.embeds, ...threadEmbeds] } }
            : { ...m, embeds: [...(m.embeds ?? []), ...threadEmbeds] };
          break;
        }
      }
    }
    return out;
  }, [messages, latestPlan, pendingEmbedsByThread, activeThreadId]);

  const handleApprovePlan = useCallback(async (planId: string) => {
    setLatestPlan(null);
    await handleSend(`Yes — approve plan ${planId} and execute it.`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRejectPlan = useCallback(async (planId: string) => {
    setLatestPlan(null);
    await handleSend(`Reject plan ${planId} — don't run it.`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Send "approve and save" when the user clicks Save on an inline preview.
  // Robby has the title in conversation context — letting him call
  // save_script keeps the title source-of-truth in chat instead of the UI.
  const handleApproveScript = useCallback(async () => {
    await handleSend("Approve and save this script — use the title we just discussed.");
  }, [handleSend]);

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
    blue: "#8FD0D5",
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col min-h-0 text-white" style={{ background: "#141414" }}>
      {/* Top-right tasks toggle — no name, no back button, just the action. */}
      <header className="flex justify-end items-center px-4 py-2.5">
        <button
          onClick={() => setRightTab(rightTab === "tasks" ? "chat" : "tasks")}
          className={`flex items-center gap-1 text-xs transition-colors px-2 py-1 rounded ${
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
            {/* Chat column — chats list lives in the DashboardSidebar's
                lower half (RecentChatsPanel) so it's intentionally absent here. */}
            <main className="flex-1 flex flex-col min-w-0 min-h-0">
              {/* Empty-state layout: Claude-style — greeting + composer + chips
                  vertically centered in the viewport. Custom block (not the
                  AssistantChat's empty state) because AssistantChat's internal
                  flex-1 stretches and breaks vertical centering. As soon as the
                  user sends a message, fall through to the normal scrolling
                  chat. */}
              {chatMessages.length === 0 && !sending ? (
                <div className="flex-1 flex flex-col items-center justify-center min-h-0 overflow-y-auto px-4 py-8">
                  <div className="w-full max-w-2xl flex flex-col items-center">
                    {/* Greeting block */}
                    <FingerprintAvatar size="md" tone="light" animated />
                    <h1
                      className="mt-4 text-center font-serif"
                      style={{ fontSize: 28, lineHeight: 1.2, color: "rgba(234,230,220,0.85)", letterSpacing: "-0.01em" }}
                    >
                      {displayName
                        ? en
                          ? `What are we doing today, ${displayName}?`
                          : `¿Qué hacemos hoy, ${displayName}?`
                        : en
                          ? "What are we doing today?"
                          : "¿Qué hacemos hoy?"}
                    </h1>
                    <p
                      className="mt-2 text-center"
                      style={{ fontSize: 13, color: "rgba(234,230,220,0.45)" }}
                    >
                      {en
                        ? "Ask anything about your pipeline, scripts, or clients."
                        : "Pregunta lo que sea sobre tu pipeline, scripts o clientes."}
                    </p>

                    {/* Composer with mode pill on its own row inside the card */}
                    <div className="w-full mt-6">
                      <AssistantTextInput
                        value={input}
                        onChange={setInput}
                        onSend={handleSend}
                        onStop={sending ? stopGeneration : undefined}
                        loading={sending}
                        variant="full"
                        placeholder={en ? "Ask anything..." : "Pregunta lo que sea..."}
                        bottomSlot={<CompactModeSelect mode={autonomyMode} setMode={setAutonomyMode} />}
                        onToggleVoice={toggleVoice}
                        recognizing={recognizing}
                        selectedModel={selectedModel}
                        models={AI_MODELS}
                        onModelChange={setSelectedModel}
                        thinkingEnabled={thinkingEnabled}
                        onToggleThinking={() => setThinkingEnabled((v) => !v)}
                        imageMode={imageMode}
                        onToggleImageMode={() => setImageMode((v) => !v)}
                        isResearchMode={isResearchMode}
                        onToggleResearchMode={() => setIsResearchMode((v) => !v)}
                        pastedImage={pastedImage}
                        onClearPastedImage={() => setPastedImage(null)}
                        onPaste={handlePaste}
                        mentionableNodes={mentionableNodes}
                        mentionIconMap={mentionIconMap}
                        mentionLabelMap={mentionLabelMap}
                      />
                    </div>

                    {/* Suggestion chips below the textbox, Claude-style. */}
                    <div className="flex flex-wrap gap-2 mt-4 justify-center">
                      {SUGGESTIONS.map((s) => (
                        <button
                          key={s}
                          onClick={() => setInput(s)}
                          className="assistant-chip text-[11px] px-3 py-1.5"
                          style={{
                            color: "rgba(255,255,255,0.6)",
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.08)",
                            borderRadius: 999,
                            transition: "background 160ms ease, border-color 160ms ease, color 160ms ease",
                          }}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <>
              <div className="flex-1 min-h-0 flex flex-col">
                <AssistantChat
                  messages={chatMessages}
                  loading={sending}
                  variant="full"
                  onSaveScript={handleApproveScript}
                  onApprovePlan={handleApprovePlan}
                  onRejectPlan={handleRejectPlan}
                  thinkingVerb={currentScene?.verb ?? null}
                  thinkingMeta={currentScene?.meta ?? null}
                  greeting={
                    displayName
                      ? en
                        ? `What are we doing today, ${displayName}?`
                        : `¿Qué hacemos hoy, ${displayName}?`
                      : en
                        ? "What are we doing today?"
                        : "¿Qué hacemos hoy?"
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
                  onStop={sending ? stopGeneration : undefined}
                  loading={sending}
                  variant="full"
                  placeholder={
                    en
                      ? "Ask anything..."
                      : "Pregunta lo que sea..."
                  }
                  bottomSlot={<CompactModeSelect mode={autonomyMode} setMode={setAutonomyMode} />}
                  onToggleVoice={toggleVoice}
                  recognizing={recognizing}
                  selectedModel={selectedModel}
                  models={AI_MODELS}
                  onModelChange={setSelectedModel}
                  thinkingEnabled={thinkingEnabled}
                  onToggleThinking={() => setThinkingEnabled((v) => !v)}
                  imageMode={imageMode}
                  onToggleImageMode={() => setImageMode((v) => !v)}
                  isResearchMode={isResearchMode}
                  onToggleResearchMode={() => setIsResearchMode((v) => !v)}
                  pastedImage={pastedImage}
                  onClearPastedImage={() => setPastedImage(null)}
                  onPaste={handlePaste}
                  mentionableNodes={mentionableNodes}
                  mentionIconMap={mentionIconMap}
                  mentionLabelMap={mentionLabelMap}
                  promptPresets={[
                    {
                      name: en ? "Morning brief" : "Resumen del día",
                      description: en
                        ? "What changed since yesterday + open alerts"
                        : "Qué cambió desde ayer + alertas pendientes",
                      prompt: en
                        ? "Give me my morning brief — what changed in the last 24h and what needs my attention today?"
                        : "Dame mi resumen del día — qué cambió en las últimas 24h y qué necesita mi atención hoy.",
                    },
                    {
                      name: en ? "What's stuck?" : "¿Qué está atorado?",
                      description: en
                        ? "Overdue edits, stale leads, scripts not recorded"
                        : "Edits vencidos, leads viejos, scripts sin grabar",
                      prompt: en
                        ? "Show me everything that's stuck or overdue across my clients."
                        : "Muéstrame todo lo que está atorado o vencido en mis clientes.",
                    },
                    {
                      name: en ? "Weekly plan" : "Plan semanal",
                      description: en
                        ? "Generate a 5-day content plan for one client"
                        : "Genera un plan de 5 días para un cliente",
                      prompt: en
                        ? "Generate a 5-day content plan for [client name]."
                        : "Genera un plan de 5 días para [nombre del cliente].",
                    },
                    {
                      name: en ? "Build a script" : "Construir un script",
                      description: en
                        ? "End-to-end: idea → framework → script → schedule"
                        : "De principio a fin: idea → framework → script → calendario",
                      prompt: en
                        ? "Let's build a script for [client name]."
                        : "Construyamos un script para [nombre del cliente].",
                    },
                    {
                      name: en ? "Catch me up on a client" : "Ponme al día sobre un cliente",
                      description: en
                        ? "Status, recent activity, what's next"
                        : "Estado, actividad reciente, próximos pasos",
                      prompt: en
                        ? "Catch me up on [client name] — recent activity and what's next."
                        : "Ponme al día sobre [nombre del cliente] — actividad reciente y próximos pasos.",
                    },
                  ]}
                />
              </div>
                </>
              )}
            </main>

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
