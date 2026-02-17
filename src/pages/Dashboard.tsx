import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import ScriptsLogin from "@/components/ScriptsLogin";
import DashboardSidebar from "@/components/DashboardSidebar";
import DashboardTopBar from "@/components/DashboardTopBar";
import { Loader2, FileText, Target, CalendarDays } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { t, tr } from "@/i18n/translations";
import { useState } from "react";
import { motion } from "framer-motion";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
  }),
};

export default function Dashboard() {
  const { user, loading, signOut, signInWithEmail, signUpWithEmail } = useAuth();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isMobile = typeof window !== "undefined" && window.innerWidth < 1024;
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);

  const toolCards = [
    {
      label: "Script Breakdown",
      description: tr(t.dashboard.scriptDesc, language),
      icon: FileText,
      color: "text-primary",
      path: "/scripts",
    },
    {
      label: tr(t.dashboard.leadTracker, language),
      description: tr(t.dashboard.leadTrackerDesc, language),
      icon: Target,
      color: "text-emerald-400",
      path: "/leads",
    },
    {
      label: tr(t.dashboard.leadCalendar, language),
      description: tr(t.dashboard.leadCalendarDesc, language),
      icon: CalendarDays,
      color: "text-violet-400",
      path: "/lead-calendar",
    },
  ];

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

  const displayName = user.user_metadata?.full_name || user.email?.split("@")[0] || "User";

  return (
    <div className="min-h-screen bg-background flex" style={{ fontFamily: "Arial, sans-serif" }}>
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <DashboardSidebar
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        currentPath="/"
      />

      <main className="flex-1 flex flex-col min-h-screen">
        <DashboardTopBar
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
        />

        <div className="flex-1 flex items-center justify-center px-6">
          <div className="max-w-3xl w-full text-center">
            <motion.p
              className="text-xs tracking-[0.3em] uppercase text-muted-foreground mb-2"
              initial="hidden"
              animate="visible"
              custom={0}
              variants={fadeUp}
            >
              👋 {tr(t.dashboard.greeting, language)}, {displayName}
            </motion.p>
            <motion.h1
              className="text-3xl sm:text-4xl md:text-5xl font-bold text-foreground mb-16 tracking-tight leading-[0.95]"
              initial="hidden"
              animate="visible"
              custom={1}
              variants={fadeUp}
            >
              {tr(t.dashboard.question, language)}
            </motion.h1>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {toolCards.map((tool, i) => (
                <motion.button
                  key={tool.path}
                  onClick={() => navigate(tool.path)}
                  className="group flex flex-col items-center gap-5 p-8 rounded-2xl border border-border/50 bg-card/30 hover:border-primary/30 transition-colors text-center relative"
                  initial="hidden"
                  animate="visible"
                  custom={i + 2}
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
