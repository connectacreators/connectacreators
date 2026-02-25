import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export interface SubscriptionData {
  plan_type: string | null;
  subscription_status: string | null;
}

/**
 * Hook that checks subscription_status from the clients table.
 * Redirects to /select-plan if not active or pending_contact.
 * Admin and videographer roles bypass this check automatically.
 *
 * Returns:
 * - checking: boolean - true while loading
 * - hasValidSubscription: boolean - true if subscription is active/valid
 * - subscriptionData: SubscriptionData - plan and status info
 */
export function useSubscriptionGuard(options?: { skipRedirect?: boolean }) {
  const { user, loading, isAdmin, isVideographer } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [hasValidSubscription, setHasValidSubscription] = useState(false);
  const [subscriptionData, setSubscriptionData] = useState<SubscriptionData>({
    plan_type: null,
    subscription_status: null,
  });

  useEffect(() => {
    if (loading) return;

    // Admin and videographer roles bypass subscription check
    if (isAdmin || isVideographer) {
      setHasValidSubscription(true);
      setChecking(false);
      return;
    }

    if (!user) {
      setChecking(false);
      return;
    }

    supabase
      .from("clients")
      .select("subscription_status, plan_type")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error("Error fetching subscription:", error);
          setChecking(false);
          return;
        }

        if (!data || !data.plan_type) {
          setHasValidSubscription(false);
          setSubscriptionData({ plan_type: null, subscription_status: null });
          if (!options?.skipRedirect) {
            navigate("/select-plan");
          }
        } else if (
          data.subscription_status === "active" ||
          data.subscription_status === "pending_contact" ||
          data.subscription_status === "canceling"
        ) {
          setHasValidSubscription(true);
          setSubscriptionData(data);
        } else {
          setHasValidSubscription(false);
          setSubscriptionData(data);
          if (!options?.skipRedirect) {
            navigate("/select-plan");
          }
        }
        setChecking(false);
      });
  }, [user, loading, isAdmin, isVideographer, navigate, options?.skipRedirect]);

  return { checking, hasValidSubscription, subscriptionData };
}
