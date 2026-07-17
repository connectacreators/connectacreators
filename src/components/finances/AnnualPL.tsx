import { useState } from "react";
import { ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAnnualFinance, type AnnualMonth } from "@/hooks/useAnnualFinance";

// Annual P&L — the CPA-facing view. Cash basis, month rows, classic
// statement ordering, in-year loss carryforward reflected in the estimated
// tax / distribution columns and the retained-earnings column. The monthly
// tab stays a simple operational snapshot; the technical treatment lives here.
export function AnnualPL() {
  const [year, setYear] = useState(new Date().getFullYear());
  const { annual, loading } = useAnnualFinance(year);

  const monthLabel = (m: string) =>
    new Date(Number(m.slice(0, 4)), Number(m.slice(5)) - 1, 1)
      .toLocaleDateString("en-US", { month: "short" });

  function exportCpaCsv() {
    if (!annual) return;
    const revCats = Object.keys(annual.totals.revenueByCategory).sort();
    const expCats = Object.keys(annual.totals.expensesByCategory).sort();
    const headers = [
      "Month",
      ...revCats.map((c) => `Revenue: ${c}`),
      "Total Revenue (collected)",
      "A/R Pending",
      ...expCats.map((c) => `Expense: ${c}`),
      "Total Operating Expenses",
      "Payroll Cost (gross, incl. taxes/withholding)",
      "Net Income",
      "Estimated Income Tax",
      "Estimated Owner Distribution",
      "Retained Earnings (YTD)",
    ];
    const row = (m: AnnualMonth) => [
      m.month,
      ...revCats.map((c) => (m.revenueByCategory[c] ?? 0).toFixed(2)),
      m.collected.toFixed(2),
      m.arPending.toFixed(2),
      ...expCats.map((c) => (m.expensesByCategory[c] ?? 0).toFixed(2)),
      m.totalExpenses.toFixed(2),
      m.payroll.toFixed(2),
      m.net.toFixed(2),
      m.estTax.toFixed(2),
      m.estDistribution.toFixed(2),
      m.retainedCumulative.toFixed(2),
    ];
    const t = annual.totals;
    const totalRow = [
      "TOTAL",
      ...revCats.map((c) => (t.revenueByCategory[c] ?? 0).toFixed(2)),
      t.collected.toFixed(2),
      t.arPending.toFixed(2),
      ...expCats.map((c) => (t.expensesByCategory[c] ?? 0).toFixed(2)),
      t.totalExpenses.toFixed(2),
      t.payroll.toFixed(2),
      t.net.toFixed(2),
      t.estTax.toFixed(2),
      t.estDistribution.toFixed(2),
      "",
    ];
    const notes = [
      [],
      [`Prepared from Connecta Finances — ${year} P&L, cash basis (collected income only; A/R listed separately).`],
      ["Payroll Cost is the configured gross monthly payroll including payroll taxes and withholding."],
      ["Income tax and owner distributions are ESTIMATES at the configured rate; in-year losses offset later profit before tax/distribution."],
      [`Food & Meals deductible portion (50% rule) recorded: ${t.foodDeductible.toFixed(2)}`],
      ["Verify against bank and payroll records before filing."],
    ];
    const activeMonths = annual.months.filter((m) => m.hasData);
    const csv = [headers, ...activeMonths.map(row), totalRow, ...notes]
      .map((r) => r.map((v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `annual-pl-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const fmt = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const fmt2 = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

  const cell = (n: number, opts?: { signed?: boolean; muted?: boolean }) => (
    <td
      className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${
        opts?.muted ? "text-muted-foreground"
        : opts?.signed && n < 0 ? "text-red-400"
        : opts?.signed && n > 0 ? "text-emerald-400"
        : "text-foreground/90"
      }`}
    >
      {fmt(n)}
    </td>
  );

  if (loading || !annual) {
    return (
      <div className="py-16 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const active = annual.months.filter((m) => m.hasData);
  const t = annual.totals;
  const revCats = Object.entries(t.revenueByCategory).sort((a, b) => b[1] - a[1]);
  const expCats = Object.entries(t.expensesByCategory).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-5">
      {/* Year nav + export */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-xl border border-border/60 bg-card/60 p-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setYear((y) => y - 1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="px-3 text-sm font-medium text-foreground">{year} — Annual P&L</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setYear((y) => y + 1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <Button variant="outline" size="sm" onClick={exportCpaCsv}>
          <Download className="w-4 h-4 mr-2" /> Export CPA CSV
        </Button>
      </div>

      {active.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">No transactions recorded in {year}.</p>
      ) : (
        <>
          {/* Monthly statement */}
          <div className="rounded-2xl border border-border bg-card/60 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/60 text-muted-foreground">
                    <th className="px-3 py-2.5 text-left font-medium">Month</th>
                    <th className="px-3 py-2.5 text-right font-medium">Revenue</th>
                    <th className="px-3 py-2.5 text-right font-medium">Op. Expenses</th>
                    <th className="px-3 py-2.5 text-right font-medium">Payroll</th>
                    <th className="px-3 py-2.5 text-right font-medium">Net Income</th>
                    <th className="px-3 py-2.5 text-right font-medium">Est. Tax</th>
                    <th className="px-3 py-2.5 text-right font-medium">Est. Distribution</th>
                    <th className="px-3 py-2.5 text-right font-medium">Retained (YTD)</th>
                  </tr>
                </thead>
                <tbody>
                  {active.map((m) => (
                    <tr key={m.month} className="border-b border-border/30 last:border-0">
                      <td className="px-3 py-2 text-foreground font-medium">{monthLabel(m.month)}</td>
                      {cell(m.collected)}
                      {cell(m.totalExpenses)}
                      {cell(m.payroll)}
                      {cell(m.net, { signed: true })}
                      {cell(m.estTax, { muted: m.estTax === 0 })}
                      {cell(m.estDistribution, { muted: m.estDistribution === 0 })}
                      {cell(m.retainedCumulative, { signed: true })}
                    </tr>
                  ))}
                  <tr className="border-t border-border/60 font-semibold">
                    <td className="px-3 py-2.5 text-foreground">TOTAL</td>
                    {cell(t.collected)}
                    {cell(t.totalExpenses)}
                    {cell(t.payroll)}
                    {cell(t.net, { signed: true })}
                    {cell(t.estTax)}
                    {cell(t.estDistribution)}
                    <td className="px-3 py-2.5" />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Category breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-border bg-card/60 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground/80 mb-3">Revenue by Category (YTD)</h3>
              <dl className="space-y-1.5 text-xs">
                {revCats.map(([c, v]) => (
                  <div key={c} className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">{c}</dt>
                    <dd className="text-emerald-400 tabular-nums">{fmt2(v)}</dd>
                  </div>
                ))}
                {t.arPending > 0 && (
                  <div className="flex justify-between gap-2 pt-1 border-t border-border/40">
                    <dt className="text-muted-foreground">A/R Pending (not in revenue)</dt>
                    <dd className="text-muted-foreground tabular-nums">{fmt2(t.arPending)}</dd>
                  </div>
                )}
              </dl>
            </div>
            <div className="rounded-2xl border border-border bg-card/60 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground/80 mb-3">Expenses by Category (YTD)</h3>
              <dl className="space-y-1.5 text-xs">
                {expCats.map(([c, v]) => (
                  <div key={c} className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">{c}</dt>
                    <dd className="text-red-400 tabular-nums">{fmt2(v)}</dd>
                  </div>
                ))}
                {t.foodDeductible > 0 && (
                  <div className="flex justify-between gap-2 pt-1 border-t border-border/40">
                    <dt className="text-muted-foreground">Food deductible portion (50% rule)</dt>
                    <dd className="text-muted-foreground tabular-nums">{fmt2(t.foodDeductible)}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
            Cash basis — revenue counts when collected; A/R is listed separately. Payroll is the configured
            gross monthly cost including payroll taxes and withholding. Tax and distributions are estimates at the
            configured rate; in-year losses offset later profit before anything is taxed or distributed
            (Retained YTD tracks the running position). Verify against bank and payroll records before filing.
          </p>
        </>
      )}
    </div>
  );
}
