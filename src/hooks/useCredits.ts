import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export interface CreditsData {
  id: string;
  credits_balance: number;
  credits_used: number;
  credits_monthly_cap: number;
  credits_reset_at: string | null;
  channel_scrapes_used: number;
  channel_scrapes_limit: number;
  plan_type: string | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
  pending_plan_type: string | null;
  pending_plan_effective_date: string | null;
  topup_credits_balance: number;
}

export interface CreditTransaction {
  id: string;
  action: string;
  credits: number;
  cost: number; // alias for credits — kept for backwards compat
  created_at: string;
  metadata: Record<string, any> | null;
}

export function useCredits() {
  const { user } = useAuth();
  const [credits, setCredits] = useState<CreditsData | null>(null);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCredits = async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      // Look up primary client via junction table first
      let clientData: any = null;
      let clientError: any = null;

      const { data: link } = await supabase
        .from("subscriber_clients")
        .select("client_id")
        .eq("subscriber_user_id", user.id)
        .eq("is_primary", true)
        .maybeSingle();

      if (link?.client_id) {
        const result = await supabase
          .from("clients")
          .select("id, credits_balance, credits_used, credits_monthly_cap, credits_reset_at, channel_scrapes_used, channel_scrapes_limit, plan_type, subscription_status, trial_ends_at, pending_plan_type, pending_plan_effective_date, topup_credits_balance")
          .eq("id", link.client_id)
          .single();
        clientData = result.data;
        clientError = result.error;
      } else {
        // Fallback: direct user_id lookup
        const result = await supabase
          .from("clients")
          .select("id, credits_balance, credits_used, credits_monthly_cap, credits_reset_at, channel_scrapes_used, channel_scrapes_limit, plan_type, subscription_status, trial_ends_at, pending_plan_type, pending_plan_effective_date, topup_credits_balance")
          .eq("user_id", user.id)
          .maybeSingle();
        clientData = result.data;
        clientError = result.error;
      }
      if (clientError) throw clientError;
      if (clientData) {
        setCredits({
          id: clientData.id,
          credits_balance: clientData.credits_balance ?? 0,
          credits_used: clientData.credits_used ?? 0,
          credits_monthly_cap: clientData.credits_monthly_cap ?? 0,
          credits_reset_at: clientData.credits_reset_at ?? null,
          channel_scrapes_used: clientData.channel_scrapes_used ?? 0,
          channel_scrapes_limit: clientData.channel_scrapes_limit ?? 0,
          plan_type: clientData.plan_type ?? null,
          subscription_status: clientData.subscription_status ?? null,
          trial_ends_at: clientData.trial_ends_at ?? null,
          pending_plan_type: clientData.pending_plan_type ?? null,
          pending_plan_effective_date: clientData.pending_plan_effective_date ?? null,
          topup_credits_balance: clientData.topup_credits_balance ?? 0,
        });
        const { data: txData } = await supabase
          .from("credit_transactions")
          .select("id, action, credits, created_at, metadata")
          .eq("client_id", clientData.id)
          .order("created_at", { ascending: false })
          .limit(15);
        if (txData) setTransactions(txData.map((t: any) => ({ ...t, cost: t.credits })));
      } else {
        setCredits(null);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load credits");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCredits(); }, [user?.id]);

  // Re-fetch when any component signals a credit deduction (e.g. VideoNode after transcription)
  useEffect(() => {
    const handler = () => { fetchCredits(); };
    window.addEventListener("credits-updated", handler);
    return () => window.removeEventListener("credits-updated", handler);
  }, [user?.id]);

  const percentUsed = credits?.credits_monthly_cap
    ? Math.min(100, Math.round((credits.credits_used / credits.credits_monthly_cap) * 100))
    : 0;
  const scrapePercentUsed = credits?.channel_scrapes_limit
    ? Math.min(100, Math.round((credits.channel_scrapes_used / credits.channel_scrapes_limit) * 100))
    : 0;

  return { credits, transactions, loading, error, percentUsed, scrapePercentUsed, refetch: fetchCredits };
}
