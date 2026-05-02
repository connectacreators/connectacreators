import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
import { X } from "lucide-react";
import { useOutOfCredits } from "@/contexts/OutOfCreditsContext";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const stripePromise = loadStripe(
  "pk_live_51T1wYhCp1qPE081LgFT3WQBCIjLkFTbpqRjKtVIgRk9rXZpQQJcVpWqJuafMFnKlhHFolIlYx7rIy1dSuH8hIjMz00rlJINFjF"
);

const PLANS = [
  { key: "starter" as const, name: "Starter", price: 39, credits: "10,000", scrapes: 8, scripts: 75 },
  { key: "growth" as const, name: "Growth", price: 79, credits: "30,000", scrapes: 15, scripts: 200, popular: true },
  { key: "enterprise" as const, name: "Enterprise", price: 139, credits: "75,000", scrapes: 25, scripts: 500 },
];

type PlanKey = "starter" | "growth" | "enterprise";

export default function OutOfCreditsModal() {
  const { isOpen, hideOutOfCreditsModal } = useOutOfCredits();
  const { user } = useAuth();
  const [phase, setPhase] = useState<"plans" | "checkout">("plans");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handlePlanSelect = async (planKey: PlanKey) => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const { data: refreshed } = await supabase.auth.refreshSession();
      const session = refreshed?.session;
      if (!session) {
        setError("Session expired. Please sign in again.");
        setLoading(false);
        return;
      }
      const { data, error: fnErr } = await supabase.functions.invoke(
        "create-checkout",
        {
          body: { plan_type: planKey, phone: "" },
          headers: { Authorization: `Bearer ${session.access_token}` },
        }
      );
      if (fnErr || !data?.client_secret) {
        setError(fnErr?.message || "Failed to initialize payment");
        setLoading(false);
        return;
      }
      setClientSecret(data.client_secret);
      setPhase("checkout");
    } catch (err: any) {
      setError(err.message || "Payment initialization failed");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    hideOutOfCreditsModal();
    setPhase("plans");
    setClientSecret(null);
    setError(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)" }}
    >
      <div className="bg-white rounded-2xl shadow-2xl overflow-hidden w-full max-w-lg">
        {/* Header */}
        <div
          className="px-7 pt-7 pb-5 relative"
          style={{ background: "linear-gradient(135deg, #0f172a, #1e293b)" }}
        >
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 flex items-center justify-center w-7 h-7 rounded-full transition-colors hover:bg-white/20"
            style={{ background: "rgba(255,255,255,0.1)" }}
          >
            <X className="w-4 h-4 text-white" />
          </button>
          <p className="text-white text-xl font-bold mb-1.5">
            You're out of credits!
          </p>
          <p className="text-slate-400 text-sm">
            Choose a plan to keep going. Upgrade anytime, cancel anytime.
          </p>
        </div>

        {/* Plans phase */}
        {phase === "plans" && (
          <div className="p-5 bg-slate-50 flex flex-col gap-3">
            {PLANS.map((plan) => (
              <button
                key={plan.key}
                onClick={() => handlePlanSelect(plan.key)}
                disabled={loading}
                className="w-full text-left rounded-xl p-4 flex items-center justify-between transition-all disabled:opacity-50 relative"
                style={
                  plan.popular
                    ? { background: "#0f172a", border: "2px solid #3b82f6" }
                    : { background: "#fff", border: "1.5px solid #e2e8f0" }
                }
              >
                {plan.popular && (
                  <span
                    className="absolute -top-2.5 left-4 text-[11px] font-bold px-2.5 py-0.5 rounded-full"
                    style={{ background: "#3b82f6", color: "#fff" }}
                  >
                    MOST POPULAR
                  </span>
                )}
                <div>
                  <p
                    className={`font-bold text-[15px] ${
                      plan.popular ? "text-white" : "text-slate-900"
                    }`}
                  >
                    {plan.name}
                  </p>
                  <p
                    className={`text-xs mt-0.5 ${
                      plan.popular ? "text-slate-400" : "text-slate-500"
                    }`}
                  >
                    {plan.credits} credits · {plan.scripts} scripts ·{" "}
                    {plan.scrapes} scrapes
                  </p>
                </div>
                <div className="text-right flex-shrink-0 ml-4">
                  <p
                    className={`font-extrabold text-lg ${
                      plan.popular ? "text-white" : "text-slate-900"
                    }`}
                  >
                    ${plan.price}
                    <span className="text-xs font-normal text-slate-400">
                      /mo
                    </span>
                  </p>
                  <span
                    className="mt-1.5 inline-block text-xs font-semibold px-3 py-1 rounded-full"
                    style={{
                      background: plan.popular ? "#3b82f6" : "#0f172a",
                      color: "#fff",
                    }}
                  >
                    {loading ? "..." : `Choose ${plan.name}`}
                  </span>
                </div>
              </button>
            ))}
            {error && (
              <p className="text-red-500 text-xs text-center">{error}</p>
            )}
            <button
              onClick={handleClose}
              className="text-slate-400 text-xs text-center mt-1 hover:text-slate-600 transition-colors"
            >
              Maybe later — dismiss
            </button>
          </div>
        )}

        {/* Checkout phase */}
        {phase === "checkout" && clientSecret && (
          <div className="p-5">
            <EmbeddedCheckoutProvider
              stripe={stripePromise}
              options={{ clientSecret }}
            >
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
            <button
              onClick={() => {
                setPhase("plans");
                setClientSecret(null);
              }}
              className="w-full text-center text-xs text-slate-400 hover:text-slate-600 mt-3 transition-colors"
            >
              ← Back to plans
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
