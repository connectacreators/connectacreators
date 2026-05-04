import { useEffect, useState } from "react";
import PageTransition from "@/components/PageTransition";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, FileText, Target, CalendarDays, ArrowLeft, Globe, Archive, Pencil, Trash2, Clapperboard, Database, Zap, Sparkles, Calendar, BarChart3, Settings2, ChevronLeft, Bot, ScrollText } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
  }),
};

export default function ClientDetail() {
  const { clientId } = useParams<{ clientId: string }>();
  const { user, loading, isAdmin, isUser, isVideographer } = useAuth();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientOwnerId, setClientOwnerId] = useState<string | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Notion mapping state (admin-only)
  const [showNotionDialog, setShowNotionDialog] = useState(false);

  // Notion database state
  const [notionDbId, setNotionDbId] = useState("");
  const [notionLeadsDbId, setNotionLeadsDbId] = useState("");
  const [notionTitleProp, setNotionTitleProp] = useState("Reel title");
  const [notionScriptProp, setNotionScriptProp] = useState("Script");
  const [notionFootageProp, setNotionFootageProp] = useState("Footage");
  const [notionFileSubmissionProp, setNotionFileSubmissionProp] = useState("File Submission");
  const [notionLoading, setNotionLoading] = useState(false);
  const [activeFolder, setActiveFolder] = useState<"content" | "sales" | "setup" | null>(null);

  const canViewClient = isAdmin || isVideographer || isUser;

  useEffect(() => {
    if (!clientId || !user) return;
    supabase
      .from("clients")
      .select("name, email, owner_user_id")
      .eq("id", clientId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setClientName(data.name);
          setClientEmail(data.email || "");
          setClientOwnerId(data.owner_user_id);
        }
      });
  }, [clientId, user]);

  const isOwnedByUser = isUser && clientOwnerId === user?.id;

  // Fetch existing Notion mapping for admin
  useEffect(() => {
    if (!clientId || !isAdmin) return;
    supabase
      .from("client_notion_mapping")
      .select("notion_database_id, notion_leads_database_id, title_property, script_property, footage_property, file_submission_property")
      .eq("client_id", clientId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setNotionDbId(data.notion_database_id || "");
          setNotionLeadsDbId(data.notion_leads_database_id || "");
          setNotionTitleProp(data.title_property || "Reel title");
          setNotionScriptProp(data.script_property || "Script");
          setNotionFootageProp(data.footage_property || "Footage");
          setNotionFileSubmissionProp(data.file_submission_property || "File Submission");
        }
      });
  }, [clientId, isAdmin]);

  const handleSaveNotion = async () => {
    if (!clientId || !notionDbId.trim()) return;
    setNotionLoading(true);
    // Strip any URL prefix or view param — keep just the 32-char ID
    const rawId = notionDbId.trim().split("?")[0].replace(/-/g, "").slice(-32);
    const rawLeadsId = notionLeadsDbId.trim().split("?")[0].replace(/-/g, "").slice(-32);

    const { error } = await supabase.from("client_notion_mapping").upsert(
      {
        client_id: clientId,
        notion_database_id: rawId,
        notion_leads_database_id: rawLeadsId,
        title_property: notionTitleProp.trim() || "Reel title",
        script_property: notionScriptProp.trim() || "Script",
        footage_property: notionFootageProp.trim() || "Footage",
        file_submission_property: notionFileSubmissionProp.trim() || "File Submission",
      },
      { onConflict: "client_id" }
    );
    if (error) {
      toast.error("Error saving Notion settings");
    } else {
      toast.success("Notion databases linked successfully");
      setNotionDbId(rawId);
      setNotionLeadsDbId(rawLeadsId);
      setShowNotionDialog(false);
    }
    setNotionLoading(false);
  };

  const handleEditClient = async () => {
    if (!clientId || !editName.trim()) return;
    setEditLoading(true);
    const { error } = await supabase
      .from("clients")
      .update({ name: editName.trim(), email: editEmail.trim() || null })
      .eq("id", clientId);
    if (error) {
      toast.error(language === "en" ? "Error updating client" : "Error al actualizar cliente");
    } else {
      toast.success(language === "en" ? "Client updated" : "Cliente actualizado");
      setClientName(editName.trim());
      setClientEmail(editEmail.trim());
      setShowEditDialog(false);
    }
    setEditLoading(false);
  };

  const handleDeleteClient = async () => {
    if (!clientId) return;
    setDeleteLoading(true);
    const { error } = await supabase.from("clients").delete().eq("id", clientId);
    if (error) {
      toast.error(language === "en" ? "Error deleting client" : "Error al eliminar cliente");
    } else {
      toast.success(language === "en" ? "Client deleted" : "Cliente eliminado");
      navigate("/clients");
    }
    setDeleteLoading(false);
  };

  useEffect(() => {
    if (!loading && user && !canViewClient) {
      navigate("/dashboard");
    }
  }, [loading, user, canViewClient, navigate]);

  if (loading) {
    return (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
    );
  }

  const folderCards = [
    {
      key: "content" as const,
      label: language === "en" ? "Content Creation" : "Creación de Contenido",
      description: language === "en" ? "Scripts · Vault · Editing Queue · Content Calendar" : "Guiones · Vault · Cola de Edición · Calendario",
      icon: Sparkles,
      color: "text-amber-400",
    },
    {
      key: "sales" as const,
      label: "Sales",
      description: language === "en" ? "Lead Tracker · Lead Calendar" : "Tracker · Calendario de Leads",
      icon: BarChart3,
      color: "text-emerald-400",
    },
    {
      key: "setup" as const,
      label: language === "en" ? "Client Set Up" : "Configuración",
      description: language === "en" ? "Onboarding · Booking · Landing Page · Database" : "Onboarding · Booking · Landing Page · Base de Datos",
      icon: Settings2,
      color: "text-violet-400",
    },
  ];

  const subCards: Record<"content" | "sales" | "setup", { label: string; description: string; icon: React.ElementType; color: string; path?: string; action?: string }[]> = {
    content: [
      { label: "Connecta AI", description: language === "en" ? "AI-powered script planning canvas" : "Canvas de planificación con IA", icon: Bot, color: "text-orange-400", path: `/clients/${clientId}/scripts?view=canvas` },
      { label: "Script Breakdown", description: language === "en" ? "View and manage scripts" : "Ver y gestionar guiones", icon: FileText, color: "text-primary", path: `/clients/${clientId}/scripts` },
      { label: "Vault", description: language === "en" ? "Script templates from viral videos" : "Plantillas de scripts de videos virales", icon: Archive, color: "text-amber-400", path: `/clients/${clientId}/vault` },
      { label: "Editing Queue", description: language === "en" ? "Track video production status" : "Estado de producción de videos", icon: Clapperboard, color: "text-rose-400", path: `/clients/${clientId}/editing-queue` },
      { label: language === "en" ? "Content Calendar" : "Calendario de Contenido", description: language === "en" ? "Schedule & approve posts" : "Programar y aprobar publicaciones", icon: Calendar, color: "text-fuchsia-400", path: `/clients/${clientId}/content-calendar` },
    ],
    sales: [
      { label: "Lead Tracker", description: language === "en" ? "Track incoming leads" : "Seguimiento de leads", icon: Target, color: "text-emerald-400", path: `/clients/${clientId}/leads` },
      { label: language === "en" ? "Lead Calendar" : "Calendario de Leads", description: language === "en" ? "Calendar view of leads" : "Vista de calendario de leads", icon: CalendarDays, color: "text-violet-400", path: `/clients/${clientId}/lead-calendar` },
    ],
    setup: [
      { label: language === "en" ? "Content Strategy" : "Estrategia de Contenido", description: language === "en" ? "Goals, mix, ManyChat & fulfillment score" : "Metas, mezcla, ManyChat y puntuación", icon: BarChart3, color: "text-[#22d3ee]", path: `/clients/${clientId}/strategy` },
      { label: language === "en" ? "Brand Setup" : "Configuración de Marca", description: language === "en" ? "Complete client onboarding form" : "Formulario completo de onboarding", icon: Sparkles, color: "text-yellow-400", path: `/onboarding/${clientId}` },
      { label: language === "en" ? "Public Booking" : "Booking Público", description: language === "en" ? "Calendly-style public calendar" : "Calendario público tipo Calendly", icon: Globe, color: "text-sky-400", path: `/clients/${clientId}/booking-settings` },
      { label: "Landing Page", description: language === "en" ? "Build client's custom landing page" : "Construye la landing page del cliente", icon: Zap, color: "text-emerald-400", path: `/clients/${clientId}/landing-page` },
      { label: "Database", description: language === "en" ? "Direct database access" : "Acceso directo a base de datos", icon: Database, color: "text-cyan-400", action: "database" },
      { label: "Contracts", description: language === "en" ? "Upload, sign & send contracts" : "Sube, firma y envía contratos", icon: ScrollText, color: "text-amber-400", path: `/clients/${clientId}/contracts` },
    ],
  };

  const activeFolderData = activeFolder ? folderCards.find(f => f.key === activeFolder) : null;
  const activeSubCards = activeFolder ? subCards[activeFolder] : [];

  return (
    <>

      <PageTransition className="flex-1 flex flex-col min-h-screen">

        {activeFolder ? (
          /* ===== SUB-VIEW: top-aligned, wider, 2x2 grid ===== */
          <div className="flex-1 px-4 sm:px-8 py-8 overflow-y-auto">
            <div className="max-w-2xl mx-auto">
              {/* Breadcrumb */}
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25 }}
                className="flex items-center gap-2 mb-10"
              >
                <button
                  onClick={() => setActiveFolder(null)}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" /> {isUser && !isAdmin ? (user?.user_metadata?.full_name || user?.email?.split("@")[0] || clientName) : clientName}
                </button>
                <span className="text-muted-foreground/30">/</span>
                {activeFolderData && (
                  <span className={`text-sm font-semibold ${activeFolderData.color}`}>{activeFolderData.label}</span>
                )}
              </motion.div>

              <motion.h1
                className="text-2xl sm:text-3xl font-bold text-foreground mb-10 tracking-tight text-center font-caslon"
                initial="hidden" animate="visible" custom={0} variants={fadeUp}
              >
                {activeFolderData?.label}
              </motion.h1>

              {/* Always 2-column grid — comfortable on all screen sizes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {activeSubCards.map((tool, i) => (
                  <motion.button
                    key={tool.path || tool.action}
                    onClick={() => {
                      if (tool.action === "database") navigate(`/clients/${clientId}/database`);
                      else if (tool.path) navigate(tool.path);
                    }}
                    className="group flex flex-col items-center gap-5 p-8 sm:p-10 text-center glass-card rounded-xl"
                    initial="hidden" animate="visible" custom={i + 1} variants={fadeUp}
                  >
                    <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)' }}>
                      <tool.icon className="w-6 h-6 text-muted-foreground group-hover:!text-[#22d3ee] transition-colors" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-foreground mb-1.5 tracking-tight">{tool.label}</h2>
                      <p className="text-xs text-muted-foreground leading-relaxed">{tool.description}</p>
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* ===== MAIN VIEW: vertically centered, 3 folder cards ===== */
          <div className="flex-1 flex items-center justify-center px-4 sm:px-6">
          <div className="max-w-3xl w-full text-center">
            {isUser && !isAdmin ? (
              /* Subscriber greeting — matches Dashboard style */
              <>
                <motion.p className="text-xs tracking-[0.3em] uppercase text-muted-foreground mb-2" initial="hidden" animate="visible" custom={0} variants={fadeUp}>
                  👋 {language === "en" ? "Hi" : "Hola"}, {user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User"}
                </motion.p>
              </>
            ) : (
              /* Admin/videographer view — back button + client name + edit controls */
              <>
                <motion.button
                  onClick={() => navigate("/clients")}
                  className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors mb-6"
                  initial="hidden" animate="visible" custom={0} variants={fadeUp}
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  {language === "en" ? "Back to clients" : "Volver a clientes"}
                </motion.button>

                <motion.div
                  className="flex items-center justify-center gap-2 mb-2"
                  initial="hidden" animate="visible" custom={1} variants={fadeUp}
                >
                  <p className="text-xs tracking-[0.3em] uppercase text-muted-foreground">
                    {clientName}
                  </p>
                  {(isAdmin || isOwnedByUser) && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => { setEditName(clientName); setEditEmail(clientEmail); setShowEditDialog(true); }}
                        className="p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
                        title={language === "en" ? "Edit client" : "Editar cliente"}
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => setShowNotionDialog(true)}
                          className={`p-1 rounded-md transition-colors ${notionDbId ? "text-emerald-400 hover:text-emerald-300" : "text-muted-foreground hover:text-foreground"}`}
                          title="Notion database settings"
                        >
                          <Database className="w-3 h-3" />
                        </button>
                      )}
                      {isOwnedByUser && (
                        <button
                          onClick={() => setShowDeleteAlert(true)}
                          className="p-1 rounded-md text-muted-foreground hover:text-destructive transition-colors"
                          title={language === "en" ? "Delete client" : "Eliminar cliente"}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}
                </motion.div>
              </>
            )}

            {/* Main folder view */}
            <>
                <motion.h1
                  className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground mb-12 tracking-tight leading-[0.95] font-caslon"
                  initial="hidden"
                  animate="visible"
                  custom={2}
                  variants={fadeUp}
                >
                  {language === "en" ? "What do you want to do today?" : "¿Qué quieres hacer hoy?"}
                </motion.h1>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  {folderCards.map((folder, i) => (
                    <motion.button
                      key={folder.key}
                      onClick={() => setActiveFolder(folder.key)}
                      className="group flex flex-col items-center gap-5 p-8 text-center glass-card rounded-xl"
                      initial="hidden"
                      animate="visible"
                      custom={i + 3}
                      variants={fadeUp}
                    >
                      <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)' }}>
                        <folder.icon className="w-5 h-5 text-muted-foreground group-hover:!text-[#22d3ee] transition-colors" />
                      </div>
                      <div>
                        <h2 className="text-sm font-bold text-foreground mb-1 tracking-tight">{folder.label}</h2>
                        <p className="text-xs text-muted-foreground leading-relaxed">{folder.description}</p>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </>
            </div>
          </div>
          )}
      </PageTransition>

      {/* Edit Client Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{language === "en" ? "Edit Client" : "Editar Cliente"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{language === "en" ? "Name" : "Nombre"}</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              {language === "en" ? "Cancel" : "Cancelar"}
            </Button>
            <Button onClick={handleEditClient} disabled={editLoading || !editName.trim()}>
              {editLoading && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {language === "en" ? "Save" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Notion Settings Dialog (admin-only) */}
      <Dialog open={showNotionDialog} onOpenChange={setShowNotionDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-400" />
              Notion Database Settings
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="font-semibold">📋 Edit Queue Database ID</Label>
              <Input
                placeholder="e.g. 9ad6442e09c805a927de6e3fdb6112c"
                value={notionDbId}
                onChange={(e) => setNotionDbId(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Database for storing video editing queue & reel metadata.</p>
            </div>

            <div className="space-y-2">
              <Label className="font-semibold">🎯 Leads Database ID (Workflow Data)</Label>
              <Input
                placeholder="e.g. 5c1f88c1093841b3bb8464e70fd58eb7"
                value={notionLeadsDbId}
                onChange={(e) => setNotionLeadsDbId(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Separate database for storing workflow leads/data (different from video edits database).</p>
            </div>

            <div className="border-t border-border/50 pt-3">
              <p className="text-xs text-muted-foreground mb-3 font-medium">Property names in Notion</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Title property</Label>
                  <Input className="h-8 text-xs" value={notionTitleProp} onChange={(e) => setNotionTitleProp(e.target.value)} placeholder="Reel title" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Script property</Label>
                  <Input className="h-8 text-xs" value={notionScriptProp} onChange={(e) => setNotionScriptProp(e.target.value)} placeholder="Script" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Footage property</Label>
                  <Input className="h-8 text-xs" value={notionFootageProp} onChange={(e) => setNotionFootageProp(e.target.value)} placeholder="Footage" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">File submission property</Label>
                  <Input className="h-8 text-xs" value={notionFileSubmissionProp} onChange={(e) => setNotionFileSubmissionProp(e.target.value)} placeholder="File Submission" />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNotionDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveNotion} disabled={notionLoading || !notionDbId.trim()}>
              {notionLoading && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Client Alert */}
      <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {language === "en" ? "Delete client?" : "¿Eliminar cliente?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {language === "en"
                ? "This will permanently delete the client and all their data (scripts, leads, etc). This action cannot be undone."
                : "Esto eliminará permanentemente al cliente y todos sus datos (guiones, leads, etc). Esta acción no se puede deshacer."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{language === "en" ? "Cancel" : "Cancelar"}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteClient}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteLoading}
            >
              {deleteLoading && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {language === "en" ? "Delete" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
