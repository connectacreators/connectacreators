import { useState, useMemo, useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
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
import { toast } from "sonner";

import VideoNode from "@/components/canvas/VideoNode";
import TextNoteNode from "@/components/canvas/TextNoteNode";
import ResearchNoteNode from "@/components/canvas/ResearchNoteNode";
import AIAssistantNode from "@/components/canvas/AIAssistantNode";
import HookGeneratorNode from "@/components/canvas/HookGeneratorNode";
import BrandGuideNode from "@/components/canvas/BrandGuideNode";
import CTABuilderNode from "@/components/canvas/CTABuilderNode";
import InstagramProfileNode from "@/components/canvas/InstagramProfileNode";
import ViralVideoPickerModal from "@/components/canvas/ViralVideoPickerModal";
import CanvasToolbar from "@/components/canvas/CanvasToolbar";
import CanvasTutorial from "@/components/canvas/CanvasTutorial";
import { useScripts } from "@/hooks/useScripts";
import { useTheme } from "@/hooks/useTheme";

const AI_NODE_ID = "ai-assistant";

// Keys to strip from node data before saving (non-serializable callbacks)
const CALLBACK_KEYS = ["onUpdate", "onDelete", "onFormatChange", "onLanguageChange", "onModelChange", "onSaveScript"];

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

interface Props {
  selectedClient: Client;
  onCancel: () => void;
  remixVideo?: RemixVideo;
}

const nodeTypes = {
  videoNode: VideoNode,
  textNoteNode: TextNoteNode,
  researchNoteNode: ResearchNoteNode,
  aiAssistantNode: AIAssistantNode,
  hookGeneratorNode: HookGeneratorNode,
  brandGuideNode: BrandGuideNode,
  ctaBuilderNode: CTABuilderNode,
  instagramProfileNode: InstagramProfileNode,
};

function getInitialPosition(existingCount: number) {
  return { x: 60 + (existingCount % 3) * 380, y: 80 + Math.floor(existingCount / 3) * 360 };
}

/** Strip non-serializable fields from node data for persistence */
function serializeNodes(nodes: Node[]): any[] {
  return nodes.map(n => ({
    id: n.id,
    type: n.type,
    position: n.position,
    width: n.width,
    height: n.height,
    deletable: n.deletable,
    data: Object.fromEntries(
      Object.entries(n.data || {}).filter(([k]) => !CALLBACK_KEYS.includes(k))
    ),
  }));
}

/** Wrapper that provides ReactFlowProvider context */
export default function SuperPlanningCanvas(props: Props) {
  return (
    <ReactFlowProvider>
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

function CanvasInner({ selectedClient, onCancel, remixVideo }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [format, setFormat] = useState("talking_head");
  const [language, setLanguage] = useState<"en" | "es">("en");
  const [aiModel, setAiModel] = useState("claude-haiku-4-5");
  const [loaded, setLoaded] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showViralPicker, setShowViralPicker] = useState(false);
  const [draftScriptId, setDraftScriptId] = useState<string | null>(null);

  // ─── Drawing state ───
  const [drawingMode, setDrawingMode] = useState(false);
  const [drawPaths, setDrawPaths] = useState<DrawPath[]>([]);
  const [currentPath, setCurrentPath] = useState<[number, number][] | null>(null);
  const [drawColor, setDrawColor] = useState("#22d3ee");
  const [drawWidth, setDrawWidth] = useState(3);
  const drawPathsRef = useRef<DrawPath[]>([]);
  const canvasContextRef = useRef<any>(null);
  const { directSave } = useScripts();
  const { theme } = useTheme();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userIdRef = useRef<string | null>(null);
  const nodesRef = useRef<Node[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  const clientIdRef = useRef(selectedClient.id);
  const draftIdRef = useRef<string | null>(null);
  const remixInjectedRef = useRef(false);

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
    const ensureDraft = async () => {
      // Check for existing draft for this client+user
      const { data: existing } = await supabase
        .from("scripts")
        .select("id")
        .eq("client_id", selectedClient.id)
        .eq("canvas_user_id", userId)
        .eq("status", "draft")
        .is("deleted_at", null)
        .maybeSingle();
      if (existing) {
        setDraftScriptId(existing.id);
        draftIdRef.current = existing.id;
      } else {
        // Create a new draft script
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
      }
    };
    ensureDraft();
  }, [authToken, selectedClient.id]);

  const handleFormatChange = useCallback((f: string) => setFormat(f), []);
  const handleLanguageChange = useCallback((l: "en" | "es") => setLanguage(l), []);
  const handleModelChange = useCallback((m: string) => setAiModel(m), []);

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
        // Update draft ref to the newly-saved script ID so next edits update the same record
        draftIdRef.current = saved.scriptId;
        setDraftScriptId(saved.scriptId);
        // Do NOT call onSaved — canvas stays open, no navigation
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to save script");
      throw e;
    }
  }, [selectedClient.id, directSave]);

  /** Re-attach callbacks to content nodes */
  const attachCallbacks = useCallback((nodeList: Node[]): Node[] => {
    return nodeList.map(n => {
      if (n.id === AI_NODE_ID) return n; // AI node gets callbacks separately
      const nodeId = n.id;
      return {
        ...n,
        data: {
          ...n.data,
          authToken,
          clientId: selectedClient.id,
          onUpdate: (updates: any) =>
            setNodes(ns => ns.map(nd => nd.id === nodeId ? { ...nd, data: { ...nd.data, ...updates } } : nd)),
          onDelete: () =>
            setNodes(ns => ns.filter(nd => nd.id !== nodeId)),
        },
      };
    });
  }, [authToken, selectedClient.id, setNodes]);

  // ─── Load saved canvas state on mount (waits for auth) ───
  useEffect(() => {
    if (!authToken) return; // wait for auth to load
    const loadCanvas = async () => {
      const userId = userIdRef.current;
      if (!userId) {
        setNodes([makeAiNode()]);
        setLoaded(true);
        return;
      }
      try {
        const { data } = await supabase
          .from("canvas_states")
          .select("nodes, edges, draw_paths")
          .eq("client_id", selectedClient.id)
          .eq("user_id", userId)
          .maybeSingle();

        if (data && Array.isArray(data.nodes) && data.nodes.length > 0) {
          const restoredNodes = attachCallbacks(data.nodes as Node[]);
          const hasAiNode = restoredNodes.some(n => n.id === AI_NODE_ID);
          if (!hasAiNode) {
            restoredNodes.push(makeAiNode());
          }
          setNodes(restoredNodes);
          setEdges((data.edges as Edge[]) || []);
          if (Array.isArray((data as any).draw_paths)) setDrawPaths((data as any).draw_paths);
        } else {
          setNodes([makeAiNode()]);
        }
      } catch {
        setNodes([makeAiNode()]);
      }
      setLoaded(true);

      // Remix injection — after canvas is loaded
      if (remixVideo?.url && !remixInjectedRef.current) {
        remixInjectedRef.current = true; // set BEFORE any async operation to be race-safe
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
            onDelete: () =>
              setNodes(ns => ns.filter(n => n.id !== nodeId)),
          },
        };
        setNodes(prev => [...prev, remixNode]);
      }
    };

    loadCanvas();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClient.id, authToken]);

  function makeAiNode(): Node {
    return {
      id: AI_NODE_ID,
      type: "aiAssistantNode",
      position: { x: 860, y: 60 },
      width: 520,
      height: 700,
      deletable: false,
      data: {
        canvasContext: { transcriptions: [], structures: [], text_notes: "", research_facts: [], primary_topic: "" },
        clientInfo: { name: selectedClient.name, target: selectedClient.target },
        authToken,
        format,
        language,
        aiModel,
        onFormatChange: handleFormatChange,
        onLanguageChange: handleLanguageChange,
        onModelChange: handleModelChange,
        onSaveScript: handleSaveScript,
      },
    };
  }

  // ─── Keep refs in sync for unmount save ───
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);
  useEffect(() => { drawPathsRef.current = drawPaths; }, [drawPaths]);

  // ─── Robust save system ───
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const pendingSaveRef = useRef(false);
  const lastSavedJsonRef = useRef<string>("");
  const isDirtyRef = useRef(false);

  /** Core save function — deduplicates via JSON snapshot comparison */
  const saveCanvas = useCallback(async (force = false) => {
    if (!userIdRef.current || nodesRef.current.length === 0) return;
    const serializedNodes = serializeNodes(nodesRef.current);
    const snapshot = JSON.stringify({ n: serializedNodes, e: edgesRef.current, d: drawPathsRef.current });
    if (!force && snapshot === lastSavedJsonRef.current) return; // no changes
    pendingSaveRef.current = true;
    setSaveStatus("saving");
    try {
      await supabase.from("canvas_states").upsert({
        client_id: clientIdRef.current,
        user_id: userIdRef.current,
        nodes: serializedNodes,
        edges: edgesRef.current,
        draw_paths: drawPathsRef.current,
        updated_at: new Date().toISOString(),
      }, { onConflict: "client_id,user_id" });
      lastSavedJsonRef.current = snapshot;
      pendingSaveRef.current = false;
      isDirtyRef.current = false;
      setSaveStatus("saved");
    } catch (e) {
      console.error("[Canvas] Save failed:", e);
      setSaveStatus("error");
    }
  }, []);

  /** Sync save using sendBeacon for tab close — last resort, no await */
  const beaconSave = useCallback(() => {
    if (!userIdRef.current || nodesRef.current.length === 0) return;
    const serializedNodes = serializeNodes(nodesRef.current);
    const snapshot = JSON.stringify({ n: serializedNodes, e: edgesRef.current, d: drawPathsRef.current });
    if (snapshot === lastSavedJsonRef.current) return;
    // Use sendBeacon with Supabase REST API directly for reliability on tab close
    const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/canvas_states?on_conflict=client_id,user_id`;
    const body = JSON.stringify({
      client_id: clientIdRef.current,
      user_id: userIdRef.current,
      nodes: serializedNodes,
      edges: edgesRef.current,
      draw_paths: drawPathsRef.current,
      updated_at: new Date().toISOString(),
    });
    const blob = new Blob([body], { type: "application/json" });
    const headers = {
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    };
    // sendBeacon doesn't support custom headers — use fetch with keepalive instead
    try {
      fetch(url, { method: "POST", headers, body, keepalive: true });
    } catch {
      // last resort — nothing more we can do
    }
  }, []);

  // ─── Mark dirty when canvas state changes ───
  useEffect(() => {
    if (!loaded) return;
    const serializedNodes = serializeNodes(nodesRef.current);
    const snapshot = JSON.stringify({ n: serializedNodes, e: edgesRef.current, d: drawPathsRef.current });
    if (snapshot !== lastSavedJsonRef.current) {
      isDirtyRef.current = true;
    }
  }, [nodes, edges, drawPaths, loaded]);

  // ─── Auto-save (debounced 800ms — fast enough to not lose work) ───
  useEffect(() => {
    if (!loaded || !userIdRef.current) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveCanvas(), 800);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [nodes, edges, drawPaths, loaded, selectedClient.id, saveCanvas]);

  // ─── Periodic auto-save every 30 seconds as safety net ───
  useEffect(() => {
    if (!loaded || !userIdRef.current) return;
    const interval = setInterval(() => {
      if (isDirtyRef.current) saveCanvas();
    }, 30_000);
    return () => clearInterval(interval);
  }, [loaded, saveCanvas]);

  // ─── Save on tab close / navigate away ───
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      beaconSave();
      // Show browser "Leave page?" prompt when there are unsaved changes
      if (isDirtyRef.current) {
        e.preventDefault();
      }
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
    const connectedSrcIds = edges
      .filter(e => e.target === AI_NODE_ID || e.source === AI_NODE_ID)
      .map(e => e.target === AI_NODE_ID ? e.source : e.target);
    const contextNodes = connectedSrcIds.length > 0
      ? nodes.filter(n => connectedSrcIds.includes(n.id))
      : nodes.filter(n => n.id !== AI_NODE_ID); // fallback: all non-AI nodes

    const videoNodes = contextNodes.filter(n => n.type === "videoNode");
    const textNoteNodes = contextNodes.filter(n => n.type === "textNoteNode");
    const researchNodes = contextNodes.filter(n => n.type === "researchNoteNode");
    const hookNodes = contextNodes.filter(n => n.type === "hookGeneratorNode");
    const brandNodes = contextNodes.filter(n => n.type === "brandGuideNode");
    const ctaNodes = contextNodes.filter(n => n.type === "ctaBuilderNode");
    const instagramProfileNodes = contextNodes.filter(
      n => n.type === "instagramProfileNode" &&
      (n.data as any).status === "done" &&
      ((n.data as any).posts?.length ?? 0) > 0
    );

    // IMPORTANT: filter first, then map both arrays from the same set to keep indexes aligned
    // Include nodes with transcription, videoAnalysis, OR structure (structure-only = visual breakdown exists)
    const videoNodesWithTranscript = videoNodes.filter(n => !!(n.data as any).transcription || !!(n.data as any).videoAnalysis || !!(n.data as any).structure);

    // Build a node inventory so the AI always knows what's connected even before data loads
    const nodeInventory = [
      ...videoNodes.map(n => {
        const d = n.data as any;
        const hasTranscript = !!d.transcription;
        const hasAnalysis = !!d.videoAnalysis;
        const username = d.channel_username ? `@${d.channel_username}` : null;
        const label = username || (d.url ? "video" : "video node");
        if (hasTranscript || hasAnalysis) return `VideoNode(${label}, transcription=${hasTranscript}, visual_analysis=${hasAnalysis})`;
        return `VideoNode(${label}, status=loading_or_empty)`;
      }),
      ...textNoteNodes.map(n => `TextNote(${(n.data as any).noteText ? "has_content" : "empty"})`),
      ...researchNodes.map(n => `ResearchNode(topic="${(n.data as any).topic || "none"}", facts=${((n.data as any).facts || []).length})`),
      ...hookNodes.map(() => "HookGeneratorNode"),
      ...brandNodes.map(() => "BrandGuideNode"),
      ...ctaNodes.map(() => "CTABuilderNode"),
      ...instagramProfileNodes.map(n => `CompetitorNode(@${(n.data as any).username || "unknown"}, posts=${((n.data as any).posts || []).length})`),
    ];

    return {
      connected_nodes: nodeInventory,
      transcriptions: videoNodesWithTranscript.map(n => {
        const d = n.data as any;
        if (d.transcription) return d.transcription;
        // Fallback: reconstruct transcript-like text from structure sections
        if (d.structure?.sections?.length) {
          return d.structure.sections.map((s: any) => `[${s.section?.toUpperCase()}] ${s.actor_text || ""}`).join("\n");
        }
        return "";
      }),
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
        .map(n => {
          const va = (n.data as any).videoAnalysis;
          return {
            detected_format: (n.data as any).structure?.detected_format ?? null,
            visual_segments: va.visual_segments || [],
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
        ? instagramProfileNodes.map(n => {
            const d = n.data as any;
            const posts: any[] = d.posts || [];
            const hookPatterns = [...new Set(posts.map((p: any) => p.hookType).filter(Boolean))] as string[];
            const contentThemes = [...new Set(posts.map((p: any) => p.contentTheme).filter(Boolean))] as string[];
            return { username: d.username || "unknown", top_posts: posts, hook_patterns: hookPatterns, content_themes: contentThemes };
          })
        : null,
    };
  }, [nodes, edges]);

  // Sync canvasContext + token + format + language to AI node
  useEffect(() => {
    canvasContextRef.current = canvasContext;
    setNodes(ns => ns.map(n =>
      n.id === AI_NODE_ID
        ? {
            ...n,
            data: {
              ...n.data,
              canvasContext,
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
              onSaveScript: handleSaveScript,
            },
          }
        : n
    ));
  }, [canvasContext, authToken, format, language, aiModel, remixVideo, handleFormatChange, handleLanguageChange, handleModelChange, handleSaveScript, setNodes]);

  const onConnect = useCallback((connection: Connection) => {
    setEdges(eds => addEdge({
      ...connection,
      id: `e-${Date.now()}`,
      animated: true,
      style: { stroke: "hsl(44 75% 87%)", strokeWidth: 1.5, strokeOpacity: 0.7 },
    }, eds));
  }, [setEdges]);

  const addNode = useCallback((type: "videoNode" | "textNoteNode" | "researchNoteNode" | "hookGeneratorNode" | "brandGuideNode" | "ctaBuilderNode" | "instagramProfileNode") => {
    const nodeId = `${type}_${Date.now()}`;
    const nonAiCount = nodes.filter(n => n.id !== AI_NODE_ID).length;
    const position = getInitialPosition(nonAiCount);

    const initialWidth = type === "videoNode" ? 240
      : type === "textNoteNode" ? 288
      : type === "researchNoteNode" ? 320
      : type === "hookGeneratorNode" ? 300
      : type === "brandGuideNode" ? 280
      : type === "ctaBuilderNode" ? 300
      : type === "instagramProfileNode" ? 480
      : 288;
    const newNode: Node = {
      id: nodeId,
      type,
      position,
      width: initialWidth,
      data: {
        authToken,
        clientId: selectedClient.id,
        onUpdate: (updates: any) =>
          setNodes(ns => ns.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n)),
        onDelete: () =>
          setNodes(ns => ns.filter(n => n.id !== nodeId)),
      },
    };
    setNodes(prev => [...prev, newNode]);
  }, [nodes, authToken, selectedClient.id, setNodes]);

  const { zoomIn, zoomOut, screenToFlowPosition } = useReactFlow();
  const viewport = useViewport();

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
      const nonAiCount = nodesRef.current.filter(n => n.id !== AI_NODE_ID).length;
      const position = getInitialPosition(nonAiCount);
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
          onDelete: () =>
            setNodes(ns => ns.filter(n => n.id !== nodeId)),
        },
      };
      setNodes(prev => [...prev, newNode]);
      toast.success("Video added — transcribing...");
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [authToken, selectedClient.id, setNodes]);

  // ─── Auto-show tutorial on first visit ───
  useEffect(() => {
    if (!loaded) return;
    if (!localStorage.getItem("connecta_canvas_tutorial_seen")) {
      setShowTutorial(true);
    }
  }, [loaded]);

  // ─── Await save before leaving (fixes fire-and-forget race) ───
  const handleBack = useCallback(async () => {
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

  return (
    <div className="flex h-full overflow-hidden" style={{ background: theme === "light" ? "hsl(220 5% 96%)" : "#06090c" }}>
      <div className="flex-1 relative min-w-0" style={{ background: theme === "light" ? "hsl(220 5% 96%)" : "#06090c" }}>
        <CanvasToolbar
          onAddNode={addNode}
          onBack={handleBack}
          onZoomIn={() => zoomIn()}
          onZoomOut={() => zoomOut()}
          onShowTutorial={() => setShowTutorial(true)}
          onOpenViralPicker={() => setShowViralPicker(true)}
          drawingMode={drawingMode}
          onToggleDrawing={() => setDrawingMode(m => !m)}
          onClearDrawing={() => setDrawPaths([])}
          drawColor={drawColor}
          onDrawColorChange={setDrawColor}
          saveStatus={saveStatus}
        />

        {showViralPicker && (
          <ViralVideoPickerModal
            onSelect={(videoUrl, channelUsername, caption) => {
              setShowViralPicker(false);
              const nodeId = `videoNode_${Date.now()}`;
              const position = getInitialPosition(nodesRef.current.filter(n => n.id !== AI_NODE_ID).length);
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
                  onDelete: () =>
                    setNodes(ns => ns.filter(n => n.id !== nodeId)),
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
          colorMode={theme === "light" ? "light" : "dark"}
          defaultEdgeOptions={{ animated: true, style: { stroke: "hsl(44 75% 87%)", strokeWidth: 1.5, strokeOpacity: 0.7 } }}
          fitView={false}
          panOnScroll
          zoomOnScroll
          panOnDrag={[1, 2]}
          deleteKeyCode={null}
          connectionRadius={60}
          proOptions={{ hideAttribution: true }}
          style={{ background: theme === "light" ? "hsl(220 5% 96%)" : "#06090c" }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            bgColor={theme === "light" ? "hsl(220 5% 96%)" : "#06090c"}
            color={theme === "light" ? "#cbd5e1" : "#0d1f2a"}
            gap={24}
            size={1}
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
      </div>

      <CanvasTutorial open={showTutorial} onClose={() => setShowTutorial(false)} />
    </div>
  );
}
