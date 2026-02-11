import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Film, Mic, Scissors, Sparkles, ArrowLeft, Plus, User, FileText,
  Loader2, ChevronLeft, ExternalLink, Eye, Trash2, Pencil, LogOut, MonitorPlay, Link2, Target, Lightbulb, Save,
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

const typeConfig = {
  filming: {
    label: "Instrucciones de Filmación",
    icon: Film,
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    dot: "bg-red-500",
  },
  actor: {
    label: "Voiceover / Diálogo",
    icon: Mic,
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
    dot: "bg-purple-500",
  },
  editor: {
    label: "Instrucciones de Edición",
    icon: Scissors,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    dot: "bg-emerald-500",
  },
};

type View = "clients" | "client-detail" | "new-script" | "view-script" | "edit-script";

export default function Scripts() {
  const { user, role, loading: authLoading, signOut, signInWithEmail, signUpWithEmail, isAdmin } = useAuth();
  const { clients, loading: clientsLoading, addClient } = useClients(!!user);
  const {
    scripts, loading: scriptsLoading, fetchScriptsByClient,
    categorizeAndSave, getScriptLines, deleteScript, updateScript, updateGoogleDriveLink,
  } = useScripts();

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

  // Name prompt for Google sign-ups
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [promptName, setPromptName] = useState("");
  const [namePromptLoading, setNamePromptLoading] = useState(false);

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
    if (!user || authLoading || isAdmin) return;
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

  // Auto-select client for non-admin users
  useEffect(() => {
    if (!isAdmin && !clientsLoading && clients.length > 0 && !selectedClient) {
      const myClient = clients.find((c) => c.user_id === user?.id) || clients[0];
      setSelectedClient(myClient);
      fetchScriptsByClient(myClient.id);
      setView("client-detail");
    }
  }, [isAdmin, clientsLoading, clients, selectedClient, user]);

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
    <div className="min-h-screen bg-background" style={{ fontFamily: "Arial, sans-serif" }}>
      {/* Header */}
      <header className="border-b border-border/50 sticky top-0 z-50 bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-smooth text-sm">
              <ArrowLeft className="w-4 h-4" />
              Inicio
            </Link>
            <img src={connectaLogo} alt="Connecta" className="h-8" />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {user.email} {isAdmin && <span className="text-primary font-bold">(Admin)</span>}
            </span>
            <Button variant="ghost" size="sm" onClick={signOut} className="gap-1.5">
              <LogOut className="w-3.5 h-3.5" /> Salir
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-5xl">
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
                {isAdmin ? "Gestiona los scripts de todos tus clientes." : "Gestiona tus scripts."}
              </p>
            </div>

            {/* New Client (admin only) */}
            {isAdmin && (
              showNewClient ? (
                <div className="bg-card border border-border rounded-lg p-6 mb-6 space-y-4 animate-fade-in">
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

            {/* Client Cards */}
            {clientsLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : clients.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">
                {isAdmin ? "No hay clientes aún. Crea el primero." : "No tienes scripts asignados aún."}
              </p>
            ) : (
              <div className="grid gap-3">
                {clients.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleSelectClient(c)}
                    className="flex items-center gap-4 p-4 bg-card border border-border rounded-lg hover:border-primary/50 transition-smooth text-left w-full"
                  >
                    <div className="p-2 rounded-full bg-primary/10">
                      <User className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground truncate">{c.name}</p>
                      {c.email && <p className="text-sm text-muted-foreground truncate">{c.email}</p>}
                    </div>
                    <ChevronLeft className="w-4 h-4 text-muted-foreground rotate-180" />
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {/* ===== CLIENT DETAIL ===== */}
        {view === "client-detail" && selectedClient && (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-foreground">{selectedClient.name}</h1>
              {selectedClient.email && <p className="text-muted-foreground text-sm">{selectedClient.email}</p>}
            </div>

            <Button onClick={() => { setScriptTitle(""); setScriptInput(""); setInspirationUrl(""); setFormato(""); setGoogleDriveLink(""); setView("new-script"); }} variant="cta" className="mb-6 gap-2">
              <Plus className="w-4 h-4" /> Nuevo Script
            </Button>

            {scripts.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No hay scripts para este cliente.</p>
            ) : (
              <div className="grid gap-3">
                {scripts.map((s) => (
                  <div key={s.id} className="flex items-center gap-4 p-4 bg-card border border-border rounded-lg hover:border-primary/50 transition-smooth">
                    <button onClick={() => handleViewScript(s)} className="flex items-center gap-4 flex-1 min-w-0 text-left">
                      <FileText className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground truncate">{s.title}</p>
                        <p className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleDateString("es-MX")}</p>
                      </div>
                    </button>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => handleEditScript(s)} title="Editar">
                        <Pencil className="w-4 h-4" />
                      </Button>
                      {isAdmin && (
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteScript(s.id)} title="Eliminar" className="text-destructive hover:text-destructive">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
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
            <div className="flex flex-wrap gap-4 mb-6">
              {Object.entries(typeConfig).map(([key, cfg]) => (
                <div key={key} className="flex items-center gap-2 text-sm">
                  <span className={`w-3 h-3 rounded-full ${cfg.dot}`} />
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
                <SelectTrigger className="bg-card">
                  <SelectValue placeholder="Selecciona un formato" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border z-50">
                  <SelectItem value="TALKING HEAD">Talking Head</SelectItem>
                  <SelectItem value="B-ROLL CAPTION">B-Roll Caption</SelectItem>
                  <SelectItem value="ENTREVISTA">Entrevista</SelectItem>
                  <SelectItem value="VARIADO">Variado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Input placeholder="Google Drive link (opcional)" value={googleDriveLink} onChange={(e) => setGoogleDriveLink(e.target.value)} className="mb-3" />

            <Textarea
              value={scriptInput}
              onChange={(e) => setScriptInput(e.target.value)}
              placeholder="Pega o escribe el guión completo aquí..."
              className="min-h-[200px] bg-card border-border font-mono text-sm resize-y mb-4"
            />
            <Button
              onClick={view === "edit-script" ? handleUpdate : handleCategorize}
              variant="cta"
              size="lg"
              className="gap-2"
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
              <div className="mb-4 space-y-1">
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
                    <SelectTrigger className="h-7 w-auto min-w-[160px] border-violet-500/30 bg-transparent text-foreground text-sm px-2 py-0">
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
              <div className="p-4 rounded-lg border border-primary/30 bg-primary/5 mb-2">
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

            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-foreground">Resultado — {parsedLines.length} líneas</h2>
              {parsedLines.some((l) => l.line_type === "actor") && (
                <Button onClick={() => setShowTeleprompter(true)} variant="outline" className="gap-2">
                  <MonitorPlay className="w-4 h-4" /> Teleprompter
                </Button>
              )}
            </div>
            {parsedLines.map((line, i) => {
              const cfg = typeConfig[line.line_type];
              const Icon = cfg.icon;
              return (
                <div key={i} className={`flex items-start gap-3 p-4 rounded-lg border ${cfg.bg} ${cfg.border} transition-smooth`}>
                  <div className={`mt-0.5 p-1.5 rounded-md ${cfg.bg}`}>
                    <Icon className={`w-4 h-4 ${cfg.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className={`text-xs font-semibold uppercase tracking-wider ${cfg.color}`}>{cfg.label}</span>
                    <p className="text-foreground mt-1 text-sm leading-relaxed">{line.text}</p>
                  </div>
                  <span className="text-xs text-muted-foreground font-mono mt-1">#{i + 1}</span>
                </div>
              );
            })}

            {/* Google Drive link at the end */}
            {viewingMetadata && (
              <div className="mt-6 pt-4 border-t border-border">
                <div className="flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-green-400" />
                  <span className="text-sm font-semibold text-green-400">Google Drive:</span>
                  {editingDriveLink ? (
                    <div className="flex gap-2 flex-1">
                      <Input
                        value={tempDriveLink}
                        onChange={(e) => setTempDriveLink(e.target.value)}
                        placeholder="Pega el link de Google Drive"
                        className="text-sm h-8"
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
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => window.open(viewingMetadata.google_drive_link!, '_blank', 'noopener,noreferrer')}
                        className="text-sm text-green-400 hover:underline break-all text-left"
                      >
                        {viewingMetadata.google_drive_link}
                      </button>
                      <Button size="sm" variant="ghost" onClick={() => { setTempDriveLink(viewingMetadata.google_drive_link || ""); setEditingDriveLink(true); }}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : (
                    <button onClick={() => { setTempDriveLink(""); setEditingDriveLink(true); }} className="text-sm text-muted-foreground hover:text-foreground">
                      + Agregar link
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {showTeleprompter && (
        <Teleprompter lines={parsedLines} onClose={() => setShowTeleprompter(false)} />
      )}

      <Dialog open={showResetPassword} onOpenChange={setShowResetPassword}>
        <DialogContent className="sm:max-w-sm">
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
        <DialogContent className="sm:max-w-sm" onPointerDownOutside={(e) => e.preventDefault()}>
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
