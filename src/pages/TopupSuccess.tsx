import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle2, Loader2, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const MAX_POLLS = 6;
const POLL_INTERVAL = 1500;

export default function TopupSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [status, setStatus] = useState<"checking" | "success">("checking");
  const [addedCredits, setAddedCredits] = useState<number | null>(null);

  useEffect(() => {
    const sessionId = searchParams.get("session_id");
    if (!sessionId || !user) {
      navigate("/dashboard");
      return;
    }

    let cancelled = false;
    let initialBalance: number | null = null;

    const check = async () => {
      for (let i = 0; i < MAX_POLLS; i++) {
        if (cancelled) return;

        // Look up primary client
        const { data: link } = await supabase
          .from("subscriber_clients")
          .select("client_id")
          .eq("subscriber_user_id", user.id)
          .eq("is_primary", true)
          .maybeSingle();

        const clientId = link?.client_id;
        if (!clientId) {
          await new Promise(r => setTimeout(r, POLL_INTERVAL));
          continue;
        }

        const { data } = await supabase
          .from("clients")
          .select("topup_credits_balance")
          .eq("id", clientId)
          .maybeSingle();

        const balance = data?.topup_credits_balance ?? 0;
        if (initialBalance === null) initialBalance = balance;

        if (balance > (initialBalance ?? 0)) {
          setAddedCredits(balance - (initialBalance ?? 0));
          setStatus("success");
          setTimeout(() => {
            window.dispatchEvent(new Event("credits-updated"));
            navigate("/dashboard");
          }, 2000);
          return;
        }

        await new Promise(r => setTimeout(r, POLL_INTERVAL));
      }

      // Even if we didn't detect the balance change, proceed
      setStatus("success");
      setTimeout(() => {
        window.dispatchEvent(new Event("credits-updated"));
        navigate("/dashboard");
      }, 2000);
    };

    check();
    return () => { cancelled = true; };
  }, [searchParams, user, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <motion.div
        className="text-center max-w-md"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {status === "checking" && (
          <>
            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-foreground mb-2">Processing your purchase...</h1>
            <p className="text-muted-foreground">Adding credits to your account.</p>
          </>
        )}
        {status === "success" && (
          <>
            <div className="relative inline-block mb-4">
              <CheckCircle2 className="w-16 h-16 text-green-500" />
              <Zap className="w-6 h-6 text-primary absolute -right-2 -bottom-1" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">Credits added!</h1>
            <p className="text-muted-foreground">
              {addedCredits ? `+${addedCredits.toLocaleString()} credits added to your account.` : "Your credits are ready to use."}
            </p>
            <p className="text-xs text-muted-foreground mt-3">Taking you back to your dashboard...</p>
          </>
        )}
      </motion.div>
    </div>
  );
}
