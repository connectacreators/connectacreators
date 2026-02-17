import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

/**
 * Hook that checks subscription_status from the clients table.
 * Redirects to /select-plan if not active or pending_contact.
 * Admin users bypass this check.
 * Returns { checking: true } while the check is in progress.
 */
export function useSubscriptionGuard() {
  const { user, loading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setChecking(false);
      return;
    }
    if (isAdmin) {
      setChecking(false);
      return;
    }

    supabase
      .from("clients")
      .select("subscription_status, plan_type")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data || !data.plan_type) {
          navigate("/select-plan");
        } else if (
          data.subscription_status !== "active" &&
          data.subscription_status !== "pending_contact"
        ) {
          navigate("/select-plan");
        }
        setChecking(false);
      });
  }, [user, loading, isAdmin, navigate]);

  return { checking };
}
