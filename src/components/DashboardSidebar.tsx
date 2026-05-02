import { useNavigate } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
import { useCredits } from "@/hooks/useCredits";
import { t, tr } from "@/i18n/translations";
import LanguageToggle from "@/components/LanguageToggle";
import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  FileText, LogOut, Settings, Target, CalendarDays,
  Home, ChevronLeft, CreditCard, Users, Video, Archive, Clapperboard, BookOpen,
  Calendar, Flame, UserCheck, Zap, ChevronDown, Check, UserCircle, Bot, Clock, DollarSign,
} from "lucide-react";

import connectaTextLogo from "@/assets/connecta-logo-text-light.png";

interface Props {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  currentPath: string;
}

export default function DashboardSidebar({ sidebarOpen, setSidebarOpen, currentPath }: Props) {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { language } = useLanguage();
  const { user, signOut, isAdmin, isUser, isVideographer, isEditor, role } = useAuth();
  const { credits } = useCredits();
  const [ownClientId, setOwnClientId] = useState<string | null>(null);
  const [ownClientName, setOwnClientName] = useState<string | null>(null);

  // Client selector state — everyone except editors can switch between their clients
  const isSubscriber = !isAdmin && !isVideographer && !isEditor && !isUser;
  const showClientSelector = !isEditor;
  const [viewMode, setViewMode] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("dashboard_viewMode");
      if (stored) return stored;
    }
    // Subscribers and agency users default to "me", admins to "master"
    return (isUser || isSubscriber) ? "me" : "master";
  });
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [clientSelectorOpen, setClientSelectorOpen] = useState(false);
  const selectorRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [clientLimit, setClientLimit] = useState(5);
  const [addingClient, setAddingClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");

  // Sync viewMode when URL contains a client ID (e.g. navigating from Clients list)
  useEffect(() => {
    const match = currentPath.match(/^\/clients\/([^/]+)/);
    if (match) {
      const urlClientId = match[1];
      if (urlClientId && urlClientId !== viewMode) {
        setViewMode(urlClientId);
        localStorage.setItem("dashboard_viewMode", urlClientId);
      }
    }
  }, [currentPath]);

  // Fetch own client record via junction table
  useEffect(() => {
    if (!user) return;
    supabase
      .from("subscriber_clients")
      .select("client_id, clients(id, name)")
      .eq("subscriber_user_id", user.id)
      .eq("is_primary", true)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.client_id) {
          setOwnClientId(data.client_id);
          setOwnClientName((data as any).clients?.name ?? null);
        } else {
          supabase.from("clients").select("id, name").eq("user_id", user.id).maybeSingle()
            .then(({ data: fb }) => { if (fb) { setOwnClientId(fb.id); setOwnClientName(fb.name); } });
        }
      });
  }, [user]);

  // Fetch clients list for selector
  useEffect(() => {
    if (!user || !showClientSelector) return;

    if (isUser || isSubscriber) {
      // Fetch non-primary subscriber clients (primary shown as "My Brand" separately)
      supabase
        .from("subscriber_clients")
        .select("client_id, is_primary, clients(id, name)")
        .eq("subscriber_user_id", user.id)
        .eq("is_primary", false)
        .order("created_at")
        .then(({ data }) => {
          if (data) {
            setClients(data.map((d: any) => ({
              id: d.clients.id,
              name: d.clients.name,
            })));
          }
        });
    } else {
      supabase.from("clients").select("id, name").order("name")
        .then(({ data }) => { if (data) setClients(data); });
    }
  }, [user, showClientSelector, isUser, isSubscriber]);

  // Fetch subscriber client limit
  useEffect(() => {
    if (!user || (!isUser && !isSubscriber)) return;
    supabase
      .from("subscriptions")
      .select("client_limit")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.client_limit) setClientLimit(data.client_limit);
      });
  }, [user, isUser, isSubscriber]);

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

  // Sync viewMode to localStorage, broadcast change, and navigate to same feature for new client
  const handleViewModeChange = (mode: string) => {
    setViewMode(mode);
    setClientSelectorOpen(false);
    localStorage.setItem("dashboard_viewMode", mode);
    window.dispatchEvent(new CustomEvent("viewModeChanged", { detail: mode }));

    // Navigate to the equivalent route for the newly selected client
    const [pathname, search] = currentPath.split("?");
    const queryString = search ? `?${search}` : "";

    // Extract the feature segment from current path
    const clientPathMatch = pathname.match(/^\/clients\/[^/]+\/(.+)$/);
    const feature = clientPathMatch ? clientPathMatch[1] : pathname.replace(/^\//, "");

    // Only auto-navigate for features that have client-specific routes
    const clientFeatures = ["vault", "scripts", "editing-queue", "content-calendar", "leads", "booking-settings", "lead-calendar"];
    if (!clientFeatures.includes(feature)) return;

    const targetClientId = mode === "master" ? null : mode === "me" ? ownClientId : mode;

    if (targetClientId) {
      navigate(`/clients/${targetClientId}/${feature}${queryString}`);
    } else {
      // Master mode — navigate to master route if it exists
      const masterFeatures = ["vault", "scripts", "editing-queue", "content-calendar"];
      if (masterFeatures.includes(feature)) {
        navigate(`/${feature}${queryString}`);
      }
    }
  };

  const selectedClientName =
    viewMode === "master" ? "Master"
    : viewMode === "me" ? (ownClientName || clients.find(c => c.id === ownClientId)?.name || "My Brand")
    : (clients.find(c => c.id === viewMode)?.name ?? ownClientName ?? "Client");

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
        { label: "Connecta AI", icon: Bot, path: connectaAIPath },
        { label: language === "en" ? "Clients" : "Clientes", icon: Users, path: "/clients" },
        { label: "Vault", icon: Archive, path: "/vault" },
        { label: "Editing Queue", icon: Clapperboard, path: "/editing-queue" },
        { label: "Content Calendar", icon: Calendar, path: "/content-calendar" },
        { label: "Viral Today", icon: Flame, path: "/viral-today" },
        { label: language === "en" ? "Team Members" : "Equipo", icon: Video, path: "/videographers" },
        { label: "Subscribers", icon: UserCheck, path: "/subscribers" },
        { label: "Trainings", icon: BookOpen, path: "/trainings" },
        { label: "Finances", icon: DollarSign, path: "/finances" },
        { label: tr(t.subscription.navLabel, language), icon: CreditCard, path: "/subscription" },
        { label: tr(t.dashboard.settings, language), icon: Settings, path: "/settings" },
      ];
    }
    if (isVideographer) {
      return [
        { label: tr(t.dashboard.home, language), icon: Home, path: "/dashboard" },
        { label: "Connecta AI", icon: Bot, path: connectaAIPath },
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
        { label: "Content Calendar", icon: Calendar, path: "/content-calendar" },
        { label: "Viral Today", icon: Flame, path: "/viral-today" },
        { label: tr(t.dashboard.settings, language), icon: Settings, path: "/settings" },
      ];
    }
    if (isUser) {
      const selectedClientId = viewMode === "master" ? null : viewMode === "me" ? ownClientId : viewMode;
      return [
        { label: tr(t.dashboard.home, language), icon: Home, path: "/dashboard" },
        { label: language === "en" ? "My Clients" : "Mis Clientes", icon: Users, path: "/clients" },
        { label: "Connecta AI", icon: Bot, path: selectedClientId ? `/clients/${selectedClientId}/scripts?view=canvas` : "/scripts?view=canvas" },
        { label: tr(t.dashboard.scripts, language), icon: FileText, path: selectedClientId ? `/clients/${selectedClientId}/scripts` : "/scripts" },
        { label: "Editing Queue", icon: Clapperboard, path: selectedClientId ? `/clients/${selectedClientId}/editing-queue` : "/editing-queue" },
        { label: "Content Calendar", icon: Calendar, path: selectedClientId ? `/clients/${selectedClientId}/content-calendar` : "/content-calendar" },
        ...(selectedClientId ? [{ label: "Booking", icon: Clock, path: `/clients/${selectedClientId}/booking-settings` }] : []),
        { label: tr(t.dashboard.leadTracker, language), icon: Target, path: selectedClientId ? `/clients/${selectedClientId}/leads` : "/leads" },
        { label: "Viral Today", icon: Flame, path: "/viral-today" },
        { label: "Trainings", icon: BookOpen, path: "/trainings" },
        { label: tr(t.subscription.navLabel, language), icon: CreditCard, path: "/subscription" },
        { label: tr(t.dashboard.settings, language), icon: Settings, path: "/settings" },
      ];
    }
    // Client role + Connecta Plus (same nav)
    return [
      { label: tr(t.dashboard.home, language), icon: Home, path: "/dashboard" },
      { label: "Connecta AI", icon: Bot, path: ownClientId ? `/clients/${ownClientId}/scripts?view=canvas` : "/scripts?view=canvas" },
      { label: tr(t.dashboard.scripts, language), icon: FileText, path: ownClientId ? `/clients/${ownClientId}/scripts` : "/scripts" },
      { label: "Vault", icon: Archive, path: ownClientId ? `/clients/${ownClientId}/vault` : "/vault" },
      { label: "Editing Queue", icon: Clapperboard, path: ownClientId ? `/clients/${ownClientId}/editing-queue` : "/editing-queue" },
      { label: "Content Calendar", icon: Calendar, path: ownClientId ? `/clients/${ownClientId}/content-calendar` : "/content-calendar" },
      ...(ownClientId ? [{ label: "Booking", icon: Clock, path: `/clients/${ownClientId}/booking-settings` }] : []),
      { label: tr(t.dashboard.leadTracker, language), icon: Target, path: ownClientId ? `/clients/${ownClientId}/leads` : "/leads" },
      { label: tr(t.dashboard.leadCalendar, language), icon: CalendarDays, path: ownClientId ? `/clients/${ownClientId}/lead-calendar` : "/lead-calendar" },
      { label: "Viral Today", icon: Flame, path: "/viral-today" },
      { label: "Trainings", icon: BookOpen, path: "/trainings" },
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
      <div className="flex items-center gap-2 px-4 py-5 border-b border-[rgba(255,255,255,0.06)] relative z-10">
        <button onClick={() => navigate("/")} className="focus:outline-none">
          <img
            src={connectaTextLogo}
            alt="Connecta"
            className="h-6 object-contain hover:opacity-80 transition-opacity"
          />
        </button>
        <button
          onClick={() => setSidebarOpen(false)}
          className="ml-auto text-[#888888] hover:text-[#dddddd] transition-colors"
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
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: 'none',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.07)';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
            }}
          >
            <Users className="w-4 h-4 text-[#888888] flex-shrink-0" />
            <span className="flex-1 text-left truncate text-[#cccccc]">{selectedClientName}</span>
            {isUser && (
              <span style={{ fontSize: 10, color: '#888', marginRight: 4 }}>
                {clients.length}/{clientLimit}
              </span>
            )}
            <ChevronDown className={`w-3.5 h-3.5 text-[#888888] transition-transform duration-200 ${clientSelectorOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
      )}

      <nav className="flex-1 py-3 px-1.5 space-y-0.5 overflow-y-auto relative z-10" onMouseLeave={() => setHoveredItem(null)}>
        {navItems.map((item) => {
          const currentPathname = currentPath.split("?")[0];
          const itemPathname = item.path.split("?")[0];
          const itemHasQuery = item.path.includes("?");
          const isActive = itemHasQuery
            ? item.path === currentPath
            : itemPathname === currentPathname && !navItems.some(
                other => other !== item && other.path.split("?")[0] === itemPathname && other.path === currentPath
              );
          const isHovered = hoveredItem === item.label;
          // When something is hovered, only the hovered item shows active; otherwise the real active item does
          const showActive = hoveredItem ? isHovered : isActive;
          return (
            <button
              key={item.label}
              onClick={() => navigate(item.path)}
              onMouseEnter={() => setHoveredItem(item.label)}
              className={`w-full flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 relative ${
                showActive ? "text-[#22d3ee]" : "text-[#aaaaaa]"
              }`}
              style={showActive ? {
                background: 'linear-gradient(90deg, rgba(34,211,238,0.10) 0%, rgba(34,211,238,0.03) 60%, transparent 100%)',
              } : undefined}
            >
              {showActive && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full"
                  style={{
                    height: '60%',
                    background: '#22d3ee',
                    boxShadow: '0 0 10px rgba(34,211,238,0.4)',
                    animation: 'nav-indicator-in 0.45s cubic-bezier(0.25,0.46,0.45,0.94) forwards',
                  }}
                />
              )}
              <span
                key={`${item.label}-${showActive}`}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', animation: 'nav-blur-in 0.45s cubic-bezier(0.25,0.46,0.45,0.94) forwards' }}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="border-t border-[rgba(255,255,255,0.06)] p-3 space-y-1 relative z-10">
        {credits?.subscription_status === "trialing" && credits?.trial_ends_at && (() => {
          const daysLeft = Math.max(0, Math.ceil(
            (new Date(credits.trial_ends_at!).getTime() - Date.now()) / 86_400_000
          ));
          return (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-[10px] font-semibold text-amber-400/80 mt-1">
              <Clock className="w-3 h-3" />
              Trial — {daysLeft}d left
            </div>
          );
        })()}
        <div className="flex items-center gap-2 px-2">
          <LanguageToggle />
        </div>
        <button
          onClick={signOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-[#aaaaaa] hover:text-red-400/80 hover:bg-red-500/[0.04] transition-all duration-200"
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

          {/* Master — admin/videographer only */}
          {!isUser && (
          <button
            onClick={() => handleViewModeChange("master")}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all duration-150 rounded-t-xl"
            style={{ background: viewMode === "master" ? 'rgba(255,255,255,0.06)' : 'transparent' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = viewMode === "master" ? 'rgba(255,255,255,0.06)' : 'transparent'; }}
          >
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0" style={{ background: 'rgba(255,255,255,0.08)', color: '#22d3ee', border: '1px solid rgba(255,255,255,0.12)' }}>
              M
            </div>
            <span className="text-sm font-medium text-foreground flex-1">Master</span>
            {viewMode === "master" && <Check className="w-3.5 h-3.5 text-primary" />}
          </button>
          )}

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
              <span className="text-sm font-medium text-foreground flex-1">{isUser ? "My Brand" : "Me"}</span>
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

          {/* Subscriber: Add Client */}
          {isUser && !addingClient && clients.length < clientLimit && (
            <button
              onClick={(e) => { e.stopPropagation(); setAddingClient(true); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors rounded-b-xl"
              style={{ color: '#22d3ee' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{ fontSize: 16 }}>+</span>
              <span className="flex-1 text-left">{language === "en" ? "Add Client" : "Agregar Cliente"}</span>
              <span style={{ fontSize: 10, color: '#666' }}>{clientLimit - clients.length} left</span>
            </button>
          )}

          {isUser && addingClient && (
            <div className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
              <input
                autoFocus
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                placeholder={language === "en" ? "Client name..." : "Nombre del cliente..."}
                className="w-full px-2 py-1.5 rounded-md text-sm text-white bg-[rgba(255,255,255,0.08)] border border-[rgba(34,211,238,0.3)] outline-none"
                onKeyDown={async (e) => {
                  if (e.key === "Enter" && newClientName.trim()) {
                    const { data: clientId, error } = await supabase.rpc("create_client_for_subscriber", {
                      _name: newClientName.trim(),
                      _email: null,
                    });
                    if (!error && clientId) {
                      handleViewModeChange(clientId);
                      setNewClientName("");
                      setAddingClient(false);
                      window.dispatchEvent(new Event("clients-changed"));
                      supabase
                        .from("subscriber_clients")
                        .select("client_id, is_primary, clients(id, name)")
                        .eq("subscriber_user_id", user!.id)
                        .eq("is_primary", false)
                        .order("created_at")
                        .then(({ data }) => {
                          if (data) setClients(data.map((d: any) => ({ id: d.clients.id, name: d.clients.name })));
                        });
                    }
                  }
                  if (e.key === "Escape") {
                    setNewClientName("");
                    setAddingClient(false);
                  }
                }}
              />
              <div className="flex gap-1 mt-1">
                <button
                  onClick={async () => {
                    if (!newClientName.trim()) return;
                    const { data: clientId, error } = await supabase.rpc("create_client_for_subscriber", {
                      _name: newClientName.trim(),
                      _email: null,
                    });
                    if (!error && clientId) {
                      handleViewModeChange(clientId);
                      setNewClientName("");
                      setAddingClient(false);
                      window.dispatchEvent(new Event("clients-changed"));
                      supabase
                        .from("subscriber_clients")
                        .select("client_id, is_primary, clients(id, name)")
                        .eq("subscriber_user_id", user!.id)
                        .eq("is_primary", false)
                        .order("created_at")
                        .then(({ data }) => {
                          if (data) setClients(data.map((d: any) => ({ id: d.clients.id, name: d.clients.name })));
                        });
                    }
                  }}
                  className="flex-1 py-1 text-xs font-semibold rounded-md"
                  style={{ background: '#22d3ee', color: 'black' }}
                >
                  {language === "en" ? "Create" : "Crear"}
                </button>
                <button
                  onClick={() => { setNewClientName(""); setAddingClient(false); }}
                  className="flex-1 py-1 text-xs rounded-md"
                  style={{ background: 'rgba(255,255,255,0.08)', color: '#888' }}
                >
                  {language === "en" ? "Cancel" : "Cancelar"}
                </button>
              </div>
            </div>
          )}

          {isUser && clients.length >= clientLimit && (
            <div className="px-3 py-2 text-xs text-center rounded-b-xl" style={{ color: '#888' }}>
              {language === "en" ? "Client limit reached — " : "Límite alcanzado — "}
              <a href="/subscription" style={{ color: '#22d3ee' }}>
                {language === "en" ? "upgrade" : "mejorar plan"}
              </a>
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
