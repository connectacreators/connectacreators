import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Loader2, Crown, LogOut, Zap, Info } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

const plans = [
  {
    key: "starter",
    name: "Starter",
    price: 39,
    description: "Perfect for creators getting started with Connecta.",
    credits: "50,000",
    badge: null as string | null,
    limits: [] as { label: string; value: string }[],
    features: [
      "Access to Connecta CRM",
      "Script generator access",
      "Lead tracker access",
      "Facebook lead integration",
      "Save and organize scripts",
    ],
    isStripe: true,
    data: { plan_type: "starter", subscription_status: "pending_contact" },
    cta: "Get Started",
  },
  {
    key: "growth",
    name: "Growth",
    price: 79,
    description: "Best for active creators and growing businesses.",
    credits: "100,000",
    badge: "Most Popular",
    limits: [] as { label: string; value: string }[],
    features: [
      "Access to Connecta CRM",
      "Script generator access",
      "Lead tracker access",
      "Facebook lead integration",
      "Save and organize scripts",
    ],
    isStripe: true,
    data: { plan_type: "growth", subscription_status: "pending_contact" },
    cta: "Get Started",
  },
  {
    key: "enterprise",
    name: "Pro",
    price: 139,
    description: "For power users who need unlimited capacity.",
    credits: "175,000",
    badge: null as string | null,
    limits: [] as { label: string; value: string }[],
    features: [
      "Access to Connecta CRM",
      "Script generator access",
      "Lead tracker access",
      "Facebook lead integration",
      "Save and organize scripts",
      "Priority support",
    ],
    isStripe: true,
    data: { plan_type: "enterprise", subscription_status: "pending_contact" },
    cta: "Get Started",
  },
  {
    key: "connecta_dfy",
    name: "Connecta Plan",
    price: null as number | null,
    priceLabel: "Contact our team",
    description: "We fully build and manage your system for you.",
    credits: null as string | null,
    badge: null as string | null,
    limits: [] as { label: string; value: string }[],
    features: [
      "20 custom scripts per month (done for you)",
      "Full CRM setup and management",
      "Lead tracker fully integrated",
      "Video editing included",
      "Social media management",
      "Automation setup",
      "One-on-one coaching",
    ],
    isStripe: false,
    data: { plan_type: "connecta_dfy", subscription_status: "pending_contact" },
    cta: "Contact our team",
    redirect: "/coming-soon",
  },
  {
    key: "connecta_plus",
    name: "Connecta Plus",
    price: null as number | null,
    priceLabel: "Contact our team",
    description: "Full automation, ads management, and AI-powered follow-up.",
    credits: null as string | null,
    badge: null as string | null,
    limits: [] as { label: string; value: string }[],
    features: [
      "Everything in Connecta Plan",
      "Ads management",
      "AI follow-up agent",
      "Full automation and optimization",
    ],
    isStripe: false,
    data: { plan_type: "connecta_plus", subscription_status: "pending_contact" },
    cta: "Contact our team",
    redirect: "/coming-soon",
  },
];

/** Map DB plan_type values to display names */
const planDisplayName: Record<string, string> = {
  starter: "Starter",
  growth: "Growth",
  enterprise: "Pro",
  connecta_dfy: "Connecta Plan",
  connecta_plus: "Connecta Plus",
};

export default function SelectPlan() {
  const { user, loading, isAdmin, isVideographer, isConnectaPlus, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isUpgrade = searchParams.get("upgrade") === "true";

  const [clientId, setClientId] = useState<string | null>(null);
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);

  const isFreePlan = !currentPlan || (!["starter", "growth", "enterprise", "connecta_dfy", "connecta_plus"].includes(currentPlan));
  const hasActiveSub = subscriptionStatus === "active" || subscriptionStatus === "trialing" || subscriptionStatus === "trial";

  useEffect(() => {
    if (!loading && !user) {
      navigate("/dashboard");
      return;
    }
    if (user && (isAdmin || isVideographer || isConnectaPlus)) {
      navigate("/dashboard");
      return;
    }
    if (user) {
      // For non-upgrade visits: call check-subscription first to reconcile Stripe state.
      // This handles cases where the webhook dropped after payment — the user paid but
      // their DB record still shows inactive/null. check-subscription queries Stripe
      // directly and updates the DB, so the redirect below will fire correctly.
      const reconcileAndCheck = async () => {
        if (!isUpgrade) {
          try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
              await supabase.functions.invoke("check-subscription", {
                headers: { Authorization: `Bearer ${session.access_token}` },
              });
            }
          } catch {
            // Non-fatal — continue to DB check regardless
          }
        }

        const { data } = await supabase
          .from("clients")
          .select("id, plan_type, subscription_status")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!isUpgrade && data?.plan_type && (data.subscription_status === "active" || data.subscription_status === "trialing" || data.subscription_status === "trial")) {
          navigate("/dashboard");
        } else if (data) {
          setClientId(data.id);
          setCurrentPlan(data.plan_type);
          setSubscriptionStatus(data.subscription_status);
        }
      };

      reconcileAndCheck();
    }
  }, [user, loading, isAdmin, isVideographer, navigate, isUpgrade]);

  const handleUpgrade = async (planKey: string) => {
    setSelecting(planKey);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("stripe-billing-portal", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: { action: "portal-upgrade", target_plan: planKey },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No portal URL returned");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to upgrade plan");
    } finally {
      setSelecting(null);
    }
  };

  const handleSelect = async (plan: (typeof plans)[number]) => {
    if (!clientId) return;

    // Upgrade flow: call upgrade-subscription instead of checkout
    if (isUpgrade && plan.isStripe) {
      await handleUpgrade(plan.key);
      return;
    }

    setSelecting(plan.key);
    if (plan.isStripe) {
      navigate(`/checkout?plan=${plan.key}`);
    } else {
      navigate(plan.redirect!);
    }
  };

  if (loading || !user || !clientId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const visiblePlans = isUpgrade
    ? plans.filter((p) => p.key !== currentPlan)
    : plans;

  return (
    <div className="min-h-screen bg-background ambient-glow py-12 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-end mb-4">
          {!isUpgrade && (
            <Button variant="ghost" size="sm" onClick={() => signOut().then(() => navigate("/dashboard"))} className="text-muted-foreground">
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          )}
          {isUpgrade && (
            <Button variant="ghost" size="sm" onClick={() => navigate("/subscription")} className="text-muted-foreground">
              ← Back to Subscription
            </Button>
          )}
        </div>
        <motion.div
          className="text-center mb-8"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-3">
            {isUpgrade ? "Upgrade Your Plan" : "Choose Your Plan"}
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            {isUpgrade
              ? "Select a new plan. You'll only be charged the prorated difference for the rest of your billing cycle."
              : "Select the plan that best fits your needs. You can upgrade anytime."}
          </p>
        </motion.div>

        {/* Free plan notice */}
        {isFreePlan && !isUpgrade && (
          <motion.div
            className="max-w-2xl mx-auto mb-8"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
          >
            <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-5 py-3.5">
              <Info className="w-5 h-5 text-primary shrink-0" />
              <p className="text-sm text-foreground">
                You're on the <span className="font-semibold">Free plan</span> (250 credits/month). Upgrade for more power.
              </p>
            </div>
          </motion.div>
        )}

        <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 ${!isUpgrade ? "xl:grid-cols-5" : ""} gap-6`}>
          {visiblePlans.map((plan, i) => {
            const isCurrent = hasActiveSub && currentPlan === plan.key;
            return (
              <motion.div
                key={plan.key}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08, duration: 0.4 }}
                className="flex"
              >
                <Card
                  className={`flex flex-col w-full relative glass-card ${
                    plan.badge ? "glass-card-cyan shadow-lg shadow-primary/10" : ""
                  } ${isCurrent ? "ring-2 ring-primary/50" : ""}`}
                >
                  {/* Badge: "Most Popular" or "Current Plan" */}
                  {(plan.badge || isCurrent) && (
                    <div className={`absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1 ${
                      isCurrent ? "bg-primary/20 text-primary border border-primary/30" : "badge-lime"
                    }`}>
                      {isCurrent ? (
                        <>
                          <Check className="w-3 h-3" />
                          Current Plan
                        </>
                      ) : (
                        <>
                          <Crown className="w-3 h-3" />
                          {plan.badge}
                        </>
                      )}
                    </div>
                  )}
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                    <div className="mt-1">
                      {plan.price !== null && plan.price !== undefined ? (
                        <div className="flex items-baseline gap-1">
                          <span className="text-3xl font-bold text-foreground">${plan.price}</span>
                          <span className="text-sm text-muted-foreground">/month</span>
                        </div>
                      ) : (
                        <p className="text-2xl font-bold text-foreground">{(plan as any).priceLabel || "Contact us"}</p>
                      )}
                    </div>
                    {plan.credits && (
                      <div className="flex items-center gap-1.5 mt-2">
                        <Zap className="w-4 h-4 text-yellow-500" />
                        <span className="text-sm font-medium text-foreground">{plan.credits} credits/mo</span>
                      </div>
                    )}
                    <CardDescription className="mt-2">{plan.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1 space-y-4">
                    {/* Usage limits */}
                    {plan.limits && plan.limits.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Usage Limits</p>
                        {plan.limits.map((l) => (
                          <div key={l.label} className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">{l.label}</span>
                            <span className={`font-medium ${l.value === "Unlimited" ? "text-primary" : "text-foreground"}`}>
                              {l.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Divider between limits and features */}
                    {plan.limits && plan.limits.length > 0 && (
                      <div className="border-t border-border/50" />
                    )}

                    {/* Features */}
                    <ul className="space-y-2">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                  <CardFooter>
                    {isCurrent ? (
                      <Button className="w-full" variant="outline" disabled>
                        <Check className="w-4 h-4 mr-2" />
                        Current Plan
                      </Button>
                    ) : (
                      <Button
                        className="w-full btn-primary-glass"
                        disabled={selecting !== null}
                        onClick={() => handleSelect(plan)}
                      >
                        {selecting === plan.key ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : null}
                        {isUpgrade && plan.isStripe ? `Upgrade to ${plan.name}` : plan.cta}
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
