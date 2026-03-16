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
      const { data: clientData, error: clientError } = await supabase
        .from("clients")
        .select("id, credits_balance, credits_used, credits_monthly_cap, credits_reset_at, channel_scrapes_used, channel_scrapes_limit, plan_type, subscription_status, trial_ends_at")
        .eq("user_id", user.id)
        .maybeSingle();
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

  const percentUsed = credits?.credits_monthly_cap
    ? Math.min(100, Math.round((credits.credits_used / credits.credits_monthly_cap) * 100))
    : 0;
  const scrapePercentUsed = credits?.channel_scrapes_limit
    ? Math.min(100, Math.round((credits.channel_scrapes_used / credits.channel_scrapes_limit) * 100))
    : 0;

  return { credits, transactions, loading, error, percentUsed, scrapePercentUsed, refetch: fetchCredits };
}
