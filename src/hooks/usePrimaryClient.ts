import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export interface PrimaryClient {
  id: string;
  name: string;
  plan_type: string | null;
  subscription_status: string | null;
  credits_balance: number;
  credits_used: number;
  credits_monthly_cap: number;
  scripts_used: number;
  script_limit: number;
  channel_scrapes_used: number;
  channel_scrapes_limit: number;
  trial_ends_at: string | null;
  credits_reset_at: string | null;
  stripe_customer_id: string | null;
}

const CLIENT_FIELDS = "id, name, plan_type, subscription_status, credits_balance, credits_used, credits_monthly_cap, scripts_used, script_limit, channel_scrapes_used, channel_scrapes_limit, trial_ends_at, credits_reset_at, stripe_customer_id";

export function usePrimaryClient() {
  const { user } = useAuth();
  const [primaryClientId, setPrimaryClientId] = useState<string | null>(null);
  const [primaryClient, setPrimaryClient] = useState<PrimaryClient | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPrimary = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);

    // Try junction table first
    const { data: link } = await supabase
      .from("subscriber_clients")
      .select(`client_id, clients(${CLIENT_FIELDS})`)
      .eq("subscriber_user_id", user.id)
      .eq("is_primary", true)
      .maybeSingle();

    if (link?.client_id && link.clients) {
      setPrimaryClientId(link.client_id);
      setPrimaryClient(link.clients as unknown as PrimaryClient);
      setLoading(false);
      return;
    }

    // Fallback: direct user_id lookup (for users without junction entry yet)
    const { data: fallback } = await supabase
      .from("clients")
      .select(CLIENT_FIELDS)
      .eq("user_id", user.id)
      .maybeSingle();

    if (fallback) {
      setPrimaryClientId(fallback.id);
      setPrimaryClient(fallback as PrimaryClient);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPrimary();
  }, [user?.id]);

  return { primaryClientId, primaryClient, loading, refetch: fetchPrimary };
}
