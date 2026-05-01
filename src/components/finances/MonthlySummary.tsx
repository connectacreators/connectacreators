import { useState } from "react";
import { Download, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FinanceTransaction } from "@/hooks/useFinanceTransactions";

type Props = {
  income: FinanceTransaction[];
  expenses: FinanceTransaction[];
  settings: { salary_payout: number; tax_rate: number; employee_salary: number };
  onSaveSettings: (patch: Partial<{ salary_payout: number; tax_rate: number; employee_salary: number }>) => void;
  onExportCsv: () => void;
};

export function MonthlySummary({ income, expenses, settings, onSaveSettings, onExportCsv }: Props) {
  const [editingSettings, setEditingSettings] = useState(false);
  const [salaryPayout, setSalaryPayout] = useState(String(settings.salary_payout));
  const [taxRate, setTaxRate] = useState(String((settings.tax_rate * 100).toFixed(2)));
  const [employeeSalary, setEmployeeSalary] = useState(String(settings.employee_salary));

  const totalIncome = sum(income, (t) => t.amount);
  const arPending = sum(income.filter((t) => t.is_ar), (t) => t.amount);
  const collected = totalIncome - arPending;
  const totalExpenses = sum(expenses, (t) => t.amount);
  const gross = collected - totalExpenses;
  const netProfit = gross - settings.salary_payout;
  const tax = netProfit * settings.tax_rate;
  const ownerDist = netProfit - tax;
  const takeHome = settings.employee_salary + ownerDist;
  const foodDeductible = sum(
    expenses.filter((t) => t.category === "Food & Meals" && t.deductible_amount != null),
    (t) => t.deductible_amount ?? 0,
  );

  function handleSaveSettings() {
    onSaveSettings({
      salary_payout: Number(salaryPayout) || 0,
      tax_rate: Math.max(0, Math.min(1, Number(taxRate) / 100)) || 0,
      employee_salary: Number(employeeSalary) || 0,
    });
    setEditingSettings(false);
  }

  return (
    <div className="rounded-2xl border border-border bg-card/60 p-5 space-y-4 sticky top-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground/80">Summary</h2>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingSettings(!editingSettings)}>
          <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
        </Button>
      </div>

      <dl className="space-y-1.5 text-sm">
        <Row label="Total Income" value={totalIncome} positive />
        <Row label="A/R Pending" value={arPending} muted />
        <Row label="Collected Income" value={collected} emphasized />
        <Row label="Total Expenses" value={totalExpenses} negative />
        <Divider />
        <Row label="Gross Income" value={gross} emphasized positive={gross >= 0} negative={gross < 0} />
        {editingSettings ? (
          <SettingRow label="Salary Payout">
            <Input type="number" step="0.01" className="h-7 text-xs" value={salaryPayout} onChange={(e) => setSalaryPayout(e.target.value)} />
          </SettingRow>
        ) : (
          <Row label="Salary Payout" value={settings.salary_payout} negative />
        )}
        <Row label="Net Profit" value={netProfit} emphasized />
        {editingSettings ? (
          <SettingRow label="Tax Rate %">
            <Input type="number" step="0.5" className="h-7 text-xs" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
          </SettingRow>
        ) : (
          <Row label={`Tax ${(settings.tax_rate * 100).toFixed(1)}%`} value={tax} negative />
        )}
        <Divider />
        <Row label="Owner's Dist." value={ownerDist} positive={ownerDist >= 0} />
        {editingSettings ? (
          <SettingRow label="Employee Salary">
            <Input type="number" step="0.01" className="h-7 text-xs" value={employeeSalary} onChange={(e) => setEmployeeSalary(e.target.value)} />
          </SettingRow>
        ) : settings.employee_salary > 0 ? (
          <Row label="Employee Salary" value={settings.employee_salary} positive />
        ) : null}
        <Row label="Take-Home Pay" value={takeHome} emphasized positive={takeHome >= 0} />
      </dl>

      {foodDeductible > 0 && (
        <p className="text-[11px] text-muted-foreground italic">
          Food deductible (50% rule): {formatUsd(foodDeductible)}
        </p>
      )}

      {editingSettings && (
        <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
          <Button variant="ghost" size="sm" onClick={() => setEditingSettings(false)}>Cancel</Button>
          <Button variant="cta" size="sm" onClick={handleSaveSettings}>Save</Button>
        </div>
      )}

      <Button variant="outline" size="sm" className="w-full" onClick={onExportCsv}>
        <Download className="w-4 h-4 mr-2" /> Export CSV
      </Button>
    </div>
  );
}

function Row({
  label, value,
  emphasized, positive, negative, muted,
}: {
  label: string;
  value: number;
  emphasized?: boolean;
  positive?: boolean;
  negative?: boolean;
  muted?: boolean;
}) {
  const valueColor = positive ? "text-emerald-400"
    : negative ? "text-red-400"
    : muted ? "text-muted-foreground"
    : "text-foreground";
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className={`${emphasized ? "text-foreground font-semibold" : "text-muted-foreground"} text-xs`}>{label}</dt>
      <dd className={`${valueColor} ${emphasized ? "font-semibold text-sm" : "text-xs"} tabular-nums`}>{formatUsd(value)}</dd>
    </div>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="w-24">{children}</dd>
    </div>
  );
}

function Divider() { return <div className="h-px bg-border/40 my-1" />; }

function sum<T>(arr: T[], fn: (x: T) => number): number {
  return arr.reduce((a, t) => a + fn(t), 0);
}

function formatUsd(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}
