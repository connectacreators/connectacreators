import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import DashboardSidebar from "@/components/DashboardSidebar";
import DashboardTopBar from "@/components/DashboardTopBar";
import { Loader2, FileText, Target, CalendarDays, ArrowLeft, Globe, Archive, Pencil, Trash2, Clapperboard, Database, Workflow, Sparkles } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { motion } from "framer-motion";
import AnimatedDots from "@/components/ui/AnimatedDots";
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
  const isMobile = typeof window !== "undefined" && window.innerWidth < 1024;
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
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
    if (!clientId || !notionDbId.trim() || !notionLeadsDbId.trim()) return;
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const toolCards = [
    {
      label: "Script Breakdown",
      description: language === "en" ? "View and manage scripts" : "Ver y gestionar guiones",
      icon: FileText,
      color: "text-primary",
      path: `/clients/${clientId}/scripts`,
    },
    {
      label: "Lead Tracker",
      description: language === "en" ? "Track incoming leads" : "Seguimiento de leads",
      icon: Target,
      color: "text-emerald-400",
      path: `/clients/${clientId}/leads`,
    },
    {
      label: language === "en" ? "Lead Calendar" : "Calendario de Leads",
      description: language === "en" ? "Calendar view of leads" : "Vista de calendario de leads",
      icon: CalendarDays,
      color: "text-violet-400",
      path: `/clients/${clientId}/lead-calendar`,
    },
    {
      label: language === "en" ? "Public Booking" : "Booking Público",
      description: language === "en" ? "Calendly-style public calendar" : "Calendario público tipo Calendly",
      icon: Globe,
      color: "text-sky-400",
      path: `/clients/${clientId}/booking-settings`,
    },
    {
      label: "Vault",
      description: language === "en" ? "Script templates from viral videos" : "Plantillas de scripts de videos virales",
      icon: Archive,
      color: "text-amber-400",
      path: `/clients/${clientId}/vault`,
    },
    {
      label: "Editing Queue",
      description: language === "en" ? "Track video production status" : "Estado de producción de videos",
      icon: Clapperboard,
      color: "text-rose-400",
      path: `/clients/${clientId}/editing-queue`,
    },
    {
      label: "Workflow",
      description: language === "en" ? "Facebook Leads Integration & automation" : "Integración de Leads de Facebook y automatización",
      icon: Workflow,
      color: "text-blue-400",
      path: `/clients/${clientId}/workflow`,
    },
    {
      label: language === "en" ? "Brand Setup" : "Configuración de Marca",
      description: language === "en" ? "Complete client onboarding form" : "Formulario completo de onboarding",
      icon: Sparkles,
      color: "text-yellow-400",
      path: `/onboarding/${clientId}`,
    },
    {
      label: "Database",
      description: language === "en" ? "(Future) Direct database access - Supabase storage" : "(Futuro) Acceso directo a base de datos - almacenamiento Supabase",
      icon: Database,
      color: "text-cyan-400",
      action: "database",
    },
  ];

  return (
    <div className="min-h-screen bg-background flex" style={{ fontFamily: "Arial, sans-serif" }}>
      <AnimatedDots />
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <DashboardSidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} currentPath="/clients" />

      <main className="flex-1 flex flex-col min-h-screen">
        <DashboardTopBar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

        <div className="flex-1 flex items-center justify-center px-6">
          <div className="max-w-3xl w-full text-center">
            <motion.button
              onClick={() => navigate("/clients")}
              className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors mb-6"
              initial="hidden"
              animate="visible"
              custom={0}
              variants={fadeUp}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {language === "en" ? "Back to clients" : "Volver a clientes"}
            </motion.button>

            <motion.div
              className="flex items-center justify-center gap-2 mb-2"
              initial="hidden"
              animate="visible"
              custom={1}
              variants={fadeUp}
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

            <motion.h1
              className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground mb-12 tracking-tight leading-[0.95]"
              initial="hidden"
              animate="visible"
              custom={2}
              variants={fadeUp}
            >
              {language === "en" ? "What do we want to do?" : "¿Qué queremos hacer?"}
            </motion.h1>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {toolCards.map((tool: any, i) => (
                <motion.button
                  key={tool.path || tool.action}
                  onClick={() => {
                    if (tool.action === "database") {
                      navigate(`/clients/${clientId}/database`);
                    } else {
                      navigate(tool.path);
                    }
                  }}
                  className="group flex flex-col items-center gap-5 p-8 text-center card-glass-17"
                  initial="hidden"
                  animate="visible"
                  custom={i + 3}
                  variants={fadeUp}
                >
                  <div className="w-12 h-12 rounded-full border border-foreground/10 flex items-center justify-center group-hover:border-primary/30 transition-colors">
                    <tool.icon className={`w-5 h-5 ${tool.color} group-hover:text-primary transition-colors`} />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-foreground mb-1 tracking-tight">{tool.label}</h2>
                    <p className="text-xs text-muted-foreground leading-relaxed">{tool.description}</p>
                  </div>
                  {i < toolCards.length - 1 && (
                    <span className="hidden sm:block absolute -right-3 top-1/2 -translate-y-1/2 text-muted-foreground/20 text-lg">→</span>
                  )}
                </motion.button>
              ))}
            </div>
          </div>
        </div>
      </main>

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
    </div>
  );
}
