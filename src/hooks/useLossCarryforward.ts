import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// Accumulated operating loss entering the selected month.
//
// The monthly summary is a standalone P&L; without this, a profit month right
// after a loss month would offer the full profit as an owner distribution even
// though the business first has to replenish the reserves the loss burned
// (the user's manual workaround — a fake "net loss from last month" expense
// row — double-counted the loss and corrupted the books).
//
// Model: walk every prior month that has transactions, in order. A month's
// net = collected income − expenses − that month's payroll cost (per-month
// settings, inheriting backward like useFinanceMonthSettings). Losses
// accumulate into `carry`; later profits absorb it before anything is
// distributable. Months with zero transactions are skipped — they predate
// bookkeeping, not real payroll losses.
export function useLossCarryforward(month: string) {
  const { user } = useAuth();
  const [carry, setCarry] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const monthStart = `${month}-01`;
      const [{ data: txns }, { data: settingsRows }] = await Promise.all([
        supabase
          .from("finance_transactions")
          .select("type, amount, is_ar, date")
          .eq("user_id", user.id)
          .lt("date", monthStart),
        supabase
          .from("finance_month_settings")
          .select("month, salary_payout")
          .eq("user_id", user.id)
          .lt("month", month)
          .order("month", { ascending: true }),
      ]);
      if (cancelled) return;

      const byMonth = new Map<string, { collected: number; expenses: number }>();
      for (const t of txns ?? []) {
        const m = String(t.date).slice(0, 7);
        const agg = byMonth.get(m) ?? { collected: 0, expenses: 0 };
        if (t.type === "income") {
          if (!t.is_ar) agg.collected += Number(t.amount) || 0;
        } else {
          agg.expenses += Number(t.amount) || 0;
        }
        byMonth.set(m, agg);
      }

      const settings = (settingsRows ?? []) as { month: string; salary_payout: number }[];
      const payrollFor = (m: string): number => {
        // Row for the month, else the most recent prior row (same inheritance
        // rule the settings hook uses), else 0.
        let best = 0;
        for (const s of settings) {
          if (s.month <= m) best = Number(s.salary_payout) || 0;
          else break;
        }
        return best;
      };

      let acc = 0;
      for (const m of [...byMonth.keys()].sort()) {
        const { collected, expenses } = byMonth.get(m)!;
        const net = collected - expenses - payrollFor(m);
        if (net < 0) acc += -net;
        else acc = Math.max(0, acc - net);
      }
      setCarry(Math.round(acc * 100) / 100);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user, month]);

  return { carryforwardLoss: carry, loading };
}
