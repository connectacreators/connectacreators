import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { t, tr } from "@/i18n/translations";
import { useLanguage } from "@/hooks/useLanguage";
import { toast } from "sonner";
import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { Check } from "lucide-react";

const stripePromise = loadStripe(
  "pk_live_51T1wYhCp1qPE081LgFT3WQBCIjLkFTbpqRjKtVIgRk9rXZpQQJcVpWqJuafMFnKlhHFolIlYx7rIy1dSuH8hIjMz00rlJINFjF"
);

const PLANS = [
  { key: "starter" as const, name: "planStarter", price: 39, credits: "10,000", scrapes: 5, scripts: 75 },
  { key: "growth" as const, name: "planGrowth", price: 79, credits: "30,000", scrapes: 10, scripts: 200, popular: true },
  { key: "enterprise" as const, name: "planPro", price: 139, credits: "75,000", scrapes: 15, scripts: 500 },
] as const;

type PlanKey = "starter" | "growth" | "enterprise";

export default function Signup() {
  const { user, signUpWithEmail, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { language } = useLanguage();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<PlanKey | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // On mount / auth change: check if user already has subscription or needs to advance
  useEffect(() => {
    const checkUserState = async () => {
      if (authLoading) return;
      if (!user) {
        setCheckingAuth(false);
        setStep(1);
        return;
      }
      // User is authenticated — check if they have a subscription
      const { data } = await supabase
        .from("clients")
        .select("subscription_status, plan_type")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data?.subscription_status && ["active", "trialing", "canceling"].includes(data.subscription_status)) {
        // Already subscribed → dashboard
        navigate("/dashboard", { replace: true });
        return;
      }
      // Authenticated but no subscription → Step 2
      setStep(2);
      setCheckingAuth(false);
    };
    checkUserState();
  }, [user, authLoading, navigate]);

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: signupErr } = await signUpWithEmail(email, password, fullName.trim());
    if (signupErr) {
      setError(signupErr.message);
      setLoading(false);
      return;
    }

    // Create minimal client record
    const { data: { user: newUser } } = await supabase.auth.getUser();
    if (newUser) {
      await supabase.from("clients").upsert({
        user_id: newUser.id,
        name: fullName.trim(),
        email: email,
        plan_type: null,
        subscription_status: null,
      }, { onConflict: "user_id" });
    }

    setLoading(false);
    setStep(2);
  };

  const handleGoogleSignup = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/signup`,
      },
    });
    if (error) toast.error(error.message);
  };

  const fetchClientSecret = useCallback(async () => {
    if (!user || !selectedPlan) return;
    setLoading(true);
    setError(null);

    try {
      const { data: refreshed } = await supabase.auth.refreshSession();
      const session = refreshed?.session;
      if (!session) {
        toast.error("Session expired. Please sign in again.");
        setStep(1);
        setLoading(false);
        return;
      }

      const { data, error: fnErr } = await supabase.functions.invoke("create-checkout", {
        body: { plan_type: selectedPlan, phone },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (fnErr || !data?.client_secret) {
        setError(fnErr?.message || "Failed to initialize payment");
        setLoading(false);
        return;
      }

      setClientSecret(data.client_secret);
    } catch (err: any) {
      setError(err.message || "Payment initialization failed");
    } finally {
      setLoading(false);
    }
  }, [user, selectedPlan, phone]);

  // Fetch Stripe client secret when entering Step 3
  useEffect(() => {
    if (step === 3 && !clientSecret && user && selectedPlan) {
      fetchClientSecret();
    }
  }, [step, clientSecret, user, selectedPlan, fetchClientSecret]);

  // Progress bar component
  const ProgressBar = () => (
    <div className="flex justify-center items-center gap-2 mb-6">
      {[1, 2, 3].map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
              s < step
                ? "bg-green-600 text-white"
                : s === step
                ? "bg-green-600 text-white"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {s < step ? <Check className="w-4 h-4" /> : s}
          </div>
          {i < 2 && (
            <div className={`w-8 h-0.5 ${s < step ? "bg-green-600" : "bg-muted"}`} />
          )}
        </div>
      ))}
    </div>
  );

  if (checkingAuth || authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-card border border-border rounded-xl p-8 shadow-lg">
          {/* Header */}
          <div className="text-center mb-6">
            <h1 className="text-xl font-bold text-primary tracking-wide">CONNECTA CREATORS</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {step === 1 && tr(t.signup.startTrial, language)}
              {step === 2 && tr(t.signup.choosePlan, language)}
              {step === 3 && tr(t.signup.completeReg, language)}
            </p>
          </div>

          <ProgressBar />

          {/* Step 1: Your Info */}
          {step === 1 && (
            <form onSubmit={handleEmailSignup} className="space-y-3">
              <div className="text-xs font-semibold text-primary uppercase tracking-wide mb-2">
                {tr(t.signup.yourInfo, language)}
              </div>

              <input
                type="text"
                placeholder={tr(t.signup.fullName, language)}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="w-full px-3 py-2.5 rounded-lg bg-muted border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <input
                type="email"
                placeholder={tr(t.signup.email, language)}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2.5 rounded-lg bg-muted border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <input
                type="password"
                placeholder={tr(t.signup.password, language)}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-3 py-2.5 rounded-lg bg-muted border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <input
                type="tel"
                placeholder={tr(t.signup.phone, language)}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-muted border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />

              {error && (
                <p className="text-red-500 text-xs">{error}</p>
              )}

              <div className="flex items-center gap-3 my-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-muted-foreground text-xs">{tr(t.signup.orDivider, language)}</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <button
                type="button"
                onClick={handleGoogleSignup}
                className="w-full py-2.5 rounded-lg bg-muted border border-border text-foreground text-sm hover:bg-muted/80 transition-colors flex items-center justify-center gap-2"
              >
                <span className="text-orange-400 font-bold">G</span>
                {tr(t.signup.signUpGoogle, language)}
              </button>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-lg bg-green-600 hover:bg-green-700 text-white font-bold text-sm transition-colors disabled:opacity-50"
              >
                {loading ? "..." : `${tr(t.signup.nextChoosePlan, language)} →`}
              </button>

              <p className="text-center text-xs text-muted-foreground mt-3">
                {tr(t.signup.alreadyAccount, language)}{" "}
                <a href="/scripts" className="text-primary hover:underline">
                  {tr(t.signup.signInLink, language)}
                </a>
              </p>
            </form>
          )}

          {/* Step 2: Choose Plan */}
          {step === 2 && (
            <div className="space-y-3">
              <div className="text-xs font-semibold text-primary uppercase tracking-wide mb-2">
                {tr(t.signup.choosePlan, language)}
              </div>

              {PLANS.map((plan) => (
                <button
                  key={plan.key}
                  type="button"
                  onClick={() => setSelectedPlan(plan.key)}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-colors relative ${
                    selectedPlan === plan.key
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/30"
                  }`}
                >
                  {plan.popular && (
                    <span className="absolute -top-2.5 right-3 bg-green-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
                      {tr(t.signup.popular, language)}
                    </span>
                  )}
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-bold text-foreground">
                        {tr(t.signup[plan.name as keyof typeof t.signup], language)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {plan.credits} {tr(t.signup.credits, language)} · {plan.scrapes} {tr(t.signup.channelScrapes, language)} · {plan.scripts} {tr(t.signup.scripts, language)}
                      </div>
                    </div>
                    <div className="text-primary font-bold text-lg">
                      ${plan.price}<span className="text-xs text-muted-foreground font-normal">{tr(t.signup.perMonth, language)}</span>
                    </div>
                  </div>
                </button>
              ))}

              <p className="text-center text-xs text-green-500 mt-2">
                ✓ {tr(t.signup.trialBanner, language)}
              </p>

              <button
                onClick={() => setStep(3)}
                disabled={!selectedPlan}
                className="w-full py-3 rounded-lg bg-green-600 hover:bg-green-700 text-white font-bold text-sm transition-colors disabled:opacity-50 mt-2"
              >
                {`${tr(t.signup.nextPayment, language)} →`}
              </button>

              <button
                onClick={() => { if (!user) setStep(1); }}
                className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                ← {tr(t.signup.back, language)}
              </button>
            </div>
          )}

          {/* Step 3: Payment */}
          {step === 3 && (
            <div className="space-y-4">
              {/* Order Summary */}
              <div className="bg-muted rounded-lg p-4 border border-border">
                <div className="text-xs text-muted-foreground uppercase mb-2">
                  {tr(t.signup.orderSummary, language)}
                </div>
                <div className="flex justify-between items-center mb-1">
                  <span className="font-semibold text-foreground">
                    {selectedPlan && tr(t.signup[PLANS.find(p => p.key === selectedPlan)!.name as keyof typeof t.signup], language)} Plan
                  </span>
                  <span className="text-primary font-semibold">
                    ${PLANS.find(p => p.key === selectedPlan)?.price}{tr(t.signup.perMonth, language)}
                  </span>
                </div>
                <p className="text-xs text-green-500">
                  {tr(t.signup.freeTrial, language)} — {tr(t.signup.firstCharge, language)}{" "}
                  {new Date(Date.now() + 7 * 86400000).toLocaleDateString(language === "es" ? "es-ES" : "en-US", { month: "short", day: "numeric" })}
                </p>
                <div className="border-t border-border mt-3 pt-3 text-xs text-muted-foreground">
                  {tr(t.signup.todayCharge, language)}: <span className="text-green-500 font-bold">$0.00</span>
                </div>
              </div>

              {/* Stripe Embedded Checkout */}
              {clientSecret ? (
                <div className="border border-border rounded-lg overflow-hidden min-h-[300px]">
                  <EmbeddedCheckoutProvider stripe={stripePromise} options={{ clientSecret }}>
                    <EmbeddedCheckout />
                  </EmbeddedCheckoutProvider>
                </div>
              ) : loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : error ? (
                <div className="text-center py-8">
                  <p className="text-red-500 text-sm mb-3">{error}</p>
                  <button onClick={fetchClientSecret} className="text-primary text-sm hover:underline">
                    Try again
                  </button>
                </div>
              ) : null}

              <button
                onClick={() => { setStep(2); setClientSecret(null); }}
                className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                ← {tr(t.signup.back, language)}
              </button>

              <p className="text-center text-[10px] text-muted-foreground">
                {tr(t.signup.termsNotice, language)}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
