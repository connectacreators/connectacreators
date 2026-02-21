import { useNavigate } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
import { t, tr } from "@/i18n/translations";
import ThemeToggle from "@/components/ThemeToggle";
import LanguageToggle from "@/components/LanguageToggle";
import {
  FileText, LogOut, Settings, Target, CalendarDays,
  Home, ChevronLeft, CreditCard, Users, Video, Archive, Clapperboard,
} from "lucide-react";

import connectaLoginLogo from "@/assets/connecta-login-logo.png";
import connectaLoginLogoDark from "@/assets/connecta-logo-dark.png";

interface Props {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  currentPath: string;
}

export default function DashboardSidebar({ sidebarOpen, setSidebarOpen, currentPath }: Props) {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { language } = useLanguage();
  const { signOut, isAdmin, isUser, isVideographer, role } = useAuth();

  const getNavItems = () => {
    if (isAdmin) {
      return [
        { label: tr(t.dashboard.home, language), icon: Home, path: "/dashboard" },
        { label: language === "en" ? "Clients" : "Clientes", icon: Users, path: "/clients" },
        { label: "Editing Queue", icon: Clapperboard, path: "/editing-queue" },
        { label: language === "en" ? "Videographers" : "Videógrafos", icon: Video, path: "/videographers" },
        { label: tr(t.subscription.navLabel, language), icon: CreditCard, path: "/subscription" },
        { label: tr(t.dashboard.settings, language), icon: Settings, path: "/settings" },
      ];
    }
    if (isVideographer) {
      return [
        { label: tr(t.dashboard.home, language), icon: Home, path: "/dashboard" },
        { label: language === "en" ? "Clients" : "Clientes", icon: Users, path: "/clients" },
        { label: "Editing Queue", icon: Clapperboard, path: "/editing-queue" },
        { label: tr(t.subscription.navLabel, language), icon: CreditCard, path: "/subscription" },
        { label: tr(t.dashboard.settings, language), icon: Settings, path: "/settings" },
      ];
    }
    if (isUser) {
      return [
        { label: tr(t.dashboard.home, language), icon: Home, path: "/dashboard" },
        { label: language === "en" ? "Clients" : "Clientes", icon: Users, path: "/clients" },
        { label: "Editing Queue", icon: Clapperboard, path: "/editing-queue" },
        { label: tr(t.dashboard.scripts, language), icon: FileText, path: "/scripts" },
        { label: "Vault", icon: Archive, path: "/vault" },
        { label: tr(t.dashboard.leadTracker, language), icon: Target, path: "/leads" },
        { label: tr(t.dashboard.leadCalendar, language), icon: CalendarDays, path: "/lead-calendar" },
        { label: tr(t.subscription.navLabel, language), icon: CreditCard, path: "/subscription" },
        { label: tr(t.dashboard.settings, language), icon: Settings, path: "/settings" },
      ];
    }
    // Client role (default)
    return [
      { label: tr(t.dashboard.home, language), icon: Home, path: "/dashboard" },
      { label: tr(t.dashboard.scripts, language), icon: FileText, path: "/scripts" },
      { label: tr(t.dashboard.leadTracker, language), icon: Target, path: "/leads" },
      { label: tr(t.dashboard.leadCalendar, language), icon: CalendarDays, path: "/lead-calendar" },
      { label: tr(t.subscription.navLabel, language), icon: CreditCard, path: "/subscription" },
      { label: tr(t.dashboard.settings, language), icon: Settings, path: "/settings" },
    ];
  };

  const navItems = getNavItems();

  return (
    <aside
      className={`${
        sidebarOpen ? "w-56 translate-x-0" : "-translate-x-full lg:w-0 lg:translate-x-0 lg:overflow-hidden"
      } fixed lg:relative z-40 lg:z-auto transition-all duration-300 border-r border-border bg-card/95 lg:bg-card/60 backdrop-blur-md lg:backdrop-blur-none flex flex-col flex-shrink-0 h-screen lg:sticky top-0`}
    >
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

      <nav className="flex-1 py-3 px-2 space-y-0.5">
        {navItems.map((item) => {
          const isActive = item.path === currentPath;
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
  );
}
