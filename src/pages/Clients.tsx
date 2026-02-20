import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import DashboardSidebar from "@/components/DashboardSidebar";
import DashboardTopBar from "@/components/DashboardTopBar";
import ScriptsLogin from "@/components/ScriptsLogin";
import { Loader2, Search, User, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/hooks/useLanguage";
import { motion } from "framer-motion";
import AnimatedDots from "@/components/ui/AnimatedDots";
import { toast } from "sonner";

type ClientRow = {
  id: string;
  name: string;
  email: string | null;
  user_id: string | null;
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
  }),
};

export default function Clients() {
  const { user, loading, isAdmin, isUser, isVideographer, signInWithEmail, signUpWithEmail } = useAuth();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isMobile = typeof window !== "undefined" && window.innerWidth < 1024;
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [search, setSearch] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [adding, setAdding] = useState(false);

  const canManageClients = isAdmin || isVideographer || isUser;
  const canAddClients = isAdmin || isUser;
  const MAX_CLIENTS = 20;

  const handleAddClient = async () => {
    if (!newClientName.trim() || !user) return;
    if (isUser && clients.length >= MAX_CLIENTS) {
      toast.error(language === "en" ? `You can have up to ${MAX_CLIENTS} clients` : `Puedes tener hasta ${MAX_CLIENTS} clientes`);
      return;
    }
    setAdding(true);
    const insertData: any = {
      name: newClientName.trim(),
      email: newClientEmail.trim() || null,
    };
    if (isUser) {
      insertData.owner_user_id = user.id;
    }
    const { error } = await supabase.from("clients").insert(insertData);
    if (error) {
      toast.error(language === "en" ? "Error adding client" : "Error al agregar cliente");
    } else {
      toast.success(language === "en" ? "Client added" : "Cliente agregado");
      setNewClientName("");
      setNewClientEmail("");
      setShowAddDialog(false);
      fetchClients();
    }
    setAdding(false);
  };

  const fetchClients = useCallback(async () => {
    if (!user) return;
    setLoadingClients(true);

    if (isAdmin) {
      const { data } = await supabase
        .from("clients")
        .select("id, name, email, user_id")
        .order("name");
      setClients(data || []);
    } else if (isVideographer) {
      const { data: assignments } = await supabase
        .from("videographer_clients")
        .select("client_id")
        .eq("videographer_user_id", user.id);

      if (assignments && assignments.length > 0) {
        const clientIds = assignments.map((a) => a.client_id);
        const { data } = await supabase
          .from("clients")
          .select("id, name, email, user_id")
          .in("id", clientIds)
          .order("name");
        setClients(data || []);
      } else {
        setClients([]);
      }
    } else if (isUser) {
      const { data } = await supabase
        .from("clients")
        .select("id, name, email, user_id")
        .eq("owner_user_id", user.id)
        .order("name");
      setClients(data || []);
    }

    setLoadingClients(false);
  }, [user, isAdmin, isVideographer, isUser]);

  useEffect(() => {
    if (!loading && user && canManageClients) {
      fetchClients();
    } else if (!loading && user && !canManageClients) {
      navigate("/dashboard");
    }
  }, [loading, user, canManageClients, fetchClients, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <ScriptsLogin
        onSignIn={() => {}}
        signInWithEmail={signInWithEmail}
        signUpWithEmail={signUpWithEmail}
      />
    );
  }

  const filtered = clients.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.email && c.email.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-background flex" style={{ fontFamily: "Arial, sans-serif" }}>
      <AnimatedDots />
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <DashboardSidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} currentPath="/clients" />

      <main className="flex-1 flex flex-col min-h-screen">
        <DashboardTopBar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

        <div className="flex-1 px-6 py-8 max-w-3xl mx-auto w-full">
          <motion.h1
            className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground mb-8 tracking-tight text-center"
            initial="hidden"
            animate="visible"
            custom={0}
            variants={fadeUp}
          >
            {language === "en" ? "Who are we working on today?" : "¿Con quién trabajamos hoy?"}
          </motion.h1>

          <div className="flex items-center gap-3 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={language === "en" ? "Search clients..." : "Buscar clientes..."}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            {canAddClients && (
              <Button
                size="sm"
                onClick={() => setShowAddDialog(true)}
                className="shrink-0"
              >
                <Plus className="w-4 h-4 mr-1" />
                {language === "en" ? "Add" : "Agregar"}
              </Button>
            )}
          </div>

          {loadingClients ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground text-center py-20 text-sm">
              {language === "en" ? "No clients found" : "No se encontraron clientes"}
            </p>
          ) : (
            <div className="space-y-3">
              {filtered.map((client, i) => (
                <motion.button
                  key={client.id}
                  onClick={() => navigate(`/clients/${client.id}`)}
                  className="w-full border border-border/50 rounded-xl p-5 bg-card/30 hover:border-primary/30 transition-colors flex items-center gap-3 text-left"
                  initial="hidden"
                  animate="visible"
                  custom={i + 1}
                  variants={fadeUp}
                >
                  <div className="w-9 h-9 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-foreground">{client.name}</h2>
                    {client.email && (
                      <p className="text-xs text-muted-foreground">{client.email}</p>
                    )}
                  </div>
                </motion.button>
              ))}
            </div>
          )}
        </div>
      </main>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{language === "en" ? "Add Client" : "Agregar Cliente"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{language === "en" ? "Name" : "Nombre"}</Label>
              <Input
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                placeholder={language === "en" ? "Client name" : "Nombre del cliente"}
              />
            </div>
            <div className="space-y-2">
              <Label>{language === "en" ? "Email (optional)" : "Email (opcional)"}</Label>
              <Input
                type="email"
                value={newClientEmail}
                onChange={(e) => setNewClientEmail(e.target.value)}
                placeholder="email@example.com"
              />
            </div>
            {isUser && (
              <p className="text-xs text-muted-foreground">
                {language === "en"
                  ? `${clients.length}/${MAX_CLIENTS} clients`
                  : `${clients.length}/${MAX_CLIENTS} clientes`}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              {language === "en" ? "Cancel" : "Cancelar"}
            </Button>
            <Button onClick={handleAddClient} disabled={adding || !newClientName.trim()}>
              {adding && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {language === "en" ? "Add" : "Agregar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
