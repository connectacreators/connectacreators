import { useState, useEffect } from "react";
import PageTransition from "@/components/PageTransition";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { Loader2, ArrowLeft, Zap, Mail, AlertCircle, CheckCircle2, CheckCircle, XCircle, Clock, TrendingUp, Pause, Play, Settings, Eye, EyeOff, Save } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { followupWorker } from "@/workers/followupWorker";
import FollowUpWorkflowBuilder from "@/components/workflow/FollowUpWorkflowBuilder";
import type { Lead } from "@/services/leadService";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
  }),
};

export default function ClientFollowUpAutomation() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const { user, loading, isAdmin } = useAuth();
  const { language } = useLanguage();

  const [clientName, setClientName] = useState("");
  const [loadingData, setLoadingData] = useState(false);
  const [automationEnabled, setAutomationEnabled] = useState(true);

  // Lead statistics
  const [stats, setStats] = useState({
    totalActive: 0,
    pendingFollowUp: 0,
    sentToday: 0,
    booked: 0,
  });

  // Active leads
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [leadMessages, setLeadMessages] = useState<any[]>([]);

  // Worker health
  const [workerHealth, setWorkerHealth] = useState({
    leadsPending: 0,
    nextLeads: [] as Array<{ id: string; name: string; dueAt: string }>,
  });

  // SMTP settings
  const [smtpEmail, setSmtpEmail] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [fromName, setFromName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpLoaded, setSmtpLoaded] = useState(false);

  // Facebook connection
  const [fbPages, setFbPages] = useState<Array<{ page_id: string; page_name: string; is_subscribed: boolean }>>([]);
  const [fbLoading, setFbLoading] = useState(false);
  const [fbConnecting, setFbConnecting] = useState(false);
  const [fbSubscribing, setFbSubscribing] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user && !isAdmin) {
      navigate("/dashboard");
    }
  }, [loading, user, isAdmin, navigate]);

  useEffect(() => {
    if (!clientId || !user) return;
    loadSmtpSettings();
    loadData();
    loadFbPages();

    // Refresh stats every 10 seconds
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [clientId, user]);

  const loadData = async () => {
    setLoadingData(true);
    try {
      // Load client name
      const { data: client } = await supabase.from("clients").select("name").eq("id", clientId).single();
      if (client) setClientName(client.name);

      // Load leads statistics
      const { data: leads } = await supabase
        .from("leads")
        .select("*")
        .eq("client_id", clientId);

      if (leads) {
        const totalActive = leads.filter((l) => !l.stopped && !l.booked).length;
        const pendingFollowUp = leads.filter(
          (l) => !l.stopped && !l.booked && new Date(l.next_follow_up_at || 0) <= new Date()
        ).length;
        const booked = leads.filter((l) => l.booked).length;
        const sentToday = leads.filter((l) => {
          const contactDate = new Date(l.last_contacted_at || 0);
          const today = new Date();
          return (
            contactDate.toDateString() === today.toDateString() &&
            (l.follow_up_step ?? 0) > 0
          );
        }).length;

        setStats({ totalActive, pendingFollowUp, sentToday, booked });

        // Show first active lead
        if (leads.length > 0) {
          setActiveLead(leads[0]);
          await loadLeadMessages(leads[0].id);
        }
      }

      // Load worker health
      const health = await followupWorker.getWorkerHealth();
      setWorkerHealth(health);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoadingData(false);
    }
  };

  const loadLeadMessages = async (leadId: string) => {
    try {
      const { data } = await supabase.from("messages").select("*").eq("lead_id", leadId).order("created_at", {
        ascending: false,
      });
      setLeadMessages(data || []);
    } catch (error) {
      console.error("Error loading messages:", error);
    }
  };

  const loadSmtpSettings = async () => {
    if (!clientId) return;
    try {
      const { data } = await supabase
        .from("client_email_settings")
        .select("smtp_email, smtp_password, from_name")
        .eq("client_id", clientId)
        .maybeSingle();
      if (data) {
        setSmtpEmail(data.smtp_email || "");
        setSmtpPassword(data.smtp_password || "");
        setFromName(data.from_name || "");
      }
      setSmtpLoaded(true);
    } catch (err) {
      console.error("Error loading SMTP settings:", err);
      setSmtpLoaded(true);
    }
  };

  const saveSmtpSettings = async () => {
    if (!clientId || !smtpEmail || !smtpPassword) {
      toast.error("Email and password are required");
      return;
    }
    setSmtpSaving(true);
    try {
      const { error } = await supabase
        .from("client_email_settings")
        .upsert(
          { client_id: clientId, smtp_email: smtpEmail, smtp_password: smtpPassword, from_name: fromName },
          { onConflict: "client_id" }
        );
      if (error) throw error;
      toast.success("Email settings saved");
    } catch (err) {
      toast.error("Failed to save email settings");
      console.error(err);
    } finally {
      setSmtpSaving(false);
    }
  };

  const loadFbPages = async () => {
    if (!clientId) return;
    setFbLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("facebook-oauth", {
        body: { action: "get_pages", client_id: clientId },
      });
      if (error) throw error;
      setFbPages(data?.pages || []);
    } catch (err) {
      console.error("Error loading Facebook pages:", err);
    } finally {
      setFbLoading(false);
    }
  };

  const connectFacebook = async () => {
    if (!clientId) return;
    setFbConnecting(true);
    try {
      // get_url uses GET with query params (not POST)
      const fnUrl = `https://hxojqrilwhhrvloiwmfo.supabase.co/functions/v1/facebook-oauth?action=get_url&client_id=${clientId}`;
      const resp = await fetch(fnUrl, {
        headers: { "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4b2pxcmlsd2hocnZsb2l3bWZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NDI2ODIsImV4cCI6MjA4NzIxODY4Mn0.rE0InfGUiq-Xl7DSJVWoaem_zQ_LnIzhDFzzLQ5k54k" },
      });
      const data = await resp.json();

      const authUrl = data?.url;
      if (!authUrl) throw new Error("No auth URL returned");

      const popup = window.open(authUrl, "facebook-auth", "width=600,height=700,scrollbars=yes");

      const handleMessage = (event: MessageEvent) => {
        if (event.data?.type === "FACEBOOK_AUTH_SUCCESS") {
          window.removeEventListener("message", handleMessage);
          popup?.close();
          loadFbPages();
          toast.success("Facebook account connected!");
          setFbConnecting(false);
        } else if (event.data?.type === "FACEBOOK_AUTH_ERROR") {
          window.removeEventListener("message", handleMessage);
          popup?.close();
          toast.error(event.data.error || "Facebook connection failed");
          setFbConnecting(false);
        }
      };
      window.addEventListener("message", handleMessage);

      // Timeout fallback
      setTimeout(() => {
        window.removeEventListener("message", handleMessage);
        if (fbConnecting) setFbConnecting(false);
      }, 120000);
    } catch (err) {
      toast.error("Failed to start Facebook connection");
      console.error(err);
      setFbConnecting(false);
    }
  };

  const toggleWebhookSubscription = async (page: { page_id: string; page_name: string; is_subscribed: boolean }) => {
    setFbSubscribing(page.page_id);
    try {
      const action = page.is_subscribed ? "unsubscribe_webhook" : "subscribe_webhook";
      const { data, error } = await supabase.functions.invoke("facebook-oauth", {
        body: { action, client_id: clientId, page_id: page.page_id },
      });
      if (error) throw error;
      toast.success(page.is_subscribed ? `Unsubscribed ${page.page_name}` : `${page.page_name} will now receive leads`);
      await loadFbPages();
    } catch (err) {
      toast.error("Failed to update webhook subscription");
      console.error(err);
    } finally {
      setFbSubscribing(null);
    }
  };

  const toggleAutomation = () => {
    setAutomationEnabled(!automationEnabled);
    toast.success(
      automationEnabled
        ? language === "en"
          ? "Follow-up automation paused"
          : "Automatización de seguimiento pausada"
        : language === "en"
          ? "Follow-up automation enabled"
          : "Automatización de seguimiento habilitada"
    );
  };

  const handleTriggerWorkerNow = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("process-followup-queue");
      if (error) throw error;
      const result = data || {};
      toast.success(
        `${result.successful || 0} leads processed${result.failed > 0 ? `, ${result.failed} failed` : ""}`
      );
      await loadData();
    } catch (error) {
      toast.error("Error triggering worker");
      console.error(error);
    }
  };

  if (loading) {
    return (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
    );
  }

  return (

      <PageTransition className="flex-1 flex flex-col min-h-screen">

        <div className="flex-1 px-6 py-8 overflow-y-auto">
          <div className="max-w-6xl mx-auto">
            {/* Header */}
            <motion.button
              onClick={() => navigate(`/clients/${clientId}`)}
              className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors mb-6"
              initial="hidden"
              animate="visible"
              custom={0}
              variants={fadeUp}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to client
            </motion.button>

            <motion.div
              className="flex items-center justify-between mb-8"
              initial="hidden"
              animate="visible"
              custom={1}
              variants={fadeUp}
            >
              <div className="flex items-center gap-3">
                <Zap className="w-6 h-6 text-purple-400" />
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                    {language === "en" ? "AI Follow-Up Automation" : "Automatización de Seguimiento con IA"}
                  </h1>
                  <p className="text-xs text-muted-foreground mt-1">{clientName}</p>
                </div>
              </div>
              <Button
                variant={automationEnabled ? "default" : "outline"}
                onClick={toggleAutomation}
                className="gap-2"
              >
                {automationEnabled ? (
                  <>
                    <Pause className="w-4 h-4" />
                    {language === "en" ? "Pause" : "Pausar"}
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    {language === "en" ? "Enable" : "Habilitar"}
                  </>
                )}
              </Button>
            </motion.div>

            {/* Status Alert */}
            {!automationEnabled && (
              <motion.div
                className="mb-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-3"
                initial="hidden"
                animate="visible"
                custom={2}
                variants={fadeUp}
              >
                <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-200">
                  {language === "en"
                    ? "Follow-up automation is paused. No messages will be sent until enabled."
                    : "La automatización de seguimiento está pausada. No se enviarán mensajes hasta que se habilite."}
                </div>
              </motion.div>
            )}

            {/* Facebook Connection */}
            <motion.div
              className="mb-6 bg-background/50 border border-border/30 rounded-lg p-6"
              initial="hidden"
              animate="visible"
              custom={3}
              variants={fadeUp}
            >
              <h2 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
                <div className="w-5 h-5 rounded flex items-center justify-center" style={{ backgroundColor: "#1877F2" }}>
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                </div>
                {language === "en" ? "Facebook Lead Ads" : "Facebook Lead Ads"}
              </h2>
              <p className="text-xs text-muted-foreground mb-5">
                {language === "en"
                  ? "Connect your Facebook Business account to automatically receive leads from your ad forms."
                  : "Conecta tu cuenta de Facebook Business para recibir leads automáticamente de tus formularios de anuncios."}
              </p>

              {fbLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              ) : (
                <div className="space-y-4">
                  {fbPages.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        {language === "en" ? "Connected Pages" : "Páginas Conectadas"}
                      </p>
                      {fbPages.map((page) => (
                        <div key={page.page_id} className="flex items-center justify-between p-3 bg-background rounded-lg border border-border/30">
                          <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${page.is_subscribed ? "bg-green-400" : "bg-gray-500"}`} />
                            <div>
                              <p className="text-sm font-medium text-foreground">{page.page_name}</p>
                              <p className="text-xs text-muted-foreground">
                                {page.is_subscribed
                                  ? (language === "en" ? "Receiving leads" : "Recibiendo leads")
                                  : (language === "en" ? "Not subscribed" : "Sin suscripción")}
                              </p>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant={page.is_subscribed ? "outline" : "default"}
                            onClick={() => toggleWebhookSubscription(page)}
                            disabled={fbSubscribing === page.page_id}
                            className="text-xs gap-1.5"
                          >
                            {fbSubscribing === page.page_id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : page.is_subscribed ? (
                              <><XCircle className="w-3 h-3" />{language === "en" ? "Disconnect" : "Desconectar"}</>
                            ) : (
                              <><CheckCircle className="w-3 h-3" />{language === "en" ? "Activate" : "Activar"}</>
                            )}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={connectFacebook}
                    disabled={fbConnecting}
                    className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-60"
                    style={{ backgroundColor: fbConnecting ? "#1468d8" : "#1877F2" }}
                  >
                    {fbConnecting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                    )}
                    {fbConnecting
                      ? (language === "en" ? "Connecting..." : "Conectando...")
                      : fbPages.length > 0
                        ? (language === "en" ? "Connect Another Account" : "Conectar Otra Cuenta")
                        : (language === "en" ? "Connect Facebook Account" : "Conectar Cuenta de Facebook")}
                  </button>
                  {fbPages.length === 0 && !fbConnecting && (
                    <p className="text-xs text-muted-foreground">
                      {language === "en"
                        ? "After connecting, activate the webhook for each page you want to receive leads from."
                        : "Después de conectar, activa el webhook para cada página de la que quieras recibir leads."}
                    </p>
                  )}
                </div>
              )}
            </motion.div>

            {/* SMTP Email Settings */}
            <motion.div
              className="mb-8 bg-background/50 border border-border/30 rounded-lg p-6"
              initial="hidden"
              animate="visible"
              custom={4}
              variants={fadeUp}
            >
              <h2 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-400" />
                {language === "en" ? "Email Settings" : "Configuración de Email"}
              </h2>
              <p className="text-xs text-muted-foreground mb-5">
                {language === "en"
                  ? "Enter your email credentials to send follow-ups. Gmail: use an App Password (not your regular password)."
                  : "Ingresa tus credenciales de email. Gmail: usa una Contraseña de Aplicación."}
              </p>
              {!smtpLoaded ? (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              ) : (
                <div className="space-y-4 max-w-lg">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1.5">
                      {language === "en" ? "Your Email Address" : "Tu Dirección de Email"}
                    </label>
                    <input
                      type="email"
                      value={smtpEmail}
                      onChange={(e) => setSmtpEmail(e.target.value)}
                      placeholder="you@gmail.com"
                      className="w-full bg-background border border-border/50 rounded-md px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1.5">
                      {language === "en" ? "App Password" : "Contraseña de Aplicación"}
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={smtpPassword}
                        onChange={(e) => setSmtpPassword(e.target.value)}
                        placeholder={language === "en" ? "Gmail App Password (16 chars)" : "Contraseña de App (16 chars)"}
                        className="w-full bg-background border border-border/50 rounded-md px-3 py-2 pr-10 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {language === "en"
                        ? "Gmail: myaccount.google.com → Security → 2-Step Verification → App Passwords"
                        : "Gmail: myaccount.google.com → Seguridad → Verificación en 2 pasos → Contraseñas de aplicación"}
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1.5">
                      {language === "en" ? "From Name" : "Nombre del Remitente"}
                    </label>
                    <input
                      type="text"
                      value={fromName}
                      onChange={(e) => setFromName(e.target.value)}
                      placeholder={clientName || "Your Business Name"}
                      className="w-full bg-background border border-border/50 rounded-md px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <Button
                    onClick={saveSmtpSettings}
                    disabled={smtpSaving || !smtpEmail || !smtpPassword}
                    className="gap-2"
                  >
                    {smtpSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {language === "en" ? "Save Email Settings" : "Guardar Configuración"}
                  </Button>
                </div>
              )}
            </motion.div>

            {/* Statistics Grid */}
            <motion.div
              className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8"
              initial="hidden"
              animate="visible"
              custom={5}
              variants={fadeUp}
            >
              <div className="bg-background/50 border border-border/30 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">
                      {language === "en" ? "Active Leads" : "Leads Activos"}
                    </p>
                    <p className="text-2xl font-bold text-foreground">{stats.totalActive}</p>
                  </div>
                  <TrendingUp className="w-8 h-8 text-blue-400 opacity-50" />
                </div>
              </div>

              <div className="bg-background/50 border border-border/30 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">
                      {language === "en" ? "Due Now" : "Pendientes Ahora"}
                    </p>
                    <p className="text-2xl font-bold text-foreground">{stats.pendingFollowUp}</p>
                  </div>
                  <Clock className="w-8 h-8 text-orange-400 opacity-50" />
                </div>
              </div>

              <div className="bg-background/50 border border-border/30 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">
                      {language === "en" ? "Sent Today" : "Enviados Hoy"}
                    </p>
                    <p className="text-2xl font-bold text-foreground">{stats.sentToday}</p>
                  </div>
                  <Mail className="w-8 h-8 text-green-400 opacity-50" />
                </div>
              </div>

              <div className="bg-background/50 border border-border/30 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">
                      {language === "en" ? "Booked" : "Reservados"}
                    </p>
                    <p className="text-2xl font-bold text-foreground">{stats.booked}</p>
                  </div>
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 opacity-50" />
                </div>
              </div>
            </motion.div>

            {/* Worker Status & Controls */}
            <motion.div
              className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8"
              initial="hidden"
              animate="visible"
              custom={4}
              variants={fadeUp}
            >
              {/* Next Follow-ups */}
              <div className="lg:col-span-2 bg-background/50 border border-border/30 rounded-lg p-6">
                <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-purple-400" />
                  {language === "en" ? "Next Follow-Ups" : "Próximos Seguimientos"}
                </h2>
                {workerHealth.nextLeads.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{language === "en" ? "No leads due right now" : "Sin leads pendientes por ahora"}</p>
                ) : (
                  <div className="space-y-3">
                    {workerHealth.nextLeads.map((lead, idx) => (
                      <div
                        key={lead.id}
                        className="flex items-center justify-between p-3 bg-background rounded border border-border/20"
                      >
                        <div>
                          <p className="text-sm font-medium text-foreground">{lead.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(lead.dueAt).toLocaleString()}
                          </p>
                        </div>
                        <span className="text-xs bg-purple-500/20 text-purple-200 px-2 py-1 rounded">
                          #{idx + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Worker Control */}
              <div className="bg-background/50 border border-border/30 rounded-lg p-6">
                <h2 className="text-lg font-semibold text-foreground mb-4">
                  {language === "en" ? "Worker Status" : "Estado del Sistema"}
                </h2>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">
                      {language === "en" ? "Leads Pending" : "Leads Pendientes"}
                    </p>
                    <p className="text-2xl font-bold text-purple-400">{workerHealth.leadsPending}</p>
                  </div>
                  <Button
                    onClick={handleTriggerWorkerNow}
                    className="w-full gap-2"
                    variant="outline"
                    disabled={!automationEnabled}
                  >
                    <Zap className="w-4 h-4" />
                    {language === "en" ? "Process Now" : "Procesar Ahora"}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    {language === "en"
                      ? "Runs automatically every 5 min"
                      : "Se ejecuta automáticamente cada 5 min"}
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Active Lead Messages */}
            {activeLead && (
              <motion.div
                className="bg-background/50 border border-border/30 rounded-lg p-6"
                initial="hidden"
                animate="visible"
                custom={5}
                variants={fadeUp}
              >
                <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Mail className="w-5 h-5 text-blue-400" />
                  {language === "en" ? "Message History" : "Historial de Mensajes"} — {activeLead.name}
                </h2>

                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {leadMessages.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {language === "en" ? "No messages yet" : "Sin mensajes aún"}
                    </p>
                  ) : (
                    leadMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`p-3 rounded border ${
                          msg.direction === "outbound"
                            ? "bg-purple-500/10 border-purple-500/30"
                            : "bg-blue-500/10 border-blue-500/30"
                        }`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <span
                              className={`text-xs font-medium ${
                                msg.direction === "outbound"
                                  ? "text-purple-200"
                                  : "text-blue-200"
                              }`}
                            >
                              {msg.direction === "outbound" ? "📤 Sent" : "📥 Received"} •{" "}
                              {msg.channel === "email" ? "✉️ Email" : "📱 " + msg.channel}
                            </span>
                            <p className="text-xs text-muted-foreground ml-1">
                              {new Date(msg.created_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        {msg.subject && (
                          <p className="text-xs font-medium text-foreground mb-1">Subject: {msg.subject}</p>
                        )}
                        <p className="text-xs text-muted-foreground leading-relaxed">{msg.body}</p>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}

            {/* Live Workflow Builder */}
            <motion.div
              className="mt-8 bg-background/50 border border-border/30 rounded-lg p-6"
              initial="hidden"
              animate="visible"
              custom={8}
              variants={fadeUp}
            >
              <h2 className="text-lg font-semibold text-foreground mb-6">
                {language === "en" ? "Test & Debug" : "Pruebas y Depuración"}
              </h2>
              <FollowUpWorkflowBuilder clientId={clientId!} />
            </motion.div>

            {/* How It Works */}
            <motion.div
              className="mt-8 bg-background/30 border border-border/20 rounded-lg p-6"
              initial="hidden"
              animate="visible"
              custom={9}
              variants={fadeUp}
            >
              <h3 className="text-sm font-semibold text-foreground mb-4">
                {language === "en" ? "How It Works" : "Cómo Funciona"}
              </h3>
              <ul className="space-y-2 text-xs text-muted-foreground">
                <li className="flex gap-2">
                  <span className="text-purple-400">1.</span>
                  <span>{language === "en" ? "New Facebook lead received" : "Se recibe un nuevo lead de Facebook"}</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-purple-400">2.</span>
                  <span>{language === "en" ? "First message generated by Claude AI" : "Se genera el primer mensaje con Claude IA"}</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-purple-400">3.</span>
                  <span>{language === "en" ? "Email sent immediately" : "Se envía el email inmediatamente"}</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-purple-400">4.</span>
                  <span>{language === "en" ? "Follow-ups scheduled: +10min, +1day, +2days, +3days" : "Se programan seguimientos: +10min, +1día, +2días, +3días"}</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-purple-400">5.</span>
                  <span>{language === "en" ? "Automation stops if: lead books, replies, or opts out" : "Se detiene si: el lead reserva, responde u opta por no participar"}</span>
                </li>
              </ul>
            </motion.div>
          </div>
        </div>
      </PageTransition>
  );
}
