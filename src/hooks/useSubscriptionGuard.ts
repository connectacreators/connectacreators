import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export interface SubscriptionData {
  plan_type: string | null;
  subscription_status: string | null;
}

const VALID_STATUSES = ["active", "trialing", "trial", "pending_contact", "canceling", "connecta_plus"];

function isValidStatus(status: string | null): boolean {
  return status !== null && VALID_STATUSES.includes(status);
}

/**
 * Hook that checks subscription_status from the clients table.
 * If the DB shows no valid subscription, reconciles with Stripe via check-subscription
 * before redirecting — prevents false negatives from timing/sync issues.
 */
export function useSubscriptionGuard(options?: { skipRedirect?: boolean; skipReconcile?: boolean }) {
  const { user, loading, isAdmin, isVideographer, isConnectaPlus, isEditor } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [hasValidSubscription, setHasValidSubscription] = useState(false);
  const [subscriptionData, setSubscriptionData] = useState<SubscriptionData>({
    plan_type: null,
    subscription_status: null,
  });

  useEffect(() => {
    if (loading) return;

    // Admin, videographer, editor, and connecta_plus roles bypass subscription check
    if (isAdmin || isVideographer || isConnectaPlus || isEditor) {
      setHasValidSubscription(true);
      setChecking(false);
      return;
    }

    if (!user) {
      setChecking(false);
      return;
    }

    const checkAndReconcile = async () => {
      // Step 1: Query primary client via junction table
      let data: { subscription_status: string | null; plan_type: string | null } | null = null;
      let error: any = null;

      const { data: link } = await supabase
        .from("subscriber_clients")
        .select("client_id")
        .eq("subscriber_user_id", user.id)
        .eq("is_primary", true)
        .maybeSingle();

      if (link?.client_id) {
        const result = await supabase
          .from("clients")
          .select("subscription_status, plan_type")
          .eq("id", link.client_id)
          .single();
        data = result.data;
        error = result.error;
      } else {
        // Fallback: direct user_id lookup
        const result = await supabase
          .from("clients")
          .select("subscription_status, plan_type")
          .eq("user_id", user.id)
          .maybeSingle();
        data = result.data;
        error = result.error;
      }

      if (error) {
        console.error("Error fetching subscription:", error);
        setChecking(false);
        return;
      }

      const statusOk = isValidStatus(data?.subscription_status ?? null);
      const planOk = !!data?.plan_type;

      if (data && statusOk && planOk) {
        // Happy path: DB shows active subscription
        setHasValidSubscription(true);
        setSubscriptionData(data);
        setChecking(false);
        return;
      }

      // Step 2: DB doesn't show a valid subscription — reconcile with Stripe before redirecting
      // Skip the slow edge function call if caller says so (e.g. just came from PaymentSuccess)
      if (!options?.skipReconcile) {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          if (sessionData?.session) {
            await supabase.functions.invoke("check-subscription", {
              headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
            });

            // Step 3: Re-query after reconciliation (use same primary client lookup)
            let refreshed: { subscription_status: string | null; plan_type: string | null } | null = null;
            if (link?.client_id) {
              const r = await supabase.from("clients").select("subscription_status, plan_type").eq("id", link.client_id).single();
              refreshed = r.data;
            } else {
              const r = await supabase.from("clients").select("subscription_status, plan_type").eq("user_id", user.id).maybeSingle();
              refreshed = r.data;
            }

            if (refreshed && isValidStatus(refreshed.subscription_status) && refreshed.plan_type) {
              setHasValidSubscription(true);
              setSubscriptionData(refreshed);
              setChecking(false);
              return;
            }
          }
        } catch (reconcileErr) {
          console.error("Reconcile check-subscription failed:", reconcileErr);
        }
      }

      // Step 4: No valid subscription — redirect to signup wizard
      if (!data?.plan_type || !data?.subscription_status) {
        setHasValidSubscription(false);
        setSubscriptionData({ plan_type: data?.plan_type ?? null, subscription_status: data?.subscription_status ?? null });
        setChecking(false);
        if (!options?.skipRedirect) {
          navigate("/signup");
        }
        return;
      }
      setHasValidSubscription(false);
      setSubscriptionData({ plan_type: data?.plan_type ?? null, subscription_status: data?.subscription_status ?? null });
      if (!options?.skipRedirect) {
        navigate("/signup");
      }
      setChecking(false);
    };

    checkAndReconcile();
  }, [user, loading, isAdmin, isVideographer, isConnectaPlus, isEditor, navigate, options?.skipRedirect]);

  return { checking, hasValidSubscription, subscriptionData };
}
