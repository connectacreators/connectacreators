// Today's outbound send count per platform, backed by the new
// outbound_daily_log table (one row per tap — outbound_metrics only has
// monthly granularity, which can't drive a live "N/50 today" gauge).
// outbound_daily_log isn't in the generated Supabase types yet (same drift
// class as agency_goals in useAgencyGoals.ts) — table access is cast, not
// the query results.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const outboundDailyLogTable = () => (supabase as any).from("outbound_daily_log");

export interface OutboundDailyLog {
  loading: boolean;
  sentToday: number;
  byPlatform: Record<string, number>;
  logOutbound: (platform: string) => Promise<void>;
}

export function useOutboundDailyLog(): OutboundDailyLog {
  const [loading, setLoading] = useState(true);
  const [byPlatform, setByPlatform] = useState<Record<string, number>>({});

  const refresh = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      setLoading(false);
      return;
    }
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data } = (await outboundDailyLogTable()
      .select("platform")
      .eq("user_id", userId)
      .gte("logged_at", todayStart.toISOString())) as { data: { platform: string }[] | null };

    const counts: Record<string, number> = {};
    for (const row of data || []) {
      counts[row.platform] = (counts[row.platform] || 0) + 1;
    }
    setByPlatform(counts);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh().catch((err) => {
      console.error("useOutboundDailyLog failed", err);
      setLoading(false);
    });
  }, [refresh]);

  const logOutbound = useCallback(
    async (platform: string) => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return;
      await outboundDailyLogTable().insert({ user_id: userId, platform });
      setByPlatform((prev) => ({ ...prev, [platform]: (prev[platform] || 0) + 1 }));
    },
    [],
  );

  const sentToday = Object.values(byPlatform).reduce((sum, n) => sum + n, 0);

  return { loading, sentToday, byPlatform, logOutbound };
}
