import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

const RETRY_DELAYS = [3000, 5000, 8000];

export default function PaymentSuccess() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"checking" | "success" | "error">("checking");
  const [attempt, setAttempt] = useState(0);

  const checkSubscription = useCallback(async (retryIndex = 0) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No session");

      const { data, error } = await supabase.functions.invoke("check-subscription", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error) throw error;
      if (data?.subscribed) {
        setStatus("success");
        setTimeout(() => navigate("/dashboard"), 3000);
        return;
      }

      // Retry with exponential backoff
      if (retryIndex < RETRY_DELAYS.length) {
        setAttempt(retryIndex + 1);
        setTimeout(() => checkSubscription(retryIndex + 1), RETRY_DELAYS[retryIndex]);
      } else {
        setStatus("error");
      }
    } catch {
      if (retryIndex < RETRY_DELAYS.length) {
        setAttempt(retryIndex + 1);
        setTimeout(() => checkSubscription(retryIndex + 1), RETRY_DELAYS[retryIndex]);
      } else {
        setStatus("error");
      }
    }
  }, [navigate]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/dashboard");
      return;
    }
    setStatus("checking");
    setAttempt(0);
    checkSubscription(0);
  }, [user, loading, navigate, checkSubscription]);

  const handleRetry = () => {
    setStatus("checking");
    setAttempt(0);
    checkSubscription(0);
  };

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
              {attempt > 0 && ` (Attempt ${attempt + 1}/${RETRY_DELAYS.length + 1})`}
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
        {status === "error" && (
          <>
            <h1 className="text-2xl font-bold text-foreground mb-2">Something went wrong</h1>
            <p className="text-muted-foreground mb-4">We couldn't verify your subscription. Please try again or contact support.</p>
            <div className="flex flex-col gap-2 items-center">
              <Button onClick={handleRetry} className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Retry Verification
              </Button>
              <button
                onClick={() => navigate("/dashboard")}
                className="text-primary underline text-sm"
              >
                Go to Dashboard
              </button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
