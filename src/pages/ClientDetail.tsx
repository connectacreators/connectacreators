import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import DashboardSidebar from "@/components/DashboardSidebar";
import DashboardTopBar from "@/components/DashboardTopBar";
import { Loader2, FileText, Target, CalendarDays, ArrowLeft, Globe, Archive } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { motion } from "framer-motion";
import AnimatedDots from "@/components/ui/AnimatedDots";

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
  const { user, loading, isAdmin, isVideographer } = useAuth();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isMobile = typeof window !== "undefined" && window.innerWidth < 1024;
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [clientName, setClientName] = useState("");

  useEffect(() => {
    if (!clientId || !user) return;
    supabase
      .from("clients")
      .select("name")
      .eq("id", clientId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setClientName(data.name);
      });
  }, [clientId, user]);

  useEffect(() => {
    if (!loading && user && !isAdmin && !isVideographer) {
      navigate("/dashboard");
    }
  }, [loading, user, isAdmin, isVideographer, navigate]);

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

            <motion.p
              className="text-xs tracking-[0.3em] uppercase text-muted-foreground mb-2"
              initial="hidden"
              animate="visible"
              custom={1}
              variants={fadeUp}
            >
              {clientName}
            </motion.p>

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
    </div>
  );
}
