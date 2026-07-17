import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { FinanceCategory } from "@/hooks/useFinanceTransactions";

export interface AnnualMonth {
  month: string;               // "YYYY-MM"
  hasData: boolean;            // any transactions this month
  revenueByCategory: Record<string, number>;   // collected (cash basis)
  expensesByCategory: Record<string, number>;
  collected: number;
  arPending: number;
  totalExpenses: number;
  payroll: number;             // gross payroll cost from month settings
  net: number;                 // collected − expenses − payroll
  estTax: number;              // rate × taxable (after in-year loss offset)
  estDistribution: number;
  retainedCumulative: number;  // YTD retained earnings / (deficit)
}

export interface AnnualFinance {
  months: AnnualMonth[];
  totals: {
    collected: number; arPending: number; totalExpenses: number; payroll: number;
    net: number; estTax: number; estDistribution: number;
    revenueByCategory: Record<string, number>;
    expensesByCategory: Record<string, number>;
    foodDeductible: number;
  };
}

// Year-to-date P&L on a cash basis (collected income only; A/R shown
// separately). Estimated tax and distributions apply the in-year loss
// carryforward: a loss month's shortfall is replenished by later profit
// before anything is treated as taxable or distributable — mirroring how
// the S-corp's annual pass-through nets the months anyway. Months without
// transactions predate bookkeeping and are skipped (no fabricated payroll).
export function useAnnualFinance(year: number) {
  const { user } = useAuth();
  const [data, setData] = useState<AnnualFinance | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const start = `${year}-01-01`;
      const end = `${year + 1}-01-01`;
      const [{ data: txns }, { data: settingsRows }] = await Promise.all([
        supabase
          .from("finance_transactions")
          .select("type, amount, is_ar, date, category, deductible_amount")
          .eq("user_id", user.id)
          .gte("date", start)
          .lt("date", end),
        supabase
          .from("finance_month_settings")
          .select("month, salary_payout, tax_rate")
          .eq("user_id", user.id)
          .lte("month", `${year}-12`)
          .order("month", { ascending: true }),
      ]);
      if (cancelled) return;

      type Agg = {
        rev: Record<string, number>; exp: Record<string, number>;
        collected: number; ar: number; expenses: number; food: number; count: number;
      };
      const agg = new Map<string, Agg>();
      for (let m = 1; m <= 12; m++) {
        agg.set(`${year}-${String(m).padStart(2, "0")}`, {
          rev: {}, exp: {}, collected: 0, ar: 0, expenses: 0, food: 0, count: 0,
        });
      }
      for (const t of txns ?? []) {
        const key = String(t.date).slice(0, 7);
        const a = agg.get(key);
        if (!a) continue;
        a.count++;
        const amount = Number(t.amount) || 0;
        const cat = (t.category as FinanceCategory) || "Other";
        if (t.type === "income") {
          if (t.is_ar) a.ar += amount;
          else {
            a.collected += amount;
            a.rev[cat] = (a.rev[cat] ?? 0) + amount;
          }
        } else {
          a.expenses += amount;
          a.exp[cat] = (a.exp[cat] ?? 0) + amount;
          if (cat === "Food & Meals" && t.deductible_amount != null) {
            a.food += Number(t.deductible_amount) || 0;
          }
        }
      }

      const settings = (settingsRows ?? []) as { month: string; salary_payout: number; tax_rate: number }[];
      const settingsFor = (m: string) => {
        let best = { salary_payout: 0, tax_rate: 0.25 };
        for (const s of settings) {
          if (s.month <= m) best = { salary_payout: Number(s.salary_payout) || 0, tax_rate: Number(s.tax_rate) || 0.25 };
          else break;
        }
        return best;
      };

      const months: AnnualMonth[] = [];
      let carry = 0;      // unabsorbed in-year loss
      let retained = 0;   // YTD retained earnings / (deficit)
      const totals = {
        collected: 0, arPending: 0, totalExpenses: 0, payroll: 0,
        net: 0, estTax: 0, estDistribution: 0,
        revenueByCategory: {} as Record<string, number>,
        expensesByCategory: {} as Record<string, number>,
        foodDeductible: 0,
      };

      for (const [m, a] of [...agg.entries()].sort()) {
        const hasData = a.count > 0;
        const { salary_payout, tax_rate } = settingsFor(m);
        const payroll = hasData ? salary_payout : 0;
        const net = a.collected - a.expenses - payroll;
        let estTax = 0;
        let estDistribution = 0;
        if (hasData) {
          if (net < 0) {
            carry += -net;
          } else {
            const offset = Math.min(carry, net);
            carry -= offset;
            const taxable = net - offset;
            estTax = taxable * tax_rate;
            estDistribution = taxable - estTax;
          }
          retained += net - estTax - estDistribution;
        }
        months.push({
          month: m, hasData,
          revenueByCategory: a.rev, expensesByCategory: a.exp,
          collected: a.collected, arPending: a.ar, totalExpenses: a.expenses,
          payroll, net: hasData ? net : 0, estTax, estDistribution,
          retainedCumulative: retained,
        });
        if (hasData) {
          totals.collected += a.collected;
          totals.arPending += a.ar;
          totals.totalExpenses += a.expenses;
          totals.payroll += payroll;
          totals.net += net;
          totals.estTax += estTax;
          totals.estDistribution += estDistribution;
          totals.foodDeductible += a.food;
          for (const [c, v] of Object.entries(a.rev)) totals.revenueByCategory[c] = (totals.revenueByCategory[c] ?? 0) + v;
          for (const [c, v] of Object.entries(a.exp)) totals.expensesByCategory[c] = (totals.expensesByCategory[c] ?? 0) + v;
        }
      }

      setData({ months, totals });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user, year]);

  return { annual: data, loading };
}
