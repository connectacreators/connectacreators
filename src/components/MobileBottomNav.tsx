import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Home, Flame, Layers, Clapperboard, MoreHorizontal,
  Users, Archive, CalendarDays, UserCheck, GraduationCap,
  CreditCard, Settings, Globe, LogOut, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";

const BOTTOM_TABS = [
  { icon: Home, label: "Home", path: "/dashboard" },
  { icon: Flame, label: "Viral", path: "/viral-today/reels" },
  { icon: Layers, label: "Canvas", path: "/scripts?view=canvas", hero: true as const },
  { icon: Clapperboard, label: "Queue", path: "/editing-queue" },
];

const MORE_NAV_ITEMS = [
  { icon: Users, label: "Clients", path: "/clients" },
  { icon: Archive, label: "Vault", path: "/vault" },
  { icon: CalendarDays, label: "Content Calendar", path: "/content-calendar" },
  { icon: UserCheck, label: "Team Members", path: "/team-members" },
  { icon: GraduationCap, label: "Trainings", path: "/trainings" },
  { icon: CreditCard, label: "Subscribers", path: "/subscribers" },
];

export default function MobileBottomNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { language, toggleLanguage } = useLanguage();
  const [moreOpen, setMoreOpen] = useState(false);

  const handleNav = (path: string) => {
    navigate(path);
    setMoreOpen(false);
  };

  return (
    <>
      {/* Bottom nav bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-card/95 backdrop-blur-md border-t border-border">
        <div className="flex items-end justify-around h-16 px-2 pb-2">
          {BOTTOM_TABS.map((tab) => {
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
                    style={{ background: "linear-gradient(135deg, #0891B2 0%, #06B6D4 100%)" }}
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
            <span className="text-[10px] font-medium">More</span>
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
              {MORE_NAV_ITEMS.map((item) => (
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
                <span className="text-sm font-medium text-foreground">Settings</span>
              </button>

              {/* Language toggle */}
              <button
                onClick={toggleLanguage}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-muted/50 transition-colors text-left"
              >
                <Globe className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                <span className="text-sm font-medium text-foreground">
                  Language: {language === "en" ? "English" : "Español"}
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
                <span className="text-sm font-semibold text-red-400">Sign Out</span>
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
