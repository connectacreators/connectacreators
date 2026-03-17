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
  const showClientSelector = isAdmin || isVideographer || isUser;

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

  // Subscription check (for non-admin/videographer/editor/connectaPlus client roles)
  useEffect(() => {
    if (justPaidRef.current) return;
    if (loading || !user) return;
    if (isAdmin || isVideographer || isEditor || isConnectaPlus) return;
    supabase
      .from("clients")
      .select("plan_type, subscription_status")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data || !data.plan_type) {
          navigate("/select-plan");
        } else if (
          data.subscription_status !== "active" &&
          data.subscription_status !== "trialing" &&
          data.subscription_status !== "trial" &&
          data.subscription_status !== "pending_contact" &&
          data.subscription_status !== "canceling" &&
          data.subscription_status !== "connecta_plus"
        ) {
          navigate("/select-plan");
        }
      });
  }, [user, loading, isAdmin, isVideographer, isEditor, isConnectaPlus, role, navigate]);

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
      { label: "Landing Page", description: language === "en" ? "View your public landing page" : "Ve tu página de destino pública", icon: Globe, color: "text-rose-400", path: clientId ? `/clients/${clientId}/landing-page` : "/" },
      { label: "Master Database", description: language === "en" ? "View all your leads and videos" : "Ve todos tus leads y videos", icon: Database, color: "text-cyan-400", path: clientId ? `/clients/${clientId}/database` : "/dashboard" },
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

  if (loading) {
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
        signUpWithEmail={signUpWithEmail}
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
      <WelcomeSubscriptionModal
        open={showWelcome}
        onClose={() => setShowWelcome(false)}
        planType={welcomePlan}
      />

      {/* Background glows */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-[-100px] right-[-150px] w-[800px] h-[600px] rounded-full opacity-[0.08] blur-[180px]" style={{ background: `rgba(8,145,178,0.6)` }} />
        <div className="absolute bottom-[-200px] left-[-100px] w-[600px] h-[700px] rounded-full opacity-[0.06] blur-[160px]" style={{ background: `rgba(132,204,22,0.4)` }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1200px] h-[900px] rounded-full opacity-[0.03] blur-[200px]" style={{ background: `radial-gradient(circle, rgba(8,145,178,0.8), rgba(0,0,0,0.1))` }} />
      </div>

      <main className="flex-1 flex flex-col min-h-screen relative">

        <div className="flex-1 flex items-center justify-center px-6">
          <div className="max-w-3xl w-full text-center">

            {/* ===== SUBSCRIBER (isUser): 3 direct cards only ===== */}
            {isUser ? (
              <>
                <motion.p className="text-xs tracking-[0.3em] uppercase text-muted-foreground mb-2" initial="hidden" animate="visible" custom={0} variants={fadeUp}>
                  👋 {tr(t.dashboard.greeting, language)}, {displayName}
                </motion.p>
                <motion.h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground mb-12 tracking-tight leading-[0.95]" initial="hidden" animate="visible" custom={1} variants={fadeUp}>
                  {tr(t.dashboard.question, language)}
                </motion.h1>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-3xl mx-auto">
                  {[
                    { label: "Connecta AI", description: language === "en" ? "AI-powered script planning canvas" : "Canvas de planificación con IA", icon: Bot, color: "text-orange-400", path: ownClientId ? `/clients/${ownClientId}/scripts?view=canvas` : "/scripts?view=canvas" },
                    { label: language === "en" ? "Scripts" : "Guiones", description: language === "en" ? "Write and manage your scripts" : "Escribe y gestiona tus guiones", icon: FileText, color: "text-primary", path: ownClientId ? `/clients/${ownClientId}/scripts` : "/scripts" },
                    { label: "Editing Queue", description: language === "en" ? "Track your video editing tasks" : "Rastrea tus tareas de edición", icon: Clapperboard, color: "text-rose-400", path: ownClientId ? `/clients/${ownClientId}/editing-queue` : "/editing-queue" },
                    { label: "Content Calendar", description: language === "en" ? "Plan and schedule your content" : "Planifica y programa tu contenido", icon: Calendar, color: "text-cyan-400", path: ownClientId ? `/clients/${ownClientId}/content-calendar` : "/content-calendar" },
                  ].map((card, i) => (
                    <motion.button
                      key={card.path}
                      onClick={() => navigate(card.path)}
                      className="group flex flex-col items-center gap-5 p-8 text-center glass-card rounded-xl"
                      initial="hidden"
                      animate="visible"
                      custom={i + 2}
                      variants={fadeUp}
                    >
                      <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)' }}>
                        <card.icon className="w-5 h-5 group-hover:text-primary transition-colors" style={{ color: card.color.startsWith('#') ? card.color : undefined }} />
                      </div>
                      <div>
                        <h2 className="text-sm font-bold text-foreground mb-1 tracking-tight">{card.label}</h2>
                        <p className="text-xs text-muted-foreground leading-relaxed">{card.description}</p>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </>
            ) : isClientRole ? (
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
                        onClick={() => navigate(card.path)}
                        className="group flex flex-col items-center gap-5 p-8 text-center glass-card rounded-xl"
                        initial="hidden"
                        animate="visible"
                        custom={i + 1}
                        variants={fadeUp}
                      >
                        <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)' }}>
                          <card.icon className="w-5 h-5 group-hover:text-primary transition-colors" style={{ color: card.color.startsWith('#') ? card.color : undefined }} />
                        </div>
                        <div>
                          <h2 className="text-sm font-bold text-foreground mb-1 tracking-tight">{card.label}</h2>
                          <p className="text-xs text-muted-foreground leading-relaxed">{card.description}</p>
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
                  <motion.h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground mb-12 tracking-tight leading-[0.95]" initial="hidden" animate="visible" custom={1} variants={fadeUp}>
                    {tr(t.dashboard.question, language)}
                  </motion.h1>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    {folderCards.map((folder, i) => (
                      <motion.button
                        key={folder.key}
                        onClick={() => setActiveFolder(folder.key)}
                        className="group flex flex-col items-center gap-5 p-8 text-center glass-card rounded-xl"
                        initial="hidden"
                        animate="visible"
                        custom={i + 2}
                        variants={fadeUp}
                      >
                        <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)' }}>
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
            ) : viewMode === "master" ? (
              /* ===== MASTER MODE ===== */
              <>
                <motion.p className="text-xs tracking-[0.3em] uppercase text-muted-foreground mb-2" initial="hidden" animate="visible" custom={0} variants={fadeUp}>
                  👋 {tr(t.dashboard.greeting, language)}, {displayName}
                </motion.p>
                <motion.h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground mb-12 tracking-tight leading-[0.95]" initial="hidden" animate="visible" custom={1} variants={fadeUp}>
                  {tr(t.dashboard.question, language)}
                </motion.h1>

                <div className={`grid grid-cols-1 ${toolCards.length === 1 ? 'max-w-sm mx-auto' : toolCards.length === 2 ? 'sm:grid-cols-2 max-w-xl mx-auto' : 'sm:grid-cols-3'} gap-6`}>
                  {toolCards.map((tool, i) => (
                    <motion.button
                      key={tool.path}
                      onClick={() => navigate(tool.path)}
                      className="group flex flex-col items-center gap-5 p-8 text-center glass-card rounded-xl"
                      initial="hidden"
                      animate="visible"
                      custom={i + 2}
                      variants={fadeUp}
                    >
                      <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)' }}>
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
                          onClick={() => navigate(card.path)}
                          className="group flex flex-col items-center gap-5 p-8 text-center glass-card rounded-xl"
                          initial="hidden"
                          animate="visible"
                          custom={i + 1}
                          variants={fadeUp}
                        >
                          <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)' }}>
                            <card.icon className="w-5 h-5 group-hover:text-primary transition-colors" style={{ color: card.color.startsWith('#') ? card.color : undefined }} />
                          </div>
                          <div>
                            <h2 className="text-sm font-bold text-foreground mb-1 tracking-tight">{card.label}</h2>
                            <p className="text-xs text-muted-foreground leading-relaxed">{card.description}</p>
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
                        className="group flex flex-col items-center gap-5 p-8 text-center glass-card rounded-xl"
                        initial="hidden"
                        animate="visible"
                        custom={i + 3}
                        variants={fadeUp}
                      >
                        <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)' }}>
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
