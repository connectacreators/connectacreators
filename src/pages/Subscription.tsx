import { useState, useEffect } from "react";
import PageTransition from "@/components/PageTransition";
import { useAuth } from "@/hooks/useAuth";
import { useCredits } from "@/hooks/useCredits";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import { PLAN_LIMITS } from "@/utils/planLimits";
import { Loader2, Check, X, ChevronDown, ExternalLink, Zap, Shield } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

/* ── Plan data ──────────────────────────────────────────────────────── */

const PLAN_OPTIONS = [
  { key: "starter",    name: "Starter",    price: 39,  credits: 10_000, scrapes: 8,  scripts: 75,  amount: 3900  },
  { key: "growth",     name: "Growth",     price: 79,  credits: 30_000, scrapes: 15, scripts: 200, amount: 7900  },
  { key: "enterprise", name: "Enterprise", price: 139, credits: 75_000, scrapes: 25, scripts: 500, amount: 13900 },
];

const PLAN_LABELS: Record<string, string> = {
  free: "Free", starter: "Starter", growth: "Growth",
  enterprise: "Enterprise", connecta_plan: "Connecta Plan",
  connecta_plus: "Connecta Plus", trial: "Trial",
};

const CREDIT_COSTS = [
  { en: "Transcribe video (Vault)", es: "Transcribir video (Vault)", cost: 150 },
  { en: "AI Research + Script",     es: "Investigación AI + Guión",  cost: 50  },
  { en: "Refine / Translate script", es: "Refinar / Traducir guión", cost: 25  },
  { en: "Templatize / Extract facts", es: "Plantilla / Extraer hechos", cost: 50 },
  { en: "Generate Hooks / CTAs",    es: "Generar Hooks / CTAs",      cost: 25  },
  { en: "Canvas Generate",          es: "Generar Canvas",            cost: 50  },
];

/* ── Helpers ─────────────────────────────────────────────────────────── */

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function barColor(pct: number, base: string) {
  if (pct >= 90) return "bg-red-400";
  if (pct >= 75) return "bg-amber-400";
  return base;
}

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.08, duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
  }),
};

/* ── Component ──────────────────────────────────────────────────────── */

export default function Subscription() {
  const { user, loading: authLoading, isAdmin, isVideographer } = useAuth();
  const { credits, loading, percentUsed, scrapePercentUsed } = useCredits();
  const { language } = useLanguage();
  const en = language === "en";

  const [portalLoading, setPortalLoading] = useState<string | boolean>(false);
  const [showPlans, setShowPlans] = useState(false);
  const [stripeStatus, setStripeStatus] = useState<{
    status: string;
    cancel_at_period_end: boolean;
    current_period_end: number;
    canceled_at: number | null;
    plan_name: string | null;
    amount: number | null;
    currency: string;
    interval: string | null;
    trial_end: number | null;
    trial_start: number | null;
  } | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  /* ── API helpers ─────────────────────────────────────────────────── */

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const { data, error } = await supabase.functions.invoke("stripe-billing-portal", {
        body: { action: "portal" },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No portal URL returned");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to open billing portal");
    } finally {
      setPortalLoading(false);
    }
  };

  const handleChangePlan = async (targetPlan: string) => {
    setPortalLoading(targetPlan);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const { data, error } = await supabase.functions.invoke("stripe-billing-portal", {
        body: { action: "portal-upgrade", target_plan: targetPlan },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No portal URL returned");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to open plan change");
    } finally {
      setPortalLoading(false);
    }
  };

  const fetchStripeStatus = async () => {
    setStatusLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data, error } = await supabase.functions.invoke("stripe-billing-portal", {
        body: { action: "status" },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw error;
      if (data?.subscription) setStripeStatus(data.subscription);
    } catch (err: any) {
      console.error("Failed to fetch Stripe status:", err);
    } finally {
      setStatusLoading(false);
    }
  };

  useEffect(() => {
    if (user && !isAdmin && !isVideographer) fetchStripeStatus();
  }, [user, isAdmin]);

  /* ── Loading / auth guards ───────────────────────────────────────── */

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        {en ? "Please sign in to view your subscription." : "Inicia sesión para ver tu suscripción."}
      </div>
    );
  }

  /* ── Admin / Videographer view ───────────────────────────────────── */

  if (isAdmin || isVideographer) {
    const staffFeatures = [
      en ? "Unlimited credits"   : "Créditos ilimitados",
      en ? "Unlimited scrapes"   : "Scrapes ilimitados",
      en ? "Unlimited scripts"   : "Guiones ilimitados",
      en ? "AI Canvas access"    : "Acceso AI Canvas",
      en ? "Lead Tracker"        : "Rastreo de Leads",
      en ? "Landing pages"       : "Páginas de aterrizaje",
      en ? "Vault templates"     : "Plantillas Vault",
    ];
    const roleLabel = isAdmin ? "Admin" : en ? "Videographer" : "Videógrafo";
    return (
      <div className="max-w-[800px] mx-auto px-4 py-8 space-y-8">
        <motion.div initial="hidden" animate="visible" custom={0} variants={fadeUp}>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-[10px] font-bold tracking-[2px] uppercase text-muted-foreground">{en ? "SUBSCRIPTION" : "SUSCRIPCIÓN"}</span>
          </div>
        </motion.div>
        <motion.div initial="hidden" animate="visible" custom={1} variants={fadeUp}
          className="glass-card rounded-xl p-6 overflow-hidden"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xl font-bold">{en ? "Unlimited" : "Ilimitado"}</span>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/20 text-primary">{roleLabel}</span>
          </div>
          <p className="text-sm text-muted-foreground mb-5">
            {isAdmin
              ? (en ? "Admin account — no limits" : "Cuenta admin — sin límites")
              : (en ? "Videographer account — no limits" : "Cuenta de videógrafo — sin límites")}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {staffFeatures.map((f) => (
              <div key={f} className="flex items-center gap-2 text-sm">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{f}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    );
  }

  if (loading || statusLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!credits) {
    return (
      <div className="max-w-[800px] mx-auto px-4 py-8 text-center text-muted-foreground">
        {en
          ? "No credit account found. Contact your admin to set up your subscription."
          : "No se encontró cuenta de créditos. Contacta a tu admin para configurar tu suscripción."}
      </div>
    );
  }

  /* ── Derived values ──────────────────────────────────────────────── */

  const planKey = credits.plan_type ?? "free";
  const planLabel = PLAN_LABELS[planKey] ?? planKey;
  const limits = PLAN_LIMITS[planKey] ?? PLAN_LIMITS.free;
  const currentOpt = PLAN_OPTIONS.find((p) => p.key === planKey);
  const currentAmount = currentOpt?.amount ?? 0;

  const renewalDate = stripeStatus?.current_period_end
    ? new Date(stripeStatus.current_period_end * 1000).toLocaleDateString(undefined, {
        month: "long", day: "numeric", year: "numeric",
      })
    : credits.credits_reset_at
    ? formatDate(credits.credits_reset_at)
    : null;

  type Feature = { label: string; included: boolean };
  const features: Feature[] = [];
  features.push({ label: `${credits.credits_monthly_cap.toLocaleString()} ${en ? "credits per month" : "créditos al mes"}`, included: true });
  features.push({ label: `${credits.channel_scrapes_limit} ${en ? "channel scrapes" : "scrapes de canales"}`, included: true });
  const scriptLimit = limits.scripts === -1 ? (en ? "Unlimited" : "Ilimitados") : String(limits.scripts);
  features.push({ label: `${scriptLimit} ${en ? "scripts" : "guiones"}`, included: true });
  if (planKey !== "free") {
    features.push({ label: en ? "AI Canvas access" : "Acceso AI Canvas", included: true });
    features.push({ label: `${en ? "Lead Tracker" : "Rastreo de Leads"} (${limits.leads === -1 ? (en ? "unlimited" : "ilimitados") : limits.leads + " leads"})`, included: true });
    features.push({ label: `${en ? "Landing pages" : "Páginas de aterrizaje"} (${limits.landing_pages === -1 ? (en ? "unlimited" : "ilimitadas") : limits.landing_pages})`, included: limits.landing_pages !== 0 });
    features.push({ label: en ? "Vault templates" : "Plantillas Vault", included: true });
  } else {
    features.push({ label: en ? "AI Canvas access" : "Acceso AI Canvas", included: false });
    features.push({ label: en ? "Lead Tracker" : "Rastreo de Leads", included: false });
    features.push({ label: en ? "Landing pages" : "Páginas de aterrizaje", included: false });
    features.push({ label: en ? "Vault templates" : "Plantillas Vault", included: false });
  }
  if (planKey === "enterprise") {
    features.push({ label: en ? "Unlimited leads & scripts" : "Leads y guiones ilimitados", included: true });
  }

  const showStatusBadge = stripeStatus && (
    stripeStatus.status === "trialing" ||
    stripeStatus.cancel_at_period_end ||
    stripeStatus.status === "past_due" ||
    stripeStatus.status === "canceled"
  );

  const statusBadgeText = stripeStatus?.cancel_at_period_end
    ? (en ? "Cancels at period end" : "Se cancela al final del período")
    : stripeStatus?.status === "trialing"
    ? (en ? "Trialing" : "Prueba")
    : stripeStatus?.status === "past_due"
    ? (en ? "Past due" : "Pago pendiente")
    : stripeStatus?.status === "canceled"
    ? (en ? "Canceled" : "Cancelada")
    : "";

  const statusBadgeClass = stripeStatus?.status === "canceled" || stripeStatus?.status === "past_due"
    ? "bg-red-500/15 text-red-400"
    : "bg-amber-500/15 text-amber-400";

  /* ── Render ──────────────────────────────────────────────────────── */

  return (
    <PageTransition className="max-w-[800px] mx-auto px-4 py-8 space-y-10">

      {/* ── Section 1: SUBSCRIPTION ──────────────────────────────── */}
      <section>
        <motion.div initial="hidden" animate="visible" custom={0} variants={fadeUp} className="flex items-center gap-2 mb-4">
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="text-[10px] font-bold tracking-[2px] uppercase text-muted-foreground">{en ? "SUBSCRIPTION" : "SUSCRIPCIÓN"}</span>
        </motion.div>
        <motion.div initial="hidden" animate="visible" custom={1} variants={fadeUp}
          className="glass-card rounded-xl p-6 overflow-hidden"
        >
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-3">
              <span className="text-xl font-bold">{planLabel}</span>
              {showStatusBadge && (
                <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${statusBadgeClass}`}>
                  {statusBadgeText}
                </span>
              )}
            </div>
            <button
              onClick={() => setShowPlans((v) => !v)}
              className="text-sm font-medium px-4 py-1.5 rounded-lg border border-primary/25 text-primary hover:bg-primary/10 transition-colors"
            >
              {showPlans
                ? (en ? "Hide plans" : "Ocultar planes")
                : (en ? "Upgrade plan" : "Mejorar plan")}
            </button>
          </div>

          {renewalDate && (
            <p className="text-sm text-muted-foreground mb-5">
              {stripeStatus?.cancel_at_period_end
                ? (en ? `Active until ${renewalDate}` : `Activa hasta ${renewalDate}`)
                : (en ? `Your plan renews ${renewalDate}` : `Tu plan se renueva el ${renewalDate}`)}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {features.map((f) => (
              <div key={f.label} className="flex items-center gap-2 text-sm">
                {f.included
                  ? <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  : <X className="w-4 h-4 text-red-400/60 shrink-0" />}
                <span className={f.included ? "" : "text-muted-foreground"}>{f.label}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ── Section 2: CREDITS ───────────────────────────────────── */}
      <section>
        <motion.div initial="hidden" animate="visible" custom={2} variants={fadeUp} className="flex items-center gap-2 mb-4">
          <div className="w-2 h-2 rounded-full" style={{ background: "#22d3ee" }} />
          <span className="text-[10px] font-bold tracking-[2px] uppercase text-muted-foreground">{en ? "CREDITS" : "CRÉDITOS"}</span>
        </motion.div>
        <motion.div initial="hidden" animate="visible" custom={3} variants={fadeUp}
          className="glass-card rounded-xl p-6 space-y-4 overflow-hidden"
        >
          <p className="text-sm text-muted-foreground">{en ? "Monthly credits left" : "Créditos mensuales restantes"}</p>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-extrabold tabular-nums">{credits.credits_balance.toLocaleString()}</span>
            <span className="text-lg text-muted-foreground">/ {credits.credits_monthly_cap.toLocaleString()}</span>
          </div>

          {/* progress bar */}
          <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,.06)" }}>
            <div
              className={`h-full rounded-full transition-all ${barColor(percentUsed, "bg-primary")}`}
              style={{ width: `${Math.max(2, 100 - percentUsed)}%` }}
            />
          </div>

          {credits.credits_reset_at && (
            <p className="text-xs text-muted-foreground">
              {en ? "Resets" : "Reinicia"} {formatDate(credits.credits_reset_at)}
            </p>
          )}

          {/* Collapsible credit costs */}
          <details className="group">
            <summary className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors">
              <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
              {en ? "Credit costs" : "Costo de créditos"}
            </summary>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5 mt-3 text-sm">
              {CREDIT_COSTS.map((c) => (
                <div key={c.en} className="flex justify-between text-muted-foreground">
                  <span>{en ? c.en : c.es}</span>
                  <span className="font-medium text-primary">{c.cost}</span>
                </div>
              ))}
            </div>
          </details>
        </motion.div>
      </section>

      {/* ── Section 3: CHANNEL SCRAPES ───────────────────────────── */}
      {credits.channel_scrapes_limit > 0 && (
        <section>
          <motion.div initial="hidden" animate="visible" custom={4} variants={fadeUp} className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-blue-400" />
            <span className="text-[10px] font-bold tracking-[2px] uppercase text-muted-foreground">{en ? "CHANNEL SCRAPES" : "SCRAPES DE CANALES"}</span>
          </motion.div>
          <motion.div initial="hidden" animate="visible" custom={5} variants={fadeUp}
            className="glass-card rounded-xl p-6 space-y-4 overflow-hidden"
          >
            <p className="text-sm text-muted-foreground">{en ? "Scrapes used this cycle" : "Scrapes usados este ciclo"}</p>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-extrabold tabular-nums">{credits.channel_scrapes_used}</span>
              <span className="text-lg text-muted-foreground">/ {credits.channel_scrapes_limit}</span>
            </div>
            <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,.06)" }}>
              <div
                className={`h-full rounded-full transition-all ${barColor(scrapePercentUsed, "bg-blue-400")}`}
                style={{ width: `${Math.max(2, 100 - scrapePercentUsed)}%` }}
              />
            </div>
          </motion.div>
        </section>
      )}

      {/* ── Section 4: CHANGE PLAN (hidden by default) ───────────── */}
      {showPlans && (
        <section>
          <motion.div initial="hidden" animate="visible" custom={0} variants={fadeUp} className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-[10px] font-bold tracking-[2px] uppercase text-muted-foreground">{en ? "CHANGE PLAN" : "CAMBIAR PLAN"}</span>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {PLAN_OPTIONS.map((plan, i) => {
              const isCurrent = planKey === plan.key;
              const isUpgrade = plan.amount > currentAmount;
              const isDowngrade = plan.amount < currentAmount;

              return (
                <motion.div key={plan.key} initial="hidden" animate="visible" custom={i + 1} variants={fadeUp}
                  className={`glass-card rounded-xl p-5 flex flex-col justify-between overflow-hidden ${
                    isCurrent ? "!border-primary/40" : ""
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-base">{plan.name}</span>
                      {isCurrent && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/20 text-primary">
                          {en ? "Current" : "Actual"}
                        </span>
                      )}
                      {!isCurrent && isUpgrade && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">
                          {en ? "Upgrade" : "Mejora"}
                        </span>
                      )}
                      {!isCurrent && isDowngrade && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400">
                          {en ? "Downgrade" : "Degradar"}
                        </span>
                      )}
                    </div>
                    <p className="text-2xl font-extrabold mb-3">
                      ${plan.price}<span className="text-sm font-normal text-muted-foreground">/mo</span>
                    </p>
                    <ul className="space-y-1.5 text-sm text-muted-foreground mb-4">
                      <li className="flex items-center gap-2">
                        <Zap className="w-3.5 h-3.5 text-amber-400" />
                        {plan.credits.toLocaleString()} {en ? "credits" : "créditos"}
                      </li>
                      <li className="flex items-center gap-2">
                        <Shield className="w-3.5 h-3.5 text-blue-400" />
                        {plan.scrapes} {en ? "scrapes" : "scrapes"}
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        {plan.scripts} {en ? "scripts" : "guiones"}
                      </li>
                    </ul>
                  </div>

                  {isCurrent ? (
                    <button
                      disabled
                      className="w-full text-sm font-medium py-2 rounded-lg border border-white/[.06] text-muted-foreground cursor-not-allowed"
                      style={{ background: "rgba(255,255,255,.03)" }}
                    >
                      {en ? "Your Plan" : "Tu Plan"}
                    </button>
                  ) : isUpgrade ? (
                    <button
                      onClick={() => handleChangePlan(plan.key)}
                      disabled={!!portalLoading}
                      className="w-full text-sm font-medium py-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/20 transition-colors"
                    >
                      {portalLoading === plan.key
                        ? <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                        : (en ? "Upgrade" : "Mejorar")}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleChangePlan(plan.key)}
                      disabled={!!portalLoading}
                      className="w-full text-sm font-medium py-2 rounded-lg border border-white/[.08] text-muted-foreground hover:border-white/[.15] transition-colors"
                      style={{ background: "rgba(255,255,255,.03)" }}
                    >
                      {portalLoading === plan.key
                        ? <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                        : (en ? "Downgrade" : "Degradar")}
                    </button>
                  )}
                </motion.div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Section 5: MANAGE SUBSCRIPTION ───────────────────────── */}
      <motion.section initial="hidden" animate="visible" custom={6} variants={fadeUp}>
        <div className="glass-card rounded-xl p-6 flex items-center justify-between overflow-hidden">
          <div>
            <p className="font-semibold text-sm">{en ? "Manage Subscription" : "Gestionar Suscripción"}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {en ? "Payment methods, invoices, cancellation" : "Métodos de pago, facturas, cancelación"}
            </p>
          </div>
          <button
            onClick={handleManageSubscription}
            disabled={!!portalLoading}
            className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg border border-primary/25 text-primary hover:bg-primary/10 transition-colors"
          >
            {portalLoading === true ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
            {en ? "Manage" : "Gestionar"}
          </button>
        </div>
      </motion.section>
    </PageTransition>
  );
}
