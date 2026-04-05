import { useState, useMemo, useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { Folder, FolderOpen, Upload } from "lucide-react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useViewport,
  addEdge,
  type Node,
  type Edge,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

import VideoNode from "@/components/canvas/VideoNode";
import TextNoteNode from "@/components/canvas/TextNoteNode";
import ResearchNoteNode from "@/components/canvas/ResearchNoteNode";
import AIAssistantNode from "@/components/canvas/AIAssistantNode";
import HookGeneratorNode from "@/components/canvas/HookGeneratorNode";
import BrandGuideNode from "@/components/canvas/BrandGuideNode";
import CTABuilderNode from "@/components/canvas/CTABuilderNode";
import CompetitorProfileNode from "@/components/canvas/CompetitorProfileNode";
import MediaNode from "@/components/canvas/MediaNode";
import GroupNode from "@/components/canvas/GroupNode";
import AnnotationNode from "@/components/canvas/AnnotationNode";
import OnboardingFormNode from "@/components/canvas/OnboardingFormNode";
import MobileCanvasView from "@/components/canvas/MobileCanvasView";
import FullscreenAIView from "@/components/canvas/FullscreenAIView";
import ViralVideoPickerModal from "@/components/canvas/ViralVideoPickerModal";
import CanvasToolbar from "@/components/canvas/CanvasToolbar";
import CanvasTutorial from "@/components/canvas/CanvasTutorial";
import { type SessionItem } from "@/components/canvas/CanvasToolbar";
import { useScripts } from "@/hooks/useScripts";
import { useTheme } from "@/hooks/useTheme";
import { canvasMediaService } from "@/services/canvasMediaService";

const AI_NODE_ID = "ai-assistant";

// Keys to strip from node data before saving (non-serializable callbacks + heavy ephemeral data)
const CALLBACK_KEYS = ["onUpdate", "onDelete", "onFormatChange", "onLanguageChange", "onModelChange", "onSaveScript", "onAddVideoNode"];
// Keys stripped to reduce memory pressure — large objects re-fetched at runtime
const HEAVY_DATA_KEYS = ["canvasContext", "canvasContextRef", "authToken", "signedUrl"];

interface Client { id: string; name?: string; target?: string; }

interface RemixVideo {
  id: string;
  url: string | null;
  thumbnail_url: string | null;
  caption: string | null;
  channel_username: string;
  platform: string;
  formatDetection?: {
    format: string;
    confidence: number;
    wizard_config: {
      suggested_format?: string;
      prompt_hint?: string;
      use_transcript_as_template?: boolean;
    };
  } | null;
}

interface IncomingViralVideo {
  id: string;
  channel_username: string;
  platform: string;
  video_url: string | null;
  thumbnail_url: string | null;
  caption: string | null;
  views_count: number;
  outlier_score: number;
  engagement_rate: number;
}

interface Props {
  selectedClient: Client;
  onCancel: () => void;
  remixVideo?: RemixVideo;
  incomingVideos?: IncomingViralVideo[];
  onIncomingConsumed?: () => void;
}

const CANVAS_ACCEPTED_MIME = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "video/mp4", "video/quicktime", "video/webm",
  "audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/m4a", "audio/aac", "audio/wav", "audio/webm", "audio/ogg",
]);

const nodeTypes = {
  videoNode: VideoNode,
  textNoteNode: TextNoteNode,
  researchNoteNode: ResearchNoteNode,
  aiAssistantNode: AIAssistantNode,
  hookGeneratorNode: HookGeneratorNode,
  brandGuideNode: BrandGuideNode,
  ctaBuilderNode: CTABuilderNode,
  instagramProfileNode: CompetitorProfileNode,  // alias — backward compat for saved sessions
  competitorProfileNode: CompetitorProfileNode,
  mediaNode: MediaNode,
  groupNode: GroupNode,
  annotationNode: AnnotationNode,
  onboardingFormNode: OnboardingFormNode,
};

function getInitialPosition(existingCount: number) {
  return { x: 60 + (existingCount % 3) * 380, y: 80 + Math.floor(existingCount / 3) * 360 };
}

/** Return center of the current viewport in flow coordinates, with small random jitter to avoid stacking */
function getViewportCenter(viewport: { x: number; y: number; zoom: number }): { x: number; y: number } {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const centerX = (-viewport.x + w / 2) / viewport.zoom;
  const centerY = (-viewport.y + h / 2) / viewport.zoom;
  // Small random offset so multiple adds don't stack perfectly
  const jitter = () => (Math.random() - 0.5) * 60;
  return { x: Math.round(centerX + jitter()), y: Math.round(centerY + jitter()) };
}

/** Strip non-serializable fields and heavy ephemeral data from node data for persistence.
 *  This prevents multi-MB JSON snapshots that crash Chrome with OOM (Error code 5). */
function serializeNodes(nodes: Node[]): any[] {
  const STRIP_KEYS = new Set([...CALLBACK_KEYS, ...HEAVY_DATA_KEYS]);
  return nodes.map(n => {
    const filtered = Object.fromEntries(
      Object.entries(n.data || {}).filter(([k]) => !STRIP_KEYS.has(k))
    );
    // For competitor profile nodes, strip thumbnail URLs from posts (re-fetched on load)
    if ((n.type === "competitorProfileNode" || n.type === "instagramProfileNode") && Array.isArray(filtered.posts)) {
      filtered.posts = filtered.posts.map((p: any) => ({ ...p, thumbnail: null }));
    }
    return {
      id: n.id,
      type: n.type,
      position: n.position,
      width: n.width,
      height: n.height,
      deletable: n.deletable,
      parentId: n.parentId,
      expandParent: n.expandParent,
      data: filtered,
    };
  });
}

/** Reorder nodes so parent group nodes always precede their children (ReactFlow requirement) */
function ensureParentOrder(nodes: Node[]): Node[] {
  const groups = nodes.filter(n => n.type === "groupNode");
  const others = nodes.filter(n => n.type !== "groupNode");
  return [...groups, ...others];
}

/** Tiny memory monitor — shows Chrome heap usage in corner (Chrome-only API) */
function MemoryMonitor() {
  const [mem, setMem] = useState("");
  useEffect(() => {
    const perf = (performance as any);
    if (!perf.memory) return; // not Chrome
    const update = () => {
      const m = perf.memory;
      const used = (m.usedJSHeapSize / 1024 / 1024).toFixed(0);
      const total = (m.totalJSHeapSize / 1024 / 1024).toFixed(0);
      const limit = (m.jsHeapSizeLimit / 1024 / 1024).toFixed(0);
      setMem(`${used}/${total}MB (limit ${limit}MB)`);
    };
    update();
    const id = setInterval(update, 3000);
    return () => clearInterval(id);
  }, []);
  if (!mem) return null;
  return (
    <div className="fixed bottom-2 left-2 z-[9999] text-[9px] font-mono px-1.5 py-0.5 rounded bg-black/60 text-white/50 pointer-events-none select-none">
      Heap: {mem}
    </div>
  );
}

/** Wrapper that provides ReactFlowProvider context */
export default function SuperPlanningCanvas(props: Props) {
  const { isAdmin } = useAuth();
  return (
    <ReactFlowProvider>
      {isAdmin && <MemoryMonitor />}
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}

// ─── Drawing path type ───
interface DrawPath {
  id: string;
  points: [number, number][];
  color: string;
  width: number;
}

function CanvasInner({ selectedClient, onCancel, remixVideo, incomingVideos, onIncomingConsumed }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [format, setFormat] = useState("talking_head");
  const [language, setLanguage] = useState<"en" | "es">("en");
  const [aiModel, setAiModel] = useState(() => {
    try { return localStorage.getItem("cc_canvas_aiModel") || "claude-haiku-4-5"; } catch { return "claude-haiku-4-5"; }
  });
  const [loaded, setLoaded] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showViralPicker, setShowViralPicker] = useState(false);
  const [draftScriptId, setDraftScriptId] = useState<string | null>(null);

  const [sessions, setSessions] = useState<SessionItem[]>([]);
  // activeSessionId React state mirrors activeSessionIdRef so the sidebar re-renders on switch
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionStorageUsed, setSessionStorageUsed] = useState(0);

  // ─── Drawing state ───
  const [drawingMode, setDrawingMode] = useState(false);
  const [drawPaths, setDrawPaths] = useState<DrawPath[]>([]);
  const [currentPath, setCurrentPath] = useState<[number, number][] | null>(null);
  const [drawColor, setDrawColor] = useState("hsl(210, 8%, 10%)");
  const [drawWidth, setDrawWidth] = useState(3);
  // ─── Context menu for group/ungroup ───
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; type: "selection" | "group"; groupId?: string } | null>(null);
  const [isDragOverCanvas, setIsDragOverCanvas] = useState(false);
  const dragOverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drawPathsRef = useRef<DrawPath[]>([]);
  const viewportRef = useRef<{ x: number; y: number; zoom: number }>({ x: 0, y: 0, zoom: 1 });
  const canvasContextRef = useRef<any>(null);
  const { directSave } = useScripts();
  const { theme } = useTheme();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userIdRef = useRef<string | null>(null);
  const nodesRef = useRef<Node[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  const clientIdRef = useRef(selectedClient.id);
  useEffect(() => { clientIdRef.current = selectedClient.id; }, [selectedClient.id]);
  const draftIdRef = useRef<string | null>(null);
  const remixInjectedRef = useRef(false);
  const incomingInjectedRef = useRef(false);
  const activeSessionIdRef = useRef<string | null>(null);
  const isSwitchingSessionRef = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthToken(session?.access_token || null);
      userIdRef.current = session?.user?.id || null;
    });
  }, []);

  // ─── Auto-create or load draft script ───
  useEffect(() => {
    if (!authToken || !userIdRef.current) return;
    const userId = userIdRef.current;
    const lsKey = `canvas_last_script_${userId}_${selectedClient.id}`;
    const ensureDraft = async () => {
      // 1. Check for existing in-progress draft
      const { data: existingList } = await supabase
        .from("scripts")
        .select("id")
        .eq("client_id", selectedClient.id)
        .eq("canvas_user_id", userId)
        .eq("status", "draft")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1);
      const existing = existingList?.[0] ?? null;
      if (existing) {
        setDraftScriptId(existing.id);
        draftIdRef.current = existing.id;
        return;
      }
      // 2. No draft — check if we have a previously saved canvas script for this client
      // so subsequent saves update the same queue entry instead of creating duplicates
      const lastScriptId = localStorage.getItem(lsKey);
      if (lastScriptId) {
        const { data: lastScript } = await supabase
          .from("scripts")
          .select("id")
          .eq("id", lastScriptId)
          .is("deleted_at", null)
          .maybeSingle();
        if (lastScript) {
          setDraftScriptId(lastScript.id);
          draftIdRef.current = lastScript.id;
          return;
        }
        localStorage.removeItem(lsKey);
      }
      // 3. Create a new draft script
      const { data: created } = await supabase
        .from("scripts")
        .insert({
          client_id: selectedClient.id,
          title: "Connecta AI — In Progress",
          raw_content: "",
          status: "draft",
          canvas_user_id: userId,
        })
        .select("id")
        .single();
      if (created) {
        setDraftScriptId(created.id);
        draftIdRef.current = created.id;
      }
    };
    ensureDraft();
  }, [authToken, selectedClient.id]);

  const loadSessions = useCallback(async () => {
    if (!userIdRef.current) return;
    const { data } = await supabase
      .from("canvas_states")
      .select("id, name, is_active, updated_at")
      .eq("client_id", selectedClient.id)
      .eq("user_id", userIdRef.current)
      .order("updated_at", { ascending: false });
    if (data) setSessions(data as SessionItem[]);
  }, [selectedClient.id]);

  /** Refresh session storage usage (bytes used in canvas_media for active session) */
  const refreshStorageUsage = useCallback(async () => {
    const sid = activeSessionIdRef.current;
    if (!sid) return;
    const { data } = await supabase
      .from("canvas_media")
      .select("file_size_bytes")
      .eq("session_id", sid);
    const used = (data || []).reduce((sum: number, r: any) => sum + (r.file_size_bytes || 0), 0);
    setSessionStorageUsed(used);
  }, []);

  /** Re-attach callbacks to content nodes */
  const attachCallbacks = useCallback((nodeList: Node[]): Node[] => {
    return nodeList.map(n => {
      // Always stamp current client + session onto the AI node when loading from DB
      if (n.id === AI_NODE_ID) return {
        ...n,
        data: {
          ...n.data,
          clientId: selectedClient.id,
          nodeId: activeSessionIdRef.current || AI_NODE_ID,
        },
      };
      const nodeId = n.id;

      // ── GroupNode: completely custom callbacks (no authToken/clientId needed) ──
      if (n.type === "groupNode") {
        return {
          ...n,
          data: {
            ...n.data,
            childCount: nodeList.filter(nd => nd.parentId === nodeId).length,
            onUpdate: (updates: any) =>
              setNodes(ns => ns.map(nd => nd.id === nodeId ? { ...nd, data: { ...nd.data, ...updates } } : nd)),
            onDelete: () => {
              setNodes(ns => {
                const groupPos = ns.find(nd => nd.id === nodeId)?.position ?? { x: 0, y: 0 };
                const childCount = ns.filter(nd => nd.parentId === nodeId).length;
                if (childCount > 0 && !window.confirm(`This group has ${childCount} node(s). Delete the group? (Nodes will be released)`)) return ns;
                const updated = ns.map(nd => {
                  if (nd.parentId === nodeId) {
                    return { ...nd, parentId: undefined, expandParent: undefined, position: { x: nd.position.x + groupPos.x, y: nd.position.y + groupPos.y } };
                  }
                  return nd;
                });
                return updated.filter(nd => nd.id !== nodeId);
              });
              setEdges(es => es.filter(e => e.source !== nodeId && e.target !== nodeId));
            },
          },
        };
      }

      // ── All other nodes: standard callbacks ──
      const extra: Record<string, any> = {};
      if (n.type === "mediaNode") {
        extra.sessionId = activeSessionIdRef.current;
        extra.nodeId = nodeId;
      }
      if (n.type === "competitorProfileNode" || n.type === "instagramProfileNode") {
        extra.onAddVideoNode = (url: string) => {
          const newId = `videoNode_${Date.now()}`;
          const sourceNode = nodesRef.current.find(nd => nd.id === nodeId);
          const pos = sourceNode
            ? { x: sourceNode.position.x + (sourceNode.measured?.width ?? 480) + 48, y: sourceNode.position.y }
            : getViewportCenter(viewportRef.current);
          setNodes(ns => [...ns, {
            id: newId,
            type: "videoNode",
            position: pos,
            width: 240,
            data: {
              authToken,
              clientId: selectedClient.id,
              nodeId: newId,
              sessionId: activeSessionIdRef.current,
              url,
              onUpdate: (updates: any) =>
                setNodes(prev => prev.map(nd => nd.id === newId ? { ...nd, data: { ...nd.data, ...updates } } : nd)),
              onDelete: () => {
                setNodes(prev => prev.filter(nd => nd.id !== newId));
                setEdges(es => es.filter(e => e.source !== newId && e.target !== newId));
              },
            },
          }]);
          toast.success("VideoNode added — click Analyze to transcribe it");
        };
      }
      // MediaNode needs cleanup: delete storage file + canvas_media row on remove
      const onDeleteCb = n.type === "mediaNode"
        ? () => {
            const nd = nodesRef.current.find(x => x.id === nodeId);
            const mediaId = (nd?.data as any)?.mediaId;
            const storagePath = (nd?.data as any)?.storagePath;
            if (mediaId && storagePath) {
              canvasMediaService.deleteMedia(mediaId, storagePath).catch(() => {});
            }
            setNodes(ns => ns.filter(x => x.id !== nodeId));
            setEdges(es => es.filter(e => e.source !== nodeId && e.target !== nodeId));
          }
        : () => {
            setNodes(ns => ns.filter(x => x.id !== nodeId));
            setEdges(es => es.filter(e => e.source !== nodeId && e.target !== nodeId));
          };
      return {
        ...n,
        data: {
          ...n.data,
          authToken,
          clientId: selectedClient.id,
          ...extra,
          onUpdate: (updates: any) =>
            setNodes(ns => ns.map(nd => nd.id === nodeId ? { ...nd, data: { ...nd.data, ...updates } } : nd)),
          onDelete: onDeleteCb,
        },
      };
    });
  }, [authToken, selectedClient.id, setNodes, setEdges]);

  /** Create a brand new blank session, deactivate the current one */
  const newChat = useCallback(async () => {
    if (!userIdRef.current) return;
    isSwitchingSessionRef.current = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    // Clear saved script pointer so this new session creates a fresh queue entry on save
    localStorage.removeItem(`canvas_last_script_${userIdRef.current}_${selectedClient.id}`);
    try {
      // Deactivate previous session first (required by partial unique index)
      const prevId = activeSessionIdRef.current;
      if (prevId) {
        await supabase.from("canvas_states").update({ is_active: false }).eq("id", prevId);
      }

      // Insert new blank session
      const { data: newSession } = await supabase
        .from("canvas_states")
        .insert({
          client_id: selectedClient.id,
          user_id: userIdRef.current,
          nodes: [],
          edges: [],
          draw_paths: [],
          name: "New chat",
          is_active: true,
        })
        .select("id")
        .single();

      if (newSession) {
        activeSessionIdRef.current = newSession.id;
        setActiveSessionId(newSession.id);
        lastSavedJsonRef.current = "";
        setNodes([makeAiNode()]);
        setEdges([]);
        setDrawPaths([]);
        await loadSessions();
      }
    } finally {
      // Always unblock saves, even if an error occurred
      isSwitchingSessionRef.current = false;
    }
  }, [selectedClient.id, loadSessions]);

  /** Switch to an existing session */
  const switchSession = useCallback(async (session: SessionItem) => {
    if (session.id === activeSessionIdRef.current) return;
    isSwitchingSessionRef.current = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    try {
      // Deactivate previous first, then activate new (partial index constraint)
      const prevId = activeSessionIdRef.current;
      if (prevId) {
        await supabase.from("canvas_states").update({ is_active: false }).eq("id", prevId);
      }
      await supabase.from("canvas_states").update({ is_active: true }).eq("id", session.id);

      // Load canvas data BEFORE updating the active session ref.
      const { data } = await supabase
        .from("canvas_states")
        .select("nodes, edges, draw_paths")
        .eq("id", session.id)
        .single();

      // Only commit the session switch after we have confirmed the data loaded
      activeSessionIdRef.current = session.id;
      setActiveSessionId(session.id);

      if (data) {
        const restoredNodes = ensureParentOrder(attachCallbacks((data.nodes as Node[]) || []));
        if (!restoredNodes.some(n => n.id === AI_NODE_ID)) restoredNodes.push(makeAiNode());
        // Enforce minimum size on AI node for existing sessions
        const aiIdx = restoredNodes.findIndex(n => n.id === AI_NODE_ID);
        if (aiIdx !== -1) {
          const ai = restoredNodes[aiIdx];
          if ((ai.width ?? 0) < 680) restoredNodes[aiIdx] = { ...ai, width: 680 };
          if ((ai.height ?? 0) < 780) restoredNodes[aiIdx] = { ...restoredNodes[aiIdx], height: 780 };
        }
        lastSavedJsonRef.current = "";
        setNodes(restoredNodes);
        setEdges((data.edges as Edge[]) || []);
        setDrawPaths(Array.isArray((data as any).draw_paths) ? (data as any).draw_paths : []);
      }

      await loadSessions();
    } finally {
      // Always unblock saves, even if an error occurred
      isSwitchingSessionRef.current = false;
    }
  }, [loadSessions, attachCallbacks]);

  /** Rename a session inline */
  const renameSession = useCallback(async (id: string, name: string) => {
    await supabase.from("canvas_states").update({ name }).eq("id", id);
    setSessions(prev => prev.map(s => s.id === id ? { ...s, name } : s));
  }, []);

  /** Delete a session; if it was active, switch to the next most recent or create fresh. */
  const deleteSession = useCallback(async (id: string) => {
    const wasActive = id === activeSessionIdRef.current;

    // Clean up storage files for this session's media before deleting the row
    const { data: mediaFiles } = await supabase
      .from("canvas_media")
      .select("storage_path")
      .eq("session_id", id);
    if (mediaFiles?.length) {
      const paths = mediaFiles.map(m => m.storage_path);
      await supabase.storage.from("canvas-media").remove(paths);
    }
    // canvas_media rows auto-deleted via ON DELETE CASCADE

    await supabase.from("canvas_states").delete().eq("id", id);

    if (wasActive) {
      // Fetch fresh remaining sessions from DB — do not rely on stale React state closure
      const { data: remaining } = await supabase
        .from("canvas_states")
        .select("id, name, is_active, updated_at")
        .eq("client_id", clientIdRef.current)
        .eq("user_id", userIdRef.current!)
        .order("updated_at", { ascending: false });
      const list = remaining || [];
      if (list.length > 0) {
        await switchSession(list[0] as SessionItem);
      } else {
        await newChat();
      }
    } else {
      setSessions(prev => prev.filter(s => s.id !== id));
    }
  }, [switchSession, newChat]);

  const handleFormatChange = useCallback((f: string) => setFormat(f), []);
  const handleLanguageChange = useCallback((l: "en" | "es") => setLanguage(l), []);
  const handleModelChange = useCallback((m: string) => {
    setAiModel(m);
    try { localStorage.setItem("cc_canvas_aiModel", m); } catch { /* ignore */ }
  }, []);

  const handleSaveScript = useCallback(async (generatedScript: any) => {
    try {
      // Use the first connected video node's URL as the inspiration source
      const inspirationUrl = canvasContextRef.current?.video_sources?.[0]?.url || undefined;
      const saved = await directSave({
        clientId: selectedClient.id,
        existingScriptId: draftIdRef.current || undefined,
        lines: generatedScript.lines.map((l: any, i: number) => ({
          line_number: i + 1,
          line_type: l.line_type,
          section: l.section,
          text: l.text,
        })),
        ideaGanadora: generatedScript.idea_ganadora,
        target: generatedScript.target,
        formato: generatedScript.formato,
        viralityScore: generatedScript.virality_score,
        inspirationUrl,
      });
      if (saved) {
        toast.success("Script saved! Find it in the Scripts list.", { duration: 5000 });
        // Update draft ref + persist to localStorage so next session reuses same queue entry
        draftIdRef.current = saved.scriptId;
        setDraftScriptId(saved.scriptId);
        const lsKey = `canvas_last_script_${userIdRef.current}_${selectedClient.id}`;
        localStorage.setItem(lsKey, saved.scriptId);
        // Do NOT call onSaved — canvas stays open, no navigation
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to save script");
      throw e;
    }
  }, [selectedClient.id, directSave]);

  // Stable wrapper: prevents useScripts() directSave reference changes from triggering
  // the AI node sync effect on every render (was causing infinite render loop → OOM crash)
  const handleSaveScriptRef = useRef(handleSaveScript);
  handleSaveScriptRef.current = handleSaveScript;
  const stableSaveScript = useCallback(
    async (generatedScript: any) => handleSaveScriptRef.current(generatedScript),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  /** Re-attach callbacks to content nodes */
  // ─── Load saved canvas state on mount (waits for auth) ───
  useEffect(() => {
    if (!authToken) return; // wait for auth to load
    const loadCanvas = async () => {
      // Immediately wipe stale nodes/context from previous client so the AI panel
      // never reads another client's video nodes during the async DB load window
      setNodes([]);
      setLoaded(false);
      (window as any).__canvasNodes = [];
      (window as any).__canvasEdges = [];
      (window as any).__canvasContext = null;

      const userId = userIdRef.current;
      if (!userId) {
        setNodes([makeAiNode()]);
        setLoaded(true);
        return;
      }
      try {
        // Fetch session metadata only (no heavy node/edge data) for the sidebar list
        const { data: allSessions } = await supabase
          .from("canvas_states")
          .select("id, name, is_active, updated_at")
          .eq("client_id", selectedClient.id)
          .eq("user_id", userId)
          .order("updated_at", { ascending: false });

        // Prefer the explicitly-active session; fall back to the most recent one
        const activeMeta = allSessions?.find(s => s.is_active) ?? allSessions?.[0] ?? null;

        if (activeMeta) {
          // Store session id for all future saves
          activeSessionIdRef.current = activeMeta.id;
          setActiveSessionId(activeMeta.id);

          // Ensure this session is marked active (may have been deactivated by a previous switch)
          if (!activeMeta.is_active) {
            await supabase.from("canvas_states").update({ is_active: true }).eq("id", activeMeta.id);
          }

          // Fetch heavy data ONLY for the active session
          const { data: activeData } = await supabase
            .from("canvas_states")
            .select("nodes, edges, draw_paths")
            .eq("id", activeMeta.id)
            .single();

          if (activeData && Array.isArray(activeData.nodes) && activeData.nodes.length > 0) {
            const restoredNodes = ensureParentOrder(attachCallbacks(activeData.nodes as Node[]));
            if (!restoredNodes.some(n => n.id === AI_NODE_ID)) restoredNodes.push(makeAiNode());
            // Enforce minimum size on AI node for existing sessions
            const aiIdx = restoredNodes.findIndex(n => n.id === AI_NODE_ID);
            if (aiIdx !== -1) {
              const ai = restoredNodes[aiIdx];
              if ((ai.width ?? 0) < 680) restoredNodes[aiIdx] = { ...ai, width: 680 };
              if ((ai.height ?? 0) < 780) restoredNodes[aiIdx] = { ...restoredNodes[aiIdx], height: 780 };
            }
            setNodes(restoredNodes);
            setEdges((activeData.edges as Edge[]) || []);
            if (Array.isArray(activeData.draw_paths)) setDrawPaths(activeData.draw_paths as DrawPath[]);
          } else {
            setNodes([makeAiNode()]);
          }
        } else {
          // No active session — create a fresh blank one (is_active: true required by partial unique index)
          const { data: newSession } = await supabase
            .from("canvas_states")
            .insert({
              client_id: selectedClient.id,
              user_id: userId,
              nodes: [],
              edges: [],
              draw_paths: [],
              name: "New chat",
              is_active: true,
            })
            .select("id")
            .single();
          if (newSession) {
            activeSessionIdRef.current = newSession.id;
            setActiveSessionId(newSession.id);
          }
          setNodes([makeAiNode()]);
        }

        // Single source of truth for the sessions sidebar list
        await loadSessions();
        refreshStorageUsage();
      } catch {
        setNodes([makeAiNode()]);
      }
      setLoaded(true);

      // Remix injection (unchanged logic)
      if (remixVideo?.url && !remixInjectedRef.current) {
        remixInjectedRef.current = true;
        const nodeId = `videoNode_remix_${Date.now()}`;
        const position = getInitialPosition(0);
        const remixNode: Node = {
          id: nodeId,
          type: "videoNode",
          position,
          width: 240,
          data: {
            url: remixVideo.url,
            autoTranscribe: true,
            channel_username: remixVideo.channel_username,
            caption: remixVideo.caption ?? undefined,
            authToken,
            clientId: selectedClient.id,
            onUpdate: (updates: any) =>
              setNodes(ns => ns.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n)),
            onDelete: () => {
              setNodes(ns => ns.filter(n => n.id !== nodeId));
              setEdges(es => es.filter(e => e.source !== nodeId && e.target !== nodeId));
            },
          },
        };
        setNodes(prev => [...prev, remixNode]);
      }

      // Batch incoming videos injection (from Viral Today → BatchScriptModal)
      if (incomingVideos && incomingVideos.length >= 2 && !incomingInjectedRef.current) {
        incomingInjectedRef.current = true;
        const ts = Date.now();

        // Find rightmost existing node to position group to the right
        const currentNodes = nodesRef.current;
        let maxX = 0;
        for (const n of currentNodes) {
          const nx = (n.position?.x ?? 0) + (n.width ?? 240);
          if (nx > maxX) maxX = nx;
        }
        const groupX = maxX + 100;
        const groupY = 100;
        const groupId = `group_viral_batch_${ts}`;

        // Create group node
        const groupNode: Node = {
          id: groupId,
          type: "groupNode",
          position: { x: groupX, y: groupY },
          width: 300,
          height: 120 + incomingVideos.length * 280,
          data: {
            label: `Viral Batch \u00B7 ${incomingVideos.length} videos`,
            onUpdate: (updates: any) =>
              setNodes(ns => ns.map(n => n.id === groupId ? { ...n, data: { ...n.data, ...updates } } : n)),
            onDelete: () => {
              setNodes(ns => ns.filter(n => n.id !== groupId && n.parentId !== groupId));
              setEdges(es => es.filter(e => e.source !== groupId && e.target !== groupId));
            },
          },
        };

        // Create video nodes inside the group
        const videoNodes: Node[] = incomingVideos.map((v, i) => {
          const nodeId = `videoNode_batch_${ts}_${i}`;
          return {
            id: nodeId,
            type: "videoNode",
            position: { x: 30, y: 60 + i * 280 },
            width: 240,
            parentId: groupId,
            extent: "parent" as const,
            data: {
              url: v.video_url,
              autoTranscribe: true,
              channel_username: v.channel_username,
              caption: v.caption ?? undefined,
              platform: v.platform,
              thumbnailUrl: v.thumbnail_url,
              outlierScore: v.outlier_score,
              viewsCount: v.views_count,
              authToken,
              clientId: selectedClient.id,
              onUpdate: (updates: any) =>
                setNodes(ns => ns.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n)),
              onDelete: () => {
                setNodes(ns => ns.filter(n => n.id !== nodeId));
                setEdges(es => es.filter(e => e.source !== nodeId && e.target !== nodeId));
              },
            },
          };
        });

        // Group must come before its children in the array
        setNodes(prev => [...prev, groupNode, ...videoNodes]);

        // Notify parent so it can clear navigation state
        onIncomingConsumed?.();

        // Auto-message to AI after a brief delay for nodes to render
        const usernames = incomingVideos.map(v => `@${v.channel_username}`).join(", ");
        setTimeout(() => {
          (window as any).__canvasAutoMessage = `I just added ${incomingVideos.length} viral videos to the canvas: ${usernames}. Analyze them and ask me what direction I want for the scripts.`;
        }, 2000);
      }
    };

    loadCanvas();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClient.id, authToken, loadSessions]);

  function makeAiNode(): Node {
    return {
      id: AI_NODE_ID,
      type: "aiAssistantNode",
      position: { x: 760, y: 60 },
      width: 680,
      height: 780,
      deletable: false,
      data: {
        canvasContextRef,
        clientInfo: { name: selectedClient.name, target: selectedClient.target },
        clientId: selectedClient.id,
        nodeId: activeSessionIdRef.current || AI_NODE_ID,
        authToken,
        format,
        language,
        aiModel,
        onFormatChange: handleFormatChange,
        onLanguageChange: handleLanguageChange,
        onModelChange: handleModelChange,
        onSaveScript: stableSaveScript,
      },
    };
  }

  // ─── Keep refs in sync for unmount save ───
  // Also expose on window so CanvasAIPanel can build fresh context at send-time
  useEffect(() => { nodesRef.current = nodes; (window as any).__canvasNodes = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; (window as any).__canvasEdges = edges; }, [edges]);
  useEffect(() => { (window as any).__canvasSaveScript = stableSaveScript; }, [stableSaveScript]);

  // Expose research node creation for CanvasAIPanel "Save to Canvas" button
  useEffect(() => {
    (window as any).__canvasAddResearchNode = (topic: string, facts: Array<{ fact: string; impact_score: number }>) => {
      const nodeId = `researchNoteNode_${Date.now()}`;
      const aiNode = nodesRef.current.find((n: any) => n.id === AI_NODE_ID);
      const position = aiNode
        ? { x: (aiNode.position?.x ?? 860) - 360, y: (aiNode.position?.y ?? 60) + 80 }
        : getViewportCenter(viewportRef.current);
      const newNode = {
        id: nodeId,
        type: "researchNoteNode",
        position,
        width: 320,
        data: {
          authToken,
          clientId: selectedClient.id,
          nodeId,
          sessionId: activeSessionIdRef.current,
          topic,
          facts,
          onUpdate: (updates: any) =>
            setNodes((ns: any[]) => ns.map((n: any) => n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n)),
          onDelete: () => {
            setNodes((ns: any[]) => ns.filter((n: any) => n.id !== nodeId));
            setEdges((es: any[]) => es.filter((e: any) => e.source !== nodeId && e.target !== nodeId));
          },
        },
      };
      setNodes((prev: any[]) => [...prev, newNode]);
    };
  }, [authToken, selectedClient.id, setNodes, setEdges]);
  useEffect(() => { drawPathsRef.current = drawPaths; }, [drawPaths]);

  // Expose competitor post transcription for CanvasAIPanel auto-transcribe feature
  useEffect(() => {
    (window as any).__canvasTranscribeCompetitorPost = async (username: string, postIndex: number): Promise<string | null> => {
      const node = nodesRef.current.find((n: any) =>
        (n.type === "competitorProfileNode" || n.type === "instagramProfileNode") &&
        String(n.data?.username || "").toLowerCase() === String(username).toLowerCase()
      );
      if (!node) return null;
      const posts: any[] = node.data?.posts || [];
      const post = posts[postIndex];
      if (!post?.url) return null;
      // Skip if already transcribed
      if (post.transcription) return post.transcription;
      try {
        const { data: result, error } = await supabase.functions.invoke("transcribe-video", {
          body: { url: post.url },
        });
        if (error || !result?.transcription) return null;
        const transcription: string = result.transcription;
        // Persist into node state
        setNodes((ns: any[]) => ns.map((n2: any) => {
          if (n2.id !== node.id) return n2;
          const updated = [...(n2.data?.posts || [])];
          updated[postIndex] = { ...updated[postIndex], transcription };
          return { ...n2, data: { ...n2.data, posts: updated } };
        }));
        window.dispatchEvent(new Event("credits-updated"));
        return transcription;
      } catch { return null; }
    };
  }, [setNodes]);

  // ─── Robust save system ───
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const pendingSaveRef = useRef(false);
  const lastSavedJsonRef = useRef<string>("");
  const isDirtyRef = useRef(false);
  const IDLE_TIMEOUT = 60_000; // 60 seconds
  const lastActivityRef = useRef(Date.now());

  /** Core save function — deduplicates via lightweight hash comparison (not full snapshot) */
  const saveCanvas = useCallback(async (force = false) => {
    if (isSwitchingSessionRef.current) return;          // session switch in progress
    if (!userIdRef.current) return;
    if (!activeSessionIdRef.current) return;             // not yet loaded
    if (nodesRef.current.length === 0) return;
    // Skip serialization if not dirty (prevents 2-5MB temp string during idle)
    if (!force && !isDirtyRef.current) return;
    const serializedNodes = serializeNodes(nodesRef.current);
    // Use lightweight hash instead of keeping multi-MB snapshot in memory
    const snapshot = JSON.stringify({ n: serializedNodes, e: edgesRef.current, d: drawPathsRef.current });
    const snapshotHash = `${snapshot.length}:${snapshot.slice(0, 128)}:${snapshot.slice(-128)}`;
    if (!force && snapshotHash === lastSavedJsonRef.current) return;
    pendingSaveRef.current = true;
    setSaveStatus("saving");
    try {
      await supabase.from("canvas_states").upsert({
        id: activeSessionIdRef.current,
        client_id: clientIdRef.current,
        user_id: userIdRef.current,
        nodes: serializedNodes,
        edges: edgesRef.current,
        draw_paths: drawPathsRef.current,
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
      lastSavedJsonRef.current = snapshotHash; // store hash, not full snapshot
      pendingSaveRef.current = false;
      isDirtyRef.current = false;
      setSaveStatus("saved");
    } catch (e) {
      console.error("[Canvas] Save failed:", e);
      setSaveStatus("error");
    }
  }, []);

  /** Sync save using fetch keepalive for tab close — last resort, no await */
  const beaconSave = useCallback(() => {
    if (isSwitchingSessionRef.current) return;
    if (!userIdRef.current || !activeSessionIdRef.current) return;
    if (nodesRef.current.length === 0) return;
    if (!isDirtyRef.current) return; // skip if nothing changed
    const serializedNodes = serializeNodes(nodesRef.current);
    const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/canvas_states?on_conflict=id`;
    const body = JSON.stringify({
      id: activeSessionIdRef.current,
      client_id: clientIdRef.current,
      user_id: userIdRef.current,
      nodes: serializedNodes,
      edges: edgesRef.current,
      draw_paths: drawPathsRef.current,
      updated_at: new Date().toISOString(),
    });
    const headers = {
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    };
    try {
      fetch(url, { method: "POST", headers, body, keepalive: true });
    } catch {
      // last resort — nothing more we can do
    }
  }, []);

  // ─── Mark dirty when canvas state changes (lightweight — actual comparison done in saveCanvas) ───
  useEffect(() => {
    if (!loaded) return;
    isDirtyRef.current = true;
  }, [nodes, edges, drawPaths, loaded]);

  // ─── Track user activity for idle-aware saves (throttled to 1Hz) ───
  useEffect(() => {
    let lastFired = 0;
    const markActive = () => {
      const now = Date.now();
      if (now - lastFired < 1000) return; // throttle: max once per second
      lastFired = now;
      const wasIdle = now - lastActivityRef.current > IDLE_TIMEOUT;
      lastActivityRef.current = now;
      // If returning from idle, trigger a catch-up save
      if (wasIdle && isDirtyRef.current) saveCanvas();
    };
    window.addEventListener("mousemove", markActive, { passive: true });
    window.addEventListener("keydown", markActive, { passive: true });
    return () => {
      window.removeEventListener("mousemove", markActive);
      window.removeEventListener("keydown", markActive);
    };
  }, [saveCanvas]);

  // ─── Auto-save (debounced 2s — balances data safety vs memory pressure) ───
  useEffect(() => {
    if (!loaded || !userIdRef.current) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (Date.now() - lastActivityRef.current < IDLE_TIMEOUT) saveCanvas();
    }, 2000);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [nodes, edges, drawPaths, loaded, selectedClient.id, saveCanvas]);

  // ─── Periodic auto-save every 30 seconds as safety net ───
  useEffect(() => {
    if (!loaded || !userIdRef.current) return;
    const interval = setInterval(() => {
      if (isDirtyRef.current && Date.now() - lastActivityRef.current < IDLE_TIMEOUT) saveCanvas();
    }, 30_000);
    return () => clearInterval(interval);
  }, [loaded, saveCanvas]);

  // ─── Save on tab close / navigate away ───
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      beaconSave();
      // Always show browser "Leave page?" prompt — canvas always has active work
      e.preventDefault();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        beaconSave();
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [beaconSave]);

  // ─── Save on unmount (component teardown on route change) ───
  useEffect(() => {
    return () => { beaconSave(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Edge-aware context: only nodes connected (via edges) to AI node feed context (either direction)
  const canvasContext = useMemo(() => {
    // AI sees ALL canvas nodes — no edge-based filtering
    const contextNodes = nodes.filter(n => n.id !== AI_NODE_ID);
    console.log("[CanvasContext] contextNodes:", contextNodes.length, "types:", contextNodes.map(n => n.type));

    const videoNodes = contextNodes.filter(n => n.type === "videoNode");
    const textNoteNodes = contextNodes.filter(n => n.type === "textNoteNode");
    const researchNodes = contextNodes.filter(n => n.type === "researchNoteNode");
    const hookNodes = contextNodes.filter(n => n.type === "hookGeneratorNode");
    const brandNodes = contextNodes.filter(n => n.type === "brandGuideNode");
    const ctaNodes = contextNodes.filter(n => n.type === "ctaBuilderNode");
    const instagramProfileNodes = contextNodes.filter(
      n => (n.type === "instagramProfileNode" || n.type === "competitorProfileNode") &&
      (n.data as any).status === "done" &&
      ((n.data as any).posts?.length ?? 0) > 0
    );
    const mediaNodes = contextNodes.filter(n => n.type === "mediaNode" && !!(n.data as any).mediaId);
    const onboardingNodes = contextNodes.filter(
      n => n.type === "onboardingFormNode" && (n.data as any).status === "done"
    );

    // IMPORTANT: filter first, then map both arrays from the same set to keep indexes aligned
    // Include nodes with transcription, videoAnalysis, OR structure (structure-only = visual breakdown exists)
    const videoNodesWithTranscript = videoNodes.filter(n => !!(n.data as any).transcription || !!(n.data as any).videoAnalysis || !!(n.data as any).structure);

    // Helper to get group label for a node
    const groupSuffix = (nodeId: string) => {
      const node = nodes.find(nd => nd.id === nodeId);
      if (!node?.parentId) return "";
      const group = nodes.find(nd => nd.id === node.parentId);
      const label = (group?.data as any)?.label;
      return label ? ` [in group: "${label}"]` : "";
    };

    // Build a node inventory so the AI always knows what's connected even before data loads
    const nodeInventory = [
      ...videoNodes.map(n => {
        const d = n.data as any;
        const hasTranscript = !!d.transcription;
        const hasAnalysis = !!d.videoAnalysis;
        const hasStructure = !!d.structure;
        const username = d.channel_username ? `@${d.channel_username}` : null;
        const label = username || (d.url ? "video" : "video node");
        if (hasTranscript || hasAnalysis || hasStructure) return `VideoNode(${label}, transcription=${hasTranscript}, visual_analysis=${hasAnalysis}, structure=${hasStructure})${groupSuffix(n.id)}`;
        return `VideoNode(${label}, status=loading_or_empty)${groupSuffix(n.id)}`;
      }),
      ...textNoteNodes.map(n => `TextNote(${(n.data as any).noteText ? "has_content" : "empty"})${groupSuffix(n.id)}`),
      ...researchNodes.map(n => `ResearchNode(topic="${(n.data as any).topic || "none"}", facts=${((n.data as any).facts || []).length})${groupSuffix(n.id)}`),
      ...hookNodes.map(n => `HookGeneratorNode${groupSuffix(n.id)}`),
      ...brandNodes.map(n => `BrandGuideNode${groupSuffix(n.id)}`),
      ...ctaNodes.map(n => `CTABuilderNode${groupSuffix(n.id)}`),
      ...instagramProfileNodes.map(n => `CompetitorNode(@${(n.data as any).username || "unknown"}, posts=${((n.data as any).posts || []).length})${groupSuffix(n.id)}`),
      ...mediaNodes.map(n => {
        const d = n.data as any;
        const label = d.fileType === "pdf"
          ? `PDFNode(${d.fileName || "unnamed"}, text_extracted=${d.transcriptionStatus === "done" ? "yes" : "no"})`
          : `MediaNode(${d.fileName || "unnamed"}, type=${d.fileType}, transcription=${d.transcriptionStatus === "done" ? "yes" : "no"})`;
        return label + groupSuffix(n.id);
      }),
      ...onboardingNodes.map(n => `OnboardingFormNode(status=loaded)${groupSuffix(n.id)}`),
    ];

    return {
      connected_nodes: nodeInventory,
      transcriptions: [
        ...videoNodesWithTranscript.slice(0, 8).map(n => { // Cap at 8 video transcriptions
          const d = n.data as any;
          if (d.transcription) return (d.transcription as string).slice(0, 3000); // Cap each at 3KB
          if (d.structure?.sections?.length) {
            return d.structure.sections.map((s: any) => `[${s.section?.toUpperCase()}] ${s.actor_text || ""}`).join("\n").slice(0, 3000);
          }
          return "";
        }),
        // Include audio transcriptions from uploaded media nodes (cap at 4)
        ...mediaNodes
          .filter(n => !!(n.data as any).audioTranscription)
          .slice(0, 4)
          .map(n => `[${(n.data as any).fileName}]: ${((n.data as any).audioTranscription as string).slice(0, 2000)}`),
      ],
      structures: videoNodesWithTranscript.map(n => {
        const d = n.data as any;
        if (!d.structure) return null;
        const sel: string[] = d.selectedSections || ["hook", "body", "cta"];
        return { ...d.structure, sections: (d.structure.sections || []).filter((s: any) => sel.includes(s.section)) };
      }),
      video_sources: videoNodesWithTranscript.map(n => ({
        channel_username: (n.data as any).channel_username ?? null,
        url: (n.data as any).url ?? null,
      })),
      video_analyses: videoNodesWithTranscript
        .filter(n => !!(n.data as any).videoAnalysis)
        .slice(0, 6) // Cap at 6 video analyses
        .map(n => {
          const va = (n.data as any).videoAnalysis;
          return {
            detected_format: (n.data as any).structure?.detected_format ?? null,
            visual_segments: (va.visual_segments || []).slice(0, 10), // 10 segments max (was 20)
            audio: va.audio || null,
          };
        }),
      text_notes: textNoteNodes.map(n => (n.data as any).noteText || "").filter(Boolean).join("\n\n"),
      research_facts: researchNodes.flatMap(n => (n.data as any).facts || []),
      primary_topic: (researchNodes[0]?.data as any)?.topic || "",
      selected_hook: (hookNodes[0]?.data as any)?.selectedHook ?? null,
      selected_hook_category: (hookNodes[0]?.data as any)?.selectedCategory ?? null,
      brand_guide: brandNodes.length > 0 ? {
        tone: (brandNodes[0].data as any).tone ?? null,
        brand_values: (brandNodes[0].data as any).brand_values ?? null,
        forbidden_words: (brandNodes[0].data as any).forbidden_words ?? null,
        tagline: (brandNodes[0].data as any).tagline ?? null,
      } : null,
      selected_cta: (ctaNodes[0]?.data as any)?.selectedCTA ?? null,
      competitor_profiles: instagramProfileNodes.length > 0
        ? instagramProfileNodes.slice(0, 4).map(n => { // Cap at 4 competitor profiles
            const d = n.data as any;
            const posts: any[] = d.posts || [];
            const hookPatterns = [...new Set(posts.map((p: any) => p.hookType).filter(Boolean))].slice(0, 10) as string[];
            const contentThemes = [...new Set(posts.map((p: any) => p.contentTheme).filter(Boolean))].slice(0, 10) as string[];
            const topPosts = posts
              .sort((a: any, b: any) => (b.outlier_score ?? 0) - (a.outlier_score ?? 0))
              .slice(0, 3); // Was 5, now 3
            return { username: d.username || "unknown", top_posts: topPosts, hook_patterns: hookPatterns, content_themes: contentThemes };
          })
        : null,
      media_files: mediaNodes.length > 0
        ? mediaNodes.slice(0, 8).map(n => { // Cap at 8 media files
            const d = n.data as any;
            return {
              file_name: d.fileName || "unnamed",
              file_type: d.fileType as "image" | "video" | "voice",
              audio_transcription: d.audioTranscription ? (d.audioTranscription as string).slice(0, 2000) : null,
              visual_transcription: d.visualTranscription || null,
              signed_url: d.fileType === "image" ? d.signedUrl : null,
            };
          })
        : null,
      client_onboarding: onboardingNodes.length > 0 ? (() => {
        const od = (onboardingNodes[0].data as any).onboarding_data ?? {};
        return {
          instagram: od.instagram || null,
          tiktok: od.tiktok || null,
          youtube: od.youtube || null,
          facebook: od.facebook || null,
          industry: od.industryOther || od.industry || null,
          package: od.package || null,
          unique_offer: od.uniqueOffer || null,
          unique_values: od.uniqueValues || null,
          story: od.story || null,
          competition: od.competition || null,
          target_client: od.targetClient || null,
          top_profiles: od.top3Profiles || null,
          additional_notes: od.additionalNotes || null,
        };
      })() : null,
    };
  }, [nodes, edges]);

  // Keep canvasContext ref up to date (used by AI node at send-time, not stored on node data)
  // Also expose on window so CanvasAIPanel can always read the freshest context
  // regardless of memo/re-render timing issues
  useEffect(() => {
    canvasContextRef.current = canvasContext;
    (window as any).__canvasContext = canvasContext;
    console.log("[CanvasContext] ref updated. connected_nodes:", canvasContext.connected_nodes?.length, "transcriptions:", canvasContext.transcriptions?.length, "structures:", canvasContext.structures?.length);
  }, [canvasContext]);

  // Sync token + format + language + model to AI node
  // NOTE: canvasContext is intentionally NOT in this effect to avoid an infinite loop:
  //   nodes → canvasContext (useMemo) → setNodes → nodes → canvasContext → …
  // Instead, canvasContext is passed via canvasContextRef and read at send-time.
  useEffect(() => {
    setNodes(ns => ns.map(n =>
      n.id === AI_NODE_ID
        ? {
            ...n,
            data: {
              ...n.data,
              clientId: selectedClient.id,
              nodeId: activeSessionId || AI_NODE_ID,
              clientInfo: { name: selectedClient.name, target: selectedClient.target },
              canvasContextRef,
              authToken,
              format,
              language,
              aiModel,
              remixMode: !!remixVideo,
              remixContext: remixVideo ? {
                channel_username: remixVideo.channel_username,
                format: remixVideo.formatDetection?.format ?? null,
                prompt_hint: remixVideo.formatDetection?.wizard_config?.prompt_hint ?? null,
              } : null,
              onFormatChange: handleFormatChange,
              onLanguageChange: handleLanguageChange,
              onModelChange: handleModelChange,
              onSaveScript: stableSaveScript,
            },
          }
        : n
    ));
  }, [authToken, format, language, aiModel, remixVideo, handleFormatChange, handleLanguageChange, handleModelChange, stableSaveScript, setNodes, selectedClient.id, selectedClient.name, selectedClient.target, activeSessionId]);

  const onConnect = useCallback((connection: Connection) => {
    setEdges(eds => addEdge({
      ...connection,
      id: `e-${Date.now()}`,
      animated: true,
      style: { stroke: "hsl(44 75% 87%)", strokeWidth: 1.5, strokeOpacity: 0.7 },
    }, eds));
  }, [setEdges]);

  const addNode = useCallback((type: "videoNode" | "textNoteNode" | "researchNoteNode" | "hookGeneratorNode" | "brandGuideNode" | "ctaBuilderNode" | "instagramProfileNode" | "competitorProfileNode" | "mediaNode" | "groupNode" | "annotationNode" | "onboardingFormNode") => {
    const nodeId = `${type}_${Date.now()}`;
    const position = getViewportCenter(viewportRef.current);

    const initialWidth = type === "videoNode" ? 240
      : type === "textNoteNode" ? 288
      : type === "researchNoteNode" ? 320
      : type === "hookGeneratorNode" ? 300
      : type === "brandGuideNode" ? 280
      : type === "ctaBuilderNode" ? 300
      : (type === "instagramProfileNode" || type === "competitorProfileNode") ? 480
      : type === "mediaNode" ? 280
      : type === "groupNode" ? 400
      : type === "annotationNode" ? 200
      : type === "onboardingFormNode" ? 280
      : 288;
    const isGroup = type === "groupNode";
    const isAnnotation = type === "annotationNode";
    const newNode: Node = {
      id: nodeId,
      type,
      position,
      width: initialWidth,
      ...(isGroup ? { height: 300, style: { width: 400, height: 300 } } : {}),
      ...(isAnnotation ? { height: 60, style: { width: 200, height: 60 } } : {}),
      data: isGroup
        ? {
            label: "New Group",
            childCount: 0,
            onUpdate: (updates: any) =>
              setNodes(ns => ns.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n)),
            onDelete: () => {
              setNodes(ns => {
                const groupPos = ns.find(nd => nd.id === nodeId)?.position ?? { x: 0, y: 0 };
                const childCount = ns.filter(nd => nd.parentId === nodeId).length;
                if (childCount > 0 && !window.confirm(`This group has ${childCount} node(s). Delete the group? (Nodes will be released)`)) return ns;
                const updated = ns.map(nd => {
                  if (nd.parentId === nodeId) {
                    return { ...nd, parentId: undefined, expandParent: undefined, position: { x: nd.position.x + groupPos.x, y: nd.position.y + groupPos.y } };
                  }
                  return nd;
                });
                return updated.filter(nd => nd.id !== nodeId);
              });
              setEdges(es => es.filter(e => e.source !== nodeId && e.target !== nodeId));
            },
          }
        : {
            authToken,
            clientId: selectedClient.id,
            nodeId,
            sessionId: activeSessionIdRef.current,
            onUpdate: (updates: any) =>
              setNodes(ns => ns.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n)),
            onDelete: type === "mediaNode"
              ? () => {
                  const nd = nodesRef.current.find(x => x.id === nodeId);
                  const mediaId = (nd?.data as any)?.mediaId;
                  const storagePath = (nd?.data as any)?.storagePath;
                  if (mediaId && storagePath) {
                    canvasMediaService.deleteMedia(mediaId, storagePath).catch(() => {});
                  }
                  setNodes(ns => ns.filter(x => x.id !== nodeId));
                  setEdges(es => es.filter(e => e.source !== nodeId && e.target !== nodeId));
                }
              : () => {
                  setNodes(ns => ns.filter(n => n.id !== nodeId));
                  setEdges(es => es.filter(e => e.source !== nodeId && e.target !== nodeId));
                },
          },
    };
    // Groups go to the front of the array for parent-before-child ordering
    if (isGroup) {
      setNodes(prev => [newNode, ...prev]);
    } else {
      setNodes(prev => [...prev, newNode]);
    }
  }, [nodes, authToken, selectedClient.id, setNodes, setEdges]);

  const { zoomIn, zoomOut, fitView, screenToFlowPosition, getInternalNode, getIntersectingNodes } = useReactFlow();

  const handleCanvasDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOverCanvas(false);

    // Ignore if dropping onto an existing node (let the node handle it)
    if ((e.target as HTMLElement).closest('.react-flow__node')) return;

    const file = Array.from(e.dataTransfer.files)[0];
    if (!file || !CANVAS_ACCEPTED_MIME.has(file.type)) return;

    if (!activeSessionIdRef.current) {
      toast.error("No active session — save the canvas first.");
      return;
    }

    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const nodeId = `mediaNode_${Date.now()}`;

    const newNode: Node = {
      id: nodeId,
      type: "mediaNode",
      position,
      width: 280,
      data: {
        authToken,
        clientId: selectedClient.id,
        nodeId,
        sessionId: activeSessionIdRef.current,
        initialFile: file,
        onUpdate: (updates: any) =>
          setNodes(ns => ns.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n)),
        onDelete: () => {
          const nd = nodesRef.current.find(x => x.id === nodeId);
          const mediaId = (nd?.data as any)?.mediaId;
          const storagePath = (nd?.data as any)?.storagePath;
          if (mediaId && storagePath) {
            canvasMediaService.deleteMedia(mediaId, storagePath).catch(() => {});
          }
          setNodes(ns => ns.filter(x => x.id !== nodeId));
          setEdges(es => es.filter(e => e.source !== nodeId && e.target !== nodeId));
        },
      },
    };

    setNodes(prev => [...prev, newNode]);
  }, [screenToFlowPosition, authToken, selectedClient.id, activeSessionIdRef, nodesRef, setNodes, setEdges]);
  const viewport = useViewport();
  // Keep viewport ref in sync so callbacks defined earlier can access current viewport
  useEffect(() => { viewportRef.current = viewport; }, [viewport]);

  // ─── Auto-fit group to its children ───
  const GPAD = 40; // padding around children
  const HEADER_H = 36; // header row height
  const autoFitGroup = useCallback((groupId: string) => {
    setNodes(ns => {
      const children = ns.filter(n => n.parentId === groupId);
      if (children.length === 0) return ns;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const c of children) {
        const w = c.measured?.width ?? (c as any).width ?? 250;
        const h = c.measured?.height ?? (c as any).height ?? 150;
        minX = Math.min(minX, c.position.x);
        minY = Math.min(minY, c.position.y);
        maxX = Math.max(maxX, c.position.x + w);
        maxY = Math.max(maxY, c.position.y + h);
      }
      const newW = maxX - minX + GPAD * 2;
      const newH = maxY - minY + GPAD * 2 + HEADER_H;
      const offsetX = minX - GPAD;
      const offsetY = minY - GPAD - HEADER_H;
      return ns.map(n => {
        if (n.id === groupId) {
          return {
            ...n,
            position: { x: n.position.x + offsetX, y: n.position.y + offsetY },
            style: { ...n.style, width: Math.max(newW, 200), height: Math.max(newH, 150) },
          };
        }
        if (n.parentId === groupId) {
          return { ...n, position: { x: n.position.x - offsetX, y: n.position.y - offsetY } };
        }
        return n;
      });
    });
  }, [setNodes]);

  // ─── Group drag-to-add/remove tracking ───
  const dragOutThresholdRef = useRef<string | null>(null);
  // Capture parent's original dimensions at drag start (before expandParent grows the group)
  const dragParentBoundsRef = useRef<{ w: number; h: number } | null>(null);

  const handleNodeDragStart = useCallback((_event: React.MouseEvent, node: Node) => {
    if (node.parentId) {
      const parent = getInternalNode(node.parentId);
      dragParentBoundsRef.current = parent ? {
        w: parent.measured?.width ?? 400,
        h: parent.measured?.height ?? 300,
      } : null;
      // Disable expandParent during drag so the group doesn't grow to swallow the node
      setNodes(ns => ns.map(n => n.id === node.id ? { ...n, expandParent: false } : n));
    } else {
      dragParentBoundsRef.current = null;
    }
  }, [getInternalNode, setNodes]);

  const handleNodeDrag = useCallback((_event: React.MouseEvent, draggedNode: Node) => {
    // Skip groups, AI node
    if (draggedNode.type === "groupNode" || draggedNode.id === AI_NODE_ID) {
      setNodes(ns => ns.map(n => n.type === "groupNode" && (n.data as any).isDropTarget ? { ...n, data: { ...n.data, isDropTarget: false } } : n));
      return;
    }

    // Check if this child is being dragged out of its parent group
    if (draggedNode.parentId && dragParentBoundsRef.current) {
      const { w: parentW, h: parentH } = dragParentBoundsRef.current;
      const pos = draggedNode.position;
      const threshold = 50;
      const isOutside = pos.x < -threshold || pos.y < -threshold || pos.x > parentW + threshold || pos.y > parentH + threshold;
      dragOutThresholdRef.current = isOutside ? draggedNode.id : null;
    }

    // Visual drop indicator for groups
    const intersecting = getIntersectingNodes(draggedNode);
    const targetGroup = intersecting
      .filter(n => n.type === "groupNode" && n.id !== draggedNode.parentId)
      .sort((a, b) => ((a.measured?.width ?? 400) * (a.measured?.height ?? 300)) - ((b.measured?.width ?? 400) * (b.measured?.height ?? 300)))[0];

    setNodes(ns => ns.map(n => {
      if (n.type !== "groupNode") return n;
      const shouldHighlight = targetGroup?.id === n.id;
      if ((n.data as any).isDropTarget !== shouldHighlight) {
        return { ...n, data: { ...n.data, isDropTarget: shouldHighlight } };
      }
      return n;
    }));
  }, [getInternalNode, getIntersectingNodes, setNodes]);

  const handleNodeDragStop = useCallback((_event: React.MouseEvent, draggedNode: Node) => {
    // Clear all drop indicators
    setNodes(ns => ns.map(n => n.type === "groupNode" && (n.data as any).isDropTarget ? { ...n, data: { ...n.data, isDropTarget: false } } : n));
    dragParentBoundsRef.current = null;

    // Skip groups, AI node
    if (draggedNode.type === "groupNode" || draggedNode.id === AI_NODE_ID) return;

    // ── CASE 1: Drag OUT of a group ──
    if (draggedNode.parentId && dragOutThresholdRef.current === draggedNode.id) {
      const nodeInternal = getInternalNode(draggedNode.id);
      const absPos = nodeInternal?.internals?.positionAbsolute ?? draggedNode.position;
      const oldParentId = draggedNode.parentId;

      setNodes(ns => {
        const updated = ns.map(n => {
          if (n.id === draggedNode.id) {
            return { ...n, parentId: undefined, expandParent: undefined, position: absPos };
          }
          if (n.id === oldParentId) {
            const newCount = ns.filter(nd => nd.parentId === oldParentId && nd.id !== draggedNode.id).length;
            return { ...n, data: { ...n.data, childCount: newCount } };
          }
          return n;
        });
        return updated;
      });
      // Re-fit the group we just left
      setTimeout(() => autoFitGroup(oldParentId), 50);
      dragOutThresholdRef.current = null;
      return;
    }
    dragOutThresholdRef.current = null;

    // ── CASE 2: Drag INTO a group ──
    const intersecting = getIntersectingNodes(draggedNode);
    const targetGroup = intersecting
      .filter(n => n.type === "groupNode" && n.id !== draggedNode.parentId)
      .sort((a, b) => ((a.measured?.width ?? 400) * (a.measured?.height ?? 300)) - ((b.measured?.width ?? 400) * (b.measured?.height ?? 300)))[0];

    if (!targetGroup) {
      // Child moved within its existing group — re-enable expandParent and re-fit
      if (draggedNode.parentId) {
        setNodes(ns => ns.map(n => n.id === draggedNode.id ? { ...n, expandParent: true } : n));
        setTimeout(() => autoFitGroup(draggedNode.parentId!), 50);
      }
      return;
    }

    const groupInternal = getInternalNode(targetGroup.id);
    const nodeInternal = getInternalNode(draggedNode.id);
    if (!groupInternal || !nodeInternal) return;

    const groupAbsPos = groupInternal.internals?.positionAbsolute ?? targetGroup.position;
    const nodeAbsPos = nodeInternal.internals?.positionAbsolute ?? draggedNode.position;
    const relativePos = { x: nodeAbsPos.x - groupAbsPos.x, y: nodeAbsPos.y - groupAbsPos.y };

    const prevParentId = draggedNode.parentId;
    setNodes(ns => {
      const updated = ns.map(n => {
        if (n.id === draggedNode.id) {
          return { ...n, parentId: targetGroup.id, expandParent: true, position: relativePos };
        }
        if (n.id === targetGroup.id) {
          const newCount = ns.filter(nd => nd.parentId === targetGroup.id).length + 1;
          return { ...n, data: { ...n.data, childCount: newCount } };
        }
        if (prevParentId && n.id === prevParentId) {
          const newCount = ns.filter(nd => nd.parentId === prevParentId && nd.id !== draggedNode.id).length;
          return { ...n, data: { ...n.data, childCount: newCount } };
        }
        return n;
      });
      return ensureParentOrder(updated);
    });
    // Auto-fit the target group (and old parent if applicable)
    setTimeout(() => {
      autoFitGroup(targetGroup.id);
      if (prevParentId) autoFitGroup(prevParentId);
    }, 50);
  }, [getInternalNode, getIntersectingNodes, setNodes, autoFitGroup]);

  // ─── Context menu handlers for group/ungroup ───
  const handleSelectionContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    const selectedNodes = nodesRef.current.filter(n => n.selected && n.type !== "groupNode" && n.id !== AI_NODE_ID);
    if (selectedNodes.length < 2) return;
    setContextMenu({ x: event.clientX, y: event.clientY, type: "selection" });
  }, []);

  const handleNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    if (node.type !== "groupNode") return;
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, type: "group", groupId: node.id });
  }, []);

  const handleGroupSelected = useCallback(() => {
    setContextMenu(null);
    const selectedNodes = nodesRef.current.filter(n => n.selected && n.type !== "groupNode" && n.id !== AI_NODE_ID);
    if (selectedNodes.length < 2) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of selectedNodes) {
      const internal = getInternalNode(n.id);
      const absPos = internal?.internals?.positionAbsolute ?? n.position;
      const w = n.measured?.width ?? (n as any).width ?? 200;
      const h = n.measured?.height ?? (n as any).height ?? 150;
      minX = Math.min(minX, absPos.x);
      minY = Math.min(minY, absPos.y);
      maxX = Math.max(maxX, absPos.x + w);
      maxY = Math.max(maxY, absPos.y + h);
    }

    const padding = 40;
    const groupX = minX - padding;
    const groupY = minY - padding;
    const groupW = maxX - minX + padding * 2;
    const groupH = maxY - minY + padding * 2;
    const groupId = `groupNode_${Date.now()}`;

    setNodes(ns => {
      const groupNode: Node = {
        id: groupId,
        type: "groupNode",
        position: { x: groupX, y: groupY },
        width: groupW,
        height: groupH,
        style: { width: groupW, height: groupH },
        data: {
          label: "New Group",
          childCount: selectedNodes.length,
          onUpdate: (updates: any) =>
            setNodes(nns => nns.map(nd => nd.id === groupId ? { ...nd, data: { ...nd.data, ...updates } } : nd)),
          onDelete: () => {
            setNodes(nns => {
              const gPos = nns.find(nd => nd.id === groupId)?.position ?? { x: 0, y: 0 };
              const childCount = nns.filter(nd => nd.parentId === groupId).length;
              if (childCount > 0 && !window.confirm(`This group has ${childCount} node(s). Delete the group? (Nodes will be released)`)) return nns;
              const updated = nns.map(nd => {
                if (nd.parentId === groupId) {
                  return { ...nd, parentId: undefined, expandParent: undefined, position: { x: nd.position.x + gPos.x, y: nd.position.y + gPos.y } };
                }
                return nd;
              });
              return updated.filter(nd => nd.id !== groupId);
            });
            setEdges(es => es.filter(e => e.source !== groupId && e.target !== groupId));
          },
        },
      };

      const selectedIds = new Set(selectedNodes.map(n => n.id));
      const updated = ns.map(n => {
        if (selectedIds.has(n.id)) {
          const internal = getInternalNode(n.id);
          const absPos = internal?.internals?.positionAbsolute ?? n.position;
          return {
            ...n,
            parentId: groupId,
            expandParent: true,
            position: { x: absPos.x - groupX, y: absPos.y - groupY },
          };
        }
        return n;
      });

      return ensureParentOrder([groupNode, ...updated]);
    });
  }, [getInternalNode, setNodes]);

  const handleUngroup = useCallback(() => {
    const groupId = contextMenu?.groupId;
    setContextMenu(null);
    if (!groupId) return;

    setNodes(ns => {
      const groupNode = ns.find(n => n.id === groupId);
      const groupPos = groupNode?.position ?? { x: 0, y: 0 };
      const updated = ns.map(n => {
        if (n.parentId === groupId) {
          return { ...n, parentId: undefined, expandParent: undefined, position: { x: n.position.x + groupPos.x, y: n.position.y + groupPos.y } };
        }
        return n;
      });
      return updated.filter(n => n.id !== groupId);
    });
  }, [contextMenu, setNodes]);

  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = () => setContextMenu(null);
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") setContextMenu(null); };
    window.addEventListener("click", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => { window.removeEventListener("click", handleClick); window.removeEventListener("keydown", handleKey); };
  }, [contextMenu]);

  // ─── Paste URL → auto-create VideoNode ───
  useEffect(() => {
    const isVideoUrl = (text: string): boolean => {
      try {
        const url = new URL(text.trim());
        return ["tiktok.com", "instagram.com", "youtube.com", "youtu.be", "twitter.com", "x.com", "facebook.com", "vimeo.com"].some(h => url.hostname.includes(h));
      } catch { return false; }
    };

    const handlePaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      const text = e.clipboardData?.getData("text") || "";
      if (!isVideoUrl(text)) return;
      e.preventDefault();
      const nodeId = `videoNode_${Date.now()}`;
      const position = getViewportCenter(viewportRef.current);
      const newNode: Node = {
        id: nodeId,
        type: "videoNode",
        position,
        width: 240,
        data: {
          url: text.trim(),
          autoTranscribe: true,
          authToken,
          clientId: selectedClient.id,
          onUpdate: (updates: any) =>
            setNodes(ns => ns.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n)),
          onDelete: () => {
            setNodes(ns => ns.filter(n => n.id !== nodeId));
            setEdges(es => es.filter(e => e.source !== nodeId && e.target !== nodeId));
          },
        },
      };
      setNodes(prev => [...prev, newNode]);
      toast.success("Video added — transcribing...");
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [authToken, selectedClient.id, setNodes, setEdges]);

  // ─── Fit view to nodes after loading a session ───
  const fitViewDoneRef = useRef(false);
  useEffect(() => {
    if (!loaded) return;
    // Small delay so ReactFlow has measured the nodes
    const t = setTimeout(() => {
      fitView({ padding: 0.15, duration: 300 });
      fitViewDoneRef.current = true;
    }, 150);
    return () => clearTimeout(t);
  }, [loaded, activeSessionId, fitView]);

  // ─── Auto-show tutorial on first visit ───
  useEffect(() => {
    if (!loaded) return;
    if (!localStorage.getItem("connecta_canvas_tutorial_seen")) {
      setShowTutorial(true);
    }
  }, [loaded]);

  // ─── Await save before leaving — always warn since canvas work is always active ───
  const handleBack = useCallback(async () => {
    const ok = window.confirm("Leave the canvas? Your work is auto-saved but any unsaved AI chat messages will be saved now.");
    if (!ok) return;
    await saveCanvas(true);
    onCancel();
  }, [onCancel, saveCanvas]);

  // ─── Drawing handlers ───
  const handleDrawPointerDown = useCallback((e: ReactPointerEvent<SVGSVGElement>) => {
    if (!drawingMode) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as SVGSVGElement).setPointerCapture(e.pointerId);
    const pt = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    setCurrentPath([[pt.x, pt.y]]);
  }, [drawingMode, screenToFlowPosition]);

  const handleDrawPointerMove = useCallback((e: ReactPointerEvent<SVGSVGElement>) => {
    if (!currentPath) return;
    const pt = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    setCurrentPath(prev => prev ? [...prev, [pt.x, pt.y]] : null);
  }, [currentPath, screenToFlowPosition]);

  const handleDrawPointerUp = useCallback(() => {
    if (!currentPath || currentPath.length < 2) { setCurrentPath(null); return; }
    const newPath: DrawPath = {
      id: `draw_${Date.now()}`,
      points: currentPath,
      color: drawColor,
      width: drawWidth,
    };
    setDrawPaths(prev => [...prev, newPath]);
    setCurrentPath(null);
  }, [currentPath, drawColor, drawWidth]);

  const pathToSvgD = (points: [number, number][]) => {
    if (points.length < 2) return "";
    return points.reduce((d, [x, y], i) => {
      if (i === 0) return `M ${x} ${y}`;
      // Smooth with quadratic bezier using midpoints
      const [px, py] = points[i - 1];
      const mx = (px + x) / 2;
      const my = (py + y) / 2;
      return `${d} Q ${px} ${py} ${mx} ${my}`;
    }, "") + ` L ${points[points.length - 1][0]} ${points[points.length - 1][1]}`;
  };

  // ─── Fullscreen AI overlay ───
  const [showFullscreenAI, setShowFullscreenAI] = useState(false);

  // ─── Mobile detection ───
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  if (isMobile) {
    return (
      <MobileCanvasView
        nodes={nodes}
        selectedClient={selectedClient}
        authToken={authToken}
        format={format}
        language={language}
        aiModel={aiModel}
        canvasContextRef={canvasContextRef}
        onBack={handleBack}
        onAddNode={addNode as any}
        onFormatChange={handleFormatChange}
        onLanguageChange={handleLanguageChange}
        onModelChange={handleModelChange}
        onSaveScript={stableSaveScript}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onNewSession={newChat}
        onSwitchSession={(id: string) => {
          const s = sessions.find(s => s.id === id);
          if (s) switchSession(s);
        }}
        saveStatus={saveStatus}
        draftScriptId={draftScriptId}
        remixVideo={remixVideo}
      />
    );
  }

  return (
    <div className="flex h-full overflow-hidden" style={{ background: "#131417" }}>
      {/* Canvas area — full width, sessions in toolbar */}
      <div
        className="flex-1 relative min-w-0"
        style={{ background: "#131417" }}
        onDragOver={(e) => {
          const hasSupported = Array.from(e.dataTransfer.items).some(
            i => i.kind === "file" && CANVAS_ACCEPTED_MIME.has(i.type)
          );
          if (!hasSupported) return;
          e.preventDefault();
          setIsDragOverCanvas(true);
          // Auto-clear if dragover stops firing (e.g. moved into AI node which stops propagation)
          if (dragOverTimerRef.current) clearTimeout(dragOverTimerRef.current);
          dragOverTimerRef.current = setTimeout(() => setIsDragOverCanvas(false), 120);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            if (dragOverTimerRef.current) clearTimeout(dragOverTimerRef.current);
            setIsDragOverCanvas(false);
          }
        }}
        onDrop={handleCanvasDrop}
      >
        <CanvasToolbar
          clientName={selectedClient?.name}
          onAddNode={addNode}
          onBack={handleBack}
          onZoomIn={() => zoomIn()}
          onZoomOut={() => zoomOut()}
          onFitView={() => fitView({ padding: 0.15, duration: 300 })}
          onShowTutorial={() => setShowTutorial(true)}
          onOpenViralPicker={() => setShowViralPicker(true)}
          onOpenFullscreenAI={() => setShowFullscreenAI(true)}
          drawingMode={drawingMode}
          onToggleDrawing={() => setDrawingMode(m => !m)}
          onClearDrawing={() => setDrawPaths([])}
          drawColor={drawColor}
          onDrawColorChange={setDrawColor}
          saveStatus={saveStatus}
          sessions={sessions}
          activeSessionId={activeSessionId}
          onNewSession={newChat}
          onSwitchSession={switchSession}
          onRenameSession={renameSession}
          onDeleteSession={deleteSession}
          sessionStorageUsed={sessionStorageUsed}
        />

        {showViralPicker && (
          <ViralVideoPickerModal
            onSelect={(videoUrl, channelUsername, caption) => {
              setShowViralPicker(false);
              const nodeId = `videoNode_${Date.now()}`;
              const position = getViewportCenter(viewportRef.current);
              const newNode: Node = {
                id: nodeId,
                type: "videoNode",
                position,
                width: 240,
                data: {
                  url: videoUrl,
                  autoTranscribe: true,
                  channel_username: channelUsername,
                  caption: caption ?? undefined,
                  authToken,
                  clientId: selectedClient.id,
                  onUpdate: (updates: any) =>
                    setNodes(ns => ns.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n)),
                  onDelete: () => {
                    setNodes(ns => ns.filter(n => n.id !== nodeId));
                    setEdges(es => es.filter(e => e.source !== nodeId && e.target !== nodeId));
                  },
                },
              };
              setNodes(prev => [...prev, newNode]);
            }}
            onClose={() => setShowViralPicker(false)}
          />
        )}

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          onNodeDragStart={handleNodeDragStart}
          onNodeDrag={handleNodeDrag}
          onNodeDragStop={handleNodeDragStop}
          onSelectionContextMenu={handleSelectionContextMenu}
          onNodeContextMenu={handleNodeContextMenu}
          colorMode="dark"
          defaultEdgeOptions={{ animated: true, style: { stroke: "hsl(44 75% 87%)", strokeWidth: 1.5, strokeOpacity: 0.7 } }}
          fitView={false}
          minZoom={0.1}
          maxZoom={4}
          panOnScroll
          zoomOnScroll
          panOnDrag={[1, 2]}
          deleteKeyCode={null}
          connectOnClick
          connectionRadius={60}
          proOptions={{ hideAttribution: true }}
          style={{ background: "#131417" }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            bgColor="#131417"
            color="rgba(255,255,255,0.09)"
            gap={24}
            size={1.5}
          />
        </ReactFlow>

        {/* Drawing SVG layer — rendered paths (always visible, follows viewport) */}
        {(drawPaths.length > 0 || currentPath) && (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ zIndex: 4 }}
          >
            <g transform={`translate(${viewport.x}, ${viewport.y}) scale(${viewport.zoom})`}>
              {drawPaths.map(p => (
                <path
                  key={p.id}
                  d={pathToSvgD(p.points)}
                  stroke={p.color}
                  strokeWidth={p.width / viewport.zoom}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.85}
                />
              ))}
              {currentPath && currentPath.length > 1 && (
                <path
                  d={pathToSvgD(currentPath)}
                  stroke={drawColor}
                  strokeWidth={drawWidth / viewport.zoom}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.85}
                />
              )}
            </g>
          </svg>
        )}

        {/* Drawing interaction layer — captures pointer when drawing mode active */}
        {drawingMode && (
          <svg
            className="absolute inset-0 w-full h-full"
            style={{ zIndex: 5, cursor: "crosshair" }}
            onPointerDown={handleDrawPointerDown}
            onPointerMove={handleDrawPointerMove}
            onPointerUp={handleDrawPointerUp}
            onPointerCancel={handleDrawPointerUp}
          />
        )}

        {/* File drop overlay */}
        {isDragOverCanvas && (
          <div className="absolute inset-0 z-50 pointer-events-none flex items-center justify-center"
            style={{ background: "rgba(34,211,238,0.05)", border: "2px dashed rgba(34,211,238,0.4)" }}>
            <div className="bg-card/90 backdrop-blur-sm border border-primary/30 rounded-2xl px-8 py-6 flex flex-col items-center gap-2 shadow-xl">
              <Upload className="w-8 h-8 text-primary" />
              <p className="text-sm font-semibold text-foreground">Drop to create media node</p>
              <p className="text-xs text-muted-foreground">Images · Videos · Voice notes</p>
            </div>
          </div>
        )}
      </div>

      <CanvasTutorial open={showTutorial} onClose={() => setShowTutorial(false)} />

      {/* Fullscreen AI overlay */}
      {showFullscreenAI && (
        <FullscreenAIView
          selectedClient={selectedClient}
          activeSessionId={activeSessionId}
          nodes={nodes}
          authToken={authToken}
          format={format}
          language={language}
          aiModel={aiModel}
          canvasContextRef={canvasContextRef}
          initialDraftInput={(window as any).__canvasAIDraftInput || null}
          onClose={() => setShowFullscreenAI(false)}
          onFormatChange={handleFormatChange}
          onLanguageChange={handleLanguageChange}
          onModelChange={handleModelChange}
          onSaveScript={stableSaveScript}
        />
      )}

        {/* Context menu for Group/Ungroup */}
        {contextMenu && (
          <div
            className="fixed z-50 min-w-[160px] rounded-xl bg-card/95 backdrop-blur-md border border-border shadow-xl py-1"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={e => e.stopPropagation()}
          >
            {contextMenu.type === "selection" && (
              <>
                <div className="px-3 py-1.5 text-[10px] text-muted-foreground uppercase tracking-wider">
                  {nodesRef.current.filter(n => n.selected && n.type !== "groupNode" && n.id !== AI_NODE_ID).length} nodes selected
                </div>
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-purple-500/15 transition-colors"
                  onClick={handleGroupSelected}
                >
                  <Folder className="w-4 h-4 text-purple-400" />
                  Group Selected
                </button>
              </>
            )}
            {contextMenu.type === "group" && (
              <button
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-orange-500/15 transition-colors"
                onClick={handleUngroup}
              >
                <FolderOpen className="w-4 h-4 text-orange-400" />
                Ungroup
              </button>
            )}
          </div>
        )}
    </div>
  );
}
