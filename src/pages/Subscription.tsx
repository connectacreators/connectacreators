import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCredits } from "@/hooks/useCredits";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Zap, TrendingDown, RefreshCw, Infinity, ExternalLink, FileText, Download, Settings, ArrowUpDown, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import ScriptsLogin from "@/components/ScriptsLogin";

const PLAN_OPTIONS = [
  { key: "starter",    name: "Starter",    price: "$39/mo",  credits: "10,000", scrapes: "5",  amount: 3900  },
  { key: "growth",     name: "Growth",     price: "$79/mo",  credits: "30,000", scrapes: "10", amount: 7900  },
  { key: "enterprise", name: "Pro",        price: "$139/mo", credits: "75,000", scrapes: "15", amount: 13900 },
];

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  growth: "Growth",
  enterprise: "Pro",
  connecta_plan: "Connecta Plan",
  connecta_plus: "Connecta Plus",
  trial: "Trial",
};

const ACTION_LABELS: Record<string, string> = {
  add_video_to_vault: "Transcribe video",
  research: "AI Research",
  "refine-script": "Refine script",
  "translate-script": "Translate script",
  "templatize-script": "Templatize script",
  "generate-script": "Generate script",
  admin_recharge: "Admin recharge",
};

interface Invoice {
  id: string;
  number: string | null;
  amount: number;
  currency: string;
  status: string;
  date: number;
  pdf_url: string | null;
  hosted_url: string | null;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatInvoiceDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(amount / 100);
}

export default function Subscription() {
  const { user, loading: authLoading, isAdmin, signInWithEmail, signUpWithEmail } = useAuth();
  const { credits, transactions, loading, percentUsed, scrapePercentUsed, refetch } = useCredits();
  const { language } = useLanguage();

  const [portalLoading, setPortalLoading] = useState(false);
  const [changePlanLoading, setChangePlanLoading] = useState<string | null>(null);
  const [confirmPlan, setConfirmPlan] = useState<{ key: string; isUpgrade: boolean } | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [stripeStatus, setStripeStatus] = useState<{
    status: string;
    cancel_at_period_end: boolean;
    current_period_end: number;
    canceled_at: number | null;
    plan_name: string | null;
    amount: number | null;
    currency: string;
    interval: string | null;
  } | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

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
        window.open(data.url, "_blank");
      } else {
        throw new Error("No portal URL returned");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to open billing portal");
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
      if (data?.subscription) {
        setStripeStatus(data.subscription);
      }
    } catch (err: any) {
      console.error("Failed to fetch Stripe status:", err);
    } finally {
      setStatusLoading(false);
    }
  };

  const fetchInvoices = async () => {
    setInvoicesLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase.functions.invoke("stripe-billing-portal", {
        body: { action: "invoices" },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error) throw error;
      if (data?.invoices) {
        setInvoices(data.invoices);
      }
    } catch (err: any) {
      console.error("Failed to load invoices:", err);
    } finally {
      setInvoicesLoading(false);
    }
  };

  const handleChangePlan = async (planKey: string, isUpgrade: boolean) => {
    setConfirmPlan(null);
    setChangePlanLoading(planKey);
    try {
      const { data: { session } } = await supabase.auth.refreshSession();
      if (!session) throw new Error("Session expired. Please sign in again.");

      const { data, error } = await supabase.functions.invoke("stripe-billing-portal", {
        body: { action: "change-plan", new_plan: planKey },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error) {
        let msg = "Failed to change plan. Please try again.";
        try { const body = await (error as any).context?.json?.(); if (body?.error) msg = body.error; } catch {}
        throw new Error(msg);
      }

      toast.success(data.message || (isUpgrade ? "Plan upgraded!" : "Downgrade scheduled!"));
      await fetchStripeStatus();
      await refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to change plan.");
    } finally {
      setChangePlanLoading(null);
    }
  };

  useEffect(() => {
    if (user && !isAdmin) {
      fetchStripeStatus();
      fetchInvoices();
    }
  }, [user, isAdmin]);

  if (authLoading) {
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

  // Admin view — unlimited credits
  if (isAdmin) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">
            {language === "en" ? "Credits & Usage" : "Créditos y Uso"}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {language === "en" ? "Admin account — unlimited credits" : "Cuenta admin — créditos ilimitados"}
          </p>
        </div>

        <Card className="glass-card border-border/30">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-[#0891B2]/20 flex items-center justify-center">
                <Infinity className="w-6 h-6 text-[#0891B2]" />
              </div>
              <div>
                <div className="text-2xl font-bold text-[#0891B2]">
                  {language === "en" ? "Unlimited" : "Ilimitado"}
                </div>
                <div className="text-sm text-muted-foreground">
                  {language === "en"
                    ? "Admin accounts have no credit limits"
                    : "Las cuentas admin no tienen límite de créditos"}
                </div>
              </div>
              <Badge className="ml-auto bg-[#0891B2]/20 text-[#0891B2] border-[#0891B2]/30">Admin</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!credits) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Card className="glass-card border-border/30">
          <CardContent className="pt-6 text-center text-muted-foreground">
            {language === "en"
              ? "No credit account found. Contact your admin to set up your subscription."
              : "No se encontró cuenta de créditos. Contacta a tu admin para configurar tu suscripción."}
          </CardContent>
        </Card>
      </div>
    );
  }

  const balanceColor =
    percentUsed >= 90 ? "text-red-400" : percentUsed >= 75 ? "text-amber-400" : "text-foreground";
  const barColor =
    percentUsed >= 90 ? "bg-red-400" : percentUsed >= 75 ? "bg-amber-400" : "bg-primary";

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {language === "en" ? "Credits & Usage" : "Créditos y Uso"}
          </h1>
          {credits.plan_type && (
            <p className="text-muted-foreground text-sm mt-1">
              {PLAN_LABELS[credits.plan_type] ?? credits.plan_type}
              {credits.subscription_status && (
                <Badge className="ml-2 text-xs" variant="outline">
                  {credits.subscription_status}
                </Badge>
              )}
            </p>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={refetch} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          {language === "en" ? "Refresh" : "Actualizar"}
        </Button>
      </div>

      {/* Stripe Subscription Status Card */}
      {statusLoading && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground ml-2">
            {language === "en" ? "Fetching subscription status..." : "Obteniendo estado de suscripción..."}
          </span>
        </div>
      )}
      {stripeStatus && (
        <Card className={`glass-card ${
          stripeStatus.status === "active" && !stripeStatus.cancel_at_period_end
            ? "glass-card-cyan border-green-500/30"
            : stripeStatus.status === "active" && stripeStatus.cancel_at_period_end
            ? "border-amber-500/30"
            : stripeStatus.status === "canceled"
            ? "border-red-500/30"
            : "border-border/30"
        }`}>
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  stripeStatus.status === "active" && !stripeStatus.cancel_at_period_end
                    ? "bg-green-500/10"
                    : stripeStatus.cancel_at_period_end
                    ? "bg-amber-500/10"
                    : "bg-red-500/10"
                }`}>
                  <Settings className={`w-5 h-5 ${
                    stripeStatus.status === "active" && !stripeStatus.cancel_at_period_end
                      ? "text-green-400"
                      : stripeStatus.cancel_at_period_end
                      ? "text-amber-400"
                      : "text-red-400"
                  }`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm">
                      {language === "en" ? "Subscription" : "Suscripción"}
                    </p>
                    <Badge className={`text-xs ${
                      stripeStatus.status === "active" && !stripeStatus.cancel_at_period_end
                        ? "bg-green-500/15 text-green-400 border-green-500/30"
                        : stripeStatus.status === "active" && stripeStatus.cancel_at_period_end
                        ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                        : stripeStatus.status === "canceled"
                        ? "bg-red-500/15 text-red-400 border-red-500/30"
                        : "bg-muted/50 text-muted-foreground"
                    }`}>
                      {stripeStatus.cancel_at_period_end
                        ? (language === "en" ? "Cancels at period end" : "Se cancela al final del período")
                        : stripeStatus.status.charAt(0).toUpperCase() + stripeStatus.status.slice(1)}
                    </Badge>
                  </div>
                  {stripeStatus.cancel_at_period_end && stripeStatus.current_period_end && (
                    <p className="text-xs text-amber-400 mt-0.5">
                      {language === "en" ? "Active until" : "Activa hasta"}{" "}
                      {new Date(stripeStatus.current_period_end * 1000).toLocaleDateString(undefined, {
                        month: "long", day: "numeric", year: "numeric",
                      })}
                    </p>
                  )}
                  {stripeStatus.status === "active" && !stripeStatus.cancel_at_period_end && stripeStatus.current_period_end && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {language === "en" ? "Renews" : "Renueva"}{" "}
                      {new Date(stripeStatus.current_period_end * 1000).toLocaleDateString(undefined, {
                        month: "long", day: "numeric", year: "numeric",
                      })}
                    </p>
                  )}
                  {stripeStatus.status === "canceled" && (
                    <p className="text-xs text-red-400 mt-0.5">
                      {language === "en" ? "Subscription ended" : "Suscripción terminada"}
                      {stripeStatus.canceled_at && (
                        <> · {language === "en" ? "Canceled" : "Cancelada"}{" "}
                        {new Date(stripeStatus.canceled_at * 1000).toLocaleDateString(undefined, {
                          month: "long", day: "numeric", year: "numeric",
                        })}</>
                      )}
                    </p>
                  )}
                </div>
              </div>
              <Button
                onClick={handleManageSubscription}
                disabled={portalLoading}
                size="sm"
                className="gap-2 btn-primary-glass"
              >
                {portalLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ExternalLink className="w-4 h-4" />
                )}
                {language === "en" ? "Manage" : "Gestionar"}
              </Button>
            </div>
            {stripeStatus.amount != null && (
              <p className="text-xs text-muted-foreground">
                {new Intl.NumberFormat("en-US", { style: "currency", currency: stripeStatus.currency.toUpperCase() }).format(stripeStatus.amount / 100)}
                /{stripeStatus.interval === "month" ? (language === "en" ? "month" : "mes") : stripeStatus.interval}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Change Plan ──────────────────────────────────────────────────── */}
      {stripeStatus?.status === "active" && !stripeStatus.cancel_at_period_end && credits?.plan_type && (
        <Card className="glass-card border-border/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ArrowUpDown className="w-4 h-4 text-primary" />
              {language === "en" ? "Change Plan" : "Cambiar Plan"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {PLAN_OPTIONS.map((plan) => {
              const isCurrent = credits.plan_type === plan.key;
              const currentOpt = PLAN_OPTIONS.find(p => p.key === credits.plan_type);
              const currentAmount = currentOpt?.amount ?? 0;
              const isUpgrade = plan.amount > currentAmount;

              return (
                <div
                  key={plan.key}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-colors ${
                    isCurrent
                      ? "border-primary/40 bg-primary/5"
                      : "border-border/30 hover:border-border/60"
                  }`}
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-foreground">{plan.name}</span>
                      {isCurrent && (
                        <Badge className="text-xs bg-primary/20 text-primary border-primary/30">
                          {language === "en" ? "Current" : "Actual"}
                        </Badge>
                      )}
                      {!isCurrent && isUpgrade && (
                        <Badge className="text-xs bg-blue-500/15 text-blue-400 border-blue-500/30">↑ {language === "en" ? "Upgrade" : "Mejora"}</Badge>
                      )}
                      {!isCurrent && !isUpgrade && (
                        <Badge className="text-xs bg-muted/50 text-muted-foreground border-border/40">↓ {language === "en" ? "Downgrade" : "Degradar"}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {plan.price} · {plan.credits} {language === "en" ? "credits" : "créditos"} · {plan.scrapes} {language === "en" ? "scrapes" : "scrapes"}
                    </p>
                  </div>

                  {!isCurrent && (
                    confirmPlan?.key === plan.key ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground max-w-[160px] text-right leading-tight">
                          {isUpgrade
                            ? (language === "en" ? "Charged now (prorated)" : "Se cobra ahora (prorateado)")
                            : (language === "en" ? "No refund — next cycle" : "Sin reembolso — próximo ciclo")}
                        </span>
                        <Button
                          size="sm"
                          disabled={!!changePlanLoading}
                          onClick={() => handleChangePlan(plan.key, isUpgrade)}
                          className="shrink-0 btn-primary-glass"
                        >
                          {changePlanLoading === plan.key ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (language === "en" ? "Confirm" : "Confirmar")}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setConfirmPlan(null)}
                          className="shrink-0 text-muted-foreground"
                        >
                          {language === "en" ? "Cancel" : "Cancelar"}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        disabled={!!changePlanLoading}
                        onClick={() => setConfirmPlan({ key: plan.key, isUpgrade })}
                        className="shrink-0 btn-primary-glass"
                      >
                        {changePlanLoading === plan.key ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : isUpgrade ? (
                          language === "en" ? "Upgrade" : "Mejorar"
                        ) : (
                          language === "en" ? "Downgrade" : "Degradar"
                        )}
                      </Button>
                    )
                  )}
                </div>
              );
            })}

            <div className="flex items-start gap-2 pt-1 text-xs text-muted-foreground">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400/70" />
              <span>
                {language === "en"
                  ? "Upgrades are charged immediately (prorated). Downgrades take effect at the next billing cycle — no refunds."
                  : "Las mejoras se cobran de inmediato (prorateado). Las degradaciones aplican en el próximo ciclo — sin reembolso."}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main credits card */}
      <Card className="glass-card border-border/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="w-4 h-4 text-[#0891B2]" />
            {language === "en" ? "AI Credits" : "Créditos AI"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end justify-between">
            <div>
              <span className={`text-4xl font-bold tabular-nums ${balanceColor}`}>
                {credits.credits_balance}
              </span>
              <span className="text-muted-foreground text-lg"> / {credits.credits_monthly_cap}</span>
            </div>
            <span className="text-sm text-muted-foreground">
              {credits.credits_used} {language === "en" ? "used" : "usados"}
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${barColor}`}
              style={{ width: `${Math.max(2, 100 - percentUsed)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {100 - percentUsed}% {language === "en" ? "remaining" : "restante"}
            {credits.credits_reset_at && (
              <> · {language === "en" ? "Resets" : "Reinicia"} {formatDate(credits.credits_reset_at)}</>
            )}
          </p>
        </CardContent>
      </Card>

      {/* Channel scrapes if applicable */}
      {credits.channel_scrapes_limit > 0 && (
        <Card className="glass-card border-border/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingDown className="w-4 h-4 text-blue-400" />
              {language === "en" ? "Channel Scrapes" : "Scrapes de Canales"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-end justify-between">
              <div>
                <span className="text-3xl font-bold tabular-nums">
                  {credits.channel_scrapes_used}
                </span>
                <span className="text-muted-foreground"> / {credits.channel_scrapes_limit}</span>
              </div>
              <span className="text-sm text-muted-foreground">
                {language === "en" ? "used" : "usados"}
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  scrapePercentUsed >= 90
                    ? "bg-red-400"
                    : scrapePercentUsed >= 75
                    ? "bg-amber-400"
                    : "bg-blue-400"
                }`}
                style={{ width: `${Math.max(2, scrapePercentUsed)}%` }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invoices */}
      {invoices.length > 0 && (
        <Card className="glass-card border-border/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="w-4 h-4 text-green-400" />
              {language === "en" ? "Invoices" : "Facturas"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {invoices.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between text-sm py-2 border-b border-border/20 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <div>
                      <span className="font-medium">{inv.number || inv.id.slice(0, 12)}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {formatInvoiceDate(inv.date)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold">{formatCurrency(inv.amount, inv.currency)}</span>
                    <Badge
                      variant="outline"
                      className={
                        inv.status === "paid"
                          ? "text-green-400 border-green-400/30"
                          : "text-muted-foreground"
                      }
                    >
                      {inv.status}
                    </Badge>
                    {inv.pdf_url && (
                      <a
                        href={inv.pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={language === "en" ? "Download PDF" : "Descargar PDF"}
                      >
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                          <Download className="w-3.5 h-3.5" />
                        </Button>
                      </a>
                    )}
                    {inv.hosted_url && (
                      <a
                        href={inv.hosted_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={language === "en" ? "View invoice" : "Ver factura"}
                      >
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Button>
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {invoicesLoading && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground ml-2">
            {language === "en" ? "Loading invoices..." : "Cargando facturas..."}
          </span>
        </div>
      )}

      {/* Credit costs reference */}
      <Card className="glass-card border-border/30">
        <CardHeader>
          <CardTitle className="text-base">
            {language === "en" ? "Credit Costs" : "Costo de Créditos"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            {[
              {
                action:
                  language === "en"
                    ? "Transcribe video (Vault)"
                    : "Transcribir video (Vault)",
                cost: 150,
              },
              {
                action:
                  language === "en"
                    ? "AI Research + Script"
                    : "Investigación AI + Guión",
                cost: 50,
              },
              {
                action:
                  language === "en"
                    ? "Refine / Translate script"
                    : "Refinar / Traducir guión",
                cost: 25,
              },
              {
                action:
                  language === "en" ? "Templatize / Extract facts" : "Convertir en plantilla / Extraer hechos",
                cost: 50,
              },
              {
                action:
                  language === "en" ? "Generate Hooks / CTAs" : "Generar Hooks / CTAs",
                cost: 25,
              },
              {
                action:
                  language === "en" ? "Canvas Generate" : "Generar Canvas",
                cost: 50,
              },
            ].map(({ action, cost }) => (
              <div key={action} className="flex justify-between text-muted-foreground">
                <span>{action}</span>
                <span className="font-medium text-foreground">{cost} cr</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Transaction history */}
      {transactions.length > 0 && (
        <Card className="glass-card border-border/30">
          <CardHeader>
            <CardTitle className="text-base">
              {language === "en" ? "Recent Activity" : "Actividad Reciente"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between text-sm py-1.5 border-b border-border/20 last:border-0"
                >
                  <div>
                    <span className="font-medium">
                      {ACTION_LABELS[tx.action] ?? tx.action}
                    </span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {formatDate(tx.created_at)}
                    </span>
                  </div>
                  <span
                    className={
                      tx.cost < 0
                        ? "text-green-400 font-semibold"
                        : "text-red-400 font-semibold"
                    }
                  >
                    {tx.cost < 0 ? `+${Math.abs(tx.cost)}` : `-${tx.cost}`} cr
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
