import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import DashboardSidebar from "@/components/DashboardSidebar";
import DashboardTopBar from "@/components/DashboardTopBar";
import { Loader2, FileText, Target, CalendarDays, ArrowLeft, Globe, Archive, Pencil, Trash2, Clapperboard } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { motion } from "framer-motion";
import AnimatedDots from "@/components/ui/AnimatedDots";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
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
              {toolCards.map((tool, i) => (
                <motion.button
                  key={tool.path}
                  onClick={() => navigate(tool.path)}
                  className="group flex flex-col items-center gap-5 p-8 rounded-2xl border border-border/50 bg-card/30 hover:border-primary/30 transition-colors text-center relative"
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
