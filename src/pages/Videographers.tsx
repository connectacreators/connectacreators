import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import DashboardSidebar from "@/components/DashboardSidebar";
import DashboardTopBar from "@/components/DashboardTopBar";
import ScriptsLogin from "@/components/ScriptsLogin";
import { Loader2, Search, Video, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/hooks/useLanguage";
import { motion } from "framer-motion";
import AnimatedDots from "@/components/ui/AnimatedDots";
import { toast } from "sonner";

type VideographerRow = {
  user_id: string;
  display_name: string | null;
  email: string | null;
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
  }),
};

export default function Videographers() {
  const { user, loading, isAdmin, signInWithEmail, signUpWithEmail } = useAuth();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isMobile = typeof window !== "undefined" && window.innerWidth < 1024;
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [videographers, setVideographers] = useState<VideographerRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreateVideographer = async () => {
    if (!newEmail.trim() || !newPassword.trim() || !newFullName.trim()) return;
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-videographer", {
        body: {
          email: newEmail.trim(),
          password: newPassword.trim(),
          full_name: newFullName.trim(),
          username: newFullName.trim().toLowerCase().replace(/\s+/g, "_"),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(language === "en" ? "Videographer created" : "Videógrafo creado");
      setNewEmail("");
      setNewPassword("");
      setNewFullName("");
      setShowCreateDialog(false);
      fetchVideographers();
    } catch (e: any) {
      toast.error(e.message || (language === "en" ? "Error creating videographer" : "Error al crear videógrafo"));
    } finally {
      setCreating(false);
    }
  };

  const fetchVideographers = useCallback(async () => {
    if (!user || !isAdmin) return;
    setLoadingList(true);

    // Get all users with videographer role
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "videographer");

    if (roles && roles.length > 0) {
      const userIds = roles.map((r) => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, email")
        .in("user_id", userIds);
      setVideographers(profiles || []);
    } else {
      setVideographers([]);
    }

    setLoadingList(false);
  }, [user, isAdmin]);

  useEffect(() => {
    if (!loading && user && isAdmin) {
      fetchVideographers();
    } else if (!loading && user && !isAdmin) {
      navigate("/dashboard");
    }
  }, [loading, user, isAdmin, fetchVideographers, navigate]);

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

  const filtered = videographers.filter(
    (v) =>
      (v.display_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (v.email || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background flex" style={{ fontFamily: "Arial, sans-serif" }}>
      <AnimatedDots />
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <DashboardSidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} currentPath="/videographers" />

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
                placeholder={language === "en" ? "Search videographers..." : "Buscar videógrafos..."}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button size="sm" onClick={() => setShowCreateDialog(true)} className="shrink-0">
              <Plus className="w-4 h-4 mr-1" />
              {language === "en" ? "Create" : "Crear"}
            </Button>
          </div>

          {loadingList ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground text-center py-20 text-sm">
              {language === "en" ? "No videographers found" : "No se encontraron videógrafos"}
            </p>
          ) : (
            <div className="space-y-3">
              {filtered.map((v, i) => (
                <motion.button
                  key={v.user_id}
                  onClick={() => navigate(`/videographers/${v.user_id}`)}
                  className="w-full border border-border/50 rounded-xl p-5 bg-card/30 hover:border-primary/30 transition-colors flex items-center gap-3 text-left"
                  initial="hidden"
                  animate="visible"
                  custom={i + 1}
                  variants={fadeUp}
                >
                  <div className="w-9 h-9 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
                    <Video className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-foreground">{v.display_name || v.email || "Videographer"}</h2>
                    {v.email && <p className="text-xs text-muted-foreground">{v.email}</p>}
                  </div>
                </motion.button>
              ))}
            </div>
          )}
        </div>
      </main>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{language === "en" ? "Create Videographer" : "Crear Videógrafo"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{language === "en" ? "Full Name" : "Nombre Completo"}</Label>
              <Input
                value={newFullName}
                onChange={(e) => setNewFullName(e.target.value)}
                placeholder={language === "en" ? "Full name" : "Nombre completo"}
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="email@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>{language === "en" ? "Password" : "Contraseña"}</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={language === "en" ? "Password" : "Contraseña"}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              {language === "en" ? "Cancel" : "Cancelar"}
            </Button>
            <Button
              onClick={handleCreateVideographer}
              disabled={creating || !newEmail.trim() || !newPassword.trim() || !newFullName.trim()}
            >
              {creating && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {language === "en" ? "Create" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
