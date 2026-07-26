import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Home, Flame, FileText, Clapperboard, MoreHorizontal, Bot,
  Users, Archive, CalendarDays, UserCheck, GraduationCap,
  CreditCard, Settings, Globe, LogOut, X, TrendingUp, DollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { readCache } from "@/lib/sessionCache";

// The Command Deck (/ai) is admin-only, so it only takes over the hero slot
// for admins — everyone else keeps the original Scripts-as-hero bar
// unchanged (a nav button that would just redirect them away is worse than
// not having it). For admins, Scripts moves to the non-hero slot Viral used
// to occupy and Viral moves into the "More" sheet — Scripts is the more
// frequently-used day-to-day tool of the two.
//
// Scripts' path is client-aware: when a client is already selected (via the
// header's own client switcher), tapping Scripts goes straight to THAT
// client's scripts instead of /scripts, which prompts a picker even though
// one is already chosen in plain sight — a real "why is it asking me
// again" moment. Falls back to the generic /scripts (which handles its own
// picker) only in agency/master view, where there's genuinely no single
// client to go to.
const BOTTOM_TABS = (es: boolean, isAdmin: boolean, scriptsPath: string) =>
  isAdmin
    ? [
        { icon: Home, label: es ? "Inicio" : "Home", path: "/dashboard" },
        { icon: FileText, label: es ? "Guiones" : "Scripts", path: scriptsPath },
        { icon: Bot, label: "AI", path: "/ai", hero: true as const },
        { icon: Clapperboard, label: es ? "Cola" : "Queue", path: "/editing-queue" },
      ]
    : [
        { icon: Home, label: es ? "Inicio" : "Home", path: "/dashboard" },
        { icon: Flame, label: "Viral", path: "/viral-today" },
        { icon: FileText, label: es ? "Guiones" : "Scripts", path: scriptsPath, hero: true as const },
        { icon: Clapperboard, label: es ? "Cola" : "Queue", path: "/editing-queue" },
      ];

const MORE_NAV_ITEMS = (es: boolean) => [
  { icon: Users, label: es ? "Clientes" : "Clients", path: "/clients" },
  { icon: Archive, label: "Vault", path: "/vault" },
  { icon: CalendarDays, label: es ? "Calendario de Contenido" : "Content Calendar", path: "/content-calendar" },
  { icon: UserCheck, label: es ? "Equipo" : "Team Members", path: "/team-members" },
  { icon: GraduationCap, label: es ? "Entrenamientos" : "Trainings", path: "/trainings" },
  { icon: CreditCard, label: es ? "Suscriptores" : "Subscribers", path: "/subscribers" },
];

export default function MobileBottomNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, signOut, isAdmin } = useAuth();
  const { language, toggleLanguage } = useLanguage();
  const [moreOpen, setMoreOpen] = useState(false);

  // Resolve the selected client the same way DashboardSidebar does: the URL
  // wins, then the persisted client-selector viewMode ("master" has no
  // client-scoped pages, "me" maps to the user's own client).
  const [, bumpViewMode] = useState(0);
  useEffect(() => {
    const onChange = () => bumpViewMode((n) => n + 1);
    window.addEventListener("viewModeChanged", onChange);
    return () => window.removeEventListener("viewModeChanged", onChange);
  }, []);
  const viewMode = typeof window !== "undefined" ? localStorage.getItem("dashboard_viewMode") : null;
  const urlClientId = pathname.match(/^\/clients\/([^/]+)/)?.[1] ?? null;
  const ownClientId = user
    ? readCache<{ id: string | null; name: string | null }>(`ownClient_${user.id}`, { id: null, name: null }).id
    : null;
  const selectedClientId =
    urlClientId ?? (viewMode === "master" || !viewMode ? null : viewMode === "me" ? ownClientId : viewMode);
  const scriptsPath = selectedClientId ? `/clients/${selectedClientId}/scripts` : "/scripts";

  const moreItems = [
    ...(selectedClientId
      ? [{ icon: TrendingUp, label: language === "es" ? "Estrategia" : "Strategy", path: `/clients/${selectedClientId}/strategy` }]
      : []),
    ...(isAdmin ? [{ icon: DollarSign, label: language === "es" ? "Finanzas" : "Finances", path: "/finances" }] : []),
    // Viral only moves here for admins — it displaced from the main bar to
    // make room for the AI hero button (see BOTTOM_TABS above). Non-admins
    // never lost their Viral tab, so it stays out of their "More" sheet.
    ...(isAdmin ? [{ icon: Flame, label: "Viral", path: "/viral-today" }] : []),
    ...MORE_NAV_ITEMS(language === "es"),
  ];

  const handleNav = (path: string) => {
    navigate(path);
    setMoreOpen(false);
  };

  return (
    <>
      {/* Bottom nav bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-card border-t border-border">
        <div className="flex items-end justify-around h-16 px-2 pb-2">
          {BOTTOM_TABS(language === "es", isAdmin, scriptsPath).map((tab) => {
            const isActive = pathname.startsWith(tab.path.split("?")[0]);

            if (tab.hero) {
              return (
                <button
                  key={tab.label}
                  onClick={() => navigate(tab.path)}
                  className="flex flex-col items-center gap-1 -mt-4"
                >
                  <div
                    className="w-14 h-14 rounded-full flex items-center justify-center shadow-xl border-[3px] border-background"
                    style={{ background: "linear-gradient(135deg, hsl(var(--aqua)) 0%, hsl(var(--aqua)) 100%)" }}
                  >
                    <tab.icon className="w-6 h-6 text-white" />
                  </div>
                  <span className="text-[10px] text-muted-foreground font-medium">{tab.label}</span>
                </button>
              );
            }

            return (
              <button
                key={tab.label}
                onClick={() => navigate(tab.path)}
                className={cn(
                  "flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-colors min-w-[48px]",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              >
                <tab.icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{tab.label}</span>
              </button>
            );
          })}

          {/* More button */}
          <button
            onClick={() => setMoreOpen(true)}
            className={cn(
              "flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-colors min-w-[48px]",
              moreOpen ? "text-primary" : "text-muted-foreground"
            )}
          >
            <MoreHorizontal className="w-5 h-5" />
            <span className="text-[10px] font-medium">{language === "es" ? "Más" : "More"}</span>
          </button>
        </div>
      </nav>

      {/* More sheet */}
      {moreOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[60] bg-black/60 lg:hidden"
            onClick={() => setMoreOpen(false)}
          />

          {/* Sheet */}
          <div
            className="fixed bottom-0 left-0 right-0 z-[70] lg:hidden rounded-t-2xl bg-card border-t border-border animate-in slide-in-from-bottom duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="w-10 h-1 bg-muted-foreground/30 rounded-full mx-auto mt-3 mb-1" />

            {/* Close button */}
            <button
              onClick={() => setMoreOpen(false)}
              className="absolute top-3 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Nav items */}
            <div className="px-2 pb-8">
              {moreItems.map((item) => (
                <button
                  key={item.path}
                  onClick={() => handleNav(item.path)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-muted/50 transition-colors text-left"
                >
                  <item.icon className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm font-medium text-foreground">{item.label}</span>
                </button>
              ))}

              {/* Divider */}
              <div className="h-px bg-border mx-2 my-1" />

              {/* Settings */}
              <button
                onClick={() => handleNav("/settings")}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-muted/50 transition-colors text-left"
              >
                <Settings className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                <span className="text-sm font-medium text-foreground">{language === "es" ? "Configuración" : "Settings"}</span>
              </button>

              {/* Language toggle */}
              <button
                onClick={toggleLanguage}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-muted/50 transition-colors text-left"
              >
                <Globe className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                <span className="text-sm font-medium text-foreground">
                  {language === "en" ? "Language: English" : "Idioma: Español"}
                </span>
                <span className="ml-auto text-xs font-bold text-primary">
                  {language === "en" ? "ES" : "EN"}
                </span>
              </button>

              {/* Sign Out */}
              <button
                onClick={() => { setMoreOpen(false); signOut(); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-red-500/10 transition-colors text-left"
              >
                <LogOut className="w-5 h-5 text-red-400 flex-shrink-0" />
                <span className="text-sm font-semibold text-red-400">{language === "es" ? "Cerrar sesión" : "Sign Out"}</span>
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
