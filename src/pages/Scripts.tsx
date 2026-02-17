import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Film, Mic, Scissors, Sparkles, ArrowLeft, Plus, User, FileText,
  Loader2, ChevronLeft, ExternalLink, Eye, Trash2, Pencil, LogOut, MonitorPlay, Link2, Save, CheckCircle2, Circle, MicIcon, MicOff,
  Camera, Settings, Video, GripVertical, RotateCcw, Archive, Wand2,
} from "lucide-react";
import Teleprompter from "@/components/Teleprompter";
import AIScriptWizard from "@/components/AIScriptWizard";
import VideoRecorder from "@/components/VideoRecorder";
import ThemeToggle from "@/components/ThemeToggle";
import LanguageToggle from "@/components/LanguageToggle";
import { useTheme } from "@/hooks/useTheme";
import { useLanguage } from "@/hooks/useLanguage";
import { t, tr } from "@/i18n/translations";
import { Link, useParams } from "react-router-dom";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";

import { useClients, type Client } from "@/hooks/useClients";
import { useScripts, type ScriptLine, type Script, type ScriptMetadata } from "@/hooks/useScripts";
import { useAuth } from "@/hooks/useAuth";
import ScriptsLogin from "@/components/ScriptsLogin";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
    color: "text-red-400",
    bg: "bg-gradient-to-br from-red-500/25 to-red-900/10",
    border: "border-red-500/40",
    dot: "bg-red-500",
  },
  actor: {
    label: tr(t.scripts.voiceoverDialogue, lang),
    icon: Mic,
    color: "text-purple-400",
    bg: "bg-gradient-to-br from-purple-500/25 to-purple-900/10",
    border: "border-purple-500/40",
    dot: "bg-purple-500",
  },
  editor: {
    label: tr(t.scripts.editingInstructions, lang),
    icon: Scissors,
    color: "text-emerald-400",
    bg: "bg-gradient-to-br from-emerald-500/25 to-emerald-900/10",
    border: "border-emerald-500/40",
    dot: "bg-emerald-500",
  },
});

type View = "clients" | "client-detail" | "new-script" | "view-script" | "edit-script";

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
  setParsedLines,
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
  setParsedLines: React.Dispatch<React.SetStateAction<ScriptLine[]>>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: lineKey });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
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
          const types: ("filming" | "actor" | "editor")[] = ["filming", "actor", "editor"];
          let nextType: "filming" | "actor" | "editor";
          if (isPlaceholder) {
            nextType = "filming";
          } else {
            const currentIdx = types.indexOf(line.line_type);
            nextType = types[(currentIdx + 1) % types.length];
          }
          const ok = await updateScriptLineType(viewingScriptId, globalIndex + 1, nextType);
          if (ok) {
            setParsedLines((prev) => prev.map((l, idx) => idx === globalIndex ? { ...l, line_type: nextType } : l));
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
                if (viewingScriptId && editLineText.trim()) {
                  const ok = await updateScriptLine(viewingScriptId, globalIndex + 1, editLineText.trim());
                  if (ok) {
                    setParsedLines((prev) => prev.map((l, idx) => idx === globalIndex ? { ...l, text: editLineText.trim() } : l));
                  }
                }
                setEditingLineKey(null);
              }
              if (e.key === "Escape") setEditingLineKey(null);
            }}
            onBlur={async () => {
              if (viewingScriptId && editLineText.trim()) {
                const ok = await updateScriptLine(viewingScriptId, globalIndex + 1, editLineText.trim());
                if (ok) {
                  setParsedLines((prev) => prev.map((l, idx) => idx === globalIndex ? { ...l, text: editLineText.trim() } : l));
                }
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
            const ok = await deleteScriptLine(viewingScriptId, globalIndex + 1);
            if (ok) {
              setParsedLines((prev) => prev.filter((_, idx) => idx !== globalIndex));
            }
          }}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      )}
    </div>
  );
}

// Wrapper that provides DnD context for a section
function SortableSection({
  sectionLines,
  section,
  parsedLines,
  editingLineKey,
  editLineText,
  setEditLineText,
  setEditingLineKey,
  viewingScriptId,
  updateScriptLineType,
  updateScriptLine,
  deleteScriptLine,
  setParsedLines,
  getScriptLines,
  moveScriptLine,
}: {
  sectionLines: ScriptLine[];
  section: string;
  parsedLines: ScriptLine[];
  editingLineKey: string | null;
  editLineText: string;
  setEditLineText: (v: string) => void;
  setEditingLineKey: (v: string | null) => void;
  viewingScriptId: string | null;
  updateScriptLineType: (scriptId: string, lineNumber: number, newType: string) => Promise<boolean>;
  updateScriptLine: (scriptId: string, lineNumber: number, text: string) => Promise<boolean>;
  deleteScriptLine: (scriptId: string, lineNumber: number) => Promise<boolean>;
  setParsedLines: React.Dispatch<React.SetStateAction<ScriptLine[]>>;
  getScriptLines: (scriptId: string) => Promise<ScriptLine[]>;
  moveScriptLine: (scriptId: string, lineNumber: number, direction: "up" | "down") => Promise<boolean>;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const itemIds = sectionLines.map((_, i) => `${section}-${i}`);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !viewingScriptId) return;

    const oldIndex = itemIds.indexOf(active.id as string);
    const newIndex = itemIds.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;

    // Determine direction and how many moves
    const direction = newIndex > oldIndex ? "down" : "up";
    const steps = Math.abs(newIndex - oldIndex);

    // Get global index for the line being moved
    const globalIndex = parsedLines.indexOf(sectionLines[oldIndex]);

    // Perform sequential swaps
    let currentLineNumber = globalIndex + 1;
    for (let s = 0; s < steps; s++) {
      const ok = await moveScriptLine(viewingScriptId, currentLineNumber, direction);
      if (!ok) break;
      currentLineNumber = direction === "down" ? currentLineNumber + 1 : currentLineNumber - 1;
    }

    // Refresh from DB
    const lines = await getScriptLines(viewingScriptId);
    setParsedLines(lines);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-3">
          {sectionLines.map((line, i) => {
            const globalIndex = parsedLines.indexOf(line);
            const lineKey = `${section}-${i}`;
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
                setParsedLines={setParsedLines}
              />
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}

export default function Scripts() {
  const { clientId: urlClientId } = useParams<{ clientId?: string }>();
  const { checking: subscriptionChecking } = useSubscriptionGuard();
  const { theme } = useTheme();
  const { language } = useLanguage();
  const { user, role, loading: authLoading, signOut, signInWithEmail, signUpWithEmail, isAdmin, isVideographer, isPasswordRecovery, clearPasswordRecovery } = useAuth();
  const { clients, loading: clientsLoading, addClient, updateClient } = useClients(!!user);
  const {
    scripts, trashedScripts, loading: scriptsLoading, fetchScriptsByClient, fetchTrashedScripts,
    categorizeAndSave, getScriptLines, deleteScript, restoreScript, permanentlyDeleteScript,
    updateScript, updateGoogleDriveLink, toggleGrabado,
    updateScriptLine, deleteScriptLine, updateScriptLineType, addScriptLine, moveScriptLine,
    bulkSyncToNotion,
  } = useScripts();

  const [showTrash, setShowTrash] = useState(false);

  // Inline editing script lines
  const [editingLineKey, setEditingLineKey] = useState<string | null>(null);
  const [editLineText, setEditLineText] = useState("");

  const [grabadoFilter, setGrabadoFilter] = useState<"all" | "grabado" | "no-grabado">("all");

  // Videographer assignment state (admin only)
  const [videographers, setVideographers] = useState<{ user_id: string; display_name: string; username: string | null }[]>([]);
  const [assignmentsMap, setAssignmentsMap] = useState<Record<string, string[]>>({}); // client_id -> videographer_user_ids
  const [assignOverlayClient, setAssignOverlayClient] = useState<string | null>(null); // client id with open overlay
  const [view, setView] = useState<View>("clients");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [parsedLines, setParsedLines] = useState<ScriptLine[]>([]);

  // New client form
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [showNewClient, setShowNewClient] = useState(false);

  // Script form
  const [scriptTitle, setScriptTitle] = useState("");
  const [scriptInput, setScriptInput] = useState("");
  const [inspirationUrl, setInspirationUrl] = useState("");
  const [formato, setFormato] = useState("");
  const [googleDriveLink, setGoogleDriveLink] = useState("");
  const [viewingInspirationUrl, setViewingInspirationUrl] = useState<string | null>(null);
  const [viewingMetadata, setViewingMetadata] = useState<ScriptMetadata | null>(null);
  const [viewingScriptId, setViewingScriptId] = useState<string | null>(null);
  const [editingDriveLink, setEditingDriveLink] = useState(false);
  const [tempDriveLink, setTempDriveLink] = useState("");

  // Edit mode
  const [editingScript, setEditingScript] = useState<Script | null>(null);
  const [showTeleprompter, setShowTeleprompter] = useState(false);
  const [showRecorder, setShowRecorder] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [aiMode, setAiMode] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

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

  // Inline editing client name/email
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<"name" | "email" | null>(null);
  const [editValue, setEditValue] = useState("");

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
      const { data } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", user.id)
        .maybeSingle();
      const name = data?.display_name;
      const email = user.email || "";
      // If no name, or name equals the email, prompt
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
      // Update client record name
      await supabase
        .from("clients")
        .update({ name: promptName.trim() })
        .eq("user_id", user.id);
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

  // Auto-select client from URL param (admin/videographer deep link)

  useEffect(() => {
    if (clientsLoading || clients.length === 0 || selectedClient) return;

    // If URL has a clientId param, auto-select that client
    if (urlClientId) {
      const target = clients.find((c) => c.id === urlClientId);
      if (target) {
        setSelectedClient(target);
        fetchScriptsByClient(target.id);
        setView("client-detail");
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

  // Auth loading
  if (authLoading || subscriptionChecking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" style={{ fontFamily: "Arial, sans-serif" }}>
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Not logged in
  if (!user) {
    return (
      <ScriptsLogin
        onSignIn={() => {}}
        signInWithEmail={signInWithEmail}
        signUpWithEmail={signUpWithEmail}
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
    const result = await categorizeAndSave(
      selectedClient.id,
      scriptTitle.trim() || "Sin título",
      scriptInput.trim(),
      inspirationUrl.trim() || undefined,
      formato || undefined,
      googleDriveLink.trim() || undefined
    );
    if (result) {
      setParsedLines(result.lines);
      setViewingInspirationUrl(inspirationUrl.trim() || null);
      setViewingMetadata(result.metadata);
      setViewingScriptId(result.scriptId);
      setView("view-script");
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
      setParsedLines(result.lines);
      setViewingInspirationUrl(inspirationUrl.trim() || null);
      setViewingMetadata(result.metadata);
      setViewingScriptId(editingScript.id);
      setEditingScript(null);
      setView("view-script");
    }
  };

  const handleViewScript = async (script: Script) => {
    const lines = await getScriptLines(script.id);
    setParsedLines(lines);
    setViewingInspirationUrl(script.inspiration_url);
    setViewingMetadata({
      idea_ganadora: script.idea_ganadora,
      target: script.target,
      formato: script.formato,
      google_drive_link: script.google_drive_link,
    });
    setViewingScriptId(script.id);
    setView("view-script");
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
      setViewingScriptId(null);
      setEditingScript(null);
      setEditingDriveLink(false);
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
    <div className="min-h-screen bg-gradient-to-br from-background via-card/50 to-background" style={{ fontFamily: "Arial, sans-serif" }}>
      {/* Header */}
      <header className="border-b border-border/50 sticky top-0 z-50 bg-gradient-to-r from-background/90 to-card/90 backdrop-blur-xl">
        <div className="container mx-auto px-3 sm:px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <Link to="/dashboard" className="flex items-center gap-1 sm:gap-2 text-muted-foreground hover:text-foreground transition-smooth text-sm flex-shrink-0">
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">{tr(t.scripts.home, language)}</span>
            </Link>
            
          </div>
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <span className="text-xs text-muted-foreground hidden sm:inline truncate max-w-[200px]">
              {user.email} {isAdmin && <span className="text-primary font-bold">(Admin)</span>}
              {isVideographer && <span className="text-emerald-400 font-bold">(Videographer)</span>}
            </span>
            <LanguageToggle />
            <ThemeToggle />
            <Link to="/settings">
              <Button variant="ghost" size="sm" className="flex-shrink-0">
                <Settings className="w-3.5 h-3.5" />
              </Button>
            </Link>
            <Button variant="ghost" size="sm" onClick={signOut} className="gap-1 flex-shrink-0">
              <LogOut className="w-3.5 h-3.5" /> <span className="hidden sm:inline">{tr(t.scripts.exit, language)}</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 py-6 sm:py-8 max-w-5xl">
        {/* Breadcrumb */}
        {view !== "clients" && (
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

            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
              <Button onClick={() => { setScriptTitle(""); setScriptInput(""); setInspirationUrl(""); setFormato(""); setGoogleDriveLink(""); setView("new-script"); }} variant="cta" className="gap-2 w-full sm:w-auto">
                <Plus className="w-4 h-4" /> {tr(t.scripts.newScript, language)}
              </Button>
              <div className="flex gap-1 bg-gradient-to-r from-card via-card to-muted/30 border border-border rounded-2xl p-1">
                {[
                   { key: "all" as const, label: tr(t.scripts.all, language) },
                   { key: "no-grabado" as const, label: tr(t.scripts.notRecorded, language) },
                   { key: "grabado" as const, label: tr(t.scripts.recorded, language) },
                ].map((f) => (
                  <button
                    key={f.key}
                    onClick={() => { setGrabadoFilter(f.key); setShowTrash(false); }}
                    className={`px-3 py-1.5 text-xs sm:text-sm rounded-xl transition-smooth font-medium ${
                      !showTrash && grabadoFilter === f.key
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleToggleTrash}
                className={`gap-1.5 ${showTrash ? "text-destructive" : "text-muted-foreground"}`}
              >
                 <Trash2 className="w-4 h-4" /> {tr(t.scripts.trash, language)}
              </Button>
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={bulkSyncToNotion}
                  className="gap-1.5 text-muted-foreground ml-auto"
                  title="Sincronizar todos los scripts con Notion"
                >
                  <RotateCcw className="w-4 h-4" /> Sync Notion
                </Button>
              )}
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
                      const daysLeft = Math.max(0, 30 - Math.floor((Date.now() - deletedDate.getTime()) / (1000 * 60 * 60 * 24)));
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
              const filtered = scripts.filter((s) => {
                if (grabadoFilter === "grabado") return s.grabado;
                if (grabadoFilter === "no-grabado") return !s.grabado;
                return true;
              });
              return filtered.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  {scripts.length === 0 ? tr(t.scripts.noScripts, language) : tr(t.scripts.noScriptsCategory, language)}
                </p>
              ) : (
                <div className="grid gap-3">
                  {filtered.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 sm:gap-4 p-3 sm:p-4 bg-gradient-to-br from-card via-card to-muted/30 border border-border rounded-2xl hover:border-primary/50 hover:to-primary/10 transition-smooth overflow-hidden">
                      <button
                        onClick={async () => {
                          await toggleGrabado(s.id, !s.grabado);
                        }}
                        className="flex-shrink-0"
                        title={s.grabado ? "Marcar como no grabado" : "Marcar como grabado"}
                      >
                        {s.grabado ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                        ) : (
                          <Circle className="w-5 h-5 text-muted-foreground hover:text-foreground" />
                        )}
                      </button>
                      <button onClick={() => handleViewScript(s)} className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0 text-left overflow-hidden">
                        <FileText className="w-5 h-5 text-muted-foreground flex-shrink-0 hidden sm:block" />
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <p className={`font-semibold truncate max-w-full ${s.grabado ? "text-muted-foreground line-through" : "text-foreground"}`}>{s.title}</p>
                          <p className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleDateString("es-MX")}</p>
                        </div>
                      </button>
                      <div className="flex gap-0.5 sm:gap-1 flex-shrink-0">
                        <Button variant="ghost" size="sm" onClick={() => handleEditScript(s)} title="Editar" className="h-8 w-8 p-0">
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteScript(s.id)} title="Mover a papelera" className="text-destructive hover:text-destructive h-8 w-8 p-0">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()
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
              <div className="flex gap-2 mb-6">
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
              </div>
            )}

            {/* AI Wizard Mode */}
            {view === "new-script" && aiMode && selectedClient ? (
              <AIScriptWizard
                selectedClient={selectedClient}
                onComplete={async (rawContent, title) => {
                  setScriptInput(rawContent);
                  setScriptTitle(title);
                  // Use categorizeAndSave to properly categorize the AI-generated script
                  const result = await categorizeAndSave(
                    selectedClient.id,
                    title,
                    rawContent,
                    undefined,
                    undefined,
                    undefined
                  );
                  if (result) {
                    setParsedLines(result.lines);
                    setViewingMetadata(result.metadata);
                    setViewingScriptId(result.scriptId);
                    setView("view-script");
                  }
                }}
                onCancel={() => setAiMode(false)}
              />
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
                  onClick={view === "edit-script" ? handleUpdate : handleCategorize}
                  variant="cta"
                  size="lg"
                  className="gap-2 w-full sm:w-auto"
                  disabled={scriptsLoading || !scriptInput.trim()}
                >
                  {scriptsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {scriptsLoading ? tr(t.scripts.analyzing, language) : view === "edit-script" ? tr(t.scripts.updateRecategorize, language) : tr(t.scripts.analyzeAndSave, language)}
                </Button>
              </>
            )}
          </>
        )}

        {/* ===== VIEW SCRIPT RESULT ===== */}
        {view === "view-script" && parsedLines.length > 0 && (
          <div className="space-y-3 animate-fade-in">
            {/* Metadata inline */}
            {viewingMetadata && (viewingMetadata.idea_ganadora || viewingMetadata.target || viewingMetadata.formato) && (
              <div className="mb-4 space-y-1 p-4 rounded-2xl bg-gradient-to-br from-card via-card to-muted/30 border border-border">
                {viewingMetadata.idea_ganadora && (
                  <p className="text-sm text-foreground">
                    <span className="font-semibold text-amber-400">Idea Ganadora:</span>{" "}
                    {viewingMetadata.idea_ganadora}
                  </p>
                )}
                {viewingMetadata.target && (
                  <p className="text-sm text-foreground">
                    <span className="font-semibold text-red-400">Target:</span>{" "}
                    {viewingMetadata.target}
                  </p>
                )}
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <span className="font-semibold text-violet-400">Formato:</span>
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
              {viewingInspirationUrl ? (
                <button onClick={() => window.open(viewingInspirationUrl, '_blank', 'noopener,noreferrer')} className="inline-flex items-center gap-2 text-sm text-primary hover:underline break-all text-left">
                  <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
                  {viewingInspirationUrl}
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <Input
                    placeholder={tr({ en: "Paste inspiration URL...", es: "Pega URL de inspiración..." }, language)}
                    className="text-sm h-8"
                    onKeyDown={async (e) => {
                      if (e.key === "Enter" && viewingScriptId) {
                        const val = (e.target as HTMLInputElement).value.trim();
                        if (val) {
                          await supabase.from("scripts").update({ inspiration_url: val }).eq("id", viewingScriptId);
                          setViewingInspirationUrl(val);
                        }
                      }
                    }}
                    onBlur={async (e) => {
                      const val = e.target.value.trim();
                      if (val && viewingScriptId) {
                        await supabase.from("scripts").update({ inspiration_url: val }).eq("id", viewingScriptId);
                        setViewingInspirationUrl(val);
                      }
                    }}
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 mb-4">
              <h2 className="text-base sm:text-xl font-bold text-foreground truncate">{tr(t.scripts.result, language)} — {parsedLines.length} {tr(t.scripts.lines, language)}</h2>
              <div className="flex gap-1.5 flex-shrink-0">
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
            {/* Render lines grouped by section */}
            {(["hook", "body", "cta"] as const).map((section) => {
              const sectionLines = parsedLines.filter((l) => l.section === section);
              const sectionLabels = { hook: "Hook", body: "Body", cta: "CTA" };

              const handleAddPlaceholder = async () => {
                if (!viewingScriptId) return;
                const lineNumber = await addScriptLine(viewingScriptId, section, "filming", "");
                if (lineNumber) {
                  // Insert at correct position: after last line of this section
                  const newLine: ScriptLine = { line_type: "filming" as any, text: "", section };
                  setParsedLines((prev) => {
                    const sectionOrder = { hook: 0, body: 1, cta: 2 } as Record<string, number>;
                    const targetOrder = sectionOrder[section] ?? 1;
                    // Find the index after the last line of this section
                    let insertIdx = 0;
                    for (let j = 0; j < prev.length; j++) {
                      if ((sectionOrder[prev[j].section] ?? 1) <= targetOrder) {
                        insertIdx = j + 1;
                      }
                    }
                    return [...prev.slice(0, insertIdx), newLine, ...prev.slice(insertIdx)];
                  });
                }
              };

              return (
                <div key={section} className="space-y-3">
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
                    /* Auto-placeholder when section is empty */
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
                    <SortableSection
                      sectionLines={sectionLines}
                      section={section}
                      parsedLines={parsedLines}
                      editingLineKey={editingLineKey}
                      editLineText={editLineText}
                      setEditLineText={setEditLineText}
                      setEditingLineKey={setEditingLineKey}
                      viewingScriptId={viewingScriptId}
                      updateScriptLineType={updateScriptLineType}
                      updateScriptLine={updateScriptLine}
                      deleteScriptLine={deleteScriptLine}
                      setParsedLines={setParsedLines}
                      getScriptLines={getScriptLines}
                      moveScriptLine={moveScriptLine}
                    />
                  )}
                </div>
              );
            })}

            {/* Google Drive link at the end */}
            {viewingMetadata && (
              <div className="mt-6 pt-4 border-t border-border p-4 rounded-2xl bg-gradient-to-br from-card to-muted/20">
                <div className="flex items-center gap-2 mb-2">
                  <Link2 className="w-4 h-4 text-green-400" />
                  <span className="text-sm font-semibold text-green-400">Google Drive:</span>
                </div>
                {editingDriveLink ? (
                  <div className="flex gap-2">
                    <Input
                      value={tempDriveLink}
                      onChange={(e) => setTempDriveLink(e.target.value)}
                      placeholder={tr(t.scripts.pasteDriveLink, language)}
                      className="text-sm h-8 flex-1 min-w-0"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && viewingScriptId) {
                          updateGoogleDriveLink(viewingScriptId, tempDriveLink);
                          setViewingMetadata((prev) => prev ? { ...prev, google_drive_link: tempDriveLink || null } : prev);
                          setEditingDriveLink(false);
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-shrink-0"
                      onClick={async () => {
                        if (viewingScriptId) {
                          await updateGoogleDriveLink(viewingScriptId, tempDriveLink);
                          setViewingMetadata((prev) => prev ? { ...prev, google_drive_link: tempDriveLink || null } : prev);
                          setEditingDriveLink(false);
                        }
                      }}
                    >
                      <Save className="w-3 h-3" />
                    </Button>
                  </div>
                ) : viewingMetadata.google_drive_link ? (
                  <div className="flex items-center gap-2 min-w-0">
                    <button
                      onClick={() => window.open(viewingMetadata.google_drive_link!, '_blank', 'noopener,noreferrer')}
                      className="text-sm text-green-400 hover:underline break-all text-left min-w-0"
                    >
                      {viewingMetadata.google_drive_link}
                    </button>
                    <Button size="sm" variant="ghost" className="flex-shrink-0" onClick={() => { setTempDriveLink(viewingMetadata.google_drive_link || ""); setEditingDriveLink(true); }}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                  </div>
                ) : (
                   <button onClick={() => { setTempDriveLink(""); setEditingDriveLink(true); }} className="text-sm text-muted-foreground hover:text-foreground">{tr(t.scripts.addLink, language)}</button>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {showTeleprompter && (
        <Teleprompter lines={parsedLines} onClose={() => setShowTeleprompter(false)} showRecorder={showRecorder} onToggleRecorder={() => setShowRecorder((p) => !p)} scriptTitle={viewingMetadata?.idea_ganadora || scriptTitle || undefined} />
      )}

      {showRecorder && !showTeleprompter && (
        <VideoRecorder pip scriptTitle={viewingMetadata?.idea_ganadora || scriptTitle || undefined} onClose={() => setShowRecorder(false)} />
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
    </div>
  );
}
