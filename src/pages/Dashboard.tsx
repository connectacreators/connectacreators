import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import ScriptsLogin from "@/components/ScriptsLogin";
import {
  Loader2, FileText, Target, CalendarDays, Users,
  Clapperboard, Database, Archive, Zap, UserPlus, Globe,
  BarChart3, Settings2, Calendar, Sparkles, ChevronLeft, Flame, Layers, ScrollText,
} from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { t, tr } from "@/i18n/translations";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import WelcomeSubscriptionModal from "@/components/WelcomeSubscriptionModal";
import SplashScreen from "@/components/SplashScreen";

import PageTransition from "@/components/PageTransition";
import { Skeleton } from "@/components/ui/skeleton";
import { ScribbleUnderline } from "@/components/ui/ScribbleUnderline";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: Math.min(i * 0.04, 0.2), duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
  }),
};

type FolderKey = "content" | "sales" | "setup";

function DashboardSkeleton() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6">
      <div className="max-w-3xl w-full">
        <div className="flex items-center gap-3 mb-10">
          <Skeleton className="w-9 h-9 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-2xl border border-border bg-card/50 p-5 space-y-3">
              <Skeleton className="w-9 h-9 rounded-xl" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, loading, isAdmin, isUser, isVideographer, isEditor, isConnectaPlus, role, signOut, signInWithEmail, signUpWithEmail } = useAuth();
  // Detect just-paid BEFORE calling hooks (hooks can't be conditional)
  const [justPaid] = useState(() => {
    if (typeof window === "undefined") return false;
    return !!localStorage.getItem("connecta_just_paid");
  });

  const navigate = useNavigate();
  const { language } = useLanguage();
  const [ownClientId, setOwnClientId] = useState<string | null>(null);
  const [activeFolder, setActiveFolder] = useState<FolderKey | null>(null);
  const [viewMode, setViewMode] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("dashboard_viewMode") || "master";
    }
    return "master";
  });
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomePlan, setWelcomePlan] = useState("starter");
  const [showSplash, setShowSplash] = useState(() => {
    if (sessionStorage.getItem("splash_shown")) return false;
    sessionStorage.setItem("splash_shown", "1");
    return true;
  });
  const [userPlanType, setUserPlanType] = useState<string | null>(null);
  const justPaidRef = useRef(false);

  // Show one-time welcome modal after successful payment
  useEffect(() => {
    const paid = localStorage.getItem("connecta_just_paid");
    if (paid) {
      justPaidRef.current = true;
      setWelcomePlan(paid);
      setShowWelcome(true);
      localStorage.removeItem("connecta_just_paid");
    }
  }, []);

  const isStaff = isAdmin || isVideographer;
  const isClientRole = !isAdmin && !isVideographer && !isEditor && !isUser;
  const isSubscriber = userPlanType === "free" || userPlanType === "starter" || userPlanType === "growth" || userPlanType === "enterprise";
  const showClientSelector = !isEditor;

  // Listen for viewMode changes from sidebar
  useEffect(() => {
    const handler = (e: Event) => {
      const mode = (e as CustomEvent).detail;
      if (mode) setViewMode(mode);
    };
    window.addEventListener("viewModeChanged", handler);
    return () => window.removeEventListener("viewModeChanged", handler);
  }, []);

  // Fetch own client record via junction table (for "Me" mode)
  useEffect(() => {
    if (!user) return;
    supabase
      .from("subscriber_clients")
      .select("client_id")
      .eq("subscriber_user_id", user.id)
      .eq("is_primary", true)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.client_id) {
          setOwnClientId(data.client_id);
        } else {
          // Fallback: direct user_id lookup
          supabase
            .from("clients")
            .select("id")
            .eq("user_id", user.id)
            .maybeSingle()
            .then(({ data: fallback }) => {
              if (fallback) setOwnClientId(fallback.id);
            });
        }
      });
  }, [user]);

  // Fetch clients list for selector
  useEffect(() => {
    if (!user || !showClientSelector) return;

    if (isUser) {
      // Subscribers: fetch via junction table
      supabase
        .from("subscriber_clients")
        .select("client_id, is_primary, clients(id, name)")
        .eq("subscriber_user_id", user.id)
        .order("is_primary", { ascending: false })
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
      // Admin/videographer: existing fetch
      supabase
        .from("clients")
        .select("id, name")
        .order("name")
        .then(({ data }) => {
          if (data) setClients(data);
        });
    }
  }, [user, showClientSelector, isUser]);

  // Sync plan type from DB (subscription guard removed)
  useEffect(() => {
    if (loading || !user) return;
    if (isAdmin || isVideographer || isEditor || isConnectaPlus) return;

    if (justPaidRef.current) {
      // Just paid but DB not updated yet — use the plan from payment flow
      justPaidRef.current = false;
      setUserPlanType(welcomePlan as string);
      // Trigger background reconciliation so credits get set up
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          supabase.functions.invoke("check-subscription", {
            headers: { Authorization: `Bearer ${session.access_token}` },
          }).catch(() => {});
        }
      });
    } else {
      // Check if client exists with a plan
      const checkExisting = async () => {
        let existing: any = null;
        if (ownClientId) {
          const { data } = await supabase
            .from("clients")
            .select("id, plan_type, subscription_status")
            .eq("id", ownClientId)
            .maybeSingle();
          existing = data;
        } else {
          const { data } = await supabase
            .from("clients")
            .select("id, plan_type, subscription_status")
            .eq("user_id", user.id)
            .maybeSingle();
          existing = data;
        }

        if (existing?.plan_type && ["active", "trialing", "canceling"].includes(existing.subscription_status || "")) {
          setUserPlanType(existing.plan_type);
        }
      };
      checkExisting();
    }
  }, [user, loading, isAdmin, isVideographer, isEditor, isConnectaPlus, welcomePlan, ownClientId]);

  // Reset folder when switching view mode
  useEffect(() => {
    setActiveFolder(null);
  }, [viewMode]);

  const selectedClientId =
    viewMode === "master" ? null
    : viewMode === "me" ? ownClientId
    : viewMode; // it's a client UUID


  const selectedClientName =
    viewMode === "master" ? "Master"
    : viewMode === "me" ? (isUser ? "My Brand" : "Me")
    : clients.find(c => c.id === viewMode)?.name ?? "Client";

  // Folder cards definition
  const folderCards = [
    {
      key: "content" as FolderKey,
      label: "Content Creation",
      description: "Scripts · Vault · Editing Queue · Content Calendar",
      icon: Sparkles,
      color: "#22d3ee",
    },
    {
      key: "sales" as FolderKey,
      label: "Sales",
      description: "Lead Tracker · Lead Calendar",
      icon: BarChart3,
      color: "#999999",
    },
    {
      key: "setup" as FolderKey,
      label: "Client Set Up",
      description: "Onboarding · Booking · Landing Page · Database",
      icon: Settings2,
      color: "#999999",
    },
  ];

  // Sub-cards with optional clientId for context-specific routes
  const getClientSubCards = (clientId: string | null) => ({
    content: [
      { label: "Super Canvas", description: language === "en" ? "AI-powered script planning canvas" : "Canvas de planificación con IA", icon: Layers, color: "#22d3ee", path: clientId ? `/clients/${clientId}/scripts?view=canvas` : "/scripts?view=canvas" },
      { label: "Scripts", description: language === "en" ? "View and manage scripts" : "Ver y gestionar guiones", icon: FileText, color: "#22d3ee", path: clientId ? `/clients/${clientId}/scripts` : "/scripts" },
      { label: "Vault", description: language === "en" ? "Script templates from viral videos" : "Plantillas de scripts de videos virales", icon: Archive, color: "#fbbf24", path: clientId ? `/clients/${clientId}/vault` : "/vault" },
      { label: "Editing Queue", description: language === "en" ? "Track video production status" : "Estado de producción de videos", icon: Clapperboard, color: "#fb7185", path: clientId ? `/clients/${clientId}/editing-queue` : "/editing-queue" },
      { label: language === "en" ? "Content Calendar" : "Calendario de Contenido", description: language === "en" ? "Schedule & approve posts" : "Programar y aprobar publicaciones", icon: Calendar, color: "#e879f9", path: clientId ? `/clients/${clientId}/content-calendar` : "/content-calendar" },
    ],
    sales: [
      { label: "Lead Tracker", description: language === "en" ? "Track incoming leads" : "Seguimiento de leads", icon: Target, color: "#34d399", path: clientId ? `/clients/${clientId}/leads` : "/leads" },
      { label: language === "en" ? "Lead Calendar" : "Calendario de Leads", description: language === "en" ? "Calendar view of leads" : "Vista de calendario de leads", icon: CalendarDays, color: "#a78bfa", path: clientId ? `/clients/${clientId}/lead-calendar` : "/lead-calendar" },
    ],
    setup: [
      { label: language === "en" ? "Content Strategy" : "Estrategia de Contenido", description: language === "en" ? "Goals, mix, ManyChat & fulfillment score" : "Metas, mezcla, ManyChat y puntuación", icon: BarChart3, color: "#22d3ee", path: clientId ? `/clients/${clientId}/strategy` : "/dashboard" },
      { label: language === "en" ? "Brand Setup" : "Configuración de Marca", description: language === "en" ? "Complete client onboarding form" : "Formulario completo de onboarding", icon: Sparkles, color: "#fbbf24", path: clientId ? `/onboarding/${clientId}` : "/onboarding" },
      { label: "Public Booking", description: language === "en" ? "Calendly-style public calendar" : "Calendario público tipo Calendly", icon: Globe, color: "#bbbbbb", path: clientId ? `/clients/${clientId}/booking-settings` : "/dashboard" },
      { label: "Landing Page", description: language === "en" ? "Build client's custom landing page" : "Construye la landing page del cliente", icon: Zap, color: "#34d399", path: clientId ? `/clients/${clientId}/landing-page` : "/", disabled: isSubscriber && userPlanType !== "enterprise" },
      { label: "Database", description: language === "en" ? "Direct database access" : "Acceso directo a base de datos", icon: Database, color: "#22d3ee", path: isSubscriber ? "/master-database" : (clientId ? `/clients/${clientId}/database` : "/dashboard") },
      { label: "Contracts", description: language === "en" ? "Upload, sign & send contracts" : "Sube, firma y envía contratos", icon: ScrollText, color: "#fbbf24", path: clientId ? `/clients/${clientId}/contracts` : "/dashboard" },
    ],
  });

  // Sub-cards for the client role (using ownClientId, unchanged)
  const subCards = getClientSubCards(ownClientId);

  const getToolCards = () => {
    if (isEditor) {
      return [{
        label: "Editing Queue",
        description: language === "en" ? "View and manage your assigned editing tasks" : "Ver y gestionar tus tareas de edición asignadas",
        icon: Clapperboard,
        color: "#bbbbbb",
        path: "/editing-queue",
      }];
    }
    // Master mode for admin/videographer/user — no Clients card
    if (isStaff || isUser) {
      return [
        {
          label: language === "en" ? "Master Scripts" : "Scripts Master",
          description: language === "en" ? "All scripts across your clients" : "Todos los guiones de tus clientes",
          icon: FileText,
          color: "#bbbbbb",
          path: "/scripts",
        },
        {
          label: language === "en" ? "Master Edit Queue" : "Cola de Edición Master",
          description: language === "en" ? "All editing tasks across clients" : "Todas las tareas de edición",
          icon: Clapperboard,
          color: "#bbbbbb",
          path: "/editing-queue",
        },
        ...(isAdmin ? [{
          label: language === "en" ? "Master Database" : "Base de Datos Principal",
          description: language === "en" ? "All leads and videos across all clients" : "Todos los leads y videos de todos los clientes",
          icon: Database,
          color: "#ffffff",
          path: "/master-database",
        }] : []),
      ];
    }
    return [];
  };

  const toolCards = getToolCards();

  if (loading) {
    return (
      <PageTransition className="flex-1 flex flex-col min-h-screen">
        <DashboardSkeleton />
      </PageTransition>
    );
  }

  if (!user) {
    return (
      <ScriptsLogin
        onSignIn={() => {}}
        signInWithEmail={signInWithEmail}
      />
    );
  }

  const authName = user.user_metadata?.full_name || user.email?.split("@")[0] || "User";
  // When viewing a specific client, greet by their name instead of the logged-in user's name
  // Only show client name when admin/videographer/user explicitly switches to a client view
  const displayName = (selectedClientId && viewMode !== "me" && showClientSelector)
    ? selectedClientName
    : authName;
  const activeFolderData = activeFolder ? folderCards.find(f => f.key === activeFolder) : null;

  // Determine which sub-cards to use for the current view
  const activeSubCards = activeFolder
    ? (isClientRole ? subCards[activeFolder] : getClientSubCards(selectedClientId)[activeFolder])
    : [];

  return (
    <>
      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}
      <WelcomeSubscriptionModal
        open={showWelcome}
        onClose={() => setShowWelcome(false)}
        planType={welcomePlan}
      />

      {/* Credits increased banner — show once for existing subscribers */}
      {(() => {
        const dismissed = typeof window !== "undefined" && localStorage.getItem("connecta_credits_banner_dismissed");
        if (dismissed || !isSubscriber || userPlanType === "free") return null;
        return (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-md w-full px-4">
            <div className="flex items-center gap-3 bg-[#0891B2]/15 border border-[#0891B2]/30 rounded-xl px-4 py-3 backdrop-blur-sm">
              <Zap className="w-5 h-5 text-[#0891B2] shrink-0" />
              <p className="text-sm text-foreground flex-1">
                {language === "en"
                  ? "Your credits have been increased! Enjoy more AI power."
                  : "¡Tus créditos han sido aumentados! Disfruta de más poder AI."}
              </p>
              <button
                onClick={() => {
                  localStorage.setItem("connecta_credits_banner_dismissed", "1");
                  // Force re-render by toggling a dummy state
                  setShowWelcome(false);
                }}
                className="text-muted-foreground hover:text-foreground text-lg leading-none"
              >
                ×
              </button>
            </div>
          </div>
        );
      })()}

      {/* Near-black background with faint orbs */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute inset-0" style={{ background: '#161616' }} />

        {/* Faint white orb top-right */}
        <motion.div
          className="absolute w-[500px] h-[500px] rounded-full blur-3xl -top-48 -right-32"
          style={{ background: 'rgba(255,255,255,0.03)' }}
          animate={{ y: [0, 30, 0], x: [0, -15, 0] }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* Faint white orb bottom-left */}
        <motion.div
          className="absolute w-[350px] h-[350px] rounded-full blur-3xl bottom-10 -left-24"
          style={{ background: 'rgba(255,255,255,0.02)' }}
          animate={{ y: [0, -25, 0], x: [0, 20, 0] }}
          transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Dot grid pattern */}
        <div className="absolute inset-0 opacity-[0.03] hidden md:block" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, hsl(var(--foreground)) 1px, transparent 0)`,
          backgroundSize: '40px 40px'
        }} />
      </div>

      <PageTransition className="flex-1 flex flex-col min-h-screen relative">

        <div className="flex-1 flex items-center justify-center px-6">
          <div className="max-w-3xl w-full text-center">

            {isClientRole ? (
              activeFolder ? (
                <div>
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3 }}
                    className="flex items-center gap-3 mb-8"
                  >
                    <button
                      onClick={() => setActiveFolder(null)}
                      className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-[#22d3ee] transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" /> Dashboard
                    </button>
                    <span className="text-muted-foreground/30">/</span>
                    {activeFolderData && (
                      <span className="text-sm font-medium" style={{ color: activeFolderData.color.startsWith('#') ? activeFolderData.color : undefined }}>{activeFolderData.label}</span>
                    )}
                  </motion.div>

                  <motion.h1
                    className="text-xl sm:text-2xl font-bold text-foreground mb-8 tracking-tight font-caslon"
                    initial="hidden"
                    animate="visible"
                    custom={0}
                    variants={fadeUp}
                  >
                    {activeFolderData?.label}
                  </motion.h1>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    {activeSubCards.map((card, i) => (
                      <motion.div key={card.path} initial="hidden" animate="visible" custom={i + 1} variants={fadeUp}>
                        <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[#141416] hover:border-[rgba(255,255,255,0.15)] transition-colors">
                          <button
                            onClick={() => !(card as any).disabled && navigate(card.path)}
                            className={`group flex flex-col items-center gap-5 p-8 sm:p-10 text-center w-full ${(card as any).disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                          >
                            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)' }}>
                              <card.icon className="w-6 h-6 text-muted-foreground group-hover:!text-[#22d3ee] transition-colors" />
                            </div>
                            <div>
                              <h2 className="text-sm font-bold text-foreground mb-1.5 tracking-tight font-caslon"><ScribbleUnderline>{card.label}</ScribbleUnderline></h2>
                              <p className="text-xs text-muted-foreground leading-relaxed">{card.description}</p>
                              {(card as any).disabled && (
                                <p className="text-[10px] text-muted-foreground/60 mt-1">{language === "en" ? "Enterprise plan only" : "Solo plan Enterprise"}</p>
                              )}
                            </div>
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <motion.p className="text-xs tracking-[0.3em] uppercase text-muted-foreground mb-2" initial="hidden" animate="visible" custom={0} variants={fadeUp}>
                    👋 {tr(t.dashboard.greeting, language)}, {displayName}
                  </motion.p>
                  <motion.h1 className="text-xl sm:text-2xl md:text-3xl font-bold mb-12 tracking-tight leading-[0.95] text-foreground font-caslon" initial="hidden" animate="visible" custom={1} variants={fadeUp}>
                    {tr(t.dashboard.question, language)}
                  </motion.h1>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    {folderCards.map((folder, i) => (
                      <motion.div key={folder.key} initial="hidden" animate="visible" custom={i + 2} variants={fadeUp}>
                        <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[#141416] hover:border-[rgba(255,255,255,0.15)] transition-colors">
                          <button
                            onClick={() => setActiveFolder(folder.key)}
                            className="group flex flex-col items-center gap-5 p-8 text-center w-full"
                          >
                            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)' }}>
                              <folder.icon className="w-5 h-5 text-muted-foreground group-hover:!text-[#22d3ee] transition-colors" />
                            </div>
                            <div>
                              <h2 className="text-sm font-bold text-foreground mb-1 tracking-tight font-caslon"><ScribbleUnderline>{folder.label}</ScribbleUnderline></h2>
                              <p className="text-xs text-muted-foreground leading-relaxed">{folder.description}</p>
                            </div>
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </>
              )
            ) : viewMode === "master" || isEditor ? (
              /* ===== MASTER MODE ===== */
              <>
                <motion.p className="text-xs tracking-[0.3em] uppercase text-muted-foreground mb-2" initial="hidden" animate="visible" custom={0} variants={fadeUp}>
                  👋 {tr(t.dashboard.greeting, language)}, {displayName}
                </motion.p>
                <motion.h1 className="text-xl sm:text-2xl md:text-3xl font-bold mb-12 tracking-tight leading-[0.95] text-foreground font-caslon" initial="hidden" animate="visible" custom={1} variants={fadeUp}>
                  {tr(t.dashboard.question, language)}
                </motion.h1>

                <div className={`grid grid-cols-1 ${toolCards.length === 1 ? 'max-w-sm mx-auto' : toolCards.length === 2 ? 'sm:grid-cols-2 max-w-xl mx-auto' : 'sm:grid-cols-3'} gap-6`}>
                  {toolCards.map((tool, i) => (
                    <motion.div key={tool.path} initial="hidden" animate="visible" custom={i + 2} variants={fadeUp}>
                      <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[#141416] hover:border-[rgba(255,255,255,0.15)] transition-colors">
                        <button
                          onClick={() => navigate(tool.path)}
                          className="group flex flex-col items-center gap-5 p-8 text-center w-full"
                        >
                          <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)' }}>
                            <tool.icon className="w-5 h-5 text-muted-foreground group-hover:!text-[#22d3ee] transition-colors" />
                          </div>
                          <div>
                            <h2 className="text-sm font-bold text-foreground mb-1 tracking-tight font-caslon"><ScribbleUnderline>{tool.label}</ScribbleUnderline></h2>
                            <p className="text-xs text-muted-foreground leading-relaxed">{tool.description}</p>
                          </div>
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </>
            ) : (
              /* ===== CLIENT / ME MODE: 3-folder view ===== */
              activeFolder ? (
                <div>
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3 }}
                    className="flex items-center gap-3 mb-8"
                  >
                    <button
                      onClick={() => setActiveFolder(null)}
                      className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-[#22d3ee] transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" /> {selectedClientName}
                    </button>
                    <span className="text-muted-foreground/30">/</span>
                    {activeFolderData && (
                      <span className="text-sm font-medium" style={{ color: activeFolderData.color.startsWith('#') ? activeFolderData.color : undefined }}>{activeFolderData.label}</span>
                    )}
                  </motion.div>

                  <motion.h1
                    className="text-xl sm:text-2xl font-bold text-foreground mb-8 tracking-tight font-caslon"
                    initial="hidden"
                    animate="visible"
                    custom={0}
                    variants={fadeUp}
                  >
                    {activeFolderData?.label}
                  </motion.h1>

                  {!selectedClientId ? (
                    <p className="text-sm text-muted-foreground">No client account found for your user.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      {activeSubCards.map((card, i) => (
                        <motion.div key={card.path} initial="hidden" animate="visible" custom={i + 1} variants={fadeUp}>
                          <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[#141416] hover:border-[rgba(255,255,255,0.15)] transition-colors">
                            <button
                              onClick={() => !(card as any).disabled && navigate(card.path)}
                              className={`group flex flex-col items-center gap-5 p-8 sm:p-10 text-center w-full ${(card as any).disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                            >
                              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)' }}>
                                <card.icon className="w-6 h-6 text-muted-foreground group-hover:!text-[#22d3ee] transition-colors" />
                              </div>
                              <div>
                                <h2 className="text-sm font-bold text-foreground mb-1.5 tracking-tight font-caslon"><ScribbleUnderline>{card.label}</ScribbleUnderline></h2>
                                <p className="text-xs text-muted-foreground leading-relaxed">{card.description}</p>
                                {(card as any).disabled && (
                                  <p className="text-[10px] text-muted-foreground/60 mt-1">{language === "en" ? "Enterprise plan only" : "Solo plan Enterprise"}</p>
                                )}
                              </div>
                            </button>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <motion.p className="text-xs tracking-[0.3em] uppercase text-muted-foreground mb-2" initial="hidden" animate="visible" custom={0} variants={fadeUp}>
                    👋 {tr(t.dashboard.greeting, language)}, {displayName}
                  </motion.p>
                  <motion.h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground mb-4 tracking-tight leading-[0.95] font-caslon" initial="hidden" animate="visible" custom={1} variants={fadeUp}>
                    {language === "en" ? "What do you want to do today?" : "¿Qué quieres hacer hoy?"}
                  </motion.h1>
                  <div className="mb-10" />

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    {folderCards.map((folder, i) => (
                      <motion.div key={folder.key} initial="hidden" animate="visible" custom={i + 3} variants={fadeUp}>
                        <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[#141416] hover:border-[rgba(255,255,255,0.15)] transition-colors">
                          <button
                            onClick={() => setActiveFolder(folder.key)}
                            className="group flex flex-col items-center gap-5 p-8 text-center w-full"
                          >
                            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)' }}>
                              <folder.icon className="w-5 h-5 text-muted-foreground group-hover:!text-[#22d3ee] transition-colors" />
                            </div>
                            <div>
                              <h2 className="text-sm font-bold text-foreground mb-1 tracking-tight font-caslon"><ScribbleUnderline>{folder.label}</ScribbleUnderline></h2>
                              <p className="text-xs text-muted-foreground leading-relaxed">{folder.description}</p>
                            </div>
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </>
              )
            )}

          </div>
        </div>

      </PageTransition>
    </>
  );
}
