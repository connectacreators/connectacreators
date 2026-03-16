import { useNavigate } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
import { useCredits } from "@/hooks/useCredits";
import { t, tr } from "@/i18n/translations";
import ThemeToggle from "@/components/ThemeToggle";
import LanguageToggle from "@/components/LanguageToggle";
import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  FileText, LogOut, Settings, Target, CalendarDays,
  Home, ChevronLeft, CreditCard, Users, Video, Archive, Clapperboard, BookOpen,
  Database, Calendar, Flame, UserCheck, Zap, ChevronDown, Check, UserCircle,
} from "lucide-react";

import connectaLoginLogo from "@/assets/connecta-logo-text-light.png";
import connectaLoginLogoDark from "@/assets/connecta-logo-text-dark.png";
import connectaKnightDark from "@/assets/connecta-logo-dark.svg";
import connectaKnightLight from "@/assets/connecta-logo-light.svg";

function ConnectaAIIcon({ className }: { className?: string }) {
  return (
    <>
      <img src={connectaKnightDark} className={`${className ?? ""} hidden dark:block`} alt="Connecta AI" style={{ objectFit: "contain" }} />
      <img src={connectaKnightLight} className={`${className ?? ""} block dark:hidden`} alt="Connecta AI" style={{ objectFit: "contain" }} />
    </>
  );
}

interface Props {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  currentPath: string;
}

export default function DashboardSidebar({ sidebarOpen, setSidebarOpen, currentPath }: Props) {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { language } = useLanguage();
  const { user, signOut, isAdmin, isUser, isVideographer, isEditor, isConnectaPlus, role } = useAuth();
  const { credits, percentUsed } = useCredits();
  const [ownClientId, setOwnClientId] = useState<string | null>(null);

  // Client selector state
  const showClientSelector = isAdmin || isVideographer || isUser;
  const [viewMode, setViewMode] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("dashboard_viewMode") || "master";
    }
    return "master";
  });
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [clientSelectorOpen, setClientSelectorOpen] = useState(false);
  const selectorRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);

  // Fetch own client record (for user and client roles)
  useEffect(() => {
    if (!user) return;
    supabase
      .from("clients")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setOwnClientId(data.id);
      });
  }, [user]);

  // Fetch clients list for selector
  useEffect(() => {
    if (!user || !showClientSelector) return;
    supabase
      .from("clients")
      .select("id, name")
      .order("name")
      .then(({ data }) => {
        if (data) setClients(data);
      });
  }, [user, showClientSelector]);

  // Close selector on outside click (check both trigger area and portal dropdown)
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (selectorRef.current?.contains(target)) return;
      // Check if click is inside the portaled dropdown
      const portal = document.getElementById("client-selector-portal");
      if (portal?.contains(target)) return;
      setClientSelectorOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Update dropdown position when opened
  useEffect(() => {
    if (clientSelectorOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 6, left: rect.left, width: rect.width });
    }
  }, [clientSelectorOpen]);

  // Sync viewMode to localStorage and broadcast change
  const handleViewModeChange = (mode: string) => {
    setViewMode(mode);
    setClientSelectorOpen(false);
    localStorage.setItem("dashboard_viewMode", mode);
    window.dispatchEvent(new CustomEvent("viewModeChanged", { detail: mode }));
  };

  const selectedClientName =
    viewMode === "master" ? "Master"
    : viewMode === "me" ? "Me"
    : clients.find(c => c.id === viewMode)?.name ?? "Client";

  const getInitials = (name: string) =>
    name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();

  // Compute the canvas path for "Connecta AI" based on selected viewMode client
  const connectaAIPath = (() => {
    if (viewMode === "master" || viewMode === "me") {
      const cid = viewMode === "me" ? ownClientId : null;
      return cid ? `/clients/${cid}/scripts?view=canvas` : "/scripts?view=canvas";
    }
    return `/clients/${viewMode}/scripts?view=canvas`;
  })();

  const getNavItems = () => {
    if (isAdmin) {
      return [
        { label: tr(t.dashboard.home, language), icon: Home, path: "/dashboard" },
        { label: "Connecta AI", icon: ConnectaAIIcon, path: connectaAIPath },
        { label: language === "en" ? "Clients" : "Clientes", icon: Users, path: "/clients" },
        { label: "Vault", icon: Archive, path: "/vault" },
        { label: "Editing Queue", icon: Clapperboard, path: "/editing-queue" },
        { label: "Content Calendar", icon: Calendar, path: "/content-calendar" },
        { label: "Viral Today", icon: Flame, path: "/viral-today" },
        { label: language === "en" ? "Team Members" : "Equipo", icon: Video, path: "/videographers" },
        { label: "Subscribers", icon: UserCheck, path: "/subscribers" },
        { label: "Trainings", icon: BookOpen, path: "/trainings" },
        { label: tr(t.subscription.navLabel, language), icon: CreditCard, path: "/subscription" },
        { label: tr(t.dashboard.settings, language), icon: Settings, path: "/settings" },
      ];
    }
    if (isVideographer) {
      return [
        { label: tr(t.dashboard.home, language), icon: Home, path: "/dashboard" },
        { label: language === "en" ? "Clients" : "Clientes", icon: Users, path: "/clients" },
        { label: "Editing Queue", icon: Clapperboard, path: "/editing-queue" },
        { label: "Viral Today", icon: Flame, path: "/viral-today" },
        { label: "Trainings", icon: BookOpen, path: "/trainings" },
        { label: tr(t.subscription.navLabel, language), icon: CreditCard, path: "/subscription" },
        { label: tr(t.dashboard.settings, language), icon: Settings, path: "/settings" },
      ];
    }
    if (isEditor) {
      return [
        { label: tr(t.dashboard.home, language), icon: Home, path: "/dashboard" },
        { label: "Editing Queue", icon: Clapperboard, path: "/editing-queue" },
        { label: "Viral Today", icon: Flame, path: "/viral-today" },
        { label: "Trainings", icon: BookOpen, path: "/trainings" },
        { label: tr(t.dashboard.settings, language), icon: Settings, path: "/settings" },
      ];
    }
    if (isUser) {
      return [
        { label: tr(t.dashboard.home, language), icon: Home, path: "/dashboard" },
        { label: "Connecta AI", icon: ConnectaAIIcon, path: ownClientId ? `/clients/${ownClientId}/scripts?view=canvas` : "/scripts?view=canvas" },
        { label: tr(t.dashboard.scripts, language), icon: FileText, path: ownClientId ? `/clients/${ownClientId}/scripts` : "/scripts" },
        { label: "Editing Queue", icon: Clapperboard, path: ownClientId ? `/clients/${ownClientId}/editing-queue` : "/editing-queue" },
        { label: "Content Calendar", icon: Calendar, path: ownClientId ? `/clients/${ownClientId}/content-calendar` : "/content-calendar" },
        { label: "Viral Today", icon: Flame, path: "/viral-today" },
        { label: tr(t.subscription.navLabel, language), icon: CreditCard, path: "/subscription" },
        { label: tr(t.dashboard.settings, language), icon: Settings, path: "/settings" },
      ];
    }
    // Client role + Connecta Plus (same nav)
    return [
      { label: tr(t.dashboard.home, language), icon: Home, path: "/dashboard" },
      { label: "Connecta AI", icon: ConnectaAIIcon, path: ownClientId ? `/clients/${ownClientId}/scripts?view=canvas` : "/scripts?view=canvas" },
      { label: tr(t.dashboard.scripts, language), icon: FileText, path: ownClientId ? `/clients/${ownClientId}/scripts` : "/scripts" },
      { label: "Vault", icon: Archive, path: ownClientId ? `/clients/${ownClientId}/vault` : "/vault" },
      { label: "Editing Queue", icon: Clapperboard, path: ownClientId ? `/clients/${ownClientId}/editing-queue` : "/editing-queue" },
      { label: "Content Calendar", icon: Calendar, path: ownClientId ? `/clients/${ownClientId}/content-calendar` : "/content-calendar" },
      { label: tr(t.dashboard.leadTracker, language), icon: Target, path: ownClientId ? `/clients/${ownClientId}/leads` : "/leads" },
      { label: tr(t.dashboard.leadCalendar, language), icon: CalendarDays, path: ownClientId ? `/clients/${ownClientId}/lead-calendar` : "/lead-calendar" },
      { label: tr(t.subscription.navLabel, language), icon: CreditCard, path: "/subscription" },
      { label: tr(t.dashboard.settings, language), icon: Settings, path: "/settings" },
    ];
  };

  const navItems = getNavItems();

  return (
    <>
    <aside
      className={`${
        sidebarOpen ? "w-56 translate-x-0" : "-translate-x-full lg:w-0 lg:translate-x-0 lg:overflow-hidden"
      } fixed lg:relative z-40 lg:z-auto transition-all duration-300 glass-sidebar flex flex-col flex-shrink-0 h-screen lg:sticky top-0`}
    >
      <div className="flex items-center gap-2 px-4 py-5 border-b border-border/50 relative z-10">
        <button onClick={() => navigate("/")} className="focus:outline-none gradient-brand p-0.5 rounded-lg shadow-[0_4px_12px_rgba(8,145,178,0.4)]">
          <img
            src={theme === "light" ? connectaLoginLogoDark : connectaLoginLogo}
            alt="Connecta"
            className="h-5 object-contain hover:opacity-80 transition-opacity rounded-md"
          />
        </button>
        <button
          onClick={() => setSidebarOpen(false)}
          className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Client Selector — glass dropdown, above nav */}
      {showClientSelector && (
        <div ref={selectorRef} className="px-2 pt-3 pb-1 relative z-10">
          <button
            ref={triggerRef}
            onClick={() => setClientSelectorOpen(v => !v)}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 relative overflow-hidden"
            style={{
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.14)',
              backdropFilter: 'blur(28px)',
              WebkitBackdropFilter: 'blur(28px)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.12)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(8,145,178,0.12)';
              e.currentTarget.style.borderColor = 'rgba(8,145,178,0.35)';
              e.currentTarget.style.boxShadow = '0 6px 24px rgba(0,0,0,0.2), 0 0 12px rgba(8,145,178,0.15), inset 0 1px 0 rgba(255,255,255,0.15)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.07)';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)';
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.12)';
            }}
          >
            <Users className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span className="flex-1 text-left truncate text-foreground">{selectedClientName}</span>
            <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ${clientSelectorOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
      )}

      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto relative z-10">
        {navItems.map((item) => {
          const isActive = item.path === currentPath;
          return (
            <button
              key={item.label}
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? "text-[#22d3ee] bg-[rgba(8,145,178,0.2)] border border-[rgba(8,145,178,0.35)] shadow-[0_0_16px_rgba(8,145,178,0.3)]"
                  : "text-[#94a3b8] hover:text-[#cbd5e1] hover:bg-[rgba(8,145,178,0.1)] border border-transparent"
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-border/50 p-3 space-y-1 relative z-10">
        {!isAdmin && credits && credits.credits_monthly_cap > 0 && (
          <button
            onClick={() => navigate("/subscription")}
            className="w-full px-2 py-2 rounded-lg hover:bg-white/5 hover:backdrop-blur-sm border border-transparent hover:border-white/10 transition-all text-left group"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                <Zap className="w-3.5 h-3.5 text-[#0891B2]" />
                {language === "en" ? "Credits" : "Créditos"}
              </span>
              <span className={`text-xs font-semibold tabular-nums ${percentUsed >= 90 ? "text-red-400" : percentUsed >= 75 ? "text-[#22d3ee]" : "text-foreground"}`}>
                {credits.credits_balance}/{credits.credits_monthly_cap}
              </span>
            </div>
            <div className="w-full h-1 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${percentUsed >= 90 ? "bg-red-400" : percentUsed >= 75 ? "bg-[#22d3ee]" : "bg-primary"}`}
                style={{ width: `${Math.max(2, 100 - percentUsed)}%` }}
              />
            </div>
          </button>
        )}
        <div className="flex items-center gap-2 px-2">
          <ThemeToggle />
          <LanguageToggle />
        </div>
        <button
          onClick={signOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/15 hover:backdrop-blur-sm border border-transparent hover:border-red-500/20 transition-all"
        >
          <LogOut className="w-4 h-4" />
          {tr(t.dashboard.signOut, language)}
        </button>
      </div>
    </aside>

      {/* Portal dropdown — rendered at body level so backdrop-filter blurs real content */}
      {clientSelectorOpen && dropdownPos && createPortal(
        <div
          id="client-selector-portal"
          className="rounded-xl"
          style={{
            position: 'fixed',
            top: dropdownPos.top,
            left: dropdownPos.left,
            width: dropdownPos.width,
            zIndex: 9999,
            background: 'rgba(18,18,22,0.45)',
            border: '1px solid rgba(255,255,255,0.16)',
            boxShadow: '0 12px 48px rgba(0,0,0,0.5), 0 0 1px rgba(255,255,255,0.1), inset 0 1px 0 rgba(255,255,255,0.1)',
            backdropFilter: 'blur(48px) saturate(1.4)',
            WebkitBackdropFilter: 'blur(48px) saturate(1.4)',
          }}
        >
          {/* Top gradient highlight */}
          <div className="absolute top-0 left-[10%] right-[10%] h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)' }} />

          {/* Master */}
          <button
            onClick={() => handleViewModeChange("master")}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all duration-150 rounded-t-xl"
            style={{ background: viewMode === "master" ? 'rgba(8,145,178,0.08)' : 'transparent' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = viewMode === "master" ? 'rgba(8,145,178,0.08)' : 'transparent'; }}
          >
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0" style={{ background: 'rgba(8,145,178,0.2)', color: '#22d3ee', boxShadow: '0 0 8px rgba(8,145,178,0.2)' }}>
              M
            </div>
            <span className="text-sm font-medium text-foreground flex-1">Master</span>
            {viewMode === "master" && <Check className="w-3.5 h-3.5 text-primary" />}
          </button>

          {/* Me */}
          {ownClientId && (
            <button
              onClick={() => handleViewModeChange("me")}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all duration-150"
              style={{ background: viewMode === "me" ? 'rgba(99,102,241,0.08)' : 'transparent' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = viewMode === "me" ? 'rgba(99,102,241,0.08)' : 'transparent'; }}
            >
              <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)', boxShadow: '0 0 8px rgba(99,102,241,0.12)' }}>
                <UserCircle className="w-3.5 h-3.5 text-indigo-400" />
              </div>
              <span className="text-sm font-medium text-foreground flex-1">Me</span>
              {viewMode === "me" && <Check className="w-3.5 h-3.5 text-primary" />}
            </button>
          )}

          {/* Divider */}
          {clients.length > 0 && (
            <div className="mx-3 my-1" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }} />
          )}

          {/* Client list */}
          <div className="max-h-48 overflow-y-auto py-0.5 rounded-b-xl">
            {clients.map(client => (
              <button
                key={client.id}
                onClick={() => handleViewModeChange(client.id)}
                className="w-full flex items-center gap-3 px-4 py-2 text-left transition-all duration-150"
                style={{ background: viewMode === client.id ? 'rgba(255,255,255,0.06)' : 'transparent' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = viewMode === client.id ? 'rgba(255,255,255,0.06)' : 'transparent'; }}
              >
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 text-muted-foreground" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
                  {getInitials(client.name)}
                </div>
                <span className="text-sm text-foreground/90 flex-1 truncate">{client.name}</span>
                {viewMode === client.id && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
