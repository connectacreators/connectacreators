import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  memo,
} from "react";
import {
  ArrowLeft,
  Plus,
  Menu,
  X,
  Camera,
  Image,
  Mic,
  Search,
  Globe,
  Zap,
  FileText,
  Film,
  Sparkles,
  Palette,
  Megaphone,
  StickyNote,
  Hash,
  ClipboardList,
  MessageSquare,
  Pencil,
  Trash2,
  Square,
  Video,
} from "lucide-react";
import { Node } from "@xyflow/react";
import CanvasAIPanel from "./CanvasAIPanel";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// ── Types ──────────────────────────────────────────────────────────────────

interface SessionItem {
  id: string;
  name: string;
  created_at?: string;
}

export interface MobileCanvasViewProps {
  nodes: Node[];
  selectedClient: { id: string; name?: string; target?: string };
  authToken: string | null;
  format: string;
  language: "en" | "es";
  aiModel: string;
  canvasContextRef: React.RefObject<any>;
  onBack: () => void;
  onAddNode: (type: string) => void;
  onFormatChange: (f: string) => void;
  onLanguageChange: (l: "en" | "es") => void;
  onModelChange: (m: string) => void;
  onSaveScript: (script: any) => Promise<void>;
  sessions: SessionItem[];
  activeSessionId: string | null;
  onNewSession: () => void;
  onSwitchSession: (id: string) => void;
  saveStatus: string;
  draftScriptId: string | null;
  remixVideo?: any;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  type?: string;
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

// ── Constants ────────────────────────────────────────────────────────────

const MOBILE_AI_NODE_ID = "__mobile_ai__";
const MAX_MESSAGES = 30;

const EMPTY_CONTEXT = {
  transcriptions: [],
  structures: [],
  text_notes: "",
  research_facts: [],
  primary_topic: "",
};

const NODE_TYPE_META: Record<
  string,
  { label: string; Icon: React.ComponentType<any>; color: string }
> = {
  videoNode: { label: "Video", Icon: Video, color: "#f97316" },
  textNoteNode: { label: "Text Note", Icon: StickyNote, color: "#a78bfa" },
  researchNoteNode: { label: "Research", Icon: Search, color: "#34d399" },
  hookGeneratorNode: { label: "Hook", Icon: Sparkles, color: "#facc15" },
  brandGuideNode: { label: "Brand", Icon: Palette, color: "#f472b6" },
  ctaBuilderNode: { label: "CTA", Icon: Megaphone, color: "#fb923c" },
  instagramProfileNode: { label: "Instagram", Icon: Globe, color: "#818cf8" },
  competitorProfileNode: {
    label: "Competitor",
    Icon: Globe,
    color: "#818cf8",
  },
  mediaNode: { label: "Media", Icon: Image, color: "#22d3ee" },
  onboardingFormNode: {
    label: "Onboarding",
    Icon: ClipboardList,
    color: "#22d3ee",
  },
  annotationNode: { label: "Annotation", Icon: Hash, color: "#94a3b8" },
};

function getNodeLabel(node: Node): string {
  const d = node.data as any;
  return (
    d?.label ||
    d?.title ||
    d?.channelName ||
    d?.fileName ||
    d?.topic ||
    NODE_TYPE_META[node.type as string]?.label ||
    node.type ||
    "Node"
  );
}

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

// ── NodeDetailSheet ──────────────────────────────────────────────────────

const NodeDetailSheet = memo(
  ({ node, onClose }: { node: Node; onClose: () => void }) => {
    const d = node.data as any;
    const meta = NODE_TYPE_META[node.type as string] || {
      label: "Node",
      Icon: FileText,
      color: "#94a3b8",
    };
    const { Icon, color } = meta;
    const label = getNodeLabel(node);

    const handleSendToAI = () => {
      const message = `Please analyze this ${meta.label} node: "${label}". ${
        d?.caption || d?.noteText || d?.topic || ""
      }`;
      (window as any).__canvasAutoMessage = message;
      onClose();
    };

    const renderContent = () => {
      switch (node.type) {
        case "videoNode":
          return (
            <div className="space-y-4">
              {d?.thumbnailUrl && (
                <img
                  src={d.thumbnailUrl}
                  alt="thumbnail"
                  className="w-full rounded-xl object-cover"
                  style={{ maxHeight: 180 }}
                />
              )}
              {d?.caption && (
                <div>
                  <p
                    className="text-xs font-medium mb-1"
                    style={{ color: "#94a3b8" }}
                  >
                    Caption
                  </p>
                  <p className="text-sm" style={{ color: "#e2e8f0" }}>
                    {d.caption}
                  </p>
                </div>
              )}
              {d?.transcription && (
                <div>
                  <p
                    className="text-xs font-medium mb-1"
                    style={{ color: "#94a3b8" }}
                  >
                    Transcription
                  </p>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: "#cbd5e1" }}
                  >
                    {d.transcription}
                  </p>
                </div>
              )}
              {!d?.transcription && (
                <p className="text-xs italic" style={{ color: "#64748b" }}>
                  No transcription yet
                </p>
              )}
            </div>
          );

        case "textNoteNode":
          return (
            <div>
              <p
                className="text-xs font-medium mb-1"
                style={{ color: "#94a3b8" }}
              >
                Note
              </p>
              <p
                className="text-sm leading-relaxed whitespace-pre-wrap"
                style={{ color: "#e2e8f0" }}
              >
                {d?.noteText || d?.text || "(empty)"}
              </p>
            </div>
          );

        case "researchNoteNode":
          return (
            <div className="space-y-3">
              {d?.topic && (
                <div>
                  <p
                    className="text-xs font-medium mb-1"
                    style={{ color: "#94a3b8" }}
                  >
                    Topic
                  </p>
                  <p className="text-sm font-semibold" style={{ color: "#e2e8f0" }}>
                    {d.topic}
                  </p>
                </div>
              )}
              {d?.facts && Array.isArray(d.facts) && d.facts.length > 0 && (
                <div>
                  <p
                    className="text-xs font-medium mb-2"
                    style={{ color: "#94a3b8" }}
                  >
                    Facts
                  </p>
                  <ul className="space-y-1.5">
                    {d.facts.map((fact: string, i: number) => (
                      <li key={i} className="flex items-start gap-2">
                        <span style={{ color: "#34d399", flexShrink: 0 }}>•</span>
                        <span className="text-sm" style={{ color: "#cbd5e1" }}>
                          {fact}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );

        case "mediaNode":
          return (
            <div className="space-y-3">
              {d?.fileName && (
                <div>
                  <p
                    className="text-xs font-medium mb-1"
                    style={{ color: "#94a3b8" }}
                  >
                    File
                  </p>
                  <p className="text-sm" style={{ color: "#e2e8f0" }}>
                    {d.fileName}
                  </p>
                </div>
              )}
              {d?.fileType && (
                <div>
                  <p
                    className="text-xs font-medium mb-1"
                    style={{ color: "#94a3b8" }}
                  >
                    Type
                  </p>
                  <p className="text-sm" style={{ color: "#cbd5e1" }}>
                    {d.fileType}
                  </p>
                </div>
              )}
              {d?.transcription ? (
                <div>
                  <p
                    className="text-xs font-medium mb-1"
                    style={{ color: "#94a3b8" }}
                  >
                    Transcription
                  </p>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: "#cbd5e1" }}
                  >
                    {d.transcription}
                  </p>
                </div>
              ) : (
                <p className="text-xs italic" style={{ color: "#64748b" }}>
                  No transcription yet
                </p>
              )}
            </div>
          );

        case "onboardingFormNode": {
          const od = d?.onboarding_data || {};
          const sections = Object.entries(od).filter(([, v]) => v);
          return sections.length > 0 ? (
            <div className="space-y-3">
              {sections.map(([key, val]) => (
                <div key={key}>
                  <p
                    className="text-xs font-medium mb-1 capitalize"
                    style={{ color: "#94a3b8" }}
                  >
                    {key.replace(/_/g, " ")}
                  </p>
                  <p className="text-sm" style={{ color: "#e2e8f0" }}>
                    {String(val)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs italic" style={{ color: "#64748b" }}>
              No onboarding data
            </p>
          );
        }

        default:
          return (
            <div className="space-y-2">
              <div>
                <p
                  className="text-xs font-medium mb-1"
                  style={{ color: "#94a3b8" }}
                >
                  Type
                </p>
                <p className="text-sm" style={{ color: "#e2e8f0" }}>
                  {meta.label}
                </p>
              </div>
              {d?.label && (
                <div>
                  <p
                    className="text-xs font-medium mb-1"
                    style={{ color: "#94a3b8" }}
                  >
                    Label
                  </p>
                  <p className="text-sm" style={{ color: "#e2e8f0" }}>
                    {d.label}
                  </p>
                </div>
              )}
            </div>
          );
      }
    };

    return (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 z-40"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={onClose}
        />
        {/* Sheet */}
        <div
          className="fixed left-0 right-0 bottom-0 z-50 rounded-t-2xl flex flex-col"
          style={{
            height: "80vh",
            background: "#1a1b1f",
            borderTop: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 flex-shrink-0"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
          >
            <div className="flex items-center gap-2">
              <Icon size={16} style={{ color }} />
              <span
                className="font-semibold text-sm"
                style={{ color: "#e2e8f0" }}
              >
                {label}
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg"
              style={{ background: "rgba(255,255,255,0.06)" }}
            >
              <X size={16} style={{ color: "#94a3b8" }} />
            </button>
          </div>

          {/* Content */}
          <div
            className="flex-1 overflow-y-auto px-4 py-4"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {renderContent()}
          </div>

          {/* Send to AI button */}
          <div
            className="flex-shrink-0 px-4 py-3"
            style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
          >
            <button
              onClick={handleSendToAI}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm"
              style={{ background: "#22d3ee", color: "#0a0a0c" }}
            >
              <MessageSquare size={16} />
              Send to AI
            </button>
          </div>
        </div>
      </>
    );
  }
);
NodeDetailSheet.displayName = "NodeDetailSheet";

// ── ChatSidebar (left-sliding chat history) ─────────────────────────────

interface ChatSidebarProps {
  open: boolean;
  onClose: () => void;
  sessions: SessionItem[];
  activeSessionId: string | null;
  onNewSession: () => void;
  onSwitchSession: (id: string) => void;
  onBack: () => void;
}

function groupSessionsByDate(sessions: SessionItem[]): Record<string, SessionItem[]> {
  const groups: Record<string, SessionItem[]> = {};
  const now = new Date();
  const today = now.toDateString();
  const yesterday = new Date(now.getTime() - 86400000).toDateString();

  for (const s of sessions) {
    const d = s.created_at ? new Date(s.created_at) : now;
    const ds = d.toDateString();
    let label: string;
    if (ds === today) label = "Today";
    else if (ds === yesterday) label = "Yesterday";
    else label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    if (!groups[label]) groups[label] = [];
    groups[label].push(s);
  }
  return groups;
}

const ChatSidebar = memo(({
  open,
  onClose,
  sessions,
  activeSessionId,
  onNewSession,
  onSwitchSession,
  onBack,
}: ChatSidebarProps) => {
  const grouped = useMemo(() => groupSessionsByDate(sessions), [sessions]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50"
        style={{
          background: open ? "rgba(0,0,0,0.5)" : "transparent",
          pointerEvents: open ? "auto" : "none",
          transition: "background 0.2s",
        }}
        onClick={onClose}
      />
      {/* Panel */}
      <div
        className="fixed top-0 bottom-0 left-0 z-50 flex flex-col"
        style={{
          width: "75vw",
          maxWidth: 280,
          background: "#12122a",
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.25s ease-out",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 flex-shrink-0"
          style={{ height: 56, borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <span style={{ color: "#fff", fontSize: 15, fontWeight: 600 }}>Chats</span>
          <button onClick={onClose}>
            <X size={18} style={{ color: "#888" }} />
          </button>
        </div>

        {/* New chat button */}
        <div className="px-4 pt-3 pb-2 flex-shrink-0">
          <button
            onClick={() => { onNewSession(); onClose(); }}
            className="w-full flex items-center gap-2 rounded-xl"
            style={{
              padding: "10px 12px",
              background: "rgba(34,211,238,0.1)",
              border: "1px solid rgba(34,211,238,0.2)",
              color: "#22d3ee",
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            <Plus size={14} /> New chat
          </button>
        </div>

        {/* Session list */}
        <div
          className="flex-1 overflow-y-auto px-4 py-2"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {Object.entries(grouped).map(([dateLabel, dateSessions]) => (
            <div key={dateLabel} className="mb-3">
              <div
                style={{
                  color: "#555",
                  fontSize: 9,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  marginBottom: 6,
                }}
              >
                {dateLabel}
              </div>
              {dateSessions.map((s) => {
                const isActive = s.id === activeSessionId;
                return (
                  <button
                    key={s.id}
                    onClick={() => { onSwitchSession(s.id); onClose(); }}
                    className="w-full text-left truncate mb-1"
                    style={{
                      padding: "9px 12px",
                      borderRadius: 10,
                      fontSize: 12,
                      color: isActive ? "#22d3ee" : "#999",
                      background: isActive ? "rgba(34,211,238,0.1)" : "transparent",
                      border: isActive ? "1px solid rgba(34,211,238,0.2)" : "1px solid transparent",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      display: "block",
                    }}
                  >
                    {s.name || "Untitled"}
                  </button>
                );
              })}
            </div>
          ))}
          {sessions.length === 0 && (
            <p style={{ color: "#555", fontSize: 12, fontStyle: "italic", textAlign: "center", padding: "24px 0" }}>
              No chats yet
            </p>
          )}
        </div>

        {/* Footer — back to canvas */}
        <div
          className="flex-shrink-0 px-4 py-3"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          <button
            onClick={() => { onBack(); onClose(); }}
            className="flex items-center gap-2"
            style={{ color: "#888", fontSize: 12 }}
          >
            <ArrowLeft size={14} /> Back to canvas
          </button>
        </div>
      </div>
    </>
  );
});
ChatSidebar.displayName = "ChatSidebar";

// ── PlusSheet (ChatGPT-style "+" menu) ──────────────────────────────────

interface PlusSheetProps {
  open: boolean;
  onClose: () => void;
  format: string;
  language: "en" | "es";
  aiModel: string;
  onFormatChange: (f: string) => void;
  onLanguageChange: (l: "en" | "es") => void;
  onModelChange: (m: string) => void;
  onAttachImage: () => void;
  onVoiceInput: () => void;
  onGenerateScript: () => void;
  onImageMode: () => void;
  onResearch: () => void;
}

const MODEL_LABELS: Record<string, string> = {
  "claude-haiku-4-5": "Haiku 4.5",
  "claude-sonnet-4-5": "Sonnet 4.5",
  "claude-opus-4": "Opus 4",
  "gpt-4o": "GPT-4o",
  "gpt-4o-mini": "GPT-4o mini",
};

const FORMAT_LABELS: Record<string, string> = {
  "talking_head": "Talking Head",
  "voiceover": "Voiceover",
  "text_on_screen": "Text on Screen",
  "mixed": "Mixed",
};

const PlusSheet = memo((props: PlusSheetProps) => {
  const {
    open,
    onClose,
    format,
    language,
    aiModel,
    onFormatChange,
    onLanguageChange,
    onModelChange,
    onAttachImage,
    onVoiceInput,
    onGenerateScript,
    onImageMode,
    onResearch,
  } = props;

  const [subPicker, setSubPicker] = useState<null | "model" | "format" | "language">(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const sheetStyle: React.CSSProperties = {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
    background: "#1a1a2e",
    borderRadius: "20px 20px 0 0",
    maxHeight: "75vh",
    overflowY: "auto",
  };

  const menuItemStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "13px 4px",
    width: "100%",
    background: "none",
    border: "none",
    cursor: "pointer",
  };

  const iconStyle: React.CSSProperties = {
    fontSize: 18,
    width: 28,
    textAlign: "center",
  };

  const dividerStyle: React.CSSProperties = {
    height: 1,
    background: "rgba(255,255,255,0.06)",
    margin: "4px 0",
  };

  const handleActionAndClose = (fn: () => void) => {
    fn();
    onClose();
  };

  // Sub-picker views
  if (subPicker === "model") {
    return (
      <>
        <div
          style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.5)" }}
          onClick={onClose}
        />
        <div style={sheetStyle}>
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 10, paddingBottom: 6 }}>
            <div style={{ width: 36, height: 4, background: "#444", borderRadius: 2 }} />
          </div>
          <div style={{ padding: "0 16px 16px" }}>
            <p style={{ color: "#94a3b8", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", marginBottom: 8, textTransform: "uppercase" }}>AI Model</p>
            {Object.entries(MODEL_LABELS).map(([key, label]) => (
              <button
                key={key}
                onClick={() => { onModelChange(key); setSubPicker(null); onClose(); }}
                style={{
                  ...menuItemStyle,
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: aiModel === key ? "rgba(34,211,238,0.1)" : "none",
                  marginBottom: 2,
                }}
              >
                <span style={{ ...iconStyle, color: aiModel === key ? "#22d3ee" : "#e2e8f0" }}>{aiModel === key ? "✓" : " "}</span>
                <span style={{ color: aiModel === key ? "#22d3ee" : "#e2e8f0", fontSize: 14, fontWeight: 500 }}>{label}</span>
              </button>
            ))}
            <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
              <button onClick={() => setSubPicker(null)} style={{ color: "#94a3b8", fontSize: 13, background: "none", border: "none", cursor: "pointer" }}>← Back</button>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (subPicker === "format") {
    return (
      <>
        <div
          style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.5)" }}
          onClick={onClose}
        />
        <div style={sheetStyle}>
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 10, paddingBottom: 6 }}>
            <div style={{ width: 36, height: 4, background: "#444", borderRadius: 2 }} />
          </div>
          <div style={{ padding: "0 16px 16px" }}>
            <p style={{ color: "#94a3b8", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", marginBottom: 8, textTransform: "uppercase" }}>Script Format</p>
            {Object.entries(FORMAT_LABELS).map(([key, label]) => (
              <button
                key={key}
                onClick={() => { onFormatChange(key); setSubPicker(null); onClose(); }}
                style={{
                  ...menuItemStyle,
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: format === key ? "rgba(34,211,238,0.1)" : "none",
                  marginBottom: 2,
                }}
              >
                <span style={{ ...iconStyle, color: format === key ? "#22d3ee" : "#e2e8f0" }}>{format === key ? "✓" : " "}</span>
                <span style={{ color: format === key ? "#22d3ee" : "#e2e8f0", fontSize: 14, fontWeight: 500 }}>{label}</span>
              </button>
            ))}
            <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
              <button onClick={() => setSubPicker(null)} style={{ color: "#94a3b8", fontSize: 13, background: "none", border: "none", cursor: "pointer" }}>← Back</button>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (subPicker === "language") {
    return (
      <>
        <div
          style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.5)" }}
          onClick={onClose}
        />
        <div style={sheetStyle}>
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 10, paddingBottom: 6 }}>
            <div style={{ width: 36, height: 4, background: "#444", borderRadius: 2 }} />
          </div>
          <div style={{ padding: "0 16px 16px" }}>
            <p style={{ color: "#94a3b8", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", marginBottom: 8, textTransform: "uppercase" }}>Language</p>
            {(["en", "es"] as const).map((lang) => (
              <button
                key={lang}
                onClick={() => { onLanguageChange(lang); setSubPicker(null); onClose(); }}
                style={{
                  ...menuItemStyle,
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: language === lang ? "rgba(34,211,238,0.1)" : "none",
                  marginBottom: 2,
                }}
              >
                <span style={{ ...iconStyle, color: language === lang ? "#22d3ee" : "#e2e8f0" }}>{language === lang ? "✓" : " "}</span>
                <span style={{ color: language === lang ? "#22d3ee" : "#e2e8f0", fontSize: 14, fontWeight: 500 }}>{lang === "en" ? "English" : "Español"}</span>
              </button>
            ))}
            <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
              <button onClick={() => setSubPicker(null)} style={{ color: "#94a3b8", fontSize: 13, background: "none", border: "none", cursor: "pointer" }}>← Back</button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Main sheet view
  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.5)" }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div style={sheetStyle}>
        {/* Handle bar */}
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 10, paddingBottom: 6 }}>
          <div style={{ width: 36, height: 4, background: "#444", borderRadius: 2 }} />
        </div>

        <div style={{ padding: "0 16px 24px" }}>
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            onChange={() => { handleActionAndClose(onAttachImage); }}
          />

          {/* Photo/Camera row */}
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 12, WebkitOverflowScrolling: "touch" as any }}>
            {/* Camera button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: 64,
                height: 64,
                flexShrink: 0,
                borderRadius: 12,
                background: "rgba(255,255,255,0.06)",
                border: "1.5px solid rgba(255,255,255,0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <Camera size={22} style={{ color: "#ccc" }} />
            </button>
            {/* Placeholder thumbnail buttons */}
            {[0, 1, 2, 3].map((i) => (
              <button
                key={i}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: 64,
                  height: 64,
                  flexShrink: 0,
                  borderRadius: 12,
                  background: "rgba(255,255,255,0.04)",
                  border: "1.5px solid rgba(255,255,255,0.07)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <Image size={18} style={{ color: "#555" }} />
              </button>
            ))}
          </div>

          <div style={dividerStyle} />

          {/* Action items */}
          <div style={{ paddingTop: 4 }}>
            <button style={menuItemStyle} onClick={() => handleActionAndClose(onGenerateScript)}>
              <span style={iconStyle}>🎬</span>
              <div style={{ flex: 1, textAlign: "left" }}>
                <div style={{ color: "#fff", fontSize: 14, fontWeight: 500 }}>Generate script</div>
                <div style={{ color: "#666", fontSize: 11 }}>Build from canvas context</div>
              </div>
            </button>
            <button style={menuItemStyle} onClick={() => handleActionAndClose(onImageMode)}>
              <span style={iconStyle}>🖼</span>
              <div style={{ flex: 1, textAlign: "left" }}>
                <div style={{ color: "#fff", fontSize: 14, fontWeight: 500 }}>Create image</div>
                <div style={{ color: "#666", fontSize: 11 }}>Visualize with DALL-E 3</div>
              </div>
            </button>
            <button style={menuItemStyle} onClick={() => handleActionAndClose(onResearch)}>
              <span style={iconStyle}>🔍</span>
              <div style={{ flex: 1, textAlign: "left" }}>
                <div style={{ color: "#fff", fontSize: 14, fontWeight: 500 }}>Deep research</div>
                <div style={{ color: "#666", fontSize: 11 }}>Search the web for trends</div>
              </div>
            </button>
            <button style={menuItemStyle} onClick={() => handleActionAndClose(onVoiceInput)}>
              <span style={iconStyle}>🎤</span>
              <div style={{ flex: 1, textAlign: "left" }}>
                <div style={{ color: "#fff", fontSize: 14, fontWeight: 500 }}>Voice input</div>
                <div style={{ color: "#666", fontSize: 11 }}>Speak your message</div>
              </div>
            </button>
          </div>

          <div style={dividerStyle} />

          {/* Settings items */}
          <div style={{ paddingTop: 4 }}>
            <button style={menuItemStyle} onClick={() => setSubPicker("model")}>
              <span style={iconStyle}>⚡</span>
              <div style={{ flex: 1, textAlign: "left" }}>
                <div style={{ color: "#fff", fontSize: 14, fontWeight: 500 }}>AI Model</div>
              </div>
              <span style={{ color: "#22d3ee", fontSize: 12 }}>{MODEL_LABELS[aiModel] ?? aiModel} ›</span>
            </button>
            <button style={menuItemStyle} onClick={() => setSubPicker("format")}>
              <span style={iconStyle}>📝</span>
              <div style={{ flex: 1, textAlign: "left" }}>
                <div style={{ color: "#fff", fontSize: 14, fontWeight: 500 }}>Script format</div>
              </div>
              <span style={{ color: "#22d3ee", fontSize: 12 }}>{FORMAT_LABELS[format] ?? format} ›</span>
            </button>
            <button style={menuItemStyle} onClick={() => setSubPicker("language")}>
              <span style={iconStyle}>🌐</span>
              <div style={{ flex: 1, textAlign: "left" }}>
                <div style={{ color: "#fff", fontSize: 14, fontWeight: 500 }}>Language</div>
              </div>
              <span style={{ color: "#22d3ee", fontSize: 12 }}>{language.toUpperCase()} ›</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
});
PlusSheet.displayName = "PlusSheet";

// ── Main Component ────────────────────────────────────────────────────────

const MobileCanvasView = memo((props: MobileCanvasViewProps) => {
  const {
    nodes,
    selectedClient,
    authToken,
    format,
    language,
    aiModel,
    canvasContextRef,
    onBack,
    onAddNode,
    onFormatChange,
    onLanguageChange,
    onModelChange,
    onSaveScript,
    sessions,
    activeSessionId,
    onNewSession,
    onSwitchSession,
    saveStatus,
    draftScriptId,
    remixVideo,
  } = props;

  const { user } = useAuth();

  // Selected node detail sheet
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  // AI chat state (mirrors AIAssistantNode logic)
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeMessages, setActiveMessages] = useState<ChatMessage[]>([]);
  const [chatsLoaded, setChatsLoaded] = useState(false);
  const [generatedScript, setGeneratedScript] = useState<any>(null);
  const [refinementInput, setRefinementInput] = useState<string | null>(null);

  // Sidebar & plus-sheet state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [plusSheetOpen, setPlusSheetOpen] = useState(false);

  const activeChatIdRef = useRef<string | null>(null);
  const activeMessagesRef = useRef<ChatMessage[]>([]);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);
  useEffect(() => {
    activeMessagesRef.current = activeMessages;
  }, [activeMessages]);

  // Active session name
  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId),
    [sessions, activeSessionId]
  );

  // Load chats from DB
  useEffect(() => {
    if (!user || !selectedClient?.id) {
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
          .eq("node_id", MOBILE_AI_NODE_ID)
          .order("updated_at", { ascending: false });

        if (rows && rows.length > 0) {
          setChats(rows.map((r) => ({ ...r, messages: [] })) as ChatSession[]);
          const activeRow = rows[0];
          setActiveChatId(activeRow.id);
          const { data: activeData } = await supabase
            .from("canvas_ai_chats")
            .select("messages")
            .eq("id", activeRow.id)
            .single();
          let msgs = (activeData?.messages as any) || [];
          try {
            const lsRaw = localStorage.getItem(`cc_chat_${activeRow.id}`);
            if (lsRaw) {
              const lsMsgs = JSON.parse(lsRaw);
              if (Array.isArray(lsMsgs) && lsMsgs.length > msgs.length)
                msgs = lsMsgs;
            }
          } catch {}
          setActiveMessages(
            msgs.length > MAX_MESSAGES ? msgs.slice(-MAX_MESSAGES) : msgs
          );
        } else {
          const { data: newRow, error: insertErr } = await supabase
            .from("canvas_ai_chats")
            .insert({
              user_id: user.id,
              client_id: selectedClient.id,
              node_id: MOBILE_AI_NODE_ID,
              name: "Chat 1",
              messages: [],
            })
            .select("id, name, messages, updated_at")
            .single();
          if (!insertErr && newRow) {
            setChats([newRow as ChatSession]);
            setActiveChatId(newRow.id);
            setActiveMessages([]);
          }
        }
      } catch (err) {
        console.error("[mobile-canvas] chat load error:", err);
      } finally {
        setChatsLoaded(true);
      }
    })();
  }, [user?.id, selectedClient?.id]);

  const persistMessages = useCallback(
    async (chatId: string, msgs: ChatMessage[]) => {
      const safeMsgs = stripImagesForPersistence(msgs);
      const firstUserMsg = safeMsgs.find((m) => m.role === "user");
      const autoName = firstUserMsg
        ? firstUserMsg.content.slice(0, 40) +
          (firstUserMsg.content.length > 40 ? "…" : "")
        : undefined;
      const updateData: any = {
        messages: safeMsgs,
        updated_at: new Date().toISOString(),
      };
      if (autoName) updateData.name = autoName;
      const { error } = await supabase
        .from("canvas_ai_chats")
        .update(updateData)
        .eq("id", chatId);
      if (error) console.error("[mobile-canvas] chat update error:", error);
      setChats((prev) =>
        prev.map((c) =>
          c.id === chatId
            ? {
                ...c,
                messages: msgs as any,
                updated_at: updateData.updated_at,
                ...(autoName ? { name: autoName } : {}),
              }
            : c
        )
      );
    },
    []
  );

  const handleMessagesChange = useCallback(
    (msgs: ChatMessage[]) => {
      const capped =
        msgs.length > MAX_MESSAGES ? msgs.slice(-MAX_MESSAGES) : msgs;
      activeMessagesRef.current = capped;
      setActiveMessages(capped);
      if (activeChatId) {
        try {
          localStorage.setItem(
            `cc_chat_${activeChatId}`,
            JSON.stringify(
              stripImagesForPersistence(capped).slice(-MAX_MESSAGES)
            )
          );
        } catch {}
        persistMessages(activeChatId, capped);
      }
    },
    [activeChatId, persistMessages]
  );

  const handleNodeTap = useCallback((node: Node) => {
    setSelectedNode(node);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedNode(null);
  }, []);

  // Filter out AI node, group nodes, annotations — only show content nodes
  const contentNodes = useMemo(
    () => nodes.filter(n => n.type !== "aiAssistantNode" && n.type !== "groupNode" && n.type !== "annotationNode" && n.id !== "__mobile_ai__"),
    [nodes]
  );

  const clientInfo = useMemo(
    () => ({
      name: selectedClient?.name,
      target: selectedClient?.target,
    }),
    [selectedClient]
  );

  return (
    <div
      className="fixed inset-0 flex flex-col mobile-canvas-root"
      style={{ background: "#131417", zIndex: 100 }}
    >
      {/* Mobile-specific CSS overrides */}
      <style>{`
        .mobile-canvas-root ::-webkit-scrollbar {
          width: 6px;
        }
        .mobile-canvas-root ::-webkit-scrollbar-track {
          background: transparent;
          border: 1px solid #22d3ee;
          border-radius: 3px;
        }
        .mobile-canvas-root ::-webkit-scrollbar-thumb {
          background: transparent;
          border: 1px solid #22d3ee;
          border-radius: 3px;
        }
        .mobile-canvas-root {
          scrollbar-width: thin;
          scrollbar-color: transparent transparent;
        }
        .mobile-canvas-root .border-t.border-border.flex-shrink-0 {
          display: none !important;
        }
        .mobile-canvas-root textarea {
          min-height: 32px !important;
          font-size: 14px !important;
        }
        .mobile-canvas-root .relative.flex.items-end {
          padding-left: 32px !important;
        }
      `}</style>

      {/* Header — ChatGPT style */}
      <div
        className="flex items-center justify-between px-4 flex-shrink-0"
        style={{
          height: 48,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: "#0f0f1e",
        }}
      >
        {/* Hamburger */}
        <button
          onClick={() => setSidebarOpen(true)}
          className="flex items-center justify-center"
          style={{
            width: 32,
            height: 32,
            border: "1.5px solid #333",
            borderRadius: 8,
          }}
        >
          <Menu size={16} style={{ color: "#ccc" }} />
        </button>

        {/* Center title */}
        <span
          className="font-semibold"
          style={{ color: "#fff", fontSize: 14 }}
        >
          AI Assistant{" "}
          <span style={{ color: "#666", fontSize: 11 }}>▾</span>
        </span>

        {/* New chat */}
        <button
          onClick={onNewSession}
          className="flex items-center justify-center"
          style={{
            width: 32,
            height: 32,
            border: "1.5px solid rgba(34,211,238,0.25)",
            borderRadius: "50%",
          }}
        >
          <Plus size={16} style={{ color: "#22d3ee" }} />
        </button>
      </div>

      {/* Chat Area — full height */}
      <div className="flex-1 overflow-hidden">
        {chatsLoaded ? (
          <CanvasAIPanel
            key={activeChatId ?? "no-chat"}
            canvasContext={canvasContextRef?.current ?? EMPTY_CONTEXT}
            canvasContextRef={canvasContextRef}
            clientInfo={clientInfo}
            onGenerateScript={setGeneratedScript}
            authToken={authToken}
            format={format}
            language={language}
            aiModel={aiModel || "claude-haiku-4-5"}
            remixMode={!!remixVideo}
            remixContext={
              remixVideo
                ? {
                    channel_username: remixVideo.channel_username || "",
                    format: remixVideo.format || null,
                    prompt_hint: remixVideo.caption || null,
                  }
                : null
            }
            onFormatChange={onFormatChange}
            onLanguageChange={onLanguageChange}
            onModelChange={onModelChange}
            initialInput={refinementInput}
            onInitialInputConsumed={() => setRefinementInput(null)}
            initialMessages={activeMessages}
            onMessagesChange={handleMessagesChange}
            onSaveScript={onSaveScript}
            externalDroppedImage={null}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-xs" style={{ color: "#64748b" }}>
              Loading chat...
            </div>
          </div>
        )}
      </div>

      {/* Floating "+" trigger for Plus Sheet */}
      <button
        onClick={() => setPlusSheetOpen(true)}
        className="fixed z-40 flex items-center justify-center"
        style={{
          left: 20,
          bottom: 18,
          width: 28,
          height: 28,
          background: "none",
          border: "none",
          color: "#22d3ee",
          fontSize: 22,
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        +
      </button>

      {/* Node Detail Sheet */}
      {selectedNode && (
        <NodeDetailSheet node={selectedNode} onClose={handleCloseDetail} />
      )}

      {/* Chat History Sidebar */}
      <ChatSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onNewSession={onNewSession}
        onSwitchSession={onSwitchSession}
        onBack={onBack}
      />

      {/* Plus Sheet */}
      <PlusSheet
        open={plusSheetOpen}
        onClose={() => setPlusSheetOpen(false)}
        format={format}
        language={language}
        aiModel={aiModel}
        onFormatChange={onFormatChange}
        onLanguageChange={onLanguageChange}
        onModelChange={onModelChange}
        onAttachImage={() => {
          (window as any).__canvasAutoMessage = "[attach_image]";
        }}
        onVoiceInput={() => {
          (window as any).__canvasAutoMessage = "[voice_input]";
        }}
        onGenerateScript={() => {
          (window as any).__canvasAutoMessage = "Based on all connected context, generate a complete script now.";
        }}
        onImageMode={() => {
          (window as any).__canvasAutoMessage = "Generate an image: ";
        }}
        onResearch={() => {
          (window as any).__canvasAutoMessage = "Research: ";
        }}
      />
    </div>
  );
});

MobileCanvasView.displayName = "MobileCanvasView";
export default MobileCanvasView;
