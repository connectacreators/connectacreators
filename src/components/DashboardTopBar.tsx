import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
import { t, tr } from "@/i18n/translations";
import LanguageToggle from "@/components/LanguageToggle";
import { ChevronRight, LogOut } from "lucide-react";

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
      {/* Mobile top bar — keeps the wordmark + controls because
          mobile has no persistent sidebar to lean on. */}
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
      {/* Desktop collapsed: small bone sticker pill with an ink chevron.
          Sits tight to the left margin, vertically below the page's
          back/header row so it doesn't clog the top-left toolbar. */}
      {!sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          aria-label="Open sidebar"
          className="hidden lg:flex items-center justify-center focus:outline-none"
          style={{
            position: "fixed",
            top: 64,
            left: 14,
            width: 30,
            height: 30,
            borderRadius: 8,
            background: "#EAE6DC",
            border: "1px solid #141414",
            boxShadow: "2px 2px 0 #141414",
            color: "#141414",
            zIndex: 60,
            transition: "box-shadow 120ms, transform 120ms",
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget;
            el.style.boxShadow = "3px 3px 0 #141414";
            el.style.transform = "translate(-1px,-1px)";
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget;
            el.style.boxShadow = "2px 2px 0 #141414";
            el.style.transform = "none";
          }}
        >
          <ChevronRight className="w-4 h-4" strokeWidth={2} />
        </button>
      )}
    </>
  );
}
