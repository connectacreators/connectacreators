import { useMemo } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  BarChart, Bar,
} from "recharts";
import type { FinanceTransaction } from "@/hooks/useFinanceTransactions";

type Props = {
  income: FinanceTransaction[];
  expenses: FinanceTransaction[];
  month: string; // "YYYY-MM"
};

const INCOME_COLORS  = ["#22d3ee", "#0891b2", "#06b6d4", "#67e8f9", "#155e75"];
const EXPENSE_COLORS = ["#f97316", "#ef4444", "#eab308", "#a855f7", "#ec4899", "#84cc16", "#14b8a6", "#60a5fa"];

export function FinanceCharts({ income, expenses, month }: Props) {
  const expensesByCategory = useMemo(() => aggregate(expenses, (t) => t.category), [expenses]);
  const incomeByClient     = useMemo(() => aggregate(income, (t) => t.client ?? t.category), [income]);
  const dailyData          = useMemo(() => buildDailyData(income, expenses, month), [income, expenses, month]);
  const topVendors         = useMemo(() => topN(aggregate(expenses, (t) => t.vendor ?? "Unknown"), 6), [expenses]);

  if (income.length === 0 && expenses.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
        Nothing to chart this month.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Two donuts side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <ChartCard title="Expenses by category" subtitle="Where the money went">
          {expensesByCategory.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={expensesByCategory}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={60}
                  outerRadius={95}
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {expensesByCategory.map((_, i) => (
                    <Cell key={i} fill={EXPENSE_COLORS[i % EXPENSE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatUsd(v)} contentStyle={tooltipStyle} itemStyle={tooltipTextStyle} labelStyle={tooltipLabelStyle} />
                <Legend wrapperStyle={legendStyle} />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyMini label="No expenses" />}
        </ChartCard>

        <ChartCard title="Income by source" subtitle="Who paid you">
          {incomeByClient.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={incomeByClient}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={60}
                  outerRadius={95}
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {incomeByClient.map((_, i) => (
                    <Cell key={i} fill={INCOME_COLORS[i % INCOME_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatUsd(v)} contentStyle={tooltipStyle} itemStyle={tooltipTextStyle} labelStyle={tooltipLabelStyle} />
                <Legend wrapperStyle={legendStyle} />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyMini label="No income" />}
        </ChartCard>
      </div>

      {/* Cumulative line chart */}
      <ChartCard title="Cumulative cash flow" subtitle="Running totals across the month">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={dailyData} margin={{ top: 10, right: 14, bottom: 0, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff18" />
            <XAxis dataKey="day" tick={{ fill: "#94a3b8", fontSize: 11 }} stroke="#334155" />
            <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fill: "#94a3b8", fontSize: 11 }} stroke="#334155" />
            <Tooltip
              formatter={(v: number) => formatUsd(v)}
              labelFormatter={(label) => `Apr ${label}`}
              contentStyle={tooltipStyle}
              itemStyle={tooltipTextStyle}
              labelStyle={tooltipLabelStyle}
            />
            <Legend wrapperStyle={legendStyle} />
            <Line type="monotone" dataKey="income" name="Income (cum.)" stroke="#22d3ee" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="expenses" name="Expenses (cum.)" stroke="#ef4444" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="net" name="Net (cum.)" stroke="#a3e635" strokeWidth={2} strokeDasharray="4 3" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Top vendors bar */}
      <ChartCard title="Top vendors" subtitle="Highest-cost expense sources">
        {topVendors.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(160, topVendors.length * 32 + 20)}>
            <BarChart data={topVendors} layout="vertical" margin={{ top: 5, right: 50, left: 80, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" horizontal={false} />
              <XAxis type="number" tickFormatter={(v) => `$${v}`} tick={{ fill: "#94a3b8", fontSize: 11 }} stroke="#334155" />
              <YAxis type="category" dataKey="name" tick={{ fill: "#e2e8f0", fontSize: 11 }} stroke="#334155" width={80} />
              <Tooltip formatter={(v: number) => formatUsd(v)} contentStyle={tooltipStyle} itemStyle={tooltipTextStyle} labelStyle={tooltipLabelStyle} />
              <Bar dataKey="value" fill="#f97316" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : <EmptyMini label="No vendors" />}
      </ChartCard>
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

function aggregate(rows: FinanceTransaction[], keyFn: (t: FinanceTransaction) => string) {
  const m = new Map<string, number>();
  for (const t of rows) {
    const k = keyFn(t);
    m.set(k, (m.get(k) ?? 0) + t.amount);
  }
  return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

function topN(rows: { name: string; value: number }[], n: number) {
  if (rows.length <= n) return rows;
  const top = rows.slice(0, n);
  return top;
}

function buildDailyData(income: FinanceTransaction[], expenses: FinanceTransaction[], month: string) {
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const incomeByDay: Record<number, number> = {};
  const expenseByDay: Record<number, number> = {};
  for (const t of income) {
    const d = new Date(t.date + "T00:00:00").getDate();
    incomeByDay[d] = (incomeByDay[d] ?? 0) + t.amount;
  }
  for (const t of expenses) {
    const d = new Date(t.date + "T00:00:00").getDate();
    expenseByDay[d] = (expenseByDay[d] ?? 0) + t.amount;
  }
  let cIn = 0, cOut = 0;
  const data: { day: number; income: number; expenses: number; net: number }[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    cIn  += incomeByDay[d]  ?? 0;
    cOut += expenseByDay[d] ?? 0;
    data.push({ day: d, income: cIn, expenses: cOut, net: cIn - cOut });
  }
  return data;
}

function ChartCard({
  title, subtitle, children,
}: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card/40 p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function EmptyMini({ label }: { label: string }) {
  return (
    <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

const tooltipStyle: React.CSSProperties = {
  backgroundColor: "rgba(15,23,42,0.95)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  fontSize: 12,
};

const tooltipTextStyle: React.CSSProperties = {
  color: "#e2e8f0",
  fontSize: 12,
};

const tooltipLabelStyle: React.CSSProperties = {
  color: "#f8fafc",
  fontWeight: 600,
  marginBottom: 4,
};

const legendStyle: React.CSSProperties = {
  fontSize: 11,
  paddingTop: 8,
  color: "#e2e8f0",
};

function formatUsd(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}
