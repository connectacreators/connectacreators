import { useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
import { X } from "lucide-react";
import { useOutOfCredits } from "@/contexts/OutOfCreditsContext";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import connectaFavicon from "@/assets/connecta-favicon-icon.png";

const stripePromise = loadStripe(
  "pk_live_51T1wYhCp1qPE081LgFT3WQBCIjLkFTbpqRjKtVIgRk9rXZpQQJcVpWqJuafMFnKlhHFolIlYx7rIy1dSuH8hIjMz00rlJINFjF"
);

const PLANS = [
  { key: "starter" as const,    name: "Starter",    price: 39,  credits: "10,000", scrapes: 8,  scripts: 75 },
  { key: "growth" as const,     name: "Growth",     price: 79,  credits: "30,000", scrapes: 15, scripts: 200, recommended: true },
  { key: "enterprise" as const, name: "Enterprise", price: 139, credits: "75,000", scrapes: 25, scripts: 500 },
];

type PlanKey = "starter" | "growth" | "enterprise";

export default function OutOfCreditsModal() {
  const { isOpen, hideOutOfCreditsModal } = useOutOfCredits();
  const { user, isAdmin, isVideographer, isEditor, isConnectaPlus } = useAuth();
  const [phase, setPhase] = useState<"plans" | "checkout">("plans");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingKey, setLoadingKey] = useState<PlanKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    hideOutOfCreditsModal();
    setPhase("plans");
    setClientSecret(null);
    setError(null);
  };

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen]);

  if (!isOpen || isAdmin || isVideographer || isEditor || isConnectaPlus) return null;

  const handlePlanSelect = async (planKey: PlanKey) => {
    if (!user) return;
    setLoading(true);
    setLoadingKey(planKey);
    setError(null);
    try {
      const { data: refreshed } = await supabase.auth.refreshSession();
      const session = refreshed?.session;
      if (!session) {
        setError("Session expired. Please sign in again.");
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
        return;
      }
      setClientSecret(data.client_secret);
      setPhase("checkout");
    } catch (err: any) {
      setError(err.message || "Payment initialization failed");
    } finally {
      setLoading(false);
      setLoadingKey(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(15,15,18,0.7)", backdropFilter: "blur(8px)" }}
      onClick={handleClose}
    >
      <div
        className="w-full max-w-md rounded-2xl px-10 py-12 relative"
        style={{ background: "#16171a", border: "1px solid rgba(255,255,255,0.08)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/[0.05] transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        {/* Header */}
        <div className="text-center mb-7">
          <img src={connectaFavicon} alt="Connecta" className="w-10 h-10 object-contain mx-auto mb-5 opacity-90" />
          <h2 className="font-caslon text-xl sm:text-2xl font-light text-foreground leading-snug" style={{ letterSpacing: "0.02em" }}>
            You're out of credits
          </h2>
          <p className="text-xs text-muted-foreground mt-2 tracking-wide">
            Choose a plan to keep going. Cancel anytime.
          </p>
        </div>

        {/* Plans phase */}
        {phase === "plans" && (
          <div className="flex flex-col gap-3">
            {PLANS.map((plan) => {
              const isLoadingThis = loadingKey === plan.key;
              return (
                <button
                  key={plan.key}
                  onClick={() => handlePlanSelect(plan.key)}
                  disabled={loading}
                  className="group relative w-full text-left rounded-xl px-5 py-4 flex items-center justify-between transition-colors disabled:opacity-50"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: `1px solid rgba(255,255,255,${plan.recommended ? "0.18" : "0.08"})`,
                  }}
                  onMouseEnter={(e) => { if (!loading) e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = `rgba(255,255,255,${plan.recommended ? "0.18" : "0.08"})`; }}
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-caslon text-base text-foreground" style={{ letterSpacing: "0.04em" }}>
                        {plan.name}
                      </span>
                      {plan.recommended && (
                        <span className="text-[9px] font-medium tracking-[0.2em] uppercase text-foreground/50">
                          recommended
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-muted-foreground/70">
                      {plan.credits} credits · {plan.scripts} scripts · {plan.scrapes} scrapes
                    </span>
                  </div>
                  <div className="text-right flex-shrink-0 ml-4">
                    <div className="text-foreground/85 text-base font-medium">
                      ${plan.price}
                      <span className="text-xs font-normal text-muted-foreground/60">/mo</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                      {isLoadingThis ? "loading…" : "select →"}
                    </div>
                  </div>
                </button>
              );
            })}

            {error && (
              <p className="text-red-400/80 text-xs text-center mt-1">{error}</p>
            )}

            <button
              onClick={handleClose}
              className="text-xs text-muted-foreground/60 hover:text-foreground text-center mt-3 transition-colors"
            >
              Maybe later
            </button>
          </div>
        )}

        {/* Checkout phase */}
        {phase === "checkout" && clientSecret && (
          <div>
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
              className="w-full text-center text-xs text-muted-foreground/60 hover:text-foreground mt-4 transition-colors"
            >
              ← Back to plans
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
