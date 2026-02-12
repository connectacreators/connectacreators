import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import ScriptsLogin from "@/components/ScriptsLogin";
import { Button } from "@/components/ui/button";
import {
  FileText, LogOut, Loader2, Settings, Target, CalendarDays,
  Home, ChevronLeft,
} from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import LanguageToggle from "@/components/LanguageToggle";
import { useTheme } from "@/hooks/useTheme";
import { useLanguage } from "@/hooks/useLanguage";
import { t, tr } from "@/i18n/translations";

import connectaLoginLogo from "@/assets/connecta-login-logo.png";
import connectaLoginLogoDark from "@/assets/connecta-logo-dark.png";
import { useState } from "react";

export default function Dashboard() {
  const { user, loading, signOut, signInWithEmail, signUpWithEmail } = useAuth();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { language } = useLanguage();
  const isMobile = typeof window !== "undefined" && window.innerWidth < 1024;
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);

  const navItems = [
    { label: tr(t.dashboard.home, language), icon: Home, path: "/" },
    { label: tr(t.dashboard.scripts, language), icon: FileText, path: "/scripts" },
    { label: tr(t.dashboard.leadTracker, language), icon: Target, path: "/leads" },
    { label: tr(t.dashboard.leadCalendar, language), icon: CalendarDays, path: "/lead-calendar" },
    { label: tr(t.dashboard.settings, language), icon: Settings, path: "/settings" },
  ];

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
      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "w-56 translate-x-0" : "-translate-x-full lg:w-0 lg:translate-x-0 lg:overflow-hidden"
        } fixed lg:relative z-40 lg:z-auto transition-all duration-300 border-r border-border bg-card/95 lg:bg-card/60 backdrop-blur-md lg:backdrop-blur-none flex flex-col flex-shrink-0 h-screen lg:sticky top-0`}
      >
        {/* Sidebar header */}
        <div className="flex items-center gap-2 px-4 py-5 border-b border-border/50">
          <img
            src={theme === "light" ? connectaLoginLogoDark : connectaLoginLogo}
            alt="Connecta"
            className="h-6 object-contain"
          />
          <button
            onClick={() => setSidebarOpen(false)}
            className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-3 px-2 space-y-0.5">
          {navItems.map((item) => {
            const isActive = item.path === "/";
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-accent/20 text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/10"
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Sidebar footer */}
        <div className="border-t border-border/50 p-3 space-y-1">
          <div className="flex items-center gap-2 px-2">
            <ThemeToggle />
            <LanguageToggle />
          </div>
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            {tr(t.dashboard.signOut, language)}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-h-screen">
        {/* Top bar - always visible on mobile */}
        <div className="border-b border-border/50 px-4 py-3 flex items-center gap-3 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <img
              src={theme === "light" ? connectaLoginLogoDark : connectaLoginLogo}
              alt="Connecta"
              className="h-6 object-contain"
            />
          </button>
        </div>
        {!sidebarOpen && (
          <div className="border-b border-border/50 px-4 py-3 hidden lg:flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <img
                src={theme === "light" ? connectaLoginLogoDark : connectaLoginLogo}
                alt="Connecta"
                className="h-6 object-contain"
              />
            </button>
          </div>
        )}

        {/* Center content */}
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="max-w-3xl w-full text-center">
            {/* Greeting */}
            <p className="text-muted-foreground text-sm mb-1">👋 {tr(t.dashboard.greeting, language)}, {displayName}</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-10">
              {tr(t.dashboard.question, language)}
            </h1>

            {/* Tool cards */}
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
