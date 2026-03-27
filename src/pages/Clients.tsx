import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import ScriptsLogin from "@/components/ScriptsLogin";
import { Loader2, Search, User, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/hooks/useLanguage";
import { motion } from "framer-motion";
import { toast } from "sonner";
import PageTransition from "@/components/PageTransition";
import { Skeleton } from "@/components/ui/skeleton";

type ClientRow = {
  id: string;
  name: string;
  email: string | null;
  user_id: string | null;
  is_primary?: boolean;
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
  }),
};

function ClientsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card/50">
          <Skeleton className="w-9 h-9 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export default function Clients() {
  const { user, loading, isAdmin, isUser, isVideographer, signInWithEmail, signUpWithEmail } = useAuth();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [search, setSearch] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [adding, setAdding] = useState(false);

  const canManageClients = isAdmin || isVideographer || isUser;
  const canAddClients = isAdmin || isUser;
  const [clientLimit, setClientLimit] = useState(5);

  const handleAddClient = async () => {
    if (!newClientName.trim() || !user) return;
    if (isUser && clients.length >= clientLimit) {
      toast.error(language === "en"
        ? `You've reached your ${clientLimit}-client limit. Upgrade your plan for more.`
        : `Has alcanzado el límite de ${clientLimit} clientes. Mejora tu plan para más.`);
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
    const { data: newClient, error } = await supabase.from("clients").insert(insertData).select("id").single();

    if (!error && newClient && isUser) {
      // Create junction table entry (non-primary)
      await supabase.from("subscriber_clients").insert({
        subscriber_user_id: user.id,
        client_id: newClient.id,
        is_primary: false,
      });
    }

    if (error) {
      toast.error(language === "en" ? "Failed to create client" : "Error al crear cliente");
    } else {
      toast.success(language === "en" ? "Client created!" : "¡Cliente creado!");
      setNewClientName("");
      setNewClientEmail("");
      setShowAddDialog(false);
      fetchClients();
    }
    setAdding(false);
  };

  const handleDeleteClient = async (clientId: string, isPrimary: boolean) => {
    if (isPrimary) return;
    if (!confirm(language === "en" ? "Delete this client and all their data?" : "¿Eliminar este cliente y todos sus datos?")) return;

    await supabase.from("subscriber_clients")
      .delete()
      .eq("subscriber_user_id", user!.id)
      .eq("client_id", clientId);
    await supabase.from("clients").delete().eq("id", clientId);

    toast.success(language === "en" ? "Client deleted" : "Cliente eliminado");
    fetchClients();
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
        .from("subscriber_clients")
        .select("client_id, is_primary, clients(id, name, email, created_at)")
        .eq("subscriber_user_id", user.id)
        .order("is_primary", { ascending: false })
        .order("created_at");
      if (data) {
        setClients(data.map((d: any) => ({
          id: d.clients.id,
          name: d.clients.name,
          email: d.clients.email,
          user_id: null,
          is_primary: d.is_primary,
        })));
      } else {
        setClients([]);
      }
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

  // Fetch client limit from subscriptions table
  useEffect(() => {
    if (!user || !isUser) return;
    supabase
      .from("subscriptions")
      .select("client_limit")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.client_limit) setClientLimit(data.client_limit);
      });
  }, [user, isUser]);

  if (loading) {
    return (
      <PageTransition className="flex-1 flex flex-col min-h-screen">
        <div className="flex-1 px-6 py-8 max-w-3xl mx-auto w-full">
          <ClientsSkeleton />
        </div>
      </PageTransition>
    );
  }

  if (!user) {
    return (
      <ScriptsLogin
        onSignIn={() => {}}
        signInWithEmail={signInWithEmail}
      />
    );
  }

  const filtered = clients.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.email && c.email.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <>
    <PageTransition className="flex-1 flex flex-col min-h-screen">

        <div className="flex-1 px-6 py-8 max-w-3xl mx-auto w-full">
          <motion.h1
            className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground mb-8 tracking-tight text-center"
            initial="hidden"
            animate="visible"
            custom={0}
            variants={fadeUp}
          >
            {isUser
              ? (language === "en" ? "My Clients" : "Mis Clientes")
              : (language === "en" ? "Who are we working on today?" : "¿Con quién trabajamos hoy?")}
          </motion.h1>

          {isUser && (
            <motion.p
              className="text-sm text-muted-foreground text-center mb-6 -mt-4"
              initial="hidden"
              animate="visible"
              custom={0.5}
              variants={fadeUp}
            >
              {clients.length} of {clientLimit} client slots used
            </motion.p>
          )}

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
            <ClientsSkeleton />
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground text-center py-20 text-sm">
              {language === "en" ? "No clients found" : "No se encontraron clientes"}
            </p>
          ) : (
            <div className="space-y-3">
              {filtered.map((client, i) => (
                <motion.div
                  key={client.id}
                  className={`w-full glass-card rounded-xl p-5 transition-colors flex items-center gap-3 text-left ${
                    (client as any).is_primary ? 'border-[#22d3ee]/30' : 'hover:border-primary/30'
                  }`}
                  initial="hidden"
                  animate="visible"
                  custom={i + 1}
                  variants={fadeUp}
                >
                  <button
                    onClick={() => navigate(`/clients/${client.id}`)}
                    className="flex items-center gap-3 flex-1 text-left"
                  >
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                      (client as any).is_primary ? 'bg-[rgba(34,211,238,0.15)]' : 'bg-[rgba(8,145,178,0.15)]'
                    }`}>
                      <User className={`w-4 h-4 ${(client as any).is_primary ? 'text-[#22d3ee]' : 'text-[#0891B2]'}`} />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-foreground">
                        {client.name}
                        {(client as any).is_primary && (
                          <span className="ml-2 text-[10px] font-semibold text-[#22d3ee]">PRIMARY</span>
                        )}
                      </h2>
                      {client.email && (
                        <p className="text-xs text-muted-foreground">{client.email}</p>
                      )}
                    </div>
                  </button>
                  {isUser && !(client as any).is_primary && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteClient(client.id, !!(client as any).is_primary); }}
                      className="text-xs text-red-400/60 hover:text-red-400 transition-colors px-2 py-1"
                    >
                      {language === "en" ? "Delete" : "Eliminar"}
                    </button>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </PageTransition>

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
                  ? `${clients.length}/${clientLimit} clients`
                  : `${clients.length}/${clientLimit} clientes`}
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
    </>
  );
}
