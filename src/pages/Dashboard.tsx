import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import ScriptsLogin from "@/components/ScriptsLogin";
import {
  Loader2, FileText, Target, CalendarDays, Users,
  Clapperboard, Database, Archive, Zap, UserPlus, Globe,
  BarChart3, Settings2, Calendar, Sparkles, ChevronLeft, Flame, Bot,
} from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { t, tr } from "@/i18n/translations";
import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import WelcomeSubscriptionModal from "@/components/WelcomeSubscriptionModal";
import SplashScreen from "@/components/SplashScreen";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
  }),
};

type FolderKey = "content" | "sales" | "setup";

export default function Dashboard() {
  const { user, loading, isAdmin, isUser, isVideographer, isEditor, isConnectaPlus, role, signOut, signInWithEmail, signUpWithEmail } = useAuth();
  // Detect just-paid BEFORE calling hooks (hooks can't be conditional)
  const [justPaid] = useState(() => {
    if (typeof window === "undefined") return false;
    return !!localStorage.getItem("connecta_just_paid");
  });
  // Skip the slow Stripe reconciliation if we just came from PaymentSuccess (it already verified)
  const { checking: subscriptionChecking, subscriptionData } = useSubscriptionGuard({ skipRedirect: true, skipReconcile: justPaid });
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
  const showClientSelector = isAdmin || isVideographer;

  // Listen for viewMode changes from sidebar
  useEffect(() => {
    const handler = (e: Event) => {
      const mode = (e as CustomEvent).detail;
      if (mode) setViewMode(mode);
    };
    window.addEventListener("viewModeChanged", handler);
    return () => window.removeEventListener("viewModeChanged", handler);
  }, []);

  // Fetch own client record for all roles (for "Me" mode)
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

  // Sync plan type from subscription guard (no duplicate edge function call)
  useEffect(() => {
    if (subscriptionChecking) return;
    if (loading || !user) return;
    if (isAdmin || isVideographer || isEditor || isConnectaPlus) return;

    if (subscriptionData.plan_type) {
      setUserPlanType(subscriptionData.plan_type);
    } else if (justPaidRef.current) {
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
      // Auto-initialize free tier for new users (no paywall)
      const initFreeTier = async () => {
        const { error } = await supabase.from("clients").insert({
          user_id: user.id,
          name: user.user_metadata?.full_name || user.email,
          email: user.email,
          plan_type: "free",
          subscription_status: "active",
          credits_balance: 250,
          credits_monthly_cap: 250,
          credits_used: 0,
          channel_scrapes_limit: 1,
          channel_scrapes_used: 0,
          lead_tracker_enabled: true,
          facebook_integration_enabled: true,
        });
        if (!error) {
          setUserPlanType("free");
        } else if (error.code === "23505") {
          // Row already exists (race condition) — just fetch and use it
          const { data: existing } = await supabase
            .from("clients")
            .select("plan_type")
            .eq("user_id", user.id)
            .maybeSingle();
          setUserPlanType(existing?.plan_type || "free");
        } else {
          console.error("Failed to initialize free tier:", error);
          setUserPlanType("free");
        }
      };
      initFreeTier();
    }
  }, [subscriptionChecking, subscriptionData, user, loading, isAdmin, isVideographer, isEditor, isConnectaPlus, navigate, welcomePlan]);

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
    : viewMode === "me" ? "Me"
    : clients.find(c => c.id === viewMode)?.name ?? "Client";

  // Folder cards definition
  const folderCards = [
    {
      key: "content" as FolderKey,
      label: "Content Creation",
      description: "Scripts · Vault · Editing Queue · Content Calendar",
      icon: Sparkles,
      color: "#0891B2",
    },
    {
      key: "sales" as FolderKey,
      label: "Sales",
      description: "Lead Tracker · Lead Calendar · AI Follow Up Builder",
      icon: BarChart3,
      color: "text-emerald-400",
    },
    {
      key: "setup" as FolderKey,
      label: "Client Set Up",
      description: "Onboarding · Public Booking · Landing Page · Master Database",
      icon: Settings2,
      color: "text-violet-400",
    },
  ];

  // Sub-cards with optional clientId for context-specific routes
  const getClientSubCards = (clientId: string | null) => ({
    content: [
      { label: "Connecta AI", description: language === "en" ? "AI-powered script planning canvas" : "Canvas de planificación con IA", icon: Bot, color: "text-orange-400", path: clientId ? `/clients/${clientId}/scripts?view=canvas` : "/scripts?view=canvas" },
      { label: "Scripts", description: language === "en" ? "Write and manage your scripts" : "Escribe y gestiona tus guiones", icon: FileText, color: "text-primary", path: clientId ? `/clients/${clientId}/scripts` : "/scripts" },
      { label: "Vault", description: language === "en" ? "Save and reuse video templates" : "Guarda y reutiliza plantillas de video", icon: Archive, color: "#0891B2", path: clientId ? `/clients/${clientId}/vault` : "/vault" },
      { label: "Editing Queue", description: language === "en" ? "Track your video editing tasks" : "Rastrea tus tareas de edición", icon: Clapperboard, color: "text-rose-400", path: clientId ? `/clients/${clientId}/editing-queue` : "/editing-queue" },
      { label: "Content Calendar", description: language === "en" ? "Plan and schedule your content" : "Planifica y programa tu contenido", icon: Calendar, color: "text-cyan-400", path: clientId ? `/clients/${clientId}/content-calendar` : "/content-calendar" },
    ],
    sales: [
      { label: "Lead Tracker", description: language === "en" ? "Track and manage your leads" : "Rastrea y gestiona tus leads", icon: Target, color: "text-emerald-400", path: clientId ? `/clients/${clientId}/leads` : "/leads" },
      { label: "Lead Calendar", description: language === "en" ? "Schedule and view lead activity" : "Programa y ve la actividad de leads", icon: CalendarDays, color: "text-violet-400", path: clientId ? `/clients/${clientId}/lead-calendar` : "/lead-calendar" },
      { label: "AI Follow Up Builder", description: language === "en" ? "Build automated follow-up flows" : "Crea flujos de seguimiento automatizados", icon: Zap, color: "#0891B2", path: clientId ? `/clients/${clientId}/workflow` : "/leads" },
    ],
    setup: [
      { label: "Onboarding", description: language === "en" ? "Complete your account setup" : "Completa la configuración de tu cuenta", icon: UserPlus, color: "text-primary", path: clientId ? `/onboarding/${clientId}` : "/onboarding" },
      { label: "Public Booking", description: language === "en" ? "Configure your booking page" : "Configura tu página de reservas", icon: Globe, color: "text-emerald-400", path: clientId ? `/clients/${clientId}/booking-settings` : "/dashboard" },
      { label: "Landing Page", description: language === "en" ? "View your public landing page" : "Ve tu página de destino pública", icon: Globe, color: "text-rose-400", path: clientId ? `/clients/${clientId}/landing-page` : "/", disabled: isSubscriber && userPlanType !== "enterprise" },
      { label: "Master Database", description: language === "en" ? "View all your leads and videos" : "Ve todos tus leads y videos", icon: Database, color: "text-cyan-400", path: isSubscriber ? "/master-database" : (clientId ? `/clients/${clientId}/database` : "/dashboard") },
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
        color: "text-rose-400",
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
          color: "text-primary",
          path: "/scripts",
        },
        {
          label: language === "en" ? "Master Edit Queue" : "Cola de Edición Master",
          description: language === "en" ? "All editing tasks across clients" : "Todas las tareas de edición",
          icon: Clapperboard,
          color: "text-rose-400",
          path: "/editing-queue",
        },
        ...(isAdmin ? [{
          label: language === "en" ? "Master Database" : "Base de Datos Principal",
          description: language === "en" ? "All leads and videos across all clients" : "Todos los leads y videos de todos los clientes",
          icon: Database,
          color: "text-cyan-400",
          path: "/master-database",
        }] : []),
      ];
    }
    return [];
  };

  const toolCards = getToolCards();

  if (loading || subscriptionChecking) {
    return (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
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

  const displayName = user.user_metadata?.full_name || user.email?.split("@")[0] || "User";
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
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-card" />

        {/* Faint cyan orb top-right */}
        <motion.div
          className="absolute w-[500px] h-[500px] rounded-full blur-3xl -top-48 -right-32"
          style={{ background: 'rgba(34,211,238,0.08)' }}
          animate={{ y: [0, 30, 0], x: [0, -15, 0] }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* Faint lime orb bottom-left */}
        <motion.div
          className="absolute w-[350px] h-[350px] rounded-full blur-3xl bottom-10 -left-24"
          style={{ background: 'rgba(163,230,53,0.04)' }}
          animate={{ y: [0, -25, 0], x: [0, 20, 0] }}
          transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Dot grid pattern */}
        <div className="absolute inset-0 opacity-[0.03] hidden md:block" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, hsl(var(--foreground)) 1px, transparent 0)`,
          backgroundSize: '40px 40px'
        }} />
      </div>

      <main className="flex-1 flex flex-col min-h-screen relative">

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
                      className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" /> Dashboard
                    </button>
                    <span className="text-muted-foreground/30">/</span>
                    {activeFolderData && (
                      <span className="text-sm font-medium" style={{ color: activeFolderData.color.startsWith('#') ? activeFolderData.color : undefined }}>{activeFolderData.label}</span>
                    )}
                  </motion.div>

                  <motion.h1
                    className="text-xl sm:text-2xl font-bold text-foreground mb-8 tracking-tight"
                    initial="hidden"
                    animate="visible"
                    custom={0}
                    variants={fadeUp}
                  >
                    {activeFolderData?.label}
                  </motion.h1>

                  <div className={`grid grid-cols-1 ${activeSubCards.length <= 2 ? 'sm:grid-cols-2 max-w-xl mx-auto' : activeSubCards.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-4'} gap-6`}>
                    {activeSubCards.map((card, i) => (
                      <motion.button
                        key={card.path}
                        onClick={() => !(card as any).disabled && navigate(card.path)}
                        className={`group flex flex-col items-center gap-5 p-8 text-center glass-card rounded-xl border-white/[0.04] hover:border-white/[0.08] hover:shadow-[0_0_30px_rgba(34,211,238,0.04)] transition-all duration-500 ${(card as any).disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                        initial="hidden"
                        animate="visible"
                        custom={i + 1}
                        variants={fadeUp}
                      >
                        <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(34,211,238,0.05)', border: '1px solid rgba(34,211,238,0.10)', boxShadow: 'none' }}>
                          <card.icon className="w-5 h-5 group-hover:text-primary transition-colors" style={{ color: card.color.startsWith('#') ? card.color : undefined }} />
                        </div>
                        <div>
                          <h2 className="text-sm font-bold text-foreground mb-1 tracking-tight">{card.label}</h2>
                          <p className="text-xs text-muted-foreground leading-relaxed">{card.description}</p>
                          {(card as any).disabled && (
                            <p className="text-[10px] text-muted-foreground/60 mt-1">{language === "en" ? "Enterprise plan only" : "Solo plan Enterprise"}</p>
                          )}
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <motion.p className="text-xs tracking-[0.3em] uppercase text-muted-foreground mb-2" initial="hidden" animate="visible" custom={0} variants={fadeUp}>
                    👋 {tr(t.dashboard.greeting, language)}, {displayName}
                  </motion.p>
                  <motion.h1 className="text-xl sm:text-2xl md:text-3xl font-bold mb-12 tracking-tight leading-[0.95] bg-gradient-to-r from-foreground via-foreground to-primary/70 bg-clip-text text-transparent" initial="hidden" animate="visible" custom={1} variants={fadeUp}>
                    {tr(t.dashboard.question, language)}
                  </motion.h1>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    {folderCards.map((folder, i) => (
                      <motion.button
                        key={folder.key}
                        onClick={() => setActiveFolder(folder.key)}
                        className="group flex flex-col items-center gap-5 p-8 text-center glass-card rounded-xl border-white/[0.04] hover:border-white/[0.08] hover:shadow-[0_0_30px_rgba(34,211,238,0.04)] transition-all duration-500"
                        initial="hidden"
                        animate="visible"
                        custom={i + 2}
                        variants={fadeUp}
                      >
                        <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(34,211,238,0.05)', border: '1px solid rgba(34,211,238,0.10)', boxShadow: 'none' }}>
                          <folder.icon className="w-5 h-5 group-hover:text-primary transition-colors" style={{ color: folder.color.startsWith('#') ? folder.color : undefined }} />
                        </div>
                        <div>
                          <h2 className="text-sm font-bold text-foreground mb-1 tracking-tight">{folder.label}</h2>
                          <p className="text-xs text-muted-foreground leading-relaxed">{folder.description}</p>
                        </div>
                      </motion.button>
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
                <motion.h1 className="text-xl sm:text-2xl md:text-3xl font-bold mb-12 tracking-tight leading-[0.95] bg-gradient-to-r from-foreground via-foreground to-primary/70 bg-clip-text text-transparent" initial="hidden" animate="visible" custom={1} variants={fadeUp}>
                  {tr(t.dashboard.question, language)}
                </motion.h1>

                <div className={`grid grid-cols-1 ${toolCards.length === 1 ? 'max-w-sm mx-auto' : toolCards.length === 2 ? 'sm:grid-cols-2 max-w-xl mx-auto' : 'sm:grid-cols-3'} gap-6`}>
                  {toolCards.map((tool, i) => (
                    <motion.button
                      key={tool.path}
                      onClick={() => navigate(tool.path)}
                      className="group flex flex-col items-center gap-5 p-8 text-center glass-card rounded-xl border-white/[0.04] hover:border-white/[0.08] hover:shadow-[0_0_30px_rgba(34,211,238,0.04)] transition-all duration-500"
                      initial="hidden"
                      animate="visible"
                      custom={i + 2}
                      variants={fadeUp}
                    >
                      <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(34,211,238,0.05)', border: '1px solid rgba(34,211,238,0.10)', boxShadow: 'none' }}>
                        <tool.icon className="w-5 h-5 group-hover:text-primary transition-colors" style={{ color: tool.color.startsWith('#') ? tool.color : undefined }} />
                      </div>
                      <div>
                        <h2 className="text-sm font-bold text-foreground mb-1 tracking-tight">{tool.label}</h2>
                        <p className="text-xs text-muted-foreground leading-relaxed">{tool.description}</p>
                      </div>
                    </motion.button>
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
                      className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" /> {selectedClientName}
                    </button>
                    <span className="text-muted-foreground/30">/</span>
                    {activeFolderData && (
                      <span className="text-sm font-medium" style={{ color: activeFolderData.color.startsWith('#') ? activeFolderData.color : undefined }}>{activeFolderData.label}</span>
                    )}
                  </motion.div>

                  <motion.h1
                    className="text-xl sm:text-2xl font-bold text-foreground mb-8 tracking-tight"
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
                    <div className={`grid grid-cols-1 ${activeSubCards.length <= 2 ? 'sm:grid-cols-2 max-w-xl mx-auto' : activeSubCards.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-4'} gap-6`}>
                      {activeSubCards.map((card, i) => (
                        <motion.button
                          key={card.path}
                          onClick={() => !(card as any).disabled && navigate(card.path)}
                          className={`group flex flex-col items-center gap-5 p-8 text-center glass-card rounded-xl border-white/[0.04] hover:border-white/[0.08] hover:shadow-[0_0_30px_rgba(34,211,238,0.04)] transition-all duration-500 ${(card as any).disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                          initial="hidden"
                          animate="visible"
                          custom={i + 1}
                          variants={fadeUp}
                        >
                          <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(34,211,238,0.05)', border: '1px solid rgba(34,211,238,0.10)', boxShadow: 'none' }}>
                            <card.icon className="w-5 h-5 group-hover:text-primary transition-colors" style={{ color: card.color.startsWith('#') ? card.color : undefined }} />
                          </div>
                          <div>
                            <h2 className="text-sm font-bold text-foreground mb-1 tracking-tight">{card.label}</h2>
                            <p className="text-xs text-muted-foreground leading-relaxed">{card.description}</p>
                            {(card as any).disabled && (
                              <p className="text-[10px] text-muted-foreground/60 mt-1">{language === "en" ? "Enterprise plan only" : "Solo plan Enterprise"}</p>
                            )}
                          </div>
                        </motion.button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <motion.p className="text-xs tracking-[0.3em] uppercase text-muted-foreground mb-2" initial="hidden" animate="visible" custom={0} variants={fadeUp}>
                    👋 {tr(t.dashboard.greeting, language)}, {displayName}
                  </motion.p>
                  <motion.h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground mb-4 tracking-tight leading-[0.95]" initial="hidden" animate="visible" custom={1} variants={fadeUp}>
                    {selectedClientName === "Me" ? "Your Account" : selectedClientName}
                  </motion.h1>
                  <motion.p className="text-xs text-muted-foreground mb-10" initial="hidden" animate="visible" custom={2} variants={fadeUp}>
                    {language === "en" ? "What do you want to work on?" : "¿En qué quieres trabajar?"}
                  </motion.p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    {folderCards.map((folder, i) => (
                      <motion.button
                        key={folder.key}
                        onClick={() => setActiveFolder(folder.key)}
                        className="group flex flex-col items-center gap-5 p-8 text-center glass-card rounded-xl border-white/[0.04] hover:border-white/[0.08] hover:shadow-[0_0_30px_rgba(34,211,238,0.04)] transition-all duration-500"
                        initial="hidden"
                        animate="visible"
                        custom={i + 3}
                        variants={fadeUp}
                      >
                        <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(34,211,238,0.05)', border: '1px solid rgba(34,211,238,0.10)', boxShadow: 'none' }}>
                          <folder.icon className="w-5 h-5 group-hover:text-primary transition-colors" style={{ color: folder.color.startsWith('#') ? folder.color : undefined }} />
                        </div>
                        <div>
                          <h2 className="text-sm font-bold text-foreground mb-1 tracking-tight">{folder.label}</h2>
                          <p className="text-xs text-muted-foreground leading-relaxed">{folder.description}</p>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </>
              )
            )}

          </div>
        </div>

      </main>
    </>
  );
}
