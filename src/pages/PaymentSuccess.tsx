import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";

export default function PaymentSuccess() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"checking" | "success" | "error">("checking");

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/dashboard");
      return;
    }

    const checkSubscription = async () => {
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
        } else {
          // Retry once after a short delay (Stripe may take a moment)
          setTimeout(async () => {
            const { data: retryData } = await supabase.functions.invoke("check-subscription", {
              headers: { Authorization: `Bearer ${session.access_token}` },
            });
            if (retryData?.subscribed) {
              setStatus("success");
              setTimeout(() => navigate("/dashboard"), 3000);
            } else {
              setStatus("error");
            }
          }, 3000);
        }
      } catch {
        setStatus("error");
      }
    };

    checkSubscription();
  }, [user, loading, navigate]);

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
            <p className="text-muted-foreground">Please wait while we confirm your subscription.</p>
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
            <button
              onClick={() => navigate("/dashboard")}
              className="text-primary underline"
            >
              Go to Dashboard
            </button>
          </>
        )}
      </motion.div>
    </div>
  );
}
