import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";

const VALID_STATUSES = ["active", "trialing", "trial", "pending_contact", "canceling"];
// Fast DB polls: 2s, 3s, 4s, 5s (total ~14s before fallback)
const POLL_DELAYS = [2000, 3000, 4000, 5000];
const MAX_POLLS = POLL_DELAYS.length;

export default function PaymentSuccess() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"checking" | "success" | "proceeding">("checking");
  const [attempt, setAttempt] = useState(0);

  const proceedToDashboard = useCallback((planType?: string) => {
    localStorage.setItem("connecta_just_paid", planType ?? "starter");
    setTimeout(() => navigate("/dashboard"), 2000);
  }, [navigate]);

  const verifySubscription = useCallback(async (pollIndex = 0) => {
    try {
      if (!user) return;

      // Fast path: just check the DB — the Stripe webhook should have updated it
      const { data } = await supabase
        .from("clients")
        .select("plan_type, subscription_status, credits_balance")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data?.plan_type && data?.subscription_status && VALID_STATUSES.includes(data.subscription_status)) {
        setStatus("success");
        proceedToDashboard(data.plan_type);
        return;
      }

      // Still polling — webhook may not have fired yet
      if (pollIndex < MAX_POLLS) {
        setAttempt(pollIndex + 1);
        setTimeout(() => verifySubscription(pollIndex + 1), POLL_DELAYS[pollIndex]);
        return;
      }

      // DB polls exhausted — call check-subscription as a one-time fallback
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await supabase.functions.invoke("check-subscription", {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });

          // Re-check DB after reconciliation
          const { data: refreshed } = await supabase
            .from("clients")
            .select("plan_type, subscription_status")
            .eq("user_id", user.id)
            .maybeSingle();

          if (refreshed?.plan_type && refreshed?.subscription_status && VALID_STATUSES.includes(refreshed.subscription_status)) {
            setStatus("success");
            proceedToDashboard(refreshed.plan_type);
            return;
          }
        }
      } catch {
        // Non-fatal
      }

      // All attempts exhausted — proceed anyway (payment was taken)
      setStatus("proceeding");
      proceedToDashboard();
    } catch {
      if (pollIndex < MAX_POLLS) {
        setAttempt(pollIndex + 1);
        setTimeout(() => verifySubscription(pollIndex + 1), POLL_DELAYS[pollIndex]);
      } else {
        setStatus("proceeding");
        proceedToDashboard();
      }
    }
  }, [user, proceedToDashboard]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/dashboard");
      return;
    }
    setStatus("checking");
    setAttempt(0);
    // Start checking after 2s (give webhook time to fire)
    setTimeout(() => verifySubscription(0), 2000);
  }, [user, loading, navigate, verifySubscription]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <motion.div
        className="text-center max-w-md"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {status === "checking" && (
          <>
            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-foreground mb-2">Verifying your payment...</h1>
            <p className="text-muted-foreground">
              Please wait while we confirm your subscription.
              {attempt > 0 && ` (${attempt + 1}/${MAX_POLLS + 1})`}
            </p>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-foreground mb-2">Payment Successful!</h1>
            <p className="text-muted-foreground">Your subscription is active. Redirecting to dashboard...</p>
          </>
        )}
        {status === "proceeding" && (
          <>
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-foreground mb-2">Payment Received!</h1>
            <p className="text-muted-foreground">Your payment was processed. Taking you to your dashboard now...</p>
          </>
        )}
      </motion.div>
    </div>
  );
}
