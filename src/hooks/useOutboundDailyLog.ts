// Today's outbound activity, backed by outbound_daily_log — one signed
// delta row per stepper change on /outbound (and per quick-tap on the
// Command Deck gauge). outbound_metrics only has monthly granularity, so
// it can't drive a live "N/50 today" readout; this table is where the
// day-level truth lives. Neither table is in the generated Supabase types
// yet (same drift class as agency_goals in useAgencyGoals.ts) — table
// access is cast, not the query results.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const dailyLogTbl = () => (supabase as any).from("outbound_daily_log");
const metricsTbl = () => (supabase as any).from("outbound_metrics");

// The gauge's compact platform chips vs the funnel's stored platform keys.
const PLATFORM_KEY: Record<string, string> = {
  IG: "instagram",
  TikTok: "tiktok",
  FB: "facebook",
  LI: "linkedin",
  X: "x",
};

const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

interface DayRow {
  platform: string;
  stage: string;
  delta: number;
}

export interface OutboundDailyLog {
  loading: boolean;
  /** DMs sent today — the "initiated" funnel stage. */
  sentToday: number;
  /** Replies/conversations today — the "engaged" funnel stage. */
  engagedToday: number;
  byPlatform: Record<string, number>;
  logOutbound: (platform: string) => Promise<void>;
}

export function useOutboundDailyLog(): OutboundDailyLog {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<DayRow[]>([]);

  const refresh = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      setLoading(false);
      return;
    }
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data } = (await dailyLogTbl()
      .select("platform, stage, delta")
      .eq("user_id", userId)
      .gte("logged_at", todayStart.toISOString())) as { data: DayRow[] | null };

    setRows(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh().catch((err) => {
      console.error("useOutboundDailyLog failed", err);
      setLoading(false);
    });
  }, [refresh]);

  // A quick-tap on the gauge is a real send, so it has to land in the
  // monthly funnel too — otherwise /outbound and the gauge drift apart
  // again, which is the exact bug this table was reconnected to fix.
  const logOutbound = useCallback(async (platform: string) => {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return;
    const platformKey = PLATFORM_KEY[platform] ?? platform.toLowerCase();
    const month = thisMonth();

    await dailyLogTbl().insert({
      user_id: userId,
      platform: platformKey,
      stage: "initiated",
      delta: 1,
    });

    const { data: cur } = (await metricsTbl()
      .select("initiated")
      .eq("user_id", userId)
      .eq("platform", platformKey)
      .eq("month", month)
      .maybeSingle()) as { data: { initiated: number } | null };

    await metricsTbl().upsert(
      {
        user_id: userId,
        platform: platformKey,
        month,
        initiated: (cur?.initiated ?? 0) + 1,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,platform,month" },
    );

    setRows((prev) => [...prev, { platform: platformKey, stage: "initiated", delta: 1 }]);
  }, []);

  const sumStage = (stage: string) =>
    rows.reduce((sum, r) => (r.stage === stage ? sum + r.delta : sum), 0);

  const byPlatform: Record<string, number> = {};
  for (const [chip, key] of Object.entries(PLATFORM_KEY)) {
    const n = rows.reduce(
      (sum, r) => (r.stage === "initiated" && r.platform === key ? sum + r.delta : sum),
      0,
    );
    if (n) byPlatform[chip] = n;
  }

  return {
    loading,
    sentToday: Math.max(0, sumStage("initiated")),
    engagedToday: Math.max(0, sumStage("engaged")),
    byPlatform,
    logOutbound,
  };
}
