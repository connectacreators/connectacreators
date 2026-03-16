import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Loader2, Crown, LogOut } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

const plans = [
  {
    key: "starter",
    name: "Starter",
    price: "$45/month",
    description: "Perfect for beginners getting started with Connecta.",
    features: [
      "Access to Connecta CRM",
      "Up to 75 scripts per month",
      "Script generator access",
      "Save and organize scripts",
    ],
    isStripe: true,
    data: { plan_type: "starter", subscription_status: "pending_contact" },
    cta: "Select Starter",
  },
  {
    key: "growth",
    name: "Growth",
    price: "$90/month",
    description: "Best for active creators and businesses.",
    features: [
      "Access to Connecta CRM",
      "Up to 200 scripts per month",
      "Script generator access",
      "Save and organize scripts",
    ],
    isStripe: true,
    data: { plan_type: "growth", subscription_status: "pending_contact" },
    cta: "Select Growth",
  },
  {
    key: "enterprise",
    name: "Enterprise",
    price: "$150/month",
    description: "Best for businesses actively generating leads.",
    badge: "Most Popular",
    features: [
      "Access to Connecta CRM",
      "Up to 500 scripts per month",
      "Lead tracker access",
      "Facebook lead integration",
      "Automatic syncing of leads",
    ],
    isStripe: true,
    data: { plan_type: "enterprise", subscription_status: "pending_contact" },
    cta: "Select Enterprise",
  },
  {
    key: "connecta_dfy",
    name: "Connecta Plan",
    price: "Contact our team",
    description: "We fully build and manage your system for you.",
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
    price: "Contact our team",
    description: "Full automation, ads management, and AI-powered follow-up.",
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

export default function SelectPlan() {
  const { user, loading, isAdmin, isVideographer, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isUpgrade = searchParams.get("upgrade") === "true";

  const [clientId, setClientId] = useState<string | null>(null);
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/dashboard");
      return;
    }
    if (user && (isAdmin || isVideographer)) {
      navigate("/dashboard");
      return;
    }
    if (user) {
      supabase
        .from("clients")
        .select("id, plan_type, subscription_status")
        .eq("user_id", user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (!isUpgrade && data?.plan_type && data.subscription_status === "active") {
            navigate("/dashboard");
          } else if (data) {
            setClientId(data.id);
            setCurrentPlan(data.plan_type);
          }
        });
    }
  }, [user, loading, isAdmin, isVideographer, navigate, isUpgrade]);

  const handleUpgrade = async (planKey: string) => {
    setSelecting(planKey);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("upgrade-subscription", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: { new_plan_type: planKey },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Upgraded to ${planKey.charAt(0).toUpperCase() + planKey.slice(1)} plan!`);
      navigate("/subscription");
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
          className="text-center mb-12"
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

        <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 ${!isUpgrade ? "xl:grid-cols-5" : ""} gap-6`}>
          {visiblePlans.map((plan, i) => (
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
                }`}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 badge-lime text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1">
                    <Crown className="w-3 h-3" />
                    {plan.badge}
                  </div>
                )}
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                  <p className="text-2xl font-bold text-foreground mt-1">{plan.price}</p>
                  <CardDescription className="mt-2">{plan.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  <ul className="space-y-2.5">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
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
                </CardFooter>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
