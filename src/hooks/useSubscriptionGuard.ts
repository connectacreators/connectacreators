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

// ── Subscription cache (5 min TTL) — eliminates repeated DB + Stripe calls ──
const SUB_CACHE_TTL = 5 * 60 * 1000;

function getCachedSub(userId: string): { hasValid: boolean; data: SubscriptionData } | null {
  try {
    const raw = sessionStorage.getItem(`sub_cache_${userId}`);
    if (!raw) return null;
    const { ts, hasValid, data } = JSON.parse(raw);
    if (Date.now() - ts > SUB_CACHE_TTL) { sessionStorage.removeItem(`sub_cache_${userId}`); return null; }
    return { hasValid, data };
  } catch { return null; }
}

function setCachedSub(userId: string, hasValid: boolean, data: SubscriptionData) {
  try {
    sessionStorage.setItem(`sub_cache_${userId}`, JSON.stringify({ ts: Date.now(), hasValid, data }));
  } catch { /* ignore quota errors */ }
}

export function invalidateSubCache(userId: string) {
  try { sessionStorage.removeItem(`sub_cache_${userId}`); } catch { /* ignore */ }
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
      // Cache hit: skip all DB + Stripe calls for 5 minutes
      const cached = getCachedSub(user.id);
      if (cached) {
        setHasValidSubscription(cached.hasValid);
        setSubscriptionData(cached.data);
        setChecking(false);
        if (!cached.hasValid && !options?.skipRedirect) navigate("/signup");
        return;
      }

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
          .select("subscription_status, plan_type, credits_balance")
          .eq("id", link.client_id)
          .single();
        data = result.data;
        error = result.error;
      } else {
        // Fallback: direct user_id lookup
        const result = await supabase
          .from("clients")
          .select("subscription_status, plan_type, credits_balance")
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
      const hasCredits = (data?.credits_balance ?? 0) > 0;

      if (data && planOk && (statusOk || hasCredits)) {
        // Happy path: valid subscription OR user still has credits remaining
        setCachedSub(user.id, true, data);
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
            let refreshed: { subscription_status: string | null; plan_type: string | null; credits_balance: number | null } | null = null;
            if (link?.client_id) {
              const r = await supabase.from("clients").select("subscription_status, plan_type, credits_balance").eq("id", link.client_id).single();
              refreshed = r.data;
            } else {
              const r = await supabase.from("clients").select("subscription_status, plan_type, credits_balance").eq("user_id", user.id).maybeSingle();
              refreshed = r.data;
            }

            const refreshedHasCredits = (refreshed?.credits_balance ?? 0) > 0;
            if (refreshed && refreshed.plan_type && (isValidStatus(refreshed.subscription_status) || refreshedHasCredits)) {
              setCachedSub(user.id, true, refreshed);
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
