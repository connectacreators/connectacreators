import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Film, Mic, Scissors, Sparkles, ArrowLeft, Plus, User, FileText,
  Loader2, ChevronLeft, ExternalLink, Eye, Trash2, Pencil, LogOut, MonitorPlay, Link2, Save, CheckCircle2, Circle, MicIcon, MicOff,
  Camera, Settings,
} from "lucide-react";
import Teleprompter from "@/components/Teleprompter";
import { Link } from "react-router-dom";
import connectaLogo from "@/assets/connecta-logo.png";
import { useClients, type Client } from "@/hooks/useClients";
import { useScripts, type ScriptLine, type Script, type ScriptMetadata } from "@/hooks/useScripts";
import { useAuth } from "@/hooks/useAuth";
import ScriptsLogin from "@/components/ScriptsLogin";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
      toast.error("Tu navegador no soporta reconocimiento de voz");
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

const typeConfig = {
  filming: {
    label: "Instrucciones de Filmación",
    icon: Film,
    color: "text-red-400",
    bg: "bg-gradient-to-br from-red-500/25 to-red-900/10",
    border: "border-red-500/40",
    dot: "bg-red-500",
  },
  actor: {
    label: "Voiceover / Diálogo",
    icon: Mic,
    color: "text-purple-400",
    bg: "bg-gradient-to-br from-purple-500/25 to-purple-900/10",
    border: "border-purple-500/40",
    dot: "bg-purple-500",
  },
  editor: {
    label: "Instrucciones de Edición",
    icon: Scissors,
    color: "text-emerald-400",
    bg: "bg-gradient-to-br from-emerald-500/25 to-emerald-900/10",
    border: "border-emerald-500/40",
    dot: "bg-emerald-500",
  },
};

type View = "clients" | "client-detail" | "new-script" | "view-script" | "edit-script";

export default function Scripts() {
  const { user, role, loading: authLoading, signOut, signInWithEmail, signUpWithEmail, isAdmin, isVideographer } = useAuth();
  const { clients, loading: clientsLoading, addClient, updateClient } = useClients(!!user);
  const {
    scripts, loading: scriptsLoading, fetchScriptsByClient,
    categorizeAndSave, getScriptLines, deleteScript, updateScript, updateGoogleDriveLink, toggleGrabado,
    updateScriptLine, deleteScriptLine,
  } = useScripts();

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
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
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

  // Listen for PASSWORD_RECOVERY event
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setShowResetPassword(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSetNewPassword = useCallback(async () => {
    if (newPassword.length < 6) { toast.error("La contraseña debe tener al menos 6 caracteres"); return; }
    setResetLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setResetLoading(false);
    if (error) toast.error(error.message);
    else { toast.success("Contraseña actualizada exitosamente"); setShowResetPassword(false); setNewPassword(""); }
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
      toast.success("¡Nombre guardado!");
      // Refresh clients
      window.location.reload();
    } catch (e) {
      console.error(e);
      toast.error("Error al guardar el nombre");
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

  // Auto-select client for non-admin users (client or videographer)
  useEffect(() => {
    if (isAdmin || clientsLoading || clients.length === 0 || selectedClient) return;
    if (isVideographer) {
      // Videographers see the client list, don't auto-select
      return;
    }
    const myClient = clients.find((c) => c.user_id === user?.id);
    if (!myClient) return; // No linked client yet
    setSelectedClient(myClient);
    fetchScriptsByClient(myClient.id);
    setView("client-detail");
  }, [isAdmin, isVideographer, clientsLoading, clients, selectedClient, user]);

  // Auth loading
  if (authLoading) {
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
    if (!confirm("¿Estás seguro de que quieres eliminar este script?")) return;
    await deleteScript(scriptId);
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
      setView("clients");
      setSelectedClient(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-card/50 to-background" style={{ fontFamily: "Arial, sans-serif" }}>
      {/* Header */}
      <header className="border-b border-border/50 sticky top-0 z-50 bg-gradient-to-r from-background/90 to-card/90 backdrop-blur-xl">
        <div className="container mx-auto px-3 sm:px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <Link to="/" className="flex items-center gap-1 sm:gap-2 text-muted-foreground hover:text-foreground transition-smooth text-sm flex-shrink-0">
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Inicio</span>
            </Link>
            <img src={connectaLogo} alt="Connecta" className="h-7 sm:h-8" />
          </div>
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <span className="text-xs text-muted-foreground hidden sm:inline truncate max-w-[200px]">
              {user.email} {isAdmin && <span className="text-primary font-bold">(Admin)</span>}
              {isVideographer && <span className="text-emerald-400 font-bold">(Videographer)</span>}
            </span>
            <Link to="/settings">
              <Button variant="ghost" size="sm" className="flex-shrink-0">
                <Settings className="w-3.5 h-3.5" />
              </Button>
            </Link>
            <Button variant="ghost" size="sm" onClick={signOut} className="gap-1 flex-shrink-0">
              <LogOut className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Salir</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 py-6 sm:py-8 max-w-5xl">
        {/* Breadcrumb */}
        {view !== "clients" && (
          <button onClick={goBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-smooth">
            <ChevronLeft className="w-4 h-4" />
            {view === "client-detail" ? "Clientes" : selectedClient?.name}
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
                {isAdmin ? "Gestiona los scripts de todos tus clientes." : isVideographer ? "Clientes asignados a ti." : "Gestiona tus scripts."}
              </p>
            </div>

            {/* New Client (admin only) */}
            {isAdmin && (
              showNewClient ? (
                <div className="bg-gradient-to-br from-card via-card to-muted/30 border border-border rounded-2xl p-6 mb-6 space-y-4 animate-fade-in">
                  <h3 className="font-semibold text-foreground">Nuevo Cliente</h3>
                  <Input placeholder="Nombre del cliente *" value={newName} onChange={(e) => setNewName(e.target.value)} />
                  <Input placeholder="Correo electrónico (opcional)" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
                  <div className="flex gap-3">
                    <Button onClick={handleCreateClient} disabled={!newName.trim()}>
                      <Plus className="w-4 h-4 mr-2" /> Crear Cliente
                    </Button>
                    <Button variant="ghost" onClick={() => setShowNewClient(false)}>Cancelar</Button>
                  </div>
                </div>
              ) : (
                <Button onClick={() => setShowNewClient(true)} variant="outline" className="mb-6 gap-2">
                  <Plus className="w-4 h-4" /> Nuevo Cliente
                </Button>
              )
            )}

            {/* Videographer Manager (admin only) */}
            {isAdmin && (
              showNewVideographer ? (
                <div className="bg-gradient-to-br from-card via-card to-muted/30 border border-border rounded-2xl p-6 mb-6 space-y-4 animate-fade-in">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-foreground flex items-center gap-2">
                      <Camera className="w-5 h-5 text-emerald-400" /> Videógrafos
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
                                  if (!confirm(`¿Eliminar al videógrafo ${v.display_name}?`)) return;
                                  try {
                                    const { data: { session } } = await supabase.auth.getSession();
                                    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-videographer`, {
                                      method: "DELETE",
                                      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
                                      body: JSON.stringify({ user_id: v.user_id }),
                                    });
                                    if (res.ok) {
                                      setVideographers((prev) => prev.filter((x) => x.user_id !== v.user_id));
                                      toast.success("Videógrafo eliminado");
                                    } else {
                                      const r = await res.json();
                                      toast.error(r.error || "Error al eliminar");
                                    }
                                  } catch { toast.error("Error al eliminar"); }
                                }}
                                title="Eliminar videógrafo"
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
                                <span className="text-[10px] text-muted-foreground italic">Sin clientes asignados</span>
                              )}
                            </div>

                            {/* Assign client dropdown */}
                            <Select onValueChange={(clientId) => toggleVideographerAssignment(clientId, v.user_id)}>
                              <SelectTrigger className="h-7 text-xs bg-transparent border-dashed border-muted-foreground/30">
                                <SelectValue placeholder="+ Asignar cliente" />
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
                    <p className="text-sm text-muted-foreground text-center py-2">No hay videógrafos aún.</p>
                  )}

                  {/* Create new videographer form */}
                  <div className="border-t border-border pt-4 space-y-3">
                    <h4 className="text-sm font-semibold text-muted-foreground">Crear nuevo videógrafo</h4>
                    <Input placeholder="Username *" value={vidUsername} onChange={(e) => setVidUsername(e.target.value)} />
                    <Input placeholder="Nombre completo" value={vidName} onChange={(e) => setVidName(e.target.value)} />
                    <Input placeholder="Correo electrónico *" type="email" value={vidEmail} onChange={(e) => setVidEmail(e.target.value)} />
                    <Input placeholder="Contraseña *" type="password" value={vidPassword} onChange={(e) => setVidPassword(e.target.value)} />
                    <Button
                      onClick={async () => {
                        if (!vidUsername.trim() || !vidEmail.trim() || !vidPassword.trim()) { toast.error("Username, email y contraseña son obligatorios"); return; }
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
                          toast.success("Videógrafo creado exitosamente");
                          setVidUsername(""); setVidEmail(""); setVidPassword(""); setVidName("");
                          const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "videographer");
                          if (roles) {
                            const ids = roles.map((r) => r.user_id);
                            const { data: profiles } = await supabase.from("profiles").select("user_id, display_name, username").in("user_id", ids);
                            setVideographers((profiles || []).map((p) => ({ user_id: p.user_id, display_name: p.display_name || "Sin nombre", username: p.username })));
                          }
                        } catch (e: any) {
                          toast.error(e.message || "Error al crear videógrafo");
                        } finally {
                          setVidLoading(false);
                        }
                      }}
                      disabled={vidLoading || !vidUsername.trim() || !vidEmail.trim() || !vidPassword.trim()}
                      className="w-full"
                    >
                      {vidLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                      Crear Videógrafo
                    </Button>
                  </div>
                </div>
              ) : (
                <Button onClick={() => setShowNewVideographer(true)} variant="outline" className="mb-6 gap-2 ml-2">
                  <Camera className="w-4 h-4" /> Videógrafos
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
                {isAdmin ? "No hay clientes aún. Crea el primero." : isVideographer ? "No tienes clientes asignados aún." : "No tienes scripts asignados aún."}
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
                            className="font-semibold text-foreground truncate cursor-pointer hover:underline"
                            onClick={(e) => { if (isAdmin) { e.stopPropagation(); setEditingClientId(c.id); setEditingField("name"); setEditValue(c.name); } }}
                            title={isAdmin ? "Click para editar nombre" : undefined}
                          >
                            {c.name}
                            {!c.user_id && (
                              <span className="text-xs text-red-500 font-normal ml-2">no verificado</span>
                            )}
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
                              placeholder="Añadir email"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => { setEditingClientId(null); setEditingField(null); }}
                              className="h-6 text-xs mt-0.5"
                            />
                          </form>
                        ) : (
                          <p
                            className="text-sm text-muted-foreground truncate cursor-pointer hover:underline"
                            onClick={(e) => { if (isAdmin) { e.stopPropagation(); setEditingClientId(c.id); setEditingField("email"); setEditValue(c.email || ""); } }}
                            title={isAdmin ? "Click para editar email" : undefined}
                          >
                            {c.email || (isAdmin ? <span className="text-xs italic text-muted-foreground/50">+ Añadir email</span> : null)}
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
                        className="absolute top-3 right-12 p-1.5 rounded-full border-2 border-dashed border-muted-foreground/40 hover:border-primary/60 transition-smooth"
                        title="Asignar videographer"
                      >
                        <Camera className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    )}

                    {/* Assignment overlay */}
                    {isAdmin && assignOverlayClient === c.id && (
                      <div className="absolute top-14 right-4 z-50 bg-gradient-to-br from-card to-muted/40 border border-border rounded-xl p-3 shadow-lg min-w-[180px] animate-fade-in">
                        <p className="text-xs font-semibold text-foreground mb-2">Asignar Videographer</p>
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
                  <span className="text-sm text-red-500 font-normal ml-2">no verificado</span>
                )}
              </h1>
              {selectedClient.email && <p className="text-muted-foreground text-sm truncate">{selectedClient.email}</p>}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
              <Button onClick={() => { setScriptTitle(""); setScriptInput(""); setInspirationUrl(""); setFormato(""); setGoogleDriveLink(""); setView("new-script"); }} variant="cta" className="gap-2 w-full sm:w-auto">
                <Plus className="w-4 h-4" /> Nuevo Script
              </Button>
              <div className="flex gap-1 bg-gradient-to-r from-card via-card to-muted/30 border border-border rounded-2xl p-1">
                {[
                  { key: "all" as const, label: "Todos" },
                  { key: "no-grabado" as const, label: "No Grabados" },
                  { key: "grabado" as const, label: "Grabados" },
                ].map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setGrabadoFilter(f.key)}
                    className={`px-3 py-1.5 text-xs sm:text-sm rounded-xl transition-smooth font-medium ${
                      grabadoFilter === f.key
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {(() => {
              const filtered = scripts.filter((s) => {
                if (grabadoFilter === "grabado") return s.grabado;
                if (grabadoFilter === "no-grabado") return !s.grabado;
                return true;
              });
              return filtered.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  {scripts.length === 0 ? "No hay scripts para este cliente." : "No hay scripts en esta categoría."}
                </p>
              ) : (
                <div className="grid gap-3">
                  {filtered.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 sm:gap-4 p-3 sm:p-4 bg-gradient-to-br from-card via-card to-muted/30 border border-border rounded-2xl hover:border-primary/50 hover:to-primary/10 transition-smooth">
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
                      <button onClick={() => handleViewScript(s)} className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0 text-left">
                        <FileText className="w-5 h-5 text-muted-foreground flex-shrink-0 hidden sm:block" />
                        <div className="flex-1 min-w-0">
                          <p className={`font-semibold truncate ${s.grabado ? "text-muted-foreground line-through" : "text-foreground"}`}>{s.title}</p>
                          <p className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleDateString("es-MX")}</p>
                        </div>
                      </button>
                      <div className="flex gap-0.5 sm:gap-1 flex-shrink-0">
                        <Button variant="ghost" size="sm" onClick={() => handleEditScript(s)} title="Editar" className="h-8 w-8 p-0">
                          <Pencil className="w-4 h-4" />
                        </Button>
                        {isAdmin && (
                          <Button variant="ghost" size="sm" onClick={() => handleDeleteScript(s.id)} title="Eliminar" className="text-destructive hover:text-destructive h-8 w-8 p-0">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </>
        )}

        {/* ===== NEW / EDIT SCRIPT ===== */}
        {(view === "new-script" || view === "edit-script") && (
          <>
            <h2 className="text-xl font-bold text-foreground mb-2">
              {view === "edit-script" ? "Editar Script" : "Nuevo Script"} para{" "}
              <span className="text-primary">{selectedClient?.name}</span>
            </h2>

            {/* Legend */}
            <div className="flex flex-wrap gap-3 sm:gap-4 mb-6">
              {Object.entries(typeConfig).map(([key, cfg]) => (
                <div key={key} className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm">
                  <span className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full ${cfg.dot}`} />
                  <span className={cfg.color}>{cfg.label}</span>
                </div>
              ))}
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              Pega el script tal cual — la IA lo categorizará automáticamente.
            </p>

            <Input placeholder="Título del script" value={scriptTitle} onChange={(e) => setScriptTitle(e.target.value)} className="mb-3" />
            <Input placeholder="URL de inspiración (opcional)" value={inspirationUrl} onChange={(e) => setInspirationUrl(e.target.value)} className="mb-3" />
            
            <div className="mb-3">
              <label className="text-sm text-muted-foreground mb-1 block">Formato</label>
              <Select value={formato} onValueChange={setFormato}>
                <SelectTrigger className="bg-gradient-to-r from-card to-muted/30">
                  <SelectValue placeholder="Selecciona un formato" />
                </SelectTrigger>
                <SelectContent className="bg-gradient-to-br from-card to-muted/20 border-border z-50">
                  <SelectItem value="TALKING HEAD">Talking Head</SelectItem>
                  <SelectItem value="B-ROLL CAPTION">B-Roll Caption</SelectItem>
                  <SelectItem value="ENTREVISTA">Entrevista</SelectItem>
                  <SelectItem value="VARIADO">Variado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Input placeholder="Google Drive link (opcional)" value={googleDriveLink} onChange={(e) => setGoogleDriveLink(e.target.value)} className="mb-3" />

            <div className="relative mb-4">
              <Textarea
                value={scriptInput}
                onChange={(e) => setScriptInput(e.target.value)}
                placeholder="Pega, escribe o dicta el guión completo aquí..."
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
              {scriptsLoading ? "Analizando..." : view === "edit-script" ? "Actualizar y Recategorizar" : "Analizar y Guardar"}
            </Button>
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
                      <SelectValue placeholder="Seleccionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TALKING HEAD">TALKING HEAD</SelectItem>
                      <SelectItem value="B-ROLL CAPTION">B-ROLL CAPTION</SelectItem>
                      <SelectItem value="ENTREVISTA">ENTREVISTA</SelectItem>
                      <SelectItem value="VARIADO">VARIADO</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {viewingInspirationUrl && (
              <div className="p-4 rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/15 to-primary/5 mb-2">
                <div className="flex items-center gap-2 mb-2">
                  <Eye className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-primary uppercase tracking-wider">Inspiración</span>
                </div>
                <button onClick={() => window.open(viewingInspirationUrl, '_blank', 'noopener,noreferrer')} className="inline-flex items-center gap-2 text-sm text-primary hover:underline break-all text-left">
                  <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
                  {viewingInspirationUrl}
                </button>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 mb-4">
              <h2 className="text-base sm:text-xl font-bold text-foreground truncate">Resultado — {parsedLines.length} líneas</h2>
              {parsedLines.some((l) => l.line_type === "actor") && (
                <Button onClick={() => setShowTeleprompter(true)} variant="outline" size="sm" className="gap-1.5 flex-shrink-0 text-xs sm:text-sm">
                  <MonitorPlay className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">Teleprompter</span><span className="sm:hidden">TP</span>
                </Button>
              )}
            </div>
            {/* Render lines grouped by section */}
            {(["hook", "body", "cta"] as const).map((section) => {
              const sectionLines = parsedLines.filter((l) => l.section === section);
              if (sectionLines.length === 0) return null;
              const sectionLabels = { hook: "Hook", body: "Body", cta: "CTA" };
              return (
                <div key={section} className="space-y-3">
                  <div className="flex items-center gap-2 mt-4 mb-2">
                    <span className="text-sm font-bold text-foreground uppercase tracking-wider">{sectionLabels[section]}</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                  {sectionLines.map((line, i) => {
                    const cfg = typeConfig[line.line_type];
                    const Icon = cfg.icon;
                    const globalIndex = parsedLines.indexOf(line);
                    const lineKey = `${section}-${i}`;
                    const isEditingThis = editingLineKey === lineKey;
                    return (
                      <div key={lineKey} className={`flex items-start gap-2 sm:gap-3 p-3 sm:p-4 rounded-2xl border ${cfg.bg} ${cfg.border} transition-smooth group`}>
                        <div className={`mt-0.5 p-1.5 rounded-xl ${cfg.bg}`}>
                          <Icon className={`w-4 h-4 ${cfg.color}`} />
                        </div>
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
                              className="text-foreground mt-1 text-sm leading-relaxed cursor-pointer"
                              onDoubleClick={() => { setEditingLineKey(lineKey); setEditLineText(line.text); }}
                            >
                              {line.text}
                            </p>
                          )}
                        </div>
                        {!isEditingThis && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="opacity-0 group-hover:opacity-100 transition-smooth text-destructive hover:text-destructive h-8 w-8 p-0 flex-shrink-0 mt-1"
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
                  })}
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
                      placeholder="Pega el link de Google Drive"
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
                  <button onClick={() => { setTempDriveLink(""); setEditingDriveLink(true); }} className="text-sm text-muted-foreground hover:text-foreground">
                    + Agregar link
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {showTeleprompter && (
        <Teleprompter lines={parsedLines} onClose={() => setShowTeleprompter(false)} />
      )}

      <Dialog open={showResetPassword} onOpenChange={setShowResetPassword}>
        <DialogContent className="sm:max-w-sm bg-gradient-to-br from-card via-card to-muted/30 rounded-2xl">
          <DialogHeader>
            <DialogTitle>Establecer nueva contraseña</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              type="password"
              placeholder="Nueva contraseña (mín. 6 caracteres)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSetNewPassword()}
            />
            <Button onClick={handleSetNewPassword} className="w-full" disabled={resetLoading}>
              {resetLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Guardar contraseña
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showNamePrompt} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-sm bg-gradient-to-br from-card via-card to-muted/30 rounded-2xl" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>¿Cómo te llamas?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Necesitamos tu nombre para crear tu perfil de cliente.
          </p>
          <div className="space-y-4">
            <Input
              placeholder="Tu nombre completo"
              value={promptName}
              onChange={(e) => setPromptName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
              autoFocus
            />
            <Button onClick={handleSaveName} className="w-full" disabled={namePromptLoading || !promptName.trim()}>
              {namePromptLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Guardar nombre
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
