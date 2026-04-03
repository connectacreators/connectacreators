import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Film, Mic, Scissors, Sparkles, ArrowLeft, Plus, User, FileText,
  Loader2, ChevronLeft, ExternalLink, Eye, Trash2, Pencil, LogOut, MonitorPlay, Link2, Save, CheckCircle2, Circle, MicIcon, MicOff,
  Camera, Video, GripVertical, RotateCcw, Archive, Wand2, Copy, Play, Clock, AlertTriangle, MoreHorizontal, Menu, MessageSquare,
  Folder, FolderOpen, FolderPlus, Zap, LayoutGrid, Flame, FilePlus2, Upload,
} from "lucide-react";
// Heavy components lazy-loaded to reduce initial chunk size
const Teleprompter = lazy(() => import("@/components/Teleprompter"));
const AIScriptWizard = lazy(() => import("@/components/AIScriptWizard"));
const SuperPlanningCanvas = lazy(() => import("@/pages/SuperPlanningCanvas"));
const VideoRecorder = lazy(() => import("@/components/VideoRecorder"));
import { useTheme } from "@/hooks/useTheme";
import { useLanguage } from "@/hooks/useLanguage";
import { t, tr } from "@/i18n/translations";
import { useParams, useSearchParams, useLocation } from "react-router-dom";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";

import { useClients, type Client } from "@/hooks/useClients";
import { useScripts, type ScriptLine, type Script, type ScriptMetadata } from "@/hooks/useScripts";
import { useAuth } from "@/hooks/useAuth";
import ScriptsLogin from "@/components/ScriptsLogin";
import { toast } from "sonner";
import FootageUploadDialog from "@/components/FootageUploadDialog";
import FootageViewerModal from "@/components/FootageViewerModal";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, useDroppable, useDraggable, type DragEndEvent, DragOverlay, type DragStartEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import BatchGenerateModal from "@/components/BatchGenerateModal";
import ScriptDocEditor from "@/components/ScriptDocEditor";
import { checkResourceLimit } from "@/utils/planLimits";
import PageTransition from "@/components/PageTransition";
import { Skeleton } from "@/components/ui/skeleton";

// Droppable folder card for drag-to-folder
function DroppableFolder({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `folder-${id}` });
  return (
    <div ref={setNodeRef} className={`transition-all rounded-2xl ${isOver ? "ring-2 ring-primary ring-offset-2 ring-offset-background scale-[1.02]" : ""}`}>
      {children}
    </div>
  );
}

// Draggable wrapper for script rows
function DraggableScript({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} style={{ opacity: isDragging ? 0.4 : 1, cursor: "grab" }}>
      {children}
    </div>
  );
}

// Mic button using Web Speech API
function MicButton({ onTranscript }: { onTranscript: (text: string) => void }) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);

  const toggle = useCallback(() => {
    if (listening && recRef.current) {
      recRef.current.stop();
      setListening(false);
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error("Speech recognition not supported");
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
      title={listening ? "Detener dictado" : "Dictar con micrófono"}
    >
      {listening ? <MicOff className="w-4 h-4" /> : <MicIcon className="w-4 h-4" />}
    </button>
  );
}

const getTypeConfig = (lang: "en" | "es") => ({
  filming: {
    label: tr(t.scripts.filmingInstructions, lang),
    icon: Film,
    color: "text-orange-400",
    bg: "bg-gradient-to-br from-orange-500/10 to-orange-900/5",
    border: "border-orange-500/25",
    dot: "bg-orange-500",
  },
  actor: {
    label: tr(t.scripts.voiceoverDialogue, lang),
    icon: Mic,
    color: "text-[#22d3ee]",
    bg: "bg-gradient-to-br from-[rgba(8,145,178,0.1)] to-[rgba(8,145,178,0.02)]",
    border: "border-[rgba(8,145,178,0.25)]",
    dot: "bg-[#0891B2]",
  },
  editor: {
    label: tr(t.scripts.editingInstructions, lang),
    icon: Scissors,
    color: "text-[#a3e635]",
    bg: "bg-gradient-to-br from-[rgba(132,204,22,0.08)] to-[rgba(132,204,22,0.02)]",
    border: "border-[rgba(132,204,22,0.2)]",
    dot: "bg-[#84CC16]",
  },
  text_on_screen: {
    label: tr(t.scripts.textOnScreen, lang),
    icon: MonitorPlay,
    color: "text-[#94a3b8]",
    bg: "bg-gradient-to-br from-[rgba(148,163,184,0.06)] to-[rgba(148,163,184,0.02)]",
    border: "border-[rgba(148,163,184,0.15)]",
    dot: "bg-[#64748b]",
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
    ? { label: "Selecciona tipo", icon: Plus, color: "text-muted-foreground", bg: "bg-gradient-to-br from-muted/30 to-muted/10", border: "border-muted-foreground/20", dot: "bg-muted-foreground" }
    : typeConfig[line.line_type];
  const Icon = cfg.icon;

  return (
    <div ref={setNodeRef} style={style} className={`flex items-start gap-2 sm:gap-3 p-3 sm:p-4 rounded-2xl border ${cfg.bg} ${cfg.border} transition-smooth group`}>
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="mt-1 p-1 rounded-lg cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground touch-none"
        title="Arrastra para reordenar"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <button
        className={`mt-0.5 p-1.5 rounded-xl ${cfg.bg} cursor-pointer hover:opacity-80 transition-smooth`}
        title={isPlaceholder ? "Seleccionar tipo de línea" : "Cambiar tipo de línea"}
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
        <span className={`text-xs font-semibold uppercase tracking-wider ${cfg.color}`}>{cfg.label}</span>
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
                    pushUndo();
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
                  pushUndo();
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
            onDoubleClick={() => { setEditingLineKey(lineKey); setEditLineText(line.text); }}
          >
            {isPlaceholder && !line.text ? "Doble clic para escribir..." : line.text}
          </p>
        )}
      </div>
      {!isEditingThis && (
        <Button
          variant="ghost"
          size="sm"
          className="opacity-0 group-hover:opacity-100 transition-smooth text-destructive hover:text-destructive h-7 w-7 p-0 flex-shrink-0 mt-1"
          title="Eliminar línea"
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

// (SortableSection removed — replaced by single flat DndContext in the render below)

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
  const { checking: subscriptionChecking } = useSubscriptionGuard();
  const { theme } = useTheme();
  const { language } = useLanguage();
  const { user, role, loading: authLoading, signInWithEmail, signUpWithEmail, isAdmin, isVideographer, isPasswordRecovery, clearPasswordRecovery } = useAuth();
  const { clients, loading: clientsLoading, addClient, updateClient } = useClients(!!user);
  const {
    scripts, trashedScripts, loading: scriptsLoading, fetchScriptsByClient, fetchTrashedScripts,
    categorizeAndSave, directSave, getScriptLines, deleteScript, restoreScript, permanentlyDeleteScript,
    updateScript, updateGoogleDriveLink, toggleGrabado, bulkToggleGrabado, bulkDelete,
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

  const [grabadoFilter, setGrabadoFilter] = useState<"all" | "grabado" | "no-grabado">("all");

  // Right-click context menu for "+ New Script"
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

  // Videographer assignment state (admin only)
  const [videographers, setVideographers] = useState<{ user_id: string; display_name: string; username: string | null }[]>([]);
  const [assignmentsMap, setAssignmentsMap] = useState<Record<string, string[]>>({}); // client_id -> videographer_user_ids
  const [assignOverlayClient, setAssignOverlayClient] = useState<string | null>(null); // client id with open overlay
  const [view, setView] = useState<View>(urlClientId ? "client-detail" : "clients");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [parsedLines, setParsedLines] = useState<ScriptLine[]>([]);
  const [scriptEditorTab, setScriptEditorTab] = useState<"cards" | "doc">("cards");
  const [savingDocEditor, setSavingDocEditor] = useState(false);

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
  const [viewingInspirationUrl, setViewingInspirationUrl] = useState<string | null>(null);
  const [showInspirationVideo, setShowInspirationVideo] = useState(false);
  const [editingInspirationUrl, setEditingInspirationUrl] = useState(false);
  const [tempInspirationUrl, setTempInspirationUrl] = useState("");
  const [viewingMetadata, setViewingMetadata] = useState<ScriptMetadata | null>(null);
  const [viewingCaption, setViewingCaption] = useState<string>("");
  const [viewingScriptId, setViewingScriptId] = useState<string | null>(null);
  const [fileSubmission, setFileSubmission] = useState<string | null>(null);
  const [linkedVideoEdit, setLinkedVideoEdit] = useState<{ id: string; client_id: string; footage: string | null; file_submission: string | null; upload_source: string | null; storage_path: string | null; storage_url: string | null; file_size_bytes: number | null } | null>(null);
  const [footageViewerOpen, setFootageViewerOpen] = useState(false);
  const [footageViewerSubfolder, setFootageViewerSubfolder] = useState<string | undefined>(undefined);
  const [footageStorageFiles, setFootageStorageFiles] = useState<{ name: string; path: string; signedUrl: string }[]>([]);
  const [submissionStorageFiles, setSubmissionStorageFiles] = useState<{ name: string; path: string; signedUrl: string }[]>([]);

  // Edit mode
  const [editingScript, setEditingScript] = useState<Script | null>(null);
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

  useEffect(() => {
    if (clientsLoading || clients.length === 0 || selectedClient) return;

    // If URL has a clientId param, auto-select that client
    if (urlClientId) {
      const target = clients.find((c) => c.id === urlClientId);
      if (target) {
        setSelectedClient(target);
        fetchScriptsByClient(target.id);
        // Check for view=canvas param to auto-open Connecta AI
        const viewParam = searchParams.get("view");
        if (viewParam === "canvas") {
          setView("super-planning");
        } else {
          setView("client-detail");
        }
        // Check for scriptTitle query param to auto-open
        const scriptTitleParam = searchParams.get("scriptTitle");
        if (scriptTitleParam) {
          setAutoOpenScriptTitle(scriptTitleParam);
          searchParams.delete("scriptTitle");
          setSearchParams(searchParams, { replace: true });
        }
      }
      return;
    }

    if (isAdmin || isVideographer) return; // Staff see the client list

    const myClient = clients.find((c) => c.user_id === user?.id);
    if (!myClient) return;
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
      setView("client-detail");
    }
  }, [urlClientId, clientsLoading, clients]);

  // Handle view=canvas when navigating back with selectedClient already set
  useEffect(() => {
    const viewParam = searchParams.get("view");
    if (viewParam === "canvas" && selectedClient) {
      setView("super-planning");
    }
  }, [searchParams, selectedClient]);

  // Auto-open script by title from query param
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
    if (error) { toast.error("Failed to create folder"); return; }
    setFolders((prev) => [...prev, data]);
    setNewFolderName("");
    setCreatingFolder(false);
  }, [newFolderName, selectedClient, viewingFolderId]);

  const handleMoveToFolder = useCallback(async (scriptId: string, folderId: string | null) => {
    const { error } = await supabase.from("scripts").update({ folder_id: folderId }).eq("id", scriptId);
    if (error) { toast.error("Failed to move script"); return; }
    if (selectedClient) fetchScriptsByClient(selectedClient.id);
    toast.success(folderId ? "Script moved to folder" : "Script removed from folder");
  }, [selectedClient]);

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
    toast.success(`${ids.length} script${ids.length !== 1 ? "s" : ""} ${folderId ? "moved to folder" : "removed from folder"}`);
    exitSelectMode();
  }, [selectedScriptIds, selectedClient, exitSelectMode]);

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
    const { over } = event;
    if (!over) return;
    const folderId = String(over.id);
    // Check it's a folder drop target (prefixed with folder-)
    if (!folderId.startsWith("folder-")) return;
    const actualFolderId = folderId.replace("folder-", "");
    const ids = Array.from(selectedScriptIds);
    if (ids.length === 0) return;
    await Promise.all(ids.map((id) => supabase.from("scripts").update({ folder_id: actualFolderId }).eq("id", id)));
    if (selectedClient) fetchScriptsByClient(selectedClient.id);
    toast.success(`${ids.length} script${ids.length !== 1 ? "s" : ""} moved to folder`);
    exitSelectMode();
  }, [selectedScriptIds, selectedClient, exitSelectMode]);

  // Undo/Redo helper
  const pushUndo = useCallback(() => {
    undoStack.current = [...undoStack.current.slice(-29), [...parsedLines]];
  }, [parsedLines]);

  // Keyboard listener for Ctrl+Z / Cmd+Z undo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isUndo = (e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey;
      if (!isUndo) return;

      // Don't intercept if focused in a text input/textarea
      const tag = (document.activeElement as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

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

  // Warn browser when user edits a line and tries to close/refresh the tab
  useEffect(() => {
    if (editingLineKey === null) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [editingLineKey]);

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
      toast.error("Error loading script history");
    } finally {
      setVersionsLoading(false);
    }
  }, [viewingScriptId]);

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
        toast.error("Version not found");
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
        }));
        await supabase.from("script_lines").insert(rows);
      }

      // Reload from DB
      const result = await getScriptLines(viewingScriptId);
      if (result) {
        setParsedLines(result);
      }

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
    setScriptTitle(""); setScriptInput(""); setInspirationUrl(""); setFormato(""); setGoogleDriveLink("");
    setView("new-script");
  }, []);

  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => { window.removeEventListener("click", close); window.removeEventListener("scroll", close, true); };
  }, [ctxMenu]);

  // Load storage files whenever linked video edit changes
  useEffect(() => {
    if (linkedVideoEdit) {
      loadStorageFiles(linkedVideoEdit.client_id, linkedVideoEdit.id);
    } else {
      setFootageStorageFiles([]);
      setSubmissionStorageFiles([]);
    }
  }, [linkedVideoEdit?.id]);

  // Auth loading
  if (authLoading || subscriptionChecking) {
    return (
      <PageTransition className="flex-1 flex flex-col overflow-hidden">
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

    // Parse script input — assign sections positionally (first=hook, last=cta, middle=body)
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
      return {
        line_type: 'actor' as const,
        section,
        text: line.trim(),
      };
    });

    if (scriptLines.length === 0) {
      toast.error(tr({ en: "Please enter a script with at least one line", es: "Por favor ingresa un script con al menos una línea" }, language));
      return;
    }

    // Check plan limit before saving (admins and videographers are unlimited)
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

    const result = await directSave({
      clientId: selectedClient.id,
      lines: scriptLines,
      ideaGanadora: scriptTitle.trim() || "Sin título",
      target: "",
      formato: formato || "",
      inspirationUrl: inspirationUrl.trim() || undefined,
      googleDriveLink: googleDriveLink.trim() || undefined,
    });

    if (result) {
      const fresh = await getScriptLines(result.scriptId);
      setParsedLines(fresh);
      setScriptEditorTab("cards");
      setViewingInspirationUrl(inspirationUrl.trim() || null);
      setViewingMetadata(result.metadata);
      setViewingScriptId(result.scriptId);
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
      setScriptEditorTab("cards");
      setViewingInspirationUrl(inspirationUrl.trim() || null);
      setViewingMetadata(result.metadata);
      setViewingScriptId(editingScript.id);
      setEditingScript(null);
      setView("view-script");
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
    setScriptEditorTab("cards");
    setViewingInspirationUrl(script.inspiration_url);
    setViewingCaption(script.caption ?? "");
    setViewingMetadata({
      idea_ganadora: script.idea_ganadora,
      target: script.target,
      formato: script.formato,
      google_drive_link: script.google_drive_link,
    });
    setViewingScriptId(script.id);
    // Load file_submission and linked video_edit record
    try {
      const { data: videoData } = await supabase.from("video_edits").select("id, client_id, file_submission, footage, upload_source, storage_path, storage_url, file_size_bytes").eq("script_id", script.id).maybeSingle();
      setFileSubmission(videoData?.file_submission || null);
      setLinkedVideoEdit(videoData ? { id: videoData.id, client_id: videoData.client_id, footage: videoData.footage, file_submission: videoData.file_submission, upload_source: videoData.upload_source, storage_path: videoData.storage_path, storage_url: videoData.storage_url, file_size_bytes: videoData.file_size_bytes } : null);
    } catch { setFileSubmission(null); setLinkedVideoEdit(null); }
    setView("view-script");
  };

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
      return Promise.all(files.map(async f => {
        const path = `${prefix}${f.name}`;
        const { data: url } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
        return url ? { name: f.name, path, signedUrl: url.signedUrl } : null;
      })).then(r => r.filter(Boolean) as { name: string; path: string; signedUrl: string }[]);
    };
    const [footage, submission] = await Promise.all([
      listAndSign(`${clientId}/${videoEditId}/`),
      listAndSign(`${clientId}/${videoEditId}/submission/`),
    ]);
    setFootageStorageFiles(footage);
    setSubmissionStorageFiles(submission);
  };

  const handleEditScript = (script: Script) => {
    setEditingScript(script);
    setScriptTitle(script.title);
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
      setView("client-detail");
      setParsedLines([]);
      setScriptTitle("");
      setScriptInput("");
      setInspirationUrl("");
      setFormato("");
      setGoogleDriveLink("");
      setViewingInspirationUrl(null);
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
      <PageTransition className="flex-1 flex flex-col overflow-hidden">
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
          <button
            onClick={handleCtxNewScript}
            className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-card/95 backdrop-blur-md border border-border shadow-xl text-sm font-semibold text-foreground hover:bg-primary/15 hover:text-primary hover:border-primary/30 transition-all"
          >
            <FilePlus2 className="w-4 h-4" />
            New Script
          </button>
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
              <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">
                Script <span className="text-primary">Breakdown</span>
              </h1>
              <p className="text-muted-foreground max-w-xl mx-auto">
                {isAdmin ? tr(t.scripts.manageAll, language) : isVideographer ? tr(t.scripts.assignedClients, language) : tr(t.scripts.manageYour, language)}
              </p>
            </div>

            {/* New Client (admin only) */}
            {isAdmin && (
              showNewClient ? (
                <div className="bg-gradient-to-br from-card via-card to-muted/30 border border-border rounded-2xl p-6 mb-6 space-y-4 animate-fade-in">
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
                <div className="bg-gradient-to-br from-card via-card to-muted/30 border border-border rounded-2xl p-6 mb-6 space-y-4 animate-fade-in">
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
                          <div key={v.user_id} className="p-3 rounded-xl bg-gradient-to-br from-muted/30 to-muted/10 border border-border space-y-2">
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
                                       toast.error(r.error || "Error");
                                    }
                                  } catch { toast.error("Error"); }
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
                          toast.error(e.message || "Error");
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
                      className="flex items-center gap-4 p-4 bg-gradient-to-br from-card via-card to-muted/30 border border-border rounded-2xl hover:border-primary/50 hover:from-card hover:to-primary/10 transition-smooth text-left w-full"
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
                        className="absolute top-1/2 -translate-y-1/2 right-12 p-1.5 rounded-full border-2 border-dashed border-muted-foreground/40 hover:border-primary/60 transition-smooth"
                        title={tr(t.scripts.assignVideographer, language)}
                      >
                        <Camera className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    )}

                    {/* Assignment overlay */}
                    {isAdmin && assignOverlayClient === c.id && (
                      <div className="absolute top-14 right-4 z-50 bg-gradient-to-br from-card to-muted/40 border border-border rounded-xl p-3 shadow-lg min-w-[180px] animate-fade-in">
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
              <h1 className="text-xl sm:text-2xl font-bold text-foreground">
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
                onClick={() => { setScriptTitle(""); setScriptInput(""); setInspirationUrl(""); setFormato(""); setGoogleDriveLink(""); setView("new-script"); }}
                variant="cta"
                className="gap-2 flex-shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">{tr(t.scripts.newScript, language)}</span>
                <span className="sm:hidden">New</span>
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
                    title="Batch Generate"
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <Zap className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => setCreatingFolder(true)}
                  title="New folder"
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <FolderPlus className="w-4 h-4" />
                </button>
                {selectedScriptIds.size > 0 && (
                  <button
                    onClick={exitSelectMode}
                    title="Deselect all"
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-primary bg-primary/10 transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={handleToggleTrash}
                  title={showTrash ? "Hide trash" : "Trash"}
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
                        <div key={s.id} className="flex items-center gap-2 sm:gap-4 p-3 sm:p-4 bg-gradient-to-br from-card via-card to-destructive/5 border border-border rounded-2xl transition-smooth overflow-hidden opacity-70">
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
                if (grabadoFilter === "grabado") return s.grabado;
                if (grabadoFilter === "no-grabado") return !s.grabado;
                return true;
              });

              const visibleIds = filtered.map((s) => s.id);
              const ScriptCard = ({ s }: { s: typeof scripts[0] }) => (
                <div key={s.id} className={`flex items-center gap-2 sm:gap-4 p-3 sm:p-4 bg-gradient-to-br border rounded-2xl transition-smooth overflow-hidden select-none ${
                    selectedScriptIds.has(s.id) ? 'ring-1 ring-primary/40 ' : ''
                  }${
                    (s as any).status === 'draft'
                      ? 'from-orange-950/30 via-orange-900/15 to-orange-900/10 border-orange-500/40 hover:border-orange-400/60'
                      : s.review_status === 'approved'
                      ? 'from-green-950/40 via-green-900/20 to-green-900/10 border-green-500/40'
                      : s.review_status === 'needs_revision'
                      ? 'from-red-950/40 via-red-900/20 to-red-900/10 border-red-500/40'
                      : 'from-card via-card to-muted/30 border-border hover:border-primary/50 hover:to-primary/10'
                  }`}>
                  <button onClick={(e) => { e.stopPropagation(); handleScriptSelect(s.id, e, visibleIds); }} className="flex-shrink-0" title="Select (Shift+click for range)">
                    {selectedScriptIds.has(s.id)
                      ? <CheckCircle2 className="w-5 h-5 text-primary" />
                      : <Circle className="w-5 h-5 text-muted-foreground hover:text-foreground" />}
                  </button>
                  <button
                    onClick={(e) => {
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
                        <p className={`font-semibold truncate max-w-full ${s.grabado ? "text-muted-foreground line-through" : "text-foreground"}`}>{s.title}</p>
                        {(s as any).status === "draft" && (
                          <span className="flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">In Progress</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleDateString("es-MX")}</p>
                    </div>
                  </button>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {s.review_status === 'needs_revision' && (
                      <span className="text-xs text-red-400 hidden sm:inline">Needs revision</span>
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
                                  onClick={() => handleEditScript(s)}
                                >
                                  <Pencil className="w-4 h-4" /> Edit
                                </button>
                              )}
                              {/* Move to folder submenu */}
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-foreground transition-colors hover:bg-muted">
                                    <Folder className="w-4 h-4" /> Move to folder {bulkHint}
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-44 p-1" align="end" side="left">
                                  {(isBulk || s.folder_id) && (
                                    <button
                                      className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground transition-colors hover:bg-muted"
                                      onClick={() => isBulk ? handleBulkMoveToFolder(null) : handleMoveToFolder(s.id, null)}
                                    >
                                      Remove from folder
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
                                  ? (bulkIds.some((id) => !scripts.find((sc) => sc.id === id)?.grabado) ? "Mark as recorded" : "Unmark recorded")
                                  : (s.grabado ? "Unmark recorded" : "Mark as recorded")
                                }
                                {bulkHint}
                              </button>
                              {/* Review (admin only) */}
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
                                  {s.review_status === 'approved' ? 'Approved' : s.review_status === 'needs_revision' ? 'Needs Revision' : 'Review'}
                                </button>
                              )}
                              <button
                                className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-destructive transition-colors hover:bg-destructive/10"
                                onClick={async () => {
                                  if (isBulk) { await handleBulkDelete(); }
                                  else { handleDeleteScript(s.id); }
                                }}
                              >
                                <Trash2 className="w-4 h-4" /> Delete {bulkHint}
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
                    </div>
                  )}

                  <DndContext sensors={listSensors} onDragStart={handleListDragStart} onDragEnd={handleListDragEnd}>
                  {/* ── Folder grid (shown at root and inside folders when subfolders exist) ── */}
                  {(childFolders.length > 0 || creatingFolder) && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
                      {childFolders.map((f) => {
                        const count = scripts.filter(s => s.folder_id === f.id).length;
                        const subCount = folders.filter(sf => sf.parent_id === f.id).length;
                        return (
                          <DroppableFolder key={f.id} id={f.id}>
                            <button
                              onClick={() => setViewingFolderId(f.id)}
                              className="w-full relative flex flex-col items-start gap-2 p-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm hover:bg-white/10 hover:border-white/20 transition-all text-left group overflow-hidden"
                            >
                              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl" />
                              <Folder className="w-7 h-7 text-primary/80 group-hover:text-primary transition-colors relative z-10" />
                              <div className="relative z-10 w-full min-w-0">
                                <p className="font-semibold text-foreground text-sm truncate">{f.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {count} script{count !== 1 ? "s" : ""}
                                  {subCount > 0 && ` · ${subCount} folder${subCount !== 1 ? "s" : ""}`}
                                </p>
                              </div>
                            </button>
                          </DroppableFolder>
                        );
                      })}
                      {/* New folder card */}
                      {creatingFolder ? (
                        <div className="flex flex-col gap-2 p-4 rounded-2xl border border-primary/30 bg-primary/5 backdrop-blur-sm">
                          <Input
                            autoFocus
                            value={newFolderName}
                            onChange={(e) => setNewFolderName(e.target.value)}
                            placeholder={viewingFolderId ? "Subfolder name" : "Folder name"}
                            className="h-7 text-sm bg-transparent border-primary/40"
                            onKeyDown={(e) => { if (e.key === "Enter") handleCreateFolder(); if (e.key === "Escape") { setCreatingFolder(false); setNewFolderName(""); } }}
                          />
                          <div className="flex gap-1">
                            <Button size="sm" variant="cta" className="h-6 text-xs px-2" onClick={handleCreateFolder}>Save</Button>
                            <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => { setCreatingFolder(false); setNewFolderName(""); }}>Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setCreatingFolder(true)}
                          className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border border-dashed border-border hover:border-primary/40 hover:bg-primary/5 transition-all text-muted-foreground hover:text-primary"
                        >
                          <FolderPlus className="w-7 h-7" />
                          <span className="text-xs font-medium">New folder</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* ── Script list (filtered by folder or unfiled) ── */}
                  {filtered.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">
                      {viewingFolderId !== null ? "No scripts in this folder yet." : scripts.length === 0 ? tr(t.scripts.noScripts, language) : tr(t.scripts.noScriptsCategory, language)}
                    </p>
                  ) : (
                    <div className="grid gap-3">
                      {filtered.map((s) => <DraggableScript key={s.id} id={s.id}><ScriptCard s={s} /></DraggableScript>)}
                    </div>
                  )}

                  {/* Drag overlay ghost */}
                  <DragOverlay>
                    {draggingScriptId && (
                      <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-primary/15 border border-primary/30 shadow-2xl backdrop-blur-sm" style={{ width: 280 }}>
                        <Folder className="w-4 h-4 text-primary" />
                        <span className="text-sm font-medium text-primary">
                          Moving {selectedScriptIds.size} script{selectedScriptIds.size !== 1 ? "s" : ""}
                        </span>
                      </div>
                    )}
                  </DragOverlay>
                  </DndContext>
                </>
              );
            })()
            )}

            {/* ── Floating glass bulk-action bar ── */}
            {selectedScriptIds.size > 0 && (
              <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-2xl px-4 py-2.5" style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
                <span className="text-sm font-medium text-foreground">{selectedScriptIds.size} selected</span>
                <div className="w-px h-4 bg-border" />
                <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => handleSelectAll(scripts)}>
                  Select All
                </Button>
                <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={exitSelectMode}>
                  Deselect
                </Button>
                <div className="w-px h-4 bg-border" />
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-xs h-7 px-2 gap-1">
                      <Folder className="w-3 h-3" /> Move to folder
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-1" align="center" side="top">
                    <button
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted transition-colors"
                      onClick={() => handleBulkMoveToFolder(null)}
                    >
                      Remove from folder
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
                  <CheckCircle2 className="w-3 h-3" /> Mark recorded
                </Button>
                <div className="w-px h-4 bg-border" />
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10 gap-1"
                  onClick={handleBulkDelete}
                >
                  <Trash2 className="w-3 h-3" /> Delete
                </Button>
              </div>
            )}
          </>
        )}

        {/* ===== NEW / EDIT SCRIPT ===== */}
        {(view === "new-script" || view === "edit-script") && (
          <>
             <h2 className="text-xl font-bold text-foreground mb-2">
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
                    setScriptEditorTab("cards");
                    setViewingInspirationUrl(inspirationUrl || null);
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

                 <Input placeholder={tr(t.scripts.scriptTitle, language)} value={scriptTitle} onChange={(e) => setScriptTitle(e.target.value)} className="mb-3" />
                 <Input placeholder={tr(t.scripts.inspirationUrl, language)} value={inspirationUrl} onChange={(e) => setInspirationUrl(e.target.value)} className="mb-3" />
                 
                 {/* Vault Template Toggle */}
                 <div className="flex items-center gap-3 mb-3 p-3 rounded-xl border border-border bg-gradient-to-r from-card to-muted/20">
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
                     <Archive className="w-4 h-4 text-[#22d3ee]" />
                     <span className="text-sm font-medium text-foreground">
                       {tr({ en: "Use a script from the Vault", es: "Usar un guion del Vault" }, language)}
                     </span>
                   </div>
                 </div>

                 {useAsTemplate && (
                   <div className="mb-3 p-3 rounded-xl border border-[rgba(8,145,178,0.25)] bg-gradient-to-br from-[rgba(8,145,178,0.05)] to-[rgba(8,145,178,0.02)]">
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
                         <SelectTrigger className="bg-transparent border-[rgba(8,145,178,0.25)]">
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
                     <SelectTrigger className="bg-gradient-to-r from-card to-muted/30">
                       <SelectValue placeholder={tr(t.scripts.selectFormat, language)} />
                     </SelectTrigger>
                     <SelectContent className="bg-gradient-to-br from-card to-muted/20 border-border z-50">
                       <SelectItem value="TALKING HEAD">Talking Head</SelectItem>
                       <SelectItem value="B-ROLL CAPTION">B-Roll Caption</SelectItem>
                       <SelectItem value="ENTREVISTA">{tr(t.scripts.interview, language)}</SelectItem>
                       <SelectItem value="VARIADO">{tr(t.scripts.mixed, language)}</SelectItem>
                     </SelectContent>
                   </Select>
                </div>

                <Input placeholder={tr(t.scripts.googleDriveLink, language)} value={googleDriveLink} onChange={(e) => setGoogleDriveLink(e.target.value)} className="mb-3" />

                 <div className="relative mb-4">
                  <Textarea
                    value={scriptInput}
                    onChange={(e) => setScriptInput(e.target.value)}
                    placeholder={tr(t.scripts.pasteDictate, language)}
                    className="min-h-[200px] bg-gradient-to-br from-card to-muted/20 border-border font-mono text-sm resize-y pr-12"
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

        {/* ===== VIEW SCRIPT RESULT ===== */}
        {view === "view-script" && parsedLines.length > 0 && (
          <div className="space-y-3 animate-fade-in">
            {/* Tab switcher: Card View | Doc Editor */}
            <div className="flex items-center border-b border-border">
              <button
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                  scriptEditorTab === "cards"
                    ? "text-[#22d3ee] border-[#0891b2]"
                    : "text-muted-foreground border-transparent hover:text-foreground"
                }`}
                onClick={() => setScriptEditorTab("cards")}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                Card View
              </button>
              <button
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                  scriptEditorTab === "doc"
                    ? "text-[#22d3ee] border-[#0891b2]"
                    : "text-muted-foreground border-transparent hover:text-foreground"
                }`}
                onClick={() => setScriptEditorTab("doc")}
              >
                <FileText className="w-3.5 h-3.5" />
                Doc Editor
              </button>
            </div>

            {/* Card View content */}
            {scriptEditorTab === "cards" && (
            <>
            {/* Metadata inline */}
            {viewingMetadata && (viewingMetadata.idea_ganadora || viewingMetadata.target || viewingMetadata.formato) && (
              <div className="mb-4 space-y-1 p-4 rounded-2xl bg-gradient-to-br from-card via-card to-muted/30 border border-border">
                {viewingMetadata.idea_ganadora && (
                  <p className="text-sm text-foreground">
                    <span className="font-semibold text-[#22d3ee]">{tr(t.scripts.winningIdea, language)}:</span>{" "}
                    {viewingMetadata.idea_ganadora}
                  </p>
                )}
                {viewingMetadata.target && (
                  <p className="text-sm text-foreground">
                    <span className="font-semibold text-orange-400">{tr(t.scripts.target, language)}:</span>{" "}
                    {viewingMetadata.target}
                  </p>
                )}
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <span className="font-semibold text-[#22d3ee]">{tr(t.scripts.format, language)}:</span>
                  <Select
                    value={viewingMetadata.formato || ""}
                    onValueChange={async (val) => {
                      if (viewingScriptId) {
                        await supabase.from("scripts").update({ formato: val }).eq("id", viewingScriptId);
                        setViewingMetadata((prev) => prev ? { ...prev, formato: val } : prev);
                      }
                    }}
                  >
                    <SelectTrigger className="h-7 w-auto min-w-[140px] max-w-[200px] border-violet-500/30 bg-transparent text-foreground text-sm px-2 py-0">
                      <SelectValue placeholder={tr(t.scripts.selectPlaceholder, language)} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TALKING HEAD">TALKING HEAD</SelectItem>
                      <SelectItem value="B-ROLL CAPTION">B-ROLL CAPTION</SelectItem>
                       <SelectItem value="ENTREVISTA">{tr(t.scripts.interview, language)}</SelectItem>
                       <SelectItem value="VARIADO">{tr(t.scripts.mixed, language)}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="p-4 rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/15 to-primary/5 mb-2">
              <div className="flex items-center gap-2 mb-2">
                <Eye className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-primary uppercase tracking-wider">{tr(t.scripts.inspiration, language)}</span>
              </div>
              {viewingInspirationUrl && !editingInspirationUrl ? (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={() => setShowInspirationVideo(true)}>
                    <Play className="w-3.5 h-3.5" /> {tr({ en: "Watch inspiration", es: "Ver inspiración" }, language)}
                  </Button>
                  <button onClick={() => window.open(viewingInspirationUrl, '_blank', 'noopener,noreferrer')} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
                    <ExternalLink className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => { setEditingInspirationUrl(true); setTempInspirationUrl(viewingInspirationUrl); }}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
                    title={tr({ en: "Edit inspiration URL", es: "Editar URL de inspiración" }, language)}
                  >
                    <Pencil className="w-3 h-3" />
                  </button>

                  <Dialog open={showInspirationVideo} onOpenChange={setShowInspirationVideo}>
                    <DialogContent className="max-w-3xl w-[95vw] p-0 overflow-hidden">
                      <DialogHeader className="p-4 pb-0">
                        <DialogTitle className="text-sm">{tr({ en: "Inspiration Video", es: "Video de Inspiración" }, language)}</DialogTitle>
                      </DialogHeader>
                      <div className="p-4 pt-2">
                        {(() => {
                          const url = viewingInspirationUrl;
                          const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]+)/);
                          if (ytMatch) {
                            return (
                              <div className="relative rounded-xl overflow-hidden" style={{ padding: '56.25% 0 0 0', position: 'relative' }}>
                                <iframe src={`https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} title="Inspiration video" />
                              </div>
                            );
                          }
                          const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
                          if (vimeoMatch) {
                            return (
                              <div className="relative rounded-xl overflow-hidden" style={{ padding: '56.25% 0 0 0', position: 'relative' }}>
                                <iframe src={`https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1`} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} title="Inspiration video" />
                              </div>
                            );
                          }
                          const tiktokMatch = url.match(/tiktok\.com\/@[^/]+\/video\/(\d+)/);
                          if (tiktokMatch) {
                            return (
                              <div className="flex justify-center">
                                <iframe src={`https://www.tiktok.com/embed/v2/${tiktokMatch[1]}`} allow="encrypted-media" allowFullScreen style={{ width: '325px', height: '578px', border: 'none' }} title="Inspiration video" />
                              </div>
                            );
                          }
                          const igMatch = url.match(/instagram\.com\/(?:reel|p)\/([\w-]+)/);
                          if (igMatch) {
                            return (
                              <div className="flex justify-center">
                                <iframe src={`https://www.instagram.com/p/${igMatch[1]}/embed`} allowFullScreen style={{ width: '400px', height: '500px', border: 'none' }} title="Inspiration video" />
                              </div>
                            );
                          }
                          return (
                            <div className="text-center py-8">
                              <p className="text-muted-foreground text-sm mb-3">{tr({ en: "This video can't be embedded. Open it externally:", es: "Este video no se puede embeber. Ábrelo externamente:" }, language)}</p>
                              <Button variant="outline" onClick={() => window.open(url, '_blank', 'noopener,noreferrer')} className="gap-2">
                                <ExternalLink className="w-4 h-4" /> {tr({ en: "Open video", es: "Abrir video" }, language)}
                              </Button>
                            </div>
                          );
                        })()}
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Input
                    value={editingInspirationUrl ? tempInspirationUrl : undefined}
                    onChange={editingInspirationUrl ? (e) => setTempInspirationUrl(e.target.value) : undefined}
                    placeholder={tr({ en: "Paste inspiration URL...", es: "Pega URL de inspiración..." }, language)}
                    className="text-sm h-8"
                    autoFocus={editingInspirationUrl}
                    onKeyDown={async (e) => {
                      if (e.key === "Enter" && viewingScriptId) {
                        const val = editingInspirationUrl ? tempInspirationUrl.trim() : (e.target as HTMLInputElement).value.trim();
                        if (val) {
                          await supabase.from("scripts").update({ inspiration_url: val }).eq("id", viewingScriptId);
                          setViewingInspirationUrl(val);
                        }
                        setEditingInspirationUrl(false);
                      }
                      if (e.key === "Escape") setEditingInspirationUrl(false);
                    }}
                    onBlur={async (e) => {
                      const val = editingInspirationUrl ? tempInspirationUrl.trim() : e.target.value.trim();
                      if (val && viewingScriptId) {
                        await supabase.from("scripts").update({ inspiration_url: val }).eq("id", viewingScriptId);
                        setViewingInspirationUrl(val);
                      }
                      setEditingInspirationUrl(false);
                    }}
                  />
                </div>
              )}
            </div>

            {/* Caption */}
            <div className="p-4 rounded-2xl border border-border/40 bg-gradient-to-br from-muted/20 to-muted/10 mb-2">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  {tr({ en: "Caption", es: "Caption" }, language)}
                </span>
              </div>
              <Textarea
                value={viewingCaption}
                onChange={(e) => setViewingCaption(e.target.value)}
                placeholder={tr({ en: "Write the social media caption for this video...", es: "Escribe el caption para las redes sociales..." }, language)}
                rows={4}
                className="text-sm resize-none bg-transparent"
                onBlur={async () => {
                  if (viewingScriptId) {
                    const { error } = await supabase.from("scripts").update({ caption: viewingCaption || null }).eq("id", viewingScriptId);
                    if (error) {
                      console.error("Caption save error:", error);
                      toast.error(tr({ en: "Failed to save caption", es: "Error al guardar caption" }, language));
                    } else {
                      // Sync caption to linked video_edits record
                      await supabase.from("video_edits").update({ caption: viewingCaption || null }).eq("script_id", viewingScriptId);
                    }
                  }
                }}
              />
            </div>

            <div className="flex items-center justify-end gap-2 mb-4 flex-wrap">
              <div className="flex gap-1.5 flex-wrap">
                {/* Save button — persists current line order & sections + caption to DB */}
                <Button
                  onClick={async () => {
                    if (!viewingScriptId || savingScript) return;
                    setSavingScript(true);
                    try {
                      await supabase.from("script_lines").delete().eq("script_id", viewingScriptId);
                      const rows = parsedLines.map((l, i) => ({
                        script_id: viewingScriptId,
                        line_number: i + 1,
                        line_type: l.line_type,
                        section: l.section,
                        text: l.text,
                        ...(l.rich_text !== undefined ? { rich_text: l.rich_text } : {}),
                      }));
                      if (rows.length > 0) {
                        await supabase.from("script_lines").insert(rows);
                      }
                      // Save caption alongside the script lines
                      await supabase.from("scripts").update({ caption: viewingCaption || null }).eq("id", viewingScriptId);
                      // Sync caption to linked video_edits record
                      await supabase.from("video_edits").update({ caption: viewingCaption || null }).eq("script_id", viewingScriptId);
                      const fresh = await getScriptLines(viewingScriptId);
                      setParsedLines(fresh);
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
            {/* Render ALL lines in a single flat DndContext for cross-section drag & drop */}
            <DndContext sensors={flatSensors} collisionDetection={closestCenter} onDragEnd={async (event: DragEndEvent) => {
              const { active, over } = event;
              if (!over || active.id === over.id || !viewingScriptId) return;

              const allItemIds = parsedLines.map((l) => `line-${l.line_number}`);
              const oldIndex = allItemIds.indexOf(active.id as string);
              const newIndex = allItemIds.indexOf(over.id as string);
              if (oldIndex === -1 || newIndex === -1) return;

              pushUndo();

              const reordered = arrayMove([...parsedLines], oldIndex, newIndex);

              // For the moved line: take the section of the line above it (or "hook" if first)
              const withSections = reordered.map((line, idx) => {
                if (idx !== newIndex) return line;
                const neighborSection = idx > 0 ? reordered[idx - 1].section : "hook";
                return { ...line, section: neighborSection };
              });

              setParsedLines(withSections);
              await reorderAllLines(viewingScriptId, withSections);
              const fresh = await getScriptLines(viewingScriptId);
              if (fresh.length > 0) setParsedLines(fresh);
            }}>
              <SortableContext items={parsedLines.map((l) => `line-${l.line_number}`)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {(["hook", "body", "cta"] as const).map((section) => {
                    const sectionLabels: Record<string, string> = { hook: "Hook", body: "Body", cta: "CTA" };
                    const sectionLines = parsedLines.filter((l) => l.section === section);
                    const handleAddPlaceholder = async () => {
                      if (!viewingScriptId) return;
                      await addScriptLine(viewingScriptId, section, "filming", "");
                      const fresh = await getScriptLines(viewingScriptId);
                      setParsedLines(fresh);
                    };
                    return (
                      <div key={section}>
                        <div className="flex items-center gap-2 mt-4 mb-2">
                          <span className="text-sm font-bold text-foreground uppercase tracking-wider">{sectionLabels[section]}</span>
                          <button
                            onClick={handleAddPlaceholder}
                            className="w-5 h-5 rounded-full border border-dashed border-muted-foreground/50 hover:border-primary/70 flex items-center justify-center transition-smooth"
                            title={`Agregar línea a ${sectionLabels[section]}`}
                          >
                            <Plus className="w-3 h-3 text-muted-foreground hover:text-primary" />
                          </button>
                          <div className="flex-1 h-px bg-border" />
                        </div>
                        {sectionLines.length === 0 ? (
                          <div
                            className="flex items-start gap-2 sm:gap-3 p-3 sm:p-4 rounded-2xl border bg-gradient-to-br from-muted/30 to-muted/10 border-muted-foreground/20 transition-smooth cursor-pointer group"
                            onClick={handleAddPlaceholder}
                          >
                            <div className="mt-0.5 p-1.5 rounded-xl bg-muted/30">
                              <Plus className="w-4 h-4 text-muted-foreground" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nueva línea</span>
                              <p className="text-muted-foreground/60 mt-1 text-sm italic">Haz clic para agregar una línea...</p>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {sectionLines.map((line) => {
                              const lineKey = `line-${line.line_number}`;
                              const globalIndex = parsedLines.indexOf(line);
                              return (
                                <SortableLineItem
                                  key={lineKey}
                                  line={line}
                                  lineKey={lineKey}
                                  globalIndex={globalIndex}
                                  isEditingThis={editingLineKey === lineKey}
                                  editLineText={editLineText}
                                  setEditLineText={setEditLineText}
                                  setEditingLineKey={setEditingLineKey}
                                  viewingScriptId={viewingScriptId}
                                  updateScriptLineType={updateScriptLineType}
                                  updateScriptLine={updateScriptLine}
                                  deleteScriptLine={deleteScriptLine}
                                  getScriptLines={getScriptLines}
                                  setParsedLines={setParsedLines}
                                  pushUndo={pushUndo}
                                />
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>

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

              const createVideoEdit = async (_subfolder: 'footage' | 'submission') => {
                if (!selectedClient || !viewingScriptId) return;
                const footageLink = viewingMetadata?.google_drive_link || null;
                // Check for existing record to avoid duplicates
                const { data: existing } = await supabase.from("video_edits").select("id").eq("script_id", viewingScriptId).is("deleted_at", null).maybeSingle();
                let data: any;
                if (existing) {
                  const { data: updated, error } = await supabase.from("video_edits").update({
                    reel_title: viewingMetadata?.idea_ganadora || "Untitled",
                    script_url: `${window.location.origin}/s/${viewingScriptId}`,
                    footage: footageLink,
                    upload_source: footageLink ? 'gdrive' : null,
                  }).eq("id", existing.id).select("id, client_id, footage, file_submission, upload_source, storage_path, storage_url, file_size_bytes").single();
                  if (error) { toast.error("Failed to update video edit record"); return; }
                  data = updated;
                } else {
                  const { data: inserted, error } = await supabase.from("video_edits").upsert({
                    client_id: selectedClient.id,
                    script_id: viewingScriptId,
                    reel_title: viewingMetadata?.idea_ganadora || "Untitled",
                    status: "Not started",
                    script_url: `${window.location.origin}/s/${viewingScriptId}`,
                    file_url: footageLink || "",
                    footage: footageLink,
                    upload_source: footageLink ? 'gdrive' : null,
                    post_status: "Unpublished",
                  }, { onConflict: "script_id", ignoreDuplicates: true }).select("id, client_id, footage, file_submission, upload_source, storage_path, storage_url, file_size_bytes").single();
                  if (error) { toast.error("Failed to create video edit record"); return; }
                  data = inserted;
                }
                setLinkedVideoEdit({ id: data.id, client_id: data.client_id, footage: data.footage, file_submission: data.file_submission, upload_source: data.upload_source, storage_path: data.storage_path, storage_url: data.storage_url, file_size_bytes: data.file_size_bytes });
              };

              const FootageCard = ({ url, isVideo, fileName, fileSize, accentColor, onView, onRemove }: { url: string; isVideo: boolean; fileName: string; fileSize: string; accentColor: string; onView: () => void; onRemove: () => void }) => (
                <div
                  className="flex items-center gap-3 rounded-xl border border-border bg-card/60 px-3 py-2.5 cursor-pointer hover:border-border/80 transition-colors group"
                  onClick={() => { if (!isVideo && url.startsWith('http')) { window.open(url, '_blank', 'noopener,noreferrer'); } else { onView(); } }}
                >
                  <div className="w-16 h-11 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden relative">
                    {isVideo ? (
                      <>
                        <video src={url} muted preload="metadata" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                          <Play className="w-4 h-4 text-white drop-shadow" />
                        </div>
                      </>
                    ) : (
                      <Link2 className="w-4 h-4 text-blue-400/70" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{fileName}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${isVideo ? 'bg-green-500/15 text-green-400' : 'bg-cyan-500/15 text-cyan-400'}`}>
                        {isVideo ? 'Video' : 'Link'}
                      </span>
                      {fileSize && <span className="text-[10px] text-muted-foreground">{fileSize}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!isVideo && (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-7 h-7 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted"
                        onClick={e => e.stopPropagation()}
                        title="Open link"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <button
                      className="w-7 h-7 rounded-lg border border-destructive/30 flex items-center justify-center text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                      onClick={e => { e.stopPropagation(); onRemove(); }}
                      title="Remove"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );

              return (<>
              <div className="mt-6 pt-4 border-t border-border p-4 rounded-2xl bg-gradient-to-br from-card to-muted/20">
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
                        url={f.signedUrl}
                        isVideo={true}
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
                      isVideo={false}
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
                  <FootageUploadDialog
                    videoEditId={linkedVideoEdit.id}
                    clientId={linkedVideoEdit.client_id}
                    onComplete={async () => { if (viewingScriptId) await refreshLinkedVideoEdit(viewingScriptId); }}
                    onDriveLinkSaved={async (url) => { if (viewingScriptId) { await updateGoogleDriveLink(viewingScriptId, url); await refreshLinkedVideoEdit(viewingScriptId); setViewingMetadata(prev => prev ? { ...prev, google_drive_link: url } : prev); } }}
                    currentFootageUrl={linkedVideoEdit.footage}
                  />
                ) : selectedClient && viewingScriptId && (
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => createVideoEdit('footage')}>
                    <Plus className="h-3 w-3" />{language === "en" ? "Add Footage" : "Agregar Footage"}
                  </Button>
                )}
              </div>

              {/* File Submission */}
              <div className="mt-4 pt-4 border-t border-border p-4 rounded-2xl bg-gradient-to-br from-card to-muted/20">
                <div className="flex items-center gap-2 mb-3">
                  <Link2 className="w-4 h-4 text-[#22d3ee]" />
                  <span className="text-sm font-semibold text-[#22d3ee]">File Submission:</span>
                </div>
                {/* Supabase submission files — one card each */}
                {submissionStorageFiles.length > 0 && (
                  <div className="flex flex-col gap-1.5 mb-2">
                    {submissionStorageFiles.map(f => (
                      <FootageCard
                        key={f.path}
                        url={f.signedUrl}
                        isVideo={true}
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
                            await supabase.from("video_edits").update({ file_submission: null }).eq("id", linkedVideoEdit.id);
                            setFileSubmission(null);
                            setLinkedVideoEdit(prev => prev ? { ...prev, file_submission: null } : prev);
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
                      isVideo={false}
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
                  <FootageUploadDialog
                    videoEditId={linkedVideoEdit.id}
                    clientId={linkedVideoEdit.client_id}
                    onComplete={async () => { if (viewingScriptId) await refreshLinkedVideoEdit(viewingScriptId); }}
                    currentFileSubmissionUrl={linkedVideoEdit.file_submission}
                    subfolder="submission"
                  />
                ) : selectedClient && viewingScriptId && (
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => createVideoEdit('submission')}>
                    <Plus className="h-3 w-3" />{language === "en" ? "Add File" : "Agregar Archivo"}
                  </Button>
                )}
              </div>

              {/* Footage viewer modal */}
              {linkedVideoEdit && (
                <FootageViewerModal
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
            </>
            )}

            {/* Doc Editor */}
            {scriptEditorTab === "doc" && (
              <ScriptDocEditor
                lines={parsedLines}
                onLinesChange={setParsedLines}
                scriptTitle={viewingMetadata?.idea_ganadora ?? ""}
                scriptMeta={
                  [viewingMetadata?.target, viewingMetadata?.formato]
                    .filter(Boolean)
                    .join(" · ")
                }
                onSave={async () => {
                  const sid = viewingScriptId;
                  if (!sid || savingDocEditor) return;
                  setSavingDocEditor(true);
                  try {
                    await supabase.from("script_lines").delete().eq("script_id", sid);
                    const rows = parsedLines.map((l, i) => ({
                      script_id: sid,
                      line_number: i + 1,
                      line_type: l.line_type,
                      section: l.section,
                      text: l.text,
                      ...(l.rich_text !== undefined ? { rich_text: l.rich_text } : {}),
                    }));
                    if (rows.length > 0) await supabase.from("script_lines").insert(rows);
                    const fresh = await getScriptLines(sid);
                    setParsedLines(fresh);
                    toast.success(tr({ en: "Script saved!", es: "¡Script guardado!" }, language));
                  } catch {
                    toast.error(tr({ en: "Error saving script", es: "Error al guardar" }, language));
                  } finally {
                    setSavingDocEditor(false);
                  }
                }}
                onExportPDF={() => window.print()}
                saving={savingDocEditor}
              />
            )}
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
        <DialogContent className="sm:max-w-sm bg-gradient-to-br from-card via-card to-muted/30 rounded-2xl">
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
        <DialogContent className="sm:max-w-sm bg-gradient-to-br from-card via-card to-muted/30 rounded-2xl" onPointerDownOutside={(e) => e.preventDefault()}>
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
              <CheckCircle2 className="w-4 h-4 text-primary" />
              Review Script
            </DialogTitle>
            <DialogDescription className="truncate text-sm text-muted-foreground">
              {reviewingScript?.idea_ganadora || reviewingScript?.title}
            </DialogDescription>
          </DialogHeader>

          {/* Revision notes input — shown when needs revision is clicked or already set */}
          {showRevisionInput && (
            <div className="space-y-2">
              <Textarea
                placeholder="Describe the revisions needed (e.g. change the hook, shorten the CTA...)"
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
                    toast.warning("Script marked as needs revision");
                  } catch (e) {
                    toast.error("Failed to update status");
                  }
                }}
              >
                <AlertTriangle className="w-4 h-4" /> Save Revision Notes
              </Button>
              <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground" onClick={() => setShowRevisionInput(false)}>
                Cancel
              </Button>
            </div>
          )}

          {!showRevisionInput && (
            <>
              {/* Show existing revision notes if any */}
              {reviewingScript?.revision_notes && reviewingScript.review_status === 'needs_revision' && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                  <p className="font-medium text-xs text-red-400 mb-1">Revision notes:</p>
                  <p className="whitespace-pre-wrap">{reviewingScript.revision_notes}</p>
                </div>
              )}
              <div className="flex gap-3 py-2">
                <Button
                  className="flex-1 bg-green-600 hover:bg-green-500 text-white gap-2"
                  onClick={async () => {
                    try {
                      await updateReviewStatus(reviewingScript!.id, 'approved');
                      setReviewingScript(null);
                      if (selectedClient) fetchScriptsByClient(selectedClient.id);
                      toast.success("Script approved");
                    } catch (e) {
                      toast.error("Failed to update status");
                    }
                  }}
                >
                  <CheckCircle2 className="w-4 h-4" /> Approve
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 border-red-500/50 text-red-400 hover:bg-red-500/10 gap-2"
                  onClick={() => {
                    setRevisionNotes(reviewingScript?.revision_notes || "");
                    setShowRevisionInput(true);
                  }}
                >
                  <AlertTriangle className="w-4 h-4" /> Needs Revision
                </Button>
              </div>
              {reviewingScript?.review_status && (
                <Button
                  variant="ghost" size="sm"
                  className="w-full text-muted-foreground text-xs"
                  onClick={async () => {
                    try {
                      await updateReviewStatus(reviewingScript!.id, null);
                      setReviewingScript(null);
                      if (selectedClient) fetchScriptsByClient(selectedClient.id);
                      toast.info("Review status cleared");
                    } catch (e) {
                      toast.error("Failed to clear status");
                    }
                  }}
                >
                  Clear review status
                </Button>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="sm:max-w-md bg-gradient-to-br from-card via-card to-muted/30 rounded-2xl">
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
          clientName={selectedClient.name || "Client"}
          onClose={() => setShowBatchModal(false)}
          onSaved={() => {
            setShowBatchModal(false);
            fetchScriptsByClient(selectedClient.id);
          }}
        />
      )}

      </>
      )}
      </PageTransition>
  );
}
