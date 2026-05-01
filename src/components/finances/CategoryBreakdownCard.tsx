import { useMemo } from "react";
import type { FinanceTransaction, FinanceCategory } from "@/hooks/useFinanceTransactions";
import { categoryColor } from "./categoryColors";

interface Props {
  kind: "income" | "expense";
  rows: FinanceTransaction[];
  activeCategory: FinanceCategory | null;
  onCategoryToggle: (cat: FinanceCategory) => void;
}

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function CategoryBreakdownCard({ kind, rows, activeCategory, onCategoryToggle }: Props) {
  const { breakdown, total } = useMemo(() => {
    const sums = new Map<FinanceCategory, { amount: number; count: number }>();
    for (const r of rows) {
      const prev = sums.get(r.category) ?? { amount: 0, count: 0 };
      sums.set(r.category, { amount: prev.amount + r.amount, count: prev.count + 1 });
    }
    const tot = Array.from(sums.values()).reduce((s, v) => s + v.amount, 0);
    const entries = Array.from(sums.entries())
      .filter(([, v]) => v.amount > 0)
      .sort((a, b) => b[1].amount - a[1].amount)
      .map(([cat, v]) => ({
        cat,
        amount: v.amount,
        count: v.count,
        pct: tot > 0 ? Math.round((v.amount / tot) * 100) : 0,
      }));
    return { breakdown: entries, total: tot };
  }, [rows]);

  if (breakdown.length === 0) return null;

  const title = kind === "income" ? "Income by Category" : "Expenses by Category";

  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="flex items-center justify-between pb-2 border-b border-border/30">
        <h3 className="text-[9px] font-bold uppercase tracking-[1.2px] text-muted-foreground m-0">
          {title}
        </h3>
        <span className="text-xs font-semibold tabular-nums text-foreground">
          {USD.format(total)}
        </span>
      </div>
      <div>
        {breakdown.map(({ cat, amount, pct }, idx) => {
          const isActive = activeCategory === cat;
          const color = categoryColor(cat);
          return (
            <button
              key={cat}
              type="button"
              onClick={() => onCategoryToggle(cat)}
              aria-pressed={isActive}
              aria-label={`Filter to ${cat} (${USD.format(amount)}, ${pct}%)`}
              className={`w-full text-left py-1.5 px-1.5 transition-colors ${
                isActive
                  ? "bg-cyan-500/10 outline outline-1 outline-cyan-500/40 outline-offset-[-1px] rounded-md"
                  : "hover:bg-muted/40 rounded-md"
              } ${idx < breakdown.length - 1 ? "border-b border-border/20" : ""}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-foreground truncate" title={cat}>{cat}</span>
                <span className="flex-shrink-0">
                  <span className="text-[11px] font-semibold tabular-nums text-foreground">
                    {USD.format(amount)}
                  </span>
                  <span className="text-[10px] text-muted-foreground ml-1.5 tabular-nums">{pct}%</span>
                </span>
              </div>
              <div
                role="presentation"
                className="h-[3px] bg-muted/40 rounded-full mt-1 overflow-hidden"
              >
                <div style={{ background: color.text, width: `${Math.max(pct, 1)}%`, height: "100%", borderRadius: 999 }} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
