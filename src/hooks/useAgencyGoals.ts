// Agency-wide revenue goal + month-to-date actual. The goal comes from the
// new agency_goals setting (defaults to $50,000/mo if the admin hasn't
// configured one yet); the actual is computed from real finance_transactions
// (Collected Income — excludes is_ar/unpaid rows) rather than trusted from
// any manually-typed field.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const DEFAULT_REVENUE_GOAL = 50000;
const DEFAULT_OUTBOUND_TARGET = 50;

export interface AgencyGoals {
  loading: boolean;
  revenueGoal: number;
  revenueActual: number;
  outboundDailyTarget: number;
}

export function useAgencyGoals(): AgencyGoals {
  const [state, setState] = useState<AgencyGoals>({
    loading: true,
    revenueGoal: DEFAULT_REVENUE_GOAL,
    revenueActual: 0,
    outboundDailyTarget: DEFAULT_OUTBOUND_TARGET,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) {
        setState((s) => ({ ...s, loading: false }));
        return;
      }

      // Half-open [monthStart, nextMonthStart) against a plain `date`
      // column, matching useFinanceTransactions. The upper bound is not
      // optional: finance_generate_recurring materializes future-dated
      // income rows whenever /finances is browsed ahead, so an open-ended
      // range sums months that haven't happened yet.
      const now = new Date();
      const ymd = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const monthStart = ymd(new Date(now.getFullYear(), now.getMonth(), 1));
      const nextMonthStart = ymd(new Date(now.getFullYear(), now.getMonth() + 1, 1));

      // agency_goals is new (applied directly via the Management API, see
      // supabase/migrations/20260725_...) and isn't in the generated
      // Supabase types yet — same drift class as count_scripts_attributed
      // in useFleetStrategyHealth.ts. Cast the table access, not the result.
      const [{ data: goalsRow }, { data: transactions }] = await Promise.all([
        (supabase as any)
          .from("agency_goals")
          .select("revenue_goal_monthly, outbound_daily_target")
          .eq("user_id", userId)
          .maybeSingle() as Promise<{ data: { revenue_goal_monthly: number; outbound_daily_target: number } | null }>,
        supabase
          .from("finance_transactions")
          .select("amount, is_ar")
          .eq("user_id", userId)
          .eq("type", "income")
          .is("deleted_at", null)
          .gte("date", monthStart)
          .lt("date", nextMonthStart),
      ]);
      if (cancelled) return;

      const revenueActual = (transactions || [])
        .filter((t) => !t.is_ar)
        .reduce((sum, t) => sum + (t.amount || 0), 0);

      setState({
        loading: false,
        revenueGoal: goalsRow?.revenue_goal_monthly ?? DEFAULT_REVENUE_GOAL,
        revenueActual,
        outboundDailyTarget: goalsRow?.outbound_daily_target ?? DEFAULT_OUTBOUND_TARGET,
      });
    }

    load().catch((err) => {
      console.error("useAgencyGoals failed", err);
      if (!cancelled) setState((s) => ({ ...s, loading: false }));
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
