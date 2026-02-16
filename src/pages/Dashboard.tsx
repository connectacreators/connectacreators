import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import ScriptsLogin from "@/components/ScriptsLogin";
import DashboardSidebar from "@/components/DashboardSidebar";
import DashboardTopBar from "@/components/DashboardTopBar";
import { Loader2, FileText, Target, CalendarDays } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { t, tr } from "@/i18n/translations";
import { useState } from "react";

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
            <p className="text-muted-foreground text-sm mb-1">👋 {tr(t.dashboard.greeting, language)}, {displayName}</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-10">
              {tr(t.dashboard.question, language)}
            </h1>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {toolCards.map((tool, i) => (
                <button
                  key={tool.path}
                  onClick={() => navigate(tool.path)}
                  className="group flex flex-col items-center gap-4 p-8 bg-card border border-border/60 rounded-xl hover:border-primary/40 transition-all hover:shadow-lg hover:shadow-primary/5 text-center relative"
                >
                  <tool.icon className={`w-8 h-8 ${tool.color}`} />
                  <div>
                    <h2 className="text-sm font-bold text-foreground mb-1">{tool.label}</h2>
                    <p className="text-xs text-muted-foreground">{tool.description}</p>
                  </div>
                  {i < toolCards.length - 1 && (
                    <span className="hidden sm:block absolute -right-3 top-1/2 -translate-y-1/2 text-muted-foreground/30 text-lg">→</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
