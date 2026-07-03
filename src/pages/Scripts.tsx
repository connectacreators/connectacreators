import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Film, Mic, Scissors, Sparkles, ArrowLeft, Plus, User, FileText,
  Loader2, ChevronLeft, ExternalLink, Eye, Trash2, Pencil, LogOut, MonitorPlay, Link2, Save, CheckCircle2, Circle, MicIcon, MicOff,
  Camera, Video, GripVertical, RotateCcw, Archive, Wand2, Copy, Play, Clock, AlertTriangle, MoreHorizontal, Menu, MessageSquare,
  Folder, FolderOpen, FolderPlus, Zap, LayoutGrid, Flame, FilePlus2, Upload, Share2, Clapperboard,
  Music, File, ChevronDown,
} from "lucide-react";
import { ShareFolderDialog } from "@/components/ShareFolderDialog";
// Heavy components lazy-loaded to reduce initial chunk size
const Teleprompter = lazy(() => import("@/components/Teleprompter"));
const AIScriptWizard = lazy(() => import("@/components/AIScriptWizard"));
const SuperPlanningCanvas = lazy(() => import("@/pages/SuperPlanningCanvas"));
const VideoRecorder = lazy(() => import("@/components/VideoRecorder"));
import { useTheme } from "@/hooks/useTheme";
import { useLanguage } from "@/hooks/useLanguage";
import { t, tr } from "@/i18n/translations";
import { useParams, useSearchParams, useLocation } from "react-router-dom";


import { useClients, type Client } from "@/hooks/useClients";
import { useScripts, type ScriptLine, type Script, type ScriptMetadata } from "@/hooks/useScripts";
import { useAuth } from "@/hooks/useAuth";
import ScriptsLogin from "@/components/ScriptsLogin";
import { toast } from "sonner";
import FootagePanel from "@/components/FootagePanel";
import { uploadStore } from "@/services/uploadStore";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, useDroppable, type DragEndEvent, DragOverlay, type DragStartEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import BatchGenerateModal from "@/components/BatchGenerateModal";
import ScriptDocEditor from "@/components/ScriptDocEditor";
import { checkResourceLimit } from "@/utils/planLimits";
import PageTransition from "@/components/PageTransition";
import { Skeleton } from "@/components/ui/skeleton";
import BorderGlow from "@/components/ui/BorderGlow";
import { lifecycleUpdate } from "@/lib/lifecycleStatus";
import { InspirationVideoEmbed } from "@/components/video/InspirationVideoEmbed";
import { VideoBreakdownDialog } from "@/components/video/VideoBreakdownDialog";
import { DraftFromWinningIdeaDialog } from "@/components/DraftFromWinningIdeaDialog";
import { registerViralVideo } from "@/lib/ensureViralVideo";
import { synthesizeBlocksFromLines, withUids, newBlockUid } from "@/lib/scriptBlocks";
import { buildBaseline, blockSignature } from "@/lib/scriptBlockDiff";
import { mergeRemoteBlocks } from "@/lib/scriptRemoteMerge";
import { useRealtimeScriptSync } from "@/hooks/useRealtimeScriptSync";
import { splitSentences } from "@/lib/splitSentences";
import { computeReorder } from "@/lib/reorderScripts";
import { SCRIPT_FORMATS, getFormatLabel } from "@/lib/scriptFormats";
import { getTargetLabel } from "@/lib/scriptTargets";
import { useRealtimePresence } from "@/hooks/useRealtimePresence";
import ScriptPresenceBanner from "@/components/scripts/ScriptPresenceBanner";
import { scriptBodyLength, SCRIPT_BODY_CHAR_LIMIT } from "@/lib/scriptLength";

// Droppable folder card for drag-to-folder
const EDITOR_TARGET_TRUNCATE_CHARS = 40;

function EditorTargetChip({ target, label }: { target: string; label: string }) {
  const [expanded, setExpanded] = useState(false);
  const needsTruncation = target.length > EDITOR_TARGET_TRUNCATE_CHARS;
  const display = !needsTruncation || expanded
    ? target
    : `${target.slice(0, EDITOR_TARGET_TRUNCATE_CHARS).trimEnd()}…`;
  return (
    <button
      type="button"
      onClick={() => needsTruncation && setExpanded((v) => !v)}
      title={needsTruncation && !expanded ? target : undefined}
      aria-expanded={needsTruncation ? expanded : undefined}
      aria-label={needsTruncation ? `${label}: ${target}` : undefined}
      className="inline-flex items-start gap-1 text-[10px] px-2 py-0.5 rounded-full text-left"
      style={{
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.1)",
        color: "rgba(255,255,255,0.75)",
        cursor: needsTruncation ? "pointer" : "default",
        whiteSpace: expanded ? "normal" : "nowrap",
        lineHeight: 1.5,
      }}
    >
      <span style={{ color: "rgba(255,255,255,0.5)", fontWeight: 500, flexShrink: 0 }}>{label}</span>
      <span>{display}</span>
    </button>
  );
}

function DroppableFolder({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `folder-${id}` });
  return (
    <div ref={setNodeRef} className={`transition-all rounded-2xl ${isOver ? "ring-2 ring-primary ring-offset-2 ring-offset-background scale-[1.02]" : ""}`}>
      {children}
    </div>
  );
}

// Sortable wrapper for script rows: makes each card both draggable (onto folders)
// and a drop target for reordering within the current view. The live reorder
// preview comes from SortableContext; the committed order is set on drag end.
function SortableScript({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition || "transform 180ms cubic-bezier(0.34, 1.4, 0.64, 1)",
    opacity: isDragging ? 0.4 : 1,
    cursor: "grab",
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

// Mic button using Web Speech API
function MicButton({ onTranscript }: { onTranscript: (text: string) => void }) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);
  const { language } = useLanguage();

  const toggle = useCallback(() => {
    if (listening && recRef.current) {
      recRef.current.stop();
      setListening(false);
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error(tr(t.scripts.speechNotSupported, language));
      return;
    }
    const rec = new SR();
    rec.lang = "es-MX";
    rec.interimResults = false;
    rec.continuous = true;
    rec.onresult = (e: any) => {
      let transcript = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) transcript += e.results[i][0].transcript;
      }
      if (transcript) onTranscript(transcript);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
    recRef.current = rec;
    setListening(true);
  }, [listening, onTranscript]);

  return (
    <button
      type="button"
      onClick={toggle}
      className={`absolute bottom-3 right-3 p-2 rounded-full transition-smooth ${
        listening
          ? "bg-red-500 text-white animate-pulse"
          : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"
      }`}
      title={listening ? tr(t.scripts.stopDictation, language) : tr(t.scripts.dictateWithMic, language)}
    >
      {listening ? <MicOff className="w-4 h-4" /> : <MicIcon className="w-4 h-4" />}
    </button>
  );
}

// Editorial-dark line type config — graphite surfaces softly tinted with the
// type's accent color, thin bone hairlines + a tinted 3px left edge per type.
// Tints are ~10-12% accent over hsl(var(--graphite)) so the card reads as the type at a glance.
const getTypeConfig = (lang: "en" | "es") => ({
  filming: {
    label: tr(t.scripts.filmingInstructions, lang),
    icon: Film,
    color: "text-[hsl(var(--bone) / 0.78)]",
    bg: "bg-[#2B221B]",
    border: "border-[hsl(var(--bone) / 0.14)] border-l-[3px] border-l-[#A85B1F]",
    dot: "bg-[#A85B1F]",
  },
  actor: {
    label: tr(t.scripts.voiceoverDialogue, lang),
    icon: Mic,
    color: "text-[hsl(var(--bone) / 0.78)]",
    bg: "bg-[#222829]",
    border: "border-[hsl(var(--bone) / 0.14)] border-l-[3px] border-l-[hsl(var(--aqua))]",
    dot: "bg-[hsl(var(--aqua))]",
  },
  editor: {
    label: tr(t.scripts.editingInstructions, lang),
    icon: Scissors,
    color: "text-[hsl(var(--bone) / 0.78)]",
    bg: "bg-[#1F2A22]",
    border: "border-[hsl(var(--bone) / 0.14)] border-l-[3px] border-l-[#7FB58A]",
    dot: "bg-[#7FB58A]",
  },
  text_on_screen: {
    label: tr(t.scripts.textOnScreen, lang),
    icon: MonitorPlay,
    color: "text-[hsl(var(--bone) / 0.78)]",
    bg: "bg-[#242423]",
    border: "border-[hsl(var(--bone) / 0.14)] border-l-[3px] border-l-[hsl(var(--bone) / 0.40)]",
    dot: "bg-[hsl(var(--bone) / 0.55)]",
  },
});

type View = "clients" | "client-detail" | "new-script" | "view-script" | "edit-script" | "super-planning";

// Sortable line item for drag and drop
function SortableLineItem({
  line,
  lineKey,
  globalIndex,
  isEditingThis,
  editLineText,
  setEditLineText,
  setEditingLineKey,
  viewingScriptId,
  updateScriptLineType,
  updateScriptLine,
  deleteScriptLine,
  getScriptLines,
  setParsedLines,
  pushUndo,
}: {
  line: ScriptLine;
  lineKey: string;
  globalIndex: number;
  isEditingThis: boolean;
  editLineText: string;
  setEditLineText: (v: string) => void;
  setEditingLineKey: (v: string | null) => void;
  viewingScriptId: string | null;
  updateScriptLineType: (scriptId: string, lineNumber: number, newType: string) => Promise<boolean>;
  updateScriptLine: (scriptId: string, lineNumber: number, text: string) => Promise<boolean>;
  deleteScriptLine: (scriptId: string, lineNumber: number) => Promise<boolean>;
  getScriptLines: (scriptId: string) => Promise<ScriptLine[]>;
  setParsedLines: React.Dispatch<React.SetStateAction<ScriptLine[]>>;
  pushUndo: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: lineKey });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || "transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 200ms ease-out",
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  const isPlaceholder = !line.text || line.text.trim() === "";
  const { language } = useLanguage();
  const typeConfig = getTypeConfig(language);
  const cfg = isPlaceholder
    ? { label: tr(t.scripts.selectType, language), icon: Plus, color: "text-[hsl(var(--bone) / 0.55)]", bg: "bg-[hsl(var(--graphite))]", border: "border-[hsl(var(--bone) / 0.14)] border-l-[3px] border-l-[hsl(var(--bone) / 0.20)]", dot: "bg-[hsl(var(--bone) / 0.40)]" }
    : typeConfig[line.line_type];
  const Icon = cfg.icon;

  return (
    <div ref={setNodeRef} style={style} className={`flex items-start gap-3 p-3 sm:p-4 rounded-xl border ${cfg.bg} ${cfg.border} transition-colors group`}>
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="mt-1 p-1 rounded-lg cursor-grab active:cursor-grabbing touch-none transition-colors"
        style={{ color: "hsl(var(--bone) / 0.35)" }}
        title={tr(t.scripts.dragToReorder, language)}
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <button
        className="mt-0.5 p-1.5 rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
        style={{ background: "hsl(var(--bone) / 0.05)" }}
        title={isPlaceholder ? tr(t.scripts.selectLineType, language) : tr(t.scripts.changeLineType, language)}
        onClick={async () => {
          if (!viewingScriptId) return;
          const types: ("filming" | "actor" | "editor" | "text_on_screen")[] = ["filming", "actor", "editor", "text_on_screen"];
          let nextType: "filming" | "actor" | "editor" | "text_on_screen";
          if (isPlaceholder) {
            nextType = "filming";
          } else {
            const currentIdx = types.indexOf(line.line_type);
            nextType = types[(currentIdx + 1) % types.length];
          }
          const ok = await updateScriptLineType(viewingScriptId, line.line_number, nextType);
          if (ok) {
            pushUndo();
            setParsedLines((prev) => prev.map((l) => l.line_number === line.line_number ? { ...l, line_type: nextType } : l));
          }
        }}
      >
        <Icon className={`w-4 h-4 ${cfg.color}`} />
      </button>
      <div className="flex-1 min-w-0">
        <span className="editorial-eyebrow block mb-1" style={{ letterSpacing: "0.20em", fontSize: 9 }}>{cfg.label}</span>
        {isEditingThis ? (
          <Textarea
            autoFocus
            value={editLineText}
            onChange={(e) => setEditLineText(e.target.value)}
            className="mt-1 text-sm bg-background/50 min-h-[60px]"
            onKeyDown={async (e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                const trimmed = editLineText.trim();
                if (viewingScriptId && trimmed && trimmed !== line.text) {
                  const ok = await updateScriptLine(viewingScriptId, line.line_number, trimmed);
                  if (ok) {
                    setParsedLines((prev) => prev.map((l) => l.line_number === line.line_number ? { ...l, text: trimmed } : l));
                  }
                }
                if (!trimmed) {
                  setParsedLines((prev) => prev.map((l) => l.line_number === line.line_number ? { ...l, text: line.text } : l));
                }
                setEditingLineKey(null);
              }
              if (e.key === "Escape") setEditingLineKey(null);
            }}
            onBlur={async () => {
              const trimmed = editLineText.trim();
              if (viewingScriptId && trimmed && trimmed !== line.text) {
                const ok = await updateScriptLine(viewingScriptId, line.line_number, trimmed);
                if (ok) {
                  setParsedLines((prev) => prev.map((l) => l.line_number === line.line_number ? { ...l, text: trimmed } : l));
                }
              }
              // If user cleared the text, revert to original (don't silently wipe)
              if (!trimmed) {
                setParsedLines((prev) => prev.map((l) => l.line_number === line.line_number ? { ...l, text: line.text } : l));
              }
              setEditingLineKey(null);
            }}
          />
        ) : (
          <p
            className={`mt-1 text-sm leading-relaxed cursor-pointer ${isPlaceholder ? "text-muted-foreground/60 italic" : "text-foreground"}`}
            onDoubleClick={() => { pushUndo(); setEditingLineKey(lineKey); setEditLineText(line.text); }}
          >
            {isPlaceholder && !line.text ? tr(t.scripts.doubleClickToWrite, language) : line.text}
          </p>
        )}
      </div>
      {!isEditingThis && (
        <Button
          variant="ghost"
          size="sm"
          className="opacity-0 group-hover:opacity-100 transition-smooth text-destructive hover:text-destructive h-7 w-7 p-0 flex-shrink-0 mt-1"
          title={tr(t.scripts.deleteLine, language)}
          onClick={async () => {
            if (!viewingScriptId) return;
            if (!confirm(language === "en" ? "Delete this line?" : "¿Eliminar esta línea?")) return;
            pushUndo();
            const ok = await deleteScriptLine(viewingScriptId, line.line_number);
            if (ok) {
              const fresh = await getScriptLines(viewingScriptId);
              setParsedLines(fresh);
            }
          }}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      )}
    </div>
  );
}

// Droppable zone for empty sections — allows dragging lines into empty Hook/Body/CTA
function SectionDropZone({ section, onClick }: { section: string; onClick: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `drop-${section}` });
  const { language } = useLanguage();
  return (
    <div
      ref={setNodeRef}
      className={`flex items-start gap-2 sm:gap-3 p-3 sm:p-4 rounded-2xl border transition-colors cursor-pointer group ${
        isOver
          ? "bg-[hsl(var(--bone) / 0.05)] border-[hsl(var(--bone) / 0.32)]"
          : "bg-[hsl(var(--graphite))] border-[hsl(var(--bone) / 0.14)] hover:border-[hsl(var(--bone) / 0.28)]"
      }`}
      onClick={onClick}
    >
      <div className="mt-0.5 p-1.5 rounded-xl bg-[hsl(var(--bone) / 0.05)]">
        <Plus className="w-4 h-4 text-[hsl(var(--bone) / 0.55)]" />
      </div>
      <div className="flex-1 min-w-0">
        <span className="editorial-eyebrow" style={{ letterSpacing: "0.20em", fontSize: 10 }}>
          {isOver ? tr({ en: "Drop here", es: "Suelta aquí" }, language) : tr({ en: "New line", es: "Nueva línea" }, language)}
        </span>
        <p className="text-[hsl(var(--bone) / 0.55)] mt-1 text-sm italic">
          {isOver ? tr({ en: `Move to ${section}`, es: `Mover a ${section}` }, language) : tr({ en: "Click to add a line...", es: "Haz clic para agregar una línea..." }, language)}
        </p>
      </div>
    </div>
  );
}

function ScriptsSkeleton() {
  return (
    <div className="flex-1 p-6 space-y-3 max-w-4xl mx-auto w-full">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card/50">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-8 w-8 rounded-lg flex-shrink-0" />
        </div>
      ))}
    </div>
  );
}

export default function Scripts() {
  const { clientId: urlClientId } = useParams<{ clientId?: string }>();
  const location = useLocation();

  const { theme } = useTheme();
  const { language } = useLanguage();
  const { user, role, loading: authLoading, signInWithEmail, signUpWithEmail, isAdmin, isVideographer, isConnectaPlus, isPasswordRecovery, clearPasswordRecovery } = useAuth();
  const { clients, loading: clientsLoading, addClient, updateClient } = useClients(!!user);
  const {
    scripts, trashedScripts, loading: scriptsLoading, listLoading: scriptsListLoading, fetchScriptsByClient, fetchTrashedScripts,
    categorizeAndSave, directSave, getScriptLines, getScriptBlocks, saveScriptBlocks, deleteScript, restoreScript, permanentlyDeleteScript,
    updateScript, updateGoogleDriveLink, toggleGrabado, bulkToggleGrabado, bulkDelete, persistScriptOrder,
    updateScriptLine, deleteScriptLine, updateScriptLineType, addScriptLine, moveScriptLine, reorderSectionLines, reorderAllLines,
    updateReviewStatus,
  } = useScripts();

  const [showTrash, setShowTrash] = useState(false);
  const [reviewingScript, setReviewingScript] = useState<Script | null>(null);
  const [revisionNotes, setRevisionNotes] = useState("");
  const [showRevisionInput, setShowRevisionInput] = useState(false);

  // Inline editing script lines
  const [editingLineKey, setEditingLineKey] = useState<string | null>(null);
  const [editLineText, setEditLineText] = useState("");
  // Tracks unsaved structural changes (reorder/delete) in card view
  const [isDirty, setIsDirty] = useState(false);

  const [grabadoFilter, setGrabadoFilter] = useState<"all" | "grabado" | "no-grabado">("all");
  // Review-status filter for query-param entry from /dashboard triage rows.
  // "needs_review" means review_status IS NULL OR review_status = 'needs_revision'.
  const [reviewFilter, setReviewFilter] = useState<"all" | "needs_review">("all");

  // Right-click context menu — generic (New Script) when no folder is targeted,
  // adds Delete folder when right-click landed on a folder card.
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; folderId?: string; folderName?: string } | null>(null);

  // Videographer assignment state (admin only)
  const [videographers, setVideographers] = useState<{ user_id: string; display_name: string; username: string | null }[]>([]);
  const [assignmentsMap, setAssignmentsMap] = useState<Record<string, string[]>>({}); // client_id -> videographer_user_ids
  const [assignOverlayClient, setAssignOverlayClient] = useState<string | null>(null); // client id with open overlay
  const [view, setView] = useState<View>(urlClientId ? "client-detail" : "clients");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [parsedLines, setParsedLines] = useState<ScriptLine[]>([]);
  // Full ordered block list (headings + lines) — single source of truth for the
  // unified script document.
  const [docBlocks, setDocBlocks] = useState<ScriptLine[]>([]);

  // New client form
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [showNewClient, setShowNewClient] = useState(false);

  // Script form
  const [scriptTitle, setScriptTitle] = useState("");
  const [scriptInput, setScriptInput] = useState("");
  const [inspirationUrl, setInspirationUrl] = useState("");
  const [useAsTemplate, setUseAsTemplate] = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [vaultTemplates, setVaultTemplates] = useState<{ id: string; name: string; template_lines: any }[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [formato, setFormato] = useState("");
  const [googleDriveLink, setGoogleDriveLink] = useState("");
  const [formatReferenceCreate, setFormatReferenceCreate] = useState("");
  const [viewingInspirationUrls, setViewingInspirationUrls] = useState<string[]>([]);
  const [inspirationVideoUrl, setInspirationVideoUrl] = useState<string | null>(null);
  const [editingInspirationIdx, setEditingInspirationIdx] = useState<number | null>(null);
  const [inspirationDraft, setInspirationDraft] = useState("");
  const [addingInspiration, setAddingInspiration] = useState(false);
  // Format reference link (single, mirrors inspiration) + custom-format draft + re-categorize
  const [viewingFormatReferenceUrl, setViewingFormatReferenceUrl] = useState<string | null>(null);
  const [draftFromIdeaOpen, setDraftFromIdeaOpen] = useState(false);
  // Collapsible setup cards (format / winning idea / caption). Persisted per
  // user so a tidied editor stays tidy across scripts and sessions.
  const [collapsedCards, setCollapsedCards] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem("cac:script-setup-collapsed") || "{}"); } catch { return {}; }
  });
  const toggleCard = (key: string) => {
    setCollapsedCards((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem("cac:script-setup-collapsed", JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
  };
  const cardToggleButton = (key: string) => (
    <button
      type="button"
      onClick={() => toggleCard(key)}
      className="p-1 rounded transition-colors shrink-0 hover:bg-[hsl(var(--bone)/0.06)]"
      style={{ color: "hsl(var(--bone) / 0.45)" }}
      title={collapsedCards[key] ? tr({ en: "Expand", es: "Expandir" }, language) : tr({ en: "Collapse", es: "Colapsar" }, language)}
    >
      <ChevronDown className={`w-4 h-4 transition-transform ${collapsedCards[key] ? "-rotate-90" : ""}`} />
    </button>
  );
  const [editingFormatReference, setEditingFormatReference] = useState(false);
  const [formatReferenceDraft, setFormatReferenceDraft] = useState("");
  const [formatReferenceVideoUrl, setFormatReferenceVideoUrl] = useState<string | null>(null);
  const [editingCustomFormat, setEditingCustomFormat] = useState(false);
  const [customFormatDraft, setCustomFormatDraft] = useState("");
  const [recategorizing, setRecategorizing] = useState(false);
  const [generatingCaption, setGeneratingCaption] = useState(false);
  const [viewingMetadata, setViewingMetadata] = useState<ScriptMetadata | null>(null);
  const [viewingCaption, setViewingCaption] = useState<string>("");
  const [viewingScriptId, setViewingScriptId] = useState<string | null>(null);
  const [myDisplayName, setMyDisplayName] = useState<string>("");
  const [fileSubmission, setFileSubmission] = useState<string | null>(null);
  const [linkedVideoEdit, setLinkedVideoEdit] = useState<{ id: string; client_id: string; footage: string | null; file_submission: string | null; upload_source: string | null; storage_path: string | null; storage_url: string | null; file_size_bytes: number | null } | null>(null);
  const [footageViewerOpen, setFootageViewerOpen] = useState(false);
  const [footageViewerSubfolder, setFootageViewerSubfolder] = useState<string | undefined>(undefined);
  const [footageStorageFiles, setFootageStorageFiles] = useState<{ name: string; path: string; signedUrl: string; previewUrl: string }[]>([]);
  const [submissionStorageFiles, setSubmissionStorageFiles] = useState<{ name: string; path: string; signedUrl: string; previewUrl: string }[]>([]);
  // The video-edit currently being viewed. loadStorageFiles is async, so a slow
  // load for a previous script could resolve after a switch and overwrite the
  // display with the wrong script's footage; we check this ref before setState.
  const currentVeIdRef = useRef<string | null>(null);

  // Edit mode
  const [editingScript, setEditingScript] = useState<Script | null>(null);
  const [renamingScriptId, setRenamingScriptId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [showTeleprompter, setShowTeleprompter] = useState(false);
  const [showRecorder, setShowRecorder] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [aiMode, setAiMode] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [remixVideo, setRemixVideo] = useState<{
    id: string; url: string | null; thumbnail_url: string | null;
    caption: string | null; channel_username: string; platform: string;
    formatDetection?: { format: string; confidence: number; wizard_config: { suggested_format?: string; prompt_hint?: string; use_transcript_as_template?: boolean } } | null;
    // Cached analysis fields (set when video has already been transcribed/analyzed)
    transcription?: string | null;
    hookText?: string | null;
    ctaText?: string | null;
    frameworkMeta?: { raw_structure?: any; content_type?: string | null; [key: string]: any } | null;
    isPreAnalyzed?: boolean;
  } | null>(null);
  const [incomingVideos, setIncomingVideos] = useState<any[] | null>(null);
  const [resetLoading, setResetLoading] = useState(false);

  const [savingScript, setSavingScript] = useState(false);

  // Script history
  const [showHistory, setShowHistory] = useState(false);
  const [versions, setVersions] = useState<any[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);

  // Create videographer form (admin)
  const [showNewVideographer, setShowNewVideographer] = useState(false);
  const [vidUsername, setVidUsername] = useState("");
  const [vidEmail, setVidEmail] = useState("");
  const [vidPassword, setVidPassword] = useState("");
  const [vidName, setVidName] = useState("");
  const [vidLoading, setVidLoading] = useState(false);

  // Name prompt for Google sign-ups
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [promptName, setPromptName] = useState("");
  const [namePromptLoading, setNamePromptLoading] = useState(false);
  const [primaryClientId, setPrimaryClientId] = useState<string | null>(null);

  // Inline editing client name/email
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<"name" | "email" | null>(null);
  const [editValue, setEditValue] = useState("");

  // Undo/Redo stack
  const undoStack = useRef<ScriptLine[][]>([]);

  // Script folders
  const [folders, setFolders] = useState<{ id: string; name: string; created_at: string; parent_id: string | null }[]>([]);
  const [viewingFolderId, setViewingFolderId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [sharingFolder, setSharingFolder] = useState<{ id: string; name: string } | null>(null);
  const [selectedScriptIds, setSelectedScriptIds] = useState<Set<string>>(new Set());
  const [draggingScriptId, setDraggingScriptId] = useState<string | null>(null);
  const lastSelectedIdRef = useRef<string | null>(null);

  // Drag & drop sensors (must be at component level, not inside IIFE)
  const flatPointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 5, delay: 0, tolerance: 5 } });
  const flatTouchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 100, tolerance: 5 } });
  const flatSensors = useSensors(flatPointerSensor, flatTouchSensor);

  // Listen for PASSWORD_RECOVERY event from AuthProvider
  useEffect(() => {
    if (isPasswordRecovery) {
      setShowResetPassword(true);
      clearPasswordRecovery();
    }
  }, [isPasswordRecovery, clearPasswordRecovery]);

  const handleSetNewPassword = useCallback(async () => {
    if (newPassword.length < 6) { toast.error(tr(t.scripts.passwordMinLength, language)); return; }
    setResetLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setResetLoading(false);
    if (error) toast.error(error.message);
    else { toast.success(tr(t.scripts.passwordUpdated, language)); setShowResetPassword(false); setNewPassword(""); }
  }, [newPassword]);

  // Check if user needs to set a name (Google sign-ups without name)
  useEffect(() => {
    if (!user || authLoading || isAdmin || isVideographer) return;
    const checkName = async () => {
      // Profile lookup stays the same
      const { data: profile } = await supabase.from("profiles").select("display_name").eq("user_id", user.id).maybeSingle();

      // Client name: use junction table first
      const { data: link } = await supabase
        .from("subscriber_clients")
        .select("client_id, clients(name)")
        .eq("subscriber_user_id", user.id)
        .eq("is_primary", true)
        .maybeSingle();
      const client = link?.clients ? { name: (link.clients as any).name } : null;
      if (link?.client_id) setPrimaryClientId(link.client_id);

      // Fallback if no junction entry
      const clientName = client?.name?.trim() || ((await supabase.from("clients").select("id, name").eq("user_id", user.id).maybeSingle()).data?.name?.trim());
      // Also capture fallback client id
      if (!link?.client_id) {
        const { data: fbClient } = await supabase.from("clients").select("id").eq("user_id", user.id).maybeSingle();
        if (fbClient?.id) setPrimaryClientId(fbClient.id);
      }

      // If client record already has a proper name, skip prompt
      if (clientName && clientName !== user.email && clientName !== (user.email || "").split("@")[0]) return;
      const name = profile?.display_name;
      const email = user.email || "";
      if (!name || name === email || name === email.split("@")[0]) {
        setShowNamePrompt(true);
      }
    };
    checkName();
  }, [user, authLoading, isAdmin]);

  // Fetch current user's display name for presence
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    supabase.from("profiles").select("display_name").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { if (!cancelled) setMyDisplayName(data?.display_name?.trim() || ""); });
    return () => { cancelled = true; };
  }, [user?.id]);

  const { others: scriptPresence } = useRealtimePresence({
    roomId: viewingScriptId ? `script:${viewingScriptId}` : "",
    userId: user?.id || "",
    currentView: "script",
    displayName: myDisplayName,
  });

  const handleSaveName = useCallback(async () => {
    if (!promptName.trim() || !user) return;
    setNamePromptLoading(true);
    try {
      // Update profile
      await supabase
        .from("profiles")
        .update({ display_name: promptName.trim() })
        .eq("user_id", user.id);
      // Update client record name (use primary client id from junction table, fall back to user_id match)
      if (primaryClientId) {
        await supabase
          .from("clients")
          .update({ name: promptName.trim() })
          .eq("id", primaryClientId);
      } else {
        await supabase
          .from("clients")
          .update({ name: promptName.trim() })
          .eq("user_id", user.id);
      }
      setShowNamePrompt(false);
      toast.success(tr(t.scripts.nameSaved, language));
      // Refresh clients
      window.location.reload();
    } catch (e) {
      console.error(e);
      toast.error(tr(t.scripts.errorSavingName, language));
    } finally {
      setNamePromptLoading(false);
    }
  }, [promptName, user]);

  // Fetch videographers list and assignments (admin only)
  useEffect(() => {
    if (!isAdmin || !user) return;
    const fetchVid = async () => {
      // Get all videographer user_ids
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "videographer");
      if (!roles || roles.length === 0) { setVideographers([]); return; }
      const ids = roles.map((r) => r.user_id);
      const { data: profiles } = await supabase.from("profiles").select("user_id, display_name, username").in("user_id", ids);
      setVideographers((profiles || []).map((p) => ({ user_id: p.user_id, display_name: p.display_name || "Sin nombre", username: p.username })));
      // Fetch all assignments
      const { data: assignments } = await supabase.from("videographer_clients").select("videographer_user_id, client_id");
      const map: Record<string, string[]> = {};
      (assignments || []).forEach((a) => {
        if (!map[a.client_id]) map[a.client_id] = [];
        map[a.client_id].push(a.videographer_user_id);
      });
      setAssignmentsMap(map);
    };
    fetchVid();
  }, [isAdmin, user]);

  const toggleVideographerAssignment = async (clientId: string, vidUserId: string) => {
    const current = assignmentsMap[clientId] || [];
    if (current.includes(vidUserId)) {
      await supabase.from("videographer_clients").delete().eq("client_id", clientId).eq("videographer_user_id", vidUserId);
      setAssignmentsMap((prev) => ({ ...prev, [clientId]: current.filter((v) => v !== vidUserId) }));
    } else {
      await supabase.from("videographer_clients").insert({ client_id: clientId, videographer_user_id: vidUserId });
      setAssignmentsMap((prev) => ({ ...prev, [clientId]: [...current, vidUserId] }));
    }
  };

  // Detect remix video from router state (navigated from ViralVideoDetail)
  useEffect(() => {
    const state = location.state as { remixVideo?: typeof remixVideo; incomingVideos?: any[] } | null;
    if (state?.remixVideo) {
      setRemixVideo(state.remixVideo);
    }
    if (state?.incomingVideos && state.incomingVideos.length >= 2) {
      setIncomingVideos(state.incomingVideos);
    }
    if (state?.remixVideo || state?.incomingVideos) {
      // Clear router state so back navigation doesn't re-trigger
      window.history.replaceState({}, "", window.location.pathname + window.location.search);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-open AI wizard when remix video + selected client are both ready
  useEffect(() => {
    if (!remixVideo || !selectedClient) return;
    // Route directly to canvas — do NOT set aiMode, canvas doesn't use it
    setView("super-planning");
  }, [remixVideo, selectedClient]);

  // Auto-open canvas when incoming videos + selected client are both ready
  useEffect(() => {
    if (!incomingVideos || incomingVideos.length < 2 || !selectedClient) return;
    setView("super-planning");
  }, [incomingVideos, selectedClient]);

  // Auto-select client from URL param (admin/videographer deep link)
  const [searchParams, setSearchParams] = useSearchParams();
  const [autoOpenScriptTitle, setAutoOpenScriptTitle] = useState<string | null>(null);
  // Preferred over title — set by MasterEditingQueue's View Script action so we
  // resolve the script by UUID instead of a fragile title match.
  const [autoOpenScriptId, setAutoOpenScriptId] = useState<string | null>(null);

  // Consume ?filter=needs_review once on mount (sent by /dashboard triage rows),
  // then strip it so back/reload don't re-apply.
  useEffect(() => {
    if (searchParams.get("filter") !== "needs_review") return;
    setReviewFilter("needs_review");
    const next = new URLSearchParams(searchParams);
    next.delete("filter");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (clientsLoading || selectedClient) return;

    // If URL has a clientId param, auto-select that client
    if (urlClientId) {
      const target = clients.find((c) => c.id === urlClientId);
      if (target) {
        setSelectedClient(target);
        fetchScriptsByClient(target.id);
        const viewParam = searchParams.get("view");
        if (viewParam === "canvas") {
          setView("super-planning");
        } else {
          setView("client-detail");
        }
        const scriptIdParam = searchParams.get("scriptId");
        if (scriptIdParam) {
          setAutoOpenScriptId(scriptIdParam);
          searchParams.delete("scriptId");
          setSearchParams(searchParams, { replace: true });
        }
        const scriptTitleParam = searchParams.get("scriptTitle");
        if (scriptTitleParam) {
          setAutoOpenScriptTitle(scriptTitleParam);
          searchParams.delete("scriptTitle");
          setSearchParams(searchParams, { replace: true });
        }
      } else if (user) {
        // Client not in useClients result — try junction table, then fall back to primary client
        (async () => {
          // First try: this specific client via junction
          const { data: link } = await supabase
            .from("subscriber_clients")
            .select("client_id, clients(id, name, email, user_id, created_at, notion_lead_name)")
            .eq("client_id", urlClientId)
            .eq("subscriber_user_id", user.id)
            .maybeSingle();
          let c = (link as any)?.clients;

          // Second try: user's primary client (urlClientId might belong to another user)
          if (!c) {
            const { data: primary } = await supabase
              .from("subscriber_clients")
              .select("client_id, clients(id, name, email, user_id, created_at, notion_lead_name)")
              .eq("subscriber_user_id", user.id)
              .eq("is_primary", true)
              .maybeSingle();
            c = (primary as any)?.clients;
          }

          if (c) {
            setSelectedClient(c);
            fetchScriptsByClient(c.id);
            const viewParam = searchParams.get("view");
            setView(viewParam === "canvas" ? "super-planning" : "client-detail");
          }
        })();
      }
      return;
    }

    if (clients.length === 0) return;
    if (isAdmin || isVideographer) return; // Staff see the client list

    const myClient = clients.find((c) => c.user_id === user?.id);
    if (!myClient) {
      // Fallback: fetch primary client via junction table
      if (user) {
        (async () => {
          const { data: link } = await supabase
            .from("subscriber_clients")
            .select("client_id, clients(id, name, email, user_id, created_at, notion_lead_name)")
            .eq("subscriber_user_id", user.id)
            .eq("is_primary", true)
            .maybeSingle();
          const c = (link as any)?.clients;
          if (c) {
            setSelectedClient(c);
            fetchScriptsByClient(c.id);
            const viewParam = searchParams.get("view");
            setView(viewParam === "canvas" ? "super-planning" : "client-detail");
          }
        })();
      }
      return;
    }
    setSelectedClient(myClient);
    fetchScriptsByClient(myClient.id);
    setView("client-detail");
  }, [isAdmin, isVideographer, clientsLoading, clients, selectedClient, user, urlClientId]);

  // Switch client when URL clientId changes (e.g., sidebar client selector)
  useEffect(() => {
    if (!urlClientId || clientsLoading || clients.length === 0) return;
    if (selectedClient?.id === urlClientId) return;
    const target = clients.find((c) => c.id === urlClientId);
    if (target) {
      setSelectedClient(target);
      fetchScriptsByClient(target.id);
      // Respect view=canvas URL param (e.g. when navigating from BatchScriptModal)
      const viewParam = searchParams.get("view");
      setView(viewParam === "canvas" ? "super-planning" : "client-detail");
    }
  }, [urlClientId, clientsLoading, clients]);

  // Handle view=canvas when navigating back with selectedClient already set.
  // Also handle the inverse: if the URL drops view=canvas (e.g. user clicks
  // "Content Ideas" while on the canvas), drop back to the script vault.
  useEffect(() => {
    const viewParam = searchParams.get("view");
    if (viewParam === "canvas" && selectedClient) {
      setView("super-planning");
    } else if (!viewParam && selectedClient && view === "super-planning") {
      setView("client-detail");
    }
  }, [searchParams, selectedClient, view]);

  // Refresh when AI writes to scripts
  useEffect(() => {
    const handler = (e: Event) => {
      const scope = (e as CustomEvent).detail?.scope as string;
      if ((scope === "scripts" || scope === "all") && selectedClient) {
        fetchScriptsByClient(selectedClient.id);
      }
    };
    window.addEventListener("ai:data-changed", handler);
    return () => window.removeEventListener("ai:data-changed", handler);
  }, [selectedClient, fetchScriptsByClient]);

  // Auto-open script by ID from query param (preferred — set by deep links
  // from MasterEditingQueue / triage rows that have the script UUID).
  useEffect(() => {
    if (!autoOpenScriptId || scriptsLoading || scripts.length === 0) return;
    const match = scripts.find((s) => s.id === autoOpenScriptId);
    if (match) {
      handleViewScript(match);
    }
    setAutoOpenScriptId(null);
  }, [autoOpenScriptId, scriptsLoading, scripts]);

  // Auto-open script by title from query param (legacy fallback)
  useEffect(() => {
    if (!autoOpenScriptTitle || scriptsLoading || scripts.length === 0) return;
    const match = scripts.find(
      (s) => s.title.toLowerCase().trim() === autoOpenScriptTitle.toLowerCase().trim()
    );
    if (match) {
      handleViewScript(match);
    }
    setAutoOpenScriptTitle(null);
  }, [autoOpenScriptTitle, scriptsLoading, scripts]);

  // Fetch folders when client changes
  useEffect(() => {
    if (!selectedClient) { setFolders([]); setViewingFolderId(null); return; }
    supabase.from("script_folders").select("id, name, created_at, parent_id").eq("client_id", selectedClient.id).order("created_at").then(({ data }) => setFolders(data || []));
  }, [selectedClient]);

  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim() || !selectedClient) return;
    const insertData: any = { client_id: selectedClient.id, name: newFolderName.trim() };
    if (viewingFolderId) insertData.parent_id = viewingFolderId;
    const { data, error } = await supabase.from("script_folders").insert(insertData).select().single();
    if (error) { toast.error(tr({ en: "Failed to create folder", es: "No se pudo crear la carpeta" }, language)); return; }
    setFolders((prev) => [...prev, data]);
    setNewFolderName("");
    setCreatingFolder(false);
  }, [newFolderName, selectedClient, viewingFolderId, language]);

  const handleMoveToFolder = useCallback(async (scriptId: string, folderId: string | null) => {
    const { error } = await supabase.from("scripts").update({ folder_id: folderId }).eq("id", scriptId);
    if (error) { toast.error(tr({ en: "Failed to move script", es: "No se pudo mover el script" }, language)); return; }
    if (selectedClient) fetchScriptsByClient(selectedClient.id);
    toast.success(folderId
      ? tr({ en: "Script moved to folder", es: "Script movido a la carpeta" }, language)
      : tr({ en: "Script removed from folder", es: "Script quitado de la carpeta" }, language));
  }, [selectedClient, language]);

  // Smart selection: supports plain click (toggle), Shift+click (range), Cmd/Ctrl+click (add/remove)
  const handleScriptSelect = useCallback((id: string, e?: React.MouseEvent, visibleIds?: string[]) => {
    if (e?.shiftKey && lastSelectedIdRef.current && visibleIds) {
      // Shift+click: select range from last selected to current
      const lastIdx = visibleIds.indexOf(lastSelectedIdRef.current);
      const curIdx = visibleIds.indexOf(id);
      if (lastIdx !== -1 && curIdx !== -1) {
        const start = Math.min(lastIdx, curIdx);
        const end = Math.max(lastIdx, curIdx);
        const rangeIds = visibleIds.slice(start, end + 1);
        setSelectedScriptIds((prev) => {
          const next = new Set(prev);
          rangeIds.forEach((rid) => next.add(rid));
          return next;
        });
        return;
      }
    }
    // Plain click or Cmd/Ctrl+click: toggle individual
    setSelectedScriptIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    lastSelectedIdRef.current = id;
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectedScriptIds(new Set());
    lastSelectedIdRef.current = null;
  }, []);

  // Keyboard shortcuts: Cmd/Ctrl+A = select all, Escape = deselect
  useEffect(() => {
    if (view !== "client-detail") return;
    const handler = (e: KeyboardEvent) => {
      // Don't intercept when typing in inputs/textareas
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;

      if ((e.metaKey || e.ctrlKey) && e.key === "a") {
        e.preventDefault();
        setSelectedScriptIds(new Set(scripts.map((s) => s.id)));
      }
      if (e.key === "Escape" && selectedScriptIds.size > 0) {
        e.preventDefault();
        setSelectedScriptIds(new Set());
        lastSelectedIdRef.current = null;
      }
    };
    window.addEventListener("keydown", handler, true); // capture phase to beat browser default
    return () => window.removeEventListener("keydown", handler, true);
  }, [view, scripts, selectedScriptIds.size]);

  const handleBulkMoveToFolder = useCallback(async (folderId: string | null) => {
    const ids = Array.from(selectedScriptIds);
    await Promise.all(ids.map((id) => supabase.from("scripts").update({ folder_id: folderId }).eq("id", id)));
    if (selectedClient) fetchScriptsByClient(selectedClient.id);
    toast.success(tr({
      en: `${ids.length} script${ids.length !== 1 ? "s" : ""} ${folderId ? "moved to folder" : "removed from folder"}`,
      es: `${ids.length} script${ids.length !== 1 ? "s" : ""} ${folderId ? (ids.length === 1 ? "movido a la carpeta" : "movidos a la carpeta") : (ids.length === 1 ? "quitado de la carpeta" : "quitados de la carpeta")}`,
    }, language));
    exitSelectMode();
  }, [selectedScriptIds, selectedClient, exitSelectMode, language]);

  // Bulk actions for smart context menu
  const handleBulkGrabado = useCallback(async (grabado: boolean) => {
    const ids = Array.from(selectedScriptIds);
    await bulkToggleGrabado(ids, grabado);
    exitSelectMode();
  }, [selectedScriptIds, bulkToggleGrabado, exitSelectMode]);

  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedScriptIds);
    await bulkDelete(ids);
    exitSelectMode();
  }, [selectedScriptIds, bulkDelete, exitSelectMode]);

  // Select all visible (filtered) scripts
  const handleSelectAll = useCallback((filteredScripts: typeof scripts) => {
    setSelectedScriptIds(new Set(filteredScripts.map((s) => s.id)));
  }, []);

  // Drag-to-folder handlers for script list DndContext
  const listPointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 8 } });
  const listTouchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } });
  const listSensors = useSensors(listPointerSensor, listTouchSensor);

  const handleListDragStart = useCallback((event: DragStartEvent) => {
    const id = String(event.active.id);
    setDraggingScriptId(id);
    // If dragged script isn't selected, select only it
    if (!selectedScriptIds.has(id)) {
      setSelectedScriptIds(new Set([id]));
    }
  }, [selectedScriptIds]);

  const handleListDragEnd = useCallback(async (event: DragEndEvent) => {
    setDraggingScriptId(null);
    const { active, over } = event;
    if (!over) return;
    const overId = String(over.id);
    const ids = Array.from(selectedScriptIds);
    if (ids.length === 0) return;

    // ── Drop onto a folder chip → move into that folder (unchanged behavior) ──
    if (overId.startsWith("folder-")) {
      const actualFolderId = overId.replace("folder-", "");
      await Promise.all(ids.map((id) => supabase.from("scripts").update({ folder_id: actualFolderId }).eq("id", id)));
      if (selectedClient) fetchScriptsByClient(selectedClient.id);
      toast.success(tr({
        en: `${ids.length} script${ids.length !== 1 ? "s" : ""} moved to folder`,
        es: `${ids.length} script${ids.length !== 1 ? "s" : ""} ${ids.length === 1 ? "movido a la carpeta" : "movidos a la carpeta"}`,
      }, language));
      exitSelectMode();
      return;
    }

    // ── Drop onto another script → reorder within the current view ──
    if (overId === String(active.id)) return; // dropped in place
    // Recompute the visible (filtered) order — same predicate as the render below.
    const viewIds = scripts
      .filter((s) => {
        const inFolder = viewingFolderId !== null
          ? s.folder_id === viewingFolderId
          : (s.folder_id === null || s.folder_id === undefined);
        if (!inFolder) return false;
        if (grabadoFilter === "grabado" && !s.grabado) return false;
        if (grabadoFilter === "no-grabado" && s.grabado) return false;
        if (reviewFilter === "needs_review" && s.review_status === "approved") return false;
        return true;
      })
      .map((s) => s.id);
    if (!viewIds.includes(overId)) return; // dropped outside the reorderable list
    const newOrder = computeReorder(viewIds, ids, overId);
    await persistScriptOrder(newOrder);
    exitSelectMode();
  }, [selectedScriptIds, selectedClient, exitSelectMode, scripts, viewingFolderId, grabadoFilter, reviewFilter, persistScriptOrder, language]);

  // Undo/Redo helper
  const pushUndo = useCallback(() => {
    undoStack.current = [...undoStack.current.slice(-29), [...parsedLines]];
  }, [parsedLines]);

  // Keyboard listener for Ctrl+Z / Cmd+Z undo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isUndo = (e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey;
      if (!isUndo) return;

      // Don't intercept if focused in a text input, textarea, or contentEditable (TipTap doc editor)
      const activeEl = document.activeElement as HTMLElement;
      if (activeEl?.tagName?.toLowerCase() === 'input' || activeEl?.tagName?.toLowerCase() === 'textarea' || activeEl?.isContentEditable) return;

      if (undoStack.current.length === 0 || !viewingScriptId) return;

      e.preventDefault();
      const previousLines = undoStack.current.pop();
      if (!previousLines) return;

      setParsedLines(previousLines);

      // Sync all lines back to DB in one batch
      reorderAllLines(viewingScriptId, previousLines);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewingScriptId, reorderAllLines]);

  // Warn before leaving when there are unsaved changes OR a footage upload is
  // still in progress. uploadStore is read live inside the handler so an upload
  // that starts after this effect ran is still caught (refreshing mid-upload
  // would otherwise silently drop the in-progress chunking).
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const uploading = uploadStore.getAll().some(u => !u.done);
      if (editingLineKey === null && !isDirty && !uploading) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [editingLineKey, isDirty]);

  // Fetch script versions
  const fetchVersions = useCallback(async () => {
    if (!viewingScriptId) return;
    setVersionsLoading(true);
    try {
      const { data } = await supabase
        .from("script_versions")
        .select("id, version_number, created_at")
        .eq("script_id", viewingScriptId)
        .order("created_at", { ascending: false });
      setVersions(data || []);
    } catch (e) {
      console.error("Error fetching versions:", e);
      toast.error(tr({ en: "Error loading script history", es: "Error al cargar el historial del script" }, language));
    } finally {
      setVersionsLoading(false);
    }
  }, [viewingScriptId, language]);

  // Restore a previous version
  const restoreVersion = useCallback(async (versionId: string) => {
    if (!viewingScriptId) return;
    try {
      const { data: version } = await supabase
        .from("script_versions")
        .select("raw_content, lines_snapshot")
        .eq("id", versionId)
        .single();

      if (!version) {
        toast.error(tr({ en: "Version not found", es: "Versión no encontrada" }, language));
        return;
      }

      // Update raw_content on the scripts table
      await supabase
        .from("scripts")
        .update({ raw_content: version.raw_content })
        .eq("id", viewingScriptId);

      // Restore actual script_lines from the snapshot
      if (version.lines_snapshot && Array.isArray(version.lines_snapshot) && version.lines_snapshot.length > 0) {
        // Delete current lines and re-insert from snapshot
        await supabase.from("script_lines").delete().eq("script_id", viewingScriptId);
        const rows = version.lines_snapshot.map((l: any, i: number) => ({
          script_id: viewingScriptId,
          line_number: i + 1,
          line_type: l.line_type,
          section: l.section || "body",
          text: l.text,
          block_kind: l.block_kind ?? "line",
          ...(l.rich_text != null ? { rich_text: l.rich_text } : {}),
        }));
        await supabase.from("script_lines").insert(rows);
      }

      // Reload legacy line reads.
      const result = await getScriptLines(viewingScriptId);
      if (result) setParsedLines(result);

      // Reload the unified block document so the editor shows the restored content,
      // and reset the diff-save baseline to it (so the next save diffs against restored state).
      const restored = await getScriptBlocks(viewingScriptId);
      skipNextAutoSaveRef.current = true;
      setDocBlocks(withUids(restored));
      baselineRef.current = buildBaseline(restored.filter((b) => b.id) as any);
      savedOrderRef.current = restored.filter((b) => b.id).map((b) => b.id as string);
      removedIdsRef.current = new Set();

      // Bump revision so other open sessions re-sync to the restored content.
      const { data: revRow } = await supabase.from("scripts").select("revision").eq("id", viewingScriptId).maybeSingle();
      const nextRev = ((revRow?.revision as number) ?? 0) + 1;
      await supabase.from("scripts").update({ revision: nextRev }).eq("id", viewingScriptId);
      revisionRef.current = nextRev;

      toast.success(tr({ en: "Script restored successfully", es: "Script restaurado correctamente" }, language));
      setShowHistory(false);
    } catch (e) {
      console.error("Error restoring version:", e);
      toast.error(tr({ en: "Error restoring version", es: "Error al restaurar versión" }, language));
    }
  }, [viewingScriptId, language]);

  // Context menu handlers
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const handleCtxNewScript = useCallback(() => {
    setCtxMenu(null);
    setScriptTitle(""); setScriptInput(""); setInspirationUrl(""); setFormato(""); setGoogleDriveLink(""); setFormatReferenceCreate("");
    setView("new-script");
  }, []);

  const handleFolderContextMenu = useCallback((e: React.MouseEvent, folder: { id: string; name: string }) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, folderId: folder.id, folderName: folder.name });
  }, []);

  const handleCtxDeleteFolder = useCallback(async () => {
    const target = ctxMenu;
    setCtxMenu(null);
    if (!target?.folderId) return;
    const scriptCount = scripts.filter(s => s.folder_id === target.folderId).length;
    const subfolderCount = folders.filter(f => f.parent_id === target.folderId).length;
    if (scriptCount > 0 || subfolderCount > 0) {
      toast.error(tr({
        en: `"${target.folderName}" isn't empty. Move its ${scriptCount} script${scriptCount !== 1 ? "s" : ""}${subfolderCount > 0 ? ` and ${subfolderCount} subfolder${subfolderCount !== 1 ? "s" : ""}` : ""} out first.`,
        es: `"${target.folderName}" no está vacía. Primero saca sus ${scriptCount} script${scriptCount !== 1 ? "s" : ""}${subfolderCount > 0 ? ` y ${subfolderCount} subcarpeta${subfolderCount !== 1 ? "s" : ""}` : ""}.`,
      }, language));
      return;
    }
    if (!window.confirm(tr({ en: `Delete folder "${target.folderName}"?`, es: `¿Eliminar la carpeta "${target.folderName}"?` }, language))) return;
    const { error } = await supabase.from("script_folders").delete().eq("id", target.folderId);
    if (error) { toast.error(tr({ en: "Failed to delete folder", es: "No se pudo eliminar la carpeta" }, language)); return; }
    setFolders(prev => prev.filter(f => f.id !== target.folderId));
    if (viewingFolderId === target.folderId) setViewingFolderId(null);
    toast.success(tr({ en: "Folder deleted", es: "Carpeta eliminada" }, language));
  }, [ctxMenu, scripts, folders, viewingFolderId, language]);

  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => { window.removeEventListener("click", close); window.removeEventListener("scroll", close, true); };
  }, [ctxMenu]);

  // Load storage files whenever linked video edit changes
  useEffect(() => {
    // Update synchronously so any in-flight load for the previous edit is
    // discarded the moment we switch (see the guard in loadStorageFiles).
    currentVeIdRef.current = linkedVideoEdit?.id ?? null;
    if (linkedVideoEdit) {
      loadStorageFiles(linkedVideoEdit.client_id, linkedVideoEdit.id);
    } else {
      setFootageStorageFiles([]);
      setSubmissionStorageFiles([]);
    }
  }, [linkedVideoEdit?.id]);

  // Realtime sync: update linkedVideoEdit state when the DB row changes (e.g. upload from another tab)
  useEffect(() => {
    if (!linkedVideoEdit?.id) return;
    const veId = linkedVideoEdit.id;
    const veClientId = linkedVideoEdit.client_id;
    const channel = supabase
      .channel(`scripts_ve_${veId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'video_edits', filter: `id=eq.${veId}` }, (payload) => {
        const row = payload.new as any;
        setLinkedVideoEdit(prev => prev ? {
          ...prev,
          footage: row.footage,
          file_submission: row.file_submission,
          upload_source: row.upload_source,
          storage_path: row.storage_path,
          storage_url: row.storage_url,
          file_size_bytes: row.file_size_bytes,
        } : prev);
        loadStorageFiles(veClientId, veId);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [linkedVideoEdit?.id]);

  // Auth loading
  if (authLoading) {
    return (
      <PageTransition className="editorial-page-dark flex-1 flex flex-col overflow-hidden">
        <ScriptsSkeleton />
      </PageTransition>
    );
  }

  // Not logged in
  if (!user) {
    return (
      <ScriptsLogin
        onSignIn={() => {}}
        signInWithEmail={signInWithEmail}
      />
    );
  }

  const handleSelectClient = async (client: Client) => {
    setSelectedClient(client);
    await fetchScriptsByClient(client.id);
    setView("client-detail");
  };

  const handleCreateClient = async () => {
    if (!newName.trim()) return;
    const created = await addClient(newName.trim(), newEmail.trim() || undefined);
    if (created) {
      setNewName("");
      setNewEmail("");
      setShowNewClient(false);
    }
  };

  const handleCategorize = async () => {
    if (!scriptInput.trim() || !selectedClient) return;

    // Plan limit (admins and videographers are unlimited).
    if (!isAdmin && !isVideographer) {
      const limitCheck = await checkResourceLimit(selectedClient.id, "scripts");
      if (!limitCheck.allowed) {
        toast.error(
          tr({
            en: `You've reached your script limit (${limitCheck.limit} scripts). Upgrade your plan for more.`,
            es: `Has alcanzado tu límite de scripts (${limitCheck.limit} scripts). Mejora tu plan para más.`,
          }, language)
        );
        return;
      }
    }

    const ideaGanadoraToSave = scriptTitle.trim() || "Sin título";
    const persistUrl = (sid: string) => {
      const sp = new URLSearchParams(searchParams);
      sp.set("scriptId", sid);
      setSearchParams(sp, { replace: true });
    };

    // AI line/section categorization (Haiku) is gated to admin + Connecta+ to control
    // Anthropic spend. Everyone else gets positional sectioning + a default line type.
    if (isAdmin || isConnectaPlus) {
      const aiResult = await categorizeAndSave(
        selectedClient.id,
        ideaGanadoraToSave,
        scriptInput.trim(),
        inspirationUrl.trim() || undefined,
        formato || undefined,
        googleDriveLink.trim() || undefined,
      );
      if (aiResult) {
        const fresh = await getScriptLines(aiResult.scriptId);
        setParsedLines(fresh);
        setViewingInspirationUrls(inspirationUrl.trim() ? [inspirationUrl.trim()] : []);
        setViewingMetadata(aiResult.metadata);
        setViewingScriptId(aiResult.scriptId);
        const frA = formatReferenceCreate.trim();
        if (frA) await supabase.from("scripts").update({ format_reference_url: frA }).eq("id", aiResult.scriptId);
        setViewingFormatReferenceUrl(frA || null);
        persistUrl(aiResult.scriptId);
        setView("view-script");
        toast.success(tr({ en: "Script analyzed and saved!", es: "¡Script analizado y guardado!" }, language));
      }
      // categorizeAndSave surfaces its own error toast on failure.
      return;
    }

    // Fallback (no AI): positional sections (first=hook, last=cta, middle=body), default type.
    const rawLines = scriptInput.trim().split('\n').filter(l => l.trim());
    const n = rawLines.length;
    const scriptLines: ScriptLine[] = rawLines.map((line, i) => {
      let section: 'hook' | 'body' | 'cta' = 'body';
      if (n >= 3) {
        if (i === 0) section = 'hook';
        else if (i === n - 1) section = 'cta';
      } else if (n === 2) {
        section = i === 0 ? 'hook' : 'body';
      }
      return { line_type: 'actor' as const, section, text: line.trim() };
    });
    if (scriptLines.length === 0) {
      toast.error(tr({ en: "Please enter a script with at least one line", es: "Por favor ingresa un script con al menos una línea" }, language));
      return;
    }
    const result = await directSave({
      clientId: selectedClient.id,
      lines: scriptLines,
      ideaGanadora: ideaGanadoraToSave,
      target: "",
      formato: formato || "",
      inspirationUrl: inspirationUrl.trim() || undefined,
      googleDriveLink: googleDriveLink.trim() || undefined,
    });
    if (result) {
      const fresh = await getScriptLines(result.scriptId);
      setParsedLines(fresh);
      setViewingInspirationUrls(inspirationUrl.trim() ? [inspirationUrl.trim()] : []);
      setViewingMetadata(result.metadata);
      setViewingScriptId(result.scriptId);
      const frB = formatReferenceCreate.trim();
      if (frB) await supabase.from("scripts").update({ format_reference_url: frB }).eq("id", result.scriptId);
      setViewingFormatReferenceUrl(frB || null);
      persistUrl(result.scriptId);
      setView("view-script");
      toast.success(tr({ en: "Script saved successfully!", es: "¡Script guardado exitosamente!" }, language));
    }
  };

  const handleUpdate = async () => {
    if (!scriptInput.trim() || !editingScript) return;
    const result = await updateScript(
      editingScript.id,
      scriptTitle.trim() || "Sin título",
      scriptInput.trim(),
      inspirationUrl.trim() || undefined,
      formato || undefined,
      googleDriveLink.trim() || undefined
    );
    if (result) {
      const fresh = await getScriptLines(editingScript.id);
      setParsedLines(fresh);
      setViewingInspirationUrls(inspirationUrl.trim() ? [inspirationUrl.trim()] : []);
      setViewingMetadata(result.metadata);
      setViewingScriptId(editingScript.id);
      setEditingScript(null);
      setView("view-script");
    }
  };

  // Persist the full list of inspiration URLs for the script currently open in the editor.
  // inspiration_url is kept in sync with the first entry for backward compatibility.
  const persistInspirations = async (urls: string[]) => {
    if (!viewingScriptId) return;
    const clean = urls.map((u) => u.trim()).filter(Boolean);
    // Register any NEW urls in the Viral Today library (fire-and-forget) so
    // the breakdown dialog + Analyze work on them, same as canvas drops.
    clean.filter((u) => !viewingInspirationUrls.includes(u)).forEach(registerViralVideo);
    setViewingInspirationUrls(clean);
    await supabase
      .from("scripts")
      .update({ inspiration_urls: clean, inspiration_url: clean[0] ?? null })
      .eq("id", viewingScriptId);
    setScripts((prev) =>
      prev.map((s) =>
        s.id === viewingScriptId ? { ...s, inspiration_urls: clean, inspiration_url: clean[0] ?? null } : s
      )
    );
  };

  // Persist the single format-reference link (mirrors persistInspirations).
  const persistFormatReference = async (url: string | null) => {
    if (!viewingScriptId) return;
    const clean = url?.trim() || null;
    if (clean && clean !== viewingFormatReferenceUrl) registerViralVideo(clean);
    setViewingFormatReferenceUrl(clean);
    await supabase.from("scripts").update({ format_reference_url: clean }).eq("id", viewingScriptId);
    setScripts((prev) => prev.map((s) => s.id === viewingScriptId ? { ...s, format_reference_url: clean } : s));
  };

  // Select a format (preset label or custom free text) from the FORMAT card.
  const handleSelectFormat = async (value: string) => {
    if (!viewingScriptId) return;
    await supabase.from("scripts").update({ formato: value }).eq("id", viewingScriptId);
    setViewingMetadata((prev) => prev ? { ...prev, formato: value } : prev);
    setScripts((prev) => prev.map((s) => s.id === viewingScriptId ? { ...s, formato: value } : s));
  };

  // Re-run AI categorization on the CURRENT lines. Long content blocks (multiple
  // sentences) are first chopped into one line per sentence — deterministically,
  // never rewriting or reordering text — then every resulting line is recolored.
  // Headings/title/format are never touched. Gated to Connecta+.
  const handleRecategorize = async () => {
    if (!viewingScriptId || recategorizing) return;
    if (!(isAdmin || isConnectaPlus)) {
      toast.error(tr({ en: "AI categorization is available on Connecta+ only.", es: "La categorización con IA está disponible solo en Connecta+." }, language));
      return;
    }
    // Expand multi-sentence content blocks into one block per sentence. Headings
    // and empty blocks pass through untouched; split sub-lines drop rich_text.
    const expanded: ScriptLine[] = [];
    docBlocks.forEach((b) => {
      const text = (b.text || "").trim();
      if (b.block_kind === "heading" || !text) {
        expanded.push(b);
        return;
      }
      const segments = splitSentences(text);
      if (segments.length <= 1) {
        expanded.push(b);
        return;
      }
      segments.forEach((seg) => {
        expanded.push({ ...b, text: seg, rich_text: undefined, block_kind: "line", uid: newBlockUid() });
      });
    });
    const didSplit = expanded.length > docBlocks.length;
    // Index map: position in `expanded` -> AI type, for non-empty content lines only.
    const lineIdxs: number[] = [];
    expanded.forEach((b, idx) => {
      if (b.block_kind !== "heading" && (b.text || "").trim()) lineIdxs.push(idx);
    });
    if (lineIdxs.length === 0) {
      toast.error(tr({ en: "Nothing to categorize yet.", es: "No hay nada que categorizar todavía." }, language));
      return;
    }
    setRecategorizing(true);
    try {
      const lines = lineIdxs.map((idx) => (expanded[idx].text || "").trim());
      const { data, error } = await supabase.functions.invoke("categorize-script", {
        body: { mode: "recolor", lines },
      });
      if (error) throw error;
      const types: string[] | undefined = (data as any)?.types;
      if (!Array.isArray(types) || types.length !== lines.length) {
        throw new Error("mismatch");
      }
      const typeByIdx = new Map<number, string>();
      lineIdxs.forEach((idx, pos) => typeByIdx.set(idx, types[pos]));
      const merged = expanded.map((b, idx) =>
        typeByIdx.has(idx) ? { ...b, line_type: typeByIdx.get(idx) as ScriptLine["line_type"] } : b
      );
      skipNextAutoSaveRef.current = true;
      setDocBlocks(merged);
      await saveScriptBlocks(viewingScriptId, merged);
      const fresh = await getScriptLines(viewingScriptId);
      setParsedLines(fresh);
      toast.success(didSplit
        ? tr({ en: `Split & re-categorized into ${lineIdxs.length} lines`, es: `Dividido y recategorizado en ${lineIdxs.length} líneas` }, language)
        : tr({ en: "Lines re-categorized", es: "Líneas recategorizadas" }, language));
    } catch (e: any) {
      const msg = e?.message === "mismatch"
        ? tr({ en: "Couldn't align the result — nothing changed.", es: "No se pudo alinear el resultado — no se cambió nada." }, language)
        : tr({ en: "Re-categorize failed", es: "Falló la recategorización" }, language);
      toast.error(msg);
    } finally {
      setRecategorizing(false);
    }
  };

  // Generate an IG-optimized caption from the live script content via Haiku.
  // Fills (and persists) the caption field; the user can still edit afterward.
  const handleGenerateCaption = async () => {
    if (!viewingScriptId || generatingCaption) return;
    if (!(isAdmin || isConnectaPlus)) {
      toast.error(tr({ en: "AI caption generation is available on Connecta+ only.", es: "La generación de captions con IA está disponible solo en Connecta+." }, language));
      return;
    }
    // Build from the live block document (includes unsaved edits); skip headings/empties.
    const contentBlocks = docBlocks.filter((b) => b.block_kind !== "heading" && (b.text || "").trim());
    if (contentBlocks.length === 0) {
      toast.error(tr({ en: "Write the script first, then generate a caption.", es: "Escribe el script primero y luego genera el caption." }, language));
      return;
    }
    const scriptText = contentBlocks.map((b) => (b.text || "").trim()).join("\n");
    const ctaText = contentBlocks.filter((b) => b.section === "cta").map((b) => (b.text || "").trim()).join("\n");
    const title = viewingMetadata?.idea_ganadora || "";

    // Pull the creator's IG handle from onboarding so the CTA can say "Follow @handle".
    let instagramHandle = "";
    if (selectedClient?.id) {
      const { data: clientRow } = await supabase
        .from("clients")
        .select("onboarding_data")
        .eq("id", selectedClient.id)
        .maybeSingle();
      const ig = (clientRow?.onboarding_data as any)?.instagram;
      if (typeof ig === "string") instagramHandle = ig.trim().replace(/^@+/, "");
    }

    setGeneratingCaption(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-caption", {
        body: { scriptText, ctaText, title, instagramHandle },
      });
      if (error) throw error;
      const caption: string | undefined = (data as any)?.caption;
      if (!caption || typeof caption !== "string") throw new Error("no-caption");
      setViewingCaption(caption);
      // Persist alongside the script so the generated caption isn't lost.
      await supabase.from("scripts").update({ caption }).eq("id", viewingScriptId);
      await supabase.from("video_edits").update({ caption }).eq("script_id", viewingScriptId);
      toast.success(tr({ en: "Caption generated", es: "Caption generado" }, language));
    } catch (e: any) {
      const msg = e?.message?.includes("Connecta+")
        ? tr({ en: "AI caption generation is available on Connecta+ only.", es: "La generación de captions con IA está disponible solo en Connecta+." }, language)
        : tr({ en: "Couldn't generate a caption. Try again.", es: "No se pudo generar el caption. Inténtalo de nuevo." }, language);
      toast.error(msg);
    } finally {
      setGeneratingCaption(false);
    }
  };

  const handleViewScript = async (script: Script) => {
    // If draft script, open Super Planning Canvas instead
    if ((script as any).status === "draft") {
      setView("super-planning");
      return;
    }
    const lines = await getScriptLines(script.id);
    setParsedLines(lines);
    setViewingInspirationUrls(
      script.inspiration_urls && script.inspiration_urls.length
        ? script.inspiration_urls
        : (script.inspiration_url ? [script.inspiration_url] : [])
    );
    setViewingCaption(script.caption ?? "");
    savedCaptionRef.current = script.caption ?? "";
    setViewingFormatReferenceUrl(script.format_reference_url ?? null);
    setEditingFormatReference(false);
    setFormatReferenceDraft("");
    setEditingCustomFormat(false);
    setCustomFormatDraft("");
    setViewingMetadata({
      idea_ganadora: script.idea_ganadora || script.title,
      target: script.target,
      formato: script.formato,
      google_drive_link: script.google_drive_link,
    });
    setViewingScriptId(script.id);
    revisionRef.current = (script as any).revision ?? 0;
    setIsDirty(false);
    setEditingLineKey(null);
    // Load file_submission and linked video_edit record
    try {
      const { data: videoData } = await supabase.from("video_edits").select("id, client_id, file_submission, footage, upload_source, storage_path, storage_url, file_size_bytes").eq("script_id", script.id).maybeSingle();
      setFileSubmission(videoData?.file_submission || null);
      setLinkedVideoEdit(videoData ? { id: videoData.id, client_id: videoData.client_id, footage: videoData.footage, file_submission: videoData.file_submission, upload_source: videoData.upload_source, storage_path: videoData.storage_path, storage_url: videoData.storage_url, file_size_bytes: videoData.file_size_bytes } : null);
    } catch { setFileSubmission(null); setLinkedVideoEdit(null); }
    setView("view-script");
    // Persist the open script in the URL so a refresh reopens THIS script (not the
    // folder list). Cleared in goBack. The mount auto-open reads ?scriptId on load.
    const sp = new URLSearchParams(searchParams);
    sp.set("scriptId", script.id);
    setSearchParams(sp, { replace: true });
  };

  // Skip the auto-save triggered by the docBlocks change that (re)loading a script causes.
  const skipNextAutoSaveRef = useRef(false);

  // Per-session save state for non-destructive diff saves.
  const baselineRef = useRef<Map<string, string>>(new Map());
  const removedIdsRef = useRef<Set<string>>(new Set());
  const revisionRef = useRef<number | null>(null);
  const savedCaptionRef = useRef<string>("");
  // Ordered block ids as of the last persisted save — used to detect an unsaved
  // local structural change (reorder/insert/delete) so a remote merge can't relocate it.
  const savedOrderRef = useRef<string[]>([]);
  // Live mirror of docBlocks so the (ref-stable) remote-sync handler can read current state.
  const docBlocksRef = useRef<ScriptLine[]>([]);
  const viewingCaptionRef = useRef<string>("");
  // Set when a remote "saved" ping arrives while we have unsaved local edits; the next
  // successful local save re-runs the merge so peer changes aren't lost, only deferred.
  const pendingRemoteSyncRef = useRef(false);

  // User edits flow through here (NOT load-driven setDocBlocks): assign uuids to
  // newly created blocks and record explicit removals for the diff save.
  // Accepts BOTH plain arrays AND functional updaters (React.SetStateAction) because
  // ScriptDocEditor calls onBlocksChange with updater functions (e.g. on blur/Enter/undo).
  const handleBlocksChange = useCallback(
    (action: React.SetStateAction<ScriptLine[]>) => {
      setDocBlocks((prev) => {
        const next =
          typeof action === "function"
            ? (action as (p: ScriptLine[]) => ScriptLine[])(prev)
            : action;
        // Assign a fresh id to any block missing one OR whose id already appeared earlier in
        // the array. Editor split/duplicate/paste can clone a block keeping its DB id, and two
        // upsert rows with the same id crash the atomic save (ON CONFLICT cannot affect a row
        // twice). Guaranteeing unique ids lets both lines persist as separate rows.
        const seenIds = new Set<string>();
        const withIds = next.map((b) => {
          if (!b.id || seenIds.has(b.id)) {
            const fresh = crypto.randomUUID();
            seenIds.add(fresh);
            return { ...b, id: fresh };
          }
          seenIds.add(b.id);
          return b;
        });
        const nextIds = new Set(withIds.map((b) => b.id));
        prev.forEach((b) => { if (b.id && !nextIds.has(b.id)) removedIdsRef.current.add(b.id); });
        return withIds;
      });
    },
    [],
  );

  // Live collaborative sync (auto-merge of remote edits + heartbeat) is DISABLED until the
  // CRDT rebuild — the diff-merge heuristic could transiently drop lines from the editor view.
  // Saves stay non-destructive (diff-save) with version history + length cap.
  const LIVE_SYNC_ENABLED = false;
  const handleRemoteSaved = useCallback(async () => {
    if (!LIVE_SYNC_ENABLED) return;
    const sid = viewingScriptId;
    if (!sid) return;

    // If we have ANY unsaved local change (content edit, reorder/insert/delete, or a
    // pending caption edit), DEFER the merge. Applying remote state now could relocate an
    // inserted line, snap back an unsaved reorder, or drop a debounced edit. Our autosave
    // fires within ~900ms; its .then re-runs this once we're clean, so peer changes are
    // delayed, never lost.
    const cur = docBlocksRef.current;
    const anyDirty = cur.some((bl) => bl.id && baselineRef.current.get(bl.id) !== blockSignature(bl));
    const curOrder = cur.filter((bl) => bl.id).map((bl) => bl.id as string);
    const orderChanged =
      curOrder.length !== savedOrderRef.current.length ||
      curOrder.some((id, i) => savedOrderRef.current[i] !== id);
    const captionDirty = viewingCaptionRef.current !== savedCaptionRef.current;
    if (anyDirty || orderChanged || removedIdsRef.current.size > 0 || captionDirty) {
      pendingRemoteSyncRef.current = true;
      return;
    }

    const remoteBlocks = await getScriptBlocks(sid);
    const { data } = await supabase.from("scripts").select("caption, revision").eq("id", sid).maybeSingle();

    setDocBlocks((prev) => {
      // Recompute dirty inside the updater in case the user typed during the await; such a
      // block is preserved by mergeRemoteBlocks and re-armed below.
      const dirty = new Set(
        prev.filter((bl) => bl.id && baselineRef.current.get(bl.id) !== blockSignature(bl)).map((bl) => bl.id as string),
      );
      const merged = mergeRemoteBlocks(prev, remoteBlocks, dirty);
      // Blocks we accepted from remote are now the persisted baseline.
      merged.forEach((bl) => { if (bl.id && !dirty.has(bl.id)) baselineRef.current.set(bl.id, blockSignature(bl)); });
      savedOrderRef.current = merged.filter((bl) => bl.id).map((bl) => bl.id as string);
      // Only skip the merge-driven autosave when nothing is locally pending; if a race made
      // a block dirty, let the autosave fire so that edit still persists.
      skipNextAutoSaveRef.current = dirty.size === 0;
      return withUids(merged);
    });

    if (data) {
      revisionRef.current = (data as any).revision ?? revisionRef.current;
      const remoteCaption = (data as any).caption ?? "";
      // Guard the await-race: if the user started typing the caption during the fetches
      // above, keep their text and re-defer (caption onBlur will apply the remote value).
      setViewingCaption((prev) => {
        if (prev === savedCaptionRef.current) { savedCaptionRef.current = remoteCaption; return remoteCaption; }
        pendingRemoteSyncRef.current = true;
        return prev;
      });
    }
  }, [viewingScriptId]);

  const { broadcastSaved } = useRealtimeScriptSync({
    roomId: viewingScriptId ? `script:${viewingScriptId}` : "",
    onRemoteSaved: handleRemoteSaved,
  });

  // Keep refs in sync with state so the ref-stable remote-sync handler reads current values.
  useEffect(() => { docBlocksRef.current = docBlocks; }, [docBlocks]);
  useEffect(() => { viewingCaptionRef.current = viewingCaption; }, [viewingCaption]);

  // Heartbeat: realtime broadcast is best-effort; if a "saved" ping is dropped, this catches
  // up by polling the revision (cheap) and merging when the DB is ahead. Also re-syncs when
  // the tab regains focus.
  useEffect(() => {
    if (!viewingScriptId || !LIVE_SYNC_ENABLED) return;
    const sid = viewingScriptId;
    let cancelled = false;
    const check = async () => {
      const { data } = await supabase.from("scripts").select("revision").eq("id", sid).maybeSingle();
      if (cancelled) return;
      const dbRev = (data?.revision as number) ?? null;
      if (dbRev != null && revisionRef.current != null && dbRev > revisionRef.current) {
        handleRemoteSaved();
      }
    };
    const interval = setInterval(check, 25_000);
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [viewingScriptId, handleRemoteSaved]);

  // Load the full block list whenever a script is open (unified editor — the block
  // document is the single source of truth and always renders).
  // Lazy backfill: if no heading rows exist, synthesize headings in memory from the
  // distinct content-line sections (canonical order). They persist on next save.
  useEffect(() => {
    if (!viewingScriptId) return;
    let cancelled = false;
    (async () => {
      const all = await getScriptBlocks(viewingScriptId);
      if (cancelled) return;
      const hasHeadings = all.some((b) => b.block_kind === "heading");
      const next = hasHeadings ? withUids(all) : synthesizeBlocksFromLines(all);
      skipNextAutoSaveRef.current = true;
      setDocBlocks(next);
      baselineRef.current = buildBaseline(next.filter((b) => b.id) as any);
      savedOrderRef.current = next.filter((b) => b.id).map((b) => b.id as string);
      removedIdsRef.current = new Set();
      pendingRemoteSyncRef.current = false;
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingScriptId]);

  // Auto-save: silently persist the block document ~900ms after the last edit, so new
  // sections / renames / lines survive a refresh without needing the Save button. The
  // load-induced change is skipped. saveScriptBlocks is serialized per-script in the data
  // layer; we deliberately don't reset docBlocks here so typing/focus is never disrupted.
  useEffect(() => {
    if (!viewingScriptId || docBlocks.length === 0) return;
    if (skipNextAutoSaveRef.current) { skipNextAutoSaveRef.current = false; return; }
    const sid = viewingScriptId;
    const t = setTimeout(() => {
      saveScriptBlocks(sid, docBlocks, {
        baseline: baselineRef.current,
        removedIds: Array.from(removedIdsRef.current),
        expectedRevision: revisionRef.current,
      }).then((res) => {
        baselineRef.current = buildBaseline(res.blocks.filter((b) => b.id) as any);
        savedOrderRef.current = res.blocks.filter((b) => b.id).map((b) => b.id as string);
        removedIdsRef.current = new Set();
        revisionRef.current = res.revision;
        if (res.wrote) broadcastSaved();
        if (res.conflicted) {
          toast.info(tr({ en: "Synced changes from another session", es: "Se sincronizaron cambios de otra sesión" }, language));
        }
        // A remote ping arrived while we had unsaved edits — now clean, apply it.
        if (pendingRemoteSyncRef.current) { pendingRemoteSyncRef.current = false; handleRemoteSaved(); }
      }).catch(() => {});
    }, 900);
    return () => clearTimeout(t);
  }, [docBlocks, viewingScriptId, language]);

  const refreshLinkedVideoEdit = async (scriptId: string) => {
    const { data } = await supabase.from("video_edits").select("id, client_id, footage, file_submission, upload_source, storage_path, storage_url, file_size_bytes").eq("script_id", scriptId).maybeSingle();
    if (data) {
      setFileSubmission(data.file_submission || null);
      setLinkedVideoEdit({ id: data.id, client_id: data.client_id, footage: data.footage, file_submission: data.file_submission, upload_source: data.upload_source, storage_path: data.storage_path, storage_url: data.storage_url, file_size_bytes: data.file_size_bytes });
      await loadStorageFiles(data.client_id, data.id);
    }
  };

  const loadStorageFiles = async (clientId: string, videoEditId: string) => {
    const BUCKET = 'footage';
    const listAndSign = async (prefix: string) => {
      const { data } = await supabase.storage.from(BUCKET).list(prefix);
      if (!data?.length) return [];
      const files = data.filter(f => f.name && !f.name.endsWith('/'));
      const sourcePaths = files.map(f => `${prefix}${f.name}`);
      // Proxy lookup for the whole folder in one query. `footage_proxies` isn't
      // in generated types — cast. On error, previewUrl falls back to original.
      const { data: proxies } = await (supabase as any)
        .from('footage_proxies')
        .select('source_path, proxy_bucket, proxy_path, status')
        .in('source_path', sourcePaths);
      const proxyBySource = new Map<string, any>((proxies ?? []).map((p: any) => [p.source_path, p]));
      return Promise.all(files.map(async f => {
        const path = `${prefix}${f.name}`;
        const { data: url } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
        if (!url) return null;
        let previewUrl = url.signedUrl;
        const proxy = proxyBySource.get(path);
        if (proxy?.status === 'done' && proxy.proxy_path) {
          const { data: purl } = await supabase.storage
            .from(proxy.proxy_bucket || 'footage-proxies')
            .createSignedUrl(proxy.proxy_path, 3600);
          if (purl) previewUrl = purl.signedUrl;
        }
        return { name: f.name, path, signedUrl: url.signedUrl, previewUrl };
      })).then(r => r.filter(Boolean) as { name: string; path: string; signedUrl: string; previewUrl: string }[]);
    };
    const [footage, submission] = await Promise.all([
      listAndSign(`${clientId}/${videoEditId}/`),
      listAndSign(`${clientId}/${videoEditId}/submission/`),
    ]);
    // Drop stale results: the user switched scripts while this was loading.
    if (currentVeIdRef.current !== videoEditId) return;
    setFootageStorageFiles(footage);
    setSubmissionStorageFiles(submission);
  };

  const handleEditScript = (script: Script) => {
    setEditingScript(script);
    setScriptTitle(script.idea_ganadora || script.title);
    setScriptInput(script.raw_content);
    setInspirationUrl(script.inspiration_url || "");
    setFormato(script.formato || "");
    setGoogleDriveLink(script.google_drive_link || "");
    setView("edit-script");
  };

  const handleDeleteScript = async (scriptId: string) => {
    if (!confirm(tr(t.scripts.confirmDelete, language))) return;
    await deleteScript(scriptId);
  };

  const handleToggleTrash = async () => {
    if (!showTrash && selectedClient) {
      await fetchTrashedScripts(selectedClient.id);
    }
    setShowTrash(!showTrash);
  };

  const goBack = () => {
    if (view === "view-script" || view === "new-script" || view === "edit-script") {
      // Drop the ?scriptId from the URL so a refresh on the list stays on the list.
      if (searchParams.has("scriptId")) {
        const sp = new URLSearchParams(searchParams);
        sp.delete("scriptId");
        setSearchParams(sp, { replace: true });
      }
      setView("client-detail");
      setParsedLines([]);
      setDocBlocks([]);
      setScriptTitle("");
      setScriptInput("");
      setInspirationUrl("");
      setFormato("");
      setGoogleDriveLink("");
      setFormatReferenceCreate("");
      setViewingInspirationUrls([]);
      setEditingInspirationIdx(null);
      setInspirationDraft("");
      setAddingInspiration(false);
      setViewingMetadata(null);
      setViewingCaption("");
      setViewingScriptId(null);
      setEditingScript(null);
    } else if (view === "client-detail") {
      if (urlClientId) {
        // Staff coming from /clients/:clientId/scripts → go back to client detail
        window.location.href = `/clients/${urlClientId}`;
      } else {
        setView("clients");
        setSelectedClient(null);
      }
    }
  };

  return (
      <PageTransition className="editorial-page-dark flex-1 flex flex-col overflow-hidden">
      {/* Super Planning Canvas — full screen override */}
      {view === "super-planning" && selectedClient && (
        <Suspense fallback={<div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
        <div className="flex-1 overflow-hidden">
          <SuperPlanningCanvas
            key={selectedClient.id}
            selectedClient={selectedClient}
            remixVideo={remixVideo ?? undefined}
            incomingVideos={incomingVideos ?? undefined}
            onIncomingConsumed={() => setIncomingVideos(null)}
            onCancel={() => {
              setRemixVideo(null);       // clear remix state
              setIncomingVideos(null);   // clear incoming videos state
              setView("client-detail");  // MUST NOT be "new-script" — that re-triggers remix loop
              if (selectedClient) fetchScriptsByClient(selectedClient.id); // refresh list after canvas save
            }}
          />
        </div>
        </Suspense>
      )}
      {view !== "super-planning" && (
      <>

      <main className="flex-1 overflow-y-auto" onContextMenu={view === "client-detail" && selectedClient ? handleContextMenu : undefined}>
      {/* Right-click context menu popup */}
      {ctxMenu && (
        <div
          className="fixed z-[999] animate-in fade-in zoom-in-95 duration-100"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
        >
          {ctxMenu.folderId ? (
            <button
              onClick={handleCtxDeleteFolder}
              className="editorial-card flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-medium text-[hsl(var(--cream))] transition-colors hover:border-[hsl(var(--bone) / 0.32)]"
            >
              <Trash2 className="w-4 h-4" />
              {tr({ en: "Delete folder", es: "Eliminar carpeta" }, language)}
            </button>
          ) : (
            <button
              onClick={handleCtxNewScript}
              className="editorial-card flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-medium text-[hsl(var(--cream))] transition-colors hover:border-[hsl(var(--bone) / 0.32)]"
            >
              <FilePlus2 className="w-4 h-4" />
              {tr(t.scripts.newScript, language)}
            </button>
          )}
        </div>
      )}
      <div className="container mx-auto px-3 sm:px-4 py-6 sm:py-8 max-w-5xl">
        {/* Breadcrumb */}
        {view !== "clients" && (isAdmin || isVideographer || view !== "client-detail") && (
          <button onClick={goBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-smooth">
            <ChevronLeft className="w-4 h-4" />
            {view === "client-detail" && urlClientId
              ? (language === "en" ? "Back" : "Volver")
              : view === "client-detail"
                ? tr(t.scripts.clients, language)
                : selectedClient?.name}
          </button>
        )}

        {/* ===== CLIENTS LIST ===== */}
        {view === "clients" && (
          <>
            <div className="text-center mb-8">
              <h1
                className="mb-2"
                style={{
                  fontFamily: "var(--font-display, 'EB Garamond'), Georgia, serif",
                  fontWeight: 500,
                  fontSize: "clamp(28px, 4vw, 36px)",
                  letterSpacing: "-0.01em",
                  color: "hsl(var(--cream))",
                }}
              >
                {tr({ en: "Content Ideas", es: "Ideas de Contenido" }, language)}
              </h1>
              <p className="max-w-xl mx-auto" style={{ color: "hsl(var(--bone) / 0.55)", fontSize: 14 }}>
                {isAdmin ? tr(t.scripts.manageAll, language) : isVideographer ? tr(t.scripts.assignedClients, language) : tr(t.scripts.manageYour, language)}
              </p>
            </div>

            {/* New Client (admin only) */}
            {isAdmin && (
              showNewClient ? (
                <div className="editorial-card rounded-2xl p-6 mb-6 space-y-4 animate-fade-in">
                   <h3 className="font-semibold text-foreground">{tr(t.scripts.newClient, language)}</h3>
                   <Input placeholder={tr(t.scripts.clientName, language)} value={newName} onChange={(e) => setNewName(e.target.value)} />
                   <Input placeholder={tr(t.scripts.emailOptional, language)} type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
                   <div className="flex gap-3">
                     <Button onClick={handleCreateClient} disabled={!newName.trim()}>
                       <Plus className="w-4 h-4 mr-2" /> {tr(t.scripts.createClient, language)}
                     </Button>
                     <Button variant="ghost" onClick={() => setShowNewClient(false)}>{tr(t.scripts.cancel, language)}</Button>
                  </div>
                </div>
              ) : (
                 <Button onClick={() => setShowNewClient(true)} variant="outline" className="mb-6 gap-2">
                   <Plus className="w-4 h-4" /> {tr(t.scripts.newClient, language)}
                </Button>
              )
            )}

            {/* Videographer Manager (admin only) */}
            {isAdmin && (
              showNewVideographer ? (
                <div className="editorial-card rounded-2xl p-6 mb-6 space-y-4 animate-fade-in">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-foreground flex items-center gap-2">
                      <Camera className="w-5 h-5 text-emerald-400" /> {tr(t.scripts.videographers, language)}
                    </h3>
                    <button onClick={() => setShowNewVideographer(false)} className="text-muted-foreground hover:text-foreground text-sm">✕</button>
                  </div>

                  {/* Existing videographers list */}
                  {videographers.length > 0 && (
                    <div className="space-y-2 mb-4">
                      {videographers.map((v) => {
                        const assignedClients = Object.entries(assignmentsMap)
                          .filter(([, vids]) => vids.includes(v.user_id))
                          .map(([cid]) => clients.find((c) => c.id === cid))
                          .filter(Boolean);
                        return (
                          <div key={v.user_id} className="editorial-card p-3 rounded-xl space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 min-w-0">
                                <Camera className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                                <span className="font-semibold text-foreground text-sm truncate">{v.display_name}</span>
                                {v.username && <span className="text-xs text-muted-foreground">@{v.username}</span>}
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive h-7 w-7 p-0"
                                onClick={async () => {
                                  if (!confirm(`${tr(t.scripts.confirmDeleteVideographer, language)} ${v.display_name}?`)) return;
                                  try {
                                    const { data: { session } } = await supabase.auth.getSession();
                                    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-videographer`, {
                                      method: "DELETE",
                                      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
                                      body: JSON.stringify({ user_id: v.user_id }),
                                    });
                                    if (res.ok) {
                                      setVideographers((prev) => prev.filter((x) => x.user_id !== v.user_id));
                                      toast.success(tr(t.scripts.videographerDeleted, language));
                                    } else {
                                      const r = await res.json();
                                       toast.error(r.error || tr({ en: "Error", es: "Ocurrió un error" }, language));
                                    }
                                  } catch { toast.error(tr({ en: "Error", es: "Ocurrió un error" }, language)); }
                                }}
                                title={tr(t.scripts.deleteVideographer, language)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>

                            {/* Assigned clients */}
                            <div className="flex flex-wrap gap-1">
                              {assignedClients.length > 0 ? assignedClients.map((c) => (
                                <span key={c!.id} className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                                  {c!.name}
                                  <button onClick={() => toggleVideographerAssignment(c!.id, v.user_id)} className="hover:text-red-400">✕</button>
                                </span>
                              )) : (
                                <span className="text-[10px] text-muted-foreground italic">{tr(t.scripts.noAssignedClients, language)}</span>
                              )}
                            </div>

                            {/* Assign client dropdown */}
                            <Select onValueChange={(clientId) => toggleVideographerAssignment(clientId, v.user_id)}>
                              <SelectTrigger className="h-7 text-xs bg-transparent border-dashed border-muted-foreground/30">
                                <SelectValue placeholder={tr(t.scripts.assignClient, language)} />
                              </SelectTrigger>
                              <SelectContent>
                                {clients
                                  .filter((c) => !(assignmentsMap[c.id] || []).includes(v.user_id))
                                  .map((c) => (
                                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {videographers.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-2">{tr(t.scripts.noVideographers, language)}</p>
                  )}

                  {/* Create new videographer form */}
                  <div className="border-t border-border pt-4 space-y-3">
                     <h4 className="text-sm font-semibold text-muted-foreground">{tr(t.scripts.createNewVideographer, language)}</h4>
                     <Input placeholder={tr(t.scripts.username, language)} value={vidUsername} onChange={(e) => setVidUsername(e.target.value)} />
                     <Input placeholder={tr(t.scripts.fullNameLabel, language)} value={vidName} onChange={(e) => setVidName(e.target.value)} />
                     <Input placeholder={tr(t.scripts.emailRequired, language)} type="email" value={vidEmail} onChange={(e) => setVidEmail(e.target.value)} />
                     <Input placeholder={tr(t.scripts.passwordRequired, language)} type="password" value={vidPassword} onChange={(e) => setVidPassword(e.target.value)} />
                    <Button
                      onClick={async () => {
                        if (!vidUsername.trim() || !vidEmail.trim() || !vidPassword.trim()) { toast.error(tr(t.scripts.usernameEmailPasswordRequired, language)); return; }
                        setVidLoading(true);
                        try {
                          const { data: { session } } = await supabase.auth.getSession();
                          const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-videographer`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
                            body: JSON.stringify({ email: vidEmail, password: vidPassword, username: vidUsername.toLowerCase(), full_name: vidName || vidUsername }),
                          });
                          const result = await res.json();
                          if (!res.ok) throw new Error(result.error);
                          toast.success(tr(t.scripts.videographerCreated, language));
                          setVidUsername(""); setVidEmail(""); setVidPassword(""); setVidName("");
                          const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "videographer");
                          if (roles) {
                            const ids = roles.map((r) => r.user_id);
                            const { data: profiles } = await supabase.from("profiles").select("user_id, display_name, username").in("user_id", ids);
                            setVideographers((profiles || []).map((p) => ({ user_id: p.user_id, display_name: p.display_name || "Sin nombre", username: p.username })));
                          }
                        } catch (e: any) {
                          toast.error(e.message || tr({ en: "Error", es: "Ocurrió un error" }, language));
                        } finally {
                          setVidLoading(false);
                        }
                      }}
                      disabled={vidLoading || !vidUsername.trim() || !vidEmail.trim() || !vidPassword.trim()}
                      className="w-full"
                    >
                      {vidLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                      {tr(t.scripts.createVideographer, language)}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button onClick={() => setShowNewVideographer(true)} variant="outline" className="mb-6 gap-2 ml-2">
                  <Camera className="w-4 h-4" /> {tr(t.scripts.videographers, language)}
                </Button>
              )
            )}

            {/* Client Cards */}
            {clientsLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : clients.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">
                {isAdmin ? tr(t.scripts.noClientsAdmin, language) : isVideographer ? tr(t.scripts.noClientsVideographer, language) : tr(t.scripts.noClientsClient, language)}
              </p>
            ) : (
              <div className="grid gap-3">
                {clients.map((c) => (
                  <div key={c.id} className="relative">
                    <button
                      onClick={() => handleSelectClient(c)}
                      className="editorial-card flex items-center gap-4 p-4 rounded-2xl text-left w-full transition-colors hover:border-[hsl(var(--bone) / 0.32)]"
                    >
                      <div className="p-2 rounded-full bg-primary/10">
                        <User className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        {editingClientId === c.id && editingField === "name" ? (
                          <form onSubmit={async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (editValue.trim()) {
                              const ok = await updateClient(c.id, { name: editValue.trim() });
                              if (ok && selectedClient?.id === c.id) setSelectedClient({ ...selectedClient, name: editValue.trim() });
                            }
                            setEditingClientId(null); setEditingField(null);
                          }} onClick={(e) => e.stopPropagation()}>
                            <Input
                              autoFocus
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => { setEditingClientId(null); setEditingField(null); }}
                              className="h-7 text-sm font-semibold"
                            />
                          </form>
                        ) : (
                          <p
                            className="font-semibold text-foreground truncate"
                          >
                            <span
                              className={isAdmin ? "cursor-pointer hover:underline" : ""}
                              onClick={(e) => { if (isAdmin) { e.stopPropagation(); setEditingClientId(c.id); setEditingField("name"); setEditValue(c.name); } }}
                              title={isAdmin ? tr(t.scripts.clickToEditName, language) : undefined}
                            >
                            {c.name}
                             {!c.user_id && (
                               <span className="text-xs text-red-500 font-normal ml-2">{tr(t.scripts.notVerified, language)}</span>
                            )}
                            </span>
                          </p>
                        )}
                        {editingClientId === c.id && editingField === "email" ? (
                          <form onSubmit={async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const ok = await updateClient(c.id, { email: editValue.trim() || null });
                            if (ok && selectedClient?.id === c.id) setSelectedClient({ ...selectedClient, email: editValue.trim() || null });
                            setEditingClientId(null); setEditingField(null);
                          }} onClick={(e) => e.stopPropagation()}>
                            <Input
                              autoFocus
                              type="email"
                              placeholder={tr(t.scripts.addEmail, language)}
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => { setEditingClientId(null); setEditingField(null); }}
                              className="h-6 text-xs mt-0.5"
                            />
                          </form>
                        ) : (
                          <p className="text-sm text-muted-foreground truncate">
                            <span
                              className={isAdmin ? "cursor-pointer hover:underline" : ""}
                              onClick={(e) => { if (isAdmin) { e.stopPropagation(); setEditingClientId(c.id); setEditingField("email"); setEditValue(c.email || ""); } }}
                              title={isAdmin ? tr(t.scripts.clickToEditEmail, language) : undefined}
                            >
                              {c.email || (isAdmin ? <span className="text-xs italic text-muted-foreground/50">{tr(t.scripts.addEmail, language)}</span> : null)}
                            </span>
                          </p>
                        )}
                        {/* Show assigned videographers */}
                        {isAdmin && assignmentsMap[c.id]?.length > 0 && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {assignmentsMap[c.id].map((vid) => {
                              const v = videographers.find((x) => x.user_id === vid);
                              return (
                                <span key={vid} className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full">
                                  {v?.username || v?.display_name || "?"}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <ChevronLeft className="w-4 h-4 text-muted-foreground rotate-180" />
                    </button>

                    {/* Videographer assignment button (admin only) */}
                    {isAdmin && videographers.length > 0 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setAssignOverlayClient(assignOverlayClient === c.id ? null : c.id); }}
                        className="absolute top-1/2 -translate-y-1/2 right-12 p-1.5 rounded-full border border-dashed border-muted-foreground/40 hover:border-primary/60 transition-smooth"
                        title={tr(t.scripts.assignVideographer, language)}
                      >
                        <Camera className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    )}

                    {/* Assignment overlay */}
                    {isAdmin && assignOverlayClient === c.id && (
                      <div className="absolute top-14 right-4 z-50 editorial-card rounded-xl p-3 min-w-[180px] animate-fade-in">
                        <p className="text-xs font-semibold text-foreground mb-2">{tr(t.scripts.assignVideographer, language)}</p>
                        {videographers.map((v) => {
                          const assigned = (assignmentsMap[c.id] || []).includes(v.user_id);
                          return (
                            <button
                              key={v.user_id}
                              onClick={() => toggleVideographerAssignment(c.id, v.user_id)}
                              className={`flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-lg text-sm transition-smooth ${assigned ? "bg-emerald-500/20 text-emerald-400" : "hover:bg-muted/50 text-muted-foreground"}`}
                            >
                              {assigned ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
                              {v.username || v.display_name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ===== CLIENT DETAIL ===== */}
        {view === "client-detail" && selectedClient && (
          <>
            <div className="mb-6">
              <h1 className="text-xl sm:text-2xl font-bold text-foreground font-serif">
                {selectedClient.name}
                {!selectedClient.user_id && (
                  <span className="text-sm text-red-500 font-normal ml-2">{tr(t.scripts.notVerified, language)}</span>
                )}
              </h1>
              {selectedClient.email && <p className="text-muted-foreground text-sm truncate">{selectedClient.email}</p>}
            </div>

            {/* ── Scripts toolbar ── */}
            <div className="flex flex-wrap items-center gap-2 mb-6">
              {/* Primary CTA */}
              <Button
                onClick={() => { setScriptTitle(""); setScriptInput(""); setInspirationUrl(""); setFormato(""); setGoogleDriveLink(""); setFormatReferenceCreate(""); setView("new-script"); }}
                variant="cta"
                className="gap-2 flex-shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">{tr(t.scripts.newScript, language)}</span>
                <span className="sm:hidden">{tr({ en: "New", es: "Nuevo" }, language)}</span>
              </Button>

              {/* Filter pills */}
              <div className="flex gap-0.5 bg-muted/40 border border-border/60 rounded-xl p-0.5 flex-shrink-0">
                {[
                  { key: "all" as const, label: tr(t.scripts.all, language) },
                  { key: "no-grabado" as const, label: tr(t.scripts.notRecorded, language) },
                  { key: "grabado" as const, label: tr(t.scripts.recorded, language) },
                ].map((f) => (
                  <button
                    key={f.key}
                    onClick={() => { setGrabadoFilter(f.key); setShowTrash(false); }}
                    className={`px-2.5 py-1 text-xs rounded-lg transition-all font-medium ${
                      !showTrash && grabadoFilter === f.key
                        ? "bg-background shadow-sm text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Icon actions */}
              <div className="flex items-center gap-1">
                {isAdmin && selectedClient && (
                  <button
                    onClick={() => setShowBatchModal(true)}
                    title={tr({ en: "Batch Generate", es: "Generación en Lote" }, language)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <Zap className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => setCreatingFolder(true)}
                  title={tr({ en: "New folder", es: "Nueva carpeta" }, language)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <FolderPlus className="w-4 h-4" />
                </button>
                {selectedScriptIds.size > 0 && (
                  <button
                    onClick={exitSelectMode}
                    title={tr({ en: "Deselect all", es: "Deseleccionar todo" }, language)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-primary bg-primary/10 transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={handleToggleTrash}
                  title={showTrash ? tr({ en: "Hide trash", es: "Ocultar papelera" }, language) : tr(t.scripts.trash, language)}
                  className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                    showTrash ? "text-destructive bg-destructive/10" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {showTrash ? (
              /* ===== TRASH VIEW ===== */
              <>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                  <Trash2 className="w-4 h-4" /> {tr(t.scripts.trashHint, language)}
                </h3>
                {trashedScripts.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">{tr(t.scripts.trashEmpty, language)}</p>
                ) : (
                  <div className="grid gap-3">
                    {trashedScripts.map((s) => {
                      const deletedDate = s.deleted_at ? new Date(s.deleted_at) : new Date();
                      const daysLeft = Math.max(0, 90 - Math.floor((Date.now() - deletedDate.getTime()) / (1000 * 60 * 60 * 24)));
                      return (
                        <div key={s.id} className="editorial-card flex items-center gap-2 sm:gap-4 p-3 sm:p-4 rounded-2xl transition-colors overflow-hidden opacity-70">
                          <FileText className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                          <div className="flex-1 min-w-0 overflow-hidden">
                            <p className="font-semibold text-muted-foreground truncate line-through">{s.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {tr(t.scripts.deleted, language)} {deletedDate.toLocaleDateString(language === "en" ? "en-US" : "es-MX")} · {daysLeft} {tr(t.scripts.daysLeft, language)}
                            </p>
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={async () => { await restoreScript(s.id); }}
                              title={tr(t.scripts.restore, language)}
                              className="h-8 w-8 p-0 text-emerald-500 hover:text-emerald-400"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </Button>
                            {isAdmin && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={async () => {
                                  if (!confirm(tr(t.scripts.confirmDeletePermanent, language))) return;
                                  await permanentlyDeleteScript(s.id);
                                }}
                                title={tr(t.scripts.deletePermanently, language)}
                                className="text-destructive hover:text-destructive h-8 w-8 p-0"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
            (() => {
              // When inside a folder, show back arrow + folder scripts + subfolders
              // When at root, show root folders + unfiled scripts
              const currentFolderObj = folders.find(f => f.id === viewingFolderId);

              // Build breadcrumb trail for nested folders
              const breadcrumbs: { id: string | null; name: string }[] = [];
              if (viewingFolderId !== null) {
                let cur = currentFolderObj;
                while (cur) {
                  breadcrumbs.unshift({ id: cur.id, name: cur.name });
                  cur = cur.parent_id ? folders.find(f => f.id === cur!.parent_id) : undefined;
                }
              }

              // Subfolders at current level
              const childFolders = folders.filter(f =>
                viewingFolderId === null ? !f.parent_id : f.parent_id === viewingFolderId
              );

              const filtered = scripts.filter((s) => {
                if (viewingFolderId !== null) {
                  if (s.folder_id !== viewingFolderId) return false;
                } else {
                  if (s.folder_id !== null && s.folder_id !== undefined) return false;
                }
                if (grabadoFilter === "grabado" && !s.grabado) return false;
                if (grabadoFilter === "no-grabado" && s.grabado) return false;
                // Triage entry from /dashboard: show unreviewed + needs_revision.
                if (reviewFilter === "needs_review") {
                  if (s.review_status === 'approved') return false;
                }
                return true;
              });

              const visibleIds = filtered.map((s) => s.id);
              const ScriptCard = ({ s }: { s: typeof scripts[0] }) => (
                <div
                  key={s.id}
                  className={`editorial-card flex items-center gap-3 sm:gap-4 p-3 sm:p-4 overflow-hidden select-none transition-colors`}
                  style={{
                    borderLeft: `3px solid ${
                      (s as any).status === 'draft' ? '#A85B1F'
                        : s.review_status === 'approved' ? '#1f7a5a'
                        : s.review_status === 'needs_revision' ? '#A85B1F'
                        : 'hsl(var(--bone) / 0.20)'
                    }`,
                    boxShadow: selectedScriptIds.has(s.id) ? 'inset 0 0 0 1px hsl(var(--aqua) / 0.40)' : undefined,
                  }}
                >
                  <button onClick={(e) => { e.stopPropagation(); handleScriptSelect(s.id, e, visibleIds); }} className="flex-shrink-0" title={tr({ en: "Select (Shift+click for range)", es: "Seleccionar (Shift+clic para rango)" }, language)}>
                    {selectedScriptIds.has(s.id)
                      ? <CheckCircle2 className="w-5 h-5 text-primary" />
                      : <Circle className="w-5 h-5 text-muted-foreground hover:text-foreground" />}
                  </button>
                  <button
                    onClick={(e) => {
                      // If user is actively renaming this row, let the input own the interaction.
                      if (renamingScriptId === s.id) { e.preventDefault(); e.stopPropagation(); return; }
                      // Cmd/Ctrl+click on row body = toggle selection (like Finder)
                      if (e.metaKey || e.ctrlKey) {
                        e.preventDefault();
                        handleScriptSelect(s.id, e, visibleIds);
                        return;
                      }
                      handleViewScript(s);
                    }}
                    className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0 text-left overflow-hidden">
                    {(s as any).status === "draft" ? (
                      <Flame className="w-5 h-5 text-orange-400 flex-shrink-0 hidden sm:block" />
                    ) : (
                      <FileText className="w-5 h-5 text-muted-foreground flex-shrink-0 hidden sm:block" />
                    )}
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <div className="flex items-center gap-2">
                        {renamingScriptId === s.id ? (
                          <input
                            className="font-semibold text-foreground bg-muted/50 border border-primary/40 rounded-lg px-2 py-0.5 text-sm w-full focus:outline-none focus:ring-1 focus:ring-primary/50"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            autoFocus
                            onFocus={(e) => e.currentTarget.select()}
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            onKeyUp={(e) => e.stopPropagation()}
                            onKeyDown={async (e) => {
                              // Stop bubbling so the parent button never sees the key.
                              e.stopPropagation();
                              // Cmd/Ctrl+A → select text in the input (defeat window-level select-all shortcut).
                              if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
                                e.preventDefault();
                                e.currentTarget.select();
                                return;
                              }
                              if (e.key === "Enter" && renameValue.trim()) {
                                e.preventDefault();
                                const { error } = await supabase.from("scripts").update({ title: renameValue.trim(), idea_ganadora: renameValue.trim() }).eq("id", s.id);
                                if (error) { toast.error(tr({ en: "Error changing title", es: "Error al cambiar el título" }, language)); } else { setScripts(prev => prev.map(sc => sc.id === s.id ? { ...sc, title: renameValue.trim(), idea_ganadora: renameValue.trim() } : sc)); await supabase.from("video_edits").update({ reel_title: renameValue.trim() }).eq("script_id", s.id); }
                                setRenamingScriptId(null);
                                return;
                              }
                              if (e.key === "Escape") { e.preventDefault(); setRenamingScriptId(null); }
                            }}
                            onBlur={async () => {
                              if (renameValue.trim() && renameValue !== s.title) {
                                const { error } = await supabase.from("scripts").update({ title: renameValue.trim(), idea_ganadora: renameValue.trim() }).eq("id", s.id);
                                if (error) { toast.error(tr({ en: "Error changing title", es: "Error al cambiar el título" }, language)); } else { setScripts(prev => prev.map(sc => sc.id === s.id ? { ...sc, title: renameValue.trim(), idea_ganadora: renameValue.trim() } : sc)); await supabase.from("video_edits").update({ reel_title: renameValue.trim() }).eq("script_id", s.id); }
                              }
                              setRenamingScriptId(null);
                            }}
                          />
                        ) : (
                          (() => {
                            const ideaOrTitle = s.idea_ganadora || s.title;
                            const hasIdea = !!s.idea_ganadora;
                            const labelText = hasIdea ? (getFormatLabel(s.formato, language).toUpperCase() || "SCRIPT") : "SCRIPT";
                            return (
                              <div className="min-w-0 flex-1">
                                <span
                                  className="editorial-eyebrow block mb-0.5"
                                  style={{ fontSize: 9, letterSpacing: "0.20em" }}
                                >
                                  {labelText}
                                </span>
                                <p
                                  className="leading-snug"
                                  style={{
                                    fontFamily: "var(--font-display, 'EB Garamond'), Georgia, serif",
                                    fontWeight: 500,
                                    fontSize: 15,
                                    letterSpacing: "-0.005em",
                                    color: s.grabado ? "hsl(var(--bone) / 0.45)" : "hsl(var(--cream))",
                                    textDecoration: s.grabado ? "line-through" : "none",
                                  }}
                                >
                                  {ideaOrTitle}
                                </p>
                                {hasIdea && s.title && s.title !== s.idea_ganadora && (
                                  <p className="text-[10px] truncate" style={{ color: "hsl(var(--bone) / 0.40)" }}>{s.title}</p>
                                )}
                              </div>
                            );
                          })()
                        )}
                        {(s as any).status === "draft" && (
                          <span
                            className="editorial-eyebrow flex-shrink-0 px-2 py-0.5 rounded-full"
                            style={{ fontSize: 9, color: "#A85B1F", border: "1px solid rgba(168,91,31,0.32)", background: "rgba(168,91,31,0.08)" }}
                          >
                            {tr({ en: "In Progress", es: "En Progreso" }, language)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs mt-1" style={{ color: "hsl(var(--bone) / 0.40)" }}>{new Date(s.created_at).toLocaleDateString(language === "en" ? "en-US" : "es-MX")}</p>
                    </div>
                  </button>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {s.review_status === 'needs_revision' && (
                      <span className="text-xs text-red-400 hidden sm:inline">{tr({ en: "Needs revision", es: "Necesita revisión" }, language)}</span>
                    )}
                    {s.review_status === 'approved' && <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />}
                    {s.review_status === 'needs_revision' && <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />}
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-52 p-1" align="end">
                        {(() => {
                          const isBulk = selectedScriptIds.has(s.id) && selectedScriptIds.size > 1;
                          const bulkIds = isBulk ? Array.from(selectedScriptIds) : [s.id];
                          const bulkHint = isBulk ? <span className="ml-auto text-[10px] text-primary/60">{selectedScriptIds.size} scripts</span> : null;
                          return (
                            <>
                              {!isBulk && (
                                <button
                                  className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-foreground transition-colors hover:bg-muted"
                                  onClick={() => {
                                    setRenamingScriptId(s.id);
                                    setRenameValue(s.title);
                                  }}
                                >
                                  <Pencil className="w-4 h-4" /> {tr({ en: "Rename", es: "Renombrar" }, language)}
                                </button>
                              )}
                              {/* Move to folder submenu */}
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-foreground transition-colors hover:bg-muted">
                                    <Folder className="w-4 h-4" /> {tr({ en: "Move to folder", es: "Mover a carpeta" }, language)} {bulkHint}
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-44 p-1" align="end" side="left">
                                  {(isBulk || s.folder_id) && (
                                    <button
                                      className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground transition-colors hover:bg-muted"
                                      onClick={() => isBulk ? handleBulkMoveToFolder(null) : handleMoveToFolder(s.id, null)}
                                    >
                                      {tr({ en: "Remove from folder", es: "Quitar de la carpeta" }, language)}
                                    </button>
                                  )}
                                  {folders.map((f) => (
                                    <button
                                      key={f.id}
                                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors hover:bg-muted ${!isBulk && s.folder_id === f.id ? 'text-primary font-medium' : 'text-foreground'}`}
                                      onClick={() => isBulk ? handleBulkMoveToFolder(f.id) : handleMoveToFolder(s.id, f.id)}
                                    >
                                      <Folder className="w-3.5 h-3.5" /> {f.name}
                                    </button>
                                  ))}
                                </PopoverContent>
                              </Popover>
                              {/* Mark as recorded / unmark */}
                              <button
                                className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-foreground transition-colors hover:bg-muted"
                                onClick={async () => {
                                  if (isBulk) {
                                    // If any selected are not recorded, mark all recorded. Otherwise unmark all.
                                    const anyNotRecorded = bulkIds.some((id) => !scripts.find((sc) => sc.id === id)?.grabado);
                                    await bulkToggleGrabado(bulkIds, anyNotRecorded);
                                    exitSelectMode();
                                  } else {
                                    await toggleGrabado(s.id, !s.grabado);
                                  }
                                }}
                              >
                                <CheckCircle2 className="w-4 h-4" />
                                {isBulk
                                  ? (bulkIds.some((id) => !scripts.find((sc) => sc.id === id)?.grabado) ? tr({ en: "Mark as recorded", es: "Marcar como grabado" }, language) : tr({ en: "Unmark recorded", es: "Desmarcar grabado" }, language))
                                  : (s.grabado ? tr({ en: "Unmark recorded", es: "Desmarcar grabado" }, language) : tr({ en: "Mark as recorded", es: "Marcar como grabado" }, language))
                                }
                                {bulkHint}
                              </button>
                              {/* Review (admin) — full review actions */}
                              {isAdmin && !isBulk && (
                                <button
                                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors hover:bg-muted ${
                                    s.review_status === 'approved' ? 'text-green-400'
                                    : s.review_status === 'needs_revision' ? 'text-red-400'
                                    : 'text-foreground'
                                  }`}
                                  onClick={() => setReviewingScript(s)}
                                >
                                  {s.review_status === 'needs_revision' ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                                  {s.review_status === 'approved' ? tr({ en: "Approved", es: "Aprobado" }, language) : s.review_status === 'needs_revision' ? tr({ en: "Needs Revision", es: "Necesita Revisión" }, language) : tr({ en: "Review", es: "Revisar" }, language)}
                                </button>
                              )}
                              {/* View revision notes (non-admin, only when notes exist) */}
                              {!isAdmin && !isBulk && s.review_status === 'needs_revision' && s.revision_notes && (
                                <button
                                  className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-red-400 transition-colors hover:bg-muted"
                                  onClick={() => setReviewingScript(s)}
                                >
                                  <AlertTriangle className="w-4 h-4" /> {tr({ en: "View revision notes", es: "Ver notas de revisión" }, language)}
                                </button>
                              )}
                              <button
                                className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-destructive transition-colors hover:bg-destructive/10"
                                onClick={async () => {
                                  if (isBulk) { await handleBulkDelete(); }
                                  else { handleDeleteScript(s.id); }
                                }}
                              >
                                <Trash2 className="w-4 h-4" /> {tr({ en: "Delete", es: "Eliminar" }, language)} {bulkHint}
                              </button>
                            </>
                          );
                        })()}
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              );

              return (
                <>
                  {/* ── Folder view: breadcrumb trail ── */}
                  {viewingFolderId !== null && (
                    <div className="flex items-center gap-1.5 mb-4 flex-wrap">
                      <button
                        onClick={() => setViewingFolderId(null)}
                        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ChevronLeft className="w-4 h-4" /> Scripts
                      </button>
                      {breadcrumbs.map((bc, i) => (
                        <span key={bc.id} className="flex items-center gap-1.5">
                          <span className="text-muted-foreground/40">/</span>
                          {i < breadcrumbs.length - 1 ? (
                            <button
                              onClick={() => setViewingFolderId(bc.id)}
                              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                            >
                              {bc.name}
                            </button>
                          ) : (
                            <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                              <FolderOpen className="w-4 h-4 text-primary" /> {bc.name}
                            </span>
                          )}
                        </span>
                      ))}
                      {(() => {
                        const current = folders.find((f) => f.id === viewingFolderId);
                        if (!current) return null;
                        return (
                          <button
                            onClick={() => setSharingFolder({ id: current.id, name: current.name })}
                            className="ml-auto flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border/60 bg-background/60 hover:bg-primary/10 hover:border-primary/40 hover:text-primary transition-colors"
                            title={tr({ en: "Share this folder", es: "Compartir esta carpeta" }, language)}
                          >
                            <Share2 className="w-3.5 h-3.5" />
                            {tr(t.scripts.share, language)}
                          </button>
                        );
                      })()}
                    </div>
                  )}

                  <DndContext sensors={listSensors} collisionDetection={closestCenter} onDragStart={handleListDragStart} onDragEnd={handleListDragEnd}>
                  {/* ── Folder grid (shown at root and inside folders when subfolders exist) ── */}
                  {(childFolders.length > 0 || creatingFolder) && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
                      {childFolders.map((f) => {
                        const count = scripts.filter(s => s.folder_id === f.id).length;
                        const subCount = folders.filter(sf => sf.parent_id === f.id).length;
                        return (
                          <DroppableFolder key={f.id} id={f.id}>
                            <div className="relative group" onContextMenu={(e) => handleFolderContextMenu(e, { id: f.id, name: f.name })}>
                              <button
                                onClick={() => setViewingFolderId(f.id)}
                                className="editorial-card w-full flex flex-col items-start gap-3 p-4 transition-colors text-left overflow-hidden"
                              >
                                <Folder className="w-5 h-5" style={{ color: "hsl(var(--bone) / 0.55)" }} />
                                <div className="w-full min-w-0 pr-7">
                                  <p
                                    className="truncate"
                                    style={{
                                      fontFamily: "var(--font-display, 'EB Garamond'), Georgia, serif",
                                      fontWeight: 500,
                                      fontSize: 16,
                                      letterSpacing: "-0.005em",
                                      color: "hsl(var(--cream))",
                                    }}
                                  >
                                    {f.name}
                                  </p>
                                  <p className="editorial-eyebrow mt-1" style={{ letterSpacing: "0.14em", fontSize: 9.5 }}>
                                    {count} script{count !== 1 ? "s" : ""}
                                    {subCount > 0 && tr({ en: ` · ${subCount} folder${subCount !== 1 ? "s" : ""}`, es: ` · ${subCount} carpeta${subCount !== 1 ? "s" : ""}` }, language)}
                                  </p>
                                </div>
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setSharingFolder({ id: f.id, name: f.name }); }}
                                className="absolute top-2 right-2 z-20 p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-all"
                                style={{ background: "hsl(var(--ink-on-cream) / 0.7)", border: "1px solid hsl(var(--bone) / 0.12)", color: "hsl(var(--bone) / 0.65)" }}
                                title={tr({ en: "Share folder", es: "Compartir carpeta" }, language)}
                              >
                                <Share2 className="w-3 h-3" />
                              </button>
                            </div>
                          </DroppableFolder>
                        );
                      })}
                      {/* New folder card */}
                      {creatingFolder ? (
                        <div className="editorial-card flex flex-col gap-2 p-4">
                          <Input
                            autoFocus
                            value={newFolderName}
                            onChange={(e) => setNewFolderName(e.target.value)}
                            placeholder={viewingFolderId ? tr({ en: "Subfolder name", es: "Nombre de subcarpeta" }, language) : tr({ en: "Folder name", es: "Nombre de carpeta" }, language)}
                            className="h-8 text-sm"
                            style={{ background: "hsl(var(--bone) / 0.04)", borderColor: "hsl(var(--bone) / 0.14)", color: "hsl(var(--cream))" }}
                            onKeyDown={(e) => { if (e.key === "Enter") handleCreateFolder(); if (e.key === "Escape") { setCreatingFolder(false); setNewFolderName(""); } }}
                          />
                          <div className="flex gap-2 mt-1">
                            <button
                              onClick={handleCreateFolder}
                              className="editorial-pill px-3 py-1 text-[11px] font-medium"
                              data-active="true"
                            >
                              {tr({ en: "Save", es: "Guardar" }, language)}
                            </button>
                            <button
                              onClick={() => { setCreatingFolder(false); setNewFolderName(""); }}
                              className="editorial-pill px-3 py-1 text-[11px] font-medium"
                            >
                              {tr(t.scripts.cancel, language)}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setCreatingFolder(true)}
                          className="editorial-card-dashed flex flex-col items-center justify-center gap-2 p-4 transition-colors"
                          style={{ color: "hsl(var(--bone) / 0.55)", minHeight: 110 }}
                        >
                          <FolderPlus className="w-5 h-5" />
                          <span className="text-xs font-medium">{tr({ en: "New folder", es: "Nueva carpeta" }, language)}</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* ── Script list (filtered by folder or unfiled) ── */}
                  {filtered.length === 0 && scriptsListLoading ? (
                    /* Fetch in flight: skeleton rows, never the "No scripts"
                       empty state — it used to flash for ~0.5s on every load. */
                    <div className="grid gap-3" aria-hidden>
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="animate-pulse rounded-xl"
                          style={{ height: 72, background: "hsl(var(--bone) / 0.06)" }}
                        />
                      ))}
                    </div>
                  ) : filtered.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">
                      {viewingFolderId !== null ? tr({ en: "No scripts in this folder yet.", es: "Aún no hay scripts en esta carpeta." }, language) : scripts.length === 0 ? tr(t.scripts.noScripts, language) : tr(t.scripts.noScriptsCategory, language)}
                    </p>
                  ) : (
                    <SortableContext items={visibleIds} strategy={verticalListSortingStrategy}>
                      <div className="grid gap-3">
                        {filtered.map((s) => <SortableScript key={s.id} id={s.id}><ScriptCard s={s} /></SortableScript>)}
                      </div>
                    </SortableContext>
                  )}

                  {/* Drag overlay ghost */}
                  <DragOverlay>
                    {draggingScriptId && (
                      <div className="editorial-card flex items-center gap-2 px-4 py-3 rounded-xl" style={{ width: 280, background: "hsl(var(--graphite))", borderColor: "hsl(var(--bone) / 0.32)" }}>
                        <Folder className="w-4 h-4 text-primary" />
                        <span className="text-sm font-medium text-primary">
                          {tr({ en: `Moving ${selectedScriptIds.size} script${selectedScriptIds.size !== 1 ? "s" : ""}`, es: `Moviendo ${selectedScriptIds.size} script${selectedScriptIds.size !== 1 ? "s" : ""}` }, language)}
                        </span>
                      </div>
                    )}
                  </DragOverlay>
                  </DndContext>
                </>
              );
            })()
            )}

            {/* ── Floating editorial bulk-action bar ── */}
            {selectedScriptIds.size > 0 && (
              <div
                className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-2"
                style={{
                  background: 'hsl(var(--graphite))',
                  border: '1px solid hsl(var(--bone) / 0.10)',
                  borderRadius: 12,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
                }}
              >
                <span className="text-sm font-medium text-foreground">{tr({ en: `${selectedScriptIds.size} selected`, es: `${selectedScriptIds.size} seleccionados` }, language)}</span>
                <div className="w-px h-4 bg-border" />
                <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => handleSelectAll(scripts)}>
                  {tr({ en: "Select All", es: "Seleccionar Todo" }, language)}
                </Button>
                <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={exitSelectMode}>
                  {tr({ en: "Deselect", es: "Deseleccionar" }, language)}
                </Button>
                <div className="w-px h-4 bg-border" />
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-xs h-7 px-2 gap-1">
                      <Folder className="w-3 h-3" /> {tr({ en: "Move to folder", es: "Mover a carpeta" }, language)}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-1" align="center" side="top">
                    <button
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted transition-colors"
                      onClick={() => handleBulkMoveToFolder(null)}
                    >
                      {tr({ en: "Remove from folder", es: "Quitar de la carpeta" }, language)}
                    </button>
                    {folders.map((f) => (
                      <button
                        key={f.id}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-foreground hover:bg-muted transition-colors"
                        onClick={() => handleBulkMoveToFolder(f.id)}
                      >
                        <Folder className="w-3.5 h-3.5" /> {f.name}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7 px-2 gap-1"
                  onClick={() => {
                    const ids = Array.from(selectedScriptIds);
                    const anyNotRecorded = ids.some((id) => !scripts.find((sc) => sc.id === id)?.grabado);
                    handleBulkGrabado(anyNotRecorded);
                  }}
                >
                  <CheckCircle2 className="w-3 h-3" /> {tr({ en: "Mark recorded", es: "Marcar grabado" }, language)}
                </Button>
                <div className="w-px h-4 bg-border" />
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10 gap-1"
                  onClick={handleBulkDelete}
                >
                  <Trash2 className="w-3 h-3" /> {tr({ en: "Delete", es: "Eliminar" }, language)}
                </Button>
              </div>
            )}
          </>
        )}

        {/* ===== NEW / EDIT SCRIPT ===== */}
        {(view === "new-script" || view === "edit-script") && (
          <>
             <h2 className="text-xl font-bold text-foreground mb-2 font-serif">
               {view === "edit-script" ? tr(t.scripts.editScriptFor, language) : tr(t.scripts.newScriptFor, language)}{" "}
              <span className="text-primary">{selectedClient?.name}</span>
            </h2>

            {/* AI Mode Toggle — only on new-script */}
            {view === "new-script" && (
              <div className="flex flex-wrap gap-2 mb-6">
                <Button
                  variant={!aiMode ? "cta" : "outline"}
                  size="sm"
                  onClick={() => setAiMode(false)}
                  className="gap-2"
                >
                  <Pencil className="w-4 h-4" /> Manual
                </Button>
                <Button
                  variant={aiMode ? "cta" : "outline"}
                  size="sm"
                  onClick={() => setAiMode(true)}
                  className="gap-2"
                >
                  <Wand2 className="w-4 h-4" /> {tr({ en: "Let AI Build It", es: "Que la IA lo construya" }, language)}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setView("super-planning")}
                  className="gap-2 border-orange-500/40 text-orange-400 hover:text-orange-300 hover:border-orange-400"
                >
                  <Flame className="w-4 h-4" /> Connecta AI
                </Button>
              </div>
            )}

            {/* AI Wizard Mode */}
            {view === "new-script" && aiMode && selectedClient ? (
              <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
              <AIScriptWizard
                selectedClient={selectedClient}
                initialTemplateVideo={remixVideo ?? undefined}
                onComplete={async (result, inspirationUrl) => {
                  // Check plan limit before saving AI-generated script (admins and videographers are unlimited)
                  if (!isAdmin && !isVideographer) {
                    const limitCheck = await checkResourceLimit(selectedClient.id, "scripts");
                    if (!limitCheck.allowed) {
                      toast.error(
                        tr({
                          en: `You've reached your script limit (${limitCheck.limit} scripts). Upgrade your plan for more.`,
                          es: `Has alcanzado tu límite de scripts (${limitCheck.limit} scripts). Mejora tu plan para más.`,
                        }, language)
                      );
                      return;
                    }
                  }
                  const saved = await directSave({
                    clientId: selectedClient.id,
                    lines: result.lines,
                    ideaGanadora: result.idea_ganadora || "",
                    target: result.target || "",
                    formato: result.formato || "",
                    viralityScore: result.virality_score,
                    inspirationUrl: inspirationUrl || undefined,
                  });
                  if (saved) {
                    setRemixVideo(null);
                    const fresh = await getScriptLines(saved.scriptId);
                    setParsedLines(fresh);
                    setViewingInspirationUrls(inspirationUrl ? [inspirationUrl] : []);
                    setViewingMetadata({
                      idea_ganadora: result.idea_ganadora || null,
                      target: result.target || null,
                      formato: result.formato || null,
                      google_drive_link: null,
                    });
                    setViewingScriptId(saved.scriptId);
                    setView("view-script");
                  }
                }}
                onCancel={() => { setAiMode(false); setRemixVideo(null); }}
              />
              </Suspense>
            ) : (
              <>
                {/* Legend */}
                <div className="flex flex-wrap gap-3 sm:gap-4 mb-6">
                  {Object.entries(getTypeConfig(language)).map(([key, cfg]) => (
                    <div key={key} className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm">
                      <span className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full ${cfg.dot}`} />
                      <span className={cfg.color}>{cfg.label}</span>
                    </div>
                  ))}
                </div>

                 <p className="text-sm text-muted-foreground mb-4">{tr(t.scripts.pasteHint, language)}</p>

                 <Input
                   placeholder={tr(t.scripts.scriptTitle, language)}
                   value={scriptTitle}
                   onChange={(e) => {
                     console.log("[scripts:title-input] onChange ->", JSON.stringify(e.target.value));
                     setScriptTitle(e.target.value);
                   }}
                   onBlur={(e) => console.log("[scripts:title-input] onBlur ->", JSON.stringify(e.target.value), "state:", JSON.stringify(scriptTitle))}
                   className="mb-3"
                 />
                 <Input placeholder={tr(t.scripts.inspirationUrl, language)} value={inspirationUrl} onChange={(e) => setInspirationUrl(e.target.value)} className="mb-3" />
                 <Input placeholder={tr(t.scripts.formatReferenceCreate, language)} value={formatReferenceCreate} onChange={(e) => setFormatReferenceCreate(e.target.value)} className="mb-3" />
                 
                 {/* Vault Template Toggle */}
                 <div className="editorial-card flex items-center gap-3 mb-3 p-3 rounded-xl">
                   <Switch
                     checked={useAsTemplate}
                     onCheckedChange={(checked) => {
                       setUseAsTemplate(checked);
                       if (checked && vaultTemplates.length === 0) {
                         setTemplateLoading(true);
                         supabase
                           .from("vault_templates")
                           .select("id, name, template_lines")
                           .eq("client_id", selectedClient!.id)
                           .order("created_at", { ascending: false })
                           .then(({ data }) => {
                             setVaultTemplates(data || []);
                             setTemplateLoading(false);
                           });
                       }
                     }}
                   />
                   <div className="flex items-center gap-2">
                     <Archive className="w-4 h-4 text-[hsl(var(--aqua))]" />
                     <span className="text-sm font-medium text-foreground">
                       {tr({ en: "Use a script from the Vault", es: "Usar un guion del Vault" }, language)}
                     </span>
                   </div>
                 </div>

                 {useAsTemplate && (
                   <div className="editorial-card mb-3 p-3 rounded-xl">
                     {templateLoading ? (
                       <div className="flex items-center gap-2 text-sm text-muted-foreground">
                         <Loader2 className="w-4 h-4 animate-spin" />
                         {tr({ en: "Loading templates...", es: "Cargando plantillas..." }, language)}
                       </div>
                     ) : vaultTemplates.length === 0 ? (
                       <p className="text-sm text-muted-foreground">
                         {tr({ en: "No templates in the Vault yet. Add some first!", es: "No hay plantillas en el Vault aún. ¡Agrega algunas primero!" }, language)}
                       </p>
                     ) : (
                       <Select
                         value={selectedTemplateId}
                         onValueChange={(id) => {
                           setSelectedTemplateId(id);
                           const tpl = vaultTemplates.find((t) => t.id === id);
                           if (tpl?.template_lines && Array.isArray(tpl.template_lines)) {
                             const text = (tpl.template_lines as any[])
                               .map((l: any) => l.text || "")
                               .filter(Boolean)
                               .join("\n");
                             setScriptInput(text);
                           }
                         }}
                       >
                         <SelectTrigger className="bg-transparent border-[hsl(var(--bone) / 0.14)]">
                           <SelectValue placeholder={tr({ en: "Select a Vault template", es: "Selecciona una plantilla del Vault" }, language)} />
                         </SelectTrigger>
                         <SelectContent>
                           {vaultTemplates.map((tpl) => (
                             <SelectItem key={tpl.id} value={tpl.id}>{tpl.name}</SelectItem>
                           ))}
                         </SelectContent>
                       </Select>
                     )}
                   </div>
                 )}

                <div className="mb-3">
                   <label className="text-sm text-muted-foreground mb-1 block">{tr(t.scripts.format, language)}</label>
                   <Select value={formato} onValueChange={setFormato}>
                     <SelectTrigger className="bg-[hsl(var(--graphite))] border-[hsl(var(--bone) / 0.14)]">
                       <SelectValue placeholder={tr(t.scripts.selectFormat, language)} />
                     </SelectTrigger>
                     <SelectContent className="bg-[hsl(var(--graphite))] border-[hsl(var(--bone) / 0.14)] z-50">
                       <SelectItem value="TALKING HEAD">{getFormatLabel("TALKING HEAD", language)}</SelectItem>
                       <SelectItem value="B-ROLL CAPTION">{getFormatLabel("B-ROLL CAPTION", language)}</SelectItem>
                       <SelectItem value="ENTREVISTA">{getFormatLabel("ENTREVISTA", language)}</SelectItem>
                       <SelectItem value="VARIADO">{getFormatLabel("VARIADO", language)}</SelectItem>
                     </SelectContent>
                   </Select>
                </div>

                <Input placeholder={tr(t.scripts.googleDriveLink, language)} value={googleDriveLink} onChange={(e) => setGoogleDriveLink(e.target.value)} className="mb-3" />

                 <div className="relative mb-4">
                  <Textarea
                    value={scriptInput}
                    onChange={(e) => setScriptInput(e.target.value)}
                    placeholder={tr(t.scripts.pasteDictate, language)}
                    className="min-h-[200px] bg-[hsl(var(--graphite))] border-[hsl(var(--bone) / 0.14)] font-mono text-sm resize-y pr-12"
                  />
                  <MicButton onTranscript={(text) => setScriptInput((prev) => prev ? prev + " " + text : text)} />
                </div>
                <Button
                  onClick={async () => {
                    if (view === "edit-script") {
                      handleUpdate();
                    } else {
                      handleCategorize();
                    }
                  }}
                  variant="cta"
                  size="lg"
                  className="gap-2 w-full sm:w-auto"
                  disabled={scriptsLoading || !scriptInput.trim()}
                >
                  {scriptsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {scriptsLoading
                    ? tr(t.scripts.analyzing, language)
                    : view === "edit-script"
                      ? tr(t.scripts.updateRecategorize, language)
                      : tr(t.scripts.analyzeAndSave, language)}
                </Button>
              </>
            )}
          </>
        )}

        {/* ===== VIEW SCRIPT RESULT =====
            Renders for any open script — including empty ones. The chrome
            (Winning Idea / Format / Inspiration / Caption) plus the block
            document always show; ScriptDocEditor provides its own "Add section"
            / "Click to add a line" affordances when the document is empty, so a
            zero-line script is editable in place (no dead-end empty state). */}
        {view === "view-script" && (
          <div className="space-y-4 animate-fade-in">
            {scriptPresence.length > 0 && (
              <div className="flex justify-end">
                <ScriptPresenceBanner others={scriptPresence} />
              </div>
            )}
            {/* Unified editor: chrome (Winning Idea / Inspiration / Caption / actions)
                always renders, followed by the block document. No tabs. */}
            {/* Winning Idea block — flat editorial card, no glow */}
            {viewingMetadata && (viewingMetadata.idea_ganadora || viewingMetadata.target || viewingMetadata.formato) && (
              <div className="editorial-card mb-4" style={{ padding: "20px 22px" }}>
                {/* Idea — primary headline, inline-editable */}
                {renamingScriptId === viewingScriptId ? (
                  <input
                    className="w-full bg-transparent leading-snug focus:outline-none pb-1"
                    style={{
                      fontFamily: "var(--font-display, 'EB Garamond'), Georgia, serif",
                      fontWeight: 500,
                      fontSize: 22,
                      letterSpacing: "-0.01em",
                      color: "hsl(var(--cream))",
                      borderBottom: "1px solid hsl(var(--bone) / 0.30)",
                    }}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    autoFocus
                    onFocus={(e) => e.currentTarget.select()}
                    onKeyDown={async (e) => {
                      e.stopPropagation();
                      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
                        e.preventDefault();
                        e.currentTarget.select();
                        return;
                      }
                      if (e.key === "Enter" && renameValue.trim() && viewingScriptId) {
                        e.preventDefault();
                        const { error } = await supabase.from("scripts").update({ title: renameValue.trim(), idea_ganadora: renameValue.trim() }).eq("id", viewingScriptId);
                        if (error) { toast.error(tr({ en: "Error changing title", es: "Error al cambiar el título" }, language)); } else { setScripts(prev => prev.map(sc => sc.id === viewingScriptId ? { ...sc, title: renameValue.trim(), idea_ganadora: renameValue.trim() } : sc)); setViewingMetadata((prev) => prev ? { ...prev, idea_ganadora: renameValue.trim() } : prev); await supabase.from("video_edits").update({ reel_title: renameValue.trim() }).eq("script_id", viewingScriptId); }
                        setRenamingScriptId(null);
                        return;
                      }
                      if (e.key === "Escape") { e.preventDefault(); setRenamingScriptId(null); }
                    }}
                    onBlur={async () => {
                      if (renameValue.trim() && renameValue !== viewingMetadata.idea_ganadora && viewingScriptId) {
                        const { error } = await supabase.from("scripts").update({ title: renameValue.trim(), idea_ganadora: renameValue.trim() }).eq("id", viewingScriptId);
                        if (error) { toast.error(tr({ en: "Error changing title", es: "Error al cambiar el título" }, language)); } else { setScripts(prev => prev.map(sc => sc.id === viewingScriptId ? { ...sc, title: renameValue.trim(), idea_ganadora: renameValue.trim() } : sc)); setViewingMetadata((prev) => prev ? { ...prev, idea_ganadora: renameValue.trim() } : prev); await supabase.from("video_edits").update({ reel_title: renameValue.trim() }).eq("script_id", viewingScriptId); }
                      }
                      setRenamingScriptId(null);
                    }}
                  />
                ) : (
                  <h2
                    className="leading-snug cursor-pointer transition-colors m-0"
                    style={{
                      fontFamily: "var(--font-display, 'EB Garamond'), Georgia, serif",
                      fontWeight: 500,
                      fontSize: 22,
                      letterSpacing: "-0.01em",
                      lineHeight: 1.3,
                      color: "hsl(var(--cream))",
                    }}
                    onClick={() => {
                      if (viewingScriptId) {
                        setRenamingScriptId(viewingScriptId);
                        setRenameValue(viewingMetadata.idea_ganadora || viewingMetadata.title || "");
                      }
                    }}
                    title={tr({ en: "Click to rename", es: "Clic para renombrar" }, language)}
                  >
                    {viewingMetadata.idea_ganadora || viewingMetadata.title || tr({ en: "Untitled", es: "Sin título" }, language)}
                  </h2>
                )}

                {/* Target chip — truncates long audience strings, click to expand */}
                {viewingMetadata.target && (
                  <div
                    className="flex flex-wrap items-start gap-2 mt-3 pt-3"
                    style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    <EditorTargetChip
                      target={getTargetLabel(viewingMetadata.target, language)}
                      label={tr(t.scripts.target, language)}
                    />
                  </div>
                )}
              </div>
            )}

            {/* FORMAT — selectable chips + single reference link */}
            <div className={`editorial-card p-5 mb-2 ${collapsedCards["format"] ? "pb-4" : ""}`}>
              <div className={`flex items-start gap-2 ${collapsedCards["format"] ? "" : "mb-3"}`}>
                <Clapperboard className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "hsl(var(--bone) / 0.55)" }} />
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.25, color: "hsl(var(--bone) / 0.92)" }}>{tr({ en: "How to film & edit it", es: "Cómo grabarlo y editarlo" }, language)}</div>
                  <div style={{ fontSize: 11.5, lineHeight: 1.35, marginTop: 2, color: "hsl(var(--bone) / 0.46)" }}>{tr({ en: "the style for shooting, editing & script", es: "el estilo de grabación, edición y guion" }, language)}</div>
                </div>
                <div className="ml-auto flex items-center gap-1">{cardToggleButton("format")}</div>
              </div>

              {!collapsedCards["format"] && (<>
              {/* Two chips: format-name dropdown + format reference */}
              {(() => {
                const current = viewingMetadata?.formato?.trim() || "";
                const presetLabels = SCRIPT_FORMATS.map((f) => f.label);
                const isCustomActive = !!current && !presetLabels.includes(current);
                return (
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Chip 1 — format name dropdown (all presets + Custom) */}
                    {editingCustomFormat ? (
                      <input
                        autoFocus
                        value={customFormatDraft}
                        onChange={(e) => setCustomFormatDraft(e.target.value)}
                        placeholder={tr({ en: "Custom format…", es: "Formato personalizado…" }, language)}
                        className="h-[34px] rounded-md border border-primary bg-muted/30 px-2.5 text-xs text-foreground focus:outline-none"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { const v = customFormatDraft.trim(); if (v) handleSelectFormat(v); setEditingCustomFormat(false); }
                          if (e.key === "Escape") setEditingCustomFormat(false);
                        }}
                        onBlur={() => { const v = customFormatDraft.trim(); if (v) handleSelectFormat(v); setEditingCustomFormat(false); }}
                      />
                    ) : (
                      <Select
                        value={current || undefined}
                        onValueChange={(v) => {
                          if (v === "__custom__") { setCustomFormatDraft(isCustomActive ? current : ""); setEditingCustomFormat(true); return; }
                          handleSelectFormat(v);
                        }}
                      >
                        <SelectTrigger className="h-[34px] w-fit min-w-[150px] gap-1.5 rounded-md border-border bg-muted/30 px-2.5 py-1.5 text-xs font-medium">
                          <SelectValue placeholder={tr({ en: "Select format", es: "Selecciona formato" }, language)} />
                        </SelectTrigger>
                        <SelectContent className="bg-[hsl(var(--graphite))] border-[hsl(var(--bone) / 0.14)] z-50">
                          {SCRIPT_FORMATS.map((f) => (
                            <SelectItem key={f.id} value={f.label} className="text-xs">
                              {getFormatLabel(f.label, language)}
                            </SelectItem>
                          ))}
                          {isCustomActive && (
                            <SelectItem value={current} className="text-xs">{current}</SelectItem>
                          )}
                          <SelectItem value="__custom__" className="text-xs">
                            {tr({ en: "Custom…", es: "Personalizado…" }, language)}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    )}

                    {/* Chip 2 — format reference: view-icon that opens a bubble to paste/edit the URL */}
                    <div className="relative inline-block">
                <button
                  onClick={() => { setFormatReferenceDraft(viewingFormatReferenceUrl ?? ""); setEditingFormatReference((v) => !v); }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/30 hover:bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors"
                  title={tr({ en: "Format reference", es: "Referencia de formato" }, language)}
                >
                  <Eye className="w-3.5 h-3.5 shrink-0" />
                  {viewingFormatReferenceUrl
                    ? tr({ en: "Format reference", es: "Referencia de formato" }, language)
                    : tr({ en: "Add format reference", es: "Agregar referencia de formato" }, language)}
                  {viewingFormatReferenceUrl && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                </button>
                {editingFormatReference && (
                  <>
                    {/* click-away backdrop — commit the draft on click-away (matches inspiration onBlur) so a pasted URL isn't silently discarded */}
                    <div className="fixed inset-0 z-30" onClick={async () => { const v = formatReferenceDraft.trim(); setEditingFormatReference(false); await persistFormatReference(v || null); }} />
                    <div className="absolute left-0 top-full mt-1.5 z-40 w-[340px] max-w-[80vw] rounded-lg border border-border bg-[hsl(var(--graphite))] p-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
                      <Input
                        autoFocus
                        value={formatReferenceDraft}
                        onChange={(e) => setFormatReferenceDraft(e.target.value)}
                        placeholder={tr({ en: "Paste format reference URL...", es: "Pega URL de referencia de formato..." }, language)}
                        className="text-sm h-8"
                        onKeyDown={async (e) => {
                          if (e.key === "Enter") { const v = formatReferenceDraft.trim(); setEditingFormatReference(false); await persistFormatReference(v || null); }
                          if (e.key === "Escape") setEditingFormatReference(false);
                        }}
                      />
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          onClick={async () => { const v = formatReferenceDraft.trim(); setEditingFormatReference(false); await persistFormatReference(v || null); }}
                          className="inline-flex items-center gap-1 rounded-md bg-primary/15 text-primary px-2.5 py-1 text-xs font-medium hover:bg-primary/25 transition-colors"
                        >
                          <Save className="w-3 h-3" /> {tr({ en: "Save", es: "Guardar" }, language)}
                        </button>
                        {viewingFormatReferenceUrl && (
                          <button
                            onClick={() => { setEditingFormatReference(false); setFormatReferenceVideoUrl(viewingFormatReferenceUrl); }}
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-primary hover:bg-muted/40 transition-colors"
                          >
                            <Play className="w-3 h-3" /> {tr({ en: "View", es: "Ver" }, language)}
                          </button>
                        )}
                        {viewingFormatReferenceUrl && (
                          <button
                            onClick={async () => { setEditingFormatReference(false); await persistFormatReference(null); }}
                            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:text-destructive transition-colors ml-auto"
                          >
                            <Trash2 className="w-3 h-3" /> {tr({ en: "Remove", es: "Quitar" }, language)}
                          </button>
                        )}
                      </div>
                    </div>
                  </>
                )}
                    </div>
                  </div>
                );
              })()}
              </>)}

              <VideoBreakdownDialog
                open={!!formatReferenceVideoUrl}
                onClose={() => setFormatReferenceVideoUrl(null)}
                url={formatReferenceVideoUrl}
                title={tr({ en: "Format Reference", es: "Referencia de Formato" }, language)}
              />
            </div>

            <div className={`editorial-card p-5 mb-2 ${collapsedCards["idea"] ? "pb-4" : ""}`}>
              <div className={`flex items-start gap-2 ${collapsedCards["idea"] ? "" : "mb-3"}`}>
                <Eye className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "hsl(var(--bone) / 0.55)" }} />
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.25, color: "hsl(var(--bone) / 0.92)" }}>{tr({ en: "The winning idea", es: "La idea ganadora" }, language)}</div>
                  <div style={{ fontSize: 11.5, lineHeight: 1.35, marginTop: 2, color: "hsl(var(--bone) / 0.46)" }}>{tr({ en: "the proven video this is based on", es: "el video probado en el que se basa" }, language)}</div>
                </div>
                <div className="ml-auto flex items-center gap-1.5 shrink-0">
                  {viewingInspirationUrls.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setDraftFromIdeaOpen(true)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium transition-colors shrink-0"
                      style={{ borderColor: "hsl(var(--bone) / 0.20)", color: "hsl(var(--bone) / 0.70)" }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = "hsl(var(--bone))"; e.currentTarget.style.borderColor = "hsl(var(--bone) / 0.45)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = "hsl(var(--bone) / 0.70)"; e.currentTarget.style.borderColor = "hsl(var(--bone) / 0.20)"; }}
                      title={tr({ en: "Write a full draft from this video's analysis, structured like your format reference", es: "Escribe un borrador completo desde el análisis de este video, con la estructura de tu referencia de formato" }, language)}
                    >
                      <Wand2 className="w-3 h-3" />
                      {tr({ en: "Draft script", es: "Redactar script" }, language)}
                    </button>
                  )}
                  {cardToggleButton("idea")}
                </div>
              </div>
              {!collapsedCards["idea"] && (
              <div className="flex flex-col gap-2">
                {viewingInspirationUrls.map((url, idx) =>
                  editingInspirationIdx === idx ? (
                    <Input
                      key={`edit-${idx}`}
                      autoFocus
                      value={inspirationDraft}
                      onChange={(e) => setInspirationDraft(e.target.value)}
                      placeholder={tr({ en: "Paste inspiration URL...", es: "Pega URL de inspiración..." }, language)}
                      className="text-sm h-8"
                      onKeyDown={async (e) => {
                        if (e.key === "Enter") {
                          const v = inspirationDraft.trim();
                          const next = [...viewingInspirationUrls];
                          if (v) next[idx] = v; else next.splice(idx, 1);
                          setEditingInspirationIdx(null);
                          await persistInspirations(next);
                        }
                        if (e.key === "Escape") setEditingInspirationIdx(null);
                      }}
                      onBlur={async () => {
                        const v = inspirationDraft.trim();
                        const next = [...viewingInspirationUrls];
                        if (v) next[idx] = v; else next.splice(idx, 1);
                        setEditingInspirationIdx(null);
                        await persistInspirations(next);
                      }}
                    />
                  ) : (
                    <div key={`${idx}-${url}`} className="flex items-center gap-1.5 min-w-0">
                      <button
                        onClick={() => setInspirationVideoUrl(url)}
                        className="group flex items-center gap-2 min-w-0 flex-1 rounded-md border border-border bg-muted/30 hover:bg-muted/50 px-2.5 py-1.5 text-left transition-colors"
                        title={tr({ en: "Watch inspiration", es: "Ver inspiración" }, language)}
                      >
                        <Play className="w-3.5 h-3.5 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
                        <span className="text-xs text-muted-foreground truncate">{url.replace(/^https?:\/\//, "")}</span>
                      </button>
                      <button
                        onClick={() => { setAddingInspiration(false); setEditingInspirationIdx(idx); setInspirationDraft(url); }}
                        className="inline-flex items-center text-muted-foreground hover:text-primary transition-colors shrink-0 p-1"
                        title={tr({ en: "Edit URL", es: "Editar URL" }, language)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => persistInspirations(viewingInspirationUrls.filter((_, i) => i !== idx))}
                        className="inline-flex items-center text-muted-foreground hover:text-destructive transition-colors shrink-0 p-1"
                        title={tr({ en: "Remove inspiration", es: "Quitar inspiración" }, language)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => { setEditingInspirationIdx(null); setInspirationDraft(""); setAddingInspiration(true); }}
                        className="inline-flex items-center text-muted-foreground hover:text-primary transition-colors shrink-0 p-1"
                        title={tr({ en: "Add inspiration", es: "Añadir inspiración" }, language)}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )
                )}

                {addingInspiration && (
                  <Input
                    autoFocus
                    value={inspirationDraft}
                    onChange={(e) => setInspirationDraft(e.target.value)}
                    placeholder={tr({ en: "Paste inspiration URL and press Enter...", es: "Pega URL de inspiración y presiona Enter..." }, language)}
                    className="text-sm h-8"
                    onKeyDown={async (e) => {
                      if (e.key === "Enter") {
                        const v = inspirationDraft.trim();
                        setAddingInspiration(false);
                        setInspirationDraft("");
                        if (v) await persistInspirations([...viewingInspirationUrls, v]);
                      }
                      if (e.key === "Escape") { setAddingInspiration(false); setInspirationDraft(""); }
                    }}
                    onBlur={async () => {
                      const v = inspirationDraft.trim();
                      setAddingInspiration(false);
                      setInspirationDraft("");
                      if (v) await persistInspirations([...viewingInspirationUrls, v]);
                    }}
                  />
                )}

                {viewingInspirationUrls.length === 0 && !addingInspiration && (
                  <button
                    onClick={() => { setEditingInspirationIdx(null); setInspirationDraft(""); setAddingInspiration(true); }}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors self-start"
                  >
                    <Plus className="w-3.5 h-3.5" /> {tr({ en: "Add inspiration", es: "Añadir inspiración" }, language)}
                  </button>
                )}
              </div>
              )}

              <VideoBreakdownDialog
                open={!!inspirationVideoUrl}
                onClose={() => setInspirationVideoUrl(null)}
                url={inspirationVideoUrl}
                title={tr({ en: "The Winning Idea", es: "La Idea Ganadora" }, language)}
              />

              {viewingScriptId && (
                <DraftFromWinningIdeaDialog
                  open={draftFromIdeaOpen}
                  onClose={() => setDraftFromIdeaOpen(false)}
                  scriptId={viewingScriptId}
                  scriptTitle={viewingMetadata?.idea_ganadora ?? ""}
                  inspirationUrl={viewingInspirationUrls[0] ?? null}
                  formatReferenceUrl={viewingFormatReferenceUrl}
                  language={language}
                  // MUST go through handleBlocksChange (not raw setDocBlocks):
                  // it diffs prev vs next and registers every replaced block id
                  // as removed. The save path only deletes explicitly-removed
                  // ids (non-destructive by design), so a raw replace left the
                  // old document in the DB and Save resurrected it.
                  onApply={(lines) => handleBlocksChange(() => withUids(synthesizeBlocksFromLines(lines)))}
                />
              )}
            </div>

            {/* Caption */}
            <div className={`editorial-card p-5 mb-2 ${collapsedCards["caption"] ? "pb-4" : ""}`}>
              <div className={`flex items-center gap-2 ${collapsedCards["caption"] ? "" : "mb-3"}`}>
                <MessageSquare className="w-3.5 h-3.5" style={{ color: "hsl(var(--bone) / 0.55)" }} />
                <span className="editorial-eyebrow" style={{ letterSpacing: "0.20em", fontSize: 10 }}>
                  {tr({ en: "Caption", es: "Caption" }, language)}
                </span>
                <div className="ml-auto flex items-center gap-1.5 shrink-0">
                  {(isAdmin || isConnectaPlus) && (
                    <Button
                      onClick={handleGenerateCaption}
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1.5 text-xs"
                      disabled={generatingCaption || !viewingScriptId}
                      title={tr({ en: "Generate an Instagram caption from this script with AI", es: "Genera un caption de Instagram a partir de este script con IA" }, language)}
                    >
                      {generatingCaption ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      <span>{tr({ en: "Generate", es: "Generar" }, language)}</span>
                    </Button>
                  )}
                  {cardToggleButton("caption")}
                </div>
              </div>
              {!collapsedCards["caption"] && (
              <Textarea
                value={viewingCaption}
                onChange={(e) => setViewingCaption(e.target.value)}
                placeholder={tr({ en: "Write the social media caption for this video...", es: "Escribe el caption para las redes sociales..." }, language)}
                rows={4}
                className="text-sm resize-none"
                style={{ background: "hsl(var(--bone) / 0.03)", borderColor: "hsl(var(--bone) / 0.10)", color: "hsl(var(--cream))" }}
                onBlur={async () => {
                  if (viewingScriptId) {
                    const { error } = await supabase.from("scripts").update({ caption: viewingCaption || null }).eq("id", viewingScriptId);
                    if (error) {
                      console.error("Caption save error:", error);
                      toast.error(tr({ en: "Failed to save caption", es: "Error al guardar caption" }, language));
                    } else {
                      // Sync caption to linked video_edits record
                      await supabase.from("video_edits").update({ caption: viewingCaption || null }).eq("script_id", viewingScriptId);
                      savedCaptionRef.current = viewingCaption;
                      broadcastSaved();
                      // If a remote ping was deferred because the caption was dirty, apply it now.
                      if (pendingRemoteSyncRef.current) { pendingRemoteSyncRef.current = false; handleRemoteSaved(); }
                    }
                  }
                }}
              />
              )}
            </div>

            <div className="flex items-center justify-end gap-2 mb-4 flex-wrap">
              <div className="flex gap-1.5 flex-wrap">
                {/* Unified Save — one click persists the block document (single source
                    of truth), the caption/metadata, and the gdrive footage auto-link. */}
                <Button
                  onClick={async () => {
                    const sid = viewingScriptId;
                    if (!sid || savingScript) return;
                    if (scriptBodyLength(docBlocks) > SCRIPT_BODY_CHAR_LIMIT) {
                      toast.error(tr({ en: "Script is too long. Trim it to 15,000 characters to save.", es: "El script es demasiado largo. Recórtalo a 15,000 caracteres para guardar." }, language));
                      return;
                    }
                    setSavingScript(true);
                    try {
                      // SAVE-WHAT-YOU-SEE: the explicit Save button makes the DB match the
                      // screen exactly. Any DB row not currently visible is deleted — this is
                      // what kills "deleted lines came back" for good (stale rows can linger in
                      // the DB from older sessions/tabs; the diff-save alone never removes rows
                      // this session didn't explicitly delete). Autosave keeps the gentler
                      // diff-only semantics; the previous state is in version History.
                      const dbBlocks = await getScriptBlocks(sid);
                      const visibleIds = new Set(docBlocks.filter((b) => b.id).map((b) => b.id as string));
                      const staleIds = dbBlocks
                        .filter((b) => b.id && !visibleIds.has(b.id as string))
                        .map((b) => b.id as string);
                      const res = await saveScriptBlocks(sid, docBlocks, {
                        baseline: baselineRef.current,
                        removedIds: Array.from(new Set([...removedIdsRef.current, ...staleIds])),
                        expectedRevision: revisionRef.current,
                      });
                      setDocBlocks(withUids(res.blocks));
                      baselineRef.current = buildBaseline(res.blocks.filter((b) => b.id) as any);
                      savedOrderRef.current = res.blocks.filter((b) => b.id).map((b) => b.id as string);
                      removedIdsRef.current = new Set();
                      revisionRef.current = res.revision;
                      // Save caption alongside the document
                      await supabase.from("scripts").update({ caption: viewingCaption || null }).eq("id", sid);
                      // Sync caption to linked video_edits record
                      await supabase.from("video_edits").update({ caption: viewingCaption || null }).eq("script_id", sid);
                      savedCaptionRef.current = viewingCaption;
                      // One ping after the full save (blocks + caption), then apply any deferred remote sync.
                      broadcastSaved();
                      if (pendingRemoteSyncRef.current) { pendingRemoteSyncRef.current = false; handleRemoteSaved(); }
                      // Keep legacy content-only reads (AI/teleprompter/public/canvas) consistent.
                      const fresh = await getScriptLines(sid);
                      setParsedLines(fresh);
                      // Auto-link Google Drive footage if present and not yet linked (preserved
                      // from the former Doc Editor save).
                      const gdriveLink = viewingMetadata?.google_drive_link;
                      if (gdriveLink && selectedClient && (!linkedVideoEdit?.footage || linkedVideoEdit?.upload_source !== 'supabase')) {
                        const { data: existing } = await supabase.from("video_edits").select("id, deleted_at").eq("script_id", sid).maybeSingle();
                        let veData: any;
                        if (existing) {
                          const { data: updated } = await supabase.from("video_edits").update({ deleted_at: null, reel_title: viewingMetadata?.idea_ganadora || "Untitled", script_url: `${window.location.origin}/s/${sid}`, footage: gdriveLink, upload_source: 'gdrive' }).eq("id", existing.id).select("id, client_id, footage, file_submission, upload_source, storage_path, storage_url, file_size_bytes").single();
                          veData = updated;
                        } else {
                          const { data: inserted } = await supabase.from("video_edits").insert({ client_id: selectedClient.id, script_id: sid, reel_title: viewingMetadata?.idea_ganadora || "Untitled", script_url: `${window.location.origin}/s/${sid}`, file_url: gdriveLink, footage: gdriveLink, upload_source: 'gdrive', ...lifecycleUpdate("Not started") }).select("id, client_id, footage, file_submission, upload_source, storage_path, storage_url, file_size_bytes").single();
                          veData = inserted;
                        }
                        if (veData) setLinkedVideoEdit({ id: veData.id, client_id: veData.client_id, footage: veData.footage, file_submission: veData.file_submission, upload_source: veData.upload_source, storage_path: veData.storage_path, storage_url: veData.storage_url, file_size_bytes: veData.file_size_bytes });
                      }
                      setIsDirty(false);
                      toast.success(tr({ en: "Script saved!", es: "¡Script guardado!" }, language));
                    } catch {
                      toast.error(tr({ en: "Error saving script", es: "Error al guardar" }, language));
                    } finally {
                      setSavingScript(false);
                    }
                  }}
                  variant="cta"
                  size="sm"
                  className="gap-1.5 text-xs sm:text-sm"
                  disabled={savingScript}
                >
                  {savingScript ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                  <span className="hidden sm:inline">{tr({ en: "Save", es: "Guardar" }, language)}</span>
                </Button>
                {(isAdmin || isConnectaPlus) && (
                  <Button
                    onClick={handleRecategorize}
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs sm:text-sm"
                    disabled={recategorizing}
                    title={tr({ en: "Re-categorize each line with AI (filming / voiceover / editing / text-on-screen)", es: "Recategorizar cada línea con IA (grabación / voz en off / edición / texto en pantalla)" }, language)}
                  >
                    {recategorizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                    <span className="hidden sm:inline">{tr({ en: "Re-categorize", es: "Recategorizar" }, language)}</span>
                  </Button>
                )}
                <Button
                  onClick={() => {
                    fetchVersions();
                    setShowHistory(true);
                  }}
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs sm:text-sm"
                  title={tr({ en: "View script history", es: "Ver historial del script" }, language)}
                >
                  <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">{tr({ en: "History", es: "Historial" }, language)}</span>
                </Button>
                <Button
                  onClick={() => {
                    const publicUrl = `${window.location.origin}/s/${viewingScriptId}`;
                    navigator.clipboard.writeText(publicUrl);
                    toast.success(tr(t.scripts.publicLinkCopied, language));
                  }}
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs sm:text-sm"
                >
                   <Link2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">{tr(t.scripts.share, language)}</span><span className="sm:hidden">{tr(t.scripts.link, language)}</span>
                 </Button>
                <Button onClick={() => setShowRecorder(true)} variant="outline" size="sm" className="gap-1.5 text-xs sm:text-sm">
                  <Video className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">{tr(t.scripts.record, language)}</span><span className="sm:hidden">Rec</span>
                </Button>
                <Button onClick={() => setShowTeleprompter(true)} variant="outline" size="sm" className="gap-1.5 text-xs sm:text-sm">
                  <MonitorPlay className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">{tr(t.scripts.teleprompter, language)}</span><span className="sm:hidden">TP</span>
                </Button>
              </div>
            </div>
            {(() => {
              const bodyLen = scriptBodyLength(docBlocks);
              const over = bodyLen > SCRIPT_BODY_CHAR_LIMIT;
              const near = !over && bodyLen > SCRIPT_BODY_CHAR_LIMIT * 0.9;
              return (
                <div className="flex justify-end mb-1">
                  <span
                    className="text-[11px] tabular-nums"
                    style={{ color: over ? "hsl(var(--destructive))" : near ? "hsl(var(--honey))" : "hsl(var(--bone) / 0.45)" }}
                  >
                    {bodyLen.toLocaleString()} / {SCRIPT_BODY_CHAR_LIMIT.toLocaleString()}
                    {over ? ` · ${tr({ en: "over limit — trim to save", es: "excede el límite — recorta para guardar" }, language)}` : ""}
                  </span>
                </div>
              );
            })()}
            {/* Unified block document — single source of truth (docBlocks).
                Renamable/custom sections, inline editing, slash, '# ', drag,
                line-type bars, empty sections visible. Saving is owned by the
                action row above (embedded mode hides the editor's own Save). */}
            <ScriptDocEditor
              embedded
              blocks={docBlocks}
              onBlocksChange={handleBlocksChange}
              scriptTitle={viewingMetadata?.idea_ganadora ?? ""}
              scriptMeta={
                [viewingMetadata?.target, viewingMetadata?.formato]
                  .filter(Boolean)
                  .join(" · ")
              }
              onExportPDF={() => {
                const typeColors: Record<string, string> = {
                  filming: '#f97316',
                  actor: 'hsl(var(--aqua))',
                  editor: 'hsl(var(--honey))',
                  text_on_screen: '#475569',
                };
                const sectionOrder = ['hook', 'body', 'cta'] as const;
                const sectionLabels: Record<string, string> = { hook: 'HOOK', body: 'BODY', cta: 'CTA' };
                // Export from the live block list (excludes heading rows, includes unsaved edits).
                const contentLines = docBlocks.filter((b) => b.block_kind !== "heading");
                const grouped: Record<string, typeof parsedLines> = { hook: [], body: [], cta: [] };
                contentLines.forEach(l => { const s = l.section || 'body'; if (grouped[s]) grouped[s].push(l); else grouped['body'].push(l); });

                const linesHtml = (ls: typeof parsedLines) => ls.map(l => {
                  const content = l.rich_text || l.text || '';
                  return `<div style="display:flex;align-items:stretch;margin-bottom:3px;page-break-inside:avoid;">
                    <div style="width:4px;flex-shrink:0;background:${typeColors[l.line_type] || '#475569'};border-radius:2px;margin-right:10px;"></div>
                    <div style="flex:1;font-size:13px;line-height:1.6;color:#1e293b;">${content}</div>
                  </div>`;
                }).join('');

                const sectionsHtml = sectionOrder.filter(s => grouped[s].length > 0).map(s => `
                  <div style="margin-bottom:16px;">
                    <div style="display:flex;align-items:center;gap:10px;margin:20px 0 10px;">
                      <div style="flex:1;height:1px;background:#e2e8f0;"></div>
                      <span style="font-size:9px;font-weight:700;letter-spacing:3px;color:#94a3b8;">${sectionLabels[s]}</span>
                      <div style="flex:1;height:1px;background:#e2e8f0;"></div>
                    </div>
                    ${linesHtml(grouped[s])}
                  </div>
                `).join('');

                const title = viewingMetadata?.idea_ganadora || 'Script';
                const meta = [viewingMetadata?.target, viewingMetadata?.formato].filter(Boolean).join(' · ');
                const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
                  <style>body{margin:0;padding:40px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1e293b;background:white;}@media print{body{padding:20px;}@page{margin:15mm;}}</style>
                </head><body>
                  <h1 style="font-size:20px;font-weight:700;color:#0f172a;margin:0 0 4px;">${title}</h1>
                  <p style="font-size:11px;color:#94a3b8;margin:0 0 28px;">${meta}</p>
                  ${sectionsHtml}
                </body></html>`;

                const w = window.open('', '_blank', 'width=800,height=700');
                if (!w) { window.print(); return; }
                w.document.write(html);
                w.document.close();
                w.onload = () => w.print();
              }}
            />

            {/* Footage & File Submission */}
            {viewingMetadata && (() => {
              const fmt = (b: number | null | undefined) => {
                if (!b) return '';
                if (b >= 1e9) return ` · ${(b / 1e9).toFixed(1)} GB`;
                if (b >= 1e6) return ` · ${(b / 1e6).toFixed(1)} MB`;
                return ` · ${(b / 1e3).toFixed(0)} KB`;
              };
              const isGDrive = (url: string | null) => !!url && url.includes('drive.google.com');
              const baseName = (path: string | null) => path ? path.split('/').pop() ?? path : '';
              const IMAGE_EXTS = ['.png', '.webp', '.jpg', '.jpeg', '.gif', '.avif', '.heic', '.heif', '.bmp', '.svg'];
              const AUDIO_EXTS = ['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg', '.oga', '.opus', '.aiff', '.aif', '.wma'];
              const VIDEO_EXTS = ['.mp4', '.mov', '.webm', '.mkv', '.avi', '.m4v', '.mpg', '.mpeg', '.wmv', '.flv', '.3gp', '.ts', '.mts', '.m2ts'];
              const ARCHIVE_EXTS = ['.zip', '.rar', '.7z', '.tar', '.gz', '.tgz'];
              const DOC_EXTS = ['.pdf', '.doc', '.docx', '.txt', '.rtf', '.pages', '.odt', '.csv', '.xls', '.xlsx', '.ppt', '.pptx', '.key', '.md', '.srt', '.vtt'];
              // Classify an uploaded file by extension for its at-a-glance card.
              const fileCardKind = (name: string): 'image' | 'audio' | 'video' | 'archive' | 'doc' | 'other' => {
                const l = name.toLowerCase();
                if (IMAGE_EXTS.some(ext => l.endsWith(ext))) return 'image';
                if (AUDIO_EXTS.some(ext => l.endsWith(ext))) return 'audio';
                if (VIDEO_EXTS.some(ext => l.endsWith(ext))) return 'video';
                if (ARCHIVE_EXTS.some(ext => l.endsWith(ext))) return 'archive';
                if (DOC_EXTS.some(ext => l.endsWith(ext))) return 'doc';
                return 'other';
              };

              const createVideoEdit = async (_subfolder: 'footage' | 'submission') => {
                if (!selectedClient || !viewingScriptId) return;
                const footageLink = viewingMetadata?.google_drive_link || null;
                // Check for ANY existing record (including soft-deleted) to avoid unique constraint conflicts
                const { data: existing } = await supabase.from("video_edits").select("id, deleted_at").eq("script_id", viewingScriptId).maybeSingle();
                let data: any;
                if (existing) {
                  // Restore if soft-deleted, and update fields
                  const { data: updated, error } = await supabase.from("video_edits").update({
                    deleted_at: null,
                    reel_title: viewingMetadata?.idea_ganadora || "Untitled",
                    script_url: `${window.location.origin}/s/${viewingScriptId}`,
                    footage: footageLink,
                    upload_source: footageLink ? 'gdrive' : null,
                  }).eq("id", existing.id).select("id, client_id, footage, file_submission, upload_source, storage_path, storage_url, file_size_bytes").single();
                  if (error) { toast.error(tr({ en: "Failed to update video edit record", es: "No se pudo actualizar el registro de edición" }, language)); return; }
                  data = updated;
                } else {
                  const { data: inserted, error } = await supabase.from("video_edits").insert({
                    client_id: selectedClient.id,
                    script_id: viewingScriptId,
                    reel_title: viewingMetadata?.idea_ganadora || "Untitled",
                    script_url: `${window.location.origin}/s/${viewingScriptId}`,
                    file_url: footageLink || "",
                    footage: footageLink,
                    upload_source: footageLink ? 'gdrive' : null,
                    ...lifecycleUpdate("Not started"),
                  }).select("id, client_id, footage, file_submission, upload_source, storage_path, storage_url, file_size_bytes").single();
                  if (error) { toast.error(tr({ en: "Failed to create video edit record", es: "No se pudo crear el registro de edición" }, language)); return; }
                  data = inserted;
                }
                setLinkedVideoEdit({ id: data.id, client_id: data.client_id, footage: data.footage, file_submission: data.file_submission, upload_source: data.upload_source, storage_path: data.storage_path, storage_url: data.storage_url, file_size_bytes: data.file_size_bytes });
              };

              const FootageCard = ({ url, kind, fileName, fileSize, accentColor, onView, onRemove }: { url: string; kind: 'video' | 'image' | 'audio' | 'archive' | 'doc' | 'other' | 'link'; fileName: string; fileSize: string; accentColor: string; onView: () => void; onRemove: () => void }) => {
                const KIND_LABEL: Record<string, string> = { video: 'Video', image: 'Image', audio: 'Audio', archive: 'Archive', doc: 'Document', other: 'File', link: 'Link' };
                const KIND_LABEL_I18N: Record<string, { en: string; es: string }> = {
                  video: { en: 'Video', es: 'Video' },
                  image: { en: 'Image', es: 'Imagen' },
                  audio: { en: 'Audio', es: 'Audio' },
                  archive: { en: 'Archive', es: 'Archivo' },
                  doc: { en: 'Document', es: 'Documento' },
                  other: { en: 'File', es: 'Archivo' },
                  link: { en: 'Link', es: 'Enlace' },
                };
                const KIND_BADGE: Record<string, string> = {
                  video: 'bg-green-500/15 text-green-400',
                  image: 'bg-sky-500/15 text-sky-400',
                  audio: 'bg-purple-500/15 text-purple-400',
                  archive: 'bg-amber-500/15 text-amber-400',
                  doc: 'bg-orange-500/15 text-orange-400',
                  other: 'bg-muted text-muted-foreground',
                  link: 'bg-primary/15 text-primary',
                };
                return (
                <div
                  className="flex items-center gap-3 rounded-xl border border-border bg-card/60 px-3 py-2.5 cursor-pointer hover:border-border/80 transition-colors group"
                  onClick={() => { if (kind === 'link' && url.startsWith('http')) { window.open(url, '_blank', 'noopener,noreferrer'); } else { onView(); } }}
                >
                  <div className="w-16 h-11 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden relative">
                    {kind === 'video' ? (
                      <>
                        <video src={url} muted preload="metadata" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                          <Play className="w-4 h-4 text-white drop-shadow" />
                        </div>
                      </>
                    ) : kind === 'image' ? (
                      <img src={url} alt={fileName} loading="lazy" className="w-full h-full object-cover" />
                    ) : kind === 'audio' ? (
                      <Music className="w-4 h-4 text-purple-400/80" />
                    ) : kind === 'archive' ? (
                      <Archive className="w-4 h-4 text-amber-400/80" />
                    ) : kind === 'doc' ? (
                      <FileText className="w-4 h-4 text-orange-400/80" />
                    ) : kind === 'other' ? (
                      <File className="w-4 h-4 text-muted-foreground/80" />
                    ) : (
                      <Link2 className="w-4 h-4 text-blue-400/70" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{fileName}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${KIND_BADGE[kind]}`}>
                        {tr(KIND_LABEL_I18N[kind] ?? { en: KIND_LABEL[kind], es: KIND_LABEL[kind] }, language)}
                      </span>
                      {fileSize && <span className="text-[10px] text-muted-foreground">{fileSize}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    {kind === 'link' && (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-7 h-7 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted"
                        onClick={e => e.stopPropagation()}
                        title={tr({ en: "Open link", es: "Abrir enlace" }, language)}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <button
                      className="w-7 h-7 rounded-lg border border-destructive/30 flex items-center justify-center text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                      onClick={e => { e.stopPropagation(); onRemove(); }}
                      title={tr({ en: "Remove", es: "Quitar" }, language)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                );
              };

              return (<>
              <div className="mt-6 pt-4 border-t border-[hsl(var(--bone) / 0.14)] p-4 rounded-2xl bg-[hsl(var(--graphite))]">
                <div className="flex items-center gap-2 mb-3">
                  <Link2 className="w-4 h-4 text-green-400" />
                  <span className="text-sm font-semibold text-green-400">Footage:</span>
                </div>
                {/* Supabase uploaded files — one card each */}
                {footageStorageFiles.length > 0 && (
                  <div className="flex flex-col gap-1.5 mb-2">
                    {footageStorageFiles.map(f => (
                      <FootageCard
                        key={f.path}
                        url={f.previewUrl}
                        kind={fileCardKind(f.name)}
                        fileName={f.name}
                        fileSize=""
                        accentColor="green"
                        onView={() => { setFootageViewerSubfolder(undefined); setFootageViewerOpen(true); }}
                        onRemove={async () => {
                          if (!linkedVideoEdit) return;
                          if (!confirm(language === "en" ? `Delete "${f.name}"?` : `¿Eliminar "${f.name}"?`)) return;
                          await supabase.storage.from('footage').remove([f.path]);
                          await loadStorageFiles(linkedVideoEdit.client_id, linkedVideoEdit.id);
                          if (footageStorageFiles.length === 1) {
                            await supabase.from("video_edits").update({ upload_source: null, storage_path: null, storage_url: null }).eq("id", linkedVideoEdit.id);
                            setLinkedVideoEdit(prev => prev ? { ...prev, upload_source: null, storage_path: null, storage_url: null } : prev);
                          }
                        }}
                      />
                    ))}
                  </div>
                )}
                {/* GDrive / external link card */}
                {linkedVideoEdit?.footage && !footageStorageFiles.length && (
                  <div className="mb-2">
                    <FootageCard
                      url={linkedVideoEdit.footage}
                      kind="link"
                      fileName={linkedVideoEdit.footage}
                      fileSize=""
                      accentColor="green"
                      onView={() => { setFootageViewerSubfolder(undefined); setFootageViewerOpen(true); }}
                      onRemove={async () => {
                        if (!confirm(language === "en" ? "Remove this footage?" : "¿Eliminar este footage?")) return;
                        if (viewingScriptId) await updateGoogleDriveLink(viewingScriptId, "");
                        await supabase.from("video_edits").update({ footage: null, upload_source: null, storage_path: null }).eq("id", linkedVideoEdit.id);
                        setLinkedVideoEdit(prev => prev ? { ...prev, footage: null, upload_source: null, storage_path: null } : prev);
                        setViewingMetadata(prev => prev ? { ...prev, google_drive_link: "" } : prev);
                      }}
                    />
                  </div>
                )}
                {linkedVideoEdit ? (
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => { setFootageViewerSubfolder(undefined); setFootageViewerOpen(true); }}>
                    <Plus className="h-3 w-3" />{language === "en" ? "View / Add" : "Ver / Agregar"}
                  </Button>
                ) : selectedClient && viewingScriptId && (
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => createVideoEdit('footage')}>
                    <Plus className="h-3 w-3" />{language === "en" ? "Add Footage" : "Agregar Footage"}
                  </Button>
                )}
              </div>

              {/* File Submission */}
              <div className="mt-4 pt-4 border-t border-[hsl(var(--bone) / 0.14)] p-4 rounded-2xl bg-[hsl(var(--graphite))]">
                <div className="flex items-center gap-2 mb-3">
                  <Link2 className="w-4 h-4 text-[hsl(var(--aqua))]" />
                  <span className="text-sm font-semibold text-[hsl(var(--aqua))]">{tr({ en: "File Submission:", es: "Archivo Entregado:" }, language)}</span>
                </div>
                {/* Supabase submission files — one card each */}
                {submissionStorageFiles.length > 0 && (
                  <div className="flex flex-col gap-1.5 mb-2">
                    {submissionStorageFiles.map(f => (
                      <FootageCard
                        key={f.path}
                        url={f.previewUrl}
                        kind={fileCardKind(f.name)}
                        fileName={f.name}
                        fileSize=""
                        accentColor="cyan"
                        onView={() => { setFootageViewerSubfolder('submission'); setFootageViewerOpen(true); }}
                        onRemove={async () => {
                          if (!linkedVideoEdit) return;
                          if (!confirm(language === "en" ? `Delete "${f.name}"?` : `¿Eliminar "${f.name}"?`)) return;
                          await supabase.storage.from('footage').remove([f.path]);
                          await loadStorageFiles(linkedVideoEdit.client_id, linkedVideoEdit.id);
                          if (submissionStorageFiles.length === 1) {
                            const dbClear: Record<string, null> = { file_submission: null };
                            // Also clear storage metadata if it was pointing to this submission file
                            if (linkedVideoEdit.storage_path?.includes('/submission/')) {
                              dbClear.storage_path = null;
                              dbClear.storage_url = null;
                            }
                            await supabase.from("video_edits").update(dbClear).eq("id", linkedVideoEdit.id);
                            setFileSubmission(null);
                            setLinkedVideoEdit(prev => {
                              if (!prev) return prev;
                              const update: typeof prev = { ...prev, file_submission: null };
                              if (prev.storage_path?.includes('/submission/')) {
                                update.storage_path = null;
                                update.storage_url = null;
                              }
                              return update;
                            });
                          }
                        }}
                      />
                    ))}
                  </div>
                )}
                {/* GDrive submission link card */}
                {fileSubmission && isGDrive(fileSubmission) && !submissionStorageFiles.length && (
                  <div className="mb-2">
                    <FootageCard
                      url={fileSubmission}
                      kind="link"
                      fileName={fileSubmission}
                      fileSize=""
                      accentColor="cyan"
                      onView={() => { setFootageViewerSubfolder('submission'); setFootageViewerOpen(true); }}
                      onRemove={async () => {
                        if (!linkedVideoEdit) return;
                        if (!confirm(language === "en" ? "Remove this file submission?" : "¿Eliminar este archivo?")) return;
                        await supabase.from("video_edits").update({ file_submission: null }).eq("id", linkedVideoEdit.id);
                        setFileSubmission(null);
                        setLinkedVideoEdit(prev => prev ? { ...prev, file_submission: null } : prev);
                        toast.success(language === "en" ? "Removed" : "Eliminado");
                      }}
                    />
                  </div>
                )}
                {linkedVideoEdit ? (
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => { setFootageViewerSubfolder('submission'); setFootageViewerOpen(true); }}>
                    <Plus className="h-3 w-3" />{language === "en" ? "View / Add" : "Ver / Agregar"}
                  </Button>
                ) : selectedClient && viewingScriptId && (
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => createVideoEdit('submission')}>
                    <Plus className="h-3 w-3" />{language === "en" ? "Add File" : "Agregar Archivo"}
                  </Button>
                )}
              </div>

              {/* Footage viewer modal */}
              {linkedVideoEdit && (
                <FootagePanel
                  open={footageViewerOpen}
                  onClose={() => setFootageViewerOpen(false)}
                  title={viewingMetadata?.idea_ganadora ?? ""}
                  videoEditId={linkedVideoEdit.id}
                  clientId={linkedVideoEdit.client_id}
                  footageUrl={linkedVideoEdit.footage}
                  fileSubmissionUrl={linkedVideoEdit.file_submission}
                  uploadSource={linkedVideoEdit.upload_source}
                  storagePath={linkedVideoEdit.storage_path}
                  storageUrl={linkedVideoEdit.storage_url}
                  subfolder={footageViewerSubfolder}
                  scriptId={viewingScriptId}
                  onComplete={async () => { if (viewingScriptId) await refreshLinkedVideoEdit(viewingScriptId); }}
                />
              )}
              </>);
            })()}
          </div>
        )}
      </div>
      </main>

      {showTeleprompter && (
        <Suspense fallback={null}>
        <Teleprompter lines={parsedLines} onClose={() => setShowTeleprompter(false)} showRecorder={showRecorder} onToggleRecorder={() => setShowRecorder((p) => !p)} scriptTitle={viewingMetadata?.idea_ganadora || scriptTitle || undefined} />
        </Suspense>
      )}

      {showRecorder && !showTeleprompter && (
        <Suspense fallback={null}>
        <VideoRecorder pip scriptTitle={viewingMetadata?.idea_ganadora || scriptTitle || undefined} onClose={() => setShowRecorder(false)} />
        </Suspense>
      )}

      <Dialog open={showResetPassword} onOpenChange={setShowResetPassword}>
        <DialogContent className="sm:max-w-sm bg-[hsl(var(--graphite))] border border-[hsl(var(--bone) / 0.14)] rounded-2xl">
          <DialogHeader>
            <DialogTitle>{tr(t.scripts.setNewPassword, language)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              type="password"
              placeholder={tr(t.scripts.newPasswordPlaceholder, language)}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSetNewPassword()}
            />
            <Button onClick={handleSetNewPassword} className="w-full" disabled={resetLoading}>
              {resetLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {tr(t.scripts.savePassword, language)}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showNamePrompt} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-sm bg-[hsl(var(--graphite))] border border-[hsl(var(--bone) / 0.14)] rounded-2xl" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{tr(t.scripts.whatsYourName, language)}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {tr(t.scripts.nameNeeded, language)}
          </p>
          <div className="space-y-4">
            <Input
              placeholder={tr(t.scripts.yourFullName, language)}
              value={promptName}
              onChange={(e) => setPromptName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
              autoFocus
            />
            <Button onClick={handleSaveName} className="w-full" disabled={namePromptLoading || !promptName.trim()}>
              {namePromptLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {tr(t.scripts.saveName, language)}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Review Dialog */}
      <Dialog open={!!reviewingScript} onOpenChange={(open) => { if (!open) { setReviewingScript(null); setRevisionNotes(""); setShowRevisionInput(false); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {isAdmin ? <CheckCircle2 className="w-4 h-4 text-primary" /> : <AlertTriangle className="w-4 h-4 text-red-400" />}
              {isAdmin ? tr({ en: "Review Script", es: "Revisar Script" }, language) : tr({ en: "Revision Notes", es: "Notas de Revisión" }, language)}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground line-clamp-2 break-words">
              {reviewingScript?.idea_ganadora || reviewingScript?.title}
            </DialogDescription>
          </DialogHeader>

          {/* Revision notes input — shown when needs revision is clicked or already set */}
          {isAdmin && showRevisionInput && (
            <div className="space-y-2">
              <Textarea
                placeholder={tr({ en: "Describe the revisions needed (e.g. change the hook, shorten the CTA...)", es: "Describe las revisiones necesarias (p. ej. cambia el hook, acorta el CTA...)" }, language)}
                className="min-h-[100px] text-sm resize-none border-red-500/40 focus-visible:ring-red-500/40"
                value={revisionNotes}
                onChange={(e) => setRevisionNotes(e.target.value)}
                autoFocus
              />
              <Button
                className="w-full border-red-500/50 text-red-400 hover:bg-red-500/10 gap-2"
                variant="outline"
                onClick={async () => {
                  try {
                    await updateReviewStatus(reviewingScript!.id, 'needs_revision', revisionNotes.trim() || null);
                    setReviewingScript(null);
                    setRevisionNotes("");
                    setShowRevisionInput(false);
                    if (selectedClient) fetchScriptsByClient(selectedClient.id);
                    toast.warning(tr({ en: "Script marked as needs revision", es: "Script marcado como necesita revisión" }, language));
                  } catch (e) {
                    toast.error(tr({ en: "Failed to update status", es: "No se pudo actualizar el estado" }, language));
                  }
                }}
              >
                <AlertTriangle className="w-4 h-4" /> {tr({ en: "Save Revision Notes", es: "Guardar Notas de Revisión" }, language)}
              </Button>
              <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground" onClick={() => setShowRevisionInput(false)}>
                {tr({ en: "Cancel", es: "Cancelar" }, language)}
              </Button>
            </div>
          )}

          {!showRevisionInput && (
            <>
              {/* Show existing revision notes if any */}
              {reviewingScript?.revision_notes && reviewingScript.review_status === 'needs_revision' && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                  <p className="font-medium text-xs text-red-400 mb-1">{tr({ en: "Revision notes:", es: "Notas de revisión:" }, language)}</p>
                  <p className="whitespace-pre-wrap">{reviewingScript.revision_notes}</p>
                </div>
              )}
              {isAdmin && (
              <div className="flex gap-3 py-2">
                <Button
                  className="flex-1 bg-green-600 hover:bg-green-500 text-white gap-2"
                  onClick={async () => {
                    try {
                      await updateReviewStatus(reviewingScript!.id, 'approved');
                      setReviewingScript(null);
                      if (selectedClient) fetchScriptsByClient(selectedClient.id);
                      toast.success(tr({ en: "Script approved", es: "Script aprobado" }, language));
                    } catch (e) {
                      toast.error(tr({ en: "Failed to update status", es: "No se pudo actualizar el estado" }, language));
                    }
                  }}
                >
                  <CheckCircle2 className="w-4 h-4" /> {tr({ en: "Approve", es: "Aprobar" }, language)}
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 border-red-500/50 text-red-400 hover:bg-red-500/10 gap-2"
                  onClick={() => {
                    setRevisionNotes(reviewingScript?.revision_notes || "");
                    setShowRevisionInput(true);
                  }}
                >
                  <AlertTriangle className="w-4 h-4" /> {tr({ en: "Needs Revision", es: "Necesita Revisión" }, language)}
                </Button>
              </div>
              )}
              {isAdmin && reviewingScript?.review_status && (
                <Button
                  variant="ghost" size="sm"
                  className="w-full text-muted-foreground text-xs"
                  onClick={async () => {
                    try {
                      await updateReviewStatus(reviewingScript!.id, null);
                      setReviewingScript(null);
                      if (selectedClient) fetchScriptsByClient(selectedClient.id);
                      toast.info(tr({ en: "Review status cleared", es: "Estado de revisión borrado" }, language));
                    } catch (e) {
                      toast.error(tr({ en: "Failed to clear status", es: "No se pudo borrar el estado" }, language));
                    }
                  }}
                >
                  {tr({ en: "Clear review status", es: "Borrar estado de revisión" }, language)}
                </Button>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="sm:max-w-md bg-[hsl(var(--graphite))] border border-[hsl(var(--bone) / 0.14)] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              {tr({ en: "Script History", es: "Historial del Script" }, language)}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {versionsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : versions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {tr({ en: "No previous versions", es: "Sin versiones previas" }, language)}
              </p>
            ) : (
              versions.map((version, idx) => (
                <div
                  key={version.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-card/50 hover:bg-card/80 transition-smooth group"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/20 text-xs font-semibold text-primary flex-shrink-0">
                      {idx + 1}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {tr({ en: "Version", es: "Versión" }, language)} {version.version_number}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(version.created_at).toLocaleString(language === "es" ? "es-MX" : "en-US")}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => restoreVersion(version.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span className="text-xs">{tr({ en: "Restore", es: "Restaurar" }, language)}</span>
                  </Button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Batch Generate Modal */}
      {showBatchModal && selectedClient && (
        <BatchGenerateModal
          clientId={selectedClient.id}
          clientName={selectedClient.name || tr({ en: "Client", es: "Cliente" }, language)}
          onClose={() => setShowBatchModal(false)}
          onSaved={() => {
            setShowBatchModal(false);
            fetchScriptsByClient(selectedClient.id);
          }}
        />
      )}

      <ShareFolderDialog folder={sharingFolder} onClose={() => setSharingFolder(null)} />

      </>
      )}
      </PageTransition>
  );
}
