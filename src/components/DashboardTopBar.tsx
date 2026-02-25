import { useNavigate } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
import { t, tr } from "@/i18n/translations";
import ThemeToggle from "@/components/ThemeToggle";
import LanguageToggle from "@/components/LanguageToggle";
import { LogOut } from "lucide-react";

import connectaLoginLogo from "@/assets/connecta-login-logo.png";
import connectaLoginLogoDark from "@/assets/connecta-logo-dark.png";

interface Props {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

export default function DashboardTopBar({ sidebarOpen, setSidebarOpen }: Props) {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { language } = useLanguage();
  const { signOut } = useAuth();

  return (
    <>
      {/* Mobile top bar */}
      <div className="border-b border-border/50 px-4 py-3 flex items-center gap-3 lg:hidden">
        <button
          onClick={() => setSidebarOpen(true)}
          className="hover:opacity-80 transition-opacity focus:outline-none"
        >
          <img
            src={theme === "light" ? connectaLoginLogoDark : connectaLoginLogo}
            alt="Connecta"
            className="h-6 object-contain"
          />
        </button>
        <div className="ml-auto flex items-center gap-2">
          <LanguageToggle />
          <ThemeToggle />
          <button
            onClick={signOut}
            className="p-2 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
            title={tr(t.dashboard.signOut, language)}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
      {/* Desktop collapsed top bar */}
      {!sidebarOpen && (
        <div className="border-b border-border/50 px-4 py-3 hidden lg:flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="hover:opacity-80 transition-opacity focus:outline-none"
          >
            <img
              src={theme === "light" ? connectaLoginLogoDark : connectaLoginLogo}
              alt="Connecta"
              className="h-6 object-contain"
            />
          </button>
        </div>
      )}
    </>
  );
}
