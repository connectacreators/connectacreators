import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
import { t, tr } from "@/i18n/translations";
import LanguageToggle from "@/components/LanguageToggle";
import { LogOut } from "lucide-react";

interface Props {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  hideOnMobile?: boolean;
}

export default function DashboardTopBar({ sidebarOpen, setSidebarOpen, hideOnMobile }: Props) {
  const { language } = useLanguage();
  const { signOut } = useAuth();

  return (
    <>
      {/* Mobile top bar */}
      {!hideOnMobile && (
        <div className="glass-topbar rounded-xl px-4 py-3 flex items-center gap-3 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="hover:opacity-80 transition-opacity focus:outline-none"
            aria-label="Open sidebar"
          >
            <span
              className="font-wordmark text-xl text-foreground"
              style={{ letterSpacing: "-0.022em", fontWeight: 700 }}
            >
              Connecta
            </span>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <LanguageToggle />
            <button
              onClick={signOut}
              className="p-2 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
              title={tr(t.dashboard.signOut, language)}
            >
              <LogOut className="w-4 h-4 text-red-400" />
            </button>
          </div>
        </div>
      )}
      {/* Desktop collapsed top bar — same wordmark as sidebar header,
          click re-opens the sidebar (matches the user's mental model
          rather than navigating away to the landing page). */}
      {!sidebarOpen && (
        <div className="glass-topbar rounded-xl px-4 py-3 hidden lg:flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="hover:opacity-80 transition-opacity focus:outline-none"
            aria-label="Open sidebar"
          >
            <span
              className="font-wordmark text-xl text-foreground"
              style={{ letterSpacing: "-0.022em", fontWeight: 700 }}
            >
              Connecta
            </span>
          </button>
        </div>
      )}
    </>
  );
}
