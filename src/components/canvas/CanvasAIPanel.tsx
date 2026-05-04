import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { FileText, Film, Search, Palette, Megaphone, User, Paperclip, Folder, MapPin, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
import { useOutOfCredits } from "@/contexts/OutOfCreditsContext";
import { parseDeck, type DeckPayload, type DeckAnswer, type DeckQuestion } from "@/lib/parseDeck";
import { AssistantChat, AssistantChipsBar, AssistantTextInput } from "@/components/assistant";
import {
  AI_MODELS,
  MODEL_LABEL,
  type AssistantMessage as Message,
  type ScriptResult,
} from "./CanvasAIPanel.shared";

// Note: renderInline / MarkdownText / InlineScriptPreview / ThinkingAnimation
// were extracted to ./CanvasAIPanel.shared.tsx so AssistantChat (the new
// reusable chat surface) can render the same bubbles. Phase B.1, Task 3.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;


const MAX_MESSAGES = 30;
/** Cap messages array to last MAX_MESSAGES entries */
const capMessages = (msgs: Message[]): Message[] =>
  msgs.length > MAX_MESSAGES ? msgs.slice(-MAX_MESSAGES) : msgs;

const MAX_CONTEXT_CHARS = 100000;

/** Minimum guaranteed budget per section (chars) — even low-priority sections get at least this */
const MIN_SECTION_BUDGET = 2000;

/** Priority weights — higher = gets more of the remaining budget when content is large */
const SECTION_WEIGHTS: Record<string, number> = {
  text_notes: 3,
  transcriptions: 5,
  media_transcriptions: 4,
  video_analyses: 3,
  competitor_profiles: 1,
};

/**
 * Dynamically allocate budget across sections proportionally to their actual content size,
 * weighted by priority. Sections with no content waste nothing.
 */
function allocateBudgets(sections: Record<string, string | null>): Record<string, number> {
  const totalBudget = MAX_CONTEXT_CHARS;
  const entries = Object.entries(sections).filter(([, v]) => v && v.length > 0) as [string, string][];
  if (entries.length === 0) return {};

  // If everything fits, no truncation needed
  const totalLen = entries.reduce((sum, [, v]) => sum + v.length, 0);
  if (totalLen <= totalBudget) {
    return Object.fromEntries(entries.map(([k, v]) => [k, v.length]));
  }

  // Weighted proportional allocation
  const totalWeight = entries.reduce((sum, [k, v]) => sum + v.length * (SECTION_WEIGHTS[k] ?? 1), 0);
  const budgets: Record<string, number> = {};
  for (const [key, val] of entries) {
    const weight = SECTION_WEIGHTS[key] ?? 1;
    const share = Math.floor((val.length * weight / totalWeight) * totalBudget);
    budgets[key] = Math.max(MIN_SECTION_BUDGET, Math.min(val.length, share));
  }
  return budgets;
}

/** Truncate string to budget, appending ellipsis if trimmed */
const truncateSection = (text: string, budget: number): string =>
  text.length <= budget ? text : text.slice(0, budget) + "...(truncated)";

export interface CanvasContext {
  connected_nodes?: string[];
  transcriptions: string[];
  structures: any[];
  text_notes: string;
  research_facts: { fact: string; impact_score: number }[];
  primary_topic: string;
  video_sources?: Array<{ channel_username: string | null; url: string | null }>;
  video_analyses?: Array<{
    detected_format?: string | null;
    visual_segments: Array<{ start: number; end: number; description: string; text_on_screen?: string[] }>;
    audio?: { energy: string; has_music: boolean; speech_density: string } | null;
  }>;
  selected_hook?: string | null;
  selected_hook_category?: string | null;
  brand_guide?: {
    tone: string | null;
    brand_values: string | null;
    forbidden_words: string | null;
    tagline: string | null;
  } | null;
  selected_cta?: string | null;
  competitor_profiles?: Array<{
    username: string;
    top_posts: any[];
    hook_patterns: string[];
    content_themes: string[];
  }> | null;
  media_files?: Array<{
    file_name: string;
    file_type: 'image' | 'video' | 'voice';
    audio_transcription?: string | null;
    visual_transcription?: any | null;
    signed_url?: string | null;
  }> | null;
  /** Competitor folder nodes — each folder contains all posts for an account */
  folder_collections?: Array<{
    username: string;
    platform: string;
    post_count: number;
    avg_outlier_score: number | null;
    top_outlier_score: number | null;
    posts: Array<{
      caption?: string | null;
      hookType?: string | null;
      contentTheme?: string | null;
      outlier_score?: number | null;
      url?: string | null;
    }>;
  }> | null;
}

interface Props {
  canvasContext: CanvasContext;
  /** Live ref to the latest canvasContext — read at send-time to avoid stale closures */
  canvasContextRef?: React.RefObject<CanvasContext>;
  clientInfo?: { name?: string; target?: string };
  onGenerateScript: (result: ScriptResult) => void;
  authToken: string | null;
  format: string;
  language: "en" | "es";
  aiModel: string;
  onFormatChange: (f: string) => void;
  onLanguageChange: (l: "en" | "es") => void;
  onModelChange: (m: string) => void;
  remixMode?: boolean;
  remixContext?: {
    channel_username: string;
    format: string | null;
    prompt_hint: string | null;
  } | null;
  initialInput?: string | null;
  onInitialInputConsumed?: () => void;
  /** Seed messages on mount (from DB). CanvasAIPanel owns display state — no round-trip updates. */
  initialMessages?: Message[];
  onMessagesChange?: (messages: Message[]) => void;
  /** Reports in-flight streaming content (or null when stream finishes) so the parent can persist
   *  the partial response if the page is closed or the tab is discarded mid-stream, and can also
   *  broadcast the partial to collaborators for live typewriter display. */
  onStreamingPartial?: (content: string | null) => void;
  /** Streaming content from a remote collaborator (live typewriter from another tab/user).
   *  When set and no local stream is active, renders as the streaming bubble. */
  remoteStreamingContent?: string | null;
  onSaveScript?: (script: ScriptResult) => Promise<void>;
  onSessionTitle?: (title: string) => void;
  /** Image dropped onto the parent AI node — applied as pastedImage */
  externalDroppedImage?: { dataUrl: string; mimeType: string } | null;
  /** When true, centers content with max-width like Claude's chat UI */
  fullscreen?: boolean;
  /** Active chat row ID — passed to the edge function so it can server-save
   *  the response even if the client navigates away mid-stream. */
  chatId?: string | null;
}

// Message and DeckMeta types moved to ./CanvasAIPanel.shared.tsx
// (imported as `Message` alias above).
type DeckMeta = NonNullable<Message["meta"]>;

// Detects when the user is asking the AI to brainstorm without the
// client/canvas context. Matches natural phrasings like "no context",
// "without my notes", "off-brand", "brainstorm freely", "forget the client".
// Intentionally conservative — only fires on clear intent.
function detectIdeationIntent(text: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  const patterns: RegExp[] = [
    /\b(no|without|w\/o|ignore|forget|drop|skip)\s+(the\s+|my\s+|any\s+)?(context|notes?|client|brand|voice|transcripts?|memos?|script)\b/,
    /\bdon'?t\s+(use|pull|read|consider)\s+(the\s+|my\s+|any\s+)?(context|notes?|client|brand|voice|transcripts?|memos?)\b/,
    /\boff[- ]brand\b/,
    /\bbrainstorm\s+(freely|openly|broadly|off[- ]brand|without)\b/,
    /\bfree[- ]?brainstorm\b/,
    /\bfrom\s+scratch\b/,
    /\bignore\s+(everything|all|what('?| i)s?\s+connected)\b/,
    /\bjust\s+brainstorm\b/,
    /\bthink\s+(broadly|wider|outside)\b/,
    /\bnot\s+from\s+(my|the)\s+(notes?|context|client|brand)\b/,
    /\bpure(ly)?\s+creative\b/,
    /\bfresh\s+angles?\s+\(not\s+from\s+/,
  ];
  return patterns.some((p) => p.test(t));
}

const CHIP_PROMPTS: Record<string, string> = {
  "Check my TAM": "Look at my script topic and all connected context. Is the total addressable market large enough for this to go viral? Be specific — who exactly is the audience, how large is that group, and is the angle broad enough?",
  "Does it reloop?": "Does the current script have a rehook moment mid-way through — something that re-engages viewers who are about to scroll away? If yes, point it out. If not, suggest exactly where to add one and what it could say.",
  "Is story clear?": "Walk through the hook to body to CTA flow of the current script. Does it make logical sense to someone who knows nothing about this topic? Flag any gaps, confusing jumps, or assumed knowledge that needs to be explained.",
  "What angle should we take?": "Based on all connected nodes — what's the strongest angle for this script? Reference specific content from the connected video or notes by name. Give me a clear single direction, not a list of options.",
  "Add a video reference": "I don't have any video references connected yet. What kind of video would be most useful to add to the canvas for this script — a competitor example, an inspiration video, or a format reference?",
  "Make a variation": "Take the last generated script and create a variation — same angle, different hook and structure. Keep the core message but approach it from a different opening moment.",
  "Translate to ES": "Translate the last generated script to Spanish. Adapt it naturally — don't translate word for word, make it feel native to a Spanish-speaking audience.",
  "Pick a hook style": "What hook style fits best for this content? Give me 3 different hook formats with a one-line example of each, based on the connected context.",
  "Suggest a format": "Based on the connected context, what video format works best — talking head, B-roll + voiceover, text-on-screen only, or mixed? Give a clear recommendation and why.",
  "Suggest a hook": "Based on the connected context, suggest 3 strong hook options. Reference specific details from the connected nodes — don't give generic advice.",
  "Make it punchy": "Review the current script and make it punchier. Tighten every line. Cut anything that doesn't earn its place.",
  "Shorten it": "Shorten the current script to fit under 60 seconds. Keep the strongest hook and CTA. Cut from the body first.",
  "Generate a script": "Based on all connected context, generate a complete script now.",
  "Suggest a hook style": "What hook style fits best for this content? Give me 3 hook format options with a brief example of each.",
  "Analyze my video": "Analyze the connected video. What's the format, pacing, hook structure, and what makes it work? Be specific.",
  "What should I make?": "Look at everything connected to this canvas session. What type of content should I create, for which platform, and what angle would perform best? Give me a direct recommendation.",
  "What format works best?": "Based on the connected context, what video format works best — talking head, B-roll + voiceover, text-on-screen only, or mixed? Give a clear recommendation and explain why with specifics.",
  "Build on this hook": "I've selected a hook. Build on it — give me 3 different ways to continue the story from that opening line. Each option should take a different emotional direction.",
  "Analyze the video format": "Break down the connected video's format in detail — structure, pacing, hook type, CTA style, text-on-screen usage, and what makes it work. Be specific, not generic.",
  "Script from my voice note": "I've uploaded a voice note with my story or idea. Use it as the primary source material to write a full video script. Keep my voice and natural phrasing wherever possible.",
  "Suggest a hook from my notes": "Read through my connected notes and suggest 3 strong hook options that come directly from specific details in those notes. Don't write generic hooks — reference the actual content.",
  "Check brand fit": "Review the last generated script against the connected brand guide. Does it match the tone, avoid forbidden words, and align with the brand values? Flag every mismatch specifically.",
  "Is CTA compelling?": "Evaluate the CTA in the current script. Is it specific enough? Does it create urgency? Would someone actually click or act on it? Suggest a stronger version if needed.",
  "Does this match our brand?": "Compare the current script or conversation context against the connected brand guide. List what fits and what doesn't — be specific about tone, language, and values alignment.",
};

// RESEARCH_KEYWORDS moved to ./CanvasAIPanel.shared.tsx (used by AssistantChat
// for streaming-bubble icon selection).

function getDynamicChips(messages: Message[], ctx: CanvasContext): string[] {
  const lastScript = [...messages].reverse().find(m => m.type === "script_preview");
  const hasVideo = ctx.transcriptions.filter(Boolean).length > 0 || (ctx.video_analyses?.length ?? 0) > 0 || ctx.structures.filter(Boolean).length > 0;
  const hasNotes = ctx.text_notes.trim().length > 0;
  const hasBrand = !!ctx.brand_guide;
  const hasCTA = !!ctx.selected_cta;
  const hasHook = !!ctx.selected_hook;
  const hasCompetitor = (ctx.competitor_profiles?.length ?? 0) > 0;
  const hasMediaFiles = (ctx.media_files?.length ?? 0) > 0;
  const hasTopic = ctx.primary_topic.trim().length > 0;
  const hasAnyContext = hasVideo || hasNotes || hasBrand || hasCompetitor || hasMediaFiles || hasTopic || hasHook;

  // ── After a script exists: refinement chips ──
  if (lastScript) {
    const chips = ["Make a variation", "Does it reloop?", "Is story clear?", "Make it punchy"];
    if (hasBrand) chips.splice(1, 0, "Check brand fit");
    if (hasCTA) chips.splice(chips.indexOf("Is story clear?") + 1, 0, "Is CTA compelling?");
    return chips.slice(0, 5);
  }

  // ── No context connected yet ──
  if (!hasAnyContext) {
    return ["What should I make?", "Pick a hook style", "What format works best?"];
  }

  // ── Build context-specific chips ──
  const chips: string[] = [];

  // Hook is selected — build on it
  if (hasHook) {
    chips.push("Build on this hook");
  }

  // Competitor connected — mention their handle
  if (hasCompetitor) {
    const handle = ctx.competitor_profiles![0].username;
    chips.push(`Find our angle vs @${handle}`);
  }

  // Video + notes — rich context
  if (hasVideo && hasNotes) {
    chips.push("What angle should we take?");
    chips.push("Suggest a hook");
  } else if (hasVideo) {
    chips.push("What angle should we take?");
    chips.push("Analyze the video format");
  } else if (hasNotes) {
    chips.push("Suggest a hook from my notes");
  }

  // Voice note/media uploaded
  if (hasMediaFiles) {
    chips.push("Script from my voice note");
  }

  // Brand guide connected
  if (hasBrand && !chips.includes("Check brand fit")) {
    chips.push("Does this match our brand?");
  }

  // Pad to at least 3 with universal chips
  if (chips.length < 3) chips.push("Suggest a hook");
  if (chips.length < 3) chips.push("Check my TAM");
  if (chips.length < 4) chips.push("Is story clear?");

  return chips.slice(0, 5);
}

const PROMPT_PRESETS: Array<{ name: string; description: string; prompt: string }> = [
  {
    name: "B-Roll + Music",
    description: "Adapt video structure as B-roll only script",
    prompt: `Use the Video Node connected to this chat and extract only the visual breakdown of the video. Ignore the voiceover or spoken script completely.

Use the visual structure of that video as a template and rewrite it to fit the client's message and brand, using any connected nodes (Research, Notes, Brand Voice, etc.).

The new script must match the original video's pacing, structure, and overall feeling, but adapted to the client.

Output a scene-by-scene breakdown that includes:
- Visual / Shot – what the viewer sees
- On-Screen Text – short text overlays if needed

Important:
No voiceover. Story must work through B-roll and text only. Keep the same storytelling style and rhythm as the original video.`,
  },
];

// Mention dropdown — icon + label per node type. Passed as props to
// AssistantTextInput so the input component itself stays canvas-agnostic.
const NODE_ICON_COMPONENTS: Record<string, React.ReactNode> = {
  videoNode:              <Film className="w-3.5 h-3.5" />,
  textNoteNode:           <FileText className="w-3.5 h-3.5" />,
  researchNoteNode:       <Search className="w-3.5 h-3.5" />,
  hookGeneratorNode:      <Zap className="w-3.5 h-3.5" />,
  brandGuideNode:         <Palette className="w-3.5 h-3.5" />,
  ctaBuilderNode:         <Megaphone className="w-3.5 h-3.5" />,
  competitorProfileNode:  <User className="w-3.5 h-3.5" />,
  instagramProfileNode:   <User className="w-3.5 h-3.5" />,
  mediaNode:              <Paperclip className="w-3.5 h-3.5" />,
  groupNode:              <Folder className="w-3.5 h-3.5" />,
  annotationNode:         <MapPin className="w-3.5 h-3.5" />,
};

const NODE_LABELS: Record<string, string> = {
  videoNode: "Video", textNoteNode: "Text Note", researchNoteNode: "Research",
  hookGeneratorNode: "Hook Generator", brandGuideNode: "Brand Guide", ctaBuilderNode: "CTA Builder",
  competitorProfileNode: "Competitor", instagramProfileNode: "Competitor", mediaNode: "Media",
  groupNode: "Group", annotationNode: "Annotation",
};

const hasContext = (ctx: CanvasContext) =>
  ctx.transcriptions.filter(Boolean).length > 0 || ctx.structures.filter(Boolean).length > 0 ||
  ctx.text_notes.trim().length > 0 || ctx.research_facts.length > 0 ||
  ctx.primary_topic.trim().length > 0 || (ctx.video_analyses?.length ?? 0) > 0 ||
  !!ctx.selected_hook || !!ctx.brand_guide || !!ctx.selected_cta ||
  (ctx.competitor_profiles?.length ?? 0) > 0 || (ctx.media_files?.length ?? 0) > 0;

export default function CanvasAIPanel({ canvasContext: canvasContextProp, canvasContextRef: parentContextRef, clientInfo, onGenerateScript, authToken, format, language: scriptLang, aiModel, onFormatChange, onLanguageChange, onModelChange, remixMode = false, remixContext = null, initialInput = null, onInitialInputConsumed, initialMessages, onMessagesChange, onStreamingPartial, remoteStreamingContent = null, onSaveScript, onSessionTitle, externalDroppedImage, fullscreen = false, chatId }: Props) {
  const { language } = useLanguage();
  const { user } = useAuth();
  const { showOutOfCreditsModal } = useOutOfCredits();
  // Keep a ref to always read the latest canvasContext in callbacks (avoids stale closures)
  const canvasContextRefLocal = useRef(canvasContextProp);
  canvasContextRefLocal.current = canvasContextProp;
  // Store parent ref so we can read .current at send-time (always fresh, even without re-render)
  const parentCtxRef = useRef(parentContextRef);
  parentCtxRef.current = parentContextRef;
  /** Build fresh context from raw nodes/edges exposed on window by SuperPlanningCanvas.
   *  This is the nuclear option: completely bypasses memo/ref/prop chain. */
  const AI_NODE_ID = "ai-assistant";
  const getLatestContext = (): CanvasContext => {
    const rawNodes = (window as any).__canvasNodes as any[] | undefined;
    const rawEdges = (window as any).__canvasEdges as any[] | undefined;

    // Fallback helper
    const fallback = (reason: string) => {
      const fromWindow = (window as any).__canvasContext as CanvasContext | undefined;
      const fromParent = parentCtxRef.current?.current;
      const ctx = fromWindow ?? fromParent ?? canvasContextRefLocal.current;
      console.log(`[CanvasAI:getLatestContext] fallback (${reason}). connected_nodes:`, ctx?.connected_nodes?.length);
      return ctx;
    };

    // If window globals aren't set yet, fall back to prop/ref chain
    if (!rawNodes || !rawEdges) return fallback("no raw nodes/edges on window");

    try {

    // Build context from EDGE-CONNECTED nodes only — user controls what AI sees by drawing edges
    const allNonAI = rawNodes.filter((n: any) => n.id !== AI_NODE_ID);
    const connectedIds = new Set(
      rawEdges
        .filter((e: any) => e.source === AI_NODE_ID || e.target === AI_NODE_ID)
        .map((e: any) => e.source === AI_NODE_ID ? e.target : e.source)
    );
    // Fall back to all nodes only if no edges are drawn (empty canvas / new session)
    const contextNodes = connectedIds.size > 0
      ? allNonAI.filter((n: any) => connectedIds.has(n.id))
      : allNonAI;

    const videoNodes = contextNodes.filter((n: any) => n.type === "videoNode");
    const textNoteNodes = contextNodes.filter((n: any) => n.type === "textNoteNode");
    const researchNodes = contextNodes.filter((n: any) => n.type === "researchNoteNode");
    const hookNodes = allNonAI.filter((n: any) => n.type === "hookGeneratorNode");
    const brandNodes = allNonAI.filter((n: any) => n.type === "brandGuideNode");
    const ctaNodes = allNonAI.filter((n: any) => n.type === "ctaBuilderNode");
    const instagramProfileNodes = contextNodes.filter(
      (n: any) => (n.type === "instagramProfileNode" || n.type === "competitorProfileNode") &&
      n.data?.status === "done" && (n.data?.posts?.length ?? 0) > 0
    );
    const mediaNodes = contextNodes.filter((n: any) => n.type === "mediaNode" && !!n.data?.mediaId);
    const folderNodes = contextNodes.filter((n: any) => n.type === "competitorFolderNode" && (n.data?.posts?.length ?? 0) > 0);

    const videoNodesWithTranscript = videoNodes.filter((n: any) => !!n.data?.transcription || !!n.data?.videoAnalysis || !!n.data?.structure);

    const groupSuffix = (nodeId: string) => {
      const node = rawNodes.find((nd: any) => nd.id === nodeId);
      if (!node?.parentId) return "";
      const group = rawNodes.find((nd: any) => nd.id === node.parentId);
      return group?.data?.label ? ` [in group: "${group.data.label}"]` : "";
    };

    const nodeInventory = [
      ...videoNodes.map((n: any) => {
        const d = n.data || {};
        const hasTranscript = !!d.transcription;
        const hasAnalysis = !!d.videoAnalysis;
        const hasStructure = !!d.structure;
        const username = d.channel_username ? `@${d.channel_username}` : null;
        const label = username || (d.url ? "video" : "video node");
        if (hasTranscript || hasAnalysis || hasStructure) return `VideoNode(${label}, transcription=${hasTranscript}, visual_analysis=${hasAnalysis}, structure=${hasStructure})${groupSuffix(n.id)}`;
        return `VideoNode(${label}, status=loading_or_empty)${groupSuffix(n.id)}`;
      }),
      ...textNoteNodes.map((n: any) => `TextNote(${n.data?.noteText ? "has_content" : "empty"})${groupSuffix(n.id)}`),
      ...researchNodes.map((n: any) => `ResearchNode(topic="${n.data?.topic || "none"}", facts=${(n.data?.facts || []).length})${groupSuffix(n.id)}`),
      ...hookNodes.map((n: any) => {
        const hd = n.data || {};
        const hookCount = (hd.hooks || []).length;
        const sel = hd.selectedHook ? `selected="${hd.selectedHook.slice(0, 60)}"` : "none_selected";
        return `HookGeneratorNode(topic="${hd.topic || "none"}", hooks=${hookCount}, ${sel})${groupSuffix(n.id)}`;
      }),
      ...brandNodes.map((n: any) => `BrandGuideNode${groupSuffix(n.id)}`),
      ...ctaNodes.map((n: any) => `CTABuilderNode${groupSuffix(n.id)}`),
      ...instagramProfileNodes.map((n: any) => `CompetitorNode(@${n.data?.username || "unknown"}, posts=${(n.data?.posts || []).length})${groupSuffix(n.id)}`),
      ...mediaNodes.map((n: any) => {
        const d = n.data || {};
        return `MediaNode(${d.fileName || "unnamed"}, type=${d.fileType}, transcription=${d.transcriptionStatus === "done" ? "yes" : "no"})${groupSuffix(n.id)}`;
      }),
      ...folderNodes.map((n: any) => {
        const d = n.data || {};
        const posts = d.posts || [];
        const analyzedCount = posts.filter((p: any) => p.hookType || p.contentTheme).length;
        return `FolderNode(@${d.username || "unknown"}, platform=${d.platform || "?"}, total_posts=${posts.length}, analyzed=${analyzedCount}, avg_outlier=${d.avgOutlierScore?.toFixed(1) ?? "?"}x)${groupSuffix(n.id)}`;
      }),
    ];

    console.log("[CanvasAI:getLatestContext] BUILT FROM RAW. edges:", rawEdges.length, "contextNodes:", contextNodes.length, "inventory:", nodeInventory, "videoNodesWithTranscript:", videoNodesWithTranscript.length);
    // Debug: dump video node data keys to diagnose missing transcription/structure
    videoNodes.forEach((n: any) => {
      const d = n.data || {};
      const dataKeys = Object.keys(d).filter(k => typeof d[k] !== "function");
      console.log(`[CanvasAI:VideoNode] id=${n.id}, dataKeys=[${dataKeys.join(",")}], transcription=${!!d.transcription}(${typeof d.transcription}, len=${d.transcription?.length ?? 0}), structure=${!!d.structure}, videoAnalysis=${!!d.videoAnalysis}`);
    });

    const ctx: CanvasContext = {
      connected_nodes: nodeInventory,
      transcriptions: videoNodesWithTranscript.slice(0, 8).map((n: any) => {
        const d = n.data || {};
        if (d.transcription) return (d.transcription as string).slice(0, 15000);
        if (d.structure?.sections?.length) {
          return d.structure.sections.map((s: any) => `[${s.section?.toUpperCase()}] ${s.actor_text || ""}`).join("\n").slice(0, 15000);
        }
        return "";
      }),
      structures: videoNodesWithTranscript.map((n: any) => {
        const d = n.data || {};
        if (!d.structure) return null;
        const sel: string[] = d.selectedSections || ["hook", "body", "cta"];
        return { ...d.structure, sections: (d.structure.sections || []).filter((s: any) => sel.includes(s.section)) };
      }),
      video_sources: videoNodesWithTranscript.map((n: any) => ({
        channel_username: n.data?.channel_username ?? null,
        url: n.data?.url ?? null,
      })),
      video_analyses: videoNodesWithTranscript
        .filter((n: any) => !!n.data?.videoAnalysis)
        .slice(0, 6)
        .map((n: any) => {
          const va = n.data.videoAnalysis;
          return {
            detected_format: n.data?.structure?.detected_format ?? null,
            visual_segments: (va.visual_segments || []).slice(0, 30),
            audio: va.audio || null,
          };
        }),
      text_notes: textNoteNodes.map((n: any) => {
        // Read noteText first, fall back to noteHtml with tags stripped
        const txt = n.data?.noteText;
        if (txt) return txt;
        const html = n.data?.noteHtml;
        if (html) return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
        return "";
      }).filter(Boolean).join("\n\n"),
      research_facts: researchNodes.flatMap((n: any) => n.data?.facts || []),
      primary_topic: researchNodes[0]?.data?.topic || "",
      selected_hook: hookNodes[0]?.data?.selectedHook ?? null,
      selected_hook_category: hookNodes[0]?.data?.selectedCategory ?? null,
      brand_guide: brandNodes.length > 0 ? {
        tone: brandNodes[0].data?.tone ?? null,
        brand_values: brandNodes[0].data?.brand_values ?? null,
        forbidden_words: brandNodes[0].data?.forbidden_words ?? null,
        tagline: brandNodes[0].data?.tagline ?? null,
      } : null,
      selected_cta: ctaNodes[0]?.data?.selectedCTA ?? null,
      competitor_profiles: instagramProfileNodes.map((n: any) => {
        const posts = (n.data?.posts || []).slice(0, 10);
        const analyzedPosts = posts.filter((p: any) => p.hookType);
        const uniqueHooks = [...new Set(analyzedPosts.map((p: any) => p.hookType).filter(Boolean))];
        const uniqueThemes = [...new Set(analyzedPosts.map((p: any) => p.contentTheme).filter(Boolean))];
        return {
          username: n.data?.username || "unknown",
          platform: n.data?.detectedPlatform || "instagram",
          top_posts: posts,
          hook_patterns: uniqueHooks,
          content_themes: uniqueThemes,
        };
      }),
      media_files: mediaNodes.map((n: any) => ({
        file_name: n.data?.fileName || "unnamed",
        file_type: n.data?.fileType || "unknown",
        audio_transcription: n.data?.audioTranscription || null,
        visual_transcription: n.data?.visualTranscription || null,
        signed_url: n.data?.fileType === "image" ? n.data?.signedUrl : null,
      })),
      folder_collections: folderNodes.map((n: any) => {
        const d = n.data || {};
        const posts = (d.posts || []).slice(0, 50); // cap at 50 posts per folder to avoid token overflow
        return {
          username: d.username || "unknown",
          platform: d.platform || "instagram",
          post_count: (d.posts || []).length,
          avg_outlier_score: d.avgOutlierScore ?? null,
          top_outlier_score: d.topOutlierScore ?? null,
          posts: posts.map((p: any) => ({
            caption: p.caption ? (p.caption as string).slice(0, 300) : null,
            hookType: p.hookType ?? null,
            contentTheme: p.contentTheme ?? null,
            outlier_score: p.outlier_score ?? null,
            url: p.url ?? null,
          })),
        };
      }),
    };
    return ctx;
    } catch (err) {
      console.error("[CanvasAI:getLatestContext] error building from raw nodes:", err);
      return fallback("error");
    }
  };
  // Alias for readability in JSX/render paths
  const canvasContext = canvasContextProp;
  const displayName = (user?.user_metadata?.full_name as string)?.split(" ")[0] || clientInfo?.name?.split(" ")[0] || "";
  const greeting = useMemo(() => {
    if (remixMode && remixContext) {
      const hint = remixContext.prompt_hint ? ` It uses a "${remixContext.prompt_hint}" style.` : "";
      const client = clientInfo?.name ?? "your client";
      return scriptLang === "es"
        ? `Analicé el video de @${remixContext.channel_username}.${hint} ¿Sobre qué tema lo aplicamos para ${client}?`
        : `I've loaded @${remixContext.channel_username}'s video.${hint} What topic do you want to apply this to for ${client}?`;
    }
    return scriptLang === "es"
      ? `¿Qué hacemos hoy${displayName ? `, ${displayName}` : ""}?`
      : `What are we doing today${displayName ? `, ${displayName}` : ""}?`;
  }, [remixMode, remixContext, scriptLang, clientInfo, displayName]);
  const greetingRef = useRef(greeting);
  greetingRef.current = greeting;
  // Strip any base64 images from initial messages and convert to blob URLs (saves memory on restore)
  const sanitizedInitial = useMemo(() => {
    if (!initialMessages) return [];
    return initialMessages.map(m => {
      if (m.type === "image" && m.image_b64 && !m._blobUrl) {
        const blobUrl = getBlobUrl(m.image_b64);
        return { ...m, image_b64: undefined, _blobUrl: blobUrl };
      }
      return m;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // only on mount
  // Plain React state — no custom wrapper. Parent notified via useEffect AFTER render.
  const [messages, setMessages] = useState<Message[]>(sanitizedInitial);
  const messagesRef = useRef<Message[]>(messages);
  messagesRef.current = messages; // always current on every render
  const onMessagesChangeRef = useRef(onMessagesChange);
  onMessagesChangeRef.current = onMessagesChange;
  const onStreamingPartialRef = useRef(onStreamingPartial);
  onStreamingPartialRef.current = onStreamingPartial;
  // Throttle in-flight partial reports — last wall-clock ms a partial was emitted
  const lastPartialReportAtRef = useRef(0);

  // ─── Sync from parent when initialMessages changes (remote broadcast / chat switch) ───
  const lastExternalLenRef = useRef(initialMessages?.length ?? 0);
  useEffect(() => {
    if (!initialMessages) return;
    const externalLen = initialMessages.length;
    // Handle empty → empty (no change needed)
    if (externalLen === 0 && messagesRef.current.length === 0) return;
    // If external is empty but local has messages, clear them (chat switch to empty chat)
    if (externalLen === 0 && messagesRef.current.length > 0) {
      lastExternalLenRef.current = 0;
      messagesRef.current = [];
      setMessages([]);
      return;
    }
    // Only sync if the external data actually changed (different length or different last message)
    const currentLen = messagesRef.current.length;
    const lastExternal = initialMessages[externalLen - 1];
    const lastCurrent = messagesRef.current[currentLen - 1];
    const changed = externalLen !== lastExternalLenRef.current ||
      (lastExternal && lastCurrent && lastExternal.content !== lastCurrent.content);
    if (changed) {
      lastExternalLenRef.current = externalLen;
      messagesRef.current = initialMessages;
      setMessages(initialMessages);
    }
  }, [initialMessages]);
  // Local model state — initialized from prop, updated immediately on selection
  // Avoids relying on prop propagation back through ReactFlow node data
  const [selectedModel, setSelectedModel] = useState(aiModel);
  const aiModelRef = useRef(aiModel);
  aiModelRef.current = selectedModel; // always current — avoids stale closure in sendMessage
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const thinkingRef = useRef(false);
  thinkingRef.current = thinkingEnabled;
  // Parent is notified via direct calls in sendMessage/generateScript — no useEffect timing dependency
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const [recognizing, setRecognizing] = useState(false);
  // atMentionQuery moved into AssistantTextInput (Phase B.1, Task 4).
  const [pastedImage, setPastedImage] = useState<{ dataUrl: string; mimeType: string } | null>(null);
  const pastedImageRef = useRef<{ dataUrl: string; mimeType: string } | null>(null);
  pastedImageRef.current = pastedImage; // always current — avoids stale closure in sendMessage
  const [isDragOver, setIsDragOver] = useState(false);
  const [isResearchMode, setIsResearchMode] = useState(false);
  const isResearchModeRef = useRef(false);
  isResearchModeRef.current = isResearchMode;
  const abortControllerRef = useRef<AbortController | null>(null);
  const typewriterRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasTitledRef = useRef(false);
  const recognitionRef = useRef<any>(null);
  const DEFAULT_WINDOW = 15;
  const [visibleCount, setVisibleCount] = useState(DEFAULT_WINDOW);

  // Cache base64 → blob URLs to avoid keeping large strings in DOM
  const blobUrlCacheRef = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    return () => {
      // Revoke all blob URLs on unmount
      blobUrlCacheRef.current.forEach(url => URL.revokeObjectURL(url));
      blobUrlCacheRef.current.clear();
    };
  }, []);

  const getBlobUrl = useCallback((base64: string): string => {
    // Use length + head + tail as collision-resistant cache key
    const cacheKey = `${base64.length}:${base64.slice(0, 64)}:${base64.slice(-64)}`;
    const cached = blobUrlCacheRef.current.get(cacheKey);
    if (cached) return cached;
    const byteChars = atob(base64);
    const byteArray = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
    const blob = new Blob([byteArray], { type: "image/png" });
    const url = URL.createObjectURL(blob);
    blobUrlCacheRef.current.set(cacheKey, url);
    // Evict oldest entries if cache grows beyond 10 to prevent memory leak
    if (blobUrlCacheRef.current.size > 10) {
      const firstKey = blobUrlCacheRef.current.keys().next().value;
      if (firstKey) {
        const oldUrl = blobUrlCacheRef.current.get(firstKey);
        if (oldUrl) URL.revokeObjectURL(oldUrl);
        blobUrlCacheRef.current.delete(firstKey);
      }
    }
    return url;
  }, []);

  // Auto-scroll-on-new-message and streaming-content scroll moved into
  // AssistantChat. The window-cursor reset is handled via the
  // `onAutoScrolledToBottom` callback wired into <AssistantChat /> below.

  // Apply image dropped onto the parent AI node
  useEffect(() => {
    if (externalDroppedImage) {
      setPastedImage(externalDroppedImage);
      // Scroll input into view so user sees the preview
      setTimeout(() => inputBoxRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 50);
    }
  }, [externalDroppedImage]);

  // Auto-title: after first full exchange (user + assistant), fire background title request
  useEffect(() => {
    if (hasTitledRef.current || !onSessionTitle) return;
    const userMsgs = messages.filter(m => m.role === "user");
    const assistantMsgs = messages.filter(m => m.role === "assistant" && m.type !== "script_preview");
    if (userMsgs.length < 1 || assistantMsgs.length < 1) return;
    hasTitledRef.current = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token || authToken;
        if (!token) return;
        const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-assistant`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            title_mode: true,
            messages: [
              { role: "user", content: userMsgs[0].content },
              { role: "assistant", content: assistantMsgs[0].content },
            ],
          }),
        });
        const json = await res.json();
        const title = json.content?.trim()?.split("\n")[0]?.trim();
        if (title && title.length > 2 && title.length < 60) onSessionTitle(title);
      } catch { /* silent */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  // Infinite-scroll IntersectionObserver moved into AssistantChat.
  // CanvasAIPanel exposes loadMore() below so the chat surface can ask
  // for an older window.
  const loadMoreOlder = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + 15, messagesRef.current.length));
  }, []);

  useEffect(() => {
    if (remixMode && messages.length === 0) {
      setMessages([{ role: "assistant", content: greetingRef.current }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remixMode]); // only fire once on mount

  useEffect(() => {
    if (initialInput) {
      setInput(initialInput);
      onInitialInputConsumed?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialInput]);

  const [imageMode, setImageMode] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);

  // Wrapper around the input area — used to scrollIntoView when an external
  // image is dropped onto the parent AI node.
  const inputBoxRef = useRef<HTMLDivElement>(null);

  // modelDropdownOpen / plusMenuOpen / their refs / click-outside effects /
  // adjustTextareaHeight all moved into AssistantTextInput (Phase B.1, Task 4).

  // ── Voice input ──
  const toggleVoice = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast.error("Voice input not supported in this browser"); return; }
    if (recognizing) {
      recognitionRef.current?.stop();
      setRecognizing(false);
      return;
    }
    const rec = new SR();
    rec.lang = scriptLang === "es" ? "es-ES" : "en-US";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      const transcript = e.results[0]?.[0]?.transcript || "";
      if (transcript) {
        // AssistantTextInput re-measures its textarea height on value change.
        setInput(prev => (prev ? prev + " " + transcript : transcript));
      }
    };
    rec.onerror = () => setRecognizing(false);
    rec.onend = () => setRecognizing(false);
    recognitionRef.current = rec;
    rec.start();
    setRecognizing(true);
  }, [recognizing, scriptLang]);

  // ── Paste image handler ──
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData?.items ?? []);
    const imageItem = items.find(it => it.type.startsWith("image/"));
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

  // Stop any in-flight generation. Called by AssistantTextInput's stop button.
  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
    if (typewriterRef.current) {
      clearInterval(typewriterRef.current);
      typewriterRef.current = null;
    }
    setStreamingContent(null);
    setLoading(false);
    setGenerating(false);
  }, []);

  const generateScript = useCallback(async () => {
    const ctx = getLatestContext();
    if (!hasContext(ctx)) {
      toast.error("Add at least one node (video, note, or research) to the canvas first.");
      return;
    }
    setGenerating(true);
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || authToken || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    try {
      // Strip leading assistant messages (Claude API requires user-first), and trim to last 20 messages to avoid token bloat
      const currentMsgs = messagesRef.current;
      const firstUserIdx = currentMsgs.findIndex(m => m.role === "user");
      const conversationMessages = firstUserIdx >= 0 ? currentMsgs.slice(firstUserIdx).slice(-20) : [];

      const genAbortController = new AbortController();
      abortControllerRef.current = genAbortController;

      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-build-script`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        signal: genAbortController.signal,
        body: JSON.stringify({
          step: "canvas-generate",
          ...ctx,
          format,
          language: scriptLang,
          clientContext: clientInfo?.name ? `Client: ${clientInfo.name}` : undefined,
          conversationMessages: conversationMessages.length > 0 ? conversationMessages : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.insufficient_credits) {
          showOutOfCreditsModal();
          return;
        }
        throw new Error(json.error || "Script generation failed");
      }
      // Ensure lines is always an array
      if (!Array.isArray(json.lines)) json.lines = [];
      // Show inline preview in chat — replace existing script_preview if present, else append
      const _genMsg: Message = {
        role: "assistant" as const,
        content: `Script generated: "${json.idea_ganadora}"`,
        type: "script_preview",
        script_data: json,
      };
      const lastPreviewIdx = messagesRef.current.map(m => m.type).lastIndexOf("script_preview");
      const base = lastPreviewIdx >= 0
        ? [...messagesRef.current.slice(0, lastPreviewIdx), ...messagesRef.current.slice(lastPreviewIdx + 1)]
        : messagesRef.current;
      const _withGen = capMessages([...base, _genMsg]);
      messagesRef.current = _withGen;
      setMessages(_withGen);
      onMessagesChangeRef.current?.(_withGen);
    } catch (e: any) {
      if (e?.name === "AbortError") { return; }
      toast.error(e.message || "Generation failed");
      const _genErrMsg = { role: "assistant" as const, content: `Generation failed: ${e.message}` };
      const _withGenErr = capMessages([...messagesRef.current, _genErrMsg]);
      messagesRef.current = _withGenErr;
      setMessages(_withGenErr);
      onMessagesChangeRef.current?.(_withGenErr);
    } finally {
      setGenerating(false);
    }
  }, [authToken, format, scriptLang, clientInfo, onGenerateScript]);

  const sendResearchMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setInput(""); (window as any).__canvasAIDraftInput = null; if (textareaRef.current) { textareaRef.current.style.height = "auto"; }

    const userMsg: Message = { role: "user", content: trimmed };
    const updatedMsgs = capMessages([...messagesRef.current, userMsg]);
    messagesRef.current = updatedMsgs;
    setMessages(updatedMsgs);
    onMessagesChangeRef.current?.(updatedMsgs);

    setLoading(true);
    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || authToken || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const cc = getLatestContext();
      const contextParts: string[] = [];
      if (cc.primary_topic) contextParts.push(`Topic: ${cc.primary_topic}`);
      if (cc.text_notes) contextParts.push(`Notes: ${cc.text_notes.slice(0, 400)}`);
      if (cc.brand_guide?.tone) contextParts.push(`Brand tone: ${cc.brand_guide.tone}`);
      // Include recent conversation history so research has full context
      const recentMsgs = messagesRef.current.slice(-10).map(m => `${m.role}: ${m.content?.slice(0, 300)}`).join("\n");
      if (recentMsgs) contextParts.push(`Conversation history:\n${recentMsgs}`);
      const cappedContext = contextParts.join("\n").slice(0, 2000);

      const res = await fetch(`${SUPABASE_URL}/functions/v1/deep-research`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ topic: trimmed, canvas_context: cappedContext }),
        signal: abortController.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const errMsg = errData.error || "Research failed";
        if (errData.insufficient_credits) {
          showOutOfCreditsModal();
        } else {
          toast.error(errMsg);
        }
        const errAiMsg: Message = { role: "assistant", content: errMsg };
        const withErr = capMessages([...messagesRef.current, errAiMsg]);
        messagesRef.current = withErr; setMessages(withErr); onMessagesChangeRef.current?.(withErr);
        return;
      }

      if (res.headers.get("content-type")?.includes("text/event-stream") && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const targetRef = { current: "" };
        let displayedLen = 0;
        let sseFinished = false;
        let finalContent = "";
        let finalSourceCount = 0;

        setStreamingContent("");
        if (typewriterRef.current) clearInterval(typewriterRef.current);

        const tid = setInterval(() => {
          const target = targetRef.current;
          if (displayedLen < target.length) {
            const lag = target.length - displayedLen;
            const step = lag > 80 ? 4 : lag > 20 ? 2 : 1;
            displayedLen = Math.min(displayedLen + step, target.length);
            setStreamingContent(target.slice(0, displayedLen));
          } else if (sseFinished) {
            clearInterval(tid);
            typewriterRef.current = null;
            setStreamingContent(null);
            const aiMsg: Message = {
              role: "assistant",
              content: finalContent || "Research complete.",
              is_research: true,
              source_count: finalSourceCount,
              research_topic: trimmed,
            };
            const withAI = capMessages([...messagesRef.current, aiMsg]);
            messagesRef.current = withAI;
            setMessages(withAI);
            onMessagesChangeRef.current?.(withAI);
          }
        }, 16);
        typewriterRef.current = tid;

        let buf = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const lines = buf.split("\n");
            buf = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              try {
                const ev = JSON.parse(line.slice(6));
                if (ev.delta) {
                  targetRef.current += ev.delta;
                } else if (ev.done) {
                  finalContent = targetRef.current;
                  finalSourceCount = ev.source_count ?? 0;
                  sseFinished = true;
                } else if (ev.error) {
                  toast.error(ev.error);
                  finalContent = `Research encountered an error: ${ev.error}`;
                  sseFinished = true;
                }
              } catch { /* ignore */ }
            }
          }
          if (!sseFinished) { finalContent = targetRef.current; sseFinished = true; }
        } finally {
          reader.releaseLock();
        }
      }
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      toast.error(e.message || "Research failed");
      const errMsg: Message = { role: "assistant", content: `Research failed: ${e.message}` };
      const withErr = capMessages([...messagesRef.current, errMsg]);
      messagesRef.current = withErr; setMessages(withErr); onMessagesChangeRef.current?.(withErr);
    } finally {
      setLoading(false);
    }
  }, [authToken, loading]);

  const sendMessage = useCallback(async (text: string, opts?: { deckMeta?: DeckMeta }) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    // Expand chip shortcuts to full prompts
    // Handle dynamic competitor chip: "Find our angle vs @handle"
    let expandedText = CHIP_PROMPTS[trimmed] || trimmed;
    if (trimmed.startsWith("Find our angle vs @")) {
      const handle = trimmed.replace("Find our angle vs @", "").trim();
      expandedText = `Look at the competitor profile for @${handle} connected to this canvas. Based on their top-performing content — hook patterns, themes, and best posts — what unique angle should I take to stand out from them? Be specific about where the gap is and what I can own.`;
    }

    const lower = trimmed.toLowerCase();

    // ─── Deep research routing — ONLY when explicitly toggled ON ───
    if (isResearchModeRef.current && !CHIP_PROMPTS[trimmed]) {
      setIsResearchMode(false);   // auto-turn off after sending
      await sendResearchMessage(trimmed);
      return;
    }

    const isGenerateRequest = lower.includes("generate script") || lower.includes("generate my script") ||
      lower.includes("generate now") || lower.includes("generate the script") ||
      lower.includes("write the script") || lower.includes("write my script") ||
      lower.includes("create the script") || lower.includes("build the script") ||
      (lower.includes("generate") && lower.length < 20);
    if (isGenerateRequest) {
      setInput(""); (window as any).__canvasAIDraftInput = null; if (textareaRef.current) { textareaRef.current.style.height = "auto"; }
      const _genUserMsg = { role: "user" as const, content: trimmed };
      const _genUpdated = capMessages([...messagesRef.current, _genUserMsg]);
      messagesRef.current = _genUpdated;
      setMessages(_genUpdated);
      onMessagesChangeRef.current?.(_genUpdated);
      await generateScript();
      return;
    }

    // ─── Script edit: only triggers on explicit update/edit commands ───
    const lastScriptMsg = [...messagesRef.current].reverse().find(m => m.type === "script_preview" && m.script_data);
    const isEditIntent = lastScriptMsg?.script_data && (() => {
      const l = lower;
      const explicitUpdate = /(update|edit|change|fix|redo|revise|rewrite|modify|adjust|tweak|rephrase)\s+(the\s+|this\s+|my\s+)?script/;
      const explicitEditPart = /(update|edit|change|fix|rewrite|remove|delete|add|insert|swap|replace|shorten|lengthen|make it)\s+(the\s+)?(hook|cta|body|line|scene|section|opening|ending|intro|outro)/;
      const chipEdits = /^(make it punchy|shorten it)\s*[?!.]?$/;
      return explicitUpdate.test(l) || explicitEditPart.test(l) || chipEdits.test(l);
    })();
    if (isEditIntent) {
      setInput(""); (window as any).__canvasAIDraftInput = null; if (textareaRef.current) { textareaRef.current.style.height = "auto"; }
      const _editUserMsg: Message = { role: "user", content: trimmed };
      const _editUpdated = capMessages([...messagesRef.current, _editUserMsg]);
      messagesRef.current = _editUpdated;
      setMessages(_editUpdated);
      onMessagesChangeRef.current?.(_editUpdated);
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token || authToken || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        // Build conversation context (last 10 non-script messages for context)
        const convMsgs = _editUpdated
          .filter(m => m.type !== "script_preview" && m.type !== "image")
          .slice(-10)
          .map(m => ({ role: m.role, content: m.content }));

        const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-build-script`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            step: "canvas-edit",
            existing_script: lastScriptMsg.script_data,
            edit_instruction: trimmed,
            language: scriptLang,
            conversationMessages: convMsgs,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          if (json.insufficient_credits) {
            showOutOfCreditsModal();
            return;
          }
          throw new Error(json.error || "Script edit failed");
        }
        if (!Array.isArray(json.lines)) json.lines = [];

        // Replace the old script preview with the updated one
        const _editResultMsg: Message = {
          role: "assistant" as const,
          content: `Script updated: "${json.idea_ganadora}"`,
          type: "script_preview",
          script_data: json,
        };
        const lastPreviewIdx = messagesRef.current.map(m => m.type).lastIndexOf("script_preview");
        const base = lastPreviewIdx >= 0
          ? [...messagesRef.current.slice(0, lastPreviewIdx), ...messagesRef.current.slice(lastPreviewIdx + 1)]
          : messagesRef.current;
        const _withEdit = capMessages([...base, _editResultMsg]);
        messagesRef.current = _withEdit;
        setMessages(_withEdit);
        onMessagesChangeRef.current?.(_withEdit);
      } catch (e: any) {
        toast.error(e.message || "Script edit failed");
        const _editErrMsg = { role: "assistant" as const, content: `Edit failed: ${e.message}` };
        const _withEditErr = capMessages([...messagesRef.current, _editErrMsg]);
        messagesRef.current = _withEditErr;
        setMessages(_withEditErr);
        onMessagesChangeRef.current?.(_withEditErr);
      } finally {
        setLoading(false);
        window.dispatchEvent(new Event("credits-updated"));
      }
      return;
    }

    const capturedPastedImage = pastedImageRef.current;
    setPastedImage(null);
    const userMsg: Message = {
      role: "user",
      content: expandedText,
      ...(capturedPastedImage ? { _imagePreview: capturedPastedImage.dataUrl } : {}),
      ...(opts?.deckMeta ? { meta: opts.deckMeta } : {}),
    };
    // Build updated list from ref (always current) and update state
    const updated = capMessages([...messagesRef.current, userMsg]);
    messagesRef.current = updated; // immediately update ref for API payload below
    setMessages(updated);
    console.log("[chat] sendMessage: notifying parent, ref:", typeof onMessagesChangeRef.current, "msgs:", updated.length);
    onMessagesChangeRef.current?.(updated); // persist user message immediately
    setInput(""); (window as any).__canvasAIDraftInput = null; if (textareaRef.current) { textareaRef.current.style.height = "auto"; }
    setAtMentionQuery(null);
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || authToken || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      // Build full context for the AI assistant — read from parent ref for always-fresh value
      const cc = getLatestContext();
      // Detect if user is asking about competitor transcriptions → expand limit to full text
      const lowerMsg = expandedText.toLowerCase();
      const wantsFullTranscription = /transcri|what (do|did) they say|read the|full text|word for word|verbatim|lyrics|spoken|what (is|was) said/.test(lowerMsg);

      // Auto-transcribe a competitor post if the user asks to analyze/copy/replicate it
      let autoTranscribedSection: string | null = null;
      const isAutoTranscribeIntent = /copy (that|their|this)|replicate|recreate|break.?down|analyze (that|their|this) (video|reel|post|content)|study (that|their)|transcribe/.test(lowerMsg);
      if (isAutoTranscribeIntent && (cc.competitor_profiles?.length ?? 0) > 0) {
        const transcribeFn = (window as any).__canvasTranscribeCompetitorPost;
        if (transcribeFn) {
          // Parse post index: "post #2", "second video", "#3", "2nd" → 0-based
          const numMatch = expandedText.match(/(?:post|video|reel)\s*#?(\d)|#(\d)|(\d+)(?:st|nd|rd|th)/i);
          const autoPostIndex = numMatch ? Math.max(0, parseInt(numMatch[1] || numMatch[2] || numMatch[3]) - 1) : 0;
          // Parse username: "@handle" in message, fuzzy-match against profiles, else first profile
          const atMatch = expandedText.match(/@([\w.]+)/);
          let autoUsername: string | null = atMatch ? atMatch[1] : null;
          if (!autoUsername && cc.competitor_profiles!.length > 0) {
            // Try to find a name mentioned in the message that matches a profile username
            const words = expandedText.toLowerCase().split(/\s+/);
            const matched = cc.competitor_profiles!.find((p: any) =>
              words.some(w => w.length >= 3 && (p.username || "").toLowerCase().includes(w))
            );
            autoUsername = matched?.username ?? cc.competitor_profiles![0]?.username ?? null;
          }
          if (autoUsername) {
            const transcription: string | null = await transcribeFn(autoUsername, autoPostIndex);
            if (transcription) {
              autoTranscribedSection = `FRESHLY TRANSCRIBED — Post #${autoPostIndex + 1} from @${autoUsername}:\n"${transcription}"\n(The user asked you to analyze this video. Use this transcript to break it down, replicate its structure, or extract patterns as requested.)`;
            }
          }
        }
      }

      console.log("[CanvasAI] Building context. transcriptions:", cc.transcriptions.length, "connected_nodes:", cc.connected_nodes?.length, "structures:", cc.structures.length, "video_analyses:", cc.video_analyses?.length);
      if (cc.transcriptions.length > 0) {
        console.log("[CanvasAI] First transcription (200 chars):", String(cc.transcriptions[0]).slice(0, 200));
      }
      // Build raw sections (full content, no truncation yet)
      const rawTextNotes = cc.text_notes
        ? `CREATOR NOTES (treat as core research & instructions — USE this content when generating scripts):\n${cc.text_notes}`
        : null;

      const rawTranscriptions = cc.transcriptions.length > 0
        ? `VIDEO TRANSCRIPTION TEMPLATES (use as FORMAT reference — replicate structure, pacing, rhythm):\n${
            cc.transcriptions.map((t, i) => {
              const src = cc.video_sources?.[i];
              const label = src?.channel_username ? `from @${src.channel_username}` : `Video ${i + 1}`;
              return `[${label}]: ${typeof t === "string" ? t : ""}`;
            }).join("\n\n")
          }`
        : null;

      const rawVideoAnalyses = (cc.video_analyses?.length ?? 0) > 0
        ? `VISUAL SCENES (actual frame-by-frame analysis of reference videos — use as visual template):\n${
            cc.video_analyses!.map((va, i) => {
              const lines = [`Video ${i + 1} (${va.detected_format || "unknown format"}):`];
              (va.visual_segments || []).slice(0, 60).forEach(seg => {
                const tos = seg.text_on_screen?.length ? ` | TEXT ON SCREEN: "${seg.text_on_screen.join(" / ")}"` : "";
                lines.push(`  [${seg.start}s–${seg.end}s] ${seg.description}${tos}`);
              });
              if (va.audio) {
                lines.push(`  Audio: music=${va.audio.has_music}, energy=${va.audio.energy}, speech=${va.audio.speech_density}`);
              }
              return lines.join("\n");
            }).join("\n\n")
          }`
        : null;

      const rawCompetitorProfiles = (cc.competitor_profiles?.length ?? 0) > 0
        ? `COMPETITOR ANALYSIS:\n${
            cc.competitor_profiles!.map((cp: any) => {
              const posts = [...cp.top_posts].sort((a: any, b: any) => (b.outlier_score ?? 0) - (a.outlier_score ?? 0)).slice(0, 10);
              const hooksSeen = cp.hook_patterns.length > 0 ? cp.hook_patterns.join(", ") : "not yet analyzed";
              const postLines = posts.map((p: any, i: number) => {
                const score = typeof p.outlier_score === "number" ? p.outlier_score.toFixed(1) : p.outlier_score ?? "?";
                const views = p.viewsFormatted || (p.views ? p.views.toLocaleString() : "unknown");
                let line = `  #${i + 1} (${score}x, ${views} views): "${(p.caption || "(no caption)").slice(0, 120)}"`;
                if (p.url) line += `\n    URL: ${p.url}`;
                if (p.hookType) line += `\n    Hook type: ${p.hookType}`;
                if (p.whyItWorked) line += `\n    Why it worked: ${p.whyItWorked}`;
                if (p.pattern) line += `\n    Reusable pattern: ${p.pattern}`;
                if (p.applyToClient) line += `\n    Apply to client: ${p.applyToClient}`;
                if (p.transcription) {
                  const limit = wantsFullTranscription ? p.transcription.length : 600;
                  line += `\n    Transcription: "${p.transcription.slice(0, limit)}${p.transcription.length > limit ? "..." : ""}"`;}

                return line;
              }).join("\n");
              return `@${cp.username} (${cp.platform || "instagram"}):\n- Hook types seen: ${hooksSeen}\n- Top posts:\n${postLines}`;
            }).join("\n\n")
          }`
        : null;

      const rawFolderCollections = (cc.folder_collections?.length ?? 0) > 0
        ? `COMPETITOR FOLDER COLLECTIONS (full account post libraries):\n${
            cc.folder_collections!.map((folder: any) => {
              const posts = [...folder.posts].sort((a: any, b: any) => (b.outlier_score ?? 0) - (a.outlier_score ?? 0));
              const hookTypes = [...new Set(posts.map((p: any) => p.hookType).filter(Boolean))];
              const themes = [...new Set(posts.map((p: any) => p.contentTheme).filter(Boolean))];
              const postLines = posts.map((p: any, i: number) => {
                const score = typeof p.outlier_score === "number" ? `${p.outlier_score.toFixed(1)}x` : "?x";
                let line = `  #${i + 1} (${score}): "${(p.caption || "(no caption)").slice(0, 150)}"`;
                if (p.hookType) line += ` | Hook: ${p.hookType}`;
                if (p.contentTheme) line += ` | Theme: ${p.contentTheme}`;
                if (p.url) line += `\n    URL: ${p.url}`;
                return line;
              }).join("\n");
              return `@${folder.username} (${folder.platform}) — ${folder.post_count} posts total | avg outlier: ${folder.avg_outlier_score?.toFixed(1) ?? "?"}x | top: ${folder.top_outlier_score?.toFixed(1) ?? "?"}x\n- Hook types seen: ${hookTypes.length > 0 ? hookTypes.join(", ") : "not analyzed"}\n- Content themes: ${themes.length > 0 ? themes.join(", ") : "not analyzed"}\n- All posts (sorted by viral score):\n${postLines}`;
            }).join("\n\n")
          }`
        : null;

      const rawMediaFiles = (cc.media_files?.length ?? 0) > 0
        ? `UPLOADED MEDIA:\n${
            cc.media_files!.map(m => {
              const parts = [`- ${m.file_name} (${m.file_type})`];
              if (m.audio_transcription) parts.push(`  Audio transcript: ${m.audio_transcription}`);
              if (m.visual_transcription?.visual_segments?.length) {
                parts.push(`  Visual breakdown: ${m.visual_transcription.visual_segments.map((s: any) => s.description).join(" → ")}`);
              }
              return parts.join("\n");
            }).join("\n")
          }`
        : null;

      // PRIORITY SECTIONS — always included in full, never truncated.
      // Text notes and video transcriptions are the creator's core data.
      const prioritySections = [
        (cc.connected_nodes?.length ?? 0) > 0
          ? `CONNECTED NODES (everything on the canvas right now):\n${cc.connected_nodes!.join("\n")}`
          : "CONNECTED NODES: none",
        rawTextNotes,
        rawTranscriptions,
        cc.primary_topic ? `Topic: ${cc.primary_topic}` : null,
        cc.structures.length > 0
          ? `VIDEO STRUCTURE TEMPLATES (ONLY use sections shown):\n${
              cc.structures.map((s, i) => {
                if (!s) return null;
                const src = cc.video_sources?.[i];
                const label = src?.channel_username ? `from @${src.channel_username}` : `Video ${i + 1}`;
                const formatLine = s.format_notes
                  ? `[${label}] Format: ${s.detected_format} — ${s.format_notes}`
                  : `[${label}] Format: ${s.detected_format}`;
                return `${formatLine}\n${(s.sections || [])
                  .map((sec: any) => `  [${sec.section.toUpperCase()}] "${sec.actor_text}" | Visual: ${sec.visual_cue}`)
                  .join("\n")}`;
              }).filter(Boolean).join("\n\n")
            }`
          : null,
        cc.research_facts.length > 0
          ? `Research Facts:\n${cc.research_facts.map(f => `- ${f.fact} (impact ${f.impact_score})`).join("\n")}`
          : null,
        cc.selected_hook
          ? `SELECTED HOOK (use as script opening):\n"${cc.selected_hook}" (${cc.selected_hook_category ?? "general"} style)`
          : null,
        cc.brand_guide
          ? `BRAND CONSTRAINTS:\n- Tone: ${cc.brand_guide.tone ?? "not set"}\n- Brand values: ${cc.brand_guide.brand_values ?? "none"}\n- Forbidden words: ${cc.brand_guide.forbidden_words ?? "none"}\n- Tagline: "${cc.brand_guide.tagline ?? ""}"`
          : null,
        cc.selected_cta
          ? `REQUIRED CTA (end script with this verbatim):\n"${cc.selected_cta}"`
          : null,
        // Video analyses are the visual breakdown — users expect AI to see all frames
        rawVideoAnalyses,
        // Competitor profiles are strategy-critical — always include in full
        rawCompetitorProfiles,
        // Folder collections — full account post libraries connected as a single node
        rawFolderCollections,
        // Freshly auto-transcribed post (if user asked to analyze/copy a competitor video)
        autoTranscribedSection,
      ].filter(Boolean);

      // SECONDARY SECTIONS — budget-allocated only if total exceeds limit
      const secondarySections: Record<string, string | null> = {
        media_transcriptions: rawMediaFiles,
      };
      const priorityTotal = prioritySections.join("\n\n").length;
      const remainingBudget = MAX_CONTEXT_CHARS - priorityTotal;
      let budgetedSections: string[] = [];

      const secondaryEntries = Object.entries(secondarySections).filter(([, v]) => v && v.length > 0) as [string, string][];
      const secondaryTotal = secondaryEntries.reduce((sum, [, v]) => sum + v.length, 0);

      if (secondaryTotal <= remainingBudget || remainingBudget <= 0) {
        // Everything fits — no truncation
        budgetedSections = secondaryEntries.map(([, v]) => v);
      } else {
        // Truncate secondary sections proportionally
        const budgets = allocateBudgets(Object.fromEntries(secondaryEntries) as Record<string, string>);
        budgetedSections = secondaryEntries.map(([k, v]) => truncateSection(v, budgets[k] ?? v.length));
      }
      console.log("[CanvasAI] Priority sections:", priorityTotal, "chars | Secondary:", secondaryTotal, "chars | Budget remaining:", remainingBudget);

      const contextSummary = [...prioritySections, ...budgetedSections].join("\n\n");

      // Final hard cap as safety net
      const cappedContext = contextSummary.length > MAX_CONTEXT_CHARS
        ? contextSummary.slice(0, MAX_CONTEXT_CHARS) + "\n...(context truncated)"
        : contextSummary;

      console.log("[CanvasAI] contextSummary length:", contextSummary.length, "chars → capped:", cappedContext.length);
      console.log("[CanvasAI] contextSummary preview:", cappedContext.slice(0, 500));

      // Claude API requires messages to start with a user role — strip any leading assistant messages
      const firstUserIdx = updated.findIndex(m => m.role === "user");
      // Convert script_preview messages to readable text so Claude can see what it generated
      const apiMessages = (firstUserIdx >= 0 ? updated.slice(firstUserIdx) : updated).map(m => {
        // Rewrite prior deck-JSON assistant messages as a readable summary so the
        // model doesn't see its own raw JSON and try to emit another deck.
        if (m.role === "assistant") {
          const deck = parseDeck(m.content);
          if (deck) {
            const qlist = deck.questions
              .map((q, idx) => `Q${idx + 1} (${q.label || q.id}): ${q.question}`)
              .join("\n");
            const preamble = deck.preamble ? `${deck.preamble}\n\n` : "";
            return {
              role: m.role,
              content: `${preamble}[I asked the user a question deck. They'll answer in the next message. Questions I asked:\n${qlist}]`,
            };
          }
        }
        if (m.type === "script_preview" && m.script_data) {
          const s = m.script_data;
          const lines = (s.lines || []).map((l: any) => {
            const section = (l.section || "body").toUpperCase();
            const actor = l.actor_text || l.text || "";
            const tos = l.text_on_screen ? ` | TEXT ON SCREEN: "${l.text_on_screen}"` : "";
            const visual = l.visual_cue ? ` | Visual: ${l.visual_cue}` : "";
            return `  [${section}] ${actor}${tos}${visual}`;
          }).join("\n");
          return {
            role: m.role,
            content: `[GENERATED SCRIPT: "${s.idea_ganadora}"]\n${lines}`,
          };
        }
        // Re-include pasted images in history so Claude can reference them in follow-up messages
        if (m._imagePreview && m.role === "user") {
          const b64 = m._imagePreview.replace(/^data:[^;]+;base64,/, "");
          const mime = (m._imagePreview.match(/^data:([^;]+)/) || [])[1] || "image/png";
          return {
            role: m.role,
            content: [
              { type: "image", source: { type: "base64", media_type: mime, data: b64 } },
              { type: "text", text: m.content },
            ],
          };
        }
        return { role: m.role, content: m.content };
      });

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      if (imageMode) {
        // ─── Image generation path ───
        setGeneratingImage(true);
        try {
          const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-assistant`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              messages: apiMessages,
              mode: "image",
            }),
            signal: abortController.signal,
          });
          const data = await res.json();
          if (data.insufficient_credits) {
            showOutOfCreditsModal();
            return;
          }
          if (data.error) {
            const _errMsg = { role: "assistant" as const, content: `⚠️ ${data.error}` };
            const _withErr = capMessages([...messagesRef.current, _errMsg]);
            messagesRef.current = _withErr;
            setMessages(_withErr);
            onMessagesChangeRef.current?.(_withErr);
          } else {
            // Convert base64 to blob URL immediately, then drop base64 from state to save memory
            const blobUrl = data.image_b64 ? getBlobUrl(data.image_b64) : undefined;
            const _imgMsg: Message = {
              role: "assistant",
              content: data.revised_prompt || "Image generated",
              type: "image",
              image_b64: undefined, // stripped — blob URL used for display
              _blobUrl: blobUrl,
              revised_prompt: data.revised_prompt,
              credits_used: data.credits_used,
            };
            const _withImg = capMessages([...messagesRef.current, _imgMsg]);
            messagesRef.current = _withImg;
            setMessages(_withImg);
            // Persist with the original base64 so DB has the image, then let it GC
            const _persistMsg: Message = { ..._imgMsg, image_b64: data.image_b64 };
            const _withPersist = capMessages([...messagesRef.current.slice(0, -1), _persistMsg]);
            onMessagesChangeRef.current?.(_withPersist);
          }
        } finally {
          setGeneratingImage(false);
        }
        setImageMode(false);
      } else {
        // ─── Text chat path ───
        // Extract connected image signed URLs for Claude vision
        const connectedImageUrls = (cc.media_files || [])
          .filter((m: any) => m.file_type === "image" && m.signed_url)
          .map((m: any) => m.signed_url as string);

        // Subtle ideation detection: if the latest user message asks for
        // context-free brainstorming, we silently drop the heavy canvas
        // context for this turn only. No visible UI — the user just says
        // what they want ("no context", "brainstorm freely", "off-brand",
        // "forget my notes") and the system does the right thing.
        const lastUserText = [...apiMessages].reverse().find((m: any) => m.role === "user")?.content;
        const lastUserStr = typeof lastUserText === "string"
          ? lastUserText
          : Array.isArray(lastUserText)
            ? lastUserText.map((c: any) => c?.text ?? "").join(" ")
            : "";
        const ideating = detectIdeationIntent(lastUserStr);

        const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-assistant`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            messages: apiMessages,
            canvas_mode: true,
            client_info: ideating
              ? { name: clientInfo?.name, target: clientInfo?.target }
              : { ...clientInfo, canvas_context: cappedContext },
            ideation_mode: ideating,
            model: aiModelRef.current,
            thinking: thinkingRef.current || undefined,
            canvas_image_urls: connectedImageUrls.length > 0 ? connectedImageUrls : undefined,
            pasted_image_b64: capturedPastedImage?.dataUrl ?? undefined,
            pasted_image_type: capturedPastedImage?.mimeType ?? undefined,
            stream: true,
            chat_id: chatId ?? undefined,
          }),
          signal: abortController.signal,
        });

        // ─── Streaming SSE path ───
        if (res.headers.get("content-type")?.includes("text/event-stream") && res.body) {
          const reader = res.body.getReader();
          const decoder = new TextDecoder();

          // Typewriter state — local to this closure so interval can close over them
          const targetRef = { current: "" };
          let displayedLen = 0;
          let sseFinished = false;
          let finalContent = "";
          let finalActualModel: string | null = null;
          let finalDowngraded = false;
          let finalCreditsUsed: number | null = null;

          setStreamingContent("");

          // Clear any leftover interval
          if (typewriterRef.current) clearInterval(typewriterRef.current);

          const tid = setInterval(() => {
            const target = targetRef.current;
            if (displayedLen < target.length) {
              // Speed up if lagging behind (avoids text being too slow on long replies)
              const lag = target.length - displayedLen;
              const step = lag > 80 ? 4 : lag > 20 ? 2 : 1;
              displayedLen = Math.min(displayedLen + step, target.length);
              setStreamingContent(target.slice(0, displayedLen));
            } else if (sseFinished) {
              clearInterval(tid);
              typewriterRef.current = null;
              setStreamingContent(null);
              // Stream done — clear partial so unmount/visibility hooks don't double-write
              onStreamingPartialRef.current?.(null);
              const _aiMsg = {
                role: "assistant" as const,
                content: finalContent || "I couldn't generate a response.",
                ...(finalActualModel ? { actual_model: finalActualModel } : {}),
                ...(finalDowngraded ? { downgraded: true } : {}),
                ...(finalCreditsUsed != null ? { credits_used: finalCreditsUsed } : {}),
              };
              const _withAI = capMessages([...messagesRef.current, _aiMsg]);
              messagesRef.current = _withAI;
              setMessages(_withAI);
              onMessagesChangeRef.current?.(_withAI);
            }
          }, 16);
          typewriterRef.current = tid;

          let buf = "";
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buf += decoder.decode(value, { stream: true });
              const lines = buf.split("\n");
              buf = lines.pop() ?? "";
              for (const line of lines) {
                if (!line.startsWith("data: ")) continue;
                try {
                  const ev = JSON.parse(line.slice(6));
                  if (ev.delta) {
                    targetRef.current += ev.delta;
                    // Mirror to parent (throttled ~500ms) so the partial is recoverable
                    // if the tab is discarded or the page is refreshed mid-stream.
                    const _now = Date.now();
                    if (_now - lastPartialReportAtRef.current > 500) {
                      lastPartialReportAtRef.current = _now;
                      onStreamingPartialRef.current?.(targetRef.current);
                    }
                  } else if (ev.done) {
                    finalContent = targetRef.current;
                    finalActualModel = ev.actual_model ?? null;
                    finalDowngraded = !!ev.downgraded;
                    finalCreditsUsed = typeof ev.credits_used === "number" ? ev.credits_used : null;
                    sseFinished = true;
                  }
                } catch { /* ignore parse errors */ }
              }
            }
            // Stream ended without a done event — mark finished anyway
            if (!sseFinished) {
              finalContent = targetRef.current;
              sseFinished = true;
            }
          } finally {
            reader.releaseLock();
            // Typewriter interval handles cleanup — don't clear streamingContent here
          }
        } else {
          // ─── Fallback: non-streaming JSON path ───
          const data = await res.json();
          if (data.error) {
            console.error("[CanvasAI] Error:", data.error);
            const _errMsg = { role: "assistant" as const, content: `Error: ${data.error}` };
            const _withErr = capMessages([...messagesRef.current, _errMsg]);
            messagesRef.current = _withErr;
            setMessages(_withErr);
            onMessagesChangeRef.current?.(_withErr);
          } else {
            const _aiMsg = { role: "assistant" as const, content: data.message || "I couldn't generate a response." };
            const _withAI = capMessages([...messagesRef.current, _aiMsg]);
            messagesRef.current = _withAI;
            setMessages(_withAI);
            onMessagesChangeRef.current?.(_withAI);
          }
        }
      }
    } catch (e: any) {
      if (e?.name === "AbortError") {
        if (typewriterRef.current) { clearInterval(typewriterRef.current); typewriterRef.current = null; }
        setStreamingContent(null);
        onStreamingPartialRef.current?.(null);
        return;
      }
      const _catchMsg = { role: "assistant" as const, content: "Sorry, something went wrong." };
      const _withCatch = capMessages([...messagesRef.current, _catchMsg]);
      messagesRef.current = _withCatch;
      setMessages(_withCatch);
      onMessagesChangeRef.current?.(_withCatch);
      onStreamingPartialRef.current?.(null);
    } finally {
      setLoading(false);
      window.dispatchEvent(new Event("credits-updated"));
    }
  }, [loading, authToken, clientInfo, imageMode, generateScript]);

  // Poll window globals to keep hasContext / contextCount fresh (props are stale due to memo)
  const [liveHasContext, setLiveHasContext] = useState(false);
  // Auto-message trigger — fired by SuperPlanningCanvas after incoming batch videos are injected
  useEffect(() => {
    const id = setInterval(() => {
      const msg = (window as any).__canvasAutoMessage;
      if (!msg) return;
      delete (window as any).__canvasAutoMessage;
      if (msg === "[voice_input]") {
        toggleVoice();
        return;
      }
      clearInterval(id);
      sendMessage(msg);
    }, 500);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [contextCount, setContextCount] = useState(0);
  // Live snapshot of canvas nodes for the @ mention dropdown. Refreshed on the
  // same 1.5s tick used for context-count, so the dropdown stays in sync as
  // nodes are added/removed without forcing a full ReactFlow re-render.
  const [canvasNodesForMention, setCanvasNodesForMention] = useState<
    { id: string; type: string; label?: string; detail?: string }[]
  >([]);
  useEffect(() => {
    const tick = () => {
      const ctx = getLatestContext();
      setLiveHasContext(hasContext(ctx));
      setContextCount([
        ctx.transcriptions.filter(Boolean).length > 0,
        ctx.text_notes.trim().length > 0,
        ctx.research_facts.length > 0,
      ].filter(Boolean).length);
      // Build mentionable-nodes list from the same window snapshot used by
      // getLatestContext. The AssistantTextInput renders icon/label using the
      // NODE_ICON_COMPONENTS / NODE_LABELS maps passed as props.
      const rawNodes = (window as any).__canvasNodes as any[] | undefined;
      if (Array.isArray(rawNodes)) {
        const AI_NODE = "ai-assistant";
        const next = rawNodes
          .filter((n: any) => n.id !== AI_NODE && n.type !== "aiAssistantNode" && n.type !== "annotationNode")
          .map((n: any) => {
            const d = n.data || {};
            let detail = "";
            if (n.type === "videoNode") detail = d.channel_username ? `@${d.channel_username}` : (d.url ? "linked" : "empty");
            else if (n.type === "textNoteNode" || n.type === "researchNoteNode") detail = (d.noteText || "").slice(0, 30);
            else if (n.type === "competitorProfileNode" || n.type === "instagramProfileNode") detail = d.profileUrl || "";
            else if (n.type === "brandGuideNode") detail = d.brandName || "";
            else if (n.type === "hookGeneratorNode") detail = d.topic || "";
            else if (n.type === "mediaNode") detail = d.fileName || "";
            return { id: n.id, type: n.type, detail };
          });
        // Avoid resetting the array reference if the contents are identical —
        // prevents AssistantTextInput from re-rendering on every tick.
        setCanvasNodesForMention((prev) => {
          if (prev.length !== next.length) return next;
          for (let i = 0; i < next.length; i++) {
            const a = prev[i], b = next[i];
            if (!a || a.id !== b.id || a.type !== b.type || a.detail !== b.detail) return next;
          }
          return prev;
        });
      }
    };
    tick(); // run immediately
    const id = setInterval(tick, 1500); // re-check every 1.5s
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasOlderMessages = visibleCount < messages.length;
  const dynamicChips = useMemo(
    () => getDynamicChips(messages, getLatestContext()),
    // recompute when messages change; getLatestContext reads from window each call
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messages, contextCount, liveHasContext],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Format + Language row — hidden, format/language still passed via props */}

      {/* Messages — rendered by the shared AssistantChat surface (Phase B.1) */}
      <AssistantChat
        messages={messages}
        streamingContent={streamingContent}
        remoteStreamingContent={remoteStreamingContent}
        loading={loading}
        generating={generating}
        generatingImage={generatingImage}
        variant={fullscreen ? "full" : "compact"}
        visibleCount={visibleCount}
        onLoadMore={hasOlderMessages ? loadMoreOlder : undefined}
        hasOlderMessages={hasOlderMessages}
        isResearchMode={isResearchMode}
        getBlobUrl={getBlobUrl}
        hideGreeting={remixMode}
        greeting={
          language === "es" ? (
            <>¿Qué hacemos <strong className="font-bold text-foreground/80">hoy</strong>{displayName ? `, ${displayName}` : ""}?</>
          ) : (
            <>What are we doing <strong className="font-bold text-foreground/80">today</strong>{displayName ? `, ${displayName}` : ""}?</>
          )
        }
        greetingSubtitle={
          language === "es"
            ? "Conecta nodos al panel para darle contexto, o empieza abajo."
            : "Connect nodes for context, or use the suggestions below."
        }
        onSaveScript={async (script) => {
          const saveFn = onSaveScript ?? (typeof window !== "undefined" ? (window as any).__canvasSaveScript : undefined);
          if (saveFn) await saveFn(script);
        }}
        onExpandScript={(script) => onGenerateScript(script)}
        onSaveResearchToCanvas={(markdown, topic) => {
          const addFn = typeof window !== "undefined" ? (window as any).__canvasAddResearchNode : undefined;
          if (typeof addFn === "function") {
            const safeTopic = topic || "Research";
            const bulletLines = markdown.split("\n")
              .map((l) => l.replace(/^[•\-*]\s*/, "").trim())
              .filter((l) => l.length > 10 && l.length < 200 && !l.startsWith("#") && !l.startsWith("**"));
            const facts = bulletLines.slice(0, 8).map((fact) => ({ fact, impact_score: 9 }));
            addFn(safeTopic, facts.length > 0 ? facts : [{ fact: markdown.slice(0, 120), impact_score: 9 }]);
            toast.success("Research saved to canvas");
          } else {
            toast.error("Canvas not available");
          }
        }}
        onRegenerateFromMessage={(visibleIdx) => {
          const prevUser = (messages.slice(-visibleCount).slice(0, visibleIdx).reverse().find(m => m.role === "user"));
          if (prevUser) sendMessage(prevUser.content);
        }}
        onEditUserMessage={(visibleIdx, content) => {
          const allMsgs = messagesRef.current;
          const visibleSlice = allMsgs.slice(-visibleCount);
          const realIdx = allMsgs.length - visibleSlice.length + visibleIdx;
          setInput(content);
          setMessages(capMessages(allMsgs.slice(0, realIdx)));
          setTimeout(() => textareaRef.current?.focus(), 50);
        }}
        onSubmitDeck={(composed, questions, answers) => {
          sendMessage(composed, { deckMeta: { deck_questions: questions, deck_answers: answers } });
        }}
        onAutoScrolledToBottom={() => setVisibleCount(DEFAULT_WINDOW)}
      />

      {/* Input area — chips bar + AssistantTextInput. Lifted out of CanvasAIPanel
          in Phase B.1, Task 4. Canvas-context-aware bits (dynamic chips,
          mention nodes) are computed here and passed in as props. */}
      <div ref={inputBoxRef} className={`${fullscreen ? "px-4 pt-3 pb-4" : "px-3 pt-2 pb-2"} border-t border-border flex-shrink-0`}>
        <div className={fullscreen ? "max-w-3xl mx-auto w-full" : ""}>
          <AssistantChipsBar
            chips={dynamicChips}
            onChip={(chip) => sendMessage(chip)}
            disabled={loading || generating}
          />
          <AssistantTextInput
            value={input}
            onChange={(val) => {
              setInput(val);
              // Read by SuperPlanningCanvas when opening the fullscreen view
              (window as any).__canvasAIDraftInput = val;
            }}
            onSend={() => sendMessage(input)}
            onStop={stopGeneration}
            loading={loading}
            generating={generating}
            recognizing={recognizing}
            pastedImage={pastedImage}
            onClearPastedImage={() => setPastedImage(null)}
            onPaste={handlePaste}
            imageMode={imageMode}
            onToggleImageMode={() => setImageMode((v) => !v)}
            isResearchMode={isResearchMode}
            onToggleResearchMode={() => setIsResearchMode((v) => !v)}
            onGenerateScript={() => {
              if (!generating) {
                toast.info("Generating script...");
                generateScript();
              }
            }}
            generateScriptDisabled={loading || generating}
            selectedModel={selectedModel}
            models={AI_MODELS}
            onModelChange={(key) => {
              setSelectedModel(key);
              onModelChange(key);
              if (!key.includes("sonnet") && !key.includes("opus")) setThinkingEnabled(false);
            }}
            thinkingEnabled={thinkingEnabled}
            onToggleThinking={() => setThinkingEnabled((v) => !v)}
            onToggleVoice={toggleVoice}
            mentionableNodes={canvasNodesForMention}
            mentionIconMap={NODE_ICON_COMPONENTS}
            mentionLabelMap={NODE_LABELS}
            promptPresets={PROMPT_PRESETS.map((p) => ({
              name: p.name,
              description: p.description,
              prompt: p.prompt,
            }))}
            variant={fullscreen ? "full" : "compact"}
            placeholder={imageMode ? "Describe the image..." : "Ask anything about your script..."}
            inputRef={textareaRef}
          />
        </div>
      </div>
    </div>
  );
}

