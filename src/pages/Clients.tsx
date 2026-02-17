import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import DashboardSidebar from "@/components/DashboardSidebar";
import DashboardTopBar from "@/components/DashboardTopBar";
import ScriptsLogin from "@/components/ScriptsLogin";
import { Loader2, Search, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/hooks/useLanguage";
import { motion } from "framer-motion";

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
  const { user, loading, isAdmin, isVideographer, signInWithEmail, signUpWithEmail } = useAuth();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isMobile = typeof window !== "undefined" && window.innerWidth < 1024;
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [search, setSearch] = useState("");

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
    }

    setLoadingClients(false);
  }, [user, isAdmin, isVideographer]);

  useEffect(() => {
    if (!loading && user && (isAdmin || isVideographer)) {
      fetchClients();
    } else if (!loading && user && !isAdmin && !isVideographer) {
      navigate("/dashboard");
    }
  }, [loading, user, isAdmin, isVideographer, fetchClients, navigate]);

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

          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={language === "en" ? "Search clients..." : "Buscar clientes..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
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
    </div>
  );
}
